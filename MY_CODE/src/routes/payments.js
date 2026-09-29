const express = require('express');
const { query, withTransaction } = require('../config/db');
const { authenticate, authorize } = require('../middleware/auth');
const { logAudit } = require('../utils/audit');

const router = express.Router();

function generateNumber() {
  return `PAY-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
}

// List payments
router.get('/', authenticate, async (req, res, next) => {
  try {
    const { party_type, party_id, ref_type, ref_id, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    let where = `WHERE 1=1`;
    const params = [];
    if (party_type) { params.push(party_type); where += ` AND party_type = $${params.length}`; }
    if (party_id) { params.push(party_id); where += ` AND party_id = $${params.length}`; }
    if (ref_type) { params.push(ref_type); where += ` AND ref_type = $${params.length}`; }
    if (ref_id) { params.push(ref_id); where += ` AND ref_id = $${params.length}`; }
    const countResult = await query(`SELECT COUNT(*) as total FROM payments ${where}`, params);
    const total = parseInt(countResult.rows[0].total, 10);
    const dataParams = [...params, limit, offset];
    const result = await query(`
      SELECT * FROM payments ${where} ORDER BY payment_date DESC, created_at DESC LIMIT $${dataParams.length - 1} OFFSET $${dataParams.length}`,
      dataParams
    );
    res.json({ data: result.rows, total, page: parseInt(page, 10), limit: parseInt(limit, 10) });
  } catch (err) { next(err); }
});

// Dues summary
router.get('/dues', authenticate, async (req, res, next) => {
  try {
    const customerDues = await query(`
      SELECT s.id, s.invoice_number, s.customer_id, c.name as customer_name, s.sale_date, s.grand_total, s.paid_amount, s.due_amount
      FROM sales s JOIN customers c ON s.customer_id = c.id
      WHERE s.status = 'completed' AND s.due_amount > 0 ORDER BY s.sale_date DESC`);
    const supplierDues = await query(`
      SELECT p.id, p.purchase_number, p.supplier_id, s.name as supplier_name, p.purchase_date, p.grand_total, p.paid_amount, p.due_amount
      FROM purchases p JOIN suppliers s ON p.supplier_id = s.id
      WHERE p.status = 'received' AND p.due_amount > 0 ORDER BY p.purchase_date DESC`);
    res.json({ customerDues: customerDues.rows, supplierDues: supplierDues.rows });
  } catch (err) { next(err); }
});

// Create payment
router.post('/', authenticate, authorize('admin'), async (req, res, next) => {
  try {
    const { party_type, party_id, ref_type, ref_id, amount, payment_method, reference, notes } = req.body;
    if (!party_type || !party_id || !amount) return res.status(400).json({ error: 'Party type, party ID, and amount are required' });
    if (!['customer', 'supplier'].includes(party_type)) return res.status(400).json({ error: 'Invalid party type' });

    const result = await withTransaction(async (client) => {
      const payRes = await client.query(
        `INSERT INTO payments (payment_number, party_type, party_id, ref_type, ref_id, amount, payment_method, reference, notes, user_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [generateNumber(), party_type, party_id, ref_type || null, ref_id || null, parseFloat(amount), payment_method || 'cash', reference || null, notes || null, req.user.id]
      );

      // Update sale or purchase due
      if (ref_type === 'sale' && ref_id) {
        const saleRes = await client.query(`SELECT paid_amount, due_amount, grand_total FROM sales WHERE id = $1 FOR UPDATE`, [ref_id]);
        if (saleRes.rows.length > 0) {
          const sale = saleRes.rows[0];
          const newPaid = parseFloat(sale.paid_amount) + parseFloat(amount);
          const newDue = parseFloat(sale.grand_total) - newPaid;
          const ps = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
          await client.query(`UPDATE sales SET paid_amount = $1, due_amount = $2, payment_status = $3 WHERE id = $4`, [newPaid, Math.max(0, newDue), ps, ref_id]);
        }
      } else if (ref_type === 'purchase' && ref_id) {
        const purRes = await client.query(`SELECT paid_amount, due_amount, grand_total FROM purchases WHERE id = $1 FOR UPDATE`, [ref_id]);
        if (purRes.rows.length > 0) {
          const pur = purRes.rows[0];
          const newPaid = parseFloat(pur.paid_amount) + parseFloat(amount);
          const newDue = parseFloat(pur.grand_total) - newPaid;
          const ps = newDue <= 0 ? 'paid' : newPaid > 0 ? 'partial' : 'unpaid';
          await client.query(`UPDATE purchases SET paid_amount = $1, due_amount = $2, payment_status = $3 WHERE id = $4`, [newPaid, Math.max(0, newDue), ps, ref_id]);
        }
      }
      return payRes.rows[0];
    });

    await logAudit({ user_id: req.user.id, user_name: req.user.name, action: 'payment', module: 'payments', entity_id: result.id, description: `Recorded payment of ${amount} for ${party_type}`, ip_address: req.ip });
    res.status(201).json(result);
  } catch (err) { next(err); }
});

module.exports = router;
