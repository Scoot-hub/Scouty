import { useSearchParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState, useRef, useEffect, useMemo, lazy, Suspense } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';

const LazyStatsBombTactics = lazy(() => import('@/components/club/StatsBombTacticsTab'));
import { supabase } from '@/integrations/supabase/client';
import { usePlayers } from '@/hooks/use-players';
import { useIsAdmin, useIsAdminOrModerator } from '@/hooks/use-admin';
import { useAuth } from '@/contexts/AuthContext';
import { useFollowedClubs, useFollowClub, useUnfollowClub } from '@/hooks/use-followed-clubs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import DateInput from '@/components/ui/date-input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { ClubBadge } from '@/components/ui/club-badge';
import { translateCountry } from '@/types/player';
import { resolveClubName, getClubSearchAliases, fetchClubSquad, type SquadPlayer } from '@/lib/thesportsdb';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { FlagIcon } from '@/components/ui/flag-icon';
import {
  Loader2, MapPin, Calendar, Users, Trophy, Building2, Globe,
  ExternalLink, Shirt, Info, Newspaper, Heart, HeartOff, Trash2, Plus, ArrowLeft, Search,
  History, Star, ChevronDown, ChevronUp, Crown, UserCircle, RefreshCw,
  Zap, StickyNote, Pencil, Check, X as XIcon, Link2, MoreHorizontal, Camera,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDate, convertMV } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useRatesMap } from '@/hooks/use-exchange-rates';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

interface FormerPlayer { name: string; nationality: string | null; position: string | null; from: string | null; to: string | null }

