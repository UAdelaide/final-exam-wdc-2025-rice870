var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var mysql = require('mysql2/promise');

var app = express();

app.use(logger('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());

let db;

(async () => {
  try {
    // Connect to MySQL without specifying a database
    const connection = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: 'root' // Set your MySQL root password
    });

    // Create the database if it doesn't exist
    await connection.query('CREATE DATABASE IF NOT EXISTS DogWalkService');
    await connection.end();

    // Now connect to the created database
    db = await mysql.createConnection({
      host: 'localhost',
      user: 'root',
      password: '',
      database: 'testdb'
    });

    // Create a table if it doesn't exist
    await db.execute(`
      CREATE TABLE IF NOT EXISTS Users (
          user_id INT AUTO_INCREMENT PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          email VARCHAR(100) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          role ENUM('owner', 'walker') NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS Dogs (
          dog_id INT AUTO_INCREMENT PRIMARY KEY,
          owner_id INT NOT NULL,
          name VARCHAR(50) NOT NULL,
          size ENUM('small', 'medium', 'large') NOT NULL,
          FOREIGN KEY (owner_id) REFERENCES Users(user_id)
      );

      CREATE TABLE IF NOT EXISTS WalkRequests (
          request_id INT AUTO_INCREMENT PRIMARY KEY,
          dog_id INT NOT NULL,
          requested_time DATETIME NOT NULL,
          duration_minutes INT NOT NULL,
          location VARCHAR(255) NOT NULL,
          status ENUM('open', 'accepted', 'completed', 'cancelled') DEFAULT 'open',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (dog_id) REFERENCES Dogs(dog_id)
      );

      CREATE TABLE IF NOT EXISTS WalkApplications (
          application_id INT AUTO_INCREMENT PRIMARY KEY,
          request_id INT NOT NULL,
          walker_id INT NOT NULL,
          applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          status ENUM('pending', 'accepted', 'rejected') DEFAULT 'pending',
          FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
          FOREIGN KEY (walker_id) REFERENCES Users(user_id),
          CONSTRAINT unique_application UNIQUE (request_id, walker_id)
      );

      CREATE TABLE IF NOT EXISTS WalkRatings (
          rating_id INT AUTO_INCREMENT PRIMARY KEY,
          request_id INT NOT NULL,
          walker_id INT NOT NULL,
          owner_id INT NOT NULL,
          rating INT CHECK (rating BETWEEN 1 AND 5),
          comments TEXT,
          rated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (request_id) REFERENCES WalkRequests(request_id),
          FOREIGN KEY (walker_id) REFERENCES Users(user_id),
          FOREIGN KEY (owner_id) REFERENCES Users(user_id),
          CONSTRAINT unique_rating_per_walk UNIQUE (request_id)
      );
    `);

  } catch (err) {
    console.error('Error setting up database. Ensure Mysql is running: service mysql start', err);
  }
})();

// Route to return books as JSON
// app.get('/', async (req, res) => {
//   try {
//     const [books] = await db.execute('SELECT * FROM books');
//     res.json(books);
//   } catch (err) {
//     res.status(500).json({ error: 'Failed to fetch books' });
//   }
// });

app.get('/api/dogs', async (req, res) => {
  try {
    const [dogs] = await db.execute(`SELECT Dogs.name AS dog_name, Dogs.size AS size, Users.username AS owner_username FROM Dogs JOIN Users on Dogs.owner_id=Users.user_id`);
    res.json(dogs);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch dogs' });
  }
});

app.get('/api/walkrequests/open', async (req, res) => {
  try {
    const [walkreq] = await db.execute(`SELECT
      WalkRequests.request_id,
      Dogs.name AS dog_name,
      WalkRequests.requested_time,
      WalkRequests.duration_minutes,
      WalkRequests.location,
      Users.username AS owner_username

      FROM WalkRequests
      JOIN Dogs on Dogs.dog_id = WalkRequests.dog_id
      JOIN Users on Users.user_id = Dogs.owner_id

      WHERE WalkRequests.status = 'open'
      `);
    res.json(walkreq);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch walk requests' });
  }
});

app.get('/api/walkers/summary', async (req, res) => {
  try {
    const [walkers] = await db.execute(`SELECT
      Users.username AS walker_username,
      COUNT(WalkRatings.rating_id) AS total_ratings,
      AVG(WalkRatings.rating) AS average_rating,
      COUNT(DISTINCT WalkRequests.request_id) AS completed_walks,
      From Users
      LEFT JOIN WalkRequests ON WalkRequests.status = 'completed' AND EXISTS (
        SELECT 1 FROM WalkApplications WHERE
        WalkApplications.request_id = WalkRequests.request_id
        AND WalkApplications.walker_id = Users.user_id
        AND WalkApplications.status = 'accepted')
      LEFT JOIN WalkRatings ON WalkRatings.request_id = WalkRequests.request_id AND WalkRatings.walker_id = Users.user_id
      WHERE Users.role = 'walker'
      GROUP BY Users.user_id, Users.username
      `);
    res.json(walkers);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch walkers' });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

module.exports = app;