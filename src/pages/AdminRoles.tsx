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
import { Shield, Users, Lock, Check, X, Search, Plus, Trash2, ChevronDown, ChevronRight, Palette, Crown, User, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

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
  data_import:    ['view', 'import'],
};

const ALL_PAGES = Object.keys(PAGE_ACTIONS) as (keyof typeof PAGE_ACTIONS)[];

interface AdminUser {
  id: string;
  email: string;
  roles: string[];
}

interface PagePermission {
  role: string;
  page_key: string;
  action: string;
  allowed: number;
}

const DEFAULT_ROLE_COLOR = '#6366f1';

function getRoleColor(role: string, roleColors: Record<string, string>) {
  return roleColors[role] || DEFAULT_ROLE_COLOR;
}

function getRoleIcon(role: string) {
  const normalized = role.toLowerCase();
  if (normalized === 'admin') return ShieldAlert;
  if (normalized === 'moderateur' || normalized === 'moderator') return Crown;
  if (normalized === 'user') return User;
  if (normalized.includes('manager') || normalized.includes('lead')) return Crown;
  if (normalized.includes('recruit') || normalized.includes('scout') || normalized.includes('analyst')) return Shield;
  return Users;
}

function authFetchInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
}

export default function AdminRoles() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [selectedRole, setSelectedRole] = useState('user');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [updatingPerm, setUpdatingPerm] = useState<string | null>(null);
  const [updatingUser, setUpdatingUser] = useState<string | null>(null);
  const [newRoleName, setNewRoleName] = useState('');
  const [showNewRole, setShowNewRole] = useState(false);
  const [addRoleForUser, setAddRoleForUser] = useState<string | null>(null);
  const [addRoleValue, setAddRoleValue] = useState('');

  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/users`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  const { data: roles = [] } = useQuery<string[]>({
    queryKey: ['admin-roles'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/roles`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  const { data: permissions = [] } = useQuery<PagePermission[]>({
    queryKey: ['admin-page-permissions'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/page-permissions`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  const { data: roleColors = {} } = useQuery<Record<string, string>>({
    queryKey: ['admin-role-metadata'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/role-metadata`, { ...authFetchInit() });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // Build permissions map: { role: { page_key: { action: boolean } } }
  const permMap = useMemo(() => {
    const map: Record<string, Record<string, Record<string, boolean>>> = {};
    for (const p of permissions) {
      if (!map[p.role]) map[p.role] = {};
      if (!map[p.role][p.page_key]) map[p.role][p.page_key] = {};
      map[p.role][p.page_key][p.action] = !!p.allowed;
    }
    return map;
  }, [permissions]);

  const allRoles = useMemo(() => {
    const set = new Set(['admin', 'user', ...roles]);
    return Array.from(set).sort((a, b) => {
      if (a === 'admin') return -1; if (b === 'admin') return 1;
      if (a === 'user') return -1; if (b === 'user') return 1;
      return a.localeCompare(b);
    });
  }, [roles]);

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    return users.filter(u => u.email.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [users, searchTerm]);

  const isActionAllowed = (role: string, pageKey: string, action: string): boolean => {
    if (role === 'admin') return true;
    const val = permMap[role]?.[pageKey]?.[action];
    if (val === undefined) return action === 'view' ? pageKey !== 'admin' : pageKey !== 'admin';
    return val;
  };

  const togglePermission = async (role: string, pageKey: string, action: string, current: boolean) => {
    const key = `${role}-${pageKey}-${action}`;
    setUpdatingPerm(key);
    try {
      const res = await fetch(`${API_BASE}/admin/page-permissions`, {
        method: 'POST',
        ...authFetchInit(),
        body: JSON.stringify({ role, page_key: pageKey, action, allowed: !current }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ['admin-page-permissions'] });
    } catch { toast.error(t('common.error')); }
    finally { setUpdatingPerm(null); }
  };

  const updateRoleColor = async (role: string, color: string) => {
    try {
      const res = await fetch(`${API_BASE}/admin/role-metadata`, {
        method: 'POST',
        ...authFetchInit(),
        body: JSON.stringify({ role, color }),
      });
      if (!res.ok) throw new Error();
      queryClient.invalidateQueries({ queryKey: ['admin-role-metadata'] });
    } catch {
      toast.error(t('common.error'));
    }
  };

  const createRole = async () => {
    const name = newRoleName.trim().toLowerCase().replace(/\s+/g, '_');
    if (!name || name === 'admin' || name === 'user') return;
    try {
      for (const page of ALL_PAGES) {
        for (const action of PAGE_ACTIONS[page]) {
          // Admin sub-actions default to blocked for new roles
          const allowed = page === 'admin' && action !== 'view' ? false : true;
          await fetch(`${API_BASE}/admin/page-permissions`, {
            method: 'POST',
            ...authFetchInit(),
            body: JSON.stringify({ role: name, page_key: page, action, allowed }),
          });
        }
      }
      toast.success(t('roles.role_created'));
      setNewRoleName(''); setShowNewRole(false); setSelectedRole(name);
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-page-permissions'] });
    } catch { toast.error(t('common.error')); }
  };

  const deleteRole = async (role: string) => {
    if (role === 'admin' || role === 'user') return;
    try {
      const res = await fetch(`${API_BASE}/admin/roles/delete`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('roles.role_deleted'));
      setSelectedRole('user');
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
      queryClient.invalidateQueries({ queryKey: ['admin-roles'] });
      queryClient.invalidateQueries({ queryKey: ['admin-page-permissions'] });
    } catch { toast.error(t('common.error')); }
  };

  const addRoleToUser = async (userId: string, role: string) => {
    setUpdatingUser(userId);
    try {
      const res = await fetch(`${API_BASE}/admin/roles/add`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ userId, role }),
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
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ userId, role }),
      });
      if (!res.ok) throw new Error();
      toast.success(t('roles.role_updated'));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch { toast.error(t('common.error')); }
    finally { setUpdatingUser(null); }
  };

  if (adminLoading) return (
    <div className="flex items-center justify-center min-h-[40vh]">
      <p className="text-muted-foreground">{t('common.loading')}</p>
    </div>
  );
  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6">
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
            <div><p className="text-2xl font-bold">{users.length}</p><p className="text-xs text-muted-foreground">{t('roles.total_users')}</p></div>
          </CardContent>
        </Card>
        <Card className="border-none card-warm">
          <CardContent className="p-5 flex items-center gap-4">
            <Shield className="w-8 h-8 text-amber-500" />
            <div><p className="text-2xl font-bold">{allRoles.length}</p><p className="text-xs text-muted-foreground">{t('roles.total_roles')}</p></div>
          </CardContent>
        </Card>
        <Card className="border-none card-warm">
          <CardContent className="p-5 flex items-center gap-4">
            <Lock className="w-8 h-8 text-muted-foreground" />
            <div><p className="text-2xl font-bold">{ALL_PAGES.length}</p><p className="text-xs text-muted-foreground">{t('roles.total_pages')}</p></div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="permissions" className="space-y-4">
        <TabsList>
          <TabsTrigger value="permissions">{t('roles.tab_permissions')}</TabsTrigger>
          <TabsTrigger value="users">{t('roles.tab_users')}</TabsTrigger>
        </TabsList>

        {/* ── Tab: Permissions ── */}
        <TabsContent value="permissions" className="space-y-4">
          {/* Role selector */}
          <div className="flex flex-wrap items-center gap-2">
            {allRoles.map(role => {
              const color = getRoleColor(role, roleColors);
              const Icon = getRoleIcon(role);
              const isSelected = selectedRole === role;
              return (
                <Button
                  key={role}
                  variant={isSelected ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setSelectedRole(role)}
                  className="capitalize gap-2 border-transparent"
                  style={isSelected ? { backgroundColor: color, color: '#fff' } : { borderColor: `${color}33`, color }}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {role}
                </Button>
              );
            })}
            {showNewRole ? (
              <div className="flex items-center gap-1.5">
                <input type="text" value={newRoleName} onChange={e => setNewRoleName(e.target.value)}
                  placeholder={t('roles.new_role_placeholder')}
                  className="h-8 px-2 text-sm rounded-lg border border-input bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  onKeyDown={e => e.key === 'Enter' && createRole()} autoFocus />
                <Button size="sm" onClick={createRole} disabled={!newRoleName.trim()}><Check className="w-3.5 h-3.5" /></Button>
                <Button size="sm" variant="ghost" onClick={() => { setShowNewRole(false); setNewRoleName(''); }}><X className="w-3.5 h-3.5" /></Button>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setShowNewRole(true)}>
                <Plus className="w-3.5 h-3.5 mr-1" />{t('roles.add_role')}
              </Button>
            )}
          </div>

          {/* Permissions matrix with sub-actions */}
          <Card className="border-none card-warm overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base capitalize flex items-center gap-2">
                    {(() => {
                      const Icon = getRoleIcon(selectedRole);
                      return (
                        <>
                          <span
                            className="inline-flex h-8 w-8 items-center justify-center rounded-xl"
                            style={{ backgroundColor: `${getRoleColor(selectedRole, roleColors)}22`, color: getRoleColor(selectedRole, roleColors) }}
                          >
                            <Icon className="w-4 h-4" />
                          </span>
                          {selectedRole}
                        </>
                      );
                    })()}
                    {selectedRole === 'admin' && <Badge variant="outline" className="text-[10px]">{t('roles.full_access')}</Badge>}
                  </CardTitle>
                  <CardDescription>
                    {selectedRole === 'admin' ? t('roles.admin_desc') : t('roles.perm_desc')}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <label
                    className="flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-xs text-muted-foreground"
                    title={t('roles.change_color')}
                  >
                    <Palette className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">{t('roles.change_color')}</span>
                    <input
                      type="color"
                      value={getRoleColor(selectedRole, roleColors)}
                      onChange={(e) => updateRoleColor(selectedRole, e.target.value)}
                      className="h-7 w-9 cursor-pointer rounded border-0 bg-transparent p-0"
                      aria-label={t('roles.change_color')}
                    />
                  </label>
                  {selectedRole !== 'admin' && selectedRole !== 'user' && (
                    <Button variant="ghost" size="sm"
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => deleteRole(selectedRole)}>
                      <Trash2 className="w-3.5 h-3.5 mr-1" />{t('roles.delete_role')}
                    </Button>
                  )}
                </div>
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
                                  {t(`roles.action_${action}`, action.replace(/_/g, ' '))}
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

        {/* ── Tab: Users ── */}
        <TabsContent value="users" className="space-y-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              placeholder={t('roles.search_users')}
              className="w-full pl-9 pr-3 py-2 rounded-lg border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" />
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
                                <Badge
                                  key={role}
                                  variant="secondary"
                                  className="capitalize flex items-center gap-1 pr-1 border-transparent"
                                  style={{
                                    backgroundColor: `${getRoleColor(role, roleColors)}18`,
                                    color: getRoleColor(role, roleColors),
                                  }}
                                >
                                  {(() => {
                                    const Icon = getRoleIcon(role);
                                    return <Icon className="w-2.5 h-2.5" />;
                                  })()}
                                  {role}
                                  {!isCurrentUser && !(isCurrentUser && role === 'admin') && (
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
    </div>
  );
}
