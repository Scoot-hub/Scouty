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
        memberships.map(async (m) => {
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
      const { data, error } = await supabase.rpc('get_org_members', { organization_id: organizationId });
      if (error) throw error;
      return (data || []) as Record<string, unknown>[];
    },
    enabled: !!organizationId,
    staleTime: 30 * 1000,
  });
}

// Create a new organization (server-side, enforces 2-org limit)
export function useCreateOrganization() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ name, type, logoFile }: { name: string; type: string; logoFile?: File }) => {
      const session = localStorage.getItem('scouthub_session');
      const token = session ? JSON.parse(session)?.access_token : null;

      const res = await fetch('/api/organizations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ name, type }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Erreur serveur');
      }
      const org = await res.json();

      // Upload logo if provided
      if (logoFile) {
        const form = new FormData();
        form.append('file', logoFile);
        await fetch(`/api/organizations/${org.id}/logo`, {
          method: 'PATCH',
          credentials: 'include',
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

// Fetch public organisations (opt-in to directory via org_visibility setting)
export function usePublicOrganizations(q: string) {
  return useQuery({
    queryKey: ['public-organizations', q],
    queryFn: async () => {
      const session = localStorage.getItem('scouthub_session');
      const token = session ? JSON.parse(session)?.access_token : null;
      const url = `/api/organizations/public${q ? `?q=${encodeURIComponent(q)}` : ''}`;
      const res = await fetch(url, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<PublicOrg[]>;
    },
    staleTime: 60_000,
  });
}

export interface PublicOrg {
  id: string;
  name: string;
  type: string;
  logo_url: string | null;
  description: string | null;
  member_count: number;
  max_members?: number;
  require_approval_to_join?: boolean;
  recruitment_status?: 'open' | 'recruiting' | 'closed';
  slogan?: string | null;
  theme?: string | null;
  invite_code?: string;
  banner_url?: string | null;
  website_url?: string | null;
  contact_email?: string | null;
  social_x?: string | null;
  social_linkedin?: string | null;
  social_instagram?: string | null;
  accent_color?: string | null;
  created_at?: string | null;
  allow_member_directory?: boolean;
}

export interface PublicOrgMember {
  user_id: string;
  role: string;
  joined_at: string | null;
  full_name: string | null;
  photo_url: string | null;
  club: string | null;
  profile_role: string | null;
}

// Fetch a single public org by id
export function usePublicOrg(id: string | undefined) {
  return useQuery({
    queryKey: ['public-org', id],
    queryFn: async () => {
      if (!id) return null;
      const session = localStorage.getItem('scouthub_session');
      const token = session ? JSON.parse(session)?.access_token : null;
      const res = await fetch(`/api/organizations/public/${id}`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<PublicOrg>;
    },
    enabled: !!id,
    staleTime: 60_000,
  });
}

// Fetch public member list for a public org (only when allow_member_directory is enabled)
export function usePublicOrgMembers(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['public-org-members', id],
    queryFn: async () => {
      if (!id) return [];
      const session = localStorage.getItem('scouthub_session');
      const token = session ? JSON.parse(session)?.access_token : null;
      const res = await fetch(`/api/organizations/public/${id}/members`, {
        credentials: 'include',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) return [];
      return res.json() as Promise<PublicOrgMember[]>;
    },
    enabled: !!id && enabled,
    staleTime: 120_000,
  });
}

// Update organization name and/or description (owner/admin)
export function useUpdateOrganization(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: { name?: string; description?: string }) => {
      if (!orgId) throw new Error('No org id');
      const res = await fetch(`${API_BASE}/organizations/${orgId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });
}

// Join an organization by invite code (handles approval flow + max_members cap)
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

      // Find org by invite code
      const { data: org, error: orgErr } = await supabase
        .from('organizations')
        .select('*')
        .eq('invite_code', code)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) throw new Error('INVALID_CODE');

      // Use dedicated endpoint that handles approval + max_members
      const res = await fetch(`${API_BASE}/organizations/${org.id}/join`, {
        method: 'POST',
        credentials: 'include',
      });
      const json = await res.json();
      if (!res.ok) {
        if (json.error === 'ALREADY_MEMBER') throw new Error('ALREADY_MEMBER');
        if (json.error === 'max_members_reached') throw new Error('MAX_MEMBERS_REACHED');
        throw new Error(json.error || 'Erreur');
      }
      if (json.pending) throw new Error('APPROVAL_PENDING');
      return org;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });
}

// Fetch pending join requests for the current org (admin only)
export function useJoinRequests(orgId: string | undefined) {
  return useQuery({
    queryKey: ['join-requests', orgId],
    queryFn: async () => {
      if (!orgId) return [];
      const res = await fetch(`${API_BASE}/organizations/${orgId}/join-requests`, { credentials: 'include' });
      if (!res.ok) return [];
      const json = await res.json();
      return json.requests as Array<{ id: string; user_id: string; name: string; photo_url: string | null; requested_at: string }>;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}

// Approve or reject a join request
export function useHandleJoinRequest(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ requestId, action }: { requestId: string; action: 'approve' | 'reject' }) => {
      const res = await fetch(`${API_BASE}/organizations/${orgId}/join-requests/${requestId}`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['join-requests', orgId] });
      queryClient.invalidateQueries({ queryKey: ['organization-members'] });
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });
}

// Update member role — dedicated endpoint (shim generic update lacks org-level auth)
export function useUpdateMemberRole() {
  const queryClient = useQueryClient();
  const currentOrg = useCurrentOrg();

  return useMutation({
    mutationFn: async ({ memberId, role }: { memberId: string; role: string }) => {
      const orgId = currentOrg.data?.id;
      if (!orgId) throw new Error('Organisation introuvable');
      const res = await fetch(`${API_BASE}/organizations/${orgId}/members/${memberId}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ role }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      return json;
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
    mutationFn: async ({ organizationId, message }: { organizationId: string; message: string }) => {
      const res = await fetch(`${(import.meta.env.API_URL || '/api').replace(/\/$/, '')}/organizations/${organizationId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ message }),
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
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/organizations/${orgId}/logo`, {
        method: 'PATCH',
        credentials: 'include',
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
      const res = await fetch(`${API_BASE}/organizations/${orgId}/logo`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });

  return { upload, remove };
}

// Save org-level settings JSON (owner/admin)
export function useUpdateOrgSettings(orgId: string | undefined) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (settings: Record<string, boolean | number | string>) => {
      if (!orgId) throw new Error('No org id');
      const res = await fetch(`${API_BASE}/organizations/${orgId}/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(settings),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      return json;
    },
    onMutate: async (newSettings) => {
      // Optimistically update the cache so OrgTabBar and sidebar react immediately
      await queryClient.cancelQueries({ queryKey: ['my-organizations'] });
      const previous = queryClient.getQueryData<Record<string, unknown>[]>(['my-organizations', user?.id]);
      if (previous) {
        queryClient.setQueryData(
          ['my-organizations', user?.id],
          previous.map(org =>
            (org as Record<string, unknown>).id === orgId
              ? { ...org, settings: JSON.stringify({ ...(typeof (org as any).settings === 'string' ? JSON.parse((org as any).settings || '{}') : ((org as any).settings || {})), ...newSettings }) }
              : org
          )
        );
      }
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['my-organizations', user?.id], context.previous);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
    },
  });
}

// Update org public page text fields (owner/admin)
export function useUpdateOrgPublicPage(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      slogan?: string;
      website_url?: string;
      contact_email?: string;
      social_x?: string;
      social_linkedin?: string;
      social_instagram?: string;
      recruitment_status?: 'open' | 'recruiting' | 'closed';
      accent_color?: string;
    }) => {
      if (!orgId) throw new Error('No org id');
      const res = await fetch(`${API_BASE}/organizations/${orgId}/public-page`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(data),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['public-org', orgId] });
    },
  });
}

// Upload or remove org banner image (owner/admin)
export function useUpdateOrgBanner(orgId: string | undefined) {
  const queryClient = useQueryClient();

  const upload = useMutation({
    mutationFn: async (file: File) => {
      if (!orgId) throw new Error('No org id');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_BASE}/organizations/${orgId}/banner`, {
        method: 'PATCH',
        credentials: 'include',
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Upload failed');
      }
      return res.json() as Promise<{ banner_url: string }>;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['public-org', orgId] });
    },
  });

  const remove = useMutation({
    mutationFn: async () => {
      if (!orgId) throw new Error('No org id');
      const res = await fetch(`${API_BASE}/organizations/${orgId}/banner`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['my-organizations'] });
      queryClient.invalidateQueries({ queryKey: ['public-org', orgId] });
    },
  });

  return { upload, remove };
}

// Toggle messaging block for a specific member (owner/admin)
export function useBlockMemberMessaging(orgId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId, blocked }: { memberId: string; blocked: boolean }) => {
      if (!orgId) throw new Error('No org id');
      const res = await fetch(`${API_BASE}/organizations/${orgId}/members/${memberId}/block-messaging`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ blocked }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Erreur');
      return json;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['organization-members', orgId] });
    },
  });
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
      return ((data as Record<string, unknown>[]) || []).map(row => ({
        ...row,
        current_level: Number(row.current_level),
        potential: Number(row.potential),
      }));
    },
    enabled: !!user && !!resolvedOrgId,
    staleTime: 30 * 1000,
  });
}

