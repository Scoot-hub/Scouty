import { useState, useMemo, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  ResponsiveContainer, Legend, Tooltip,
  LineChart, Line, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Database, ArrowLeft, Activity, Loader2, Filter, X,
  ChevronDown, ChevronUp, Sparkles, Users, TrendingUp, LineChart as LineChartIcon,
} from 'lucide-react';
import {
  aggregateWyscoutRows, filterWyscoutRows, extractFilterOptions, EMPTY_FILTERS,
  type WyscoutFilters,
} from '@/lib/wyscout-aggregate';
import {
  detectRole, computeInsights, findSimilarPlayers,
  statPercentile, ROLE_PROFILES,
  type RoleResult, type Insight,
} from '@/lib/wyscout-analysis';
import type { WyscoutStatRow } from '@/hooks/use-wyscout-stats';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// ── Types ─────────────────────────────────────────────────────────────────
type WyscoutPlayer = {
  id: string;
  name: string;
  club: string | null;
  team_in_timeframe: string | null;
  league: string | null;
  position: string | null;
  zone: string | null;
  foot: string | null;
  nationality: string | null;
  passport_country: string | null;
  generation: number | null;
  height: number | null;
  weight: number | null;
  on_loan: number;
  matches_played: number | null;
  minutes_played: number | null;
  market_value: string | null;
  contract_end: string | null;
  photo_url: string | null;
  wyscout_season: string | null;
  wyscout_division: string | null;
};
type Season = {
  season: string;
  division: string | null;
  team: string | null;
  matches_played: number | null;
  minutes_played: number | null;
};
type Benchmark = {
  position: string | null;
  division: string | null;
  sample_size: number;
  benchmark: Record<string, number | null>;
};
type PeerRow = WyscoutStatRow & {
  name: string;
  player_position: string | null;
  club: string | null;
};

// ── Stat catalog (categorised, with display units) ────────────────────────
type StatCat = 'attack' | 'passing' | 'defending' | 'physical' | 'gk';
interface StatDef {
  db: keyof WyscoutStatRow;
  label: string;
  cat: StatCat;
  unit?: string;
  gkOnly?: boolean;
}
const CAT_LABEL: Record<StatCat, string> = {
  attack: 'Attaque',
  passing: 'Création & Passes',
  defending: 'Défense',
  physical: 'Physique',
  gk: 'Gardien',
};
const STAT_CATALOG: StatDef[] = [
  // Attack
  { db: 'goals', label: 'Buts', cat: 'attack' },
  { db: 'assists', label: 'Assists', cat: 'attack' },
  { db: 'shots', label: 'Tirs', cat: 'attack' },
  { db: 'xg', label: 'xG', cat: 'attack' },
  { db: 'xa', label: 'xA', cat: 'attack' },
  { db: 'np_goals', label: 'Buts hors PK', cat: 'attack' },
  { db: 'head_goals', label: 'Buts de la tête', cat: 'attack' },
  { db: 'goals_per90', label: 'Buts /90', cat: 'attack' },
  { db: 'np_goals_per90', label: 'Buts hors PK /90', cat: 'attack' },
  { db: 'xg_per90', label: 'xG /90', cat: 'attack' },
  { db: 'assists_per90', label: 'Assists /90', cat: 'attack' },
  { db: 'xa_per90', label: 'xA /90', cat: 'attack' },
  { db: 'shots_per90', label: 'Tirs /90', cat: 'attack' },
  { db: 'shots_on_target_pct', label: '% Tirs cadrés', cat: 'attack', unit: '%' },
  { db: 'goal_conversion_pct', label: '% Conversion', cat: 'attack', unit: '%' },
  { db: 'attacking_actions_per90', label: 'Actions off. /90', cat: 'attack' },
  { db: 'dribbles_per90', label: 'Dribbles /90', cat: 'attack' },
  { db: 'dribbles_success_pct', label: '% Dribbles', cat: 'attack', unit: '%' },
  { db: 'touches_in_box_per90', label: 'Touches surface /90', cat: 'attack' },
  { db: 'progressive_runs_per90', label: 'Courses prog. /90', cat: 'attack' },
  { db: 'crosses_per90', label: 'Centres /90', cat: 'attack' },
  { db: 'crosses_accurate_pct', label: '% Centres', cat: 'attack', unit: '%' },
  // Passing
  { db: 'passes_per90', label: 'Passes /90', cat: 'passing' },
  { db: 'passes_accurate_pct', label: '% Passes', cat: 'passing', unit: '%' },
  { db: 'key_passes_per90', label: 'Passes clés /90', cat: 'passing' },
  { db: 'smart_passes_per90', label: 'Smart passes /90', cat: 'passing' },
  { db: 'forward_passes_per90', label: 'Passes avant /90', cat: 'passing' },
  { db: 'long_passes_per90', label: 'Longues passes /90', cat: 'passing' },
  { db: 'long_passes_accurate_pct', label: '% Longues passes', cat: 'passing', unit: '%' },
  { db: 'progressive_passes_per90', label: 'Passes prog. /90', cat: 'passing' },
  { db: 'passes_final_third_per90', label: 'Passes 3e tiers /90', cat: 'passing' },
  { db: 'through_passes_per90', label: 'Passes traversantes /90', cat: 'passing' },
  { db: 'deep_completions_per90', label: 'Deep completions /90', cat: 'passing' },
  // Defense
  { db: 'defensive_actions_per90', label: 'Actions déf. /90', cat: 'defending' },
  { db: 'defensive_duels_per90', label: 'Duels déf. /90', cat: 'defending' },
  { db: 'defensive_duels_won_pct', label: '% Duels déf.', cat: 'defending', unit: '%' },
  { db: 'interceptions_per90', label: 'Interceptions /90', cat: 'defending' },
  { db: 'padj_interceptions', label: 'PAdj Interceptions', cat: 'defending' },
  { db: 'sliding_tackles_per90', label: 'Tacles glissés /90', cat: 'defending' },
  { db: 'padj_sliding_tackles', label: 'PAdj Tacles', cat: 'defending' },
  { db: 'shots_blocked_per90', label: 'Tirs bloqués /90', cat: 'defending' },
  { db: 'aerial_duels_per90', label: 'Duels aériens /90', cat: 'defending' },
  { db: 'aerial_duels_won_pct', label: '% Duels aériens', cat: 'defending', unit: '%' },
  { db: 'duels_per90', label: 'Duels /90', cat: 'defending' },
  { db: 'duels_won_pct', label: '% Duels', cat: 'defending', unit: '%' },
  // Physical
  { db: 'total_distance_per90', label: 'Distance /90', cat: 'physical', unit: 'm' },
  { db: 'sprint_distance_per90', label: 'Distance sprint /90', cat: 'physical', unit: 'm' },
  { db: 'hi_distance_per90', label: 'Distance HI /90', cat: 'physical', unit: 'm' },
  { db: 'max_speed', label: 'Vitesse max', cat: 'physical', unit: 'km/h' },
  { db: 'meters_per_min', label: 'Mètres/min', cat: 'physical', unit: 'm/min' },
  { db: 'high_accel_per90', label: 'Accél. fortes /90', cat: 'physical' },
  { db: 'sprint_count_per90', label: 'Sprints /90', cat: 'physical' },
  { db: 'fouls_per90', label: 'Fautes /90', cat: 'physical' },
  { db: 'fouls_suffered_per90', label: 'Fautes subies /90', cat: 'physical' },
  // Goalkeeper
  { db: 'clean_sheets', label: 'Clean sheets', cat: 'gk', gkOnly: true },
  { db: 'conceded_goals_per90', label: 'Buts encaissés /90', cat: 'gk', gkOnly: true },
  { db: 'save_rate_pct', label: '% Arrêts', cat: 'gk', unit: '%', gkOnly: true },
  { db: 'prevented_goals', label: 'Buts prévenus', cat: 'gk', gkOnly: true },
  { db: 'prevented_goals_per90', label: 'Buts prévenus /90', cat: 'gk', gkOnly: true },
  { db: 'gk_exits_per90', label: 'Sorties /90', cat: 'gk', gkOnly: true },
  { db: 'gk_aerial_duels_per90', label: 'Duels aér. (GK) /90', cat: 'gk', gkOnly: true },
];

