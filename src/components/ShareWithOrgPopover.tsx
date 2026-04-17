import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyOrganizations } from '@/hooks/use-organization';
import { useSharePlayerWithOrg, useUnsharePlayerFromOrg, usePlayerOrgShares } from '@/hooks/use-players';
import { Checkbox } from '@/components/ui/checkbox';
import { Building2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface ShareWithOrgPopoverProps {
  playerId: string;
  compact?: boolean;
  className?: string;
}

export function ShareWithOrgPopover({ playerId, compact = false, className }: ShareWithOrgPopoverProps) {
  const { t } = useTranslation();
  const { data: orgs = [] } = useMyOrganizations();
  const { data: shares = [] } = usePlayerOrgShares([playerId]);
  const shareMutation = useSharePlayerWithOrg();
  const unshareMutation = useUnsharePlayerFromOrg();
  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  if (!orgs.length) return null;

  const sharedOrgIds = new Set(shares.filter(s => s.player_id === playerId).map(s => s.organization_id));
  const isSharedAnywhere = sharedOrgIds.size > 0;
  const isPending = shareMutation.isPending || unshareMutation.isPending;

  const handleToggle = async (orgId: string, isCurrentlyShared: boolean) => {
    try {
      if (isCurrentlyShared) {
        await unshareMutation.mutateAsync({ playerId, organizationId: orgId });
      } else {
        await shareMutation.mutateAsync({ playerId, organizationId: orgId });
      }
    } catch (err: unknown) {
      console.error('ShareWithOrgPopover toggle error:', err);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    }
  };

  // If only one org, just render a simple toggle button
  if (orgs.length === 1) {
    const org = orgs[0];
    const isShared = sharedOrgIds.has(org.id);
    return (
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleToggle(org.id, isShared); }}
        disabled={isPending}
        className={compact
          ? `p-1 rounded-md transition-colors ${isShared ? 'text-primary bg-primary/10' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${className ?? ''}`
          : `flex items-center gap-2.5 w-full text-left px-2 py-1.5 text-sm ${className ?? ''}`
        }
        title={isShared ? t('players.shared_with_org') : t('players.share_with_org')}
      >
        {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
        {!compact && <span>{isShared ? t('players.shared_with_org') : t('players.share_with_org')}</span>}
      </button>
    );
  }

  // Multiple orgs: custom dropdown (no Portal, stays in DOM)
  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(prev => !prev); }}
        className={compact
          ? `p-1 rounded-md transition-colors ${isSharedAnywhere ? 'text-primary bg-primary/10' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${className ?? ''}`
          : `flex items-center gap-2.5 w-full text-left px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground ${className ?? ''}`
        }
        title={t('players.share_with_orgs')}
      >
        <Building2 className={compact ? "w-3.5 h-3.5" : "w-4 h-4"} />
        {!compact && (
          <span className="flex-1">
            {isSharedAnywhere
              ? t('players.shared_with_n_orgs', { count: sharedOrgIds.size })
              : t('players.share_with_orgs')}
          </span>
        )}
        {isSharedAnywhere && compact && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-primary text-[9px] text-primary-foreground flex items-center justify-center font-bold">
            {sharedOrgIds.size}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-1 z-50 w-64 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <p className="text-xs font-medium text-muted-foreground px-2 pb-2 border-b mb-2">
            {t('players.share_with_orgs')}
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {orgs.map(org => {
              const isShared = sharedOrgIds.has(org.id);
              return (
                <label
                  key={org.id}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-muted cursor-pointer text-sm"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={isShared}
                    disabled={isPending}
                    onCheckedChange={() => handleToggle(org.id, isShared)}
                  />
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate">{org.name}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/** Bulk share dialog: share multiple players with a chosen org */
interface BulkShareDialogProps {
  playerIds: string[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}

export function BulkShareDialog({ playerIds, open, onOpenChange, onDone }: BulkShareDialogProps) {
  const { t } = useTranslation();
  const { data: orgs = [] } = useMyOrganizations();
  const shareMutation = useSharePlayerWithOrg();
  const [sharing, setSharing] = useState(false);

  const handleShareAll = async (orgId: string) => {
    setSharing(true);
    try {
      await Promise.all(playerIds.map(playerId => shareMutation.mutateAsync({ playerId, organizationId: orgId })));
      toast.success(t('players.added_to_org', { count: playerIds.length }));
      onOpenChange(false);
      onDone?.();
    } catch (err: unknown) {
      console.error('BulkShareDialog error:', err);
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setSharing(false);
    }
  };

  if (!orgs.length) return null;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center ${open ? '' : 'pointer-events-none hidden'}`}
      onClick={() => onOpenChange(false)}
    >
      <div className="fixed inset-0 bg-black/40" />
      <div
        className="relative z-50 w-80 rounded-xl border bg-popover p-4 text-popover-foreground shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-sm font-semibold mb-3">
          {t('players.choose_org')}
        </p>
        <p className="text-xs text-muted-foreground mb-4">
          {t('players.add_to_org')} ({playerIds.length})
        </p>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {orgs.map(org => (
            <button
              key={org.id}
              onClick={() => handleShareAll(org.id)}
              disabled={sharing}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-muted cursor-pointer text-sm w-full text-left transition-colors"
            >
              {sharing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />}
              <span className="truncate font-medium">{org.name}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
