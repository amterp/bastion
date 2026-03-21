import type { SpeedBumpConfig } from '../../shared/types.js';
import type { SiteTrackingData } from '../../storage/schema.js';
import type { ControlEvaluator, ControlResult } from '../types.js';

export const speedBumpEvaluator: ControlEvaluator<SpeedBumpConfig> = {
  type: 'speed-bump',

  evaluate(
    config: SpeedBumpConfig,
    _tracking: SiteTrackingData,
    _now: number,
  ): ControlResult {
    // Speed bump always triggers - the clearance token check happens
    // at the service worker level before evaluation, so if we get here,
    // the user hasn't cleared the bump yet.
    return {
      type: 'speed-bump',
      action: 'speed-bump',
      delaySeconds: config.delaySeconds,
    };
  },
};
