import { useQuery } from '@tanstack/react-query';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface SbPlayerInfo {
  player_id: number;
  player_name: string;
  player_nickname: string | null;
  country: string | null;
}

export interface SbSeasonStats {
  player_id: number;
  player_name: string;
  competition_name: string;
  season_name: string;
  competition_gender: string;
  competition_id: number;
  season_id: number;
  matches: number;
  goals: number;
  xg: number;
  shots: number;
  shots_on_target: number;
  passes: number;
  passes_completed: number;
  pass_pct: number | null;
  key_passes: number;
  progressive_passes: number;
  dribbles_completed: number;
  dribbles_attempted: number;
  pressures: number;
  tackles: number;
  interceptions: number;
  duels_won: number;
  duels_total: number;
}

export interface SbPlayerData {
  players: SbPlayerInfo[];
  stats: SbSeasonStats[];
}

export function useStatsBombPlayer(playerName: string | undefined) {
  return useQuery<SbPlayerData>({
    queryKey: ['statsbomb-player', playerName],
    queryFn: async () => {
      if (!playerName?.trim()) return { players: [], stats: [] };
      const res = await fetch(
        `${API}/statsbomb/player?name=${encodeURIComponent(playerName)}`,
        { credentials: 'include' }
      );
      if (!res.ok) return { players: [], stats: [] };
      return res.json();
    },
    enabled: !!playerName,
    staleTime: 10 * 60_000,
  });
}
