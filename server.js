// server.js - Backend code to handle API requests
require('dotenv').config();
const express = require('express');
const bcrypt = require('bcrypt');
const sqlite3 = require('sqlite3').verbose();
const jwt = require('jsonwebtoken');
const cors = require('cors');

const app = express();

app.use(cors({
   origin: ['https://paytess02.github.io', 'http://localhost:3000'], // Allow GitHub Pages and local development
   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],            // Allowed HTTP methods
   allowedHeaders: ['Content-Type', 'Authorization'],               // Allowed headers
   credentials: true,  // Include credentials if necessary
}));
app.options('*', cors());
app.use(express.json());


const SECRET_KEY = process.env.OPENAI_API_KEY;


const ADMIN_USERNAME = "admin";
const ADMIN_PASSWORD = "adminpassword";

const db = new sqlite3.Database('./database.sqlite', (err) => {
  if (err) console.error("Error opening database", err.message);
  else console.log("Connected to SQLite database.");
});

// Database setup for users and roles
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS role (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      role TEXT CHECK(role IN ('registered', 'approved', 'master')),
      approval_status TEXT CHECK(approval_status IN ('pending', 'approved', 'reverted')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);
  db.run(`
    CREATE TABLE IF NOT EXISTS UserRequest (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL,
      question TEXT NOT NULL,
      chatGPTResponse TEXT,
      adminResponse TEXT,
      feedback TEXT,
      createdAt TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log("Tables initialized.");
});

// Utility functions
const generateToken = (user, expiresIn = '1h') => jwt.sign(user, SECRET_KEY, { expiresIn });
const verifyToken = (token) => jwt.verify(token, SECRET_KEY);

// User Registration
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  const hashedPassword = bcrypt.hashSync(password, 10);

  db.run(`INSERT INTO users (username, password) VALUES (?, ?)`, [username, hashedPassword], function (err) {
    if (err) {
      console.error("Error inserting into users table:", err);
      return res.status(400).json({ error: 'Username already exists or other database error' });
    }
    
    db.run(
      `INSERT INTO role (user_id, role, approval_status) VALUES (?, 'registered', 'pending')`, 
      [this.lastID], 
      (err) => {
        if (err) {
          console.error("Error assigning role:", err);
          return res.status(500).json({ error: 'Error assigning role' });
        }
        res.json({ message: 'Registration successful, awaiting approval' });
      }
    );
  });
  
});

// User Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get(`SELECT * FROM users WHERE username = ?`, [username], (err, user) => {
    if (err || !user || !bcrypt.compareSync(password, user.password)) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = generateToken({ id: user.id, username: user.username });
    res.json({ message: 'Login successful', token });
  });
});

// Admin Login
app.post('/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    const token = generateToken({ role: 'master' });
    res.json({ message: 'Admin login successful', token });
  } else {
    res.status(401).json({ error: 'Invalid admin credentials' });
  }
});
// Endpoint to fetch all registered users with their statuses
app.get('/admin/users', (req, res) => {
  db.all(`SELECT u.id, u.username, r.approval_status FROM users u JOIN role r ON u.id = r.user_id`, 
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error fetching users' });
      res.json({ users: rows });
  });
});

// Master (Admin) Approves or Reverts User Access
app.post('/admin/approve-revert', (req, res) => {
  const { userId, action } = req.body;
  const status = action === 'approve' ? 'approved' : 'reverted';

  db.run(
    `UPDATE role SET approval_status = ? WHERE user_id = ? AND role = 'registered'`,
    [status, userId],
    function (err) {
      if (err || this.changes === 0) return res.status(500).json({ error: 'Action failed' });
      res.json({ message: `User ${action === 'approve' ? 'approved' : 'reverted'} successfully` });
    }
  );
});

// Admin View Registered Users Pending Approval
app.get('/admin/pending-users', (req, res) => {
  db.all(`SELECT u.id, u.username, r.approval_status FROM users u JOIN role r ON u.id = r.user_id WHERE r.role = 'registered' AND r.approval_status = 'pending'`, 
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Error fetching pending users' });
      res.json({ pendingUsers: rows });
  });
});

// Check Chatbot Access for Users
app.get('/chatbot-access', (req, res) => {
  const token = req.headers.authorization.split(' ')[1];
  try {
    const decoded = verifyToken(token);
    const userId = decoded.id;

    db.get(
      `SELECT * FROM role WHERE user_id = ? AND approval_status = 'approved'`,
      [userId],
      (err, row) => {
        if (err || !row) return res.status(403).json({ error: 'Access denied' });
        res.json({ message: 'Access granted' });
      }
    );
  } catch (error) {
    console.error("JWT verification failed:", error.message);
    res.status(401).json({ error: 'Invalid token' });
  }
});

// Chatbot Interaction
app.post('/chat', async (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message is required' });

  try {
    const fetch = (await import('node-fetch')).default;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SECRET_KEY}`, // OpenAI API Key
      },
      body: JSON.stringify({
        model: "gpt-3.5-turbo",
        messages: [{ role: "user", content: message }],
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(`OpenAI API error: ${error.error.message}`);
    }

    const data = await response.json();
    const reply = data.choices[0].message.content;
    res.json({ reply });
  } catch (error) {
    console.error("Error with OpenAI API:", error.message);
    res.status(500).json({ error: 'Failed to get response from the chatbot' });
  }
});
app.post('/user-requests', (req, res) => {
  const { username, question, chatGPTResponse } = req.body;

  if (!username || !question || !chatGPTResponse) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.run(
    `INSERT INTO UserRequest (username, question, chatGPTResponse) VALUES (?, ?, ?)`,
    [username, question, chatGPTResponse],
    function (err) {
      if (err) {
        console.error('Error inserting user request:', err.message);
        return res.status(500).json({ error: 'Failed to log user request' });
      }
      res.json({ message: 'User request logged successfully', requestId: this.lastID });
    }
  );
});

