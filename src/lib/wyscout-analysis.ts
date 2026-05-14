import type { WyscoutStatRow } from '@/hooks/use-wyscout-stats';

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return isNaN(n) ? null : n;
};

// ── Role templates: each stat has absolute thresholds, independent of peers ──
// goodValue: stat scores 1.0 at or beyond this value
// poorValue: stat scores 0.0 at or beyond this value
// If goodValue > poorValue → "higher is better"
// If goodValue < poorValue → "lower is better" (antistat)
export interface RoleStatTarget {
  db: keyof WyscoutStatRow;
  goodValue: number;
  poorValue: number;
  weight: number;       // 1 = normal, 2 = signature
}

export interface RoleTemplate {
  key: string;
  label: string;
  positions: string[];
  template: RoleStatTarget[];
  isCustom?: boolean;
  createdAt?: number;
}

// Thresholds calibrated for pro/semi-pro adult football. They can be edited if
// the user creates a custom profile — the same scoring math applies.
export const ROLE_PROFILES: RoleTemplate[] = [
  // ── Attackers ──
  {
    key: 'goal_scorer', label: 'Buteur', positions: ['ATT'],
    template: [
      { db: 'goals_per90',             goodValue: 0.55, poorValue: 0.15, weight: 2 },
      { db: 'xg_per90',                goodValue: 0.55, poorValue: 0.15, weight: 2 },
      { db: 'shots_per90',             goodValue: 3.5,  poorValue: 1.5,  weight: 1 },
      { db: 'touches_in_box_per90',    goodValue: 8,    poorValue: 3.5,  weight: 1 },
      { db: 'goal_conversion_pct',     goodValue: 18,   poorValue: 6,    weight: 1 },
      { db: 'defensive_actions_per90', goodValue: 3,    poorValue: 7,    weight: 1 }, // antistat
    ],
  },
  {
    key: 'target_man', label: 'Pivot', positions: ['ATT'],
    template: [
      { db: 'aerial_duels_won_pct',   goodValue: 65, poorValue: 50, weight: 2 },
      { db: 'aerial_duels_per90',     goodValue: 9,  poorValue: 4,  weight: 2 },
      { db: 'head_goals_per90',       goodValue: 0.12, poorValue: 0.02, weight: 1 },
      { db: 'offensive_duels_per90',  goodValue: 10, poorValue: 4,  weight: 1 },
      { db: 'dribbles_per90',         goodValue: 1,  poorValue: 4,  weight: 1 }, // antistat
      { db: 'progressive_runs_per90', goodValue: 1,  poorValue: 4,  weight: 1 }, // antistat
    ],
  },
  {
    key: 'pressing_forward', label: 'Avant-centre pressing', positions: ['ATT'],
    template: [
      { db: 'defensive_actions_per90', goodValue: 9,  poorValue: 4,  weight: 2 },
      { db: 'duels_per90',             goodValue: 22, poorValue: 14, weight: 1 },
      { db: 'fouls_per90',             goodValue: 2,  poorValue: 0.8, weight: 1 },
      { db: 'progressive_runs_per90',  goodValue: 4,  poorValue: 1.5, weight: 1 },
      { db: 'sprint_count_per90',      goodValue: 18, poorValue: 8,  weight: 1 },
    ],
  },
  {
    key: 'false_nine', label: 'Faux 9', positions: ['ATT'],
    template: [
      { db: 'key_passes_per90',         goodValue: 2.5,  poorValue: 1.0,  weight: 2 },
      { db: 'xa_per90',                 goodValue: 0.3,  poorValue: 0.1,  weight: 2 },
      { db: 'passes_per90',             goodValue: 40,   poorValue: 22,   weight: 1 },
      { db: 'assists_per90',            goodValue: 0.25, poorValue: 0.08, weight: 1 },
      { db: 'progressive_passes_per90', goodValue: 7,    poorValue: 3,    weight: 1 },
      { db: 'touches_in_box_per90',     goodValue: 2.5,  poorValue: 6,    weight: 1 }, // antistat
      { db: 'aerial_duels_per90',       goodValue: 2,    poorValue: 6,    weight: 1 }, // antistat
    ],
  },
  {
    key: 'second_striker', label: 'Avant inter', positions: ['ATT', 'MO'],
    template: [
      { db: 'assists_per90',         goodValue: 0.3,  poorValue: 0.1,  weight: 2 },
      { db: 'key_passes_per90',      goodValue: 2.5,  poorValue: 1.0,  weight: 2 },
      { db: 'dribbles_per90',        goodValue: 5,    poorValue: 2,    weight: 1 },
      { db: 'xa_per90',              goodValue: 0.25, poorValue: 0.1,  weight: 1 },
      { db: 'goals_per90',           goodValue: 0.4,  poorValue: 0.15, weight: 1 },
      { db: 'touches_in_box_per90',  goodValue: 5,    poorValue: 2.5,  weight: 1 },
    ],
  },

  // ── Wingers ──
  {
    key: 'inverted_winger', label: 'Ailier inversé', positions: ['AD', 'AG'],
    template: [
      { db: 'dribbles_per90',          goodValue: 7,    poorValue: 3,    weight: 2 },
      { db: 'shots_per90',             goodValue: 3.5,  poorValue: 1.5,  weight: 2 },
      { db: 'touches_in_box_per90',    goodValue: 7,    poorValue: 3,    weight: 1 },
      { db: 'progressive_runs_per90',  goodValue: 5.5,  poorValue: 2.5,  weight: 1 },
      { db: 'goals_per90',             goodValue: 0.4,  poorValue: 0.15, weight: 1 },
      { db: 'crosses_per90',           goodValue: 1.5,  poorValue: 5,    weight: 1 }, // antistat
    ],
  },
  {
    key: 'wide_creator', label: 'Ailier créateur', positions: ['AD', 'AG'],
    template: [
      { db: 'crosses_per90',           goodValue: 7,    poorValue: 3,    weight: 2 },
      { db: 'xa_per90',                goodValue: 0.35, poorValue: 0.15, weight: 2 },
      { db: 'crosses_accurate_pct',    goodValue: 40,   poorValue: 25,   weight: 1 },
      { db: 'assists_per90',           goodValue: 0.35, poorValue: 0.15, weight: 1 },
      { db: 'key_passes_per90',        goodValue: 2.5,  poorValue: 1.0,  weight: 1 },
      { db: 'shots_per90',             goodValue: 1,    poorValue: 3,    weight: 1 }, // antistat
    ],
  },

  // ── Midfielders ──
  {
    key: 'playmaker', label: 'Meneur de jeu', positions: ['MO', 'MC'],
    template: [
      { db: 'key_passes_per90',         goodValue: 2.8,  poorValue: 1.0,  weight: 2 },
      { db: 'xa_per90',                 goodValue: 0.35, poorValue: 0.15, weight: 2 },
      { db: 'smart_passes_per90',       goodValue: 3.0,  poorValue: 1.0,  weight: 1 },
      { db: 'progressive_passes_per90', goodValue: 12,   poorValue: 5,    weight: 1 },
      { db: 'through_passes_per90',     goodValue: 1.5,  poorValue: 0.5,  weight: 1 },
      { db: 'defensive_actions_per90',  goodValue: 4,    poorValue: 8,    weight: 1 }, // antistat
    ],
  },
  {
    key: 'box_to_box', label: 'Box-to-box', positions: ['MC'],
    template: [
      { db: 'progressive_runs_per90',  goodValue: 4,     poorValue: 1.5,   weight: 2 },
      { db: 'duels_per90',             goodValue: 20,    poorValue: 12,    weight: 1 },
      { db: 'duels_won_pct',           goodValue: 60,    poorValue: 48,    weight: 1 },
      { db: 'passes_per90',            goodValue: 55,    poorValue: 35,    weight: 1 },
      { db: 'interceptions_per90',     goodValue: 3,     poorValue: 1.5,   weight: 1 },
      { db: 'total_distance_per90',    goodValue: 11500, poorValue: 9000,  weight: 1 },
    ],
  },
  {
    key: 'mezzala', label: 'Mezzala', positions: ['MC'],
    template: [
      { db: 'progressive_runs_per90',  goodValue: 4.5,  poorValue: 2,    weight: 2 },
      { db: 'assists_per90',           goodValue: 0.25, poorValue: 0.08, weight: 1 },
      { db: 'key_passes_per90',        goodValue: 2,    poorValue: 0.8,  weight: 1 },
      { db: 'xa_per90',                goodValue: 0.2,  poorValue: 0.08, weight: 1 },
      { db: 'shots_per90',             goodValue: 2,    poorValue: 0.8,  weight: 1 },
      { db: 'touches_in_box_per90',    goodValue: 3,    poorValue: 1,    weight: 1 },
    ],
  },
  {
    key: 'regulator', label: 'Régulateur', positions: ['MDef', 'MC'],
    template: [
      { db: 'passes_per90',              goodValue: 90,  poorValue: 60,  weight: 2 },
      { db: 'passes_accurate_pct',       goodValue: 93,  poorValue: 86,  weight: 2 },
      { db: 'long_passes_accurate_pct',  goodValue: 75,  poorValue: 55,  weight: 1 },
      { db: 'progressive_passes_per90',  goodValue: 10,  poorValue: 5,   weight: 1 },
      { db: 'defensive_duels_per90',     goodValue: 2,   poorValue: 8,   weight: 1 }, // antistat
      { db: 'dribbles_per90',            goodValue: 0.3, poorValue: 2,   weight: 1 }, // antistat
    ],
  },
  {
    key: 'defensive_mid', label: 'Sentinelle', positions: ['MDef', 'MC'],
    template: [
      { db: 'interceptions_per90',       goodValue: 5,    poorValue: 2.5,  weight: 2 },
      { db: 'defensive_duels_won_pct',   goodValue: 68,   poorValue: 55,   weight: 2 },
      { db: 'sliding_tackles_per90',     goodValue: 1.0,  poorValue: 0.4,  weight: 1 },
      { db: 'aerial_duels_won_pct',      goodValue: 65,   poorValue: 50,   weight: 1 },
      { db: 'passes_accurate_pct',       goodValue: 88,   poorValue: 78,   weight: 1 },
      { db: 'dribbles_per90',            goodValue: 0.5,  poorValue: 2,    weight: 1 }, // antistat
      { db: 'shots_per90',               goodValue: 0.3,  poorValue: 1.5,  weight: 1 }, // antistat
    ],
  },
  {
    key: 'deep_lying_playmaker', label: 'Régisseur', positions: ['MDef', 'MC'],
    template: [
      { db: 'passes_per90',              goodValue: 80,   poorValue: 50,   weight: 2 },
      { db: 'long_passes_accurate_pct',  goodValue: 70,   poorValue: 55,   weight: 2 },
      { db: 'passes_accurate_pct',       goodValue: 92,   poorValue: 85,   weight: 1 },
      { db: 'progressive_passes_per90',  goodValue: 12,   poorValue: 6,    weight: 1 },
      { db: 'forward_passes_per90',      goodValue: 22,   poorValue: 12,   weight: 1 },
      { db: 'defensive_duels_per90',     goodValue: 3,    poorValue: 10,   weight: 1 }, // antistat
    ],
  },

  // ── Center backs ──
  {
    key: 'ball_playing_cb', label: 'Défenseur relanceur', positions: ['DC'],
    template: [
      { db: 'progressive_passes_per90', goodValue: 12,   poorValue: 5,    weight: 2 },
      { db: 'long_passes_accurate_pct', goodValue: 75,   poorValue: 60,   weight: 2 },
      { db: 'passes_accurate_pct',      goodValue: 93,   poorValue: 85,   weight: 1 },
      { db: 'forward_passes_per90',     goodValue: 20,   poorValue: 10,   weight: 1 },
      { db: 'aerial_duels_won_pct',     goodValue: 68,   poorValue: 55,   weight: 1 },
      { db: 'fouls_per90',              goodValue: 0.5,  poorValue: 1.5,  weight: 1 }, // antistat
    ],
  },
  {
    key: 'stopper_cb', label: 'Défenseur stopper', positions: ['DC'],
    template: [
      { db: 'aerial_duels_won_pct',      goodValue: 75,  poorValue: 60,   weight: 2 },
      { db: 'defensive_duels_won_pct',   goodValue: 75,  poorValue: 60,   weight: 2 },
      { db: 'interceptions_per90',       goodValue: 6,   poorValue: 3,    weight: 1 },
      { db: 'shots_blocked_per90',       goodValue: 1,   poorValue: 0.3,  weight: 1 },
      { db: 'progressive_passes_per90',  goodValue: 4,   poorValue: 10,   weight: 1 }, // antistat
      { db: 'dribbles_per90',            goodValue: 0.3, poorValue: 2,    weight: 1 }, // antistat
    ],
  },

  // ── Fullbacks ──
  {
    key: 'attacking_fullback', label: 'Latéral offensif', positions: ['LD', 'LG'],
    template: [
      { db: 'crosses_per90',             goodValue: 5,    poorValue: 2,    weight: 2 },
      { db: 'progressive_runs_per90',    goodValue: 4,    poorValue: 1.5,  weight: 1 },
      { db: 'assists_per90',             goodValue: 0.25, poorValue: 0.1,  weight: 1 },
      { db: 'dribbles_per90',            goodValue: 3.5,  poorValue: 1,    weight: 1 },
      { db: 'touches_in_box_per90',      goodValue: 3,    poorValue: 1,    weight: 1 },
      { db: 'defensive_duels_won_pct',   goodValue: 50,   poorValue: 70,   weight: 1 }, // antistat
    ],
  },
  {
    key: 'defensive_fullback', label: 'Latéral défensif', positions: ['LD', 'LG'],
    template: [
      { db: 'defensive_duels_won_pct',   goodValue: 68,   poorValue: 55,   weight: 2 },
      { db: 'interceptions_per90',       goodValue: 6,    poorValue: 3,    weight: 1 },
      { db: 'aerial_duels_won_pct',      goodValue: 65,   poorValue: 50,   weight: 1 },
      { db: 'duels_won_pct',             goodValue: 60,   poorValue: 50,   weight: 1 },
      { db: 'crosses_per90',             goodValue: 1,    poorValue: 3.5,  weight: 1 }, // antistat
      { db: 'touches_in_box_per90',      goodValue: 0.5,  poorValue: 2,    weight: 1 }, // antistat
    ],
  },
  {
    key: 'inverted_fullback', label: 'Latéral inversé', positions: ['LD', 'LG'],
    template: [
      { db: 'progressive_passes_per90',  goodValue: 8,    poorValue: 3,    weight: 2 },
      { db: 'passes_per90',              goodValue: 55,   poorValue: 35,   weight: 2 },
      { db: 'passes_accurate_pct',       goodValue: 89,   poorValue: 80,   weight: 1 },
      { db: 'forward_passes_per90',      goodValue: 14,   poorValue: 7,    weight: 1 },
      { db: 'crosses_per90',             goodValue: 1,    poorValue: 4,    weight: 1 }, // antistat
      { db: 'touches_in_box_per90',      goodValue: 0.5,  poorValue: 2.5,  weight: 1 }, // antistat
    ],
  },

  // ── Goalkeepers ──
  {
    key: 'sweeper_keeper', label: 'Gardien libéro', positions: ['GK'],
    template: [
      { db: 'gk_exits_per90',            goodValue: 1.5,  poorValue: 0.6,  weight: 2 },
      { db: 'passes_per90',              goodValue: 40,   poorValue: 22,   weight: 1 },
      { db: 'long_passes_accurate_pct',  goodValue: 65,   poorValue: 50,   weight: 1 },
      { db: 'forward_passes_per90',      goodValue: 18,   poorValue: 8,    weight: 1 },
    ],
  },
  {
    key: 'shot_stopper', label: 'Gardien de surface', positions: ['GK'],
    template: [
      { db: 'save_rate_pct',             goodValue: 78,   poorValue: 65,   weight: 2 },
      { db: 'prevented_goals_per90',     goodValue: 0.2,  poorValue: -0.1, weight: 2 },
      { db: 'gk_aerial_duels_per90',     goodValue: 1.2,  poorValue: 0.4,  weight: 1 },
      { db: 'gk_exits_per90',            goodValue: 0.5,  poorValue: 1.5,  weight: 1 }, // antistat
    ],
  },
];

