import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, Tooltip as RechartsTooltip,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Activity, TrendingUp, TrendingDown, RefreshCw, Database, ChevronDown, ChevronUp,
  Sparkles, Layers, Filter, X, Users, Star, AlertTriangle, ArrowRight, BarChart3,
  GitCompareArrows,
} from 'lucide-react';
import { ALL_OPINIONS, type Player, type Report } from '@/types/player';
import { useWyscoutStats, useAllWyscoutSummaries, type WyscoutStatRow } from '@/hooks/use-wyscout-stats';
import {
  aggregateWyscoutRows, filterWyscoutRows, extractFilterOptions, EMPTY_FILTERS,
  type WyscoutFilters,
} from '@/lib/wyscout-aggregate';
import {
  detectRole, interpretRoles, computeInsights, findSimilarPlayers, statPercentile, statScore, isInvertedStat, ROLE_PROFILES,
  type SimilarPlayer, type RoleTemplate,
} from '@/lib/wyscout-analysis';
import { suggestBenchmarkGroups, type BenchmarkGroup } from '@/lib/wyscout-benchmarks';
import { loadCustomProfiles } from '@/lib/wyscout-custom-profiles';
import CustomProfileEditor from './CustomProfileEditor';

const MIN_SAMPLE_MINUTES = 600;

// Reuse the same encoding format as PlayerCompare page
function buildCompareHash(playerIds: string[]): string {
  const COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#ef4444', '#f97316'];
  const payload = {
    entries: playerIds.map((pid, i) => ({
      kind: 'player' as const,
      playerId: pid,
      rowId: '',
      color: COLORS[i % COLORS.length],
      minutesMin: 0,
    })),
    stats: [
      'goals_per90', 'xg_per90', 'shots_per90', 'key_passes_per90',
      'progressive_passes_per90', 'dribbles_success_pct', 'passes_accurate_pct',
      'interceptions_per90', 'defensive_duels_won_pct', 'aerial_duels_won_pct',
    ],
    chartMode: 'radar',
    scatterX: 'xg_per90',
    scatterY: 'xa_per90',
    highlightWinner: true,
    heatmap: false,
  };
  try { return btoa(unescape(encodeURIComponent(JSON.stringify(payload)))); }
  catch { return ''; }
}

interface ProfileDataTabProps {
  player: Player;
  allPlayers: Player[];
  reports: Report[];
  perfScores: { physical: number; technical: number; tactical: number; mental: number };
  updatePerfScore: (key: 'physical' | 'technical' | 'tactical' | 'mental', value: number) => void;
  enriching: boolean;
  handleEnrich: (tmUrl?: string) => void;
  isPremium: boolean;
  isAdmin: boolean;
}

type ViewMode = 'synthese' | 'detaille';
type StatCat = 'attack' | 'passing' | 'defending' | 'physical' | 'gk';
interface StatDef {
  db: keyof WyscoutStatRow;
  label: string;
  cat: StatCat;
  unit?: string;
  gkOnly?: boolean;
}

const wyscoutNum = (row: WyscoutStatRow | undefined | null, key: keyof WyscoutStatRow): number | null => {
  if (!row) return null;
  const v = row[key];
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return isNaN(n) ? null : n;
};

const fmt = (v: number | null | undefined, unit?: string) => {
  if (v === null || v === undefined) return '—';
  const n = typeof v === 'string' ? parseFloat(v) : v;
  if (isNaN(n)) return '—';
  const str = Number.isInteger(n) ? String(n) : Math.round(n * 100) / 100;
  return unit ? `${str}${unit === '%' ? unit : ` ${unit}`}` : String(str);
};

const pctColor = (p: number) =>
  p >= 80 ? 'bg-emerald-500' : p >= 60 ? 'bg-lime-500' : p >= 40 ? 'bg-amber-500' : p >= 20 ? 'bg-orange-500' : 'bg-red-500';
const pctText = (p: number) =>
  p >= 80 ? 'text-emerald-600 dark:text-emerald-400'
  : p >= 60 ? 'text-lime-600 dark:text-lime-400'
  : p >= 40 ? 'text-amber-600 dark:text-amber-400'
  : p >= 20 ? 'text-orange-600 dark:text-orange-400'
  : 'text-red-600 dark:text-red-400';

