import { useMemo, useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  useEventsForDay,
  type LivescoreCompetition,
  type LivescoreEvent,
} from '@/hooks/use-api-football';
import { usePlayers } from '@/hooks/use-players';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Loader2, CalendarDays, ChevronLeft, ChevronRight, MapPin, Users, Crosshair, Navigation,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGeolocation, distanceKm } from '@/hooks/use-geolocation';

// ---------------------------------------------------------------------------
// Fix Leaflet default icon paths broken by bundlers
// ---------------------------------------------------------------------------
// @ts-ignore
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ---------------------------------------------------------------------------
// Country centroids (ISO 3166-1 alpha-2 → [lat, lng])
// ---------------------------------------------------------------------------
const COUNTRY_COORDS: Record<string, [number, number]> = {
  AF:[33,65],AL:[41,20],DZ:[28,3],AD:[42.5,1.5],AO:[-12.5,18.5],AR:[-34,-64],AM:[40,45],AU:[-27,133],AT:[47.3,13.3],AZ:[40.5,47.5],
  BH:[26,50.5],BD:[24,90],BY:[53,28],BE:[50.8,4],BJ:[9.5,2.2],BO:[-17,-65],BA:[44,18],BW:[-22,24],BR:[-10,-55],BN:[4.5,114.7],
  BG:[43,25],BF:[13,-1.5],BI:[-3.5,30],KH:[13,105],CM:[6,12],CA:[60,-95],CV:[16,-24],CF:[7,21],TD:[15,19],CL:[-30,-71],
  CN:[35,105],CO:[4,-72],KM:[-12.2,44.2],CG:[-1,15],CD:[-4,22],CR:[10,-84],CI:[8,-5],HR:[45.2,15.5],CU:[22,-80],CY:[35,33],
  CZ:[49.8,15.5],DK:[56,10],DJ:[11.5,43],DO:[19,-70],EC:[-2,-77.5],EG:[27,30],SV:[13.8,-88.9],GQ:[2,10],ER:[15,39],EE:[59,26],
  ET:[8,38],FI:[64,26],FR:[46,2],GA:[-1,11.8],GM:[13.5,-16.5],GE:[42,43.5],DE:[51,9],GH:[8,-1.2],GR:[39,22],GT:[15.5,-90.3],
  GN:[11,-10],GW:[12,-15],GY:[5,-59],HT:[19,-72.4],HN:[15,-86.5],HU:[47,20],IS:[65,-18],IN:[20,77],ID:[-5,120],IR:[32,53],
  IQ:[33,44],IE:[53,-8],IL:[31.5,35],IT:[42.8,12.8],JM:[18.2,-77.5],JP:[36,138],JO:[31,36],KZ:[48,68],KE:[1,38],KP:[40,127],
  KR:[37,128],KW:[29.5,47.8],KG:[41,75],LA:[18,105],LV:[57,25],LB:[34,36],LS:[-29.5,28.5],LR:[6.5,-9.5],LY:[25,17],LI:[47.2,9.5],
  LT:[56,24],LU:[49.8,6.2],MK:[41.5,22],MG:[-20,47],MW:[-13.5,34],MY:[2.5,112.5],ML:[17,-4],MT:[35.9,14.4],MR:[20,-12],MU:[-20.3,57.6],
  MX:[23,-102],MD:[47,29],MC:[43.7,7.4],MN:[46,105],ME:[42.5,19.3],MA:[32,-5],MZ:[-18.2,35],MM:[22,98],NA:[-22,17],NP:[28,84],
  NL:[52.5,5.8],NZ:[-42,174],NI:[13,-85],NE:[16,8],NG:[10,8],NO:[62,10],OM:[21,57],PK:[30,70],PA:[9,-80],PY:[-23,-58],
  PE:[-10,-76],PH:[13,122],PL:[52,20],PT:[39.5,-8],QA:[25.5,51.2],RO:[46,25],RU:[60,100],RW:[-2,30],SA:[25,45],SN:[14,-14],
  RS:[44,21],SL:[8.5,-12],SG:[1.4,103.8],SK:[48.7,19.5],SI:[46.1,14.8],SO:[10,49],ZA:[-29,24],ES:[40,-4],LK:[7,81],SD:[15,30],
  SE:[62,15],CH:[47,8],SY:[35,38],TW:[23.5,121],TJ:[39,71],TZ:[-6,35],TH:[15,100],TG:[8,1.2],TT:[11,-61],TN:[34,9],
  TR:[39,35],TM:[40,60],UG:[1,32],UA:[49,32],AE:[24,54],GB:[54,-2],US:[38,-97],UY:[-33,-56],UZ:[41,64],VE:[8,-66],
  VN:[16,106],YE:[15,48],ZM:[-15,28],ZW:[-20,30],XK:[42.6,21],
  // Common football-specific country codes
  ENG:[52.5,-1.5],SCO:[56.5,-4],WAL:[52.3,-3.5],NIR:[54.6,-6.7],
};

