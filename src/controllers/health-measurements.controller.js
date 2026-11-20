const {
  HealthMeasurementError,
  createHealthMeasurement,
  deleteHealthMeasurement,
  listHealthMeasurements,
  updateHealthMeasurement,
} = require('../services/health-measurements.service');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_NOTES_LENGTH = 2000;
const TEMPERATURE_SITES = new Set([
  'oral',
  'axillary',
  'tympanic',
  'temporal',
  'rectal',
  'other',
  'unknown',
]);

const CONTROLLER_CONFIG = Object.freeze({
  weight: Object.freeze({
    type: 'weight',
    operationCode: 'WEIGHT_OPERATION_FAILED',
    operationMessage: 'No fue posible completar la operación de peso.',
    notFoundCode: 'WEIGHT_READING_NOT_FOUND',
    notFoundMessage: 'La lectura de peso no existe o no pertenece al usuario.',
    fields: Object.freeze({
      weightKg: Object.freeze({
        column: 'weight_kg',
        required: true,
        validate: (value) => validDecimal(value, 0, 1000, 2),
        errorCode: 'WEIGHT_KG_INVALID',
        errorMessage: 'weightKg debe ser mayor que 0, máximo 1000 y admitir hasta dos decimales.',
      }),
    }),
  }),
  temperature: Object.freeze({
    type: 'temperature',
    operationCode: 'TEMPERATURE_OPERATION_FAILED',
    operationMessage: 'No fue posible completar la operación de temperatura.',
    notFoundCode: 'TEMPERATURE_READING_NOT_FOUND',
    notFoundMessage: 'La lectura de temperatura no existe o no pertenece al usuario.',
    defaults: Object.freeze({ measurementSite: 'unknown' }),
    fields: Object.freeze({
      temperatureCelsius: Object.freeze({
        column: 'temperature_celsius',
        required: true,
        validate: (value) => validDecimal(value, 20, 50, 2),
        errorCode: 'TEMPERATURE_CELSIUS_INVALID',
        errorMessage: 'temperatureCelsius debe ser mayor que 20, máximo 50 y admitir hasta dos decimales.',
      }),
      measurementSite: Object.freeze({
        column: 'measurement_site',
        required: true,
        validate: (value) => TEMPERATURE_SITES.has(value),
        errorCode: 'MEASUREMENT_SITE_INVALID',
        errorMessage: 'measurementSite no es válido.',
      }),
    }),
  }),
  oxygenSaturation: Object.freeze({
    type: 'oxygenSaturation',
    operationCode: 'OXYGEN_SATURATION_OPERATION_FAILED',
    operationMessage: 'No fue posible completar la operación de saturación de oxígeno.',
    notFoundCode: 'OXYGEN_SATURATION_READING_NOT_FOUND',
    notFoundMessage: 'La lectura de saturación no existe o no pertenece al usuario.',
    defaults: Object.freeze({ pulseBpm: null }),
    fields: Object.freeze({
      oxygenSaturationPercent: Object.freeze({
        column: 'oxygen_saturation_percent',
        required: true,
        validate: (value) => validDecimal(value, 0, 100, 2),
        errorCode: 'OXYGEN_SATURATION_PERCENT_INVALID',
        errorMessage: 'oxygenSaturationPercent debe ser mayor que 0, máximo 100 y admitir hasta dos decimales.',
      }),
      pulseBpm: Object.freeze({
        column: 'pulse_bpm',
        required: false,
        nullable: true,
        validate: (value) => Number.isInteger(value) && value > 0 && value <= 300,
        errorCode: 'PULSE_BPM_INVALID',
        errorMessage: 'pulseBpm debe ser un entero entre 1 y 300 o null.',
      }),
    }),
  }),
});

