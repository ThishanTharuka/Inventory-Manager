const mysql = require('mysql');
const dotenv = require('dotenv');
const { path } = require('pdfkit');

dotenv.config({ path: './.env' });

// create connection
var connection = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE
});

connection.connect((err) => {
  if (err) {
    throw err;
  }
  console.log('Connected to database');
});

module.exports = connection;