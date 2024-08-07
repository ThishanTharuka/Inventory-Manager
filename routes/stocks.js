const express = require('express');
const router = express.Router();
const async = require('async');
const database = require('../database');


router.get('/stocks', (req, res) => {
    const combinedQuery = `
        SELECT 
            s.item_code, 
            s.description, 
            s.quantity AS stock_quantity, 
            COALESCE(ms.quantity, 0) AS mathara_quantity, 
            COALESCE(rs.quantity, 0) AS rep_quantity,
            COALESCE(incoming.total_quantity, 0) AS incoming_quantity,
            COALESCE(direct_sale.total_quantity, 0) + COALESCE(rep_sale.total_quantity, 0) AS total_sold_quantity
        FROM 
            stocks s
        LEFT JOIN 
            mathara_stocks ms ON s.item_code = ms.item_code
        LEFT JOIN 
            rep_stocks rs ON s.item_code = rs.item_code
        LEFT JOIN (
            SELECT 
                item_code, 
                SUM(quantity) AS total_quantity
            FROM 
                invoice_items
            GROUP BY 
                item_code
        ) incoming ON s.item_code = incoming.item_code
        LEFT JOIN (
            SELECT 
                item_code, 
                SUM(quantity) AS total_quantity
            FROM 
                order_items
            GROUP BY 
                item_code
        ) direct_sale ON s.item_code = direct_sale.item_code
        LEFT JOIN (
            SELECT 
                item_code, 
                SUM(quantity) AS total_quantity
            FROM 
                rep_invoice_items
            GROUP BY 
                item_code
        ) rep_sale ON s.item_code = rep_sale.item_code;
    `;

    database.query(combinedQuery, (err, stocks) => {
        if (err) {
            throw err;
        }

        res.render('stocks', { title: 'Stocks', stocks });
    });
});





// Route to render the add invoice page
router.get('/stocks/add', (req, res) => {
    // SQL query to fetch all items
    const itemsQuery = 'SELECT * FROM items';
    const dealerQuery = 'SELECT * FROM dealers';

    // Execute the query to fetch items
    database.query(itemsQuery, (err, items) => {
        if (err) {
            console.error('Error fetching items:', err);
            return res.status(500).send('Internal Server Error');
        }
        // Execute the query to fetch dealers
        database.query(dealerQuery, (err, dealers) => {
            if (err) {
                console.error('Error fetching dealers:', err);
                return res.status(500).send('Internal Server Error');
            }
            // Render the add-invoice page with fetched items
            res.render('add-invoice', { title: 'Add Stock', items, dealers });
        });
    });
});


// Route to handle adding new invoice (stock)
router.post('/add-invoice', (req, res) => {
    // Extract data from the request body
    const invoiceId = req.body.invoice_id;
    const date = req.body.date;
    const dealerName = req.body.dealer_name;
    const itemCodes = req.body.item_codes;
    const quantities = req.body.quantities;
    const isMatharaStock = req.body.mathara_stock === 'on'; // Check if Mathara stock is selected
    const stockType = isMatharaStock ? 'mathara' : 'regular';

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
                    const queryInsertInvoice = `INSERT INTO invoices (invoice_id, invoice_date, total, stock_type, dealer_name) VALUES (?, ?, ?, ?, ?)`;

                    // Execute the query to insert new invoice
                    database.query(queryInsertInvoice, [invoiceId, date, totalExtension, stockType, dealerName], (err, result) => {
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

                            // Update stock quantities based on invoice items within a transaction
                            updateStockQuantitiesInTransaction(database, itemsData, isMatharaStock, err => {
                                if (err) {
                                    console.error('Error updating stock quantities within transaction:', err);
                                    // Rollback the transaction
                                    return database.rollback(() => {
                                        console.error('Transaction rolled back due to error');
                                        return res.status(500).send('Internal Server Error');
                                    });
                                }

                                // Commit the transaction
                                database.commit(err => {
                                    if (err) {
                                        console.error('Error committing transaction:', err);
                                        // Rollback the transaction
                                        return database.rollback(() => {
                                            console.error('Transaction rolled back due to error');
                                            return res.status(500).send('Internal Server Error');
                                        });
                                    }

                                    console.log('Transaction committed successfully');
                                    // Redirect to add stocks page
                                    res.redirect('/invoices?search=' + invoiceId);
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
function updateStockQuantitiesInTransaction(connection, itemsData, isMatharaStock, callback) {
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

            if (isMatharaStock) {
                // Update Mathara stock quantities if the invoice is for Mathara stock
                let updateMatharaStockQuery = 'INSERT INTO mathara_stocks (item_code, description, quantity) VALUES ';
                const updateMatharaStockValues = [];

                Object.entries(itemDetails).forEach(([itemCode, details]) => {
                    updateMatharaStockQuery += '(?, ?, ?), ';
                    updateMatharaStockValues.push(itemCode, details.description, details.quantity);
                });

                // Remove the trailing comma and space
                updateMatharaStockQuery = updateMatharaStockQuery.slice(0, -2);

                // Add ON DUPLICATE KEY UPDATE clause to handle existing entries
                updateMatharaStockQuery += ' ON DUPLICATE KEY UPDATE quantity = quantity + VALUES(quantity)';

                // Execute the query to update Mathara stock quantities within the transaction
                connection.query(updateMatharaStockQuery, updateMatharaStockValues, (err, result) => {
                    if (err) {
                        console.error('Error updating Mathara stock quantities within transaction:', err);
                        return callback(err);
                    }

                    console.log('Mathara stock quantities updated successfully within transaction');
                    callback(null);
                });
            } else {
                callback(null);
            }
        });
    });
}





module.exports = router;
