// scripts/create-admin.js
// Interactively creates (or promotes) an admin user. Never stores a
// plaintext password or a hash in source control - it prompts you for
// credentials at run time and hashes them the same way the app does.
// Usage: npm run create-admin

require('dotenv').config({ quiet: true });
const readline = require('readline');
const bcrypt = require('bcrypt');
const mysql = require('mysql2/promise');

// Raw-mode keycodes: Enter (CR/LF), Ctrl+C (ETX), Backspace/Delete (BS/DEL)
const CODE_CR = 13, CODE_LF = 10, CODE_ETX = 3, CODE_BS = 8, CODE_DEL = 127;

function prompt(question, { hidden = false } = {}) {
  return new Promise(resolve => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (!hidden) {
      rl.question(question, answer => { rl.close(); resolve(answer); });
      return;
    }
    // Basic masked input for the password prompt.
    const stdin = process.stdin;
    process.stdout.write(question);
    let answer = '';
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    const onData = char => {
      const code = char.charCodeAt(0);
      if (code === CODE_CR || code === CODE_LF) {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        process.stdout.write('\n');
        rl.close();
        resolve(answer);
      } else if (code === CODE_ETX) {
        process.exit(1);
      } else if (code === CODE_BS || code === CODE_DEL) {
        answer = answer.slice(0, -1);
      } else {
        answer += char;
      }
    };
    stdin.on('data', onData);
  });
}

async function main() {
  const username = (await prompt('Admin username: ')).trim();
  if (!username) {
    console.error('Username is required.');
    process.exit(1);
  }
  const password = await prompt('Admin password: ', { hidden: true });
  if (!password || password.length < 8) {
    console.error('Password must be at least 8 characters.');
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);

  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'airportdb'
  });

  try {
    await connection.query(
      `INSERT INTO users (username, password_hash, role)
       VALUES (?, ?, 'admin')
       ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), role = 'admin'`,
      [username, hash]
    );
    console.log(`Admin user "${username}" created/updated. You can now log in at /login.html.`);
  } finally {
    await connection.end();
  }
}

main().catch(err => {
  console.error('Failed to create admin user:', err.message);
  process.exit(1);
});
