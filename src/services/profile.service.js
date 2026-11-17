const pool = require('../config/db');

class ProfileError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'ProfileError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function mapProfile(row) {
  const birthDate = row.birth_date instanceof Date
    ? row.birth_date.toISOString().slice(0, 10)
    : row.birth_date;

  const accessRole = row.access_role || (row.is_owner ? 'owner' : 'viewer');

  return {
    id: row.id,
    profileType: row.profile_type,
    givenNames: row.given_names,
    paternalSurname: row.paternal_surname,
    maternalSurname: row.maternal_surname,
    birthDate,
    accessRole,
    isOwner: accessRole === 'owner',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createProfile(userId, profile) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Impide que dos peticiones concurrentes creen dos perfiles personales.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);

    if (profile.profileType === 'personal') {
      const existingProfile = await client.query(
        `
          SELECT p.id
          FROM profiles p
          INNER JOIN user_profiles up ON up.profile_id = p.id
          WHERE up.user_id = $1
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.profile_type = 'personal'
            AND p.deleted_at IS NULL
          LIMIT 1
        `,
        [userId],
      );

      if (existingProfile.rowCount > 0) {
        throw new ProfileError('PERSONAL_PROFILE_EXISTS', 409);
      }
    }

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
        VALUES ($1, $2, $3, $4, $5, $6)
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
        profile.profileType,
        profile.givenNames,
        profile.paternalSurname,
        profile.maternalSurname,
        profile.birthDate,
        userId,
      ],
    );

    const createdProfile = profileResult.rows[0];

    await client.query(
      `
        INSERT INTO user_profiles (user_id, profile_id, is_owner, access_role)
        VALUES ($1, $2, TRUE, 'owner')
      `,
      [userId, createdProfile.id],
    );

    await client.query('COMMIT');
    return mapProfile({ ...createdProfile, access_role: 'owner' });
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function listProfiles(userId) {
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.profile_type,
        p.given_names,
        p.paternal_surname,
        p.maternal_surname,
        p.birth_date,
        up.access_role,
        p.created_at,
        p.updated_at
      FROM user_profiles up
      INNER JOIN profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND up.deleted_at IS NULL
        AND p.deleted_at IS NULL
      ORDER BY
        CASE WHEN p.profile_type = 'personal' THEN 0 ELSE 1 END,
        p.created_at ASC
    `,
    [userId],
  );

  return result.rows.map(mapProfile);
}

async function getProfile(userId, profileId) {
  const result = await pool.query(
    `
      SELECT
        p.id,
        p.profile_type,
        p.given_names,
        p.paternal_surname,
        p.maternal_surname,
        p.birth_date,
        up.access_role,
        p.created_at,
        p.updated_at
      FROM user_profiles up
      INNER JOIN profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND up.profile_id = $2
        AND up.deleted_at IS NULL
        AND p.deleted_at IS NULL
      LIMIT 1
    `,
    [userId, profileId],
  );

  if (result.rowCount === 0) {
    throw new ProfileError('PROFILE_NOT_FOUND', 404);
  }

  return mapProfile(result.rows[0]);
}

async function updateProfile(userId, profileId, changes) {
  const values = [];
  const assignments = [];

  for (const [column, value] of Object.entries(changes)) {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  values.push(profileId, userId);
  const profileIdPosition = values.length - 1;
  const userIdPosition = values.length;

  const result = await pool.query(
    `
      UPDATE profiles p
      SET ${assignments.join(', ')}
      WHERE p.id = $${profileIdPosition}
        AND p.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          WHERE up.user_id = $${userIdPosition}
            AND up.profile_id = p.id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
        )
      RETURNING
        id,
        profile_type,
        given_names,
        paternal_surname,
        maternal_surname,
        birth_date,
        'owner' AS access_role,
        created_at,
        updated_at
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new ProfileError('PROFILE_NOT_FOUND', 404);
  }

  return mapProfile(result.rows[0]);
}

async function deleteProfile(userId, profileId) {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const profileResult = await client.query(
      `
        SELECT p.id, p.profile_type
        FROM profiles p
        INNER JOIN user_profiles up ON up.profile_id = p.id
        WHERE p.id = $1
          AND up.user_id = $2
          AND up.access_role = 'owner'
          AND p.deleted_at IS NULL
          AND up.deleted_at IS NULL
        FOR UPDATE OF p
      `,
      [profileId, userId],
    );

    if (profileResult.rowCount === 0) {
      throw new ProfileError('PROFILE_NOT_FOUND', 404);
    }

    if (profileResult.rows[0].profile_type === 'personal') {
      throw new ProfileError('PERSONAL_PROFILE_DELETE_NOT_ALLOWED', 409);
    }

    await client.query(
      'UPDATE profiles SET deleted_at = NOW() WHERE id = $1',
      [profileId],
    );

    await client.query(
      `
        UPDATE user_profiles
        SET deleted_at = NOW()
        WHERE profile_id = $1
          AND deleted_at IS NULL
      `,
      [profileId],
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  ProfileError,
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
};
