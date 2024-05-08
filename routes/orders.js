const express = require('express');
const router = express.Router();
const database = require('../database');

router.get('/orders', (req, res) => {
    // Fetch orders from the database
    const query = 'SELECT * FROM orders';

    database.query(query, (err, orders) => {
        if (err) {
            throw err;
        }

        // Render the 'orders' page with the fetched orders
        res.render('orders', { title: 'Orders', orders });
    });
})

router.get('/orders/add', (req, res) => {
    res.render('add-order', { title: 'Add Order', mode: 'add' });
})

// GET route to fetch invoice items based on invoice ID
router.get('/orders/invoice-items/:invoiceId', (req, res) => {
    const { invoiceId } = req.params;
    const query = 'SELECT * FROM invoice_items WHERE invoice_id = ?';

    database.query(query, [invoiceId], (err, items) => {
        if (err) {
            console.error('Error fetching invoice items:', err);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.json(items);
    });
});


module.exports = router;