function FormerPlayersCard({ players, t }: { players: FormerPlayer[]; t: (key: string) => string }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? players : players.slice(0, 12);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="w-4 h-4 text-primary" />
          {t('club.former_players')}
          <span className="text-sm font-normal text-muted-foreground">({players.length})</span>
        </CardTitle>
        <p className="text-xs text-muted-foreground">{t('club.former_players_subtitle')}</p>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="space-y-1">
          {visible.map((fp, i) => (
            <div key={i} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
              <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 text-muted-foreground">
                {fp.name?.[0] ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{fp.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {[fp.position, fp.nationality].filter(Boolean).join(' · ')}
                </p>
              </div>
              {(fp.from || fp.to) && (
                <span className="text-[11px] text-muted-foreground font-mono shrink-0">
                  {fp.from ?? '?'}–{fp.to ?? '…'}
                </span>
              )}
            </div>
          ))}
        </div>
        {players.length > 12 && (
          <button
            onClick={() => setExpanded(v => !v)}
            className="mt-3 flex items-center gap-1 text-xs text-primary hover:underline mx-auto"
          >
            {expanded ? (
              <><ChevronUp className="w-3.5 h-3.5" />{t('club.show_less')}</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" />{t('club.show_all')} ({players.length})</>
            )}
          </button>
        )}
      </CardContent>
    </Card>
  );
}

interface TeamData {
  idTeam: string;
  strTeam: string;
  strTeamBadge: string;
  strStadium: string;
  strStadiumThumb: string;
  intStadiumCapacity: string;
  strCountry: string;
  strLeague: string;
  intFormedYear: string;
  strDescriptionFR: string | null;
  strDescriptionEN: string | null;
  strDescriptionES: string | null;
  strWebsite: string | null;
  strFacebook: string | null;
  strTwitter: string | null;
  strInstagram: string | null;
  strKit: string | null;
  strBanner: string | null;
  strManager: string | null;
  strKeywords: string | null;
  strColour1: string | null;
  strColour2: string | null;
  // TheSportsDB geo fields
  fltLatitude?: string | null;
  fltLongitude?: string | null;
  strStadiumLocation?: string | null;
  // TM-enriched fields (added by our fallback)
  _tmUrl?: string | null;
  _tmSquadSize?: number | null;
  _tmAvgAge?: string | null;
  _tmMarketValue?: string | null;
  _tmCompetitionId?: string | null;
  _tmCompetitionSlug?: string | null;
  _tmCurrentSeason?: string | null;
}

interface ClubOverride {
  id?: number;
  club_name?: string;
  city?: string | null;
  official_website?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  founded_year?: number | null;
  stadium?: string | null;
  stadium_capacity?: number | null;
  manager?: string | null;
  coach_photo_url?: string | null;
  coach_nationality?: string | null;
  coach_date_born?: string | null;
  description_fr?: string | null;
  description_en?: string | null;
  league?: string | null;
  colour1?: string | null;
  colour2?: string | null;
  badge_url?: string | null;
  // Extended fields
  country?: string | null;
  division?: string | null;
  staff_technical?: string | null;
  contact_name?: string | null;
  contact_role?: string | null;
  contact_phone?: string | null;
  contact_email?: string | null;
  current_ranking?: number | null;
  current_season?: string | null;
  stats_goals_for?: number | null;
  stats_goals_against?: number | null;
  stats_clean_sheets?: number | null;
  stats_wins?: number | null;
  stats_draws?: number | null;
  stats_losses?: number | null;
  transfer_budget?: string | null;
  avg_salary?: string | null;
  partnership_status?: string | null;
  recommended_players?: string | null;
  scout_rating?: number | null;
}

// Defer a section's data fetch until it enters the viewport (200px lookahead).
function useLazySection() {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return; }
    const obs = new IntersectionObserver(
      ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
      { rootMargin: '300px' },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return { ref, visible };
}

export default function ClubProfile() {
  const { t, i18n } = useTranslation();
  const { dateFormat, currency } = useUiPreferences();
  const rates = useRatesMap();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clubName = searchParams.get('club') || '';
  const { data: players = [] } = usePlayers();
  const { data: followedClubs = [] } = useFollowedClubs();
  const followClub = useFollowClub();
  const unfollowClub = useUnfollowClub();
  const { user: currentUser } = useAuth();
  const { data: isAdmin } = useIsAdmin();
  const { data: canOverride } = useIsAdminOrModerator();
  const queryClient = useQueryClient();
  const followedEntry = followedClubs.find(c => c.club_name.toLowerCase() === clubName.toLowerCase());

  // Lazy sections — only fetch when scrolled into view
  const { ref: staffSectionRef,      visible: staffVisible      } = useLazySection();
  const { ref: standingsSectionRef,  visible: standingsVisible  } = useLazySection();
  const { ref: honoursSectionRef,    visible: honoursVisible    } = useLazySection();
  const { ref: historySectionRef,    visible: historyVisible    } = useLazySection();
  const { ref: buzzSectionRef,       visible: buzzVisible       } = useLazySection();

  // Resolve common abbreviations
  const resolvedClub = clubName ? resolveClubName(clubName) : '';

  // Helper: convert TM profile to TeamData shape
  const tmToTeam = (p: Record<string, unknown>): TeamData => ({
    idTeam: String(p.clubId ?? ''), strTeam: String(p.clubName ?? ''), strTeamBadge: String(p.badge ?? ''),
    strStadium: String(p.stadium ?? ''), strStadiumThumb: '', intStadiumCapacity: '',
    strCountry: String(p.country ?? ''), strLeague: String(p.league ?? ''), intFormedYear: '',
    strDescriptionFR: null, strDescriptionEN: null, strDescriptionES: null,
    strWebsite: null, strFacebook: null, strTwitter: null, strInstagram: null,
    strKit: null, strBanner: null, strManager: null, strKeywords: null,
    strColour1: null, strColour2: null,
    _tmUrl: p.tmUrl ? String(p.tmUrl) : null, _tmSquadSize: p.squadSize ? Number(p.squadSize) : null, _tmAvgAge: p.avgAge ? String(p.avgAge) : null, _tmMarketValue: p.marketValue ? String(p.marketValue) : null,
    _tmCompetitionId: p.competitionId ? String(p.competitionId) : null, _tmCompetitionSlug: p.competitionSlug ? String(p.competitionSlug) : null, _tmCurrentSeason: p.currentSeason ? String(p.currentSeason) : null,
  });

  // Build search term variants for TheSportsDB (which uses non-standard club names)
  const buildSearchTerms = (name: string): string[] => {
    const terms = new Set<string>();
    const resolved = resolveClubName(name);
    terms.add(resolved);
    if (resolved !== name) terms.add(name);

    // Add all known aliases from CLUB_NAME_MAP (e.g. "St Etienne", "ASSE", etc.)
    for (const alias of getClubSearchAliases(name)) terms.add(alias);

    // Generate common short forms
    const words = resolved.split(/[\s-]+/);
    if (words.length >= 2) {
      // First word + initials: "Paris Saint-Germain" → "Paris SG"
      const initials = words.slice(1).map(w => w[0]?.toUpperCase()).join('');
      if (initials.length >= 1) terms.add(`${words[0]} ${initials}`);
      // Just the first word if long enough
      if (words[0].length >= 4) terms.add(words[0]);
      // First two words only
      if (words.length >= 3) terms.add(words.slice(0, 2).join(' '));
    }
    // Without common prefixes: "AS Saint-Étienne" → "Saint-Étienne"
    const noPrefix = resolved.replace(/^(FC|AC|AS|RC|SC|SS|US|AJ|OGC|LOSC|Stade|Real|Sporting|Athletic)\s+/i, '').trim();
    if (noPrefix !== resolved && noPrefix.length >= 3) terms.add(noPrefix);

    // "Saint" → "St" variants: "Saint-Etienne" → "St Etienne"
    for (const t of [...terms]) {
      if (/saint/i.test(t)) terms.add(t.replace(/Saint[- ]?/gi, 'St ').replace(/\s+/g, ' ').trim());
    }
    // Remove accents variants
    for (const t of [...terms]) {
      const noAccent = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (noAccent !== t) terms.add(noAccent);
    }

    return [...terms];
  };

  // Score how well a team name matches the query (higher = better)
  const nameMatchScore = (teamName: string, query: string): number => {
    const a = teamName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    const b = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
    if (a === b) return 100;
    if (a.includes(b) || b.includes(a)) return 80;
    // Compare words overlap
    const aw = new Set(a.split(/[\s\-]+/));
    const bw = new Set(b.split(/[\s\-]+/));
    let common = 0;
    for (const w of bw) if (aw.has(w)) common++;
    return common > 0 ? (common / Math.max(aw.size, bw.size)) * 60 : 0;
  };

  // ── Fetch club data: server cache → Transfermarkt → TheSportsDB ──
  const { data: team, isLoading } = useQuery<TeamData | null>({
    queryKey: ['club-profile', clubName],
    queryFn: async () => {
      if (!clubName) return null;

      // 1. Check server-side DB cache (4h TTL, cross-user)
      try {
        const cached = await fetch(`${API}/club-profile-cache?name=${encodeURIComponent(clubName)}`, { credentials: 'include' });
        if (cached.ok) return await cached.json() as TeamData;
      } catch {}

      const searchTerms = buildSearchTerms(clubName);
      const canonical = resolveClubName(clubName);

      // 2. Try Transfermarkt first (most reliable for exact club identity)
      let tmTeam: TeamData | null = null;
      for (const term of searchTerms) {
        try {
          const resp = await fetch(`${API}/club-tm-search?q=${encodeURIComponent(term)}`);
          if (!resp.ok) continue;
          const profile = await resp.json();
          if (profile?.clubName) { tmTeam = tmToTeam(profile); break; }
        } catch {}
      }

      // 3. Try TheSportsDB (richer data: description, stadium photo, etc.)
      let result: TeamData | null = null;
      for (const term of searchTerms) {
        try {
          const { data } = await supabase.functions.invoke('thesportsdb-proxy', {
            body: { endpoint: 'searchteams', params: { t: term } },
          });
          const teams = (data?.teams || []) as Record<string, unknown>[];
          const soccer = teams.filter((t) => t.strSport === 'Soccer' || t.strSport === 'Football');
          if (soccer.length === 0) continue;

          const scored = soccer.map((t) => ({
            team: t,
            score: Math.max(nameMatchScore(String(t.strTeam ?? ''), canonical), nameMatchScore(String(t.strTeam ?? ''), clubName)),
          })).sort((a, b) => b.score - a.score);

          if (scored[0]?.score >= 40) {
            const best = scored[0].team as TeamData;
            if (tmTeam) {
              best._tmUrl = tmTeam._tmUrl;
              best._tmSquadSize = tmTeam._tmSquadSize;
              best._tmAvgAge = tmTeam._tmAvgAge;
              best._tmMarketValue = tmTeam._tmMarketValue;
              best._tmCompetitionId = tmTeam._tmCompetitionId;
              best._tmCompetitionSlug = tmTeam._tmCompetitionSlug;
              best._tmCurrentSeason = tmTeam._tmCurrentSeason;
              if (!best.strTeamBadge && tmTeam.strTeamBadge) best.strTeamBadge = tmTeam.strTeamBadge;
              if (!best.strCountry && tmTeam.strCountry) best.strCountry = tmTeam.strCountry;
              if (!best.strLeague && tmTeam.strLeague) best.strLeague = tmTeam.strLeague;
            }
            result = best;
            break;
          }
        } catch {}
      }

      if (!result) result = tmTeam;

      // 4. Last fallback: build from internal DB (club_directory + club_logos)
      if (!result) {
        try {
          const resp = await fetch(`${API}/club-search?q=${encodeURIComponent(clubName)}`);
          if (resp.ok) {
            const results: { club_name: string; logo_url?: string; competition?: string; country?: string }[] = await resp.json();
            const match = results.find(r => r.club_name.toLowerCase() === clubName.toLowerCase())
              || results.find(r => r.club_name.toLowerCase().includes(clubName.toLowerCase()))
              || results[0];
            if (match) {
              result = {
                idTeam: '', strTeam: match.club_name, strTeamBadge: match.logo_url || '',
                strStadium: '', strStadiumThumb: '', intStadiumCapacity: '',
                strCountry: match.country || '', strLeague: match.competition || '', intFormedYear: '',
                strDescriptionFR: null, strDescriptionEN: null, strDescriptionES: null,
                strWebsite: null, strFacebook: null, strTwitter: null, strInstagram: null,
                strKit: null, strBanner: null, strManager: null, strKeywords: null,
                strColour1: null, strColour2: null,
              } as TeamData;
            }
          }
        } catch {}
      }

      // 5. Save to server cache (fire-and-forget)
      if (result) {
        fetch(`${API}/club-profile-cache`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: clubName, data: result }),
        }).catch(() => {});
      }

      return result;
    },
    enabled: !!clubName,
    staleTime: 10 * 60 * 1000,
  });



  const clubPlayers = players.filter(p =>
    p.club && clubName && p.club.toLowerCase().includes(clubName.toLowerCase())
  );

  // TheSportsDB squad (only when we have a team ID)
  const { data: squadPlayers = [], isLoading: squadLoading } = useQuery<SquadPlayer[]>({
    queryKey: ['club-squad', team?.idTeam],
    queryFn: () => fetchClubSquad(team!.idTeam),
    enabled: !!team?.idTeam,
    staleTime: 10 * 60 * 1000,
  });

  // Map user players by normalized name for quick lookup
  const userPlayerNames = new Set(players.map(p => p.name?.toLowerCase().trim()));
  const squadNotInList = squadPlayers.filter(s => !userPlayerNames.has(s.strPlayer?.toLowerCase().trim()));

  // ── Honours from TheSportsDB ──
  interface ClubHonour { strLeague: string; strSeason: string; strTrophy: string }
  const { data: honoursData, isLoading: honoursLoading } = useQuery<ClubHonour[]>({
    queryKey: ['club-honours', team?.idTeam],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('thesportsdb-proxy', {
        body: { endpoint: 'lookuphonours', params: `id=${team!.idTeam}` },
      });
      return (data?.honours ?? []) as ClubHonour[];
    },
    enabled: !!team?.idTeam && honoursVisible,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ── Recent events from TheSportsDB ──
  interface ClubEvent {
    idEvent: string; strEvent: string; strHomeTeam: string; strAwayTeam: string;
    intHomeScore: string | null; intAwayScore: string | null;
    dateEvent: string; strLeague: string;
    strHomeTeamBadge?: string; strAwayTeamBadge?: string;
  }
  const { data: recentEvents = [], isLoading: eventsLoading } = useQuery<ClubEvent[]>({
    queryKey: ['club-events', team?.idTeam],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('thesportsdb-proxy', {
        body: { endpoint: 'eventslast', params: `id=${team!.idTeam}` },
      });
      return (data?.results ?? []) as ClubEvent[];
    },
    enabled: !!team?.idTeam,
    staleTime: 30 * 60 * 1000,
  });

  // ── Former players + TM honours ──
  interface TmHonour { trophy: string; count: number }
  const tmId = team?._tmUrl?.match(/\/verein\/(\d+)/)?.[1] ?? null;
  const { data: clubHistory, isLoading: historyLoading } = useQuery<{ formerPlayers: FormerPlayer[]; honours: TmHonour[] } | null>({
    queryKey: ['club-history', tmId],
    queryFn: async () => {
      const resp = await fetch(`${API}/club-tm-history/${tmId}`);
      if (!resp.ok) return null;
      return resp.json();
    },
    enabled: !!tmId && historyVisible,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ── Championship standings from Transfermarkt ──
  interface StandingsRow { rank: number; clubId: string | null; club: string; badge: string | null; played: number; wins: number; draws: number; losses: number; goals: string | null; diff: string | null; points: number }
  const { data: standingsData, isLoading: standingsLoading } = useQuery<{ rows: StandingsRow[]; season: string | null; competitionId: string } | null>({
    queryKey: ['club-tm-standings', team?._tmCompetitionId, team?._tmCompetitionSlug],
    queryFn: async () => {
      const id = team!._tmCompetitionId!;
      const slug = team!._tmCompetitionSlug || id.toLowerCase();
      const res = await fetch(`${API}/club-tm-standings/${id}?slug=${encodeURIComponent(slug)}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!team?._tmCompetitionId && standingsVisible,
    staleTime: 3 * 60 * 60 * 1000,
  });

  // Find the current club's row in the standings (match by TM clubId or name prefix)
  const currentClubStanding = useMemo(() => {
    if (!standingsData?.rows) return null;
    const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const myId = tmId;
    const myName = norm(team?.strTeam ?? clubName ?? '');
    return standingsData.rows.find(r =>
      (myId && r.clubId === myId) ||
      norm(r.club).startsWith(myName.slice(0, 5)) ||
      myName.startsWith(norm(r.club).slice(0, 5))
    ) ?? null;
  }, [standingsData, tmId, team?.strTeam, clubName]);

  // ── Club staff (coach + president) from server cache (Sofascore + Wikidata) ──
  interface ClubStaff {
    coach_id: number | null; coach_name: string | null; coach_slug: string | null;
    coach_photo_url: string | null; coach_nationality: string | null;
    coach_date_born: string | null; coach_sofascore_url: string | null;
    president_name: string | null; president_photo_url: string | null;
    president_wikidata_id: string | null;
  }
  const clubLookupName = team?.strTeam ?? null;
  const { data: clubStaff, isFetching: staffLoading, refetch: refreshStaff } = useQuery<ClubStaff | null>({
    queryKey: ['club-staff', clubLookupName],
    queryFn: async () => {
      if (!clubLookupName) return null;
      const res = await fetch(`${API}/club-staff?name=${encodeURIComponent(clubLookupName)}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!clubLookupName && staffVisible,
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });

  const handleRefreshStaff = async () => {
    if (!clubLookupName) return;
    try {
      await fetch(`${API}/club-staff/refresh`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: clubLookupName }),
      });
      refreshStaff();
      toast.success('Informations du staff actualisées');
    } catch { toast.error('Erreur lors de l\'actualisation'); }
  };

  // ── Upcoming fixtures ──
  interface ClubNextEvent {
    idEvent: string; strEvent: string; strHomeTeam: string; strAwayTeam: string;
    dateEvent: string; strTime: string | null; strLeague: string;
    strHomeTeamBadge?: string; strAwayTeamBadge?: string;
  }
  const { data: nextEvents = [], isLoading: fixturesLoading } = useQuery<ClubNextEvent[]>({
    queryKey: ['club-fixtures', team?.idTeam],
    queryFn: async () => {
      if (!team?.idTeam) return [];
      const res = await fetch(`${API}/club-fixtures?teamId=${team.idTeam}`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!team?.idTeam,
    staleTime: 3 * 60 * 60 * 1000,
  });

  // ── Buzz articles mentioning this club ──
  interface BuzzPost { id: string; source_name: string; source_handle: string; source_color: string; content: string; image_url: string | null; external_url: string; buzz_score: number; published_at: string; }
  const { data: clubBuzz, isFetching: buzzFetching } = useQuery<{ posts: BuzzPost[] }>({
    queryKey: ['buzz-club', clubName],
    queryFn: async () => {
      const res = await fetch(`${API}/buzz/club?name=${encodeURIComponent(team?.strTeam || clubName)}`, { credentials: 'include' });
      if (!res.ok) return { posts: [] };
      return res.json();
    },
    enabled: !!team && buzzVisible,
    staleTime: 5 * 60 * 1000,
  });

  // ── Scouting notes — notepad par utilisateur ──
  interface ScoutingNote { id: number; content: string; rating: number | null; created_at: string; updated_at: string; user_id: string; author_name: string; }
  const { data: notesData, refetch: refetchNotes } = useQuery<{ notes: ScoutingNote[] }>({
    queryKey: ['club-notes', clubName, currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`${API}/club-notes?club=${encodeURIComponent(clubName)}`, { credentials: 'include' });
      if (!res.ok) return { notes: [] };
      return res.json();
    },
    staleTime: 0,
    enabled: !!currentUser?.id && !!clubName,
  });
  // Derive server note for current user — recalculates whenever notesData or user changes
  const myNote = useMemo(
    () => notesData?.notes?.find(n => String(n.user_id) === String(currentUser?.id)) ?? null,
    [notesData, currentUser?.id],
  );
  const teamNotes = useMemo(
    () => notesData?.notes?.filter(n => String(n.user_id) !== String(currentUser?.id)) ?? [],
    [notesData, currentUser?.id],
  );

  // Draft state: undefined = no local edit (show server value directly — no useEffect race)
  const [draftText, setDraftText] = useState<string | undefined>(undefined);
  const [draftRating, setDraftRating] = useState<number | null | undefined>(undefined);

  const noteDirty  = draftText !== undefined || draftRating !== undefined;
  const noteText   = draftText   !== undefined ? draftText   : (myNote?.content ?? '');
  const noteRating = draftRating !== undefined ? draftRating : (myNote?.rating  ?? null);

  const clearDraft = () => { setDraftText(undefined); setDraftRating(undefined); };

  const saveNote = useMutation({
    mutationFn: async ({ content, rating }: { content: string; rating: number | null }) => {
      const res = await fetch(`${API}/club-notes`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ club: clubName, content, rating, id: myNote?.id }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || 'save_failed'); }
    },
    onSuccess: async () => { await refetchNotes(); clearDraft(); toast.success('Note enregistrée'); },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });
  const deleteNote = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API}/club-notes/${id}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: async () => { await refetchNotes(); clearDraft(); },
    onError: () => toast.error('Erreur lors de la suppression'),
  });

  // ── Manual override (admin/moderator) ──
  const { data: override, refetch: refetchOverride } = useQuery<ClubOverride | null>({
    queryKey: ['club-override', clubName],
    queryFn: async () => {
      const res = await fetch(`${API}/club-override?name=${encodeURIComponent(clubName)}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideForm, setOverrideForm] = useState<ClubOverride>({});
  const [coachPhotoUploading, setCoachPhotoUploading] = useState(false);
  const saveOverride = useMutation({
    mutationFn: async (data: ClubOverride) => {
      const res = await fetch(`${API}/club-override`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, club_name: clubName }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (res.status === 401) throw new Error('session_expired');
        if (res.status === 403) throw new Error('permission_denied');
        throw new Error(body?.error || `HTTP ${res.status}`);
      }
      return body.row as ClubOverride | null;
    },
    onSuccess: (savedRow) => {
      if (savedRow) {
        queryClient.setQueryData(['club-override', clubName], savedRow);
      } else {
        refetchOverride();
      }
      queryClient.invalidateQueries({ queryKey: ['club-profile', clubName] });
      setOverrideOpen(false);
      toast.success('Informations complétées avec succès');
    },
    onError: (err: Error) => {
      if (err.message === 'session_expired') {
        toast.error('Session expirée, veuillez vous reconnecter.');
        supabase.auth.signOut();
      } else if (err.message === 'permission_denied') {
        toast.error('Accès refusé — rôle admin ou modérateur requis');
      } else {
        toast.error(`Erreur : ${err.message}`);
      }
    },
  });

  const openOverrideDialog = () => {
    setOverrideForm({
      city: override?.city || team?.strStadiumLocation || '',
      official_website: override?.official_website || team?.strWebsite || '',
      address: override?.address || '',
      phone: override?.phone || '',
      email: override?.email || '',
      founded_year: override?.founded_year || (team?.intFormedYear ? Number(team.intFormedYear) : undefined),
      stadium: override?.stadium || team?.strStadium || '',
      stadium_capacity: override?.stadium_capacity || (team?.intStadiumCapacity ? Number(team.intStadiumCapacity) : undefined),
      manager: override?.manager || team?.strManager || '',
      coach_photo_url: override?.coach_photo_url || '',
      coach_nationality: override?.coach_nationality || clubStaff?.coach_nationality || '',
      coach_date_born: override?.coach_date_born || clubStaff?.coach_date_born || '',
      description_fr: override?.description_fr || team?.strDescriptionFR || '',
      description_en: override?.description_en || team?.strDescriptionEN || '',
      league: override?.league || team?.strLeague || '',
      colour1: override?.colour1 || team?.strColour1 || '',
      colour2: override?.colour2 || team?.strColour2 || '',
      badge_url: override?.badge_url || team?.strTeamBadge || '',
      country: override?.country || '',
      division: override?.division || '',
      staff_technical: override?.staff_technical || '',
      contact_name: override?.contact_name || '',
      contact_role: override?.contact_role || '',
      contact_phone: override?.contact_phone || '',
      contact_email: override?.contact_email || '',
      current_ranking: override?.current_ranking || undefined,
      current_season: override?.current_season || '',
      stats_goals_for: override?.stats_goals_for ?? undefined,
      stats_goals_against: override?.stats_goals_against ?? undefined,
      stats_clean_sheets: override?.stats_clean_sheets ?? undefined,
      stats_wins: override?.stats_wins ?? undefined,
      stats_draws: override?.stats_draws ?? undefined,
      stats_losses: override?.stats_losses ?? undefined,
      transfer_budget: override?.transfer_budget || '',
      avg_salary: override?.avg_salary || '',
      partnership_status: override?.partnership_status || '',
      recommended_players: override?.recommended_players || '',
      scout_rating: override?.scout_rating || undefined,
    });
    setOverrideOpen(true);
  };

  // Merge override with team data for display
  const city = override?.city || team?.strStadiumLocation || null;
  const displayWebsite = override?.official_website || team?.strWebsite || null;
  const displayLeague = override?.league || team?.strLeague || '';
  const displayStadium = override?.stadium || team?.strStadium || '';
  const displayCapacity = override?.stadium_capacity ? String(override.stadium_capacity) : team?.intStadiumCapacity || '';
  const displayFounded = override?.founded_year ? String(override.founded_year) : team?.intFormedYear || '';
  const displayManager = override?.manager || team?.strManager || null;
  const displayCoachPhoto = override?.coach_photo_url || clubStaff?.coach_photo_url || null;
  const displayCoachNationality = override?.coach_nationality || clubStaff?.coach_nationality || null;
  const displayCoachDateBorn = override?.coach_date_born || clubStaff?.coach_date_born || null;
  const displayDescFR = override?.description_fr || team?.strDescriptionFR || null;
  const displayDescEN = override?.description_en || team?.strDescriptionEN || null;
  const displayDescES = team?.strDescriptionES || null;
  const displayColour1 = override?.colour1 || team?.strColour1 || null;
  const displayColour2 = override?.colour2 || team?.strColour2 || null;
  const displayBadge = override?.badge_url || team?.strTeamBadge || '';

  const description = (() => {
    if (!team) return '';
    const lang = i18n.language;
    if (lang.startsWith('fr')) return displayDescFR || displayDescEN || '';
    if (lang.startsWith('es')) return displayDescES || displayDescFR || displayDescEN || '';
    return displayDescEN || displayDescFR || '';
  })();

  // Aliases for template — keep variable names coherent with old code
  const coachName = clubStaff?.coach_name ?? displayManager ?? null;
  const presidentInfo = clubStaff?.president_name ? {
    name: clubStaff.president_name,
    photo: clubStaff.president_photo_url,
    wikidataId: clubStaff.president_wikidata_id ?? '',
  } : null;

  // Group TSDB honours by trophy name
  const groupedHonours = (honoursData ?? []).reduce<Record<string, string[]>>((acc, h) => {
    const key = h.strTrophy || h.strLeague;
    if (!key) return acc;
    if (!acc[key]) acc[key] = [];
    acc[key].push(h.strSeason);
    return acc;
  }, {});
  const sortedHonours = Object.entries(groupedHonours).sort((a, b) => b[1].length - a[1].length);

  // Redirect to search page if no club selected
  if (!clubName) return <Navigate to="/club-search" replace />;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header with back button */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={() => navigate('/club-search')}>
          <ArrowLeft className="w-5 h-5" />
        </Button>
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Building2 className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-xl font-extrabold tracking-tight truncate">
              {team?.strTeam || clubName}
            </h1>
            <button
              onClick={() => navigate('/club-search')}
              className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1 mt-0.5"
            >
              <Search className="w-3 h-3" />
              {t('club.search_other')}
            </button>
          </div>
        </div>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* No results */}
      {!isLoading && !team && (
        <div className="text-center py-20">
          <Building2 className="w-12 h-12 text-muted-foreground/20 mx-auto mb-4" />
          <p className="text-base font-semibold text-muted-foreground">{t('club.not_found')}</p>
          <p className="text-sm text-muted-foreground/60 mt-1 mb-4">{t('club.not_found_desc', { name: clubName })}</p>
          <Button variant="outline" onClick={() => navigate('/club-search')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            {t('club.back_to_search')}
          </Button>
        </div>
      )}

      {/* Club profile */}
      {team && (
        <div className="space-y-6">
          {/* Banner / Hero */}
          <Card className="overflow-hidden">
            {team.strStadiumThumb && (
              <div className="h-48 bg-muted overflow-hidden">
                <img src={team.strStadiumThumb} alt={team.strStadium} className="w-full h-full object-cover" />
              </div>
            )}
            <CardContent className={`p-6 ${team.strStadiumThumb ? '-mt-12 relative z-10' : ''}`}>
              <div className="flex items-start gap-5">
                <div className="w-20 h-20 rounded-xl bg-card border-2 border-border shadow-lg overflow-hidden shrink-0 flex items-center justify-center">
                  {displayBadge ? (
                    <img src={displayBadge} alt={team.strTeam} className="w-16 h-16 object-contain" />
                  ) : (
                    <ClubBadge club={team.strTeam} size="lg" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold">{team.strTeam}</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                    {displayLeague && (
                      <Link
                        to={`/championships?search=${encodeURIComponent(displayLeague)}`}
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                        title={t('club.see_championship')}
                      >
                        <Trophy className="w-3.5 h-3.5" />{displayLeague}
                      </Link>
                    )}
                    {override?.division && (
                      <span className="flex items-center gap-1">
                        <Trophy className="w-3.5 h-3.5 opacity-60" />{override.division}
                      </span>
                    )}
                    {team.strCountry && (
                      <Link
                        to={`/map?q=${encodeURIComponent(team.strCountry)}`}
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                        title={t('club.see_on_map')}
                      >
                        <Globe className="w-3.5 h-3.5" />{team.strCountry}
                      </Link>
                    )}
                    {city && (
                      <span className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5" />{city}
                      </span>
                    )}
                    {displayFounded && (
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{t('club.founded')} {displayFounded}</span>
                    )}
                  </div>
                  {(displayColour1 || displayColour2) && (
                    <div className="flex items-center gap-2 mt-2">
                      {displayColour1 && <div className="w-5 h-5 rounded-full border border-border" title={displayColour1} style={{ backgroundColor: displayColour1 }} />}
                      {displayColour2 && <div className="w-5 h-5 rounded-full border border-border" title={displayColour2} style={{ backgroundColor: displayColour2 }} />}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* Primary action: follow */}
                  {followedEntry ? (
                    <Button variant="outline" size="sm" onClick={() => unfollowClub.mutate(followedEntry.id)} className="gap-1.5" disabled={unfollowClub.isPending}>
                      <HeartOff className="w-4 h-4" /> {t('club.unfollow')}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => followClub.mutate({ club_name: team?.strTeam || clubName })} className="gap-1.5" disabled={followClub.isPending}>
                      <Heart className="w-4 h-4" /> {t('club.follow')}
                    </Button>
                  )}
                  {/* Website shortcut if available */}
                  {displayWebsite && (
                    <a href={/^https?:\/\//i.test(displayWebsite) ? displayWebsite : `https://${displayWebsite}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm" className="gap-1.5">
                        <Globe className="w-4 h-4" /> {t('club.website')}
                      </Button>
                    </a>
                  )}
                  {/* Secondary actions in dropdown */}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="px-2">
                        <MoreHorizontal className="w-4 h-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      {team._tmUrl && (
                        <DropdownMenuItem asChild>
                          <a href={team._tmUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                            <ExternalLink className="w-3.5 h-3.5" /> Transfermarkt
                          </a>
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem asChild>
                        <a href={`https://www.google.com/search?q=${encodeURIComponent((team.strTeam || clubName) + ' football')}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 cursor-pointer">
                          <Search className="w-3.5 h-3.5" /> {t('club.see_more')}
                        </a>
                      </DropdownMenuItem>
                      {canOverride && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={openOverrideDialog} className="flex items-center gap-2 cursor-pointer">
                            <Pencil className="w-3.5 h-3.5" /> {t('club.complete_info')}
                          </DropdownMenuItem>
                        </>
                      )}
                      {isAdmin && (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="flex items-center gap-2 cursor-pointer text-destructive focus:text-destructive"
                            onClick={async () => {
                              const name = team.strTeam || clubName;
                              if (!confirm(t('club.confirm_delete', { name }))) return;
                              try {
                                const resp = await fetch(`${API}/admin/club/${encodeURIComponent(name)}`, { method: 'DELETE', credentials: 'include' });
                                if (resp.ok) {
                                  const data = await resp.json();
                                  queryClient.invalidateQueries({ queryKey: ['club-profile'] });
                                  queryClient.invalidateQueries({ queryKey: ['club-search'] });
                                  queryClient.invalidateQueries({ queryKey: ['players'] });
                                  queryClient.invalidateQueries({ queryKey: ['followed-clubs'] });
                                  toast.success(t('club.deleted_with_count', { count: data.playersDetached || 0 }));
                                  navigate('/club-search');
                                } else {
                                  const err = await resp.json().catch(() => ({}));
                                  toast.error(err.error || t('common.error'));
                                }
                              } catch { toast.error(t('common.error')); }
                            }}
                          >
                            <Trash2 className="w-3.5 h-3.5" /> {t('club.delete_club')}
                          </DropdownMenuItem>
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-5">
            <div className="md:col-span-2 space-y-5">
              {description && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Info className="w-4 h-4 text-primary" />{t('club.about')}</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-line">
                      {description.length > 800 ? description.slice(0, 800) + '...' : description}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ── Vos joueurs ── */}
              {clubPlayers.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Users className="w-4 h-4 text-primary" />
                      {t('club.your_players')} ({clubPlayers.length})
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="space-y-1.5">
                      {clubPlayers.map(p => (
                        <Link key={p.id} to={`/player/${p.id}`} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/60 transition-colors group">
                          <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate group-hover:text-primary transition-colors">{p.name}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <FlagIcon nationality={p.nationality} size="sm" />
                              <p className="text-[11px] text-muted-foreground truncate">{p.position}{p.nationality ? ` · ${translateCountry(p.nationality, i18n.language)}` : ''}</p>
                            </div>
                          </div>
                          {p.current_level > 0 ? (
                            <Badge variant="outline" className="text-[10px] shrink-0 font-mono">{p.current_level}/10</Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px] shrink-0 font-mono text-muted-foreground">NA</Badge>
                          )}
                        </Link>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Effectif TheSportsDB ── */}
              {(squadLoading || squadNotInList.length > 0) && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Shirt className="w-4 h-4 text-primary" />
                      {t('club.squad_external')}
                      {squadNotInList.length > 0 && (
                        <span className="ml-1 text-sm font-normal text-muted-foreground">({squadNotInList.length})</span>
                      )}
                      {squadLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto shrink-0" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {squadLoading ? (
                      <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('club.loading_squad')}
                      </div>
                    ) : squadNotInList.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t('club.all_players_in_list')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {squadNotInList.map(sp => (
                          <div key={sp.idPlayer} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                            {/* Photo ou initiale */}
                            {sp.strThumb || sp.strCutout ? (
                              <img
                                src={sp.strThumb || sp.strCutout || ''}
                                alt={sp.strPlayer}
                                className="w-8 h-8 rounded-full object-cover shrink-0 bg-muted"
                                onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                            ) : (
                              <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0 text-muted-foreground">
                                {sp.strPlayer?.[0] ?? '?'}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{sp.strPlayer}</p>
                              <div className="flex items-center gap-1.5 mt-0.5">
                                {sp.strNationality && <FlagIcon nationality={sp.strNationality} size="sm" />}
                                <p className="text-[11px] text-muted-foreground truncate">
                                  {[sp.strPosition, sp.strNationality ? translateCountry(sp.strNationality, i18n.language) : null].filter(Boolean).join(' · ')}
                                </p>
                              </div>
                            </div>
                            {sp.strNumber && (
                              <span className="text-[11px] text-muted-foreground font-mono shrink-0">#{sp.strNumber}</span>
                            )}
                            <Link
                              to={`/players/add?name=${encodeURIComponent(sp.strPlayer)}&club=${encodeURIComponent(clubName)}&position=${encodeURIComponent(sp.strPosition || '')}&nationality=${encodeURIComponent(sp.strNationality || '')}`}
                              className="shrink-0 p-1 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                              title={t('club.add_to_list')}
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── Derniers résultats ── */}
              {(eventsLoading || recentEvents.length > 0) && (() => {
                const evWithScore = recentEvents.filter(ev => {
                  const isHome = ev.strHomeTeam?.toLowerCase() === team.strTeam?.toLowerCase();
                  const myScore = isHome ? ev.intHomeScore : ev.intAwayScore;
                  const oppScore = isHome ? ev.intAwayScore : ev.intHomeScore;
                  return myScore != null && oppScore != null && myScore !== '' && oppScore !== '';
                });
                const form = evWithScore.slice(-5).map(ev => {
                  const isHome = ev.strHomeTeam?.toLowerCase() === team.strTeam?.toLowerCase();
                  const myScore = Number(isHome ? ev.intHomeScore : ev.intAwayScore);
                  const oppScore = Number(isHome ? ev.intAwayScore : ev.intHomeScore);
                  return myScore > oppScore ? 'W' : myScore === oppScore ? 'D' : 'L';
                });
                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Calendar className="w-4 h-4 text-primary" />
                          {t('club.recent_results')}
                          {recentEvents.length > 0 && <span className="text-sm font-normal text-muted-foreground">({recentEvents.length})</span>}
                          {eventsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                        </CardTitle>
                        {form.length > 0 && (
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground mr-1">{t('club.form')}</span>
                            {form.map((r, i) => (
                              <span key={i} className={`w-5 h-5 rounded text-[10px] font-black flex items-center justify-center ${
                                r === 'W' ? 'bg-green-500/20 text-green-600' : r === 'D' ? 'bg-amber-500/20 text-amber-600' : 'bg-red-500/20 text-red-600'
                              }`}>{r}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-1.5">
                      {eventsLoading && recentEvents.length === 0 && (
                        <div className="flex items-center justify-center gap-2 py-4 text-xs text-muted-foreground">
                          <Search className="w-3.5 h-3.5 animate-pulse" />
                          {t('club.searching')}
                        </div>
                      )}
                      {recentEvents.slice(0, 8).map(ev => {
                        const isHome = ev.strHomeTeam?.toLowerCase() === team.strTeam?.toLowerCase();
                        const myScore = isHome ? ev.intHomeScore : ev.intAwayScore;
                        const oppScore = isHome ? ev.intAwayScore : ev.intHomeScore;
                        const opp = isHome ? ev.strAwayTeam : ev.strHomeTeam;
                        const oppBadge = isHome ? ev.strAwayTeamBadge : ev.strHomeTeamBadge;
                        const hasScore = myScore != null && oppScore != null && myScore !== '' && oppScore !== '';
                        const win = hasScore && Number(myScore) > Number(oppScore);
                        const draw = hasScore && Number(myScore) === Number(oppScore);
                        return (
                          <div key={ev.idEvent} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                            {oppBadge ? (
                              <img src={oppBadge} alt={opp} className="w-7 h-7 object-contain shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                            ) : (
                              <div className="w-7 h-7 rounded bg-muted flex items-center justify-center text-[11px] font-bold shrink-0 text-muted-foreground">{opp?.[0]}</div>
                            )}
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{isHome ? `vs ${opp}` : `@ ${opp}`}</p>
                              <p className="text-[11px] text-muted-foreground">{ev.strLeague && `${ev.strLeague} · `}{ev.dateEvent && formatDate(ev.dateEvent + 'T00:00:00', dateFormat)}</p>
                            </div>
                            {hasScore && (
                              <span className={`text-xs font-bold px-2 py-0.5 rounded-full shrink-0 ${
                                win ? 'bg-green-500/15 text-green-600' : draw ? 'bg-amber-500/15 text-amber-600' : 'bg-red-500/15 text-red-600'
                              }`}>{myScore}–{oppScore}</span>
                            )}
                          </div>
                        );
                      })}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── Prochains matchs ── */}
              {team.idTeam && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar className="w-4 h-4 text-primary" />
                      {t('club.upcoming_fixtures')}
                      {nextEvents.length > 0 && <span className="text-sm font-normal text-muted-foreground">({nextEvents.length})</span>}
                      {fixturesLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto shrink-0" />}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {nextEvents.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-3">{t('club.no_upcoming')}</p>
                    ) : (
                      <div className="space-y-1.5">
                        {nextEvents.slice(0, 6).map(ev => {
                          const isHome = ev.strHomeTeam?.toLowerCase() === team.strTeam?.toLowerCase();
                          const opp = isHome ? ev.strAwayTeam : ev.strHomeTeam;
                          const oppBadge = isHome ? ev.strAwayTeamBadge : ev.strHomeTeamBadge;
                          const dateStr = ev.dateEvent ? formatDate(ev.dateEvent + 'T00:00:00', dateFormat) : '';
                          return (
                            <div key={ev.idEvent} className="flex items-center gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors">
                              {oppBadge ? (
                                <img src={oppBadge} alt={opp} className="w-7 h-7 object-contain shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                              ) : (
                                <div className="w-7 h-7 rounded bg-muted flex items-center justify-center text-[11px] font-bold shrink-0 text-muted-foreground">{opp?.[0]}</div>
                              )}
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{isHome ? `vs ${opp}` : `@ ${opp}`}</p>
                                <p className="text-[11px] text-muted-foreground">{ev.strLeague && `${ev.strLeague} · `}{dateStr}{ev.strTime ? ` ${ev.strTime}` : ''}</p>
                              </div>
                              <Badge variant="outline" className="text-[10px] shrink-0">{isHome ? 'Dom.' : 'Ext.'}</Badge>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── Statistiques de saison (override) ── */}
              {(override?.stats_wins != null || override?.stats_goals_for != null || override?.current_ranking != null) && (() => {
                const ov = override!;
                const hasWDL = ov.stats_wins != null || ov.stats_draws != null || ov.stats_losses != null;
                const hasGoals = ov.stats_goals_for != null || ov.stats_goals_against != null || ov.stats_clean_sheets != null;
                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Trophy className="w-4 h-4 text-primary" />
                          {t('club.stats_title')}
                        </CardTitle>
                        <div className="flex items-center gap-2">
                          {ov.current_season && <Badge variant="outline" className="text-[11px]">{ov.current_season}</Badge>}
                          {ov.current_ranking != null && (
                            <span className="text-sm font-bold text-amber-600">#{ov.current_ranking}</span>
                          )}
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {hasWDL && (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-green-500/10 rounded-xl p-2.5">
                            <p className="text-xl font-black text-green-600">{ov.stats_wins ?? '—'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('club.wins')}</p>
                          </div>
                          <div className="bg-muted/60 rounded-xl p-2.5">
                            <p className="text-xl font-black">{ov.stats_draws ?? '—'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('club.draws')}</p>
                          </div>
                          <div className="bg-red-500/10 rounded-xl p-2.5">
                            <p className="text-xl font-black text-red-600">{ov.stats_losses ?? '—'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('club.losses')}</p>
                          </div>
                        </div>
                      )}
                      {hasGoals && (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div className="bg-primary/5 rounded-xl p-2.5">
                            <p className="text-xl font-black text-primary">{ov.stats_goals_for ?? '—'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('club.goals_for')}</p>
                          </div>
                          <div className="bg-muted/40 rounded-xl p-2.5">
                            <p className="text-xl font-black text-muted-foreground">{ov.stats_goals_against ?? '—'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('club.goals_against')}</p>
                          </div>
                          <div className="bg-blue-500/10 rounded-xl p-2.5">
                            <p className="text-xl font-black text-blue-600">{ov.stats_clean_sheets ?? '—'}</p>
                            <p className="text-[10px] font-medium text-muted-foreground">{t('club.clean_sheets')}</p>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── Classement dans le championnat (Transfermarkt) ── */}
              <div ref={standingsSectionRef}>
              {team?._tmCompetitionId && (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Trophy className="w-4 h-4 text-primary" />
                        {t('club.standings_title')}
                        {standingsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                        {standingsData?.season && (
                          <Badge variant="outline" className="text-[11px] font-normal">{standingsData.season}</Badge>
                        )}
                        {currentClubStanding && (
                          <span className="ml-1 text-sm font-black text-amber-600 dark:text-amber-400">
                            #{currentClubStanding.rank}
                          </span>
                        )}
                      </CardTitle>
                      <Link
                        to={`/championships?search=${encodeURIComponent(displayLeague)}`}
                        className="text-xs text-primary hover:underline flex items-center gap-1 shrink-0"
                      >
                        {t('club.see_championship')} <ExternalLink className="w-3 h-3" />
                      </Link>
                    </div>
                  </CardHeader>
                  <CardContent className="pt-0">
                    {standingsLoading ? (
                      <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground text-sm">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        {t('club.standings_loading')}
                      </div>
                    ) : !standingsData?.rows?.length ? (
                      <p className="text-sm text-muted-foreground text-center py-4">{t('club.standings_empty')}</p>
                    ) : (
                      <div className="overflow-x-auto -mx-1">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="border-b text-muted-foreground">
                              <th className="pb-1.5 text-left pl-1 w-7">#</th>
                              <th className="pb-1.5 text-left">{t('club.standings_club')}</th>
                              <th className="pb-1.5 text-center w-7">{t('club.standings_played')}</th>
                              <th className="pb-1.5 text-center w-7 hidden sm:table-cell">{t('club.standings_wins')}</th>
                              <th className="pb-1.5 text-center w-7 hidden sm:table-cell">{t('club.standings_draws')}</th>
                              <th className="pb-1.5 text-center w-7 hidden sm:table-cell">{t('club.standings_losses')}</th>
                              <th className="pb-1.5 text-center w-14 hidden sm:table-cell">{t('club.standings_goals')}</th>
                              <th className="pb-1.5 text-center w-8 hidden sm:table-cell">{t('club.standings_diff')}</th>
                              <th className="pb-1.5 text-center w-8 font-bold">{t('club.standings_pts')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {standingsData.rows.map(row => {
                              const isCurrent = row.clubId === tmId ||
                                (currentClubStanding?.rank === row.rank);
                              return (
                                <tr
                                  key={row.rank}
                                  className={`border-b last:border-0 transition-colors ${
                                    isCurrent
                                      ? 'bg-primary/8 font-semibold ring-1 ring-primary/20 rounded'
                                      : 'hover:bg-muted/30'
                                  }`}
                                >
                                  <td className={`py-1.5 pl-1 tabular-nums font-mono ${isCurrent ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                                    {row.rank}
                                  </td>
                                  <td className="py-1.5 pr-2">
                                    <div className="flex items-center gap-1.5">
                                      {row.badge && (
                                        <img src={row.badge} alt={row.club} className="w-4 h-4 object-contain shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                      )}
                                      <span className={`truncate max-w-[120px] ${isCurrent ? 'text-primary' : ''}`}>{row.club}</span>
                                    </div>
                                  </td>
                                  <td className="py-1.5 text-center tabular-nums text-muted-foreground">{row.played}</td>
                                  <td className="py-1.5 text-center tabular-nums text-green-600 hidden sm:table-cell">{row.wins}</td>
                                  <td className="py-1.5 text-center tabular-nums hidden sm:table-cell">{row.draws}</td>
                                  <td className="py-1.5 text-center tabular-nums text-red-500 hidden sm:table-cell">{row.losses}</td>
                                  <td className="py-1.5 text-center tabular-nums text-muted-foreground hidden sm:table-cell">{row.goals ?? '—'}</td>
                                  <td className={`py-1.5 text-center tabular-nums hidden sm:table-cell ${Number(row.diff) > 0 ? 'text-green-600' : Number(row.diff) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                                    {row.diff ?? '—'}
                                  </td>
                                  <td className={`py-1.5 text-center tabular-nums font-bold ${isCurrent ? 'text-primary' : ''}`}>{row.points}</td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                        <p className="text-[10px] text-muted-foreground mt-2 text-right">{t('club.standings_source')}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
              </div>

              {/* ── Palmarès (Transfermarkt prioritaire, TheSportsDB en fallback) ── */}
              <div ref={honoursSectionRef}>
              {honoursVisible && honoursLoading && !clubHistory?.honours?.length && sortedHonours.length === 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Crown className="w-4 h-4 text-amber-500" />
                      {t('club.honours')}
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto shrink-0" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <Search className="w-3.5 h-3.5 animate-pulse" />
                      {t('club.searching')}
                    </div>
                  </CardContent>
                </Card>
              )}
              {(() => {
                // Prefer TM honours (have real year data); fall back to TSDB grouped
                const tmHonours = clubHistory?.honours ?? [];
                if (tmHonours.length > 0) {
                  const totalTitles = tmHonours.reduce((s, h) => s + (h.count || 1), 0);
                  return (
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="flex items-center gap-2 text-base">
                          <Crown className="w-4 h-4 text-amber-500" />
                          {t('club.honours')}
                          <span className="text-sm font-normal text-muted-foreground ml-1">— {totalTitles} {t('club.honours_total')}</span>
                          <Badge variant="outline" className="text-[10px] ml-auto font-normal">Transfermarkt</Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0 space-y-2">
                        {tmHonours.map((h, i) => (
                          <div key={i} className="flex items-center gap-3 py-1.5 border-b last:border-0">
                            <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                              <Star className="w-3.5 h-3.5 text-amber-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold truncate">{h.trophy}</p>
                              {(h as { trophy: string; count: number; years?: number[] }).years?.length ? (
                                <p className="text-[11px] text-muted-foreground mt-0.5">
                                  {[...(h as { trophy: string; count: number; years?: number[] }).years!].sort().slice(-8).join(', ')}
                                  {((h as { trophy: string; count: number; years?: number[] }).years?.length ?? 0) > 8 ? ` +${(h as { trophy: string; count: number; years?: number[] }).years!.length - 8}` : ''}
                                </p>
                              ) : null}
                            </div>
                            <span className="shrink-0 text-xs font-black text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{h.count}×</span>
                          </div>
                        ))}
                      </CardContent>
                    </Card>
                  );
                }
                // Fallback: TheSportsDB grouped
                if (sortedHonours.length === 0) return null;
                return (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center gap-2 text-base">
                        <Crown className="w-4 h-4 text-amber-500" />
                        {t('club.honours')}
                        <span className="text-sm font-normal text-muted-foreground ml-1">— {sortedHonours.reduce((s, [, v]) => s + v.length, 0)} {t('club.honours_total')}</span>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0 space-y-3">
                      {sortedHonours.slice(0, 15).map(([trophy, seasons]) => (
                        <div key={trophy} className="flex items-start gap-3">
                          <div className="w-7 h-7 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0 mt-0.5">
                            <Star className="w-3.5 h-3.5 text-amber-500" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-sm font-semibold truncate">{trophy}</p>
                              <span className="shrink-0 text-xs font-black text-amber-600 bg-amber-500/10 px-1.5 py-0.5 rounded-full">{seasons.length}×</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground mt-0.5">
                              {[...seasons].sort().slice(-6).join(', ')}{seasons.length > 6 ? ` +${seasons.length - 6}` : ''}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })()}
              </div>{/* end honoursSectionRef */}

              {/* ── Anciens joueurs (Transfermarkt) ── */}
              <div ref={historySectionRef}>
              {historyVisible && historyLoading && !clubHistory && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <History className="w-4 h-4 text-primary" />
                      {t('club.former_players')}
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto shrink-0" />
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                      <Search className="w-3.5 h-3.5 animate-pulse" />
                      {t('club.searching')}
                    </div>
                  </CardContent>
                </Card>
              )}
              {(clubHistory?.formerPlayers?.length ?? 0) > 0 && (
                <FormerPlayersCard players={clubHistory!.formerPlayers} t={t} />
              )}
              </div>

              {/* ── Actualités buzz mentionnant le club ── */}
              <div ref={buzzSectionRef}>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Zap className="w-4 h-4 text-orange-500" />
                    {t('club.buzz_mentions')}
                    {(clubBuzz?.posts?.length ?? 0) > 0 && (
                      <span className="text-sm font-normal text-muted-foreground">({clubBuzz!.posts.length})</span>
                    )}
                    {buzzFetching && !clubBuzz && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground ml-auto shrink-0" />}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  {(clubBuzz?.posts?.length ?? 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-3">{t('club.no_buzz')}</p>
                  ) : (
                    <div className="space-y-2">
                      {clubBuzz!.posts.map(bp => (
                        <Link
                          key={bp.id}
                          to={`/buzz/article?url=${encodeURIComponent(bp.external_url)}`}
                          state={{ post: bp }}
                          className="flex items-start gap-3 p-2 rounded-xl hover:bg-muted/40 transition-colors group"
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 mt-0.5" style={{ backgroundColor: bp.source_color }}>
                            {bp.source_name.charAt(0).toUpperCase()}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-muted-foreground">{bp.source_name}</p>
                            <p className="text-sm line-clamp-2 group-hover:text-primary transition-colors">{bp.content}</p>
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
              </div>{/* end buzzSectionRef */}

              {/* ── Partenariat & joueurs recommandés (override) ── */}
              {(override?.partnership_status || override?.recommended_players) && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Star className="w-4 h-4 text-primary" />
                      {t('club.partnership')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {override.partnership_status && (
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">{override.partnership_status}</Badge>
                      </div>
                    )}
                    {override.recommended_players && (
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('club.recommended_players')}</p>
                        <p className="text-xs leading-relaxed whitespace-pre-line">{override.recommended_players}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

            </div>

            <div className="space-y-4 min-w-0">
              {/* ── Stadium + mini-map card ── */}
              {(team.strStadium || team.strStadiumThumb || team.fltLatitude) && (() => {
                const hasCoords = !!(team.fltLatitude && team.fltLongitude);
                const lat = hasCoords ? parseFloat(team.fltLatitude!) : null;
                const lng = hasCoords ? parseFloat(team.fltLongitude!) : null;
                const mapTarget = hasCoords
                  ? `/map?q=${lat!.toFixed(5)},${lng!.toFixed(5)}`
                  : `/map?q=${encodeURIComponent(team.strTeam || clubName)}`;

                return (
                  <Card className="overflow-hidden">
                    {/* Stadium photo OR OSM iframe */}
                    {team.strStadiumThumb ? (
                      <Link to={mapTarget} title={t('club.see_on_map')} className="block relative group">
                        <img
                          src={team.strStadiumThumb}
                          alt={team.strStadium || ''}
                          className="w-full h-36 object-cover"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs font-medium px-3 py-1.5 rounded-full flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5" /> {t('club.see_on_map')}
                          </span>
                        </div>
                      </Link>
                    ) : hasCoords ? (
                      <Link to={mapTarget} title={t('club.see_on_map')} className="block relative group">
                        <iframe
                          src={`https://www.openstreetmap.org/export/embed.html?bbox=${(lng! - 0.04).toFixed(5)},${(lat! - 0.025).toFixed(5)},${(lng! + 0.04).toFixed(5)},${(lat! + 0.025).toFixed(5)}&layer=mapnik&marker=${lat!.toFixed(5)},${lng!.toFixed(5)}`}
                          className="w-full h-36 pointer-events-none"
                          style={{ border: 0 }}
                          title={team.strStadium || clubName}
                        />
                        <div className="absolute inset-0 bg-transparent group-hover:bg-black/20 transition-colors flex items-end justify-end p-2">
                          <span className="opacity-0 group-hover:opacity-100 transition-opacity bg-black/70 text-white text-xs font-medium px-2 py-1 rounded-full flex items-center gap-1">
                            <MapPin className="w-3 h-3" /> {t('club.see_on_map')}
                          </span>
                        </div>
                      </Link>
                    ) : null}
                    <CardContent className="p-3">
                      {displayStadium && (
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          {displayStadium}
                        </p>
                      )}
                      {displayCapacity && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('club.capacity')} {parseInt(displayCapacity).toLocaleString()}
                        </p>
                      )}
                      {team.strStadiumLocation && (
                        <p className="text-xs text-muted-foreground mt-0.5">{team.strStadiumLocation}</p>
                      )}
                      <Link
                        to={mapTarget}
                        className="mt-2 flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        <MapPin className="w-3 h-3" /> {t('club.see_on_map')}
                      </Link>
                    </CardContent>
                  </Card>
                );
              })()}

              {/* ── Coach / Manager ── */}
              <div ref={staffSectionRef}>
              {staffVisible && staffLoading && !coachName && !presidentInfo && (
                <>
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <Shirt className="w-4 h-4 text-primary" />
                          {t('club.manager')}
                        </span>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                        <Search className="w-3.5 h-3.5 animate-pulse" />
                        {t('club.searching')}
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="mt-4">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <Crown className="w-4 h-4 text-amber-500" />
                          {t('club.president')}
                        </span>
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground">
                        <Search className="w-3.5 h-3.5 animate-pulse" />
                        {t('club.searching')}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
              {coachName && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Shirt className="w-4 h-4 text-primary" />
                        {t('club.manager')}
                        {staffLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />}
                      </span>
                      <button
                        onClick={handleRefreshStaff}
                        disabled={staffLoading}
                        title="Actualiser"
                        className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${staffLoading ? 'animate-spin' : ''}`} />
                      </button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-start gap-3">
                      {/* Photo */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
                        {displayCoachPhoto ? (
                          <img
                            src={displayCoachPhoto}
                            alt={coachName}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <UserCircle className="w-8 h-8 text-muted-foreground/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold leading-tight">{coachName}</p>
                        {displayCoachNationality && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <FlagIcon nationality={displayCoachNationality} size="sm" />
                            {translateCountry(displayCoachNationality, i18n.language)}
                          </p>
                        )}
                        {displayCoachDateBorn && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('club.born')} {formatDate(displayCoachDateBorn.split('T')[0], dateFormat)}
                          </p>
                        )}
                        <a
                          href={clubStaff?.coach_sofascore_url ?? `https://www.google.com/search?q=${encodeURIComponent(coachName + ' entraîneur football')}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {clubStaff?.coach_sofascore_url ? 'Sofascore' : t('club.search_profile')}
                        </a>
                      </div>
                    </div>
                    {override?.staff_technical && (
                      <div className="mt-3 pt-3 border-t border-border">
                        <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">{t('club.staff_technical')}</p>
                        <p className="text-xs leading-relaxed whitespace-pre-line">{override.staff_technical}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── President / Chairperson ── */}
              {presidentInfo && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Crown className="w-4 h-4 text-amber-500" />
                      {t('club.president')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0">
                    <div className="flex items-start gap-3">
                      {/* Photo */}
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-muted border border-border shrink-0 flex items-center justify-center">
                        {presidentInfo.photo ? (
                          <img
                            src={presidentInfo.photo}
                            alt={presidentInfo.name}
                            className="w-full h-full object-cover"
                            onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        ) : (
                          <Crown className="w-7 h-7 text-amber-500/40" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold leading-tight">{presidentInfo.name}</p>
                        <a
                          href={`https://www.wikidata.org/wiki/${presidentInfo.wikidataId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                        >
                          <ExternalLink className="w-3 h-3" />
                          Wikidata
                        </a>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
              </div>{/* end staffSectionRef */}

              {/* ── Contact scouting (override) — en haut de sidebar car actionnable ── */}
              {(override?.contact_name || override?.contact_email || override?.contact_phone) && (
                <Card className="border-primary/20 bg-primary/5">
                  <CardHeader className="pb-2">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <UserCircle className="w-4 h-4 text-primary" />
                      {t('club.contact_scouting')}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {override.contact_name && (
                      <p className="font-semibold text-sm">
                        {override.contact_name}
                        {override.contact_role && <span className="block text-xs font-normal text-muted-foreground">{override.contact_role}</span>}
                      </p>
                    )}
                    {override.contact_phone && (
                      <a href={`tel:${override.contact_phone}`} className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors">
                        <span className="w-4 text-center">📞</span> {override.contact_phone}
                      </a>
                    )}
                    {override.contact_email && (
                      <a href={`mailto:${override.contact_email}`} className="flex items-center gap-2 text-primary hover:underline break-all">
                        <span className="w-4 text-center">✉️</span> {override.contact_email}
                      </a>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ── Scout rating (override) ── */}
              {override?.scout_rating != null && (
                <Card>
                  <CardContent className="p-3 flex items-center gap-3">
                    <span className="text-xs font-medium text-muted-foreground shrink-0">{t('club.scout_rating')}</span>
                    <div className="flex items-center gap-0.5 flex-1">
                      {Array.from({ length: 5 }).map((_, i) => (
                        <Star key={i} className={`w-4 h-4 ${i < override.scout_rating! ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/20'}`} />
                      ))}
                    </div>
                    <span className="text-sm font-bold text-amber-600">{override.scout_rating}/5</span>
                  </CardContent>
                </Card>
              )}

              {/* ── Effectif + données financières ── */}
              {(team._tmSquadSize || team._tmAvgAge || team._tmMarketValue || override?.transfer_budget || override?.avg_salary) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-primary" />{t('club.squad_info')}</CardTitle></CardHeader>
                  <CardContent className="pt-0">
                    <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                      {team._tmSquadSize && (
                        <div><p className="text-muted-foreground mb-0.5">{t('club.squad_size')}</p><p className="font-medium">{team._tmSquadSize}</p></div>
                      )}
                      {team._tmAvgAge && (
                        <div><p className="text-muted-foreground mb-0.5">{t('club.avg_age')}</p><p className="font-medium">{team._tmAvgAge}</p></div>
                      )}
                      {team._tmMarketValue && (
                        <div className="col-span-2"><p className="text-muted-foreground mb-0.5">{t('club.market_value')}</p><p className="font-semibold text-green-600">{convertMV(team._tmMarketValue, currency, rates)}</p></div>
                      )}
                      {(override?.transfer_budget || override?.avg_salary) && (
                        <div className="col-span-2 border-t border-border/40 pt-2 grid grid-cols-2 gap-x-3 gap-y-2.5">
                          {override.transfer_budget && (
                            <div><p className="text-muted-foreground mb-0.5">{t('club.transfer_budget')}</p><p className="font-medium">{override.transfer_budget}</p></div>
                          )}
                          {override.avg_salary && (
                            <div><p className="text-muted-foreground mb-0.5">{t('club.avg_salary')}</p><p className="font-medium">{override.avg_salary}</p></div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* ── Liens & réseaux sociaux ── */}
              {(displayWebsite || team.strTwitter || team.strInstagram || team.strFacebook) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Newspaper className="w-4 h-4 text-primary" />{t('club.social')}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {displayWebsite && (
                      <a href={/^https?:\/\//i.test(displayWebsite) ? displayWebsite : `https://${displayWebsite}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors">
                        <Link2 className="w-3 h-3 shrink-0" /> {t('club.website')}
                      </a>
                    )}
                    {team.strTwitter && <a href={`https://twitter.com/${team.strTwitter}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3 shrink-0" /> Twitter / X</a>}
                    {team.strInstagram && <a href={`https://instagram.com/${team.strInstagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3 shrink-0" /> Instagram</a>}
                    {team.strFacebook && <a href={/^https?:\/\//i.test(team.strFacebook) ? team.strFacebook : `https://${team.strFacebook}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3 shrink-0" /> Facebook</a>}
                  </CardContent>
                </Card>
              )}

              {/* ── Informations / faits ── */}
              <Card>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Info className="w-4 h-4 text-primary" />{t('club.facts')}</CardTitle></CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-xs">
                    {team.strCountry && (
                      <div>
                        <p className="text-muted-foreground mb-0.5">{t('club.country')}</p>
                        <Link to={`/map?q=${encodeURIComponent(team.strCountry)}`} className="font-medium hover:text-primary transition-colors flex items-center gap-1">
                          {team.strCountry} <MapPin className="w-3 h-3 opacity-50 shrink-0" />
                        </Link>
                      </div>
                    )}
                    {city && (
                      <div>
                        <p className="text-muted-foreground mb-0.5">{t('club.city')}</p>
                        <p className="font-medium truncate">{city}</p>
                      </div>
                    )}
                    {displayLeague && (
                      <div className={!city && !team.strCountry ? 'col-span-2' : ''}>
                        <p className="text-muted-foreground mb-0.5">{t('club.league')}</p>
                        <Link to={`/championships?search=${encodeURIComponent(displayLeague)}`} className="font-medium hover:text-primary transition-colors truncate flex items-center gap-1">
                          {displayLeague}
                        </Link>
                      </div>
                    )}
                    {displayFounded && (
                      <div>
                        <p className="text-muted-foreground mb-0.5">{t('club.founded_year')}</p>
                        <p className="font-medium">{displayFounded}</p>
                      </div>
                    )}
                    {displayStadium && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground mb-0.5">{t('club.stadium')}</p>
                        <p className="font-medium truncate">{displayStadium}{displayCapacity ? ` · ${parseInt(displayCapacity).toLocaleString()}` : ''}</p>
                      </div>
                    )}
                    {override?.address && (
                      <div className="col-span-2">
                        <p className="text-muted-foreground mb-0.5">{t('club.address')}</p>
                        <p className="font-medium leading-tight">{override.address}</p>
                      </div>
                    )}
                    {override?.phone && (
                      <div>
                        <p className="text-muted-foreground mb-0.5">{t('club.phone')}</p>
                        <a href={`tel:${override.phone}`} className="font-medium hover:text-primary transition-colors">{override.phone}</a>
                      </div>
                    )}
                    {override?.email && (
                      <div className={!override?.phone ? 'col-span-2' : ''}>
                        <p className="text-muted-foreground mb-0.5">{t('club.email')}</p>
                        <a href={`mailto:${override.email}`} className="font-medium hover:text-primary transition-colors truncate block">{override.email}</a>
                      </div>
                    )}
                  </div>
                  {team.strKeywords && (
                    <div className="flex flex-wrap gap-1 mt-3 pt-2 border-t border-border/40">
                      {team.strKeywords.split(',').map((kw: string) => <Badge key={kw} variant="secondary" className="text-[9px]">{kw.trim()}</Badge>)}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* ── Notes de scouting — notepad par utilisateur ── */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <StickyNote className="w-4 h-4 text-primary" />
                      {t('club.scouting_notes')}
                    </CardTitle>
                    <div className="flex items-center gap-1.5">
                      {noteDirty && <span className="text-[10px] text-amber-600 font-medium">● Non enregistré</span>}
                      {myNote && (
                        <button
                          onClick={() => { if (confirm('Supprimer votre note ?')) deleteNote.mutate(myNote.id); }}
                          className="p-1 rounded text-muted-foreground hover:text-destructive transition-colors"
                          title={t('club.notes_delete')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0 space-y-3">
                  {/* Ma note — édition directe */}
                  <div className="space-y-2">
                    {/* Étoiles de notation */}
                    <div className="flex items-center gap-1">
                      {[1,2,3,4,5].map(star => (
                        <button
                          key={star}
                          type="button"
                          onClick={() => setDraftRating(star === noteRating ? null : star)}
                          className="p-0.5 transition-transform hover:scale-110"
                          title={`Note : ${star}/5`}
                        >
                          <Star className={`w-4 h-4 transition-colors ${star <= (noteRating ?? 0) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/25 hover:text-amber-400'}`} />
                        </button>
                      ))}
                      {noteRating && (
                        <span className="text-[11px] text-amber-600 font-medium ml-1">{noteRating}/5</span>
                      )}
                    </div>
                    <Textarea
                      placeholder={t('club.notes_placeholder')}
                      value={noteText}
                      onChange={e => setDraftText(e.target.value)}
                      className="text-xs min-h-[90px] resize-y"
                    />
                    <Button
                      size="sm" className="w-full gap-1.5 h-8 text-xs"
                      disabled={!noteText.trim() || saveNote.isPending || (!noteDirty && !!myNote)}
                      onClick={() => saveNote.mutate({ content: noteText, rating: noteRating })}
                    >
                      {saveNote.isPending
                        ? <Loader2 className="w-3 h-3 animate-spin" />
                        : myNote ? <Check className="w-3 h-3" /> : <StickyNote className="w-3 h-3" />}
                      {myNote ? t('club.notes_save') : 'Ajouter une note'}
                    </Button>
                  </div>

                  {/* Notes de l'équipe — lecture seule */}
                  {teamNotes.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-border/40">
                      <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Notes de l'équipe</p>
                      {teamNotes.map(note => (
                        <div key={note.id} className="rounded-lg bg-muted/30 p-2.5">
                          {note.rating != null && (
                            <div className="flex items-center gap-0.5 mb-1.5">
                              {[1,2,3,4,5].map(s => (
                                <Star key={s} className={`w-3 h-3 ${s <= note.rating! ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/20'}`} />
                              ))}
                            </div>
                          )}
                          <p className="text-xs leading-relaxed whitespace-pre-line">{note.content}</p>
                          <p className="text-[10px] text-muted-foreground mt-1.5">
                            {note.author_name?.trim() || '?'} · {formatDate(note.updated_at, dateFormat)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          </div>
        </div>
      )}

      {/* ── StatsBomb Tactical Analysis ── */}
      {clubName && (
        <Suspense fallback={null}>
          <LazyStatsBombTactics clubName={clubName} />
        </Suspense>
      )}

      {/* ── Override dialog ── */}
      <Dialog open={overrideOpen} onOpenChange={setOverrideOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-4 h-4 text-primary" />
              {t('club.complete_info')} — {team?.strTeam || clubName}
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto pr-1 space-y-6">

            {/* Section: Identité */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Identité</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.city')}</Label>
                  <Input value={overrideForm.city || ''} onChange={e => setOverrideForm(f => ({ ...f, city: e.target.value }))} placeholder="Paris" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.country')}</Label>
                  <Input value={overrideForm.country || ''} onChange={e => setOverrideForm(f => ({ ...f, country: e.target.value }))} placeholder="France" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.league')}</Label>
                  <Input value={overrideForm.league || ''} onChange={e => setOverrideForm(f => ({ ...f, league: e.target.value }))} placeholder="Ligue 1" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.division')}</Label>
                  <Input value={overrideForm.division || ''} onChange={e => setOverrideForm(f => ({ ...f, division: e.target.value }))} placeholder="Ligue 1 Uber Eats" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.founded_year')}</Label>
                  <Input type="number" value={overrideForm.founded_year || ''} onChange={e => setOverrideForm(f => ({ ...f, founded_year: e.target.value ? Number(e.target.value) : undefined }))} placeholder="1905" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.colour1')}</Label>
                  <div className="flex gap-2 items-center">
                    <Input type="color" value={overrideForm.colour1 || '#000000'} onChange={e => setOverrideForm(f => ({ ...f, colour1: e.target.value }))} className="h-8 w-12 p-1 cursor-pointer" />
                    <Input value={overrideForm.colour1 || ''} onChange={e => setOverrideForm(f => ({ ...f, colour1: e.target.value }))} placeholder="#FF0000" className="h-8 text-sm flex-1" />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.colour2')}</Label>
                  <div className="flex gap-2 items-center">
                    <Input type="color" value={overrideForm.colour2 || '#000000'} onChange={e => setOverrideForm(f => ({ ...f, colour2: e.target.value }))} className="h-8 w-12 p-1 cursor-pointer" />
                    <Input value={overrideForm.colour2 || ''} onChange={e => setOverrideForm(f => ({ ...f, colour2: e.target.value }))} placeholder="#0000FF" className="h-8 text-sm flex-1" />
                  </div>
                </div>
              </div>
            </div>

            {/* Section: Coordonnées */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Coordonnées</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t('club.website')}</Label>
                  <Input value={overrideForm.official_website || ''} onChange={e => setOverrideForm(f => ({ ...f, official_website: e.target.value }))} placeholder="https://www.club.com" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t('club.address')}</Label>
                  <Input value={overrideForm.address || ''} onChange={e => setOverrideForm(f => ({ ...f, address: e.target.value }))} placeholder="1 Rue du Stade, 75001 Paris" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.phone')}</Label>
                  <Input value={overrideForm.phone || ''} onChange={e => setOverrideForm(f => ({ ...f, phone: e.target.value }))} placeholder="+33 1 23 45 67 89" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.email')}</Label>
                  <Input type="email" value={overrideForm.email || ''} onChange={e => setOverrideForm(f => ({ ...f, email: e.target.value }))} placeholder="contact@club.com" className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Section: Stade */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Stade</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.stadium')}</Label>
                  <Input value={overrideForm.stadium || ''} onChange={e => setOverrideForm(f => ({ ...f, stadium: e.target.value }))} placeholder="Stade de France" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.capacity')}</Label>
                  <Input type="number" value={overrideForm.stadium_capacity || ''} onChange={e => setOverrideForm(f => ({ ...f, stadium_capacity: e.target.value ? Number(e.target.value) : undefined }))} placeholder="50000" className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Section: Staff */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Staff</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t('club.manager')}</Label>
                  <Input value={overrideForm.manager || ''} onChange={e => setOverrideForm(f => ({ ...f, manager: e.target.value }))} placeholder="Nom de l'entraîneur" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t('club.coach_photo')}</Label>
                  <div className="flex items-center gap-4">
                    {/* Photo preview — clickable to replace */}
                    <label className="relative w-16 h-16 rounded-xl overflow-hidden bg-muted border border-border flex items-center justify-center cursor-pointer shrink-0 group">
                      {overrideForm.coach_photo_url ? (
                        <img src={overrideForm.coach_photo_url} alt="coach" className="w-full h-full object-cover" />
                      ) : (
                        <UserCircle className="w-8 h-8 text-muted-foreground" />
                      )}
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {coachPhotoUploading ? (
                          <Loader2 className="w-4 h-4 text-white animate-spin" />
                        ) : (
                          <Camera className="w-4 h-4 text-white" />
                        )}
                      </div>
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        setCoachPhotoUploading(true);
                        try {
                          const fd = new FormData();
                          fd.append('photo', file);
                          const res = await fetch(`${API}/upload-image`, { method: 'POST', credentials: 'include', body: fd });
                          if (!res.ok) throw new Error('Upload échoué');
                          const { photo_url } = await res.json();
                          setOverrideForm(f => ({ ...f, coach_photo_url: photo_url }));
                        } catch {
                          toast.error('Erreur lors de l\'envoi de la photo');
                        } finally {
                          setCoachPhotoUploading(false);
                        }
                      }} />
                    </label>
                    <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
                      <span>{overrideForm.coach_photo_url ? t('club.photo_replace_hint') : t('club.photo_upload_hint')}</span>
                      {overrideForm.coach_photo_url && (
                        <button type="button" onClick={() => setOverrideForm(f => ({ ...f, coach_photo_url: '' }))} className="flex items-center gap-1 text-destructive hover:underline w-fit">
                          <XIcon className="w-3 h-3" />{t('club.photo_remove')}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.coach_nationality')}</Label>
                  <Input value={overrideForm.coach_nationality || ''} onChange={e => setOverrideForm(f => ({ ...f, coach_nationality: e.target.value }))} placeholder="France" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.coach_dob')}</Label>
                  <DateInput value={overrideForm.coach_date_born || ''} onChange={v => setOverrideForm(f => ({ ...f, coach_date_born: v }))} className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t('club.staff_technical')}</Label>
                  <Textarea value={overrideForm.staff_technical || ''} onChange={e => setOverrideForm(f => ({ ...f, staff_technical: e.target.value }))} placeholder="Adjoint : ..., Préparateur physique : ..." className="text-sm min-h-[70px] resize-none" />
                </div>
              </div>
            </div>

            {/* Section: Contact scouting */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('club.contact_scouting')}</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.contact_name')}</Label>
                  <Input value={overrideForm.contact_name || ''} onChange={e => setOverrideForm(f => ({ ...f, contact_name: e.target.value }))} placeholder="Jean Dupont" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.contact_role')}</Label>
                  <Input value={overrideForm.contact_role || ''} onChange={e => setOverrideForm(f => ({ ...f, contact_role: e.target.value }))} placeholder="Directeur sportif" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.phone')}</Label>
                  <Input value={overrideForm.contact_phone || ''} onChange={e => setOverrideForm(f => ({ ...f, contact_phone: e.target.value }))} placeholder="+33 6 12 34 56 78" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.email')}</Label>
                  <Input type="email" value={overrideForm.contact_email || ''} onChange={e => setOverrideForm(f => ({ ...f, contact_email: e.target.value }))} placeholder="scout@club.com" className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Section: Statistiques */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('club.stats_title')}</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.season')}</Label>
                  <Input value={overrideForm.current_season || ''} onChange={e => setOverrideForm(f => ({ ...f, current_season: e.target.value }))} placeholder="2024-25" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.ranking')}</Label>
                  <Input type="number" value={overrideForm.current_ranking ?? ''} onChange={e => setOverrideForm(f => ({ ...f, current_ranking: e.target.value ? Number(e.target.value) : undefined }))} placeholder="3" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.wins')}</Label>
                  <Input type="number" value={overrideForm.stats_wins ?? ''} onChange={e => setOverrideForm(f => ({ ...f, stats_wins: e.target.value !== '' ? Number(e.target.value) : undefined }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.draws')}</Label>
                  <Input type="number" value={overrideForm.stats_draws ?? ''} onChange={e => setOverrideForm(f => ({ ...f, stats_draws: e.target.value !== '' ? Number(e.target.value) : undefined }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.losses')}</Label>
                  <Input type="number" value={overrideForm.stats_losses ?? ''} onChange={e => setOverrideForm(f => ({ ...f, stats_losses: e.target.value !== '' ? Number(e.target.value) : undefined }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.goals_for')}</Label>
                  <Input type="number" value={overrideForm.stats_goals_for ?? ''} onChange={e => setOverrideForm(f => ({ ...f, stats_goals_for: e.target.value !== '' ? Number(e.target.value) : undefined }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.goals_against')}</Label>
                  <Input type="number" value={overrideForm.stats_goals_against ?? ''} onChange={e => setOverrideForm(f => ({ ...f, stats_goals_against: e.target.value !== '' ? Number(e.target.value) : undefined }))} placeholder="0" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.clean_sheets')}</Label>
                  <Input type="number" value={overrideForm.stats_clean_sheets ?? ''} onChange={e => setOverrideForm(f => ({ ...f, stats_clean_sheets: e.target.value !== '' ? Number(e.target.value) : undefined }))} placeholder="0" className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Section: Financier */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">{t('club.financial')}</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.transfer_budget')}</Label>
                  <Input value={overrideForm.transfer_budget || ''} onChange={e => setOverrideForm(f => ({ ...f, transfer_budget: e.target.value }))} placeholder="€15M" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.avg_salary')}</Label>
                  <Input value={overrideForm.avg_salary || ''} onChange={e => setOverrideForm(f => ({ ...f, avg_salary: e.target.value }))} placeholder="€25k/mois" className="h-8 text-sm" />
                </div>
              </div>
            </div>

            {/* Section: Scouting */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Scouting</p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.partnership_status')}</Label>
                  <Input value={overrideForm.partnership_status || ''} onChange={e => setOverrideForm(f => ({ ...f, partnership_status: e.target.value }))} placeholder="Partenariat actif" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.scout_rating')} (1-5)</Label>
                  <Input type="number" min={1} max={5} value={overrideForm.scout_rating ?? ''} onChange={e => setOverrideForm(f => ({ ...f, scout_rating: e.target.value ? Number(e.target.value) : undefined }))} placeholder="1-5" className="h-8 text-sm" />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">{t('club.recommended_players')}</Label>
                  <Textarea value={overrideForm.recommended_players || ''} onChange={e => setOverrideForm(f => ({ ...f, recommended_players: e.target.value }))} placeholder="Joueurs à suivre…" className="text-sm min-h-[70px] resize-none" />
                </div>
              </div>
            </div>

            {/* Section: Description */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Description</p>
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.description_fr')}</Label>
                  <Textarea value={overrideForm.description_fr || ''} onChange={e => setOverrideForm(f => ({ ...f, description_fr: e.target.value }))} placeholder="Description en français…" className="text-sm min-h-[80px] resize-none" />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">{t('club.description_en')}</Label>
                  <Textarea value={overrideForm.description_en || ''} onChange={e => setOverrideForm(f => ({ ...f, description_en: e.target.value }))} placeholder="Description in English…" className="text-sm min-h-[80px] resize-none" />
                </div>
              </div>
            </div>

          </div>
          <DialogFooter className="mt-4 gap-2">
            <Button variant="outline" onClick={() => setOverrideOpen(false)} disabled={saveOverride.isPending}>{t('club.notes_cancel')}</Button>
            <Button onClick={() => saveOverride.mutate(overrideForm)} disabled={saveOverride.isPending} className="gap-1.5">
              {saveOverride.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              {t('club.notes_save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
