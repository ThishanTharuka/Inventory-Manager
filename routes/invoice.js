const express = require('express');
const router = express.Router();
const database = require('../database');


router.get('/invoices', (req, res) => {
    const { search } = req.query;
    let invoiceQuery = `SELECT 
                            i.invoice_id, 
                            i.invoice_date, 
                            i.total, 
                            ii.item_code, 
                            ii.quantity, 
                            ii.price_per_item, 
                            ii.extention, 
                            it.description 
                        FROM 
                            invoices i 
                            JOIN invoice_items ii ON i.invoice_id = ii.invoice_id 
                            JOIN items it ON ii.item_code = it.item_code`;

    // If a search parameter is provided, filter invoices based on it
    if (search) {
        invoiceQuery += ` WHERE i.invoice_id LIKE '%${search}%'`;
    }

    database.query(invoiceQuery, (err, rows) => {
        if (err) {
            console.error('Error fetching invoices:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Process rows to organize data into an array of invoices
        const invoices = [];

        rows.forEach(row => {
            // Check if invoice with this ID already exists in invoices array
            let existingInvoice = invoices.find(inv => inv.invoice_id === row.invoice_id);

            if (!existingInvoice) {
                // If invoice doesn't exist, create a new one
                existingInvoice = {
                    invoice_id: row.invoice_id,
                    invoice_date: row.invoice_date,
                    total: row.total,
                    items: []
                };
                invoices.push(existingInvoice);
            }

            // Add item details to the items array of the existing invoice
            existingInvoice.items.push({
                item_code: row.item_code,
                description: row.description,
                quantity: row.quantity,
                price_per_item: row.price_per_item,
                extention: row.extention

                
            });

        });


        // Render the invoices page with fetched data
        res.render('invoices', { title: 'Invoices', invoices, search });
    });
});


router.get('/invoice-summary', (req, res) => {
    // Fetch invoice summary data from the database
    const query = `SELECT * FROM invoices`;

    database.query(query, (err, invoices) => {
        if (err) {
            throw err;
        }
        res.render('invoices-summary', { title: 'Invoices Summary', invoices });
    });
});

router.get('/invoices/edit/:id', (req, res) => {
    const invoiceId = req.params.id;

    // Fetch invoice details and associated items from the database
    const query = `
        SELECT i.invoice_id, i.invoice_date, ii.item_code, ii.quantity, ii.price_per_item
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
                quantity: row.quantity,
                price_per_item: row.price_per_item
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
            // Proceed with updating item quantities and prices
            updateItemQuantities();
        });
    } else {
        // If no new date is provided, proceed with updating item quantities and prices directly
        updateItemQuantities();
    }

    function updateItemQuantities() {
        // Update quantities, price_per_item, and extension for each item in the invoice_items table
        const updateItemsPromises = items.map(item => {
            const extension = item.quantity * item.price_per_item;
            const updateItemQuery = `UPDATE invoice_items SET quantity = ?, price_per_item = ?, extention = ? WHERE invoice_id = ? AND item_code IN (?)`;
            return new Promise((resolve, reject) => {
                database.query(updateItemQuery, [item.quantity, item.price_per_item, extension, invoiceId, item.item_code], (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(extension); // Resolve with the extension value
                    }
                });
            });
        });
    
        Promise.all(updateItemsPromises)
            .then(extensions => {
                // Calculate the total by summing up all extensions
                const total = extensions.reduce((acc, curr) => acc + curr, 0);
                // Update the total column in the invoices table
                const updateTotalQuery = `UPDATE invoices SET total = ? WHERE invoice_id = ?`;
                database.query(updateTotalQuery, [total, invoiceId], (err, result) => {
                    if (err) {
                        console.error("Error updating total:", err);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    console.log("Invoice details updated successfully");
                    res.redirect("/invoices");
                });
            })
            .catch(error => {
                console.error("Error updating item quantities, prices, and extensions:", error);
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