// ── Radar defs (mirror of CatalogSearch) ──────────────────────────────────
type RadarDef = { key: string; label: string; max: number; inverted?: boolean };
const RADAR_FIELD: RadarDef[] = [
  { key: 'goals_per90', label: 'Buts/90', max: 1 },
  { key: 'xg_per90', label: 'xG/90', max: 1 },
  { key: 'assists_per90', label: 'Assists/90', max: 0.6 },
  { key: 'xa_per90', label: 'xA/90', max: 0.5 },
  { key: 'shots_per90', label: 'Tirs/90', max: 5 },
  { key: 'key_passes_per90', label: 'Passes clés/90', max: 3 },
  { key: 'progressive_passes_per90', label: 'Passes prog./90', max: 12 },
  { key: 'passes_accurate_pct', label: '% Passes', max: 100 },
  { key: 'dribbles_per90', label: 'Dribbles/90', max: 8 },
  { key: 'defensive_duels_won_pct', label: '% Duels déf.', max: 100 },
  { key: 'aerial_duels_won_pct', label: '% Duels aér.', max: 100 },
  { key: 'interceptions_per90', label: 'Interceptions/90', max: 10 },
];
const RADAR_GK: RadarDef[] = [
  { key: 'save_rate_pct', label: '% Arrêts', max: 100 },
  { key: 'conceded_goals_per90', label: 'Buts enc./90', max: 3, inverted: true },
  { key: 'shots_against_per90', label: 'Tirs subis/90', max: 8 },
  { key: 'prevented_goals_per90', label: 'Buts prévenus/90', max: 0.5 },
  { key: 'clean_sheets', label: 'Clean sheets', max: 25 },
  { key: 'gk_exits_per90', label: 'Sorties/90', max: 1.5 },
  { key: 'gk_aerial_duels_per90', label: 'Duels aér./90', max: 2 },
  { key: 'passes_accurate_pct', label: '% Passes', max: 100 },
];
function normalizeStat(value: number | null | undefined, def: RadarDef): number {
  if (value === null || value === undefined || isNaN(Number(value))) return 0;
  const v = Number(value);
  const cmp = def.inverted ? Math.max(def.max - v, 0) : v;
  return Math.round(Math.min(Math.max(cmp / def.max, 0), 1) * 100);
}

