const express = require('express');
const router = express.Router();
const db = require('../models/db');


// GET all users (for admin/testing)
router.get('/', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT user_id, username, email, role FROM Users');
    res.json(rows);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch users' });
  }
});

// POST a new user (simple signup)
router.post('/register', async (req, res) => {
  const { username, email, password, role } = req.body;

  try {
    const [result] = await db.query(`
      INSERT INTO Users (username, email, password_hash, role)
      VALUES (?, ?, ?, ?)
    `, [username, email, password, role]);

    res.status(201).json({ message: 'User registered', user_id: result.insertId });
  } catch (error) {
    res.status(500).json({ error: 'Registration failed' });
  }
});

router.get('/me', (req, res) => {
  if (!req.session.user) {
    return res.status(401).json({ error: 'Not logged in' });
  }
  res.json(req.session.user);
});

// POST login (smarty version)
router.post('/login', async (req, res) => {
  const { username, password } = req.body;

  try {
    const [rows] = await db.query(`
      SELECT user_id, username, role FROM Users
      WHERE username = ? AND password_hash = ?
    `, [username, password]);

    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    user = rows[0]

    // user's session has id, name, role
    res.session.user = {
      id: user.user_id,
      username: user.username,
      role: user.role
    }

    if (user.role === 'owner') {
      res.redirect('/owner-dashboard.html')
    } else if (user.role === 'walker'){
      res.redirect('/walker-dashboard.html')
    }

  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

router.post('/logout', async (req, res) => {

  // default handling in case session never began
  req.session.destroy(err => {
    if (err) {
      return res.status(500).send('logout FAIL');
    }
  })
  res.clearCookie('connect.sid');
  res.redirect('/index.html');
});

router.get('/doglist', async (req, res) => {

  try{
    if (!req.session.user.id){
      res.send(401).json({error: "User not logged in"})
    }
    const user_id = req.session.user.id;
    const [dogs] = db.run(`SELECT name FROM Dogs WHERE owner_id = ?`, [user_id]);
    res.json(dogs);
  } catch (err) {
    res.status(500).json({error: "Failed dog fetch!"})
  }


})

module.exports = router;