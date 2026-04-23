const fs = require('node:fs');
const path = require('node:path');

const {
  DEFAULT_CLOUDMAIL_ADMIN_PASSWORD,
  DEFAULT_CLOUDMAIL_ADMIN_EMAIL,
  DEFAULT_CLOUDMAIL_BASE_URL,
  DEFAULT_CLOUDMAIL_DOMAINS,
  DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN,
  DEFAULT_CLOUDMAIL_SUBDOMAIN,
} = require('../shared/sidepanel-settings.js');
const { createCloudMailEmail, pollCloudMailVerificationCode } = require('../shared/cloudmail-api.js');

const DEFAULT_CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const DEFAULT_RECORD_PATH = path.join(process.cwd(), 'logs', 'openai-signup-accounts.jsonl');
const DEFAULT_ARTIFACT_ROOT = path.join(process.cwd(), 'playwright-debug-artifacts', 'openai-signup-runner');

function generatePassword(randomFn = Math.random) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*?';
  let password = 'Aa2!';
  while (password.length < 14) {
    password += chars[Math.floor(randomFn() * chars.length)];
  }
  return password;
}

function buildAccountRecord(value = {}) {
  return {
    createdAt: value.now || new Date().toISOString(),
    status: String(value.status || 'unknown'),
    email: String(value.email || ''),
    password: String(value.password || ''),
    domain: String(value.domain || ''),
    signupCode: String(value.signupCode || ''),
    finalUrl: String(value.finalUrl || ''),
    artifacts: String(value.artifacts || ''),
    events: Array.isArray(value.events) ? value.events : [],
    error: value.error ? String(value.error) : '',
  };
}

function appendAccountRecord(record, outputPath = DEFAULT_RECORD_PATH) {
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.appendFileSync(outputPath, `${JSON.stringify(record)}\n`, 'utf8');
}

function createRunArtifactsDir(root = DEFAULT_ARTIFACT_ROOT, now = new Date()) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const dir = path.join(root, stamp);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function snapshot(page, artifactDir, label) {
  const safe = label.replace(/[^a-z0-9_-]+/gi, '_');
  await page.screenshot({ path: path.join(artifactDir, `${safe}.png`), fullPage: true }).catch(() => {});
  fs.writeFileSync(path.join(artifactDir, `${safe}.html`), await page.content().catch(() => ''), 'utf8');
}

async function clickFirst(page, selectors, timeout = 5000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout });
      await locator.click({ timeout });
      return selector;
    } catch {}
  }
  return null;
}

async function fillFirst(page, selectors, value, timeout = 5000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: 'visible', timeout });
      await locator.fill(value, { timeout });
      return selector;
    } catch {}
  }
  return null;
}

async function isVisible(page, selector, timeout = 800) {
  return await page.locator(selector).first().isVisible({ timeout }).catch(() => false);
}

async function pageState(page) {
  const bodyText = ((await page.locator('body').textContent().catch(() => '')) || '').replace(/\s+/g, ' ').trim();
  return {
    url: page.url(),
    title: await page.title().catch(() => ''),
    bodyText: bodyText.slice(0, 900),
  };
}

async function fillSignupCode(page, email, mailboxStartedAt, events) {
  const needsCode = await isVisible(page, 'input[name="code"], input[autocomplete="one-time-code"], input[inputmode="numeric"]', 1500)
    || /email-verification/i.test(page.url());
  if (!needsCode) {
    events.push({ step: 'signup_code_not_requested', url: page.url() });
    return '';
  }

  const result = await pollCloudMailVerificationCode({
    config: {
      baseUrl: DEFAULT_CLOUDMAIL_BASE_URL,
      adminPassword: DEFAULT_CLOUDMAIL_ADMIN_PASSWORD,
      timeoutMs: 30000,
    },
    email,
    step: 4,
    maxAttempts: 24,
    intervalMs: 5000,
    filterAfterTimestamp: mailboxStartedAt - 30000,
  });
  const codeSelector = await fillFirst(
    page,
    ['input[name="code"]', 'input[autocomplete="one-time-code"]', 'input[inputmode="numeric"]', 'input[type="text"][maxlength="6"]'],
    result.code,
    10000,
  );
  await page.waitForTimeout(800);
  const submit = await clickFirst(page, ['button[type="submit"]', 'button:has-text("Continue")', 'button:has-text("Verify")'], 8000);
  events.push({ step: 'signup_code_filled', code: result.code, mailId: result.mailId, codeSelector, submit });
  await page.waitForTimeout(8000);
  return result.code;
}

