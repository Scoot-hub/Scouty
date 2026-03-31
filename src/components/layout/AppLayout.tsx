import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { X, AlertTriangle } from 'lucide-react';
import AppSidebar from './AppSidebar';

function ImpersonationBanner() {
  const { t } = useTranslation();
  const { user, stopImpersonation } = useAuth();

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium shadow-md z-50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>
          {t('admin.impersonating_banner', { email: user?.email })}
        </span>
      </div>
      <button
        onClick={stopImpersonation}
        className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/20 hover:bg-amber-950/30 transition-colors text-xs font-bold"
      >
        <X className="w-3.5 h-3.5" />
        {t('admin.stop_impersonation')}
      </button>
    </div>
  );
}

export default function AppLayout() {
  const { isImpersonating } = useAuth();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  return (
    <div className="min-h-screen w-full">
      <AppSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
      <div className={`${collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'} min-h-screen flex flex-col transition-[margin] duration-300`}>
        {isImpersonating && <ImpersonationBanner />}
        <main className="flex-1 p-4 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
