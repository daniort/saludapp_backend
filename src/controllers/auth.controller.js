const {
  FirebaseSignInError,
  createUserWithEmailAndPassword,
  refreshFirebaseToken,
  signInWithGoogleIdToken,
  signInWithEmailAndPassword,
} = require('../services/firebase-auth.service');
const {
  RegistrationProvisionError,
  provisionRegisteredUser,
} = require('../services/registration.service');

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

function validateCredentials(email, password) {
  if (typeof email !== 'string' || email.trim() === '') {
    return { code: 'EMAIL_REQUIRED', message: 'El correo electrónico es obligatorio.' };
  }

  if (typeof password !== 'string' || password === '') {
    return { code: 'PASSWORD_REQUIRED', message: 'La contraseña es obligatoria.' };
  }

  return null;
}

function normalizedOptionalName(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized || null;
}

function googlePersonalProfile(user) {
  const firstName = normalizedOptionalName(user.firstName);
  const displayName = normalizedOptionalName(user.displayName);
  const emailLocalPart = typeof user.email === 'string'
    ? user.email.split('@')[0].trim()
    : '';

  return {
    givenNames: firstName || displayName || emailLocalPart,
    paternalSurname: normalizedOptionalName(user.lastName),
    maternalSurname: null,
    birthDate: null,
  };
}

function googleLoginData(session, provisioned) {
  return {
    user: {
      uid: session.user.uid,
      id: provisioned.localUserId,
      email: session.user.email,
      displayName: provisioned.displayName || session.user.displayName,
    },
    profile: provisioned.profile,
    tokens: session.tokens,
    isNewUser: provisioned.isNewUser,
  };
}

function firebaseErrorResponse(res, error) {
  const messages = {
    INVALID_CREDENTIALS: 'El correo o la contraseña son incorrectos.',
    USER_DISABLED: 'La cuenta está deshabilitada.',
    ACCOUNT_ALREADY_EXISTS: 'Ya existe una cuenta con ese correo.',
    EMAIL_INVALID: 'El correo electrónico no es válido.',
    PASSWORD_WEAK: 'La contraseña no cumple la política de seguridad de Firebase.',
    EMAIL_PASSWORD_SIGN_UP_DISABLED: 'El registro con correo y contraseña está deshabilitado.',
    TOO_MANY_ATTEMPTS: 'Demasiados intentos. Intenta nuevamente más tarde.',
    FIREBASE_NOT_CONFIGURED: 'Firebase Authentication no está configurado.',
    FIREBASE_UNAVAILABLE: 'Firebase Authentication no está disponible.',
    FIREBASE_INVALID_RESPONSE: 'Firebase Authentication devolvió una respuesta inválida.',
    FIREBASE_SIGN_IN_FAILED: 'No fue posible iniciar sesión con Firebase.',
    FIREBASE_SIGN_UP_FAILED: 'No fue posible registrar la cuenta con Firebase.',
    REFRESH_TOKEN_INVALID: 'El refresh token no es válido o expiró.',
    REFRESH_TOKEN_PROJECT_MISMATCH: 'El refresh token pertenece a otro proyecto.',
    FIREBASE_REFRESH_FAILED: 'No fue posible renovar la sesión con Firebase.',
    GOOGLE_ID_TOKEN_INVALID: 'El token de Google no es válido o expiró.',
    GOOGLE_ACCOUNT_LINK_REQUIRED: 'La cuenta debe vincularse con un método existente.',
    GOOGLE_SIGN_IN_DISABLED: 'El inicio de sesión con Google está deshabilitado.',
    FIREBASE_GOOGLE_SIGN_IN_FAILED: 'No fue posible iniciar sesión con Google.',
  };

  return res.status(error.statusCode).json({
    error: { code: error.code, message: messages[error.code] },
  });
}

async function register(req, res) {
  const {
    email,
    password,
    givenNames,
    paternalSurname,
    maternalSurname,
    birthDate,
  } = req.body || {};
  const validationError = validateCredentials(email, password);

  if (validationError) return res.status(400).json({ error: validationError });

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
    const session = await createUserWithEmailAndPassword(email.trim(), password);
    const provisioned = await provisionRegisteredUser(session.user, {
      givenNames: givenNames.trim(),
      paternalSurname: normalizedPaternalSurname,
      maternalSurname: normalizedMaternalSurname,
      birthDate: birthDate || null,
    });

    return res.status(201).json({
      data: {
        user: { ...session.user, id: provisioned.localUserId },
        profile: provisioned.profile,
        tokens: session.tokens,
      },
    });
  } catch (error) {
    if (error instanceof FirebaseSignInError) return firebaseErrorResponse(res, error);

    if (error instanceof RegistrationProvisionError) {
      return res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: 'El usuario de Firebase existe, pero sus datos locales entraron en conflicto.',
        },
      });
    }

    console.error('Register local user error:', error.message);
    return res.status(500).json({
      error: {
        code: 'LOCAL_REGISTRATION_FAILED',
        message: 'La cuenta se creó en Firebase, pero no fue posible crear sus datos locales.',
      },
    });
  }
}

async function login(req, res) {
  const { email, password } = req.body || {};
  const validationError = validateCredentials(email, password);

  if (validationError) return res.status(400).json({ error: validationError });

  try {
    const session = await signInWithEmailAndPassword(email.trim(), password);
    return res.status(200).json({ data: session });
  } catch (error) {
    if (error instanceof FirebaseSignInError) return firebaseErrorResponse(res, error);

    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
    });
  }
}

async function refresh(req, res) {
  const { refreshToken } = req.body || {};

  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    return res.status(400).json({
      error: {
        code: 'REFRESH_TOKEN_REQUIRED',
        message: 'refreshToken es obligatorio.',
      },
    });
  }

  try {
    const tokens = await refreshFirebaseToken(refreshToken.trim());
    return res.status(200).json({ data: { tokens } });
  } catch (error) {
    if (error instanceof FirebaseSignInError) return firebaseErrorResponse(res, error);

    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Ocurrió un error inesperado.' },
    });
  }
}

async function googleLogin(req, res) {
  const { googleIdToken } = req.body || {};

  if (typeof googleIdToken !== 'string' || googleIdToken.trim() === '') {
    return res.status(400).json({
      error: {
        code: 'GOOGLE_ID_TOKEN_REQUIRED',
        message: 'googleIdToken es obligatorio.',
      },
    });
  }

  try {
    const session = await signInWithGoogleIdToken(googleIdToken.trim());
    const provisioned = await provisionRegisteredUser(
      session.user,
      googlePersonalProfile(session.user),
    );

    return res.status(200).json({ data: googleLoginData(session, provisioned) });
  } catch (error) {
    if (error instanceof FirebaseSignInError) return firebaseErrorResponse(res, error);

    if (error instanceof RegistrationProvisionError) {
      return res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: 'La cuenta de Google existe, pero sus datos locales entraron en conflicto.',
        },
      });
    }

    console.error('Google login local user error:', error.message);
    return res.status(500).json({
      error: {
        code: 'GOOGLE_LOCAL_REGISTRATION_FAILED',
        message: 'Google autenticó al usuario, pero no fue posible crear sus datos locales.',
      },
    });
  }
}

function logout(req, res) {
  return res.status(204).send();
}

module.exports = {
  googleLoginData,
  googlePersonalProfile,
  googleLogin,
  login,
  logout,
  refresh,
  register,
};
