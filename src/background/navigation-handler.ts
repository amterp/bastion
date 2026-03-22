import type { DomainPattern, SiteConfig } from '../shared/types.js';
import { extractHostname, findMatchingSiteConfig, findMatchingDomainPattern } from '../shared/url-utils.js';
import { getTrackingData, mutateTrackingData, countBypassesInWindow } from '../storage/tracking.js';
import { evaluateControls } from '../controls/evaluate.js';
import type { ControlResult } from '../controls/types.js';

/** Bypass info to pass to the blocked page */
export interface BypassInfo {
  allowed: boolean;
  remaining: number;
  durationMinutes: number;
}

/**
 * Handle a navigation event. Evaluates controls for the URL and
 * returns the appropriate action, or null if no intervention needed.
 */
export async function handleNavigation(
  url: string,
  configs: SiteConfig[],
): Promise<{ result: ControlResult; config: SiteConfig; bypassInfo: BypassInfo | null } | null> {
  const siteConfig = findMatchingSiteConfig(url, configs);
  if (!siteConfig) return null;

  const tracking = await getTrackingData(siteConfig.domainPattern);
  const now = Date.now();
  const result = evaluateControls(siteConfig, tracking, now);

  if (result.action === 'allow') return null;

  // Compute bypass info for the blocking control
  let bypassInfo: BypassInfo | null = null;
  if (result.action === 'block') {
    const blockingControl = siteConfig.controls.find(
      (c) => c.type === result.type && c.enabled && c.bypass,
    );
    if (blockingControl?.bypass) {
      const bp = blockingControl.bypass;
      const used = countBypassesInWindow(tracking, result.type, bp.windowMinutes, now);
      const remaining = Math.max(0, bp.maxBypasses - used);
      bypassInfo = {
        allowed: remaining > 0,
        remaining,
        durationMinutes: bp.bypassDurationMinutes,
      };
    }
  }

  return { result, config: siteConfig, bypassInfo };
}

/**
 * Resolve a URL to its matching domain pattern, or null if untracked.
 */
export function resolveUrlDomain(
  url: string,
  configs: SiteConfig[],
): DomainPattern | null {
  const hostname = extractHostname(url);
  if (!hostname) return null;
  return findMatchingDomainPattern(hostname, configs);
}

/**
 * Record a navigation entry for a domain pattern that has already
 * been resolved. Prefer this when the caller already knows the domain.
 */
export async function recordNavEntry(
  domainPattern: DomainPattern,
): Promise<void> {
  await mutateTrackingData(domainPattern, (data) => {
    data.navEntries.push({ timestamp: Date.now() });
  });
}

/**
 * Build the redirect URL for a blocked page.
 * Includes the original URL so the bypass button can navigate back.
 */
export function buildBlockedUrl(
  result: ControlResult & { action: 'block' },
  domain: string,
  originalUrl: string,
  bypassInfo: BypassInfo | null,
): string {
  const params = new URLSearchParams({
    reason: result.reason,
    domain,
    originalUrl,
  });
  params.set('resetsAt', String(result.resetsAt));
  params.set('controlType', result.type);
  if (bypassInfo) {
    params.set('bypassAllowed', String(bypassInfo.allowed));
    params.set('bypassRemaining', String(bypassInfo.remaining));
    params.set('bypassDuration', String(bypassInfo.durationMinutes));
  }
  return chrome.runtime.getURL(`ui/blocked/blocked.html?${params}`);
}

/**
 * Build the redirect URL for a speed bump page.
 */
export function buildSpeedBumpUrl(
  targetUrl: string,
  delaySeconds: number,
  domain: string,
): string {
  const params = new URLSearchParams({
    url: targetUrl,
    delay: String(delaySeconds),
    domain,
  });
  return chrome.runtime.getURL(`ui/speed-bump/speed-bump.html?${params}`);
}
