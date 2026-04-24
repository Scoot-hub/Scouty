import { useTranslation } from 'react-i18next';
import { useCredits } from '@/hooks/use-credits';
import { Zap } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

function bar(used: number, quota: number) {
  if (quota === -1) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

function color(pct: number) {
  if (pct >= 90) return 'text-red-500';
  if (pct >= 70) return 'text-amber-500';
  return 'text-green-500';
}

export default function CreditWidget() {
  const { t } = useTranslation();
  const { data } = useCredits();

  if (!data) return null;

  const { quotas, usage } = data;
  const unlimited = quotas.daily === -1;
  const pct = unlimited ? 0 : bar(usage.daily, quotas.daily);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link to="/account" className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/60 transition-colors">
          <Zap className={cn('w-3.5 h-3.5', unlimited ? 'text-yellow-500' : color(pct))} />
          <span className={cn('text-xs font-medium tabular-nums', unlimited ? 'text-yellow-500' : color(pct))}>
            {unlimited ? '∞' : `${quotas.daily - usage.daily}`}
          </span>
        </Link>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="w-52 space-y-2 p-3">
        <p className="text-xs font-semibold mb-2">{t('credits.widget_title')}</p>
        {unlimited ? (
          <p className="text-xs text-muted-foreground">{t('credits.unlimited')}</p>
        ) : (
          <>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">{t('credits.daily')}</span>
                <span className={color(bar(usage.daily, quotas.daily))}>{usage.daily}/{quotas.daily}</span>
              </div>
              <Progress value={bar(usage.daily, quotas.daily)} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">{t('credits.weekly')}</span>
                <span className={color(bar(usage.weekly, quotas.weekly))}>{usage.weekly}/{quotas.weekly}</span>
              </div>
              <Progress value={bar(usage.weekly, quotas.weekly)} className="h-1.5" />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-[11px]">
                <span className="text-muted-foreground">{t('credits.monthly')}</span>
                <span className={color(bar(usage.monthly, quotas.monthly))}>{usage.monthly}/{quotas.monthly}</span>
              </div>
              <Progress value={bar(usage.monthly, quotas.monthly)} className="h-1.5" />
            </div>
          </>
        )}
        {(usage.earned_total ?? 0) > 0 && (
          <p className="text-[11px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {t('credits.earned_bonus', { count: usage.earned_total })}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground pt-1 border-t">{t('credits.plan_label', { plan: t(`credits.plan_${data.plan_type}`) })}</p>
      </TooltipContent>
    </Tooltip>
  );
}
