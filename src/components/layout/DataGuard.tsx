import { Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/use-admin';
import PremiumLock from '@/components/premium/PremiumLock';
import { Loader2 } from 'lucide-react';

/**
 * Premium gate for the whole /data section. Every /data/* route is nested under
 * this guard, so the hub, explore, scatter, profile, compare and player pages
 * are all Premium-only with a single subscription check (cached by react-query).
 */
export default function DataGuard() {
  const { t } = useTranslation();
  const { data: isAdmin } = useIsAdmin();
  const { data: subData, isLoading } = useQuery({
    queryKey: ['subscription'],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('check-subscription');
      return data;
    },
    staleTime: 5 * 60 * 1000,
  });
  const isPremium = !!(subData?.subscribed) || !!isAdmin;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isPremium) {
    return (
      <PremiumLock
        variant="page"
        title={t('data.premium_title', 'Fonctionnalité Premium')}
        desc={t('data.premium_desc', 'La base de données et les outils d\'analyse sont réservés aux abonnés Premium.')}
        benefits={[
          t('data.premium_b1'),
          t('data.premium_b2'),
          t('data.premium_b3'),
        ]}
        plan="pro"
        backLink={{ to: '/players', label: t('data.back_players', 'Retour aux joueurs') }}
      />
    );
  }

  return <Outlet />;
}