// ── Scoring against absolute thresholds (no peers required) ──────────────
export function statScore(value: number, target: RoleStatTarget): number {
  const { goodValue, poorValue } = target;
  if (goodValue === poorValue) return 0;
  const raw = (value - poorValue) / (goodValue - poorValue);
  return Math.max(0, Math.min(1, raw));
}

export interface RoleSignature {
  db: keyof WyscoutStatRow;
  value: number;
  goodValue: number;
  poorValue: number;
  match: number;
  weight: number;
}

export interface RoleResult {
  key: string;
  label: string;
  score: number;            // 0-100
  confidence: 'strong' | 'good' | 'fair' | 'weak';
  validStats: number;
  totalStats: number;
  signature: RoleSignature[];
  isCustom?: boolean;
}

export function scoreAgainstTemplate(row: WyscoutStatRow, template: RoleTemplate): RoleResult | null {
  const totalStats = template.template.length;
  let totalWeight = 0;
  let weightedSum = 0;
  const signature: RoleSignature[] = [];

  for (const t of template.template) {
    const v = toNum(row[t.db]);
    if (v === null) continue;
    const m = statScore(v, t);
    weightedSum += t.weight * m;
    totalWeight += t.weight;
    signature.push({ db: t.db, value: v, goodValue: t.goodValue, poorValue: t.poorValue, match: m, weight: t.weight });
  }

  const validStats = signature.length;
  if (validStats === 0 || validStats < Math.ceil(totalStats * 0.5)) return null;

  const score = Math.round((weightedSum / totalWeight) * 100);
  const confidence: RoleResult['confidence'] =
    score >= 80 ? 'strong' : score >= 65 ? 'good' : score >= 50 ? 'fair' : 'weak';

  signature.sort((a, b) => (b.weight * b.match) - (a.weight * a.match));

  return {
    key: template.key,
    label: template.label,
    score,
    confidence,
    validStats,
    totalStats,
    signature,
    isCustom: template.isCustom,
  };
}

