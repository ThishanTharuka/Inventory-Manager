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


router.get('/settlement-summary', (req, res) => {
    // SQL query to fetch all orders
    const ordersQuery = `
        SELECT order_id, order_date, total, settlement_amount, settlement_status, remarks
        FROM orders;
    `;

    // Execute the query
    database.query(ordersQuery, (err, orders) => {
        if (err) {
            throw err;
        }

        // Render order summary page with the fetched orders
        res.render('settlement-summary', { title: 'Settlement Summary', orders });
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


router.post('/add-order', (req, res) => {
    const { order_id, date, dealer_name, discounts, invoice_id, item_codes = [], prices = [], quantities = [] } = req.body;
    const { invoice_quantities = [], invoice_item_codes = [], invoice_discounts = [], invoice_prices = [] } = req.body;

    console.log('Request body:', req.body); // Debug statement

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

        // Check stock availability for invoice items
        const stockCheckPromises = (invoice_id ? invoice_item_codes : []).map((item_code, index) => {
            return new Promise((resolve, reject) => {
                const checkStockQuery = 'SELECT quantity FROM stocks WHERE item_code = ?';
                database.query(checkStockQuery, [item_code], (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    const availableQuantity = result[0]?.quantity || 0;
                    const requestedQuantity = invoice_quantities[index];
                    if (availableQuantity < requestedQuantity) {
                        reject(new Error(`Insufficient stock for item code ${item_code}`));
                    } else {
                        resolve();
                    }
                });
            });
        });

        // Check stock availability for additional items
        const additionalStockCheckPromises = item_codes.map((item_code, index) => {
            return new Promise((resolve, reject) => {
                const checkStockQuery = 'SELECT quantity FROM rep_stocks WHERE item_code = ?';
                database.query(checkStockQuery, [item_code], (err, result) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    const availableQuantity = result[0]?.quantity || 0;
                    const requestedQuantity = quantities[index];
                    if (availableQuantity < requestedQuantity) {
                        reject(new Error(`Insufficient stock for item code ${item_code}`));
                    } else {
                        resolve();
                    }
                });
            });
        });

        // Perform stock checks
        Promise.all([...stockCheckPromises, ...additionalStockCheckPromises])
            .then(() => {
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

                    const updateOrderTotal = () => {
                        const updateOrderTotalQuery = 'UPDATE orders SET total = ? WHERE order_id = ?';
                        console.log('Order total:', orderTotal);
                        database.query(updateOrderTotalQuery, [orderTotal, order_id], (err, result) => {
                            if (err) {
                                console.error('Error updating order total:', err);
                                res.status(500).json({ error: 'Internal server error' });
                                return;
                            }

                            // Redirect to the orders page after successfully adding the order
                            res.redirect('/orders');
                        });
                    };

                    // Handle inserting invoice items if invoice_id is provided
                    if (invoice_id) {
                        // Construct an array to hold the data for each item from the invoice
                        const invoiceItemsData = [];
                        const reducedItems = [];

                        const fetchDescriptionQuery = 'SELECT description FROM items WHERE item_code = ?';
                        const fetchDescriptionPromises = invoice_item_codes.map((item_code, index) => {
                            return new Promise((resolve, reject) => {
                                database.query(fetchDescriptionQuery, [item_code], (err, result) => {
                                    if (err) {
                                        reject(err);
                                        return;
                                    }
                                    const description = result[0]?.description || '';
                                    resolve(description);
                                });
                            });
                        });

                        Promise.all(fetchDescriptionPromises)
                            .then(descriptions => {
                                for (let i = 0; i < invoice_item_codes.length; i++) {
                                    const item_code = invoice_item_codes[i];
                                    const price = invoice_prices[i];
                                    const quantity = invoice_quantities[i];
                                    const discount = invoice_discounts[i];

                                    // Check if quantity has been reduced
                                    const originalQuantity = parseInt(req.body.original_invoice_quantities[i]);
                                    if (quantity < originalQuantity) {
                                        reducedItems.push({
                                            item_code,
                                            description: descriptions[i],
                                            quantity: originalQuantity - quantity
                                        });
                                    }

                                    // Calculate the total for the item
                                    const total = price * quantity * (1 - discount / 100); // Apply discount
                                    orderTotal += total; // Add to order total

                                    // Push item data to the array
                                    invoiceItemsData.push([order_id, item_code, price, quantity, discount, total, 'direct']); // stock_type is 'direct'
                                    console.log('Invoice items data:', invoiceItemsData);

                                    // Update stock quantities for each item
                                    const updateStockQuery = 'UPDATE stocks SET quantity = quantity - ? WHERE item_code = ?';
                                    database.query(updateStockQuery, [originalQuantity, item_code], (err, result) => {
                                        if (err) {
                                            console.error('Error updating stock quantities:', err);
                                            // You might want to handle this error in some way
                                        }
                                    });
                                }

                                // Construct the SQL query with multiple value sets for invoice items
                                const invoiceItemsQuery = 'INSERT INTO order_items (order_id, item_code, price_per_item, quantity, discount, total, stock_type) VALUES ?';
                                database.query(invoiceItemsQuery, [invoiceItemsData], (err, result) => {
                                    if (err) {
                                        console.error('Error adding invoice items to order:', err);
                                        res.status(500).json({ error: 'Internal server error' });
                                        return;
                                    }

                                    // Handle reduced items
                                    if (reducedItems.length > 0) {
                                        handleReducedItems(reducedItems, () => {
                                            // Proceed to update total and additional items
                                            if (item_codes && item_codes.length > 0) {
                                                handleAdditionalItems();
                                            } else {
                                                updateOrderTotal();
                                            }
                                        });
                                    } else {
                                        // Proceed to update total and additional items
                                        if (item_codes && item_codes.length > 0) {
                                            handleAdditionalItems();
                                        } else {
                                            updateOrderTotal();
                                        }
                                    }
                                });
                            })
                            .catch(err => {
                                console.error('Error fetching descriptions:', err);
                                res.status(500).json({ error: 'Internal server error' });
                            });
                    } else if (item_codes && item_codes.length > 0) {
                        handleAdditionalItems();
                    } else {
                        updateOrderTotal();
                    }

                    function handleAdditionalItems() {
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
                            additionalItemsData.push([order_id, item_code, price, quantity, discount, total, 'rep']); // stock_type is 'rep'

                            // Update rep stock quantities for each item
                            const updateRepStockQuery = 'UPDATE rep_stocks SET quantity = quantity - ? WHERE item_code = ?';
                            database.query(updateRepStockQuery, [quantity, item_code], (err, result) => {
                                if (err) {
                                    console.error('Error updating rep stock quantities:', err);
                                    // You might want to handle this error in some way
                                }
                            });
                        }

                        // Construct the SQL query with multiple value sets for additional items
                        const additionalItemsQuery = 'INSERT INTO order_items (order_id, item_code, price_per_item, quantity, discount, total, stock_type) VALUES ?';
                        database.query(additionalItemsQuery, [additionalItemsData], (err, result) => {
                            if (err) {
                                console.error('Error adding additional items to order:', err);
                                res.status(500).json({ error: 'Internal server error' });
                                return;
                            }

                            // Update the total for the order in the orders table
                            updateOrderTotal();
                        });
                    }
                });
            })
            .catch(err => {
                console.error('Error checking stock availability:', err);
                res.status(400).json({ error: err.message });
            });
    });
});

