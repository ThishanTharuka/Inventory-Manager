const express = require('express');
const router = express.Router();
const database = require('../database');

// GET route to fetch all orders
router.get('/orders', (req, res) => {
    const { search } = req.query;
    let orderQuery = 'SELECT * FROM orders';

    // If a search parameter is provided, filter orders based on it
    if (search) {
        orderQuery += ` WHERE order_id LIKE '%${search}%'`;
    }

    database.query(orderQuery, (err, orders) => {
        if (err) {
            throw err;
        }

        // Fetch additional details for each order
        const promises = orders.map((order) => {
            return new Promise((resolve, reject) => {
                const itemsQuery = `SELECT oi.item_code, i.description, oi.quantity
                FROM order_items oi
                JOIN items i ON oi.item_code = i.item_code
                WHERE oi.order_id = ?`;

                database.query(itemsQuery, [order.order_id], (err, items) => {
                    if (err) {
                        reject(err);
                    } else {
                        order.items = items;
                        resolve();
                    }
                });
            });
        });

        Promise.all(promises)
            .then(() => {
                res.render('orders', { title: 'Orders', orders, search });
            })
            .catch((error) => {
                console.error('Error fetching items for orders:', error);
                res.status(500).send('Internal Server Error');
            });
    });
});


// GET route to render the 'add order' form
router.get('/orders/add', (req, res) => {
    // Fetch items from the database
    const query = 'SELECT * FROM items'; // Change 'items' to your actual items table name
    database.query(query, (err, items) => {
        if (err) {
            console.error('Error fetching items:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        // Render the 'add order' page with the fetched items
        res.render('add-order', { title: 'Add Order', mode: 'add', items });
    });
});

// GET route to fetch invoice items based on invoice ID
router.get('/orders/invoice-items/:invoiceId', (req, res) => {
    const { invoiceId } = req.params;
    const query = 'SELECT * FROM invoice_items WHERE invoice_id = ?';
    database.query(query, [invoiceId], (err, items) => {
        if (err) {
            console.error('Error fetching invoice items:', err);
            res.status(500).json({ error: 'Internal server error' });
        } else {
            res.json(items); // Send response only if there are no errors
        }
    });
});

// POST route to handle form submission and add the order to the database
router.post('/add-order', (req, res) => {
    const { order_id, date, dealer_id, discount, invoice_id, item_codes, quantities } = req.body;
    const { invoice_quantities, invoice_item_codes} =  req.body;

    // Insert order details into the orders table
    const orderQuery = 'INSERT INTO orders (order_id, order_date, dealer_id, discount) VALUES (?, ?, ?, ?)';
    database.query(orderQuery, [order_id, date, dealer_id, discount], (err, result) => {
        if (err) {
            console.error('Error adding order:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }

        // Handle inserting invoice items if invoice_id is provided
        if (invoice_id) {
            // Construct an array to hold the data for each item from the invoice
            const invoiceItemsData = [];
            for (let i = 0; i < invoice_item_codes.length; i++) {
                const item_code = invoice_item_codes[i];
                const quantity = invoice_quantities[i];
                // Push item data to the array
                invoiceItemsData.push([order_id, item_code, quantity]);

                // Update stock quantities for each item
                const updateStockQuery = 'UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?';
                database.query(updateStockQuery, [quantity, item_code], (err, result) => {
                    if (err) {
                        console.error('Error updating stock quantities:', err);
                        // You might want to handle this error in some way
                    }
                });
            }

            // Construct the SQL query with multiple value sets for invoice items
            const invoiceItemsQuery = 'INSERT INTO order_items (order_id, item_code, quantity) VALUES ?';
            database.query(invoiceItemsQuery, [invoiceItemsData], (err, result) => {
                if (err) {
                    console.error('Error adding invoice items to order:', err);
                    res.status(500).json({ error: 'Internal server error' });
                    return;
                }
            });
        }

        // Handle inserting additional items
        if (item_codes && item_codes.length > 0) {
            // Construct an array to hold the data for each additional item
            const additionalItemsData = [];
            for (let i = 0; i < item_codes.length; i++) {
                const item_code = item_codes[i];
                const quantity = quantities[i];
                // Push item data to the array
                additionalItemsData.push([order_id, item_code, quantity]);

                // Update stock quantities for each additional item
                const updateStockQuery = 'UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?';
                database.query(updateStockQuery, [quantity, item_code], (err, result) => {
                    if (err) {
                        console.error('Error updating stock quantities:', err);
                        // You might want to handle this error in some way
                    }
                });
            }

            // Construct the SQL query with multiple value sets for additional items
            const additionalItemsQuery = 'INSERT INTO order_items (order_id, item_code, quantity) VALUES ?';
            database.query(additionalItemsQuery, [additionalItemsData], (err, result) => {
                if (err) {
                    console.error('Error adding additional items to order:', err);
                    res.status(500).json({ error: 'Internal server error' });
                    return;
                }
            });
        }

        // Redirect to the orders page after successfully adding the order
        res.redirect('/orders');
    });
});




module.exports = router;
