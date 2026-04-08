import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Bell, ArrowLeft, Search, Trash2, Loader2, Database } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useIsAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

async function authHeaders() {
  const s = (await supabase.auth.getSession()).data.session;
  return { Authorization: `Bearer ${s?.access_token}`, 'Content-Type': 'application/json' };
}

interface AdminNotification {
  id: string;
  user_id: string;
  user_email: string | null;
  type: string;
  title: string;
  message: string | null;
  is_read: number | boolean;
  created_at: string;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function AdminNotifications() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const [search, setSearch] = useState('');
  const [purgeDays, setPurgeDays] = useState('30');
  const [pendingDelete, setPendingDelete] = useState<AdminNotification | null>(null);
  const [purging, setPurging] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const { data: notifications = [], isLoading } = useQuery<AdminNotification[]>({
    queryKey: ['admin-notifications', search],
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      qs.set('limit', '500');
      const res = await fetch(`${API}/admin/notifications?${qs.toString()}`, { headers: await authHeaders() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications]
  );

  const deleteOne = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      const res = await fetch(`${API}/admin/notifications/${pendingDelete.id}`, {
        method: 'DELETE',
        headers: await authHeaders(),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(t('admin_notifications.deleted'));
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
      setPendingDelete(null);
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    } finally {
      setDeletingId(null);
    }
  };

  const purgeOlderThan = async () => {
    const days = Number.parseInt(purgeDays, 10);
    if (!Number.isFinite(days) || days < 1) {
      toast.error(t('admin_notifications.days_invalid'));
      return;
    }
    setPurging(true);
    try {
      const res = await fetch(`${API}/admin/notifications/purge-older-than`, {
        method: 'POST',
        headers: await authHeaders(),
        body: JSON.stringify({ days }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(t('admin_notifications.purged', { count: data.deleted, days }));
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    } catch (err: any) {
      toast.error(err?.message || t('common.error'));
    } finally {
      setPurging(false);
    }
  };

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Bell className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('admin_notifications.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('admin_notifications.subtitle')}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-none card-warm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">{t('admin_notifications.total')}</p>
            <p className="text-2xl font-bold mt-1">{notifications.length}</p>
          </CardContent>
        </Card>
        <Card className="border-none card-warm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">{t('admin_notifications.unread')}</p>
            <p className="text-2xl font-bold mt-1">{unreadCount}</p>
          </CardContent>
        </Card>
        <Card className="border-none card-warm">
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground">{t('admin_notifications.database')}</p>
            <p className="text-sm font-medium mt-2 flex items-center gap-2">
              <Database className="w-4 h-4 text-primary" />
              `notifications`
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin_notifications.manage_title')}</CardTitle>
          <CardDescription>{t('admin_notifications.manage_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="w-full max-w-md">
            <label className="text-sm font-medium text-muted-foreground">{t('admin_notifications.search')}</label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('admin_notifications.search_placeholder')}
                className="pl-9"
              />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('admin_notifications.purge_label')}</label>
              <Input
                type="number"
                min="1"
                value={purgeDays}
                onChange={(e) => setPurgeDays(e.target.value)}
                className="mt-1 w-32"
              />
            </div>
            <Button variant="destructive" onClick={purgeOlderThan} disabled={purging}>
              {purging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {t('admin_notifications.purge_btn')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('admin_notifications.list_title')}</CardTitle>
          <CardDescription>{t('admin_notifications.list_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('admin_notifications.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('admin_notifications.col_user')}</TableHead>
                  <TableHead>{t('admin_notifications.col_type')}</TableHead>
                  <TableHead>{t('admin_notifications.col_title')}</TableHead>
                  <TableHead>{t('admin_notifications.col_status')}</TableHead>
                  <TableHead>{t('admin_notifications.col_date')}</TableHead>
                  <TableHead className="text-right">{t('admin_notifications.col_actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-medium">{n.user_email || n.user_id}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{n.type}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <p className="font-medium">{n.title}</p>
                        {n.message && <p className="text-xs text-muted-foreground line-clamp-2">{n.message}</p>}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={n.is_read ? 'outline' : 'default'}>
                        {n.is_read ? t('admin_notifications.read') : t('admin_notifications.unread_badge')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(n.created_at)}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setPendingDelete(n)}
                        title={t('admin_notifications.delete_one')}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={(open) => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin_notifications.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin_notifications.delete_desc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={deleteOne}
              disabled={deletingId === pendingDelete?.id}
            >
              {t('admin_notifications.delete_confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
