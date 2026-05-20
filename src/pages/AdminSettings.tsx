import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Navigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Settings, Mail, Trash2, ToggleLeft, Loader2, ArrowLeft, AlertTriangle,
  Shield, Users, CalendarDays, MessageSquare, Heart, Building2, Globe, Search, Database, Ticket, Bell, Archive,
  UserX, Play, RefreshCw, CheckCircle2, XCircle, Clock,
  Newspaper, Trophy, Eye, Star, Zap, Camera, FileText, Euro, Pencil, Check,
} from 'lucide-react';
import { useExchangeRates, useUpdateExchangeRate } from '@/hooks/use-exchange-rates';
import { CURRENCIES } from '@/lib/format-utils';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function authFetchInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

// ── Feature flags config ────────────────────────────────────────────────────

const FEATURES = [
  { key: 'feature_players',          icon: Users,         color: 'text-blue-500',    sub: false },
  { key: 'feature_watchlist',        icon: Eye,           color: 'text-cyan-500',    sub: true  },
  { key: 'feature_shadow_team',      icon: Shield,        color: 'text-orange-500',  sub: true  },
  { key: 'feature_fixtures',         icon: CalendarDays,  color: 'text-emerald-500', sub: false },
  { key: 'feature_my_matches',       icon: CalendarDays,  color: 'text-emerald-400', sub: true  },
  { key: 'feature_championships',    icon: Trophy,        color: 'text-yellow-500',  sub: false },
  { key: 'feature_my_championships', icon: Star,          color: 'text-yellow-400',  sub: true  },
  { key: 'feature_news',             icon: Newspaper,     color: 'text-slate-500',   sub: false },
  { key: 'feature_buzz',             icon: Zap,           color: 'text-orange-400',  sub: true  },
  { key: 'feature_instagram',        icon: Camera,        color: 'text-pink-400',    sub: true  },
  { key: 'feature_editorial',        icon: FileText,      color: 'text-slate-400',   sub: true  },
  { key: 'feature_community',        icon: MessageSquare, color: 'text-purple-500',  sub: false },
  { key: 'feature_club_profile',     icon: Building2,     color: 'text-teal-500',    sub: false },
  { key: 'feature_my_clubs',         icon: Heart,         color: 'text-red-400',     sub: true  },
  { key: 'feature_contacts',         icon: Users,         color: 'text-indigo-500',  sub: false },
  { key: 'feature_discover',         icon: Search,        color: 'text-green-500',   sub: false },
  { key: 'feature_map',              icon: Globe,         color: 'text-amber-500',   sub: false },
  { key: 'feature_booking',          icon: CalendarDays,  color: 'text-blue-400',    sub: false },
  { key: 'feature_affiliate',        icon: Heart,         color: 'text-pink-500',    sub: false },
  { key: 'feature_data_import',      icon: Database,      color: 'text-gray-500',    sub: false },
  { key: 'feature_my_tickets',       icon: Ticket,        color: 'text-orange-500',  sub: false },
] as const;

// ── Purge data config ───────────────────────────────────────────────────────

const PURGE_TYPES = [
  { key: 'players', icon: Users, color: 'text-red-500' },
  { key: 'reports', icon: Archive, color: 'text-red-400' },
  { key: 'contacts', icon: Users, color: 'text-red-400' },
  { key: 'fixtures', icon: CalendarDays, color: 'text-red-400' },
  { key: 'match_assignments', icon: CalendarDays, color: 'text-red-400' },
  { key: 'watchlists', icon: Search, color: 'text-red-400' },
  { key: 'shadow_teams', icon: Shield, color: 'text-red-400' },
  { key: 'community', icon: MessageSquare, color: 'text-red-400' },
  { key: 'tickets', icon: Ticket, color: 'text-red-400' },
  { key: 'notifications', icon: Bell, color: 'text-red-400' },
  { key: 'club_directory', icon: Building2, color: 'text-red-400' },
  { key: 'club_logos', icon: Database, color: 'text-red-400' },
  { key: 'cache', icon: Database, color: 'text-red-300' },
] as const;

