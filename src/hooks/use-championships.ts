import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEAGUE_CLUBS } from '@/data/league-clubs';
import { SOFASCORE_TOURNAMENT_IDS, getLeagueLogoUrl, getTeamLogoUrl } from '@/data/sofascore-ids';


// ── Static championship list (from league-clubs.ts + international competitions) ──

const LEAGUE_COUNTRY: Record<string, string> = {
  'Ligue 1': 'France', 'Ligue 2': 'France',
  'Premier League': 'Angleterre', 'EFL Championship': 'Angleterre',
  'La Liga': 'Espagne', 'La Liga 2': 'Espagne',
  'Serie A': 'Italie', 'Serie B': 'Italie',
  'Bundesliga': 'Allemagne', '2. Bundesliga': 'Allemagne',
  'Liga Portugal': 'Portugal', 'Liga Portugal 2': 'Portugal',
  'Eredivisie': 'Pays-Bas', 'Eerste Divisie': 'Pays-Bas',
  'Jupiler Pro League': 'Belgique', 'Challenger Pro League': 'Belgique',
  'Super Lig Turquie': 'Turquie', 'TFF 1. Lig': 'Turquie',
  'Super League Suisse': 'Suisse', 'Challenge League Suisse': 'Suisse',
  'Superligaen': 'Danemark', 'NordicBet Liga': 'Danemark',
  'Allsvenskan': 'Suède', 'Superettan': 'Suède',
  'Eliteserien': 'Norvège', 'OBOS-ligaen': 'Norvège',
  'Bundesliga Autriche': 'Autriche', 'Erste Liga Autriche': 'Autriche',
  'SuperLiga Serbie': 'Serbie', 'Prva Liga Serbie': 'Serbie',
  'HNL Croatie': 'Croatie',
  'Super League Grèce': 'Grèce',
  'Premier League Ukrainienne': 'Ukraine',
  'Erovnuli Liga Géorgie': 'Géorgie',
  'Premier League Russe': 'Russie',
  'Ekstraklasa': 'Pologne',
  'Premier League Roumanie': 'Roumanie',
  'Fortuna Liga Tchéquie': 'République Tchèque',
  'NB I Hongrie': 'Hongrie',
  'Fortuna Liga Slovaquie': 'Slovaquie',
  'Premier League Écosse': 'Écosse',
  'League of Ireland': 'Irlande',
  'Premier League Islande': 'Islande', 'Úrvalsdeild': 'Islande',
  'Première Ligue Bulgarie': 'Bulgarie',
  'Premijer Liga Bosnie': 'Bosnie-Herzégovine',
  'Superliga Albanie': 'Albanie',
  'Prva Liga Slovénie': 'Slovénie',
  'Vysshaya Liga Biélorussie': 'Biélorussie',
  'Super Liga Moldavie': 'Moldavie',
  'Meistriliiga Estonie': 'Estonie',
  'Virsliga Lettonie': 'Lettonie',
  'A Lyga Lituanie': 'Lituanie',
  'First Division Chypre': 'Chypre',
  'Bardzraguyn Khumb Arménie': 'Arménie',
  'Premyer Liqa Azerbaïdjan': 'Azerbaïdjan',
  'Superliga Kosovo': 'Kosovo',
  'Prva Liga Macédoine du Nord': 'Macédoine du Nord',
  'Prva Crnogorska Liga': 'Monténégro',
  'BGL Ligue Luxembourg': 'Luxembourg',
  'NIFL Premiership': 'Irlande du Nord',
  'Cymru Premier': 'Pays de Galles',
  'Veikkausliiga': 'Finlande',
  'Liga Profesional Argentina': 'Argentine',
  'Liga BetPlay Colombie': 'Colombie',
  'Primera División Uruguay': 'Uruguay',
  'Primera División Chili': 'Chili',
  'Liga 1 Pérou': 'Pérou',
  'Liga Pro Équateur': 'Équateur',
  'Primera División Bolivie': 'Bolivie',
  'Primera División Paraguay': 'Paraguay',
  'Primera División Venezuela': 'Venezuela',
  'MLS': 'États-Unis',
  'USL Championship': 'États-Unis',
  'Canadian Premier League': 'Canada',
  'Liga MX': 'Mexique', 'Liga de Expansión MX': 'Mexique',
  'Liga Nacional Guatemala': 'Guatemala',
  'Liga Nacional Honduras': 'Honduras',
  'Primera División El Salvador': 'El Salvador',
  'Primera División Costa Rica': 'Costa Rica',
  'Liga Panameña': 'Panama',
  'Jamaica Premier League': 'Jamaïque',
  'TT Pro League': 'Trinité-et-Tobago',
  'Liga Dominicana': 'République Dominicaine',
  'Botola Pro Maroc': 'Maroc', 'Botola 2 Maroc': 'Maroc',
  'Ligue 1 Algérie': 'Algérie',
  'Ligue Professionnelle 1 Tunisie': 'Tunisie',
  'Egyptian Premier League': 'Égypte',
  'NPFL Nigeria': 'Nigeria',
  'Ghana Premier League': 'Ghana',
  'Ligue 1 Cameroun': 'Cameroun',
  'Ligue 1 Sénégal': 'Sénégal',
  'Linafoot RD Congo': 'RD Congo',
  'Premier League Afrique du Sud': 'Afrique du Sud',
  'Ligue 1 Mali': 'Mali',
  'Ligue 1 Guinée': 'Guinée',
  'Ligue 1 Burkina Faso': 'Burkina Faso',
  'Premier League Kenya': 'Kenya',
  'Premier League Tanzanie': 'Tanzanie',
  'Premier League Éthiopie': 'Éthiopie',
  'Premier League Ouganda': 'Ouganda',
  'Premier League Zimbabwe': 'Zimbabwe',
  'Super League Zambie': 'Zambie',
  'Premier League Rwanda': 'Rwanda',
  'Girabola Angola': 'Angola',
  'Moçambola': 'Mozambique',
  'Premier League Soudan': 'Soudan',
  'Ligue 1 Gabon': 'Gabon',
  'Ligue 1 Congo': 'Congo',
  'Ligue 1 Madagascar': 'Madagascar',
  'Saudi Pro League': 'Arabie Saoudite',
  'Stars League Qatar': 'Qatar',
  'UAE Pro League': 'Émirats Arabes Unis',
  'Persian Gulf Pro League': 'Iran',
  'J1 League': 'Japon', 'J2 League': 'Japon',
  'K League 1': 'Corée du Sud', 'K League 2': 'Corée du Sud',
  'Chinese Super League': 'Chine',
  'Indian Super League': 'Inde', 'I-League': 'Inde',
  'Thai League 1': 'Thaïlande',
  'V.League 1': 'Vietnam',
  'Liga 1 Indonésie': 'Indonésie',
  'Malaysia Super League': 'Malaisie',
  'Jordan League': 'Jordanie',
  'Lebanese Premier League': 'Liban',
  'Iraqi Premier League': 'Irak',
  'Kuwait Premier League': 'Koweït',
  'Bahraini Premier League': 'Bahreïn',
  'Super League Ouzbékistan': 'Ouzbékistan',
  'Premier League Kazakhstan': 'Kazakhstan',
  'A-League Men': 'Australie', 'A-League Women': 'Australie',
  'New Zealand Football Championship': 'Nouvelle-Zélande',
  'Libyan Premier League': 'Libye',
  'Namibia Premier League': 'Namibie',
  'Botswana Premier League': 'Botswana',
  'Hong Kong Premier League': 'Hong Kong',
  'Cambodia League': 'Cambodge',
  'Myanmar National League': 'Myanmar',
  'Bangladesh Premier League': 'Bangladesh',
  'Nepal Super League': 'Népal',
  'Sri Lanka Football Premier League': 'Sri Lanka',
  'Papua New Guinea NSL': 'Papouasie-Nouvelle-Guinée',
  'Fiji Premier League': 'Fidji',
  // International
  'Ligue des Champions': 'International',
  'Europa League': 'International',
  'Conference League': 'International',
  'Copa Libertadores': 'International',
  'Copa Sudamericana': 'International',
  'Ligue des Champions CAF': 'International',
  'Coupe du Monde': 'International',
  'Euro': 'International',
  'Copa America': 'International',
  'CAN': 'International',
  'Autre': 'Autre',
};

