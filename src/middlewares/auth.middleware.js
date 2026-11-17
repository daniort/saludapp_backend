const {
  FirebaseAdminConfigError,
  getFirebaseAdminAuth,
} = require('../config/firebase-admin');
const { UserSyncError, syncFirebaseUser } = require('../services/user.service');

function getBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== 'string') {
    return null;
  }

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

async function requireAuth(req, res, next) {
  const idToken = getBearerToken(req.get('authorization'));

  if (!idToken) {
    return res.status(401).json({
      error: {
        code: 'AUTH_TOKEN_REQUIRED',
        message: 'Se requiere un token de autenticación.',
      },
    });
  }

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(idToken);
    const user = await syncFirebaseUser(decodedToken);

    req.auth = decodedToken;
    req.user = user;
    return next();
  } catch (error) {
    if (error instanceof FirebaseAdminConfigError) {
      return res.status(503).json({
        error: {
          code: error.code,
          message: 'Firebase Admin no está configurado.',
        },
      });
    }

    if (error instanceof UserSyncError) {
      const messages = {
        FIREBASE_EMAIL_REQUIRED: 'La cuenta de Firebase no contiene un correo.',
        USER_EMAIL_CONFLICT: 'El correo ya pertenece a otro usuario local.',
      };

      return res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: messages[error.code],
        },
      });
    }

    if (error.code === 'auth/id-token-expired') {
      return res.status(401).json({
        error: {
          code: 'AUTH_TOKEN_EXPIRED',
          message: 'El token de autenticación expiró.',
        },
      });
    }

    if (typeof error.code === 'string' && error.code.startsWith('auth/')) {
      return res.status(401).json({
        error: {
          code: 'AUTH_TOKEN_INVALID',
          message: 'El token de autenticación no es válido.',
        },
      });
    }

    console.error('Authentication middleware error:', error.message);
    return res.status(503).json({
      error: {
        code: 'AUTH_SERVICE_UNAVAILABLE',
        message: 'No fue posible validar la autenticación.',
      },
    });
  }
}

module.exports = {
  getBearerToken,
  requireAuth,
};
