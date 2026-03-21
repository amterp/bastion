/** Domain pattern like "reddit.com" or "*.reddit.com" */
export type DomainPattern = string;

/** Control type identifier */
export type ControlType = 'time-limit' | 'nav-frequency' | 'degradation' | 'speed-bump';

/** Bypass policy that can be attached to any control */
export interface BypassPolicy {
  maxBypasses: number;
  /** Rolling window for bypass count (default: 1440 = 1 day) */
  windowMinutes: number;
  /** How long each bypass lasts */
  bypassDurationMinutes: number;
}

/** Base for all control configs */
export interface ControlConfigBase {
  type: ControlType;
  enabled: boolean;
  bypass?: BypassPolicy;
}

export interface TimeLimitConfig extends ControlConfigBase {
  type: 'time-limit';
  /** Max allowed minutes on the site */
  maxMinutes: number;
  /** Rolling window size in minutes */
  windowMinutes: number;
}

export interface NavFrequencyConfig extends ControlConfigBase {
  type: 'nav-frequency';
  /** Max navigations allowed */
  maxNavigations: number;
  /** Rolling window size in minutes */
  windowMinutes: number;
}

export type DegradationTrigger = 'time-of-day' | 'time-on-site';

export interface DegradationConfig extends ControlConfigBase {
  type: 'degradation';
  effect: 'grayscale';
  trigger: DegradationTrigger;
  /** For 'time-of-day': activate after this hour (24h format, e.g. 21 for 9pm) */
  afterHour?: number;
  /** For 'time-on-site': activate after this many minutes on the site */
  afterMinutes?: number;
}

export interface SpeedBumpConfig extends ControlConfigBase {
  type: 'speed-bump';
  /** Countdown duration in seconds */
  delaySeconds: number;
}

/** Discriminated union of all control configs */
export type ControlConfig =
  | TimeLimitConfig
  | NavFrequencyConfig
  | DegradationConfig
  | SpeedBumpConfig;

/** Top-level configuration for a site */
export interface SiteConfig {
  id: string;
  domainPattern: DomainPattern;
  controls: ControlConfig[];
  /** Master toggle for this site */
  enabled: boolean;
}
