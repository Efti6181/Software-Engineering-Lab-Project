const { Pool } = require('pg');

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432', 10),
  database: process.env.DB_NAME || 'business_inventory',
  user: process.env.DB_USER || 'postgres',
};
const dbPassword = process.env.DB_PASSWORD;
if (typeof dbPassword !== 'string' || !dbPassword.trim() || dbPassword === 'YOUR_POSTGRES_PASSWORD') {
  throw new Error('DB_PASSWORD is missing. Create a .env file beside server.js and set your actual PostgreSQL password.');
}
dbConfig.password = dbPassword;

const pool = new Pool(dbConfig);

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

const query = (text, params) => pool.query(text, params);

const withTransaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
};

module.exports = { pool, query, withTransaction };
