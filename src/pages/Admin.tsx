import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Shield, Crown, Users, Mail, UserCheck, BarChart3, Lock, Check, X, Search, Plus, Trash2, ShieldCheck, Building2, UserPlus, UserMinus } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

const API_BASE = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

// All protected pages in the app
const ALL_PAGES = [
  { key: 'players', icon: 'Users' },
  { key: 'player_profile', icon: 'User' },
  { key: 'add_player', icon: 'UserPlus' },
  { key: 'watchlist', icon: 'Eye' },
  { key: 'shadow_team', icon: 'Shield' },
  { key: 'fixtures', icon: 'Calendar' },
  { key: 'my_matches', icon: 'Calendar' },
  { key: 'contacts', icon: 'Contact' },
  { key: 'settings', icon: 'Settings' },
  { key: 'account', icon: 'User' },
  { key: 'organization', icon: 'Building' },
  { key: 'booking', icon: 'CalendarCheck' },
  { key: 'checkout', icon: 'CreditCard' },
  { key: 'admin', icon: 'Shield' },
] as const;
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
  allowed: number;
}

interface OrgMember {
  user_id: string;
  email: string;
  role: string;
}

interface AdminOrg {
  id: string;
  name: string;
  type: string;
  invite_code: string;
  logo_url: string | null;
  created_at: string;
  created_by_email: string | null;
  members: OrgMember[];
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

  // ── Orgs section state ──
  const [orgSearch, setOrgSearch] = useState('');
  const [expandedOrg, setExpandedOrg] = useState<string | null>(null);
  const [addingMemberOrg, setAddingMemberOrg] = useState<string | null>(null);
  const [addMemberEmail, setAddMemberEmail] = useState('');
  const [addMemberRole, setAddMemberRole] = useState('member');
  const [orgActionLoading, setOrgActionLoading] = useState<string | null>(null);

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

