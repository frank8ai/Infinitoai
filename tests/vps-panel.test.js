const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function createContext() {
  const listeners = [];
  const state = {
    logs: [],
    waitForElementByTextCalls: 0,
    waitForElementCalls: 0,
    clicked: 0,
    completed: [],
    reloadCalls: 0,
  };

  const header = {
    querySelector(selector) {
      if (/button/.test(selector)) {
        return {
          disabled: false,
          getBoundingClientRect() {
            return { width: 100, height: 30 };
          },
        };
      }
      return null;
    },
  };

  const authUrlEl = {
    textContent: 'https://auth.openai.com/example',
  };

  const context = {
    console: {
      log() {},
      warn() {},
      error() {},
    },
    location: {
      href: 'https://example.com/management.html#/',
      reload() {
        state.reloadCalls += 1;
      },
    },
    chrome: {
      runtime: {
        onMessage: {
          addListener(listener) {
            listeners.push(listener);
          },
        },
        sendMessage() {
          return Promise.resolve({ ok: true });
        },
      },
    },
    document: {
      querySelector() {
        return null;
      },
    },
    resetStopState() {},
    isStopError() {
      return false;
    },
    reportError() {},
    throwIfStopped() {},
    log(message, level = 'info') {
      state.logs.push({ message, level });
    },
    reportComplete(step, payload) {
      state.completed.push({ step, payload });
    },
    sleep() {
      return Promise.resolve();
    },
    humanPause() {
      return Promise.resolve();
    },
    simulateClick() {
      state.clicked += 1;
    },
    fillInput() {},
    waitForElementByText(selector, pattern) {
      state.waitForElementByTextCalls += 1;
      if (selector === '.card-header' && pattern && pattern.test('Codex')) {
        if (state.waitForElementByTextCalls === 1) {
          return Promise.reject(new Error('not ready'));
        }
        return Promise.resolve(header);
      }
      return Promise.reject(new Error('unexpected selector'));
    },
    waitForElement(selector) {
      state.waitForElementCalls += 1;
      if (selector === '[class*="authUrlValue"]') {
        return Promise.resolve(authUrlEl);
      }
      return Promise.reject(new Error('unexpected selector'));
    },
    setTimeout,
    clearTimeout,
  };

  context.window = context;
  context.top = context;
  context.__state = state;
  context.__listeners = listeners;
  return context;
}

function loadVpsPanel(context) {
  context.FlowRecovery = require('../shared/flow-recovery.js');
  const scriptPath = path.join(__dirname, '..', 'content', 'vps-panel.js');
  const code = fs.readFileSync(scriptPath, 'utf8');
  vm.createContext(context);
  vm.runInContext(code, context, { filename: scriptPath });
}

