import type { WyscoutStatRow } from '@/hooks/use-wyscout-stats';

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return isNaN(n) ? null : n;
};

// Fields that sum across rows (counters)
const SUM_FIELDS = new Set<string>([
  'matches_played', 'minutes_played',
  'goals', 'assists', 'shots', 'np_goals', 'head_goals',
  'yellow_cards', 'red_cards', 'penalties_taken',
  'conceded_goals', 'shots_against', 'clean_sheets',
  'xg', 'xa', 'xg_against', 'prevented_goals',
  'padj_interceptions', 'padj_sliding_tackles',
]);

// Non-numeric / identifier fields
const NON_NUMERIC = new Set<string>([
  'id', 'player_id', 'season', 'division', 'team', 'continent', 'country',
  'year_start', 'year_end', 'source_filename', 'updated_at', 'user_id',
]);

export interface WyscoutFilters {
  seasons: string[];
  clubs: string[];
  divisions: string[];
}

export const EMPTY_FILTERS: WyscoutFilters = { seasons: [], clubs: [], divisions: [] };

export function filterWyscoutRows(rows: WyscoutStatRow[], filters: WyscoutFilters): WyscoutStatRow[] {
  return rows.filter(r => {
    if (filters.seasons.length > 0 && !filters.seasons.includes(r.season)) return false;
    if (filters.clubs.length > 0 && (!r.team || !filters.clubs.includes(r.team))) return false;
    if (filters.divisions.length > 0 && (!r.division || !filters.divisions.includes(r.division))) return false;
    return true;
  });
}

export interface AggregatedWyscout extends WyscoutStatRow {
  _rowCount: number;
  _seasons: string[];
  _clubs: string[];
  _divisions: string[];
}

export function aggregateWyscoutRows(rows: WyscoutStatRow[]): AggregatedWyscout | null {
  if (rows.length === 0) return null;

  const seasons = [...new Set(rows.map(r => r.season).filter(Boolean))].sort();
  const clubs = [...new Set(rows.map(r => r.team).filter((v): v is string => !!v))];
  const divisions = [...new Set(rows.map(r => r.division).filter((v): v is string => !!v))];

  if (rows.length === 1) {
    return { ...rows[0], _rowCount: 1, _seasons: seasons, _clubs: clubs, _divisions: divisions };
  }

  const out: Record<string, unknown> = { ...rows[0] };
  const totalMinutes = rows.reduce((s, r) => s + (toNum(r.minutes_played) ?? 0), 0);
  const weightDenom = totalMinutes > 0 ? totalMinutes : rows.length;

  const keys = Object.keys(rows[0]);
  for (const k of keys) {
    if (NON_NUMERIC.has(k)) continue;
    if (SUM_FIELDS.has(k)) {
      out[k] = rows.reduce((s, r) => s + (toNum((r as Record<string, unknown>)[k]) ?? 0), 0);
    } else {
      // Minutes-weighted average — falls back to simple average if no minutes data
      const numerator = rows.reduce((s, r) => {
        const v = toNum((r as Record<string, unknown>)[k]);
        if (v === null) return s;
        const w = totalMinutes > 0 ? (toNum(r.minutes_played) ?? 0) : 1;
        return s + v * w;
      }, 0);
      const denom = totalMinutes > 0
        ? rows.reduce((s, r) => s + (toNum((r as Record<string, unknown>)[k]) !== null ? (toNum(r.minutes_played) ?? 0) : 0), 0) || weightDenom
        : rows.filter(r => toNum((r as Record<string, unknown>)[k]) !== null).length || 1;
      out[k] = Math.round((numerator / denom) * 100) / 100;
    }
  }

  // Synthesize identifying fields
  out.season = seasons.length > 1 ? `${seasons[0]} → ${seasons[seasons.length - 1]}` : (seasons[0] ?? '');
  out.team = clubs.length > 1 ? null : (clubs[0] ?? null);
  out.division = divisions.length > 1 ? null : (divisions[0] ?? null);
  out.source_filename = null;

  return { ...(out as unknown as WyscoutStatRow), _rowCount: rows.length, _seasons: seasons, _clubs: clubs, _divisions: divisions };
}

export interface FilterOptions {
  seasons: string[];
  clubs: string[];
  divisions: string[];
}

export function extractFilterOptions(rows: WyscoutStatRow[]): FilterOptions {
  return {
    seasons: [...new Set(rows.map(r => r.season).filter(Boolean))].sort().reverse(),
    clubs: [...new Set(rows.map(r => r.team).filter((v): v is string => !!v))].sort(),
    divisions: [...new Set(rows.map(r => r.division).filter((v): v is string => !!v))].sort(),
  };
}
