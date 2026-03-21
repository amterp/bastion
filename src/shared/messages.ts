import type { ControlType } from './types.js';

/** All messages that can be sent via chrome.runtime.sendMessage */
export type BastionMessage =
  | SpeedBumpClearedMessage
  | ActivateBypassMessage
  | CheckDegradationMessage;

export interface SpeedBumpClearedMessage {
  type: 'speed-bump-cleared';
  domain: string;
}

export interface ActivateBypassMessage {
  type: 'activate-bypass';
  domain: string;
  controlType: ControlType;
  durationMinutes: number;
}

export interface CheckDegradationMessage {
  type: 'check-degradation';
  url: string;
}

/** Response from check-degradation */
export interface DegradationResponse {
  degrade: boolean;
  effect?: string;
}
