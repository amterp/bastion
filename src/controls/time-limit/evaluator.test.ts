import { describe, it, expect } from 'vitest';
import { timeLimitEvaluator } from './evaluator.js';
import type { TimeLimitConfig } from '../../shared/types.js';
import { emptySiteTrackingData } from '../../storage/schema.js';

const MINUTE = 60_000;
const now = Date.now();

function makeConfig(overrides: Partial<TimeLimitConfig> = {}): TimeLimitConfig {
  return {
    type: 'time-limit',
    enabled: true,
    maxMinutes: 30,
    windowMinutes: 120,
    ...overrides,
  };
}

describe('timeLimitEvaluator', () => {
  it('allows when no time has been spent', () => {
    const tracking = emptySiteTrackingData();
    const result = timeLimitEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('allow');
  });

  it('allows when under the limit', () => {
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [
      { start: now - 20 * MINUTE, end: now - 10 * MINUTE }, // 10 min
    ];
    const result = timeLimitEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('allow');
  });

  it('blocks when at the limit', () => {
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [
      { start: now - 60 * MINUTE, end: now - 30 * MINUTE }, // 30 min = limit
    ];
    const result = timeLimitEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('block');
    expect(result.reason).toContain('30m');
  });

  it('blocks when over the limit', () => {
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [
      { start: now - 40 * MINUTE, end: now - 5 * MINUTE }, // 35 min
    ];
    const result = timeLimitEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('block');
  });

  it('provides a resetsAt timestamp', () => {
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [
      { start: now - 60 * MINUTE, end: now - 30 * MINUTE },
    ];
    const result = timeLimitEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.resetsAt).toBeDefined();
    expect(result.resetsAt!).toBeGreaterThan(now);
  });

  it('ignores time outside the window', () => {
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [
      { start: now - 5 * 60 * MINUTE, end: now - 4 * 60 * MINUTE }, // 5h ago
      { start: now - 10 * MINUTE, end: now - 5 * MINUTE }, // 5 min
    ];
    const result = timeLimitEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('allow');
  });
});
