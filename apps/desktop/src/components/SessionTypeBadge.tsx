import {
  Briefcase,
  Code2,
  GraduationCap,
  Headphones,
  Lightbulb,
  MessageSquare,
  Sparkles,
  TrendingUp,
  UserRound,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { SessionType } from '@echo-gpt/shared-types';
import { Badge } from './ui/badge';

/**
 * SessionType as a color-coded badge.
 *
 * Visual rules:
 *   - One icon per type (semantic, not decorative).
 *   - Tone palette matches the desktop's dark theme: soft 30%-15% tint for
 *     background, mid-saturation accent for text. Avoid full saturation so
 *     the badge doesn't dominate the page.
 *   - The label renders exactly the SessionType literal — no localization
 *     tricks so cloud-api / web-portal / Flutter can mirror identically.
 *
 * If a new SessionType is added to packages/shared-types, you need:
 *   1. An entry to SESSION_TYPE_META below (compile error enforces this —
 *      the Record<SessionType, …> type is exhaustive).
 *   2. A matching entry in apps/web-portal/lib/api.ts SESSION_TYPE_STYLES
 *      so the web surfaces stay in sync visually.
 *   3. A matching entry in apps/companion/lib/screens/transcript_screen.dart
 *      SESSION_TYPE_COLORS so the mobile surface matches.
 */
const SESSION_TYPE_META: Record<
  SessionType,
  { Icon: LucideIcon; label: SessionType; classes: string }
> = {
  Interview: {
    Icon: UserRound,
    label: 'Interview',
    classes: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30',
  },
  Meeting: {
    Icon: Users,
    label: 'Meeting',
    classes: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  },
  Assessment: {
    Icon: Code2,
    label: 'Assessment',
    classes: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  },
  Presentation: {
    Icon: Briefcase,
    label: 'Presentation',
    classes: 'bg-pink-500/15 text-pink-300 border-pink-500/30',
  },
  Brainstorming: {
    Icon: Lightbulb,
    label: 'Brainstorming',
    classes: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  },
  'Sales Call': {
    Icon: TrendingUp,
    label: 'Sales Call',
    classes: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  'Customer Support': {
    Icon: Headphones,
    label: 'Customer Support',
    classes: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  Training: {
    Icon: GraduationCap,
    label: 'Training',
    classes: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  General: {
    Icon: Sparkles,
    label: 'General',
    classes: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300 border-zinc-500/30',
  },
};

export interface SessionTypeBadgeProps {
  type: SessionType;
  /** Render as a larger card-style badge (used in headers). */
  size?: 'sm' | 'md';
  /** Hide the trailing icon (label only). */
  iconless?: boolean;
  /** Override the trailing label (e.g. "Sales" for compact list rows). */
  shortLabel?: Partial<Record<SessionType, string>>;
}

const SHORT_LABELS: Partial<Record<SessionType, string>> = {
  'Customer Support': 'Support',
  'Sales Call': 'Sales',
  Presentation: 'Talk',
  Brainstorming: 'Ideas',
  Assessment: 'Test',
  Training: 'Learn',
};

export function SessionTypeBadge({
  type,
  size = 'sm',
  iconless = false,
  shortLabel,
}: SessionTypeBadgeProps) {
  const meta = SESSION_TYPE_META[type];
  const Icon = meta.Icon;
  const label = (shortLabel ?? SHORT_LABELS)[type] ?? meta.label;
  const sizing = size === 'md' ? 'text-sm px-3 py-1.5 gap-2' : 'text-xs px-2 py-0.5 gap-1.5';

  return (
    <span
      className={`inline-flex items-center rounded-md border font-medium ${sizing} ${meta.classes}`}
      role="status"
      aria-label={`Session type: ${meta.label}`}
    >
      {!iconless && <Icon aria-hidden="true" className={size === 'md' ? 'h-4 w-4' : 'h-3 w-3'} />}
      <span>{label}</span>
    </span>
  );
}

/** Used by History.tsx's filter dropdown. */
export const SESSION_TYPE_VALUES = Object.keys(SESSION_TYPE_META) as SessionType[];

export default SessionTypeBadge;
