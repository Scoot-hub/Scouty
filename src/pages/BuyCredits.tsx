import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCredits } from '@/hooks/use-credits';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  Zap, Crown, ArrowRight, CheckCircle2, Loader2, TrendingUp, Sparkles, ShoppingCart, Star,
} from 'lucide-react';

// ── Credit packs definition ────────────────────────────────────────────────────
interface CreditPack {
  id: string;
  credits: number;
  price: number;    // in €
  pricePerCredit: number;
  discount: number; // % off vs base rate (0 = base)
  badge?: 'popular' | 'best_value';
}

const CREDIT_PACKS: CreditPack[] = [
  { id: 'boost',    credits: 100,  price: 9,   pricePerCredit: 0.090, discount: 0 },
  { id: 'standard', credits: 300,  price: 24,  pricePerCredit: 0.080, discount: 11, badge: 'popular' },
  { id: 'power',    credits: 1000, price: 69,  pricePerCredit: 0.069, discount: 23, badge: 'best_value' },
  { id: 'ultra',    credits: 3000, price: 179, pricePerCredit: 0.060, discount: 34 },
];

// Pro plan quotas (for Scout upsell)
const PRO_DAILY = 100;
const SCOUT_DAILY = 10;

export default function BuyCredits() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loadingPack, setLoadingPack] = useState<string | null>(null);
  const [activating, setActivating] = useState(false);

  const { data: creditsData } = useCredits();
  const planType = creditsData?.plan_type ?? 'starter';
  const isScout = planType === 'scout';
  const isPro = planType === 'pro';
  const isElite = planType === 'elite';
  const isStarter = planType === 'starter';

  // Subscription check
  const { data: subscription } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;
      return data as { subscribed: boolean; source?: string; plan_type?: string };
    },
    enabled: !!user,
  });

  const isSubscribed = subscription?.subscribed;

  // Handle return from Stripe checkout (activation)
  useEffect(() => {
    const sessionId = searchParams.get('session_id');
    const success = searchParams.get('credits_success');
    if (!sessionId || !success) return;

    const activate = async () => {
      setActivating(true);
      try {
        const res = await fetch('/api/credits/activate-purchase', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ session_id: sessionId }),
        });
        const data = await res.json();
        if (res.ok && data.activated) {
          toast.success(t('buy_credits.success_title'), {
            description: t('buy_credits.success_desc', { count: data.credits_added }),
          });
          // Clean URL
          navigate('/buy-credits', { replace: true });
        } else {
          toast.error(data.error || t('common.error'));
        }
      } catch {
        toast.error(t('common.error'));
      } finally {
        setActivating(false);
      }
    };
    activate();
  }, []);

  const handleBuyPack = async (pack: CreditPack) => {
    if (!isSubscribed) {
      toast.error(t('buy_credits.error_no_subscription'));
      return;
    }
    setLoadingPack(pack.id);
    try {
      const { data, error } = await supabase.functions.invoke('create-credit-checkout', {
        body: { pack: pack.id },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setLoadingPack(null);
    }
  };

  if (activating) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{t('buy_credits.activating')}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-yellow-500/10 flex items-center justify-center">
          <Zap className="w-5 h-5 text-yellow-500" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('buy_credits.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('buy_credits.subtitle')}</p>
        </div>
      </div>

      {/* Scout upsell banner — only for scout plan */}
      {isScout && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/5 via-primary/3 to-transparent p-5">
          <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
          <div className="relative space-y-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-primary shrink-0" />
              <h2 className="font-bold text-base text-primary">{t('buy_credits.scout_upsell_title')}</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed max-w-2xl">
              {t('buy_credits.scout_upsell_desc')}
            </p>

            {/* Comparison strip */}
            <div className="flex flex-wrap gap-3 mt-1">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border/60">
                <Zap className="w-4 h-4 text-muted-foreground" />
                <div>
                  <p className="text-[11px] text-muted-foreground">{t('buy_credits.scout_upsell_your_plan')}</p>
                  <p className="text-sm font-semibold tabular-nums">{SCOUT_DAILY} {t('buy_credits.credits_per_day')}</p>
                </div>
              </div>
              <div className="flex items-center justify-center self-center text-muted-foreground">
                <ArrowRight className="w-4 h-4" />
              </div>
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/10 border border-primary/20">
                <Zap className="w-4 h-4 text-primary" />
                <div>
                  <p className="text-[11px] text-primary/70">{t('buy_credits.scout_upsell_pro_plan')}</p>
                  <p className="text-sm font-semibold text-primary tabular-nums">{PRO_DAILY} {t('buy_credits.credits_per_day')}</p>
                </div>
              </div>
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                <TrendingUp className="w-4 h-4 text-emerald-500 shrink-0" />
                <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">×10</p>
              </div>
            </div>

            <div className="pt-1">
              <Button
                size="sm"
                className="gap-2 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => navigate('/pricing')}
              >
                <Crown className="w-4 h-4" />
                {t('buy_credits.scout_upsell_cta')}
                <ArrowRight className="w-3.5 h-3.5" />
              </Button>
              <p className="text-[11px] text-muted-foreground mt-2">{t('buy_credits.scout_upsell_hint')}</p>
            </div>
          </div>
        </div>
      )}

      {/* Elite — unlimited */}
      {isElite && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-yellow-500/10 border border-yellow-500/20">
          <Sparkles className="w-5 h-5 text-yellow-500 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{t('buy_credits.elite_unlimited_title')}</p>
            <p className="text-xs text-muted-foreground">{t('buy_credits.elite_unlimited_desc')}</p>
          </div>
        </div>
      )}

      {/* Starter — suggest subscription first */}
      {isStarter && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-muted/40 border border-border/60">
          <Crown className="w-5 h-5 text-muted-foreground shrink-0 mt-0.5" />
          <div className="space-y-2">
            <div>
              <p className="text-sm font-semibold">{t('buy_credits.starter_notice_title')}</p>
              <p className="text-xs text-muted-foreground">{t('buy_credits.starter_notice_desc')}</p>
            </div>
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => navigate('/pricing')}>
              <Crown className="w-3.5 h-3.5" />
              {t('buy_credits.starter_notice_cta')}
            </Button>
          </div>
        </div>
      )}

      {/* Pro note */}
      {isPro && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-primary/5 border border-primary/15">
          <CheckCircle2 className="w-5 h-5 text-primary shrink-0" />
          <div>
            <p className="text-sm font-semibold text-primary">{t('buy_credits.pro_already_good_title')}</p>
            <p className="text-xs text-muted-foreground">{t('buy_credits.pro_already_good_desc')}</p>
          </div>
        </div>
      )}

      {/* Credit packs grid */}
      <div>
        <h2 className="text-base font-bold mb-4 flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-muted-foreground" />
          {t('buy_credits.packs_title')}
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {CREDIT_PACKS.map(pack => {
            const isBestValue = pack.badge === 'best_value';
            const isPopular = pack.badge === 'popular';
            const isLoading = loadingPack === pack.id;

            return (
              <div
                key={pack.id}
                className={`relative flex flex-col rounded-2xl border p-5 transition-all duration-200 hover:shadow-md ${
                  isBestValue
                    ? 'border-yellow-500/40 bg-gradient-to-b from-yellow-500/5 to-transparent shadow-sm'
                    : isPopular
                    ? 'border-primary/30 bg-gradient-to-b from-primary/5 to-transparent'
                    : 'border-border/60 bg-card'
                }`}
              >
                {/* Badge */}
                {pack.badge && (
                  <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                    <Badge
                      className={`text-[10px] px-2 py-0.5 font-bold ${
                        isBestValue
                          ? 'bg-yellow-500 text-white hover:bg-yellow-500'
                          : 'bg-primary text-primary-foreground hover:bg-primary'
                      }`}
                    >
                      {isBestValue ? (
                        <><Star className="w-2.5 h-2.5 mr-1" />{t('buy_credits.badge_best_value')}</>
                      ) : (
                        t('buy_credits.badge_popular')
                      )}
                    </Badge>
                  </div>
                )}

                {/* Pack name */}
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  {t(`buy_credits.pack_${pack.id}`)}
                </p>

                {/* Credit amount */}
                <div className="flex items-baseline gap-1 mb-1">
                  <span className="text-3xl font-extrabold tabular-nums">{pack.credits.toLocaleString()}</span>
                  <span className="text-sm text-muted-foreground font-medium">{t('buy_credits.credits')}</span>
                </div>

                {/* Price */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl font-bold">{pack.price}€</span>
                  {pack.discount > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-semibold">
                      -{pack.discount}%
                    </span>
                  )}
                </div>

                {/* Per-credit price */}
                <p className="text-[11px] text-muted-foreground mb-4">
                  {t('buy_credits.per_credit', { price: pack.pricePerCredit.toFixed(3) })}
                </p>

                {/* What you can do */}
                <div className="flex-1 space-y-1.5 mb-4">
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap className="w-3 h-3 text-yellow-500 shrink-0" />
                    <span>{t('buy_credits.enrichments', { count: pack.credits })}</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />
                    <span>{t('buy_credits.no_expiry')}</span>
                  </div>
                </div>

                <Button
                  className={`w-full gap-2 rounded-xl ${
                    isBestValue
                      ? 'bg-yellow-500 hover:bg-yellow-600 text-white'
                      : isPopular
                      ? ''
                      : ''
                  }`}
                  variant={isBestValue ? 'default' : isPopular ? 'default' : 'outline'}
                  size="sm"
                  disabled={isLoading || !isSubscribed}
                  onClick={() => handleBuyPack(pack)}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                  {t('buy_credits.buy_cta')}
                </Button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center pb-4">
        {t('buy_credits.footer_note')}
      </p>
    </div>
  );
}
