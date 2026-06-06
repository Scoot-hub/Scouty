// Shared WyScout metric catalogue + position-group helpers, used by the /data
// hub pages (explore, scatter, profile). Mirrors the STATS list historically
// embedded in PlayerCompare.tsx and the server-side WYSCOUT_POSITION_GROUPS.
import { useTranslation } from 'react-i18next';
import type { WyscoutStatRow } from '@/hooks/use-wyscout-stats';

export type MetricCat = 'volume' | 'attack' | 'passing' | 'defense' | 'set' | 'gk' | 'physical';

export interface MetricDef {
  key: keyof WyscoutStatRow;
  label: string;
  cat: MetricCat;
  max: number;
  isPct?: boolean;
  decimals?: number;
  higherIsBetter?: boolean; // false = lower is better
}

export const METRIC_CAT_LABEL: Record<MetricCat, string> = {
  volume: 'Volume',
  attack: 'Attaque',
  passing: 'Création & Passes',
  defense: 'Défense',
  set: 'Coups de pied arrêtés',
  gk: 'Gardien',
  physical: 'Physique',
};

export const METRICS: MetricDef[] = [
  { key: 'matches_played', label: 'Matchs', cat: 'volume', max: 40, decimals: 0 },
  { key: 'minutes_played', label: 'Minutes', cat: 'volume', max: 3500, decimals: 0 },
  { key: 'goals', label: 'Buts (total)', cat: 'attack', max: 30, decimals: 0 },
  { key: 'goals_per90', label: 'Buts/90', cat: 'attack', max: 1 },
  { key: 'np_goals_per90', label: 'Buts hors PK/90', cat: 'attack', max: 1 },
  { key: 'xg', label: 'xG (total)', cat: 'attack', max: 25 },
  { key: 'xg_per90', label: 'xG/90', cat: 'attack', max: 1 },
  { key: 'shots_per90', label: 'Tirs/90', cat: 'attack', max: 5 },
  { key: 'shots_on_target_pct', label: '% Tirs cadrés', cat: 'attack', max: 100, isPct: true },
  { key: 'goal_conversion_pct', label: '% Conversion', cat: 'attack', max: 30, isPct: true },
  { key: 'head_goals_per90', label: 'Buts tête/90', cat: 'attack', max: 0.3 },
  { key: 'dribbles_per90', label: 'Dribbles/90', cat: 'attack', max: 8 },
  { key: 'dribbles_success_pct', label: '% Dribbles', cat: 'attack', max: 100, isPct: true },
  { key: 'touches_in_box_per90', label: 'Touches surface/90', cat: 'attack', max: 10 },
  { key: 'progressive_runs_per90', label: 'Courses prog./90', cat: 'attack', max: 6 },
  { key: 'accelerations_per90', label: 'Accélérations/90', cat: 'attack', max: 5 },
  { key: 'offensive_duels_per90', label: 'Duels off./90', cat: 'attack', max: 12 },
  { key: 'offensive_duels_won_pct', label: '% Duels off.', cat: 'attack', max: 100, isPct: true },
  { key: 'assists', label: 'Assists (total)', cat: 'passing', max: 20, decimals: 0 },
  { key: 'assists_per90', label: 'Assists/90', cat: 'passing', max: 0.6 },
  { key: 'xa_per90', label: 'xA/90', cat: 'passing', max: 0.5 },
  { key: 'passes_per90', label: 'Passes/90', cat: 'passing', max: 80 },
  { key: 'passes_accurate_pct', label: '% Passes', cat: 'passing', max: 100, isPct: true },
  { key: 'forward_passes_per90', label: 'Passes avant/90', cat: 'passing', max: 25 },
  { key: 'forward_passes_accurate_pct', label: '% Passes avant', cat: 'passing', max: 100, isPct: true },
  { key: 'long_passes_per90', label: 'Longues passes/90', cat: 'passing', max: 10 },
  { key: 'long_passes_accurate_pct', label: '% Longues passes', cat: 'passing', max: 100, isPct: true },
  { key: 'key_passes_per90', label: 'Passes clés/90', cat: 'passing', max: 3 },
  { key: 'smart_passes_per90', label: 'Smart passes/90', cat: 'passing', max: 3 },
  { key: 'smart_passes_accurate_pct', label: '% Smart passes', cat: 'passing', max: 100, isPct: true },
  { key: 'through_passes_per90', label: 'Passes traversantes/90', cat: 'passing', max: 2 },
  { key: 'through_passes_accurate_pct', label: '% Passes traversantes', cat: 'passing', max: 100, isPct: true },
  { key: 'progressive_passes_per90', label: 'Passes prog./90', cat: 'passing', max: 12 },
  { key: 'progressive_passes_accurate_pct', label: '% Passes prog.', cat: 'passing', max: 100, isPct: true },
  { key: 'crosses_per90', label: 'Centres/90', cat: 'passing', max: 8 },
  { key: 'crosses_accurate_pct', label: '% Centres', cat: 'passing', max: 100, isPct: true },
  { key: 'passes_final_third_per90', label: 'Passes 3e tiers/90', cat: 'passing', max: 25 },
  { key: 'passes_penalty_area_per90', label: 'Passes surface/90', cat: 'passing', max: 6 },
  { key: 'shot_assists_per90', label: 'Passes vers tir/90', cat: 'passing', max: 3 },
  { key: 'defensive_actions_per90', label: 'Actions déf./90', cat: 'defense', max: 12 },
  { key: 'defensive_duels_per90', label: 'Duels déf./90', cat: 'defense', max: 12 },
  { key: 'defensive_duels_won_pct', label: '% Duels déf.', cat: 'defense', max: 100, isPct: true },
  { key: 'aerial_duels_per90', label: 'Duels aériens/90', cat: 'defense', max: 10 },
  { key: 'aerial_duels_won_pct', label: '% Duels aériens', cat: 'defense', max: 100, isPct: true },
  { key: 'sliding_tackles_per90', label: 'Tacles gliss./90', cat: 'defense', max: 2 },
  { key: 'padj_sliding_tackles', label: 'Tacles ajustés', cat: 'defense', max: 2 },
  { key: 'interceptions_per90', label: 'Intercept./90', cat: 'defense', max: 8 },
  { key: 'padj_interceptions', label: 'Intercept. ajust.', cat: 'defense', max: 8 },
  { key: 'shots_blocked_per90', label: 'Tirs bloqués/90', cat: 'defense', max: 1.5 },
  { key: 'fouls_per90', label: 'Fautes/90', cat: 'defense', max: 3, higherIsBetter: false },
  { key: 'duels_per90', label: 'Duels totaux/90', cat: 'defense', max: 25 },
  { key: 'duels_won_pct', label: '% Duels totaux', cat: 'defense', max: 100, isPct: true },
  { key: 'free_kicks_per90', label: 'CF/90', cat: 'set', max: 5 },
  { key: 'direct_free_kicks_per90', label: 'CF directs/90', cat: 'set', max: 1.5 },
  { key: 'direct_free_kicks_on_target_pct', label: '% CF cadrés', cat: 'set', max: 100, isPct: true },
  { key: 'corners_per90', label: 'Corners/90', cat: 'set', max: 5 },
  { key: 'penalty_conversion_pct', label: '% Pénos', cat: 'set', max: 100, isPct: true },
  { key: 'conceded_goals_per90', label: 'Buts encaissés/90', cat: 'gk', max: 2, higherIsBetter: false },
  { key: 'shots_against_per90', label: 'Tirs contre/90', cat: 'gk', max: 6 },
  { key: 'save_rate_pct', label: '% Arrêts', cat: 'gk', max: 100, isPct: true },
  { key: 'xg_against_per90', label: 'xG contre/90', cat: 'gk', max: 2, higherIsBetter: false },
  { key: 'prevented_goals_per90', label: 'Buts évités/90', cat: 'gk', max: 1 },
  { key: 'gk_exits_per90', label: 'Sorties/90', cat: 'gk', max: 1.5 },
  { key: 'gk_aerial_duels_per90', label: 'Aériens GK/90', cat: 'gk', max: 1.5 },
  { key: 'total_distance_per90', label: 'Distance/90 (m)', cat: 'physical', max: 12000, decimals: 0 },
  { key: 'hsr_distance_per90', label: 'Course rapide/90 (m)', cat: 'physical', max: 1000, decimals: 0 },
  { key: 'sprint_distance_per90', label: 'Sprint/90 (m)', cat: 'physical', max: 400, decimals: 0 },
  { key: 'hi_distance_per90', label: 'Haute intensité/90 (m)', cat: 'physical', max: 1500, decimals: 0 },
  { key: 'max_speed', label: 'Vitesse max (km/h)', cat: 'physical', max: 40 },
  { key: 'high_accel_per90', label: 'Accél. fortes/90', cat: 'physical', max: 25 },
  { key: 'high_decel_per90', label: 'Décel. fortes/90', cat: 'physical', max: 25 },
  { key: 'sprint_count_per90', label: 'Sprints/90', cat: 'physical', max: 30 },
];

