import type { SiteConfig } from '../shared/types.js';
import { ALARMS, HEARTBEAT_INTERVAL_MINUTES } from '../shared/constants.js';
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
 * Prune old tracking data. Finds the max window across all configs
 * and removes entries older than that.
 */
async function pruneTrackingData(
  configs: SiteConfig[],
  now: number,
): Promise<void> {
  // Find the largest window we need to keep data for
  let maxWindow = 120; // default 2 hours min
  for (const config of configs) {
    for (const control of config.controls) {
      if ('windowMinutes' in control) {
        maxWindow = Math.max(maxWindow, (control as { windowMinutes: number }).windowMinutes);
      }
    }
  }
  // Add 10% buffer
  maxWindow = Math.ceil(maxWindow * 1.1);

  const store = await loadTrackingStore();
  let changed = false;

  for (const [domain, data] of Object.entries(store)) {
    const prunedTime = pruneTimeEntries(data.timeEntries, maxWindow, now);
    const prunedNav = pruneNavEntries(data.navEntries, maxWindow, now);

    // Prune expired bypasses
    const prunedBypasses = { ...data.bypasses };
    for (const [type, entries] of Object.entries(prunedBypasses)) {
      if (entries) {
        const valid = entries.filter((e) => e.expiresAt > now - maxWindow * 60_000);
        if (valid.length !== entries.length) {
          prunedBypasses[type as keyof typeof prunedBypasses] = valid;
          changed = true;
        }
      }
    }

    if (
      prunedTime.length !== data.timeEntries.length ||
      prunedNav.length !== data.navEntries.length
    ) {
      store[domain] = {
        timeEntries: prunedTime,
        navEntries: prunedNav,
        bypasses: prunedBypasses,
      };
      changed = true;
    }
  }

  if (changed) {
    await saveTrackingStore(store);
  }
}
