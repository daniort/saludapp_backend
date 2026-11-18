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
    accessRole: 'owner',
    isOwner: true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function displayNameFor(firebaseUser, personalProfile) {
  const firebaseDisplayName = typeof firebaseUser.displayName === 'string'
    ? firebaseUser.displayName.trim()
    : '';

  if (firebaseDisplayName) return firebaseDisplayName;

  return [
    personalProfile.givenNames,
    personalProfile.paternalSurname,
    personalProfile.maternalSurname,
  ].filter(Boolean).join(' ');
}

async function findUserForUpdate(client, firebaseUid) {
  return client.query(
    `
      SELECT id, firebase_uid, email, display_name
      FROM users
      WHERE firebase_uid = $1
      FOR UPDATE
    `,
    [firebaseUid],
  );
}

async function updateUser(client, userId, firebaseUser, displayName) {
  const result = await client.query(
    `
      UPDATE users
      SET
        email = $2,
        display_name = COALESCE($3, display_name),
        email_verified = $4,
        is_active = TRUE,
        deleted_at = NULL
      WHERE id = $1
      RETURNING id, firebase_uid, email, display_name
    `,
    [
      userId,
      firebaseUser.email,
      displayName || null,
      firebaseUser.emailVerified === true,
    ],
  );

  return result.rows[0];
}

async function findOrCreateUser(client, firebaseUser, displayName) {
  const existingResult = await findUserForUpdate(client, firebaseUser.uid);

  if (existingResult.rowCount > 0) {
    return {
      user: await updateUser(
        client,
        existingResult.rows[0].id,
        firebaseUser,
        displayName,
      ),
      isNewUser: false,
    };
  }

  const insertedResult = await client.query(
    `
      INSERT INTO users (
        firebase_uid,
        email,
        display_name,
        email_verified
      )
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (firebase_uid) DO NOTHING
      RETURNING id, firebase_uid, email, display_name
    `,
    [
      firebaseUser.uid,
      firebaseUser.email,
      displayName || null,
      firebaseUser.emailVerified === true,
    ],
  );

  if (insertedResult.rowCount > 0) {
    return { user: insertedResult.rows[0], isNewUser: true };
  }

  // Otra solicitud pudo crear el usuario entre el SELECT y el INSERT. El
  // bloqueo de fila garantiza que su aprovisionamiento termine antes de seguir.
  const concurrentResult = await findUserForUpdate(client, firebaseUser.uid);

  if (concurrentResult.rowCount === 0) {
    throw new RegistrationProvisionError('LOCAL_USER_CONFLICT', 409);
  }

  return {
    user: await updateUser(
      client,
      concurrentResult.rows[0].id,
      firebaseUser,
      displayName,
    ),
    isNewUser: false,
  };
}

async function findPersonalProfile(client, userId) {
  return client.query(
    `
      SELECT
        p.id,
        p.profile_type,
        p.given_names,
        p.paternal_surname,
        p.maternal_surname,
        p.birth_date,
        p.created_at,
        p.updated_at,
        up.id AS relation_id
      FROM profiles p
      LEFT JOIN user_profiles up
        ON up.profile_id = p.id
        AND up.user_id = $1
        AND up.deleted_at IS NULL
      WHERE p.created_by_user_id = $1
        AND p.profile_type = 'personal'
        AND p.deleted_at IS NULL
      ORDER BY p.created_at ASC
    `,
    [userId],
  );
}

async function createPersonalProfile(client, userId, personalProfile) {
  const result = await client.query(
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
      userId,
    ],
  );

  return result.rows[0];
}

async function ensureOwnerRelation(client, userId, profileId) {
  await client.query(
    `
      INSERT INTO user_profiles (user_id, profile_id, is_owner, access_role)
      VALUES ($1, $2, TRUE, 'owner')
      ON CONFLICT (user_id, profile_id) WHERE deleted_at IS NULL
      DO UPDATE SET
        is_owner = TRUE,
        access_role = 'owner',
        updated_at = NOW()
    `,
    [userId, profileId],
  );
}

async function provisionRegisteredUser(firebaseUser, personalProfile, database = pool) {
  if (
    typeof firebaseUser?.uid !== 'string'
    || firebaseUser.uid.trim() === ''
    || typeof firebaseUser.email !== 'string'
    || firebaseUser.email.trim() === ''
  ) {
    throw new RegistrationProvisionError('FIREBASE_USER_INVALID', 422);
  }

  const client = await database.connect();
  const displayName = displayNameFor(firebaseUser, personalProfile);

  try {
    await client.query('BEGIN');

    const provisionedUser = await findOrCreateUser(client, {
      ...firebaseUser,
      uid: firebaseUser.uid.trim(),
      email: firebaseUser.email.trim(),
    }, displayName);
    const { user } = provisionedUser;
    const existingProfileResult = await findPersonalProfile(client, user.id);

    let profile;

    if (existingProfileResult.rowCount > 1) {
      throw new RegistrationProvisionError('PERSONAL_PROFILE_CONFLICT', 409);
    }

    if (existingProfileResult.rowCount === 1) {
      profile = existingProfileResult.rows[0];
    } else {
      profile = await createPersonalProfile(client, user.id, personalProfile);
    }

    // También repara el caso donde el perfil personal existe pero su relación
    // de propietario está ausente o tiene un rol incorrecto.
    await ensureOwnerRelation(client, user.id, profile.id);

    await client.query('COMMIT');

    return {
      localUserId: user.id,
      displayName: user.display_name,
      profile: mapProfile(profile),
      isNewUser: provisionedUser.isNewUser,
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
