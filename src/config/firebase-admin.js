const { getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { cert } = require('firebase-admin/app');
const { getMessaging } = require('firebase-admin/messaging');

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

  const app = getApps()[0] || initializeApp(firebaseOptions(projectId));
  return getAuth(app);
}

function firebaseOptions(projectId = process.env.FIREBASE_PROJECT_ID) {
  const serializedServiceAccount = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!serializedServiceAccount) return { projectId };

  const serviceAccount = JSON.parse(serializedServiceAccount);
  return { credential: cert(serviceAccount), projectId };
}

function getFirebaseAdminMessaging() {
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) throw new FirebaseAdminConfigError();
  const app = getApps()[0] || initializeApp(firebaseOptions(projectId));
  return getMessaging(app);
}

module.exports = {
  FirebaseAdminConfigError,
  getFirebaseAdminAuth,
  getFirebaseAdminMessaging,
};
