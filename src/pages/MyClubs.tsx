import { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useFollowedClubs, useFollowClub, useUnfollowClub } from '@/hooks/use-followed-clubs';
import { usePlayers } from '@/hooks/use-players';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ClubBadge } from '@/components/ui/club-badge';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { FlagIcon } from '@/components/ui/flag-icon';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { formatDate } from '@/lib/format-utils';
import type { Player, Opinion } from '@/types/player';
import {
  Heart, Plus, Search, Building2, Users, ExternalLink, Trash2,
  TrendingUp, AlertTriangle, Trophy, Pencil, StickyNote, Medal,
} from 'lucide-react';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// ── Standing info ─────────────────────────────────────────────────────────────

interface StandingInfo {
  division: string | null;
  country: string | null;
  rank: number | null;
  points: number | null;
  played: number | null;
  wins: number | null;
  losses: number | null;
  draws: number | null;
  season: string | null;
}

function useClubStandingInfo(clubName: string) {
  return useQuery<StandingInfo | null>({
    queryKey: ['club-standing-info', clubName],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/club-standing-info?name=${encodeURIComponent(clubName)}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 30 * 60 * 1000, // 30 min — standings don't change that fast
    enabled: !!clubName,
  });
}

// ── Per-club derived stats ────────────────────────────────────────────────────

interface ClubStats {
  players: Player[];
  count: number;
  league: string | null;
  avgLevel: number | null;
  opinions: { label: string; count: number; cls: string }[];
  expiring: number;
  avatars: Player[];
}

