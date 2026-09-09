// scripts/init-db.js
// Creates the database (if needed) and applies sql/schema.sql.
// Usage: npm run setup-db

require('dotenv').config({ quiet: true });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

const DB_HOST = process.env.DB_HOST || 'localhost';
const DB_USER = process.env.DB_USER || 'root';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'airportdb';

async function main() {
  const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
  const schemaSql = fs.readFileSync(schemaPath, 'utf8');

  const connection = await mysql.createConnection({
    host: DB_HOST,
    user: DB_USER,
    password: DB_PASSWORD,
    multipleStatements: true
  });

  try {
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await connection.changeUser({ database: DB_NAME });
    await connection.query(schemaSql);
    console.log(`Database "${DB_NAME}" is set up and up to date.`);
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error('Database setup failed:', err.message);
  process.exit(1);
});
