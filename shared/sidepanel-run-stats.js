(function(root, factory) {
  const exports = factory(
    root.AutoRunFailureStats
  );

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = exports;
  }

  root.SidepanelRunStats = exports;
})(typeof globalThis !== 'undefined' ? globalThis : self, function(AutoRunFailureStats) {
  const {
    normalizeAutoRunStats,
    summarizeAutoRunFailureBuckets,
  } = AutoRunFailureStats || require('./auto-run-failure-stats.js');

  function escapeHtml(value) {
    return String(value || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function formatRunStatsAverageDuration(stats = {}) {
    const normalizedStats = normalizeAutoRunStats(stats);
    if (normalizedStats.successfulRuns <= 0 || normalizedStats.totalSuccessfulDurationMs <= 0) {
      return '--';
    }

    const averageMs = Math.round(normalizedStats.totalSuccessfulDurationMs / normalizedStats.successfulRuns);
    const totalSeconds = Math.max(0, Math.round(averageMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function formatElapsedDuration(durationMs) {
    const normalizedDurationMs = Number.isFinite(durationMs) ? Math.max(0, durationMs) : 0;
    const totalSeconds = Math.max(0, Math.floor(normalizedDurationMs / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const pad = (value) => String(value).padStart(2, '0');

    if (hours > 0) {
      return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    }
    return `${pad(minutes)}:${pad(seconds)}`;
  }

  function buildRunStatsSummaryHtml(stats = {}) {
    const normalizedStats = normalizeAutoRunStats(stats);
    return `
      <span class="run-stat-text success">成功 ${normalizedStats.successfulRuns} · 均时 ${escapeHtml(formatRunStatsAverageDuration(normalizedStats))}</span>
      <span class="run-stat-text failure">错误 ${normalizedStats.failedRuns}</span>
    `;
  }

  function buildRunSuccessSummaryHtml(stats = {}) {
    const normalizedStats = normalizeAutoRunStats(stats);
    return `<span class="run-stat-text success">成功 ${normalizedStats.successfulRuns} · 均时 ${escapeHtml(formatRunStatsAverageDuration(normalizedStats))}</span>`;
  }

  function buildRunFailureSummaryHtml(stats = {}) {
    const normalizedStats = normalizeAutoRunStats(stats);
    return `<span class="run-stat-text failure">错误 ${normalizedStats.failedRuns}</span>`;
  }

  function buildTargetMailboxTimerHtml(lastTargetEmailAcquiredAt, options = {}) {
    const now = Number.isFinite(options?.now) ? options.now : Date.now();
    const normalizedTimestamp = Number.isFinite(lastTargetEmailAcquiredAt) && lastTargetEmailAcquiredAt > 0
      ? lastTargetEmailAcquiredAt
      : 0;
    const elapsedLabel = normalizedTimestamp > 0 && now >= normalizedTimestamp
      ? formatElapsedDuration(now - normalizedTimestamp)
      : '--';

    return `<span class="run-stat-text failure-meta">距上次刷到目标邮箱：${escapeHtml(elapsedLabel)}</span>`;
  }

  function getRecentSuccessDisplayEntries(stats = {}) {
    const normalizedStats = normalizeAutoRunStats(stats);
    return normalizedStats.recentSuccessDurationsMs.map((durationMs, index) => ({
      durationMs,
      mode: normalizedStats.recentSuccessEntries[index]?.mode || 'unknown',
    }));
  }

  function groupSuccessEntriesByMode(entries = []) {
    const groups = {
      api: [],
      simulated: [],
      unknown: [],
    };

    for (const entry of entries) {
      const mode = entry?.mode === 'api' || entry?.mode === 'simulated' ? entry.mode : 'unknown';
      groups[mode].push(entry);
    }

    return groups;
  }

  function buildSuccessModeCard(title, entries = [], cssSuffix = '') {
    if (!entries.length) {
      return '';
    }

    const totalDurationMs = entries.reduce((sum, entry) => sum + (Number(entry.durationMs) || 0), 0);
    const averageDuration = formatRunStatsAverageDuration({
      successfulRuns: entries.length,
      totalSuccessfulDurationMs: totalDurationMs,
    });

    return `
      <div class="run-success-mode-card${cssSuffix ? ` run-success-mode-card-${cssSuffix}` : ''}">
        <div class="run-success-mode-head">
          <span class="run-success-mode-title">${escapeHtml(title)} 平均 ${escapeHtml(averageDuration)}</span>
        </div>
        <div class="run-success-chip-list">
          ${entries.map((entry) => `
            <span class="run-success-chip">${escapeHtml(formatRunStatsAverageDuration({
              successfulRuns: 1,
              totalSuccessfulDurationMs: entry.durationMs,
            }))}</span>
          `).join('')}
        </div>
      </div>
    `;
  }

  function buildRunSuccessDetailsHtml(stats = {}) {
    const successEntries = getRecentSuccessDisplayEntries(stats);
    if (!successEntries.length) {
      return '<div class="run-success-empty">暂无成功记录</div>';
    }

    const groupedEntries = groupSuccessEntriesByMode(successEntries);
    const modeCards = [
      buildSuccessModeCard('API', groupedEntries.api, 'api'),
      buildSuccessModeCard('模拟操作', groupedEntries.simulated, 'simulated'),
    ].filter(Boolean).join('');

    const recentFallbackCard = groupedEntries.unknown.length
      ? `
        <div class="run-success-mode-card run-success-mode-card-recent">
          <div class="run-success-mode-head">
            <span class="run-success-mode-title">最近成功 ${groupedEntries.unknown.length} 条</span>
          </div>
          <div class="run-success-chip-list">
            ${groupedEntries.unknown.map((entry) => `
              <span class="run-success-chip">${escapeHtml(formatRunStatsAverageDuration({
                successfulRuns: 1,
                totalSuccessfulDurationMs: entry.durationMs,
              }))}</span>
            `).join('')}
          </div>
        </div>
      `
      : '';

    return `
      <div class="run-success-list-label">最近 20 次成功耗时</div>
      <div class="run-success-mode-grid">
        ${modeCards}
        ${recentFallbackCard}
      </div>
    `;
  }

  function buildRunStatsDetailsHtml(stats = {}) {
    const buckets = summarizeAutoRunFailureBuckets(stats);
    if (!buckets.length) {
      return '<div class="run-failure-empty">暂无失败记录</div>';
    }

    return buckets.map((bucket) => {
      const stepLabel = bucket.step > 0 ? `Step ${bucket.step}` : '流程级';

      return `
        <div class="run-failure-card">
          <div class="run-failure-head">
            <span class="run-failure-step">${escapeHtml(stepLabel)}</span>
            <span class="run-failure-count">${bucket.count} 次</span>
          </div>
          <div class="run-failure-reason">${escapeHtml(bucket.reason)}</div>
          <div class="run-failure-meta">最近发生：${escapeHtml(bucket.lastRunLabel || '未知轮次')}</div>
        </div>
      `;
    }).join('');
  }

  function normalizeDisplayedAutoRunStats(stats = {}) {
    return normalizeAutoRunStats(stats);
  }

  return {
    buildTargetMailboxTimerHtml,
    buildRunFailureSummaryHtml,
    buildRunSuccessDetailsHtml,
    buildRunSuccessSummaryHtml,
    buildRunStatsSummaryHtml,
    buildRunStatsDetailsHtml,
    formatElapsedDuration,
    formatRunStatsAverageDuration,
    normalizeDisplayedAutoRunStats,
  };
});
