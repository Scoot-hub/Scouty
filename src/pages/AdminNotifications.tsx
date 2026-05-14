import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  Bell, ArrowLeft, Search, Trash2, Loader2,
  Crown, Users, Zap, Trophy, Sparkles, TrendingUp,
  FileSearch, Calendar, CheckCircle2, AtSign, MessageCircle,
  Building2, Shield, Settings, Award,
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsAdmin } from '@/hooks/use-admin';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

function authFetchInit(): RequestInit {
  return { credentials: 'include', headers: { 'Content-Type': 'application/json' } };
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

interface NotifTypeDef {
  type: string;
  label: string;
  iconBg: string;
  iconColor: string;
  badgeColor: string;
  Icon: React.ElementType;
  desc: string;
}

const NOTIFICATION_TYPES: NotifTypeDef[] = [
  { type: 'subscription',         label: 'Abonnement',           Icon: Crown,          iconBg: 'bg-violet-500/15', iconColor: 'text-violet-500', badgeColor: 'bg-violet-500/10 text-violet-700 dark:text-violet-300', desc: 'Activée quand l\'abonnement Scout+ ou Pro est activé via Stripe ou attribué manuellement par un admin.' },
  { type: 'affiliate_new',        label: 'Nouveau filleul',      Icon: Users,          iconBg: 'bg-emerald-500/15', iconColor: 'text-emerald-500', badgeColor: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300', desc: 'Envoyée au parrain quand un utilisateur s\'inscrit avec son code (inscription ou page Compte).' },
  { type: 'affiliate_credits',    label: 'Crédits parrainage',   Icon: Zap,            iconBg: 'bg-yellow-500/15', iconColor: 'text-yellow-500', badgeColor: 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-300', desc: 'Confirme l\'attribution de +100 crédits au parrain suite à l\'enregistrement d\'un filleul.' },
  { type: 'affiliate_tier',       label: 'Montée de tier',       Icon: Trophy,         iconBg: 'bg-amber-500/15', iconColor: 'text-amber-500', badgeColor: 'bg-amber-500/10 text-amber-700 dark:text-amber-300', desc: 'Envoyée au parrain à chaque palier : Ambassadeur ⭐ (1), Partenaire 🤝 (11), Elite 👑 (50).' },
  { type: 'enrichment',           label: 'Enrichissement',       Icon: Sparkles,       iconBg: 'bg-sky-500/15', iconColor: 'text-sky-500', badgeColor: 'bg-sky-500/10 text-sky-700 dark:text-sky-300', desc: 'Envoyée quand l\'enrichissement automatique d\'un profil joueur (TM, Wikidata, TSDB, API-Football) se termine.' },
  { type: 'form_alert',           label: 'Alerte forme',         Icon: TrendingUp,     iconBg: 'bg-orange-500/15', iconColor: 'text-orange-500', badgeColor: 'bg-orange-500/10 text-orange-700 dark:text-orange-300', desc: 'Envoyée chaque mercredi aux scouts qui suivent des joueurs détectés en bonne forme (données StatsBomb).' },
  { type: 'report_reminder',      label: 'Rappel rapport',       Icon: FileSearch,     iconBg: 'bg-rose-500/15', iconColor: 'text-rose-500', badgeColor: 'bg-rose-500/10 text-rose-700 dark:text-rose-300', desc: 'Rappel hebdomadaire aux scouts ayant des rapports à compléter sur des joueurs observés.' },
  { type: 'match_assignment',     label: 'Affectation match',    Icon: Calendar,       iconBg: 'bg-blue-500/15', iconColor: 'text-blue-500', badgeColor: 'bg-blue-500/10 text-blue-700 dark:text-blue-300', desc: 'Envoyée au scout quand un responsable lui assigne un match à observer, ou lors d\'une réassignation.' },
  { type: 'assignment_confirmed', label: 'Confirm. affectation', Icon: CheckCircle2,   iconBg: 'bg-teal-500/15', iconColor: 'text-teal-500', badgeColor: 'bg-teal-500/10 text-teal-700 dark:text-teal-300', desc: 'Envoyée au responsable quand le scout confirme sa présence au match assigné (+5 crédits au scout).' },
  { type: 'mention',              label: 'Mention',              Icon: AtSign,         iconBg: 'bg-pink-500/15', iconColor: 'text-pink-500', badgeColor: 'bg-pink-500/10 text-pink-700 dark:text-pink-300', desc: 'Envoyée quand un utilisateur est @mentionné dans un post ou une réponse de la communauté.' },
  { type: 'community',            label: 'Communauté',           Icon: MessageCircle,  iconBg: 'bg-indigo-500/15', iconColor: 'text-indigo-500', badgeColor: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300', desc: 'Nouvelle réponse dans une discussion suivie, ou question clôturée par un modérateur.' },
  { type: 'organization',         label: 'Organisation',         Icon: Building2,      iconBg: 'bg-cyan-500/15', iconColor: 'text-cyan-500', badgeColor: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300', desc: 'Nouveau membre dans l\'organisation, ou notification de suppression envoyée à tous les membres.' },
  { type: 'squad',                label: 'Effectif',             Icon: Shield,         iconBg: 'bg-lime-500/15', iconColor: 'text-lime-600', badgeColor: 'bg-lime-500/10 text-lime-700 dark:text-lime-300', desc: 'Envoyée aux membres d\'une organisation quand un joueur est ajouté à l\'effectif partagé.' },
  { type: 'system',               label: 'Système',              Icon: Settings,       iconBg: 'bg-slate-500/15', iconColor: 'text-slate-500', badgeColor: 'bg-slate-500/10 text-slate-700 dark:text-slate-300', desc: 'Ticket résolu, réponse admin à un ticket de support, récapitulatif envoyé par email.' },
];

const TYPE_MAP = Object.fromEntries(NOTIFICATION_TYPES.map(t => [t.type, t]));

function NotifTypeCell({ type }: { type: string }) {
  const def = TYPE_MAP[type];
  if (!def) {
    return (
      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-muted text-muted-foreground">
        <Bell className="w-3 h-3" />
        {type}
      </span>
    );
  }
  const { Icon, iconBg, iconColor, badgeColor, label } = def;
  return (
    <span className={cn('inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium', badgeColor)}>
      <span className={cn('w-4 h-4 rounded-full flex items-center justify-center shrink-0', iconBg)}>
        <Icon className={cn('w-2.5 h-2.5', iconColor)} />
      </span>
      {label}
    </span>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
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
      const res = await fetch(`${API}/admin/notifications?${qs.toString()}`, { ...authFetchInit() });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isAdmin === true,
  });

  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);
  const countByType = useMemo(() => {
    const map: Record<string, number> = {};
    for (const n of notifications) map[n.type] = (map[n.type] || 0) + 1;
    return map;
  }, [notifications]);

  const deleteOne = async () => {
    if (!pendingDelete) return;
    setDeletingId(pendingDelete.id);
    try {
      const res = await fetch(`${API}/admin/notifications/${pendingDelete.id}`, { method: 'DELETE', ...authFetchInit() });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(t('admin_notifications.deleted'));
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
      setPendingDelete(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setDeletingId(null);
    }
  };

  const purgeOlderThan = async () => {
    const days = Number.parseInt(purgeDays, 10);
    if (!Number.isFinite(days) || days < 1) { toast.error(t('admin_notifications.days_invalid')); return; }
    setPurging(true);
    try {
      const res = await fetch(`${API}/admin/notifications/purge-older-than`, {
        method: 'POST', ...authFetchInit(), body: JSON.stringify({ days }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Failed');
      toast.success(t('admin_notifications.purged', { count: data.deleted, days }));
      qc.invalidateQueries({ queryKey: ['admin-notifications'] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setPurging(false);
    }
  };

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
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

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="border-none card-warm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
              <Bell className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('admin_notifications.total')}</p>
              <p className="text-2xl font-bold tabular-nums">{notifications.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="border-none card-warm">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
              <Award className="w-5 h-5 text-orange-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">{t('admin_notifications.unread')}</p>
              <p className="text-2xl font-bold tabular-nums">{unreadCount}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Types reference */}
      <Card className="border-none card-warm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">{t('admin_notifications.types_title')}</CardTitle>
          <CardDescription>{t('admin_notifications.types_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <TooltipProvider delayDuration={150}>
            <div className="flex flex-wrap gap-2">
              {NOTIFICATION_TYPES.map(({ type, label, Icon, iconBg, iconColor, badgeColor, desc }) => (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <span className={cn('inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium cursor-default select-none', badgeColor)}>
                      <span className={cn('w-4 h-4 rounded-full flex items-center justify-center shrink-0', iconBg)}>
                        <Icon className={cn('w-2.5 h-2.5', iconColor)} />
                      </span>
                      {label}
                      {countByType[type] != null && (
                        <span className="opacity-50 font-mono ml-0.5">{countByType[type]}</span>
                      )}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                    <p className="font-mono text-[10px] opacity-50 mb-0.5">{type}</p>
                    {desc}
                  </TooltipContent>
                </Tooltip>
              ))}
            </div>
          </TooltipProvider>
        </CardContent>
      </Card>

      {/* Manage */}
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
              <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('admin_notifications.search_placeholder')} className="pl-9" />
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('admin_notifications.purge_label')}</label>
              <Input type="number" min="1" value={purgeDays} onChange={e => setPurgeDays(e.target.value)} className="mt-1 w-32" />
            </div>
            <Button variant="destructive" onClick={purgeOlderThan} disabled={purging}>
              {purging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {t('admin_notifications.purge_btn')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* List */}
      <Card>
        <CardHeader>
          <CardTitle>{t('admin_notifications.list_title')}</CardTitle>
          <CardDescription>{t('admin_notifications.list_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-10 flex justify-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">{t('admin_notifications.empty')}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-8" />
                  <TableHead>{t('admin_notifications.col_user')}</TableHead>
                  <TableHead>{t('admin_notifications.col_type')}</TableHead>
                  <TableHead>{t('admin_notifications.col_title')}</TableHead>
                  <TableHead>{t('admin_notifications.col_date')}</TableHead>
                  <TableHead className="text-right w-10">{t('admin_notifications.col_actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifications.map(n => {
                  const def = TYPE_MAP[n.type];
                  const Icon = def?.Icon ?? Bell;
                  const isUnread = !n.is_read;
                  return (
                    <TableRow key={n.id} className={cn(isUnread && 'bg-primary/[0.02]')}>
                      {/* Unread dot */}
                      <TableCell className="pr-0 pl-4">
                        {isUnread
                          ? <span className="w-2 h-2 rounded-full bg-primary block" title={t('admin_notifications.unread_badge')} />
                          : <span className="w-2 h-2 rounded-full bg-border block" />
                        }
                      </TableCell>
                      {/* User */}
                      <TableCell className="font-medium text-sm max-w-[160px] truncate">
                        {n.user_email || n.user_id}
                      </TableCell>
                      {/* Type */}
                      <TableCell>
                        <NotifTypeCell type={n.type} />
                      </TableCell>
                      {/* Content */}
                      <TableCell>
                        <div className="space-y-0.5">
                          <p className={cn('text-sm leading-tight', isUnread ? 'font-semibold' : 'font-medium')}>{n.title}</p>
                          {n.message && <p className="text-xs text-muted-foreground line-clamp-1">{n.message}</p>}
                        </div>
                      </TableCell>
                      {/* Date */}
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{formatDate(n.created_at)}</TableCell>
                      {/* Actions */}
                      <TableCell className="text-right">
                        <Button
                          variant="ghost" size="icon"
                          className="w-7 h-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                          onClick={() => setPendingDelete(n)}
                          title={t('admin_notifications.delete_one')}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingDelete} onOpenChange={open => { if (!open) setPendingDelete(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('admin_notifications.delete_title')}</AlertDialogTitle>
            <AlertDialogDescription>{t('admin_notifications.delete_desc')}</AlertDialogDescription>
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
