import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';

export interface OrgMessage {
  id: string;
  org_id: string;
  user_id: string;
  content: string;
  reply_to_id: string | null;
  reply_content: string | null;
  reply_author: string | null;
  edited_at: string | null;
  deleted_at: string | null;
  created_at: string;
  author_name: string;
  author_photo: string | null;
  reactions: { emoji: string; user_id: string }[];
}

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

// ── Message list (paginated) ─────────────────────────────────────────────────

export function useOrgMessages(orgId: string | undefined) {
  return useInfiniteQuery({
    queryKey: ['org-messages', orgId],
    enabled: !!orgId,
    initialPageParam: null as string | null,
    getNextPageParam: () => null,
    getPreviousPageParam: (firstPage) =>
      firstPage.has_more ? (firstPage.messages[0]?.created_at ?? null) : null,
    queryFn: async ({ pageParam }): Promise<{ messages: OrgMessage[]; has_more: boolean }> => {
      const params = new URLSearchParams({ limit: '40' });
      if (pageParam) params.set('before', pageParam);
      const res = await fetch(`/api/organizations/${orgId}/messages?${params}`, authInit());
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 5_000, // poll every 5 s for near-real-time feel
  });
}

// ── Send message ─────────────────────────────────────────────────────────────

export function useSendOrgMessage(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ content, reply_to_id }: { content: string; reply_to_id?: string | null }) => {
      const res = await fetch(`/api/organizations/${orgId}/messages`, {
        ...authInit(),
        method: 'POST',
        body: JSON.stringify({ content, reply_to_id: reply_to_id ?? null }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      return data.message as OrgMessage;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['org-messages', orgId] });
    },
  });
}

// ── Delete message ───────────────────────────────────────────────────────────

export function useDeleteOrgMessage(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (msgId: string) => {
      const res = await fetch(`/api/organizations/${orgId}/messages/${msgId}`, {
        ...authInit(), method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-messages', orgId] }),
  });
}

// ── Edit message ─────────────────────────────────────────────────────────────

export function useEditOrgMessage(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ msgId, content }: { msgId: string; content: string }) => {
      const res = await fetch(`/api/organizations/${orgId}/messages/${msgId}`, {
        ...authInit(), method: 'PUT',
        body: JSON.stringify({ content }),
      });
      const data = await res.json();
      if (!res.ok) throw data;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-messages', orgId] }),
  });
}

// ── Reactions ────────────────────────────────────────────────────────────────

export function useReactOrgMessage(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ msgId, emoji }: { msgId: string; emoji: string }) => {
      const res = await fetch(`/api/organizations/${orgId}/messages/${msgId}/react`, {
        ...authInit(), method: 'POST',
        body: JSON.stringify({ emoji }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-messages', orgId] }),
  });
}

// ── Mark as read ─────────────────────────────────────────────────────────────

export function useMarkOrgRead(orgId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(`/api/organizations/${orgId}/messages/read`, {
        ...authInit(), method: 'POST', body: '{}',
      });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['org-unread', orgId] }),
  });
}

// ── Typing indicator ─────────────────────────────────────────────────────────

export interface TypingUser { user_id: string; name: string; photo: string | null; }

export function useOrgTyping(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-typing', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ users: TypingUser[] }> => {
      const res = await fetch(`/api/organizations/${orgId}/typing`, authInit());
      if (!res.ok) return { users: [] };
      return res.json();
    },
    refetchInterval: 2_000,
    staleTime: 0,
  });
}

export function useBroadcastTyping(orgId: string | undefined) {
  return useMutation({
    mutationFn: async () => {
      if (!orgId) return;
      await fetch(`/api/organizations/${orgId}/typing`, { ...authInit(), method: 'POST', body: '{}' });
    },
  });
}

// ── Unread count ─────────────────────────────────────────────────────────────

export function useOrgUnread(orgId: string | undefined) {
  return useQuery({
    queryKey: ['org-unread', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<{ count: number; last_read_at: string | null }> => {
      const res = await fetch(`/api/organizations/${orgId}/unread`, authInit());
      if (!res.ok) return { count: 0, last_read_at: null };
      return res.json();
    },
    refetchInterval: 15_000,
    staleTime: 0,
  });
}
