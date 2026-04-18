const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildTargetMailboxTimerHtml,
  buildRunStatsDetailsHtml,
  buildRunFailureSummaryHtml,
  buildRunSuccessDetailsHtml,
  buildRunSuccessSummaryHtml,
  formatRunStatsAverageDuration,
  normalizeDisplayedAutoRunStats,
} = require('../shared/sidepanel-run-stats.js');

test('buildRunStatsDetailsHtml renders an empty state when there are no failure buckets', () => {
  const html = buildRunStatsDetailsHtml({ successfulRuns: 3, failedRuns: 0, failureBuckets: [] });
  assert.match(html, /暂无失败记录/);
});

test('buildRunSuccessSummaryHtml renders success count with average duration', () => {
  const html = buildRunSuccessSummaryHtml({
    successfulRuns: 3,
    totalSuccessfulDurationMs: 93000,
  });

  assert.match(html, /run-stat-text success/);
  assert.match(html, /成功 3/);
  assert.match(html, /均时 00:31/);
  assert.doesNotMatch(html, /run-stat-pill/);
});

test('buildRunFailureSummaryHtml renders total error count', () => {
  const html = buildRunFailureSummaryHtml({
    failedRuns: 2,
  });

  assert.match(html, /run-stat-text failure/);
  assert.match(html, /错误 2/);
  assert.doesNotMatch(html, /run-stat-pill/);
});

test('buildRunSuccessDetailsHtml renders recent successful durations in descending recency order', () => {
  const html = buildRunSuccessDetailsHtml({
    recentSuccessDurationsMs: [61000, 48000, 3050],
    recentSuccessEntries: [
      { durationMs: 61000, mode: 'api' },
      { durationMs: 48000, mode: 'simulated' },
      { durationMs: 3050, mode: 'unknown' },
    ],
  });

  assert.match(html, /run-success-mode-card/);
  assert.match(html, /API 平均/);
  assert.match(html, /模拟操作 平均/);
  assert.equal((html.match(/API/g) || []).length, 1);
  assert.equal((html.match(/模拟操作/g) || []).length, 1);
  assert.match(html, /01:01/);
  assert.match(html, /00:48/);
  assert.match(html, /00:03/);
  assert.match(html, /run-success-chip-list/);
  assert.doesNotMatch(html, /run-success-mode-average/);
  assert.doesNotMatch(html, /run-success-rank/);
});

test('buildRunSuccessDetailsHtml groups recent success durations by mode and keeps unknown entries in a recent card', () => {
  const html = buildRunSuccessDetailsHtml({
    recentSuccessDurationsMs: [61000, 55000, 48000, 3050],
    recentSuccessEntries: [
      { durationMs: 61000, mode: 'api' },
      { durationMs: 55000, mode: 'api' },
      { durationMs: 48000, mode: 'simulated' },
      { durationMs: 3050, mode: 'unknown' },
    ],
  });

  assert.match(html, /API 平均 00:58/);
  assert.match(html, /模拟操作 平均 00:48/);
  assert.match(html, /最近成功/);
});

test('buildRunStatsDetailsHtml renders grouped failure stats without nested recent-log sections', () => {
  const html = buildRunStatsDetailsHtml({
    successfulRuns: 1,
    failedRuns: 3,
    failureBuckets: [
      {
        key: 'step-7::code',
        step: 7,
        reason: 'Could not find verification code input',
        count: 2,
        lastRunLabel: '8/∞',
        lastSeenAt: 200,
        recentLogs: [
          'Run 8 failed: Step 7 failed: Could not find verification code input.',
          'Run 5 failed: Step 7 failed: Could not find verification code input.',
        ],
      },
      {
        key: 'step-4::mail',
        step: 4,
        reason: 'No matching verification email found on TMailor after 20 attempts',
        count: 1,
        lastRunLabel: '4/∞',
        lastSeenAt: 100,
        recentLogs: [
          'Run 4 failed: Step 4 failed: No matching verification email found on TMailor after 20 attempts.',
        ],
      },
    ],
  });

  assert.match(html, /Step 7/);
  assert.match(html, /Could not find verification code input/);
  assert.match(html, /2 次/);
  assert.match(html, /Step 4/);
  assert.match(html, /最近发生：8\/∞/);
  assert.doesNotMatch(html, /最近日志/);
  assert.doesNotMatch(html, /Run 8 failed/);
});

