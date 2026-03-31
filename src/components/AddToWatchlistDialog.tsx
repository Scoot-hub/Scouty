import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Eye, Plus, Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useWatchlists, useCreateWatchlist, useAddPlayersToWatchlist } from '@/hooks/use-watchlists';
import { toast } from 'sonner';

interface AddToWatchlistDialogProps {
  playerIds: string[];
  onDone?: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function AddToWatchlistDialog({ playerIds, onDone, open: externalOpen, onOpenChange: externalOnOpenChange }: AddToWatchlistDialogProps) {
  const { t } = useTranslation();
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = externalOpen !== undefined;
  const open = isControlled ? externalOpen! : internalOpen;
  const setOpen = isControlled ? externalOnOpenChange! : setInternalOpen;
  const [newName, setNewName] = useState('');
  const [creatingNew, setCreatingNew] = useState(false);
  const { data: watchlists = [] } = useWatchlists();
  const createWatchlist = useCreateWatchlist();
  const addPlayers = useAddPlayersToWatchlist();

  const handleAddToExisting = async (watchlistId: string, watchlistName: string) => {
    try {
      const result = await addPlayers.mutateAsync({ watchlistId, playerIds });
      toast.success(t('watchlist.players_added', { count: result.added, name: watchlistName }));
      setOpen(false);
      onDone?.();
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleCreateAndAdd = async () => {
    if (!newName.trim()) return;
    try {
      const wl = await createWatchlist.mutateAsync({ name: newName.trim() });
      await addPlayers.mutateAsync({ watchlistId: wl.id, playerIds });
      toast.success(t('watchlist.created_and_added', { name: newName.trim(), count: playerIds.length }));
      setNewName('');
      setCreatingNew(false);
      setOpen(false);
      onDone?.();
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {!isControlled && (
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" className="rounded-xl">
            <Eye className="w-4 h-4 mr-1.5" />
            {t('watchlist.add_to_watchlist')} ({playerIds.length})
          </Button>
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('watchlist.add_to_watchlist')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 mt-2">
          {watchlists.length > 0 && (
            <div className="space-y-1.5 max-h-[50vh] overflow-y-auto">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('watchlist.existing_lists')}</p>
              {watchlists.map(wl => (
                <button
                  key={wl.id}
                  onClick={() => handleAddToExisting(wl.id, wl.name)}
                  disabled={addPlayers.isPending}
                  className="flex items-center justify-between w-full px-3 py-2.5 rounded-xl border border-border hover:bg-muted/50 hover:border-primary/30 transition-all text-left group"
                >
                  <div className="flex items-center gap-2.5">
                    <Eye className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                    <span className="text-sm font-medium">{wl.name}</span>
                  </div>
                  <Check className="w-4 h-4 text-muted-foreground/0 group-hover:text-primary transition-colors" />
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-border/40 pt-3">
            {creatingNew ? (
              <div className="flex items-center gap-2">
                <Input
                  placeholder={t('watchlist.new_list_placeholder')}
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  className="rounded-xl"
                  autoFocus
                  onKeyDown={e => e.key === 'Enter' && handleCreateAndAdd()}
                />
                <Button size="sm" className="rounded-xl shrink-0" onClick={handleCreateAndAdd} disabled={!newName.trim() || createWatchlist.isPending}>
                  {t('common.save')}
                </Button>
                <Button size="sm" variant="ghost" className="rounded-xl shrink-0" onClick={() => { setCreatingNew(false); setNewName(''); }}>
                  {t('common.cancel')}
                </Button>
              </div>
            ) : (
              <button
                onClick={() => setCreatingNew(true)}
                className="flex items-center gap-2.5 w-full px-3 py-2.5 rounded-xl border border-dashed border-border hover:border-primary/50 hover:bg-primary/5 transition-all text-sm font-medium text-muted-foreground hover:text-primary"
              >
                <Plus className="w-4 h-4" />
                {t('watchlist.create_new_list')}
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
