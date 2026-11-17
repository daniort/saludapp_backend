const {
  ProfileError,
  createProfile: createProfileRecord,
  deleteProfile: deleteProfileRecord,
  getProfile: getProfileRecord,
  listProfiles: listProfileRecords,
  updateProfile: updateProfileRecord,
} = require('../services/profile.service');

const PROFILE_TYPES = new Set(['personal', 'dependent']);
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function optionalText(value, maxLength) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return undefined;

  const normalized = value.trim();
  return normalized !== '' && normalized.length <= maxLength ? normalized : undefined;
}

function validBirthDate(value) {
  if (value === undefined || value === null || value === '') return true;
  if (typeof value !== 'string' || !DATE_PATTERN.test(value)) return false;

  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime())
    && date.toISOString().slice(0, 10) === value
    && value <= new Date().toISOString().slice(0, 10);
}

function sendProfileError(res, error, fallbackCode, fallbackMessage) {
  if (error instanceof ProfileError) {
    const messages = {
      PERSONAL_PROFILE_EXISTS: 'El usuario ya tiene un perfil personal.',
      PROFILE_NOT_FOUND: 'El perfil no existe o no pertenece al usuario.',
      PERSONAL_PROFILE_DELETE_NOT_ALLOWED: 'El perfil personal no puede eliminarse.',
    };

    return res.status(error.statusCode).json({
      error: { code: error.code, message: messages[error.code] },
    });
  }

  console.error('Profile operation error:', error.message);
  return res.status(500).json({
    error: { code: fallbackCode, message: fallbackMessage },
  });
}

async function createProfile(req, res) {
  const {
    profileType,
    givenNames,
    paternalSurname,
    maternalSurname,
    birthDate,
  } = req.body || {};

  if (!PROFILE_TYPES.has(profileType)) {
    return res.status(400).json({
      error: {
        code: 'PROFILE_TYPE_INVALID',
        message: 'profileType debe ser personal o dependent.',
      },
    });
  }

  if (
    typeof givenNames !== 'string'
    || givenNames.trim() === ''
    || givenNames.trim().length > 150
  ) {
    return res.status(400).json({
      error: {
        code: 'GIVEN_NAMES_INVALID',
        message: 'givenNames es obligatorio y admite hasta 150 caracteres.',
      },
    });
  }

  const normalizedPaternalSurname = optionalText(paternalSurname, 100);
  const normalizedMaternalSurname = optionalText(maternalSurname, 100);

  if (normalizedPaternalSurname === undefined || normalizedMaternalSurname === undefined) {
    return res.status(400).json({
      error: {
        code: 'SURNAMES_INVALID',
        message: 'Los apellidos deben ser texto de hasta 100 caracteres.',
      },
    });
  }

  if (!validBirthDate(birthDate)) {
    return res.status(400).json({
      error: {
        code: 'BIRTH_DATE_INVALID',
        message: 'birthDate debe ser una fecha válida en formato YYYY-MM-DD y no ser futura.',
      },
    });
  }

  try {
    const profile = await createProfileRecord(req.user.id, {
      profileType,
      givenNames: givenNames.trim(),
      paternalSurname: normalizedPaternalSurname,
      maternalSurname: normalizedMaternalSurname,
      birthDate: birthDate || null,
    });

    return res.status(201).json({ data: { profile } });
  } catch (error) {
    return sendProfileError(
      res,
      error,
      'PROFILE_CREATE_FAILED',
      'No fue posible crear el perfil.',
    );
  }
}

async function listProfiles(req, res) {
  try {
    const profiles = await listProfileRecords(req.user.id);
    return res.status(200).json({ data: { profiles, count: profiles.length } });
  } catch (error) {
    return sendProfileError(
      res,
      error,
      'PROFILES_LIST_FAILED',
      'No fue posible consultar los perfiles.',
    );
  }
}

async function getProfile(req, res) {
  const { profileId } = req.params;

  if (!UUID_PATTERN.test(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  try {
    const profile = await getProfileRecord(req.user.id, profileId);
    return res.status(200).json({ data: { profile } });
  } catch (error) {
    return sendProfileError(
      res,
      error,
      'PROFILE_GET_FAILED',
      'No fue posible consultar el perfil.',
    );
  }
}

async function updateProfile(req, res) {
  const { profileId } = req.params;
  const body = req.body || {};

  if (!UUID_PATTERN.test(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  if (body.profileType !== undefined) {
    return res.status(400).json({
      error: { code: 'PROFILE_TYPE_IMMUTABLE', message: 'profileType no puede modificarse.' },
    });
  }

  const changes = {};

  if (body.givenNames !== undefined) {
    if (
      typeof body.givenNames !== 'string'
      || body.givenNames.trim() === ''
      || body.givenNames.trim().length > 150
    ) {
      return res.status(400).json({
        error: {
          code: 'GIVEN_NAMES_INVALID',
          message: 'givenNames debe contener hasta 150 caracteres.',
        },
      });
    }
    changes.given_names = body.givenNames.trim();
  }

  if (body.paternalSurname !== undefined) {
    const value = optionalText(body.paternalSurname, 100);
    if (value === undefined) {
      return res.status(400).json({
        error: { code: 'PATERNAL_SURNAME_INVALID', message: 'paternalSurname no es válido.' },
      });
    }
    changes.paternal_surname = value;
  }

  if (body.maternalSurname !== undefined) {
    const value = optionalText(body.maternalSurname, 100);
    if (value === undefined) {
      return res.status(400).json({
        error: { code: 'MATERNAL_SURNAME_INVALID', message: 'maternalSurname no es válido.' },
      });
    }
    changes.maternal_surname = value;
  }

  if (body.birthDate !== undefined) {
    if (!validBirthDate(body.birthDate)) {
      return res.status(400).json({
        error: {
          code: 'BIRTH_DATE_INVALID',
          message: 'birthDate debe ser una fecha válida en formato YYYY-MM-DD y no ser futura.',
        },
      });
    }
    changes.birth_date = body.birthDate || null;
  }

  if (Object.keys(changes).length === 0) {
    return res.status(400).json({
      error: { code: 'NO_CHANGES', message: 'No se enviaron campos para actualizar.' },
    });
  }

  try {
    const profile = await updateProfileRecord(req.user.id, profileId, changes);
    return res.status(200).json({ data: { profile } });
  } catch (error) {
    return sendProfileError(
      res,
      error,
      'PROFILE_UPDATE_FAILED',
      'No fue posible actualizar el perfil.',
    );
  }
}

async function deleteProfile(req, res) {
  const { profileId } = req.params;

  if (!UUID_PATTERN.test(profileId)) {
    return res.status(400).json({
      error: { code: 'PROFILE_ID_INVALID', message: 'profileId no es un UUID válido.' },
    });
  }

  try {
    await deleteProfileRecord(req.user.id, profileId);
    return res.status(204).send();
  } catch (error) {
    return sendProfileError(
      res,
      error,
      'PROFILE_DELETE_FAILED',
      'No fue posible eliminar el perfil.',
    );
  }
}

module.exports = {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
};