  // ── Orgs data ──
  const { data: orgs = [], isLoading: orgsLoading } = useQuery<AdminOrg[]>({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/organizations`, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // ── Derived data ──
  const permMap = useMemo(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const p of permissions) {
      if (!map[p.role]) map[p.role] = {};
      map[p.role][p.page_key] = !!p.allowed;
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
  const setUserRole = async (userId: string, role: string) => {
    setUpdatingUser(userId);
    try {
      const res = await fetch(`${API_BASE}/admin/roles/set`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('roles.role_updated'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
    } catch {
      toast.error(t('common.error'));
    } finally {
      setUpdatingUser(null);
    }
  };

  const togglePermission = async (role: string, pageKey: string, currentlyAllowed: boolean) => {
    const permId = `${role}-${pageKey}`;
    setUpdatingPerm(permId);
    try {
      const res = await fetch(`${API_BASE}/admin/page-permissions`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ role, page_key: pageKey, allowed: !currentlyAllowed }),
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
        await fetch(`${API_BASE}/admin/page-permissions`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ role: name, page_key: page.key, allowed: true }),
        });
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
      const usersWithRole = users.filter(u => u.roles.includes(role));
      for (const u of usersWithRole) {
        await fetch(`${API_BASE}/admin/roles/set`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ userId: u.id, role: 'user' }),
        });
      }
      for (const page of ALL_PAGES) {
        await fetch(`${API_BASE}/admin/page-permissions`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ role, page_key: page.key, allowed: false }),
        });
      }
      toast.success(t('roles.role_deleted'));
      setSelectedRole('user');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-page-permissions'] });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const isPageAllowed = (role: string, pageKey: string): boolean => {
    if (role === 'admin') return true;
    if (!permMap[role] || permMap[role][pageKey] === undefined) return pageKey !== 'admin';
    return permMap[role][pageKey];
  };

  // ── Orgs derived ──
  const filteredOrgs = useMemo(() => {
    if (!orgSearch.trim()) return orgs;
    const q = orgSearch.toLowerCase();
    return orgs.filter(o =>
      o.name.toLowerCase().includes(q) ||
      o.members.some(m => m.email.toLowerCase().includes(q))
    );
  }, [orgs, orgSearch]);

  // ── Orgs handlers ──
  const addMemberToOrg = async (orgId: string) => {
    const email = addMemberEmail.trim();
    if (!email) return;
    setOrgActionLoading(`add-${orgId}`);
    try {
      const target = users.find(u => u.email.toLowerCase() === email.toLowerCase());
      if (!target) {
        toast.error(t('admin.org_user_not_found'));
        return;
      }
      const res = await fetch(`${API_BASE}/admin/organizations/add-member`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ organizationId: orgId, userId: target.id, role: addMemberRole }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('admin.org_member_added'));
      setAddMemberEmail('');
      setAddMemberRole('member');
      setAddingMemberOrg(null);
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    } catch {
      toast.error(t('common.error'));
    } finally {
      setOrgActionLoading(null);
    }
  };

  const removeMemberFromOrg = async (orgId: string, userId: string) => {
    setOrgActionLoading(`rm-${orgId}-${userId}`);
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/remove-member`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ organizationId: orgId, userId }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('admin.org_member_removed'));
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    } catch {
      toast.error(t('common.error'));
    } finally {
      setOrgActionLoading(null);
    }
  };

  const updateMemberOrgRole = async (orgId: string, userId: string, role: string) => {
    setOrgActionLoading(`role-${orgId}-${userId}`);
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/update-member-role`, {
        method: 'POST',
        headers: await getAuthHeaders(),
        body: JSON.stringify({ organizationId: orgId, userId, role }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('admin.org_role_updated'));
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
    } catch {
      toast.error(t('common.error'));
    } finally {
      setOrgActionLoading(null);
    }
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
        <TabsList className="w-full grid grid-cols-3">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">{t('admin.tab_users')}</span>
          </TabsTrigger>
          <TabsTrigger value="roles" className="gap-2">
            <ShieldCheck className="w-4 h-4" />
            <span className="hidden sm:inline">{t('admin.tab_roles')}</span>
          </TabsTrigger>
          <TabsTrigger value="organizations" className="gap-2">
            <Building2 className="w-4 h-4" />
            <span className="hidden sm:inline">{t('admin.tab_orgs')}</span>
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

              {/* Permissions matrix */}
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
                        <TableHead className="w-[250px]">{t('roles.page')}</TableHead>
                        <TableHead className="w-[100px] text-center">{t('roles.access')}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ALL_PAGES.map(page => {
                        const allowed = isPageAllowed(selectedRole, page.key);
                        const isUpdating = updatingPerm === `${selectedRole}-${page.key}`;
                        const isAdminRole = selectedRole === 'admin';

                        return (
                          <TableRow key={page.key}>
                            <TableCell className="font-medium">
                              <div className="flex items-center gap-2">
                                <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                                {t(`roles.page_${page.key}`)}
                              </div>
                            </TableCell>
                            <TableCell className="text-center">
                              {isAdminRole ? (
                                <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                  <Check className="w-3 h-3 mr-1" />
                                  {t('roles.allowed')}
                                </Badge>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isUpdating}
                                  onClick={() => togglePermission(selectedRole, page.key, allowed)}
                                  className={allowed
                                    ? 'text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50'
                                    : 'text-red-500 hover:text-red-600 hover:bg-red-50'
                                  }
                                >
                                  {allowed ? (
                                    <><Check className="w-3.5 h-3.5 mr-1" /> {t('roles.allowed')}</>
                                  ) : (
                                    <><X className="w-3.5 h-3.5 mr-1" /> {t('roles.blocked')}</>
                                  )}
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
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
                          <TableHead>{t('roles.change_role')}</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredUsers.map(u => {
                          const userRole = u.roles.includes('admin') ? 'admin' : (u.roles[0] || 'user');
                          const isCurrentUser = u.id === currentUser?.id;
                          const isUpdating = updatingUser === u.id;

                          return (
                            <TableRow key={u.id}>
                              <TableCell className="font-medium">
                                <div className="flex items-center gap-2">
                                  <span className="truncate max-w-[250px]">{u.email}</span>
                                  {isCurrentUser && (
                                    <Badge variant="secondary" className="text-[10px]">{t('roles.you')}</Badge>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge
                                  variant={userRole === 'admin' ? 'default' : 'secondary'}
                                  className="capitalize"
                                >
                                  {userRole === 'admin' && <Shield className="w-3 h-3 mr-1" />}
                                  {userRole}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <select
                                  value={userRole}
                                  onChange={(e) => setUserRole(u.id, e.target.value)}
                                  disabled={isUpdating || isCurrentUser}
                                  className="h-8 px-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 capitalize"
                                >
                                  {allRoles.map(role => (
                                    <option key={role} value={role} className="capitalize">{role}</option>
                                  ))}
                                </select>
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-muted-foreground">{t('roles.cannot_change_self')}</span>
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
        {/* ── Tab: Organizations ── */}
        <TabsContent value="organizations" className="space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-none card-warm">
              <CardContent className="p-5 flex items-center gap-4">
                <Building2 className="w-8 h-8 text-primary" />
                <div>
                  <p className="text-2xl font-bold">{orgs.length}</p>
                  <p className="text-xs text-muted-foreground">{t('admin.org_total')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none card-warm">
              <CardContent className="p-5 flex items-center gap-4">
                <Users className="w-8 h-8 text-amber-500" />
                <div>
                  <p className="text-2xl font-bold">{orgs.reduce((s, o) => s + o.members.length, 0)}</p>
                  <p className="text-xs text-muted-foreground">{t('admin.org_total_members')}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="border-none card-warm">
              <CardContent className="p-5 flex items-center gap-4">
                <Users className="w-8 h-8 text-muted-foreground" />
                <div>
                  <p className="text-2xl font-bold">{users.filter(u => orgs.some(o => o.members.some(m => m.user_id === u.id))).length}</p>
                  <p className="text-xs text-muted-foreground">{t('admin.org_users_in_orgs')}</p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={orgSearch}
              onChange={(e) => setOrgSearch(e.target.value)}
              placeholder={t('admin.org_search')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {/* Org list */}
          {orgsLoading ? (
            <p className="p-6 text-center text-muted-foreground">{t('common.loading')}</p>
          ) : filteredOrgs.length === 0 ? (
            <p className="p-6 text-center text-muted-foreground">{t('admin.org_none')}</p>
          ) : (
            <div className="space-y-3">
              {filteredOrgs.map(org => (
                <Card key={org.id} className="border-none card-warm overflow-hidden">
                  <CardHeader
                    className="pb-2 cursor-pointer"
                    onClick={() => setExpandedOrg(expandedOrg === org.id ? null : org.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        {org.logo_url ? (
                          <img src={org.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                        ) : (
                          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                            <Building2 className="w-4 h-4 text-primary" />
                          </div>
                        )}
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {org.name}
                            <Badge variant="secondary" className="text-[10px] capitalize">{org.type}</Badge>
                          </CardTitle>
                          <CardDescription className="text-xs">
                            {t('admin.org_created_by', { email: org.created_by_email || '—' })} · {org.members.length} {t('admin.org_members_count')}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs font-mono">{org.invite_code}</Badge>
                    </div>
                  </CardHeader>

                  {expandedOrg === org.id && (
                    <CardContent className="pt-0">
                      {/* Members table */}
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>{t('admin.email')}</TableHead>
                            <TableHead>{t('admin.org_member_role')}</TableHead>
                            <TableHead className="text-right">{t('admin.actions')}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {org.members.map(m => (
                            <TableRow key={m.user_id}>
                              <TableCell className="font-medium">{m.email}</TableCell>
                              <TableCell>
                                <select
                                  value={m.role}
                                  onChange={(e) => updateMemberOrgRole(org.id, m.user_id, e.target.value)}
                                  disabled={orgActionLoading === `role-${org.id}-${m.user_id}`}
                                  className="h-8 px-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 capitalize"
                                >
                                  <option value="owner">{t('admin.org_role_owner')}</option>
                                  <option value="admin">{t('admin.org_role_admin')}</option>
                                  <option value="member">{t('admin.org_role_member')}</option>
                                </select>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="rounded-lg h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => removeMemberFromOrg(org.id, m.user_id)}
                                  disabled={orgActionLoading === `rm-${org.id}-${m.user_id}`}
                                  title={t('admin.org_remove_member')}
                                >
                                  <UserMinus className="w-3.5 h-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                          {org.members.length === 0 && (
                            <TableRow>
                              <TableCell colSpan={3} className="text-center text-muted-foreground text-sm py-4">
                                {t('admin.org_no_members')}
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>

                      {/* Add member */}
                      {addingMemberOrg === org.id ? (
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                          <input
                            type="email"
                            value={addMemberEmail}
                            onChange={(e) => setAddMemberEmail(e.target.value)}
                            placeholder={t('admin.org_add_email_placeholder')}
                            className="h-8 px-3 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring flex-1 min-w-[200px]"
                            onKeyDown={(e) => e.key === 'Enter' && addMemberToOrg(org.id)}
                            autoFocus
                          />
                          <select
                            value={addMemberRole}
                            onChange={(e) => setAddMemberRole(e.target.value)}
                            className="h-8 px-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring capitalize"
                          >
                            <option value="member">{t('admin.org_role_member')}</option>
                            <option value="admin">{t('admin.org_role_admin')}</option>
                            <option value="owner">{t('admin.org_role_owner')}</option>
                          </select>
                          <Button
                            size="sm"
                            onClick={() => addMemberToOrg(org.id)}
                            disabled={!addMemberEmail.trim() || orgActionLoading === `add-${org.id}`}
                          >
                            <Check className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => { setAddingMemberOrg(null); setAddMemberEmail(''); setAddMemberRole('member'); }}
                          >
                            <X className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-3 gap-1.5"
                          onClick={() => setAddingMemberOrg(org.id)}
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {t('admin.org_add_member')}
                        </Button>
                      )}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
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
