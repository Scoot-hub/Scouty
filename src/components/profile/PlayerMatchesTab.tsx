import { useState, useMemo, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { MapPin, CalendarDays, Plus, Trash2, Loader2, Shield, Zap } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAllEventsForDay } from '@/hooks/use-api-football';
import { ClubSearchInput } from '@/components/ui/club-search-input';
import { ChampionshipSearchInput } from '@/components/ui/championship-search-input';

// Fix Leaflet default icon paths broken by bundlers
const proto = L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown };
delete proto._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl:       'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl:     'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function getAuthHeaders(): Record<string, string> {
  try {
    const s = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
    return s?.access_token ? { Authorization: `Bearer ${s.access_token}` } : {};
  } catch { return {}; }
}

// ── Team name matching (same logic as Fixtures.tsx) ─────────────────────────
function normalizeTeamName(name: string): string {
  return name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function stripPrefixes(norm: string): string {
  return norm.replace(/\b(fc|cf|sc|ac|as|us|rc|og|ss|ssc|afc|bsc|fk|sk|sv|vfb|vfl|tsv|rb|1\.)(\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
}
const ABBREVIATIONS: Record<string, string> = { utd: 'united', cty: 'city', ath: 'athletic', sp: 'sporting', int: 'inter', oly: 'olympique', dep: 'deportivo' };
function expandAbbreviations(norm: string): string {
  return norm.split(' ').map(w => ABBREVIATIONS[w] ?? w).join(' ');
}
function isReserveTeam(name: string): boolean {
  const n = name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return /\s(b|ii|iii|2|3|u\d{2}|castilla|reserves?|youth|amateur)\s*$/.test(n) || /^(jong|jeunesse)\s/.test(n);
}
function clubMatchesTeam(playerClub: string, teamName: string): boolean {
  if (isReserveTeam(playerClub) !== isReserveTeam(teamName)) return false;
  const normClub = normalizeTeamName(playerClub);
  const normTeam = normalizeTeamName(teamName);
  if (!normClub || !normTeam || normClub.length < 3 || normTeam.length < 3) return false;
  if (normClub === normTeam) return true;
  const sc = stripPrefixes(normClub), st = stripPrefixes(normTeam);
  if (sc && st && sc === st) return true;
  const ec = expandAbbreviations(sc), et = expandAbbreviations(st);
  if (ec === et) return true;
  if (stripPrefixes(ec) === stripPrefixes(et)) return true;
  return false;
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

interface UpcomingMatch {
  id: string;
  obsId?: string;
  source: 'calendar' | 'manual' | 'livescore';
  championship?: string | null;
  round?: number;
  roundName?: string;
  homeTeam: string;
  awayTeam: string;
  homeBadge?: string | null;
  awayBadge?: string | null;
  homeScore?: number | null;
  awayScore?: number | null;
  startDate?: string | null;
  hasTime?: boolean;
  lat?: number | null;
  lng?: number | null;
  city?: string | null;
  venue?: string | null;
  notes?: string | null;
  status?: string | null;
}

interface Props { playerId: string; playerClub: string; playerLeague?: string; canEdit: boolean }

function formatMatchDate(dateStr: string | null | undefined, hasTime?: boolean) {
  if (!dateStr) return null;
  try {
    const d = new Date(dateStr);
    const datePart = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
    if (!hasTime) return datePart;
    return `${datePart} · ${d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`;
  } catch { return dateStr; }
}

const FRANCE_CENTER: [number, number] = [46.6, 2.3];

const BLANK_FORM = { competition: '', home_team: '', away_team: '', match_date: '', venue: '', city: '', notes: '' };

export default function PlayerMatchesTab({ playerId, playerClub, playerLeague = '', canEdit }: Props) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);

  // Auto-fill venue/city from home team selection
  const { data: venueHint } = useQuery<{ venue: string | null; city: string | null }>({
    queryKey: ['club-venue', form.home_team],
    queryFn: async () => {
      if (!form.home_team || form.home_team.length < 2) return { venue: null, city: null };
      const res = await fetch(`${API}/club-venue?club=${encodeURIComponent(form.home_team)}`, { headers: getAuthHeaders() });
      return res.ok ? res.json() : { venue: null, city: null };
    },
    enabled: addOpen && form.home_team.length >= 2,
    staleTime: 60_000,
  });

  // When venue hint arrives (or home_team changes), auto-fill empty venue/city fields
  const prevVenueKey = useRef('');
  useEffect(() => {
    if (!addOpen || !venueHint) return;
    const key = form.home_team + '|' + (venueHint.venue || '') + '|' + (venueHint.city || '');
    if (key === prevVenueKey.current) return;
    prevVenueKey.current = key;
    setForm(f => ({
      ...f,
      venue: f.venue || venueHint.venue || '',
      city: f.city || venueHint.city || '',
    }));
  }, [venueHint, form.home_team, addOpen]);

  // Auto-fill competition from player's league when one of the teams matches the player's club
  const prevCompKey = useRef('');
  useEffect(() => {
    if (!addOpen || !playerLeague || form.competition) return;
    const homeMatches = form.home_team && clubMatchesTeam(playerClub, form.home_team);
    const awayMatches = form.away_team && clubMatchesTeam(playerClub, form.away_team);
    if (!homeMatches && !awayMatches) return;
    const key = playerLeague + '|' + form.home_team + '|' + form.away_team;
    if (key === prevCompKey.current) return;
    prevCompKey.current = key;
    setForm(f => ({ ...f, competition: f.competition || playerLeague }));
  }, [form.home_team, form.away_team, addOpen, playerClub, playerLeague]);

  // Validation: at least one team must match the player's club (only enforced if club is known)
  const bothFilled = !!(form.home_team || form.away_team);
  const clubValid = !playerClub || !bothFilled ||
    clubMatchesTeam(playerClub, form.home_team) ||
    clubMatchesTeam(playerClub, form.away_team);

  // DB calendar + manual observations
  const { data: dbData, isLoading } = useQuery<{ club: string; matches: UpcomingMatch[] }>({
    queryKey: ['player-upcoming-matches', playerId],
    queryFn: async () => {
      const res = await fetch(`${API}/player-upcoming-matches/${playerId}`, { headers: getAuthHeaders(), cache: 'no-store' });
      // IMPORTANT: throw on error — React Query then keeps the previous cached data
      // instead of replacing it with empty data, preventing the "match disappears" bug.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 0,
    refetchOnWindowFocus: false,
    enabled: !!playerId,
  });

  // Livescore events for today — same data the /fixtures page uses
  const today = getTodayString();
  const { data: livescoreData } = useAllEventsForDay(today, !!playerClub);

  // Filter livescore events matching the player's club
  const livescoreMatches = useMemo<UpcomingMatch[]>(() => {
    if (!playerClub || !livescoreData?.competitions) return [];
    const results: UpcomingMatch[] = [];
    for (const comp of livescoreData.competitions) {
      for (const ev of comp.events) {
        const isHome = clubMatchesTeam(playerClub, ev.home_team);
        const isAway = clubMatchesTeam(playerClub, ev.away_team);
        if (!isHome && !isAway) continue;
        const timeStr = ev.match_time ? `${today}T${ev.match_time}:00` : null;
        results.push({
          id: `ls_${ev.id}`,
          source: 'livescore',
          championship: `${comp.name}${comp.country ? ` (${comp.country})` : ''}`,
          homeTeam: ev.home_team,
          awayTeam: ev.away_team,
          homeBadge: ev.home_badge,
          awayBadge: ev.away_badge,
          homeScore: ev.score_home,
          awayScore: ev.score_away,
          startDate: timeStr,
          hasTime: !!ev.match_time,
          status: ev.status,
        });
      }
    }
    return results;
  }, [playerClub, livescoreData, today]);

  // Merge DB matches + deduplicated livescore, sorted by date — fully memoized
  const allMatches = useMemo<UpcomingMatch[]>(() => {
    const dbMs = dbData?.matches ?? [];
    const deduped = livescoreMatches.filter(lm => {
      const dayLm = (lm.startDate ?? '').slice(0, 10);
      return !dbMs.some(db => {
        const dayDb = (db.startDate ?? '').slice(0, 10);
        return dayDb === dayLm &&
          normalizeTeamName(db.homeTeam) === normalizeTeamName(lm.homeTeam) &&
          normalizeTeamName(db.awayTeam) === normalizeTeamName(lm.awayTeam);
      });
    });
    return [...dbMs, ...deduped].sort((a, b) => {
      if (!a.startDate && !b.startDate) return 0;
      if (!a.startDate) return 1;
      if (!b.startDate) return -1;
      return a.startDate.localeCompare(b.startDate);
    });
  }, [dbData, livescoreMatches]);

  const mapPoints = useMemo(() => allMatches.filter(m => m.lat != null && m.lng != null), [allMatches]);

  const addObs = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/player-match-observations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ player_id: playerId, ...form }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur');
      return data as UpcomingMatch;
    },
    onSuccess: (newMatch) => {
      // Normalize the id to the same "obs_" prefix that GET returns, so the
      // optimistic entry won't duplicate when the eventual invalidation refetches.
      const normalized: UpcomingMatch = {
        ...newMatch,
        id: newMatch.id.startsWith('obs_') ? newMatch.id : `obs_${newMatch.id}`,
      };
      qc.setQueryData<{ club: string; matches: UpcomingMatch[] }>(
        ['player-upcoming-matches', playerId],
        old => {
          if (!old) return old;
          const updated = [...old.matches, normalized].sort((a, b) => {
            if (!a.startDate && !b.startDate) return 0;
            if (!a.startDate) return 1;
            if (!b.startDate) return -1;
            return a.startDate.localeCompare(b.startDate);
          });
          return { ...old, matches: updated };
        }
      );
      // Delay invalidation to let TiDB write propagate to the read replica before
      // the next GET fires — an immediate refetch can race the replication and
      // return stale data that overwrites the optimistic entry (making it disappear).
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['player-upcoming-matches', playerId] });
      }, 1500);
      setAddOpen(false);
      setForm(BLANK_FORM);
      prevVenueKey.current = '';
      prevCompKey.current = '';
      toast.success('Match ajouté');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteObs = useMutation({
    mutationFn: async (obsId: string) => {
      const res = await fetch(`${API}/player-match-observations/${obsId}`, { method: 'DELETE', headers: getAuthHeaders() });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur');
    },
    onSuccess: () => {
      qc.refetchQueries({ queryKey: ['player-upcoming-matches', playerId] });
      toast.success('Match supprimé');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="w-5 h-5 animate-spin mr-2" />Chargement…
      </div>
    );
  }

  const noData = allMatches.length === 0;

  return (
    <div className="space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium">Prochains matchs</h3>
          {dbData?.club && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Club suivi : <span className="font-medium text-foreground">{dbData.club}</span>
            </p>
          )}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" className="gap-1.5 rounded-xl h-8" onClick={() => {
            prevVenueKey.current = '';
            prevCompKey.current = '';
            setForm({ ...BLANK_FORM, home_team: playerClub || '', competition: playerLeague || '' });
            setAddOpen(true);
          }}>
            <Plus className="w-3.5 h-3.5" />
            Ajouter un match
          </Button>
        )}
      </div>

      {/* Map */}
      {mapPoints.length > 0 && (
        <div className="rounded-xl overflow-hidden border border-border/60 h-64">
          <MapContainer
            center={mapPoints.length === 1 ? [mapPoints[0].lat!, mapPoints[0].lng!] : FRANCE_CENTER}
            zoom={mapPoints.length === 1 ? 11 : 5}
            className="h-full w-full"
            scrollWheelZoom={false}
          >
            <TileLayer
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            />
            {mapPoints.map(m => (
              <Marker key={m.id} position={[m.lat!, m.lng!]}>
                <Popup>
                  <div className="text-sm space-y-1 min-w-[160px]">
                    <p className="font-semibold">{m.homeTeam} – {m.awayTeam}</p>
                    {m.championship && <p className="text-xs text-gray-500">{m.championship}</p>}
                    {m.startDate && <p className="text-xs">{formatMatchDate(m.startDate, m.hasTime)}</p>}
                    {m.city && <p className="text-xs text-gray-500"><MapPin className="inline w-3 h-3 mr-0.5" />{m.city}</p>}
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* No data */}
      {noData && (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground space-y-2">
          <CalendarDays className="w-8 h-8 mx-auto opacity-30" />
          <p className="text-sm">
            {playerClub
              ? `Aucun prochain match trouvé pour ${playerClub}.`
              : "Ce joueur n'a pas de club renseigné."}
          </p>
          {canEdit && (
            <Button size="sm" variant="outline" className="mt-2 rounded-xl" onClick={() => {
              prevVenueKey.current = '';
              prevCompKey.current = '';
              setForm({ ...BLANK_FORM, home_team: playerClub || '', competition: playerLeague || '' });
              setAddOpen(true);
            }}>
              <Plus className="w-3.5 h-3.5 mr-1" />Ajouter manuellement
            </Button>
          )}
        </div>
      )}

      {/* Match list */}
      {!noData && (
        <div className="space-y-2">
          {allMatches.map(m => {
            const isLive = m.status && m.status !== 'NS' && m.status !== 'FT' && m.status !== 'AET' && m.status !== 'AP';
            return (
              <Card key={m.id} className={cn('border-border/60', m.source === 'manual' && 'border-dashed', isLive && 'border-green-500/40 bg-green-500/5')}>
                <CardContent className="p-3 flex items-center gap-3">
                  {/* Badges */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.homeBadge
                      ? <img src={m.homeBadge} alt={m.homeTeam} className="w-6 h-6 object-contain" />
                      : <Shield className="w-5 h-5 text-muted-foreground/30" />}
                    <span className="text-[10px] font-semibold text-muted-foreground">vs</span>
                    {m.awayBadge
                      ? <img src={m.awayBadge} alt={m.awayTeam} className="w-6 h-6 object-contain" />
                      : <Shield className="w-5 h-5 text-muted-foreground/30" />}
                  </div>

                  {/* Match info */}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {m.homeTeam}
                      {m.homeScore != null && m.awayScore != null && (
                        <span className="mx-1.5 font-bold tabular-nums">{m.homeScore}–{m.awayScore}</span>
                      )}
                      {m.homeScore == null && <span className="text-muted-foreground font-normal mx-1">–</span>}
                      {m.awayTeam}
                    </p>
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
                      {m.startDate && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <CalendarDays className="w-3 h-3" />{formatMatchDate(m.startDate, m.hasTime)}
                        </span>
                      )}
                      {(m.city || m.venue) && (
                        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <MapPin className="w-3 h-3" />{m.venue || m.city}
                        </span>
                      )}
                      {m.championship && (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[180px]">{m.championship}</span>
                      )}
                      {m.round && !m.championship && (
                        <span className="text-[11px] text-muted-foreground">J{m.round}</span>
                      )}
                    </div>
                    {m.notes && <p className="text-[11px] text-muted-foreground mt-1 italic truncate">{m.notes}</p>}
                  </div>

                  {/* Right */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isLive && (
                      <Badge className="bg-green-500/15 text-green-600 border-green-500/30 text-[9px] h-4 px-1.5">
                        {m.status}
                      </Badge>
                    )}
                    {m.source === 'livescore' && !isLive && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5 gap-1">
                        <Zap className="w-2.5 h-2.5" />Live
                      </Badge>
                    )}
                    {m.source === 'manual' && (
                      <Badge variant="outline" className="text-[9px] h-4 px-1.5">Manuel</Badge>
                    )}
                    {canEdit && m.source === 'manual' && m.obsId && (
                      <Button
                        size="icon" variant="ghost"
                        className="w-6 h-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteObs.mutate(m.obsId!)}
                        disabled={deleteObs.isPending}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Add match dialog */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Ajouter un match à observer</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Équipe domicile
                {playerClub && clubMatchesTeam(playerClub, form.home_team) && (
                  <span className="ml-1.5 text-[10px] text-green-600 dark:text-green-400 font-medium">✓ club du joueur</span>
                )}
              </label>
              <ClubSearchInput
                value={form.home_team}
                onChange={v => setForm(f => ({ ...f, home_team: v }))}
                placeholder="Ex : PSG"
                size="sm"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">
                Équipe visiteur
                {playerClub && clubMatchesTeam(playerClub, form.away_team) && (
                  <span className="ml-1.5 text-[10px] text-green-600 dark:text-green-400 font-medium">✓ club du joueur</span>
                )}
              </label>
              <ClubSearchInput
                value={form.away_team}
                onChange={v => setForm(f => ({ ...f, away_team: v }))}
                placeholder="Ex : Marseille"
                size="sm"
              />
            </div>

            {/* Warning: neither team matches player's club */}
            {playerClub && bothFilled && !clubValid && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 rounded-lg px-3 py-2 leading-relaxed">
                Le club du joueur (<span className="font-semibold">{playerClub}</span>) doit figurer en équipe domicile ou visiteur.
              </p>
            )}

            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Compétition</label>
              <ChampionshipSearchInput
                value={form.competition}
                onChange={v => setForm(f => ({ ...f, competition: v }))}
                placeholder="Ex : Ligue 1"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Date & heure</label>
              <Input
                type="datetime-local"
                value={form.match_date}
                onChange={e => setForm(f => ({ ...f, match_date: e.target.value }))}
                className="h-8 text-sm rounded-xl"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Stade / Lieu</label>
                <Input
                  placeholder="Parc des Princes"
                  value={form.venue}
                  onChange={e => setForm(f => ({ ...f, venue: e.target.value }))}
                  className="h-8 text-sm rounded-xl"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Ville</label>
                <Input
                  placeholder="Paris"
                  value={form.city}
                  onChange={e => setForm(f => ({ ...f, city: e.target.value }))}
                  className="h-8 text-sm rounded-xl"
                />
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-xs text-muted-foreground">Notes</label>
              <Input
                placeholder="Notes d'observation…"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                className="h-8 text-sm rounded-xl"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setAddOpen(false)}>Annuler</Button>
            <Button
              size="sm" className="rounded-xl"
              onClick={() => addObs.mutate()}
              disabled={addObs.isPending || (!form.home_team && !form.away_team) || !clubValid}
            >
              {addObs.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Ajouter'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
