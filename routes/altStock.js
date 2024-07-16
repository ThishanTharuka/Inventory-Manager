const express = require('express');
const router = express.Router();
const async = require('async');
const database = require('../database');


router.get('/alt-stock', (req, res) => {
    const combinedQuery = `
    SELECT 
        s.item_code, 
        s.description, 
        s.quantity AS stock_quantity, 
        COALESCE(ms.quantity, 0) AS mathara_quantity, 
        COALESCE(rs.quantity, 0) AS rep_quantity,
        COALESCE(incoming.total_quantity, 0) AS incoming_quantity,
        COALESCE(mathara_incoming.total_quantity, 0) AS mathara_incoming_quantity,
        COALESCE(direct_sale.total_quantity, 0) AS direct_sold_quantity,
        COALESCE(rep_sale.total_quantity, 0) AS rep_sold_quantity
    FROM 
        stocks s
    LEFT JOIN 
        mathara_stocks ms ON s.item_code = ms.item_code
    LEFT JOIN 
        rep_stocks rs ON s.item_code = rs.item_code
    LEFT JOIN (
        SELECT 
            item_code, 
            SUM(quantity) AS total_quantity
        FROM 
            invoice_items
        GROUP BY 
            item_code
    ) incoming ON s.item_code = incoming.item_code
    LEFT JOIN (
        SELECT 
            ii.item_code, 
            SUM(ii.quantity) AS total_quantity
        FROM 
            invoice_items ii
        JOIN 
            invoices i ON ii.invoice_id = i.invoice_id
        WHERE 
            i.stock_type = 'mathara'
        GROUP BY 
            ii.item_code
    ) mathara_incoming ON s.item_code = mathara_incoming.item_code
    LEFT JOIN (
        SELECT 
            item_code, 
            SUM(quantity) AS total_quantity
        FROM 
            order_items
        GROUP BY 
            item_code
    ) direct_sale ON s.item_code = direct_sale.item_code
    LEFT JOIN (
        SELECT 
            item_code, 
            SUM(quantity) AS total_quantity
        FROM 
            rep_invoice_items
        GROUP BY 
            item_code
    ) rep_sale ON s.item_code = rep_sale.item_code;
`;    
    database.query(combinedQuery, (err, altStocks) => {
        if (err) {
            res.redirect('/altStock');
        }
        res.render('alt-stock', { title: 'Mathara Stock', altStocks});
    });
});


router.get('/rep-stock', (req, res) => {
    let query = "SELECT * FROM rep_stocks";
    database.query(query, (err, rep_stocks) => {
        if (err) {
            res.redirect('/altStock');
        }
        res.render('rep-stock', { title: 'Rep\'s Stock', rep_stocks});
    });
});


module.exports = router;