export function detectRole(
  row: WyscoutStatRow,
  position: string,
  templates: RoleTemplate[] = ROLE_PROFILES,
): RoleResult[] {
  const candidates = templates.filter(p => p.positions.includes(position));
  if (candidates.length === 0) return [];
  return candidates
    .map(role => scoreAgainstTemplate(row, role))
    .filter((r): r is RoleResult => r !== null)
    .sort((a, b) => b.score - a.score);
}

// ── Result interpretation ────────────────────────────────────────────────
export interface RoleDetection {
  primary: RoleResult | null;
  secondary: RoleResult | null;
  isIndeterminate: boolean;
  isHybrid: boolean;
}

const INDETERMINATE_THRESHOLD = 50;
const HYBRID_GAP = 8;
const HYBRID_MIN_SECONDARY = 60;

export function interpretRoles(results: RoleResult[]): RoleDetection {
  if (results.length === 0) {
    return { primary: null, secondary: null, isIndeterminate: true, isHybrid: false };
  }
  const top = results[0];
  const second = results[1] ?? null;

  if (top.score < INDETERMINATE_THRESHOLD) {
    return { primary: top, secondary: null, isIndeterminate: true, isHybrid: false };
  }

  if (second && (top.score - second.score) < HYBRID_GAP && second.score >= HYBRID_MIN_SECONDARY) {
    return { primary: top, secondary: second, isIndeterminate: false, isHybrid: true };
  }

  return { primary: top, secondary: null, isIndeterminate: false, isHybrid: false };
}

