import type { DomainPattern, ControlType } from '../shared/types.js';
import { STORAGE_KEYS } from '../shared/constants.js';
import { minutesToMs } from '../shared/time-utils.js';
import type {
  TrackingStore,
  SiteTrackingData,
  ActiveSession,
  SpeedBumpClearance,
} from './schema.js';
import { emptySiteTrackingData } from './schema.js';

// --- Async write mutex ---
// Serializes all read-modify-write operations on the tracking store
// to prevent concurrent event handlers from clobbering each other's writes.

let writeQueue: Promise<void> = Promise.resolve();

/**
 * Run a mutating operation on the tracking store with serialized access.
 * Each operation gets a fresh read, mutates, and writes back. Concurrent
 * callers are queued and run in order.
 */
function withTrackingStore(
  fn: (store: TrackingStore) => TrackingStore | void,
): Promise<void> {
  writeQueue = writeQueue.then(async () => {
    const store = await loadTrackingStoreRaw();
    const result = fn(store);
    await saveTrackingStoreRaw(result ?? store);
  });
  return writeQueue;
}

// --- Raw storage access (not serialized - use withTrackingStore for writes) ---

async function loadTrackingStoreRaw(): Promise<TrackingStore> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TRACKING);
  return (result[STORAGE_KEYS.TRACKING] as TrackingStore | undefined) ?? {};
}

async function saveTrackingStoreRaw(store: TrackingStore): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.TRACKING]: store });
}

// --- Public read access (no lock needed for reads) ---

export async function loadTrackingStore(): Promise<TrackingStore> {
  return loadTrackingStoreRaw();
}

export async function getTrackingData(
  domain: DomainPattern,
): Promise<SiteTrackingData> {
  const store = await loadTrackingStoreRaw();
  return store[domain] ?? emptySiteTrackingData();
}

// --- Serialized write operations ---

export function updateTrackingData(
  domain: DomainPattern,
  data: SiteTrackingData,
): Promise<void> {
  return withTrackingStore((store) => {
    store[domain] = data;
  });
}

/**
 * Atomically read-modify-write tracking data for a domain.
 * The mutator receives the current data and should mutate it in place.
 */
export function mutateTrackingData(
  domain: DomainPattern,
  mutator: (data: SiteTrackingData) => void,
): Promise<void> {
  return withTrackingStore((store) => {
    if (!store[domain]) {
      store[domain] = emptySiteTrackingData();
    }
    mutator(store[domain]);
  });
}

/** Save an entire tracking store (used by pruning) */
export function saveTrackingStore(store: TrackingStore): Promise<void> {
  // This bypasses the mutex because pruning already reads its own copy.
  // Safe because pruning runs serially from the alarm handler.
  return saveTrackingStoreRaw(store);
}

// --- Active Session ---

export async function loadActiveSession(): Promise<ActiveSession | null> {
  const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_SESSION);
  return (result[STORAGE_KEYS.ACTIVE_SESSION] as ActiveSession | undefined) ?? null;
}

export async function saveActiveSession(
  session: ActiveSession,
): Promise<void> {
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_SESSION]: session });
}

export async function clearActiveSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.ACTIVE_SESSION);
}

// --- Speed Bump Clearances (domain-based, not URL-based) ---

async function loadClearances(): Promise<SpeedBumpClearance[]> {
  const result = await chrome.storage.local.get(
    STORAGE_KEYS.SPEED_BUMP_CLEARANCES,
  );
  return (
    (result[STORAGE_KEYS.SPEED_BUMP_CLEARANCES] as
      | SpeedBumpClearance[]
      | undefined) ?? []
  );
}

async function saveClearances(
  clearances: SpeedBumpClearance[],
): Promise<void> {
  await chrome.storage.local.set({
    [STORAGE_KEYS.SPEED_BUMP_CLEARANCES]: clearances,
  });
}

/** Add a clearance for a domain and prune expired ones */
export async function addClearance(
  clearance: SpeedBumpClearance,
): Promise<void> {
  const now = Date.now();
  const existing = await loadClearances();
  const valid = existing.filter((c) => c.expiresAt > now);
  valid.push(clearance);
  await saveClearances(valid);
}

/** Check if a domain has an active clearance */
export async function hasClearance(domain: DomainPattern): Promise<boolean> {
  const now = Date.now();
  const clearances = await loadClearances();
  return clearances.some((c) => c.domain === domain && c.expiresAt > now);
}

// --- Bypass Helpers ---

/** Record a bypass activation for a control type on a domain */
export function recordBypass(
  domain: DomainPattern,
  controlType: ControlType,
  durationMinutes: number,
): Promise<void> {
  const now = Date.now();
  return mutateTrackingData(domain, (data) => {
    if (!data.bypasses[controlType]) {
      data.bypasses[controlType] = [];
    }
    data.bypasses[controlType]!.push({
      timestamp: now,
      expiresAt: now + minutesToMs(durationMinutes),
    });
  });
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
  const windowStart = now - minutesToMs(windowMinutes);
  return entries.filter((e) => e.timestamp >= windowStart).length;
}
