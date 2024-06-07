const express = require('express');
const router = express.Router();
const async = require('async');
const database = require('../database');


router.get('/alt-stock', (req, res) => {
    let query = "SELECT * FROM mathara_stocks";
    database.query(query, (err, altStocks) => {
        if (err) {
            res.redirect('/altStock');
        }
        res.render('alt-stock', { title: 'Mathara Stock', altStocks});
    });
});


router.get('/rep-stock', (req, res) => {
    let query = "SELECT * FROM rep_stocks";
    database.query(query, (err, rep_stocks) => {
        if (err) {
            res.redirect('/altStock');
        }
        res.render('rep-stock', { title: 'Rep\'s Stock', rep_stocks});
    });
});


module.exports = router;