// ── Insights — group-relative percentile or absolute benchmark fallback ──
export interface Insight {
  kind: 'strength' | 'weakness' | 'trend-up' | 'trend-down';
  metric: keyof WyscoutStatRow;
  label: string;
  value: number;
  score?: number;        // 0-100. Either percentile in group (mode='relative') or absolute (mode='absolute')
  tier?: 'elite' | 'very_good' | 'good' | 'average' | 'weak' | 'very_weak';
  mode?: 'relative' | 'absolute';
  delta?: number;
  unit?: string;
}

// Map a benchmark to its "less is better" status (elite < poor)
function benchmarkInverted(b: StatBenchmark | undefined): boolean {
  if (!b) return false;
  return b.elite < b.poor;
}

export function isInvertedStat(stat: keyof WyscoutStatRow): boolean {
  return benchmarkInverted(BENCHMARK_BY_DB.get(stat as string));
}

// Absolute football benchmarks. `elite` = score 100, `poor` = score 0.
// If elite < poor, "less is better" (the math handles it automatically).
interface StatBenchmark {
  db: keyof WyscoutStatRow;
  label: string;
  unit?: string;
  elite: number;
  poor: number;
}

const STAT_BENCHMARKS: StatBenchmark[] = [
  // Attack
  { db: 'goals_per90',          label: 'buts /90',              elite: 0.55,  poor: 0.05 },
  { db: 'xg_per90',             label: 'xG /90',                elite: 0.5,   poor: 0.05 },
  { db: 'np_goals_per90',       label: 'buts hors pen. /90',    elite: 0.5,   poor: 0.05 },
  { db: 'shots_per90',          label: 'tirs /90',              elite: 3.5,   poor: 0.8 },
  { db: 'shots_on_target_pct',  label: 'tirs cadrés',  unit: '%', elite: 50, poor: 25 },
  { db: 'goal_conversion_pct',  label: 'conversion buts',  unit: '%', elite: 18, poor: 4 },
  { db: 'touches_in_box_per90', label: 'touches surface /90',   elite: 7,     poor: 1.5 },
  { db: 'head_goals_per90',     label: 'buts de la tête /90',   elite: 0.1,   poor: 0.005 },
  // Creation
  { db: 'assists_per90',        label: 'passes décisives /90',  elite: 0.3,   poor: 0.05 },
  { db: 'xa_per90',             label: 'xA /90',                elite: 0.25,  poor: 0.04 },
  { db: 'key_passes_per90',     label: 'passes clés /90',       elite: 2.5,   poor: 0.5 },
  { db: 'smart_passes_per90',   label: 'smart passes /90',      elite: 2.5,   poor: 0.4 },
  { db: 'smart_passes_accurate_pct', label: 'smart passes réussies', unit: '%', elite: 50, poor: 25 },
  { db: 'through_passes_per90', label: 'passes traversantes /90', elite: 1.2, poor: 0.15 },
  { db: 'crosses_per90',        label: 'centres /90',           elite: 5,     poor: 0.8 },
  { db: 'crosses_accurate_pct', label: 'centres réussis', unit: '%', elite: 40, poor: 18 },
  { db: 'shot_assists_per90',   label: 'passes vers tir /90',   elite: 2.5,   poor: 0.5 },
  // Passing
  { db: 'passes_per90',         label: 'passes /90',            elite: 70,    poor: 25 },
  { db: 'passes_accurate_pct',  label: 'passes réussies', unit: '%', elite: 90, poor: 75 },
  { db: 'long_passes_per90',    label: 'longues passes /90',    elite: 8,     poor: 1.5 },
  { db: 'long_passes_accurate_pct', label: 'longues passes réussies', unit: '%', elite: 70, poor: 45 },
  { db: 'forward_passes_per90', label: 'passes avant /90',      elite: 22,    poor: 7 },
  { db: 'forward_passes_accurate_pct', label: 'passes avant réussies', unit: '%', elite: 82, poor: 65 },
  { db: 'progressive_passes_per90', label: 'passes progressives /90', elite: 10, poor: 3 },
  { db: 'progressive_passes_accurate_pct', label: 'passes progressives réussies', unit: '%', elite: 80, poor: 60 },
  // Carrying
  { db: 'dribbles_per90',       label: 'dribbles /90',          elite: 6,     poor: 0.8 },
  { db: 'dribbles_success_pct', label: 'dribbles réussis', unit: '%', elite: 65, poor: 35 },
  { db: 'progressive_runs_per90', label: 'courses progressives /90', elite: 4.5, poor: 1 },
  { db: 'accelerations_per90',  label: 'accélérations /90',     elite: 4.5,   poor: 1 },
  // Defense
  { db: 'interceptions_per90',  label: 'interceptions /90',     elite: 5,     poor: 1.5 },
  { db: 'padj_interceptions',   label: 'interceptions ajustées', elite: 6,    poor: 1.5 },
  { db: 'sliding_tackles_per90', label: 'tacles /90',           elite: 1.0,   poor: 0.2 },
  { db: 'padj_sliding_tackles', label: 'tacles ajustés',        elite: 1.2,   poor: 0.2 },
  { db: 'shots_blocked_per90',  label: 'tirs bloqués /90',      elite: 1.0,   poor: 0.1 },
  { db: 'defensive_duels_per90', label: 'duels défensifs /90',  elite: 10,    poor: 3 },
  { db: 'defensive_duels_won_pct', label: 'duels défensifs gagnés', unit: '%', elite: 68, poor: 50 },
  { db: 'aerial_duels_per90',   label: 'duels aériens /90',     elite: 8,     poor: 2 },
  { db: 'aerial_duels_won_pct', label: 'duels aériens gagnés', unit: '%', elite: 65, poor: 45 },
  { db: 'duels_per90',          label: 'duels /90',             elite: 20,    poor: 8 },
  { db: 'duels_won_pct',        label: 'duels gagnés', unit: '%', elite: 60, poor: 45 },
  { db: 'offensive_duels_per90', label: 'duels offensifs /90',  elite: 10,    poor: 3 },
  { db: 'offensive_duels_won_pct', label: 'duels offensifs gagnés', unit: '%', elite: 55, poor: 35 },
  // Physical
  { db: 'max_speed',            label: 'vitesse max', unit: 'km/h', elite: 34, poor: 28 },
  { db: 'sprint_count_per90',   label: 'sprints /90',           elite: 18,    poor: 5 },
  { db: 'total_distance_per90', label: 'distance totale /90', unit: 'm', elite: 11500, poor: 8500 },
  { db: 'hi_distance_per90',    label: 'haute intensité /90', unit: 'm', elite: 800, poor: 350 },
  // Discipline (lower is better for fouls)
  { db: 'fouls_per90',          label: 'fautes /90',            elite: 0.5,   poor: 2.5 },
  { db: 'fouls_suffered_per90', label: 'fautes subies /90',     elite: 2.5,   poor: 0.4 },
  // GK
  { db: 'save_rate_pct',        label: 'taux d\'arrêts', unit: '%', elite: 78, poor: 62 },
  { db: 'conceded_goals_per90', label: 'buts encaissés /90',    elite: 0.7,   poor: 2 },
  { db: 'prevented_goals_per90', label: 'buts évités /90',      elite: 0.2,   poor: -0.15 },
  { db: 'gk_exits_per90',       label: 'sorties /90',           elite: 1.5,   poor: 0.4 },
  { db: 'gk_aerial_duels_per90', label: 'duels aériens GK /90', elite: 1.2,   poor: 0.3 },
];

