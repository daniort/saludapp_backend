const pool = require('../config/db');

class RegistrationProvisionError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'RegistrationProvisionError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function mapProfile(row) {
  const birthDate = row.birth_date instanceof Date
    ? row.birth_date.toISOString().slice(0, 10)
    : row.birth_date;

  return {
    id: row.id,
    profileType: row.profile_type,
    givenNames: row.given_names,
    paternalSurname: row.paternal_surname,
    maternalSurname: row.maternal_surname,
    birthDate,
    isOwner: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function provisionRegisteredUser(firebaseUser, personalProfile) {
  const client = await pool.connect();
  const displayName = [
    personalProfile.givenNames,
    personalProfile.paternalSurname,
    personalProfile.maternalSurname,
  ].filter(Boolean).join(' ');

  try {
    await client.query('BEGIN');

    const userResult = await client.query(
      `
        INSERT INTO users (
          firebase_uid,
          email,
          display_name,
          email_verified
        )
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (firebase_uid)
        DO UPDATE SET
          email = EXCLUDED.email,
          display_name = EXCLUDED.display_name,
          email_verified = EXCLUDED.email_verified,
          is_active = TRUE,
          deleted_at = NULL
        RETURNING id, firebase_uid, email, display_name
      `,
      [
        firebaseUser.uid,
        firebaseUser.email,
        displayName,
        firebaseUser.emailVerified === true,
      ],
    );

    const user = userResult.rows[0];

    const existingProfileResult = await client.query(
      `
        SELECT
          p.id,
          p.profile_type,
          p.given_names,
          p.paternal_surname,
          p.maternal_surname,
          p.birth_date,
          p.created_at,
          p.updated_at
        FROM profiles p
        INNER JOIN user_profiles up ON up.profile_id = p.id
        WHERE up.user_id = $1
          AND up.is_owner = TRUE
          AND up.deleted_at IS NULL
          AND p.profile_type = 'personal'
          AND p.deleted_at IS NULL
        LIMIT 1
      `,
      [user.id],
    );

    let profile;

    if (existingProfileResult.rowCount > 0) {
      profile = existingProfileResult.rows[0];
    } else {
      const profileResult = await client.query(
        `
          INSERT INTO profiles (
            profile_type,
            given_names,
            paternal_surname,
            maternal_surname,
            birth_date,
            created_by_user_id
          )
          VALUES ('personal', $1, $2, $3, $4, $5)
          RETURNING
            id,
            profile_type,
            given_names,
            paternal_surname,
            maternal_surname,
            birth_date,
            created_at,
            updated_at
        `,
        [
          personalProfile.givenNames,
          personalProfile.paternalSurname,
          personalProfile.maternalSurname,
          personalProfile.birthDate,
          user.id,
        ],
      );

      profile = profileResult.rows[0];

      await client.query(
        `
          INSERT INTO user_profiles (user_id, profile_id, is_owner)
          VALUES ($1, $2, TRUE)
        `,
        [user.id, profile.id],
      );
    }

    await client.query('COMMIT');

    return {
      localUserId: user.id,
      profile: mapProfile(profile),
    };
  } catch (error) {
    await client.query('ROLLBACK');

    if (error.code === '23505') {
      throw new RegistrationProvisionError('LOCAL_USER_CONFLICT', 409);
    }

    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  RegistrationProvisionError,
  provisionRegisteredUser,
};
