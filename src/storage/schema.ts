import type { ControlType } from '../shared/types.js';

/** A recorded time segment on a site */
export interface TimeEntry {
  start: number; // epoch ms
  end: number;   // epoch ms
}

/** A recorded navigation event */
export interface NavEntry {
  timestamp: number; // epoch ms
}

/** A recorded bypass activation */
export interface BypassEntry {
  timestamp: number; // epoch ms - when activated
  expiresAt: number; // epoch ms
}

/** Tracking data for a single domain pattern */
export interface SiteTrackingData {
  timeEntries: TimeEntry[];
  navEntries: NavEntry[];
  bypasses: Partial<Record<ControlType, BypassEntry[]>>;
}

/** All tracking data, keyed by domain pattern */
export interface TrackingStore {
  [domainPattern: string]: SiteTrackingData;
}

/** Active browsing session (persisted to survive service worker restarts) */
export interface ActiveSession {
  tabId: number;
  domainPattern: string;
  startedAt: number; // epoch ms
}

/** Short-lived token allowing a URL through after speed bump clearance */
export interface SpeedBumpClearance {
  url: string;
  clearedAt: number;  // epoch ms
  expiresAt: number;  // epoch ms
}

/** Create empty tracking data for a new site */
export function emptySiteTrackingData(): SiteTrackingData {
  return {
    timeEntries: [],
    navEntries: [],
    bypasses: {},
  };
}
