import { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface User {
  id: string;
  email: string;
  created_at?: string;
  updated_at?: string;
  last_sign_in_at?: string | null;
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

  useEffect(() => {
    // Listen FIRST, then get session
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
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
    // If impersonating, just stop impersonation instead of signing out
    if (isImpersonating) {
      stopImpersonation();
      return;
    }
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, signOut, isImpersonating, startImpersonation, stopImpersonation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
