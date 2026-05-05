import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { toast } from 'sonner';
import {
  ArrowLeft, Clock, CheckCircle2, XCircle, Play, RefreshCw, Loader2,
  CalendarDays, FileWarning, Trash2, Crown, UserX, Zap, Gauge, Timer, Minus,
} from 'lucide-react';

function authInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

interface CronLog {
  id: string;
  job_name: string;
  started_at: string;
  finished_at: string | null;
  status: 'running' | 'done' | 'failed';
  result_json: Record<string, unknown> | null;
  error_detail: string | null;
}

const JOB_META: Record<string, {
  label: string; desc: string; schedule: string;
  icon: React.ElementType; color: string;
  supportsDryRun: boolean;
}> = {
  'contract-alerts':     { label: 'Alertes contrats',          desc: 'Notifie les scouts pour les contrats expirant dans 30j, 7j ou aujourd\'hui.',  schedule: 'Chaque jour à 08:00',       icon: FileWarning,   color: 'text-amber-500',  supportsDryRun: true  },
  'match-reminders':     { label: 'Rappels de matchs',          desc: 'Rappel in-app + email pour les matchs planifiés le lendemain.',               schedule: 'Chaque jour à 07:00',       icon: CalendarDays,  color: 'text-blue-500',   supportsDryRun: true  },
  'token-cleanup':       { label: 'Nettoyage des tokens',       desc: 'Supprime les tokens expirés, codes 2FA périmés, notifications > 90j et ancien cache API.', schedule: 'Chaque jour à 04:30', icon: Trash2,        color: 'text-slate-500',  supportsDryRun: false },
  'subscription-expiry': { label: 'Expiration d\'abonnement',   desc: 'Prévient les utilisateurs dont l\'abonnement expire dans 7 jours.',          schedule: 'Chaque jour à 09:00',       icon: Crown,         color: 'text-yellow-500', supportsDryRun: true  },
  'nightly-enrichment':  { label: 'Enrichissement nocturne',    desc: 'Enrichit les données de tous les joueurs des utilisateurs premium.',          schedule: 'Chaque jour à 02:00',       icon: Zap,           color: 'text-purple-500', supportsDryRun: false },
  'inactive-cleanup':    { label: 'Comptes inactifs',           desc: 'Supprime les comptes sans activité depuis 5 ans. Avertit à 4 ans 11 mois.',   schedule: '1er du mois à 03:00',       icon: UserX,         color: 'text-red-500',    supportsDryRun: true  },
  'buzz-scrape':         { label: 'Buzz Football',              desc: 'Agrège les flux RSS des médias football (L\'Équipe, Goal, RMC...) pour la page Buzz.',  schedule: 'Toutes les 30 minutes', icon: Zap,           color: 'text-orange-500', supportsDryRun: false },
};

function resultSummary(log: CronLog): string {
  if (!log.result_json) return '';
  const r = log.result_json;
  const parts: string[] = [];
  if (r.notified != null)      parts.push(`${r.notified} alertes`);
  if (r.sent != null)          parts.push(`${r.sent} rappels`);
  if (r.warned != null && log.job_name === 'subscription-expiry') parts.push(`${r.warned} avertis`);
  if (r.users_deleted != null) parts.push(`${r.users_deleted} supprimés`);
  if (r.users_warned != null)  parts.push(`${r.users_warned} avertis`);
  if (r.reset_tokens != null)  parts.push(`${r.reset_tokens} tokens`);
  if (r.old_notifications != null) parts.push(`${r.old_notifications} notifs`);
  if (r.old_cache != null)     parts.push(`${r.old_cache} cache`);
  if (r.enriched != null)      parts.push(`${r.enriched} enrichis`);
  if (r.dry_run)               parts.push('(simulation)');
  return parts.join(' · ');
}

