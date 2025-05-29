const express = require("express");
const path = require("path"); // Make sure path is required
const session = require("cookie-session");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");

const itemRoutes = require("./routes/items");
const shopRoutes = require("./routes/shops");
const stockRoutes = require("./routes/stocks");
const invoiceRoutes = require("./routes/invoice");
const orderRoutes = require("./routes/orders");
const compareRoutes = require("./routes/compare");
const altStockRoutes = require("./routes/altStock");
const repOrders = require("./routes/repOrders");
const repInvoices = require("./routes/repInvoices");

//express app
const app = express();
app.set("views", path.join(__dirname, "views")); // Set the views directory to the 'views' folder in the current directory

// configure cookie-parser middleware
app.use(
  cookieParser(process.env.COOKIE_PARSER_SECRET || "SecretStringForCookies")
);

// configure express-session middleware
app.use(
  session({
    name: "sessionId", // Optional: custom cookie name
    secret: process.env.SESSION_SECRET || "QWERtyui1234", // Use environment variable
    // resave: false, // Not used by cookie-session
    // saveUninitialized: false, // Not used by cookie-session
    cookie: {
      maxAge: 24 * 60 * 60 * 1000, // e.g., 24 hours
      secure: process.env.NODE_ENV === "production", // Send only over HTTPS in production
      httpOnly: true, // Prevent client-side JS access
      sameSite: "lax", // Or 'strict' depending on your needs
    },
  })
);

// configure connect-flash middleware
app.use(flash());

//register view engine
app.set("view engine", "ejs");

//static files
app.use(express.static(__dirname + "/public/"));
app.use(express.urlencoded({ extended: true }));

//listen for requests
app.listen(3000);

//routes
app.get("/", (req, res) => {
  res.render("index", { title: "Home" });
});

app.use(itemRoutes);
app.use(shopRoutes);
app.use(stockRoutes);
app.use(invoiceRoutes);
app.use(orderRoutes);
app.use(compareRoutes);
app.use(altStockRoutes);
app.use(repOrders);
app.use(repInvoices);

// 404 page
app.use((req, res) => {
  res.status(404).render("404", { title: "Page Not Found!" });
});
