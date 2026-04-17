import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Fixture {
  id: string;
  user_id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  match_time: string | null;
  competition: string;
  venue: string;
  score_home: number | null;
  score_away: number | null;
  notes: string | null;
  is_favorite: boolean;
  source: 'manual' | 'api';
  api_fixture_id: number | null;
  api_league_id: number | null;
  created_at: string;
  updated_at: string;
}

export function useFixtures() {
  return useQuery({
    staleTime: 3 * 60 * 1000,
    queryKey: ['fixtures'],
    queryFn: async (): Promise<Fixture[]> => {
      const { data, error } = await supabase
        .from('fixtures')
        .select('*')
        .order('match_date', { ascending: true });
      if (error) throw error;
      return (data ?? []).map(row => ({
        ...row,
        is_favorite: !!row.is_favorite,
      })) as Fixture[];
    },
  });
}

export function useCreateFixture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (fixture: {
      home_team: string;
      away_team: string;
      match_date: string;
      match_time?: string | null;
      competition?: string;
      venue?: string;
      notes?: string;
    }) => {
      const { data, error } = await supabase
        .from('fixtures')
        .insert({
          home_team: fixture.home_team,
          away_team: fixture.away_team,
          match_date: fixture.match_date,
          match_time: fixture.match_time ?? null,
          competition: fixture.competition ?? '',
          venue: fixture.venue ?? '',
          notes: fixture.notes ?? null,
        })
        .select()
        .single();
      if (error) throw error;
      return { ...data, is_favorite: !!data.is_favorite } as Fixture;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixtures'] });
    },
  });
}

export function useUpdateFixture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: { id: string } & Partial<{
      home_team: string;
      away_team: string;
      match_date: string;
      match_time: string | null;
      competition: string;
      venue: string;
      score_home: number | null;
      score_away: number | null;
      notes: string | null;
      is_favorite: boolean;
    }>) => {
      const payload: Record<string, unknown> = { ...fields };
      if ('is_favorite' in payload) {
        payload.is_favorite = payload.is_favorite ? 1 : 0;
      }
      const { data, error } = await supabase
        .from('fixtures')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return { ...data, is_favorite: !!data.is_favorite } as Fixture;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixtures'] });
    },
  });
}

export function useDeleteFixture() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('fixtures')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixtures'] });
    },
  });
}

export function useToggleFavorite() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_favorite }: { id: string; is_favorite: boolean }) => {
      const { error } = await supabase
        .from('fixtures')
        .update({ is_favorite: is_favorite ? 1 : 0 })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['fixtures'] });
    },
  });
}
