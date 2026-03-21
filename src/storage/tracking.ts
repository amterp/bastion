import type { DomainPattern, ControlType } from '../shared/types.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import type {
  TrackingStore,
  SiteTrackingData,
  ActiveSession,
  SpeedBumpClearance,
} from './schema.js';
import { emptySiteTrackingData } from './schema.js';

// --- Tracking Store ---

export async function loadTrackingStore(): Promise<TrackingStore> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TRACKING);
  return (result[STORAGE_KEYS.TRACKING] as TrackingStore | undefined) ?? {};
}

export async function saveTrackingStore(store: TrackingStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.TRACKING]: store });
}

export async function getTrackingData(
  domain: DomainPattern,
): Promise<SiteTrackingData> {
  const store = await loadTrackingStore();
  return store[domain] ?? emptySiteTrackingData();
}

export async function updateTrackingData(
  domain: DomainPattern,
  data: SiteTrackingData,
): Promise<void> {
  const store = await loadTrackingStore();
  store[domain] = data;
  await saveTrackingStore(store);
}

// --- Active Session ---

export async function loadActiveSession(): Promise<ActiveSession | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSION);
  return (result[STORAGE_KEYS.ACTIVE_SESSION] as ActiveSession | undefined) ?? null;
}

export async function saveActiveSession(
  session: ActiveSession | null,
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSION]: session });
}

// --- Speed Bump Clearances ---

export async function loadClearances(): Promise<SpeedBumpClearance[]> {
  const result = await chrome.storage.local.get(
    STORAGE_KEYS.SPEED_BUMP_CLEARANCES,
  );
  return (
    (result[STORAGE_KEYS.SPEED_BUMP_CLEARANCES] as
      | SpeedBumpClearance[]
      | undefined) ?? []
  );
}

export async function saveClearances(
  clearances: SpeedBumpClearance[],
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SPEED_BUMP_CLEARANCES]: clearances,
  });
}

/** Add a clearance and prune expired ones */
export async function addClearance(
  clearance: SpeedBumpClearance,
): Promise<void> {
  const now = Date.now();
  const existing = await loadClearances();
  const valid = existing.filter((c) => c.expiresAt > now);
  valid.push(clearance);
  await saveClearances(valid);
}

/** Check if a URL has an active clearance */
export async function hasClearance(url: string): Promise<boolean> {
  const now = Date.now();
  const clearances = await loadClearances();
  return clearances.some((c) => c.url === url && c.expiresAt > now);
}

// --- Bypass Helpers ---

/** Record a bypass activation for a control type on a domain */
export async function recordBypass(
  domain: DomainPattern,
  controlType: ControlType,
  durationMinutes: number,
): Promise<void> {
  const data = await getTrackingData(domain);
  const now = Date.now();
  if (!data.bypasses[controlType]) {
    data.bypasses[controlType] = [];
  }
  data.bypasses[controlType]!.push({
    timestamp: now,
    expiresAt: now + durationMinutes * 60_000,
  });
  await updateTrackingData(domain, data);
}

/** Check if a bypass is currently active for a control type */
export function hasActiveBypass(
  data: SiteTrackingData,
  controlType: ControlType,
  now: number,
): boolean {
  const entries = data.bypasses[controlType];
  if (!entries) return false;
  return entries.some((e) => e.expiresAt > now);
}

/** Count bypasses used within the given window */
export function countBypassesInWindow(
  data: SiteTrackingData,
  controlType: ControlType,
  windowMinutes: number,
  now: number,
): number {
  const entries = data.bypasses[controlType];
  if (!entries) return 0;
  const windowStart = now - windowMinutes * 60_000;
  return entries.filter((e) => e.timestamp >= windowStart).length;
}
