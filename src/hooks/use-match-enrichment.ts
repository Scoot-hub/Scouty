import { useQuery } from '@tanstack/react-query';

const API = '/api';

// ── ScoreBat videos ───────────────────────────────────────────────────────────

export interface ScoreBatVideo {
  title: string;
  url: string;
  thumbnail: string;
  date: string;
  competition: { id: string; name: string } | null;
  videos: { embed: string; title?: string }[];
}

export function useScoreBatVideos(team1: string | null, team2: string | null) {
  return useQuery<{ videos: ScoreBatVideo[] }>({
    queryKey: ['scorebat', team1, team2],
    enabled: !!(team1 && team2),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (team1) p.set('team1', team1);
      if (team2) p.set('team2', team2);
      const r = await fetch(`${API}/scorebat/videos?${p}`, { credentials: 'include' });
      if (!r.ok) return { videos: [] };
      return r.json();
    },
    staleTime: 15 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
  });
}

// ── FotMob xG ─────────────────────────────────────────────────────────────────

export interface FotMobXG {
  home: number | null;
  away: number | null;
}

export function useFotMobXG(team1: string | null, team2: string | null, date: string | null) {
  return useQuery<{ xg: FotMobXG | null }>({
    queryKey: ['fotmob-xg', team1, team2, date],
    enabled: !!(team1 && team2 && date),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (team1) p.set('team1', team1);
      if (team2) p.set('team2', team2);
      if (date) p.set('date', date);
      const r = await fetch(`${API}/fotmob/xg?${p}`, { credentials: 'include' });
      if (!r.ok) return { xg: null };
      return r.json();
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 60 * 60 * 1000,
  });
}

// ── football-data.org form ────────────────────────────────────────────────────

export interface FormEntry {
  result: 'W' | 'D' | 'L';
  myScore: number;
  opScore: number;
  opponent: string;
  date: string;
  isHome: boolean;
}

export function useFDOrgForm(teamName: string | null) {
  return useQuery<{ form: FormEntry[] | null; teamName?: string }>({
    queryKey: ['fdorg-form', teamName],
    enabled: !!teamName,
    queryFn: async () => {
      const r = await fetch(`${API}/fdorg/form?team=${encodeURIComponent(teamName!)}`, { credentials: 'include' });
      if (!r.ok) return { form: null };
      return r.json();
    },
    staleTime: 60 * 60 * 1000,
    gcTime: 2 * 60 * 60 * 1000,
    retry: false,
  });
}

// ── football-data.org H2H ─────────────────────────────────────────────────────

export interface H2HMatch {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  competition?: string;
}

export function useFDOrgH2H(team1: string | null, team2: string | null) {
  return useQuery<{ matches: H2HMatch[] }>({
    queryKey: ['fdorg-h2h', team1, team2],
    enabled: !!(team1 && team2),
    queryFn: async () => {
      const p = new URLSearchParams();
      if (team1) p.set('team1', team1);
      if (team2) p.set('team2', team2);
      const r = await fetch(`${API}/fdorg/h2h?${p}`, { credentials: 'include' });
      if (!r.ok) return { matches: [] };
      return r.json();
    },
    staleTime: 2 * 60 * 60 * 1000,
    gcTime: 4 * 60 * 60 * 1000,
    retry: false,
  });
}
