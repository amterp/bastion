import type {
  SiteConfig,
  ControlConfig,
  ControlType,
  TimeLimitConfig,
  NavFrequencyConfig,
  DegradationConfig,
  SpeedBumpConfig,
} from '../../shared/types.js';
import { isValidDomainPattern } from '../../shared/types.js';
import { loadSiteConfigs, saveSiteConfigs } from '../../storage/settings.js';

// --- State ---

let siteConfigs: SiteConfig[] = [];
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

// --- DOM refs ---

const sitesList = document.getElementById('sites-list')!;
const addSiteBtn = document.getElementById('add-site')!;
const siteTemplate = document.getElementById('site-card-template') as HTMLTemplateElement;
const controlTemplate = document.getElementById('control-card-template') as HTMLTemplateElement;

// --- Save indicator ---

const saveIndicator = document.createElement('div');
saveIndicator.className = 'save-indicator';
saveIndicator.textContent = 'Saved';
document.body.appendChild(saveIndicator);

function showSaved(): void {
  saveIndicator.classList.add('visible');
  setTimeout(() => saveIndicator.classList.remove('visible'), 1500);
}

// --- Auto-save with debounce ---

function scheduleSave(): void {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(async () => {
    await saveSiteConfigs(siteConfigs);
    showSaved();
  }, 500);
}

// --- Unique IDs ---

function genId(): string {
  return crypto.randomUUID();
}

// --- Default configs ---

function defaultControl(type: ControlType): ControlConfig {
  switch (type) {
    case 'time-limit':
      return { type: 'time-limit', enabled: true, maxMinutes: 30, windowMinutes: 120 };
    case 'nav-frequency':
      return { type: 'nav-frequency', enabled: true, maxNavigations: 3, windowMinutes: 60 };
    case 'degradation':
      return {
        type: 'degradation', enabled: true, effect: 'grayscale',
        trigger: { type: 'time-of-day', afterHour: 21 },
      };
    case 'speed-bump':
      return { type: 'speed-bump', enabled: true, delaySeconds: 10 };
  }
}

// --- Control-specific field rendering ---

function renderControlFields(container: HTMLElement, config: ControlConfig): void {
  container.innerHTML = '';

  switch (config.type) {
    case 'time-limit':
      container.appendChild(fieldRow('Max minutes', 'number', String(config.maxMinutes), (v) => {
        (config as TimeLimitConfig).maxMinutes = parseInt(v, 10) || 1;
        scheduleSave();
      }));
      container.appendChild(fieldRow('Window (minutes)', 'number', String(config.windowMinutes), (v) => {
        (config as TimeLimitConfig).windowMinutes = parseInt(v, 10) || 1;
        scheduleSave();
      }));
      break;

    case 'nav-frequency':
      container.appendChild(fieldRow('Max navigations', 'number', String(config.maxNavigations), (v) => {
        (config as NavFrequencyConfig).maxNavigations = parseInt(v, 10) || 1;
        scheduleSave();
      }));
      container.appendChild(fieldRow('Window (minutes)', 'number', String(config.windowMinutes), (v) => {
        (config as NavFrequencyConfig).windowMinutes = parseInt(v, 10) || 1;
        scheduleSave();
      }));
      break;

    case 'degradation': {
      const triggerRow = document.createElement('div');
      triggerRow.className = 'field-row';
      const triggerLabel = document.createElement('label');
      triggerLabel.textContent = 'Trigger';
      const triggerSelect = document.createElement('select');
      triggerSelect.innerHTML = `
        <option value="time-of-day">Time of day</option>
        <option value="time-on-site">Time on site</option>
      `;
      triggerSelect.value = config.trigger.type;
      triggerRow.appendChild(triggerLabel);
      triggerRow.appendChild(triggerSelect);
      container.appendChild(triggerRow);

      const detailContainer = document.createElement('div');
      container.appendChild(detailContainer);

      const renderTriggerFields = () => {
        detailContainer.innerHTML = '';
        const dc = config as DegradationConfig;
        if (dc.trigger.type === 'time-of-day') {
          detailContainer.appendChild(fieldRow('After hour (0-23)', 'number', String(dc.trigger.afterHour), (v) => {
            dc.trigger = { type: 'time-of-day', afterHour: parseInt(v, 10) || 0 };
            scheduleSave();
          }));
        } else {
          detailContainer.appendChild(fieldRow('After minutes on site', 'number', String(dc.trigger.afterMinutes), (v) => {
            dc.trigger = { type: 'time-on-site', afterMinutes: parseInt(v, 10) || 1 };
            scheduleSave();
          }));
        }
      };

      triggerSelect.addEventListener('change', () => {
        const dc = config as DegradationConfig;
        if (triggerSelect.value === 'time-of-day') {
          dc.trigger = { type: 'time-of-day', afterHour: 21 };
        } else {
          dc.trigger = { type: 'time-on-site', afterMinutes: 10 };
        }
        renderTriggerFields();
        scheduleSave();
      });

      renderTriggerFields();
      break;
    }

    case 'speed-bump':
      container.appendChild(fieldRow('Delay (seconds)', 'number', String(config.delaySeconds), (v) => {
        (config as SpeedBumpConfig).delaySeconds = parseInt(v, 10) || 1;
        scheduleSave();
      }));
      break;
  }
}

