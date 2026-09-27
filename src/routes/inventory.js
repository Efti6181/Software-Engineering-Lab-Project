const express = require('express');
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');
const { createNotification, checkLowStock } = require('../utils/notifications');

const router = express.Router();

// Product inventory list with stock status
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE p.archived = FALSE`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length})`; }
    if (status === 'low_stock') where += ` AND p.current_stock > 0 AND p.current_stock <= p.min_stock_level`;
    if (status === 'out_of_stock') where += ` AND p.current_stock <= 0`;
    if (status === 'in_stock') where += ` AND p.current_stock > p.min_stock_level`;

    const countResult = await query(`SELECT COUNT(*) as total FROM products p ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT p.id, p.name, p.sku, p.barcode, p.current_stock, p.min_stock_level, p.unit, p.purchase_price, p.selling_price,
        (p.current_stock * p.purchase_price) as stock_value,
        c.name as category_name
      FROM products p LEFT JOIN categories c ON p.category_id = c.id
      ${where} ORDER BY p.name LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

// Stock movements history
router.get('/movements', authenticate, async (req, res, next) => {
  try {
    const { product_id, movement_type, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (product_id) { params.push(product_id); where += ` AND sm.product_id = $${params.length}`; }
    if (movement_type) { params.push(movement_type); where += ` AND sm.movement_type = $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM stock_movements sm ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT sm.*, p.name as product_name, p.sku as product_sku, u.name as user_name
      FROM stock_movements sm
      LEFT JOIN products p ON sm.product_id = p.id
      LEFT JOIN users u ON sm.user_id = u.id
      ${where} ORDER BY sm.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

// Inventory adjustment
router.post('/adjust', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { product_id, reason, quantity_change, notes } = req.body;
    if (!product_id || !reason || quantity_change === undefined) {
      return res.status(400).json({ error: 'Product, reason, and quantity change are required' });
    }
    const change = parseFloat(quantity_change);
    if (isNaN(change) || change === 0) return res.status(400).json({ error: 'Quantity change must be a non-zero number' });

    const result = await withTransaction(async (client) => {
      const prodRes = await client.query(`SELECT id, name, current_stock, unit FROM products WHERE id = $1 FOR UPDATE`, [product_id]);
      if (prodRes.rows.length === 0) throw new Error('Product not found');
      const product = prodRes.rows[0];
      const previousStock = parseFloat(product.current_stock);
      const newStock = previousStock + change;
      if (newStock < 0) throw new Error('Adjustment would result in negative stock');

      await client.query(`UPDATE products SET current_stock = $1 WHERE id = $2`, [newStock, product_id]);
      const movementType = change > 0 ? 'adjustment_in' : 'adjustment_out';
      await client.query(
        `INSERT INTO stock_movements (product_id, movement_type, quantity, previous_stock, new_stock, ref_type, notes, user_id)
         VALUES ($1, $2, $3, $4, $5, 'adjustment', $6, $7)`,
        [product_id, movementType, change, previousStock, newStock, notes || `Adjustment: ${reason}`, req.user.id]
      );
      await client.query(
        `INSERT INTO inventory_adjustments (product_id, reason, quantity_change, previous_stock, new_stock, notes, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [product_id, reason, change, previousStock, newStock, notes, req.user.id]
      );
      return { product_name: product.name, previousStock, newStock };
    });

    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'stock_adjustment', module: 'inventory', entity_id: product_id, description: `Adjusted stock for ${result.product_name}: ${result.previousStock} → ${result.newStock} (${reason})`, ip_address: req.ip });
    await createNotification({ type: 'adjustment', title: 'Stock Adjusted', message: `${result.product_name} stock adjusted by ${change > 0 ? '+' : ''}${change}`, ref_type: 'product', ref_id: product_id });
    await checkLowStock(product_id);
    res.status(201).json({ message: 'Stock adjusted successfully', ...result });
  } catch (err) { next(err); }
});

module.exports = router;