const BENCHMARK_BY_DB = new Map<string, StatBenchmark>(STAT_BENCHMARKS.map(b => [b.db as string, b]));

// Stats that matter for strengths/weaknesses, per position
const POSITION_RELEVANCE: Record<string, (keyof WyscoutStatRow)[]> = {
  GK: [
    'save_rate_pct', 'conceded_goals_per90', 'prevented_goals_per90',
    'gk_exits_per90', 'gk_aerial_duels_per90',
    'passes_accurate_pct', 'long_passes_accurate_pct', 'forward_passes_per90',
  ],
  DC: [
    'aerial_duels_won_pct', 'aerial_duels_per90', 'defensive_duels_won_pct', 'defensive_duels_per90',
    'interceptions_per90', 'padj_interceptions', 'sliding_tackles_per90', 'shots_blocked_per90',
    'fouls_per90',
    'passes_accurate_pct', 'long_passes_accurate_pct', 'progressive_passes_per90', 'forward_passes_per90',
  ],
  LD: [
    'defensive_duels_won_pct', 'interceptions_per90', 'aerial_duels_won_pct', 'duels_won_pct',
    'crosses_per90', 'crosses_accurate_pct', 'dribbles_per90', 'dribbles_success_pct',
    'progressive_runs_per90', 'progressive_passes_per90', 'passes_accurate_pct', 'touches_in_box_per90',
    'assists_per90', 'xa_per90',
  ],
  LG: [
    'defensive_duels_won_pct', 'interceptions_per90', 'aerial_duels_won_pct', 'duels_won_pct',
    'crosses_per90', 'crosses_accurate_pct', 'dribbles_per90', 'dribbles_success_pct',
    'progressive_runs_per90', 'progressive_passes_per90', 'passes_accurate_pct', 'touches_in_box_per90',
    'assists_per90', 'xa_per90',
  ],
  MDef: [
    'interceptions_per90', 'padj_interceptions', 'sliding_tackles_per90', 'defensive_duels_won_pct',
    'aerial_duels_won_pct', 'duels_won_pct',
    'passes_per90', 'passes_accurate_pct', 'long_passes_accurate_pct', 'progressive_passes_per90',
    'forward_passes_per90', 'fouls_per90',
  ],
  MC: [
    'passes_per90', 'passes_accurate_pct', 'progressive_passes_per90', 'forward_passes_per90',
    'key_passes_per90', 'assists_per90', 'xa_per90',
    'interceptions_per90', 'defensive_duels_won_pct', 'duels_won_pct', 'aerial_duels_won_pct',
    'dribbles_per90', 'dribbles_success_pct', 'progressive_runs_per90',
    'total_distance_per90', 'shots_per90',
  ],
  MO: [
    'key_passes_per90', 'xa_per90', 'assists_per90', 'smart_passes_per90', 'through_passes_per90',
    'passes_accurate_pct', 'progressive_passes_per90',
    'dribbles_per90', 'dribbles_success_pct', 'progressive_runs_per90',
    'shots_per90', 'goals_per90', 'xg_per90', 'touches_in_box_per90',
  ],
  AD: [
    'dribbles_per90', 'dribbles_success_pct', 'crosses_per90', 'crosses_accurate_pct',
    'key_passes_per90', 'xa_per90', 'assists_per90',
    'progressive_runs_per90', 'accelerations_per90', 'max_speed',
    'shots_per90', 'goals_per90', 'xg_per90', 'touches_in_box_per90',
  ],
  AG: [
    'dribbles_per90', 'dribbles_success_pct', 'crosses_per90', 'crosses_accurate_pct',
    'key_passes_per90', 'xa_per90', 'assists_per90',
    'progressive_runs_per90', 'accelerations_per90', 'max_speed',
    'shots_per90', 'goals_per90', 'xg_per90', 'touches_in_box_per90',
  ],
  ATT: [
    'goals_per90', 'xg_per90', 'np_goals_per90', 'shots_per90', 'shots_on_target_pct',
    'goal_conversion_pct', 'head_goals_per90', 'touches_in_box_per90',
    'assists_per90', 'xa_per90', 'key_passes_per90',
    'aerial_duels_won_pct', 'offensive_duels_won_pct', 'dribbles_success_pct',
  ],
};

