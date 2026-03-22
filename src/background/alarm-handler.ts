import type { SiteConfig } from '../shared/types.js';
import { ALARMS, HEARTBEAT_INTERVAL_MINUTES } from '../shared/constants.js';
import { minutesToMs } from '../shared/time-utils.js';
import { heartbeat } from './time-tracker.js';
import { loadTrackingStore, saveTrackingStore } from '../storage/tracking.js';
import { pruneTimeEntries, pruneNavEntries } from '../shared/time-utils.js';

/**
 * Set up the heartbeat alarm. Called on extension install and wake-up.
 */
export function setupAlarms(): void {
  chrome.alarms.create(ALARMS.HEARTBEAT, {
    periodInMinutes: HEARTBEAT_INTERVAL_MINUTES,
  });
}

/**
 * Handle alarm events.
 */
export function handleAlarm(
  alarm: chrome.alarms.Alarm,
  getConfigs: () => Promise<SiteConfig[]>,
): void {
  if (alarm.name === ALARMS.HEARTBEAT) {
    const now = Date.now();
    getConfigs().then(async (configs) => {
      await heartbeat(configs, now);
      await pruneTrackingData(configs, now);
    });
  }
}

/**
 * Compute the max data retention window from all configs.
 * Includes control windows AND bypass policy windows.
 */
function computeMaxWindow(configs: SiteConfig[]): number {
  let maxWindow = 120; // default 2 hours min
  for (const config of configs) {
    for (const control of config.controls) {
      // Time-limit and nav-frequency have windowMinutes
      if (control.type === 'time-limit' || control.type === 'nav-frequency') {
        maxWindow = Math.max(maxWindow, control.windowMinutes);
      }
      // Bypass windows can be much larger (e.g. 1440 = 1 day)
      if (control.bypass) {
        maxWindow = Math.max(maxWindow, control.bypass.windowMinutes);
      }
    }
  }
  // Add 10% buffer
  return Math.ceil(maxWindow * 1.1);
}

/**
 * Prune old tracking data. Removes entries older than the max
 * retention window across all configs.
 */
async function pruneTrackingData(
  configs: SiteConfig[],
  now: number,
): Promise<void> {
  const maxWindow = computeMaxWindow(configs);
  const store = await loadTrackingStore();
  let anyChanged = false;

  for (const [domain, data] of Object.entries(store)) {
    const prunedTime = pruneTimeEntries(data.timeEntries, maxWindow, now);
    const prunedNav = pruneNavEntries(data.navEntries, maxWindow, now);

    // Prune expired bypasses - simply remove entries that have expired
    let bypassChanged = false;
    const prunedBypasses = { ...data.bypasses };
    const cutoff = now - minutesToMs(maxWindow);
    for (const [type, entries] of Object.entries(prunedBypasses)) {
      if (entries) {
        const valid = entries.filter((e) => e.expiresAt > cutoff);
        if (valid.length !== entries.length) {
          prunedBypasses[type as keyof typeof prunedBypasses] = valid;
          bypassChanged = true;
        }
      }
    }

    const timeChanged = prunedTime.length !== data.timeEntries.length;
    const navChanged = prunedNav.length !== data.navEntries.length;

    if (timeChanged || navChanged || bypassChanged) {
      store[domain] = {
        timeEntries: prunedTime,
        navEntries: prunedNav,
        bypasses: prunedBypasses,
      };
      anyChanged = true;
    }
  }

  if (anyChanged) {
    await saveTrackingStore(store);
  }
}
