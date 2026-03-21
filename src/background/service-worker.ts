import { initControls } from '../controls/init.js';
import { loadSiteConfigs } from '../storage/settings.js';
import {
  handleNavigation,
  addNavEntry,
  buildBlockedUrl,
  buildSpeedBumpUrl,
} from './navigation-handler.js';
import { hasClearance, addClearance, recordBypass } from '../storage/tracking.js';
import { getTrackingData } from '../storage/tracking.js';
import { SPEED_BUMP_CLEARANCE_TTL_MS } from '../shared/constants.js';
import type { SiteConfig } from '../shared/types.js';
import { findMatchingSiteConfig, findMatchingDomainPattern, extractHostname } from '../shared/url-utils.js';
import { evaluateControls } from '../controls/evaluate.js';
import type { BastionMessage } from '../shared/messages.js';
import {
  onTabActivated,
  onTabRemoved,
  onWindowFocusChanged,
  onNavigationCommitted,
  recoverOrphanedSession,
} from './time-tracker.js';
import { setupAlarms, handleAlarm } from './alarm-handler.js';

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

/**
 * Dynamically register the degradation content script for configured domains.
 * Generates both exact and wildcard match patterns to handle bare domain
 * visits (e.g. "reddit.com") as well as subdomains ("www.reddit.com").
 */
async function registerDegradationContentScripts(): Promise<void> {
  try {
    await chrome.scripting.unregisterContentScripts({ ids: ['bastion-degradation'] });
  } catch {
    // May not exist yet
  }

  const configs = await getConfigs();
  const patterns: string[] = [];

  for (const c of configs) {
    if (!c.enabled) continue;
    const hasDegradation = c.controls.some(
      (ctrl) => ctrl.type === 'degradation' && ctrl.enabled,
    );
    if (!hasDegradation) continue;

    const domain = c.domainPattern;
    if (domain.startsWith('*.')) {
      // Wildcard config - only subdomains
      patterns.push(`*://${domain}/*`);
    } else {
      // Bare domain - match both exact and subdomains
      patterns.push(`*://${domain}/*`);
      patterns.push(`*://*.${domain}/*`);
    }
  }

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

// Track which tabs are being redirected so we don't record nav entries
// for navigations that will be blocked
const pendingRedirects = new Set<number>();

// --- Navigation interception ---

chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  // Only handle top-level navigations
  if (details.frameId !== 0) return;

  const url = details.url;

  // Don't intercept our own extension pages
  if (url.startsWith(chrome.runtime.getURL(''))) return;

  // Check for speed bump clearance by domain
  const hostname = extractHostname(url);
  if (hostname) {
    const configs = await getConfigs();
    const domainPattern = findMatchingDomainPattern(hostname, configs);
    if (domainPattern && await hasClearance(domainPattern)) return;
  }

  const configs = await getConfigs();
  const evaluation = await handleNavigation(url, configs);
  if (!evaluation) return;

  const { result, config, bypassInfo } = evaluation;

  let redirectUrl: string;
  if (result.action === 'block') {
    redirectUrl = buildBlockedUrl(result, config.domainPattern, url, bypassInfo);
  } else if (result.action === 'speed-bump') {
    redirectUrl = buildSpeedBumpUrl(
      url,
      result.delaySeconds,
      config.domainPattern,
    );
  } else {
    // 'degrade' is handled by content scripts, not by redirect
    return;
  }

  // Mark this tab so onCommitted doesn't record a nav entry
  pendingRedirects.add(details.tabId);
  chrome.tabs.update(details.tabId, { url: redirectUrl });
});

// Record nav events when navigation commits (for nav-frequency tracking)
chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (details.frameId !== 0) return;
  if (details.url.startsWith(chrome.runtime.getURL(''))) return;

  // Don't record nav entries for navigations we're about to redirect
  if (pendingRedirects.has(details.tabId)) {
    pendingRedirects.delete(details.tabId);
    return;
  }

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

chrome.runtime.onMessage.addListener(
  (message: BastionMessage, _sender, sendResponse) => {
    switch (message.type) {
      case 'speed-bump-cleared': {
        const now = Date.now();
        addClearance({
          domain: message.domain,
          clearedAt: now,
          expiresAt: now + SPEED_BUMP_CLEARANCE_TTL_MS,
        }).then(() => sendResponse({ ok: true }));
        return true;
      }

      case 'activate-bypass': {
        recordBypass(message.domain, message.controlType, message.durationMinutes)
          .then(() => sendResponse({ ok: true }));
        return true;
      }

      case 'check-degradation': {
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
        return true;
      }
    }

    return false;
  },
);

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
