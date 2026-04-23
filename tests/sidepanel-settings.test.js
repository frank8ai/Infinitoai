const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTopSettingPayload,
  DEFAULT_ACCOUNT_SUCCESS_ONLY,
  DEFAULT_AUTO_RUN_COUNT,
  DEFAULT_AUTO_RUN_INFINITE,
  DEFAULT_AUTO_ROTATE_MAIL_PROVIDER,
  DEFAULT_BROWSER_BACKEND,
  DEFAULT_CLOUDMAIL_ADMIN_PASSWORD,
  DEFAULT_CLOUDMAIL_BASE_URL,
  DEFAULT_CLOUDMAIL_DOMAINS,
  DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN,
  DEFAULT_CLOUDMAIL_SUBDOMAIN,
  DEFAULT_CODEX2API_ACCOUNT_NAME,
  DEFAULT_CODEX2API_ADMIN_KEY,
  DEFAULT_CODEX2API_BASE_URL,
  DEFAULT_CODEX2API_PROXY_URL,
  DEFAULT_EMAIL_SOURCE,
  DEFAULT_FINGERPRINT_PROVIDER,
  DEFAULT_OAUTH_BACKEND,
  DEFAULT_ROXY_API_BASE_URL,
  DEFAULT_SIGNUP_ENTRY,
  getAutoContinueHint,
  getEmailInputPlaceholder,
  PERSISTED_TOP_SETTING_KEYS,
  normalizePersistentSettings,
  sanitizeAutoRunCount,
  sanitizeAutoRotateMailProvider,
  sanitizeBrowserBackend,
  sanitizeEmailSource,
  sanitizeFingerprintProvider,
  sanitizeInfiniteAutoRun,
  sanitizeSignupEntry,
} = require('../shared/sidepanel-settings.js');

const EXPECTED_TEMPMAIL_LOCKED_SUBDOMAINS = [
  'coffeejadore.com',
].join(', ');

test('sanitizeAutoRunCount keeps positive integers', () => {
  assert.equal(sanitizeAutoRunCount('5'), 5);
  assert.equal(sanitizeAutoRunCount(3), 3);
});

test('sanitizeAutoRunCount falls back to default for invalid values', () => {
  assert.equal(sanitizeAutoRunCount(''), DEFAULT_AUTO_RUN_COUNT);
  assert.equal(sanitizeAutoRunCount('0'), DEFAULT_AUTO_RUN_COUNT);
  assert.equal(sanitizeAutoRunCount('-1'), DEFAULT_AUTO_RUN_COUNT);
  assert.equal(sanitizeAutoRunCount('abc'), DEFAULT_AUTO_RUN_COUNT);
});

test('sanitizeInfiniteAutoRun coerces values to booleans', () => {
  assert.equal(sanitizeInfiniteAutoRun(true), true);
  assert.equal(sanitizeInfiniteAutoRun(false), false);
  assert.equal(sanitizeInfiniteAutoRun('true'), true);
  assert.equal(sanitizeInfiniteAutoRun('false'), false);
  assert.equal(sanitizeInfiniteAutoRun(undefined), false);
});

test('sanitizeEmailSource falls back to the configured default for unsupported values', () => {
  assert.equal(sanitizeEmailSource('duck'), 'duck');
  assert.equal(sanitizeEmailSource('33mail'), '33mail');
  assert.equal(sanitizeEmailSource('tmailor'), 'tmailor');
  assert.equal(sanitizeEmailSource('cloudmail'), 'cloudmail');
  assert.equal(sanitizeEmailSource('other'), DEFAULT_EMAIL_SOURCE);
});

test('entry and browser backend sanitizers keep supported values', () => {
  assert.equal(sanitizeSignupEntry('chatgpt'), 'chatgpt');
  assert.equal(sanitizeSignupEntry('other'), DEFAULT_SIGNUP_ENTRY);
  assert.equal(sanitizeBrowserBackend('fingerprint'), 'fingerprint');
  assert.equal(sanitizeBrowserBackend('other'), DEFAULT_BROWSER_BACKEND);
  assert.equal(sanitizeFingerprintProvider('roxy'), 'roxy');
  assert.equal(sanitizeFingerprintProvider('other'), DEFAULT_FINGERPRINT_PROVIDER);
});

