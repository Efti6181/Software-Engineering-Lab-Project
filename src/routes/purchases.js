const express = require('express');
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { checkLowStock } = require('../utils/notifications');

const router = express.Router();

function generateNumber(prefix) {
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${Date.now().toString().slice(-6)}`;
}

// List purchases
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, supplier_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (p.purchase_number ILIKE $${params.length} OR s.name ILIKE $${params.length})`; }
    if (status) { params.push(status); where += ` AND p.status = $${params.length}`; }
    if (supplier_id) { params.push(supplier_id); where += ` AND p.supplier_id = $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM purchases p JOIN suppliers s ON p.supplier_id = s.id ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT p.*, s.name as supplier_name, s.company_name
      FROM purchases p JOIN suppliers s ON p.supplier_id = s.id
      ${where} ORDER BY p.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const purchaseRes = await query(`
      SELECT p.*, s.name as supplier_name, s.company_name, s.phone, s.email, s.address, u.name as created_by_name
      FROM purchases p JOIN suppliers s ON p.supplier_id = s.id
      LEFT JOIN users u ON p.created_by = u.id WHERE p.id = $1`, [req.params.id]);
    if (purchaseRes.rows.length === 0) return res.status(404).json({ error: 'Purchase not found' });
    const itemsRes = await query(`
      SELECT pi.*, pr.name as product_name, pr.sku, pr.unit
      FROM purchase_items pi JOIN products pr ON pi.product_id = pr.id WHERE pi.purchase_id = $1`, [req.params.id]);
    res.json({ ...purchaseRes.rows[0], items: itemsRes.rows });
  } catch (err) { next(err); }
});

// Create purchase (draft or ordered)
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { supplier_id, purchase_date, items, discount_amount = 0, tax_amount = 0, additional_cost = 0, notes, status = 'draft', paid_amount = 0 } = req.body;
    if (!supplier_id) return res.status(400).json({ error: 'Supplier is required' });
    if (!items || !Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'At least one item is required' });

    let subtotal = 0;
    for (const item of items) {
      const lineTotal = (parseFloat(item.quantity) * parseFloat(item.unit_cost)) - parseFloat(item.item_discount || 0);
      subtotal += lineTotal;
    }
    const grandTotal = subtotal - parseFloat(discount_amount) + parseFloat(tax_amount) + parseFloat(additional_cost);
    const paid = parseFloat(paid_amount) || 0;
    const due = grandTotal - paid;
    const paymentStatus = due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    const purchaseNumber = generateNumber('PUR');

    const result = await withTransaction(async (client) => {
      const purRes = await client.query(
        `INSERT INTO purchases (purchase_number, supplier_id, purchase_date, subtotal, discount_amount, tax_amount, additional_cost, grand_total, paid_amount, due_amount, status, payment_status, notes, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [purchaseNumber, supplier_id, purchase_date || null, subtotal, discount_amount, tax_amount, additional_cost, grandTotal, paid, due, status, paymentStatus, notes || null, req.user.id]
      );
      const purchase = purRes.rows[0];
      for (const item of items) {
        const lineTotal = (parseFloat(item.quantity) * parseFloat(item.unit_cost)) - parseFloat(item.item_discount || 0);
        await client.query(
          `INSERT INTO purchase_items (purchase_id, product_id, quantity, unit_cost, item_discount, line_total) VALUES ($1, $2, $3, $4, $5, $6)`,
          [purchase.id, item.product_id, parseFloat(item.quantity), parseFloat(item.unit_cost), parseFloat(item.item_discount || 0), lineTotal]
        );
      }
      if (paid > 0) {
        await client.query(
          `INSERT INTO payments (payment_number, party_type, party_id, ref_type, ref_id, amount, payment_method, user_id)
           VALUES ($1, 'supplier', $2, 'purchase', $3, $4, $5, $6)`,
          [generateNumber('PAY'), supplier_id, purchase.id, paid, req.body.payment_method || 'cash', req.user.id]
        );
      }
      return purchase;
    });

    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'create', module: 'purchases', entity_id: result.id, description: `Created purchase ${result.purchase_number}`, ip_address: req.ip });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// Receive purchase — increases stock
router.post('/:id/receive', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const purchaseId = req.params.id;
    const result = await withTransaction(async (client) => {
      const purRes = await client.query(`SELECT * FROM purchases WHERE id = $1 FOR UPDATE`, [purchaseId]);
      if (purRes.rows.length === 0) throw new Error('Purchase not found');
      const purchase = purRes.rows[0];
      if (purchase.status === 'received') throw new Error('Purchase already received');
      if (purchase.status === 'cancelled') throw new Error('Cannot receive a cancelled purchase');

      const itemsRes = await client.query(`SELECT pi.*, p.name as product_name FROM purchase_items pi JOIN products p ON pi.product_id = p.id WHERE pi.purchase_id = $1`, [purchaseId]);
      for (const item of itemsRes.rows) {
        const prodRes = await client.query(`SELECT current_stock FROM products WHERE id = $1 FOR UPDATE`, [item.product_id]);
        const prevStock = parseFloat(prodRes.rows[0].current_stock);
        const newStock = prevStock + parseFloat(item.quantity);
        await client.query(`UPDATE products SET current_stock = $1 WHERE id = $2`, [newStock, item.product_id]);
        await client.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, ref_type, ref_id, notes, user_id)
           VALUES ($1, 'purchase', $2, $3, $4, 'purchase', $5, $6, $7)`,
          [item.product_id, parseFloat(item.quantity), prevStock, newStock, purchaseId, `Purchase ${purchase.purchase_number}`, req.user.id]
        );
        // Update product purchase price (weighted average)
        await client.query(
          `UPDATE products SET purchase_price = CASE WHEN current_stock > 0 THEN ((current_stock - $1) * purchase_price + $1 * $2) / current_stock ELSE $2 END WHERE id = $3`,
          [parseFloat(item.quantity), parseFloat(item.unit_cost), item.product_id]
        );
      }
      await client.query(`UPDATE purchases SET status = 'received' WHERE id = $1`, [purchaseId]);
      return purchase;
    });

    // Check low stock after receiving
    const itemsRes = await query(`SELECT product_id FROM purchase_items WHERE purchase_id = $1`, [purchaseId]);
    for (const item of itemsRes.rows) { await checkLowStock(item.product_id); }

    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'receive', module: 'purchases', entity_id: purchaseId, description: `Received purchase ${result.purchase_number}, stock updated`, ip_address: req.ip });
    res.json({ message: 'Purchase received and stock updated' });
  } catch (err) { next(err); }
});

// Cancel purchase
router.post('/:id/cancel', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await query(`UPDATE purchases SET status = 'cancelled' WHERE id = $1 AND status IN ('draft', 'ordered') RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(400).json({ error: 'Cannot cancel: purchase may already be received or cancelled' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'cancel', module: 'purchases', entity_id: req.params.id, description: `Cancelled purchase ${result.rows[0].purchase_number}`, ip_address: req.ip });
    res.json({ message: 'Purchase cancelled' });
  } catch (err) { next(err); }
});

module.exports = router;
