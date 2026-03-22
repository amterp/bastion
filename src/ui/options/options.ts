import type {
  SiteConfig,
  ControlConfig,
  ControlType,
  ConfigExport,
  TimeLimitConfig,
  NavFrequencyConfig,
  DegradationConfig,
  SpeedBumpConfig,
} from '../../shared/types.js';
import { isValidDomainPattern } from '../../shared/types.js';
import { loadSiteConfigs, saveSiteConfigs } from '../../storage/settings.js';
import {
  buildExport,
  exportToJson,
  exportToEncodedString,
  importFromJson,
  importFromEncodedString,
  mergeConfigs,
  regenerateIds,
} from '../../storage/portability.js';

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
      container.appendChild(durationRow('Max time', config.maxMinutes, (m) => {
        (config as TimeLimitConfig).maxMinutes = m;
        scheduleSave();
      }));
      container.appendChild(durationRow('Per window', config.windowMinutes, (m) => {
        (config as TimeLimitConfig).windowMinutes = m;
        scheduleSave();
      }));
      break;

    case 'nav-frequency':
      container.appendChild(fieldRow('Max visits', 'number', String(config.maxNavigations), (v) => {
        (config as NavFrequencyConfig).maxNavigations = parseInt(v, 10) || 1;
        scheduleSave();
      }));
      container.appendChild(durationRow('Per window', config.windowMinutes, (m) => {
        (config as NavFrequencyConfig).windowMinutes = m;
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
          detailContainer.appendChild(durationRow('After on site', dc.trigger.afterMinutes, (m) => {
            dc.trigger = { type: 'time-on-site', afterMinutes: m };
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
  if (type === 'number') input.min = '0';
  input.addEventListener('input', () => onChange(input.value));
  row.appendChild(lbl);
  row.appendChild(input);
  return row;
}

/**
 * A duration input row with separate hours and minutes fields.
 * Stores and returns total minutes.
 */
function durationRow(
  label: string,
  totalMinutes: number,
  onChange: (minutes: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'field-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const wrapper = document.createElement('div');
  wrapper.className = 'duration-input';

  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;

  const hoursInput = document.createElement('input');
  hoursInput.type = 'number';
  hoursInput.min = '0';
  hoursInput.value = String(hours);

  const hoursUnit = document.createElement('span');
  hoursUnit.className = 'unit';
  hoursUnit.textContent = 'h';

  const minsInput = document.createElement('input');
  minsInput.type = 'number';
  minsInput.min = '0';
  minsInput.max = '59';
  minsInput.value = String(mins);

  const minsUnit = document.createElement('span');
  minsUnit.className = 'unit';
  minsUnit.textContent = 'm';

  const emitChange = () => {
    const h = parseInt(hoursInput.value, 10) || 0;
    const m = parseInt(minsInput.value, 10) || 0;
    const total = Math.max(1, h * 60 + m);
    onChange(total);
  };

  hoursInput.addEventListener('input', emitChange);
  minsInput.addEventListener('input', emitChange);

  wrapper.appendChild(hoursInput);
  wrapper.appendChild(hoursUnit);
  wrapper.appendChild(minsInput);
  wrapper.appendChild(minsUnit);
  row.appendChild(wrapper);

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
    // Don't carry bypass into degradation - it has no effect there
    newConfig.bypass = newType === 'degradation' ? undefined : oldConfig.bypass;
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

  // Bypass section - hidden for degradation (bypasses only apply to blocking controls)
  const bypassSectionEl = card.querySelector('.bypass-section') as HTMLElement;
  if (getConfig().type === 'degradation') {
    bypassSectionEl.style.display = 'none';
  }

  const bypassEnabled = card.querySelector('.bypass-enabled') as HTMLInputElement;
  const bypassConfigEl = card.querySelector('.bypass-config') as HTMLElement;

  function renderBypassFields() {
    bypassConfigEl.innerHTML = '';
    const bp = getConfig().bypass;
    if (!bp) return;

    bypassConfigEl.appendChild(fieldRow('Max bypasses', 'number', String(bp.maxBypasses), (v) => {
      const cfg = getConfig();
      if (cfg.bypass) {
        cfg.bypass.maxBypasses = parseInt(v, 10) || 1;
        scheduleSave();
      }
    }));

    bypassConfigEl.appendChild(durationRow('Per window', bp.windowMinutes, (m) => {
      const cfg = getConfig();
      if (cfg.bypass) {
        cfg.bypass.windowMinutes = m;
        scheduleSave();
      }
    }));

    bypassConfigEl.appendChild(durationRow('Bypass duration', bp.bypassDurationMinutes, (m) => {
      const cfg = getConfig();
      if (cfg.bypass) {
        cfg.bypass.bypassDurationMinutes = m;
        scheduleSave();
      }
    }));
  }

  const currentBypass = getConfig().bypass;
  if (currentBypass) {
    bypassEnabled.checked = true;
    bypassConfigEl.style.display = '';
    renderBypassFields();
  }

  bypassEnabled.addEventListener('change', () => {
    if (bypassEnabled.checked) {
      bypassConfigEl.style.display = '';
      getConfig().bypass = {
        maxBypasses: 3,
        windowMinutes: 1440,
        bypassDurationMinutes: 5,
      };
      renderBypassFields();
    } else {
      bypassConfigEl.style.display = 'none';
      bypassConfigEl.innerHTML = '';
      getConfig().bypass = undefined;
    }
    scheduleSave();
  });

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

// --- Portability: DOM refs ---

const exportFileBtn = document.getElementById('export-file')!;
const exportStringBtn = document.getElementById('export-string')!;
const importFileBtn = document.getElementById('import-file')!;
const importStringBtn = document.getElementById('import-string')!;
const importFileInput = document.getElementById('import-file-input') as HTMLInputElement;
const portabilityStatus = document.getElementById('portability-status')!;
const modalTemplate = document.getElementById('modal-template') as HTMLTemplateElement;

// --- Portability: status messages ---

let statusTimeout: ReturnType<typeof setTimeout> | null = null;

function showStatus(message: string, type: 'success' | 'error'): void {
  portabilityStatus.textContent = message;
  portabilityStatus.className = `portability-status ${type}`;
  if (statusTimeout) clearTimeout(statusTimeout);
  statusTimeout = setTimeout(() => {
    portabilityStatus.textContent = '';
    portabilityStatus.className = 'portability-status';
  }, 5000);
}

// --- Portability: modal helpers ---

function showModal(opts: {
  message: string;
  body?: (container: HTMLElement) => void;
  buttons: { label: string; className: string; onClick: (close: () => void) => void }[];
}): HTMLElement {
  const frag = modalTemplate.content.cloneNode(true) as DocumentFragment;
  const backdrop = frag.querySelector('.modal-backdrop') as HTMLElement;
  const msgEl = backdrop.querySelector('.modal-message') as HTMLElement;
  const bodyEl = backdrop.querySelector('.modal-body') as HTMLElement;
  const actionsEl = backdrop.querySelector('.modal-actions') as HTMLElement;

  msgEl.textContent = opts.message;

  if (opts.body) {
    opts.body(bodyEl);
  }

  const close = () => backdrop.remove();
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) close();
  });

  for (const btn of opts.buttons) {
    const button = document.createElement('button');
    button.textContent = btn.label;
    button.className = btn.className;
    button.addEventListener('click', () => btn.onClick(close));
    actionsEl.appendChild(button);
  }

  document.body.appendChild(backdrop);
  return backdrop;
}

type ImportMode = 'replace' | 'merge';

function importModeRadios(container: HTMLElement): () => ImportMode {
  const wrapper = document.createElement('div');
  wrapper.className = 'import-mode';

  const makeRadio = (value: ImportMode, label: string, checked: boolean) => {
    const lbl = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'import-mode';
    input.value = value;
    input.checked = checked;
    lbl.appendChild(input);
    lbl.appendChild(document.createTextNode(label));
    wrapper.appendChild(lbl);
  };

  makeRadio('replace', 'Replace all', true);
  makeRadio('merge', 'Merge (incoming wins)', false);
  container.appendChild(wrapper);

  return () => {
    const selected = wrapper.querySelector('input:checked') as HTMLInputElement;
    return (selected?.value as ImportMode) ?? 'replace';
  };
}

function pluralSite(count: number): string {
  return `${count} site config${count !== 1 ? 's' : ''}`;
}

async function applyImport(data: ConfigExport, mode: ImportMode): Promise<void> {
  if (mode === 'merge') {
    siteConfigs = mergeConfigs(siteConfigs, data.siteConfigs);
  } else {
    siteConfigs = regenerateIds(data.siteConfigs);
  }
  await saveSiteConfigs(siteConfigs);
  renderAllSites();
  showStatus(`Imported ${pluralSite(data.siteConfigs.length)} (${mode})`, 'success');
}

function showImportConfirm(data: ConfigExport): void {
  let getMode: () => ImportMode;

  showModal({
    message: `Import ${pluralSite(data.siteConfigs.length)}? You currently have ${pluralSite(siteConfigs.length)}.`,
    body: (container) => {
      getMode = importModeRadios(container);
    },
    buttons: [
      { label: 'Cancel', className: 'btn-modal-cancel', onClick: (close) => close() },
      {
        label: 'Import',
        className: 'btn-modal-confirm',
        onClick: (close) => {
          close();
          applyImport(data, getMode());
        },
      },
    ],
  });
}

// --- Portability: Export handlers ---

exportFileBtn.addEventListener('click', () => {
  const data = buildExport(siteConfigs);
  const json = exportToJson(data);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `bastion-config-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showStatus('Config exported as file', 'success');
});

exportStringBtn.addEventListener('click', () => {
  const data = buildExport(siteConfigs);
  const encoded = exportToEncodedString(data);

  showModal({
    message: 'Copy this string to share your config:',
    body: (container) => {
      const textarea = document.createElement('textarea');
      textarea.rows = 4;
      textarea.readOnly = true;
      textarea.value = encoded;
      container.appendChild(textarea);
      // Select text on focus for easy copying
      textarea.addEventListener('focus', () => textarea.select());
      setTimeout(() => textarea.focus(), 50);
    },
    buttons: [
      {
        label: 'Copy',
        className: 'btn-modal-confirm',
        onClick: (close) => {
          navigator.clipboard.writeText(encoded).then(
            () => { close(); showStatus('Copied to clipboard', 'success'); },
            () => showStatus('Failed to copy - please select and copy manually', 'error'),
          );
        },
      },
      { label: 'Close', className: 'btn-modal-cancel', onClick: (close) => close() },
    ],
  });
});

// --- Portability: Import handlers ---

importFileBtn.addEventListener('click', () => {
  importFileInput.value = '';
  importFileInput.click();
});

importFileInput.addEventListener('change', () => {
  const file = importFileInput.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const result = importFromJson(reader.result as string);
    if (!result.ok) {
      showStatus(result.error, 'error');
      return;
    }
    showImportConfirm(result.data);
  };
  reader.readAsText(file);
});

importStringBtn.addEventListener('click', () => {
  let textarea: HTMLTextAreaElement;
  let errorEl: HTMLElement;

  showModal({
    message: 'Paste your encoded config string:',
    body: (container) => {
      textarea = document.createElement('textarea');
      textarea.rows = 4;
      textarea.placeholder = 'Paste encoded string here...';
      container.appendChild(textarea);

      errorEl = document.createElement('div');
      errorEl.className = 'modal-error';
      container.appendChild(errorEl);

      setTimeout(() => textarea.focus(), 50);
    },
    buttons: [
      { label: 'Cancel', className: 'btn-modal-cancel', onClick: (close) => close() },
      {
        label: 'Import',
        className: 'btn-modal-confirm',
        onClick: (close) => {
          const value = textarea.value.trim();
          if (!value) {
            errorEl.textContent = 'Please paste a config string';
            return;
          }
          const result = importFromEncodedString(value);
          if (!result.ok) {
            errorEl.textContent = result.error;
            return;
          }
          close();
          showImportConfirm(result.data);
        },
      },
    ],
  });
});

// --- Init ---

async function init(): Promise<void> {
  siteConfigs = await loadSiteConfigs();
  renderAllSites();
}

init();
