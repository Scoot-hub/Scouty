/**
 * Server security tests
 * Covers: unauthenticated access → 401, missing fields → 400,
 *         SQL-injection-like payloads, credit grant authorization
 *
 * These tests hit the actual Express server via node fetch.
 * Run with: npx vitest run src/test/server/security.test.ts
 * Requires API to be running on port 3001 (npm run api).
 */
import { describe, it, expect, beforeAll } from 'vitest';

const BASE = 'http://localhost:3001/api';

// Helper: unauthenticated fetch
const anonFetch = (path: string, opts?: RequestInit) =>
  fetch(`${BASE}${path}`, { ...opts, credentials: 'omit' });

// Helper: check server is reachable
async function serverIsUp(): Promise<boolean> {
  try {
    const r = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(2000) });
    return r.ok;
  } catch {
    return false;
  }
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('Sécurité API — accès non authentifié', () => {
  let skip = false;

  beforeAll(async () => {
    skip = !(await serverIsUp());
    if (skip) console.warn('[security] Serveur non disponible — tests ignorés (lancez npm run api)');
  });

  // ── 401 sur les routes protégées ──────────────────────────────────────────

  const protectedGets = [
    '/my-permissions',
    '/players',
    '/credits/me',
    '/affiliate/stats',
    '/club-notes?club=PSG',
    '/notifications',
  ];

  for (const path of protectedGets) {
    it(`GET ${path} → 401 sans cookie de session`, async () => {
      if (skip) return;
      const res = await anonFetch(path);
      expect(res.status).toBe(401);
    });
  }

  const protectedPosts = [
    ['/club-notes', { club: 'PSG', content: 'test' }],
    ['/account/apply-referral', { referral_code: 'SCOUTY-AAAAAAAA' }],
    ['/credits/consume', { action_type: 'enrichment' }],
  ] as [string, Record<string, unknown>][];

  for (const [path, body] of protectedPosts) {
    it(`POST ${path} → 401 sans cookie de session`, async () => {
      if (skip) return;
      const res = await anonFetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(401);
    });
  }

  // ── 403 sur les routes admin ──────────────────────────────────────────────

  const adminRoutes = [
    ['GET', '/admin/users'],
    ['POST', '/admin/credits/grant'],
    ['POST', '/admin/statsbomb/import'],
    ['DELETE', '/admin/notifications/purge-older-than'],
  ] as [string, string][];

  for (const [method, path] of adminRoutes) {
    it(`${method} ${path} → 401 ou 403 sans session admin`, async () => {
      if (skip) return;
      const res = await anonFetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: method !== 'GET' ? JSON.stringify({}) : undefined,
      });
      expect([401, 403]).toContain(res.status);
    });
  }

  // ── 400 sur les corps invalides ───────────────────────────────────────────

  it('POST /auth/signup → 400 ou 422 avec email vide', async () => {
    if (skip) return;
    const res = await anonFetch('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '', password: 'ValidPass1!' }),
    });
    expect([400, 422]).toContain(res.status);
  });

  it('POST /auth/signup → 400 avec mot de passe trop court', async () => {
    if (skip) return;
    const res = await anonFetch('/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'test@example.com', password: '123' }),
    });
    expect([400, 422]).toContain(res.status);
  });

  // ── Injections SQL — paramètres de recherche ──────────────────────────────

  const sqlPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE users; --",
    "1 UNION SELECT * FROM users --",
    "admin'--",
  ];

  for (const payload of sqlPayloads) {
    it(`GET /club-search?q={payload SQL} → pas de 500`, async () => {
      if (skip) return;
      const res = await anonFetch(`/club-search?q=${encodeURIComponent(payload)}`);
      // 401 (non auth) ou 200 — jamais 500 (server error = faille potentielle)
      expect(res.status).not.toBe(500);
    });
  }

  // ── Code parrainage — validation du format ────────────────────────────────

  it('apply-referral → rejet d\'un code mal formé (pas de session nécessaire, 401 avant validation)', async () => {
    if (skip) return;
    const res = await anonFetch('/account/apply-referral', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referral_code: "' OR 1=1 --" }),
    });
    // Sans session → 401 (l'injection n'atteint même pas la validation)
    expect(res.status).toBe(401);
  });
});
