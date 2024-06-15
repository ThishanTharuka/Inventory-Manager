const express = require('express');
const router = express.Router();
const database = require('../database');
const { reject } = require('async');

// GET route to render the rep_invoices page
router.get('/rep_invoices', (req, res) => {
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

            // Update stock quantities for each item
            const updateStockQuery = 'UPDATE rep_stocks SET quantity = quantity - ? WHERE item_code = ?';
            database.query(updateStockQuery, [quantity, item_code], (err, result) => {
                if (err) {
                    console.error('Error updating stock quantities:', err);
                    // You might want to handle this error in some way
                }
            });
        }

        // Insert invoice details into the rep_invoices table
        const repInvoicesQuery = 'INSERT INTO rep_invoices (invoice_id, invoice_date, dealer_id, total) VALUES (?, ?, ?, ?)';
        database.query(repInvoicesQuery, [invoice_id, invoice_date, dealer_id, invoiceTotal], (err, result) => {
            if (err) {
                console.error('Error adding invoice:', err);
                res.status(500).json({ error: 'Internal server error' });
                return;
            }

            // Insert invoice items into the rep_invoice_items table
            const invoiceItemsQuery = 'INSERT INTO rep_invoice_items (invoice_id, item_code, price_per_item, quantity, discount, total) VALUES ?';
            database.query(invoiceItemsQuery, [invoiceItemsData], (err, result) => {
                if (err) {
                    console.error('Error adding invoice items:', err);
                    res.status(500).json({ error: 'Internal server error' });
                    return;
                }

                // Redirect to the invoices page after successfully adding the invoice
                res.redirect('/rep_invoices');
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
                        res.redirect('/rep_invoices');
                    })
                    .catch((error) => {
                        console.error('Error updating stock quantities:', error);
                        res.status(500).json({ error: 'Internal server error' });
                    });
            });
        });
    });
});





module.exports = router;
