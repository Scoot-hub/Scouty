import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Navigate, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { ArrowLeft, Zap, Plus, Minus, Clock, TrendingUp, TrendingDown, History, RotateCcw, AlertTriangle, Settings2, Infinity as InfinityIcon, X } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface UserCreditRow {
  id: string;
  email: string;
  plan_type: string;
  used_today: number;
  used_week: number;
  used_month: number;
  used_total: number;
  earned_total: number;
}

interface CreditEvent {
  action_type: string;
  direction: 'earn' | 'spend';
  amount: number;
  description: string;
  created_at: string;
}

const PLAN_QUOTAS: Record<string, { daily: number; weekly: number; monthly: number }> = {
  starter: { daily: 10, weekly: 50, monthly: 150 },
  pro:     { daily: 100, weekly: 500, monthly: 2000 },
  elite:   { daily: -1, weekly: -1, monthly: -1 },
};

function pctColor(used: number, quota: number) {
  if (quota === -1) return 'text-yellow-500';
  const pct = quota === 0 ? 0 : used / quota;
  if (pct >= 0.9) return 'text-red-500';
  if (pct >= 0.7) return 'text-amber-500';
  return 'text-green-600';
}

function planBadge(plan: string) {
  if (plan === 'elite') return <Badge className="bg-yellow-500/20 text-yellow-700 dark:text-yellow-400 border-yellow-500/30">Elite</Badge>;
  if (plan === 'pro') return <Badge className="bg-blue-500/20 text-blue-700 dark:text-blue-400 border-blue-500/30">Pro</Badge>;
  return <Badge variant="secondary">Starter</Badge>;
}

function isSuspiciousValue(val: number) {
  return val > 10_000;
}

function formatLargeNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function actionLabel(action: string, direction: 'earn' | 'spend') {
  if (action === 'admin_grant') return direction === 'earn' ? 'Attribution admin' : 'Déduction admin';
  if (action === 'admin_reset') return 'Réinitialisation admin';
  if (action === 'enrichment') return 'Enrichissement';
  if (action === 'affiliate_reward') return 'Parrainage';
  if (action === 'assignment_confirmed') return 'Mission confirmée';
  if (action === 'statsbomb_compare') return 'Comparaison StatsBomb';
  return action;
}

// ── Period reset row ───────────────────────────────────────────────────────

type Period = 'daily' | 'weekly' | 'monthly' | 'earned';

interface PeriodRowProps {
  period: Period;
  label: string;
  current: number;
  quota: number;
  userId: string;
  onDone: () => void;
}

