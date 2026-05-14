export interface Country {
  code: string;      // ISO 3166-1 alpha-2 lowercase (= flag icon code except exceptions)
  flagCode: string;  // fi flag code (usually = code, exceptions: uk → gb)
  fr: string;        // name in French
  en: string;        // name in English
  es: string;        // name in Spanish
  lang: 'fr' | 'en' | 'es' | 'de' | 'it' | 'pt' | 'nl' | 'pl' | 'ru' | 'tr' | 'sv' | 'uk' | 'ro' | 'el' | 'cs' | 'hr' | 'ja' | 'ko' | 'zh' | 'id'; // app UI language to activate
}

// Priority countries shown at the top (fr, es, en)
export const PRIORITY_CODES = ['fr', 'es', 'gb'];

export const COUNTRIES: Country[] = [
  // ── Francophone ───────────────────────────────────────────────────────────
  { code: 'fr', flagCode: 'fr', fr: 'France',            en: 'France',            es: 'Francia',            lang: 'fr' },
  { code: 'be', flagCode: 'be', fr: 'Belgique',          en: 'Belgium',           es: 'Bélgica',            lang: 'fr' },
  { code: 'ch', flagCode: 'ch', fr: 'Suisse',            en: 'Switzerland',       es: 'Suiza',              lang: 'fr' },
  { code: 'lu', flagCode: 'lu', fr: 'Luxembourg',        en: 'Luxembourg',        es: 'Luxemburgo',         lang: 'fr' },
  { code: 'mc', flagCode: 'mc', fr: 'Monaco',            en: 'Monaco',            es: 'Mónaco',             lang: 'fr' },
  { code: 'ca', flagCode: 'ca', fr: 'Canada',            en: 'Canada',            es: 'Canadá',             lang: 'fr' },
  { code: 'ma', flagCode: 'ma', fr: 'Maroc',             en: 'Morocco',           es: 'Marruecos',          lang: 'fr' },
  { code: 'dz', flagCode: 'dz', fr: 'Algérie',           en: 'Algeria',           es: 'Argelia',            lang: 'fr' },
  { code: 'tn', flagCode: 'tn', fr: 'Tunisie',           en: 'Tunisia',           es: 'Túnez',              lang: 'fr' },
  { code: 'ci', flagCode: 'ci', fr: "Côte d'Ivoire",     en: "Côte d'Ivoire",     es: 'Costa de Marfil',    lang: 'fr' },
  { code: 'sn', flagCode: 'sn', fr: 'Sénégal',           en: 'Senegal',           es: 'Senegal',            lang: 'fr' },
  { code: 'cm', flagCode: 'cm', fr: 'Cameroun',          en: 'Cameroon',          es: 'Camerún',            lang: 'fr' },
  { code: 'ml', flagCode: 'ml', fr: 'Mali',              en: 'Mali',              es: 'Malí',               lang: 'fr' },
  { code: 'gn', flagCode: 'gn', fr: 'Guinée',            en: 'Guinea',            es: 'Guinea',             lang: 'fr' },
  { code: 'cg', flagCode: 'cg', fr: 'Congo',             en: 'Congo',             es: 'Congo',              lang: 'fr' },
  { code: 'cd', flagCode: 'cd', fr: 'RD Congo',          en: 'DR Congo',          es: 'RD Congo',           lang: 'fr' },
  { code: 'ga', flagCode: 'ga', fr: 'Gabon',             en: 'Gabon',             es: 'Gabón',              lang: 'fr' },
  { code: 'mg', flagCode: 'mg', fr: 'Madagascar',        en: 'Madagascar',        es: 'Madagascar',         lang: 'fr' },
  { code: 'ht', flagCode: 'ht', fr: 'Haïti',             en: 'Haiti',             es: 'Haití',              lang: 'fr' },
  { code: 'bf', flagCode: 'bf', fr: 'Burkina Faso',      en: 'Burkina Faso',      es: 'Burkina Faso',       lang: 'fr' },
  { code: 'gq', flagCode: 'gq', fr: 'Guinée équatoriale',en: 'Equatorial Guinea', es: 'Guinea Ecuatorial',  lang: 'fr' },
  { code: 'bj', flagCode: 'bj', fr: 'Bénin',             en: 'Benin',             es: 'Benín',              lang: 'fr' },
  { code: 'ne', flagCode: 'ne', fr: 'Niger',             en: 'Niger',             es: 'Níger',              lang: 'fr' },
  { code: 'td', flagCode: 'td', fr: 'Tchad',             en: 'Chad',              es: 'Chad',               lang: 'fr' },
  { code: 'tg', flagCode: 'tg', fr: 'Togo',              en: 'Togo',              es: 'Togo',               lang: 'fr' },
  { code: 'mr', flagCode: 'mr', fr: 'Mauritanie',        en: 'Mauritania',        es: 'Mauritania',         lang: 'fr' },
  { code: 'mu', flagCode: 'mu', fr: 'Maurice',           en: 'Mauritius',         es: 'Mauricio',           lang: 'fr' },
  { code: 're', flagCode: 're', fr: 'La Réunion',        en: 'Réunion',           es: 'Reunión',            lang: 'fr' },

  // ── Hispanophone ──────────────────────────────────────────────────────────
  { code: 'es', flagCode: 'es', fr: 'Espagne',           en: 'Spain',             es: 'España',             lang: 'es' },
  { code: 'mx', flagCode: 'mx', fr: 'Mexique',           en: 'Mexico',            es: 'México',             lang: 'es' },
  { code: 'ar', flagCode: 'ar', fr: 'Argentine',         en: 'Argentina',         es: 'Argentina',          lang: 'es' },
  { code: 'co', flagCode: 'co', fr: 'Colombie',          en: 'Colombia',          es: 'Colombia',           lang: 'es' },
  { code: 'cl', flagCode: 'cl', fr: 'Chili',             en: 'Chile',             es: 'Chile',              lang: 'es' },
  { code: 'pe', flagCode: 'pe', fr: 'Pérou',             en: 'Peru',              es: 'Perú',               lang: 'es' },
  { code: 've', flagCode: 've', fr: 'Venezuela',         en: 'Venezuela',         es: 'Venezuela',          lang: 'es' },
  { code: 'ec', flagCode: 'ec', fr: 'Équateur',          en: 'Ecuador',           es: 'Ecuador',            lang: 'es' },
  { code: 'bo', flagCode: 'bo', fr: 'Bolivie',           en: 'Bolivia',           es: 'Bolivia',            lang: 'es' },
  { code: 'py', flagCode: 'py', fr: 'Paraguay',          en: 'Paraguay',          es: 'Paraguay',           lang: 'es' },
  { code: 'uy', flagCode: 'uy', fr: 'Uruguay',           en: 'Uruguay',           es: 'Uruguay',            lang: 'es' },
  { code: 'cu', flagCode: 'cu', fr: 'Cuba',              en: 'Cuba',              es: 'Cuba',               lang: 'es' },
  { code: 'do', flagCode: 'do', fr: 'Rép. dominicaine',  en: 'Dominican Republic',es: 'Rep. Dominicana',    lang: 'es' },
  { code: 'pa', flagCode: 'pa', fr: 'Panama',            en: 'Panama',            es: 'Panamá',             lang: 'es' },
  { code: 'cr', flagCode: 'cr', fr: 'Costa Rica',        en: 'Costa Rica',        es: 'Costa Rica',         lang: 'es' },
  { code: 'hn', flagCode: 'hn', fr: 'Honduras',          en: 'Honduras',          es: 'Honduras',           lang: 'es' },
  { code: 'sv', flagCode: 'sv', fr: 'El Salvador',       en: 'El Salvador',       es: 'El Salvador',        lang: 'es' },
  { code: 'gt', flagCode: 'gt', fr: 'Guatemala',         en: 'Guatemala',         es: 'Guatemala',          lang: 'es' },
  { code: 'ni', flagCode: 'ni', fr: 'Nicaragua',         en: 'Nicaragua',         es: 'Nicaragua',          lang: 'es' },

  // ── Anglophone ────────────────────────────────────────────────────────────
  { code: 'gb', flagCode: 'gb', fr: 'Royaume-Uni',       en: 'United Kingdom',    es: 'Reino Unido',        lang: 'en' },
  { code: 'us', flagCode: 'us', fr: 'États-Unis',        en: 'United States',     es: 'Estados Unidos',     lang: 'en' },
  { code: 'ie', flagCode: 'ie', fr: 'Irlande',           en: 'Ireland',           es: 'Irlanda',            lang: 'en' },
  { code: 'au', flagCode: 'au', fr: 'Australie',         en: 'Australia',         es: 'Australia',          lang: 'en' },
  { code: 'nz', flagCode: 'nz', fr: 'Nouvelle-Zélande',  en: 'New Zealand',       es: 'Nueva Zelanda',      lang: 'en' },
  { code: 'za', flagCode: 'za', fr: 'Afrique du Sud',    en: 'South Africa',      es: 'Sudáfrica',          lang: 'en' },
  { code: 'ng', flagCode: 'ng', fr: 'Nigéria',           en: 'Nigeria',           es: 'Nigeria',            lang: 'en' },
  { code: 'gh', flagCode: 'gh', fr: 'Ghana',             en: 'Ghana',             es: 'Ghana',              lang: 'en' },
  { code: 'ke', flagCode: 'ke', fr: 'Kenya',             en: 'Kenya',             es: 'Kenia',              lang: 'en' },
  { code: 'tz', flagCode: 'tz', fr: 'Tanzanie',          en: 'Tanzania',          es: 'Tanzania',           lang: 'en' },
  { code: 'ug', flagCode: 'ug', fr: 'Ouganda',           en: 'Uganda',            es: 'Uganda',             lang: 'en' },
  { code: 'et', flagCode: 'et', fr: 'Éthiopie',          en: 'Ethiopia',          es: 'Etiopía',            lang: 'en' },
  { code: 'jm', flagCode: 'jm', fr: 'Jamaïque',          en: 'Jamaica',           es: 'Jamaica',            lang: 'en' },
  { code: 'in', flagCode: 'in', fr: 'Inde',              en: 'India',             es: 'India',              lang: 'en' },
  { code: 'pk', flagCode: 'pk', fr: 'Pakistan',          en: 'Pakistan',          es: 'Pakistán',           lang: 'en' },
  { code: 'sg', flagCode: 'sg', fr: 'Singapour',         en: 'Singapore',         es: 'Singapur',           lang: 'en' },
  { code: 'ph', flagCode: 'ph', fr: 'Philippines',       en: 'Philippines',       es: 'Filipinas',          lang: 'en' },
  { code: 'my', flagCode: 'my', fr: 'Malaisie',          en: 'Malaysia',          es: 'Malasia',            lang: 'en' },

  // ── Europe (EN fallback) ──────────────────────────────────────────────────
  { code: 'de', flagCode: 'de', fr: 'Allemagne',         en: 'Germany',           es: 'Alemania',           lang: 'de' },
  { code: 'at', flagCode: 'at', fr: 'Autriche',          en: 'Austria',           es: 'Austria',            lang: 'de' },
  { code: 'it', flagCode: 'it', fr: 'Italie',            en: 'Italy',             es: 'Italia',             lang: 'it' },
  { code: 'pt', flagCode: 'pt', fr: 'Portugal',          en: 'Portugal',          es: 'Portugal',           lang: 'pt' },
  { code: 'nl', flagCode: 'nl', fr: 'Pays-Bas',          en: 'Netherlands',       es: 'Países Bajos',       lang: 'nl' },
  { code: 'pl', flagCode: 'pl', fr: 'Pologne',           en: 'Poland',            es: 'Polonia',            lang: 'pl' },
  { code: 'se', flagCode: 'se', fr: 'Suède',             en: 'Sweden',            es: 'Suecia',             lang: 'sv' },
  { code: 'no', flagCode: 'no', fr: 'Norvège',           en: 'Norway',            es: 'Noruega',            lang: 'sv' },
  { code: 'dk', flagCode: 'dk', fr: 'Danemark',          en: 'Denmark',           es: 'Dinamarca',          lang: 'sv' },
  { code: 'fi', flagCode: 'fi', fr: 'Finlande',          en: 'Finland',           es: 'Finlandia',          lang: 'en' },
  { code: 'cz', flagCode: 'cz', fr: 'Tchéquie',          en: 'Czechia',           es: 'Chequia',            lang: 'cs' },
  { code: 'sk', flagCode: 'sk', fr: 'Slovaquie',         en: 'Slovakia',          es: 'Eslovaquia',         lang: 'cs' },
  { code: 'hu', flagCode: 'hu', fr: 'Hongrie',           en: 'Hungary',           es: 'Hungría',            lang: 'en' },
  { code: 'ro', flagCode: 'ro', fr: 'Roumanie',          en: 'Romania',           es: 'Rumania',            lang: 'ro' },
  { code: 'hr', flagCode: 'hr', fr: 'Croatie',           en: 'Croatia',           es: 'Croacia',            lang: 'hr' },
  { code: 'rs', flagCode: 'rs', fr: 'Serbie',            en: 'Serbia',            es: 'Serbia',             lang: 'hr' },
  { code: 'ua', flagCode: 'ua', fr: 'Ukraine',           en: 'Ukraine',           es: 'Ucrania',            lang: 'uk' },
  { code: 'ru', flagCode: 'ru', fr: 'Russie',            en: 'Russia',            es: 'Rusia',              lang: 'ru' },
  { code: 'tr', flagCode: 'tr', fr: 'Turquie',           en: 'Turkey',            es: 'Turquía',            lang: 'tr' },
  { code: 'gr', flagCode: 'gr', fr: 'Grèce',             en: 'Greece',            es: 'Grecia',             lang: 'el' },
  { code: 'bg', flagCode: 'bg', fr: 'Bulgarie',          en: 'Bulgaria',          es: 'Bulgaria',           lang: 'en' },
  { code: 'si', flagCode: 'si', fr: 'Slovénie',          en: 'Slovenia',          es: 'Eslovenia',          lang: 'hr' },
  { code: 'ba', flagCode: 'ba', fr: 'Bosnie-Herzégovine',en: 'Bosnia-Herzegovina',es: 'Bosnia-Herzegovina', lang: 'hr' },
  { code: 'al', flagCode: 'al', fr: 'Albanie',           en: 'Albania',           es: 'Albania',            lang: 'en' },
  { code: 'mk', flagCode: 'mk', fr: 'Macédoine du Nord', en: 'North Macedonia',   es: 'Macedonia del Norte',lang: 'en' },
  { code: 'me', flagCode: 'me', fr: 'Monténégro',        en: 'Montenegro',        es: 'Montenegro',         lang: 'hr' },
  { code: 'by', flagCode: 'by', fr: 'Biélorussie',       en: 'Belarus',           es: 'Bielorrusia',        lang: 'uk' },
  { code: 'lt', flagCode: 'lt', fr: 'Lituanie',          en: 'Lithuania',         es: 'Lituania',           lang: 'en' },
  { code: 'lv', flagCode: 'lv', fr: 'Lettonie',          en: 'Latvia',            es: 'Letonia',            lang: 'en' },
  { code: 'ee', flagCode: 'ee', fr: 'Estonie',           en: 'Estonia',           es: 'Estonia',            lang: 'en' },
  { code: 'is', flagCode: 'is', fr: 'Islande',           en: 'Iceland',           es: 'Islandia',           lang: 'en' },
  { code: 'cy', flagCode: 'cy', fr: 'Chypre',            en: 'Cyprus',            es: 'Chipre',             lang: 'el' },
  { code: 'mt', flagCode: 'mt', fr: 'Malte',             en: 'Malta',             es: 'Malta',              lang: 'en' },
  { code: 'ge', flagCode: 'ge', fr: 'Géorgie',           en: 'Georgia',           es: 'Georgia',            lang: 'en' },
  { code: 'am', flagCode: 'am', fr: 'Arménie',           en: 'Armenia',           es: 'Armenia',            lang: 'en' },
  { code: 'az', flagCode: 'az', fr: 'Azerbaïdjan',       en: 'Azerbaijan',        es: 'Azerbaiyán',         lang: 'en' },

  // ── Moyen-Orient & Asie ───────────────────────────────────────────────────
  { code: 'sa', flagCode: 'sa', fr: 'Arabie Saoudite',   en: 'Saudi Arabia',      es: 'Arabia Saudita',     lang: 'en' },
  { code: 'ae', flagCode: 'ae', fr: 'Émirats arabes unis',en: 'United Arab Emirates',es: 'Emiratos Árabes', lang: 'en' },
  { code: 'qa', flagCode: 'qa', fr: 'Qatar',             en: 'Qatar',             es: 'Catar',              lang: 'en' },
  { code: 'ir', flagCode: 'ir', fr: 'Iran',              en: 'Iran',              es: 'Irán',               lang: 'en' },
  { code: 'iq', flagCode: 'iq', fr: 'Irak',              en: 'Iraq',              es: 'Irak',               lang: 'en' },
  { code: 'jo', flagCode: 'jo', fr: 'Jordanie',          en: 'Jordan',            es: 'Jordania',           lang: 'en' },
  { code: 'il', flagCode: 'il', fr: 'Israël',            en: 'Israel',            es: 'Israel',             lang: 'en' },
  { code: 'lb', flagCode: 'lb', fr: 'Liban',             en: 'Lebanon',           es: 'Líbano',             lang: 'en' },
  { code: 'kw', flagCode: 'kw', fr: 'Koweït',            en: 'Kuwait',            es: 'Kuwait',             lang: 'en' },
  { code: 'eg', flagCode: 'eg', fr: 'Égypte',            en: 'Egypt',             es: 'Egipto',             lang: 'en' },
  { code: 'ly', flagCode: 'ly', fr: 'Libye',             en: 'Libya',             es: 'Libia',              lang: 'en' },
  { code: 'jp', flagCode: 'jp', fr: 'Japon',             en: 'Japan',             es: 'Japón',              lang: 'ja' },
  { code: 'kr', flagCode: 'kr', fr: 'Corée du Sud',      en: 'South Korea',       es: 'Corea del Sur',      lang: 'ko' },
  { code: 'cn', flagCode: 'cn', fr: 'Chine',             en: 'China',             es: 'China',              lang: 'zh' },
  { code: 'th', flagCode: 'th', fr: 'Thaïlande',         en: 'Thailand',          es: 'Tailandia',          lang: 'en' },
  { code: 'id', flagCode: 'id', fr: 'Indonésie',         en: 'Indonesia',         es: 'Indonesia',          lang: 'id' },
  { code: 'vn', flagCode: 'vn', fr: 'Viêt Nam',          en: 'Vietnam',           es: 'Vietnam',            lang: 'en' },

  // ── Afrique (autres) ──────────────────────────────────────────────────────
  { code: 'ao', flagCode: 'ao', fr: 'Angola',            en: 'Angola',            es: 'Angola',             lang: 'pt' },
  { code: 'mz', flagCode: 'mz', fr: 'Mozambique',        en: 'Mozambique',        es: 'Mozambique',         lang: 'pt' },
  { code: 'zm', flagCode: 'zm', fr: 'Zambie',            en: 'Zambia',            es: 'Zambia',             lang: 'en' },
  { code: 'zw', flagCode: 'zw', fr: 'Zimbabwe',          en: 'Zimbabwe',          es: 'Zimbabue',           lang: 'en' },
  { code: 'sd', flagCode: 'sd', fr: 'Soudan',            en: 'Sudan',             es: 'Sudán',              lang: 'en' },
  { code: 'rw', flagCode: 'rw', fr: 'Rwanda',            en: 'Rwanda',            es: 'Ruanda',             lang: 'en' },
  { code: 'bw', flagCode: 'bw', fr: 'Botswana',          en: 'Botswana',          es: 'Botsuana',           lang: 'en' },

  // ── Amérique centrale & Caraïbes (autres) ─────────────────────────────────
  { code: 'br', flagCode: 'br', fr: 'Brésil',            en: 'Brazil',            es: 'Brasil',             lang: 'pt' },
  { code: 'tt', flagCode: 'tt', fr: 'Trinité-et-Tobago', en: 'Trinidad & Tobago', es: 'Trinidad y Tobago',  lang: 'en' },
];

/** Returns the display name for a country in the given language */
export function getCountryName(c: Country, lang: string): string {
  if (lang === 'fr') return c.fr;
  if (lang === 'es') return c.es;
  return c.en;
}

/** Sorted list: priority countries first, then alphabetical by French name */
export function getSortedCountries(uiLang: string): Country[] {
  const priority = COUNTRIES.filter(c => PRIORITY_CODES.includes(c.code));
  const rest = COUNTRIES
    .filter(c => !PRIORITY_CODES.includes(c.code))
    .sort((a, b) => getCountryName(a, uiLang).localeCompare(getCountryName(b, uiLang), uiLang));
  return [...priority, ...rest];
}
