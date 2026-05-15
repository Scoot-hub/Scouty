import { createContext, useContext, useEffect, useRef, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string | null;
  oauth_provider?: string | null;
  has_password?: boolean;
}

interface Session {
  token_type: string;
  expires_in: number;
  user: User;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signOut: () => Promise<void>;
  /** true when an admin is viewing as another user */
  isImpersonating: boolean;
  /** Start impersonating – calls server to swap auth cookie */
  startImpersonation: (targetSession: Session) => void;
  /** Stop impersonating – calls server to restore admin cookie */
  stopImpersonation: () => void;
}

const IMPERSONATE_KEY = 'scouthub_impersonating';
export const INACTIVITY_TIMEOUT_KEY = 'scouthub_session_timeout';
const ACTIVITY_EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'] as const;

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signOut: async () => {},
  isImpersonating: false,
  startImpersonation: () => {},
  stopImpersonation: () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isImpersonating, setIsImpersonating] = useState(() => !!localStorage.getItem(IMPERSONATE_KEY));
  const inactivityTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const signOutRef = useRef<() => Promise<void>>(() => Promise.resolve());

  useEffect(() => {
    // Listen FIRST, then get session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Safety net: never leave the auth loading spinner stuck if /auth/session hangs
    // (slow Vercel cold start, dropped connection, etc.). After 8s, give up and
    // treat as not-logged-in — the ProtectedRoute will redirect to /auth.
    const loadingTimeout = setTimeout(() => setLoading(false), 8000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session);
        setUser(session?.user ?? null);
      })
      .catch(err => { console.error('[auth] getSession failed:', err); })
      .finally(() => {
        clearTimeout(loadingTimeout);
        setLoading(false);
      });

    return () => {
      clearTimeout(loadingTimeout);
      subscription.unsubscribe();
    };
  }, []);

  const startImpersonation = useCallback((targetSession: Session) => {
    // Mark that we are impersonating (admin cookie is stored server-side)
    localStorage.setItem(IMPERSONATE_KEY, 'true');
    // Update local UI state with the impersonated user info
    const storedSession = { token_type: targetSession.token_type, expires_in: targetSession.expires_in, user: targetSession.user };
    localStorage.setItem('scouthub_session', JSON.stringify(storedSession));
    setSession(targetSession);
    setUser(targetSession.user);
    setIsImpersonating(true);
    // Force reload to reset all query caches
    window.location.href = '/players';
  }, []);

  const stopImpersonation = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stop-impersonation', {
        method: 'POST',
        credentials: 'include',
      });
      const data = await res.json();
      if (data.session) {
        localStorage.setItem('scouthub_session', JSON.stringify(data.session));
        setSession(data.session);
        setUser(data.session.user);
      }
    } catch (err) {
      console.error('Failed to stop impersonation:', err);
    }
    localStorage.removeItem(IMPERSONATE_KEY);
    setIsImpersonating(false);
    // Force reload to reset all query caches
    window.location.href = '/admin';
  }, []);

  const signOut = async () => {
    if (isImpersonating) {
      stopImpersonation();
      return;
    }
    try { sessionStorage.removeItem('fixtures_day_offset'); } catch {}
    await supabase.auth.signOut();
  };

  // keep a stable ref so the inactivity effect can call signOut without re-running
  signOutRef.current = signOut;

  // Inactivity auto-logout
  useEffect(() => {
    if (!user) return;

    const getTimeoutMs = () => {
      const raw = localStorage.getItem(INACTIVITY_TIMEOUT_KEY);
      const minutes = raw ? parseInt(raw, 10) : 0;
      return minutes > 0 ? minutes * 60 * 1000 : 0;
    };

    const clearTimers = () => {
      if (inactivityTimer.current) clearTimeout(inactivityTimer.current);
      if (warningTimer.current) clearTimeout(warningTimer.current);
    };

    const scheduleLogout = () => {
      clearTimers();
      const ms = getTimeoutMs();
      if (!ms) return;

      const warningMs = ms - 60_000;
      if (warningMs > 0) {
        warningTimer.current = setTimeout(() => {
          toast.warning('Déconnexion dans 1 minute en raison d\'inactivité.', { id: 'inactivity-warning', duration: 55_000 });
        }, warningMs);
      }

      inactivityTimer.current = setTimeout(() => {
        toast.dismiss('inactivity-warning');
        toast.info('Session expirée — vous avez été déconnecté.', { duration: 5000 });
        signOutRef.current();
      }, ms);
    };

    const onActivity = () => scheduleLogout();

    scheduleLogout();
    ACTIVITY_EVENTS.forEach(e => window.addEventListener(e, onActivity, { passive: true }));

    return () => {
      clearTimers();
      ACTIVITY_EVENTS.forEach(e => window.removeEventListener(e, onActivity));
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, isImpersonating, startImpersonation, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