export const METRIC_BY_KEY: Record<string, MetricDef> = Object.fromEntries(METRICS.map(m => [m.key as string, m]));

export function metricLabel(key: string): string {
  return METRIC_BY_KEY[key]?.label ?? key;
}

// Translated metric label hook — `metrics.<key>` i18n with the FR catalogue
// label as default. Returns a (key) => string resolver and the category labeler.
export function useMetricLabel() {
  const { t } = useTranslation();
  const label = (key: string): string =>
    t(`metrics.${key}`, { defaultValue: METRIC_BY_KEY[key]?.label ?? key }) as string;
  const catLabel = (cat: MetricCat): string =>
    t(`metric_cat.${cat}`, { defaultValue: METRIC_CAT_LABEL[cat] }) as string;
  return { label, catLabel };
}

// ── Position groups (mirror of server WYSCOUT_POSITION_GROUPS) ──────────────
export interface PositionGroup {
  key: string;
  label: string;
  short: string;
  positions: string[];
}
export const POSITION_GROUPS: PositionGroup[] = [
  { key: 'GK',      label: 'Gardiens',          short: 'GB',  positions: ['GK', 'GB'] },
  { key: 'DEF_C',   label: 'Défenseurs centraux', short: 'DC', positions: ['DC'] },
  { key: 'DEF_L',   label: 'Latéraux',          short: 'LAT', positions: ['LD', 'LG', 'DD', 'DG'] },
  { key: 'MID_DEF', label: 'Milieux défensifs', short: 'MDef', positions: ['MDef', 'MDC'] },
  { key: 'MID_C',   label: 'Milieux centraux',  short: 'MC',  positions: ['MC'] },
  { key: 'MID_OFF', label: 'Milieux offensifs', short: 'MO',  positions: ['MO', 'MOC'] },
  { key: 'WING',    label: 'Ailiers',           short: 'AIL', positions: ['AD', 'AG'] },
  { key: 'ATT',     label: 'Attaquants',        short: 'BU',  positions: ['ATT', 'BU'] },
];
export const POSITION_GROUP_BY_KEY: Record<string, PositionGroup> = Object.fromEntries(POSITION_GROUPS.map(g => [g.key, g]));

