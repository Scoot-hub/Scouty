import { useTranslation } from 'react-i18next';
import { useCredits } from '@/hooks/use-credits';
import { Zap } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────

function bar(used: number, quota: number) {
  if (quota === -1) return 0;
  return Math.min(100, Math.round((used / quota) * 100));
}

/**
 * 6-level color scale based on % USED.
 * When `hasEarned` = true (user has earned bonus credits from affiliation),
 * the low-usage levels shift to emerald/teal to signal boosted capacity.
 */
export function creditStyle(pct: number, hasEarned = false): { textClass: string; hex: string } {
  if (pct >= 90) return { textClass: 'text-red-500',    hex: '#ef4444' };
  if (pct >= 78) return { textClass: 'text-orange-500', hex: '#f97316' };
  if (pct >= 62) return { textClass: 'text-amber-500',  hex: '#f59e0b' };
  if (pct >= 42) return { textClass: 'text-yellow-500', hex: '#eab308' };
  if (pct >= 18) return hasEarned
    ? { textClass: 'text-emerald-400', hex: '#34d399' }
    : { textClass: 'text-green-500',   hex: '#22c55e' };
  return hasEarned
    ? { textClass: 'text-emerald-300', hex: '#6ee7b7' }
    : { textClass: 'text-green-400',   hex: '#4ade80' };
}

// ── Spark particles ───────────────────────────────────────────────────────────

function Spark({ angle, delay }: { angle: number; delay: number }) {
  return (
    <span
      className="animate-zap-spark pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 rounded-full bg-yellow-300"
      style={{ '--spark-angle': `${angle}deg`, '--spark-delay': `${delay}ms` } as React.CSSProperties}
    />
  );
}
const SPARK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

// ── Odometer number ───────────────────────────────────────────────────────────
// Shows one number at a time; when value changes, old scrolls out and new scrolls in
// like a slot machine — downward scroll for decrease, upward for increase.

type OdoPhase = 'idle' | 'exit' | 'enter';

function OdometerNumber({
  value,
  direction,
  className,
}: {
  value: string;
  direction: 'spend' | 'earn' | null;
  className?: string;
}) {
  const [phase, setPhase] = useState<OdoPhase>('idle');
  const [exitVal, setExitVal] = useState(value);
  const [enterVal, setEnterVal] = useState(value);
  const prevRef = useRef(value);
  const timer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (value === prevRef.current) return;
    clearTimeout(timer.current);
    setExitVal(prevRef.current);
    setEnterVal(value);
    setPhase('exit');
    prevRef.current = value;
    // After the exit + enter animation (~280ms), reset to idle
    timer.current = setTimeout(() => setPhase('idle'), 340);
  }, [value]);

  const exitClass  = direction === 'earn' ? 'odo-exit-up'    : 'odo-exit-down';
  const enterClass = direction === 'earn' ? 'odo-enter-bottom': 'odo-enter-top';

  return (
    <span
      className={cn('relative inline-block overflow-hidden', className)}
      style={{ lineHeight: 1 }}
    >
      {phase === 'idle' && (
        <span className="inline-block">{value}</span>
      )}
      {(phase === 'exit' || phase === 'enter') && (
        <>
          {/* Old value exits */}
          <span className={cn('inline-block', exitClass)}>{exitVal}</span>
          {/* New value enters — stacked on same line via absolute */}
          <span className={cn('absolute inset-0 flex items-center justify-center', enterClass)}>
            {enterVal}
          </span>
        </>
      )}
    </span>
  );
}

// ── Floating delta badge ──────────────────────────────────────────────────────
// "+N" (green, floats up) or "-N" (red, floats down) that appears near the widget

interface DeltaEvent { id: number; delta: number }

