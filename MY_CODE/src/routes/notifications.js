const express = require('express');
const { query } = require('../config/db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const { page = 1, limit = 20, unread_only } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (unread_only === 'true') { params.push(false); where += ` AND is_read = $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM notifications ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`SELECT * FROM notifications ${where} ORDER BY created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams);
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

router.get('/unread-count', authenticate, async (req, res, next) => {
  try {
    const result = await query(`SELECT COUNT(*) as count FROM notifications WHERE is_read = FALSE`);
    res.json({ count: parseInt(result.rows[0].count, 10) });
  } catch (err) { next(err); }
});

router.put('/:id/read', authenticate, async (req, res, next) => {
  try {
    const result = await query(`UPDATE notifications SET is_read = TRUE WHERE id = $1 RETURNING *`, [req.params.id]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Notification not found' });
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

router.put('/read-all', authenticate, async (req, res, next) => {
  try {
    await query(`UPDATE notifications SET is_read = TRUE WHERE is_read = FALSE`);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) { next(err); }
});

module.exports = router;
