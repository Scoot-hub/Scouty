import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface VideoItem {
  id: string;
  user_id: string;
  player_id: string;
  title: string;
  url: string | null;
  file_url: string | null;
  description: string | null;
  created_at: string;
}

export function usePlayerVideos(playerId: string | undefined) {
  return useQuery<VideoItem[]>({
    queryKey: ['player-videos', playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const res = await fetch(`${API_BASE}/player-videos/${playerId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch videos');
      return res.json();
    },
    enabled: !!playerId,
  });
}

export function useAddVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: { player_id: string; title: string; url?: string; file_url?: string; description?: string }) => {
      const res = await fetch(`${API_BASE}/player-videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error('Failed to add video');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['player-videos', data.player_id] });
    },
  });
}

export function useDeleteVideo() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, playerId }: { id: string; playerId: string }) => {
      const res = await fetch(`${API_BASE}/player-videos/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to delete video');
      return { playerId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['player-videos', data.playerId] });
    },
  });
}
