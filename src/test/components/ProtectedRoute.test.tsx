/**
 * ProtectedRoute tests
 * Covers: loading state, unauthenticated redirect, permission denial, admin bypass
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, Outlet } from 'react-router-dom';
import ProtectedRoute from '@/components/layout/ProtectedRoute';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn(),
}));
vi.mock('@/hooks/use-admin', () => ({
  useMyPermissions: vi.fn(),
  useIsAdmin: vi.fn(),
}));
vi.mock('@/assets/logo.png', () => ({ default: 'logo.png' }));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

import { useAuth } from '@/contexts/AuthContext';
import { useMyPermissions, useIsAdmin } from '@/hooks/use-admin';

function renderProtected(path = '/players') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth" element={<div>Page Auth</div>} />
        <Route element={<ProtectedRoute />}>
          <Route path="/players" element={<div>Page Joueurs</div>} />
          <Route path="/admin" element={<div>Page Admin</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ProtectedRoute', () => {
  it('affiche le spinner pendant le chargement auth', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: true } as never);
    vi.mocked(useMyPermissions).mockReturnValue({ data: null, isLoading: false } as never);
    vi.mocked(useIsAdmin).mockReturnValue({ data: false } as never);
    renderProtected();
    // Le spinner ne doit pas afficher le contenu protégé
    expect(screen.queryByText('Page Joueurs')).not.toBeInTheDocument();
  });

  it('redirige vers /auth quand l\'utilisateur n\'est pas connecté', () => {
    vi.mocked(useAuth).mockReturnValue({ user: null, loading: false } as never);
    vi.mocked(useMyPermissions).mockReturnValue({ data: null, isLoading: false } as never);
    vi.mocked(useIsAdmin).mockReturnValue({ data: false } as never);
    renderProtected();
    expect(screen.getByText('Page Auth')).toBeInTheDocument();
    expect(screen.queryByText('Page Joueurs')).not.toBeInTheDocument();
  });

  it('affiche le contenu si l\'utilisateur est connecté avec les permissions', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', email: 'test@test.com' }, loading: false,
    } as never);
    vi.mocked(useMyPermissions).mockReturnValue({
      data: { permissions: { players: true } }, isLoading: false,
    } as never);
    vi.mocked(useIsAdmin).mockReturnValue({ data: false } as never);
    renderProtected('/players');
    expect(screen.getByText('Page Joueurs')).toBeInTheDocument();
  });

  it('bloque une page si la permission est explicitement false', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', email: 'test@test.com' }, loading: false,
    } as never);
    vi.mocked(useMyPermissions).mockReturnValue({
      data: { permissions: { players: false } }, isLoading: false,
    } as never);
    vi.mocked(useIsAdmin).mockReturnValue({ data: false } as never);
    renderProtected('/players');
    expect(screen.queryByText('Page Joueurs')).not.toBeInTheDocument();
    expect(screen.getByText('roles.access_denied')).toBeInTheDocument();
  });

  it('laisse passer l\'admin même sans permission explicite', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', email: 'admin@test.com' }, loading: false,
    } as never);
    vi.mocked(useMyPermissions).mockReturnValue({
      data: { permissions: { players: false } }, isLoading: false,
    } as never);
    vi.mocked(useIsAdmin).mockReturnValue({ data: true } as never);
    renderProtected('/players');
    expect(screen.getByText('Page Joueurs')).toBeInTheDocument();
  });

  it('ne bloque pas sur permsLoading (ne pas attendre les permissions indéfiniment)', () => {
    vi.mocked(useAuth).mockReturnValue({
      user: { id: '1', email: 'test@test.com' }, loading: false,
    } as never);
    vi.mocked(useMyPermissions).mockReturnValue({
      data: null, isLoading: true, // permissions still loading
    } as never);
    vi.mocked(useIsAdmin).mockReturnValue({ data: false } as never);
    renderProtected('/players');
    // Page doit s'afficher même si permsLoading = true (depuis notre fix)
    expect(screen.getByText('Page Joueurs')).toBeInTheDocument();
  });
});
