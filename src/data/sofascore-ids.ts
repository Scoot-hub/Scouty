/**
 * Mapping : nom de championnat (tel que dans LEAGUE_CLUBS) → SofaScore unique-tournament ID.
 *
 * Images :
 *   Logo ligue  → /api/image-proxy?url=https://api.sofascore.com/api/v1/unique-tournament/{id}/image
 *   Logo équipe → /api/image-proxy?url=https://api.sofascore.com/api/v1/team/{teamId}/image
 */

export const SOFASCORE_TOURNAMENT_IDS: Record<string, number> = {
  // ── Top 5 ──
  'Ligue 1': 34,
  'Ligue 2': 182,
  'Premier League': 17,
  'EFL Championship': 18,
  'La Liga': 8,
  'La Liga 2': 547,
  'Serie A': 23,
  'Serie B': 53,
  'Bundesliga': 35,
  '2. Bundesliga': 44,

  // ── Europe ──
  'Liga Portugal': 238,
  'Liga Portugal 2': 370,
  'Eredivisie': 37,
  'Eerste Divisie': 131,
  'Jupiler Pro League': 38,
  'Challenger Pro League': 391,
  'Super Lig Turquie': 52,
  'TFF 1. Lig': 98,
  'Super League Suisse': 215,
  'Challenge League Suisse': 216,
  'Superligaen': 271,
  'NordicBet Liga': 272,
  'Allsvenskan': 40,
  'Superettan': 146,
  'Eliteserien': 200,
  'OBOS-ligaen': 331,
  'Bundesliga Autriche': 45,
  'Erste Liga Autriche': 46,
  'SuperLiga Serbie': 449,
  'HNL Croatie': 155,
  'Super League Grèce': 185,
  'Premier League Ukrainienne': 218,
  'Erovnuli Liga Géorgie': 623,
  'Premier League Russe': 203,
  'Ekstraklasa': 202,
  'Premier League Roumanie': 170,
  'Fortuna Liga Tchéquie': 168,
  'NB I Hongrie': 167,
  'Fortuna Liga Slovaquie': 399,
  'Premier League Écosse': 36,
  'League of Ireland': 196,
  'Première Ligue Bulgarie': 188,
  'Premijer Liga Bosnie': 178,
  'Superliga Albanie': 419,
  'Prva Liga Slovénie': 433,
  'Superliga Kosovo': 603,
  'Prva Crnogorska Liga': 445,
  'BGL Ligue Luxembourg': 514,
  'NIFL Premiership': 327,
  'Cymru Premier': 308,
  'Veikkausliiga': 321,

  // ── Amérique du Sud ──
  'Liga Profesional Argentina': 155,
  'Liga BetPlay Colombie': 11536,
  'Primera División Uruguay': 278,
  'Primera División Chili': 11653,
  'Liga 1 Pérou': 11684,
  'Liga Pro Équateur': 11601,
  'Primera División Paraguay': 11567,
  'Primera División Venezuela': 11679,

  // ── Amérique du Nord / Centrale ──
  'MLS': 242,
  'USL Championship': 13363,
  'Canadian Premier League': 16368,
  'Liga MX': 11621,
  'Liga de Expansión MX': 16741,

  // ── Afrique ──
  'Botola Pro Maroc': 937,
  'Ligue 1 Algérie': 1572,
  'Ligue Professionnelle 1 Tunisie': 1571,
  'Egyptian Premier League': 1218,
  'NPFL Nigeria': 1327,
  'Ghana Premier League': 1507,
  'Premier League Afrique du Sud': 843,

  // ── Asie ──
  'Saudi Pro League': 955,
  'Stars League Qatar': 1490,
  'UAE Pro League': 1228,
  'Persian Gulf Pro League': 1214,
  'J1 League': 196,
  'K League 1': 180,
  'Chinese Super League': 665,
  'Indian Super League': 11267,
  'Thai League 1': 636,

  // ── Océanie ──
  'A-League Men': 210,

  // ── Compétitions internationales ──
  'Ligue des Champions': 7,
  'Europa League': 679,
  'Conference League': 17015,
  'Copa Libertadores': 384,
  'Copa Sudamericana': 480,
  'Ligue des Champions CAF': 1054,
  'Coupe du Monde': 16,
  'Euro': 1,
  'Copa America': 133,
  'CAN': 270,
};

/** Retourne l'URL du logo SofaScore d'un championnat (via image-proxy) */
export function getLeagueLogoUrl(leagueName: string): string | null {
  const id = SOFASCORE_TOURNAMENT_IDS[leagueName];
  if (!id) return null;
  return `/api/image-proxy?url=${encodeURIComponent(`https://api.sofascore.com/api/v1/unique-tournament/${id}/image`)}`;
}

/** Retourne l'URL du logo SofaScore d'une équipe (via image-proxy) */
export function getTeamLogoUrl(teamId: number): string {
  return `/api/image-proxy?url=${encodeURIComponent(`https://api.sofascore.com/api/v1/team/${teamId}/image`)}`;
}
