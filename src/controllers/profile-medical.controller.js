const {
  ProfileMedicalError,
  createAllergy: createAllergyRecord,
  createMedication: createMedicationRecord,
  deleteAllergy: deleteAllergyRecord,
  deleteMedication: deleteMedicationRecord,
  getMedicalDetails: getMedicalDetailsRecord,
  listAllergies: listAllergyRecords,
  listMedications: listMedicationRecords,
  updateAllergy: updateAllergyRecord,
  updateMedicalDetails: updateMedicalDetailsRecord,
  updateMedication: updateMedicationRecord,
} = require('../services/profile-medical.service');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const BLOOD_TYPES = new Set(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']);
const ALLERGY_TYPES = new Set(['food', 'medication', 'environmental', 'other']);
const ALLERGY_SEVERITIES = new Set(['mild', 'moderate', 'severe', 'unknown']);
const MEDICATION_ROUTES = new Set([
  'oral',
  'subcutaneous',
  'intravenous',
  'intramuscular',
  'inhaled',
  'topical',
  'ophthalmic',
  'other',
]);

function validUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

function normalizeText(value, maxLength, required = false) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return required ? undefined : null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim();
  if (!normalized) return required ? undefined : null;
  if (normalized.length > maxLength) return undefined;
  return normalized;
}

function validDate(value, allowFuture = true) {
  if (value === null) return true;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) return false;
  return allowFuture || value <= new Date().toISOString().slice(0, 10);
}

function validDecimal(value, maxDecimals, maximum) {
  if (!Number.isFinite(value) || value <= 0 || value > maximum) return false;
  const multiplier = 10 ** maxDecimals;
  return Math.abs((value * multiplier) - Math.round(value * multiplier)) < 1e-8;
}

function sendProfileMedicalError(res, error) {
  if (error instanceof ProfileMedicalError) {
    const messages = {
      PROFILE_NOT_FOUND: 'El perfil no existe o no pertenece al usuario.',
      ALLERGY_NOT_FOUND: 'La alergia no existe o no puede modificarse.',
      MEDICATION_NOT_FOUND: 'El medicamento no existe o no puede modificarse.',
      MEDICATION_DATES_INVALID: 'La fecha de término no puede ser anterior al inicio.',
    };
    return res.status(error.statusCode).json({
      error: { code: error.code, message: messages[error.code] },
    });
  }

  console.error('Profile medical information error:', error.message);
  return res.status(500).json({
    error: {
      code: 'PROFILE_MEDICAL_OPERATION_FAILED',
      message: 'No fue posible completar la operación de información médica.',
    },
  });
}

function invalidProfileId(res) {
  return res.status(400).json({
    error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
  });
}