const FALLBACK_RELEVANCE: (keyof WyscoutStatRow)[] = [
  'passes_accurate_pct', 'duels_won_pct', 'aerial_duels_won_pct',
  'progressive_passes_per90', 'dribbles_success_pct', 'interceptions_per90',
  'key_passes_per90', 'shots_per90', 'goals_per90',
];

function benchmarkScore(value: number, b: StatBenchmark): number {
  if (b.elite === b.poor) return 50;
  const raw = (value - b.poor) / (b.elite - b.poor);
  return Math.round(Math.max(0, Math.min(1, raw)) * 100);
}

function tierFromScore(score: number): Insight['tier'] {
  if (score >= 90) return 'elite';
  if (score >= 75) return 'very_good';
  if (score >= 60) return 'good';
  if (score >= 35) return 'average';
  if (score >= 15) return 'weak';
  return 'very_weak';
}

const TREND_STATS: (keyof WyscoutStatRow)[] = [
  'goals_per90', 'assists_per90', 'xg_per90', 'xa_per90',
  'duels_won_pct', 'passes_accurate_pct', 'progressive_passes_per90',
];

/**
 * Compute strengths / weaknesses / trends.
 *
 * - If `benchmarkRows` is provided AND has ≥3 entries: each stat is scored as
 *   a percentile within that group (data-driven, adapts to imports).
 * - Otherwise: falls back to absolute football thresholds (always works, less
 *   contextual).
 *
 * In both cases, inverted stats (fouls, conceded goals) are flipped so that a
 * high score consistently means "good".
 */
