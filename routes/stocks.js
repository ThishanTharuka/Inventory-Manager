const express = require('express');
const router = express.Router();
const database = require('../database');

router.get('/stocks', (req, res) => {
    const query = 'SELECT * FROM stocks';

    database.query(query, (err, stocks) => {
        if (err) {
            throw err;
        }

        const query1 = 'SELECT * FROM items';

        database.query(query1, (err, items) => {
            if (err) {
                throw err;
            }
            res.render('stocks', { title: 'Stocks', stocks, items });
        });
    });
});

router.get('/stocks/add', (req, res) => {
    // Fetch items from the database to populate the dropdown
    const itemsQuery = 'SELECT * FROM items';

    database.query(itemsQuery, (err, items) => {
        if (err) {
            throw err;
        }

        // Retrieve the added invoices from the session
        const addedInvoices = req.session.addedInvoices || [];

        // Retrieve the last added invoice from the session
        const lastAddedInvoice = addedInvoices.length > 0 ? addedInvoices[addedInvoices.length - 1] : null;

        // Fetch details of items in the last added invoice
        if (lastAddedInvoice) {
            const invoiceItemsQuery = `SELECT ii.item_code, i.description, ii.quantity
                                       FROM invoice_items ii
                                       JOIN items i ON ii.item_code = i.item_code
                                       WHERE ii.invoice_id = ?`;

            database.query(invoiceItemsQuery, [lastAddedInvoice.invoice_id], (err, invoiceItems) => {
                if (err) {
                    console.error('Error fetching invoice items:', err);
                    return res.status(500).send('Internal Server Error');
                }

                res.render('add-invoice', {
                    title: 'Add Stock',
                    items,
                    addedInvoices,
                    lastAddedInvoice,
                    invoiceItems,
                });
            });
        } else {
            res.render('add-invoice', {
                title: 'Add Stock',
                items,
                addedInvoices,
                lastAddedInvoice,
                invoiceItems: [], // Set an empty array if no last added invoice
            });
        }
    });
});



router.post('/add-invoice', (req, res) => {
    console.log(req.body);  // Log the entire req.body object

    var invoice_id = req.body.invoice_id;
    var item_code = req.body.item_code;
    var quantity = req.body.quantity;
    var date = req.body.date;

    console.log(invoice_id, item_code, quantity);

    var query2 = `INSERT INTO invoices (invoice_id, invoice_date) VALUES (?, ?)`;

    database.query(query2, [invoice_id, date], (err, result) => {
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

        // Fetch description from items table based on item_code
        var descriptionQuery = `SELECT description FROM items WHERE item_code = ?`;

        database.query(descriptionQuery, [item_code], (err, descriptionResult) => {
            if (err) {
                // Handle the error as needed
                console.error('Error fetching description from items table:', err);
                return res.status(500).send('Internal Server Error');
            }

            // Extract description from the result
            var description = descriptionResult[0].description;

            // Now that the invoice is inserted, use the generated invoice_id for the invoice_items table
            var invoiceItemsQuery = `INSERT INTO invoice_items (invoice_id, item_code, quantity) VALUES (?, ?, ?)`;

            database.query(invoiceItemsQuery, [invoice_id, item_code, quantity], (err, result) => {
                if (err) {
                    // Handle the error as needed
                    console.error('Error inserting data into the invoice_items table:', err);
                    return res.status(500).send('Internal Server Error');
                }

                // Insert data into the stocks table with the fetched description
                var stockQuery = `INSERT INTO stocks (item_code,description, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?`;

                database.query(stockQuery, [item_code, description, quantity, quantity], (err, result) => {
                    if (err) {
                        // Handle the error as needed
                        console.error('Error inserting data into the stocks table:', err);
                        return res.status(500).send('Internal Server Error');
                    }

                    console.log('Item has been added to the database');

                    // Add the current invoice to the session
                    const addedInvoices = req.session.addedInvoices || [];
                    addedInvoices.push({ invoice_id, date });

                    // Update the session with the added invoices
                    req.session.addedInvoices = addedInvoices;

                    res.redirect('/stocks/add');
                });
            });
        });
    });
});

module.exports = router;
