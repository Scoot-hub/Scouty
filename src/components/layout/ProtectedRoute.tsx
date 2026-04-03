import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useMyPermissions, useIsAdmin } from '@/hooks/use-admin';
import logo from '@/assets/logo.png';
import { Lock } from 'lucide-react';

// Map route paths to page permission keys
const ROUTE_TO_PAGE_KEY: Record<string, string> = {
  '/players': 'players',
  '/player/new': 'add_player',
  '/player': 'player_profile', // catches /player/:id and /player/:id/edit
  '/watchlist': 'watchlist',
  '/shadow-team': 'shadow_team',
  '/fixtures': 'fixtures',
  '/my-matches': 'my_matches',
  '/contacts': 'contacts',
  '/settings': 'settings',
  '/account': 'account',
  '/organization': 'organization',
  '/booking': 'booking',
  '/checkout': 'checkout',
  '/admin': 'admin',
  '/admin/roles': 'admin',
};

function getPageKey(pathname: string): string | null {
  // Exact match first
  if (ROUTE_TO_PAGE_KEY[pathname]) return ROUTE_TO_PAGE_KEY[pathname];
  // Prefix match for dynamic routes
  for (const [prefix, key] of Object.entries(ROUTE_TO_PAGE_KEY)) {
    if (pathname.startsWith(prefix)) return key;
  }
  return null;
}

export default function ProtectedRoute() {
  const { user, loading } = useAuth();
  const { t } = useTranslation();
  const location = useLocation();
  const { data: permsData, isLoading: permsLoading } = useMyPermissions();
  const { data: isAdmin } = useIsAdmin();

  if (loading || permsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <img src={logo} alt="Scouty" className="w-10 h-10 rounded-xl animate-pulse" />
          <p className="text-sm text-muted-foreground">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  // Admins always have full access
  if (!isAdmin) {
    const pageKey = getPageKey(location.pathname);
    if (pageKey && permsData?.permissions) {
      const allowed = permsData.permissions[pageKey];
      // If permission is explicitly set to false, block access
      if (allowed === false) {
        return (
          <div className="min-h-screen bg-background flex items-center justify-center">
            <div className="flex flex-col items-center gap-4 text-center max-w-md px-4">
              <div className="w-14 h-14 rounded-2xl bg-destructive/10 flex items-center justify-center">
                <Lock className="w-7 h-7 text-destructive" />
              </div>
              <h1 className="text-xl font-bold">{t('roles.access_denied')}</h1>
              <p className="text-sm text-muted-foreground">{t('roles.access_denied_desc')}</p>
              <a href="/players" className="text-sm text-primary hover:underline">{t('roles.go_home')}</a>
            </div>
          </div>
        );
      }
    }
  }

  return <Outlet />;
}
