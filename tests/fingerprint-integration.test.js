const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readProjectFile(relativePath) {
  return fs.readFileSync(path.join(__dirname, '..', relativePath), 'utf8');
}

test('manifest injects the auth bundle on chatgpt.com as well as the existing OpenAI auth domains', () => {
  const manifest = JSON.parse(readProjectFile('manifest.json'));
  assert.ok(manifest.host_permissions.includes('https://chatgpt.com/*'));
  assert.ok(manifest.host_permissions.includes('http://127.0.0.1/*'));
  assert.ok(manifest.host_permissions.includes('http://localhost/*'));

  const authBundleEntry = manifest.content_scripts.find((entry) =>
    Array.isArray(entry.matches) && entry.matches.includes('https://chatgpt.com/*')
  );
  assert.ok(authBundleEntry, 'expected chatgpt.com auth content-script entry');
  assert.ok(authBundleEntry.js.includes('content/signup-page.js'));
  assert.ok(authBundleEntry.js.includes('content/openai-auth-step3-flow.js'));
});

test('side panel exposes signup-entry and fingerprint backend controls', () => {
  const html = readProjectFile(path.join('sidepanel', 'sidepanel.html'));
  assert.match(html, /id="select-signup-entry"/);
  assert.match(html, /id="select-browser-backend"/);
  assert.match(html, /id="select-fingerprint-provider"/);
  assert.match(html, /id="input-roxy-api-base-url"/);
  assert.match(html, /id="input-roxy-api-token"/);
  assert.match(html, /id="input-roxy-workspace-id"/);
});

test('background keeps fingerprint settings in persistent state and routes chatgpt entry through helpers', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(backgroundSource, /CHATGPT_SIGNUP_ENTRY_URL/);
  assert.match(backgroundSource, /function getCurrentSignupEntry\(state\)/);
  assert.match(backgroundSource, /function getCurrentBrowserBackend\(state\)/);
  assert.match(backgroundSource, /function getSignupEntryUrl\(state\)/);
  assert.match(backgroundSource, /function getFingerprintRunConfigFromState\(state = \{\}, options = \{\}\)/);
  assert.match(backgroundSource, /fingerprintRunId/);
  assert.match(backgroundSource, /roxyApiBaseUrl/);
  assert.match(backgroundSource, /roxyApiToken/);
  assert.match(backgroundSource, /roxyWorkspaceId/);
});

