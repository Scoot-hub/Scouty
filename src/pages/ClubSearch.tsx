import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { usePlayers } from '@/hooks/use-players';
import { useFollowedClubs, useUnfollowClub } from '@/hooks/use-followed-clubs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ClubBadge } from '@/components/ui/club-badge';
import { Search, Building2, Heart, HeartOff, Database, Users, ArrowRight, X } from 'lucide-react';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

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
      const local: ClubSuggestion[] = resp.ok ? await resp.json() : [];
      if (query.length >= 3) {
        try {
          const tmResp = await fetch(`${API}/club-tm-search?q=${encodeURIComponent(query)}`);
          const tm = tmResp.ok ? await tmResp.json() : null;
          if (tm?.clubName) {
            const alreadyHas = local.some(l => l.club_name.toLowerCase() === tm.clubName.toLowerCase());
            if (!alreadyHas) local.push({ club_name: tm.clubName, logo_url: tm.badge || null, competition: tm.league || '', country: tm.country || '' });
          }
        } catch {}
      }
      return local;
    },
    enabled: query.length >= 2,
    staleTime: 60_000,
  });
}

export default function ClubSearch() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: players = [] } = usePlayers();
  const { data: followedClubs = [] } = useFollowedClubs();
  const unfollowClub = useUnfollowClub();

  const [search, setSearch] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const { data: suggestions = [] } = useClubSuggestions(search);
  const suggestionsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const goToClub = (name: string) => {
    navigate(`/club?club=${encodeURIComponent(name)}`);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!search.trim()) return;
    setShowSuggestions(false);
    goToClub(search.trim());
  };

  const userClubs = [...new Set(players.map(p => p.club).filter(Boolean))].sort();

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Building2 className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('club.search_title')}</h1>
          <p className="text-sm text-muted-foreground">{t('club.search_subtitle')}</p>
        </div>
      </div>

      {/* Search bar */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSubmit}>
            <div className="flex gap-2">
              <div className="flex-1 relative" ref={suggestionsRef}>
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                <Input
                  value={search}
                  onChange={e => { setSearch(e.target.value); setShowSuggestions(true); }}
                  onFocus={() => search.length >= 2 && setShowSuggestions(true)}
                  placeholder={t('club.search_placeholder')}
                  className="pl-10 h-11 text-base"
                  autoComplete="off"
                  autoFocus
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => { setSearch(''); setShowSuggestions(false); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}

                {/* Autocomplete dropdown */}
                {showSuggestions && suggestions.length > 0 && (
                  <div className="absolute z-50 top-full left-0 right-0 mt-1.5 rounded-xl border bg-popover shadow-xl overflow-hidden">
                    <div className="p-1.5 max-h-72 overflow-y-auto">
                      <p className="px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                        <Database className="w-3 h-3" />
                        {t('club.from_database')}
                      </p>
                      {suggestions.map(s => (
                        <button
                          key={s.club_name}
                          type="button"
                          onClick={() => { setShowSuggestions(false); goToClub(s.club_name); }}
                          className="w-full flex items-center gap-3 px-2.5 py-2.5 rounded-lg text-left hover:bg-muted transition-colors group"
                        >
                          {s.logo_url
                            ? <img src={s.logo_url} alt="" className="w-7 h-7 object-contain shrink-0" />
                            : <ClubBadge club={s.club_name} size="xs" />
                          }
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold truncate">{s.club_name}</p>
                            {(s.competition || s.country) && (
                              <p className="text-[11px] text-muted-foreground truncate">
                                {[s.competition, s.country].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Button type="submit" size="lg" className="shrink-0" disabled={!search.trim()}>
                <Search className="w-4 h-4 mr-2" />
                {t('club.search_btn')}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Followed clubs */}
      {followedClubs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Heart className="w-4 h-4 text-rose-500" />
              {t('club.followed_clubs')} ({followedClubs.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {followedClubs.map(fc => (
                <div
                  key={fc.id}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted/40 hover:bg-muted/70 transition-colors group cursor-pointer"
                  onClick={() => goToClub(fc.club_name)}
                >
                  <ClubBadge club={fc.club_name} size="sm" />
                  <span className="flex-1 text-sm font-medium truncate group-hover:text-primary transition-colors">{fc.club_name}</span>
                  <ArrowRight className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  <button
                    onClick={e => { e.stopPropagation(); unfollowClub.mutate(fc.id); }}
                    className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title={t('club.unfollow')}
                  >
                    <HeartOff className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* User's clubs (from player list) */}
      {userClubs.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="w-4 h-4 text-primary" />
              {t('club.your_clubs')}
              <Badge variant="secondary" className="ml-1 tabular-nums">{userClubs.length}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="flex flex-wrap gap-1.5">
              {userClubs.map(club => (
                <button
                  key={club}
                  onClick={() => goToClub(club)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-muted hover:bg-accent hover:text-accent-foreground transition-colors font-medium"
                >
                  <ClubBadge club={club} size="xs" />
                  {club}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty state when no clubs */}
      {followedClubs.length === 0 && userClubs.length === 0 && (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
          <p className="text-sm font-medium text-muted-foreground">{t('club.empty_title')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('club.search_hint')}</p>
        </div>
      )}
    </div>
  );
}
