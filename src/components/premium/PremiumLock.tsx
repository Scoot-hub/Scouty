import type { ComponentType, ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Crown, Check, ArrowRight, Lock } from 'lucide-react';

/**
 * Reusable premium upsell surface. One component, three variants, so every
 * gated feature speaks the same language and the path to payment is identical:
 *
 *  - `page`     full-screen gate (e.g. the whole /data section, the community)
 *  - `card`     inline card that replaces a disabled control with a real offer
 *  - `overlay`  blurred "teaser" — renders the real premium UI behind glass so
 *               the free user literally SEES what they're missing
 *
 * The CTA always goes straight to Stripe checkout for the recommended plan
 * (shortest path to payment); a secondary link still lets them compare plans.
 */

export type UpgradePlan = 'pro' | 'scout';

const PLAN_LABEL: Record<UpgradePlan, string> = { pro: 'Pro', scout: 'Scout' };

/**
 * Direct-to-payment CTA. The primary button skips /pricing entirely and creates
 * the Stripe checkout session for `plan`; the secondary link keeps "compare all
 * plans" one tap away for users who aren't ready to commit to the recommended one.
 */
export function UpgradeCTA({
  plan = 'pro',
  billing = 'monthly',
  label,
  size = 'default',
  tone = 'solid',
  showAllPlansLink = true,
  onNavigate,
  className,
}: {
  plan?: UpgradePlan;
  billing?: 'monthly' | 'annual';
  label?: string;
  size?: 'sm' | 'default' | 'lg';
  /** `solid` = brand button; `glass` = light button for use over blurred content / dark headers */
  tone?: 'solid' | 'glass';
  showAllPlansLink?: boolean;
  /** Fired right before navigating — use to close a popover/dialog hosting the CTA. */
  onNavigate?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const cta = label ?? t('premium.unlock', { plan: PLAN_LABEL[plan] });

  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <Button
        size={size}
        onClick={() => { onNavigate?.(); navigate(`/checkout?plan=${plan}&billing=${billing}`); }}
        className={cn(
          'gap-2 rounded-xl font-bold shadow-md shadow-primary/20',
          tone === 'glass' && 'bg-white/20 hover:bg-white/30 text-white backdrop-blur-sm shadow-none',
        )}
      >
        <Crown className="w-4 h-4" />
        {cta}
        <ArrowRight className="w-3.5 h-3.5" />
      </Button>
      {showAllPlansLink && (
        <Link
          to="/pricing"
          onClick={onNavigate}
          className={cn(
            'text-xs hover:underline transition-colors',
            tone === 'glass' ? 'text-white/80 hover:text-white' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {t('premium.see_all_plans')}
        </Link>
      )}
    </div>
  );
}

function BenefitList({ benefits, tone = 'solid' }: { benefits: string[]; tone?: 'solid' | 'glass' }) {
  if (!benefits.length) return null;
  return (
    <ul className="space-y-2 text-left">
      {benefits.map((b, i) => (
        <li key={i} className="flex items-start gap-2.5 text-sm">
          <span
            className={cn(
              'mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0',
              tone === 'glass' ? 'bg-white/25' : 'bg-emerald-500/15',
            )}
          >
            <Check className={cn('w-2.5 h-2.5', tone === 'glass' ? 'text-white' : 'text-emerald-600 dark:text-emerald-400')} />
          </span>
          <span className={tone === 'glass' ? 'text-white/90' : 'text-muted-foreground'}>{b}</span>
        </li>
      ))}
    </ul>
  );
}

export interface PremiumLockProps {
  variant: 'page' | 'card' | 'overlay';
  title: string;
  desc?: string;
  /** Bullet list of what the user unlocks — the heart of "make them want it". */
  benefits?: string[];
  plan?: UpgradePlan;
  billing?: 'monthly' | 'annual';
  icon?: ComponentType<{ className?: string }>;
  /** Optional secondary nav (e.g. "back to my players") shown on the page variant. */
  backLink?: { to: string; label: string };
  /** overlay only: the real premium UI, rendered blurred + inert behind the glass panel. */
  children?: ReactNode;
  className?: string;
}

export default function PremiumLock({
  variant,
  title,
  desc,
  benefits = [],
  plan = 'pro',
  billing = 'monthly',
  icon: Icon = Crown,
  backLink,
  children,
  className,
}: PremiumLockProps) {
  const { t } = useTranslation();

  // ── Overlay: blurred teaser ────────────────────────────────────────────────
  if (variant === 'overlay') {
    return (
      <div className={cn('relative isolate rounded-xl overflow-hidden min-h-[170px]', className)}>
        {/* Real UI, shown but inert so the user sees exactly what they're missing */}
        <div className="pointer-events-none select-none blur-[3px] opacity-60" aria-hidden="true">
          {children}
        </div>
        {/* Glass upsell panel */}
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 p-4 text-center bg-background/40 backdrop-blur-[2px]">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-card/90 border border-border shadow-sm">
            <Lock className="w-3.5 h-3.5 text-amber-500" />
            <span className="text-xs font-bold">{t('premium.preview', { plan: PLAN_LABEL[plan] })}</span>
          </div>
          <div className="max-w-xs">
            <p className="text-sm font-bold">{title}</p>
            {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>}
          </div>
          <UpgradeCTA plan={plan} billing={billing} size="sm" />
        </div>
      </div>
    );
  }

  // ── Card: inline offer replacing a disabled control ─────────────────────────
  if (variant === 'card') {
    return (
      <div
        className={cn(
          'rounded-xl border border-dashed border-primary/30 bg-gradient-to-br from-primary/5 to-amber-500/5 p-5 space-y-4',
          className,
        )}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5 text-primary" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold">{title}</span>
              <span className="px-1.5 py-0.5 rounded-full bg-amber-500/15 text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400">
                {t('premium.badge')}
              </span>
            </div>
            {desc && <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{desc}</p>}
          </div>
        </div>
        {benefits.length > 0 && <BenefitList benefits={benefits} />}
        <UpgradeCTA plan={plan} billing={billing} size="sm" />
      </div>
    );
  }

  // ── Page: full-screen gate ──────────────────────────────────────────────────
  return (
    <div className={cn('flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center max-w-md mx-auto px-4', className)}>
      <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/15 to-amber-500/15 flex items-center justify-center">
        <Icon className="w-8 h-8 text-amber-500" />
      </div>
      <div>
        <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
        {desc && <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{desc}</p>}
      </div>
      {benefits.length > 0 && (
        <div className="w-full rounded-2xl border border-border bg-card p-5">
          <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground mb-3 text-left">
            {t('premium.whats_inside')}
          </p>
          <BenefitList benefits={benefits} />
        </div>
      )}
      <UpgradeCTA plan={plan} billing={billing} />
      {backLink && (
        <Link to={backLink.to} className="text-xs text-muted-foreground hover:underline">
          {backLink.label}
        </Link>
      )}
    </div>
  );
}
