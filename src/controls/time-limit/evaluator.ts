import type { TimeLimitConfig } from '../../shared/types.js';
import type { SiteTrackingData } from '../../storage/schema.js';
import { totalTimeInWindow, computeResetTime, formatDuration } from '../../shared/time-utils.js';
import type { ControlEvaluator, ControlResult } from '../types.js';

export const timeLimitEvaluator: ControlEvaluator<TimeLimitConfig> = {
  type: 'time-limit',

  evaluate(
    config: TimeLimitConfig,
    tracking: SiteTrackingData,
    now: number,
  ): ControlResult {
    const usedMinutes = totalTimeInWindow(
      tracking.timeEntries,
      config.windowMinutes,
      now,
    );

    if (usedMinutes >= config.maxMinutes) {
      const resetsAt = computeResetTime(
        tracking.timeEntries,
        config.windowMinutes,
        config.maxMinutes,
        now,
      );

      return {
        type: 'time-limit',
        action: 'block',
        resetsAt,
        reason:
          `You've used ${formatDuration(usedMinutes)} of ` +
          `${formatDuration(config.maxMinutes)} allowed in the last ` +
          `${formatDuration(config.windowMinutes)}.`,
      };
    }

    return { action: 'allow' };
  },
};
