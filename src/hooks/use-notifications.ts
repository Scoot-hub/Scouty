import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

function getAuthHeader() {
  const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
  return session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
}

export interface Notification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string | null;
  icon: string | null;
  link: string | null;
  player_id: string | null;
  is_read: number;
  created_at: string;
}

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/notifications`, {
        headers: getAuthHeader(),
      });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
    staleTime: 30 * 1000,
    refetchInterval: 60000,
  });
}

export function useUnreadCount() {
  const { data: notifications } = useNotifications();
  return notifications?.filter(n => !n.is_read).length ?? 0;
}

export function useMarkAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_BASE}/notifications/${id}/read`, {
        method: 'PATCH',
        headers: getAuthHeader(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'POST',
        headers: getAuthHeader(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_BASE}/notifications/${id}`, {
        method: 'DELETE',
        headers: getAuthHeader(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
