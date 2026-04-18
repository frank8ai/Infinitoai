const fs = require('node:fs');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadPayload(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function appendEvent(events, level, message, step) {
  events.push({
    level,
    message,
    step,
  });
}

async function getPlaywright() {
  try {
    return require('playwright');
  } catch (error) {
    throw new Error(`Fingerprint step runner requires Playwright: ${error.message}`);
  }
}

async function resolvePage(context) {
  const pages = context.pages();
  return pages[0] || await context.newPage();
}

async function dismissCookieBanner(page) {
  const selectors = [
    'button:has-text("Accept all")',
    'button:has-text("全部接受")',
    'button:has-text("拒绝非必需")',
    'button:has-text("Manage cookies")',
  ];
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 800 })) {
        await locator.click({ timeout: 2000 });
        await sleep(500);
        return true;
      }
    } catch {}
  }
  return false;
}

function isChatgptEntryUrl(url = '') {
  return /chatgpt\.com\/auth\/login/i.test(String(url || ''));
}

function isChatgptAuthErrorUrl(url = '') {
  return /chatgpt\.com\/api\/auth\/error/i.test(String(url || ''));
}

function isAuthUrl(url = '') {
  return /(?:auth|accounts)\.openai\.com\//i.test(String(url || ''));
}

function isLocalhostUrl(url = '') {
  return /^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?\/auth\/callback/i.test(String(url || ''));
}

async function hasVisibleCredentialInput(page) {
  for (const selector of [
    'input[name="email"]',
    'input[type="email"]',
    'input[name="username"]',
    'input[autocomplete="username"]',
    'input[type="password"]',
  ]) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout: 300 })) {
        return true;
      }
    } catch {}
  }
  return false;
}

async function pageText(page) {
  try {
    return await page.locator('body').innerText({ timeout: 1000 });
  } catch {
    return '';
  }
}

async function clickSessionEndedLogin(page, events) {
  const text = await pageText(page);
  if (!/session has ended|你的会话已结束|登录以继续|log in to continue|セッションが終了しました|ログインして続行/i.test(text)) {
    return false;
  }
  let clicked = await clickAnyVisible(page, [
    'a:has-text("登录")',
    'a:has-text("Log in")',
    'button:has-text("登录")',
    'button:has-text("Log in")',
    'a:has-text("继续")',
    'button:has-text("Continue")',
  ], 3000);
  if (!clicked) {
    try {
      const primaryAction = page.locator('a, button, [role="button"], [role="link"]').first();
      if (await primaryAction.isVisible({ timeout: 1000 })) {
        await primaryAction.click({ timeout: 2000 });
        clicked = true;
      }
    } catch {}
  }
  if (clicked) {
    appendEvent(events, 'warn', '指纹浏览器桥页落到了会话结束页，已点击主登录/继续按钮。', 2);
    await sleep(1000);
  }
  return clicked;
}

async function waitForVisible(page, selectors, timeout = 10000) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    for (const selector of list) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 250 })) {
          return locator;
        }
      } catch {}
    }
    await sleep(250);
  }

  throw new Error(`Timed out waiting for selectors: ${list.join(', ')}`);
}

async function clickAnyVisible(page, selectors, timeout = 5000) {
  const list = Array.isArray(selectors) ? selectors : [selectors];
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    for (const selector of list) {
      const locator = page.locator(selector).first();
      try {
        if (await locator.isVisible({ timeout: 250 })) {
          await locator.click({ timeout: 2000 });
          return true;
        }
      } catch {}
    }
    await sleep(250);
  }

  return false;
}

async function fillInput(locator, value) {
  await locator.fill('');
  await locator.fill(String(value || ''));
}

async function waitForUrlOrVisibleInput(page, options = {}) {
  const timeout = options.timeout || 15000;
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    const url = page.url();
    if (isAuthUrl(url) || isLocalhostUrl(url) || /platform\.openai\.com\/login/i.test(url)) {
      return url;
    }
    try {
      const emailInput = await waitForVisible(page, [
        'input[name="email"]',
        'input[type="email"]',
        'input[name="username"]',
      ], 500);
      if (emailInput) {
        return page.url();
      }
    } catch {}
    await sleep(250);
  }
  return page.url();
}

