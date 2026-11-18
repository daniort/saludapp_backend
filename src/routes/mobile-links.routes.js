const express = require('express');
const {
  androidAssetLinks,
  appleAppSiteAssociation,
  invitationLanding,
} = require('../controllers/mobile-links.controller');

const router = express.Router();

router.get('/.well-known/assetlinks.json', androidAssetLinks);
router.get('/.well-known/apple-app-site-association', appleAppSiteAssociation);
router.get('/i/:token', invitationLanding);

module.exports = router;
