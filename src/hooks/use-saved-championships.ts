import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface SavedChampionship {
  id: string;
  user_id: string;
  championship_name: string;
  championship_country: string | null;
  championship_logo: string | null;
  sofascore_id: number | null;
  created_at: string;
  player_count: number;
  club_count: number;
  top_club: string | null;
}

export function useSavedChampionships() {
  return useQuery<SavedChampionship[]>({
    queryKey: ['saved-championships'],
    queryFn: async () => {
      const res = await fetch(`${API}/saved-championships`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 0,
  });
}

export function useSaveChampionship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: { championship_name: string; championship_country?: string | null; championship_logo?: string | null; sofascore_id?: number | null }) => {
      const res = await fetch(`${API}/saved-championships`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      return res.json() as Promise<SavedChampionship>;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-championships'] }),
  });
}

export function useUnsaveChampionship() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${API}/saved-championships/${encodeURIComponent(name)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['saved-championships'] }),
  });
}
