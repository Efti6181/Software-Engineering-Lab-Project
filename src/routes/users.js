const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../config/db');
const { authenticate, authorize, ALLOWED_ROLES } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { search, role, status } = req.query;
    let sql = `SELECT id, name, email, phone, role, status, last_login_at, created_at FROM users WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); sql += ` AND (name ILIKE $${params.length} OR email ILIKE $${params.length})`; }
    if (role) {
      if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
      params.push(role); sql += ` AND role = $${params.length}`;
    }
    if (status) { params.push(status); sql += ` AND status = $${params.length}`; }
    sql += ` ORDER BY created_at DESC`;
    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

router.get('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    if (!/^\d+$/.test(req.params.id)) return res.status(400).json({ error: 'Invalid user ID' });
    const result = await query('SELECT id, name, email, phone, role, status, last_login_at, created_at FROM users WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, email, phone, password, role, status } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Name, email, and password are required' });
    if (!ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    const existing = await query(`SELECT id FROM users WHERE email = $1`, [email.toLowerCase().trim()]);
    if (existing.rows.length > 0) return res.status(400).json({ error: 'Email already exists' });
    const hash = await bcrypt.hash(password, 10);
    const result = await query(
      `INSERT INTO users (name, email, phone, password_hash, role, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, name, email, phone, role, status, created_at`,
      [name.trim(), email.toLowerCase().trim(), phone || null, hash, role, status || 'active']
    );
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'create', module: 'users', entity_id: result.rows[0].id, description: `Created user: ${name} (${role})`, ip_address: req.ip });
    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { name, email, phone, role, status, password } = req.body;
    const id = req.params.id;
    if (role && !ALLOWED_ROLES.includes(role)) return res.status(400).json({ error: 'Invalid role' });
    let sql = `UPDATE users SET name = COALESCE($1, name), email = COALESCE($2, email), phone = COALESCE($3, phone), role = COALESCE($4, role), status = COALESCE($5, status)`;
    const params = [name?.trim(), email?.toLowerCase().trim(), phone, role, status];
    if (password) {
      const hash = await bcrypt.hash(password, 10);
      params.push(hash);
      sql += `, password_hash = $${params.length}`;
    }
    params.push(id);
    sql += ` WHERE id = $${params.length} RETURNING id, name, email, phone, role, status`;
    const result = await query(sql, params);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'update', module: 'users', entity_id: id, description: `Updated user: ${name || ''}`, ip_address: req.ip });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
    const result = await query(`DELETE FROM users WHERE id = $1 RETURNING name`, [id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'delete', module: 'users', entity_id: id, description: `Deleted user: ${result.rows[0].name}`, ip_address: req.ip });
    res.json({ message: 'User deleted' });
  } catch (err) { next(err); }
});

module.exports = router;
