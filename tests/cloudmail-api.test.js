const test = require('node:test');
const assert = require('node:assert/strict');

const {
  generateCloudMailAddress,
  createCloudMailEmail,
  normalizeCloudMailConfig,
  normalizeCloudMailDomains,
  pollCloudMailVerificationCode,
} = require('../shared/cloudmail-api.js');

function createJsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async text() {
      return JSON.stringify(body);
    },
  };
}

test('normalizeCloudMailDomains accepts comma, newline, arrays, and strips @ prefixes', () => {
  assert.deepEqual(
    normalizeCloudMailDomains(' @finchaintalk.com, temp-email-api.bitpowerhub.com\nBitPowerHub.com '),
    ['finchaintalk.com', 'temp-email-api.bitpowerhub.com', 'bitpowerhub.com'],
  );

  assert.deepEqual(
    normalizeCloudMailDomains(['alpha.example.com', '@beta.example.com', 'alpha.example.com']),
    ['alpha.example.com', 'beta.example.com'],
  );
});

test('generateCloudMailAddress uses the configured domain pool', () => {
  const config = normalizeCloudMailConfig({
    baseUrl: ' https://mail.example.com/ ',
    adminEmail: 'admin@example.com',
    adminPassword: 'secret',
    domains: 'finchaintalk.com,temp-email-api.bitpowerhub.com',
  });

  const email = generateCloudMailAddress(config, {
    randomFn: () => 0.1,
    now: 1712668800123,
  });

  assert.equal(config.baseUrl, 'https://mail.example.com');
  assert.equal(email, 'ccccddd7sr@finchaintalk.com');
});

test('createCloudMailEmail creates an address through the self-hosted admin API', async () => {
  const calls = [];
  const result = await createCloudMailEmail({
    baseUrl: 'https://mail.example.com',
    adminPassword: 'secret',
    domains: 'finchaintalk.com',
  }, {
    localPart: 'duckbridge01',
    fetchImpl: async (url, options = {}) => {
      calls.push({ url, options });
      assert.equal(options.headers['x-admin-auth'], 'secret');
      assert.deepEqual(JSON.parse(options.body), {
        enablePrefix: false,
        enableRandomSubdomain: false,
        name: 'duckbridge01',
        domain: 'finchaintalk.com',
      });
      return createJsonResponse({
        address: 'duckbridge01@finchaintalk.com',
        jwt: 'jwt-1',
        id: 'addr-1',
      });
    },
  });

  assert.equal(result.email, 'duckbridge01@finchaintalk.com');
  assert.equal(result.jwt, 'jwt-1');
  assert.equal(calls[0].url, 'https://mail.example.com/admin/new_address');
});

test('createCloudMailEmail uses the configured fixed mailbox address when present', async () => {
  const result = await createCloudMailEmail({
    baseUrl: 'https://mail.example.com',
    adminEmail: 'm1n1ewx@coffeejadore.com',
    adminPassword: 'secret',
    domains: 'coffeejadore.com',
  }, {
    fetchImpl: async (_url, options = {}) => {
      assert.deepEqual(JSON.parse(options.body), {
        enablePrefix: false,
        enableRandomSubdomain: false,
        name: 'm1n1ewx',
        domain: 'coffeejadore.com',
      });
      return createJsonResponse({
        address: 'm1n1ewx@coffeejadore.com',
      });
    },
  });

  assert.equal(result.email, 'm1n1ewx@coffeejadore.com');
});

test('createCloudMailEmail retries the next configured domain after a rejected domain', async () => {
  const requestedDomains = [];
  const result = await createCloudMailEmail({
    baseUrl: 'https://mail.example.com',
    adminPassword: 'secret',
    domains: 'bad.example.com,good.example.com',
  }, {
    localPart: 'duckbridge02',
    fetchImpl: async (_url, options = {}) => {
      const body = JSON.parse(options.body);
      requestedDomains.push(body.domain);
      if (body.domain === 'bad.example.com') {
        return createJsonResponse({ error: 'invalid domain' }, 400);
      }
      return createJsonResponse({
        address: 'duckbridge02@good.example.com',
        jwt: 'jwt-2',
        id: 'addr-2',
      });
    },
  });

  assert.equal(result.email, 'duckbridge02@good.example.com');
  assert.deepEqual(requestedDomains, ['bad.example.com', 'good.example.com']);
});

test('createCloudMailEmail exposes the worker error message when all domains are rejected', async () => {
  await assert.rejects(
    () => createCloudMailEmail({
      baseUrl: 'https://mail.example.com',
      adminPassword: 'secret',
      domains: 'coffeejadore.com',
    }, {
      localPart: 'm1n1ewx',
      fetchImpl: async () => createJsonResponse({ error: 'Invalid domain' }, 400),
    }),
    /Invalid domain/i,
  );
});

