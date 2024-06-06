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
                            i.total AS full_total,
                            ii.item_code, 
                            ii.quantity, 
                            ii.price_per_item, 
                            ii.total, 
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
                    full_total: row.full_total,
                    items: []
                };
                reps_orders.push(existingOrder);
            }

            // Add item details to the items array of the existing order
            existingOrder.items.push({
                item_code: row.item_code,
                description: row.description,
                quantity: row.quantity,
                price_per_item: row.price_per_item,
                total: row.total
            });
        });

        // Render the reps_orders page with fetched data
        res.render('rep-orders', { title: 'Rep\'s Orders', reps_orders, search });
    });
});


// Render the form for adding a new rep order
router.get('/rep-orders/add', (req, res) => {
    const itemsQuery = 'SELECT item_code, description FROM items';
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
    const { order_id, order_date, item_codes, descriptions, quantities, prices } = req.body;

    // Calculate total for each item and overall order total
    const items = item_codes.map((code, index) => ({
        item_code: code,
        description: descriptions[index],
        quantity: parseInt(quantities[index], 10),
        price_per_item: parseFloat(prices[index]),
        total: parseInt(quantities[index], 10) * parseFloat(prices[index])
    }));
    const order_total = items.reduce((sum, item) => sum + item.total, 0);

    const orderQuery = 'INSERT INTO reps_orders (order_id, order_date, total) VALUES (?, ?, ?)';
    const orderItemsQuery = 'INSERT INTO reps_order_items (order_id, item_code, quantity, price_per_item, total) VALUES ?';

    database.query(orderQuery, [order_id, order_date, order_total], (err) => {
        if (err) {
            console.error('Error adding order:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        const orderItemsValues = items.map(item => [order_id, item.item_code, item.quantity, item.price_per_item, item.total]);
        database.query(orderItemsQuery, [orderItemsValues], (err) => {
            if (err) {
                console.error('Error adding order items:', err);
                res.status(500).send('Internal Server Error');
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
                new Promise((resolve,reject) => {
                    const updateGalleStockQuery = 'INSERT INTO rep_stocks (item_code, description, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?';
                    database.query(updateGalleStockQuery, [item.item_code, item.description, item.quantity, item.quantity], (err, result) => {
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




module.exports = router;
