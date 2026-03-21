import type { SiteConfig } from '../shared/types.js';
import { ALARMS, HEARTBEAT_INTERVAL_MINUTES } from '../shared/constants.js';
import { heartbeat } from './time-tracker.js';

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
    getConfigs().then((configs) => heartbeat(configs, now));
  }
}
