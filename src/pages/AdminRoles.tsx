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
import { Shield, Users, Lock, Check, X, Search, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
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

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
}

interface PagePermission {
  role: string;
  page_key: string;
  allowed: number;
}

async function getAuthHeaders() {
  const session = (await supabase.auth.getSession()).data.session;
  return {
    Authorization: `Bearer ${session?.access_token}`,
    'Content-Type': 'application/json',
  };
}

export default function AdminRoles() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [selectedRole, setSelectedRole] = useState('user');
  const [searchTerm, setSearchTerm] = useState('');
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [updatingPerm, setUpdatingPerm] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [showNewRole, setShowNewRole] = useState(false);

  // Fetch all users
  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/users`, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // Fetch all roles
  const { data: roles = [] } = useQuery<string[]>({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/roles`, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // Fetch page permissions
  const { data: permissions = [] } = useQuery<PagePermission[]>({
    queryKey: ['admin-page-permissions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/page-permissions`, { headers: await getAuthHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // Build permissions map: { role: { page_key: boolean } }
  const permMap = useMemo(() => {
    const map: Record<string, Record<string, boolean>> = {};
    for (const p of permissions) {
      if (!map[p.role]) map[p.role] = {};
      map[p.role][p.page_key] = !!p.allowed;
    }
    return map;
  }, [permissions]);

  // All roles including custom ones
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

    // Create the role by setting all pages to allowed by default
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
      // Move all users with this role back to 'user'
      const usersWithRole = users.filter(u => u.roles.includes(role));
      for (const u of usersWithRole) {
        await fetch(`${API_BASE}/admin/roles/set`, {
          method: 'POST',
          headers: await getAuthHeaders(),
          body: JSON.stringify({ userId: u.id, role: 'user' }),
        });
      }
      // Remove all permissions for this role
      // We'll set all to false to effectively delete
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
    // Admin always has access to everything
    if (role === 'admin') return true;
    // If no permission configured, default to allowed (except admin page)
    if (!permMap[role] || permMap[role][pageKey] === undefined) {
      return pageKey !== 'admin';
    }
    return permMap[role][pageKey];
  };

  if (adminLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );

  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
          <Shield className="w-5 h-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{t('roles.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('roles.subtitle')}</p>
        </div>
      </div>

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

      <Tabs defaultValue="permissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="permissions">{t('roles.tab_permissions')}</TabsTrigger>
          <TabsTrigger value="users">{t('roles.tab_users')}</TabsTrigger>
        </TabsList>

        {/* Tab: Page Permissions */}
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

        {/* Tab: User Roles */}
        <TabsContent value="users" className="space-y-4">
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
    </div>
  );
}
