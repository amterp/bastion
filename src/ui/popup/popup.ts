import type { SiteConfig, ControlConfig } from '../../shared/types.js';
import { loadSiteConfigs, saveSiteConfigs } from '../../storage/settings.js';
import { loadTrackingStore } from '../../storage/tracking.js';
import { hasActiveBypass } from '../../storage/tracking.js';
import { totalTimeInWindow, countNavsInWindow, formatDuration } from '../../shared/time-utils.js';
import type { SiteTrackingData } from '../../storage/schema.js';
import { emptySiteTrackingData } from '../../storage/schema.js';

const sitesSummary = document.getElementById('sites-summary')!;

// Open options page
function openOptions(): void {
  chrome.runtime.openOptionsPage();
}

document.getElementById('open-options')?.addEventListener('click', (e) => {
  e.preventDefault();
  openOptions();
});
document.getElementById('open-options-empty')?.addEventListener('click', (e) => {
  e.preventDefault();
  openOptions();
});

// Render

async function render(): Promise<void> {
  const configs = await loadSiteConfigs();
  const trackingStore = await loadTrackingStore();
  const now = Date.now();

  if (configs.length === 0) {
    document.body.classList.add('empty');
    return;
  }

  document.body.classList.remove('empty');
  sitesSummary.innerHTML = '';

  for (const config of configs) {
    const tracking = trackingStore[config.domainPattern] ?? emptySiteTrackingData();
    sitesSummary.appendChild(renderSiteSummary(config, tracking, now, configs));
  }
}

function renderSiteSummary(
  config: SiteConfig,
  tracking: SiteTrackingData,
  now: number,
  allConfigs: SiteConfig[],
): HTMLElement {
  const card = document.createElement('div');
  card.className = `site-summary${config.enabled ? '' : ' disabled'}`;

  // Header with domain and toggle
  const header = document.createElement('div');
  header.className = 'site-summary-header';

  const domain = document.createElement('span');
  domain.className = 'site-domain';
  domain.textContent = config.domainPattern || '(no domain)';

  const toggle = document.createElement('label');
  toggle.className = 'site-toggle';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = config.enabled;
  checkbox.addEventListener('change', async () => {
    config.enabled = checkbox.checked;
    await saveSiteConfigs(allConfigs);
    render();
  });
  const slider = document.createElement('span');
  slider.className = 'slider';
  toggle.appendChild(checkbox);
  toggle.appendChild(slider);

  header.appendChild(domain);
  header.appendChild(toggle);
  card.appendChild(header);

  // Control pills
  if (config.enabled && config.controls.length > 0) {
    const pillsRow = document.createElement('div');
    pillsRow.className = 'controls-status';

    for (const control of config.controls) {
      if (!control.enabled) continue;
      const pill = document.createElement('span');
      pill.className = 'control-pill';
      pill.textContent = controlLabel(control);

      const bypassed = hasActiveBypass(tracking, control.type, now);
      if (bypassed) {
        pill.classList.add('bypassed');
        pill.textContent += ' (bypassed)';
      } else if (isControlTriggered(control, tracking, now)) {
        pill.classList.add('blocked');
      } else {
        pill.classList.add('active');
      }

      pillsRow.appendChild(pill);
    }

    card.appendChild(pillsRow);

    // Stats
    const stats = buildStats(config, tracking, now);
    if (stats) {
      const statsRow = document.createElement('div');
      statsRow.className = 'stats-row';
      statsRow.textContent = stats;
      card.appendChild(statsRow);
    }
  }

  return card;
}

function controlLabel(control: ControlConfig): string {
  switch (control.type) {
    case 'time-limit': return 'Time';
    case 'nav-frequency': return 'Visits';
    case 'degradation': return 'Grayscale';
    case 'speed-bump': return 'Bump';
  }
}

function isControlTriggered(
  control: ControlConfig,
  tracking: SiteTrackingData,
  now: number,
): boolean {
  switch (control.type) {
    case 'time-limit': {
      const used = totalTimeInWindow(tracking.timeEntries, control.windowMinutes, now);
      return used >= control.maxMinutes;
    }
    case 'nav-frequency': {
      const count = countNavsInWindow(tracking.navEntries, control.windowMinutes, now);
      return count >= control.maxNavigations;
    }
    default:
      return false;
  }
}

function buildStats(
  config: SiteConfig,
  tracking: SiteTrackingData,
  now: number,
): string | null {
  const parts: string[] = [];

  const timeControl = config.controls.find(
    (c) => c.type === 'time-limit' && c.enabled,
  );
  if (timeControl && timeControl.type === 'time-limit') {
    const used = totalTimeInWindow(tracking.timeEntries, timeControl.windowMinutes, now);
    parts.push(`${formatDuration(used)} / ${formatDuration(timeControl.maxMinutes)}`);
  }

  const navControl = config.controls.find(
    (c) => c.type === 'nav-frequency' && c.enabled,
  );
  if (navControl && navControl.type === 'nav-frequency') {
    const count = countNavsInWindow(tracking.navEntries, navControl.windowMinutes, now);
    parts.push(`${count} / ${navControl.maxNavigations} visits`);
  }

  return parts.length > 0 ? parts.join(' | ') : null;
}

render();
