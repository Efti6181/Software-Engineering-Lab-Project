const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

function generateNumber() {
  return `EXP-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { search, category_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (e.expense_number ILIKE $${params.length} OR e.description ILIKE $${params.length})`; }
    if (category_id) { params.push(category_id); where += ` AND e.category_id = $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM expenses e ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT e.*, ec.name as category_name, u.name as created_by_name
      FROM expenses e LEFT JOIN expense_categories ec ON e.category_id = ec.id
      LEFT JOIN users u ON e.created_by = u.id
      ${where} ORDER BY e.expense_date DESC, e.created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

router.get('/categories', authenticate, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM expense_categories ORDER BY name`);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { category_id, amount, expense_date, payment_method, description } = req.body;
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Amount must be greater than 0' });
    const result = await query(
      `INSERT INTO expenses (expense_number, category_id, amount, expense_date, payment_method, description, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [generateNumber(), category_id || null, parseFloat(amount), expense_date || null, payment_method || 'cash', description || null, req.user.id]
    );
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'create', module: 'expenses', entity_id: result.rows[0].id, description: `Created expense of ${amount}`, ip_address: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { category_id, amount, expense_date, payment_method, description } = req.body;
    const result = await query(
      `UPDATE expenses SET category_id = COALESCE($1, category_id), amount = COALESCE($2, amount),
       expense_date = COALESCE($3, expense_date), payment_method = COALESCE($4, payment_method), description = COALESCE($5, description)
       WHERE id = $6 RETURNING *`,
      [category_id, parseFloat(amount), expense_date, payment_method, description, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'update', module: 'expenses', entity_id: req.params.id, description: `Updated expense`, ip_address: req.ip });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const result = await query(`DELETE FROM expenses WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Expense not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'delete', module: 'expenses', entity_id: req.params.id, description: `Deleted expense`, ip_address: req.ip });
    res.json({ message: 'Expense deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
