import type { SiteConfig } from '../shared/types.js';
import { STORAGE_KEYS } from '../shared/constants.js';

/** Load all site configs from storage */
export async function loadSiteConfigs(): Promise<SiteConfig[]> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.SITE_CONFIGS);
  return (result[STORAGE_KEYS.SITE_CONFIGS] as SiteConfig[] | undefined) ?? [];
}

/** Save all site configs to storage */
export async function saveSiteConfigs(configs: SiteConfig[]): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.SITE_CONFIGS]: configs });
}

/** Add or update a site config */
export async function upsertSiteConfig(config: SiteConfig): Promise<void> {
  const configs = await loadSiteConfigs();
  const index = configs.findIndex((c) => c.id === config.id);
  if (index >= 0) {
    configs[index] = config;
  } else {
    configs.push(config);
  }
  await saveSiteConfigs(configs);
}

/** Delete a site config by id */
export async function deleteSiteConfig(id: string): Promise<void> {
  const configs = await loadSiteConfigs();
  await saveSiteConfigs(configs.filter((c) => c.id !== id));
}
