const express = require('express');
const router = express.Router();
const async = require('async');
const database = require('../database');


router.get('/alt-stock', (req, res) => {
    let query = "SELECT * FROM stocks";
    database.query(query, (err, result) => {
        if (err) {
            res.redirect('/altStock');
        }
        res.render('alt-stock', { title: 'Mathara Stock', altStock: result });
    });
});


module.exports = router;
