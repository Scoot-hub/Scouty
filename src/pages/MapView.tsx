import { useMemo, useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  useEventsForDay,
  type LivescoreCompetition,
  type LivescoreEvent,
} from '@/hooks/use-api-football';
import { useSofascoreLeague } from '@/hooks/use-championships';
import { SOFASCORE_TOURNAMENT_IDS } from '@/data/sofascore-ids';
import { usePlayers } from '@/hooks/use-players';
import { useClubLocations } from '@/hooks/use-club-locations';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Search, Loader2, CalendarDays, ChevronLeft, ChevronRight, MapPin, Users, Crosshair, Navigation, RefreshCw, LocateFixed, SlidersHorizontal,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useGeolocation, distanceKm } from '@/hooks/use-geolocation';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// ---------------------------------------------------------------------------
// Fix Leaflet default icon paths broken by bundlers
// ---------------------------------------------------------------------------
const proto = L.Icon.Default.prototype as L.Icon.Default & { _getIconUrl?: unknown };
delete proto._getIconUrl;
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

// Map country full names → [lat, lng] for deep-link fly-to from ClubProfile
const COUNTRY_NAME_COORDS: Record<string, [number, number]> = {
  'france':[46,2],'england':[52.5,-1.5],'germany':[51,9],'spain':[40,-4],'italy':[42.8,12.8],
  'portugal':[39.5,-8],'netherlands':[52.5,5.8],'belgium':[50.8,4],'scotland':[56.5,-4],
  'brazil':[-10,-55],'argentina':[-34,-64],'united states':[38,-97],'mexico':[23,-102],
  'turkey':[39,35],'russia':[60,100],'ukraine':[49,32],'poland':[52,20],'sweden':[62,15],
  'norway':[62,10],'denmark':[56,10],'switzerland':[47,8],'austria':[47.3,13.3],
  'croatia':[45.2,15.5],'serbia':[44,21],'greece':[39,22],'czech republic':[49.8,15.5],
  'slovakia':[48.7,19.5],'romania':[46,25],'hungary':[47,20],'bulgaria':[43,25],
  'saudi arabia':[25,45],'united arab emirates':[24,54],'qatar':[25.5,51.2],
  'japan':[36,138],'south korea':[37,128],'china':[35,105],'australia':[-27,133],
  'morocco':[32,-5],'egypt':[27,30],'nigeria':[10,8],'south africa':[-29,24],
  'colombia':[4,-72],'chile':[-30,-71],'ecuador':[-2,-77.5],'uruguay':[-33,-56],
  'wales':[52.3,-3.5],'northern ireland':[54.6,-6.7],'ireland':[53,-8],
  'israel':[31.5,35],'iran':[32,53],'ghana':[8,-1.2],'cameroon':[6,12],
  'senegal':[14,-14],'ivory coast':[8,-5],'mali':[17,-4],'algeria':[28,3],
  'tunisia':[34,9],'kosovo':[42.6,21],'north macedonia':[41.5,22],'albania':[41,20],
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
const CLUB_ICON_PRECISE = createIcon('#0ea5e9', 26); // brighter blue for precisely geocoded clubs

const USER_ICON = L.divIcon({
  className: '',
  iconSize: [36, 36],
  iconAnchor: [18, 18],
  popupAnchor: [0, -18],
  html: `<div style="width:36px;height:36px;border-radius:50%;background:hsl(280,80%,55%);border:4px solid white;box-shadow:0 0 0 4px rgba(168,85,247,.3),0 2px 8px rgba(0,0,0,.3);display:flex;align-items:center;justify-content:center;">
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
  </div>`,
});

const NEARBY_RADIUS_KM_DEFAULT = 50;

// ---------------------------------------------------------------------------
// Cluster icon — shows the number of clubs grouped at this point
// ---------------------------------------------------------------------------
function createClusterIcon(count: number, hasApprox: boolean) {
  const size = count > 99 ? 44 : count > 20 ? 38 : count > 9 ? 34 : 30;
  const bg = hasApprox ? '#f59e0b' : '#3b82f6';
  const fs = count > 99 ? 10 : count > 9 ? 12 : 14;
  return L.divIcon({
    className: '',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `<div style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:${fs}px;color:white;">${count}</div>`,
  });
}

// Tracks map zoom and calls onZoom whenever it changes
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  useMapEvents({ zoom: e => onZoom(e.target.getZoom()), zoomend: e => onZoom(e.target.getZoom()) });
  return null;
}

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

// Country full name → ISO 3166-1 alpha-2 (for fallback club positioning)
const COUNTRY_NAME_TO_ISO: Record<string, string> = {
  'france':'FR','germany':'DE','spain':'ES','italy':'IT','england':'ENG','portugal':'PT',
  'netherlands':'NL','belgium':'BE','scotland':'SCO','wales':'WAL','northern ireland':'NIR',
  'ireland':'IE','switzerland':'CH','austria':'AT','sweden':'SE','norway':'NO','denmark':'DK',
  'poland':'PL','czech republic':'CZ','hungary':'HU','romania':'RO','croatia':'HR','serbia':'RS',
  'slovakia':'SK','slovenia':'SI','greece':'GR','turkey':'TR','russia':'RU','ukraine':'UA',
  'brazil':'BR','argentina':'AR','colombia':'CO','chile':'CL','uruguay':'UY','ecuador':'EC',
  'united states':'US','mexico':'MX','canada':'CA','japan':'JP','south korea':'KR','china':'CN',
  'australia':'AU','saudi arabia':'SA','uae':'AE','united arab emirates':'AE','qatar':'QA',
  'morocco':'MA','egypt':'EG','nigeria':'NG','south africa':'ZA','ghana':'GH','cameroon':'CM',
  'senegal':'SN','ivory coast':'CI','côte d\'ivoire':'CI','mali':'ML','algeria':'DZ','tunisia':'TN',
  'israel':'IL','iran':'IR','india':'IN','usa':'US',
};
function countryToIso(name: string): string {
  if (!name) return '';
  const lower = name.toLowerCase().trim();
  if (COUNTRY_NAME_TO_ISO[lower]) return COUNTRY_NAME_TO_ISO[lower];
  // Try 2-char ISO prefix heuristic for less common countries
  const upper2 = name.toUpperCase().slice(0, 2);
  if (COUNTRY_COORDS[upper2]) return upper2;
  return '';
}

