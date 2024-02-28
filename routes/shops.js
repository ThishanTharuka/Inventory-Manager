const express = require('express');
const router = express.Router();

router.get('/shops', (req, res) => {
    res.render('shops', { title: 'Shops' });
});

router.get('/shops/add', (req, res) => {
    res.render('add-shop', { title: 'Add SHop', mode: 'add' });
});

module.exports = router;