const express = require('express');
const {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
} = require('../controllers/profiles.controller');
const {
  createInvitation,
  listProfileMembers,
  removeProfileMember,
} = require('../controllers/profile-sharing.controller');
const {
  createAllergy,
  createMedication,
  deleteAllergy,
  deleteMedication,
  getMedicalDetails,
  listAllergies,
  listMedications,
  updateAllergy,
  updateMedicalDetails,
  updateMedication,
} = require('../controllers/profile-medical.controller');
const { requireAuth } = require('../middlewares/auth.middleware');

const router = express.Router();

router.post('/', requireAuth, createProfile);
router.get('/', requireAuth, listProfiles);
router.post('/:profileId/invitations', requireAuth, createInvitation);
router.get('/:profileId/members', requireAuth, listProfileMembers);
router.delete('/:profileId/members/:userId', requireAuth, removeProfileMember);
router.get('/:profileId/medical-details', requireAuth, getMedicalDetails);
router.patch('/:profileId/medical-details', requireAuth, updateMedicalDetails);
router.post('/:profileId/allergies', requireAuth, createAllergy);
router.get('/:profileId/allergies', requireAuth, listAllergies);
router.patch('/:profileId/allergies/:allergyId', requireAuth, updateAllergy);
router.delete('/:profileId/allergies/:allergyId', requireAuth, deleteAllergy);
router.post('/:profileId/medications', requireAuth, createMedication);
router.get('/:profileId/medications', requireAuth, listMedications);
router.patch('/:profileId/medications/:medicationId', requireAuth, updateMedication);
router.delete('/:profileId/medications/:medicationId', requireAuth, deleteMedication);
router.get('/:profileId', requireAuth, getProfile);
router.patch('/:profileId', requireAuth, updateProfile);
router.delete('/:profileId', requireAuth, deleteProfile);

module.exports = router;