function duration(log: CronLog): string {
  if (!log.finished_at) return '…';
  const ms = new Date(log.finished_at).getTime() - new Date(log.started_at).getTime();
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function fmtMs(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(ms % 1000 === 0 ? 0 : 1)}s`;
  return `${ms}ms`;
}

type ScrapeSettings = Record<string, number>;

const PRESETS = [
  { label: 'Rapide',     icon: Gauge, player: 500,   user: 2000,  buzz: 200  },
  { label: 'Normal',     icon: Timer, player: 2000,  user: 5000,  buzz: 500  },
  { label: 'Lent',       icon: Minus, player: 5000,  user: 10000, buzz: 1500 },
  { label: 'Très lent',  icon: Minus, player: 10000, user: 20000, buzz: 3000 },
];

interface SliderRowProps {
  label: string;
  settingKey: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (key: string, val: number) => void;
  saved: boolean;
}

function SliderRow({ label, settingKey, min, max, step, value, onChange, saved }: SliderRowProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium text-foreground">{label}</span>
        <div className="flex items-center gap-2">
          {saved && (
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">Sauvegardé ✓</span>
          )}
          <span className="tabular-nums text-muted-foreground text-xs w-16 text-right">{fmtMs(value)}</span>
        </div>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={([v]) => onChange(settingKey, v)}
        className="w-full"
      />
      <div className="flex justify-between text-[10px] text-muted-foreground/60">
        <span>{fmtMs(min)}</span>
        <span>{fmtMs(max)}</span>
      </div>
    </div>
  );
}

function ScrapeThrottleCard() {
  const [settings, setSettings] = useState<ScrapeSettings>({
    scrape_delay_player_ms: 2000,
    scrape_delay_user_ms: 5000,
    scrape_delay_buzz_ms: 500,
  });
  const [savedKeys, setSavedKeys] = useState<Set<string>>(new Set());
  const debounceRefs = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    fetch('/api/admin/scrape-settings', authInit())
      .then(r => r.ok ? r.json() : {})
      .then((data: ScrapeSettings) => {
        setSettings(prev => ({ ...prev, ...data }));
      })
      .catch(() => {});
  }, []);

  const save = useCallback(async (key: string, value: number) => {
    try {
      const res = await fetch('/api/admin/scrape-settings', {
        method: 'POST',
        ...authInit(),
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error();
      setSavedKeys(s => new Set(s).add(key));
      setTimeout(() => setSavedKeys(s => { const n = new Set(s); n.delete(key); return n; }), 2500);
    } catch {
      toast.error('Erreur lors de la sauvegarde');
    }
  }, []);

  const handleChange = useCallback((key: string, val: number) => {
    setSettings(prev => ({ ...prev, [key]: val }));
    clearTimeout(debounceRefs.current[key]);
    debounceRefs.current[key] = setTimeout(() => save(key, val), 800);
  }, [save]);

  const applyPreset = useCallback((preset: typeof PRESETS[0]) => {
    const updates: ScrapeSettings = {
      scrape_delay_player_ms: preset.player,
      scrape_delay_user_ms: preset.user,
      scrape_delay_buzz_ms: preset.buzz,
    };
    setSettings(prev => ({ ...prev, ...updates }));
    for (const [key, val] of Object.entries(updates)) {
      clearTimeout(debounceRefs.current[key]);
      save(key, val);
    }
  }, [save]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <Gauge className="w-4 h-4 text-primary" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Throttle du scraping</CardTitle>
            <CardDescription className="text-xs mt-0.5">
              Délais entre les appels aux APIs externes. Augmentez si vous voyez des erreurs 429.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Presets */}
        <div className="flex flex-wrap gap-2">
          {PRESETS.map(preset => {
            const Icon = preset.icon;
            return (
              <Button
                key={preset.label}
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={() => applyPreset(preset)}
              >
                <Icon className="w-3 h-3" />
                {preset.label}
              </Button>
            );
          })}
        </div>

        {/* Group 1: Enrichissement nocturne */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-purple-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Enrichissement nocturne</span>
          </div>
          <SliderRow
            label="Délai entre chaque joueur"
            settingKey="scrape_delay_player_ms"
            min={0}
            max={10000}
            step={250}
            value={settings.scrape_delay_player_ms ?? 2000}
            onChange={handleChange}
            saved={savedKeys.has('scrape_delay_player_ms')}
          />
          <SliderRow
            label="Délai entre chaque utilisateur"
            settingKey="scrape_delay_user_ms"
            min={0}
            max={30000}
            step={1000}
            value={settings.scrape_delay_user_ms ?? 5000}
            onChange={handleChange}
            saved={savedKeys.has('scrape_delay_user_ms')}
          />
        </div>

        {/* Group 2: Buzz Football */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-orange-500" />
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Buzz Football</span>
          </div>
          <SliderRow
            label="Délai entre flux RSS"
            settingKey="scrape_delay_buzz_ms"
            min={0}
            max={5000}
            step={100}
            value={settings.scrape_delay_buzz_ms ?? 500}
            onChange={handleChange}
            saved={savedKeys.has('scrape_delay_buzz_ms')}
          />
        </div>

        {/* Hint */}
        <p className="text-[11px] text-muted-foreground/70 italic border-t pt-3">
          Ces délais s'appliquent aux prochaines exécutions. Augmentez-les si vous voyez des erreurs 429 (rate limit) dans la console.
        </p>
      </CardContent>
    </Card>
  );
}

export default function AdminCrons() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();
  const [running, setRunning] = useState<Set<string>>(new Set());

  const { data: logs = [], isLoading } = useQuery<CronLog[]>({
    queryKey: ['cron-job-logs'],
    queryFn: async () => {
      const res = await fetch('/api/admin/cron-job-logs', authInit());
      if (!res.ok) return [];
      const d = await res.json();
      return d.logs ?? [];
    },
    enabled: isAdmin === true,
    refetchInterval: running.size > 0 ? 3000 : 15000,
  });

  const trigger = async (job: string, dryRun: boolean) => {
    setRunning(s => new Set(s).add(job));
    try {
      const res = await fetch('/api/admin/cron-trigger', {
        method: 'POST', ...authInit(),
        body: JSON.stringify({ job, dry_run: dryRun }),
      });
      if (!res.ok) throw new Error();
      toast.success(dryRun ? t('crons.started_dry') : t('crons.started'));
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['cron-job-logs'] });
        setRunning(s => { const n = new Set(s); n.delete(job); return n; });
      }, 2500);
    } catch {
      toast.error(t('common.error'));
      setRunning(s => { const n = new Set(s); n.delete(job); return n; });
    }
  };

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  // Last log per job
  const lastByJob: Record<string, CronLog> = {};
  for (const log of logs) {
    if (!lastByJob[log.job_name]) lastByJob[log.job_name] = log;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="icon" className="rounded-xl"><ArrowLeft className="w-5 h-5" /></Button>
        </Link>
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Clock className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('crons.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('crons.subtitle')}</p>
        </div>
      </div>

      {/* Scrape throttle controls */}
      <ScrapeThrottleCard />

      {/* Job cards */}
      <div className="grid gap-4">
        {Object.entries(JOB_META).map(([jobKey, meta]) => {
          const Icon = meta.icon;
          const last = lastByJob[jobKey];
          const isRunning = running.has(jobKey) || last?.status === 'running';

          return (
            <Card key={jobKey}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg bg-muted flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${meta.color}`} />
                    </div>
                    <div>
                      <CardTitle className="text-sm font-semibold">{meta.label}</CardTitle>
                      <CardDescription className="text-xs mt-0.5">{meta.desc}</CardDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {meta.supportsDryRun && (
                      <Button
                        variant="outline" size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => trigger(jobKey, true)}
                        disabled={isRunning}
                      >
                        {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                        {t('crons.dry_run')}
                      </Button>
                    )}
                    <Button
                      variant="outline" size="sm"
                      className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                      onClick={() => trigger(jobKey, false)}
                      disabled={isRunning}
                    >
                      {isRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
                      {t('crons.run')}
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {meta.schedule}
                  </span>
                  {last ? (
                    <div className="flex items-center gap-2">
                      {last.status === 'running' && <Badge variant="secondary" className="text-[10px] gap-1"><Loader2 className="w-2.5 h-2.5 animate-spin" />En cours</Badge>}
                      {last.status === 'done'    && <Badge variant="secondary" className="text-[10px] bg-green-500/10 text-green-700 dark:text-green-400 border-green-500/20"><CheckCircle2 className="w-2.5 h-2.5 mr-1" />OK</Badge>}
                      {last.status === 'failed'  && <Badge variant="destructive" className="text-[10px]"><XCircle className="w-2.5 h-2.5 mr-1" />Erreur</Badge>}
                      <span>{new Date(last.started_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })}</span>
                      <span className="text-muted-foreground/60">{duration(last)}</span>
                      {last.status === 'done' && resultSummary(last) && (
                        <span className="text-primary/70">{resultSummary(last)}</span>
                      )}
                      {last.status === 'failed' && last.error_detail && (
                        <span className="text-red-500 truncate max-w-[200px]">{last.error_detail}</span>
                      )}
                    </div>
                  ) : (
                    <span className="italic">{t('crons.never_run')}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Full log history */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('crons.history_title')}</CardTitle>
          <CardDescription>{t('crons.history_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-6"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
          ) : logs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">{t('crons.no_history')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4 font-medium">{t('crons.col_job')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('crons.col_started')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('crons.col_duration')}</th>
                    <th className="pb-2 pr-4 font-medium">{t('crons.col_status')}</th>
                    <th className="pb-2 font-medium">{t('crons.col_result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {logs.slice(0, 50).map(log => (
                    <tr key={log.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-4 font-medium">{JOB_META[log.job_name]?.label ?? log.job_name}</td>
                      <td className="py-2 pr-4 text-muted-foreground tabular-nums">
                        {new Date(log.started_at).toLocaleString('fr-FR', { day:'2-digit', month:'2-digit', year:'2-digit', hour:'2-digit', minute:'2-digit' })}
                      </td>
                      <td className="py-2 pr-4 tabular-nums text-muted-foreground">{duration(log)}</td>
                      <td className="py-2 pr-4">
                        {log.status === 'running' && <span className="text-blue-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />En cours</span>}
                        {log.status === 'done'    && <span className="text-green-600 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" />OK</span>}
                        {log.status === 'failed'  && <span className="text-red-500 flex items-center gap-1"><XCircle className="w-3 h-3" />Erreur</span>}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {log.status === 'done' ? resultSummary(log) : log.error_detail?.slice(0, 60)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
