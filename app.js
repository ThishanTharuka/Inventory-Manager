const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const flash = require('connect-flash');
const itemRoutes = require('./routes/items');
const shopRoutes = require('./routes/shops');
const stockRoutes = require('./routes/stocks');
const invoiceRoutes = require('./routes/invoice');
const orderRoutes = require('./routes/orders');
const compareRoutes = require('./routes/compare');
const altStockRoutes = require('./routes/altStock');
const repOrders = require('./routes/repOrders');
const repInvoices = require('./routes/repInvoices');

//express app
const app = express();

// configure cookie-parser middleware
app.use(cookieParser('SecretStringForCookies'));

// configure express-session middleware
app.use(session({
    secret: 'QWERtyui1234', // Replace with a strong, random string
    cookie: {maxAge: 6000},
    resave: false,
    saveUninitialized: false,
}));

// configure connect-flash middleware
app.use(flash());

//register view engine
app.set('view engine', 'ejs');

//static files
app.use(express.static('public'));
app.use(express.urlencoded({ extended: true }));

//listen for requests
app.listen(3000);

//routes
app.get('/', (req, res) => {
    res.render('index', { title: 'Home' });
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
    res.status(404).render('404', { title: 'Page Not Found!' });
});