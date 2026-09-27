const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status } = req.query;
    let sql = `SELECT b.*, (SELECT COUNT(*) FROM products WHERE brand_id = b.id) as product_count FROM brands b WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND b.name ILIKE $${params.length}`; }
    if (status) { params.push(status); sql += ` AND b.status = $${params.length}`; }
    sql += ` ORDER BY b.name`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, description, status = 'active' } = req.body;
    if (!name) return res.status(400).json({ error: 'Brand name is required' });
    const result = await query(
      `INSERT INTO brands (name, description, status) VALUES ($1, $2, $3) RETURNING *`,
      [name.trim(), description || null, status]
    );
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'create', module: 'brands', entity_id: result.rows[0].id, description: `Created brand: ${name}`, ip_address: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, description, status } = req.body;
    const result = await query(
      `UPDATE brands SET name = COALESCE($1, name), description = COALESCE($2, description), status = COALESCE($3, status) WHERE id = $4 RETURNING *`,
      [name?.trim(), description, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Brand not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'update', module: 'brands', entity_id: req.params.id, description: `Updated brand: ${name || ''}`, ip_address: req.ip });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const countResult = await query(`SELECT COUNT(*) as cnt FROM products WHERE brand_id = $1`, [req.params.id]);
    if (parseInt(countResult.rows[0].cnt, 10) > 0) {
      return res.status(400).json({ error: 'Cannot delete: brand has linked products. Deactivate it instead.' });
    }
    const result = await query(`DELETE FROM brands WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Brand not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'delete', module: 'brands', entity_id: req.params.id, description: `Deleted brand`, ip_address: req.ip });
    res.json({ message: 'Brand deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
