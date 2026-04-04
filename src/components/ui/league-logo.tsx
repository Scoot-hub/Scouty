import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';

// league name (lowercase) → ISO 3166-1 alpha-2 code (or subdivision: gb-eng, gb-sct, gb-wls)
const LEAGUE_FLAG_CODE: Record<string, string> = {
  // Europe — Top 5
  'ligue 1': 'fr', 'ligue 2': 'fr',
  'premier league': 'gb-eng', 'efl championship': 'gb-eng',
  'la liga': 'es', 'la liga 2': 'es',
  'serie a': 'it', 'serie b': 'it',
  'bundesliga': 'de', '2. bundesliga': 'de',
  // Europe — autres
  'liga portugal': 'pt', 'liga portugal 2': 'pt',
  'eredivisie': 'nl', 'eerste divisie': 'nl',
  'jupiler pro league': 'be', 'challenger pro league': 'be',
  'super lig turquie': 'tr', 'tff 1. lig': 'tr',
  'super league suisse': 'ch', 'challenge league suisse': 'ch',
  'superligaen': 'dk', 'nordicbet liga': 'dk',
  'allsvenskan': 'se', 'superettan': 'se',
  'eliteserien': 'no', 'obos-ligaen': 'no',
  'bundesliga autriche': 'at', 'erste liga autriche': 'at',
  'superliga serbie': 'rs', 'prva liga serbie': 'rs',
  'hnl croatie': 'hr',
  'super league grèce': 'gr',
  'premier league ukrainienne': 'ua',
  'erovnuli liga géorgie': 'ge',
  'premier league russe': 'ru',
  'ekstraklasa': 'pl',
  'premier league roumanie': 'ro',
  'fortuna liga tchéquie': 'cz',
  'nb i hongrie': 'hu',
  'fortuna liga slovaquie': 'sk',
  'première ligue bulgarie': 'bg',
  'superliga albanie': 'al',
  'prva liga slovénie': 'si',
  'premijer liga bosnie': 'ba',
  'superliga kosovo': 'xk',
  'prva liga macédoine du nord': 'mk',
  'prva crnogorska liga': 'me',
  'premier league écosse': 'gb-sct',
  'league of ireland': 'ie',
  'premier league islande': 'is', 'úrvalsdeild': 'is',
  'bgl ligue luxembourg': 'lu',
  'nifl premiership': 'gb-nir',
  'cymru premier': 'gb-wls',
  'first division chypre': 'cy',
  'bardzraguyn khumb arménie': 'am',
  'premyer liqa azerbaïdjan': 'az',
  'vysshaya liga biélorussie': 'by',
  'super liga moldavie': 'md',
  'meistriliiga estonie': 'ee',
  'virsliga lettonie': 'lv',
  'a lyga lituanie': 'lt',
  'israeli premier league': 'il',
  'veikkausliiga': 'fi',
  // Amériques
  'mls': 'us', 'usl championship': 'us',
  'canadian premier league': 'ca',
  'liga mx': 'mx', 'liga de expansión mx': 'mx',
  'liga nacional guatemala': 'gt',
  'liga nacional honduras': 'hn',
  'primera división el salvador': 'sv',
  'primera división costa rica': 'cr',
  'liga panameña': 'pa',
  'brasileirão série a': 'br', 'brasileirão série b': 'br',
  'liga profesional argentina': 'ar',
  'liga betplay colombie': 'co',
  'primera división uruguay': 'uy',
  'primera división chili': 'cl',
  'liga 1 pérou': 'pe',
  'liga pro équateur': 'ec',
  'primera división bolivie': 'bo',
  'primera división paraguay': 'py',
  'primera división venezuela': 've',
  'jamaica premier league': 'jm',
  'tt pro league': 'tt',
  'liga dominicana': 'do',
  // Afrique
  'botola pro maroc': 'ma', 'botola 2 maroc': 'ma',
  'ligue 1 algérie': 'dz',
  'ligue professionnelle 1 tunisie': 'tn',
  'egyptian premier league': 'eg',
  'npfl nigeria': 'ng',
  'ghana premier league': 'gh',
  'ligue 1 cameroun': 'cm',
  'ligue 1 sénégal': 'sn',
  "ligue 1 côte d'ivoire": 'ci',
  'linafoot rd congo': 'cd',
  'premier league afrique du sud': 'za',
  'ligue 1 mali': 'ml',
  'ligue 1 guinée': 'gn',
  'ligue 1 burkina faso': 'bf',
  'premier league kenya': 'ke',
  'premier league tanzanie': 'tz',
  'premier league éthiopie': 'et',
  'premier league ouganda': 'ug',
  'premier league zimbabwe': 'zw',
  'super league zambie': 'zm',
  'premier league rwanda': 'rw',
  'girabola angola': 'ao',
  'moçambola': 'mz',
  'premier league soudan': 'sd',
  'ligue 1 gabon': 'ga',
  'ligue 1 congo': 'cg',
  'ligue 1 madagascar': 'mg',
  'libyan premier league': 'ly',
  'namibia premier league': 'na',
  'botswana premier league': 'bw',
  // Asie / Moyen-Orient
  'saudi pro league': 'sa',
  'stars league qatar': 'qa',
  'uae pro league': 'ae',
  'persian gulf pro league': 'ir',
  'jordan league': 'jo',
  'lebanese premier league': 'lb',
  'iraqi premier league': 'iq',
  'kuwait premier league': 'kw',
  'bahraini premier league': 'bh',
  'super league ouzbékistan': 'uz',
  'premier league kazakhstan': 'kz',
  'j1 league': 'jp', 'j2 league': 'jp',
  'k league 1': 'kr', 'k league 2': 'kr',
  'chinese super league': 'cn',
  'indian super league': 'in', 'i-league': 'in',
  'thai league 1': 'th',
  'v.league 1': 'vn',
  'liga 1 indonésie': 'id',
  'malaysia super league': 'my',
  'hong kong premier league': 'hk',
  'cambodia league': 'kh',
  'myanmar national league': 'mm',
  'bangladesh premier league': 'bd',
  'nepal super league': 'np',
  'sri lanka football premier league': 'lk',
  // Océanie
  'a-league men': 'au', 'a-league women': 'au',
  'new zealand football championship': 'nz',
  'papua new guinea nsl': 'pg',
  'fiji premier league': 'fj',
};

