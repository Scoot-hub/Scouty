import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface NotificationPrefs {
  email_match_assigned: boolean;
  email_org_invite: boolean;
  email_community: boolean;
  email_weekly: boolean;
  web_bell: boolean;
}

const DEFAULT: NotificationPrefs = {
  email_match_assigned: true,
  email_org_invite: true,
  email_community: true,
  email_weekly: false,
  web_bell: true,
};

async function savePrefs(prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  const res = await fetch('/api/notification-prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error('Failed to save');
  return res.json();
}

function getAuthHeaders(): Record<string, string> {
  try {
    const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch { return {}; }
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: async () => {
      const res = await fetch('/api/notification-prefs', { headers: getAuthHeaders() });
      if (!res.ok) return DEFAULT;
      return res.json() as Promise<NotificationPrefs>;
    },
    staleTime: 30_000,
  });
}

export function useSaveNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: savePrefs,
    onSuccess: (data) => {
      qc.setQueryData(['notification-prefs'], data);
    },
  });
}
