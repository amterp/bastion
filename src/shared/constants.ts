/** Storage keys for chrome.storage.local */
export const STORAGE_KEYS = {
  SITE_CONFIGS: 'bastion_site_configs',
  TRACKING: 'bastion_tracking',
  ACTIVE_SESSION: 'bastion_active_session',
  SPEED_BUMP_CLEARANCES: 'bastion_speed_bump_clearances',
} as const;

/** Default bypass window: 1 day in minutes */
export const DEFAULT_BYPASS_WINDOW_MINUTES = 1440;

/** Heartbeat alarm interval in minutes */
export const HEARTBEAT_INTERVAL_MINUTES = 1;

/**
 * Speed bump clearance token lifetime in ms.
 * Needs to be long enough for: sendMessage round-trip + navigation start +
 * service worker wake-up (if cold) + storage read. 30s is generous.
 */
export const SPEED_BUMP_CLEARANCE_TTL_MS = 30_000;

/**
 * Max age (in ms) for an active session before we consider it orphaned.
 * Derived from the heartbeat interval - if no heartbeat has flushed the
 * session within 2x the interval, it's stale.
 */
export const ORPHAN_SESSION_THRESHOLD_MS = HEARTBEAT_INTERVAL_MINUTES * 2 * 60_000;

/** Alarm names */
export const ALARMS = {
  HEARTBEAT: 'bastion-heartbeat',
} as const;
