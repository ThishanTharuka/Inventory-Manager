const express = require('express');
const itemRoutes = require('./routes/items');

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
    res.render('index', {title: 'Home'});
});

app.use(itemRoutes);

// 404 page
app.use((req, res) => {
    res.status(404).render('404', {title: 'Page Not Found!'});
});