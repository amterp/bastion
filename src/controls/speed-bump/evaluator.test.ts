import { describe, it, expect } from 'vitest';
import { speedBumpEvaluator } from './evaluator.js';
import type { SpeedBumpConfig } from '../../shared/types.js';
import { emptySiteTrackingData } from '../../storage/schema.js';

const now = Date.now();

function makeConfig(overrides: Partial<SpeedBumpConfig> = {}): SpeedBumpConfig {
  return {
    type: 'speed-bump',
    enabled: true,
    delaySeconds: 10,
    ...overrides,
  };
}

describe('speedBumpEvaluator', () => {
  it('always returns speed-bump action', () => {
    const result = speedBumpEvaluator.evaluate(
      makeConfig(),
      emptySiteTrackingData(),
      now,
    );
    expect(result.action).toBe('speed-bump');
    expect(result.delaySeconds).toBe(10);
  });

  it('uses configured delay', () => {
    const result = speedBumpEvaluator.evaluate(
      makeConfig({ delaySeconds: 30 }),
      emptySiteTrackingData(),
      now,
    );
    expect(result.delaySeconds).toBe(30);
  });
});
