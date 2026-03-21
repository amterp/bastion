import type { TimeLimitConfig } from '../../shared/types.js';
import type { SiteTrackingData } from '../../storage/schema.js';
import { totalTimeInWindow } from '../../shared/time-utils.js';
import type { ControlEvaluator, ControlResult } from '../types.js';
import { formatDuration } from '../../shared/time-utils.js';

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
      // Estimate when the oldest entry in the window will fall out
      const windowStartMs = now - config.windowMinutes * 60_000;
      const oldestInWindow = tracking.timeEntries.find(
        (e) => e.end > windowStartMs,
      );
      const resetsAt = oldestInWindow
        ? oldestInWindow.end + config.windowMinutes * 60_000
        : now + config.windowMinutes * 60_000;

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

    return {
      type: 'time-limit',
      action: 'allow',
    };
  },
};
