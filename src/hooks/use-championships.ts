import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LEAGUE_CLUBS } from '@/data/league-clubs';
import { SOFASCORE_TOURNAMENT_IDS, getLeagueLogoUrl, getTeamLogoUrl } from '@/data/sofascore-ids';
import { useAuth } from '@/contexts/AuthContext';

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

export interface ChampionshipEntry {
  name: string;
  country: string;
  clubCount: number;
  logoUrl: string | null;
  sofascoreId: number | null;
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
          customEntries = (data as any[])
            .filter(c => !staticNames.has(c.name))
            .map(c => ({
              name: c.name,
              country: c.country ?? 'Autre',
              clubCount: 0,
              logoUrl: null,
              sofascoreId: null,
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
        .insert({ name: champ.name, country: champ.country, created_by: userId } as any)
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
        .insert({ championship_name: championshipName, player_id: playerId, user_id: userId } as any)
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

/** Fetch live team data from SofaScore (standings, team IDs for logos) */
export function useSofascoreLeague(sofascoreId: number | null) {
  const { session } = useAuth();
  return useQuery({
    queryKey: ['sofascore-league', sofascoreId],
    enabled: !!sofascoreId,
    staleTime: 30 * 60 * 1000, // 30 min
    queryFn: async (): Promise<{ season: any; teams: SofascoreTeam[] }> => {
      const resp = await fetch('/api/functions/sofascore-league', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ tournamentId: sofascoreId }),
      });
      if (!resp.ok) throw new Error(`SofaScore ${resp.status}`);
      const data = await resp.json();
      return {
        season: data.season,
        teams: (data.teams ?? []).map((t: any) => ({
          ...t,
          logoUrl: t.id ? getTeamLogoUrl(t.id) : '',
        })),
      };
    },
  });
}
