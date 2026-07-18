import { createElement } from 'react';
import type { SessionType } from '@echo-gpt/shared-types';
import {
  Briefcase,
  Code2,
  GraduationCap,
  Headphones,
  Lightbulb,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

/**
 * Single source of truth for the SessionType visual mapping on the web-portal.
 * MUST stay palette-aligned with
 *   apps/desktop/src/components/SessionTypeBadge.tsx
 *   apps/companion/lib/screens/transcript_screen.dart SESSION_TYPE_VISUALS
 *
 * If you add a new SessionType to packages/shared-types/src/session.ts, you
 * must add an entry here — the `Record<SessionType, …>` type enforces it at
 * compile time, so the dashboards will fail to build until you do.
 */
export const SESSION_TYPE_STYLES: Record<SessionType, { Icon: LucideIcon; classes: string }> = {
  Interview: {
    Icon: UserRound,
    classes: 'bg-indigo-500/15 text-indigo-300 border border-indigo-500/30',
  },
  Meeting: {
    Icon: Users,
    classes: 'bg-sky-500/15 text-sky-300 border border-sky-500/30',
  },
  Assessment: {
    Icon: Code2,
    classes: 'bg-orange-500/15 text-orange-300 border border-orange-500/30',
  },
  Presentation: {
    Icon: Briefcase,
    classes: 'bg-pink-500/15 text-pink-300 border border-pink-500/30',
  },
  Brainstorming: {
    Icon: Lightbulb,
    classes: 'bg-purple-500/15 text-purple-300 border border-purple-500/30',
  },
  'Sales Call': {
    Icon: TrendingUp,
    classes: 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30',
  },
  'Customer Support': {
    Icon: Headphones,
    classes: 'bg-amber-500/15 text-amber-300 border border-amber-500/30',
  },
  Training: {
    Icon: GraduationCap,
    classes: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30',
  },
  General: {
    Icon: Sparkles,
    classes: 'bg-zinc-500/15 text-zinc-300 border border-zinc-500/30',
  },
};

const SHORT_LABELS: Partial<Record<SessionType, string>> = {
  'Customer Support': 'Support',
  'Sales Call': 'Sales',
  Presentation: 'Talk',
  Brainstorming: 'Ideas',
  Assessment: 'Test',
  Training: 'Learn',
};

export interface SessionTypePillProps {
  type: SessionType;
  /** Show the leading icon. */
  icon?: boolean;
  /** Use the compact label (e.g. "Support" instead of "Customer Support"). */
  compact?: boolean;
  /** Custom element className (e.g. for size overrides). */
  className?: string;
}

/**
 * Renders a SessionType as a colored chip. Implemented with `createElement`
 * (not JSX) so this file can stay `.ts` and live alongside the rest of
 * Next.js's non-component code in `lib/`.
 */
export function SessionTypePill({ type, icon = true, compact = false, className = '' }: SessionTypePillProps) {
  const meta = SESSION_TYPE_STYLES[type];
  const Icon = meta.Icon;
  const label = compact ? (SHORT_LABELS[type] ?? type) : type;
  return createElement(
    'span',
    {
      className: `inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-medium ${meta.classes} ${className}`,
      role: 'status',
      'aria-label': `Session type: ${type}`,
    },
    icon ? createElement(Icon, { className: 'h-3 w-3', 'aria-hidden': true }) : null,
    label
  );
}

/** Used by the dashboard's filter dropdown. */
export const SESSION_TYPE_VALUES = Object.keys(SESSION_TYPE_STYLES) as SessionType[];
