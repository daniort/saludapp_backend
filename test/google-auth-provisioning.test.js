const assert = require('node:assert/strict');
const test = require('node:test');

const {
  googleLoginData,
  googlePersonalProfile,
} = require('../src/controllers/auth.controller');
const { listProfiles: listProfilesController } = require('../src/controllers/profiles.controller');
const pool = require('../src/config/db');
const {
  FirebaseSignInError,
  signInWithGoogleIdToken,
} = require('../src/services/firebase-auth.service');
const { listProfiles } = require('../src/services/profile.service');
const { provisionRegisteredUser } = require('../src/services/registration.service');
const { RegistrationMemoryDatabase } = require('./helpers/registration-memory-db');

function googleUser(overrides = {}) {
  return {
    uid: 'firebase-google-user',
    email: 'daniel@example.com',
    displayName: 'Daniel Ortiz',
    firstName: 'Daniel',
    lastName: 'Ortiz',
    emailVerified: true,
    ...overrides,
  };
}

async function provisionGoogleUser(database, overrides = {}) {
  const user = googleUser(overrides);
  return provisionRegisteredUser(user, googlePersonalProfile(user), database);
}

test('el Google ID Token se intercambia y valida mediante Firebase Authentication', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.FIREBASE_API_KEY;
  const originalRequestUri = process.env.FIREBASE_AUTH_REQUEST_URI;
  let capturedRequest;

  process.env.FIREBASE_API_KEY = 'test-api-key';
  process.env.FIREBASE_AUTH_REQUEST_URI = 'https://example.test';
  global.fetch = async (url, options) => {
    capturedRequest = { url, options };
    return {
      ok: true,
      async json() {
        return {
          localId: 'firebase-google-user',
          email: 'daniel@example.com',
          displayName: 'Daniel Ortiz',
          firstName: 'Daniel',
          idToken: 'firebase-id-token',
          refreshToken: 'firebase-refresh-token',
          expiresIn: '3600',
          emailVerified: true,
          isNewUser: true,
        };
      },
    };
  };

  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.FIREBASE_API_KEY;
    else process.env.FIREBASE_API_KEY = originalApiKey;
    if (originalRequestUri === undefined) delete process.env.FIREBASE_AUTH_REQUEST_URI;
    else process.env.FIREBASE_AUTH_REQUEST_URI = originalRequestUri;
  });

  const session = await signInWithGoogleIdToken('google-id-token-for-test');
  const requestBody = JSON.parse(capturedRequest.options.body);
  const providerParameters = new URLSearchParams(requestBody.postBody);

  assert.match(capturedRequest.url, /accounts:signInWithIdp/);
  assert.equal(providerParameters.get('id_token'), 'google-id-token-for-test');
  assert.equal(providerParameters.get('providerId'), 'google.com');
  assert.equal(requestBody.returnSecureToken, true);
  assert.equal(session.user.uid, 'firebase-google-user');
  assert.equal(session.tokens.tokenType, 'Bearer');
});

test('Firebase rechaza una respuesta de Google incompleta', async (t) => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.FIREBASE_API_KEY;
  process.env.FIREBASE_API_KEY = 'test-api-key';
  global.fetch = async () => ({
    ok: true,
    async json() {
      return { email: 'daniel@example.com' };
    },
  });

  t.after(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.FIREBASE_API_KEY;
    else process.env.FIREBASE_API_KEY = originalApiKey;
  });

  await assert.rejects(
    signInWithGoogleIdToken('google-id-token-for-test'),
    (error) => error instanceof FirebaseSignInError
      && error.code === 'FIREBASE_INVALID_RESPONSE',
  );
});

test('primer login con Google crea usuario, perfil personal y relación owner', async () => {
  const database = new RegistrationMemoryDatabase();
  const provisioned = await provisionGoogleUser(database);

  assert.equal(provisioned.isNewUser, true);
  assert.deepEqual(database.counts(), { users: 1, profiles: 1, userProfiles: 1 });
  assert.equal(provisioned.profile.profileType, 'personal');
  assert.equal(provisioned.profile.givenNames, 'Daniel');
  assert.equal(provisioned.profile.paternalSurname, 'Ortiz');
  assert.equal(provisioned.profile.maternalSurname, null);
  assert.equal(provisioned.profile.birthDate, null);
  assert.equal(provisioned.profile.accessRole, 'owner');
  assert.equal(provisioned.profile.isOwner, true);

  const data = googleLoginData({
    user: googleUser(),
    tokens: {
      idToken: 'test-id-token',
      refreshToken: 'test-refresh-token',
      expiresIn: 3600,
      tokenType: 'Bearer',
    },
  }, provisioned);

  assert.deepEqual(Object.keys(data.user), ['uid', 'id', 'email', 'displayName']);
  assert.equal(data.isNewUser, true);
  assert.equal(data.profile.id, provisioned.profile.id);
});

