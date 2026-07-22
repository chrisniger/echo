import { useEffect } from 'react';
import { CheckCircle2, Info, Tag, X } from 'lucide-react';
import { useToastStore, type Toast, type ToastVariant } from '../stores/toast';
import { cn } from '../lib/utils';

const VARIANT_ICON: Record<ToastVariant, typeof Info> = {
  default: Tag,
  success: CheckCircle2,
  warning: Info,
};

const VARIANT_CLASSES: Record<ToastVariant, string> = {
  default: 'border-indigo-500/30 bg-indigo-500/[0.08]',
  success: 'border-emerald-500/30 bg-emerald-500/[0.08]',
  warning: 'border-amber-500/30 bg-amber-500/[0.08]',
};

const VARIANT_TEXT: Record<ToastVariant, string> = {
  default: 'text-indigo-200',
  success: 'text-emerald-200',
  warning: 'text-amber-200',
};

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const variant: ToastVariant = toast.variant ?? 'default';
  const Icon = VARIANT_ICON[variant];

  useEffect(() => {
    if (toast.durationMs === 0) return; // sticky toast
    const t = setTimeout(onDismiss, toast.durationMs ?? 5000);
    return () => clearTimeout(t);
  }, [toast.id, toast.durationMs, onDismiss]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        'pointer-events-auto flex w-80 items-start gap-3 rounded-lg border p-3 text-left shadow-xl backdrop-blur-md',
        'animate-in fade-in-0 slide-in-from-right-4 duration-300',
        VARIANT_CLASSES[variant],
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full bg-zinc-950/60',
          VARIANT_TEXT[variant],
        )}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">{toast.title}</p>
        {toast.description && (
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-700 dark:text-zinc-300">
            {toast.description}
          </p>
        )}
      </div>
      <button
        onClick={onDismiss}
        className="flex-none rounded p-1 text-zinc-500 transition-colors hover:bg-zinc-800/60 hover:text-zinc-200"
        aria-label="Dismiss notification"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

/**
 * Mount once at the application shell (Layout.tsx). Renders the bottom-right
 * toast stack read from `useToastStore`. The viewport is `pointer-events-none`
 * so toasts never block clicks on the page underneath; each individual
 * toast re-enables pointer events for its own buttons (dismiss).
 */
export default function Toasts() {
  const toasts = useToastStore((s) => s.toasts);
  const dismissToast = useToastStore((s) => s.dismissToast);

  return (
    <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} onDismiss={() => dismissToast(toast.id)} />
      ))}
    </div>
  );
}
