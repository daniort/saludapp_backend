const pool = require('../config/db');

class ProfileMedicalError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'ProfileMedicalError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function dateOnly(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function mapMedicalDetails(row) {
  return {
    profileId: row.profile_id,
    bloodType: row.blood_type,
    heightCm: row.height_cm === null ? null : Number(row.height_cm),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapAllergy(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    recordedByUserId: row.recorded_by_user_id,
    allergenName: row.allergen_name,
    allergyType: row.allergy_type,
    severity: row.severity,
    reaction: row.reaction,
    identifiedOn: dateOnly(row.identified_on),
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapMedication(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    recordedByUserId: row.recorded_by_user_id,
    medicationName: row.medication_name,
    doseValue: row.dose_value === null ? null : Number(row.dose_value),
    doseUnit: row.dose_unit,
    frequency: row.frequency_text,
    route: row.route,
    indication: row.indication,
    startedOn: dateOnly(row.started_on),
    endedOn: dateOnly(row.ended_on),
    isActive: row.is_active,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function assertProfileAccess(userId, profileId, ownerOnly = false) {
  const values = [userId, profileId];
  const roleCondition = ownerOnly ? "AND up.access_role = 'owner'" : '';
  const result = await pool.query(
    `
      SELECT 1
      FROM user_profiles up
      INNER JOIN profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND up.profile_id = $2
        ${roleCondition}
        AND up.deleted_at IS NULL
        AND p.deleted_at IS NULL
      LIMIT 1
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new ProfileMedicalError('PROFILE_NOT_FOUND', 404);
  }
}

async function getMedicalDetails(userId, profileId) {
  await assertProfileAccess(userId, profileId);

  const result = await pool.query(
    `
      SELECT
        $1::uuid AS profile_id,
        pmd.blood_type,
        pmd.height_cm,
        pmd.created_at,
        pmd.updated_at
      FROM (SELECT 1) source
      LEFT JOIN profile_medical_details pmd ON pmd.profile_id = $1
    `,
    [profileId],
  );

  return mapMedicalDetails(result.rows[0]);
}

async function updateMedicalDetails(userId, profileId, changes) {
  const columns = ['profile_id', 'created_by_user_id', 'updated_by_user_id'];
  const expressions = ['$1', '$2', '$2'];
  const values = [profileId, userId];
  const assignments = [];

  if (Object.hasOwn(changes, 'blood_type')) {
    values.push(changes.blood_type);
    columns.push('blood_type');
    expressions.push(`$${values.length}`);
    assignments.push('blood_type = EXCLUDED.blood_type');
  }

  if (Object.hasOwn(changes, 'height_cm')) {
    values.push(changes.height_cm);
    columns.push('height_cm');
    expressions.push(`$${values.length}`);
    assignments.push('height_cm = EXCLUDED.height_cm');
  }

  assignments.push('updated_by_user_id = EXCLUDED.updated_by_user_id');

  const result = await pool.query(
    `
      INSERT INTO profile_medical_details (${columns.join(', ')})
      SELECT ${expressions.join(', ')}
      WHERE EXISTS (
        SELECT 1
        FROM user_profiles up
        INNER JOIN profiles p ON p.id = up.profile_id
        WHERE up.user_id = $2
          AND up.profile_id = $1
          AND up.access_role = 'owner'
          AND up.deleted_at IS NULL
          AND p.deleted_at IS NULL
      )
      ON CONFLICT (profile_id)
      DO UPDATE SET ${assignments.join(', ')}
      RETURNING
        profile_id,
        blood_type,
        height_cm,
        created_at,
        updated_at
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new ProfileMedicalError('PROFILE_NOT_FOUND', 404);
  }

  return mapMedicalDetails(result.rows[0]);
}

async function createAllergy(userId, profileId, allergy) {
  const result = await pool.query(
    `
      INSERT INTO profile_allergies (
        profile_id,
        recorded_by_user_id,
        allergen_name,
        allergy_type,
        severity,
        reaction,
        identified_on,
        notes
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8
      WHERE EXISTS (
        SELECT 1
        FROM user_profiles up
        INNER JOIN profiles p ON p.id = up.profile_id
        WHERE up.user_id = $2
          AND up.profile_id = $1
          AND up.access_role = 'owner'
          AND up.deleted_at IS NULL
          AND p.deleted_at IS NULL
      )
      RETURNING *
    `,
    [
      profileId,
      userId,
      allergy.allergenName,
      allergy.allergyType,
      allergy.severity,
      allergy.reaction,
      allergy.identifiedOn,
      allergy.notes,
    ],
  );

  if (result.rowCount === 0) {
    throw new ProfileMedicalError('PROFILE_NOT_FOUND', 404);
  }

  return mapAllergy(result.rows[0]);
}

async function listAllergies(userId, profileId) {
  await assertProfileAccess(userId, profileId);
  const result = await pool.query(
    `
      SELECT *
      FROM profile_allergies
      WHERE profile_id = $1
        AND deleted_at IS NULL
      ORDER BY
        CASE severity
          WHEN 'severe' THEN 0
          WHEN 'moderate' THEN 1
          WHEN 'mild' THEN 2
          ELSE 3
        END,
        created_at DESC
    `,
    [profileId],
  );

  return result.rows.map(mapAllergy);
}

async function updateAllergy(userId, profileId, allergyId, changes) {
  const values = [];
  const assignments = [];

  for (const [column, value] of Object.entries(changes)) {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  values.push(allergyId, profileId, userId);
  const allergyIdPosition = values.length - 2;
  const profileIdPosition = values.length - 1;
  const userIdPosition = values.length;
  const result = await pool.query(
    `
      UPDATE profile_allergies pa
      SET ${assignments.join(', ')}
      WHERE pa.id = $${allergyIdPosition}
        AND pa.profile_id = $${profileIdPosition}
        AND pa.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $${userIdPosition}
            AND up.profile_id = pa.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING *
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new ProfileMedicalError('ALLERGY_NOT_FOUND', 404);
  }

  return mapAllergy(result.rows[0]);
}

async function deleteAllergy(userId, profileId, allergyId) {
  const result = await pool.query(
    `
      UPDATE profile_allergies pa
      SET deleted_at = NOW()
      WHERE pa.id = $1
        AND pa.profile_id = $2
        AND pa.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $3
            AND up.profile_id = pa.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING id
    `,
    [allergyId, profileId, userId],
  );

  if (result.rowCount === 0) {
    throw new ProfileMedicalError('ALLERGY_NOT_FOUND', 404);
  }
}

function translateMedicationConstraint(error) {
  if (error.code === '23514' && error.constraint === 'profile_medications_dates_valid') {
    throw new ProfileMedicalError('MEDICATION_DATES_INVALID', 400);
  }

  throw error;
}

async function createMedication(userId, profileId, medication) {
  try {
    const result = await pool.query(
      `
        INSERT INTO profile_medications (
          profile_id,
          recorded_by_user_id,
          medication_name,
          dose_value,
          dose_unit,
          frequency_text,
          route,
          indication,
          started_on,
          ended_on,
          is_active,
          notes
        )
        SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        WHERE EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $2
            AND up.profile_id = $1
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
        RETURNING *
      `,
      [
        profileId,
        userId,
        medication.medicationName,
        medication.doseValue,
        medication.doseUnit,
        medication.frequency,
        medication.route,
        medication.indication,
        medication.startedOn,
        medication.endedOn,
        medication.isActive,
        medication.notes,
      ],
    );

    if (result.rowCount === 0) {
      throw new ProfileMedicalError('PROFILE_NOT_FOUND', 404);
    }

    return mapMedication(result.rows[0]);
  } catch (error) {
    if (error instanceof ProfileMedicalError) throw error;
    return translateMedicationConstraint(error);
  }
}

async function listMedications(userId, profileId, active) {
  await assertProfileAccess(userId, profileId);
  const values = [profileId];
  const conditions = ['profile_id = $1', 'deleted_at IS NULL'];

  if (active !== null) {
    values.push(active);
    conditions.push(`is_active = $${values.length}`);
  }

  const result = await pool.query(
    `
      SELECT *
      FROM profile_medications
      WHERE ${conditions.join(' AND ')}
      ORDER BY is_active DESC, medication_name ASC, created_at DESC
    `,
    values,
  );

  return result.rows.map(mapMedication);
}

async function updateMedication(userId, profileId, medicationId, changes) {
  const values = [];
  const assignments = [];

  for (const [column, value] of Object.entries(changes)) {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  values.push(medicationId, profileId, userId);
  const medicationIdPosition = values.length - 2;
  const profileIdPosition = values.length - 1;
  const userIdPosition = values.length;

  try {
    const result = await pool.query(
      `
        UPDATE profile_medications pm
        SET ${assignments.join(', ')}
        WHERE pm.id = $${medicationIdPosition}
          AND pm.profile_id = $${profileIdPosition}
          AND pm.deleted_at IS NULL
          AND EXISTS (
            SELECT 1
            FROM user_profiles up
            INNER JOIN profiles p ON p.id = up.profile_id
            WHERE up.user_id = $${userIdPosition}
              AND up.profile_id = pm.profile_id
              AND up.access_role = 'owner'
              AND up.deleted_at IS NULL
              AND p.deleted_at IS NULL
          )
        RETURNING *
      `,
      values,
    );

    if (result.rowCount === 0) {
      throw new ProfileMedicalError('MEDICATION_NOT_FOUND', 404);
    }

    return mapMedication(result.rows[0]);
  } catch (error) {
    if (error instanceof ProfileMedicalError) throw error;
    return translateMedicationConstraint(error);
  }
}

async function deleteMedication(userId, profileId, medicationId) {
  const result = await pool.query(
    `
      UPDATE profile_medications pm
      SET deleted_at = NOW()
      WHERE pm.id = $1
        AND pm.profile_id = $2
        AND pm.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $3
            AND up.profile_id = pm.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING id
    `,
    [medicationId, profileId, userId],
  );

  if (result.rowCount === 0) {
    throw new ProfileMedicalError('MEDICATION_NOT_FOUND', 404);
  }
}

module.exports = {
  ProfileMedicalError,
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
};
