import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings';

type ShortcutAction = keyof ReturnType<typeof useSettingsStore.getState>['settings']['globalShortcuts'];

const actionMap: Record<string, ShortcutAction> = {
  'toggle-assistant': 'toggle-assistant',
  'new-session': 'new-session',
  'toggle-recording': 'toggle-recording',
};

interface ShortcutHandlers {
  onToggleAssistant?: () => void;
  onNewSession?: () => void;
  onToggleRecording?: () => void;
}

function parseKeyCombo(combo: string): { ctrl: boolean; shift: boolean; alt: boolean; key: string } {
  const parts = combo.split('+');
  const ctrl = parts.includes('Ctrl');
  const shift = parts.includes('Shift');
  const alt = parts.includes('Alt');
  const key = parts[parts.length - 1].toLowerCase();
  return { ctrl, shift, alt, key };
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  const globalShortcuts = useSettingsStore((s) => s.settings.globalShortcuts);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      for (const [actionName, combo] of Object.entries<string>(globalShortcuts)) {
        const { ctrl, shift, alt, key } = parseKeyCombo(combo);

        if (
          e.ctrlKey === ctrl &&
          e.shiftKey === shift &&
          e.altKey === alt &&
          e.key.toLowerCase() === key
        ) {
          e.preventDefault();

          const handlerKey = actionMap[actionName as string] as string | undefined;
          if (handlerKey) {
            const handlerMap: Record<string, (() => void) | undefined> = {
              'toggle-assistant': handlers.onToggleAssistant,
              'new-session': handlers.onNewSession,
              'toggle-recording': handlers.onToggleRecording,
            };
            handlerMap[handlerKey]?.();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [globalShortcuts, handlers]);
}
