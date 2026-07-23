import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number;
  variant?: 'default' | 'success';
}

function Progress({ className, value, variant = 'default', ...props }: ProgressProps) {
  return (
    <div
      className={cn(
        'relative h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'h-full w-full flex-1 transition-all duration-300 ease-in-out',
          variant === 'success' ? 'bg-emerald-500' : 'bg-indigo-500',
          value > 0 && value < 100 && 'animate-pulse',
        )}
        style={{ transform: `translateX(-${100 - value}%)` }}
      />
    </div>
  );
}

export { Progress };
