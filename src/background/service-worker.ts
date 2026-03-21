import { initControls } from '../controls/init.js';
import { loadSiteConfigs } from '../storage/settings.js';
import {
  handleNavigation,
  buildBlockedUrl,
  buildSpeedBumpUrl,
} from './navigation-handler.js';
import { hasClearance, addClearance, recordBypass } from '../storage/tracking.js';
import { SPEED_BUMP_CLEARANCE_TTL_MS } from '../shared/constants.js';
import type { ControlType, SiteConfig } from '../shared/types.js';
import { findMatchingSiteConfig, extractHostname } from '../shared/url-utils.js';
import { getTrackingData } from '../storage/tracking.js';
import { evaluateControls } from '../controls/evaluate.js';
import {
  onTabActivated,
  onTabRemoved,
  onWindowFocusChanged,
  onNavigationCommitted,
  recoverOrphanedSession,
} from './time-tracker.js';
import { setupAlarms, handleAlarm } from './alarm-handler.js';
import { addNavEntry } from './navigation-handler.js';

// Register all control evaluators
initControls();

// In-memory cache of site configs, rebuilt on wake-up
let cachedConfigs: SiteConfig[] | null = null;

async function getConfigs(): Promise<SiteConfig[]> {
  if (!cachedConfigs) {
    cachedConfigs = await loadSiteConfigs();
  }
  return cachedConfigs;
}

// Invalidate cache and re-register content scripts when config changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['bastion_site_configs']) {
    cachedConfigs = null;
    registerDegradationContentScripts();
  }
});

/** Dynamically register the degradation content script for configured domains */
async function registerDegradationContentScripts(): Promise<void> {
  // Unregister existing
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['bastion-degradation'] });
  } catch {
    // May not exist yet
  }

  const configs = await getConfigs();
  const patterns = configs
    .filter((c) => c.enabled && c.controls.some((ctrl) => ctrl.type === 'degradation' && ctrl.enabled))
    .map((c) => {
      // Convert domain pattern to match pattern
      const domain = c.domainPattern;
      if (domain.startsWith('*.')) return `*://${domain}/*`;
      return `*://*.${domain}/*`;
    });

  if (patterns.length === 0) return;

  try {
    await chrome.scripting.registerContentScripts([{
      id: 'bastion-degradation',
      matches: patterns,
      js: ['content/degradation.js'],
      runAt: 'document_idle',
    }]);
  } catch (e) {
    console.error('Failed to register content scripts:', e);
  }
}

// --- Navigation interception ---

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle top-level navigations
  if (details.frameId !== 0) return;

  const url = details.url;

  // Don't intercept our own extension pages
  if (url.startsWith(chrome.runtime.getURL(''))) return;

  // Check for speed bump clearance
  if (await hasClearance(url)) return;

  const configs = await getConfigs();
  const evaluation = await handleNavigation(url, configs);
  if (!evaluation) return;

  const { result, config, bypassInfo } = evaluation;

  let redirectUrl: string;
  if (result.action === 'block') {
    redirectUrl = buildBlockedUrl(result, config.domainPattern, bypassInfo);
  } else if (result.action === 'speed-bump') {
    redirectUrl = buildSpeedBumpUrl(
      url,
      result.delaySeconds ?? 10,
      config.domainPattern,
    );
  } else {
    // 'degrade' is handled by content scripts, not by redirect
    return;
  }

  // Redirect the tab to our interstitial
  chrome.tabs.update(details.tabId, { url: redirectUrl });
});

// Record nav events when navigation commits (for nav-frequency tracking)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (details.url.startsWith(chrome.runtime.getURL(''))) return;

  const configs = await getConfigs();
  await addNavEntry(details.url, configs);

  // Also update time tracking when navigation commits
  await onNavigationCommitted(details.tabId, details.url, configs, Date.now());
});

// --- Time tracking events ---

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const configs = await getConfigs();
  await onTabActivated(activeInfo.tabId, configs, Date.now());
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  await onTabRemoved(tabId, Date.now());
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  const configs = await getConfigs();
  await onWindowFocusChanged(windowId, configs, Date.now());
});

// --- Alarms ---

chrome.alarms.onAlarm.addListener((alarm) => {
  handleAlarm(alarm, getConfigs);
});

// --- Message handling ---

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'speed-bump-cleared' && message.url) {
    const now = Date.now();
    addClearance({
      url: message.url,
      clearedAt: now,
      expiresAt: now + SPEED_BUMP_CLEARANCE_TTL_MS,
    }).then(() => sendResponse({ ok: true }));
    return true; // async response
  }

  if (message.type === 'activate-bypass') {
    const { domain, controlType, durationMinutes } = message as {
      domain: string;
      controlType: ControlType;
      durationMinutes: number;
    };
    recordBypass(domain, controlType, durationMinutes)
      .then(() => sendResponse({ ok: true }));
    return true; // async response
  }

  if (message.type === 'check-degradation' && message.url) {
    (async () => {
      const configs = await getConfigs();
      const siteConfig = findMatchingSiteConfig(message.url, configs);
      if (!siteConfig) {
        sendResponse({ degrade: false });
        return;
      }
      const tracking = await getTrackingData(siteConfig.domainPattern);
      const now = Date.now();
      const result = evaluateControls(siteConfig, tracking, now);
      if (result.action === 'degrade') {
        sendResponse({ degrade: true, effect: result.degradeEffect });
      } else {
        sendResponse({ degrade: false });
      }
    })();
    return true; // async response
  }

  return false;
});

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  setupAlarms();
  console.log('Bastion extension installed');
});

// On every service worker wake-up, recover any orphaned session
// and ensure alarms are set up (they may not persist across restarts)
recoverOrphanedSession(Date.now());
setupAlarms();
registerDegradationContentScripts();

console.log('Bastion service worker initialized');
