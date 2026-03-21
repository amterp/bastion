import { describe, it, expect } from 'vitest';
import { degradationEvaluator } from './evaluator.js';
import type { DegradationConfig } from '../../shared/types.js';
import { emptySiteTrackingData } from '../../storage/schema.js';

const MINUTE = 60_000;

function makeTimeOfDayConfig(afterHour: number): DegradationConfig {
  return {
    type: 'degradation',
    enabled: true,
    effect: 'grayscale',
    trigger: 'time-of-day',
    afterHour,
  };
}

function makeTimeOnSiteConfig(afterMinutes: number): DegradationConfig {
  return {
    type: 'degradation',
    enabled: true,
    effect: 'grayscale',
    trigger: 'time-on-site',
    afterMinutes,
  };
}

describe('degradationEvaluator', () => {
  describe('time-of-day trigger', () => {
    it('degrades when current hour is at or after threshold', () => {
      // Create a timestamp at 10pm
      const at10pm = new Date();
      at10pm.setHours(22, 0, 0, 0);
      const result = degradationEvaluator.evaluate(
        makeTimeOfDayConfig(21),
        emptySiteTrackingData(),
        at10pm.getTime(),
      );
      expect(result.action).toBe('degrade');
      expect(result.degradeEffect).toBe('grayscale');
    });

    it('allows when current hour is before threshold', () => {
      const at8am = new Date();
      at8am.setHours(8, 0, 0, 0);
      const result = degradationEvaluator.evaluate(
        makeTimeOfDayConfig(21),
        emptySiteTrackingData(),
        at8am.getTime(),
      );
      expect(result.action).toBe('allow');
    });

    it('degrades when exactly at the threshold hour', () => {
      const at9pm = new Date();
      at9pm.setHours(21, 0, 0, 0);
      const result = degradationEvaluator.evaluate(
        makeTimeOfDayConfig(21),
        emptySiteTrackingData(),
        at9pm.getTime(),
      );
      expect(result.action).toBe('degrade');
    });
  });

  describe('time-on-site trigger', () => {
    it('degrades after spending enough time on site', () => {
      const now = Date.now();
      const tracking = emptySiteTrackingData();
      tracking.timeEntries = [
        { start: now - 20 * MINUTE, end: now - 5 * MINUTE }, // 15 min
      ];
      const result = degradationEvaluator.evaluate(
        makeTimeOnSiteConfig(10),
        tracking,
        now,
      );
      expect(result.action).toBe('degrade');
    });

    it('allows when under time threshold', () => {
      const now = Date.now();
      const tracking = emptySiteTrackingData();
      tracking.timeEntries = [
        { start: now - 5 * MINUTE, end: now - 2 * MINUTE }, // 3 min
      ];
      const result = degradationEvaluator.evaluate(
        makeTimeOnSiteConfig(10),
        tracking,
        now,
      );
      expect(result.action).toBe('allow');
    });

    it('allows with no time entries', () => {
      const result = degradationEvaluator.evaluate(
        makeTimeOnSiteConfig(10),
        emptySiteTrackingData(),
        Date.now(),
      );
      expect(result.action).toBe('allow');
    });
  });
});
