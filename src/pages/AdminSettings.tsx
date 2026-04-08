import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useIsAdmin } from '@/hooks/use-admin';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Navigate, Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  Settings, Mail, Trash2, ToggleLeft, Loader2, ArrowLeft, AlertTriangle,
  Shield, Users, CalendarDays, MessageSquare, Heart, Building2, Globe, Search, Database, Ticket, Bell, Archive,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const API = (import.meta.env.API_URL || '/api').replace(/\/$/, '');

async function authHeaders() {
  const s = (await supabase.auth.getSession()).data.session;
  return { Authorization: `Bearer ${s?.access_token}`, 'Content-Type': 'application/json' };
}

// ── Feature flags config ────────────────────────────────────────────────────

const FEATURES = [
  { key: 'feature_booking', icon: CalendarDays, color: 'text-blue-500' },
  { key: 'feature_affiliate', icon: Heart, color: 'text-pink-500' },
  { key: 'feature_community', icon: MessageSquare, color: 'text-purple-500' },
  { key: 'feature_discover', icon: Search, color: 'text-green-500' },
  { key: 'feature_map', icon: Globe, color: 'text-amber-500' },
  { key: 'feature_fixtures', icon: CalendarDays, color: 'text-emerald-500' },
  { key: 'feature_contacts', icon: Users, color: 'text-indigo-500' },
  { key: 'feature_shadow_team', icon: Shield, color: 'text-orange-500' },
  { key: 'feature_club_profile', icon: Building2, color: 'text-teal-500' },
] as const;

// ── Purge data config ───────────────────────────────────────────────────────

const PURGE_TYPES = [
  { key: 'players', icon: Users, color: 'text-red-500' },
  { key: 'reports', icon: Archive, color: 'text-red-400' },
  { key: 'contacts', icon: Users, color: 'text-red-400' },
  { key: 'fixtures', icon: CalendarDays, color: 'text-red-400' },
  { key: 'match_assignments', icon: CalendarDays, color: 'text-red-400' },
  { key: 'watchlists', icon: Search, color: 'text-red-400' },
  { key: 'shadow_teams', icon: Shield, color: 'text-red-400' },
  { key: 'community', icon: MessageSquare, color: 'text-red-400' },
  { key: 'tickets', icon: Ticket, color: 'text-red-400' },
  { key: 'notifications', icon: Bell, color: 'text-red-400' },
  { key: 'club_directory', icon: Building2, color: 'text-red-400' },
  { key: 'club_logos', icon: Database, color: 'text-red-400' },
  { key: 'cache', icon: Database, color: 'text-red-300' },
] as const;

export default function AdminSettings() {
  const { t } = useTranslation();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const queryClient = useQueryClient();

  // ── Email test ──
  const [testEmail, setTestEmail] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // ── Purge ──
  const [purgeConfirm, setPurgeConfirm] = useState<string | null>(null);
  const [purging, setPurging] = useState(false);

  // ── Feature flags ──
  const { data: flags = {} } = useQuery<Record<string, boolean>>({
    queryKey: ['feature-flags'],
    queryFn: async () => {
      const res = await fetch(`${API}/admin/feature-flags`, { headers: await authHeaders() });
      if (!res.ok) return {};
      return res.json();
    },
    enabled: isAdmin === true,
    staleTime: 30_000,
  });

  const toggleFlag = useMutation({
    mutationFn: async ({ key, enabled }: { key: string; enabled: boolean }) => {
      const res = await fetch(`${API}/admin/feature-flags`, {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ key, enabled }),
      });
      if (!res.ok) throw new Error('Failed');
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['feature-flags'] }),
  });

  const handleTestEmail = async () => {
    setSendingEmail(true);
    try {
      const res = await fetch(`${API}/admin/test-email`, {
        method: 'POST', headers: await authHeaders(),
        body: JSON.stringify({ to: testEmail || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('admin_settings.email_sent'));
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setSendingEmail(false);
    }
  };

  const handlePurge = async (type: string) => {
    setPurging(true);
    try {
      const res = await fetch(`${API}/admin/purge`, {
        method: 'POST', headers: await authHeaders(), body: JSON.stringify({ type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('admin_settings.purge_success', { count: data.deleted, type }));
      setPurgeConfirm(null);
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setPurging(false);
    }
  };

  if (adminLoading) return null;
  if (!isAdmin) return <Navigate to="/players" replace />;

  const isFlagEnabled = (key: string) => flags[key] !== false; // default: enabled

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link to="/admin">
            <Button variant="ghost" size="icon" className="rounded-xl">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Settings className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight">{t('admin_settings.title')}</h1>
            <p className="text-sm text-muted-foreground">{t('admin_settings.subtitle')}</p>
          </div>
        </div>
      </div>

      {/* ── 1. Test Email ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Mail className="w-4 h-4 text-primary" />
            {t('admin_settings.test_email_title')}
          </CardTitle>
          <CardDescription>{t('admin_settings.test_email_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              value={testEmail}
              onChange={e => setTestEmail(e.target.value)}
              placeholder={t('admin_settings.test_email_placeholder')}
              className="max-w-sm"
              type="email"
            />
            <Button onClick={handleTestEmail} disabled={sendingEmail} className="shrink-0">
              {sendingEmail ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
              {t('admin_settings.send_test')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── 2. Feature Flags ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ToggleLeft className="w-4 h-4 text-primary" />
            {t('admin_settings.features_title')}
          </CardTitle>
          <CardDescription>{t('admin_settings.features_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {FEATURES.map(f => {
              const enabled = isFlagEnabled(f.key);
              return (
                <div key={f.key} className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                  <div className="flex items-center gap-3">
                    <f.icon className={`w-4 h-4 ${f.color}`} />
                    <div>
                      <p className="text-sm font-medium">{t(`admin_settings.flag_${f.key}`)}</p>
                      <p className="text-[11px] text-muted-foreground">{t(`admin_settings.flag_${f.key}_desc`)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={enabled ? 'default' : 'secondary'} className="text-[10px]">
                      {enabled ? t('admin_settings.enabled') : t('admin_settings.disabled')}
                    </Badge>
                    <Switch
                      checked={enabled}
                      onCheckedChange={checked => toggleFlag.mutate({ key: f.key, enabled: checked })}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── 3. Purge Data ── */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="w-4 h-4" />
            {t('admin_settings.purge_title')}
          </CardTitle>
          <CardDescription>{t('admin_settings.purge_desc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {PURGE_TYPES.map(p => (
              <Button
                key={p.key}
                variant="outline"
                size="sm"
                className="justify-start gap-2 text-xs border-destructive/20 hover:bg-destructive/5 hover:text-destructive"
                onClick={() => setPurgeConfirm(p.key)}
              >
                <p.icon className="w-3.5 h-3.5" />
                {t(`admin_settings.purge_${p.key}`)}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Purge confirmation dialog */}
      <AlertDialog open={!!purgeConfirm} onOpenChange={open => !open && setPurgeConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              {t('admin_settings.purge_confirm_title')}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('admin_settings.purge_confirm_desc', { type: purgeConfirm ? t(`admin_settings.purge_${purgeConfirm}`) : '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => purgeConfirm && handlePurge(purgeConfirm)}
              disabled={purging}
            >
              {purging ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {t('admin_settings.purge_confirm_btn')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
