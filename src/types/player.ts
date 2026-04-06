export { translateCountry } from '@/data/country-names';
export type Opinion = 'À suivre' | 'À revoir' | 'Défavorable';
export type PlayerTask = 'À voir' | 'À revoir' | 'À suivre';
export type Foot = 'Gaucher' | 'Droitier' | 'Ambidextre';
export type Position = 'GK' | 'DC' | 'LD' | 'LG' | 'MDef' | 'MC' | 'MO' | 'AD' | 'AG' | 'ATT';
export type Zone = 'Gardien' | 'Défenseur' | 'Milieu' | 'Attaquant';

export interface Player {
  id: string;
  name: string;
  photo_url?: string;
  generation: number;
  nationality: string;
  foot: Foot;
  club: string;
  league: string;
  zone: string;
  position: Position;
  position_secondaire?: string;
  role?: string;
  current_level: number;
  potential: number;
  general_opinion: Opinion;
  contract_end?: string;
  notes?: string;
  ts_report_published: boolean;
  date_of_birth?: string;
  market_value?: string;
  transfermarkt_id?: string;
  external_data?: Record<string, any>;
  external_data_fetched_at?: string;
  shared_with_org?: boolean;
  task?: PlayerTask | null;
  has_news?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Report {
  id: string;
  player_id: string;
  report_date: string;
  title?: string;
  opinion: Opinion;
  drive_link?: string;
  file_url?: string;
  created_at: string;
}

export interface Video {
  id: string;
  player_id: string;
  video_url: string;
  created_at: string;
}

export const POSITIONS: Record<Position, string> = {
  GK: 'Gardien',
  DC: 'Défenseur central',
  LD: 'Latéral droit',
  LG: 'Latéral gauche',
  MDef: 'Milieu défensif',
  MC: 'Milieu central',
  MO: 'Milieu offensif',
  AD: 'Ailier droit',
  AG: 'Ailier gauche',
  ATT: 'Attaquant',
};

export const POSITION_SHORT: Record<Position, string> = {
  GK: 'GK', DC: 'DC', LD: 'LD', LG: 'LG',
  MDef: 'MDef', MC: 'MC', MO: 'MO',
  AD: 'AD', AG: 'AG', ATT: 'ATT',
};

// Zones = catégories de postes (pas géographiques)
export const ZONES: Zone[] = ['Gardien', 'Défenseur', 'Milieu', 'Attaquant'];

export const FLAGS: Record<string, string> = {
  'France': '🇫🇷', 'Brésil': '🇧🇷', 'Italie': '🇮🇹', 'Maroc': '🇲🇦',
  'Danemark': '🇩🇰', 'Japon': '🇯🇵', "Côte d'Ivoire": '🇨🇮', 'Espagne': '🇪🇸',
  'Nigeria': '🇳🇬', 'Autriche': '🇦🇹', 'Serbie': '🇷🇸', 'Suède': '🇸🇪',
  'Sénégal': '🇸🇳', 'Portugal': '🇵🇹', 'Allemagne': '🇩🇪', 'RD Congo': '🇨🇩',
  'Mexique': '🇲🇽', 'Argentine': '🇦🇷', 'Belgique': '🇧🇪', 'Pays-Bas': '🇳🇱',
  'Angleterre': '🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'Colombie': '🇨🇴', 'Ghana': '🇬🇭', 'Cameroun': '🇨🇲',
  'Tunisie': '🇹🇳', 'Algérie': '🇩🇿', 'Croatie': '🇭🇷', 'Suisse': '🇨🇭',
  'États-Unis': '🇺🇸', 'Canada': '🇨🇦', 'Uruguay': '🇺🇾', 'Chili': '🇨🇱',
  'Pérou': '🇵🇪', 'Paraguay': '🇵🇾', 'Équateur': '🇪🇨', 'Bolivie': '🇧🇴',
  'Venezuela': '🇻🇪', 'Costa Rica': '🇨🇷', 'Honduras': '🇭🇳', 'Panama': '🇵🇦',
  'Jamaïque': '🇯🇲', 'Trinité-et-Tobago': '🇹🇹', 'Haïti': '🇭🇹',
  'Corée du Sud': '🇰🇷', 'Australie': '🇦🇺', 'Nouvelle-Zélande': '🇳🇿',
  'Chine': '🇨🇳', 'Inde': '🇮🇳', 'Iran': '🇮🇷', 'Irak': '🇮🇶',
  'Arabie Saoudite': '🇸🇦', 'Qatar': '🇶🇦', 'Émirats Arabes Unis': '🇦🇪',
  'Turquie': '🇹🇷', 'Grèce': '🇬🇷', 'Pologne': '🇵🇱', 'Roumanie': '🇷🇴',
  'République Tchèque': '🇨🇿', 'Slovaquie': '🇸🇰', 'Hongrie': '🇭🇺',
  'Ukraine': '🇺🇦', 'Russie': '🇷🇺', 'Géorgie': '🇬🇪', 'Arménie': '🇦🇲',
  'Azerbaïdjan': '🇦🇿', 'Islande': '🇮🇸', 'Norvège': '🇳🇴', 'Finlande': '🇫🇮',
  'Irlande': '🇮🇪', 'Écosse': '🏴󠁧󠁢󠁳󠁣󠁴󠁿', 'Pays de Galles': '🏴󠁧󠁢󠁷󠁬󠁳󠁿',
  'Irlande du Nord': '🇬🇧', 'Bosnie-Herzégovine': '🇧🇦', 'Monténégro': '🇲🇪',
  'Macédoine du Nord': '🇲🇰', 'Albanie': '🇦🇱', 'Kosovo': '🇽🇰',
  'Slovénie': '🇸🇮', 'Bulgarie': '🇧🇬', 'Moldavie': '🇲🇩', 'Biélorussie': '🇧🇾',
  'Lituanie': '🇱🇹', 'Lettonie': '🇱🇻', 'Estonie': '🇪🇪',
  'Luxembourg': '🇱🇺', 'Chypre': '🇨🇾', 'Malte': '🇲🇹',
  'Mali': '🇲🇱', 'Burkina Faso': '🇧🇫', 'Guinée': '🇬🇳', 'Guinée-Bissau': '🇬🇼',
  'Bénin': '🇧🇯', 'Togo': '🇹🇬', 'Niger': '🇳🇪', 'Tchad': '🇹🇩',
  'Gabon': '🇬🇦', 'Congo': '🇨🇬', 'Centrafrique': '🇨🇫',
  'Rwanda': '🇷🇼', 'Burundi': '🇧🇮', 'Tanzanie': '🇹🇿',
  'Kenya': '🇰🇪', 'Ouganda': '🇺🇬', 'Éthiopie': '🇪🇹',
  'Zambie': '🇿🇲', 'Zimbabwe': '🇿🇼', 'Mozambique': '🇲🇿',
  'Afrique du Sud': '🇿🇦', 'Namibie': '🇳🇦', 'Angola': '🇦🇴',
  'Égypte': '🇪🇬', 'Libye': '🇱🇾', 'Soudan': '🇸🇩',
  'Mauritanie': '🇲🇷', 'Cap-Vert': '🇨🇻', 'Comores': '🇰🇲',
  'Madagascar': '🇲🇬', 'Sierra Leone': '🇸🇱', 'Liberia': '🇱🇷',
  'Gambie': '🇬🇲', 'Somalie': '🇸🇴', 'Érythrée': '🇪🇷',
  'Israël': '🇮🇱', 'Liban': '🇱🇧', 'Jordanie': '🇯🇴',
  'Koweït': '🇰🇼', 'Bahreïn': '🇧🇭', 'Oman': '🇴🇲', 'Yémen': '🇾🇪',
  'Syrie': '🇸🇾', 'Palestine': '🇵🇸',
  'Ouzbékistan': '🇺🇿', 'Kazakhstan': '🇰🇿', 'Kirghizistan': '🇰🇬',
  'Tadjikistan': '🇹🇯', 'Turkménistan': '🇹🇲', 'Afghanistan': '🇦🇫',
  'Pakistan': '🇵🇰', 'Bangladesh': '🇧🇩', 'Sri Lanka': '🇱🇰',
  'Népal': '🇳🇵', 'Maldives': '🇲🇻', 'Mongolie': '🇲🇳',
  'Corée du Nord': '🇰🇵', 'Taïwan': '🇹🇼', 'Hong Kong': '🇭🇰',
  'Myanmar': '🇲🇲', 'Cambodge': '🇰🇭', 'Laos': '🇱🇦',
  'Timor-Leste': '🇹🇱', 'Brunei': '🇧🇳',
  'Thaïlande': '🇹🇭', 'Vietnam': '🇻🇳', 'Indonésie': '🇮🇩',
  'Philippines': '🇵🇭', 'Malaisie': '🇲🇾', 'Singapour': '🇸🇬',
  'Andorre': '🇦🇩', 'Liechtenstein': '🇱🇮', 'Monaco': '🇲🇨',
  'Saint-Marin': '🇸🇲', 'Vatican': '🇻🇦',
  'Cuba': '🇨🇺', 'République Dominicaine': '🇩🇴', 'El Salvador': '🇸🇻',
  'Guatemala': '🇬🇹', 'Nicaragua': '🇳🇮', 'Belize': '🇧🇿',
  'Guyana': '🇬🇾', 'Suriname': '🇸🇷',
  'Bahamas': '🇧🇸', 'Barbade': '🇧🇧', 'Antigua-et-Barbuda': '🇦🇬',
  'Dominique': '🇩🇲', 'Grenade': '🇬🇩',
  'Saint-Kitts-et-Nevis': '🇰🇳', 'Sainte-Lucie': '🇱🇨',
  'Saint-Vincent-et-les-Grenadines': '🇻🇨',
  'Soudan du Sud': '🇸🇸', 'Djibouti': '🇩🇯',
  'Guinée Équatoriale': '🇬🇶', 'São Tomé-et-Príncipe': '🇸🇹',
  'Botswana': '🇧🇼', 'Lesotho': '🇱🇸', 'Eswatini': '🇸🇿',
  'Malawi': '🇲🇼', 'Maurice': '🇲🇺', 'Seychelles': '🇸🇨',
  'Fidji': '🇫🇯', 'Papouasie-Nouvelle-Guinée': '🇵🇬',
  'Îles Salomon': '🇸🇧', 'Vanuatu': '🇻🇺', 'Samoa': '🇼🇸',
  'Tonga': '🇹🇴', 'Kiribati': '🇰🇮', 'Micronésie': '🇫🇲',
  'Palaos': '🇵🇼', 'Îles Marshall': '🇲🇭', 'Nauru': '🇳🇷', 'Tuvalu': '🇹🇻',
};

// Mapping of English/alternate nationality names to French keys
const NATIONALITY_ALIASES: Record<string, string> = {
  // English → French
  'france': 'France', 'brazil': 'Brésil', 'italy': 'Italie', 'morocco': 'Maroc',
  'denmark': 'Danemark', 'japan': 'Japon', 'ivory coast': "Côte d'Ivoire",
  'cote divoire': "Côte d'Ivoire", 'cote d ivoire': "Côte d'Ivoire",
  'spain': 'Espagne', 'nigeria': 'Nigeria', 'austria': 'Autriche',
  'serbia': 'Serbie', 'sweden': 'Suède', 'senegal': 'Sénégal',
  'portugal': 'Portugal', 'germany': 'Allemagne', 'dr congo': 'RD Congo',
  'congo dr': 'RD Congo', 'democratic republic of the congo': 'RD Congo',
  'mexico': 'Mexique', 'argentina': 'Argentine', 'belgium': 'Belgique',
  'netherlands': 'Pays-Bas', 'holland': 'Pays-Bas', 'england': 'Angleterre',
  'colombia': 'Colombie', 'ghana': 'Ghana', 'cameroon': 'Cameroun',
  'tunisia': 'Tunisie', 'algeria': 'Algérie', 'croatia': 'Croatie',
  'switzerland': 'Suisse', 'united states': 'États-Unis', 'usa': 'États-Unis',
  'us': 'États-Unis', 'canada': 'Canada', 'uruguay': 'Uruguay',
  'chile': 'Chili', 'peru': 'Pérou', 'paraguay': 'Paraguay',
  'ecuador': 'Équateur', 'bolivia': 'Bolivie', 'venezuela': 'Venezuela',
  'costa rica': 'Costa Rica', 'honduras': 'Honduras', 'panama': 'Panama',
  'jamaica': 'Jamaïque', 'haiti': 'Haïti',
  'south korea': 'Corée du Sud', 'korea republic': 'Corée du Sud', 'korea': 'Corée du Sud',
  'australia': 'Australie', 'new zealand': 'Nouvelle-Zélande',
  'china': 'Chine', 'china pr': 'Chine', 'india': 'Inde', 'iran': 'Iran', 'iraq': 'Irak',
  'saudi arabia': 'Arabie Saoudite', 'qatar': 'Qatar',
  'united arab emirates': 'Émirats Arabes Unis', 'uae': 'Émirats Arabes Unis',
  'turkey': 'Turquie', 'turkiye': 'Turquie', 'greece': 'Grèce',
  'poland': 'Pologne', 'romania': 'Roumanie',
  'czech republic': 'République Tchèque', 'czechia': 'République Tchèque',
  'slovakia': 'Slovaquie', 'hungary': 'Hongrie',
  'ukraine': 'Ukraine', 'russia': 'Russie', 'georgia': 'Géorgie',
  'armenia': 'Arménie', 'azerbaijan': 'Azerbaïdjan',
  'iceland': 'Islande', 'norway': 'Norvège', 'finland': 'Finlande',
  'ireland': 'Irlande', 'scotland': 'Écosse', 'wales': 'Pays de Galles',
  'northern ireland': 'Irlande du Nord',
  'bosnia and herzegovina': 'Bosnie-Herzégovine', 'bosnia': 'Bosnie-Herzégovine',
  'montenegro': 'Monténégro', 'north macedonia': 'Macédoine du Nord',
  'albania': 'Albanie', 'kosovo': 'Kosovo', 'slovenia': 'Slovénie',
  'bulgaria': 'Bulgarie', 'moldova': 'Moldavie', 'belarus': 'Biélorussie',
  'lithuania': 'Lituanie', 'latvia': 'Lettonie', 'estonia': 'Estonie',
  'luxembourg': 'Luxembourg', 'cyprus': 'Chypre', 'malta': 'Malte',
  'mali': 'Mali', 'burkina faso': 'Burkina Faso', 'guinea': 'Guinée',
  'guinea-bissau': 'Guinée-Bissau', 'benin': 'Bénin', 'togo': 'Togo',
  'niger': 'Niger', 'chad': 'Tchad', 'gabon': 'Gabon', 'congo': 'Congo',
  'central african republic': 'Centrafrique',
  'rwanda': 'Rwanda', 'burundi': 'Burundi', 'tanzania': 'Tanzanie',
  'kenya': 'Kenya', 'uganda': 'Ouganda', 'ethiopia': 'Éthiopie',
  'zambia': 'Zambie', 'zimbabwe': 'Zimbabwe', 'mozambique': 'Mozambique',
  'south africa': 'Afrique du Sud', 'namibia': 'Namibie', 'angola': 'Angola',
  'egypt': 'Égypte', 'libya': 'Libye', 'sudan': 'Soudan',
  'mauritania': 'Mauritanie', 'cape verde': 'Cap-Vert', 'cabo verde': 'Cap-Vert',
  'comoros': 'Comores', 'madagascar': 'Madagascar',
  'sierra leone': 'Sierra Leone', 'liberia': 'Liberia',
  'gambia': 'Gambie', 'the gambia': 'Gambie', 'somalia': 'Somalie', 'eritrea': 'Érythrée',
  'israel': 'Israël', 'lebanon': 'Liban', 'jordan': 'Jordanie',
  'kuwait': 'Koweït', 'bahrain': 'Bahreïn', 'oman': 'Oman', 'yemen': 'Yémen',
  'uzbekistan': 'Ouzbékistan', 'kazakhstan': 'Kazakhstan',
  'thailand': 'Thaïlande', 'vietnam': 'Vietnam', 'indonesia': 'Indonésie',
  'philippines': 'Philippines', 'malaysia': 'Malaisie', 'singapore': 'Singapour',
  // Common typos / short forms
  'trinite et tobago': 'Trinité-et-Tobago', 'trinidad and tobago': 'Trinité-et-Tobago',
  'rep tcheque': 'République Tchèque', 'rep. tcheque': 'République Tchèque',
  'emirats arabes unis': 'Émirats Arabes Unis',
  'coree du sud': 'Corée du Sud', 'afrique du sud': 'Afrique du Sud',
  'rd congo': 'RD Congo', 'rdc': 'RD Congo',
  'pays bas': 'Pays-Bas', 'pays de galles': 'Pays de Galles',
  'bosnie herzegovine': 'Bosnie-Herzégovine',
  'macedoine du nord': 'Macédoine du Nord',
  'nouvelle zelande': 'Nouvelle-Zélande',
  'guinee': 'Guinée', 'guinee bissau': 'Guinée-Bissau',
  'cote d\'ivoire': "Côte d'Ivoire",
};

function normalizeNationality(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Special subdivision flag codes (England, Scotland, Wales)
const SUBDIVISION_CODES: Record<string, string> = {
  'Angleterre': 'gb-eng',
  'Écosse': 'gb-sct',
  'Pays de Galles': 'gb-wls',
};

// Extracts ISO 3166-1 alpha-2 lowercase code from a nationality name for use with flag-icons CSS
// e.g. "France" → "fr", "Espagne" → "es"
export function getFlagCode(nationality: string): string | null {
  if (SUBDIVISION_CODES[nationality]) return SUBDIVISION_CODES[nationality];
  const emoji = FLAGS[nationality] ?? (() => {
    const normalized = normalizeNationality(nationality);
    const alias = NATIONALITY_ALIASES[normalized];
    return alias ? FLAGS[alias] : undefined;
  })();
  if (!emoji) return null;
  const codePoints = [...emoji].map(c => c.codePointAt(0) ?? 0);
  const letters = codePoints.filter(cp => cp >= 0x1F1E6 && cp <= 0x1F1FF);
  if (letters.length < 2) return null;
  return letters.map(cp => String.fromCharCode(cp - 0x1F1E6 + 97)).join('');
}

export function getFlag(nationality: string): string {
  // Direct match
  if (FLAGS[nationality]) return FLAGS[nationality];
  
  // Normalize and try aliases
  const normalized = normalizeNationality(nationality);
  const aliasMatch = NATIONALITY_ALIASES[normalized];
  if (aliasMatch && FLAGS[aliasMatch]) return FLAGS[aliasMatch];
  
  // Try normalized match against French keys
  for (const [key, flag] of Object.entries(FLAGS)) {
    if (normalizeNationality(key) === normalized) return flag;
  }
  
  // Partial match (for typos like "Sénégal" vs "Senegal")
  for (const [key, flag] of Object.entries(FLAGS)) {
    const nKey = normalizeNationality(key);
    if (nKey.includes(normalized) || normalized.includes(nKey)) return flag;
  }
  
  return '🏳️';
}

export const NATIONALITIES = Object.keys(FLAGS).sort((a, b) => a.localeCompare(b, 'fr'));

export const POTENTIAL_SCALE: Record<number, string> = {
  10: "Potential to be a star player for elite team in T5 league",
  9.5: "Potential to be a key player for a UCL contender",
  9: "Potential to be a starter for a UCL quarter-finalist",
  8.5: "Potential to be a starter for sub-top team in a T5 league",
  8: "Potential to be a starter for top-half team in a T5 league",
  7.5: "Potential to be a starter for top team in T6-8 league",
  7: "Potential to be a starter for bottom half team in T5 league",
  6.5: "Potential to be a starter for sub-top team in T6-8 league",
  6: "Potential to be a starter for (sub-)top team in T9-15 league",
  5.5: "Potential to be a starter for mid-table team in T6-8 league",
  5: "Potential to be a starter for bottom half team in T6-8 league",
  4: "Potential to be a starter for (sub-)top team in T16-20 league",
  3: "Potential to be a starter for bottom half team in T9-15 league",
  2: "Potential to be a starter for mid-table team in T16-20 league",
  1: "No potential to play senior football",
};

// Championnats & clubs — source unique : src/data/league-clubs.ts
import { LEAGUES_FROM_MAPPING, CLUBS_FROM_LEAGUES, CLUB_TO_LEAGUE as _CLUB_TO_LEAGUE } from '@/data/league-clubs';
export { CLUB_TO_LEAGUE } from '@/data/league-clubs';

export const LEAGUES = LEAGUES_FROM_MAPPING;
export const CLUBS = CLUBS_FROM_LEAGUES;

import LEAGUE_ALIASES_RAW from '@/data/league-aliases.json';
export const LEAGUE_ALIASES: Record<string, string> = LEAGUE_ALIASES_RAW;

/** Normalise un nom de ligue : alias → canonique, puis CLUB_TO_LEAGUE si c'est un club, puis trim */
export function resolveLeagueName(club: string, league: string): string {
  // 1. Le club est dans le mapping statique → ligue canonique
  const fromClub = _CLUB_TO_LEAGUE[club];
  if (fromClub) return fromClub;
  // 2. Trim
  const trimmed = (league ?? '').trim();
  // 3. Alias exact
  const aliased = LEAGUE_ALIASES[trimmed] ?? trimmed;
  // 4. Numérique ou nom de club → vide
  if (/^\d+$/.test(aliased) || _CLUB_TO_LEAGUE[aliased]) return '';
  return aliased;
}

export const PLAYER_TASKS: PlayerTask[] = ['À voir', 'À revoir', 'À suivre'];

export function getTaskEmoji(task: PlayerTask): string {
  switch (task) {
    case 'À voir': return '👁️';
    case 'À revoir': return '🔄';
    case 'À suivre': return '📌';
  }
}

export function getTaskBgClass(task: PlayerTask): string {
  switch (task) {
    case 'À voir': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300';
    case 'À revoir': return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300';
    case 'À suivre': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300';
  }
}

export function getOpinionColor(opinion: Opinion): string {
  switch (opinion) {
    case 'À suivre': return 'success';
    case 'À revoir': return 'warning';
    case 'Défavorable': return 'destructive';
  }
}

export function getOpinionBgClass(opinion: Opinion): string {
  switch (opinion) {
    case 'À suivre': return 'bg-success text-success-foreground';
    case 'À revoir': return 'bg-warning text-warning-foreground';
    case 'Défavorable': return 'bg-destructive text-destructive-foreground';
  }
}

export function getOpinionEmoji(opinion: Opinion): string {
  switch (opinion) {
    case 'À suivre': return '✅';
    case 'À revoir': return '🔶';
    case 'Défavorable': return '❌';
  }
}

export function getPotentialDescription(value: number): string {
  const keys = Object.keys(POTENTIAL_SCALE).map(Number).sort((a, b) => b - a);
  for (const key of keys) {
    if (value >= key) return POTENTIAL_SCALE[key];
  }
  return POTENTIAL_SCALE[1];
}

export function getPlayerAge(generation: number, dateOfBirth?: string): number {
  if (dateOfBirth) {
    const dob = new Date(dateOfBirth);
    const today = new Date();
    let age = today.getFullYear() - dob.getFullYear();
    const monthDiff = today.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--;
    }
    return age;
  }
  return new Date().getFullYear() - generation;
}

// Generate consistent avatar colors from name
const AVATAR_COLORS = [
  'from-purple-300 to-violet-500',
  'from-amber-400 to-orange-500',
  'from-blue-400 to-indigo-500',
  'from-rose-400 to-pink-500',
  'from-violet-400 to-purple-500',
  'from-cyan-400 to-sky-500',
  'from-fuchsia-300 to-purple-600',
  'from-fuchsia-400 to-pink-500',
];

export function getAvatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
