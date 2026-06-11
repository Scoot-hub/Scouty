import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';
import { formatDate } from '@/lib/format-utils';
import { useUiPreferences } from '@/contexts/UiPreferencesContext';
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
import { Crown, Mail, Lock, Building2, User, CalendarDays, ExternalLink, Loader2, Shield, ShieldCheck, ShieldOff, Download, Trash2, AlertTriangle, CreditCard, Camera, Phone, MapPin, Briefcase, Zap, Globe, Info, Users, ShoppingCart, ArrowRight, TrendingUp } from 'lucide-react';
import { COUNTRY_LIST } from '@/data/country-names';
import { getFlag } from '@/types/player';
import { useCredits } from '@/hooks/use-credits';
import { creditStyle } from '@/components/CreditWidget';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import PasswordStrengthIndicator, { validatePassword } from '@/components/PasswordStrengthIndicator';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import DateInput from '@/components/ui/date-input';

function CountrySelect({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Sync when parent value changes (e.g. profile load)
  useEffect(() => { setQuery(value); }, [value]);

  const filtered = query.trim()
    ? COUNTRY_LIST.filter(c => c.toLowerCase().includes(query.toLowerCase())).slice(0, 30)
    : COUNTRY_LIST.slice(0, 60);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (country: string) => {
    onChange(country);
    setQuery(country);
    setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        {value && (
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-base leading-none pointer-events-none">
            {getFlag(value)}
          </span>
        )}
        <input
          type="text"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          autoComplete="off"
          className={`w-full h-9 rounded-md border border-input bg-background text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${value ? 'pl-8 pr-3' : 'px-3'} py-1`}
        />
      </div>
      {open && filtered.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-xl border bg-popover shadow-xl">
          <div className="p-1 space-y-0.5">
            {filtered.map(c => (
              <button
                key={c}
                type="button"
                onClick={() => handleSelect(c)}
                className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-sm text-left hover:bg-muted transition-colors ${value === c ? 'bg-primary/10 text-primary font-medium' : ''}`}
              >
                <span className="text-base leading-none w-5 text-center shrink-0">{getFlag(c)}</span>
                <span className="flex-1 truncate">{c}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Traductions des rôles système intégrés (les rôles personnalisés s'affichent tels quels)
const BUILTIN_ROLE_LABELS: Record<string, string> = {
  user:         'Utilisateur',
  admin:        'Administrateur',
  moderator:    'Modérateur',
  moderateur:   'Modérateur',
  importateur:  'Importateur',
  scout:        'Scout',
  scout_pro:    'Scout Pro',
};

export default function Account() {
  const { t } = useTranslation();
  const { dateFormat } = useUiPreferences();
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
  const [country, setCountry] = useState('');
  const [dob, setDob] = useState('');
  const [referenceClub, setReferenceClub] = useState('');
  const [photoUrl, setPhotoUrl] = useState('');
  const [photoUploading, setPhotoUploading] = useState(false);
  const [socialX, setSocialX] = useState('');
  const [socialInstagram, setSocialInstagram] = useState('');
  const [socialLinkedin, setSocialLinkedin] = useState('');
  const [socialFacebook, setSocialFacebook] = useState('');
  const [socialSnapchat, setSocialSnapchat] = useState('');
  const [socialTiktok, setSocialTiktok] = useState('');
  const [socialTelegram, setSocialTelegram] = useState('');
  const [socialWhatsapp, setSocialWhatsapp] = useState('');
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
  const [disableEmail2FAPassword, setDisableEmail2FAPassword] = useState('');

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
      setCountry((profile as any).country || '');
      setDob(profile.date_of_birth ? profile.date_of_birth.slice(0, 10) : '');
      setReferenceClub(profile.reference_club || '');
      setPhotoUrl(profile.photo_url || '');
      setSocialX(profile.social_x || '');
      setSocialInstagram(profile.social_instagram || '');
      setSocialLinkedin(profile.social_linkedin || '');
      setSocialFacebook((profile as any).social_facebook || '');
      setSocialSnapchat((profile as any).social_snapchat || '');
      setSocialTiktok((profile as any).social_tiktok || '');
      setSocialTelegram((profile as any).social_telegram || '');
      setSocialWhatsapp((profile as any).social_whatsapp || '');
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
        country: country.trim() || null,
        date_of_birth: dob || null,
        reference_club: referenceClub.trim() || null,
        social_x: socialX.trim() || null,
        social_instagram: socialInstagram.trim() || null,
        social_linkedin: socialLinkedin.trim() || null,
        social_facebook: socialFacebook.trim() || null,
        social_snapchat: socialSnapchat.trim() || null,
        social_tiktok: socialTiktok.trim() || null,
        social_telegram: socialTelegram.trim() || null,
        social_whatsapp: socialWhatsapp.trim() || null,
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
        body: JSON.stringify({ password: disableEmail2FAPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success(t('account.email_2fa_disabled_success'));
      setDisableEmail2FAPassword('');
      refetch2FA();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
      setDisableEmail2FAPassword('');
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

  const [referralCode, setReferralCode] = useState('');
  const [referralApplying, setReferralApplying] = useState(false);

  const handleApplyReferral = async () => {
    if (!referralCode.trim()) return;
    setReferralApplying(true);
    try {
      const res = await fetch(`${apiBase}/account/apply-referral`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ referral_code: referralCode.trim() }),
      });
      if (!res.ok) {
        let msg = `Erreur ${res.status}`;
        try { const d = await res.json(); msg = d.error || msg; } catch {}
        throw new Error(msg);
      }
      await res.json();
      toast.success(t('account.referral_code_success'));
      setReferralCode('');
      queryClient.invalidateQueries({ queryKey: ['profile', user!.id] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setReferralApplying(false);
    }
  };

  const isPremium = subscription?.subscribed;
  const userRoles = myPermissions?.roles?.length ? myPermissions.roles : ['user'];
  const { data: creditsData } = useCredits();
  const isScoutPlan = creditsData?.plan_type === 'scout';

  // Scroll to hash anchor (e.g. /account#credits) — re-runs when creditsData arrives
  // because the target card is conditionally rendered and may not exist on first paint.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const id = hash.slice(1);
    const t = setTimeout(() => {
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 80);
    return () => clearTimeout(t);
  }, [hash, creditsData]);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t('account.title')}</h1>
        <p className="text-muted-foreground text-sm">{t('account.subtitle')}</p>
      </div>

      {/* Profile info — full width */}
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
                >
                  {BUILTIN_ROLE_LABELS[role] ?? role}
                </Badge>
              ))}
            </div>
          </div>

          <Separator />

          {/* Civility + first/last name */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
              <Input className="mt-1" value={firstName} onChange={e => setFirstName(e.target.value.replace(/@/g, ''))} placeholder={t('account.first_name_placeholder')} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground">{t('account.last_name')}</label>
              <Input className="mt-1" value={lastName} onChange={e => setLastName(e.target.value.replace(/@/g, ''))} placeholder={t('account.last_name_placeholder')} />
            </div>
          </div>

          {/* Display name (full_name) */}
          <div>
            <label className="text-sm font-medium text-muted-foreground">{t('account.display_name')}</label>
            <Input className="mt-1" value={fullName} onChange={e => setFullName(e.target.value.replace(/@/g, ''))} placeholder={t('auth.full_name_placeholder')} />
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
              <DateInput className="mt-1" value={dob} onChange={setDob} />
            </div>
          </div>

          {/* Address + Country */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                <MapPin className="w-3 h-3" />{t('account.address')}
              </label>
              <Input className="mt-1" value={address} onChange={e => setAddress(e.target.value)} placeholder={t('account.address_placeholder')} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-1">
                <Globe className="w-3 h-3" />{t('account.country')}
              </label>
              <CountrySelect
                value={country}
                onChange={setCountry}
                placeholder={t('account.country_placeholder')}
              />
              <p className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1">
                <Info className="w-3 h-3 shrink-0" />
                {t('account.country_hint')}
              </p>
            </div>
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
              {user?.created_at ? formatDate(user.created_at, dateFormat) : '—'}
            </p>
          </div>

          <Separator />

          {/* Social networks */}
          <div>
            <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">{t('account.social_title')}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>𝕏</span> X (Twitter)
                </label>
                <Input className="mt-1" value={socialX} onChange={e => setSocialX(e.target.value)} placeholder="@username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>📸</span> Instagram
                </label>
                <Input className="mt-1" value={socialInstagram} onChange={e => setSocialInstagram(e.target.value)} placeholder="@username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>💼</span> LinkedIn
                </label>
                <Input className="mt-1" value={socialLinkedin} onChange={e => setSocialLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..." />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>📘</span> Facebook
                </label>
                <Input className="mt-1" value={socialFacebook} onChange={e => setSocialFacebook(e.target.value)} placeholder="https://facebook.com/username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>👻</span> Snapchat
                </label>
                <Input className="mt-1" value={socialSnapchat} onChange={e => setSocialSnapchat(e.target.value)} placeholder="@username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>🎵</span> TikTok
                </label>
                <Input className="mt-1" value={socialTiktok} onChange={e => setSocialTiktok(e.target.value)} placeholder="@username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>✈️</span> Telegram
                </label>
                <Input className="mt-1" value={socialTelegram} onChange={e => setSocialTelegram(e.target.value)} placeholder="@username" />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                  <span>💬</span> WhatsApp
                </label>
                <Input className="mt-1" value={socialWhatsapp} onChange={e => setSocialWhatsapp(e.target.value)} placeholder="+33 6 00 00 00 00" />
              </div>
            </div>
            <div className="mt-3 space-y-1">
              <label className="flex items-center gap-3 cursor-pointer">
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

      {/* ── 2-column grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">

      {/* ── Left column: Email / Password / 2FA ── */}
      <div className="space-y-6">

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
            {user?.has_password === false ? t('account.create_password_title') : t('account.password_title')}
          </CardTitle>
          <CardDescription>
            {user?.oauth_provider === 'google' && !user?.has_password
              ? t('account.create_password_google_desc')
              : t('account.password_desc')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {user?.oauth_provider === 'google' && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-sm text-blue-700 dark:text-blue-400">
              <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>
                {user.has_password ? t('account.google_linked_has_password') : t('account.google_linked_no_password')}
              </span>
            </div>
          )}
          <div>
            <label className="text-sm font-medium text-muted-foreground">
              {user?.has_password === false ? t('account.new_password') : t('account.new_password')}
            </label>
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
            {user?.has_password === false ? t('account.create_password_btn') : t('account.update_password')}
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
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">{t('account.email_2fa_confirm_password')}</label>
                  <Input
                    type="password"
                    value={disableEmail2FAPassword}
                    onChange={e => setDisableEmail2FAPassword(e.target.value)}
                    className="max-w-xs"
                    autoComplete="current-password"
                  />
                </div>
                <Button variant="destructive" size="sm" onClick={handleDisableEmail2FA} disabled={twoFALoading || !disableEmail2FAPassword}>
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

      </div>{/* end left column */}

      {/* ── Right column: Subscription / Credits / Referral ── */}
      <div className="space-y-6">

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
                    {t('account.subscribed_since')} {formatDate(subRow.premium_since, dateFormat)}
                  </p>
                )}
                {subscription?.subscription_end && (
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <CalendarDays className="w-4 h-4" />
                    {t('account.next_renewal')} {formatDate(subscription.subscription_end, dateFormat)}
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
              <div className="flex flex-wrap gap-2">
                {subscription?.source !== 'admin' && (
                  <Button variant="outline" size="sm" onClick={handlePortal} disabled={portalLoading}>
                    {portalLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <ExternalLink className="w-4 h-4 mr-2" />}
                    {t('account.manage_subscription')}
                  </Button>
                )}
                {creditsData?.plan_type !== 'elite' && (
                  <Button variant="outline" size="sm" onClick={() => window.location.href = '/buy-credits'} className="gap-2 text-yellow-600 border-yellow-500/40 hover:bg-yellow-500/10 dark:text-yellow-400">
                    <ShoppingCart className="w-4 h-4" />
                    {t('buy_credits.buy_credits_btn')}
                  </Button>
                )}
              </div>
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

      {/* Credits */}
      {creditsData && (
        <Card id="credits">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Zap className="w-5 h-5 text-yellow-500" />
              {t('credits.title')}
            </CardTitle>
            <CardDescription>{t('credits.account_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">{t('credits.plan_label', { plan: t(`credits.plan_${creditsData.plan_type}`) })}</span>
              {creditsData.quotas.daily === -1 && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 font-medium">{t('credits.unlimited')}</span>
              )}
            </div>
            {creditsData.quotas.daily !== -1 ? (
              <div className="space-y-3">
                {(['daily', 'weekly', 'monthly'] as const).map(period => {
                  const used = creditsData.usage[period];
                  const quota = creditsData.quotas[period];
                  const pct = Math.min(100, Math.round((used / quota) * 100));
                  const hasEarned = (creditsData.usage.earned_total ?? 0) > 0;
                  const { textClass, hex } = creditStyle(pct, hasEarned);
                  return (
                    <div key={period} className="space-y-1">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{t(`credits.${period}`)}</span>
                        <span className={`font-medium tabular-nums ${textClass}`}>{used} / {quota}</span>
                      </div>
                      <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
                        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: hex }} />
                      </div>
                    </div>
                  );
                })}
                <p className="text-xs text-muted-foreground pt-1">{t('credits.reset_info')}</p>
                {(creditsData.usage.earned_total ?? 0) > 0 && (
                  <div className="flex items-center gap-2 text-sm text-yellow-600 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/20 rounded-lg px-3 py-2">
                    <Zap className="w-4 h-4 shrink-0" />
                    <span>{t('credits.earned_bonus_account', { count: creditsData.usage.earned_total })}</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">{t('credits.unlimited_desc')}</p>
            )}
            {/* Scout upsell — highlight Pro plan benefits */}
            {isScoutPlan && (
              <div className="rounded-xl border border-primary/25 bg-primary/5 p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-primary shrink-0" />
                  <p className="text-xs font-semibold text-primary">{t('buy_credits.scout_upsell_title')}</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">{t('buy_credits.scout_upsell_desc')}</p>
                <div className="flex gap-2 flex-wrap">
                  <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs text-primary border-primary/30" onClick={() => window.location.href = '/pricing'}>
                    <Crown className="w-3 h-3" />
                    {t('buy_credits.scout_upsell_cta')}
                    <ArrowRight className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            )}
            {creditsData.plan_type === 'starter' && (
              <Button size="sm" variant="outline" onClick={() => window.location.href = '/pricing'}>
                <Crown className="w-4 h-4 mr-2" />
                {t('credits.upgrade_cta')}
              </Button>
            )}
            {/* Buy credits button — for paid subscribers */}
            {isPremium && creditsData.quotas.daily !== -1 && (
              <Button size="sm" variant="ghost" onClick={() => window.location.href = '/buy-credits'} className="gap-2 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-500/10">
                <ShoppingCart className="w-4 h-4" />
                {t('buy_credits.buy_credits_btn')}
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* Referral code — only shown when not yet affiliated */}
      {profile && !profile.referred_by && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="w-5 h-5 text-primary" />
              {t('account.referral_code_title')}
            </CardTitle>
            <CardDescription>{t('account.referral_code_desc')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-sm font-medium text-muted-foreground">{t('auth.referral_code')}</label>
              <Input
                className="mt-1 font-mono uppercase"
                value={referralCode}
                onChange={e => setReferralCode(e.target.value.toUpperCase())}
                placeholder={t('auth.referral_code_placeholder')}
                maxLength={15}
              />
              <p className="text-xs text-muted-foreground mt-1">{t('auth.referral_code_invalid')}</p>
            </div>
            <Button
              size="sm"
              onClick={handleApplyReferral}
              disabled={referralApplying || !referralCode.trim()}
            >
              {referralApplying ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Users className="w-4 h-4 mr-2" />}
              {t('account.referral_code_apply')}
            </Button>
          </CardContent>
        </Card>
      )}

      </div>{/* end right column */}
      </div>{/* end 2-column grid */}

      {/* RGPD — Data export & account deletion — full width */}
      <Card className="border-destructive/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Shield className="w-5 h-5 text-muted-foreground" />
            {t('account.gdpr_title')}
          </CardTitle>
          <CardDescription>{t('account.gdpr_desc')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* RGPD info */}
          <div className="rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800/40 p-4 space-y-3">
            <div className="flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{t('account.gdpr_info_servers')}</p>
            </div>
            <div className="flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{t('account.gdpr_info_retention')}</p>
            </div>
            <div className="flex items-start gap-2.5">
              <Shield className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">{t('account.gdpr_info_self_service')}</p>
            </div>
          </div>

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