function handleReducedItems(reducedItems, callback) {
    const rep_order_id = Date.now().toString(); // Generate a unique order ID

    const items = reducedItems.map(item => ({
        item_code: item.item_code,
        description: item.description,
        quantity: item.quantity,
    }));

    console.log('Reduced items:', items);

    // Insert into reps_orders table
    const repOrderQuery = 'INSERT INTO reps_orders (order_id, order_date, order_type) VALUES (?, ?, ?)';
    database.query(repOrderQuery, [rep_order_id, new Date(), "Return"], (err, result) => {
        if (err) {
            console.error('Error adding reduced order:', err);
            callback(err);
            return;
        }

        // Insert into reps_order_items table
        const repOrderItemsData = items.map(item => [rep_order_id, item.item_code, item.quantity]);

        console.log('Reduced order items data:', repOrderItemsData);

        const repOrderItemsQuery = 'INSERT INTO reps_order_items (order_id, item_code, quantity) VALUES ?';
        database.query(repOrderItemsQuery, [repOrderItemsData], (err, result) => {
            if (err) {
                console.error('Error adding reduced order items:', err);
                callback(err);
                return;
            }

            // Update rep_stocks table
            const updateRepStockPromises = items.map(item => {
                return new Promise((resolve, reject) => {
                    const updateRepStockQuery = 'INSERT INTO rep_stocks (item_code, description, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?';
                    database.query(updateRepStockQuery, [item.item_code, item.description, item.quantity, item.quantity], (err, result) => {
                        if (err) {
                            reject(err);
                            return;
                        }
                        resolve();
                    });
                });
            });

            Promise.all(updateRepStockPromises)
                .then(() => {
                    callback(); // Successfully handled reduced items
                })
                .catch(err => {
                    console.error('Error updating rep stocks:', err);
                    callback(err);
                });
        });
    });
}