export default function ProfileDataTab({
  player, allPlayers, reports,
  enriching, handleEnrich, isPremium,
}: ProfileDataTabProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'es' ? 'es-ES' : i18n.language === 'en' ? 'en-GB' : 'fr-FR';

  // ── Persisted state ───────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem('wyscout-data-view');
      return v === 'detaille' ? 'detaille' : 'synthese';
    }
    catch { return 'synthese'; }
  });
  useEffect(() => { try { localStorage.setItem('wyscout-data-view', viewMode); } catch { /* noop */ } }, [viewMode]);

  const filterKey = `wyscout-data-filters:${player.id}`;
  const [filters, setFilters] = useState<WyscoutFilters>(() => {
    try { return JSON.parse(localStorage.getItem(filterKey) || JSON.stringify(EMPTY_FILTERS)); }
    catch { return EMPTY_FILTERS; }
  });
  useEffect(() => { try { localStorage.setItem(filterKey, JSON.stringify(filters)); } catch { /* noop */ } }, [filterKey, filters]);

  // ── Other UI state ────────────────────────────────────────────────────
  const [statsFilter, setStatsFilter] = useState<'all' | 'attack' | 'passing' | 'defending' | 'physical' | 'gk'>('all');
  const [seasonChartStat, setSeasonChartStat] = useState<keyof WyscoutStatRow>('goals');
  const [wyscoutExpandedCats, setWyscoutExpandedCats] = useState<Record<string, boolean>>({});

  // ── Data hooks ────────────────────────────────────────────────────────
  const { data: wyscoutRows = [], isLoading: wyscoutLoading } = useWyscoutStats(player.id);
  const { data: peerSummaries = [] } = useAllWyscoutSummaries();

  const isGK = player.position === 'GK';

  // ── Filtering & aggregation ───────────────────────────────────────────
  const filterOptions = useMemo(() => extractFilterOptions(wyscoutRows), [wyscoutRows]);
  const filteredRows = useMemo(() => filterWyscoutRows(wyscoutRows, filters), [wyscoutRows, filters]);
  const aggregated = useMemo(() => aggregateWyscoutRows(filteredRows), [filteredRows]);
  const filterActive = filters.seasons.length + filters.clubs.length + filters.divisions.length > 0;

  const hasWyscout = !!aggregated;
  const sampleMinutes = wyscoutNum(aggregated, 'minutes_played') ?? 0;
  const lowSample = hasWyscout && sampleMinutes < MIN_SAMPLE_MINUTES;

  // Trend: latest 2 rows chronologically (ignore filters for clarity)
  const prevSeasonRow: WyscoutStatRow | null = wyscoutRows.length >= 2 ? wyscoutRows[1] : null;

  // ── Stat catalog ──────────────────────────────────────────────────────
  const STAT_CATALOG: StatDef[] = useMemo(() => [
    { db: 'goals', label: t('wyscout.goals'), cat: 'attack' },
    { db: 'assists', label: t('wyscout.assists'), cat: 'attack' },
    { db: 'shots', label: t('wyscout.shots'), cat: 'attack' },
    { db: 'xg', label: 'xG', cat: 'attack' },
    { db: 'xa', label: 'xA', cat: 'attack' },
    { db: 'np_goals', label: t('wyscout.np_goals'), cat: 'attack' },
    { db: 'head_goals', label: t('wyscout.head_goals'), cat: 'attack' },
    { db: 'goals_per90', label: t('wyscout.goals_per90'), cat: 'attack' },
    { db: 'np_goals_per90', label: t('wyscout.np_goals_per90'), cat: 'attack' },
    { db: 'xg_per90', label: 'xG /90', cat: 'attack' },
    { db: 'assists_per90', label: t('wyscout.assists_per90'), cat: 'attack' },
    { db: 'xa_per90', label: 'xA /90', cat: 'attack' },
    { db: 'shots_per90', label: t('wyscout.shots_per90'), cat: 'attack' },
    { db: 'shots_on_target_pct', label: t('wyscout.shots_on_target_pct'), cat: 'attack', unit: '%' },
    { db: 'goal_conversion_pct', label: t('wyscout.goal_conversion_pct'), cat: 'attack', unit: '%' },
    { db: 'attacking_actions_per90', label: t('wyscout.attacking_actions_per90'), cat: 'attack' },
    { db: 'dribbles_per90', label: t('wyscout.dribbles_per90'), cat: 'attack' },
    { db: 'dribbles_success_pct', label: t('wyscout.dribbles_success_pct'), cat: 'attack', unit: '%' },
    { db: 'touches_in_box_per90', label: t('wyscout.touches_in_box_per90'), cat: 'attack' },
    { db: 'progressive_runs_per90', label: t('wyscout.progressive_runs_per90'), cat: 'attack' },
    { db: 'crosses_per90', label: t('wyscout.crosses_per90'), cat: 'attack' },
    { db: 'crosses_accurate_pct', label: t('wyscout.crosses_accurate_pct'), cat: 'attack', unit: '%' },
    { db: 'passes_per90', label: t('wyscout.passes_per90'), cat: 'passing' },
    { db: 'passes_accurate_pct', label: t('wyscout.passes_accurate_pct'), cat: 'passing', unit: '%' },
    { db: 'key_passes_per90', label: t('wyscout.key_passes_per90'), cat: 'passing' },
    { db: 'smart_passes_per90', label: t('wyscout.smart_passes_per90'), cat: 'passing' },
    { db: 'forward_passes_per90', label: t('wyscout.forward_passes_per90'), cat: 'passing' },
    { db: 'long_passes_per90', label: t('wyscout.long_passes_per90'), cat: 'passing' },
    { db: 'long_passes_accurate_pct', label: t('wyscout.long_passes_accurate_pct'), cat: 'passing', unit: '%' },
    { db: 'progressive_passes_per90', label: t('wyscout.progressive_passes_per90'), cat: 'passing' },
    { db: 'passes_final_third_per90', label: t('wyscout.passes_final_third_per90'), cat: 'passing' },
    { db: 'through_passes_per90', label: t('wyscout.through_passes_per90'), cat: 'passing' },
    { db: 'deep_completions_per90', label: t('wyscout.deep_completions_per90'), cat: 'passing' },
    { db: 'defensive_actions_per90', label: t('wyscout.defensive_actions_per90'), cat: 'defending' },
    { db: 'defensive_duels_per90', label: t('wyscout.defensive_duels_per90'), cat: 'defending' },
    { db: 'defensive_duels_won_pct', label: t('wyscout.defensive_duels_won_pct'), cat: 'defending', unit: '%' },
    { db: 'interceptions_per90', label: t('wyscout.interceptions_per90'), cat: 'defending' },
    { db: 'padj_interceptions', label: 'PAdj Interc.', cat: 'defending' },
    { db: 'sliding_tackles_per90', label: t('wyscout.sliding_tackles_per90'), cat: 'defending' },
    { db: 'padj_sliding_tackles', label: 'PAdj Tackles', cat: 'defending' },
    { db: 'shots_blocked_per90', label: t('wyscout.shots_blocked_per90'), cat: 'defending' },
    { db: 'aerial_duels_per90', label: t('wyscout.aerial_duels_per90'), cat: 'defending' },
    { db: 'aerial_duels_won_pct', label: t('wyscout.aerial_duels_won_pct'), cat: 'defending', unit: '%' },
    { db: 'duels_per90', label: t('wyscout.duels_per90'), cat: 'defending' },
    { db: 'duels_won_pct', label: t('wyscout.duels_won_pct'), cat: 'defending', unit: '%' },
    { db: 'total_distance_per90', label: t('wyscout.total_distance_per90'), cat: 'physical', unit: 'm' },
    { db: 'sprint_distance_per90', label: t('wyscout.sprint_distance_per90'), cat: 'physical', unit: 'm' },
    { db: 'hi_distance_per90', label: t('wyscout.hi_distance_per90'), cat: 'physical', unit: 'm' },
    { db: 'max_speed', label: t('wyscout.max_speed'), cat: 'physical', unit: 'km/h' },
    { db: 'meters_per_min', label: t('wyscout.meters_per_min'), cat: 'physical', unit: 'm/min' },
    { db: 'high_accel_per90', label: t('wyscout.high_accel_per90'), cat: 'physical' },
    { db: 'sprint_count_per90', label: t('wyscout.sprint_count_per90'), cat: 'physical' },
    { db: 'fouls_per90', label: t('wyscout.fouls_per90'), cat: 'physical' },
    { db: 'fouls_suffered_per90', label: t('wyscout.fouls_suffered_per90'), cat: 'physical' },
    { db: 'clean_sheets', label: t('wyscout.clean_sheets'), cat: 'gk', gkOnly: true },
    { db: 'conceded_goals_per90', label: t('wyscout.conceded_goals_per90'), cat: 'gk', gkOnly: true },
    { db: 'save_rate_pct', label: t('wyscout.save_rate_pct'), cat: 'gk', unit: '%', gkOnly: true },
    { db: 'prevented_goals', label: t('wyscout.prevented_goals'), cat: 'gk', gkOnly: true },
    { db: 'prevented_goals_per90', label: t('wyscout.prevented_goals_per90'), cat: 'gk', gkOnly: true },
    { db: 'gk_exits_per90', label: t('wyscout.gk_exits_per90'), cat: 'gk', gkOnly: true },
    { db: 'gk_aerial_duels_per90', label: t('wyscout.gk_aerial_duels_per90'), cat: 'gk', gkOnly: true },
  ], [t]);

  type StatRow = StatDef & { raw: number | null };
  const allStatRows: StatRow[] = useMemo(() => {
    if (!aggregated) return [];
    return STAT_CATALOG
      .filter(d => (isGK ? d.cat === 'gk' || !d.gkOnly : !d.gkOnly))
      .map(d => ({ ...d, raw: wyscoutNum(aggregated, d.db) }))
      .filter(r => r.raw !== null);
  }, [STAT_CATALOG, aggregated, isGK]);

  // ── Peers (for percentile calculations + similar players) ─────────────
  const peerByPlayer = useMemo(() => new Map(peerSummaries.map(r => [r.player_id, r])), [peerSummaries]);
  const positionPeersRaw = allPlayers.filter(p => p.id !== player.id && p.position === player.position && peerByPlayer.has(p.id));

  // Filter peers by similar current_level (±2) when we have enough — keeps comparison apples-to-apples.
  // Falls back to all same-position peers if level filter is too aggressive.
  // Unrated players (level 0/NA) skip the filter entirely.
  const filteredPositionPeers = useMemo(() => {
    if (positionPeersRaw.length < 8) return positionPeersRaw;
    const myLevel = player.current_level;
    if (!myLevel || myLevel <= 0) return positionPeersRaw;
    const close = positionPeersRaw.filter(p => {
      const pl = p.current_level;
      if (!pl || pl <= 0) return false;
      return Math.abs(pl - myLevel) <= 2;
    });
    return close.length >= 5 ? close : positionPeersRaw;
  }, [positionPeersRaw, player.current_level]);

  const positionPeerRows = useMemo(
    () => filteredPositionPeers.map(p => peerByPlayer.get(p.id)!).filter(Boolean),
    [filteredPositionPeers, peerByPlayer],
  );

  // ── Custom profiles (user-defined, persist to localStorage) ────────────
  const [customProfiles, setCustomProfiles] = useState<RoleTemplate[]>(() => loadCustomProfiles());
  const [editorOpen, setEditorOpen] = useState(false);
  const allTemplates: RoleTemplate[] = useMemo(() => [...ROLE_PROFILES, ...customProfiles], [customProfiles]);

  // ── Benchmark group (data-driven comparison base) ─────────────────────
  // Suggestions adapt automatically as more WyScout data is imported.
  const benchmarkGroups: BenchmarkGroup[] = useMemo(
    () => suggestBenchmarkGroups(player, allPlayers, peerSummaries),
    [player, allPlayers, peerSummaries],
  );
  const [benchmarkGroupKey, setBenchmarkGroupKey] = useState<string>(() => {
    try { return localStorage.getItem('wyscout-benchmark-group') || ''; } catch { return ''; }
  });
  useEffect(() => {
    try {
      if (benchmarkGroupKey) localStorage.setItem('wyscout-benchmark-group', benchmarkGroupKey);
    } catch { /* noop */ }
  }, [benchmarkGroupKey]);

  const selectedGroup: BenchmarkGroup | null = useMemo(() => {
    if (benchmarkGroupKey && benchmarkGroups.some(g => g.key === benchmarkGroupKey)) {
      return benchmarkGroups.find(g => g.key === benchmarkGroupKey) || null;
    }
    // Default: broadest reliable group (first in list = same position)
    return benchmarkGroups[0] || null;
  }, [benchmarkGroupKey, benchmarkGroups]);

  // ── DNA / Insights / Similar players ──────────────────────────────────
  const detection = useMemo(() => {
    if (!aggregated) return null;
    const results = detectRole(aggregated, player.position, allTemplates);
    return interpretRoles(results);
  }, [aggregated, player.position, allTemplates]);

  const insights = useMemo(() => {
    if (!aggregated) return [];
    return computeInsights(aggregated, player.position, prevSeasonRow, selectedGroup?.rows);
  }, [aggregated, player.position, prevSeasonRow, selectedGroup]);

  const similarPlayers: SimilarPlayer[] = useMemo(() => {
    if (!aggregated) return [];
    const peers = positionPeersRaw
      .map(p => ({ playerId: p.id, row: peerByPlayer.get(p.id)! }))
      .filter(p => p.row);
    return findSimilarPlayers(aggregated, peers, isGK, 5);
  }, [aggregated, positionPeersRaw, peerByPlayer, isGK]);


  // ── Reports timeline data (for evolution chart + opinion distribution) ──
  const historyData = reports.slice().reverse().map((r, i) => ({
    date: new Date(r.report_date).toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
    level: player.current_level, potential: player.potential,
    opinion: r.opinion === 'À suivre' ? 8 : r.opinion === 'À revoir' ? 5 : 3,
    index: i + 1,
  }));

  // ── Season evolution data ─────────────────────────────────────────────
  const seasonChartData = wyscoutRows.slice().reverse().map(row => ({
    season: row.season + (row.team ? ` · ${row.team}` : ''),
    value: wyscoutNum(row, seasonChartStat) ?? 0,
  }));
  const seasonChartOptions: { value: keyof WyscoutStatRow; label: string }[] = [
    { value: 'goals', label: t('wyscout.goals') },
    { value: 'assists', label: t('wyscout.assists') },
    { value: 'matches_played', label: t('wyscout.matches_played') },
    { value: 'minutes_played', label: t('wyscout.minutes_played') },
    { value: 'goals_per90', label: t('wyscout.goals_per90') },
    { value: 'xg_per90', label: 'xG /90' },
    { value: 'assists_per90', label: t('wyscout.assists_per90') },
    { value: 'passes_accurate_pct', label: t('wyscout.passes_accurate_pct') },
  ];

  // ── KPI values ────────────────────────────────────────────────────────
  const kpis = aggregated ? [
    { label: t('wyscout.matches_played'), value: aggregated.matches_played ?? '—' },
    { label: t('wyscout.minutes_played'), value: aggregated.minutes_played != null ? aggregated.minutes_played.toLocaleString() : '—' },
    ...(isGK ? [
      { label: t('wyscout.clean_sheets'), value: aggregated.clean_sheets ?? '—' },
      { label: t('wyscout.save_rate_pct'), value: aggregated.save_rate_pct != null ? `${aggregated.save_rate_pct}%` : '—' },
    ] : [
      { label: t('wyscout.goals'), value: aggregated.goals ?? '—', sub: aggregated.xg != null ? `xG: ${aggregated.xg}` : null },
      { label: t('wyscout.assists'), value: aggregated.assists ?? '—', sub: aggregated.xa != null ? `xA: ${aggregated.xa}` : null },
    ]),
    { label: t('wyscout.passes_accurate_pct'), value: aggregated.passes_accurate_pct != null ? `${aggregated.passes_accurate_pct}%` : '—' },
    { label: t('wyscout.duels_won_pct'), value: aggregated.duels_won_pct != null ? `${aggregated.duels_won_pct}%` : '—' },
  ] : [];

  // ──────────────────────────────────────────────────────────────────────
  // RENDER
  // ──────────────────────────────────────────────────────────────────────
  if (!hasWyscout && !wyscoutLoading) {
    return (
      <Card className="card-warm">
        <CardContent className="p-5 text-center">
          <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">{t('profile.perf_no_data')}</p>
          <p className="text-xs text-muted-foreground/60 mt-1">{t('profile.perf_no_data_desc')}</p>
          {!player.external_data_fetched_at && isPremium && (
            <Button size="sm" variant="outline" className="rounded-xl mt-3" onClick={() => handleEnrich()} disabled={enriching}>
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${enriching ? 'animate-spin' : ''}`} />{t('profile.enrich')}
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  // ── Filter bar ────────────────────────────────────────────────────────
  // ── Benchmark comparison base selector ────────────────────────────────
  const BenchmarkSelector = () => {
    if (benchmarkGroups.length === 0) {
      return (
        <Card className="card-warm">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <Users className="w-3.5 h-3.5 shrink-0" />
              <span>
                <span className="font-semibold">{t('wyscout.benchmark_no_groups')}</span>
                {' — '}{t('wyscout.benchmark_fallback')}
              </span>
            </div>
          </CardContent>
        </Card>
      );
    }
    return (
      <Card className="card-warm">
        <CardContent className="p-3">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1.5 shrink-0">
              <Users className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('wyscout.benchmark_label')}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {benchmarkGroups.map(g => {
                const active = selectedGroup?.key === g.key;
                return (
                  <button key={g.key} onClick={() => setBenchmarkGroupKey(g.key)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${
                      active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
                    }`}
                    title={g.description}>
                    {g.label} <span className="opacity-60 ml-0.5">· {g.count}</span>
                  </button>
                );
              })}
            </div>
            {selectedGroup && (
              <span className="text-[10px] text-muted-foreground/60 ml-auto">{selectedGroup.description}</span>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  const FilterBar = () => {
    const toggleFilter = (kind: keyof WyscoutFilters, value: string) => {
      setFilters(prev => {
        const arr = prev[kind];
        const next = arr.includes(value) ? arr.filter(v => v !== value) : [...arr, value];
        return { ...prev, [kind]: next };
      });
    };
    const clearAll = () => setFilters(EMPTY_FILTERS);

    const renderChips = (kind: keyof WyscoutFilters, options: string[], emptyLabel: string) => (
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{emptyLabel}</span>
        {options.length === 0 ? (
          <span className="text-[10px] text-muted-foreground/40">—</span>
        ) : options.map(o => {
          const active = filters[kind].includes(o);
          return (
            <button key={o} onClick={() => toggleFilter(kind, o)}
              className={`px-2 py-0.5 rounded-full text-[10px] font-medium border transition-colors ${
                active ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'
              }`}>
              {o}
            </button>
          );
        })}
      </div>
    );

    return (
      <Card className="card-warm">
        <CardContent className="p-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-1 flex-wrap">
              <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <div className="flex flex-col gap-1.5 flex-1 min-w-[280px]">
                {renderChips('seasons', filterOptions.seasons, t('wyscout.filter_seasons'))}
                {renderChips('clubs', filterOptions.clubs, t('wyscout.filter_clubs'))}
                {renderChips('divisions', filterOptions.divisions, t('wyscout.filter_divisions'))}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {aggregated && (
                <Badge variant="secondary" className="text-[10px]">
                  {aggregated._rowCount > 1
                    ? t('wyscout.aggregated_rows', { count: aggregated._rowCount })
                    : (aggregated.season || '—')}
                </Badge>
              )}
              {filterActive && (
                <button onClick={clearAll} className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-1">
                  <X className="w-3 h-3" /> {t('wyscout.filter_clear')}
                </button>
              )}
            </div>
          </div>
          {lowSample && (
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-amber-600 dark:text-amber-400">
              <AlertTriangle className="w-3 h-3" />
              {t('wyscout.low_sample_warning', { minutes: sampleMinutes, threshold: MIN_SAMPLE_MINUTES })}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // ── View toggle ───────────────────────────────────────────────────────
  const ViewToggle = () => {
    const views: { key: ViewMode; label: string; icon: typeof Sparkles }[] = [
      { key: 'synthese', label: t('wyscout.view_synthese'), icon: Sparkles },
      { key: 'detaille', label: t('wyscout.view_detaille'), icon: Layers },
    ];
    return (
      <div className="flex rounded-lg border border-border overflow-hidden text-xs w-full sm:w-auto">
        {views.map(v => {
          const Icon = v.icon;
          const active = viewMode === v.key;
          return (
            <button key={v.key} onClick={() => setViewMode(v.key)}
              className={`flex-1 sm:flex-none px-3 py-2 font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'
              }`}>
              <Icon className="w-3.5 h-3.5" />
              <span>{v.label}</span>
            </button>
          );
        })}
      </div>
    );
  };

  // ── Header / KPI strip (shared across views) ──────────────────────────
  const HeaderCard = () => aggregated && (
    <Card className="card-warm">
      <CardContent className="p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold flex items-center gap-2">
              <Activity className="w-4 h-4" />{t('profile.perf_title')}
              {aggregated.season && (
                <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">
                  {aggregated.season}
                </span>
              )}
            </h3>
            {(aggregated.team || aggregated.division) && (
              <p className="text-xs text-muted-foreground mt-0.5">
                {aggregated.division || ''}{aggregated.team ? ` — ${aggregated.team}` : ''}
              </p>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
          {kpis.map((k, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-muted/40 text-center">
              <p className="text-2xl font-black">{k.value}</p>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {k.label}
                {('sub' in k && k.sub) ? <span className="text-muted-foreground/60 ml-1">({k.sub})</span> : null}
              </p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground/40 text-right mt-2">Source: Wyscout</p>
      </CardContent>
    </Card>
  );

  // ── DNA panel (Synthèse only) ─────────────────────────────────────────
  const DnaPanel = () => {
    if (!aggregated || !detection) return null;
    const { primary, secondary, isIndeterminate, isHybrid } = detection;
    const strengths = insights.filter(i => i.kind === 'strength');
    const weaknesses = insights.filter(i => i.kind === 'weakness');
    const trends = insights.filter(i => i.kind === 'trend-up' || i.kind === 'trend-down');

    let mainLabel: string;
    let labelHelp: string | null = null;
    let scoreToShow: number | null = null;
    if (!primary) {
      mainLabel = t('wyscout.dna_no_templates');
      labelHelp = t('wyscout.dna_no_templates_desc');
    } else if (isIndeterminate) {
      mainLabel = t('wyscout.dna_indeterminate');
      labelHelp = t('wyscout.dna_indeterminate_desc');
      scoreToShow = primary.score;
    } else if (isHybrid && secondary) {
      mainLabel = `${primary.label} / ${secondary.label}`;
      labelHelp = t('wyscout.dna_hybrid_desc', { score1: primary.score, score2: secondary.score });
      scoreToShow = primary.score;
    } else {
      mainLabel = primary.label;
      scoreToShow = primary.score;
      labelHelp = secondary && secondary.score >= 50
        ? t('wyscout.dna_secondary_inline', { label: secondary.label, score: secondary.score })
        : null;
    }

    const confidenceLabel = (c: 'strong' | 'good' | 'fair' | 'weak') => {
      if (c === 'strong') return t('wyscout.dna_conf_strong');
      if (c === 'good') return t('wyscout.dna_conf_good');
      if (c === 'fair') return t('wyscout.dna_conf_fair');
      return t('wyscout.dna_conf_weak');
    };

    return (
      <Card className="card-warm bg-gradient-to-br from-primary/5 via-transparent to-blue-500/5 border-primary/20">
        <CardContent className="p-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Role */}
            <div>
              <div className="flex items-center justify-between gap-1.5 mb-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                  <Sparkles className="w-3 h-3" />{t('wyscout.dna_role_title')}
                </div>
                {primary && !isIndeterminate && (
                  <Badge variant="outline" className="text-[9px] font-semibold uppercase">
                    {confidenceLabel(primary.confidence)}
                  </Badge>
                )}
              </div>
              <p className={`text-2xl font-black leading-tight ${(isIndeterminate || !primary) ? 'text-muted-foreground' : ''}`}>{mainLabel}</p>
              {scoreToShow !== null && (
                <div className="flex items-center gap-2 mt-1">
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div className={`h-full ${pctColor(scoreToShow)}`} style={{ width: `${scoreToShow}%` }} />
                  </div>
                  <span className={`text-[10px] font-bold ${pctText(scoreToShow)}`}>{scoreToShow}%</span>
                </div>
              )}
              {labelHelp && (
                <p className="text-[11px] text-muted-foreground mt-2">{labelHelp}</p>
              )}
              {primary && primary.signature.length > 0 && !isIndeterminate && (
                <details className="mt-2">
                  <summary className="text-[10px] text-muted-foreground/70 cursor-pointer hover:text-muted-foreground">
                    {t('wyscout.dna_stats_used', { valid: primary.validStats, total: primary.totalStats })}
                    {primary.isCustom && <span className="ml-1 text-primary font-semibold">· {t('wyscout.dna_custom_badge')}</span>}
                  </summary>
                  <div className="mt-1.5 space-y-1">
                    {primary.signature.slice(0, 6).map(s => {
                      const def = STAT_CATALOG.find(d => d.db === s.db);
                      const label = def?.label || String(s.db);
                      const unit = def?.unit;
                      const matchPct = Math.round(s.match * 100);
                      const matchColor = matchPct >= 75 ? 'text-emerald-600 dark:text-emerald-400' : matchPct >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';
                      const fmtNum = (n: number) => Number.isInteger(n) ? n : Math.round(n * 100) / 100;
                      const lessIsBetter = s.goodValue < s.poorValue;
                      return (
                        <div key={s.db as string} className="text-[10px] flex items-center justify-between gap-2">
                          <span className="text-muted-foreground truncate flex items-center gap-1" title={label}>
                            {s.weight >= 2 && <Star className="w-2.5 h-2.5 text-amber-500 shrink-0" />}
                            <span className="truncate">{label}</span>
                          </span>
                          <span className="tabular-nums shrink-0 font-mono text-[9px]">
                            <span className="text-foreground font-semibold">{fmtNum(s.value)}{unit === '%' ? '%' : ''}</span>
                            <span className="text-muted-foreground/40 mx-1">{lessIsBetter ? '↓' : '↑'}</span>
                            <span className="text-muted-foreground/70">{fmtNum(s.goodValue)}{unit === '%' ? '%' : ''}</span>
                            <span className={`ml-1 font-bold ${matchColor}`}>{matchPct}%</span>
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </details>
              )}
              <p className="text-[10px] text-muted-foreground/60 mt-2">
                {player.position} · {sampleMinutes.toLocaleString()} {t('wyscout.minutes')} · {aggregated.matches_played ?? 0} {t('wyscout.matches')}
              </p>
            </div>

            {/* Strengths */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-emerald-600 dark:text-emerald-400 font-semibold">
                  <Star className="w-3 h-3" />{t('wyscout.dna_strengths')}
                </div>
                <span className="text-[9px] text-muted-foreground/70 truncate ml-2" title={selectedGroup?.description}>
                  {strengths[0]?.mode === 'relative' && selectedGroup
                    ? t('wyscout.vs_group_label', { count: selectedGroup.count })
                    : t('wyscout.vs_standards')}
                </span>
              </div>
              {strengths.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">{t('wyscout.dna_no_strengths')}</p>
              ) : (
                <div className="space-y-1.5">
                  {strengths.map((s, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium capitalize truncate flex-1 min-w-0" title={s.label}>{s.label}</span>
                        <span className="tabular-nums shrink-0 font-mono text-[10px] text-foreground font-semibold">
                          {fmt(s.value, s.unit)}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ${pctText(s.score ?? 0)}`}>
                          {s.mode === 'relative'
                            ? t('wyscout.top_pct', { pct: 100 - (s.score ?? 0) })
                            : t(`wyscout.tier_${s.tier ?? 'good'}`)}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                        <div className={`h-full ${pctColor(s.score ?? 0)}`} style={{ width: `${s.score ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Weaknesses */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-amber-600 dark:text-amber-400 font-semibold">
                  <AlertTriangle className="w-3 h-3" />{t('wyscout.dna_weaknesses')}
                </div>
                <span className="text-[9px] text-muted-foreground/70 truncate ml-2" title={selectedGroup?.description}>
                  {weaknesses[0]?.mode === 'relative' && selectedGroup
                    ? t('wyscout.vs_group_label', { count: selectedGroup.count })
                    : t('wyscout.vs_standards')}
                </span>
              </div>
              {weaknesses.length === 0 ? (
                <p className="text-xs text-muted-foreground/60">{t('wyscout.dna_no_weaknesses')}</p>
              ) : (
                <div className="space-y-1.5">
                  {weaknesses.map((w, i) => (
                    <div key={i} className="text-xs">
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-medium capitalize truncate flex-1 min-w-0" title={w.label}>{w.label}</span>
                        <span className="tabular-nums shrink-0 font-mono text-[10px] text-foreground font-semibold">
                          {fmt(w.value, w.unit)}
                        </span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider shrink-0 ${pctText(w.score ?? 0)}`}>
                          {w.mode === 'relative'
                            ? t('wyscout.bottom_pct', { pct: w.score ?? 0 })
                            : t(`wyscout.tier_${w.tier ?? 'weak'}`)}
                        </span>
                      </div>
                      <div className="h-1 rounded-full bg-muted overflow-hidden mt-0.5">
                        <div className={`h-full ${pctColor(w.score ?? 0)}`} style={{ width: `${w.score ?? 0}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {trends.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border/50">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
                <TrendingUp className="w-3 h-3" />{t('wyscout.dna_trends')}
              </div>
              <div className="flex flex-wrap gap-2">
                {trends.map((tr, i) => {
                  const up = tr.kind === 'trend-up';
                  const Icon = up ? TrendingUp : TrendingDown;
                  const color = up ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/10' : 'text-red-600 dark:text-red-400 bg-red-500/10';
                  return (
                    <span key={i} className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-semibold ${color}`}>
                      <Icon className="w-3 h-3" />
                      {tr.label}: {up ? '+' : ''}{tr.delta}%
                    </span>
                  );
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // ── Simplified auto-radar (Synthèse) ──────────────────────────────────
  const AutoRadar = () => {
    if (!aggregated || !detection?.primary) return null;
    const profile = allTemplates.find(p => p.key === detection.primary!.key);
    if (!profile) return null;

    // Use the role template's positive-target stats; score each absolutely
    // against the template's own thresholds — no peers required.
    const data = profile.template
      .filter(t => t.goodValue >= t.poorValue)
      .map(target => {
        const v = wyscoutNum(aggregated, target.db);
        if (v === null) return null;
        const score = Math.round(statScore(v, target) * 100);
        const def = STAT_CATALOG.find(s => s.db === target.db);
        return {
          axis: def?.label || String(target.db),
          value: score,
          raw: v,
          unit: def?.unit,
          goodValue: target.goodValue,
        };
      })
      .filter(Boolean) as { axis: string; value: number; raw: number; unit?: string; goodValue: number }[];

    if (data.length < 3) return null;

    return (
      <Card className="card-warm">
        <CardContent className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('wyscout.auto_radar_title')}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">{t('wyscout.auto_radar_desc_v2', { role: detection.primary.label })}</p>
            </div>
            <Badge variant="outline" className="text-[10px]">{t('wyscout.absolute_score')}</Badge>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
              <PolarGrid stroke="hsl(var(--border))" />
              <PolarAngleAxis dataKey="axis" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
              <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
              <Radar name={player.name} dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.25} strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(var(--primary))' }} />
              <RechartsTooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                formatter={(_v, _n, p) => {
                  const item = p?.payload as { raw?: number; unit?: string; value?: number; goodValue?: number };
                  const tgt = item?.goodValue != null ? ` · ${t('wyscout.target')}: ${fmt(item.goodValue, item.unit)}` : '';
                  return [`${fmt(item?.raw, item?.unit)}${tgt}`, `${t('wyscout.score')}: ${item?.value}/100`];
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
          <p className="text-[10px] text-muted-foreground/60 mt-2 text-center">
            {t('wyscout.absolute_score_help')}
          </p>
        </CardContent>
      </Card>
    );
  };

  // ── Similar players panel ─────────────────────────────────────────────
  const SimilarPlayersPanel = () => {
    if (similarPlayers.length === 0) return null;
    return (
      <Card className="card-warm">
        <CardContent className="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('wyscout.similar_title')}</h3>
            <span className="text-[10px] text-muted-foreground/60">{t('wyscout.similar_desc')}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2">
            {similarPlayers.map(sp => {
              const peerPlayer = allPlayers.find(p => p.id === sp.playerId);
              if (!peerPlayer) return null;
              return (
                <Link key={sp.playerId} to={`/compare#v=${buildCompareHash([player.id, sp.playerId])}`}
                  className="text-left p-2.5 rounded-lg border border-border hover:bg-muted/40 transition-colors group block">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">{peerPlayer.name}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{peerPlayer.position} · {peerPlayer.club || '—'}</p>
                    </div>
                    <ArrowRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                  </div>
                  <div className="mt-2 flex items-center gap-1.5">
                    <div className="flex-1 h-1 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${pctColor(sp.similarity)}`} style={{ width: `${sp.similarity}%` }} />
                    </div>
                    <span className="text-[10px] font-bold tabular-nums">{sp.similarity}%</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </CardContent>
      </Card>
    );
  };

  // ── Percentile table (Synthèse view) ──────────────────────────────────
  const PercentileTable = () => {
    if (!aggregated) return null;
    // Use the user-selected benchmark group; fall back to same-position peers.
    const groupRows = selectedGroup?.rows || positionPeerRows;
    const groupCount = selectedGroup?.count ?? positionPeerRows.length;
    const groupDescription = selectedGroup?.description || t('wyscout.percentile_compare_base', { position: player.position, count: groupCount });

    const rowsWithPct = allStatRows
      .map(row => {
        const pct = statPercentile(aggregated, row.db, groupRows);
        if (pct === null) return null;
        // Flip percentile for "less is better" stats so the bar always reads "good→right"
        const adjustedPct = isInvertedStat(row.db) ? 100 - pct : pct;
        return { ...row, pct: adjustedPct };
      })
      .filter((r): r is StatRow & { pct: number } => r !== null);

    if (groupCount < 3 || rowsWithPct.length === 0) {
      return (
        <Card className="card-warm">
          <CardContent className="p-5 text-center">
            <p className="text-xs text-muted-foreground">{t('wyscout.no_peers_for_percentile')}</p>
            <p className="text-[10px] text-muted-foreground/60 mt-1">{t('wyscout.no_peers_for_percentile_desc', { position: player.position, count: groupCount })}</p>
          </CardContent>
        </Card>
      );
    }
    const filtered = statsFilter === 'all' ? rowsWithPct : rowsWithPct.filter(r => r.cat === statsFilter);
    return (
      <Card className="card-warm">
        <CardContent className="p-5">
          <div className="flex items-start justify-between flex-wrap gap-2 mb-3">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('wyscout.percentile_overview')}</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                {t('wyscout.percentile_vs_group', { group: groupDescription, count: groupCount })}
              </p>
            </div>
            <div className="flex rounded-lg border border-border overflow-hidden text-[10px]">
              {(['all', 'attack', 'passing', 'defending', 'physical', ...(isGK ? ['gk' as const] : [])] as const).map(cat => (
                <button key={cat} onClick={() => setStatsFilter(cat)}
                  className={`px-2.5 py-1 font-semibold transition-colors ${statsFilter === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                  {cat === 'gk' ? t('wyscout.cat_goalkeeper') : t(`profile.data_cat_${cat}`)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
            {filtered.map(row => {
              const inverted = isInvertedStat(row.db);
              const tooltipText = inverted
                ? t('wyscout.percentile_tooltip_inverted', { rank: 100 - row.pct, count: groupCount })
                : t('wyscout.percentile_tooltip', { rank: 100 - row.pct, count: groupCount });
              return (
                <div key={row.db as string} className="flex items-center gap-2">
                  <span className="text-xs font-medium truncate flex-1 min-w-0" title={inverted ? t('wyscout.less_is_better_hint') : undefined}>
                    {row.label}{inverted && <span className="text-muted-foreground/50 ml-1">↓</span>}
                  </span>
                  <span className="text-[10px] text-muted-foreground tabular-nums shrink-0 w-12 text-right">{fmt(row.raw, row.unit)}</span>
                  <div className="w-24 h-1.5 rounded-full bg-muted overflow-hidden shrink-0" title={tooltipText}>
                    <div className={`h-full ${pctColor(row.pct)}`} style={{ width: `${row.pct}%` }} />
                  </div>
                  <span className={`text-[10px] font-bold tabular-nums shrink-0 w-8 text-right ${pctText(row.pct)}`}>{row.pct}</span>
                </div>
              );
            })}
          </div>
          <p className="text-[10px] text-muted-foreground/60 mt-3">
            {t('wyscout.percentile_legend_v2')}
          </p>
        </CardContent>
      </Card>
    );
  };

  // ── Report-driven insights (evolution chart + opinion distribution) ───
  const ReportInsights = () => (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {historyData.length >= 2 && (
        <Card className="card-warm lg:col-span-2">
          <CardContent className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('profile.perf_evolution_title')}</h3>
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={historyData}>
                <defs>
                  <linearGradient id="gradLevel" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--success))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--success))" stopOpacity={0} /></linearGradient>
                  <linearGradient id="gradPotential" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} /><stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} /></linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                <RechartsTooltip contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.75rem', fontSize: '12px' }} />
                <Legend />
                <Area type="monotone" dataKey="level" stroke="hsl(var(--success))" fill="url(#gradLevel)" strokeWidth={2.5} name={t('profile.level')} dot={{ r: 4, fill: 'hsl(var(--success))' }} />
                <Area type="monotone" dataKey="potential" stroke="hsl(var(--primary))" fill="url(#gradPotential)" strokeWidth={2.5} name={t('profile.potential')} dot={{ r: 4, fill: 'hsl(var(--primary))' }} />
                <Line type="monotone" dataKey="opinion" stroke="hsl(var(--warning, 45 93% 47%))" strokeWidth={2} strokeDasharray="5 5" name={t('profile.perf_opinion_score')} dot={{ r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card className="card-warm lg:col-span-2">
        <CardContent className="p-5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('profile.perf_opinion_dist')}</h3>
          {reports.length === 0 ? (
            <div className="text-center py-8">
              <Activity className="w-8 h-8 text-muted-foreground/20 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">{t('profile.perf_no_reports')}</p>
              <p className="text-xs text-muted-foreground/60 mt-1">{t('profile.perf_no_reports_desc')}</p>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-4">
              {ALL_OPINIONS.map(opinion => {
                const count = reports.filter(r => r.opinion === opinion).length;
                const pct = Math.round((count / reports.length) * 100);
                const colors: Record<string, string> = { 'À suivre': 'bg-green-500', 'À revoir': 'bg-amber-500', 'Pas pour nous': 'bg-red-500' };
                return (
                  <div key={opinion} className="text-center">
                    <div className="text-2xl font-black">{count}</div>
                    <div className="text-xs text-muted-foreground mb-1">{t(`opinions.${opinion}`)}</div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${colors[opinion] || 'bg-muted-foreground'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">{pct}%</div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );

  // ── Détaillé view (full categorized cards + chart) ────────────────────
  const DetailleView = () => {
    if (!aggregated) return null;
    type CatDef = { key: string; label: string; color: string; fields: { db: keyof WyscoutStatRow; label: string; unit?: string }[] };
    const CATS: CatDef[] = [
      { key: 'base', label: t('wyscout.cat_base'), color: 'text-primary bg-primary/10', fields: [
        { db: 'matches_played', label: t('wyscout.matches_played') },
        { db: 'minutes_played', label: t('wyscout.minutes_played') },
        { db: 'goals', label: t('wyscout.goals') }, { db: 'xg', label: 'xG' },
        { db: 'assists', label: t('wyscout.assists') }, { db: 'xa', label: 'xA' },
        { db: 'shots', label: t('wyscout.shots') },
        { db: 'np_goals', label: t('wyscout.np_goals') },
        { db: 'head_goals', label: t('wyscout.head_goals') },
        { db: 'yellow_cards', label: t('wyscout.yellow_cards') },
        { db: 'red_cards', label: t('wyscout.red_cards') },
        { db: 'penalties_taken', label: t('wyscout.penalties_taken') },
        { db: 'conceded_goals', label: t('wyscout.conceded_goals') },
        { db: 'shots_against', label: t('wyscout.shots_against') },
        { db: 'clean_sheets', label: t('wyscout.clean_sheets') },
      ]},
      { key: 'attack', label: t('wyscout.cat_attack'), color: 'text-orange-600 bg-orange-500/10', fields: [
        { db: 'attacking_actions_per90', label: t('wyscout.attacking_actions_per90') },
        { db: 'goals_per90', label: t('wyscout.goals_per90') },
        { db: 'np_goals_per90', label: t('wyscout.np_goals_per90') },
        { db: 'xg_per90', label: 'xG /90' },
        { db: 'head_goals_per90', label: t('wyscout.head_goals_per90') },
        { db: 'shots_per90', label: t('wyscout.shots_per90') },
        { db: 'shots_on_target_pct', label: t('wyscout.shots_on_target_pct'), unit: '%' },
        { db: 'goal_conversion_pct', label: t('wyscout.goal_conversion_pct'), unit: '%' },
        { db: 'assists_per90', label: t('wyscout.assists_per90') },
        { db: 'xa_per90', label: 'xA /90' },
        { db: 'crosses_per90', label: t('wyscout.crosses_per90') },
        { db: 'crosses_accurate_pct', label: t('wyscout.crosses_accurate_pct'), unit: '%' },
        { db: 'dribbles_per90', label: t('wyscout.dribbles_per90') },
        { db: 'dribbles_success_pct', label: t('wyscout.dribbles_success_pct'), unit: '%' },
        { db: 'offensive_duels_per90', label: t('wyscout.offensive_duels_per90') },
        { db: 'offensive_duels_won_pct', label: t('wyscout.offensive_duels_won_pct'), unit: '%' },
        { db: 'touches_in_box_per90', label: t('wyscout.touches_in_box_per90') },
        { db: 'progressive_runs_per90', label: t('wyscout.progressive_runs_per90') },
        { db: 'accelerations_per90', label: t('wyscout.accelerations_per90') },
        { db: 'fouls_suffered_per90', label: t('wyscout.fouls_suffered_per90') },
      ]},
      { key: 'defense', label: t('wyscout.cat_defense'), color: 'text-blue-600 bg-blue-500/10', fields: [
        { db: 'defensive_actions_per90', label: t('wyscout.defensive_actions_per90') },
        { db: 'defensive_duels_per90', label: t('wyscout.defensive_duels_per90') },
        { db: 'defensive_duels_won_pct', label: t('wyscout.defensive_duels_won_pct'), unit: '%' },
        { db: 'aerial_duels_per90', label: t('wyscout.aerial_duels_per90') },
        { db: 'aerial_duels_won_pct', label: t('wyscout.aerial_duels_won_pct'), unit: '%' },
        { db: 'duels_per90', label: t('wyscout.duels_per90') },
        { db: 'duels_won_pct', label: t('wyscout.duels_won_pct'), unit: '%' },
        { db: 'interceptions_per90', label: t('wyscout.interceptions_per90') },
        { db: 'padj_interceptions', label: 'PAdj Interc.' },
        { db: 'sliding_tackles_per90', label: t('wyscout.sliding_tackles_per90') },
        { db: 'padj_sliding_tackles', label: 'PAdj Tackles' },
        { db: 'shots_blocked_per90', label: t('wyscout.shots_blocked_per90') },
        { db: 'fouls_per90', label: t('wyscout.fouls_per90') },
        { db: 'yellow_cards_per90', label: t('wyscout.yellow_cards_per90') },
        { db: 'red_cards_per90', label: t('wyscout.red_cards_per90') },
      ]},
      { key: 'passing', label: t('wyscout.cat_passing'), color: 'text-teal-600 bg-teal-500/10', fields: [
        { db: 'passes_per90', label: t('wyscout.passes_per90') },
        { db: 'passes_accurate_pct', label: t('wyscout.passes_accurate_pct'), unit: '%' },
        { db: 'forward_passes_per90', label: t('wyscout.forward_passes_per90') },
        { db: 'forward_passes_accurate_pct', label: t('wyscout.forward_passes_accurate_pct'), unit: '%' },
        { db: 'back_passes_per90', label: t('wyscout.back_passes_per90') },
        { db: 'lateral_passes_per90', label: t('wyscout.lateral_passes_per90') },
        { db: 'long_passes_per90', label: t('wyscout.long_passes_per90') },
        { db: 'long_passes_accurate_pct', label: t('wyscout.long_passes_accurate_pct'), unit: '%' },
        { db: 'avg_pass_length', label: t('wyscout.avg_pass_length'), unit: 'm' },
        { db: 'key_passes_per90', label: t('wyscout.key_passes_per90') },
        { db: 'shot_assists_per90', label: t('wyscout.shot_assists_per90') },
        { db: 'smart_passes_per90', label: t('wyscout.smart_passes_per90') },
        { db: 'smart_passes_accurate_pct', label: t('wyscout.smart_passes_accurate_pct'), unit: '%' },
        { db: 'passes_final_third_per90', label: t('wyscout.passes_final_third_per90') },
        { db: 'passes_penalty_area_per90', label: t('wyscout.passes_penalty_area_per90') },
        { db: 'through_passes_per90', label: t('wyscout.through_passes_per90') },
        { db: 'progressive_passes_per90', label: t('wyscout.progressive_passes_per90') },
        { db: 'progressive_passes_accurate_pct', label: t('wyscout.progressive_passes_accurate_pct'), unit: '%' },
        { db: 'deep_completions_per90', label: t('wyscout.deep_completions_per90') },
        { db: 'received_passes_per90', label: t('wyscout.received_passes_per90') },
        { db: 'received_long_passes_per90', label: t('wyscout.received_long_passes_per90') },
      ]},
      { key: 'setpieces', label: t('wyscout.cat_setpieces'), color: 'text-violet-600 bg-violet-500/10', fields: [
        { db: 'free_kicks_per90', label: t('wyscout.free_kicks_per90') },
        { db: 'direct_free_kicks_per90', label: t('wyscout.direct_free_kicks_per90') },
        { db: 'direct_free_kicks_on_target_pct', label: t('wyscout.direct_free_kicks_on_target_pct'), unit: '%' },
        { db: 'corners_per90', label: t('wyscout.corners_per90') },
        { db: 'penalty_conversion_pct', label: t('wyscout.penalty_conversion_pct'), unit: '%' },
      ]},
      { key: 'goalkeeper', label: t('wyscout.cat_goalkeeper'), color: 'text-yellow-600 bg-yellow-500/10', fields: [
        { db: 'conceded_goals_per90', label: t('wyscout.conceded_goals_per90') },
        { db: 'shots_against_per90', label: t('wyscout.shots_against_per90') },
        { db: 'save_rate_pct', label: t('wyscout.save_rate_pct'), unit: '%' },
        { db: 'xg_against', label: 'xG against' },
        { db: 'xg_against_per90', label: 'xG against /90' },
        { db: 'prevented_goals', label: t('wyscout.prevented_goals') },
        { db: 'prevented_goals_per90', label: t('wyscout.prevented_goals_per90') },
        { db: 'gk_back_passes_per90', label: t('wyscout.gk_back_passes_per90') },
        { db: 'gk_exits_per90', label: t('wyscout.gk_exits_per90') },
        { db: 'gk_aerial_duels_per90', label: t('wyscout.gk_aerial_duels_per90') },
      ]},
      { key: 'physical', label: t('wyscout.cat_physical'), color: 'text-red-600 bg-red-500/10', fields: [
        { db: 'total_distance_per90', label: t('wyscout.total_distance_per90'), unit: 'm' },
        { db: 'running_distance_per90', label: t('wyscout.running_distance_per90'), unit: 'm' },
        { db: 'hsr_distance_per90', label: t('wyscout.hsr_distance_per90'), unit: 'm' },
        { db: 'sprint_distance_per90', label: t('wyscout.sprint_distance_per90'), unit: 'm' },
        { db: 'hi_distance_per90', label: t('wyscout.hi_distance_per90'), unit: 'm' },
        { db: 'meters_per_min', label: t('wyscout.meters_per_min'), unit: 'm/min' },
        { db: 'max_speed', label: t('wyscout.max_speed'), unit: 'km/h' },
        { db: 'medium_accel_per90', label: t('wyscout.medium_accel_per90') },
        { db: 'high_accel_per90', label: t('wyscout.high_accel_per90') },
        { db: 'medium_decel_per90', label: t('wyscout.medium_decel_per90') },
        { db: 'high_decel_per90', label: t('wyscout.high_decel_per90') },
        { db: 'hsr_count_per90', label: t('wyscout.hsr_count_per90') },
        { db: 'sprint_count_per90', label: t('wyscout.sprint_count_per90') },
        { db: 'hi_count_per90', label: t('wyscout.hi_count_per90') },
      ]},
    ];
    const toggleCat = (key: string) => setWyscoutExpandedCats(prev => ({ ...prev, [key]: !prev[key] }));
    const fmtVal = (v: number | null, unit?: string) => {
      if (v === null || v === undefined) return null;
      const n = typeof v === 'string' ? parseFloat(v) : v;
      if (isNaN(n)) return null;
      const str = Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
      return unit ? `${str} ${unit}` : str;
    };

    return (
      <>
        {wyscoutRows.length > 1 && (
          <Card className="card-warm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />{t('profile.season_evolution')}
                </h3>
                <select value={seasonChartStat as string} onChange={e => setSeasonChartStat(e.target.value as keyof WyscoutStatRow)} className="px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-medium">
                  {seasonChartOptions.map(o => <option key={o.value as string} value={o.value as string}>{o.label}</option>)}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={seasonChartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="season" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Line type="monotone" dataKey="value" name={seasonChartOptions.find(o => o.value === seasonChartStat)?.label} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}

        <div className="mt-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center"><Database className="w-4 h-4 text-primary" /></div>
              <div>
                <h2 className="text-sm font-bold">{t('wyscout.section_title')}</h2>
                <p className="text-xs text-muted-foreground">{t('wyscout.section_desc')}</p>
              </div>
            </div>
          </div>
          {aggregated && (
            <div className="flex items-center gap-2 mb-4 flex-wrap">
              {aggregated.team && <Badge variant="secondary" className="text-xs">{aggregated.team}</Badge>}
              {aggregated.season && <Badge variant="outline" className="text-xs">{aggregated.season}</Badge>}
              {aggregated.division && <Badge variant="outline" className="text-xs">{aggregated.division}</Badge>}
              {aggregated.country && <Badge variant="outline" className="text-xs">{aggregated.country}</Badge>}
            </div>
          )}
          <div className="space-y-3">
            {CATS.map(cat => {
              const visibleFields = cat.fields.filter(f => fmtVal(wyscoutNum(aggregated, f.db)) !== null);
              if (visibleFields.length === 0) return null;
              const isExpanded = wyscoutExpandedCats[cat.key] !== false;
              return (
                <Card key={cat.key} className="card-warm overflow-hidden">
                  <button onClick={() => toggleCat(cat.key)} className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${cat.color}`}>{cat.label}</span>
                      <span className="text-xs text-muted-foreground">{visibleFields.length} stats</span>
                    </div>
                    {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>
                  {isExpanded && (
                    <CardContent className="p-0 pb-2">
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-px bg-border/40">
                        {visibleFields.map(f => (
                          <div key={f.db as string} className="bg-card px-3 py-2.5">
                            <div className="text-[10px] text-muted-foreground leading-tight mb-0.5">{f.label}</div>
                            <div className="text-sm font-bold tabular-nums">{fmtVal(wyscoutNum(aggregated, f.db), f.unit)}</div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      </>
    );
  };

  // ── Top-level layout ──────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="w-4 h-4 text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground">{t('wyscout.tab_header')}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditorOpen(true)}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            {t('wyscout.custom_button')}
            {customProfiles.length > 0 && (
              <span className="ml-1.5 px-1 rounded bg-primary/10 text-primary text-[9px] font-bold">{customProfiles.length}</span>
            )}
          </Button>
          <Button asChild size="sm" variant="outline" className="h-8 text-xs">
            <Link to={`/compare#v=${buildCompareHash([player.id])}`}>
              <GitCompareArrows className="w-3.5 h-3.5 mr-1.5" />
              {t('wyscout.open_compare')}
            </Link>
          </Button>
          <ViewToggle />
        </div>
      </div>

      <CustomProfileEditor
        open={editorOpen}
        onOpenChange={setEditorOpen}
        customProfiles={customProfiles}
        onProfilesChange={setCustomProfiles}
        statCatalog={STAT_CATALOG}
        currentPlayerRow={aggregated}
        currentPlayerName={player.name}
        currentPlayerPosition={player.position}
        peerSummaries={peerSummaries}
        allPlayers={allPlayers}
      />

      <FilterBar />
      <BenchmarkSelector />

      {viewMode === 'synthese' && (
        <>
          <HeaderCard />
          <DnaPanel />
          <AutoRadar />
          <PercentileTable />
          <SimilarPlayersPanel />
          <ReportInsights />
        </>
      )}

      {viewMode === 'detaille' && (
        <>
          <HeaderCard />
          <DetailleView />
        </>
      )}
    </div>
  );
}
