/** Shared utilities for player performance data */
import type { Player } from '@/types/player';

export interface PerfStats {
  rating?: number;
  goals?: number;
  assists?: number;
  minutes?: number;
  appearances?: number;
  xg?: number;
  xa?: number;
  pass_accuracy?: number;
  shots_on?: number;
  shots_total?: number;
  tackles?: number;
  interceptions?: number;
  blocks?: number;
  duels_won?: number;
  duels_total?: number;
  duels_won_pct?: number;
  dribbles_success?: number;
  dribbles_attempts?: number;
  dribbles_success_pct?: number;
  passes_key?: number;
  fouls_drawn?: number;
  fouls_committed?: number;
  cards_yellow?: number;
  cards_red?: number;
  saves?: number;
  big_chances_created?: number;
}

export function getPlayerPerfStats(player: Player): PerfStats {
  const ext = (player.external_data ?? {}) as Record<string, any>;
  const stats = ext?.performance_stats?.stats;
  if (!stats) return {};
  const duels_won = stats.duels_won != null ? Number(stats.duels_won) : undefined;
  const duels_total = stats.duels_total != null ? Number(stats.duels_total) : undefined;
  const dribbles_success = stats.dribbles_success != null ? Number(stats.dribbles_success) : undefined;
  const dribbles_attempts = stats.dribbles_attempts != null ? Number(stats.dribbles_attempts) : undefined;
  return {
    rating: stats.rating != null ? parseFloat(stats.rating) : undefined,
    goals: stats.goals != null ? Number(stats.goals) : undefined,
    assists: stats.assists != null ? Number(stats.assists) : undefined,
    minutes: stats.minutes != null ? Number(stats.minutes) : undefined,
    appearances: stats.appearances != null ? Number(stats.appearances) : undefined,
    xg: stats.expected_goals != null ? parseFloat(stats.expected_goals) : undefined,
    xa: stats.expected_assists != null ? parseFloat(stats.expected_assists) : undefined,
    pass_accuracy: stats.passes_accuracy != null ? parseFloat(stats.passes_accuracy) : undefined,
    shots_on: stats.shots_on != null ? Number(stats.shots_on) : undefined,
    shots_total: stats.shots_total != null ? Number(stats.shots_total) : undefined,
    tackles: stats.tackles != null ? Number(stats.tackles) : undefined,
    interceptions: stats.interceptions != null ? Number(stats.interceptions) : undefined,
    blocks: stats.blocks != null ? Number(stats.blocks) : undefined,
    duels_won,
    duels_total,
    duels_won_pct: duels_won != null && duels_total ? Math.round((duels_won / duels_total) * 100) : undefined,
    dribbles_success,
    dribbles_attempts,
    dribbles_success_pct: dribbles_success != null && dribbles_attempts ? Math.round((dribbles_success / dribbles_attempts) * 100) : undefined,
    passes_key: stats.passes_key != null ? Number(stats.passes_key) : undefined,
    fouls_drawn: stats.fouls_drawn != null ? Number(stats.fouls_drawn) : undefined,
    fouls_committed: stats.fouls_committed != null ? Number(stats.fouls_committed) : undefined,
    cards_yellow: stats.cards_yellow != null ? Number(stats.cards_yellow) : undefined,
    cards_red: stats.cards_red != null ? Number(stats.cards_red) : undefined,
    saves: stats.saves != null ? Number(stats.saves) : undefined,
    big_chances_created: stats.big_chances_created != null ? Number(stats.big_chances_created) : undefined,
  };
}

export function computePercentile(rank: number, total: number): number {
  if (total <= 1) return 100;
  return Math.round((1 - (rank - 1) / (total - 1)) * 100);
}

export const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(0 84% 60%)',      // red
  'hsl(142 71% 45%)',    // green
  'hsl(38 92% 50%)',     // amber
];

export const RADAR_PRESETS: Record<string, { stats: string[] }> = {
  'profile-9': {
    stats: ['goals', 'expected_goals', 'shots_on', 'big_chances_created', 'duels_won', 'aerial_duels_won'],
  },
  'box-to-box': {
    stats: ['tackles', 'interceptions', 'passes_key', 'dribbles_success', 'duels_won', 'goals'],
  },
  'playmaker': {
    stats: ['assists', 'expected_assists', 'passes_key', 'passes_accuracy', 'dribbles_success', 'big_chances_created'],
  },
};
