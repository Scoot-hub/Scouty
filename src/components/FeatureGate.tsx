import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useFeatureEnabled } from '@/hooks/use-feature-flags';
import { useIsAdmin } from '@/hooks/use-admin';
import { cn } from '@/lib/utils';
import { AlertTriangle } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface FeatureGateProps {
  featureKey: string;
  children: React.ReactNode;
  /** If true, render inline (for sidebar links). If false, render as full-page gate. */
  inline?: boolean;
}

/**
 * Gate a feature behind a feature flag.
 * - Enabled: renders children normally.
 * - Disabled + admin: renders children grayed out + popup on click.
 * - Disabled + non-admin: hides children entirely.
 */
export function FeatureGate({ featureKey, children, inline = false }: FeatureGateProps) {
  const enabled = useFeatureEnabled(featureKey);
  const { data: isAdmin } = useIsAdmin();
  const [showDialog, setShowDialog] = useState(false);
  const { t } = useTranslation();

  // Enabled → render normally
  if (enabled) return <>{children}</>;

  // Disabled + non-admin → hide
  if (!isAdmin) return null;

  // Disabled + admin → grayed out + popup
  return (
    <>
      <div
        className={cn('relative cursor-pointer', inline ? 'opacity-40' : 'opacity-50')}
        onClick={e => { e.preventDefault(); e.stopPropagation(); setShowDialog(true); }}
      >
        {children}
      </div>
      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {t('feature_gate.disabled_title')}
            </DialogTitle>
            <DialogDescription>
              {t('feature_gate.disabled_desc')}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDialog(false)}>
              {t('common.close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Full-page gate: wraps a page component. Shows a centered message if disabled.
 */
export function FeaturePageGate({ featureKey, children }: { featureKey: string; children: React.ReactNode }) {
  const enabled = useFeatureEnabled(featureKey);
  const { data: isAdmin } = useIsAdmin();
  const { t } = useTranslation();

  if (enabled) return <>{children}</>;

  // Admin sees the page grayed out with a banner
  if (isAdmin) {
    return (
      <div className="relative">
        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center py-3 bg-amber-500/10 border-b border-amber-500/20">
          <div className="flex items-center gap-2 text-sm text-amber-600 dark:text-amber-400 font-medium">
            <AlertTriangle className="w-4 h-4" />
            {t('feature_gate.admin_banner')}
          </div>
        </div>
        <div className="opacity-40 pointer-events-none pt-12">
          {children}
        </div>
      </div>
    );
  }

  // Non-admin: blocked
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <AlertTriangle className="w-10 h-10 text-muted-foreground/30 mb-4" />
      <h2 className="text-lg font-bold">{t('feature_gate.disabled_title')}</h2>
      <p className="text-sm text-muted-foreground mt-1 max-w-md">{t('feature_gate.disabled_desc')}</p>
    </div>
  );
}
