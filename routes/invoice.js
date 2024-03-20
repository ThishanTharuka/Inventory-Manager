const express = require('express');
const router = express.Router();
const database = require('../database');

router.get('/invoices', (req, res) => {
    const { search } = req.query;
    let invoiceQuery = 'SELECT * FROM invoices';

    // If a search parameter is provided, filter invoices based on it
    if (search) {
        invoiceQuery += ` WHERE invoice_id LIKE '%${search}%'`;
    }

    database.query(invoiceQuery, (err, invoices) => {
        if (err) {
            throw err;
        }

        // Fetch additional details for each invoice (similar to the previous example)

        const promises = invoices.map((invoice) => {
            return new Promise((resolve, reject) => {
                const itemsQuery = `SELECT ii.item_code, i.description, ii.quantity
                                    FROM invoice_items ii
                                    JOIN items i ON ii.item_code = i.item_code
                                    WHERE ii.invoice_id = ?`;

                database.query(itemsQuery, [invoice.invoice_id], (err, items) => {
                    if (err) {
                        reject(err);
                    } else {
                        invoice.items = items;
                        resolve();
                    }
                });
            });
        });

        Promise.all(promises)
            .then(() => {
                res.render('invoices', { title: 'Invoices', invoices, search });
            })
            .catch((error) => {
                console.error('Error fetching items for invoices:', error);
                res.status(500).send('Internal Server Error');
            });
    });
});

module.exports = router;