async function fillProfileIfPresent(page, events) {
  await page.waitForTimeout(3000);
  const profileVisible = /about-you/i.test(page.url())
    || await isVisible(page, 'input[name="name"], input[name="full_name"], input[placeholder*="name" i], input[name="age"], input[name="birthday"]', 1500);
  if (!profileVisible) {
    events.push({ step: 'profile', attempted: false });
    return false;
  }

  const nameSelector = await fillFirst(
    page,
    ['input[name="name"]', 'input[name="full_name"]', 'input[autocomplete="name"]', 'input[placeholder*="name" i]'],
    'Logan Lee',
    10000,
  );
  let birthdaySelector = null;
  if (await isVisible(page, 'input[name="age"]', 1000)) {
    birthdaySelector = await fillFirst(page, ['input[name="age"]'], '31', 3000);
  } else if (await isVisible(page, 'input[name="birthday"]', 1000)) {
    birthdaySelector = await fillFirst(page, ['input[name="birthday"]'], '1995-08-21', 3000);
  } else {
    const spinYear = page.locator('[role="spinbutton"][data-type="year"]').first();
    const spinMonth = page.locator('[role="spinbutton"][data-type="month"]').first();
    const spinDay = page.locator('[role="spinbutton"][data-type="day"]').first();
    if (await spinYear.isVisible({ timeout: 1000 }).catch(() => false)) {
      await spinYear.fill('1995').catch(async () => { await spinYear.pressSequentially('1995'); });
      await spinMonth.fill('08').catch(async () => { await spinMonth.pressSequentially('08'); });
      await spinDay.fill('21').catch(async () => { await spinDay.pressSequentially('21'); });
      birthdaySelector = 'date-spinbuttons';
    }
  }
  const submitSelector = await clickFirst(
    page,
    ['button[type="submit"]', 'button:has-text("Continue")', 'button:has-text("Create")', 'button:has-text("Done")'],
    8000,
  );
  events.push({ step: 'profile', attempted: true, nameSelector, birthdaySelector, submitSelector });
  await page.waitForTimeout(10000);
  return true;
}

function classify(finalState) {
  const text = `${finalState.url}\n${finalState.title}\n${finalState.bodyText}`;
  if (/add-phone|verify your phone|phone number/i.test(text)) return 'phone_blocked';
  if (/unsupported_email|unsupported country|not available/i.test(text)) return 'blocked';
  if (/platform\.openai\.com\/(?:chat|home|api-keys|settings|welcome)|auth\/callback/i.test(finalState.url)) {
    return 'completed_platform_entry';
  }
  if (/about-you|email-verification/i.test(finalState.url)) return 'incomplete_auth_step';
  return 'unknown';
}

