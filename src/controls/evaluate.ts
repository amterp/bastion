import type { SiteConfig } from '../shared/types.js';
import type { SiteTrackingData } from '../storage/schema.js';
import { hasActiveBypass } from '../storage/tracking.js';
import { getEvaluator } from './registry.js';
import type { ControlResult } from './types.js';
import { ACTION_PRIORITY } from './types.js';

const ALLOW: ControlResult = { action: 'allow' };

/**
 * Evaluate all enabled controls for a site.
 * Returns the most restrictive result.
 *
 * Controls with an active bypass are skipped.
 */
export function evaluateControls(
  siteConfig: SiteConfig,
  tracking: SiteTrackingData,
  now: number,
): ControlResult {
  let mostRestrictive = ALLOW;

  for (const control of siteConfig.controls) {
    if (!control.enabled) continue;

    // Skip if there's an active bypass for this control type
    if (hasActiveBypass(tracking, control.type, now)) continue;

    const evaluator = getEvaluator(control.type);
    if (!evaluator) continue;

    const result = evaluator.evaluate(control, tracking, now);

    if (ACTION_PRIORITY[result.action] > ACTION_PRIORITY[mostRestrictive.action]) {
      mostRestrictive = result;
    }
  }

  return mostRestrictive;
}
