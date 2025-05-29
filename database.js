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
  ssl: process.env.DB_SSL_CA
    ? { ca: process.env.DB_SSL_CA.replace(/\\n/g, '\n') } // Use CA cert from env var, ensure newlines are handled
    : undefined, // Set to undefined or false if DB_SSL_CA is not set (e.g., for local dev without SSL)
});

connection.connect((err) => {
  if (err) {
    console.error("❌ Failed to connect to database:", err.message);
    return;
  }
  console.log("✅ Connected to Aiven MySQL database");
});

module.exports = connection;
