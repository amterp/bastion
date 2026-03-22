import { describe, it, expect, vi } from 'vitest';
import type { SiteConfig, ConfigExport } from '../shared/types.js';
import { CONFIG_EXPORT_VERSION } from '../shared/types.js';
import {
  buildExport,
  exportToJson,
  exportToEncodedString,
  importFromJson,
  importFromEncodedString,
  toBase64Url,
  fromBase64Url,
  validateExport,
  validateSiteConfig,
  validateControlConfig,
  mergeConfigs,
  regenerateIds,
} from './portability.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeSiteConfig(overrides: Partial<SiteConfig> = {}): SiteConfig {
  return {
    id: 'test-id-1',
    domainPattern: 'reddit.com',
    enabled: true,
    controls: [
      {
        type: 'time-limit',
        enabled: true,
        maxMinutes: 30,
        windowMinutes: 120,
      },
    ],
    ...overrides,
  };
}

function makeExport(configs?: SiteConfig[]): ConfigExport {
  return {
    version: CONFIG_EXPORT_VERSION,
    exportedAt: Date.now(),
    siteConfigs: configs ?? [makeSiteConfig()],
  };
}

// ---------------------------------------------------------------------------
// buildExport
// ---------------------------------------------------------------------------

describe('buildExport', () => {
  it('wraps configs in versioned envelope', () => {
    const configs = [makeSiteConfig()];
    const result = buildExport(configs);
    expect(result.version).toBe(CONFIG_EXPORT_VERSION);
    expect(result.siteConfigs).toEqual(configs);
  });

  it('includes epoch millis timestamp', () => {
    const before = Date.now();
    const result = buildExport([]);
    const after = Date.now();
    expect(result.exportedAt).toBeGreaterThanOrEqual(before);
    expect(result.exportedAt).toBeLessThanOrEqual(after);
  });
});

// ---------------------------------------------------------------------------
// exportToJson
// ---------------------------------------------------------------------------

describe('exportToJson', () => {
  it('produces valid JSON', () => {
    const data = makeExport();
    const json = exportToJson(data);
    expect(() => JSON.parse(json)).not.toThrow();
    expect(JSON.parse(json)).toEqual(data);
  });
});

// ---------------------------------------------------------------------------
// toBase64Url / fromBase64Url
// ---------------------------------------------------------------------------

describe('toBase64Url / fromBase64Url', () => {
  it('round-trips ASCII strings', () => {
    const input = 'hello world 123!';
    expect(fromBase64Url(toBase64Url(input))).toBe(input);
  });

  it('round-trips strings with unicode', () => {
    const input = 'caf\u00e9 \u2603 \ud83d\ude80';
    expect(fromBase64Url(toBase64Url(input))).toBe(input);
  });

  it('produces URL-safe output (no +, /, or =)', () => {
    // Use input that would produce +, /, and = in standard base64
    const input = '>>>>>>????';
    const encoded = toBase64Url(input);
    expect(encoded).not.toMatch(/[+/=]/);
  });

  it('handles empty string', () => {
    expect(fromBase64Url(toBase64Url(''))).toBe('');
  });
});

// ---------------------------------------------------------------------------
// exportToEncodedString / importFromEncodedString
// ---------------------------------------------------------------------------

