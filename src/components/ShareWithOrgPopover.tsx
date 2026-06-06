import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMyOrganizations } from '@/hooks/use-organization';
import { useSharePlayerWithOrg, useUnsharePlayerFromOrg, usePlayerOrgShares } from '@/hooks/use-players';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Building2, Loader2, Lock } from 'lucide-react';
import { toast } from 'sonner';

function orgAllowsSharing(org: Record<string, unknown>): boolean {
  try {
    const raw = org.settings;
    const cfg = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, boolean> | null);
    return cfg?.allow_player_sharing !== false;
  } catch { return true; }
}

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
    const org = orgs[0] as Record<string, unknown>;
    const isShared = sharedOrgIds.has(org.id as string);
    const sharingAllowed = orgAllowsSharing(org);
    return (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (sharingAllowed) handleToggle(org.id as string, isShared); }}
              disabled={isPending || !sharingAllowed}
              className={compact
                ? `p-1 rounded-md transition-colors ${isShared ? 'text-primary bg-primary/10' : 'text-muted-foreground/40 hover:text-muted-foreground'} ${!sharingAllowed ? 'opacity-40 cursor-not-allowed' : ''} ${className ?? ''}`
                : `flex items-center gap-2.5 w-full text-left px-2 py-1.5 text-sm ${!sharingAllowed ? 'opacity-40 cursor-not-allowed' : ''} ${className ?? ''}`
              }
              title={sharingAllowed ? (isShared ? t('players.shared_with_org') : t('players.share_with_org')) : undefined}
            >
              {isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Building2 className="w-3.5 h-3.5" />}
              {!compact && <span>{isShared ? t('players.shared_with_org') : t('players.share_with_org')}</span>}
              {!sharingAllowed && <Lock className="w-3 h-3 ml-0.5" />}
            </button>
          </TooltipTrigger>
          {!sharingAllowed && (
            <TooltipContent side="top" className="text-xs">
              Partage désactivé par le propriétaire de l'organisation
            </TooltipContent>
          )}
        </Tooltip>
      </TooltipProvider>
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
          className="absolute right-0 top-full mt-1 z-50 w-56 max-w-[calc(100vw-2rem)] rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
        >
          <p className="text-xs font-medium text-muted-foreground px-2 pb-2 border-b mb-2">
            {t('players.share_with_orgs')}
          </p>
          <div className="space-y-1 max-h-48 overflow-y-auto">
            {orgs.map(org => {
              const typedOrg = org as Record<string, unknown>;
              const isShared = sharedOrgIds.has(typedOrg.id as string);
              const sharingAllowed = orgAllowsSharing(typedOrg);
              return (
                <label
                  key={typedOrg.id as string}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${sharingAllowed ? 'hover:bg-muted cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
                  onClick={(e) => e.stopPropagation()}
                  title={!sharingAllowed ? 'Partage désactivé par le propriétaire de l\'organisation' : undefined}
                >
                  <Checkbox
                    checked={isShared}
                    disabled={isPending || !sharingAllowed}
                    onCheckedChange={() => sharingAllowed && handleToggle(typedOrg.id as string, isShared)}
                  />
                  <Building2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span className="truncate flex-1">{typedOrg.name as string}</span>
                  {!sharingAllowed && <Lock className="w-3 h-3 text-muted-foreground shrink-0" />}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('players.choose_org')}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground -mt-2">
          {t('players.add_to_org')} ({playerIds.length})
        </p>
        <div className="space-y-1.5 max-h-60 overflow-y-auto">
          {orgs.map(org => {
            const typedOrg = org as Record<string, unknown>;
            const sharingAllowed = orgAllowsSharing(typedOrg);
            return (
              <button
                key={typedOrg.id as string}
                onClick={() => sharingAllowed && handleShareAll(typedOrg.id as string)}
                disabled={sharing || !sharingAllowed}
                title={!sharingAllowed ? 'Partage désactivé par le propriétaire de l\'organisation' : undefined}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm w-full text-left transition-colors ${sharingAllowed ? 'hover:bg-muted cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
              >
                {sharing ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Building2 className="w-4 h-4 text-muted-foreground shrink-0" />}
                <span className="truncate font-medium flex-1">{typedOrg.name as string}</span>
                {!sharingAllowed && <Lock className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
              </button>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
