import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ApiLeague {
  league: { id: number; name: string; type: string; logo: string };
  country: { name: string; code: string | null; flag: string | null };
  seasons: { year: number; current: boolean }[];
}

export interface DetectedLeague {
  app_league_name: string;
  api_league_id: number;
  api_league_name: string;
  api_country: string;
  api_league_logo: string | null;
  already_followed: boolean;
}

export interface FollowedLeague {
  id: string;
  user_id: string;
  league_id: number;
  league_name: string;
  league_country: string;
  league_logo: string | null;
  season: number;
  created_at: string;
}

export function useSearchLeagues(search: string) {
  return useQuery({
    queryKey: ['apifootball-leagues', search],
    queryFn: async (): Promise<ApiLeague[]> => {
      const { data, error } = await supabase.functions.invoke('apifootball-search-leagues', {
        body: { search },
      });
      if (error) throw error;
      return data?.leagues ?? [];
    },
    enabled: search.length >= 2,
    staleTime: 5 * 60 * 1000,
  });
}

export function useDetectLeagues() {
  return useQuery({
    queryKey: ['apifootball-detect-leagues'],
    queryFn: async (): Promise<DetectedLeague[]> => {
      const { data, error } = await supabase.functions.invoke('apifootball-detect-leagues', {
        body: {},
      });
      if (error) throw error;
      return data?.detected ?? [];
    },
    staleTime: 10 * 60 * 1000,
  });
}

export function useFollowedLeagues() {
  return useQuery({
    queryKey: ['followed-leagues'],
    queryFn: async (): Promise<FollowedLeague[]> => {
      const { data, error } = await supabase
        .from('user_followed_leagues')
        .select('*')
        .order('league_name');
      if (error) throw error;
      return (data ?? []) as FollowedLeague[];
    },
  });
}

function getCurrentSeason() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

export function useFollowLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (league: { league_id: number; league_name: string; league_country: string; league_logo?: string | null }) => {
      const { data, error } = await supabase
        .from('user_followed_leagues')
        .insert({
          league_id: league.league_id,
          league_name: league.league_name,
          league_country: league.league_country,
          league_logo: league.league_logo ?? null,
          season: getCurrentSeason(),
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as FollowedLeague;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-leagues'] });
      queryClient.invalidateQueries({ queryKey: ['apifootball-detect-leagues'] });
    },
  });
}

export function useUnfollowLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('user_followed_leagues')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['followed-leagues'] });
      queryClient.invalidateQueries({ queryKey: ['apifootball-detect-leagues'] });
    },
  });
}

export function useImportFixtures() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data, error } = await supabase.functions.invoke('apifootball-import-fixtures', {
        body: { from, to },
      });
      if (error) throw error;
      return data as { imported: number; leagues: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixtures'] });
    },
  });
}

export function useManualTheSportsDbSync() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ from, to }: { from: string; to: string }) => {
      const { data, error } = await supabase.functions.invoke('thesportsdb-sync-fixtures', {
        body: { from, to },
      });
      if (error) throw error;
      return data as { imported: number; teams: number };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixtures'] });
      queryClient.invalidateQueries({ queryKey: ['thesportsdb-sync'] });
    },
  });
}

export function useAutoSync(from: string, to: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['apifootball-auto-sync', from, to],
    queryFn: async () => {
      console.log('[useAutoSync] Syncing fixtures for', from, '→', to);
      const { data, error } = await supabase.functions.invoke('apifootball-auto-sync', {
        body: { from, to },
      });
      if (error) {
        console.error('[useAutoSync] Error:', error);
        throw error;
      }
      console.log('[useAutoSync] Result:', data);
      // Invalidate fixtures so the list refreshes
      await queryClient.invalidateQueries({ queryKey: ['fixtures'] });
      queryClient.invalidateQueries({ queryKey: ['followed-leagues'] });
      return data as { imported: number; leagues: number };
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    retry: 1,
  });
}

export function useTheSportsDbSync(from: string, to: string) {
  const queryClient = useQueryClient();
  return useQuery({
    queryKey: ['thesportsdb-sync', from, to],
    queryFn: async () => {
      console.log('[useTheSportsDbSync] Syncing fixtures for', from, '→', to);
      const { data, error } = await supabase.functions.invoke('thesportsdb-sync-fixtures', {
        body: { from, to },
      });
      if (error) {
        console.error('[useTheSportsDbSync] Error:', error);
        throw error;
      }
      console.log('[useTheSportsDbSync] Result:', data);
      await queryClient.invalidateQueries({ queryKey: ['fixtures'] });
      return data as { imported: number; teams: number };
    },
    staleTime: 10 * 60 * 1000, // 10 minutes
    retry: 1,
  });
}

