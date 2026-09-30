const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { search, module, page = 1, limit = 25 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (search) { params.push(`%${search}%`); where += ` AND (description ILIKE $${params.length} OR user_name ILIKE $${params.length} OR action ILIKE $${params.length})`; }
    if (module) { params.push(module); where += ` AND module = $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM audit_logs ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`SELECT * FROM audit_logs ${where} ORDER BY created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`, dataParams);
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

module.exports = router;
