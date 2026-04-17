import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export interface FollowedClub {
  id: string;
  user_id: string;
  club_name: string;
  notes: string | null;
  created_at: string;
}

export function useFollowedClubs() {
  return useQuery<FollowedClub[]>({
    queryKey: ['followed-clubs'],
    staleTime: 3 * 60 * 1000,
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/followed-clubs`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch followed clubs');
      return res.json();
    },
  });
}

export function useFollowClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ club_name, notes }: { club_name: string; notes?: string }) => {
      const res = await fetch(`${API_BASE}/followed-clubs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ club_name, notes }),
      });
      if (!res.ok) throw new Error('Failed to follow club');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['followed-clubs'] }),
  });
}

export function useUnfollowClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_BASE}/followed-clubs/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to unfollow club');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['followed-clubs'] }),
  });
}

export function useIsFollowingClub(clubName: string) {
  const { data: clubs = [] } = useFollowedClubs();
  return clubs.find(c => c.club_name.toLowerCase() === clubName.toLowerCase());
}
