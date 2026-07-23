import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(
  ...inputs: (string | undefined | null | false | Record<string, boolean | undefined | null>)[]
) {
  return twMerge(clsx(inputs));
}

/**
 * Phase 5 lint helper — extract a usable string message from an
 * unknown thrown value (catch-block `err`). Falls back to `fallback`
 * when `err` is not an Error instance and `fallback` was supplied.
 *
 * Replaces the previous `catch (err: any) { err.message }` pattern.
 * The narrowing happens at the call site so the call sites stay
 * explicit about what they consider an "error" (Error instance,
 * stringifiable, or whatever the caller passes in).
 */
export function errorMessage(err: unknown, fallback = ''): string {
  if (err instanceof Error) return err.message;
  if (typeof err === 'string') return err;
  if (fallback) return fallback;
  return '';
}
