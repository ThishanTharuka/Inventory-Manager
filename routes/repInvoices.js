const express = require('express');
const router = express.Router();
const database = require('../database');
const { reject } = require('async');

// GET route to render the rep_invoices page
router.get('/rep-invoices', (req, res) => {
    const { search } = req.query;
    let repInvoicesQuery = `
        SELECT o.*, d.shop_name AS dealer_name
        FROM rep_invoices o
        JOIN dealers d ON o.dealer_id = d.shop_id
    `;

    // If a search parameter is provided, filter rep_invoices based on it
    if (search) {
        repInvoicesQuery += ` WHERE o.invoice_id LIKE '%${search}%'`;
    }

    database.query(repInvoicesQuery, (err, rep_invoices) => {
        if (err) {
            console.error('Error fetching Rep Invoices:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Fetch additional details for each rep_invoice
        const promises = rep_invoices.map((rep_invoice) => {
            return new Promise((resolve, reject) => {
                const itemsQuery = `
                    SELECT oi.item_code, i.description, oi.quantity, oi.price_per_item, oi.total, oi.discount
                    FROM rep_invoice_items oi
                    JOIN items i ON oi.item_code = i.item_code
                    WHERE oi.invoice_id = ?
                `;

                database.query(itemsQuery, [rep_invoice.invoice_id], (err, items) => {
                    if (err) {
                        reject(err);
                    } else {
                        rep_invoice.invoice_date = new Date(rep_invoice.invoice_date);
                        rep_invoice.items = items;
                        resolve();
                    }
                });
            });
        });

        Promise.all(promises)
            .then(() => {
                res.render('rep-invoices', { title: 'Rep\'s Invoices', rep_invoices, search });
            })
            .catch((error) => {
                console.error('Error fetching items for rep_invoices:', error);
                res.status(500).send('Internal Server Error');
            });
    });
});


router.get('/rep-invoices/add', (req, res) => {
    const itemsQuery = 'SELECT item_code, description, price FROM items';
    const dealersQuery = 'SELECT * FROM dealers'; // Fetch dealer names
    database.query(itemsQuery, (err, items) => {
        if (err) {
            console.error('Error fetching items:', err);
            res.status(500).send('Internal Server Error');
            return;
        }
        database.query(dealersQuery, (err, dealers) => {
            if (err) {
                console.error('Error fetching dealers:', err);
                res.status(500).send('Internal Server Error');
                return;
            }
            res.render('add-rep-invoice', { title: 'Add Rep Invoice', items, dealers });
        });
    });
});


// POST route to handle form submission and add the invoice to the database
router.post('/rep-invoices/add', (req, res) => {
    const { invoice_id, invoice_date, dealer_name, item_codes, prices, quantities, discounts } = req.body;

    // Query to get shop_id from dealers table based on shop_name
    const dealerQuery = 'SELECT shop_id FROM dealers WHERE shop_name = ?';
    database.query(dealerQuery, [dealer_name], (err, dealerResult) => {
        if (err) {
            console.error('Error fetching shop_id:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }

        // If dealer not found, handle error
        if (!dealerResult || dealerResult.length === 0 || !dealerResult[0] || !dealerResult[0].shop_id) {
            console.error('Dealer not found');
            res.status(404).json({ error: 'Dealer not found' });
            return;
        }

        // Get the shop_id from the dealerResult
        const dealer_id = dealerResult[0].shop_id;
        console.log('Dealer ID:', dealer_id);

        // Calculate total for the invoice
        let invoiceTotal = 0;

        // Construct an array to hold the data for each invoice item
        const invoiceItemsData = [];
        for (let i = 0; i < item_codes.length; i++) {
            const item_code = item_codes[i];
            const price = prices[i];
            const quantity = quantities[i];
            const discount = discounts[i];

            // Calculate the total for the item
            const total = price * quantity * (1 - discount / 100); // Apply discount
            invoiceTotal += total; // Add to invoice total


            console.log('Item:', item_code, 'Price:', price, 'Quantity:', quantity, 'Discount:', discount, 'Total:', total);
            // Push item data to the array
            invoiceItemsData.push([invoice_id, item_code, price, quantity, discount, total]);
        }

        // Check if all items exist in rep_stocks table
        const checkItemsExistQuery = 'SELECT item_code FROM rep_stocks WHERE item_code IN (?)';
        const itemCodesArray = item_codes;

        database.query(checkItemsExistQuery, [itemCodesArray], (err, results) => {
            if (err) {
                console.error('Error checking items in stock:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            const existingItemCodes = results.map(row => row.item_code);
            const missingItems = itemCodesArray.filter(item_code => !existingItemCodes.includes(item_code));

            console.log(missingItems);

            if (missingItems.length > 0) {
                // Some items are missing in the rep_stocks table
                res.status(400).send(`Error: The following items are not available in the rep stock: ${missingItems.join(', ')}. Please check the availability of these items and try again.`);
                return;
            }

            // Begin transaction
            database.beginTransaction(err => {
                if (err) {
                    console.error('Error beginning transaction:', err);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Insert invoice details into the rep_invoices table
                const repInvoicesQuery = 'INSERT INTO rep_invoices (invoice_id, invoice_date, dealer_id, total) VALUES (?, ?, ?, ?)';
                database.query(repInvoicesQuery, [invoice_id, invoice_date, dealer_id, invoiceTotal], (err, result) => {
                    if (err) {
                        console.error('Error adding invoice:', err);
                        database.rollback(() => {
                            res.status(500).send('Internal Server Error');
                        });
                        return;
                    }

                    // Insert invoice items into the rep_invoice_items table
                    const invoiceItemsQuery = 'INSERT INTO rep_invoice_items (invoice_id, item_code, price_per_item, quantity, discount, total) VALUES ?';
                    database.query(invoiceItemsQuery, [invoiceItemsData], (err, result) => {
                        if (err) {
                            console.error('Error adding invoice items:', err);
                            database.rollback(() => {
                                res.status(500).send('Internal Server Error');
                            });
                            return;
                        }

                        // Update stock quantities for each item
                        const updateStockPromises = item_codes.map((item_code, index) => {
                            return new Promise((resolve, reject) => {
                                const updateStockQuery = 'UPDATE rep_stocks SET quantity = quantity - ? WHERE item_code = ?';
                                database.query(updateStockQuery, [quantities[index], item_code], (err, result) => {
                                    if (err) {
                                        reject(err);
                                    } else {
                                        resolve();
                                    }
                                });
                            });
                        });

                        Promise.all(updateStockPromises)
                            .then(() => {
                                database.commit(err => {
                                    if (err) {
                                        console.error('Error committing transaction:', err);
                                        database.rollback(() => {
                                            res.status(500).send('Internal Server Error');
                                        });
                                        return;
                                    }
                                    res.redirect('/rep-invoices');
                                });
                            })
                            .catch(err => {
                                console.error('Error updating stock quantities:', err);
                                database.rollback(() => {
                                    res.status(500).send('Internal Server Error');
                                });
                            });
                    });
                });
            });
        });
    });
});



// DELETE route to handle deleting a rep invoice
router.get('/rep-invoices/delete/:id', (req, res) => {
    const invoiceId = req.params.id;

    // First, fetch the items from the invoice to be deleted
    const fetchInvoiceItemsQuery = 'SELECT * FROM rep_invoice_items WHERE invoice_id = ?';
    database.query(fetchInvoiceItemsQuery, [invoiceId], (err, items) => {
        if (err) {
            console.error('Error fetching invoice items to delete:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }

        // Delete the invoice items associated with the invoice
        const deleteInvoiceItemsQuery = 'DELETE FROM rep_invoice_items WHERE invoice_id = ?';
        database.query(deleteInvoiceItemsQuery, [invoiceId], (err, result) => {
            if (err) {
                console.error('Error deleting invoice items:', err);
                res.status(500).json({ error: 'Internal server error' });
                return;
            }

            // Then, delete the invoice itself
            const deleteInvoiceQuery = 'DELETE FROM rep_invoices WHERE invoice_id = ?';
            database.query(deleteInvoiceQuery, [invoiceId], (err, result) => {
                if (err) {
                    console.error('Error deleting invoice:', err);
                    res.status(500).json({ error: 'Internal server error' });
                    return;
                }

                // Add back the quantities to the rep_stocks table
                const updateStockPromises = items.map((item) => {
                    return new Promise((resolve, reject) => {
                        const updateStockQuery = 'UPDATE rep_stocks SET quantity = quantity + ? WHERE item_code = ?';
                        database.query(updateStockQuery, [item.quantity, item.item_code], (err, result) => {
                            if (err) {
                                console.error('Error updating stock quantities:', err);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                });

                Promise.all(updateStockPromises)
                    .then(() => {
                        // Redirect to the rep-invoices page after successfully deleting the invoice
                        res.redirect('/rep-invoices');
                    })
                    .catch((error) => {
                        console.error('Error updating stock quantities:', error);
                        res.status(500).json({ error: 'Internal server error' });
                    });
            });
        });
    });
});


// Route to render the edit rep invoice form
router.get('/rep-invoices/edit/:id', (req, res) => {
    const invoiceId = req.params.id;

    // Query to fetch invoice details and associated items
    const query = `
        SELECT ri.invoice_id, ri.invoice_date, ri.dealer_id, rii.item_code, rii.quantity, rii.price_per_item, rii.discount, i.description AS item_name
        FROM rep_invoices ri
        LEFT JOIN rep_invoice_items rii ON ri.invoice_id = rii.invoice_id
        LEFT JOIN items i ON rii.item_code = i.item_code
        WHERE ri.invoice_id = ?
    `;

    const dealersQuery = `SELECT shop_id, shop_name FROM dealers`;

    database.query(query, [invoiceId], (err, invoiceResults) => {
        if (err) {
            console.error('Error fetching invoice details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Fetch dealer names
        database.query(dealersQuery, (err, dealerResults) => {
            if (err) {
                console.error('Error fetching dealer names:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            // Organize fetched data into a structured format
            const invoice = {
                invoice_id: invoiceResults[0].invoice_id,
                invoice_date: invoiceResults[0].invoice_date,
                dealer_id: invoiceResults[0].dealer_id,
                items: invoiceResults.map(row => ({
                    item_code: row.item_code,
                    item_name: row.item_name,
                    quantity: row.quantity,
                    discount: row.discount,
                    price_per_item: row.price_per_item
                }))
            };

            const dealers = dealerResults;

            // Render the edit invoice page with invoice details, associated items, and dealer names
            res.render('edit-rep-invoice', { title: 'Edit Rep Invoice', invoice, dealers });
        });
    });
});

// Route to handle the update form submission
router.post('/rep-invoices/update', (req, res) => {
    const invoiceId = req.body.invoice_id;
    const newInvoiceDate = req.body.invoiceDate;
    const updatedItems = req.body.items;
    const dealerId = req.body.dealer_name; // Even though it says dealer name it takes dealer id from body

    console.log(invoiceId, newInvoiceDate, updatedItems, dealerId);

    // Validate if updatedItems is an array
    if (!Array.isArray(updatedItems)) {
        console.error("Items data is missing or invalid.");
        res.status(400).send("Items data is missing or invalid.");
        return;
    }

    // Update the invoice date in the rep_invoices table if a new date is provided
    if (newInvoiceDate) {
        const updateInvoiceDateQuery = `UPDATE rep_invoices SET invoice_date = ? WHERE invoice_id = ?`;
        database.query(updateInvoiceDateQuery, [newInvoiceDate, invoiceId], (err, result) => {
            if (err) {
                console.error("Error updating invoice date:", err);
                res.status(500).send("Internal Server Error");
                return; // Return here to prevent further execution
            }
            // Proceed with updating item quantities and prices
            updateItemQuantities();
        });
    } else {
        // If no new date is provided, proceed with updating item quantities and prices directly
        updateItemQuantities();
    }

    function updateItemQuantities() {
        // Iterate over each updated item
        const updateStockPromises = updatedItems.map(item => {
            const oldQuantity = item.old_quantity; // Retrieve the old quantity from the hidden input field
            const newQuantity = item.quantity;

            // Calculate the difference between old and new quantities
            const quantityDifference = newQuantity - oldQuantity;

            // Determine stock update query based on quantity difference
            const stockQuery = quantityDifference > 0
                ? `UPDATE rep_stocks SET quantity = quantity - ? WHERE item_code = ?`
                : `UPDATE rep_stocks SET quantity = quantity + ? WHERE item_code = ?`;

            return new Promise((resolve, reject) => {
                database.query(stockQuery, [Math.abs(quantityDifference), item.item_code], (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });

        // Execute stock updates in parallel
        Promise.all(updateStockPromises)
            .then(() => updateDealerId())
            .catch(err => {
                console.error("Error updating stock quantities:", err);
                res.status(500).send("Internal Server Error");
            });
    }

    function updateDealerId() {
        const updateDealerIdQuery = `UPDATE rep_invoices SET dealer_id = ? WHERE invoice_id = ?`;
        database.query(updateDealerIdQuery, [dealerId, invoiceId], (err, result) => {
            if (err) {
                console.error("Error updating dealer ID:", err);
                res.status(500).send("Internal Server Error");
                return;
            }

            updateInvoiceItems();
        });
    }

    function updateInvoiceItems() {
        const updateItemsPromises = updatedItems.map(item => {
            const updateItemQuery = `UPDATE rep_invoice_items SET quantity = ?, discount = ?, price_per_item = ?, total = ? WHERE invoice_id = ? AND item_code = ?`;
            const total = item.quantity * item.price_per_item * (1 - item.discount / 100);

            return new Promise((resolve, reject) => {
                database.query(updateItemQuery, [item.quantity, item.discount, item.price_per_item, total, invoiceId, item.item_code], (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(total); // Resolve with the total value
                    }
                });
            });
        });

        Promise.all(updateItemsPromises)
            .then(totals => {
                const invoiceTotal = totals.reduce((acc, curr) => acc + curr, 0);
                updateInvoiceTotal(invoiceTotal);
            })
            .catch(err => {
                console.error("Error updating invoice items:", err);
                res.status(500).send("Internal Server Error");
            });
    }

    function updateInvoiceTotal(invoiceTotal) {
        const updateTotalQuery = `UPDATE rep_invoices SET total = ? WHERE invoice_id = ?`;
        database.query(updateTotalQuery, [invoiceTotal, invoiceId], (err, result) => {
            if (err) {
                console.error("Error updating invoice total:", err);
                res.status(500).send("Internal Server Error");
                return;
            }
            res.redirect('/rep-invoices');
        });
    }
});





module.exports = router;
