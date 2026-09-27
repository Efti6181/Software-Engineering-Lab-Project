const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status } = req.query;
    let sql = `SELECT * FROM suppliers WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${params.length} OR company_name ILIKE $${params.length} OR phone ILIKE $${params.length})`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += ` ORDER BY name`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM suppliers WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    const purchases = await query(`
      SELECT p.id, p.purchase_number, p.purchase_date, p.grand_total, p.paid_amount, p.due_amount, p.status, p.payment_status
      FROM purchases p WHERE p.supplier_id = $1 ORDER BY p.purchase_date DESC LIMIT 20`, [req.params.id]);
    const totals = await query(`
      SELECT COALESCE(SUM(grand_total),0) as total_purchases, COALESCE(SUM(paid_amount),0) as total_paid, COALESCE(SUM(due_amount),0) as total_due
      FROM purchases WHERE supplier_id = $1 AND status = 'received'`, [req.params.id]);
    const payments = await query(`
      SELECT pm.payment_number, pm.amount, pm.payment_method, pm.payment_date, pm.reference
      FROM payments pm WHERE pm.party_type = 'supplier' AND pm.party_id = $1 ORDER BY pm.payment_date DESC LIMIT 10`, [req.params.id]);
    res.json({ ...result.rows[0], purchases: purchases.rows, totals: totals.rows[0], payments: payments.rows });
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, company_name, phone, email, address, notes, status = 'active' } = req.body;
    if (!name) return res.status(400).json({ error: 'Supplier name is required' });
    const result = await query(
      `INSERT INTO suppliers (name, company_name, phone, email, address, notes, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [name.trim(), company_name || null, phone || null, email || null, address || null, notes || null, status]
    );
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'create', module: 'suppliers', entity_id: result.rows[0].id, description: `Created supplier: ${name}`, ip_address: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, company_name, phone, email, address, notes, status } = req.body;
    const result = await query(
      `UPDATE suppliers SET name = COALESCE($1, name), company_name = COALESCE($2, company_name), phone = COALESCE($3, phone),
       email = COALESCE($4, email), address = COALESCE($5, address), notes = COALESCE($6, notes), status = COALESCE($7, status)
       WHERE id = $8 RETURNING *`,
      [name?.trim(), company_name, phone, email, address, notes, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'update', module: 'suppliers', entity_id: req.params.id, description: `Updated supplier: ${name || ''}`, ip_address: req.ip });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const refCheck = await query(`SELECT COUNT(*) as cnt FROM purchases WHERE supplier_id = $1`, [req.params.id]);
    if (parseInt(refCheck.rows[0].cnt, 10) > 0) {
      return res.status(400).json({ error: 'Cannot delete: supplier has purchase records. Deactivate instead.' });
    }
    const result = await query(`DELETE FROM suppliers WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Supplier not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'delete', module: 'suppliers', entity_id: req.params.id, description: `Deleted supplier`, ip_address: req.ip });
    res.json({ message: 'Supplier deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
