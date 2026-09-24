const { query } = require('../config/db');

async function logAudit({ user_id, user_name, action, module, entity_id = null, description = '', ip_address = null }) {
  try {
    await query(
      `INSERT INTO audit_logs (user_id, user_name, action, module, entity_id, description, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [user_id, user_name, action, module, entity_id, description, ip_address]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

module.exports = { logAudit };
