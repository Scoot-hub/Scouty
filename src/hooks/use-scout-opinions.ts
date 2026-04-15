import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Opinion } from '@/types/player';

export interface OpinionLink {
  url: string;
  label?: string;
}

export interface ScoutOpinion {
  id: string;
  player_id: string;
  organization_id: string;
  user_id: string;
  current_level: number;
  potential: number;
  opinion: Opinion;
  notes: string | null;
  links: OpinionLink[];
  match_observed: string | null;
  observed_at: string | null;
  scout_name: string | null;
  created_at: string;
  updated_at: string;
}

export function useScoutOpinions(playerId: string | undefined, organizationId: string | undefined) {
  return useQuery({
    queryKey: ['scout-opinions', playerId, organizationId],
    queryFn: async (): Promise<ScoutOpinion[]> => {
      const { data, error } = await supabase.rpc('get_scout_opinions', {
        player_id: playerId,
        organization_id: organizationId,
      });
      if (error) throw error;
      return ((data as any[]) || []).map(row => ({
        ...row,
        current_level: Number(row.current_level),
        potential: Number(row.potential),
        links: Array.isArray(row.links) ? row.links : [],
      }));
    },
    enabled: !!playerId && !!organizationId,
    staleTime: 30 * 1000,
  });
}

export function useAddScoutOpinion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: {
      player_id: string;
      organization_id: string;
      current_level: number;
      potential: number;
      opinion: Opinion;
      notes?: string;
      links?: OpinionLink[];
      match_observed?: string;
      observed_at?: string;
    }) => {
      const { data, error } = await supabase.rpc('add_scout_opinion', params);
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scout-opinions', variables.player_id, variables.organization_id] });
    },
  });
}

export function useDeleteScoutOpinion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (params: { opinion_id: string; player_id: string; organization_id: string }) => {
      const { data, error } = await supabase.rpc('delete_scout_opinion', { opinion_id: params.opinion_id });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['scout-opinions', variables.player_id, variables.organization_id] });
    },
  });
}
