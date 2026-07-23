import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '../../lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-white dark:focus:ring-offset-zinc-950',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-indigo-600 text-zinc-100',
        secondary:
          'border-transparent bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300',
        destructive: 'border-transparent bg-red-600 text-zinc-100',
        outline: 'border-zinc-300 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300',
        success: 'border-transparent bg-emerald-600 text-zinc-100',
        warning: 'border-transparent bg-amber-600 text-zinc-100',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
