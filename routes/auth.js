/**************************************************************************
 * Authentication Routes
 * Description: Handles user authentication, including login, and logout.
 **************************************************************************/

// ===========================
// Import Dependencies
// ===========================
const express = require('express');
const router = express.Router();
const supabase = require('../supabase'); // Supabase client for authentication
const authMiddleware = require('../middleware/auth'); // Custom authentication middleware

// ===========================
// Routes
// ===========================

/**
 * GET /login
 * Renders the login page.
 * Includes optional logout message.
 */
router.get('/login', (req, res) => {
  res.render('login', { error: false, logout: req.query.logout || false });
});

/**
 * POST /login
 * Handles user login.
 * Validates input and authenticates the user with Supabase.
 * Stores user session securely upon successful login.
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  // Validate input
  if (!email || !password) {
    return res.render('login', { error: "Email and password are required.", logout: false });
  }

  if (!/\S+@\S+\.\S+/.test(email)) {
    return res.render('login', { error: "Invalid email format.", logout: false });
  }

  // Authenticate with Supabase
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    console.error('Login error:', error.message);
    return res.render('login', { error: "Invalid email or password.", logout: false });
  }

  // Store session securely
  req.session.user = { id: data.user.id, email: data.user.email }; // Only store necessary data
  res.redirect('/');
});

/**
 * POST /logout
 * Handles user logout.
 * Clears the user session and redirects to the login page.
 */
router.post('/logout', async (req, res) => {
  req.session.user = null; // Clear session
  res.redirect('/login'); // Redirect to login page after logout
});

// ===========================
// Export Router
// ===========================
module.exports = router;