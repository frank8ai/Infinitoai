(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.SidepanelSettings = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  const DEFAULT_AUTO_RUN_COUNT = 1;
  const DEFAULT_AUTO_RUN_INFINITE = false;
  const DEFAULT_AUTO_ROTATE_MAIL_PROVIDER = false;
  const DEFAULT_MAIL_PROVIDER = '163';
  const DEFAULT_EMAIL_SOURCE = 'cloudmail';
  const DEFAULT_SIGNUP_ENTRY = 'platform';
  const DEFAULT_BROWSER_BACKEND = 'extension';
  const DEFAULT_FINGERPRINT_PROVIDER = 'roxy';
  const DEFAULT_ROXY_API_BASE_URL = 'http://127.0.0.1:50000';
  const DEFAULT_CLOUDMAIL_BASE_URL = 'https://temp-email-api.bitpowerhub.com';
  const DEFAULT_CLOUDMAIL_ADMIN_EMAIL = 'm1n1ewx@coffeejadore.com';
  const DEFAULT_CLOUDMAIL_ADMIN_PASSWORD = 'iqAdlveWP/G9ldZRMYXXXh711EWlek4p';
  const DEFAULT_CLOUDMAIL_DOMAINS = 'coffeejadore.com';
  const DEFAULT_CLOUDMAIL_SUBDOMAIN = '';
  const DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN = false;
  const PERSISTED_TOP_SETTING_KEYS = [
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
  ];

  function sanitizeAutoRunCount(value) {
    const numeric = Number.parseInt(String(value ?? '').trim(), 10);
    if (!Number.isFinite(numeric) || numeric < 1) {
      return DEFAULT_AUTO_RUN_COUNT;
    }
    return numeric;
  }

  function sanitizeInfiniteAutoRun(value) {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false' || normalized === '') return false;
    }
    return Boolean(value);
  }

  function sanitizeAutoRotateMailProvider(value) {
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (normalized === 'true') return true;
      if (normalized === 'false' || normalized === '') return false;
    }
    if (value === undefined || value === null) {
      return DEFAULT_AUTO_ROTATE_MAIL_PROVIDER;
    }
    return Boolean(value);
  }

  function sanitizeMailProvider(value) {
    return value === 'qq' || value === '163' || value === 'inbucket'
      ? value
      : DEFAULT_MAIL_PROVIDER;
  }

  function sanitizeEmailSource(value) {
    return value === '33mail' || value === 'duck' || value === 'tmailor' || value === 'cloudmail'
      ? value
      : DEFAULT_EMAIL_SOURCE;
  }

  function sanitizeOAuthBackend(value) {
    return value === 'codex2api' ? 'codex2api' : 'vps';
  }

  function sanitizeSignupEntry(value) {
    return value === 'chatgpt' ? 'chatgpt' : DEFAULT_SIGNUP_ENTRY;
  }

  function sanitizeBrowserBackend(value) {
    return value === 'fingerprint' ? 'fingerprint' : DEFAULT_BROWSER_BACKEND;
  }

  function sanitizeFingerprintProvider(value) {
    return value === 'roxy' ? 'roxy' : DEFAULT_FINGERPRINT_PROVIDER;
  }

  function sanitizePresetString(value, defaultValue = '') {
    if (typeof value !== 'string') {
      return defaultValue;
    }
    return value.trim() ? value : defaultValue;
  }

  function sanitizeCloudMailEnableRandomSubdomain(value) {
    if (value === undefined || value === null || (typeof value === 'string' && value.trim() === '')) {
      return DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN;
    }
    return sanitizeAutoRotateMailProvider(value);
  }

  function normalizeEmailDomain(domain) {
    return String(domain || '').trim().replace(/^@+/, '').toLowerCase();
  }

  function normalizeMailDomainSettings(value = {}) {
    return {
      '163': { emailDomain: normalizeEmailDomain(value?.['163']?.emailDomain) },
      qq: { emailDomain: normalizeEmailDomain(value?.qq?.emailDomain) },
      inbucket: { emailDomain: normalizeEmailDomain(value?.inbucket?.emailDomain) },
    };
  }

  function normalizePersistentSettings(value = {}) {
    return {
      vpsUrl: typeof value.vpsUrl === 'string' ? value.vpsUrl : '',
      signupEntry: sanitizeSignupEntry(value.signupEntry),
      browserBackend: sanitizeBrowserBackend(value.browserBackend),
      fingerprintProvider: sanitizeFingerprintProvider(value.fingerprintProvider),
      roxyApiBaseUrl: typeof value.roxyApiBaseUrl === 'string' ? value.roxyApiBaseUrl : DEFAULT_ROXY_API_BASE_URL,
      roxyApiToken: typeof value.roxyApiToken === 'string' ? value.roxyApiToken : '',
      roxyWorkspaceId: typeof value.roxyWorkspaceId === 'string' || typeof value.roxyWorkspaceId === 'number'
        ? String(value.roxyWorkspaceId)
        : '',
      mailProvider: sanitizeMailProvider(value.mailProvider),
      emailSource: sanitizeEmailSource(value.emailSource),
      mailDomainSettings: normalizeMailDomainSettings(value.mailDomainSettings),
      inbucketHost: typeof value.inbucketHost === 'string' ? value.inbucketHost : '',
      inbucketMailbox: typeof value.inbucketMailbox === 'string' ? value.inbucketMailbox : '',
      cloudMailBaseUrl: sanitizePresetString(value.cloudMailBaseUrl, DEFAULT_CLOUDMAIL_BASE_URL),
      cloudMailAdminEmail: typeof value.cloudMailAdminEmail === 'string' ? value.cloudMailAdminEmail : DEFAULT_CLOUDMAIL_ADMIN_EMAIL,
      cloudMailAdminPassword: typeof value.cloudMailAdminPassword === 'string' ? value.cloudMailAdminPassword : DEFAULT_CLOUDMAIL_ADMIN_PASSWORD,
      cloudMailDomains: sanitizePresetString(value.cloudMailDomains, DEFAULT_CLOUDMAIL_DOMAINS),
      cloudMailSubdomain: typeof value.cloudMailSubdomain === 'string' ? value.cloudMailSubdomain : DEFAULT_CLOUDMAIL_SUBDOMAIN,
      cloudMailEnableRandomSubdomain: sanitizeCloudMailEnableRandomSubdomain(value.cloudMailEnableRandomSubdomain),
      oauthBackend: sanitizeOAuthBackend(value.oauthBackend),
      codex2ApiBaseUrl: typeof value.codex2ApiBaseUrl === 'string' ? value.codex2ApiBaseUrl : '',
      codex2ApiAdminKey: typeof value.codex2ApiAdminKey === 'string' ? value.codex2ApiAdminKey : '',
      codex2ApiProxyUrl: typeof value.codex2ApiProxyUrl === 'string' ? value.codex2ApiProxyUrl : '',
      codex2ApiAccountName: typeof value.codex2ApiAccountName === 'string' ? value.codex2ApiAccountName : '',
      autoRunCount: sanitizeAutoRunCount(value.autoRunCount),
      autoRunInfinite: sanitizeInfiniteAutoRun(value.autoRunInfinite),
      autoRotateMailProvider: sanitizeAutoRotateMailProvider(value.autoRotateMailProvider),
    };
  }

  function buildTopSettingPayload(value = {}) {
    const normalized = normalizePersistentSettings(value);
    return {
      ...normalized,
      vpsUrl: normalized.vpsUrl.trim(),
      roxyApiBaseUrl: normalized.roxyApiBaseUrl.trim().replace(/\/+$/, '') || DEFAULT_ROXY_API_BASE_URL,
      roxyApiToken: normalized.roxyApiToken.trim(),
      roxyWorkspaceId: normalized.roxyWorkspaceId.trim(),
      inbucketHost: normalized.inbucketHost.trim(),
      inbucketMailbox: normalized.inbucketMailbox.trim(),
      cloudMailBaseUrl: normalized.cloudMailBaseUrl.trim().replace(/\/+$/, ''),
      cloudMailAdminEmail: normalized.cloudMailAdminEmail.trim(),
      cloudMailAdminPassword: normalized.cloudMailAdminPassword.trim(),
      cloudMailDomains: normalized.cloudMailDomains.trim(),
      cloudMailSubdomain: normalized.cloudMailSubdomain.trim().replace(/^@+/, '').toLowerCase(),
      codex2ApiBaseUrl: normalized.codex2ApiBaseUrl.trim().replace(/\/+$/, ''),
      codex2ApiAdminKey: normalized.codex2ApiAdminKey.trim(),
      codex2ApiProxyUrl: normalized.codex2ApiProxyUrl.trim(),
      codex2ApiAccountName: normalized.codex2ApiAccountName.trim(),
    };
  }

  function getEmailInputPlaceholder({ emailSource, mailProvider, autoRotateMailProvider } = {}) {
    const normalizedSource = sanitizeEmailSource(emailSource);
    const normalizedProvider = sanitizeMailProvider(mailProvider);
    const isGroupedMailProvider = normalizedProvider === '163' || normalizedProvider === 'qq';

    if (normalizedSource === '33mail') {
      return isGroupedMailProvider
        ? 'Step 3 will generate a 33mail address automatically'
        : '33mail uses the 163 / QQ groups';
    }

    if (normalizedSource === 'tmailor') {
      return 'Paste the generated TMailor address here manually';
    }
    if (normalizedSource === 'cloudmail') {
      return 'TempMail will generate an address automatically';
    }

    return 'Paste DuckDuckGo email';
  }

  function getAutoContinueHint({ emailSource, mailProvider, autoRotateMailProvider } = {}) {
    const normalizedSource = sanitizeEmailSource(emailSource);
    const normalizedProvider = sanitizeMailProvider(mailProvider);
    const shouldAutoRotate = sanitizeAutoRotateMailProvider(autoRotateMailProvider);
    const isGroupedMailProvider = normalizedProvider === '163' || normalizedProvider === 'qq';

    if (normalizedSource === '33mail') {
      if (shouldAutoRotate) {
        return 'Auto mode will rotate the 163 / QQ 33mail groups by run';
      }
      return isGroupedMailProvider
        ? 'Select 163 or QQ, configure its domain, then continue'
        : '33mail uses the 163 / QQ groups';
    }

    if (normalizedSource === 'tmailor') {
      return 'Click New Email on TMailor, then paste the generated address into Email. Auto run will resume automatically.';
    }
    if (normalizedSource === 'cloudmail') {
      return 'Use Auto to generate a TempMail address and poll codes through the API.';
    }

    return 'Use Auto to fetch Duck email, or paste manually, then continue';
  }

  return {
    buildTopSettingPayload,
    DEFAULT_AUTO_RUN_COUNT,
    DEFAULT_AUTO_RUN_INFINITE,
    DEFAULT_AUTO_ROTATE_MAIL_PROVIDER,
    DEFAULT_BROWSER_BACKEND,
    DEFAULT_CLOUDMAIL_ADMIN_PASSWORD,
    DEFAULT_CLOUDMAIL_ADMIN_EMAIL,
    DEFAULT_CLOUDMAIL_BASE_URL,
    DEFAULT_CLOUDMAIL_DOMAINS,
    DEFAULT_CLOUDMAIL_ENABLE_RANDOM_SUBDOMAIN,
    DEFAULT_CLOUDMAIL_SUBDOMAIN,
    DEFAULT_EMAIL_SOURCE,
    DEFAULT_FINGERPRINT_PROVIDER,
    DEFAULT_ROXY_API_BASE_URL,
    DEFAULT_SIGNUP_ENTRY,
    PERSISTED_TOP_SETTING_KEYS,
    getAutoContinueHint,
    getEmailInputPlaceholder,
    normalizePersistentSettings,
    sanitizeAutoRunCount,
    sanitizeAutoRotateMailProvider,
    sanitizeBrowserBackend,
    sanitizeEmailSource,
    sanitizeFingerprintProvider,
    sanitizeInfiniteAutoRun,
    sanitizeOAuthBackend,
    sanitizeSignupEntry,
  };
});
