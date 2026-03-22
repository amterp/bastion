import type { DomainPattern } from '../shared/types.js';

/**
 * In-memory map of tabId to the domain pattern currently loaded in that tab.
 * Lost on service worker restart, which is acceptable - worst case is one
 * extra nav count per tab on restart.
 */
const tabDomains = new Map<number, DomainPattern>();

/**
 * Should this navigation be recorded as a nav entry?
 *
 * A navigation counts as "fresh" if:
 * - The tab has no previous domain tracked (new tab or post-restart), OR
 * - The tab's previous domain differs from the new domain
 *
 * Returns false when the tab is already on the same domain (user is
 * just clicking around within the site) or when navigating to an
 * untracked site.
 */
export function isFreshNavigation(
  previousDomain: DomainPattern | null,
  newDomain: DomainPattern | null,
): boolean {
  if (newDomain === null) return false;
  if (previousDomain === null) return true;
  return previousDomain !== newDomain;
}

export function getTabDomain(tabId: number): DomainPattern | null {
  return tabDomains.get(tabId) ?? null;
}

/**
 * Update the tracked domain for a tab.
 * Pass null to clear (when navigating to an untracked site).
 */
export function setTabDomain(
  tabId: number,
  domain: DomainPattern | null,
): void {
  if (domain === null) {
    tabDomains.delete(tabId);
  } else {
    tabDomains.set(tabId, domain);
  }
}

export function clearTab(tabId: number): void {
  tabDomains.delete(tabId);
}

/** Clear all tab tracking. Exposed for testing only. */
export function _resetForTest(): void {
  tabDomains.clear();
}