// ---------------------------------------------------------------------------
// Custom map markers via L.divIcon
// ---------------------------------------------------------------------------
function createIcon(color: string, size: number = 28) {
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);"></div>`,
  });
}

const MATCH_ICON = createIcon('#22c55e', 28);
const MATCH_LIVE_ICON = createIcon('#ef4444', 32);
const CLUB_ICON = createIcon('#3b82f6', 22);

const USER_ICON = L.divIcon({
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
  html: `<div style="width:36px;height:36px;border-radius:50%;background:hsl(280,80%,55%);border:4px solid white;box-shadow:0 0 0 4px rgba(168,85,247,.3),0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
  </div>`,
});

const NEARBY_RADIUS_KM = 150; // radius for "nearby" matches

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function getDateString(offset: number) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function countryFlag(code: string) {
  if (!code || code.length < 2) return '';
  const c = code.toUpperCase().slice(0, 2);
  return String.fromCodePoint(...c.split('').map(ch => 0x1F1E6 + ch.charCodeAt(0) - 65));
}

function isLive(status: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  if (s === 'HT' || s === '1H' || s === '2H' || s === 'ET' || s === 'LIVE') return true;
  return /^\d/.test(status);
}

function isFinished(status: string) {
  if (!status) return false;
  const s = status.toUpperCase();
  return s === 'FT' || s === 'AET' || s === 'AP' || s === 'PEN';
}

// Deterministic hash for consistent jitter
function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

// ---------------------------------------------------------------------------
// Fly-to sub-component
// ---------------------------------------------------------------------------
function FlyTo({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.flyTo(center, zoom, { duration: 1 });
  }, [center, zoom, map]);
  return null;
}