test('step 1 refreshes and retries when the Codex OAuth card does not appear on the first wait', async () => {
  const context = createContext();
  loadVpsPanel(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener({ type: 'EXECUTE_STEP', step: 1, payload: {} }, {}, (result) => {
      resolve(result);
    });
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(response?.ok, true);
  assert.equal(context.__state.reloadCalls, 1);
  assert.equal(context.__state.clicked, 1);
  assert.equal(context.__state.completed.length, 1);
  assert.equal(context.__state.completed[0].step, 1);
  assert.match(
    context.__state.logs.map((entry) => entry.message).join('\n'),
    /准备刷新 VPS 页面后重试/
  );
});

test('step 1 fails fast when the VPS page shows a 502 bad gateway error', async () => {
  const context = createContext();
  context.document.querySelector = (selector) => {
    if (selector === 'body') {
      return { textContent: '502 Bad Gateway' };
    }
    return null;
  };
  context.waitForElementByText = () => Promise.reject(new Error('not ready'));
  loadVpsPanel(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener({ type: 'EXECUTE_STEP', step: 1, payload: {} }, {}, (result) => {
      resolve(result);
    });
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.match(response?.error || '', /502/i);
  assert.equal(context.__state.reloadCalls, 0);
});

test('step 1 opens the configured VPS oauth page instead of reloading when a 502 page is visible', async () => {
  const context = createContext();
  context.document.querySelector = (selector) => {
    if (selector === 'body') {
      return { textContent: '502 Bad Gateway' };
    }
    return null;
  };
  context.chrome.runtime.sendMessage = (message) => {
    if (message?.type === 'GET_RUNTIME_STATE') {
      return Promise.resolve({ vpsUrl: 'https://panel.example.com/management.html#/oauth' });
    }
    return Promise.resolve({ ok: true });
  };
  loadVpsPanel(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener({ type: 'EXECUTE_STEP', step: 1, payload: {} }, {}, (result) => {
      resolve(result);
    });
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.match(response?.error || '', /502/i);
  assert.equal(context.location.href, 'https://panel.example.com/management.html#/oauth');
  assert.equal(context.__state.reloadCalls, 0);
});

test('step 1 logs into the VPS management page with the CPA password before loading the oauth card', async () => {
  const context = createContext();
  const state = context.__state;
  state.stage = 'login';
  state.filledManagementKey = '';
  const managementKeyInput = {
    value: '',
    form: null,
    dispatchEvent() {},
    getBoundingClientRect() {
      return { width: 220, height: 40 };
    },
  };
  const loginButton = {
    textContent: 'Login',
    getBoundingClientRect() {
      return { width: 120, height: 32 };
    },
  };
  const header = {
    querySelector(selector) {
      if (/button/.test(selector)) {
        return {
          disabled: false,
          getBoundingClientRect() {
            return { width: 100, height: 30 };
          },
        };
      }
      return null;
    },
  };
  const authUrlEl = {
    textContent: 'https://auth.openai.com/example',
  };

  context.location.href = 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/login';
  context.chrome.runtime.sendMessage = (message) => {
    if (message?.type === 'GET_RUNTIME_STATE') {
      return Promise.resolve({
        vpsUrl: 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/oauth',
        vpsCpaPassword: 'test-cpa-key',
      });
    }
    return Promise.resolve({ ok: true });
  };
  context.document.querySelector = (selector) => {
    if (selector === 'body') {
      return { textContent: state.stage === 'login' ? 'Enter the management key' : 'Codex OAuth' };
    }
    if (selector === '#_r_1_' && state.stage === 'login') {
      return managementKeyInput;
    }
    if (selector === 'button[type="submit"]' && state.stage === 'login') {
      return loginButton;
    }
    return null;
  };
  context.document.querySelectorAll = (selector) => {
    if (
      selector === 'button, [role="button"], input[type="submit"], input[type="button"]'
      && state.stage === 'login'
    ) {
      return [loginButton];
    }
    return [];
  };
  context.fillInput = (input, value) => {
    input.value = value;
    state.filledManagementKey = value;
  };
  context.simulateClick = (target) => {
    state.clicked += 1;
    if (target === loginButton) {
      state.stage = 'oauth';
      context.location.href = 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/oauth';
    }
  };
  context.waitForElementByText = (selector, pattern) => {
    if (/login|sign in|submit|continue|登录/i.test(String(pattern)) && state.stage === 'login') {
      return Promise.resolve(loginButton);
    }
    if (selector === '.card-header' && pattern && pattern.test('Codex') && state.stage === 'oauth') {
      return Promise.resolve(header);
    }
    return Promise.reject(new Error('unexpected selector'));
  };
  context.waitForElement = (selector) => {
    if (selector === '[class*="authUrlValue"]' && state.stage === 'oauth') {
      return Promise.resolve(authUrlEl);
    }
    if ((selector === '#_r_1_' || selector === 'input[placeholder*="management key"]') && state.stage === 'login') {
      return Promise.resolve(managementKeyInput);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };

  loadVpsPanel(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener({ type: 'EXECUTE_STEP', step: 1, payload: {} }, {}, (result) => {
      resolve(result);
    });
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(response?.ok, true);
  assert.equal(state.filledManagementKey, 'test-cpa-key');
  assert.equal(context.location.href, 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/oauth');
  assert.equal(state.completed.length, 1);
});

test('step 1 also accepts the Chinese VPS login button text when the management page uses localized copy', async () => {
  const context = createContext();
  const state = context.__state;
  state.stage = 'login';
  state.filledManagementKey = '';
  const managementKeyInput = {
    value: '',
    form: null,
    dispatchEvent() {},
    getBoundingClientRect() {
      return { width: 220, height: 40 };
    },
  };
  const loginButton = {
    textContent: '登录',
    innerText: '登录',
    className: 'btn btn-primary btn-full',
    getBoundingClientRect() {
      return { width: 120, height: 32 };
    },
  };
  const header = {
    querySelector(selector) {
      if (/button/.test(selector)) {
        return {
          disabled: false,
          getBoundingClientRect() {
            return { width: 100, height: 30 };
          },
        };
      }
      return null;
    },
  };
  const authUrlEl = {
    textContent: 'https://auth.openai.com/example',
  };

  context.location.href = 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/login';
  context.chrome.runtime.sendMessage = (message) => {
    if (message?.type === 'GET_RUNTIME_STATE') {
      return Promise.resolve({
        vpsUrl: 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/oauth',
        vpsCpaPassword: 'test-cpa-key',
      });
    }
    return Promise.resolve({ ok: true });
  };
  context.document.querySelector = (selector) => {
    if (selector === 'body') {
      return { textContent: state.stage === 'login' ? '请输入管理密钥' : 'Codex OAuth' };
    }
    if (selector === '#_r_1_' && state.stage === 'login') {
      return managementKeyInput;
    }
    return null;
  };
  context.document.querySelectorAll = (selector) => {
    if (
      selector === 'button, [role="button"], input[type="submit"], input[type="button"]'
      && state.stage === 'login'
    ) {
      return [loginButton];
    }
    return [];
  };
  context.fillInput = (input, value) => {
    input.value = value;
    state.filledManagementKey = value;
  };
  context.simulateClick = (target) => {
    state.clicked += 1;
    if (target === loginButton) {
      state.stage = 'oauth';
      context.location.href = 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/oauth';
    }
  };
  context.waitForElementByText = (selector, pattern) => {
    if (state.stage === 'login') {
      assert.match(String(pattern), /登录/i);
      assert.match(String(pattern), /login/i);
      return Promise.resolve(loginButton);
    }
    if (selector === '.card-header' && pattern && pattern.test('Codex') && state.stage === 'oauth') {
      return Promise.resolve(header);
    }
    return Promise.reject(new Error('unexpected selector'));
  };
  context.waitForElement = (selector) => {
    if (selector === '[class*="authUrlValue"]' && state.stage === 'oauth') {
      return Promise.resolve(authUrlEl);
    }
    if ((selector === '#_r_1_' || selector === 'input[placeholder*="management key"]') && state.stage === 'login') {
      return Promise.resolve(managementKeyInput);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };

  loadVpsPanel(context);

  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener({ type: 'EXECUTE_STEP', step: 1, payload: {} }, {}, (result) => {
      resolve(result);
    });
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(response?.ok, true);
  assert.equal(state.filledManagementKey, 'test-cpa-key');
  assert.equal(context.location.href, 'https://cli-proxy-api-latest-ew32.onrender.com/management.html#/oauth');
});

test('step 9 retries callback submission when the VPS panel reports a transient 502 after submit', async () => {
  const context = createContext();
  const state = context.__state;
  const urlInput = {
    value: '',
    getBoundingClientRect() {
      return { width: 300, height: 30 };
    },
  };
  const submitButton = {
    textContent: '提交回调 URL',
    getBoundingClientRect() {
      return { width: 120, height: 30 };
    },
  };
  const successBadge = { textContent: '认证成功！' };

  context.fillInput = (input, value) => {
    input.value = value;
    state.lastFilledUrl = value;
  };
  context.waitForElement = (selector) => {
    if (selector === '[class*="callbackSection"] input.input') {
      return Promise.resolve(urlInput);
    }
    if (selector === 'input[placeholder*="localhost"]') {
      return Promise.resolve(urlInput);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.waitForElementByText = (selector, pattern) => {
    if (selector.includes('callbackActions') || selector === 'button.btn') {
      return Promise.resolve(submitButton);
    }
    if (selector === '.status-badge, [class*="status"]' && /认证成功/.test(String(pattern))) {
      if (state.clicked < 2) {
        return Promise.reject(new Error('still processing'));
      }
      return Promise.resolve(successBadge);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.document.querySelector = (selector) => {
    if (selector === '.status-badge, [class*="status"]') {
      if (state.clicked === 1) {
        return { textContent: '502 Bad Gateway' };
      }
      if (state.clicked >= 2) {
        return successBadge;
      }
      return null;
    }
    if (selector === 'body') {
      return { textContent: state.clicked === 1 ? '502 Bad Gateway' : 'callback ready' };
    }
    return null;
  };

  loadVpsPanel(context);
  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 9, payload: { localhostUrl: 'http://localhost:1455/auth/callback?code=test' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(response?.ok, true);
  assert.equal(state.clicked, 2);
  assert.equal(state.lastFilledUrl, 'http://localhost:1455/auth/callback?code=test');
  assert.equal(state.completed.length, 1);
  assert.equal(state.completed[0].step, 9);
  assert.match(
    state.logs.map((entry) => entry.message).join('\n'),
    /502[\s\S]*重试/
  );
});

test('step 9 fails with a step-6 retry hint after repeated 502 callback submission errors', async () => {
  const context = createContext();
  const state = context.__state;
  const urlInput = {
    value: '',
    getBoundingClientRect() {
      return { width: 300, height: 30 };
    },
  };
  const submitButton = {
    textContent: '提交回调 URL',
    getBoundingClientRect() {
      return { width: 120, height: 30 };
    },
  };

  context.fillInput = (input, value) => {
    input.value = value;
    state.lastFilledUrl = value;
  };
  context.waitForElement = (selector) => {
    if (selector === '[class*="callbackSection"] input.input') {
      return Promise.resolve(urlInput);
    }
    if (selector === 'input[placeholder*="localhost"]') {
      return Promise.resolve(urlInput);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.waitForElementByText = (selector) => {
    if (selector.includes('callbackActions') || selector === 'button.btn') {
      return Promise.resolve(submitButton);
    }
    if (selector === '.status-badge, [class*="status"]') {
      return Promise.reject(new Error('still processing'));
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.document.querySelector = (selector) => {
    if (selector === '.status-badge, [class*="status"]') {
      return { textContent: '502 Bad Gateway' };
    }
    if (selector === 'body') {
      return { textContent: '502 Bad Gateway' };
    }
    return null;
  };

  loadVpsPanel(context);
  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 9, payload: { localhostUrl: 'http://localhost:1455/auth/callback?code=test' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.match(response?.error || '', /step 6|502/i);
  assert.equal(state.clicked, 4);
  assert.equal(state.completed.length, 0);
});

test('step 9 asks background to refresh OAuth when the VPS status says the authorization link is not pending', async () => {
  const context = createContext();
  const state = context.__state;
  const urlInput = {
    value: '',
    getBoundingClientRect() {
      return { width: 300, height: 30 };
    },
  };
  const submitButton = {
    textContent: '提交回调 URL',
    getBoundingClientRect() {
      return { width: 120, height: 30 };
    },
  };

  context.fillInput = (input, value) => {
    input.value = value;
    state.lastFilledUrl = value;
  };
  context.waitForElement = (selector) => {
    if (selector === '[class*="callbackSection"] input.input') {
      return Promise.resolve(urlInput);
    }
    if (selector === 'input[placeholder*="localhost"]') {
      return Promise.resolve(urlInput);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.waitForElementByText = (selector) => {
    if (selector.includes('callbackActions') || selector === 'button.btn') {
      return Promise.resolve(submitButton);
    }
    if (selector === '.status-badge, [class*="status"]') {
      return Promise.reject(new Error('still processing'));
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.document.querySelector = (selector) => {
    if (selector === '.status-badge, [class*="status"]') {
      return { textContent: 'This authorization link is not pending anymore.' };
    }
    if (selector === 'body') {
      return { textContent: 'This authorization link is not pending anymore.' };
    }
    return null;
  };

  loadVpsPanel(context);
  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 9, payload: { localhostUrl: 'http://localhost:1455/auth/callback?code=test' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(response?.ok, true);
  assert.equal(response?.retryWithFreshOauth, true);
  assert.equal(response?.reason, 'auth_link_not_pending');
  assert.equal(state.clicked, 1);
  assert.equal(state.completed.length, 0);
});

test('step 9 recognizes the English "Submit Callback URL" button text', async () => {
  const context = createContext();
  const state = context.__state;
  const urlInput = {
    value: '',
    getBoundingClientRect() {
      return { width: 300, height: 30 };
    },
  };
  const submitButton = {
    textContent: 'Submit Callback URL',
    getBoundingClientRect() {
      return { width: 160, height: 30 };
    },
  };
  const successBadge = { textContent: '认证成功！' };

  context.fillInput = (input, value) => {
    input.value = value;
    state.lastFilledUrl = value;
  };
  context.waitForElement = (selector) => {
    if (selector === '[class*="callbackSection"] input.input') {
      return Promise.resolve(urlInput);
    }
    if (selector === 'input[placeholder*="localhost"]') {
      return Promise.resolve(urlInput);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.waitForElementByText = (selector, pattern) => {
    if ((selector.includes('callbackActions') || selector === 'button.btn') && pattern.test('Submit Callback URL')) {
      return Promise.resolve(submitButton);
    }
    if (selector === '.status-badge, [class*="status"]' && /认证成功/.test(String(pattern))) {
      return Promise.resolve(successBadge);
    }
    return Promise.reject(new Error(`unexpected selector: ${selector}`));
  };
  context.document.querySelector = (selector) => {
    if (selector === '.status-badge, [class*="status"]') {
      return successBadge;
    }
    if (selector === 'body') {
      return { textContent: 'callback ready' };
    }
    return null;
  };

  loadVpsPanel(context);
  const listener = context.__listeners[0];
  assert.ok(listener, 'expected vps-panel to register a runtime listener');

  const response = await new Promise((resolve, reject) => {
    const keepAlive = listener(
      { type: 'EXECUTE_STEP', step: 9, payload: { localhostUrl: 'http://localhost:1455/auth/callback?code=english' } },
      {},
      (result) => resolve(result)
    );
    assert.equal(keepAlive, true);
    setTimeout(() => reject(new Error('timeout waiting for response')), 2000);
  });

  assert.equal(response?.ok, true);
  assert.equal(state.lastFilledUrl, 'http://localhost:1455/auth/callback?code=english');
  assert.equal(state.clicked, 1);
  assert.equal(state.completed.length, 1);
  assert.equal(state.completed[0].step, 9);
});
