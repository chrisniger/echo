import { create } from 'zustand';

export type ToastVariant = 'default' | 'success' | 'warning';

export interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  /** Override the default 5000ms auto-dismiss. Pass 0 to disable auto-dismiss. */
  durationMs?: number;
  createdAt: number;
}

interface ToastState {
  toasts: Toast[];
  pushToast: (t: Omit<Toast, 'id' | 'createdAt'>) => string;
  dismissToast: (id: string) => void;
  clearAll: () => void;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `${Date.now().toString(36)}-${idCounter}`;
}

/**
 * Global transient-notification store. The viewport (`components/Toasts.tsx`)
 * renders `toasts` as a bottom-right stack; each toast auto-dismisses after
 * `durationMs` (default 5000ms). Multiple pushes stack vertically.
 *
 * Use from anywhere: `const pushToast = useToastStore(s => s.pushToast);
 * pushToast({ title: 'Saved', variant: 'success' });`
 */
export const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  pushToast: (t) => {
    const id = nextId();
    const toast: Toast = {
      id,
      title: t.title,
      description: t.description,
      variant: t.variant ?? 'default',
      durationMs: t.durationMs ?? 5000,
      createdAt: Date.now(),
    };
    set((state) => ({ toasts: [...state.toasts, toast] }));
    return id;
  },
  dismissToast: (id) => {
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
  },
  clearAll: () => {
    set({ toasts: [] });
  },
}));
