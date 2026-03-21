import type { SiteConfig } from '../shared/types.js';
import { ORPHAN_SESSION_THRESHOLD_MS } from '../shared/constants.js';
import { extractHostname, findMatchingDomainPattern } from '../shared/url-utils.js';
import {
  loadActiveSession,
  saveActiveSession,
  clearActiveSession,
  mutateTrackingData,
} from '../storage/tracking.js';

/**
 * Flush the current active session - record the accumulated time
 * as a TimeEntry and clear the session. Returns the domain that
 * was flushed, or null if no active session.
 */
export async function flushActiveSession(
  now: number,
): Promise<string | null> {
  const session = await loadActiveSession();
  if (!session) return null;

  const duration = now - session.startedAt;
  // Only record meaningful time (> 1 second)
  if (duration > 1000) {
    await mutateTrackingData(session.domainPattern, (data) => {
      data.timeEntries.push({
        start: session.startedAt,
        end: now,
      });
    });
  }

  await clearActiveSession();
  return session.domainPattern;
}

/**
 * Start a new active session for the given tab and domain.
 * Flushes any existing session first.
 */
export async function startSession(
  tabId: number,
  domainPattern: string,
  now: number,
): Promise<void> {
  await flushActiveSession(now);
  await saveActiveSession({
    tabId,
    domainPattern,
    startedAt: now,
  });
}

/**
 * Handle a tab becoming active (switched to or focused).
 * Flushes the old session and starts a new one if the tab
 * is on a tracked site.
 */
export async function onTabActivated(
  tabId: number,
  configs: SiteConfig[],
  now: number,
): Promise<void> {
  await flushActiveSession(now);

  // Get the URL of the newly active tab
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url) return;

    const hostname = extractHostname(tab.url);
    if (!hostname) return;

    const domainPattern = findMatchingDomainPattern(hostname, configs);
    if (!domainPattern) return;

    await startSession(tabId, domainPattern, now);
  } catch {
    // Tab might not exist anymore
  }
}

/**
 * Handle window focus change. If focus moves to a non-browser
 * window (WINDOW_ID_NONE), flush the session.
 */
export async function onWindowFocusChanged(
  windowId: number,
  configs: SiteConfig[],
  now: number,
): Promise<void> {
  if (windowId === chrome.windows.WINDOW_ID_NONE) {
    await flushActiveSession(now);
    return;
  }

  // A window gained focus - find its active tab
  try {
    const tabs = await chrome.tabs.query({ active: true, windowId });
    if (tabs.length > 0 && tabs[0].id !== undefined) {
      await onTabActivated(tabs[0].id, configs, now);
    }
  } catch {
    await flushActiveSession(now);
  }
}

/**
 * Handle a tab being closed. If it was the tracked session, flush it.
 */
export async function onTabRemoved(
  tabId: number,
  now: number,
): Promise<void> {
  const session = await loadActiveSession();
  if (session && session.tabId === tabId) {
    await flushActiveSession(now);
  }
}

/**
 * Handle a navigation completing on a tab.
 * If the tab navigates away from a tracked site, flush the session.
 * If it navigates to a tracked site (same or different), track it.
 */
export async function onNavigationCommitted(
  tabId: number,
  url: string,
  configs: SiteConfig[],
  now: number,
): Promise<void> {
  const session = await loadActiveSession();

  const hostname = extractHostname(url);
  const newDomain = hostname
    ? findMatchingDomainPattern(hostname, configs)
    : null;

  if (session && session.tabId === tabId) {
    // Same tab - if domain changed, flush and possibly restart
    if (newDomain !== session.domainPattern) {
      await flushActiveSession(now);
      if (newDomain) {
        await startSession(tabId, newDomain, now);
      }
    }
    // Same domain on same tab - keep the session running
    return;
  }

  // Different tab or no active session. If this tab is navigating to a
  // tracked domain and is the active tab, start tracking it. This handles
  // the case where the same domain is open in a different active tab.
  if (newDomain) {
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.active) {
        await startSession(tabId, newDomain, now);
      }
    } catch {
      // Tab might not exist
    }
  }
}

/**
 * Heartbeat - called every minute by the alarm handler.
 * Flushes the current session and immediately restarts it
 * to bound data loss if the service worker is terminated.
 */
export async function heartbeat(
  configs: SiteConfig[],
  now: number,
): Promise<void> {
  const session = await loadActiveSession();
  if (!session) return;

  // Flush the accumulated time
  await flushActiveSession(now);

  // Verify the tab still exists and restart the session
  try {
    const tab = await chrome.tabs.get(session.tabId);
    if (tab.active && tab.url) {
      const hostname = extractHostname(tab.url);
      if (hostname) {
        const domain = findMatchingDomainPattern(hostname, configs);
        if (domain) {
          await startSession(session.tabId, domain, now);
        }
      }
    }
  } catch {
    // Tab no longer exists
  }
}

/**
 * Recover from an orphaned session on service worker wake-up.
 * If there's a stale session (older than the orphan threshold
 * with no heartbeat), we bound it conservatively and flush.
 */
export async function recoverOrphanedSession(now: number): Promise<void> {
  const session = await loadActiveSession();
  if (!session) return;

  const age = now - session.startedAt;

  if (age > ORPHAN_SESSION_THRESHOLD_MS) {
    // Session is stale - record a bounded time entry
    const boundedEnd = session.startedAt + ORPHAN_SESSION_THRESHOLD_MS;
    await mutateTrackingData(session.domainPattern, (data) => {
      data.timeEntries.push({
        start: session.startedAt,
        end: boundedEnd,
      });
    });
    await clearActiveSession();
  }
}
