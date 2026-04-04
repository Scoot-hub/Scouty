import { cn } from '@/lib/utils';
import { useEffect, useState } from 'react';
import { getClubBadgeUrl, resolveClubName, getBadgeOverride } from '@/lib/thesportsdb';

interface ClubBadgeProps {
  club: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeMap = {
  xs: 'w-4 h-4',
  sm: 'w-7 h-7',
  md: 'w-9 h-9',
  lg: 'w-12 h-12',
};

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function getAuthToken(): string | null {
  try {
    const raw = localStorage.getItem('scouthub_session');
    if (!raw) return null;
    return JSON.parse(raw)?.access_token ?? null;
  } catch { return null; }
}

// In-memory cache (populated from DB on first load)
const logoCache = new Map<string, string | null>();
// Lowercase index for fuzzy matching
const logoCacheLower = new Map<string, string>();

// Load all stored logos from DB into cache at startup (one request for everything)
// Index by all name variants (original, fr, en, es) so any language matches
const dbLoaded: Promise<void> = fetch(`${API_BASE}/club-logos`)
  .then(r => r.ok ? r.json() : [])
  .then((rows: Array<{ club_name: string; logo_url: string; name_fr?: string; name_en?: string; name_es?: string }>) => {
    for (const { club_name, logo_url, name_fr, name_en, name_es } of rows) {
      logoCache.set(club_name, logo_url);
      logoCacheLower.set(club_name.toLowerCase(), logo_url);
      if (name_fr) { logoCache.set(name_fr, logo_url); logoCacheLower.set(name_fr.toLowerCase(), logo_url); }
      if (name_en) { logoCache.set(name_en, logo_url); logoCacheLower.set(name_en.toLowerCase(), logo_url); }
      if (name_es) { logoCache.set(name_es, logo_url); logoCacheLower.set(name_es.toLowerCase(), logo_url); }
    }
  })
  .catch(() => {});

function findLogoInCache(name: string): string | null | undefined {
  // Exact match
  if (logoCache.has(name)) return logoCache.get(name)!;
  // Case-insensitive match
  const lower = name.toLowerCase();
  if (logoCacheLower.has(lower)) return logoCacheLower.get(lower)!;
  return undefined; // not found
}

// Strip youth/reserve suffixes to resolve to the parent club name
// e.g. "Paris Saint Germain U19" → "Paris Saint Germain"
//      "FC Barcelone Athlètic" → "FC Barcelone"
function getParentClubName(name: string): string | null {
  const match = name.match(/^(.+?)\s+(U\d{2}|B|II|III|2|3|Athl[eé]tic|Atletic|Primavera|Juvenil|Youth|Reserves?|Amateur|Cantera|Jong|Jeunesse)$/i);
  if (match) return match[1].trim();
  return null;
}

async function saveLogoToDb(club: string, url: string) {
  const token = getAuthToken();
  if (!token) return;
  try {
    await fetch(`${API_BASE}/club-logos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ club_name: club, logo_url: url }),
    });
  } catch { /* ignore */ }
}

// Sequential request queue — avoids rate limiting by processing one at a time
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
    await delay(2500);
  }
  queueRunning = false;
}

function queueFetch(club: string): Promise<string | null> {
  if (pending.has(club)) return pending.get(club)!;

  const promise = new Promise<string | null>(resolve => {
    queue.push(async () => {
      const url = await getClubBadgeUrl(club);
      logoCache.set(club, url);
      if (url) saveLogoToDb(club, url); // persist to DB for all future sessions
      pending.delete(club);
      resolve(url);
    });
  });

  pending.set(club, promise);
  runQueue();
  return promise;
}

export function ClubBadge({ club, size = 'md', className }: ClubBadgeProps) {
  const resolvedClub = resolveClubName(club);
  // For youth/reserve teams (U19, B, Athlètic…), use the parent club's badge
  const parentRaw = getParentClubName(resolvedClub) ?? getParentClubName(club);
  const badgeLookupName = parentRaw ? resolveClubName(parentRaw) : resolvedClub;

  const [logoUrl, setLogoUrl] = useState<string | null>(logoCache.get(badgeLookupName) ?? null);
  const [loaded, setLoaded] = useState(logoCache.has(badgeLookupName));

  useEffect(() => {
    let cancelled = false;

    dbLoaded.then(() => {
      if (cancelled) return;
      // Hardcoded overrides always win over DB cache (corrects stale/wrong URLs)
      const overrideUrl = getBadgeOverride(badgeLookupName) ?? getBadgeOverride(parentRaw ?? club) ?? getBadgeOverride(club);
      if (overrideUrl) {
        setLogoUrl(overrideUrl);
        setLoaded(true);
        return;
      }
      // Try exact match, then case-insensitive match (catches Livescore names)
      const cached = findLogoInCache(badgeLookupName) ?? findLogoInCache(parentRaw ?? club);
      if (cached !== undefined) {
        setLogoUrl(cached);
        setLoaded(true);
        return;
      }
      // Not in DB cache — fetch from TheSportsDB and save to DB
      queueFetch(badgeLookupName).then(url => {
        if (cancelled) return;
        setLogoUrl(url);
        setLoaded(true);
      });
    });

    return () => { cancelled = true; };
  }, [badgeLookupName]);

  // Show real logo if available
  if (loaded && logoUrl) {
    return (
      <div className={cn('shrink-0 overflow-hidden', sizeMap[size], className)} title={club}>
        <img src={logoUrl} alt={club} loading="lazy" className="w-full h-full object-contain" />
      </div>
    );
  }

  // Still loading: neutral placeholder
  if (!loaded) {
    return (
      <div className={cn('shrink-0 rounded-lg bg-muted animate-pulse', sizeMap[size], className)} title={club} />
    );
  }

  // No logo found: initials badge
  const abbreviation = resolvedClub
    .replace(/^(FC|SC|RB|TP|RSC|KAA|KRC|KV|OH|SSD|AS|SS|ACF|SSC|AJ|OGC|RC|US|AZ|PEC|RKC|NAC|ADO|NEC|PFC|FK|NK|HNK|CD|UD|SD|CF|LD|GD) /, '')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 3)
    .toUpperCase();

  return (
    <div
      className={cn(
        'shrink-0 rounded-lg bg-muted flex items-center justify-center font-bold text-muted-foreground text-[10px]',
        sizeMap[size],
        className
      )}
      title={club}
    >
      {abbreviation}
    </div>
  );
}
