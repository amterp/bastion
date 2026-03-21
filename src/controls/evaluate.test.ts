import { describe, it, expect, beforeEach } from 'vitest';
import { evaluateControls } from './evaluate.js';
import { initControls } from './init.js';
import type { SiteConfig } from '../shared/types.js';
import { emptySiteTrackingData } from '../storage/schema.js';

const MINUTE = 60_000;
const now = Date.now();

beforeEach(() => {
  initControls();
});

function makeSiteConfig(controls: SiteConfig['controls']): SiteConfig {
  return {
    id: 'test-1',
    domainPattern: 'reddit.com',
    controls,
    enabled: true,
  };
}

describe('evaluateControls', () => {
  it('returns allow when no controls are configured', () => {
    const config = makeSiteConfig([]);
    const result = evaluateControls(config, emptySiteTrackingData(), now);
    expect(result.action).toBe('allow');
  });

  it('returns allow when all controls are disabled', () => {
    const config = makeSiteConfig([
      { type: 'time-limit', enabled: false, maxMinutes: 1, windowMinutes: 60 },
    ]);
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [{ start: now - 30 * MINUTE, end: now }]; // over limit
    const result = evaluateControls(config, tracking, now);
    expect(result.action).toBe('allow');
  });

  it('returns block when time limit is exceeded', () => {
    const config = makeSiteConfig([
      { type: 'time-limit', enabled: true, maxMinutes: 10, windowMinutes: 60 },
    ]);
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [{ start: now - 15 * MINUTE, end: now }];
    const result = evaluateControls(config, tracking, now);
    expect(result.action).toBe('block');
    if (result.action === 'block') {
      expect(result.type).toBe('time-limit');
    }
  });

  it('skips controls with active bypasses', () => {
    const config = makeSiteConfig([
      { type: 'time-limit', enabled: true, maxMinutes: 10, windowMinutes: 60 },
    ]);
    const tracking = emptySiteTrackingData();
    tracking.timeEntries = [{ start: now - 15 * MINUTE, end: now }];
    // Active bypass
    tracking.bypasses['time-limit'] = [
      { timestamp: now - MINUTE, expiresAt: now + 5 * MINUTE },
    ];
    const result = evaluateControls(config, tracking, now);
    expect(result.action).toBe('allow');
  });
});
