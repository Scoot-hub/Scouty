import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface Watchlist {
  id: string;
  name: string;
  description: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface WatchlistPlayer {
  id: string;
  watchlist_id: string;
  player_id: string;
  added_at: string;
}

export function useWatchlists() {
  return useQuery({
    queryKey: ['watchlists'],
    queryFn: async (): Promise<Watchlist[]> => {
      const { data, error } = await supabase
        .from('watchlists')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as Watchlist[];
    },
  });
}

export function useWatchlistPlayers(watchlistId: string | undefined) {
  return useQuery({
    queryKey: ['watchlist_players', watchlistId],
    queryFn: async (): Promise<WatchlistPlayer[]> => {
      if (!watchlistId) return [];
      const { data, error } = await supabase
        .from('watchlist_players')
        .select('*')
        .eq('watchlist_id', watchlistId)
        .order('added_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as WatchlistPlayer[];
    },
    enabled: !!watchlistId,
  });
}

export function useCreateWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (watchlist: { name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('watchlists')
        .insert({ name: watchlist.name, description: watchlist.description ?? '' } as any)
        .select()
        .single();
      if (error) throw error;
      return data as Watchlist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });
}

export function useUpdateWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, name, description }: { id: string; name: string; description?: string }) => {
      const { data, error } = await supabase
        .from('watchlists')
        .update({ name, description: description ?? '' } as any)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as Watchlist;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
    },
  });
}

export function useDeleteWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('watchlist_players')
        .delete()
        .eq('watchlist_id', id);
      if (error) throw error;
      const { error: error2 } = await supabase
        .from('watchlists')
        .delete()
        .eq('id', id);
      if (error2) throw error2;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlists'] });
      queryClient.invalidateQueries({ queryKey: ['watchlist_players'] });
    },
  });
}

export function useAddPlayersToWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ watchlistId, playerIds }: { watchlistId: string; playerIds: string[] }) => {
      // Fetch existing entries to avoid duplicates
      const { data: existing } = await supabase
        .from('watchlist_players')
        .select('player_id')
        .eq('watchlist_id', watchlistId);
      const existingIds = new Set((existing ?? []).map((e: any) => e.player_id));
      const newIds = playerIds.filter(id => !existingIds.has(id));
      if (newIds.length === 0) return { added: 0 };

      for (const playerId of newIds) {
        const { error } = await supabase
          .from('watchlist_players')
          .insert({ watchlist_id: watchlistId, player_id: playerId } as any);
        if (error) throw error;
      }
      return { added: newIds.length };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist_players'] });
    },
  });
}

export function useRemovePlayerFromWatchlist() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ watchlistId, playerId }: { watchlistId: string; playerId: string }) => {
      const { error } = await supabase
        .from('watchlist_players')
        .delete()
        .eq('watchlist_id', watchlistId)
        .eq('player_id', playerId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['watchlist_players'] });
    },
  });
}
