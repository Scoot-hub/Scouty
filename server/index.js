import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { createDbPoolConfig } from "./db-config.js";
const require = createRequire(import.meta.url);
import { v4 as uuidv4 } from "uuid";
let nodemailer = null;
try {
  nodemailer = (await import("nodemailer")).default;
} catch {
  console.warn("[warn] nodemailer not installed – email sending disabled. Run: npm install");
}

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const UPLOAD_DIR = path.join(ROOT_DIR, "public", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const app = express();
const port = Number(process.env.API_PORT || 3001);
const jwtSecret = process.env.API_JWT_SECRET || "change-this-secret";

const pool = mysql.createPool(createDbPoolConfig());

app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "5mb" }));
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({ dest: UPLOAD_DIR });

const ALLOWED_TABLES = {
  profiles: ["id", "user_id", "full_name", "club", "role", "created_at", "updated_at"],
  players: [
    "id", "name", "photo_url", "generation", "nationality", "foot", "club", "league", "zone", "position", "position_secondaire", "role",
    "current_level", "potential", "general_opinion", "contract_end", "notes", "ts_report_published", "date_of_birth", "market_value",
    "transfermarkt_id", "external_data", "external_data_fetched_at", "shared_with_org", "has_news", "task", "user_id", "created_at", "updated_at",
  ],
  reports: ["id", "player_id", "report_date", "title", "opinion", "drive_link", "file_url", "user_id", "created_at"],
  custom_fields: ["id", "user_id", "field_name", "field_type", "field_options", "display_order", "created_at"],
  custom_field_values: ["id", "custom_field_id", "player_id", "value", "user_id", "created_at"],
  watchlists: ["id", "user_id", "name", "description", "created_at", "updated_at"],
  watchlist_players: ["id", "user_id", "watchlist_id", "player_id", "added_at"],
  shadow_teams: ["id", "user_id", "name", "formation", "logo_url", "created_at", "updated_at"],
  shadow_team_players: ["id", "user_id", "shadow_team_id", "player_id", "position_slot", "rank", "added_at"],
  user_subscriptions: ["id", "user_id", "is_premium", "premium_since", "created_at", "updated_at"],
  user_roles: ["id", "user_id", "role", "created_at"],
  fixtures: ["id", "user_id", "home_team", "away_team", "match_date", "match_time", "competition", "venue", "score_home", "score_away", "notes", "is_favorite", "source", "api_fixture_id", "api_league_id", "created_at", "updated_at"],
  user_followed_leagues: ["id", "user_id", "league_id", "league_name", "league_country", "league_logo", "season", "created_at"],
  contacts: ["id", "user_id", "first_name", "last_name", "photo_url", "organization", "role_title", "phone", "email", "linkedin_url", "notes", "created_at", "updated_at"],
  organizations: ["id", "name", "type", "invite_code", "created_by", "created_at", "updated_at"],
  organization_members: ["id", "organization_id", "user_id", "role", "joined_at"],
  player_org_shares: ["id", "player_id", "organization_id", "user_id", "created_at"],
  match_assignments: ["id", "user_id", "organization_id", "assigned_to", "assigned_by", "home_team", "away_team", "match_date", "match_time", "competition", "venue", "home_badge", "away_badge", "notes", "status", "created_at", "updated_at"],
};

const USER_SCOPED_TABLES = new Set([
  "profiles",
  "players",
  "reports",
  "custom_fields",
  "custom_field_values",
  "watchlists",
  "watchlist_players",
  "shadow_teams",
  "shadow_team_players",
  "contacts",
  "fixtures",
  "user_followed_leagues",
  "user_subscriptions",
  "user_roles",
]);

// ── API-Football (RapidAPI) cached fetcher ──────────────────────────
async function apiFootballFetch(endpoint, params = {}, ttlMinutes = 240) {
  const rapidApiKey = process.env.RAPIDAPI_KEY;
  if (!rapidApiKey) throw new Error("RAPIDAPI_KEY not configured");

  const sorted = Object.entries(params).sort(([a], [b]) => a.localeCompare(b));
  const cacheKey = `${endpoint}:${sorted.map(([k, v]) => `${k}=${v}`).join(":")}`;

  // Check cache (graceful — skip if table doesn't exist yet)
  try {
    const [cached] = await pool.query(
      "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
      [cacheKey]
    );
    if (cached.length > 0) {
      const json = cached[0].response_json;
      return typeof json === "string" ? JSON.parse(json) : json;
    }
  } catch { /* table may not exist yet */ }

  // Call API-Football
  const qs = new URLSearchParams(params).toString();
  const url = `https://api-football-v1.p.rapidapi.com/v3/${endpoint}?${qs}`;
  const resp = await fetch(url, {
    headers: {
      "x-rapidapi-key": rapidApiKey,
      "x-rapidapi-host": "api-football-v1.p.rapidapi.com",
    },
  });
  if (!resp.ok) throw new Error(`API-Football ${resp.status}: ${resp.statusText}`);
  const data = await resp.json();

  // Store in cache (graceful)
  try {
    await pool.query(
      `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
       VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))
       ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
      [cacheKey, JSON.stringify(data), ttlMinutes, ttlMinutes]
    );
    if (Math.random() < 0.1) {
      pool.query("DELETE FROM api_football_cache WHERE expires_at < NOW()").catch(() => {});
    }
  } catch { /* table may not exist yet */ }

  return data;
}

// ── Rate limiting for auth endpoints ──────────────────────────────────────
const authAttempts = new Map(); // key: IP → { count, resetAt }
const RATE_LIMIT_WINDOW = 15 * 60 * 1000; // 15 minutes
const RATE_LIMIT_MAX = 10; // max attempts per window

function rateLimitAuth(req, res, next) {
  const ip = req.ip || req.connection?.remoteAddress || "unknown";
  const now = Date.now();
  let entry = authAttempts.get(ip);

  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    authAttempts.set(ip, entry);
  }

  entry.count++;
  if (entry.count > RATE_LIMIT_MAX) {
    return res.status(429).json({ error: "Trop de tentatives. Réessayez dans quelques minutes." });
  }
  next();
}

// Cleanup rate limit map every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of authAttempts) {
    if (now > entry.resetAt) authAttempts.delete(ip);
  }
}, 30 * 60 * 1000);

// ── Password strength validation ──────────────────────────────────────────
function validatePasswordStrength(password) {
  const pwd = String(password || "");
  if (pwd.length < 8) return "Le mot de passe doit contenir au moins 8 caractères.";
  if (!/[a-z]/.test(pwd)) return "Le mot de passe doit contenir au moins une minuscule.";
  if (!/[A-Z]/.test(pwd)) return "Le mot de passe doit contenir au moins une majuscule.";
  if (!/[0-9]/.test(pwd)) return "Le mot de passe doit contenir au moins un chiffre.";
  if (!/[^a-zA-Z0-9]/.test(pwd)) return "Le mot de passe doit contenir au moins un symbole.";
  return null;
}

// ── 2FA TOTP helpers ──────────────────────────────────────────────────────
let speakeasy = null;
let QRCode = null;
try {
  speakeasy = (await import("speakeasy")).default;
  QRCode = (await import("qrcode")).default;
} catch {
  console.warn("[warn] speakeasy/qrcode not installed – 2FA disabled. Run: npm install speakeasy qrcode");
}

function getCurrentSeason() {
  const now = new Date();
  return now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
}

function createSessionToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: "30d" });
}

function normalizeUserRow(userRow) {
  return {
    id: userRow.id,
    email: userRow.email,
    created_at: userRow.created_at,
    updated_at: userRow.updated_at,
    last_sign_in_at: userRow.last_sign_in_at,
  };
}

function buildSession(userRow) {
  const user = normalizeUserRow(userRow);
  return {
    access_token: createSessionToken(user),
    token_type: "bearer",
    expires_in: 60 * 60 * 24 * 30,
    user,
  };
}

async function getUserById(userId) {
  const [rows] = await pool.query("SELECT * FROM users WHERE id = ? LIMIT 1", [userId]);
  return rows[0] || null;
}

async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    req.user = normalizeUserRow(user);
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}

function validTable(table) {
  return Object.prototype.hasOwnProperty.call(ALLOWED_TABLES, table);
}

function sanitizeColumns(table, select) {
  if (!select || select === "*") return "*";
  const allowed = ALLOWED_TABLES[table];
  const cols = select.split(",").map((c) => c.trim()).filter(Boolean);
  if (!cols.length) return "*";

  for (const col of cols) {
    if (!allowed.includes(col)) {
      throw new Error(`Invalid column: ${col}`);
    }
  }

  return cols.map((col) => `\`${col}\``).join(", ");
}

function sanitizeValueByColumn(col, value) {
  if (col === "field_options" || col === "external_data") {
    if (value == null) return null;
    return typeof value === "string" ? value : JSON.stringify(value);
  }
  if (col === "ts_report_published" || col === "is_premium" || col === "is_favorite") {
    return value ? 1 : 0;
  }
  return value;
}

function parseRowJsonColumns(row) {
  if (!row || typeof row !== "object") return row;
  const parsed = { ...row };

  if (typeof parsed.field_options === "string") {
    try { parsed.field_options = JSON.parse(parsed.field_options); } catch { parsed.field_options = []; }
  }

  if (typeof parsed.external_data === "string") {
    try { parsed.external_data = JSON.parse(parsed.external_data); } catch { parsed.external_data = null; }
  }

  if (parsed.ts_report_published !== undefined) parsed.ts_report_published = !!parsed.ts_report_published;
  if (parsed.is_premium !== undefined) parsed.is_premium = !!parsed.is_premium;
  if (parsed.is_favorite !== undefined) parsed.is_favorite = !!parsed.is_favorite;

  return parsed;
}

function buildWhereClause(table, filters = [], userId) {
  const allowed = ALLOWED_TABLES[table];
  const clauses = [];
  const values = [];

  for (const filter of filters) {
    const { col, op, value } = filter;
    if (!allowed.includes(col)) {
      throw new Error(`Invalid filter column: ${col}`);
    }
    if (op === 'in' && Array.isArray(value)) {
      if (value.length === 0) {
        clauses.push("1 = 0"); // empty IN → no match
      } else {
        clauses.push(`\`${col}\` IN (${value.map(() => "?").join(", ")})`);
        for (const v of value) values.push(sanitizeValueByColumn(col, v));
      }
    } else if (value === null || value === undefined) {
      clauses.push(`\`${col}\` IS NULL`);
    } else {
      clauses.push(`\`${col}\` = ?`);
      values.push(sanitizeValueByColumn(col, value));
    }
  }

  if (USER_SCOPED_TABLES.has(table)) {
    clauses.push("`user_id` = ?");
    values.push(userId);
  }

  return {
    whereSql: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    whereValues: values,
  };
}

// Ensure password_reset_tokens table exists (auto-migration)
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      token CHAR(64) NOT NULL,
      expires_at DATETIME NOT NULL,
      used_at DATETIME NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_reset_token (token),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
} catch (err) {
  console.warn("[warn] Could not auto-create password_reset_tokens table:", err?.message);
}

