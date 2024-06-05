const express = require('express');
const router = express.Router();
const database = require('../database');
const generatePDF = require('../services/pdf-service');


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
        SELECT i.invoice_id, i.invoice_date, ii.item_code, ii.quantity, ii.price_per_item, o.description AS item_name
        FROM invoices i
        LEFT JOIN invoice_items ii ON i.invoice_id = ii.invoice_id
        LEFT JOIN items o ON ii.item_code = o.item_code
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
                item_name: row.item_name,
                quantity: row.quantity,
                price_per_item: row.price_per_item
            }))
        };

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
            // Proceed with updating item quantities, prices, and stock
            updateItemDetails();
        });
    } else {
        // If no new date is provided, proceed with updating item quantities, prices, and stock directly
        updateItemDetails();
    }

    function updateItemDetails() {
        // Iterate over each item in the invoice
        items.forEach(item => {
            const oldQuantity = item.old_quantity; // Retrieve the old quantity
            const newQuantity = item.quantity;

            // Calculate the difference between old and new quantities
            const quantityDifference = newQuantity - oldQuantity;

            // If the quantity difference is positive, it means more items have been added to the stock than before, so we should increase the stock
            if (quantityDifference > 0) {
                const increaseStockQuery = `UPDATE stocks SET quantity = quantity + ? WHERE item_code = ?`;
                database.query(increaseStockQuery, [quantityDifference, item.item_code], (err, result) => {
                    if (err) {
                        console.error("Error increasing stock:", err);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    console.log(`Stock for item ${item.item_code} increased by ${quantityDifference}`);
                });
            }
            // If the quantity difference is negative, it means less items have been added to the stock than before, so we should decrease the stock
            else if (quantityDifference < 0) {
                const decreaseStockQuery = `UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?`;
                database.query(decreaseStockQuery, [-quantityDifference, item.item_code], (err, result) => {
                    if (err) {
                        console.error("Error decreasing stock:", err);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    console.log(`Stock for item ${item.item_code} decreased by ${-quantityDifference}`);
                });
            }
            // If the quantity difference is zero, no change in stock is required
        });

        // Proceed with updating item quantities and prices
        updateItemQuantitiesAndTotal();
    }

    function updateItemQuantitiesAndTotal() {
        // Update quantities, prices, and calculate total extension for each item in the invoice_items table
        const updateItemsPromises = items.map(item => {
            const extension = item.quantity * item.price_per_item;
            const updateItemQuery = `UPDATE invoice_items SET quantity = ?, price_per_item = ?, extention = ? WHERE invoice_id = ? AND item_code = ?`;
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

        // Execute updateItemsPromises in Promise.all()
        Promise.all(updateItemsPromises)
            .then(extensions => {
                // Calculate the total by summing up all extensions
                console.log(extensions);
                const total = extensions.reduce((acc, curr) => acc + curr, 0);
                console.log(total);

                // Update the total column in the invoices table
                const updateTotalQuery = `UPDATE invoices SET total = ? WHERE invoice_id = ?`;
                database.query(updateTotalQuery, [total, invoiceId], (err, result) => {
                    if (err) {
                        console.error("Error updating total:", err);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    console.log("Invoice items updated successfully");
                    res.redirect("/invoices");
                });
            })
            .catch(error => {
                console.error("Error updating item quantities and prices:", error);
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

    // SQL query to fetch invoice items quantities and the stock type
    const getInvoiceDetailsQuery = `
        SELECT ii.item_code, ii.quantity, i.stock_type 
        FROM invoice_items ii 
        JOIN invoices i ON ii.invoice_id = i.invoice_id 
        WHERE ii.invoice_id = ?`;

    // Execute the query to fetch invoice items quantities and stock type
    database.query(getInvoiceDetailsQuery, [invoiceId], (err, invoiceDetails) => {
        if (err) {
            console.error('Error fetching invoice details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Determine the stock type of the invoice
        const stockType = invoiceDetails.length > 0 ? invoiceDetails[0].stock_type : null;

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

                // Deduct removed item quantities from the main stock table
                const mainStockUpdates = invoiceDetails.map(item => {
                    return new Promise((resolve, reject) => {
                        const updateStockQuery = `UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?`;
                        database.query(updateStockQuery, [item.quantity, item.item_code], (err, result) => {
                            if (err) {
                                console.error('Error updating main stock quantity:', err);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                });

                // Deduct removed item quantities from the Mathara stock table if it's a Mathara invoice
                const matharaStockUpdates = stockType === 'mathara' ? invoiceDetails.map(item => {
                    return new Promise((resolve, reject) => {
                        const updateMatharaStockQuery = `UPDATE mathara_stocks SET quantity = quantity - ? WHERE item_code = ?`;
                        database.query(updateMatharaStockQuery, [item.quantity, item.item_code], (err, result) => {
                            if (err) {
                                console.error('Error updating Mathara stock quantity:', err);
                                reject(err);
                            } else {
                                resolve();
                            }
                        });
                    });
                }) : [];

                // Execute all stock updates in parallel
                Promise.all([...mainStockUpdates, ...matharaStockUpdates])
                    .then(() => {
                        console.log('Invoice and stock quantities updated successfully');
                        res.redirect('/invoices');
                    })
                    .catch(err => {
                        console.error('Error updating stock quantities:', err);
                        res.status(500).send('Internal Server Error');
                    });
            });
        });
    });
});



router.get('/invoices/pdf/:id', (req, res) => {
    const invoiceId = req.params.id;

    const query = `
      SELECT i.invoice_id, i.invoice_date, i.total, ii.item_code, ii.quantity, ii.price_per_item, ii.extention, it.description, it.unit
      FROM invoices i
      JOIN invoice_items ii ON i.invoice_id = ii.invoice_id
      JOIN items it ON ii.item_code = it.item_code
      WHERE i.invoice_id = ?
    `;

    database.query(query, [invoiceId], (err, rows) => {
        if (err) {
            console.error('Error fetching invoice details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        if (rows.length === 0) {
            res.status(404).send('Invoice not found');
            return;
        }

        const invoice = {
            invoice_id: rows[0].invoice_id,
            invoice_date: rows[0].invoice_date,
            total: rows[0].total,
            items: rows.map(row => ({
                item_code: row.item_code,
                unit: row.unit,
                description: row.description,
                quantity: row.quantity,
                price_per_item: row.price_per_item,
                extention: row.extention
            }))
        };

        // Set response headers for PDF download
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment;filename=invoice_${invoiceId}.pdf`,
        });

        // Generate the PDF and stream it to the response
        generatePDF.generateInvoicePDF(invoice, (chunk) => res.write(chunk), () => res.end());
    });
});


router.get('/invoices/show/:id', (req, res) => {
    const invoiceId = req.params.id;

    const query = `
      SELECT i.invoice_id, i.invoice_date, i.total, ii.item_code, ii.quantity, ii.price_per_item, ii.extention, it.description, it.unit
      FROM invoices i
      JOIN invoice_items ii ON i.invoice_id = ii.invoice_id
      JOIN items it ON ii.item_code = it.item_code
      WHERE i.invoice_id = ?
    `;

    database.query(query, [invoiceId], (err, rows) => {
        if (err) {
            console.error('Error fetching invoice details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        if (rows.length === 0) {
            res.status(404).send('Invoice not found');
            return;
        }

        const invoice = {
            invoice_id: rows[0].invoice_id,
            invoice_date: rows[0].invoice_date,
            total: rows[0].total,
            items: rows.map(row => ({
                item_code: row.item_code,
                unit: row.unit,
                description: row.description,
                quantity: row.quantity,
                price_per_item: row.price_per_item,
                extention: row.extention
            }))
        };

        // Render the invoice details page
        res.render('show-invoice', { title: 'Show Invoice', invoice });
    });
});

router.post('/invoices/send-pdf', (req, res) => {
    const { invoice_id, po_number, recipient } = req.body;

    const query = `
      SELECT i.invoice_id, i.invoice_date, i.total, ii.item_code, ii.quantity, ii.price_per_item, ii.extention, it.description, it.unit
      FROM invoices i
      JOIN invoice_items ii ON i.invoice_id = ii.invoice_id
      JOIN items it ON ii.item_code = it.item_code
      WHERE i.invoice_id = ?
    `;

    database.query(query, [invoice_id], (err, rows) => {
        if (err) {
            console.error('Error fetching invoice details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        if (rows.length === 0) {
            res.status(404).send('Invoice not found');
            return;
        }

        const invoice = {
            invoice_id: rows[0].invoice_id,
            invoice_date: rows[0].invoice_date,
            total: rows[0].total,
            items: rows.map(row => ({
                item_code: row.item_code,
                unit: row.unit,
                description: row.description,
                quantity: row.quantity,
                price_per_item: row.price_per_item,
                extention: row.extention
            }))
        };

        // Update the invoice object with the PO number and recipient
        invoice.po_number = po_number;
        invoice.recipient = recipient;

        // Set response headers for PDF download
        res.writeHead(200, {
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment;filename=invoice_${invoice_id}.pdf`,
        });

        // Generate the PDF and stream it to the response
        generatePDF.generateInvoicePDF(invoice, (chunk) => res.write(chunk), () => res.end());
    });
});


module.exports = router;
