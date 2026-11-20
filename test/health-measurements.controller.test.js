const assert = require('node:assert/strict');
const test = require('node:test');

const pool = require('../src/config/db');
const {
  oxygenSaturationReadingsController,
  temperatureReadingsController,
  weightReadingsController,
} = require('../src/controllers/health-measurements.controller');

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const READING_ID = '33333333-3333-4333-8333-333333333333';
const TAKEN_AT = '2026-11-19T12:00:00.000Z';

function responseRecorder() {
  return {
    statusCode: null,
    body: null,
    status(value) {
      this.statusCode = value;
      return this;
    },
    json(value) {
      this.body = value;
      return this;
    },
    send() {
      return this;
    },
  };
}

function baseRow(values) {
  return {
    id: READING_ID,
    profile_id: PROFILE_ID,
    recorded_by_user_id: USER_ID,
    notes: null,
    taken_at: new Date(TAKEN_AT),
    created_at: new Date('2026-11-20T12:00:00.000Z'),
    updated_at: new Date('2026-11-20T12:00:00.000Z'),
    ...values,
  };
}

test('crear peso guarda kilogramos y exige acceso owner', async (t) => {
  let capturedSql;
  t.mock.method(pool, 'query', async (sql) => {
    capturedSql = sql;
    return {
      rowCount: 1,
      rows: [baseRow({ weight_kg: '72.35' })],
    };
  });
  const response = responseRecorder();

  await weightReadingsController.createReading({
    user: { id: USER_ID },
    body: { profileId: PROFILE_ID, weightKg: 72.35, takenAt: TAKEN_AT },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.reading.weightKg, 72.35);
  assert.equal(response.body.data.reading.unit, 'kg');
  assert.match(capturedSql, /INSERT INTO weight_readings/);
  assert.match(capturedSql, /up\.access_role = 'owner'/);
});

test('crear temperatura usa measurementSite unknown por defecto', async (t) => {
  let parameters;
  t.mock.method(pool, 'query', async (sql, values) => {
    parameters = values;
    return {
      rowCount: 1,
      rows: [baseRow({
        temperature_celsius: '37.20',
        measurement_site: 'unknown',
      })],
    };
  });
  const response = responseRecorder();

  await temperatureReadingsController.createReading({
    user: { id: USER_ID },
    body: {
      profileId: PROFILE_ID,
      temperatureCelsius: 37.2,
      takenAt: TAKEN_AT,
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.reading.temperatureCelsius, 37.2);
  assert.equal(response.body.data.reading.measurementSite, 'unknown');
  assert.ok(parameters.includes('unknown'));
});

test('crear saturación conserva porcentaje y pulso del oxímetro', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [baseRow({
      oxygen_saturation_percent: '97.00',
      pulse_bpm: 68,
    })],
  }));
  const response = responseRecorder();

  await oxygenSaturationReadingsController.createReading({
    user: { id: USER_ID },
    body: {
      profileId: PROFILE_ID,
      oxygenSaturationPercent: 97,
      pulseBpm: 68,
      takenAt: TAKEN_AT,
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.reading.oxygenSaturationPercent, 97);
  assert.equal(response.body.data.reading.pulseBpm, 68);
  assert.equal(response.body.data.reading.unit, '%');
});

test('viewer puede listar peso sin que la consulta exija owner', async (t) => {
  const queries = [];
  t.mock.method(pool, 'query', async (sql) => {
    queries.push(sql);
    if (queries.length === 1) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    return { rowCount: 1, rows: [baseRow({ weight_kg: '70.00' })] };
  });
  const response = responseRecorder();

  await weightReadingsController.listReadings({
    user: { id: USER_ID },
    query: { profileId: PROFILE_ID },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.count, 1);
  assert.doesNotMatch(queries[0], /access_role = 'owner'/);
});

test('actualizar temperatura rechaza un lugar de medición desconocido', async () => {
  const response = responseRecorder();

  await temperatureReadingsController.updateReading({
    user: { id: USER_ID },
    params: { readingId: READING_ID },
    body: { measurementSite: 'hand' },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, 'MEASUREMENT_SITE_INVALID');
});

test('crear saturación rechaza porcentajes mayores a 100', async () => {
  const response = responseRecorder();

  await oxygenSaturationReadingsController.createReading({
    user: { id: USER_ID },
    body: {
      profileId: PROFILE_ID,
      oxygenSaturationPercent: 101,
      takenAt: TAKEN_AT,
    },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, 'OXYGEN_SATURATION_PERCENT_INVALID');
});