export function computeInsights(
  row: WyscoutStatRow,
  position: string,
  prevSeason: WyscoutStatRow | null,
  benchmarkRows?: WyscoutStatRow[],
): Insight[] {
  const relevant = POSITION_RELEVANCE[position] || FALLBACK_RELEVANCE;
  const useGroup = !!benchmarkRows && benchmarkRows.length >= 3;

  const scored = relevant.map(db => {
    const v = toNum(row[db]);
    if (v === null) return null;
    const b = BENCHMARK_BY_DB.get(db as string);
    const label = b?.label || String(db);
    const unit = b?.unit;
    const inverted = benchmarkInverted(b);

    if (useGroup) {
      const peerValues = benchmarkRows!.map(r => toNum(r[db])).filter((x): x is number => x !== null);
      if (peerValues.length >= 3) {
        // Mid-rank percentile to handle ties symmetrically
        const all = [...peerValues, v].sort((a, b) => a - b);
        const lo = all.findIndex(x => x >= v);
        const hi = all.length - 1 - [...all].slice().reverse().findIndex(x => x <= v);
        const rank = (lo + hi) / 2;
        let percentile = Math.round((rank / Math.max(1, all.length - 1)) * 100);
        if (inverted) percentile = 100 - percentile;
        return {
          db, label, unit, value: v,
          score: percentile,
          tier: tierFromScore(percentile),
          mode: 'relative' as const,
        };
      }
    }
    // Absolute fallback
    if (!b) return null;
    const score = benchmarkScore(v, b);
    return {
      db, label, unit, value: v,
      score,
      tier: tierFromScore(score),
      mode: 'absolute' as const,
    };
  }).filter(Boolean) as { db: keyof WyscoutStatRow; label: string; unit?: string; value: number; score: number; tier: NonNullable<Insight['tier']>; mode: 'relative' | 'absolute' }[];

  const sortedDesc = [...scored].sort((a, b) => b.score - a.score);
  const insights: Insight[] = [];

  for (const s of sortedDesc.slice(0, 4)) {
    if (s.score >= 65) {
      insights.push({ kind: 'strength', metric: s.db, label: s.label, value: s.value, score: s.score, tier: s.tier, mode: s.mode, unit: s.unit });
    }
  }
  for (const w of sortedDesc.slice(-3).reverse()) {
    if (w.score <= 35) {
      insights.push({ kind: 'weakness', metric: w.db, label: w.label, value: w.value, score: w.score, tier: w.tier, mode: w.mode, unit: w.unit });
    }
  }

  if (prevSeason) {
    for (const stat of TREND_STATS) {
      const cur = toNum(row[stat]);
      const prev = toNum(prevSeason[stat]);
      if (cur !== null && prev !== null && prev > 0) {
        const delta = ((cur - prev) / prev) * 100;
        if (Math.abs(delta) >= 15) {
          const b = BENCHMARK_BY_DB.get(stat as string);
          insights.push({
            kind: delta > 0 ? 'trend-up' : 'trend-down',
            metric: stat,
            label: b?.label || String(stat),
            value: cur,
            delta: Math.round(delta),
            unit: b?.unit,
          });
        }
      }
    }
  }

  return insights;
}