// Route to handle deleting an order
router.get('/orders/delete/:id', (req, res) => {
    const orderId = req.params.id;

    // SQL query to fetch order items quantities and stock types
    const getOrderItemsQuery = `SELECT item_code, quantity, stock_type FROM order_items WHERE order_id = ?`;

    // Execute the query to fetch order items quantities and stock types
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

                // Deduct removed item quantities from the appropriate stock
                const updateStockPromises = orderItems.map(item => {
                    const stockTable = item.stock_type === 'direct' ? 'stocks' : 'rep_stocks';
                    const updateStockQuery = `UPDATE ${stockTable} SET quantity = quantity + ? WHERE item_code = ?`;

                    return new Promise((resolve, reject) => {
                        database.query(updateStockQuery, [item.quantity, item.item_code], (err, result) => {
                            if (err) {
                                reject(err);
                            } else {
                                resolve(result);
                            }
                        });
                    });
                });

                // Execute all stock update queries
                Promise.all(updateStockPromises)
                    .then(() => {
                        console.log('Order deleted successfully');
                        res.redirect('/orders');
                    })
                    .catch(error => {
                        console.error('Error updating stock quantities:', error);
                        res.status(500).send('Internal Server Error');
                    });
            });
        });
    });
});


router.get('/orders/edit/:id', (req, res) => {
    const orderId = req.params.id;

    // Fetch order details, associated items, and dealer names from the database
    const query = `
        SELECT o.order_id, o.order_date, o.dealer_id, o.invoice_id, op.item_code, op.quantity, op.price_per_item, op.discount, op.stock_type, i.description AS item_name
        FROM orders o
        LEFT JOIN order_items op ON o.order_id = op.order_id
        LEFT JOIN items i ON op.item_code = i.item_code
        WHERE o.order_id = ?
    `;

    const dealersQuery = `SELECT shop_id, shop_name FROM dealers`;

    database.query(query, [orderId], (err, orderResults) => {
        if (err) {
            console.error('Error fetching order details:', err);
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
            const order = {
                order_id: orderResults[0].order_id,
                order_date: orderResults[0].order_date,
                dealer_id: orderResults[0].dealer_id,
                invoice_id: orderResults[0].invoice_id,
                items: orderResults.map(row => ({
                    item_code: row.item_code,
                    item_name: row.item_name,
                    quantity: row.quantity,
                    discount: row.discount,
                    price_per_item: row.price_per_item,
                    stock_type: row.stock_type
                }))
            };

            const dealers = dealerResults;

            // Render the edit order page with order details, associated items, and dealer names
            res.render('edit-order', { title: 'Edit Order', order, dealers });
        });
    });
});




