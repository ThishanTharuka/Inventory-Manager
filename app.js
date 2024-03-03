const express = require('express');
const itemRoutes = require('./routes/items');
const shopRoutes = require('./routes/shops');
const stockRoutes = require('./routes/stocks');
const invoiceRoutes = require('./routes/invoice');

//express app
const app = express();

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

// 404 page
app.use((req, res) => {
    res.status(404).render('404', { title: 'Page Not Found!' });
});