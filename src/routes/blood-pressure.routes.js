const express = require('express');
const {
  createReading,
  deleteReading,
  listReadings,
  updateReading,
} = require('../controllers/blood-pressure.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, createReading);
router.get('/', requireAuth, listReadings);
router.patch('/:readingId', requireAuth, updateReading);
router.delete('/:readingId', requireAuth, deleteReading);

module.exports = router;
