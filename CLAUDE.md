# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Frontend (Vite :8080) + Backend (Express :3001) in parallel via concurrently
npm run dev:client   # Frontend only
npm run api          # Backend only
npm run build        # Production build
npm run lint         # ESLint
npm run test         # Vitest (single run)
npm run test:watch   # Vitest watch mode
```

Run a single test file: `npx vitest run path/to/file.test.ts`
Check server syntax: `node -c server/index.js`
Check TypeScript (single file): `npx tsc --noEmit src/path/to/file.tsx` — ignore `TS2307` (alias), `TS1343`/`TS2339` (import.meta), `TS17004` (JSX), `TS6133` (unused) as these are tsconfig false positives.

In dev mode, Vite proxies `/api` and `/uploads` to `http://localhost:3001` (see [vite.config.ts](vite.config.ts)).

## Architecture

### Two-process app: Vite client + Express API

The frontend (`src/`) is a Vite/React SPA. The backend (`server/index.js`) is a **single monolithic Express file** (~8000 lines) that owns auth, CRUD, external enrichment (Transfermarkt, TheSportsDB, Wikidata, API-Football), Stripe webhooks, email (nodemailer/Brevo), and file uploads. There is no ORM — raw `mysql2/promise` queries against MySQL or TiDB Cloud.

### Custom Supabase-like client, not real Supabase

[src/integrations/supabase/client.ts](src/integrations/supabase/client.ts) is a **hand-rolled MySQL-backed client** that mimics the Supabase JS API surface the app uses (`supabase.auth.*`, `supabase.from(table).select().eq(...)`, `supabase.functions.invoke(...)`). All calls hit our Express API at `/api/*`. Do **not** add real Supabase features; extend the shim or call `fetch('/api/...')` directly. Session is stored in `localStorage['scouthub_session']`.

The `.from(table as any)` cast is a known pattern because the shim's type inference is limited. After `.delete()` the QueryBuilder's chainable methods are restricted — to delete with conditions like `neq`/`gte`, fetch IDs first with `.select('id')`, then `.in('id', ids).delete()`.

### Database migrations run at startup, not via CLI

[server/index.js](server/index.js) calls `runMigrations()` when the server starts (after the `app.listen` callback; see the bottom of the file, also called alongside `ensureFixtureTables()`). Migrations are idempotent `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN` wrapped in try/catch that ignores "already exists"/`errno 1060`/`1061`. [server/schema.sql](server/schema.sql) is the canonical reference but is **not** executed — keep it in sync manually when adding tables.

Connection is MySQL2 pool from [server/db-config.js](server/db-config.js). Priority: `DATABASE_URL` > `TIDB_*` > `DB_*` env vars.

**`players.club` is `NOT NULL DEFAULT ''`** — never `UPDATE ... SET club = NULL`, use `''` instead.

### Routing & auth

- All routes in [src/App.tsx](src/App.tsx) (lazy-loaded). Protected routes are wrapped in `ProtectedRoute` + `AppLayout`.
- [src/components/layout/ProtectedRoute.tsx](src/components/layout/ProtectedRoute.tsx) maps URL paths to permission keys via `ROUTE_TO_PAGE_KEY`. Admins bypass all checks. For non-admins, `permsData.permissions[pageKey] === false` shows an access-denied screen.
- [src/components/layout/AppSidebar.tsx](src/components/layout/AppSidebar.tsx) calls `canView(pageKey)` on each nav item so users only see pages they can access.

### Granular permission system

Permissions are nested: `{ role: { page_key: { action: boolean } } }` stored in `page_permissions` table (unique on `role, page_key, action`). The full action catalog is the `PAGE_ACTIONS` constant in [src/pages/AdminRoles.tsx](src/pages/AdminRoles.tsx) and [src/pages/Admin.tsx](src/pages/Admin.tsx) — these **must stay in sync** across both files and with the server-side handling in `/api/admin/page-permissions` and `/api/my-permissions`.

Multi-role merging (in `/api/my-permissions`): any role granting an action wins (OR logic). The server also maps `page_key` alone (backward-compat) to the `view` action.

