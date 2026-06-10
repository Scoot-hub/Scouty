import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

export interface NotificationPrefs {
  email_match_assigned: boolean;
  email_org_invite: boolean;
  email_community: boolean;
  email_weekly: boolean;
  web_bell: boolean;
  // Alert preferences (used by server-side cron jobs)
  alert_no_report_days: 0 | 7 | 30;    // 0 = never, 7 = after 7 days, 30 = after 30 days
  alert_contract_months: 0 | 3 | 6 | 12; // 0 = never, otherwise months before expiry
  alert_transfer: boolean;              // notify when a watchlisted player changes club
  alert_injury: boolean;                // notify on injury / recovery for watchlisted players
}

export const DEFAULT_NOTIF_PREFS: NotificationPrefs = {
  email_match_assigned: true,
  email_org_invite: true,
  email_community: true,
  email_weekly: false,
  web_bell: true,
  alert_no_report_days: 30,
  alert_contract_months: 3,
  alert_transfer: true,
  alert_injury: true,
};

function getAuthHeaders(): Record<string, string> {
  try {
    const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch { return {}; }
}

async function savePrefs(prefs: Partial<NotificationPrefs>): Promise<NotificationPrefs> {
  const res = await fetch('/api/notification-prefs', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
    body: JSON.stringify(prefs),
  });
  if (!res.ok) throw new Error('Failed to save');
  return res.json();
}

export function useNotificationPrefs() {
  return useQuery({
    queryKey: ['notification-prefs'],
    queryFn: async () => {
      const res = await fetch('/api/notification-prefs', { headers: getAuthHeaders() });
      if (!res.ok) return DEFAULT_NOTIF_PREFS;
      const data = await res.json();
      return { ...DEFAULT_NOTIF_PREFS, ...data } as NotificationPrefs;
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
