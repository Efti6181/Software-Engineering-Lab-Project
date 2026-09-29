const express = require('express');
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { checkLowStock } = require('../utils/notifications');

const router = express.Router();

function generateNumber(prefix) {
  return `${prefix}-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

// ===== SALE RETURNS =====

router.get('/sales', authenticate, async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (sr.return_number ILIKE $${params.length} OR c.name ILIKE $${params.length})`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM sale_returns sr JOIN customers c ON sr.customer_id = c.id ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT sr.*, c.name as customer_name, s.invoice_number
      FROM sale_returns sr JOIN customers c ON sr.customer_id = c.id
      JOIN sales s ON sr.sale_id = s.id
      ${where} ORDER BY sr.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

router.get('/sales/:id', authenticate, async (req, res, next) => {
  try {
    const srRes = await query(`
      SELECT sr.*, c.name as customer_name, s.invoice_number
      FROM sale_returns sr JOIN customers c ON sr.customer_id = c.id
      JOIN sales s ON sr.sale_id = s.id WHERE sr.id = $1`, [req.params.id]);
    if (srRes.rows.length === 0) return res.status(404).json({ error: 'Sale return not found' });
    const itemsRes = await query(`
      SELECT sri.*, p.name as product_name, p.sku
      FROM sale_return_items sri JOIN products p ON sri.product_id = p.id
      WHERE sri.sale_return_id = $1`, [req.params.id]);
    res.json({ ...srRes.rows[0], items: itemsRes.rows });
  } catch (err) { next(err); }
});

// Create sale return
router.post('/sales', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { sale_id, items, reason, restock = true } = req.body;
    if (!sale_id) return res.status(400).json({ error: 'Sale ID is required' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one return item is required' });

    const result = await withTransaction(async (client) => {
      const saleRes = await client.query(`SELECT * FROM sales WHERE id = $1 FOR UPDATE`, [sale_id]);
      if (saleRes.rows.length === 0) throw new Error('Sale not found');
      const sale = saleRes.rows[0];

      // Validate return quantities
      for (const item of items) {
        const siRes = await client.query(`SELECT quantity FROM sale_items WHERE id = $1`, [item.sale_item_id]);
        if (siRes.rows.length === 0) throw new Error('Sale item not found');
        const soldQty = parseFloat(siRes.rows[0].quantity);
        const prevReturnsRes = await client.query(
          `SELECT COALESCE(SUM(quantity),0) as total FROM sale_return_items WHERE sale_item_id = $1`, [item.sale_item_id]
        );
        const prevReturned = parseFloat(prevReturnsRes.rows[0].total);
        if (parseFloat(item.quantity) + prevReturned > soldQty) {
          throw new Error(`Return quantity exceeds sold quantity (sold: ${soldQty}, already returned: ${prevReturned})`);
        }
      }

      let totalRefund = 0;
      const returnNumber = generateNumber('SR');
      const srRes = await client.query(
        `INSERT INTO sale_returns (return_number, sale_id, customer_id, total_refund, reason, restock, processed_by)
         VALUES ($1, $2, $3, 0, $4, $5, $6) RETURNING *`,
        [returnNumber, sale_id, sale.customer_id, 0, reason || null, restock, req.user.id]
      );
      const sr = srRes.rows[0];

      for (const item of items) {
        const refund = parseFloat(item.refund_amount) || 0;
        totalRefund += refund;
        await client.query(
          `INSERT INTO sale_return_items (sale_return_id, sale_item_id, product_id, quantity, refund_amount, reason)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [sr.id, item.sale_item_id, item.product_id, parseFloat(item.quantity), refund, item.reason || null]
        );
        if (restock) {
          const prodRes = await client.query(`SELECT current_stock FROM products WHERE id = $1 FOR UPDATE`, [item.product_id]);
          const prevStock = parseFloat(prodRes.rows[0].current_stock);
          const newStock = prevStock + parseFloat(item.quantity);
          await client.query(`UPDATE products SET current_stock = $1 WHERE id = $2`, [newStock, item.product_id]);
          await client.query(
            `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, ref_type, ref_id, notes, user_id)
             VALUES ($1, 'sale_return', $2, $3, $4, 'sale_return', $5, $6, $7)`,
            [item.product_id, parseFloat(item.quantity), prevStock, newStock, sr.id, `Sale return ${returnNumber}`, req.user.id]
          );
        }
      }
      await client.query(`UPDATE sale_returns SET total_refund = $1 WHERE id = $2`, [totalRefund, sr.id]);
      await client.query(`UPDATE sales SET status = 'returned' WHERE id = $1`, [sale_id]);
      return { ...sr, total_refund: totalRefund, return_number: returnNumber };
    });

    for (const item of items) { await checkLowStock(item.product_id); }
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'sale_return', module: 'returns', entity_id: result.id, description: `Processed sale return ${result.return_number}`, ip_address: req.ip });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// ===== PURCHASE RETURNS =====

router.get('/purchases', authenticate, async (req, res, next) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (pr.return_number ILIKE $${params.length} OR s.name ILIKE $${params.length})`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM purchase_returns pr JOIN suppliers s ON pr.supplier_id = s.id ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT pr.*, s.name as supplier_name, p.purchase_number
      FROM purchase_returns pr JOIN suppliers s ON pr.supplier_id = s.id
      JOIN purchases p ON pr.purchase_id = p.id
      ${where} ORDER BY pr.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

router.post('/purchases', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { purchase_id, items, reason } = req.body;
    if (!purchase_id) return res.status(400).json({ error: 'Purchase ID is required' });
    if (!items || items.length === 0) return res.status(400).json({ error: 'At least one return item is required' });

    const result = await withTransaction(async (client) => {
      const purRes = await client.query(`SELECT * FROM purchases WHERE id = $1 FOR UPDATE`, [purchase_id]);
      if (purRes.rows.length === 0) throw new Error('Purchase not found');
      const purchase = purRes.rows[0];

      for (const item of items) {
        const piRes = await client.query(`SELECT quantity FROM purchase_items WHERE id = $1`, [item.purchase_item_id]);
        if (piRes.rows.length === 0) throw new Error('Purchase item not found');
        const purchasedQty = parseFloat(piRes.rows[0].quantity);
        const prevReturnsRes = await client.query(
          `SELECT COALESCE(SUM(quantity),0) as total FROM purchase_return_items WHERE purchase_item_id = $1`, [item.purchase_item_id]
        );
        const prevReturned = parseFloat(prevReturnsRes.rows[0].total);
        if (parseFloat(item.quantity) + prevReturned > purchasedQty) {
          throw new Error(`Return quantity exceeds purchased quantity`);
        }
      }

      let totalAmount = 0;
      const returnNumber = generateNumber('PR');
      const prRes = await client.query(
        `INSERT INTO purchase_returns (return_number, purchase_id, supplier_id, total_amount, reason, processed_by)
         VALUES ($1, $2, $3, 0, $4, $5) RETURNING *`,
        [returnNumber, purchase_id, purchase.supplier_id, 0, reason || null, req.user.id]
      );
      const pr = prRes.rows[0];

      for (const item of items) {
        const amt = parseFloat(item.refund_amount) || 0;
        totalAmount += amt;
        await client.query(
          `INSERT INTO purchase_return_items (purchase_return_id, purchase_item_id, product_id, quantity, refund_amount, reason)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [pr.id, item.purchase_item_id, item.product_id, parseFloat(item.quantity), amt, item.reason || null]
        );
        const prodRes = await client.query(`SELECT current_stock FROM products WHERE id = $1 FOR UPDATE`, [item.product_id]);
        const prevStock = parseFloat(prodRes.rows[0].current_stock);
        const newStock = prevStock - parseFloat(item.quantity);
        if (newStock < 0) throw new Error('Insufficient stock for purchase return');
        await client.query(`UPDATE products SET current_stock = $1 WHERE id = $2`, [newStock, item.product_id]);
        await client.query(
          `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, ref_type, ref_id, notes, user_id)
           VALUES ($1, 'purchase_return', $2, $3, $4, 'purchase_return', $5, $6, $7)`,
          [item.product_id, -parseFloat(item.quantity), prevStock, newStock, pr.id, `Purchase return ${returnNumber}`, req.user.id]
        );
      }
      await client.query(`UPDATE purchase_returns SET total_amount = $1 WHERE id = $2`, [totalAmount, pr.id]);
      return { ...pr, total_amount: totalAmount, return_number: returnNumber };
    });

    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'purchase_return', module: 'returns', entity_id: result.id, description: `Processed purchase return ${result.return_number}`, ip_address: req.ip });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
