import { useState, useMemo, useEffect, useRef } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { useAuth } from '@/contexts/AuthContext';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  useChampionships,
  useChampionshipPlayers,
  useAddCustomChampionship,
  useDeleteCustomChampionship,
  useLinkPlayer,
  useUnlinkPlayer,
  useSofascoreLeague,
  useRefreshStandings,
  useChampionshipCustomClubs,
  useAddChampionshipClub,
  useRemoveChampionshipClub,
  getAvailableSeasons,
  type ChampionshipEntry,
  type SofascoreTeam,
} from '@/hooks/use-championships';
import { useSavedChampionships, useSaveChampionship, useUnsaveChampionship } from '@/hooks/use-saved-championships';
import { usePlayers } from '@/hooks/use-players';
import { useIsAdmin, useMyPermissions } from '@/hooks/use-admin';
import { type Player } from '@/types/player';
import { FlagIcon } from '@/components/ui/flag-icon';
import { LeagueLogo } from '@/components/ui/league-logo';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import {
  PlusCircle, Search, Trash2, Trophy, Users, X, UserPlus, ChevronLeft,
  Building2, ExternalLink, MapPin, TrendingUp, Star, StarOff, CalendarDays, RefreshCw, Database,
  PencilLine, Plus, GripVertical, Check, AlertTriangle, StickyNote, Pencil, Loader2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDate, formatDateTime } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// ── Broadcaster mapping (French market) ─────────────────────────────────────

interface Broadcaster { name: string; url: string; color: string; bg: string }

