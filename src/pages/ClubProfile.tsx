import { useSearchParams, Link, Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlayers } from '@/hooks/use-players';
import { useIsAdmin } from '@/hooks/use-admin';
import { useFollowedClubs, useFollowClub, useUnfollowClub } from '@/hooks/use-followed-clubs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ClubBadge } from '@/components/ui/club-badge';
import { translateCountry } from '@/types/player';
import { resolveClubName, getClubSearchAliases, fetchClubSquad, type SquadPlayer } from '@/lib/thesportsdb';
import { PlayerAvatar } from '@/components/ui/player-avatar';
import { FlagIcon } from '@/components/ui/flag-icon';
import {
  Loader2, MapPin, Calendar, Users, Trophy, Building2, Globe,
  ExternalLink, Shirt, Info, Newspaper, Heart, HeartOff, Trash2, Plus, ArrowLeft, Search,
  History, Star, ChevronDown, ChevronUp, Crown, UserCircle, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

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
}

export default function ClubProfile() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const clubName = searchParams.get('club') || '';
  const { data: players = [] } = usePlayers();
  const { data: followedClubs = [] } = useFollowedClubs();
  const followClub = useFollowClub();
  const unfollowClub = useUnfollowClub();
  const { data: isAdmin } = useIsAdmin();
  const queryClient = useQueryClient();
  const followedEntry = followedClubs.find(c => c.club_name.toLowerCase() === clubName.toLowerCase());

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

  // ── Fetch club data: Transfermarkt first, TheSportsDB to enrich ──
  const { data: team, isLoading } = useQuery<TeamData | null>({
    queryKey: ['club-profile', clubName],
    queryFn: async () => {
      if (!clubName) return null;

      const searchTerms = buildSearchTerms(clubName);
      const canonical = resolveClubName(clubName);

      // 1. Try Transfermarkt first (most reliable for exact club identity)
      let tmTeam: TeamData | null = null;
      for (const term of searchTerms) {
        try {
          const resp = await fetch(`${API}/club-tm-search?q=${encodeURIComponent(term)}`);
          if (!resp.ok) continue;
          const profile = await resp.json();
          if (profile?.clubName) { tmTeam = tmToTeam(profile); break; }
        } catch {}
      }

      // 2. Try TheSportsDB (richer data: description, stadium photo, etc.)
      for (const term of searchTerms) {
        try {
          const { data } = await supabase.functions.invoke('thesportsdb-proxy', {
            body: { endpoint: 'searchteams', params: { t: term } },
          });
          const teams = (data?.teams || []) as Record<string, unknown>[];
          const soccer = teams.filter((t) => t.strSport === 'Soccer' || t.strSport === 'Football');
          if (soccer.length === 0) continue;

          // Pick the best match by name similarity instead of blindly taking the first
          const scored = soccer.map((t) => ({
            team: t,
            score: Math.max(nameMatchScore(String(t.strTeam ?? ''), canonical), nameMatchScore(String(t.strTeam ?? ''), clubName)),
          })).sort((a, b) => b.score - a.score);

          if (scored[0]?.score >= 40) {
            const best = scored[0].team as TeamData;
            // Merge TM data into TheSportsDB result if available
            if (tmTeam) {
              best._tmUrl = tmTeam._tmUrl;
              best._tmSquadSize = tmTeam._tmSquadSize;
              best._tmAvgAge = tmTeam._tmAvgAge;
              best._tmMarketValue = tmTeam._tmMarketValue;
              if (!best.strTeamBadge && tmTeam.strTeamBadge) best.strTeamBadge = tmTeam.strTeamBadge;
            }
            return best;
          }
        } catch {}
      }

      // 3. Return TM-only result if TheSportsDB had no good match
      if (tmTeam) return tmTeam;

      // 3. Last fallback: build from internal DB (club_directory + club_logos)
      try {
        const resp = await fetch(`${API}/club-search?q=${encodeURIComponent(clubName)}`);
        if (resp.ok) {
          const results: { club_name: string; logo_url?: string; competition?: string; country?: string }[] = await resp.json();
          const match = results.find(r => r.club_name.toLowerCase() === clubName.toLowerCase())
            || results.find(r => r.club_name.toLowerCase().includes(clubName.toLowerCase()))
            || results[0];
          if (match) {
            return {
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

      return null;
    },
    enabled: !!clubName,
    staleTime: 10 * 60 * 1000,
  });



  const description = (() => {
    if (!team) return '';
    const lang = i18n.language;
    if (lang.startsWith('fr') && team.strDescriptionFR) return team.strDescriptionFR;
    if (lang.startsWith('es') && team.strDescriptionES) return team.strDescriptionES;
    return team.strDescriptionEN || team.strDescriptionFR || '';
  })();

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
  const { data: honoursData } = useQuery<ClubHonour[]>({
    queryKey: ['club-honours', team?.idTeam],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('thesportsdb-proxy', {
        body: { endpoint: 'lookuphonours', params: `id=${team!.idTeam}` },
      });
      return (data?.honours ?? []) as ClubHonour[];
    },
    enabled: !!team?.idTeam,
    staleTime: 24 * 60 * 60 * 1000,
  });

  // ── Recent events from TheSportsDB ──
  interface ClubEvent {
    idEvent: string; strEvent: string; strHomeTeam: string; strAwayTeam: string;
    intHomeScore: string | null; intAwayScore: string | null;
    dateEvent: string; strLeague: string;
    strHomeTeamBadge?: string; strAwayTeamBadge?: string;
  }
  const { data: recentEvents = [] } = useQuery<ClubEvent[]>({
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
  const { data: clubHistory } = useQuery<{ formerPlayers: FormerPlayer[]; honours: TmHonour[] } | null>({
    queryKey: ['club-history', tmId],
    queryFn: async () => {
      const resp = await fetch(`${API}/club-tm-history/${tmId}`);
      if (!resp.ok) return null;
      return resp.json();
    },
    enabled: !!tmId,
    staleTime: 24 * 60 * 60 * 1000,
  });

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
    enabled: !!clubLookupName,
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

  // Aliases for template — keep variable names coherent with old code
  const coachName = clubStaff?.coach_name ?? team?.strManager ?? null;
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
                  {team.strTeamBadge ? (
                    <img src={team.strTeamBadge} alt={team.strTeam} className="w-16 h-16 object-contain" />
                  ) : (
                    <ClubBadge club={team.strTeam} size="lg" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-2xl font-bold">{team.strTeam}</h2>
                  <div className="flex flex-wrap items-center gap-3 mt-1 text-sm text-muted-foreground">
                    {team.strLeague && (
                      <Link
                        to={`/championships?search=${encodeURIComponent(team.strLeague)}`}
                        className="flex items-center gap-1 hover:text-primary transition-colors"
                        title={t('club.see_championship')}
                      >
                        <Trophy className="w-3.5 h-3.5" />{team.strLeague}
                      </Link>
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
                    {team.intFormedYear && (
                      <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{t('club.founded')} {team.intFormedYear}</span>
                    )}
                  </div>
                  {(team.strColour1 || team.strColour2) && (
                    <div className="flex items-center gap-2 mt-2">
                      {team.strColour1 && <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: team.strColour1 }} />}
                      {team.strColour2 && <div className="w-5 h-5 rounded-full border border-border" style={{ backgroundColor: team.strColour2 }} />}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0 flex-wrap">
                  {followedEntry ? (
                    <Button variant="outline" size="sm" onClick={() => unfollowClub.mutate(followedEntry.id)}>
                      <HeartOff className="w-4 h-4 mr-1" /> {t('club.unfollow')}
                    </Button>
                  ) : (
                    <Button size="sm" onClick={() => followClub.mutate({ club_name: team.strTeam || clubName })}>
                      <Heart className="w-4 h-4 mr-1" /> {t('club.follow')}
                    </Button>
                  )}
                  {team.strWebsite && (
                    <a href={`https://${team.strWebsite}`} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm"><Globe className="w-4 h-4 mr-1" /> {t('club.website')}</Button>
                    </a>
                  )}
                  {team._tmUrl && (
                    <a href={team._tmUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1" /> Transfermarkt</Button>
                    </a>
                  )}
                  <a
                    href={`https://www.google.com/search?q=${encodeURIComponent((team.strTeam || clubName) + ' football')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    <Button variant="outline" size="sm">
                      <Search className="w-4 h-4 mr-1" /> {t('club.see_more')}
                    </Button>
                  </a>
                  {isAdmin && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-destructive hover:bg-destructive/10"
                      onClick={async () => {
                        const name = team.strTeam || clubName;
                        if (!confirm(t('club.confirm_delete', { name }))) return;
                        try {
                          const resp = await fetch(`${API}/admin/club/${encodeURIComponent(name)}`, {
                            method: 'DELETE',
                            credentials: 'include',
                          });
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
                      <Trash2 className="w-4 h-4 mr-1" /> {t('club.delete_club')}
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="md:col-span-2 space-y-6">
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
                          <Badge variant="outline" className="text-[10px] shrink-0 font-mono">{p.current_level}/10</Badge>
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
              {recentEvents.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Calendar className="w-4 h-4 text-primary" />
                      {t('club.recent_results')}
                      <span className="text-sm font-normal text-muted-foreground">({recentEvents.length})</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-0 space-y-1.5">
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
                            <p className="text-[11px] text-muted-foreground">{ev.strLeague && `${ev.strLeague} · `}{ev.dateEvent && new Date(ev.dateEvent + 'T00:00:00').toLocaleDateString()}</p>
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
              )}

              {/* ── Palmarès (TheSportsDB) ── */}
              {sortedHonours.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-base">
                      <Trophy className="w-4 h-4 text-amber-500" />
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
              )}

              {/* ── Anciens joueurs (Transfermarkt) ── */}
              {(clubHistory?.formerPlayers?.length ?? 0) > 0 && (
                <FormerPlayersCard players={clubHistory!.formerPlayers} t={t} />
              )}

            </div>

            <div className="space-y-4">
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
                      {team.strStadium && (
                        <p className="text-sm font-semibold flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
                          {team.strStadium}
                        </p>
                      )}
                      {team.intStadiumCapacity && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('club.capacity')} {parseInt(team.intStadiumCapacity).toLocaleString()}
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
              {coachName && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center justify-between gap-2 text-sm">
                      <span className="flex items-center gap-2">
                        <Shirt className="w-4 h-4 text-primary" />
                        {t('club.manager')}
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
                        {clubStaff?.coach_photo_url ? (
                          <img
                            src={clubStaff.coach_photo_url}
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
                        {clubStaff?.coach_nationality && (
                          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                            <FlagIcon nationality={clubStaff.coach_nationality} size="sm" />
                            {translateCountry(clubStaff.coach_nationality, i18n.language)}
                          </p>
                        )}
                        {clubStaff?.coach_date_born && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {t('club.born')} {new Date(clubStaff.coach_date_born + 'T00:00:00').toLocaleDateString()}
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

              {/* TM stats (if from Transfermarkt) */}
              {(team._tmSquadSize || team._tmAvgAge || team._tmMarketValue) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-primary" />{t('club.squad_info')}</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {team._tmSquadSize && (
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('club.squad_size')}</span><span className="font-medium">{team._tmSquadSize}</span></div>
                    )}
                    {team._tmAvgAge && (
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('club.avg_age')}</span><span className="font-medium">{team._tmAvgAge}</span></div>
                    )}
                    {team._tmMarketValue && (
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('club.market_value')}</span><span className="font-medium">{team._tmMarketValue}</span></div>
                    )}
                  </CardContent>
                </Card>
              )}

              {(team.strTwitter || team.strInstagram || team.strFacebook) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Newspaper className="w-4 h-4 text-primary" />{t('club.social')}</CardTitle></CardHeader>
                  <CardContent className="space-y-2">
                    {team.strTwitter && <a href={`https://twitter.com/${team.strTwitter}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" /> Twitter / X</a>}
                    {team.strInstagram && <a href={`https://instagram.com/${team.strInstagram}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" /> Instagram</a>}
                    {team.strFacebook && <a href={`https://${team.strFacebook}`} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"><ExternalLink className="w-3 h-3" /> Facebook</a>}
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Info className="w-4 h-4 text-primary" />{t('club.facts')}</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-xs">
                  {team.strCountry && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t('club.country')}</span>
                      <Link to={`/map?q=${encodeURIComponent(team.strCountry)}`} className="font-medium hover:text-primary transition-colors flex items-center gap-1">
                        {team.strCountry} <MapPin className="w-3 h-3 opacity-50" />
                      </Link>
                    </div>
                  )}
                  {team.strLeague && (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">{t('club.league')}</span>
                      <Link to={`/championships?search=${encodeURIComponent(team.strLeague)}`} className="font-medium hover:text-primary transition-colors flex items-center gap-1">
                        {team.strLeague} <Trophy className="w-3 h-3 opacity-50" />
                      </Link>
                    </div>
                  )}
                  {team.intFormedYear && <div className="flex justify-between"><span className="text-muted-foreground">{t('club.founded_year')}</span><span className="font-medium">{team.intFormedYear}</span></div>}
                  {team.strKeywords && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {team.strKeywords.split(',').map((kw: string) => <Badge key={kw} variant="secondary" className="text-[9px]">{kw.trim()}</Badge>)}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
