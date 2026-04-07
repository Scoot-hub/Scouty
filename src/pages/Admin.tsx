import { useState, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Shield, Crown, Users, Mail, UserCheck, BarChart3, Lock, Check, X, Search, Plus, Trash2, ShieldCheck, ChevronDown, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// Sub-actions per page — defines granular permissions beyond just "view"
const PAGE_ACTIONS: Record<string, string[]> = {
  players:        ['view', 'create', 'edit', 'delete', 'export', 'import', 'enrich', 'find_duplicates', 'bulk_actions'],
  player_profile: ['view', 'edit', 'delete', 'enrich', 'add_report', 'edit_report', 'delete_report', 'add_note', 'delete_note', 'manage_fields'],
  add_player:     ['view', 'create', 'add_report'],
  watchlist:      ['view', 'create', 'edit', 'delete', 'add_player', 'remove_player'],
  shadow_team:    ['view', 'create', 'edit', 'delete', 'assign_player', 'remove_player', 'download_image'],
  fixtures:       ['view', 'save_match', 'assign_match', 'assign_scout'],
  my_matches:     ['view', 'edit_status', 'delete'],
  contacts:       ['view', 'create', 'edit', 'delete', 'share'],
  settings:       ['view', 'edit_profile', 'manage_fields', 'change_language', 'change_theme'],
  account:        ['view', 'edit', 'manage_security'],
  organization:   ['view', 'create', 'manage_members', 'change_member_role', 'remove_member', 'manage_settings', 'share'],
  booking:        ['view', 'book'],
  checkout:       ['view'],
  community:      ['view', 'post', 'reply', 'like', 'mention', 'moderate', 'delete_content'],
  discover:       ['view', 'search', 'add_player', 'filter'],
  map:            ['view', 'view_nearby'],
  affiliate:      ['view', 'share'],
  my_clubs:       ['view', 'follow', 'unfollow'],
  club_profile:   ['view', 'follow', 'unfollow', 'view_squad'],
  user_profile:   ['view', 'edit'],
  admin:          ['view', 'manage_users', 'manage_roles', 'impersonate', 'toggle_premium', 'reset_password', 'delete_user', 'view_analytics', 'manage_tickets'],
};

const ALL_PAGES = Object.keys(PAGE_ACTIONS);

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

interface PagePermission {
  role: string;
  page_key: string;
  action: string;
  allowed: number;
}

async function getAuthHeaders() {
  const session = (await supabase.auth.getSession()).data.session;
  return {
    Authorization: `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  };
}

export default function Admin() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { user: currentUser, startImpersonation } = useAuth();
  const queryClient = useQueryClient();

  // ── Users section state ──
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);
  const [deletingUser, setDeletingUser] = useState<AdminUser | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // ── Roles section state ──
  const [selectedRole, setSelectedRole] = useState('user');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [updatingPerm, setUpdatingPerm] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [showNewRole, setShowNewRole] = useState(false);
  const [rolesInnerTab, setRolesInnerTab] = useState('permissions');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [addRoleForUser, setAddRoleForUser] = useState<string | null>(null);
  const [addRoleValue, setAddRoleValue] = useState('');

  // ── Shared data: users ──
  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/users`, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // ── Roles data ──
  const { data: roles = [] } = useQuery<string[]>({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/roles`, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  const { data: permissions = [] } = useQuery<PagePermission[]>({
    queryKey: ['admin-page-permissions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/page-permissions`, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // ── Derived data ──
  // Build permissions map: { role: { page_key: { action: boolean } } }
  const permMap = useMemo(() => {
    const map: Record<string, Record<string, Record<string, boolean>>> = {};
    for (const p of permissions) {
      if (!map[p.role]) map[p.role] = {};
      if (!map[p.role][p.page_key]) map[p.role][p.page_key] = {};
      map[p.role][p.page_key][p.action || 'view'] = !!p.allowed;
    }
    return map;
  }, [permissions]);

  const allRoles = useMemo(() => {
    const set = new Set(['admin', 'user', ...roles]);
    return Array.from(set).sort((a, b) => {
      if (a === 'admin') return -1;
      if (b === 'admin') return 1;
      if (a === 'user') return -1;
      if (b === 'user') return 1;
      return a.localeCompare(b);
    });
  }, [roles]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const q = searchTerm.toLowerCase();
    return users.filter(u => u.email.toLowerCase().includes(q));
  }, [users, searchTerm]);

  // ── Users handlers ──
  const togglePremium = async (userId: string, current: boolean) => {
    setTogglingId(userId);
    try {
      const response = await fetch(`${API_BASE}/admin/users/toggle-premium`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ userId, isPremium: !current }),
      });
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
      const response = await fetch(`${API_BASE}/admin/users/reset-password`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ email }),
      });
      if (!response.ok) throw new Error();
      toast.success(t('admin.reset_email_sent', { email }));
    } catch {
      toast.error(t('admin.reset_email_error'));
    } finally {
      setResettingId(null);
    }
  };

  const deleteUser = async () => {
    if (!deletingUser) return;
    setDeletingId(deletingUser.id);
    try {
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      const response = await fetch(`${API_BASE}/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast.success(t('admin.delete_user_success', { email: deletingUser.email }));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err: any) {
      const msg = err?.message?.includes('administrateur')
        ? t('admin.delete_user_admin_error')
        : t('admin.delete_user_error');
      toast.error(msg);
    } finally {
      setDeletingId(null);
      setDeletingUser(null);
    }
  };

  const impersonate = async (userId: string, email: string) => {
    setImpersonatingId(userId);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const response = await fetch(`${API_BASE}/admin/impersonate`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${session?.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      const data = await response.json();
      if (!data.session) throw new Error('No session returned');
      toast.success(t('admin.impersonating', { email }));
      startImpersonation(data.session);
    } catch (err) {
      console.error('[impersonate] error:', err);
      toast.error(t('common.error'));
      setImpersonatingId(null);
    }
  };

  // ── Roles handlers ──
  const addRoleToUser = async (userId: string, role: string) => {
    setUpdatingUser(userId);
    try {
      const res = await fetch(`${API_BASE}/admin/roles/add`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('roles.role_updated'));
      setAddRoleForUser(null); setAddRoleValue('');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch { toast.error(t('common.error')); }
    finally { setUpdatingUser(null); }
  };

  const removeRoleFromUser = async (userId: string, role: string) => {
    setUpdatingUser(userId);
    try {
      const res = await fetch(`${API_BASE}/admin/roles/remove`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('roles.role_updated'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch { toast.error(t('common.error')); }
    finally { setUpdatingUser(null); }
  };

  const togglePermission = async (role: string, pageKey: string, action: string, currentlyAllowed: boolean) => {
    const permId = `${role}-${pageKey}-${action}`;
    setUpdatingPerm(permId);
    try {
      const res = await fetch(`${API_BASE}/admin/page-permissions`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ role, page_key: pageKey, action, allowed: !currentlyAllowed }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ['admin-page-permissions'] });
    } catch {
      toast.error(t('common.error'));
    } finally {
      setUpdatingPerm(null);
    }
  };

  const createRole = async () => {
    const name = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name || name === 'admin' || name === 'user') return;
    try {
      for (const page of ALL_PAGES) {
        for (const action of PAGE_ACTIONS[page]) {
          const allowed = page === 'admin' && action !== 'view' ? false : true;
          await fetch(`${API_BASE}/admin/page-permissions`, {
            method: 'POST',
            headers: await getAuthHeaders(),
            body: JSON.stringify({ role: name, page_key: page, action, allowed }),
          });
        }
      }
      toast.success(t('roles.role_created'));
      setNewRoleName('');
      setShowNewRole(false);
      setSelectedRole(name);
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-page-permissions'] });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const deleteRole = async (role: string) => {
    if (role === 'admin' || role === 'user') return;
    try {
      const res = await fetch(`${API_BASE}/admin/roles/delete`, {
        method: 'POST', headers: await getAuthHeaders(), body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('roles.role_deleted'));
      setSelectedRole('user');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-page-permissions'] });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const isActionAllowed = (role: string, pageKey: string, action: string): boolean => {
    if (role === 'admin') return true;
    const val = permMap[role]?.[pageKey]?.[action];
    if (val === undefined) return action === 'view' ? pageKey !== 'admin' : pageKey !== 'admin';
    return val;
  };

  // ── Guard ──
  if (adminLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );

  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 overflow-hidden">
      {/* Header */}
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

      {/* Section selector */}
      <Tabs defaultValue="users" className="w-full space-y-6">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">{t('admin.tab_users')}</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">{t('admin.tab_roles')}</span>
          </TabsTrigger>
        </TabsList>

        {/* ── Tab: Users ── */}
        <TabsContent value="users" className="space-y-4">
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
              {usersLoading ? (
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
                            {u.id !== currentUser?.id && !u.roles.includes('admin') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="rounded-lg h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeletingUser(u)}
                            disabled={deletingId === u.id}
                            title={t('admin.delete_user')}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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
        </TabsContent>

        {/* ── Tab: Roles & Access ── */}
        <TabsContent value="roles" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-none card-warm">
              <CardContent className="p-5 flex items-center gap-4">
                <Users className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{users.length}</p>
                  <p className="text-xs text-muted-foreground">{t('roles.total_users')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none card-warm">
              <CardContent className="p-5 flex items-center gap-4">
                <Shield className="w-8 h-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{allRoles.length}</p>
                  <p className="text-xs text-muted-foreground">{t('roles.total_roles')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none card-warm">
              <CardContent className="p-5 flex items-center gap-4">
                <Lock className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{ALL_PAGES.length}</p>
                  <p className="text-xs text-muted-foreground">{t('roles.total_pages')}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Inner tabs: Permissions / User Roles */}
          <Tabs value={rolesInnerTab} onValueChange={setRolesInnerTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="permissions">{t('roles.tab_permissions')}</TabsTrigger>
              <TabsTrigger value="user-roles">{t('roles.tab_users')}</TabsTrigger>
            </TabsList>

            {/* Inner tab: Page Permissions */}
            <TabsContent value="permissions" className="space-y-4">
              {/* Role selector + create */}
              <div className="flex flex-wrap items-center gap-2">
                {allRoles.map(role => (
                  <Button
                    key={role}
                    variant={selectedRole === role ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSelectedRole(role)}
                    className="capitalize"
                  >
                    {role === 'admin' && <Shield className="w-3.5 h-3.5 mr-1.5" />}
                    {role}
                  </Button>
                ))}
                {showNewRole ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={newRoleName}
                      onChange={(e) => setNewRoleName(e.target.value)}
                      placeholder={t('roles.new_role_placeholder')}
                      className="h-8 px-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                      onKeyDown={(e) => e.key === 'Enter' && createRole()}
                      autoFocus
                    />
                    <Button size="sm" onClick={createRole} disabled={!newRoleName.trim()}>
                      <Check className="w-3.5 h-3.5" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setShowNewRole(false); setNewRoleName(''); }}>
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" onClick={() => setShowNewRole(true)}>
                    <Plus className="w-3.5 h-3.5 mr-1" />
                    {t('roles.add_role')}
                  </Button>
                )}
              </div>

              {/* Permissions matrix with sub-actions */}
              <Card className="border-none card-warm overflow-hidden">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-base capitalize flex items-center gap-2">
                        {selectedRole}
                        {selectedRole === 'admin' && (
                          <Badge variant="outline" className="text-[10px]">{t('roles.full_access')}</Badge>
                        )}
                      </CardTitle>
                      <CardDescription>
                        {selectedRole === 'admin' ? t('roles.admin_desc') : t('roles.perm_desc')}
                      </CardDescription>
                    </div>
                    {selectedRole !== 'admin' && selectedRole !== 'user' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => deleteRole(selectedRole)}
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        {t('roles.delete_role')}
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[240px]">{t('roles.page')}</TableHead>
                        <TableHead className="w-[100px] text-center">{t('roles.access')}</TableHead>
                        <TableHead>{t('roles.sub_actions')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ALL_PAGES.map(pageKey => {
                        const actions = PAGE_ACTIONS[pageKey];
                        const hasSubActions = actions.length > 1;
                        const isExpanded = expandedPages.has(pageKey);
                        const isAdminRole = selectedRole === 'admin';
                        const viewAllowed = isActionAllowed(selectedRole, pageKey, 'view');

                        return (
                          <Fragment key={pageKey}>
                            {/* Main page row */}
                            <TableRow className={cn(isExpanded && 'border-b-0')}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  {hasSubActions ? (
                                    <button
                                      onClick={() => setExpandedPages(prev => {
                                        const next = new Set(prev);
                                        next.has(pageKey) ? next.delete(pageKey) : next.add(pageKey);
                                        return next;
                                      })}
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                    >
                                      {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                    </button>
                                  ) : (
                                    <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                                  )}
                                  {t(`roles.page_${pageKey}`)}
                                </div>
                              </TableCell>
                              <TableCell className="text-center">
                                {isAdminRole ? (
                                  <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                    <Check className="w-3 h-3 mr-1" />{t('roles.allowed')}
                                  </Badge>
                                ) : (
                                  <Button variant="ghost" size="sm"
                                    disabled={updatingPerm === `${selectedRole}-${pageKey}-view`}
                                    onClick={() => togglePermission(selectedRole, pageKey, 'view', viewAllowed)}
                                    className={cn('text-xs', viewAllowed
                                      ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                      : 'text-red-500 hover:text-red-600 hover:bg-red-50')}>
                                    {viewAllowed
                                      ? <><Check className="w-3 h-3 mr-1" />{t('roles.allowed')}</>
                                      : <><X className="w-3 h-3 mr-1" />{t('roles.blocked')}</>}
                                  </Button>
                                )}
                              </TableCell>
                              <TableCell>
                                {hasSubActions && !isExpanded && (
                                  <button
                                    onClick={() => setExpandedPages(prev => { const n = new Set(prev); n.add(pageKey); return n; })}
                                    className="text-xs text-muted-foreground hover:text-primary transition-colors flex items-center gap-1"
                                  >
                                    <ChevronRight className="w-3 h-3" />
                                    {actions.length - 1} {t('roles.more_actions')}
                                  </button>
                                )}
                              </TableCell>
                            </TableRow>

                            {/* Expanded sub-actions rows */}
                            {isExpanded && hasSubActions && actions.filter(a => a !== 'view').map(action => {
                              const actionAllowed = isActionAllowed(selectedRole, pageKey, action);
                              const updKey = `${selectedRole}-${pageKey}-${action}`;
                              return (
                                <TableRow key={`${pageKey}-${action}`} className="bg-muted/20">
                                  <TableCell className="pl-10 py-2">
                                    <span className="text-xs text-muted-foreground flex items-center gap-2">
                                      <span className="w-3.5 h-3.5 rounded-sm bg-border inline-block shrink-0" />
                                      {t(`roles.action_${action}`, { defaultValue: action.replace(/_/g, ' ') })}
                                    </span>
                                  </TableCell>
                                  <TableCell className="text-center py-2">
                                    {isAdminRole ? (
                                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px]">
                                        <Check className="w-3 h-3 mr-1" />{t('roles.allowed')}
                                      </Badge>
                                    ) : (
                                      <Button variant="ghost" size="sm"
                                        disabled={updatingPerm === updKey}
                                        onClick={() => togglePermission(selectedRole, pageKey, action, actionAllowed)}
                                        className={cn('text-xs h-7', actionAllowed
                                          ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                          : 'text-red-500 hover:text-red-600 hover:bg-red-50')}>
                                        {actionAllowed
                                          ? <><Check className="w-3 h-3 mr-1" />{t('roles.allowed')}</>
                                          : <><X className="w-3 h-3 mr-1" />{t('roles.blocked')}</>}
                                      </Button>
                                    )}
                                  </TableCell>
                                  <TableCell />
                                </TableRow>
                              );
                            })}
                          </Fragment>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Inner tab: User Roles */}
            <TabsContent value="user-roles" className="space-y-4">
              {/* Search */}
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder={t('roles.search_users')}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <Card className="border-none card-warm overflow-hidden">
                <CardContent className="p-0 overflow-x-auto">
                  {usersLoading ? (
                    <p className="p-6 text-center text-muted-foreground">{t('common.loading')}</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{t('roles.email')}</TableHead>
                          <TableHead>{t('roles.current_role')}</TableHead>
                          <TableHead>{t('roles.add_role_action')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map(u => {
                          const isCurrentUser = u.id === currentUser?.id;
                          const isUpdating = updatingUser === u.id;
                          const userRoles = u.roles.length > 0 ? u.roles : ['user'];
                          const availableToAdd = allRoles.filter(r => !userRoles.includes(r));

                          return (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <span className="truncate max-w-[220px]">{u.email}</span>
                                  {isCurrentUser && <Badge variant="secondary" className="text-[10px]">{t('roles.you')}</Badge>}
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex items-center flex-wrap gap-1.5">
                                  {userRoles.map(role => (
                                    <Badge key={role}
                                      variant={role === 'admin' ? 'default' : 'secondary'}
                                      className="capitalize flex items-center gap-1 pr-1">
                                      {role === 'admin' && <Shield className="w-2.5 h-2.5" />}
                                      {role}
                                      {!isCurrentUser && (
                                        <button
                                          onClick={() => removeRoleFromUser(u.id, role)}
                                          disabled={isUpdating}
                                          className="ml-0.5 rounded hover:bg-destructive/20 hover:text-destructive transition-colors p-0.5"
                                        >
                                          <X className="w-2.5 h-2.5" />
                                        </button>
                                      )}
                                    </Badge>
                                  ))}
                                </div>
                              </TableCell>
                              <TableCell>
                                {!isCurrentUser && availableToAdd.length > 0 && (
                                  addRoleForUser === u.id ? (
                                    <div className="flex items-center gap-1.5">
                                      <select
                                        value={addRoleValue}
                                        onChange={e => setAddRoleValue(e.target.value)}
                                        className="h-7 px-2 text-xs rounded-lg border border-input bg-background focus:outline-none focus:ring-1 focus:ring-ring capitalize"
                                        autoFocus
                                      >
                                        <option value="">— {t('roles.select_role')} —</option>
                                        {availableToAdd.map(r => <option key={r} value={r} className="capitalize">{r}</option>)}
                                      </select>
                                      <Button size="sm" className="h-7"
                                        disabled={!addRoleValue || isUpdating}
                                        onClick={() => addRoleToUser(u.id, addRoleValue)}>
                                        <Check className="w-3 h-3" />
                                      </Button>
                                      <Button size="sm" variant="ghost" className="h-7"
                                        onClick={() => { setAddRoleForUser(null); setAddRoleValue(''); }}>
                                        <X className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <Button variant="outline" size="sm" className="h-7 text-xs"
                                      onClick={() => { setAddRoleForUser(u.id); setAddRoleValue(''); }}>
                                      <Plus className="w-3 h-3 mr-1" />{t('roles.add_role_action')}
                                    </Button>
                                  )
                                )}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </TabsContent>
      </Tabs>
      <AlertDialog open={!!deletingUser} onOpenChange={open => { if (!open) setDeletingUser(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.delete_user_title')}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <span dangerouslySetInnerHTML={{ __html: t('admin.delete_user_desc', { email: deletingUser?.email ?? '' }) }} />
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('admin.delete_user_cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteUser}
            >
              {t('admin.delete_user_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
