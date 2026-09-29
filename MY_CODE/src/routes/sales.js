const express = require('express');
const { query, withTransaction } = require('../config/db');
const { authenticate } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { checkLowStock } = require('../utils/notifications');

const router = express.Router();

function generateNumber(prefix) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${Date.now().toString().slice(-6)}`;
}

// List sales
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, customer_id, cashier_id, payment_status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (s.invoice_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`; }
    if (status) { params.push(status); where += ` AND s.status = $${params.length}`; }
    if (payment_status) { params.push(payment_status); where += ` AND s.payment_status = $${params.length}`; }
    if (customer_id) { params.push(customer_id); where += ` AND s.customer_id = $${params.length}`; }
    if (cashier_id) { params.push(cashier_id); where += ` AND s.cashier_id = $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM sales s JOIN customers c ON s.customer_id = c.id ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT s.*, c.name as customer_name, u.name as cashier_name
      FROM sales s JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id
      ${where} ORDER BY s.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const saleRes = await query(`
      SELECT s.*, c.name as customer_name, c.phone as customer_phone, c.email as customer_email, c.address as customer_address, u.name as cashier_name
      FROM sales s JOIN customers c ON s.customer_id = c.id
      LEFT JOIN users u ON s.cashier_id = u.id WHERE s.id = $1`, [req.params.id]);
    if (saleRes.rows.length === 0) return res.status(404).json({ error: 'Sale not found' });
    const itemsRes = await query(`
      SELECT si.*, p.name as product_name, p.sku, p.unit
      FROM sale_items si JOIN products p ON si.product_id = p.id WHERE si.sale_id = $1`, [req.params.id]);
    res.json({ ...saleRes.rows[0], items: itemsRes.rows });
  } catch (err) { next(err); }
});

// Create sale (POS checkout)
router.post('/', authenticate, async (req, res, next) => {
  try {
    const { customer_id, items, discount_amount = 0, tax_amount = 0, delivery_charge = 0, paid_amount = 0, payment_method, notes } = req.body;
    if (!customer_id) return res.status(400).json({ error: 'Customer is required' });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Cart is empty' });

    let subtotal = 0;
    for (const item of items) {
      const lineTotal = (parseFloat(item.quantity) * parseFloat(item.unit_price)) - parseFloat(item.item_discount || 0);
      subtotal += lineTotal;
    }
    const grandTotal = subtotal - parseFloat(discount_amount) + parseFloat(tax_amount) + parseFloat(delivery_charge);
    const paid = parseFloat(paid_amount) || 0;
    const due = grandTotal - paid;
    const paymentStatus = due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const invoiceNumber = generateNumber('INV');

    const result = await withTransaction(async (client) => {
      // Validate stock for all items
      for (const item of items) {
        const prodRes = await client.query(`SELECT id, name, current_stock, purchase_price FROM products WHERE id = $1 FOR UPDATE`, [item.product_id]);
        if (prodRes.rows.length === 0) throw new Error(`Product not found: ${item.product_id}`);
        const product = prodRes.rows[0];
        const qty = parseFloat(item.quantity);
        if (product.current_stock < qty) {
          throw new Error(`Insufficient stock for ${product.name}. Available: ${product.current_stock}, requested: ${qty}`);
        }
      }

      const saleRes = await client.query(
        `INSERT INTO sales (invoice_number, customer_id, subtotal, discount_amount, tax_amount, delivery_charge, grand_total, paid_amount, due_amount, status, payment_status, payment_method, cashier_id, notes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'completed', $10, $11, $12, $13) RETURNING *`,
        [invoiceNumber, customer_id, subtotal, discount_amount, tax_amount, delivery_charge, grandTotal, paid, due, paymentStatus, payment_method || null, req.user.id, notes || null]
      );
      const sale = saleRes.rows[0];

      for (const item of items) {
        const lineTotal = (parseFloat(item.quantity) * parseFloat(item.unit_price)) - parseFloat(item.item_discount || 0);
        const prodRes = await client.query(`SELECT current_stock, purchase_price FROM products WHERE id = $1 FOR UPDATE`, [item.product_id]);
        const prevStock = parseFloat(prodRes.rows[0].current_stock);
        const newStock = prevStock - parseFloat(item.quantity);
        const unitCost = parseFloat(prodRes.rows[0].purchase_price);
        await client.query(`UPDATE products SET current_stock = $1 WHERE id = $2`, [newStock, item.product_id]);
        await client.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, ref_type, ref_id, notes, user_id)
           VALUES ($1, 'sale', $2, $3, $4, 'sale', $5, $6, $7)`,
          [item.product_id, -parseFloat(item.quantity), prevStock, newStock, sale.id, `Sale ${invoiceNumber}`, req.user.id]
        );
        await client.query(
          `INSERT INTO sale_items (sale_id, product_id, quantity, unit_price, unit_cost, item_discount, line_total)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [sale.id, item.product_id, parseFloat(item.quantity), parseFloat(item.unit_price), unitCost, parseFloat(item.item_discount || 0), lineTotal]
        );
      }

      if (paid > 0) {
        await client.query(
          `INSERT INTO payments (payment_number, party_type, party_id, ref_type, ref_id, amount, payment_method, user_id)
           VALUES ($1, 'customer', $2, 'sale', $3, $4, $5, $6)`,
          [generateNumber('PAY'), customer_id, sale.id, paid, payment_method || 'cash', req.user.id]
        );
      }

      await client.query(
        `INSERT INTO audit_logs (user_id, user_name, action, module, entity_id, description, ip_address)
         VALUES ($1, $2, 'sale_completed', 'sales', $3, $4, $5)`,
        [req.user.id, req.user.name, sale.id, `Completed sale ${invoiceNumber} for BDT ${grandTotal.toFixed(2)}`, req.ip]
      );

      return sale;
    });

    // Check low stock after sale
    for (const item of items) {
      try { await checkLowStock(item.product_id); }
      catch (err) { console.error('Sale saved, but stock notification failed:', err); }
    }

    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Void sale
router.post('/:id/void', authenticate, async (req, res, next) => {
  try {
    const saleId = req.params.id;
    const result = await withTransaction(async (client) => {
      const saleRes = await client.query(`SELECT * FROM sales WHERE id = $1 FOR UPDATE`, [saleId]);
      if (saleRes.rows.length === 0) throw new Error('Sale not found');
      const sale = saleRes.rows[0];
      if (sale.status === 'voided') throw new Error('Sale already voided');
      if (sale.status === 'returned') throw new Error('Cannot void a returned sale');

      const itemsRes = await client.query(`SELECT * FROM sale_items WHERE sale_id = $1`, [saleId]);
      for (const item of itemsRes.rows) {
        const prodRes = await client.query(`SELECT current_stock FROM products WHERE id = $1 FOR UPDATE`, [item.product_id]);
        const prevStock = parseFloat(prodRes.rows[0].current_stock);
        const newStock = prevStock + parseFloat(item.quantity);
        await client.query(`UPDATE products SET current_stock = $1 WHERE id = $2`, [newStock, item.product_id]);
        await client.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, ref_type, ref_id, notes, user_id)
           VALUES ($1, 'adjustment_in', $2, $3, $4, 'sale', $5, $6, $7)`,
          [item.product_id, parseFloat(item.quantity), prevStock, newStock, saleId, `Void sale ${sale.invoice_number}`, req.user.id]
        );
      }
      await client.query(`UPDATE sales SET status = 'voided' WHERE id = $1`, [saleId]);
      return sale;
    });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'void_sale', module: 'sales', entity_id: saleId, description: `Voided sale ${result.invoice_number}`, ip_address: req.ip });
    res.json({ message: 'Sale voided, stock restored' });
  } catch (err) { next(err); }
});

module.exports = router;
