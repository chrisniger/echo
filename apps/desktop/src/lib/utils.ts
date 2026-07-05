import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: (string | undefined | null | false | Record<string, boolean | undefined | null>)[]) {
  return twMerge(clsx(inputs));
}
