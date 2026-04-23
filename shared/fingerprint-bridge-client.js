(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.FingerprintBridgeClient = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const DEFAULT_FINGERPRINT_BRIDGE_BASE_URL = 'http://127.0.0.1:50001';

  function normalizeFingerprintBridgeBaseUrl(value) {
    return String(value || '').trim().replace(/\/+$/, '') || DEFAULT_FINGERPRINT_BRIDGE_BASE_URL;
  }

  function getFetch(fetchImpl) {
    const resolved = fetchImpl || (typeof fetch === 'function' ? fetch.bind(globalThis) : null);
    if (!resolved) {
      throw new Error('Fetch implementation is not available.');
    }
    return resolved;
  }

  async function runWithTimeout(taskFactory, timeoutMs, label) {
    if (!(timeoutMs > 0)) {
      return await taskFactory();
    }

    let timer = null;
    try {
      return await Promise.race([
        taskFactory(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms.`)), timeoutMs);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
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

  async function bridgeRequest(path, options = {}) {
    const doFetch = getFetch(options.fetchImpl);
    const baseUrl = normalizeFingerprintBridgeBaseUrl(options.baseUrl);
    const label = options.label || `Fingerprint bridge request ${path}`;
    const headers = {
      Accept: 'application/json',
      ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {}),
    };

    const response = await runWithTimeout(
      () => doFetch(`${baseUrl}${path}`, {
        method: options.method || (options.body !== undefined ? 'POST' : 'GET'),
        headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      }),
      options.timeoutMs || 30000,
      label,
    );

    return await parseJsonResponse(response, label);
  }

  function buildFingerprintRunConfig(state = {}, options = {}) {
    return {
      signupEntry: state.signupEntry === 'chatgpt' ? 'chatgpt' : 'platform',
      browserBackend: state.browserBackend === 'fingerprint' ? 'fingerprint' : 'extension',
      fingerprintProvider: state.fingerprintProvider === 'roxy' ? 'roxy' : 'roxy',
      roxy: {
        apiBaseUrl: String(state.roxyApiBaseUrl || '').trim(),
        apiToken: String(state.roxyApiToken || '').trim(),
        workspaceId: String(state.roxyWorkspaceId || '').trim(),
      },
      email: String(state.email || '').trim(),
      password: String(state.customPassword || state.password || '').trim(),
      oauthUrl: String(state.oauthUrl || '').trim(),
      localhostUrl: String(state.localhostUrl || '').trim(),
      currentStep: Number.parseInt(String(options.currentStep || state.currentStep || 0), 10) || 0,
      entryUrl: options.entryUrl || '',
      code: String(options.code || '').trim(),
      callbackUrl: String(options.callbackUrl || state.localhostUrl || '').trim(),
      timeoutMs: Number.parseInt(String(options.timeoutMs || 0), 10) || 0,
    };
  }

  function validateFingerprintBridgeHealth(health, config = {}) {
    if (!health || typeof health !== 'object') {
      throw new Error('Fingerprint bridge health check returned an invalid response.');
    }

    if (health.ok === false || (health.bridge?.status && health.bridge.status !== 'ok')) {
      const detail = String(health.bridge?.message || health.error || '').trim();
      throw new Error(`Fingerprint bridge is not ready${detail ? `: ${detail}` : '.'}`);
    }

    const roxy = health.roxy || {};
    const roxyConfig = config.roxy || {};
    const roxyApiBaseUrl = normalizeFingerprintBridgeBaseUrl(roxyConfig.apiBaseUrl || DEFAULT_FINGERPRINT_BRIDGE_BASE_URL)
      .replace(/:50001$/, ':50000');
    const workspaceId = String(roxyConfig.workspaceId || '').trim();

    if (!workspaceId) {
      throw new Error('Fingerprint browser is not ready: Roxy workspace id is missing. Fill Workspace in the Fingerprint settings, then retry.');
    }

    if (roxy.reachable === false) {
      const detail = String(roxy.message || '').trim();
      throw new Error(`Fingerprint browser is not ready: Roxy API is unreachable at ${roxyApiBaseUrl}${detail ? ` (${detail})` : ''}. Start RoxyBrowser local API, then retry.`);
    }

    return true;
  }

  async function getFingerprintBridgeHealth(options = {}) {
    const params = new URLSearchParams();
    if (options.roxyApiBaseUrl) {
      params.set('roxyApiBaseUrl', String(options.roxyApiBaseUrl).trim().replace(/\/+$/, ''));
    }

    return await bridgeRequest(`/health${params.size ? `?${params.toString()}` : ''}`, {
      ...options,
      method: 'GET',
      label: 'Fingerprint bridge health check',
    });
  }

  async function createFingerprintRun(config, options = {}) {
    return await bridgeRequest('/runs', {
      ...options,
      method: 'POST',
      body: config,
      label: 'Fingerprint bridge create run',
    });
  }

  async function executeFingerprintStep(runId, step, payload = {}, options = {}) {
    return await bridgeRequest(`/runs/${encodeURIComponent(runId)}/steps/${encodeURIComponent(step)}`, {
      ...options,
      method: 'POST',
      body: payload,
      label: `Fingerprint bridge step ${step}`,
    });
  }

  async function getFingerprintRunEvents(runId, after = 0, options = {}) {
    return await bridgeRequest(`/runs/${encodeURIComponent(runId)}/events?after=${encodeURIComponent(after)}`, {
      ...options,
      method: 'GET',
      label: 'Fingerprint bridge events',
    });
  }

  async function stopFingerprintRun(runId, options = {}) {
    return await bridgeRequest(`/runs/${encodeURIComponent(runId)}/stop`, {
      ...options,
      method: 'POST',
      body: {},
      label: 'Fingerprint bridge stop run',
    });
  }

  async function deleteFingerprintRun(runId, options = {}) {
    return await bridgeRequest(`/runs/${encodeURIComponent(runId)}`, {
      ...options,
      method: 'DELETE',
      label: 'Fingerprint bridge delete run',
    });
  }

  return {
    DEFAULT_FINGERPRINT_BRIDGE_BASE_URL,
    buildFingerprintRunConfig,
    createFingerprintRun,
    deleteFingerprintRun,
    executeFingerprintStep,
    getFingerprintBridgeHealth,
    getFingerprintRunEvents,
    normalizeFingerprintBridgeBaseUrl,
    stopFingerprintRun,
    validateFingerprintBridgeHealth,
  };
});
