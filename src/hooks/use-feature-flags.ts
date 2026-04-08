import { useQuery } from '@tanstack/react-query';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export function useFeatureFlags() {
  return useQuery<Record<string, boolean>>({
    queryKey: ['feature-flags-public'],
    queryFn: async () => {
      const res = await fetch(`${API}/feature-flags`);
      if (!res.ok) return {};
      return res.json();
    },
    staleTime: 5 * 60 * 1000, // 5 min
  });
}

/** Returns true if the feature is enabled (default: true when no flag set) */
export function useFeatureEnabled(key: string): boolean {
  const { data: flags } = useFeatureFlags();
  if (!flags || flags[key] === undefined) return true; // enabled by default
  return flags[key];
}
