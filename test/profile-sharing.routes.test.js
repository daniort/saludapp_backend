const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const { app } = require('../src/index');

async function withServer(t) {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));
  await once(server, 'listening');
  return `http://127.0.0.1:${server.address().port}`;
}

test('GET de invitación oculta tokens con formato inválido', async (t) => {
  const baseUrl = await withServer(t);
  const response = await fetch(`${baseUrl}/api/v1/profile-invitations/not-a-token`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: {
      code: 'INVITATION_NOT_FOUND',
      message: 'La invitación no existe.',
    },
  });
});

test('Aceptar una invitación requiere autenticación', async (t) => {
  const baseUrl = await withServer(t);
  const token = 'a'.repeat(43);
  const response = await fetch(
    `${baseUrl}/api/v1/profile-invitations/${token}/accept`,
    { method: 'POST' },
  );

  assert.equal(response.status, 401);
  assert.equal((await response.json()).error.code, 'AUTH_TOKEN_REQUIRED');
});
