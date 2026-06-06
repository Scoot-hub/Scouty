import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGoogleLogin } from '@react-oauth/google';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

// This component encapsulates the `useGoogleLogin` hook so it is ONLY ever
// mounted (and therefore only ever calls the hook) when VITE_GOOGLE_CLIENT_ID
// is set — i.e. when <GoogleOAuthProvider> actually wraps the tree in main.tsx.
// Calling useGoogleLogin without that provider throws
// "Google OAuth components must be used within GoogleOAuthProvider".
export default function GoogleSignInButton({ disabled }: { disabled?: boolean }) {
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

        if (error) {
          const banErr = error as Error & { banned?: boolean; ban_reason?: string | null; ban_expires_at?: string | null };
          if (banErr.banned) {
            localStorage.setItem('scouthub_ban_info', JSON.stringify({ reason: banErr.ban_reason, expiresAt: banErr.ban_expires_at }));
            navigate('/banned');
            return;
          }
          throw error;
        }
        if (!data?.session) throw new Error(t('auth.google_error'));

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

  return (
    <>
      <button
        type="button"
        onClick={() => googleLogin()}
        disabled={googleLoading || disabled}
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

      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-4 text-muted-foreground tracking-widest font-medium">{t('auth.or')}</span>
        </div>
      </div>
    </>
  );
}
