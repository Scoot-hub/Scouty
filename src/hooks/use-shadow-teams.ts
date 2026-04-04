import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ShadowTeam {
  id: string;
  name: string;
  formation: string;
  logo_url?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface ShadowTeamPlayer {
  id: string;
  shadow_team_id: string;
  player_id: string;
  position_slot: string;
  rank: number;
  added_at: string;
}

export function useShadowTeams() {
  return useQuery({
    queryKey: ['shadow_teams'],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ShadowTeam[]> => {
      const { data, error } = await supabase
        .from('shadow_teams')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as ShadowTeam[];
    },
  });
}

export function useShadowTeamPlayers(shadowTeamId: string | undefined) {
  return useQuery({
    queryKey: ['shadow_team_players', shadowTeamId],
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ShadowTeamPlayer[]> => {
      if (!shadowTeamId) return [];
      const { data, error } = await supabase
        .from('shadow_team_players')
        .select('*')
        .eq('shadow_team_id', shadowTeamId)
        .order('rank', { ascending: true });
      if (error) throw error;
      return (data ?? []) as ShadowTeamPlayer[];
    },
    enabled: !!shadowTeamId,
  });
}

export function useCreateShadowTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (team: { name: string; formation: string; logo_url?: string }) => {
      const payload: Record<string, unknown> = { name: team.name, formation: team.formation };
      if (team.logo_url) payload.logo_url = team.logo_url;
      const { data, error } = await supabase
        .from('shadow_teams')
        .insert(payload as any)
        .select()
        .single();
      if (error) throw error;
      return data as ShadowTeam;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shadow_teams'] });
    },
  });
}

export function useUpdateShadowTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, formation, logo_url }: { id: string; name: string; formation: string; logo_url?: string | null }) => {
      const payload: Record<string, unknown> = { name, formation };
      // Only include logo_url in the update if explicitly passed (not undefined)
      if (logo_url !== undefined) payload.logo_url = logo_url;
      const { data, error } = await supabase
        .from('shadow_teams')
        .update(payload as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as ShadowTeam;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shadow_teams'] });
    },
  });
}

export function useDeleteShadowTeam() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('shadow_team_players')
        .delete()
        .eq('shadow_team_id', id);
      if (error) throw error;
      const { error: error2 } = await supabase
        .from('shadow_teams')
        .delete()
        .eq('id', id);
      if (error2) throw error2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shadow_teams'] });
      queryClient.invalidateQueries({ queryKey: ['shadow_team_players'] });
    },
  });
}

export function useAssignPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shadowTeamId, playerId, positionSlot, currentSlotPlayers }: {
      shadowTeamId: string; playerId: string; positionSlot: string;
      currentSlotPlayers: ShadowTeamPlayer[];
    }) => {
      const nextRank = currentSlotPlayers.length > 0
        ? Math.max(...currentSlotPlayers.map(p => p.rank ?? 0)) + 1
        : 0;

      const { data, error } = await supabase
        .from('shadow_team_players')
        .insert({ shadow_team_id: shadowTeamId, player_id: playerId, position_slot: positionSlot, rank: nextRank } as any)
        .select()
        .single();
      if (error) throw error;
      return data as ShadowTeamPlayer;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['shadow_team_players', vars.shadowTeamId] });
    },
  });
}

export function useRemovePlayerFromSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shadowTeamId, positionSlot, playerId }: {
      shadowTeamId: string; positionSlot: string; playerId: string;
    }) => {
      const { error } = await supabase
        .from('shadow_team_players')
        .delete()
        .eq('shadow_team_id', shadowTeamId)
        .eq('position_slot', positionSlot)
        .eq('player_id', playerId);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['shadow_team_players', vars.shadowTeamId] });
    },
  });
}

export function useRemapFormation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shadowTeamId, remaps }: {
      shadowTeamId: string;
      remaps: { id: string; newSlot: string }[];
    }) => {
      for (const { id, newSlot } of remaps) {
        const { error } = await supabase
          .from('shadow_team_players')
          .update({ position_slot: newSlot } as any)
          .eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['shadow_team_players', vars.shadowTeamId] });
    },
  });
}

export function useReorderSlot() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ shadowTeamId, orderedAssignments }: {
      shadowTeamId: string;
      orderedAssignments: ShadowTeamPlayer[];
    }) => {
      for (let i = 0; i < orderedAssignments.length; i++) {
        const a = orderedAssignments[i];
        if (a.rank !== i) {
          await supabase
            .from('shadow_team_players')
            .update({ rank: i } as any)
            .eq('id', a.id);
        }
      }
    },
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['shadow_team_players', vars.shadowTeamId] });
    },
  });
}
