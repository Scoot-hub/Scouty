/**
 * Regression test for: "Google OAuth components must be used within GoogleOAuthProvider"
 *
 * Bug: Auth.tsx called useGoogleLogin() unconditionally at the top of the component,
 * but main.tsx only mounts <GoogleOAuthProvider> when VITE_GOOGLE_CLIENT_ID is set.
 * With the env var empty, opening /auth ran the hook with no provider above it → crash.
 *
 * Fix: the hook now lives in <GoogleSignInButton>, which Auth only MOUNTS when the
 * env var is set — i.e. only when the provider exists. So the hook can never run
 * outside the provider.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { GoogleOAuthProvider } from '@react-oauth/google';
import Auth from '@/pages/Auth';
import GoogleSignInButton from '@/components/GoogleSignInButton';

// ── Mocks: stub out Auth's heavy deps so we can render it in isolation ──────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: { auth: {} } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/PageSEO', () => ({ default: () => null }));
vi.mock('@/components/LanguageSwitcher', () => ({
  default: () => null,
  getStoredCountry: () => null,
}));
vi.mock('@/components/PasswordStrengthIndicator', () => ({
  default: () => null,
  validatePassword: () => true,
}));
vi.mock('@/assets/logo.png', () => ({ default: 'logo.png' }));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Auth — Google OAuth provider safety', () => {
  it('renders WITHOUT crashing when VITE_GOOGLE_CLIENT_ID is unset and no provider wraps it (the original bug condition)', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', '');

    // Before the fix this threw "Google OAuth components must be used within
    // GoogleOAuthProvider". After the fix the hook is never invoked here.
    expect(() =>
      render(
        <MemoryRouter initialEntries={['/auth']}>
          <Auth />
        </MemoryRouter>,
      ),
    ).not.toThrow();

    // The page renders and the Google button is absent (env not configured).
    expect(screen.getByText('auth.signin_title')).toBeInTheDocument();
    expect(screen.queryByText('auth.continue_with_google')).not.toBeInTheDocument();
  });

  it('shows the Google button (and does not crash) when configured and wrapped in the provider', () => {
    vi.stubEnv('VITE_GOOGLE_CLIENT_ID', 'test-client-id.apps.googleusercontent.com');

    render(
      <GoogleOAuthProvider clientId="test-client-id.apps.googleusercontent.com">
        <MemoryRouter initialEntries={['/auth']}>
          <Auth />
        </MemoryRouter>
      </GoogleOAuthProvider>,
    );

    expect(screen.getByText('auth.continue_with_google')).toBeInTheDocument();
  });

  it('proves the test has teeth: the button DOES throw the reported error if mounted without a provider', () => {
    // This is what the old Auth.tsx did (called the hook unconditionally). It
    // confirms our other tests would catch a regression — and that the exact
    // error string from the bug report is reproduced.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    // Wrapped in a Router (so useNavigate is satisfied) but deliberately NOT in
    // a GoogleOAuthProvider — so the failure is specifically the Google one.
    expect(() =>
      render(
        <MemoryRouter>
          <GoogleSignInButton />
        </MemoryRouter>,
      ),
    ).toThrow(/Google OAuth components must be used within GoogleOAuthProvider/);
    spy.mockRestore();
  });
});
