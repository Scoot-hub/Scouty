import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// Shared channel — exported so AppLayout can listen and broadcast from one place
export const notifChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel('scouty-notifications')
  : null;

export function broadcastNotifChange() {
  notifChannel?.postMessage({ type: 'NOTIFICATIONS_CHANGED' });
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
      const res = await fetch(`${API_BASE}/notifications`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch notifications');
      return res.json();
    },
    staleTime: 10 * 1000,
    refetchInterval: 10 * 1000,   // fallback poll every 10 s
    refetchOnWindowFocus: true,    // instant update when switching back to the tab
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
        credentials: 'include',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      broadcastNotifChange();
    },
  });
}

export function useMarkAllAsRead() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await fetch(`${API_BASE}/notifications/read-all`, {
        method: 'POST',
        credentials: 'include',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      broadcastNotifChange();
    },
  });
}

export function useDeleteNotification() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await fetch(`${API_BASE}/notifications/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
      broadcastNotifChange();
    },
  });
}
