import type { SiteConfig } from '../shared/types.js';
import { findMatchingSiteConfig } from '../shared/url-utils.js';
import { getTrackingData, hasClearance } from '../storage/tracking.js';
import { evaluateControls } from '../controls/evaluate.js';
import type { ControlResult } from '../controls/types.js';

/**
 * Handle a navigation event. Evaluates controls for the URL and
 * returns the appropriate action, or null if no intervention needed.
 */
export async function handleNavigation(
  url: string,
  configs: SiteConfig[],
): Promise<{ result: ControlResult; config: SiteConfig } | null> {
  const siteConfig = findMatchingSiteConfig(url, configs);
  if (!siteConfig) return null;

  const tracking = await getTrackingData(siteConfig.domainPattern);
  const now = Date.now();
  const result = evaluateControls(siteConfig, tracking, now);

  if (result.action === 'allow') return null;

  return { result, config: siteConfig };
}

/**
 * Build the redirect URL for a blocked page.
 */
export function buildBlockedUrl(
  result: ControlResult,
  domain: string,
): string {
  const params = new URLSearchParams({
    reason: result.reason || 'Blocked by Bastion.',
    domain,
  });
  if (result.resetsAt) {
    params.set('resetsAt', String(result.resetsAt));
  }
  params.set('controlType', result.type);
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
