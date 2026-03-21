import type { DomainPattern, SiteConfig } from './types.js';

/**
 * Extract the hostname from a URL string.
 * Returns null for non-http(s) URLs (e.g. chrome://, about:).
 */
export function extractHostname(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }
    return parsed.hostname;
  } catch {
    return null;
  }
}

/**
 * Check if a hostname matches a domain pattern.
 *
 * Pattern rules:
 * - "reddit.com" matches "reddit.com" and "www.reddit.com" and "old.reddit.com"
 *   (any subdomain of reddit.com, or reddit.com itself)
 * - "*.reddit.com" matches only subdomains, not "reddit.com" itself
 * - "www.reddit.com" matches only "www.reddit.com" exactly
 *
 * The key insight: a bare domain like "reddit.com" is the most common config
 * and should match the domain itself plus any subdomain.
 */
export function matchesDomainPattern(
  hostname: string,
  pattern: DomainPattern,
): boolean {
  const normalizedHost = hostname.toLowerCase();
  const normalizedPattern = pattern.toLowerCase();

  // Wildcard pattern: "*.example.com"
  if (normalizedPattern.startsWith('*.')) {
    const baseDomain = normalizedPattern.slice(2);
    // Must be a subdomain - not the base domain itself
    return (
      normalizedHost.endsWith('.' + baseDomain) &&
      normalizedHost !== baseDomain
    );
  }

  // Exact or subdomain match: "example.com" matches "example.com",
  // "www.example.com", "old.example.com", etc.
  if (normalizedHost === normalizedPattern) {
    return true;
  }
  return normalizedHost.endsWith('.' + normalizedPattern);
}

/**
 * Find the first matching SiteConfig for a URL.
 * Returns null if no config matches.
 */
export function findMatchingSiteConfig(
  url: string,
  configs: SiteConfig[],
): SiteConfig | null {
  const hostname = extractHostname(url);
  if (!hostname) return null;

  for (const config of configs) {
    if (config.enabled && matchesDomainPattern(hostname, config.domainPattern)) {
      return config;
    }
  }
  return null;
}

/**
 * Find the matching domain pattern for a hostname from a list of configs.
 * Returns the domain pattern string, or null if no match.
 */
export function findMatchingDomainPattern(
  hostname: string,
  configs: SiteConfig[],
): DomainPattern | null {
  for (const config of configs) {
    if (config.enabled && matchesDomainPattern(hostname, config.domainPattern)) {
      return config.domainPattern;
    }
  }
  return null;
}
