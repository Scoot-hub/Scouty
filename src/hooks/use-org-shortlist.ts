import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface ShortlistEntry {
  id: string;
  player_id: string;
  status: 'en_veille' | 'a_observer' | 'en_discussion' | 'approche';
  notes: string | null;
  added_at: string;
  added_by: string;
  added_by_name: string;
  full_name: string;
  photo_url: string | null;
  position: string | null;
  club: string | null;
  nationality: string | null;
  age: number | null;
}

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

export function useOrgShortlist(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-shortlist', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ entries: ShortlistEntry[] }> => {
      const res = await fetch(`/api/organizations/${orgId}/shortlist`, authInit());
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useAddToShortlist(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ player_id, status, notes }: { player_id: string; status?: string; notes?: string }) => {
      const res = await fetch(`/api/organizations/${orgId}/shortlist`, {
        ...authInit(), method: 'POST',
        body: JSON.stringify({ player_id, status, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      return data.entry as ShortlistEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-shortlist', orgId] }),
  });
}

export function useUpdateShortlistEntry(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ entryId, status, notes }: { entryId: string; status?: string; notes?: string }) => {
      const res = await fetch(`/api/organizations/${orgId}/shortlist/${entryId}`, {
        ...authInit(), method: 'PATCH',
        body: JSON.stringify({ status, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      return data.entry as ShortlistEntry;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-shortlist', orgId] }),
  });
}

export function useRemoveFromShortlist(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (entryId: string) => {
      const res = await fetch(`/api/organizations/${orgId}/shortlist/${entryId}`, {
        ...authInit(), method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-shortlist', orgId] }),
  });
}
