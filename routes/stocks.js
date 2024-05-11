const express = require('express');
const router = express.Router();
const async = require('async');
const database = require('../database');

// Function to calculate stock quantities
function calculateStockQuantities(callback) {
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
            console.error('Error fetching items:', err);
            return res.status(500).send('Internal Server Error');
        }

        // Render the add-invoice page with fetched items
        res.render('add-invoice', { title: 'Add Stock', items });
    });
});


// Route to handle adding new invoice (stock)
router.post('/add-invoice', (req, res) => {
    // Extract data from the request body
    const invoiceId = req.body.invoice_id;
    const date = req.body.date;
    const itemCodes = req.body.item_codes;
    const quantities = req.body.quantities;

    // Check if the invoice ID already exists in the database
    const checkInvoiceQuery = 'SELECT COUNT(*) AS count FROM invoices WHERE invoice_id = ?';
    database.query(checkInvoiceQuery, [invoiceId], (err, result) => {
        if (err) {
            console.error('Error checking invoice existence:', err);
            return res.status(500).send('Internal Server Error');
        }

        if (result[0].count > 0) {
            // Invoice ID already exists, send a response indicating the conflict
            return res.status(409).send('Invoice ID already exists');
        }

        // Create an array to store all items data
        const itemsData = [];

        // Iterate through the submitted items and quantities
        for (let i = 0; i < itemCodes.length; i++) {
            const itemCode = itemCodes[i];
            const quantity = quantities[i];

            // Push item data to the array
            itemsData.push([invoiceId, itemCode, quantity]);
        }

        // Calculate extension for each item
        const extensionPromises = itemsData.map(item => {
            return new Promise((resolve, reject) => {
                const getItemQuery = 'SELECT price FROM items WHERE item_code = ?';
                database.query(getItemQuery, [item[1]], (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        const price = result[0].price;
                        const extension = price * item[2];
                        resolve({ pricePerItem: price, extension: extension });
                    }
                });
            });
        });

        Promise.all(extensionPromises)
            .then(extensions => {
                // Calculate total extension for the invoice
                const totalExtension = extensions.reduce((acc, ext) => acc + ext.extension, 0);

                // Start a database transaction
                database.beginTransaction(err => {
                    if (err) {
                        console.error('Error starting transaction:', err);
                        return res.status(500).send('Internal Server Error');
                    }

                    // SQL query to insert new invoice into invoices table
                    const queryInsertInvoice = `INSERT INTO invoices (invoice_id, invoice_date, total) VALUES (?, ?, ?)`;

                    // Execute the query to insert new invoice
                    database.query(queryInsertInvoice, [invoiceId, date, totalExtension], (err, result) => {
                        if (err) {
                            console.error('Error inserting invoice:', err);
                            // Rollback the transaction
                            database.rollback(() => {
                                console.error('Transaction rolled back due to error');
                                return res.status(500).send('Internal Server Error');
                            });
                        }

                        // SQL query to insert new invoice items into invoice_items table
                        const queryInsertInvoiceItems = `INSERT INTO invoice_items (invoice_id, item_code, quantity, price_per_item, extention) VALUES ?`;

                        // Create an array to store all items data including extension and price_per_item
                        const itemsDataWithExtension = itemsData.map((item, index) => [
                            item[0],
                            item[1],
                            item[2],
                            extensions[index].pricePerItem, // Add price_per_item
                            extensions[index].extension,
                        ]);

                        // Execute the query to insert new invoice items
                        database.query(queryInsertInvoiceItems, [itemsDataWithExtension], (err, result) => {
                            if (err) {
                                console.error('Error inserting invoice items:', err);
                                // Rollback the transaction
                                database.rollback(() => {
                                    console.error('Transaction rolled back due to error');
                                    return res.status(500).send('Internal Server Error');
                                });
                            }

                            // Update stock quantities based on the invoice items within the transaction
                            updateStockQuantitiesInTransaction(database, itemsData, err => {
                                if (err) {
                                    // Rollback the transaction
                                    database.rollback(() => {
                                        console.error('Transaction rolled back due to error in updating stock quantities');
                                        return res.status(500).send('Internal Server Error');
                                    });
                                }

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
            })
            .catch(error => {
                console.error('Error calculating extensions:', error);
                res.status(500).send('Internal Server Error');
            });
    });
});






// Function to update stock quantities based on invoice items within a transaction
function updateStockQuantitiesInTransaction(connection, itemsData, callback) {
    // Create an object to store item codes, quantities, and descriptions
    const itemDetails = {};

    // Iterate through the items data to gather quantities and descriptions
    async.each(itemsData, (item, next) => {
        const itemCode = item[1];
        const quantity = item[2];

        // Fetch description for the item code
        database.query('SELECT description FROM items WHERE item_code = ?', [itemCode], (err, rows) => {
            if (err) {
                console.error('Error fetching item description:', err);
                return next(err);
            }

            // Add item details to the object
            itemDetails[itemCode] = {
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
        let updateStockQuery = 'INSERT INTO stocks (item_code, description, quantity) VALUES ';
        const updateStockValues = [];

        Object.entries(itemDetails).forEach(([itemCode, details]) => {
            updateStockQuery += '(?, ?, ?), ';
            updateStockValues.push(itemCode, details.description, details.quantity);
        });

        // Remove the trailing comma and space
        updateStockQuery = updateStockQuery.slice(0, -2);

        // Add ON DUPLICATE KEY UPDATE clause to handle existing entries
        updateStockQuery += ' ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)';

        // Execute the query to update stock quantities within the transaction
        connection.query(updateStockQuery, updateStockValues, (err, result) => {
            if (err) {
                console.error('Error updating stock quantities within transaction:', err);
                return callback(err);
            }

            console.log('Stock quantities updated successfully within transaction');
            callback(null);
        });
    });
}






module.exports = router;
