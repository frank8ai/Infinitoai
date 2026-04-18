const test = require('node:test');
const assert = require('node:assert/strict');

const {
  exchangeCodex2ApiOAuthCallback,
  generateCodex2ApiOAuthUrl,
  normalizeCodex2ApiOAuthConfig,
  parseOAuthCallbackUrl,
} = require('../shared/codex2api-oauth.js');

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('normalizeCodex2ApiOAuthConfig trims base url and admin key', () => {
  assert.deepEqual(
    normalizeCodex2ApiOAuthConfig({
      baseUrl: ' https://codex2api.bitpowerhub.com/ ',
      adminKey: ' secret-key ',
      proxyUrl: ' http://127.0.0.1:7890 ',
      accountName: ' test account ',
    }),
    {
      baseUrl: 'https://codex2api.bitpowerhub.com',
      adminKey: 'secret-key',
      proxyUrl: 'http://127.0.0.1:7890',
      accountName: 'test account',
    },
  );
});

test('generateCodex2ApiOAuthUrl calls the admin oauth endpoint', async () => {
  const calls = [];
  const result = await generateCodex2ApiOAuthUrl({
    baseUrl: 'https://codex2api.bitpowerhub.com',
    adminKey: 'admin-secret',
    proxyUrl: 'http://127.0.0.1:7890',
  }, {
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      assert.equal(url, 'https://codex2api.bitpowerhub.com/api/admin/oauth/generate-auth-url');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Admin-Key'], 'admin-secret');
      assert.deepEqual(JSON.parse(options.body), {
        proxy_url: 'http://127.0.0.1:7890',
        redirect_uri: 'http://localhost:1455/auth/callback',
      });
      return createJsonResponse({
        auth_url: 'https://auth.openai.com/oauth/authorize?state=state-1',
        session_id: 'session-1',
      });
    },
  });

  assert.equal(result.oauthUrl, 'https://auth.openai.com/oauth/authorize?state=state-1');
  assert.equal(result.sessionId, 'session-1');
  assert.equal(calls.length, 1);
});

test('parseOAuthCallbackUrl extracts code and state from a localhost callback', () => {
  assert.deepEqual(
    parseOAuthCallbackUrl('http://localhost:1455/auth/callback?code=code-1&state=state-1'),
    { code: 'code-1', state: 'state-1' },
  );
  assert.deepEqual(
    parseOAuthCallbackUrl('code=code-2&state=state-2'),
    { code: 'code-2', state: 'state-2' },
  );
});

test('exchangeCodex2ApiOAuthCallback submits the callback code and state', async () => {
  const result = await exchangeCodex2ApiOAuthCallback({
    baseUrl: 'https://codex2api.bitpowerhub.com',
    adminKey: 'admin-secret',
    accountName: 'fresh-account',
    proxyUrl: 'http://127.0.0.1:7890',
  }, {
    sessionId: 'session-1',
    callbackUrl: 'http://localhost:1455/auth/callback?code=code-1&state=state-1',
    fetchImpl: async (url, options = {}) => {
      assert.equal(url, 'https://codex2api.bitpowerhub.com/api/admin/oauth/exchange-code');
      assert.equal(options.method, 'POST');
      assert.equal(options.headers['X-Admin-Key'], 'admin-secret');
      assert.deepEqual(JSON.parse(options.body), {
        session_id: 'session-1',
        code: 'code-1',
        state: 'state-1',
        name: 'fresh-account',
        proxy_url: 'http://127.0.0.1:7890',
      });
      return createJsonResponse({
        id: 12,
        email: 'fresh@example.com',
        message: 'ok',
      });
    },
  });

  assert.equal(result.id, 12);
  assert.equal(result.email, 'fresh@example.com');
});

test('exchangeCodex2ApiOAuthCallback rejects callbacks without code and state', async () => {
  await assert.rejects(
    () => exchangeCodex2ApiOAuthCallback({
      baseUrl: 'https://codex2api.bitpowerhub.com',
      adminKey: 'admin-secret',
    }, {
      sessionId: 'session-1',
      callbackUrl: 'http://localhost:1455/auth/callback?error=access_denied',
      fetchImpl: async () => createJsonResponse({}),
    }),
    /callback URL must include code and state/i,
  );
});
