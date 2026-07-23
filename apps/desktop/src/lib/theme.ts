import type { UserSettings } from '@echo-gpt/shared-types';

/**
 * Theme helper module.
 *
 * Pure functions only — no React, no Zustand. Safe to import from any
 * environment (browser, SSR, test). The companion `useThemeEffect` hook
 * wires these helpers into React state; the inline script in
 * `apps/desktop/index.html` wires them into pre-React bootstrap to
 * prevent FOUC.
 */

/**
 * Resolve the configured theme choice to the concrete theme that should
 * apply right now. 'system' resolves via the OS `prefers-color-scheme`
 * media query. The other two values pass through unchanged.
 *
 * @param theme - The user's chosen value from settings ('light' | 'dark' | 'system')
 * @param systemPrefersDark - The current OS preference (true if the OS is in dark mode)
 * @returns 'light' or 'dark' — never 'system'
 */
export function resolveTheme(
  theme: UserSettings['theme'],
  systemPrefersDark: boolean,
): 'light' | 'dark' {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

/**
 * Toggle Tailwind's `dark` class on `document.documentElement` so that
 * `dark:` variant utilities activate when resolved is 'dark'.
 *
 * Idempotent: calling with the same `resolved` repeatedly is a no-op.
 * Safe to call during SSR (no `document` available) — falls through.
 */
export function applyThemeClass(resolved: 'light' | 'dark'): void {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  if (resolved === 'dark') {
    if (!root.classList.contains('dark')) root.classList.add('dark');
  } else {
    if (root.classList.contains('dark')) root.classList.remove('dark');
  }
}

/**
 * Synchronously read the OS's `prefers-color-scheme: dark` media query.
 * Returns `true` (dark) as a safe default when `matchMedia` is unavailable
 * (e.g., older webviews, SSR) so that the initial paint matches the
 * app's pre-existing dark styling.
 */
export function getInitialSystemPrefersDark(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return true;
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return true;
  }
}

/**
 * Subscribe to OS theme changes. Returns a teardown that removes the
 * listener. Falls back to the legacy `addListener`/`removeListener`
 * MediaQueryList API when `addEventListener` isn't supported.
 *
 * Calls `callback(prefersDark)` immediately with the *current* value too,
 * so callers don't need a separate "initial" call.
 */
export function subscribeSystemPrefersDark(callback: (prefersDark: boolean) => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) {
    // No matchMedia support — just emit the safe default once.
    callback(true);
    return () => {
      /* no-op */
    };
  }

  const mql = window.matchMedia('(prefers-color-scheme: dark)');
  callback(mql.matches);

  const onChange = (event: MediaQueryListEvent | MediaQueryList) => {
    callback(event.matches);
  };

  if (typeof mql.addEventListener === 'function') {
    mql.addEventListener('change', onChange as (e: Event) => void);
    return () => mql.removeEventListener('change', onChange as (e: Event) => void);
  }

  // Legacy Safari path.
  const legacy = mql as unknown as {
    addListener: (cb: (ev: MediaQueryListEvent) => void) => void;
    removeListener: (cb: (ev: MediaQueryListEvent) => void) => void;
  };
  if (typeof legacy.addListener === 'function') {
    legacy.addListener(onChange);
    return () => legacy.removeListener(onChange);
  }

  return () => {
    /* nothing to clean up — matchMedia exists but has no listener API */
  };
}
