/**************************************************************************
 * Inventory Manager Application
 * Author: Thishan Perera
 * Date: May 31, 2025
 * Description: Main application file for the Inventory Manager system.
 *              Sets up middleware, routes, and server configuration.
 **************************************************************************/

// ===========================
// Import Dependencies
// ===========================
const express = require("express");
const path = require("path");
const session = require("cookie-session");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");

// ===========================
// Import Route Handlers
// ===========================
const itemRoutes = require("./routes/items");
const shopRoutes = require("./routes/shops");
const stockRoutes = require("./routes/stocks");
const invoiceRoutes = require("./routes/invoice");
const orderRoutes = require("./routes/orders");
const compareRoutes = require("./routes/compare");
const altStockRoutes = require("./routes/altStock");
const repOrders = require("./routes/repOrders");
const repInvoices = require("./routes/repInvoices");
const authRoutes = require("./routes/auth");

// ===========================
// Import Middleware
// ===========================
const authMiddleware = require("./middleware/auth");

// ===========================
// Initialize Express App
// ===========================
const app = express();

// ===========================
// View Engine Configuration
// ===========================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views")); // Views directory

// ===========================
// Middleware Configuration
// ===========================

// Cookie parser middleware
app.use(
  cookieParser(process.env.COOKIE_PARSER_SECRET || "SecretStringForCookies")
);

// Session middleware
app.use(
  session({
    name: "sessionId", // Custom cookie name
    secret: process.env.SESSION_SECRET || "QWERtyui1234", // Secret for signing cookies
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      secure: process.env.NODE_ENV === "production", // HTTPS only in production
      httpOnly: true, // Prevent client-side JS access
      sameSite: "lax", // CSRF protection
    },
  })
);

// Flash middleware for temporary messages
app.use(flash());

// Static files middleware
app.use(express.static(__dirname + "/public/"));

// URL-encoded form data middleware
app.use(express.urlencoded({ extended: true }));

// ===========================
// Routes Configuration
// ===========================

// Home route with authentication middleware
app.get("/", authMiddleware, (req, res) => {
  res.render("index", { title: "Home" });
});

// Register application routes
app.use(itemRoutes);
app.use(shopRoutes);
app.use(stockRoutes);
app.use(invoiceRoutes);
app.use(orderRoutes);
app.use(compareRoutes);
app.use(altStockRoutes);
app.use(repOrders);
app.use(repInvoices);
app.use(authRoutes); // Authentication routes
app.use(authMiddleware); // Apply authentication middleware globally after auth routes

// ===========================
// Error Handling
// ===========================

// 404 error handling
app.use((req, res) => {
  res.status(404).render("404", { title: "Page Not Found!" });
});

// ===========================
// Server Configuration
// ===========================

// Start the server (development mode)
if (process.env.NODE_ENV !== "production") {
  app.listen(3000, () => {
    console.log("Server running on http://localhost:3000");
  });
}

// ===========================
// Export Application
// ===========================
module.exports = app;