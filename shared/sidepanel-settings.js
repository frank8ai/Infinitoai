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
  const DEFAULT_EMAIL_SOURCE = 'tmailor';
  const PERSISTED_TOP_SETTING_KEYS = [
    'vpsUrl',
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
      mailProvider: sanitizeMailProvider(value.mailProvider),
      emailSource: sanitizeEmailSource(value.emailSource),
      mailDomainSettings: normalizeMailDomainSettings(value.mailDomainSettings),
      inbucketHost: typeof value.inbucketHost === 'string' ? value.inbucketHost : '',
      inbucketMailbox: typeof value.inbucketMailbox === 'string' ? value.inbucketMailbox : '',
      cloudMailBaseUrl: typeof value.cloudMailBaseUrl === 'string' ? value.cloudMailBaseUrl : '',
      cloudMailAdminEmail: typeof value.cloudMailAdminEmail === 'string' ? value.cloudMailAdminEmail : '',
      cloudMailAdminPassword: typeof value.cloudMailAdminPassword === 'string' ? value.cloudMailAdminPassword : '',
      cloudMailDomains: typeof value.cloudMailDomains === 'string' ? value.cloudMailDomains : '',
      cloudMailSubdomain: typeof value.cloudMailSubdomain === 'string' ? value.cloudMailSubdomain : '',
      cloudMailEnableRandomSubdomain: sanitizeAutoRotateMailProvider(value.cloudMailEnableRandomSubdomain),
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
      return 'CloudMail will generate an address automatically';
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
      return 'Use Auto to generate a CloudMail address and poll codes through the API.';
    }

    return 'Use Auto to fetch Duck email, or paste manually, then continue';
  }

  return {
    buildTopSettingPayload,
    DEFAULT_AUTO_RUN_COUNT,
    DEFAULT_AUTO_RUN_INFINITE,
    DEFAULT_AUTO_ROTATE_MAIL_PROVIDER,
    DEFAULT_EMAIL_SOURCE,
    PERSISTED_TOP_SETTING_KEYS,
    getAutoContinueHint,
    getEmailInputPlaceholder,
    normalizePersistentSettings,
    sanitizeAutoRunCount,
    sanitizeAutoRotateMailProvider,
    sanitizeEmailSource,
    sanitizeInfiniteAutoRun,
    sanitizeOAuthBackend,
  };
});
