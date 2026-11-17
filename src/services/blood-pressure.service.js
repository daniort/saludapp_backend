const pool = require('../config/db');

class BloodPressureError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'BloodPressureError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function mapReading(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    recordedByUserId: row.recorded_by_user_id,
    systolic: row.systolic,
    diastolic: row.diastolic,
    pulse: row.pulse,
    notes: row.notes,
    takenAt: row.taken_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createBloodPressureReading(userId, reading) {
  const result = await pool.query(
    `
      INSERT INTO blood_pressure_readings (
        profile_id,
        recorded_by_user_id,
        systolic,
        diastolic,
        pulse,
        notes,
        taken_at
      )
      SELECT $1, $2, $3, $4, $5, $6, $7
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
      RETURNING
        id,
        profile_id,
        recorded_by_user_id,
        systolic,
        diastolic,
        pulse,
        notes,
        taken_at,
        created_at,
        updated_at
    `,
    [
      reading.profileId,
      userId,
      reading.systolic,
      reading.diastolic,
      reading.pulse,
      reading.notes,
      reading.takenAt,
    ],
  );

  if (result.rowCount === 0) {
    throw new BloodPressureError('PROFILE_NOT_FOUND', 404);
  }

  return mapReading(result.rows[0]);
}

async function listBloodPressureReadings(userId, options) {
  const accessResult = await pool.query(
    `
      SELECT 1
      FROM user_profiles up
      INNER JOIN profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND up.profile_id = $2
        AND up.deleted_at IS NULL
        AND p.deleted_at IS NULL
    `,
    [userId, options.profileId],
  );

  if (accessResult.rowCount === 0) {
    throw new BloodPressureError('PROFILE_NOT_FOUND', 404);
  }

  const values = [options.profileId];
  const conditions = ['profile_id = $1', 'deleted_at IS NULL'];

  if (options.from) {
    values.push(options.from);
    conditions.push(`taken_at >= $${values.length}`);
  }

  if (options.to) {
    values.push(options.to);
    conditions.push(`taken_at <= $${values.length}`);
  }

  values.push(options.limit);

  const result = await pool.query(
    `
      SELECT
        id,
        profile_id,
        recorded_by_user_id,
        systolic,
        diastolic,
        pulse,
        notes,
        taken_at,
        created_at,
        updated_at
      FROM blood_pressure_readings
      WHERE ${conditions.join(' AND ')}
      ORDER BY taken_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows.map(mapReading);
}

async function updateBloodPressureReading(userId, readingId, changes) {
  const values = [];
  const assignments = [];

  for (const [column, value] of Object.entries(changes)) {
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  }

  values.push(readingId, userId);
  const readingIdPosition = values.length - 1;
  const userIdPosition = values.length;

  const result = await pool.query(
    `
      UPDATE blood_pressure_readings bpr
      SET ${assignments.join(', ')}
      WHERE bpr.id = $${readingIdPosition}
        AND bpr.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $${userIdPosition}
            AND up.profile_id = bpr.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING
        id,
        profile_id,
        recorded_by_user_id,
        systolic,
        diastolic,
        pulse,
        notes,
        taken_at,
        created_at,
        updated_at
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new BloodPressureError('BLOOD_PRESSURE_READING_NOT_FOUND', 404);
  }

  return mapReading(result.rows[0]);
}

async function deleteBloodPressureReading(userId, readingId) {
  const result = await pool.query(
    `
      UPDATE blood_pressure_readings bpr
      SET deleted_at = NOW()
      WHERE bpr.id = $1
        AND bpr.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $2
            AND up.profile_id = bpr.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING id
    `,
    [readingId, userId],
  );

  if (result.rowCount === 0) {
    throw new BloodPressureError('BLOOD_PRESSURE_READING_NOT_FOUND', 404);
  }
}

module.exports = {
  BloodPressureError,
  createBloodPressureReading,
  deleteBloodPressureReading,
  listBloodPressureReadings,
  updateBloodPressureReading,
};
