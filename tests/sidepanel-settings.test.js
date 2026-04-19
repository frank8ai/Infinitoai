const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTopSettingPayload,
  DEFAULT_AUTO_RUN_COUNT,
  DEFAULT_AUTO_RUN_INFINITE,
  DEFAULT_AUTO_ROTATE_MAIL_PROVIDER,
  DEFAULT_BROWSER_BACKEND,
  DEFAULT_CLOUDMAIL_BASE_URL,
  DEFAULT_CLOUDMAIL_DOMAINS,
  DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN,
  DEFAULT_CLOUDMAIL_SUBDOMAIN,
  DEFAULT_EMAIL_SOURCE,
  DEFAULT_FINGERPRINT_PROVIDER,
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

test('sanitizeEmailSource falls back to tmailor for unsupported values', () => {
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
      customPassword: 'should-not-be-here',
    }),
    {
      vpsUrl: 'http://127.0.0.1:3000',
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
    }
  );

  assert.deepEqual(
    normalizePersistentSettings({}),
    {
      vpsUrl: '',
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
      cloudMailAdminEmail: '',
      cloudMailAdminPassword: '',
      cloudMailDomains: DEFAULT_CLOUDMAIL_DOMAINS,
      cloudMailSubdomain: DEFAULT_CLOUDMAIL_SUBDOMAIN,
      cloudMailEnableRandomSubdomain: DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN,
      oauthBackend: 'vps',
      codex2ApiBaseUrl: '',
      codex2ApiAdminKey: '',
      codex2ApiProxyUrl: '',
      codex2ApiAccountName: '',
      autoRunCount: DEFAULT_AUTO_RUN_COUNT,
      autoRunInfinite: DEFAULT_AUTO_RUN_INFINITE,
      autoRotateMailProvider: DEFAULT_AUTO_ROTATE_MAIL_PROVIDER,
    }
  );

  assert.deepEqual(
    PERSISTED_TOP_SETTING_KEYS,
    [
      'vpsUrl',
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
    ]
  );
});

test('buildTopSettingPayload keeps the current email source and related settings before a run starts', () => {
  assert.deepEqual(
    buildTopSettingPayload({
      vpsUrl: ' https://panel.example.com ',
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
    }),
    {
      vpsUrl: 'https://panel.example.com',
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

test('CloudMail settings explain API-based mailbox generation', () => {
  assert.equal(
    getEmailInputPlaceholder({
      emailSource: 'cloudmail',
      mailProvider: '163',
    }),
    'CloudMail will generate an address automatically'
  );

  assert.equal(
    getAutoContinueHint({
      emailSource: 'cloudmail',
      mailProvider: '163',
    }),
    'Use Auto to generate a CloudMail address and poll codes through the API.'
  );
});

test('sidepanel settings no longer expose VPS validation helpers', () => {
  const settings = require('../shared/sidepanel-settings.js');
  assert.equal('getVpsUrlValidationError' in settings, false);
  assert.equal('isSupportedVpsOauthSuffix' in settings, false);
});
