import type { ReactNode } from 'react';
import { useCanAction } from '@/hooks/use-admin';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';

interface PermGateProps {
  pageKey: string;
  action?: string;
  children: ReactNode;
}

/**
 * Hides or disables children based on user permissions.
 * When hideRestrictedElements is on: renders null if denied.
 * When off: renders children with muted/disabled styling if denied.
 */
export function PermGate({ pageKey, action = 'view', children }: PermGateProps) {
  const can = useCanAction(pageKey, action);
  const { hideRestrictedElements } = useUiPreferences();

  if (can) return <>{children}</>;
  if (hideRestrictedElements) return null;

  return (
    <span className="pointer-events-none opacity-40 select-none" aria-disabled="true">
      {children}
    </span>
  );
}
