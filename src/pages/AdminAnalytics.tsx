import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Navigate, Link } from 'react-router-dom';
import {
  Users, Crown, TrendingUp, BarChart3, Zap, Star, Building2,
  CalendarDays, Eye, FileText, MessageSquare, Shield, ArrowLeft,
  Activity, UserPlus, CreditCard, Sparkles, Target, Contact,
  Monitor, Smartphone, Tablet, Globe, Clock, Radio, RefreshCw,
  ChevronRight, X as XIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { getOpinionTranslationKey, type Opinion } from '@/types/player';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// ── Live session types ────────────────────────────────────────────────────────

interface LiveSession {
  user_id: string; session_id: string; device_type: 'desktop' | 'mobile' | 'tablet';
  browser: string | null; os: string | null; screen_width: number | null; screen_height: number | null;
  language: string | null; current_page: string | null; page_category: string | null; ip_address: string | null;
  country: string | null; country_code: string | null; city: string | null; geo_from_client: number;
  country_source?: 'gps' | 'profile' | 'ip';
  profile_country?: string | null;
  window_count?: number;
  started_at: string; last_seen_at: string; session_seconds: number;
  email: string; display_name: string; photo_url: string | null;
}
interface LiveData {
  online_count: number; avg_session_seconds: number;
  device_breakdown: Record<string, number>;
  browser_breakdown: Record<string, number>;
  os_breakdown: Record<string, number>;
  country_breakdown: { country: string; country_code: string; count: number }[];
  category_breakdown: Record<string, number>;
  sessions: LiveSession[];
}
interface UserSessionDetail {
  user: { email: string; last_sign_in_at: string; display_name: string; photo_url: string | null } | null;
  sessions: (LiveSession & { session_seconds: number })[];
}

function useLive() {
  return useQuery<LiveData>({
    queryKey: ['admin-analytics-live'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/analytics/live`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 15_000,
  });
}

function useUserSession(userId: string | null) {
  return useQuery<UserSessionDetail>({
    queryKey: ['admin-analytics-live-user', userId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/analytics/live/${userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!userId,
    staleTime: 10_000,
    refetchInterval: 15_000,
  });
}

// ── Live section components ───────────────────────────────────────────────────

function fmtDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

const DEVICE_ICONS: Record<string, React.ElementType> = {
  desktop: Monitor, mobile: Smartphone, tablet: Tablet,
};

function DeviceIcon({ type, className }: { type: string; className?: string }) {
  const Icon = DEVICE_ICONS[type] || Monitor;
  return <Icon className={className} />;
}

function LiveKpiBar({ label, breakdown, total }: { label: string; breakdown: Record<string, number>; total: number }) {
  const colors = ['bg-primary', 'bg-sky-500', 'bg-orange-500', 'bg-emerald-500', 'bg-purple-500', 'bg-pink-500'];
  const entries = Object.entries(breakdown).sort((a, b) => b[1] - a[1]);
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-2">{label}</p>
      <div className="flex rounded-full overflow-hidden h-2 mb-2 bg-muted">
        {entries.map(([k, v], i) => (
          <div key={k} className={cn(colors[i % colors.length], 'transition-all')}
            style={{ width: `${Math.round((v / Math.max(total, 1)) * 100)}%` }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {entries.map(([k, v], i) => (
          <span key={k} className="flex items-center gap-1 text-xs text-muted-foreground">
            <span className={cn('w-2 h-2 rounded-full shrink-0', colors[i % colors.length])} />
            {k} <span className="font-medium text-foreground">{v}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function UserDrawer({ userId, onClose }: { userId: string; onClose: () => void }) {
  const { data, isLoading } = useUserSession(userId);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 1000); return () => clearInterval(t); }, []);

  return (
    <div className="fixed inset-y-0 right-0 w-full sm:w-[420px] z-50 flex flex-col bg-background border-l shadow-2xl">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="font-bold text-base">Détails de la session</h2>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <XIcon className="w-4 h-4" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {isLoading ? (
          <div className="flex justify-center py-12"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>
        ) : !data ? null : (
          <>
            {/* User info */}
            <div className="flex items-center gap-3">
              {data.user?.photo_url ? (
                <img src={data.user.photo_url} className="w-12 h-12 rounded-full object-cover" alt="" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center text-lg font-bold text-primary">
                  {(data.user?.display_name || '?')[0].toUpperCase()}
                </div>
              )}
              <div>
                <p className="font-semibold">{data.user?.display_name}</p>
                <p className="text-xs text-muted-foreground">{data.user?.email}</p>
                {data.user?.last_sign_in_at && (
                  <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                    Dernière connexion : {new Date(data.user.last_sign_in_at).toLocaleString('fr-FR')}
                  </p>
                )}
              </div>
            </div>

            {/* Sessions */}
            <div>
              <div className="flex items-center gap-2 mb-2">
                <p className="text-xs font-semibold text-muted-foreground">Sessions récentes</p>
                {(data.sessions[0]?.window_count ?? 1) > 1 && (
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600">
                    {data.sessions[0].window_count} fenêtres ouvertes
                  </span>
                )}
              </div>
              <div className="space-y-2">
                {data.sessions.map((s, i) => {
                  const isActive = new Date(s.last_seen_at).getTime() > Date.now() - 120_000;
                  const elapsed = isActive
                    ? Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000)
                    : s.session_seconds;
                  return (
                    <div key={s.session_id} className={cn('rounded-xl border p-3 space-y-2', isActive ? 'border-green-500/30 bg-green-500/5' : 'bg-muted/30')}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          {isActive && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                          <DeviceIcon type={s.device_type} className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium">{s.device_type}</span>
                          {s.browser && <Badge variant="outline" className="text-[10px] px-1.5">{s.browser}</Badge>}
                          {s.os && <Badge variant="outline" className="text-[10px] px-1.5">{s.os}</Badge>}
                        </div>
                        <span className="text-[10px] text-muted-foreground font-mono">{fmtDuration(elapsed)}</span>
                      </div>
                      {s.screen_width && (
                        <p className="text-[10px] text-muted-foreground">Écran : {s.screen_width}×{s.screen_height}</p>
                      )}
                      {s.current_page && (
                        <p className="text-[10px] text-muted-foreground font-mono truncate">Page : {s.current_page}</p>
                      )}
                      {s.country_code && (
                        <div className="flex items-center gap-1">
                          <CountryFlag code={s.country_code} size={12} />
                          <span className="text-[10px] text-muted-foreground">
                            {s.city ? `${s.city}, ` : ''}{s.country || s.country_code}
                          </span>
                          {s.country_source === 'gps' && <span className="text-[9px] text-emerald-500 font-semibold">📍 GPS</span>}
                          {s.country_source === 'profile' && <span className="text-[9px] text-sky-500 font-semibold">👤 Profil</span>}
                          {s.country_source === 'ip' && <span className="text-[9px] text-muted-foreground/50">~ IP</span>}
                        </div>
                      )}
                      {!s.country_code && s.profile_country && (
                        <p className="text-[10px] text-muted-foreground/50">Profil : {s.profile_country} (code inconnu)</p>
                      )}
                      {s.ip_address && (
                        <p className="text-[10px] text-muted-foreground">IP : {s.ip_address}</p>
                      )}
                      <p className="text-[10px] text-muted-foreground/60">
                        Début : {new Date(s.started_at).toLocaleString('fr-FR')}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function LiveDashboard() {
  const { data, isLoading, isFetching, refetch, dataUpdatedAt } = useLive();
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(v => v + 1), 1000); return () => clearInterval(t); }, []);

  const secondsSinceUpdate = dataUpdatedAt ? Math.floor((Date.now() - dataUpdatedAt) / 1000) : 0;

  if (isLoading || !data) return (
    <div className="flex justify-center py-16"><div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" /></div>
  );

  const d = data;
  const sessions = d.sessions ?? [];

  return (
    <div className="space-y-6">
      {/* Refresh bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Radio className="w-3.5 h-3.5 text-green-500 animate-pulse" />
          Actualisé il y a {secondsSinceUpdate}s — toutes les 15s
          {isFetching && <RefreshCw className="w-3 h-3 animate-spin ml-1" />}
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="rounded-xl gap-1.5 text-xs h-7">
          <RefreshCw className="w-3 h-3" /> Actualiser
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="card-warm border-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-green-500/15 flex items-center justify-center shrink-0">
              <Radio className="w-5 h-5 text-green-500" />
            </div>
            <div>
              <p className="text-2xl font-extrabold">{d.online_count}</p>
              <p className="text-xs text-muted-foreground">En ligne</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-warm border-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Clock className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-extrabold">{fmtDuration(d.avg_session_seconds)}</p>
              <p className="text-xs text-muted-foreground">Durée moy.</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-warm border-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-500/10 flex items-center justify-center shrink-0">
              <Monitor className="w-5 h-5 text-sky-500" />
            </div>
            <div>
              <p className="text-2xl font-extrabold">{(d.device_breakdown ?? {})['desktop'] ?? 0}</p>
              <p className="text-xs text-muted-foreground">Desktop</p>
            </div>
          </CardContent>
        </Card>
        <Card className="card-warm border-none">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <Smartphone className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-2xl font-extrabold">{((d.device_breakdown ?? {})['mobile'] ?? 0) + ((d.device_breakdown ?? {})['tablet'] ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Mobile / Tablette</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown bars */}
      {sessions.length > 0 && (
        <>
          <div className="grid sm:grid-cols-3 gap-4">
            <Card className="card-warm border-none">
              <CardContent className="p-4">
                <LiveKpiBar label="Appareils" breakdown={d.device_breakdown ?? {}} total={d.online_count} />
              </CardContent>
            </Card>
            <Card className="card-warm border-none">
              <CardContent className="p-4">
                <LiveKpiBar label="Navigateurs" breakdown={d.browser_breakdown ?? {}} total={d.online_count} />
              </CardContent>
            </Card>
            <Card className="card-warm border-none">
              <CardContent className="p-4">
                <LiveKpiBar label="Systèmes" breakdown={d.os_breakdown ?? {}} total={d.online_count} />
              </CardContent>
            </Card>
          </div>

          <div className="grid sm:grid-cols-2 gap-4">
            {/* Country breakdown */}
            {(d.country_breakdown ?? []).length > 0 && (
              <Card className="card-warm border-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Globe className="w-4 h-4 text-primary" />
                    Provenance géographique
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-1.5">
                  {(d.country_breakdown ?? []).slice(0, 8).map(c => (
                    <div key={c.country_code} className="flex items-center gap-2">
                      <CountryFlag code={c.country_code} size={14} />
                      <span className="text-xs flex-1 truncate">{c.country}</span>
                      <div className="flex items-center gap-1.5">
                        <div className="h-1.5 rounded-full bg-primary/20 w-20 overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((c.count / d.online_count) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-medium w-4 text-right">{c.count}</span>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {/* Section breakdown */}
            {Object.keys(d.category_breakdown ?? {}).length > 0 && (
              <Card className="card-warm border-none">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2">
                    <Activity className="w-4 h-4 text-primary" />
                    Section en cours
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 pt-0 space-y-1.5">
                  {Object.entries(d.category_breakdown ?? {})
                    .sort((a, b) => b[1] - a[1])
                    .map(([cat, count]) => {
                      const meta = SECTION_META[cat] ?? SECTION_META.other;
                      return (
                        <div key={cat} className="flex items-center gap-2">
                          <span className="text-sm">{meta.emoji}</span>
                          <span className="text-xs flex-1">{meta.label}</span>
                          <div className="flex items-center gap-1.5">
                            <div className="h-1.5 rounded-full bg-muted w-20 overflow-hidden">
                              <div className={cn('h-full rounded-full', meta.color)} style={{ width: `${Math.round((count / d.online_count) * 100)}%` }} />
                            </div>
                            <span className="text-xs font-medium w-4 text-right">{count}</span>
                          </div>
                        </div>
                      );
                    })}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}

      {/* Users table */}
      <Card className="card-warm border-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Users className="w-4 h-4 text-primary" />
            Utilisateurs actifs ({sessions.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {sessions.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground text-sm">
              <Radio className="w-8 h-8 mx-auto mb-3 opacity-20" />
              Aucun utilisateur connecté actuellement.
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {sessions.map(s => {
                const elapsed = Math.floor((Date.now() - new Date(s.started_at).getTime()) / 1000);
                return (
                  <button key={s.session_id}
                    onClick={() => setSelectedUser(s.user_id === selectedUser ? null : s.user_id)}
                    className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors text-left">
                    {/* Avatar */}
                    <div className="relative shrink-0">
                      {s.photo_url ? (
                        <img src={s.photo_url} className="w-8 h-8 rounded-full object-cover" alt="" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
                          {(s.display_name || s.email)[0].toUpperCase()}
                        </div>
                      )}
                      <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-green-500 border-2 border-background" />
                    </div>
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{s.display_name}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{s.email}</p>
                    </div>
                    {/* Device + browser */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <DeviceIcon type={s.device_type} className="w-3.5 h-3.5 text-muted-foreground" />
                      {s.browser && <span className="text-[10px] text-muted-foreground hidden sm:inline">{s.browser}</span>}
                      {(s.window_count ?? 1) > 1 && (
                        <span title={`${s.window_count} fenêtres ouvertes`} className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-600 shrink-0">
                          ×{s.window_count}
                        </span>
                      )}
                    </div>
                    {/* Location */}
                    <div className="hidden lg:flex items-center gap-1 w-32 shrink-0">
                      {s.country_code ? (
                        <>
                          <CountryFlag code={s.country_code} size={14} />
                          <span className="text-[10px] text-muted-foreground truncate">{s.city || s.country || s.country_code}</span>
                          {s.country_source === 'gps' && <span title="Position GPS précise (carte)" className="text-[9px] text-emerald-500 font-bold shrink-0">📍</span>}
                          {s.country_source === 'profile' && <span title="Pays du profil utilisateur" className="text-[9px] text-sky-500 font-bold shrink-0">👤</span>}
                          {s.country_source === 'ip' && <span title="Estimation par IP" className="text-[8px] text-muted-foreground/50 shrink-0">~</span>}
                        </>
                      ) : (
                        <span className="text-[10px] text-muted-foreground/40">—</span>
                      )}
                    </div>
                    {/* Page / Section */}
                    <div className="hidden md:block w-28 shrink-0">
                      {s.page_category && SECTION_META[s.page_category] ? (
                        <span className="text-[10px] font-medium text-muted-foreground">{SECTION_META[s.page_category].emoji} {SECTION_META[s.page_category].label}</span>
                      ) : (
                        <p className="text-[10px] text-muted-foreground font-mono truncate">{s.current_page || '—'}</p>
                      )}
                    </div>
                    {/* Duration */}
                    <div className="shrink-0 text-right">
                      <p className="text-xs font-mono font-medium">{fmtDuration(elapsed)}</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                  </button>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User detail drawer */}
      {selectedUser && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setSelectedUser(null)} />
          <UserDrawer userId={selectedUser} onClose={() => setSelectedUser(null)} />
        </>
      )}
    </div>
  );
}

type Range = '1d' | '7d' | '30d' | '90d' | '1y' | 'all';

const RANGES: { value: Range; label: string }[] = [
  { value: '1d', label: 'analytics.range_1d' },
  { value: '7d', label: 'analytics.range_7d' },
  { value: '30d', label: 'analytics.range_30d' },
  { value: '90d', label: 'analytics.range_90d' },
  { value: '1y', label: 'analytics.range_1y' },
  { value: 'all', label: 'analytics.range_all' },
];

interface Analytics {
  users: { total_users: number; new_users: number; active_users: number; active_today: number; active_7d: number; active_30d: number; users_2fa: number };
  subscriptions: { premium_users: number; new_premium: number; churned: number; plan_breakdown: { plan: string; billing_cycle: string | null; count: number }[] };
  players: { total_players: number; new_players: number; enriched_players: number; enriched_period: number; avg_players_per_user: number };
  reports: { total_reports: number; new_reports: number };
  organizations: { total_orgs: number; total_org_members: number };
  matches: { total_matches: number; new_matches: number; status_breakdown: { status: string; count: number }[] };
  engagement: { total_watchlists: number; total_shadow_teams: number; total_contacts: number };
  feedback: { total_feedback: number; avg_rating: number; rating_breakdown: { rating: number; count: number }[] };
  enrichment: { enrichment_notifs: number };
  timeSeries: { users: { period: string; count: number }[]; players: { period: string; count: number }[]; premium: { period: string; count: number }[] };
  topUsers: { email: string; player_count: number }[];
  opinionBreakdown: { general_opinion: string; count: number }[];
  timeBySection: { category: string; avg_seconds: number; total_seconds: number; user_count: number }[];
  locationBreakdown: { country: string; country_code: string; user_count: number; has_precise_geo: number }[];
}

// ── Section pole constants ────────────────────────────────────────────────────
const SECTION_META: Record<string, { label: string; color: string; emoji: string }> = {
  players:       { label: 'Joueurs',        color: 'bg-primary',     emoji: '⚽' },
  championships: { label: 'Championnats',   color: 'bg-sky-500',     emoji: '🏆' },
  clubs:         { label: 'Clubs',          color: 'bg-emerald-500', emoji: '🏟️' },
  community:     { label: 'Communauté',     color: 'bg-violet-500',  emoji: '👥' },
  news:          { label: 'Actualités',     color: 'bg-orange-500',  emoji: '📰' },
  matches:       { label: 'Matchs',         color: 'bg-red-500',     emoji: '📋' },
  organizations: { label: 'Organisations', color: 'bg-teal-500',    emoji: '🏢' },
  dashboard:     { label: 'Tableau de bord', color: 'bg-yellow-500', emoji: '📊' },
  account:       { label: 'Compte',         color: 'bg-pink-500',    emoji: '👤' },
  other:         { label: 'Autre',          color: 'bg-muted-foreground', emoji: '•' },
};

function fmtSeconds(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h${Math.floor((s % 3600) / 60)}m`;
}

function CountryFlag({ code, size = 16 }: { code: string; size?: number }) {
  const lower = code.toLowerCase();
  return (
    <span className={`fi fi-${lower} rounded-sm shrink-0`} style={{ width: size, height: Math.round(size * 0.75), display: 'inline-block' }} />
  );
}

function useAnalytics(range: Range) {
  return useQuery<Analytics>({
    queryKey: ['admin-analytics', range],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/analytics?range=${range}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch analytics');
      return res.json();
    },
    staleTime: 60_000,
  });
}

// Simple sparkline-style bar chart
function MiniBarChart({ data, color = 'bg-primary' }: { data: { label: string; value: number }[]; color?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  return (
    <div className="flex items-end gap-1 h-16">
      {data.map((d, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-0.5 group relative">
          <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-foreground text-background text-[10px] px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
            {d.label}: {d.value}
          </div>
          <div className={cn('w-full rounded-t-sm transition-all', color)} style={{ height: `${Math.max((d.value / max) * 100, 4)}%` }} />
        </div>
      ))}
    </div>
  );
}

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star key={i} className={cn('w-4 h-4', i <= Math.round(rating) ? 'text-amber-500 fill-amber-500' : 'text-muted-foreground/30')} />
      ))}
      <span className="ml-1.5 text-sm font-bold">{rating.toFixed(1)}</span>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub, trend, className }: {
  icon: React.ElementType; label: string; value: string | number; sub?: string; trend?: string; className?: string;
}) {
  return (
    <Card className={cn('border-none card-warm', className)}>
      <CardContent className="p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-muted-foreground font-medium">{label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-extrabold font-mono">{value}</p>
              {trend && <span className="text-xs font-semibold text-success">{trend}</span>}
            </div>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Ticket Word Cloud ─────────────────────────────────────────────────────────

interface WordFreq { word: string; count: number; }
interface PlacedWord extends WordFreq { x: number; y: number; r: number; colorIdx: number; }

const BUBBLE_COLORS = [
  '#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#84cc16',
];

function placeWords(words: WordFreq[]): PlacedWord[] {
  if (!words.length) return [];
  const maxC = Math.max(...words.map(w => w.count));
  const minC = Math.min(...words.map(w => w.count));
  const range = maxC - minC || 1;
  const placed: PlacedWord[] = [];

  words.forEach((item, idx) => {
    const t = (item.count - minC) / range;
    const r = Math.round(26 + t * 54); // radius 26–80
    let found = false;
    // Golden-angle spiral outward from center
    for (let step = 0; step < 800 && !found; step++) {
      const angle = step * 2.39996; // golden angle in radians
      const dist = step * 2.2;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist * 0.72; // slight vertical squish
      if (placed.every(p => Math.hypot(x - p.x, y - p.y) >= r + p.r + 6)) {
        placed.push({ ...item, x, y, r, colorIdx: idx % BUBBLE_COLORS.length });
        found = true;
      }
    }
    if (!found) {
      // Fallback: place at an offset without collision check
      placed.push({ ...item, x: (idx - words.length / 2) * (r * 2 + 8), y: 0, r, colorIdx: idx % BUBBLE_COLORS.length });
    }
  });
  return placed;
}

function TicketWordCloud() {
  const { data, isLoading } = useQuery<WordFreq[]>({
    queryKey: ['admin-ticket-word-cloud'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/analytics/ticket-words`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 5 * 60_000,
  });

  const [zoom, setZoom] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

  const placed = useMemo(() => placeWords(data ?? []), [data]);

  const { vbX, vbY, vbW, vbH } = useMemo(() => {
    if (!placed.length) return { vbX: -300, vbY: -200, vbW: 600, vbH: 400 };
    const pad = 24;
    const minX = Math.min(...placed.map(p => p.x - p.r)) - pad;
    const minY = Math.min(...placed.map(p => p.y - p.r)) - pad;
    const maxX = Math.max(...placed.map(p => p.x + p.r)) + pad;
    const maxY = Math.max(...placed.map(p => p.y + p.r)) + pad;
    return { vbX: minX, vbY: minY, vbW: maxX - minX, vbH: maxY - minY };
  }, [placed]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.min(5, Math.max(0.3, z * (e.deltaY > 0 ? 0.92 : 1.09))));
  }, []);

  if (isLoading) {
    return <div className="flex justify-center py-16"><div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" /></div>;
  }
  if (!placed.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <MessageSquare className="w-8 h-8 mb-2 opacity-20" />
        <p className="text-sm">Aucun message dans le centre d'aide.</p>
      </div>
    );
  }

  const maxCount = Math.max(...placed.map(p => p.count));

  return (
    <div
      ref={containerRef}
      className="relative rounded-xl bg-muted/20 overflow-hidden select-none"
      style={{ height: 460 }}
      onWheel={handleWheel}
    >
      {/* Zoom controls */}
      <div className="absolute top-3 right-3 z-10 flex items-center gap-1">
        <button
          onClick={() => setZoom(z => Math.min(5, z * 1.2))}
          className="w-7 h-7 rounded-lg bg-background/80 backdrop-blur border text-sm font-bold hover:bg-muted transition-colors flex items-center justify-center"
        >+</button>
        <button
          onClick={() => setZoom(1)}
          className="h-7 px-2 rounded-lg bg-background/80 backdrop-blur border text-[10px] font-medium hover:bg-muted transition-colors"
        >{Math.round(zoom * 100)}%</button>
        <button
          onClick={() => setZoom(z => Math.max(0.3, z * 0.83))}
          className="w-7 h-7 rounded-lg bg-background/80 backdrop-blur border text-sm font-bold hover:bg-muted transition-colors flex items-center justify-center"
        >−</button>
      </div>
      <p className="absolute bottom-2 left-3 text-[10px] text-muted-foreground/40 pointer-events-none">
        Molette ou boutons pour zoomer
      </p>

      <svg
        viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
        className="w-full h-full"
        style={{ transform: `scale(${zoom})`, transformOrigin: 'center center', transition: 'transform 0.1s ease-out' }}
      >
        <defs>
          {BUBBLE_COLORS.map((color, i) => (
            <radialGradient key={i} id={`wcg-${i}`} cx="38%" cy="32%" r="70%">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0.05" />
            </radialGradient>
          ))}
        </defs>

        {placed.map(p => {
          const color = BUBBLE_COLORS[p.colorIdx];
          const opacity = 0.45 + (p.count / maxCount) * 0.55;
          const fontSize = Math.max(8, Math.min(p.r * 0.36, 13));
          const countSize = Math.max(7, fontSize * 0.72);

          return (
            <g key={p.word} style={{ opacity }}>
              {/* Outer glow circle */}
              <circle cx={p.x} cy={p.y} r={p.r + 3} fill={color} fillOpacity="0.04" />
              {/* Main bubble */}
              <circle cx={p.x} cy={p.y} r={p.r} fill={`url(#wcg-${p.colorIdx})`} stroke={color} strokeWidth="1.5" strokeOpacity="0.45" />
              {/* Word */}
              <text
                x={p.x} y={p.y - countSize * 0.6}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={fontSize}
                fontWeight="700"
                fill={color}
                style={{ letterSpacing: '-0.02em', fontFamily: 'inherit' }}
              >
                {p.word.length > Math.floor(p.r * 0.28) ? p.word.slice(0, Math.max(3, Math.floor(p.r * 0.28))) + '…' : p.word}
              </text>
              {/* Count */}
              <text
                x={p.x} y={p.y + fontSize * 0.8}
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize={countSize}
                fill={color}
                fillOpacity="0.65"
                style={{ fontFamily: 'inherit', fontVariantNumeric: 'tabular-nums' }}
              >
                {p.count}×
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export default function AdminAnalytics() {
  const { t, i18n } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [range, setRange] = useState<Range>('30d');
  const [activeTab, setActiveTab] = useState<'live' | 'stats'>('live');
  const { data, isLoading } = useAnalytics(range);

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  const rangeLabel = t(RANGES.find(r => r.value === range)!.label);

  const formatDate = (d: string) => {
    if (d.includes('-') && d.length === 7) return new Date(d + '-01').toLocaleDateString(i18n.language, { month: 'short', year: '2-digit' });
    if (d.includes('-') && d.length === 10) return new Date(d).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' });
    return d;
  };

  const pct = (a: number, b: number) => b > 0 ? `${Math.round((a / b) * 100)}%` : '—';

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin" className="w-9 h-9 rounded-xl bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-primary" />
              {t('analytics.title')}
            </h1>
            <p className="text-sm text-muted-foreground">{t('analytics.subtitle')}</p>
          </div>
        </div>

        {activeTab === 'stats' && (
          <div className="flex items-center gap-1 bg-muted/50 rounded-xl p-1">
            {RANGES.map(r => (
              <button key={r.value} onClick={() => setRange(r.value)}
                className={cn('px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  range === r.value ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground hover:bg-muted')}>
                {t(r.label)}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-muted/40 rounded-xl p-1 w-fit">
        <button onClick={() => setActiveTab('live')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'live' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          <Radio className="w-4 h-4 text-green-500" />
          Live
        </button>
        <button onClick={() => setActiveTab('stats')}
          className={cn('flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
            activeTab === 'stats' ? 'bg-card shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground')}>
          <BarChart3 className="w-4 h-4 text-primary" />
          Statistiques
        </button>
      </div>

      {/* Live tab */}
      {activeTab === 'live' && <LiveDashboard />}

      {/* Stats tab */}
      {activeTab === 'stats' && (isLoading || !data ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="border-none"><CardContent className="p-5"><div className="h-16 bg-muted/50 rounded-xl animate-pulse" /></CardContent></Card>
          ))}
        </div>
      ) : (
        <>
          {/* Section 1: Users */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Users className="w-4 h-4" /> {t('analytics.section_users')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label={t('analytics.total_users')} value={data.users.total_users} />
              <StatCard icon={UserPlus} label={t('analytics.new_users')} value={data.users.new_users} sub={rangeLabel} />
              <StatCard icon={Activity} label={t('analytics.active_users')} value={data.users.active_users} sub={rangeLabel} trend={pct(data.users.active_users, data.users.total_users)} />
              <StatCard icon={Shield} label={t('analytics.users_2fa')} value={data.users.users_2fa} sub={pct(data.users.users_2fa, data.users.total_users) + ' ' + t('analytics.adoption')} />
            </div>

            <div className="grid grid-cols-3 gap-4 mt-4">
              <Card className="border-none card-warm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{t('analytics.active_today')}</p>
                  <p className="text-xl font-extrabold font-mono mt-1">{data.users.active_today}</p>
                </CardContent>
              </Card>
              <Card className="border-none card-warm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{t('analytics.active_7d')}</p>
                  <p className="text-xl font-extrabold font-mono mt-1">{data.users.active_7d}</p>
                </CardContent>
              </Card>
              <Card className="border-none card-warm">
                <CardContent className="p-4 text-center">
                  <p className="text-xs text-muted-foreground">{t('analytics.active_30d')}</p>
                  <p className="text-xl font-extrabold font-mono mt-1">{data.users.active_30d}</p>
                </CardContent>
              </Card>
            </div>
          </div>

          {/* Section 2: Revenue / Subscriptions */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <CreditCard className="w-4 h-4" /> {t('analytics.section_revenue')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Crown} label={t('analytics.premium_users')} value={data.subscriptions.premium_users} sub={pct(data.subscriptions.premium_users, data.users.total_users) + ' ' + t('analytics.conversion')} />
              <StatCard icon={TrendingUp} label={t('analytics.new_premium')} value={data.subscriptions.new_premium} sub={rangeLabel} />
              <StatCard icon={CreditCard} label={t('analytics.mrr_estimate')} value={(() => {
                let mrr = 0;
                for (const p of data.subscriptions.plan_breakdown) {
                  const prices: Record<string, number> = { scout: 19, pro: 29, elite: 99 };
                  const price = prices[p.plan] || 0;
                  mrr += p.billing_cycle === 'annual' ? Math.round((price * 10 / 12) * p.count) : price * p.count;
                }
                return `${mrr}€`;
              })()} sub={t('analytics.mrr_desc')} />
              <StatCard icon={Activity} label={t('analytics.churn')} value={data.subscriptions.churned} sub={t('analytics.churn_desc')} />
            </div>

            {/* Plan breakdown */}
            {data.subscriptions.plan_breakdown.length > 0 && (
              <Card className="border-none card-warm mt-4">
                <CardContent className="p-5">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">{t('analytics.plan_breakdown')}</p>
                  <div className="flex flex-wrap gap-2">
                    {data.subscriptions.plan_breakdown.map((p, i) => (
                      <Badge key={i} variant="secondary" className="text-sm py-1 px-3">
                        <Crown className="w-3 h-3 mr-1.5" />
                        {p.plan} {p.billing_cycle && `(${p.billing_cycle})`} — <span className="font-bold ml-1">{p.count}</span>
                      </Badge>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Section 3: Content & Enrichment */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4" /> {t('analytics.section_content')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Users} label={t('analytics.total_players')} value={data.players.total_players} sub={`+${data.players.new_players} ${rangeLabel}`} />
              <StatCard icon={Zap} label={t('analytics.enriched')} value={data.players.enriched_players} sub={pct(data.players.enriched_players, data.players.total_players) + ' ' + t('analytics.of_total')} />
              <StatCard icon={Sparkles} label={t('analytics.enriched_period')} value={data.players.enriched_period} sub={rangeLabel} />
              <StatCard icon={Target} label={t('analytics.avg_per_user')} value={data.players.avg_players_per_user} sub={t('analytics.players_per_user')} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
              <StatCard icon={FileText} label={t('analytics.total_reports')} value={data.reports.total_reports} sub={`+${data.reports.new_reports} ${rangeLabel}`} />
              <StatCard icon={Eye} label={t('analytics.watchlists')} value={data.engagement.total_watchlists} />
              <StatCard icon={Users} label={t('analytics.shadow_teams')} value={data.engagement.total_shadow_teams} />
              <StatCard icon={Contact} label={t('analytics.contacts')} value={data.engagement.total_contacts} />
            </div>
          </div>

          {/* Section 4: Organizations & Matches */}
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-muted-foreground mb-3 flex items-center gap-2">
              <Building2 className="w-4 h-4" /> {t('analytics.section_orgs')}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatCard icon={Building2} label={t('analytics.orgs')} value={data.organizations.total_orgs} sub={`${data.organizations.total_org_members} ${t('analytics.members')}`} />
              <StatCard icon={CalendarDays} label={t('analytics.matches')} value={data.matches.total_matches} sub={`+${data.matches.new_matches} ${rangeLabel}`} />
              {data.matches.status_breakdown.map(s => (
                <Card key={s.status} className="border-none card-warm">
                  <CardContent className="p-4 text-center">
                    <p className="text-xs text-muted-foreground capitalize">{s.status}</p>
                    <p className="text-xl font-extrabold font-mono mt-1">{s.count}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Section 5: Time Series Charts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* User registrations */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <UserPlus className="w-4 h-4 text-primary" />
                  {t('analytics.registrations')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-5">
                {data.timeSeries.users.length > 0 ? (
                  <MiniBarChart data={data.timeSeries.users.map(d => ({ label: formatDate(d.period), value: d.count }))} color="bg-primary" />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{t('analytics.no_data')}</p>
                )}
              </CardContent>
            </Card>

            {/* Player creations */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Users className="w-4 h-4 text-primary" />
                  {t('analytics.player_creations')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-5">
                {data.timeSeries.players.length > 0 ? (
                  <MiniBarChart data={data.timeSeries.players.map(d => ({ label: formatDate(d.period), value: d.count }))} color="bg-accent" />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{t('analytics.no_data')}</p>
                )}
              </CardContent>
            </Card>

            {/* Premium conversions */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  {t('analytics.premium_conversions')}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0 pb-4 px-5">
                {data.timeSeries.premium.length > 0 ? (
                  <MiniBarChart data={data.timeSeries.premium.map(d => ({ label: formatDate(d.period), value: d.count }))} color="bg-amber-500" />
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-4">{t('analytics.no_data')}</p>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Section 6: Feedback & Top Users */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Feedback */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  {t('analytics.feedback')}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">{t('analytics.avg_rating')}</p>
                    <RatingStars rating={data.feedback.avg_rating} />
                  </div>
                  <Badge variant="secondary">{data.feedback.total_feedback} {t('analytics.responses')}</Badge>
                </div>
                {data.feedback.rating_breakdown.length > 0 && (
                  <div className="space-y-1.5">
                    {[5, 4, 3, 2, 1].map(r => {
                      const entry = data.feedback.rating_breakdown.find(e => e.rating === r);
                      const count = entry?.count || 0;
                      const pctVal = data.feedback.total_feedback > 0 ? (count / data.feedback.total_feedback) * 100 : 0;
                      return (
                        <div key={r} className="flex items-center gap-2 text-xs">
                          <span className="w-3 text-right font-medium">{r}</span>
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full transition-all" style={{ width: `${pctVal}%` }} />
                          </div>
                          <span className="w-6 text-right text-muted-foreground">{count}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Top users */}
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary" />
                  {t('analytics.top_users')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {data.topUsers.map((u, i) => (
                    <div key={i} className="flex items-center gap-3 py-1.5">
                      <span className={cn(
                        'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0',
                        i === 0 ? 'bg-amber-500/20 text-amber-600' : i === 1 ? 'bg-gray-300/30 text-gray-500' : i === 2 ? 'bg-orange-400/20 text-orange-500' : 'bg-muted text-muted-foreground'
                      )}>{i + 1}</span>
                      <span className="text-sm truncate flex-1">{u.email}</span>
                      <Badge variant="outline" className="font-mono text-xs">{u.player_count}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Section 7: Opinion breakdown */}
          {data.opinionBreakdown.length > 0 && (
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Target className="w-4 h-4 text-primary" />
                  {t('analytics.opinion_breakdown')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3">
                  {data.opinionBreakdown.map((o, i) => {
                    const colors: Record<string, string> = { 'À suivre': 'bg-success/15 text-success', 'À revoir': 'bg-amber-500/15 text-amber-600', 'Défavorable': 'bg-destructive/15 text-destructive' };
                    return (
                      <div key={i} className={cn('px-4 py-2.5 rounded-xl', colors[o.general_opinion] || 'bg-muted text-muted-foreground')}>
                        <p className="text-xs font-medium">{o.general_opinion ? t(getOpinionTranslationKey(o.general_opinion as Opinion)) : t('analytics.not_set')}</p>
                        <p className="text-xl font-extrabold font-mono">{o.count}</p>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 8: Time spent by section */}
          {(data.timeBySection ?? []).length > 0 && (
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Clock className="w-4 h-4 text-primary" />
                  Temps passé par pôle ({rangeLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                {/* KPI row — top 4 sections */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {(data.timeBySection ?? []).slice(0, 4).map(s => {
                    const meta = SECTION_META[s.category] ?? SECTION_META.other;
                    return (
                      <div key={s.category} className="bg-muted/40 rounded-xl p-3 text-center">
                        <p className="text-lg mb-0.5">{meta.emoji}</p>
                        <p className="text-xl font-extrabold font-mono">{fmtSeconds(Math.round(s.avg_seconds))}</p>
                        <p className="text-[10px] text-muted-foreground">{meta.label}</p>
                        <p className="text-[10px] text-muted-foreground/60">{s.user_count} utilisateur{s.user_count > 1 ? 's' : ''}</p>
                      </div>
                    );
                  })}
                </div>
                {/* Full bar chart */}
                <div className="space-y-2">
                  {(() => {
                    const maxTotal = Math.max(...(data.timeBySection ?? []).map(s => s.total_seconds), 1);
                    return (data.timeBySection ?? []).map(s => {
                      const meta = SECTION_META[s.category] ?? SECTION_META.other;
                      const pctWidth = Math.round((s.total_seconds / maxTotal) * 100);
                      return (
                        <div key={s.category} className="flex items-center gap-3">
                          <span className="text-sm w-5 text-center">{meta.emoji}</span>
                          <span className="text-xs w-28 shrink-0">{meta.label}</span>
                          <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                            <div className={cn('h-full rounded-full transition-all', meta.color)} style={{ width: `${pctWidth}%` }} />
                          </div>
                          <span className="text-xs font-mono w-12 text-right text-muted-foreground">{fmtSeconds(Math.round(s.avg_seconds))}/user</span>
                        </div>
                      );
                    });
                  })()}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section 9: Geographic breakdown */}
          {(data.locationBreakdown ?? []).length > 0 && (
            <Card className="border-none card-warm">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-bold flex items-center gap-2">
                  <Globe className="w-4 h-4 text-primary" />
                  Provenance géographique ({rangeLabel})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {(() => {
                    const maxUsers = Math.max(...(data.locationBreakdown ?? []).map(l => l.user_count), 1);
                    return (data.locationBreakdown ?? []).map((l, i) => (
                      <div key={l.country_code} className="flex items-center gap-3">
                        <span className="text-xs text-muted-foreground w-5 text-right shrink-0">{i + 1}</span>
                        <CountryFlag code={l.country_code} size={16} />
                        <span className="text-xs flex-1 truncate">{l.country}</span>
                        <div className="flex-1 max-w-[160px] h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-primary rounded-full" style={{ width: `${Math.round((l.user_count / maxUsers) * 100)}%` }} />
                        </div>
                        <span className="text-xs font-mono font-medium w-8 text-right">{l.user_count}</span>
                        {l.has_precise_geo === 1 && (
                          <span title="Géolocalisation précise disponible" className="text-[9px] text-emerald-500 font-medium">GPS</span>
                        )}
                      </div>
                    ));
                  })()}
                </div>
                <p className="text-[10px] text-muted-foreground/60 mt-3">
                  Basé sur l'IP (géolocalisation approximative). Le badge <span className="text-emerald-500 font-medium">GPS</span> indique qu'au moins un utilisateur de ce pays a partagé sa position précise depuis la carte.
                </p>
              </CardContent>
            </Card>
          )}

          {/* Section 10: Ticket word cloud */}
          <Card className="border-none card-warm">
            <CardHeader className="pb-1">
              <CardTitle className="text-sm font-bold flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-primary" />
                Mots-clés du centre d'aide
              </CardTitle>
              <p className="text-xs text-muted-foreground">
                Mots les plus fréquents dans les tickets et messages support. La taille de la bulle reflète la fréquence.
              </p>
            </CardHeader>
            <CardContent className="pt-2">
              <TicketWordCloud />
            </CardContent>
          </Card>
        </>
      ))}
    </div>
  );
}