// ---------------------------------------------------------------------------
// Invalidate map size when container resizes
// ---------------------------------------------------------------------------
function MapResizer() {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 200);
    return () => clearTimeout(timer);
  }, [map]);
  return null;
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function MapView() {
  const { t, i18n } = useTranslation();
  const [dayOffset, setDayOffset] = useState(0);
  const selectedDate = getDateString(dayOffset);
  const { data: eventsData, isLoading: eventsLoading } = useEventsForDay(selectedDate);
  const { data: players = [] } = usePlayers();
  const [search, setSearch] = useState('');
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState(500);
  const { position: userPos, loading: geoLoading, locate } = useGeolocation();
  const [showNearby, setShowNearby] = useState(false);

  // Calculate available height for the map area
  useEffect(() => {
    function update() {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setMapHeight(Math.max(300, window.innerHeight - rect.top - 24));
      }
    }
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // Aggregate clubs from user's players
  const playerClubs = useMemo(() => {
    const clubs = new Map<string, { club: string; country: string; count: number; players: string[] }>();
    for (const p of players) {
      if (!p.club) continue;
      const key = p.club.toLowerCase();
      const existing = clubs.get(key);
      if (existing) {
        existing.count++;
        if (existing.players.length < 5) existing.players.push(p.name);
      } else {
        clubs.set(key, { club: p.club, country: p.nationality || '', count: 1, players: [p.name] });
      }
    }
    return Array.from(clubs.values());
  }, [players]);

  // Build match markers from competitions
  const matchMarkers = useMemo(() => {
    if (!eventsData?.competitions) return [];
    const markers: { comp: LivescoreCompetition; coords: [number, number] }[] = [];
    const usedCoords = new Map<string, number>();

    for (const comp of eventsData.competitions) {
      const code = comp.country_code?.toUpperCase();
      const base = COUNTRY_COORDS[code];
      if (!base) continue;

      const key = `${base[0]},${base[1]}`;
      const offset = usedCoords.get(key) || 0;
      usedCoords.set(key, offset + 1);
      // Deterministic offset based on competition name
      const h = hashStr(comp.name);
      const jx = ((h % 100) / 100) * 1.5 - 0.75;
      const jy = (((h >> 8) % 100) / 100) * 1.5 - 0.75;
      const coords: [number, number] = [base[0] + jy + offset * 0.3, base[1] + jx + offset * 0.5];

      markers.push({ comp, coords });
    }
    return markers;
  }, [eventsData]);

  // Build club markers (deterministic jitter)
  const clubMarkers = useMemo(() => {
    return playerClubs
      .map(c => {
        const code = c.country?.toUpperCase().slice(0, 2);
        const coords = COUNTRY_COORDS[code];
        if (!coords) return null;
        const h = hashStr(c.club);
        const jx = ((h % 100) / 100) * 2 - 1;
        const jy = (((h >> 8) % 100) / 100) * 2 - 1;
        return { ...c, coords: [coords[0] + jy * 0.5, coords[1] + jx * 0.8] as [number, number] };
      })
      .filter(Boolean) as (typeof playerClubs[number] & { coords: [number, number] })[];
  }, [playerClubs]);

  // Nearby matches (sorted by distance to user)
  const nearbyMatches = useMemo(() => {
    if (!userPos || !matchMarkers.length) return [];
    return matchMarkers
      .map(m => ({
        ...m,
        distance: distanceKm(userPos.latitude, userPos.longitude, m.coords[0], m.coords[1]),
      }))
      .filter(m => m.distance <= NEARBY_RADIUS_KM)
      .sort((a, b) => a.distance - b.distance);
  }, [userPos, matchMarkers]);

  // Filter
  const filteredMatchMarkers = useMemo(() => {
    if (!search.trim()) return matchMarkers;
    const q = search.toLowerCase();
    return matchMarkers.filter(m =>
      m.comp.name.toLowerCase().includes(q) ||
      m.comp.country.toLowerCase().includes(q) ||
      m.comp.events.some(e => e.home_team.toLowerCase().includes(q) || e.away_team.toLowerCase().includes(q))
    );
  }, [matchMarkers, search]);

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString(
    i18n.language === 'es' ? 'es-ES' : i18n.language === 'en' ? 'en-GB' : 'fr-FR',
    { weekday: 'short', day: 'numeric', month: 'short' }
  );

  const totalMatches = eventsData?.count || 0;
  const liveCount = matchMarkers.reduce((sum, m) => sum + m.comp.events.filter(e => isLive(e.status)).length, 0);

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
            <MapPin className="w-6 h-6 text-primary" />
            {t('map.title')}
          </h1>
          <p className="text-sm text-muted-foreground">{t('map.subtitle')}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
            <button onClick={() => setDayOffset(d => d - 1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => setDayOffset(0)}
              className={cn('px-3 py-1 rounded-lg text-sm font-medium transition-all', dayOffset === 0 ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}
            >
              {dateLabel}
            </button>
            <button onClick={() => setDayOffset(d => d + 1)} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <Button
            variant={userPos ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl gap-1.5"
            onClick={() => {
              if (userPos) {
                setShowNearby(n => !n);
                setFlyTarget({ center: [userPos.latitude, userPos.longitude], zoom: 8 });
              } else {
                locate();
              }
            }}
            disabled={geoLoading}
          >
            {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
            {userPos ? t('map.nearby') : t('map.locate_me')}
          </Button>
          <div className="relative w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('map.search')} className="pl-9 h-9 rounded-xl" />
          </div>
        </div>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 text-sm">
        <Badge variant="secondary" className="gap-1.5">
          <CalendarDays className="w-3.5 h-3.5" />
          {totalMatches} {t('map.matches')}
        </Badge>
        {liveCount > 0 && (
          <Badge variant="destructive" className="gap-1.5 animate-pulse">
            <span className="w-2 h-2 rounded-full bg-white" />
            {liveCount} LIVE
          </Badge>
        )}
        <Badge variant="outline" className="gap-1.5">
          <Users className="w-3.5 h-3.5" />
          {playerClubs.length} {t('map.clubs')}
        </Badge>
        {nearbyMatches.length > 0 && (
          <Badge variant="outline" className="gap-1.5 border-purple-500/30 text-purple-600">
            <Navigation className="w-3.5 h-3.5" />
            {nearbyMatches.reduce((s, m) => s + m.comp.events.length, 0)} {t('map.nearby_count')}
          </Badge>
        )}
        {eventsLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Map + Sidebar */}
      <div ref={containerRef} className="flex gap-4" style={{ height: mapHeight }}>
        {/* Map — explicit pixel height */}
        <div className="flex-1 rounded-2xl overflow-hidden border border-border shadow-lg" style={{ height: mapHeight }}>
          <MapContainer
            center={[30, 10]}
            zoom={3}
            minZoom={2}
            maxZoom={12}
            scrollWheelZoom={true}
            style={{ width: '100%', height: '100%', background: '#0f172a' }}
          >
            <MapResizer />
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
              url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            />

            {flyTarget && <FlyTo center={flyTarget.center} zoom={flyTarget.zoom} />}

            {/* Match markers */}
            {filteredMatchMarkers.map((m, i) => {
              const hasLive = m.comp.events.some(e => isLive(e.status));
              return (
                <Marker key={`match-${i}`} position={m.coords} icon={hasLive ? MATCH_LIVE_ICON : MATCH_ICON}>
                  <Popup maxWidth={320}>
                    <div style={{ minWidth: 250 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                        <span style={{ fontSize: 16 }}>{countryFlag(m.comp.country_code)}</span>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 13 }}>{m.comp.name}</div>
                          <div style={{ fontSize: 11, color: '#888' }}>{m.comp.country}</div>
                        </div>
                      </div>
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {m.comp.events.slice(0, 8).map((ev, j) => (
                          <MatchRow key={j} event={ev} />
                        ))}
                        {m.comp.events.length > 8 && (
                          <div style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 4 }}>
                            +{m.comp.events.length - 8} {t('map.more')}
                          </div>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}

            {/* Club markers */}
            {clubMarkers.map((c, i) => (
              <Marker key={`club-${i}`} position={c.coords} icon={CLUB_ICON}>
                <Popup>
                  <div style={{ minWidth: 180 }}>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.club}</div>
                    <div style={{ fontSize: 11, color: '#888' }}>{c.count} {t('map.scouted_players')}</div>
                    <div style={{ marginTop: 6 }}>
                      {c.players.map((name, k) => (
                        <div key={k} style={{ fontSize: 11 }}>• {name}</div>
                      ))}
                      {c.count > 5 && <div style={{ fontSize: 11, color: '#888' }}>+{c.count - 5}...</div>}
                    </div>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* User location marker + radius */}
            {userPos && (
              <>
                <Marker position={[userPos.latitude, userPos.longitude]} icon={USER_ICON}>
                  <Popup>
                    <div style={{ minWidth: 160, textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{t('map.your_position')}</div>
                      <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                        {userPos.latitude.toFixed(4)}, {userPos.longitude.toFixed(4)}
                      </div>
                      {nearbyMatches.length > 0 && (
                        <div style={{ fontSize: 11, marginTop: 6, color: '#a855f7', fontWeight: 600 }}>
                          {nearbyMatches.reduce((s, m) => s + m.comp.events.length, 0)} {t('map.matches_nearby', { radius: NEARBY_RADIUS_KM })}
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
                {showNearby && (
                  <Circle
                    center={[userPos.latitude, userPos.longitude]}
                    radius={NEARBY_RADIUS_KM * 1000}
                    pathOptions={{
                      color: '#a855f7',
                      fillColor: '#a855f7',
                      fillOpacity: 0.06,
                      weight: 2,
                      dashArray: '8 4',
                    }}
                  />
                )}
              </>
            )}
          </MapContainer>
        </div>

        {/* Sidebar */}
        <div className="w-80 shrink-0 hidden lg:flex flex-col gap-2 overflow-y-auto pr-1">
          {/* Nearby matches section */}
          {userPos && nearbyMatches.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-purple-500 px-1 flex items-center gap-1.5">
                <Navigation className="w-3 h-3" />
                {t('map.nearby_title')} ({nearbyMatches.reduce((s, m) => s + m.comp.events.length, 0)})
              </p>
              {nearbyMatches.map((m, i) => {
                const hasLive = m.comp.events.some(e => isLive(e.status));
                return (
                  <Card
                    key={`nearby-${i}`}
                    className={cn(
                      'border-purple-500/20 cursor-pointer hover:bg-purple-500/5 transition-colors',
                      hasLive && 'ring-1 ring-destructive/30'
                    )}
                    onClick={() => setFlyTarget({ center: m.coords, zoom: 8 })}
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm">{countryFlag(m.comp.country_code)}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate">{m.comp.name}</p>
                          <p className="text-xs text-muted-foreground">{m.comp.country}</p>
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0 border-purple-500/30 text-purple-600">
                          {Math.round(m.distance)} km
                        </Badge>
                      </div>
                      <div className="space-y-1">
                        {m.comp.events.slice(0, 3).map((ev, j) => (
                          <MatchRowCompact key={j} event={ev} />
                        ))}
                        {m.comp.events.length > 3 && (
                          <p className="text-[10px] text-muted-foreground">+{m.comp.events.length - 3} {t('map.more')}</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
              <div className="border-b border-border my-1" />
            </>
          )}

          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1">
            {t('map.competitions')} ({filteredMatchMarkers.length})
          </p>
          {filteredMatchMarkers.length === 0 && !eventsLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">{t('map.no_matches')}</p>
          )}
          {filteredMatchMarkers.map((m, i) => {
            const hasLive = m.comp.events.some(e => isLive(e.status));
            return (
              <Card
                key={i}
                className={cn(
                  'border-none cursor-pointer hover:bg-muted/60 transition-colors',
                  hasLive && 'ring-1 ring-destructive/30'
                )}
                onClick={() => setFlyTarget({ center: m.coords, zoom: 6 })}
              >
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-sm">{countryFlag(m.comp.country_code)}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold truncate">{m.comp.name}</p>
                      <p className="text-xs text-muted-foreground">{m.comp.country}</p>
                    </div>
                    <Badge variant={hasLive ? 'destructive' : 'secondary'} className="text-[10px] shrink-0">
                      {m.comp.events.length}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {m.comp.events.slice(0, 3).map((ev, j) => (
                      <MatchRowCompact key={j} event={ev} />
                    ))}
                    {m.comp.events.length > 3 && (
                      <p className="text-[10px] text-muted-foreground">+{m.comp.events.length - 3} {t('map.more')}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}

          {clubMarkers.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mt-4">
                {t('map.my_clubs')} ({clubMarkers.length})
              </p>
              {clubMarkers.slice(0, 15).map((c, i) => (
                <Card
                  key={i}
                  className="border-none cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => setFlyTarget({ center: c.coords, zoom: 7 })}
                >
                  <CardContent className="p-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.club}</p>
                      <p className="text-xs text-muted-foreground">{c.count} {t('map.scouted_players')}</p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components — use inline styles for Leaflet popups (Tailwind doesn't apply in popups)
// ---------------------------------------------------------------------------

function MatchRow({ event }: { event: LivescoreEvent }) {
  const live = isLive(event.status);
  const finished = isFinished(event.status);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6, padding: '3px 4px', borderRadius: 4, fontSize: 12,
      background: live ? 'rgba(239,68,68,0.1)' : 'transparent',
    }}>
      <div style={{ flex: 1, textAlign: 'right', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 500 }}>
        {event.home_badge && <img src={event.home_badge} style={{ width: 14, height: 14, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} alt="" />}
        {event.home_team}
      </div>
      <div style={{
        padding: '2px 6px', borderRadius: 4, fontWeight: 700, fontSize: 11, minWidth: 42, textAlign: 'center',
        background: live ? '#ef4444' : finished ? '#e5e7eb' : '#f3f4f6',
        color: live ? '#fff' : '#333',
      }}>
        {finished || live
          ? `${event.score_home ?? 0}-${event.score_away ?? 0}`
          : event.match_time?.slice(0, 5) || 'TBD'
        }
      </div>
      <div style={{ flex: 1, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis', fontWeight: 500 }}>
        {event.away_badge && <img src={event.away_badge} style={{ width: 14, height: 14, display: 'inline', marginRight: 4, verticalAlign: 'middle' }} alt="" />}
        {event.away_team}
      </div>
    </div>
  );
}

function MatchRowCompact({ event }: { event: LivescoreEvent }) {
  const live = isLive(event.status);
  const finished = isFinished(event.status);
  return (
    <div className="flex items-center gap-1 text-[11px]">
      <span className="flex-1 truncate text-right">{event.home_team}</span>
      <span className={cn('px-1 rounded font-bold', live ? 'text-red-500' : finished ? 'text-muted-foreground' : '')}>
        {finished || live ? `${event.score_home ?? 0}-${event.score_away ?? 0}` : event.match_time?.slice(0, 5) || '—'}
      </span>
      <span className="flex-1 truncate">{event.away_team}</span>
    </div>
  );
}
