// server.js - Node.js (Express) server for Airport Management System
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcrypt');
const db = require('./db');

const app = express();
const PORT = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static frontend files from 'public' directory
app.use(express.static('public'));

// User Registration (POST /register)
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: 'Username and password are required.' });
  }
  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    const sql = "INSERT INTO users (username, password_hash) VALUES (?, ?)";
    db.query(sql, [username, hashedPassword], (err, result) => {
      if (err) {
        if (err.code === 'ER_DUP_ENTRY') {
          res.status(409).json({ message: 'Username already exists.' });
        } else {
          console.error(err);
          res.status(500).json({ message: 'Error registering user.' });
        }
      } else {
        res.json({ message: 'User registered successfully!' });
      }
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error hashing password.' });
  }
});

// User Login (POST /login)
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const sql = "SELECT * FROM users WHERE username = ?";
  db.query(sql, [username], async (err, results) => {
    if (err) {
      console.error(err);
      return res.status(500).json({ message: 'Error logging in.' });
    }
    if (results.length === 0) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    const user = results[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }
    // Successful login: send role to frontend
    res.json({ message: 'Login successful!', role: user.role });
  });
});

// Get all airports (GET /api/airports)
app.get('/api/airports', (req, res) => {
  const sql = "SELECT * FROM AIRPORT";
  db.query(sql, (err, results) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: 'Error fetching airports.' });
    } else {
      res.json(results);
    }
  });
});

// Add a new airport (POST /api/airports) – Admin only in theory
app.post('/api/airports', (req, res) => {
  const { apName, state, country, city } = req.body;
  if (!apName || !state || !country || !city) {
    return res.status(400).json({ message: 'All fields are required.' });
  }
  const sql = "INSERT INTO AIRPORT (AP_NAME, STATE, COUNTRY, CNAME) VALUES (?, ?, ?, ?)";
  db.query(sql, [apName, state, country, city], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: 'Error adding airport.' });
    } else {
      res.json({ message: 'Airport added successfully!' });
    }
  });
});

// Update an airport (PUT /api/airports/:name) – Admin only in theory
app.put('/api/airports/:name', (req, res) => {
  const oldName = req.params.name;
  const { state, country, city } = req.body;
  const sql = "UPDATE AIRPORT SET STATE = ?, COUNTRY = ?, CNAME = ? WHERE AP_NAME = ?";
  db.query(sql, [state, country, city, oldName], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: 'Error updating airport.' });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Airport not found.' });
    } else {
      res.json({ message: 'Airport updated successfully!' });
    }
  });
});

// Delete an airport (DELETE /api/airports/:name) – Available to all users in this demo
app.delete('/api/airports/:name', (req, res) => {
  const name = req.params.name;
  const sql = "DELETE FROM AIRPORT WHERE AP_NAME = ?";
  db.query(sql, [name], (err, result) => {
    if (err) {
      console.error(err);
      res.status(500).json({ message: 'Error deleting airport.' });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ message: 'Airport not found.' });
    } else {
      res.json({ message: 'Airport deleted successfully!' });
    }
  });
});

// Add new city (POST /api/cities)
app.post('/api/cities', (req, res) => {
  const { cname, state, country } = req.body;
  if (!cname || !state || !country) {
    return res.status(400).json({ message: 'All city fields are required.' });
  }

  const sql = "INSERT INTO CITY (CNAME, STATE, COUNTRY) VALUES (?, ?, ?)";
  db.query(sql, [cname, state, country], (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        res.status(409).json({ message: 'City already exists.' });
      } else {
        console.error(err);
        res.status(500).json({ message: 'Error adding city.' });
      }
    } else {
      res.json({ message: 'City added successfully!' });
    }
  });
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
