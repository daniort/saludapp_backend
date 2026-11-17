const {
  BloodPressureError,
  createBloodPressureReading,
  deleteBloodPressureReading,
  listBloodPressureReadings,
  updateBloodPressureReading,
} = require('../services/blood-pressure.service');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_SMALLINT = 32767;
const MAX_NOTES_LENGTH = 2000;

function validPositiveSmallint(value) {
  return Number.isInteger(value) && value > 0 && value <= MAX_SMALLINT;
}

function validTimestamp(value, allowFuture = false) {
  if (typeof value !== 'string' || value.trim() === '') return false;

  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) return false;

  return allowFuture || timestamp <= Date.now() + (5 * 60 * 1000);
}

function normalizeNotes(value) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  return normalized.length <= MAX_NOTES_LENGTH ? normalized || null : undefined;
}

function sendBloodPressureError(res, error) {
  if (error instanceof BloodPressureError) {
    const messages = {
      PROFILE_NOT_FOUND: 'El perfil no existe o no pertenece al usuario.',
      BLOOD_PRESSURE_READING_NOT_FOUND: 'La lectura no existe o no pertenece al usuario.',
    };

    return res.status(error.statusCode).json({
      error: { code: error.code, message: messages[error.code] },
    });
  }

  console.error('Blood pressure route error:', error.message);
  return res.status(500).json({
    error: {
      code: 'BLOOD_PRESSURE_OPERATION_FAILED',
      message: 'No fue posible completar la operación de presión arterial.',
    },
  });
}

async function createReading(req, res) {
  const {
    profileId,
    systolic,
    diastolic,
    pulse,
    notes,
    takenAt,
  } = req.body || {};

  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  if (!validPositiveSmallint(systolic) || !validPositiveSmallint(diastolic)) {
    return res.status(400).json({
      error: {
        code: 'BLOOD_PRESSURE_VALUES_INVALID',
        message: 'systolic y diastolic deben ser enteros positivos.',
      },
    });
  }

  if (pulse !== undefined && pulse !== null && !validPositiveSmallint(pulse)) {
    return res.status(400).json({
      error: { code: 'PULSE_INVALID', message: 'pulse debe ser un entero positivo o null.' },
    });
  }

  const normalizedNotes = normalizeNotes(notes);

  if (notes !== undefined && normalizedNotes === undefined) {
    return res.status(400).json({
      error: { code: 'NOTES_INVALID', message: 'notes admite hasta 2000 caracteres.' },
    });
  }

  if (!validTimestamp(takenAt)) {
    return res.status(400).json({
      error: {
        code: 'TAKEN_AT_INVALID',
        message: 'takenAt debe ser una fecha válida y no puede ser futura.',
      },
    });
  }

  try {
    const reading = await createBloodPressureReading(req.user.id, {
      profileId,
      systolic,
      diastolic,
      pulse: pulse ?? null,
      notes: normalizedNotes ?? null,
      takenAt,
    });

    return res.status(201).json({ data: { reading } });
  } catch (error) {
    return sendBloodPressureError(res, error);
  }
}

async function listReadings(req, res) {
  const { profileId, from, to } = req.query;

  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  if (from !== undefined && !validTimestamp(from, true)) {
    return res.status(400).json({
      error: { code: 'FROM_INVALID', message: 'from debe ser una fecha válida.' },
    });
  }

  if (to !== undefined && !validTimestamp(to, true)) {
    return res.status(400).json({
      error: { code: 'TO_INVALID', message: 'to debe ser una fecha válida.' },
    });
  }

  if (from && to && Date.parse(from) > Date.parse(to)) {
    return res.status(400).json({
      error: { code: 'DATE_RANGE_INVALID', message: 'from no puede ser posterior a to.' },
    });
  }

  const parsedLimit = req.query.limit === undefined ? 100 : Number(req.query.limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    return res.status(400).json({
      error: { code: 'LIMIT_INVALID', message: 'limit debe ser un entero entre 1 y 200.' },
    });
  }

  try {
    const readings = await listBloodPressureReadings(req.user.id, {
      profileId,
      from: from || null,
      to: to || null,
      limit: parsedLimit,
    });

    return res.status(200).json({
      data: { readings, count: readings.length },
    });
  } catch (error) {
    return sendBloodPressureError(res, error);
  }
}

async function updateReading(req, res) {
  const { readingId } = req.params;

  if (!UUID_PATTERN.test(readingId)) {
    return res.status(400).json({
      error: { code: 'READING_ID_INVALID', message: 'readingId no es un UUID válido.' },
    });
  }

  const changes = {};
  const body = req.body || {};

  if (body.systolic !== undefined) {
    if (!validPositiveSmallint(body.systolic)) {
      return res.status(400).json({
        error: { code: 'SYSTOLIC_INVALID', message: 'systolic debe ser un entero positivo.' },
      });
    }
    changes.systolic = body.systolic;
  }

  if (body.diastolic !== undefined) {
    if (!validPositiveSmallint(body.diastolic)) {
      return res.status(400).json({
        error: { code: 'DIASTOLIC_INVALID', message: 'diastolic debe ser un entero positivo.' },
      });
    }
    changes.diastolic = body.diastolic;
  }

  if (body.pulse !== undefined) {
    if (body.pulse !== null && !validPositiveSmallint(body.pulse)) {
      return res.status(400).json({
        error: { code: 'PULSE_INVALID', message: 'pulse debe ser un entero positivo o null.' },
      });
    }
    changes.pulse = body.pulse;
  }

  if (body.notes !== undefined) {
    const normalizedNotes = normalizeNotes(body.notes);
    if (normalizedNotes === undefined) {
      return res.status(400).json({
        error: { code: 'NOTES_INVALID', message: 'notes admite hasta 2000 caracteres.' },
      });
    }
    changes.notes = normalizedNotes;
  }

  if (body.takenAt !== undefined) {
    if (!validTimestamp(body.takenAt)) {
      return res.status(400).json({
        error: {
          code: 'TAKEN_AT_INVALID',
          message: 'takenAt debe ser una fecha válida y no puede ser futura.',
        },
      });
    }
    changes.taken_at = body.takenAt;
  }

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({
      error: { code: 'NO_CHANGES', message: 'No se enviaron campos para actualizar.' },
    });
  }

  try {
    const reading = await updateBloodPressureReading(req.user.id, readingId, changes);
    return res.status(200).json({ data: { reading } });
  } catch (error) {
    return sendBloodPressureError(res, error);
  }
}

async function deleteReading(req, res) {
  const { readingId } = req.params;

  if (!UUID_PATTERN.test(readingId)) {
    return res.status(400).json({
      error: { code: 'READING_ID_INVALID', message: 'readingId no es un UUID válido.' },
    });
  }

  try {
    await deleteBloodPressureReading(req.user.id, readingId);
    return res.status(204).send();
  } catch (error) {
    return sendBloodPressureError(res, error);
  }
}

module.exports = {
  createReading,
  deleteReading,
  listReadings,
  updateReading,
};