router.post('/update-order', (req, res) => {
    const orderId = req.body.order_id;
    const newOrderDate = req.body.orderDate;
    const updatedItems = req.body.items;
    const shopId = req.body.shop_name; // Even though it says shop name it takes shop id from body

    console.log(orderId, newOrderDate, updatedItems, shopId);

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
        // Iterate over each updated item
        updatedItems.forEach(item => {
            const oldQuantity = item.old_quantity; // Retrieve the old quantity from the hidden input field
            const newQuantity = item.quantity;

            // Calculate the difference between old and new quantities
            const quantityDifference = newQuantity - oldQuantity;

            let stockTable = item.stock_type === 'direct' ? 'stocks' : 'rep_stocks';
            let updateStockQuery;

            // If the quantity difference is positive, it means more items have been removed from the stock than before, so we should decrease the stock
            if (quantityDifference > 0) {
                // Update the stock table by subtracting the quantity difference
                increaseStockQuery = `UPDATE ${stockTable} SET quantity = quantity - ? WHERE item_code = ?`;
                database.query(increaseStockQuery, [quantityDifference, item.item_code], (err, result) => {
                    if (err) {
                        console.error(`Error updating ${stockTable}:`, err);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    console.log(`Stock for item ${item.item_code} decreased by ${quantityDifference}`);
                });
            }
            // If the quantity difference is negative, it means less items are removed from the stock than before, so we should increase the stock
            else if (quantityDifference < 0) {
                // Update the stock table by adding the absolute value of the quantity difference
                decreaseStockQuery = `UPDATE ${stockTable} SET quantity = quantity + ? WHERE item_code = ?`;
                database.query(decreaseStockQuery, [-quantityDifference, item.item_code], (err, result) => {
                    if (err) {
                        console.error(`Error updating ${stockTable}:`, err);
                        res.status(500).send("Internal Server Error");
                        return;
                    }
                    console.log(`Stock for item ${item.item_code} increased by ${-quantityDifference}`);
                });
            }
            // If the quantity difference is zero, no change in stock is required
        });

        // Update dealer ID in the orders table
        const updateDealerIdQuery = `UPDATE orders SET dealer_id = ? WHERE order_id = ?`;
        database.query(updateDealerIdQuery, [shopId, orderId], (err, result) => {
            if (err) {
                console.error("Error updating dealer ID:", err);
                res.status(500).send("Internal Server Error");
                return;
            }
            console.log("Dealer ID updated successfully");
        });

        // Proceed with updating item quantities and prices
        updateItemQuantitiesAndTotal();

    }

    function updateItemQuantitiesAndTotal() {
        // Update quantities, prices, and calculate total extension for each item in the order_items table
        const updateItemsPromises = updatedItems.map(item => {
            const discount = item.discount;
            const extension = item.quantity * item.price_per_item * (1 - discount / 100);;
            const updateItemQuery = `UPDATE order_items SET quantity = ?, price_per_item = ?, discount = ?, total = ?, stock_type = ? WHERE order_id = ? AND item_code = ?`;
            return new Promise((resolve, reject) => {
                database.query(updateItemQuery, [item.quantity, item.price_per_item, discount, extension, item.stock_type, orderId, item.item_code], (err, result) => {
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
                console.error("Error updating item quantities and prices:", error);
                res.status(500).send("Internal Server Error");
            });
    }
});


// Fetch order details for settlement
router.get('/orders/settle/:id', (req, res) => {
    const orderId = req.params.id;
    const query = `
        SELECT o.order_id, o.order_date, o.dealer_id, o.invoice_id, o.total, o.settlement_amount, o.settlement_status, o.remarks, op.item_code, op.quantity, op.price_per_item, op.discount, i.description AS item_name
        FROM orders o
        LEFT JOIN order_items op ON o.order_id = op.order_id
        LEFT JOIN items i ON op.item_code = i.item_code
        WHERE o.order_id = ?
    `;

    database.query(query, [orderId], (err, orderResults) => {
        if (err) {
            console.error('Error fetching order details:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        const order = {
            order_id: orderResults[0].order_id,
            order_date: orderResults[0].order_date,
            dealer_id: orderResults[0].dealer_id,
            invoice_id: orderResults[0].invoice_id,
            total: orderResults[0].total,
            settlement_amount: orderResults[0].settlement_amount,
            settlement_status: orderResults[0].settlement_status,
            remarks: orderResults[0].remarks,
            items: orderResults.map(row => ({
                item_code: row.item_code,
                item_name: row.item_name,
                quantity: row.quantity,
                discount: row.discount,
                price_per_item: row.price_per_item
            }))
        };

        res.render('settle-order', { title: 'Settle Order', order });
    });
});

// Handle settlement form submission
router.post('/orders/settle/:id', (req, res) => {
    const orderId = req.params.id;
    const { settlement_amount, settlement_status, remarks } = req.body;

    const updateQuery = `
        UPDATE orders
        SET settlement_amount = ?, settlement_status = ?, remarks = ?
        WHERE order_id = ?
    `;

    database.query(updateQuery, [settlement_amount, settlement_status, remarks, orderId], (err, result) => {
        if (err) {
            console.error('Error updating order:', err);
            res.status(500).send('Internal Server Error');
            return;
        }

        res.redirect('/orders');
    });
});


module.exports = router;
