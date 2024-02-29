const express = require('express');
const router = express.Router();
// const database = require('../database');

router.get('/stocks', (req, res) => {
    res.render('stocks', { title: 'Stocks' });
});



module.exports = router;
