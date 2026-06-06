import type { WyscoutStatRow } from '@/hooks/use-wyscout-stats';
import type { Player } from '@/types/player';
import { getPlayerAge, resolveLeagueName } from '@/types/player';

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined) return null;
  const n = typeof v === 'string' ? parseFloat(v) : (v as number);
  return isNaN(n) ? null : n;
};

interface JoinedRow { row: WyscoutStatRow; player: Player; }

function joinPeers(peerSummaries: WyscoutStatRow[], allPlayers: Player[]): JoinedRow[] {
  const byId = new Map(allPlayers.map(p => [p.id, p]));
  return peerSummaries
    .map(r => ({ row: r, player: byId.get(r.player_id) as Player | undefined }))
    .filter((x): x is JoinedRow => !!x.player);
}

// ── Benchmark group: a peer subset to compare against ────────────────────
export interface BenchmarkGroup {
  key: string;
  label: string;        // chip label
  description: string;  // full sentence used as context
  rows: WyscoutStatRow[];
  count: number;
  facet: 'all' | 'league' | 'club' | 'age';
}

const MIN_GROUP_SIZE = 3;

/**
 * Suggests usable comparison groups for a given player, based on what data is
 * actually available in the user's WyScout imports. Always starts with the
 * broadest reliable group (same position) and adds more specific facets only
 * when there are enough peers.
 */
export function suggestBenchmarkGroups(
  player: Player,
  allPlayers: Player[],
  peerSummaries: WyscoutStatRow[],
): BenchmarkGroup[] {
  const joined = joinPeers(peerSummaries, allPlayers).filter(j => j.player.id !== player.id);
  const samePos = joined.filter(j => j.player.position === player.position);
  const groups: BenchmarkGroup[] = [];

  if (samePos.length >= MIN_GROUP_SIZE) {
    groups.push({
      key: `pos:${player.position}`,
      label: `Tous les ${player.position}`,
      description: `Tous les ${player.position} de votre base`,
      rows: samePos.map(j => j.row),
      count: samePos.length,
      facet: 'all',
    });
  }

  const myLeague = resolveLeagueName(player.club, player.league);
  if (myLeague) {
    const sameLeague = samePos.filter(j => resolveLeagueName(j.player.club, j.player.league) === myLeague);
    if (sameLeague.length >= MIN_GROUP_SIZE && sameLeague.length < samePos.length) {
      groups.push({
        key: `pos_league:${player.position}:${myLeague}`,
        label: `${player.position} · ${myLeague}`,
        description: `${player.position} évoluant en ${myLeague}`,
        rows: sameLeague.map(j => j.row),
        count: sameLeague.length,
        facet: 'league',
      });
    }
  }

  if (player.club) {
    const sameClub = samePos.filter(j => j.player.club === player.club);
    if (sameClub.length >= MIN_GROUP_SIZE && sameClub.length < samePos.length) {
      groups.push({
        key: `pos_club:${player.position}:${player.club}`,
        label: `${player.position} · ${player.club}`,
        description: `${player.position} à ${player.club}`,
        rows: sameClub.map(j => j.row),
        count: sameClub.length,
        facet: 'club',
      });
    }
  }

  const myAge = getPlayerAge(player.generation, player.date_of_birth);
  if (myAge > 0) {
    const sameAge = samePos.filter(j => {
      const a = getPlayerAge(j.player.generation, j.player.date_of_birth);
      return a > 0 && Math.abs(a - myAge) <= 2;
    });
    if (sameAge.length >= MIN_GROUP_SIZE && sameAge.length < samePos.length) {
      groups.push({
        key: `pos_age:${player.position}`,
        label: `${player.position} · âge ±2`,
        description: `${player.position} d'âge similaire (±2 ans, ~${myAge} ans)`,
        rows: sameAge.map(j => j.row),
        count: sameAge.length,
        facet: 'age',
      });
    }
  }

  return groups;
}

// ── Distribution + percentile ────────────────────────────────────────────
export interface StatDistribution {
  n: number;
  min: number;
  p25: number;
  p50: number;   // median
  p75: number;
  p90: number;
  max: number;
  mean: number;
}

export function computeStatDistribution(
  rows: WyscoutStatRow[],
  stat: keyof WyscoutStatRow,
): StatDistribution | null {
  const values = rows.map(r => toNum(r[stat])).filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const pick = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * q))];
  return {
    n: sorted.length,
    min: sorted[0],
    p25: pick(0.25),
    p50: pick(0.5),
    p75: pick(0.75),
    p90: pick(0.9),
    max: sorted[sorted.length - 1],
    mean: values.reduce((a, b) => a + b, 0) / values.length,
  };
}

/**
 * Returns the player's percentile within a group for a given stat.
 * If `invert` is true (e.g. fouls, conceded goals), the returned percentile is
 * flipped so that a HIGH value still means "good" — for consistent display.
 */
export function percentileInGroup(
  value: number,
  rows: WyscoutStatRow[],
  stat: keyof WyscoutStatRow,
  invert = false,
): { percentile: number; n: number } | null {
  const values = rows.map(r => toNum(r[stat])).filter((v): v is number => v !== null);
  if (values.length < 1) return null;
  // Mid-rank percentile (handles ties symmetrically)
  const all = [...values, value].sort((a, b) => a - b);
  const lo = all.findIndex(v => v >= value);
  const hi = all.length - 1 - [...all].slice().reverse().findIndex(v => v <= value);
  const rank = (lo + hi) / 2;
  const denom = Math.max(1, all.length - 1);
  let percentile = Math.round((rank / denom) * 100);
  if (invert) percentile = 100 - percentile;
  return { percentile, n: values.length };
}
