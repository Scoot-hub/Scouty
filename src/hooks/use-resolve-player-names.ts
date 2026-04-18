import { useQuery } from '@tanstack/react-query';

export interface PlayerNameMatch {
  id: string;
  name: string;
}

export function useResolvePlayerNames(
  names: string[],
  home?: string,
  away?: string,
) {
  const unique = Array.from(new Set(names.filter(n => n && n.trim()))).sort();
  const key = unique.join('|');

  return useQuery({
    queryKey: ['resolve-player-names', key, home ?? '', away ?? ''],
    queryFn: async (): Promise<Record<string, PlayerNameMatch>> => {
      const resp = await fetch('/api/players/resolve-names', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ names: unique, home, away }),
      });
      if (!resp.ok) return {};
      const json = await resp.json();
      return (json?.matches ?? {}) as Record<string, PlayerNameMatch>;
    },
    enabled: unique.length > 0,
    staleTime: 10 * 60 * 1000,
  });
}
