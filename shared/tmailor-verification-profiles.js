(function(root, factory) {
  const exports = factory();

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.TmailorVerificationProfiles = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function() {
  function getDeps() {
    const holder = typeof globalThis !== 'undefined' ? globalThis : self;
    return {
      LoginVerificationCodes: holder.LoginVerificationCodes || null,
    };
  }

  function loadNodeDeps() {
    if (typeof require !== 'function') {
      return {};
    }

    try {
      return {
        LoginVerificationCodes: require('./login-verification-codes.js'),
      };
    } catch {
      return {};
    }
  }

  const deps = { ...loadNodeDeps(), ...getDeps() };
  const LoginVerificationCodes = deps.LoginVerificationCodes;

  const mergeLoginVerificationCodeExclusions = LoginVerificationCodes?.mergeLoginVerificationCodeExclusions || function({ signupCode = '' } = {}) {
    return /^\d{6}$/.test(String(signupCode || '').trim()) ? [String(signupCode).trim()] : [];
  };

  const TMAILOR_VERIFICATION_PROFILES = {
    4: {
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', '認証', '確認', 'コード'],
    },
    7: {
      senderFilters: ['openai', 'noreply', 'verify', 'auth', 'chatgpt', 'duckduckgo', 'forward'],
      subjectFilters: ['verify', 'verification', 'code', '验证', 'confirm', 'login', '認証', '確認', 'コード', 'ログイン'],
    },
  };

  function inferTmailorManualFetchStep(currentStep) {
    const step = Number.parseInt(String(currentStep ?? 0), 10) || 0;
    return step >= 6 ? 7 : 4;
  }

  function normalizeVerificationProfileStep(step) {
    const numericStep = Number.parseInt(String(step ?? 0), 10) || 0;
    return numericStep >= 7 ? 7 : 4;
  }

  function getTmailorVerificationProfile(step) {
    const normalizedStep = normalizeVerificationProfileStep(step);
    const profile = TMAILOR_VERIFICATION_PROFILES[normalizedStep];
    return {
      senderFilters: [...(profile?.senderFilters || [])],
      subjectFilters: [...(profile?.subjectFilters || [])],
    };
  }

  function normalizeRejectedCodes(codes = []) {
    const result = [];
    for (const code of codes || []) {
      const normalized = String(code || '').trim();
      if (/^\d{6}$/.test(normalized) && !result.includes(normalized)) {
        result.push(normalized);
      }
    }
    return result;
  }

  function buildManualTmailorCodeFetchConfig({ currentStep = 0, targetEmail = '', signupCode = '', rejectedCodes = [] } = {}) {
    const step = inferTmailorManualFetchStep(currentStep);
    const profile = getTmailorVerificationProfile(step);
    const normalizedRejectedCodes = normalizeRejectedCodes(rejectedCodes);
    return {
      step,
      ...profile,
      targetEmail: String(targetEmail || '').trim(),
      filterAfterTimestamp: 0,
      excludeCodes: step === 7
        ? mergeLoginVerificationCodeExclusions({
          signupCode,
          rejectedCodes: normalizedRejectedCodes,
        })
        : normalizedRejectedCodes,
      maxAttempts: 6,
      intervalMs: 2500,
    };
  }

  return {
    buildManualTmailorCodeFetchConfig,
    getTmailorVerificationProfile,
    inferTmailorManualFetchStep,
  };
});
