import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Check, X, Crown, Loader2, ExternalLink, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { cn } from '@/lib/utils';
import logo from '@/assets/logo.png';

type BillingCycle = 'monthly' | 'annual';

export default function Pricing() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [premiumSince, setPremiumSince] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);
  const [billing, setBilling] = useState<BillingCycle>('monthly');

  const success = searchParams.get('success') === 'true';
  const canceled = searchParams.get('canceled') === 'true';

  useEffect(() => {
    if (success) {
      toast.success(t('pricing.payment_success'));
      checkSubscription();
    }
    if (canceled) {
      toast.error(t('pricing.payment_canceled'));
    }
  }, [success, canceled]);

  useEffect(() => {
    if (user) checkSubscription();
  }, [user]);

  const checkSubscription = async () => {
    if (!user) return;
    setCheckingSubscription(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (!error && data) {
        setSubscribed(data.subscribed);
        setSubscriptionEnd(data.subscription_end || null);
      }
      const { data: subRow } = await supabase.from('user_subscriptions').select('premium_since').eq('user_id', user.id).single();
      if (subRow?.premium_since) setPremiumSince(subRow.premium_since);
    } catch {
      // Ignore
    } finally {
      setCheckingSubscription(false);
    }
  };

  const handleCheckout = (plan: string) => {
    if (!user) {
      navigate('/auth?signup=true');
      return;
    }
    navigate(`/checkout?plan=${plan}&billing=${billing}`);
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) {
        window.open(data.url, '_blank');
      }
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setPortalLoading(false);
    }
  };

  const plans = [
    {
      id: 'starter',
      name: t('pricing.starter_title'),
      tagline: t('pricing.starter_desc'),
      price: { monthly: 0, annual: 0 },
      popular: false,
      highlight: false,
      cta: 'free',
      features: [
        { text: t('pricing.f_players_30'), included: true },
        { text: t('pricing.f_watchlists_2'), included: true },
        { text: t('pricing.f_reports_basic'), included: true },
        { text: t('pricing.f_enrichment'), included: false },
        { text: t('pricing.f_exports'), included: false },
      ],
    },
    {
      id: 'scout',
      name: t('pricing.scout_title'),
      tagline: t('pricing.scout_desc'),
      price: { monthly: 19, annual: 190 },
      popular: false,
      highlight: false,
      cta: 'paid',
      features: [
        { text: t('pricing.f_players_200'), included: true },
        { text: t('pricing.f_watchlists_unlimited'), included: true },
        { text: t('pricing.f_enrichment'), included: true },
        { text: t('pricing.f_exports'), included: true },
        { text: t('pricing.f_calendar_missions'), included: false },
      ],
    },
    {
      id: 'pro',
      name: t('pricing.pro_title'),
      tagline: t('pricing.pro_desc'),
      price: { monthly: 29, annual: 290 },
      popular: true,
      highlight: true,
      cta: 'paid',
      features: [
        { text: t('pricing.f_players_unlimited'), included: true },
        { text: t('pricing.f_shadow_unlimited'), included: true },
        { text: t('pricing.f_calendar_missions'), included: true },
        { text: t('pricing.f_api_football'), included: true },
        { text: t('pricing.f_all_enrichment_export'), included: true },
      ],
    },
    {
      id: 'elite',
      name: t('pricing.elite_title'),
      tagline: t('pricing.elite_desc'),
      price: { monthly: 99, annual: 990 },
      perUser: { monthly: 29, annual: 290 },
      popular: false,
      highlight: false,
      cta: 'contact',
      features: [
        { text: t('pricing.f_all_pro'), included: true },
        { text: t('pricing.f_squad'), included: true },
        { text: t('pricing.f_permissions'), included: true },
        { text: t('pricing.f_onboarding'), included: true },
        { text: t('pricing.f_support_sla'), included: true },
        { text: t('pricing.f_integrations'), included: true },
        { text: t('pricing.f_2fa_audit'), included: true },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <img src={logo} alt="Scouty" className="w-9 h-9 rounded-xl" />
            <span className="text-lg font-extrabold tracking-tight">Scouty</span>
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher variant="ghost" />
            {user ? (
              <Link to="/players">
                <Button variant="ghost" size="sm">{t('sidebar.players')}</Button>
              </Link>
            ) : (
              <>
                <Link to="/auth"><Button variant="ghost" size="sm">{t('nav.signin')}</Button></Link>
                <Link to="/auth?signup=true"><Button size="sm">{t('nav.signup')}</Button></Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="pt-32 pb-24 px-6">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-6">
              <Crown className="w-4 h-4" />
              {t('pricing.badge')}
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
              {t('pricing.title')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto mb-8">
              {t('pricing.subtitle')}
            </p>

            {/* Billing toggle */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-muted border border-border">
              <button
                onClick={() => setBilling('monthly')}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all',
                  billing === 'monthly' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('pricing.monthly')}
              </button>
              <button
                onClick={() => setBilling('annual')}
                className={cn(
                  'px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2',
                  billing === 'annual' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {t('pricing.annual')}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-green-500/15 text-green-600 font-bold">-17%</span>
              </button>
            </div>
          </div>

          {/* Plans grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {plans.map((plan) => (
              <div
                key={plan.id}
                className={cn(
                  'rounded-2xl border bg-card p-6 flex flex-col relative',
                  plan.highlight ? 'border-2 border-primary shadow-xl shadow-primary/10' : 'border-border',
                )}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                    {t('pricing.popular')}
                  </div>
                )}

                <div className="mb-6">
                  <h3 className="text-base font-bold mb-0.5">{plan.name}</h3>
                  <p className="text-xs text-muted-foreground">{plan.tagline}</p>
                </div>

                {/* Price */}
                <div className="mb-6">
                  {plan.price.monthly === 0 ? (
                    <div>
                      <span className="text-3xl font-black">0€</span>
                      <span className="text-muted-foreground text-sm ml-1">{t('pricing.forever')}</span>
                    </div>
                  ) : (
                    <div>
                      <span className="text-3xl font-black">
                        {billing === 'annual'
                          ? `${Math.round(plan.price.annual / 12)}€`
                          : `${plan.price.monthly}€`
                        }
                      </span>
                      <span className="text-muted-foreground text-sm ml-1">/{t('pricing.month')}</span>
                      {billing === 'annual' && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {t('pricing.billed_annually', { amount: plan.price.annual })}
                        </p>
                      )}
                      {(plan as any).perUser && (
                        <p className="text-xs text-primary font-medium mt-2">
                          + {billing === 'annual' ? `${Math.round((plan as any).perUser.annual / 12)}€` : `${(plan as any).perUser.monthly}€`}/{t('pricing.per_user')}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Features */}
                <ul className="space-y-2.5 mb-8 flex-1">
                  {plan.features.map((f, i) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm">
                      {f.included ? (
                        <Check className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                      ) : (
                        <X className="w-4 h-4 text-muted-foreground/30 shrink-0 mt-0.5" />
                      )}
                      <span className={f.included ? '' : 'text-muted-foreground/50'}>{f.text}</span>
                    </li>
                  ))}
                </ul>

                {/* CTA */}
                {plan.cta === 'free' ? (
                  !user ? (
                    <Link to="/auth?signup=true">
                      <Button variant="outline" className="w-full">{t('pricing.get_started')}</Button>
                    </Link>
                  ) : (
                    <Button variant="outline" className="w-full" disabled>{t('pricing.current_plan')}</Button>
                  )
                ) : plan.cta === 'contact' ? (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => window.location.href = 'mailto:contact@scouty.app?subject=Scouty Elite'}
                  >
                    {t('pricing.contact_us')}
                  </Button>
                ) : subscribed ? (
                  <div className="space-y-2">
                    <Button className="w-full" disabled>
                      <Crown className="w-4 h-4 mr-2" />
                      {t('pricing.current_plan')}
                    </Button>
                    <Button variant="outline" size="sm" className="w-full" onClick={handlePortal} disabled={portalLoading}>
                      {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                      {t('pricing.manage')}
                    </Button>
                  </div>
                ) : (
                  <Button
                    className={cn('w-full font-bold', plan.highlight && 'shadow-lg shadow-primary/25')}
                    onClick={() => handleCheckout(plan.id)}
                  >
                    <Sparkles className="w-4 h-4 mr-2" />
                    {t('pricing.upgrade')}
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
