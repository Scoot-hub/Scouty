import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { CLUB_TO_LEAGUE } from '@/data/league-clubs';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export interface ClubDirectoryEntry {
  club_name: string;
  competition: string;
  country: string;
  country_code: string;
  logo_url: string | null;
}

export function useClubDirectory() {
  return useQuery({
    queryKey: ['club-directory'],
    queryFn: async (): Promise<ClubDirectoryEntry[]> => {
      const resp = await fetch(`${API_BASE}/club-directory`);
      if (!resp.ok) return [];
      return resp.json();
    },
    staleTime: 30 * 60 * 1000, // 30 minutes
  });
}

/**
 * Returns deduplicated club names and competition names from the directory,
 * merged with the hardcoded fallback lists.
 */
export function useMergedClubsAndLeagues(
  fallbackClubs: string[],
  fallbackLeagues: string[],
) {
  const { data: directory = [] } = useClubDirectory();

  const clubs = new Set(fallbackClubs);
  const leagues = new Set(fallbackLeagues);
  const clubToLeague = new Map<string, string>();

  // 1. Static mapping (source de vérité)
  for (const [club, league] of Object.entries(CLUB_TO_LEAGUE)) {
    clubToLeague.set(club, league);
  }

  // 2. Dynamic directory — only fills in clubs not already covered by static mapping
  // (Static mapping is curated and wins: avoids wrong leagues from TheSportsDB)
  for (const entry of directory) {
    clubs.add(entry.club_name);
    if (entry.competition) {
      leagues.add(entry.competition);
      if (!clubToLeague.has(entry.club_name)) {
        clubToLeague.set(entry.club_name, entry.competition);
      }
    }
  }

  return {
    clubs: [...clubs].sort((a, b) => a.localeCompare(b)),
    leagues: [...leagues].sort((a, b) => a.localeCompare(b)),
    clubToLeague,
  };
}

/**
 * Resolves a club name to its current league via API-Football.
 * Stores the result in club_directory + league_name_mappings for future use.
 */
export function useResolveClubLeague() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (club: string): Promise<{ league: string | null; country?: string; logo?: string | null; source?: string }> => {
      const { data, error } = await supabase.functions.invoke('resolve-club-league', {
        body: { club },
      });
      if (error) throw error;
      return data as { league: string | null; country?: string; logo?: string | null; source?: string };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['club-directory'] });
    },
  });
}
