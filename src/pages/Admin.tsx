import { useState, useMemo, Fragment } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Shield, Crown, Users, Mail, UserCheck, BarChart3, Lock, Check, X, Search, Plus, Trash2, ShieldCheck, ChevronDown, ChevronRight, Building2, UserPlus, UserMinus, Palette, User, ShieldAlert, Bell, Zap, Clock } from 'lucide-react';
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
  data_import:    ['view', 'import'],
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

function authFetchInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
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
  const [deletingOrg, setDeletingOrg] = useState<AdminOrg | null>(null);
  const [deleteOrgReason, setDeleteOrgReason] = useState('');
  const [expandedPages, setExpandedPages] = useState<Set<string>>(new Set());
  const [addRoleForUser, setAddRoleForUser] = useState<string | null>(null);
  const [addRoleValue, setAddRoleValue] = useState('');

  // ── Shared data: users ──
  const { data: users = [], isLoading: usersLoading } = useQuery<AdminUser[]>({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/users`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  // ── Roles data ──
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

  // ── Orgs data ──
  const { data: orgs = [], isLoading: orgsLoading } = useQuery<AdminOrg[]>({
    queryKey: ['admin-organizations'],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/admin/organizations`, { ...authFetchInit() });
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
    const set = new Set(['admin', 'moderateur', 'user', ...roles]);
    const order = ['admin', 'moderateur', 'user'];
    return Array.from(set).sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
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
        ...authFetchInit(),
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
        ...authFetchInit(),
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
      const response = await fetch(`${API_BASE}/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast.success(t('admin.delete_user_success', { email: deletingUser.email }));
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const msg = errMsg.includes('administrateur')
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
      const response = await fetch(`${API_BASE}/admin/impersonate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
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

  const togglePermission = async (role: string, pageKey: string, action: string, currentlyAllowed: boolean) => {
    const permId = `${role}-${pageKey}-${action}`;
    setUpdatingPerm(permId);
    try {
      const res = await fetch(`${API_BASE}/admin/page-permissions`, {
        method: 'POST',
        ...authFetchInit(),
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

  const PROTECTED_ROLES = ['admin', 'user', 'moderateur'];

  const createRole = async () => {
    const name = newRoleName.trim();
    if (!name || PROTECTED_ROLES.includes(name.toLowerCase())) return;
    try {
      for (const page of ALL_PAGES) {
        for (const action of PAGE_ACTIONS[page]) {
          const allowed = page === 'admin' && action !== 'view' ? false : true;
          await fetch(`${API_BASE}/admin/page-permissions`, {
            method: 'POST',
            ...authFetchInit(),
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
    if (PROTECTED_ROLES.includes(role)) return;
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
    } catch {
      toast.error(t('common.error'));
    }
  };

  const isActionAllowed = (role: string, pageKey: string, action: string): boolean => {
    if (role === 'admin') return true;
    const val = permMap[role]?.[pageKey]?.[action];
    if (val === undefined) return pageKey !== 'admin';
    return val;
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
        ...authFetchInit(),
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
        ...authFetchInit(),
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
        ...authFetchInit(),
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

  const deleteOrganization = async () => {
    if (!deletingOrg || !deleteOrgReason.trim()) return;
    setOrgActionLoading(`delete-${deletingOrg.id}`);
    try {
      const res = await fetch(`${API_BASE}/admin/organizations/${deletingOrg.id}`, {
        method: 'DELETE',
        ...authFetchInit(),
        body: JSON.stringify({ message: deleteOrgReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed');
      }
      toast.success(t('admin.org_deleted', { name: deletingOrg.name }));
      queryClient.invalidateQueries({ queryKey: ['admin-organizations'] });
      setDeletingOrg(null);
      setDeleteOrgReason('');
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-extrabold tracking-tight">{t('admin.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('admin.subtitle')}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/roles">
            <Button variant="outline" className="rounded-xl gap-2">
              <ShieldCheck className="w-4 h-4" />
              {t('admin.tab_roles')}
            </Button>
          </Link>
          <Link to="/admin/settings">
            <Button variant="outline" className="rounded-xl gap-2">
              <Shield className="w-4 h-4" />
              {t('admin.settings')}
            </Button>
          </Link>
          <Link to="/admin/analytics">
            <Button variant="outline" className="rounded-xl gap-2">
              <BarChart3 className="w-4 h-4" />
              {t('admin.analytics')}
            </Button>
          </Link>
          <Link to="/admin/notifications">
            <Button variant="outline" className="rounded-xl gap-2">
              <Bell className="w-4 h-4" />
              {t('admin.notifications')}
            </Button>
          </Link>
          <Link to="/admin/credits">
            <Button variant="outline" className="rounded-xl gap-2">
              <Zap className="w-4 h-4 text-yellow-500" />
              {t('admin.credits')}
            </Button>
          </Link>
          <Link to="/admin/crons">
            <Button variant="outline" className="rounded-xl gap-2">
              <Clock className="w-4 h-4 text-primary" />
              {t('admin.crons')}
            </Button>
          </Link>
        </div>
      </div>

      {/* Section selector */}
      <Tabs defaultValue="users" className="w-full space-y-6">
        <TabsList className="w-full grid grid-cols-2">
          <TabsTrigger value="users" className="gap-2">
            <Users className="w-4 h-4" />
            <span className="hidden sm:inline">{t('admin.tab_users')}</span>
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
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs font-mono">{org.invite_code}</Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingOrg(org);
                            setDeleteOrgReason('');
                          }}
                          title={t('admin.org_delete')}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
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
      <AlertDialog
        open={!!deletingOrg}
        onOpenChange={open => {
          if (!open) {
            setDeletingOrg(null);
            setDeleteOrgReason('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin.org_delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin.org_delete_desc', { name: deletingOrg?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-destructive/80 bg-destructive/5 rounded-lg p-3">
              {t('admin.org_delete_warning')}
            </p>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('admin.org_delete_reason_label')}</label>
              <Textarea
                className="mt-1"
                value={deleteOrgReason}
                onChange={(e) => setDeleteOrgReason(e.target.value)}
                placeholder={t('admin.org_delete_reason_placeholder')}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">{t('admin.org_delete_reason_help')}</p>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!deleteOrgReason.trim() || orgActionLoading === `delete-${deletingOrg?.id}`}
              onClick={(e) => {
                e.preventDefault();
                void deleteOrganization();
              }}
            >
              {t('admin.org_delete_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
