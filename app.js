const express = require('express');
const database = require('./database');

//express app
const app = express();

//register view engine
app.set('view engine', 'ejs');

//static files
app.use(express.static('public'));

//listen for requests
app.listen(3000);

//routes
app.get('/', (req, res) => {
    res.render('index', {title: 'Home'});
});

app.get('/add-item', (req, res) => {
    res.render('add-item', {title: 'Add Item'});
});

app.get('/items', (req, res) => {
    res.render('items', {title: 'Items'});
});

app.use((req, res) => {
    res.status(404).render('404', {title: 'Page Not Found!'});
});