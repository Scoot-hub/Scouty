import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

export type PushStatus = 'unsupported' | 'denied' | 'subscribed' | 'unsubscribed' | 'loading';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(c => c.charCodeAt(0)));
}

export function usePushSubscription() {
  const { user } = useAuth();
  const [status, setStatus] = useState<PushStatus>('loading');
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    if (!user) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        if (cancelled) return;
        registrationRef.current = reg;

        const perm = Notification.permission;
        if (perm === 'denied') { setStatus('denied'); return; }

        const existing = await reg.pushManager.getSubscription();
        if (existing) {
          setSubscription(existing);
          setStatus('subscribed');
        } else {
          setStatus('unsubscribed');
        }
      } catch (err) {
        console.warn('[push] SW registration error:', err);
        setStatus('unsupported');
      }
    })();

    return () => { cancelled = true; };
  }, [user]);

  const subscribe = async (): Promise<boolean> => {
    if (!registrationRef.current) return false;
    try {
      // Request permission
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { setStatus('denied'); return false; }

      // Fetch VAPID public key
      const keyRes = await fetch(`${API}/push/vapid-public-key`, { credentials: 'include' });
      if (!keyRes.ok) return false;
      const { publicKey } = await keyRes.json();

      const sub = await registrationRef.current.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      // Register on server
      const regRes = await fetch(`${API}/push/subscribe`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
      if (!regRes.ok) { await sub.unsubscribe(); return false; }

      setSubscription(sub);
      setStatus('subscribed');
      return true;
    } catch (err) {
      console.warn('[push] subscribe error:', err);
      return false;
    }
  };

  const unsubscribe = async (): Promise<boolean> => {
    if (!subscription) return false;
    try {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await fetch(`${API}/push/unsubscribe`, {
        method: 'DELETE',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpoint }),
      });
      setSubscription(null);
      setStatus('unsubscribed');
      return true;
    } catch (err) {
      console.warn('[push] unsubscribe error:', err);
      return false;
    }
  };

  return { status, subscription, subscribe, unsubscribe };
}
