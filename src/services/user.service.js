const pool = require('../config/db');

class UserSyncError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'UserSyncError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function mapUser(row) {
  return {
    id: row.id,
    firebaseUid: row.firebase_uid,
    email: row.email,
    displayName: row.display_name,
    role: row.role_key,
    emailVerified: row.email_verified,
  };
}

async function syncFirebaseUser(decodedToken) {
  if (!decodedToken.email) {
    throw new UserSyncError('FIREBASE_EMAIL_REQUIRED', 422);
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO users (firebase_uid, email, display_name, email_verified)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (firebase_uid)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = COALESCE(EXCLUDED.display_name, users.display_name),
          email_verified = EXCLUDED.email_verified,
          is_active = TRUE,
          deleted_at = NULL
        RETURNING
          id,
          firebase_uid,
          email,
          display_name,
          role_key,
          email_verified
      `,
      [
        decodedToken.uid,
        decodedToken.email,
        decodedToken.name || null,
        decodedToken.email_verified === true,
      ],
    );

    return mapUser(result.rows[0]);
  } catch (error) {
    if (error.code === '23505') {
      throw new UserSyncError('USER_EMAIL_CONFLICT', 409);
    }

    throw error;
  }
}

module.exports = {
  UserSyncError,
  syncFirebaseUser,
};
