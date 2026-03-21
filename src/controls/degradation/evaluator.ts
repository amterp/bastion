import type { DegradationConfig } from '../../shared/types.js';
import type { SiteTrackingData } from '../../storage/schema.js';
import { totalTimeInWindow } from '../../shared/time-utils.js';
import type { ControlEvaluator, ControlResult } from '../types.js';

export const degradationEvaluator: ControlEvaluator<DegradationConfig> = {
  type: 'degradation',

  evaluate(
    config: DegradationConfig,
    tracking: SiteTrackingData,
    now: number,
  ): ControlResult {
    const shouldDegrade = shouldApplyDegradation(config, tracking, now);

    if (shouldDegrade) {
      return {
        type: 'degradation',
        action: 'degrade',
        degradeEffect: config.effect,
      };
    }

    return {
      type: 'degradation',
      action: 'allow',
    };
  },
};

function shouldApplyDegradation(
  config: DegradationConfig,
  tracking: SiteTrackingData,
  now: number,
): boolean {
  switch (config.trigger) {
    case 'time-of-day': {
      if (config.afterHour === undefined) return false;
      const currentHour = new Date(now).getHours();
      return currentHour >= config.afterHour;
    }

    case 'time-on-site': {
      if (config.afterMinutes === undefined) return false;
      // Use a large window (24h) to capture the current session
      const minutesOnSite = totalTimeInWindow(
        tracking.timeEntries,
        24 * 60,
        now,
      );
      return minutesOnSite >= config.afterMinutes;
    }

    default:
      return false;
  }
}