function FloatingDelta({ events }: { events: DeltaEvent[] }) {
  return (
    <>
      {events.map(ev => (
        <span
          key={ev.id}
          className={cn(
            'pointer-events-none absolute -top-1 left-1/2 -translate-x-1/2 z-50',
            'text-[11px] font-extrabold tabular-nums px-1 py-0.5 rounded-full shadow-sm',
            ev.delta > 0
              ? 'delta-float-down bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
              : 'delta-float-up   bg-red-500/15     text-red-600     dark:text-red-400     border border-red-500/30',
          )}
        >
          {ev.delta > 0 ? `+${ev.delta}` : `${ev.delta}`}
        </span>
      ))}
    </>
  );
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function CreditWidget() {
  const { t } = useTranslation();
  const { data } = useCredits();

  const prevRemainingRef = useRef<number | null>(null);
  const [consumeAnim, setConsumeAnim] = useState(false);
  const [sparks, setSparks] = useState(false);
  const [odoDir, setOdoDir] = useState<'spend' | 'earn' | null>(null);
  const [deltaEvents, setDeltaEvents] = useState<DeltaEvent[]>([]);
  const deltaCounter = useRef(0);
  const consumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!data) return;

    const unlimited = data.quotas.daily === -1;
    const remaining  = unlimited ? -1 : data.quotas.daily - data.usage.daily;
    const prev = prevRemainingRef.current;

    if (prev !== null && remaining !== prev && !unlimited) {
      const delta = remaining - prev; // negative = spend, positive = earn
      const dir: 'spend' | 'earn' = delta < 0 ? 'spend' : 'earn';

      setOdoDir(dir);

      // Spark + flash only on spend
      if (dir === 'spend') {
        setConsumeAnim(false);
        setSparks(false);
        requestAnimationFrame(() => requestAnimationFrame(() => {
          setConsumeAnim(true);
          setSparks(true);
          if (consumeTimerRef.current) clearTimeout(consumeTimerRef.current);
          consumeTimerRef.current = setTimeout(() => {
            setConsumeAnim(false);
            setSparks(false);
          }, 800);
        }));
      }

      // Floating delta badge
      const id = ++deltaCounter.current;
      setDeltaEvents(prev => [...prev, { id, delta }]);
      setTimeout(() => {
        setDeltaEvents(prev => prev.filter(e => e.id !== id));
      }, 850);

      // Reset direction after animation
      setTimeout(() => setOdoDir(null), 400);
    }
    prevRemainingRef.current = remaining;
  }, [data?.usage.daily, data?.usage.earned_total]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return null;

  const { quotas, usage } = data;
  const unlimited = quotas.daily === -1;
  const hasEarned = (usage.earned_total ?? 0) > 0;
  const pct = unlimited ? 0 : bar(usage.daily, quotas.daily);
  const { textClass, hex } = creditStyle(pct, hasEarned);
  const remainingNum = quotas.daily - usage.daily;
  const remaining = unlimited ? '∞' : String(remainingNum);
  const remainingLabel = unlimited ? '∞' : `${remainingNum}/${quotas.daily}`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          to="/account#credits"
          className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-muted/60 transition-colors"
        >
          {/* Icon with sparks */}
          <span className="relative flex items-center justify-center">
            <Zap
              className={cn(
                'w-3.5 h-3.5 transition-none',
                unlimited ? 'text-yellow-500' : textClass,
                consumeAnim && 'animate-zap-flash',
              )}
            />
            {sparks && SPARK_ANGLES.map((angle, i) => (
              <Spark key={angle} angle={angle} delay={i * 18} />
            ))}
          </span>

          {/* Odometer number + floating delta */}
          <span className="relative flex items-center gap-0.5">
            <OdometerNumber
              value={remaining}
              direction={odoDir}
              className={cn(
                'text-xs font-medium tabular-nums',
                unlimited ? 'text-yellow-500' : textClass,
              )}
            />
            {!unlimited && (
              <span className={cn('text-xs tabular-nums', textClass)}>
                /{quotas.daily}
              </span>
            )}
            <FloatingDelta events={deltaEvents} />
          </span>
        </Link>
      </TooltipTrigger>

      <TooltipContent side="bottom" className="w-52 space-y-2 p-3">
        <p className="text-xs font-semibold mb-2">{t('credits.widget_title')}</p>
        {unlimited ? (
          <>
            <p className="text-xs text-muted-foreground">{t('credits.unlimited')}</p>
            <p className="text-[11px] text-violet-600 dark:text-violet-400 flex items-center gap-1 pt-1 border-t border-border/40">
              <Zap className="w-3 h-3" />
              Profil administrateur — aucun crédit consommé
            </p>
          </>
        ) : (
          <>
            {(['daily', 'weekly', 'monthly'] as const).map(period => {
              const used = usage[period];
              const quota = quotas[period];
              const p = bar(used, quota);
              const { textClass: tc, hex: hx } = creditStyle(p, hasEarned);
              return (
                <div key={period} className="space-y-1">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-muted-foreground">{t(`credits.${period}`)}</span>
                    <span className={tc}>{used}/{quota}</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                    <div className="h-full rounded-full transition-all" style={{ width: `${p}%`, backgroundColor: hx }} />
                  </div>
                </div>
              );
            })}
          </>
        )}
        {(usage.earned_total ?? 0) > 0 && (
          <p className="text-[11px] text-yellow-600 dark:text-yellow-400 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            {t('credits.earned_bonus', { count: usage.earned_total })}
          </p>
        )}
        <p className="text-[10px] text-muted-foreground pt-1 border-t">
          {t('credits.plan_label', { plan: t(`credits.plan_${data.plan_type}`) })}
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