test('buildRunStatsDetailsHtml renders run-level failures as plain cards without Step question marks', () => {
  const html = buildRunStatsDetailsHtml({
    successfulRuns: 0,
    failedRuns: 2,
    failureBuckets: [
      {
        key: 'step-unknown::content-script-timeout',
        step: 0,
        reason: 'Content script on tmailor-mail did not respond in 25s. Try refreshing the tab and retry',
        count: 2,
        lastRunLabel: '4/∞',
        lastSeenAt: 300,
        recentLogs: [
          'Run 4/∞ failed: Content script on tmailor-mail did not respond in 25s. Try refreshing the tab and retry.',
        ],
      },
    ],
  });

  assert.match(html, /<div class="run-failure-card">/);
  assert.match(html, /流程级/);
  assert.doesNotMatch(html, /Step \?/);
  assert.match(html, /run-failure-head/);
  assert.doesNotMatch(html, /最近日志/);
});

test('normalizeDisplayedAutoRunStats keeps grouped failure buckets from auto-run status payloads', () => {
  const stats = normalizeDisplayedAutoRunStats({
    successfulRuns: '2',
    failedRuns: '1',
    totalSuccessfulDurationMs: '62000',
    recentSuccessDurationsMs: ['31000', '30000'],
    recentSuccessEntries: [
      { durationMs: '31000', mode: 'api' },
      { durationMs: '30000', mode: 'simulated' },
    ],
    failureBuckets: [
      {
        key: 'step-4::mail',
        step: 4,
        reason: 'No matching verification email found on TMailor after N attempts',
        count: 1,
        lastRunLabel: '2/∞',
        lastSeenAt: 1710000000000,
        recentLogs: ['Run 2/∞ failed: Step 4 failed: No matching verification email found on TMailor after 20 attempts.'],
      },
    ],
  });

  assert.deepEqual(stats, {
    successfulRuns: 2,
    failedRuns: 1,
    totalSuccessfulDurationMs: 62000,
    recentSuccessDurationsMs: [31000, 30000],
    recentSuccessEntries: [
      { durationMs: 31000, mode: 'api' },
      { durationMs: 30000, mode: 'simulated' },
    ],
    failureBuckets: [
      {
        key: 'step-4::mail',
        step: 4,
        reason: 'No matching verification email found on TMailor after N attempts',
        count: 1,
        lastRunLabel: '2/∞',
        lastSeenAt: 1710000000000,
        recentLogs: ['Run 2/∞ failed: Step 4 failed: No matching verification email found on TMailor after 20 attempts.'],
      },
    ],
  });
});

test('formatRunStatsAverageDuration returns a placeholder when there is no successful run', () => {
  assert.equal(formatRunStatsAverageDuration({ successfulRuns: 0, totalSuccessfulDurationMs: 9999 }), '--');
});

test('buildRunSuccessDetailsHtml renders an empty state when there are no successful runs yet', () => {
  const html = buildRunSuccessDetailsHtml({ recentSuccessDurationsMs: [] });
  assert.match(html, /暂无成功记录/);
});

test('buildTargetMailboxTimerHtml renders elapsed time since the last acquired target mailbox', () => {
  const html = buildTargetMailboxTimerHtml(1710000000000, { now: 1710000065000 });

  assert.match(html, /距上次刷到目标邮箱：01:05/);
  assert.match(html, /run-stat-text failure-meta/);
});

test('buildTargetMailboxTimerHtml renders a placeholder when no target mailbox time is available', () => {
  const html = buildTargetMailboxTimerHtml(null, { now: 1710000065000 });

  assert.match(html, /距上次刷到目标邮箱：--/);
});
