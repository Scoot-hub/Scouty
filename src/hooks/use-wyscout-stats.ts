import { useQuery } from '@tanstack/react-query';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface WyscoutStatRow {
  id: string;
  player_id: string;
  season: string;
  division: string | null;
  team: string | null;
  continent: string | null;
  country: string | null;
  year_start: number | null;
  year_end: number | null;
  source_filename: string | null;
  // Base
  matches_played: number | null;
  minutes_played: number | null;
  goals: number | null;
  xg: number | null;
  assists: number | null;
  xa: number | null;
  yellow_cards: number | null;
  red_cards: number | null;
  shots: number | null;
  np_goals: number | null;
  head_goals: number | null;
  conceded_goals: number | null;
  shots_against: number | null;
  clean_sheets: number | null;
  penalties_taken: number | null;
  // Defensive per-90
  defensive_actions_per90: number | null;
  defensive_duels_per90: number | null;
  defensive_duels_won_pct: number | null;
  aerial_duels_per90: number | null;
  aerial_duels_won_pct: number | null;
  sliding_tackles_per90: number | null;
  padj_sliding_tackles: number | null;
  shots_blocked_per90: number | null;
  interceptions_per90: number | null;
  padj_interceptions: number | null;
  fouls_per90: number | null;
  yellow_cards_per90: number | null;
  red_cards_per90: number | null;
  duels_per90: number | null;
  duels_won_pct: number | null;
  // Attacking per-90
  attacking_actions_per90: number | null;
  goals_per90: number | null;
  np_goals_per90: number | null;
  xg_per90: number | null;
  head_goals_per90: number | null;
  shots_per90: number | null;
  shots_on_target_pct: number | null;
  goal_conversion_pct: number | null;
  assists_per90: number | null;
  xa_per90: number | null;
  crosses_per90: number | null;
  crosses_accurate_pct: number | null;
  crosses_left_per90: number | null;
  crosses_left_accurate_pct: number | null;
  crosses_right_per90: number | null;
  crosses_right_accurate_pct: number | null;
  crosses_to_box_per90: number | null;
  dribbles_per90: number | null;
  dribbles_success_pct: number | null;
  offensive_duels_per90: number | null;
  offensive_duels_won_pct: number | null;
  touches_in_box_per90: number | null;
  progressive_runs_per90: number | null;
  accelerations_per90: number | null;
  received_passes_per90: number | null;
  received_long_passes_per90: number | null;
  fouls_suffered_per90: number | null;
  // Passing per-90
  passes_per90: number | null;
  passes_accurate_pct: number | null;
  forward_passes_per90: number | null;
  forward_passes_accurate_pct: number | null;
  back_passes_per90: number | null;
  back_passes_accurate_pct: number | null;
  lateral_passes_per90: number | null;
  lateral_passes_accurate_pct: number | null;
  short_medium_passes_per90: number | null;
  short_medium_passes_accurate_pct: number | null;
  long_passes_per90: number | null;
  long_passes_accurate_pct: number | null;
  avg_pass_length: number | null;
  avg_long_pass_length: number | null;
  shot_assists_per90: number | null;
  second_assists_per90: number | null;
  third_assists_per90: number | null;
  smart_passes_per90: number | null;
  smart_passes_accurate_pct: number | null;
  key_passes_per90: number | null;
  passes_final_third_per90: number | null;
  passes_final_third_accurate_pct: number | null;
  passes_penalty_area_per90: number | null;
  passes_penalty_area_accurate_pct: number | null;
  through_passes_per90: number | null;
  through_passes_accurate_pct: number | null;
  deep_completions_per90: number | null;
  deep_completed_crosses_per90: number | null;
  progressive_passes_per90: number | null;
  progressive_passes_accurate_pct: number | null;
  // Set pieces
  free_kicks_per90: number | null;
  direct_free_kicks_per90: number | null;
  direct_free_kicks_on_target_pct: number | null;
  corners_per90: number | null;
  penalty_conversion_pct: number | null;
  // Goalkeeper
  conceded_goals_per90: number | null;
  shots_against_per90: number | null;
  save_rate_pct: number | null;
  xg_against: number | null;
  xg_against_per90: number | null;
  prevented_goals: number | null;
  prevented_goals_per90: number | null;
  gk_back_passes_per90: number | null;
  gk_exits_per90: number | null;
  gk_aerial_duels_per90: number | null;
  // Physical
  total_distance_per90: number | null;
  running_distance_per90: number | null;
  hsr_distance_per90: number | null;
  sprint_distance_per90: number | null;
  hi_distance_per90: number | null;
  meters_per_min: number | null;
  max_speed: number | null;
  medium_accel_per90: number | null;
  high_accel_per90: number | null;
  medium_decel_per90: number | null;
  high_decel_per90: number | null;
  hsr_count_per90: number | null;
  sprint_count_per90: number | null;
  hi_count_per90: number | null;
  updated_at: string;
}

export function useWyscoutStats(playerId: string | undefined) {
  return useQuery<WyscoutStatRow[]>({
    queryKey: ['wyscout-stats', playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const res = await fetch(`${API_BASE}/player-wyscout-stats/${playerId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });
}
