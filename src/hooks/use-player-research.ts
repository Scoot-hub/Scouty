import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function getAuthHeader() {
  const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
  return session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export interface ResearchItem {
  id: string;
  user_id: string;
  player_id: string;
  type: 'note' | 'youtube' | 'article' | 'link';
  title: string;
  url: string | null;
  content: string | null;
  created_at: string;
}

export function usePlayerResearch(playerId: string | undefined) {
  return useQuery<ResearchItem[]>({
    queryKey: ['player-research', playerId],
    queryFn: async () => {
      if (!playerId) return [];
      const res = await fetch(`${API_BASE}/player-research/${playerId}`, { headers: getAuthHeader() });
      if (!res.ok) throw new Error('Failed to fetch research');
      return res.json();
    },
    enabled: !!playerId,
  });
}

export function useAddResearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (item: { player_id: string; type: string; title: string; url?: string; content?: string }) => {
      const res = await fetch(`${API_BASE}/player-research`, {
        method: 'POST',
        headers: { ...getAuthHeader(), 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (!res.ok) throw new Error('Failed to add research');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['player-research', data.player_id] });
    },
  });
}

export function useDeleteResearch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, playerId }: { id: string; playerId: string }) => {
      const res = await fetch(`${API_BASE}/player-research/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Failed to delete research');
      return { playerId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['player-research', data.playerId] });
    },
  });
}