Users can hold multiple roles simultaneously. Role management UI is at `/admin/roles` ([AdminRoles.tsx](src/pages/AdminRoles.tsx)), accessed from a header button on `/admin`, not as a tab.

### Image uploads go to MySQL, not disk or Vercel Blob

[server/index.js](server/index.js) has `saveImageToDb()` and `GET /api/images/:id` that store/serve uploaded profile photos and org logos as `LONGBLOB` in the `uploaded_images` table. This works identically in local dev and on Vercel (where `/tmp` is ephemeral). Use this for new image upload endpoints. The older `saveUploadedFile()` + `@vercel/blob` path still exists for non-image uploads.

### Email (Brevo SMTP)

`sendEmail()` in [server/index.js](server/index.js) uses nodemailer with pooled connections, retry on transient failure, and a `getFromAddress()` that formats `"Scouty <noreply@scouty.app>"`. **The `SMTP_FROM` must be a verified sender in Brevo** or emails queue but silently never deliver. Admin can trigger `POST /api/admin/test-email` to verify.

### External enrichment & clubs

- **Transfermarkt**: HTML scraping via `fetch` + regex parsing (see `parseTmSearchHtml`, `/api/club-tm-search`, `/api/club-tm/:id`). `TM_HEADERS` forges a browser UA.
- **TheSportsDB**: proxied via the `thesportsdb-proxy` function (`POST /api/functions/thesportsdb-proxy`) to avoid CORS. 429 retry with backoff.
- **API-Football**: `apiFootballFetch()` caches in `api_football_cache` table (TTL in minutes). Cleanup triggers on 10% of calls.
- Club name resolution: [src/lib/thesportsdb.ts](src/lib/thesportsdb.ts) has `CLUB_NAME_MAP` (aliases) and `resolveClubName()`. TheSportsDB uses non-standard names (e.g. "Paris SG" not "Paris Saint-Germain", "St Etienne" not "AS Saint-Étienne") so `buildSearchTerms()` in [ClubProfile.tsx](src/pages/ClubProfile.tsx) generates variants (prefix-stripped, "Saint"→"St", accent-stripped, aliases from `CLUB_NAME_MAP`).
- Deleting a club (`DELETE /api/admin/club/:clubName`) must clear the `club` field on players (set to `''` not NULL, accent-insensitive via `COLLATE utf8mb4_general_ci`), and also clean `club_directory`, `club_logos`, `followed_clubs`, `api_football_cache`, `player_org_shares`.

### i18n

Three locales in [src/i18n/locales/](src/i18n/locales/): `en.ts`, `fr.ts`, `es.ts`. When adding a key, update **all three** files. Server-side user-facing messages are in French (this is a French-first product).

### Memory system

Per-project memory lives in `C:\Users\infor\.claude\projects\c--Users-infor-scouting-hub\memory\` with a `MEMORY.md` index. Build it up over time for persistent context across sessions (see the auto-memory instructions in the system prompt).

## Known gotchas

- Don't call real Supabase APIs — the client is a shim.
- `setLikedPosts`/similar state updates must go in `useEffect` reacting to query data, **not** inside `queryFn` — doing so inside `queryFn` causes stale-state bugs on refetch (see [src/pages/Community.tsx](src/pages/Community.tsx)).
- When deleting an organization (`DELETE /api/organizations/:id`), FK `ON DELETE CASCADE` handles `organization_members`, `player_org_shares`, `match_assignments`, `squad_players` — but the `players.club` field is string-based and must be explicitly cleared.
- `/public/*` paths in HTML/JS are served at the root (`/favicon.svg`, not `/public/favicon.svg`) — Vite warns about this.
- `@vercel/blob` requires `BLOB_READ_WRITE_TOKEN` or uploads silently land in ephemeral `/tmp`. Prefer the DB-backed `saveImageToDb()` path.
- `PAGE_ACTIONS` constant exists in two files ([AdminRoles.tsx](src/pages/AdminRoles.tsx) and [Admin.tsx](src/pages/Admin.tsx)) — keep them identical.
