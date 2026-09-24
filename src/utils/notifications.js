const { query } = require('../config/db');

async function createNotification({ type, title, message, ref_type = null, ref_id = null, user_id = null }) {
  try {
    await query(
      `INSERT INTO notifications (type, title, message, ref_type, ref_id, user_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, title, message, ref_type, ref_id, user_id]
    );
  } catch (err) {
    console.error('Failed to create notification:', err.message);
  }
}

async function checkLowStock(productId) {
  const result = await query(
    `SELECT id, name, current_stock, min_stock_level FROM products WHERE id = $1`,
    [productId]
  );
  if (result.rows.length === 0) return;
  const p = result.rows[0];
  if (p.current_stock <= 0) {
    await createNotification({ type: 'out_of_stock', title: 'Out of Stock', message: `${p.name} is out of stock`, ref_type: 'product', ref_id: p.id });
  } else if (p.current_stock <= p.min_stock_level) {
    await createNotification({ type: 'low_stock', title: 'Low Stock', message: `${p.name} is running low (${p.current_stock} ${p.unit || ''} left)`, ref_type: 'product', ref_id: p.id });
  }
}

module.exports = { createNotification, checkLowStock };