test('createCloudMailEmail can request CloudMail managed random subdomains', async () => {
  const result = await createCloudMailEmail({
    baseUrl: 'https://mail.example.com',
    adminPassword: 'secret',
    domains: 'alpha.yzw.io',
    enableRandomSubdomain: true,
  }, {
    localPart: 'duckbridge03',
    fetchImpl: async (_url, options = {}) => {
      assert.deepEqual(JSON.parse(options.body), {
        enablePrefix: false,
        enableRandomSubdomain: true,
        name: 'duckbridge03',
        domain: 'alpha.yzw.io',
      });
      return createJsonResponse({
        address: 'duckbridge03.random1.alpha.yzw.io',
      });
    },
  });

  assert.equal(result.email, 'duckbridge03.random1.alpha.yzw.io');
});

test('pollCloudMailVerificationCode polls newest matching OpenAI mail through the admin API and skips excluded codes', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-04-18T08:02:00Z');
  try {
    const calls = [];
    const fetchImpl = async (url, options = {}) => {
      calls.push({ url, options });
      if (url.includes('/admin/mails?')) {
        assert.equal(options.headers['x-admin-auth'], 'secret');
        assert.match(url, /address=target%40finchaintalk\.com/);
        return createJsonResponse({
          results: [
            {
              id: 'mail-1',
              source: 'noreply@openai.com',
              address: 'target@finchaintalk.com',
              subject: 'Your OpenAI code is 111111',
              text: 'Your OpenAI verification code is 111111',
              createdAt: '2026-04-18T08:00:00Z',
            },
            {
              id: 'mail-2',
              source: 'noreply@openai.com',
              address: 'target@finchaintalk.com',
              subject: 'Your OpenAI code is 222222',
              text: 'Your OpenAI verification code is 222222',
              createdAt: '2026-04-18T08:01:00Z',
            },
          ],
        });
      }
      throw new Error(`unexpected url: ${url}`);
    };

    const result = await pollCloudMailVerificationCode({
      config: {
        baseUrl: 'https://mail.example.com',
        adminPassword: 'secret',
      },
      email: 'target@finchaintalk.com',
      step: 7,
      excludeCodes: ['111111'],
      maxAttempts: 1,
      fetchImpl,
    });

    assert.equal(result.code, '222222');
    assert.equal(result.mailId, 'mail-2');
    assert.equal(calls.length, 1);
  } finally {
    Date.now = originalNow;
  }
});

test('pollCloudMailVerificationCode decodes CloudMail raw MIME subject headers', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-04-18T04:32:00Z');
  try {
    const result = await pollCloudMailVerificationCode({
      config: {
        baseUrl: 'https://mail.example.com',
        adminPassword: 'secret',
      },
      email: 'target@finchaintalk.com',
      step: 4,
      maxAttempts: 1,
      fetchImpl: async (url) => {
        assert.match(url, /address=target%40finchaintalk\.com/);
        return createJsonResponse({
          results: [
            {
              id: 'mail-raw-1',
              source: 'bounces@example.com',
              address: 'target@finchaintalk.com',
              raw: [
                'From: no-reply@tm.openai.com',
                'To: target@finchaintalk.com',
                'Subject: =?UTF-8?B?5L2g55qEIE9wZW5BSSDku6PnoIHkuLo=?= 074060',
                'Date: Sat, 18 Apr 2026 04:31:18 +0000',
                '',
                'OpenAI verification mail',
              ].join('\r\n'),
              created_at: '2026-04-18 04:31:18',
            },
          ],
        });
      },
    });

    assert.equal(result.code, '074060');
    assert.equal(result.mailId, 'mail-raw-1');
  } finally {
    Date.now = originalNow;
  }
});

test('pollCloudMailVerificationCode accepts temporary Chinese OpenAI raw MIME and ignores header timestamps', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-04-23T12:26:00Z');
  try {
    const result = await pollCloudMailVerificationCode({
      config: {
        baseUrl: 'https://mail.example.com',
        adminPassword: 'secret',
      },
      email: 'target@alpha.finchaintalk.com',
      step: 4,
      maxAttempts: 1,
      fetchImpl: async (url) => {
        assert.match(url, /address=target%40alpha\.finchaintalk\.com/);
        return createJsonResponse({
          results: [
            {
              id: 'mail-raw-cn',
              source: 'bounces+target=alpha.finchaintalk.com@em7877.tm.openai.com',
              address: 'target@alpha.finchaintalk.com',
              raw: [
                'Received: by recvd-service 2026-04-23 12:21:34.746 +0000',
                'From: noreply@tm.openai.com',
                'To: target@alpha.finchaintalk.com',
                'Subject: =?UTF-8?B?5oKo55qE5Li05pe2T3BlbkFJ6aqM6K+B56CB?=',
                'Content-Transfer-Encoding: quoted-printable',
                'Content-Type: text/html; charset=utf-8',
                '',
                '<p>=E8=BE=93=E5=85=A5=E6=AD=A4=E4=B8=B4=E6=97=B6=E9=AA=8C=E8=AF=81=E7=A0=81=E4=BB=A5=E7=BB=AD=EF=BC=9A</p>',
                '<p>533267</p>',
              ].join('\r\n'),
              created_at: '2026-04-23 12:21:35',
            },
          ],
        });
      },
    });

    assert.equal(result.code, '533267');
    assert.equal(result.mailId, 'mail-raw-cn');
  } finally {
    Date.now = originalNow;
  }
});