const wyscoutNum = (row: Record<string, unknown> | null | undefined, key: string): number | null => {
  if (!row) return null;
  const v = row[key];
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return isNaN(n) ? null : n;
};
const fmt = (v: number | null | undefined, unit?: string) => {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? parseFloat(v as unknown as string) : v;
  if (isNaN(n)) return '—';
  const str = Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
  return unit ? `${str}${unit === '%' ? unit : ` ${unit}`}` : str;
};

// ── Page component ────────────────────────────────────────────────────────
export default function WyscoutPlayerData() {
  const { id } = useParams<{ id: string }>();

  const playerQ = useQuery({
    queryKey: ['wyscout-player', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/players/${id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('not_found');
      return res.json() as Promise<{ player: WyscoutPlayer; seasons: Season[] }>;
    },
    enabled: !!id,
  });

  const statsQ = useQuery({
    queryKey: ['wyscout-all-stats', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/players/${id}/stats?all=1`, { credentials: 'include' });
      if (!res.ok) return { rows: [] };
      return res.json() as Promise<{ rows: WyscoutStatRow[] }>;
    },
    enabled: !!id,
  });

  const playerPos = playerQ.data?.player.position || '';
  const benchmarkQ = useQuery({
    queryKey: ['wyscout-benchmark', playerPos],
    queryFn: async () => {
      if (!playerPos) return null;
      const res = await fetch(`${API_BASE}/wyscout/benchmarks?position=${encodeURIComponent(playerPos)}`, { credentials: 'include' });
      if (!res.ok) return null;
      return res.json() as Promise<Benchmark>;
    },
    enabled: !!playerPos,
    staleTime: 5 * 60 * 1000,
  });

  const peersQ = useQuery({
    queryKey: ['wyscout-peers', playerPos],
    queryFn: async () => {
      if (!playerPos) return { rows: [], count: 0 };
      const res = await fetch(`${API_BASE}/wyscout/peers?position=${encodeURIComponent(playerPos)}&limit=500`, { credentials: 'include' });
      if (!res.ok) return { rows: [], count: 0 };
      return res.json() as Promise<{ rows: PeerRow[]; count: number }>;
    },
    enabled: !!playerPos,
    staleTime: 5 * 60 * 1000,
  });

  // V2 similarity: server-side z-score (per position group) Euclidean ranking.
  // Falls back to the client-side cosine below if it returns nothing.
  const similarQ = useQuery({
    queryKey: ['wyscout-similar-v2', id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/wyscout/similar/${id}?limit=8`, { credentials: 'include' });
      if (!res.ok) return { results: [] };
      return res.json() as Promise<{ results: Array<{ player_id: string; name: string; position: string | null; club: string | null; similarity: number }>; cohortSize?: number }>;
    },
    enabled: !!id,
    staleTime: 5 * 60 * 1000,
  });

  const [filters, setFilters] = useState<WyscoutFilters>(EMPTY_FILTERS);
  const [statCat, setStatCat] = useState<'all' | StatCat>('all');
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [viewMode, setViewMode] = useState<'synthese' | 'detaille'>(() => {
    try { return (localStorage.getItem('wyscout-data-view') as 'synthese' | 'detaille') || 'synthese'; }
    catch { return 'synthese'; }
  });
  useEffect(() => {
    try { localStorage.setItem('wyscout-data-view', viewMode); } catch { /* noop */ }
  }, [viewMode]);
  const [seasonChartStat, setSeasonChartStat] = useState<keyof WyscoutStatRow>('goals_per90');

  const rows = statsQ.data?.rows || [];
  const filterOptions = useMemo(() => extractFilterOptions(rows), [rows]);
  const filteredRows = useMemo(() => filterWyscoutRows(rows, filters), [rows, filters]);
  const aggregated = useMemo(() => aggregateWyscoutRows(filteredRows), [filteredRows]);
  // For insight comparisons: 2nd most recent season (rows are already
  // sorted DESC by season,division server-side).
  const prevSeasonRow: WyscoutStatRow | null = rows.length >= 2 ? rows[1] : null;

  // Peer-based analysis. peersQ.data is keyed on the player's position so
  // we get a same-position cohort.
  const peerRows: PeerRow[] = peersQ.data?.rows || [];
  const peersForSimilarity = useMemo(
    () => peerRows.filter(p => p.player_id !== id).map(p => ({ playerId: p.player_id, row: p as WyscoutStatRow })),
    [peerRows, id]
  );
  const peerByPlayerId = useMemo(
    () => new Map(peerRows.map(p => [p.player_id, p])),
    [peerRows]
  );
  const peerStatRowsForPercentile: WyscoutStatRow[] = useMemo(
    () => peerRows.filter(p => p.player_id !== id) as WyscoutStatRow[],
    [peerRows, id]
  );

  const detection: RoleResult[] = useMemo(() => {
    if (!aggregated || !playerPos) return [];
    return detectRole(aggregated as WyscoutStatRow, playerPos, ROLE_PROFILES);
  }, [aggregated, playerPos]);

  const insights: Insight[] = useMemo(() => {
    if (!aggregated || !playerPos) return [];
    return computeInsights(aggregated as WyscoutStatRow, playerPos, prevSeasonRow, peerStatRowsForPercentile);
  }, [aggregated, playerPos, prevSeasonRow, peerStatRowsForPercentile]);

  const isGKPos = (playerPos || '').toUpperCase() === 'GB' || (playerPos || '').toUpperCase() === 'GK';
  const similarPlayers = useMemo(() => {
    if (!aggregated || peersForSimilarity.length === 0) return [];
    return findSimilarPlayers(aggregated as WyscoutStatRow, peersForSimilarity, isGKPos, 5);
  }, [aggregated, peersForSimilarity, isGKPos]);

  // Prefer the V2 server ranking; fall back to the client-side cosine result.
  const similarList = useMemo(() => {
    const v2 = similarQ.data?.results ?? [];
    if (v2.length) return v2.map(r => ({ player_id: r.player_id, name: r.name, position: r.position, club: r.club, similarity: r.similarity }));
    return similarPlayers.map(s => {
      const peer = peerByPlayerId.get(s.playerId);
      return { player_id: s.playerId, name: peer?.name ?? '—', position: peer?.player_position ?? null, club: peer?.club ?? null, similarity: s.similarity };
    });
  }, [similarQ.data, similarPlayers, peerByPlayerId]);

  if (!id) return <div className="p-6">Aucun joueur sélectionné.</div>;

  if (playerQ.isLoading) {
    return <div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" /></div>;
  }
  if (playerQ.isError || !playerQ.data) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center space-y-4">
        <h2 className="text-xl font-semibold">Joueur introuvable</h2>
        <p className="text-sm text-muted-foreground">Ce joueur n'existe pas (ou plus) dans la base de statistiques partagée.</p>
        <Button asChild variant="outline"><Link to="/data"><ArrowLeft className="w-4 h-4 mr-2" /> Retour à la base</Link></Button>
      </div>
    );
  }

  const player = playerQ.data.player;
  const seasons = playerQ.data.seasons;
  const pos = (player.position || '').toUpperCase();
  const isGK = pos === 'GB' || pos === 'GK';

  const filterActive = filters.seasons.length + filters.clubs.length + filters.divisions.length > 0;

  const toggleFilter = (kind: keyof WyscoutFilters, value: string) => {
    setFilters(prev => {
      const arr = prev[kind];
      const has = arr.includes(value);
      return { ...prev, [kind]: has ? arr.filter(v => v !== value) : [...arr, value] };
    });
  };
  const clearFilters = () => setFilters(EMPTY_FILTERS);

  const cats = (['attack', 'passing', 'defending', 'physical', 'gk'] as const).filter(c => isGK ? c === 'gk' : c !== 'gk');
  const visibleCats = statCat === 'all' ? cats : cats.filter(c => c === statCat);

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Back link */}
      <div>
        <Button asChild variant="ghost" size="sm" className="gap-1.5 -ml-2">
          <Link to="/data"><ArrowLeft className="w-4 h-4" /> Retour à la base de statistiques</Link>
        </Button>
      </div>

      {/* Header / Identity */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-start gap-4 flex-wrap">
            <div className="w-14 h-14 rounded-xl bg-emerald-500/10 flex items-center justify-center shrink-0">
              <Database className="w-7 h-7 text-emerald-500" />
            </div>
            <div className="flex-1 min-w-0 space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold tracking-tight">{player.name}</h1>
                {player.position && <Badge variant="outline">{player.position}</Badge>}
                {player.zone && <Badge variant="secondary" className="text-[10px]">{player.zone}</Badge>}
                {player.on_loan ? <Badge variant="outline" className="text-amber-600 text-[10px]">Prêt</Badge> : null}
              </div>
              <p className="text-sm text-muted-foreground">
                {player.club || 'Sans club'}{player.league ? ` · ${player.league}` : ''}
              </p>
              <IdentityGrid player={player} />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      {(filterOptions.seasons.length > 1 || filterOptions.clubs.length > 1 || filterOptions.divisions.length > 1) && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2">
                <Filter className="w-4 h-4 text-violet-500" /> Filtres
                {filterActive && (
                  <Badge variant="secondary" className="text-[10px]">
                    {filteredRows.length} / {rows.length} saison{rows.length > 1 ? 's' : ''}
                  </Badge>
                )}
              </CardTitle>
              {filterActive && (
                <Button size="sm" variant="ghost" className="h-7 text-xs gap-1" onClick={clearFilters}>
                  <X className="w-3 h-3" /> Réinitialiser
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filterOptions.seasons.length > 1 && (
              <FilterRow label="Saisons" values={filterOptions.seasons} active={filters.seasons} onToggle={v => toggleFilter('seasons', v)} />
            )}
            {filterOptions.clubs.length > 1 && (
              <FilterRow label="Clubs" values={filterOptions.clubs} active={filters.clubs} onToggle={v => toggleFilter('clubs', v)} />
            )}
            {filterOptions.divisions.length > 1 && (
              <FilterRow label="Divisions" values={filterOptions.divisions} active={filters.divisions} onToggle={v => toggleFilter('divisions', v)} />
            )}
          </CardContent>
        </Card>
      )}

      {statsQ.isLoading && (
        <div className="flex items-center justify-center py-10"><Loader2 className="w-5 h-5 animate-spin" /></div>
      )}

      {!statsQ.isLoading && rows.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Pas de statistiques enregistrées pour ce joueur.
          </CardContent>
        </Card>
      )}

      {aggregated && (
        <>
          {/* KPI strip + view toggle */}
          <KPIStrip aggregated={aggregated} isGK={isGK} />
          <div className="flex items-center justify-end">
            <Tabs value={viewMode} onValueChange={v => setViewMode(v as 'synthese' | 'detaille')}>
              <TabsList className="h-8">
                <TabsTrigger value="synthese" className="text-xs h-7 gap-1.5"><Sparkles className="w-3 h-3" /> Synthèse</TabsTrigger>
                <TabsTrigger value="detaille" className="text-xs h-7 gap-1.5"><Activity className="w-3 h-3" /> Détaillé</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>

          {/* Radar (both modes) */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-2">
                <Activity className="w-4 h-4 text-violet-500" />
                Radar (percentile / 100)
                {benchmarkQ.data && benchmarkQ.data.sample_size > 0 && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    vs moyenne {benchmarkQ.data.position || 'poste'} (n={benchmarkQ.data.sample_size})
                  </span>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <RadarBlock isGK={isGK} aggregated={aggregated} benchmark={benchmarkQ.data ?? null} />
            </CardContent>
          </Card>

          {viewMode === 'synthese' && (
            <>
              {/* DNA / Profile detection */}
              {detection && detection.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-amber-500" /> ADN du joueur
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <DNAPanel detection={detection} insights={insights} />
                  </CardContent>
                </Card>
              )}

              {/* Similar players */}
              {(similarQ.isLoading || peersQ.isLoading) ? (
                <Card><CardContent className="py-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3 h-3 animate-spin" /> Recherche des joueurs similaires...
                </CardContent></Card>
              ) : similarList.length > 0 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Users className="w-4 h-4 text-indigo-500" /> Joueurs au profil similaire
                      <span className="text-[11px] font-normal text-muted-foreground">
                        {similarQ.data?.cohortSize ? `sur ${similarQ.data.cohortSize} joueurs au poste` : `sur ${peerRows.length} joueurs au poste`}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <SimilarPlayersList similar={similarList} />
                  </CardContent>
                </Card>
              )}

              {/* Percentile table */}
              {peerStatRowsForPercentile.length >= 3 && (
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-emerald-500" /> Percentiles par stat
                      <span className="text-[11px] font-normal text-muted-foreground">
                        vs {peerStatRowsForPercentile.length} joueurs au poste {playerPos}
                      </span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <PercentileTable aggregated={aggregated} peers={peerStatRowsForPercentile} isGK={isGK} />
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {viewMode === 'detaille' && (
            <>
              {/* Season evolution */}
              {rows.length >= 2 && (
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <LineChartIcon className="w-4 h-4 text-violet-500" /> Évolution par saison
                      </CardTitle>
                      <Select value={seasonChartStat as string} onValueChange={v => setSeasonChartStat(v as keyof WyscoutStatRow)}>
                        <SelectTrigger className="h-8 w-56 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {SEASON_CHART_STATS.map(s => (
                            <SelectItem key={s.key} value={s.key} className="text-xs">{s.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <SeasonEvolutionChart rows={rows} statKey={seasonChartStat} />
                  </CardContent>
                </Card>
              )}

              {/* Stat category tabs */}
              <Card>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-sm">Statistiques détaillées</CardTitle>
                    <Tabs value={statCat} onValueChange={v => setStatCat(v as 'all' | StatCat)}>
                      <TabsList className="h-8">
                        <TabsTrigger value="all" className="text-xs h-7">Tout</TabsTrigger>
                        {cats.map(c => <TabsTrigger key={c} value={c} className="text-xs h-7">{CAT_LABEL[c]}</TabsTrigger>)}
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {visibleCats.map(cat => (
                    <CategoryBlock
                      key={cat}
                      cat={cat}
                      aggregated={aggregated}
                      benchmark={benchmarkQ.data?.benchmark || null}
                      isGK={isGK}
                      collapsed={!!collapsed[cat]}
                      onToggle={() => setCollapsed(c => ({ ...c, [cat]: !c[cat] }))}
                    />
                  ))}
                </CardContent>
              </Card>
            </>
          )}
        </>
      )}

      {/* Seasons table */}
      {seasons.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Saisons enregistrées</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-3 py-2 font-medium">Saison</th>
                    <th className="text-left px-3 py-2 font-medium">Division</th>
                    <th className="text-left px-3 py-2 font-medium">Équipe</th>
                    <th className="text-right px-3 py-2 font-medium">Matchs</th>
                    <th className="text-right px-3 py-2 font-medium">Minutes</th>
                  </tr>
                </thead>
                <tbody>
                  {seasons.map((s, i) => (
                    <tr key={`${s.season}-${s.division}-${i}`} className="border-t">
                      <td className="px-3 py-2 font-medium">{s.season}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.division || '—'}</td>
                      <td className="px-3 py-2 text-muted-foreground">{s.team || '—'}</td>
                      <td className="px-3 py-2 text-right">{s.matches_played ?? '—'}</td>
                      <td className="px-3 py-2 text-right">{s.minutes_played ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Subcomponents ─────────────────────────────────────────────────────────

function IdentityGrid({ player }: { player: WyscoutPlayer }) {
  const rows: Array<[string, string | number | null]> = [
    ['Année de naissance', player.generation],
    ['Pied', player.foot],
    ['Nationalité', player.nationality],
    ['Passeport', player.passport_country],
    ['Taille (cm)', player.height],
    ['Poids (kg)', player.weight],
    ['Valeur marchande', player.market_value],
    ['Fin de contrat', player.contract_end],
    ['Équipe (saison)', player.team_in_timeframe],
  ];
  const filtered = rows.filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (!filtered.length) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 pt-2 text-sm">
      {filtered.map(([label, value]) => (
        <div key={label}>
          <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{label}</div>
          <div className="font-medium">{value}</div>
        </div>
      ))}
    </div>
  );
}

function FilterRow({ label, values, active, onToggle }: {
  label: string;
  values: string[];
  active: string[];
  onToggle: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[11px] uppercase tracking-wide text-muted-foreground w-20 shrink-0">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {values.map(v => {
          const on = active.includes(v);
          return (
            <button
              key={v}
              onClick={() => onToggle(v)}
              className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                on
                  ? 'bg-violet-500 text-white border-violet-500'
                  : 'bg-background hover:bg-muted border-border'
              }`}
            >
              {v}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RadarBlock({ isGK, aggregated, benchmark }: {
  isGK: boolean;
  aggregated: Record<string, unknown>;
  benchmark: Benchmark | null;
}) {
  const defs = isGK ? RADAR_GK : RADAR_FIELD;
  const data = defs.map(def => {
    const raw = wyscoutNum(aggregated, def.key);
    const benchRaw = benchmark?.benchmark?.[def.key];
    return {
      stat: def.label,
      Joueur: normalizeStat(raw, def),
      Moyenne: benchmark ? normalizeStat(typeof benchRaw === 'number' ? benchRaw : null, def) : 0,
      _playerRaw: raw,
      _benchRaw: typeof benchRaw === 'number' ? benchRaw : null,
    };
  });
  return (
    <div className="h-96 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} outerRadius="75%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis dataKey="stat" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
          {benchmark && (
            <Radar
              name={`Moyenne ${benchmark.position || 'poste'}`}
              dataKey="Moyenne"
              stroke="#94a3b8"
              fill="#94a3b8"
              fillOpacity={0.2}
            />
          )}
          <Radar
            name="Joueur"
            dataKey="Joueur"
            stroke="#8b5cf6"
            fill="#8b5cf6"
            fillOpacity={0.4}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
            formatter={(_v: number, name: string, ctx) => {
              const raw = name === 'Joueur' ? ctx.payload._playerRaw : ctx.payload._benchRaw;
              return raw === null || raw === undefined ? '—' : raw.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryBlock({ cat, aggregated, benchmark, isGK, collapsed, onToggle }: {
  cat: StatCat;
  aggregated: Record<string, unknown>;
  benchmark: Record<string, number | null> | null;
  isGK: boolean;
  collapsed: boolean;
  onToggle: () => void;
}) {
  const defs = STAT_CATALOG.filter(d => d.cat === cat && (isGK ? true : !d.gkOnly));
  const rows = defs.map(d => {
    const raw = wyscoutNum(aggregated, d.db as string);
    const bench = benchmark?.[d.db as string] ?? null;
    let delta: number | null = null;
    if (raw !== null && bench !== null && bench !== 0) {
      delta = Math.round(((raw - bench) / Math.abs(bench)) * 100);
    }
    return { def: d, raw, bench, delta };
  }).filter(r => r.raw !== null || r.bench !== null);

  if (!rows.length) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 bg-muted/40 hover:bg-muted/60 transition-colors"
      >
        <span className="text-xs font-semibold uppercase tracking-wide">{CAT_LABEL[cat]}</span>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{rows.length} stats</span>
          {collapsed ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronUp className="w-4 h-4 text-muted-foreground" />}
        </div>
      </button>
      {!collapsed && (
        <table className="w-full text-sm">
          <thead className="bg-muted/20">
            <tr className="text-[10px] uppercase tracking-wide text-muted-foreground">
              <th className="text-left px-3 py-1.5 font-medium">Stat</th>
              <th className="text-right px-3 py-1.5 font-medium">Joueur</th>
              <th className="text-right px-3 py-1.5 font-medium hidden sm:table-cell">Moyenne poste</th>
              <th className="text-right px-3 py-1.5 font-medium hidden md:table-cell">Δ vs poste</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ def, raw, bench, delta }) => (
              <tr key={def.db as string} className="border-t">
                <td className="px-3 py-1.5">{def.label}</td>
                <td className="px-3 py-1.5 text-right font-medium">{fmt(raw, def.unit)}</td>
                <td className="px-3 py-1.5 text-right text-muted-foreground hidden sm:table-cell">{fmt(bench, def.unit)}</td>
                <td className={`px-3 py-1.5 text-right hidden md:table-cell ${
                  delta === null ? 'text-muted-foreground'
                  : delta > 5 ? 'text-emerald-600 dark:text-emerald-400'
                  : delta < -5 ? 'text-red-600 dark:text-red-400'
                  : 'text-muted-foreground'
                }`}>
                  {delta === null ? '—' : (delta > 0 ? '+' : '') + delta + '%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── KPI strip ─────────────────────────────────────────────────────────────
function KPIStrip({ aggregated, isGK }: { aggregated: Record<string, unknown>; isGK: boolean }) {
  const kpis = isGK
    ? [
      { key: 'matches_played', label: 'Matchs', unit: '' },
      { key: 'minutes_played', label: 'Minutes', unit: '' },
      { key: 'clean_sheets', label: 'Clean sheets', unit: '' },
      { key: 'save_rate_pct', label: '% Arrêts', unit: '%' },
      { key: 'conceded_goals_per90', label: 'Buts enc./90', unit: '' },
      { key: 'prevented_goals', label: 'Buts prévenus', unit: '' },
    ]
    : [
      { key: 'matches_played', label: 'Matchs', unit: '' },
      { key: 'minutes_played', label: 'Minutes', unit: '' },
      { key: 'goals', label: 'Buts', unit: '' },
      { key: 'assists', label: 'Assists', unit: '' },
      { key: 'xg', label: 'xG', unit: '' },
      { key: 'xa', label: 'xA', unit: '' },
    ];
  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
      {kpis.map(k => {
        const v = wyscoutNum(aggregated, k.key);
        return (
          <Card key={k.key}>
            <CardContent className="py-3 px-3 text-center">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{k.label}</div>
              <div className="text-lg font-bold">{fmt(v, k.unit)}</div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// ── DNA panel ─────────────────────────────────────────────────────────────
function DNAPanel({ detection, insights }: {
  detection: RoleResult[];
  insights: Insight[];
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Profils détectés</div>
        <div className="space-y-1.5">
          {detection.slice(0, 3).map(d => {
            const pct = Math.round(d.score);
            return (
              <div key={d.key} className="flex items-center gap-3">
                <div className="text-sm font-medium w-40 shrink-0 truncate">{d.label}</div>
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className={`h-full ${pct >= 70 ? 'bg-emerald-500' : pct >= 50 ? 'bg-lime-500' : pct >= 30 ? 'bg-amber-500' : 'bg-muted-foreground/40'}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="text-xs font-semibold w-12 text-right tabular-nums">
                  {pct}%
                  <span className="text-[9px] text-muted-foreground ml-1 hidden sm:inline">{d.confidence}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {insights.length > 0 && (
        <div className="space-y-1">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Points-clés</div>
          <ul className="space-y-1 text-sm">
            {insights.slice(0, 6).map((it, i) => {
              const positive = it.kind === 'strength' || it.kind === 'trend-up';
              const negative = it.kind === 'weakness' || it.kind === 'trend-down';
              const valueStr = typeof it.value === 'number'
                ? (it.value.toLocaleString('fr-FR', { maximumFractionDigits: 2 }) + (it.unit ? ` ${it.unit}` : ''))
                : String(it.value);
              return (
                <li key={i} className={`flex items-start gap-2 ${
                  positive ? 'text-emerald-700 dark:text-emerald-400'
                  : negative ? 'text-red-700 dark:text-red-400'
                  : 'text-foreground'
                }`}>
                  <span className="text-base leading-none mt-0.5">
                    {positive ? '↑' : negative ? '↓' : '·'}
                  </span>
                  <span><strong className="font-medium">{it.label}</strong> · {valueStr}{it.delta ? ` (Δ ${it.delta > 0 ? '+' : ''}${it.delta})` : ''}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ── Similar players list ──────────────────────────────────────────────────
function SimilarPlayersList({ similar }: {
  similar: { player_id: string; name: string; position: string | null; club: string | null; similarity: number }[];
}) {
  return (
    <ul className="space-y-1.5">
      {similar.map(s => {
        const pct = Math.max(0, Math.min(100, Math.round(s.similarity)));
        return (
          <li key={s.player_id} className="flex items-center gap-3 group">
            <Link
              to={`/data/player/${s.player_id}`}
              className="flex-1 flex items-center gap-2 min-w-0 hover:underline"
            >
              <span className="text-sm font-medium truncate">{s.name}</span>
              <Badge variant="outline" className="text-[10px]">{s.position || '—'}</Badge>
              <span className="text-xs text-muted-foreground truncate">{s.club || ''}</span>
            </Link>
            <div className="w-24 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full ${pct >= 80 ? 'bg-emerald-500' : pct >= 60 ? 'bg-lime-500' : 'bg-amber-500'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="text-xs font-semibold w-10 text-right tabular-nums">{pct}%</div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Percentile table ──────────────────────────────────────────────────────
const PERCENTILE_STATS_FIELD: Array<{ key: keyof WyscoutStatRow; label: string }> = [
  { key: 'goals_per90', label: 'Buts/90' },
  { key: 'xg_per90', label: 'xG/90' },
  { key: 'assists_per90', label: 'Assists/90' },
  { key: 'xa_per90', label: 'xA/90' },
  { key: 'shots_per90', label: 'Tirs/90' },
  { key: 'key_passes_per90', label: 'Passes clés/90' },
  { key: 'passes_accurate_pct', label: '% Passes' },
  { key: 'progressive_passes_per90', label: 'Passes prog./90' },
  { key: 'dribbles_per90', label: 'Dribbles/90' },
  { key: 'dribbles_success_pct', label: '% Dribbles' },
  { key: 'touches_in_box_per90', label: 'Touches surface/90' },
  { key: 'defensive_duels_won_pct', label: '% Duels déf.' },
  { key: 'aerial_duels_won_pct', label: '% Duels aér.' },
  { key: 'interceptions_per90', label: 'Interceptions/90' },
  { key: 'sliding_tackles_per90', label: 'Tacles glissés/90' },
];
const PERCENTILE_STATS_GK: Array<{ key: keyof WyscoutStatRow; label: string }> = [
  { key: 'save_rate_pct', label: '% Arrêts' },
  { key: 'conceded_goals_per90', label: 'Buts encaissés/90' },
  { key: 'prevented_goals_per90', label: 'Buts prévenus/90' },
  { key: 'clean_sheets', label: 'Clean sheets' },
  { key: 'gk_exits_per90', label: 'Sorties/90' },
  { key: 'gk_aerial_duels_per90', label: 'Duels aér./90' },
  { key: 'passes_accurate_pct', label: '% Passes' },
  { key: 'long_passes_accurate_pct', label: '% Longues passes' },
];
function PercentileTable({ aggregated, peers, isGK }: {
  aggregated: WyscoutStatRow | Record<string, unknown>;
  peers: WyscoutStatRow[];
  isGK: boolean;
}) {
  const defs = isGK ? PERCENTILE_STATS_GK : PERCENTILE_STATS_FIELD;
  const rows = defs.map(d => {
    const raw = wyscoutNum(aggregated as Record<string, unknown>, d.key as string);
    const pct = raw !== null ? statPercentile(aggregated as WyscoutStatRow, d.key, peers) : null;
    return { def: d, raw, pct };
  }).filter(r => r.raw !== null);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
      {rows.map(({ def, raw, pct }) => {
        const p = pct === null ? 0 : Math.max(0, Math.min(100, Math.round(pct)));
        const color = pct === null ? 'bg-muted-foreground/40'
          : p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-lime-500' : p >= 40 ? 'bg-amber-500' : p >= 20 ? 'bg-orange-500' : 'bg-red-500';
        return (
          <div key={def.key as string} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/30">
            <div className="text-xs flex-1 truncate">{def.label}</div>
            <div className="text-xs font-medium text-muted-foreground w-14 text-right tabular-nums">{fmt(raw)}</div>
            <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
              <div className={`h-full ${color}`} style={{ width: pct === null ? '0%' : `${p}%` }} />
            </div>
            <div className="text-xs font-semibold w-9 text-right tabular-nums">{pct === null ? '—' : p}</div>
          </div>
        );
      })}
    </div>
  );
}

// ── Season evolution chart ────────────────────────────────────────────────
const SEASON_CHART_STATS: Array<{ key: keyof WyscoutStatRow; label: string }> = [
  { key: 'goals', label: 'Buts (total)' },
  { key: 'goals_per90', label: 'Buts /90' },
  { key: 'xg_per90', label: 'xG /90' },
  { key: 'assists', label: 'Assists (total)' },
  { key: 'assists_per90', label: 'Assists /90' },
  { key: 'xa_per90', label: 'xA /90' },
  { key: 'shots_per90', label: 'Tirs /90' },
  { key: 'passes_accurate_pct', label: '% Passes' },
  { key: 'key_passes_per90', label: 'Passes clés /90' },
  { key: 'dribbles_per90', label: 'Dribbles /90' },
  { key: 'progressive_runs_per90', label: 'Courses prog. /90' },
  { key: 'defensive_duels_won_pct', label: '% Duels déf.' },
  { key: 'aerial_duels_won_pct', label: '% Duels aér.' },
  { key: 'interceptions_per90', label: 'Interceptions /90' },
  { key: 'minutes_played', label: 'Minutes' },
  { key: 'matches_played', label: 'Matchs' },
  { key: 'save_rate_pct', label: '% Arrêts (GK)' },
  { key: 'clean_sheets', label: 'Clean sheets (GK)' },
];
function SeasonEvolutionChart({ rows, statKey }: { rows: WyscoutStatRow[]; statKey: keyof WyscoutStatRow }) {
  // rows arrive newest-first; reverse for chronological X axis.
  const data = rows.slice().reverse().map(r => ({
    label: `${r.season || '—'}${r.division ? ` ${r.division}` : ''}${r.team ? ` (${r.team})` : ''}`,
    value: wyscoutNum(r as unknown as Record<string, unknown>, statKey as string),
  }));
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 10, right: 10, bottom: 30, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
            interval={0}
            angle={-15}
            textAnchor="end"
            height={50}
          />
          <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
          <Tooltip
            contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', fontSize: 11 }}
          />
          <Line
            type="monotone"
            dataKey="value"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 4, fill: '#8b5cf6' }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
