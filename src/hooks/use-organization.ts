import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Player } from '@/types/player';

// Slug helper: "FC Lyon Scouting" → "fc-lyon-scouting"
export function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Fetch all organizations the current user belongs to
export function useMyOrganizations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['my-organizations', user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data: memberships, error: memErr } = await supabase
        .from('organization_members')
        .select('*')
        .eq('user_id', user.id);
      if (memErr || !memberships || memberships.length === 0) return [];

      // Fetch each org individually (.in() not supported by custom MySQL backend)
      const orgs = await Promise.all(
        memberships.map(async (m: any) => {
          const { data: org } = await supabase
            .from('organizations')
            .select('*')
            .eq('id', m.organization_id)
            .maybeSingle();
          return org ? { ...org, myRole: m.role as string } : null;
        })
      );
      return orgs.filter(Boolean);
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}

// Convenience: returns the first organization (backward compat)
export function useMyOrganization() {
  const result = useMyOrganizations();
  return {
    ...result,
    data: result.data?.[0] ?? null,
  };
}

// Returns the org matching the :orgSlug URL param
export function useCurrentOrg() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const result = useMyOrganizations();
  const org = result.data?.find(o => slugify(o.name) === orgSlug) ?? null;
  return { ...result, data: org };
}

// Fetch all members of an organization (with their profiles)
export function useOrganizationMembers(organizationId: string | undefined) {
  return useQuery({
    queryKey: ['organization-members', organizationId],
    queryFn: async () => {
      if (!organizationId) return [];
      const { data, error } = await supabase.rpc('get_org_members' as any, { organization_id: organizationId });
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000,
  });
}

// Create a new organization
export function useCreateOrganization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, type, logoFile }: { name: string; type: string; logoFile?: File }) => {
      if (!user) throw new Error('Not authenticated');

      // Generate invite code (16 chars)
      const inviteCode = crypto.randomUUID().replace(/-/g, '').substring(0, 16).toLowerCase();

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .insert({ name, type, invite_code: inviteCode, created_by: user.id })
        .select()
        .single();
      if (orgErr) throw orgErr;

      // Add creator as owner
      const { error: memErr } = await supabase
        .from('organization_members')
        .insert({ organization_id: org.id, user_id: user.id, role: 'owner' });
      if (memErr) throw memErr;

      // Upload logo if provided
      if (logoFile) {
        const session = (await supabase.auth.getSession()).data.session;
        const form = new FormData();
        form.append('file', logoFile);
        await fetch(`${API_BASE}/organizations/${org.id}/logo`, {
          method: 'PATCH',
          headers: { Authorization: `Bearer ${session?.access_token}` },
          body: form,
        });
      }

      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });
}

// Join an organization by invite code
export function useJoinOrganization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rawInput: string) => {
      if (!user) throw new Error('Not authenticated');

      // Extract code from a full invite link or raw code
      let code = rawInput.trim();
      try {
        const url = new URL(code);
        code = url.searchParams.get('invite') || code;
      } catch { /* not a URL, use as-is */ }
      code = code.toLowerCase();

      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .eq('invite_code', code)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) throw new Error('INVALID_CODE');

      // Check not already a member
      const { data: existing } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', org.id)
        .eq('user_id', user.id)
        .maybeSingle();
      if (existing) throw new Error('ALREADY_MEMBER');

      const { error: memErr } = await supabase
        .from('organization_members')
        .insert({ organization_id: org.id, user_id: user.id, role: 'member' });
      if (memErr) throw memErr;

      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });
}

// Update member role
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const { error } = await supabase
        .from('organization_members')
        .update({ role })
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
    },
  });
}

// Remove a member from the organization
export function useRemoveMember() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (memberId: string) => {
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
    },
  });
}

// Leave organization
export function useLeaveOrganization() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      if (!user) throw new Error('Not authenticated');
      const { error } = await supabase
        .from('organization_members')
        .delete()
        .eq('organization_id', organizationId)
        .eq('user_id', user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
    },
  });
}

export function useDeleteOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (organizationId: string) => {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${(import.meta.env.API_URL || '/api').replace(/\/$/, '')}/organizations/${organizationId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
    },
  });
}

// Upload or remove the organization logo (owner/admin only)
const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export function useUpdateOrgLogo(orgId: string | undefined) {
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!orgId) throw new Error('No org id');
      const session = (await supabase.auth.getSession()).data.session;
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/organizations/${orgId}/logo`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      return res.json() as Promise<{ logo_url: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No org id');
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${API_BASE}/organizations/${orgId}/logo`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });

  return { upload, remove };
}

// Fetch all shared players for a specific organization
export function useOrgPlayers(orgId?: string) {
  const { user } = useAuth();
  const currentOrg = useCurrentOrg();
  const resolvedOrgId = orgId || currentOrg.data?.id;
  return useQuery({
    queryKey: ['org-players', resolvedOrgId],
    queryFn: async (): Promise<(Player & { owner_name?: string })[]> => {
      const { data, error } = await supabase.rpc('get_org_players', { org_id: resolvedOrgId });
      if (error) throw error;
      return ((data as any[]) || []).map(row => ({
        ...row,
        current_level: Number(row.current_level),
        potential: Number(row.potential),
      }));
    },
    enabled: !!user && !!resolvedOrgId,
    staleTime: 30 * 1000,
  });
}

