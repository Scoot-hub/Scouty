import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, Legend,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, Tooltip as RechartsTooltip,
} from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Activity, TrendingUp, RefreshCw, Maximize2, BarChart3 } from 'lucide-react';
import { computePercentile, CHART_COLORS, RADAR_PRESETS } from '@/lib/player-stats';
import { getPlayerAge, resolveLeagueName, ALL_OPINIONS, type Player, type Report, type Opinion } from '@/types/player';

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

export default function ProfileDataTab({
  player, allPlayers, reports, perfScores, updatePerfScore,
  enriching, handleEnrich, isPremium, isAdmin,
}: ProfileDataTabProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language === 'es' ? 'es-ES' : i18n.language === 'en' ? 'en-GB' : 'fr-FR';
  interface PerfStats { stats: Record<string, number>; per90: Record<string, number>; season?: string; league?: string; team?: string; all_competitions?: { league: string; appearances: number; rating?: string; goals?: number; assists?: number }[] }
  interface ExtData { performance_stats?: PerfStats; season_stats?: unknown[]; [key: string]: unknown }
  const ext = (player.external_data || {}) as ExtData;
  const getExtData = (p: Player): ExtData => (p.external_data || {}) as ExtData;
  const getExtPerfStats = (p: Player): Record<string, number> | null => getExtData(p).performance_stats?.stats ?? null;
  const getExtPer90 = (p: Player): Record<string, number> => getExtData(p).performance_stats?.per90 ?? {};

  // Data-tab-specific state
  const [comparePlayerIds, setComparePlayerIds] = useState<string[]>([]);
  const [showPer90, setShowPer90] = useState(false);
  const [statsSortKey, setStatsSortKey] = useState<string>('');
  const [statsSortDir, setStatsSortDir] = useState<'asc' | 'desc'>('desc');
  const [statsFilter, setStatsFilter] = useState<'all' | 'attack' | 'passing' | 'defending' | 'physical'>('all');
  const [radarSelectedStats, setRadarSelectedStats] = useState<string[]>(['goals', 'assists', 'passes_accuracy', 'tackles', 'interceptions', 'duels_won', 'dribbles_success', 'passes_key']);
  const [radarProfile, setRadarProfile] = useState<string>('custom');
  const [savedRadarProfiles, setSavedRadarProfiles] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem('radar-profiles') ?? '{}'); } catch { return {}; }
  });
  const [newProfileName, setNewProfileName] = useState('');
  const [radarFullscreen, setRadarFullscreen] = useState(false);
  const [benchmarkLeagueFilter, setBenchmarkLeagueFilter] = useState<string>('all');
  const [benchmarkAgeFilter, setBenchmarkAgeFilter] = useState<string>('all');
  const [benchmarkLevelFilter, setBenchmarkLevelFilter] = useState<string>('all');
  const [rankScope, setRankScope] = useState<'all' | 'position' | 'league' | 'age'>('all');
  const [seasonChartStat, setSeasonChartStat] = useState<string>('goals');

  const ps = ext.performance_stats;
  const s = ps?.stats;
  const p90 = ps?.per90 || {};
  const isGK = player.position === 'GK';
  const hasPerfStats = !!s;

  // ── Compare players logic (multi) ──
  const comparePlayers = comparePlayerIds.map(cid => allPlayers.find(p => p.id === cid)).filter(Boolean) as typeof allPlayers;
  const comparePlayer = comparePlayers[0] || null;
  const compareExt = comparePlayer ? getExtData(comparePlayer) : {} as ExtData;
  const comparePs = compareExt.performance_stats;
  const compareS = comparePs?.stats;

  // ── Radar axes builder ──
  const buildRadarValue = (st: Record<string, number> | null | undefined) => {
    if (!st) return null;
    return isGK ? [
      { axis: t('profile.perf_duels'), value: st.duels_total > 0 ? Math.round((st.duels_won / st.duels_total) * 100) : 0 },
      { axis: t('profile.perf_passes'), value: st.passes_accuracy || 0 },
      { axis: t('profile.perf_discipline'), value: Math.max(0, 100 - (st.cards_yellow * 15 + st.cards_red * 40)) },
      { axis: 'Saves', value: Math.min(100, (st.saves || 0) * 4) },
    ] : [
      { axis: t('profile.perf_shooting'), value: st.shots_total > 0 ? Math.min(100, Math.round((st.shots_on / st.shots_total) * 100)) : 0 },
      { axis: t('profile.perf_creativity'), value: Math.min(100, (st.passes_key || 0) * 2.5) },
      { axis: t('profile.perf_passes'), value: st.passes_accuracy || 0 },
      { axis: t('profile.perf_defending'), value: Math.min(100, ((st.tackles || 0) + (st.interceptions || 0) + (st.blocks || 0)) * 2) },
      { axis: t('profile.perf_duels'), value: st.duels_total > 0 ? Math.round((st.duels_won / st.duels_total) * 100) : 0 },
      { axis: t('profile.perf_dribbling'), value: st.dribbles_attempts > 0 ? Math.round((st.dribbles_success / st.dribbles_attempts) * 100) : 0 },
    ];
  };

  const radarPerfData = buildRadarValue(s);
  const radarCompareData = comparePlayers.map(cp => ({
    player: cp,
    data: buildRadarValue(getExtPerfStats(cp)),
  }));
  const mergedRadar = radarPerfData?.map((d, i) => {
    const entry: Record<string, string | number> = { axis: d.axis, [player.name]: d.value };
    radarCompareData.forEach(rc => { if (rc.data) entry[rc.player.name] = rc.data[i]?.value || 0; });
    return entry;
  });

  // ── Stats table rows ──
  type StatRow = { key: string; label: string; cat: 'attack' | 'passing' | 'defending' | 'physical'; raw: number | null; per90v: number | null; compareRaw?: number | null; comparePer90?: number | null };
  const statRows: StatRow[] = [];
  if (s) {
    const cp90 = comparePs?.per90 || {};
    const addRow = (key: string, label: string, cat: StatRow['cat'], raw: number | null, per90v: number | null) => {
      statRows.push({ key, label, cat, raw, per90v, compareRaw: compareS?.[key] ?? null, comparePer90: cp90[key] ?? null });
    };
    if (!isGK) {
      addRow('goals', t('profile.perf_goals'), 'attack', s.goals, p90.goals);
      addRow('assists', t('profile.perf_assists'), 'attack', s.assists, p90.assists);
      addRow('shots_total', t('profile.perf_shots'), 'attack', s.shots_total, p90.shots);
      addRow('shots_on', t('profile.perf_shooting'), 'attack', s.shots_on, null);
      if (s.expected_goals) addRow('expected_goals', 'xG', 'attack', parseFloat(s.expected_goals), p90.expected_goals);
      if (s.expected_assists) addRow('expected_assists', 'xA', 'attack', parseFloat(s.expected_assists), null);
      addRow('big_chances_created', t('profile.perf_creativity'), 'attack', s.big_chances_created, null);
    }
    addRow('passes_accuracy', t('profile.perf_passes_accuracy'), 'passing', s.passes_accuracy, null);
    addRow('passes_key', t('profile.perf_key_passes'), 'passing', s.passes_key, p90.key_passes);
    addRow('passes_total', t('profile.perf_passes'), 'passing', s.passes_total, null);
    addRow('tackles', t('profile.perf_tackles'), 'defending', s.tackles, p90.tackles);
    addRow('interceptions', t('profile.perf_interceptions'), 'defending', s.interceptions, p90.interceptions);
    addRow('blocks', 'Blocks', 'defending', s.blocks, null);
    addRow('duels_won', t('profile.perf_duels_won'), 'physical', s.duels_won, p90.duels_won);
    addRow('duels_total', t('profile.perf_duels'), 'physical', s.duels_total, null);
    addRow('aerial_duels_won', t('profile.perf_aerial'), 'physical', s.aerial_duels_won, null);
    if (!isGK) addRow('dribbles_success', t('profile.perf_dribbles'), 'physical', s.dribbles_success, p90.dribbles);
    addRow('fouls_drawn', t('profile.perf_fouls_drawn'), 'physical', s.fouls_drawn, null);
    addRow('fouls_committed', t('profile.perf_fouls_committed'), 'physical', s.fouls_committed, null);
  }
  const filteredRows = statsFilter === 'all' ? statRows : statRows.filter(r => r.cat === statsFilter);
  const sortedRows = statsSortKey ? [...filteredRows].sort((a, b) => {
    const aVal = showPer90 ? (a.per90v ?? a.raw ?? 0) : (a.raw ?? 0);
    const bVal = showPer90 ? (b.per90v ?? b.raw ?? 0) : (b.raw ?? 0);
    return statsSortDir === 'asc' ? aVal - bVal : bVal - aVal;
  }) : filteredRows;

  // ── Positional benchmark ──
  const positionPeersRaw = allPlayers.filter(p => p.id !== player.id && p.position === player.position && getExtPerfStats(p));
  const positionPeers = positionPeersRaw.filter(p => {
    if (benchmarkLeagueFilter !== 'all' && resolveLeagueName(p.club, p.league) !== benchmarkLeagueFilter) return false;
    if (benchmarkAgeFilter !== 'all') {
      const pAge = getPlayerAge(p.generation, p.date_of_birth);
      const myAge = getPlayerAge(player.generation, player.date_of_birth);
      if (benchmarkAgeFilter === '2' && Math.abs(pAge - myAge) > 2) return false;
      if (benchmarkAgeFilter === '5' && Math.abs(pAge - myAge) > 5) return false;
      if (benchmarkAgeFilter === 'gen' && p.generation !== player.generation) return false;
    }
    if (benchmarkLevelFilter !== 'all' && Math.abs(p.current_level - player.current_level) > 1) return false;
    return true;
  });
  const benchmarkPeerLeagues = [...new Set(positionPeersRaw.map(p => resolveLeagueName(p.club, p.league)).filter(Boolean))].sort();
  const allStatKeys = statRows.map(r => r.key);
  const benchmarks: Record<string, { avg: number; playerVal: number; rank: number; total: number }> = {};
  if (s && positionPeers.length > 0) {
    for (const bk of allStatKeys) {
      const peerVals = positionPeers.map(p => { const v = getExtPerfStats(p)?.[bk]; return v != null ? parseFloat(String(v)) : 0; }).filter(v => !isNaN(v) && v > 0);
      const playerVal = (() => { const v = (s as Record<string, number>)[bk]; return v != null ? parseFloat(String(v)) : 0; })();
      if (peerVals.length > 0 && !isNaN(playerVal)) {
        const avg = peerVals.reduce((a, b) => a + b, 0) / peerVals.length;
        const allVals = [...peerVals, playerVal].sort((a, b) => b - a);
        const rank = allVals.indexOf(playerVal) + 1;
        benchmarks[bk] = { avg: Math.round(avg * 10) / 10, playerVal, rank, total: allVals.length };
      }
    }
  }

  // ── Global rankings ──
  const allEnrichedPlayers = allPlayers.filter(p => getExtPerfStats(p));
  const rankFilteredPlayers = allEnrichedPlayers.filter(p => {
    if (rankScope === 'position' && p.position !== player.position) return false;
    if (rankScope === 'league' && resolveLeagueName(p.club, p.league) !== resolveLeagueName(player.club, player.league)) return false;
    if (rankScope === 'age') {
      const pAge = getPlayerAge(p.generation, p.date_of_birth);
      const myAge = getPlayerAge(player.generation, player.date_of_birth);
      if (Math.abs(pAge - myAge) > 2) return false;
    }
    return true;
  });
  const rankScopeLabel = rankScope === 'all'
    ? t('profile.rank_scope_all_desc', { count: rankFilteredPlayers.length })
    : rankScope === 'position'
    ? t('profile.rank_scope_position_desc', { position: player.position, count: rankFilteredPlayers.length })
    : rankScope === 'league'
    ? t('profile.rank_scope_league_desc', { league: resolveLeagueName(player.club, player.league) || '?', count: rankFilteredPlayers.length })
    : t('profile.rank_scope_age_desc', { count: rankFilteredPlayers.length });
  const globalRankings: Record<string, { rank: number; total: number; percentile: number }> = {};
  if (s && rankFilteredPlayers.length > 1) {
    for (const bk of allStatKeys) {
      const allVals = rankFilteredPlayers.map(p => {
        const v = getExtPerfStats(p)?.[bk];
        return { id: p.id, val: v != null ? parseFloat(String(v)) : 0 };
      }).filter(e => !isNaN(e.val) && e.val > 0);
      if (allVals.length > 1) {
        allVals.sort((a, b) => b.val - a.val);
        const idx = allVals.findIndex(e => e.id === player.id);
        if (idx !== -1) {
          const rank = idx + 1;
          globalRankings[bk] = { rank, total: allVals.length, percentile: computePercentile(rank, allVals.length) };
        }
      }
    }
  }

  // ── Candidates for compare ──
  const compareCandidates = allPlayers.filter(p => p.id !== player.id && getExtPerfStats(p));

  // ── Scout evaluation data ──
  const { physical: physScore, technical: techScore, tactical: tacticScore, mental: mentalScore } = perfScores;
  const scoutRadarData = [
    { attr: t('profile.perf_physical'), value: physScore, full: 10 },
    { attr: t('profile.perf_technical'), value: techScore, full: 10 },
    { attr: t('profile.perf_tactical'), value: tacticScore, full: 10 },
    { attr: t('profile.perf_mental'), value: mentalScore, full: 10 },
    { attr: t('profile.perf_potential'), value: player.potential, full: 10 },
    { attr: t('profile.perf_level'), value: player.current_level, full: 10 },
  ];
  const overallScore = Math.round((physScore + techScore + tacticScore + mentalScore + player.current_level + player.potential) / 6 * 10) / 10;
  const historyData = reports.slice().reverse().map((r, i) => ({
    date: new Date(r.report_date).toLocaleDateString(locale, { month: 'short', year: '2-digit' }),
    level: player.current_level, potential: player.potential,
    opinion: r.opinion === 'À suivre' ? 8 : r.opinion === 'À revoir' ? 5 : 3,
    index: i + 1,
  }));
  const attrSliders: { key: keyof typeof perfScores; label: string; color: string }[] = [
    { key: 'physical', label: t('profile.perf_physical'), color: 'hsl(var(--chart-1))' },
    { key: 'technical', label: t('profile.perf_technical'), color: 'hsl(var(--chart-2))' },
    { key: 'tactical', label: t('profile.perf_tactical'), color: 'hsl(var(--chart-3))' },
    { key: 'mental', label: t('profile.perf_mental'), color: 'hsl(var(--chart-4))' },
  ];

  return (
    <div className="space-y-4">
      {/* ═══════════════ SECTION 1: PERFORMANCE STATS (SofaScore) ═══════════════ */}
      {hasPerfStats ? (
        <>
          {/* Header + rating + compare selector */}
          <Card className="card-warm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
                <div>
                  <h3 className="text-base font-bold flex items-center gap-2">
                    <Activity className="w-4 h-4" />{t('profile.perf_title')}
                    {ps.season && <span className="text-xs bg-blue-500/10 text-blue-600 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">{ps.season}</span>}
                  </h3>
                  {ps.league && <p className="text-xs text-muted-foreground mt-0.5">{ps.league} {ps.team ? `— ${ps.team}` : ''}</p>}
                </div>
                <div className="flex items-center gap-3">
                  {s.rating && (
                    <div className={`text-3xl font-black px-4 py-2 rounded-xl ${parseFloat(s.rating) >= 7.5 ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : parseFloat(s.rating) >= 7.0 ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400' : parseFloat(s.rating) >= 6.5 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' : 'bg-muted text-muted-foreground'}`}>
                      {s.rating}
                    </div>
                  )}
                </div>
              </div>

              {/* KPI strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 mb-4">
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <p className="text-2xl font-black">{s.appearances}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('profile.perf_appearances')}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <p className="text-2xl font-black">{s.minutes?.toLocaleString()}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('profile.perf_minutes')}</p>
                </div>
                {!isGK && <>
                  <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                    <p className="text-2xl font-black">{s.goals}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('profile.perf_goals')}{s.expected_goals ? <span className="text-muted-foreground/60 ml-1">(xG: {s.expected_goals})</span> : ''}</p>
                  </div>
                  <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                    <p className="text-2xl font-black">{s.assists}</p>
                    <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('profile.perf_assists')}{s.expected_assists ? <span className="text-muted-foreground/60 ml-1">(xA: {s.expected_assists})</span> : ''}</p>
                  </div>
                </>}
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <p className="text-2xl font-black">{s.passes_accuracy != null ? `${Math.round(s.passes_accuracy * 100) / 100}%` : '—'}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('profile.perf_passes')}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-muted/40 text-center">
                  <p className="text-2xl font-black">{s.duels_total > 0 ? `${Math.round((s.duels_won / s.duels_total) * 100)}%` : '—'}</p>
                  <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{t('profile.perf_duels')}</p>
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground/40 text-right">Source: SofaScore</p>
            </CardContent>
          </Card>

          {/* ── Radar + Benchmark (single card) ── */}
          <Card className="card-warm">
            <CardContent className="p-5">
              {/* Header row: title + compare selector */}
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('profile.perf_radar_title')}</h3>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{t('profile.data_benchmark_desc', { position: player.position, count: positionPeers.length })}</p>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {comparePlayers.map((cp, i) => (
                    <span key={cp.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold text-white" style={{ backgroundColor: CHART_COLORS[(i + 1) % CHART_COLORS.length] }}>
                      {cp.name.split(' ').pop()}
                      <button onClick={() => setComparePlayerIds(prev => prev.filter(id => id !== cp.id))} className="hover:opacity-70">×</button>
                    </span>
                  ))}
                  {comparePlayers.length < 3 && (
                    <select value="" onChange={e => { if (e.target.value) setComparePlayerIds(prev => [...prev, e.target.value]); e.target.value = ''; }}
                      className="h-7 px-2 rounded-lg border border-border bg-background text-xs focus:outline-none focus:ring-1 focus:ring-primary">
                      <option value="">{comparePlayers.length === 0 ? t('profile.data_compare_placeholder') : '+'}</option>
                      {compareCandidates.filter(cp => !comparePlayerIds.includes(cp.id)).map(cp => (
                        <option key={cp.id} value={cp.id}>{cp.name} ({cp.position})</option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              {/* Radar profile selector */}
              <div className="flex items-center gap-2 mb-2">
                <select value={radarProfile} onChange={e => {
                  const key = e.target.value;
                  setRadarProfile(key);
                  if (key === 'custom') return;
                  const preset = RADAR_PRESETS[key]?.stats ?? savedRadarProfiles[key];
                  if (preset) setRadarSelectedStats(preset);
                }}
                  className="px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary">
                  <option value="custom">{t('profile.radar_custom')}</option>
                  <option value="profile-9">{t('profile.radar_preset_profile9')}</option>
                  <option value="box-to-box">{t('profile.radar_preset_b2b')}</option>
                  <option value="playmaker">{t('profile.radar_preset_playmaker')}</option>
                  {Object.keys(savedRadarProfiles).map(k => (
                    <option key={k} value={k}>{k}</option>
                  ))}
                </select>
                <div className="flex items-center gap-1">
                  <input type="text" placeholder={t('profile.radar_save_name')} value={newProfileName} onChange={e => setNewProfileName(e.target.value)}
                    className="px-2 py-1 rounded-lg border border-border bg-background text-xs w-24 focus:outline-none focus:ring-1 focus:ring-primary" />
                  <button onClick={() => {
                    if (!newProfileName.trim()) return;
                    const updated = { ...savedRadarProfiles, [newProfileName.trim()]: [...radarSelectedStats] };
                    setSavedRadarProfiles(updated);
                    localStorage.setItem('radar-profiles', JSON.stringify(updated));
                    setRadarProfile(newProfileName.trim());
                    setNewProfileName('');
                  }}
                    className="px-2 py-1 rounded-lg bg-primary text-primary-foreground text-[10px] font-semibold hover:bg-primary/90 transition-colors">
                    {t('profile.radar_save')}
                  </button>
                </div>
                {radarProfile !== 'custom' && !RADAR_PRESETS[radarProfile] && savedRadarProfiles[radarProfile] && (
                  <button onClick={() => {
                    const updated = { ...savedRadarProfiles };
                    delete updated[radarProfile];
                    setSavedRadarProfiles(updated);
                    localStorage.setItem('radar-profiles', JSON.stringify(updated));
                    setRadarProfile('custom');
                  }}
                    className="text-destructive text-[10px] font-semibold hover:underline">
                    {t('profile.radar_delete_profile')}
                  </button>
                )}
              </div>

              {/* Stat selector chips */}
              <div className="flex flex-wrap gap-1.5 mb-4">
                {statRows.map(row => {
                  const isSelected = radarSelectedStats.includes(row.key);
                  return (
                    <button key={row.key} onClick={() => {
                      setRadarSelectedStats(prev =>
                        isSelected ? prev.filter(k => k !== row.key) : prev.length < 10 ? [...prev, row.key] : prev
                      );
                    }}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-colors ${isSelected
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'border-border text-muted-foreground hover:bg-muted'}`}>
                      {row.label}
                    </button>
                  );
                })}
              </div>

              {(() => {
                const selectedWithData = radarSelectedStats
                  .map(key => {
                    const row = statRows.find(r => r.key === key);
                    const bm = benchmarks[key];
                    if (!row) return null;
                    const playerVal = row.raw ?? 0;
                    const avgVal = bm?.avg ?? 0;
                    const cmpVals = comparePlayers.map(cp => { const cpS = getExtPerfStats(cp); return cpS ? (cpS[key] ?? 0) : 0; });
                    const maxVal = Math.max(playerVal, avgVal * 1.5, ...cmpVals.map(v => v * 1.2), 1);
                    return { key, label: row.label, playerVal, avgVal, cmpVals, playerNorm: Math.round((playerVal / maxVal) * 100), avgNorm: Math.round((avgVal / maxVal) * 100), cmpNorms: cmpVals.map(v => Math.round((v / maxVal) * 100)), rank: bm?.rank, total: bm?.total };
                  })
                  .filter(Boolean) as { key: string; label: string; playerVal: number; avgVal: number; cmpVals: number[]; playerNorm: number; avgNorm: number; cmpNorms: number[]; rank?: number; total?: number }[];

                if (selectedWithData.length < 3) {
                  return <div className="text-center py-8"><p className="text-sm text-muted-foreground">{t('profile.data_radar_select_min')}</p></div>;
                }

                const fmt = (v: number) => Number.isInteger(v) ? v : Math.round(v * 100) / 100;
                const shortLabel = (l: string) => l.length > 14 ? l.slice(0, 13) + '\u2026' : l;

                const radarCustomData = selectedWithData.map(d => {
                  const entry: Record<string, string | number> = {
                    axis: `${shortLabel(d.label)} (${fmt(d.playerVal)})`,
                    [player.name]: d.playerNorm,
                    ...(positionPeers.length > 0 ? { [t('profile.data_avg')]: d.avgNorm } : {}),
                  };
                  comparePlayers.forEach((cp, i) => { entry[cp.name] = d.cmpNorms[i] ?? 0; });
                  return entry;
                });

                return (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Radar (left) */}
                    <div className="cursor-pointer group relative" onClick={() => setRadarFullscreen(true)} title={t('profile.radar_expand')}>
                      <div className="absolute top-1 right-1 z-10 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Maximize2 className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <ResponsiveContainer width="100%" height={350}>
                        <RadarChart data={radarCustomData} cx="50%" cy="48%" outerRadius="55%">
                          <PolarGrid stroke="hsl(var(--border))" />
                          <PolarAngleAxis dataKey="axis" tick={{ fontSize: 8, fill: 'hsl(var(--muted-foreground))' }} />
                          <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar name={player.name} dataKey={player.name} stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} dot={{ r: 3, fill: 'hsl(var(--primary))' }} />
                          {positionPeers.length > 0 && (
                            <Radar name={t('profile.data_avg')} dataKey={t('profile.data_avg')} stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 2 }} />
                          )}
                          {comparePlayers.map((cp, i) => (
                            <Radar key={cp.id} name={cp.name} dataKey={cp.name} stroke={CHART_COLORS[(i + 1) % CHART_COLORS.length]} fill={CHART_COLORS[(i + 1) % CHART_COLORS.length]} fillOpacity={0.1} strokeWidth={2} strokeDasharray="4 4" dot={{ r: 2 }} />
                          ))}
                          <Legend wrapperStyle={{ fontSize: 10 }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>

                    {/* Radar fullscreen dialog */}
                    <Dialog open={radarFullscreen} onOpenChange={setRadarFullscreen}>
                      <DialogContent className="max-w-3xl overflow-hidden">
                        <DialogHeader>
                          <DialogTitle>{t('profile.perf_radar_title')} — {player.name}</DialogTitle>
                        </DialogHeader>
                        {(() => {
                          const fullLabelData = selectedWithData.map(d => {
                            const entry: Record<string, string | number> = {
                              axis: `${d.label} (${fmt(d.playerVal)})`,
                              [player.name]: d.playerNorm,
                              ...(positionPeers.length > 0 ? { [t('profile.data_avg')]: d.avgNorm } : {}),
                            };
                            comparePlayers.forEach((cp, i) => { entry[cp.name] = d.cmpNorms[i] ?? 0; });
                            return entry;
                          });
                          return (
                            <div>
                              <div className="flex flex-wrap justify-center gap-4 mb-2">
                                <span className="flex items-center gap-1.5 text-xs"><span className="w-3 h-0.5 rounded bg-primary inline-block" />{player.name}</span>
                                {positionPeers.length > 0 && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><span className="w-3 h-0.5 rounded bg-muted-foreground inline-block border-dashed" />{t('profile.data_avg')}</span>}
                                {comparePlayers.map((cp, i) => (
                                  <span key={cp.id} className="flex items-center gap-1.5 text-xs"><span className="w-3 h-0.5 rounded inline-block" style={{ backgroundColor: CHART_COLORS[(i + 1) % CHART_COLORS.length] }} />{cp.name}</span>
                                ))}
                              </div>
                              <ResponsiveContainer width="100%" height={520}>
                                <RadarChart data={fullLabelData} cx="50%" cy="50%" outerRadius="60%">
                                  <PolarGrid stroke="hsl(var(--border))" />
                                  <PolarAngleAxis dataKey="axis" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                                  <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                                  <Radar name={player.name} dataKey={player.name} stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(var(--primary))' }} />
                                  {positionPeers.length > 0 && (
                                    <Radar name={t('profile.data_avg')} dataKey={t('profile.data_avg')} stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground))" fillOpacity={0.05} strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 3 }} />
                                  )}
                                  {comparePlayers.map((cp, i) => (
                                    <Radar key={cp.id} name={cp.name} dataKey={cp.name} stroke={CHART_COLORS[(i + 1) % CHART_COLORS.length]} fill={CHART_COLORS[(i + 1) % CHART_COLORS.length]} fillOpacity={0.1} strokeWidth={2.5} strokeDasharray="4 4" dot={{ r: 3 }} />
                                  ))}
                                </RadarChart>
                              </ResponsiveContainer>
                            </div>
                          );
                        })()}
                      </DialogContent>
                    </Dialog>

                    {/* Benchmark bars (right) */}
                    <div>
                      <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">{t('profile.data_benchmark_title')}</h4>
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        <select value={benchmarkLeagueFilter} onChange={e => setBenchmarkLeagueFilter(e.target.value)}
                          className="px-2 py-1 rounded-md border border-border bg-background text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-primary">
                          <option value="all">{t('profile.benchmark_all_leagues')}</option>
                          {benchmarkPeerLeagues.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                        <select value={benchmarkAgeFilter} onChange={e => setBenchmarkAgeFilter(e.target.value)}
                          className="px-2 py-1 rounded-md border border-border bg-background text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-primary">
                          <option value="all">{t('profile.benchmark_all_ages')}</option>
                          <option value="2">+/- 2 {t('common.year')}</option>
                          <option value="5">+/- 5 {t('common.year')}</option>
                          <option value="gen">{t('profile.benchmark_same_gen')}</option>
                        </select>
                        <select value={benchmarkLevelFilter} onChange={e => setBenchmarkLevelFilter(e.target.value)}
                          className="px-2 py-1 rounded-md border border-border bg-background text-[10px] font-medium focus:outline-none focus:ring-1 focus:ring-primary">
                          <option value="all">{t('profile.benchmark_all_levels')}</option>
                          <option value="similar">{t('profile.benchmark_similar_level')}</option>
                        </select>
                        <span className="text-[10px] text-muted-foreground self-center ml-1">({positionPeers.length} {t('profile.benchmark_peers')})</span>
                      </div>
                      {selectedWithData.filter(d => d.avgVal > 0).length > 0 ? (
                        <div className="space-y-2.5">
                          {selectedWithData.map(d => {
                            if (d.avgVal <= 0) return null;
                            const pct = Math.min(100, Math.round((d.playerVal / (d.avgVal * 2)) * 100));
                            const isAbove = d.playerVal >= d.avgVal;
                            return (
                              <div key={d.key}>
                                <div className="flex items-center justify-between text-xs mb-0.5">
                                  <span className="font-medium truncate">{d.label}</span>
                                  <span className="tabular-nums shrink-0 ml-2">
                                    <span className={`font-bold ${isAbove ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>{fmt(d.playerVal)}</span>
                                    <span className="text-muted-foreground ml-1">/ {fmt(d.avgVal)}</span>
                                    {d.rank && <span className="text-muted-foreground/60 ml-1">#{d.rank}/{d.total}</span>}
                                  </span>
                                </div>
                                <div className="h-2 rounded-full bg-muted overflow-hidden relative">
                                  <div className={`h-full rounded-full transition-all ${isAbove ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${pct}%` }} />
                                  <div className="absolute top-0 left-1/2 w-0.5 h-full bg-muted-foreground/30" />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-muted-foreground text-center py-4">{t('profile.benchmark_no_peers')}</p>
                      )}
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          {/* ── Sortable / filterable stats table ── */}
          <Card className="card-warm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('profile.data_detailed_stats')}</h3>
                <div className="flex items-center gap-2">
                  <div className="flex rounded-lg border border-border overflow-hidden text-[10px]">
                    {(['all', 'attack', 'passing', 'defending', 'physical'] as const).map(cat => (
                      <button key={cat} onClick={() => setStatsFilter(cat)}
                        className={`px-2.5 py-1 font-semibold transition-colors ${statsFilter === cat ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}>
                        {t(`profile.data_cat_${cat}`)}
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setShowPer90(!showPer90)}
                    className={`px-2.5 py-1 rounded-lg border text-[10px] font-semibold transition-colors ${showPer90 ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted'}`}>
                    /90
                  </button>
                </div>
              </div>
              <div className="overflow-x-auto rounded-lg border border-border/50">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-semibold">{t('profile.data_stat')}</th>
                      <th className="text-center px-3 py-2 font-semibold cursor-pointer hover:text-foreground select-none"
                        onClick={() => { setStatsSortKey('value'); setStatsSortDir(statsSortDir === 'asc' ? 'desc' : 'asc'); }}>
                        {player.name.split(' ').pop()} {statsSortKey === 'value' ? (statsSortDir === 'desc' ? '\u2193' : '\u2191') : ''}
                      </th>
                      {allEnrichedPlayers.length > 1 && (
                        <th className="text-center px-2 py-2 font-semibold">
                          <div className="flex flex-col items-center gap-0.5">
                            <select value={rankScope} onChange={e => setRankScope(e.target.value as 'all' | 'position' | 'league' | 'age')}
                              className="h-5 px-1 rounded border border-border bg-background text-[10px] font-semibold focus:outline-none focus:ring-1 focus:ring-primary cursor-pointer">
                              <option value="all">{t('profile.rank_scope_all')}</option>
                              <option value="position">{t('profile.rank_scope_position')}</option>
                              <option value="league">{t('profile.rank_scope_league')}</option>
                              <option value="age">{t('profile.rank_scope_age')}</option>
                            </select>
                            <span className="text-[8px] font-normal text-muted-foreground/70 whitespace-nowrap">{rankScopeLabel}</span>
                          </div>
                        </th>
                      )}
                      {comparePlayers.map((cp, i) => (
                        <th key={cp.id} className="text-center px-3 py-2 font-semibold" style={{ color: CHART_COLORS[(i + 1) % CHART_COLORS.length] }}>{cp.name.split(' ').pop()}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const fmt = (v: number | null | undefined) => v == null ? '\u2014' : (Number.isInteger(v) ? v : Math.round(v * 100) / 100);
                      return sortedRows.map(row => {
                        const val = showPer90 && row.per90v != null ? row.per90v : row.raw;
                        const cmpVals = comparePlayers.map(cp => {
                          const cpS = getExtPerfStats(cp);
                          const cpP90 = getExtPer90(cp);
                          return cpS ? (showPer90 && cpP90?.[row.key] != null ? parseFloat(cpP90[row.key]) : parseFloat(String(cpS[row.key] ?? 0))) : null;
                        });
                        const allVals = [val, ...cmpVals].filter(v => v != null) as number[];
                        const bestVal = allVals.length > 1 ? Math.max(...allVals) : null;
                        const isBetter = bestVal != null && val != null && val === bestVal && allVals.length > 1;
                        const isWorse = bestVal != null && val != null && val < bestVal;
                        return (
                          <tr key={row.key} className="border-t border-border/30 hover:bg-muted/30 transition-colors">
                            <td className="px-3 py-2 font-medium">
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-2 ${row.cat === 'attack' ? 'bg-red-400' : row.cat === 'passing' ? 'bg-blue-400' : row.cat === 'defending' ? 'bg-amber-400' : 'bg-green-400'}`} />
                              {row.label}{showPer90 && row.per90v != null ? ' /90' : ''}
                            </td>
                            <td className={`text-center px-3 py-2 font-bold tabular-nums ${isBetter ? 'text-emerald-600 dark:text-emerald-400' : isWorse ? 'text-amber-600 dark:text-amber-400' : ''}`}>
                              {fmt(val)}{showPer90 && row.per90v != null && row.raw != null ? <span className="text-muted-foreground font-normal ml-1">({fmt(row.raw)})</span> : ''}
                            </td>
                            {allEnrichedPlayers.length > 1 && (
                              <td className="text-center px-2 py-2 tabular-nums">
                                {globalRankings[row.key] ? (() => {
                                  const gr = globalRankings[row.key];
                                  const pctColor = gr.percentile >= 75 ? 'bg-emerald-500' : gr.percentile >= 50 ? 'bg-blue-500' : gr.percentile >= 25 ? 'bg-amber-500' : 'bg-gray-400';
                                  const textColor = gr.percentile >= 75 ? 'text-emerald-600 dark:text-emerald-400' : gr.percentile >= 50 ? 'text-blue-600 dark:text-blue-400' : gr.percentile >= 25 ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground';
                                  return (
                                    <div className="flex flex-col items-center gap-0.5">
                                      <div className="w-14 h-1.5 rounded-full bg-muted overflow-hidden">
                                        <div className={`h-full rounded-full ${pctColor}`} style={{ width: `${gr.percentile}%` }} />
                                      </div>
                                      <span className={`text-[9px] font-bold ${textColor}`}>Top {100 - gr.percentile}%</span>
                                    </div>
                                  );
                                })() : <span className="text-muted-foreground/40">\u2014</span>}
                              </td>
                            )}
                            {cmpVals.map((cv, ci) => (
                              <td key={ci} className={`text-center px-3 py-2 tabular-nums font-bold ${cv != null && cv === bestVal && allVals.length > 1 ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'}`}>{fmt(cv)}</td>
                            ))}
                          </tr>
                        );
                      });
                    })()}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* Combined stats / ratios */}
          {s && (
            <Card className="card-warm">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('profile.combined_stats_title')}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  {[
                    { label: 'G+A', value: (s.goals || 0) + (s.assists || 0) },
                    { label: 'G+A /90', value: s.minutes > 0 ? (((s.goals || 0) + (s.assists || 0)) / (s.minutes / 90)).toFixed(2) : '\u2014' },
                    { label: t('profile.shot_accuracy'), value: s.shots_total > 0 ? `${Math.round((s.shots_on / s.shots_total) * 100)}%` : '\u2014' },
                    { label: t('profile.offensive_contrib'), value: s.minutes > 0 ? (((s.goals || 0) + (s.assists || 0) + (s.passes_key || 0)) / (s.minutes / 90)).toFixed(2) : '\u2014', suffix: '/90' },
                    { label: t('profile.defensive_contrib'), value: s.minutes > 0 ? (((s.tackles || 0) + (s.interceptions || 0) + (s.blocks || 0)) / (s.minutes / 90)).toFixed(2) : '\u2014', suffix: '/90' },
                    { label: t('profile.duel_success_rate'), value: s.duels_total > 0 ? `${Math.round((s.duels_won / s.duels_total) * 100)}%` : '\u2014' },
                  ].map((stat, i) => (
                    <div key={i} className="rounded-xl bg-muted/50 p-3 text-center">
                      <p className="text-[10px] text-muted-foreground mb-1">{stat.label}</p>
                      <p className="text-lg font-bold tabular-nums">{stat.value}{stat.suffix ? <span className="text-[10px] text-muted-foreground font-normal ml-0.5">{stat.suffix}</span> : ''}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* All competitions */}
          {ps.all_competitions?.length > 1 && (
            <Card className="card-warm">
              <CardContent className="p-5">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('profile.data_all_comps')}</h3>
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-muted/50 text-muted-foreground">
                      <th className="text-left px-3 py-2 font-semibold">{t('profile.stats_competition')}</th>
                      <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_appearances')}</th>
                      <th className="text-center px-2 py-2 font-semibold">{t('profile.perf_rating')}</th>
                      <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_goals')}</th>
                      <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_assists')}</th>
                    </tr></thead>
                    <tbody>
                      {ps.all_competitions.map((c: { league: string; appearances: number; rating?: string; goals?: number; assists?: number }, ci: number) => (
                        <tr key={ci} className="border-t border-border/30"><td className="px-3 py-2 font-medium">{c.league}</td>
                          <td className="text-center px-2 py-2">{c.appearances}</td>
                          <td className="text-center px-2 py-2 font-bold">{c.rating || '\u2014'}</td>
                          <td className="text-center px-2 py-2">{c.goals || '\u2014'}</td>
                          <td className="text-center px-2 py-2">{c.assists || '\u2014'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </>
      ) : (
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
      )}

      {/* ═══════════════ SECTION 1b: SEASON STATS (Transfermarkt) ═══════════════ */}
      {Array.isArray(ext.season_stats) && ext.season_stats.length > 0 && (
        <Card className="card-warm">
          <CardContent className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />{t('profile.season_stats')}
            </h3>
            {(ext.season_stats as { season: string; rows: { competition: string; club?: string; appearances: number; goals: number; assists: number; yellow_cards: number; second_yellow: number; red_cards: number; minutes: number; starts?: number; sub_in?: number }[]; totals: { appearances: number; goals: number; assists: number; yellow_cards: number; second_yellow: number; red_cards: number; minutes: number; starts?: number; sub_in?: number } }[]).map((seasonData, si) => (
              <div key={si} className={si > 0 ? 'mt-3' : ''}>
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-bold">{seasonData.season}</span>
                  <span className="text-xs text-muted-foreground">{seasonData.totals.appearances} {t('profile.stats_appearances').toLowerCase()}, {seasonData.totals.goals}G {seasonData.totals.assists}A</span>
                </div>
                <div className="overflow-x-auto rounded-lg border border-border/50">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-muted/50 text-muted-foreground">
                        <th className="text-left px-3 py-2 font-semibold">{t('profile.stats_competition')}</th>
                        <th className="text-left px-2 py-2 font-semibold">{t('profile.stats_club')}</th>
                        <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_appearances')}</th>
                        <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_goals')}</th>
                        <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_assists')}</th>
                        <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_yellow')}</th>
                        <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_second_yellow')}</th>
                        <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_red')}</th>
                        <th className="text-center px-2 py-2 font-semibold">{t('profile.stats_minutes')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {seasonData.rows.map((row, i) => (
                        <tr key={i} className="border-t border-border/30 hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 font-medium truncate max-w-[160px]">{row.competition}</td>
                          <td className="px-2 py-2 truncate max-w-[120px] text-muted-foreground">{row.club || '-'}</td>
                          <td className="text-center px-2 py-2 font-bold">{row.appearances || '-'}</td>
                          <td className="text-center px-2 py-2 font-bold">{row.goals || '-'}</td>
                          <td className="text-center px-2 py-2 font-bold">{row.assists || '-'}</td>
                          <td className="text-center px-2 py-2">{row.yellow_cards || '-'}</td>
                          <td className="text-center px-2 py-2">{row.second_yellow || '-'}</td>
                          <td className="text-center px-2 py-2">{row.red_cards || '-'}</td>
                          <td className="text-center px-2 py-2">{row.minutes ? row.minutes.toLocaleString() : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-border bg-muted/40 font-bold">
                        <td className="px-3 py-2" colSpan={2}>{t('profile.stats_total')}</td>
                        <td className="text-center px-2 py-2">{seasonData.totals.appearances}</td>
                        <td className="text-center px-2 py-2">{seasonData.totals.goals || '-'}</td>
                        <td className="text-center px-2 py-2">{seasonData.totals.assists || '-'}</td>
                        <td className="text-center px-2 py-2">{seasonData.totals.yellow_cards || '-'}</td>
                        <td className="text-center px-2 py-2">{seasonData.totals.second_yellow || '-'}</td>
                        <td className="text-center px-2 py-2">{seasonData.totals.red_cards || '-'}</td>
                        <td className="text-center px-2 py-2">{seasonData.totals.minutes ? seasonData.totals.minutes.toLocaleString() : '-'}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground/40 mt-2 text-right">Source: Transfermarkt</p>
          </CardContent>
        </Card>
      )}

      {/* ═══════════════ SECTION 1c: SEASON EVOLUTION CHART ═══════════════ */}
      {Array.isArray(ext.season_stats) && ext.season_stats.length > 1 && (() => {
        const seasonStats = ext.season_stats as { season: string; totals: Record<string, number> }[];
        const statOptions = [
          { value: 'goals', label: t('profile.stats_goals') },
          { value: 'assists', label: t('profile.stats_assists') },
          { value: 'appearances', label: t('profile.stats_appearances') },
          { value: 'minutes', label: t('profile.stats_minutes') },
          { value: 'yellow_cards', label: t('profile.stats_yellow') },
        ];
        const chartData = seasonStats.slice().reverse().map(ss => ({
          season: ss.season,
          value: ss.totals?.[seasonChartStat] ?? 0,
        }));
        return (
          <Card className="card-warm">
            <CardContent className="p-5">
              <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5" />{t('profile.season_evolution')}
                </h3>
                <select value={seasonChartStat} onChange={e => setSeasonChartStat(e.target.value)}
                  className="px-2.5 py-1 rounded-lg border border-border bg-background text-xs font-medium focus:outline-none focus:ring-1 focus:ring-primary">
                  {statOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="season" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                  <RechartsTooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid hsl(var(--border))' }} />
                  <Line type="monotone" dataKey="value" name={statOptions.find(o => o.value === seasonChartStat)?.label}
                    stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 4, fill: 'hsl(var(--primary))' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        );
      })()}

      {/* ═══════════════ SECTION 2: SCOUT EVALUATION ═══════════════ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Overview */}
        <Card className="card-warm lg:col-span-2">
          <CardContent className="p-5">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">{t('profile.perf_overview')}</h3>
                <p className="text-sm text-muted-foreground mt-1">{t('profile.perf_overview_desc')}</p>
              </div>
              <div className="flex items-center gap-6">
                <div className="text-center">
                  <div className="text-4xl font-black text-primary">{overallScore}</div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t('profile.perf_overall')}</p>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-black text-green-500">{player.current_level}</div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t('profile.level')}</p>
                </div>
                <div className="text-center">
                  <div className="text-4xl font-black text-blue-500">{player.potential}</div>
                  <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">{t('profile.potential')}</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Scout radar */}
        <Card className="card-warm">
          <CardContent className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-4">{t('profile.perf_radar_title')}</h3>
            <ResponsiveContainer width="100%" height={300}>
              <RadarChart data={scoutRadarData} cx="50%" cy="50%" outerRadius="75%">
                <PolarGrid stroke="hsl(var(--border))" />
                <PolarAngleAxis dataKey="attr" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <PolarRadiusAxis angle={90} domain={[0, 10]} tick={{ fontSize: 9, fill: 'hsl(var(--muted-foreground))' }} axisLine={false} />
                <Radar name={player.name} dataKey="value" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.2} strokeWidth={2} dot={{ r: 4, fill: 'hsl(var(--primary))' }} />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Editable attribute sliders */}
        <Card className="card-warm">
          <CardContent className="p-5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{t('profile.perf_attributes_title')}</h3>
            <p className="text-[11px] text-muted-foreground mb-4">{t('profile.perf_adjust_hint')}</p>
            <div className="space-y-5">
              {attrSliders.map(attr => (
                <div key={attr.key} className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{attr.label}</span>
                    <span className="text-sm font-bold tabular-nums min-w-[40px] text-right" style={{ color: attr.color }}>{perfScores[attr.key]}/10</span>
                  </div>
                  <input type="range" min={0} max={10} step={1} value={perfScores[attr.key]}
                    onChange={e => updatePerfScore(attr.key, Number(e.target.value))}
                    className="w-full h-2 rounded-full appearance-none cursor-pointer bg-muted accent-primary [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:shadow-md"
                    style={{ accentColor: attr.color }} />
                  <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-300 ease-out" style={{ width: `${perfScores[attr.key] * 10}%`, background: attr.color }} />
                  </div>
                </div>
              ))}
              <div className="pt-3 border-t border-border space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{t('profile.perf_gap')}</span>
                  <span className="text-sm font-bold text-amber-500">{Math.max(0, player.potential - player.current_level)}</span>
                </div>
                <div className="h-2.5 rounded-full bg-muted overflow-hidden relative">
                  <div className="h-full rounded-full bg-green-500 absolute left-0 top-0" style={{ width: `${player.current_level * 10}%` }} />
                  <div className="h-full rounded-full bg-amber-500/30 absolute top-0" style={{ left: `${player.current_level * 10}%`, width: `${Math.max(0, player.potential - player.current_level) * 10}%` }} />
                </div>
                <p className="text-[10px] text-muted-foreground">{t('profile.perf_gap_desc')}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Evolution chart */}
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

        {/* Opinion distribution */}
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
                  const colors: Record<string, string> = {
                    'À suivre': 'bg-green-500',
                    'À revoir': 'bg-amber-500',
                    'Pas pour nous': 'bg-red-500',
                  };
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
    </div>
  );
}
