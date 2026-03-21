import { describe, it, expect } from 'vitest';
import { extractHostname, matchesDomainPattern, findMatchingSiteConfig } from './url-utils.js';
import { isValidDomainPattern } from './types.js';
import type { SiteConfig } from './types.js';

describe('extractHostname', () => {
  it('extracts hostname from http URLs', () => {
    expect(extractHostname('http://reddit.com/r/all')).toBe('reddit.com');
    expect(extractHostname('https://www.reddit.com')).toBe('www.reddit.com');
    expect(extractHostname('https://old.reddit.com/r/programming')).toBe('old.reddit.com');
  });

  it('returns null for non-http URLs', () => {
    expect(extractHostname('chrome://extensions')).toBeNull();
    expect(extractHostname('about:blank')).toBeNull();
    expect(extractHostname('chrome-extension://abc/popup.html')).toBeNull();
  });

  it('returns null for invalid URLs', () => {
    expect(extractHostname('not-a-url')).toBeNull();
    expect(extractHostname('')).toBeNull();
  });
});

describe('isValidDomainPattern', () => {
  it('accepts valid domain patterns', () => {
    expect(isValidDomainPattern('reddit.com')).toBe(true);
    expect(isValidDomainPattern('www.reddit.com')).toBe(true);
    expect(isValidDomainPattern('*.reddit.com')).toBe(true);
  });

  it('rejects TLD-only patterns', () => {
    expect(isValidDomainPattern('com')).toBe(false);
    expect(isValidDomainPattern('net')).toBe(false);
    expect(isValidDomainPattern('org')).toBe(false);
  });

  it('rejects empty and malformed patterns', () => {
    expect(isValidDomainPattern('')).toBe(false);
    expect(isValidDomainPattern('.com')).toBe(false);
    expect(isValidDomainPattern('reddit.')).toBe(false);
  });
});

describe('matchesDomainPattern', () => {
  describe('bare domain pattern (e.g. "reddit.com")', () => {
    it('matches the exact domain', () => {
      expect(matchesDomainPattern('reddit.com', 'reddit.com')).toBe(true);
    });

    it('matches subdomains', () => {
      expect(matchesDomainPattern('www.reddit.com', 'reddit.com')).toBe(true);
      expect(matchesDomainPattern('old.reddit.com', 'reddit.com')).toBe(true);
      expect(matchesDomainPattern('a.b.reddit.com', 'reddit.com')).toBe(true);
    });

    it('does not match unrelated domains', () => {
      expect(matchesDomainPattern('noreddit.com', 'reddit.com')).toBe(false);
      expect(matchesDomainPattern('reddit.com.evil.com', 'reddit.com')).toBe(false);
    });

    it('is case-insensitive', () => {
      expect(matchesDomainPattern('Reddit.COM', 'reddit.com')).toBe(true);
      expect(matchesDomainPattern('www.Reddit.com', 'REDDIT.COM')).toBe(true);
    });
  });

  describe('wildcard pattern (e.g. "*.reddit.com")', () => {
    it('matches subdomains', () => {
      expect(matchesDomainPattern('www.reddit.com', '*.reddit.com')).toBe(true);
      expect(matchesDomainPattern('old.reddit.com', '*.reddit.com')).toBe(true);
    });

    it('does not match the base domain itself', () => {
      expect(matchesDomainPattern('reddit.com', '*.reddit.com')).toBe(false);
    });

    it('does not match unrelated domains', () => {
      expect(matchesDomainPattern('noreddit.com', '*.reddit.com')).toBe(false);
    });
  });

  describe('exact subdomain pattern (e.g. "www.reddit.com")', () => {
    it('matches the exact subdomain', () => {
      expect(matchesDomainPattern('www.reddit.com', 'www.reddit.com')).toBe(true);
    });

    it('matches deeper subdomains', () => {
      expect(matchesDomainPattern('a.www.reddit.com', 'www.reddit.com')).toBe(true);
    });

    it('does not match other subdomains', () => {
      expect(matchesDomainPattern('old.reddit.com', 'www.reddit.com')).toBe(false);
    });

    it('does not match the parent domain', () => {
      expect(matchesDomainPattern('reddit.com', 'www.reddit.com')).toBe(false);
    });
  });

  describe('TLD-only patterns are rejected', () => {
    it('does not match any hostname against a TLD pattern', () => {
      expect(matchesDomainPattern('reddit.com', 'com')).toBe(false);
      expect(matchesDomainPattern('google.net', 'net')).toBe(false);
    });
  });
});

describe('findMatchingSiteConfig', () => {
  const configs: SiteConfig[] = [
    {
      id: '1',
      domainPattern: 'reddit.com',
      controls: [],
      enabled: true,
    },
    {
      id: '2',
      domainPattern: 'twitter.com',
      controls: [],
      enabled: false,
    },
    {
      id: '3',
      domainPattern: 'youtube.com',
      controls: [],
      enabled: true,
    },
  ];

  it('returns the first matching enabled config', () => {
    const result = findMatchingSiteConfig('https://www.reddit.com/r/all', configs);
    expect(result?.id).toBe('1');
  });

  it('skips disabled configs', () => {
    const result = findMatchingSiteConfig('https://twitter.com', configs);
    expect(result).toBeNull();
  });

  it('returns null for non-matching URLs', () => {
    const result = findMatchingSiteConfig('https://google.com', configs);
    expect(result).toBeNull();
  });

  it('returns null for non-http URLs', () => {
    const result = findMatchingSiteConfig('chrome://extensions', configs);
    expect(result).toBeNull();
  });
});
