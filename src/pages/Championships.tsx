import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useChampionships,
  useChampionshipPlayers,
  useAddCustomChampionship,
  useDeleteCustomChampionship,
  useLinkPlayer,
  useUnlinkPlayer,
  useSofascoreLeague,
  type ChampionshipEntry,
  type SofascoreTeam,
} from '@/hooks/use-championships';
import { usePlayers } from '@/hooks/use-players';
import { useIsAdmin } from '@/hooks/use-admin';
import { getFlag } from '@/types/player';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  PlusCircle, Search, Trash2, Trophy, Users, X, UserPlus, ChevronLeft, Building2, Table2, ExternalLink,
} from 'lucide-react';
import { cn } from '@/lib/utils';

function LeagueLogo({ src, name, size = 'md' }: { src: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [error, setError] = useState(false);
  const dims = size === 'lg' ? 'w-14 h-14' : size === 'md' ? 'w-10 h-10' : 'w-7 h-7';
  const iconDims = size === 'lg' ? 'w-7 h-7' : size === 'md' ? 'w-5 h-5' : 'w-3.5 h-3.5';

  if (src && !error) {
    return (
      <img
        src={src}
        alt={name}
        className={cn(dims, 'rounded-lg object-contain shrink-0')}
        onError={() => setError(true)}
      />
    );
  }
  return (
    <div className={cn(dims, 'rounded-lg bg-primary/10 flex items-center justify-center shrink-0')}>
      <Trophy className={cn(iconDims, 'text-primary')} />
    </div>
  );
}

function TeamLogo({ src, name }: { src: string; name: string }) {
  const [error, setError] = useState(false);
  if (!src || error) {
    return (
      <div className="w-7 h-7 rounded bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
        {name.charAt(0)}
      </div>
    );
  }
  return <img src={src} alt={name} className="w-7 h-7 rounded object-contain shrink-0" onError={() => setError(true)} />;
}

// ── Detail sub-page ──
function ChampionshipDetail({
  champ,
  onBack,
}: {
  champ: ChampionshipEntry;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { data: players = [] } = usePlayers();
  const { data: linkedPlayers = [] } = useChampionshipPlayers(champ.name);
  const { data: sofaData, isLoading: sofaLoading } = useSofascoreLeague(champ.sofascoreId);
  const linkPlayer = useLinkPlayer();
  const unlinkPlayer = useUnlinkPlayer();
  const [playerSearch, setPlayerSearch] = useState('');
  const [tab, setTab] = useState<'clubs' | 'players'>('clubs');
  const [selectedClub, setSelectedClub] = useState<string | null>(null);

  // Players whose league field matches this championship (auto-detected)
  const leaguePlayerIds = useMemo(() => {
    const champLower = champ.name.toLowerCase();
    return new Set(
      players.filter(p => (p.league ?? '').trim().toLowerCase() === champLower).map(p => p.id),
    );
  }, [players, champ.name]);

  // Players explicitly linked via championship_players table
  const manualLinkedIds = useMemo(() => new Set(linkedPlayers.map(lp => lp.player_id)), [linkedPlayers]);

  // Combined: auto (by league field) + manual links, deduplicated
  const allLinkedIds = useMemo(() => new Set([...leaguePlayerIds, ...manualLinkedIds]), [leaguePlayerIds, manualLinkedIds]);
  const allLinkedPlayers = useMemo(() => players.filter(p => allLinkedIds.has(p.id)), [players, allLinkedIds]);

  const availablePlayers = useMemo(
    () => players.filter(p =>
      !allLinkedIds.has(p.id) &&
      p.name.toLowerCase().includes(playerSearch.toLowerCase()),
    ).slice(0, 20),
    [players, allLinkedIds, playerSearch],
  );

  // Players grouped by club (from our data, matching by club field)
  const playersByClub = useMemo(() => {
    const map: Record<string, typeof players> = {};
    for (const p of players) {
      const c = (p.club ?? '').trim();
      if (c) (map[c] ??= []).push(p);
    }
    return map;
  }, [players]);

  const clubPlayerCount = (clubName: string): number => {
    // Try exact match, then case-insensitive
    if (playersByClub[clubName]) return playersByClub[clubName].length;
    const lower = clubName.toLowerCase();
    for (const [k, v] of Object.entries(playersByClub)) {
      if (k.toLowerCase() === lower) return v.length;
    }
    return 0;
  };

  const getClubPlayers = (clubName: string) => {
    if (playersByClub[clubName]) return playersByClub[clubName];
    const lower = clubName.toLowerCase();
    for (const [k, v] of Object.entries(playersByClub)) {
      if (k.toLowerCase() === lower) return v;
    }
    return [];
  };

  const handleLink = async (playerId: string) => {
    try {
      await linkPlayer.mutateAsync({ championshipName: champ.name, playerId });
      toast.success(t('championships.player_linked'));
    } catch { toast.error(t('common.error')); }
  };
  const handleUnlink = async (playerId: string) => {
    try {
      await unlinkPlayer.mutateAsync({ championshipName: champ.name, playerId });
      toast.success(t('championships.player_unlinked'));
    } catch { toast.error(t('common.error')); }
  };

  // Teams: prefer SofaScore live data, fall back to static LEAGUE_CLUBS
  const teams: SofascoreTeam[] = sofaData?.teams ?? [];
  const staticClubs = champ.clubs;
  const hasStandings = teams.length > 0 && teams[0].points !== undefined;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> {t('championships.back')}
      </button>

      {/* Header */}
      <div className="flex items-center gap-4">
        <LeagueLogo src={champ.logoUrl} name={champ.name} size="lg" />
        <div>
          <h1 className="text-2xl font-bold">{champ.name}</h1>
          <p className="text-sm text-muted-foreground">
            {getFlag(champ.country)} {champ.country}
            {sofaData?.season?.name && ` — ${sofaData.season.name}`}
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab('clubs')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'clubs' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Building2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t('championships.clubs')} ({teams.length || staticClubs.length})
        </button>
        <button
          onClick={() => setTab('players')}
          className={cn(
            'px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'players' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t('championships.linked_players')} ({allLinkedPlayers.length})
        </button>
      </div>

      {/* Clubs tab */}
      {tab === 'clubs' && (
        <div className="space-y-3">
          {/* Club detail drawer */}
          {selectedClub && (
            <div className="rounded-xl border bg-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  {selectedClub}
                  <span className="text-xs text-muted-foreground font-normal">
                    — {t('championships.my_players_in_club', { count: getClubPlayers(selectedClub).length })}
                  </span>
                </h3>
                <div className="flex items-center gap-2">
                  <Link
                    to={`/club?club=${encodeURIComponent(selectedClub)}`}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    {t('championships.view_club_profile')}
                  </Link>
                  <button onClick={() => setSelectedClub(null)} className="text-muted-foreground hover:text-foreground transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {getClubPlayers(selectedClub).length === 0 ? (
                <p className="text-sm text-muted-foreground">{t('championships.no_players_in_club')}</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {getClubPlayers(selectedClub).map(p => (
                    <a
                      key={p.id}
                      href={`/player/${p.id}`}
                      className="flex items-center gap-3 rounded-lg border bg-background p-3 hover:bg-accent/50 transition-colors"
                    >
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.position} — {p.nationality}</p>
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </div>
          )}

          {sofaLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <div key={i} className="h-10 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : hasStandings ? (
            /* Full standings table from SofaScore */
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs">
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">{t('championships.team')}</th>
                    <th className="text-center px-2 py-2">
                      <Users className="w-3 h-3 inline" />
                    </th>
                    <th className="text-center px-2 py-2">MJ</th>
                    <th className="text-center px-2 py-2">V</th>
                    <th className="text-center px-2 py-2">N</th>
                    <th className="text-center px-2 py-2">D</th>
                    <th className="text-center px-2 py-2">BP</th>
                    <th className="text-center px-2 py-2">BC</th>
                    <th className="text-center px-2 py-2 font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team, i) => {
                    const myCount = clubPlayerCount(team.name);
                    return (
                      <tr
                        key={team.id ?? i}
                        onClick={() => setSelectedClub(team.name)}
                        className={cn(
                          'border-t cursor-pointer transition-colors',
                          selectedClub === team.name ? 'bg-primary/5' : 'hover:bg-muted/30',
                        )}
                      >
                        <td className="px-3 py-2 text-muted-foreground font-medium">{team.position ?? i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <TeamLogo src={team.logoUrl} name={team.name} />
                            <span className="font-medium truncate">{team.name}</span>
                          </div>
                        </td>
                        <td className="text-center px-2 py-2">
                          {myCount > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
                              {myCount}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/30">-</span>
                          )}
                        </td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.played ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.wins ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.draws ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.losses ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.goalsFor ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.goalsAgainst ?? '-'}</td>
                        <td className="text-center px-2 py-2 font-bold">{team.points ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : teams.length > 0 ? (
            /* SofaScore teams but no standings (e.g. cup competitions) */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {teams.map((team, i) => {
                const myCount = clubPlayerCount(team.name);
                return (
                  <button
                    key={team.id ?? i}
                    onClick={() => setSelectedClub(team.name)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      selectedClub === team.name ? 'bg-primary/5 border-primary/30' : 'bg-card hover:bg-accent/50',
                    )}
                  >
                    <TeamLogo src={team.logoUrl} name={team.name} />
                    <span className="text-sm font-medium truncate flex-1">{team.name}</span>
                    {myCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold shrink-0">
                        {myCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : staticClubs.length > 0 ? (
            /* Fallback: static club list from LEAGUE_CLUBS */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {staticClubs.map(club => {
                const myCount = clubPlayerCount(club);
                return (
                  <button
                    key={club}
                    onClick={() => setSelectedClub(club)}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border p-3 text-left transition-colors',
                      selectedClub === club ? 'bg-primary/5 border-primary/30' : 'bg-card hover:bg-accent/50',
                    )}
                  >
                    <div className="w-7 h-7 rounded bg-muted flex items-center justify-center text-[10px] font-bold text-muted-foreground shrink-0">
                      {club.charAt(0)}
                    </div>
                    <span className="text-sm font-medium truncate flex-1">{club}</span>
                    {myCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold shrink-0">
                        {myCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t('championships.no_clubs')}</p>
          )}
        </div>
      )}

      {/* Players tab */}
      {tab === 'players' && (
        <div className="space-y-6">
          {/* Linked players */}
          {allLinkedPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('championships.no_players')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {allLinkedPlayers.map(p => {
                const isAuto = leaguePlayerIds.has(p.id);
                const isManual = manualLinkedIds.has(p.id);
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
                    <a href={`/player/${p.id}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.club} — {p.position}</p>
                      </div>
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAuto && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground" title={t('championships.auto_tag')}>
                          auto
                        </span>
                      )}
                      {isManual && (
                        <button onClick={() => handleUnlink(p.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add player */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              {t('championships.add_player')}
            </h3>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('championships.search_player')}
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {playerSearch.trim() && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availablePlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-full">{t('championships.no_results')}</p>
                ) : (
                  availablePlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleLink(p.id)}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors text-left"
                    >
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.club} — {p.position}</p>
                      </div>
                      <PlusCircle className="w-4 h-4 text-primary ml-auto shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ──
export default function Championships() {
  const { t } = useTranslation();
  const { data: championships = [], isLoading } = useChampionships();
  const { data: players = [] } = usePlayers();
  const { data: isAdmin } = useIsAdmin();
  const addCustom = useAddCustomChampionship();
  const deleteCustom = useDeleteCustomChampionship();

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ChampionshipEntry | null>(null);
  const [formName, setFormName] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [selectedChamp, setSelectedChamp] = useState<ChampionshipEntry | null>(null);

  const playerCountByLeague = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of players) {
      const l = (p.league ?? '').trim();
      if (l) map[l] = (map[l] || 0) + 1;
    }
    return map;
  }, [players]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return championships.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q),
    );
  }, [championships, search]);

  const handleAddCustom = async () => {
    if (!formName.trim()) { toast.error(t('championships.name_required')); return; }
    try {
      await addCustom.mutateAsync({ name: formName.trim(), country: formCountry.trim() || 'Autre' });
      toast.success(t('championships.added'));
      setDialogOpen(false);
      setFormName('');
      setFormCountry('');
    } catch { toast.error(t('common.error')); }
  };

  const handleDeleteCustom = async () => {
    if (!deleteTarget?.customId) return;
    try {
      await deleteCustom.mutateAsync(deleteTarget.customId);
      toast.success(t('championships.deleted'));
      if (selectedChamp?.name === deleteTarget.name) setSelectedChamp(null);
    } catch { toast.error(t('common.error')); }
    setDeleteTarget(null);
  };

  // ── Detail view ──
  if (selectedChamp) {
    return <ChampionshipDetail champ={selectedChamp} onBack={() => setSelectedChamp(null)} />;
  }

  // ── List view ──
  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            {t('championships.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('championships.subtitle')}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0">
            <PlusCircle className="w-4 h-4" />
            {t('championships.add')}
          </Button>
        )}
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder={t('championships.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">{t('championships.no_results')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const count = playerCountByLeague[c.name] ?? 0;
            return (
              <div
                key={c.name}
                onClick={() => setSelectedChamp(c)}
                className="group relative rounded-xl border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <LeagueLogo src={c.logoUrl} name={c.name} />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{c.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {getFlag(c.country)} {c.country}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  {c.clubCount > 0 && (
                    <span className="bg-muted px-2 py-0.5 rounded-full">
                      {c.clubCount} {t('championships.clubs')}
                    </span>
                  )}
                  {count > 0 && (
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Users className="w-3 h-3" /> {count}
                    </span>
                  )}
                </div>

                {isAdmin && c.isCustom && (
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('championships.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('championships.name_label')}</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Championnat National, Coupe de France..." />
            </div>
            <div>
              <Label>{t('championships.country_label')}</Label>
              <Input value={formCountry} onChange={e => setFormCountry(e.target.value)} placeholder="France, International..." />
            </div>
            <Button onClick={handleAddCustom} className="w-full" disabled={addCustom.isPending}>
              {t('championships.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('championships.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('championships.delete_desc', { name: deleteTarget?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCustom} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