export function groupForPosition(pos: string | null | undefined): PositionGroup | null {
  const p = String(pos || '').trim().toLowerCase();
  if (!p) return null;
  return POSITION_GROUPS.find(g => g.positions.some(x => x.toLowerCase() === p)) ?? null;
}

export const POSITION_LABELS: Record<string, string> = {
  GK: 'Gardien', GB: 'Gardien',
  DC: 'Défenseur central',
  LD: 'Latéral droit', LG: 'Latéral gauche', DD: 'Latéral droit', DG: 'Latéral gauche',
  MDef: 'Milieu défensif', MDC: 'Milieu défensif',
  MC: 'Milieu central',
  MO: 'Milieu offensif', MOC: 'Milieu offensif',
  AD: 'Ailier droit', AG: 'Ailier gauche',
  ATT: 'Attaquant', BU: 'Attaquant',
};

export const FOOT_OPTIONS = ['Droitier', 'Gaucher', 'Ambidextre'];

export const isGoalkeeperGroup = (groupKey: string | null | undefined) => groupKey === 'GK';

// ── Value helpers ───────────────────────────────────────────────────────────
export const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return Number.isFinite(n) ? n : null;
};

export function fmtMetric(v: number | null | undefined, def?: MetricDef): string {
  if (v == null || !Number.isFinite(Number(v))) return '—';
  const n = Number(v);
  if (def?.isPct) return `${Math.round(n * 10) / 10}%`;
  if (def?.decimals === 0) return String(Math.round(n));
  return Number.isInteger(n) ? String(n) : (Math.round(n * 100) / 100).toString();
}