function PeriodRow({ period, label, current, quota, userId, onDone }: PeriodRowProps) {
  const [target, setTarget] = useState('');
  const suspicious = isSuspiciousValue(current);

  const setPeriod = useMutation({
    mutationFn: async (t: number) => {
      const res = await fetch('/api/admin/credits/set-period', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, period, target: t }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur'); }
      return res.json();
    },
    onSuccess: (_, t) => {
      const msg = period === 'earned'
        ? `⚡ Bonus total défini à ${t}`
        : `⚡ Consommation ${label.toLowerCase()} définie à ${t}`;
      toast.success(msg, { description: `${formatLargeNumber(current)} → ${t}` });
      setTarget('');
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const targetNum = target === '' ? null : Number(target);
  const canSet = targetNum !== null && targetNum >= 0 && Number.isFinite(targetNum) && !setPeriod.isPending;

  return (
    <div className={cn(
      'flex items-center gap-2 px-3 py-2 rounded-xl border',
      suspicious ? 'border-red-500/40 bg-red-500/5' : 'border-border bg-muted/30',
    )}>
      {/* Label + current value */}
      <div className="w-20 shrink-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn('text-sm font-bold tabular-nums',
          suspicious ? 'text-red-500'
          : period === 'earned' ? 'text-yellow-600 dark:text-yellow-400'
          : pctColor(current, quota))}>
          {suspicious && <AlertTriangle className="w-3 h-3 inline mr-0.5 mb-0.5" />}
          {period === 'earned' && !suspicious && <span className="mr-0.5">+</span>}
          {formatLargeNumber(current)}{quota !== -1 && <span className="text-muted-foreground font-normal">/{quota}</span>}
        </p>
      </div>

      {/* Target input */}
      <Input
        type="number"
        min={0}
        placeholder="Définir à…"
        value={target}
        onChange={e => setTarget(e.target.value)}
        className="h-8 rounded-lg text-xs flex-1"
        onKeyDown={e => { if (e.key === 'Enter' && canSet) setPeriod.mutate(targetNum!); }}
      />

      {/* Reset to 0 shortcut */}
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2 rounded-lg shrink-0 text-xs gap-1"
        title="Réinitialiser à 0"
        disabled={setPeriod.isPending || current === 0}
        onClick={() => setPeriod.mutate(0)}
      >
        {setPeriod.isPending
          ? <span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />
          : <RotateCcw className="w-3 h-3" />
        }
        0
      </Button>

      {/* Apply target button */}
      <Button
        size="sm"
        className="h-8 px-2.5 rounded-lg shrink-0 text-xs"
        disabled={!canSet}
        onClick={() => setPeriod.mutate(targetNum!)}
      >
        OK
      </Button>
    </div>
  );
}

// ── Quota editor ──────────────────────────────────────────────────────────

interface QuotaEditorProps {
  userId: string;
  planType: string;
  onDone: () => void;
}

function QuotaEditor({ userId, planType, onDone }: QuotaEditorProps) {
  const { t } = useTranslation();
  const planQ = PLAN_QUOTAS[planType] || PLAN_QUOTAS.starter;

  const { data: overrides, isLoading } = useQuery<{ daily: number | null; weekly: number | null; monthly: number | null }>({
    queryKey: ['admin-credit-quotas', userId],
    queryFn: async () => {
      const res = await fetch(`/api/admin/credits/quotas/${userId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    staleTime: 10_000,
  });

  const qc = useQueryClient();
  const [vals, setVals] = useState<{ daily: string; weekly: string; monthly: string }>({ daily: '', weekly: '', monthly: '' });
  const [loaded, setLoaded] = useState(false);

  // Populate inputs once overrides load
  if (overrides && !loaded) {
    setVals({
      daily:   overrides.daily   != null ? String(overrides.daily)   : '',
      weekly:  overrides.weekly  != null ? String(overrides.weekly)  : '',
      monthly: overrides.monthly != null ? String(overrides.monthly) : '',
    });
    setLoaded(true);
  }

  const save = useMutation({
    mutationFn: async () => {
      const toVal = (s: string) => s.trim() === '' ? null : s.trim() === '-1' ? -1 : Number(s);
      const res = await fetch('/api/admin/credits/set-quotas', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, daily: toVal(vals.daily), weekly: toVal(vals.weekly), monthly: toVal(vals.monthly) }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur'); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-credit-quotas', userId] });
      qc.invalidateQueries({ queryKey: ['admin-credits'] });
      toast.success('⚡ Plafonds mis à jour', { description: 'Les nouveaux quotas sont effectifs immédiatement.' });
      onDone();
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function clearAll() {
    setVals({ daily: '', weekly: '', monthly: '' });
  }

  const periods: { key: 'daily' | 'weekly' | 'monthly'; label: string; planDefault: number }[] = [
    { key: 'daily',   label: t('credits.daily'),   planDefault: planQ.daily },
    { key: 'weekly',  label: t('credits.weekly'),  planDefault: planQ.weekly },
    { key: 'monthly', label: t('credits.monthly'), planDefault: planQ.monthly },
  ];

  const hasAnyOverride = overrides?.daily != null || overrides?.weekly != null || overrides?.monthly != null;

  if (isLoading) return <div className="flex justify-center py-3"><span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <Settings2 className="w-3.5 h-3.5" />
          {t('credits.section_quotas')}
        </p>
        {hasAnyOverride && (
          <button
            type="button"
            className="text-[10px] text-muted-foreground hover:text-destructive flex items-center gap-1 transition-colors"
            onClick={() => { clearAll(); save.mutate(); }}
          >
            <X className="w-3 h-3" />
            {t('credits.reset_quotas')}
          </button>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2">
        {periods.map(({ key, label, planDefault }) => {
          const isOverridden = overrides?.[key] != null;
          const displayDefault = planDefault === -1 ? '∞' : String(planDefault);
          return (
            <div key={key} className={cn('rounded-xl border p-2.5 space-y-1.5', isOverridden ? 'border-primary/40 bg-primary/5' : 'border-border bg-muted/30')}>
              <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  min={-1}
                  placeholder={displayDefault}
                  value={vals[key]}
                  onChange={e => setVals(v => ({ ...v, [key]: e.target.value }))}
                  className="h-7 rounded-lg text-xs px-2 flex-1 min-w-0"
                />
                {planDefault === -1 && <InfinityIcon className="w-3 h-3 text-yellow-500 shrink-0" />}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {isOverridden
                  ? <span className="text-primary font-medium">{t('credits.quota_overridden', { val: overrides[key] === -1 ? '∞' : overrides[key] })}</span>
                  : t('credits.quota_default', { val: displayDefault })}
              </p>
            </div>
          );
        })}
      </div>

      <p className="text-[10px] text-muted-foreground px-1">{t('credits.quota_hint')}</p>

      <Button
        size="sm"
        className="w-full rounded-xl gap-1.5 h-8 text-xs"
        disabled={save.isPending}
        onClick={() => save.mutate()}
      >
        {save.isPending
          ? <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
          : <Settings2 className="w-3.5 h-3.5" />}
        {t('credits.save_quotas')}
      </Button>
    </div>
  );
}

// ── Manage dialog ──────────────────────────────────────────────────────────

interface ManageDialogProps {
  user: UserCreditRow | null;
  onClose: () => void;
}

function ManageDialog({ user, onClose }: ManageDialogProps) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [direction, setDirection] = useState<'earn' | 'spend'>('earn');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [showHistory, setShowHistory] = useState(false);

  const { data: history, isLoading: histLoading } = useQuery<{ email: string; events: CreditEvent[] }>({
    queryKey: ['admin-credits-history', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/admin/credits/history/${user!.id}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!user && showHistory,
    staleTime: 10_000,
  });

  const grant = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/admin/credits/grant', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user!.id, amount: Number(amount), direction, description }),
      });
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Erreur'); }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-credits'] });
      qc.invalidateQueries({ queryKey: ['admin-credits-history', user?.id] });
      toast.success(
        direction === 'earn'
          ? t('credits.grant_success', { amount, email: user?.email })
          : t('credits.deduct_success', { amount, email: user?.email }),
        { icon: '⚡' }
      );
      setAmount('');
      setDescription('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (!user) return null;

  const q = PLAN_QUOTAS[user.plan_type] || PLAN_QUOTAS.starter;
  const amountNum = Number(amount);
  const canSubmit = amount !== '' && amountNum > 0 && Number.isFinite(amountNum) && !grant.isPending;

  const periodRows: { period: Period; label: string; current: number; quota: number }[] = [
    { period: 'daily',   label: t('credits.daily'),        current: user.used_today,   quota: q.daily },
    { period: 'weekly',  label: t('credits.weekly'),       current: user.used_week,    quota: q.weekly },
    { period: 'monthly', label: t('credits.monthly'),      current: user.used_month,   quota: q.monthly },
    { period: 'earned',  label: t('credits.earned_label'), current: user.earned_total, quota: -1 },
  ];

  const hasSuspicious = periodRows.some(r => isSuspiciousValue(r.current));

  function refreshAll() {
    qc.invalidateQueries({ queryKey: ['admin-credits'] });
    qc.invalidateQueries({ queryKey: ['admin-credits-history', user?.id] });
  }

  return (
    <Dialog open={!!user} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center shrink-0">
              <Zap className="w-5 h-5 text-yellow-500" />
            </div>
            <div>
              <DialogTitle className="text-base font-bold">{t('credits.manage_title')}</DialogTitle>
              <DialogDescription className="text-xs font-mono truncate max-w-[260px]">{user.email}</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* ── Section 1 : Ajuster la consommation ── */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold">{t('credits.section_usage')}</p>
            {hasSuspicious && (
              <Badge variant="destructive" className="text-[10px] h-4 px-1.5 gap-0.5">
                <AlertTriangle className="w-2.5 h-2.5" />
                {t('credits.suspicious_values')}
              </Badge>
            )}
          </div>
          {periodRows.map(r => (
            <PeriodRow
              key={r.period}
              {...r}
              userId={user.id}
              onDone={refreshAll}
            />
          ))}
          <p className="text-[10px] text-muted-foreground px-1">{t('credits.set_period_hint')}</p>
        </div>

        <div className="border-t pt-3">
          <QuotaEditor userId={user.id} planType={user.plan_type} onDone={refreshAll} />
        </div>

        <div className="border-t pt-3 space-y-3">
          <p className="text-xs font-semibold">{t('credits.section_grant')}</p>

          {/* Direction toggle */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setDirection('earn')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-colors',
                direction === 'earn'
                  ? 'border-green-500/60 bg-green-500/10 text-green-700 dark:text-green-400'
                  : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70',
              )}
            >
              <Plus className="w-4 h-4" />
              {t('credits.add_credits')}
            </button>
            <button
              type="button"
              onClick={() => setDirection('spend')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-sm font-medium transition-colors',
                direction === 'spend'
                  ? 'border-red-500/60 bg-red-500/10 text-red-700 dark:text-red-400'
                  : 'border-border bg-muted/40 text-muted-foreground hover:bg-muted/70',
              )}
            >
              <Minus className="w-4 h-4" />
              {t('credits.deduct_credits')}
            </button>
          </div>

          {/* Amount */}
          <div className="space-y-1.5">
            <Label htmlFor="credit-amount">{t('credits.amount_label')}</Label>
            <Input
              id="credit-amount"
              type="number"
              min={1}
              placeholder="Ex : 50"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              className="rounded-xl"
              onKeyDown={e => { if (e.key === 'Enter' && canSubmit) grant.mutate(); }}
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="credit-desc">
              {t('credits.desc_label')} <span className="text-muted-foreground text-xs">({t('common.optional')})</span>
            </Label>
            <Textarea
              id="credit-desc"
              rows={2}
              placeholder={direction === 'earn' ? t('credits.desc_earn_placeholder') : t('credits.desc_deduct_placeholder')}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="rounded-xl resize-none text-sm"
            />
          </div>

          {/* Notification hint (earn only) */}
          {direction === 'earn' && (
            <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 bg-muted/40 rounded-lg px-3 py-2">
              <Zap className="w-3 h-3 text-yellow-500 shrink-0" />
              {t('credits.notify_hint')}
            </p>
          )}

          <DialogFooter className="flex gap-2 pt-1">
            <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button
              className={cn(
                'flex-1 rounded-xl gap-1.5',
                direction === 'spend' && 'bg-red-600 hover:bg-red-700 text-white',
              )}
              disabled={!canSubmit}
              onClick={() => grant.mutate()}
            >
              {grant.isPending ? (
                <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : direction === 'earn' ? (
                <><Plus className="w-4 h-4" />{t('credits.confirm_add')}</>
              ) : (
                <><Minus className="w-4 h-4" />{t('credits.confirm_deduct')}</>
              )}
            </Button>
          </DialogFooter>
        </div>

        {/* History toggle */}
        <button
          type="button"
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors mx-auto mt-1"
          onClick={() => setShowHistory(v => !v)}
        >
          <History className="w-3.5 h-3.5" />
          {showHistory ? t('credits.hide_history') : t('credits.show_history')}
        </button>

        {showHistory && (
          <div className="max-h-52 overflow-y-auto space-y-1 rounded-xl bg-muted/30 p-2">
            {histLoading ? (
              <div className="flex justify-center py-4">
                <span className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            ) : !history?.events.length ? (
              <p className="text-xs text-center text-muted-foreground py-4">{t('credits.history_empty')}</p>
            ) : (
              history.events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-xs px-2 py-1.5 rounded-lg hover:bg-muted/50">
                  <span className={cn('shrink-0', ev.direction === 'earn' ? 'text-green-500' : 'text-red-500')}>
                    {ev.direction === 'earn'
                      ? <TrendingUp className="w-3.5 h-3.5" />
                      : <TrendingDown className="w-3.5 h-3.5" />}
                  </span>
                  <span className={cn('font-mono font-semibold tabular-nums w-10 shrink-0', ev.direction === 'earn' ? 'text-green-600' : 'text-red-600')}>
                    {ev.direction === 'earn' ? '+' : '-'}{formatLargeNumber(ev.amount)}
                  </span>
                  <span className="flex-1 truncate text-muted-foreground">
                    {ev.description || actionLabel(ev.action_type, ev.direction)}
                  </span>
                  <span className="text-muted-foreground/60 flex items-center gap-0.5 shrink-0">
                    <Clock className="w-3 h-3" />
                    {new Date(ev.created_at).toLocaleDateString()}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function AdminCredits() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [managingUser, setManagingUser] = useState<UserCreditRow | null>(null);

  const { data: rows = [], isLoading } = useQuery<UserCreditRow[]>({
    queryKey: ['admin-credits'],
    queryFn: async () => {
      const res = await fetch('/api/admin/credits', { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
    staleTime: 30_000,
  });

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="flex items-center gap-3">
        <Link to="/admin">
          <Button variant="ghost" size="icon" className="rounded-xl">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('credits.admin_title')}</h1>
          <p className="text-sm text-muted-foreground">{t('credits.admin_subtitle')}</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('credits.admin_table_title')}</CardTitle>
          <CardDescription>{t('credits.admin_table_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">{t('credits.col_user')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">{t('credits.col_plan')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_today')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_week')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_month')}</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground text-right">{t('credits.col_total')}</th>
                    <th className="pb-2 pr-4 font-medium text-yellow-600 dark:text-yellow-400 text-right">{t('credits.col_earned')}</th>
                    <th className="pb-2 font-medium text-muted-foreground text-right">{t('credits.col_actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const q = PLAN_QUOTAS[row.plan_type] || PLAN_QUOTAS.starter;
                    const unlimited = q.daily === -1;
                    const anySuspicious = isSuspiciousValue(row.used_today) || isSuspiciousValue(row.used_week) || isSuspiciousValue(row.used_month);
                    return (
                      <tr key={row.id} className={cn('border-b last:border-0 hover:bg-muted/30 transition-colors', anySuspicious && 'bg-red-500/5')}>
                        <td className="py-2.5 pr-4 font-mono text-xs truncate max-w-[180px]">{row.email}</td>
                        <td className="py-2.5 pr-4">{planBadge(row.plan_type)}</td>
                        <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${isSuspiciousValue(row.used_today) ? 'text-red-500' : pctColor(row.used_today, q.daily)}`}>
                          {isSuspiciousValue(row.used_today) && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                          {unlimited ? `${formatLargeNumber(row.used_today)} / ∞` : `${formatLargeNumber(row.used_today)} / ${q.daily}`}
                        </td>
                        <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${isSuspiciousValue(row.used_week) ? 'text-red-500' : pctColor(row.used_week, q.weekly)}`}>
                          {isSuspiciousValue(row.used_week) && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                          {unlimited ? `${formatLargeNumber(row.used_week)} / ∞` : `${formatLargeNumber(row.used_week)} / ${q.weekly}`}
                        </td>
                        <td className={`py-2.5 pr-4 text-right font-medium tabular-nums ${isSuspiciousValue(row.used_month) ? 'text-red-500' : pctColor(row.used_month, q.monthly)}`}>
                          {isSuspiciousValue(row.used_month) && <AlertTriangle className="w-3 h-3 inline mr-0.5" />}
                          {unlimited ? `${formatLargeNumber(row.used_month)} / ∞` : `${formatLargeNumber(row.used_month)} / ${q.monthly}`}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-medium tabular-nums text-muted-foreground">
                          {formatLargeNumber(row.used_total)}
                        </td>
                        <td className="py-2.5 pr-4 text-right font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                          {row.earned_total > 0 ? `+${row.earned_total}` : '—'}
                        </td>
                        <td className="py-2.5 text-right">
                          <Button
                            size="sm"
                            variant={anySuspicious ? 'destructive' : 'outline'}
                            className="h-7 px-2.5 rounded-lg text-xs gap-1"
                            onClick={() => setManagingUser(row)}
                          >
                            {anySuspicious
                              ? <AlertTriangle className="w-3 h-3" />
                              : <Zap className="w-3 h-3 text-yellow-500" />}
                            {t('credits.manage_btn')}
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-muted-foreground text-sm">{t('credits.admin_empty')}</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <ManageDialog user={managingUser} onClose={() => setManagingUser(null)} />
    </div>
  );
}