export interface LivescoreEvent {
  id: string;
  home_team: string;
  away_team: string;
  match_time: string | null;
  score_home: number | null;
  score_away: number | null;
  ht_score_home: number | null;
  ht_score_away: number | null;
  status: string; // "NS" | "FT" | "HT" | "AP" | live minute e.g. "45"
  home_badge: string | null;
  away_badge: string | null;
}

export interface LivescoreCompetition {
  name: string;
  country: string;
  country_code: string;
  events: LivescoreEvent[];
}

export interface LivescoreDayResponse {
  competitions: LivescoreCompetition[];
  date: string;
  count: number;
  offset?: number;
  limit?: number;
  returned?: number;
}

// Lineup types
export interface LineupPlayer {
  name: string;
  number: number | null;
  position: string;
  grid: string | null; // e.g. "1:1", "2:3"
  captain?: boolean;
  substituted?: boolean;
  yellow?: boolean;
  red?: boolean;
}

export interface TeamLineup {
  formation: string | null;
  players: LineupPlayer[];
  subs: { name: string; number: number | null; position: string }[];
}

export interface MatchLineups {
  matchId: string;
  home: TeamLineup;
  away: TeamLineup;
  available: boolean;
}

export function useMatchLineups(matchId: string | null) {
  return useQuery({
    queryKey: ['match-lineups', matchId],
    queryFn: async (): Promise<MatchLineups> => {
      const { data, error } = await supabase.functions.invoke('livescore-match-lineups', {
        body: { matchId },
      });
      if (error) throw error;
      return data as MatchLineups;
    },
    enabled: !!matchId,
    staleTime: 30 * 60 * 1000, // 30 min — lineups don't change often
  });
}

// ── Match Detail types ────────────────────────────────────────────────────────

export interface MatchEvent {
  type: 'goal' | 'own_goal' | 'yellow_card' | 'red_card' | 'second_yellow' | 'substitution' | 'penalty_missed' | 'var';
  minute: number;
  extra_time: number;
  player: string;
  player_in: string | null;
  team: 'home' | 'away';
}

export interface MatchStat {
  type: string;
  home: string | number | null;
  away: string | number | null;
}

export interface MatchDetail {
  matchId: string;
  home_team: string;
  away_team: string;
  home_badge: string | null;
  away_badge: string | null;
  score_home: number | null;
  score_away: number | null;
  ht_score_home: number | null;
  ht_score_away: number | null;
  status: string;
  match_time: string | null;
  match_date: string | null;
  competition: string;
  country: string;
  country_code: string;
  venue: string | null;
  referee: string | null;
  events: MatchEvent[];
  stats: MatchStat[];
  lineups: Omit<MatchLineups, 'matchId'>;
}

export function useMatchDetail(matchId: string | null) {
  return useQuery({
    queryKey: ['match-detail', matchId],
    queryFn: async (): Promise<MatchDetail> => {
      const { data, error } = await supabase.functions.invoke('livescore-match-detail', {
        body: { matchId },
      });
      if (error) throw error;
      return data as MatchDetail;
    },
    enabled: !!matchId,
    staleTime: 2 * 60 * 1000, // 2 min
    refetchInterval: (query) => {
      const d = query.state.data as MatchDetail | undefined;
      if (!d) return false;
      const s = d.status.toUpperCase();
      const finished = s === 'FT' || s === 'AET' || s === 'AP' || s === 'PEN';
      const notStarted = s === 'NS';
      return finished || notStarted ? false : 60_000; // refresh every 60s when live
    },
  });
}

export function useEventsForDay(date: string, limit = 20, offset = 0) {
  return useQuery({
    queryKey: ['livescore-events-day', date, offset, limit],
    queryFn: async (): Promise<LivescoreDayResponse> => {
      const { data, error } = await supabase.functions.invoke('livescore-events-day', {
        body: { date, offset, limit },
      });
      if (error) throw error;
      return data as LivescoreDayResponse;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

// Fetches all events for a day (no pagination) — used only for "my players" matching
export function useAllEventsForDay(date: string) {
  return useQuery({
    queryKey: ['livescore-events-day-all', date],
    queryFn: async (): Promise<LivescoreDayResponse> => {
      const { data, error } = await supabase.functions.invoke('livescore-events-day', {
        body: { date, offset: 0, limit: 9999 },
      });
      if (error) throw error;
      return data as LivescoreDayResponse;
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}
