// db.js - MySQL connection pool
require('dotenv').config({ quiet: true });
const mysql = require('mysql2');

const requiredIfSet = ['DB_HOST', 'DB_USER', 'DB_NAME'];
for (const key of requiredIfSet) {
  if (!process.env[key]) {
    console.warn(`Warning: ${key} is not set in .env — using default. Copy .env.example to .env to configure your local database.`);
  }
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'airportdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

pool.getConnection((err, connection) => {
  if (err) {
    console.error('Database connection failed:', err.message);
  } else {
    console.log('Connected to MySQL database!');
    connection.release();
  }
});

module.exports = pool;