function ExchangeRatesCard() {
  const { t } = useTranslation();
  const { data: rates = [], isLoading } = useExchangeRates();
  const updateRate = useUpdateExchangeRate();
  const [editing, setEditing] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const startEdit = (code: string, current: number) => {
    setEditing(code);
    setEditValue(String(current));
  };

  const saveEdit = (code: string) => {
    const v = parseFloat(editValue);
    if (isNaN(v) || v <= 0) { toast.error('Taux invalide'); return; }
    updateRate.mutate({ currency_code: code, rate_vs_eur: v }, {
      onSuccess: () => { toast.success('Taux mis à jour'); setEditing(null); },
      onError: () => toast.error('Erreur lors de la mise à jour'),
    });
  };

  const currencyDef = (code: string) => CURRENCIES.find(c => c.code === code);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Euro className="w-4 h-4 text-primary" />
          {t('admin_settings.exchange_rates_title')}
        </CardTitle>
        <CardDescription>{t('admin_settings.exchange_rates_desc')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">{t('admin_settings.exchange_rates_hint')}</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {rates.map(r => {
                const def = currencyDef(r.currency_code);
                const isEur = r.currency_code === 'EUR';
                return (
                  <div key={r.currency_code} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-border/60 bg-muted/20">
                    <span className="font-mono text-sm font-bold w-10 shrink-0 text-primary">{r.symbol || r.currency_code}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{def?.name ?? r.name_fr ?? r.currency_code}</p>
                      <p className="text-[10px] text-muted-foreground font-mono">{r.currency_code}</p>
                    </div>
                    {isEur ? (
                      <span className="text-sm font-mono text-muted-foreground">= 1.00</span>
                    ) : editing === r.currency_code ? (
                      <div className="flex items-center gap-1 shrink-0">
                        <input
                          type="number"
                          step="0.0001"
                          min="0.0001"
                          value={editValue}
                          onChange={e => setEditValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEdit(r.currency_code); if (e.key === 'Escape') setEditing(null); }}
                          className="w-20 h-7 text-xs px-2 rounded-lg border border-primary bg-background font-mono focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={() => saveEdit(r.currency_code)}
                          className="w-7 h-7 rounded-lg bg-primary text-primary-foreground flex items-center justify-center hover:bg-primary/90"
                        >
                          {updateRate.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-sm font-mono">{Number(r.rate_vs_eur).toFixed(4)}</span>
                        <button
                          onClick={() => startEdit(r.currency_code, Number(r.rate_vs_eur))}
                          className="w-6 h-6 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted flex items-center justify-center transition-colors"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {rates.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-2">
                {t('admin_settings.exchange_rates_updated')}: {new Date(rates[0]?.updated_at ?? '').toLocaleDateString('fr-FR')}
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminSettings() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const queryClient = useQueryClient();

  // ── Email test ──
  const [testEmail, setTestEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailResult, setEmailResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Fix player leagues ──
  const [fixingLeagues, setFixingLeagues] = useState(false);
  const [fixLeaguesResult, setFixLeaguesResult] = useState<{ ok: boolean; message: string } | null>(null);

  // ── Purge ──
  const [purgeConfirm, setPurgeConfirm] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  // ── Inactive-user cleanup ──
  const [cleanupConfirm, setCleanupConfirm] = useState(false);
  const [triggeringCleanup, setTriggeringCleanup] = useState(false);

  interface CleanupLog {
    id: string;
    started_at: string;
    finished_at: string | null;
    users_deleted: number;
    users_warned: number;
    status: 'running' | 'done' | 'failed';
    error_detail: string | null;
  }

  const { data: cleanupLogs = [], refetch: refetchCleanupLogs } = useQuery<CleanupLog[]>({
    queryKey: ['cron-cleanup-logs'],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/cron-cleanup-logs`, { ...authFetchInit() });
      if (!res.ok) return [];
      const data = await res.json();
      return data.logs ?? [];
    },
    enabled: isAdmin === true,
    staleTime: 30_000,
    refetchInterval: triggeringCleanup ? 3000 : false,
  });

  const handleTriggerCleanup = async (dryRun: boolean) => {
    setTriggeringCleanup(true);
    setCleanupConfirm(false);
    try {
      const res = await fetch(`${API}/admin/cron-cleanup-trigger`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ dry_run: dryRun }),
      });
      if (!res.ok) throw new Error('Failed');
      toast.success(dryRun ? t('admin_settings.cleanup_dry_run_started') : t('admin_settings.cleanup_started'));
      setTimeout(() => { refetchCleanupLogs(); setTriggeringCleanup(false); }, 3000);
    } catch {
      toast.error(t('common.error'));
      setTriggeringCleanup(false);
    }
  };

  // ── Feature flags ──
  const { data: flags = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/feature-flags`, { ...authFetchInit() });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: isAdmin === true,
    staleTime: 30_000,
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const res = await fetch(`${API}/admin/feature-flags`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ key, enabled }),
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-flags'] }),
  });

  const handleTestEmail = async () => {
    setSendingEmail(true);
    setEmailResult(null);
    try {
      const res = await fetch(`${API}/admin/test-email`, {
        method: 'POST', ...authFetchInit(),
        body: JSON.stringify({ to: testEmail || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmailResult({ ok: true, message: data.message });
      toast.success(t('admin_settings.email_sent'));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.error');
      setEmailResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setSendingEmail(false);
    }
  };

  const handleFixLeagues = async () => {
    setFixingLeagues(true);
    setFixLeaguesResult(null);
    try {
      const res = await fetch(`${API}/admin/fix-player-leagues`, {
        method: 'POST', ...authFetchInit(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      const msg = t('admin_settings.fix_leagues_done', {
        players: data.playersFixed,
        directory: data.directoryFixed,
        clubs: data.clubsScanned,
        defaultValue: `${data.playersFixed} joueurs et ${data.directoryFixed} clubs corrigés (${data.clubsScanned} clubs analysés).`,
      });
      setFixLeaguesResult({ ok: true, message: msg });
      toast.success(msg);
      queryClient.invalidateQueries({ queryKey: ['players'] });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t('common.error');
      setFixLeaguesResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setFixingLeagues(false);
    }
  };

  const handlePurge = async (type: string) => {
    setPurging(true);
    try {
      const res = await fetch(`${API}/admin/purge`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('admin_settings.purge_success', { count: data.deleted, type }));
      setPurgeConfirm(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPurging(false);
    }
  };

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  const isFlagEnabled = (key: string) => flags[key] !== false; // default: enabled

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('admin_settings.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('admin_settings.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* ── 1. Test Email ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4 text-primary" />
            {t('admin_settings.test_email_title')}
          </CardTitle>
          <CardDescription>{t('admin_settings.test_email_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder={t('admin_settings.test_email_placeholder')}
              className="max-w-sm"
              type="email"
            />
            <Button onClick={handleTestEmail} disabled={sendingEmail} className="shrink-0">
              {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
              {t('admin_settings.send_test')}
            </Button>
          </div>
          {emailResult && (
            <p className={`text-sm px-3 py-2 rounded-lg ${emailResult.ok ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'}`}>
              {emailResult.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 1bis. Fix player leagues ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Trophy className="w-4 h-4 text-primary" />
            {t('admin_settings.fix_leagues_title', { defaultValue: 'Corriger les championnats des joueurs' })}
          </CardTitle>
          <CardDescription>
            {t('admin_settings.fix_leagues_desc', {
              defaultValue: 'Recalcule le championnat de chaque joueur à partir de son club (via la table de correspondance club → championnat, alias compris). Utile après un import Wyscout qui a laissé « D1 / D2 » dans le champ championnat.',
            })}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={handleFixLeagues} disabled={fixingLeagues} className="shrink-0">
            {fixingLeagues ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <RefreshCw className="w-4 h-4 mr-2" />}
            {t('admin_settings.fix_leagues_btn', { defaultValue: 'Lancer la correction' })}
          </Button>
          {fixLeaguesResult && (
            <p className={`text-sm px-3 py-2 rounded-lg ${fixLeaguesResult.ok ? 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-400' : 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-400'}`}>
              {fixLeaguesResult.message}
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── 2. Feature Flags ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ToggleLeft className="w-4 h-4 text-primary" />
            {t('admin_settings.features_title')}
          </CardTitle>
          <CardDescription>{t('admin_settings.features_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-0.5">
            {FEATURES.map(f => {
              const enabled = isFlagEnabled(f.key);
              return (
                <div
                  key={f.key}
                  className={`flex items-center justify-between py-2 rounded-lg hover:bg-muted/50 transition-colors ${f.sub ? 'pl-8 pr-3' : 'px-3'}`}
                >
                  <div className="flex items-center gap-3">
                    {f.sub && <span className="w-px h-4 bg-border rounded-full shrink-0 -ml-4 mr-1" />}
                    <f.icon className={`w-4 h-4 shrink-0 ${f.color}`} />
                    <div>
                      <p className={`font-medium ${f.sub ? 'text-xs' : 'text-sm'}`}>{t(`admin_settings.flag_${f.key}`)}</p>
                      <p className="text-[11px] text-muted-foreground">{t(`admin_settings.flag_${f.key}_desc`)}</p>
                    </div>
                  </div>
                  <Switch
                    checked={enabled}
                    onCheckedChange={checked => toggleFlag.mutate({ key: f.key, enabled: checked })}
                  />
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Purge Data ── */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="w-4 h-4" />
            {t('admin_settings.purge_title')}
          </CardTitle>
          <CardDescription>{t('admin_settings.purge_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PURGE_TYPES.map(p => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                className="justify-start gap-2 text-xs border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setPurgeConfirm(p.key)}
              >
                <p.icon className="w-3.5 h-3.5" />
                {t(`admin_settings.purge_${p.key}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* ── 4. Inactive-user cleanup ── */}
      <Card className="border-amber-500/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-600 dark:text-amber-400">
            <UserX className="w-4 h-4" />
            {t('admin_settings.cleanup_title')}
          </CardTitle>
          <CardDescription>{t('admin_settings.cleanup_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/20"
              onClick={() => handleTriggerCleanup(true)}
              disabled={triggeringCleanup}
            >
              {triggeringCleanup ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
              {t('admin_settings.cleanup_dry_run')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-destructive/30 text-destructive hover:bg-destructive/5"
              onClick={() => setCleanupConfirm(true)}
              disabled={triggeringCleanup}
            >
              <Play className="w-4 h-4" />
              {t('admin_settings.cleanup_run')}
            </Button>
          </div>

          {cleanupLogs.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{t('admin_settings.cleanup_history')}</p>
              <div className="rounded-lg border overflow-hidden">
                {cleanupLogs.slice(0, 5).map(log => (
                  <div key={log.id} className="flex items-center justify-between px-3 py-2 text-xs border-b last:border-0 hover:bg-muted/30">
                    <div className="flex items-center gap-2">
                      {log.status === 'running' && <Clock className="w-3.5 h-3.5 text-blue-500 animate-spin" />}
                      {log.status === 'done' && <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />}
                      {log.status === 'failed' && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                      <span className="text-muted-foreground">{new Date(log.started_at).toLocaleString()}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      {log.status === 'done' && (
                        <>
                          <span className="text-red-600 font-medium">
                            {t('admin_settings.cleanup_deleted', { count: log.users_deleted })}
                          </span>
                          <span className="text-amber-600">
                            {t('admin_settings.cleanup_warned', { count: log.users_warned })}
                          </span>
                        </>
                      )}
                      {log.status === 'failed' && (
                        <span className="text-red-500">{log.error_detail?.slice(0, 40)}</span>
                      )}
                      {log.status === 'running' && (
                        <span className="text-blue-500">{t('admin_settings.cleanup_running')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground">{t('admin_settings.cleanup_schedule_info')}</p>
        </CardContent>
      </Card>

      {/* Cleanup confirmation dialog */}
      <AlertDialog open={cleanupConfirm} onOpenChange={setCleanupConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {t('admin_settings.cleanup_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin_settings.cleanup_confirm_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => handleTriggerCleanup(false)}
            >
              <UserX className="w-4 h-4 mr-2" />
              {t('admin_settings.cleanup_confirm_btn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 5. Exchange rates ── */}
      <ExchangeRatesCard />

      {/* Purge confirmation dialog */}
      <AlertDialog open={!!purgeConfirm} onOpenChange={open => !open && setPurgeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {t('admin_settings.purge_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin_settings.purge_confirm_desc', { type: purgeConfirm ? t(`admin_settings.purge_${purgeConfirm}`) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => purgeConfirm && handlePurge(purgeConfirm)}
              disabled={purging}
            >
              {purging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {t('admin_settings.purge_confirm_btn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
