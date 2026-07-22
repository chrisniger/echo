import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  applyThemeClass,
  getInitialSystemPrefersDark,
  resolveTheme,
  subscribeSystemPrefersDark,
} from './theme';

describe('resolveTheme', () => {
  it.each([
    ['light', false, 'light'],
    ['light', true, 'light'],
    ['dark', false, 'dark'],
    ['dark', true, 'dark'],
    ['system', false, 'light'],
    ['system', true, 'dark'],
  ] as const)('theme=%s, systemPrefsDark=%s -> %s', (theme, sys, expected) => {
    expect(resolveTheme(theme, sys)).toBe(expected);
  });
});

describe('applyThemeClass', () => {
  beforeEach(() => {
    document.documentElement.classList.remove('dark');
  });

  it('adds dark when resolved is dark', () => {
    applyThemeClass('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('removes dark when resolved is light', () => {
    document.documentElement.classList.add('dark');
    applyThemeClass('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });

  it('is idempotent — adding dark twice does not duplicate', () => {
    applyThemeClass('dark');
    applyThemeClass('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
  });

  it('resilient when documentElement classList is touched mid-call', () => {
    applyThemeClass('dark');
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    applyThemeClass('light');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('subscribeSystemPrefersDark', () => {
  type Listener = (e: MediaQueryListEvent) => void;

  let currentMatches = false;
  let registeredListener: Listener | null = null;

  beforeEach(() => {
    currentMatches = false;
    registeredListener = null;

    const mql = {
      get matches() {
        return currentMatches;
      },
      addEventListener: vi.fn((_evt: string, cb: Listener) => {
        registeredListener = cb;
      }),
      removeEventListener: vi.fn((_evt: string, cb: Listener) => {
        if (registeredListener === cb) registeredListener = null;
      }),
    };
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => mql),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits the current OS preference immediately on subscribe', () => {
    currentMatches = true;
    const cb = vi.fn();
    subscribeSystemPrefersDark(cb);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('forwards subsequent change events to the callback', () => {
    currentMatches = false;
    const cb = vi.fn();
    subscribeSystemPrefersDark(cb);
    cb.mockClear();
    registeredListener!({ matches: true } as MediaQueryListEvent);
    expect(cb).toHaveBeenCalledWith(true);
  });

  it('returns a teardown that removes the change listener', () => {
    const cb = vi.fn();
    const unsubscribe = subscribeSystemPrefersDark(cb);
    unsubscribe();
    expect(registeredListener).toBeNull();
  });
});

describe('getInitialSystemPrefersDark', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('returns true when matchMedia reports prefers-color-scheme: dark', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: true })),
    );
    expect(getInitialSystemPrefersDark()).toBe(true);
  });

  it('returns false when matchMedia reports light', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    expect(getInitialSystemPrefersDark()).toBe(false);
  });

  it('defaults to true when matchMedia is missing', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(getInitialSystemPrefersDark()).toBe(true);
  });
});
