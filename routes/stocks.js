const express = require('express');
const router = express.Router();
const database = require('../database');

// Function to calculate stock quantities
function calculateStockQuantities(callback) {
    // SQL query to update stock quantities based on invoice items
    const refreshStockQuery = `
        UPDATE stocks s
        JOIN (
            SELECT ii.item_code, SUM(ii.quantity) AS total_quantity
            FROM invoice_items ii
            GROUP BY ii.item_code
        ) AS sub
        ON s.item_code = sub.item_code
        SET s.quantity = sub.total_quantity
    `;

    // Execute the query
    database.query(refreshStockQuery, (err, result) => {
        if (err) {
            console.error('Error refreshing stock quantities:', err);
            callback(err);
            return;
        }

        console.log('Stock quantities refreshed successfully');
        callback(null);
    });
}

// Route to render the stocks page
router.get('/stocks', (req, res) => {
    // SQL query to fetch all stocks
    const query = 'SELECT * FROM stocks';

    // Execute the query to fetch stocks
    database.query(query, (err, stocks) => {
        if (err) {
            throw err;
        }

        // SQL query to fetch all items
        const query1 = 'SELECT * FROM items';

        // Execute the query to fetch items
        database.query(query1, (err, items) => {
            if (err) {
                throw err;
            }

            // Calculate stock quantities
            calculateStockQuantities((err) => {
                if (err) {
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Render stocks page with updated stock quantities
                res.render('stocks', { title: 'Stocks', stocks, items });
            });
        });
    });
});

// Route to render the add stocks page
router.get('/stocks/add', (req, res) => {
    // SQL query to fetch all items
    const itemsQuery = 'SELECT * FROM items';

    // Execute the query to fetch items
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

            // Execute the query to fetch invoice items
            database.query(invoiceItemsQuery, [lastAddedInvoice.invoice_id], (err, invoiceItems) => {
                if (err) {
                    console.error('Error fetching invoice items:', err);
                    return res.status(500).send('Internal Server Error');
                }

                // Render the add-invoice page with fetched data
                res.render('add-invoice', {
                    title: 'Add Stock',
                    items,
                    addedInvoices,
                    lastAddedInvoice,
                    invoiceItems,
                });
            });
        } else {
            // Render the add-invoice page if no last added invoice found
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

// Route to handle adding new invoice (stock)
router.post('/add-invoice', (req, res) => {
    // Log the entire req.body object
    console.log(req.body);

    // Extract data from the request body
    var invoice_id = req.body.invoice_id;
    var item_code = req.body.item_code;
    var quantity = req.body.quantity;
    var date = req.body.date;

    // Log extracted data
    console.log(invoice_id, item_code, quantity);

    // SQL query to insert new invoice into invoices table
    var query2 = `INSERT INTO invoices (invoice_id, invoice_date) VALUES (?, ?)`;

    // Execute the query to insert new invoice
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

        // SQL query to fetch description from items table based on item_code
        var descriptionQuery = `SELECT description FROM items WHERE item_code = ?`;

        // Execute the query to fetch description
        database.query(descriptionQuery, [item_code], (err, descriptionResult) => {
            if (err) {
                // Handle the error as needed
                console.error('Error fetching description from items table:', err);
                return res.status(500).send('Internal Server Error');
            }

            // Extract description from the result
            var description = descriptionResult[0].description;

            // SQL query to insert new invoice item into invoice_items table
            var invoiceItemsQuery = `INSERT INTO invoice_items (invoice_id, item_code, quantity) VALUES (?, ?, ?)`;

            // Execute the query to insert new invoice item
            database.query(invoiceItemsQuery, [invoice_id, item_code, quantity], (err, result) => {
                if (err) {
                    // Handle the error as needed
                    console.error('Error inserting data into the invoice_items table:', err);
                    return res.status(500).send('Internal Server Error');
                }

                // SQL query to insert or update stock quantity in stocks table
                var stockQuery = `INSERT INTO stocks (item_code,description, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?`;

                // Execute the query to insert or update stock quantity
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

                    // Redirect to add stocks page
                    res.redirect('/stocks/add');
                });
            });
        });
    });
});

module.exports = router;
