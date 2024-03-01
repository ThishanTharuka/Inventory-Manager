const express = require('express');
const router = express.Router();
const database = require('../database');

router.get('/stocks', (req, res) => {
    const query = 'SELECT * FROM invoice_items';
    
    database.query(query, (err, invoice_items) => {
        if (err) {
            throw err;
        }
        res.render('stocks', { title: 'Stocks', invoice_items });
    });
});

router.get('/stocks/add', (req, res) => {
    // Fetch items from the database to populate the dropdown
    const itemsQuery = 'SELECT * FROM items';

    database.query(itemsQuery, (err, items) => {
        if (err) {
            throw err;
        }
        res.render('add-invoice', { title: 'Add Stock', items });
    });
});

router.post('/add-invoice', (req, res) => {
    console.log(req.body);  // Log the entire req.body object

    var invoice_id = req.body.invoice_id;
    var item_code = req.body.item_code;
    var quantity = req.body.quantity;
    var date = req.body.date;

    console.log(invoice_id, item_code, quantity);

    // var query = `INSERT INTO invoice_items (invoice_id, item_code, quantity) VALUES ("${invoice_id}", "${item_code}", "${quantity}")`;
    var query2 = `INSERT INTO invoices (invoice_id, invoice_date) VALUES ("${invoice_id}", "${date}")`;
    
    database.query(query2, (err, result) => {
        if (err) {
            // Check for duplicate key error
            if (err.code === 'ER_DUP_ENTRY') {
                console.log('Duplicate entry for invoice_id and item_code');
                // You can choose to render an error page or send a specific message
            } else {
                // For other errors, log and throw
                throw err;
            }
        }
        // Now that the invoice is inserted, use the generated invoice_id for the invoice_items table
        var invoiceItemsQuery = `INSERT INTO invoice_items (invoice_id, item_code, quantity) VALUES ("${invoice_id}", "${item_code}", "${quantity}")`;

        database.query(invoiceItemsQuery, (err, result) => {
            if (err) {
                // Handle the error as needed
                console.error('Error inserting data into the invoice_items table:', err);
                return res.status(500).send('Internal Server Error');
            }

            console.log('Item has been added to the database');
            res.redirect('/stocks');
        });
    });
});

module.exports = router;