// server.js
// Airport Management System backend (Node.js + Express + MySQL)

require('dotenv').config({ quiet: true });
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcrypt');
const db = require('./db'); // MySQL connection pool
const {
  isValidUsername,
  isValidPassword,
  isNonEmptyString,
  pickAllowedFlightFields,
  validateNewFlightPayload,
  validateBookingPayload,
  computeSeatNumber,
  generateTicketNumber
} = require('./utils/validation');

const app = express();
const dbp = db.promise();

// --- Session secret ---------------------------------------------------
// In production this must come from the environment; failing fast here is
// safer than silently signing sessions with a guessable default. In
// development we fall back to a random per-run secret so `npm start` works
// out of the box (sessions just won't survive a restart until SESSION_SECRET
// is set in .env).
let sessionSecret = process.env.SESSION_SECRET;
if (!sessionSecret) {
  if (process.env.NODE_ENV === 'production') {
    console.error('SESSION_SECRET must be set in production. See .env.example.');
    process.exit(1);
  }
  sessionSecret = crypto.randomBytes(32).toString('hex');
  console.warn('SESSION_SECRET not set - using a random secret for this run only. Set it in .env for sessions that persist across restarts.');
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: sessionSecret,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 4 // 4 hours
  }
}));
app.use(express.static('public')); // Serve client HTML/CSS/JS

// Auth helpers
function requireLogin(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  next();
}
function requireAdmin(req, res, next) {
  if (req.session.role !== 'admin') {
    return res.status(403).json({ error: 'Admins only' });
  }
  next();
}

// --- Registration --------------------------------------------------------
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!isValidUsername(username)) {
    return res.status(400).json({ error: 'Username must be 3-30 characters (letters, numbers, underscore, dot, hyphen)' });
  }
  if (!isValidPassword(password)) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  try {
    const hash = await bcrypt.hash(password, 10);
    db.query(
      'INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)',
      [username, hash, 'user'],
      err => {
        if (err) {
          if (err.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({ error: 'Username already taken' });
          }
          console.error('Registration error:', err.message);
          return res.status(500).json({ error: 'Registration failed' });
        }
        res.json({ message: 'User registered' });
      }
    );
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// --- Login -----------------------------------------------------------------
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (!isNonEmptyString(username) || !isNonEmptyString(password)) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  db.query('SELECT * FROM users WHERE username = ?', [username], async (err, results) => {
    if (err) {
      console.error('Login error:', err.message);
      return res.status(500).json({ error: 'Server error' });
    }
    if (results.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = results[0];
    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) return res.status(401).json({ error: 'Invalid credentials' });
    req.session.userId = user.id;
    req.session.role = user.role;
    res.json({ message: 'Logged in', role: user.role });
  });
});

// --- Logout ------------------------------------------------------------
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Logged out' });
  });
});

