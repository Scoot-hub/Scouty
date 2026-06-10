import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { X, AlertTriangle } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import AppSidebar from './AppSidebar';
import NotificationCenter from '@/components/NotificationCenter';
import NotificationPopup from '@/components/NotificationPopup';
import CreditWidget from '@/components/CreditWidget';
import HelpCenter from '@/components/HelpCenter';
import FeedbackPopup from '@/components/FeedbackPopup';
import ScrollRestoration from '@/components/ScrollRestoration';
import { OperationBannerProvider } from '@/contexts/OperationBannerContext';
import OperationBanner from '@/components/OperationBanner';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
import { useSessionTracker } from '@/hooks/use-session-tracker';
import { useNotifications, useUnreadCount, notifChannel, broadcastNotifChange, type Notification } from '@/hooks/use-notifications';
import { usePushSubscription } from '@/hooks/use-push-subscription';
import { useFaviconBadge } from '@/hooks/use-favicon-badge';

function ImpersonationBanner() {
  const { t } = useTranslation();
  const { user, stopImpersonation } = useAuth();

  return (
    <div className="bg-amber-500 text-amber-950 px-4 py-2 flex items-center justify-between gap-3 text-sm font-medium shadow-md z-50">
      <div className="flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0" />
        <span>{t('admin.impersonating_banner', { email: user?.email })}</span>
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

function SessionTracker() {
  useSessionTracker();
  return null;
}

/* ── Notification popup watcher ── */
function NotificationWatcher({ onNew }: { onNew: (n: Notification) => void }) {
  const { data: notifications } = useNotifications();
  const seenIds = useRef<Set<string>>(new Set());
  const initialized = useRef(false);

  useEffect(() => {
    if (!notifications) return;

    if (!initialized.current) {
      initialized.current = true;
      // On first load / page refresh: show up to 3 most-recent unread notifications
      // so the popup appears even if the push arrived while the app was closed or
      // the user was on a different page.
      let shown = 0;
      for (const n of notifications) {
        seenIds.current.add(n.id);
        if (!n.is_read && shown < 3) {
          onNew(n);
          shown++;
        }
      }
      return;
    }

    // Subsequent fetches (10 s poll, SW push, BC sync): show any newly arrived unread notif
    for (const n of notifications) {
      if (!seenIds.current.has(n.id) && !n.is_read) {
        seenIds.current.add(n.id);
        onNew(n);
      }
    }
  }, [notifications, onNew]);

  return null;
}

/* ── Favicon badge + title flash ── */
function FaviconBadge() {
  const count = useUnreadCount();
  useFaviconBadge(count);
  return null;
}

/* ── SW → page: refetch on push + mark-as-read + navigate on notif click ── */
function SwRefetchListener() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const handler = async (event: MessageEvent) => {
      if (event.data?.type === 'REFETCH_NOTIFICATIONS') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
        broadcastNotifChange();
      } else if (event.data?.type === 'NAVIGATE') {
        const { link, id } = event.data as { link?: string; id?: string };
        // Mark the notification as read before navigating
        if (id) {
          try {
            await fetch(`/api/notifications/${id}/read`, {
              method: 'PATCH',
              credentials: 'include',
            });
            queryClient.invalidateQueries({ queryKey: ['notifications'] });
            broadcastNotifChange();
          } catch { /* ignore */ }
        }
        if (link) window.location.href = link;
      }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
  }, [queryClient]);
  return null;
}

/* ── BroadcastChannel → page: sync from other tabs (mark-as-read, delete, new notif) ── */
function BcRefetchListener() {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!notifChannel) return;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'NOTIFICATIONS_CHANGED') {
        queryClient.invalidateQueries({ queryKey: ['notifications'] });
      }
    };
    notifChannel.addEventListener('message', handler);
    return () => notifChannel.removeEventListener('message', handler);
  }, [queryClient]);
  return null;
}

/* ── Auto push subscription on first login (or re-subscribe if subscription expired) ── */
function PushAutoSubscribe() {
  const { status, subscribe } = usePushSubscription();
  const prompted = useRef(false);

  useEffect(() => {
    if (status === 'loading' || status === 'subscribed' || status === 'denied') return;
    if (prompted.current) return;
    prompted.current = true;

    if (Notification.permission === 'default') {
      // Not yet asked — show the permission prompt after a short delay
      const timer = setTimeout(() => subscribe(), 3000);
      return () => clearTimeout(timer);
    }
    if (Notification.permission === 'granted') {
      // Permission already granted but no active subscription (e.g. expired) — re-subscribe silently
      subscribe();
    }
  }, [status, subscribe]);

  return null;
}

export default function AppLayout() {
  const { isImpersonating } = useAuth();
  const { showNotifications, showCredits, showChatbot } = useUiPreferences();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === 'true');
  const [popups, setPopups] = useState<Notification[]>([]);
  const { data: notifications } = useNotifications();

  const toggleCollapsed = () => {
    setCollapsed(prev => {
      localStorage.setItem('sidebar-collapsed', String(!prev));
      return !prev;
    });
  };

  // Auto-dismiss popups whenever a notification becomes read or is deleted —
  // covers cross-tab sync (refetch via BC/SW) and focus-on-tab (refetchOnWindowFocus).
  useEffect(() => {
    if (!notifications) return;
    const notifMap = new Map(notifications.map(n => [n.id, n]));
    setPopups(prev => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter(p => {
        const n = notifMap.get(p.id);
        return n && !n.is_read;
      });
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [notifications]);

  const handleNewNotification = useCallback((n: Notification) => {
    setPopups(prev => {
      if (prev.some(p => p.id === n.id)) return prev;
      return [...prev, n];
    });
  }, []);

  const dismissPopup = (id: string) => {
    setPopups(prev => prev.filter(p => p.id !== id));
  };

  return (
    <OperationBannerProvider>
      <SessionTracker />
      <FaviconBadge />
      <SwRefetchListener />
      <BcRefetchListener />
      <NotificationWatcher onNew={handleNewNotification} />
      <PushAutoSubscribe />
      <div className="min-h-screen w-full">
        <AppSidebar collapsed={collapsed} onToggle={toggleCollapsed} />
        <div className={`${collapsed ? 'lg:ml-[72px]' : 'lg:ml-64'} min-h-screen flex flex-col transition-[margin] duration-300`}>
          {isImpersonating && <ImpersonationBanner />}
          <div className={`flex items-center justify-end gap-1 px-4 lg:px-8 pt-3 pb-1 min-h-[3.5rem] lg:min-h-0 ${!showNotifications && !showCredits ? 'lg:hidden' : ''}`}>
            {showCredits && <CreditWidget />}
            {showNotifications && <NotificationCenter />}
          </div>
          <main className="flex-1 px-4 lg:px-8 pb-4 lg:pb-8">
            <Outlet />
          </main>
        </div>
        <ScrollRestoration />
        <OperationBanner />
        {showChatbot && <HelpCenter />}
        <FeedbackPopup />
        <NotificationPopup popups={popups} onDismiss={dismissPopup} />
      </div>
    </OperationBannerProvider>
  );
}