const BROADCASTERS: Record<string, Broadcaster[]> = {
  'Ligue 1': [
    { name: 'DAZN', url: 'https://www.dazn.com/fr-FR/home', color: '#fff', bg: '#000' },
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/ligue-1/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/ligue1/', color: '#fff', bg: '#b50014' },
  ],
  'Ligue 2': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
    { name: "L'Équipe", url: 'https://www.lequipe.fr/direct/', color: '#000', bg: '#FFD700' },
  ],
  'Premier League': [
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/premier-league/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/premier-league/', color: '#fff', bg: '#b50014' },
  ],
  'EFL Championship': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'La Liga': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/la-liga/', color: '#fff', bg: '#b50014' },
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/la-liga/', color: '#fff', bg: '#0d1538' },
  ],
  'La Liga 2': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Serie A': [
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/serie-a/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/serie-a/', color: '#fff', bg: '#b50014' },
  ],
  'Serie B': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Bundesliga': [
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/bundesliga/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/bundesliga/', color: '#fff', bg: '#b50014' },
  ],
  '2. Bundesliga': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Liga Portugal': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
    { name: 'RMC Sport', url: 'https://rmcsport.bfmtv.com', color: '#fff', bg: '#e30713' },
  ],
  'Liga Portugal 2': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Eredivisie': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Jupiler Pro League': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Super Lig Turquie': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Super League Suisse': [
    { name: 'RMC Sport', url: 'https://rmcsport.bfmtv.com', color: '#fff', bg: '#e30713' },
  ],
  'Superligaen': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Allsvenskan': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Eliteserien': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Premier League Écosse': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Ekstraklasa': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Super League Grèce': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Ligue des Champions': [
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/ligue-des-champions/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/champions-league/', color: '#fff', bg: '#b50014' },
  ],
  'Europa League': [
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/europa-league/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/europa-league/', color: '#fff', bg: '#b50014' },
  ],
  'Conference League': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Copa Libertadores': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/copa-libertadores/', color: '#fff', bg: '#b50014' },
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Copa Sudamericana': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Ligue des Champions CAF': [
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/can/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Coupe du Monde': [
    { name: 'TF1', url: 'https://www.tf1plus.fr/sport', color: '#fff', bg: '#003189' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/coupe-du-monde/', color: '#fff', bg: '#b50014' },
  ],
  'Euro': [
    { name: 'M6', url: 'https://www.m6.fr/sport/', color: '#fff', bg: '#f47920' },
    { name: 'TF1', url: 'https://www.tf1plus.fr/sport', color: '#fff', bg: '#003189' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/euro/', color: '#fff', bg: '#b50014' },
  ],
  'Copa America': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/copa-america/', color: '#fff', bg: '#b50014' },
  ],
  'CAN': [
    { name: 'Canal+', url: 'https://www.canalplus.com/sport/can/', color: '#fff', bg: '#0d1538' },
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/can/', color: '#fff', bg: '#b50014' },
  ],
  'MLS': [
    { name: 'Apple TV+', url: 'https://tv.apple.com/channel/tvs.sbd.4000', color: '#fff', bg: '#1c1c1e' },
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Liga MX': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Liga Profesional Argentina': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Primera División Uruguay': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Saudi Pro League': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/saudi-pro-league/', color: '#fff', bg: '#b50014' },
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Stars League Qatar': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'UAE Pro League': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Persian Gulf Pro League': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'J1 League': [
    { name: 'DAZN', url: 'https://www.dazn.com/fr-FR/home', color: '#fff', bg: '#000' },
  ],
  'K League 1': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Chinese Super League': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Indian Super League': [
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'A-League Men': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Egyptian Premier League': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Botola Pro Maroc': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
    { name: 'Canal+', url: 'https://www.canalplus.com', color: '#fff', bg: '#0d1538' },
  ],
  'Ligue 1 Algérie': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
  'Ligue Professionnelle 1 Tunisie': [
    { name: 'beIN Sports', url: 'https://www.beinsports.com/fr/', color: '#fff', bg: '#b50014' },
  ],
};

// ── Logo components ─────────────────────────────────────────────────────────

function ClubLogo({ src, name, size = 'md' }: { src?: string | null; name: string; size?: 'sm' | 'md' | 'lg' }) {
  const [error, setError] = useState(false);
  const dims = size === 'lg' ? 'w-16 h-16' : size === 'md' ? 'w-10 h-10' : 'w-7 h-7';
  const textSize = size === 'lg' ? 'text-xl' : size === 'md' ? 'text-sm' : 'text-[10px]';
  if (src && !error) {
    return <img src={src} alt={name} className={cn(dims, 'object-contain shrink-0')} onError={() => setError(true)} />;
  }
  return (
    <div className={cn(dims, 'rounded-lg bg-muted flex items-center justify-center font-bold text-muted-foreground shrink-0', textSize)}>
      {name.charAt(0)}
    </div>
  );
}

// ── Broadcasters bar ────────────────────────────────────────────────────────

function BroadcastersBar({ championshipName }: { championshipName: string }) {
  const list = BROADCASTERS[championshipName];
  if (!list || list.length === 0) return null;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs text-muted-foreground font-medium whitespace-nowrap">Où regarder :</span>
      {list.map(b => (
        <a
          key={b.name}
          href={b.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full transition-opacity hover:opacity-80"
          style={{ backgroundColor: b.bg, color: b.color }}
        >
          {b.name}
          <ExternalLink className="w-2.5 h-2.5 opacity-70" />
        </a>
      ))}
    </div>
  );
}

// ── Data hooks ───────────────────────────────────────────────────────────────

function useClubLogosMap() {
  return useQuery({
    queryKey: ['club-logos-map'],
    staleTime: 10 * 60 * 1000,
    queryFn: async (): Promise<Record<string, string>> => {
      const res = await fetch(`${API_BASE}/club-logos`);
      if (!res.ok) return {};
      const data: { club_name: string; logo_url: string }[] = await res.json();
      const map: Record<string, string> = {};
      for (const item of data) {
        if (item.club_name && item.logo_url) map[item.club_name.toLowerCase()] = item.logo_url;
      }
      return map;
    },
  });
}

interface TmClubData {
  clubId: string;
  clubName: string;
  badge: string | null;
  league: string | null;
  country: string | null;
  stadium: string | null;
  squadSize: number | null;
  avgAge: string | null;
  marketValue: string | null;
  tmUrl: string | null;
  founded: string | null;
}

function useClubTmData(clubName: string | null) {
  return useQuery<TmClubData | null>({
    queryKey: ['club-tm-quick', clubName],
    enabled: !!clubName,
    staleTime: 24 * 60 * 60 * 1000,
    retry: false,
    queryFn: async () => {
      if (!clubName) return null;
      try {
        const searchRes = await fetch(`${API_BASE}/club-tm-search?q=${encodeURIComponent(clubName)}`);
        if (!searchRes.ok) return null;
        const matches = await searchRes.json();
        const match = Array.isArray(matches) ? matches[0] : null;
        if (!match?.clubId) return null;
        const detailRes = await fetch(`${API_BASE}/club-tm/${match.clubId}`);
        if (!detailRes.ok) return null;
        return detailRes.json();
      } catch { return null; }
    },
  });
}

// ── Club panel (rich drawer) ─────────────────────────────────────────────────

interface SelectedClub { name: string; logoUrl?: string }

function ClubPanel({
  club,
  onClose,
  getClubPlayers,
}: {
  club: SelectedClub;
  onClose: () => void;
  getClubPlayers: (name: string) => Player[];
}) {
  const { t } = useTranslation();
  const { data: tmData, isLoading: tmLoading } = useClubTmData(club.name);
  const myPlayers = getClubPlayers(club.name);
  const logo = club.logoUrl || tmData?.badge || null;

  const stats = tmData ? [
    { icon: MapPin,       label: t('championships.stat_stadium'),  value: tmData.stadium },
    { icon: Users,        label: t('championships.stat_squad'),     value: tmData.squadSize != null ? String(tmData.squadSize) : null },
    { icon: TrendingUp,   label: t('championships.stat_avg_age'),   value: tmData.avgAge },
    { icon: Star,         label: t('championships.stat_value'),     value: tmData.marketValue },
    { icon: CalendarDays, label: t('championships.stat_founded'),   value: tmData.founded },
  ].filter(s => s.value) : [];

  return (
    <div className="rounded-xl border bg-card overflow-hidden">
      {/* Header */}
      <div className="p-4 md:p-5 bg-gradient-to-r from-primary/5 to-transparent flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <ClubLogo src={logo} name={club.name} size="md" />
          <div className="min-w-0">
            <h3 className="font-bold text-base truncate">{club.name}</h3>
            {tmData && (
              <p className="text-xs text-muted-foreground truncate">
                {[tmData.league, tmData.country].filter(Boolean).join(' · ')}
              </p>
            )}
            {tmLoading && <p className="text-xs text-muted-foreground animate-pulse">{t('common.loading')}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to={`/club?club=${encodeURIComponent(club.name)}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <ExternalLink className="w-3 h-3" />
            {t('championships.view_club_profile')}
          </Link>
          {tmData?.tmUrl && (
            <a
              href={tmData.tmUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border hover:bg-muted transition-colors"
            >
              TM
            </a>
          )}
          <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* TM stats */}
      {(tmLoading || stats.length > 0) && (
        <div className="px-4 md:px-5 py-3 border-t">
          {tmLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[...Array(4)].map((_, i) => <div key={i} className="h-10 rounded bg-muted animate-pulse" />)}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              {stats.map((s, i) => (
                <div key={i} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <s.icon className="w-3 h-3 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[10px] text-muted-foreground">{s.label}</p>
                    <p className="text-xs font-semibold truncate">{s.value}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* My players */}
      <div className="px-4 md:px-5 pb-4 pt-3 border-t space-y-3">
        <h4 className="text-sm font-semibold flex items-center gap-2">
          <Users className="w-4 h-4 text-primary" />
          {t('championships.my_players_in_club', { count: myPlayers.length })}
        </h4>
        {myPlayers.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('championships.no_players_in_club')}</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {myPlayers.map(p => (
              <a
                key={p.id}
                href={`/player/${p.id}`}
                className="flex items-center gap-3 rounded-lg border bg-background p-3 hover:bg-accent/50 transition-colors"
              >
                {p.photo_url ? (
                  <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                    {p.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{p.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{p.position} — {p.nationality}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Club name autocomplete input ─────────────────────────────────────────────

function ClubNameInput({ value, onChange, suggestions }: { value: string; onChange: (v: string) => void; suggestions: string[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    if (!value.trim()) return suggestions.slice(0, 8);
    const q = value.toLowerCase();
    return suggestions.filter(s => s.toLowerCase().includes(q)).slice(0, 8);
  }, [value, suggestions]);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div ref={ref} className="relative w-full min-w-[130px]">
      <input
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Nom de l'équipe"
        className="border rounded px-2 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary w-full"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 left-0 top-full mt-0.5 w-full max-h-44 overflow-y-auto bg-popover border rounded-lg shadow-lg text-xs">
          {filtered.map(s => (
            <li
              key={s}
              onMouseDown={e => { e.preventDefault(); onChange(s); setOpen(false); }}
              className={cn('px-2 py-1.5 cursor-pointer hover:bg-muted transition-colors truncate', s === value && 'bg-primary/10 font-medium')}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Manual standings modal ────────────────────────────────────────────────────

interface ManualTeam {
  key: string; // local key for React list
  name: string;
  points: number | '';
  played: number | '';
  wins: number | '';
  draws: number | '';
  losses: number | '';
  goalsFor: number | '';
  goalsAgainst: number | '';
  zone: string; // 'none' | 'champions_league' | 'europa_league' | 'conference_league' | 'playoff' | 'relegation' | 'promotion'
}

const ZONE_OPTIONS = [
  { value: 'none', label: '—' },
  { value: 'champions_league', label: 'Ligue des Champions', color: '#3b82f6' },
  { value: 'europa_league', label: 'Europa League', color: '#fb923c' },
  { value: 'conference_league', label: 'Conférence League', color: '#4ade80' },
  { value: 'promotion', label: 'Promotion', color: '#22c55e' },
  { value: 'playoff', label: 'Barrages / Play-off', color: '#facc15' },
  { value: 'relegation', label: 'Relégation', color: '#ef4444' },
];

const ZONE_COLORS: Record<string, string> = {
  champions_league: '#3b82f6',
  europa_league: '#fb923c',
  conference_league: '#4ade80',
  promotion: '#22c55e',
  playoff: '#facc15',
  relegation: '#ef4444',
};

function emptyTeam(): ManualTeam {
  return {
    key: Math.random().toString(36).slice(2),
    name: '', points: '', played: '', wins: '', draws: '', losses: '', goalsFor: '', goalsAgainst: '',
    zone: 'none',
  };
}

function teamFromSofascore(t: SofascoreTeam): ManualTeam {
  const zoneDesc = (t.description ?? '').toLowerCase();
  const zone =
    zoneDesc.includes('champion') ? 'champions_league' :
    zoneDesc.includes('europa') && !zoneDesc.includes('conf') ? 'europa_league' :
    zoneDesc.includes('conf') ? 'conference_league' :
    zoneDesc.includes('promot') ? 'promotion' :
    zoneDesc.includes('playoff') || zoneDesc.includes('play-off') || zoneDesc.includes('barrage') ? 'playoff' :
    zoneDesc.includes('relég') || zoneDesc.includes('relega') ? 'relegation' :
    'none';
  return {
    key: Math.random().toString(36).slice(2),
    name: t.name ?? '',
    points: t.points ?? '',
    played: t.played ?? '',
    wins: t.wins ?? '',
    draws: t.draws ?? '',
    losses: t.losses ?? '',
    goalsFor: t.goalsFor ?? '',
    goalsAgainst: t.goalsAgainst ?? '',
    zone,
  };
}

function ManualStandingsModal({
  champ,
  seasonYear,
  currentTeams,
  onClose,
  onSaved,
}: {
  champ: ChampionshipEntry;
  seasonYear: number;
  currentTeams: SofascoreTeam[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [teams, setTeams] = useState<ManualTeam[]>(() =>
    currentTeams.length > 0 ? currentTeams.map(teamFromSofascore) : [emptyTeam()]
  );
  const [seasonDisplay, setSeasonDisplay] = useState(`${seasonYear}–${String(seasonYear + 1).slice(2)}`);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const updateTeam = (idx: number, field: keyof ManualTeam, val: string | number) => {
    setTeams(prev => prev.map((t, i) => i === idx ? { ...t, [field]: val } : t));
  };

  const addRow = () => setTeams(prev => [...prev, emptyTeam()]);
  const removeRow = (idx: number) => setTeams(prev => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    const valid = teams.filter(t => t.name.trim());
    if (!valid.length) { setError('Ajoutez au moins une équipe.'); return; }
    setSaving(true); setError(null);
    try {
      const payload = {
        championshipName: champ.name,
        seasonYear,
        seasonDisplayName: seasonDisplay,
        teams: valid.map((t, i) => ({
          position: i + 1,
          name: t.name.trim(),
          points: Number(t.points) || 0,
          played: Number(t.played) || 0,
          wins: Number(t.wins) || 0,
          draws: Number(t.draws) || 0,
          losses: Number(t.losses) || 0,
          goalsFor: Number(t.goalsFor) || 0,
          goalsAgainst: Number(t.goalsAgainst) || 0,
          goalDifference: (Number(t.goalsFor) || 0) - (Number(t.goalsAgainst) || 0),
          description: t.zone !== 'none' ? t.zone : null,
          noteColor: t.zone !== 'none' ? (ZONE_COLORS[t.zone] ?? null) : null,
        })),
      };
      const resp = await fetch('/api/championships/manual-standings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      if (!resp.ok) {
        const d = await resp.json().catch(() => ({}));
        throw new Error(d.error || `HTTP ${resp.status}`);
      }
      setSaved(true);
      setTimeout(() => { onSaved(); onClose(); }, 800);
    } catch (e: any) {
      setError(e.message || 'Erreur');
    } finally {
      setSaving(false);
    }
  };

  const numField = (idx: number, field: keyof ManualTeam, w = 'w-12') => (
    <input
      type="number" min={0}
      value={teams[idx][field] as number | ''}
      onChange={e => updateTeam(idx, field, e.target.value === '' ? '' : Number(e.target.value))}
      className={cn('border rounded px-1 py-0.5 text-center text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary', w)}
    />
  );

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-background rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b shrink-0">
          <div>
            <h2 className="text-lg font-bold flex items-center gap-2">
              <PencilLine className="w-5 h-5 text-primary" />
              Compléter le classement
            </h2>
            <p className="text-sm text-muted-foreground">{champ.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Season display name */}
        <div className="px-6 py-3 border-b shrink-0 flex items-center gap-3 flex-wrap">
          <label className="text-sm font-medium whitespace-nowrap">Nom de la saison :</label>
          <input
            value={seasonDisplay}
            onChange={e => setSeasonDisplay(e.target.value)}
            className="border rounded-lg px-3 py-1.5 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary max-w-[160px]"
            placeholder="ex: 2025–26"
          />
          <span className="text-xs text-muted-foreground">Année : {seasonYear}</span>
        </div>

        {/* Teams table */}
        <div className="overflow-auto flex-1 px-2">
          <table className="w-full text-xs mt-2">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="text-muted-foreground border-b">
                <th className="px-2 py-1.5 w-6"></th>
                <th className="text-left px-2 py-1.5">#</th>
                <th className="text-left px-2 py-1.5 min-w-[140px]">Équipe *</th>
                <th className="px-2 py-1.5 w-14">Pts</th>
                <th className="px-2 py-1.5 w-12">MJ</th>
                <th className="px-2 py-1.5 w-10">V</th>
                <th className="px-2 py-1.5 w-10">N</th>
                <th className="px-2 py-1.5 w-10">D</th>
                <th className="px-2 py-1.5 w-10">B+</th>
                <th className="px-2 py-1.5 w-10">B-</th>
                <th className="px-2 py-1.5 w-36 text-left">Zone</th>
                <th className="px-2 py-1.5 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {teams.map((team, i) => (
                <tr key={team.key} className="border-b border-border/30 hover:bg-muted/20">
                  <td className="px-2 py-1 text-muted-foreground/40">
                    <GripVertical className="w-3 h-3" />
                  </td>
                  <td className="px-2 py-1 text-muted-foreground font-mono text-center">{i + 1}</td>
                  <td className="px-2 py-1">
                    <ClubNameInput
                      value={team.name}
                      onChange={v => updateTeam(i, 'name', v)}
                      suggestions={champ.clubs}
                    />
                  </td>
                  <td className="px-1 py-1 text-center">{numField(i, 'points', 'w-14')}</td>
                  <td className="px-1 py-1 text-center">{numField(i, 'played')}</td>
                  <td className="px-1 py-1 text-center">{numField(i, 'wins', 'w-10')}</td>
                  <td className="px-1 py-1 text-center">{numField(i, 'draws', 'w-10')}</td>
                  <td className="px-1 py-1 text-center">{numField(i, 'losses', 'w-10')}</td>
                  <td className="px-1 py-1 text-center">{numField(i, 'goalsFor', 'w-10')}</td>
                  <td className="px-1 py-1 text-center">{numField(i, 'goalsAgainst', 'w-10')}</td>
                  <td className="px-1 py-1">
                    <div className="flex items-center gap-1">
                      {team.zone !== 'none' && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: ZONE_COLORS[team.zone] }} />
                      )}
                      <select
                        value={team.zone}
                        onChange={e => updateTeam(i, 'zone', e.target.value)}
                        className="border rounded px-1 py-0.5 text-xs bg-background focus:outline-none focus:ring-1 focus:ring-primary flex-1"
                      >
                        {ZONE_OPTIONS.map(z => <option key={z.value} value={z.value}>{z.label}</option>)}
                      </select>
                    </div>
                  </td>
                  <td className="px-2 py-1">
                    <button onClick={() => removeRow(i)} className="text-muted-foreground/50 hover:text-red-500 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <button
            onClick={addRow}
            className="mx-2 my-3 flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Ajouter une équipe
          </button>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t shrink-0 flex items-center justify-between gap-3">
          <div className="flex-1">
            {error && (
              <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" />{error}</p>
            )}
            <p className="text-xs text-muted-foreground">Les données saisies manuellement sont <strong>prioritaires</strong> sur les données API.</p>
          </div>
          <div className="flex gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>Annuler</Button>
            <Button size="sm" onClick={handleSave} disabled={saving} className={cn(saved && 'bg-green-600 hover:bg-green-600')}>
              {saved ? <><Check className="w-4 h-4 mr-1" />Sauvegardé</> : saving ? 'Enregistrement…' : 'Enregistrer'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Championship detail sub-page ─────────────────────────────────────────────

function ChampionshipDetail({
  champ,
  onBack,
  initialTab,
  initialSeason,
}: {
  champ: ChampionshipEntry;
  onBack: () => void;
  initialTab?: 'standings' | 'clubs' | 'players' | 'notes' | 'calendar';
  initialSeason?: number;
}) {
  const { t } = useTranslation();
  const { dateFormat, timeFormat, timezone } = useUiPreferences();
  const { data: players = [] } = usePlayers();
  const { data: linkedPlayers = [] } = useChampionshipPlayers(champ.name);
  const availableSeasons = useMemo(() => getAvailableSeasons(6), []);
  const [seasonYear, setSeasonYear] = useState<number | null>(initialSeason ?? null); // null = current
  const { data: sofaData, isLoading: sofaLoading, refetch: refetchStandings } = useSofascoreLeague(champ.sofascoreId, seasonYear, champ.name);
  const refreshStandings = useRefreshStandings();

  // Moderator / admin check
  const { data: isAdmin } = useIsAdmin();
  const { data: permsData } = useMyPermissions();
  const canManageStandings = isAdmin || permsData?.roles?.some(r => r.toLowerCase().includes('mod'));
  const [manualModalOpen, setManualModalOpen] = useState(false);

  // Custom clubs (mod-added)
  const { data: customClubs = [] } = useChampionshipCustomClubs(champ.name);
  const addClub = useAddChampionshipClub();
  const removeClub = useRemoveChampionshipClub();
  const [newClubInput, setNewClubInput] = useState('');
  const [clubInputOpen, setClubInputOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const now = new Date();
  const currentSeasonYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  const isCurrentSeason = !seasonYear || seasonYear >= currentSeasonYear;

  const handleRefresh = async () => {
    if (!champ.sofascoreId || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await refreshStandings(champ.sofascoreId, seasonYear);
      toast.success(t('championships.standings_refreshed'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setIsRefreshing(false);
    }
  };
  const { data: logosMap = {} } = useClubLogosMap();
  const linkPlayer = useLinkPlayer();
  const unlinkPlayer = useUnlinkPlayer();
  const { data: savedChamps = [] } = useSavedChampionships();
  const saveChamp = useSaveChampionship();
  const unsaveChamp = useUnsaveChampionship();
  const isSaved = savedChamps.some(s => s.championship_name === champ.name);
  const [justSaved, setJustSaved] = useState(false);
  const [playerSearch, setPlayerSearch] = useState('');
  const [tab, setTab] = useState<'standings' | 'clubs' | 'players' | 'notes' | 'calendar'>(initialTab ?? 'standings');

  // ── Calendar: match schedule from Sofascore ──────────────────────────────
  // ── Calendar: normalised match shape used by both TM and Sofascore sources ──
  interface CalendarMatch {
    id?: number | string;
    homeTeam: { id?: number | string; name: string; logo: string | null; badge?: string | null };
    awayTeam: { id?: number | string; name: string; logo: string | null; badge?: string | null };
    homeScore: number | null;
    awayScore: number | null;
    startDate: string | null;
    startTimestamp?: number | null;
    hasDate: boolean;
    hasTime?: boolean;
    finished: boolean;
    inProgress?: boolean;
    notStarted: boolean;
    isManual?: boolean;
  }
  interface CalendarRound { round: number; name: string; matches?: CalendarMatch[]; events?: CalendarMatch[] }
  interface CalendarData {
    currentRound: number;
    seasonLabel?: string;
    seasonName?: string;
    rounds: CalendarRound[];
    source?: string;
    scraped_at?: string;
    // set by frontend when server returns no_data_for_season
    noData?: boolean;
    noDataSeason?: number;
  }

  // ── Calendar: always Transfermarkt (DB-backed) ───────────────────────────────
  const queryClient = useQueryClient();
  const calendarQueryKey = ['championship-calendar-tm', champ.name, seasonYear] as const;
  const { data: calendarData, isLoading: calendarFetching } = useQuery<CalendarData | null>({
    queryKey: calendarQueryKey,
    queryFn: async () => {
      const params = new URLSearchParams({ name: champ.name });
      if (seasonYear) params.set('season', String(seasonYear));
      const res = await fetch(`${API_BASE}/championship-calendar-tm?${params}`, { credentials: 'include', cache: 'no-store' });
      if (res.status === 404) {
        const body = await res.json().catch(() => ({}));
        if (body.error === 'no_data_for_season') {
          return { noData: true, noDataSeason: body.season ?? seasonYear, currentRound: 0, rounds: [] };
        }
      }
      if (!res.ok) return null;
      return res.json();
    },
    enabled: tab === 'calendar',
    staleTime: 0, // always refetch to ensure DB IDs are present for editing
  });

  // Admin: force re-scrape from TM
  const refreshCalendar = useMutation({
    mutationFn: async () => {
      const params = new URLSearchParams({ name: champ.name });
      if (seasonYear) params.set('season', String(seasonYear));
      const res = await fetch(`${API_BASE}/championship-calendar/refresh?${params}`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'refresh_failed'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: calendarQueryKey });
      toast.success('Calendrier mis à jour depuis Transfermarkt');
    },
    onError: (e: Error) => toast.error(`Erreur : ${e.message}`),
  });

  // Admin: inline match editing — holds full match context for upsert by composite key
  interface EditingMatch {
    dbId: number | null;
    round: number;
    roundName: string;
    homeTeamName: string;
    homeTeamBadge: string | null;
    homeTeamTmId: string | null;
    awayTeamName: string;
    awayTeamBadge: string | null;
    awayTeamTmId: string | null;
    hasExistingData: boolean; // has score or date scraped from TM (not manual)
  }
  const [editingMatch, setEditingMatch] = useState<EditingMatch | null>(null);
  const [editForm, setEditForm] = useState({ homeScore: '', awayScore: '', finished: false, startDate: '', startTime: '', hasTime: false });

  const currentSeasonYearFallback = new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1;

  const saveMatchEdit = useMutation({
    mutationFn: async () => {
      if (!editingMatch) return;
      const hs = editForm.homeScore !== '' ? parseInt(editForm.homeScore) : null;
      const as_ = editForm.awayScore !== '' ? parseInt(editForm.awayScore) : null;
      const sd = editForm.startDate
        ? `${editForm.startDate}${editForm.hasTime && editForm.startTime ? 'T' + editForm.startTime + ':00' : 'T00:00:00'}`
        : null;
      const body = { homeScore: hs, awayScore: as_, finished: editForm.finished, startDate: sd, hasTime: editForm.hasTime };

      let res: Response;
      if (editingMatch.dbId) {
        // Has DB ID — direct update
        res = await fetch(`${API_BASE}/championship-calendar/match/${editingMatch.dbId}`, {
          method: 'PUT', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        // No DB ID yet (data from live scrape cache) — upsert by composite key
        res = await fetch(`${API_BASE}/championship-calendar/match`, {
          method: 'POST', credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            championshipName: champ.name,
            seasonYear: seasonYear ?? currentSeasonYearFallback,
            roundNumber: editingMatch.round,
            roundName: editingMatch.roundName,
            homeTeamName: editingMatch.homeTeamName,
            homeTeamBadge: editingMatch.homeTeamBadge,
            homeTeamId: editingMatch.homeTeamTmId,
            awayTeamName: editingMatch.awayTeamName,
            awayTeamBadge: editingMatch.awayTeamBadge,
            awayTeamId: editingMatch.awayTeamTmId,
            ...body,
          }),
        });
      }
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b.error || 'save_failed'); }
      return res.json();
    },
    onSuccess: () => {
      queryClient.refetchQueries({ queryKey: calendarQueryKey });
      setEditingMatch(null);
      toast.success('Match mis à jour');
    },
    onError: (e: Error) => toast.error(`Erreur : ${e.message}`),
  });

  const calendarLoading = calendarFetching;

  // Normalise round matches (TM uses "matches" field)
  function getRoundMatches(r: CalendarRound): CalendarMatch[] {
    return (r.matches ?? r.events ?? []) as CalendarMatch[];
  }

  // Championship search inside calendar tab
  const [calendarSearch, setCalendarSearch] = useState('');
  const { data: allChamps = [] } = useChampionships();
  const calendarSearchResults = useMemo(() => {
    const q = calendarSearch.toLowerCase().trim();
    if (!q) return [];
    return allChamps.filter(c =>
      c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [calendarSearch, allChamps]);

  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const calendarAvailable = calendarData && !calendarData.noData;
  const activeRound = selectedRound ?? (calendarAvailable ? calendarData.currentRound : 1);
  const activeRoundData = calendarAvailable ? (calendarData.rounds.find(r => r.round === activeRound) ?? null) : null;

  // ── Scouting notes — notepad par utilisateur ──
  interface ChampNote { id: number; content: string; rating: number | null; created_at: string; updated_at: string; user_id: string; author_name: string; }
  const { user: currentUser } = useAuth();
  const { data: notesData, refetch: refetchNotes } = useQuery<{ notes: ChampNote[] }>({
    queryKey: ['championship-notes', champ.name, currentUser?.id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/championship-notes?name=${encodeURIComponent(champ.name)}`, { credentials: 'include' });
      if (!res.ok) return { notes: [] };
      return res.json();
    },
    staleTime: 0,
    enabled: !!currentUser?.id && !!champ.name,
  });
  // Derive server note for current user — recalculates whenever notesData or user changes
  const myChampNote = useMemo(
    () => notesData?.notes?.find(n => String(n.user_id) === String(currentUser?.id)) ?? null,
    [notesData, currentUser?.id],
  );
  const teamChampNotes = useMemo(
    () => notesData?.notes?.filter(n => String(n.user_id) !== String(currentUser?.id)) ?? [],
    [notesData, currentUser?.id],
  );

  // Draft state: undefined = no local edit (show server value), otherwise show local edit.
  // This pattern ensures the saved note is visible immediately on revisit (no useEffect race).
  const [draftText, setDraftText] = useState<string | undefined>(undefined);
  const [draftRating, setDraftRating] = useState<number | null | undefined>(undefined);

  const noteDirty = draftText !== undefined || draftRating !== undefined;
  const noteText  = draftText   !== undefined ? draftText   : (myChampNote?.content ?? '');
  const noteRating = draftRating !== undefined ? draftRating : (myChampNote?.rating  ?? null);

  const clearDraft = () => { setDraftText(undefined); setDraftRating(undefined); };

  const saveNote = useMutation({
    mutationFn: async ({ content, rating }: { content: string; rating: number | null }) => {
      const res = await fetch(`${API_BASE}/championship-notes`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: champ.name, content, rating, id: myChampNote?.id }),
      });
      if (!res.ok) { const b = await res.json().catch(() => ({})); throw new Error(b?.error || 'save_failed'); }
    },
    onSuccess: async () => { await refetchNotes(); clearDraft(); toast.success('Note enregistrée'); },
    onError: (err: Error) => toast.error(`Erreur : ${err.message}`),
  });
  const deleteNote = useMutation({
    mutationFn: async (id: number) => {
      await fetch(`${API_BASE}/championship-notes/${id}`, { method: 'DELETE', credentials: 'include' });
    },
    onSuccess: async () => { await refetchNotes(); clearDraft(); },
    onError: () => toast.error('Erreur lors de la suppression'),
  });
  const [selectedClub, setSelectedClub] = useState<SelectedClub | null>(null);
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleToggleSave = () => {
    if (isSaved) {
      unsaveChamp.mutate(champ.name, {
        onSuccess: () => toast.success(t('championships.unbookmarked', { name: champ.name })),
      });
    } else {
      saveChamp.mutate(
        { championship_name: champ.name, championship_country: champ.country, championship_logo: champ.logoUrl, sofascore_id: champ.sofascoreId },
        {
          onSuccess: () => {
            toast.success(t('championships.bookmarked', { name: champ.name }));
            setJustSaved(true);
            if (animTimerRef.current) clearTimeout(animTimerRef.current);
            animTimerRef.current = setTimeout(() => setJustSaved(false), 1200);
          },
        }
      );
    }
  };

  const getEffectiveLeague = (p: Player): string =>
    ((p.external_data?.enriched_league ?? p.league) ?? '').trim();
  const getEffectiveClub = (p: Player): string =>
    ((p.external_data?.enriched_club ?? p.club) ?? '').trim();

  const leaguePlayerIds = useMemo<Set<string>>(() => {
    const champLower = champ.name.toLowerCase();
    return new Set<string>(
      players.filter(p => getEffectiveLeague(p).toLowerCase() === champLower).map(p => p.id),
    );
  }, [players, champ.name]);

  const manualLinkedIds = useMemo<Set<string>>(() => new Set<string>(linkedPlayers.map(lp => lp.player_id)), [linkedPlayers]);
  const allLinkedIds = useMemo<Set<string>>(() => new Set<string>([...Array.from(leaguePlayerIds), ...Array.from(manualLinkedIds)]), [leaguePlayerIds, manualLinkedIds]);
  const allLinkedPlayers = useMemo(() => players.filter(p => allLinkedIds.has(p.id)), [players, allLinkedIds]);

  const availablePlayers = useMemo(
    () => players.filter(p =>
      !allLinkedIds.has(p.id) &&
      p.name.toLowerCase().includes(playerSearch.toLowerCase()),
    ).slice(0, 20),
    [players, allLinkedIds, playerSearch],
  );

  const playersByClub = useMemo(() => {
    const map: Record<string, typeof players> = {};
    for (const p of players) {
      const c = getEffectiveClub(p);
      if (c) (map[c] ??= []).push(p);
    }
    return map;
  }, [players]);

  const clubPlayerCount = (clubName: string): number => {
    if (playersByClub[clubName]) return playersByClub[clubName].length;
    const lower = clubName.toLowerCase();
    for (const [k, v] of Object.entries(playersByClub)) {
      if (k.toLowerCase() === lower) return v.length;
    }
    return 0;
  };

  const getClubPlayers = (clubName: string): Player[] => {
    if (playersByClub[clubName]) return playersByClub[clubName];
    const lower = clubName.toLowerCase();
    for (const [k, v] of Object.entries(playersByClub)) {
      if (k.toLowerCase() === lower) return v;
    }
    return [];
  };

  // Resolve logo for a club name (SofaScore already provides logoUrl on team objects)
  const getStaticClubLogo = (clubName: string): string | undefined =>
    logosMap[clubName.toLowerCase()];

  const handleLink = async (playerId: string) => {
    try {
      await linkPlayer.mutateAsync({ championshipName: champ.name, playerId });
      toast.success(t('championships.player_linked'));
    } catch { toast.error(t('common.error')); }
  };
  const handleUnlink = async (playerId: string) => {
    try {
      await unlinkPlayer.mutateAsync({ championshipName: champ.name, playerId });
      toast.success(t('championships.player_unlinked'));
    } catch { toast.error(t('common.error')); }
  };

  const teams: SofascoreTeam[] = sofaData?.teams ?? [];
  const staticClubs = champ.clubs;
  const hasStandings = teams.length > 0 && teams[0].points !== undefined;

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <button onClick={onBack} className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors">
        <ChevronLeft className="w-4 h-4" /> {t('championships.back')}
      </button>

      {/* Header */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="w-14 h-14 flex items-center justify-center shrink-0">
          <LeagueLogo league={champ.name} size="lg" />
        </div>
        <div className="flex-1 min-w-0 space-y-1.5">
          <h1 className="text-2xl font-bold">{champ.name}</h1>
          <p className="text-sm text-muted-foreground flex items-center gap-1.5">
            <FlagIcon nationality={champ.country} size="sm" />
            {champ.country}
            {sofaData?.season?.name && ` — ${sofaData.season.name}`}
          </p>
          <BroadcastersBar championshipName={champ.name} />
        </div>

        {/* Season selector — only shown for leagues with SofaScore standings */}
        {champ.sofascoreId && (
          <div className="shrink-0">
            <Select
              value={seasonYear != null ? String(seasonYear) : 'current'}
              onValueChange={v => setSeasonYear(v === 'current' ? null : Number(v))}
            >
              <SelectTrigger className="h-9 text-sm min-w-[110px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="current">{t('championships.current_season')}</SelectItem>
                {availableSeasons.map(s => (
                  <SelectItem key={s.year} value={String(s.year)}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="relative shrink-0">
          {/* Burst particles on save */}
          {justSaved && (
            <span className="absolute inset-0 pointer-events-none" aria-hidden>
              {['⭐','✨','🌟','💛','⭐'].map((e, i) => (
                <span
                  key={i}
                  className="absolute text-sm animate-star-burst"
                  style={{
                    left: '50%', top: '50%',
                    '--angle': `${i * 72}deg`,
                    '--dist': '28px',
                    animationDelay: `${i * 40}ms`,
                  } as React.CSSProperties}
                >{e}</span>
              ))}
            </span>
          )}
          <Button
            variant={isSaved ? 'default' : 'outline'}
            size="sm"
            onClick={handleToggleSave}
            disabled={saveChamp.isPending || unsaveChamp.isPending}
            className={cn(
              'rounded-xl gap-2 transition-all duration-300',
              isSaved
                ? 'bg-yellow-500 hover:bg-yellow-600 border-yellow-500 text-white shadow-lg shadow-yellow-500/30'
                : 'hover:border-yellow-400 hover:text-yellow-600',
              justSaved && 'scale-110',
            )}
          >
            <Star className={cn('w-4 h-4 transition-all duration-300', isSaved && 'fill-current', justSaved && 'animate-spin-once')} />
            {isSaved ? t('championships.unbookmark') : t('championships.bookmark')}
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b overflow-x-auto">
        <button
          onClick={() => setTab('standings')}
          className={cn(
            'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'standings' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Trophy className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t('championships.standings')}
        </button>
        <button
          onClick={() => setTab('clubs')}
          className={cn(
            'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'clubs' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Building2 className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t('championships.clubs')} ({teams.length || staticClubs.length})
        </button>
        <button
          onClick={() => setTab('players')}
          className={cn(
            'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'players' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <Users className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t('championships.linked_players')} ({allLinkedPlayers.length})
        </button>
        <button
          onClick={() => setTab('notes')}
          className={cn(
            'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px flex items-center gap-1.5',
            tab === 'notes' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <StickyNote className="w-4 h-4 -mt-0.5" />
          Notes
          {(notesData?.notes?.length ?? 0) > 0 && (
            <span className="text-[10px] font-bold bg-primary/15 text-primary px-1.5 py-0.5 rounded-full">{notesData!.notes.length}</span>
          )}
        </button>
        <button
          onClick={() => setTab('calendar')}
          className={cn(
            'shrink-0 whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px',
            tab === 'calendar' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground',
          )}
        >
          <CalendarDays className="w-4 h-4 inline mr-1.5 -mt-0.5" />
          {t('championships.calendar_tab')}
        </button>
      </div>

      {/* ── Standings tab ── */}
      {tab === 'standings' && (
        <div className="space-y-4">
          {sofaLoading ? (
            <div className="space-y-2">
              {[...Array(10)].map((_, i) => <div key={i} className="h-11 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : !hasStandings ? (
            <div className="text-center py-12 text-muted-foreground space-y-4">
              <Trophy className="w-10 h-10 mx-auto opacity-20" />
              <div>
                <p className="text-sm">{t('championships.no_standings')}</p>
                {!champ.sofascoreId && (
                  <p className="text-xs mt-1 opacity-60">{t('championships.no_sofascore_id')}</p>
                )}
              </div>
              {canManageStandings && (
                <Button size="sm" variant="outline" onClick={() => setManualModalOpen(true)} className="gap-2 mx-auto">
                  <PencilLine className="w-4 h-4" /> Compléter le classement
                </Button>
              )}
              {BROADCASTERS[champ.name] && (
                <div className="flex flex-col items-center gap-2 pt-2">
                  <p className="text-xs font-medium">Suivre le championnat :</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {BROADCASTERS[champ.name].map(b => (
                      <a key={b.name} href={b.url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full transition-opacity hover:opacity-80"
                        style={{ backgroundColor: b.bg, color: b.color }}>
                        {b.name} <ExternalLink className="w-2.5 h-2.5 opacity-70" />
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Season label + cache info + refresh */}
              <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                <span className="font-medium flex items-center gap-2">
                  {sofaData?.season?.name}
                  {!isCurrentSeason && (
                    <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded-full font-semibold">
                      {t('championships.historical')}
                    </span>
                  )}
                  {(sofaData as any)?.source === 'manual' ? (
                    <span className="flex items-center gap-1 text-[10px] bg-amber-500/10 text-amber-600 px-1.5 py-0.5 rounded-full font-semibold">
                      <PencilLine className="w-2.5 h-2.5" /> Données saisies manuellement
                    </span>
                  ) : sofaData?.from_cache && (
                    <span className="flex items-center gap-1 text-[10px] text-muted-foreground/70">
                      <Database className="w-2.5 h-2.5" />
                      {t('championships.from_db')}
                      {sofaData.fetched_at && ` · ${formatDateTime(sofaData.fetched_at, dateFormat, timeFormat, timezone)}`}
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-2">
                  {isCurrentSeason && champ.sofascoreId && (
                    <button
                      onClick={handleRefresh}
                      disabled={isRefreshing}
                      className="flex items-center gap-1 text-[11px] hover:text-foreground transition-colors disabled:opacity-50"
                      title={t('championships.refresh_standings')}
                    >
                      <RefreshCw className={cn('w-3 h-3', isRefreshing && 'animate-spin')} />
                      {t('championships.refresh_standings')}
                    </button>
                  )}
                  {canManageStandings && (
                    <button
                      onClick={() => setManualModalOpen(true)}
                      className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 transition-colors"
                      title="Modifier le classement manuellement"
                    >
                      <PencilLine className="w-3 h-3" />
                      Modifier
                    </button>
                  )}
                </div>
              </div>

              {/* Standings table */}
              <div className="overflow-x-auto rounded-xl border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground text-xs border-b">
                      <th className="text-left px-3 py-2.5 w-8 font-semibold">#</th>
                      <th className="text-left px-3 py-2.5 font-semibold">{t('championships.team')}</th>
                      <th className="text-center px-2 py-2.5 font-semibold w-10 hidden sm:table-cell" title="Joueurs scoutés"><Users className="w-3 h-3 inline" /></th>
                      <th className="text-center px-2 py-2.5 font-semibold w-8">MJ</th>
                      <th className="text-center px-2 py-2.5 font-semibold w-8 hidden sm:table-cell">V</th>
                      <th className="text-center px-2 py-2.5 font-semibold w-8 hidden sm:table-cell">N</th>
                      <th className="text-center px-2 py-2.5 font-semibold w-8 hidden sm:table-cell">D</th>
                      <th className="text-center px-2 py-2.5 font-semibold w-14 hidden md:table-cell">B+/B-</th>
                      <th className="text-center px-2 py-2.5 font-semibold w-8 hidden md:table-cell">Diff</th>
                      <th className="text-center px-2 py-2.5 font-bold w-10">Pts</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/40">
                    {teams.map((team, i) => {
                      const myCount = clubPlayerCount(team.name);
                      const isSelected = selectedClub?.name === team.name;
                      const pos = team.position ?? i + 1;
                      const gd = team.goalDifference ?? ((team.goalsFor ?? 0) - (team.goalsAgainst ?? 0));

                      // Use ESPN noteColor directly if available, otherwise fall back to keyword detection
                      const noteColor = team.noteColor ?? null;
                      const desc = (team.description ?? team.promotionDescription ?? '').toLowerCase();
                      const fallbackColor =
                        desc.includes('champion') ? '#3b82f6' :
                        desc.includes('europa') && !desc.includes('conference') ? '#fb923c' :
                        desc.includes('conference') ? '#4ade80' :
                        desc.includes('relega') ? '#ef4444' :
                        desc.includes('playoff') || desc.includes('play-off') ? '#facc15' :
                        null;
                      const zoneHex = noteColor ?? fallbackColor;

                      return (
                        <tr
                          key={team.id ?? i}
                          onClick={() => { setSelectedClub(isSelected ? null : { name: team.name, logoUrl: team.logoUrl }); setTab('clubs'); }}
                          className={cn(
                            'cursor-pointer transition-colors hover:bg-muted/30',
                            isSelected && 'bg-primary/5',
                          )}
                        >
                          {/* Position with zone indicator */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-1.5">
                              {zoneHex && (
                                <span
                                  className="w-1 h-5 rounded-full shrink-0"
                                  style={{ backgroundColor: zoneHex }}
                                />
                              )}
                              <span className={cn('font-mono text-xs font-semibold w-4 text-center', pos === 1 ? 'text-yellow-600' : 'text-muted-foreground')}>{pos}</span>
                            </div>
                          </td>

                          {/* Team */}
                          <td className="px-3 py-2.5">
                            <div className="flex items-center gap-2.5">
                              <ClubLogo src={team.logoUrl} name={team.name} size="sm" />
                              <span className={cn('font-medium truncate max-w-[140px] sm:max-w-none', pos === 1 && 'font-bold')}>{team.name}</span>
                            </div>
                          </td>

                          {/* Scouted players */}
                          <td className="text-center px-2 py-2.5 hidden sm:table-cell">
                            {myCount > 0 ? (
                              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
                                {myCount}
                              </span>
                            ) : <span className="text-muted-foreground/30 text-xs">—</span>}
                          </td>

                          <td className="text-center px-2 py-2.5 text-muted-foreground text-xs">{team.played ?? '—'}</td>
                          <td className="text-center px-2 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">{team.wins ?? '—'}</td>
                          <td className="text-center px-2 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">{team.draws ?? '—'}</td>
                          <td className="text-center px-2 py-2.5 text-muted-foreground text-xs hidden sm:table-cell">{team.losses ?? '—'}</td>

                          {/* Goals */}
                          <td className="text-center px-2 py-2.5 text-muted-foreground text-xs hidden md:table-cell">
                            {team.goalsFor ?? '—'} / {team.goalsAgainst ?? '—'}
                          </td>

                          {/* Goal diff */}
                          <td className="text-center px-2 py-2.5 text-xs hidden md:table-cell">
                            <span className={cn('font-medium', gd > 0 ? 'text-emerald-600' : gd < 0 ? 'text-red-500' : 'text-muted-foreground')}>
                              {gd > 0 ? `+${gd}` : gd}
                            </span>
                          </td>

                          {/* Points */}
                          <td className="text-center px-2 py-2.5">
                            <span className={cn('font-bold text-sm', pos === 1 && 'text-yellow-600')}>{team.points ?? '—'}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground px-1">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />Ligue des champions</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-orange-400 shrink-0" />Europa League</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-green-400 shrink-0" />Conférence League</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />Barrages</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-red-500 shrink-0" />Relégation</span>
              </div>
            </>
          )}
        </div>
      )}

      {/* Clubs tab */}
      {tab === 'clubs' && (
        <div className="space-y-3">
          {/* Club panel */}
          {selectedClub && (
            <ClubPanel
              club={selectedClub}
              onClose={() => setSelectedClub(null)}
              getClubPlayers={getClubPlayers}
            />
          )}

          {sofaLoading ? (
            <div className="space-y-2">
              {[...Array(8)].map((_, i) => <div key={i} className="h-12 rounded-lg bg-muted animate-pulse" />)}
            </div>
          ) : hasStandings ? (
            /* Full standings table */
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-muted-foreground text-xs">
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">{t('championships.team')}</th>
                    <th className="text-center px-2 py-2"><Users className="w-3 h-3 inline" /></th>
                    <th className="text-center px-2 py-2">MJ</th>
                    <th className="text-center px-2 py-2">V</th>
                    <th className="text-center px-2 py-2">N</th>
                    <th className="text-center px-2 py-2">D</th>
                    <th className="text-center px-2 py-2">BP</th>
                    <th className="text-center px-2 py-2">BC</th>
                    <th className="text-center px-2 py-2 font-bold">Pts</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team, i) => {
                    const myCount = clubPlayerCount(team.name);
                    const isSelected = selectedClub?.name === team.name;
                    return (
                      <tr
                        key={team.id ?? i}
                        onClick={() => setSelectedClub(isSelected ? null : { name: team.name, logoUrl: team.logoUrl })}
                        className={cn(
                          'border-t cursor-pointer transition-colors',
                          isSelected ? 'bg-primary/5' : 'hover:bg-muted/30',
                        )}
                      >
                        <td className="px-3 py-2 text-muted-foreground font-medium">{team.position ?? i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2.5">
                            <ClubLogo src={team.logoUrl} name={team.name} size="sm" />
                            <span className="font-medium truncate">{team.name}</span>
                          </div>
                        </td>
                        <td className="text-center px-2 py-2">
                          {myCount > 0 ? (
                            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
                              {myCount}
                            </span>
                          ) : <span className="text-muted-foreground/30">-</span>}
                        </td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.played ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.wins ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.draws ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.losses ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.goalsFor ?? '-'}</td>
                        <td className="text-center px-2 py-2 text-muted-foreground">{team.goalsAgainst ?? '-'}</td>
                        <td className="text-center px-2 py-2 font-bold">{team.points ?? '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : teams.length > 0 ? (
            /* SofaScore teams, no standings */
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
              {teams.map((team, i) => {
                const myCount = clubPlayerCount(team.name);
                const isSelected = selectedClub?.name === team.name;
                return (
                  <button
                    key={team.id ?? i}
                    onClick={() => setSelectedClub(isSelected ? null : { name: team.name, logoUrl: team.logoUrl })}
                    className={cn(
                      'flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all hover:shadow-sm',
                      isSelected ? 'bg-primary/5 border-primary/40' : 'bg-card hover:bg-accent/40 hover:border-primary/20',
                    )}
                  >
                    <ClubLogo src={team.logoUrl} name={team.name} size="md" />
                    <span className="text-xs font-medium leading-tight line-clamp-2">{team.name}</span>
                    {myCount > 0 && (
                      <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
                        {myCount}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            /* Static clubs + custom clubs */
            (() => {
              const customNames = new Set(customClubs.map(c => c.name));
              const allClubs = [
                ...staticClubs.map(name => ({ name, isCustom: false })),
                ...customClubs.map(c => ({ name: c.name, isCustom: true })),
              ].filter((c, i, arr) => arr.findIndex(x => x.name === c.name) === i);
              return (
                <div className="space-y-3">
                  {allClubs.length > 0 ? (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                      {allClubs.map(({ name: club, isCustom }) => {
                        const myCount = clubPlayerCount(club);
                        const logo = getStaticClubLogo(club);
                        const isSelected = selectedClub?.name === club;
                        return (
                          <div key={club} className="relative group">
                            <button
                              onClick={() => setSelectedClub(isSelected ? null : { name: club, logoUrl: logo })}
                              className={cn(
                                'w-full flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all hover:shadow-sm',
                                isSelected ? 'bg-primary/5 border-primary/40' : 'bg-card hover:bg-accent/40 hover:border-primary/20',
                                isCustom && 'border-dashed',
                              )}
                            >
                              <ClubLogo src={logo} name={club} size="md" />
                              <span className="text-xs font-medium leading-tight line-clamp-2">{club}</span>
                              {myCount > 0 && (
                                <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-primary/15 text-primary text-[11px] font-bold">
                                  {myCount}
                                </span>
                              )}
                            </button>
                            {canManageStandings && isCustom && (
                              <button
                                onClick={() => removeClub.mutate({ championshipName: champ.name, clubName: club })}
                                className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-background/80 border opacity-0 group-hover:opacity-100 flex items-center justify-center text-red-500 hover:bg-red-50 transition-all"
                                title="Retirer ce club"
                              >
                                <X className="w-2.5 h-2.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('championships.no_clubs')}</p>
                  )}

                  {/* Add club UI for mods */}
                  {canManageStandings && (
                    <div className="pt-1">
                      {clubInputOpen ? (
                        <div className="flex items-center gap-2 max-w-xs">
                          <ClubNameInput
                            value={newClubInput}
                            onChange={setNewClubInput}
                            suggestions={[
                              ...staticClubs.filter(c => !customNames.has(c) && !staticClubs.includes(c)),
                              ...staticClubs,
                            ].filter((c, i, arr) => arr.indexOf(c) === i && !allClubs.some(x => x.name === c))}
                          />
                          <Button
                            size="sm"
                            disabled={!newClubInput.trim() || addClub.isPending}
                            onClick={async () => {
                              if (!newClubInput.trim()) return;
                              await addClub.mutateAsync({ championshipName: champ.name, clubName: newClubInput.trim() });
                              setNewClubInput('');
                              setClubInputOpen(false);
                            }}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => { setClubInputOpen(false); setNewClubInput(''); }}>
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setClubInputOpen(true)}
                          className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 font-medium transition-colors"
                        >
                          <Plus className="w-3.5 h-3.5" /> Ajouter un club
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* Players tab */}
      {tab === 'players' && (
        <div className="space-y-6">
          {allLinkedPlayers.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('championships.no_players')}</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {allLinkedPlayers.map(p => {
                const isAuto = leaguePlayerIds.has(p.id);
                const isManual = manualLinkedIds.has(p.id);
                const isEnriched = !!p.external_data_fetched_at;
                const enrichedLeague = p.external_data?.enriched_league;
                const displayLeagueDiffers = enrichedLeague && enrichedLeague !== (p.league ?? '').trim();
                return (
                  <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
                    <a href={`/player/${p.id}`} className="flex items-center gap-3 min-w-0 hover:opacity-80 transition-opacity">
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {getEffectiveClub(p)} — {p.position}
                          {displayLeagueDiffers && (
                            <span className="ml-1 text-amber-500" title={t('championships.league_mismatch', { display: p.league, enriched: enrichedLeague })}>*</span>
                          )}
                        </p>
                      </div>
                    </a>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {isAuto && (
                        <span
                          className={cn(
                            'text-[9px] px-1.5 py-0.5 rounded-full',
                            isEnriched ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-muted text-muted-foreground',
                          )}
                          title={isEnriched ? t('championships.enriched_tag') : t('championships.auto_tag')}
                        >
                          {isEnriched ? 'enrichi' : 'auto'}
                        </span>
                      )}
                      {isManual && (
                        <button onClick={() => handleUnlink(p.id)} className="text-muted-foreground hover:text-destructive transition-colors">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-3">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <UserPlus className="w-4 h-4" />
              {t('championships.add_player')}
            </h3>
            <div className="relative max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder={t('championships.search_player')}
                value={playerSearch}
                onChange={e => setPlayerSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {playerSearch.trim() && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {availablePlayers.length === 0 ? (
                  <p className="text-sm text-muted-foreground col-span-full">{t('championships.no_results')}</p>
                ) : (
                  availablePlayers.map(p => (
                    <button
                      key={p.id}
                      onClick={() => handleLink(p.id)}
                      className="flex items-center gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors text-left"
                    >
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="w-8 h-8 rounded-full object-cover shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                          {p.name.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{p.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{p.club} — {p.position}</p>
                      </div>
                      <PlusCircle className="w-4 h-4 text-primary ml-auto shrink-0" />
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Notes tab ── */}
      {tab === 'notes' && (
        <div className="max-w-2xl space-y-5">
          {/* En-tête */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StickyNote className="w-4 h-4 text-primary" />
              <h3 className="text-sm font-semibold">Notes de scouting — {champ.name}</h3>
            </div>
            <div className="flex items-center gap-2">
              {noteDirty && <span className="text-xs text-amber-600 font-medium">● Non enregistré</span>}
              {myChampNote && (
                <button
                  onClick={() => { if (confirm('Supprimer votre note ?')) deleteNote.mutate(myChampNote.id); }}
                  className="p-1.5 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                  title="Supprimer ma note"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {/* Ma note — éditeur principal */}
          <div className="space-y-3">
            {/* Étoiles */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground shrink-0">Ma note :</span>
              {[1,2,3,4,5].map(star => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setDraftRating(star === noteRating ? null : star)}
                  className="p-0.5 transition-transform hover:scale-110"
                  title={`${star}/5`}
                >
                  <Star className={`w-5 h-5 transition-colors ${star <= (noteRating ?? 0) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/25 hover:text-amber-400'}`} />
                </button>
              ))}
              {noteRating && <span className="text-sm font-bold text-amber-600 ml-1">{noteRating}/5</span>}
              {noteRating && <button onClick={() => setDraftRating(null)} className="text-xs text-muted-foreground hover:text-foreground ml-1">✕</button>}
            </div>
            <Textarea
              placeholder={`Mes notes sur ${champ.name}… (observations, joueurs à suivre, tendances…)`}
              value={noteText}
              onChange={e => setDraftText(e.target.value)}
              className="min-h-[160px] resize-y text-sm leading-relaxed"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {myChampNote
                  ? `${t('championships.note_modified')} ${formatDate(myChampNote.updated_at, dateFormat)}`
                  : t('championships.no_note')}
              </span>
              <button
                disabled={!noteText.trim() || saveNote.isPending || (!noteDirty && !!myChampNote)}
                onClick={() => saveNote.mutate({ content: noteText, rating: noteRating })}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {saveNote.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {myChampNote ? 'Mettre à jour' : 'Enregistrer'}
              </button>
            </div>
          </div>

          {/* Notes de l'équipe */}
          {teamChampNotes.length > 0 && (
            <div className="space-y-3 pt-4 border-t border-border/40">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Notes de l'équipe ({teamChampNotes.length})</p>
              {teamChampNotes.map(note => (
                <div key={note.id} className="rounded-xl border bg-card p-4">
                  {note.rating != null && (
                    <div className="flex items-center gap-0.5 mb-2">
                      {[1,2,3,4,5].map(s => (
                        <Star key={s} className={`w-4 h-4 ${s <= note.rating! ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/20'}`} />
                      ))}
                      <span className="text-xs text-amber-600 font-medium ml-1">{note.rating}/5</span>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-line">{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {note.author_name?.trim() || '?'} · {formatDate(note.updated_at, dateFormat)}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Calendar tab ── */}
      {tab === 'calendar' && (
        <div className="space-y-4">

          {/* ── Sub-menu: search another championship ── */}
          <div className="relative">
            <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2">
              <Search className="w-4 h-4 text-muted-foreground shrink-0" />
              <input
                type="text"
                placeholder={t('championships.calendar_search_placeholder')}
                value={calendarSearch}
                onChange={e => setCalendarSearch(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
              {calendarSearch && (
                <button onClick={() => setCalendarSearch('')} className="text-muted-foreground hover:text-foreground">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            {calendarSearchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 rounded-xl border bg-background shadow-lg overflow-hidden">
                {calendarSearchResults.map(c => (
                  <button
                    key={c.name}
                    className="w-full flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/60 transition-colors text-left"
                    onClick={() => {
                      setCalendarSearch('');
                      onBack();
                      // Navigate by triggering URL change — Championships will auto-select
                      window.history.pushState({}, '', `/championships?search=${encodeURIComponent(c.name)}`);
                      window.dispatchEvent(new PopStateEvent('popstate'));
                    }}
                  >
                    <LeagueLogo league={c.name} size="sm" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.country}</p>
                    </div>
                    <CalendarDays className="w-3.5 h-3.5 text-muted-foreground shrink-0 ml-auto" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {calendarLoading ? (
            <div className="space-y-3">
              <div className="flex gap-2 overflow-x-auto pb-1">
                {[...Array(8)].map((_, i) => <div key={i} className="h-8 w-14 shrink-0 rounded-lg bg-muted animate-pulse" />)}
              </div>
              {[...Array(5)].map((_, i) => <div key={i} className="h-14 rounded-xl bg-muted animate-pulse" />)}
            </div>
          ) : calendarData?.noData ? (
            /* Season not yet available on TM */
            <div className="rounded-xl border border-dashed p-8 text-center space-y-3">
              <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <div>
                <p className="text-sm font-medium text-muted-foreground">
                  Pas encore de données pour la saison {calendarData.noDataSeason}–{String((calendarData.noDataSeason ?? 0) + 1).slice(2)}
                </p>
                <p className="text-xs text-muted-foreground/70 mt-1">
                  Les données seront disponibles dès que la saison débutera sur Transfermarkt.
                </p>
              </div>
              {canManageStandings && (
                <Button size="sm" variant="outline" onClick={() => refreshCalendar.mutate()} disabled={refreshCalendar.isPending}>
                  <RefreshCw className={cn('w-3.5 h-3.5 mr-1.5', refreshCalendar.isPending && 'animate-spin')} />
                  Vérifier sur Transfermarkt
                </Button>
              )}
            </div>
          ) : !calendarData ? (
            <div className="rounded-xl border border-dashed p-8 text-center space-y-2">
              <CalendarDays className="w-8 h-8 mx-auto text-muted-foreground/40" />
              <p className="text-sm font-medium text-muted-foreground">{t('championships.calendar_unavailable')}</p>
              <p className="text-xs text-muted-foreground/70">{t('championships.calendar_not_found_tm')}</p>
            </div>
          ) : (
            <>
              {/* Source badge + admin refresh */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className={cn(
                  'text-[10px] border rounded px-1.5 py-0.5',
                  calendarData.source === 'db' ? 'text-blue-500/70 border-blue-300/40' : 'text-muted-foreground/60',
                )}>
                  {calendarData.source === 'db' ? '🗄️ Base de données' : '📊 Transfermarkt'}
                </span>
                <span className="text-[10px] text-muted-foreground/60">{calendarData.seasonLabel ?? calendarData.seasonName}</span>
                {canManageStandings && (
                  <Button
                    size="sm" variant="ghost"
                    className="h-6 px-2 text-[10px] text-muted-foreground/60 hover:text-foreground ml-auto"
                    onClick={() => refreshCalendar.mutate()} disabled={refreshCalendar.isPending}
                    title="Re-télécharger depuis Transfermarkt (remplace les données actuelles)"
                  >
                    <RefreshCw className={cn('w-3 h-3 mr-1', refreshCalendar.isPending && 'animate-spin')} />
                    Actualiser TM
                  </Button>
                )}
              </div>

              {/* Round selector */}
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground shrink-0">{t('championships.calendar_round')}</p>
                <div className="flex gap-1.5 overflow-x-auto pb-1 flex-1">
                  {calendarData.rounds.map(r => {
                    const matches = getRoundMatches(r);
                    const hasResults = matches.some(e => e.finished);
                    const isActive = r.round === activeRound;
                    const isCurrent = r.round === calendarData.currentRound;
                    return (
                      <button
                        key={r.round}
                        onClick={() => setSelectedRound(r.round)}
                        className={cn(
                          'shrink-0 min-w-[40px] px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors border',
                          isActive
                            ? 'bg-primary text-primary-foreground border-primary'
                            : isCurrent
                              ? 'border-primary/60 text-primary bg-primary/5'
                              : hasResults
                                ? 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/80'
                                : 'border-border/50 bg-transparent text-muted-foreground/60 hover:bg-muted/40',
                        )}
                      >
                        {r.round}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Matchday header */}
              {activeRoundData && (
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {activeRoundData.name || `${t('championships.calendar_matchday')} ${activeRoundData.round}`}
                  </h3>
                  <span className="text-xs text-muted-foreground">{getRoundMatches(activeRoundData).length} {t('championships.calendar_match_count')}</span>
                </div>
              )}

              {/* Matches list */}
              {(() => {
                const matches = activeRoundData ? getRoundMatches(activeRoundData) : [];
                if (!activeRoundData || matches.length === 0) {
                  return (
                    <div className="rounded-xl border border-dashed p-6 text-center space-y-2">
                      <p className="text-sm text-muted-foreground">{t('championships.calendar_no_matches')}</p>
                      <p className="text-xs text-muted-foreground/60">{t('championships.calendar_dates_tbd')}</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-1.5">
                    {matches.map((match, mi) => {
                      const logo = (t: { logo?: string | null; badge?: string | null }) => t.logo ?? t.badge ?? null;
                      const homeWon = match.finished && match.homeScore !== null && match.awayScore !== null && match.homeScore > match.awayScore;
                      const awayWon = match.finished && match.homeScore !== null && match.awayScore !== null && match.awayScore > match.homeScore;
                      const draw = match.finished && match.homeScore !== null && match.awayScore !== null && match.homeScore === match.awayScore;
                      const matchDbId = typeof match.id === 'number' ? match.id : null;
                      const matchKey = `${activeRoundData?.round}-${match.homeTeam.name}-${match.awayTeam.name}`;
                      const isEditing = editingMatch?.homeTeamName === match.homeTeam.name && editingMatch?.awayTeamName === match.awayTeam.name && editingMatch?.round === activeRoundData?.round;
                      const hasExistingData = !match.isManual && (match.homeScore !== null || match.hasDate);
                      return (
                        <div key={matchDbId ?? matchKey} className={cn('rounded-xl border border-border/60 overflow-hidden', isEditing && 'border-primary/40')}>
                          {/* Match row */}
                          <div className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors">
                            {/* Home team */}
                            <div className="flex-1 min-w-0 flex items-center gap-2 justify-end">
                              {match.isManual && <span title="Modifié manuellement" className="text-[9px] text-amber-500 shrink-0">✎</span>}
                              <Link
                                to={`/club?club=${encodeURIComponent(match.homeTeam.name)}`}
                                className={cn(
                                  'text-sm font-medium text-right truncate hover:underline hover:text-primary transition-colors',
                                  homeWon ? 'font-bold' : awayWon ? 'text-muted-foreground' : '',
                                )}
                              >{match.homeTeam.name}</Link>
                              {logo(match.homeTeam) && (
                                <Link to={`/club?club=${encodeURIComponent(match.homeTeam.name)}`} className="shrink-0">
                                  <img src={logo(match.homeTeam)!} alt={match.homeTeam.name} className="w-6 h-6 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </Link>
                              )}
                            </div>

                            {/* Score / date / TBD */}
                            <div className="shrink-0 text-center w-24 space-y-0.5">
                              {match.finished ? (
                                <>
                                  <div className={cn(
                                    'flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold tabular-nums',
                                    draw ? 'bg-muted/60' : 'bg-primary/10 text-primary',
                                  )}>
                                    <span className={homeWon ? 'font-black' : ''}>{match.homeScore}</span>
                                    <span className="text-muted-foreground text-xs">-</span>
                                    <span className={awayWon ? 'font-black' : ''}>{match.awayScore}</span>
                                  </div>
                                  {match.hasDate && match.startDate && (
                                    <p className="text-[10px] text-muted-foreground/60">
                                      {formatDate(match.startDate, dateFormat)}
                                      {match.hasTime && <> · {new Date(match.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</>}
                                    </p>
                                  )}
                                </>
                              ) : match.inProgress ? (
                                <>
                                  <div className="flex items-center justify-center gap-1.5 px-3 py-1 rounded-lg text-sm font-bold tabular-nums bg-green-500/10 text-green-600 animate-pulse">
                                    <span>{match.homeScore ?? 0}</span>
                                    <span className="text-xs">-</span>
                                    <span>{match.awayScore ?? 0}</span>
                                  </div>
                                  {match.hasDate && match.startDate && match.hasTime && (
                                    <p className="text-[10px] text-muted-foreground/60">
                                      {new Date(match.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                  )}
                                </>
                              ) : match.hasDate && match.startDate ? (
                                <div className="space-y-0.5">
                                  <p className="text-xs font-semibold text-foreground">{formatDate(match.startDate, dateFormat)}</p>
                                  {match.hasTime && (
                                    <p className="text-[10px] text-muted-foreground">{new Date(match.startDate).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                                  )}
                                </div>
                              ) : (
                                <span className="inline-block text-[10px] font-medium text-muted-foreground/70 bg-muted/50 border border-dashed px-2 py-1 rounded-lg">
                                  {t('championships.calendar_tbd')}
                                </span>
                              )}
                            </div>

                            {/* Away team */}
                            <div className="flex-1 min-w-0 flex items-center gap-2">
                              {logo(match.awayTeam) && (
                                <Link to={`/club?club=${encodeURIComponent(match.awayTeam.name)}`} className="shrink-0">
                                  <img src={logo(match.awayTeam)!} alt={match.awayTeam.name} className="w-6 h-6 object-contain" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                </Link>
                              )}
                              <Link
                                to={`/club?club=${encodeURIComponent(match.awayTeam.name)}`}
                                className={cn(
                                  'text-sm font-medium truncate hover:underline hover:text-primary transition-colors',
                                  awayWon ? 'font-bold' : homeWon ? 'text-muted-foreground' : '',
                                )}
                              >{match.awayTeam.name}</Link>
                            </div>

                            {/* Admin edit button — visible for ALL matches */}
                            {canManageStandings && (
                              <button
                                onClick={() => {
                                  if (isEditing) { setEditingMatch(null); return; }
                                  const sd = match.startDate ?? '';
                                  const datePart = sd.includes('T') ? sd.split('T')[0] : sd.substring(0, 10);
                                  const timePart = sd.includes('T') ? sd.split('T')[1]?.substring(0, 5) : '';
                                  setEditForm({
                                    homeScore: match.homeScore != null ? String(match.homeScore) : '',
                                    awayScore: match.awayScore != null ? String(match.awayScore) : '',
                                    finished: !!match.finished,
                                    startDate: datePart,
                                    startTime: timePart || '',
                                    hasTime: !!match.hasTime,
                                  });
                                  setEditingMatch({
                                    dbId: matchDbId,
                                    round: activeRoundData!.round,
                                    roundName: activeRoundData!.name,
                                    homeTeamName: match.homeTeam.name,
                                    homeTeamBadge: match.homeTeam.badge ?? match.homeTeam.logo ?? null,
                                    homeTeamTmId: String(match.homeTeam.id ?? ''),
                                    awayTeamName: match.awayTeam.name,
                                    awayTeamBadge: match.awayTeam.badge ?? match.awayTeam.logo ?? null,
                                    awayTeamTmId: String(match.awayTeam.id ?? ''),
                                    hasExistingData,
                                  });
                                }}
                                className={cn(
                                  'shrink-0 w-6 h-6 rounded flex items-center justify-center transition-colors',
                                  isEditing ? 'bg-primary/10 text-primary' : 'text-muted-foreground/40 hover:text-foreground hover:bg-muted',
                                )}
                                title="Modifier ce match"
                              >
                                <Pencil className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Inline edit form */}
                          {isEditing && editingMatch && (
                            <div className="border-t border-border/40 bg-muted/20 px-3 py-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Modifier le match</p>
                                {!matchDbId && (
                                  <span className="text-[9px] text-muted-foreground/50 italic">données non encore en base</span>
                                )}
                              </div>

                              {/* Warning when overwriting real TM data */}
                              {hasExistingData && (
                                <div className="flex items-start gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-2.5 py-2">
                                  <span className="text-amber-500 text-xs shrink-0 mt-px">⚠</span>
                                  <p className="text-[11px] text-amber-700 dark:text-amber-400 leading-snug">
                                    Ces données viennent de Transfermarkt. Les enregistrer les marquera comme <strong>modifiées manuellement</strong> et elles ne seront plus mises à jour automatiquement.
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-xs text-muted-foreground">{match.homeTeam.name}</label>
                                  <Input
                                    type="number" min={0} max={99} placeholder="–"
                                    value={editForm.homeScore}
                                    onChange={e => setEditForm(f => ({ ...f, homeScore: e.target.value }))}
                                    className="h-8 text-sm"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs text-muted-foreground">{match.awayTeam.name}</label>
                                  <Input
                                    type="number" min={0} max={99} placeholder="–"
                                    value={editForm.awayScore}
                                    onChange={e => setEditForm(f => ({ ...f, awayScore: e.target.value }))}
                                    className="h-8 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center gap-3 flex-wrap">
                                <div className="flex items-center gap-1.5">
                                  <input type="checkbox" id={`fin-${matchKey}`} checked={editForm.finished}
                                    onChange={e => setEditForm(f => ({ ...f, finished: e.target.checked }))}
                                    className="rounded" />
                                  <label htmlFor={`fin-${matchKey}`} className="text-xs text-muted-foreground cursor-pointer">Match joué</label>
                                </div>
                                <Input
                                  type="date" value={editForm.startDate}
                                  onChange={e => setEditForm(f => ({ ...f, startDate: e.target.value }))}
                                  className="h-8 text-xs w-36"
                                />
                                <div className="flex items-center gap-1.5">
                                  <input type="checkbox" id={`ht-${matchKey}`} checked={editForm.hasTime}
                                    onChange={e => setEditForm(f => ({ ...f, hasTime: e.target.checked }))}
                                    className="rounded" />
                                  <label htmlFor={`ht-${matchKey}`} className="text-xs text-muted-foreground cursor-pointer">Heure</label>
                                </div>
                                {editForm.hasTime && (
                                  <Input
                                    type="time" value={editForm.startTime}
                                    onChange={e => setEditForm(f => ({ ...f, startTime: e.target.value }))}
                                    className="h-8 text-xs w-28"
                                  />
                                )}
                              </div>
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingMatch(null)}>
                                  <X className="w-3 h-3 mr-1" />Annuler
                                </Button>
                                <Button size="sm" className="h-7 text-xs" onClick={() => saveMatchEdit.mutate()} disabled={saveMatchEdit.isPending}>
                                  <Check className="w-3 h-3 mr-1" />{saveMatchEdit.isPending ? 'Enregistrement…' : 'Enregistrer'}
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}

              {/* TBD info banner */}
              {activeRoundData && getRoundMatches(activeRoundData).some(e => !e.hasDate && e.notStarted) && (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 rounded-xl p-3">
                  <CalendarDays className="w-4 h-4 shrink-0 mt-0.5" />
                  <p>{t('championships.calendar_tbd_info')}</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Manual standings modal */}
      {manualModalOpen && (
        <ManualStandingsModal
          champ={champ}
          seasonYear={seasonYear ?? (new Date().getMonth() >= 6 ? new Date().getFullYear() : new Date().getFullYear() - 1)}
          currentTeams={teams}
          onClose={() => setManualModalOpen(false)}
          onSaved={() => { refetchStandings(); }}
        />
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function Championships() {
  const { t } = useTranslation();
  const [urlParams] = useSearchParams();
  const { data: championships = [], isLoading } = useChampionships();
  const { data: players = [] } = usePlayers();
  const { data: isAdmin } = useIsAdmin();
  const addCustom = useAddCustomChampionship();
  const deleteCustom = useDeleteCustomChampionship();

  const [search, setSearch] = useState(() => urlParams.get('search') || '');
  const [countryFilter, setCountryFilter] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);

  // Sync search bar when URL param changes (e.g. popstate navigation from calendar tab)
  useEffect(() => {
    setSearch(urlParams.get('search') || '');
  }, [urlParams]);
  const [deleteTarget, setDeleteTarget] = useState<ChampionshipEntry | null>(null);
  const [formName, setFormName] = useState('');
  const [formCountry, setFormCountry] = useState('');
  const [selectedChamp, setSelectedChamp] = useState<ChampionshipEntry | null>(null);

  // Auto-select championship that exactly matches the ?search= param + read ?tab and ?season
  const urlInitialTab = urlParams.get('tab') as 'standings' | 'clubs' | 'players' | 'notes' | 'calendar' | null;
  const urlInitialSeason = urlParams.get('season') ? parseInt(urlParams.get('season')!) : null;

  useEffect(() => {
    const q = urlParams.get('search');
    if (!q || championships.length === 0) return;
    const exact = championships.find(c => c.name.toLowerCase() === q.toLowerCase());
    if (exact) setSelectedChamp(exact);
  }, [championships]); // eslint-disable-line react-hooks/exhaustive-deps

  const playerCountByLeague = useMemo(() => {
    const map: Record<string, number> = {};
    for (const p of players) {
      const l = (p.external_data?.enriched_league ?? p.league ?? '').trim();
      if (l) map[l] = (map[l] || 0) + 1;
    }
    return map;
  }, [players]);

  const countries = useMemo(() =>
    Array.from(new Set(championships.map(c => c.country).filter((x): x is string => !!x))).sort((a, b) => a.localeCompare(b)),
  [championships]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return championships.filter(c => {
      const matchesSearch = !q || c.name.toLowerCase().includes(q) || c.country.toLowerCase().includes(q);
      const matchesCountry = !countryFilter || c.country === countryFilter;
      return matchesSearch && matchesCountry;
    });
  }, [championships, search, countryFilter]);

  const handleAddCustom = async () => {
    if (!formName.trim()) { toast.error(t('championships.name_required')); return; }
    if (!formCountry) { toast.error(t('championships.country_required')); return; }
    try {
      await addCustom.mutateAsync({ name: formName.trim(), country: formCountry });
      toast.success(t('championships.added'));
      setDialogOpen(false);
      setFormName('');
      setFormCountry('');
    } catch { toast.error(t('common.error')); }
  };

  const handleDeleteCustom = async () => {
    if (!deleteTarget?.customId) return;
    try {
      await deleteCustom.mutateAsync(deleteTarget.customId);
      toast.success(t('championships.deleted'));
      if (selectedChamp?.name === deleteTarget.name) setSelectedChamp(null);
    } catch { toast.error(t('common.error')); }
    setDeleteTarget(null);
  };

  if (selectedChamp) {
    return (
      <ChampionshipDetail
        key={selectedChamp.name}
        champ={selectedChamp}
        onBack={() => setSelectedChamp(null)}
        initialTab={urlInitialTab ?? undefined}
        initialSeason={urlInitialSeason ?? undefined}
      />
    );
  }

  return (
    <div className="max-w-5xl mx-auto py-8 px-4 space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Trophy className="w-6 h-6 text-primary" />
            {t('championships.title')}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">{t('championships.subtitle')}</p>
        </div>
        {isAdmin && (
          <Button onClick={() => setDialogOpen(true)} className="gap-2 shrink-0">
            <PlusCircle className="w-4 h-4" />
            {t('championships.add')}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder={t('championships.search')}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={countryFilter || '_all'} onValueChange={v => setCountryFilter(v === '_all' ? '' : v)}>
          <SelectTrigger className="w-48 shrink-0">
            <SelectValue placeholder={t('championships.filter_country')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">{t('championships.all_countries')}</SelectItem>
            {(countries as string[]).map(country => (
              <SelectItem key={country} value={country}>
                <span className="flex items-center gap-2">
                  <FlagIcon nationality={country} size="sm" />
                  {country}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground/40 mb-3" />
          <p className="text-muted-foreground">{t('championships.no_results')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(c => {
            const count = playerCountByLeague[c.name] ?? 0;
            return (
              <div
                key={c.name}
                onClick={() => setSelectedChamp(c)}
                className="group relative rounded-xl border bg-card p-5 hover:shadow-md hover:border-primary/30 transition-all cursor-pointer"
              >
                <div className="flex items-start gap-3">
                  <LeagueLogo league={c.name} size="lg" />
                  <div className="min-w-0 flex-1">
                    <h3 className="font-semibold truncate">{c.name}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                      <FlagIcon nationality={c.country} size="sm" />
                      {c.country}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-3 text-xs text-muted-foreground">
                  {c.clubCount > 0 && (
                    <span className="bg-muted px-2 py-0.5 rounded-full">{c.clubCount} {t('championships.clubs')}</span>
                  )}
                  {count > 0 && (
                    <span className="bg-primary/10 text-primary px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Users className="w-3 h-3" /> {count}
                    </span>
                  )}
                </div>
                {isAdmin && c.isCustom && (
                  <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={e => { e.stopPropagation(); setDeleteTarget(c); }}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t('championships.add')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{t('championships.name_label')}</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="Championnat National, Coupe de France..." />
            </div>
            <div>
              <Label>{t('championships.country_label')}</Label>
              <Select value={formCountry || '_none'} onValueChange={v => setFormCountry(v === '_none' ? '' : v)}>
                <SelectTrigger>
                  <SelectValue placeholder={t('championships.filter_country')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">{t('championships.filter_country')}</SelectItem>
                  {(countries as string[]).map(country => (
                    <SelectItem key={country} value={country}>
                      <span className="flex items-center gap-2">
                        <FlagIcon nationality={country} size="sm" />
                        {country}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddCustom} className="w-full" disabled={addCustom.isPending}>
              {t('championships.create')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteTarget} onOpenChange={() => setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('championships.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('championships.delete_desc', { name: deleteTarget?.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteCustom} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
