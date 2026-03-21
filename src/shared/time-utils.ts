import type { TimeEntry, NavEntry } from '../storage/schema.js';

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
  const windowStartMs = now - windowMinutes * 60_000;
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
  const windowStartMs = now - windowMinutes * 60_000;
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
  const cutoff = now - maxWindowMinutes * 60_000;
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
  const cutoff = now - maxWindowMinutes * 60_000;
  return entries.filter((e) => e.timestamp > cutoff);
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
