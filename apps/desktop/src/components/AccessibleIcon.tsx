import type { ReactElement, ReactNode } from 'react';

interface AccessibleIconProps {
  icon: ReactElement;
  label: string;
  children?: ReactNode;
}

export function AccessibleIcon({ icon, label, children }: AccessibleIconProps) {
  return (
    <span role="img" aria-label={label} className="inline-flex items-center gap-2">
      {icon}
      {children}
    </span>
  );
}

export default AccessibleIcon;