describe('exportToEncodedString / importFromEncodedString', () => {
  it('round-trips a config export', () => {
    const data = makeExport();
    const encoded = exportToEncodedString(data);
    const result = importFromEncodedString(encoded);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(data);
    }
  });

  it('rejects invalid base64', () => {
    const result = importFromEncodedString('!!!not-base64!!!');
    expect(result.ok).toBe(false);
  });

  it('rejects valid base64 containing invalid JSON', () => {
    const result = importFromEncodedString(toBase64Url('not json {{{'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Invalid JSON');
    }
  });

  it('trims whitespace from input', () => {
    const data = makeExport();
    const encoded = '  ' + exportToEncodedString(data) + '  \n';
    const result = importFromEncodedString(encoded);
    expect(result.ok).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// importFromJson
// ---------------------------------------------------------------------------

describe('importFromJson', () => {
  it('parses valid export JSON', () => {
    const data = makeExport();
    const result = importFromJson(JSON.stringify(data));
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data).toEqual(data);
    }
  });

  it('returns error for invalid JSON syntax', () => {
    const result = importFromJson('{{bad');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('Invalid JSON');
    }
  });

  it('returns error for missing version', () => {
    const result = importFromJson(JSON.stringify({ exportedAt: 123, siteConfigs: [] }));
    expect(result.ok).toBe(false);
  });

  it('returns error for wrong version number', () => {
    const result = importFromJson(
      JSON.stringify({ version: 99, exportedAt: 123, siteConfigs: [] }),
    );
    expect(result.ok).toBe(false);
  });

  it('returns error for missing siteConfigs', () => {
    const result = importFromJson(JSON.stringify({ version: 1, exportedAt: 123 }));
    expect(result.ok).toBe(false);
  });

  it('returns error for siteConfigs that is not an array', () => {
    const result = importFromJson(
      JSON.stringify({ version: 1, exportedAt: 123, siteConfigs: 'nope' }),
    );
    expect(result.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// validateExport
// ---------------------------------------------------------------------------

describe('validateExport', () => {
  it('accepts valid export object', () => {
    expect(validateExport(makeExport())).toEqual({ valid: true });
  });

  it('rejects non-object input', () => {
    expect(validateExport('string').valid).toBe(false);
    expect(validateExport(null).valid).toBe(false);
    expect(validateExport(42).valid).toBe(false);
    expect(validateExport([]).valid).toBe(false);
  });

  it('rejects missing version', () => {
    const result = validateExport({ exportedAt: 123, siteConfigs: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects unsupported version', () => {
    const result = validateExport({ version: 2, exportedAt: 123, siteConfigs: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects missing exportedAt', () => {
    const result = validateExport({ version: 1, siteConfigs: [] });
    expect(result.valid).toBe(false);
  });

  it('rejects missing siteConfigs', () => {
    const result = validateExport({ version: 1, exportedAt: 123 });
    expect(result.valid).toBe(false);
  });

  it('propagates site config errors', () => {
    const result = validateExport({
      version: 1,
      exportedAt: 123,
      siteConfigs: [{ bad: true }],
    });
    expect(result.valid).toBe(false);
    if (!result.valid) {
      expect(result.errors.some((e) => e.startsWith('siteConfigs[0]'))).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// validateSiteConfig
// ---------------------------------------------------------------------------

describe('validateSiteConfig', () => {
  it('accepts valid config with all control types', () => {
    const config = makeSiteConfig({
      controls: [
        { type: 'time-limit', enabled: true, maxMinutes: 30, windowMinutes: 120 },
        { type: 'nav-frequency', enabled: true, maxNavigations: 5, windowMinutes: 60 },
        {
          type: 'degradation',
          enabled: true,
          effect: 'grayscale',
          trigger: { type: 'time-of-day', afterHour: 22 },
        },
        { type: 'speed-bump', enabled: true, delaySeconds: 10 },
      ],
    });
    expect(validateSiteConfig(config)).toEqual([]);
  });

  it('reports missing domainPattern', () => {
    const { domainPattern, ...rest } = makeSiteConfig();
    const errors = validateSiteConfig(rest);
    expect(errors.some((e) => e.includes('domainPattern'))).toBe(true);
  });

  it('reports missing enabled field', () => {
    const { enabled, ...rest } = makeSiteConfig();
    const errors = validateSiteConfig(rest);
    expect(errors.some((e) => e.includes('enabled'))).toBe(true);
  });

  it('reports missing controls array', () => {
    const { controls, ...rest } = makeSiteConfig();
    const errors = validateSiteConfig(rest);
    expect(errors.some((e) => e.includes('controls'))).toBe(true);
  });

  it('reports invalid control within controls array', () => {
    const config = makeSiteConfig({ controls: [{ type: 'bogus' } as any] });
    const errors = validateSiteConfig(config);
    expect(errors.some((e) => e.includes('controls[0]'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// validateControlConfig
// ---------------------------------------------------------------------------

describe('validateControlConfig', () => {
  it('accepts valid time-limit config', () => {
    expect(
      validateControlConfig({
        type: 'time-limit',
        enabled: true,
        maxMinutes: 30,
        windowMinutes: 120,
      }),
    ).toEqual([]);
  });

  it('accepts valid nav-frequency config', () => {
    expect(
      validateControlConfig({
        type: 'nav-frequency',
        enabled: true,
        maxNavigations: 5,
        windowMinutes: 60,
      }),
    ).toEqual([]);
  });

  it('accepts valid degradation config with time-of-day trigger', () => {
    expect(
      validateControlConfig({
        type: 'degradation',
        enabled: true,
        effect: 'grayscale',
        trigger: { type: 'time-of-day', afterHour: 22 },
      }),
    ).toEqual([]);
  });

  it('accepts valid degradation config with time-on-site trigger', () => {
    expect(
      validateControlConfig({
        type: 'degradation',
        enabled: true,
        effect: 'grayscale',
        trigger: { type: 'time-on-site', afterMinutes: 15 },
      }),
    ).toEqual([]);
  });

  it('accepts valid speed-bump config', () => {
    expect(
      validateControlConfig({
        type: 'speed-bump',
        enabled: true,
        delaySeconds: 10,
      }),
    ).toEqual([]);
  });

  it('rejects unknown control type', () => {
    const errors = validateControlConfig({ type: 'bogus', enabled: true });
    expect(errors.some((e) => e.includes('Unknown control type'))).toBe(true);
  });

  it('reports missing required fields for time-limit', () => {
    const errors = validateControlConfig({ type: 'time-limit', enabled: true });
    expect(errors.some((e) => e.includes('maxMinutes'))).toBe(true);
    expect(errors.some((e) => e.includes('windowMinutes'))).toBe(true);
  });

  it('reports missing required fields for nav-frequency', () => {
    const errors = validateControlConfig({ type: 'nav-frequency', enabled: true });
    expect(errors.some((e) => e.includes('maxNavigations'))).toBe(true);
    expect(errors.some((e) => e.includes('windowMinutes'))).toBe(true);
  });

  it('reports missing trigger for degradation', () => {
    const errors = validateControlConfig({
      type: 'degradation',
      enabled: true,
      effect: 'grayscale',
    });
    expect(errors.some((e) => e.includes('trigger'))).toBe(true);
  });

  it('reports missing delaySeconds for speed-bump', () => {
    const errors = validateControlConfig({ type: 'speed-bump', enabled: true });
    expect(errors.some((e) => e.includes('delaySeconds'))).toBe(true);
  });

  it('reports missing enabled field', () => {
    const errors = validateControlConfig({
      type: 'time-limit',
      maxMinutes: 30,
      windowMinutes: 120,
    });
    expect(errors.some((e) => e.includes('enabled'))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// mergeConfigs
// ---------------------------------------------------------------------------

describe('mergeConfigs', () => {
  it('keeps all configs when no overlap', () => {
    const existing = [makeSiteConfig({ domainPattern: 'reddit.com' })];
    const incoming = [makeSiteConfig({ domainPattern: 'twitter.com' })];
    const result = mergeConfigs(existing, incoming);
    expect(result).toHaveLength(2);
    const domains = result.map((c) => c.domainPattern);
    expect(domains).toContain('reddit.com');
    expect(domains).toContain('twitter.com');
  });

  it('incoming wins on conflict', () => {
    const existing = [
      makeSiteConfig({
        domainPattern: 'reddit.com',
        controls: [{ type: 'time-limit', enabled: true, maxMinutes: 30, windowMinutes: 120 }],
      }),
    ];
    const incoming = [
      makeSiteConfig({
        domainPattern: 'reddit.com',
        controls: [{ type: 'speed-bump', enabled: true, delaySeconds: 15 }],
      }),
    ];
    const result = mergeConfigs(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].controls[0].type).toBe('speed-bump');
  });

  it('handles partial overlap', () => {
    const existing = [
      makeSiteConfig({ domainPattern: 'reddit.com' }),
      makeSiteConfig({ domainPattern: 'youtube.com' }),
    ];
    const incoming = [
      makeSiteConfig({ domainPattern: 'reddit.com' }),
      makeSiteConfig({ domainPattern: 'twitter.com' }),
    ];
    const result = mergeConfigs(existing, incoming);
    expect(result).toHaveLength(3);
    const domains = result.map((c) => c.domainPattern);
    expect(domains).toContain('youtube.com');
    expect(domains).toContain('reddit.com');
    expect(domains).toContain('twitter.com');
  });

  it('matches domain patterns case-insensitively', () => {
    const existing = [makeSiteConfig({ domainPattern: 'Reddit.com' })];
    const incoming = [makeSiteConfig({ domainPattern: 'reddit.com' })];
    const result = mergeConfigs(existing, incoming);
    expect(result).toHaveLength(1);
    expect(result[0].domainPattern).toBe('reddit.com');
  });

  it('regenerates IDs on incoming configs', () => {
    const incoming = [makeSiteConfig({ id: 'original-id' })];
    const result = mergeConfigs([], incoming);
    expect(result[0].id).not.toBe('original-id');
  });
});

// ---------------------------------------------------------------------------
// regenerateIds
// ---------------------------------------------------------------------------

describe('regenerateIds', () => {
  it('produces new UUIDs for all configs', () => {
    const configs = [
      makeSiteConfig({ id: 'id-1' }),
      makeSiteConfig({ id: 'id-2' }),
    ];
    const result = regenerateIds(configs);
    expect(result[0].id).not.toBe('id-1');
    expect(result[1].id).not.toBe('id-2');
    // Each ID should be unique
    expect(result[0].id).not.toBe(result[1].id);
  });

  it('does not mutate the original array', () => {
    const configs = [makeSiteConfig({ id: 'original' })];
    regenerateIds(configs);
    expect(configs[0].id).toBe('original');
  });

  it('preserves all other config data', () => {
    const config = makeSiteConfig({
      domainPattern: 'example.com',
      enabled: false,
      controls: [
        { type: 'speed-bump', enabled: true, delaySeconds: 5 },
      ],
    });
    const result = regenerateIds([config]);
    expect(result[0].domainPattern).toBe('example.com');
    expect(result[0].enabled).toBe(false);
    expect(result[0].controls).toEqual(config.controls);
  });
});
