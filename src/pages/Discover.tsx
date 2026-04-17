import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useIsPremium } from '@/hooks/use-admin';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Search, Loader2, Crown, UserPlus, ExternalLink, Sparkles, Filter, Globe, Euro, Calendar, Crosshair, Users } from 'lucide-react';
import { translateCountry } from '@/types/player';
import { useAuth } from '@/contexts/AuthContext';

interface DiscoveredPlayer {
  name: string;
  tmPath: string;
  tmId: string | null;
  photo: string | null;
  position: string;
  age: number | null;
  nationality: string;
  club: string;
  clubLogo: string;
  marketValue: string;
}

interface CommunityPlayer {
  id: string;
  name: string;
  club: string;
  league: string;
  nationality: string;
  position: string;
  zone: string;
  age: number | null;
  photo_url: string | null;
  market_value: string | null;
  current_level: number;
  potential: number;
  general_opinion: string;
  transfermarkt_id: string | null;
  scout: { name: string; photo: string | null; club: string | null };
}

const POSITIONS_FILTER = [
  { value: '', label: 'discover.all_positions' },
  { value: 'gardien', label: 'discover.pos_gk' },
  { value: 'défenseur', label: 'discover.pos_def' },
  { value: 'milieu', label: 'discover.pos_mid' },
  { value: 'attaquant', label: 'discover.pos_fwd' },
  { value: 'ailier', label: 'discover.pos_wing' },
];

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export default function Discover() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: isPremium } = useIsPremium();
  const { user } = useAuth();

  const [searchMode, setSearchMode] = useState<'player' | 'club' | 'community'>('player');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [clubSearch, setClubSearch] = useState('');
  const [communitySearch, setCommunitySearch] = useState('');
  const [foundClubName, setFoundClubName] = useState('');
  const [position, setPosition] = useState('');
  const [ageMin, setAgeMin] = useState('');
  const [ageMax, setAgeMax] = useState('');
  const [valueMin, setValueMin] = useState('');
  const [valueMax, setValueMax] = useState('');
  const [nationality, setNationality] = useState('');
  const [results, setResults] = useState<DiscoveredPlayer[]>([]);
  const [communityResults, setCommunityResults] = useState<CommunityPlayer[]>([]);
  const [filtersOpen, setFiltersOpen] = useState(true);
  const [addingPlayer, setAddingPlayer] = useState<string | null>(null);

  const query = [firstName.trim(), lastName.trim()].filter(Boolean).join(' ');

  // Cache discover results in sessionStorage to avoid redundant scraping calls
  const buildCacheKey = () => {
    const parts = searchMode === 'club'
      ? ['club', clubSearch.trim(), position, ageMin, ageMax, valueMin, valueMax, nationality]
      : ['player', query, position, ageMin, ageMax, valueMin, valueMax, nationality];
    return `discover_${parts.join('|')}`;
  };

  const searchMutation = useMutation({
    mutationFn: async () => {
      const cacheKey = buildCacheKey();
      // Check sessionStorage cache (valid for current browser session)
      try {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          // Cache valid for 10 min
          if (parsed._ts && Date.now() - parsed._ts < 10 * 60 * 1000) {
            return parsed.data as { players: DiscoveredPlayer[]; clubName?: string };
          }
          sessionStorage.removeItem(cacheKey);
        }
      } catch { /* ignore corrupt cache */ }

      const body = searchMode === 'club'
        ? { clubQuery: clubSearch.trim(), position, ageMin, ageMax, valueMin, valueMax, nationality }
        : { query, position, ageMin, ageMax, valueMin, valueMax, nationality };
      const { data, error } = await supabase.functions.invoke('discover-players', { body });
      if (error) throw error;
      const result = data as { players: DiscoveredPlayer[]; clubName?: string };

      // Store in sessionStorage
      try { sessionStorage.setItem(cacheKey, JSON.stringify({ _ts: Date.now(), data: result })); } catch { /* quota */ }
      return result;
    },
    onSuccess: (data) => {
      setResults(data.players || []);
      setFoundClubName(data.clubName || '');
      if ((data.players || []).length === 0) {
        toast(t('discover.no_results'));
      }
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    },
  });

  // Community search mutation
  const communityMutation = useMutation({
    mutationFn: async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const params = new URLSearchParams();
      if (communitySearch.trim()) params.set('q', communitySearch.trim());
      if (position) params.set('position', position);
      if (nationality) params.set('nationality', nationality);
      if (ageMin) params.set('ageMin', ageMin);
      if (ageMax) params.set('ageMax', ageMax);
      const resp = await fetch(`${API_BASE}/community-players/search?${params}`, {
        credentials: 'include',
      });
      if (!resp.ok) throw new Error('Erreur recherche');
      return resp.json() as Promise<{ players: CommunityPlayer[] }>;
    },
    onSuccess: (data) => {
      setCommunityResults(data.players || []);
      if ((data.players || []).length === 0) toast(t('discover.no_results'));
    },
    onError: (err: unknown) => { toast.error(err instanceof Error ? err.message : t('common.error')); },
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchMode === 'community') {
      if (!communitySearch.trim()) return;
      communityMutation.mutate();
      return;
    }
    if (searchMode === 'club' ? !clubSearch.trim() : !query.trim()) return;
    searchMutation.mutate();
  };

  const handleAddPlayer = async (player: DiscoveredPlayer) => {
    setAddingPlayer(player.tmId || player.name);
    try {
      const { error } = await supabase.from('players').insert({
        name: player.name,
        club: player.club,
        nationality: player.nationality.split(',')[0]?.trim() || '',
        position: guessPosition(player.position),
        generation: player.age ? new Date().getFullYear() - player.age : 2000,
        market_value: player.marketValue,
        transfermarkt_id: player.tmId,
        photo_url: player.photo,
      });
      if (error) throw error;
      toast.success(t('discover.player_added', { name: player.name }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAddingPlayer(null);
    }
  };

  const handleAddCommunityPlayer = async (player: CommunityPlayer) => {
    setAddingPlayer(player.id);
    try {
      const { error } = await supabase.from('players').insert({
        name: player.name,
        club: player.club,
        league: player.league,
        nationality: player.nationality,
        position: player.position,
        zone: player.zone,
        generation: player.age ? new Date().getFullYear() - player.age : 2000,
        market_value: player.market_value,
        transfermarkt_id: player.transfermarkt_id,
        photo_url: player.photo_url,
        current_level: player.current_level,
        potential: player.potential,
        general_opinion: player.general_opinion,
      });
      if (error) throw error;
      toast.success(t('discover.player_added', { name: player.name }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setAddingPlayer(null);
    }
  };

  // Premium gate
  if (isPremium === false) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4 text-center space-y-6">
        <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto">
          <Crown className="w-8 h-8 text-primary" />
        </div>
        <h1 className="text-2xl font-bold">{t('discover.premium_title')}</h1>
        <p className="text-muted-foreground max-w-md mx-auto">{t('discover.premium_desc')}</p>
        <Link to="/pricing">
          <Button>
            <Sparkles className="w-4 h-4 mr-2" />
            {t('discover.see_plans')}
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-3">
          <Search className="w-6 h-6 text-primary" />
          {t('discover.title')}
          <Badge variant="secondary" className="text-[10px] gap-1">
            <Crown className="w-3 h-3" />
            Premium
          </Badge>
        </h1>
        <p className="text-muted-foreground text-sm mt-1">{t('discover.subtitle')}</p>
      </div>

      {/* Search form */}
      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Mode toggle */}
            <div className="flex items-center gap-1 p-1 rounded-lg bg-muted w-fit">
              <button
                type="button"
                onClick={() => { setSearchMode('player'); setResults([]); setCommunityResults([]); setFoundClubName(''); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${searchMode === 'player' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                <UserPlus className="w-3.5 h-3.5 inline mr-1.5" />
                {t('discover.mode_player')}
              </button>
              <button
                type="button"
                onClick={() => { setSearchMode('club'); setResults([]); setCommunityResults([]); setFoundClubName(''); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${searchMode === 'club' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                <Search className="w-3.5 h-3.5 inline mr-1.5" />
                {t('discover.mode_club')}
              </button>
              <button
                type="button"
                onClick={() => { setSearchMode('community'); setResults([]); setCommunityResults([]); setFoundClubName(''); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${searchMode === 'community' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'}`}
              >
                <Users className="w-3.5 h-3.5 inline mr-1.5" />
                {t('discover.mode_community')}
              </button>
            </div>

            {/* Search inputs */}
            <div className="flex gap-2">
              {searchMode === 'player' ? (
                <>
                  <div className="flex-1">
                    <Input
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder={t('discover.first_name')}
                    />
                  </div>
                  <div className="flex-1">
                    <Input
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder={t('discover.last_name')}
                    />
                  </div>
                </>
              ) : searchMode === 'community' ? (
                <div className="flex-1">
                  <Input
                    value={communitySearch}
                    onChange={e => setCommunitySearch(e.target.value)}
                    placeholder={t('discover.community_placeholder')}
                  />
                </div>
              ) : (
                <div className="flex-1">
                  <Input
                    value={clubSearch}
                    onChange={e => setClubSearch(e.target.value)}
                    placeholder={t('discover.club_placeholder')}
                  />
                </div>
              )}
              <Button type="submit" disabled={
                (searchMode === 'community' ? communityMutation.isPending : searchMutation.isPending) ||
                (searchMode === 'club' ? !clubSearch.trim() : searchMode === 'community' ? !communitySearch.trim() : !query.trim())
              }>
                {(searchMode === 'community' ? communityMutation.isPending : searchMutation.isPending)
                  ? <Loader2 className="w-4 h-4 animate-spin mr-2" />
                  : <Search className="w-4 h-4 mr-2" />}
                {t('discover.search_btn')}
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => setFiltersOpen(!filtersOpen)}>
                <Filter className="w-4 h-4" />
              </Button>
            </div>

            {/* Filters */}
            {filtersOpen && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3 pt-3 border-t border-border">
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <Crosshair className="w-3 h-3" /> {t('discover.filter_position')}
                  </label>
                  <Select value={position} onValueChange={v => setPosition(v === '_all' ? '' : v)}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder={t('discover.all_positions')} />
                    </SelectTrigger>
                    <SelectContent>
                      {POSITIONS_FILTER.map(p => (
                        <SelectItem key={p.value || '_all'} value={p.value || '_all'}>{t(p.label)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <Globe className="w-3 h-3" /> {t('discover.filter_nationality')}
                  </label>
                  <Input value={nationality} onChange={e => setNationality(e.target.value)} placeholder="France" className="h-8 text-xs" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <Calendar className="w-3 h-3" /> {t('discover.filter_age')}
                  </label>
                  <div className="flex gap-1">
                    <Input value={ageMin} onChange={e => setAgeMin(e.target.value)} placeholder="16" className="h-8 text-xs" type="number" />
                    <Input value={ageMax} onChange={e => setAgeMax(e.target.value)} placeholder="35" className="h-8 text-xs" type="number" />
                  </div>
                </div>
                <div className="space-y-1 col-span-2 md:col-span-2">
                  <label className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
                    <Euro className="w-3 h-3" /> {t('discover.filter_value')}
                  </label>
                  <div className="flex gap-1 items-center">
                    <Input value={valueMin} onChange={e => setValueMin(e.target.value)} placeholder="0" className="h-8 text-xs" type="number" />
                    <span className="text-xs text-muted-foreground shrink-0">-</span>
                    <Input value={valueMax} onChange={e => setValueMax(e.target.value)} placeholder="100" className="h-8 text-xs" type="number" />
                    <span className="text-xs text-muted-foreground shrink-0">M€</span>
                  </div>
                </div>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {/* Results — Community mode */}
      {searchMode === 'community' ? (
        communityMutation.isPending ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : communityResults.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {t('discover.community_results', { count: communityResults.length })}
            </p>
            <div className="grid gap-2">
              {communityResults.map((player) => (
                <Card key={player.id} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                      {player.photo_url ? (
                        <img src={player.photo_url} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold truncate">{player.name}</h3>
                        {player.age && <span className="text-xs text-muted-foreground">{player.age} {t('discover.years')}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {player.position && <span>{player.position}</span>}
                        {player.club && <span>{player.club}</span>}
                        {player.nationality && <span>{translateCountry(player.nationality, i18n.language)}</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {t('discover.scouted_by')} {player.scout.name}
                          {player.scout.club && ` · ${player.scout.club}`}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {player.current_level > 0 && (
                        <Badge variant="outline" className="text-[10px]">{player.current_level}/10</Badge>
                      )}
                      {player.market_value && (
                        <Badge variant="outline" className="shrink-0 font-mono text-xs">{player.market_value}</Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleAddCommunityPlayer(player)}
                        disabled={addingPlayer === player.id}
                      >
                        {addingPlayer === player.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" />
                        ) : (
                          <UserPlus className="w-3.5 h-3.5 mr-1" />
                        )}
                        {t('discover.add')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : communityMutation.isSuccess ? (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('discover.no_results')}</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Users className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">{t('discover.community_empty_title')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('discover.community_empty_desc')}</p>
          </div>
        )
      ) : (
        /* Results — TM mode (player/club) */
        searchMutation.isPending ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : results.length > 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {foundClubName
                ? t('discover.club_squad', { club: foundClubName, count: results.length })
                : t('discover.results_count', { count: results.length })}
            </p>
            <div className="grid gap-2">
              {results.map((player, i) => (
                <Card key={`${player.tmId || i}`} className="hover:border-primary/30 transition-colors">
                  <CardContent className="p-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                      {player.photo ? (
                        <img src={player.photo} alt={player.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-lg font-bold text-muted-foreground">
                          {player.name[0]}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-bold truncate">{player.name}</h3>
                        {player.age && <span className="text-xs text-muted-foreground">{player.age} {t('discover.years')}</span>}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                        {player.position && <span>{player.position}</span>}
                        {player.club && (
                          <span className="flex items-center gap-1">
                            {player.clubLogo && <img src={player.clubLogo} alt="" className="w-3.5 h-3.5" />}
                            {player.club}
                          </span>
                        )}
                        {player.nationality && <span>{translateCountry(player.nationality, i18n.language)}</span>}
                      </div>
                    </div>
                    {player.marketValue && (
                      <Badge variant="outline" className="shrink-0 font-mono text-xs">{player.marketValue}</Badge>
                    )}
                    <div className="flex items-center gap-2 shrink-0">
                      {player.tmPath && (
                        <a href={`https://www.transfermarkt.fr${player.tmPath}`} target="_blank" rel="noopener noreferrer" className="p-2 rounded-lg hover:bg-muted transition-colors">
                          <ExternalLink className="w-4 h-4 text-muted-foreground" />
                        </a>
                      )}
                      <Button size="sm" variant="outline" onClick={() => handleAddPlayer(player)} disabled={addingPlayer === (player.tmId || player.name)}>
                        {addingPlayer === (player.tmId || player.name) ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <UserPlus className="w-3.5 h-3.5 mr-1" />}
                        {t('discover.add')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        ) : searchMutation.isSuccess ? (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{t('discover.no_results')}</p>
          </div>
        ) : (
          <div className="text-center py-16">
            <Search className="w-10 h-10 text-muted-foreground/20 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">{t('discover.empty_title')}</p>
            <p className="text-xs text-muted-foreground/60 mt-1">{t('discover.empty_desc')}</p>
          </div>
        )
      )}
    </div>
  );
}

function guessPosition(posText: string): string {
  if (!posText) return 'MC';
  const p = posText.toLowerCase();
  if (p.includes('gardien') || p.includes('keeper') || p.includes('tor')) return 'GK';
  if (p.includes('défenseur central') || p.includes('innen')) return 'DC';
  if (p.includes('latéral droit') || p.includes('rechter')) return 'LD';
  if (p.includes('latéral gauche') || p.includes('linker')) return 'LG';
  if (p.includes('milieu défensif') || p.includes('defensives')) return 'MDef';
  if (p.includes('milieu central') || p.includes('zentrales')) return 'MC';
  if (p.includes('milieu offensif') || p.includes('offensives')) return 'MO';
  if (p.includes('ailier droit') || p.includes('rechtsaußen')) return 'AD';
  if (p.includes('ailier gauche') || p.includes('linksaußen')) return 'AG';
  if (p.includes('avant-centre') || p.includes('mittelstürmer') || p.includes('attaquant')) return 'ATT';
  if (p.includes('défenseur') || p.includes('abwehr')) return 'DC';
  if (p.includes('milieu') || p.includes('mittelfeld')) return 'MC';
  return 'MC';
}
