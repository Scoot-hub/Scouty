import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Check, X, Crown, Loader2, ExternalLink } from 'lucide-react';
import { toast } from 'sonner';
import LanguageSwitcher from '@/components/LanguageSwitcher';

export default function Pricing() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [checkingSubscription, setCheckingSubscription] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [premiumSince, setPremiumSince] = useState<string | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const success = searchParams.get('success') === 'true';
  const canceled = searchParams.get('canceled') === 'true';

  useEffect(() => {
    if (success) {
      toast.success(t('pricing.payment_success'));
      // Sync subscription status
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
      // Also fetch premium_since from DB
      const { data: subRow } = await supabase.from('user_subscriptions').select('premium_since').eq('user_id', user.id).single();
      if (subRow?.premium_since) setPremiumSince(subRow.premium_since);
    } catch {
      // Ignore
    } finally {
      setCheckingSubscription(false);
    }
  };

  const handleCheckout = async () => {
    if (!user) {
      navigate('/auth?signup=true');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout');
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setLoading(false);
    }
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

  const free = [
    { text: t('pricing.feature_players_limited'), included: true },
    { text: t('pricing.feature_reports'), included: true },
    { text: t('pricing.feature_custom_fields'), included: true },
    { text: t('pricing.feature_enrichment'), included: false },
    { text: t('pricing.feature_unlimited_players'), included: false },
    { text: t('pricing.feature_exports'), included: false },
  ];

  const premium = [
    { text: t('pricing.feature_players_limited'), included: true },
    { text: t('pricing.feature_reports'), included: true },
    { text: t('pricing.feature_custom_fields'), included: true },
    { text: t('pricing.feature_enrichment'), included: true },
    { text: t('pricing.feature_unlimited_players'), included: true },
    { text: t('pricing.feature_exports'), included: true },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="fixed top-0 w-full z-50 border-b border-border/40 bg-background/80 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-base">
              ⚽
            </div>
            <span className="text-lg font-extrabold tracking-tight">ScoutHub</span>
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
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-primary/30 bg-primary/10 text-primary text-sm font-medium mb-6">
              <Crown className="w-4 h-4" />
              {t('pricing.badge')}
            </div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight mb-4">
              {t('pricing.title')}
            </h1>
            <p className="text-lg text-muted-foreground max-w-xl mx-auto">
              {t('pricing.subtitle')}
            </p>
          </div>

          {/* Plans */}
          <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Free plan */}
            <div className="rounded-2xl border border-border bg-card p-8">
              <h3 className="text-lg font-bold mb-1">{t('pricing.free_title')}</h3>
              <p className="text-sm text-muted-foreground mb-6">{t('pricing.free_desc')}</p>
              <div className="mb-8">
                <span className="text-4xl font-black">0€</span>
                <span className="text-muted-foreground text-sm ml-1">/{t('pricing.month')}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {free.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    {f.included ? (
                      <Check className="w-4 h-4 text-primary shrink-0" />
                    ) : (
                      <X className="w-4 h-4 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={f.included ? '' : 'text-muted-foreground/60'}>{f.text}</span>
                  </li>
                ))}
              </ul>
              {!user ? (
                <Link to="/auth?signup=true">
                  <Button variant="outline" className="w-full">{t('pricing.get_started')}</Button>
                </Link>
              ) : !subscribed ? (
                <Button variant="outline" className="w-full" disabled>{t('pricing.current_plan')}</Button>
              ) : null}
            </div>

            {/* Premium plan */}
            <div className="rounded-2xl border-2 border-primary bg-card p-8 relative shadow-xl shadow-primary/10">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-primary text-primary-foreground text-xs font-bold">
                {t('pricing.popular')}
              </div>
              <h3 className="text-lg font-bold mb-1">{t('pricing.premium_title')}</h3>
              <p className="text-sm text-muted-foreground mb-6">{t('pricing.premium_desc')}</p>
              <div className="mb-8">
                <span className="text-4xl font-black">19,90€</span>
                <span className="text-muted-foreground text-sm ml-1">/{t('pricing.month')}</span>
              </div>
              <ul className="space-y-3 mb-8">
                {premium.map((f, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <Check className="w-4 h-4 text-primary shrink-0" />
                    {f.text}
                  </li>
                ))}
              </ul>
              {subscribed ? (
                <div className="space-y-3">
                  {premiumSince && (
                    <p className="text-xs text-muted-foreground text-center">
                      {t('account.subscribed_since')} {new Date(premiumSince).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  {subscriptionEnd && (
                    <p className="text-xs text-muted-foreground text-center">
                      {t('account.next_renewal')} {new Date(subscriptionEnd).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  )}
                  <Button className="w-full" disabled>
                    <Crown className="w-4 h-4 mr-2" />
                    {t('pricing.current_plan')}
                  </Button>
                  <Button variant="outline" className="w-full" onClick={handlePortal} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                    {t('pricing.manage')}
                  </Button>
                </div>
              ) : (
                <Button className="w-full font-bold shadow-lg shadow-primary/25" onClick={handleCheckout} disabled={loading}>
                  {loading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Crown className="w-4 h-4 mr-2" />}
                  {t('pricing.upgrade')}
                </Button>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
