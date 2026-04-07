import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { usePlayers } from '@/hooks/use-players';
import { useFollowedClubs, useFollowClub, useUnfollowClub } from '@/hooks/use-followed-clubs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ClubBadge } from '@/components/ui/club-badge';
import { translateCountry } from '@/types/player';
import { resolveClubName } from '@/lib/thesportsdb';
import {
  Search, Loader2, MapPin, Calendar, Users, Trophy, Building2, Globe,
  ExternalLink, Shirt, Info, Newspaper, Heart, HeartOff, Database,
} from 'lucide-react';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

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
  // TM-enriched fields (added by our fallback)
  _tmUrl?: string | null;
  _tmSquadSize?: number | null;
  _tmAvgAge?: string | null;
  _tmMarketValue?: string | null;
}

// ── Autocomplete suggestions from local DB ──────────────────────────────────

interface ClubSuggestion {
  club_name: string;
  logo_url: string | null;
  competition: string;
  country: string;
}

function useClubSuggestions(query: string) {
  return useQuery<ClubSuggestion[]>({
    queryKey: ['club-search', query],
    queryFn: async () => {
      if (query.length < 2) return [];
      const resp = await fetch(`${API}/club-search?q=${encodeURIComponent(query)}`);
      if (!resp.ok) return [];
      return resp.json();
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

export default function ClubProfile() {
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [search, setSearch] = useState(searchParams.get('q') || '');
  const clubName = searchParams.get('club') || '';
  const { data: players = [] } = usePlayers();
  const { data: followedClubs = [] } = useFollowedClubs();
  const followClub = useFollowClub();
  const unfollowClub = useUnfollowClub();
  const followedEntry = followedClubs.find(c => c.club_name.toLowerCase() === clubName.toLowerCase());

  // Autocomplete
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { data: suggestions = [] } = useClubSuggestions(search);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Resolve common abbreviations
  const resolvedClub = clubName ? resolveClubName(clubName) : '';

  // Helper: convert TM profile to TeamData shape
  const tmToTeam = (p: any): TeamData => ({
    idTeam: p.clubId, strTeam: p.clubName, strTeamBadge: p.badge || '',
    strStadium: p.stadium || '', strStadiumThumb: '', intStadiumCapacity: '',
    strCountry: p.country || '', strLeague: p.league || '', intFormedYear: '',
    strDescriptionFR: null, strDescriptionEN: null, strDescriptionES: null,
    strWebsite: null, strFacebook: null, strTwitter: null, strInstagram: null,
    strKit: null, strBanner: null, strManager: null, strKeywords: null,
    strColour1: null, strColour2: null,
    _tmUrl: p.tmUrl, _tmSquadSize: p.squadSize, _tmAvgAge: p.avgAge, _tmMarketValue: p.marketValue,
  });

  // ── Fetch club data: TheSportsDB → Transfermarkt fallback ──
  const { data: team, isLoading } = useQuery<TeamData | null>({
    queryKey: ['club-profile', clubName],
    queryFn: async () => {
      if (!clubName) return null;

      const searchTerms = [resolvedClub];
      if (resolvedClub !== clubName) searchTerms.push(clubName);

      // 1. Try TheSportsDB (fast, rich data)
      for (const term of searchTerms) {
        try {
          const { data } = await supabase.functions.invoke('thesportsdb-proxy', {
            body: { endpoint: 'searchteams', params: { t: term } },
          });
          const soccer = (data?.teams || []).filter((t: any) => t.strSport === 'Soccer' || t.strSport === 'Football');
          if (soccer.length > 0) return soccer[0] as TeamData;
        } catch {}
      }

      // 2. Fallback: Transfermarkt search → scrape profile
      for (const term of searchTerms) {
        try {
          const resp = await fetch(`${API}/club-tm-search?q=${encodeURIComponent(term)}`);
          if (!resp.ok) continue;
          const profile = await resp.json();
          if (profile?.clubName) return tmToTeam(profile);
        } catch {}
      }

      return null;
    },
    enabled: !!clubName,
    staleTime: 10 * 60 * 1000,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setShowSuggestions(false);
    setSearchParams({ club: search.trim() });
  };

  const handleClubClick = (club: string) => {
    setSearch(club);
    setShowSuggestions(false);
    setSearchParams({ club });
  };

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

  const userClubs = [...new Set(players.map(p => p.club).filter(Boolean))].sort();

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Building2 className="w-6 h-6 text-primary" />
          {t('club.title')}
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('club.subtitle')}</p>
      </div>

      {/* Search with autocomplete */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="flex gap-2">
            <div className="flex-1 relative" ref={suggestionsRef}>
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
                onFocus={() => setShowSuggestions(true)}
                placeholder={t('club.search_placeholder')}
                className="pl-10"
                autoComplete="off"
              />
              {/* Autocomplete dropdown */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute z-50 top-full left-0 right-0 mt-1 rounded-xl border bg-popover shadow-lg max-h-64 overflow-y-auto">
                  <div className="p-1.5">
                    <p className="px-2.5 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Database className="w-3 h-3" />
                      {t('club.from_database')}
                    </p>
                    {suggestions.map(s => (
                      <button
                        key={s.club_name}
                        type="button"
                        onClick={() => handleClubClick(s.club_name)}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-left hover:bg-muted transition-colors"
                      >
                        {s.logo_url ? (
                          <img src={s.logo_url} alt="" className="w-6 h-6 object-contain shrink-0" />
                        ) : (
                          <ClubBadge club={s.club_name} size="xs" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{s.club_name}</p>
                          {(s.competition || s.country) && (
                            <p className="text-[10px] text-muted-foreground truncate">
                              {[s.competition, s.country].filter(Boolean).join(' · ')}
                            </p>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <Button type="submit" disabled={isLoading || !search.trim()}>
              {isLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Search className="w-4 h-4 mr-2" />}
              {t('club.search_btn')}
            </Button>
          </form>

          {/* Quick access: user's clubs */}
          {!clubName && userClubs.length > 0 && (
            <div className="mt-4 pt-3 border-t border-border">
              <p className="text-xs font-medium text-muted-foreground mb-2">{t('club.your_clubs')}</p>
              <div className="flex flex-wrap gap-1.5">
                {userClubs.slice(0, 20).map(club => (
                  <button
                    key={club}
                    onClick={() => handleClubClick(club)}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs bg-muted hover:bg-accent transition-colors"
                  >
                    <ClubBadge club={club} size="xs" />
                    {club}
                  </button>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {/* No results */}
      {clubName && !isLoading && !team && (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{t('club.not_found')}</p>
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
                      <span className="flex items-center gap-1"><Trophy className="w-3.5 h-3.5" />{team.strLeague}</span>
                    )}
                    {team.strCountry && (
                      <span className="flex items-center gap-1"><Globe className="w-3.5 h-3.5" />{team.strCountry}</span>
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
                  {(team as any)._tmUrl && (
                    <a href={(team as any)._tmUrl} target="_blank" rel="noopener noreferrer">
                      <Button variant="outline" size="sm"><ExternalLink className="w-4 h-4 mr-1" /> Transfermarkt</Button>
                    </a>
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

              {clubPlayers.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Users className="w-4 h-4 text-primary" />{t('club.your_players')} ({clubPlayers.length})</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {clubPlayers.slice(0, 10).map(p => (
                        <Link key={p.id} to={`/player/${p.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted transition-colors">
                          <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold shrink-0">{p.name?.[0]}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{p.name}</p>
                            <p className="text-[10px] text-muted-foreground">{p.position} · {translateCountry(p.nationality, i18n.language)}</p>
                          </div>
                          <Badge variant="outline" className="text-[10px] shrink-0">{p.current_level}/10</Badge>
                        </Link>
                      ))}
                      {clubPlayers.length > 10 && (
                        <p className="text-xs text-muted-foreground text-center pt-2">+{clubPlayers.length - 10} {t('club.more_players')}</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <div className="space-y-4">
              {team.strStadium && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><MapPin className="w-4 h-4 text-primary" />{t('club.stadium')}</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm font-medium">{team.strStadium}</p>
                    {team.intStadiumCapacity && <p className="text-xs text-muted-foreground mt-1">{t('club.capacity')} {parseInt(team.intStadiumCapacity).toLocaleString()}</p>}
                  </CardContent>
                </Card>
              )}

              {team.strManager && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Shirt className="w-4 h-4 text-primary" />{t('club.manager')}</CardTitle></CardHeader>
                  <CardContent><p className="text-sm font-medium">{team.strManager}</p></CardContent>
                </Card>
              )}

              {/* TM stats (if from Transfermarkt) */}
              {((team as any)._tmSquadSize || (team as any)._tmAvgAge || (team as any)._tmMarketValue) && (
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="flex items-center gap-2 text-sm"><Users className="w-4 h-4 text-primary" />{t('club.squad_info')}</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-xs">
                    {(team as any)._tmSquadSize && (
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('club.squad_size')}</span><span className="font-medium">{(team as any)._tmSquadSize}</span></div>
                    )}
                    {(team as any)._tmAvgAge && (
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('club.avg_age')}</span><span className="font-medium">{(team as any)._tmAvgAge}</span></div>
                    )}
                    {(team as any)._tmMarketValue && (
                      <div className="flex justify-between"><span className="text-muted-foreground">{t('club.market_value')}</span><span className="font-medium">{(team as any)._tmMarketValue}</span></div>
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
                  {team.strCountry && <div className="flex justify-between"><span className="text-muted-foreground">{t('club.country')}</span><span className="font-medium">{team.strCountry}</span></div>}
                  {team.strLeague && <div className="flex justify-between"><span className="text-muted-foreground">{t('club.league')}</span><span className="font-medium">{team.strLeague}</span></div>}
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

      {!clubName && !isLoading && (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('club.empty_title')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('club.empty_desc')}</p>
        </div>
      )}
    </div>
  );
}