function fieldRow(
  label: string,
  type: string,
  value: string,
  onChange: (value: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field-row';
  const lbl = document.createElement('label');
  lbl.textContent = label;
  const input = document.createElement('input');
  input.type = type;
  input.value = value;
  if (type === 'number') input.min = '1';
  input.addEventListener('input', () => onChange(input.value));
  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

// --- Render a control card ---

function renderControlCard(
  siteConfig: SiteConfig,
  controlIndex: number,
): HTMLElement {
  const frag = controlTemplate.content.cloneNode(true) as DocumentFragment;
  const card = frag.querySelector('.control-card') as HTMLElement;

  // Use a getter that always reads from the array to avoid stale closures
  const getConfig = () => siteConfig.controls[controlIndex];

  // Type selector
  const typeSelect = card.querySelector('.control-type') as HTMLSelectElement;
  typeSelect.value = getConfig().type;
  typeSelect.addEventListener('change', () => {
    const newType = typeSelect.value as ControlType;
    const oldConfig = getConfig();
    const newConfig = defaultControl(newType);
    newConfig.enabled = oldConfig.enabled;
    newConfig.bypass = oldConfig.bypass;
    siteConfig.controls[controlIndex] = newConfig;
    // Re-render the entire card to avoid stale closures
    renderAllSites();
    scheduleSave();
  });

  // Enabled toggle - reads from array each time
  const enabledToggle = card.querySelector('.control-enabled') as HTMLInputElement;
  enabledToggle.checked = getConfig().enabled;
  enabledToggle.addEventListener('change', () => {
    getConfig().enabled = enabledToggle.checked;
    scheduleSave();
  });

  // Delete button
  card.querySelector('.btn-delete-control')!.addEventListener('click', () => {
    siteConfig.controls.splice(controlIndex, 1);
    renderAllSites();
    scheduleSave();
  });

  // Control-specific fields
  renderControlFields(card.querySelector('.control-fields')!, getConfig());

  // Bypass section
  const bypassEnabled = card.querySelector('.bypass-enabled') as HTMLInputElement;
  const bypassConfigEl = card.querySelector('.bypass-config') as HTMLElement;
  const bypassMax = card.querySelector('.bypass-max') as HTMLInputElement;
  const bypassWindow = card.querySelector('.bypass-window') as HTMLInputElement;
  const bypassDuration = card.querySelector('.bypass-duration') as HTMLInputElement;

  const currentBypass = getConfig().bypass;
  if (currentBypass) {
    bypassEnabled.checked = true;
    bypassConfigEl.style.display = '';
    bypassMax.value = String(currentBypass.maxBypasses);
    bypassWindow.value = String(currentBypass.windowMinutes);
    bypassDuration.value = String(currentBypass.bypassDurationMinutes);
  }

  bypassEnabled.addEventListener('change', () => {
    if (bypassEnabled.checked) {
      bypassConfigEl.style.display = '';
      getConfig().bypass = {
        maxBypasses: parseInt(bypassMax.value, 10) || 3,
        windowMinutes: parseInt(bypassWindow.value, 10) || 1440,
        bypassDurationMinutes: parseInt(bypassDuration.value, 10) || 5,
      };
    } else {
      bypassConfigEl.style.display = 'none';
      getConfig().bypass = undefined;
    }
    scheduleSave();
  });

  const saveBypass = () => {
    const cfg = getConfig();
    if (!cfg.bypass) return;
    cfg.bypass.maxBypasses = parseInt(bypassMax.value, 10) || 1;
    cfg.bypass.windowMinutes = parseInt(bypassWindow.value, 10) || 1440;
    cfg.bypass.bypassDurationMinutes = parseInt(bypassDuration.value, 10) || 5;
    scheduleSave();
  };

  bypassMax.addEventListener('input', saveBypass);
  bypassWindow.addEventListener('input', saveBypass);
  bypassDuration.addEventListener('input', saveBypass);

  return card;
}

// --- Render a site card ---

function renderSiteCard(siteConfig: SiteConfig): HTMLElement {
  const frag = siteTemplate.content.cloneNode(true) as DocumentFragment;
  const card = frag.querySelector('.site-card') as HTMLElement;

  // Domain input with validation
  const domainInput = card.querySelector('.domain-input') as HTMLInputElement;
  domainInput.value = siteConfig.domainPattern;
  domainInput.addEventListener('input', () => {
    const value = domainInput.value.trim();
    siteConfig.domainPattern = value;
    // Visual validation feedback
    if (value && !isValidDomainPattern(value)) {
      domainInput.style.borderColor = '#e94560';
      domainInput.title = 'Pattern must contain at least one dot (e.g. "reddit.com")';
    } else {
      domainInput.style.borderColor = '';
      domainInput.title = '';
    }
    scheduleSave();
  });

  // Enabled toggle
  const enabledToggle = card.querySelector('.site-enabled') as HTMLInputElement;
  enabledToggle.checked = siteConfig.enabled;
  enabledToggle.addEventListener('change', () => {
    siteConfig.enabled = enabledToggle.checked;
    scheduleSave();
  });

  // Delete button
  card.querySelector('.btn-delete-site')!.addEventListener('click', () => {
    siteConfigs = siteConfigs.filter((c) => c.id !== siteConfig.id);
    renderAllSites();
    scheduleSave();
  });

  // Controls
  const controlsList = card.querySelector('.controls-list')!;
  for (let i = 0; i < siteConfig.controls.length; i++) {
    controlsList.appendChild(renderControlCard(siteConfig, i));
  }

  // Add control button
  card.querySelector('.btn-add-control')!.addEventListener('click', () => {
    siteConfig.controls.push(defaultControl('time-limit'));
    renderAllSites();
    scheduleSave();
  });

  return card;
}

// --- Render all sites ---

function renderAllSites(): void {
  sitesList.innerHTML = '';
  for (const config of siteConfigs) {
    sitesList.appendChild(renderSiteCard(config));
  }
}

// --- Add site ---

addSiteBtn.addEventListener('click', () => {
  siteConfigs.push({
    id: genId(),
    domainPattern: '',
    controls: [],
    enabled: true,
  });
  renderAllSites();
  // Focus the new domain input
  const inputs = sitesList.querySelectorAll('.domain-input');
  const lastInput = inputs[inputs.length - 1] as HTMLInputElement;
  lastInput?.focus();
  scheduleSave();
});

// --- Init ---

async function init(): Promise<void> {
  siteConfigs = await loadSiteConfigs();
  renderAllSites();
}

init();
