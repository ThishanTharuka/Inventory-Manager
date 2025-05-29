const mysql = require("mysql2");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config({ path: "./.env" }); // Ensure .env is loaded for local dev

// Construct the path to ca.pem
// This assumes 'certs/ca.pem' is at the root of your deployment.
const caPath = path.join(__dirname, 'certs', 'ca.pem');

// Create a connection pool
const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  port: process.env.DB_PORT || 3306,
  ssl: {
    // Ensure caPath is valid and fs.readFileSync can access it in Vercel.
    // Consider using an environment variable for the CA content for more robustness.
    ca: fs.readFileSync(caPath)
  },
  waitForConnections: true,    // Default: true. Wait for a connection to become available from the pool.
  connectionLimit: 10,         // Default: 10. Adjust based on your Aiven plan and expected load.
  queueLimit: 0,               // Default: 0 (unlimited). Max number of connection requests to queue.
  connectTimeout: 20000,       // Increase connection timeout (e.g., 20 seconds). Default is 10000ms.
  // Recommended: Add a validation query to check connections before use
  // typeCast: function (field, next) {
  //   if (field.type == 'TINY' && field.length == 1) {
  //     return (field.string() == '1'); // 1 = true, 0 = false
  //   }
  //   return next();
  // }
});

// Optional: Listen for acquisition and release events for debugging
// pool.on('acquire', function (connection) {
//   console.log('Connection %d acquired', connection.threadId);
// });
// pool.on('release', function (connection) {
//   console.log('Connection %d released', connection.threadId);
// });

// Test the pool connection (optional, but helpful for initial setup)
// pool.getConnection((err, connection) => {
//   if (err) {
//     console.error("❌ Failed to get connection from pool:", err.message);
//     if (err.code === 'PROTOCOL_CONNECTION_LOST') {
//       console.error('Database connection was closed.');
//     }
//     if (err.code === 'ER_CON_COUNT_ERROR') {
//       console.error('Database has too many connections.');
//     }
//     if (err.code === 'ECONNREFUSED') {
//       console.error('Database connection was refused.');
//     }
//     return;
//   }
//   console.log("✅ Successfully connected to database using pool.");
//   connection.release(); // Release the connection back to the pool
// });

// Export the promise-based version of the pool for use with async/await in routes
module.exports = pool.promise();