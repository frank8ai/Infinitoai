(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.Codex2ApiOAuth = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const DEFAULT_REDIRECT_URI = 'http://localhost:1455/auth/callback';

  function normalizeCodex2ApiOAuthConfig(value = {}) {
    return {
      baseUrl: String(value.baseUrl || value.base_url || '').trim().replace(/\/+$/, ''),
      adminKey: String(value.adminKey || value.admin_key || '').trim(),
      proxyUrl: String(value.proxyUrl || value.proxy_url || '').trim(),
      accountName: String(value.accountName || value.name || '').trim(),
    };
  }

  function assertCodex2ApiOAuthConfig(config) {
    if (!config.baseUrl || !/^https?:\/\//i.test(config.baseUrl)) {
      throw new Error('Codex2API address is missing or invalid.');
    }
    if (!config.adminKey) {
      throw new Error('Codex2API Admin Key is missing.');
    }
  }

  function getFetch(fetchImpl) {
    const resolved = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!resolved) {
      throw new Error('Fetch implementation is not available.');
    }
    return resolved;
  }

  async function parseJsonResponse(response, label) {
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!response.ok) {
      const detail = typeof json?.error === 'string'
        ? json.error
        : typeof json?.message === 'string'
          ? json.message
          : text.slice(0, 160);
      throw new Error(`${label} failed (${response.status})${detail ? `: ${detail}` : ''}`);
    }
    if (!json || typeof json !== 'object') {
      throw new Error(`${label} returned an invalid JSON payload.`);
    }
    return json;
  }

  function buildHeaders(config) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-Admin-Key': config.adminKey,
    };
  }

  async function generateCodex2ApiOAuthUrl(configValue = {}, options = {}) {
    const config = normalizeCodex2ApiOAuthConfig(configValue);
    assertCodex2ApiOAuthConfig(config);
    const doFetch = getFetch(options.fetchImpl);
    const response = await doFetch(`${config.baseUrl}/api/admin/oauth/generate-auth-url`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        proxy_url: config.proxyUrl,
        redirect_uri: options.redirectUri || DEFAULT_REDIRECT_URI,
      }),
    });
    const json = await parseJsonResponse(response, 'Codex2API OAuth URL request');
    const oauthUrl = String(json.auth_url || '').trim();
    const sessionId = String(json.session_id || '').trim();
    if (!oauthUrl || !sessionId) {
      throw new Error('Codex2API OAuth URL request did not return auth_url and session_id.');
    }
    return { oauthUrl, sessionId };
  }

  function parseOAuthCallbackUrl(value) {
    const raw = String(value || '').trim();
    if (!raw) {
      return { code: '', state: '' };
    }
    try {
      const parsed = new URL(raw);
      return {
        code: parsed.searchParams.get('code') || '',
        state: parsed.searchParams.get('state') || '',
      };
    } catch {
      const query = raw.includes('?') ? raw.split('?').slice(1).join('?') : raw;
      const params = new URLSearchParams(query);
      return {
        code: params.get('code') || '',
        state: params.get('state') || '',
      };
    }
  }

  async function exchangeCodex2ApiOAuthCallback(configValue = {}, options = {}) {
    const config = normalizeCodex2ApiOAuthConfig(configValue);
    assertCodex2ApiOAuthConfig(config);
    const sessionId = String(options.sessionId || options.session_id || '').trim();
    if (!sessionId) {
      throw new Error('Codex2API OAuth session is missing. Generate a new authorization URL first.');
    }
    const { code, state } = parseOAuthCallbackUrl(options.callbackUrl || options.callback_url || '');
    if (!code || !state) {
      throw new Error('Codex2API OAuth callback URL must include code and state.');
    }
    const doFetch = getFetch(options.fetchImpl);
    const response = await doFetch(`${config.baseUrl}/api/admin/oauth/exchange-code`, {
      method: 'POST',
      headers: buildHeaders(config),
      body: JSON.stringify({
        session_id: sessionId,
        code,
        state,
        name: config.accountName,
        proxy_url: config.proxyUrl,
      }),
    });
    return await parseJsonResponse(response, 'Codex2API OAuth exchange');
  }

  return {
    exchangeCodex2ApiOAuthCallback,
    generateCodex2ApiOAuthUrl,
    normalizeCodex2ApiOAuthConfig,
    parseOAuthCallbackUrl,
  };
});
