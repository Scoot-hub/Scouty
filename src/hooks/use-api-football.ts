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
