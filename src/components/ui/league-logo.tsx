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

// ── Local static logos (public/leagues/) — loaded instantly, no API call ──
const LOCAL_LOGOS: Record<string, string> = {
  // France
  'ligue 1': '/leagues/ligue-1.png',
  'ligue 2': '/leagues/ligue-2.png',
  // Angleterre
  'premier league': '/leagues/premier-league.png',
  'efl championship': '/leagues/championship.png',
  'championship': '/leagues/championship.png',
  'league one': '/leagues/league-one.png',
  // Espagne
  'la liga': '/leagues/la-liga.png',
  'laliga': '/leagues/la-liga.png',
  'la liga 2': '/leagues/la-liga-2.png',
  'segunda division': '/leagues/la-liga-2.png',
  // Italie
  'serie a': '/leagues/serie-a.png',
  'serie b': '/leagues/serie-b.png',
  // Allemagne
  'bundesliga': '/leagues/bundesliga.png',
  '2. bundesliga': '/leagues/bundesliga-2.png',
  '2.bundesliga': '/leagues/bundesliga-2.png',
  // Portugal
  'liga portugal': '/leagues/liga-portugal.png',
  'primeira liga': '/leagues/liga-portugal.png',
  'liga portugal 2': '/leagues/liga-portugal-2.png',
  // Pays-Bas
  'eredivisie': '/leagues/eredivisie.png',
  'eerste divisie': '/leagues/eerste-divisie.png',
  // Belgique
  'jupiler pro league': '/leagues/jupiler-pro-league.png',
  'pro league': '/leagues/jupiler-pro-league.png',
  'challenger pro league': '/leagues/challenger-pro-league.png',
  // Turquie
  'super lig': '/leagues/super-lig.png',
  'super lig turquie': '/leagues/super-lig.png',
  // Suisse
  'super league suisse': '/leagues/super-league-suisse.png',
  'super league': '/leagues/super-league-suisse.png',
  'challenge league suisse': '/leagues/challenge-league-suisse.png',
  // Scandinavie
  'superligaen': '/leagues/superligaen.png',
  'allsvenskan': '/leagues/allsvenskan.png',
  'superettan': '/leagues/superettan.png',
  'eliteserien': '/leagues/eliteserien.png',
  // Est Europe
  'ekstraklasa': '/leagues/ekstraklasa.png',
  'fortuna liga': '/leagues/fortuna-liga.png',
  'fortuna liga tchéquie': '/leagues/fortuna-liga.png',
  'nb i': '/leagues/nb-i.png',
  'nb i hongrie': '/leagues/nb-i.png',
  'premier league russe': '/leagues/premier-league-russe.png',
  'premier league ukrainienne': '/leagues/premier-league-ukrainienne.png',
  // Écosse
  'premier league écosse': '/leagues/premier-league-ecosse.png',
  'scottish premiership': '/leagues/premier-league-ecosse.png',
  // Balkans
  'superliga serbie': '/leagues/superliga-serbie.png',
  'hnl': '/leagues/hnl.png',
  'hnl croatie': '/leagues/hnl.png',
  'super league grèce': '/leagues/super-league-grece.png',
  // Coupes européennes
  'uefa champions league': '/leagues/champions-league.png',
  'champions league': '/leagues/champions-league.png',
  'ligue des champions': '/leagues/champions-league.png',
  'uefa europa league': '/leagues/europa-league.png',
  'europa league': '/leagues/europa-league.png',
  'ligue europa': '/leagues/europa-league.png',
  'uefa conference league': '/leagues/conference-league.png',
  'conference league': '/leagues/conference-league.png',
  'ligue europa conférence': '/leagues/conference-league.png',
  // Amériques
  'mls': '/leagues/mls.png',
  'liga mx': '/leagues/liga-mx.png',
  'liga mx mexicaine': '/leagues/liga-mx.png',
  'brasileirão série a': '/leagues/brasileirao-serie-a.png',
  'brasileirao serie a': '/leagues/brasileirao-serie-a.png',
  'serie a brésilienne': '/leagues/brasileirao-serie-a.png',
  'brasileirão série b': '/leagues/brasileirao-serie-b.png',
  'liga profesional argentina': '/leagues/liga-profesional-argentina.png',
  'liga betplay': '/leagues/liga-betplay.png',
  'liga betplay colombie': '/leagues/liga-betplay.png',
  'primera división uruguay': '/leagues/primera-division-uruguay.png',
  'primera division uruguay': '/leagues/primera-division-uruguay.png',
  'primera división chili': '/leagues/primera-division-chili.png',
  'canadian premier league': '/leagues/canadian-premier-league.png',
  'copa libertadores': '/leagues/copa-libertadores.png',
  'copa sudamericana': '/leagues/copa-sudamericana.png',
  // Asie / Moyen-Orient
  'j-league': '/leagues/j-league.png',
  'j league': '/leagues/j-league.png',
  'k league': '/leagues/k-league.png',
  'k league 1': '/leagues/k-league.png',
  'chinese super league': '/leagues/chinese-super-league.png',
  'saudi pro league': '/leagues/saudi-pro-league.png',
  'ligue professionnelle saoudienne': '/leagues/saudi-pro-league.png',
  'uae pro league': '/leagues/uae-pro-league.png',
  // Afrique
  'botola pro maroc': '/leagues/botola-pro.png',
  'botola pro': '/leagues/botola-pro.png',
  // Compétitions internationales
  'coupe du monde': '/leagues/world-cup.png',
  'world cup': '/leagues/world-cup.png',
  'euro': '/leagues/euro.png',
  'uefa euro': '/leagues/euro.png',
  'nations league': '/leagues/nations-league.png',
  'ligue des nations': '/leagues/nations-league.png',
  'copa america': '/leagues/copa-america.png',
  'can': '/leagues/african-cup.png',
  'coupe dafrique': '/leagues/african-cup.png',
  'africa cup of nations': '/leagues/african-cup.png',
};

/** Returns a local static logo path if available, null otherwise */
export function getLocalLeagueLogo(league: string): string | null {
  return LOCAL_LOGOS[league.toLowerCase().trim()] ?? null;
}

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
        const resp = await fetch(`${API_BASE}/functions/resolve-league-logo`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
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
  if (!league) return null;
  const key = league.toLowerCase().trim();
  const flagCode = LEAGUE_FLAG_CODE[key] ?? null;

  // 1. Check local static files first (instant, no request)
  const localLogo = LOCAL_LOGOS[key] ?? null;

  const [logoUrl, setLogoUrl] = useState<string | null>(
    localLogo ?? logoCache.get(key) ?? null
  );
  const [loaded, setLoaded] = useState(!!localLogo || logoCache.has(key));

  useEffect(() => {
    // Local file available — no need for DB or API
    if (localLogo) {
      setLogoUrl(localLogo);
      setLoaded(true);
      return;
    }

    let cancelled = false;
    dbLoaded.then(() => {
      if (cancelled) return;
      const cached = logoCache.get(key);
      if (cached !== undefined) {
        setLogoUrl(cached);
        setLoaded(true);
        return;
      }
      // Flag available → skip API call
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
  }, [league, key, localLogo, flagCode]);

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
