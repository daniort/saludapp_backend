const pool = require('../config/db');

class GlucoseError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'GlucoseError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function mapReading(row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    recordedByUserId: row.recorded_by_user_id,
    value: Number(row.value),
    unit: 'mg/dL',
    takenContext: row.taken_context,
    notes: row.notes,
    takenAt: row.taken_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createGlucoseReading(userId, reading) {
  const result = await pool.query(
    `
      INSERT INTO glucose_readings (
        profile_id,
        recorded_by_user_id,
        value,
        taken_context,
        notes,
        taken_at
      )
      SELECT $1, $2, $3, $4, $5, $6
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
        value,
        taken_context,
        notes,
        taken_at,
        created_at,
        updated_at
    `,
    [
      reading.profileId,
      userId,
      reading.value,
      reading.takenContext,
      reading.notes,
      reading.takenAt,
    ],
  );

  if (result.rowCount === 0) {
    throw new GlucoseError('PROFILE_NOT_FOUND', 404);
  }

  return mapReading(result.rows[0]);
}

async function listGlucoseReadings(userId, options) {
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
    throw new GlucoseError('PROFILE_NOT_FOUND', 404);
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

  if (options.takenContext) {
    values.push(options.takenContext);
    conditions.push(`taken_context = $${values.length}`);
  }

  values.push(options.limit);

  const result = await pool.query(
    `
      SELECT
        id,
        profile_id,
        recorded_by_user_id,
        value,
        taken_context,
        notes,
        taken_at,
        created_at,
        updated_at
      FROM glucose_readings
      WHERE ${conditions.join(' AND ')}
      ORDER BY taken_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows.map(mapReading);
}

async function updateGlucoseReading(userId, readingId, changes) {
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
      UPDATE glucose_readings gr
      SET ${assignments.join(', ')}
      WHERE gr.id = $${readingIdPosition}
        AND gr.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $${userIdPosition}
            AND up.profile_id = gr.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING
        id,
        profile_id,
        recorded_by_user_id,
        value,
        taken_context,
        notes,
        taken_at,
        created_at,
        updated_at
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new GlucoseError('GLUCOSE_READING_NOT_FOUND', 404);
  }

  return mapReading(result.rows[0]);
}

async function deleteGlucoseReading(userId, readingId) {
  const result = await pool.query(
    `
      UPDATE glucose_readings gr
      SET deleted_at = NOW()
      WHERE gr.id = $1
        AND gr.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $2
            AND up.profile_id = gr.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING id
    `,
    [readingId, userId],
  );

  if (result.rowCount === 0) {
    throw new GlucoseError('GLUCOSE_READING_NOT_FOUND', 404);
  }
}

module.exports = {
  GlucoseError,
  createGlucoseReading,
  deleteGlucoseReading,
  listGlucoseReadings,
  updateGlucoseReading,
};
