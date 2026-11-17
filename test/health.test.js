const assert = require('node:assert/strict');
const { once } = require('node:events');
const test = require('node:test');

const { app } = require('../src/index');

test('GET /health informa que el servicio está disponible', async (t) => {
  const server = app.listen(0, '127.0.0.1');
  t.after(() => new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  }));

  await once(server, 'listening');
  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/health`);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { status: 'ok' });
});