// Parse "2.5M€" / "500K€" / "1200€" → number of euros.
export function parseMarketValue(s: string | null | undefined): number | null {
  if (s == null) return null;
  const str = String(s).trim();
  if (!str) return null;
  const m = str.replace(/\s/g, '').match(/([\d.,]+)\s*([mkMK])?/);
  if (!m) return null;
  let n = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(n)) return null;
  const suf = (m[2] || '').toLowerCase();
  if (suf === 'm') n *= 1_000_000;
  else if (suf === 'k') n *= 1_000;
  return Math.round(n);
}

export function fmtMarketValueShort(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M€`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K€`;
  return `${n}€`;
}

// Percentile → tailwind bg class (high = good, since server already flips
// lower-is-better metrics).
export function percentileColor(p: number | null | undefined): string {
  if (p == null) return 'bg-muted-foreground/40';
  if (p >= 80) return 'bg-emerald-500';
  if (p >= 60) return 'bg-lime-500';
  if (p >= 40) return 'bg-amber-500';
  if (p >= 20) return 'bg-orange-500';
  return 'bg-red-500';
}

export const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// A compact, sensible default set of display metrics per group for the explore
// table (outfield vs GK).
export const DEFAULT_DISPLAY_METRICS: Record<string, string[]> = {
  GK: ['save_rate_pct', 'conceded_goals_per90', 'prevented_goals_per90', 'gk_exits_per90', 'passes_accurate_pct'],
  DEF_C: ['aerial_duels_won_pct', 'defensive_duels_won_pct', 'interceptions_per90', 'progressive_passes_per90', 'passes_accurate_pct'],
  DEF_L: ['crosses_per90', 'progressive_runs_per90', 'defensive_duels_won_pct', 'dribbles_per90', 'xa_per90'],
  MID_DEF: ['interceptions_per90', 'defensive_duels_won_pct', 'passes_accurate_pct', 'progressive_passes_per90', 'duels_won_pct'],
  MID_C: ['passes_per90', 'progressive_passes_per90', 'key_passes_per90', 'duels_won_pct', 'interceptions_per90'],
  MID_OFF: ['key_passes_per90', 'xa_per90', 'assists_per90', 'dribbles_per90', 'shots_per90'],
  WING: ['dribbles_per90', 'xa_per90', 'crosses_per90', 'goals_per90', 'progressive_runs_per90'],
  ATT: ['goals_per90', 'xg_per90', 'shots_per90', 'touches_in_box_per90', 'aerial_duels_won_pct'],
};
export const DEFAULT_DISPLAY_FALLBACK = ['goals_per90', 'assists_per90', 'passes_accurate_pct', 'duels_won_pct', 'interceptions_per90'];