test('sanitizeAutoRotateMailProvider coerces booleans safely', () => {
  assert.equal(sanitizeAutoRotateMailProvider(true), true);
  assert.equal(sanitizeAutoRotateMailProvider(false), false);
  assert.equal(sanitizeAutoRotateMailProvider('true'), true);
  assert.equal(sanitizeAutoRotateMailProvider('false'), false);
  assert.equal(sanitizeAutoRotateMailProvider(undefined), DEFAULT_AUTO_ROTATE_MAIL_PROVIDER);
});

test('normalizePersistentSettings returns only persisted top-bar settings', () => {
  assert.deepEqual(
    normalizePersistentSettings({
      vpsUrl: 'http://127.0.0.1:3000',
      vpsCpaPassword: 'secret-key',
      signupEntry: 'chatgpt',
      browserBackend: 'fingerprint',
      fingerprintProvider: 'roxy',
      roxyApiBaseUrl: ' http://127.0.0.1:50000/ ',
      roxyApiToken: 'token-1',
      roxyWorkspaceId: 42,
      mailProvider: 'inbucket',
      emailSource: '33mail',
      mailDomainSettings: {
        '163': { emailDomain: 'alpha.33mail.com' },
        qq: { emailDomain: 'beta.33mail.com' },
      },
      inbucketHost: 'mail.test',
      inbucketMailbox: 'box-1',
      cloudMailBaseUrl: ' https://cloudmail.example.com/ ',
      cloudMailAdminEmail: 'admin@example.com',
      cloudMailAdminPassword: 'secret',
      cloudMailDomains: 'finchaintalk.com, temp-email-api.bitpowerhub.com',
      cloudMailSubdomain: 'test',
      cloudMailEnableRandomSubdomain: 'true',
      oauthBackend: 'codex2api',
      codex2ApiBaseUrl: ' https://codex2api.bitpowerhub.com/ ',
      codex2ApiAdminKey: 'admin-secret',
      codex2ApiProxyUrl: ' http://127.0.0.1:7890 ',
      codex2ApiAccountName: ' new account ',
      autoRunCount: '8',
      autoRunInfinite: 'true',
      autoRotateMailProvider: 'true',
      accountSuccessOnly: false,
      customPassword: 'should-not-be-here',
    }),
    {
      vpsUrl: 'http://127.0.0.1:3000',
      vpsCpaPassword: 'secret-key',
      signupEntry: 'chatgpt',
      browserBackend: 'fingerprint',
      fingerprintProvider: 'roxy',
      roxyApiBaseUrl: ' http://127.0.0.1:50000/ ',
      roxyApiToken: 'token-1',
      roxyWorkspaceId: '42',
      mailProvider: 'inbucket',
      emailSource: '33mail',
      mailDomainSettings: {
        '163': { emailDomain: 'alpha.33mail.com' },
        qq: { emailDomain: 'beta.33mail.com' },
        inbucket: { emailDomain: '' },
      },
      inbucketHost: 'mail.test',
      inbucketMailbox: 'box-1',
      cloudMailBaseUrl: ' https://cloudmail.example.com/ ',
      cloudMailAdminEmail: 'admin@example.com',
      cloudMailAdminPassword: 'secret',
      cloudMailDomains: 'finchaintalk.com, temp-email-api.bitpowerhub.com',
      cloudMailSubdomain: 'test',
      cloudMailEnableRandomSubdomain: true,
      oauthBackend: 'codex2api',
      codex2ApiBaseUrl: ' https://codex2api.bitpowerhub.com/ ',
      codex2ApiAdminKey: 'admin-secret',
      codex2ApiProxyUrl: ' http://127.0.0.1:7890 ',
      codex2ApiAccountName: ' new account ',
      autoRunCount: 8,
      autoRunInfinite: true,
      autoRotateMailProvider: true,
      accountSuccessOnly: false,
    }
  );

  assert.deepEqual(
    normalizePersistentSettings({}),
    {
      vpsUrl: '',
      vpsCpaPassword: '',
      signupEntry: DEFAULT_SIGNUP_ENTRY,
      browserBackend: DEFAULT_BROWSER_BACKEND,
      fingerprintProvider: DEFAULT_FINGERPRINT_PROVIDER,
      roxyApiBaseUrl: DEFAULT_ROXY_API_BASE_URL,
      roxyApiToken: '',
      roxyWorkspaceId: '',
      mailProvider: '163',
      emailSource: DEFAULT_EMAIL_SOURCE,
      mailDomainSettings: {
        '163': { emailDomain: '' },
        qq: { emailDomain: '' },
        inbucket: { emailDomain: '' },
      },
      inbucketHost: '',
      inbucketMailbox: '',
      cloudMailBaseUrl: DEFAULT_CLOUDMAIL_BASE_URL,
      cloudMailAdminEmail: 'm1n1ewx@coffeejadore.com',
      cloudMailAdminPassword: DEFAULT_CLOUDMAIL_ADMIN_PASSWORD,
      cloudMailDomains: DEFAULT_CLOUDMAIL_DOMAINS,
      cloudMailSubdomain: DEFAULT_CLOUDMAIL_SUBDOMAIN,
      cloudMailEnableRandomSubdomain: DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN,
      oauthBackend: DEFAULT_OAUTH_BACKEND,
      codex2ApiBaseUrl: DEFAULT_CODEX2API_BASE_URL,
      codex2ApiAdminKey: DEFAULT_CODEX2API_ADMIN_KEY,
      codex2ApiProxyUrl: DEFAULT_CODEX2API_PROXY_URL,
      codex2ApiAccountName: DEFAULT_CODEX2API_ACCOUNT_NAME,
      autoRunCount: DEFAULT_AUTO_RUN_COUNT,
      autoRunInfinite: DEFAULT_AUTO_RUN_INFINITE,
      autoRotateMailProvider: DEFAULT_AUTO_ROTATE_MAIL_PROVIDER,
      accountSuccessOnly: DEFAULT_ACCOUNT_SUCCESS_ONLY,
    }
  );

  assert.deepEqual(
    PERSISTED_TOP_SETTING_KEYS,
    [
      'vpsUrl',
      'vpsCpaPassword',
      'signupEntry',
      'browserBackend',
      'fingerprintProvider',
      'roxyApiBaseUrl',
      'roxyApiToken',
      'roxyWorkspaceId',
      'mailProvider',
      'emailSource',
      'mailDomainSettings',
      'inbucketHost',
      'inbucketMailbox',
      'cloudMailBaseUrl',
      'cloudMailAdminEmail',
      'cloudMailAdminPassword',
      'cloudMailDomains',
      'cloudMailSubdomain',
      'cloudMailEnableRandomSubdomain',
      'oauthBackend',
      'codex2ApiBaseUrl',
      'codex2ApiAdminKey',
      'codex2ApiProxyUrl',
      'codex2ApiAccountName',
      'autoRunCount',
      'autoRunInfinite',
      'autoRotateMailProvider',
      'accountSuccessOnly',
    ]
  );
});

