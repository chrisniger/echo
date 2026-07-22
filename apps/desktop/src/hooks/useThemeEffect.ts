import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settings';
import {
  applyThemeClass,
  getInitialSystemPrefersDark,
  resolveTheme,
  subscribeSystemPrefersDark,
} from '../lib/theme';

/**
 * Side-effect-only hook — returns nothing. Mount it once near the root
 * of React to keep `<html>`'s `dark` class in sync with:
 *   1. The user's `theme` setting (from `useSettingsStore`).
 *   2. The OS `prefers-color-scheme` media query (only relevant when
 *      `theme === 'system'`).
 *
 * It does not render anything. The pre-React inline script in
 * `index.html` handles the *initial* paint to avoid FOUC; this hook
 * takes over after mount so subsequent user clicks on the Light/Dark/
 * System buttons update the DOM live.
 */
export function useThemeEffect(): void {
  const theme = useSettingsStore((s) => s.settings.theme);
  const [systemPrefersDark, setSystemPrefersDark] = useState<boolean>(getInitialSystemPrefersDark);

  // Subscribe to OS theme changes. The helper always emits the current
  // value synchronously, so this works for the initial value too.
  useEffect(() => {
    const unsubscribe = subscribeSystemPrefersDark((next) => {
      setSystemPrefersDark(next);
    });
    return unsubscribe;
  }, []);

  // Apply the resolved theme to the DOM whenever either input changes.
  useEffect(() => {
    const resolved = resolveTheme(theme, systemPrefersDark);
    applyThemeClass(resolved);
  }, [theme, systemPrefersDark]);
}
