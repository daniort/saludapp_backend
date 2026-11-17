const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');

class FirebaseAdminConfigError extends Error {
  constructor() {
    super('FIREBASE_PROJECT_ID is not configured');
    this.name = 'FirebaseAdminConfigError';
    this.code = 'FIREBASE_ADMIN_NOT_CONFIGURED';
  }
}

function getFirebaseAdminAuth() {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new FirebaseAdminConfigError();
  }

  const app = getApps()[0] || initializeApp({ projectId });
  return getAuth(app);
}

module.exports = {
  FirebaseAdminConfigError,
  getFirebaseAdminAuth,
};