test('buildTopSettingPayload keeps the current email source and related settings before a run starts', () => {
  assert.deepEqual(
    buildTopSettingPayload({
      vpsUrl: ' https://panel.example.com ',
      vpsCpaPassword: ' secret-key ',
      signupEntry: 'chatgpt',
      browserBackend: 'fingerprint',
      fingerprintProvider: 'roxy',
      roxyApiBaseUrl: ' http://127.0.0.1:50000/ ',
      roxyApiToken: ' token-2 ',
      roxyWorkspaceId: ' 84 ',
      mailProvider: 'qq',
      emailSource: 'tmailor',
      mailDomainSettings: {
        '163': { emailDomain: ' alpha.33mail.com ' },
        qq: { emailDomain: '@beta.33mail.com' },
      },
      inbucketHost: ' mailbox.test ',
      inbucketMailbox: ' box-7 ',
      cloudMailBaseUrl: ' https://cloudmail.example.com/ ',
      cloudMailAdminEmail: ' admin@example.com ',
      cloudMailAdminPassword: ' secret ',
      cloudMailDomains: ' finchaintalk.com, @temp-email-api.bitpowerhub.com ',
      cloudMailSubdomain: ' api ',
      cloudMailEnableRandomSubdomain: true,
      oauthBackend: 'codex2api',
      codex2ApiBaseUrl: ' https://codex2api.bitpowerhub.com/ ',
      codex2ApiAdminKey: ' admin-secret ',
      codex2ApiProxyUrl: ' http://127.0.0.1:7890 ',
      codex2ApiAccountName: ' new account ',
      autoRunCount: '6',
      autoRunInfinite: 'true',
      autoRotateMailProvider: 'false',
      accountSuccessOnly: false,
    }),
    {
      vpsUrl: 'https://panel.example.com',
      vpsCpaPassword: 'secret-key',
      signupEntry: 'chatgpt',
      browserBackend: 'fingerprint',
      fingerprintProvider: 'roxy',
      roxyApiBaseUrl: 'http://127.0.0.1:50000',
      roxyApiToken: 'token-2',
      roxyWorkspaceId: '84',
      mailProvider: 'qq',
      emailSource: 'tmailor',
      mailDomainSettings: {
        '163': { emailDomain: 'alpha.33mail.com' },
        qq: { emailDomain: 'beta.33mail.com' },
        inbucket: { emailDomain: '' },
      },
      inbucketHost: 'mailbox.test',
      inbucketMailbox: 'box-7',
      cloudMailBaseUrl: 'https://cloudmail.example.com',
      cloudMailAdminEmail: 'admin@example.com',
      cloudMailAdminPassword: 'secret',
      cloudMailDomains: 'finchaintalk.com, @temp-email-api.bitpowerhub.com',
      cloudMailSubdomain: 'api',
      cloudMailEnableRandomSubdomain: true,
      oauthBackend: 'codex2api',
      codex2ApiBaseUrl: 'https://codex2api.bitpowerhub.com',
      codex2ApiAdminKey: 'admin-secret',
      codex2ApiProxyUrl: 'http://127.0.0.1:7890',
      codex2ApiAccountName: 'new account',
      autoRunCount: 6,
      autoRunInfinite: true,
      autoRotateMailProvider: false,
      accountSuccessOnly: false,
    }
  );
});