interface LeagueLogoProps {
  league: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
  /** Emoji fallback when no logo is found (default: country flag derived from league name) */
  fallback?: string;
}

const sizeMap = {
  xs: 'w-4 h-4',
  sm: 'w-5 h-5',
  md: 'w-6 h-6',
  lg: 'w-8 h-8',
};

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem('scouthub_session');
    if (!raw) return null;
    return JSON.parse(raw)?.access_token ?? null;
  } catch { return null; }
}

// In-memory cache: league name (lowercase) → logo URL | null
const logoCache = new Map<string, string | null>();

// Load all league logos from server once
const dbLoaded: Promise<void> = fetch(`${API_BASE}/league-logos`)
  .then(r => r.ok ? r.json() : [])
  .then((rows: Array<{ league_name: string; logo_url: string }>) => {
    for (const { league_name, logo_url } of rows) {
      logoCache.set(league_name.toLowerCase(), logo_url);
    }
  })
  .catch(() => {});

// Sequential request queue — avoids API rate limiting
const pending = new Map<string, Promise<string | null>>();
const queue: Array<() => Promise<void>> = [];
let queueRunning = false;

function delay(ms: number) {
  return new Promise<void>(resolve => setTimeout(resolve, ms));
}

async function runQueue() {
  if (queueRunning) return;
  queueRunning = true;
  while (queue.length > 0) {
    const task = queue.shift()!;
    await task();
    await delay(1500); // rate limit
  }
  queueRunning = false;
}

function queueResolve(league: string): Promise<string | null> {
  const key = league.toLowerCase();
  if (pending.has(key)) return pending.get(key)!;

  const promise = new Promise<string | null>(resolve => {
    queue.push(async () => {
      try {
        const token = getAuthToken();
        const resp = await fetch(`${API_BASE}/functions/resolve-league-logo`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ league }),
        });
        const data = resp.ok ? await resp.json() : null;
        const logo = data?.logo ?? null;
        logoCache.set(key, logo);
        pending.delete(key);
        resolve(logo);
      } catch {
        logoCache.set(key, null);
        pending.delete(key);
        resolve(null);
      }
    });
  });

  pending.set(key, promise);
  runQueue();
  return promise;
}

export function getLeagueLogo(league: string): string | null {
  return logoCache.get(league.toLowerCase()) ?? null;
}

const flagSizeMap = {
  xs: { width: '1em', height: '0.75em', display: 'inline-block' as const },
  sm: { width: '1.1em', height: '0.85em', display: 'inline-block' as const },
  md: { width: '1.25em', height: '0.95em', display: 'inline-block' as const },
  lg: { width: '1.5em', height: '1.15em', display: 'inline-block' as const },
};

export function LeagueLogo({ league, size = 'md', className, fallback }: LeagueLogoProps) {
  const key = league.toLowerCase();
  const flagCode = LEAGUE_FLAG_CODE[key] ?? null;
  const [logoUrl, setLogoUrl] = useState<string | null>(logoCache.get(key) ?? null);
  const [loaded, setLoaded] = useState(logoCache.has(key));

  useEffect(() => {
    let cancelled = false;

    dbLoaded.then(() => {
      if (cancelled) return;
      const cached = logoCache.get(key);
      if (cached !== undefined) {
        setLogoUrl(cached);
        setLoaded(true);
        return;
      }
      // If we have a flag code for this league, skip the API call entirely
      if (flagCode) {
        setLoaded(true);
        return;
      }
      // Unknown league — try API-Football as last resort
      queueResolve(league).then(url => {
        if (cancelled) return;
        setLogoUrl(url);
        setLoaded(true);
      });
    });

    return () => { cancelled = true; };
  }, [league, key, flagCode]);

  if (loaded && logoUrl) {
    return (
      <div className={cn('shrink-0 overflow-hidden', sizeMap[size], className)} title={league}>
        <img src={logoUrl} alt={league} loading="lazy" className="w-full h-full object-contain" />
      </div>
    );
  }

  // Flag via flag-icons CSS (same system as FlagIcon)
  if (flagCode) {
    return (
      <span
        className={cn(`fi fi-${flagCode} rounded-sm shrink-0`, className)}
        style={flagSizeMap[size]}
        title={league}
      />
    );
  }

  // Fallback prop or generic globe
  return <span className={cn('leading-none shrink-0', className)} title={league}>{fallback ?? '🌍'}</span>;
}