async function runSignup(options = {}) {
  const { chromium } = require('playwright-core');
  const artifactDir = options.artifactDir || createRunArtifactsDir(options.artifactRoot || DEFAULT_ARTIFACT_ROOT);
  const recordPath = options.recordPath || DEFAULT_RECORD_PATH;
  const mailboxStartedAt = Date.now();
  const events = [];
  let browser = null;
  let email = '';
  let password = '';
  let domain = '';
  let signupCode = '';

  try {
    const mailbox = await createCloudMailEmail({
      baseUrl: DEFAULT_CLOUDMAIL_BASE_URL,
      adminEmail: DEFAULT_CLOUDMAIL_ADMIN_EMAIL,
      adminPassword: DEFAULT_CLOUDMAIL_ADMIN_PASSWORD,
      domains: DEFAULT_CLOUDMAIL_DOMAINS,
      subdomain: DEFAULT_CLOUDMAIL_SUBDOMAIN,
      enableRandomSubdomain: DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN,
      timeoutMs: 30000,
    });
    email = mailbox.email;
    password = generatePassword();
    domain = email.split('@').pop() || '';
    events.push({ step: 'mailbox_created', email, domain });

    browser = await chromium.launch({
      headless: options.headless === true,
      executablePath: options.chromePath || DEFAULT_CHROME_PATH,
      args: ['--disable-blink-features=AutomationControlled'],
      slowMo: Number.isFinite(options.slowMo) ? options.slowMo : 100,
    });
    const context = await browser.newContext({ viewport: { width: 1440, height: 960 } });
    const page = await context.newPage();

    await page.goto(options.loginUrl || 'https://platform.openai.com/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForTimeout(5000);
    await snapshot(page, artifactDir, '01_login');

    const signupClicked = await clickFirst(
      page,
      ['[data-testid="signup-button"]', 'button:has-text("Sign up")', 'a:has-text("Sign up")', 'button:has-text("Create account")', 'a:has-text("Create account")'],
      12000,
    );
    events.push({ step: 'signup_entry', selector: signupClicked || 'email_form_already_visible' });
    await page.waitForTimeout(3000);

    const emailSelector = await fillFirst(page, ['input[type="email"]', 'input[name="email"]', 'input[autocomplete="email"]'], email, 20000);
    if (!emailSelector) throw new Error('email_input_missing');
    const emailSubmit = await clickFirst(page, ['button[type="submit"]', 'button:has-text("Continue")', 'button:has-text("Next")'], 15000);
    events.push({ step: 'email_submitted', emailSelector, emailSubmit });
    await page.waitForTimeout(5000);
    await snapshot(page, artifactDir, '02_after_email');

    const passwordSelector = await fillFirst(
      page,
      ['input[type="password"]', 'input[name="password"]', 'input[autocomplete="new-password"]', 'input[autocomplete="current-password"]'],
      password,
      20000,
    );
    if (!passwordSelector) throw new Error('password_input_missing');
    const passwordSubmit = await clickFirst(page, ['button[type="submit"]', 'button:has-text("Continue")', 'button:has-text("Next")'], 15000);
    events.push({ step: 'password_submitted', passwordSelector, passwordSubmit });
    await page.waitForTimeout(8000);
    await snapshot(page, artifactDir, '03_after_password');

    signupCode = await fillSignupCode(page, email, mailboxStartedAt, events);
    await snapshot(page, artifactDir, '04_after_signup_code');

    const profileAttempted = await fillProfileIfPresent(page, events);
    if (profileAttempted) {
      await snapshot(page, artifactDir, '05_after_profile');
    }

    const finalState = await pageState(page);
    const status = classify(finalState);
    const record = buildAccountRecord({
      email,
      password,
      domain,
      signupCode,
      status,
      finalUrl: finalState.url,
      artifacts: artifactDir,
      events,
    });
    appendAccountRecord(record, recordPath);
    fs.writeFileSync(path.join(artifactDir, 'result.json'), JSON.stringify({ ...record, finalState }, null, 2), 'utf8');
    await browser.close();
    return { ...record, finalState, recordPath };
  } catch (err) {
    const record = buildAccountRecord({
      email,
      password,
      domain,
      signupCode,
      status: 'failed',
      artifacts: artifactDir,
      events,
      error: err?.message || String(err),
    });
    appendAccountRecord(record, recordPath);
    if (browser) {
      await browser.close().catch(() => {});
    }
    throw err;
  }
}

async function main() {
  const result = await runSignup({
    recordPath: process.env.OPENAI_SIGNUP_RECORD_PATH || DEFAULT_RECORD_PATH,
    artifactRoot: process.env.OPENAI_SIGNUP_ARTIFACT_ROOT || DEFAULT_ARTIFACT_ROOT,
    headless: process.env.OPENAI_SIGNUP_HEADLESS === '1',
  });
  console.log(JSON.stringify(result, null, 2));
}

if (require.main === module) {
  main().catch((err) => {
    console.error(JSON.stringify({ ok: false, error: err?.message || String(err) }, null, 2));
    process.exit(1);
  });
}

module.exports = {
  appendAccountRecord,
  buildAccountRecord,
  generatePassword,
  runSignup,
};
