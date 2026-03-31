import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import { Eye, EyeOff } from 'lucide-react';
import PasswordStrengthIndicator, { validatePassword } from '@/components/PasswordStrengthIndicator';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast({ title: t('auth.toast_error'), description: t('auth.reset_mismatch'), variant: 'destructive' });
      return;
    }
    if (!validatePassword(password)) {
      toast({ title: t('auth.toast_error'), description: t('auth.pwd_too_weak'), variant: 'destructive' });
      return;
    }
    setLoading(true);
    try {
      const { error } = await (supabase.auth as any).resetPasswordWithToken(token!, password);
      if (error) throw error;
      setDone(true);
      setTimeout(() => navigate('/players'), 2500);
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

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-2">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl shadow-lg shadow-primary/25">
              ⚽
            </div>
            <span className="text-xl font-black tracking-tight">ScoutHub</span>
          </Link>
        </div>

        {/* Card */}
        <div className="bg-card border border-border rounded-2xl p-8 shadow-xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-xl font-bold">{t('auth.reset_title')}</h1>
              <p className="text-sm text-muted-foreground mt-1">{t('auth.reset_subtitle')}</p>
            </div>
            <LanguageSwitcher variant="ghost" />
          </div>

          {done ? (
            <div className="text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-purple-500/10 flex items-center justify-center mx-auto">
                <svg className="w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p className="text-sm font-medium">{t('auth.reset_success')}</p>
              <p className="text-xs text-muted-foreground">{t('auth.reset_redirecting')}</p>
            </div>
          ) : !token ? (
            <div className="text-center space-y-3">
              <p className="text-sm text-muted-foreground">{t('auth.reset_invalid_link')}</p>
              <Link to="/forgot-password" className="text-sm text-primary font-medium hover:underline">
                {t('auth.forgot_btn')}
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">{t('auth.reset_new_password')}</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder={t('auth.password_placeholder_signup')}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
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
                <PasswordStrengthIndicator password={password} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">{t('auth.reset_confirm_password')}</Label>
                <Input
                  id="confirm"
                  type={showPassword ? 'text' : 'password'}
                  placeholder={t('auth.password_placeholder_signup')}
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  required
                  minLength={8}
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" className="w-full font-bold" disabled={loading}>
                {loading ? t('auth.loading') : t('auth.reset_btn')}
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
