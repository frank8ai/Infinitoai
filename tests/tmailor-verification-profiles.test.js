const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildManualTmailorCodeFetchConfig,
  inferTmailorManualFetchStep,
  getTmailorVerificationProfile,
} = require('../shared/tmailor-verification-profiles.js');

test('inferTmailorManualFetchStep uses the signup profile before login begins', () => {
  assert.equal(inferTmailorManualFetchStep(0), 4);
  assert.equal(inferTmailorManualFetchStep(4), 4);
  assert.equal(inferTmailorManualFetchStep(5), 4);
});

test('inferTmailorManualFetchStep switches to the login profile once oauth login starts', () => {
  assert.equal(inferTmailorManualFetchStep(6), 7);
  assert.equal(inferTmailorManualFetchStep(7), 7);
  assert.equal(inferTmailorManualFetchStep(9), 7);
});

test('getTmailorVerificationProfile returns the expected sender and subject filters', () => {
  assert.deepEqual(
    getTmailorVerificationProfile(4),
    {
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', '認証', '確認', 'コード'],
    }
  );

  assert.deepEqual(
    getTmailorVerificationProfile(7),
    {
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', 'login', '認証', '確認', 'コード', 'ログイン'],
    }
  );
});

test('buildManualTmailorCodeFetchConfig keeps signup code fetch permissive for the current mailbox', () => {
  assert.deepEqual(
    buildManualTmailorCodeFetchConfig({
      currentStep: 4,
      rejectedCodes: ['654321'],
      targetEmail: 'fresh@example.com',
      signupCode: '123456',
    }),
    {
      step: 4,
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', '認証', '確認', 'コード'],
      targetEmail: 'fresh@example.com',
      filterAfterTimestamp: 0,
      excludeCodes: ['654321'],
      maxAttempts: 6,
      intervalMs: 2500,
    }
  );
});

test('buildManualTmailorCodeFetchConfig excludes the used signup code when fetching login mail again', () => {
  assert.deepEqual(
    buildManualTmailorCodeFetchConfig({
      currentStep: 7,
      rejectedCodes: ['654321'],
      targetEmail: 'fresh@example.com',
      signupCode: '123456',
    }),
    {
      step: 7,
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', 'login', '認証', '確認', 'コード', 'ログイン'],
      targetEmail: 'fresh@example.com',
      filterAfterTimestamp: 0,
      excludeCodes: ['123456', '654321'],
      maxAttempts: 6,
      intervalMs: 2500,
    }
  );
});
