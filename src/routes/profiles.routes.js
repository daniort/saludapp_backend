const express = require('express');
const {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
} = require('../controllers/profiles.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, createProfile);
router.get('/', requireAuth, listProfiles);
router.get('/:profileId', requireAuth, getProfile);
router.patch('/:profileId', requireAuth, updateProfile);
router.delete('/:profileId', requireAuth, deleteProfile);

module.exports = router;