test('pollCloudMailVerificationCode separates signup and login temporary Chinese mails', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-04-23T12:26:00Z');
  try {
    const fetchImpl = async () => createJsonResponse({
      results: [
        {
          id: 'login-mail',
          source: 'bounces+target=alpha.finchaintalk.com@em7877.tm.openai.com',
          address: 'target@alpha.finchaintalk.com',
          raw: [
            'From: noreply@tm.openai.com',
            'To: target@alpha.finchaintalk.com',
            'Subject: =?UTF-8?B?5L2g55qE5Li05pe2IENoYXRHUFQg55m75b2V5Luj56CB?=',
            'Content-Transfer-Encoding: quoted-printable',
            'Content-Type: text/html; charset=utf-8',
            '',
            '<p>=E8=BE=93=E5=85=A5=E6=AD=A4=E4=B8=B4=E6=97=B6=E9=AA=8C=E8=AF=81=E7=A0=81=E4=BB=A5=E7=BB=AD=EF=BC=9A</p>',
            '<p>287599</p>',
          ].join('\r\n'),
          created_at: '2026-04-23 12:25:10',
        },
        {
          id: 'signup-mail',
          source: 'bounces+target=alpha.finchaintalk.com@em7877.tm.openai.com',
          address: 'target@alpha.finchaintalk.com',
          raw: [
            'From: noreply@tm.openai.com',
            'To: target@alpha.finchaintalk.com',
            'Subject: =?UTF-8?B?5oKo55qE5Li05pe2T3BlbkFJ6aqM6K+B56CB?=',
            'Content-Transfer-Encoding: quoted-printable',
            'Content-Type: text/html; charset=utf-8',
            '',
            '<p>=E8=BE=93=E5=85=A5=E6=AD=A4=E4=B8=B4=E6=97=B6=E9=AA=8C=E8=AF=81=E7=A0=81=E4=BB=A5=E7=BB=AD=EF=BC=9A</p>',
            '<p>533267</p>',
          ].join('\r\n'),
          created_at: '2026-04-23 12:21:35',
        },
      ],
    });
    const config = {
      baseUrl: 'https://mail.example.com',
      adminPassword: 'secret',
    };

    const signupResult = await pollCloudMailVerificationCode({
      config,
      email: 'target@alpha.finchaintalk.com',
      step: 4,
      maxAttempts: 1,
      fetchImpl,
    });
    const loginResult = await pollCloudMailVerificationCode({
      config,
      email: 'target@alpha.finchaintalk.com',
      step: 7,
      maxAttempts: 1,
      fetchImpl,
    });

    assert.equal(signupResult.code, '533267');
    assert.equal(signupResult.mailId, 'signup-mail');
    assert.equal(loginResult.code, '287599');
    assert.equal(loginResult.mailId, 'login-mail');
  } finally {
    Date.now = originalNow;
  }
});

test('pollCloudMailVerificationCode reports no matching mail after polling', async () => {
  let listCalls = 0;
  await assert.rejects(
    () => pollCloudMailVerificationCode({
      config: {
        baseUrl: 'https://mail.example.com',
        adminPassword: 'secret',
      },
      email: 'target@finchaintalk.com',
      maxAttempts: 2,
      intervalMs: 1,
      sleep: async () => {},
      fetchImpl: async (url) => {
        listCalls += 1;
        assert.match(url, /\/admin\/mails\?/);
        return createJsonResponse({ results: [] });
      },
    }),
    /No matching verification email found/i,
  );
  assert.equal(listCalls, 2);
});

test('pollCloudMailVerificationCode retries transient list fetch failures', async () => {
  const originalNow = Date.now;
  Date.now = () => Date.parse('2026-04-18T08:02:00Z');
  try {
    let listCalls = 0;
    const result = await pollCloudMailVerificationCode({
      config: {
        baseUrl: 'https://mail.example.com',
        adminPassword: 'secret',
      },
      email: 'target@finchaintalk.com',
      maxAttempts: 2,
      intervalMs: 1,
      sleep: async () => {},
      fetchImpl: async () => {
        listCalls += 1;
        if (listCalls === 1) {
          throw new Error('Failed to fetch');
        }
        return createJsonResponse({
          results: [
            {
              id: 'mail-1',
              source: 'noreply@openai.com',
              address: 'target@finchaintalk.com',
              subject: 'Your OpenAI code is 333333',
              text: 'Your OpenAI verification code is 333333',
              createdAt: '2026-04-18T08:01:00Z',
            },
          ],
        });
      },
    });

    assert.equal(result.code, '333333');
    assert.equal(listCalls, 2);
  } finally {
    Date.now = originalNow;
  }
});
