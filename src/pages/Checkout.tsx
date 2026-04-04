import { useEffect, useState } from 'react';
import { useSearchParams, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

const VALID_PLANS = ['scout', 'pro'] as const;
type Plan = typeof VALID_PLANS[number];

export default function Checkout() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  const plan = searchParams.get('plan') as Plan | null;
  const billing = (searchParams.get('billing') || 'monthly') as 'monthly' | 'annual';

  useEffect(() => {
    if (!user || !plan) return;

    async function createCheckout() {
      try {
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
        if (data.url) {
          window.location.href = data.url;
        } else {
          throw new Error('URL de paiement manquante.');
        }
      } catch (err: any) {
        setError(err.message || t('common.error'));
      }
    }

    createCheckout();
  }, [user, plan, billing]);

  if (!user) return <Navigate to="/auth" replace />;
  if (!plan || !VALID_PLANS.includes(plan)) return <Navigate to="/pricing" replace />;

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-md">
          <AlertTriangle className="w-10 h-10 mx-auto text-destructive" />
          <p className="text-sm text-destructive font-medium">{error}</p>
          <Button variant="outline" onClick={() => window.location.href = '/pricing'}>
            {t('checkout.back_to_pricing')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center space-y-4">
        <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
        <p className="text-muted-foreground text-sm">{t('checkout.loading')}</p>
      </div>
    </div>
  );
}
