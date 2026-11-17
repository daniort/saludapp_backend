const express = require('express');
const {
  googleLogin,
  login,
  logout,
  refresh,
  register,
} = require('../controllers/auth.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/register', register);
router.post('/login', login);
router.post('/login/google', googleLogin);
router.post('/refresh', refresh);
router.post('/logout', requireAuth, logout);

module.exports = router;
