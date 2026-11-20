const express = require('express');
const {
  temperatureReadingsController,
} = require('../controllers/health-measurements.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, temperatureReadingsController.createReading);
router.get('/', requireAuth, temperatureReadingsController.listReadings);
router.patch('/:readingId', requireAuth, temperatureReadingsController.updateReading);
router.delete('/:readingId', requireAuth, temperatureReadingsController.deleteReading);

module.exports = router;
