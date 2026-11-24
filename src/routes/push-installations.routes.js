const express = require('express');
const {
  registerPushInstallation,
  removePushInstallation,
} = require('../controllers/push-installations.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.put('/installations', requireAuth, registerPushInstallation);
router.delete('/installations/:installationId', requireAuth, removePushInstallation);

module.exports = router;