function validDecimal(value, exclusiveMinimum, maximum, decimalPlaces) {
  if (!Number.isFinite(value) || value <= exclusiveMinimum || value > maximum) return false;
  const factor = 10 ** decimalPlaces;
  return Math.abs((value * factor) - Math.round(value * factor)) < 1e-8;
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

function sendError(config, res, error) {
  if (error instanceof HealthMeasurementError) {
    const messages = {
      PROFILE_NOT_FOUND: 'El perfil no existe o no pertenece al usuario.',
      [config.notFoundCode]: config.notFoundMessage,
    };

    return res.status(error.statusCode).json({
      error: { code: error.code, message: messages[error.code] },
    });
  }

  console.error(`${config.type} measurement route error:`, error.message);
  return res.status(500).json({
    error: { code: config.operationCode, message: config.operationMessage },
  });
}

function validateProfileId(profileId, res) {
  if (typeof profileId === 'string' && UUID_PATTERN.test(profileId)) return true;
  res.status(400).json({
    error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
  });
  return false;
}

function validatedFields(config, body, { creating }) {
  const values = {};

  for (const [apiField, definition] of Object.entries(config.fields)) {
    let value = body[apiField];

    if (creating && value === undefined && config.defaults?.[apiField] !== undefined) {
      value = config.defaults[apiField];
    }

    if (value === undefined) {
      if (creating && definition.required) {
        return { error: definition };
      }
      continue;
    }

    if (value === null && definition.nullable) {
      values[definition.column] = null;
      continue;
    }

    if (!definition.validate(value)) {
      return { error: definition };
    }

    values[definition.column] = value;
  }

  return { values };
}

function controllerFor(config) {
  async function createReading(req, res) {
    const body = req.body || {};
    if (!validateProfileId(body.profileId, res)) return undefined;

    const validation = validatedFields(config, body, { creating: true });
    if (validation.error) {
      return res.status(400).json({
        error: {
          code: validation.error.errorCode,
          message: validation.error.errorMessage,
        },
      });
    }

    const notes = normalizeNotes(body.notes);
    if (body.notes !== undefined && notes === undefined) {
      return res.status(400).json({
        error: { code: 'NOTES_INVALID', message: 'notes admite hasta 2000 caracteres.' },
      });
    }

    if (!validTimestamp(body.takenAt)) {
      return res.status(400).json({
        error: {
          code: 'TAKEN_AT_INVALID',
          message: 'takenAt debe ser una fecha válida y no puede ser futura.',
        },
      });
    }

    try {
      const reading = await createHealthMeasurement(config.type, req.user.id, {
        profileId: body.profileId,
        values: validation.values,
        notes: notes ?? null,
        takenAt: body.takenAt,
      });
      return res.status(201).json({ data: { reading } });
    } catch (error) {
      return sendError(config, res, error);
    }
  }

  async function listReadings(req, res) {
    const { profileId, from, to } = req.query;
    if (!validateProfileId(profileId, res)) return undefined;

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

    const limit = req.query.limit === undefined ? 100 : Number(req.query.limit);
    if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
      return res.status(400).json({
        error: { code: 'LIMIT_INVALID', message: 'limit debe ser un entero entre 1 y 200.' },
      });
    }

    try {
      const readings = await listHealthMeasurements(config.type, req.user.id, {
        profileId,
        from: from || null,
        to: to || null,
        limit,
      });
      return res.status(200).json({ data: { readings, count: readings.length } });
    } catch (error) {
      return sendError(config, res, error);
    }
  }

  async function updateReading(req, res) {
    const { readingId } = req.params;
    if (!UUID_PATTERN.test(readingId || '')) {
      return res.status(400).json({
        error: { code: 'READING_ID_INVALID', message: 'readingId no es un UUID válido.' },
      });
    }

    const body = req.body || {};
    const validation = validatedFields(config, body, { creating: false });
    if (validation.error) {
      return res.status(400).json({
        error: {
          code: validation.error.errorCode,
          message: validation.error.errorMessage,
        },
      });
    }

    const changes = validation.values;
    if (body.notes !== undefined) {
      const notes = normalizeNotes(body.notes);
      if (notes === undefined) {
        return res.status(400).json({
          error: { code: 'NOTES_INVALID', message: 'notes admite hasta 2000 caracteres.' },
        });
      }
      changes.notes = notes;
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
      const reading = await updateHealthMeasurement(
        config.type,
        req.user.id,
        readingId,
        changes,
      );
      return res.status(200).json({ data: { reading } });
    } catch (error) {
      return sendError(config, res, error);
    }
  }

  async function deleteReading(req, res) {
    const { readingId } = req.params;
    if (!UUID_PATTERN.test(readingId || '')) {
      return res.status(400).json({
        error: { code: 'READING_ID_INVALID', message: 'readingId no es un UUID válido.' },
      });
    }

    try {
      await deleteHealthMeasurement(config.type, req.user.id, readingId);
      return res.status(204).send();
    } catch (error) {
      return sendError(config, res, error);
    }
  }

  return Object.freeze({ createReading, deleteReading, listReadings, updateReading });
}

module.exports = {
  oxygenSaturationReadingsController: controllerFor(CONTROLLER_CONFIG.oxygenSaturation),
  temperatureReadingsController: controllerFor(CONTROLLER_CONFIG.temperature),
  weightReadingsController: controllerFor(CONTROLLER_CONFIG.weight),
};
