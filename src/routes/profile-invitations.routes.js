const express = require('express');
const {
  acceptInvitation,
  getInvitation,
} = require('../controllers/profile-sharing.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.get('/:token', getInvitation);
router.post('/:token/accept', requireAuth, acceptInvitation);

module.exports = router;