test('getEmailInputPlaceholder updates the TMailor placeholder to describe the manual New Email step', () => {
  assert.equal(
    getEmailInputPlaceholder({
      emailSource: 'tmailor',
      mailProvider: '163',
    }),
    'Paste the generated TMailor address here manually'
  );
});

test('getAutoContinueHint updates the TMailor hint to describe clicking New Email first', () => {
  assert.equal(
    getAutoContinueHint({
      emailSource: 'tmailor',
      mailProvider: '163',
      autoRotateMailProvider: false,
    }),
    'Click New Email on TMailor, then paste the generated address into Email. Auto run will resume automatically.'
  );
});

test('TempMail settings explain API-based mailbox generation', () => {
  assert.equal(
    getEmailInputPlaceholder({
      emailSource: 'cloudmail',
      mailProvider: '163',
    }),
    'TempMail will generate an address automatically'
  );

  assert.equal(
    getAutoContinueHint({
      emailSource: 'cloudmail',
      mailProvider: '163',
    }),
    'Use Auto to generate a TempMail address and poll codes through the API.'
  );
});

test('TempMail defaults point at the coffeejadore worker mailbox', () => {
  assert.equal(DEFAULT_CLOUDMAIL_BASE_URL, 'https://temp-email-api.bitpowerhub.com');
  assert.equal(DEFAULT_CLOUDMAIL_DOMAINS, EXPECTED_TEMPMAIL_LOCKED_SUBDOMAINS);
  assert.equal(DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN, false);
});

test('sidepanel settings no longer expose VPS validation helpers', () => {
  const settings = require('../shared/sidepanel-settings.js');
  assert.equal('getVpsUrlValidationError' in settings, false);
  assert.equal('isSupportedVpsOauthSuffix' in settings, false);
});
