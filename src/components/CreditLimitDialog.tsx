import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useCredits } from '@/hooks/use-credits';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Zap, Crown, TrendingUp, ArrowRight } from 'lucide-react';

const PLAN_LABELS: Record<string, string> = {
  starter: 'Starter',
  pro: 'Pro',
  elite: 'Elite',
};

const PLAN_UPGRADES: Record<string, { daily: number; weekly: number; monthly: number; name: string; color: string }> = {
  starter: { daily: 100,  weekly: 500,   monthly: 2000,     name: 'Pro',   color: 'text-violet-500' },
  pro:     { daily: -1,   weekly: -1,    monthly: -1,       name: 'Elite', color: 'text-amber-500' },
};

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreditLimitDialog({ open, onClose }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data } = useCredits();

  const planType = data?.plan_type ?? 'starter';
  const quotas = data?.quotas;
  const usage = data?.usage;
  const upgrade = PLAN_UPGRADES[planType];

  const periods = [
    { key: 'daily',   label: t('credits.daily'),   quota: quotas?.daily,   used: usage?.daily },
    { key: 'weekly',  label: t('credits.weekly'),  quota: quotas?.weekly,  used: usage?.weekly },
    { key: 'monthly', label: t('credits.monthly'), quota: quotas?.monthly, used: usage?.monthly },
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-md rounded-2xl">
        <DialogHeader>
          <div className="w-12 h-12 rounded-2xl bg-amber-500/10 flex items-center justify-center mb-2">
            <Zap className="w-6 h-6 text-amber-500" />
          </div>
          <DialogTitle className="text-lg font-extrabold">{t('credits.dialog_title')}</DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t('credits.dialog_desc')}
          </DialogDescription>
        </DialogHeader>

        {/* Current plan + usage */}
        <div className="space-y-3 py-1">
          <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-muted/50">
            <span className="text-sm text-muted-foreground">{t('credits.plan_label', { plan: '' }).trim()}</span>
            <span className="text-sm font-bold">{PLAN_LABELS[planType] ?? planType}</span>
          </div>
          {periods.map(p => {
            if (!p.quota || !p.used === undefined) return null;
            const pct = p.quota === -1 ? 0 : Math.min(100, Math.round(((p.used ?? 0) / p.quota) * 100));
            const over = p.quota !== -1 && (p.used ?? 0) >= p.quota;
            return (
              <div key={p.key} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{p.label}</span>
                  <span className={`font-semibold tabular-nums ${over ? 'text-destructive' : ''}`}>
                    {p.quota === -1 ? t('credits.unlimited') : `${p.used ?? 0} / ${p.quota}`}
                  </span>
                </div>
                {p.quota !== -1 && (
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${over ? 'bg-destructive' : pct >= 80 ? 'bg-amber-500' : 'bg-primary'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Upgrade CTA */}
        {upgrade && (
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 space-y-2">
            <div className="flex items-center gap-2">
              <Crown className={`w-4 h-4 ${upgrade.color}`} />
              <span className="text-sm font-bold">{t('credits.dialog_upgrade_title', { plan: upgrade.name })}</span>
            </div>
            <ul className="text-xs text-muted-foreground space-y-1">
              {upgrade.daily === -1 ? (
                <li className="flex items-center gap-1.5">
                  <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                  {t('credits.dialog_unlimited')}
                </li>
              ) : (
                <>
                  <li className="flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                    {t('credits.dialog_upgrade_daily', { count: upgrade.daily })}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                    {t('credits.dialog_upgrade_weekly', { count: upgrade.weekly })}
                  </li>
                  <li className="flex items-center gap-1.5">
                    <TrendingUp className="w-3 h-3 text-emerald-500 shrink-0" />
                    {t('credits.dialog_upgrade_monthly', { count: upgrade.monthly })}
                  </li>
                </>
              )}
            </ul>
          </div>
        )}

        <DialogFooter className="flex gap-2 pt-1">
          <Button variant="outline" className="flex-1 rounded-xl" onClick={onClose}>
            {t('common.close')}
          </Button>
          {upgrade && (
            <Button
              className="flex-1 rounded-xl gap-1.5"
              onClick={() => { onClose(); navigate('/pricing'); }}
            >
              <Crown className="w-4 h-4" />
              {t('credits.dialog_upgrade_cta', { plan: upgrade.name })}
              <ArrowRight className="w-3.5 h-3.5 ml-auto" />
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
