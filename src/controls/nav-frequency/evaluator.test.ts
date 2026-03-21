import { describe, it, expect } from 'vitest';
import { navFrequencyEvaluator } from './evaluator.js';
import type { NavFrequencyConfig } from '../../shared/types.js';
import { emptySiteTrackingData } from '../../storage/schema.js';

const MINUTE = 60_000;
const now = Date.now();

function makeConfig(overrides: Partial<NavFrequencyConfig> = {}): NavFrequencyConfig {
  return {
    type: 'nav-frequency',
    enabled: true,
    maxNavigations: 3,
    windowMinutes: 60,
    ...overrides,
  };
}

describe('navFrequencyEvaluator', () => {
  it('allows when no navigations', () => {
    const tracking = emptySiteTrackingData();
    const result = navFrequencyEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('allow');
  });

  it('allows when under the limit', () => {
    const tracking = emptySiteTrackingData();
    tracking.navEntries = [
      { timestamp: now - 30 * MINUTE },
      { timestamp: now - 10 * MINUTE },
    ];
    const result = navFrequencyEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('allow');
  });

  it('blocks when at the limit', () => {
    const tracking = emptySiteTrackingData();
    tracking.navEntries = [
      { timestamp: now - 50 * MINUTE },
      { timestamp: now - 30 * MINUTE },
      { timestamp: now - 10 * MINUTE },
    ];
    const result = navFrequencyEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('block');
    expect(result.reason).toContain('3 times');
  });

  it('blocks when over the limit', () => {
    const tracking = emptySiteTrackingData();
    tracking.navEntries = [
      { timestamp: now - 50 * MINUTE },
      { timestamp: now - 30 * MINUTE },
      { timestamp: now - 10 * MINUTE },
      { timestamp: now - 5 * MINUTE },
    ];
    const result = navFrequencyEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('block');
  });

  it('ignores navigations outside window', () => {
    const tracking = emptySiteTrackingData();
    tracking.navEntries = [
      { timestamp: now - 120 * MINUTE }, // outside 60 min window
      { timestamp: now - 90 * MINUTE },  // outside
      { timestamp: now - 10 * MINUTE },  // inside
    ];
    const result = navFrequencyEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.action).toBe('allow');
  });

  it('provides a resetsAt timestamp', () => {
    const tracking = emptySiteTrackingData();
    tracking.navEntries = [
      { timestamp: now - 50 * MINUTE },
      { timestamp: now - 30 * MINUTE },
      { timestamp: now - 10 * MINUTE },
    ];
    const result = navFrequencyEvaluator.evaluate(makeConfig(), tracking, now);
    expect(result.resetsAt).toBeDefined();
    expect(result.resetsAt!).toBeGreaterThan(now);
  });
});