const INTERNATIONAL_COMPETITIONS = [
  'Ligue des Champions', 'Europa League', 'Conference League',
  'Copa Libertadores', 'Copa Sudamericana', 'Ligue des Champions CAF',
  'Coupe du Monde', 'Euro', 'Copa America', 'CAN',
];

// Transfermarkt competition IDs + URL slugs for match calendar scraping
export const TM_COMPETITION_MAP: Record<string, { id: string; slug: string }> = {
  'Ligue 1':                   { id: 'FR1',   slug: 'ligue-1' },
  'Ligue 2':                   { id: 'FR2',   slug: 'ligue-2' },
  'Premier League':            { id: 'GB1',   slug: 'premier-league' },
  'EFL Championship':          { id: 'GB2',   slug: 'championship' },
  'La Liga':                   { id: 'ES1',   slug: 'laliga' },
  'La Liga 2':                 { id: 'ES2',   slug: 'laliga2' },
  'Serie A':                   { id: 'IT1',   slug: 'serie-a' },
  'Serie B':                   { id: 'IT2',   slug: 'serie-b' },
  'Bundesliga':                { id: 'L1',    slug: '1-bundesliga' },
  '2. Bundesliga':             { id: 'L2',    slug: '2-bundesliga' },
  'Liga Portugal':             { id: 'PO1',   slug: 'liga-portugal-betclic' },
  'Liga Portugal 2':           { id: 'PO2',   slug: 'liga-portugal-sabseg' },
  'Eredivisie':                { id: 'NL1',   slug: 'eredivisie' },
  'Eerste Divisie':            { id: 'NL2',   slug: 'eerste-divisie' },
  'Jupiler Pro League':        { id: 'BE1',   slug: 'jupiler-pro-league' },
  'Super Lig Turquie':         { id: 'TR1',   slug: 'super-lig' },
  'Super League Suisse':       { id: 'C1',    slug: 'super-league' },
  'Superligaen':               { id: 'DK1',   slug: 'superliga' },
  'Allsvenskan':               { id: 'SE1',   slug: 'allsvenskan' },
  'Eliteserien':               { id: 'NO1',   slug: 'eliteserien' },
  'Bundesliga Autriche':       { id: 'A1',    slug: 'admiral-bundesliga' },
  'Premier League Écosse':     { id: 'SC1',   slug: 'scottish-premiership' },
  'Ekstraklasa':               { id: 'PL1',   slug: 'ekstraklasa' },
  'Super League Grèce':        { id: 'GR1',   slug: 'super-league-1' },
  'Premier League Ukrainienne':{ id: 'UKR1',  slug: 'premier-liga' },
  'SuperLiga Serbie':          { id: 'SRB1',  slug: 'superliga' },
  'HNL Croatie':               { id: 'KR1',   slug: 'hnl' },
  'NB I Hongrie':              { id: 'UNG1',  slug: 'nb-i' },
  'Fortuna Liga Tchéquie':     { id: 'TS1',   slug: 'fortuna-liga' },
  'Fortuna Liga Slovaquie':    { id: 'SLK1',  slug: 'fortuna-liga' },
  'Liga Profesional Argentina':{ id: 'AR1N',  slug: 'superliga' },
  'MLS':                       { id: 'MLS1',  slug: 'major-league-soccer' },
  'Liga MX':                   { id: 'MEX1',  slug: 'liga-mx' },
  'Saudi Pro League':          { id: 'SA1',   slug: 'saudi-pro-league' },
  'J1 League':                 { id: 'JP1',   slug: 'j1-league' },
  'K League 1':                { id: 'KLEG1', slug: 'k-league-1' },
  'Chinese Super League':      { id: 'CSL',   slug: 'chinese-super-league' },
  'Egyptian Premier League':   { id: 'EGY1',  slug: 'premier-league' },
  'Ligue des Champions':       { id: 'CL',    slug: 'champions-league' },
  'Europa League':             { id: 'EL',    slug: 'europa-league' },
  'Conference League':         { id: 'UECL',  slug: 'europa-conference-league' },
  'Copa Libertadores':         { id: 'LIBER', slug: 'copa-libertadores' },
};

