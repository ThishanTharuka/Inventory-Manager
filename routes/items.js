const express = require('express');
const router = express.Router();
const database = require('../database');


router.get('/items', (req, res) => {
    // Fetch items from the database
    const query = 'SELECT * FROM items';
  
    database.query(query, (err, items) => {
      if (err) {
        throw err;
      }
  
      // Render the 'items' page with the fetched items
      res.render('items', { title: 'Items', items });
    });
});

router.get('/items/add', (req, res) => {
    res.render('add-item', {title: 'Add Item'});
});

router.post('/add-item', (req, res) => {
    console.log(req.body);  // Log the entire req.body object


    var item_code = req.body.item_code;
    var description = req.body.description;
    var unit = req.body.unit;
    var quantity = req.body.quantity;
    var price = req.body.price;

    console.log(item_code, description, unit, quantity, price);

    var query = `INSERT INTO items (item_code, description, unit, quantity, price) VALUES ("${item_code}", "${description}", "${unit}", "${quantity}", "${price}")`;

    database.query(query, (err, result) => {
        if (err) {
            throw err;
        }
        console.log('Item has been added to the database');
        res.redirect('/items');
    });

});




module.exports = router;