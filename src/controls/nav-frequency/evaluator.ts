import type { NavFrequencyConfig } from '../../shared/types.js';
import type { SiteTrackingData } from '../../storage/schema.js';
import { countNavsInWindow, computeNavResetTime, formatDuration } from '../../shared/time-utils.js';
import type { ControlEvaluator, ControlResult } from '../types.js';

export const navFrequencyEvaluator: ControlEvaluator<NavFrequencyConfig> = {
  type: 'nav-frequency',

  evaluate(
    config: NavFrequencyConfig,
    tracking: SiteTrackingData,
    now: number,
  ): ControlResult {
    const count = countNavsInWindow(
      tracking.navEntries,
      config.windowMinutes,
      now,
    );

    if (count >= config.maxNavigations) {
      const resetsAt = computeNavResetTime(
        tracking.navEntries,
        config.windowMinutes,
        config.maxNavigations,
        now,
      );

      return {
        type: 'nav-frequency',
        action: 'block',
        resetsAt,
        reason:
          `You've visited this site ${count} times ` +
          `(limit: ${config.maxNavigations}) in the last ` +
          `${formatDuration(config.windowMinutes)}.`,
      };
    }

    return { action: 'allow' };
  },
};
