const FIREBASE_SIGN_IN_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword';
const FIREBASE_SIGN_UP_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signUp';
const FIREBASE_REFRESH_URL = 'https://securetoken.googleapis.com/v1/token';
const FIREBASE_GOOGLE_SIGN_IN_URL =
  'https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp';

class FirebaseSignInError extends Error {
  constructor(code, statusCode) {
    super(code);
    this.name = 'FirebaseSignInError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function getFirebaseApiKey() {
  const apiKey = process.env.FIREBASE_API_KEY;

  if (!apiKey) {
    throw new FirebaseSignInError('FIREBASE_NOT_CONFIGURED', 503);
  }

  return apiKey;
}

function firebaseErrorCode(message) {
  return typeof message === 'string' ? message.split(' : ')[0] : null;
}

function mapFirebaseSignInError(message) {
  switch (firebaseErrorCode(message)) {
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_EMAIL':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
      return new FirebaseSignInError('INVALID_CREDENTIALS', 401);
    case 'USER_DISABLED':
      return new FirebaseSignInError('USER_DISABLED', 403);
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new FirebaseSignInError('TOO_MANY_ATTEMPTS', 429);
    default:
      return new FirebaseSignInError('FIREBASE_SIGN_IN_FAILED', 502);
  }
}

function mapFirebaseSignUpError(message) {
  switch (firebaseErrorCode(message)) {
    case 'EMAIL_EXISTS':
      return new FirebaseSignInError('ACCOUNT_ALREADY_EXISTS', 409);
    case 'INVALID_EMAIL':
      return new FirebaseSignInError('EMAIL_INVALID', 400);
    case 'WEAK_PASSWORD':
      return new FirebaseSignInError('PASSWORD_WEAK', 400);
    case 'OPERATION_NOT_ALLOWED':
      return new FirebaseSignInError('EMAIL_PASSWORD_SIGN_UP_DISABLED', 503);
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return new FirebaseSignInError('TOO_MANY_ATTEMPTS', 429);
    default:
      return new FirebaseSignInError('FIREBASE_SIGN_UP_FAILED', 502);
  }
}

function mapFirebaseRefreshError(message) {
  switch (firebaseErrorCode(message)) {
    case 'TOKEN_EXPIRED':
    case 'INVALID_REFRESH_TOKEN':
    case 'USER_NOT_FOUND':
      return new FirebaseSignInError('REFRESH_TOKEN_INVALID', 401);
    case 'USER_DISABLED':
      return new FirebaseSignInError('USER_DISABLED', 403);
    case 'PROJECT_NUMBER_MISMATCH':
      return new FirebaseSignInError('REFRESH_TOKEN_PROJECT_MISMATCH', 401);
    default:
      return new FirebaseSignInError('FIREBASE_REFRESH_FAILED', 502);
  }
}

function mapFirebaseGoogleError(message) {
  switch (firebaseErrorCode(message)) {
    case 'INVALID_IDP_RESPONSE':
    case 'INVALID_CREDENTIAL_OR_PROVIDER_ID':
      return new FirebaseSignInError('GOOGLE_ID_TOKEN_INVALID', 401);
    case 'USER_DISABLED':
      return new FirebaseSignInError('USER_DISABLED', 403);
    case 'EMAIL_EXISTS':
    case 'FEDERATED_USER_ID_ALREADY_LINKED':
      return new FirebaseSignInError('GOOGLE_ACCOUNT_LINK_REQUIRED', 409);
    case 'OPERATION_NOT_ALLOWED':
      return new FirebaseSignInError('GOOGLE_SIGN_IN_DISABLED', 503);
    default:
      return new FirebaseSignInError('FIREBASE_GOOGLE_SIGN_IN_FAILED', 502);
  }
}

function mapSession(payload) {
  return {
    user: {
      uid: payload.localId,
      email: payload.email,
      displayName: payload.displayName || null,
    },
    tokens: {
      idToken: payload.idToken,
      refreshToken: payload.refreshToken,
      expiresIn: Number(payload.expiresIn),
      tokenType: 'Bearer',
    },
  };
}

async function firebaseEmailPasswordRequest(url, email, password, mapError) {
  const apiKey = getFirebaseApiKey();
  let response;

  try {
    response = await fetch(`${url}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        password,
        returnSecureToken: true,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new FirebaseSignInError('FIREBASE_UNAVAILABLE', 502);
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new FirebaseSignInError('FIREBASE_INVALID_RESPONSE', 502);
  }

  if (!response.ok) {
    throw mapError(payload?.error?.message);
  }

  return mapSession(payload);
}

async function signInWithEmailAndPassword(email, password) {
  return firebaseEmailPasswordRequest(
    FIREBASE_SIGN_IN_URL,
    email,
    password,
    mapFirebaseSignInError,
  );
}

async function createUserWithEmailAndPassword(email, password) {
  return firebaseEmailPasswordRequest(
    FIREBASE_SIGN_UP_URL,
    email,
    password,
    mapFirebaseSignUpError,
  );
}

async function refreshFirebaseToken(refreshToken) {
  const apiKey = getFirebaseApiKey();
  let response;

  try {
    response = await fetch(`${FIREBASE_REFRESH_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (error) {
    throw new FirebaseSignInError('FIREBASE_UNAVAILABLE', 502);
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new FirebaseSignInError('FIREBASE_INVALID_RESPONSE', 502);
  }

  if (!response.ok) {
    throw mapFirebaseRefreshError(payload?.error?.message);
  }

  return {
    idToken: payload.id_token,
    refreshToken: payload.refresh_token,
    expiresIn: Number(payload.expires_in),
    tokenType: payload.token_type || 'Bearer',
  };
}

async function signInWithGoogleIdToken(googleIdToken) {
  const apiKey = getFirebaseApiKey();
  const requestUri = process.env.FIREBASE_AUTH_REQUEST_URI || 'http://localhost';
  let response;

  try {
    response = await fetch(
      `${FIREBASE_GOOGLE_SIGN_IN_URL}?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          postBody: new URLSearchParams({
            id_token: googleIdToken,
            providerId: 'google.com',
          }).toString(),
          requestUri,
          returnIdpCredential: true,
          returnSecureToken: true,
        }),
        signal: AbortSignal.timeout(10_000),
      },
    );
  } catch (error) {
    throw new FirebaseSignInError('FIREBASE_UNAVAILABLE', 502);
  }

  let payload;

  try {
    payload = await response.json();
  } catch (error) {
    throw new FirebaseSignInError('FIREBASE_INVALID_RESPONSE', 502);
  }

  if (!response.ok) {
    throw mapFirebaseGoogleError(payload?.error?.message);
  }

  const session = mapSession(payload);

  return {
    ...session,
    user: {
      ...session.user,
      firstName: payload.firstName || null,
      lastName: payload.lastName || null,
      photoUrl: payload.photoUrl || null,
      emailVerified: payload.emailVerified === true,
    },
    isNewUser: payload.isNewUser === true,
  };
}

module.exports = {
  FirebaseSignInError,
  createUserWithEmailAndPassword,
  refreshFirebaseToken,
  signInWithGoogleIdToken,
  signInWithEmailAndPassword,
};
