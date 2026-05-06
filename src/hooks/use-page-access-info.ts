import { useQuery } from '@tanstack/react-query';

function getAuthHeaders(): Record<string, string> {
  try {
    const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
    return session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {};
  } catch { return {}; }
}

/** Returns a map of { page_key → roles[] } for roles that have view access */
export function usePageAccessInfo() {
  return useQuery({
    queryKey: ['page-access-info'],
    queryFn: async (): Promise<Record<string, string[]>> => {
      const res = await fetch('/api/page-access-info', { headers: getAuthHeaders() });
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
}