async function waitForChatgptStep2Ready(page, events, timeout = 20000) {
  const startedAt = Date.now();
  let retriedClick = false;
  let forcedAuthBridge = false;
  const authBridgeUrl = 'https://auth.openai.com/log-in-or-create-account';

  while (Date.now() - startedAt < timeout) {
    const url = page.url();

    if (isAuthUrl(url) || isLocalhostUrl(url) || /platform\.openai\.com\/login/i.test(url)) {
      if (await clickSessionEndedLogin(page, events)) {
        await sleep(500);
        continue;
      }
      if (await hasVisibleCredentialInput(page) || /create-account|u\/signup|u\/login\/identifier/i.test(url)) {
        return url;
      }
    }

    if (await hasVisibleCredentialInput(page)) {
      return url;
    }

    if (!retriedClick && Date.now() - startedAt >= 3000 && isChatgptEntryUrl(url)) {
      retriedClick = await clickAnyVisible(page, [
        '[data-testid="signup-button"]',
        'button:has-text("免费注册")',
        'button:has-text("Sign up")',
        'a:has-text("免费注册")',
        'a:has-text("Sign up")',
      ], 2000);
      if (retriedClick) {
        appendEvent(events, 'warn', '指纹浏览器 ChatGPT 注册入口仍未推进，已再次点击 Sign up。', 2);
        await sleep(1000);
        continue;
      }
    }

    if (!forcedAuthBridge && (isChatgptAuthErrorUrl(url) || /chrome-error:\/\//i.test(url))) {
      forcedAuthBridge = true;
      appendEvent(events, 'warn', `指纹浏览器注册入口落到了错误页，已改为直接打开 ${authBridgeUrl}。`, 2);
      await page.goto(authBridgeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(1000);
      continue;
    }

    if (!forcedAuthBridge && Date.now() - startedAt >= 6000 && isChatgptEntryUrl(url)) {
      forcedAuthBridge = true;
      appendEvent(events, 'warn', `指纹浏览器 ChatGPT 注册入口仍未推进，已改为直接打开 ${authBridgeUrl}。`, 2);
      await page.goto(authBridgeUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await sleep(1000);
      continue;
    }

    await sleep(250);
  }

  throw new Error(`Fingerprint step 2 did not reach a usable signup/login form. URL: ${page.url()}`);
}

async function runStep2(page, payload, events) {
  const entryUrl = String(
    payload.entryUrl
    || (payload.signupEntry === 'chatgpt'
      ? 'https://chatgpt.com/auth/login?callbackUrl=%2F&screen_hint=signup'
      : 'https://platform.openai.com/login')
  ).trim();
  await page.goto(entryUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  appendEvent(events, 'info', `指纹浏览器已打开注册入口：${payload.signupEntry === 'chatgpt' ? 'ChatGPT' : 'Platform'}`, 2);
  await sleep(1500);
  await dismissCookieBanner(page);

  if (payload.signupEntry === 'chatgpt' && isChatgptEntryUrl(page.url())) {
    await clickAnyVisible(page, [
      '[data-testid="signup-button"]',
      'button:has-text("免费注册")',
      'button:has-text("Sign up")',
      'a:has-text("免费注册")',
      'a:has-text("Sign up")',
    ], 10000);
  }

  const url = payload.signupEntry === 'chatgpt'
    ? await waitForChatgptStep2Ready(page, events, 20000)
    : await waitForUrlOrVisibleInput(page, { timeout: 20000 });
  appendEvent(events, 'ok', `指纹浏览器注册入口已就绪：${url}`, 2);
  return {
    status: 'completed',
    payload: {
      pageUrl: url,
    },
  };
}

async function runStep3(page, payload, events) {
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '').trim();
  if (!email || !password) {
    throw new Error('Fingerprint step 3 requires email and password.');
  }

  const emailInput = await waitForVisible(page, [
    'input[name="email"]',
    'input[type="email"]',
    'input[name="username"]',
    'input[autocomplete="username"]',
  ], 15000);
  await fillInput(emailInput, email);
  appendEvent(events, 'info', '指纹浏览器已填写注册邮箱。', 3);
  await clickAnyVisible(page, [
    'button[type="submit"]',
    'button[name="intent"][value="email"]',
  ], 5000);
  await sleep(1000);

  const passwordInput = await waitForVisible(page, [
    'input[type="password"]',
    'input[name="password"]',
  ], 15000);
  await fillInput(passwordInput, password);
  appendEvent(events, 'info', '指纹浏览器已填写注册密码。', 3);
  await clickAnyVisible(page, ['button[type="submit"]'], 5000);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    const url = page.url();
    if (/email-verification|about-you|welcome/i.test(url)) {
      appendEvent(events, 'ok', `指纹浏览器注册流程已推进到 ${url}`, 3);
      return {
        status: 'completed',
        payload: { pageUrl: url },
      };
    }
    await sleep(500);
  }

  throw new Error('Fingerprint step 3 did not advance past the credential form.');
}

async function fillVerificationCode(page, code, step, events) {
  const input = await waitForVisible(page, [
    'input[name="code"]',
    'input[name="otp"]',
    'input[inputmode="numeric"]',
    'input[maxlength="6"]',
  ], 20000);
  await fillInput(input, code);
  appendEvent(events, 'info', `指纹浏览器已填写第 ${step} 步验证码。`, step);
  await clickAnyVisible(page, ['button[type="submit"]'], 5000);
  await sleep(1000);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 15000) {
    const url = page.url();
    if (step === 4 && (/about-you|welcome/i.test(url) || isAuthUrl(url))) {
      appendEvent(events, 'ok', `指纹浏览器已提交第 ${step} 步验证码。`, step);
      return { status: 'completed', payload: { pageUrl: url } };
    }
    if (step === 7 && (/consent|workspace|organization|sign-in-with|add-phone/i.test(url) || isLocalhostUrl(url))) {
      appendEvent(events, 'ok', `指纹浏览器已提交第 ${step} 步验证码。`, step);
      return { status: 'completed', payload: { pageUrl: url, localhostUrl: isLocalhostUrl(url) ? url : '' } };
    }
    await sleep(500);
  }

  return { status: 'completed', payload: { pageUrl: page.url() } };
}

async function runStep5(page, _payload, events) {
  const nameInput = await waitForVisible(page, [
    'input[name="name"]',
    'input[name="full_name"]',
    'input[autocomplete="name"]',
    'input[placeholder*="name" i]',
  ], 20000);

  const names = ['Linda Taylor', 'Barbara Johnson', 'Amelia Wilson', 'Linda Brown'];
  const fullName = names[Math.floor(Math.random() * names.length)];
  await fillInput(nameInput, fullName);

  const ageInput = page.locator('input[name="age"]').first();
  try {
    if (await ageInput.isVisible({ timeout: 800 })) {
      await fillInput(ageInput, '24');
    }
  } catch {}

  await clickAnyVisible(page, ['button[type="submit"]'], 5000);
  appendEvent(events, 'ok', '指纹浏览器已完成资料页填写。', 5);
  return {
    status: 'completed',
    payload: {
      pageUrl: page.url(),
    },
  };
}

async function runStep6(page, payload, events) {
  const oauthUrl = String(payload.oauthUrl || '').trim();
  const email = String(payload.email || '').trim();
  const password = String(payload.password || '').trim();
  if (!oauthUrl) {
    throw new Error('Fingerprint step 6 requires oauthUrl.');
  }

  await page.goto(oauthUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await sleep(1500);
  await dismissCookieBanner(page);

  const emailInput = await waitForVisible(page, [
    'input[name="email"]',
    'input[type="email"]',
    'input[name="username"]',
  ], 20000);
  await fillInput(emailInput, email);
  appendEvent(events, 'info', '指纹浏览器已填写 OAuth 登录邮箱。', 6);
  await clickAnyVisible(page, ['button[type="submit"]', 'button[name="intent"][value="email"]'], 5000);
  await sleep(1000);

  const passwordInput = await waitForVisible(page, [
    'input[type="password"]',
    'input[name="password"]',
  ], 15000);
  await fillInput(passwordInput, password);
  appendEvent(events, 'info', '指纹浏览器已填写 OAuth 登录密码。', 6);
  await clickAnyVisible(page, ['button[type="submit"]'], 5000);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    const url = page.url();
    if (/email-verification|consent|workspace|organization|sign-in-with|add-phone/i.test(url) || isLocalhostUrl(url)) {
      appendEvent(events, 'ok', `指纹浏览器 OAuth 登录已推进到 ${url}`, 6);
      return {
        status: 'completed',
        payload: {
          pageUrl: url,
          localhostUrl: isLocalhostUrl(url) ? url : '',
        },
      };
    }
    await sleep(500);
  }

  throw new Error('Fingerprint step 6 did not advance past the OAuth password page.');
}

async function runStep8(page, _payload, events) {
  let localhostUrl = '';

  const requestListener = (request) => {
    if (!localhostUrl && isLocalhostUrl(request.url())) {
      localhostUrl = request.url();
    }
  };
  page.on('request', requestListener);

  const context = page.context();
  const routeHandler = async (route) => {
    const url = route.request().url();
    if (isLocalhostUrl(url)) {
      localhostUrl = url;
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body><h1>Auth Complete</h1></body></html>',
      });
      return;
    }
    await route.continue();
  };

  await context.route('http://localhost:1455/auth/callback*', routeHandler);

  if (/add-phone/i.test(page.url())) {
    throw new Error('Step 8 blocked: auth page still requires phone verification.');
  }

  await clickAnyVisible(page, [
    'button[type="submit"]',
    'button:has-text("Continue")',
    'button:has-text("继续")',
    'button:has-text("Authorize")',
    'button:has-text("同意")',
  ], 10000);

  const startedAt = Date.now();
  while (Date.now() - startedAt < 20000) {
    const url = page.url();
    if (isLocalhostUrl(url)) {
      localhostUrl = url;
      break;
    }
    if (localhostUrl) {
      break;
    }
    if (/add-phone/i.test(url)) {
      throw new Error('Step 8 blocked: auth page still requires phone verification.');
    }
    await sleep(500);
  }

  if (!localhostUrl) {
    throw new Error('Fingerprint step 8 did not capture the localhost callback.');
  }

  appendEvent(events, 'ok', '指纹浏览器已捕获 localhost 回调。', 8);
  return {
    status: 'completed',
    payload: {
      localhostUrl,
      pageUrl: page.url(),
    },
  };
}

