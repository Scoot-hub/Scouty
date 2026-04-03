import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Shield, Crown, RotateCcw, Users, Mail, UserCheck, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

interface AdminUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  is_premium: boolean;
  premium_since: string | null;
  roles: string[];
  player_count: number;
}

export default function Admin() {
  const API_BASE = import.meta.env.VITE_API_URL || '/api';
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { user: currentUser, startImpersonation } = useAuth();
  const queryClient = useQueryClient();
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

  const { data: users = [], isLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const response = await fetch(
        `${API_BASE}/admin/users`,
        {
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
        }
      );
      if (!response.ok) throw new Error('Failed to fetch users');
      return response.json();
    },
    enabled: isAdmin === true,
  });

  const togglePremium = async (userId: string, current: boolean) => {
    setTogglingId(userId);
    try {
      const response = await fetch(
        `${API_BASE}/admin/users/toggle-premium`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId, isPremium: !current }),
        }
      );
      if (!response.ok) throw new Error();
      toast.success(!current ? t('admin.premium_enabled') : t('admin.premium_disabled'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch {
      toast.error(t('common.error'));
    } finally {
      setTogglingId(null);
    }
  };

  const resetPassword = async (userId: string, email: string) => {
    setResettingId(userId);
    try {
      const response = await fetch(
        `${API_BASE}/admin/users/reset-password`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ email }),
        }
      );
      if (!response.ok) throw new Error();
      toast.success(t('admin.reset_email_sent', { email }));
    } catch {
      toast.error(t('admin.reset_email_error'));
    } finally {
      setResettingId(null);
    }
  };

  const impersonate = async (userId: string, email: string) => {
    setImpersonatingId(userId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(
        `${API_BASE}/admin/impersonate`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session?.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ userId }),
        }
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        console.error('[impersonate] response error:', response.status, err);
        throw new Error(err.error || 'Failed');
      }
      const data = await response.json();
      if (!data.session) {
        console.error('[impersonate] no session in response:', data);
        throw new Error('No session returned');
      }
      toast.success(t('admin.impersonating', { email }));
      startImpersonation(data.session);
    } catch (err) {
      console.error('[impersonate] error:', err);
      toast.error(t('common.error'));
      setImpersonatingId(null);
    }
  };

  if (adminLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );

  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-6 overflow-hidden">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('admin.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('admin.subtitle')}</p>
          </div>
        </div>
        <Link to="/admin/analytics">
          <Button variant="outline" className="rounded-xl gap-2">
            <BarChart3 className="w-4 h-4" />
            {t('admin.analytics')}
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-none card-warm">
          <CardContent className="p-5 flex items-center gap-4">
            <Users className="w-8 h-8 text-primary" />
            <div>
              <p className="text-2xl font-bold">{users.length}</p>
              <p className="text-xs text-muted-foreground">{t('admin.users')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none card-warm">
          <CardContent className="p-5 flex items-center gap-4">
            <Crown className="w-8 h-8 text-amber-500" />
            <div>
              <p className="text-2xl font-bold">{users.filter(u => u.is_premium).length}</p>
              <p className="text-xs text-muted-foreground">{t('admin.premium')}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none card-warm">
          <CardContent className="p-5 flex items-center gap-4">
            <Users className="w-8 h-8 text-muted-foreground" />
            <div>
              <p className="text-2xl font-bold">{users.reduce((s, u) => s + u.player_count, 0)}</p>
              <p className="text-xs text-muted-foreground">{t('admin.total_players')}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Users table */}
      <Card className="border-none card-warm overflow-hidden">
        <CardContent className="p-0 overflow-x-auto">
          {isLoading ? (
            <p className="p-6 text-center text-muted-foreground">{t('common.loading')}</p>
          ) : (
            <Table className="min-w-0">
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin.email')}</TableHead>
                  <TableHead>{t('admin.registration')}</TableHead>
                  <TableHead>{t('admin.last_login')}</TableHead>
                  <TableHead>{t('admin.players')}</TableHead>
                  <TableHead>{t('admin.status')}</TableHead>
                  <TableHead>{t('admin.actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map(u => (
                  <TableRow key={u.id}>
                    <TableCell className="font-medium whitespace-nowrap">
                      <div className="flex items-center gap-2">
                        <span className="truncate max-w-[200px]">{u.email}</span>
                        {u.roles.includes('admin') && (
                          <Badge variant="outline" className="text-[10px]">{t('admin.admin_badge')}</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {new Date(u.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell className="text-sm font-medium whitespace-nowrap">{u.player_count}</TableCell>
                    <TableCell>
                      {u.is_premium ? (
                        <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                          <Crown className="w-3 h-3 mr-1" /> {t('admin.premium')}
                        </Badge>
                      ) : (
                        <Badge variant="secondary">{t('admin.free')}</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          className="rounded-lg h-7 w-7"
                          onClick={() => togglePremium(u.id, u.is_premium)}
                          disabled={togglingId === u.id}
                          title={u.is_premium ? t('admin.remove') : t('admin.premium')}
                        >
                          <Crown className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="rounded-lg h-7 w-7"
                          onClick={() => resetPassword(u.id, u.email)}
                          disabled={resettingId === u.id}
                          title={t('admin.reset_pwd')}
                        >
                          <Mail className="w-3.5 h-3.5" />
                        </Button>
                        {u.id !== currentUser?.id && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-lg h-7 w-7 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                            onClick={() => impersonate(u.id, u.email)}
                            disabled={impersonatingId === u.id}
                            title={t('admin.impersonate')}
                          >
                            <UserCheck className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
