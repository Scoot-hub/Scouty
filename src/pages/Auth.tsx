import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import PageSEO from '@/components/PageSEO';
import { supabase } from '@/integrations/supabase/client';
import GoogleSignInButton from '@/components/GoogleSignInButton';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Eye, EyeOff, Wand2 } from 'lucide-react';
import LanguageSwitcher, { getStoredCountry } from '@/components/LanguageSwitcher';
import type { Country } from '@/lib/countries';
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
  const [country, setCountry] = useState<string>(() => getStoredCountry()?.fr ?? '');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptedCGV, setAcceptedCGV] = useState(false);
  const formLoadTime = useRef(Date.now()); // anti-bot timing
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<'totp' | 'email'>('totp');
  const [pending2FAChallenge, setPending2FAChallenge] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

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
              country: country.trim(),
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
        if (error) {
          const banErr = error as Error & { banned?: boolean; ban_reason?: string | null; ban_expires_at?: string | null };
          if (banErr.banned) {
            localStorage.setItem('scouthub_ban_info', JSON.stringify({ reason: banErr.ban_reason, expiresAt: banErr.ban_expires_at }));
            navigate('/banned');
            return;
          }
          throw error;
        }
        // Check if 2FA is required
        const authData = data as { requires2FA?: boolean; method?: 'totp' | 'email'; challengeToken?: string };
        if (authData?.requires2FA) {
          setRequires2FA(true);
          setTwoFAMethod(authData.method || 'totp');
          setPending2FAChallenge(authData.challengeToken || '');
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
      const { data, error } = await (supabase.auth as unknown as { validate2FA: (challengeToken: string, code: string) => Promise<{ data: unknown; error: Error | null }> }).validate2FA(pending2FAChallenge, otpCode);
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
    <div className="min-h-screen bg-background flex items-center justify-center px-4 relative overflow-hidden">
      <PageSEO
        path="/auth"
        title="Connexion & Inscription | Scouty"
        description="Connectez-vous ou créez votre compte Scouty pour accéder à la plateforme de scouting footballistique. Inscription gratuite pour scouts, recruteurs et coachs."
        noIndex
      />

      {/* ── Background ambient orbs ─────────────────────────────────────── */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
        <div className="absolute w-[600px] h-[600px] rounded-full blur-[140px] opacity-40"
          style={{ background: 'rgba(99,102,241,0.12)', top: '-180px', left: '-160px', animation: 'auth-orb-a 14s ease-in-out infinite' }} />
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-35"
          style={{ background: 'rgba(139,92,246,0.10)', bottom: '-120px', right: '-140px', animation: 'auth-orb-b 18s ease-in-out infinite' }} />
        <div className="absolute w-[300px] h-[300px] rounded-full blur-[90px] opacity-25"
          style={{ background: 'rgba(14,165,233,0.09)', top: '40%', right: '5%', animation: 'auth-orb-c 11s ease-in-out infinite' }} />
        <div className="absolute w-[200px] h-[200px] rounded-full blur-[70px] opacity-20"
          style={{ background: 'rgba(99,102,241,0.15)', bottom: '20%', left: '8%', animation: 'auth-orb-d 9s ease-in-out infinite' }} />
      </div>

      {/* Country/language switcher — fixed top-right */}
      <div className="fixed top-4 right-4 z-50">
        <LanguageSwitcher
          variant="ghost"
          onCountryChange={(c: Country) => setCountry(c.fr)}
        />
      </div>

      <div className="w-full max-w-sm relative z-10">
        {/* Logo — scintillement identique au PageLoader */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-3">
            <div className="relative">
              <div className="absolute inset-0 rounded-2xl"
                style={{ animation: 'auth-ring 2.4s ease-out infinite' }} />
              <img
                src={logo}
                alt="Scouty"
                className="w-16 h-16 rounded-2xl shadow-xl shadow-primary/30 relative z-10"
                style={{ animation: 'auth-logo 2.4s ease-in-out infinite' }}
              />
            </div>
            <span className="text-2xl font-black tracking-tight"
              style={{ animation: 'auth-name 2.4s ease-in-out infinite' }}>
              Scouty
            </span>
          </Link>
        </div>

        {/* Keyframes */}
        <style>{`
          @keyframes auth-ring {
            0%   { box-shadow: 0 0 0 0 rgba(99,102,241,.40); }
            70%  { box-shadow: 0 0 0 16px rgba(99,102,241,0); }
            100% { box-shadow: 0 0 0 0 rgba(99,102,241,0); }
          }
          @keyframes auth-logo {
            0%, 100% { transform: scale(1);    filter: drop-shadow(0 0 0px rgba(99,102,241,0)); }
            50%       { transform: scale(1.05); filter: drop-shadow(0 0 14px rgba(99,102,241,.50)); }
          }
          @keyframes auth-name {
            0%, 100% { opacity: 0.7; }
            50%       { opacity: 1; }
          }
          @keyframes auth-orb-a {
            0%,100% { transform: translate(0,0) scale(1); }
            33%     { transform: translate(50px,40px) scale(1.06); }
            66%     { transform: translate(-25px,60px) scale(.96); }
          }
          @keyframes auth-orb-b {
            0%,100% { transform: translate(0,0) scale(1); }
            40%     { transform: translate(-60px,-35px) scale(1.08); }
            75%     { transform: translate(30px,-70px) scale(.94); }
          }
          @keyframes auth-orb-c {
            0%,100% { transform: translate(0,0) scale(1); }
            50%     { transform: translate(-35px,50px) scale(1.12); }
          }
          @keyframes auth-orb-d {
            0%,100% { transform: translate(0,0) scale(1); }
            50%     { transform: translate(40px,-30px) scale(1.15); }
          }
        `}</style>

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
                  onClick={() => { setRequires2FA(false); setPending2FAChallenge(''); setOtpCode(''); }}
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

          {/* Google sign-in — only mounted when the provider is configured (see main.tsx) */}
          {import.meta.env.VITE_GOOGLE_CLIENT_ID && <GoogleSignInButton disabled={loading} />}

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
                  <Label htmlFor="country">{t('auth.country')}</Label>
                  <div className="relative">
                    <Input
                      id="country"
                      type="text"
                      placeholder={t('auth.country_placeholder')}
                      value={country}
                      onChange={e => setCountry(e.target.value)}
                      autoComplete="country-name"
                    />
                    {country && (
                      <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                        {t('auth.country_hint')}
                      </p>
                    )}
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
