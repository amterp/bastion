import type { ControlType, ControlConfigBase } from '../shared/types.js';
import type { SiteTrackingData } from '../storage/schema.js';

/** The action a control evaluation produces */
export type ControlAction = 'allow' | 'block' | 'degrade' | 'speed-bump';

/** Result of evaluating a single control */
export interface ControlResult {
  type: ControlType;
  action: ControlAction;
  /** For 'block': when the block will expire (epoch ms) */
  resetsAt?: number;
  /** Human-readable reason for the action */
  reason?: string;
  /** For 'degrade': which effect to apply */
  degradeEffect?: string;
  /** For 'speed-bump': countdown seconds */
  delaySeconds?: number;
}

/** Interface that each control type's evaluator must implement */
export interface ControlEvaluator<C extends ControlConfigBase = ControlConfigBase> {
  type: ControlType;
  evaluate(config: C, tracking: SiteTrackingData, now: number): ControlResult;
}

/** Priority ordering for actions (higher = more restrictive) */
export const ACTION_PRIORITY: Record<ControlAction, number> = {
  allow: 0,
  degrade: 1,
  'speed-bump': 2,
  block: 3,
};
