const express = require('express');
const router = express.Router();
const database = require('../database');

// GET route to fetch all orders
router.get('/orders', (req, res) => {
    const { search } = req.query;
    let orderQuery = `
        SELECT o.*, d.shop_name AS dealer_name
        FROM orders o
        JOIN dealers d ON o.dealer_id = d.shop_id
    `;

    // If a search parameter is provided, filter orders based on it
    if (search) {
        orderQuery += ` WHERE o.order_id LIKE '%${search}%'`;
    }

    database.query(orderQuery, (err, orders) => {
        if (err) {
            console.error('Error fetching orders:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Fetch additional details for each order
        const promises = orders.map((order) => {
            return new Promise((resolve, reject) => {
                const itemsQuery = `
                    SELECT oi.item_code, i.description, oi.quantity, oi.price_per_item, oi.total, oi.discount
                    FROM order_items oi
                    JOIN items i ON oi.item_code = i.item_code
                    WHERE oi.order_id = ?
                `;

                database.query(itemsQuery, [order.order_id], (err, items) => {
                    if (err) {
                        reject(err);
                    } else {
                        order.order_date = new Date(order.order_date);
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
    const itemsQuery = 'SELECT * FROM items'; // Change 'items' to your actual items table name
    const dealersQuery = 'SELECT * FROM dealers'; // Fetch dealer names
    database.query(itemsQuery, (err, items) => {
        if (err) {
            console.error('Error fetching items:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        // Fetch dealers from the database
        database.query(dealersQuery, (err, dealers) => {
            if (err) {
                console.error('Error fetching dealers:', err);
                res.status(500).json({ error: 'Internal server error' });
                return;
            }
            // Render the 'add order' page with the fetched items and dealers
            res.render('add-order', { title: 'Add Order', mode: 'add', items, dealers });
        });
    });
});

// Route to fetch item name based on item code
router.get('/items/:itemCode', (req, res) => {
    const { itemCode } = req.params;

    // Query the database to fetch the item name based on item code
    const query = 'SELECT description FROM items WHERE item_code = ?';
    database.query(query, [itemCode], (err, result) => {
        if (err) {
            console.error('Error fetching item name:', err);
            res.status(500).json({ error: 'Internal server error' });
        } else {
            if (result.length === 0) {
                res.status(404).json({ error: 'Item not found' });
            } else {
                const itemName = result[0].description;
                res.json({ description: itemName });
            }
        }
    });
});

// GET route to fetch invoice items based on invoice ID
router.get('/orders/invoice-items/:invoiceId', (req, res) => {
    const { invoiceId } = req.params;
    const query = `
        SELECT ii.item_code, i.description, ii.quantity
        FROM invoice_items ii
        JOIN items i ON ii.item_code = i.item_code
        WHERE ii.invoice_id = ?`;
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
    const { order_id, date, dealer_name, discounts, invoice_id, item_codes, prices, quantities } = req.body;
    const { invoice_quantities, invoice_item_codes, invoice_discounts, invoice_prices } = req.body;

    // Query to get shop_id from dealers table based on shop_name
    const dealerQuery = 'SELECT shop_id FROM dealers WHERE shop_name = ?';
    database.query(dealerQuery, [dealer_name], (err, dealerResult) => {
        if (err) {
            console.error('Error fetching shop_id:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }

        // If dealer not found, handle error
        if (dealerResult.length === 0) {
            console.error('Dealer not found');
            res.status(404).json({ error: 'Dealer not found' });
            return;
        }

        // Get the shop_id from the dealerResult
        const dealer_id = dealerResult[0].shop_id;

        // Insert order details into the orders table
        const orderQuery = 'INSERT INTO orders (order_id, order_date, dealer_id, invoice_id) VALUES (?, ?, ?, ?)';
        database.query(orderQuery, [order_id, date, dealer_id, invoice_id], (err, result) => {
            if (err) {
                console.error('Error adding order:', err);
                res.status(500).json({ error: 'Internal server error' });
                return;
            }

            // Calculate total for the order
            let orderTotal = 0;

            // Handle inserting invoice items if invoice_id is provided
            if (invoice_id) {
                // Construct an array to hold the data for each item from the invoice
                const invoiceItemsData = [];
                for (let i = 0; i < invoice_item_codes.length; i++) {
                    const item_code = invoice_item_codes[i];
                    const price = invoice_prices[i];
                    const quantity = invoice_quantities[i];
                    const discount = invoice_discounts[i];

                    // Calculate the total for the item
                    const total = price * quantity * (1 - discount / 100); // Apply discount
                    orderTotal += total; // Add to order total

                    // Push item data to the array
                    invoiceItemsData.push([order_id, item_code, price, quantity, discount, total]);

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
                const invoiceItemsQuery = 'INSERT INTO order_items (order_id, item_code, price_per_item, quantity, discount, total) VALUES ?';
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
                    const price = prices[i];
                    const quantity = quantities[i];
                    const discount = discounts[i];

                    // Calculate the total for the item
                    const total = price * quantity * (1 - discount / 100); // Apply discount
                    orderTotal += total; // Add to order total

                    // Push item data to the array
                    additionalItemsData.push([order_id, item_code, price, quantity, discount, total]);

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
                const additionalItemsQuery = 'INSERT INTO order_items (order_id, item_code, price_per_item, quantity, discount, total) VALUES ?';
                database.query(additionalItemsQuery, [additionalItemsData], (err, result) => {
                    if (err) {
                        console.error('Error adding additional items to order:', err);
                        res.status(500).json({ error: 'Internal server error' });
                        return;
                    }
                });
            }

            // Update the total for the order in the orders table
            const updateOrderTotalQuery = 'UPDATE orders SET total = ? WHERE order_id = ?';
            database.query(updateOrderTotalQuery, [orderTotal, order_id], (err, result) => {
                if (err) {
                    console.error('Error updating order total:', err);
                    res.status(500).json({ error: 'Internal server error' });
                    return;
                }
            });

            // Redirect to the orders page after successfully adding the order
            res.redirect('/orders');
        });
    });
});

// Route to handle deleting an order
router.get('/orders/delete/:id', (req, res) => {
    const orderId = req.params.id;

    // SQL query to fetch order items quantities
    const getOrderItemsQuery = `SELECT item_code, quantity FROM order_items WHERE order_id = ?`;

    // Execute the query to fetch order items quantities
    database.query(getOrderItemsQuery, [orderId], (err, orderItems) => {
        if (err) {
            console.error('Error fetching order items:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // SQL query to delete order items related to the order
        const deleteOrderItemsQuery = `DELETE FROM order_items WHERE order_id = ?`;

        // Execute the query to delete order items
        database.query(deleteOrderItemsQuery, [orderId], (err, result) => {
            if (err) {
                console.error('Error deleting order items:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            // SQL query to delete order from orders table
            const deleteOrderQuery = `DELETE FROM orders WHERE order_id = ?`;

            // Execute the query to delete order
            database.query(deleteOrderQuery, [orderId], (err, result) => {
                if (err) {
                    console.error('Error deleting order:', err);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Deduct removed item quantities from stock
                orderItems.forEach(item => {
                    const updateStockQuery = `UPDATE stocks SET quantity = quantity + ? WHERE item_code = ?`;
                    database.query(updateStockQuery, [item.quantity, item.item_code], (err, result) => {
                        if (err) {
                            console.error('Error updating stock quantity:', err);
                            res.status(500).send('Internal Server Error');
                            return;
                        }
                    });
                });

                console.log('Order deleted successfully');
                res.redirect('/orders');
            });
        });
    });
});

router.get('/orders/edit/:id', (req, res) => {
    const orderId = req.params.id;

    // Fetch order details and associated items from the database
    const query = `
        SELECT o.order_id, o.order_date, o.dealer_id, o.invoice_id, op.item_code, op.quantity, op.price_per_item
        FROM orders o
        LEFT JOIN order_items op ON o.order_id = op.order_id
        WHERE o.order_id = ?
    `;

    database.query(query, [orderId], (err, results) => {
        if (err) {
            console.error('Error fetching order details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Organize fetched data into a structured format
        const order = {
            order_id: results[0].order_id,
            order_date: results[0].order_date,
            dealer_id: results[0].dealer_id,
            invoice_id: results[0].invoice_id,
            items: results.map(row => ({
                item_code: row.item_code,
                quantity: row.quantity,
                price_per_item: row.price_per_item
            }))
        };

        // Render the edit order page with order details and associated items
        res.render('edit-order', { title: 'Edit Order', order });
    });
});

router.post('/update-order', (req, res) => {
    const orderId = req.body.order_id;
    const newOrderDate = req.body.orderDate;
    const updatedItems = req.body.items;

    console.log(orderId, newOrderDate, updatedItems);

    // Validate if updatedItems is an array
    if (!Array.isArray(updatedItems)) {
        console.error("Items data is missing or invalid.");
        res.status(400).send("Items data is missing or invalid.");
        return;
    }

    // Update the order date in the orders table if a new date is provided
    if (newOrderDate) {
        const updateOrderDateQuery = `UPDATE orders SET order_date = ? WHERE order_id = ?`;
        database.query(updateOrderDateQuery, [newOrderDate, orderId], (err, result) => {
            if (err) {
                console.error("Error updating order date:", err);
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
        // Update quantities, prices, and calculate total extension for each item in the order_items table
        const updateItemsPromises = updatedItems.map(item => {
            const extension = item.quantity * item.price_per_item;
            const updateItemQuery = `UPDATE order_items SET quantity = ?, price_per_item = ?, total = ? WHERE order_id = ? AND item_code = ?`;
            return new Promise((resolve, reject) => {
                database.query(updateItemQuery, [item.quantity, item.price_per_item, extension, orderId, item.item_code[0]], (err, result) => {
                    if (err) {
                        reject(err);
                    } else {
                        resolve(extension); // Resolve with the extension value
                    }
                });
            });
        });

        // Update dealer ID in the orders table
        const updateDealerIdQuery = `UPDATE orders SET dealer_id = ? WHERE order_id = ?`;
        const dealerId = req.body.dealer_id; // Assuming dealer_id is provided in the request body
        const updateDealerIdPromise = new Promise((resolve, reject) => {
            database.query(updateDealerIdQuery, [dealerId, orderId], (err, result) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        Promise.all([...updateItemsPromises, updateDealerIdPromise])
            .then(extensions => {
                // Calculate the total by summing up all extensions
                console.log(extensions);
                const total = extensions.reduce((acc, curr) => {
                    if (!isNaN(curr)) {
                        return acc + curr;
                    } else {
                        return acc; // Exclude undefined or NaN values from the sum
                    }
                }, 0);
                console.log(total);
                // Update the total column in the orders table
                const updateTotalQuery = `UPDATE orders SET total = ? WHERE order_id = ?`;
                database.query(updateTotalQuery, [total, orderId], (err, result) => {
                    if (err) {
                        console.error("Error updating total:", err);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    console.log("Order items updated successfully");
                    res.redirect("/orders");
                });
            })
            .catch(error => {
                console.error("Error updating item quantities, prices, and dealer ID:", error);
                res.status(500).send("Internal Server Error");
            });
    }

});





module.exports = router;
