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

router.get('/invoices/edit/:id', (req, res) => {
    const invoiceId = req.params.id;

    // Fetch invoice details and associated items from the database
    const query = `
        SELECT i.invoice_id, i.invoice_date, ii.item_code, ii.quantity
        FROM invoices i
        LEFT JOIN invoice_items ii ON i.invoice_id = ii.invoice_id
        WHERE i.invoice_id = ?
    `;

    database.query(query, [invoiceId], (err, results) => {
        if (err) {
            console.error('Error fetching invoice details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Organize fetched data into a structured format
        const invoice = {
            invoice_id: results[0].invoice_id,
            invoice_date: results[0].invoice_date,
            items: results.map(row => ({
                item_code: row.item_code,
                quantity: row.quantity
            }))
        };

        console.log(invoice);
        // Render the edit invoice page with invoice details and associated items
        res.render('edit-invoice', { title: 'Edit Invoice', invoice });
    });
});

router.post('/update-invoice', (req, res) => {
    const invoiceId = req.body.invoice_id;
    const invoiceDate = req.body.invoiceDate;
    const items = req.body.items;

    console.log(invoiceId, invoiceDate, items);

    // Validate if items is an array
    if (!Array.isArray(items)) {
        console.error("Items data is missing or invalid.");
        res.status(400).send("Items data is missing or invalid.");
        return;
    }

    // Update the invoice date in the invoices table if a new date is provided
    if (invoiceDate) {
        const updateInvoiceQuery = `UPDATE invoices SET invoice_date = ? WHERE invoice_id = ?`;
        database.query(updateInvoiceQuery, [invoiceDate, invoiceId], (err, result) => {
            if (err) {
                console.error("Error updating invoice date:", err);
                res.status(500).send("Internal Server Error");
                return; // Return here to prevent further execution
            }
            // Proceed with updating item quantities
            updateItemQuantities();
        });
    } else {
        // If no new date is provided, proceed with updating item quantities directly
        updateItemQuantities();
    }

    function updateItemQuantities() {
        // Update quantities for each item in the invoice_items table
        const updateItemsPromises = items.map(item => {
            const updateItemQuery = `UPDATE invoice_items SET quantity = ? WHERE invoice_id = ? AND item_code = ?`;
            return new Promise((resolve, reject) => {
                database.query(updateItemQuery, [item.quantity, invoiceId, item.item_code], (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve();
                    }
                });
            });
        });

        Promise.all(updateItemsPromises)
            .then(() => {
                console.log("Invoice details updated successfully");
                res.redirect("/invoices");
            })
            .catch(error => {
                console.error("Error updating item quantities:", error);
                res.status(500).send("Internal Server Error");
            });
    }
});

router.get('/items/remove/:item_code', (req, res) => {
    const itemCode = req.params.item_code;
    const invoiceId = req.query.invoice_id; // Retrieve invoice_id from query parameters

    // Check if invoiceId is defined
    if (!invoiceId) {
        console.error("Invoice ID is missing.");
        res.status(400).send("Invoice ID is missing.");
        return;
    }

    // Fetch the quantity of the item being removed from the invoice
    const getItemQuantityQuery = `SELECT quantity FROM invoice_items WHERE invoice_id = ? AND item_code = ?`;
    database.query(getItemQuantityQuery, [invoiceId, itemCode], (err, result) => {
        if (err) {
            console.error("Error fetching item quantity:", err);
            res.status(500).send("Internal Server Error");
            return;
        }

        // Extract the quantity from the result
        const itemQuantity = result[0].quantity;

        // Construct the SQL query to delete the item from the invoice_items table
        const deleteItemQuery = `DELETE FROM invoice_items WHERE invoice_id = ? AND item_code = ?`;

        // Execute the query to delete the item from the invoice_items table
        database.query(deleteItemQuery, [invoiceId, itemCode], (err, result) => {
            if (err) {
                console.error("Error removing item:", err);
                res.status(500).send("Internal Server Error");
                return;
            }

            // Deduct the item quantity from the stocks table
            const updateStockQuery = `UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?`;
            database.query(updateStockQuery, [itemQuantity, itemCode], (err, result) => {
                if (err) {
                    console.error("Error updating stock quantity:", err);
                    res.status(500).send("Internal Server Error");
                    return;
                }

                console.log("Item removed successfully");
                res.redirect(`/invoices/edit/${invoiceId}`);
            });
        });
    });
});

// Route to handle deleting an invoice
router.get('/invoices/delete/:id', (req, res) => {
    const invoiceId = req.params.id;

    // SQL query to fetch invoice items quantities
    const getInvoiceItemsQuery = `SELECT item_code, quantity FROM invoice_items WHERE invoice_id = ?`;

    // Execute the query to fetch invoice items quantities
    database.query(getInvoiceItemsQuery, [invoiceId], (err, invoiceItems) => {
        if (err) {
            console.error('Error fetching invoice items:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // SQL query to delete invoice items related to the invoice
        const deleteInvoiceItemsQuery = `DELETE FROM invoice_items WHERE invoice_id = ?`;

        // Execute the query to delete invoice items
        database.query(deleteInvoiceItemsQuery, [invoiceId], (err, result) => {
            if (err) {
                console.error('Error deleting invoice items:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            // SQL query to delete invoice from invoices table
            const deleteInvoiceQuery = `DELETE FROM invoices WHERE invoice_id = ?`;

            // Execute the query to delete invoice
            database.query(deleteInvoiceQuery, [invoiceId], (err, result) => {
                if (err) {
                    console.error('Error deleting invoice:', err);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Deduct removed item quantities from stock
                invoiceItems.forEach(item => {
                    const updateStockQuery = `UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?`;
                    database.query(updateStockQuery, [item.quantity, item.item_code], (err, result) => {
                        if (err) {
                            console.error('Error updating stock quantity:', err);
                            res.status(500).send('Internal Server Error');
                            return;
                        }
                    });
                });

                console.log('Invoice deleted successfully');
                res.redirect('/invoices');
            });
        });
    });
});



module.exports = router;