function useClubStats(clubName: string, players: Player[]): ClubStats {
  return useMemo(() => {
    const norm = (s: string) => s.toLowerCase().trim();
    const cp = players.filter(p => p.club && norm(p.club) === norm(clubName));

    const leagueCounts: Record<string, number> = {};
    cp.forEach(p => { if (p.league) leagueCounts[p.league] = (leagueCounts[p.league] ?? 0) + 1; });
    const league = Object.entries(leagueCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    const withLevel = cp.filter(p => (p.current_level ?? 0) > 0);
    const avgLevel = withLevel.length
      ? Math.round(withLevel.reduce((s, p) => s + p.current_level, 0) / withLevel.length * 10) / 10
      : null;

    const opMap: Record<Opinion, number> = { 'À suivre': 0, 'À revoir': 0, 'Défavorable': 0 };
    cp.forEach(p => { if (p.general_opinion && p.general_opinion in opMap) opMap[p.general_opinion as Opinion]++; });
    const opinions = ([
      { label: 'À suivre',    cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/20' },
      { label: 'À revoir',    cls: 'bg-amber-500/15   text-amber-700   dark:text-amber-400   border-amber-500/20' },
      { label: 'Défavorable', cls: 'bg-red-500/15     text-red-700     dark:text-red-400     border-red-500/20' },
    ] as const)
      .map(o => ({ ...o, count: opMap[o.label as Opinion] }))
      .filter(o => o.count > 0);

    const sixMonths = Date.now() + 6 * 30 * 24 * 60 * 60 * 1000;
    const expiring = cp.filter(p =>
      p.contract_end &&
      new Date(p.contract_end).getTime() < sixMonths &&
      new Date(p.contract_end).getTime() > Date.now()
    ).length;

    return { players: cp, count: cp.length, league, avgLevel, opinions, expiring, avatars: cp.slice(0, 4) };
  }, [clubName, players]);
}

// ── Note rich renderer ────────────────────────────────────────────────────────

type NoteSegment = { type: 'text' | 'url' | 'email' | 'phone'; value: string };

function parseNoteSegments(line: string): NoteSegment[] {
  const segments: NoteSegment[] = [];
  // Order matters: URLs first (avoid matching email @ inside URL), then emails, then phones
  const pattern = /https?:\/\/[^\s<>"]+|[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}|\+\d[\d\s.\-()]{7,}|\b0\d(?:[\s.\-]?\d{2}){4}\b/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(line)) !== null) {
    if (m.index > last) segments.push({ type: 'text', value: line.slice(last, m.index) });
    const val = m[0];
    if (/^https?:\/\//.test(val)) segments.push({ type: 'url', value: val });
    else if (/@/.test(val)) segments.push({ type: 'email', value: val });
    else segments.push({ type: 'phone', value: val });
    last = m.index + val.length;
  }
  if (last < line.length) segments.push({ type: 'text', value: line.slice(last) });
  return segments;
}

function NoteRenderer({ text, className }: { text: string; className?: string }) {
  const lines = text.split('\n');
  return (
    <span className={className}>
      {lines.map((line, i) => (
        <span key={i}>
          {i > 0 && <br />}
          {parseNoteSegments(line).map((seg, j) => {
            if (seg.type === 'url') {
              return (
                <a key={j} href={seg.value} target="_blank" rel="noopener noreferrer"
                  onClick={e => e.stopPropagation()}
                  className="text-primary underline underline-offset-2 break-all">
                  {seg.value}
                </a>
              );
            }
            if (seg.type === 'email') {
              return (
                <a key={j} href={`mailto:${seg.value}`}
                  onClick={e => e.stopPropagation()}
                  className="text-primary underline underline-offset-2">
                  {seg.value}
                </a>
              );
            }
            if (seg.type === 'phone') {
              const href = `tel:${seg.value.replace(/[\s.\-()]/g, '')}`;
              return (
                <a key={j} href={href}
                  onClick={e => e.stopPropagation()}
                  className="text-primary underline underline-offset-2">
                  {seg.value}
                </a>
              );
            }
            return <span key={j}>{seg.value}</span>;
          })}
        </span>
      ))}
    </span>
  );
}

// ── Notes dialog ──────────────────────────────────────────────────────────────

function NotesDialog({ clubId, clubName, notes, open, onOpenChange }: {
  clubId: string;
  clubName: string;
  notes: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [draft, setDraft] = useState(notes ?? '');
  const [saving, setSaving] = useState(false);
  const MAX = 500;

  const save = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/followed-clubs/${clubId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: draft.trim() || null }),
      });
      qc.invalidateQueries({ queryKey: ['followed-clubs'] });
      toast.success(t('common.saved'));
      onOpenChange(false);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (v) setDraft(notes ?? ''); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-primary" />
            <span className="truncate">{clubName}</span>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          <Textarea
            value={draft}
            onChange={e => setDraft(e.target.value.slice(0, MAX))}
            placeholder={t('my_clubs.notes_placeholder', 'Notes sur ce club, joueurs cibles, contacts…')}
            className="min-h-[140px] resize-none text-sm"
            autoFocus
          />
          <div className="flex justify-between items-center">
            <span className={`text-xs tabular-nums ${draft.length > MAX * 0.9 ? 'text-amber-500' : 'text-muted-foreground/50'}`}>
              {draft.length}/{MAX}
            </span>
            {draft.trim() !== (notes ?? '') && (
              <span className="text-xs text-muted-foreground/50">{t('common.unsaved_changes', 'Modifications non sauvegardées')}</span>
            )}
          </div>
          {draft.trim() && (
            <div className="rounded-lg border border-border/50 bg-muted/30 px-3 py-2">
              <p className="text-[10px] font-semibold text-muted-foreground/60 uppercase tracking-wide mb-1.5">
                {t('my_clubs.preview', 'Aperçu')}
              </p>
              <NoteRenderer text={draft} className="text-xs text-muted-foreground leading-relaxed" />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
          <Button size="sm" onClick={save} disabled={saving}>{t('common.save')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Rank badge ────────────────────────────────────────────────────────────────

function RankBadge({ rank, points, season }: { rank: number; points: number | null; season: string | null }) {
  const color = rank === 1 ? 'text-yellow-600 bg-yellow-500/10 border-yellow-500/30'
    : rank <= 3 ? 'text-orange-500 bg-orange-500/10 border-orange-500/30'
    : rank <= 6 ? 'text-blue-500 bg-blue-500/10 border-blue-500/30'
    : 'text-muted-foreground bg-muted/60 border-border/50';

  const tip = [
    `${rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`} au classement`,
    points != null && `${points} pts`,
    season && `Saison ${season}`,
  ].filter(Boolean).join(' · ');

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border cursor-default ${color}`}>
          <Medal className="w-3 h-3 shrink-0" />
          #{rank}
        </span>
      </TooltipTrigger>
      <TooltipContent side="top" className="text-xs">{tip}</TooltipContent>
    </Tooltip>
  );
}

// ── Club card ─────────────────────────────────────────────────────────────────

function ClubCard({ club, players, onUnfollow }: {
  club: { id: string; club_name: string; notes: string | null; created_at: string };
  players: Player[];
  onUnfollow: () => void;
}) {
  const { t } = useTranslation();
  const { dateFormat } = useUiPreferences();
  const [notesOpen, setNotesOpen] = useState(false);
  const stats = useClubStats(club.club_name, players);
  const { data: standing } = useClubStandingInfo(club.club_name);

  // Prefer standing division over player-derived league
  const division = standing?.division || stats.league;

  return (
    <>
      <NotesDialog
        clubId={club.id}
        clubName={club.club_name}
        notes={club.notes}
        open={notesOpen}
        onOpenChange={setNotesOpen}
      />

      <Card className="hover:border-primary/30 transition-colors group/card overflow-hidden">
        <CardContent className="p-0">

          {/* ── Header ── */}
          <div className="flex items-start gap-3 p-4 pb-3">
            <Link to={`/club?club=${encodeURIComponent(club.club_name)}`} className="shrink-0 mt-0.5">
              <ClubBadge club={club.club_name} size="lg" />
            </Link>
            <div className="flex-1 min-w-0">
              <div className="flex items-start gap-2 flex-wrap">
                <Link
                  to={`/club?club=${encodeURIComponent(club.club_name)}`}
                  className="text-sm font-bold hover:text-primary hover:underline transition-colors leading-tight"
                >
                  {club.club_name}
                </Link>
                {standing?.rank && (
                  <RankBadge rank={standing.rank} points={standing.points ?? null} season={standing.season ?? null} />
                )}
              </div>

              {/* Division + Country */}
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                {division && (
                  <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Trophy className="w-3 h-3 shrink-0 text-amber-500/70" />
                    <span className="truncate max-w-[130px]">{division}</span>
                  </span>
                )}
                {standing?.country && (
                  <>
                    {division && <span className="text-muted-foreground/30 text-[10px]">·</span>}
                    <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                      <FlagIcon nationality={standing.country} size="sm" />
                      <span className="truncate max-w-[80px]">{standing.country}</span>
                    </span>
                  </>
                )}
              </div>

              {/* Season stats inline if we have a standing */}
              {standing?.rank && standing.played && (
                <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/70">
                  {standing.played && <span>J{standing.played}</span>}
                  {standing.wins != null && <span className="text-emerald-600 dark:text-emerald-400">V{standing.wins}</span>}
                  {standing.draws != null && <span>N{standing.draws}</span>}
                  {standing.losses != null && <span className="text-red-500">D{standing.losses}</span>}
                  {standing.points != null && <span className="font-bold text-foreground/70">{standing.points} pts</span>}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-0.5 shrink-0 -mt-1">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost" size="icon"
                    className="h-7 w-7 opacity-60 hover:opacity-100 transition-opacity"
                    onClick={() => setNotesOpen(true)}
                  >
                    <StickyNote className={`w-3.5 h-3.5 ${club.notes ? 'text-amber-500' : ''}`} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-xs">
                  {club.notes ? t('my_clubs.edit_notes', 'Modifier les notes') : t('my_clubs.add_notes', 'Ajouter une note')}
                </TooltipContent>
              </Tooltip>
              <Link to={`/club?club=${encodeURIComponent(club.club_name)}`}>
                <Button variant="ghost" size="icon" className="h-7 w-7 opacity-60 hover:opacity-100 transition-opacity">
                  <ExternalLink className="w-3.5 h-3.5" />
                </Button>
              </Link>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-destructive/50 hover:text-destructive opacity-0 group-hover/card:opacity-100 transition-all"
                onClick={onUnfollow}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          </div>

          {/* ── Scouted players ── */}
          {stats.count > 0 && (
            <div className="px-4 pb-3">
              {/* Avatar strip + date */}
              <div className="flex items-center gap-2 mb-3">
                <div className="flex -space-x-2">
                  {stats.avatars.map(p => (
                    <Link key={p.id} to={`/player/${p.id}`} className="hover:z-10 relative" title={p.name}>
                      <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" className="ring-2 ring-background" />
                    </Link>
                  ))}
                  {stats.count > 4 && (
                    <div className="w-7 h-7 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-[10px] font-bold text-muted-foreground">
                      +{stats.count - 4}
                    </div>
                  )}
                </div>
                <span className="text-xs text-muted-foreground/60 ml-1">
                  {t('my_clubs.since')} {formatDate(club.created_at, dateFormat)}
                </span>
              </div>

              {/* Stats grid */}
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                  <Users className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
                  <p className="text-sm font-bold">{stats.count}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t('my_clubs.players_scouted')}</p>
                </div>
                <div className="rounded-lg bg-muted/50 px-2.5 py-2 text-center">
                  <TrendingUp className="w-3 h-3 text-muted-foreground mx-auto mb-0.5" />
                  <p className="text-sm font-bold">{stats.avgLevel !== null ? stats.avgLevel : '—'}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t('my_clubs.avg_level', 'Niveau moy.')}</p>
                </div>
                <div className={`rounded-lg px-2.5 py-2 text-center ${stats.expiring > 0 ? 'bg-amber-500/10' : 'bg-muted/50'}`}>
                  <AlertTriangle className={`w-3 h-3 mx-auto mb-0.5 ${stats.expiring > 0 ? 'text-amber-500' : 'text-muted-foreground'}`} />
                  <p className={`text-sm font-bold ${stats.expiring > 0 ? 'text-amber-600 dark:text-amber-400' : ''}`}>{stats.expiring}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t('my_clubs.expiring_contracts', 'Contrats < 6m')}</p>
                </div>
              </div>

              {/* Opinion badges */}
              {stats.opinions.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                  {stats.opinions.map(o => (
                    <span key={o.label} className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${o.cls}`}>
                      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-80 shrink-0" />
                      {o.label} ×{o.count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── No players ── */}
          {stats.count === 0 && (
            <div className="px-4 pb-3">
              <p className="text-xs text-muted-foreground/40 italic">{t('my_clubs.no_players_yet', 'Aucun joueur suivi dans ce club')}</p>
              <p className="text-[10px] text-muted-foreground/30 mt-0.5">{t('my_clubs.since')} {formatDate(club.created_at, dateFormat)}</p>
            </div>
          )}

          {/* ── Notes preview ── */}
          {club.notes && (
            <div
              className="mx-3 mb-3 px-3 py-2 rounded-lg bg-amber-500/5 border border-amber-500/15 cursor-pointer hover:bg-amber-500/10 transition-colors"
              onClick={() => setNotesOpen(true)}
            >
              <div className="flex items-start gap-2">
                <StickyNote className="w-3 h-3 text-amber-500/70 shrink-0 mt-0.5" />
                <NoteRenderer
                  text={club.notes}
                  className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3 flex-1"
                />
                <Pencil className="w-3 h-3 text-muted-foreground/25 shrink-0 mt-0.5" />
              </div>
            </div>
          )}

        </CardContent>
      </Card>
    </>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function MyClubs() {
  const { t } = useTranslation();
  const { data: followedClubs = [], isLoading } = useFollowedClubs();
  const { data: players = [] } = usePlayers();
  const followClub = useFollowClub();
  const unfollowClub = useUnfollowClub();
  const [newClub, setNewClub] = useState('');
  const [search, setSearch] = useState('');

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClub.trim()) return;
    followClub.mutate({ club_name: newClub.trim() }, {
      onSuccess: () => { setNewClub(''); toast.success(t('my_clubs.added', { club: newClub.trim() })); },
      onError: () => toast.error(t('common.error')),
    });
  };

  const filtered = followedClubs.filter(c =>
    c.club_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Heart className="w-6 h-6 text-primary" />
          {t('my_clubs.title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('my_clubs.subtitle')}</p>
      </div>

      {/* Add club */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleAdd} className="flex gap-2">
            <div className="flex-1 relative">
              <Plus className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input value={newClub} onChange={e => setNewClub(e.target.value)} placeholder={t('my_clubs.add_placeholder')} className="pl-10" />
            </div>
            <Button type="submit" disabled={followClub.isPending || !newClub.trim()}>
              <Heart className="w-4 h-4 mr-2" />{t('my_clubs.add_btn')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Search */}
      {followedClubs.length > 5 && (
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('my_clubs.search')} className="pl-10" />
        </div>
      )}

      {/* Club list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground text-sm">{t('common.loading')}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('my_clubs.empty')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('my_clubs.empty_desc')}</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {filtered.map(club => (
            <ClubCard key={club.id} club={club} players={players} onUnfollow={() => unfollowClub.mutate(club.id)} />
          ))}
        </div>
      )}
    </div>
  );
}
