(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.CloudMailApi = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  function loadNodeDeps() {
    if (typeof require !== 'function') {
      return {};
    }

    try {
      return {
        MailMatching: require('./mail-matching.js'),
        MailFreshness: require('./mail-freshness.js'),
        LatestMail: require('./latest-mail.js'),
      };
    } catch {
      return {};
    }
  }

  function getGlobalDeps() {
    const holder = typeof globalThis !== 'undefined' ? globalThis : self;
    return {
      MailMatching: holder.MailMatching || null,
      MailFreshness: holder.MailFreshness || null,
      LatestMail: holder.LatestMail || null,
    };
  }

  const deps = { ...loadNodeDeps(), ...getGlobalDeps() };
  const getStepMailMatchProfile = deps.MailMatching?.getStepMailMatchProfile || (() => null);
  const matchesSubjectPatterns = deps.MailMatching?.matchesSubjectPatterns || (() => true);
  const isMailFresh = deps.MailFreshness?.isMailFresh || (() => true);
  const parseMailTimestampCandidates = deps.MailFreshness?.parseMailTimestampCandidates || ((values) => {
    const first = Array.isArray(values) ? values.find(Boolean) : values;
    const numeric = Number(first);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric > 10 ** 12 ? numeric : numeric * 1000;
    }
    const parsed = Date.parse(String(first || ''));
    return Number.isFinite(parsed) ? parsed : 0;
  });
  const findLatestMatchingItem = deps.LatestMail?.findLatestMatchingItem || ((items, predicate) => {
    for (const item of items || []) {
      if (predicate(item)) return item;
    }
    return null;
  });

  function normalizeCloudMailDomains(value) {
    const rawItems = Array.isArray(value)
      ? value
      : String(value || '').split(/[\n,;]+/);
    const seen = new Set();
    const domains = [];

    for (const raw of rawItems) {
      const domain = String(raw || '').trim().replace(/^@+/, '').toLowerCase();
      if (!domain || seen.has(domain)) {
        continue;
      }
      seen.add(domain);
      domains.push(domain);
    }

    return domains;
  }

  function normalizeCloudMailConfig(value = {}) {
    const baseUrl = String(value.baseUrl || value.base_url || '').trim().replace(/\/+$/, '');
    const adminEmail = String(value.adminEmail || value.admin_email || '').trim();
    const adminPassword = String(value.adminPassword || value.admin_password || '').trim();
    const domains = normalizeCloudMailDomains(value.domains || value.domain || value.default_domain);
    const subdomain = String(value.subdomain || value.cloudMailSubdomain || '').trim().replace(/^@+/, '').toLowerCase();
    const enableRandomSubdomain = value.enableRandomSubdomain === true
      || value.enable_random_subdomain === true
      || String(value.enableRandomSubdomain || value.enable_random_subdomain || '').trim().toLowerCase() === 'true';
    return {
      baseUrl,
      adminEmail,
      adminPassword,
      domains,
      subdomain,
      enableRandomSubdomain,
      timeoutMs: Math.max(1000, Number.parseInt(String(value.timeoutMs || value.timeout || 30000), 10) || 30000),
      maxAttempts: Math.max(1, Number.parseInt(String(value.maxAttempts || value.max_attempts || 20), 10) || 20),
      intervalMs: Math.max(0, Number.parseInt(String(value.intervalMs || value.interval_ms || 3000), 10) || 3000),
    };
  }

  function assertCloudMailConfig(config) {
    if (!config.baseUrl || !/^https?:\/\//i.test(config.baseUrl)) {
      throw new Error('CloudMail API address is missing or invalid.');
    }
    if (!config.adminPassword) {
      throw new Error('CloudMail admin password is missing.');
    }
  }

  function assertCloudMailAddressConfig(config) {
    assertCloudMailConfig(config);
    if (!config.domains.length) {
      throw new Error('CloudMail domain list is empty.');
    }
  }

  function pickRandomItem(items, randomFn) {
    return items[Math.floor(randomFn() * items.length)] || items[0];
  }

  function generateCloudMailLocalPart(options = {}) {
    const randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
    const now = Number.isFinite(options.now) ? options.now : Date.now();
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let localPart = '';
    for (let i = 0; i < 4; i += 1) {
      localPart += pickRandomItem(letters, randomFn);
    }
    for (let i = 0; i < 3; i += 1) {
      localPart += pickRandomItem(alphabet, randomFn);
    }
    localPart += now.toString(36).slice(-3);
    return localPart;
  }

  function generateCloudMailAddress(configValue = {}, options = {}) {
    const config = normalizeCloudMailConfig(configValue);
    assertCloudMailAddressConfig(config);
    const randomFn = typeof options.randomFn === 'function' ? options.randomFn : Math.random;
    const domain = pickRandomItem(config.domains, randomFn);
    const resolvedDomain = config.subdomain ? `${config.subdomain}.${domain}` : domain;
    const localPart = options.localPart
      ? String(options.localPart).trim().replace(/[^a-z0-9._-]/gi, '').toLowerCase()
      : generateCloudMailLocalPart({ ...options, randomFn });
    if (!localPart) {
      throw new Error('CloudMail generated an empty local part.');
    }
    return `${localPart}@${resolvedDomain}`;
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
      throw new Error(`${label} failed (${response.status}).`);
    }
    if (!json || typeof json !== 'object') {
      throw new Error(`${label} returned an invalid JSON payload.`);
    }
    return json;
  }

  function buildCloudMailHeaders(config, extra = {}) {
    return {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'x-admin-auth': config.adminPassword,
      ...extra,
    };
  }

  async function createCloudMailEmail(configValue = {}, options = {}) {
    const config = normalizeCloudMailConfig(configValue);
    assertCloudMailAddressConfig(config);
    const doFetch = getFetch(options.fetchImpl);
    const localPart = options.localPart
      ? String(options.localPart).trim().replace(/[^a-z0-9._-]/gi, '').toLowerCase()
      : generateCloudMailLocalPart(options);
    const preferredDomain = options.domain
      ? String(options.domain).trim().replace(/^@+/, '').toLowerCase()
      : '';
    const domains = preferredDomain
      ? [preferredDomain, ...config.domains.filter((domain) => domain !== preferredDomain)]
      : config.domains.slice();
    let lastError = null;

    for (const domain of domains) {
      const resolvedDomain = config.subdomain ? `${config.subdomain}.${domain}` : domain;
      try {
        const response = await runWithTimeout(() => doFetch(`${config.baseUrl}/admin/new_address`, {
          method: 'POST',
          headers: buildCloudMailHeaders(config),
          body: JSON.stringify({
            enablePrefix: false,
            enableRandomSubdomain: config.enableRandomSubdomain,
            name: localPart,
            domain: resolvedDomain,
          }),
        }), config.timeoutMs, 'CloudMail address request');
        const json = await parseJsonResponse(response, 'CloudMail address request');
        const address = String(json.address || json.email || json.data?.address || '').trim();
        if (!address) {
          throw new Error('CloudMail address request did not return an address.');
        }
        return {
          ok: true,
          email: address,
          jwt: String(json.jwt || json.data?.jwt || '').trim(),
          id: String(json.id || json.address_id || json.data?.id || json.data?.address_id || address),
        };
      } catch (err) {
        lastError = err;
      }
    }

    throw lastError || new Error('CloudMail address request failed.');
  }

  async function fetchCloudMailList(configValue = {}, email, options = {}) {
    const config = normalizeCloudMailConfig(configValue);
    const doFetch = getFetch(options.fetchImpl);
    assertCloudMailConfig(config);
    const query = new URLSearchParams({
      limit: String(options.limit || 20),
      offset: String(options.offset || 0),
      address: String(email || '').trim(),
    });
    const response = await runWithTimeout(() => doFetch(`${config.baseUrl}/admin/mails?${query.toString()}`, {
      method: 'GET',
      headers: buildCloudMailHeaders(config),
    }), config.timeoutMs, 'CloudMail email list request');
    const json = await parseJsonResponse(response, 'CloudMail email list request');
    if (Array.isArray(json)) {
      return json;
    }
    if (Array.isArray(json.results)) {
      return json.results;
    }
    if (Array.isArray(json.mails)) {
      return json.mails;
    }
    if (Array.isArray(json.data)) {
      return json.data;
    }
    return [];
  }

  function stripHtml(value) {
    return String(value || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function decodeBytes(bytes, charset = 'utf-8') {
    if (!bytes.length) return '';
    const normalizedCharset = String(charset || 'utf-8').trim() || 'utf-8';
    try {
      return new TextDecoder(normalizedCharset).decode(Uint8Array.from(bytes));
    } catch {
      return String.fromCharCode(...bytes);
    }
  }

  function decodeBase64MimeWord(encoded, charset) {
    const clean = String(encoded || '').replace(/\s+/g, '');
    let binary = '';
    if (typeof atob === 'function') {
      binary = atob(clean);
    } else if (typeof Buffer !== 'undefined') {
      binary = Buffer.from(clean, 'base64').toString('binary');
    }
    const bytes = Array.from(binary, (char) => char.charCodeAt(0));
    return decodeBytes(bytes, charset);
  }

  function decodeQuotedPrintableMimeWord(encoded, charset) {
    const value = String(encoded || '').replace(/_/g, ' ');
    const bytes = [];
    for (let i = 0; i < value.length; i += 1) {
      if (value[i] === '=' && /^[0-9a-f]{2}$/i.test(value.slice(i + 1, i + 3))) {
        bytes.push(Number.parseInt(value.slice(i + 1, i + 3), 16));
        i += 2;
      } else {
        bytes.push(value.charCodeAt(i) & 0xff);
      }
    }
    return decodeBytes(bytes, charset);
  }

  function decodeMimeHeader(value) {
    return String(value || '')
      .replace(/\r?\n[\t ]+/g, ' ')
      .replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi, (_match, charset, encoding, encoded) => {
        try {
          if (String(encoding).toLowerCase() === 'b') {
            return decodeBase64MimeWord(encoded, charset);
          }
          return decodeQuotedPrintableMimeWord(encoded, charset);
        } catch {
          return _match;
        }
      })
      .replace(/\s+/g, ' ')
      .trim();
  }

  function getRawHeader(raw, headerName) {
    const escapedName = String(headerName || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = String(raw || '').match(new RegExp(`^${escapedName}:\\s*([^\\r\\n]*(?:\\r?\\n[\\t ][^\\r\\n]*)*)`, 'im'));
    return match ? decodeMimeHeader(match[1]) : '';
  }

  function extractEmailAddress(value) {
    const match = String(value || '').match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
    return match ? match[0].toLowerCase() : String(value || '').trim().toLowerCase();
  }

  function normalizeCloudMailTimestampValue(value) {
    const text = String(value || '').trim();
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)) {
      return `${text.replace(' ', 'T')}Z`;
    }
    return value;
  }

  function extractVerificationCode(text) {
    const normalized = String(text || '');
    const semanticMatch = normalized.match(/(?:code\s*(?:is|:)?|验证码|代码为|verification code)[^\d]{0,24}(\d{6})/i);
    if (semanticMatch) return semanticMatch[1];
    const fallback = normalized.match(/\b(\d{6})\b/);
    return fallback ? fallback[1] : '';
  }

  function normalizeCloudMailItem(item = {}) {
    const raw = String(item.raw || item.source_raw || '');
    const content = decodeMimeHeader(stripHtml(item.content || item.text || item.html || item.body || raw));
    const rawSubject = getRawHeader(raw, 'subject');
    const rawSender = getRawHeader(raw, 'from');
    const rawTo = getRawHeader(raw, 'to');
    const subject = decodeMimeHeader(item.subject || rawSubject);
    const sender = decodeMimeHeader([item.sendName, item.sendEmail, item.from, item.source, rawSender].filter(Boolean).join(' '));
    const toEmail = extractEmailAddress(item.toEmail || item.to || item.address || rawTo);
    const timestamp = parseMailTimestampCandidates([
      item.createdAt,
      item.createTime,
      item.created_at,
      item.sendTime,
      item.timestamp,
      item.date,
    ].map(normalizeCloudMailTimestampValue), { now: Date.now() });
    return {
      raw: item,
      mailId: String(item.emailId || item.id || item.mailId || `${subject}|${timestamp}`),
      sender,
      subject,
      content,
      toEmail,
      timestamp,
      combinedText: [sender, subject, content, raw].filter(Boolean).join('\n'),
    };
  }

  function isOpenAiVerificationMail(mail, step, targetEmail) {
    const target = String(targetEmail || '').trim().toLowerCase();
    if (target && String(mail.toEmail || '').trim().toLowerCase() !== target) {
      return false;
    }
    const text = String(mail.combinedText || '').toLowerCase();
    if (!/(openai|chatgpt)/i.test(text)) {
      return false;
    }
    const subjectProfile = getStepMailMatchProfile(step);
    return matchesSubjectPatterns(mail.subject || mail.combinedText, subjectProfile);
  }

  async function pollCloudMailVerificationCode(options = {}) {
    const config = normalizeCloudMailConfig(options.config || options);
    assertCloudMailConfig(config);
    const email = String(options.email || '').trim();
    if (!email) {
      throw new Error('CloudMail target email is missing.');
    }
    const step = Number.parseInt(String(options.step ?? 4), 10) || 4;
    const maxAttempts = Math.max(1, Number.parseInt(String(options.maxAttempts ?? config.maxAttempts), 10) || config.maxAttempts);
    const intervalMs = Math.max(0, Number.parseInt(String(options.intervalMs ?? config.intervalMs), 10) || config.intervalMs);
    const sleep = typeof options.sleep === 'function'
      ? options.sleep
      : (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const excludedCodes = new Set((options.excludeCodes || []).map((value) => String(value || '').trim()).filter(Boolean));

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      if (typeof options.throwIfStopped === 'function') {
        options.throwIfStopped();
      }
      if (typeof options.onPollStart === 'function') {
        await options.onPollStart({ attempt, maxAttempts });
      }

      let items = [];
      try {
        items = (await fetchCloudMailList(config, email, options)).map(normalizeCloudMailItem);
      } catch (err) {
        if (typeof options.onPollAttempt === 'function') {
          await options.onPollAttempt({
            attempt,
            maxAttempts,
            matchedCount: 0,
            candidateFound: false,
            error: err,
          });
        }
        if (attempt >= maxAttempts) {
          throw err;
        }
        if (intervalMs > 0) {
          await sleep(intervalMs);
        }
        continue;
      }
      const latestMatch = findLatestMatchingItem(items, (mail) => {
        if (!isOpenAiVerificationMail(mail, step, email)) return false;
        if (!isMailFresh(mail.timestamp, {
          now: Date.now(),
          filterAfterTimestamp: options.filterAfterTimestamp || 0,
        })) return false;
        const code = extractVerificationCode(mail.combinedText);
        return Boolean(code) && !excludedCodes.has(code);
      });

      if (typeof options.onPollAttempt === 'function') {
        await options.onPollAttempt({
          attempt,
          maxAttempts,
          matchedCount: latestMatch ? 1 : 0,
          candidateFound: Boolean(latestMatch),
        });
      }

      if (latestMatch) {
        return {
          ok: true,
          code: extractVerificationCode(latestMatch.combinedText),
          emailTimestamp: latestMatch.timestamp,
          mailId: latestMatch.mailId,
        };
      }

      if (attempt < maxAttempts && intervalMs > 0) {
        await sleep(intervalMs);
      }
    }

    throw new Error(`No matching verification email found in CloudMail for ${email}.`);
  }

  async function checkCloudMailConnectivity(configValue = {}, options = {}) {
    await fetchCloudMailList(configValue, 'health-check@example.invalid', { ...options, limit: 1 });
    return {
      ok: true,
      status: 'ok',
      message: 'CloudMail API connected.',
    };
  }

  return {
    checkCloudMailConnectivity,
    createCloudMailEmail,
    fetchCloudMailList,
    generateCloudMailAddress,
    normalizeCloudMailConfig,
    normalizeCloudMailDomains,
    pollCloudMailVerificationCode,
  };
});
