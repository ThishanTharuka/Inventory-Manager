const express = require('express');
const router = express.Router();
const async = require('async');
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

        // Remove entries from stocks table where quantity is 0
        const removeZeroQuantityQuery = `DELETE FROM stocks WHERE quantity = 0`;

        // Execute the query
        database.query(removeZeroQuantityQuery, (err, result) => {
            if (err) {
                console.error('Error removing entries with zero quantity:', err);
                callback(err);
                return;
            }

            console.log('Entries with zero quantity removed successfully');
            callback(null);
        });
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
    // Extract data from the request body
    var invoice_id = req.body.invoice_id;
    var date = req.body.date;

    // Create an array to store all items data
    var itemsData = [];

    // Iterate through the submitted items and quantities
    for (let i = 0; i < req.body.item_codes.length; i++) {
        var item_code = req.body.item_codes[i];
        var quantity = req.body.quantities[i];

        // Push item data to the array
        itemsData.push([invoice_id, item_code, quantity]);
    }

    // Start a database transaction
    database.beginTransaction(err => {
        if (err) {
            console.error('Error starting transaction:', err);
            return res.status(500).send('Internal Server Error');
        }

        // SQL query to insert new invoice into invoices table
        var queryInsertInvoice = `INSERT INTO invoices (invoice_id, invoice_date) VALUES (?, ?)`;

        // Execute the query to insert new invoice
        database.query(queryInsertInvoice, [invoice_id, date], (err, result) => {
            if (err) {
                console.error('Error inserting invoice:', err);
                // Rollback the transaction
                database.rollback(() => {
                    console.error('Transaction rolled back due to error');
                    return res.status(500).send('Internal Server Error');
                });
            }

            // SQL query to insert new invoice items into invoice_items table
            var queryInsertInvoiceItems = `INSERT INTO invoice_items (invoice_id, item_code, quantity) VALUES ?`;

            // Execute the query to insert new invoice items
            database.query(queryInsertInvoiceItems, [itemsData], (err, result) => {
                if (err) {
                    console.error('Error inserting invoice items:', err);
                    // Rollback the transaction
                    database.rollback(() => {
                        console.error('Transaction rolled back due to error');
                        return res.status(500).send('Internal Server Error');
                    });
                }

                // Update stock quantities based on the invoice items
                updateStockQuantities(itemsData, () => {
                    // Commit the transaction
                    database.commit(err => {
                        if (err) {
                            console.error('Error committing transaction:', err);
                            // Rollback the transaction
                            database.rollback(() => {
                                console.error('Transaction rolled back due to error');
                                return res.status(500).send('Internal Server Error');
                            });
                        }

                        console.log('Transaction committed successfully');
                        // Redirect to add stocks page
                        res.redirect('/stocks/add');
                    });
                });
            });
        });
    });
});

// Function to update stock quantities based on invoice items
function updateStockQuantities(itemsData, callback) {
    // Create an object to store item codes, quantities, and descriptions
    var itemDetails = {};

    // Iterate through the items data to gather quantities and descriptions
    async.each(itemsData, (item, next) => {
        var item_code = item[1];
        var quantity = item[2];

        // Fetch description for the item code
        database.query('SELECT description FROM items WHERE item_code = ?', [item_code], (err, rows) => {
            if (err) {
                console.error('Error fetching item description:', err);
                return next(err);
            }

            // Add item details to the object
            itemDetails[item_code] = {
                quantity: quantity,
                description: rows[0].description
            };

            next();
        });
    }, err => {
        if (err) {
            console.error('Error gathering item details:', err);
            return callback(err);
        }

        // SQL query to update stock quantities based on the gathered details
        var updateStockQuery = 'INSERT INTO stocks (item_code, description, quantity) VALUES ';
        var updateStockValues = [];

        Object.entries(itemDetails).forEach(([item_code, details]) => {
            updateStockQuery += '(?, ?, ?), ';
            updateStockValues.push(item_code, details.description, details.quantity);
        });

        // Remove the trailing comma and space
        updateStockQuery = updateStockQuery.slice(0, -2);

        // Add ON DUPLICATE KEY UPDATE clause to handle existing entries
        updateStockQuery += ' ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)';

        // Execute the query to update stock quantities
        database.query(updateStockQuery, updateStockValues, (err, result) => {
            if (err) {
                console.error('Error updating stock quantities:', err);
                return callback(err);
            }

            console.log('Stock quantities updated successfully');
            callback(null);
        });
    });
}




module.exports = router;