export interface ChampionshipEntry {
  name: string;
  country: string;
  clubCount: number;
  logoUrl: string | null;
  sofascoreId: number | null;
  /** Transfermarkt competition code (e.g. "FR1", "GB1"). Used for match calendar scraping. */
  tmCompetitionId: string | null;
  /** Transfermarkt URL slug (e.g. "ligue-1"). Paired with tmCompetitionId. */
  tmSlug: string | null;
  clubs: string[];
  isCustom?: boolean;
  customId?: string;
}

export interface SofascoreTeam {
  id: number;
  name: string;
  shortName?: string;
  logoUrl: string;
  position?: number;
  points?: number;
  played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalsFor?: number;
  goalsAgainst?: number;
  goalDifference?: number;
  description?: string | null;
  promotionDescription?: string | null;
  noteColor?: string | null;
}

export interface ChampionshipPlayerLink {
  id: string;
  championship_name: string;
  player_id: string;
  created_at: string;
}

async function getCurrentUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Non authentifié');
  return user.id;
}

/** Returns the full championship catalog: static leagues + international + admin-added custom */
export function useChampionships() {
  return useQuery({
    queryKey: ['championships'],
    staleTime: 5 * 60 * 1000,
    queryFn: async (): Promise<ChampionshipEntry[]> => {
      // Static entries from LEAGUE_CLUBS
      const staticEntries: ChampionshipEntry[] = Object.keys(LEAGUE_CLUBS).map(name => ({
        name,
        country: LEAGUE_COUNTRY[name] ?? 'Autre',
        clubCount: LEAGUE_CLUBS[name].length,
        logoUrl: getLeagueLogoUrl(name),
        sofascoreId: SOFASCORE_TOURNAMENT_IDS[name] ?? null,
        tmCompetitionId: TM_COMPETITION_MAP[name]?.id ?? null,
        tmSlug: TM_COMPETITION_MAP[name]?.slug ?? null,
        clubs: LEAGUE_CLUBS[name],
      }));

      // International competitions
      const intlEntries: ChampionshipEntry[] = INTERNATIONAL_COMPETITIONS
        .filter(n => !LEAGUE_CLUBS[n])
        .map(name => ({
          name,
          country: 'International',
          clubCount: 0,
          logoUrl: getLeagueLogoUrl(name),
          sofascoreId: SOFASCORE_TOURNAMENT_IDS[name] ?? null,
          tmCompetitionId: TM_COMPETITION_MAP[name]?.id ?? null,
          tmSlug: TM_COMPETITION_MAP[name]?.slug ?? null,
          clubs: [],
        }));

      // Admin-added custom championships from DB
      let customEntries: ChampionshipEntry[] = [];
      try {
        const { data } = await supabase
          .from('custom_championships')
          .select('*')
          .order('name');
        if (data) {
          const staticNames = new Set([...Object.keys(LEAGUE_CLUBS), ...INTERNATIONAL_COMPETITIONS]);
          customEntries = data
            .filter(c => !staticNames.has(c.name))
            .map(c => ({
              name: c.name,
              country: c.country ?? 'Autre',
              clubCount: 0,
              logoUrl: null,
              sofascoreId: null,
              tmCompetitionId: null,
              tmSlug: null,
              clubs: [],
              isCustom: true,
              customId: c.id,
            }));
        }
      } catch {
        // Table may not exist yet — ignore
      }

      return [...staticEntries, ...intlEntries, ...customEntries];
    },
  });
}

