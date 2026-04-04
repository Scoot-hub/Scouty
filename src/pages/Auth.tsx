import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [club, setClub] = useState('');
  const [role, setRole] = useState('scout');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [acceptedCGV, setAcceptedCGV] = useState(false);
  const [requires2FA, setRequires2FA] = useState(false);
  const [twoFAMethod, setTwoFAMethod] = useState<'totp' | 'email'>('totp');
  const [pending2FAUserId, setPending2FAUserId] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const { user } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    if (user) navigate('/players');
  }, [user, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'signup' && !validatePassword(password)) {
      toast({ title: t('auth.toast_error'), description: t('auth.pwd_too_weak'), variant: 'destructive' });
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
            },
          },
        });
        if (error) throw error;

        toast({ title: t('auth.toast_created'), description: t('auth.toast_created_desc') });
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        // Check if 2FA is required
        if ((data as any)?.requires2FA) {
          setRequires2FA(true);
          setTwoFAMethod((data as any).method || 'totp');
          setPending2FAUserId((data as any).userId);
          return;
        }
        navigate('/players');
      }
    } catch (error: any) {
      const message =
        typeof error === 'string'
          ? error
          : (error && typeof error.message === 'string' && error.message) || 'Une erreur est survenue.';
      toast({ title: t('auth.toast_error'), description: message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handle2FASubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await (supabase.auth as any).validate2FA(pending2FAUserId, otpCode);
      if (error) throw error;
      navigate('/players');
    } catch (error: any) {
      const message =
        typeof error === 'string'
          ? error
          : (error && typeof error.message === 'string' && error.message) || 'Code invalide.';
      toast({ title: t('auth.toast_error'), description: message, variant: 'destructive' });
      setOtpCode('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
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
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h1 className="text-xl font-bold">{t('auth.2fa_title')}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {twoFAMethod === 'email' ? t('auth.2fa_subtitle_email') : t('auth.2fa_subtitle')}
                  </p>
                </div>
                <LanguageSwitcher variant="ghost" />
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
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold">
                {mode === 'login' ? t('auth.signin_title') : t('auth.signup_title')}
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                {mode === 'login' ? t('auth.signin_subtitle') : t('auth.signup_subtitle')}
              </p>
            </div>
            <LanguageSwitcher variant="ghost" />
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
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
