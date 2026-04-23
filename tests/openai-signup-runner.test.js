const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  buildAccountRecord,
  appendAccountRecord,
  generatePassword,
} = require('../tools/openai-signup-runner.js');

test('buildAccountRecord preserves signup account credentials and status', () => {
  const record = buildAccountRecord({
    email: 'test@alpha.finchaintalk.com',
    password: 'Aa2!example123',
    domain: 'alpha.finchaintalk.com',
    signupCode: '123456',
    status: 'completed_platform_entry',
    finalUrl: 'https://platform.openai.com/welcome?step=create',
    artifacts: 'playwright-debug-artifacts/openai-signup-runner',
    events: [{ step: 'mailbox_created' }],
    now: '2026-04-23T12:00:00.000Z',
  });

  assert.equal(record.email, 'test@alpha.finchaintalk.com');
  assert.equal(record.password, 'Aa2!example123');
  assert.equal(record.domain, 'alpha.finchaintalk.com');
  assert.equal(record.signupCode, '123456');
  assert.equal(record.status, 'completed_platform_entry');
  assert.equal(record.finalUrl, 'https://platform.openai.com/welcome?step=create');
  assert.equal(record.createdAt, '2026-04-23T12:00:00.000Z');
  assert.deepEqual(record.events, [{ step: 'mailbox_created' }]);
});

test('appendAccountRecord writes jsonl records and creates the parent directory', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openai-signup-runner-'));
  const outputPath = path.join(dir, 'nested', 'accounts.jsonl');
  const record = buildAccountRecord({
    email: 'test@alpha.finchaintalk.com',
    password: 'Aa2!example123',
    status: 'created',
    now: '2026-04-23T12:00:00.000Z',
  });

  appendAccountRecord(record, outputPath);

  const lines = fs.readFileSync(outputPath, 'utf8').trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), record);
});

test('generatePassword includes required character classes', () => {
  const password = generatePassword(() => 0);

  assert.match(password, /[A-Z]/);
  assert.match(password, /[a-z]/);
  assert.match(password, /\d/);
  assert.match(password, /[!@#$%&*?]/);
  assert.ok(password.length >= 14);
});
