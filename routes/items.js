const express = require('express');
const router = express.Router();
const database = require('../database');


router.get('/items', (req, res) => {
    // Fetch items from the database
    const query = 'SELECT * FROM items';

    database.query(query, (err, items) => {
        if (err) {
            throw err;
        }

        // Render the 'items' page with the fetched items
        res.render('items', { title: 'Items', items, searchTerm: ''  });
    });
});

router.get('/items/add', (req, res) => {
    res.render('add-item', { title: 'Add Item', mode: 'add' });
});


router.post('/add-item', (req, res) => {
    console.log(req.body);  // Log the entire req.body object

    var item_code = req.body.item_code;
    var description = req.body.description;
    var unit = req.body.unit;
    var price = req.body.price;

    console.log(item_code, description, unit, price);

    var query = `INSERT INTO items (item_code, description, unit, price) VALUES (?, ?, ?, ?)`;
    var values = [item_code, description, unit, price];

    database.query(query, values, (err, result) => {
        if (err) {
            // Check for duplicate key error
            if (err.code === 'ER_DUP_ENTRY') {
                console.log('Duplicate entry for item_code');
                // You can choose to render an error page or send a specific message
                return res.send('<script>alert("This Item code already exists!"); window.location="/items/add";</script>');
            } else {
                // For other errors, log and throw
                throw err;
            }
        }
        console.log('Item has been added to the database');
        res.redirect('/items');
    });
});


router.get('/items/delete/:item_code', (req, res) => {
    const item_code = req.params.item_code;

    const query = `DELETE FROM items WHERE item_code = "${item_code}"`;

    database.query(query, (err, result) => {
        if (err) throw err;

        console.log(`Deleted item with item_code: ${item_code}`);
        res.redirect('/items');
    });
});

router.get('/items/edit/:item_code', (req, res) => {
    const itemCode = req.params.item_code;

    // Fetch the item from the database using the itemCode
    const query = `SELECT * FROM items WHERE item_code = '${itemCode}'`;

    database.query(query, (err, item) => {
        if (err) throw err;

        // Render the 'edit-item' page with the fetched item
        res.render('add-item', { title: 'Edit Item', item: item[0], mode: 'edit' });
    });

});

router.post('/update-item', (req, res) => {

    // Extract updated values from req.body
    const item_code = req.body.item_code;
    const updatedDescription = req.body.description;
    const updatedUnit = req.body.unit;
    const updatedPrice = req.body.price;

    // Update the item in the database
    const query = `
        UPDATE items 
        SET description = ?, unit = ?, price = ? 
        WHERE item_code = ?`;

    const values = [updatedDescription, updatedUnit, updatedPrice, item_code];

    database.query(query, values, (err, result) => {
        if (err) {
            console.error('Error updating item:', err);
            // Handle the error, you might want to redirect to an error page or send an error response
            return res.status(500).send('Internal Server Error');
        }

        console.log(`Item with item_code ${item_code} has been successfully updated`);
        // Redirect to the items page or handle as needed
        res.redirect('/items');
    });
});

// New route for search functionality
router.get('/items/search', (req, res) => {
    const searchTerm = req.query.query;
    const query = `
        SELECT * FROM items 
        WHERE item_code LIKE ? OR description LIKE ?`;
    const values = [`%${searchTerm}%`, `%${searchTerm}%`];

    database.query(query, values, (err, items) => {
        if (err) {
            console.error('Error searching items:', err);
            return res.status(500).send('Internal Server Error');
        }
        res.render('items', { title: 'Items', items, searchTerm });
    });
});

module.exports = router;