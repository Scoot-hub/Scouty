import { useCallback, useMemo } from 'react';
import { Link, useSearchParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { loadStripe } from '@stripe/stripe-js';
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from '@stripe/react-stripe-js';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { ArrowLeft, CreditCard } from 'lucide-react';
import logo from '@/assets/logo.png';

const STRIPE_PUBLIC_KEY = import.meta.env.VITE_STRIPE_PUBLIC_KEY || '';
const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

const VALID_PLANS = ['scout', 'pro'] as const;
type Plan = typeof VALID_PLANS[number];

const PLAN_LABELS: Record<Plan, { name: string; monthly: number; annual: number }> = {
  scout: { name: 'Scout+', monthly: 19, annual: 190 },
  pro: { name: 'Pro', monthly: 29, annual: 290 },
};

export default function Checkout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();

  const plan = searchParams.get('plan') as Plan | null;
  const billing = (searchParams.get('billing') || 'monthly') as 'monthly' | 'annual';

  const stripePromise = useMemo(
    () => (STRIPE_PUBLIC_KEY ? loadStripe(STRIPE_PUBLIC_KEY) : null),
    [],
  );

  const fetchClientSecret = useCallback(async () => {
    const session = JSON.parse(localStorage.getItem('scouthub_session') || '{}');
    const res = await fetch(`${API_BASE}/functions/create-checkout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ plan, billing }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur lors de la création de la session.');
    return data.clientSecret;
  }, [plan, billing]);

  // Guards
  if (!user) return <Navigate to="/auth" replace />;
  if (!plan || !VALID_PLANS.includes(plan)) return <Navigate to="/pricing" replace />;

  const planInfo = PLAN_LABELS[plan];
  const price = billing === 'annual' ? Math.round(planInfo.annual / 12) : planInfo.monthly;

  // Stripe not configured
  if (!STRIPE_PUBLIC_KEY || !stripePromise) {
    return (
      <div className="max-w-3xl mx-auto py-16 px-4">
        <div className="text-center space-y-4">
          <CreditCard className="w-12 h-12 mx-auto text-muted-foreground" />
          <h1 className="text-2xl font-bold">{t('checkout.title')}</h1>
          <p className="text-muted-foreground">{t('checkout.not_configured')}</p>
          <pre className="mt-6 text-left bg-muted rounded-lg p-4 text-xs overflow-x-auto">
{`# .env
VITE_STRIPE_PUBLIC_KEY=pk_test_...
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_SCOUT_MONTHLY=price_xxx
STRIPE_PRICE_SCOUT_ANNUAL=price_xxx
STRIPE_PRICE_PRO_MONTHLY=price_xxx
STRIPE_PRICE_PRO_ANNUAL=price_xxx`}
          </pre>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-border px-6 py-4">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/pricing">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="w-4 h-4 mr-2" />
                {t('checkout.back_to_pricing')}
              </Button>
            </Link>
            <div className="flex items-center gap-2">
              <img src={logo} alt="Scouty" className="w-5 h-5" />
              <span className="text-lg font-extrabold tracking-tight">Scouty</span>
            </div>
          </div>

          <div className="text-right">
            <p className="text-sm font-bold">{t('checkout.plan_label', { plan: planInfo.name })}</p>
            <p className="text-xs text-muted-foreground">
              {price}€/{t('pricing.month')}
              {billing === 'annual' && ` · ${t('pricing.billed_annually', { amount: planInfo.annual })}`}
            </p>
          </div>
        </div>
      </header>

      {/* Checkout form */}
      <main className="max-w-4xl mx-auto px-6 py-10">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold flex items-center justify-center gap-3">
            <CreditCard className="w-6 h-6" />
            {t('checkout.title')}
          </h1>
          <p className="text-muted-foreground mt-1">{t('checkout.subtitle')}</p>
        </div>

        <div className="rounded-xl border border-border overflow-hidden bg-card">
          <EmbeddedCheckoutProvider stripe={stripePromise} options={{ fetchClientSecret }}>
            <EmbeddedCheckout />
          </EmbeddedCheckoutProvider>
        </div>
      </main>
    </div>
  );
}
