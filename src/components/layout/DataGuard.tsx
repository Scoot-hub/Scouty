import { Outlet, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/use-admin';
import { Button } from '@/components/ui/button';
import { Crown, Loader2 } from 'lucide-react';

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
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-5 text-center max-w-md mx-auto">
        <div className="w-16 h-16 rounded-2xl bg-amber-100 dark:bg-amber-900/20 flex items-center justify-center">
          <Crown className="w-8 h-8 text-amber-500" />
        </div>
        <div>
          <h2 className="text-xl font-bold">{t('data.premium_title', 'Fonctionnalité Premium')}</h2>
          <p className="text-sm text-muted-foreground mt-2">
            {t('data.premium_desc', 'La base de données et les outils d\'analyse sont réservés aux abonnés Premium.')}
          </p>
        </div>
        <Link to="/pricing"><Button className="gap-2"><Crown className="w-4 h-4" /> {t('data.premium_cta', 'Passer à Premium')}</Button></Link>
        <Link to="/players" className="text-xs text-muted-foreground hover:underline">{t('data.back_players', 'Retour aux joueurs')}</Link>
      </div>
    );
  }

  return <Outlet />;
}
