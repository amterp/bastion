import { initControls } from '../controls/init.js';
import { loadSiteConfigs } from '../storage/settings.js';
import {
  handleNavigation,
  buildBlockedUrl,
  buildSpeedBumpUrl,
} from './navigation-handler.js';
import { hasClearance, addClearance } from '../storage/tracking.js';
import { SPEED_BUMP_CLEARANCE_TTL_MS } from '../shared/constants.js';
import type { SiteConfig } from '../shared/types.js';

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

// Invalidate cache when storage changes
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes['bastion_site_configs']) {
    cachedConfigs = null;
  }
});

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

  const { result, config } = evaluation;

  let redirectUrl: string;
  if (result.action === 'block') {
    redirectUrl = buildBlockedUrl(result, config.domainPattern);
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
  return false;
});

// --- Lifecycle ---

chrome.runtime.onInstalled.addListener(() => {
  console.log('Bastion extension installed');
});

console.log('Bastion service worker initialized');
