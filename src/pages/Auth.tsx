import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageSEO from '@/components/PageSEO';
import { supabase } from '@/integrations/supabase/client';
import { useGoogleLogin } from '@react-oauth/google';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import PasswordStrengthIndicator, { validatePassword } from '@/components/PasswordStrengthIndicator';
import logo from '@/assets/logo.png';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';

const ROLES = ['scout', 'recruteur', 'coach', 'agent', 'directeur_sportif', 'analyste', 'autre'] as const;

export default function Auth() {
  const [searchParams] = useSearchParams();
  const isSignup = searchParams.get('signup') === 'true';
  const [mode, setMode] = useState<'login' | 'signup'>(isSignup ? 'signup' : 'login');
  const [referralCode, setReferralCode] = useState(searchParams.get('ref') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [club, setClub] = useState('');
  const [role, setRole] = useState('scout');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptedCGV, setAcceptedCGV] = useState(false);
  const formLoadTime = useRef(Date.now()); // anti-bot timing
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<'totp' | 'email'>('totp');
  const [pending2FAUserId, setPending2FAUserId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();
  const [googleLoading, setGoogleLoading] = useState(false);

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true);
      try {
        const { data, error } = await (supabase.auth as unknown as {
          signInWithGoogle: (token: string) => Promise<{ data: { user: unknown; session: unknown; isNew?: boolean } | null; error: Error | null }>
        }).signInWithGoogle(tokenResponse.access_token);

        if (error || !data?.session) throw error || new Error(t('auth.google_error'));

        if (data.isNew) localStorage.setItem('scouthub_onboarding_pending', 'new');
        navigate(data.isNew ? '/welcome' : '/players');
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : t('auth.google_error');
        toast({ title: t('auth.toast_error'), description: message, variant: 'destructive' });
      } finally {
        setGoogleLoading(false);
      }
    },
    onError: (err) => {
      console.error('[Google OAuth] onError:', err);
      toast({ title: t('auth.toast_error'), description: t('auth.google_error'), variant: 'destructive' });
    },
    onNonOAuthError: (err) => {
      console.error('[Google OAuth] non-OAuth error:', err);
      // popup_closed = user closed the popup voluntarily, not a real error
      if ((err as { type?: string }).type !== 'popup_closed') {
        toast({ title: t('auth.toast_error'), description: t('auth.google_error'), variant: 'destructive' });
      }
    },
  });

  useEffect(() => {
    if (!user) return;
    const pending = localStorage.getItem('scouthub_onboarding_pending');
    if (pending === 'new' || pending === user.id) {
      localStorage.removeItem('scouthub_onboarding_pending');
      navigate('/welcome');
    } else {
      navigate('/players');
    }
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && !validatePassword(password)) {
      toast({ title: t('auth.toast_error'), description: t('auth.pwd_too_weak'), variant: 'destructive' });
      return;
    }
    if (mode === 'signup' && referralCode && !/^SCOUTY-[0-9A-F]{8}$/.test(referralCode)) {
      toast({ title: t('auth.toast_error'), description: t('auth.referral_code_invalid'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      if (mode === 'signup') {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              full_name: fullName.trim(),
              club: club.trim(),
              role,
              referral_code: referralCode,
              _hp: '',  // honeypot — must stay empty; bots fill it
              _t: String(formLoadTime.current),  // form load timestamp
            },
          },
        });
        if (error) throw error;
        // Flag so the useEffect redirects the new user to onboarding
        localStorage.setItem('scouthub_onboarding_pending', 'new');
        toast({ title: t('auth.toast_created'), description: t('auth.toast_created_desc') });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Check if 2FA is required
        const authData = data as { requires2FA?: boolean; method?: 'totp' | 'email'; userId?: string };
        if (authData?.requires2FA) {
          setRequires2FA(true);
          setTwoFAMethod(authData.method || 'totp');
          setPending2FAUserId(authData.userId || '');
          return;
        }
        navigate('/players');
      }
    } catch (error: unknown) {
      const message =
        typeof error === 'string'
          ? error
          : (error instanceof Error ? error.message : 'Une erreur est survenue.');
      toast({ title: t('auth.toast_error'), description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await (supabase.auth as unknown as { validate2FA: (userId: string, code: string) => Promise<{ data: unknown; error: Error | null }> }).validate2FA(pending2FAUserId, otpCode);
      if (error) throw error;
      navigate('/players');
    } catch (error: unknown) {
      const message =
        typeof error === 'string'
          ? error
          : (error instanceof Error ? error.message : 'Code invalide.');
      toast({ title: t('auth.toast_error'), description: message, variant: 'destructive' });
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <PageSEO
        path="/auth"
        title="Connexion & Inscription | Scouty"
        description="Connectez-vous ou créez votre compte Scouty pour accéder à la plateforme de scouting footballistique. Inscription gratuite pour scouts, recruteurs et coachs."
        noIndex
      />

      {/* Language switcher — fixed top-right, never overlaps content */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher variant="ghost" />
      </div>

      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-2">
            <img src={logo} alt="Scouty" className="w-14 h-14 rounded-2xl shadow-lg shadow-primary/25" />
            <span className="text-xl font-black tracking-tight">Scouty</span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          {requires2FA ? (
            <>
              <div className="mb-6">
                <h1 className="text-xl font-bold">{t('auth.2fa_title')}</h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {twoFAMethod === 'email' ? t('auth.2fa_subtitle_email') : t('auth.2fa_subtitle')}
                </p>
              </div>
              <form onSubmit={handle2FASubmit} className="space-y-6">
                <div className="flex justify-center">
                  <InputOTP maxLength={6} value={otpCode} onChange={setOtpCode}>
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
                <Button type="submit" className="w-full font-bold" disabled={loading || otpCode.length < 6}>
                  {loading ? t('auth.loading') : t('auth.2fa_verify_btn')}
                </Button>
                <button
                  type="button"
                  onClick={() => { setRequires2FA(false); setPending2FAUserId(''); setOtpCode(''); }}
                  className="w-full text-sm text-muted-foreground hover:text-primary transition-colors"
                >
                  {t('auth.2fa_back')}
                </button>
              </form>
            </>
          ) : (
          <>
          <div className="mb-6">
            <h1 className="text-xl font-bold">
              {mode === 'login' ? t('auth.signin_title') : t('auth.signup_title')}
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {mode === 'login' ? t('auth.signin_subtitle') : t('auth.signup_subtitle')}
            </p>
          </div>

          {/* Google sign-in */}
          {import.meta.env.VITE_GOOGLE_CLIENT_ID && (
            <>
              <button
                type="button"
                onClick={() => googleLogin()}
                disabled={googleLoading || loading}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 rounded-xl border border-border bg-background hover:bg-muted transition-colors text-sm font-medium disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {googleLoading ? (
                  <svg className="w-4 h-4 animate-spin text-muted-foreground" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 shrink-0" aria-hidden="true">
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                )}
                {t('auth.continue_with_google')}
              </button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">{t('auth.or')}</span>
                </div>
              </div>
            </>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Anti-bot honeypot — hidden from real users, visible to bots */}
            <div aria-hidden="true" style={{ position: 'absolute', left: '-9999px', width: 1, height: 1, overflow: 'hidden', tabIndex: -1 } as React.CSSProperties}>
              <label htmlFor="_hp">Ne pas remplir ce champ</label>
              <input id="_hp" name="_hp" type="text" autoComplete="off" tabIndex={-1} />
            </div>

            {mode === 'signup' && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fullName">{t('auth.full_name')}</Label>
                  <Input
                    id="fullName" type="text" placeholder={t('auth.full_name_placeholder')}
                    value={fullName} onChange={e => setFullName(e.target.value)}
                    required autoComplete="name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="club">{t('auth.club')}</Label>
                    <Input
                      id="club" type="text" placeholder={t('auth.club_placeholder')}
                      value={club} onChange={e => setClub(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="role">{t('auth.role')}</Label>
                    <Select value={role} onValueChange={setRole}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLES.map(r => (
                          <SelectItem key={r} value={r}>{t(`auth.role_${r}`)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="referralCode" className="flex items-center gap-1.5">
                    {t('auth.referral_code')}
                    <span className="text-xs text-muted-foreground font-normal">({t('auth.optional')})</span>
                  </Label>
                  <Input
                    id="referralCode"
                    type="text"
                    placeholder={t('auth.referral_code_placeholder')}
                    value={referralCode}
                    onChange={e => setReferralCode(e.target.value.toUpperCase())}
                    autoComplete="off"
                    spellCheck={false}
                  />
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">{t('auth.email')}</Label>
              <Input
                id="email" type="email" placeholder={t('auth.email_placeholder')}
                value={email} onChange={e => setEmail(e.target.value)}
                required autoComplete="email"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('auth.password')}</Label>
                {mode === 'signup' && (
                  <button
                    type="button"
                    onClick={() => {
                      const lower = 'abcdefghijklmnopqrstuvwxyz';
                      const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
                      const digits = '0123456789';
                      const symbols = '!@#$%&*?+-=_';
                      const all = lower + upper + digits + symbols;
                      const pick = (s: string) => s[crypto.getRandomValues(new Uint32Array(1))[0] % s.length];
                      // Guarantee at least 2 of each category
                      const mandatory = [pick(lower), pick(lower), pick(upper), pick(upper), pick(digits), pick(digits), pick(symbols), pick(symbols)];
                      const rest = Array.from(crypto.getRandomValues(new Uint32Array(12)), v => all[v % all.length]);
                      const combined = [...mandatory, ...rest];
                      // Shuffle
                      for (let i = combined.length - 1; i > 0; i--) {
                        const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
                        [combined[i], combined[j]] = [combined[j], combined[i]];
                      }
                      setPassword(combined.join(''));
                      setShowPassword(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-medium"
                  >
                    <Wand2 className="w-3 h-3" />
                    {t('auth.generate_password')}
                  </button>
                )}
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={mode === 'signup' ? t('auth.password_placeholder_signup') : t('auth.password_placeholder_login')}
                  value={password} onChange={e => setPassword(e.target.value)}
                  required minLength={8}
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {mode === 'signup' && <PasswordStrengthIndicator password={password} />}
            </div>

            {mode === 'login' && (
              <div className="text-right -mt-1">
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary transition-colors">
                  {t('auth.forgot_link')}
                </Link>
              </div>
            )}

            {mode === 'signup' && (
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acceptedCGV}
                  onChange={e => setAcceptedCGV(e.target.checked)}
                  className="mt-1 rounded border-input"
                />
                <span className="text-xs text-muted-foreground leading-relaxed">
                  {t('auth.accept_cgv_prefix')}{' '}
                  <Link to="/cgv" target="_blank" className="text-primary hover:underline">{t('auth.cgv_link')}</Link>
                  {' '}{t('auth.accept_cgv_and')}{' '}
                  <Link to="/cgu" target="_blank" className="text-primary hover:underline">{t('auth.cgu_link')}</Link>.
                </span>
              </label>
            )}

            <Button type="submit" className="w-full font-bold" disabled={loading || (mode === 'signup' && !acceptedCGV)}>
              {loading ? t('auth.loading') : mode === 'login' ? t('auth.signin_btn') : t('auth.signup_btn')}
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-border text-center text-sm text-muted-foreground">
            {mode === 'login' ? (
              <>
                {t('auth.no_account')}{' '}
                <button onClick={() => setMode('signup')} className="text-primary font-medium hover:underline">
                  {t('auth.signup_link')}
                </button>
              </>
            ) : (
              <>
                {t('auth.has_account')}{' '}
                <button onClick={() => setMode('login')} className="text-primary font-medium hover:underline">
                  {t('auth.signin_link')}
                </button>
              </>
            )}
          </div>
          </>
          )}
        </div>
      </div>
    </div>
  );
}
