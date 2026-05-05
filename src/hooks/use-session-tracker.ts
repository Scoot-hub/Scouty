import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');
const SESSION_ID_KEY = 'scouthub_session_id';
const SESSION_START_KEY = 'scouthub_session_start';
const HEARTBEAT_INTERVAL = 30_000;

function genSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function getOrCreateSessionId(): string {
  let id = sessionStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = genSessionId();
    sessionStorage.setItem(SESSION_ID_KEY, id);
    sessionStorage.setItem(SESSION_START_KEY, new Date().toISOString());
  }
  return id;
}

function detectDevice(ua: string): 'desktop' | 'mobile' | 'tablet' {
  if (/tablet|ipad|playbook|silk/i.test(ua)) return 'tablet';
  if (/mobile|android|iphone|ipod|blackberry|windows phone/i.test(ua)) return 'mobile';
  return 'desktop';
}

function detectBrowser(ua: string): string {
  if (/edg\//i.test(ua)) return 'Edge';
  if (/opr\/|opera/i.test(ua)) return 'Opera';
  if (/firefox/i.test(ua)) return 'Firefox';
  if (/chrome/i.test(ua)) return 'Chrome';
  if (/safari/i.test(ua)) return 'Safari';
  return 'Other';
}

function detectOS(ua: string): string {
  if (/windows nt/i.test(ua)) return 'Windows';
  if (/mac os x|macintosh/i.test(ua)) return 'macOS';
  if (/android/i.test(ua)) return 'Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'iOS';
  if (/linux/i.test(ua)) return 'Linux';
  return 'Other';
}

// Try to get geolocation if user already granted permission (non-blocking, no prompt)
async function tryGetCachedGeo(): Promise<{ lat: number; lon: number } | null> {
  try {
    const perm = await navigator.permissions?.query({ name: 'geolocation' as PermissionName });
    if (perm?.state !== 'granted') return null;
    return new Promise(resolve => {
      navigator.geolocation.getCurrentPosition(
        pos => resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
        () => resolve(null),
        { timeout: 2000, maximumAge: 300_000 }
      );
    });
  } catch {
    return null;
  }
}

export function useSessionTracker() {
  const { user } = useAuth();
  const location = useLocation();
  const pageRef = useRef(location.pathname);
  const geoRef = useRef<{ lat: number; lon: number } | null>(null);

  useEffect(() => {
    pageRef.current = location.pathname;
  }, [location.pathname]);

  useEffect(() => {
    if (!user) return;

    const ua = navigator.userAgent;
    const sessionId = getOrCreateSessionId();
    const startedAt = sessionStorage.getItem(SESSION_START_KEY) || new Date().toISOString();

    // Grab geo once per session if already permitted
    tryGetCachedGeo().then(geo => { geoRef.current = geo; }).catch(() => {});

    const payload = () => ({
      session_id: sessionId,
      device_type: detectDevice(ua),
      browser: detectBrowser(ua),
      os: detectOS(ua),
      screen_width: window.screen.width,
      screen_height: window.screen.height,
      language: navigator.language?.slice(0, 10) || null,
      current_page: pageRef.current,
      started_at: startedAt,
      geo_lat: geoRef.current?.lat ?? null,
      geo_lon: geoRef.current?.lon ?? null,
    });

    const send = () =>
      fetch(`${API}/analytics/heartbeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload()),
      }).catch(() => {});

    send();
    const timer = setInterval(send, HEARTBEAT_INTERVAL);
    return () => clearInterval(timer);
  }, [user]);
}