// Ensure organizations & organization_members tables exist (auto-migration)
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id CHAR(36) PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      type VARCHAR(50) NOT NULL DEFAULT 'club',
      invite_code VARCHAR(32) NOT NULL,
      created_by CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_invite_code (invite_code),
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organization_members (
      id CHAR(36) PRIMARY KEY,
      organization_id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      role VARCHAR(30) NOT NULL DEFAULT 'member',
      joined_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_org_user (organization_id, user_id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
} catch (err) {
  console.warn("[warn] Could not auto-create organization tables:", err?.message);
}

// Ensure shadow_teams & shadow_team_players tables exist (auto-migration)
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shadow_teams (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      formation VARCHAR(20) NOT NULL DEFAULT '4-3-3',
      logo_url TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_shadow_teams_user (user_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS shadow_team_players (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      shadow_team_id CHAR(36) NOT NULL,
      player_id CHAR(36) NOT NULL,
      position_slot VARCHAR(20) NOT NULL,
      \`rank\` INT NOT NULL DEFAULT 0,
      added_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_shadow_slot_player (shadow_team_id, position_slot, player_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (shadow_team_id) REFERENCES shadow_teams(id) ON DELETE CASCADE,
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
    )
  `);
} catch (err) {
  console.warn("[warn] Could not auto-create shadow_team tables:", err?.message);
}

// Migrate shadow_team_players unique key if needed (old: per-slot, new: per-slot+player)
try {
  await pool.query(`ALTER TABLE shadow_team_players DROP INDEX uniq_shadow_slot`);
  await pool.query(`ALTER TABLE shadow_team_players ADD UNIQUE KEY uniq_shadow_slot_player (shadow_team_id, position_slot, player_id)`);
} catch { /* already migrated or doesn't exist */ }

// Ensure rank column exists on shadow_team_players
try {
  await pool.query(`ALTER TABLE shadow_team_players ADD COLUMN \`rank\` INT NOT NULL DEFAULT 0`);
  console.log("[info] Added rank column to shadow_team_players");
} catch (err) {
  if (err?.errno !== 1060) console.warn("[warn] rank column migration:", err?.message);
}

// Ensure squad_players table exists (auto-migration)
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS squad_players (
      id CHAR(36) PRIMARY KEY,
      organization_id CHAR(36) NOT NULL,
      name VARCHAR(255) NOT NULL,
      photo_url TEXT NULL,
      date_of_birth DATE NULL,
      nationality VARCHAR(120) NOT NULL DEFAULT '',
      position VARCHAR(20) NOT NULL DEFAULT 'MC',
      position_secondaire VARCHAR(50) NULL,
      jersey_number INT NULL,
      contract_start DATE NULL,
      contract_end DATE NULL,
      monthly_salary DECIMAL(12,2) NULL,
      status VARCHAR(30) NOT NULL DEFAULT 'active',
      agent_name VARCHAR(255) NOT NULL DEFAULT '',
      agent_phone VARCHAR(100) NOT NULL DEFAULT '',
      agent_email VARCHAR(255) NOT NULL DEFAULT '',
      notes TEXT NULL,
      created_by CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_squad_org (organization_id),
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
} catch (err) {
  console.warn("[warn] Could not auto-create squad_players table:", err?.message);
}

// Ensure shared_with_org column exists on players
try {
  await pool.query(`ALTER TABLE players ADD COLUMN shared_with_org TINYINT(1) NOT NULL DEFAULT 0`);
} catch { /* column already exists */ }

// Ensure task column exists on players
try {
  await pool.query(`ALTER TABLE players ADD COLUMN task VARCHAR(30) NULL DEFAULT NULL`);
} catch { /* column already exists */ }

// Ensure has_news column exists on players (set by enrichment when club/contract/agent changes)
try {
  await pool.query(`ALTER TABLE players ADD COLUMN has_news VARCHAR(50) NULL DEFAULT NULL`);
} catch { /* column already exists — ensure it's VARCHAR */ }
try {
  await pool.query(`ALTER TABLE players MODIFY COLUMN has_news VARCHAR(50) NULL DEFAULT NULL`);
  // Clean up legacy TINYINT values ("0"/"1") from before the VARCHAR migration
  await pool.query(`UPDATE players SET has_news = NULL WHERE has_news IN ('0', '1')`);
} catch {}

// Ensure player_org_shares table exists
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS player_org_shares (
      id CHAR(36) PRIMARY KEY,
      player_id CHAR(36) NOT NULL,
      organization_id CHAR(36) NOT NULL,
      user_id CHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_player_org (player_id, organization_id),
      INDEX idx_player_org_shares_org (organization_id),
      INDEX idx_player_org_shares_user (user_id),
      FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
} catch (err) {
  console.warn("[warn] Could not auto-create player_org_shares table:", err?.message);
}

// Ensure match_assignments table exists
try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_assignments (
      id CHAR(36) PRIMARY KEY,
      user_id CHAR(36) NOT NULL,
      organization_id CHAR(36) NULL,
      assigned_to CHAR(36) NULL,
      assigned_by CHAR(36) NULL,
      home_team VARCHAR(255) NOT NULL,
      away_team VARCHAR(255) NOT NULL,
      match_date DATE NOT NULL,
      match_time VARCHAR(10) NULL,
      competition VARCHAR(255) NOT NULL DEFAULT '',
      venue VARCHAR(255) NOT NULL DEFAULT '',
      home_badge TEXT NULL,
      away_badge TEXT NULL,
      notes TEXT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'planned',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_match_assignments_user (user_id, match_date),
      INDEX idx_match_assignments_org (organization_id, match_date),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
      FOREIGN KEY (assigned_to) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_by) REFERENCES users(id) ON DELETE SET NULL
    )
  `);
} catch (err) {
  console.warn("[warn] Could not auto-create match_assignments table:", err?.message);
}

// Migrate legacy shared_with_org boolean to player_org_shares junction table
try {
  const [legacyShared] = await pool.query(
    `SELECT p.id AS player_id, p.user_id FROM players p WHERE p.shared_with_org = 1 AND NOT EXISTS (SELECT 1 FROM player_org_shares pos WHERE pos.player_id = p.id)`
  );
  for (const row of legacyShared) {
    const [memberships] = await pool.query(
      `SELECT organization_id FROM organization_members WHERE user_id = ?`, [row.user_id]
    );
    for (const m of memberships) {
      try {
        await pool.query(
          `INSERT IGNORE INTO player_org_shares (id, player_id, organization_id, user_id) VALUES (UUID(), ?, ?, ?)`,
          [row.player_id, m.organization_id, row.user_id]
        );
      } catch { /* duplicate, skip */ }
    }
  }
} catch (err) {
  console.warn("[warn] Legacy shared_with_org migration:", err?.message);
}

// Ensure file_url column exists on reports
try {
  await pool.query(`ALTER TABLE reports ADD COLUMN file_url TEXT NULL`);
} catch { /* column already exists */ }

// Ensure logo_url column exists on shadow_teams
try {
  await pool.query(`ALTER TABLE shadow_teams ADD COLUMN logo_url TEXT NULL`);
  console.log("[info] Added logo_url column to shadow_teams");
} catch (err) {
  if (err?.errno !== 1060) console.warn("[warn] logo_url migration:", err?.message);
}

// ── Purge invalid league values (club names, youth/amateur divisions, unknown countries) ──
try {
  const INVALID_LEAGUES = [
    // Club names stored as leagues
    'Los Angeles FC', 'LAFC', 'Real Salt Lake', 'LA Galaxy', 'Inter Miami CF',
    'Atlanta United FC', 'Seattle Sounders FC', 'New York City FC',
    // Leagues supprimées du mapping
    'Brasileirão Série A', 'Brasileirão Série B', 'Brésil', 'Brazil',
    // Youth / amateur / inexistant
    'Nationale 3', 'Nationale U19', 'National U19', 'N3',
    'Pays inexistant', 'pays inexistant', 'Unknown', 'unknown', 'N/A', 'n/a', '-',
  ];
  const placeholders = INVALID_LEAGUES.map(() => '?').join(', ');
  const [result] = await pool.query(
    `UPDATE players SET league = NULL WHERE league IN (${placeholders})`,
    INVALID_LEAGUES
  );
  // Also purge league values that are themselves club names (from static mapping)
  const CLUB_TO_LEAGUE_MAP = require('../src/data/club-to-league.json');
  for (const clubName of Object.keys(CLUB_TO_LEAGUE_MAP)) {
    await pool.query(
      "UPDATE players SET league = NULL WHERE league = ? AND club != ?",
      [clubName, clubName]
    );
  }
  if (result.affectedRows > 0) {
    console.log(`[migration] Purged ${result.affectedRows} invalid league values`);
  }
} catch (err) {
  console.warn("[warn] purge-invalid-leagues migration:", err?.message);
}

// ── Normalize league name aliases (typos, API variants, trailing spaces) ──
try {
  const LEAGUE_ALIASES = require('../src/data/league-aliases.json');
  let totalFixed = 0;
  for (const [alias, canonical] of Object.entries(LEAGUE_ALIASES)) {
    const [result] = await pool.query(
      "UPDATE players SET league = ? WHERE league = ? OR TRIM(league) = ?",
      [canonical, alias, alias]
    );
    totalFixed += result.affectedRows || 0;
  }
  // Also fix leagues with just trailing/leading spaces
  await pool.query("UPDATE players SET league = TRIM(league) WHERE league != TRIM(league)");
  if (totalFixed > 0) {
    console.log(`[migration] Normalized ${totalFixed} league aliases`);
  }
} catch (err) {
  console.warn("[warn] normalize-league-aliases migration:", err?.message);
}

// ── Fix player league data: replace country names with correct league names ──
// Source unique : src/data/country-to-league.json
try {
  const COUNTRY_TO_LEAGUE = require('../src/data/country-to-league.json');

  let totalFixed = 0;
  for (const [countryName, leagueName] of Object.entries(COUNTRY_TO_LEAGUE)) {
    const [result] = await pool.query(
      "UPDATE players SET league = ? WHERE league = ?",
      [leagueName, countryName]
    );
    totalFixed += result.affectedRows || 0;
  }

  // Also fix empty leagues using club_directory
  try {
    const [result] = await pool.query(`
      UPDATE players p
      JOIN club_directory cd ON p.club = cd.club_name
      SET p.league = cd.competition
      WHERE (p.league IS NULL OR p.league = '')
        AND cd.competition IS NOT NULL AND cd.competition != ''
    `);
    totalFixed += result.affectedRows || 0;
  } catch { /* club_directory may not exist */ }

  if (totalFixed > 0) {
    console.log(`[migration] Fixed ${totalFixed} player league values (country names → correct league names)`);
  }
} catch (err) {
  console.warn("[warn] fix-player-leagues migration:", err?.message);
}

// ── Purge numeric/invalid league values (API IDs stored by mistake) ──
try {
  // Set to NULL any league value that is purely numeric (e.g. "45719" from TheSportsDB idLeague)
  const [result] = await pool.query(
    "UPDATE players SET league = NULL WHERE league REGEXP '^[0-9]+$'"
  );
  if (result.affectedRows > 0) {
    console.log(`[migration] Purged ${result.affectedRows} numeric league values (API IDs)`);
  }
} catch (err) {
  console.warn("[warn] purge-numeric-leagues migration:", err?.message);
}

// ── Fix wrong leagues using static club→league mapping (source de vérité) ──
// Corrige les ligues erronées venant de TheSportsDB ou d'autres APIs externes
// Source : src/data/club-to-league.json
try {
  const CLUB_TO_LEAGUE = require('../src/data/club-to-league.json');

  let totalFixed = 0;

  // 1. Fix players whose league doesn't match the static mapping for their club
  for (const [clubName, correctLeague] of Object.entries(CLUB_TO_LEAGUE)) {
    const [result] = await pool.query(
      "UPDATE players SET league = ? WHERE club = ? AND (league IS NULL OR league = '' OR league != ?)",
      [correctLeague, clubName, correctLeague]
    );
    totalFixed += result.affectedRows || 0;
  }

  // 2. Fix club_directory entries where competition doesn't match the static mapping
  try {
    for (const [clubName, correctLeague] of Object.entries(CLUB_TO_LEAGUE)) {
      await pool.query(
        "UPDATE club_directory SET competition = ? WHERE club_name = ? AND competition != ?",
        [correctLeague, clubName, correctLeague]
      );
    }
  } catch { /* club_directory may not exist yet */ }

  if (totalFixed > 0) {
    console.log(`[migration] Fixed ${totalFixed} player league values (static club→league mapping)`);
  }
} catch (err) {
  console.warn("[warn] fix-club-leagues migration:", err?.message);
}

// ── Image proxy for CORS-free capture (used by shadow-team download) ──
app.get("/api/image-proxy", async (req, res) => {
  const url = req.query.url;
  if (!url || typeof url !== "string") return res.status(400).end();
  try {
    const resp = await fetch(url, {
      signal: AbortSignal.timeout(10000),
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
      redirect: "follow",
    });
    if (!resp.ok) {
      console.warn(`[image-proxy] ${resp.status} for ${url}`);
      return res.status(resp.status).end();
    }
    const ct = resp.headers.get("content-type") || "image/png";
    res.set("Content-Type", ct);
    res.set("Cache-Control", "public, max-age=86400");
    const buf = Buffer.from(await resp.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.warn(`[image-proxy] FAIL for ${url}:`, err?.message);
    res.status(502).end();
  }
});

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ ok: true, db: true });
  } catch (err) {
    console.error("Health DB check failed:", err?.message || err);
    res.status(500).json({ ok: false, db: false, error: "Database unavailable" });
  }
});

app.post("/api/auth/signup", rateLimitAuth, async (req, res) => {
  const { email, password, fullName = "", club = "", role = "scout" } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedFullName = String(fullName || "").trim();
  const normalizedClub = String(club || "").trim();
  const normalizedRole = String(role || "scout").trim();

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: "Email et mot de passe valides requis." });
  }
  const pwdError = validatePasswordStrength(password);
  if (pwdError) {
    return res.status(400).json({ error: pwdError });
  }
  if (normalizedFullName.length > 100 || normalizedClub.length > 100 || normalizedRole.length > 50) {
    return res.status(400).json({ error: "Les champs profil sont trop longs." });
  }

  let conn;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    const [existing] = await conn.query("SELECT id FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);
    if (existing.length) {
      await conn.rollback();
      return res.status(409).json({ error: "Email déjà utilisé." });
    }

    const userId = uuidv4();
    const hash = await bcrypt.hash(password, 10);

    await conn.query(
      `INSERT INTO users (id, email, password_hash, created_at, updated_at, last_sign_in_at)
       VALUES (?, ?, ?, NOW(), NOW(), NOW())`,
      [userId, normalizedEmail, hash],
    );

    await conn.query(
      `INSERT INTO profiles (id, user_id, full_name, club, role, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, NOW(), NOW())`,
      [uuidv4(), userId, normalizedFullName, normalizedClub, normalizedRole],
    );

    await conn.query(
      `INSERT INTO user_roles (id, user_id, role, created_at)
       VALUES (?, ?, 'user', NOW())`,
      [uuidv4(), userId],
    );

    await conn.query(
      `INSERT INTO user_subscriptions (id, user_id, is_premium, premium_since, created_at, updated_at)
       VALUES (?, ?, 0, NULL, NOW(), NOW())`,
      [uuidv4(), userId],
    );

    await conn.commit();
    const user = await getUserById(userId);
    return res.json({ user: normalizeUserRow(user), session: buildSession(user) });
  } catch (err) {
    console.error(err);
    if (conn) {
      try { await conn.rollback(); } catch {}
    }
    if (err?.code === "ER_DATA_TOO_LONG") {
      return res.status(400).json({ error: "Les champs profil sont trop longs." });
    }
    return res.status(500).json({ error: "Erreur serveur" });
  } finally {
    if (conn) conn.release();
  }
});

app.post("/api/auth/login", rateLimitAuth, async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: "Email et mot de passe requis." });
  }

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ? LIMIT 1", [email.trim().toLowerCase()]);
    const user = rows[0];
    if (!user) {
      return res.status(401).json({ error: "Identifiants invalides." });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: "Identifiants invalides." });
    }

    // If 2FA is enabled, don't return session yet — require TOTP code
    if (user.totp_enabled) {
      return res.json({ requires2FA: true, userId: user.id });
    }

    await pool.query("UPDATE users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = ?", [user.id]);
    const refreshed = await getUserById(user.id);

    return res.json({ session: buildSession(refreshed), user: normalizeUserRow(refreshed) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/auth/session", async (req, res) => {
  const authHeader = req.headers.authorization || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;

  if (!token) {
    return res.json({ session: null });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) return res.json({ session: null });
    return res.json({ session: buildSession(user) });
  } catch {
    return res.json({ session: null });
  }
});

app.get("/api/auth/user", authMiddleware, async (req, res) => {
  const user = await getUserById(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  return res.json({ user: normalizeUserRow(user) });
});

app.post("/api/auth/signout", (_req, res) => {
  return res.json({ ok: true });
});

// ── Mailer (configured via SMTP_* env vars) ────────────────────────────────
function createMailer() {
  if (!nodemailer || !process.env.SMTP_HOST) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

// ── POST /api/auth/forgot-password ─────────────────────────────────────────
app.post("/api/auth/forgot-password", rateLimitAuth, async (req, res) => {
  const { email, redirectTo } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email requis." });

  try {
    const [rows] = await pool.query("SELECT * FROM users WHERE email = ? LIMIT 1", [String(email).trim().toLowerCase()]);
    // Always return success to avoid user enumeration
    if (!rows.length) return res.json({ ok: true });

    const user = rows[0];

    // Invalidate previous tokens for this user
    await pool.query("DELETE FROM password_reset_tokens WHERE user_id = ?", [user.id]);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      "INSERT INTO password_reset_tokens (id, user_id, token, expires_at) VALUES (?, ?, ?, ?)",
      [uuidv4(), user.id, token, expiresAt],
    );

    const baseUrl = (redirectTo || `${req.protocol}://${req.get("host")}/reset-password`).replace(/\?.*$/, "");
    const resetLink = `${baseUrl}?token=${token}`;

    const mailer = createMailer();
    if (mailer) {
      await mailer.sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: "Réinitialisation de votre mot de passe – ScoutHub",
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto">
            <h2 style="color:#1a1a2e">Réinitialisation de mot de passe</h2>
            <p>Vous avez demandé à réinitialiser votre mot de passe sur <strong>ScoutHub</strong>.</p>
            <p>Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>1 heure</strong>.</p>
            <p style="text-align:center;margin:32px 0">
              <a href="${resetLink}"
                 style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
                Réinitialiser mon mot de passe
              </a>
            </p>
            <p style="color:#888;font-size:13px">Si vous n'avez pas fait cette demande, ignorez simplement cet email.</p>
          </div>
        `,
      });
    } else {
      // Dev fallback: log the link when SMTP is not configured
      console.log(`[DEV] Password reset link for ${user.email}: ${resetLink}`);
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("forgot-password error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── POST /api/auth/reset-password ──────────────────────────────────────────
app.post("/api/auth/reset-password", rateLimitAuth, async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: "Token et mot de passe requis." });
  const resetPwdErr = validatePasswordStrength(password);
  if (resetPwdErr) return res.status(400).json({ error: resetPwdErr });

  try {
    const [rows] = await pool.query(
      "SELECT * FROM password_reset_tokens WHERE token = ? AND used_at IS NULL AND expires_at > NOW() LIMIT 1",
      [String(token)],
    );

    if (!rows.length) return res.status(400).json({ error: "Lien invalide ou expiré." });

    const resetRow = rows[0];
    const hash = await bcrypt.hash(String(password), 10);

    await pool.query("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [hash, resetRow.user_id]);
    await pool.query("UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?", [resetRow.id]);

    const user = await getUserById(resetRow.user_id);
    return res.json({ ok: true, session: buildSession(user), user: normalizeUserRow(user) });
  } catch (err) {
    console.error("reset-password error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.patch("/api/auth/user", authMiddleware, async (req, res) => {
  const { email, password } = req.body || {};

  try {
    if (email) {
      const nextEmail = String(email).trim().toLowerCase();
      const [existing] = await pool.query("SELECT id FROM users WHERE email = ? AND id != ? LIMIT 1", [nextEmail, req.user.id]);
      if (existing.length) {
        return res.status(409).json({ error: "Email déjà utilisé." });
      }
      await pool.query("UPDATE users SET email = ?, updated_at = NOW() WHERE id = ?", [nextEmail, req.user.id]);
    }

    if (password) {
      const updatePwdErr = validatePasswordStrength(password);
      if (updatePwdErr) {
        return res.status(400).json({ error: updatePwdErr });
      }
      const hash = await bcrypt.hash(String(password), 10);
      await pool.query("UPDATE users SET password_hash = ?, updated_at = NOW() WHERE id = ?", [hash, req.user.id]);
    }

    const user = await getUserById(req.user.id);
    return res.json({ user: normalizeUserRow(user), session: buildSession(user) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── 2FA TOTP endpoints ────────────────────────────────────────────────────

// GET /api/auth/2fa/status — check if 2FA is enabled
app.get("/api/auth/2fa/status", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT totp_enabled FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );
    return res.json({ enabled: !!(rows[0]?.totp_enabled) });
  } catch (err) {
    console.error("2fa status error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/2fa/setup — generate TOTP secret + QR code
app.post("/api/auth/2fa/setup", authMiddleware, async (req, res) => {
  if (!speakeasy || !QRCode) {
    return res.status(501).json({ error: "2FA non disponible sur ce serveur." });
  }
  try {
    const secret = speakeasy.generateSecret({
      name: `ScoutHub (${req.user.email})`,
      issuer: "ScoutHub",
    });

    // Store temp secret (not yet verified)
    await pool.query(
      "UPDATE users SET totp_secret_temp = ?, updated_at = NOW() WHERE id = ?",
      [secret.base32, req.user.id],
    );

    const qrDataUrl = await QRCode.toDataURL(secret.otpauth_url);
    return res.json({ secret: secret.base32, qrCode: qrDataUrl });
  } catch (err) {
    console.error("2fa setup error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/2fa/verify — verify code and enable 2FA
app.post("/api/auth/2fa/verify", authMiddleware, async (req, res) => {
  if (!speakeasy) {
    return res.status(501).json({ error: "2FA non disponible sur ce serveur." });
  }
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Code requis." });

  try {
    const [rows] = await pool.query(
      "SELECT totp_secret_temp FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );
    const tempSecret = rows[0]?.totp_secret_temp;
    if (!tempSecret) return res.status(400).json({ error: "Aucune configuration 2FA en cours." });

    const valid = speakeasy.totp.verify({
      secret: tempSecret,
      encoding: "base32",
      token: String(code),
      window: 1,
    });

    if (!valid) return res.status(400).json({ error: "Code invalide." });

    // Enable 2FA: move temp secret to permanent, enable flag
    await pool.query(
      "UPDATE users SET totp_secret = totp_secret_temp, totp_secret_temp = NULL, totp_enabled = 1, updated_at = NOW() WHERE id = ?",
      [req.user.id],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("2fa verify error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/2fa/disable — disable 2FA
app.post("/api/auth/2fa/disable", authMiddleware, async (req, res) => {
  const { code } = req.body || {};
  if (!code || !speakeasy) return res.status(400).json({ error: "Code requis." });

  try {
    const [rows] = await pool.query(
      "SELECT totp_secret, totp_enabled FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );
    if (!rows[0]?.totp_enabled) return res.status(400).json({ error: "2FA non activé." });

    const valid = speakeasy.totp.verify({
      secret: rows[0].totp_secret,
      encoding: "base32",
      token: String(code),
      window: 1,
    });

    if (!valid) return res.status(400).json({ error: "Code invalide." });

    await pool.query(
      "UPDATE users SET totp_secret = NULL, totp_secret_temp = NULL, totp_enabled = 0, updated_at = NOW() WHERE id = ?",
      [req.user.id],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("2fa disable error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/2fa/validate — validate TOTP code during login
app.post("/api/auth/2fa/validate", rateLimitAuth, async (req, res) => {
  if (!speakeasy) return res.status(501).json({ error: "2FA non disponible." });
  const { userId, code } = req.body || {};
  if (!userId || !code) return res.status(400).json({ error: "userId et code requis." });

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE id = ? AND totp_enabled = 1 LIMIT 1",
      [userId],
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ error: "Utilisateur introuvable." });

    const valid = speakeasy.totp.verify({
      secret: user.totp_secret,
      encoding: "base32",
      token: String(code),
      window: 1,
    });

    if (!valid) return res.status(401).json({ error: "Code 2FA invalide." });

    await pool.query("UPDATE users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = ?", [user.id]);
    const refreshed = await getUserById(user.id);
    return res.json({ session: buildSession(refreshed), user: normalizeUserRow(refreshed) });
  } catch (err) {
    console.error("2fa validate error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/query", authMiddleware, async (req, res) => {
  const {
    table,
    op,
    select = "*",
    filters = [],
    values,
    order,
    range,
    single = false,
    maybeSingle = false,
    returning = false,
    onConflict,
  } = req.body || {};

  if (!validTable(table)) {
    return res.status(400).json({ error: "Invalid table" });
  }

  try {
    const allowedCols = ALLOWED_TABLES[table];

    if (op === "select") {
      const selected = sanitizeColumns(table, select);
      const { whereSql, whereValues } = buildWhereClause(table, filters, req.user.id);

      let sql = `SELECT ${selected} FROM \`${table}\` ${whereSql}`;
      const params = [...whereValues];

      if (order?.column) {
        if (!allowedCols.includes(order.column)) {
          throw new Error(`Invalid order column: ${order.column}`);
        }
        sql += ` ORDER BY \`${order.column}\` ${order.ascending === false ? "DESC" : "ASC"}`;
      }

      if (range && Number.isInteger(range.from) && Number.isInteger(range.to)) {
        const limit = Math.max(0, range.to - range.from + 1);
        sql += " LIMIT ? OFFSET ?";
        params.push(limit, range.from);
      }

      const [rows] = await pool.query(sql, params);
      const parsedRows = rows.map(parseRowJsonColumns);

      if (single) {
        if (!parsedRows.length) return res.status(404).json({ error: "No rows" });
        return res.json({ data: parsedRows[0] });
      }

      if (maybeSingle) {
        return res.json({ data: parsedRows[0] || null });
      }

      return res.json({ data: parsedRows });
    }

    if (!["insert", "update", "delete", "upsert"].includes(op)) {
      return res.status(400).json({ error: "Invalid op" });
    }

    if (op === "insert" || op === "upsert") {
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return res.status(400).json({ error: "values object required" });
      }

      const row = { ...values };

      if (USER_SCOPED_TABLES.has(table)) {
        row.user_id = req.user.id;
      }

      if (allowedCols.includes("id") && !row.id) {
        row.id = uuidv4();
      }

      const cols = Object.keys(row).filter((c) => allowedCols.includes(c));
      if (!cols.length) return res.status(400).json({ error: "No valid columns" });

      const placeholders = cols.map(() => "?").join(", ");
      const colSql = cols.map((c) => `\`${c}\``).join(", ");
      const vals = cols.map((c) => sanitizeValueByColumn(c, row[c]));

      if (op === "insert") {
        await pool.query(`INSERT INTO \`${table}\` (${colSql}) VALUES (${placeholders})`, vals);
      } else {
        if (!onConflict || !allowedCols.includes(onConflict)) {
          return res.status(400).json({ error: "onConflict column required for upsert" });
        }
        const updateCols = cols.filter((c) => c !== "id");
        const updateSql = updateCols.map((c) => `\`${c}\` = VALUES(\`${c}\`)`).join(", ");
        await pool.query(
          `INSERT INTO \`${table}\` (${colSql}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updateSql}`,
          vals,
        );
      }

      if (!returning) return res.json({ data: null });

      const baseFilters = [];
      if (row.id) baseFilters.push({ col: "id", value: row.id });
      else if (onConflict && row[onConflict] !== undefined) baseFilters.push({ col: onConflict, value: row[onConflict] });
      const { whereSql, whereValues } = buildWhereClause(table, baseFilters, req.user.id);
      const [rows] = await pool.query(`SELECT * FROM \`${table}\` ${whereSql} LIMIT 1`, whereValues);
      return res.json({ data: rows[0] ? parseRowJsonColumns(rows[0]) : null });
    }

    if (op === "update") {
      if (!values || typeof values !== "object" || Array.isArray(values)) {
        return res.status(400).json({ error: "values object required" });
      }

      const cols = Object.keys(values).filter((c) => ALLOWED_TABLES[table].includes(c) && c !== "id");
      if (!cols.length) return res.status(400).json({ error: "No valid columns to update" });

      const setSql = cols.map((c) => `\`${c}\` = ?`).join(", ");
      const setValues = cols.map((c) => sanitizeValueByColumn(c, values[c]));

      const { whereSql, whereValues } = buildWhereClause(table, filters, req.user.id);
      if (!whereSql) {
        return res.status(400).json({ error: "Refusing full-table update" });
      }

      await pool.query(`UPDATE \`${table}\` SET ${setSql} ${whereSql}`, [...setValues, ...whereValues]);

      if (!returning) return res.json({ data: null });

      const [rows] = await pool.query(`SELECT * FROM \`${table}\` ${whereSql} LIMIT 1`, whereValues);
      return res.json({ data: rows[0] ? parseRowJsonColumns(rows[0]) : null });
    }

    if (op === "delete") {
      const { whereSql, whereValues } = buildWhereClause(table, filters, req.user.id);
      if (!whereSql) {
        return res.status(400).json({ error: "Refusing full-table delete" });
      }

      await pool.query(`DELETE FROM \`${table}\` ${whereSql}`, whereValues);
      return res.json({ data: null });
    }

    return res.status(400).json({ error: "Unsupported op" });
  } catch (err) {
    console.error(err);
    return res.status(400).json({ error: err.message || "Query error" });
  }
});

