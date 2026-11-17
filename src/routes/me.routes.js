const express = require('express');
const { getMe } = require('../controllers/me.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/', requireAuth, getMe);

module.exports = router;
