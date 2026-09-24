const express = require('express');
const { query } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

router.get('/', authenticate, async (req, res, next) => {
  try {
    const result = await query(`SELECT * FROM business_settings WHERE id = 1`);
    res.json({ settings: result.rows[0] || {} });
  } catch (err) { next(err); }
});

router.put('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { business_name, logo_url, address, phone, email, currency_symbol, currency_code, default_tax_percent, invoice_prefix, invoice_footer, default_low_stock_level, allow_negative_stock } = req.body;
    const result = await query(
      `UPDATE business_settings SET
        business_name = COALESCE($1, business_name), logo_url = COALESCE($2, logo_url),
        address = COALESCE($3, address), phone = COALESCE($4, phone), email = COALESCE($5, email),
        currency_symbol = COALESCE($6, currency_symbol), currency_code = COALESCE($7, currency_code),
        default_tax_percent = COALESCE($8, default_tax_percent), invoice_prefix = COALESCE($9, invoice_prefix),
        invoice_footer = COALESCE($10, invoice_footer), default_low_stock_level = COALESCE($11, default_low_stock_level),
        allow_negative_stock = COALESCE($12, allow_negative_stock), updated_by = $13, updated_at = now()
       WHERE id = 1 RETURNING *`,
      [business_name, logo_url, address, phone, email, currency_symbol, currency_code,
       parseFloat(default_tax_percent), invoice_prefix, invoice_footer, parseInt(default_low_stock_level, 10), allow_negative_stock, req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Settings not found. Run schema.sql first.' });
    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'update', module: 'settings', description: 'Updated business settings', ip_address: req.ip });
    res.json({ settings: result.rows[0] });
  } catch (err) { next(err); }
});

module.exports = router;