// --- Admin: List airlines (for the Add Flight dropdown) --------------------
app.get('/api/airlines', requireLogin, requireAdmin, (req, res) => {
  db.query('SELECT AIRLINEID, AL_NAME AS NAME FROM airline', (err, rows) => {
    if (err) {
      console.error('Airlines lookup error:', err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

// --- Flights: list (with optional filters) ----------------------------------
app.get('/api/flights', (req, res) => {
  let sql = 'SELECT * FROM FLIGHT';
  const filters = [], params = [];
  if (req.query.code) {
    filters.push('FLIGHT_CODE = ?');
    params.push(req.query.code);
  }
  if (req.query.source) {
    filters.push('SOURCE = ?');
    params.push(req.query.source);
  }
  if (req.query.destination) {
    filters.push('DESTINATION = ?');
    params.push(req.query.destination);
  }
  if (filters.length) sql += ' WHERE ' + filters.join(' AND ');
  db.query(sql, params, (err, rows) => {
    if (err) {
      console.error('Flights lookup error:', err.message);
      return res.status(500).json({ error: 'DB error' });
    }
    res.json(rows);
  });
});

// --- Admin: add flight -------------------------------------------------
app.post('/api/flights', requireLogin, requireAdmin, (req, res) => {
  const errors = validateNewFlightPayload(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }
  const f = pickAllowedFlightFields(req.body);
  const layover = f.LAYOVER_TIME !== undefined ? f.LAYOVER_TIME : 0;
  const stops = f.NO_OF_STOPS !== undefined ? f.NO_OF_STOPS : 0;
  const seats = f.AVAILABLE_SEATS !== undefined ? f.AVAILABLE_SEATS : 100;

  db.query(
    `INSERT INTO FLIGHT
     (FLIGHT_CODE, SOURCE, DESTINATION, ARRIVAL, DEPARTURE, STATUS,
      DURATION, FLIGHTTYPE, LAYOVER_TIME, NO_OF_STOPS, AIRLINEID, AVAILABLE_SEATS)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [f.FLIGHT_CODE, f.SOURCE, f.DESTINATION, f.ARRIVAL, f.DEPARTURE, f.STATUS,
     f.DURATION, f.FLIGHTTYPE, layover, stops, f.AIRLINEID, seats],
    err => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({ error: 'Flight code already exists' });
        }
        console.error('Insert flight error:', err.message);
        return res.status(500).json({ error: 'Insert failed' });
      }
      res.json({ message: 'Flight added' });
    }
  );
});

// --- Admin: edit flight (whitelisted columns only) --------------------------
app.put('/api/flights/:code', requireLogin, requireAdmin, (req, res) => {
  const code = req.params.code;
  const fields = pickAllowedFlightFields(req.body);
  const keys = Object.keys(fields);
  if (keys.length === 0) {
    return res.status(400).json({ error: 'No valid fields to update' });
  }
  const setClause = keys.map(k => `${k} = ?`).join(', ');
  const params = keys.map(k => fields[k]);
  params.push(code);

  db.query(`UPDATE FLIGHT SET ${setClause} WHERE FLIGHT_CODE = ?`, params, (err, result) => {
    if (err) {
      console.error('Update flight error:', err.message);
      return res.status(500).json({ error: 'Update failed' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    res.json({ message: 'Flight updated' });
  });
});

// --- Admin: delete flight ------------------------------------------------
app.delete('/api/flights/:code', requireLogin, requireAdmin, (req, res) => {
  db.query('DELETE FROM FLIGHT WHERE FLIGHT_CODE = ?', [req.params.code], (err, result) => {
    if (err) {
      console.error('Delete flight error:', err.message);
      return res.status(500).json({ error: 'Delete failed' });
    }
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Flight not found' });
    }
    res.json({ message: 'Flight deleted' });
  });
});

// --- Admin: view passengers on a flight (matched by exact flight code) -----
app.get('/api/flights/:code/passengers', requireLogin, requireAdmin, (req, res) => {
  db.query(
    `SELECT p.FNAME, p.LNAME, t.SOURCE, t.DESTINATION
     FROM TICKET1 t
     JOIN PASSENGER2 p ON t.PASSPORTNO = p.PASSPORTNO
     WHERE t.FLIGHT_CODE = ?`,
    [req.params.code],
    (err, rows) => {
      if (err) {
        console.error('Passenger lookup error:', err.message);
        return res.status(500).json({ error: 'Query failed' });
      }
      res.json(rows);
    }
  );
});

// --- User: book flight -----------------------------------------------------
// Runs inside a transaction with the flight row locked (SELECT ... FOR
// UPDATE) so two concurrent bookings on the last remaining seat can't both
// succeed, and so a failure partway through never leaves the seat count and
// ticket table out of sync.
app.post('/api/book', requireLogin, async (req, res) => {
  const errors = validateBookingPayload(req.body);
  if (errors.length) {
    return res.status(400).json({ error: errors.join('; ') });
  }

  const uid = req.session.userId;
  const { flightCode, passport, fname, m, lname, address, phone, age, sex } = req.body;
  const p = passport.trim();

  let connection;
  try {
    connection = await dbp.getConnection();
    await connection.beginTransaction();

    await connection.query(
      `INSERT INTO PASSENGER1 (PID, PASSPORTNO)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE PASSPORTNO = PASSPORTNO`,
      [uid, p]
    );

    await connection.query(
      `INSERT INTO PASSENGER2 (PASSPORTNO, FNAME, M, LNAME, ADDRESS, PHONE, AGE, SEX)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         FNAME = VALUES(FNAME), M = VALUES(M), LNAME = VALUES(LNAME),
         ADDRESS = VALUES(ADDRESS), PHONE = VALUES(PHONE),
         AGE = VALUES(AGE), SEX = VALUES(SEX)`,
      [p, fname, m || null, lname, address, phone, Number(age), sex]
    );

    const [flights] = await connection.query(
      'SELECT SOURCE, DESTINATION, AVAILABLE_SEATS FROM FLIGHT WHERE FLIGHT_CODE = ? FOR UPDATE',
      [flightCode]
    );
    if (flights.length === 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'Invalid flight code' });
    }
    const { SOURCE, DESTINATION, AVAILABLE_SEATS } = flights[0];
    if (AVAILABLE_SEATS <= 0) {
      await connection.rollback();
      return res.status(400).json({ error: 'No seats available' });
    }

    await connection.query(
      'UPDATE FLIGHT SET AVAILABLE_SEATS = AVAILABLE_SEATS - 1 WHERE FLIGHT_CODE = ?',
      [flightCode]
    );

    const [[{ ticketCount }]] = await connection.query(
      'SELECT COUNT(*) AS ticketCount FROM TICKET1 WHERE FLIGHT_CODE = ?',
      [flightCode]
    );
    const seatNo = computeSeatNumber(ticketCount);
    const ticketNo = generateTicketNumber();
    const today = new Date().toISOString().split('T')[0];

    await connection.query(
      `INSERT INTO TICKET1
       (TICKET_NUMBER, FLIGHT_CODE, SOURCE, DESTINATION, DATE_OF_BOOKING, DATE_OF_TRAVEL, SEATNO, CLASS, PID, PASSPORTNO)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [ticketNo.toString(), flightCode, SOURCE, DESTINATION, today, today, seatNo, 'Economy', uid, p]
    );

    await connection.commit();
    res.json({ message: 'Flight booked', ticket: ticketNo.toString(), seat: seatNo });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackErr) { console.error('Rollback failed:', rollbackErr.message); }
    }
    console.error('Booking error:', err.message);
    res.status(500).json({ error: 'Booking failed' });
  } finally {
    if (connection) connection.release();
  }
});

// --- User: list bookings -----------------------------------------------
app.get('/api/bookings', requireLogin, (req, res) => {
  db.query(
    `SELECT TICKET_NUMBER, SOURCE, DESTINATION, DATE_OF_BOOKING
     FROM TICKET1 WHERE PID = ?`,
    [req.session.userId],
    (err, rows) => {
      if (err) {
        console.error('Bookings lookup error:', err.message);
        return res.status(500).json({ error: 'DB error' });
      }
      res.json(rows);
    }
  );
});

// --- User: cancel booking (matched by exact flight code) -------------------
app.delete('/api/bookings/:tkt', requireLogin, async (req, res) => {
  const ticketNo = req.params.tkt;
  const userId = req.session.userId;

  let connection;
  try {
    connection = await dbp.getConnection();
    await connection.beginTransaction();

    const [tickets] = await connection.query(
      'SELECT FLIGHT_CODE FROM TICKET1 WHERE TICKET_NUMBER = ? AND PID = ? FOR UPDATE',
      [ticketNo, userId]
    );
    if (tickets.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Booking not found' });
    }
    const { FLIGHT_CODE } = tickets[0];

    if (FLIGHT_CODE) {
      await connection.query(
        'UPDATE FLIGHT SET AVAILABLE_SEATS = AVAILABLE_SEATS + 1 WHERE FLIGHT_CODE = ?',
        [FLIGHT_CODE]
      );
    }

    await connection.query(
      'DELETE FROM TICKET1 WHERE TICKET_NUMBER = ? AND PID = ?',
      [ticketNo, userId]
    );

    await connection.commit();
    res.json({ message: 'Booking canceled' });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch (rollbackErr) { console.error('Rollback failed:', rollbackErr.message); }
    }
    console.error('Cancel booking error:', err.message);
    res.status(500).json({ error: 'Cancel failed' });
  } finally {
    if (connection) connection.release();
  }
});

// --- Fallback error handler --------------------------------------------
// Catches anything thrown/rejected in a route that wasn't already handled,
// so a stack trace never reaches the client.
app.use((err, _req, res, next) => {
  if (res.headersSent) return next(err);
  console.error('Unhandled error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