test('background includes fingerprint bridge lifecycle helpers and step dispatch branches', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(backgroundSource, /async function ensureFingerprintBridgeRun\(state,\s*options = \{\}\)/);
  assert.match(backgroundSource, /async function executeFingerprintBridgeStepWithState\(step,\s*state,\s*payload = \{\},\s*options = \{\}\)/);
  assert.match(backgroundSource, /async function completeFingerprintBridgeStep\(step,\s*state,\s*payload = \{\},\s*options = \{\}\)/);
  assert.match(backgroundSource, /async function stopFingerprintBridgeRunIfNeeded\(state = null\)/);
  assert.match(backgroundSource, /async function deleteFingerprintBridgeRunIfNeeded\(state = null\)/);
  assert.match(backgroundSource, /if \(isFingerprintBrowserBackend\(state\)\) \{[\s\S]*completeFingerprintBridgeStep\(2,\s*state/i);
  assert.match(backgroundSource, /const preparedState = await prepareStep3Credentials\(state\);[\s\S]*if \(isFingerprintBrowserBackend\(preparedState\)\) \{[\s\S]*completeFingerprintBridgeStep\(3,\s*preparedState/i);
  assert.match(backgroundSource, /if \(isFingerprintBrowserBackend\(state\)\) \{[\s\S]*executeVerificationMailStep\(4,\s*state/i);
  assert.match(backgroundSource, /if \(isFingerprintBrowserBackend\(state\)\) \{[\s\S]*completeFingerprintBridgeStep\(5,\s*state/i);
  assert.match(backgroundSource, /if \(isFingerprintBrowserBackend\(state\)\) \{[\s\S]*completeFingerprintBridgeStep\(6,\s*state/i);
  assert.match(backgroundSource, /if \(isFingerprintBrowserBackend\(state\)\) \{[\s\S]*executeVerificationMailStep\(7,\s*state/i);
  assert.match(backgroundSource, /if \(isFingerprintBrowserBackend\(state\)\) \{[\s\S]*completeFingerprintBridgeStep\(8,\s*state/i);
});

test('fingerprint step 3 prepares generated mailbox sources before calling the bridge', () => {
  const backgroundSource = readProjectFile('background.js');

  assert.match(backgroundSource, /async function prepareStep3Credentials\(state\)/);
  assert.match(
    backgroundSource,
    /const preparedState = await prepareStep3Credentials\(state\);[\s\S]*if \(isFingerprintBrowserBackend\(preparedState\)\) \{[\s\S]*completeFingerprintBridgeStep\(3,\s*preparedState,\s*\{[\s\S]*email:\s*preparedState\.email[\s\S]*password:\s*preparedState\.password/i
  );
});

test('signup page accepts chatgpt auth entry as a valid registration entry point', () => {
  const signupSource = readProjectFile(path.join('content', 'signup-page.js'));
  assert.match(signupSource, /CHATGPT_LOGIN_ENTRY_URL/);
  assert.match(signupSource, /function isChatgptLoginEntryPage/);
  assert.match(signupSource, /function findVisibleChatgptSignupButton/);
  assert.match(signupSource, /async function dismissChatgptCookieBannerIfNeeded/);
  assert.match(signupSource, /signupEntry === 'chatgpt'/);
  assert.match(signupSource, /function isDirectChatgptLoginStep3Entry/);
  assert.match(signupSource, /log-in-or-create-account/);
});

test('fingerprint bridge client and local bridge service exist with roxy adapter and step runner', () => {
  const bridgeClient = readProjectFile(path.join('shared', 'fingerprint-bridge-client.js'));
  const bridgeService = readProjectFile(path.join('bridge', 'fingerprint_bridge.py'));
  const roxyAdapter = readProjectFile(path.join('bridge', 'roxy_adapter.py'));
  const stepRunner = readProjectFile(path.join('bridge', 'roxy_step_runner.js'));

  assert.match(bridgeClient, /DEFAULT_FINGERPRINT_BRIDGE_BASE_URL/);
  assert.match(bridgeClient, /async function createFingerprintRun/);
  assert.match(bridgeClient, /async function executeFingerprintStep/);
  assert.match(bridgeClient, /async function stopFingerprintRun/);

  assert.match(bridgeService, /class FingerprintBridgeHandler/);
  assert.match(bridgeService, /def do_GET/);
  assert.match(bridgeService, /def do_POST/);
  assert.match(bridgeService, /def do_DELETE/);
  assert.match(bridgeService, /\/runs/);
  assert.match(bridgeService, /\/health/);

  assert.match(roxyAdapter, /class RoxyAdapter/);
  assert.match(roxyAdapter, /def create_profile/);
  assert.match(roxyAdapter, /def open_profile/);
  assert.match(roxyAdapter, /def close_profile/);
  assert.match(roxyAdapter, /def delete_profile/);

  assert.match(stepRunner, /connectOverCDP/);
  assert.match(stepRunner, /runStep2/);
  assert.match(stepRunner, /runStep3/);
  assert.match(stepRunner, /runStep6/);
  assert.match(stepRunner, /runStep8/);
});

test('fingerprint step runner includes ChatGPT auth-error and auth-bridge recovery logic', () => {
  const stepRunner = readProjectFile(path.join('bridge', 'roxy_step_runner.js'));

  assert.match(stepRunner, /function isChatgptAuthErrorUrl/);
  assert.match(stepRunner, /function isChatgptLoginWithUrl/);
  assert.match(stepRunner, /async function isChatgptChallengePage/);
  assert.match(stepRunner, /async function clickSessionEndedLogin/);
  assert.match(stepRunner, /async function waitForChatgptStep2Ready/);
  assert.match(stepRunner, /const directAuthReadyUrlPattern = /);
  assert.match(stepRunner, /input\[name="new-password"\]/);
  assert.match(stepRunner, /button\[name="intent"\]\[value="email"\]/);
  assert.match(stepRunner, /log-in-or-create-account/);
  assert.match(stepRunner, /Cloudflare challenge/i);
  assert.match(stepRunner, /did not reach a usable signup\/login form/i);
});
