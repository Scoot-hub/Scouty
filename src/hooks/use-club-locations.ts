import { useQuery } from '@tanstack/react-query';

export interface ClubLocation {
  club_name: string;
  country: string;
  lat: number;
  lng: number;
}

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export function useClubLocations() {
  return useQuery<ClubLocation[]>({
    queryKey: ['club-locations'],
    queryFn: async () => {
      const resp = await fetch(`${API}/club-locations`);
      if (!resp.ok) return [];
      return resp.json();
    },
    staleTime: 10 * 60 * 1000,
  });
}