// Generates a short acronym from a club name: "Olympique Lyonnais" → "OL"
function getClubAcronym(name: string): string {
  const stop = new Set(['de','du','des','le','la','les','et','l','d','of','the','fc','sc','ac','us','as','rc','ogc','aj','sm','sl','cf','sd','rb','bv','sv','fk','sk','nk','hnk','gnk','tj']);
  const words = name.replace(/['']/g, '').split(/[\s\-\/]+/).filter(Boolean);
  const significant = words.filter(w => !stop.has(w.toLowerCase()));
  const base = significant.length > 0 ? significant : words;
  return base.map(w => w[0].toUpperCase()).join('').slice(0, 3) || name.slice(0, 2).toUpperCase();
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

// Captures map clicks when active (VPN / manual position mode)
function MapClickHandler({ active, onPick }: { active: boolean; onPick: (lat: number, lng: number) => void }) {
  const map = useMap();
  useMapEvents({ click: e => { if (active) onPick(e.latlng.lat, e.latlng.lng); } });
  useEffect(() => {
    const el = map.getContainer();
    el.style.cursor = active ? 'crosshair' : '';
    return () => { el.style.cursor = ''; };
  }, [active, map]);
  return null;
}

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Selected-pin type (replaces Leaflet Popup — rendered outside the map DOM)
// ---------------------------------------------------------------------------
type ScreenPos = { x: number; y: number };

type SelectedPin =
  | { type: 'club'; club: { club: string; count: number; players: string[]; country: string; isGeolocated: boolean }; logoUrl: string | null; screenPos: ScreenPos; league: string | null }
  | { type: 'match'; comp: import('@/hooks/use-api-football').LivescoreCompetition; screenPos: ScreenPos }
  | { type: 'user'; lat: number; lng: number; nearbyMatches: number; nearbyClubs: number; nearbyPlayers: number; isManual: boolean; screenPos: ScreenPos };

// ---------------------------------------------------------------------------
// Parse "lat, lng" string (e.g. "48.85, 2.35")
function parseLatLng(s: string): [number, number] | null {
  const m = s.trim().match(/^(-?\d+(?:[.,]\d+)?)\s*[,;]\s*(-?\d+(?:[.,]\d+)?)$/);
  if (!m) return null;
  const lat = parseFloat(m[1].replace(',', '.'));
  const lng = parseFloat(m[2].replace(',', '.'));
  if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return [lat, lng];
}

export default function MapView() {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [dayOffset, setDayOffset] = useState(0);
  const selectedDate = getDateString(dayOffset);
  const { data: eventsData, isLoading: eventsLoading } = useEventsForDay(selectedDate);
  const { data: players = [] } = usePlayers();
  const { data: clubLocations = [] } = useClubLocations();
  const { data: clubLogosRaw = [] } = useQuery<{ club_name: string; logo_url: string; name_fr?: string; name_en?: string; name_es?: string }[]>({
    queryKey: ['club-logos'],
    queryFn: () => fetch('/api/club-logos').then(r => r.json()),
    staleTime: 7 * 24 * 60 * 60 * 1000,
  });
  const { data: userProfile } = useQuery<{ country?: string | null; nationality?: string | null }>({
    queryKey: ['profile-country', user?.id],
    queryFn: async () => {
      if (!user?.id) return {};
      const { data } = await supabase.from('profiles').select('country').eq('user_id', user.id).single();
      return (data as { country?: string | null }) ?? {};
    },
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
  });
  const [search, setSearch] = useState(() => searchParams.get('q') || '');
  const [flyTarget, setFlyTarget] = useState<{ center: [number, number]; zoom: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [mapHeight, setMapHeight] = useState(500);
  const { position: userPos, loading: geoLoading, locate } = useGeolocation();
  const [showNearby, setShowNearby] = useState(false);
  const [pendingNearby, setPendingNearby] = useState(false);
  const [nearbyRadiusKm, setNearbyRadiusKm] = useState(NEARBY_RADIUS_KM_DEFAULT);

  // On mount: if ?q= param provided, fly to it; otherwise fly to user's profile country
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      const parsed = parseLatLng(q);
      if (parsed) { setFlyTarget({ center: parsed, zoom: 14 }); return; }
      const lower = q.toLowerCase().trim();
      const coords = COUNTRY_NAME_COORDS[lower];
      if (coords) { setFlyTarget({ center: coords, zoom: 6 }); return; }
      for (const [name, c] of Object.entries(COUNTRY_NAME_COORDS)) {
        if (lower.includes(name) || name.includes(lower)) { setFlyTarget({ center: c, zoom: 6 }); return; }
      }
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fly to profile country once profile data is loaded (only if no ?q= and no manual fly)
  useEffect(() => {
    if (searchParams.get('q')) return;
    if (userProfile === undefined) return; // still loading
    if (!userProfile?.country) {
      setFlyTarget({ center: [50, 10], zoom: 5 });
      return;
    }
    const lower = userProfile.country.toLowerCase().trim();
    const coords = COUNTRY_NAME_COORDS[lower];
    if (coords) { setFlyTarget({ center: coords, zoom: 6 }); return; }
    for (const [name, c] of Object.entries(COUNTRY_NAME_COORDS)) {
      if (lower.includes(name) || name.includes(lower)) { setFlyTarget({ center: c, zoom: 6 }); return; }
    }
    setFlyTarget({ center: [50, 10], zoom: 5 });
  }, [userProfile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-activate nearby view once position arrives after clicking the button
  useEffect(() => {
    if (pendingNearby && userPos) {
      setShowNearby(true);
      setFlyTarget({ center: [userPos.latitude, userPos.longitude], zoom: 7 });
      setPendingNearby(false);
    }
  }, [pendingNearby, userPos]);
  const queryClient = useQueryClient();
  const { distanceUnit } = useUiPreferences();

  // Convert km ↔ display unit helpers
  const kmToUnit = (km: number) => distanceUnit === 'mi' ? Math.round(km * 0.621371) : Math.round(km);
  const unitToKm = (v: number) => distanceUnit === 'mi' ? Math.round(v / 0.621371) : v;
  const unitLabel = distanceUnit === 'mi' ? 'mi' : 'km';
  const fmtDist = (km: number) => `${kmToUnit(km)} ${unitLabel}`;
  const nearbyRadiusDisplay = `${kmToUnit(nearbyRadiusKm)} ${unitLabel}`;

  // Slider config in display unit
  const radiusInUnit = kmToUnit(nearbyRadiusKm);
  const radiusMin = distanceUnit === 'mi' ? 15 : 25;
  const radiusMax = distanceUnit === 'mi' ? 300 : 500;
  const radiusStep = distanceUnit === 'mi' ? 15 : 25;
  const handleRadiusChange = (v: number) => setNearbyRadiusKm(unitToKm(v));

  const [mapZoom, setMapZoom] = useState(5);

  // ── Manual / VPN position state ──
  const [manualPos, setManualPos] = useState<{ latitude: number; longitude: number; accuracy: number } | null>(null);
  const [manualLocMode, setManualLocMode] = useState(false);
  const [showManualPanel, setShowManualPanel] = useState(false);
  const [manualLatInput, setManualLatInput] = useState('');
  const [manualLngInput, setManualLngInput] = useState('');

  // Effective position: manual overrides GPS
  const effectivePos = manualPos ?? userPos;

  // ── Club location correction state ──
  const [fixingClub, setFixingClub] = useState<string | null>(null);
  const [fixCountry, setFixCountry] = useState('');
  const [manualLat, setManualLat] = useState('');
  const [manualLng, setManualLng] = useState('');
  const [fixLoading, setFixLoading] = useState(false);
  const [selectedPin, setSelectedPin] = useState<SelectedPin | null>(null);

  const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

  const handleAutoGeocode = async (clubName: string, country: string) => {
    setFixLoading(true);
    try {
      const res = await fetch(`${API}/club-geocode`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubName, country }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['club-locations'] });
      toast.success(`${clubName} localisé : ${data.lat.toFixed(4)}, ${data.lng.toFixed(4)}`);
      setFixingClub(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally { setFixLoading(false); }
  };

  const handleManualGeocode = async (clubName: string, country: string) => {
    if (!manualLat || !manualLng) return;
    setFixLoading(true);
    try {
      const res = await fetch(`${API}/club-geocode-manual`, {
        method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clubName, country, lat: manualLat, lng: manualLng }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      queryClient.invalidateQueries({ queryKey: ['club-locations'] });
      toast.success(`${clubName} — position mise à jour`);
      setFixingClub(null); setManualLat(''); setManualLng('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally { setFixLoading(false); }
  };

  // Build a lookup: club_name → {lat, lng} from real geocoded data
  const clubCoordMap = useMemo(() => {
    const m = new Map<string, [number, number]>();
    for (const c of clubLocations) {
      const lat = Number(c.lat);
      const lng = Number(c.lng);
      if (!isNaN(lat) && !isNaN(lng) && lat !== 0 && lng !== 0) {
        m.set(c.club_name.toLowerCase(), [lat, lng]);
      }
    }
    return m;
  }, [clubLocations]);

  // Build a lookup: normalized club name → logo_url (all name variants)
  const clubLogoMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clubLogosRaw) {
      if (!c.logo_url) continue;
      m.set(c.club_name.toLowerCase(), c.logo_url);
      if (c.name_fr) m.set(c.name_fr.toLowerCase(), c.logo_url);
      if (c.name_en) m.set(c.name_en.toLowerCase(), c.logo_url);
      if (c.name_es) m.set(c.name_es.toLowerCase(), c.logo_url);
    }
    return m;
  }, [clubLogosRaw]);

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

  // Aggregate clubs from user's players — country comes from clubLocations (authoritative)
  // NOT from player nationality (a Czech player at Lyon ≠ Lyon is in Czech Republic)
  const playerClubs = useMemo(() => {
    // Build club country map from geocoded data (source of truth)
    const geocodedCountry = new Map<string, string>();
    for (const c of clubLocations) {
      geocodedCountry.set(c.club_name.toLowerCase(), c.country || '');
    }

    const clubs = new Map<string, {
      club: string; country: string; count: number;
      players: string[]; logoUrl: string | null;
      natCounts: Map<string, number>;
    }>();

    for (const p of players) {
      if (!p.club) continue;
      const key = p.club.toLowerCase();
      const existing = clubs.get(key);
      if (existing) {
        existing.count++;
        if (existing.players.length < 5) existing.players.push(p.name);
        if (p.nationality) existing.natCounts.set(p.nationality, (existing.natCounts.get(p.nationality) || 0) + 1);
      } else {
        const natCounts = new Map<string, number>();
        if (p.nationality) natCounts.set(p.nationality, 1);
        clubs.set(key, {
          club: p.club,
          country: geocodedCountry.get(key) || '',
          count: 1,
          players: [p.name],
          logoUrl: clubLogoMap.get(key) ?? null,
          natCounts,
        });
      }
    }

    return Array.from(clubs.values()).map(c => {
      // If we have the geocoded country, use it; otherwise use majority player nationality as last resort
      if (c.country) return c;
      if (c.natCounts.size > 0) {
        const top = Array.from(c.natCounts.entries()).sort((a, b) => b[1] - a[1])[0][0];
        return { ...c, country: top };
      }
      return c;
    });
  }, [players, clubLogoMap, clubLocations]);

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

  // Build club markers — prefer real geocoded coords, fallback to country centroid + jitter
  const clubMarkers = useMemo(() => {
    return playerClubs
      .map(c => {
        // 1. Real geocoded coordinates (precise)
        const real = clubCoordMap.get(c.club.toLowerCase());
        if (real) return { ...c, coords: real, isGeolocated: true };
        // 2. Country centroid + deterministic jitter (approximate)
        const iso = countryToIso(c.country);
        const base = COUNTRY_COORDS[iso];
        if (!base) return null;
        const h = hashStr(c.club);
        const jx = ((h % 100) / 100) * 2 - 1;
        const jy = (((h >> 8) % 100) / 100) * 2 - 1;
        return { ...c, coords: [base[0] + jy * 0.5, base[1] + jx * 0.8] as [number, number], isGeolocated: false };
      })
      .filter(Boolean) as (typeof playerClubs[number] & { coords: [number, number]; isGeolocated: boolean })[];
  }, [playerClubs, clubCoordMap]);

  // Nearby matches (sorted by distance to user)
  const nearbyMatches = useMemo(() => {
    if (!effectivePos || !matchMarkers.length) return [];
    return matchMarkers
      .map(m => ({
        ...m,
        distance: distanceKm(effectivePos.latitude, effectivePos.longitude, m.coords[0], m.coords[1]),
      }))
      .filter(m => m.distance <= nearbyRadiusKm)
      .sort((a, b) => a.distance - b.distance);
  }, [effectivePos, matchMarkers, nearbyRadiusKm]);

  // Nearby clubs from user's scouted players (sorted by distance)
  const nearbyClubs = useMemo(() => {
    if (!effectivePos || !clubMarkers.length) return [];
    return clubMarkers
      .map(c => ({
        ...c,
        distance: distanceKm(effectivePos.latitude, effectivePos.longitude, c.coords[0], c.coords[1]),
      }))
      .filter(c => c.distance <= nearbyRadiusKm)
      .sort((a, b) => a.distance - b.distance);
  }, [effectivePos, clubMarkers, nearbyRadiusKm]);

  // Detect if search is a lat,lng coordinate
  const parsedLatLng = useMemo(() => parseLatLng(search), [search]);

  // Filter matches (country / team / competition)
  const filteredMatchMarkers = useMemo(() => {
    if (!search.trim() || parsedLatLng) return matchMarkers;
    const q = search.toLowerCase();
    return matchMarkers.filter(m =>
      m.comp.name.toLowerCase().includes(q) ||
      m.comp.country.toLowerCase().includes(q) ||
      m.comp.events.some(e => e.home_team.toLowerCase().includes(q) || e.away_team.toLowerCase().includes(q))
    );
  }, [matchMarkers, search, parsedLatLng]);

  // Filter clubs (country / name)
  const filteredClubMarkers = useMemo(() => {
    if (!search.trim() || parsedLatLng) return clubMarkers;
    const q = search.toLowerCase();
    return clubMarkers.filter(c =>
      c.club.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q)
    );
  }, [clubMarkers, search, parsedLatLng]);

  // Grid-based clustering: group clubs into geographic cells based on zoom level
  const clusteredClubMarkers = useMemo(() => {
    type CM = typeof filteredClubMarkers[number];
    type ClusterItem = CM & { isCluster: boolean; clusterSize: number; clusterMembers: CM[] };

    const gridDeg =
      mapZoom <= 3 ? 20 : mapZoom <= 4 ? 12 : mapZoom <= 5 ? 8 :
      mapZoom <= 6 ? 5  : mapZoom <= 7 ? 3  : mapZoom <= 8 ? 1.5 :
      mapZoom <= 9 ? 0.8 : mapZoom <= 10 ? 0.3 : 0;

    if (gridDeg === 0) {
      return filteredClubMarkers.map(c => ({ ...c, isCluster: false, clusterSize: 1, clusterMembers: [c] })) as ClusterItem[];
    }
    const grid = new Map<string, CM[]>();
    for (const c of filteredClubMarkers) {
      const key = `${Math.floor(c.coords[1] / gridDeg)},${Math.floor(c.coords[0] / gridDeg)}`;
      const arr = grid.get(key) || [];
      arr.push(c);
      grid.set(key, arr);
    }
    return Array.from(grid.values()).map(members => {
      if (members.length === 1) return { ...members[0], isCluster: false, clusterSize: 1, clusterMembers: members };
      const lat = members.reduce((s, c) => s + c.coords[0], 0) / members.length;
      const lng = members.reduce((s, c) => s + c.coords[1], 0) / members.length;
      return { ...members[0], coords: [lat, lng] as [number, number], isCluster: true, clusterSize: members.length, clusterMembers: members, isGeolocated: members.every(c => c.isGeolocated) };
    }) as ClusterItem[];
  }, [filteredClubMarkers, mapZoom]);

  const dateLabel = new Date(selectedDate + 'T00:00:00').toLocaleDateString(
    i18n.language === 'es' ? 'es-ES' : i18n.language === 'en' ? 'en-GB' : 'fr-FR',
    { weekday: 'short', day: 'numeric', month: 'short' }
  );

  const totalMatches = eventsData?.count || 0;
  const liveCount = matchMarkers.reduce((sum, m) => sum + m.comp.events.filter(e => isLive(e.status)).length, 0);

  return (
    <div className="flex flex-col gap-4">
      <style>{`@keyframes fadeInScale{from{opacity:0;transform:scale(.96)}to{opacity:1;transform:scale(1)}}`}</style>
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
            variant={effectivePos && showNearby ? 'default' : 'outline'}
            size="sm"
            className="rounded-xl gap-1.5 shrink-0"
            onClick={() => {
              if (effectivePos) {
                const next = !showNearby;
                setShowNearby(next);
                if (next) setFlyTarget({ center: [effectivePos.latitude, effectivePos.longitude], zoom: 7 });
              } else {
                setPendingNearby(true);
                locate();
              }
            }}
            disabled={geoLoading}
          >
            {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Crosshair className="w-4 h-4" />}
            {effectivePos ? t('map.nearby') : t('map.locate_me')}
          </Button>

          {/* VPN / Manual position — direct map-click toggle */}
          <div className="flex items-center gap-1 shrink-0">
            <Button
              variant={manualPos || manualLocMode ? 'default' : 'outline'}
              size="sm"
              className={cn(
                'rounded-xl gap-1.5',
                manualPos && !manualLocMode && 'bg-amber-500 border-amber-500 hover:bg-amber-600 text-white',
                manualLocMode && 'animate-pulse bg-amber-500 border-amber-500 hover:bg-amber-600 text-white',
              )}
              onClick={() => setManualLocMode(m => !m)}
              title={manualLocMode ? 'Annuler le placement' : 'Cliquer sur la carte pour définir votre position (VPN)'}
            >
              <LocateFixed className="w-4 h-4" />
              {manualLocMode ? 'Annuler' : 'VPN'}
            </Button>
            {manualPos && !manualLocMode && (
              <button
                className="h-8 px-1.5 rounded-xl border border-border hover:bg-destructive/10 hover:border-destructive/40 text-muted-foreground hover:text-destructive transition-colors text-xs"
                title="Effacer la position manuelle"
                onClick={() => { setManualPos(null); setManualLocMode(false); }}
              >
                ×
              </button>
            )}
          </div>

          {/* Radius slider — visible only when nearby mode is active */}
          {effectivePos && showNearby && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-1.5 shrink-0">
              <SlidersHorizontal className="w-3.5 h-3.5 text-purple-500 shrink-0" />
              <input
                type="range"
                min={radiusMin}
                max={radiusMax}
                step={radiusStep}
                value={radiusInUnit}
                onChange={e => handleRadiusChange(Number(e.target.value))}
                className="w-24 accent-purple-500 cursor-pointer"
                title={`${t('map.radius')}: ${nearbyRadiusDisplay}`}
              />
              <span className="text-xs font-semibold text-purple-600 tabular-nums w-16 shrink-0">
                {nearbyRadiusDisplay}
              </span>
            </div>
          )}
          <div className="relative w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('map.search_extended')}
              className="pl-9 h-9 rounded-xl"
              onKeyDown={e => {
                if (e.key === 'Enter' && parsedLatLng) {
                  setFlyTarget({ center: parsedLatLng, zoom: 10 });
                }
              }}
            />
            {parsedLatLng && (
              <button
                onClick={() => setFlyTarget({ center: parsedLatLng, zoom: 10 })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded-full"
              >
                Go
              </button>
            )}
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
          {filteredClubMarkers.length} {t('map.clubs')}
        </Badge>
        {effectivePos && (nearbyMatches.length > 0 || nearbyClubs.length > 0) && (
          <Badge variant="outline" className="gap-1.5 border-purple-500/30 text-purple-600">
            <Navigation className="w-3.5 h-3.5" />
            {nearbyMatches.reduce((s, m) => s + m.comp.events.length, 0)} {t('map.nearby_count')}
            {nearbyClubs.length > 0 && ` · ${nearbyClubs.length} ${t('map.clubs')}`}
            {manualPos && <span className="ml-1 text-amber-500 font-bold">· VPN</span>}
          </Badge>
        )}
        {eventsLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Map + Sidebar */}
      <div ref={containerRef} className="flex gap-4" style={{ height: mapHeight }}>
        {/* Map — explicit pixel height */}
        <div className="relative flex-1 rounded-2xl border border-border shadow-lg" style={{ height: mapHeight, overflow: 'visible' }}>
          {/* Click-mode overlay */}
          {manualLocMode && (
            <div className="absolute inset-x-0 top-2 z-[1000] flex justify-center pointer-events-none">
              <div className="bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-lg flex items-center gap-2">
                <MapPin className="w-3.5 h-3.5" />
                Cliquez sur la carte pour vous positionner
              </div>
            </div>
          )}
          <MapContainer
            center={[50, 10]}
            zoom={5}
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
            <MapClickHandler
              active={manualLocMode}
              onPick={(lat, lng) => {
                setManualPos({ latitude: lat, longitude: lng, accuracy: 0 });
                setManualLocMode(false);
                setShowNearby(true);
                setFlyTarget({ center: [lat, lng], zoom: 7 });
              }}
            />

            {/* Match markers */}
            {filteredMatchMarkers.map((m, i) => {
              const hasLive = m.comp.events.some(e => isLive(e.status));
              return (
                <Marker key={`match-${i}`} position={m.coords} icon={hasLive ? MATCH_LIVE_ICON : MATCH_ICON}
                  eventHandlers={{ click: (e) => setSelectedPin({ type: 'match', comp: m.comp, screenPos: { x: (e as unknown as { originalEvent: MouseEvent }).originalEvent.clientX, y: (e as unknown as { originalEvent: MouseEvent }).originalEvent.clientY } }) }}
                />
              );
            })}

            {/* Club markers — grid-clustered based on zoom level */}
            <ZoomTracker onZoom={setMapZoom} />
            {clusteredClubMarkers.map((c, i) =>
              c.isCluster ? (
                <ClusterMarker
                  key={`cluster-${i}`}
                  position={c.coords}
                  count={c.clusterSize}
                  hasApprox={!c.isGeolocated}
                  members={c.clusterMembers}
                />
              ) : (
                <Marker key={`club-${i}`} position={c.coords} icon={c.isGeolocated ? CLUB_ICON_PRECISE : CLUB_ICON}
                  eventHandlers={{ click: (e) => {
                    const ev = e as unknown as { originalEvent: MouseEvent };
                    const league = players.find(p => p.club?.toLowerCase() === c.club?.toLowerCase())?.league ?? null;
                    setSelectedPin({ type: 'club', club: c, logoUrl: c.logoUrl, screenPos: { x: ev.originalEvent.clientX, y: ev.originalEvent.clientY }, league });
                  }}}
                />
              )
            )}

            {/* User location marker + radius */}
            {effectivePos && (
              <>
                <Marker position={[effectivePos.latitude, effectivePos.longitude]} icon={USER_ICON}
                  eventHandlers={{ click: (e) => {
                    const ev = e as unknown as { originalEvent: MouseEvent };
                    setSelectedPin({
                      type: 'user',
                      lat: effectivePos.latitude, lng: effectivePos.longitude,
                      nearbyMatches: nearbyMatches.reduce((s, m) => s + m.comp.events.length, 0),
                      nearbyClubs: nearbyClubs.length,
                      nearbyPlayers: nearbyClubs.reduce((s, c) => s + c.count, 0),
                      isManual: !!manualPos,
                      screenPos: { x: ev.originalEvent.clientX, y: ev.originalEvent.clientY },
                    });
                  } }}
                />
                {showNearby && (
                  <Circle
                    center={[effectivePos.latitude, effectivePos.longitude]}
                    radius={nearbyRadiusKm * 1000}
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
        <div className="w-80 shrink-0 hidden lg:flex flex-col gap-2 overflow-y-auto">
          {/* ── Nearby section — matches + clubs ── */}
          {effectivePos && showNearby && (nearbyMatches.length > 0 || nearbyClubs.length > 0) && (
            <>
              <div className="flex items-center gap-1.5 px-1">
                <Navigation className="w-3 h-3 text-purple-500" />
                <p className="text-xs font-bold uppercase tracking-wider text-purple-500">
                  {t('map.nearby_title')} — {nearbyRadiusDisplay}
                </p>
              </div>

              {/* Nearby matches */}
              {nearbyMatches.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1">
                    ⚽ {t('map.competitions')} ({nearbyMatches.reduce((s, m) => s + m.comp.events.length, 0)})
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
                              {fmtDist(m.distance)}
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
                </>
              )}

              {/* Nearby clubs */}
              {nearbyClubs.length > 0 && (
                <>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-sky-500 px-1 flex items-center gap-1 mt-1">
                    🏟 {t('map.my_clubs')} ({nearbyClubs.length})
                  </p>
                  {nearbyClubs.map((c, i) => (
                    <Card
                      key={`nearby-club-${i}`}
                      className="border-sky-500/20 cursor-pointer hover:bg-sky-500/5 transition-colors"
                      onClick={() => setFlyTarget({ center: c.coords, zoom: c.isGeolocated ? 12 : 8 })}
                    >
                      <CardContent className="p-3 flex items-center gap-2">
                        <Users className="w-4 h-4 shrink-0 text-sky-500" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold truncate">{c.club}</p>
                          <p className="text-xs text-muted-foreground">
                            {c.count} {t('map.scouted_players')}
                            {c.isGeolocated
                              ? <span className="ml-1 text-emerald-500">· 📍 {t('map.precise_location')}</span>
                              : <span className="ml-1 text-amber-500">· ⚠ {t('map.approximate_location')}</span>
                            }
                          </p>
                          {c.players.slice(0, 2).map((name, k) => (
                            <p key={k} className="text-[10px] text-muted-foreground truncate">• {name}</p>
                          ))}
                          {c.count > 2 && (
                            <p className="text-[10px] text-muted-foreground">+{c.count - 2} {t('map.scouted_players')}</p>
                          )}
                        </div>
                        <Badge variant="outline" className="text-[10px] shrink-0 border-sky-500/30 text-sky-600">
                          {fmtDist(c.distance)}
                        </Badge>
                      </CardContent>
                    </Card>
                  ))}
                </>
              )}

              {/* Empty state if no nearby data despite having position */}
              {nearbyMatches.length === 0 && nearbyClubs.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  {t('map.nothing_nearby', { radius: nearbyRadiusDisplay })}
                </p>
              )}

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

          {filteredClubMarkers.length > 0 && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground px-1 mt-4">
                {t('map.my_clubs')} ({filteredClubMarkers.length})
              </p>
              {filteredClubMarkers.slice(0, 15).map((c, i) => (
                <Card
                  key={i}
                  className="border-none cursor-pointer hover:bg-muted/60 transition-colors"
                  onClick={() => setFlyTarget({ center: c.coords, zoom: c.isGeolocated ? 12 : 7 })}
                >
                  <CardContent className="p-3 flex items-center gap-2">
                    <Users className={cn('w-4 h-4 shrink-0', c.isGeolocated ? 'text-sky-500' : 'text-blue-500')} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{c.club}</p>
                      <p className="text-xs text-muted-foreground">
                        {c.count} {t('map.scouted_players')}
                        {c.isGeolocated && <span className="ml-1 text-sky-500">•</span>}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Floating info panel — anchored above the clicked marker ── */}
      {selectedPin && (() => {
        const POPUP_W = 288;
        const MARGIN = 10;
        const CARET_H = 10; // triangle height
        const { x, y } = selectedPin.screenPos;

        // Horizontal: center on marker, clamped to viewport
        const rawLeft = x - POPUP_W / 2;
        const left = Math.max(MARGIN, Math.min(rawLeft, window.innerWidth - POPUP_W - MARGIN));

        // Vertical: prefer above the marker, flip below if not enough room
        const spaceAbove = y - MARGIN;
        const spaceBelow = window.innerHeight - y - MARGIN;
        const goAbove = spaceAbove >= 260 || spaceAbove > spaceBelow;

        // Caret horizontal offset (points to exact marker x)
        const caretLeft = Math.max(16, Math.min(x - left, POPUP_W - 16));

        return (
        <div
          className="fixed z-[9999] w-72 rounded-2xl shadow-2xl border border-border bg-background overflow-hidden"
          style={{
            width: POPUP_W,
            maxHeight: goAbove ? Math.min(spaceAbove - CARET_H - 4, 480) : Math.min(spaceBelow - CARET_H - 4, 480),
            overflowY: 'auto',
            left,
            ...(goAbove
              ? { bottom: window.innerHeight - y + CARET_H + 4 }
              : { top: y + CARET_H + 4 }
            ),
            animation: 'fadeInScale 0.15s ease both',
          }}
        >
          {/* Caret arrow pointing to the marker */}
          <div
            style={{
              position: 'absolute',
              left: caretLeft - 8,
              width: 0, height: 0,
              ...(goAbove
                ? { bottom: -CARET_H, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderTop: `${CARET_H}px solid hsl(var(--border))` }
                : { top: -CARET_H, borderLeft: '8px solid transparent', borderRight: '8px solid transparent', borderBottom: `${CARET_H}px solid hsl(var(--border))` }
              ),
            }}
          />
          <div
            style={{
              position: 'absolute',
              left: caretLeft - 7,
              width: 0, height: 0,
              ...(goAbove
                ? { bottom: -(CARET_H - 1), borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderTop: `${CARET_H - 1}px solid hsl(var(--background))` }
                : { top: -(CARET_H - 1), borderLeft: '7px solid transparent', borderRight: '7px solid transparent', borderBottom: `${CARET_H - 1}px solid hsl(var(--background))` }
              ),
            }}
          />
          {/* Close button */}
          <button
            onClick={() => setSelectedPin(null)}
            className="absolute top-2 right-2 z-10 w-6 h-6 rounded-full bg-black/20 hover:bg-black/40 flex items-center justify-center text-white transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor">
              <path d="M1 1l8 8M9 1l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>

          {selectedPin.type === 'club' && (
            <ClubPopup
              club={selectedPin.club}
              logoUrl={selectedPin.logoUrl}
              league={selectedPin.league}
              fixingClub={fixingClub}
              fixCountry={fixCountry}
              manualLat={manualLat}
              manualLng={manualLng}
              fixLoading={fixLoading}
              onStartFix={() => { setFixingClub(selectedPin.club.club); setFixCountry(''); setManualLat(''); setManualLng(''); }}
              onCancelFix={() => setFixingClub(null)}
              onFixCountryChange={setFixCountry}
              onManualLatChange={setManualLat}
              onManualLngChange={setManualLng}
              onAutoGeocode={() => handleAutoGeocode(selectedPin.club.club, fixCountry)}
              onManualGeocode={() => handleManualGeocode(selectedPin.club.club, fixCountry)}
              fixLocationLabel={t('map.fix_location')}
              fixCountryPlaceholder={t('map.fix_country_placeholder')}
              fixAutoLabel={t('map.fix_auto')}
              fixManualLabel={t('map.fix_manual')}
              cancelLabel={t('common.cancel')}
              scoutedLabel={t('map.scouted_players')}
              preciseLabel={t('map.precise_location')}
              approxLabel={t('map.approximate_location')}
              viewProfileLabel={t('map.view_club_profile')}
              moreLabel={t('map.more')}
            />
          )}

          {selectedPin.type === 'match' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg,#22c55e,#16a34a)', padding: '14px 36px 12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 18 }}>{countryFlag(selectedPin.comp.country_code)}</span>
                <div>
                  <div style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>{selectedPin.comp.name}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,.75)' }}>{selectedPin.comp.country}</div>
                </div>
              </div>
              <div style={{ padding: '10px 14px', maxHeight: 320, overflowY: 'auto' }}>
                {selectedPin.comp.events.slice(0, 10).map((ev, j) => (
                  <MatchRow key={j} event={ev} />
                ))}
                {selectedPin.comp.events.length > 10 && (
                  <div style={{ fontSize: 11, color: '#888', textAlign: 'center', marginTop: 6 }}>
                    +{selectedPin.comp.events.length - 10} {t('map.more')}
                  </div>
                )}
              </div>
            </div>
          )}

          {selectedPin.type === 'user' && (
            <div>
              <div style={{ background: 'linear-gradient(135deg,hsl(280,80%,55%),hsl(260,70%,45%))', padding: '14px 36px 12px 14px' }}>
                <div style={{ fontWeight: 800, fontSize: 13, color: '#fff' }}>
                  {selectedPin.isManual ? '📍 Position manuelle (VPN)' : t('map.your_position')}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
                  {selectedPin.lat.toFixed(4)}, {selectedPin.lng.toFixed(4)}
                </div>
              </div>
              <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                {selectedPin.nearbyMatches > 0 && (
                  <div style={{ fontSize: 12, color: '#a855f7', fontWeight: 600 }}>
                    ⚽ {selectedPin.nearbyMatches} {t('map.matches_nearby', { radius: nearbyRadiusDisplay })}
                  </div>
                )}
                {selectedPin.nearbyClubs > 0 && (
                  <div style={{ fontSize: 12, color: '#0ea5e9', fontWeight: 600 }}>
                    🏟 {selectedPin.nearbyClubs} {t('map.clubs')} — {selectedPin.nearbyPlayers} {t('map.scouted_players')}
                  </div>
                )}
                {selectedPin.nearbyMatches === 0 && selectedPin.nearbyClubs === 0 && (
                  <div style={{ fontSize: 12, color: '#888' }}>{t('map.no_nearby')}</div>
                )}
              </div>
            </div>
          )}
        </div>
        );
      })()}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ClusterMarker — clicking zooms into the cluster bounds
// ---------------------------------------------------------------------------
function ClusterMarker({
  position, count, hasApprox, members,
}: {
  position: [number, number];
  count: number;
  hasApprox: boolean;
  members: { coords: [number, number] }[];
}) {
  const map = useMap();
  const icon = useMemo(() => createClusterIcon(count, hasApprox), [count, hasApprox]);
  const handleClick = () => {
    if (members.length < 2) return;
    const lats = members.map(m => m.coords[0]);
    const lngs = members.map(m => m.coords[1]);
    const sw: [number, number] = [Math.min(...lats), Math.min(...lngs)];
    const ne: [number, number] = [Math.max(...lats), Math.max(...lngs)];
    map.flyToBounds([sw, ne], { padding: [60, 60], maxZoom: 12, duration: 0.6 });
  };
  return <Marker position={position} icon={icon} eventHandlers={{ click: handleClick }} />;
}

// ---------------------------------------------------------------------------
// Sub-components — use inline styles for Leaflet popups (Tailwind doesn't apply in popups)
// ---------------------------------------------------------------------------

// ── Inline club standing badge (fetches lazily) ─────────────────────────────
function ClubStanding({ clubName, leagueName }: { clubName: string; leagueName: string | null }) {
  const sofascoreId = leagueName ? (SOFASCORE_TOURNAMENT_IDS[leagueName] ?? null) : null;
  const { data } = useSofascoreLeague(sofascoreId, null, leagueName ?? undefined);

  if (!data?.teams?.length) return null;

  const normalize = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  const cn = normalize(clubName);
  const team = data.teams.find(t =>
    normalize(t.name) === cn ||
    (t.shortName && normalize(t.shortName) === cn) ||
    normalize(t.name).includes(cn) || cn.includes(normalize(t.name))
  );

  if (!team?.position) return null;

  const medals: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
  const medal = medals[team.position] ?? null;
  const pts = team.points != null ? `${team.points} pts` : '';
  const gd = team.goalDifference != null ? `(${team.goalDifference > 0 ? '+' : ''}${team.goalDifference})` : '';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', background: 'rgba(99,102,241,.07)', borderRadius: 8, margin: '0 0 8px' }}>
      <span style={{ fontSize: 15 }}>{medal ?? `#${team.position}`}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', lineHeight: 1.2 }}>{leagueName}</div>
        <div style={{ fontSize: 10, color: '#6b7280' }}>{[pts, gd].filter(Boolean).join(' ')}</div>
      </div>
    </div>
  );
}

interface ClubPopupProps {
  club: { club: string; count: number; players: string[]; country: string; isGeolocated: boolean };
  logoUrl: string | null;
  league: string | null;
  fixingClub: string | null;
  fixCountry: string; manualLat: string; manualLng: string; fixLoading: boolean;
  onStartFix: () => void; onCancelFix: () => void;
  onFixCountryChange: (v: string) => void; onManualLatChange: (v: string) => void; onManualLngChange: (v: string) => void;
  onAutoGeocode: () => void; onManualGeocode: () => void;
  fixLocationLabel: string; fixCountryPlaceholder: string; fixAutoLabel: string;
  fixManualLabel: string; cancelLabel: string; scoutedLabel: string;
  preciseLabel: string; approxLabel: string; viewProfileLabel: string; moreLabel: string;
}

function ClubPopup({ club: c, logoUrl, league, fixingClub, fixCountry, manualLat, manualLng, fixLoading,
  onStartFix, onCancelFix, onFixCountryChange, onManualLatChange, onManualLngChange,
  onAutoGeocode, onManualGeocode,
  fixLocationLabel, fixCountryPlaceholder, fixAutoLabel, fixManualLabel,
  cancelLabel, scoutedLabel, preciseLabel, approxLabel, viewProfileLabel, moreLabel,
}: ClubPopupProps) {
  const acronym = getClubAcronym(c.club);
  const [logoError, setLogoError] = useState(false);
  const isFixing = fixingClub === c.club;

  const s = {
    wrap: { fontFamily: 'system-ui,-apple-system,sans-serif', width: 270, overflow: 'hidden' } as React.CSSProperties,
    header: { background: 'linear-gradient(135deg,#6366f1 0%,#8b5cf6 100%)', padding: '14px 14px 12px', borderRadius: '8px 8px 0 0', display: 'flex', alignItems: 'center', gap: 12 } as React.CSSProperties,
    avatar: { width: 42, height: 42, borderRadius: 10, background: 'rgba(255,255,255,.2)', border: '2px solid rgba(255,255,255,.35)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: '#fff', flexShrink: 0 } as React.CSSProperties,
    clubName: { fontWeight: 800, fontSize: 14, color: '#fff', lineHeight: 1.2 } as React.CSSProperties,
    clubSub: { fontSize: 11, color: 'rgba(255,255,255,.7)', marginTop: 2 } as React.CSSProperties,
    body: { padding: '12px 14px', background: '#fff' } as React.CSSProperties,
    statRow: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 } as React.CSSProperties,
    statPill: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, fontSize: 11, fontWeight: 600 } as React.CSSProperties,
    playerList: { marginBottom: 12 } as React.CSSProperties,
    playerRow: { display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: '1px solid #f3f4f6' } as React.CSSProperties,
    playerDot: { width: 6, height: 6, borderRadius: '50%', background: '#6366f1', flexShrink: 0 } as React.CSSProperties,
    playerName: { fontSize: 12, color: '#374151', fontWeight: 500 } as React.CSSProperties,
    more: { fontSize: 11, color: '#9ca3af', marginTop: 2 } as React.CSSProperties,
    profileBtn: { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', padding: '8px 0', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 12, fontWeight: 700, textDecoration: 'none', marginBottom: 8 } as React.CSSProperties,
    fixLink: { fontSize: 10, color: '#6366f1', background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline', display: 'block', textAlign: 'center' as const } as React.CSSProperties,
    divider: { borderTop: '1px solid #f3f4f6', marginTop: 10, paddingTop: 10 } as React.CSSProperties,
    input: { width: '100%', fontSize: 11, padding: '5px 8px', borderRadius: 6, border: '1px solid #d1d5db', marginBottom: 6, boxSizing: 'border-box' as const, outline: 'none' } as React.CSSProperties,
    btnPrimary: { width: '100%', fontSize: 11, padding: '6px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 6, fontWeight: 600 } as React.CSSProperties,
    btnSuccess: { width: '100%', fontSize: 11, padding: '6px 0', background: '#10b981', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', marginBottom: 4, fontWeight: 600 } as React.CSSProperties,
    btnCancel: { width: '100%', fontSize: 10, padding: '4px 0', background: 'transparent', border: '1px solid #e5e7eb', borderRadius: 6, cursor: 'pointer', color: '#9ca3af' } as React.CSSProperties,
  };

  return (
    <div style={s.wrap}>
      {/* ── Header gradient ── */}
      <div style={s.header}>
        <div style={s.avatar}>
          {logoUrl && !logoError ? (
            <img
              src={logoUrl}
              alt={c.club}
              onError={() => setLogoError(true)}
              style={{ width: 30, height: 30, objectFit: 'contain' }}
            />
          ) : (
            <span style={{ fontSize: acronym.length > 2 ? 12 : 15 }}>{acronym}</span>
          )}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={s.clubName}>{c.club}</div>
          <div style={s.clubSub}>
            {c.country && `${c.country} · `}{c.count} {scoutedLabel}
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div style={s.body}>
        {/* Location precision pill */}
        <div style={s.statRow}>
          {c.isGeolocated ? (
            <span style={{ ...s.statPill, background: '#dcfce7', color: '#16a34a' }}>
              📍 {preciseLabel}
            </span>
          ) : (
            <span style={{ ...s.statPill, background: '#fef9c3', color: '#ca8a04' }}>
              ⚠️ {approxLabel}
            </span>
          )}
        </div>

        {/* Championship standing */}
        <ClubStanding clubName={c.club} leagueName={league} />

        {/* Players list */}
        {c.players.length > 0 && (
          <div style={s.playerList}>
            {c.players.map((name, k) => (
              <div key={k} style={s.playerRow}>
                <div style={s.playerDot} />
                <span style={s.playerName}>{name}</span>
              </div>
            ))}
            {c.count > c.players.length && (
              <div style={s.more}>+{c.count - c.players.length} {moreLabel}…</div>
            )}
          </div>
        )}

        {/* View profile button */}
        {!isFixing && (
          <a
            href={`/club?club=${encodeURIComponent(c.club)}`}
            style={s.profileBtn}
          >
            <span>👁</span> {viewProfileLabel}
          </a>
        )}

        {/* Fix location */}
        {isFixing ? (
          <div style={s.divider}>
            <div style={{ fontSize: 11, fontWeight: 700, marginBottom: 8, color: '#6366f1' }}>📍 {fixLocationLabel}</div>
            <input type="text" placeholder={fixCountryPlaceholder} value={fixCountry}
              onChange={e => onFixCountryChange(e.target.value)} style={s.input} />
            <button onClick={onAutoGeocode} disabled={fixLoading} style={s.btnPrimary}>
              {fixLoading ? '…' : `🔄 ${fixAutoLabel}`}
            </button>
            <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
              <input type="number" placeholder="Lat" value={manualLat} onChange={e => onManualLatChange(e.target.value)}
                style={{ ...s.input, marginBottom: 0, flex: 1 }} />
              <input type="number" placeholder="Lng" value={manualLng} onChange={e => onManualLngChange(e.target.value)}
                style={{ ...s.input, marginBottom: 0, flex: 1 }} />
            </div>
            <button onClick={onManualGeocode} disabled={fixLoading || !manualLat || !manualLng}
              style={{ ...s.btnSuccess, opacity: (!manualLat || !manualLng) ? 0.45 : 1 }}>
              {fixManualLabel}
            </button>
            <button onClick={onCancelFix} style={s.btnCancel}>{cancelLabel}</button>
          </div>
        ) : (
          <button onClick={onStartFix} style={s.fixLink}>📍 {fixLocationLabel}</button>
        )}
      </div>
    </div>
  );
}

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
