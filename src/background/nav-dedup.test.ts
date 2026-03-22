import { describe, it, expect, beforeEach } from 'vitest';
import {
  isFreshNavigation,
  getTabDomain,
  setTabDomain,
  clearTab,
  _resetForTest,
} from './nav-dedup.js';

describe('isFreshNavigation', () => {
  it('counts when no previous domain (new tab)', () => {
    expect(isFreshNavigation(null, 'reddit.com')).toBe(true);
  });

  it('counts when domain changes', () => {
    expect(isFreshNavigation('reddit.com', 'youtube.com')).toBe(true);
  });

  it('skips same-domain navigation', () => {
    expect(isFreshNavigation('reddit.com', 'reddit.com')).toBe(false);
  });

  it('skips when navigating to untracked site', () => {
    expect(isFreshNavigation('reddit.com', null)).toBe(false);
  });

  it('skips when both null (untracked to untracked)', () => {
    expect(isFreshNavigation(null, null)).toBe(false);
  });
});

describe('tab domain tracking', () => {
  beforeEach(() => {
    _resetForTest();
  });

  it('returns null for unknown tabs', () => {
    expect(getTabDomain(1)).toBeNull();
  });

  it('tracks domain for a tab', () => {
    setTabDomain(1, 'reddit.com');
    expect(getTabDomain(1)).toBe('reddit.com');
  });

  it('updates domain for a tab', () => {
    setTabDomain(1, 'reddit.com');
    setTabDomain(1, 'youtube.com');
    expect(getTabDomain(1)).toBe('youtube.com');
  });

  it('clears domain when set to null', () => {
    setTabDomain(1, 'reddit.com');
    setTabDomain(1, null);
    expect(getTabDomain(1)).toBeNull();
  });

  it('clears tab on removal', () => {
    setTabDomain(1, 'reddit.com');
    clearTab(1);
    expect(getTabDomain(1)).toBeNull();
  });

  it('tracks multiple tabs independently', () => {
    setTabDomain(1, 'reddit.com');
    setTabDomain(2, 'youtube.com');
    expect(getTabDomain(1)).toBe('reddit.com');
    expect(getTabDomain(2)).toBe('youtube.com');
  });
});
