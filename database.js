const mysql = require("mysql2");
const dotenv = require("dotenv");
const { path } = require("pdfkit");
const fs = require("fs");

dotenv.config({ path: "./.env" });

// create connection
var connection = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  port: process.env.DB_PORT || 3306, // Default MySQL port is 3306
  ssl: {
    ca: fs.readFileSync('./certs/ca.pem') // or false for local dev
  }
});

connection.connect((err) => {
  if (err) {
    console.error("❌ Failed to connect to database:", err.message);
    return;
  }
  console.log("✅ Connected to Aiven MySQL database");
});

module.exports = connection;