app.post("/api/rpc/has_role", authMiddleware, async (req, res) => {
  const { _user_id, _role } = req.body || {};
  if (!_user_id || !_role) return res.status(400).json({ error: "Missing args" });

  if (_user_id !== req.user.id) {
    return res.json({ data: false });
  }

  const [rows] = await pool.query(
    "SELECT id FROM user_roles WHERE user_id = ? AND role = ? LIMIT 1",
    [_user_id, _role],
  );

  return res.json({ data: rows.length > 0 });
});

// Fetch all shared players for a specific organization (via junction table)
app.post("/api/rpc/get_org_players", authMiddleware, async (req, res) => {
  try {
    const { org_id } = req.body || {};

    let orgId = org_id;
    if (!orgId) {
      // Fallback: find user's first organization
      const [mem] = await pool.query(
        "SELECT organization_id FROM organization_members WHERE user_id = ? LIMIT 1",
        [req.user.id],
      );
      if (!mem.length) return res.json({ data: [] });
      orgId = mem[0].organization_id;
    }

    // Verify user is a member of this org
    const [membership] = await pool.query(
      "SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?",
      [orgId, req.user.id],
    );
    if (!membership.length) return res.json({ data: [] });

    // Fetch players shared with this org via junction table
    const [rows] = await pool.query(
      `SELECT p.*, pr.full_name AS owner_name
       FROM player_org_shares pos
       JOIN players p ON p.id = pos.player_id
       LEFT JOIN profiles pr ON pr.user_id = p.user_id
       WHERE pos.organization_id = ?
       ORDER BY p.name`,
      [orgId],
    );

    // Parse JSON columns
    const parsed = rows.map((r) => {
      if (r.external_data && typeof r.external_data === "string") {
        try { r.external_data = JSON.parse(r.external_data); } catch { /* ignore */ }
      }
      return r;
    });

    return res.json({ data: parsed });
  } catch (err) {
    console.error("get_org_players error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Share a player with an organization
app.post("/api/rpc/share_player_with_org", authMiddleware, async (req, res) => {
  try {
    const { player_id, organization_id } = req.body || {};
    if (!player_id || !organization_id) return res.status(400).json({ error: "Missing player_id or organization_id" });

    // Verify user owns this player
    const [player] = await pool.query("SELECT id FROM players WHERE id = ? AND user_id = ?", [player_id, req.user.id]);
    if (!player.length) return res.status(403).json({ error: "Not your player" });

    // Verify user is a member of this org
    const [membership] = await pool.query(
      "SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?",
      [organization_id, req.user.id],
    );
    if (!membership.length) return res.status(403).json({ error: "Not a member of this organization" });

    // Insert share (ignore duplicate)
    await pool.query(
      `INSERT IGNORE INTO player_org_shares (id, player_id, organization_id, user_id) VALUES (UUID(), ?, ?, ?)`,
      [player_id, organization_id, req.user.id],
    );

    // Also keep legacy flag in sync
    await pool.query(`UPDATE players SET shared_with_org = 1 WHERE id = ?`, [player_id]);

    return res.json({ data: { success: true } });
  } catch (err) {
    console.error("share_player_with_org error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Unshare a player from an organization
app.post("/api/rpc/unshare_player_from_org", authMiddleware, async (req, res) => {
  try {
    const { player_id, organization_id } = req.body || {};
    if (!player_id || !organization_id) return res.status(400).json({ error: "Missing player_id or organization_id" });

    // Verify user owns this player
    const [player] = await pool.query("SELECT id FROM players WHERE id = ? AND user_id = ?", [player_id, req.user.id]);
    if (!player.length) return res.status(403).json({ error: "Not your player" });

    await pool.query(
      `DELETE FROM player_org_shares WHERE player_id = ? AND organization_id = ?`,
      [player_id, organization_id],
    );

    // Update legacy flag: set to 0 only if no more shares remain
    const [remaining] = await pool.query(`SELECT COUNT(*) AS cnt FROM player_org_shares WHERE player_id = ?`, [player_id]);
    if (remaining[0].cnt === 0) {
      await pool.query(`UPDATE players SET shared_with_org = 0 WHERE id = ?`, [player_id]);
    }

    return res.json({ data: { success: true } });
  } catch (err) {
    console.error("unshare_player_from_org error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Get which orgs a player (or list of players) is shared with
app.post("/api/rpc/get_player_org_shares", authMiddleware, async (req, res) => {
  try {
    const { player_ids } = req.body || {};
    if (!player_ids || !Array.isArray(player_ids) || player_ids.length === 0) {
      return res.json({ data: [] });
    }

    const placeholders = player_ids.map(() => "?").join(", ");
    const [rows] = await pool.query(
      `SELECT pos.player_id, pos.organization_id, o.name AS organization_name
       FROM player_org_shares pos
       JOIN organizations o ON o.id = pos.organization_id
       WHERE pos.player_id IN (${placeholders}) AND pos.user_id = ?`,
      [...player_ids, req.user.id],
    );

    return res.json({ data: rows });
  } catch (err) {
    console.error("get_player_org_shares error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

// ── Squad players (organization effectif) ─────────────────────────

app.post("/api/rpc/get_squad_players", authMiddleware, async (req, res) => {
  try {
    const { org_id } = req.body || {};

    let orgId = org_id;
    if (!orgId) {
      const [mem] = await pool.query(
        "SELECT organization_id FROM organization_members WHERE user_id = ? LIMIT 1",
        [req.user.id],
      );
      if (!mem.length) return res.json({ data: [] });
      orgId = mem[0].organization_id;
    }

    // Verify user belongs to this org
    const [check] = await pool.query(
      "SELECT 1 FROM organization_members WHERE user_id = ? AND organization_id = ?",
      [req.user.id, orgId],
    );
    if (!check.length) return res.status(403).json({ error: "Not a member" });

    const [rows] = await pool.query(
      "SELECT * FROM squad_players WHERE organization_id = ? ORDER BY name",
      [orgId],
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error("get_squad_players error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

app.post("/api/rpc/upsert_squad_player", authMiddleware, async (req, res) => {
  try {
    const { org_id } = req.body || {};

    let orgId = org_id;
    if (!orgId) {
      const [mem] = await pool.query(
        "SELECT organization_id FROM organization_members WHERE user_id = ? LIMIT 1",
        [req.user.id],
      );
      if (!mem.length) return res.status(403).json({ error: "No organization" });
      orgId = mem[0].organization_id;
    }

    // Verify user belongs to this org
    const [check] = await pool.query(
      "SELECT 1 FROM organization_members WHERE user_id = ? AND organization_id = ?",
      [req.user.id, orgId],
    );
    if (!check.length) return res.status(403).json({ error: "Not a member" });
    const p = req.body || {};
    const cols = [
      "name", "photo_url", "date_of_birth", "nationality", "club", "league", "foot", "market_value",
      "position", "position_secondaire",
      "jersey_number", "contract_start", "contract_end", "monthly_salary", "status",
      "agent_name", "agent_phone", "agent_email", "notes",
    ];
    // Columns that accept NULL – empty strings become null only for these
    const nullableCols = new Set([
      "photo_url", "date_of_birth", "position_secondaire", "jersey_number",
      "contract_start", "contract_end", "monthly_salary", "market_value", "notes",
    ]);
    const toVal = (c) => {
      const v = p[c];
      if (nullableCols.has(c)) return v === "" || v === undefined || v === null ? null : v;
      return v ?? "";
    };

    if (p.id) {
      // Verify player belongs to this org
      const [existing] = await pool.query(
        "SELECT id FROM squad_players WHERE id = ? AND organization_id = ?",
        [p.id, orgId],
      );
      if (!existing.length) return res.status(404).json({ error: "Not found" });

      const sets = [];
      const vals = [];
      for (const c of cols) {
        if (Object.prototype.hasOwnProperty.call(p, c)) {
          sets.push(`\`${c}\` = ?`);
          vals.push(toVal(c));
        }
      }
      if (sets.length) {
        vals.push(p.id);
        await pool.query(`UPDATE squad_players SET ${sets.join(", ")} WHERE id = ?`, vals);
      }
      const [row] = await pool.query("SELECT * FROM squad_players WHERE id = ?", [p.id]);
      return res.json({ data: row[0] });
    } else {
      const id = crypto.randomUUID();
      const insertCols = ["id", "organization_id", "created_by", ...cols];
      const insertVals = [id, orgId, req.user.id, ...cols.map(toVal)];
      const placeholders = insertCols.map(() => "?").join(", ");
      await pool.query(
        `INSERT INTO squad_players (${insertCols.map((c) => `\`${c}\``).join(", ")}) VALUES (${placeholders})`,
        insertVals,
      );
      const [row] = await pool.query("SELECT * FROM squad_players WHERE id = ?", [id]);
      return res.json({ data: row[0] });
    }
  } catch (err) {
    console.error("upsert_squad_player error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

app.post("/api/rpc/delete_squad_player", authMiddleware, async (req, res) => {
  try {
    const { id, org_id } = req.body || {};
    if (!id) return res.status(400).json({ error: "Missing id" });

    let orgId = org_id;
    if (!orgId) {
      const [mem] = await pool.query(
        "SELECT organization_id FROM organization_members WHERE user_id = ? LIMIT 1",
        [req.user.id],
      );
      if (!mem.length) return res.status(403).json({ error: "No organization" });
      orgId = mem[0].organization_id;
    }

    // Verify user belongs to this org
    const [check] = await pool.query(
      "SELECT 1 FROM organization_members WHERE user_id = ? AND organization_id = ?",
      [req.user.id, orgId],
    );
    if (!check.length) return res.status(403).json({ error: "Not a member" });

    await pool.query("DELETE FROM squad_players WHERE id = ? AND organization_id = ?", [id, orgId]);
    return res.json({ data: { success: true } });
  } catch (err) {
    console.error("delete_squad_player error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

async function ensureAdmin(req, res, next) {
  const [rows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
  if (!rows.length) return res.status(403).json({ error: "Forbidden" });
  next();
}

app.get("/api/admin/users", authMiddleware, ensureAdmin, async (_req, res) => {
  const [users] = await pool.query("SELECT id, email, created_at, last_sign_in_at FROM users ORDER BY created_at DESC");
  const [subs] = await pool.query("SELECT user_id, is_premium, premium_since FROM user_subscriptions");
  const [roles] = await pool.query("SELECT user_id, role FROM user_roles");
  const [counts] = await pool.query("SELECT user_id, COUNT(*) as count FROM players GROUP BY user_id");

  const subByUser = new Map(subs.map((s) => [s.user_id, s]));
  const rolesByUser = new Map();
  for (const r of roles) {
    const arr = rolesByUser.get(r.user_id) || [];
    arr.push(r.role);
    rolesByUser.set(r.user_id, arr);
  }
  const countByUser = new Map(counts.map((c) => [c.user_id, Number(c.count)]));

  const payload = users.map((u) => {
    const sub = subByUser.get(u.id);
    return {
      id: u.id,
      email: u.email,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      is_premium: !!sub?.is_premium,
      premium_since: sub?.premium_since || null,
      roles: rolesByUser.get(u.id) || ["user"],
      player_count: countByUser.get(u.id) || 0,
    };
  });

  res.json(payload);
});

app.post("/api/admin/users/toggle-premium", authMiddleware, ensureAdmin, async (req, res) => {
  const { userId, isPremium } = req.body || {};
  if (!userId || typeof isPremium !== "boolean") {
    return res.status(400).json({ error: "Invalid payload" });
  }

  await pool.query(
    `INSERT INTO user_subscriptions (id, user_id, is_premium, premium_since, created_at, updated_at)
     VALUES (?, ?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE is_premium = VALUES(is_premium), premium_since = VALUES(premium_since), updated_at = NOW()`,
    [uuidv4(), userId, isPremium ? 1 : 0, isPremium ? new Date() : null],
  );

  res.json({ ok: true });
});

app.post("/api/admin/users/reset-password", authMiddleware, ensureAdmin, async (_req, res) => {
  res.json({ ok: true, message: "Password reset email flow not configured in MySQL mode." });
});

// Impersonate a user (admin only) — returns a session token for the target user
app.post("/api/admin/impersonate", authMiddleware, ensureAdmin, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    const session = buildSession(targetUser);
    res.json({ session });
  } catch (err) {
    console.error("[admin/impersonate] error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// ── Club logos ──────────────────────────────────────────────────────────────

// Public read — no auth needed (logos are shared across all users)
app.get("/api/club-logos", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT club_name, logo_url, name_fr, name_en, name_es FROM club_logos");
    return res.json(rows);
  } catch (err) {
    console.error("[club-logos] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// Save a single logo (called by the browser after a TheSportsDB lookup)
app.post("/api/club-logos", authMiddleware, async (req, res) => {
  const { club_name, logo_url, name_fr, name_en, name_es } = req.body || {};
  if (!club_name || !logo_url) return res.status(400).json({ error: "Champs manquants" });
  try {
    await pool.query(
      `INSERT INTO club_logos (club_name, logo_url, name_fr, name_en, name_es) VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE logo_url = VALUES(logo_url), name_fr = COALESCE(VALUES(name_fr), name_fr), name_en = COALESCE(VALUES(name_en), name_en), name_es = COALESCE(VALUES(name_es), name_es), updated_at = NOW()`,
      [String(club_name).slice(0, 255), String(logo_url), name_fr || null, name_en || null, name_es || null]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[club-logos] POST error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Club directory (populated from Livescore) ──────────────────────────────
app.get("/api/club-directory", async (_req, res) => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS club_directory (
        club_name VARCHAR(255) NOT NULL PRIMARY KEY,
        competition VARCHAR(255) NOT NULL DEFAULT '',
        country VARCHAR(255) NOT NULL DEFAULT '',
        country_code VARCHAR(10) NOT NULL DEFAULT '',
        logo_url TEXT NULL,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_club_dir_competition (competition),
        INDEX idx_club_dir_country (country)
      )
    `).catch(() => {});
    const [rows] = await pool.query(
      "SELECT club_name, competition, country, country_code, logo_url FROM club_directory ORDER BY country, competition, club_name"
    );
    return res.json(rows);
  } catch (err) {
    console.error("[club-directory] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── League logos (from league_name_mappings + user_followed_leagues) ─────────
app.get("/api/league-logos", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT app_league_name AS league_name, api_league_logo AS logo_url
       FROM league_name_mappings
       WHERE api_league_logo IS NOT NULL AND api_league_logo != ''`
    );
    return res.json(rows);
  } catch (err) {
    console.error("[league-logos] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Player photo helpers ────────────────────────────────────────────────────

// Returns true if strings differ by at most one character (substitution, insertion, or deletion)
function editDist1(a, b) {
  if (a === b) return true;
  const d = a.length - b.length;
  if (d > 1 || d < -1) return false;
  if (d === 0) {
    let diff = 0;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i] && ++diff > 1) return false;
    return true;
  }
  const [s, l] = a.length < b.length ? [a, b] : [b, a];
  let si = 0, li = 0, skipped = false;
  while (si < s.length && li < l.length) {
    if (s[si] === l[li]) { si++; li++; }
    else if (!skipped) { skipped = true; li++; }
    else return false;
  }
  return true;
}

function normalizeStr(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesMatch(playerName, candidateName) {
  const a = normalizeStr(playerName);
  const b = normalizeStr(candidateName);
  if (a === b) return true;

  const aParts = a.split(' ').filter(Boolean);
  const bParts = b.split(' ').filter(Boolean);
  const aLast = aParts[aParts.length - 1];
  const bLast = bParts[bParts.length - 1];

  if (!aLast || !bLast || aLast.length < 3) return false;
  if (aParts.length === 1 || bParts.length === 1) return aLast === bLast;

  const aFirst = aParts[0];
  const bFirst = bParts[0];

  if (aLast === bLast) {
    if (aFirst === bFirst) return true;
    if (aFirst[0] === bFirst[0]) return true;
    // Handle middle names: "Erling Haaland" vs "Erling Braut Haaland"
    if (bParts.includes(aFirst) || aParts.includes(bFirst)) return true;
    // Fuzzy first name: 1 character typo e.g. "Anas" → "Anan" (substitution, insertion, deletion)
    if (aFirst.length >= 4 && bFirst.length >= 4 && editDist1(aFirst, bFirst)) return true;
  }

  // Token containment: handles compound Latino names like "Luis Diaz" ⊂ "Luis Fernando Diaz Marulanda"
  // All significant tokens (≥3 chars) from the shorter name must appear in the longer name
  const sigA = aParts.filter(p => p.length >= 3);
  const sigB = bParts.filter(p => p.length >= 3);
  if (sigA.length >= 2 && sigA.every(t => sigB.includes(t))) return true;
  if (sigB.length >= 2 && sigB.every(t => sigA.includes(t))) return true;

  return false;
}

// ── Source 1: Wikidata (primary — free, server-friendly, comprehensive) ──────
const WD_HEADERS = { 'User-Agent': 'ScoutHub/1.0 (player-photo-enrichment; nodejs)' };

// Terms that appear in Wikidata descriptions for footballers across languages
const FOOTBALL_DESC_TERMS = [
  'footballer', 'soccer player', 'football player',
  'futbolista', 'footballeur', 'futebolista',
  'fußballspieler', 'calciatore', 'calciatrice',
  'voetballer', 'fotballspiller',
];

async function fetchPhotoFromWikidata(player) {
  // 1. Search Wikidata entities by name
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(player.name)}&language=en&type=item&format=json&limit=5`;
  const searchResp = await fetch(searchUrl, { headers: WD_HEADERS });
  if (!searchResp.ok) return null;
  const entities = (await searchResp.json())?.search || [];

  let matchId = null;
  for (const entity of entities) {
    if (!namesMatch(player.name, entity.label || '')) continue;
    const desc = (entity.description || '').toLowerCase();

    // Must be described as a footballer
    if (!FOOTBALL_DESC_TERMS.some(t => desc.includes(t))) continue;

    // Cross-check birth year if available — Wikidata descriptions often say "(born 1998)"
    if (player.generation) {
      const m = desc.match(/born\s+(\d{4})/);
      if (m && Math.abs(parseInt(m[1], 10) - player.generation) > 1) continue;
    }

    matchId = entity.id;
    break;
  }
  if (!matchId) return null;

  // 2. Fetch entity claims to get P18 (image)
  const entityResp = await fetch(
    `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${matchId}&props=claims&format=json`,
    { headers: WD_HEADERS }
  );
  if (!entityResp.ok) return null;
  const claims = (await entityResp.json())?.entities?.[matchId]?.claims;
  const imageName = claims?.P18?.[0]?.mainsnak?.datavalue?.value;
  if (!imageName) return null;

  // 3. Get actual thumbnail URL from Wikimedia Commons
  const safeFile = encodeURIComponent(imageName.replace(/ /g, '_'));
  const commonsResp = await fetch(
    `https://commons.wikimedia.org/w/api.php?action=query&titles=File:${safeFile}&prop=imageinfo&iiprop=url&iiurlwidth=300&format=json`,
    { headers: WD_HEADERS }
  );
  if (!commonsResp.ok) return null;
  const commonsData = await commonsResp.json();
  const cPage = Object.values(commonsData?.query?.pages || {})[0];
  return cPage?.imageinfo?.[0]?.thumburl || null;
}

// ── Source 2: TheSportsDB (secondary — blocked by Cloudflare in some envs) ──
const TSDB_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Origin': 'https://www.thesportsdb.com',
  'Referer': 'https://www.thesportsdb.com/',
};

async function fetchPhotoFromSportsDB(player) {
  try {
    const apiKey = process.env.THESPORTSDB_API_KEY || '3';
    const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(player.name)}`;
    const resp = await fetch(url, { headers: TSDB_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.player?.length) return null;

    const playerClub = normalizeStr(player.club || '');
    const playerNat = normalizeStr(player.nationality || '');

    for (const c of data.player) {
      if (!namesMatch(player.name, c.strPlayer)) continue;
      if ((c.strSport || '').toLowerCase() === 'soccer' || (c.strSport || '').toLowerCase() === 'football' || !c.strSport) {
        const born = c.dateBorn ? parseInt(c.dateBorn.slice(0, 4), 10) : null;
        if (player.generation && born && Math.abs(born - player.generation) > 2) continue;
        const teamNorm = normalizeStr(c.strTeam || '');
        const natNorm = normalizeStr(c.strNationality || '');
        const ok = (playerClub && teamNorm && (teamNorm.includes(playerClub) || playerClub.includes(teamNorm)))
          || (playerNat && natNorm && (natNorm.includes(playerNat) || playerNat.includes(natNorm)))
          || (player.generation && born && Math.abs(born - player.generation) <= 1);
        if (ok) return c.strThumb || c.strCutout || null;
      }
    }
  } catch { /* blocked or network error — silently skip */ }
  return null;
}

// ── Source 2: Wikipedia (multilingual fallback) ─────────────────────────────
const WP_HEADERS = { 'User-Agent': 'ScoutHub/1.0 (player-photo-enrichment; contact@scouthub.app)' };

const FOOTBALL_TERMS_BY_LANG = {
  en: ['footballer', 'football player', 'soccer player', 'striker', 'midfielder', 'defender', 'goalkeeper', 'forward', 'winger', 'centre-back', 'association football'],
  fr: ['footballeur', 'joueur de football', 'attaquant', 'milieu de terrain', 'défenseur', 'gardien de but', 'ailier'],
  es: ['futbolista', 'jugador de fútbol', 'delantero', 'centrocampista', 'defensa', 'portero'],
  pt: ['futebolista', 'jogador de futebol', 'avançado', 'médio', 'defesa', 'guarda-redes'],
};

const YEAR_PATTERNS_BY_LANG = {
  en: /born[^()\d]*(\d{4})/,
  fr: /n[ée][^()\d]*(\d{4})/,
  es: /nacido[^()\d]*(\d{4})|nacimiento[^()\d]*(\d{4})/,
  pt: /nascido[^()\d]*(\d{4})|nascimento[^()\d]*(\d{4})/,
};

function findWikipediaMatch(player, searchResults, lang = 'en') {
  const footballTerms = FOOTBALL_TERMS_BY_LANG[lang] || FOOTBALL_TERMS_BY_LANG.en;
  const yearPattern = YEAR_PATTERNS_BY_LANG[lang] || YEAR_PATTERNS_BY_LANG.en;

  for (const result of searchResults) {
    if (!namesMatch(player.name, result.title)) continue;
    const snippet = (result.snippet || '').toLowerCase().replace(/<[^>]+>/g, '');
    if (!footballTerms.some(term => snippet.includes(term))) continue;
    if (player.generation) {
      const yearMatch = snippet.match(yearPattern);
      if (yearMatch) {
        const bornYear = parseInt(yearMatch[1] || yearMatch[2], 10);
        if (Math.abs(bornYear - player.generation) > 1) continue;
      }
    }
    return result;
  }
  return null;
}

async function tryWikipediaSearch(player, base, query, lang) {
  const searchUrl = `${base}/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&srlimit=5`;
  const searchResp = await fetch(searchUrl, { headers: WP_HEADERS });
  if (!searchResp.ok) return null;
  const searchData = await searchResp.json();
  const results = searchData?.query?.search || [];
  if (!results.length) return null;

  const match = findWikipediaMatch(player, results, lang);
  if (!match) return null;

  const imgUrl = `${base}/w/api.php?action=query&titles=${encodeURIComponent(match.title)}&prop=pageimages&format=json&pithumbsize=300&piprop=thumbnail`;
  const imgResp = await fetch(imgUrl, { headers: WP_HEADERS });
  if (!imgResp.ok) return null;
  const imgData = await imgResp.json();
  const page = Object.values(imgData?.query?.pages || {})[0];
  return page?.thumbnail?.source || null;
}

async function fetchPhotoFromWikipedia(player) {
  const langSearches = [
    { base: 'https://en.wikipedia.org', lang: 'en', term: 'footballer' },
    { base: 'https://fr.wikipedia.org', lang: 'fr', term: 'footballeur' },
    { base: 'https://es.wikipedia.org', lang: 'es', term: 'futbolista' },
    { base: 'https://pt.wikipedia.org', lang: 'pt', term: 'futebolista' },
  ];
  for (const { base, lang, term } of langSearches) {
    const photoUrl = await tryWikipediaSearch(player, base, `${player.name} ${term}`, lang);
    if (photoUrl) return photoUrl;
  }
  return null;
}

// ── Source 4: Transfermarkt (last resort — heavier scraping) ─────────────────
async function fetchPhotoFromTransfermarkt(player) {
  try {
    const result = await fetchPlayerDataFromTransfermarkt(player);
    return result?.photoUrl || null;
  } catch { return null; }
}

// ── Combined: Wikidata → TheSportsDB → Wikipedia → Transfermarkt ─────────────
async function fetchPhotoForPlayer(player) {
  const wdPhoto = await fetchPhotoFromWikidata(player);
  if (wdPhoto) return wdPhoto;

  const tsdbPhoto = await fetchPhotoFromSportsDB(player);
  if (tsdbPhoto) return tsdbPhoto;

  const wpPhoto = await fetchPhotoFromWikipedia(player);
  if (wpPhoto) return wpPhoto;

  return fetchPhotoFromTransfermarkt(player);
}

// ── Debug endpoint (remove in production) ───────────────────────────────────
// GET /api/debug/photo-test?name=Mbappe&club=Real+Madrid&nationality=France&generation=1998
app.get("/api/debug/photo-test", authMiddleware, async (req, res) => {
  const { name = 'Mbappe', club = '', nationality = '', generation = '' } = req.query;
  const player = { name: String(name), club: String(club), nationality: String(nationality), generation: generation ? parseInt(generation, 10) : null };
  const out = {};

  // Raw TheSportsDB call
  try {
    const url = `https://www.thesportsdb.com/api/v1/json/3/searchplayers.php?p=${encodeURIComponent(player.name)}`;
    const resp = await fetch(url, { headers: TSDB_HEADERS });
    const body = resp.ok ? await resp.json() : await resp.text();
    out.tsdb = { status: resp.status, ok: resp.ok, body };
    if (resp.ok && body.player?.length) {
      out.tsdb.matchResult = findSportsDBMatch(player, body.player);
    }
  } catch (e) { out.tsdb = { error: e.message }; }

  // Raw Wikipedia call
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(player.name + ' footballer')}&format=json&srlimit=3`;
    const resp = await fetch(url, { headers: WP_HEADERS });
    const body = resp.ok ? await resp.json() : await resp.text();
    out.wikipedia = { status: resp.status, ok: resp.ok, results: body?.query?.search?.slice(0, 2) };
  } catch (e) { out.wikipedia = { error: e.message }; }

  // Full pipeline result
  try { out.finalPhoto = await fetchPhotoForPlayer(player); } catch (e) { out.finalPhotoError = e.message; }

  return res.json(out);
});

// ────────────────────────────────────────────────────────────────────────────
// PLAYER ENRICHMENT HELPERS
// ────────────────────────────────────────────────────────────────────────────

/**
 * Fetch player data from TheSportsDB. Returns the best matching player object.
 */
async function fetchPlayerDataFromSportsDB(player) {
  try {
    const apiKey = process.env.THESPORTSDB_API_KEY || '3';
    const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(player.name)}`;
    const resp = await fetch(url, { headers: TSDB_HEADERS });
    if (!resp.ok) return null;
    const data = await resp.json();
    if (!data.player?.length) return null;

    const playerClub = normalizeStr(player.club || '');
    const playerNat = normalizeStr(player.nationality || '');

    let bestMatch = null;
    let bestScore = -1;

    for (const c of data.player) {
      if (!namesMatch(player.name, c.strPlayer || '')) continue;
      const sport = (c.strSport || '').toLowerCase();
      if (sport && sport !== 'soccer' && sport !== 'football') continue;

      const born = c.dateBorn ? parseInt(c.dateBorn.slice(0, 4), 10) : null;
      if (player.generation && born && Math.abs(born - player.generation) > 2) continue;

      let score = 0;
      if (player.generation && born && Math.abs(born - player.generation) <= 1) score += 3;
      const teamNorm = normalizeStr(c.strTeam || '');
      const natNorm = normalizeStr(c.strNationality || '');
      if (playerClub && teamNorm && (teamNorm.includes(playerClub) || playerClub.includes(teamNorm))) score += 5;
      if (playerNat && natNorm && (natNorm.includes(playerNat) || playerNat.includes(natNorm))) score += 2;

      if (score > bestScore) {
        bestScore = score;
        bestMatch = c;
      }
    }

    return bestMatch;
  } catch (e) {
    console.error('[enrich] TheSportsDB error:', e.message);
    return null;
  }
}

/**
 * Fetch player data from Wikidata. Returns structured data including
 * date of birth, height, nationalities (Q-IDs), career teams.
 */
async function fetchPlayerDataFromWikidata(player) {
  try {
    const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(player.name)}&language=en&type=item&format=json&limit=8`;
    const searchResp = await fetch(searchUrl, { headers: WD_HEADERS });
    if (!searchResp.ok) return null;
    const entities = (await searchResp.json())?.search || [];

    let matchId = null;
    for (const entity of entities) {
      if (!namesMatch(player.name, entity.label || '')) continue;
      const desc = (entity.description || '').toLowerCase();
      if (!FOOTBALL_DESC_TERMS.some(t => desc.includes(t))) continue;
      if (player.generation) {
        const m = desc.match(/born[^\d]*(\d{4})/);
        if (m && Math.abs(parseInt(m[1], 10) - player.generation) > 1) continue;
      }
      matchId = entity.id;
      break;
    }
    if (!matchId) return null;

    const entityResp = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${matchId}&props=claims&format=json`,
      { headers: WD_HEADERS }
    );
    if (!entityResp.ok) return null;
    const entityData = await entityResp.json();
    const claims = entityData?.entities?.[matchId]?.claims || {};

    const result = { wikidataId: matchId };

    // P569: date of birth
    const dobVal = claims.P569?.[0]?.mainsnak?.datavalue?.value;
    if (dobVal?.time) {
      const raw = dobVal.time.replace(/^\+/, '');
      const datePart = raw.slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && !datePart.endsWith('00-00') && !datePart.endsWith('-00')) {
        result.dateOfBirth = datePart;
      }
    }

    // P27: country of citizenship (can be multiple)
    result.citizenshipIds = (claims.P27 || [])
      .map(c => c.mainsnak?.datavalue?.value?.id)
      .filter(Boolean);

    // P2048: height in cm
    const hVal = claims.P2048?.[0]?.mainsnak?.datavalue?.value;
    if (hVal?.amount) {
      const unit = hVal.unit || '';
      const amount = parseFloat(hVal.amount);
      if (unit.includes('Q174728')) {
        // centimetre
        result.heightCm = Math.round(amount);
      } else if (unit.includes('Q11573')) {
        // metre
        result.heightCm = Math.round(amount * 100);
      } else if (unit === '1') {
        // assume cm if reasonable
        if (amount > 100 && amount < 250) result.heightCm = Math.round(amount);
      }
    }

    // P54: member of sports team (career)
    result.teamMembershipIds = (claims.P54 || []).map(tc => {
      const teamId = tc.mainsnak?.datavalue?.value?.id;
      const q = tc.qualifiers || {};
      const startRaw = q.P580?.[0]?.datavalue?.value?.time;
      const endRaw = q.P582?.[0]?.datavalue?.value?.time;
      const parseWdDate = (t) => t ? t.replace(/^\+/, '').slice(0, 10) : null;
      return { teamId, startDate: parseWdDate(startRaw), endDate: parseWdDate(endRaw) };
    }).filter(t => t.teamId);

    // P19: place of birth (Q-ID, will resolve label separately)
    result.birthPlaceId = claims.P19?.[0]?.mainsnak?.datavalue?.value?.id || null;

    // P1533: contract period end — must be a plausible future contract date
    const contractEndVal = claims.P1533?.[0]?.mainsnak?.datavalue?.value;
    if (contractEndVal?.time) {
      const raw = contractEndVal.time.replace(/^\+/, '').slice(0, 10);
      const year = parseInt(raw.slice(0, 4), 10);
      if (year >= 2020) { // reject historical/corrupt dates
        if (/^\d{4}-00-00$/.test(raw)) {
          result.contractEnd = `${year}-06-30`;
        } else if (/^\d{4}-\d{2}-\d{2}$/.test(raw) && !raw.endsWith('-00')) {
          result.contractEnd = raw;
        }
      }
    }

    return result;
  } catch (e) {
    console.error('[enrich] Wikidata error:', e.message);
    return null;
  }
}

/**
 * Resolve a list of Wikidata entity IDs to their English labels.
 * Returns a Map<id, label>.
 */
async function resolveWikidataLabels(ids) {
  const map = new Map();
  if (!ids || ids.length === 0) return map;
  try {
    const unique = [...new Set(ids)].slice(0, 50); // Wikidata limit
    const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${unique.join('|')}&props=labels&languages=en,fr&format=json`;
    const resp = await fetch(url, { headers: WD_HEADERS });
    if (!resp.ok) return map;
    const data = await resp.json();
    for (const [id, ent] of Object.entries(data.entities || {})) {
      const label = ent.labels?.fr?.value || ent.labels?.en?.value;
      if (label) map.set(id, label);
    }
  } catch (e) {
    console.error('[enrich] Wikidata labels error:', e.message);
  }
  return map;
}

const TM_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'fr-FR,fr;q=0.9',
  'Accept': 'text/html,application/xhtml+xml',
};

// French month abbreviations → month number
const FR_MONTHS = { janv:1, févr:2, mars:3, avr:4, mai:5, juin:6, juil:7, août:8, sept:9, oct:10, nov:11, déc:12 };

function parseFrDate(str) {
  if (!str) return null;
  const m = String(str).trim().match(/(\d{1,2})\s+([^\s\d]+)\.?\s+(\d{4})/);
  if (!m) return null;
  const key = m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 4);
  const frKey = Object.keys(FR_MONTHS).find(k => k.normalize('NFD').replace(/[\u0300-\u036f]/g, '').slice(0, 4) === key);
  const month = frKey ? FR_MONTHS[frKey] : null;
  if (!month || parseInt(m[3]) < 2020) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

// Extract inner text between two HTML markers (strips tags)
function extractBetween(html, before, after) {
  const idx = html.indexOf(before);
  if (idx === -1) return null;
  const start = idx + before.length;
  const end = html.indexOf(after, start);
  if (end === -1) return null;
  return html.slice(start, end).replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Scrape player profile from Transfermarkt (fr locale, no API key).
 * Returns { tmId, contract, heightCm, agent, marketValue, currentClub }.
 */
async function fetchPlayerDataFromTransfermarkt(player, tmPath = null) {
  try {
    const opts = { headers: TM_HEADERS, signal: AbortSignal.timeout(12000) };

    // ── 1. Search (with fallback queries for typos / compound names) ──────────
    const rowRe = /href="(\/([^/]+)\/profil\/spieler\/(\d+))"[^>]*>([^<]+)<\/a>(?:.*?zentriert">(\d+)<\/td>)?(?:.*?rechts hauptlink">\s*([^<]*)<\/td>)?(?:.*?berater\/\d+">\s*([^<]*)<\/a>)?/gs;
    const playerClubNorm = normalizeStr(player.club || '');

    let best = null, bestScore = -1;

    if (tmPath) {
      // Direct path provided by user — skip search entirely
      const idM = tmPath.match(/\/spieler\/(\d+)/);
      if (!idM) return null;
      best = { id: idM[1], path: tmPath, mktVal: null, agent: null };
    } else {
      // Build ordered search queries: full name → first+last only → last name only
      // Fallback queries help when: (a) middle names cause TM to miss results, (b) there's a typo in a prefix
      const nameParts = player.name.trim().split(/\s+/);
      const searchQueries = [player.name];
      if (nameParts.length > 2) searchQueries.push(`${nameParts[0]} ${nameParts[nameParts.length - 1]}`);
      if (nameParts.length >= 2) searchQueries.push(nameParts[nameParts.length - 1]);

      for (let qi = 0; qi < searchQueries.length; qi++) {
        if (qi > 0 && best) break; // Found on previous attempt — no need to continue
        const isFallback = qi > 0;
        if (isFallback) await new Promise(r => setTimeout(r, 400));

        const searchUrl = `https://www.transfermarkt.fr/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(searchQueries[qi])}&Spieler_page=1`;
        const searchResp = await fetch(searchUrl, opts);
        if (!searchResp.ok) continue;
        const searchHtml = await searchResp.text();

        for (const m of searchHtml.matchAll(rowRe)) {
          const [, path, , id, name, age, mktVal, agent] = m;
          if (!namesMatch(player.name, name)) continue;
          let score = 0;
          if (player.generation && age && Math.abs(new Date().getFullYear() - parseInt(age) - player.generation) <= 1) score += 3;
          // Try to find club in surrounding HTML context
          const ctxStart = searchHtml.indexOf(path);
          const ctxEnd = Math.min(ctxStart + 800, searchHtml.length);
          const ctx = searchHtml.slice(ctxStart, ctxEnd);
          const clubM = ctx.match(/startseite\/verein\/\d+"[^>]*>([^<]+)<\/a>/i);
          if (clubM && playerClubNorm) {
            const cNorm = normalizeStr(clubM[1]);
            if (cNorm.includes(playerClubNorm.slice(0, 5)) || playerClubNorm.includes(cNorm.slice(0, 5))) score += 5;
          }
          // Fallback queries are ambiguous — require club/generation match OR very close first names
          // "Very close" = same last name + first names within edit distance 1 (catches typos like "Anas" → "Anan")
          if (isFallback && score < 3) {
            const aN = normalizeStr(player.name).split(' ').filter(Boolean);
            const bN = normalizeStr(name).split(' ').filter(Boolean);
            const aF = aN[0] || '', bF = bN[0] || '';
            const aL = aN[aN.length - 1] || '', bL = bN[bN.length - 1] || '';
            const lastsMatch = aL.length >= 3 && aL === bL;
            const firstsClose = aF.length >= 3 && bF.length >= 3 && editDist1(aF, bF);
            if (!lastsMatch || !firstsClose) continue;
          }
          if (score > bestScore || !best) { bestScore = score; best = { id, path, mktVal: mktVal?.trim() || null, agent: agent?.trim() || null }; }
        }

        // Fallback: first href matching name (first query only, no extra validation needed)
        if (!best && !isFallback) {
          const fm = searchHtml.match(/href="(\/[^/]+\/profil\/spieler\/(\d+))"[^>]*>([^<]+)<\/a>/);
          if (fm && namesMatch(player.name, fm[3])) best = { id: fm[2], path: fm[1], mktVal: null, agent: null };
        }
      }
    }

    if (!best) return null;

    // ── 2. Profile page ────────────────────────────────────────────────────
    await new Promise(r => setTimeout(r, 500));
    const profileResp = await fetch(`https://www.transfermarkt.fr${best.path}`, opts);
    if (!profileResp.ok) return null;
    const html = await profileResp.text();

    // Contract end: "Contrat jusqu'à:" → bold span
    const contractRaw = extractBetween(html, "Contrat jusqu\u2019\u00e0:</span>", "</span>")
      || extractBetween(html, "Contrat jusqu'à:</span>", "</span>")
      || extractBetween(html, "Contrat jusqu&#x27;à:", "</span>");
    const contract = parseFrDate(contractRaw);

    // Height: "Taille:" → bold span
    const heightRaw = extractBetween(html, 'Taille:</span>', '</span>');
    let heightCm = null;
    if (heightRaw) {
      const hm = heightRaw.replace(',', '.').match(/([\d.]+)\s*m/);
      if (hm) heightCm = Math.round(parseFloat(hm[1]) * 100);
    }

    // Agent (prefer profile link text over search)
    const agentRaw = extractBetween(html, 'Agent du joueur:</span>', '</span>');
    const agent = (agentRaw && agentRaw.length < 80) ? agentRaw : (best.agent || null);

    // Market value from data-header banner
    const mvM = html.match(/data-header__market-value-wrapper[^>]*>\s*([\d\s,.]+)\s*<span class="waehrung">([^<]+)<\/span>/);
    const marketValue = mvM ? `${mvM[1].trim()} ${mvM[2].trim()}` : (best.mktVal || null);

    // Current club: extract title attribute from club link after "Club actuel"
    const clubBlock = html.slice(html.indexOf('Club actuel'));
    const clubTitleM = clubBlock.match(/title="([^"]+)"\s+href="\/[^"]+\/startseite\/verein\//);
    const currentClub = clubTitleM ? clubTitleM[1] : null;

    // Loan detection: TM uses a ribbon in data-header with:
    //   <a title="Prêté par: Club Name ; retour le: 30 juin 2026" href="..."><span>En prêt</span></a>
    let onLoan = false;
    let parentClub = null;
    let loanEndDate = null;
    let parentContractEnd = null;
    const ribbonM = html.match(/data-header__ribbon[^>]*>\s*<a\s+title="([^"]+)"[^>]*><span>[^<]*pr[êeè]t[^<]*<\/span>/i);
    if (ribbonM) {
      onLoan = true;
      const ribbonTitle = ribbonM[1];
      // Parse "Prêté par: Newcastle United ; retour le: 30 juin 2026"
      const parentM = ribbonTitle.match(/pr[êeé]t[eéè]?\s*(?:par|de)\s*:\s*([^;]+)/i);
      if (parentM) parentClub = parentM[1].trim();
      const returnM = ribbonTitle.match(/retour\s*(?:le)?\s*:\s*(.+)/i);
      if (returnM) loanEndDate = parseFrDate(returnM[1].trim());
    }
    // Fallback: check for "En prêt" text in ribbon without title parsing
    if (!onLoan) {
      const ribbonSimple = html.match(/>En pr[êeè]t<\/span>/i);
      if (ribbonSimple) onLoan = true;
    }

    // For loaned players: "En contrat là-bas jusqu'à:" = contract end with PARENT club
    // Note: TM uses U+2019 (') not U+0027 (') for the apostrophe
    if (onLoan) {
      const parentContractRaw = extractBetween(html, "contrat l\u00e0-bas jusqu\u2019\u00e0:</span>", "</span>")
        || extractBetween(html, "contrat là-bas jusqu'à:</span>", "</span>")
        || extractBetween(html, "contrat là-bas jusqu&#x27;à:</span>", "</span>");
      parentContractEnd = parseFrDate(parentContractRaw);
    }

    // Player photo: extract from data-header profile image
    let photoUrl = null;
    const photoM = html.match(/data-header__profile-image[^>]*src="([^"]+)"/);
    if (photoM && photoM[1] && !photoM[1].includes('default.jpg') && !photoM[1].includes('placeholder')) {
      photoUrl = photoM[1];
    }
    // Fallback: og:image meta tag (often the player photo)
    if (!photoUrl) {
      const ogM = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
      if (ogM && ogM[1] && !ogM[1].includes('default') && !ogM[1].includes('placeholder') && ogM[1].includes('portrait')) {
        photoUrl = ogM[1];
      }
    }

    // Club logo: extract from club link image near "Club actuel"
    let clubLogoUrl = null;
    if (clubBlock) {
      const logoM = clubBlock.match(/src="([^"]+)"[^>]*alt="[^"]*"[^>]*class="[^"]*tiny_wappen/);
      if (logoM) clubLogoUrl = logoM[1];
      // Fallback: any wappen/crest image in the club block
      if (!clubLogoUrl) {
        const logoM2 = clubBlock.match(/startseite\/verein\/[^"]*"[^>]*>\s*<img[^>]*src="([^"]+)"/);
        if (logoM2) clubLogoUrl = logoM2[1];
      }
      // Fallback: look for inline club logo in data-header
      if (!clubLogoUrl) {
        const headerBlock = html.slice(html.indexOf('data-header__club'), html.indexOf('data-header__club') + 500);
        const logoM3 = headerBlock.match(/src="([^"]+(?:wappen|head)[^"]+)"/);
        if (logoM3) clubLogoUrl = logoM3[1];
      }
    }

    console.log(`[TM] ${player.name} → contract:${contract} agent:${agent} value:${marketValue} height:${heightCm}cm club:${currentClub} onLoan:${onLoan} parentClub:${parentClub} loanEnd:${loanEndDate} parentContract:${parentContractEnd} photo:${!!photoUrl} logo:${!!clubLogoUrl}`);
    return { tmId: best.id, contract, heightCm, agent, marketValue, currentClub, onLoan, parentClub, loanEndDate, parentContractEnd, photoUrl, clubLogoUrl };
  } catch (e) {
    console.error('[enrich] Transfermarkt scrape error:', e.message);
    return null;
  }
}

// Static club→league mapping (source de vérité — prioritaire sur les APIs externes)
let STATIC_CLUB_TO_LEAGUE = {};
try { STATIC_CLUB_TO_LEAGUE = require('../src/data/club-to-league.json'); } catch {}

// ── Shared enrichment logic (single source of truth for all enrichment paths) ──
async function enrichOnePlayer(playerInfo, row, tmPath = null) {
  const [tsdb, wd, tm] = await Promise.all([
    fetchPlayerDataFromSportsDB(playerInfo),
    fetchPlayerDataFromWikidata(playerInfo),
    fetchPlayerDataFromTransfermarkt(playerInfo, tmPath),
  ]);

  let ext = {};
  try { ext = JSON.parse(row.external_data || '{}') || {}; } catch {}
  const oldAgent = ext.agent || null;

  let dateOfBirth = row.date_of_birth
    ? (row.date_of_birth.toISOString?.()?.slice(0, 10) || String(row.date_of_birth).slice(0, 10))
    : null;
  let contractEnd = null; // always recalculate — clears stale values
  let newClub = row.club;
  let newLeague = row.league;

  // ── TheSportsDB ──────────────────────────────────────────────────────
  if (tsdb) {
    if (tsdb.strHeight) {
      const feetM = String(tsdb.strHeight).match(/(\d+)'(\d+)/);
      if (feetM) ext.height = `${Math.round(parseInt(feetM[1]) * 30.48 + parseInt(feetM[2]) * 2.54)} cm`;
      else if (String(tsdb.strHeight).match(/\d/)) ext.height = tsdb.strHeight.trim().includes('cm') ? tsdb.strHeight.trim() : `${tsdb.strHeight.trim()} cm`;
    }
    if (tsdb.dateBorn && !dateOfBirth) dateOfBirth = tsdb.dateBorn;
    if (tsdb.strContractEnd) {
      const ce = String(tsdb.strContractEnd).trim();
      const ceYear = parseInt(ce.slice(0, 4), 10);
      if (!isNaN(ceYear) && ceYear >= new Date().getFullYear()) {
        if (/^\d{4}$/.test(ce)) contractEnd = `${ce}-06-30`;
        else if (/^\d{4}-\d{2}$/.test(ce)) contractEnd = `${ce}-30`;
        else if (/^\d{4}-\d{2}-\d{2}$/.test(ce)) contractEnd = ce;
      }
    }
    if (tsdb.strAgent) ext.agent = tsdb.strAgent;
    if (tsdb.strBirthLocation) ext.birth_location = tsdb.strBirthLocation;
    if (tsdb.strNumber) ext.shirt_number = tsdb.strNumber;
    if (tsdb.dateSigned) ext.date_signed = tsdb.dateSigned;
    if (tsdb.strSigning) ext.signing_fee = tsdb.strSigning;
    if (tsdb.strWage) ext.wage = tsdb.strWage;
    const desc = tsdb.strDescriptionFR || tsdb.strDescriptionEN || tsdb.strDescriptionDE || tsdb.strDescriptionES || tsdb.strDescriptionPT;
    if (desc) ext.description = desc;
    if (tsdb.idPlayer) ext.thesportsdb_id = tsdb.idPlayer;
    if (tsdb.strTeam && normalizeStr(tsdb.strTeam) !== normalizeStr(row.club)) {
      newClub = tsdb.strTeam;
      // Static mapping wins over TheSportsDB (which can have wrong league data)
      if (tsdb.strLeague) newLeague = STATIC_CLUB_TO_LEAGUE[tsdb.strTeam] || STATIC_CLUB_TO_LEAGUE[row.club] || tsdb.strLeague;
    } else {
      // Even without club change, correct wrong league using static mapping
      const staticLeague = STATIC_CLUB_TO_LEAGUE[row.club];
      if (staticLeague) newLeague = staticLeague;
    }
    if (tsdb.strSigning && !ext.market_value) ext.market_value = tsdb.strSigning;
  }

  // ── Wikidata ─────────────────────────────────────────────────────────
  if (wd) {
    if (wd.dateOfBirth) dateOfBirth = wd.dateOfBirth;
    if (wd.contractEnd) contractEnd = wd.contractEnd; // overrides TSDB
    if (wd.heightCm && !ext.height) ext.height = `${wd.heightCm} cm`;
    ext.wikidata_id = wd.wikidataId;

    const idsToResolve = [
      ...(wd.citizenshipIds || []),
      ...(wd.teamMembershipIds || []).map(t => t.teamId),
      wd.birthPlaceId,
    ].filter(Boolean);
    const labelMap = await resolveWikidataLabels(idsToResolve);

    if (wd.citizenshipIds?.length > 0) {
      const countryNames = wd.citizenshipIds.map(id => labelMap.get(id)).filter(Boolean);
      const registeredNat = normalizeStr(row.nationality || '');
      const others = countryNames.filter(n => normalizeStr(n) !== registeredNat);
      if (others.length > 0) ext.nationality2 = others.join(', ');
      if (!row.nationality && countryNames.length > 0) ext.nationality_source = countryNames[0];
    }

    if (wd.teamMembershipIds?.length > 0) {
      const isNationalTeam = (label) => {
        const n = label.toLowerCase();
        return n.includes('national') || n.includes('équipe de ') || n.includes('équipe nationale') ||
          n.includes('selección') || n.includes('seleção') || n.includes('nazionale') ||
          n.includes('mannschaft') || n.includes('auswahl') || n.includes('elftal') ||
          n.includes('landshold') || n.includes('landslaget') || n.includes('espoirs');
      };
      const allEntries = wd.teamMembershipIds
        .map(t => ({ club: labelMap.get(t.teamId) || t.teamId, from: t.startDate, to: t.endDate }))
        .filter(t => t.club && !t.club.startsWith('Q'));
      ext.career = allEntries.filter(e => !isNationalTeam(e.club));
      ext.national_career = allEntries.filter(e => isNationalTeam(e.club));
    }

    if (wd.birthPlaceId) {
      const bp = labelMap.get(wd.birthPlaceId);
      if (bp) ext.birth_location = bp;
    }
  }

  // ── Transfermarkt (highest priority: contract, agent, market value, club) ──
  if (tm) {
    if (tm.onLoan) {
      // Player is on loan: TM "Contrat jusqu'à" = loan end date, NOT parent club contract
      // Use "En contrat là-bas jusqu'à" for the real contract end with parent club
      ext.on_loan = true;
      if (tm.parentClub) ext.parent_club = tm.parentClub;
      if (tm.loanEndDate) ext.loan_end_date = tm.loanEndDate;
      else if (tm.contract) ext.loan_end_date = tm.contract; // fallback: TM "contract" is actually the loan end
      if (tm.parentContractEnd) contractEnd = tm.parentContractEnd; // real contract with parent club
    } else {
      if (tm.contract) contractEnd = tm.contract; // overrides TSDB + Wikidata
      delete ext.on_loan;
      delete ext.parent_club;
      delete ext.loan_end_date;
    }
    if (tm.marketValue) ext.market_value = tm.marketValue;
    if (tm.agent) ext.agent = tm.agent;
    if (tm.tmId) ext.transfermarkt_id = tm.tmId;
    if (tm.heightCm && !ext.height) ext.height = `${tm.heightCm} cm`;
    if (tm.currentClub) newClub = tm.currentClub; // TM is most up-to-date
    delete ext.tm_not_found; // clear flag now that TM succeeded
  } else {
    ext.tm_not_found = true; // signal frontend to show manual-URL input
  }

  // ── Supplement career: force current club as open-ended entry ───────
  const currentClubForCareer = tm?.currentClub || tsdb?.strTeam;
  if (currentClubForCareer) {
    if (!ext.career) ext.career = [];
    const currentNorm = normalizeStr(currentClubForCareer);
    if (!ext.career.some(e => !e.to && normalizeStr(e.club || '') === currentNorm)) {
      ext.career = ext.career.map(e =>
        (!e.to && normalizeStr(e.club || '') !== currentNorm) ? { ...e, to: tsdb?.dateSigned || null } : e
      );
      ext.career.push({ club: currentClubForCareer, from: tsdb?.dateSigned || null, to: null });
    }
  }

  // ── Detect meaningful changes for has_news flag ─────────────────────
  // Only flag when a NEW non-null value is found AND differs from old.
  // If a source returns nothing (null), we don't flag it as a change.
  const oldClub = (row.club || '').trim();
  const oldContract = row.contract_end
    ? (row.contract_end.toISOString?.()?.slice(0, 10) || String(row.contract_end).slice(0, 10))
    : null;
  const clubChanged = newClub && normalizeStr(newClub) !== normalizeStr(oldClub);
  const contractChanged = contractEnd && contractEnd !== oldContract;
  const agentChanged = ext.agent && ext.agent !== oldAgent;
  const newsItems = [];
  if (clubChanged) newsItems.push('club');
  if (contractChanged) newsItems.push('contract');
  if (agentChanged) newsItems.push('agent');
  const newsLabel = newsItems.length > 1 ? 'multiples' : newsItems[0] || null;

  // ── Build SET clauses ────────────────────────────────────────────────
  const setClauses = ['external_data = ?', 'external_data_fetched_at = NOW()', 'updated_at = NOW()', 'contract_end = ?'];
  const params = [JSON.stringify(ext), contractEnd];

  if (newsLabel) { setClauses.push('has_news = ?'); params.push(newsLabel); }

  if (dateOfBirth) { setClauses.push('date_of_birth = ?'); params.push(dateOfBirth); }
  if (ext.market_value) { setClauses.push('market_value = ?'); params.push(ext.market_value); }

  // Club: TM is authoritative — always write when TM returns one
  if (tm?.currentClub) {
    setClauses.push('club = ?');
    params.push(tm.currentClub);
  } else if (newClub && newClub !== row.club) {
    setClauses.push('club = ?');
    params.push(newClub);
  }

  if (newLeague && newLeague !== row.league) { setClauses.push('league = ?'); params.push(newLeague); }

  // ── TM photo: fill missing player photo ────────────────────────────
  if (tm?.photoUrl && !row.photo_url) {
    setClauses.push('photo_url = ?');
    params.push(tm.photoUrl);
  }

  // ── TM club logo: save to club_logos if not already present ────────
  if (tm?.clubLogoUrl && tm?.currentClub) {
    try {
      await pool.query(
        `INSERT INTO club_logos (club_name, logo_url) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE logo_url = IF(logo_url IS NULL OR logo_url = '', VALUES(logo_url), logo_url), updated_at = NOW()`,
        [tm.currentClub.slice(0, 255), tm.clubLogoUrl]
      );
    } catch (e) { console.error('[enrich] Failed to save TM club logo:', e.message); }
  }

  return { setClauses, params, tsdb, wd, tm, dateOfBirth, contractEnd, newClub };
}

// ────────────────────────────────────────────────────────────────────────────

app.post("/api/functions/:name", authMiddleware, async (req, res) => {
  const { name } = req.params;

  if (name === "check-subscription") {
    const [rows] = await pool.query("SELECT is_premium, premium_since FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
    const sub = rows[0];
    return res.json({
      subscribed: !!sub?.is_premium,
      source: sub?.is_premium ? "manual" : undefined,
      subscription_end: null,
      premium_since: sub?.premium_since || null,
    });
  }

  if (name === "enrich-player") {
    const { playerName, club, playerId, nationality, generation, tmUrl } = req.body || {};
    if (!playerName || !playerId) {
      return res.status(400).json({ error: 'Missing playerName or playerId' });
    }
    try {
      const [playerRows] = await pool.query(
        'SELECT id, name, club, league, nationality, date_of_birth, contract_end, external_data, photo_url FROM players WHERE id = ? AND user_id = ?',
        [playerId, req.user.id]
      );
      if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });

      const rec = playerRows[0];
      const playerInfo = {
        name: playerName,
        club: club || rec.club,
        nationality: nationality || rec.nationality,
        generation: generation ? parseInt(generation) : null,
      };

      // Extract TM path from manually-provided URL (e.g. https://www.transfermarkt.fr/luis-diaz/profil/spieler/534995)
      let tmPath = null;
      if (tmUrl) {
        try {
          const u = new URL(tmUrl.startsWith('http') ? tmUrl : `https://${tmUrl}`);
          if (u.hostname.includes('transfermarkt') && u.pathname.includes('/spieler/')) tmPath = u.pathname;
        } catch {}
      }

      const { setClauses, params, tsdb, wd, tm, contractEnd, newClub, dateOfBirth } = await enrichOnePlayer(playerInfo, rec, tmPath);
      params.push(playerId, req.user.id);
      await pool.query(`UPDATE players SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`, params);

      return res.json({
        success: true,
        sources: { thesportsdb: !!tsdb, wikidata: !!wd, transfermarkt: !!tm },
        tmNotFound: !tm,
        updated: { dob: !!dateOfBirth, contract: !!contractEnd, club: newClub !== rec.club, career: !!(wd?.teamMembershipIds?.length) },
      });
    } catch (err) {
      console.error('[enrich-player] Error:', err);
      return res.status(500).json({ error: 'Enrichment failed', detail: err.message });
    }
  }

  if (name === "enrich-all-players") {
    const [players] = await pool.query(
      'SELECT id, name, club, nationality, generation FROM players WHERE user_id = ? ORDER BY name',
      [req.user.id]
    );
    if (!players.length) return res.json({ total: 0, message: 'No players to enrich' });

    const total = players.length;
    res.json({ total, message: `Enrichissement de ${total} joueurs lancé en arrière-plan` });

    (async () => {
      let done = 0, errors = 0;
      for (const p of players) {
        try {
          const [rows] = await pool.query(
            'SELECT id, name, club, league, nationality, date_of_birth, contract_end, external_data, photo_url FROM players WHERE id = ?',
            [p.id]
          );
          if (!rows[0]) continue;
          const row = rows[0];
          const playerInfo = {
            name: row.name,
            club: row.club,
            nationality: row.nationality,
            generation: row.generation ? parseInt(row.generation) : null,
          };

          const { setClauses, params } = await enrichOnePlayer(playerInfo, row);
          params.push(p.id);
          await pool.query(`UPDATE players SET ${setClauses.join(', ')} WHERE id = ?`, params);
          done++;
          console.log(`[enrich-all] ${done}/${total} ${row.name} ✓`);
        } catch (e) {
          errors++;
          console.error(`[enrich-all] Error for ${p.name}:`, e.message);
        }
        // Polite delay to avoid TM rate-limit
        await new Promise(r => setTimeout(r, 1500));
      }
      console.log(`[enrich-all] Done: ${done} enriched, ${errors} errors`);
    })();

    return;
  }

  if (name === "fetch-player-photos") {
    try {
      const [players] = await pool.query(
        "SELECT id, name, club, nationality, generation FROM players WHERE user_id = ? AND (photo_url IS NULL OR photo_url = '')",
        [req.user.id]
      );

      let updated = 0;
      const total = players.length;
      const BATCH_SIZE = 10;

      for (let i = 0; i < players.length; i += BATCH_SIZE) {
        const batch = players.slice(i, i + BATCH_SIZE);
        const results = await Promise.all(batch.map(async (player) => {
          try {
            const photoUrl = await fetchPhotoForPlayer(player);
            if (photoUrl) {
              await pool.query(
                "UPDATE players SET photo_url = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
                [photoUrl, player.id, req.user.id]
              );
              return 1;
            }
          } catch (err) {
            console.error(`[fetch-player-photos] Failed for "${player.name}":`, err.message);
          }
          return 0;
        }));
        updated += results.reduce((a, b) => a + b, 0);

        // Small pause between batches to be polite to APIs
        if (i + BATCH_SIZE < players.length) {
          await new Promise(resolve => setTimeout(resolve, 150));
        }
      }

      return res.json({ success: true, updated, total });
    } catch (err) {
      console.error("[fetch-player-photos] Error:", err);
      return res.status(500).json({ error: "Erreur serveur lors de la récupération des photos" });
    }
  }

  // ── API-Football proxy functions ─────────────────────────────────
  if (name === "apifootball-search-leagues") {
    const { search } = req.body || {};
    if (!search) return res.status(400).json({ error: "Missing search" });
    try {
      const data = await apiFootballFetch("leagues", { search }, 1440); // 24h cache
      return res.json({ leagues: data.response || [] });
    } catch (err) {
      console.error("[apifootball-search-leagues]", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Resolve league → logo via API-Football ──────────────────────
  if (name === "resolve-league-logo") {
    const { league } = req.body || {};
    if (!league) return res.status(400).json({ error: "Missing league" });

    try {
      // 1. Check league_name_mappings cache first
      try {
        const [existing] = await pool.query(
          "SELECT api_league_logo FROM league_name_mappings WHERE app_league_name = ? AND api_league_logo IS NOT NULL AND api_league_logo != '' LIMIT 1",
          [league]
        );
        if (existing.length > 0) {
          return res.json({ logo: existing[0].api_league_logo, source: "cache" });
        }
      } catch { /* table may not exist yet */ }

      // 2. Search API-Football for the league
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        return res.json({ logo: null });
      }

      const data = await apiFootballFetch("leagues", { search: league }, 1440);
      const results = data.response || [];
      if (results.length === 0) {
        return res.json({ logo: null });
      }

      // Pick best match: prefer exact name, then first result
      const best =
        results.find((r) => r.league?.name?.toLowerCase() === league.toLowerCase()) ||
        results[0];

      const logo = best?.league?.logo || null;
      if (!best?.league) {
        return res.json({ logo: null });
      }

      // 3. Store in league_name_mappings
      await pool
        .query(
          `INSERT INTO league_name_mappings (id, app_league_name, api_league_id, api_league_name, api_country, api_league_logo)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE api_league_logo = COALESCE(VALUES(api_league_logo), api_league_logo), api_league_id = VALUES(api_league_id), api_league_name = VALUES(api_league_name)`,
          [
            uuidv4(),
            league,
            best.league.id,
            best.league.name,
            best.country?.name || "",
            logo,
          ]
        )
        .catch(() => {});

      console.log(`[resolve-league-logo] ${league} → ${logo ? "found" : "not found"}`);
      return res.json({ logo, source: "api" });
    } catch (err) {
      console.error("[resolve-league-logo]", err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Resolve club → league via API-Football ─────────────────────
  if (name === "resolve-club-league") {
    const { club } = req.body || {};
    if (!club) return res.status(400).json({ error: "Missing club" });

    try {
      // 1. Check club_directory cache first
      const [existing] = await pool.query(
        "SELECT competition, country, country_code, logo_url FROM club_directory WHERE club_name = ? LIMIT 1",
        [club]
      );
      if (existing.length > 0 && existing[0].competition) {
        return res.json({
          league: existing[0].competition,
          country: existing[0].country,
          logo: existing[0].logo_url,
          source: "cache",
        });
      }

      // 2. Search API-Football for the team
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        console.warn("[resolve-club-league] RAPIDAPI_KEY not configured");
        return res.json({ league: null });
      }

      const teamsData = await apiFootballFetch("teams", { search: club }, 1440);
      const teams = teamsData.response || [];
      if (teams.length === 0) {
        return res.json({ league: null });
      }

      // Pick best match: prefer exact name, then first result
      const best =
        teams.find((t) => t.team.name.toLowerCase() === club.toLowerCase()) ||
        teams[0];
      const teamId = best.team.id;
      const teamLogo = best.team.logo || null;

      // 3. Get current leagues for this team
      const leaguesData = await apiFootballFetch(
        "leagues",
        { team: String(teamId), current: "true" },
        1440
      );
      const leagues = leaguesData.response || [];

      // Pick the main league (type "League", not "Cup")
      const mainLeague =
        leagues.find((l) => l.league.type === "League") || leagues[0];
      if (!mainLeague) {
        return res.json({ league: null });
      }

      const leagueName = mainLeague.league.name;
      const country = mainLeague.country?.name || "";
      const countryCode = mainLeague.country?.code || "";
      const leagueLogo = mainLeague.league.logo || null;

      // 4. Store in club_directory
      await pool
        .query(
          `INSERT INTO club_directory (club_name, competition, country, country_code, logo_url)
           VALUES (?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             competition = VALUES(competition),
             country = VALUES(country),
             country_code = VALUES(country_code),
             logo_url = COALESCE(NULLIF(VALUES(logo_url), ''), logo_url)`,
          [club, leagueName, country, countryCode, teamLogo]
        )
        .catch(() => {});

      // 5. Store in league_name_mappings for fixtures auto-sync
      await pool
        .query(
          `INSERT INTO league_name_mappings (id, app_league_name, api_league_id, api_league_name, api_country, api_league_logo)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE api_league_id = VALUES(api_league_id), api_league_name = VALUES(api_league_name), api_league_logo = VALUES(api_league_logo)`,
          [
            uuidv4(),
            leagueName,
            mainLeague.league.id,
            leagueName,
            country,
            leagueLogo,
          ]
        )
        .catch(() => {});

      console.log(
        `[resolve-club-league] ${club} → ${leagueName} (${country})`
      );
      return res.json({
        league: leagueName,
        country,
        logo: teamLogo,
        source: "api",
      });
    } catch (err) {
      console.error("[resolve-club-league]", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (name === "apifootball-detect-leagues") {
    try {
      // Get distinct leagues from user's players
      const [rows] = await pool.query(
        "SELECT DISTINCT league FROM players WHERE user_id = ? AND league != ''",
        [req.user.id]
      );
      const leagueNames = rows.map((r) => r.league);
      if (leagueNames.length === 0) return res.json({ detected: [] });

      // Get user's already-followed league IDs
      const [followed] = await pool.query(
        "SELECT league_id FROM user_followed_leagues WHERE user_id = ?",
        [req.user.id]
      );
      const followedIds = new Set(followed.map((r) => r.league_id));

      const detected = [];
      for (const appName of leagueNames) {
        // Check local mapping first
        const [mapped] = await pool.query(
          "SELECT * FROM league_name_mappings WHERE app_league_name = ? LIMIT 1",
          [appName]
        );
        if (mapped.length > 0) {
          const m = mapped[0];
          detected.push({
            app_league_name: appName,
            api_league_id: m.api_league_id,
            api_league_name: m.api_league_name,
            api_country: m.api_country,
            api_league_logo: m.api_league_logo,
            already_followed: followedIds.has(m.api_league_id),
          });
          continue;
        }

        // Search API-Football
        try {
          const data = await apiFootballFetch("leagues", { search: appName }, 1440);
          const results = data.response || [];
          if (results.length > 0) {
            // Pick best match: prefer exact name match, then first result
            const best =
              results.find((r) => r.league.name.toLowerCase() === appName.toLowerCase()) ||
              results[0];
            const entry = {
              app_league_name: appName,
              api_league_id: best.league.id,
              api_league_name: best.league.name,
              api_country: best.country?.name || "",
              api_league_logo: best.league.logo || null,
            };
            // Save mapping
            await pool.query(
              `INSERT INTO league_name_mappings (id, app_league_name, api_league_id, api_league_name, api_country, api_league_logo)
               VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE api_league_id = VALUES(api_league_id), api_league_name = VALUES(api_league_name), api_league_logo = COALESCE(VALUES(api_league_logo), api_league_logo)`,
              [uuidv4(), entry.app_league_name, entry.api_league_id, entry.api_league_name, entry.api_country, entry.api_league_logo]
            );
            detected.push({ ...entry, already_followed: followedIds.has(entry.api_league_id) });
          }
        } catch {
          // Skip this league if API call fails
        }
      }
      return res.json({ detected });
    } catch (err) {
      console.error("[apifootball-detect-leagues]", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (name === "apifootball-import-fixtures") {
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: "Missing from/to dates" });
    try {
      const season = getCurrentSeason();
      const [leagues] = await pool.query(
        "SELECT league_id, league_name FROM user_followed_leagues WHERE user_id = ?",
        [req.user.id]
      );
      if (leagues.length === 0) return res.json({ imported: 0, leagues: 0 });

      let imported = 0;
      for (const league of leagues) {
        const data = await apiFootballFetch("fixtures", {
          league: String(league.league_id),
          season: String(season),
          from,
          to,
        }, 240); // 4h cache
        const fixtures = data.response || [];

        for (const fx of fixtures) {
          const fixtureId = fx.fixture?.id;
          if (!fixtureId) continue;

          const matchDate = fx.fixture.date ? fx.fixture.date.slice(0, 10) : from;
          const matchTime = fx.fixture.date ? fx.fixture.date.slice(11, 16) + ":00" : null;
          const homeTeam = fx.teams?.home?.name || "?";
          const awayTeam = fx.teams?.away?.name || "?";
          const competition = fx.league?.name || league.league_name;
          const venue = fx.fixture?.venue?.name || "";
          const scoreHome = fx.goals?.home ?? null;
          const scoreAway = fx.goals?.away ?? null;

          const id = uuidv4();
          await pool.query(
            `INSERT INTO fixtures (id, user_id, home_team, away_team, match_date, match_time, competition, venue, score_home, score_away, source, api_fixture_id, api_league_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?, ?)
             ON DUPLICATE KEY UPDATE
               home_team = VALUES(home_team), away_team = VALUES(away_team),
               match_date = VALUES(match_date), match_time = VALUES(match_time),
               competition = VALUES(competition), venue = VALUES(venue),
               score_home = VALUES(score_home), score_away = VALUES(score_away)`,
            [id, req.user.id, homeTeam, awayTeam, matchDate, matchTime, competition, venue, scoreHome, scoreAway, fixtureId, league.league_id]
          );
          imported++;
        }
      }
      return res.json({ imported, leagues: leagues.length });
    } catch (err) {
      console.error("[apifootball-import-fixtures]", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  if (name === "apifootball-auto-sync") {
    const { from, to } = req.body || {};
    console.log("[apifootball-auto-sync] Request:", { from, to, userId: req.user.id });
    if (!from || !to) return res.status(400).json({ error: "Missing from/to dates" });
    try {
      const rapidApiKey = process.env.RAPIDAPI_KEY;
      if (!rapidApiKey) {
        console.warn("[apifootball-auto-sync] RAPIDAPI_KEY not configured");
        return res.json({ imported: 0, leagues: 0, error: "RAPIDAPI_KEY not configured" });
      }

      const season = getCurrentSeason();
      console.log("[apifootball-auto-sync] Season:", season);

      // 1. Get distinct leagues from user's players
      const [playerLeagues] = await pool.query(
        "SELECT DISTINCT league FROM players WHERE user_id = ? AND league != ''",
        [req.user.id]
      );
      console.log("[apifootball-auto-sync] Player leagues:", playerLeagues.map((r) => r.league));

      // 2. For each player league, resolve to API-Football ID and auto-follow
      const [alreadyFollowed] = await pool.query(
        "SELECT league_id FROM user_followed_leagues WHERE user_id = ?",
        [req.user.id]
      );
      const followedIds = new Set(alreadyFollowed.map((r) => r.league_id));

      for (const row of playerLeagues) {
        const appName = row.league;
        // Check mapping
        const [mapped] = await pool.query(
          "SELECT api_league_id, api_league_name, api_country, api_league_logo FROM league_name_mappings WHERE app_league_name = ? LIMIT 1",
          [appName]
        );
        let leagueId, leagueName, leagueCountry, leagueLogo;

        if (mapped.length > 0) {
          leagueId = mapped[0].api_league_id;
          leagueName = mapped[0].api_league_name;
          leagueCountry = mapped[0].api_country;
          leagueLogo = mapped[0].api_league_logo;
        } else {
          // Search API
          try {
            const data = await apiFootballFetch("leagues", { search: appName }, 1440);
            const results = data.response || [];
            if (results.length === 0) continue;
            const best =
              results.find((r) => r.league.name.toLowerCase() === appName.toLowerCase()) ||
              results[0];
            leagueId = best.league.id;
            leagueName = best.league.name;
            leagueCountry = best.country?.name || "";
            leagueLogo = best.league.logo || null;
            // Save mapping
            await pool.query(
              `INSERT INTO league_name_mappings (id, app_league_name, api_league_id, api_league_name, api_country, api_league_logo)
               VALUES (?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE api_league_id = VALUES(api_league_id), api_league_name = VALUES(api_league_name), api_league_logo = COALESCE(VALUES(api_league_logo), api_league_logo)`,
              [uuidv4(), appName, leagueId, leagueName, leagueCountry, leagueLogo]
            );
          } catch {
            continue;
          }
        }

        // Auto-follow if not already
        if (!followedIds.has(leagueId)) {
          try {
            await pool.query(
              `INSERT INTO user_followed_leagues (id, user_id, league_id, league_name, league_country, league_logo, season)
               VALUES (?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE league_name = VALUES(league_name)`,
              [uuidv4(), req.user.id, leagueId, leagueName, leagueCountry, leagueLogo, season]
            );
            followedIds.add(leagueId);
          } catch { /* ignore duplicate */ }
        }
      }

      // 3. Fetch all followed leagues and import fixtures
      const [leagues] = await pool.query(
        "SELECT league_id, league_name FROM user_followed_leagues WHERE user_id = ?",
        [req.user.id]
      );
      console.log("[apifootball-auto-sync] Followed leagues:", leagues.map((l) => `${l.league_name} (${l.league_id})`));
      if (leagues.length === 0) return res.json({ imported: 0, leagues: 0 });

      let imported = 0;
      for (const league of leagues) {
        console.log(`[apifootball-auto-sync] Fetching fixtures for ${league.league_name} (${league.league_id}), season ${season}, ${from} -> ${to}`);
        const data = await apiFootballFetch("fixtures", {
          league: String(league.league_id),
          season: String(season),
          from,
          to,
        }, 240);
        const fixtures = data.response || [];
        console.log(`[apifootball-auto-sync] Got ${fixtures.length} fixtures for ${league.league_name}`);

        for (const fx of fixtures) {
          const fixtureId = fx.fixture?.id;
          if (!fixtureId) continue;

          const matchDate = fx.fixture.date ? fx.fixture.date.slice(0, 10) : from;
          const matchTime = fx.fixture.date ? fx.fixture.date.slice(11, 16) + ":00" : null;
          const homeTeam = fx.teams?.home?.name || "?";
          const awayTeam = fx.teams?.away?.name || "?";
          const competition = fx.league?.name || league.league_name;
          const venue = fx.fixture?.venue?.name || "";
          const scoreHome = fx.goals?.home ?? null;
          const scoreAway = fx.goals?.away ?? null;

          const id = uuidv4();
          await pool.query(
            `INSERT INTO fixtures (id, user_id, home_team, away_team, match_date, match_time, competition, venue, score_home, score_away, source, api_fixture_id, api_league_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?, ?)
             ON DUPLICATE KEY UPDATE
               home_team = VALUES(home_team), away_team = VALUES(away_team),
               match_date = VALUES(match_date), match_time = VALUES(match_time),
               competition = VALUES(competition), venue = VALUES(venue),
               score_home = VALUES(score_home), score_away = VALUES(score_away)`,
            [id, req.user.id, homeTeam, awayTeam, matchDate, matchTime, competition, venue, scoreHome, scoreAway, fixtureId, league.league_id]
          );
          imported++;
        }
      }
      console.log(`[apifootball-auto-sync] Done: ${imported} fixtures imported from ${leagues.length} league(s)`);
      return res.json({ imported, leagues: leagues.length });
    } catch (err) {
      console.error("[apifootball-auto-sync] ERROR:", err.message, err.stack);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Livescore API: all soccer events for a given day ────────────────────────
  if (name === "livescore-events-day") {
    const { date } = req.body || {};
    if (!date) return res.status(400).json({ error: "Missing date (YYYY-MM-DD)" });

    try {
      const cacheKey = `livescore-events:${date}`;

      // Check cache (reuse api_football_cache table, 30min TTL)
      try {
        const [cached] = await pool.query(
          "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
          [cacheKey]
        );
        if (cached.length > 0) {
          const json = cached[0].response_json;
          const parsed = typeof json === "string" ? JSON.parse(json) : json;
          return res.json(parsed);
        }
      } catch { /* table may not exist */ }

      // date = "YYYY-MM-DD" → "YYYYMMDD"
      const dateCompact = date.replace(/-/g, "");
      const url = `https://prod-public-api.livescore.com/v1/api/app/date/soccer/${dateCompact}/0?MD=1`;
      console.log(`[livescore] Fetching: ${url}`);

      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });
      if (!resp.ok) {
        console.error(`[livescore] HTTP ${resp.status}`);
        return res.status(502).json({ error: `Livescore returned ${resp.status}` });
      }

      const raw = await resp.json();
      const stages = raw.Stages || [];

      // Parse into a clean structure grouped by competition
      const competitions = [];
      let totalEvents = 0;

      for (const stage of stages) {
        const events = (stage.Events || []).map((ev) => {
          // Parse start time from Esd (YYYYMMDDHHmmss)
          const esd = ev.Esd ? String(ev.Esd) : "";
          const matchTime = esd.length >= 12 ? `${esd.slice(8, 10)}:${esd.slice(10, 12)}` : null;

          // Parse scores
          const scoreHome = ev.Tr1 != null && ev.Tr1 !== "" ? parseInt(ev.Tr1, 10) : null;
          const scoreAway = ev.Tr2 != null && ev.Tr2 !== "" ? parseInt(ev.Tr2, 10) : null;

          // Status: "NS" = not started, "FT" = finished, "HT" = half time, number = live minute
          const status = ev.Eps || "NS";

          // Team logo URLs
          const homeImg = ev.T1 && ev.T1[0] && ev.T1[0].Img ? `https://lsm-static-prod.livescore.com/medium/${ev.T1[0].Img}` : null;
          const awayImg = ev.T2 && ev.T2[0] && ev.T2[0].Img ? `https://lsm-static-prod.livescore.com/medium/${ev.T2[0].Img}` : null;

          return {
            id: String(ev.Eid || ""),
            home_team: (ev.T1 && ev.T1[0] && ev.T1[0].Nm) || "?",
            away_team: (ev.T2 && ev.T2[0] && ev.T2[0].Nm) || "?",
            match_time: matchTime,
            score_home: isNaN(scoreHome) ? null : scoreHome,
            score_away: isNaN(scoreAway) ? null : scoreAway,
            ht_score_home: ev.Trh1 != null && ev.Trh1 !== "" ? parseInt(ev.Trh1, 10) : null,
            ht_score_away: ev.Trh2 != null && ev.Trh2 !== "" ? parseInt(ev.Trh2, 10) : null,
            status,
            home_badge: homeImg,
            away_badge: awayImg,
          };
        });

        if (events.length > 0) {
          competitions.push({
            name: stage.Snm || "Unknown",
            country: stage.Cnm || "",
            country_code: stage.Ccd || "",
            events,
          });
          totalEvents += events.length;
        }
      }

      // Save team data to club_logos + club_directory (fire-and-forget)
      try {
        // Ensure club_directory exists
        await pool.query(`
          CREATE TABLE IF NOT EXISTS club_directory (
            club_name VARCHAR(255) NOT NULL PRIMARY KEY,
            competition VARCHAR(255) NOT NULL DEFAULT '',
            country VARCHAR(255) NOT NULL DEFAULT '',
            country_code VARCHAR(10) NOT NULL DEFAULT '',
            logo_url TEXT NULL,
            updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            INDEX idx_club_dir_competition (competition),
            INDEX idx_club_dir_country (country)
          )
        `).catch(() => {});

        const teamsSeen = new Set();
        for (const comp of competitions) {
          for (const ev of comp.events) {
            const teams = [
              { name: ev.home_team, badge: ev.home_badge },
              { name: ev.away_team, badge: ev.away_badge },
            ];
            for (const { name, badge } of teams) {
              if (!name || name === "?" || teamsSeen.has(name)) continue;
              teamsSeen.add(name);

              // club_logos
              if (badge) {
                await pool.query(
                  `INSERT IGNORE INTO club_logos (club_name, logo_url) VALUES (?, ?)`,
                  [name, badge]
                ).catch(() => {});
              }

              // club_directory — upsert with latest competition info
              await pool.query(
                `INSERT INTO club_directory (club_name, competition, country, country_code, logo_url)
                 VALUES (?, ?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                   competition = VALUES(competition),
                   country = VALUES(country),
                   country_code = VALUES(country_code),
                   logo_url = COALESCE(NULLIF(VALUES(logo_url), ''), logo_url)`,
                [name, comp.name, comp.country, comp.country_code, badge || null]
              ).catch(() => {});
            }
          }
        }
        console.log(`[livescore] Saved ${teamsSeen.size} teams to club_directory + club_logos`);
      } catch (e) {
        console.warn("[livescore] Team data save error:", e.message);
      }

      const result = { competitions, date, count: totalEvents };

      // Cache for 30 minutes (scores update frequently)
      try {
        await pool.query(
          `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
           VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))
           ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE)`,
          [cacheKey, JSON.stringify(result)]
        );
      } catch { /* table may not exist */ }

      console.log(`[livescore] ${date}: ${totalEvents} events across ${competitions.length} competitions`);
      return res.json(result);
    } catch (err) {
      console.error("[livescore] ERROR:", err.message, err.stack);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── TheSportsDB-based fixture sync (free, no RapidAPI key needed) ──────────
  if (name === "thesportsdb-sync-fixtures") {
    const { from, to } = req.body || {};
    if (!from || !to) return res.status(400).json({ error: "Missing from/to dates" });

    try {
      const apiKey = process.env.THESPORTSDB_API_KEY || "3";
      const tsdbFetch = async (ep, params) => {
        const qs = new URLSearchParams(params).toString();
        const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/${ep}.php?${qs}`;
        const resp = await fetch(url, { headers: TSDB_HEADERS });
        if (!resp.ok) throw new Error(`TheSportsDB ${resp.status}`);
        return resp.json();
      };

      // Ensure cache table exists
      await pool.query(`
        CREATE TABLE IF NOT EXISTS thesportsdb_team_cache (
          club_name VARCHAR(255) NOT NULL PRIMARY KEY,
          tsdb_team_id INT NOT NULL,
          tsdb_team_name VARCHAR(255) NOT NULL,
          tsdb_league_name VARCHAR(255) NULL,
          updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
        )
      `).catch(() => {});

      // 1. Get distinct clubs from user's players
      const [clubs] = await pool.query(
        "SELECT DISTINCT club FROM players WHERE user_id = ? AND club != ''",
        [req.user.id]
      );
      console.log("[tsdb-sync] User clubs:", clubs.map(r => r.club));
      if (clubs.length === 0) return res.json({ imported: 0, teams: 0 });

      // 2. Resolve each club to a TheSportsDB team ID (with cache)
      const teamIds = new Map(); // tsdb_team_id → tsdb_team_name
      for (const row of clubs) {
        const clubName = row.club;

        // Check cache first
        const [cached] = await pool.query(
          "SELECT tsdb_team_id, tsdb_team_name FROM thesportsdb_team_cache WHERE club_name = ?",
          [clubName]
        );
        if (cached.length > 0) {
          teamIds.set(cached[0].tsdb_team_id, cached[0].tsdb_team_name);
          continue;
        }

        // Search TheSportsDB
        try {
          const data = await tsdbFetch("searchteams", { t: clubName });
          if (data.teams && data.teams.length > 0) {
            // Find best match (exact match or first football team)
            const best = data.teams.find(t =>
              t.strTeam.toLowerCase() === clubName.toLowerCase() && t.strSport === "Soccer"
            ) || data.teams.find(t => t.strSport === "Soccer") || data.teams[0];

            const teamId = parseInt(best.idTeam, 10);
            const teamName = best.strTeam;
            const leagueName = best.strLeague || null;
            teamIds.set(teamId, teamName);

            // Cache it
            await pool.query(
              `INSERT INTO thesportsdb_team_cache (club_name, tsdb_team_id, tsdb_team_name, tsdb_league_name)
               VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE tsdb_team_id = VALUES(tsdb_team_id), tsdb_team_name = VALUES(tsdb_team_name)`,
              [clubName, teamId, teamName, leagueName]
            ).catch(() => {});
          }
        } catch (e) {
          console.warn(`[tsdb-sync] Search failed for "${clubName}":`, e.message);
        }
      }

      console.log("[tsdb-sync] Resolved teams:", [...teamIds.entries()].map(([id, n]) => `${n} (${id})`));
      if (teamIds.size === 0) return res.json({ imported: 0, teams: 0 });

      // 3. For each team, fetch next 5 + last 15 events
      let imported = 0;
      const seenEventIds = new Set();

      for (const [teamId, teamName] of teamIds) {
        try {
          // Next 5 events for this team
          const nextData = await tsdbFetch("eventsnext", { id: String(teamId) });
          // Last 5 events for this team
          const lastData = await tsdbFetch("eventslast", { id: String(teamId) });

          const allEvents = [
            ...(nextData.events || []),
            ...(lastData.results || []),
          ];

          for (const ev of allEvents) {
            const eventId = parseInt(ev.idEvent, 10);
            if (!eventId || seenEventIds.has(eventId)) continue;
            seenEventIds.add(eventId);

            const matchDate = ev.dateEvent; // "YYYY-MM-DD"
            if (!matchDate) continue;
            // Filter to requested date range
            if (matchDate < from || matchDate > to) continue;

            const matchTime = ev.strTime ? ev.strTime.slice(0, 5) + ":00" : null;
            const homeTeam = ev.strHomeTeam || "?";
            const awayTeam = ev.strAwayTeam || "?";
            const competition = ev.strLeague || "";
            const venue = ev.strVenue || "";
            const scoreHome = ev.intHomeScore !== null && ev.intHomeScore !== "" ? parseInt(ev.intHomeScore, 10) : null;
            const scoreAway = ev.intAwayScore !== null && ev.intAwayScore !== "" ? parseInt(ev.intAwayScore, 10) : null;

            const id = uuidv4();
            await pool.query(
              `INSERT INTO fixtures (id, user_id, home_team, away_team, match_date, match_time, competition, venue, score_home, score_away, source, api_fixture_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'api', ?)
               ON DUPLICATE KEY UPDATE
                 home_team = VALUES(home_team), away_team = VALUES(away_team),
                 match_date = VALUES(match_date), match_time = VALUES(match_time),
                 competition = VALUES(competition), venue = VALUES(venue),
                 score_home = VALUES(score_home), score_away = VALUES(score_away)`,
              [id, req.user.id, homeTeam, awayTeam, matchDate, matchTime, competition, venue,
               isNaN(scoreHome) ? null : scoreHome, isNaN(scoreAway) ? null : scoreAway, eventId]
            );
            imported++;
          }
        } catch (e) {
          console.warn(`[tsdb-sync] Events fetch failed for ${teamName} (${teamId}):`, e.message);
        }
      }

      console.log(`[tsdb-sync] Done: ${imported} fixtures imported from ${teamIds.size} team(s)`);
      return res.json({ imported, teams: teamIds.size });
    } catch (err) {
      console.error("[tsdb-sync] ERROR:", err.message, err.stack);
      return res.status(500).json({ error: err.message });
    }
  }

  if (name === "thesportsdb-proxy") {
    const { endpoint, params } = req.body || {};
    const apiKey = process.env.THESPORTSDB_API_KEY || "3";
    if (!endpoint) {
      return res.status(400).json({ error: "Missing endpoint" });
    }

    try {
      const search = new URLSearchParams(params || {});
      const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/${endpoint}.php?${search.toString()}`;

      // Retry with backoff on 429
      let lastStatus = 0;
      for (let attempt = 0; attempt < 3; attempt++) {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000 * attempt));
        const response = await fetch(url, { headers: TSDB_HEADERS });
        lastStatus = response.status;
        if (response.status === 429) {
          console.warn(`[thesportsdb-proxy] 429 for ${endpoint}, retry ${attempt + 1}/3`);
          continue;
        }
        if (!response.ok) {
          console.error(`[thesportsdb-proxy] HTTP ${response.status} for ${endpoint}`);
          return res.status(response.status).json({ error: `TheSportsDB returned ${response.status}` });
        }
        const data = await response.json();
        return res.json(data);
      }
      // All retries exhausted
      console.error(`[thesportsdb-proxy] 429 persisted after 3 retries for ${endpoint}`);
      return res.status(429).json({ error: "TheSportsDB rate limit — try again later" });
    } catch (err) {
      console.error("[thesportsdb-proxy] ERROR:", err.message);
      return res.status(502).json({ error: err.message });
    }
  }

  if (name === "fetch-club-logos") {
    try {
      // Get all distinct clubs for this user that don't have a logo yet (check all name variants)
      const [clubs] = await pool.query(
        `SELECT DISTINCT p.club FROM players p
         WHERE p.user_id = ? AND p.club != ''
           AND p.club NOT IN (SELECT club_name FROM club_logos)
           AND p.club NOT IN (SELECT name_fr FROM club_logos WHERE name_fr IS NOT NULL)
           AND p.club NOT IN (SELECT name_en FROM club_logos WHERE name_en IS NOT NULL)
           AND p.club NOT IN (SELECT name_es FROM club_logos WHERE name_es IS NOT NULL)`,
        [req.user.id]
      );

      const delayMs = (ms) => new Promise(r => setTimeout(r, ms));

      async function tsdbSearch(term) {
        try {
          const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(term)}`;
          const resp = await fetch(url, { headers: { 'User-Agent': 'ScoutHub/1.0' } });
          if (!resp.ok) return null;
          const data = await resp.json();
          if (!data.teams?.length) return null;
          const soccer = data.teams.find(t => t.strSport === 'Soccer') || data.teams[0];
          return soccer.strBadge || soccer.strTeamBadge || null;
        } catch { return null; }
      }

      function normClub(s) {
        return (s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
      }

      let saved = 0;
      for (const { club } of clubs) {
        // Try: original name, without common prefixes, each word >= 4 chars
        const norm = normClub(club);
        const stripped = norm.replace(/^(fc|sc|cf|ac|rc|rcd|afc|ssc|fk|sk|bk|if|bsc|tsv|vfb|vfl|sv|as|us|1 fc)\s+/, '').replace(/\s+(fc|sc|cf|ac|fk|sk|if|bk)$/, '').trim();
        const words = norm.split(/\s+/).filter(w => w.length >= 4);
        const candidates = [club, stripped !== norm ? stripped : null, ...words].filter(Boolean);

        let logoUrl = null;
        for (const term of candidates) {
          logoUrl = await tsdbSearch(term);
          if (logoUrl) break;
          await delayMs(350);
        }

        if (logoUrl) {
          await pool.query(
            "INSERT INTO club_logos (club_name, logo_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE logo_url = VALUES(logo_url), updated_at = NOW()",
            [club.slice(0, 255), logoUrl]
          );
          saved++;
        }
        await delayMs(350);
      }

      return res.json({ success: true, saved, total: clubs.length });
    } catch (err) {
      console.error("[fetch-club-logos] Error:", err);
      return res.status(500).json({ error: "Erreur serveur" });
    }
  }

  if (name === "create-checkout" || name === "customer-portal") {
    return res.status(501).json({ error: "Stripe checkout/portal not yet migrated for MySQL backend." });
  }

  return res.status(404).json({ error: `Unknown function: ${name}` });
});

app.post("/api/storage/:bucket/upload", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  const requestedName = String(req.body?.fileName || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const ext = path.extname(req.file.originalname || "") || ".bin";
  const finalName = requestedName || `${Date.now()}-${uuidv4()}${ext}`;
  const finalPath = path.join(UPLOAD_DIR, finalName);

  fs.renameSync(req.file.path, finalPath);
  const publicUrl = `${req.protocol}://${req.get("host")}/uploads/${finalName}`;

  return res.json({ path: finalName, publicUrl });
});

// ── Auto-create missing tables on startup ────────────────────────────
async function ensureFixtureTables() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS api_football_cache (
        cache_key VARCHAR(255) PRIMARY KEY,
        response_json JSON NOT NULL,
        fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        INDEX idx_cache_expires (expires_at)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_followed_leagues (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        league_id INT NOT NULL,
        league_name VARCHAR(255) NOT NULL,
        league_country VARCHAR(255) NOT NULL DEFAULT '',
        league_logo VARCHAR(500) NULL,
        season INT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_league_season (user_id, league_id, season),
        INDEX idx_followed_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS league_name_mappings (
        id CHAR(36) PRIMARY KEY,
        app_league_name VARCHAR(255) NOT NULL,
        api_league_id INT NOT NULL,
        api_league_name VARCHAR(255) NOT NULL,
        api_country VARCHAR(255) NOT NULL DEFAULT '',
        api_league_logo VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_app_league (app_league_name(191))
      )
    `);
    // Add missing columns to fixtures if needed
    const [cols] = await pool.query("SHOW COLUMNS FROM fixtures LIKE 'source'");
    if (cols.length === 0) {
      await pool.query("ALTER TABLE fixtures ADD COLUMN source ENUM('manual','api') NOT NULL DEFAULT 'manual'");
      await pool.query("ALTER TABLE fixtures ADD COLUMN api_fixture_id INT NULL");
      await pool.query("ALTER TABLE fixtures ADD COLUMN api_league_id INT NULL");
      await pool.query("ALTER TABLE fixtures ADD UNIQUE KEY uniq_user_api_fixture (user_id, api_fixture_id)");
      console.log("[startup] Added API columns to fixtures table");
    }
    console.log("[startup] Fixture tables ready");
  } catch (err) {
    console.error("[startup] Error creating fixture tables:", err.message);
  }
}

ensureFixtureTables().then(() => {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
  });
});

