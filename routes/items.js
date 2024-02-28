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
    var price = req.body.price;

    console.log(item_code, description, unit, price);

    var query = `INSERT INTO items (item_code, description, unit, price) VALUES ("${item_code}", "${description}", "${unit}", "${price}")`;

    database.query(query, (err, result) => {
        if (err) {
            // Check for duplicate key error
            if (err.code === 'ER_DUP_ENTRY') {
                console.log('Duplicate entry for item_code');
                // You can choose to render an error page or send a specific message
                return res.send('<script>alert("This Item code already exists!"); window.location="/items/add";</script>');
            } else {
                // For other errors, log and throw
                throw err;
            }
        }
        console.log('Item has been added to the database');
        res.redirect('/items');
    });

});




module.exports = router;