import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface MatchAssignment {
  id: string;
  user_id: string;
  organization_id: string | null;
  assigned_to: string | null;
  assigned_by: string | null;
  home_team: string;
  away_team: string;
  match_date: string;
  match_time: string | null;
  competition: string;
  venue: string;
  home_badge: string | null;
  away_badge: string | null;
  notes: string | null;
  status: 'planned' | 'confirmed' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
  // Enriched fields (joined)
  assigned_to_name?: string;
  assigned_by_name?: string;
}

/** Personal "my matches" — no org, just current user */
export function useMyMatches() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-matches', user?.id],
    queryFn: async (): Promise<MatchAssignment[]> => {
      const { data, error } = await supabase
        .from('match_assignments')
        .select('*')
        .eq('user_id', user!.id)
        .eq('organization_id', null as any)
        .order('match_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MatchAssignment[];
    },
    enabled: !!user,
  });
}

/** Org roadmap — all match assignments for an organization */
export function useOrgMatchAssignments(organizationId?: string) {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['org-match-assignments', organizationId],
    queryFn: async (): Promise<MatchAssignment[]> => {
      const { data, error } = await supabase
        .from('match_assignments')
        .select('*')
        .eq('organization_id', organizationId!)
        .order('match_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as MatchAssignment[];
    },
    enabled: !!user && !!organizationId,
  });
}

/** Save a match to personal roadmap */
export function useSaveMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (match: {
      home_team: string;
      away_team: string;
      match_date: string;
      match_time?: string | null;
      competition?: string;
      venue?: string;
      home_badge?: string | null;
      away_badge?: string | null;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('match_assignments')
        .insert({
          user_id: user!.id,
          home_team: match.home_team,
          away_team: match.away_team,
          match_date: match.match_date,
          match_time: match.match_time ?? null,
          competition: match.competition ?? '',
          venue: match.venue ?? '',
          home_badge: match.home_badge ?? null,
          away_badge: match.away_badge ?? null,
          notes: match.notes ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as MatchAssignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
    },
  });
}

/** Remove a match from personal roadmap */
export function useRemoveMatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('match_assignments')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
      queryClient.invalidateQueries({ queryKey: ['org-match-assignments'] });
    },
  });
}

/** Update status of a match assignment */
export function useUpdateMatchStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, notes }: { id: string; status?: string; notes?: string | null }) => {
      const payload: any = {};
      if (status !== undefined) payload.status = status;
      if (notes !== undefined) payload.notes = notes;
      const { data, error } = await supabase
        .from('match_assignments')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as MatchAssignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-matches'] });
      queryClient.invalidateQueries({ queryKey: ['org-match-assignments'] });
    },
  });
}

/** Assign a match to a scout (org context) */
export function useAssignMatch() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (params: {
      home_team: string;
      away_team: string;
      match_date: string;
      match_time?: string | null;
      competition?: string;
      venue?: string;
      home_badge?: string | null;
      away_badge?: string | null;
      organization_id: string;
      assigned_to: string;
      notes?: string | null;
    }) => {
      const { data, error } = await supabase
        .from('match_assignments')
        .insert({
          user_id: user!.id,
          home_team: params.home_team,
          away_team: params.away_team,
          match_date: params.match_date,
          match_time: params.match_time ?? null,
          competition: params.competition ?? '',
          venue: params.venue ?? '',
          home_badge: params.home_badge ?? null,
          away_badge: params.away_badge ?? null,
          organization_id: params.organization_id,
          assigned_to: params.assigned_to,
          assigned_by: user!.id,
          notes: params.notes ?? null,
        } as any)
        .select()
        .single();
      if (error) throw error;
      return data as MatchAssignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-match-assignments'] });
    },
  });
}

/** Update scout assignment on an existing match */
export function useUpdateAssignment() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, assigned_to }: { id: string; assigned_to: string | null }) => {
      const payload: any = {
        assigned_to,
        assigned_by: assigned_to ? user!.id : null,
      };
      const { data, error } = await supabase
        .from('match_assignments')
        .update(payload)
        .eq('id', id)
        .select()
        .single();
      if (error) throw error;
      return data as MatchAssignment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['org-match-assignments'] });
    },
  });
}
