import type {
  ConfigExport,
  SiteConfig,
  ControlConfig,
  ControlType,
} from '../shared/types.js';
import { CONFIG_EXPORT_VERSION } from '../shared/types.js';

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export type ImportResult =
  | { ok: true; data: ConfigExport }
  | { ok: false; error: string };

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

/** Wrap site configs in a versioned export envelope. */
export function buildExport(configs: SiteConfig[]): ConfigExport {
  return {
    version: CONFIG_EXPORT_VERSION,
    exportedAt: Date.now(),
    siteConfigs: configs,
  };
}

/** Serialize a ConfigExport to pretty-printed JSON. */
export function exportToJson(data: ConfigExport): string {
  return JSON.stringify(data, null, 2);
}

/** Serialize a ConfigExport to a base64url-encoded string. */
export function exportToEncodedString(data: ConfigExport): string {
  return toBase64Url(JSON.stringify(data));
}

// ---------------------------------------------------------------------------
// Import
// ---------------------------------------------------------------------------

/** Parse and validate a JSON string as a ConfigExport. */
export function importFromJson(json: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return { ok: false, error: 'Invalid JSON' };
  }
  return validateAndReturn(parsed);
}

/** Decode a base64url string and validate as a ConfigExport. */
export function importFromEncodedString(encoded: string): ImportResult {
  let json: string;
  try {
    json = fromBase64Url(encoded.trim());
  } catch {
    return { ok: false, error: 'Invalid encoded string' };
  }
  return importFromJson(json);
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/** Encode a UTF-8 string to base64url (no padding). */
export function toBase64Url(str: string): string {
  // Encode to UTF-8 bytes, then to base64
  const b64 = btoa(
    String.fromCodePoint(
      ...new TextEncoder().encode(str),
    ),
  );
  // Make URL-safe: replace + with -, / with _, strip padding =
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Decode a base64url string to UTF-8. */
export function fromBase64Url(b64: string): string {
  // Restore standard base64: replace - with +, _ with /
  let standard = b64.replace(/-/g, '+').replace(/_/g, '/');
  // Re-add padding
  const pad = (4 - (standard.length % 4)) % 4;
  standard += '='.repeat(pad);
  // Decode base64 to bytes, then UTF-8
  const binary = atob(standard);
  const bytes = Uint8Array.from(binary, (c) => c.codePointAt(0)!);
  return new TextDecoder().decode(bytes);
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

const KNOWN_CONTROL_TYPES: readonly ControlType[] = [
  'time-limit',
  'nav-frequency',
  'degradation',
  'speed-bump',
];

function validateAndReturn(data: unknown): ImportResult {
  const result = validateExport(data);
  if (!result.valid) {
    return { ok: false, error: result.errors.join('; ') };
  }
  return { ok: true, data: data as ConfigExport };
}

/** Validate a parsed object as a ConfigExport envelope. */
export function validateExport(data: unknown): ValidationResult {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return { valid: false, errors: ['Expected an object'] };
  }

  const obj = data as Record<string, unknown>;

  if (obj.version !== CONFIG_EXPORT_VERSION) {
    errors.push(
      `Unsupported version: ${String(obj.version)} (expected ${CONFIG_EXPORT_VERSION})`,
    );
  }

  if (typeof obj.exportedAt !== 'number') {
    errors.push('Missing or invalid exportedAt timestamp');
  }

  if (!Array.isArray(obj.siteConfigs)) {
    errors.push('Missing or invalid siteConfigs array');
  } else {
    for (let i = 0; i < obj.siteConfigs.length; i++) {
      const siteErrors = validateSiteConfig(obj.siteConfigs[i]);
      for (const err of siteErrors) {
        errors.push(`siteConfigs[${i}]: ${err}`);
      }
    }
  }

  return errors.length === 0
    ? { valid: true }
    : { valid: false, errors };
}

/** Validate a single SiteConfig object, returning error messages. */
export function validateSiteConfig(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return ['Expected an object'];
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.id !== 'string') {
    errors.push('Missing or invalid id');
  }
  if (typeof obj.domainPattern !== 'string') {
    errors.push('Missing or invalid domainPattern');
  }
  if (typeof obj.enabled !== 'boolean') {
    errors.push('Missing or invalid enabled field');
  }

  if (!Array.isArray(obj.controls)) {
    errors.push('Missing or invalid controls array');
  } else {
    for (let i = 0; i < obj.controls.length; i++) {
      const controlErrors = validateControlConfig(obj.controls[i]);
      for (const err of controlErrors) {
        errors.push(`controls[${i}]: ${err}`);
      }
    }
  }

  return errors;
}

/** Validate a single ControlConfig object, returning error messages. */
export function validateControlConfig(data: unknown): string[] {
  const errors: string[] = [];

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    return ['Expected an object'];
  }

  const obj = data as Record<string, unknown>;

  if (typeof obj.enabled !== 'boolean') {
    errors.push('Missing or invalid enabled field');
  }

  if (!KNOWN_CONTROL_TYPES.includes(obj.type as ControlType)) {
    errors.push(`Unknown control type: ${String(obj.type)}`);
    return errors;
  }

  switch (obj.type) {
    case 'time-limit':
      if (typeof obj.maxMinutes !== 'number') errors.push('Missing maxMinutes');
      if (typeof obj.windowMinutes !== 'number') errors.push('Missing windowMinutes');
      break;
    case 'nav-frequency':
      if (typeof obj.maxNavigations !== 'number') errors.push('Missing maxNavigations');
      if (typeof obj.windowMinutes !== 'number') errors.push('Missing windowMinutes');
      break;
    case 'degradation':
      if (obj.effect !== 'grayscale') errors.push('Missing or invalid effect');
      if (typeof obj.trigger !== 'object' || obj.trigger === null) {
        errors.push('Missing trigger');
      }
      break;
    case 'speed-bump':
      if (typeof obj.delaySeconds !== 'number') errors.push('Missing delaySeconds');
      break;
  }

  return errors;
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/**
 * Merge incoming configs into existing configs.
 * Matches by domainPattern (case-insensitive). On conflict, incoming wins.
 * All incoming configs get fresh UUIDs.
 */
export function mergeConfigs(
  existing: SiteConfig[],
  incoming: SiteConfig[],
): SiteConfig[] {
  const incomingWithIds = regenerateIds(incoming);

  // Build a set of domain patterns from incoming (lowercased for matching)
  const incomingDomains = new Set(
    incomingWithIds.map((c) => c.domainPattern.toLowerCase()),
  );

  // Keep existing configs whose domain doesn't conflict with incoming
  const kept = existing.filter(
    (c) => !incomingDomains.has(c.domainPattern.toLowerCase()),
  );

  return [...kept, ...incomingWithIds];
}

// ---------------------------------------------------------------------------
// Post-processing
// ---------------------------------------------------------------------------

/** Return a deep copy of configs with fresh UUIDs. */
export function regenerateIds(configs: SiteConfig[]): SiteConfig[] {
  return configs.map((c) => ({
    ...structuredClone(c),
    id: crypto.randomUUID(),
  }));
}