async function run() {
  const payload = loadPayload(process.argv[2]);
  const events = [];
  const { chromium } = await getPlaywright();
  const browser = await chromium.connectOverCDP(payload.wsEndpoint);
  const context = browser.contexts()[0] || await browser.newContext();
  const page = await resolvePage(context);

  try {
    let result;
    switch (Number(payload.step)) {
      case 2:
        result = await runStep2(page, payload, events);
        break;
      case 3:
        result = await runStep3(page, payload, events);
        break;
      case 4:
        result = await fillVerificationCode(page, payload.code, 4, events);
        break;
      case 5:
        result = await runStep5(page, payload, events);
        break;
      case 6:
        result = await runStep6(page, payload, events);
        break;
      case 7:
        result = await fillVerificationCode(page, payload.code, 7, events);
        break;
      case 8:
        result = await runStep8(page, payload, events);
        break;
      default:
        throw new Error(`Unsupported fingerprint step: ${payload.step}`);
    }

    process.stdout.write(JSON.stringify({
      ...result,
      events,
      payload: {
        ...(result.payload || {}),
        wsEndpoint: payload.wsEndpoint,
      },
    }));
  } finally {
    try {
      await browser.close();
    } catch {}
  }
}

run().catch((error) => {
  process.stdout.write(JSON.stringify({
    status: 'failed',
    error: error.message,
    payload: {},
    events: [],
  }));
  process.exitCode = 1;
});
