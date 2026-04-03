import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Crown, Mail, Lock, Building2, User, CalendarDays, ExternalLink, Loader2, Shield, ShieldCheck, ShieldOff, Download, Trash2, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import PasswordStrengthIndicator, { validatePassword } from '@/components/PasswordStrengthIndicator';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

export default function Account() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Profile
  const { data: profile } = useQuery({
    queryKey: ['profile', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('*').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user,
  });

  // Subscription
  const { data: subscription, isLoading: subLoading } = useQuery({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke('check-subscription');
      if (error) throw error;
      return data as { subscribed: boolean; source?: string; subscription_end?: string; premium_since?: string };
    },
    enabled: !!user,
  });

  const { data: subRow } = useQuery({
    queryKey: ['user_subscription_row', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase.from('user_subscriptions').select('*').eq('user_id', user.id).single();
      return data;
    },
    enabled: !!user,
  });

  // 2FA status
  const { data: twoFAStatus, refetch: refetch2FA } = useQuery({
    queryKey: ['2fa-status', user?.id],
    queryFn: async () => {
      const res = await fetch(`${(import.meta as any).env.VITE_API_URL || '/api'}/auth/2fa/status`, {
        headers: { Authorization: `Bearer ${JSON.parse(localStorage.getItem('scouthub_session') || '{}').access_token}` },
      });
      return res.json() as Promise<{ enabled: boolean; method: 'totp' | 'email' | null }>;
    },
    enabled: !!user,
  });

  const [fullName, setFullName] = useState('');
  const [club, setClub] = useState('');
  const [saving, setSaving] = useState(false);

  const [newEmail, setNewEmail] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);

  const [portalLoading, setPortalLoading] = useState(false);

  // 2FA state
  const [twoFASetup, setTwoFASetup] = useState<{ secret: string; qrCode: string } | null>(null);
  const [twoFACode, setTwoFACode] = useState('');
  const [twoFALoading, setTwoFALoading] = useState(false);
  const [disableCode, setDisableCode] = useState('');
  // Email 2FA state
  const [email2FACodeSent, setEmail2FACodeSent] = useState(false);
  const [email2FACode, setEmail2FACode] = useState('');

  useEffect(() => {
    if (profile) {
      setFullName(profile.full_name || '');
      setClub(profile.club || '');
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: fullName.trim(),
        club: club.trim(),
      }).eq('user_id', user.id);
      if (error) throw error;
      queryClient.invalidateQueries({ queryKey: ['profile', user.id] });
      toast.success(t('account.profile_updated'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateEmail = async () => {
    if (!newEmail.trim()) return;
    setEmailLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ email: newEmail.trim() });
      if (error) throw error;
      toast.success(t('account.email_confirmation_sent'));
      setNewEmail('');
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setEmailLoading(false);
    }
  };

  const handleUpdatePassword = async () => {
    if (!validatePassword(newPassword)) {
      toast.error(t('auth.pwd_too_weak'));
      return;
    }
    setPasswordLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success(t('account.password_updated'));
      setNewPassword('');
      setCurrentPassword('');
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setPasswordLoading(false);
    }
  };

  const handlePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      if (data?.url) window.open(data.url, '_blank');
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setPortalLoading(false);
    }
  };

  const apiBase = (import.meta as any).env.VITE_API_URL || '/api';
  const authHeader = { Authorization: `Bearer ${JSON.parse(localStorage.getItem('scouthub_session') || '{}').access_token}` };

  const handleSetup2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/setup`, { method: 'POST', headers: { ...authHeader, 'Content-Type': 'application/json' } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTwoFASetup(data);
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/verify`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: twoFACode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.2fa_enabled_success'));
      setTwoFASetup(null);
      setTwoFACode('');
      refetch2FA();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
      setTwoFACode('');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisable2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/disable`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.2fa_disabled_success'));
      setDisableCode('');
      refetch2FA();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
      setDisableCode('');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleEnableEmail2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/email/enable`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmail2FACodeSent(true);
      toast.success(t('account.email_2fa_code_sent'));
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleVerifyEmail2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/email/verify`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: email2FACode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.email_2fa_enabled_success'));
      setEmail2FACodeSent(false);
      setEmail2FACode('');
      refetch2FA();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
      setEmail2FACode('');
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleDisableEmail2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/email/disable`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.email_2fa_disabled_success'));
      refetch2FA();
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setTwoFALoading(false);
    }
  };

  // GDPR state
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);

  const handleExportData = async () => {
    setExportLoading(true);
    try {
      const res = await fetch(`${apiBase}/account/export-data`, {
        method: 'POST',
        headers: authHeader,
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `scouty-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(t('account.export_success'));
    } catch {
      toast.error(t('common.error'));
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') return;
    setDeleteLoading(true);
    try {
      const res = await fetch(`${apiBase}/account/delete`, {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Deletion failed');
      }
      setDeleteDialogOpen(false);
      localStorage.removeItem('scouthub_session');
      window.location.href = '/';
    } catch (err: any) {
      toast.error(err.message || t('common.error'));
    } finally {
      setDeleteLoading(false);
    }
  };

  const isPremium = subscription?.subscribed;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('account.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('account.subtitle')}</p>
      </div>

      {/* Profile info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <User className="w-5 h-5 text-primary" />
            {t('account.personal_info')}
          </CardTitle>
          <CardDescription>{t('account.personal_info_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('auth.full_name')}</label>
            <Input className="mt-1" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('auth.full_name_placeholder')} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('auth.club')}</label>
            <Input className="mt-1" value={club} onChange={e => setClub(e.target.value)} placeholder={t('auth.club_placeholder')} />
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('account.role')}</label>
            <p className="text-sm mt-1 p-3 rounded-xl bg-muted/40 border border-border/50 capitalize">
              {profile?.role || 'scout'}
            </p>
          </div>
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('settings.member_since')}</label>
            <p className="text-sm mt-1 p-3 rounded-xl bg-muted/40 border border-border/50">
              {user?.created_at ? new Date(user.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
            </p>
          </div>
          <Button onClick={handleSaveProfile} disabled={saving} size="sm">
            {saving ? t('common.saving') : t('common.save')}
          </Button>
        </CardContent>
      </Card>

      {/* Email */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mail className="w-5 h-5 text-primary" />
            {t('account.email_title')}
          </CardTitle>
          <CardDescription>{t('account.email_current')} <span className="font-medium text-foreground">{user?.email}</span></CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('account.new_email')}</label>
            <Input
              className="mt-1"
              type="email"
              value={newEmail}
              onChange={e => setNewEmail(e.target.value)}
              placeholder={t('account.new_email_placeholder')}
            />
          </div>
          <Button onClick={handleUpdateEmail} disabled={emailLoading || !newEmail.trim()} size="sm">
            {emailLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('account.update_email')}
          </Button>
        </CardContent>
      </Card>

      {/* Password */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Lock className="w-5 h-5 text-primary" />
            {t('account.password_title')}
          </CardTitle>
          <CardDescription>{t('account.password_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('account.new_password')}</label>
            <Input
              className="mt-1"
              type="password"
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder={t('auth.password_placeholder_signup')}
            />
            <PasswordStrengthIndicator password={newPassword} />
          </div>
          <Button onClick={handleUpdatePassword} disabled={passwordLoading || !validatePassword(newPassword)} size="sm">
            {passwordLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
            {t('account.update_password')}
          </Button>
        </CardContent>
      </Card>

      {/* 2FA */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5 text-primary" />
            {t('account.2fa_title')}
          </CardTitle>
          <CardDescription>{t('account.2fa_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* ── Email 2FA ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Mail className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t('account.email_2fa_title')}</h3>
            </div>

            {twoFAStatus?.method === 'email' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-500 font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  {t('account.email_2fa_active')}
                </div>
                <p className="text-xs text-muted-foreground">{t('account.email_2fa_active_desc')}</p>
                <Button variant="destructive" size="sm" onClick={handleDisableEmail2FA} disabled={twoFALoading}>
                  {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldOff className="w-4 h-4 mr-2" />}
                  {t('account.email_2fa_disable')}
                </Button>
              </div>
            ) : email2FACodeSent ? (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">{t('account.email_2fa_code_sent_desc')}</p>
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={email2FACode} onChange={setEmail2FACode}>
                    <InputOTPGroup>
                      <InputOTPSlot index={0} />
                      <InputOTPSlot index={1} />
                      <InputOTPSlot index={2} />
                      <InputOTPSlot index={3} />
                      <InputOTPSlot index={4} />
                      <InputOTPSlot index={5} />
                    </InputOTPGroup>
                  </InputOTP>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleVerifyEmail2FA} disabled={twoFALoading || email2FACode.length < 6}>
                    {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {t('account.2fa_activate')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setEmail2FACodeSent(false); setEmail2FACode(''); }}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('account.email_2fa_desc')}</p>
                <Button size="sm" variant="outline" onClick={handleEnableEmail2FA} disabled={twoFALoading || twoFAStatus?.enabled}>
                  {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Mail className="w-4 h-4 mr-2" />}
                  {t('account.email_2fa_enable')}
                </Button>
              </div>
            )}
          </div>

          <Separator />

          {/* ── TOTP App 2FA ── */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">{t('account.totp_2fa_title')}</h3>
            </div>

            {twoFAStatus?.method === 'totp' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-green-500 font-medium">
                  <ShieldCheck className="w-4 h-4" />
                  {t('account.2fa_active')}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">{t('account.2fa_enter_code_disable')}</label>
                  <div className="flex items-center gap-3">
                    <InputOTP maxLength={6} value={disableCode} onChange={setDisableCode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                  <Button variant="destructive" size="sm" onClick={handleDisable2FA} disabled={twoFALoading || disableCode.length < 6}>
                    {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldOff className="w-4 h-4 mr-2" />}
                    {t('account.2fa_disable')}
                  </Button>
                </div>
              </div>
            ) : twoFASetup ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{t('account.2fa_scan_qr')}</p>
                <div className="flex justify-center">
                  <img src={twoFASetup.qrCode} alt="QR Code" className="w-48 h-48 rounded-lg border" />
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground mb-1">{t('account.2fa_manual_key')}</p>
                  <code className="text-xs bg-muted px-2 py-1 rounded select-all">{twoFASetup.secret}</code>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">{t('account.2fa_enter_code')}</label>
                  <div className="flex justify-center">
                    <InputOTP maxLength={6} value={twoFACode} onChange={setTwoFACode}>
                      <InputOTPGroup>
                        <InputOTPSlot index={0} />
                        <InputOTPSlot index={1} />
                        <InputOTPSlot index={2} />
                        <InputOTPSlot index={3} />
                        <InputOTPSlot index={4} />
                        <InputOTPSlot index={5} />
                      </InputOTPGroup>
                    </InputOTP>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleVerify2FA} disabled={twoFALoading || twoFACode.length < 6}>
                    {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
                    {t('account.2fa_activate')}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => { setTwoFASetup(null); setTwoFACode(''); }}>
                    {t('common.cancel')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-muted-foreground">{t('account.2fa_not_active')}</p>
                <Button size="sm" variant="outline" onClick={handleSetup2FA} disabled={twoFALoading || twoFAStatus?.enabled}>
                  {twoFALoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                  {t('account.2fa_enable')}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subscription */}
      <Card className={isPremium ? 'border-primary/40' : ''}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Crown className={`w-5 h-5 ${isPremium ? 'text-primary' : 'text-muted-foreground'}`} />
            {t('account.subscription')}
          </CardTitle>
          <CardDescription>
            {isPremium ? t('account.subscribed_premium') : t('account.free_plan')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {subLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" />
              {t('account.checking')}
            </div>
          ) : isPremium ? (
            <>
              <div className="p-4 rounded-xl bg-primary/5 border border-primary/20 space-y-2">
                <div className="flex items-center gap-2">
                  <Crown className="w-5 h-5 text-primary" />
                  <span className="font-bold text-primary">Premium</span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {subscription?.source === 'admin' ? t('account.gifted') : t('account.active')}
                  </span>
                </div>
                {subRow?.premium_since && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {t('account.subscribed_since')} {new Date(subRow.premium_since).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
                {subscription?.subscription_end && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {t('account.next_renewal')} {new Date(subscription.subscription_end).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
                  </p>
                )}
              </div>
              {subscription?.source !== 'admin' && (
                <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading}>
                  {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                  {t('account.manage_subscription')}
                </Button>
              )}
            </>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t('account.upgrade_desc')}
              </p>
              <Button size="sm" onClick={() => window.location.href = '/pricing'}>
                <Crown className="w-4 h-4 mr-2" />
                {t('account.see_plans')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* RGPD — Data export & account deletion */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5 text-muted-foreground" />
            {t('account.gdpr_title')}
          </CardTitle>
          <CardDescription>{t('account.gdpr_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Data export */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Download className="w-4 h-4 text-muted-foreground" />
              {t('account.export_title')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('account.export_desc')}</p>
            <Button variant="outline" size="sm" onClick={handleExportData} disabled={exportLoading}>
              {exportLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Download className="w-4 h-4 mr-2" />}
              {t('account.export_btn')}
            </Button>
          </div>

          <Separator />

          {/* Account deletion */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold flex items-center gap-2 text-destructive">
              <Trash2 className="w-4 h-4" />
              {t('account.delete_title')}
            </h3>
            <p className="text-xs text-muted-foreground">{t('account.delete_desc')}</p>
            <Button variant="destructive" size="sm" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 className="w-4 h-4 mr-2" />
              {t('account.delete_btn')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="w-5 h-5" />
              {t('account.delete_confirm_title')}
            </DialogTitle>
            <DialogDescription>{t('account.delete_confirm_desc')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-4 text-sm space-y-2">
              <p className="font-medium text-destructive">{t('account.delete_warning_title')}</p>
              <ul className="list-disc list-inside text-xs text-muted-foreground space-y-1">
                <li>{t('account.delete_warning_players')}</li>
                <li>{t('account.delete_warning_reports')}</li>
                <li>{t('account.delete_warning_watchlists')}</li>
                <li>{t('account.delete_warning_subscription')}</li>
                <li>{t('account.delete_warning_irreversible')}</li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('account.delete_confirm_label')}</label>
              <Input
                value={deleteConfirmText}
                onChange={e => setDeleteConfirmText(e.target.value)}
                placeholder="DELETE"
                className="font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDeleteDialogOpen(false); setDeleteConfirmText(''); }} disabled={deleteLoading}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={handleDeleteAccount} disabled={deleteLoading || deleteConfirmText !== 'DELETE'}>
              {deleteLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Trash2 className="w-4 h-4 mr-2" />}
              {t('account.delete_final_btn')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
