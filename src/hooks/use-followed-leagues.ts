import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface FollowedLeague {
  id: string;
  user_id: string;
  league_id: number;
  league_name: string;
  league_country: string | null;
  league_logo: string | null;
  season: string;
  created_at: string;
  fixture_count: number;
  upcoming_count: number;
}

export interface ApiLeague {
  league: { id: number; name: string; type: string; logo: string };
  country: { name: string; code: string | null; flag: string | null };
  seasons: { year: number; current: boolean }[];
}

export function useFollowedLeagues() {
  return useQuery<FollowedLeague[]>({
    queryKey: ['followed-leagues'],
    queryFn: async () => {
      const res = await fetch(`${API}/followed-leagues`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 2 * 60_000,
  });
}

export function useFollowLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (league: { league_id: number; league_name: string; league_country?: string | null; league_logo?: string | null; season?: string }) => {
      const res = await fetch(`${API}/followed-leagues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(league),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error); }
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followed-leagues'] }),
  });
}

export function useUnfollowLeague() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (leagueId: number) => {
      const res = await fetch(`${API}/followed-leagues/${leagueId}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['followed-leagues'] }),
  });
}

export function useSearchLeagues(query: string) {
  return useQuery<ApiLeague[]>({
    queryKey: ['league-search', query],
    queryFn: async () => {
      if (!query.trim()) return [];
      const res = await fetch(`${API}/functions/apifootball-search-leagues`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ search: query }),
      });
      if (!res.ok) return [];
      const data = await res.json();
      return (data.leagues || []) as ApiLeague[];
    },
    enabled: query.trim().length >= 2,
    staleTime: 24 * 60 * 60_000,
  });
}
