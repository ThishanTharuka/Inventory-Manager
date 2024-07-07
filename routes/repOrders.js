const express = require('express');
const router = express.Router();
const database = require('../database');
const { reject } = require('async');

// Get all Rep's orders
router.get('/rep-orders', (req, res) => {
    const { search } = req.query;
    let orderQuery = `SELECT 
                            i.order_id, 
                            i.order_date, 
                            ii.item_code, 
                            ii.quantity, 
                            it.description 
                        FROM 
                            reps_orders i 
                            JOIN reps_order_items ii ON i.order_id = ii.order_id 
                            JOIN items it ON ii.item_code = it.item_code`;

    // If a search parameter is provided, filter reps_orders based on it
    if (search) {
        orderQuery += ` WHERE i.order_id LIKE '%${search}%'`;
    }

    database.query(orderQuery, (err, rows) => {
        if (err) {
            console.error('Error fetching reps_orders:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Process rows to organize data into an array of reps_orders
        const reps_orders = [];

        rows.forEach(row => {
            // Check if order with this ID already exists in reps_orders array
            let existingOrder = reps_orders.find(order => order.order_id === row.order_id);

            if (!existingOrder) {
                // If order doesn't exist, create a new one
                existingOrder = {
                    order_id: row.order_id,
                    order_date: row.order_date,
                    items: []
                };
                reps_orders.push(existingOrder);
            }

            // Add item details to the items array of the existing order
            existingOrder.items.push({
                item_code: row.item_code,
                description: row.description,
                quantity: row.quantity,
            });
        });

        // Render the reps_orders page with fetched data
        res.render('rep-orders', { title: 'Rep\'s Orders', reps_orders, search });
    });
});


// Render the form for adding a new rep order
router.get('/rep-orders/add', (req, res) => {
    const itemsQuery = 'SELECT item_code, description, price FROM items';
    database.query(itemsQuery, (err, items) => {
        if (err) {
            console.error('Error fetching items:', err);
            res.status(500).send('Internal Server Error');
            return;
        }
        res.render('add-rep-order', { title: 'Add Rep Order', items });
    });
});


// Handle the form submission to add a new rep order
router.post('/rep-orders/add', (req, res) => {
    const { order_date, item_codes, quantities } = req.body;

    // Generate a unique order ID using the current timestamp
    const order_id = `${Date.now()}`;

    // Calculate total for each item and overall order total
    const items = item_codes.map((code, index) => ({
        item_code: code,
        quantity: parseInt(quantities[index], 10)
    }));

    const orderQuery = 'INSERT INTO reps_orders (order_id, order_date) VALUES (?, ?)';
    const orderItemsQuery = 'INSERT INTO reps_order_items (order_id, item_code, quantity) VALUES ?';

    // Check if all items exist in mathara_stocks table
    const checkItemsExistQuery = 'SELECT item_code FROM mathara_stocks WHERE item_code IN (?)';
    const itemCodesArray = items.map(item => item.item_code);

    database.query(checkItemsExistQuery, [itemCodesArray], (err, results) => {
        if (err) {
            console.error('Error checking items in stock:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        const existingItemCodes = results.map(row => row.item_code);
        const missingItems = items.filter(item => !existingItemCodes.includes(item.item_code));

        console.log(missingItems);

        if (missingItems.length > 0) {
            // Some items are missing in the mathara_stocks table
            res.status(400).send(`Error: The following items are not available in the Matara stock: ${missingItems.map(item => item.item_code).join(', ')}. Please check the availability of these items and try again.`);
            return;
        }

        // Begin transaction
        database.beginTransaction(err => {
            if (err) {
                console.error('Error beginning transaction:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            database.query(orderQuery, [order_id, order_date], (err) => {
                if (err) {
                    console.error('Error adding order:', err);
                    database.rollback(() => {
                        res.status(500).send('Internal Server Error');
                    });
                    return;
                }

                const orderItemsValues = items.map(item => [order_id, item.item_code, item.quantity]);
                database.query(orderItemsQuery, [orderItemsValues], (err) => {
                    if (err) {
                        console.error('Error adding order items:', err);
                        database.rollback(() => {
                            res.status(500).send('Internal Server Error');
                        });
                        return;
                    }

                    // Update stock quantities for each item in both stock tables
                    const updateStockQueries = items.flatMap(item => [
                        new Promise((resolve, reject) => {
                            const updateStockQuery = 'UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?';
                            database.query(updateStockQuery, [item.quantity, item.item_code], (err, result) => {
                                if (err) reject(err);
                                else resolve(result);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            const updateMatharaStockQuery = 'UPDATE mathara_stocks SET quantity = quantity - ? WHERE item_code = ?';
                            database.query(updateMatharaStockQuery, [item.quantity, item.item_code], (err, result) => {
                                if (err) reject(err);
                                else resolve(result);
                            });
                        }),
                        new Promise((resolve, reject) => {
                            const updateGalleStockQuery = 'INSERT INTO rep_stocks (item_code, description, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?';
                            database.query(updateGalleStockQuery, [item.item_code, item.description, item.quantity, item.quantity], (err, result) => {
                                if (err) reject(err);
                                else resolve(result);
                            });
                        })
                    ]);

                    Promise.all(updateStockQueries)
                        .then(() => {
                            database.commit(err => {
                                if (err) {
                                    console.error('Error committing transaction:', err);
                                    database.rollback(() => {
                                        res.status(500).send('Internal Server Error');
                                    });
                                    return;
                                }
                                res.redirect('/rep-orders');
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




// Handle the deletion of a rep order
router.get('/rep-orders/delete/:order_id', (req, res) => {
    const orderId = req.params.order_id;

    // Retrieve the items of the order to adjust stock quantities
    const getOrderItemsQuery = 'SELECT item_code, quantity FROM reps_order_items WHERE order_id = ?';

    database.query(getOrderItemsQuery, [orderId], (err, items) => {
        if (err) {
            console.error('Error fetching order items:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Delete the order and its items
        const deleteOrderItemsQuery = 'DELETE FROM reps_order_items WHERE order_id = ?';
        const deleteOrderQuery = 'DELETE FROM reps_orders WHERE order_id = ?';

        database.query(deleteOrderItemsQuery, [orderId], (err) => {
            if (err) {
                console.error('Error deleting order items:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            database.query(deleteOrderQuery, [orderId], (err) => {
                if (err) {
                    console.error('Error deleting order:', err);
                    res.status(500).send('Internal Server Error');
                    return;
                }

                // Update stock quantities in stocks, mathara_stocks, and rep_stocks
                const updateStockQueries = items.flatMap(item => [
                    new Promise((resolve, reject) => {
                        const updateStockQuery = 'UPDATE stocks SET quantity = quantity + ? WHERE item_code = ?';
                        database.query(updateStockQuery, [item.quantity, item.item_code], (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                    }),
                    new Promise((resolve, reject) => {
                        const updateMatharaStockQuery = 'UPDATE mathara_stocks SET quantity = quantity + ? WHERE item_code = ?';
                        database.query(updateMatharaStockQuery, [item.quantity, item.item_code], (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                    }),
                    new Promise((resolve, reject) => {
                        const updateRepStockQuery = 'UPDATE rep_stocks SET quantity = quantity - ? WHERE item_code = ?';
                        database.query(updateRepStockQuery, [item.quantity, item.item_code], (err, result) => {
                            if (err) reject(err);
                            else resolve(result);
                        });
                    })
                ]);

                Promise.all(updateStockQueries)
                    .then(() => {
                        res.redirect('/rep-orders');
                    })
                    .catch(err => {
                        console.error('Error updating stock quantities:', err);
                        res.status(500).send('Internal Server Error');
                    });
            });
        });
    });
});


// Route to render the edit form for a rep order
router.get('/rep-orders/edit/:order_id', (req, res) => {
    const orderId = req.params.order_id;

    // SQL query to fetch the order details
    const orderQuery = `SELECT 
                            i.order_id, 
                            i.order_date, 
                            ii.item_code, 
                            ii.quantity, 
                            it.description 
                        FROM 
                            reps_orders i 
                            JOIN reps_order_items ii ON i.order_id = ii.order_id 
                            JOIN items it ON ii.item_code = it.item_code 
                        WHERE 
                            i.order_id = ?`;

    database.query(orderQuery, [orderId], (err, rows) => {
        if (err) {
            console.error('Error fetching order details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // If order not found, send 404 response
        if (rows.length === 0) {
            res.status(404).send('Order not found');
            return;
        }

        // Process rows to organize data into a single order object
        const order = {
            order_id: rows[0].order_id,
            order_date: rows[0].order_date,
            items: rows.map(row => ({
                item_code: row.item_code,
                description: row.description,
                quantity: row.quantity,
                price: row.price
            }))
        };

        // Fetch all items for the item dropdowns
        const itemsQuery = 'SELECT item_code, description, price FROM items';
        database.query(itemsQuery, (err, items) => {
            if (err) {
                console.error('Error fetching items:', err);
                res.status(500).send('Internal Server Error');
                return;
            }

            // Render the edit form with the order details and items
            res.render('edit-rep-order', { title: 'Edit Rep Order', order, items });
        });
    });
});


// Handle the form submission to update a rep order
router.post('/update-rep-order', (req, res) => {
    const { order_id, orderDate, items } = req.body;

    // Calculate the changes in quantity for each item
    const updateItems = items.map(item => ({
        item_code: item.item_code,
        description: item.description,
        old_quantity: parseInt(item.old_quantity, 10),
        new_quantity: parseInt(item.quantity, 10)
    }));

    // Begin transaction
    database.beginTransaction(err => {
        if (err) {
            console.error('Error beginning transaction:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        // Fetch the current order date to compare with the new order date
        const fetchOrderQuery = 'SELECT order_date FROM reps_orders WHERE order_id = ?';
        database.query(fetchOrderQuery, [order_id], (err, results) => {
            if (err) {
                console.error('Error fetching current order date:', err);
                database.rollback(() => {
                    res.status(500).send('Internal Server Error');
                });
                return;
            }

            const currentOrderDate = results[0].order_date;

            // Only update the order date if it has changed and a new date is provided
            const updateOrderDatePromise = (orderDate && new Date(orderDate).toLocaleDateString() !== new Date(currentOrderDate).toLocaleDateString())
                ? new Promise((resolve, reject) => {
                    const updateOrderDateQuery = 'UPDATE reps_orders SET order_date = ? WHERE order_id = ?';
                    database.query(updateOrderDateQuery, [orderDate, order_id], (err) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve();
                        }
                    });
                })
                : Promise.resolve();

            updateOrderDatePromise
                .then(() => {
                    // Update rep order items
                    const updateOrderItemsQuery = 'UPDATE reps_order_items SET quantity = ? WHERE order_id = ? AND item_code = ?';
                    const updateOrderItemsPromises = updateItems.map(item => {
                        return new Promise((resolve, reject) => {
                            database.query(updateOrderItemsQuery, [item.new_quantity, order_id, item.item_code], (err, result) => {
                                if (err) {
                                    reject(err);
                                } else {
                                    resolve(result);
                                }
                            });
                        });
                    });

                    Promise.all(updateOrderItemsPromises)
                        .then(() => {
                            // Update stock quantities for each item in both stock tables
                            const updateStockQueries = updateItems.flatMap(item => [
                                new Promise((resolve, reject) => {
                                    const updateStockQuery = 'UPDATE stocks SET quantity = quantity + ? WHERE item_code = ?';
                                    database.query(updateStockQuery, [item.old_quantity - item.new_quantity, item.item_code], (err, result) => {
                                        if (err) reject(err);
                                        else resolve(result);
                                    });
                                }),
                                new Promise((resolve, reject) => {
                                    const updateMatharaStockQuery = 'UPDATE mathara_stocks SET quantity = quantity + ? WHERE item_code = ?';
                                    database.query(updateMatharaStockQuery, [item.old_quantity - item.new_quantity, item.item_code], (err, result) => {
                                        if (err) reject(err);
                                        else resolve(result);
                                    });
                                }),
                                new Promise((resolve, reject) => {
                                    const updateRepStockQuery = 'INSERT INTO rep_stocks (item_code, description, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity - ?';
                                    database.query(updateRepStockQuery, [item.item_code, item.description, item.old_quantity - item.new_quantity, item.old_quantity - item.new_quantity], (err, result) => {
                                        if (err) reject(err);
                                        else resolve(result);
                                    });
                                })
                            ]);

                            Promise.all(updateStockQueries)
                                .then(() => {
                                    database.commit(err => {
                                        if (err) {
                                            console.error('Error committing transaction:', err);
                                            database.rollback(() => {
                                                res.status(500).send('Internal Server Error');
                                            });
                                            return;
                                        }
                                        res.redirect('/rep-orders');
                                    });
                                })
                                .catch(err => {
                                    console.error('Error updating stock quantities:', err);
                                    database.rollback(() => {
                                        res.status(500).send('Internal Server Error');
                                    });
                                });
                        })
                        .catch(err => {
                            console.error('Error updating rep order items:', err);
                            database.rollback(() => {
                                res.status(500).send('Internal Server Error');
                            });
                        });
                })
                .catch(err => {
                    console.error('Error updating rep order date:', err);
                    database.rollback(() => {
                        res.status(500).send('Internal Server Error');
                    });
                });
        });
    });
});



module.exports = router;