/** Fetch players linked to a championship (by name) for the current user */
export function useChampionshipPlayers(championshipName: string | null) {
  return useQuery({
    queryKey: ['championship_players', championshipName],
    enabled: !!championshipName,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ChampionshipPlayerLink[]> => {
      const { data, error } = await supabase
        .from('championship_players')
        .select('*')
        .eq('championship_name', championshipName!);
      if (error) throw error;
      return (data ?? []) as ChampionshipPlayerLink[];
    },
  });
}

/** Admin only: add a custom championship */
export function useAddCustomChampionship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (champ: { name: string; country: string }) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('custom_championships')
        .insert({ name: champ.name, country: champ.country, created_by: userId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['championships'] });
    },
  });
}

/** Admin only: delete a custom championship */
export function useDeleteCustomChampionship() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('custom_championships')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['championships'] });
    },
  });
}

/** Link a player to a championship */
export function useLinkPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ championshipName, playerId }: { championshipName: string; playerId: string }) => {
      const userId = await getCurrentUserId();
      const { data, error } = await supabase
        .from('championship_players')
        .insert({ championship_name: championshipName, player_id: playerId, user_id: userId })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['championship_players', vars.championshipName] });
    },
  });
}

/** Unlink a player from a championship */
export function useUnlinkPlayer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ championshipName, playerId }: { championshipName: string; playerId: string }) => {
      const { error } = await supabase
        .from('championship_players')
        .delete()
        .eq('championship_name', championshipName)
        .eq('player_id', playerId);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      queryClient.invalidateQueries({ queryKey: ['championship_players', vars.championshipName] });
    },
  });
}

