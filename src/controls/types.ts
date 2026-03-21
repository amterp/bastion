import type { ControlType, ControlConfigBase } from '../shared/types.js';
import type { SiteTrackingData } from '../storage/schema.js';

/** The action a control evaluation produces */
export type ControlAction = 'allow' | 'block' | 'degrade' | 'speed-bump';

/** Discriminated union of control evaluation results */
export type ControlResult =
  | AllowResult
  | BlockResult
  | DegradeResult
  | SpeedBumpResult;

export interface AllowResult {
  action: 'allow';
}

export interface BlockResult {
  action: 'block';
  type: ControlType;
  /** When the block will expire (epoch ms) */
  resetsAt: number;
  /** Human-readable reason for the block */
  reason: string;
}

export interface DegradeResult {
  action: 'degrade';
  type: ControlType;
  /** Which effect to apply */
  degradeEffect: string;
}

export interface SpeedBumpResult {
  action: 'speed-bump';
  type: ControlType;
  /** Countdown seconds */
  delaySeconds: number;
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