// ── Similar players ──────────────────────────────────────────────────────
const SIM_STATS_OUTFIELD: (keyof WyscoutStatRow)[] = [
  'goals_per90', 'assists_per90', 'xg_per90', 'xa_per90',
  'shots_per90', 'key_passes_per90', 'dribbles_per90', 'dribbles_success_pct',
  'progressive_passes_per90', 'progressive_runs_per90',
  'interceptions_per90', 'sliding_tackles_per90', 'duels_per90', 'duels_won_pct',
  'passes_per90', 'passes_accurate_pct', 'crosses_per90',
  'touches_in_box_per90', 'aerial_duels_won_pct',
];
const SIM_STATS_GK: (keyof WyscoutStatRow)[] = [
  'save_rate_pct', 'conceded_goals_per90', 'prevented_goals_per90',
  'gk_exits_per90', 'gk_aerial_duels_per90',
  'passes_per90', 'long_passes_accurate_pct', 'forward_passes_per90',
];

export interface SimilarPlayer { playerId: string; similarity: number; }

export function findSimilarPlayers(
  myRow: WyscoutStatRow,
  peers: { playerId: string; row: WyscoutStatRow }[],
  isGK: boolean,
  limit = 5,
): SimilarPlayer[] {
  const stats = isGK ? SIM_STATS_GK : SIM_STATS_OUTFIELD;

  const maxByStat: Record<string, number> = {};
  for (const s of stats) {
    const all = [toNum(myRow[s]) ?? 0, ...peers.map(p => toNum(p.row[s]) ?? 0)];
    maxByStat[s as string] = Math.max(...all, 1);
  }

  const normalize = (row: WyscoutStatRow): number[] =>
    stats.map(s => (toNum(row[s]) ?? 0) / maxByStat[s as string]);

  const myVec = normalize(myRow);
  const dot = (a: number[], b: number[]) => a.reduce((s, v, i) => s + v * b[i], 0);
  const mag = (v: number[]) => Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  const myMag = mag(myVec) || 1;

  return peers
    .map(p => {
      const v = normalize(p.row);
      const sim = dot(myVec, v) / (myMag * (mag(v) || 1));
      return { playerId: p.playerId, similarity: Math.round(sim * 100) };
    })
    .filter(r => r.similarity > 0)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

// ── Percentile helper (for the percentile table UI) ──────────────────────
export function statPercentile(row: WyscoutStatRow, stat: keyof WyscoutStatRow, peers: WyscoutStatRow[]): number | null {
  const myVal = toNum(row[stat]);
  if (myVal === null) return null;
  const peerVals = peers.map(p => toNum(p[stat])).filter((v): v is number => v !== null && v > 0);
  if (peerVals.length < 3) return null;
  const all = [...peerVals, myVal].sort((a, b) => a - b);
  const lo = all.findIndex(x => x >= myVal);
  const hi = all.length - 1 - [...all].slice().reverse().findIndex(x => x <= myVal);
  const rank = (lo + hi) / 2;
  return Math.round((rank / Math.max(1, all.length - 1)) * 100);
}
