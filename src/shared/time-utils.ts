import type { TimeEntry, NavEntry } from '../storage/schema.js';

/** Convert minutes to milliseconds */
export function minutesToMs(minutes: number): number {
  return minutes * 60_000;
}

/**
 * Calculate total time (in minutes) spent within a rolling window.
 *
 * Entries that span the window boundary are clamped to the window start.
 * Overlapping entries are not de-duplicated (shouldn't happen with our
 * tracking approach, but worth noting).
 */
export function totalTimeInWindow(
  entries: TimeEntry[],
  windowMinutes: number,
  now: number,
): number {
  const windowStartMs = now - minutesToMs(windowMinutes);
  let totalMs = 0;

  for (const entry of entries) {
    if (entry.end <= windowStartMs) continue; // entirely before window
    const effectiveStart = Math.max(entry.start, windowStartMs);
    const effectiveEnd = Math.min(entry.end, now);
    totalMs += Math.max(0, effectiveEnd - effectiveStart);
  }

  return totalMs / 60_000;
}

/**
 * Count navigation events within a rolling window.
 */
export function countNavsInWindow(
  entries: NavEntry[],
  windowMinutes: number,
  now: number,
): number {
  const windowStartMs = now - minutesToMs(windowMinutes);
  return entries.filter((e) => e.timestamp >= windowStartMs).length;
}

/**
 * Prune entries older than the given max window.
 * Returns a new array with only entries within the window.
 */
export function pruneTimeEntries(
  entries: TimeEntry[],
  maxWindowMinutes: number,
  now: number,
): TimeEntry[] {
  const cutoff = now - minutesToMs(maxWindowMinutes);
  return entries.filter((e) => e.end > cutoff);
}

/**
 * Prune nav entries older than the given max window.
 */
export function pruneNavEntries(
  entries: NavEntry[],
  maxWindowMinutes: number,
  now: number,
): NavEntry[] {
  const cutoff = now - minutesToMs(maxWindowMinutes);
  return entries.filter((e) => e.timestamp > cutoff);
}

/**
 * Compute when enough accumulated time will have fallen out of the rolling
 * window to bring the total below maxMinutes. Walks entries from oldest to
 * newest, simulating the window advancing forward in time.
 *
 * Returns the epoch ms when total-in-window drops below maxMinutes,
 * or a fallback of now + windowMinutes if the math is indeterminate.
 */
export function computeResetTime(
  entries: TimeEntry[],
  windowMinutes: number,
  maxMinutes: number,
  now: number,
): number {
  const windowMs = minutesToMs(windowMinutes);
  const maxMs = minutesToMs(maxMinutes);
  const windowStart = now - windowMs;

  // Collect entries within the window, sorted by end time
  const inWindow = entries
    .filter((e) => e.end > windowStart)
    .map((e) => ({
      start: Math.max(e.start, windowStart),
      end: Math.min(e.end, now),
    }))
    .sort((a, b) => a.end - b.end);

  // Walk entries and find when removing them brings total below maxMs
  let totalMs = inWindow.reduce((sum, e) => sum + (e.end - e.start), 0);

  for (const entry of inWindow) {
    const entryDuration = entry.end - entry.start;
    totalMs -= entryDuration;
    if (totalMs < maxMs) {
      // When this entry's end falls out of the window, we're unblocked
      return entry.end + windowMs;
    }
  }

  return now + windowMs;
}

/**
 * Compute when enough nav entries will have fallen out of the rolling
 * window to bring the count below maxNavigations.
 */
export function computeNavResetTime(
  entries: { timestamp: number }[],
  windowMinutes: number,
  maxNavigations: number,
  now: number,
): number {
  const windowMs = minutesToMs(windowMinutes);
  const windowStart = now - windowMs;

  const inWindow = entries
    .filter((e) => e.timestamp >= windowStart)
    .map((e) => e.timestamp)
    .sort((a, b) => a - b);

  // We need to drop enough entries to get below maxNavigations
  const excess = inWindow.length - maxNavigations + 1;
  if (excess > 0 && excess <= inWindow.length) {
    // When the excess-th entry falls out of the window
    return inWindow[excess - 1] + windowMs;
  }

  return now + windowMs;
}

/**
 * Format minutes as a human-readable duration.
 * e.g., 90 -> "1h 30m", 5 -> "5m", 0.5 -> "30s"
 */
export function formatDuration(minutes: number): string {
  if (minutes < 1) {
    const seconds = Math.round(minutes * 60);
    return `${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);

  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
}

/**
 * Format a timestamp as a local time string (e.g., "3:45 PM").
 */
export function formatTime(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
}
