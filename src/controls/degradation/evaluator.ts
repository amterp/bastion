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
    if (shouldApplyDegradation(config, tracking, now)) {
      return {
        type: 'degradation',
        action: 'degrade',
        degradeEffect: config.effect,
      };
    }

    return { action: 'allow' };
  },
};

function shouldApplyDegradation(
  config: DegradationConfig,
  tracking: SiteTrackingData,
  now: number,
): boolean {
  const trigger = config.trigger;

  switch (trigger.type) {
    case 'time-of-day': {
      const currentHour = new Date(now).getHours();
      return currentHour >= trigger.afterHour;
    }

    case 'time-on-site': {
      // Use a 24h window to capture today's cumulative usage
      const minutesOnSite = totalTimeInWindow(
        tracking.timeEntries,
        24 * 60,
        now,
      );
      return minutesOnSite >= trigger.afterMinutes;
    }

    default:
      return false;
  }
}
