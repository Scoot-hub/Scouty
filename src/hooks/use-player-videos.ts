import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function getAuthHeader() {
  const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
  return session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

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
      const res = await fetch(`${API_BASE}/player-videos/${playerId}`, { headers: getAuthHeader() });
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
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
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
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Failed to delete video');
      return { playerId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['player-videos', data.playerId] });
    },
  });
}
