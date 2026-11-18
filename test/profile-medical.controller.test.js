const assert = require('node:assert/strict');
const test = require('node:test');

const pool = require('../src/config/db');
const {
  createAllergy,
  createMedication,
  getMedicalDetails,
  updateMedicalDetails,
} = require('../src/controllers/profile-medical.controller');

const PROFILE_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';

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

test('viewer puede consultar datos médicos básicos', async (t) => {
  let queryNumber = 0;
  t.mock.method(pool, 'query', async () => {
    queryNumber += 1;
    if (queryNumber === 1) return { rowCount: 1, rows: [{ '?column?': 1 }] };
    return {
      rowCount: 1,
      rows: [{
        profile_id: PROFILE_ID,
        blood_type: 'O+',
        height_cm: '172.50',
        created_at: new Date('2026-11-18T12:00:00.000Z'),
        updated_at: new Date('2026-11-18T12:00:00.000Z'),
      }],
    };
  });

  const response = responseRecorder();
  await getMedicalDetails(
    { params: { profileId: PROFILE_ID }, user: { id: USER_ID } },
    response,
  );

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.data.medicalDetails.bloodType, 'O+');
  assert.equal(response.body.data.medicalDetails.heightCm, 172.5);
});

test('actualizar datos médicos exige owner en la consulta', async (t) => {
  let capturedSql;
  t.mock.method(pool, 'query', async (sql) => {
    capturedSql = sql;
    return {
      rowCount: 1,
      rows: [{
        profile_id: PROFILE_ID,
        blood_type: 'A-',
        height_cm: '168.25',
        created_at: new Date('2026-11-18T12:00:00.000Z'),
        updated_at: new Date('2026-11-18T12:00:00.000Z'),
      }],
    };
  });

  const response = responseRecorder();
  await updateMedicalDetails({
    params: { profileId: PROFILE_ID },
    user: { id: USER_ID },
    body: { bloodType: 'A-', heightCm: 168.25 },
  }, response);

  assert.equal(response.statusCode, 200);
  assert.match(capturedSql, /up\.access_role = 'owner'/);
  assert.equal(response.body.data.medicalDetails.heightCm, 168.25);
});

test('crear alergia conserva tipo, severidad y reacción', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      id: '33333333-3333-4333-8333-333333333333',
      profile_id: PROFILE_ID,
      recorded_by_user_id: USER_ID,
      allergen_name: 'Penicilina',
      allergy_type: 'medication',
      severity: 'severe',
      reaction: 'Dificultad respiratoria',
      identified_on: '2020-05-01',
      notes: null,
      created_at: new Date('2026-11-18T12:00:00.000Z'),
      updated_at: new Date('2026-11-18T12:00:00.000Z'),
    }],
  }));

  const response = responseRecorder();
  await createAllergy({
    params: { profileId: PROFILE_ID },
    user: { id: USER_ID },
    body: {
      allergenName: 'Penicilina',
      allergyType: 'medication',
      severity: 'severe',
      reaction: 'Dificultad respiratoria',
      identifiedOn: '2020-05-01',
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.allergy.allergyType, 'medication');
  assert.equal(response.body.data.allergy.severity, 'severe');
});

test('crear medicamento habitual acepta tratamiento sin fecha de término', async (t) => {
  t.mock.method(pool, 'query', async () => ({
    rowCount: 1,
    rows: [{
      id: '44444444-4444-4444-8444-444444444444',
      profile_id: PROFILE_ID,
      recorded_by_user_id: USER_ID,
      medication_name: 'Metformina',
      dose_value: '500.000',
      dose_unit: 'mg',
      frequency_text: 'Dos veces al día',
      route: 'oral',
      indication: 'Diabetes tipo 2',
      started_on: '2024-01-01',
      ended_on: null,
      is_active: true,
      notes: null,
      created_at: new Date('2026-11-18T12:00:00.000Z'),
      updated_at: new Date('2026-11-18T12:00:00.000Z'),
    }],
  }));

  const response = responseRecorder();
  await createMedication({
    params: { profileId: PROFILE_ID },
    user: { id: USER_ID },
    body: {
      medicationName: 'Metformina',
      doseValue: 500,
      doseUnit: 'mg',
      frequency: 'Dos veces al día',
      route: 'oral',
      indication: 'Diabetes tipo 2',
      startedOn: '2024-01-01',
      isActive: true,
    },
  }, response);

  assert.equal(response.statusCode, 201);
  assert.equal(response.body.data.medication.doseValue, 500);
  assert.equal(response.body.data.medication.endedOn, null);
  assert.equal(response.body.data.medication.isActive, true);
});

test('medicamento rechaza endedOn anterior a startedOn', async () => {
  const response = responseRecorder();
  await createMedication({
    params: { profileId: PROFILE_ID },
    user: { id: USER_ID },
    body: {
      medicationName: 'Metformina',
      startedOn: '2025-01-02',
      endedOn: '2025-01-01',
    },
  }, response);

  assert.equal(response.statusCode, 400);
  assert.equal(response.body.error.code, 'MEDICATION_DATES_INVALID');
});
