const express = require('express');
const router = express.Router();
const database = require('../database');

// GET route to fetch all orders and invoices
router.get('/compare-orders', (req, res) => {
    const { order_id, invoice_id } = req.query;

    let orderPromise = Promise.resolve(null);
    let invoicePromise = Promise.resolve(null);

    if (order_id) {
        let orderQuery = `
            SELECT o.*, d.shop_name AS dealer_name
            FROM orders o
            JOIN dealers d ON o.dealer_id = d.shop_id
            WHERE o.order_id = ?
        `;

        orderPromise = new Promise((resolve, reject) => {
            database.query(orderQuery, [order_id], (err, orders) => {
                if (err) {
                    reject(err);
                } else if (orders.length > 0) {
                    const order = orders[0];
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
                            resolve(order);
                        }
                    });
                } else {
                    resolve(null);
                }
            });
        });
    }

    if (invoice_id) {
        let invoiceQuery = `
            SELECT i.*, ii.item_code, ii.quantity, ii.price_per_item, ii.extention, it.description 
            FROM invoices i
            JOIN invoice_items ii ON i.invoice_id = ii.invoice_id
            JOIN items it ON ii.item_code = it.item_code
            WHERE i.invoice_id = ?
        `;

        invoicePromise = new Promise((resolve, reject) => {
            database.query(invoiceQuery, [invoice_id], (err, rows) => {
                if (err) {
                    reject(err);
                } else if (rows.length > 0) {
                    const invoice = {
                        invoice_id: rows[0].invoice_id,
                        invoice_date: new Date(rows[0].invoice_date),
                        total: rows[0].total,
                        items: []
                    };
                    rows.forEach(row => {
                        invoice.items.push({
                            item_code: row.item_code,
                            description: row.description,
                            quantity: row.quantity,
                            price_per_item: row.price_per_item,
                            extention: row.extention
                        });
                    });
                    resolve(invoice);
                } else {
                    resolve(null);
                }
            });
        });
    }

    Promise.all([orderPromise, invoicePromise])
        .then(([order, invoice]) => {
            res.render('compare-orders', {
                title: 'Compare Orders',
                order,
                invoice,
                searchOrder: order_id,
                searchInvoice: invoice_id
            });
        })
        .catch(err => {
            console.error('Error fetching orders or invoices:', err);
            res.status(500).send('Internal Server Error');
        });
});

module.exports = router;
