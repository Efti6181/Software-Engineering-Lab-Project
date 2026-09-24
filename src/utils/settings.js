const { query } = require('../config/db');

async function getSetting(key) {
  const result = await query(`SELECT ${key} FROM business_settings WHERE id = 1`);
  return result.rows.length > 0 ? result.rows[0][key] : null;
}

async function getAllSettings() {
  const result = await query(`SELECT * FROM business_settings WHERE id = 1`);
  return result.rows[0] || {};
}

module.exports = { getSetting, getAllSettings };
