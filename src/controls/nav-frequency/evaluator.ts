import type { NavFrequencyConfig } from '../../shared/types.js';
import type { SiteTrackingData } from '../../storage/schema.js';
import { countNavsInWindow } from '../../shared/time-utils.js';
import { formatDuration } from '../../shared/time-utils.js';
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
      // Estimate reset: when the oldest nav in the window expires
      const windowStartMs = now - config.windowMinutes * 60_000;
      const oldestInWindow = tracking.navEntries.find(
        (e) => e.timestamp >= windowStartMs,
      );
      const resetsAt = oldestInWindow
        ? oldestInWindow.timestamp + config.windowMinutes * 60_000
        : now + config.windowMinutes * 60_000;

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

    return {
      type: 'nav-frequency',
      action: 'allow',
    };
  },
};
