import { describe, it, expect } from 'vitest';
import {
  totalTimeInWindow,
  countNavsInWindow,
  pruneTimeEntries,
  pruneNavEntries,
  formatDuration,
  minutesToMs,
  computeResetTime,
  computeNavResetTime,
} from './time-utils.js';
import type { TimeEntry, NavEntry } from '../storage/schema.js';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

describe('minutesToMs', () => {
  it('converts minutes to milliseconds', () => {
    expect(minutesToMs(1)).toBe(60_000);
    expect(minutesToMs(60)).toBe(3_600_000);
  });
});

describe('totalTimeInWindow', () => {
  const now = Date.now();

  it('sums time entries within the window', () => {
    const entries: TimeEntry[] = [
      { start: now - 30 * MINUTE, end: now - 20 * MINUTE }, // 10 min
      { start: now - 10 * MINUTE, end: now - 5 * MINUTE },  // 5 min
    ];
    expect(totalTimeInWindow(entries, 60, now)).toBeCloseTo(15, 1);
  });

  it('excludes entries entirely before the window', () => {
    const entries: TimeEntry[] = [
      { start: now - 3 * HOUR, end: now - 2 * HOUR }, // before window
      { start: now - 10 * MINUTE, end: now - 5 * MINUTE },  // 5 min
    ];
    expect(totalTimeInWindow(entries, 60, now)).toBeCloseTo(5, 1);
  });

  it('clamps entries that span the window boundary', () => {
    const entries: TimeEntry[] = [
      { start: now - 90 * MINUTE, end: now - 30 * MINUTE }, // 30 min in window
    ];
    expect(totalTimeInWindow(entries, 60, now)).toBeCloseTo(30, 1);
  });

  it('returns 0 for empty entries', () => {
    expect(totalTimeInWindow([], 60, now)).toBe(0);
  });

  it('handles entries ending after now (active session flush)', () => {
    const entries: TimeEntry[] = [
      { start: now - 5 * MINUTE, end: now + MINUTE }, // clamped to now
    ];
    expect(totalTimeInWindow(entries, 60, now)).toBeCloseTo(5, 1);
  });
});

describe('countNavsInWindow', () => {
  const now = Date.now();

  it('counts navigations within window', () => {
    const entries: NavEntry[] = [
      { timestamp: now - 50 * MINUTE },
      { timestamp: now - 30 * MINUTE },
      { timestamp: now - 10 * MINUTE },
    ];
    expect(countNavsInWindow(entries, 60, now)).toBe(3);
  });

  it('excludes navigations before window', () => {
    const entries: NavEntry[] = [
      { timestamp: now - 2 * HOUR },  // before
      { timestamp: now - 10 * MINUTE },
    ];
    expect(countNavsInWindow(entries, 60, now)).toBe(1);
  });

  it('returns 0 for empty entries', () => {
    expect(countNavsInWindow([], 60, now)).toBe(0);
  });
});

describe('pruneTimeEntries', () => {
  const now = Date.now();

  it('removes entries ending before the cutoff', () => {
    const entries: TimeEntry[] = [
      { start: now - 3 * HOUR, end: now - 2 * HOUR }, // should be pruned
      { start: now - 30 * MINUTE, end: now - 10 * MINUTE }, // keep
    ];
    const result = pruneTimeEntries(entries, 60, now);
    expect(result).toHaveLength(1);
    expect(result[0].start).toBe(entries[1].start);
  });

  it('keeps entries that span the cutoff', () => {
    const entries: TimeEntry[] = [
      { start: now - 90 * MINUTE, end: now - 30 * MINUTE }, // end is in window
    ];
    expect(pruneTimeEntries(entries, 60, now)).toHaveLength(1);
  });
});

describe('pruneNavEntries', () => {
  const now = Date.now();

  it('removes entries before the cutoff', () => {
    const entries: NavEntry[] = [
      { timestamp: now - 2 * HOUR },
      { timestamp: now - 10 * MINUTE },
    ];
    const result = pruneNavEntries(entries, 60, now);
    expect(result).toHaveLength(1);
  });
});

describe('computeResetTime', () => {
  const now = Date.now();

  it('computes correct reset when single entry exceeds limit', () => {
    const entries: TimeEntry[] = [
      { start: now - 40 * MINUTE, end: now - 10 * MINUTE }, // 30 min
    ];
    const reset = computeResetTime(entries, 120, 30, now);
    // Entry end is now-10min, falls out at now-10min + 120min = now+110min
    expect(reset).toBeCloseTo(now + 110 * MINUTE, -3);
  });

  it('correctly handles multiple entries spread across window', () => {
    const entries: TimeEntry[] = [
      { start: now - 100 * MINUTE, end: now - 80 * MINUTE }, // 20 min
      { start: now - 50 * MINUTE, end: now - 20 * MINUTE },  // 30 min
    ];
    // Total = 50 min, limit = 30 min. Need to drop 20+ min.
    // Removing first entry (20 min) leaves 30 min = still at limit.
    // Removing second entry (30 min) would bring below - so reset is
    // when the second entry's end falls out: now-20min + 120min = now+100min
    const reset = computeResetTime(entries, 120, 30, now);
    expect(reset).toBeCloseTo(now + 100 * MINUTE, -3);
  });

  it('returns fallback when no entries', () => {
    const reset = computeResetTime([], 120, 30, now);
    expect(reset).toBe(now + 120 * MINUTE);
  });
});

describe('computeNavResetTime', () => {
  const now = Date.now();

  it('computes when excess entries fall out of window', () => {
    const entries = [
      { timestamp: now - 50 * MINUTE },
      { timestamp: now - 30 * MINUTE },
      { timestamp: now - 10 * MINUTE },
    ];
    // 3 entries, limit 3, need to drop 1 to get to 2.
    // Oldest (now-50min) falls out at now-50min + 60min = now+10min
    const reset = computeNavResetTime(entries, 60, 3, now);
    expect(reset).toBeCloseTo(now + 10 * MINUTE, -3);
  });
});

describe('formatDuration', () => {
  it('formats sub-minute durations as seconds', () => {
    expect(formatDuration(0.5)).toBe('30s');
  });

  it('formats minutes', () => {
    expect(formatDuration(5)).toBe('5m');
    expect(formatDuration(45)).toBe('45m');
  });

  it('formats hours and minutes', () => {
    expect(formatDuration(90)).toBe('1h 30m');
  });

  it('formats exact hours', () => {
    expect(formatDuration(120)).toBe('2h');
  });
});
