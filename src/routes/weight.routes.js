const express = require('express');
const {
  weightReadingsController,
} = require('../controllers/health-measurements.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, weightReadingsController.createReading);
router.get('/', requireAuth, weightReadingsController.listReadings);
router.patch('/:readingId', requireAuth, weightReadingsController.updateReading);
router.delete('/:readingId', requireAuth, weightReadingsController.deleteReading);

module.exports = router;
