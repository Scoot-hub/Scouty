import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePlayers } from '@/hooks/use-players';
import {
  useWatchlists,
  useWatchlistPlayers,
  useCreateWatchlist,
  useUpdateWatchlist,
  useDeleteWatchlist,
  useRemovePlayerFromWatchlist,
  type Watchlist as WatchlistType,
} from '@/hooks/use-watchlists';
import { getPlayerAge, getOpinionEmoji, resolveLeagueName, type Player, type Opinion } from '@/types/player';
import { usePositions } from '@/hooks/use-positions';
import { FlagIcon } from '@/components/ui/flag-icon';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { ClubBadge } from '@/components/ui/club-badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  Eye, Plus, Pencil, Trash2, ArrowLeft, Users, TrendingUp,
  Target, Calendar, X, BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

export default function Watchlist() {
  const { t } = useTranslation();
  const { data: watchlists = [], isLoading } = useWatchlists();
  const { data: allPlayers = [] } = usePlayers();
  const [selectedWatchlist, setSelectedWatchlist] = useState<WatchlistType | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');

  const createWatchlist = useCreateWatchlist();
  const updateWatchlist = useUpdateWatchlist();
  const deleteWatchlist = useDeleteWatchlist();

  const handleCreate = async () => {
    if (!formName.trim()) return;
    try {
      await createWatchlist.mutateAsync({ name: formName.trim(), description: formDesc.trim() });
      toast.success(t('watchlist.created'));
      setCreateDialogOpen(false);
      setFormName('');
      setFormDesc('');
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleUpdate = async () => {
    if (!selectedWatchlist || !formName.trim()) return;
    try {
      const updated = await updateWatchlist.mutateAsync({
        id: selectedWatchlist.id,
        name: formName.trim(),
        description: formDesc.trim(),
      });
      setSelectedWatchlist({ ...selectedWatchlist, name: updated.name, description: updated.description });
      toast.success(t('watchlist.updated'));
      setEditDialogOpen(false);
    } catch {
      toast.error(t('common.error'));
    }
  };

  const handleDelete = async () => {
    if (!selectedWatchlist) return;
    try {
      await deleteWatchlist.mutateAsync(selectedWatchlist.id);
      toast.success(t('watchlist.deleted'));
      setSelectedWatchlist(null);
      setDeleteDialogOpen(false);
    } catch {
      toast.error(t('common.error'));
    }
  };

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto flex items-center justify-center min-h-[40vh]">
        <p className="text-muted-foreground">{t('common.loading')}</p>
      </div>
    );
  }

  if (selectedWatchlist) {
    return (
      <WatchlistDetail
        watchlist={selectedWatchlist}
        allPlayers={allPlayers}
        onBack={() => setSelectedWatchlist(null)}
        onEdit={() => {
          setFormName(selectedWatchlist.name);
          setFormDesc(selectedWatchlist.description ?? '');
          setEditDialogOpen(true);
        }}
        onDelete={() => setDeleteDialogOpen(true)}
        editDialog={
          <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('watchlist.edit_list')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 mt-2">
                <Input placeholder={t('watchlist.name_placeholder')} value={formName} onChange={e => setFormName(e.target.value)} className="rounded-xl" autoFocus />
                <Input placeholder={t('watchlist.description_placeholder')} value={formDesc} onChange={e => setFormDesc(e.target.value)} className="rounded-xl" />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setEditDialogOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
                  <Button onClick={handleUpdate} disabled={!formName.trim() || updateWatchlist.isPending} className="rounded-xl">{t('common.save')}</Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        }
        deleteDialog={
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{t('watchlist.delete_confirm', { name: selectedWatchlist.name })}</DialogTitle>
              </DialogHeader>
              <p className="text-sm text-muted-foreground">{t('watchlist.delete_desc')}</p>
              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
                <Button variant="destructive" onClick={handleDelete} disabled={deleteWatchlist.isPending} className="rounded-xl">{t('common.delete')}</Button>
              </div>
            </DialogContent>
          </Dialog>
        }
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Eye className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('watchlist.title')}</h1>
            <p className="text-sm text-muted-foreground">
              {watchlists.length > 1
                ? t('watchlist.count_plural', { count: watchlists.length })
                : t('watchlist.count', { count: watchlists.length })}
            </p>
          </div>
        </div>
        <Button className="rounded-xl" onClick={() => { setFormName(''); setFormDesc(''); setCreateDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-1.5" />
          {t('watchlist.create_new_list')}
        </Button>
      </div>

      {watchlists.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">👀</p>
          <p className="text-lg font-semibold text-muted-foreground">{t('watchlist.empty')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('watchlist.empty_desc')}</p>
          <Button className="mt-4 rounded-xl" onClick={() => { setFormName(''); setFormDesc(''); setCreateDialogOpen(true); }}>
            <Plus className="w-4 h-4 mr-1.5" />
            {t('watchlist.create_new_list')}
          </Button>
        </div>
      ) : (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {watchlists.map(wl => (
            <WatchlistCard
              key={wl.id}
              watchlist={wl}
              allPlayers={allPlayers}
              onClick={() => setSelectedWatchlist(wl)}
            />
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('watchlist.create_new_list')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 mt-2">
            <Input
              placeholder={t('watchlist.name_placeholder')}
              value={formName}
              onChange={e => setFormName(e.target.value)}
              className="rounded-xl"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Input
              placeholder={t('watchlist.description_placeholder')}
              value={formDesc}
              onChange={e => setFormDesc(e.target.value)}
              className="rounded-xl"
            />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setCreateDialogOpen(false)} className="rounded-xl">{t('common.cancel')}</Button>
              <Button onClick={handleCreate} disabled={!formName.trim() || createWatchlist.isPending} className="rounded-xl">{t('common.save')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── Watchlist Card on overview ── */
function WatchlistCard({ watchlist, allPlayers, onClick }: { watchlist: WatchlistType; allPlayers: Player[]; onClick: () => void }) {
  const { t } = useTranslation();
  const { positionShort: posShort } = usePositions();
  const { data: watchlistPlayers = [] } = useWatchlistPlayers(watchlist.id);

  const players = useMemo(() => {
    const ids = new Set(watchlistPlayers.map(wp => wp.player_id));
    return allPlayers.filter(p => ids.has(p.id));
  }, [watchlistPlayers, allPlayers]);

  const stats = useMemo(() => {
    if (players.length === 0) return null;
    const ages = players.map(p => getPlayerAge(p.generation, p.date_of_birth));
    const avgAge = Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10;
    const avgLevel = Math.round((players.reduce((a, p) => a + p.current_level, 0) / players.length) * 10) / 10;
    const avgPotential = Math.round((players.reduce((a, p) => a + p.potential, 0) / players.length) * 10) / 10;
    return { avgAge, avgLevel, avgPotential };
  }, [players]);

  return (
    <Card className="card-warm hover:scale-[1.02] transition-all duration-200 cursor-pointer" onClick={onClick}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h3 className="font-bold text-base">{watchlist.name}</h3>
            {watchlist.description && <p className="text-xs text-muted-foreground mt-0.5">{watchlist.description}</p>}
          </div>
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
            <Users className="w-3 h-3" />
            {players.length}
          </span>
        </div>

        {stats ? (
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('watchlist.avg_age')}</p>
              <p className="text-sm font-bold font-mono">{stats.avgAge}</p>
            </div>
            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('watchlist.avg_level')}</p>
              <p className="text-sm font-bold font-mono">{stats.avgLevel}</p>
            </div>
            <div className="rounded-lg bg-muted/50 py-2 px-1 text-center">
              <p className="text-[10px] text-muted-foreground mb-0.5">{t('watchlist.avg_potential')}</p>
              <p className="text-sm font-bold font-mono text-primary">{stats.avgPotential}</p>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">{t('watchlist.no_players')}</p>
        )}

        {/* Preview: first 5 player avatars */}
        {players.length > 0 && (
          <div className="flex items-center mt-3 -space-x-2">
            {players.slice(0, 5).map(p => (
              <div key={p.id} className="w-7 h-7 rounded-full border-2 border-card overflow-hidden">
                <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
              </div>
            ))}
            {players.length > 5 && (
              <span className="ml-2 text-xs text-muted-foreground font-medium">+{players.length - 5}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/* ── Watchlist Detail view ── */
function WatchlistDetail({
  watchlist, allPlayers, onBack, onEdit, onDelete, editDialog, deleteDialog,
}: {
  watchlist: WatchlistType;
  allPlayers: Player[];
  onBack: () => void;
  onEdit: () => void;
  onDelete: () => void;
  editDialog: React.ReactNode;
  deleteDialog: React.ReactNode;
}) {
  const { t } = useTranslation();
  const { positionShort: posShort } = usePositions();
  const { data: watchlistPlayers = [] } = useWatchlistPlayers(watchlist.id);
  const removePlayer = useRemovePlayerFromWatchlist();

  const players = useMemo(() => {
    const ids = new Set(watchlistPlayers.map(wp => wp.player_id));
    return allPlayers.filter(p => ids.has(p.id));
  }, [watchlistPlayers, allPlayers]);

  const kpis = useMemo(() => {
    if (players.length === 0) return null;
    const ages = players.map(p => getPlayerAge(p.generation, p.date_of_birth));
    const avgAge = Math.round((ages.reduce((a, b) => a + b, 0) / ages.length) * 10) / 10;
    const avgLevel = Math.round((players.reduce((a, p) => a + p.current_level, 0) / players.length) * 10) / 10;
    const avgPotential = Math.round((players.reduce((a, p) => a + p.potential, 0) / players.length) * 10) / 10;

    // Position distribution
    const posMap = new Map<string, number>();
    players.forEach(p => posMap.set(posShort[p.position], (posMap.get(posShort[p.position]) ?? 0) + 1));
    const positions = Array.from(posMap.entries()).sort((a, b) => b[1] - a[1]);

    // Opinion distribution
    const opMap = new Map<string, number>();
    players.forEach(p => opMap.set(p.general_opinion, (opMap.get(p.general_opinion) ?? 0) + 1));
    const opinions = Array.from(opMap.entries());

    // League distribution
    const leagueMap = new Map<string, number>();
    players.forEach(p => { const l = resolveLeagueName(p.club, p.league); if (l) leagueMap.set(l, (leagueMap.get(l) ?? 0) + 1); });
    const leagues = Array.from(leagueMap.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);

    // Contract urgency
    const expiringSoon = players.filter(p => {
      if (!p.contract_end) return false;
      const months = Math.floor((new Date(p.contract_end).getTime() - Date.now()) / (1000 * 60 * 60 * 24 * 30));
      return months <= 12;
    }).length;

    return { avgAge, avgLevel, avgPotential, positions, opinions, leagues, expiringSoon, total: players.length };
  }, [players]);

  const handleRemove = async (playerId: string) => {
    try {
      await removePlayer.mutateAsync({ watchlistId: watchlist.id, playerId });
      toast.success(t('watchlist.player_removed'));
    } catch {
      toast.error(t('common.error'));
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      {editDialog}
      {deleteDialog}

      {/* Header */}
      <div className="mb-6">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-3">
          <ArrowLeft className="w-4 h-4" /> {t('watchlist.title')}
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Eye className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight">{watchlist.name}</h1>
              {watchlist.description && <p className="text-sm text-muted-foreground">{watchlist.description}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="rounded-xl" onClick={onEdit}>
              <Pencil className="w-4 h-4 mr-1.5" /> {t('common.edit')}
            </Button>
            <Button variant="outline" size="sm" className="rounded-xl text-destructive hover:bg-destructive/10" onClick={onDelete}>
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {kpis && (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4 xl:grid-cols-7 mb-6">
          <KpiCard icon={<Users className="w-4 h-4" />} label={t('watchlist.total')} value={kpis.total} />
          <KpiCard icon={<Calendar className="w-4 h-4" />} label={t('watchlist.avg_age')} value={kpis.avgAge} />
          <KpiCard icon={<BarChart3 className="w-4 h-4" />} label={t('watchlist.avg_level')} value={kpis.avgLevel} />
          <KpiCard icon={<TrendingUp className="w-4 h-4" />} label={t('watchlist.avg_potential')} value={kpis.avgPotential} accent />
          <KpiCard icon={<Target className="w-4 h-4" />} label={t('watchlist.top_position')} value={kpis.positions[0]?.[0] ?? '—'} />
          <KpiCard icon={<Eye className="w-4 h-4" />} label={t('watchlist.top_league')} value={kpis.leagues[0]?.[0] ?? '—'} small />
          <KpiCard icon={<Calendar className="w-4 h-4" />} label={t('watchlist.expiring_soon')} value={kpis.expiringSoon} warn={kpis.expiringSoon > 0} />
        </div>
      )}

      {/* Distribution cards */}
      {kpis && (
        <div className="grid gap-4 grid-cols-1 md:grid-cols-3 mb-6">
          {/* Positions */}
          <Card className="card-warm">
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('watchlist.position_distribution')}</p>
              <div className="space-y-2">
                {kpis.positions.map(([pos, count]) => (
                  <div key={pos} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{pos}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(count / kpis.total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Opinions */}
          <Card className="card-warm">
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('watchlist.opinion_distribution')}</p>
              <div className="space-y-2">
                {kpis.opinions.map(([op, count]) => (
                  <div key={op} className="flex items-center justify-between">
                    <span className="text-sm font-medium">{getOpinionEmoji(op as Opinion)} {op}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(count / kpis.total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Top leagues */}
          <Card className="card-warm">
            <CardContent className="p-4">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('watchlist.league_distribution')}</p>
              <div className="space-y-2">
                {kpis.leagues.map(([league, count]) => (
                  <div key={league} className="flex items-center justify-between">
                    <span className="text-sm font-medium truncate max-w-[140px]">{league}</span>
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(count / kpis.total) * 100}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground font-mono w-6 text-right">{count}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Players list */}
      {players.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-5xl mb-4">👀</p>
          <p className="text-lg font-semibold text-muted-foreground">{t('watchlist.no_players')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('watchlist.no_players_desc')}</p>
          <Link to="/players">
            <Button className="mt-4 rounded-xl">
              <Users className="w-4 h-4 mr-1.5" />
              {t('watchlist.go_to_players')}
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2 xl:grid-cols-3">
          {players.map(player => (
            <div key={player.id} className="relative group">
              <button
                onClick={() => handleRemove(player.id)}
                className="absolute top-2 right-2 z-10 p-1 rounded-full bg-card/80 border border-border text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all opacity-0 group-hover:opacity-100"
                title={t('watchlist.remove_player')}
              >
                <X className="w-3.5 h-3.5" />
              </button>
              <Card className="card-warm overflow-hidden hover:scale-[1.02] transition-all duration-200">
                <Link to={`/player/${player.id}`} className="block group/link">
                  <div className="p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <PlayerAvatar name={player.name} photoUrl={player.photo_url} size="lg" />
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-base truncate group-hover/link:text-primary transition-colors">{player.name}</h3>
                        <div className="flex items-center gap-2 mt-0.5">
                          <ClubBadge club={player.club} size="sm" />
                          <p className="text-sm text-muted-foreground truncate">{player.club}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <FlagIcon nationality={player.nationality} size="sm" />
                      <span className="px-2 py-0.5 rounded-md bg-muted text-xs font-medium">{getPlayerAge(player.generation, player.date_of_birth)} {t('common.year')}</span>
                      <span className="px-2 py-0.5 rounded-md bg-muted text-xs font-medium">{posShort[player.position]}</span>
                      <div className="ml-auto flex items-center gap-2 text-sm font-bold font-mono">
                        <span>{player.current_level}</span>
                        <span className="text-muted-foreground font-normal">/</span>
                        <span className="text-primary">{player.potential}</span>
                      </div>
                    </div>
                  </div>
                </Link>
              </Card>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Small KPI card ── */
function KpiCard({ icon, label, value, accent, warn, small }: {
  icon: React.ReactNode; label: string; value: string | number; accent?: boolean; warn?: boolean; small?: boolean;
}) {
  return (
    <Card className="card-warm">
      <CardContent className="p-3 flex flex-col items-center text-center">
        <div className={`mb-1 ${warn ? 'text-destructive' : accent ? 'text-primary' : 'text-muted-foreground'}`}>{icon}</div>
        <p className={`font-bold font-mono ${small ? 'text-xs truncate max-w-full' : 'text-lg'} ${warn ? 'text-destructive' : accent ? 'text-primary' : ''}`}>{value}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">{label}</p>
      </CardContent>
    </Card>
  );
}