test('segundo login del mismo usuario reutiliza usuario, perfil y relación', async () => {
  const database = new RegistrationMemoryDatabase();
  const first = await provisionGoogleUser(database);
  const second = await provisionGoogleUser(database);

  assert.equal(second.isNewUser, false);
  assert.equal(second.localUserId, first.localUserId);
  assert.equal(second.profile.id, first.profile.id);
  assert.deepEqual(database.counts(), { users: 1, profiles: 1, userProfiles: 1 });
});

test('usuario local existente sin perfil recibe un perfil personal', async () => {
  const database = new RegistrationMemoryDatabase();
  const existingUser = database.seedUser({
    uid: 'firebase-google-user',
    email: 'daniel@example.com',
    displayName: 'Daniel Ortiz',
  });

  const provisioned = await provisionGoogleUser(database);

  assert.equal(provisioned.isNewUser, false);
  assert.equal(provisioned.localUserId, existingUser.id);
  assert.deepEqual(database.counts(), { users: 1, profiles: 1, userProfiles: 1 });
});

test('perfil personal existente sin relación owner es reparado', async () => {
  const database = new RegistrationMemoryDatabase();
  const existingUser = database.seedUser({
    uid: 'firebase-google-user',
    email: 'daniel@example.com',
  });
  const existingProfile = database.seedPersonalProfile(existingUser.id);

  const provisioned = await provisionGoogleUser(database);

  assert.equal(provisioned.profile.id, existingProfile.id);
  assert.deepEqual(database.counts(), { users: 1, profiles: 1, userProfiles: 1 });
  assert.equal(database.state.userProfiles[0].access_role, 'owner');
});

test('Google sin apellido almacena los apellidos como null', async () => {
  const database = new RegistrationMemoryDatabase();
  const provisioned = await provisionGoogleUser(database, { lastName: null });

  assert.equal(provisioned.profile.paternalSurname, null);
  assert.equal(provisioned.profile.maternalSurname, null);
});

test('Google sin fecha de nacimiento almacena birthDate como null', async () => {
  const database = new RegistrationMemoryDatabase();
  const provisioned = await provisionGoogleUser(database);

  assert.equal(provisioned.profile.birthDate, null);
});

test('givenNames respeta firstName, displayName y correo como fallbacks', () => {
  assert.equal(googlePersonalProfile(googleUser()).givenNames, 'Daniel');
  assert.equal(googlePersonalProfile(googleUser({ firstName: null })).givenNames, 'Daniel Ortiz');
  assert.equal(googlePersonalProfile(googleUser({
    firstName: null,
    displayName: null,
  })).givenNames, 'daniel');
});

test('dos logins concurrentes no duplican registros', async () => {
  const database = new RegistrationMemoryDatabase();
  const [first, second] = await Promise.all([
    provisionGoogleUser(database),
    provisionGoogleUser(database),
  ]);

  assert.equal(first.localUserId, second.localUserId);
  assert.equal(first.profile.id, second.profile.id);
  assert.equal([first.isNewUser, second.isNewUser].filter(Boolean).length, 1);
  assert.deepEqual(database.counts(), { users: 1, profiles: 1, userProfiles: 1 });
});

test('un fallo al crear el perfil revierte también el usuario', async () => {
  const database = new RegistrationMemoryDatabase();
  database.failNextProfileInsert = true;

  await assert.rejects(
    provisionGoogleUser(database),
    /PROFILE_INSERT_FAILED/,
  );

  assert.deepEqual(database.counts(), { users: 0, profiles: 0, userProfiles: 0 });
});

test('GET de perfiles puede devolver el perfil personal aprovisionado', async () => {
  const database = new RegistrationMemoryDatabase();
  const provisioned = await provisionGoogleUser(database);
  const profiles = await listProfiles(provisioned.localUserId, database);

  assert.equal(profiles.length, 1);
  assert.equal(profiles[0].id, provisioned.profile.id);
  assert.equal(profiles[0].profileType, 'personal');
  assert.equal(profiles[0].accessRole, 'owner');
  assert.equal(profiles[0].isOwner, true);
});

test('el controlador GET /api/v1/profiles responde con el perfil aprovisionado', async (t) => {
  const database = new RegistrationMemoryDatabase();
  const provisioned = await provisionGoogleUser(database);
  t.mock.method(pool, 'query', database.query.bind(database));

  let statusCode;
  let responseBody;
  const response = {
    status(value) {
      statusCode = value;
      return this;
    },
    json(value) {
      responseBody = value;
      return this;
    },
  };

  await listProfilesController(
    { user: { id: provisioned.localUserId } },
    response,
  );

  assert.equal(statusCode, 200);
  assert.equal(responseBody.data.count, 1);
  assert.equal(responseBody.data.profiles[0].id, provisioned.profile.id);
  assert.equal(responseBody.data.profiles[0].accessRole, 'owner');
});
