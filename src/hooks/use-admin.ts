import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export function useIsAdmin() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['is-admin', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase.rpc('has_role', {
        _user_id: user.id,
        _role: 'admin',
      });
      if (error) return false;
      return !!data;
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
  });
}

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/$/, '');

export function useMyPermissions() {
  const { user } = useAuth();
  return useQuery<{ role: string; permissions: Record<string, boolean> }>({
    queryKey: ['my-permissions', user?.id],
    queryFn: async () => {
      const session = (await supabase.auth.getSession()).data.session;
      const res = await fetch(`${API_BASE}/my-permissions`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) return { role: 'user', permissions: {} };
      return res.json();
    },
    enabled: !!user,
    staleTime: 2 * 60 * 1000,
  });
}

export function useIsPremium() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['is-premium', user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data, error } = await supabase
        .from('user_subscriptions')
        .select('is_premium')
        .eq('user_id', user.id)
        .single();
      if (error || !data) return false;
      return data.is_premium;
    },
    enabled: !!user,
    staleTime: 60 * 1000,
  });
}
