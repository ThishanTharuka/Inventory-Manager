const mysql = require("mysql2");
const dotenv = require("dotenv");
const { path } = require("pdfkit");
const fs = require("fs");

dotenv.config({ path: "./.env" });

// Construct the path to ca.pem relative to the project root
// Assuming 'certs' directory is at the root of your project.
// __dirname would be /var/task/ if database.js is at the root.
// If database.js is in a subdirectory, adjust accordingly or use a path known to be the project root.
// For a file at the project root, './certs/ca.pem' is often sufficient.
// Using path.join(process.cwd(), 'certs', 'ca.pem') is also an option if cwd() is reliable.
// A common approach if database.js is at the project root:
const caPath = path.join(__dirname, 'certs', 'ca.pem');
// Or, if you are certain database.js is at the root and certs is a direct subdirectory:
// const caPath = './certs/ca.pem';

// create connection
var connection = mysql.createConnection({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  port: process.env.DB_PORT || 3306, // Default MySQL port is 3306
  ssl: {
    ca: fs.readFileSync(caPath) // Corrected path
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