async function getMedicalDetails(req, res) {
  const { profileId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);

  try {
    const medicalDetails = await getMedicalDetailsRecord(req.user.id, profileId);
    return res.status(200).json({ data: { medicalDetails } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

async function updateMedicalDetails(req, res) {
  const { profileId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  const body = req.body || {};
  const changes = {};

  if (body.bloodType !== undefined) {
    if (body.bloodType !== null && !BLOOD_TYPES.has(body.bloodType)) {
      return res.status(400).json({
        error: { code: 'BLOOD_TYPE_INVALID', message: 'bloodType no es válido.' },
      });
    }
    changes.blood_type = body.bloodType;
  }

  if (body.heightCm !== undefined) {
    if (body.heightCm !== null && !validDecimal(body.heightCm, 2, 300)) {
      return res.status(400).json({
        error: {
          code: 'HEIGHT_INVALID',
          message: 'heightCm debe ser un número positivo de hasta 300 con máximo dos decimales.',
        },
      });
    }
    changes.height_cm = body.heightCm;
  }

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({
      error: { code: 'NO_CHANGES', message: 'No se enviaron campos para actualizar.' },
    });
  }

  try {
    const medicalDetails = await updateMedicalDetailsRecord(req.user.id, profileId, changes);
    return res.status(200).json({ data: { medicalDetails } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

function validateAllergyBody(body, partial = false) {
  const values = {};

  if (!partial || body.allergenName !== undefined) {
    const value = normalizeText(body.allergenName, 200, true);
    if (value === undefined) return { error: 'ALLERGEN_NAME_INVALID' };
    values.allergen_name = value;
  }

  if (!partial || body.allergyType !== undefined) {
    if (!ALLERGY_TYPES.has(body.allergyType)) return { error: 'ALLERGY_TYPE_INVALID' };
    values.allergy_type = body.allergyType;
  }

  if (!partial || body.severity !== undefined) {
    const severity = body.severity ?? 'unknown';
    if (!ALLERGY_SEVERITIES.has(severity)) return { error: 'ALLERGY_SEVERITY_INVALID' };
    values.severity = severity;
  }

  for (const [apiName, column, maximum] of [
    ['reaction', 'reaction', 1000],
    ['notes', 'notes', 2000],
  ]) {
    if (body[apiName] !== undefined) {
      const value = normalizeText(body[apiName], maximum);
      if (value === undefined) return { error: `${apiName.toUpperCase()}_INVALID` };
      values[column] = value;
    } else if (!partial) {
      values[column] = null;
    }
  }

  if (body.identifiedOn !== undefined) {
    if (!validDate(body.identifiedOn, false)) return { error: 'IDENTIFIED_ON_INVALID' };
    values.identified_on = body.identifiedOn;
  } else if (!partial) {
    values.identified_on = null;
  }

  return { values };
}

function allergyValidationMessage(code) {
  const messages = {
    ALLERGEN_NAME_INVALID: 'allergenName es obligatorio y admite hasta 200 caracteres.',
    ALLERGY_TYPE_INVALID: 'allergyType debe ser food, medication, environmental u other.',
    ALLERGY_SEVERITY_INVALID: 'severity debe ser mild, moderate, severe o unknown.',
    REACTION_INVALID: 'reaction admite hasta 1000 caracteres.',
    NOTES_INVALID: 'notes admite hasta 2000 caracteres.',
    IDENTIFIED_ON_INVALID: 'identifiedOn debe ser una fecha válida no futura.',
  };
  return messages[code];
}

async function createAllergy(req, res) {
  const { profileId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  const validation = validateAllergyBody(req.body || {});

  if (validation.error) {
    return res.status(400).json({
      error: { code: validation.error, message: allergyValidationMessage(validation.error) },
    });
  }

  const values = validation.values;

  try {
    const allergy = await createAllergyRecord(req.user.id, profileId, {
      allergenName: values.allergen_name,
      allergyType: values.allergy_type,
      severity: values.severity,
      reaction: values.reaction,
      identifiedOn: values.identified_on,
      notes: values.notes,
    });
    return res.status(201).json({ data: { allergy } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

async function listAllergies(req, res) {
  const { profileId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);

  try {
    const allergies = await listAllergyRecords(req.user.id, profileId);
    return res.status(200).json({ data: { allergies, count: allergies.length } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

async function updateAllergy(req, res) {
  const { profileId, allergyId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  if (!validUuid(allergyId)) {
    return res.status(400).json({
      error: { code: 'ALLERGY_ID_INVALID', message: 'allergyId no es un UUID válido.' },
    });
  }

  const validation = validateAllergyBody(req.body || {}, true);
  if (validation.error) {
    return res.status(400).json({
      error: { code: validation.error, message: allergyValidationMessage(validation.error) },
    });
  }
  if (Object.keys(validation.values).length === 0) {
    return res.status(400).json({
      error: { code: 'NO_CHANGES', message: 'No se enviaron campos para actualizar.' },
    });
  }

  try {
    const allergy = await updateAllergyRecord(
      req.user.id,
      profileId,
      allergyId,
      validation.values,
    );
    return res.status(200).json({ data: { allergy } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

async function deleteAllergy(req, res) {
  const { profileId, allergyId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  if (!validUuid(allergyId)) {
    return res.status(400).json({
      error: { code: 'ALLERGY_ID_INVALID', message: 'allergyId no es un UUID válido.' },
    });
  }

  try {
    await deleteAllergyRecord(req.user.id, profileId, allergyId);
    return res.status(204).send();
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

function validateMedicationBody(body, partial = false) {
  const values = {};

  if (!partial || body.medicationName !== undefined) {
    const value = normalizeText(body.medicationName, 200, true);
    if (value === undefined) return { error: 'MEDICATION_NAME_INVALID' };
    values.medication_name = value;
  }

  if (body.doseValue !== undefined) {
    if (body.doseValue !== null && !validDecimal(body.doseValue, 3, 9999999)) {
      return { error: 'DOSE_VALUE_INVALID' };
    }
    values.dose_value = body.doseValue;
  } else if (!partial) {
    values.dose_value = null;
  }

  for (const [apiName, column, maximum, errorCode] of [
    ['doseUnit', 'dose_unit', 30, 'DOSE_UNIT_INVALID'],
    ['frequency', 'frequency_text', 150, 'FREQUENCY_INVALID'],
    ['indication', 'indication', 200, 'INDICATION_INVALID'],
    ['notes', 'notes', 2000, 'NOTES_INVALID'],
  ]) {
    if (body[apiName] !== undefined) {
      const value = normalizeText(body[apiName], maximum);
      if (value === undefined) return { error: errorCode };
      values[column] = value;
    } else if (!partial) {
      values[column] = null;
    }
  }

  if (body.route !== undefined) {
    if (body.route !== null && !MEDICATION_ROUTES.has(body.route)) {
      return { error: 'MEDICATION_ROUTE_INVALID' };
    }
    values.route = body.route;
  } else if (!partial) {
    values.route = null;
  }

  for (const [apiName, column, errorCode] of [
    ['startedOn', 'started_on', 'STARTED_ON_INVALID'],
    ['endedOn', 'ended_on', 'ENDED_ON_INVALID'],
  ]) {
    if (body[apiName] !== undefined) {
      if (!validDate(body[apiName])) return { error: errorCode };
      values[column] = body[apiName];
    } else if (!partial) {
      values[column] = null;
    }
  }

  if (!partial || body.isActive !== undefined) {
    const isActive = body.isActive === undefined ? true : body.isActive;
    if (typeof isActive !== 'boolean') return { error: 'IS_ACTIVE_INVALID' };
    values.is_active = isActive;
  }

  if (
    values.started_on
    && values.ended_on
    && values.ended_on < values.started_on
  ) {
    return { error: 'MEDICATION_DATES_INVALID' };
  }

  return { values };
}

function medicationValidationMessage(code) {
  const messages = {
    MEDICATION_NAME_INVALID: 'medicationName es obligatorio y admite hasta 200 caracteres.',
    DOSE_VALUE_INVALID: 'doseValue debe ser positivo y admite hasta tres decimales.',
    DOSE_UNIT_INVALID: 'doseUnit admite hasta 30 caracteres.',
    FREQUENCY_INVALID: 'frequency admite hasta 150 caracteres.',
    INDICATION_INVALID: 'indication admite hasta 200 caracteres.',
    NOTES_INVALID: 'notes admite hasta 2000 caracteres.',
    MEDICATION_ROUTE_INVALID: 'route no es una vía de administración válida.',
    STARTED_ON_INVALID: 'startedOn debe usar el formato YYYY-MM-DD.',
    ENDED_ON_INVALID: 'endedOn debe usar el formato YYYY-MM-DD.',
    IS_ACTIVE_INVALID: 'isActive debe ser booleano.',
    MEDICATION_DATES_INVALID: 'endedOn no puede ser anterior a startedOn.',
  };
  return messages[code];
}

function medicationRecord(values) {
  return {
    medicationName: values.medication_name,
    doseValue: values.dose_value,
    doseUnit: values.dose_unit,
    frequency: values.frequency_text,
    route: values.route,
    indication: values.indication,
    startedOn: values.started_on,
    endedOn: values.ended_on,
    isActive: values.is_active,
    notes: values.notes,
  };
}

async function createMedication(req, res) {
  const { profileId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  const validation = validateMedicationBody(req.body || {});
  if (validation.error) {
    return res.status(400).json({
      error: { code: validation.error, message: medicationValidationMessage(validation.error) },
    });
  }

  try {
    const medication = await createMedicationRecord(
      req.user.id,
      profileId,
      medicationRecord(validation.values),
    );
    return res.status(201).json({ data: { medication } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

async function listMedications(req, res) {
  const { profileId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  let active = null;

  if (req.query.active !== undefined) {
    if (req.query.active !== 'true' && req.query.active !== 'false') {
      return res.status(400).json({
        error: { code: 'ACTIVE_FILTER_INVALID', message: 'active debe ser true o false.' },
      });
    }
    active = req.query.active === 'true';
  }

  try {
    const medications = await listMedicationRecords(req.user.id, profileId, active);
    return res.status(200).json({ data: { medications, count: medications.length } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

async function updateMedication(req, res) {
  const { profileId, medicationId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  if (!validUuid(medicationId)) {
    return res.status(400).json({
      error: { code: 'MEDICATION_ID_INVALID', message: 'medicationId no es un UUID válido.' },
    });
  }

  const validation = validateMedicationBody(req.body || {}, true);
  if (validation.error) {
    return res.status(400).json({
      error: { code: validation.error, message: medicationValidationMessage(validation.error) },
    });
  }
  if (Object.keys(validation.values).length === 0) {
    return res.status(400).json({
      error: { code: 'NO_CHANGES', message: 'No se enviaron campos para actualizar.' },
    });
  }

  try {
    const medication = await updateMedicationRecord(
      req.user.id,
      profileId,
      medicationId,
      validation.values,
    );
    return res.status(200).json({ data: { medication } });
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

async function deleteMedication(req, res) {
  const { profileId, medicationId } = req.params;
  if (!validUuid(profileId)) return invalidProfileId(res);
  if (!validUuid(medicationId)) {
    return res.status(400).json({
      error: { code: 'MEDICATION_ID_INVALID', message: 'medicationId no es un UUID válido.' },
    });
  }

  try {
    await deleteMedicationRecord(req.user.id, profileId, medicationId);
    return res.status(204).send();
  } catch (error) {
    return sendProfileMedicalError(res, error);
  }
}

module.exports = {
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
