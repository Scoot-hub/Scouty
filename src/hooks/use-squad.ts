import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useCurrentOrg } from '@/hooks/use-organization';
import { useAuth } from '@/contexts/AuthContext';
import type { SquadPlayer } from '@/types/squad';

export function useSquadPlayers(orgId?: string) {
  const { user } = useAuth();
  const currentOrg = useCurrentOrg();
  const resolvedOrgId = orgId || currentOrg.data?.id;
  return useQuery({
    queryKey: ['squad-players', resolvedOrgId],
    queryFn: async (): Promise<SquadPlayer[]> => {
      const { data, error } = await supabase.rpc('get_squad_players', { org_id: resolvedOrgId });
      if (error) throw error;
      return (data ?? []) as SquadPlayer[];
    },
    enabled: !!user && !!resolvedOrgId,
    staleTime: 30 * 1000,
  });
}

export function useUpsertSquadPlayer() {
  const queryClient = useQueryClient();
  const currentOrg = useCurrentOrg();
  return useMutation({
    mutationFn: async (player: Partial<SquadPlayer> & { name: string }) => {
      const payload = { ...player, org_id: currentOrg.data?.id } as any;
      const { data, error } = await supabase.rpc('upsert_squad_player', payload);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squad-players'] });
    },
  });
}

export function useDeleteSquadPlayer() {
  const queryClient = useQueryClient();
  const currentOrg = useCurrentOrg();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data, error } = await supabase.rpc('delete_squad_player', { id, org_id: currentOrg.data?.id });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['squad-players'] });
    },
  });
}
