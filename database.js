const mysql = require('mysql');

// create connection
var connection = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '', //enter your MySQL password here
  database: 'inventory1'
});

connection.connect((err) => {
  if (err) {
    throw err;
  }
  console.log('Connected to database');
});

module.exports = connection;