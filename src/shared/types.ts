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

/** Degradation trigger as a nested discriminated union */
export type DegradationTrigger =
  | { type: 'time-of-day'; afterHour: number }
  | { type: 'time-on-site'; afterMinutes: number };

export interface DegradationConfig extends ControlConfigBase {
  type: 'degradation';
  effect: 'grayscale';
  trigger: DegradationTrigger;
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

/**
 * Validate a domain pattern. Must contain at least one dot to prevent
 * accidentally matching all sites on a TLD (e.g. "com").
 */
export function isValidDomainPattern(pattern: string): boolean {
  const trimmed = pattern.trim().toLowerCase();
  if (!trimmed) return false;
  // Strip wildcard prefix for validation
  const domain = trimmed.startsWith('*.') ? trimmed.slice(2) : trimmed;
  // Must contain at least one dot (e.g. "reddit.com", not "com")
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.');
}