app.put('/user-requests/:id/chatgpt-response', (req, res) => {
  const { id } = req.params;
  const { chatGPTResponse } = req.body;

  if (!chatGPTResponse) {
    return res.status(400).json({ error: 'ChatGPT response is required' });
  }

  db.run(
    `UPDATE UserRequest SET chatGPTResponse = ? WHERE id = ?`,
    [chatGPTResponse, id],
    function (err) {
      if (err || this.changes === 0) {
        console.error('Error updating ChatGPT response:', err ? err.message : 'No changes made');
        return res.status(500).json({ error: 'Failed to update ChatGPT response' });
      }
      res.json({ message: 'ChatGPT response updated successfully' });
    }
  );
});
app.put('/user-requests/:id/admin-response', (req, res) => {
  const { id } = req.params;
  const { adminResponse } = req.body;

  if (!adminResponse) {
    return res.status(400).json({ error: 'Admin response is required' });
  }

  db.run(
    `UPDATE UserRequest SET adminResponse = ? WHERE id = ?`,
    [adminResponse, id],
    function (err) {
      if (err || this.changes === 0) {
        console.error('Error updating admin response:', err.message);
        return res.status(500).json({ error: 'Failed to update admin response' });
      }
      res.json({ message: 'Admin response updated successfully' });
    }
  );
});
app.put('/user-requests/:id/feedback', (req, res) => {
  const { id } = req.params;
  const { feedback } = req.body;

  if (!feedback) {
    return res.status(400).json({ error: 'Feedback is required' });
  }

  db.run(
    `UPDATE UserRequest SET feedback = ? WHERE id = ?`,
    [feedback, id],
    function (err) {
      if (err || this.changes === 0) {
        console.error('Error updating feedback:', err.message);
        return res.status(500).json({ error: 'Failed to update feedback' });
      }
      res.json({ message: 'Feedback added successfully' });
    }
  );
});
app.get('/user-requests', (req, res) => {
  db.all(`SELECT * FROM UserRequest ORDER BY createdAt DESC`, (err, rows) => {
    if (err) {
      console.error('Error fetching user requests:', err.message);
      return res.status(500).json({ error: 'Failed to fetch user requests' });
    }
    res.json({ userRequests: rows });
  });
});


// Start the server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));