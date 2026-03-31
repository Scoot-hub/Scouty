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
  access_token: string;
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
  /** Start impersonating – stores current admin session and switches to target */
  startImpersonation: (targetSession: Session) => void;
  /** Stop impersonating – restores the original admin session */
  stopImpersonation: () => void;
}

const IMPERSONATE_KEY = 'scouthub_admin_session';

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
    // Save the current admin session in a separate key
    const currentRaw = localStorage.getItem('scouthub_session');
    if (currentRaw) {
      localStorage.setItem(IMPERSONATE_KEY, currentRaw);
    }
    // Switch to the impersonated user's session
    localStorage.setItem('scouthub_session', JSON.stringify(targetSession));
    setSession(targetSession);
    setUser(targetSession.user);
    setIsImpersonating(true);
    // Force reload to reset all query caches
    window.location.href = '/players';
  }, []);

  const stopImpersonation = useCallback(() => {
    const adminRaw = localStorage.getItem(IMPERSONATE_KEY);
    if (adminRaw) {
      localStorage.setItem('scouthub_session', adminRaw);
      localStorage.removeItem(IMPERSONATE_KEY);
      const adminSession = JSON.parse(adminRaw) as Session;
      setSession(adminSession);
      setUser(adminSession.user);
      setIsImpersonating(false);
      // Force reload to reset all query caches
      window.location.href = '/admin';
    }
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
