const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, status } = req.query;
    let sql = `SELECT * FROM customers WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${params.length} OR phone ILIKE $${params.length} OR email ILIKE $${params.length})`; }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += ` ORDER BY name`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM customers WHERE id = $1`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    const sales = await query(`
      SELECT s.id, s.invoice_number, s.sale_date, s.grand_total, s.paid_amount, s.due_amount, s.payment_status
      FROM sales s WHERE s.customer_id = $1 AND s.status = 'completed' ORDER BY s.sale_date DESC LIMIT 20`, [req.params.id]);
    const totals = await query(`
      SELECT COALESCE(SUM(grand_total),0) as total_sales, COALESCE(SUM(paid_amount),0) as total_paid, COALESCE(SUM(due_amount),0) as total_due
      FROM sales WHERE customer_id = $1 AND status = 'completed'`, [req.params.id]);
    const payments = await query(`
      SELECT pm.payment_number, pm.amount, pm.payment_method, pm.payment_date, pm.reference
      FROM payments pm WHERE pm.party_type = 'customer' AND pm.party_id = $1 ORDER BY pm.payment_date DESC LIMIT 10`, [req.params.id]);
    res.json({ ...result.rows[0], sales: sales.rows, totals: totals.rows[0], payments: payments.rows });
  } catch (err) { next(err); }
});

router.post('/', authenticate, async (req, res, next) => {
  try {
    const { name, phone, email, address, notes, status = 'active' } = req.body;
    if (!name) return res.status(400).json({ error: 'Customer name is required' });
    const result = await query(
      `INSERT INTO customers (name, phone, email, address, notes, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [name.trim(), phone || null, email || null, address || null, notes || null, status]
    );
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'create', module: 'customers', entity_id: result.rows[0].id, description: `Created customer: ${name}`, ip_address: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, async (req, res, next) => {
  try {
    const { name, phone, email, address, notes, status } = req.body;
    const result = await query(
      `UPDATE customers SET name = COALESCE($1, name), phone = COALESCE($2, phone), email = COALESCE($3, email),
       address = COALESCE($4, address), notes = COALESCE($5, notes), status = COALESCE($6, status)
       WHERE id = $7 RETURNING *`,
      [name?.trim(), phone, email, address, notes, status, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'update', module: 'customers', entity_id: req.params.id, description: `Updated customer: ${name || ''}`, ip_address: req.ip });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const refCheck = await query(`SELECT COUNT(*) as cnt FROM sales WHERE customer_id = $1`, [req.params.id]);
    if (parseInt(refCheck.rows[0].cnt, 10) > 0) {
      return res.status(400).json({ error: 'Cannot delete: customer has sales records. Deactivate instead.' });
    }
    const result = await query(`DELETE FROM customers WHERE id = $1 AND is_walk_in = FALSE RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Customer not found or is walk-in (protected)' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'delete', module: 'customers', entity_id: req.params.id, description: `Deleted customer`, ip_address: req.ip });
    res.json({ message: 'Customer deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