export function getChampionshipCountry(name: string): string {
  return LEAGUE_COUNTRY[name] ?? 'Autre';
}

/** Fetch team standings from ESPN (current or historical season) */
export interface StandingsResult {
  season: { name: string } | null;
  seasonYear: number | null;
  teams: SofascoreTeam[];
  fetched_at: string | null;
  from_cache: boolean;
  stale?: boolean;
}

async function fetchStandings(sofascoreId: number, seasonYear: number | null, refresh = false, championshipName?: string): Promise<StandingsResult> {
  const resp = await fetch('/api/functions/sofascore-league', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ tournamentId: sofascoreId, seasonYear: seasonYear ?? null, refresh, championshipName }),
  });
  if (!resp.ok) throw new Error(`Standings ${resp.status}`);
  const data = await resp.json();
  console.debug('[standings] raw response:', { source: data.source, teams: data.teams?.length, season: data.season, error: data.error });
  return {
    season: data.season ?? null,
    seasonYear: data.seasonYear ?? null,
    fetched_at: data.fetched_at ?? null,
    from_cache: data.from_cache ?? false,
    stale: data.stale ?? false,
    teams: (data.teams ?? []).map((t: Record<string, unknown>) => ({
      ...t,
      logoUrl: (t.logoUrl as string) || (t.id ? getTeamLogoUrl(t.id as number) : ''),
    })),
  };
}

export function useSofascoreLeague(sofascoreId: number | null, seasonYear?: number | null, championshipName?: string) {
  return useQuery({
    queryKey: ['sofascore-league', sofascoreId, seasonYear ?? 'current'],
    enabled: !!sofascoreId,
    staleTime: 60 * 60 * 1000,
    queryFn: () => fetchStandings(sofascoreId!, seasonYear ?? null, false, championshipName),
  });
}

export function useRefreshStandings() {
  const qc = useQueryClient();
  return async (sofascoreId: number, seasonYear: number | null, championshipName?: string) => {
    const fresh = await fetchStandings(sofascoreId, seasonYear, true, championshipName);
    qc.setQueryData(['sofascore-league', sofascoreId, seasonYear ?? 'current'], fresh);
    return fresh;
  };
}

const API_BASE_CHAMP = (typeof import.meta !== 'undefined' && (import.meta as any).env?.API_URL || '/api').replace(/\/$/, '');

export interface ChampionshipCustomClub { name: string; added_by: string | null; created_at: string }

export function useChampionshipCustomClubs(championshipName: string | null) {
  return useQuery({
    queryKey: ['championship-custom-clubs', championshipName],
    enabled: !!championshipName,
    staleTime: 2 * 60 * 1000,
    queryFn: async (): Promise<ChampionshipCustomClub[]> => {
      const res = await fetch(`${API_BASE_CHAMP}/championships/${encodeURIComponent(championshipName!)}/clubs`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });
}

export function useAddChampionshipClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ championshipName, clubName }: { championshipName: string; clubName: string }) => {
      const res = await fetch(`${API_BASE_CHAMP}/championships/${encodeURIComponent(championshipName)}/clubs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ clubName }),
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
    },
    onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['championship-custom-clubs', vars.championshipName] }),
  });
}

export function useRemoveChampionshipClub() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ championshipName, clubName }: { championshipName: string; clubName: string }) => {
      const res = await fetch(`${API_BASE_CHAMP}/championships/${encodeURIComponent(championshipName)}/clubs/${encodeURIComponent(clubName)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || `HTTP ${res.status}`); }
    },
    onSuccess: (_d, vars) => queryClient.invalidateQueries({ queryKey: ['championship-custom-clubs', vars.championshipName] }),
  });
}

/** Generate a list of available season years (current season going back N years) */
export function getAvailableSeasons(count = 6): { year: number; label: string }[] {
  const now = new Date();
  // Football season starting year: if before July → current "start" year is previous calendar year
  const currentStartYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return Array.from({ length: count }, (_, i) => {
    const year = currentStartYear - i;
    return { year, label: `${year}–${String(year + 1).slice(2)}` };
  });
}
