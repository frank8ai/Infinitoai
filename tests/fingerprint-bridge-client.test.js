const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getFingerprintBridgeHealth,
  validateFingerprintBridgeHealth,
} = require('../shared/fingerprint-bridge-client.js');

test('fingerprint bridge health validation accepts a ready bridge and Roxy API', () => {
  assert.equal(
    validateFingerprintBridgeHealth(
      {
        ok: true,
        bridge: { status: 'ok' },
        roxy: { reachable: true, message: 'ok' },
      },
      {
        roxy: {
          apiBaseUrl: 'http://127.0.0.1:50000',
          workspaceId: '42',
        },
      }
    ),
    true
  );
});

test('fingerprint bridge health validation fails before run creation when Workspace is missing', () => {
  assert.throws(
    () => validateFingerprintBridgeHealth(
      {
        ok: true,
        bridge: { status: 'ok' },
        roxy: { reachable: true, message: 'ok' },
      },
      {
        roxy: {
          apiBaseUrl: 'http://127.0.0.1:50000',
          workspaceId: '',
        },
      }
    ),
    /Roxy workspace id is missing/
  );
});

test('fingerprint bridge health validation fails before run creation when Roxy API is unreachable', () => {
  assert.throws(
    () => validateFingerprintBridgeHealth(
      {
        ok: true,
        bridge: { status: 'ok' },
        roxy: {
          reachable: false,
          message: 'connection refused',
        },
      },
      {
        roxy: {
          apiBaseUrl: 'http://127.0.0.1:50000',
          workspaceId: '42',
        },
      }
    ),
    /Roxy API is unreachable at http:\/\/127\.0\.0\.1:50000 \(connection refused\)/
  );
});

test('fingerprint bridge health request forwards the configured Roxy API base url', async () => {
  const seen = [];
  const response = await getFingerprintBridgeHealth({
    baseUrl: 'http://127.0.0.1:50001',
    roxyApiBaseUrl: 'http://10.0.0.9:55123/',
    fetchImpl: async (url, options) => {
      seen.push({ url, options });
      return {
        ok: true,
        async text() {
          return JSON.stringify({ ok: true, bridge: { status: 'ok' }, roxy: { reachable: true } });
        },
      };
    },
  });

  assert.equal(response.ok, true);
  assert.equal(seen.length, 1);
  assert.match(seen[0].url, /\/health\?roxyApiBaseUrl=http%3A%2F%2F10\.0\.0\.9%3A55123$/);
  assert.equal(seen[0].options.method, 'GET');
});
