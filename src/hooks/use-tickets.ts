import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function authFetchInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface Ticket {
  id: string;
  user_id: string;
  category: string;
  subject: string;
  message: string;
  page_url: string | null;
  user_agent: string | null;
  status: 'open' | 'in_progress' | 'closed';
  created_at: string;
  updated_at: string;
  user_email?: string;
  user_name?: string;
  unread_count?: number;
}

export interface TicketMessage {
  id: string;
  ticket_id: string;
  sender_id: string;
  is_admin: number;
  body: string;
  created_at: string;
  sender_name?: string;
  sender_email?: string;
}

// ── Admin hooks ─────────────────────────────────────────────────────────────

export function useAdminTickets() {
  return useQuery<Ticket[]>({
    queryKey: ['admin-tickets'],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/tickets`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useAdminTicketUnreadCount() {
  return useQuery<number>({
    queryKey: ['admin-tickets-unread'],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/tickets/unread-count`, { ...authFetchInit() });
      if (!res.ok) return 0;
      const d = await res.json();
      return d.count ?? 0;
    },
    staleTime: 60_000,
    refetchInterval: 120_000,
  });
}

export function useAdminTicketDetail(id: string | null) {
  return useQuery<{ ticket: Ticket; messages: TicketMessage[] }>({
    queryKey: ['admin-ticket', id],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/tickets/${id}`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useAdminReplyTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const res = await fetch(`${API}/admin/tickets/${ticketId}/reply`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-ticket', vars.ticketId] });
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-tickets-unread'] });
    },
  });
}

export function useAdminSendTicketEmail() {
  return useMutation({
    mutationFn: async (ticketId: string) => {
      const res = await fetch(`${API}/admin/tickets/${ticketId}/email`, {
        method: 'POST', ...authFetchInit(),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });
}

export function useAdminUpdateTicketStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, status }: { ticketId: string; status: string }) => {
      const res = await fetch(`${API}/admin/tickets/${ticketId}/status`, {
        method: 'PATCH', ...authFetchInit(), body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['admin-ticket', vars.ticketId] });
      qc.invalidateQueries({ queryKey: ['admin-tickets'] });
      qc.invalidateQueries({ queryKey: ['admin-tickets-unread'] });
    },
  });
}

// ── User-side hooks ─────────────────────────────────────────────────────────

export function useMyTickets() {
  return useQuery<Ticket[]>({
    queryKey: ['my-tickets'],
    queryFn: async () => {
      const res = await fetch(`${API}/my-tickets`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 30_000,
  });
}

export function useMyTicketDetail(id: string | null) {
  return useQuery<{ ticket: Ticket; messages: TicketMessage[] }>({
    queryKey: ['my-ticket', id],
    queryFn: async () => {
      const res = await fetch(`${API}/my-tickets/${id}`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useMyTicketReply() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, body }: { ticketId: string; body: string }) => {
      const res = await fetch(`${API}/my-tickets/${ticketId}/reply`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['my-ticket', vars.ticketId] });
      qc.invalidateQueries({ queryKey: ['my-tickets'] });
    },
  });
}
