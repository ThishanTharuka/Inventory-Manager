const mysql = require("mysql2/promise");
const dotenv = require("dotenv");
const path = require("path");
const fs = require("fs");

dotenv.config({ path: "./.env" });

// SSL configuration based on environment
const getSSLConfig = () => {
  if (process.env.NODE_ENV === 'production') {
    // For Vercel deployment - disable SSL verification
    return { rejectUnauthorized: false };
  } else {
    // For local development - use certificate if available
    try {
      const caPath = path.join(__dirname, 'certs', 'ca.pem');
      if (fs.existsSync(caPath)) {
        return { ca: fs.readFileSync(caPath) };
      }
    } catch (error) {
      console.log("SSL certificate not found, using default SSL config");
    }
    return { rejectUnauthorized: false };
  }
};

// Create connection pool for better serverless performance
const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.USER,
  password: process.env.PASSWORD,
  database: process.env.DATABASE,
  port: process.env.DB_PORT || 3306,
  ssl: getSSLConfig(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  multipleStatements: false
});

// Enhanced connection wrapper with retry logic
const executeQuery = async (query, params = []) => {
  let retries = 3;
  while (retries > 0) {
    try {
      const [results] = await pool.execute(query, params);
      return results;
    } catch (error) {
      console.error(`Database query failed, retries left: ${retries - 1}`, error.message);
      retries--;
      if (retries === 0) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
};

// For backward compatibility with existing code
const legacyConnection = {
  query: (sql, params, callback) => {
    if (typeof params === 'function') {
      callback = params;
      params = [];
    }
    
    executeQuery(sql, params)
      .then(results => callback(null, results))
      .catch(error => callback(error));
  },
  
  beginTransaction: (callback) => {
    pool.getConnection()
      .then(connection => {
        connection.beginTransaction()
          .then(() => callback(null, connection))
          .catch(callback);
      })
      .catch(callback);
  },
  
  rollback: (connection, callback) => {
    if (typeof connection === 'function') {
      callback = connection;
      callback();
      return;
    }
    connection.rollback(() => {
      connection.release();
      if (callback) callback();
    });
  },
  
  commit: (connection, callback) => {
    connection.commit()
      .then(() => {
        connection.release();
        if (callback) callback(null);
      })
      .catch(error => {
        connection.rollback(() => {
          connection.release();
          if (callback) callback(error);
        });
      });
  }
};

// Test connection on startup (optional)
if (process.env.NODE_ENV !== 'production') {
  executeQuery('SELECT 1')
    .then(() => console.log("✅ Connected to Aiven MySQL database"))
    .catch(err => console.error("❌ Failed to connect to database:", err.message));
}

module.exports = legacyConnection;
