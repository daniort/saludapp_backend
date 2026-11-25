const pool = require('../config/db');
const { sendProfileReadingNotification } = require('./push-notifications.service');

const MEASUREMENT_TYPES = Object.freeze({
  weight: Object.freeze({
    tableName: 'weight_readings',
    valueColumns: ['weight_kg'],
    notFoundCode: 'WEIGHT_READING_NOT_FOUND',
    mapValues: (row) => ({
      weightKg: Number(row.weight_kg),
      unit: 'kg',
    }),
  }),
  temperature: Object.freeze({
    tableName: 'temperature_readings',
    valueColumns: ['temperature_celsius', 'measurement_site'],
    notFoundCode: 'TEMPERATURE_READING_NOT_FOUND',
    mapValues: (row) => ({
      temperatureCelsius: Number(row.temperature_celsius),
      unit: '°C',
      measurementSite: row.measurement_site,
    }),
  }),
  oxygenSaturation: Object.freeze({
    tableName: 'oxygen_saturation_readings',
    valueColumns: ['oxygen_saturation_percent', 'pulse_bpm'],
    notFoundCode: 'OXYGEN_SATURATION_READING_NOT_FOUND',
    mapValues: (row) => ({
      oxygenSaturationPercent: Number(row.oxygen_saturation_percent),
      unit: '%',
      pulseBpm: row.pulse_bpm,
    }),
  }),
});

class HealthMeasurementError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'HealthMeasurementError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function descriptorFor(type) {
  const descriptor = MEASUREMENT_TYPES[type];

  if (!descriptor) {
    throw new TypeError(`Unsupported health measurement type: ${type}`);
  }

  return descriptor;
}

function mapReading(descriptor, row) {
  return {
    id: row.id,
    profileId: row.profile_id,
    recordedByUserId: row.recorded_by_user_id,
    ...descriptor.mapValues(row),
    notes: row.notes,
    takenAt: row.taken_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function returningColumns(descriptor) {
  return [
    'id',
    'profile_id',
    'recorded_by_user_id',
    ...descriptor.valueColumns,
    'notes',
    'taken_at',
    'created_at',
    'updated_at',
  ].join(',\n        ');
}

async function createHealthMeasurement(type, userId, reading) {
  const descriptor = descriptorFor(type);
  const insertColumns = [
    'profile_id',
    'recorded_by_user_id',
    ...descriptor.valueColumns,
    'notes',
    'taken_at',
  ];
  const values = [
    reading.profileId,
    userId,
    ...descriptor.valueColumns.map((column) => reading.values[column]),
    reading.notes,
    reading.takenAt,
  ];
  const placeholders = values.map((value, index) => `$${index + 1}`).join(', ');

  const result = await pool.query(
    `
      INSERT INTO ${descriptor.tableName} (
        ${insertColumns.join(',\n        ')}
      )
      SELECT ${placeholders}
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
        ${returningColumns(descriptor)}
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new HealthMeasurementError('PROFILE_NOT_FOUND', 404);
  }

  const mappedReading = mapReading(descriptor, result.rows[0]);
  try {
    const delivery = await sendProfileReadingNotification({
      profileId: mappedReading.profileId,
      recordedByUserId: userId,
      readingType: type,
    });
    if (delivery.failed > 0) {
      console.warn('Push notification delivery had failures:', delivery.failed);
    }
  } catch (error) {
    console.error('Push notification delivery failed:', error.code || error.message);
  }

  return mappedReading;
}

async function listHealthMeasurements(type, userId, options) {
  const descriptor = descriptorFor(type);
  const accessResult = await pool.query(
    `
      SELECT 1
      FROM user_profiles up
      INNER JOIN profiles p ON p.id = up.profile_id
      WHERE up.user_id = $1
        AND up.profile_id = $2
        AND up.deleted_at IS NULL
        AND p.deleted_at IS NULL
      LIMIT 1
    `,
    [userId, options.profileId],
  );

  if (accessResult.rowCount === 0) {
    throw new HealthMeasurementError('PROFILE_NOT_FOUND', 404);
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
        ${returningColumns(descriptor)}
      FROM ${descriptor.tableName}
      WHERE ${conditions.join(' AND ')}
      ORDER BY taken_at DESC, id DESC
      LIMIT $${values.length}
    `,
    values,
  );

  return result.rows.map((row) => mapReading(descriptor, row));
}

async function updateHealthMeasurement(type, userId, readingId, changes) {
  const descriptor = descriptorFor(type);
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
      UPDATE ${descriptor.tableName} reading
      SET ${assignments.join(', ')}
      WHERE reading.id = $${readingIdPosition}
        AND reading.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $${userIdPosition}
            AND up.profile_id = reading.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING
        ${returningColumns(descriptor)}
    `,
    values,
  );

  if (result.rowCount === 0) {
    throw new HealthMeasurementError(descriptor.notFoundCode, 404);
  }

  return mapReading(descriptor, result.rows[0]);
}

async function deleteHealthMeasurement(type, userId, readingId) {
  const descriptor = descriptorFor(type);
  const result = await pool.query(
    `
      UPDATE ${descriptor.tableName} reading
      SET deleted_at = NOW()
      WHERE reading.id = $1
        AND reading.deleted_at IS NULL
        AND EXISTS (
          SELECT 1
          FROM user_profiles up
          INNER JOIN profiles p ON p.id = up.profile_id
          WHERE up.user_id = $2
            AND up.profile_id = reading.profile_id
            AND up.access_role = 'owner'
            AND up.deleted_at IS NULL
            AND p.deleted_at IS NULL
        )
      RETURNING id
    `,
    [readingId, userId],
  );

  if (result.rowCount === 0) {
    throw new HealthMeasurementError(descriptor.notFoundCode, 404);
  }
}

module.exports = {
  HealthMeasurementError,
  createHealthMeasurement,
  deleteHealthMeasurement,
  listHealthMeasurements,
  updateHealthMeasurement,
};
