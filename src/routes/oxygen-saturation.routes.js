const express = require('express');
const {
  oxygenSaturationReadingsController,
} = require('../controllers/health-measurements.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, oxygenSaturationReadingsController.createReading);
router.get('/', requireAuth, oxygenSaturationReadingsController.listReadings);
router.patch('/:readingId', requireAuth, oxygenSaturationReadingsController.updateReading);
router.delete('/:readingId', requireAuth, oxygenSaturationReadingsController.deleteReading);

module.exports = router;
