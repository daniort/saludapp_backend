const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const pool = require('../src/config/db');
const { app } = require('../src/index');
const { createInvitation } = require('../src/services/profile-sharing.service');

async function withServer(t) {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

function withEnvironment(t, values) {
  const previousValues = Object.fromEntries(
    Object.keys(values).map((key) => [key, process.env[key]]),
  );

  Object.assign(process.env, values);
  t.after(() => {
    for (const [key, value] of Object.entries(previousValues)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });
}

test('crear invitación devuelve un enlace HTTPS canónico sin persistir el token', async (t) => {
  const originalQuery = pool.query;
  const queryCalls = [];
  const invitationId = '11111111-1111-4111-8111-111111111111';
  const profileId = '22222222-2222-4222-8222-222222222222';
  const userId = '33333333-3333-4333-8333-333333333333';
  const context = {
    flow: 'family_profile_invitation',
    version: 1,
    resourceType: 'profile',
    redirectPath: '/family/invitations/accept',
    requiresAuthentication: true,
  };

  pool.query = async (query, parameters) => {
    queryCalls.push({ query, parameters });

    if (queryCalls.length === 1) {
      return {
        rowCount: 1,
        rows: [{ id: invitationId }],
      };
    }

    return {
      rowCount: 1,
      rows: [{
        id: invitationId,
        profile_id: profileId,
        invited_by_user_id: userId,
        given_names: 'María',
        paternal_surname: 'Ortiz',
        maternal_surname: null,
        invited_by_display_name: 'Daniel Ortiz',
        access_role: 'viewer',
        context,
        expires_at: new Date('2026-11-25T12:00:00.000Z'),
        created_at: new Date('2026-11-18T12:00:00.000Z'),
      }],
    };
  };
  t.after(() => {
    pool.query = originalQuery;
  });

  const invitation = await createInvitation(
    userId,
    profileId,
    'https://abundant-smile-production-15a63da4.up.railway.app',
  );

  assert.match(invitation.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(invitation.sharePath, `/i/${invitation.token}`);
  assert.equal(
    invitation.shareUrl,
    `https://abundant-smile-production-15a63da4.up.railway.app${invitation.sharePath}`,
  );
  assert.notEqual(queryCalls[0].parameters[2], invitation.token);
  assert.match(queryCalls[0].parameters[2], /^[a-f0-9]{64}$/);
});

test('assetlinks.json publica la asociación configurada de Android', async (t) => {
  const fingerprint = Array(32).fill('AB').join(':');
  withEnvironment(t, {
    ANDROID_PACKAGE_NAME: 'mx.saludapp.mobile',
    ANDROID_SHA256_CERT_FINGERPRINTS: fingerprint,
  });
  const baseUrl = await withServer(t);

  const response = await fetch(`${baseUrl}/.well-known/assetlinks.json`);

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await response.json(), [{
    relation: ['delegate_permission/common.handle_all_urls'],
    target: {
      namespace: 'android_app',
      package_name: 'mx.saludapp.mobile',
      sha256_cert_fingerprints: [fingerprint],
    },
  }]);
});

test('apple-app-site-association limita los Universal Links a invitaciones', async (t) => {
  withEnvironment(t, {
    IOS_TEAM_ID: 'A1B2C3D4E5',
    IOS_BUNDLE_ID: 'mx.saludapp.mobile',
  });
  const baseUrl = await withServer(t);

  const response = await fetch(
    `${baseUrl}/.well-known/apple-app-site-association`,
  );

  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /^application\/json/);
  assert.deepEqual(await response.json(), {
    applinks: {
      apps: [],
      details: [{
        appID: 'A1B2C3D4E5.mx.saludapp.mobile',
        paths: ['/i/*'],
      }],
    },
  });
});

test('la pantalla pública oculta invitaciones con tokens inválidos', async (t) => {
  const baseUrl = await withServer(t);

  const response = await fetch(`${baseUrl}/i/not-a-token`);
  const body = await response.text();

  assert.equal(response.status, 404);
  assert.match(response.headers.get('content-type'), /^text\/html/);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow, noarchive');
  assert.match(body, /Esta invitación no es válida/);
  assert.doesNotMatch(body, /not-a-token/);
});
