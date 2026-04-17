import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useMyPermissions } from '@/hooks/use-admin';
import { supabase } from '@/integrations/supabase/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { Crown, Mail, Lock, Building2, User, CalendarDays, ExternalLink, Loader2, Shield, ShieldCheck, ShieldOff, Download, Trash2, AlertTriangle, CreditCard, Camera, Phone, MapPin, Briefcase } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PasswordStrengthIndicator, { validatePassword } from '@/components/PasswordStrengthIndicator';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

export default function Account() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { data: myPermissions } = useMyPermissions();

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
      return data as { subscribed: boolean; source?: string; subscription_end?: string; premium_since?: string; plan_type?: string; billing_cycle?: string };
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

  const { data: paymentMethod } = useQuery({
    queryKey: ['payment-method', user?.id],
    queryFn: async () => {
      const { data } = await supabase.functions.invoke('payment-method');
      return data?.payment_method as { brand: string; last4: string; exp_month: number; exp_year: number } | null;
    },
    enabled: !!user && !!subscription?.subscribed && subscription?.source === 'stripe',
  });

  // 2FA status
  const { data: twoFAStatus, refetch: refetch2FA } = useQuery({
    queryKey: ['2fa-status', user?.id],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.API_URL || '/api'}/auth/2fa/status`, {
        credentials: 'include',
      });
      return res.json() as Promise<{ enabled: boolean; method: 'totp' | 'email' | null }>;
    },
    enabled: !!user,
  });

  const [fullName, setFullName] = useState('');
  const [club, setClub] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [company, setCompany] = useState('');
  const [siret, setSiret] = useState('');
  const [phone, setPhone] = useState('');
  const [civility, setCivility] = useState('');
  const [address, setAddress] = useState('');
  const [dob, setDob] = useState('');
  const [referenceClub, setReferenceClub] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [socialX, setSocialX] = useState('');
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialLinkedin, setSocialLinkedin] = useState('');
  const [socialPublic, setSocialPublic] = useState(false);
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
      setFirstName(profile.first_name || '');
      setLastName(profile.last_name || '');
      setCompany(profile.company || '');
      setSiret(profile.siret || '');
      setPhone(profile.phone || '');
      setCivility(profile.civility || '');
      setAddress(profile.address || '');
      setDob(profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : '');
      setReferenceClub(profile.reference_club || '');
      setPhotoUrl(profile.photo_url || '');
      setSocialX(profile.social_x || '');
      setSocialInstagram(profile.social_instagram || '');
      setSocialLinkedin(profile.social_linkedin || '');
      setSocialPublic(!!profile.social_public);
    }
  }, [profile]);

  const handleSaveProfile = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase.from('profiles').update({
        full_name: fullName.trim(),
        club: club.trim(),
        first_name: firstName.trim() || null,
        last_name: lastName.trim() || null,
        company: company.trim() || null,
        siret: siret.trim() || null,
        phone: phone.trim() || null,
        civility: civility || null,
        address: address.trim() || null,
        date_of_birth: dob || null,
        reference_club: referenceClub.trim() || null,
        social_x: socialX.trim() || null,
        social_instagram: socialInstagram.trim() || null,
        social_linkedin: socialLinkedin.trim() || null,
        social_public: socialPublic ? 1 : 0,
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

  const handleUploadPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('photo', file);
      const res = await fetch(`${apiBase}/account/upload-photo`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPhotoUrl(data.photo_url);
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
      toast.success(t('account.photo_updated'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPhotoUploading(false);
      e.target.value = '';
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
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
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setPortalLoading(false);
    }
  };

  const apiBase = import.meta.env.API_URL || '/api';
  const apiOrigin = apiBase.replace(/\/api$/, '');

  const handleSetup2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/setup`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTwoFASetup(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleVerify2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
        body: JSON.stringify({ code: twoFACode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.2fa_enabled_success'));
      setTwoFASetup(null);
      setTwoFACode('');
      refetch2FA();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
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
        headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
        body: JSON.stringify({ code: disableCode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.2fa_disabled_success'));
      setDisableCode('');
      refetch2FA();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
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
        headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setEmail2FACodeSent(true);
      toast.success(t('account.email_2fa_code_sent'));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setTwoFALoading(false);
    }
  };

  const handleVerifyEmail2FA = async () => {
    setTwoFALoading(true);
    try {
      const res = await fetch(`${apiBase}/auth/2fa/email/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
        body: JSON.stringify({ code: email2FACode }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.email_2fa_enabled_success'));
      setEmail2FACodeSent(false);
      setEmail2FACode('');
      refetch2FA();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
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
        headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.email_2fa_disabled_success'));
      refetch2FA();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
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
        credentials: 'include' as const,
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
        headers: { 'Content-Type': 'application/json' }, credentials: 'include' as const,
        body: JSON.stringify({ confirmation: 'DELETE' }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Deletion failed');
      }
      setDeleteDialogOpen(false);
      localStorage.removeItem('scouthub_session');
      window.location.href = '/';
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteLoading(false);
    }
  };

  const isPremium = subscription?.subscribed;
  const userRoles = myPermissions?.roles?.length ? myPermissions.roles : ['user'];

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
          {/* Photo upload */}
          <div className="flex items-center gap-5">
            <div className="relative group w-20 h-20 shrink-0">
              <div className="w-20 h-20 rounded-full border-2 border-border overflow-hidden bg-muted flex items-center justify-center">
                {photoUrl ? (
                  <img
                    src={photoUrl.startsWith('http') ? photoUrl : `${apiOrigin}${photoUrl}`}
                    alt="Photo de profil"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <User className="w-8 h-8 text-muted-foreground" />
                )}
              </div>
              <label className="absolute inset-0 rounded-full flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                {photoUploading ? (
                  <Loader2 className="w-5 h-5 text-white animate-spin" />
                ) : (
                  <Camera className="w-5 h-5 text-white" />
                )}
                <input type="file" accept="image/*" className="sr-only" onChange={handleUploadPhoto} disabled={photoUploading} />
              </label>
            </div>
            <div>
              <p className="text-sm font-medium">{t('account.photo_title')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('account.photo_desc')}</p>
            </div>
          </div>

          <Separator />

          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('account.roles_title')}</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {userRoles.map(role => (
                <Badge
                  key={role}
                  variant={role === 'admin' ? 'default' : 'secondary'}
                  className="capitalize"
                >
                  {role}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Civility + first/last name */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('account.civility')}</label>
              <Select value={civility} onValueChange={setCivility}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={t('account.civility_placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="M.">{t('account.civility_m')}</SelectItem>
                  <SelectItem value="Mme">{t('account.civility_mme')}</SelectItem>
                  <SelectItem value="Non précisé">{t('account.civility_none')}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('account.first_name')}</label>
              <Input className="mt-1" value={firstName} onChange={e => setFirstName(e.target.value)} placeholder={t('account.first_name_placeholder')} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('account.last_name')}</label>
              <Input className="mt-1" value={lastName} onChange={e => setLastName(e.target.value)} placeholder={t('account.last_name_placeholder')} />
            </div>
          </div>

          {/* Display name (full_name) */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('account.display_name')}</label>
            <Input className="mt-1" value={fullName} onChange={e => setFullName(e.target.value)} placeholder={t('auth.full_name_placeholder')} />
            <p className="text-xs text-muted-foreground mt-1">{t('account.display_name_desc')}</p>
          </div>

          {/* Phone + DOB */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <Phone className="w-3 h-3" />{t('account.phone')}
              </label>
              <Input className="mt-1" type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+33 6 00 00 00 00" />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="w-3 h-3" />{t('account.dob')}
              </label>
              <Input className="mt-1" type="date" value={dob} onChange={e => setDob(e.target.value)} />
            </div>
          </div>

          {/* Address */}
          <div>
            <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
              <MapPin className="w-3 h-3" />{t('account.address')}
            </label>
            <Input className="mt-1" value={address} onChange={e => setAddress(e.target.value)} placeholder={t('account.address_placeholder')} />
          </div>

          <Separator />

          {/* Professional info */}
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-muted-foreground" />
            {t('account.pro_info')}
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('account.company')}</label>
              <Input className="mt-1" value={company} onChange={e => setCompany(e.target.value)} placeholder={t('account.company_placeholder')} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('account.siret')}</label>
              <Input className="mt-1" value={siret} onChange={e => setSiret(e.target.value)} placeholder="000 000 000 00000" maxLength={20} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('auth.club')}</label>
              <Input className="mt-1" value={club} onChange={e => setClub(e.target.value)} placeholder={t('auth.club_placeholder')} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('account.reference_club')}</label>
              <Input className="mt-1" value={referenceClub} onChange={e => setReferenceClub(e.target.value)} placeholder={t('account.reference_club_placeholder')} />
            </div>
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

          <Separator />

          {/* Social networks */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">{t('account.social_title')}</h3>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">X (Twitter)</label>
                <Input className="mt-1" value={socialX} onChange={e => setSocialX(e.target.value)} placeholder="@username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Instagram</label>
                <Input className="mt-1" value={socialInstagram} onChange={e => setSocialInstagram(e.target.value)} placeholder="@username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">LinkedIn</label>
                <Input className="mt-1" value={socialLinkedin} onChange={e => setSocialLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." />
              </div>
              <label className="flex items-center gap-3 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={socialPublic}
                  onChange={e => setSocialPublic(e.target.checked)}
                  className="rounded border-input"
                />
                <span className="text-sm">{t('account.social_public')}</span>
              </label>
              <p className="text-xs text-muted-foreground">{t('account.social_public_desc')}</p>
            </div>
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
                <div className="flex items-center gap-2 flex-wrap">
                  <Crown className="w-5 h-5 text-primary" />
                  <span className="font-bold text-primary">
                    {subscription?.plan_type === 'pro' ? 'Pro' : subscription?.plan_type === 'scout' ? 'Scout+' : 'Premium'}
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                    {subscription?.source === 'admin' ? t('account.gifted') : t('account.active')}
                  </span>
                  {subscription?.billing_cycle && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
                      {t(`account.billing_${subscription.billing_cycle}`)}
                    </span>
                  )}
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
                {paymentMethod && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CreditCard className="w-4 h-4" />
                    {paymentMethod.brand.charAt(0).toUpperCase() + paymentMethod.brand.slice(1)} •••• {paymentMethod.last4}
                    <span className="text-xs">({paymentMethod.exp_month}/{paymentMethod.exp_year})</span>
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
