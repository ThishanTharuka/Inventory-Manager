const express = require('express');
const router = express.Router();
const database = require('../database');

router.get('/shops', (req, res) => {
    // Fetch shops from the database
    const query = 'SELECT * FROM shops';

    database.query(query, (err, shops) => {
        if (err) {
            throw err;
        }

        // Render the 'shops' page with the fetched shops
        res.render('shops', { title: 'Shops', shops });
    });
});

router.get('/shops/add', (req, res) => {
    res.render('add-shop', { title: 'Add Shop', mode: 'add' });
});

router.post('/add-shop', (req, res) => {
    const { shop_id, shop_name, owner, location } = req.body;

    const query = `INSERT INTO shops (shop_id, shop_name, owner, location) 
                   VALUES (?, ?, ?, ?)`;

    const values = [shop_id, shop_name, owner, location];

    database.query(query, values, (err, result) => {
        if (err) {
            // Check for duplicate key error
            if (err.code === 'ER_DUP_ENTRY') {
                console.log('Duplicate entry for shop_id');
                // You can choose to render an error page or send a specific message
                return res.send('<script>alert("This Shop ID already exists!"); window.location="/shops/add";</script>');
            } else {
                // For other errors, log and throw
                throw err;
            }
        }
        console.log('Shop has been added to the database');
        res.redirect('/shops');
    });
});

router.get('/shops/delete/:shop_id', (req, res) => {
    const shop_id = req.params.shop_id;

    const query = `DELETE FROM shops WHERE shop_id = ?`;

    database.query(query, [shop_id], (err, result) => {
        if (err) throw err;

        console.log(`Deleted shop with shop_id: ${shop_id}`);
        res.redirect('/shops');
    });
});

router.get('/shops/edit/:shop_id', (req, res) => {
    const shop_id = req.params.shop_id;

    // Fetch the shop from the database using the shop_id
    const query = `SELECT * FROM shops WHERE shop_id = ?`;

    database.query(query, [shop_id], (err, shop) => {
        if (err) throw err;

        // Render the 'add-shop' page with the fetched shop
        res.render('add-shop', { title: 'Edit Shop', shop: shop[0], mode: 'edit' });
    });

});

router.post('/update-shop', (req, res) => {
    // Extract updated values from req.body
    const shop_id = req.body.shop_id;
    const shop_name = req.body.shop_name;
    const owner = req.body.owner;
    const location = req.body.location;

    // Update the shop in the database
    const query = `
        UPDATE shops 
        SET shop_name = ?, owner = ?, location = ? 
        WHERE shop_id = ?`;

    const values = [shop_name, owner, location, shop_id];

    database.query(query, values, (err, result) => {
        if (err) {
            console.error('Error updating shop:', err);
            // Handle the error, you might want to redirect to an error page or send an error response
            return res.status(500).send('Internal Server Error');
        }

        console.log(`Shop with shop_id ${shop_id} has been successfully updated`);
        // Redirect to the shops page or handle as needed
        res.redirect('/shops');
    });
});

module.exports = router;