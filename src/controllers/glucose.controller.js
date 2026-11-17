const {
  GlucoseError,
  createGlucoseReading,
  deleteGlucoseReading,
  listGlucoseReadings,
  updateGlucoseReading,
} = require('../services/glucose.service');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TAKEN_CONTEXTS = new Set([
  'fasting',
  'before_meal',
  'after_meal',
  'bedtime',
  'random',
  'unknown',
  'other',
]);
const MAX_GLUCOSE_VALUE = 99999.99;
const MAX_NOTES_LENGTH = 2000;

function validGlucoseValue(value) {
  if (!Number.isFinite(value) || value <= 0 || value > MAX_GLUCOSE_VALUE) return false;
  const scaled = value * 100;
  return Math.abs(scaled - Math.round(scaled)) < 1e-8;
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

function sendGlucoseError(res, error) {
  if (error instanceof GlucoseError) {
    const messages = {
      PROFILE_NOT_FOUND: 'El perfil no existe o no pertenece al usuario.',
      GLUCOSE_READING_NOT_FOUND: 'La lectura no existe o no pertenece al usuario.',
    };

    return res.status(error.statusCode).json({
      error: { code: error.code, message: messages[error.code] },
    });
  }

  console.error('Glucose route error:', error.message);
  return res.status(500).json({
    error: {
      code: 'GLUCOSE_OPERATION_FAILED',
      message: 'No fue posible completar la operación de glucosa.',
    },
  });
}

async function createReading(req, res) {
  const {
    profileId,
    value,
    takenContext = 'unknown',
    notes,
    takenAt,
  } = req.body || {};

  if (typeof profileId !== 'string' || !UUID_PATTERN.test(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  if (!validGlucoseValue(value)) {
    return res.status(400).json({
      error: {
        code: 'GLUCOSE_VALUE_INVALID',
        message: 'value debe ser un número positivo con máximo dos decimales.',
      },
    });
  }

  if (!TAKEN_CONTEXTS.has(takenContext)) {
    return res.status(400).json({
      error: {
        code: 'TAKEN_CONTEXT_INVALID',
        message: 'takenContext no es válido.',
      },
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
    const reading = await createGlucoseReading(req.user.id, {
      profileId,
      value,
      takenContext,
      notes: normalizedNotes ?? null,
      takenAt,
    });

    return res.status(201).json({ data: { reading } });
  } catch (error) {
    return sendGlucoseError(res, error);
  }
}

async function listReadings(req, res) {
  const {
    profileId,
    from,
    to,
    takenContext,
  } = req.query;

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

  if (takenContext !== undefined && !TAKEN_CONTEXTS.has(takenContext)) {
    return res.status(400).json({
      error: { code: 'TAKEN_CONTEXT_INVALID', message: 'takenContext no es válido.' },
    });
  }

  const parsedLimit = req.query.limit === undefined ? 100 : Number(req.query.limit);

  if (!Number.isInteger(parsedLimit) || parsedLimit < 1 || parsedLimit > 200) {
    return res.status(400).json({
      error: { code: 'LIMIT_INVALID', message: 'limit debe ser un entero entre 1 y 200.' },
    });
  }

  try {
    const readings = await listGlucoseReadings(req.user.id, {
      profileId,
      from: from || null,
      to: to || null,
      takenContext: takenContext || null,
      limit: parsedLimit,
    });

    return res.status(200).json({
      data: { readings, count: readings.length },
    });
  } catch (error) {
    return sendGlucoseError(res, error);
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

  if (body.value !== undefined) {
    if (!validGlucoseValue(body.value)) {
      return res.status(400).json({
        error: {
          code: 'GLUCOSE_VALUE_INVALID',
          message: 'value debe ser un número positivo con máximo dos decimales.',
        },
      });
    }
    changes.value = body.value;
  }

  if (body.takenContext !== undefined) {
    if (!TAKEN_CONTEXTS.has(body.takenContext)) {
      return res.status(400).json({
        error: { code: 'TAKEN_CONTEXT_INVALID', message: 'takenContext no es válido.' },
      });
    }
    changes.taken_context = body.takenContext;
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
    const reading = await updateGlucoseReading(req.user.id, readingId, changes);
    return res.status(200).json({ data: { reading } });
  } catch (error) {
    return sendGlucoseError(res, error);
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
    await deleteGlucoseReading(req.user.id, readingId);
    return res.status(204).send();
  } catch (error) {
    return sendGlucoseError(res, error);
  }
}

module.exports = {
  createReading,
  deleteReading,
  listReadings,
  updateReading,
};
