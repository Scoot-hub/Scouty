import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import rateLimit from "express-rate-limit";
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
import { CLUB_NAME_MAP } from "./club-aliases.js";
const require = createRequire(import.meta.url);
import { v4 as uuidv4 } from "uuid";
import * as XLSXLib from "xlsx";
let cron = null;
try {
  cron = (await import("node-cron")).default;
} catch {
  console.warn("[warn] node-cron not installed – scheduled enrichment disabled");
}
const __dotenv_filename = fileURLToPath(import.meta.url);
const __dotenv_dirname = path.dirname(__dotenv_filename);
dotenv.config({ path: path.resolve(__dotenv_dirname, "..", ".env") });
let nodemailer = null;
try {
  nodemailer = (await import("nodemailer")).default;
} catch {
  console.warn("[warn] nodemailer not installed – email sending disabled. Run: npm install");
}
let Stripe = null;
let stripe = null;
try {
  Stripe = (await import("stripe")).default;
  if (process.env.STRIPE_SECRET_KEY) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    console.log("[info] Stripe initialized with key", process.env.STRIPE_SECRET_KEY.substring(0, 12) + "...");
  } else {
    console.warn("[warn] STRIPE_SECRET_KEY not found in env – payments disabled");
  }
} catch (err) {
  console.warn("[warn] stripe not installed – payments disabled:", err?.message);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, "..");
const isVercel = process.env.VERCEL === "1";
const UPLOAD_DIR = isVercel ? "/tmp/uploads" : path.join(ROOT_DIR, "dist", "uploads");

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// ── Vercel Blob Storage (persistent uploads on Vercel) ────────────────────────
// On Vercel, /tmp is ephemeral — we stream files to Vercel Blob and store the
// returned CDN URL instead of a relative /uploads/ path.
let _blobPut = null;
let _blobDel = null;
if (isVercel && process.env.BLOB_READ_WRITE_TOKEN) {
  try {
    const blobMod = await import("@vercel/blob");
    _blobPut = blobMod.put;
    _blobDel = blobMod.del;
    console.log("[info] Vercel Blob storage ready (token configured)");
  } catch {
    console.warn("[warn] @vercel/blob not found — uploads will use /tmp (ephemeral)");
  }
} else if (isVercel) {
  console.warn("[warn] BLOB_READ_WRITE_TOKEN not set — uploads will use /tmp (ephemeral). Set this env var in Vercel dashboard > Storage > Blob.");
}

/**
 * Save an uploaded multer temp file.
 * - On Vercel: upload to Vercel Blob → return permanent CDN URL.
 * - Locally:   move to UPLOAD_DIR → return relative /uploads/ URL.
 * Always cleans up the temp file.
 */
async function saveUploadedFile(tmpPath, fileName, mimeType) {
  if (isVercel && _blobPut) {
    const buffer = fs.readFileSync(tmpPath);
    try { fs.unlinkSync(tmpPath); } catch {}
    const blob = await _blobPut(fileName, buffer, {
      access: "public",
      contentType: mimeType || "application/octet-stream",
      token: process.env.BLOB_READ_WRITE_TOKEN,
    });
    return blob.url; // absolute CDN URL, permanent
  } else {
    const finalPath = path.join(UPLOAD_DIR, fileName);
    if (fs.existsSync(finalPath)) { try { fs.unlinkSync(finalPath); } catch {} }
    fs.renameSync(tmpPath, finalPath);
    return `/uploads/${fileName}`; // relative URL for local dev
  }
}

/**
 * Delete a previously saved file URL.
 * Ignores errors — best-effort cleanup.
 */
async function deleteStoredFile(url) {
  if (!url) return;
  if (isVercel && _blobDel) {
    try { await _blobDel(url, { token: process.env.BLOB_READ_WRITE_TOKEN }); } catch {}
  } else {
    // Local: derive filename from relative path
    if (url.startsWith("/uploads/")) {
      const localPath = path.join(UPLOAD_DIR, path.basename(url));
      try { if (fs.existsSync(localPath)) fs.unlinkSync(localPath); } catch {}
    }
  }
}

const app = express();
const port = Number(process.env.API_PORT || 3001);
if (!process.env.API_JWT_SECRET) {
  console.error("[FATAL] API_JWT_SECRET environment variable is not set. Server will not start.");
  process.exit(1);
}
const jwtSecret = process.env.API_JWT_SECRET;

const pool = mysql.createPool(createDbPoolConfig());

// ── Scrape settings cache (60s TTL to avoid DB spam on every request) ─────
let _scrapeCache = null;
let _scrapeCacheAt = 0;
async function getScrapeSettings() {
  const now = Date.now();
  if (_scrapeCache && now - _scrapeCacheAt < 60_000) return _scrapeCache;
  const [rows] = await pool.query(
    "SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'scrape_%'"
  ).catch(() => [[]]);
  const s = {};
  for (const r of rows) s[r.setting_key] = parseInt(r.setting_value, 10) || 0;
  _scrapeCache = s;
  _scrapeCacheAt = now;
  return s;
}
async function scrapeDelay(key, defaultMs) {
  const s = await getScrapeSettings();
  const v = s[key];
  return (v && v > 0) ? v : defaultMs;
}

// In-memory progress tracker for enrich-all (keyed by userId)
const enrichAllProgress = new Map();

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",").map(s => s.trim())
  : ["https://scouty.app", "http://localhost:8080", "http://localhost:3000"];
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, curl, Postman, same-origin server calls)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin not allowed — ${origin}`));
  },
  credentials: true,
}));
app.set("trust proxy", 1); // Trust first proxy (Vercel/nginx) for accurate req.ip
app.use(cookieParser());

// ── Global API rate limiter ────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,                 // 2000 requests per window per IP
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,      // Disable X-RateLimit-* headers
  message: { error: "Trop de requêtes, veuillez réessayer plus tard." },
  skip: () => process.env.DISABLE_RATE_LIMIT === "true", // set in .env for local dev only
});
app.use("/api", apiLimiter);

// ── Cookie-based JWT helpers ─────────────────────────────────────────────
const AUTH_COOKIE = "scouthub_token";
const ADMIN_COOKIE = "scouthub_admin_token"; // used during impersonation

function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
    path: "/",
  };
}

function setAuthCookie(res, token) {
  res.cookie(AUTH_COOKIE, token, cookieOptions());
}

function clearAuthCookie(res) {
  res.clearCookie(AUTH_COOKIE, { path: "/" });
  res.clearCookie(ADMIN_COOKIE, { path: "/" });
}

// ── Stripe webhook (MUST be before express.json to preserve raw body) ────
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
  if (!stripe) return res.status(501).json({ error: "Stripe non configuré." });

  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!sig || !webhookSecret) return res.status(400).json({ error: "Signature manquante." });

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error("[stripe-webhook] Signature verification failed:", err?.message);
    return res.status(400).json({ error: "Signature invalide." });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        // Support both metadata (embedded checkout) and client_reference_id (Payment Links)
        const userId = session.metadata?.user_id || session.client_reference_id;
        if (!userId) {
          console.warn("[stripe-webhook] checkout.session.completed: no user_id found (metadata or client_reference_id)");
          break;
        }

        // Retrieve subscription to get end date, plan and billing cycle
        let subEnd = null;
        let planType = session.metadata?.plan_type || null;
        let billingCycle = session.metadata?.billing_cycle || null;

        if (session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription, { expand: ["items.data.price.product"] });
          subEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

          // Deduce billing cycle from Stripe price interval
          if (!billingCycle && sub.items?.data?.[0]?.price?.recurring) {
            const interval = sub.items.data[0].price.recurring.interval;
            billingCycle = interval === "year" ? "annual" : "monthly";
          }

          // Deduce plan type from Stripe product name or price amount
          if (!planType && sub.items?.data?.[0]?.price) {
            const price = sub.items.data[0].price;
            const productName = typeof price.product === "object" ? (price.product.name || "") : "";
            const nameLower = productName.toLowerCase();
            if (nameLower.includes("pro")) {
              planType = "pro";
            } else if (nameLower.includes("scout")) {
              planType = "scout";
            } else {
              // Fallback: use price amount (in cents)
              const amount = price.unit_amount || 0;
              planType = amount >= 2400 ? "pro" : "scout";
            }
          }
        }

        planType = planType || "scout";
        billingCycle = billingCycle || "monthly";

        const [existing] = await pool.query("SELECT id FROM user_subscriptions WHERE user_id = ? LIMIT 1", [userId]);
        if (existing.length > 0) {
          await pool.query(
            `UPDATE user_subscriptions SET is_premium = 1, premium_since = COALESCE(premium_since, NOW()),
             stripe_customer_id = ?, stripe_subscription_id = ?, plan_type = ?, billing_cycle = ?,
             subscription_end = ?, updated_at = NOW() WHERE user_id = ?`,
            [session.customer, session.subscription, planType, billingCycle, subEnd, userId]
          );
        } else {
          await pool.query(
            `INSERT INTO user_subscriptions (id, user_id, is_premium, premium_since, stripe_customer_id,
             stripe_subscription_id, plan_type, billing_cycle, subscription_end)
             VALUES (?, ?, 1, NOW(), ?, ?, ?, ?, ?)`,
            [uuidv4(), userId, session.customer, session.subscription, planType, billingCycle, subEnd]
          );
        }
        const wPlanLabel = planType === "pro" ? "Scout Pro" : "Scout+";
        const wCycleLabel = billingCycle === "annual" ? "annuel" : "mensuel";
        const wEndDateStr = subEnd ? new Date(subEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";

        console.log(`[stripe-webhook] Subscription activated for user ${userId} (${planType}/${billingCycle})`);
        await createNotification(userId, {
          type: "subscription",
          title: "Abonnement activé",
          message: `Votre plan ${wPlanLabel} est maintenant actif.`,
          icon: "Crown",
          link: "/account",
        });

        // Send confirmation email
        try {
          const [userRows] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [userId]);
          if (userRows[0]?.email) {
            sendEmail(userRows[0].email, `Scouty – Votre abonnement ${wPlanLabel} est actif !`, `
              <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                <img src="https://scouty.app/logo.png" alt="Scouty" width="40" style="border-radius:10px;margin-bottom:16px" />
                <h2 style="color:#1a1a2e;margin:0 0 4px">Bienvenue en ${wPlanLabel} !</h2>
                <p style="color:#6366f1;font-size:14px;font-weight:600;margin:0 0 20px">Abonnement ${wCycleLabel}</p>
                <div style="background:#f0f0ff;border-radius:12px;padding:20px;margin:0 0 24px">
                  <table style="width:100%;border-collapse:collapse;font-size:14px">
                    <tr><td style="padding:6px 0;color:#6b7280">Plan</td><td style="padding:6px 0;font-weight:700;text-align:right">${wPlanLabel}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b7280">Cycle</td><td style="padding:6px 0;font-weight:600;text-align:right">${wCycleLabel === "annuel" ? "Annuel" : "Mensuel"}</td></tr>
                    <tr><td style="padding:6px 0;color:#6b7280">Prochain renouvellement</td><td style="padding:6px 0;font-weight:600;text-align:right">${wEndDateStr}</td></tr>
                  </table>
                </div>
                <p style="color:#555;font-size:14px">Merci pour votre confiance ! Votre paiement a été validé et votre compte est mis à niveau.</p>
                <p style="text-align:center;margin:32px 0">
                  <a href="https://scouty.app/players" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">Accéder à mes joueurs</a>
                </p>
                <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
                <p style="color:#aaa;font-size:11px;text-align:center">Scouty — Scouting footballistique professionnel</p>
              </div>
            `);
          }
        } catch (emailErr) { console.warn("[stripe-webhook] Email sending failed:", emailErr?.message); }
        break;
      }

      case "customer.subscription.updated": {
        const sub = event.data.object;
        const subEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;
        const isActive = ["active", "trialing"].includes(sub.status);
        await pool.query(
          `UPDATE user_subscriptions SET is_premium = ?, subscription_end = ?, updated_at = NOW()
           WHERE stripe_subscription_id = ?`,
          [isActive ? 1 : 0, subEnd, sub.id]
        );
        console.log(`[stripe-webhook] Subscription ${sub.id} updated (status: ${sub.status})`);
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await pool.query(
          `UPDATE user_subscriptions SET is_premium = 0, stripe_subscription_id = NULL,
           subscription_end = NULL, updated_at = NOW() WHERE stripe_subscription_id = ?`,
          [sub.id]
        );
        console.log(`[stripe-webhook] Subscription ${sub.id} deleted`);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object;
        console.warn(`[stripe-webhook] Payment failed for customer ${invoice.customer}`);
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error("[stripe-webhook] Processing error:", err);
    return res.status(500).json({ error: "Webhook processing error." });
  }
});

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ limit: "10mb", extended: true }));
app.use("/uploads", express.static(UPLOAD_DIR));

const upload = multer({
  dest: UPLOAD_DIR,
  storage: multer.diskStorage({
    destination(_req, _file, cb) {
      // Ensure upload dir exists before every write (Vercel can purge /tmp between warm invocations)
      if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
      cb(null, UPLOAD_DIR);
    },
    filename(_req, file, cb) {
      cb(null, `${Date.now()}-${file.originalname}`);
    },
  }),
});

// ── Stripe session status (after checkout return) ────────────────────────
app.get("/api/stripe/session-status", authMiddleware, async (req, res) => {
  if (!stripe) return res.status(501).json({ error: "Stripe non configuré." });
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: "session_id requis." });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // Ownership check — the session must belong to the authenticated user
    const sessionUserId = session.metadata?.user_id || session.client_reference_id;
    if (sessionUserId && sessionUserId !== req.user.id) {
      return res.status(403).json({ error: "Forbidden" });
    }

    // If payment is complete, activate premium directly (backup for webhook delay/failure)
    console.log("[session-status] Session:", session.id, "status:", session.status, "payment:", session.payment_status, "metadata:", JSON.stringify(session.metadata), "client_ref:", session.client_reference_id, "subscription:", session.subscription, "customer:", session.customer);
    if (session.status === "complete" && session.payment_status === "paid") {
      const userId = session.metadata?.user_id || session.client_reference_id;
      console.log("[session-status] userId resolved:", userId);
      if (userId) {
        let planType = session.metadata?.plan_type || null;
        let billingCycle = session.metadata?.billing_cycle || null;

        // Retrieve subscription to get end date + deduce plan/billing if not in metadata
        let subEnd = null;
        if (session.subscription) {
          try {
            const sub = await stripe.subscriptions.retrieve(session.subscription, { expand: ["items.data.price.product"] });
            subEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

            if (!billingCycle && sub.items?.data?.[0]?.price?.recurring) {
              billingCycle = sub.items.data[0].price.recurring.interval === "year" ? "annual" : "monthly";
            }
            if (!planType && sub.items?.data?.[0]?.price) {
              const price = sub.items.data[0].price;
              const productName = typeof price.product === "object" ? (price.product.name || "") : "";
              if (productName.toLowerCase().includes("pro")) planType = "pro";
              else planType = "scout";
            }
          } catch (e) {
            console.warn("[session-status] Could not retrieve subscription:", e?.message);
          }
        }
        planType = planType || "scout";
        billingCycle = billingCycle || "monthly";

        const [existing] = await pool.query(
          "SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1",
          [userId]
        );

        if (!existing.length || !existing[0].is_premium) {
          if (existing.length > 0) {
            await pool.query(
              `UPDATE user_subscriptions SET is_premium = 1, premium_since = COALESCE(premium_since, NOW()),
               stripe_customer_id = ?, stripe_subscription_id = ?, plan_type = ?, billing_cycle = ?,
               subscription_end = ?, updated_at = NOW() WHERE user_id = ?`,
              [session.customer, session.subscription, planType, billingCycle, subEnd, userId]
            );
          } else {
            await pool.query(
              `INSERT INTO user_subscriptions (id, user_id, is_premium, premium_since, stripe_customer_id,
               stripe_subscription_id, plan_type, billing_cycle, subscription_end)
               VALUES (?, ?, 1, NOW(), ?, ?, ?, ?, ?)`,
              [uuidv4(), userId, session.customer, session.subscription, planType, billingCycle, subEnd]
            );
          }

          console.log(`[session-status] Activated premium for user ${userId} (${planType}/${billingCycle})`);

          await createNotification(userId, {
            type: "subscription",
            title: "Abonnement activé",
            message: `Votre plan ${planType === "pro" ? "Scout Pro" : "Scout+"} est maintenant actif.`,
            icon: "Crown",
            link: "/account",
          });
        }
      }
    }

    return res.json({
      status: session.status,
      payment_status: session.payment_status,
    });
  } catch (err) {
    console.error("[session-status] Error:", err?.message);
    return res.status(500).json({ error: "Impossible de récupérer la session." });
  }
});

const ALLOWED_TABLES = {
  users: ["id", "email", "created_at", "last_sign_in_at"],
  profiles: ["id", "user_id", "full_name", "club", "role", "social_x", "social_instagram", "social_linkedin", "social_public", "social_facebook", "social_snapchat", "social_tiktok", "social_telegram", "social_whatsapp", "photo_url", "first_name", "last_name", "company", "siret", "phone", "civility", "address", "country", "date_of_birth", "reference_club", "referred_by", "created_at", "updated_at"],
  players: [
    "id", "name", "photo_url", "generation", "nationality", "foot", "club", "league", "zone", "position", "position_secondaire", "role",
    "current_level", "potential", "general_opinion", "contract_end", "notes", "ts_report_published", "date_of_birth", "market_value",
    "transfermarkt_id", "external_data", "external_data_fetched_at", "shared_with_org", "has_news", "task", "is_archived", "user_id", "created_at", "updated_at",
    "social_instagram",
    "player_type", "coaching_license", "coaching_preferred_formation", "coaching_style", "coaching_career", "tm_coach_id", "contract_start",
  ],
  reports: ["id", "player_id", "report_date", "title", "opinion", "drive_link", "file_url", "user_id", "created_at"],
  custom_fields: ["id", "user_id", "field_name", "field_type", "field_options", "field_hint", "applies_to_all", "display_order", "created_at"],
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
  organizations: ["id", "name", "type", "invite_code", "logo_url", "description", "settings", "created_by", "created_at", "updated_at"],
  organization_members: ["id", "organization_id", "user_id", "role", "joined_at", "messaging_blocked"],
  player_org_shares: ["id", "player_id", "organization_id", "user_id", "created_at"],
  match_assignments: ["id", "user_id", "organization_id", "assigned_to", "assigned_by", "home_team", "away_team", "match_date", "match_time", "competition", "venue", "home_badge", "away_badge", "notes", "status", "created_at", "updated_at"],
  community_posts: ["id", "user_id", "author_name", "category", "title", "content", "likes", "replies_count", "is_archived", "views", "is_pinned", "display_order", "is_closed", "accepted_reply_id", "closed_by", "closed_at", "created_at", "lang", "country"],
  community_replies: ["id", "post_id", "user_id", "author_name", "content", "created_at"],
  community_likes: ["id", "post_id", "user_id", "created_at"],
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
  "community_posts",    // H-4: users may only update/delete their own posts
  "community_replies",  // H-4: same for replies
]);

// Fields that only moderators/admins may write on community tables
const COMMUNITY_MODERATION_FIELDS = new Set([
  "is_pinned", "display_order", "is_archived", "views",
  "likes", "replies_count", "is_closed", "accepted_reply_id",
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

// ── Anti-bot & account protection helpers ────────────────────────────────

// Hash an IP for privacy storage (SHA-256, no key — it's a public-ish value)
function hashIp(ip) {
  if (!ip) return null;
  // Normalize IPv6 to /48 prefix to group ISP-level ranges
  let normalized = ip.trim();
  if (normalized.includes(':') && !normalized.includes('::ffff:')) {
    // Keep first 3 groups of IPv6 (/48 prefix)
    const parts = normalized.split(':');
    normalized = parts.slice(0, 3).join(':');
  }
  // Strip IPv6-mapped IPv4 prefix
  normalized = normalized.replace(/^::ffff:/, '');
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

// Detect headless/automated browsers from User-Agent
const HEADLESS_UA_PATTERNS = [
  /HeadlessChrome/i, /PhantomJS/i, /Puppeteer/i, /Playwright/i, /Selenium/i,
  /WebDriver/i, /python-requests/i, /curl\//i, /axios\//i, /node-fetch/i,
  /Go-http-client/i, /Java\/\d/i, /okhttp/i, /Scrapy/i, /bot/i, /crawler/i,
];
function isHeadlessBrowser(ua) {
  if (!ua) return true;
  return HEADLESS_UA_PATTERNS.some(p => p.test(ua));
}

// Compute a bot score (0–100) from request signals
function computeBotScore(req, extraSignals = {}) {
  let score = 0;
  const ua = req.headers['user-agent'] || '';
  if (isHeadlessBrowser(ua)) score += 60;
  if (!ua || ua.length < 20) score += 20;
  if (!req.headers['accept-language']) score += 10;
  if (!req.headers['accept']) score += 10;
  if (extraSignals.honeypotFilled) score += 100;
  if (extraSignals.tooFast) score += 40;   // form submitted < 3s after page load
  if (extraSignals.sameIpBanned) score += 50;
  return Math.min(score, 100);
}

// In-memory ban cache to avoid DB hit on every request (TTL: 5 minutes)
const _banCache = new Map(); // userId → { isBanned, banReason, banExpiresAt, cachedAt }
const BAN_CACHE_TTL = 5 * 60 * 1000;

async function isUserBanned(userId) {
  const cached = _banCache.get(userId);
  if (cached && Date.now() - cached.cachedAt < BAN_CACHE_TTL) {
    // Check if a temporary ban has expired since we cached it
    if (cached.isBanned && cached.banExpiresAt && new Date(cached.banExpiresAt) <= new Date()) {
      await pool.query('UPDATE users SET is_banned=0, ban_reason=NULL, banned_at=NULL, banned_by=NULL, ban_expires_at=NULL WHERE id=?', [userId]).catch(() => {});
      _banCache.delete(userId);
      return { isBanned: false, banReason: null, banExpiresAt: null };
    }
    return { isBanned: cached.isBanned, banReason: cached.banReason, banExpiresAt: cached.banExpiresAt };
  }
  try {
    const [[row]] = await pool.query('SELECT is_banned, ban_reason, ban_expires_at FROM users WHERE id = ? LIMIT 1', [userId]);
    // Auto-lift expired temporary bans
    if (row?.is_banned && row?.ban_expires_at && new Date(row.ban_expires_at) <= new Date()) {
      await pool.query('UPDATE users SET is_banned=0, ban_reason=NULL, banned_at=NULL, banned_by=NULL, ban_expires_at=NULL WHERE id=?', [userId]).catch(() => {});
      const result = { isBanned: false, banReason: null, banExpiresAt: null };
      _banCache.set(userId, { ...result, cachedAt: Date.now() });
      return result;
    }
    const result = {
      isBanned: !!row?.is_banned,
      banReason: row?.ban_reason || null,
      banExpiresAt: row?.ban_expires_at || null,
    };
    _banCache.set(userId, { ...result, cachedAt: Date.now() });
    return result;
  } catch { return { isBanned: false, banReason: null, banExpiresAt: null }; }
}

function invalidateBanCache(userId) { _banCache.delete(userId); }

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
    oauth_provider: userRow.oauth_provider || null,
    has_password: !!userRow.password_hash,
    is_banned: !!userRow.is_banned && (!userRow.ban_expires_at || new Date(userRow.ban_expires_at) > new Date()),
    ban_reason: (!!userRow.is_banned && (!userRow.ban_expires_at || new Date(userRow.ban_expires_at) > new Date())) ? (userRow.ban_reason || null) : null,
    ban_expires_at: (!!userRow.is_banned && (!userRow.ban_expires_at || new Date(userRow.ban_expires_at) > new Date())) ? new Date(userRow.ban_expires_at).toISOString() : null,
  };
}

function buildSession(userRow, res) {
  const user = normalizeUserRow(userRow);
  const token = createSessionToken(user);
  if (res) setAuthCookie(res, token);
  return {
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
  // Read token from httpOnly cookie first, fallback to Authorization header
  let token = req.cookies?.[AUTH_COOKIE] || null;
  if (!token) {
    const authHeader = req.headers.authorization || "";
    token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  }

  if (!token) {
    return res.status(401).json({ error: "Missing token" });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) {
      return res.status(401).json({ error: "Invalid token" });
    }
    // Ban check (cached)
    const { isBanned, banReason } = await isUserBanned(user.id);
    if (isBanned) {
      return res.status(403).json({
        error: 'Compte suspendu.',
        ban_reason: banReason || 'Violation des conditions d\'utilisation.',
        banned: true,
      });
    }
    req.user = normalizeUserRow(user);
    const [adminCheck] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    req.user.isAdmin = adminCheck.length > 0;
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
  if (col === "ts_report_published" || col === "is_premium" || col === "is_favorite" || col === "is_archived" || col === "applies_to_all") {
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

  if (typeof parsed.settings === "string") {
    try { parsed.settings = JSON.parse(parsed.settings); } catch { parsed.settings = null; }
  }

  if (parsed.ts_report_published !== undefined) parsed.ts_report_published = !!parsed.ts_report_published;
  if (parsed.is_premium !== undefined) parsed.is_premium = !!parsed.is_premium;
  if (parsed.is_favorite !== undefined) parsed.is_favorite = !!parsed.is_favorite;
  if (parsed.applies_to_all !== undefined) parsed.applies_to_all = !!parsed.applies_to_all;

  return parsed;
}

// ── Per-user rating overlay helpers ─────────────────────────────────────────
// Rating fields (current_level / potential / general_opinion) are stored
// per-(player, user) in player_user_rating. Reads merge over players rows;
// writes are split off from players writes.
const PLAYER_RATING_COLS = new Set(["current_level", "potential", "general_opinion"]);

async function fetchUserRatings(userId, playerIds) {
  if (!userId || !playerIds.length) return new Map();
  const ids = [...new Set(playerIds.filter(Boolean))];
  if (!ids.length) return new Map();
  try {
    const placeholders = ids.map(() => "?").join(",");
    const [rows] = await pool.query(
      `SELECT player_id, current_level, potential, general_opinion
       FROM player_user_rating
       WHERE user_id = ? AND player_id IN (${placeholders})`,
      [userId, ...ids]
    );
    return new Map(rows.map(r => [r.player_id, r]));
  } catch {
    return new Map();
  }
}

function applyUserRating(row, ratingMap) {
  if (!row || !row.id) return row;
  const r = ratingMap.get(row.id);
  if (r) {
    row.current_level = Number(r.current_level);
    row.potential = Number(r.potential);
    row.general_opinion = r.general_opinion;
  } else {
    row.current_level = 0;
    row.potential = 0;
    row.general_opinion = "À revoir";
  }
  return row;
}

async function upsertUserRating(playerId, userId, rating) {
  if (!playerId || !userId) return;
  const sets = [];
  const vals = [];
  if (rating.current_level !== undefined) {
    sets.push("current_level");
    vals.push(Number(rating.current_level) || 0);
  }
  if (rating.potential !== undefined) {
    sets.push("potential");
    vals.push(Number(rating.potential) || 0);
  }
  if (rating.general_opinion !== undefined) {
    sets.push("general_opinion");
    vals.push(rating.general_opinion || "À revoir");
  }
  if (!sets.length) return;
  const colList = ["player_id", "user_id", ...sets].join(", ");
  const placeholders = ["?", "?", ...sets.map(() => "?")].join(", ");
  const updateClause = sets.map(c => `${c} = VALUES(${c})`).join(", ");
  await pool.query(
    `INSERT INTO player_user_rating (${colList}) VALUES (${placeholders})
     ON DUPLICATE KEY UPDATE ${updateClause}`,
    [playerId, userId, ...vals]
  );
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

// ── Analytics helpers ────────────────────────────────────────────────────────

// Map a page URL to a navigation pole category
function categorizePageUrl(url) {
  if (!url) return 'other';
  const p = url.split('?')[0].toLowerCase();
  if (p === '/' || p === '/dashboard') return 'dashboard';
  if (p.startsWith('/discover') || p.startsWith('/watchlist') || p.startsWith('/shadow-team') || p.startsWith('/player')) return 'players';
  if (p.startsWith('/championships') || p.startsWith('/my-championships')) return 'championships';
  if (p.startsWith('/club') || p.startsWith('/my-clubs')) return 'clubs';
  if (p.startsWith('/community')) return 'community';
  if (p.startsWith('/buzz') || p.startsWith('/x') || p.startsWith('/instagram') || p.startsWith('/editorial') || p.startsWith('/news')) return 'news';
  if (p.startsWith('/my-matches') || p.startsWith('/map') || p.startsWith('/match')) return 'matches';
  if (p.startsWith('/organization')) return 'organizations';
  if (p.startsWith('/account') || p.startsWith('/settings')) return 'account';
  return 'other';
}

// In-memory IP→geo cache (avoids re-fetching for the same IP within a process lifetime)
const _geoCache = new Map(); // ip → { country, country_code, city, lat, lon } | null
const PRIVATE_IP = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|::1$|localhost)/;

async function geolocateIp(ip) {
  if (!ip || PRIVATE_IP.test(ip)) return null;
  if (_geoCache.has(ip)) return _geoCache.get(ip);
  try {
    const r = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode,city,lat,lon&lang=en`, { signal: AbortSignal.timeout(3000) });
    if (!r.ok) { _geoCache.set(ip, null); return null; }
    const d = await r.json();
    const geo = d.countryCode ? { country: d.country || null, country_code: d.countryCode || null, city: d.city || null, lat: d.lat || null, lon: d.lon || null } : null;
    if (_geoCache.size > 2000) _geoCache.clear(); // simple eviction
    _geoCache.set(ip, geo);
    return geo;
  } catch {
    _geoCache.set(ip, null);
    return null;
  }
}

// DB schema is managed via schema.sql — runtime migrations ensure columns exist.
async function runMigrations() { return _legacyRunMigrations(); }
async function _legacyRunMigrations() {
  // Ensure club_geocoding_cache table exists (Nominatim results — permanent TTL)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS club_geocoding_cache (
        cache_key    VARCHAR(512) NOT NULL PRIMARY KEY,
        lat          DECIMAL(9,6) NOT NULL,
        lng          DECIMAL(9,6) NOT NULL,
        cached_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[warn] club_geocoding_cache migration:', err?.message);
  }

  // Add anti-bot & ban columns to users (idempotent)
  for (const col of [
    "ALTER TABLE `users` ADD COLUMN `is_banned`        TINYINT(1)   NOT NULL DEFAULT 0",
    "ALTER TABLE `users` ADD COLUMN `ban_reason`       TEXT         NULL",
    "ALTER TABLE `users` ADD COLUMN `banned_at`        DATETIME     NULL",
    "ALTER TABLE `users` ADD COLUMN `banned_by`        CHAR(36)     NULL",
    "ALTER TABLE `users` ADD COLUMN `ban_expires_at`   DATETIME     NULL",
    "ALTER TABLE `users` ADD COLUMN `bot_score`        INT          NOT NULL DEFAULT 0",
    "ALTER TABLE `users` ADD COLUMN `registration_ip`  VARCHAR(45)  NULL",
    "ALTER TABLE `users` ADD COLUMN `registration_ip_hash` CHAR(64) NULL",
    "ALTER TABLE `users` ADD COLUMN `suspicious_referral` TINYINT(1) NOT NULL DEFAULT 0",
  ]) {
    try { await pool.query(col); } catch (e) { if (e?.errno !== 1060) console.warn('[migration] users ban cols:', e?.message); }
  }

  // signup_ip_log — tracks hashed IPs to enforce multi-account limits
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS signup_ip_log (
        ip_hash      CHAR(64)  NOT NULL PRIMARY KEY,
        account_count INT      NOT NULL DEFAULT 1,
        first_seen   DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen    DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        is_flagged   TINYINT(1) NOT NULL DEFAULT 0
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[migration] signup_ip_log:', err?.message);
  }

  // referrals — tracks who referred whom
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id            CHAR(36)     NOT NULL PRIMARY KEY,
        referrer_id   CHAR(36)     NOT NULL,
        referred_id   CHAR(36)     NOT NULL,
        referral_code VARCHAR(50)  NOT NULL DEFAULT '',
        created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_referred (referred_id),
        INDEX idx_referrals_referrer (referrer_id),
        FOREIGN KEY (referrer_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (referred_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[migration] referrals:', err?.message);
  }

  // Create editorial_reactions table (likes / dislikes on editorial articles)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS editorial_reactions (
        user_id    CHAR(36)    NOT NULL,
        article_id CHAR(36)    NOT NULL,
        reaction   ENUM('like','dislike') NOT NULL,
        created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, article_id),
        INDEX idx_er_article (article_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (article_id) REFERENCES editorial_articles(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[migration] editorial_reactions:', err?.message);
  }

  // Add geo columns to user_sessions (idempotent)
  for (const col of [
    "ALTER TABLE `user_sessions` ADD COLUMN `country`      VARCHAR(100) NULL",
    "ALTER TABLE `user_sessions` ADD COLUMN `country_code` CHAR(2)      NULL",
    "ALTER TABLE `user_sessions` ADD COLUMN `city`         VARCHAR(100) NULL",
    "ALTER TABLE `user_sessions` ADD COLUMN `latitude`     DECIMAL(9,6) NULL",
    "ALTER TABLE `user_sessions` ADD COLUMN `longitude`    DECIMAL(9,6) NULL",
    "ALTER TABLE `user_sessions` ADD COLUMN `page_category` VARCHAR(30)  NULL",
    "ALTER TABLE `user_sessions` ADD COLUMN `geo_from_client` TINYINT(1) NOT NULL DEFAULT 0",
  ]) {
    try { await pool.query(col); } catch (e) { if (e?.errno !== 1060) console.warn('[migration] user_sessions geo:', e?.message); }
  }

  // Create session_page_time table — tracks seconds spent per page pole per session
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS session_page_time (
        user_id      CHAR(36)    NOT NULL,
        session_id   VARCHAR(64) NOT NULL,
        category     VARCHAR(30) NOT NULL,
        seconds_spent INT        NOT NULL DEFAULT 30,
        last_updated  DATETIME   NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, session_id, category),
        INDEX idx_spt_user (user_id),
        INDEX idx_spt_category (category),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[migration] session_page_time:', err?.message);
  }

  // Ensure password_reset_tokens table exists
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

  // Ensure organizations & organization_members tables exist
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
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
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    console.warn("[warn] Could not auto-create organization tables:", err?.message);
  }

  // Ensure shadow_teams & shadow_team_players tables exist
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

  // Migrate shadow_team_players unique key if needed
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

  // Ensure squad_players table exists
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

  // Ensure is_archived column exists on players
  try {
    await pool.query(`ALTER TABLE players ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  // Ensure community_posts moderation columns exist
  for (const col of [
    'is_archived TINYINT(1) NOT NULL DEFAULT 0',
    'views INT NOT NULL DEFAULT 0',
    'is_pinned TINYINT(1) NOT NULL DEFAULT 0',
    'display_order INT NOT NULL DEFAULT 0',
    'is_closed TINYINT(1) NOT NULL DEFAULT 0',
    'accepted_reply_id CHAR(36) NULL',
    'closed_by CHAR(36) NULL',
    'closed_at DATETIME NULL',
    'lang VARCHAR(10) NULL',
    'country VARCHAR(100) NULL',
  ]) {
    try { await pool.query(`ALTER TABLE community_posts ADD COLUMN ${col}`); } catch { /* already exists */ }
  }

  // Ensure has_news column exists on players
  try {
    await pool.query(`ALTER TABLE players ADD COLUMN has_news VARCHAR(50) NULL DEFAULT NULL`);
  } catch { /* column already exists */ }
  try {
    await pool.query(`ALTER TABLE players MODIFY COLUMN has_news VARCHAR(50) NULL DEFAULT NULL`);
    await pool.query(`UPDATE players SET has_news = NULL WHERE has_news IN ('0', '1')`);
  } catch {}

  // Wyscout import columns on players (bio/physical)
  for (const col of [
    "height INT NULL",
    "weight INT NULL",
    "on_loan TINYINT(1) NOT NULL DEFAULT 0",
    "matches_played INT NULL",
    "minutes_played INT NULL",
    "passport_country VARCHAR(255) NULL",
    "wyscout_season VARCHAR(20) NULL",
    "wyscout_division VARCHAR(20) NULL",
    "wyscout_team_in_timeframe VARCHAR(255) NULL",
    "wyscout_stats JSON NULL",
    "social_instagram VARCHAR(255) NULL",
    "player_type ENUM('player','coach') NOT NULL DEFAULT 'player'",
    "coaching_license VARCHAR(100) NULL",
    "coaching_preferred_formation VARCHAR(50) NULL",
    "coaching_style TEXT NULL",
    "coaching_career JSON NULL",
    "tm_coach_id VARCHAR(50) NULL",
    "contract_start DATE NULL",
  ]) {
    try { await pool.query(`ALTER TABLE players ADD COLUMN ${col}`); } catch { /* already exists */ }
  }

  // One-time backfill: Wyscout-imported players left at the default 5/5
  // are unrated — reset to 0 so the UI can show "NA" instead of misleading 5/5.
  try {
    await pool.query(`
      UPDATE players
      SET current_level = 0, potential = 0
      WHERE wyscout_division IS NOT NULL
        AND current_level = 5.0
        AND potential = 5.0
        AND general_opinion = 'À revoir'
    `);
  } catch (err) {
    if (!err?.message?.includes("Unknown column")) {
      console.warn("[warn] wyscout unrated backfill:", err?.message);
    }
  }

  // Per-user rating overlay: each (player, user) pair carries its own
  // current_level / potential / general_opinion. Reads always JOIN this
  // table — players.current_level etc. are kept only as legacy storage.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_user_rating (
        player_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        current_level DECIMAL(3,1) NOT NULL DEFAULT 0,
        potential DECIMAL(3,1) NOT NULL DEFAULT 0,
        general_opinion VARCHAR(30) NOT NULL DEFAULT 'À revoir',
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (player_id, user_id),
        INDEX idx_pur_user (user_id),
        INDEX idx_pur_player (player_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) {
      console.warn("[warn] player_user_rating table:", err?.message);
    }
  }

  // Copy existing owner ratings into the overlay so we don't lose them.
  // Skip rows that look like an untouched default (5/5/À revoir).
  try {
    await pool.query(`
      INSERT IGNORE INTO player_user_rating (player_id, user_id, current_level, potential, general_opinion, updated_at)
      SELECT id, user_id, current_level, potential, general_opinion, COALESCE(updated_at, NOW())
      FROM players
      WHERE NOT (current_level = 5.0 AND potential = 5.0 AND general_opinion = 'À revoir')
        AND (current_level > 0 OR potential > 0 OR (general_opinion IS NOT NULL AND general_opinion != 'À revoir' AND general_opinion != ''))
    `);
  } catch (err) {
    console.warn("[warn] player_user_rating backfill:", err?.message);
  }

  // Dedicated Wyscout stats table — one row per player × season × division
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_wyscout_stats (
        id CHAR(36) PRIMARY KEY,
        player_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        season VARCHAR(20) NOT NULL,
        division VARCHAR(20) NULL,
        team VARCHAR(255) NULL,
        continent VARCHAR(100) NULL,
        country VARCHAR(100) NULL,
        country_raw VARCHAR(100) NULL,
        year_start SMALLINT NULL,
        year_end SMALLINT NULL,
        source_filename TEXT NULL,
        source_file_path TEXT NULL,
        -- Base counting stats
        matches_played INT NULL,
        minutes_played INT NULL,
        goals INT NULL,
        xg DECIMAL(6,2) NULL,
        assists INT NULL,
        xa DECIMAL(6,2) NULL,
        yellow_cards INT NULL,
        red_cards INT NULL,
        shots INT NULL,
        np_goals INT NULL,
        head_goals INT NULL,
        conceded_goals INT NULL,
        shots_against INT NULL,
        clean_sheets INT NULL,
        penalties_taken INT NULL,
        -- Defensive per-90
        defensive_actions_per90 DECIMAL(6,2) NULL,
        defensive_duels_per90 DECIMAL(6,2) NULL,
        defensive_duels_won_pct DECIMAL(5,2) NULL,
        aerial_duels_per90 DECIMAL(6,2) NULL,
        aerial_duels_won_pct DECIMAL(5,2) NULL,
        sliding_tackles_per90 DECIMAL(6,2) NULL,
        padj_sliding_tackles DECIMAL(6,2) NULL,
        shots_blocked_per90 DECIMAL(6,2) NULL,
        interceptions_per90 DECIMAL(6,2) NULL,
        padj_interceptions DECIMAL(6,2) NULL,
        fouls_per90 DECIMAL(6,2) NULL,
        yellow_cards_per90 DECIMAL(6,2) NULL,
        red_cards_per90 DECIMAL(6,2) NULL,
        duels_per90 DECIMAL(6,2) NULL,
        duels_won_pct DECIMAL(5,2) NULL,
        -- Attacking per-90
        attacking_actions_per90 DECIMAL(6,2) NULL,
        goals_per90 DECIMAL(6,2) NULL,
        np_goals_per90 DECIMAL(6,2) NULL,
        xg_per90 DECIMAL(6,2) NULL,
        head_goals_per90 DECIMAL(6,2) NULL,
        shots_per90 DECIMAL(6,2) NULL,
        shots_on_target_pct DECIMAL(5,2) NULL,
        goal_conversion_pct DECIMAL(5,2) NULL,
        assists_per90 DECIMAL(6,2) NULL,
        xa_per90 DECIMAL(6,2) NULL,
        crosses_per90 DECIMAL(6,2) NULL,
        crosses_accurate_pct DECIMAL(5,2) NULL,
        crosses_left_per90 DECIMAL(6,2) NULL,
        crosses_left_accurate_pct DECIMAL(5,2) NULL,
        crosses_right_per90 DECIMAL(6,2) NULL,
        crosses_right_accurate_pct DECIMAL(5,2) NULL,
        crosses_to_box_per90 DECIMAL(6,2) NULL,
        dribbles_per90 DECIMAL(6,2) NULL,
        dribbles_success_pct DECIMAL(5,2) NULL,
        offensive_duels_per90 DECIMAL(6,2) NULL,
        offensive_duels_won_pct DECIMAL(5,2) NULL,
        touches_in_box_per90 DECIMAL(6,2) NULL,
        progressive_runs_per90 DECIMAL(6,2) NULL,
        accelerations_per90 DECIMAL(6,2) NULL,
        received_passes_per90 DECIMAL(6,2) NULL,
        received_long_passes_per90 DECIMAL(6,2) NULL,
        fouls_suffered_per90 DECIMAL(6,2) NULL,
        -- Passing per-90
        passes_per90 DECIMAL(6,2) NULL,
        passes_accurate_pct DECIMAL(5,2) NULL,
        forward_passes_per90 DECIMAL(6,2) NULL,
        forward_passes_accurate_pct DECIMAL(5,2) NULL,
        back_passes_per90 DECIMAL(6,2) NULL,
        back_passes_accurate_pct DECIMAL(5,2) NULL,
        lateral_passes_per90 DECIMAL(6,2) NULL,
        lateral_passes_accurate_pct DECIMAL(5,2) NULL,
        short_medium_passes_per90 DECIMAL(6,2) NULL,
        short_medium_passes_accurate_pct DECIMAL(5,2) NULL,
        long_passes_per90 DECIMAL(6,2) NULL,
        long_passes_accurate_pct DECIMAL(5,2) NULL,
        avg_pass_length DECIMAL(5,2) NULL,
        avg_long_pass_length DECIMAL(5,2) NULL,
        shot_assists_per90 DECIMAL(6,2) NULL,
        second_assists_per90 DECIMAL(6,2) NULL,
        third_assists_per90 DECIMAL(6,2) NULL,
        smart_passes_per90 DECIMAL(6,2) NULL,
        smart_passes_accurate_pct DECIMAL(5,2) NULL,
        key_passes_per90 DECIMAL(6,2) NULL,
        passes_final_third_per90 DECIMAL(6,2) NULL,
        passes_final_third_accurate_pct DECIMAL(5,2) NULL,
        passes_penalty_area_per90 DECIMAL(6,2) NULL,
        passes_penalty_area_accurate_pct DECIMAL(5,2) NULL,
        through_passes_per90 DECIMAL(6,2) NULL,
        through_passes_accurate_pct DECIMAL(5,2) NULL,
        deep_completions_per90 DECIMAL(6,2) NULL,
        deep_completed_crosses_per90 DECIMAL(6,2) NULL,
        progressive_passes_per90 DECIMAL(6,2) NULL,
        progressive_passes_accurate_pct DECIMAL(5,2) NULL,
        -- Set pieces
        free_kicks_per90 DECIMAL(6,2) NULL,
        direct_free_kicks_per90 DECIMAL(6,2) NULL,
        direct_free_kicks_on_target_pct DECIMAL(5,2) NULL,
        corners_per90 DECIMAL(6,2) NULL,
        penalty_conversion_pct DECIMAL(5,2) NULL,
        -- Goalkeeper
        conceded_goals_per90 DECIMAL(6,2) NULL,
        shots_against_per90 DECIMAL(6,2) NULL,
        save_rate_pct DECIMAL(5,2) NULL,
        xg_against DECIMAL(6,2) NULL,
        xg_against_per90 DECIMAL(6,2) NULL,
        prevented_goals DECIMAL(6,2) NULL,
        prevented_goals_per90 DECIMAL(6,2) NULL,
        gk_back_passes_per90 DECIMAL(6,2) NULL,
        gk_exits_per90 DECIMAL(6,2) NULL,
        gk_aerial_duels_per90 DECIMAL(6,2) NULL,
        -- Physical / athletic
        total_distance_per90 DECIMAL(8,2) NULL,
        running_distance_per90 DECIMAL(8,2) NULL,
        hsr_distance_per90 DECIMAL(8,2) NULL,
        sprint_distance_per90 DECIMAL(8,2) NULL,
        hi_distance_per90 DECIMAL(8,2) NULL,
        meters_per_min DECIMAL(6,2) NULL,
        max_speed DECIMAL(5,2) NULL,
        medium_accel_per90 DECIMAL(6,2) NULL,
        high_accel_per90 DECIMAL(6,2) NULL,
        medium_decel_per90 DECIMAL(6,2) NULL,
        high_decel_per90 DECIMAL(6,2) NULL,
        hsr_count_per90 DECIMAL(6,2) NULL,
        sprint_count_per90 DECIMAL(6,2) NULL,
        hi_count_per90 DECIMAL(6,2) NULL,
        -- Meta
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_player_season_div (player_id, season(20), division(20)),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) { if (!err?.message?.includes('already exists')) console.warn('[warn] player_wyscout_stats migration:', err?.message); }

  // ── Global WyScout reference catalogue ──────────────────────────────────────
  // wyscout_players: one row per real-world player, shared across all accounts.
  // Populated only by admin/importateur via /api/import/wyscout. Independent
  // from the per-user `players` table — each user keeps their own roster,
  // and the WyScout catalogue is consulted via the /data page (PlayerCompare).
  // dedup_key = normalizeStr(name)+"|"+generation, used as UNIQUE so re-imports
  // UPSERT instead of duplicating.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wyscout_players (
        id CHAR(36) PRIMARY KEY,
        dedup_key VARCHAR(191) NOT NULL,
        name VARCHAR(255) NOT NULL,
        club VARCHAR(255) NULL,
        team_in_timeframe VARCHAR(255) NULL,
        league VARCHAR(255) NULL,
        position VARCHAR(20) NULL,
        zone VARCHAR(50) NULL,
        foot VARCHAR(30) NULL,
        nationality VARCHAR(120) NULL,
        passport_country VARCHAR(255) NULL,
        generation INT NULL,
        height INT NULL,
        weight INT NULL,
        on_loan TINYINT(1) NOT NULL DEFAULT 0,
        matches_played INT NULL,
        minutes_played INT NULL,
        market_value VARCHAR(100) NULL,
        contract_end DATE NULL,
        photo_url TEXT NULL,
        wyscout_season VARCHAR(20) NULL,
        wyscout_division VARCHAR(20) NULL,
        imported_by CHAR(36) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_wyscout_dedup (dedup_key),
        INDEX idx_wyscout_name (name(191)),
        INDEX idx_wyscout_club (club(191)),
        INDEX idx_wyscout_position (position)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) { if (!err?.message?.includes('already exists')) console.warn('[warn] wyscout_players migration:', err?.message); }

  // wyscout_player_stats: mirror of player_wyscout_stats minus user_id, keyed
  // on wyscout_player_id. Same column set so the import code can reuse
  // WYSCOUT_STATS_MAP without changes.
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS wyscout_player_stats (
        id CHAR(36) PRIMARY KEY,
        wyscout_player_id CHAR(36) NOT NULL,
        season VARCHAR(20) NOT NULL,
        division VARCHAR(20) NULL,
        team VARCHAR(255) NULL,
        continent VARCHAR(100) NULL,
        country VARCHAR(100) NULL,
        country_raw VARCHAR(100) NULL,
        year_start SMALLINT NULL,
        year_end SMALLINT NULL,
        source_filename TEXT NULL,
        source_file_path TEXT NULL,
        matches_played INT NULL,
        minutes_played INT NULL,
        goals INT NULL,
        xg DECIMAL(6,2) NULL,
        assists INT NULL,
        xa DECIMAL(6,2) NULL,
        yellow_cards INT NULL,
        red_cards INT NULL,
        shots INT NULL,
        np_goals INT NULL,
        head_goals INT NULL,
        conceded_goals INT NULL,
        shots_against INT NULL,
        clean_sheets INT NULL,
        penalties_taken INT NULL,
        defensive_actions_per90 DECIMAL(6,2) NULL,
        defensive_duels_per90 DECIMAL(6,2) NULL,
        defensive_duels_won_pct DECIMAL(5,2) NULL,
        aerial_duels_per90 DECIMAL(6,2) NULL,
        aerial_duels_won_pct DECIMAL(5,2) NULL,
        sliding_tackles_per90 DECIMAL(6,2) NULL,
        padj_sliding_tackles DECIMAL(6,2) NULL,
        shots_blocked_per90 DECIMAL(6,2) NULL,
        interceptions_per90 DECIMAL(6,2) NULL,
        padj_interceptions DECIMAL(6,2) NULL,
        fouls_per90 DECIMAL(6,2) NULL,
        yellow_cards_per90 DECIMAL(6,2) NULL,
        red_cards_per90 DECIMAL(6,2) NULL,
        duels_per90 DECIMAL(6,2) NULL,
        duels_won_pct DECIMAL(5,2) NULL,
        attacking_actions_per90 DECIMAL(6,2) NULL,
        goals_per90 DECIMAL(6,2) NULL,
        np_goals_per90 DECIMAL(6,2) NULL,
        xg_per90 DECIMAL(6,2) NULL,
        head_goals_per90 DECIMAL(6,2) NULL,
        shots_per90 DECIMAL(6,2) NULL,
        shots_on_target_pct DECIMAL(5,2) NULL,
        goal_conversion_pct DECIMAL(5,2) NULL,
        assists_per90 DECIMAL(6,2) NULL,
        xa_per90 DECIMAL(6,2) NULL,
        crosses_per90 DECIMAL(6,2) NULL,
        crosses_accurate_pct DECIMAL(5,2) NULL,
        crosses_left_per90 DECIMAL(6,2) NULL,
        crosses_left_accurate_pct DECIMAL(5,2) NULL,
        crosses_right_per90 DECIMAL(6,2) NULL,
        crosses_right_accurate_pct DECIMAL(5,2) NULL,
        crosses_to_box_per90 DECIMAL(6,2) NULL,
        dribbles_per90 DECIMAL(6,2) NULL,
        dribbles_success_pct DECIMAL(5,2) NULL,
        offensive_duels_per90 DECIMAL(6,2) NULL,
        offensive_duels_won_pct DECIMAL(5,2) NULL,
        touches_in_box_per90 DECIMAL(6,2) NULL,
        progressive_runs_per90 DECIMAL(6,2) NULL,
        accelerations_per90 DECIMAL(6,2) NULL,
        received_passes_per90 DECIMAL(6,2) NULL,
        received_long_passes_per90 DECIMAL(6,2) NULL,
        fouls_suffered_per90 DECIMAL(6,2) NULL,
        passes_per90 DECIMAL(6,2) NULL,
        passes_accurate_pct DECIMAL(5,2) NULL,
        forward_passes_per90 DECIMAL(6,2) NULL,
        forward_passes_accurate_pct DECIMAL(5,2) NULL,
        back_passes_per90 DECIMAL(6,2) NULL,
        back_passes_accurate_pct DECIMAL(5,2) NULL,
        lateral_passes_per90 DECIMAL(6,2) NULL,
        lateral_passes_accurate_pct DECIMAL(5,2) NULL,
        short_medium_passes_per90 DECIMAL(6,2) NULL,
        short_medium_passes_accurate_pct DECIMAL(5,2) NULL,
        long_passes_per90 DECIMAL(6,2) NULL,
        long_passes_accurate_pct DECIMAL(5,2) NULL,
        avg_pass_length DECIMAL(5,2) NULL,
        avg_long_pass_length DECIMAL(5,2) NULL,
        shot_assists_per90 DECIMAL(6,2) NULL,
        second_assists_per90 DECIMAL(6,2) NULL,
        third_assists_per90 DECIMAL(6,2) NULL,
        smart_passes_per90 DECIMAL(6,2) NULL,
        smart_passes_accurate_pct DECIMAL(5,2) NULL,
        key_passes_per90 DECIMAL(6,2) NULL,
        passes_final_third_per90 DECIMAL(6,2) NULL,
        passes_final_third_accurate_pct DECIMAL(5,2) NULL,
        passes_penalty_area_per90 DECIMAL(6,2) NULL,
        passes_penalty_area_accurate_pct DECIMAL(5,2) NULL,
        through_passes_per90 DECIMAL(6,2) NULL,
        through_passes_accurate_pct DECIMAL(5,2) NULL,
        deep_completions_per90 DECIMAL(6,2) NULL,
        deep_completed_crosses_per90 DECIMAL(6,2) NULL,
        progressive_passes_per90 DECIMAL(6,2) NULL,
        progressive_passes_accurate_pct DECIMAL(5,2) NULL,
        free_kicks_per90 DECIMAL(6,2) NULL,
        direct_free_kicks_per90 DECIMAL(6,2) NULL,
        direct_free_kicks_on_target_pct DECIMAL(5,2) NULL,
        corners_per90 DECIMAL(6,2) NULL,
        penalty_conversion_pct DECIMAL(5,2) NULL,
        conceded_goals_per90 DECIMAL(6,2) NULL,
        shots_against_per90 DECIMAL(6,2) NULL,
        save_rate_pct DECIMAL(5,2) NULL,
        xg_against DECIMAL(6,2) NULL,
        xg_against_per90 DECIMAL(6,2) NULL,
        prevented_goals DECIMAL(6,2) NULL,
        prevented_goals_per90 DECIMAL(6,2) NULL,
        gk_back_passes_per90 DECIMAL(6,2) NULL,
        gk_exits_per90 DECIMAL(6,2) NULL,
        gk_aerial_duels_per90 DECIMAL(6,2) NULL,
        total_distance_per90 DECIMAL(8,2) NULL,
        running_distance_per90 DECIMAL(8,2) NULL,
        hsr_distance_per90 DECIMAL(8,2) NULL,
        sprint_distance_per90 DECIMAL(8,2) NULL,
        hi_distance_per90 DECIMAL(8,2) NULL,
        meters_per_min DECIMAL(6,2) NULL,
        max_speed DECIMAL(5,2) NULL,
        medium_accel_per90 DECIMAL(6,2) NULL,
        high_accel_per90 DECIMAL(6,2) NULL,
        medium_decel_per90 DECIMAL(6,2) NULL,
        high_decel_per90 DECIMAL(6,2) NULL,
        hsr_count_per90 DECIMAL(6,2) NULL,
        sprint_count_per90 DECIMAL(6,2) NULL,
        hi_count_per90 DECIMAL(6,2) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_wyscout_stats (wyscout_player_id, season(20), division(20)),
        INDEX idx_wyscout_stats_season (season),
        FOREIGN KEY (wyscout_player_id) REFERENCES wyscout_players(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) { if (!err?.message?.includes('already exists')) console.warn('[warn] wyscout_player_stats migration:', err?.message); }

  // ── One-shot backfill of the WyScout catalogue from legacy per-user imports ─
  // Runs only when wyscout_players is empty. Extracts every players row that
  // looks like a WyScout import (wyscout_division IS NOT NULL) and whose owner
  // had admin/importateur role, deduping by normalizeStr(name)+'|'+generation.
  // Stats are copied from player_wyscout_stats over to wyscout_player_stats.
  try {
    const [[{ count: catalogueCount }]] = await pool.query('SELECT COUNT(*) AS count FROM wyscout_players');
    if (catalogueCount === 0) {
      const [legacyPlayers] = await pool.query(`
        SELECT p.id, p.name, p.club, p.league, p.position, p.zone, p.foot,
               p.nationality, p.passport_country, p.generation, p.height, p.weight,
               p.on_loan, p.matches_played, p.minutes_played, p.market_value,
               p.contract_end, p.photo_url, p.wyscout_season, p.wyscout_division,
               p.wyscout_team_in_timeframe, p.user_id
        FROM players p
        WHERE p.wyscout_division IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM user_roles ur
            WHERE ur.user_id = p.user_id AND ur.role IN ('admin','importateur')
          )
      `);

      if (legacyPlayers.length > 0) {
        console.log(`[migration] wyscout backfill: ${legacyPlayers.length} legacy players to migrate`);
        const playerCols = [
          'id', 'dedup_key', 'name', 'club', 'team_in_timeframe', 'league',
          'position', 'zone', 'foot', 'nationality', 'passport_country',
          'generation', 'height', 'weight', 'on_loan', 'matches_played',
          'minutes_played', 'market_value', 'contract_end', 'photo_url',
          'wyscout_season', 'wyscout_division', 'imported_by',
        ];
        const seenKeys = new Map(); // dedup_key -> { wyscoutId, legacyPlayerIds:Set }

        for (const p of legacyPlayers) {
          const nm = normalizeStr(p.name || '');
          if (!nm) continue;
          const dedupKey = `${nm}|${p.generation ?? 0}`.slice(0, 191);
          let entry = seenKeys.get(dedupKey);
          if (!entry) {
            entry = { wyscoutId: uuidv4(), legacyPlayerIds: new Set(), first: p };
            seenKeys.set(dedupKey, entry);
          }
          entry.legacyPlayerIds.add(p.id);
        }

        const insertRows = [...seenKeys.entries()].map(([dedupKey, { wyscoutId, first }]) => [
          wyscoutId, dedupKey, first.name, first.club || null,
          first.wyscout_team_in_timeframe || null, first.league || null,
          first.position || null, first.zone || null, first.foot || null,
          first.nationality || null, first.passport_country || null,
          first.generation, first.height, first.weight, first.on_loan,
          first.matches_played, first.minutes_played, first.market_value,
          first.contract_end, first.photo_url || null,
          first.wyscout_season, first.wyscout_division, first.user_id,
        ]);

        const CHUNK = 500;
        for (let i = 0; i < insertRows.length; i += CHUNK) {
          const chunk = insertRows.slice(i, i + CHUNK);
          const ph = chunk.map(() => `(${playerCols.map(() => '?').join(',')})`).join(',');
          await pool.query(
            `INSERT IGNORE INTO wyscout_players (${playerCols.join(',')}) VALUES ${ph}`,
            chunk.flat()
          );
        }
        console.log(`[migration] wyscout backfill: ${seenKeys.size} unique catalogue rows inserted`);

        // Now copy stats. Build a map legacyPlayerId -> wyscoutPlayerId
        const legacyToWyscout = new Map();
        for (const [, { wyscoutId, legacyPlayerIds }] of seenKeys) {
          for (const lid of legacyPlayerIds) legacyToWyscout.set(lid, wyscoutId);
        }

        // Stream stats in chunks to avoid loading 100k rows into memory at once
        const legacyIds = [...legacyToWyscout.keys()];
        const STAT_FETCH_CHUNK = 500;
        let statsInserted = 0;
        for (let i = 0; i < legacyIds.length; i += STAT_FETCH_CHUNK) {
          const chunkIds = legacyIds.slice(i, i + STAT_FETCH_CHUNK);
          const phIds = chunkIds.map(() => '?').join(',');
          const [statRows] = await pool.query(
            `SELECT * FROM player_wyscout_stats WHERE player_id IN (${phIds})`,
            chunkIds
          );
          if (!statRows.length) continue;

          // Build insert rows mirroring wyscout_player_stats columns (drop user_id).
          // Use a fresh UUID for id to avoid PK collision with the legacy row.
          const statCols = Object.keys(statRows[0]).filter(c => c !== 'user_id' && c !== 'player_id' && c !== 'id' && c !== 'created_at' && c !== 'updated_at');
          const allCols = ['id', 'wyscout_player_id', ...statCols];
          const STAT_INSERT_CHUNK = 100;
          for (let j = 0; j < statRows.length; j += STAT_INSERT_CHUNK) {
            const insertChunk = statRows.slice(j, j + STAT_INSERT_CHUNK);
            const vals = [];
            for (const s of insertChunk) {
              const wyscoutPlayerId = legacyToWyscout.get(s.player_id);
              if (!wyscoutPlayerId) continue;
              vals.push(uuidv4(), wyscoutPlayerId, ...statCols.map(c => s[c]));
            }
            if (!vals.length) continue;
            const realCount = vals.length / allCols.length;
            const ph = Array.from({ length: realCount }, () => `(${allCols.map(() => '?').join(',')})`).join(',');
            try {
              await pool.query(
                `INSERT IGNORE INTO wyscout_player_stats (${allCols.join(',')}) VALUES ${ph}`,
                vals
              );
              statsInserted += realCount;
            } catch (err) {
              console.warn('[migration] wyscout stats backfill chunk:', err?.message);
            }
          }
        }
        console.log(`[migration] wyscout backfill: ${statsInserted} stat rows inserted`);
      }
    }
  } catch (err) {
    console.warn('[warn] wyscout catalogue backfill skipped:', err?.message);
  }

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

  // Ensure scout_opinions table exists
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scout_opinions (
        id CHAR(36) PRIMARY KEY,
        player_id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        current_level DECIMAL(3,1) NOT NULL DEFAULT 5.0,
        potential DECIMAL(3,1) NOT NULL DEFAULT 5.0,
        opinion VARCHAR(20) NOT NULL DEFAULT 'À revoir',
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_scout_opinions_player (player_id),
        INDEX idx_scout_opinions_org (organization_id),
        INDEX idx_scout_opinions_user (user_id),
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE,
        FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    console.error("[ERROR] Could not auto-create scout_opinions table:", err?.message, err?.code, err?.sqlMessage);
  }
  // Migrate scout_opinions: replace old 'rating' column with current_level + potential
  try {
    const [cols] = await pool.query(`SHOW COLUMNS FROM scout_opinions LIKE 'rating'`);
    if (cols.length > 0) {
      await pool.query(`ALTER TABLE scout_opinions DROP COLUMN rating`);
      await pool.query(`ALTER TABLE scout_opinions ADD COLUMN current_level DECIMAL(3,1) NOT NULL DEFAULT 5.0 AFTER user_id`);
      await pool.query(`ALTER TABLE scout_opinions ADD COLUMN potential DECIMAL(3,1) NOT NULL DEFAULT 5.0 AFTER current_level`);
      console.log("[info] Migrated scout_opinions: rating -> current_level + potential");
    }
  } catch (err) {
    // Columns may already be correct
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

  // Purge invalid league values
  try {
    const INVALID_LEAGUES = [
      'Los Angeles FC', 'LAFC', 'Real Salt Lake', 'LA Galaxy', 'Inter Miami CF',
      'Atlanta United FC', 'Seattle Sounders FC', 'New York City FC',
      'Brasileirão Série A', 'Brasileirão Série B', 'Brésil', 'Brazil',
      'Nationale 3', 'Nationale U19', 'National U19', 'N3',
      'Pays inexistant', 'pays inexistant', 'Unknown', 'unknown', 'N/A', 'n/a', '-',
    ];
    const placeholders = INVALID_LEAGUES.map(() => '?').join(', ');
    const [result] = await pool.query(
      `UPDATE players SET league = '' WHERE league IN (${placeholders})`,
      INVALID_LEAGUES
    );
    const CLUB_TO_LEAGUE_MAP = require('../src/data/club-to-league.json');
    for (const clubName of Object.keys(CLUB_TO_LEAGUE_MAP)) {
      await pool.query(
        "UPDATE players SET league = '' WHERE league = ? AND club != ?",
        [clubName, clubName]
      );
    }
    if (result.affectedRows > 0) {
      console.log(`[migration] Purged ${result.affectedRows} invalid league values`);
    }
  } catch (err) {
    console.warn("[warn] purge-invalid-leagues migration:", err?.message);
  }

  // Normalize league name aliases
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
    await pool.query("UPDATE players SET league = TRIM(league) WHERE league != TRIM(league)");
    if (totalFixed > 0) {
      console.log(`[migration] Normalized ${totalFixed} league aliases`);
    }
  } catch (err) {
    console.warn("[warn] normalize-league-aliases migration:", err?.message);
  }

  // Fix player league data: replace country names with correct league names
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

  // Purge numeric/invalid league values (API IDs stored by mistake)
  try {
    const [result] = await pool.query(
      "UPDATE players SET league = '' WHERE league REGEXP '^[0-9]+$'"
    );
    if (result.affectedRows > 0) {
      console.log(`[migration] Purged ${result.affectedRows} numeric league values (API IDs)`);
    }
  } catch (err) {
    console.warn("[warn] purge-numeric-leagues migration:", err?.message);
  }

  // Fix wrong leagues using the alias-aware club→league resolver
  // (handles "Paris SG" / "PSG" / "Paris Saint-Germain", accents, etc.)
  try {
    const { playersFixed, directoryFixed, clubsScanned } = await fixPlayerLeaguesByClub(pool);
    if (playersFixed > 0 || directoryFixed > 0) {
      console.log(`[migration] Fixed leagues: ${playersFixed} players, ${directoryFixed} directory entries (scanned ${clubsScanned} distinct clubs)`);
    }
  } catch (err) {
    console.warn("[warn] fix-club-leagues migration:", err?.message);
  }

  // Add Stripe columns to user_subscriptions
  try {
    await pool.query(`ALTER TABLE user_subscriptions ADD COLUMN stripe_customer_id VARCHAR(255) NULL`);
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] stripe_customer_id migration:", err?.message); }
  try {
    await pool.query(`ALTER TABLE user_subscriptions ADD COLUMN stripe_subscription_id VARCHAR(255) NULL`);
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] stripe_subscription_id migration:", err?.message); }
  try {
    await pool.query(`ALTER TABLE user_subscriptions ADD COLUMN plan_type VARCHAR(30) NOT NULL DEFAULT 'starter'`);
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] plan_type migration:", err?.message); }
  try {
    await pool.query(`ALTER TABLE user_subscriptions ADD COLUMN billing_cycle VARCHAR(20) NULL`);
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] billing_cycle migration:", err?.message); }
  try {
    await pool.query(`ALTER TABLE user_subscriptions ADD COLUMN subscription_end DATETIME NULL`);
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] subscription_end migration:", err?.message); }

  // Ensure notifications table exists
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL,
        message TEXT NULL,
        icon VARCHAR(50) NULL,
        link VARCHAR(255) NULL,
        player_id CHAR(36) NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notifications_user (user_id, is_read, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] notifications table migration:", err?.message);
  }

  // Add social columns to profiles
  for (const col of [
    'social_x VARCHAR(100) NULL',
    'social_instagram VARCHAR(100) NULL',
    'social_linkedin VARCHAR(255) NULL',
    'social_public TINYINT(1) NOT NULL DEFAULT 0',
    'social_facebook VARCHAR(255) NULL',
    'social_snapchat VARCHAR(100) NULL',
    'social_tiktok VARCHAR(100) NULL',
    'social_telegram VARCHAR(100) NULL',
    'social_whatsapp VARCHAR(30) NULL',
  ]) {
    try { await pool.query(`ALTER TABLE profiles ADD COLUMN ${col}`); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] profile social migration:", err?.message); }
  }
  // Add Google OAuth columns to users
  for (const col of [
    "oauth_provider VARCHAR(50) NULL",
    "oauth_sub VARCHAR(255) NULL",
  ]) {
    try { await pool.query(`ALTER TABLE users ADD COLUMN ${col}`); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] users oauth migration:", err?.message); }
  }

  // Add extended personal info columns to profiles
  for (const col of [
    'photo_url TEXT NULL',
    'first_name VARCHAR(100) NULL',
    'last_name VARCHAR(100) NULL',
    'company VARCHAR(200) NULL',
    'siret VARCHAR(20) NULL',
    'phone VARCHAR(30) NULL',
    "civility ENUM('M.','Mme','Non précisé') NULL DEFAULT NULL",
    'address TEXT NULL',
    'date_of_birth DATE NULL',
    'reference_club VARCHAR(200) NULL',
  ]) {
    try { await pool.query(`ALTER TABLE profiles ADD COLUMN ${col}`); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] profile extended migration:", err?.message); }
  }
  // referred_by – separate migration so failures in the loop above don't skip it
  try { await pool.query("ALTER TABLE profiles ADD COLUMN referred_by CHAR(36) NULL"); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] referred_by migration:", err?.message); }
  // country – for map localisation
  try { await pool.query("ALTER TABLE profiles ADD COLUMN country VARCHAR(100) NULL"); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] profiles.country migration:", err?.message); }

  // org logo_url + description
  try { await pool.query("ALTER TABLE organizations ADD COLUMN logo_url TEXT NULL"); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] org logo_url migration:", err?.message); }
  try { await pool.query("ALTER TABLE organizations ADD COLUMN description TEXT NULL"); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] org description migration:", err?.message); }

  // Ensure player_research table exists
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_research (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        player_id CHAR(36) NOT NULL,
        type VARCHAR(30) NOT NULL DEFAULT 'note',
        title VARCHAR(500) NOT NULL,
        url TEXT NULL,
        content TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_player_research (user_id, player_id, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] player_research migration:", err?.message);
  }

  // Ensure player_videos table exists
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS player_videos (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        player_id CHAR(36) NOT NULL,
        title VARCHAR(500) NOT NULL,
        url TEXT NULL,
        file_url TEXT NULL,
        description TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_player_videos (user_id, player_id, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] player_videos migration:", err?.message);
  }

  // Ensure followed_clubs table exists
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS followed_clubs (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        club_name VARCHAR(255) NOT NULL,
        notes TEXT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_user_club (user_id, club_name(191)),
        INDEX idx_followed_clubs_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] followed_clubs migration:", err?.message);
  }

  // Migrate user_roles.role from ENUM to VARCHAR to support custom roles
  try {
    await pool.query("ALTER TABLE user_roles MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'");
  } catch (err) {
    if (err?.errno !== 1060) { /* already migrated or same type */ }
  }

  // Ensure page_permissions table exists
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS page_permissions (
        id CHAR(36) PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        page_key VARCHAR(100) NOT NULL,
        allowed TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uniq_role_page (role, page_key)
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] page_permissions table migration:", err?.message);
  }

  // Migrate user_roles.role from ENUM to VARCHAR (supports custom role names)
  try {
    await pool.query(`ALTER TABLE user_roles MODIFY COLUMN role VARCHAR(50) NOT NULL DEFAULT 'user'`);
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] user_roles role varchar migration:", err?.message); }

  // Seed default 'importateur' role with data_import permissions
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS role_metadata (role VARCHAR(50) NOT NULL PRIMARY KEY, color VARCHAR(20) NOT NULL DEFAULT '#6366f1', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`).catch(() => {});
    await pool.query(`INSERT INTO role_metadata (role, color) VALUES ('importateur', '#10b981') ON DUPLICATE KEY UPDATE role = role`);
    for (const action of ['view', 'import']) {
      await pool.query(
        `INSERT INTO page_permissions (id, role, page_key, action, allowed) VALUES (?, 'importateur', 'data_import', ?, 1) ON DUPLICATE KEY UPDATE allowed = 1`,
        [uuidv4(), action]
      );
    }
  } catch (err) { console.warn('[warn] importateur role seed:', err?.message); }

  // Add action column to page_permissions for sub-permission support
  try {
    await pool.query(`ALTER TABLE page_permissions ADD COLUMN action VARCHAR(50) NOT NULL DEFAULT 'view' AFTER page_key`);
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] page_permissions action migration:", err?.message); }
  // Update unique key to (role, page_key, action)
  try { await pool.query(`ALTER TABLE page_permissions DROP INDEX uniq_role_page`); } catch (_) {}
  try {
    await pool.query(`ALTER TABLE page_permissions ADD UNIQUE KEY uniq_role_page_action (role, page_key, action)`);
  } catch (err) { if (err?.errno !== 1061) console.warn("[warn] page_permissions unique key migration:", err?.message); }

  // Ensure feedback table exists
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        rating TINYINT NOT NULL,
        message TEXT NULL,
        page_url VARCHAR(500) NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_feedback_user (user_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] feedback table migration:", err?.message);
  }

  // Ensure uploaded_images table exists (persistent image storage for Vercel)
  // id is VARCHAR(191) to stay under TiDB's 1000-byte key limit with utf8mb4 (191*4=764)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS uploaded_images (
        id VARCHAR(191) PRIMARY KEY,
        data LONGBLOB NOT NULL,
        mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] uploaded_images table migration:", err?.message);
  }

  await migrateLegacyProfilePhotosToDb();

  // ── User sessions (live analytics / heartbeat) ──
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        session_id VARCHAR(64) NOT NULL,
        device_type ENUM('desktop','mobile','tablet') NOT NULL DEFAULT 'desktop',
        browser VARCHAR(50) NULL,
        os VARCHAR(100) NULL,
        screen_width INT NULL,
        screen_height INT NULL,
        language VARCHAR(10) NULL,
        current_page VARCHAR(255) NULL,
        ip_address VARCHAR(45) NULL,
        started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_user_session (user_id, session_id),
        INDEX idx_last_seen (last_seen_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] user_sessions migration:", err?.message);
  }

  // notification_prefs column on users table
  try {
    await pool.query("ALTER TABLE users ADD COLUMN notification_prefs TEXT NULL");
  } catch (err) { if (err?.errno !== 1060) console.warn("[warn] notification_prefs migration:", err?.message); }

  // ── Org chat tables ────────────────────────────────────────────────────────
  // Ensure referenced tables are InnoDB AND share the same collation (utf8mb4_unicode_ci)
  // as the org_message tables. Without matching engine+collation the FK constraints fail:
  //   - MyISAM doesn't support FKs at all
  //   - Mixed collations (e.g. utf8mb4_general_ci vs utf8mb4_unicode_ci) make FKs incompatible
  // CONVERT TO CHARACTER SET is idempotent: if the table already uses utf8mb4_unicode_ci it
  // performs a fast metadata-only operation.
  try { await pool.query(`ALTER TABLE organizations ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); }
  catch (err) { console.warn('[warn] organizations → InnoDB+unicode_ci:', err?.message); }
  try { await pool.query(`ALTER TABLE users ENGINE=InnoDB, CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`); }
  catch (err) { console.warn('[warn] users → InnoDB+unicode_ci:', err?.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS org_messages (
        id           CHAR(36)      NOT NULL PRIMARY KEY,
        org_id       CHAR(36)      NOT NULL,
        user_id      CHAR(36)      NOT NULL,
        content      TEXT          NOT NULL,
        reply_to_id  CHAR(36)      NULL,
        edited_at    DATETIME      NULL,
        deleted_at   DATETIME      NULL,
        created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_org_msg      (org_id, created_at),
        FOREIGN KEY (org_id)       REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)      REFERENCES users(id)         ON DELETE CASCADE,
        FOREIGN KEY (reply_to_id)  REFERENCES org_messages(id)  ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) { if (!err?.message?.includes('already exists')) console.warn('[warn] org_messages:', err?.message); }

  // Upgrade org_messages.content VARCHAR(512) → TEXT (if already created with old type)
  try {
    await pool.query(`ALTER TABLE org_messages MODIFY COLUMN content TEXT NOT NULL`);
  } catch (err) {
    // Ignore if type already correct or table doesn't exist yet
  }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS org_message_reactions (
        message_id CHAR(36)    NOT NULL,
        user_id    CHAR(36)    NOT NULL,
        emoji      VARCHAR(10) NOT NULL,
        created_at DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (message_id, user_id, emoji),
        FOREIGN KEY (message_id) REFERENCES org_messages(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id)    REFERENCES users(id)         ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) { if (!err?.message?.includes('already exists')) console.warn('[warn] org_message_reactions:', err?.message); }

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS org_message_reads (
        org_id      CHAR(36) NOT NULL,
        user_id     CHAR(36) NOT NULL,
        last_read_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (org_id, user_id),
        FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id)          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  } catch (err) { if (!err?.message?.includes('already exists')) console.warn('[warn] org_message_reads:', err?.message); }

  // Dedicated standings cache table — permanent for historical seasons
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS championship_standings (
        tournament_id  INT           NOT NULL,
        season_year    INT           NOT NULL,
        espn_slug      VARCHAR(60)   NULL,
        season_name    VARCHAR(200)  NULL,
        standings_json LONGTEXT      NOT NULL,
        source         VARCHAR(20)   NOT NULL DEFAULT 'espn',
        fetched_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (tournament_id, season_year),
        INDEX idx_cs_fetched (fetched_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] championship_standings migration:", err?.message);
  }

  // championship_clubs — custom club additions per championship (moderator-managed)
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS championship_clubs (
        championship_name VARCHAR(200) NOT NULL,
        club_name         VARCHAR(200) NOT NULL,
        added_by          CHAR(36)     NULL,
        created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (championship_name, club_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] championship_clubs migration:", err?.message);
  }

  // championship_manual_data — moderator-entered standings
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS championship_manual_data (
        id                  CHAR(36)     NOT NULL DEFAULT (UUID()),
        championship_name   VARCHAR(200) NOT NULL,
        season_year         INT          NOT NULL,
        season_display_name VARCHAR(200) NULL,
        standings_json      LONGTEXT     NOT NULL,
        updated_by          CHAR(36)     NULL,
        updated_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (id),
        UNIQUE KEY uq_manual_champ_season (championship_name(150), season_year),
        INDEX idx_manual_updated (updated_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] championship_manual_data migration:", err?.message);
  }

  // exchange_rates table — admin-managed currency conversion rates vs EUR
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS exchange_rates (
        currency_code VARCHAR(3)    NOT NULL PRIMARY KEY,
        symbol        VARCHAR(10)   NOT NULL DEFAULT '',
        name_fr       VARCHAR(100)  NOT NULL DEFAULT '',
        rate_vs_eur   DECIMAL(14,6) NOT NULL DEFAULT 1.000000,
        updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);
    // Seed default rates if table is empty
    const [[countRow]] = await pool.query('SELECT COUNT(*) AS n FROM exchange_rates');
    if (countRow.n === 0) {
      const seeds = [
        ['EUR','€','Euro',1.000000],
        ['USD','$','Dollar US',1.080000],
        ['GBP','£','Livre sterling',0.860000],
        ['CHF','Fr','Franc suisse',0.950000],
        ['MAD','MAD','Dirham marocain',10.800000],
        ['DZD','DA','Dinar algérien',145.000000],
        ['TND','DT','Dinar tunisien',3.340000],
        ['CAD','C$','Dollar canadien',1.470000],
        ['AUD','A$','Dollar australien',1.650000],
        ['BRL','R$','Réal brésilien',5.400000],
        ['MXN','MX$','Peso mexicain',18.200000],
        ['SAR','ر.س','Riyal saoudien',4.050000],
        ['AED','د.إ','Dirham émirien',3.970000],
        ['JPY','¥','Yen japonais',162.000000],
        ['CNY','¥','Yuan chinois',7.820000],
        ['INR','₹','Roupie indienne',90.000000],
        ['TRY','₺','Livre turque',34.500000],
      ];
      for (const [code, sym, name, rate] of seeds) {
        await pool.query(
          'INSERT IGNORE INTO exchange_rates (currency_code, symbol, name_fr, rate_vs_eur) VALUES (?, ?, ?, ?)',
          [code, sym, name, rate]
        );
      }
    }
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[warn] exchange_rates migration:', err?.message);
  }

  console.log("[startup] Legacy migrations complete");
}

// ── Notification preferences ─────────────────────────────────────────────

const DEFAULT_NOTIF_PREFS = {
  email_match_assigned: true,
  email_org_invite: true,
  email_community: true,
  email_weekly: false,
  web_bell: true,
  alert_no_report_days: 30,    // 0 = never, 7, 30
  alert_contract_months: 3,    // 0 = never, 3, 6, 12
};

app.get("/api/notification-prefs", authMiddleware, async (req, res) => {
  try {
    const [[row]] = await pool.query("SELECT notification_prefs FROM users WHERE id = ?", [req.user.id]);
    let prefs = { ...DEFAULT_NOTIF_PREFS };
    if (row?.notification_prefs) {
      try { Object.assign(prefs, JSON.parse(row.notification_prefs)); } catch {}
    }
    return res.json(prefs);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.put("/api/notification-prefs", authMiddleware, async (req, res) => {
  try {
    // Fetch existing prefs first so we do a proper merge
    const [[row]] = await pool.query("SELECT notification_prefs FROM users WHERE id = ?", [req.user.id]);
    let existing = { ...DEFAULT_NOTIF_PREFS };
    if (row?.notification_prefs) {
      try { Object.assign(existing, JSON.parse(row.notification_prefs)); } catch {}
    }
    const boolKeys = ['email_match_assigned','email_org_invite','email_community','email_weekly','web_bell'];
    const numericKeys = { alert_no_report_days: [0,7,30], alert_contract_months: [0,3,6,12] };
    for (const key of boolKeys) {
      if (key in req.body) existing[key] = Boolean(req.body[key]);
    }
    for (const [key, allowed] of Object.entries(numericKeys)) {
      if (key in req.body) {
        const v = Number(req.body[key]);
        if (allowed.includes(v)) existing[key] = v;
      }
    }
    await pool.query("UPDATE users SET notification_prefs = ? WHERE id = ?", [JSON.stringify(existing), req.user.id]);
    return res.json(existing);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Exchange rates ────────────────────────────────────────────────────────────
app.get("/api/exchange-rates", authMiddleware, async (_req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM exchange_rates ORDER BY currency_code');
    res.set('Cache-Control', 'public, max-age=900');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

app.put("/api/admin/exchange-rates", authMiddleware, ensureAdmin, async (req, res) => {
  const { currency_code, rate_vs_eur } = req.body || {};
  if (!currency_code || rate_vs_eur == null) return res.status(400).json({ error: 'Paramètres manquants' });
  const rate = parseFloat(rate_vs_eur);
  if (isNaN(rate) || rate <= 0) return res.status(400).json({ error: 'Taux invalide' });
  try {
    await pool.query(
      'INSERT INTO exchange_rates (currency_code, rate_vs_eur, updated_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE rate_vs_eur = VALUES(rate_vs_eur), updated_at = NOW()',
      [currency_code, rate]
    );
    const [[row]] = await pool.query('SELECT * FROM exchange_rates WHERE currency_code = ?', [currency_code]);
    return res.json(row);
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Page access info (which roles can view each page) ────────────────────
app.get("/api/page-access-info", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT page_key, role FROM page_permissions WHERE action = 'view' AND allowed = 1 AND role != 'admin' ORDER BY role"
    );
    const map = {};
    for (const { page_key, role } of rows) {
      if (!map[page_key]) map[page_key] = [];
      if (!map[page_key].includes(role)) map[page_key].push(role);
    }
    return res.json(map);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Notification helper ──────────────────────────────────────────────────
async function createNotification(userId, { type, title, message, icon, link, playerId } = {}) {
  try {
    await pool.query(
      `INSERT INTO notifications (id, user_id, type, title, message, icon, link, player_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [uuidv4(), userId, type || "system", title, message || null, icon || null, link || null, playerId || null]
    );
  } catch (err) {
    console.warn("[notification] Failed to create:", err?.message);
  }
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

// ── Serve uploaded images from DB ─────────────────────────────────────────
app.get("/api/images/:id", async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT data, mime_type FROM uploaded_images WHERE id = ? LIMIT 1", [req.params.id]);
    if (!rows.length) return res.status(404).end();
    res.set("Content-Type", rows[0].mime_type);
    res.set("Cache-Control", "public, max-age=31536000, immutable");
    res.send(rows[0].data);
  } catch (err) {
    console.error("[images] Error:", err.message);
    res.status(500).end();
  }
});

// ── Community player search (search across premium/mod/admin scouts' players) ──
app.get("/api/community-players/search", authMiddleware, async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const position = String(req.query.position || "").trim();
    const nationality = String(req.query.nationality || "").trim();
    const club = String(req.query.club || "").trim();
    const ageMin = req.query.ageMin ? parseInt(req.query.ageMin) : null;
    const ageMax = req.query.ageMax ? parseInt(req.query.ageMax) : null;
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);

    if (!q && !club) return res.status(400).json({ error: "q or club required" });

    // Find users who are premium, moderator, or admin (eligible to share)
    const [eligibleUsers] = await pool.query(`
      SELECT DISTINCT u.id
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN user_subscriptions us ON us.user_id = u.id
      WHERE ur.role IN ('admin', 'moderator') OR us.is_premium = 1
    `);
    if (!eligibleUsers.length) return res.json({ players: [] });

    const userIds = eligibleUsers.map(u => u.id);
    // Exclude current user's own players (they already see those)
    const filteredIds = userIds.filter(id => id !== req.user.id);
    if (!filteredIds.length) return res.json({ players: [] });

    const ph = filteredIds.map(() => "?").join(",");
    let where = `p.user_id IN (${ph})`;
    const params = [...filteredIds];

    if (q) {
      where += ` AND (p.name LIKE ? OR p.club LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`);
    }
    if (club) {
      where += ` AND p.club LIKE ?`;
      params.push(`%${club}%`);
    }
    if (position) {
      where += ` AND (p.position LIKE ? OR p.zone LIKE ?)`;
      params.push(`%${position}%`, `%${position}%`);
    }
    if (nationality) {
      where += ` AND p.nationality LIKE ?`;
      params.push(`%${nationality}%`);
    }
    if (ageMin) {
      where += ` AND p.generation <= ?`;
      params.push(new Date().getFullYear() - ageMin);
    }
    if (ageMax) {
      where += ` AND p.generation >= ?`;
      params.push(new Date().getFullYear() - ageMax);
    }

    const [rows] = await pool.query(`
      SELECT p.id, p.name, p.club, p.league, p.nationality, p.position, p.zone,
             p.generation, p.photo_url, p.market_value,
             COALESCE(pur.current_level, 0) AS current_level,
             COALESCE(pur.potential, 0) AS potential,
             COALESCE(pur.general_opinion, 'À revoir') AS general_opinion,
             p.transfermarkt_id, p.user_id,
             pr.full_name AS scout_name, pr.photo_url AS scout_photo, pr.club AS scout_club
      FROM players p
      LEFT JOIN profiles pr ON pr.user_id = p.user_id
      LEFT JOIN player_user_rating pur ON pur.player_id = p.id AND pur.user_id = p.user_id
      WHERE ${where} AND p.name != ''
      ORDER BY p.updated_at DESC
      LIMIT ?
    `, [...params, limit]);

    const players = rows.map(r => ({
      id: r.id,
      name: r.name,
      club: r.club,
      league: r.league,
      nationality: r.nationality,
      position: r.position,
      zone: r.zone,
      age: r.generation ? new Date().getFullYear() - r.generation : null,
      photo_url: r.photo_url,
      market_value: r.market_value,
      current_level: r.current_level,
      potential: r.potential,
      general_opinion: r.general_opinion,
      transfermarkt_id: r.transfermarkt_id,
      scout: {
        name: r.scout_name || "Scout",
        photo: r.scout_photo,
        club: r.scout_club,
      },
    }));

    return res.json({ players });
  } catch (err) {
    console.error("[community-players/search] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
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
  const { email, password, fullName = "", club = "", role = "scout", referralCode = "",
          country = "", _hp = "", _t = "" } = req.body || {};
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const normalizedFullName = String(fullName || "").trim();
  const normalizedClub = String(club || "").trim();
  const normalizedRole = String(role || "scout").trim();
  const normalizedCountry = String(country || "").trim().slice(0, 100);
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || null;
  const ua = req.headers['user-agent'] || '';

  // ── Anti-bot checks ──
  // 1. Honeypot: if _hp is filled, it's a bot
  if (String(_hp).trim().length > 0) {
    console.warn(`[signup/antibot] Honeypot triggered from IP ${ip}`);
    return res.status(400).json({ error: "Validation échouée. Veuillez réessayer." });
  }
  // 2. Timing: form submitted < 3 seconds after page load
  const formAge = _t ? Date.now() - Number(_t) : Infinity;
  const tooFast = formAge < 3000;
  // 3. Headless browser detection
  const headless = isHeadlessBrowser(ua);
  // 4. IP check: any banned account from this IP?
  const ipHash = hashIp(ip);
  let sameIpBanned = false;
  if (ipHash) {
    try {
      const [[ipRow]] = await pool.query(
        'SELECT COUNT(*) as cnt FROM users WHERE registration_ip_hash = ? AND is_banned = 1', [ipHash]
      );
      sameIpBanned = (ipRow?.cnt || 0) > 0;
    } catch { /* ignore */ }
  }

  const botScore = computeBotScore(req, { honeypotFilled: false, tooFast, sameIpBanned });

  if (headless || tooFast || sameIpBanned || botScore >= 60) {
    console.warn(`[signup/antibot] Blocked — score=${botScore} headless=${headless} tooFast=${tooFast} bannedIP=${sameIpBanned} ip=${ip}`);
    if (sameIpBanned) {
      return res.status(403).json({ error: "Inscription non autorisée depuis cette adresse réseau." });
    }
    return res.status(400).json({ error: "Validation échouée. Veuillez réessayer depuis un navigateur standard." });
  }

  // 5. IP uniqueness: max 3 accounts per IP (handles NAT/families)
  const MAX_ACCOUNTS_PER_IP = 3;
  if (ipHash) {
    try {
      const [[{ cnt }]] = await pool.query(
        'SELECT COUNT(*) as cnt FROM users WHERE registration_ip_hash = ?', [ipHash]
      );
      if (cnt >= MAX_ACCOUNTS_PER_IP) {
        console.warn(`[signup/antibot] IP limit reached (${cnt}) for hash ${ipHash.slice(0,8)}`);
        return res.status(429).json({ error: "Trop de comptes créés depuis cette adresse réseau. Contactez le support si vous pensez à une erreur." });
      }
    } catch { /* ignore — don't block signup on DB error */ }
  }

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

    // Resolve referrer from referral code (format: SCOUTY-XXXXXXXX)
    let referrerId = null;
    let referralBlockedSameIp = false;
    if (referralCode) {
      const codeUpper = String(referralCode).trim().toUpperCase();
      const prefix = codeUpper.startsWith('SCOUTY-') ? codeUpper.slice(7) : codeUpper;
      if (prefix.length === 8) {
        const [refRows] = await conn.query(
          "SELECT id, registration_ip_hash FROM users WHERE UPPER(SUBSTRING(id, 1, 8)) = ? LIMIT 1",
          [prefix]
        );
        if (refRows.length && refRows[0].id !== userId) {
          // Block referral if referrer and new user share the same IP
          if (ipHash && refRows[0].registration_ip_hash && ipHash === refRows[0].registration_ip_hash) {
            referralBlockedSameIp = true;
            console.warn(`[signup/referral] Same-IP referral blocked: referrer=${refRows[0].id} newUser=${userId} ip=${ip}`);
          } else {
            referrerId = refRows[0].id;
          }
        }
      }
    }

    await conn.query(
      `INSERT INTO users (id, email, password_hash, registration_ip, registration_ip_hash, bot_score, suspicious_referral, created_at, updated_at, last_sign_in_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW(), NOW())`,
      [userId, normalizedEmail, hash, ip, ipHash, botScore, referralBlockedSameIp ? 1 : 0],
    );

    await conn.query(
      `INSERT INTO profiles (id, user_id, full_name, club, role, country, referred_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [uuidv4(), userId, normalizedFullName, normalizedClub, normalizedRole, normalizedCountry || null, referrerId],
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

    // Log the IP for future multi-account detection (async, non-blocking)
    if (ipHash) {
      pool.query(
        `INSERT INTO signup_ip_log (ip_hash, account_count, first_seen, last_seen)
         VALUES (?, 1, NOW(), NOW())
         ON DUPLICATE KEY UPDATE account_count = account_count + 1, last_seen = NOW()`,
        [ipHash]
      ).catch(() => {});
    }

    // If same-IP referral was blocked, flag both the new account and the referrer
    if (referralBlockedSameIp) {
      try {
        // Flag the new account (already inserted with suspicious_referral=1 above)
        // Flag the referrer as well
        const [refRows2] = await pool.query(
          "SELECT id FROM users WHERE UPPER(SUBSTRING(id, 1, 8)) = ? LIMIT 1",
          [String(referralCode).trim().toUpperCase().replace(/^SCOUTY-/, '').slice(0, 8)]
        );
        if (refRows2.length) {
          await pool.query("UPDATE users SET suspicious_referral = 1 WHERE id = ?", [refRows2[0].id]);
        }
      } catch (e) {
        console.warn('[signup] suspicious_referral flag failed:', e.message);
      }
    }

    // Award 100 affiliate credits + notifications + tier check
    if (referrerId) {
      try {
        await ensureCreditTable();

        // 1. Insert into referrals table (idempotent)
        await pool.query(
          `INSERT IGNORE INTO referrals (id, referrer_id, referred_id, referral_code, created_at)
           VALUES (?, ?, ?, ?, NOW())`,
          [uuidv4(), referrerId, userId, referralCode ? String(referralCode).trim().toUpperCase() : '']
        );

        // 2. Award 100 credits
        await pool.query(
          "INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description) VALUES (?, ?, 'affiliate_reward', 'earn', 100, ?)",
          [uuidv4(), referrerId, `Parrainage de ${normalizedEmail}`]
        );

        // 3. Notification "nouveau filleul"
        await createNotification(referrerId, {
          type: 'affiliate_new',
          title: '🎉 Nouveau filleul !',
          message: `${normalizedEmail} vient de rejoindre Scouty grâce à votre code de parrainage.`,
          icon: 'users',
          link: '/affiliate',
        });

        // 4. Notification "crédits reçus"
        await createNotification(referrerId, {
          type: 'affiliate_credits',
          title: '+100 crédits de parrainage',
          message: `Vous avez reçu 100 crédits suite au parrainage de ${normalizedEmail}.`,
          icon: 'zap',
          link: '/affiliate',
        });

        // 5. Tier upgrade check
        const [[{ total }]] = await pool.query(
          "SELECT COUNT(*) as total FROM profiles WHERE referred_by = ?",
          [referrerId]
        );
        const tierCount = Number(total);
        const AFFILIATE_TIERS = [
          { threshold: 50, name: 'Elite',      emoji: '👑' },
          { threshold: 11, name: 'Partenaire', emoji: '🤝' },
          { threshold: 1,  name: 'Ambassadeur',emoji: '⭐' },
        ];
        for (const tier of AFFILIATE_TIERS) {
          if (tierCount === tier.threshold) {
            await createNotification(referrerId, {
              type: 'affiliate_tier',
              title: `${tier.emoji} Vous êtes maintenant ${tier.name} !`,
              message: `Félicitations ! Avec ${tierCount} parrainage${tierCount > 1 ? 's' : ''}, vous accédez au statut ${tier.name} et débloquez de nouveaux avantages.`,
              icon: 'award',
              link: '/affiliate',
            });
            break;
          }
        }
      } catch (e) {
        console.warn('[signup] affiliate reward failed:', e.message);
      }
    }

    const user = await getUserById(userId);
    const response = normalizeUserRow(user);
    return res.json({
      user: response,
      session: buildSession(user, res),
      ...(referralBlockedSameIp ? { referral_warning: "Le code de parrainage n'a pas été appliqué car il ne respecte pas nos politiques d'utilisation (même adresse réseau)." } : {}),
    });
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

// ── Google OAuth sign-in / sign-up ────────────────────────────────────────
app.post("/api/auth/google", rateLimitAuth, async (req, res) => {
  const { access_token } = req.body || {};
  if (!access_token) return res.status(400).json({ error: "Token Google manquant." });

  // Verify access token by calling Google's userinfo endpoint
  let tokenData;
  try {
    const r = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    tokenData = await r.json();
    if (!r.ok || tokenData.error_description) return res.status(401).json({ error: "Token Google invalide." });
  } catch {
    return res.status(502).json({ error: "Impossible de vérifier le token Google." });
  }

  const { email, sub: oauthSub, given_name, family_name, picture } = tokenData;
  if (!email) return res.status(400).json({ error: "Email manquant dans le token Google." });
  const normalizedEmail = String(email).toLowerCase().trim();

  // IP checks (same rules as email signup)
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || null;
  const ipHash = hashIp(ip);
  if (ipHash) {
    try {
      const [[banned]] = await pool.query(
        'SELECT COUNT(*) as cnt FROM users WHERE registration_ip_hash = ? AND is_banned = 1', [ipHash]
      );
      if ((banned?.cnt || 0) > 0) {
        return res.status(403).json({ error: "Inscription non autorisée depuis cette adresse réseau." });
      }
      const [[{ cnt }]] = await pool.query(
        'SELECT COUNT(*) as cnt FROM users WHERE registration_ip_hash = ?', [ipHash]
      );
      if (cnt >= 3) {
        return res.status(429).json({ error: "Trop de comptes créés depuis cette adresse réseau. Contactez le support si vous pensez à une erreur." });
      }
    } catch { /* ne pas bloquer sur erreur DB */ }
  }

  let conn;
  try {
    conn = await pool.getConnection();
    const [existing] = await conn.query("SELECT * FROM users WHERE email = ? LIMIT 1", [normalizedEmail]);

    let userId;
    let isNew = false;

    if (existing.length) {
      userId = existing[0].id;
      await conn.query(
        "UPDATE users SET oauth_provider = 'google', oauth_sub = ?, last_sign_in_at = NOW(), updated_at = NOW() WHERE id = ?",
        [oauthSub, userId]
      );
      // Update profile with Google name/photo if fields are empty
      await conn.query(
        `UPDATE profiles SET
          first_name = COALESCE(NULLIF(first_name, ''), ?),
          last_name  = COALESCE(NULLIF(last_name, ''), ?),
          photo_url  = COALESCE(NULLIF(photo_url, ''), ?)
         WHERE user_id = ?`,
        [given_name || null, family_name || null, picture || null, userId]
      );
    } else {
      isNew = true;
      userId = uuidv4();
      await conn.beginTransaction();

      await conn.query(
        "INSERT INTO users (id, email, oauth_provider, oauth_sub, registration_ip, registration_ip_hash, created_at, updated_at, last_sign_in_at) VALUES (?, ?, 'google', ?, ?, ?, NOW(), NOW(), NOW())",
        [userId, normalizedEmail, oauthSub, ip, ipHash]
      );

      const fullName = [given_name, family_name].filter(Boolean).join(" ").trim();
      await conn.query(
        `INSERT INTO profiles (id, user_id, full_name, first_name, last_name, photo_url, role, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'scout', NOW(), NOW())`,
        [uuidv4(), userId, fullName || normalizedEmail, given_name || null, family_name || null, picture || null]
      );
      await conn.query("INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, 'user', NOW())", [uuidv4(), userId]);
      await conn.query("INSERT INTO user_subscriptions (id, user_id, is_premium, premium_since, created_at, updated_at) VALUES (?, ?, 0, NULL, NOW(), NOW())", [uuidv4(), userId]);

      await conn.commit();
    }

    const user = await getUserById(userId);

    // Ban check — same as email/password login
    if (user.is_banned) {
      if (user.ban_expires_at && new Date(user.ban_expires_at) <= new Date()) {
        // Expired ban — auto-lift
        await pool.query('UPDATE users SET is_banned=0, ban_reason=NULL, banned_at=NULL, banned_by=NULL, ban_expires_at=NULL WHERE id=?', [userId]).catch(() => {});
        invalidateBanCache(userId);
      } else {
        return res.status(403).json({
          error: 'Compte suspendu.',
          banned: true,
          ban_reason: user.ban_reason || null,
          ban_expires_at: user.ban_expires_at || null,
        });
      }
    }

    return res.json({ user: normalizeUserRow(user), session: buildSession(user, res), isNew });
  } catch (err) {
    if (conn) { try { await conn.rollback(); } catch {} }
    console.error("[google-auth]", err?.message);
    return res.status(500).json({ error: "Erreur serveur lors de l'authentification Google." });
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

    // Ban check — auto-lift if expired
    if (user.is_banned) {
      if (user.ban_expires_at && new Date(user.ban_expires_at) <= new Date()) {
        await pool.query('UPDATE users SET is_banned=0, ban_reason=NULL, banned_at=NULL, banned_by=NULL, ban_expires_at=NULL WHERE id=?', [user.id]).catch(() => {});
        invalidateBanCache(user.id);
      } else {
        return res.status(403).json({
          error: 'Compte suspendu.',
          banned: true,
          ban_reason: user.ban_reason || null,
          ban_expires_at: user.ban_expires_at || null,
        });
      }
    }

    // If TOTP 2FA is enabled, don't return session yet — require TOTP code
    if (user.totp_enabled) {
      const challengeToken = jwt.sign({ sub: user.id, purpose: '2fa_challenge' }, jwtSecret, { expiresIn: '5m' });
      return res.json({ requires2FA: true, method: 'totp', challengeToken });
    }

    // If Email 2FA is enabled, send code by email
    if (user.email_2fa_enabled) {
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await pool.query(
        "UPDATE users SET email_2fa_code = ?, email_2fa_expires_at = ?, updated_at = NOW() WHERE id = ?",
        [code, expiresAt, user.id],
      );

      await sendEmail(user.email, `Scouty – Votre code de vérification : ${code}`, `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <img src="https://scouty.app/logo.png" alt="Scouty" width="40" style="border-radius:10px;margin-bottom:16px" />
          <h2 style="color:#1a1a2e;margin:0 0 8px">Code de vérification</h2>
          <p style="color:#555;margin:0 0 24px">Voici votre code de connexion :</p>
          <p style="text-align:center;margin:32px 0">
            <span style="background:#6366f1;color:#fff;padding:16px 32px;border-radius:12px;font-size:28px;font-weight:700;letter-spacing:8px;display:inline-block">${code}</span>
          </p>
          <p style="color:#888;font-size:13px">Ce code est valable <strong>10 minutes</strong>. Si vous n'avez pas tenté de vous connecter, ignorez cet email.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
          <p style="color:#aaa;font-size:11px;text-align:center">Scouty — Scouting footballistique professionnel</p>
        </div>
      `);

      const challengeToken = jwt.sign({ sub: user.id, purpose: '2fa_challenge' }, jwtSecret, { expiresIn: '10m' });
      return res.json({ requires2FA: true, method: 'email', challengeToken });
    }

    await pool.query("UPDATE users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = ?", [user.id]);
    const refreshed = await getUserById(user.id);

    return res.json({ session: buildSession(refreshed, res), user: normalizeUserRow(refreshed) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/auth/session", async (req, res) => {
  // Read token from httpOnly cookie first, fallback to Authorization header
  let token = req.cookies?.[AUTH_COOKIE] || null;
  if (!token) {
    const authHeader = req.headers.authorization || "";
    token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
  }

  if (!token) {
    return res.json({ session: null });
  }

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await getUserById(payload.sub);
    if (!user) return res.json({ session: null });
    return res.json({ session: buildSession(user, res) });
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
  clearAuthCookie(res);
  return res.json({ ok: true });
});

// ── Email sending — Brevo API (preferred) or SMTP fallback ────────────────

function getFromAddress() {
  const addr = process.env.SMTP_FROM || process.env.SMTP_USER;
  if (addr && addr.includes("<")) return addr;
  return addr ? `Scouty <${addr}>` : null;
}

// Brevo Transactional Email API (requires BREVO_API_KEY)
async function sendEmailViaBrevoApi(to, subject, html) {
  const apiKey = process.env.BREVO_API_KEY;
  const senderEmail = process.env.SMTP_FROM || "scouty.professional@gmail.com";
  const senderName = "Scouty";

  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: { name: senderName, email: senderEmail },
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brevo API ${res.status}: ${body}`);
  }
  const data = await res.json();
  console.log(`[email] Brevo API sent to ${to}: ${subject} (messageId: ${data.messageId})`);
  return true;
}

// ── SMTP fallback (nodemailer) ─────────────────
let _mailerInstance = null;
let _mailerVerified = false;

function createMailer() {
  if (_mailerInstance) return _mailerInstance;
  if (!nodemailer) { console.warn("[email] nodemailer not available"); return null; }
  if (!process.env.SMTP_HOST) { console.warn("[email] SMTP_HOST not set"); return null; }
  if (!process.env.SMTP_USER) { console.warn("[email] SMTP_USER not set"); return null; }
  if (!process.env.SMTP_PASS) { console.warn("[email] SMTP_PASS not set"); return null; }

  _mailerInstance = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    pool: true,
    maxConnections: 3,
    maxMessages: 100,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });

  _mailerInstance.verify().then(() => {
    _mailerVerified = true;
    console.log("[email] SMTP connected to", process.env.SMTP_HOST);
  }).catch(err => {
    console.error("[email] SMTP verify failed:", err?.message, "— will retry on first send");
  });

  return _mailerInstance;
}

// Initialize SMTP mailer eagerly (only if no Brevo API key)
if (!process.env.BREVO_API_KEY) createMailer();

async function sendEmailViaSMTP(to, subject, html) {
  let mailer = createMailer();
  if (!mailer) return false;

  const from = getFromAddress();
  if (!from) { console.warn(`[email] No SMTP_FROM set — skipping email to ${to}`); return false; }

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const info = await mailer.sendMail({ from, to, subject, html });
      console.log(`[email] SMTP sent to ${to}: ${subject} (messageId: ${info.messageId})`);
      _mailerVerified = true;
      return true;
    } catch (err) {
      console.error(`[email] SMTP attempt ${attempt} failed to ${to}:`, err?.message);
      if (attempt === 1) {
        try { mailer.close(); } catch (_) {}
        _mailerInstance = null;
        _mailerVerified = false;
        mailer = createMailer();
        if (!mailer) return false;
      }
    }
  }
  return false;
}

async function sendEmail(to, subject, html) {
  if (process.env.BREVO_API_KEY) {
    try {
      return await sendEmailViaBrevoApi(to, subject, html);
    } catch (err) {
      console.error("[email] Brevo API failed, falling back to SMTP:", err?.message);
    }
  }
  return sendEmailViaSMTP(to, subject, html);
}

// ── POST /api/admin/test-email ─────────────────────────────────────────────
app.post("/api/admin/test-email", authMiddleware, ensureAdmin, async (req, res) => {
  const { to } = req.body || {};
  const recipient = to || req.user.email;
  if (!recipient) return res.status(400).json({ error: "No recipient" });

  const method = process.env.BREVO_API_KEY ? "Brevo API" : `SMTP (${process.env.SMTP_HOST || "N/A"})`;
  console.log(`[test-email] method=${method} recipient=${recipient} BREVO_KEY_SET=${!!process.env.BREVO_API_KEY}`);
  try {
    const sent = await sendEmail(recipient, "Scouty – Test email", `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <img src="https://scouty.app/logo.png" alt="Scouty" width="40" style="border-radius:10px;margin-bottom:16px" />
        <h2 style="color:#1a1a2e;margin:0 0 8px">Test email</h2>
        <p style="color:#555">Si vous recevez cet email, la configuration email fonctionne correctement.</p>
        <p style="color:#888;font-size:13px;margin-top:24px">Envoyé le ${new Date().toLocaleString("fr-FR")} via ${method}</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
        <p style="color:#aaa;font-size:11px;text-align:center">Scouty — Scouting footballistique professionnel</p>
      </div>
    `);
    console.log(`[test-email] sent=${sent}`);
    if (sent) return res.json({ ok: true, message: `Email envoyé à ${recipient} via ${method}` });
    return res.status(500).json({ error: "Échec de l'envoi. Vérifiez la clé API Brevo ou la configuration SMTP dans les logs serveur." });
  } catch (err) {
    console.error("[test-email] exception:", err?.message, err?.stack);
    return res.status(500).json({ error: `Erreur: ${err?.message}` });
  }
});

// ── POST /api/admin/fix-player-leagues ─────────────────────────────────────
// Backfills players.league from the static club→league mapping (alias-aware).
// Use when the startup migration hasn't run yet or to clean up bad imports.
app.post("/api/admin/fix-player-leagues", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const result = await fixPlayerLeaguesByClub(pool);
    console.log(`[admin/fix-player-leagues] players=${result.playersFixed} directory=${result.directoryFixed} scanned=${result.clubsScanned}`);
    return res.json(result);
  } catch (err) {
    console.error("[admin/fix-player-leagues] exception:", err?.message, err?.stack);
    return res.status(500).json({ error: err?.message || "Échec de la correction." });
  }
});

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

    await sendEmail(user.email, "Scouty – Réinitialisation de votre mot de passe", `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <img src="https://scouty.app/logo.png" alt="Scouty" width="40" style="border-radius:10px;margin-bottom:16px" />
        <h2 style="color:#1a1a2e;margin:0 0 8px">Réinitialisation de mot de passe</h2>
        <p style="color:#555">Cliquez sur le bouton ci-dessous pour choisir un nouveau mot de passe. Ce lien est valable <strong>1 heure</strong>.</p>
        <p style="text-align:center;margin:32px 0">
          <a href="${resetLink}" style="background:#6366f1;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;font-size:15px">
            Réinitialiser mon mot de passe
          </a>
        </p>
        <p style="color:#888;font-size:13px">Si vous n'avez pas fait cette demande, ignorez simplement cet email.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
        <p style="color:#aaa;font-size:11px;text-align:center">Scouty — Scouting footballistique professionnel</p>
      </div>
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error("forgot-password error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Helper: save uploaded file into uploaded_images table ─────────────────
async function saveImageToDb(filePath, imageId, mimeType) {
  const data = fs.readFileSync(filePath);
  try { fs.unlinkSync(filePath); } catch {}
  // Max 5 MB check
  if (data.length > 5 * 1024 * 1024) throw new Error("Image trop volumineuse (max 5 MB).");
  await pool.query(
    `INSERT INTO uploaded_images (id, data, mime_type) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE data = VALUES(data), mime_type = VALUES(mime_type), created_at = NOW()`,
    [imageId, data, mimeType || "image/jpeg"]
  );
  return `/api/images/${imageId}`;
}

async function deleteImageFromDb(url) {
  if (!url || !url.startsWith("/api/images/")) return;
  const id = url.replace("/api/images/", "");
  try { await pool.query("DELETE FROM uploaded_images WHERE id = ?", [id]); } catch {}
}

async function migrateLegacyProfilePhotosToDb() {
  try {
    const [rows] = await pool.query(
      "SELECT user_id, photo_url FROM profiles WHERE photo_url IS NOT NULL AND photo_url LIKE '/uploads/%'"
    );
    for (const row of rows) {
      const relativePath = String(row.photo_url || "");
      const fileName = relativePath.replace(/^\/uploads\//, "");
      const filePath = path.join(UPLOAD_DIR, fileName);
      if (!fs.existsSync(filePath)) continue;

      const ext = path.extname(fileName).toLowerCase();
      const mimeType =
        ext === ".png" ? "image/png" :
        ext === ".webp" ? "image/webp" :
        ext === ".gif" ? "image/gif" :
        "image/jpeg";

      const imageId = `profile_${row.user_id}`;
      const photoUrl = await saveImageToDb(filePath, imageId, mimeType);
      await pool.query(
        "UPDATE profiles SET photo_url = ?, updated_at = NOW() WHERE user_id = ?",
        [photoUrl, row.user_id]
      );
    }
  } catch (err) {
    console.warn("[warn] legacy profile photo migration:", err?.message);
  }
}

// ── Upload profile photo ──────────────────────────────────────────────────
app.post("/api/account/upload-photo", authMiddleware, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file" });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const allowed = [".jpg", ".jpeg", ".png", ".webp", ".gif"];
    if (!allowed.includes(ext)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: "Format non supporté. Utilisez JPG, PNG, WEBP ou GIF." });
    }
    if (req.file.size > 4 * 1024 * 1024) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(413).json({ error: "photo_too_large", message: "La photo ne doit pas dépasser 4 Mo." });
    }
    // Delete old photo (best-effort) before replacing
    const [prevRows] = await pool.query("SELECT photo_url FROM profiles WHERE user_id = ? LIMIT 1", [req.user.id]);
    const oldUrl = prevRows[0]?.photo_url;
    await deleteImageFromDb(oldUrl);
    await deleteStoredFile(oldUrl);

    const imageId = `profile_${req.user.id}`;
    const photoUrl = await saveImageToDb(req.file.path, imageId, req.file.mimetype);
    await pool.query("UPDATE profiles SET photo_url = ?, updated_at = NOW() WHERE user_id = ?", [photoUrl, req.user.id]);
    return res.json({ photo_url: photoUrl });
  } catch (err) {
    console.error("upload-photo error:", err);
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    return res.status(500).json({ error: err.message || "Erreur serveur" });
  }
});

// ── Generic image upload (player photos, coach photos) ───────────────────────
app.post("/api/upload-image", authMiddleware, upload.single("photo"), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Aucun fichier reçu." });
  try {
    const ext = path.extname(req.file.originalname).toLowerCase() || ".jpg";
    const allowed = [".jpg", ".jpeg", ".png", ".webp"];
    if (!allowed.includes(ext)) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(400).json({ error: "Format non supporté. Utilisez JPG, PNG ou WebP." });
    }
    if (req.file.size > 4 * 1024 * 1024) {
      try { fs.unlinkSync(req.file.path); } catch {}
      return res.status(413).json({ error: "La photo ne doit pas dépasser 4 Mo." });
    }
    const imageId = require('crypto').randomUUID();
    const photoUrl = await saveImageToDb(req.file.path, imageId, req.file.mimetype);
    return res.json({ photo_url: photoUrl });
  } catch (err) {
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    return res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});

// ── RGPD: Export all user data ────────────────────────────────────────────
app.post("/api/account/export-data", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  try {
    const [profile] = await pool.query("SELECT * FROM profiles WHERE user_id = ?", [userId]);
    const [userRow] = await pool.query("SELECT id, email, created_at, updated_at, last_sign_in_at FROM users WHERE id = ?", [userId]);
    const [subscription] = await pool.query("SELECT * FROM user_subscriptions WHERE user_id = ?", [userId]);
    const [players] = await pool.query("SELECT * FROM players WHERE user_id = ?", [userId]);
    const playerIds = players.map(p => p.id);

    let reports = [];
    let customFields = [];
    let customFieldValues = [];
    let watchlists = [];
    let watchlistPlayers = [];
    let shadowTeams = [];
    let shadowTeamPlayers = [];
    let contacts = [];
    let followedLeagues = [];
    let fixtures = [];
    let matchAssignments = [];

    if (playerIds.length > 0) {
      [reports] = await pool.query("SELECT * FROM reports WHERE player_id IN (?) AND user_id = ?", [playerIds, userId]);
      [customFieldValues] = await pool.query("SELECT * FROM custom_field_values WHERE user_id = ?", [userId]);
    } else {
      [reports] = await pool.query("SELECT * FROM reports WHERE user_id = ?", [userId]);
      [customFieldValues] = await pool.query("SELECT * FROM custom_field_values WHERE user_id = ?", [userId]);
    }

    [customFields] = await pool.query("SELECT * FROM custom_fields WHERE user_id = ?", [userId]);
    [watchlists] = await pool.query("SELECT * FROM watchlists WHERE user_id = ?", [userId]);

    const watchlistIds = watchlists.map(w => w.id);
    if (watchlistIds.length > 0) {
      [watchlistPlayers] = await pool.query("SELECT * FROM watchlist_players WHERE watchlist_id IN (?)", [watchlistIds]);
    }

    [shadowTeams] = await pool.query("SELECT * FROM shadow_teams WHERE user_id = ?", [userId]);
    const shadowTeamIds = shadowTeams.map(s => s.id);
    if (shadowTeamIds.length > 0) {
      [shadowTeamPlayers] = await pool.query("SELECT * FROM shadow_team_players WHERE shadow_team_id IN (?)", [shadowTeamIds]);
    }

    [contacts] = await pool.query("SELECT * FROM contacts WHERE user_id = ?", [userId]);

    try { [followedLeagues] = await pool.query("SELECT * FROM user_followed_leagues WHERE user_id = ?", [userId]); } catch {}
    try { [fixtures] = await pool.query("SELECT * FROM fixtures WHERE user_id = ?", [userId]); } catch {}
    try { [matchAssignments] = await pool.query("SELECT * FROM match_assignments WHERE user_id = ?", [userId]); } catch {}

    const exportData = {
      export_date: new Date().toISOString(),
      user: userRow[0] || null,
      profile: profile[0] || null,
      subscription: subscription[0] || null,
      players,
      reports,
      custom_fields: customFields,
      custom_field_values: customFieldValues,
      watchlists,
      watchlist_players: watchlistPlayers,
      shadow_teams: shadowTeams,
      shadow_team_players: shadowTeamPlayers,
      contacts,
      followed_leagues: followedLeagues,
      fixtures,
      match_assignments: matchAssignments,
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename="scouty-export-${userId}-${new Date().toISOString().slice(0, 10)}.json"`);
    return res.json(exportData);
  } catch (err) {
    console.error("[export-data] Error:", err);
    return res.status(500).json({ error: "Erreur lors de l'export des données." });
  }
});

// ── RGPD: Delete account and all user data ───────────────────────────────
app.post("/api/account/delete", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { confirmation } = req.body || {};

  if (confirmation !== "DELETE") {
    return res.status(400).json({ error: "Confirmation requise. Envoyez { confirmation: 'DELETE' }." });
  }

  try {
    // Cancel Stripe subscription if exists
    if (stripe) {
      const [subRows] = await pool.query("SELECT stripe_customer_id, stripe_subscription_id FROM user_subscriptions WHERE user_id = ?", [userId]);
      const sub = subRows[0];
      if (sub?.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id);
          console.log(`[delete-account] Cancelled Stripe subscription ${sub.stripe_subscription_id}`);
        } catch (e) {
          console.warn("[delete-account] Could not cancel Stripe subscription:", e?.message);
        }
      }
      if (sub?.stripe_customer_id) {
        try {
          await stripe.customers.del(sub.stripe_customer_id);
          console.log(`[delete-account] Deleted Stripe customer ${sub.stripe_customer_id}`);
        } catch (e) {
          console.warn("[delete-account] Could not delete Stripe customer:", e?.message);
        }
      }
    }

    // Delete user — CASCADE will remove profiles, players, reports, watchlists, etc.
    await pool.query("DELETE FROM users WHERE id = ?", [userId]);

    console.log(`[delete-account] User ${userId} (${req.user.email}) account deleted`);
    return res.json({ ok: true, message: "Compte et données supprimés définitivement." });
  } catch (err) {
    console.error("[delete-account] Error:", err);
    return res.status(500).json({ error: "Erreur lors de la suppression du compte." });
  }
});

// ── Public profile (for @mentions) ────────────────────────────────────────
app.get("/api/profile/:name", async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name).trim();
    const [rows] = await pool.query(
      `SELECT p.user_id, p.full_name, p.club, p.role, p.created_at,
              p.social_public, p.social_x, p.social_instagram, p.social_linkedin,
              p.social_facebook, p.social_snapchat, p.social_tiktok, p.social_telegram, p.social_whatsapp
       FROM profiles p WHERE LOWER(p.full_name) = LOWER(?) LIMIT 1`,
      [name]
    );
    if (!rows.length) return res.status(404).json({ error: "Profil introuvable." });
    const profile = rows[0];
    // Only return social links if the user made them public
    return res.json({
      user_id: profile.user_id,
      full_name: profile.full_name,
      club: profile.club,
      role: profile.role,
      created_at: profile.created_at,
      social_public: !!profile.social_public,
      social_x: profile.social_public ? profile.social_x : null,
      social_instagram: profile.social_public ? profile.social_instagram : null,
      social_linkedin: profile.social_public ? profile.social_linkedin : null,
      social_facebook: profile.social_public ? profile.social_facebook : null,
      social_snapchat: profile.social_public ? profile.social_snapchat : null,
      social_tiktok: profile.social_public ? profile.social_tiktok : null,
      social_telegram: profile.social_public ? profile.social_telegram : null,
      social_whatsapp: profile.social_public ? profile.social_whatsapp : null,
    });
  } catch (err) {
    console.error("[public-profile] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Public profile by user_id ─────────────────────────────────────────────
app.get("/api/profile/user/:userId", async (req, res) => {
  try {
    const userId = req.params.userId;
    const [rows] = await pool.query(
      `SELECT p.user_id, p.full_name, p.first_name, p.last_name, p.civility,
              p.club, p.role, p.photo_url, p.company, p.reference_club, p.created_at,
              p.social_public, p.social_x, p.social_instagram, p.social_linkedin,
              p.social_facebook, p.social_snapchat, p.social_tiktok, p.social_telegram, p.social_whatsapp
       FROM profiles p WHERE p.user_id = ? LIMIT 1`,
      [userId]
    );
    if (!rows.length) return res.status(404).json({ error: "Profil introuvable." });
    const profile = rows[0];
    return res.json({
      user_id: profile.user_id,
      full_name: profile.full_name,
      first_name: profile.first_name,
      last_name: profile.last_name,
      civility: profile.civility,
      club: profile.club,
      role: profile.role,
      photo_url: profile.photo_url,
      company: profile.company,
      reference_club: profile.reference_club,
      created_at: profile.created_at,
      social_public: !!profile.social_public,
      social_x: profile.social_public ? profile.social_x : null,
      social_instagram: profile.social_public ? profile.social_instagram : null,
      social_linkedin: profile.social_public ? profile.social_linkedin : null,
      social_facebook: profile.social_public ? profile.social_facebook : null,
      social_snapchat: profile.social_public ? profile.social_snapchat : null,
      social_tiktok: profile.social_public ? profile.social_tiktok : null,
      social_telegram: profile.social_public ? profile.social_telegram : null,
      social_whatsapp: profile.social_public ? profile.social_whatsapp : null,
    });
  } catch (err) {
    console.error("[public-profile-by-id] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Public stats (dynamic key figures for About page) ─────────────────────
app.get("/api/public/stats", async (_req, res) => {
  try {
    const [[{ total_users }]] = await pool.query("SELECT COUNT(*) as total_users FROM users");
    const [[{ total_players }]] = await pool.query("SELECT COUNT(*) as total_players FROM players");
    const [[{ total_reports }]] = await pool.query("SELECT COUNT(*) as total_reports FROM reports");
    const [[{ total_orgs }]] = await pool.query("SELECT COUNT(*) as total_orgs FROM organizations");
    const [[{ total_clubs }]] = await pool.query("SELECT COUNT(DISTINCT LOWER(TRIM(club))) as total_clubs FROM players WHERE club != ''");
    return res.json({ total_users, total_players, total_reports, total_orgs, total_clubs });
  } catch {
    return res.json({ total_users: 0, total_players: 0, total_reports: 0, total_orgs: 0, total_clubs: 0 });
  }
});

// ── Public user directory (for About page community showcase) ─────────────
app.get("/api/public/users", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT p.user_id, p.full_name, p.first_name, p.last_name, p.civility,
             p.club, p.role, p.photo_url, p.company, p.reference_club,
             p.social_public, p.created_at
      FROM profiles p
      INNER JOIN users u ON u.id = p.user_id
      WHERE p.full_name IS NOT NULL AND p.full_name != ''
      ORDER BY p.created_at ASC
      LIMIT 50
    `);
    const users = rows.map(r => ({
      user_id: r.user_id,
      full_name: r.full_name,
      first_name: r.first_name,
      last_name: r.last_name,
      civility: r.civility,
      club: r.club,
      role: r.role,
      photo_url: r.photo_url,
      company: r.company,
      reference_club: r.reference_club,
      social_public: !!r.social_public,
      created_at: r.created_at,
    }));
    return res.json(users);
  } catch (err) {
    console.error("[public/users] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Public contact form ───────────────────────────────────────────────────
// Simple in-memory rate limiter: max 3 submissions per IP per 10 min
const _contactRateMap = new Map();
app.post("/api/public/contact", async (req, res) => {
  const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
  const now = Date.now();
  const WINDOW = 10 * 60 * 1000; // 10 min
  const MAX = 3;
  const history = (_contactRateMap.get(ip) || []).filter(t => now - t < WINDOW);
  if (history.length >= MAX) return res.status(429).json({ error: "Trop de soumissions. Réessayez dans 10 minutes." });
  _contactRateMap.set(ip, [...history, now]);

  const { name, email, company, role, need, phone, context, honeypot } = req.body || {};
  if (honeypot) return res.status(200).json({ ok: true }); // silent bot trap
  if (!name?.trim() || !email?.trim() || !context?.trim()) {
    return res.status(400).json({ error: "Champs requis manquants (nom, email, message)." });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: "Adresse email invalide." });
  }

  const dest = "scouty.professional@gmail.com";
  const subject = `[Contact Scouty] ${need || "Demande"} — ${name}`;
  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px">
      <h2 style="color:#111;margin-bottom:4px">Nouveau message via le formulaire de contact</h2>
      <p style="color:#888;font-size:13px;margin-bottom:24px">Reçu le ${new Date().toLocaleString("fr-FR", { timeZone: "Europe/Paris" })}</p>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
        ${[
          ["Nom", name],
          ["Email", email],
          ["Entreprise / Club", company || "—"],
          ["Poste / Rôle", role || "—"],
          ["Besoin", need || "—"],
          ["Téléphone", phone || "—"],
        ].map(([label, val]) => `
          <tr>
            <td style="padding:10px 16px;background:#f3f4f6;font-weight:600;font-size:13px;color:#374151;width:180px;border-bottom:1px solid #e5e7eb">${label}</td>
            <td style="padding:10px 16px;font-size:13px;color:#111;border-bottom:1px solid #e5e7eb">${val}</td>
          </tr>`).join("")}
        <tr>
          <td style="padding:10px 16px;background:#f3f4f6;font-weight:600;font-size:13px;color:#374151;vertical-align:top">Message</td>
          <td style="padding:10px 16px;font-size:13px;color:#111;white-space:pre-wrap">${context.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</td>
        </tr>
      </table>
      <p style="margin-top:20px;font-size:12px;color:#aaa">Répondez directement à cet email pour contacter ${name} à ${email}.</p>
    </div>`;

  try {
    await sendEmail(dest, subject, html);
  } catch (err) {
    console.error("[contact] Email failed:", err?.message);
    return res.status(500).json({ error: "L'envoi a échoué. Veuillez réessayer." });
  }

  // Confirmation email to sender
  try {
    await sendEmail(email, "Scouty – Nous avons bien reçu votre message", `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
        <img src="https://scouty.app/logo.png" alt="Scouty" width="40" style="border-radius:10px;margin-bottom:16px" />
        <h2 style="color:#111">Merci ${name} !</h2>
        <p style="color:#555;font-size:14px">Nous avons bien reçu votre message et nous vous répondrons dans les meilleurs délais.</p>
        <p style="color:#888;font-size:12px;margin-top:24px">L'équipe Scouty · <a href="https://scouty.app/about" style="color:#6366f1">scouty.app</a></p>
      </div>`);
  } catch (_) { /* confirmation failure is non-blocking */ }

  return res.json({ ok: true });
});

// ── Community notifications (generic + mention) ──────────────────────────
app.post("/api/community/notify", authMiddleware, async (req, res) => {
  try {
    const { target_user_id, type, title, message, link } = req.body;
    if (!target_user_id || target_user_id === req.user.id) return res.json({ ok: true });
    await createNotification(target_user_id, { type, title, message, icon: type, link: link || "/community" });
    return res.json({ ok: true });
  } catch (err) {
    console.error("[community/notify] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

app.post("/api/community/notify-mention", authMiddleware, async (req, res) => {
  try {
    const { mentioned_user_ids, author_name, context_type } = req.body;
    if (!Array.isArray(mentioned_user_ids) || !mentioned_user_ids.length) return res.json({ ok: true });
    const targets = mentioned_user_ids.filter(id => id !== req.user.id);
    for (const uid of targets) {
      await createNotification(uid, {
        type: "mention",
        title: "Vous avez été mentionné",
        message: `${author_name} vous a mentionné dans ${context_type === "reply" ? "une réponse" : "un post"}`,
        icon: "mention",
        link: "/community",
      });
    }
    return res.json({ ok: true });
  } catch (err) {
    console.error("[notify-mention] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Community: close/reopen question (admin/moderator) ───────────────────────

// POST /api/community/posts/:id/close — clôturer une question avec réponse acceptée
app.post("/api/community/posts/:id/close", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  const { id } = req.params;
  const { acceptedReplyId } = req.body || {}; // optionnel

  try {
    // Vérifier que le post existe et est une question
    const [rows] = await pool.query(
      "SELECT id, category FROM community_posts WHERE id = ?",
      [id]
    );
    if (!rows.length) return res.status(404).json({ error: "Post introuvable" });
    if (rows[0].category !== 'question') return res.status(400).json({ error: "Seules les questions peuvent être clôturées" });

    // Vérifier que la réponse acceptée existe si fournie
    if (acceptedReplyId) {
      const [replyRows] = await pool.query(
        "SELECT id FROM community_replies WHERE id = ? AND post_id = ?",
        [acceptedReplyId, id]
      );
      if (!replyRows.length) return res.status(400).json({ error: "Réponse introuvable" });
    }

    await pool.query(
      `UPDATE community_posts SET is_closed = 1, accepted_reply_id = ?, closed_by = ?, closed_at = NOW() WHERE id = ?`,
      [acceptedReplyId || null, req.user.id, id]
    );

    // Notifier l'auteur du post
    try {
      const [postAuthor] = await pool.query("SELECT user_id FROM community_posts WHERE id = ?", [id]);
      if (postAuthor.length && postAuthor[0].user_id !== req.user.id) {
        await createNotification(postAuthor[0].user_id, {
          type: 'community', icon: 'community',
          title: 'Votre question a été clôturée',
          message: 'Un modérateur a clôturé votre question avec une réponse acceptée.',
          link: '/community',
        });
      }
    } catch { /* non-critique */ }

    return res.json({ ok: true });
  } catch (err) {
    console.error("[community/close] Error:", err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// POST /api/community/posts/:id/reopen — réouvrir une question clôturée
app.post("/api/community/posts/:id/reopen", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  const { id } = req.params;
  try {
    await pool.query(
      "UPDATE community_posts SET is_closed = 0, accepted_reply_id = NULL, closed_by = NULL, closed_at = NULL WHERE id = ?",
      [id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Player Research CRUD ──────────────────────────────────────────────────
app.get("/api/player-research/:playerId", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM player_research WHERE user_id = ? AND player_id = ? ORDER BY created_at DESC",
      [req.user.id, req.params.playerId]
    );
    return res.json(rows);
  } catch (err) {
    console.error("[player-research] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/player-research", authMiddleware, async (req, res) => {
  const { player_id, type, title, url, content } = req.body || {};
  if (!player_id || !title) return res.status(400).json({ error: "player_id et title requis." });
  try {
    const id = uuidv4();
    await pool.query(
      "INSERT INTO player_research (id, user_id, player_id, type, title, url, content) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, req.user.id, player_id, type || 'note', title.trim(), url || null, content || null]
    );
    const [rows] = await pool.query("SELECT * FROM player_research WHERE id = ?", [id]);
    return res.json(rows[0]);
  } catch (err) {
    console.error("[player-research] POST error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/player-research/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM player_research WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[player-research] DELETE error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Player Wyscout stats ──────────────────────────────────────────────────
app.get("/api/player-wyscout-stats/:playerId", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM player_wyscout_stats
       WHERE player_id = ? AND (
         user_id = ?
         OR EXISTS (SELECT 1 FROM player_viewer_links WHERE player_id = ? AND viewer_user_id = ?)
       )
       ORDER BY year_end DESC, year_start DESC, season DESC`,
      [req.params.playerId, req.user.id, req.params.playerId, req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error("[player-wyscout-stats] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── All players Wyscout summaries (latest season per player) ──────────────
app.get("/api/players-wyscout-summary", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT * FROM player_wyscout_stats
       WHERE user_id = ?
          OR EXISTS (SELECT 1 FROM player_viewer_links pvl WHERE pvl.player_id = player_wyscout_stats.player_id AND pvl.viewer_user_id = ?)
       ORDER BY player_id, year_end DESC, year_start DESC, season DESC`,
      [req.user.id, req.user.id]
    );
    const seen = new Set();
    const latest = [];
    for (const row of rows) {
      if (seen.has(row.player_id)) continue;
      seen.add(row.player_id);
      latest.push(row);
    }
    return res.json(latest);
  } catch (err) {
    console.error("[players-wyscout-summary] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Player Videos CRUD ───────────────────────────────────────────────────
app.get("/api/player-videos/:playerId", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM player_videos WHERE user_id = ? AND player_id = ? ORDER BY created_at DESC",
      [req.user.id, req.params.playerId]
    );
    return res.json(rows);
  } catch (err) {
    console.error("[player-videos] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/player-videos", authMiddleware, async (req, res) => {
  const { player_id, title, url, file_url, description } = req.body || {};
  if (!player_id || !title) return res.status(400).json({ error: "player_id et title requis." });
  try {
    const id = uuidv4();
    await pool.query(
      "INSERT INTO player_videos (id, user_id, player_id, title, url, file_url, description) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [id, req.user.id, player_id, title.trim(), url || null, file_url || null, description || null]
    );
    const [rows] = await pool.query("SELECT * FROM player_videos WHERE id = ?", [id]);
    return res.json(rows[0]);
  } catch (err) {
    console.error("[player-videos] POST error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/player-videos/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM player_videos WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[player-videos] DELETE error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Followed Clubs CRUD ───────────────────────────────────────────────────
app.get("/api/followed-clubs", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM followed_clubs WHERE user_id = ? ORDER BY created_at DESC",
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error("[followed-clubs] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/followed-clubs", authMiddleware, async (req, res) => {
  const { club_name, notes } = req.body || {};
  if (!club_name?.trim()) return res.status(400).json({ error: "Nom du club requis." });
  const trimmed = club_name.trim();
  try {
    // Check if already followed — return existing id if so
    const [existing] = await pool.query(
      "SELECT id FROM followed_clubs WHERE user_id = ? AND club_name = ?",
      [req.user.id, trimmed]
    );
    if (existing.length > 0) {
      if (notes !== undefined) {
        await pool.query("UPDATE followed_clubs SET notes = ? WHERE id = ?", [notes || null, existing[0].id]);
      }
      return res.json({ ok: true, id: existing[0].id, already_followed: true });
    }
    const id = uuidv4();
    await pool.query(
      "INSERT INTO followed_clubs (id, user_id, club_name, notes) VALUES (?, ?, ?, ?)",
      [id, req.user.id, trimmed, notes || null]
    );
    return res.json({ ok: true, id });
  } catch (err) {
    console.error("[followed-clubs] POST error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/followed-clubs/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM followed_clubs WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[followed-clubs] DELETE error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Notifications CRUD ────────────────────────────────────────────────────
app.get("/api/notifications", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    console.error("[notifications] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.patch("/api/notifications/:id/read", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[notifications] PATCH read error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/notifications/read-all", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0",
      [req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[notifications] read-all error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/notifications/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM notifications WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[notifications] DELETE error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── POST /api/report-issue ────────────────────────────────────────────────
app.post("/api/report-issue", authMiddleware, async (req, res) => {
  const { category, subject, message, url, userAgent } = req.body || {};
  if (!subject || !message) return res.status(400).json({ error: "Sujet et message requis." });

  const userEmail = req.user?.email || "inconnu";
  const userName = req.user?.name || req.user?.email || "inconnu";
  const userId = req.user?.id || "inconnu";
  const categoryLabels = { bug: "Bug", feature: "Demande de fonctionnalité", other: "Autre" };
  const catLabel = categoryLabels[category] || category || "Autre";

  // Persist ticket in DB
  const ticketId = uuidv4();
  try {
    await pool.query(
      `INSERT INTO tickets (id, user_id, category, subject, message, page_url, user_agent) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [ticketId, userId, category || "bug", subject, message, url || null, userAgent || null]
    );
  } catch (dbErr) {
    console.error("[report-issue] DB insert error:", dbErr.message);
  }

  // Also send email (best-effort)
  const recipient = process.env.REPORT_ISSUE_TO || process.env.SMTP_FROM || process.env.SMTP_USER;
  try {
    if (recipient) {
      await sendEmail(recipient, `[Scouty - ${catLabel}] ${subject}`, `
        <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
          <div style="background:#6366f1;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0"><h2 style="margin:0;font-size:18px">Nouveau ticket – ${catLabel}</h2></div>
          <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
            <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px">
              <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-weight:600">Utilisateur</td><td>${userName} (${userEmail})</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-weight:600">Catégorie</td><td>${catLabel}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-weight:600">Sujet</td><td style="font-weight:600">${subject}</td></tr>
              ${url ? `<tr><td style="padding:6px 12px 6px 0;color:#6b7280;font-weight:600">Page</td><td><a href="${url}" style="color:#6366f1">${url}</a></td></tr>` : ""}
            </table>
            <div style="background:#f9fafb;border-radius:6px;padding:16px;font-size:14px;line-height:1.6;white-space:pre-wrap">${message}</div>
          </div>
        </div>
      `);
    }
  } catch { /* email is best-effort */ }

  console.log(`[report-issue] Ticket ${ticketId} created by ${userEmail}: [${catLabel}] ${subject}`);
  return res.json({ ok: true, ticketId });
});

// ── Admin ticket management ────────────────────────────────────────────────

app.get("/api/admin/tickets", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    let tickets;
    try {
      [tickets] = await pool.query(`
        SELECT t.*, u.email AS user_email, p.full_name AS user_name,
          CASE WHEN t.status = 'closed' THEN 0 ELSE
            (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_admin = 0
              AND tm.created_at > COALESCE(t.admin_read_at, '1970-01-01')
            )
          END AS unread_count
        FROM tickets t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        ORDER BY t.updated_at DESC
      `);
    } catch {
      // Fallback if admin_read_at column doesn't exist yet (migration pending)
      [tickets] = await pool.query(`
        SELECT t.*, u.email AS user_email, p.full_name AS user_name, 0 AS unread_count
        FROM tickets t
        LEFT JOIN users u ON u.id = t.user_id
        LEFT JOIN profiles p ON p.user_id = t.user_id
        ORDER BY t.updated_at DESC
      `);
    }
    return res.json(tickets);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/tickets/unread-count", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT COUNT(DISTINCT t.id) AS count FROM tickets t
      WHERE t.status != 'closed'
        AND (t.admin_read_at IS NULL
          OR EXISTS (SELECT 1 FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_admin = 0
            AND tm.created_at > t.admin_read_at))
    `);
    return res.json({ count: rows[0]?.count || 0 });
  } catch { return res.json({ count: 0 }); }
});

app.get("/api/admin/tickets/:id", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [tickets] = await pool.query(`
      SELECT t.*, u.email AS user_email, p.full_name AS user_name
      FROM tickets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN profiles p ON p.user_id = t.user_id
      WHERE t.id = ?
    `, [req.params.id]);
    if (!tickets.length) return res.status(404).json({ error: "Ticket not found" });
    const [messages] = await pool.query(`
      SELECT tm.*, p.full_name AS sender_name FROM ticket_messages tm
      LEFT JOIN profiles p ON p.user_id = tm.sender_id
      WHERE tm.ticket_id = ? ORDER BY tm.created_at ASC
    `, [req.params.id]);
    // Mark as read for admin — clears the unread badge
    pool.query("UPDATE tickets SET admin_read_at = NOW() WHERE id = ?", [req.params.id]).catch(() => {});
    return res.json({ ticket: tickets[0], messages });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/tickets/:id/reply", authMiddleware, ensureAdmin, async (req, res) => {
  const { body: msgBody } = req.body || {};
  if (!msgBody) return res.status(400).json({ error: "Message requis." });
  try {
    const [tickets] = await pool.query("SELECT * FROM tickets WHERE id = ? LIMIT 1", [req.params.id]);
    if (!tickets.length) return res.status(404).json({ error: "Ticket not found" });
    const ticket = tickets[0];
    await pool.query(`INSERT INTO ticket_messages (id, ticket_id, sender_id, is_admin, body) VALUES (?, ?, ?, 1, ?)`,
      [uuidv4(), req.params.id, req.user.id, msgBody]);
    if (ticket.status === "open") await pool.query("UPDATE tickets SET status = 'in_progress', updated_at = NOW() WHERE id = ?", [req.params.id]);
    else await pool.query("UPDATE tickets SET updated_at = NOW() WHERE id = ?", [req.params.id]);
    await createNotification(ticket.user_id, { type: "system", title: "Réponse à votre ticket", message: `Un admin a répondu à « ${ticket.subject} »`, icon: "message-square", link: "/my-tickets" });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/tickets/:id/email", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [tickets] = await pool.query(`SELECT t.*, u.email AS user_email, p.full_name AS user_name FROM tickets t LEFT JOIN users u ON u.id = t.user_id LEFT JOIN profiles p ON p.user_id = t.user_id WHERE t.id = ?`, [req.params.id]);
    if (!tickets.length) return res.status(404).json({ error: "Ticket not found" });
    const ticket = tickets[0];
    if (!ticket.user_email) return res.status(400).json({ error: "No email" });
    const [messages] = await pool.query(`SELECT tm.*, p.full_name AS sender_name FROM ticket_messages tm LEFT JOIN profiles p ON p.user_id = tm.sender_id WHERE tm.ticket_id = ? ORDER BY tm.created_at ASC`, [req.params.id]);
    const catLabels = { bug: "Bug", feature: "Feature", other: "Autre" };
    const messagesHtml = messages.map(m => `<div style="margin-bottom:12px;padding:12px;border-radius:8px;background:${m.is_admin ? '#f0f0ff' : '#f9fafb'}"><div style="font-size:12px;color:#6b7280;margin-bottom:4px"><strong>${m.is_admin ? 'Équipe Scouty' : (m.sender_name || 'Vous')}</strong> — ${new Date(m.created_at).toLocaleString('fr-FR')}</div><div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${m.body}</div></div>`).join("");
    await sendEmail(ticket.user_email, `[Scouty] Suivi de votre ticket : ${ticket.subject}`, `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;color:#1a1a2e">
        <div style="background:#6366f1;color:#fff;padding:16px 24px;border-radius:8px 8px 0 0"><h2 style="margin:0;font-size:18px">Suivi de votre ticket — ${catLabels[ticket.category] || ticket.category}</h2></div>
        <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
          <p style="font-weight:600;font-size:16px;margin:0 0 4px">${ticket.subject}</p>
          <p style="font-size:13px;color:#6b7280;margin:0 0 20px">Créé le ${new Date(ticket.created_at).toLocaleString('fr-FR')}</p>
          <div style="background:#f9fafb;border-radius:6px;padding:16px;margin-bottom:20px"><p style="margin:0;font-size:14px;white-space:pre-wrap">${ticket.message}</p></div>
          ${messages.length ? `<h3 style="font-size:14px;margin:20px 0 12px">Échanges</h3>${messagesHtml}` : ""}
        </div>
      </div>
    `);
    await createNotification(ticket.user_id, { type: "system", title: "Récapitulatif envoyé par email", message: `Le suivi de « ${ticket.subject} » vous a été envoyé.`, icon: "mail" });
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.patch("/api/admin/tickets/:id/status", authMiddleware, ensureAdmin, async (req, res) => {
  const { status } = req.body || {};
  if (!["open", "in_progress", "closed"].includes(status)) return res.status(400).json({ error: "Invalid status" });
  try {
    await pool.query("UPDATE tickets SET status = ?, updated_at = NOW() WHERE id = ?", [status, req.params.id]);
    if (status === "closed") {
      const [t] = await pool.query("SELECT user_id, subject FROM tickets WHERE id = ?", [req.params.id]);
      if (t[0]) await createNotification(t[0].user_id, { type: "system", title: "Ticket résolu", message: `Votre ticket « ${t[0].subject} » a été clôturé.`, icon: "check-circle" });
    }
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// ── User-side: own tickets ──────────────────────────────────────────────────
app.get("/api/my-tickets", authMiddleware, async (req, res) => {
  try {
    let tickets;
    try {
      [tickets] = await pool.query(`SELECT t.*,
        (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_admin = 1
          AND tm.created_at > COALESCE(t.user_read_at, '1970-01-01')
        ) AS unread_count
        FROM tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC`, [req.user.id]);
    } catch {
      // Fallback if user_read_at column doesn't exist yet (migration pending)
      [tickets] = await pool.query(
        `SELECT t.*, 0 AS unread_count FROM tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC`,
        [req.user.id]
      );
    }
    return res.json(tickets);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.get("/api/my-tickets/:id", authMiddleware, async (req, res) => {
  try {
    const [tickets] = await pool.query("SELECT * FROM tickets WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!tickets.length) return res.status(404).json({ error: "Not found" });
    const [messages] = await pool.query(`SELECT tm.*, p.full_name AS sender_name FROM ticket_messages tm LEFT JOIN profiles p ON p.user_id = tm.sender_id WHERE tm.ticket_id = ? ORDER BY tm.created_at ASC`, [req.params.id]);
    // Mark as read — clears the unread badge
    pool.query("UPDATE tickets SET user_read_at = NOW() WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]).catch(() => {});
    return res.json({ ticket: tickets[0], messages });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post("/api/my-tickets/:id/reply", authMiddleware, async (req, res) => {
  const { body: msgBody } = req.body || {};
  if (!msgBody) return res.status(400).json({ error: "Message requis." });
  try {
    const [tickets] = await pool.query("SELECT * FROM tickets WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!tickets.length) return res.status(404).json({ error: "Not found" });
    await pool.query(`INSERT INTO ticket_messages (id, ticket_id, sender_id, is_admin, body) VALUES (?, ?, ?, 0, ?)`, [uuidv4(), req.params.id, req.user.id, msgBody]);
    await pool.query("UPDATE tickets SET status = 'open', updated_at = NOW() WHERE id = ?", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// ── POST /api/feedback ────────────────────────────────────────────────────
app.post("/api/feedback", authMiddleware, async (req, res) => {
  const { rating, message, page_url } = req.body || {};
  if (!rating || rating < 1 || rating > 5) return res.status(400).json({ error: "Rating entre 1 et 5 requis." });

  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO feedback (id, user_id, rating, message, page_url) VALUES (?, ?, ?, ?, ?)`,
      [id, req.user.id, rating, message?.trim() || null, page_url || null]
    );
    return res.json({ ok: true, id });
  } catch (err) {
    console.error("[feedback] Error:", err);
    return res.status(500).json({ error: "Erreur lors de l'enregistrement du feedback." });
  }
});

// ── GET /api/feedback (admin) ────────────────────────────────────────────
app.get("/api/feedback", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT f.*, p.full_name, u.email
       FROM feedback f
       LEFT JOIN profiles p ON p.id = f.user_id
       LEFT JOIN users u ON u.id = f.user_id
       ORDER BY f.created_at DESC
       LIMIT 200`
    );
    return res.json(rows);
  } catch (err) {
    console.error("[feedback] Error fetching:", err);
    return res.status(500).json({ error: "Erreur serveur." });
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
    return res.json({ ok: true, session: buildSession(user, res), user: normalizeUserRow(user) });
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
    return res.json({ user: normalizeUserRow(user), session: buildSession(user, res) });
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
      "SELECT totp_enabled, email_2fa_enabled FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );
    return res.json({
      enabled: !!(rows[0]?.totp_enabled) || !!(rows[0]?.email_2fa_enabled),
      method: rows[0]?.totp_enabled ? 'totp' : rows[0]?.email_2fa_enabled ? 'email' : null,
    });
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

// POST /api/auth/2fa/email/enable — enable email-based 2FA
app.post("/api/auth/2fa/email/enable", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT totp_enabled, email_2fa_enabled FROM users WHERE id = ? LIMIT 1", [req.user.id]);
    if (rows[0]?.totp_enabled) return res.status(400).json({ error: "Désactivez d'abord la 2FA par application avant d'activer la 2FA par email." });
    if (rows[0]?.email_2fa_enabled) return res.status(400).json({ error: "La 2FA par email est déjà activée." });

    // Send a verification code to confirm the user receives emails
    const code = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      "UPDATE users SET email_2fa_code = ?, email_2fa_expires_at = ?, updated_at = NOW() WHERE id = ?",
      [code, expiresAt, req.user.id],
    );

    const sent = await sendEmail(req.user.email, `Scouty – Code d'activation 2FA : ${code}`, `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <img src="https://scouty.app/logo.png" alt="Scouty" width="40" style="border-radius:10px;margin-bottom:16px" />
        <h2 style="color:#1a1a2e;margin:0 0 8px">Activation de la 2FA par email</h2>
        <p style="color:#555">Voici votre code de vérification :</p>
        <p style="text-align:center;margin:32px 0">
          <span style="background:#6366f1;color:#fff;padding:16px 32px;border-radius:12px;font-size:28px;font-weight:700;letter-spacing:8px;display:inline-block">${code}</span>
        </p>
        <p style="color:#888;font-size:13px">Ce code est valable <strong>10 minutes</strong>.</p>
        <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
        <p style="color:#aaa;font-size:11px;text-align:center">Scouty — Scouting footballistique professionnel</p>
      </div>
    `);
    if (!sent) {
      return res.status(500).json({ error: "Service d'envoi d'email non configuré." });
    }

    return res.json({ ok: true, codeSent: true });
  } catch (err) {
    console.error("2fa email enable error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/2fa/email/verify — verify the email code and activate email 2FA
app.post("/api/auth/2fa/email/verify", authMiddleware, async (req, res) => {
  const { code } = req.body || {};
  if (!code) return res.status(400).json({ error: "Code requis." });

  try {
    const [rows] = await pool.query(
      "SELECT email_2fa_code, email_2fa_expires_at FROM users WHERE id = ? LIMIT 1",
      [req.user.id],
    );
    const user = rows[0];
    if (!user?.email_2fa_code) return res.status(400).json({ error: "Aucune activation en cours." });
    if (new Date() > new Date(user.email_2fa_expires_at)) return res.status(400).json({ error: "Code expiré. Veuillez recommencer." });
    if (String(code).trim() !== user.email_2fa_code) return res.status(400).json({ error: "Code invalide." });

    await pool.query(
      "UPDATE users SET email_2fa_enabled = 1, email_2fa_code = NULL, email_2fa_expires_at = NULL, updated_at = NOW() WHERE id = ?",
      [req.user.id],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("2fa email verify error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/2fa/email/disable — disable email 2FA (requires password confirmation)
app.post("/api/auth/2fa/email/disable", authMiddleware, async (req, res) => {
  const { password } = req.body || {};
  if (!password) return res.status(400).json({ error: "Mot de passe requis pour désactiver la 2FA." });

  try {
    const [rows] = await pool.query("SELECT email_2fa_enabled, password_hash FROM users WHERE id = ? LIMIT 1", [req.user.id]);
    if (!rows[0]?.email_2fa_enabled) return res.status(400).json({ error: "La 2FA par email n'est pas activée." });

    const valid = rows[0].password_hash && await bcrypt.compare(String(password), rows[0].password_hash);
    if (!valid) return res.status(401).json({ error: "Mot de passe incorrect." });

    await pool.query(
      "UPDATE users SET email_2fa_enabled = 0, email_2fa_code = NULL, email_2fa_expires_at = NULL, updated_at = NOW() WHERE id = ?",
      [req.user.id],
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error("2fa email disable error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/auth/2fa/validate — validate TOTP or email code during login
app.post("/api/auth/2fa/validate", rateLimitAuth, async (req, res) => {
  const { challengeToken, code } = req.body || {};
  if (!challengeToken || !code) return res.status(400).json({ error: "challengeToken et code requis." });

  let userId;
  try {
    const payload = jwt.verify(challengeToken, jwtSecret);
    if (payload.purpose !== '2fa_challenge') throw new Error('invalid purpose');
    userId = payload.sub;
  } catch {
    return res.status(401).json({ error: "Challenge invalide ou expiré." });
  }

  try {
    const [rows] = await pool.query(
      "SELECT * FROM users WHERE id = ? LIMIT 1",
      [userId],
    );
    const user = rows[0];
    if (!user) return res.status(400).json({ error: "Utilisateur introuvable." });

    let valid = false;

    if (user.totp_enabled && speakeasy) {
      // TOTP validation
      valid = speakeasy.totp.verify({
        secret: user.totp_secret,
        encoding: "base32",
        token: String(code),
        window: 1,
      });
    } else if (user.email_2fa_enabled) {
      // Email code validation
      if (!user.email_2fa_code || new Date() > new Date(user.email_2fa_expires_at)) {
        return res.status(401).json({ error: "Code expiré. Veuillez vous reconnecter." });
      }
      valid = String(code).trim() === user.email_2fa_code;
      if (valid) {
        // Clear used code
        await pool.query("UPDATE users SET email_2fa_code = NULL, email_2fa_expires_at = NULL WHERE id = ?", [user.id]);
      }
    }

    if (!valid) return res.status(401).json({ error: "Code 2FA invalide." });

    await pool.query("UPDATE users SET last_sign_in_at = NOW(), updated_at = NOW() WHERE id = ?", [user.id]);
    const refreshed = await getUserById(user.id);
    return res.json({ session: buildSession(refreshed, res), user: normalizeUserRow(refreshed) });
  } catch (err) {
    console.error("2fa validate error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Detect optional columns once at first request ──
// Cache column existence checks (resolved once on first request)
const _colCache = {};
async function playersHasColumn(colName) {
  if (_colCache[colName] !== undefined) return _colCache[colName];
  try {
    const [cols] = await pool.query("SHOW COLUMNS FROM `players` LIKE ?", [colName]);
    _colCache[colName] = cols.length > 0;
  } catch {
    _colCache[colName] = false;
  }
  return _colCache[colName];
}
async function playersHasIsArchived() { return playersHasColumn("is_archived"); }

// Cached existence check for the per-user rating overlay table. Re-checks once
// if it was missing — covers the cold-start race where the top-level CREATE
// TABLE statement hasn't completed yet by the time the first request arrives.
let _purExistsCache = null;
async function playerUserRatingExists() {
  if (_purExistsCache === true) return true;
  try {
    const [rows] = await pool.query("SHOW TABLES LIKE 'player_user_rating'");
    _purExistsCache = rows.length > 0;
  } catch {
    _purExistsCache = false;
  }
  return _purExistsCache;
}

// ── Paginated players endpoint ──────────────────────────────────────────────
// Replaces the "fetch all in 1000-row batches" pattern with server-side
// filtering, sorting, and offset-based pagination.
app.get("/api/players", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 24, 1), 100);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const hasArchivedCol = await playersHasIsArchived();

    // ── Filters ──
    const search = (req.query.search || "").trim();
    const archived = req.query.archived === "1";
    const opinions = req.query.opinions ? req.query.opinions.split(",") : [];
    const positions = req.query.positions ? req.query.positions.split(",") : [];
    const leagues = req.query.leagues ? req.query.leagues.split(",") : [];
    const clubs = req.query.clubs ? req.query.clubs.split(",") : [];
    const roles = req.query.roles ? req.query.roles.split(",") : [];
    const tasks = req.query.tasks ? req.query.tasks.split(",") : [];
    // Guard parseFloat/parseInt against garbage input — without this, "?levelMin=abc"
    // pushes NaN as a SQL bind param and the whole query 500s on "Champ 'NaN' inconnu".
    const numOrNull = (v, parser) => {
      if (v == null || v === "") return null;
      const n = parser(v);
      return Number.isFinite(n) ? n : null;
    };
    const levelMin = numOrNull(req.query.levelMin, parseFloat);
    const levelMax = numOrNull(req.query.levelMax, parseFloat);
    const potMin = numOrNull(req.query.potMin, parseFloat);
    const potMax = numOrNull(req.query.potMax, parseFloat);
    const ageMin = numOrNull(req.query.ageMin, parseInt);
    const ageMax = numOrNull(req.query.ageMax, parseInt);
    const contractRanges = req.query.contractRanges ? req.query.contractRanges.split(",") : [];
    const ratingMin = numOrNull(req.query.ratingMin, parseFloat);
    const ratingMax = numOrNull(req.query.ratingMax, parseFloat);
    const goalsMin = numOrNull(req.query.goalsMin, parseInt);
    const assistsMin = numOrNull(req.query.assistsMin, parseInt);
    const minutesMin = numOrNull(req.query.minutesMin, parseInt);
    const updatedSince = numOrNull(req.query.updatedSince, parseInt);
    const enrichment = req.query.enrichment || ""; // '', 'enriched', 'not_enriched'
    const sort = req.query.sort || "name";

    const hasTaskCol = await playersHasColumn("task");
    const hasNewsCol = await playersHasColumn("has_news");

    // Per-user rating overlay: every query LEFT JOINs player_user_rating
    // and references `LVL`, `POT`, `OPN` for the user's level/potential/opinion.
    // If the table is missing (e.g. during a Vercel cold-start race), we fall
    // back to the players-table columns directly — see retry block below.
    const useOverlay = await playerUserRatingExists();
    const LVL = useOverlay ? "COALESCE(pur.current_level, 0)" : "p.`current_level`";
    const POT = useOverlay ? "COALESCE(pur.potential, 0)" : "p.`potential`";
    const OPN = useOverlay ? "COALESCE(pur.general_opinion, 'À revoir')" : "p.`general_opinion`";
    const joinSql = useOverlay ? "LEFT JOIN `player_user_rating` pur ON pur.player_id = p.id AND pur.user_id = ?" : "";
    const joinParams = useOverlay ? [userId] : [];

    const clauses = ["(p.`user_id` = ? OR p.`id` IN (SELECT `player_id` FROM `player_viewer_links` WHERE `viewer_user_id` = ?))"];
    const params = [userId, userId];

    // Archived (column may not exist on older DBs)
    if (hasArchivedCol) {
      clauses.push("p.`is_archived` = ?");
      params.push(archived ? 1 : 0);
    }

    // Text search (name, club, league)
    if (search) {
      clauses.push("(LOWER(p.`name`) LIKE ? OR LOWER(p.`club`) LIKE ? OR LOWER(p.`league`) LIKE ?)");
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like);
    }

    // Enum filters
    if (opinions.length) {
      clauses.push(`${OPN} IN (${opinions.map(() => "?").join(",")})`);
      params.push(...opinions);
    }
    if (positions.length) {
      clauses.push(`\`position\` IN (${positions.map(() => "?").join(",")})`);
      params.push(...positions);
    }
    if (leagues.length) {
      clauses.push(`\`league\` IN (${leagues.map(() => "?").join(",")})`);
      params.push(...leagues);
    }
    if (clubs.length) {
      clauses.push(`LOWER(\`club\`) IN (${clubs.map(() => "?").join(",")})`);
      params.push(...clubs.map(c => c.toLowerCase()));
    }
    if (roles.length) {
      clauses.push(`\`role\` IN (${roles.map(() => "?").join(",")})`);
      params.push(...roles);
    }
    if (tasks.length && hasTaskCol) {
      clauses.push(`\`task\` IN (${tasks.map(() => "?").join(",")})`);
      params.push(...tasks);
    }

    // Numeric range filters
    if (levelMin !== null) { clauses.push(`${LVL} >= ?`); params.push(levelMin); }
    if (levelMax !== null) { clauses.push(`${LVL} <= ?`); params.push(levelMax); }
    if (potMin !== null) { clauses.push(`${POT} >= ?`); params.push(potMin); }
    if (potMax !== null) { clauses.push(`${POT} <= ?`); params.push(potMax); }

    // Age filter — derived from generation (YEAR(NOW()) - generation).
    // We translate age bounds to generation bounds in JS rather than computing
    // `YEAR(CURDATE()) - generation` in SQL: MySQL evaluates that subtraction in
    // UNSIGNED arithmetic and overflows on any row with `generation` > current
    // year (e.g. a 2029 prospect = data-entry error), giving "BIGINT UNSIGNED
    // value is out of range" and 500-ing the whole list. CAST(SIGNED) on the
    // operand isn't enough — the result is still computed unsigned.
    const currentYear = new Date().getFullYear();
    if (ageMin !== null) {
      // age >= ageMin  ⇒  generation <= currentYear - ageMin
      clauses.push("`generation` <= ?");
      params.push(currentYear - ageMin);
    }
    if (ageMax !== null) {
      // age <= ageMax  ⇒  generation >= currentYear - ageMax
      clauses.push("`generation` >= ?");
      params.push(currentYear - ageMax);
    }

    // Contract range filter
    if (contractRanges.length) {
      const contractClauses = [];
      for (const range of contractRanges) {
        switch (range) {
          case "none": contractClauses.push("`contract_end` IS NULL"); break;
          case "expired": contractClauses.push("`contract_end` < CURDATE()"); break;
          case "6m": contractClauses.push("(`contract_end` >= CURDATE() AND `contract_end` <= DATE_ADD(CURDATE(), INTERVAL 6 MONTH))"); break;
          case "12m": contractClauses.push("(`contract_end` > DATE_ADD(CURDATE(), INTERVAL 6 MONTH) AND `contract_end` <= DATE_ADD(CURDATE(), INTERVAL 12 MONTH))"); break;
          case "2y": contractClauses.push("(`contract_end` > DATE_ADD(CURDATE(), INTERVAL 12 MONTH) AND `contract_end` <= DATE_ADD(CURDATE(), INTERVAL 24 MONTH))"); break;
          case "2y+": contractClauses.push("`contract_end` > DATE_ADD(CURDATE(), INTERVAL 24 MONTH)"); break;
        }
      }
      if (contractClauses.length) {
        clauses.push(`(${contractClauses.join(" OR ")})`);
      }
    }

    // Performance stats filters (JSON_EXTRACT on external_data)
    if (ratingMin !== null) {
      clauses.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.rating') AS DECIMAL(5,2)) >= ?");
      params.push(ratingMin);
    }
    if (ratingMax !== null) {
      clauses.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.rating') AS DECIMAL(5,2)) <= ?");
      params.push(ratingMax);
    }
    if (goalsMin !== null) {
      clauses.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.goals') AS UNSIGNED) >= ?");
      params.push(goalsMin);
    }
    if (assistsMin !== null) {
      clauses.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.assists') AS UNSIGNED) >= ?");
      params.push(assistsMin);
    }
    if (minutesMin !== null) {
      clauses.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.minutes') AS UNSIGNED) >= ?");
      params.push(minutesMin);
    }
    if (updatedSince !== null && updatedSince > 0) {
      clauses.push("p.`updated_at` >= DATE_SUB(NOW(), INTERVAL ? DAY)");
      params.push(updatedSince);
    }

    // Enrichment status filter — based on external_data presence
    if (enrichment === "enriched") {
      clauses.push("p.`external_data` IS NOT NULL AND p.`external_data` NOT IN ('', 'null', '{}')");
    } else if (enrichment === "not_enriched") {
      clauses.push("(p.`external_data` IS NULL OR p.`external_data` IN ('', 'null', '{}'))");
    }

    const whereSql = `WHERE ${clauses.join(" AND ")}`;

    // ── Sorting ──
    // Priority 1 (always): has_news players on top
    // Priority 2: user-chosen sort (must come before richness so the dropdown actually works)
    // Priority 3: data-richness score — tiebreaker only, so richer profiles bubble up within equal sort values
    const DATA_RICHNESS_SCORE = `(
      CASE WHEN p.\`external_data\` IS NOT NULL AND p.\`external_data\` NOT IN ('', 'null', '{}') THEN 4 ELSE 0 END +
      CASE WHEN p.\`photo_url\`         IS NOT NULL AND p.\`photo_url\` != ''         THEN 2 ELSE 0 END +
      CASE WHEN p.\`transfermarkt_id\`  IS NOT NULL AND p.\`transfermarkt_id\` != ''  THEN 2 ELSE 0 END +
      CASE WHEN p.\`club\`              IS NOT NULL AND p.\`club\` != ''              THEN 1 ELSE 0 END +
      CASE WHEN p.\`league\`            IS NOT NULL AND p.\`league\` != ''            THEN 1 ELSE 0 END +
      CASE WHEN p.\`contract_end\`      IS NOT NULL                                 THEN 1 ELSE 0 END +
      CASE WHEN p.\`market_value\`      IS NOT NULL AND p.\`market_value\` != ''      THEN 1 ELSE 0 END +
      CASE WHEN p.\`date_of_birth\`     IS NOT NULL                                 THEN 1 ELSE 0 END +
      CASE WHEN p.\`notes\`             IS NOT NULL AND p.\`notes\` != ''             THEN 1 ELSE 0 END +
      CASE WHEN p.\`height\`            IS NOT NULL AND p.\`height\` > 0              THEN 1 ELSE 0 END +
      CASE WHEN p.\`weight\`            IS NOT NULL AND p.\`weight\` > 0              THEN 1 ELSE 0 END +
      CASE WHEN p.\`position_secondaire\` IS NOT NULL AND p.\`position_secondaire\` != '' THEN 1 ELSE 0 END +
      CASE WHEN p.\`role\`              IS NOT NULL AND p.\`role\` != ''              THEN 1 ELSE 0 END +
      CASE WHEN p.\`passport_country\`  IS NOT NULL AND p.\`passport_country\` != '' THEN 1 ELSE 0 END +
      CASE WHEN ${OPN}                  NOT IN ('À revoir', 'A revoir', '')         THEN 1 ELSE 0 END +
      CASE WHEN ${LVL}                  > 0 AND ${LVL} != 5.0                      THEN 1 ELSE 0 END
    ) DESC`;

    const orderParts = [];
    if (hasNewsCol) {
      orderParts.push("CASE WHEN p.`has_news` IS NOT NULL AND p.`has_news` != '' THEN 0 ELSE 1 END ASC");
    }
    switch (sort) {
      case "name": orderParts.push("p.`name` ASC"); break;
      case "age-asc": orderParts.push("p.`generation` DESC"); break;
      case "age-desc": orderParts.push("p.`generation` ASC"); break;
      case "level": orderParts.push(`${LVL} DESC`); break;
      case "potential": orderParts.push(`${POT} DESC`); break;
      case "recent": orderParts.push("p.`updated_at` DESC"); break;
      case "contract": orderParts.push("CASE WHEN p.`contract_end` IS NULL THEN 1 ELSE 0 END ASC, p.`contract_end` ASC"); break;
      case "rating": orderParts.push("CAST(JSON_EXTRACT(p.`external_data`, '$.performance_stats.stats.rating') AS DECIMAL(5,2)) DESC"); break;
      case "goals": orderParts.push("CAST(JSON_EXTRACT(p.`external_data`, '$.performance_stats.stats.goals') AS UNSIGNED) DESC"); break;
      case "assists": orderParts.push("CAST(JSON_EXTRACT(p.`external_data`, '$.performance_stats.stats.assists') AS UNSIGNED) DESC"); break;
      case "minutes": orderParts.push("CAST(JSON_EXTRACT(p.`external_data`, '$.performance_stats.stats.minutes') AS UNSIGNED) DESC"); break;
      case "xg": orderParts.push("CAST(JSON_EXTRACT(p.`external_data`, '$.performance_stats.stats.expected_goals') AS DECIMAL(5,2)) DESC"); break;
      case "pass-accuracy": orderParts.push("CAST(JSON_EXTRACT(p.`external_data`, '$.performance_stats.stats.passes_accuracy') AS DECIMAL(5,2)) DESC"); break;
      default: orderParts.push("p.`name` ASC");
    }
    orderParts.push(DATA_RICHNESS_SCORE);
    const orderSql = `ORDER BY ${orderParts.join(", ")}`;

    // TEMP debug — remove once sort issue is confirmed fixed
    console.log(`[GET /api/players] sort=${sort} offset=${offset} → ORDER BY parts: ${orderParts.length}`);

    // ── IDs-only mode (for "select all" across all pages) ──
    if (req.query.idsOnly === "1") {
      const [idRows] = await pool.query(`SELECT p.\`id\` FROM \`players\` p ${joinSql} ${whereSql}`, [...joinParams, ...params]);
      return res.json({ ids: idRows.map(r => r.id) });
    }

    // ── Count total (for "X / Y displayed") ──
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM \`players\` p ${joinSql} ${whereSql}`, [...joinParams, ...params]);
    const total = countRows[0].total;

    // ── Fetch page ──
    // Override the players' stored rating fields with the per-user overlay values
    // via aliased columns we strip out in JS before returning.
    const [rows] = await pool.query(
      `SELECT p.*,
              ${LVL} AS __pur_level,
              ${POT} AS __pur_pot,
              ${OPN} AS __pur_opinion
       FROM \`players\` p ${joinSql} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
      [...joinParams, ...params, limit, offset]
    );

    const data = rows.map(r => {
      const parsed = parseRowJsonColumns(r);
      parsed.current_level = Number(parsed.__pur_level);
      parsed.potential = Number(parsed.__pur_pot);
      parsed.general_opinion = parsed.__pur_opinion;
      delete parsed.__pur_level;
      delete parsed.__pur_pot;
      delete parsed.__pur_opinion;
      return parsed;
    });
    return res.json({ data, total, hasMore: offset + data.length < total });
  } catch (err) {
    console.error("[GET /api/players]", err?.message, err?.sql || "");
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

// ── Player facets (distinct values for filter dropdowns) ──
// Resolve a list of player display names against the user's own roster.
// Returns { matches: { [inputName]: { id, name } } }. Unmatched names are omitted.
// Matching: (1) exact normalized match; (2) "first-initial + last-name" fallback,
// disambiguated by home/away club when multiple candidates share the key.
app.post("/api/players/resolve-names", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const rawNames = Array.isArray(req.body?.names) ? req.body.names : [];
    const names = Array.from(new Set(
      rawNames.filter(n => typeof n === "string" && n.trim()).map(n => n.trim())
    ));
    if (names.length === 0) return res.json({ matches: {} });

    const homeClub = typeof req.body?.home === "string" ? req.body.home : "";
    const awayClub = typeof req.body?.away === "string" ? req.body.away : "";

    const hasArchivedCol = await playersHasIsArchived();
    const sql = `SELECT \`id\`, \`name\`, \`club\` FROM \`players\` WHERE \`user_id\` = ?${hasArchivedCol ? " AND `is_archived` = 0" : ""}`;
    const [rows] = await pool.query(sql, [userId]);
    if (rows.length === 0) return res.json({ matches: {} });

    const normalize = (s) => (s || "")
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[.,'’`]/g, "")
      .replace(/-/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    const initialLastKey = (s) => {
      const n = normalize(s);
      if (!n) return "";
      const tokens = n.split(" ").filter(Boolean);
      if (tokens.length < 2) return "";
      const first = tokens[0];
      const last = tokens[tokens.length - 1];
      if (!first[0] || !last) return "";
      return `${first[0]} ${last}`;
    };

    const byFull = new Map();
    const byInitialLast = new Map();
    for (const p of rows) {
      const fn = normalize(p.name);
      if (fn) {
        if (!byFull.has(fn)) byFull.set(fn, []);
        byFull.get(fn).push(p);
      }
      const il = initialLastKey(p.name);
      if (il) {
        if (!byInitialLast.has(il)) byInitialLast.set(il, []);
        byInitialLast.get(il).push(p);
      }
    }

    const homeNorm = normalize(homeClub);
    const awayNorm = normalize(awayClub);
    const clubMatches = (pClub, target) => {
      if (!pClub || !target) return false;
      const pn = normalize(pClub);
      return pn === target || pn.includes(target) || target.includes(pn);
    };
    const pickByClub = (candidates) => {
      if (!homeNorm && !awayNorm) return null;
      return candidates.find(c => clubMatches(c.club, homeNorm) || clubMatches(c.club, awayNorm)) || null;
    };

    const matches = {};
    for (const name of names) {
      const nf = normalize(name);

      // 1) Exact normalized match — always trust; disambiguate by club if needed
      const exact = byFull.get(nf);
      if (exact && exact.length > 0) {
        const chosen = exact.length === 1 ? exact[0] : (pickByClub(exact) || exact[0]);
        matches[name] = { id: chosen.id, name: chosen.name };
        continue;
      }

      // 2) Fallback: first-initial + last-name. Accept a single candidate, or
      //    the one whose club matches home/away. Otherwise skip to avoid false positives.
      const il = initialLastKey(name);
      if (!il) continue;
      const cands = byInitialLast.get(il);
      if (!cands || cands.length === 0) continue;
      if (cands.length === 1) {
        matches[name] = { id: cands[0].id, name: cands[0].name };
      } else {
        const byClub = pickByClub(cands);
        if (byClub) matches[name] = { id: byClub.id, name: byClub.name };
      }
    }

    return res.json({ matches });
  } catch (err) {
    console.error("[resolve-names] ERROR:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Server-side duplicate detection ──
// Mirrors src/hooks/use-players.ts → isSamePlayer / normalizeName. Keeping the
// loop here avoids dragging the full roster (with external_data) to the client
// just to do an O(n²) compare in React.
function srvNormalizeName(name) {
  if (!name) return "";
  return String(name)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function srvIsSamePlayer(a, b) {
  if (a.transfermarkt_id && b.transfermarkt_id && a.transfermarkt_id === b.transfermarkt_id) return true;
  if (a.transfermarkt_id && b.transfermarkt_id && a.transfermarkt_id !== b.transfermarkt_id) return false;
  const nA = srvNormalizeName(a.name);
  const nB = srvNormalizeName(b.name);
  if (!nA || !nB) return false;
  const sameClub = !!(a.club && b.club && srvNormalizeName(a.club) === srvNormalizeName(b.club));
  const genClose = Math.abs((a.generation || 0) - (b.generation || 0)) <= 1;
  const bothGenKnown = a.generation !== 2000 && b.generation !== 2000;
  if (nA === nB && sameClub) return true;
  if (nA === nB && bothGenKnown && genClose) return true;
  if (nA === nB && a.generation === b.generation) return true;
  if (nA === nB && !bothGenKnown && sameClub) return true;
  if (!sameClub || !genClose) return false;
  const partsA = nA.split(" ").filter(Boolean);
  const partsB = nB.split(" ").filter(Boolean);
  const lastA = partsA[partsA.length - 1];
  const lastB = partsB[partsB.length - 1];
  if (lastA === lastB && lastA && lastA.length >= 3 && partsA[0]?.[0] === partsB[0]?.[0]) return true;
  return false;
}

app.get("/api/players/duplicates", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const hasArchivedCol = await playersHasIsArchived();
    const archivedFilter = hasArchivedCol ? " AND `is_archived` = 0" : "";
    // Only the fields needed for duplicate detection + display in the dialog.
    const [rows] = await pool.query(
      `SELECT \`id\`, \`name\`, \`generation\`, \`club\`, \`transfermarkt_id\`
         FROM \`players\`
        WHERE \`user_id\` = ?${archivedFilter}
        ORDER BY \`name\``,
      [userId]
    );

    const processed = new Set();
    const groups = [];
    for (let i = 0; i < rows.length; i++) {
      if (processed.has(rows[i].id)) continue;
      const dupes = [];
      for (let j = i + 1; j < rows.length; j++) {
        if (processed.has(rows[j].id)) continue;
        if (srvIsSamePlayer(rows[i], rows[j])) {
          dupes.push(rows[j]);
          processed.add(rows[j].id);
        }
      }
      if (dupes.length > 0) {
        processed.add(rows[i].id);
        groups.push({ keep: rows[i], duplicates: dupes });
      }
    }
    return res.json({ groups });
  } catch (err) {
    console.error("[GET /api/players/duplicates]", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

app.get("/api/players/facets", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const archived = req.query.archived === "1";
    const hasArchivedCol = await playersHasIsArchived();

    const archivedFilter = hasArchivedCol ? " AND `is_archived` = ?" : "";
    const archivedParam = hasArchivedCol ? [archived ? 1 : 0] : [];

    const [leagueRows] = await pool.query(
      `SELECT DISTINCT \`league\` FROM \`players\` WHERE \`user_id\` = ?${archivedFilter} AND \`league\` IS NOT NULL AND \`league\` != '' ORDER BY \`league\``,
      [userId, ...archivedParam]
    );
    const [clubRows] = await pool.query(
      `SELECT DISTINCT \`club\` FROM \`players\` WHERE \`user_id\` = ?${archivedFilter} AND \`club\` IS NOT NULL AND \`club\` != '' ORDER BY \`club\``,
      [userId, ...archivedParam]
    );
    const [roleRows] = await pool.query(
      `SELECT DISTINCT \`role\` FROM \`players\` WHERE \`user_id\` = ?${archivedFilter} AND \`role\` IS NOT NULL AND \`role\` != '' ORDER BY \`role\``,
      [userId, ...archivedParam]
    );
    const [countRows] = hasArchivedCol
      ? await pool.query(
          "SELECT SUM(CASE WHEN `is_archived` = 0 THEN 1 ELSE 0 END) AS activeCount, SUM(CASE WHEN `is_archived` = 1 THEN 1 ELSE 0 END) AS archivedCount FROM `players` WHERE `user_id` = ?",
          [userId]
        )
      : await pool.query(
          "SELECT COUNT(*) AS activeCount, 0 AS archivedCount FROM `players` WHERE `user_id` = ?",
          [userId]
        );

    // SUM(CASE ...) returns DECIMAL → mysql2 surfaces it as a string;
    // cast to Number so the frontend can do arithmetic / count badges correctly.
    return res.json({
      leagues: leagueRows.map(r => r.league),
      clubs: clubRows.map(r => r.club),
      roles: roleRows.map(r => r.role),
      activeCount: Number(countRows[0]?.activeCount) || 0,
      archivedCount: Number(countRows[0]?.archivedCount) || 0,
    });
  } catch (err) {
    console.error("[GET /api/players/facets]", err);
    return res.status(500).json({ error: err?.message || "Server error" });
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

      // Per-user rating overlay for the players table
      if (table === "players" && parsedRows.length) {
        const ratingMap = await fetchUserRatings(req.user.id, parsedRows.map(r => r.id));
        for (const r of parsedRows) applyUserRating(r, ratingMap);
      }

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

      // C-3/H-4: Strip moderation-only fields from community writes for non-admins
      if ((table === "community_posts" || table === "community_replies") && !req.user.isAdmin) {
        for (const f of COMMUNITY_MODERATION_FIELDS) delete row[f];
      }

      // Prevent mass-assignment of sensitive user fields
      if (table === "profiles") {
        delete row.referred_by;
      }
      if (table === "organization_members") {
        // M-7: Force role to 'member' — only explicit admin endpoints may set owner/admin
        if (row.role && !["member"].includes(row.role)) row.role = "member";
      }

      // ── Anti-spam checks for community tables ──
      if (table === "community_posts" && op === "insert") {
        // Rate limit: 1 post per 5 minutes
        const [recent] = await pool.query(
          "SELECT id FROM community_posts WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 5 MINUTE) LIMIT 1",
          [req.user.id]
        );
        if (recent.length > 0) {
          return res.status(429).json({ error: "Veuillez patienter 5 minutes entre chaque publication." });
        }
        // Min content length
        const postTitle = String(row.title || "").trim();
        const postContent = String(row.content || "").trim();
        if (postTitle.length < 3) return res.status(400).json({ error: "Le titre doit contenir au moins 3 caractères." });
        if (postContent.length < 10) return res.status(400).json({ error: "Le contenu doit contenir au moins 10 caractères." });
        // No duplicate consecutive post
        const [lastPost] = await pool.query(
          "SELECT title, content FROM community_posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
          [req.user.id]
        );
        if (lastPost.length > 0 && lastPost[0].title === postTitle && lastPost[0].content === postContent) {
          return res.status(400).json({ error: "Vous avez déjà publié ce contenu." });
        }
        // Max 20 posts per day
        const [dailyCount] = await pool.query(
          "SELECT COUNT(*) as cnt FROM community_posts WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)",
          [req.user.id]
        );
        if (dailyCount[0].cnt >= 20) {
          return res.status(429).json({ error: "Vous avez atteint la limite de 20 publications par jour." });
        }
      }

      if (table === "community_replies" && op === "insert") {
        // Rate limit: 1 reply per 60 seconds
        const [recentReply] = await pool.query(
          "SELECT id FROM community_replies WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 MINUTE) LIMIT 1",
          [req.user.id]
        );
        if (recentReply.length > 0) {
          return res.status(429).json({ error: "Veuillez patienter 1 minute entre chaque réponse." });
        }
        // Min content length
        const replyText = String(row.content || "").trim();
        if (replyText.length < 2) return res.status(400).json({ error: "La réponse doit contenir au moins 2 caractères." });
        // No duplicate consecutive reply on same post
        const [lastReply] = await pool.query(
          "SELECT content FROM community_replies WHERE user_id = ? AND post_id = ? ORDER BY created_at DESC LIMIT 1",
          [req.user.id, row.post_id]
        );
        if (lastReply.length > 0 && lastReply[0].content === replyText) {
          return res.status(400).json({ error: "Vous avez déjà envoyé cette réponse." });
        }
        // Max 60 replies per day
        const [dailyReplies] = await pool.query(
          "SELECT COUNT(*) as cnt FROM community_replies WHERE user_id = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 DAY)",
          [req.user.id]
        );
        if (dailyReplies[0].cnt >= 60) {
          return res.status(429).json({ error: "Vous avez atteint la limite de 60 réponses par jour." });
        }
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

      // Per-user rating overlay: mirror rating fields to player_user_rating
      // so the calling user sees their values regardless of who owns the row.
      if (table === "players" && row.id) {
        const ratingPatch = {};
        for (const k of PLAYER_RATING_COLS) {
          if (values[k] !== undefined) ratingPatch[k] = values[k];
        }
        if (Object.keys(ratingPatch).length) {
          try {
            await upsertUserRating(row.id, req.user.id, ratingPatch);
          } catch (err) {
            console.warn("[player_user_rating] upsert (insert/upsert path):", err?.message);
          }
        }
      }

      // ── Post-insert notification hooks ──

      // Notify @mentions in community posts
      if (table === "community_posts" && op === "insert") {
        try {
          const postContent = String(row.content || "");
          const postAuthor = row.author_name || req.user.email;
          const mentionRegex = /@([A-Za-z\u00C0-\u024F0-9_ -]+)/g;
          const notifiedIds = new Set([req.user.id]);
          let mention;
          while ((mention = mentionRegex.exec(postContent)) !== null) {
            const mentionedName = mention[1].trim();
            const [pRows] = await pool.query("SELECT user_id FROM profiles WHERE LOWER(full_name) = LOWER(?) LIMIT 1", [mentionedName]);
            if (pRows[0] && !notifiedIds.has(pRows[0].user_id)) {
              notifiedIds.add(pRows[0].user_id);
              await createNotification(pRows[0].user_id, {
                type: "community",
                title: `${postAuthor} vous a mentionné dans un post`,
                message: (row.title || postContent).slice(0, 120),
                icon: "MessageSquare",
                link: "/community",
              });
            }
          }
        } catch (err) { console.warn("[notification] community-post mention hook:", err?.message); }
      }

      if (table === "community_replies" && op === "insert" && row.post_id) {
        try {
          const [postRows] = await pool.query("SELECT user_id, title FROM community_posts WHERE id = ? LIMIT 1", [row.post_id]);
          const post = postRows[0];
          if (post) {
            const replierName = row.author_name || req.user.email;
            const notifiedIds = new Set([req.user.id]);
            // Notify post author
            if (post.user_id !== req.user.id) {
              notifiedIds.add(post.user_id);
              await createNotification(post.user_id, {
                type: "community",
                title: `${replierName} a répondu à votre post`,
                message: post.title,
                icon: "MessageSquare",
                link: "/community",
              });
            }
            // Notify @mentions in reply content
            const content = String(row.content || "");
            const mentionRegex = /@([A-Za-z\u00C0-\u024F0-9_ -]+)/g;
            let mention;
            while ((mention = mentionRegex.exec(content)) !== null) {
              const mentionedName = mention[1].trim();
              const [pRows] = await pool.query("SELECT user_id FROM profiles WHERE LOWER(full_name) = LOWER(?) LIMIT 1", [mentionedName]);
              if (pRows[0] && !notifiedIds.has(pRows[0].user_id)) {
                notifiedIds.add(pRows[0].user_id);
                await createNotification(pRows[0].user_id, {
                  type: "community",
                  title: `${replierName} vous a mentionné`,
                  message: content.slice(0, 120),
                  icon: "MessageSquare",
                  link: "/community",
                });
              }
            }
            // Notify other thread participants
            const [otherRepliers] = await pool.query(
              "SELECT DISTINCT user_id FROM community_replies WHERE post_id = ?",
              [row.post_id]
            );
            for (const r of (otherRepliers || [])) {
              if (!notifiedIds.has(r.user_id)) {
                notifiedIds.add(r.user_id);
                await createNotification(r.user_id, {
                  type: "community",
                  title: `Nouvelle réponse dans "${post.title}"`,
                  message: `${replierName} a répondu à une discussion que vous suivez.`,
                  icon: "MessageSquare",
                  link: "/community",
                });
              }
            }
          }
        } catch (err) { console.warn("[notification] community-reply hook:", err?.message); }
      }

      if (table === "organization_members" && op === "insert" && row.organization_id) {
        try {
          const [orgRows] = await pool.query("SELECT name FROM organizations WHERE id = ? LIMIT 1", [row.organization_id]);
          const [profileRows] = await pool.query("SELECT full_name FROM profiles WHERE user_id = ? LIMIT 1", [req.user.id]);
          const orgName = orgRows[0]?.name || "l'organisation";
          const memberName = profileRows[0]?.full_name || req.user.email;
          // Notify all other members
          const [members] = await pool.query("SELECT user_id FROM organization_members WHERE organization_id = ? AND user_id != ?", [row.organization_id, req.user.id]);
          for (const m of members) {
            await createNotification(m.user_id, {
              type: "organization",
              title: `${memberName} a rejoint ${orgName}`,
              message: `Un nouveau membre a rejoint votre organisation.`,
              icon: "Building2",
              link: "/organization",
            });
          }
        } catch (err) { console.warn("[notification] org-join hook:", err?.message); }
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

      // For the players table, intercept rating fields so they write to
      // player_user_rating (per-user overlay) instead of the shared row.
      const ratingPatch = {};
      if (table === "players") {
        for (const k of PLAYER_RATING_COLS) {
          if (values[k] !== undefined) {
            ratingPatch[k] = values[k];
            delete values[k];
          }
        }
      }

      const cols = Object.keys(values).filter((c) => ALLOWED_TABLES[table].includes(c) && c !== "id");

      const { whereSql, whereValues } = buildWhereClause(table, filters, req.user.id);
      if (!whereSql) {
        return res.status(400).json({ error: "Refusing full-table update" });
      }

      // For players, resolve target player_ids the user can write a per-user
      // rating for: own players OR players linked via player_viewer_links.
      // This is broader than the owner-scoped WHERE so a viewer can rate too.
      let targetPlayerIds = [];
      if (table === "players" && Object.keys(ratingPatch).length) {
        const idFilter = filters.find(f => f.col === "id");
        if (idFilter) {
          const ids = idFilter.op === "in" && Array.isArray(idFilter.value)
            ? idFilter.value
            : [idFilter.value];
          if (ids.length) {
            const ph = ids.map(() => "?").join(",");
            const [accessibleRows] = await pool.query(
              `SELECT p.id FROM players p
               WHERE p.id IN (${ph})
                 AND (p.user_id = ? OR p.id IN (SELECT player_id FROM player_viewer_links WHERE viewer_user_id = ?))`,
              [...ids, req.user.id, req.user.id]
            );
            targetPlayerIds = accessibleRows.map(r => r.id);
          }
        }
      }

      if (cols.length) {
        const setSql = cols.map((c) => `\`${c}\` = ?`).join(", ");
        const setValues = cols.map((c) => sanitizeValueByColumn(c, values[c]));
        await pool.query(`UPDATE \`${table}\` SET ${setSql} ${whereSql}`, [...setValues, ...whereValues]);
      } else if (!Object.keys(ratingPatch).length) {
        return res.status(400).json({ error: "No valid columns to update" });
      }

      if (table === "players" && Object.keys(ratingPatch).length) {
        for (const pid of targetPlayerIds) {
          try {
            await upsertUserRating(pid, req.user.id, ratingPatch);
          } catch (err) {
            console.warn("[player_user_rating] upsert (update path):", err?.message);
          }
        }
      }

      if (!returning) return res.json({ data: null });

      const [rows] = await pool.query(`SELECT * FROM \`${table}\` ${whereSql} LIMIT 1`, whereValues);
      let row = rows[0] ? parseRowJsonColumns(rows[0]) : null;
      if (row && table === "players") {
        const ratingMap = await fetchUserRatings(req.user.id, [row.id]);
        applyUserRating(row, ratingMap);
      }
      return res.json({ data: row });
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
// Get organization members with full profiles (for org members only)
app.post("/api/rpc/get_org_members", authMiddleware, async (req, res) => {
  const { organization_id } = req.body || {};
  if (!organization_id) return res.status(400).json({ error: "organization_id required" });
  try {
    // Verify the requesting user is a member of this org
    const [myMembership] = await pool.query(
      "SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [organization_id, req.user.id]
    );
    if (!myMembership.length) return res.status(403).json({ error: "Not a member of this organization" });

    const [rows] = await pool.query(
      `SELECT om.id, om.user_id, om.role, om.joined_at, om.messaging_blocked,
              p.full_name, p.club, p.role AS profile_role, p.photo_url,
              p.social_x, p.social_instagram, p.social_linkedin, p.social_public,
              u.email
       FROM organization_members om
       LEFT JOIN profiles p ON p.user_id = om.user_id
       LEFT JOIN users u ON u.id = om.user_id
       WHERE om.organization_id = ?
       ORDER BY FIELD(om.role, 'owner', 'admin', 'member'), p.full_name`,
      [organization_id]
    );

    const members = rows.map((r) => ({
      id: r.id,
      user_id: r.user_id,
      role: r.role,
      joined_at: r.joined_at,
      email: r.email,
      messaging_blocked: !!r.messaging_blocked,
      profile: {
        full_name: r.full_name,
        club: r.club,
        role: r.profile_role,
        photo_url: r.photo_url || null,
        social_x: r.social_x,
        social_instagram: r.social_instagram,
        social_linkedin: r.social_linkedin,
        social_public: r.social_public,
      },
    }));

    return res.json({ data: members });
  } catch (err) {
    console.error("get_org_members error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

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
       ORDER BY
         (CASE WHEN p.external_data IS NOT NULL AND p.external_data NOT IN ('','null','{}') THEN 4 ELSE 0 END +
          CASE WHEN p.photo_url IS NOT NULL AND p.photo_url != '' THEN 2 ELSE 0 END +
          CASE WHEN p.transfermarkt_id IS NOT NULL AND p.transfermarkt_id != '' THEN 2 ELSE 0 END +
          CASE WHEN p.club IS NOT NULL AND p.club != '' THEN 1 ELSE 0 END +
          CASE WHEN p.market_value IS NOT NULL THEN 1 ELSE 0 END +
          CASE WHEN p.height IS NOT NULL AND p.height > 0 THEN 1 ELSE 0 END +
          CASE WHEN p.notes IS NOT NULL AND p.notes != '' THEN 1 ELSE 0 END) DESC,
         p.name ASC`,
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

// ── Scout opinions (org-level reviews) ────────────────────────────

// Get all scout opinions for a player within an organization
app.post("/api/rpc/get_scout_opinions", authMiddleware, async (req, res) => {
  try {
    const { player_id, organization_id } = req.body || {};
    if (!player_id || !organization_id) return res.status(400).json({ error: "Missing player_id or organization_id" });

    // Verify user is a member of this org
    const [membership] = await pool.query(
      "SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?",
      [organization_id, req.user.id],
    );
    if (!membership.length) return res.status(403).json({ error: "Not a member of this organization" });

    const [rows] = await pool.query(
      `SELECT so.*, p.full_name AS scout_name
       FROM scout_opinions so
       LEFT JOIN profiles p ON p.user_id = so.user_id
       WHERE so.player_id = ? AND so.organization_id = ?
       ORDER BY so.created_at DESC`,
      [player_id, organization_id],
    );

    const parsed = rows.map(r => {
      if (r.links && typeof r.links === 'string') {
        try { r.links = JSON.parse(r.links); } catch { r.links = []; }
      }
      if (!r.links) r.links = [];
      return r;
    });
    return res.json({ data: parsed });
  } catch (err) {
    console.error("get_scout_opinions error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// Add a scout opinion
app.post("/api/rpc/add_scout_opinion", authMiddleware, async (req, res) => {
  try {
    const { player_id, organization_id, current_level, potential, opinion, notes, links, match_observed, observed_at } = req.body || {};
    if (!player_id || !organization_id) return res.status(400).json({ error: "Missing player_id or organization_id" });

    // Verify user is a member of this org
    const [membership] = await pool.query(
      "SELECT id FROM organization_members WHERE organization_id = ? AND user_id = ?",
      [organization_id, req.user.id],
    );
    if (!membership.length) return res.status(403).json({ error: "Not a member of this organization" });

    const linksJson = links && links.length > 0 ? JSON.stringify(links) : null;
    const id = require("crypto").randomUUID();
    await pool.query(
      `INSERT INTO scout_opinions (id, player_id, organization_id, user_id, current_level, potential, opinion, notes, links, match_observed, observed_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, player_id, organization_id, req.user.id, current_level ?? 5.0, potential ?? 5.0, opinion ?? 'À revoir', notes ?? null, linksJson, match_observed || null, observed_at || null],
    );

    // Return the created opinion with scout name
    const [profileRows] = await pool.query("SELECT full_name FROM profiles WHERE user_id = ? LIMIT 1", [req.user.id]);
    const scoutName = profileRows.length ? profileRows[0].full_name : null;

    return res.json({ data: { id, player_id, organization_id, user_id: req.user.id, current_level: current_level ?? 5.0, potential: potential ?? 5.0, opinion: opinion ?? 'À revoir', notes: notes ?? null, links: links || [], match_observed: match_observed || null, observed_at: observed_at || null, scout_name: scoutName, created_at: new Date().toISOString(), updated_at: new Date().toISOString() } });
  } catch (err) {
    console.error("add_scout_opinion error:", err);
    return res.status(500).json({ error: err?.message || "Server error" });
  }
});

// Delete a scout opinion (only the author can delete)
app.post("/api/rpc/delete_scout_opinion", authMiddleware, async (req, res) => {
  try {
    const { opinion_id } = req.body || {};
    if (!opinion_id) return res.status(400).json({ error: "Missing opinion_id" });

    const [existing] = await pool.query("SELECT id FROM scout_opinions WHERE id = ? AND user_id = ?", [opinion_id, req.user.id]);
    if (!existing.length) return res.status(403).json({ error: "Not your opinion or not found" });

    await pool.query("DELETE FROM scout_opinions WHERE id = ?", [opinion_id]);
    return res.json({ data: { success: true } });
  } catch (err) {
    console.error("delete_scout_opinion error:", err);
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

      // Notify other org members about new squad player
      try {
        const playerName = p.name || "Un joueur";
        const [profileRows] = await pool.query("SELECT full_name FROM profiles WHERE user_id = ? LIMIT 1", [req.user.id]);
        const addedBy = profileRows[0]?.full_name || req.user.email;
        const [members] = await pool.query("SELECT user_id FROM organization_members WHERE organization_id = ? AND user_id != ?", [orgId, req.user.id]);
        for (const m of members) {
          await createNotification(m.user_id, {
            type: "squad",
            title: `${playerName} ajouté à l'effectif`,
            message: `${addedBy} a ajouté un joueur à l'effectif.`,
            icon: "Users",
            link: `/organization`,
          });
        }
      } catch (err) { console.warn("[notification] squad-add hook:", err?.message); }

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

// ── Community RPCs ──────────────────────────────────────────────────
const _likeRateLimit = new Map(); // userId -> lastTimestamp
app.post("/api/rpc/like_community_post", authMiddleware, async (req, res) => {
  try {
    const { post_id } = req.body || {};
    if (!post_id) return res.status(400).json({ error: "post_id required" });

    // Rate limit: 1 like action per 2 seconds per user
    const now = Date.now();
    const lastLike = _likeRateLimit.get(req.user.id) || 0;
    if (now - lastLike < 2000) {
      return res.status(429).json({ error: "Trop rapide, réessayez dans quelques secondes." });
    }
    _likeRateLimit.set(req.user.id, now);

    // Check if already liked
    const [existing] = await pool.query(
      "SELECT id FROM community_likes WHERE post_id = ? AND user_id = ? LIMIT 1",
      [post_id, req.user.id]
    );

    if (existing.length > 0) {
      // Unlike
      await pool.query("DELETE FROM community_likes WHERE post_id = ? AND user_id = ?", [post_id, req.user.id]);
      await pool.query("UPDATE community_posts SET likes = GREATEST(likes - 1, 0) WHERE id = ?", [post_id]);
      return res.json({ data: { liked: false } });
    } else {
      // Like
      await pool.query(
        "INSERT INTO community_likes (id, post_id, user_id) VALUES (?, ?, ?)",
        [uuidv4(), post_id, req.user.id]
      );
      await pool.query("UPDATE community_posts SET likes = likes + 1 WHERE id = ?", [post_id]);
      return res.json({ data: { liked: true } });
    }
  } catch (err) {
    console.error("[rpc/like_community_post]", err);
    return res.status(500).json({ error: err?.message || "Error" });
  }
});

app.post("/api/rpc/increment_reply_count", authMiddleware, async (req, res) => {
  try {
    const { post_id } = req.body || {};
    if (!post_id) return res.status(400).json({ error: "post_id required" });
    await pool.query("UPDATE community_posts SET replies_count = replies_count + 1 WHERE id = ?", [post_id]);
    return res.json({ data: { success: true } });
  } catch (err) {
    console.error("[rpc/increment_reply_count]", err);
    return res.status(500).json({ error: err?.message || "Error" });
  }
});

app.post("/api/rpc/community_mentionable_users", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT a.author_name, p.user_id, p.club, p.role
       FROM (
         SELECT author_name, user_id FROM community_posts
         UNION
         SELECT author_name, user_id FROM community_replies
       ) AS a
       LEFT JOIN profiles p ON p.user_id = a.user_id
       ORDER BY a.author_name`
    );
    return res.json({ data: rows });
  } catch (err) {
    console.error("[rpc/community_mentionable_users]", err);
    return res.status(500).json({ error: err?.message || "Error" });
  }
});

// ── Community: delete post (author or admin) ─────────────────────────────
app.delete("/api/community/posts/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query("SELECT user_id FROM community_posts WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Post introuvable" });
    const isAuthor = rows[0].user_id === req.user.id;
    const [adminRows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    const isAdmin = adminRows.length > 0;
    if (!isAuthor && !isAdmin) return res.status(403).json({ error: "Non autorisé" });
    await pool.query("DELETE FROM community_likes WHERE post_id = ?", [id]);
    await pool.query("DELETE FROM community_replies WHERE post_id = ?", [id]);
    await pool.query("DELETE FROM community_posts WHERE id = ?", [id]);
    return res.json({ success: true });
  } catch (err) {
    console.error("[community/posts DELETE]", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Community: delete reply (author or admin) ────────────────────────────
app.delete("/api/community/replies/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query("SELECT user_id, post_id FROM community_replies WHERE id = ? LIMIT 1", [id]);
    if (!rows.length) return res.status(404).json({ error: "Réponse introuvable" });
    const isAuthor = rows[0].user_id === req.user.id;
    const [adminRows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    const isAdmin = adminRows.length > 0;
    if (!isAuthor && !isAdmin) return res.status(403).json({ error: "Non autorisé" });
    const postId = rows[0].post_id;
    await pool.query("DELETE FROM community_replies WHERE id = ?", [id]);
    await pool.query("UPDATE community_posts SET replies_count = GREATEST(replies_count - 1, 0) WHERE id = ?", [postId]);
    return res.json({ success: true });
  } catch (err) {
    console.error("[community/replies DELETE]", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Community: increment view count ─────────────────────────────────────
app.post("/api/community/posts/:id/view", authMiddleware, async (req, res) => {
  try {
    await pool.query("UPDATE community_posts SET views = views + 1 WHERE id = ?", [req.params.id]);
    return res.json({ ok: true });
  } catch { return res.json({ ok: false }); }
});

// ── Community: bulk moderation (admin + mod) ─────────────────────────────
app.post("/api/community/bulk", authMiddleware, async (req, res) => {
  const { ids, action, value } = req.body || {};
  if (!ids?.length || !action) return res.status(400).json({ error: "ids et action requis" });

  // Check admin or moderator role
  const [roleRows] = await pool.query(
    "SELECT id FROM user_roles WHERE user_id = ? AND role IN ('admin','moderateur') LIMIT 1",
    [req.user.id]
  );
  if (!roleRows.length) return res.status(403).json({ error: "Réservé aux admins et modérateurs" });

  try {
    const placeholders = ids.map(() => '?').join(',');
    switch (action) {
      case 'archive':
        await pool.query(`UPDATE community_posts SET is_archived = ? WHERE id IN (${placeholders})`, [value ? 1 : 0, ...ids]);
        break;
      case 'pin':
        await pool.query(`UPDATE community_posts SET is_pinned = ? WHERE id IN (${placeholders})`, [value ? 1 : 0, ...ids]);
        break;
      case 'priority_up':
        for (const id of ids) {
          await pool.query("UPDATE community_posts SET display_order = display_order + 1 WHERE id = ?", [id]);
        }
        break;
      case 'priority_down':
        for (const id of ids) {
          await pool.query("UPDATE community_posts SET display_order = GREATEST(display_order - 1, 0) WHERE id = ?", [id]);
        }
        break;
      case 'delete':
        await pool.query(`DELETE FROM community_replies WHERE post_id IN (${placeholders})`, ids);
        await pool.query(`DELETE FROM community_posts WHERE id IN (${placeholders})`, ids);
        break;
      default:
        return res.status(400).json({ error: "Action inconnue" });
    }
    return res.json({ ok: true, count: ids.length });
  } catch (err) {
    console.error("[community/bulk]", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Community: admin clear all ───────────────────────────────────────────
app.post("/api/admin/community/clear-all", authMiddleware, async (req, res) => {
  const [adminRows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
  if (!adminRows.length) return res.status(403).json({ error: "Forbidden" });
  try {
    await pool.query("DELETE FROM community_likes");
    await pool.query("DELETE FROM community_replies");
    await pool.query("DELETE FROM community_posts");
    return res.json({ success: true });
  } catch (err) {
    console.error("[admin/community/clear-all]", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Wyscout position → app position mapping ────────────────────────────────
// ── Wyscout helpers ─────────────────────────────────────────────────────────
const WYSCOUT_POS_MAP = {
  GK: { position: 'GK', zone: 'Gardien' },
  CB: { position: 'DC', zone: 'Défenseur' }, LCB: { position: 'DC', zone: 'Défenseur' }, RCB: { position: 'DC', zone: 'Défenseur' },
  LB: { position: 'LG', zone: 'Défenseur' }, LWB: { position: 'LG', zone: 'Défenseur' },
  RB: { position: 'LD', zone: 'Défenseur' }, RWB: { position: 'LD', zone: 'Défenseur' },
  DMF: { position: 'MDef', zone: 'Milieu' }, LDMF: { position: 'MDef', zone: 'Milieu' }, RDMF: { position: 'MDef', zone: 'Milieu' },
  CMF: { position: 'MC', zone: 'Milieu' }, LCMF: { position: 'MC', zone: 'Milieu' }, RCMF: { position: 'MC', zone: 'Milieu' },
  AMF: { position: 'MO', zone: 'Milieu' }, LAMF: { position: 'AG', zone: 'Milieu' }, RAMF: { position: 'AD', zone: 'Milieu' },
  LMF: { position: 'AG', zone: 'Milieu' }, RMF: { position: 'AD', zone: 'Milieu' },
  LW: { position: 'AG', zone: 'Attaquant' }, RW: { position: 'AD', zone: 'Attaquant' }, WF: { position: 'MO', zone: 'Milieu' },
  CF: { position: 'ATT', zone: 'Attaquant' }, SS: { position: 'ATT', zone: 'Attaquant' }, ST: { position: 'ATT', zone: 'Attaquant' },
};

function mapWyscoutFoot(foot) {
  if (!foot) return 'Droitier';
  const f = String(foot).toLowerCase().trim();
  if (f === 'left' || f === 'gauche') return 'Gaucher';
  if (f === 'both' || f === 'both feet' || f === 'ambidextre') return 'Ambidextre';
  return 'Droitier';
}
function mapWyscoutMarketValue(val) {
  const n = Number(val);
  if (!n || isNaN(n)) return null;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M€`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K€`;
  return `${n}€`;
}
function mapWyscoutContractDate(val) {
  if (!val || val === '') return null;
  const n = Number(val);
  if (!isNaN(n) && n > 1900 && n < 2100 && String(val).length === 4) return `${n}-06-30`;
  if (typeof val === 'string' && val.match(/^\d{4}-\d{2}-\d{2}$/)) return val;
  if (!isNaN(n) && n > 40000) return new Date(Math.round((n - 25569) * 86400 * 1000)).toISOString().slice(0, 10);
  return null;
}
function wyscoutNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// Complete mapping: Excel column → DB column in player_wyscout_stats
// type 'int' = integer count, 'dec' = DECIMAL stat
const WYSCOUT_STATS_MAP = [
  // Base
  { e: 'Matches played',                   db: 'matches_played',                       t: 'int' },
  { e: 'Minutes played',                   db: 'minutes_played',                       t: 'int' },
  { e: 'Goals',                            db: 'goals',                                t: 'int' },
  { e: 'xG',                               db: 'xg',                                   t: 'dec' },
  { e: 'Assists',                          db: 'assists',                              t: 'int' },
  { e: 'xA',                               db: 'xa',                                   t: 'dec' },
  { e: 'Yellow cards',                     db: 'yellow_cards',                         t: 'int' },
  { e: 'Red cards',                        db: 'red_cards',                            t: 'int' },
  { e: 'Shots',                            db: 'shots',                                t: 'int' },
  { e: 'Non-penalty goals',                db: 'np_goals',                             t: 'int' },
  { e: 'Head goals',                       db: 'head_goals',                           t: 'int' },
  { e: 'Conceded goals',                   db: 'conceded_goals',                       t: 'int' },
  { e: 'Shots against',                    db: 'shots_against',                        t: 'int' },
  { e: 'Clean sheets',                     db: 'clean_sheets',                         t: 'int' },
  { e: 'Penalties taken',                  db: 'penalties_taken',                      t: 'int' },
  // Defensive per-90
  { e: 'Duels per 90',                     db: 'duels_per90',                          t: 'dec' },
  { e: 'Duels won, %',                     db: 'duels_won_pct',                        t: 'dec' },
  { e: 'Successful defensive actions per 90', db: 'defensive_actions_per90',           t: 'dec' },
  { e: 'Defensive duels per 90',           db: 'defensive_duels_per90',                t: 'dec' },
  { e: 'Defensive duels won, %',           db: 'defensive_duels_won_pct',              t: 'dec' },
  { e: 'Aerial duels per 90',              db: 'aerial_duels_per90',                   t: 'dec' },
  { e: 'Aerial duels won, %',              db: 'aerial_duels_won_pct',                 t: 'dec' },
  { e: 'Sliding tackles per 90',           db: 'sliding_tackles_per90',                t: 'dec' },
  { e: 'PAdj Sliding tackles',             db: 'padj_sliding_tackles',                 t: 'dec' },
  { e: 'Shots blocked per 90',             db: 'shots_blocked_per90',                  t: 'dec' },
  { e: 'Interceptions per 90',             db: 'interceptions_per90',                  t: 'dec' },
  { e: 'PAdj Interceptions',               db: 'padj_interceptions',                   t: 'dec' },
  { e: 'Fouls per 90',                     db: 'fouls_per90',                          t: 'dec' },
  { e: 'Yellow cards per 90',              db: 'yellow_cards_per90',                   t: 'dec' },
  { e: 'Red cards per 90',                 db: 'red_cards_per90',                      t: 'dec' },
  // Attacking per-90
  { e: 'Successful attacking actions per 90', db: 'attacking_actions_per90',           t: 'dec' },
  { e: 'Goals per 90',                     db: 'goals_per90',                          t: 'dec' },
  { e: 'Non-penalty goals per 90',         db: 'np_goals_per90',                       t: 'dec' },
  { e: 'xG per 90',                        db: 'xg_per90',                             t: 'dec' },
  { e: 'Head goals per 90',                db: 'head_goals_per90',                     t: 'dec' },
  { e: 'Shots per 90',                     db: 'shots_per90',                          t: 'dec' },
  { e: 'Shots on target, %',               db: 'shots_on_target_pct',                  t: 'dec' },
  { e: 'Goal conversion, %',               db: 'goal_conversion_pct',                  t: 'dec' },
  { e: 'Assists per 90',                   db: 'assists_per90',                        t: 'dec' },
  { e: 'xA per 90',                        db: 'xa_per90',                             t: 'dec' },
  { e: 'Crosses per 90',                   db: 'crosses_per90',                        t: 'dec' },
  { e: 'Accurate crosses, %',              db: 'crosses_accurate_pct',                 t: 'dec' },
  { e: 'Crosses from left flank per 90',   db: 'crosses_left_per90',                   t: 'dec' },
  { e: 'Accurate crosses from left flank, %', db: 'crosses_left_accurate_pct',         t: 'dec' },
  { e: 'Crosses from right flank per 90',  db: 'crosses_right_per90',                  t: 'dec' },
  { e: 'Accurate crosses from right flank, %', db: 'crosses_right_accurate_pct',       t: 'dec' },
  { e: 'Crosses to goalie box per 90',     db: 'crosses_to_box_per90',                 t: 'dec' },
  { e: 'Dribbles per 90',                  db: 'dribbles_per90',                       t: 'dec' },
  { e: 'Successful dribbles, %',           db: 'dribbles_success_pct',                 t: 'dec' },
  { e: 'Offensive duels per 90',           db: 'offensive_duels_per90',                t: 'dec' },
  { e: 'Offensive duels won, %',           db: 'offensive_duels_won_pct',              t: 'dec' },
  { e: 'Touches in box per 90',            db: 'touches_in_box_per90',                 t: 'dec' },
  { e: 'Progressive runs per 90',          db: 'progressive_runs_per90',               t: 'dec' },
  { e: 'Accelerations per 90',             db: 'accelerations_per90',                  t: 'dec' },
  { e: 'Received passes per 90',           db: 'received_passes_per90',                t: 'dec' },
  { e: 'Received long passes per 90',      db: 'received_long_passes_per90',           t: 'dec' },
  { e: 'Fouls suffered per 90',            db: 'fouls_suffered_per90',                 t: 'dec' },
  // Passing
  { e: 'Passes per 90',                    db: 'passes_per90',                         t: 'dec' },
  { e: 'Accurate passes, %',               db: 'passes_accurate_pct',                  t: 'dec' },
  { e: 'Forward passes per 90',            db: 'forward_passes_per90',                 t: 'dec' },
  { e: 'Accurate forward passes, %',       db: 'forward_passes_accurate_pct',          t: 'dec' },
  { e: 'Back passes per 90',               db: 'back_passes_per90',                    t: 'dec' },
  { e: 'Accurate back passes, %',          db: 'back_passes_accurate_pct',             t: 'dec' },
  { e: 'Lateral passes per 90',            db: 'lateral_passes_per90',                 t: 'dec' },
  { e: 'Accurate lateral passes, %',       db: 'lateral_passes_accurate_pct',          t: 'dec' },
  { e: 'Short / medium passes per 90',     db: 'short_medium_passes_per90',            t: 'dec' },
  { e: 'Accurate short / medium passes, %', db: 'short_medium_passes_accurate_pct',    t: 'dec' },
  { e: 'Long passes per 90',               db: 'long_passes_per90',                    t: 'dec' },
  { e: 'Accurate long passes, %',          db: 'long_passes_accurate_pct',             t: 'dec' },
  { e: 'Average pass length, m',           db: 'avg_pass_length',                      t: 'dec' },
  { e: 'Average long pass length, m',      db: 'avg_long_pass_length',                 t: 'dec' },
  { e: 'Shot assists per 90',              db: 'shot_assists_per90',                   t: 'dec' },
  { e: 'Second assists per 90',            db: 'second_assists_per90',                 t: 'dec' },
  { e: 'Third assists per 90',             db: 'third_assists_per90',                  t: 'dec' },
  { e: 'Smart passes per 90',              db: 'smart_passes_per90',                   t: 'dec' },
  { e: 'Accurate smart passes, %',         db: 'smart_passes_accurate_pct',            t: 'dec' },
  { e: 'Key passes per 90',                db: 'key_passes_per90',                     t: 'dec' },
  { e: 'Passes to final third per 90',     db: 'passes_final_third_per90',             t: 'dec' },
  { e: 'Accurate passes to final third, %', db: 'passes_final_third_accurate_pct',     t: 'dec' },
  { e: 'Passes to penalty area per 90',    db: 'passes_penalty_area_per90',            t: 'dec' },
  { e: 'Accurate passes to penalty area, %', db: 'passes_penalty_area_accurate_pct',   t: 'dec' },
  { e: 'Through passes per 90',            db: 'through_passes_per90',                 t: 'dec' },
  { e: 'Accurate through passes, %',       db: 'through_passes_accurate_pct',          t: 'dec' },
  { e: 'Deep completions per 90',          db: 'deep_completions_per90',               t: 'dec' },
  { e: 'Deep completed crosses per 90',    db: 'deep_completed_crosses_per90',         t: 'dec' },
  { e: 'Progressive passes per 90',        db: 'progressive_passes_per90',             t: 'dec' },
  { e: 'Accurate progressive passes, %',   db: 'progressive_passes_accurate_pct',      t: 'dec' },
  // Set pieces
  { e: 'Free kicks per 90',                db: 'free_kicks_per90',                     t: 'dec' },
  { e: 'Direct free kicks per 90',         db: 'direct_free_kicks_per90',              t: 'dec' },
  { e: 'Direct free kicks on target, %',   db: 'direct_free_kicks_on_target_pct',      t: 'dec' },
  { e: 'Corners per 90',                   db: 'corners_per90',                        t: 'dec' },
  { e: 'Penalty conversion, %',            db: 'penalty_conversion_pct',               t: 'dec' },
  // Goalkeeper
  { e: 'Conceded goals per 90',            db: 'conceded_goals_per90',                 t: 'dec' },
  { e: 'Shots against per 90',             db: 'shots_against_per90',                  t: 'dec' },
  { e: 'Save rate, %',                     db: 'save_rate_pct',                        t: 'dec' },
  { e: 'xG against',                       db: 'xg_against',                           t: 'dec' },
  { e: 'xG against per 90',               db: 'xg_against_per90',                     t: 'dec' },
  { e: 'Prevented goals',                  db: 'prevented_goals',                      t: 'dec' },
  { e: 'Prevented goals per 90',           db: 'prevented_goals_per90',                t: 'dec' },
  { e: 'Back passes received as GK per 90', db: 'gk_back_passes_per90',                t: 'dec' },
  { e: 'Exits per 90',                     db: 'gk_exits_per90',                       t: 'dec' },
  { e: 'Aerial duels per 90.1',            db: 'gk_aerial_duels_per90',                t: 'dec' },
  // Physical / athletic
  { e: 'Total Distance per 90',            db: 'total_distance_per90',                 t: 'dec' },
  { e: 'Running Distance per 90 (15-20 km/h)', db: 'running_distance_per90',           t: 'dec' },
  { e: 'HSR Distance per 90 (20-25 km/h)', db: 'hsr_distance_per90',                  t: 'dec' },
  { e: 'Sprinting Distance per 90 (+25 km/h)', db: 'sprint_distance_per90',            t: 'dec' },
  { e: 'HI Distance per 90 (+20 km/h)',    db: 'hi_distance_per90',                    t: 'dec' },
  { e: 'Meter/Min',                        db: 'meters_per_min',                       t: 'dec' },
  { e: 'Max Speed (km/h)',                 db: 'max_speed',                            t: 'dec' },
  { e: 'Count Medium Acceleration per 90 (1.5 m/s² to 3 m/s²)', db: 'medium_accel_per90', t: 'dec' },
  { e: 'Count High Acceleration per 90 (+3 m/s²)',               db: 'high_accel_per90',   t: 'dec' },
  { e: 'Count Medium Deceleration per 90 (-1.5 m/s² to -3 m/s²)', db: 'medium_decel_per90', t: 'dec' },
  { e: 'Count High Deceleration per 90 (-3 m/s²)',               db: 'high_decel_per90',   t: 'dec' },
  { e: 'Count HSR per 90 (20-25 km/h)',    db: 'hsr_count_per90',                      t: 'dec' },
  { e: 'Count Sprint per 90 (+25 km/h)',   db: 'sprint_count_per90',                   t: 'dec' },
  { e: 'Count HI per 90 (+20 km/h)',       db: 'hi_count_per90',                       t: 'dec' },
];

// ── POST /api/import/wyscout ────────────────────────────────────────────────
// Accepts multipart file upload (xlsx/xls/csv) to avoid JSON payload size limits
const wyscoutUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB file limit
  fileFilter: (_req, file, cb) => {
    if (/\.(xlsx|xls|csv)$/i.test(file.originalname)) cb(null, true);
    else cb(new Error('Format de fichier non supporté. Utilisez .xlsx, .xls ou .csv'));
  },
});

// Multer error handler — converts multer errors to JSON so the client can display them
function wyscoutUploadMiddleware(req, res, next) {
  wyscoutUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `Fichier trop volumineux (limite : 25 Mo). Découpez le fichier en plusieurs parties.`
      : err.message || 'Erreur lors de la réception du fichier.';
    return res.status(400).json({ error: msg });
  });
}

app.post("/api/import/wyscout", authMiddleware, wyscoutUploadMiddleware, async (req, res) => {
  const t0 = Date.now();
  const log = (msg) => console.log(`[import/wyscout ${Date.now()-t0}ms] ${msg}`);

  try {
  // ── Auth check ──────────────────────────────────────────────────────────────
  log('auth check');
  const [roleRows] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
  const roles = roleRows.map(r => r.role);
  if (!roles.includes('admin') && !roles.includes('importateur'))
    return res.status(403).json({ error: "Accès refusé. Rôle importateur requis." });

  if (!req.file)
    return res.status(400).json({ error: "Fichier requis (xlsx, xls ou csv)." });

  log(`file received: ${req.file.originalname} (${(req.file.size/1024/1024).toFixed(1)} Mo)`);

  // ── Parse Excel ──────────────────────────────────────────────────────────────
  let rows;
  try {
    const wb = XLSXLib.read(req.file.buffer, { type: 'buffer' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSXLib.utils.sheet_to_json(ws, { defval: '' });
  } catch (e) {
    log(`XLSX parse error: ${e.message}`);
    return res.status(400).json({ error: "Impossible de lire le fichier Excel : " + e.message });
  }

  if (!Array.isArray(rows) || rows.length === 0)
    return res.status(400).json({ error: "Le fichier est vide." });
  if (rows.length > 50000)
    return res.status(400).json({ error: `Fichier trop volumineux : ${rows.length} joueurs. Maximum 50 000 par import.` });

  log(`parsed ${rows.length} rows, ${Object.keys(rows[0]||{}).length} columns`);

  const importerId = req.user.id;
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const errors = [];

  log('step 1: building memory records');
  // ── STEP 1 — Parse all rows into in-memory records with a global dedup_key.
  // dedup_key = normalizeStr(name) + "|" + generation. The catalogue is
  // shared across all accounts (see wyscout_players migration), so each
  // (name, birth-year) pair maps to a single global row.
  const playerRecs = []; // identity / bio
  const statsRecs  = []; // one per (player, season, division) row from the file

  for (const row of rows) {
    const playerName = String(row['Player'] || '').trim();
    if (!playerName) continue;

    const club           = String(row['Team'] || '').trim();
    const teamInTF       = String(row['Team within selected timeframe'] || '').trim() || null;
    const rawPos         = String(row['Position'] || '').trim().toUpperCase();
    const posMap         = WYSCOUT_POS_MAP[rawPos] || { position: 'MC', zone: 'Milieu' };
    const season         = String(row['season'] || '').trim();
    const division       = String(row['division'] || '').trim();
    const continent      = String(row['continent'] || '').trim() || null;
    const country        = String(row['country'] || '').trim() || null;
    const countryRaw     = String(row['country_raw'] || '').trim() || null;
    const yearStart      = parseInt(row['year_start']) || null;
    const yearEnd        = parseInt(row['year_end']) || null;
    const srcFilename    = String(row['filename'] || '').trim() || null;
    const srcFilePath    = String(row['source_file'] || '').trim() || null;
    const height         = parseInt(row['Height']) || null;
    const weight         = parseInt(row['Weight']) || null;
    const onLoan         = String(row['On loan'] || '').toLowerCase() === 'yes' ? 1 : 0;
    const passportCountry = String(row['Passport country'] || '').trim() || null;
    const marketValue    = mapWyscoutMarketValue(row['Market value']);
    const contractEnd    = mapWyscoutContractDate(row['Contract expires']);
    const foot           = mapWyscoutFoot(row['Foot']);
    const nationality    = String(row['Birth country'] || '').trim() || null;
    const age            = parseInt(row['Age']) || null;
    const generation     = age && yearStart ? (yearStart - age) : null;
    const matchesPlayed  = parseInt(row['Matches played']) || null;
    const minutesPlayed  = parseInt(row['Minutes played']) || null;

    const nm = normalizeStr(playerName);
    if (!nm) continue;
    const dedupKey = `${nm}|${generation ?? 0}`.slice(0, 191);

    playerRecs.push({
      id: uuidv4(), // tentative — real id resolved post-upsert via dedup_key
      dedupKey,
      name: playerName,
      club: club || null,
      teamInTF,
      league: resolveLeagueByClub(club) || null,
      position: posMap.position, zone: posMap.zone,
      nationality, passportCountry, foot, generation,
      height, weight, onLoan, matchesPlayed, minutesPlayed,
      marketValue, contractEnd,
      wyscoutSeason: season, wyscoutDivision: division,
    });

    const statVals = WYSCOUT_STATS_MAP.map(({ e }) => wyscoutNum(row[e]));
    statsRecs.push({
      id: uuidv4(),
      dedupKey,
      season, division, club,
      continent, country, countryRaw,
      yearStart, yearEnd, srcFilename, srcFilePath,
      statVals,
    });
  }

  log(`step 1 done: ${playerRecs.length} player records, ${statsRecs.length} stats records`);
  log('step 2: upserting wyscout_players');
  // ── STEP 2 — UPSERT into the global wyscout_players catalogue.
  // De-dupe within the file first (same player may appear across multiple
  // seasons/divisions) so we only emit one UPSERT row per dedup_key.
  const seenKeys = new Set();
  const uniquePlayerRecs = [];
  for (const r of playerRecs) {
    if (seenKeys.has(r.dedupKey)) continue;
    seenKeys.add(r.dedupKey);
    uniquePlayerRecs.push(r);
  }

  const PLAYER_CHUNK = 500;
  const playerCols = [
    'id', 'dedup_key', 'name', 'club', 'team_in_timeframe', 'league',
    'position', 'zone', 'foot', 'nationality', 'passport_country',
    'generation', 'height', 'weight', 'on_loan', 'matches_played',
    'minutes_played', 'market_value', 'contract_end',
    'wyscout_season', 'wyscout_division', 'imported_by',
    'created_at', 'updated_at',
  ];
  const playerUpdateCols = [
    'name', 'club', 'team_in_timeframe', 'league', 'position', 'zone',
    'foot', 'nationality', 'passport_country', 'generation', 'height',
    'weight', 'on_loan', 'matches_played', 'minutes_played',
    'market_value', 'contract_end', 'wyscout_season', 'wyscout_division',
    'imported_by', 'updated_at',
  ];

  // Pre-fetch which dedup_keys already exist so we can report created vs updated.
  const allDedupKeys = [...seenKeys];
  const existingKeys = new Set();
  const KEY_CHUNK = 1000;
  for (let i = 0; i < allDedupKeys.length; i += KEY_CHUNK) {
    const chunk = allDedupKeys.slice(i, i + KEY_CHUNK);
    if (!chunk.length) continue;
    const ph = chunk.map(() => '?').join(',');
    try {
      const [exRows] = await pool.query(
        `SELECT dedup_key FROM wyscout_players WHERE dedup_key IN (${ph})`,
        chunk
      );
      for (const r of exRows) existingKeys.add(r.dedup_key);
    } catch (err) {
      log(`pre-check failed (proceeding): ${err?.message}`);
    }
  }

  let upsertCount = 0;
  for (let i = 0; i < uniquePlayerRecs.length; i += PLAYER_CHUNK) {
    const chunk = uniquePlayerRecs.slice(i, i + PLAYER_CHUNK);
    if (!chunk.length) continue;

    const rowPlaceholders = chunk.map(() => `(${playerCols.map(() => '?').join(',')})`).join(',');
    const updateClause = playerUpdateCols.map(c => `${c} = VALUES(${c})`).join(', ');

    const vals = [];
    for (const r of chunk) {
      vals.push(
        r.id, r.dedupKey, r.name, r.club, r.teamInTF, r.league,
        r.position, r.zone, r.foot, r.nationality, r.passportCountry,
        r.generation, r.height, r.weight, r.onLoan, r.matchesPlayed,
        r.minutesPlayed, r.marketValue, r.contractEnd,
        r.wyscoutSeason, r.wyscoutDivision, importerId,
        now, now,
      );
    }

    try {
      await pool.query(
        `INSERT INTO wyscout_players (${playerCols.join(',')}) VALUES ${rowPlaceholders}
         ON DUPLICATE KEY UPDATE ${updateClause}`,
        vals
      );
      upsertCount += chunk.length;
    } catch (err) {
      for (const r of chunk) errors.push({ name: r.name, error: err?.message });
    }
  }

  const created = uniquePlayerRecs.filter(r => !existingKeys.has(r.dedupKey)).length;
  const updated = uniquePlayerRecs.length - created;

  // Resolve dedup_key → actual wyscout_player_id so we can attach stats below.
  log('step 2.5: resolving wyscout_player_ids');
  const dedupKeyToId = new Map();
  for (let i = 0; i < allDedupKeys.length; i += KEY_CHUNK) {
    const chunk = allDedupKeys.slice(i, i + KEY_CHUNK);
    if (!chunk.length) continue;
    const ph = chunk.map(() => '?').join(',');
    const [resolved] = await pool.query(
      `SELECT id, dedup_key FROM wyscout_players WHERE dedup_key IN (${ph})`,
      chunk
    );
    for (const r of resolved) dedupKeyToId.set(r.dedup_key, r.id);
  }
  log(`step 2 done: ${upsertCount} upserts (${created} new, ${updated} updated), ${dedupKeyToId.size} ids resolved`);

  log('step 3: upserting wyscout_player_stats');
  // ── STEP 3 — UPSERT stats. Same column layout as the legacy per-user table,
  // but keyed on wyscout_player_id (no user scoping).
  const STATS_CHUNK = 150;
  const statFixedCols = [
    'id', 'wyscout_player_id', 'season', 'division', 'team',
    'continent', 'country', 'country_raw', 'year_start', 'year_end',
    'source_filename', 'source_file_path',
  ];
  const statDynCols = WYSCOUT_STATS_MAP.map(({ db }) => db);
  const allStatCols = [...statFixedCols, ...statDynCols];
  const statUpdateClause = [
    ...statDynCols.map(c => `${c} = VALUES(${c})`),
    'team = VALUES(team)', 'continent = VALUES(continent)',
    'country = VALUES(country)', 'year_start = VALUES(year_start)',
    'year_end = VALUES(year_end)', 'source_filename = VALUES(source_filename)',
    'source_file_path = VALUES(source_file_path)', 'updated_at = NOW()',
  ].join(', ');

  let statsUpserted = 0;
  for (let i = 0; i < statsRecs.length; i += STATS_CHUNK) {
    const chunk = statsRecs.slice(i, i + STATS_CHUNK);
    if (!chunk.length) continue;

    const resolved = chunk
      .map(s => ({ ...s, wyscoutPlayerId: dedupKeyToId.get(s.dedupKey) }))
      .filter(s => s.wyscoutPlayerId);
    if (!resolved.length) continue;

    const rowPlaceholders = resolved.map(() => `(${allStatCols.map(() => '?').join(',')})`).join(',');
    const vals = [];
    for (const s of resolved) {
      vals.push(
        s.id, s.wyscoutPlayerId,
        s.season, s.division, s.club,
        s.continent, s.country, s.countryRaw,
        s.yearStart, s.yearEnd,
        s.srcFilename, s.srcFilePath,
        ...s.statVals,
      );
    }

    try {
      await pool.query(
        `INSERT INTO wyscout_player_stats (${allStatCols.join(',')}) VALUES ${rowPlaceholders}
         ON DUPLICATE KEY UPDATE ${statUpdateClause}`,
        vals
      );
      statsUpserted += resolved.length;
    } catch (err) {
      for (const s of resolved) errors.push({ name: s.wyscoutPlayerId, error: 'stats: ' + err?.message });
    }
  }

  const durationMs = Date.now() - t0;
  log(`step 3 done — total ${durationMs}ms. created=${created} updated=${updated} stats=${statsUpserted} errors=${errors.length}`);

  const bioErrors  = errors.filter(e => !e.error?.startsWith('stats:'));
  const statErrors = errors.filter(e =>  e.error?.startsWith('stats:'));
  return res.json({
    created, updated, linked: 0, total: rows.length,
    stats: statsUpserted,
    errors: bioErrors,
    statErrors: statErrors.length,
    durationMs,
  });

  } catch (fatalErr) {
    const durationMs = Date.now() - t0;
    console.error(`[import/wyscout] FATAL after ${durationMs}ms:`, fatalErr?.message || fatalErr);
    if (!res.headersSent)
      return res.status(500).json({
        error: `Erreur serveur lors de l'import (${durationMs}ms) : ${fatalErr?.message || 'Erreur inconnue'}`,
        hint: 'Consultez les logs du serveur pour plus de détails (npm run api).',
      });
  }
});

// ── Global WyScout catalogue read endpoints ─────────────────────────────────
// Backs the /data page (PlayerCompare.tsx). All authenticated users can read.

// GET /api/wyscout/search?q=...&position=...&limit=50&offset=0
// Fuzzy match on name+club via normalizeStr()-style accent-insensitive LIKE.
app.get('/api/wyscout/search', authMiddleware, async (req, res) => {
  const q = String(req.query.q || '').trim();
  const position = String(req.query.position || '').trim();
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 50, 1), 200);
  const offset = Math.max(parseInt(req.query.offset) || 0, 0);

  const where = [];
  const params = [];
  if (q) {
    const like = `%${q}%`;
    where.push('(name LIKE ? OR club LIKE ?)');
    params.push(like, like);
  }
  if (position) {
    where.push('position = ?');
    params.push(position);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows] = await pool.query(
      `SELECT id, name, club, team_in_timeframe, league, position, zone,
              foot, nationality, passport_country, generation, height, weight,
              on_loan, matches_played, minutes_played, market_value, contract_end,
              photo_url, wyscout_season, wyscout_division, updated_at
       FROM wyscout_players ${whereSql}
       ORDER BY name ASC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM wyscout_players ${whereSql}`,
      params
    );
    return res.json({ results: rows, total: Number(total), limit, offset });
  } catch (err) {
    console.warn('[api/wyscout/search] error:', err?.message);
    return res.status(500).json({ error: 'Erreur lors de la recherche.' });
  }
});

// GET /api/wyscout/players/:id — identity + list of available (season, division) tuples
app.get('/api/wyscout/players/:id', authMiddleware, async (req, res) => {
  try {
    const [[player]] = await pool.query(
      `SELECT id, name, club, team_in_timeframe, league, position, zone,
              foot, nationality, passport_country, generation, height, weight,
              on_loan, matches_played, minutes_played, market_value, contract_end,
              photo_url, wyscout_season, wyscout_division, created_at, updated_at
       FROM wyscout_players WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!player) return res.status(404).json({ error: 'Joueur introuvable.' });

    const [seasons] = await pool.query(
      `SELECT season, division, team, matches_played, minutes_played
       FROM wyscout_player_stats WHERE wyscout_player_id = ?
       ORDER BY season DESC, division ASC`,
      [req.params.id]
    );

    return res.json({ player, seasons });
  } catch (err) {
    console.warn('[api/wyscout/players/:id] error:', err?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/wyscout/players/:id/stats?season=...&division=...&all=1
// Without filters or with all=1 → returns every (season, division) row as
// { rows: [...] } so the Data page can drive its own filters/aggregation.
// With season/division → returns the single matching row as { stats: {...} }
// (kept for the catalog dialog and the radar-by-season usage).
// Each row exposes player_id (= wyscout_player_id) so it stays compatible
// with the WyscoutStatRow type the analysis libs already consume.
app.get('/api/wyscout/players/:id/stats', authMiddleware, async (req, res) => {
  const season = String(req.query.season || '').trim();
  const division = String(req.query.division || '').trim();
  const wantAll = String(req.query.all || '') === '1' || (!season && !division);

  try {
    if (wantAll) {
      const [rows] = await pool.query(
        `SELECT *, wyscout_player_id AS player_id
         FROM wyscout_player_stats
         WHERE wyscout_player_id = ?
         ORDER BY season DESC, division ASC`,
        [req.params.id]
      );
      return res.json({ rows });
    }

    let sql = `SELECT *, wyscout_player_id AS player_id FROM wyscout_player_stats WHERE wyscout_player_id = ?`;
    const params = [req.params.id];
    if (season) { sql += ' AND season = ?'; params.push(season); }
    if (division) { sql += ' AND division = ?'; params.push(division); }
    sql += ' ORDER BY season DESC, division ASC LIMIT 1';

    const [[stats]] = await pool.query(sql, params);
    if (!stats) return res.status(404).json({ error: 'Statistiques introuvables.' });
    return res.json({ stats });
  } catch (err) {
    console.warn('[api/wyscout/players/:id/stats] error:', err?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/wyscout/benchmarks?position=&division=&minMinutes=600
// Average stats across all global WyScout players matching the filter. Cached
// in-memory for 10 minutes per (position,division,minMinutes) tuple — the
// catalogue is admin-imported so it rarely changes between requests.
const WYSCOUT_BENCHMARK_CACHE = new Map();
const WYSCOUT_BENCHMARK_TTL_MS = 10 * 60 * 1000;
const WYSCOUT_BENCHMARK_COLS = [
  'matches_played', 'minutes_played', 'goals', 'xg', 'assists', 'xa',
  'shots', 'goals_per90', 'np_goals_per90', 'xg_per90', 'shots_per90',
  'shots_on_target_pct', 'goal_conversion_pct', 'assists_per90', 'xa_per90',
  'crosses_per90', 'crosses_accurate_pct', 'dribbles_per90', 'dribbles_success_pct',
  'offensive_duels_per90', 'offensive_duels_won_pct', 'touches_in_box_per90',
  'progressive_runs_per90', 'accelerations_per90', 'passes_per90',
  'passes_accurate_pct', 'forward_passes_per90', 'forward_passes_accurate_pct',
  'long_passes_per90', 'long_passes_accurate_pct', 'key_passes_per90',
  'smart_passes_per90', 'through_passes_per90', 'progressive_passes_per90',
  'passes_final_third_per90', 'passes_penalty_area_per90', 'shot_assists_per90',
  'defensive_actions_per90', 'defensive_duels_per90', 'defensive_duels_won_pct',
  'aerial_duels_per90', 'aerial_duels_won_pct', 'sliding_tackles_per90',
  'interceptions_per90', 'fouls_per90', 'duels_per90', 'duels_won_pct',
  'save_rate_pct', 'conceded_goals_per90', 'shots_against_per90', 'clean_sheets',
  'prevented_goals_per90', 'gk_exits_per90', 'gk_aerial_duels_per90',
  'total_distance_per90', 'max_speed', 'hi_distance_per90', 'sprint_distance_per90',
];
app.get('/api/wyscout/benchmarks', authMiddleware, async (req, res) => {
  const position = String(req.query.position || '').trim();
  const division = String(req.query.division || '').trim();
  const minMinutes = Math.max(parseInt(req.query.minMinutes) || 600, 0);

  const cacheKey = `${position}|${division}|${minMinutes}`;
  const cached = WYSCOUT_BENCHMARK_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < WYSCOUT_BENCHMARK_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const where = [];
    const params = [];
    if (position) {
      where.push('wp.position = ?');
      params.push(position);
    }
    if (division) {
      where.push('s.division = ?');
      params.push(division);
    }
    where.push('s.minutes_played >= ?');
    params.push(minMinutes);
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

    const avgCols = WYSCOUT_BENCHMARK_COLS.map(c => `AVG(s.${c}) AS ${c}`).join(', ');
    const sql = `
      SELECT COUNT(*) AS sample_size, ${avgCols}
      FROM wyscout_player_stats s
      JOIN wyscout_players wp ON wp.id = s.wyscout_player_id
      ${whereSql}
    `;

    const [[row]] = await pool.query(sql, params);
    const benchmark = {};
    for (const col of WYSCOUT_BENCHMARK_COLS) {
      const v = row[col];
      benchmark[col] = v === null || v === undefined ? null : Number(v);
    }
    const data = {
      position: position || null,
      division: division || null,
      minMinutes,
      sample_size: Number(row.sample_size) || 0,
      benchmark,
    };
    WYSCOUT_BENCHMARK_CACHE.set(cacheKey, { at: Date.now(), data });
    return res.json(data);
  } catch (err) {
    console.warn('[api/wyscout/benchmarks] error:', err?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/wyscout/peers?position=&division=&minMinutes=600&limit=500
// Returns a representative peer sample for similarity / percentile work.
// Each row is the *most-played* season of a wyscout_player, enriched with
// the player's name + club + position so the UI can render labels.
// Cached 10 min per (position, division, minMinutes, limit).
const WYSCOUT_PEERS_CACHE = new Map();
const WYSCOUT_PEERS_TTL_MS = 10 * 60 * 1000;
app.get('/api/wyscout/peers', authMiddleware, async (req, res) => {
  const position = String(req.query.position || '').trim();
  const division = String(req.query.division || '').trim();
  const minMinutes = Math.max(parseInt(req.query.minMinutes) || 600, 0);
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 500, 1), 2000);

  const cacheKey = `${position}|${division}|${minMinutes}|${limit}`;
  const cached = WYSCOUT_PEERS_CACHE.get(cacheKey);
  if (cached && Date.now() - cached.at < WYSCOUT_PEERS_TTL_MS) {
    return res.json(cached.data);
  }

  try {
    const where = [];
    const params = [];
    if (position) { where.push('wp.position = ?'); params.push(position); }
    if (division) { where.push('s.division = ?'); params.push(division); }
    where.push('s.minutes_played >= ?'); params.push(minMinutes);
    const whereSql = `WHERE ${where.join(' AND ')}`;

    // Keep only one (max-minutes) season per peer to avoid double counting.
    const [rows] = await pool.query(
      `SELECT s.*, s.wyscout_player_id AS player_id,
              wp.name, wp.position AS player_position, wp.club
       FROM wyscout_player_stats s
       JOIN wyscout_players wp ON wp.id = s.wyscout_player_id
       JOIN (
         SELECT wyscout_player_id, MAX(minutes_played) AS max_min
         FROM wyscout_player_stats
         WHERE minutes_played >= ?
         GROUP BY wyscout_player_id
       ) latest ON latest.wyscout_player_id = s.wyscout_player_id AND latest.max_min = s.minutes_played
       ${whereSql}
       ORDER BY s.minutes_played DESC
       LIMIT ?`,
      [minMinutes, ...params, limit]
    );
    const data = { position: position || null, division: division || null, minMinutes, count: rows.length, rows };
    WYSCOUT_PEERS_CACHE.set(cacheKey, { at: Date.now(), data });
    return res.json(data);
  } catch (err) {
    console.warn('[api/wyscout/peers] error:', err?.message);
    return res.status(500).json({ error: 'Erreur serveur.' });
  }
});

// GET /api/wyscout/players/:id/match-mine
// Helper for the player profile "Data" tab: tries to find this user's local
// player that corresponds to the given wyscout_player_id by name+generation.
// Used to wire the "Voir la data" link from the player profile back to /data.
app.get('/api/wyscout/match-local/:wyscoutId', authMiddleware, async (req, res) => {
  try {
    const [[wp]] = await pool.query(
      `SELECT name, generation FROM wyscout_players WHERE id = ? LIMIT 1`,
      [req.params.wyscoutId]
    );
    if (!wp) return res.json({ matched: null });
    // best-effort: same normalized name, same generation if available
    const [rows] = await pool.query(
      `SELECT id FROM players WHERE user_id = ? AND name = ? LIMIT 1`,
      [req.user.id, wp.name]
    );
    return res.json({ matched: rows[0]?.id || null });
  } catch (err) {
    console.warn('[api/wyscout/match-local] error:', err?.message);
    return res.json({ matched: null });
  }
});

// Reverse helper: from a local players.id, find the matching wyscout_players.id.
// Used by ProfileDataTab to surface a "Voir la data WyScout" link.
app.get('/api/wyscout/match-from-local/:playerId', authMiddleware, async (req, res) => {
  try {
    const [[lp]] = await pool.query(
      `SELECT name, generation FROM players WHERE id = ? AND (user_id = ?
         OR id IN (SELECT player_id FROM player_viewer_links WHERE viewer_user_id = ?)) LIMIT 1`,
      [req.params.playerId, req.user.id, req.user.id]
    );
    if (!lp) return res.json({ matched: null });
    const dedupKey = `${normalizeStr(lp.name || '')}|${lp.generation ?? 0}`.slice(0, 191);
    const [[wp]] = await pool.query(
      `SELECT id FROM wyscout_players WHERE dedup_key = ? LIMIT 1`,
      [dedupKey]
    );
    return res.json({ matched: wp?.id || null });
  } catch (err) {
    console.warn('[api/wyscout/match-from-local] error:', err?.message);
    return res.json({ matched: null });
  }
});

async function ensureAdmin(req, res, next) {
  if (!req.user.isAdmin) return res.status(403).json({ error: "Forbidden" });
  next();
}

async function ensureAdminOrModerator(req, res, next) {
  const [rows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role IN ('admin','moderator') LIMIT 1", [req.user.id]);
  if (!rows.length) return res.status(403).json({ error: "Forbidden" });
  next();
}

async function ensurePremiumOrAdmin(req, res, next) {
  // Admins are always allowed
  const [adminRows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
  if (adminRows.length) return next();
  // Check premium subscription
  const [subRows] = await pool.query("SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
  if (subRows.length && subRows[0].is_premium) return next();
  return res.status(403).json({ error: "premium_required", message: "Cette fonctionnalité est réservée aux utilisateurs Premium." });
}

app.get("/api/admin/users", authMiddleware, ensureAdmin, async (_req, res) => {
  const [users] = await pool.query(`
    SELECT u.id, u.email, u.created_at, u.last_sign_in_at, u.oauth_provider, u.is_banned, u.ban_reason, u.ban_expires_at, u.suspicious_referral,
           p.first_name, p.last_name
    FROM users u
    LEFT JOIN profiles p ON p.user_id = u.id
    ORDER BY u.created_at DESC
  `);
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
      first_name: u.first_name || null,
      last_name: u.last_name || null,
      created_at: u.created_at,
      last_sign_in_at: u.last_sign_in_at,
      oauth_provider: u.oauth_provider || null,
      is_banned: !!u.is_banned,
      ban_reason: u.ban_reason || null,
      ban_expires_at: u.ban_expires_at ? new Date(u.ban_expires_at).toISOString() : null,
      suspicious_referral: !!u.suspicious_referral,
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

// GET /api/admin/users/:userId/delete-preview — counts of data that will be deleted
app.get("/api/admin/users/:userId/delete-preview", authMiddleware, ensureAdmin, async (req, res) => {
  const targetId = req.params.userId;
  try {
    const [[userRow]] = await pool.query("SELECT email, created_at FROM users WHERE id = ? LIMIT 1", [targetId]);
    if (!userRow) return res.status(404).json({ error: "Utilisateur introuvable." });

    const [
      [[{ player_count }]],
      [[{ report_count }]],
      [[{ org_count }]],
      [[{ watchlist_count }]],
      [[{ fixture_count }]],
      [[{ community_count }]],
      [[{ shadow_count }]],
      [[{ championship_count }]],
      subRows,
    ] = await Promise.all([
      pool.query("SELECT COUNT(*) AS player_count FROM players WHERE user_id = ?", [targetId]),
      pool.query("SELECT COUNT(*) AS report_count FROM reports WHERE user_id = ?", [targetId]),
      pool.query("SELECT COUNT(*) AS org_count FROM organizations WHERE created_by = ?", [targetId]),
      pool.query("SELECT COUNT(*) AS watchlist_count FROM watchlists WHERE user_id = ?", [targetId]),
      pool.query("SELECT COUNT(*) AS fixture_count FROM fixtures WHERE user_id = ?", [targetId]),
      pool.query("SELECT COUNT(*) AS community_count FROM community_posts WHERE user_id = ?", [targetId]),
      pool.query("SELECT COUNT(*) AS shadow_count FROM shadow_teams WHERE user_id = ?", [targetId]),
      pool.query("SELECT COUNT(*) AS championship_count FROM custom_championships WHERE created_by = ?", [targetId]),
      pool.query("SELECT stripe_subscription_id FROM user_subscriptions WHERE user_id = ? LIMIT 1", [targetId]),
    ]);

    return res.json({
      email: userRow.email,
      created_at: userRow.created_at,
      player_count: Number(player_count),
      report_count: Number(report_count),
      org_count: Number(org_count),
      watchlist_count: Number(watchlist_count),
      fixture_count: Number(fixture_count),
      community_count: Number(community_count),
      shadow_count: Number(shadow_count),
      championship_count: Number(championship_count),
      has_subscription: !!(subRows[0]?.stripe_subscription_id),
    });
  } catch (err) {
    console.error("[admin/delete-preview] Error:", err);
    return res.status(500).json({ error: "Erreur lors de la récupération des données." });
  }
});

// DELETE /api/admin/users/:userId — hard-delete a user and all their data
app.delete("/api/admin/users/:userId", authMiddleware, ensureAdmin, async (req, res) => {
  const targetId = req.params.userId;
  const adminId = req.user.id;

  if (targetId === adminId) {
    return res.status(400).json({ error: "Vous ne pouvez pas supprimer votre propre compte depuis l'administration." });
  }

  try {
    // Refuse to delete another admin
    const [targetRoles] = await pool.query(
      "SELECT role FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1",
      [targetId],
    );
    if (targetRoles.length) {
      return res.status(403).json({ error: "Impossible de supprimer un compte administrateur." });
    }

    // Fetch target user email for logging
    const [targetRows] = await pool.query("SELECT email FROM users WHERE id = ? LIMIT 1", [targetId]);
    if (!targetRows.length) {
      return res.status(404).json({ error: "Utilisateur introuvable." });
    }
    const targetEmail = targetRows[0].email;

    // Cancel Stripe subscription if any
    if (stripe) {
      const [subRows] = await pool.query(
        "SELECT stripe_customer_id, stripe_subscription_id FROM user_subscriptions WHERE user_id = ?",
        [targetId],
      );
      const sub = subRows[0];
      if (sub?.stripe_subscription_id) {
        try {
          await stripe.subscriptions.cancel(sub.stripe_subscription_id);
        } catch (e) {
          console.warn("[admin/delete-user] Could not cancel Stripe subscription:", e?.message);
        }
      }
      if (sub?.stripe_customer_id) {
        try {
          await stripe.customers.del(sub.stripe_customer_id);
        } catch (e) {
          console.warn("[admin/delete-user] Could not delete Stripe customer:", e?.message);
        }
      }
    }

    // Delete user — all related rows cascade automatically:
    //   profiles (ON DELETE CASCADE) → referred_by SET NULL for referred users
    //   players, reports, watchlists, watchlist_players, shadow_teams, shadow_team_players
    //   organization_members (user leaves their orgs)
    //   organizations created_by CASCADE → org deleted, all members removed
    //   referrals (both referrer_id and referred_id CASCADE)
    //   user_roles, user_subscriptions, notifications, followed_clubs, fixtures, contacts, etc.
    await pool.query("DELETE FROM users WHERE id = ?", [targetId]);

    console.log(`[admin/delete-user] Admin ${adminId} deleted user ${targetId} (${targetEmail})`);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/delete-user] Error:", err);
    return res.status(500).json({ error: "Erreur lors de la suppression de l'utilisateur." });
  }
});

// Impersonate a user (admin only) — swaps the auth cookie to the target user
app.post("/api/admin/impersonate", authMiddleware, ensureAdmin, async (req, res) => {
  const { userId } = req.body || {};
  if (!userId) return res.status(400).json({ error: "Missing userId" });

  try {
    const targetUser = await getUserById(userId);
    if (!targetUser) return res.status(404).json({ error: "User not found" });

    // Save admin's current token in a separate httpOnly cookie
    const adminToken = req.cookies?.[AUTH_COOKIE] || null;
    if (adminToken) {
      res.cookie(ADMIN_COOKIE, adminToken, cookieOptions());
    }

    // Set the main cookie to the target user's token
    const session = buildSession(targetUser, res);
    res.json({ session });
  } catch (err) {
    console.error("[admin/impersonate] error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// Stop impersonation — restores admin's original auth cookie
app.post("/api/admin/stop-impersonation", async (req, res) => {
  const adminToken = req.cookies?.[ADMIN_COOKIE] || null;
  if (!adminToken) {
    return res.status(400).json({ error: "No admin session found" });
  }

  try {
    const payload = jwt.verify(adminToken, jwtSecret);
    const adminUser = await getUserById(payload.sub);
    if (!adminUser) return res.status(401).json({ error: "Invalid admin session" });

    // Restore admin cookie and clear impersonation cookie
    setAuthCookie(res, adminToken);
    res.clearCookie(ADMIN_COOKIE, { path: "/" });

    res.json({ session: { token_type: "bearer", expires_in: 60 * 60 * 24 * 30, user: normalizeUserRow(adminUser) } });
  } catch {
    return res.status(401).json({ error: "Invalid admin session" });
  }
});

// ── Admin: Role management ──────────────────────────────────────────────────

// GET /api/admin/roles — list all distinct roles (from user_roles + page_permissions)
app.get("/api/admin/roles", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const [userRoleRows] = await pool.query("SELECT DISTINCT role FROM user_roles");
    const [permRoleRows] = await pool.query("SELECT DISTINCT role FROM page_permissions");
    const allRolesSet = new Set(["admin", "moderateur", "user"]);
    for (const r of userRoleRows) allRolesSet.add(r.role);
    for (const r of permRoleRows) allRolesSet.add(r.role);
    const order = ['admin', 'moderateur', 'user'];
    return res.json([...allRolesSet].sort((a, b) => {
      const ai = order.indexOf(a);
      const bi = order.indexOf(b);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.localeCompare(b);
    }));
  } catch (err) {
    console.error("[admin/roles] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/admin/roles/set — replace all user roles with a single one (legacy)
app.post("/api/admin/roles/set", authMiddleware, ensureAdmin, async (req, res) => {
  const { userId, role } = req.body || {};
  if (!userId || !role) return res.status(400).json({ error: "userId and role required." });
  try {
    await pool.query("DELETE FROM user_roles WHERE user_id = ?", [userId]);
    await pool.query("INSERT INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, NOW())", [uuidv4(), userId, role]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/roles/set] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/admin/roles/add — add one role to a user without removing others
app.post("/api/admin/roles/add", authMiddleware, ensureAdmin, async (req, res) => {
  const { userId, role } = req.body || {};
  if (!userId || !role) return res.status(400).json({ error: "userId and role required." });
  try {
    await pool.query(
      "INSERT IGNORE INTO user_roles (id, user_id, role, created_at) VALUES (?, ?, ?, NOW())",
      [uuidv4(), userId, role]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/roles/add] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/admin/roles/remove — remove one specific role from a user
app.post("/api/admin/roles/remove", authMiddleware, ensureAdmin, async (req, res) => {
  const { userId, role } = req.body || {};
  if (!userId || !role) return res.status(400).json({ error: "userId and role required." });
  if (userId === req.user.id && role === 'admin') return res.status(400).json({ error: "Cannot remove your own admin role." });
  try {
    await pool.query("DELETE FROM user_roles WHERE user_id = ? AND role = ?", [userId, role]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/roles/remove] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// DELETE /api/admin/roles/delete — remove a custom role and its permissions
const PROTECTED_ROLES = ['admin', 'user', 'moderateur', 'importateur'];
app.post("/api/admin/roles/delete", authMiddleware, ensureAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!role || PROTECTED_ROLES.includes(role)) {
    return res.status(400).json({ error: "Cannot delete built-in roles." });
  }
  try {
    // Move users with this role back to 'user'
    const [usersWithRole] = await pool.query("SELECT user_id FROM user_roles WHERE role = ?", [role]);
    for (const u of usersWithRole) {
      await pool.query("DELETE FROM user_roles WHERE user_id = ?", [u.user_id]);
      await pool.query("INSERT INTO user_roles (id, user_id, role) VALUES (?, ?, 'user')", [uuidv4(), u.user_id]);
    }
    // Delete all permissions for this role
    await pool.query("DELETE FROM page_permissions WHERE role = ?", [role]);
    // Delete role metadata
    await pool.query("DELETE FROM role_metadata WHERE role = ?", [role]).catch(() => {});
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/roles/delete] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// GET /api/admin/role-metadata — get color metadata for all roles
app.get("/api/admin/role-metadata", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS role_metadata (role VARCHAR(50) NOT NULL PRIMARY KEY, color VARCHAR(20) NOT NULL DEFAULT '#6366f1', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`).catch(() => {});
    const [rows] = await pool.query("SELECT role, color FROM role_metadata");
    const map = {};
    for (const r of rows) map[r.role] = r.color;
    return res.json(map);
  } catch (err) {
    console.error("[role-metadata] GET error:", err);
    return res.json({});
  }
});

// POST /api/admin/role-metadata — set color for a role
app.post("/api/admin/role-metadata", authMiddleware, ensureAdmin, async (req, res) => {
  const { role, color } = req.body || {};
  if (!role || !color) return res.status(400).json({ error: "role and color required." });
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS role_metadata (role VARCHAR(50) NOT NULL PRIMARY KEY, color VARCHAR(20) NOT NULL DEFAULT '#6366f1', updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP)`).catch(() => {});
    await pool.query(
      "INSERT INTO role_metadata (role, color) VALUES (?, ?) ON DUPLICATE KEY UPDATE color = VALUES(color)",
      [role, color]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[role-metadata] POST error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/page-permissions — list all page permissions per role (includes action)
app.get("/api/admin/page-permissions", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT role, page_key, action, allowed FROM page_permissions ORDER BY role, page_key, action");
    return res.json(rows);
  } catch (err) {
    console.error("[admin/page-permissions] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/admin/page-permissions — upsert a page permission for a role+action
app.post("/api/admin/page-permissions", authMiddleware, ensureAdmin, async (req, res) => {
  const { role, page_key, action = 'view', allowed } = req.body || {};
  if (!role || !page_key || typeof allowed !== "boolean") {
    return res.status(400).json({ error: "role, page_key, and allowed required." });
  }
  try {
    await pool.query(
      `INSERT INTO page_permissions (id, role, page_key, action, allowed)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE allowed = VALUES(allowed), updated_at = NOW()`,
      [uuidv4(), role, page_key, action, allowed ? 1 : 0]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/page-permissions] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// GET /api/admin/organizations — list all organizations with members
app.get("/api/admin/organizations", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const [orgs] = await pool.query(
      `SELECT o.id, o.name, o.type, o.invite_code, o.logo_url, o.created_at,
              u.email as created_by_email
       FROM organizations o
       LEFT JOIN users u ON u.id = o.created_by
       ORDER BY o.created_at DESC`
    );
    const [members] = await pool.query(
      `SELECT om.organization_id, om.user_id, om.role, u.email
       FROM organization_members om
       JOIN users u ON u.id = om.user_id
       ORDER BY om.role ASC, om.joined_at ASC`
    );
    const membersByOrg = new Map();
    for (const m of members) {
      const arr = membersByOrg.get(m.organization_id) || [];
      arr.push({ user_id: m.user_id, email: m.email, role: m.role });
      membersByOrg.set(m.organization_id, arr);
    }
    const payload = orgs.map((o) => ({
      ...o,
      members: membersByOrg.get(o.id) || [],
    }));
    res.json(payload);
  } catch (err) {
    console.error("[admin/organizations]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admin/organizations/add-member — add a user to an organization
app.post("/api/admin/organizations/add-member", authMiddleware, ensureAdmin, async (req, res) => {
  const { organizationId, userId, role } = req.body || {};
  if (!organizationId || !userId) return res.status(400).json({ error: "Missing organizationId or userId" });
  const memberRole = role || "member";
  try {
    const id = require("crypto").randomUUID();
    await pool.query(
      `INSERT INTO organization_members (id, organization_id, user_id, role, joined_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [id, organizationId, userId, memberRole]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/organizations/add-member]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admin/organizations/remove-member — remove a user from an organization
app.post("/api/admin/organizations/remove-member", authMiddleware, ensureAdmin, async (req, res) => {
  const { organizationId, userId } = req.body || {};
  if (!organizationId || !userId) return res.status(400).json({ error: "Missing organizationId or userId" });
  try {
    await pool.query(
      "DELETE FROM organization_members WHERE organization_id = ? AND user_id = ?",
      [organizationId, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/organizations/remove-member]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/admin/organizations/update-member-role — change a member's role in an org
app.post("/api/admin/organizations/update-member-role", authMiddleware, ensureAdmin, async (req, res) => {
  const { organizationId, userId, role } = req.body || {};
  if (!organizationId || !userId || !role) return res.status(400).json({ error: "Missing fields" });
  try {
    await pool.query(
      "UPDATE organization_members SET role = ? WHERE organization_id = ? AND user_id = ?",
      [role, organizationId, userId]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error("[admin/organizations/update-member-role]", err);
    res.status(500).json({ error: "Server error" });
  }
});

// POST /api/analytics/heartbeat — session tracking (all authenticated users)
app.post("/api/analytics/heartbeat", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    const { session_id, device_type, browser, os, screen_width, screen_height, language, current_page, started_at, geo_lat, geo_lon } = req.body;
    if (!session_id) return res.status(400).json({ error: "session_id required" });
    const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket?.remoteAddress || null;
    const ua = req.headers["user-agent"] || '';
    const id = require("crypto").randomUUID();
    const safeDevice = ["desktop", "mobile", "tablet"].includes(device_type) ? device_type : "desktop";
    const sessionStart = started_at ? new Date(started_at) : new Date();
    const category = categorizePageUrl(current_page);
    const hasClientGeo = geo_lat != null && geo_lon != null;

    // Upsert session row (geo columns filled later async, or from client coords)
    const [result] = await pool.query(
      `INSERT INTO user_sessions
         (id, user_id, session_id, device_type, browser, os, screen_width, screen_height,
          language, current_page, page_category, ip_address, started_at, last_seen_at,
          latitude, longitude, geo_from_client)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         device_type      = VALUES(device_type),
         browser          = VALUES(browser),
         os               = VALUES(os),
         screen_width     = VALUES(screen_width),
         screen_height    = VALUES(screen_height),
         language         = VALUES(language),
         current_page     = VALUES(current_page),
         page_category    = VALUES(page_category),
         ip_address       = VALUES(ip_address),
         last_seen_at     = NOW(),
         latitude         = IF(VALUES(geo_from_client) = 1, VALUES(latitude), latitude),
         longitude        = IF(VALUES(geo_from_client) = 1, VALUES(longitude), longitude),
         geo_from_client  = IF(VALUES(geo_from_client) = 1, 1, geo_from_client)`,
      [id, userId, session_id, safeDevice, browser || null, os || null,
       screen_width || null, screen_height || null, language || null,
       current_page || null, category, ip, sessionStart,
       hasClientGeo ? geo_lat : null, hasClientGeo ? geo_lon : null, hasClientGeo ? 1 : 0]
    );

    // Track time per section (non-blocking)
    if (category) {
      pool.query(
        `INSERT INTO session_page_time (user_id, session_id, category, seconds_spent, last_updated)
         VALUES (?, ?, ?, 30, NOW())
         ON DUPLICATE KEY UPDATE seconds_spent = seconds_spent + 30, last_updated = NOW()`,
        [userId, session_id, category]
      ).catch(() => {});
    }

    // Headless browser post-login detection — increment bot_score, auto-ban if >= 85
    if (isHeadlessBrowser(ua || '')) {
      pool.query(
        `UPDATE users SET bot_score = LEAST(bot_score + 25, 100), updated_at = NOW() WHERE id = ?`,
        [userId]
      ).then(async () => {
        const [[u]] = await pool.query('SELECT bot_score FROM users WHERE id = ?', [userId]);
        if (u?.bot_score >= 85) {
          await pool.query(
            `UPDATE users SET is_banned = 1, ban_reason = ?, banned_at = NOW() WHERE id = ? AND is_banned = 0`,
            ['Détection automatique : comportement de bot (navigateur headless)', userId]
          );
          invalidateBanCache(userId);
          console.warn(`[antibot] Auto-banned user ${userId} (bot_score=${u.bot_score})`);
        } else {
          invalidateBanCache(userId);
        }
      }).catch(() => {});
    }

    // Geolocate from IP on new session (first insert only), async, non-blocking
    const isNewSession = result.affectedRows === 1;
    if (isNewSession && !hasClientGeo) {
      geolocateIp(ip).then(geo => {
        if (!geo) return;
        pool.query(
          `UPDATE user_sessions SET country = ?, country_code = ?, city = ?, latitude = ?, longitude = ?
           WHERE user_id = ? AND session_id = ? AND geo_from_client = 0`,
          [geo.country, geo.country_code, geo.city, geo.lat, geo.lon, userId, session_id]
        ).catch(() => {});
      }).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    console.error("[POST /api/analytics/heartbeat]", err?.message);
    res.status(500).json({ error: "Server error" });
  }
});

// Country name → ISO-2 code for profile.country fallback
const PROFILE_COUNTRY_TO_CODE = {
  'france':'FR','allemagne':'DE','germany':'DE','espagne':'ES','spain':'ES','italie':'IT','italy':'IT',
  'angleterre':'GB','england':'GB','royaume-uni':'GB','united kingdom':'GB','grande-bretagne':'GB',
  'portugal':'PT','pays-bas':'NL','netherlands':'NL','belgique':'BE','belgium':'BE',
  'suisse':'CH','switzerland':'CH','autriche':'AT','austria':'AT','suède':'SE','sweden':'SE',
  'norvège':'NO','norway':'NO','danemark':'DK','denmark':'DK','finlande':'FI','finland':'FI',
  'pologne':'PL','poland':'PL','tchéquie':'CZ','republique tcheque':'CZ','czech republic':'CZ','czechia':'CZ',
  'hongrie':'HU','hungary':'HU','roumanie':'RO','romania':'RO','croatie':'HR','croatia':'HR',
  'serbie':'RS','serbia':'RS','ukraine':'UA','russie':'RU','russia':'RU','turquie':'TR','turkey':'TR',
  'grèce':'GR','greece':'GR','brésil':'BR','brazil':'BR','argentine':'AR','argentina':'AR',
  'colombie':'CO','colombia':'CO','mexique':'MX','mexico':'MX','états-unis':'US','united states':'US',
  'usa':'US','canada':'CA','australie':'AU','australia':'AU','japon':'JP','japan':'JP',
  'corée du sud':'KR','south korea':'KR','chine':'CN','china':'CN','maroc':'MA','morocco':'MA',
  'égypte':'EG','egypt':'EG','nigeria':'NG','afrique du sud':'ZA','south africa':'ZA',
  'arabie saoudite':'SA','saudi arabia':'SA','qatar':'QA','émirats arabes unis':'AE',
  'uae':'AE','united arab emirates':'AE','israël':'IL','israel':'IL','irlande':'IE','ireland':'IE',
  'écosse':'GB','scotland':'GB','pays de galles':'GB','wales':'GB','luxembourg':'LU','luxembourg':'LU',
};
function profileCountryToCode(name) {
  if (!name) return null;
  return PROFILE_COUNTRY_TO_CODE[name.toLowerCase().trim()] || null;
}

// ── Admin ban management ──────────────────────────────────────────────────────

// GET /api/admin/users/bans — list banned accounts + suspicious (bot_score >= 50)
app.get("/api/admin/users/bans", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [banned] = await pool.query(
      `SELECT u.id, u.email, u.is_banned, u.ban_reason, u.banned_at, u.banned_by,
              u.bot_score, u.registration_ip, u.created_at,
              COALESCE(p.full_name, '') AS full_name, p.role,
              (SELECT COUNT(*) FROM users u2 WHERE u2.registration_ip_hash = u.registration_ip_hash AND u2.id != u.id) AS ip_siblings
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id
       WHERE u.is_banned = 1 OR u.bot_score >= 50
       ORDER BY u.is_banned DESC, u.bot_score DESC, u.created_at DESC
       LIMIT 200`
    );
    const [ipStats] = await pool.query(
      `SELECT ip_hash, account_count, first_seen, last_seen, is_flagged
       FROM signup_ip_log WHERE account_count > 2 OR is_flagged = 1
       ORDER BY account_count DESC LIMIT 50`
    );
    res.json({ banned, ipStats });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/admin/users/:id/ban-status — check ban status of any user (admin/mod)
app.get("/api/admin/users/:id/ban-status", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  try {
    const [[row]] = await pool.query('SELECT is_banned, ban_reason, ban_expires_at FROM users WHERE id=? LIMIT 1', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'User not found' });
    res.json({ is_banned: !!row.is_banned, ban_reason: row.ban_reason || null, ban_expires_at: row.ban_expires_at || null });
  } catch (err) { res.status(500).json({ error: err?.message }); }
});

// GET /api/my-ban-status — check own ban status (no admin required)
app.get("/api/my-ban-status", authMiddleware, async (req, res) => {
  try {
    const { isBanned, banReason, banExpiresAt } = await isUserBanned(req.user.id);
    res.json({ isBanned, reason: banReason, expiresAt: banExpiresAt });
  } catch { res.json({ isBanned: false }); }
});

// POST /api/admin/users/:id/ban — admin or moderator
app.post("/api/admin/users/:id/ban", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason, duration_hours } = req.body || {};
    const actorId = req.user.id;
    if (id === actorId) return res.status(400).json({ error: 'Vous ne pouvez pas vous bannir vous-même.' });
    // Moderators cannot ban admins
    const [[target]] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [id]);
    const [[actor]] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [actorId]);
    if (target && !actor) return res.status(403).json({ error: 'Un modérateur ne peut pas bannir un administrateur.' });

    const hours = Number(duration_hours);
    const expiresAt = (hours > 0)
      ? new Date(Date.now() + hours * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ')
      : null;
    await pool.query(
      `UPDATE users SET is_banned=1, ban_reason=?, banned_at=NOW(), banned_by=?, ban_expires_at=?, updated_at=NOW() WHERE id=?`,
      [String(reason || 'Décision administrative').slice(0, 500), actorId, expiresAt, id]
    );
    invalidateBanCache(id);
    pool.query(
      `UPDATE signup_ip_log sil INNER JOIN users u ON u.registration_ip_hash=sil.ip_hash SET sil.is_flagged=1 WHERE u.id=?`,
      [id]
    ).catch(() => {});
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/users/:id/unban — admin or moderator
app.post("/api/admin/users/:id/unban", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query(
      `UPDATE users SET is_banned=0, ban_reason=NULL, banned_at=NULL, banned_by=NULL, ban_expires_at=NULL, bot_score=0, updated_at=NOW() WHERE id=?`,
      [id]
    );
    invalidateBanCache(id);
    res.json({ ok: true });
  } catch (err) { res.status(500).json({ error: err?.message }); }
});

// POST /api/admin/users/:id/reset-bot-score
app.post("/api/admin/users/:id/reset-bot-score", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    await pool.query('UPDATE users SET bot_score = 0, updated_at = NOW() WHERE id = ?', [req.params.id]);
    invalidateBanCache(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Championship manual standings (admin/moderator) ─────────────────────────

// GET /api/championships/manual-standings?championship=X&year=Y
app.get("/api/championships/manual-standings", authMiddleware, async (req, res) => {
  const { championship, year } = req.query;
  if (!championship) return res.status(400).json({ error: "championship required" });
  try {
    const seasonYear = year ? parseInt(year) : new Date().getFullYear();
    const [rows] = await pool.query(
      'SELECT * FROM championship_manual_data WHERE championship_name = ? AND season_year = ?',
      [championship, seasonYear]
    );
    if (!rows.length) return res.json({ exists: false, teams: [], seasonDisplayName: null });
    const data = typeof rows[0].standings_json === 'string' ? JSON.parse(rows[0].standings_json) : rows[0].standings_json;
    return res.json({ exists: true, seasonDisplayName: rows[0].season_display_name, updated_at: rows[0].updated_at, ...data });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /api/championships/manual-standings — save/update manual standings
app.post("/api/championships/manual-standings", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  const { championshipName, seasonYear, seasonDisplayName, teams } = req.body || {};
  if (!championshipName || !seasonYear || !Array.isArray(teams)) {
    return res.status(400).json({ error: "championshipName, seasonYear, teams required" });
  }
  if (teams.length > 50) return res.status(400).json({ error: "Trop d'équipes (max 50)" });

  // Validate team entries
  const sanitized = teams.map((t, i) => ({
    id: t.id ?? null,
    name: String(t.name || '').trim().slice(0, 100),
    shortName: t.shortName ? String(t.shortName).slice(0, 30) : null,
    logoUrl: t.logoUrl ? String(t.logoUrl).slice(0, 500) : null,
    position: Number(t.position) || (i + 1),
    points: Number(t.points) || 0,
    played: Number(t.played) || 0,
    wins: Number(t.wins) || 0,
    draws: Number(t.draws) || 0,
    losses: Number(t.losses) || 0,
    goalsFor: Number(t.goalsFor) || 0,
    goalsAgainst: Number(t.goalsAgainst) || 0,
    goalDifference: Number(t.goalDifference) || ((Number(t.goalsFor) || 0) - (Number(t.goalsAgainst) || 0)),
    description: t.description ? String(t.description).slice(0, 100) : null,
    noteColor: t.noteColor ? String(t.noteColor).replace(/[^a-fA-F0-9#]/g, '').slice(0, 10) : null,
  })).filter(t => t.name);

  const payload = {
    source: 'manual',
    seasonYear: Number(seasonYear),
    season: { name: seasonDisplayName || String(seasonYear) },
    teams: sanitized,
    from_cache: true,
    fetched_at: new Date().toISOString().slice(0, 19).replace('T', ' '),
  };

  try {
    await pool.query(
      `INSERT INTO championship_manual_data (championship_name, season_year, season_display_name, standings_json, updated_by)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         season_display_name = VALUES(season_display_name),
         standings_json      = VALUES(standings_json),
         updated_by          = VALUES(updated_by),
         updated_at          = NOW()`,
      [championshipName, Number(seasonYear), seasonDisplayName || null, JSON.stringify(payload), req.user.id]
    );
    res.json({ ok: true, teams: sanitized.length });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// DELETE /api/championships/manual-standings — remove manual standings
app.delete("/api/championships/manual-standings", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  const { championship, year } = req.query;
  if (!championship || !year) return res.status(400).json({ error: "championship and year required" });
  try {
    await pool.query(
      'DELETE FROM championship_manual_data WHERE championship_name = ? AND season_year = ?',
      [championship, parseInt(year)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Championship custom clubs (admin/moderator) ──────────────────────────────

// GET /api/championships/:name/clubs — list custom clubs for a championship
app.get("/api/championships/:name/clubs", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT club_name, added_by, created_at FROM championship_clubs WHERE championship_name = ? ORDER BY created_at ASC',
      [decodeURIComponent(req.params.name)]
    );
    res.json(rows.map(r => ({ name: r.club_name, added_by: r.added_by, created_at: r.created_at })));
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// POST /api/championships/:name/clubs — add a custom club
app.post("/api/championships/:name/clubs", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  const { clubName } = req.body || {};
  if (!clubName?.trim()) return res.status(400).json({ error: "clubName required" });
  try {
    await pool.query(
      'INSERT IGNORE INTO championship_clubs (championship_name, club_name, added_by) VALUES (?, ?, ?)',
      [decodeURIComponent(req.params.name), clubName.trim().slice(0, 200), req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// DELETE /api/championships/:name/clubs/:clubName — remove a custom club
app.delete("/api/championships/:name/clubs/:clubName", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM championship_clubs WHERE championship_name = ? AND club_name = ?',
      [decodeURIComponent(req.params.name), decodeURIComponent(req.params.clubName)]
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// GET /api/admin/analytics/live — currently online users (last 2 min)
app.get("/api/admin/analytics/live", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [sessions] = await pool.query(
      `SELECT
         us.user_id, us.session_id, us.device_type, us.browser, us.os,
         us.screen_width, us.screen_height, us.language, us.current_page, us.page_category,
         us.ip_address, us.country, us.country_code, us.city, us.geo_from_client,
         us.started_at, us.last_seen_at,
         TIMESTAMPDIFF(SECOND, us.started_at, us.last_seen_at) AS session_seconds,
         u.email,
         COALESCE(p.full_name, u.email) AS display_name,
         p.photo_url,
         p.country AS profile_country
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       LEFT JOIN profiles p ON p.user_id = us.user_id
       WHERE us.last_seen_at >= NOW() - INTERVAL 2 MINUTE
       ORDER BY us.last_seen_at DESC`
    );

    // ── Enrich country: GPS client > profil > IP ────────────────────────────
    for (const s of sessions) {
      if (!s.country_code && s.profile_country) {
        const code = profileCountryToCode(s.profile_country);
        if (code) { s.country_code = code; s.country = s.profile_country; s.country_source = 'profile'; }
      } else if (s.country_code) {
        s.country_source = s.geo_from_client ? 'gps' : 'ip';
      }
    }

    // ── Deduplicate by user_id: count windows per user, keep most recent session ──
    const windowCounts = new Map();
    for (const s of sessions) windowCounts.set(s.user_id, (windowCounts.get(s.user_id) || 0) + 1);

    const byUser = new Map();
    for (const s of sessions) {
      const existing = byUser.get(s.user_id);
      if (!existing || new Date(s.last_seen_at) > new Date(existing.last_seen_at)) {
        byUser.set(s.user_id, { ...s, window_count: windowCounts.get(s.user_id) || 1 });
      }
    }
    const uniqueSessions = Array.from(byUser.values())
      .sort((a, b) => new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime());

    // ── Breakdowns: 1 count per unique user (not per session/window) ─────────
    const deviceBreakdown = {};
    const browserBreakdown = {};
    const osBreakdown = {};
    const countryBreakdown = {};
    const categoryBreakdown = {};
    for (const s of uniqueSessions) {
      deviceBreakdown[s.device_type] = (deviceBreakdown[s.device_type] || 0) + 1;
      if (s.browser) browserBreakdown[s.browser] = (browserBreakdown[s.browser] || 0) + 1;
      if (s.os) osBreakdown[s.os] = (osBreakdown[s.os] || 0) + 1;
      if (s.country_code) {
        if (!countryBreakdown[s.country_code]) countryBreakdown[s.country_code] = { count: 0, country: s.country, country_code: s.country_code };
        countryBreakdown[s.country_code].count++;
      }
      if (s.page_category) categoryBreakdown[s.page_category] = (categoryBreakdown[s.page_category] || 0) + 1;
    }
    const avgSeconds = uniqueSessions.length
      ? Math.round(uniqueSessions.reduce((sum, s) => sum + (s.session_seconds || 0), 0) / uniqueSessions.length)
      : 0;

    res.json({
      online_count: uniqueSessions.length,          // unique users, not windows
      avg_session_seconds: avgSeconds,
      device_breakdown: deviceBreakdown,
      browser_breakdown: browserBreakdown,
      os_breakdown: osBreakdown,
      country_breakdown: Object.values(countryBreakdown).sort((a, b) => b.count - a.count),
      category_breakdown: categoryBreakdown,
      sessions: uniqueSessions,                     // one entry per user, with window_count
    });
  } catch (err) {
    console.error("[GET /api/admin/analytics/live]", err?.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/analytics/live/:userId — detailed session history for one user
app.get("/api/admin/analytics/live/:userId", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const { userId } = req.params;
    const [sessions] = await pool.query(
      `SELECT us.*, u.email, COALESCE(p.full_name, u.email) AS display_name, p.photo_url,
              p.country AS profile_country,
              TIMESTAMPDIFF(SECOND, us.started_at, us.last_seen_at) AS session_seconds
       FROM user_sessions us
       JOIN users u ON u.id = us.user_id
       LEFT JOIN profiles p ON p.user_id = us.user_id
       WHERE us.user_id = ?
       ORDER BY us.last_seen_at DESC
       LIMIT 20`,
      [userId]
    );
    // Apply profile country fallback
    for (const s of sessions) {
      if (!s.country_code && s.profile_country) {
        const code = profileCountryToCode(s.profile_country);
        if (code) { s.country_code = code; s.country = s.profile_country; s.country_source = 'profile'; }
      } else if (s.country_code) {
        s.country_source = s.geo_from_client ? 'gps' : 'ip';
      }
    }
    const [[user]] = await pool.query(
      `SELECT u.email, u.last_sign_in_at, COALESCE(p.full_name, u.email) AS display_name, p.photo_url, p.country AS profile_country
       FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ?`,
      [userId]
    );
    res.json({ user: user || null, sessions });
  } catch (err) {
    console.error("[GET /api/admin/analytics/live/:userId]", err?.message);
    res.status(500).json({ error: "Server error" });
  }
});

// GET /api/admin/analytics — comprehensive dashboard KPIs
app.get("/api/admin/analytics", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const range = req.query.range || "30d"; // 1d, 7d, 30d, 90d, 1y, all
    let dateFilter = "";
    const rangeMap = { "1d": 1, "7d": 7, "30d": 30, "90d": 90, "1y": 365 };
    const days = rangeMap[range];
    if (days) {
      dateFilter = `AND created_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)`;
    }

    // --- Users ---
    const [[{ total_users }]] = await pool.query("SELECT COUNT(*) as total_users FROM users");
    const [[{ new_users }]] = await pool.query(`SELECT COUNT(*) as new_users FROM users WHERE 1=1 ${dateFilter}`);
    const [[{ active_users }]] = await pool.query(`SELECT COUNT(*) as active_users FROM users WHERE last_sign_in_at >= DATE_SUB(NOW(), INTERVAL ${days || 99999} DAY)`);
    const [[{ active_today }]] = await pool.query("SELECT COUNT(*) as active_today FROM users WHERE last_sign_in_at >= CURDATE()");
    const [[{ active_7d }]] = await pool.query("SELECT COUNT(*) as active_7d FROM users WHERE last_sign_in_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)");
    const [[{ active_30d }]] = await pool.query("SELECT COUNT(*) as active_30d FROM users WHERE last_sign_in_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
    const [[{ users_2fa }]] = await pool.query("SELECT COUNT(*) as users_2fa FROM users WHERE totp_enabled = 1 OR email_2fa_enabled = 1");

    // --- Subscriptions ---
    const [[{ premium_users }]] = await pool.query("SELECT COUNT(*) as premium_users FROM user_subscriptions WHERE is_premium = 1");
    const [planBreakdown] = await pool.query("SELECT COALESCE(plan_type, 'starter') as plan, billing_cycle, COUNT(*) as count FROM user_subscriptions WHERE is_premium = 1 GROUP BY plan_type, billing_cycle");
    const [[{ new_premium }]] = await pool.query(`SELECT COUNT(*) as new_premium FROM user_subscriptions WHERE is_premium = 1 AND premium_since IS NOT NULL ${dateFilter.replace(/created_at/g, 'premium_since')}`);
    const [[{ churned }]] = await pool.query(`SELECT COUNT(*) as churned FROM user_subscriptions WHERE is_premium = 0 AND premium_since IS NOT NULL`);

    // --- Players ---
    const [[{ total_players }]] = await pool.query("SELECT COUNT(*) as total_players FROM players");
    const [[{ new_players }]] = await pool.query(`SELECT COUNT(*) as new_players FROM players WHERE 1=1 ${dateFilter}`);
    const [[{ enriched_players }]] = await pool.query("SELECT COUNT(*) as enriched_players FROM players WHERE external_data_fetched_at IS NOT NULL");
    const [[{ enriched_period }]] = await pool.query(`SELECT COUNT(*) as enriched_period FROM players WHERE external_data_fetched_at IS NOT NULL ${dateFilter.replace(/created_at/g, 'external_data_fetched_at')}`);
    const [[{ avg_players_per_user }]] = await pool.query("SELECT ROUND(AVG(cnt), 1) as avg_players_per_user FROM (SELECT COUNT(*) as cnt FROM players GROUP BY user_id) sub");

    // --- Reports ---
    const [[{ total_reports }]] = await pool.query("SELECT COUNT(*) as total_reports FROM reports");
    const [[{ new_reports }]] = await pool.query(`SELECT COUNT(*) as new_reports FROM reports WHERE 1=1 ${dateFilter}`);

    // --- Organizations ---
    const [[{ total_orgs }]] = await pool.query("SELECT COUNT(*) as total_orgs FROM organizations");
    const [[{ total_org_members }]] = await pool.query("SELECT COUNT(*) as total_org_members FROM organization_members");

    // --- Matches ---
    const [[{ total_matches }]] = await pool.query("SELECT COUNT(*) as total_matches FROM match_assignments");
    const [[{ new_matches }]] = await pool.query(`SELECT COUNT(*) as new_matches FROM match_assignments WHERE 1=1 ${dateFilter}`);
    const [matchStatusBreakdown] = await pool.query("SELECT status, COUNT(*) as count FROM match_assignments GROUP BY status");

    // --- Watchlists & Shadow Teams ---
    const [[{ total_watchlists }]] = await pool.query("SELECT COUNT(*) as total_watchlists FROM watchlists");
    const [[{ total_shadow_teams }]] = await pool.query("SELECT COUNT(*) as total_shadow_teams FROM shadow_teams");

    // --- Contacts ---
    const [[{ total_contacts }]] = await pool.query("SELECT COUNT(*) as total_contacts FROM contacts");

    // --- Feedback ---
    const [[{ total_feedback }]] = await pool.query("SELECT COUNT(*) as total_feedback FROM feedback");
    const [[{ avg_rating }]] = await pool.query("SELECT ROUND(AVG(rating), 2) as avg_rating FROM feedback");
    const [ratingBreakdown] = await pool.query("SELECT rating, COUNT(*) as count FROM feedback GROUP BY rating ORDER BY rating");

    // --- Notifications ---
    const [[{ enrichment_notifs }]] = await pool.query(`SELECT COUNT(*) as enrichment_notifs FROM notifications WHERE type = 'enrichment' ${dateFilter}`);

    // --- Time series (registrations by day/week) ---
    let groupBy = "DATE(created_at)";
    if (range === "1y" || range === "all") groupBy = "DATE_FORMAT(created_at, '%Y-%m')";
    else if (range === "90d") groupBy = "DATE_FORMAT(created_at, '%Y-%u')"; // by week
    const [userTimeSeries] = await pool.query(
      `SELECT ${groupBy} as period, COUNT(*) as count FROM users WHERE 1=1 ${dateFilter} GROUP BY period ORDER BY period`
    );
    const [playerTimeSeries] = await pool.query(
      `SELECT ${groupBy} as period, COUNT(*) as count FROM players WHERE 1=1 ${dateFilter} GROUP BY period ORDER BY period`
    );
    const [premiumTimeSeries] = await pool.query(
      `SELECT ${groupBy} as period, COUNT(*) as count FROM user_subscriptions WHERE is_premium = 1 AND premium_since IS NOT NULL ${dateFilter.replace(/created_at/g, 'premium_since')} GROUP BY period ORDER BY period`
    );

    // --- Top users by player count ---
    const [topUsers] = await pool.query(
      "SELECT u.email, COUNT(p.id) as player_count FROM users u JOIN players p ON p.user_id = u.id GROUP BY u.id ORDER BY player_count DESC LIMIT 10"
    );

    // --- Opinion breakdown ---
    const [opinionBreakdown] = await pool.query("SELECT general_opinion, COUNT(*) as count FROM players GROUP BY general_opinion ORDER BY count DESC");

    // --- Time by section (avg seconds per category across all sessions in range) ---
    const sessionDateFilter = days ? `AND us.started_at >= DATE_SUB(NOW(), INTERVAL ${days} DAY)` : '';
    const [timeBySection] = await pool.query(
      `SELECT spt.category, ROUND(AVG(spt.seconds_spent)) as avg_seconds, SUM(spt.seconds_spent) as total_seconds, COUNT(DISTINCT spt.user_id) as user_count
       FROM session_page_time spt
       JOIN user_sessions us ON us.user_id = spt.user_id AND us.session_id = spt.session_id
       WHERE 1=1 ${sessionDateFilter}
       GROUP BY spt.category
       ORDER BY total_seconds DESC`
    ).catch(() => [[]]);

    // --- Location breakdown (top countries from sessions in range) ---
    const [locationBreakdown] = await pool.query(
      `SELECT country, country_code, COUNT(DISTINCT user_id) as user_count, MAX(geo_from_client) as has_precise_geo
       FROM user_sessions
       WHERE country_code IS NOT NULL ${sessionDateFilter.replace('us.', '')}
       GROUP BY country_code, country
       ORDER BY user_count DESC
       LIMIT 30`
    ).catch(() => [[]]);

    res.json({
      users: { total_users: +total_users, new_users: +new_users, active_users: +active_users, active_today: +active_today, active_7d: +active_7d, active_30d: +active_30d, users_2fa: +users_2fa },
      subscriptions: { premium_users: +premium_users, new_premium: +new_premium, churned: +churned, plan_breakdown: planBreakdown },
      players: { total_players: +total_players, new_players: +new_players, enriched_players: +enriched_players, enriched_period: +enriched_period, avg_players_per_user: +(avg_players_per_user || 0) },
      reports: { total_reports: +total_reports, new_reports: +new_reports },
      organizations: { total_orgs: +total_orgs, total_org_members: +total_org_members },
      matches: { total_matches: +total_matches, new_matches: +new_matches, status_breakdown: matchStatusBreakdown },
      engagement: { total_watchlists: +total_watchlists, total_shadow_teams: +total_shadow_teams, total_contacts: +total_contacts },
      feedback: { total_feedback: +total_feedback, avg_rating: +(avg_rating || 0), rating_breakdown: ratingBreakdown },
      enrichment: { enrichment_notifs: +enrichment_notifs },
      timeSeries: { users: userTimeSeries, players: playerTimeSeries, premium: premiumTimeSeries },
      topUsers,
      opinionBreakdown,
      timeBySection,
      locationBreakdown,
    });
  } catch (err) {
    console.error("[admin/analytics] Error:", err);
    res.status(500).json({ error: "Erreur serveur." });
  }
});

// GET /api/admin/analytics/ticket-words — word frequency from ticket subjects + messages
app.get("/api/admin/analytics/ticket-words", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT subject AS text FROM tickets
       UNION ALL SELECT message AS text FROM tickets
       UNION ALL SELECT body AS text FROM ticket_messages`
    );
    const STOPWORDS = new Set([
      // French
      'le','la','les','de','du','des','en','et','un','une','je','il','elle','nous','vous','ils','elles',
      'que','qui','sur','pour','par','avec','dans','est','pas','au','aux','mon','ma','mes','son','sa','ses',
      'ce','cet','cette','ces','ou','mais','donc','car','si','ne','y','n','a','on','se','lui','leur','leurs',
      'plus','bien','tout','tous','toutes','toute','très','aussi','comme','quand','après','avant','sans',
      'être','avoir','faire','aller','voir','venir','pouvoir','vouloir','devoir','savoir','bonjour','merci',
      'svp','stp','oui','non','je','suis','ai','as','avez','sommes','êtes','sont','était','serait','peut',
      'faut','via','ici','là','me','te','tr','br','hr',
      // English
      'the','is','are','was','were','be','been','being','have','has','had','do','does','did','will','would',
      'shall','should','may','might','can','could','must','to','of','in','on','at','by','from','for','with',
      'about','as','into','through','during','before','after','above','below','between','out','off','over',
      'under','again','further','then','once','here','there','when','where','why','how','all','both','each',
      'few','more','most','other','some','such','no','nor','not','only','own','same','so','than','too',
      'very','just','because','until','while','although','though','even','also','and','but','or','an',
      'this','that','it','its','my','your','his','her','our','their','me','him','us','them','what','which',
      'who','whom','whose','i','you','he','she','we','they','get','got','its',
      // Short/noise
      'j','c','d','l','m','n','s','qu','ok','a','b','e','f','g','h','k','o','p','q','r','t','u','v','w','x','z',
      'http','https','www','com','fr','app',
    ]);
    const freq = {};
    for (const row of rows) {
      if (!row.text) continue;
      const words = row.text.toLowerCase().replace(/[^a-zàâçéèêëîïôûùüÿñæœ\s]/g, ' ').split(/\s+/);
      for (const w of words) {
        if (w.length < 3 || STOPWORDS.has(w)) continue;
        freq[w] = (freq[w] || 0) + 1;
      }
    }
    const result = Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 80)
      .map(([word, count]) => ({ word, count }));
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/my-permissions — get current user's page permissions based on their role
// ── Affiliate stats ──────────────────────────────────────────────────────
app.get("/api/affiliate/stats", authMiddleware, async (req, res) => {
  try {
    const userId = req.user.id;
    // All users referred by this user
    const [referred] = await pool.query(
      "SELECT p.user_id FROM profiles p WHERE p.referred_by = ?",
      [userId]
    );
    const totalReferrals = referred.length;
    if (totalReferrals === 0) {
      return res.json({ totalReferrals: 0, activeReferrals: 0, conversion: 0 });
    }
    const referredIds = referred.map(r => r.user_id);
    const placeholders = referredIds.map(() => '?').join(',');
    const [active] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM user_subscriptions WHERE user_id IN (${placeholders}) AND is_premium = 1`,
      referredIds
    );
    const activeReferrals = Number(active[0]?.cnt || 0);
    const conversion = totalReferrals > 0 ? Math.round((activeReferrals / totalReferrals) * 100) : 0;
    return res.json({ totalReferrals, activeReferrals, conversion });
  } catch (err) {
    console.error("affiliate/stats error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/affiliate/referrer — who referred the current user
app.get("/api/affiliate/referrer", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT r.user_id, r.full_name, r.club, r.role, r.photo_url
       FROM profiles me
       JOIN profiles r ON r.user_id = me.referred_by
       WHERE me.user_id = ?
       LIMIT 1`,
      [req.user.id]
    );
    if (!rows.length) return res.json({ referrer: null });
    return res.json({ referrer: rows[0] });
  } catch (err) {
    console.error("affiliate/referrer error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/account/apply-referral — apply a referral code post-signup
app.post("/api/account/apply-referral", authMiddleware, async (req, res) => {
  const userId = req.user.id;
  const { referral_code } = req.body;
  if (!referral_code) return res.status(400).json({ error: "Code manquant." });

  const codeUpper = String(referral_code).trim().toUpperCase();
  const prefix = codeUpper.startsWith('SCOUTY-') ? codeUpper.slice(7) : codeUpper;
  if (prefix.length !== 8) return res.status(400).json({ error: "Format invalide. Attendu : SCOUTY-XXXXXXXX" });

  try {
    // Check the user doesn't already have a referrer
    const [[me]] = await pool.query(
      "SELECT p.referred_by, u.registration_ip_hash FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.user_id = ? LIMIT 1",
      [userId]
    );
    if (!me) return res.status(404).json({ error: "Profil introuvable." });
    if (me.referred_by) return res.status(409).json({ error: "Vous avez déjà un parrain." });

    // Resolve referrer
    const [refRows] = await pool.query(
      "SELECT id, registration_ip_hash FROM users WHERE UPPER(SUBSTRING(id, 1, 8)) = ? LIMIT 1",
      [prefix]
    );
    if (!refRows.length || refRows[0].id === userId) {
      return res.status(404).json({ error: "Code de parrainage invalide." });
    }
    const referrerId = refRows[0].id;

    // Same-IP block
    if (me.registration_ip_hash && refRows[0].registration_ip_hash && me.registration_ip_hash === refRows[0].registration_ip_hash) {
      return res.status(403).json({ error: "Ce code ne peut pas être utilisé car votre compte et celui du parrain partagent la même adresse IP, conformément à nos politiques d'utilisation." });
    }

    // Apply referral
    await pool.query("UPDATE profiles SET referred_by = ?, updated_at = NOW() WHERE user_id = ?", [referrerId, userId]);
    await pool.query(
      `INSERT IGNORE INTO referrals (id, referrer_id, referred_id, referral_code, created_at)
       VALUES (?, ?, ?, ?, NOW())`,
      [uuidv4(), referrerId, userId, codeUpper]
    );

    // Award credits + notify referrer (same as signup flow)
    try {
      await ensureCreditTable();
      const meEmail = req.user.email || 'un utilisateur';
      await pool.query(
        `INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description)
         VALUES (?, ?, 'affiliate_reward', 'earn', 100, ?)`,
        [uuidv4(), referrerId, `Parrainage de ${meEmail}`]
      );
      await createNotification(referrerId, {
        type: 'affiliate_new',
        title: '🎉 Nouveau filleul !',
        message: `${meEmail} vient de rejoindre Scouty grâce à votre code de parrainage.`,
        icon: 'users',
      });
      await createNotification(referrerId, {
        type: 'affiliate_credits',
        title: '+100 crédits de parrainage',
        message: `Vous avez reçu 100 crédits suite au parrainage de ${meEmail}.`,
        icon: 'zap',
      });
      const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM profiles WHERE referred_by = ?", [referrerId]);
      const tierCount = Number(total);
      const AFFILIATE_TIERS = [
        { threshold: 50, name: 'Elite',       emoji: '👑' },
        { threshold: 11, name: 'Partenaire',  emoji: '🤝' },
        { threshold: 1,  name: 'Ambassadeur', emoji: '⭐' },
      ];
      for (const tier of AFFILIATE_TIERS) {
        if (tierCount === tier.threshold) {
          await createNotification(referrerId, {
            type: 'affiliate_tier',
            title: `${tier.emoji} Vous êtes maintenant ${tier.name} !`,
            message: `Félicitations ! Avec ${tierCount} parrainage${tierCount > 1 ? 's' : ''}, vous accédez au statut ${tier.name} et débloquez de nouveaux avantages.`,
            icon: 'award',
          });
          break;
        }
      }
    } catch (e) {
      console.warn('[apply-referral] reward failed:', e.message);
    }

    return res.json({ success: true });
  } catch (err) {
    console.error("[apply-referral] error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// PATCH /api/organizations/:id/logo — upload org logo (owner/admin only)
app.patch("/api/organizations/:id/logo", authMiddleware, upload.single("file"), async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  if (!req.file) return res.status(400).json({ error: "Aucun fichier fourni." });

  try {
    // Check the user is owner or admin of this org
    const [memberRows] = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [id, userId],
    );
    if (!memberRows.length || !['owner', 'admin'].includes(memberRows[0].role)) {
      fs.unlinkSync(req.file.path);
      return res.status(403).json({ error: "Vous n'êtes pas autorisé à modifier cette organisation." });
    }

    const imageId = `org_${id}`;

    // Delete previous logo (best-effort)
    const [orgRows] = await pool.query("SELECT logo_url FROM organizations WHERE id = ? LIMIT 1", [id]);
    const oldUrl = orgRows[0]?.logo_url;
    await deleteImageFromDb(oldUrl);
    await deleteStoredFile(oldUrl);

    const publicUrl = await saveImageToDb(req.file.path, imageId, req.file.mimetype);
    await pool.query("UPDATE organizations SET logo_url = ?, updated_at = NOW() WHERE id = ?", [publicUrl, id]);

    return res.json({ logo_url: publicUrl });
  } catch (err) {
    console.error("[org/logo] Error:", err);
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    return res.status(500).json({ error: err.message || "Erreur serveur." });
  }
});

// DELETE /api/organizations/:id/logo — remove org logo (owner/admin only)
app.delete("/api/organizations/:id/logo", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  try {
    const [memberRows] = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [id, userId],
    );
    if (!memberRows.length || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: "Non autorisé." });
    }

    const [orgRows] = await pool.query("SELECT logo_url FROM organizations WHERE id = ? LIMIT 1", [id]);
    const oldUrl = orgRows[0]?.logo_url;
    await deleteImageFromDb(oldUrl);
    await deleteStoredFile(oldUrl);

    await pool.query("UPDATE organizations SET logo_url = NULL, updated_at = NOW() WHERE id = ?", [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[org/logo/delete] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// PATCH /api/organizations/:id — update name and/or description (owner/admin)
app.patch("/api/organizations/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { name, description } = req.body || {};

  try {
    // Only owner or admin can update
    const [memberRows] = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!memberRows.length || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: "Seuls le propriétaire et les admins peuvent modifier l'organisation." });
    }

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push("name = ?"); params.push(String(name).trim().slice(0, 255)); }
    if (description !== undefined) { updates.push("description = ?"); params.push(description === '' ? null : String(description).slice(0, 2000)); }
    if (!updates.length) return res.status(400).json({ error: "Rien à mettre à jour." });

    updates.push("updated_at = NOW()");
    params.push(id);
    await pool.query(`UPDATE organizations SET ${updates.join(', ')} WHERE id = ?`, params);
    const [rows] = await pool.query("SELECT * FROM organizations WHERE id = ? LIMIT 1", [id]);
    return res.json({ ok: true, org: rows[0] });
  } catch (err) {
    return res.status(500).json({ error: err?.message || "Erreur serveur" });
  }
});

// PATCH /api/organizations/:id/settings — save org-level settings JSON (owner/admin)
app.patch("/api/organizations/:id/settings", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const settings = req.body || {};
  try {
    const [memberRows] = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!memberRows.length || !['owner', 'admin'].includes(memberRows[0].role)) {
      return res.status(403).json({ error: "Réservé au propriétaire et aux admins." });
    }
    const allowed = ['allow_messaging', 'allow_player_sharing', 'notify_new_members', 'allow_squad_viewing'];
    const safe = {};
    for (const k of allowed) { if (typeof settings[k] === 'boolean') safe[k] = settings[k]; }
    await pool.query("UPDATE organizations SET settings = ?, updated_at = NOW() WHERE id = ?", [JSON.stringify(safe), id]);
    return res.json({ ok: true, settings: safe });
  } catch (err) { return res.status(500).json({ error: err?.message || "Erreur serveur" }); }
});

// PATCH /api/organizations/:id/members/:memberId/role — change a member's role (owner only for admin↔member, admin for member only)
app.patch("/api/organizations/:id/members/:memberId/role", authMiddleware, async (req, res) => {
  const { id, memberId } = req.params;
  const userId = req.user.id;
  const { role } = req.body || {};
  if (!['member', 'admin'].includes(role)) {
    return res.status(400).json({ error: "Rôle invalide. Valeurs acceptées : member, admin." });
  }
  try {
    const [adminRows] = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!adminRows.length || !['owner', 'admin'].includes(adminRows[0].role)) {
      return res.status(403).json({ error: "Réservé au propriétaire et aux admins." });
    }
    // Only owner can promote to / demote from admin
    if (adminRows[0].role !== 'owner' && role === 'admin') {
      return res.status(403).json({ error: "Seul le propriétaire peut nommer des admins." });
    }
    const [targetRows] = await pool.query(
      "SELECT role FROM organization_members WHERE id = ? AND organization_id = ? LIMIT 1",
      [memberId, id]
    );
    if (!targetRows.length) return res.status(404).json({ error: "Membre introuvable." });
    if (targetRows[0].role === 'owner') return res.status(403).json({ error: "Impossible de modifier le rôle du propriétaire." });
    await pool.query("UPDATE organization_members SET role = ? WHERE id = ? AND organization_id = ?", [role, memberId, id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Erreur serveur" }); }
});

// PATCH /api/organizations/:id/members/:memberId/block-messaging — toggle message block for a member
app.patch("/api/organizations/:id/members/:memberId/block-messaging", authMiddleware, async (req, res) => {
  const { id, memberId } = req.params;
  const userId = req.user.id;
  const { blocked } = req.body || {};
  try {
    const [adminRows] = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [id, userId]
    );
    if (!adminRows.length || !['owner', 'admin'].includes(adminRows[0].role)) {
      return res.status(403).json({ error: "Réservé au propriétaire et aux admins." });
    }
    await pool.query(
      "UPDATE organization_members SET messaging_blocked = ? WHERE id = ? AND organization_id = ?",
      [blocked ? 1 : 0, memberId, id]
    );
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message || "Erreur serveur" }); }
});

// DELETE /api/organizations/:id — delete organization and all linked data (owner/admin)
app.delete("/api/organizations/:id", authMiddleware, async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;
  const { message } = req.body || {};

  try {
    const customMessage = String(message || "").trim();
    if (!customMessage) {
      return res.status(400).json({ error: "Un message de suppression est requis." });
    }

    const [adminRows] = await pool.query(
      "SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1",
      [userId]
    );
    const isPlatformAdmin = adminRows.length > 0;

    // Organization owner/admin or platform admin can delete
    const [memberRows] = await pool.query(
      "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
      [id, userId],
    );
    const isOrgAdmin = memberRows.length > 0 && ['owner', 'admin'].includes(memberRows[0].role);
    if (!isOrgAdmin && !isPlatformAdmin) {
      return res.status(403).json({ error: "Seuls les administrateurs de l'organisation ou de la plateforme peuvent la supprimer." });
    }

    const [orgRows] = await pool.query("SELECT name, logo_url FROM organizations WHERE id = ? LIMIT 1", [id]);
    if (!orgRows.length) return res.status(404).json({ error: "Organisation introuvable." });

    const orgName = orgRows[0].name;
    const logoUrl = orgRows[0]?.logo_url;
    await deleteImageFromDb(logoUrl);
    await deleteStoredFile(logoUrl);

    const [usersToNotify] = await pool.query(
      "SELECT id FROM users"
    );

    for (const targetUser of usersToNotify) {
      await createNotification(targetUser.id, {
        type: "organization",
        title: `${orgName} a été supprimée`,
        message: customMessage,
        icon: "Building2",
        link: "/organization",
      });
    }

    // Detach players: clear club field for players whose club matches this org name (case-insensitive, accent-insensitive)
    if (orgName) {
      // Match exact, case-insensitive, and common variations (with/without accents)
      await pool.query(
        `UPDATE players SET club = '', updated_at = NOW()
         WHERE (club = ? OR LOWER(club) = LOWER(?))
           AND user_id IN (SELECT user_id FROM organization_members WHERE organization_id = ?)`,
        [orgName, orgName, id]
      );
    }

    // Also clean club_directory / club_logos entries for this club name
    if (orgName) {
      try { await pool.query("DELETE FROM club_directory WHERE club_name = ?", [orgName]); } catch {}
      try { await pool.query("DELETE FROM club_logos WHERE club_name = ?", [orgName]); } catch {}
    }

    // CASCADE will handle: organization_members, player_org_shares, match_assignments, squad_players
    await pool.query("DELETE FROM organizations WHERE id = ?", [id]);

    return res.json({ ok: true });
  } catch (err) {
    console.error("[org/delete] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Match assignments (dedicated endpoints with notifications + credits) ──────

// POST /api/match-assignments — create assignment and notify assignee
app.post("/api/match-assignments", authMiddleware, async (req, res) => {
  try {
    const { organization_id, assigned_to, home_team, away_team, match_date, match_time,
            competition, venue, home_badge, away_badge, notes } = req.body || {};
    if (!home_team || !away_team || !match_date) {
      return res.status(400).json({ error: 'home_team, away_team, match_date requis' });
    }
    const id = uuidv4();
    await pool.query(
      `INSERT INTO match_assignments
         (id, user_id, organization_id, assigned_to, assigned_by, home_team, away_team,
          match_date, match_time, competition, venue, home_badge, away_badge, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, organization_id || null,
       assigned_to || null, assigned_to ? req.user.id : null,
       home_team, away_team, match_date, match_time || null,
       competition || '', venue || '',
       home_badge || null, away_badge || null, notes || null]
    );
    // Notify assignee
    if (assigned_to && assigned_to !== req.user.id) {
      const [[assigner]] = await pool.query(
        'SELECT p.full_name, u.email FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? LIMIT 1',
        [req.user.id]
      );
      const name = assigner?.full_name || assigner?.email || 'Un responsable';
      await createNotification(assigned_to, {
        type: 'match_assignment',
        title: 'Nouvelle affectation de match',
        message: `${name} vous a assigné : ${home_team} – ${away_team} le ${match_date}.`,
        icon: 'calendar',
        link: '/org/roadmap',
      });
    }
    const [[row]] = await pool.query('SELECT * FROM match_assignments WHERE id = ?', [id]);
    return res.json(row);
  } catch (err) {
    console.error('[match-assignments/create]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// PATCH /api/match-assignments/:id — update status or reassign, with notifications + credits
app.patch("/api/match-assignments/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes, assigned_to } = req.body || {};
    const [[existing]] = await pool.query('SELECT * FROM match_assignments WHERE id = ?', [id]);
    if (!existing) return res.status(404).json({ error: 'Affectation introuvable' });

    const isOwner    = existing.user_id     === req.user.id;
    const isAssignee = existing.assigned_to === req.user.id;
    if (!isOwner && !isAssignee) {
      return res.status(403).json({ error: 'Non autorisé' });
    }
    // Reassigning (changing assigned_to) is restricted to the owner
    if (assigned_to !== undefined && !isOwner) {
      return res.status(403).json({ error: 'Seul le créateur peut réaffecter un match' });
    }

    const setClauses = [];
    const params = [];
    if (status !== undefined)   { setClauses.push('status = ?');      params.push(status); }
    if (notes  !== undefined)   { setClauses.push('notes = ?');       params.push(notes);  }
    if (assigned_to !== undefined) {
      setClauses.push('assigned_to = ?');  params.push(assigned_to || null);
      setClauses.push('assigned_by = ?');  params.push(assigned_to ? req.user.id : null);
    }
    if (setClauses.length === 0) return res.status(400).json({ error: 'Rien à mettre à jour' });
    params.push(id);
    await pool.query(`UPDATE match_assignments SET ${setClauses.join(', ')} WHERE id = ?`, params);

    // Notify assigner when assignee confirms
    if (status === 'confirmed' && existing.assigned_by && existing.assigned_by !== req.user.id) {
      const [[scout]] = await pool.query(
        'SELECT p.full_name, u.email FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? LIMIT 1',
        [req.user.id]
      );
      const scoutName = scout?.full_name || scout?.email || 'Le scout';
      await createNotification(existing.assigned_by, {
        type: 'assignment_confirmed',
        title: 'Affectation confirmée',
        message: `${scoutName} a confirmé le match ${existing.home_team} – ${existing.away_team} (${existing.match_date}).`,
        icon: 'check-circle',
        link: '/org/roadmap',
      });
      // Award 5 credits to the scout who confirmed
      await ensureCreditTable();
      await pool.query(
        `INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description)
         VALUES (?, ?, 'assignment_confirmed', 'earn', 5, ?)`,
        [uuidv4(), req.user.id, `Affectation confirmée : ${existing.home_team} – ${existing.away_team}`]
      );
    }

    // Notify new assignee on (re)assignment
    const newAssignee = assigned_to !== undefined ? assigned_to : null;
    if (newAssignee && newAssignee !== req.user.id && newAssignee !== existing.assigned_to) {
      const [[assigner]] = await pool.query(
        'SELECT p.full_name, u.email FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? LIMIT 1',
        [req.user.id]
      );
      const assignerName = assigner?.full_name || assigner?.email || 'Un responsable';
      await createNotification(newAssignee, {
        type: 'match_assignment',
        title: 'Nouvelle affectation de match',
        message: `${assignerName} vous a assigné : ${existing.home_team} – ${existing.away_team} le ${existing.match_date}.`,
        icon: 'calendar',
        link: '/org/roadmap',
      });
    }

    const [[row]] = await pool.query('SELECT * FROM match_assignments WHERE id = ?', [id]);
    return res.json(row);
  } catch (err) {
    console.error('[match-assignments/update]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── Org Chat ─────────────────────────────────────────────────────────────────

// In-memory typing store (ephemeral — resets on server restart, which is fine)
const _orgTyping = new Map(); // orgId -> Map<userId, { name, photo, expiry }>
const TYPING_TTL_MS = 5000;

function setTypingUser(orgId, userId, name, photo) {
  if (!_orgTyping.has(orgId)) _orgTyping.set(orgId, new Map());
  _orgTyping.get(orgId).set(userId, { name, photo, expiry: Date.now() + TYPING_TTL_MS });
}

function getTypingUsers(orgId, selfUserId) {
  const map = _orgTyping.get(orgId);
  if (!map) return [];
  const now = Date.now();
  const result = [];
  for (const [uid, data] of map.entries()) {
    if (uid === selfUserId || data.expiry < now) { map.delete(uid); continue; }
    result.push({ user_id: uid, name: data.name, photo: data.photo });
  }
  return result;
}

const CHAT_BANNED_WORDS = [
  // Violence / menaces
  'tuer','meurtre','bombe','terroriste','massacre','viol','pedophile','pédophile',
  // Insultes graves
  'connard','encule','enculé','fdp','pd','pute','salope','nique','batard','bâtard',
  'merde','putain','cul','bite','couilles','chier',
  // Discrimination
  'nazi','hitler','raciste','negre','nègre','juif','arabe','gouine',
  // Anglais
  'fuck','shit','bitch','asshole','nigger','faggot','cunt','whore',
  'kill','murder','rape','terrorist',
];

function moderateOrgMessage(text) {
  const lower = text.toLowerCase().replace(/[^a-zàâäéèêëîïôùûüç0-9\s]/gi, ' ');
  for (const word of CHAT_BANNED_WORDS) {
    const re = new RegExp(`\\b${word}\\b`, 'i');
    if (re.test(lower)) return false;
  }
  return true;
}

async function ensureOrgMember(orgId, userId) {
  const [[row]] = await pool.query(
    "SELECT role FROM organization_members WHERE organization_id = ? AND user_id = ? LIMIT 1",
    [orgId, userId]
  );
  return row ?? null;
}

// GET /api/organizations/:orgId/messages
app.get("/api/organizations/:orgId/messages", authMiddleware, async (req, res) => {
  try {
    const { orgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const before = req.query.before || null; // cursor: created_at ISO
    const limit = Math.min(parseInt(req.query.limit) || 40, 80);

    const [rows] = await pool.query(`
      SELECT
        m.id, m.org_id, m.user_id, m.content, m.reply_to_id, m.edited_at, m.deleted_at, m.created_at,
        COALESCE(p.full_name, u.email)  AS author_name,
        p.photo_url                     AS author_photo,
        -- replied-to message snippet (null if soft-deleted)
        IF(rm.deleted_at IS NULL, rm.content, NULL) AS reply_content,
        COALESCE(rp.full_name, ru.email)            AS reply_author,
        -- reactions as JSON array
        (SELECT JSON_ARRAYAGG(JSON_OBJECT('emoji', r.emoji, 'user_id', r.user_id))
         FROM org_message_reactions r WHERE r.message_id = m.id) AS reactions
      FROM org_messages m
      LEFT JOIN users    u  ON u.id  = m.user_id
      LEFT JOIN profiles p  ON p.user_id = m.user_id
      LEFT JOIN org_messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users    ru ON ru.id = rm.user_id
      LEFT JOIN profiles rp ON rp.user_id = rm.user_id
      WHERE m.org_id = ?
        ${before ? 'AND m.created_at < ?' : ''}
      ORDER BY m.created_at DESC
      LIMIT ?
    `, before ? [orgId, before, limit] : [orgId, limit]);

    // Parse reactions JSON
    const messages = rows.map(r => ({
      ...r,
      reactions: r.reactions ? (typeof r.reactions === 'string' ? JSON.parse(r.reactions) : r.reactions) : [],
    }));

    return res.json({ messages: messages.reverse(), has_more: rows.length === limit });
  } catch (err) {
    console.error('[org-chat] GET messages:', err?.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/organizations/:orgId/messages
app.post("/api/organizations/:orgId/messages", authMiddleware, async (req, res) => {
  try {
    const { orgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const { content, reply_to_id } = req.body || {};
    if (!content || typeof content !== 'string') return res.status(400).json({ error: "content required" });

    // Anti-spam: 1 message per minute per user per org
    const [[lastMsg]] = await pool.query(
      "SELECT created_at FROM org_messages WHERE org_id = ? AND user_id = ? AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 1",
      [orgId, req.user.id]
    );
    if (lastMsg) {
      const elapsed = Date.now() - new Date(lastMsg.created_at).getTime();
      if (elapsed < 60000) {
        const retryAfter = Math.ceil((60000 - elapsed) / 1000);
        return res.status(429).json({ error: 'rate_limit', retry_after: retryAfter });
      }
    }

    const trimmed = content.trim().slice(0, 512);
    if (!trimmed) return res.status(400).json({ error: "empty" });
    if (!moderateOrgMessage(trimmed)) return res.status(422).json({ error: "moderation_failed" });

    // Validate reply_to_id: must exist and not be soft-deleted
    let validReplyId = null;
    let repliedToUserId = null;
    if (reply_to_id) {
      const [[replyMsg]] = await pool.query(
        "SELECT id, user_id FROM org_messages WHERE id = ? AND org_id = ? AND deleted_at IS NULL LIMIT 1",
        [reply_to_id, orgId]
      );
      if (replyMsg) { validReplyId = replyMsg.id; repliedToUserId = replyMsg.user_id; }
    }

    const id = uuidv4();
    await pool.query(
      "INSERT INTO org_messages (id, org_id, user_id, content, reply_to_id) VALUES (?, ?, ?, ?, ?)",
      [id, orgId, req.user.id, trimmed, validReplyId]
    );

    const [[sender]] = await pool.query(
      "SELECT COALESCE(p.full_name, u.email) AS name FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? LIMIT 1",
      [req.user.id]
    );
    const senderName = sender?.name ?? 'quelqu\'un';

    // Targeted reply notification (to the message author, if different from sender)
    if (validReplyId && repliedToUserId && repliedToUserId !== req.user.id) {
      createNotification(repliedToUserId, {
        type: 'organization',
        title: `${senderName} a répondu à votre message`,
        message: trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
        icon: 'Reply',
        link: `/organization/${orgId}/chat`,
      }).catch(() => {});
    }

    // General notification to other org members (excluding sender and already-notified reply target)
    const [members] = await pool.query(
      "SELECT user_id FROM organization_members WHERE organization_id = ? AND user_id != ? AND user_id != ?",
      [orgId, req.user.id, repliedToUserId ?? req.user.id]
    );
    for (const m of members) {
      createNotification(m.user_id, {
        type: 'organization',
        title: `Message de ${senderName}`,
        message: trimmed.length > 80 ? trimmed.slice(0, 80) + '…' : trimmed,
        icon: 'MessageSquare',
        link: `/organization/${orgId}/chat`,
      }).catch(() => {});
    }

    const [[msg]] = await pool.query(`
      SELECT m.id, m.org_id, m.user_id, m.content, m.reply_to_id, m.edited_at, m.deleted_at, m.created_at,
        COALESCE(p.full_name, u.email) AS author_name, p.photo_url AS author_photo,
        rm.content AS reply_content,
        COALESCE(rp.full_name, ru.email) AS reply_author
      FROM org_messages m
      LEFT JOIN users u ON u.id = m.user_id LEFT JOIN profiles p ON p.user_id = m.user_id
      LEFT JOIN org_messages rm ON rm.id = m.reply_to_id
      LEFT JOIN users ru ON ru.id = rm.user_id LEFT JOIN profiles rp ON rp.user_id = rm.user_id
      WHERE m.id = ?
    `, [id]);

    return res.json({ message: { ...msg, reactions: [] } });
  } catch (err) {
    console.error('[org-chat] POST message:', err?.message);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// DELETE /api/organizations/:orgId/messages/:msgId — soft delete (own, within 10 min)
app.delete("/api/organizations/:orgId/messages/:msgId", authMiddleware, async (req, res) => {
  try {
    const { orgId, msgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const [[msg]] = await pool.query("SELECT user_id, created_at FROM org_messages WHERE id = ? AND org_id = ?", [msgId, orgId]);
    if (!msg) return res.status(404).json({ error: "Not found" });

    const isAdmin = member.role === 'owner' || member.role === 'admin';
    const isOwn = msg.user_id === req.user.id;
    const ageMin = (Date.now() - new Date(msg.created_at).getTime()) / 60000;

    if (!isAdmin && (!isOwn || ageMin > 10)) return res.status(403).json({ error: "Cannot delete" });

    await pool.query("UPDATE org_messages SET deleted_at = NOW() WHERE id = ?", [msgId]);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// PUT /api/organizations/:orgId/messages/:msgId — edit own message (within 10 min)
app.put("/api/organizations/:orgId/messages/:msgId", authMiddleware, async (req, res) => {
  try {
    const { orgId, msgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const { content } = req.body || {};
    if (!content) return res.status(400).json({ error: "content required" });

    const trimmed = content.trim().slice(0, 512);
    if (!trimmed) return res.status(400).json({ error: "empty" });
    if (!moderateOrgMessage(trimmed)) return res.status(422).json({ error: "moderation_failed" });

    const [[msg]] = await pool.query("SELECT user_id, created_at, deleted_at FROM org_messages WHERE id = ? AND org_id = ?", [msgId, orgId]);
    if (!msg || msg.deleted_at) return res.status(404).json({ error: "Not found" });
    if (msg.user_id !== req.user.id) return res.status(403).json({ error: "Not your message" });
    if ((Date.now() - new Date(msg.created_at).getTime()) / 60000 > 10) return res.status(403).json({ error: "Edit window expired" });

    await pool.query("UPDATE org_messages SET content = ?, edited_at = NOW() WHERE id = ?", [trimmed, msgId]);
    return res.json({ ok: true, content: trimmed });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/organizations/:orgId/messages/:msgId/react — toggle emoji reaction
app.post("/api/organizations/:orgId/messages/:msgId/react", authMiddleware, async (req, res) => {
  try {
    const { orgId, msgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const { emoji } = req.body || {};
    const ALLOWED_EMOJI = ['👍','❤️','😂','😮','😢','🔥'];
    if (!ALLOWED_EMOJI.includes(emoji)) return res.status(400).json({ error: "Invalid emoji" });

    const [[existing]] = await pool.query(
      "SELECT 1 FROM org_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?",
      [msgId, req.user.id, emoji]
    );
    if (existing) {
      await pool.query("DELETE FROM org_message_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?", [msgId, req.user.id, emoji]);
      return res.json({ action: 'removed' });
    } else {
      await pool.query("INSERT INTO org_message_reactions (message_id, user_id, emoji) VALUES (?, ?, ?)", [msgId, req.user.id, emoji]);
      return res.json({ action: 'added' });
    }
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/organizations/:orgId/messages/read — mark messages as read
app.post("/api/organizations/:orgId/messages/read", authMiddleware, async (req, res) => {
  try {
    const { orgId } = req.params;
    await pool.query(
      "INSERT INTO org_message_reads (org_id, user_id) VALUES (?, ?) ON DUPLICATE KEY UPDATE last_read_at = NOW()",
      [orgId, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/organizations/:orgId/unread — unread message count
app.get("/api/organizations/:orgId/unread", authMiddleware, async (req, res) => {
  try {
    const { orgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.json({ count: 0 });

    const [[readRow]] = await pool.query(
      "SELECT last_read_at FROM org_message_reads WHERE org_id = ? AND user_id = ?",
      [orgId, req.user.id]
    );
    const since = readRow?.last_read_at;
    const [[countRow]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM org_messages WHERE org_id = ? AND user_id != ? AND deleted_at IS NULL ${since ? 'AND created_at > ?' : ''}`,
      since ? [orgId, req.user.id, since] : [orgId, req.user.id]
    );
    return res.json({ count: Number(countRow?.cnt ?? 0), last_read_at: since || null });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// POST /api/organizations/:orgId/typing — broadcast "I am typing"
app.post("/api/organizations/:orgId/typing", authMiddleware, async (req, res) => {
  try {
    const { orgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.status(403).json({ error: "Not a member" });

    const [[profile]] = await pool.query(
      "SELECT COALESCE(p.full_name, u.email) AS name, p.photo_url AS photo FROM users u LEFT JOIN profiles p ON p.user_id = u.id WHERE u.id = ? LIMIT 1",
      [req.user.id]
    );
    setTypingUser(orgId, req.user.id, profile?.name ?? 'Utilisateur', profile?.photo ?? null);
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// GET /api/organizations/:orgId/typing — who is currently typing
app.get("/api/organizations/:orgId/typing", authMiddleware, async (req, res) => {
  try {
    const { orgId } = req.params;
    const member = await ensureOrgMember(orgId, req.user.id);
    if (!member) return res.json({ users: [] });
    return res.json({ users: getTypingUsers(orgId, req.user.id) });
  } catch (err) {
    return res.status(500).json({ users: [] });
  }
});

// GET /api/admin/notifications — list notifications with optional filters
app.get("/api/admin/notifications", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const limitRaw = Number.parseInt(String(req.query.limit || "200"), 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 1000) : 200;

    const params = [];
    let whereSql = "";
    if (search) {
      whereSql = `WHERE (
        LOWER(n.title) LIKE ?
        OR LOWER(COALESCE(n.message, '')) LIKE ?
        OR LOWER(COALESCE(n.type, '')) LIKE ?
        OR LOWER(COALESCE(u.email, '')) LIKE ?
      )`;
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like, like);
    }

    const [rows] = await pool.query(
      `SELECT n.*, u.email AS user_email
       FROM notifications n
       LEFT JOIN users u ON u.id = n.user_id
       ${whereSql}
       ORDER BY n.created_at DESC
       LIMIT ${limit}`,
      params
    );
    return res.json(rows);
  } catch (err) {
    console.error("[admin/notifications] GET error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// DELETE /api/admin/notifications/:id — delete one notification
app.delete("/api/admin/notifications/:id", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [result] = await pool.query("DELETE FROM notifications WHERE id = ?", [req.params.id]);
    return res.json({ ok: true, deleted: result.affectedRows || 0 });
  } catch (err) {
    console.error("[admin/notifications] DELETE error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// POST /api/admin/notifications/purge-older-than — delete notifications older than X days
app.post("/api/admin/notifications/purge-older-than", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const daysRaw = Number.parseInt(String(req.body?.days || ""), 10);
    if (!Number.isFinite(daysRaw) || daysRaw < 1) {
      return res.status(400).json({ error: "Le nombre de jours doit être supérieur ou égal à 1." });
    }
    const [result] = await pool.query(
      "DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)",
      [daysRaw]
    );
    return res.json({ ok: true, deleted: result.affectedRows || 0 });
  } catch (err) {
    console.error("[admin/notifications/purge] error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// DELETE /api/admin/organizations/:id — admin-only organization deletion with notification reason
app.delete("/api/admin/organizations/:id", authMiddleware, ensureAdmin, async (req, res) => {
  const { id } = req.params;
  const { message } = req.body || {};

  try {
    const customMessage = String(message || "").trim().slice(0, 500);
    if (!customMessage) {
      return res.status(400).json({ error: "Un message de suppression est requis." });
    }

    const [orgRows] = await pool.query("SELECT name, logo_url FROM organizations WHERE id = ? LIMIT 1", [id]);
    if (!orgRows.length) return res.status(404).json({ error: "Organisation introuvable." });

    const orgName = orgRows[0].name;
    const logoUrl = orgRows[0]?.logo_url;
    await deleteImageFromDb(logoUrl);
    await deleteStoredFile(logoUrl);

    // Notify only members of the organization, not all users
    const [usersToNotify] = await pool.query("SELECT user_id AS id FROM organization_members WHERE organization_id = ?", [id]);
    for (const targetUser of usersToNotify) {
      await createNotification(targetUser.id, {
        type: "organization",
        title: `${orgName} a été supprimée`,
        message: customMessage,
        icon: "Building2",
        link: "/organization",
      });
    }

    if (orgName) {
      await pool.query(
        `UPDATE players SET club = '', updated_at = NOW()
         WHERE (club = ? OR LOWER(club) = LOWER(?))
           AND user_id IN (SELECT user_id FROM organization_members WHERE organization_id = ?)`,
        [orgName, orgName, id]
      );
    }

    if (orgName) {
      try { await pool.query("DELETE FROM club_directory WHERE club_name = ?", [orgName]); } catch {}
      try { await pool.query("DELETE FROM club_logos WHERE club_name = ?", [orgName]); } catch {}
    }

    await pool.query("DELETE FROM organizations WHERE id = ?", [id]);
    return res.json({ ok: true });
  } catch (err) {
    console.error("[admin/org/delete] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

app.get("/api/my-permissions", authMiddleware, async (req, res) => {
  try {
    const [roleRows] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
    const userRoles = roleRows.length > 0 ? roleRows.map(r => r.role) : ["user"];

    // Admin = full access, skip permission lookup
    if (userRoles.includes("admin")) {
      return res.json({ roles: userRoles, role: "admin", permissions: {} });
    }

    // Merge permissions from all roles (any role granting an action wins)
    const placeholders = userRoles.map(() => "?").join(",");
    const [perms] = await pool.query(
      `SELECT page_key, action, allowed FROM page_permissions WHERE role IN (${placeholders})`,
      userRoles
    );

    const permMap = {};
    for (const p of perms) {
      const dotKey = `${p.page_key}.${p.action}`;
      // Any role granting = allowed; only override false with true
      if (permMap[dotKey] === undefined || p.allowed) permMap[dotKey] = !!p.allowed;
      // Backward compat: page_key alone maps to the view action
      if (p.action === "view") {
        if (permMap[p.page_key] === undefined || p.allowed) permMap[p.page_key] = !!p.allowed;
      }
    }

    return res.json({ roles: userRoles, role: userRoles[0], permissions: permMap });
  } catch (err) {
    console.error("[my-permissions] Error:", err);
    return res.status(500).json({ error: "Erreur serveur." });
  }
});

// ── Admin Settings: test email, purge data, feature flags ─────────────────

// Test SMTP email
app.post("/api/admin/test-email", authMiddleware, ensureAdmin, async (req, res) => {
  const { to } = req.body || {};
  const recipient = to || req.user.email;
  if (!recipient) return res.status(400).json({ error: "No recipient" });
  try {
    const ok = await sendEmail(recipient, "[Scouty] Test email", `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px">
        <h2 style="color:#6366f1">Email de test</h2>
        <p>Si vous lisez ceci, la configuration SMTP fonctionne correctement.</p>
        <p style="font-size:12px;color:#9ca3af;margin-top:20px">Envoyé depuis le panneau d'administration Scouty le ${new Date().toLocaleString('fr-FR')}.</p>
      </div>
    `);
    if (!ok) return res.status(500).json({ error: "SMTP non configuré ou envoi échoué." });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Purge data by type
app.post("/api/admin/purge", authMiddleware, ensureAdmin, async (req, res) => {
  const { type } = req.body || {};
  const allowed = {
    players: "DELETE FROM players",
    reports: "DELETE FROM reports",
    contacts: "DELETE FROM contacts",
    fixtures: "DELETE FROM fixtures",
    match_assignments: "DELETE FROM match_assignments",
    watchlists: "DELETE FROM watchlists",
    shadow_teams: "DELETE FROM shadow_teams",
    community: "DELETE FROM community_posts",
    tickets: "DELETE FROM tickets",
    notifications: "DELETE FROM notifications",
    club_directory: "DELETE FROM club_directory",
    club_logos: "DELETE FROM club_logos",
    cache: "DELETE FROM api_football_cache",
  };
  if (!type || !allowed[type]) return res.status(400).json({ error: "Type invalide" });
  try {
    const [result] = await pool.query(allowed[type]);
    console.log(`[admin/purge] Purged ${type}: ${result.affectedRows} rows`);
    return res.json({ ok: true, deleted: result.affectedRows });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Feature flags — get all
app.get("/api/admin/feature-flags", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'feature_%'");
    const flags = {};
    for (const r of rows) flags[r.setting_key] = r.setting_value === '1';
    return res.json(flags);
  } catch {
    return res.json({});
  }
});

// Feature flags — toggle one
app.post("/api/admin/feature-flags", authMiddleware, ensureAdmin, async (req, res) => {
  const { key, enabled } = req.body || {};
  if (!key || !key.startsWith('feature_')) return res.status(400).json({ error: "Invalid key" });
  try {
    // Auto-create table if missing (schema.sql may not have been applied yet)
    await pool.query(`CREATE TABLE IF NOT EXISTS app_settings (
      setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
      setting_value VARCHAR(500) NOT NULL DEFAULT '1',
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )`).catch(() => {});
    await pool.query(
      `INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [key, enabled ? '1' : '0']
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/scrape-settings
app.get('/api/admin/scrape-settings', authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'scrape_%'"
    );
    const settings = {};
    for (const r of rows) settings[r.setting_key] = parseInt(r.setting_value, 10) || 0;
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/scrape-settings
app.post('/api/admin/scrape-settings', authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key || !key.startsWith('scrape_')) return res.status(400).json({ error: 'Invalid key' });
    const ms = Math.max(0, Math.min(60000, parseInt(value, 10) || 0));
    await pool.query(
      'INSERT INTO app_settings (setting_key, setting_value) VALUES (?, ?) ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)',
      [key, String(ms)]
    );
    _scrapeCache = null; // invalidate cache immediately
    res.json({ ok: true, key, value: ms });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Public endpoint: check if a feature is enabled (used by frontend)
app.get("/api/feature-flags", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'feature_%'");
    const flags = {};
    for (const r of rows) flags[r.setting_key] = r.setting_value === '1';
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json(flags);
  } catch {
    return res.json({});
  }
});

// ── Credits ─────────────────────────────────────────────────────────────────

const PLAN_QUOTAS = {
  starter: { daily: 10, weekly: 50, monthly: 150 },
  pro:     { daily: 100, weekly: 500, monthly: 2000 },
  elite:   { daily: -1, weekly: -1, monthly: -1 }, // -1 = unlimited
};

async function ensureCreditTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS user_credit_events (
    id CHAR(36) PRIMARY KEY,
    user_id CHAR(36) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    direction ENUM('earn','spend') NOT NULL DEFAULT 'spend',
    amount INT NOT NULL DEFAULT 1,
    description VARCHAR(255) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_uce_user_date (user_id, created_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`).catch(() => {});
  // Add direction column if table existed without it
  await pool.query(`ALTER TABLE user_credit_events ADD COLUMN IF NOT EXISTS direction ENUM('earn','spend') NOT NULL DEFAULT 'spend'`).catch(() => {});
}

async function getUserPlanType(userId) {
  try {
    const [rows] = await pool.query(
      "SELECT plan_type FROM user_subscriptions WHERE user_id = ? LIMIT 1",
      [userId]
    );
    return rows[0]?.plan_type || 'starter';
  } catch { return 'starter'; }
}

async function getUserCreditUsage(userId) {
  await ensureCreditTable();
  const [[dayRow], [weekRow], [monthRow], [earnRow]] = await Promise.all([
    pool.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM user_credit_events WHERE user_id = ? AND direction='spend' AND created_at >= DATE(NOW())",
      [userId]
    ),
    pool.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM user_credit_events WHERE user_id = ? AND direction='spend' AND created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)",
      [userId]
    ),
    pool.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM user_credit_events WHERE user_id = ? AND direction='spend' AND created_at >= DATE_FORMAT(NOW(),'%Y-%m-01')",
      [userId]
    ),
    pool.query(
      "SELECT COALESCE(SUM(amount),0) AS total FROM user_credit_events WHERE user_id = ? AND direction='earn'",
      [userId]
    ),
  ]);
  return {
    daily: Number(dayRow[0].total),
    weekly: Number(weekRow[0].total),
    monthly: Number(monthRow[0].total),
    earned_total: Number(earnRow[0].total),
  };
}

// Credit helpers ─────────────────────────────────────────────────────────────

/** Read-only check: can this user consume 1 enrichment credit? */
async function canUseCredit(userId) {
  await ensureCreditTable();
  const planType = await getUserPlanType(userId);
  const quotas = PLAN_QUOTAS[planType] || PLAN_QUOTAS.starter;
  if (quotas.daily === -1) return { ok: true }; // unlimited (elite)
  const usage = await getUserCreditUsage(userId);
  const earned = usage.earned_total || 0;
  const effectiveDaily   = quotas.daily   + earned;
  const effectiveWeekly  = quotas.weekly  + earned;
  const effectiveMonthly = quotas.monthly + earned;
  if (usage.daily   >= effectiveDaily)   return { ok: false, error: 'daily_limit',   quota: effectiveDaily,   used: usage.daily };
  if (usage.weekly  >= effectiveWeekly)  return { ok: false, error: 'weekly_limit',  quota: effectiveWeekly,  used: usage.weekly };
  if (usage.monthly >= effectiveMonthly) return { ok: false, error: 'monthly_limit', quota: effectiveMonthly, used: usage.monthly };
  return { ok: true };
}

/** Consume 1 enrichment credit (fire-and-forget safe, call after successful enrichment) */
async function spendCredit(userId, description) {
  await pool.query(
    "INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description) VALUES (?, ?, 'enrichment', 'spend', 1, ?)",
    [uuidv4(), userId, description || 'Enrichissement']
  );
}

// GET /api/credits/me — current user usage + quotas
app.get("/api/credits/me", authMiddleware, async (req, res) => {
  try {
    const planType = await getUserPlanType(req.user.id);
    const quotas = PLAN_QUOTAS[planType] || PLAN_QUOTAS.starter;
    const usage = await getUserCreditUsage(req.user.id);
    // Effective quotas = plan quota + all-time earned bonus (applies to all periods)
    const earned = usage.earned_total || 0;
    const effectiveQuotas = quotas.monthly === -1 ? quotas : {
      daily:   quotas.daily   + earned,
      weekly:  quotas.weekly  + earned,
      monthly: quotas.monthly + earned,
    };
    return res.json({ plan_type: planType, quotas: effectiveQuotas, usage });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/credits/consume — consume credits, enforce quotas
app.post("/api/credits/consume", authMiddleware, async (req, res) => {
  const { action_type, amount = 1, description } = req.body || {};
  if (!action_type) return res.status(400).json({ error: "action_type required" });

  try {
    await ensureCreditTable();
    const planType = await getUserPlanType(req.user.id);
    const quotas = PLAN_QUOTAS[planType] || PLAN_QUOTAS.starter;

    if (quotas.daily !== -1) {
      const usage = await getUserCreditUsage(req.user.id);
      const effectiveMonthly = quotas.monthly + (usage.earned_total || 0);
      if (usage.daily + amount > quotas.daily)
        return res.status(429).json({ error: "daily_limit", quota: quotas.daily, used: usage.daily });
      if (usage.weekly + amount > quotas.weekly)
        return res.status(429).json({ error: "weekly_limit", quota: quotas.weekly, used: usage.weekly });
      if (usage.monthly + amount > effectiveMonthly)
        return res.status(429).json({ error: "monthly_limit", quota: effectiveMonthly, used: usage.monthly });
    }

    await pool.query(
      "INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description) VALUES (?, ?, ?, 'spend', ?, ?)",
      [uuidv4(), req.user.id, action_type, amount, description || null]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// GET /api/admin/credits — admin overview of all users' usage
app.get("/api/admin/credits", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    await ensureCreditTable();
    const [rows] = await pool.query(`
      SELECT
        u.id, u.email,
        COALESCE(us.plan_type, 'starter') AS plan_type,
        COALESCE(SUM(CASE WHEN e.direction='spend' AND e.created_at >= DATE(NOW()) THEN e.amount ELSE 0 END), 0) AS used_today,
        COALESCE(SUM(CASE WHEN e.direction='spend' AND e.created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) THEN e.amount ELSE 0 END), 0) AS used_week,
        COALESCE(SUM(CASE WHEN e.direction='spend' AND e.created_at >= DATE_FORMAT(NOW(),'%Y-%m-01') THEN e.amount ELSE 0 END), 0) AS used_month,
        COALESCE(SUM(CASE WHEN e.direction='spend' THEN e.amount ELSE 0 END), 0) AS used_total,
        COALESCE(SUM(CASE WHEN e.direction='earn' THEN e.amount ELSE 0 END), 0) AS earned_total
      FROM users u
      LEFT JOIN user_subscriptions us ON us.user_id = u.id
      LEFT JOIN user_credit_events e ON e.user_id = u.id
      GROUP BY u.id, u.email, us.plan_type
      ORDER BY used_month DESC
      LIMIT 200
    `);
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/credits/grant — manually add or remove credits for a user
app.post("/api/admin/credits/grant", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    await ensureCreditTable();
    const { userId, amount, direction = 'earn', description = '' } = req.body || {};
    if (!userId || !amount || !Number.isFinite(Number(amount)) || Number(amount) <= 0) {
      return res.status(400).json({ error: 'userId et amount (>0) requis' });
    }
    if (!['earn', 'spend'].includes(direction)) {
      return res.status(400).json({ error: 'direction doit être earn ou spend' });
    }
    // Check user exists
    const [[user]] = await pool.query('SELECT id, email FROM users WHERE id = ? LIMIT 1', [userId]);
    if (!user) return res.status(404).json({ error: 'Utilisateur introuvable' });

    await pool.query(
      `INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description)
       VALUES (?, ?, 'admin_grant', ?, ?, ?)`,
      [uuidv4(), userId, direction, Math.round(Number(amount)), description.trim() || `Attribution manuelle par admin`]
    );
    return res.json({ ok: true, userId, amount: Math.round(Number(amount)), direction });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Club logos ──────────────────────────────────────────────────────────────

// Public read — no auth needed (logos are shared across all users)
app.get("/api/club-logos", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT club_name, logo_url, name_fr, name_en, name_es FROM club_logos");
    res.set('Cache-Control', 'public, max-age=604800');
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
    const [rows] = await pool.query(
      "SELECT club_name, competition, country, country_code, logo_url FROM club_directory ORDER BY country, competition, club_name"
    );
    return res.json(rows);
  } catch (err) {
    console.error("[club-directory] GET error:", err);
    return res.status(500).json({ error: "Server error" });
  }
});

// ── Admin: delete a club from local DB ──────────────────────────────────────
app.delete("/api/admin/club/:clubName", authMiddleware, async (req, res) => {
  try {
    // Check admin
    const [roles] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
    if (!roles.some(r => r.role === 'admin')) return res.status(403).json({ error: 'Admin only' });

    const name = decodeURIComponent(req.params.clubName);
    // Strip accents for matching: "Étienne" → "Etienne"
    const nameNoAccent = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    // Build all variants to match: exact, no-accent, Saint→St, etc.
    const variants = new Set([name, nameNoAccent]);
    // "Saint-Étienne" → "Saint-Etienne", "St Etienne", "St Étienne"
    if (/saint/i.test(name)) {
      variants.add(name.replace(/Saint[- ]?/gi, 'St ').trim());
      variants.add(nameNoAccent.replace(/Saint[- ]?/gi, 'St ').trim());
    }
    if (/^(FC|AC|AS|RC|SC)\s+/i.test(name)) {
      const noPrefix = name.replace(/^(FC|AC|AS|RC|SC)\s+/i, '').trim();
      variants.add(noPrefix);
      variants.add(noPrefix.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    }

    // Build SQL: match any variant with accent-insensitive collation
    const placeholders = [...variants].map(() => "club COLLATE utf8mb4_general_ci = ?").join(" OR ");
    const variantArr = [...variants];

    // 1. Detach all players with any club name variant
    const [updated] = await pool.query(
      `UPDATE players SET club = '', updated_at = NOW() WHERE ${placeholders}`,
      variantArr
    );
    console.log(`[admin/club] Detached ${updated.affectedRows} players from club "${name}" (variants: ${variantArr.join(', ')})`);

    // 2. Remove from player_org_shares where org name matches
    try {
      const orgPlaceholders = variantArr.map(() => "name COLLATE utf8mb4_general_ci = ?").join(" OR ");
      const [orgRows] = await pool.query(`SELECT id FROM organizations WHERE ${orgPlaceholders}`, variantArr);
      for (const org of orgRows) {
        await pool.query("DELETE FROM player_org_shares WHERE organization_id = ?", [org.id]);
      }
    } catch {}

    // 3. Remove from internal club tables (accent-insensitive)
    const cdPlaceholders = variantArr.map(() => "club_name COLLATE utf8mb4_general_ci = ?").join(" OR ");
    await pool.query(`DELETE FROM club_directory WHERE ${cdPlaceholders}`, variantArr);
    await pool.query(`DELETE FROM club_logos WHERE ${cdPlaceholders}`, variantArr);

    // 4. Clear cache entries
    try {
      await pool.query("DELETE FROM api_football_cache WHERE cache_key LIKE ?", [`%${nameNoAccent.replace(/%/g, '')}%`]);
    } catch {}

    // 5. Remove from followed clubs
    try {
      const fcPlaceholders = variantArr.map(() => "club_name COLLATE utf8mb4_general_ci = ?").join(" OR ");
      await pool.query(`DELETE FROM followed_clubs WHERE ${fcPlaceholders}`, variantArr);
    } catch {}

    // 6. Remove from championship_players
    try {
      await pool.query(`DELETE FROM championship_players WHERE player_id IN (SELECT id FROM players WHERE club IS NULL AND updated_at > NOW() - INTERVAL 5 SECOND)`);
    } catch {}

    return res.json({ ok: true, deleted: name, playersDetached: updated.affectedRows });
  } catch (err) {
    console.error("[admin/club] DELETE error:", err);
    return res.status(500).json({ error: err.message });
  }
});

// ── Club coordinates (for MapView) ───────────────────────────────────────────
app.get("/api/club-locations", async (req, res) => {
  try {
    await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6) NULL").catch(() => {});
    await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lng DECIMAL(9,6) NULL").catch(() => {});
    const [rows] = await pool.query(
      "SELECT club_name, country, lat, lng FROM club_directory WHERE lat IS NOT NULL AND lng IS NOT NULL"
    );
    res.json(rows);
    // Background: find player clubs not yet geocoded and geocode up to 5
    setImmediate(async () => {
      try {
        const [missing] = await pool.query(`
          SELECT p.club, MAX(p.nationality) AS country
          FROM players p
          LEFT JOIN club_directory cd ON cd.club_name = p.club AND cd.lat IS NOT NULL
          WHERE p.club IS NOT NULL AND p.club != '' AND (p.is_archived = 0 OR p.is_archived IS NULL)
            AND cd.club_name IS NULL
          GROUP BY p.club
          LIMIT 5
        `);
        for (const pc of missing) {
          await new Promise(r => setTimeout(r, 1200));
          const geo = await geocodeClub(pc.club, pc.country || '');
          if (geo) {
            await pool.query(
              `INSERT INTO club_directory (club_name, country, lat, lng) VALUES (?, ?, ?, ?)
               ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)`,
              [pc.club, pc.country || '', geo.lat, geo.lng]
            ).catch(() => {});
          }
        }
      } catch {}
    });
  } catch {
    res.json([]);
  }
});

// ── Auto-geocode a club via Nominatim ────────────────────────────────────────
app.post("/api/club-geocode", authMiddleware, async (req, res) => {
  const { clubName, country } = req.body || {};
  if (!clubName) return res.status(400).json({ error: "clubName required" });
  const geo = await geocodeClub(clubName, country || '');
  if (!geo) return res.status(404).json({ error: "Club introuvable sur OpenStreetMap. Essayez les coordonnées manuelles." });
  try {
    await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6) NULL").catch(() => {});
    await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lng DECIMAL(9,6) NULL").catch(() => {});
    // UPSERT: insert if not exists, update lat/lng if exists
    await pool.query(
      `INSERT INTO club_directory (club_name, country, lat, lng)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)`,
      [clubName, country || '', geo.lat, geo.lng]
    );
  } catch {}
  return res.json({ ok: true, lat: geo.lat, lng: geo.lng });
});

// ── Manual lat/lng override for a club ──────────────────────────────────────
app.patch("/api/club-geocode-manual", authMiddleware, async (req, res) => {
  const { clubName, country, lat, lng } = req.body || {};
  if (!clubName || lat == null || lng == null) return res.status(400).json({ error: "clubName, lat et lng requis" });
  const latN = parseFloat(lat), lngN = parseFloat(lng);
  if (isNaN(latN) || isNaN(lngN) || latN < -90 || latN > 90 || lngN < -180 || lngN > 180) {
    return res.status(400).json({ error: "Coordonnées invalides" });
  }
  try {
    await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6) NULL").catch(() => {});
    await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lng DECIMAL(9,6) NULL").catch(() => {});
    await pool.query(
      `INSERT INTO club_directory (club_name, country, lat, lng)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng)`,
      [clubName, country || '', latN, lngN]
    );
    return res.json({ ok: true, lat: latN, lng: lngN });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Search clubs in local DB (autocomplete) ──────────────────────────────────
app.get("/api/club-search", async (req, res) => {
  const q       = String(req.query.q       || "").trim();
  const country = String(req.query.country || "").trim();

  // At least one search criterion required
  if (q.length < 2 && !country) return res.json([]);

  try {
    if (country && !q) {
      // Country-only filter: return all clubs from that country
      const like = `%${country}%`;
      const [rows] = await pool.query(
        `SELECT club_name, logo_url, competition, country, country_code
         FROM club_directory
         WHERE country LIKE ? OR country_code LIKE ?
         ORDER BY competition, club_name
         LIMIT 60`,
        [like, like]
      );
      return res.json(rows);
    }

    const like = `%${q}%`;
    // When a country filter is also applied, restrict to that country
    const countryClause = country ? `AND (cd.country LIKE ? OR cd.country_code LIKE ?)` : '';
    const countryParams = country ? [`%${country}%`, `%${country}%`] : [];

    const [rows] = await pool.query(`
      SELECT DISTINCT club_name, logo_url, competition, country, country_code
      FROM (
        SELECT cd.club_name, cd.logo_url, cd.competition, cd.country, cd.country_code
        FROM club_directory cd
        WHERE cd.club_name LIKE ? ${countryClause}
        UNION
        SELECT cl.club_name, cl.logo_url, '' AS competition, '' AS country, '' AS country_code
        FROM club_logos cl
        WHERE cl.club_name LIKE ?
          AND cl.club_name NOT IN (SELECT club_name FROM club_directory WHERE club_name LIKE ?)
          ${country ? 'AND 0' : ''}
      ) combined
      ORDER BY
        CASE WHEN club_name LIKE ? THEN 0 ELSE 1 END,
        club_name
      LIMIT 20
    `, [like, ...countryParams, like, like, `${q}%`]);
    return res.json(rows);
  } catch (err) {
    return res.json([]);
  }
});

// ── List distinct countries from club_directory ──────────────────────────────
app.get("/api/club-countries", async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT DISTINCT country, country_code,
              COUNT(*) AS club_count
       FROM club_directory
       WHERE country IS NOT NULL AND country != ''
       GROUP BY country, country_code
       ORDER BY club_count DESC, country`
    );
    res.set('Cache-Control', 'public, max-age=3600');
    return res.json(rows);
  } catch (err) {
    return res.json([]);
  }
});

// ── Nominatim geocoding helper (OpenStreetMap, no API key required) ─────────
async function geocodeClub(clubName, country) {
  // ── Check persistent cache first (coords never change) ──────────────────
  const cacheKey = `${clubName}|${country || ''}`.toLowerCase();
  try {
    const [cached] = await pool.query(
      'SELECT lat, lng FROM club_geocoding_cache WHERE cache_key = ? LIMIT 1',
      [cacheKey]
    );
    if (cached.length > 0) return { lat: parseFloat(cached[0].lat), lng: parseFloat(cached[0].lng) };
  } catch { /* graceful */ }

  const HDRS = { 'User-Agent': 'ScoutyApp/1.0 (contact@scouty.app)', 'Accept-Language': 'fr,en' };
  const query = async (q) => {
    try {
      const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=5&addressdetails=1`;
      const resp = await fetch(url, { headers: HDRS, signal: AbortSignal.timeout(6000) });
      if (!resp.ok) return null;
      return await resp.json();
    } catch { return null; }
  };
  const pick = (data) => {
    if (!data?.length) return null;
    // Prefer sports facility/stadium → then city/town → then anything
    const sport = data.find(r => ['leisure', 'amenity', 'sport', 'club'].includes(r.class));
    const place = data.find(r => r.class === 'place' && ['city', 'town', 'village', 'suburb'].includes(r.type));
    const best = sport || place || data[0];
    if (best?.lat && best?.lon) return { lat: parseFloat(best.lat), lng: parseFloat(best.lon) };
    return null;
  };
  // Strip common football prefixes to expose the city name
  const stripped = clubName
    .replace(/^(AS|FC|AC|SC|OGC|US|AJ|SM|RC|AO|SL|CF|SD|RB|BV|SV|VfB|VfL|TSG|FSV|SG|FK|SK|NK|HNK|GNK|MFK|TJ|Stade|Sporting|Athletic|Racing|Real|Atlético|Inter|United|City|Town|Rovers|Wanderers|Dynamo|Lokomotiv|Spartak|Zenit|Slavia|Rapid)\s+/i, '')
    .replace(/\s+/g, ' ').trim();
  const tries = [
    country ? `${clubName} football ${country}` : `${clubName} football`,
    country ? `${clubName} ${country}` : clubName,
    stripped !== clubName && country ? `${stripped} football ${country}` : null,
    stripped !== clubName && country ? `${stripped} ${country}` : null,
    stripped !== clubName ? stripped : null,
  ].filter(Boolean);
  for (const q of tries) {
    const data = await query(q);
    const r = pick(data);
    if (r) {
      // Persist result — stadium coordinates are effectively permanent
      pool.query(
        'INSERT INTO club_geocoding_cache (cache_key, lat, lng) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE lat = VALUES(lat), lng = VALUES(lng), cached_at = NOW()',
        [cacheKey, r.lat, r.lng]
      ).catch(() => {});
      return r;
    }
  }
  return null;
}

// ── Transfermarkt club profile scraping ────────────────────────────────────
app.get("/api/club-tm/:clubId", async (req, res) => {
  const { clubId } = req.params;
  if (!clubId || !/^\d+$/.test(clubId)) return res.status(400).json({ error: "Invalid club ID" });

  try {
    const cacheKey = `tm-club:${clubId}`;
    try {
      const [cached] = await pool.query(
        "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
        [cacheKey]
      );
      if (cached.length > 0) {
        return res.json(typeof cached[0].response_json === "string" ? JSON.parse(cached[0].response_json) : cached[0].response_json);
      }
    } catch {}

    const url = `https://www.transfermarkt.fr/club/startseite/verein/${clubId}`;
    const resp = await fetch(url, { headers: TM_HEADERS, signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return res.status(502).json({ error: `TM returned ${resp.status}` });
    const html = await resp.text();

    // Club name — directly inside <h1 class="data-header__headline-wrapper...">Club Name</h1>
    const nameM = html.match(/<h1[^>]*class="[^"]*data-header__headline-wrapper[^"]*"[^>]*>\s*([\s\S]*?)\s*<\/h1>/);
    let clubName = "";
    if (nameM) {
      // Strip any inner HTML tags (<b>, <strong>, etc.) and trim
      clubName = nameM[1].replace(/<[^>]+>/g, "").trim();
    }
    // Fallback: <title> tag
    if (!clubName) {
      const titleM = html.match(/<title>([^|<]+)/);
      if (titleM) clubName = titleM[1].replace(/[-–].*$/, "").trim();
    }

    // Badge — in data-header__profile-container <img src="...">
    const badgeM = html.match(/data-header__profile-container[\s\S]*?<img[^>]*src="([^"]+)"/);
    const badge = badgeM ? badgeM[1] : null;

    // League/competition — <span class="data-header__club"...><a>League Name</a>
    const leagueM = html.match(/<span[^>]*class="[^"]*data-header__club[^"]*"[^>]*>[\s\S]*?<a[^>]*>\s*([^<]+)/);
    const league = leagueM ? leagueM[1].trim() : "";

    // Country — <img title="Country" class="...flaggenrahmen...">
    const countryM = html.match(/<img[^>]*title="([^"]+)"[^>]*class="[^"]*flaggenrahmen/);
    const country = countryM ? countryM[1].trim() : "";

    // Stadium — "Stade:" or "Stadium:" label in data-header
    const stadiumM = html.match(/(?:Stade|Stadium)\s*:[\s\S]*?<a[^>]*title="[^"]*"[^>]*href="[^"]*\/stadion\/[^"]*">([^<]+)/i)
      || html.match(/(?:Stade|Stadium)\s*:[\s\S]*?<a[^>]*>([^<]+)/i);
    const stadium = stadiumM ? stadiumM[1].trim() : null;

    // Squad size — "Taille de l'effectif:" or "Squad size:"
    const squadM = html.match(/(?:Taille de l.effectif|Squad size|Effectif)\s*:[\s\S]*?data-header__content[^>]*>\s*(\d+)/i);
    const squadSize = squadM ? parseInt(squadM[1]) : null;

    // Average age — "Âge moyen:" or "Average age:"
    const avgAgeM = html.match(/(?:Âge moyen|Average age|ge moyen)\s*:[\s\S]*?data-header__content[^>]*>\s*([\d,\.]+)/i);
    const avgAge = avgAgeM ? avgAgeM[1].replace(",", ".") : null;

    // Market value — data-header__market-value-wrapper
    const mvM = html.match(/data-header__market-value-wrapper[^>]*>([\d\s,.]+)\s*<span class="waehrung">([^<]+)<\/span>/);
    const marketValue = mvM ? `${mvM[1].trim()} ${mvM[2].trim()}` : null;

    const result = {
      clubId,
      clubName,
      badge,
      league,
      country,
      stadium,
      squadSize,
      avgAge,
      marketValue,
      tmUrl: `https://www.transfermarkt.fr/club/startseite/verein/${clubId}`,
      source: "transfermarkt",
    };

    // Cache 24h
    try {
      await pool.query(
        `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
        [cacheKey, JSON.stringify(result)]
      );
    } catch {}

    // Upsert club_directory + club_logos + geocoordinates
    if (clubName) {
      try {
        // Ensure lat/lng columns exist (migration)
        await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lat DECIMAL(9,6) NULL").catch(() => {});
        await pool.query("ALTER TABLE club_directory ADD COLUMN IF NOT EXISTS lng DECIMAL(9,6) NULL").catch(() => {});
        // Check if coordinates already stored
        const [existing] = await pool.query("SELECT lat, lng FROM club_directory WHERE club_name = ? LIMIT 1", [clubName]);
        let lat = existing[0]?.lat ?? null;
        let lng = existing[0]?.lng ?? null;
        // Geocode if we don't have coordinates yet
        if (!lat || !lng) {
          const geo = await geocodeClub(clubName, country);
          if (geo) { lat = geo.lat; lng = geo.lng; }
        }
        await pool.query(
          `INSERT INTO club_directory (club_name, competition, country, logo_url, lat, lng)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             competition = COALESCE(NULLIF(VALUES(competition),''), competition),
             country = COALESCE(NULLIF(VALUES(country),''), country),
             logo_url = COALESCE(VALUES(logo_url), logo_url),
             lat = COALESCE(VALUES(lat), lat),
             lng = COALESCE(VALUES(lng), lng)`,
          [clubName, league, country, badge, lat, lng]
        );
        if (badge) {
          await pool.query("INSERT INTO club_logos (club_name, logo_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE logo_url = VALUES(logo_url)", [clubName, badge]);
        }
      } catch {}
    }

    return res.json(result);
  } catch (err) {
    console.error("[club-tm] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Transfermarkt club search (find club ID by name) ────────────────────────
app.get("/api/club-tm-search", async (req, res) => {
  const q = String(req.query.q || "").trim();
  if (!q) return res.status(400).json({ error: "Missing q" });
  try {
    const searchUrl = `https://www.transfermarkt.fr/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(q)}`;
    const resp = await fetch(searchUrl, { headers: TM_HEADERS, signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return res.status(502).json({ error: `TM returned ${resp.status}` });
    const html = await resp.text();

    // TM rows put `title` BEFORE `href` in the anchor — parse attributes
    // order-agnostically. The previous order-sensitive regex never matched and
    // the fallback could grab arbitrary verein links elsewhere on the page,
    // attributing them to whatever club the user typed in.
    const clubs = [];
    const seen = new Set();
    const anchorRegex = /<td[^>]*class="[^"]*hauptlink[^"]*"[^>]*>\s*<a\b([^>]+)>([^<]*)<\/a>/g;
    const decodeAttr = s => String(s || "").replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
    let am;
    while ((am = anchorRegex.exec(html)) !== null && clubs.length < 10) {
      const attrs = am[1];
      const hrefM = attrs.match(/href="\/([\w-]+)\/startseite\/verein\/(\d+)"/);
      if (!hrefM) continue;
      const clubId = hrefM[2];
      if (seen.has(clubId)) continue;
      seen.add(clubId);
      const titleM = attrs.match(/title="([^"]*)"/);
      clubs.push({
        slug: hrefM[1],
        clubId,
        clubName: decodeAttr(titleM ? titleM[1] : am[2]),
      });
    }

    if (clubs.length === 0) return res.json(null);

    // Prefer the row whose name equals the query (accent/case insensitive);
    // otherwise the first row. Without this, a query like "FC Lyon" could
    // resolve to a youth/reserve team that happens to be listed first.
    const norm = s => String(s || "").normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
    const qNorm = norm(q);
    const best = clubs.find(c => norm(c.clubName) === qNorm) || clubs[0];

    // The wappen URL is already in the search row (suche-vereinswappen cell)
    // and references the numeric club ID. Match by ID so we never pick up a
    // neighbouring row's logo by mistake.
    const badgeRowM = html.match(new RegExp(`suche-vereinswappen[\\s\\S]*?<img[^>]*src="([^"]*\\/wappen\\/[^"]*\\/${best.clubId}\\.[a-z]+[^"]*)"`));
    if (badgeRowM) {
      const badge = badgeRowM[1].replace('/wappen/small/', '/wappen/head/');
      try {
        await pool.query(
          "INSERT INTO club_logos (club_name, logo_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE logo_url = VALUES(logo_url), updated_at = NOW()",
          [best.clubName.slice(0, 255), badge]
        );
      } catch {}
      return res.json({
        clubId: best.clubId,
        clubName: best.clubName,
        badge,
        tmUrl: `https://www.transfermarkt.fr/${best.slug}/startseite/verein/${best.clubId}`,
        source: 'transfermarkt',
      });
    }

    // No badge in the row — fall back to the full profile fetch (also
    // populates club_directory + geocoords).
    const profileResp = await fetch(`${req.protocol}://${req.get("host")}/api/club-tm/${best.clubId}`);
    const profile = profileResp.ok ? await profileResp.json() : best;

    return res.json(profile);
  } catch (err) {
    console.error("[club-tm-search] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Transfermarkt coach search ───────────────────────────────────────────────
app.get("/api/tm/coach-search", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  const q = String(req.query.q || '').trim();
  if (!q) return res.status(400).json({ error: 'Missing q' });
  try {
    const searchUrl = `https://www.transfermarkt.fr/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(q)}&Trainer_page=1`;
    const resp = await fetch(searchUrl, { headers: TM_HEADERS, signal: AbortSignal.timeout(12000) });
    if (!resp.ok) return res.status(502).json({ error: `TM ${resp.status}` });
    const html = await resp.text();

    const results = [];
    // Match coach links: /firstname-lastname/profil/trainer/12345
    const re = /href="\/([\w-]+)\/profil\/trainer\/(\d+)"[^>]*title="([^"]*)"/g;
    let m;
    while ((m = re.exec(html)) !== null && results.length < 6) {
      const slug = m[1], coachId = m[2], name = m[3];
      if (results.some(r => r.coachId === coachId)) continue;
      // Get nationality from nearby flag
      const snippet = html.slice(Math.max(0, m.index - 200), m.index + 500);
      const natMatch = snippet.match(/flaggenrahmen[^>]*title="([^"]+)"/);
      const clubMatch = snippet.match(/href="\/[^/]+\/startseite\/verein\/\d+"[^>]*title="([^"]*)"/);
      results.push({ coachId, slug, name, nationality: natMatch?.[1] ?? null, currentClub: clubMatch?.[1] ?? null });
    }
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err?.message });
  }
});

// ── Transfermarkt coach profile scrape ───────────────────────────────────────
app.post("/api/admin/enrich-coach/:playerId", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  const { playerId } = req.params;
  const { tmCoachId, tmCoachSlug } = req.body || {};
  if (!tmCoachId) return res.status(400).json({ error: 'tmCoachId required' });

  const cacheKey = `tm_coach_${tmCoachId}`;
  try {
    // Check cache (7 days)
    const [cached] = await pool.query(
      'SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW()',
      [cacheKey]
    );
    if (cached.length > 0) {
      const data = typeof cached[0].response_json === 'string' ? JSON.parse(cached[0].response_json) : cached[0].response_json;
      await applyCoachData(playerId, data);
      return res.json({ ok: true, ...data, from_cache: true });
    }

    const slug = tmCoachSlug || 'coach';
    const profileUrl = `https://www.transfermarkt.fr/${slug}/profil/trainer/${tmCoachId}`;
    const resp = await fetch(profileUrl, { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return res.status(502).json({ error: `TM returned ${resp.status}` });
    const html = await resp.text();

    // ── Parse coach profile ──
    // Name
    const nameMatch = html.match(/class="[^"]*data-header__headline[^"]*"[^>]*>[\s\S]*?<[^>]*>([^<]+)<\/[^>]*>\s*([^<]+)</);
    const coachName = nameMatch ? (nameMatch[2] || nameMatch[1]).trim() : null;

    // Photo
    const photoMatch = html.match(/class="[^"]*data-header__profile-image[^"]*"[^>]*src="([^"]+)"/);
    const rawPhoto = photoMatch?.[1] ?? null;
    // TM returns small images like /small/ — upgrade to /big/
    const photoUrl = rawPhoto ? rawPhoto.replace('/small/', '/big/').replace('/verysmall/', '/big/') : null;

    // DOB / nationality from data-header
    const headerSection = html.match(/class="data-header__details"([\s\S]{0,3000})/)?.[1] ?? html.slice(0, 6000);
    const dobMatch = headerSection.match(/(\d{2}\.\d{2}\.\d{4})/);
    const dateOfBirth = dobMatch ? dobMatch[1].split('.').reverse().join('-') : null;
    const natMatch = headerSection.match(/flaggenrahmen[^>]*title="([^"]+)"/);
    const nationality = natMatch?.[1] ?? null;

    // License (look for "Diplôme" or "Licence")
    const licenseMatch = html.match(/(?:Dipl[oô]me|Licence)[^:]*:?\s*<[^>]*>([^<]+)</i);
    const coachingLicense = licenseMatch ? licenseMatch[1].trim() : null;

    // ── Parse coaching career table ──
    const career = [];
    // TM uses a table with id "yw1" for coaching career
    const careerSection = html.match(/id="yw1"[\s\S]{0,20000}/)?.[0] ?? '';
    const rowRe = /<tr[^>]*class="[^"]*(?:odd|even)[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
    let rowMatch;
    while ((rowMatch = rowRe.exec(careerSection)) !== null && career.length < 30) {
      const row = rowMatch[1];
      // Club name
      const clubM = row.match(/class="[^"]*hauptlink[^"]*"[^>]*>\s*<a[^>]*title="([^"]*)"/);
      if (!clubM) continue;
      const club = clubM[1];
      // Club logo
      const logoM = row.match(/<img[^>]*src="([^"]*\/wappen\/[^"]*)"[^>]*>/);
      const clubLogo = logoM?.[1] ?? null;
      // Period
      const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(c => c[1].replace(/<[^>]+>/g, '').trim());
      const period = cells.find(c => /\d{4}/.test(c) && c.includes('-')) ?? '';
      const [from, to] = period.split('-').map(s => s.trim());
      // Stats (games/wins/draws/losses)
      const nums = cells.filter(c => /^\d+$/.test(c)).map(Number);
      career.push({
        club,
        club_logo: clubLogo,
        from: from || '',
        to: to || 'présent',
        role: 'Entraîneur principal',
        games: nums[0] ?? null,
        wins: nums[1] ?? null,
        draws: nums[2] ?? null,
        losses: nums[3] ?? null,
      });
    }

    const data = { coachName, photoUrl, dateOfBirth, nationality, coachingLicense, career, tmCoachId, profileUrl };

    // Cache 7 days
    const exp = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      'INSERT INTO api_football_cache (cache_key, response_json, expires_at) VALUES (?,?,?) ON DUPLICATE KEY UPDATE response_json=VALUES(response_json), expires_at=VALUES(expires_at)',
      [cacheKey, JSON.stringify(data), exp]
    ).catch(() => {});

    await applyCoachData(playerId, data);
    return res.json({ ok: true, ...data });
  } catch (err) {
    console.error('[enrich-coach] Error:', err?.message);
    res.status(500).json({ error: err?.message });
  }

  async function applyCoachData(pid, data) {
    const updates = {
      tm_coach_id: data.tmCoachId || null,
      coaching_career: data.career?.length ? JSON.stringify(data.career) : null,
      coaching_license: data.coachingLicense || null,
    };
    if (data.nationality) updates.nationality = data.nationality;
    if (data.dateOfBirth) updates.date_of_birth = data.dateOfBirth;
    if (data.coachName) updates.name = data.coachName;
    const sets = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    await pool.query(`UPDATE players SET ${sets}, updated_at = NOW() WHERE id = ?`, [...Object.values(updates), pid]);

    // If photo — download and store in DB
    if (data.photoUrl) {
      try {
        const photoResp = await fetch(data.photoUrl, { headers: TM_HEADERS, signal: AbortSignal.timeout(10000) });
        if (photoResp.ok) {
          const buf = Buffer.from(await photoResp.arrayBuffer());
          if (buf.length < 5 * 1024 * 1024) {
            const imgId = require('crypto').randomUUID();
            await pool.query('INSERT INTO uploaded_images (id, data, mime_type) VALUES (?, ?, ?)', [imgId, buf, 'image/jpeg']);
            await pool.query('UPDATE players SET photo_url = ? WHERE id = ?', [`/api/images/${imgId}`, pid]);
          }
        }
      } catch { /* photo import non-critique */ }
    }
  }
});

// ── Transfermarkt former players + honours ──────────────────────────────────
app.get("/api/club-tm-history/:clubId", async (req, res) => {
  const { clubId } = req.params;
  if (!clubId || !/^\d+$/.test(clubId)) return res.status(400).json({ error: "Invalid club ID" });

  const cacheKey = `club_history_${clubId}`;
  try {
    const [cached] = await pool.query(
      "SELECT response_data FROM api_football_cache WHERE cache_key = ? AND created_at > DATE_SUB(NOW(), INTERVAL 30 DAY) LIMIT 1",
      [cacheKey]
    );
    if (cached.length > 0) {
      res.set('Cache-Control', 'public, max-age=2592000');
      return res.json(JSON.parse(cached[0].response_data));
    }
  } catch {}

  try {
    // Scrape former players page
    const formerUrl = `https://www.transfermarkt.fr/a/alteAkte/verein/${clubId}/sort/stintende/plus/1`;
    const formerResp = await fetch(formerUrl, { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) });
    const formerHtml = formerResp.ok ? await formerResp.text() : '';

    const formerPlayers = [];
    if (formerHtml) {
      // Match table rows with player data
      const rowRx = /<tr[^>]*class="(?:odd|even)[^"]*"[^>]*>([\s\S]*?)<\/tr>/g;
      let rm;
      while ((rm = rowRx.exec(formerHtml)) !== null && formerPlayers.length < 30) {
        const row = rm[1];
        const nameM = row.match(/class="(?:hauptlink|zentriert hauptlink)[^"]*"[^>]*>[\s\S]*?<a[^>]+>([^<]{2,60})<\/a>/);
        if (!nameM) continue;
        const name = nameM[1].trim();
        if (!name || name.length < 2 || /[<>]/.test(name)) continue;
        const natM = row.match(/class="flaggenrahmen[^"]*"[^>]*title="([^"]{2,50})"/);
        const posM = row.match(/<td[^>]*title="([^"]{2,30})"[^>]*>[\s\S]*?<\/td>/);
        const years = [...row.matchAll(/>(\d{4})<\//g)].map(m => m[1]);
        formerPlayers.push({
          name,
          nationality: natM ? natM[1] : null,
          position: posM ? posM[1] : null,
          from: years[0] || null,
          to: years[1] || null,
        });
      }
    }

    // Scrape honours/trophies page
    const honoursUrl = `https://www.transfermarkt.fr/a/erfolge/verein/${clubId}`;
    const honoursResp = await fetch(honoursUrl, { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) });
    const honoursHtml = honoursResp.ok ? await honoursResp.text() : '';

    const honours = [];
    if (honoursHtml) {
      // TM honours page has: <div class="row" ...><div class="col-sm-4">TROPHY NAME</div><div class="col-sm-8">COUNT × (YEAR, YEAR...)</div>
      const blockRx = /<div[^>]*class="[^"]*erfolg_bereich[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
      // Fallback: look for achievement rows
      const rowRx2 = /<td[^>]*class="[^"]*hauptlink[^"]*"[^>]*>([\s\S]*?)<\/td>[\s\S]*?<td[^>]*>([\s\S]*?)<\/td>/g;
      let hm;
      while ((hm = rowRx2.exec(honoursHtml)) !== null && honours.length < 30) {
        const trophyRaw = hm[1].replace(/<[^>]+>/g, '').trim();
        const countRaw = hm[2].replace(/<[^>]+>/g, '').trim();
        if (!trophyRaw || trophyRaw.length < 2) continue;
        const count = parseInt(countRaw) || 1;
        honours.push({ trophy: trophyRaw, count });
      }
    }

    const result = { formerPlayers, honours };
    await pool.query(
      "INSERT INTO api_football_cache (cache_key, response_data, created_at) VALUES (?, ?, NOW()) ON DUPLICATE KEY UPDATE response_data = VALUES(response_data), created_at = NOW()",
      [cacheKey, JSON.stringify(result)]
    ).catch(() => {});

    res.set('Cache-Control', 'public, max-age=2592000');
    return res.json(result);
  } catch (err) {
    console.error("[club-tm-history] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Transfermarkt player injuries scraping ─────────────────────────────────
app.get("/api/player-tm-injuries/:tmId", authMiddleware, async (req, res) => {
  const { tmId } = req.params;
  if (!tmId || !/^\d+$/.test(tmId)) return res.status(400).json({ error: "Invalid TM ID" });

  const TM_DOMAIN_BY_LANG = { fr: "transfermarkt.fr", en: "transfermarkt.com", es: "transfermarkt.es" };
  const langRaw = String(req.query.lang || "fr").toLowerCase().slice(0, 2);
  const lang = TM_DOMAIN_BY_LANG[langRaw] ? langRaw : "fr";
  const tmDomain = TM_DOMAIN_BY_LANG[lang];

  const cacheKey = `tm-injuries:${tmId}:${lang}`;
  try {
    const [cached] = await pool.query(
      "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
      [cacheKey]
    );
    if (cached.length > 0) {
      res.set('Cache-Control', 'public, max-age=604800');
      return res.json(typeof cached[0].response_json === "string" ? JSON.parse(cached[0].response_json) : cached[0].response_json);
    }
  } catch {}

  try {
    const tmUrl = `https://www.${tmDomain}/_/verletzungen/spieler/${tmId}`;
    const resp = await fetch(tmUrl, { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) });
    if (!resp.ok) return res.status(502).json({ error: `TM returned ${resp.status}` });
    const html = await resp.text();

    const injuries = [];
    // Scope to the first <table class="items">…</table> (the detailed injury list; a second table summarizes per season).
    const tableM = html.match(/<table class="items">([\s\S]*?)<\/table>/);
    if (tableM) {
      const tableHtml = tableM[1];
      const rowRe = /<tr[^>]*class="(?:odd|even)"[^>]*>([\s\S]*?)<\/tr>/g;
      let rowMatch;
      while ((rowMatch = rowRe.exec(tableHtml)) !== null) {
        const rowHtml = rowMatch[1];
        const tds = [];
        const tdRe = /<td[^>]*>([\s\S]*?)<\/td>/g;
        let tdMatch;
        while ((tdMatch = tdRe.exec(rowHtml)) !== null) tds.push(tdMatch[1]);
        if (tds.length < 6) continue;
        const strip = (s) => decodeHtmlEntities(String(s || "").replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
        const gamesSpanM = tds[5].match(/<span[^>]*>([^<]+)<\/span>/);
        const clubTitleM = tds[5].match(/<a[^>]*title="([^"]+)"[^>]*href="[^"]*\/verein\/\d+/);
        injuries.push({
          season: strip(tds[0]),
          type: strip(tds[1]),
          from: strip(tds[2]),
          to: strip(tds[3]),
          days: strip(tds[4]),
          gamesMissed: gamesSpanM ? strip(gamesSpanM[1]) : "",
          club: clubTitleM ? decodeHtmlEntities(clubTitleM[1]) : null,
        });
      }
    }

    const result = { tmId, injuries, tmUrl, source: "transfermarkt", fetchedAt: new Date().toISOString() };

    try {
      await pool.query(
        `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY)`,
        [cacheKey, JSON.stringify(result)]
      );
    } catch {}

    res.set('Cache-Control', 'public, max-age=604800');
    return res.json(result);
  } catch (err) {
    console.error("[player-tm-injuries] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Transfermarkt player market value history scraping ──────────────────────
app.get("/api/player-tm-market-value/:tmId", authMiddleware, async (req, res) => {
  const { tmId } = req.params;
  if (!tmId || !/^\d+$/.test(tmId)) return res.status(400).json({ error: "Invalid TM ID" });

  const TM_DOMAIN_BY_LANG = { fr: "transfermarkt.fr", en: "transfermarkt.com", es: "transfermarkt.es" };
  const langRaw = String(req.query.lang || "fr").toLowerCase().slice(0, 2);
  const lang = TM_DOMAIN_BY_LANG[langRaw] ? langRaw : "fr";
  const tmDomain = TM_DOMAIN_BY_LANG[lang];

  const cacheKey = `tm-marketvalue:v2:${tmId}:${lang}`;
  try {
    const [cached] = await pool.query(
      "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
      [cacheKey]
    );
    if (cached.length > 0) {
      res.set('Cache-Control', 'public, max-age=604800');
      return res.json(typeof cached[0].response_json === "string" ? JSON.parse(cached[0].response_json) : cached[0].response_json);
    }
  } catch {}

  try {
    // TM exposes the chart series via a dedicated JSON endpoint (the web component
    // <tm-market-value-development-graph-extended> calls it). Shape: { list: [{x,y,mw,datum_mw,verein,age,wappen},…] }
    const apiUrl = `https://www.${tmDomain}/ceapi/marketValueDevelopment/graph/${tmId}`;
    const tmUrl = `https://www.${tmDomain}/_/marktwertverlauf/spieler/${tmId}`;
    const resp = await fetch(apiUrl, {
      headers: { ...TM_HEADERS, Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
      signal: AbortSignal.timeout(15000),
    });
    if (!resp.ok) return res.status(502).json({ error: `TM returned ${resp.status}` });
    const payload = await resp.json().catch(() => null);
    const list = Array.isArray(payload?.list) ? payload.list : [];

    const history = list
      .map(entry => {
        const x = Number(entry?.x);
        const y = Number(entry?.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
        const ageNum = Number(entry?.age);
        return {
          value: y,
          club: entry?.verein ? String(entry.verein) : null,
          age: Number.isFinite(ageNum) ? ageNum : null,
          valueLabel: entry?.mw ? String(entry.mw) : null,
          date: entry?.datum_mw ? String(entry.datum_mw) : null,
          timestamp: x,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.timestamp - b.timestamp);
    const seen = new Set();
    const unique = history.filter(e => seen.has(e.timestamp) ? false : (seen.add(e.timestamp), true));

    const result = { tmId, history: unique, tmUrl, source: "transfermarkt", fetchedAt: new Date().toISOString() };

    try {
      await pool.query(
        `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 7 DAY))
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 7 DAY)`,
        [cacheKey, JSON.stringify(result)]
      );
    } catch {}

    res.set('Cache-Control', 'public, max-age=604800');
    return res.json(result);
  } catch (err) {
    console.error("[player-tm-market-value] Error:", err.message);
    return res.status(500).json({ error: err.message });
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
    res.set('Cache-Control', 'public, max-age=604800');
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

// "K. Mbapp\u00e9" / "Kylian Mbapp\u00e9" / "Kylian M Mbapp\u00e9" \u2192 "k mbappe" \u2014 used to match
// truncated/initialed import names against full DB names. Returns "" for single tokens.
function playerInitialLastKey(s) {
  const n = normalizeStr(s);
  if (!n) return '';
  const tokens = n.split(' ').filter(Boolean);
  if (tokens.length < 2) return '';
  const first = tokens[0];
  const last = tokens[tokens.length - 1];
  if (!first[0] || !last) return '';
  return `${first[0]} ${last}`;
}

// Decide whether the canonical TM name is a fuller version of the local one so
// we should replace players.name with it. Examples that must rewrite:
//   "A Adorante"   \u2192 "Andrea Adorante"
//   "K. Mbapp\u00e9"    \u2192 "Kylian Mbapp\u00e9 Lottin"
//   "M. Salah"     \u2192 "Mohamed Salah"
// Examples that must NOT rewrite (different person / shortening / no info gain):
//   "John Adorante"   vs "Andrea Adorante"  (full first name not in canonical)
//   "Andrea Adorante" vs "A. Adorante"      (canonical is shorter \u2014 never shorten)
//   "Adorante Reyes"  vs "Andrea Adorante"  ("Reyes" not in canonical)
//
// Rules (all required):
//   1. Both names have \u2265 2 tokens; canonical has \u2265 tokens than local.
//   2. canonical normalized != local normalized (something to gain).
//   3. Every NON-INITIAL local token (length > 1) matches some canonical token exactly.
//   4. Every INITIAL local token (length == 1) matches the first letter of a
//      remaining canonical token (consumed greedy after rule 3).
function shouldUseCanonicalName(localName, canonicalName) {
  if (!localName || !canonicalName) return false;
  const local = String(localName).trim();
  const canon = String(canonicalName).trim();
  if (!local || !canon) return false;
  if (normalizeStr(local) === normalizeStr(canon)) return false;

  const localTokens = local.split(/\s+/).filter(Boolean);
  const canonTokens = canon.split(/\s+/).filter(Boolean);
  if (localTokens.length < 2 || canonTokens.length < 2) return false;
  if (canonTokens.length < localTokens.length) return false;

  const available = canonTokens.map(t => normalizeStr(t)).filter(Boolean);
  if (available.length === 0) return false;

  const consume = (predicate) => {
    const idx = available.findIndex(predicate);
    if (idx === -1) return false;
    available.splice(idx, 1);
    return true;
  };

  // Pass 1: full local tokens must match a canonical token exactly.
  for (const t of localTokens) {
    const tn = normalizeStr(t.replace(/\./g, ''));
    if (!tn || tn.length === 1) continue;
    if (!consume(c => c === tn)) return false;
  }
  // Pass 2: initials match the first letter of a remaining canonical token.
  for (const t of localTokens) {
    const tn = normalizeStr(t.replace(/\./g, ''));
    if (tn.length !== 1) continue;
    if (!consume(c => c.startsWith(tn))) return false;
  }
  return true;
}

// Persist a (alias \u2192 canonical player) mapping. Idempotent on (alias_norm, player_id).
// Skips if alias_norm equals the player's own normalized name (no useful info).
async function recordPlayerAlias(playerId, rawName, source) {
  try {
    const aliasNorm = normalizeStr(rawName);
    if (!aliasNorm || !playerId) return;
    if (aliasNorm.length > 191) return;
    const raw = String(rawName || '').slice(0, 255);
    await pool.query(
      `INSERT IGNORE INTO player_name_aliases (alias_norm, player_id, source, raw_name)
       VALUES (?, ?, ?, ?)`,
      [aliasNorm, playerId, source || 'import', raw]
    );
  } catch (e) {
    // Non-blocking: alias persistence must never break the calling flow
    if (!String(e?.message || '').includes('already exists')) {
      console.warn('[recordPlayerAlias]', e?.message);
    }
  }
}

// Format a Date (or string) as local YYYY-MM-DD — avoids the UTC shift bug of .toISOString().
function toYMD(d) {
  if (!d) return null;
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4}-\d{2}-\d{2})/);
    if (m) return m[1];
    const parsed = new Date(d);
    if (isNaN(parsed.getTime())) return null;
    d = parsed;
  }
  if (!(d instanceof Date) || isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Build a flat alias → canonical-normalized lookup from CLUB_NAME_MAP.
// Each alias (and the canonical name itself) maps to the normalized canonical.
const CLUB_ALIAS_TO_CANONICAL = (() => {
  const out = new Map();
  for (const [canonical, aliases] of Object.entries(CLUB_NAME_MAP)) {
    const canon = normalizeStr(canonical);
    out.set(canon, canon);
    for (const alias of aliases) out.set(normalizeStr(alias), canon);
  }
  return out;
})();

function canonicalClub(name) {
  const norm = normalizeStr(name);
  return CLUB_ALIAS_TO_CANONICAL.get(norm) || norm;
}

// Two club strings refer to the same club (handles aliases like "Paris SG" ↔ "Paris Saint-Germain").
function clubsEquivalent(a, b) {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return canonicalClub(a) === canonicalClub(b);
}

// Map: normalized club name (canonical OR alias) → league name (from src/data/club-to-league.json).
// Combines the static club→league mapping with the alias table so "Paris SG", "PSG",
// "Paris Saint-Germain" all resolve to "Ligue 1".
const STATIC_CLUB_LEAGUE_BY_NORM = (() => {
  const out = new Map();
  let staticMap = {};
  try { staticMap = require('../src/data/club-to-league.json'); }
  catch (e) { console.warn("[warn] resolveLeagueByClub: could not load club-to-league.json:", e?.message); }
  for (const [canonical, league] of Object.entries(staticMap)) {
    out.set(normalizeStr(canonical), league);
  }
  for (const [canonical, aliases] of Object.entries(CLUB_NAME_MAP)) {
    const league = staticMap[canonical];
    if (!league) continue;
    for (const alias of aliases) out.set(normalizeStr(alias), league);
  }
  return out;
})();

function resolveLeagueByClub(clubName) {
  if (!clubName) return null;
  return STATIC_CLUB_LEAGUE_BY_NORM.get(normalizeStr(clubName)) || null;
}

// Backfill: scan every distinct club already in the DB and update players
// whose league doesn't match what the static club→league mapping says.
// Alias-aware via resolveLeagueByClub ("Paris SG", "PSG", accents, …).
async function fixPlayerLeaguesByClub(pool) {
  let playersFixed = 0;
  let directoryFixed = 0;
  let clubsScanned = 0;

  const [distinctRows] = await pool.query(
    "SELECT DISTINCT club FROM players WHERE club IS NOT NULL AND club != ''"
  );
  for (const { club } of distinctRows) {
    clubsScanned++;
    const correctLeague = resolveLeagueByClub(club);
    if (!correctLeague) continue;
    const [result] = await pool.query(
      "UPDATE players SET league = ? WHERE club = ? AND (league IS NULL OR league = '' OR league != ?)",
      [correctLeague, club, correctLeague]
    );
    playersFixed += result.affectedRows || 0;
  }

  try {
    const [dirRows] = await pool.query(
      "SELECT DISTINCT club_name FROM club_directory WHERE club_name IS NOT NULL AND club_name != ''"
    );
    for (const { club_name } of dirRows) {
      const correctLeague = resolveLeagueByClub(club_name);
      if (!correctLeague) continue;
      const [result] = await pool.query(
        "UPDATE club_directory SET competition = ? WHERE club_name = ? AND competition != ?",
        [correctLeague, club_name, correctLeague]
      );
      directoryFixed += result.affectedRows || 0;
    }
  } catch { /* club_directory may not exist yet */ }

  return { playersFixed, directoryFixed, clubsScanned };
}

// Compare two agent strings loosely (case/whitespace/accent-insensitive).
function agentsEquivalent(a, b) {
  return normalizeStr(a || '') === normalizeStr(b || '');
}

// Build the ordered list of search query strings to try against external APIs.
// When the first name is just an initial (e.g. "A. Albertini"), the full string
// won't match in TSDB/Wikidata indexes — fall back to last-name-only so we get
// candidates like "Andrea Albertini", then disambiguate via strict DOB match.
function buildNameSearchQueries(playerName) {
  const queries = [playerName];
  const parts = String(playerName || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const firstStripped = parts[0].replace(/\./g, '');
    const lastName = parts.slice(1).join(' ');
    if (firstStripped.length === 1) {
      // Initial-only first name: search by last name(s) alone
      queries.push(lastName);
    } else if (parts.length > 2) {
      // Compound name: also try first+last only (drops middle names)
      queries.push(`${parts[0]} ${parts[parts.length - 1]}`);
      queries.push(parts[parts.length - 1]);
    }
  }
  return queries;
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
    const queries = buildNameSearchQueries(player.name);
    const seenIds = new Set();
    const candidates = [];

    for (let qi = 0; qi < queries.length; qi++) {
      if (qi > 0 && candidates.length > 0) break; // first query yielded matches — don't burn rate limit
      const url = `https://www.thesportsdb.com/api/v1/json/${apiKey}/searchplayers.php?p=${encodeURIComponent(queries[qi])}`;
      const resp = await fetch(url, { headers: TSDB_HEADERS });
      if (!resp.ok) continue;
      const data = await resp.json();
      if (!data.player?.length) continue;
      for (const c of data.player) {
        const key = c.idPlayer || `${c.strPlayer}|${c.dateBorn || ''}`;
        if (seenIds.has(key)) continue;
        seenIds.add(key);
        candidates.push(c);
      }
    }

    if (candidates.length === 0) return null;

    const playerClub = normalizeStr(player.club || '');
    const playerNat = normalizeStr(player.nationality || '');
    const playerDob = player.date_of_birth || null;

    let bestMatch = null;
    let bestScore = -1;

    for (const c of candidates) {
      if (!namesMatch(player.name, c.strPlayer || '')) continue;
      const sport = (c.strSport || '').toLowerCase();
      if (sport && sport !== 'soccer' && sport !== 'football') continue;

      const candidateDob = c.dateBorn ? String(c.dateBorn).slice(0, 10) : null;
      const born = candidateDob ? parseInt(candidateDob.slice(0, 4), 10) : null;

      // When we know the player's full DOB, require an exact match (eliminates homonyms).
      if (playerDob && candidateDob) {
        if (candidateDob !== playerDob) continue;
      } else if (player.generation && born && Math.abs(born - player.generation) > 2) {
        continue;
      }

      let score = 0;
      if (playerDob && candidateDob && candidateDob === playerDob) score += 6;
      else if (player.generation && born && Math.abs(born - player.generation) <= 1) score += 3;
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
    const queries = buildNameSearchQueries(player.name);
    const seenIds = new Set();
    const entities = [];

    for (let qi = 0; qi < queries.length; qi++) {
      if (qi > 0 && entities.some(e => namesMatch(player.name, e.label || ''))) break;
      const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(queries[qi])}&language=en&type=item&format=json&limit=8`;
      const searchResp = await fetch(searchUrl, { headers: WD_HEADERS });
      if (!searchResp.ok) continue;
      const found = (await searchResp.json())?.search || [];
      for (const e of found) {
        if (e.id && seenIds.has(e.id)) continue;
        if (e.id) seenIds.add(e.id);
        entities.push(e);
      }
    }

    // Collect candidates that pass name + football description; we'll fetch entities
    // for each (capped) and pick the one whose DOB matches when known. This is what
    // makes name+DOB lookup work — we can't reject homonyms before fetching claims.
    const candidates = [];
    for (const entity of entities) {
      if (!namesMatch(player.name, entity.label || '')) continue;
      const desc = (entity.description || '').toLowerCase();
      if (!FOOTBALL_DESC_TERMS.some(t => desc.includes(t))) continue;
      if (!player.date_of_birth && player.generation) {
        const m = desc.match(/born[^\d]*(\d{4})/);
        if (m && Math.abs(parseInt(m[1], 10) - player.generation) > 1) continue;
      }
      candidates.push(entity.id);
      if (candidates.length >= 5) break; // cap entity fetches
    }
    if (candidates.length === 0) return null;

    let matchId = null;
    let claims = null;
    let resultDob = null;
    for (const candId of candidates) {
      const entityResp = await fetch(
        `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${candId}&props=claims&format=json`,
        { headers: WD_HEADERS }
      );
      if (!entityResp.ok) continue;
      const entityData = await entityResp.json();
      const candClaims = entityData?.entities?.[candId]?.claims || {};
      const dobVal = candClaims.P569?.[0]?.mainsnak?.datavalue?.value;
      let candDob = null;
      if (dobVal?.time) {
        const raw = dobVal.time.replace(/^\+/, '');
        const datePart = raw.slice(0, 10);
        if (/^\d{4}-\d{2}-\d{2}$/.test(datePart) && !datePart.endsWith('00-00') && !datePart.endsWith('-00')) {
          candDob = datePart;
        }
      }
      // Strict DOB filter when known: only this candidate (or the first with no Wikidata DOB) passes
      if (player.date_of_birth && candDob && candDob !== player.date_of_birth) continue;
      matchId = candId;
      claims = candClaims;
      resultDob = candDob;
      break;
    }
    if (!matchId || !claims) return null;

    const result = { wikidataId: matchId };
    if (resultDob) result.dateOfBirth = resultDob;

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
const FR_MONTHS = {
  janv:1, janvier:1,
  févr:2, février:2, fevr:2,
  mars:3,
  avr:4, avril:4,
  mai:5,
  juin:6,
  juil:7, juillet:7,
  août:8, aout:8,
  sept:9, septembre:9,
  oct:10, octobre:10,
  nov:11, novembre:11,
  déc:12, décembre:12,
};

// Decode common HTML entities in scraped text
function decodeHtmlEntities(str) {
  if (!str) return str;
  return str
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#x27;/g, "'")
    .replace(/&eacute;/g, 'é').replace(/&egrave;/g, 'è').replace(/&agrave;/g, 'à')
    .replace(/&uuml;/g, 'ü').replace(/&ouml;/g, 'ö').replace(/&auml;/g, 'ä')
    .replace(/&oacute;/g, 'ó').replace(/&iacute;/g, 'í').replace(/&ntilde;/g, 'ñ')
    .replace(/&ccedil;/g, 'ç').replace(/&szlig;/g, 'ß')
    .replace(/&nbsp;/g, ' ');
}

function matchFrMonth(raw) {
  const norm = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\.$/, '');
  for (const [k, v] of Object.entries(FR_MONTHS)) {
    const kNorm = k.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (norm === kNorm || norm.startsWith(kNorm) || kNorm.startsWith(norm)) return v;
  }
  return null;
}

function parseFrDate(str) {
  if (!str) return null;
  const m = String(str).trim().match(/(\d{1,2})\s+([^\s\d]+)\.?\s+(\d{4})/);
  if (!m) return null;
  const month = matchFrMonth(m[2]);
  if (!month || parseInt(m[3]) < 2020) return null;
  return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
}

/** Like parseFrDate but accepts any year (for career/transfer dates). */
function parseFrDateAny(str) {
  if (!str) return null;
  // Try French format: "1 juil. 2018"
  const m = String(str).trim().match(/(\d{1,2})\s+([^\s\d]+)\.?\s+(\d{4})/);
  if (m) {
    const month = matchFrMonth(m[2]);
    if (month) return `${m[3]}-${String(month).padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  }
  // Try numeric: "01/07/2018" or "01.07.2018"
  const n = String(str).trim().match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (n) return `${n[3]}-${n[2].padStart(2, '0')}-${n[1].padStart(2, '0')}`;
  return null;
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
async function fetchPlayerDataFromTransfermarkt(player, tmPath = null, options = {}) {
  const forceRefresh = !!options.forceRefresh;

  // ── Shared cross-user cache (tm_player_cache table) ──────────────────────
  // Default TTL 24h. Within that window, NO HTTP calls to TM — every caller
  // (manual enrich, cron) serves from this table. After expiry, the next
  // caller scrapes and repopulates. forceRefresh bypasses the freshness check
  // (used when admin/user explicitly requests a refresh).
  async function getCachedByTmId(tmId) {
    if (forceRefresh || !tmId) return null;
    try {
      const [rows] = await pool.query(
        "SELECT payload_json FROM tm_player_cache WHERE tm_id = ? AND expires_at > NOW() LIMIT 1",
        [String(tmId)]
      );
      if (rows.length) return JSON.parse(rows[0].payload_json);
    } catch {}
    return null;
  }
  async function setCachedByTmId(tmId, data) {
    if (!tmId || !data) return;
    try {
      await pool.query(
        `INSERT INTO tm_player_cache (tm_id, canonical_name, payload_json, fetched_at, expires_at)
         VALUES (?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
         ON DUPLICATE KEY UPDATE
           canonical_name = VALUES(canonical_name),
           payload_json   = VALUES(payload_json),
           fetched_at     = NOW(),
           expires_at     = DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
        [String(tmId), data?.canonicalName || null, JSON.stringify(data)]
      );
    } catch (e) {
      console.warn('[tm_player_cache] set failed:', e?.message);
    }
  }

  // ── Shared name → TM-ID resolution (tm_name_resolution table) ────────────
  // When ANY user has previously resolved "kylian mbappe / paris saint germain"
  // to TM id 342229, we skip the TM search entirely and go directly to the
  // cache. This eliminates the per-user search-and-score HTTP round trip.
  async function resolveTmIdByName(nameNorm, clubNorm) {
    if (forceRefresh || !nameNorm) return null;
    try {
      const nk = String(nameNorm).slice(0, 120);
      const ck = String(clubNorm || '').slice(0, 80);
      // Try (name, club) first; fall back to (name, '') if exact club not found
      const [rows] = await pool.query(
        `SELECT tm_id, confidence, club_norm FROM tm_name_resolution
          WHERE name_norm = ? AND (club_norm = ? OR club_norm = '')
          ORDER BY (club_norm = ?) DESC, confidence DESC LIMIT 1`,
        [nk, ck, ck]
      );
      return rows[0]?.tm_id || null;
    } catch {}
    return null;
  }
  async function rememberTmIdForName(nameNorm, clubNorm, tmId, confidence) {
    if (!nameNorm || !tmId) return;
    try {
      // Truncate to match column widths (see table definition above)
      const nk = String(nameNorm).slice(0, 120);
      const ck = String(clubNorm || '').slice(0, 80);
      await pool.query(
        `INSERT INTO tm_name_resolution (name_norm, club_norm, tm_id, confidence, resolved_at)
         VALUES (?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           tm_id       = IF(VALUES(confidence) >= confidence, VALUES(tm_id), tm_id),
           confidence  = GREATEST(confidence, VALUES(confidence)),
           resolved_at = NOW()`,
        [nk, ck, String(tmId), Math.max(0, Math.min(127, confidence | 0))]
      );
    } catch (e) {
      console.warn('[tm_name_resolution] set failed:', e?.message);
    }
  }

  try {
    const opts = { headers: TM_HEADERS, signal: AbortSignal.timeout(20000) };

    // ── 1. Search (with fallback queries for typos / compound names) ──────────
    const rowRe = /href="(\/([^/]+)\/profil\/spieler\/(\d+))"[^>]*>([^<]+)<\/a>(?:.*?zentriert">(\d+)<\/td>)?(?:.*?rechts hauptlink">\s*([^<]*)<\/td>)?(?:.*?berater\/\d+">\s*([^<]*)<\/a>)?/gs;
    const playerClubNorm = normalizeStr(player.club || '');
    const playerNameNorm = normalizeStr(player.name || '');

    let best = null, bestScore = -1;
    const allCandidates = []; // collect all matching candidates for disambiguation

    const playerNatNorm = normalizeStr(player.nationality || '');
    const genKnown = player.generation && player.generation !== 2000;
    const playerDobYear = player.date_of_birth ? parseInt(String(player.date_of_birth).slice(0, 4), 10) : null;
    const playerFirstInitial = (() => {
      const parts = String(player.name || '').trim().split(/\s+/);
      const first = parts[0]?.replace(/\./g, '') || '';
      return first.length === 1 ? first.toLowerCase() : null;
    })();

    if (tmPath) {
      // Direct path provided by user — skip search entirely
      const idM = tmPath.match(/\/spieler\/(\d+)/);
      if (!idM) return null;
      // Early cache hit: we know the TM ID upfront (either from stored transfermarkt_id or a user-provided URL).
      const cached = await getCachedByTmId(idM[1]);
      if (cached) {
        console.log(`[TM] ${player.name} → cache hit tm-player:${idM[1]}`);
        return cached;
      }
      best = { id: idM[1], path: tmPath, mktVal: null, agent: null };
    } else {
      // Pre-check: did a previous enrichment already resolve this name → tm_id?
      // If yes AND the cache is fresh, we skip the entire TM search + profile fetch.
      const knownTmId = await resolveTmIdByName(playerNameNorm, playerClubNorm);
      if (knownTmId) {
        const cached = await getCachedByTmId(knownTmId);
        if (cached) {
          console.log(`[TM] ${player.name} → resolved via shared map → cache hit tm-player:${knownTmId}`);
          return cached;
        }
        // Cache stale/missing but we know the tm_id → skip search, go straight to profile.
        // Bump bestScore above the rejection threshold (the resolution was previously
        // validated by a real search, so we trust it without rescoring).
        console.log(`[TM] ${player.name} → resolved via shared map → tm_id ${knownTmId}, fetching profile`);
        best = { id: knownTmId, path: `/_/profil/spieler/${knownTmId}`, mktVal: null, agent: null };
        bestScore = 99;
      }
    }

    // Only do the TM search when we don't already have a `best` from cache/resolution
    if (!best && !tmPath) {
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

          // ── Age matching ──
          // TM search list shows current age; born-year = currentYear - age (off by ≤1
          // depending on whether birthday already passed). When caller provided full DOB,
          // year match is the strongest pre-profile signal we have.
          const candidateAge = age ? parseInt(age) : null;
          const candidateBornYear = candidateAge ? (new Date().getFullYear() - candidateAge) : null;
          if (playerDobYear && candidateBornYear) {
            const yDiff = Math.abs(candidateBornYear - playerDobYear);
            if (yDiff <= 1) score += 6; // strong: name + birth-year match
            // No penalty for year-mismatch — DB DOB may be wrong/placeholder; the +6 bonus
            // alone is enough to favor the correct candidate when one exists.
          } else if (genKnown && candidateBornYear) {
            const ageDiff = Math.abs(candidateBornYear - player.generation);
            if (ageDiff <= 1) score += 3;
            else if (ageDiff > 2) score -= 10; // hard penalty: clearly wrong player
          } else if (player.generation && candidateBornYear && Math.abs(candidateBornYear - player.generation) <= 1) {
            score += 2; // weaker bonus when generation is uncertain (2000)
          }

          // ── Club matching ──
          const ctxStart = searchHtml.indexOf(path);
          const ctxEnd = Math.min(ctxStart + 800, searchHtml.length);
          const ctx = searchHtml.slice(ctxStart, ctxEnd);
          const clubM = ctx.match(/startseite\/verein\/\d+"[^>]*>([^<]+)<\/a>/i);
          if (clubM && playerClubNorm) {
            const cNorm = normalizeStr(clubM[1]);
            if (cNorm.includes(playerClubNorm.slice(0, 5)) || playerClubNorm.includes(cNorm.slice(0, 5))) score += 5;
          }

          // ── Nationality matching (flag images in search results) ──
          if (playerNatNorm) {
            const natM = ctx.match(/title="([^"]+)"[^>]*flaggenrahmen/g);
            if (natM) {
              const natMatched = natM.some(flagHtml => {
                const titleM = flagHtml.match(/title="([^"]+)"/);
                return titleM && normalizeStr(titleM[1]).includes(playerNatNorm.slice(0, 5));
              });
              if (natMatched) score += 4;
            }
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
            // Initial-only first name ("A. Albertini") — last-name match + first-letter match is enough.
            // We don't require birth-year here because TM search HTML may omit the age column; the
            // profile fetch can verify DOB if the caller cares. Better to scrape than to return null.
            const initialOk = playerFirstInitial && lastsMatch && bF.length >= 1 && bF[0] === playerFirstInitial;
            if (!initialOk && (!lastsMatch || !firstsClose)) continue;
          }

          const candidate = { id, path, name, age: candidateAge, mktVal: mktVal?.trim() || null, agent: agent?.trim() || null, score };
          // Extract club name for candidate info
          if (clubM) candidate.club = clubM[1].trim();
          allCandidates.push(candidate);

          if (score > bestScore || !best) { bestScore = score; best = { id, path, mktVal: mktVal?.trim() || null, agent: agent?.trim() || null }; }
        }
      }
    }

    // ── Minimum confidence threshold ──
    // When generation is known, require at least age OR club match to proceed
    // This prevents returning the wrong homonym when we have no confirming signal
    if (best && !tmPath && bestScore < 0) {
      console.log(`[TM] ${player.name} → rejected best match (score ${bestScore}, too low)`);
      best = null;
    }
    // When multiple candidates exist with similar scores, flag ambiguity
    if (best && !tmPath && allCandidates.length > 1) {
      const closeMatches = allCandidates.filter(c => c.score >= bestScore - 2 && c.score >= 0);
      if (closeMatches.length > 1) {
        console.log(`[TM] ${player.name} → ${closeMatches.length} close candidates: ${closeMatches.map(c => `${c.name} (age:${c.age}, club:${c.club||'?'}, score:${c.score})`).join(' | ')}`);
        // Return ambiguous result — let the caller decide (UI disambiguation)
        return { ambiguous: true, candidates: closeMatches.map(c => ({ id: c.id, path: c.path, name: c.name, age: c.age, club: c.club || null, score: c.score })) };
      }
    }

    if (!best) return null;

    // Persist the name → tm_id resolution so future calls (from ANY user) for
    // this normalized (name, club) skip the search step entirely. Confidence
    // = the best score we got (clamped to TINYINT range).
    if (!tmPath && playerNameNorm) {
      await rememberTmIdForName(playerNameNorm, playerClubNorm, best.id, bestScore);
    }

    // Post-search cache hit: the name-based search resolved a TM ID another user already scraped.
    const cachedAfterSearch = await getCachedByTmId(best.id);
    if (cachedAfterSearch) {
      console.log(`[TM] ${player.name} → cache hit (post-search) tm-player:${best.id}`);
      return cachedAfterSearch;
    }

    // ── 2. Profile page ────────────────────────────────────────────────────
    await new Promise(r => setTimeout(r, 500));
    const profileResp = await fetch(`https://www.transfermarkt.fr${best.path}`, opts);
    if (!profileResp.ok) return null;
    const html = await profileResp.text();

    // Canonical full name — TM profile <h1 class="data-header__headline-wrapper">
    // contains the official name (e.g. "Kylian Mbappé Lottin"), more authoritative
    // than search anchor text which is often abbreviated ("K. Mbappé"). We strip
    // inner tags like <span class="data-header__shirt-number">#10</span>.
    let canonicalName = null;
    const headlineM = html.match(/<h1[^>]*class="[^"]*data-header__headline-wrapper[^"]*"[^>]*>([\s\S]*?)<\/h1>/);
    if (headlineM) {
      const cleaned = headlineM[1].replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
      // Drop leading shirt-number tokens like "#10" if any survived stripping
      const noShirt = cleaned.replace(/^#?\d+\s+/, '').trim();
      if (noShirt && noShirt.length <= 120) canonicalName = noShirt;
    }
    // Fallback: "Nom complet:" field on the profile page
    if (!canonicalName) {
      const fullRaw = extractBetween(html, 'Nom complet:</span>', '</span>')
        || extractBetween(html, 'Nom complet :</span>', '</span>');
      if (fullRaw && fullRaw.length >= 3 && fullRaw.length <= 120) canonicalName = fullRaw.trim();
    }

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

    // ── Foot ──
    const footRaw = extractBetween(html, 'Pied fort\u00a0:</span>', '</span>')
      || extractBetween(html, 'Pied fort :</span>', '</span>')
      || extractBetween(html, 'Pied fort:</span>', '</span>')
      || extractBetween(html, 'Pied\u00a0:</span>', '</span>')
      || extractBetween(html, 'Pied :</span>', '</span>')
      || extractBetween(html, 'Pied:</span>', '</span>');

    // ── Position ──
    const positionRaw = extractBetween(html, 'Poste\u00a0:</span>', '</span>')
      || extractBetween(html, 'Poste :</span>', '</span>')
      || extractBetween(html, 'Poste:</span>', '</span>')
      || extractBetween(html, 'Position\u00a0:</span>', '</span>')
      || extractBetween(html, 'Position :</span>', '</span>')
      || extractBetween(html, 'Position:</span>', '</span>');

    // ── Nationality ──
    // TM profile shows nationality as flag images: <img title="Portugal" class="flaggenrahmen" />
    // extractBetween strips HTML tags, losing the country name inside the title attribute.
    // So we first try to extract from flag title attributes near the "Nationalité" label.
    let nationalityRaw = null;
    const natLabelIdx = html.search(/Nationalit[eé]\s*\u00a0?:/);
    if (natLabelIdx !== -1) {
      const natBlock = html.slice(natLabelIdx, natLabelIdx + 500);
      const natFlags = [...natBlock.matchAll(/title="([^"]+)"[^>]*flaggenrahmen/g)].map(m => m[1].trim());
      if (natFlags.length > 0) nationalityRaw = natFlags.join('  ');
    }
    // Fallback: try text-based extraction
    if (!nationalityRaw) {
      nationalityRaw = extractBetween(html, 'Nationalit\u00e9:</span>', '</span>')
        || extractBetween(html, 'Nationalit\u00e9\u00a0:</span>', '</span>')
        || extractBetween(html, 'Nationalit\u00e9 :</span>', '</span>');
    }

    // ── Date of birth ──
    // When the caller provided player.date_of_birth, we use TM's DOB to verify the
    // candidate is the right person (critical for name+initial searches where
    // homonyms are common). Mismatch → return null so secondary sources can fill in.
    let dateOfBirth = null;
    const dobRaw = extractBetween(html, 'Date de naissance:</span>', '</span>')
      || extractBetween(html, 'Date de naissance :</span>', '</span>')
      || extractBetween(html, 'Date de naissance :</span>', '</span>')
      || extractBetween(html, 'Date de naissance/Âge:</span>', '</span>')
      || extractBetween(html, 'Date de naissance/Âge :</span>', '</span>');
    if (dobRaw) {
      const dmyM = dobRaw.match(/(\d{1,2})\s+([^\s\d(]+)\.?\s+(\d{4})/);
      if (dmyM) {
        const month = matchFrMonth(dmyM[2]);
        if (month) dateOfBirth = `${dmyM[3]}-${String(month).padStart(2, '0')}-${dmyM[1].padStart(2, '0')}`;
      }
    }
    // DOB mismatch is logged but NOT rejected — TM search scoring (+6 for year match)
    // already favors the right candidate when one exists; rejecting here just discards
    // useful nationality data for cases where the DB DOB is a placeholder/wrong.
    if (player.date_of_birth && dateOfBirth && dateOfBirth !== player.date_of_birth) {
      console.log(`[TM] ${player.name} → DOB mismatch (caller=${player.date_of_birth}, tm=${dateOfBirth}) — keeping result anyway`);
    }

    // ── 3. Fetch career history via TM JSON API ──────────────────────────
    let career = null;
    try {
      const apiOpts = { headers: { 'Accept': 'application/json', 'Accept-Language': 'fr-FR' }, signal: AbortSignal.timeout(10000) };
      const histResp = await fetch(`https://tmapi-alpha.transfermarkt.technology/transfer/history/player/${best.id}`, apiOpts);
      if (histResp.ok) {
        const histJson = await histResp.json();
        const transfers = histJson?.data?.history?.terminated || [];
        const clubIdsSet = new Set();

        // Collect all club IDs to resolve names in one batch
        for (const t of transfers) {
          if (t.transferSource?.clubId) clubIdsSet.add(t.transferSource.clubId);
          if (t.transferDestination?.clubId) clubIdsSet.add(t.transferDestination.clubId);
        }

        // Resolve club names via /clubs API
        const clubMap = new Map();
        const clubIds = [...clubIdsSet].filter(id => id && id !== '0');
        if (clubIds.length > 0) {
          const qs = clubIds.map(id => `ids[]=${id}`).join('&');
          const clubsResp = await fetch(`https://tmapi-alpha.transfermarkt.technology/clubs?${qs}`, apiOpts);
          if (clubsResp.ok) {
            const clubsJson = await clubsResp.json();
            for (const c of (clubsJson?.data || [])) {
              clubMap.set(c.id, { name: c.name, isNational: c.baseDetails?.isNationalTeam || false });
            }
          }
        }

        if (transfers.length > 0 && clubMap.size > 0) {
          // Sort chronologically (oldest first)
          const sorted = [...transfers].sort((a, b) =>
            (a.details?.date || '').localeCompare(b.details?.date || '')
          );

          const entries = [];
          for (let i = 0; i < sorted.length; i++) {
            const t = sorted[i];
            const destId = t.transferDestination?.clubId;
            const dest = clubMap.get(destId);
            if (!dest) continue;

            // Skip "Sans club" / special clubs
            const destNorm = dest.name.toLowerCase();
            if (destNorm === 'sans club' || destNorm === 'without club' || destNorm.includes('karriereende') || destNorm.includes('retired')) continue;

            const fromDate = t.details?.date ? t.details.date.slice(0, 10) : null;
            const nextDate = sorted[i + 1]?.details?.date ? sorted[i + 1].details.date.slice(0, 10) : null;

            entries.push({
              club: dest.name,
              from: fromDate,
              to: nextDate,
              isNational: dest.isNational,
              type: t.typeDetails?.type || null, // STANDARD, ACTIVE_LOAN_TRANSFER, RETURNED_FROM_PREVIOUS_LOAN
              fee: t.typeDetails?.feeDescription || null,
            });
          }

          if (entries.length > 0) {
            // Reverse: newest first (current club on top)
            career = entries.reverse();
            console.log(`[TM] ${player.name} → career: ${career.length} entries from TM API`);
          }
        }
      }
    } catch (e) {
      console.error('[TM] career API error:', e.message);
    }

    // ── 4. Fetch season stats from leistungsdatendetails page ──────────
    // TM columns: Saison | Compétition (logo+link) | Club (logo) | Matchs | Buts | PD | Cartons (J/JR/R) | Minutes
    // Data rows have class="odd" or class="even"
    let seasonStats = null;
    try {
      await new Promise(r => setTimeout(r, 400));
      const statsPath = best.path.replace('/profil/spieler/', '/leistungsdatendetails/spieler/');
      const statsOpts = { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) };
      const statsResp = await fetch(`https://www.transfermarkt.fr${statsPath}`, statsOpts);
      if (statsResp.ok) {
        const statsHtml = await statsResp.text();

        const dataRows = [...statsHtml.matchAll(/<tr\s+class="(?:odd|even)">([\s\S]*?)<\/tr>/g)];
        if (dataRows.length > 0) {
          // Group rows by season
          const seasonMap = new Map(); // season → { rows, totals }

          for (const dr of dataRows) {
            const rowHtml = dr[1];

            // 1. Season: first zentriert cell
            const seasonM = rowHtml.match(/<td\s+class="zentriert">(\d{2}\/\d{2})<\/td>/);
            if (!seasonM) continue;
            const season = seasonM[1];

            // 2. Competition name: from hauptlink <a title="...">
            const compM = rowHtml.match(/class="hauptlink\s+no-border-links">\s*<a\s+title="([^"]+)"/);
            if (!compM) continue;
            const competition = decodeHtmlEntities(compM[1].trim());

            // 3. Club name: from <a title> or <img alt> in club cell
            // Some rows have title="&nbsp;" on img, so fallback to alt or <a title>
            const clubCellM = rowHtml.match(/class="hauptlink\s+no-border-rechts\s+zentriert">\s*<a\s+title="([^"]*)"[^>]*>\s*<img[^>]*alt="([^"]*)"/);
            let club = null;
            if (clubCellM) {
              const aTitle = clubCellM[1].replace(/&nbsp;/g, '').trim();
              const imgAlt = clubCellM[2].replace(/&nbsp;/g, '').trim();
              club = (aTitle && aTitle.length > 1) ? decodeHtmlEntities(aTitle) : (imgAlt ? decodeHtmlEntities(imgAlt) : null);
            }

            // 4. Extract zentriert cells after the club column (matchs, buts, passes dé., cartons)
            // Skip the first zentriert (season) and the club zentriert
            const allZentriert = [...rowHtml.matchAll(/<td[^>]*class="[^"]*zentriert[^"]*"[^>]*>([\s\S]*?)<\/td>/g)];
            // Indices: [0]=season, [1]=club (has hauptlink), then [2]=matchs, [3]=buts, [4]=passes, [5]=cartons
            // But the club cell has "hauptlink" class, so filter accordingly
            const statCells = allZentriert.filter(m => !m[0].includes('hauptlink'));
            // statCells: [0]=season (already extracted), then the remaining are: matchs, buts, passes, cartons
            // Actually season cell is plain zentriert, so statCells[0] = season, [1]=matchs, [2]=buts, [3]=passes, [4]=cartons
            const parseCellNum = (cell) => {
              if (!cell) return 0;
              const raw = cell[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
              return raw === '-' || raw === '' ? 0 : parseInt(raw, 10) || 0;
            };

            const appearances = parseCellNum(statCells[1]);
            const goals = parseCellNum(statCells[2]);
            const assists = parseCellNum(statCells[3]);

            // Cartons: format "3&nbsp;/&nbsp;-&nbsp;/&nbsp;-" → yellow / second_yellow / red
            let yellow_cards = 0, second_yellow = 0, red_cards = 0;
            if (statCells[4]) {
              const cardsRaw = statCells[4][1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim();
              const cardParts = cardsRaw.split(/\s*\/\s*/);
              yellow_cards = cardParts[0] === '-' ? 0 : parseInt(cardParts[0], 10) || 0;
              second_yellow = cardParts[1] === '-' ? 0 : parseInt(cardParts[1], 10) || 0;
              red_cards = cardParts[2] === '-' ? 0 : parseInt(cardParts[2], 10) || 0;
            }

            // 5. Minutes: rechts cell, format "914'" or "1.956'"
            const minutesM = rowHtml.match(/<td\s+class="rechts">([\s\S]*?)<\/td>/);
            let minutes = 0;
            if (minutesM) {
              const minRaw = minutesM[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, '').replace(/\./g, '').replace(/'/g, '').trim();
              minutes = minRaw === '-' ? 0 : parseInt(minRaw, 10) || 0;
            }

            const entry = { competition, club, appearances, goals, assists, yellow_cards, second_yellow, red_cards, minutes };

            if (!seasonMap.has(season)) {
              seasonMap.set(season, []);
            }
            seasonMap.get(season).push(entry);
          }

          if (seasonMap.size > 0) {
            // Build seasons array (newest first)
            const seasons = [];
            for (const [season, rows] of seasonMap) {
              const totals = rows.reduce((acc, r) => ({
                appearances: acc.appearances + r.appearances,
                goals: acc.goals + r.goals,
                assists: acc.assists + r.assists,
                yellow_cards: acc.yellow_cards + r.yellow_cards,
                second_yellow: acc.second_yellow + r.second_yellow,
                red_cards: acc.red_cards + r.red_cards,
                minutes: acc.minutes + r.minutes,
              }), { appearances: 0, goals: 0, assists: 0, yellow_cards: 0, second_yellow: 0, red_cards: 0, minutes: 0 });
              seasons.push({ season, rows, totals });
            }
            seasonStats = seasons;
            console.log(`[TM] ${player.name} → season stats: ${seasons.length} seasons, ${dataRows.length} total rows`);
          }
        }
      }
    } catch (e) {
      console.error('[TM] season stats scrape error:', e.message);
    }

    console.log(`[TM] ${player.name} → contract:${contract} agent:${agent} value:${marketValue} height:${heightCm}cm club:${currentClub} onLoan:${onLoan} foot:${footRaw} pos:${positionRaw} nat:${nationalityRaw} photo:${!!photoUrl} logo:${!!clubLogoUrl}`);
    const result = { tmId: best.id, canonicalName, contract, heightCm, agent, marketValue, currentClub, onLoan, parentClub, loanEndDate, parentContractEnd, photoUrl, clubLogoUrl, footRaw, positionRaw, nationalityRaw, dateOfBirth, career, seasonStats };
    // Write-through: prime the cross-user cache so the next enrich of the same TM player skips scraping.
    await setCachedByTmId(best.id, result);
    return result;
  } catch (e) {
    console.error('[enrich] Transfermarkt scrape error:', e.message);
    return null;
  }
}

// Static club→league mapping (source de vérité — prioritaire sur les APIs externes)
let STATIC_CLUB_TO_LEAGUE = {};
try { STATIC_CLUB_TO_LEAGUE = require('../src/data/club-to-league.json'); } catch (e) { console.warn("[warn] Could not load club-to-league.json:", e?.message); }

// ── SofaScore: free scraping of detailed player performance stats ──
const SOFA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
  'Cache-Control': 'no-cache',
};
const SOFA_BASE = 'https://api.sofascore.com/api/v1';

async function sofaFetch(path, timeoutMs = 10000) {
  const resp = await fetch(`${SOFA_BASE}${path}`, {
    headers: SOFA_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) return null;
  return resp.json();
}

async function fetchPlayerStatsFromSofaScore(playerInfo) {
  try {
    // ── Check DB cache (24h) ──
    // v2 cache: response shape now includes `nationality` (added as TM-failure fallback).
    // Bumping the key forces a one-time refresh; pre-v2 entries are ignored until they expire.
    const cacheKey = `sofascore_player_v2_${normalizeStr(playerInfo.name)}_${playerInfo.generation || ''}`;
    try {
      const [cached] = await pool.query(
        'SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW()',
        [cacheKey]
      );
      if (cached.length > 0) {
        const parsed = JSON.parse(cached[0].response_json);
        if (parsed && parsed.stats) return parsed;
      }
    } catch { /* cache miss */ }

    // ── 1. Search player on SofaScore ──
    const searchName = playerInfo.name.trim();
    const searchQueries = buildNameSearchQueries(searchName);
    const playerResults = [];
    const seenSofaIds = new Set();

    for (let qi = 0; qi < searchQueries.length; qi++) {
      if (qi > 0 && playerResults.length > 0) break; // first query was enough
      const searchData = await sofaFetch(`/search/all?q=${encodeURIComponent(searchQueries[qi])}&page=0`);
      if (!searchData) continue;
      const collected = [];
      if (searchData.results) {
        for (const group of searchData.results) {
          if (group.type === 'player' && group.entity) collected.push(group.entity);
          if (group.type === 'player' && group.entities) collected.push(...group.entities);
        }
      }
      if (collected.length === 0 && Array.isArray(searchData.players)) {
        collected.push(...searchData.players);
      }
      for (const p of collected) {
        if (p.id && seenSofaIds.has(p.id)) continue;
        if (p.id) seenSofaIds.add(p.id);
        playerResults.push(p);
      }
      if (qi < searchQueries.length - 1) await new Promise(r => setTimeout(r, 300));
    }

    if (playerResults.length === 0) {
      console.log(`[sofascore] No player results for "${searchName}"`);
      return null;
    }

    // ── 2. Find best match by name + birth year + nationality ──
    const normalizedSearch = searchName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const birthYear = playerInfo.generation || null;
    const playerDob = playerInfo.date_of_birth || null;
    let best = null;
    let bestScore = -1;

    for (const p of playerResults) {
      let score = 0;
      const pName = (p.name || p.shortName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const pShort = (p.shortName || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

      if (pName === normalizedSearch || pShort === normalizedSearch) score += 100;
      else if (pName.includes(normalizedSearch) || normalizedSearch.includes(pName)) score += 60;
      else if (pShort.length >= 3 && (normalizedSearch.includes(pShort) || pShort.includes(normalizedSearch))) score += 40;
      else continue;

      // Birth date (strict: when full DOB is known, require exact match \u2014 eliminates homonyms)
      if (p.dateOfBirthTimestamp) {
        const candidateDob = new Date(p.dateOfBirthTimestamp * 1000).toISOString().slice(0, 10);
        if (playerDob) {
          if (candidateDob !== playerDob) continue;
          score += 60; // exact DOB match \u2014 strongest possible signal
        } else if (birthYear) {
          const pYear = parseInt(candidateDob.slice(0, 4), 10);
          if (pYear === birthYear) score += 30;
          else if (Math.abs(pYear - birthYear) <= 1) score += 15;
        }
      }

      // Team name match
      if (playerInfo.club && p.team?.name) {
        const pClub = normalizeStr(playerInfo.club);
        const sClub = normalizeStr(p.team.name);
        if (pClub === sClub || pClub.includes(sClub) || sClub.includes(pClub)) score += 25;
      }

      if (score > bestScore) { bestScore = score; best = p; }
    }

    if (!best || bestScore < 40) {
      console.log(`[sofascore] No confident match for "${searchName}" (best score: ${bestScore})`);
      return null;
    }

    const sofaId = best.id;
    console.log(`[sofascore] Matched "${searchName}" → ${best.name} (id=${sofaId}, score=${bestScore})`);

    // ── 3. Get player details (includes current team + tournament) ──
    await new Promise(r => setTimeout(r, 400)); // rate limit
    const playerData = await sofaFetch(`/player/${sofaId}`);
    if (!playerData?.player) return null;

    const pl = playerData.player;
    const teamId = pl.team?.id;
    const tournamentId = pl.team?.tournament?.uniqueTournament?.id;

    if (!teamId || !tournamentId) {
      console.log(`[sofascore] Player ${sofaId} has no team/tournament`);
      // Still return basic info
      const basicResult = {
        sofascore_id: sofaId,
        season: null,
        league: null,
        team: pl.team?.name || null,
        nationality: pl.country?.name || best.country?.name || null,
        stats: { rating: null, appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0 },
        per90: {},
        all_competitions: [],
        source: 'sofascore',
      };
      return basicResult;
    }

    // ── 4. Get current season for this tournament ──
    await new Promise(r => setTimeout(r, 400));
    const seasonsData = await sofaFetch(`/unique-tournament/${tournamentId}/seasons`);
    const currentSeason = seasonsData?.seasons?.[0];
    if (!currentSeason) return null;

    // ── 5. Get player statistics for this season ──
    await new Promise(r => setTimeout(r, 400));
    const statsData = await sofaFetch(
      `/player/${sofaId}/unique-tournament/${tournamentId}/season/${currentSeason.id}/statistics/overall`
    );

    const rawStats = statsData?.statistics || {};

    // Map SofaScore stat keys → our normalized format
    const s = {
      rating: rawStats.rating ? parseFloat(rawStats.rating).toFixed(2) : null,
      appearances: rawStats.appearances || 0,
      lineups: rawStats.lineups || rawStats.matchesStarted || 0,
      minutes: rawStats.minutesPlayed || 0,
      goals: rawStats.goals || 0,
      assists: rawStats.assists || 0,
      shots_total: rawStats.totalShots || rawStats.shotsTotal || 0,
      shots_on: rawStats.shotsOnTarget || rawStats.onTargetScoringAttempt || 0,
      passes_total: rawStats.totalPasses || rawStats.accuratePasses || 0,
      passes_key: rawStats.keyPasses || rawStats.bigChancesCreated || 0,
      passes_accuracy: rawStats.accuratePassesPercentage != null ? Math.round(rawStats.accuratePassesPercentage * 100) / 100 : (rawStats.accuratePasses && rawStats.totalPasses ? Math.round(rawStats.accuratePasses / rawStats.totalPasses * 10000) / 100 : null),
      tackles: rawStats.tackles || 0,
      blocks: rawStats.blockedShots || rawStats.blockedScoringAttempt || 0,
      interceptions: rawStats.interceptions || 0,
      duels_total: rawStats.totalDuels || rawStats.dpiTotal || 0,
      duels_won: rawStats.duelsWon || rawStats.dpiWon || 0,
      dribbles_attempts: rawStats.totalDribbles || rawStats.dribbleAttempts || 0,
      dribbles_success: rawStats.successfulDribbles || rawStats.dribbleSuccess || 0,
      fouls_drawn: rawStats.foulsDrawn || rawStats.wasFouled || 0,
      fouls_committed: rawStats.foulsCommitted || rawStats.fouls || 0,
      cards_yellow: rawStats.yellowCards || 0,
      cards_red: rawStats.redCards || rawStats.directRedCards || 0,
      penalty_scored: rawStats.penaltyGoals || rawStats.penaltiesScored || rawStats.penaltyWon || 0,
      penalty_missed: rawStats.penaltyMisses || rawStats.penaltiesMissed || 0,
      // SofaScore specific bonus stats
      expected_goals: rawStats.expectedGoals ? parseFloat(rawStats.expectedGoals).toFixed(2) : null,
      expected_assists: rawStats.expectedAssists ? parseFloat(rawStats.expectedAssists).toFixed(2) : null,
      aerial_duels_won: rawStats.aerialDuelsWon || rawStats.aerialWon || 0,
      aerial_duels_total: (rawStats.aerialDuelsWon || 0) + (rawStats.aerialDuelsLost || rawStats.aerialLost || 0),
      big_chances_created: rawStats.bigChancesCreated || 0,
      big_chances_missed: rawStats.bigChancesMissed || 0,
      clean_sheets: rawStats.cleanSheet || 0,
      saves: rawStats.saves || 0,
      errors_leading_to_goal: rawStats.errorLeadToGoal || rawStats.errorsLeadingToGoal || 0,
    };

    const minutes = s.minutes || 0;
    const per90Fn = (val) => val != null && minutes > 0 ? +(val / (minutes / 90)).toFixed(2) : null;

    const result = {
      sofascore_id: sofaId,
      season: currentSeason.year || currentSeason.name,
      league: pl.team?.tournament?.uniqueTournament?.name || null,
      team: pl.team?.name || null,
      nationality: pl.country?.name || best.country?.name || null,
      stats: s,
      per90: {
        goals: per90Fn(s.goals),
        assists: per90Fn(s.assists),
        shots: per90Fn(s.shots_total),
        key_passes: per90Fn(s.passes_key),
        tackles: per90Fn(s.tackles),
        interceptions: per90Fn(s.interceptions),
        dribbles: per90Fn(s.dribbles_success),
        duels_won: per90Fn(s.duels_won),
        expected_goals: per90Fn(s.expected_goals ? parseFloat(s.expected_goals) : null),
      },
      all_competitions: [],
      source: 'sofascore',
    };

    // ── 6. Try to get stats from other competitions too ──
    try {
      await new Promise(r => setTimeout(r, 400));
      const tournamentsData = await sofaFetch(`/player/${sofaId}/statistics/seasons`);
      if (tournamentsData?.uniqueTournamentSeasons) {
        for (const ut of tournamentsData.uniqueTournamentSeasons.slice(0, 5)) {
          const utId = ut.uniqueTournament?.id;
          const utSeason = ut.seasons?.[0];
          if (!utId || !utSeason) continue;

          if (utId === tournamentId) {
            // Already have this one — add to all_competitions from main stats
            result.all_competitions.push({
              league: ut.uniqueTournament.name,
              team: result.team,
              appearances: s.appearances,
              rating: s.rating,
              goals: s.goals,
              assists: s.assists,
              minutes: s.minutes,
            });
            continue;
          }

          await new Promise(r => setTimeout(r, 400));
          const otherStats = await sofaFetch(
            `/player/${sofaId}/unique-tournament/${utId}/season/${utSeason.id}/statistics/overall`
          );
          const os = otherStats?.statistics;
          if (os && (os.appearances || 0) > 0) {
            result.all_competitions.push({
              league: ut.uniqueTournament.name,
              team: result.team,
              appearances: os.appearances || 0,
              rating: os.rating ? parseFloat(os.rating).toFixed(2) : null,
              goals: os.goals || 0,
              assists: os.assists || 0,
              minutes: os.minutesPlayed || 0,
            });
          }
        }
      }
    } catch (e) {
      console.warn('[sofascore] Error fetching multi-competition stats:', e.message);
    }

    // If all_competitions is empty, add the main one
    if (result.all_competitions.length === 0 && s.appearances > 0) {
      result.all_competitions.push({
        league: result.league,
        team: result.team,
        appearances: s.appearances,
        rating: s.rating,
        goals: s.goals,
        assists: s.assists,
        minutes: s.minutes,
      });
    }

    // ── Cache result for 30d (warmed by GitHub Actions, see scripts/warm-sofascore-cache.mjs) ──
    try {
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
      await pool.query(
        `INSERT INTO api_football_cache (cache_key, response_json, expires_at) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), expires_at = VALUES(expires_at), fetched_at = NOW()`,
        [cacheKey, JSON.stringify(result), expiresAt]
      );
    } catch { /* cache write non-critical */ }

    return result;
  } catch (e) {
    console.error('[enrich] SofaScore stats error:', e.message);
    return null;
  }
}

// ── Shared enrichment logic (single source of truth for all enrichment paths) ──
async function enrichOnePlayer(playerInfo, row, tmPath = null, options = {}) {
  // Augment playerInfo with date_of_birth from row so secondary sources
  // (TheSportsDB / Wikidata) can use name+DOB to disambiguate homonyms when
  // Transfermarkt fails to return a result (and therefore no TM nationality).
  if (!playerInfo.date_of_birth && row.date_of_birth) {
    const dob = row.date_of_birth.toISOString?.()?.slice(0, 10) || String(row.date_of_birth).slice(0, 10);
    playerInfo = { ...playerInfo, date_of_birth: dob };
  }

  const [tsdb, wd, tm, perfStats] = await Promise.all([
    fetchPlayerDataFromSportsDB(playerInfo),
    fetchPlayerDataFromWikidata(playerInfo),
    fetchPlayerDataFromTransfermarkt(playerInfo, tmPath, { forceRefresh: !!options.forceRefresh }),
    fetchPlayerStatsFromSofaScore(playerInfo),
  ]);

  // If TM returned ambiguous candidates, propagate to caller for UI disambiguation
  if (tm && tm.ambiguous) {
    return { ambiguous: true, candidates: tm.candidates };
  }

  let ext = {};
  try { ext = JSON.parse(row.external_data || '{}') || {}; } catch {}
  const oldAgent = ext.agent || null;

  let dateOfBirth = row.date_of_birth
    ? (row.date_of_birth.toISOString?.()?.slice(0, 10) || String(row.date_of_birth).slice(0, 10))
    : null;
  let contractEnd = null; // always recalculate — clears stale values
  let newClub = row.club;
  let newLeague = row.league;
  // Fallback nationality used only when TM doesn't return one. Wikidata (citizenship Q-IDs)
  // takes priority over TheSportsDB (free-text), both gated on name + DOB matching upstream.
  let fallbackNationality = null;

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
    if (tsdb.strNationality) fallbackNationality = tsdb.strNationality.split(/[,;/]|\s{2,}/)[0].trim() || fallbackNationality;
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
      // Wikidata is structured (citizenship Q-ID → country label) — prefer it over TSDB's free-text strNationality
      if (countryNames.length > 0) fallbackNationality = countryNames[0];
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
    if (tm.dateOfBirth) dateOfBirth = tm.dateOfBirth; // overrides TSDB + Wikidata
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

    // Register name aliases: the local (possibly truncated) name AND the canonical
    // TM name both map to this player_id, so future imports of either variant find
    // this record instead of creating a duplicate. recordPlayerAlias is idempotent
    // and skips self-aliases internally.
    try {
      const tmCanonical = tm.canonicalName;
      const localName = row.name;
      if (row.id && tmCanonical) {
        await recordPlayerAlias(row.id, tmCanonical, 'tm');
      }
      if (row.id && localName && tmCanonical && normalizeStr(localName) !== normalizeStr(tmCanonical)) {
        await recordPlayerAlias(row.id, localName, 'tm');
      }
    } catch (e) {
      console.warn('[enrich] alias record failed:', e?.message);
    }
    if (tm.heightCm && !ext.height) ext.height = `${tm.heightCm} cm`;
    if (tm.currentClub) newClub = tm.currentClub; // TM is most up-to-date
    // TM career overrides Wikidata career (more complete & accurate dates)
    if (tm.career && tm.career.length > 0) {
      const clubCareer = tm.career.filter(e => !e.isNational);
      const nationalCareer = tm.career.filter(e => e.isNational);
      ext.career = clubCareer;
      if (nationalCareer.length > 0) ext.national_career = nationalCareer;
      console.log(`[enrich] Using TM career: ${clubCareer.length} club + ${nationalCareer.length} national entries`);
    }
    // Season performance stats from leistungsdatendetails page
    if (tm.seasonStats) {
      ext.season_stats = tm.seasonStats;
    }
    delete ext.tm_not_found; // clear flag now that TM succeeded
  } else {
    ext.tm_not_found = true; // signal frontend to show manual-URL input
  }

  // ── API-Football: detailed performance stats ──────────────────────────
  if (perfStats) {
    ext.performance_stats = perfStats;
    if (perfStats.sofascore_id) ext.sofascore_id = perfStats.sofascore_id;
    // SofaScore handles abbreviated names ("A. Albertini") via shortName lookup —
    // it's often the only source that resolves when Wikidata/TheSportsDB miss.
    // Lowest priority of the three (free-text), so only fill if nothing better found.
    if (!fallbackNationality && perfStats.nationality) fallbackNationality = perfStats.nationality;
    console.log(`[enrich] SofaScore stats: ${perfStats.stats?.appearances || 0} apps, rating ${perfStats.stats?.rating || '—'}, season ${perfStats.season}`);
  }

  // ── Supplement career: force current club as open-ended entry ───────
  const currentClubForCareer = tm?.currentClub || tsdb?.strTeam;
  if (currentClubForCareer) {
    if (!ext.career) ext.career = [];
    const currentNorm = normalizeStr(currentClubForCareer);
    // Check if current club already has an open-ended entry
    const hasCurrentOpen = ext.career.some(e => !e.to && normalizeStr(e.club || '') === currentNorm);
    if (!hasCurrentOpen) {
      // Close any other open-ended entries
      ext.career = ext.career.map(e =>
        (!e.to && normalizeStr(e.club || '') !== currentNorm) ? { ...e, to: tsdb?.dateSigned || null } : e
      );
      ext.career.unshift({ club: currentClubForCareer, from: tsdb?.dateSigned || null, to: null });
    }
  }

  // ── Detect meaningful changes ───────────────────────────────────────
  // Only flag when a NEW value is found AND differs semantically from old:
  //  - club: alias-aware (Paris SG == Paris Saint-Germain)
  //  - contract: compared as YYYY-MM-DD in local time (avoids .toISOString() UTC-shift bug)
  //  - agent: case/accent/whitespace insensitive
  //  - date_of_birth: YMD compare
  // Sources returning null don't downgrade existing values.
  const oldClub = row.club || '';
  const oldContractYMD = toYMD(row.contract_end);
  const oldDobYMD = toYMD(row.date_of_birth);
  const newContractYMD = toYMD(contractEnd);
  const newDobYMD = toYMD(dateOfBirth);

  const changes = [];
  if (newClub && !clubsEquivalent(newClub, oldClub)) {
    changes.push({ field: 'club', old: oldClub || null, new: newClub });
  }
  if (newContractYMD && newContractYMD !== oldContractYMD) {
    changes.push({ field: 'contract', old: oldContractYMD, new: newContractYMD });
  }
  if (ext.agent && !agentsEquivalent(ext.agent, oldAgent)) {
    changes.push({ field: 'agent', old: oldAgent, new: ext.agent });
  }
  if (newDobYMD && newDobYMD !== oldDobYMD) {
    changes.push({ field: 'date_of_birth', old: oldDobYMD, new: newDobYMD });
  }
  // news_label drives the existing UI badge — keep contract/club/agent keys for i18n compat.
  const primaryNewsFields = changes.filter(c => c.field === 'club' || c.field === 'contract' || c.field === 'agent');
  const newsLabel = primaryNewsFields.length > 1
    ? 'multiples'
    : primaryNewsFields[0]?.field || null;

  // ── Persist enriched club/league in external_data (survives manual edits) ──
  if (newClub) ext.enriched_club = newClub;
  if (newLeague) ext.enriched_league = newLeague;

  // ── Persist canonical TM position in external_data ───────────────────
  // The hero reads from ext.position_canonical so it always matches what the
  // info tab shows, even when players.position couldn't be updated (mapPos null).
  const mapTmPosition = (raw) => {
    if (!raw) return null;
    const s = String(raw).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    if (s.includes('gardien')) return 'GK';
    if (s.includes('lateral droit') || s.includes('arriere droit')) return 'LD';
    if (s.includes('lateral gauche') || s.includes('arriere gauche')) return 'LG';
    if (s.includes('defenseur central') || s.includes('stopper')) return 'DC';
    if (s.includes('milieu defensif') || s.includes('sentinelle')) return 'MDef';
    if (s.includes('milieu offensif') || s.includes('meneur')) return 'MO';
    if (s.includes('ailier droit') || s.includes('extremite droite')) return 'AD';
    if (s.includes('ailier gauche') || s.includes('extremite gauche')) return 'AG';
    if (s.includes('avant-centre') || s.includes('avant centre') || s.includes('attaquant') || s.includes('buteur') || s.includes('second attaquant')) return 'ATT';
    if (s.includes('milieu central') || s.includes('milieu de terrain') || s.includes('milieu')) return 'MC';
    return null;
  };
  const tmPosCanonical = mapTmPosition(tm?.positionRaw);
  if (tm?.positionRaw) ext.tm_position_raw = tm.positionRaw;
  if (tmPosCanonical) ext.position_canonical = tmPosCanonical;

  // ── Build SET clauses ────────────────────────────────────────────────
  const setClauses = ['external_data = ?', 'external_data_fetched_at = NOW()', 'updated_at = NOW()', 'contract_end = ?'];
  const params = [JSON.stringify(ext), contractEnd];

  // has_news always reflects the latest enrichment — pass null to clear stale badges
  // from prior runs whose changes are no longer present after this fresh pass.
  setClauses.push('has_news = ?'); params.push(newsLabel || null);

  if (dateOfBirth) {
    setClauses.push('date_of_birth = ?'); params.push(dateOfBirth);
    // Also fix generation (birth year) when we have an authoritative date of birth
    const dobYear = parseInt(dateOfBirth.slice(0, 4), 10);
    if (dobYear && (!row.generation || Math.abs(row.generation - dobYear) > 1)) {
      setClauses.push('generation = ?'); params.push(dobYear);
    }
  }
  if (ext.market_value) { setClauses.push('market_value = ?'); params.push(ext.market_value); }

  // ── TM ID: persist in dedicated column for future enrichment (skip name search) ──
  if (tm?.tmId) { setClauses.push('transfermarkt_id = ?'); params.push(tm.tmId); }

  // ── Full canonical name: replace truncated/initialed names with TM canonical ──
  // e.g. "A Adorante" → "Andrea Adorante", "K. Mbappé" → "Kylian Mbappé Lottin".
  // shouldUseCanonicalName gates by last-name match + initial/expansion heuristic
  // so we never overwrite a different person or shorten a manually-typed full name.
  // The local name was already recorded as an alias above (line ~11005), so any
  // lookups (UI search, imports) for the old form still resolve to this player.
  if (tm?.canonicalName && row.name && shouldUseCanonicalName(row.name, tm.canonicalName)) {
    setClauses.push('name = ?');
    params.push(String(tm.canonicalName).slice(0, 255));
    console.log(`[enrich] Name expanded: "${row.name}" → "${tm.canonicalName}"`);
  }

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

  // ── TM foot: update if missing, unknown, or different ──────────────
  if (tm?.footRaw) {
    const s = tm.footRaw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let foot = null;
    if (s.includes('gauche')) foot = 'Gaucher';
    else if (s.includes('deux') || s.includes('ambidextre')) foot = 'Ambidextre';
    else if (s.includes('droit')) foot = 'Droitier';
    if (foot) {
      const currentFoot = (row.foot || '').trim();
      console.log(`[enrich] Foot check: DB="${currentFoot}" vs TM="${foot}" → ${currentFoot !== foot ? 'UPDATING' : 'same'}`);
      if (!currentFoot || currentFoot === 'Inconnu' || currentFoot !== foot) {
        setClauses.push('foot = ?'); params.push(foot);
      }
    }
  }

  // ── TM position: sync players.position with the canonical computed above ──
  if (tm?.positionRaw) {
    const mapPos = (raw) => {
      const s = raw.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (s.includes('gardien')) return 'GK';
      if (s.includes('lateral droit') || s.includes('arriere droit')) return 'LD';
      if (s.includes('lateral gauche') || s.includes('arriere gauche')) return 'LG';
      if (s.includes('defenseur central') || s.includes('stopper')) return 'DC';
      if (s.includes('milieu defensif') || s.includes('sentinelle')) return 'MDef';
      if (s.includes('milieu offensif') || s.includes('meneur')) return 'MO';
      if (s.includes('ailier droit') || s.includes('extremite droite')) return 'AD';
      if (s.includes('ailier gauche') || s.includes('extremite gauche')) return 'AG';
      if (s.includes('avant-centre') || s.includes('avant centre') || s.includes('attaquant') || s.includes('buteur') || s.includes('second attaquant')) return 'ATT';
      if (s.includes('milieu central') || s.includes('milieu de terrain') || s.includes('milieu')) return 'MC';
      return null;
    };
    const posZone = { GK: 'Gardien', DC: 'Défenseur', LD: 'Défenseur', LG: 'Défenseur', MDef: 'Milieu', MC: 'Milieu', MO: 'Milieu', AD: 'Attaquant', AG: 'Attaquant', ATT: 'Attaquant' };
    const pos = tmPosCanonical;
    if (pos) {
      setClauses.push('position = ?'); params.push(pos);
      setClauses.push('zone = ?'); params.push(posZone[pos] || '');
    }
  }

  // ── Nationality: TM is authoritative; fall back to Wikidata/TSDB/SofaScore ──
  // Sources matched the player by name + DOB so they're trusted over potentially-stale DB values.
  const newNat = tm?.nationalityRaw
    ? tm.nationalityRaw.split(/\s{2,}/)[0].trim()
    : (fallbackNationality || null);
  if (newNat) {
    const currentNat = normalizeStr(row.nationality || '');
    const sourceNat = normalizeStr(newNat);
    if (!row.nationality || row.nationality === 'Inconnu' || currentNat !== sourceNat) {
      setClauses.push('nationality = ?'); params.push(newNat);
    }
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

  return { setClauses, params, tsdb, wd, tm, dateOfBirth, contractEnd, newClub, changes };
}

// ────────────────────────────────────────────────────────────────────────────

app.post("/api/functions/:name", authMiddleware, async (req, res) => {
  const { name } = req.params;

  if (name === "check-subscription") {
    const [rows] = await pool.query(
      "SELECT is_premium, premium_since, stripe_customer_id, plan_type, billing_cycle, subscription_end FROM user_subscriptions WHERE user_id = ? LIMIT 1",
      [req.user.id]
    );
    const sub = rows[0];
    return res.json({
      subscribed: !!sub?.is_premium,
      source: sub?.stripe_customer_id ? "stripe" : sub?.is_premium ? "admin" : undefined,
      subscription_end: sub?.subscription_end || null,
      premium_since: sub?.premium_since || null,
      plan_type: sub?.plan_type || "starter",
      billing_cycle: sub?.billing_cycle || null,
    });
  }

  if (name === "activate-checkout") {
    if (!stripe) return res.status(501).json({ error: "Stripe non configuré." });
    const { session_id } = req.body || {};
    if (!session_id) return res.status(400).json({ error: "session_id requis." });

    try {
      const session = await stripe.checkout.sessions.retrieve(session_id);
      if (session.status !== "complete" || session.payment_status !== "paid") {
        return res.json({ activated: false, reason: "Paiement non complété." });
      }

      const userId = req.user.id;

      // Check if already premium
      const [existing] = await pool.query("SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1", [userId]);
      if (existing.length > 0 && existing[0].is_premium) {
        return res.json({ activated: true, reason: "already_premium" });
      }

      // Get subscription details from Stripe
      let subEnd = null;
      let planType = session.metadata?.plan_type || null;
      let billingCycle = session.metadata?.billing_cycle || null;

      if (session.subscription) {
        try {
          const sub = await stripe.subscriptions.retrieve(session.subscription, { expand: ["items.data.price.product"] });
          subEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000) : null;

          if (!billingCycle && sub.items?.data?.[0]?.price?.recurring) {
            billingCycle = sub.items.data[0].price.recurring.interval === "year" ? "annual" : "monthly";
          }
          if (!planType && sub.items?.data?.[0]?.price) {
            const price = sub.items.data[0].price;
            const productName = typeof price.product === "object" ? (price.product.name || "") : "";
            if (productName.toLowerCase().includes("pro")) planType = "pro";
            else planType = "scout";
          }
        } catch (e) {
          console.warn("[activate-checkout] Could not retrieve subscription:", e?.message);
        }
      }

      // Fallback: if no subscription (one-time payment), set end date manually
      if (!subEnd) {
        const now = new Date();
        if (billingCycle === "annual") {
          subEnd = new Date(now.getFullYear() + 1, now.getMonth(), now.getDate());
        } else {
          subEnd = new Date(now.getFullYear(), now.getMonth() + 1, now.getDate());
        }
      }

      planType = planType || "scout";
      billingCycle = billingCycle || "monthly";

      // Activate premium
      if (existing.length > 0) {
        await pool.query(
          `UPDATE user_subscriptions SET is_premium = 1, premium_since = COALESCE(premium_since, NOW()),
           stripe_customer_id = ?, stripe_subscription_id = ?, plan_type = ?, billing_cycle = ?,
           subscription_end = ?, updated_at = NOW() WHERE user_id = ?`,
          [session.customer || null, session.subscription || null, planType, billingCycle, subEnd, userId]
        );
      } else {
        await pool.query(
          `INSERT INTO user_subscriptions (id, user_id, is_premium, premium_since, stripe_customer_id,
           stripe_subscription_id, plan_type, billing_cycle, subscription_end)
           VALUES (?, ?, 1, NOW(), ?, ?, ?, ?, ?)`,
          [uuidv4(), userId, session.customer || null, session.subscription || null, planType, billingCycle, subEnd]
        );
      }

      const planLabel = planType === "pro" ? "Scout Pro" : "Scout+";
      const cycleLabel = billingCycle === "annual" ? "annuel" : "mensuel";
      const endDateStr = subEnd ? new Date(subEnd).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "—";

      console.log(`[activate-checkout] Premium activated for user ${userId} (${planType}/${billingCycle}, ends ${subEnd})`);

      await createNotification(userId, {
        type: "subscription",
        title: "Abonnement activé",
        message: `Votre plan ${planLabel} est maintenant actif.`,
        icon: "Crown",
        link: "/account",
      });

      // Send confirmation email
      sendEmail(req.user.email, `Scouty – Votre abonnement ${planLabel} est actif !`, `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
          <img src="https://scouty.app/logo.png" alt="Scouty" width="40" style="border-radius:10px;margin-bottom:16px" />
          <h2 style="color:#1a1a2e;margin:0 0 4px">Bienvenue en ${planLabel} !</h2>
          <p style="color:#6366f1;font-size:14px;font-weight:600;margin:0 0 20px">Abonnement ${cycleLabel}</p>

          <div style="background:#f0f0ff;border-radius:12px;padding:20px;margin:0 0 24px">
            <table style="width:100%;border-collapse:collapse;font-size:14px">
              <tr>
                <td style="padding:6px 0;color:#6b7280">Plan</td>
                <td style="padding:6px 0;font-weight:700;text-align:right;color:#1a1a2e">${planLabel}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280">Cycle</td>
                <td style="padding:6px 0;font-weight:600;text-align:right;color:#1a1a2e">${cycleLabel === "annuel" ? "Annuel" : "Mensuel"}</td>
              </tr>
              <tr>
                <td style="padding:6px 0;color:#6b7280">Prochain renouvellement</td>
                <td style="padding:6px 0;font-weight:600;text-align:right;color:#1a1a2e">${endDateStr}</td>
              </tr>
            </table>
          </div>

          <p style="color:#555;font-size:14px;line-height:1.6">
            Merci pour votre confiance ! Votre paiement a été validé et votre compte est désormais mis à niveau.<br/>
            Vous avez accès à toutes les fonctionnalités ${planLabel} :
          </p>
          <ul style="color:#555;font-size:14px;line-height:1.8;padding-left:20px">
            ${planType === "pro" ? `
            <li>Joueurs illimités</li>
            <li>Shadow teams illimitées</li>
            <li>Calendrier & missions</li>
            <li>API Football</li>
            <li>Enrichissement & exports complets</li>
            ` : `
            <li>Jusqu'à 200 joueurs</li>
            <li>Watchlists illimitées</li>
            <li>Enrichissement automatique</li>
            <li>Exports PDF & Excel</li>
            `}
          </ul>

          <p style="text-align:center;margin:32px 0">
            <a href="https://scouty.app/players" style="background:#6366f1;color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:700;font-size:15px;display:inline-block">
              Accéder à mes joueurs
            </a>
          </p>

          <p style="color:#888;font-size:13px">Vous pouvez gérer votre abonnement à tout moment depuis votre <a href="https://scouty.app/account" style="color:#6366f1">page Compte</a>.</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0" />
          <p style="color:#aaa;font-size:11px;text-align:center">Scouty — Scouting footballistique professionnel</p>
        </div>
      `);

      return res.json({ activated: true, plan_type: planType, billing_cycle: billingCycle, subscription_end: subEnd });
    } catch (err) {
      console.error("[activate-checkout] Error:", err);
      return res.status(500).json({ error: err?.message || "Erreur." });
    }
  }

  if (name === "enrich-player") {
    const [_adminR] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    const _isAdmin = !!_adminR.length;
    // Credit check — admins bypass quotas
    if (!_isAdmin) {
      const creditCheck = await canUseCredit(req.user.id);
      if (!creditCheck.ok) {
        return res.status(200).json({ error: creditCheck.error, quota: creditCheck.quota, used: creditCheck.used });
      }
    }
    const { playerName, club, playerId, nationality, generation, tmUrl } = req.body || {};
    if (!playerName || !playerId) {
      return res.status(400).json({ error: 'Missing playerName or playerId' });
    }
    try {
      const [playerRows] = await pool.query(
        'SELECT id, name, club, league, nationality, date_of_birth, contract_end, external_data, photo_url, transfermarkt_id, generation, foot FROM players WHERE id = ? AND user_id = ?',
        [playerId, req.user.id]
      );
      if (!playerRows.length) return res.status(404).json({ error: 'Player not found' });

      const rec = playerRows[0];
      const playerInfo = {
        name: playerName,
        club: club || rec.club,
        nationality: nationality || rec.nationality,
        generation: generation ? parseInt(generation) : (rec.generation || null),
      };

      // Extract TM path from manually-provided URL (e.g. https://www.transfermarkt.fr/luis-diaz/profil/spieler/534995)
      let tmPath = null;
      if (tmUrl) {
        try {
          const u = new URL(tmUrl.startsWith('http') ? tmUrl : `https://${tmUrl}`);
          if (u.hostname.includes('transfermarkt') && u.pathname.includes('/spieler/')) tmPath = u.pathname;
        } catch {}
      }
      // Fallback: use stored transfermarkt_id to build a direct profile path (skip name-based search)
      if (!tmPath && rec.transfermarkt_id) {
        const slug = normalizeStr(playerName).replace(/ /g, '-') || 'player';
        tmPath = `/${slug}/profil/spieler/${rec.transfermarkt_id}`;
      }

      // When the user manually supplies a TM URL (disambiguation / correction), bypass the cache
      // so they see truly fresh data; otherwise reuse the 24h cross-user cache.
      const enrichResult = await enrichOnePlayer(playerInfo, rec, tmPath, { forceRefresh: !!tmUrl });

      // If ambiguous candidates found, return them for UI disambiguation instead of proceeding
      if (enrichResult.ambiguous) {
        return res.json({
          success: false,
          ambiguous: true,
          candidates: enrichResult.candidates,
        });
      }

      const { setClauses, params, tsdb, wd, tm, changes } = enrichResult;
      params.push(playerId, req.user.id);
      await pool.query(`UPDATE players SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`, params);

      // Build a human-readable change summary (only when something actually changed).
      const FIELD_LABEL_FR = { club: 'club', contract: 'contrat', agent: 'agent', date_of_birth: 'date de naissance' };
      const changeSummary = changes
        .map(c => {
          const label = FIELD_LABEL_FR[c.field] || c.field;
          if (c.old && c.new) return `${label} : ${c.old} → ${c.new}`;
          if (c.new) return `${label} : ${c.new}`;
          return label;
        });

      if (changes.length > 0) {
        await createNotification(req.user.id, {
          type: "enrichment",
          title: `${playerName} — ${changes.length > 1 ? 'modifications' : 'modification'}`,
          message: changeSummary.join(" · "),
          icon: "Zap",
          link: `/player/${playerId}`,
          playerId,
        });
      }

      // Consume 1 credit after successful enrichment (awaited — prevents going negative)
      let creditsRemaining = null;
      if (!_isAdmin) {
        await spendCredit(req.user.id, `Enrichissement: ${playerName}`);
        // Return updated credit balance so client can refresh immediately
        try {
          const planType = await getUserPlanType(req.user.id);
          const quotas = PLAN_QUOTAS[planType] || PLAN_QUOTAS.starter;
          const usage = await getUserCreditUsage(req.user.id);
          if (quotas.daily !== -1) {
            const effectiveMonthly = quotas.monthly + (usage.earned_total || 0);
            creditsRemaining = {
              daily: quotas.daily - usage.daily,
              weekly: quotas.weekly - usage.weekly,
              monthly: effectiveMonthly - usage.monthly,
            };
          }
        } catch {}
      }

      return res.json({
        success: true,
        sources: { thesportsdb: !!tsdb, wikidata: !!wd, transfermarkt: !!tm },
        tmNotFound: !tm,
        changes,
        credits_remaining: creditsRemaining,
      });
    } catch (err) {
      console.error('[enrich-player] Error:', err);
      return res.status(500).json({ error: 'Enrichment failed', detail: err.message });
    }
  }

  if (name === "fetch-tm-profile") {
    // Premium or admin only
    const [_adminR4] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    if (!_adminR4.length) {
      const [_subR4] = await pool.query("SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
      if (!_subR4.length || !_subR4[0].is_premium) {
        return res.status(403).json({ error: "premium_required", message: "L'enrichissement est réservé aux utilisateurs Premium." });
      }
    }
    const { tmUrl } = req.body || {};
    if (!tmUrl) return res.status(400).json({ error: 'Missing tmUrl' });

    let tmPath = null;
    try {
      const u = new URL(tmUrl.startsWith('http') ? tmUrl : `https://${tmUrl}`);
      if (u.hostname.includes('transfermarkt') && u.pathname.includes('/spieler/')) tmPath = u.pathname;
    } catch {}
    if (!tmPath) return res.status(400).json({ error: 'Invalid TM URL — must contain /spieler/' });

    try {
      const tmId = (tmPath.match(/\/spieler\/(\d+)/) || [])[1] || null;
      const opts = { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) };
      const profileResp = await fetch(`https://www.transfermarkt.fr${tmPath}`, opts);
      if (!profileResp.ok) return res.status(502).json({ error: `TM returned ${profileResp.status}` });
      const html = await profileResp.text();

      // ── Player name: og:title is most reliable ──
      let playerName = null;
      const ogTitleM = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      if (ogTitleM) playerName = ogTitleM[1].split(' - ')[0].split(' | ')[0].trim();
      if (!playerName) {
        const titleM = html.match(/<title>([^<]+)<\/title>/);
        if (titleM) playerName = titleM[1].split(' - ')[0].split(' | ')[0].trim();
      }
      // No slug fallback — never invent a name from the URL (could be wrong after accent stripping)
      if (!playerName) return res.status(422).json({ error: 'Could not extract player name from TM page' });

      // ── Date of birth / generation year ──
      const dobRaw = extractBetween(html, 'Date de naissance:</span>', '</span>')
        || extractBetween(html, 'Date de naissance\u00a0:</span>', '</span>')
        || extractBetween(html, 'Date de naissance :</span>', '</span>')
        || extractBetween(html, 'Geboortedatum:</span>', '</span>')
        || extractBetween(html, 'Date of birth:</span>', '</span>')
        || extractBetween(html, 'Geburtsdatum:</span>', '</span>');
      let dateOfBirth = null, generation = null;
      if (dobRaw) {
        // "1 sept. 1999 (25 ans)" or "20 décembre 1998"
        const dmyM = dobRaw.match(/(\d{1,2})\s+([^\s\d(]+)\.?\s+(\d{4})/);
        if (dmyM) {
          const month = matchFrMonth(dmyM[2]);
          if (month) {
            dateOfBirth = `${dmyM[3]}-${String(month).padStart(2, '0')}-${dmyM[1].padStart(2, '0')}`;
            generation = parseInt(dmyM[3]);
          }
        }
        if (!generation) {
          const yearM = dobRaw.match(/(\d{4})/);
          if (yearM) generation = parseInt(yearM[1]);
        }
        // Age-only fallback removed: "(25 ans)" → year is ambiguous by ±1; better no value than a wrong one
      }
      // Age-header last resort removed for same reason — only generation derived from a real DOB year is reliable
      console.log(`[fetch-tm-profile] dobRaw=${JSON.stringify(dobRaw)} → dateOfBirth=${dateOfBirth} generation=${generation}`);

      // ── Nationality (first one listed) ──
      // TM profile shows nationality as flag images: <img title="Portugal" class="flaggenrahmen" />
      let nationalityRaw = null;
      const natLabelIdx2 = html.search(/Nationalit[eé]\s*\u00a0?:/);
      if (natLabelIdx2 !== -1) {
        const natBlock2 = html.slice(natLabelIdx2, natLabelIdx2 + 500);
        const natFlags2 = [...natBlock2.matchAll(/title="([^"]+)"[^>]*flaggenrahmen/g)].map(m => m[1].trim());
        if (natFlags2.length > 0) nationalityRaw = natFlags2.join('  ');
      }
      if (!nationalityRaw) {
        nationalityRaw = extractBetween(html, 'Nationalit\u00e9:</span>', '</span>')
          || extractBetween(html, 'Nationalit\u00e9\u00a0:</span>', '</span>')
          || extractBetween(html, 'Nationalit\u00e9 :</span>', '</span>');
      }

      // ── Position ──
      const positionRaw = extractBetween(html, 'Poste\u00a0:</span>', '</span>')
        || extractBetween(html, 'Poste :</span>', '</span>')
        || extractBetween(html, 'Poste:</span>', '</span>')
        || extractBetween(html, 'Position\u00a0:</span>', '</span>')
        || extractBetween(html, 'Position :</span>', '</span>')
        || extractBetween(html, 'Position:</span>', '</span>');

      // ── Secondary position ──
      const secondaryPositionRaw = extractBetween(html, 'Autres postes\u00a0:</span>', '</span>')
        || extractBetween(html, 'Autres postes :</span>', '</span>')
        || extractBetween(html, 'Autres postes:</span>', '</span>')
        || extractBetween(html, 'Autre poste\u00a0:</span>', '</span>')
        || extractBetween(html, 'Autre poste :</span>', '</span>')
        || extractBetween(html, 'Autre poste:</span>', '</span>');
      // Take only the first secondary position if multiple are listed (comma-separated)
      const secondaryPosition = secondaryPositionRaw ? secondaryPositionRaw.split(',')[0].trim() : null;

      // ── Foot ──
      const footRaw = extractBetween(html, 'Pied fort\u00a0:</span>', '</span>')
        || extractBetween(html, 'Pied fort :</span>', '</span>')
        || extractBetween(html, 'Pied fort:</span>', '</span>')
        || extractBetween(html, 'Pied\u00a0:</span>', '</span>')
        || extractBetween(html, 'Pied :</span>', '</span>')
        || extractBetween(html, 'Pied:</span>', '</span>');

      // ── Contract end ──
      const contractRaw = extractBetween(html, "Contrat jusqu\u2019\u00e0:</span>", "</span>")
        || extractBetween(html, "Contrat jusqu'à:</span>", "</span>")
        || extractBetween(html, "Contrat jusqu&#x27;à:", "</span>");
      const contract = parseFrDate(contractRaw);

      // ── Height ──
      const heightRaw = extractBetween(html, 'Taille:</span>', '</span>');
      let heightCm = null;
      if (heightRaw) {
        const hm = heightRaw.replace(',', '.').match(/([\d.]+)\s*m/);
        if (hm) heightCm = Math.round(parseFloat(hm[1]) * 100);
      }

      // ── Agent ──
      const agentRaw = extractBetween(html, 'Agent du joueur:</span>', '</span>');
      const agent = (agentRaw && agentRaw.length < 80) ? agentRaw : null;

      // ── Market value ──
      const mvM = html.match(/data-header__market-value-wrapper[^>]*>\s*([\d\s,.]+)\s*<span class="waehrung">([^<]+)<\/span>/);
      const marketValue = mvM ? `${mvM[1].trim()} ${mvM[2].trim()}` : null;

      // ── Current club ──
      const clubIdx = html.indexOf('Club actuel');
      const clubBlock = clubIdx >= 0 ? html.slice(clubIdx, clubIdx + 1000) : '';
      const clubTitleM = clubBlock.match(/title="([^"]+)"\s+href="\/[^"]+\/startseite\/verein\//);
      const currentClub = clubTitleM ? clubTitleM[1] : null;

      // ── Photo ──
      let photoUrl = null;
      const photoM = html.match(/data-header__profile-image[^>]*src="([^"]+)"/);
      if (photoM && photoM[1] && !photoM[1].includes('default.jpg') && !photoM[1].includes('placeholder')) {
        photoUrl = photoM[1];
      }
      if (!photoUrl) {
        const ogM = html.match(/<meta\s+property="og:image"\s+content="([^"]+)"/);
        if (ogM && ogM[1] && !ogM[1].includes('default') && !ogM[1].includes('placeholder') && ogM[1].includes('portrait')) {
          photoUrl = ogM[1];
        }
      }

      console.log(`[fetch-tm-profile] name:${playerName} dob:${dateOfBirth} nat:${nationalityRaw} pos:${positionRaw} secPos:${secondaryPosition} foot:${footRaw} club:${currentClub} value:${marketValue}`);

      return res.json({
        success: true,
        name: playerName,
        dateOfBirth,
        generation,
        nationality: nationalityRaw,
        position: positionRaw,
        secondaryPosition,
        foot: footRaw,
        club: currentClub,
        contract,
        marketValue,
        heightCm,
        agent,
        photoUrl,
        tmId,
      });
    } catch (err) {
      console.error('[fetch-tm-profile] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (name === "fetch-tm-club") {
    const { tmUrl } = req.body || {};
    if (!tmUrl) return res.status(400).json({ error: 'Missing tmUrl' });

    let clubPath = null;
    try {
      const u = new URL(tmUrl.startsWith('http') ? tmUrl : `https://${tmUrl}`);
      if (u.hostname.includes('transfermarkt')) {
        // Accept various TM club URL formats: /startseite/verein/, /kader/verein/, etc.
        const vereinM = u.pathname.match(/(\/[^/]+\/)(?:startseite|kader|spielplan|transfers)\/verein\/(\d+)/);
        if (vereinM) {
          clubPath = `${vereinM[1]}kader/verein/${vereinM[2]}`;
        } else {
          // Try simpler pattern
          const simpleM = u.pathname.match(/\/verein\/(\d+)/);
          if (simpleM) {
            const slugM = u.pathname.match(/^(\/[^/]+\/)/);
            clubPath = `${slugM ? slugM[1] : '/club/'}kader/verein/${simpleM[1]}`;
          }
        }
      }
    } catch {}
    if (!clubPath) return res.status(400).json({ error: 'Invalid TM club URL' });

    try {
      const opts = { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) };
      const resp = await fetch(`https://www.transfermarkt.fr${clubPath}`, opts);
      if (!resp.ok) return res.status(502).json({ error: `TM returned ${resp.status}` });
      const html = await resp.text();

      // ── Club name from og:title ──
      let clubName = null;
      const ogM = html.match(/<meta\s+property="og:title"\s+content="([^"]+)"/);
      if (ogM) clubName = decodeHtmlEntities(ogM[1].split(' - ')[0].trim());

      // ── Club logo ──
      // The badge img inside data-header__profile-container has no class on
      // TM's current HTML, so match the container then the first img inside.
      let clubLogo = null;
      const logoM = html.match(/data-header__profile-container[\s\S]*?<img[^>]*src="([^"]+)"/);
      if (logoM) clubLogo = logoM[1];

      // ── League from breadcrumb or header ──
      let league = null;
      const leagueM = html.match(/data-header__club[^>]*>.*?<a[^>]+href="\/[^"]*\/startseite\/wettbewerb\/[^"]*"[^>]*>([^<]+)<\/a>/s);
      if (leagueM) league = leagueM[1].trim();

      // ── Parse squad ──
      // TM nests player info (photo, name, position) in an inner <table> inside
      // the outer row. The outer <td> cells after contain age, nationality, value.
      // Restrict search to responsive-table sections (the actual squad tables).
      const players = [];
      const seenIds = new Set();

      // Collect all responsive-table blocks (each position group is one)
      const squadSections = [];
      const rtRegex = /<div[^>]*class="[^"]*responsive-table[^"]*"[^>]*>([\s\S]*?)(?=<div[^>]*class="[^"]*responsive-table|$)/g;
      let rtMatch;
      while ((rtMatch = rtRegex.exec(html)) !== null) {
        squadSections.push({ html: rtMatch[1], offset: rtMatch.index });
      }
      // Fallback: if no responsive-table found, use the full HTML
      if (squadSections.length === 0) squadSections.push({ html, offset: 0 });

      for (const section of squadSections) {
        const sectionHtml = section.html;
        const playerLinkRegex = /href="(\/[^"]*\/profil\/spieler\/(\d+))"/g;
        let plMatch;
        while ((plMatch = playerLinkRegex.exec(sectionHtml)) !== null) {
          const tmProfilePath = plMatch[1];
          const tmId = plMatch[2];
          if (seenIds.has(tmId)) continue;

          // Find the player name: the anchor text right at this link
          // It may be an <img> tag (photo link) or actual text (name link)
          const linkStart = plMatch.index;
          const anchorChunk = sectionHtml.slice(linkStart, linkStart + 500);
          const anchorM = anchorChunk.match(/>([\s\S]*?)<\/a>/);
          const anchorText = anchorM ? anchorM[1].replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim() : '';

          // If this anchor has no usable text (e.g. it wraps an <img>), skip but DON'T mark as seen
          if (!anchorText || anchorText.length < 2 || anchorText.length > 60 || /profil|statistik|kader|leistung/i.test(anchorText)) continue;

          // Now we have a real name link — mark as seen
          seenIds.add(tmId);

          // Prefer title attribute for canonical "FirstName LastName" — TM anchor text is often abbreviated ("K. Mbappé")
          // title may appear before OR after href depending on TM page variant
          const backCtxTitle = sectionHtml.slice(Math.max(0, linkStart - 200), linkStart + 300);
          const titleBeforeM = backCtxTitle.match(/title="([^"]{2,80})"[^>]*href="[^"]*\/spieler\/\d+"/);
          const titleAfterM  = backCtxTitle.match(/href="[^"]*\/spieler\/\d+"[^>]*title="([^"]{2,80})"/);
          const titleVal = titleBeforeM ? titleBeforeM[1] : (titleAfterM ? titleAfterM[1] : null);
          const name = decodeHtmlEntities(titleVal ? titleVal.trim() : anchorText);

          const linkIdx = plMatch.index;

          // ── Photo: look BACKWARD from the link (same inline-table) ──
          const backCtx = sectionHtml.slice(Math.max(0, linkIdx - 500), linkIdx);
          let photoUrl = null;
          const photoM = backCtx.match(/data-src="([^"]+(?:portrait|joueurs)[^"]*)"/);
          if (photoM && !photoM[1].includes('default.jpg') && !photoM[1].includes('wappen')) photoUrl = photoM[1];

          // ── Everything else: look FORWARD from the link ──
          // The structure after the name link is:
          //   </a></td></tr><tr><td>Position</td></tr></table></td>
          //   <td class="zentriert">AGE</td>
          //   <td class="zentriert"><img class="flaggenrahmen" title="COUNTRY" /></td>
          //   <td class="rechts hauptlink">VALUE</td>
          const fwdCtx = sectionHtml.slice(linkIdx, Math.min(sectionHtml.length, linkIdx + 1500));

          // Position: in the nested table right after the name
          let position = null;
          const posM = fwdCtx.match(/<tr>\s*<td>\s*([A-ZÀ-Ü][a-zà-ü\s'-]+?)\s*<\/td>\s*<\/tr>\s*<\/table>/);
          if (posM) position = posM[1].trim();

          // After the nested </table></td>, extract ONLY this player's outer row cells.
          const tableEndIdx = fwdCtx.indexOf('</table>');
          const outerRowEnd = fwdCtx.indexOf('</tr>', tableEndIdx + 8);
          const outerCells = (tableEndIdx >= 0 && outerRowEnd >= 0)
            ? fwdCtx.slice(tableEndIdx + 8, outerRowEnd)
            : '';


          // Date of birth: only parse when we have a real full date (never guess from age alone — off by ±1 year)
          let dateOfBirth = null;
          let generation = null;
          const cellTexts = [...outerCells.matchAll(/<td[^>]*class="zentriert"[^>]*>([\s\S]*?)<\/td>/g)]
            .map(m => m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
          for (const cellText of cellTexts) {
            if (dateOfBirth) break;
            // Only accept a fully-parsed date: "1 juil. 1999 (26)" or "01.07.1999 (26)"
            const dob = parseFrDateAny(cellText);
            if (dob) {
              const dobYear = parseInt(dob.split('-')[0], 10);
              if (dobYear >= 1970 && dobYear <= new Date().getFullYear() - 10) {
                dateOfBirth = dob;
                generation = dobYear;
                break;
              }
            }
          }
          // age-only fallback removed: "(26 ans)" → year is ambiguous by ±1; better no value than a wrong one

          // Contract end: look for a future date in zentriert cells (not already used as DOB)
          let contractEnd = null;
          for (const cellText of cellTexts) {
            const parsed = parseFrDateAny(cellText);
            if (parsed && parsed !== dateOfBirth) {
              const yr = parseInt(parsed.split('-')[0], 10);
              if (yr >= new Date().getFullYear()) {
                contractEnd = parsed;
                break;
              }
            }
          }

          // Nationality (flag title) — first flag img with class flaggenrahmen
          // TM puts title BEFORE class: <img ... title="Cameroun" ... class="flaggenrahmen" />
          let nationality = null;
          const natM = outerCells.match(/title="([^"]+)"[^>]*flaggenrahmen/);
          if (natM) nationality = decodeHtmlEntities(natM[1].trim());

          // Market value
          let marketValue = null;
          const mvM = outerCells.match(/rechts hauptlink[\s\S]*?>([\d,.]+\s*[^<]*)</);
          if (mvM) marketValue = mvM[1].replace(/&nbsp;/g, ' ').trim();

          // Skip entries that don't look like real player rows
          if (!generation && !position && !nationality) continue;

          players.push({
            tmId,
            tmProfilePath,
            name,
            photoUrl,
            position,
            dateOfBirth,
            generation,
            nationality,
            marketValue,
            contractEnd,
          });
        }
      }

      console.log(`[fetch-tm-club] club:${clubName} league:${league} players:${players.length}`);

      return res.json({
        success: true,
        clubName,
        clubLogo,
        league,
        players,
      });
    } catch (err) {
      console.error('[fetch-tm-club] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── fetch-tm-match: scrape a Transfermarkt match report page ──────────────
  if (name === "fetch-tm-match") {
    const { tmUrl } = req.body || {};
    if (!tmUrl) return res.status(400).json({ error: 'Missing tmUrl' });

    let matchPath = null;
    try {
      const u = new URL(tmUrl.startsWith('http') ? tmUrl : `https://${tmUrl}`);
      if (u.hostname.includes('transfermarkt')) {
        const m = u.pathname.match(/\/spielbericht\/index\/spielbericht\/(\d+)/);
        if (m) matchPath = `/spielbericht/index/spielbericht/${m[1]}`;
      }
    } catch {}
    if (!matchPath) return res.status(400).json({ error: 'Invalid TM match URL' });

    try {
      const opts = { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) };
      const resp = await fetch(`https://www.transfermarkt.fr${matchPath}`, opts);
      if (!resp.ok) return res.status(502).json({ error: `TM returned ${resp.status}` });
      const html = await resp.text();

      // ── Match info from og:title: "Team A - Team B, date - Competition - Rapport de match" ──
      let competition = null;
      const compM = html.match(/direct-headline__header-box[\s\S]*?title="([^"]+)"/);
      if (compM) competition = decodeHtmlEntities(compM[1]);

      // ── Score ──
      let score = null;
      const scoreM = html.match(/sb-endstand[^>]*>\s*(\d+:\d+)/);
      if (scoreM) score = scoreM[1];

      // ── Match date ──
      let matchDate = null;
      const dateM = html.match(/datum\/(\d{4}-\d{2}-\d{2})/);
      if (dateM) matchDate = dateM[1];

      // ── Teams from header ──
      const homeTeamM = html.match(/sb-team sb-heim[\s\S]*?title="([^"]+)"[^>]*href="([^"]+)"/);
      const awayTeamM = html.match(/sb-team sb-gast[\s\S]*?title="([^"]+)"[^>]*href="([^"]+)"/);
      const homeName = homeTeamM ? decodeHtmlEntities(homeTeamM[1]) : null;
      const awayName = awayTeamM ? decodeHtmlEntities(awayTeamM[1]) : null;

      // ── Team logos ──
      let homeLogo = null;
      const homeLogoM = html.match(/sb-team sb-heim[\s\S]*?<img[^>]*src="([^"]+)"/);
      if (homeLogoM) homeLogo = homeLogoM[1];
      let awayLogo = null;
      const awayLogoM = html.match(/sb-team sb-gast[\s\S]*?<img[^>]*src="([^"]+)"/);
      if (awayLogoM) awayLogo = awayLogoM[1];

      // ── Parse lineups ──
      // The aufstellung-box contains both teams, split by aufstellung-unterueberschrift-mannschaft
      const aufStart = html.indexOf('aufstellung-box');
      if (aufStart < 0) return res.json({ success: true, homeName, awayName, homeLogo, awayLogo, competition, score, matchDate, teams: [] });

      const aufSection = html.slice(aufStart, aufStart + 60000);
      const teamSections = aufSection.split(/aufstellung-unterueberschrift-mannschaft/);

      // TM bench position abbreviations (French)
      const TM_BENCH_POS = {
        'GdB': 'Gardien de but', 'DC': 'Défenseur central', 'DD': 'Arrière droit', 'DG': 'Arrière gauche',
        'ArD': 'Arrière droit', 'ArG': 'Arrière gauche',
        'MDF': 'Milieu défensif', 'MDC': 'Milieu défensif central', 'MC': 'Milieu central',
        'MO': 'Milieu offensif', 'MOC': 'Milieu offensif central',
        'AD': 'Ailier droit', 'AG': 'Ailier gauche', 'AiD': 'Ailier droit', 'AiG': 'Ailier gauche',
        'AC': 'Avant-centre', 'BU': 'Buteur',
        'MD': 'Milieu droit', 'MG': 'Milieu gauche', 'ATT': 'Attaquant',
        'LD': 'Latéral droit', 'LG': 'Latéral gauche',
        'SA': 'Second attaquant',
      };

      const teams = [];
      const teamNames = [homeName, awayName];
      const teamLogos = [homeLogo, awayLogo];

      for (let ti = 1; ti <= 2 && ti < teamSections.length; ti++) {
        const section = teamSections[ti];
        const seenIds = new Set();
        const starters = [];
        const bench = [];

        // Split at bench marker
        const benchMarker = section.indexOf('ersatzbank');
        const formationHtml = benchMarker >= 0 ? section.slice(0, benchMarker) : section;
        const benchHtml = benchMarker >= 0 ? section.slice(benchMarker) : '';

        // Helper: extract full name preferring title attribute over anchor text (TM uses abbreviated names in formations)
        const extractTmName = (block) => {
          const titleBeforeM = block.match(/title="([^"]{2,80})"[^>]*href="[^"]*\/spieler\/\d+"/);
          const titleAfterM  = block.match(/href="[^"]*\/spieler\/\d+"[^>]*title="([^"]{2,80})"/);
          const titleVal = titleBeforeM ? titleBeforeM[1] : (titleAfterM ? titleAfterM[1] : null);
          if (titleVal) return decodeHtmlEntities(titleVal.trim());
          // Fallback: anchor text (strip HTML tags, keep text)
          const anchorM = block.match(/href="[^"]*\/spieler\/\d+"[^>]*>([^<]+)<\/a>/);
          return anchorM ? decodeHtmlEntities(anchorM[1].trim()) : null;
        };

        // ── Starters: iterate per formation-player-container block ──
        const containerBlocks = [...formationHtml.matchAll(/formation-player-container([\s\S]*?)(?=formation-player-container|$)/g)];
        for (const cm of containerBlocks) {
          const block = cm[1];
          const numM = block.match(/tm-shirt-number[^>]*>\s*(\d+)\s*<\/div>/);
          if (!numM) continue;
          const hrefM = block.match(/href="(\/[^"]*\/profil\/spieler\/(\d+))"/);
          if (!hrefM) continue;
          const tmId = hrefM[2];
          if (seenIds.has(tmId)) continue;
          const name = extractTmName(block);
          if (!name || name.length < 2) continue;
          seenIds.add(tmId);
          starters.push({
            tmId,
            tmProfilePath: hrefM[1],
            name,
            shirtNumber: parseInt(numM[1]),
            starter: true,
            position: null,
          });
        }

        // ── Bench: from ersatzbank table rows ──
        const benchRowRegex = /<tr>([\s\S]*?)<\/tr>/g;
        let br;
        while ((br = benchRowRegex.exec(benchHtml)) !== null) {
          const row = br[1];
          const hrefM = row.match(/href="(\/[^"]*\/profil\/spieler\/(\d+))"/);
          if (!hrefM) continue;
          const tmId = hrefM[2];
          if (seenIds.has(tmId)) continue;
          const name = extractTmName(row);
          if (!name || name.length < 2) continue;
          seenIds.add(tmId);

          const numM = row.match(/tm-shirt-number[^>]*>\s*(\d+)\s*<\/div>/);
          const posM = row.match(/<td>\s*([A-ZÀ-Ü][A-Za-zÀ-ü]+)\s*<\/td>\s*$/);
          const posAbbr = posM ? posM[1].trim() : null;
          const posExpanded = posAbbr && TM_BENCH_POS[posAbbr] ? TM_BENCH_POS[posAbbr] : posAbbr;

          bench.push({
            tmId,
            tmProfilePath: hrefM[1],
            name,
            shirtNumber: numM ? parseInt(numM[1]) : null,
            starter: false,
            position: posExpanded,
          });
        }

        teams.push({
          name: teamNames[ti - 1],
          logo: teamLogos[ti - 1],
          players: [...starters, ...bench],
        });
      }

      console.log(`[fetch-tm-match] ${homeName} vs ${awayName} – ${teams.map(t => t.players.length).join('+')} players`);

      return res.json({
        success: true,
        homeName,
        awayName,
        homeLogo,
        awayLogo,
        competition,
        score,
        matchDate,
        teams,
      });
    } catch (err) {
      console.error('[fetch-tm-match] Error:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  if (name === "enrich-all-progress") {
    const progress = enrichAllProgress.get(req.user.id);
    if (!progress) return res.json({ running: false });
    return res.json(progress);
  }

  // Returns counts to help the client decide whether to show the re-enrich confirmation
  if (name === "enrich-all-stats") {
    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const [[totalRow]] = await pool.query("SELECT COUNT(*) AS cnt FROM players WHERE user_id = ? AND is_archived = 0", [req.user.id]);
    const [[recentRow]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM players WHERE user_id = ? AND is_archived = 0 AND external_data_fetched_at >= ?",
      [req.user.id, sixMonthsAgo]
    );
    const [[neverRow]] = await pool.query(
      "SELECT COUNT(*) AS cnt FROM players WHERE user_id = ? AND is_archived = 0 AND external_data_fetched_at IS NULL",
      [req.user.id]
    );
    const total = Number(totalRow.cnt);
    const recentlyEnriched = Number(recentRow.cnt);
    const neverEnriched = Number(neverRow.cnt);
    return res.json({ total, recentlyEnriched, neverEnriched, oldOrNever: total - recentlyEnriched });
  }

  if (name === "enrich-all-players") {
    const [_adminR2] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    const _isAdmin2 = !!_adminR2.length;
    // includeRecentlyEnriched: when true, re-enrich players enriched within 6 months too
    const includeRecentlyEnriched = !!(req.body?.includeRecentlyEnriched);
    // Credit check before starting — must have at least 1 credit
    if (!_isAdmin2) {
      const creditCheck = await canUseCredit(req.user.id);
      if (!creditCheck.ok) {
        return res.status(200).json({ error: creditCheck.error, quota: creditCheck.quota, used: creditCheck.used });
      }
    }
    // Prevent concurrent runs
    const existing = enrichAllProgress.get(req.user.id);
    if (existing && existing.running) {
      return res.json({ total: existing.total, message: 'Enrichissement déjà en cours', alreadyRunning: true });
    }

    const sixMonthsAgo = new Date(Date.now() - 6 * 30 * 24 * 60 * 60 * 1000);
    const [playersRaw] = await pool.query(
      `SELECT id, name, club, nationality, generation,
              photo_url, date_of_birth, contract_end, market_value,
              notes, general_opinion, transfermarkt_id, external_data,
              external_data_fetched_at
       FROM players WHERE user_id = ?
       ${!includeRecentlyEnriched ? 'AND (external_data_fetched_at IS NULL OR external_data_fetched_at < ?)' : ''}
       ORDER BY name`,
      !includeRecentlyEnriched ? [req.user.id, sixMonthsAgo] : [req.user.id]
    );
    if (!playersRaw.length) return res.json({ total: 0, message: 'No players to enrich', allRecentlyEnriched: true });

    // Same completion% logic as client — 10 fields
    function serverCompletionPct(p) {
      let ext = {};
      try { ext = typeof p.external_data === 'string' ? JSON.parse(p.external_data) : (p.external_data ?? {}); } catch {}
      const checks = [
        !!p.photo_url, !!p.date_of_birth, !!p.contract_end,
        !!(ext.market_value || p.market_value), !!ext.height, !!ext.agent,
        !!(p.notes?.trim()), !!p.general_opinion, !!ext.performance_stats,
        !!(p.transfermarkt_id || ext.transfermarkt_id),
      ];
      return Math.round(checks.filter(Boolean).length / checks.length * 100);
    }

    // Sort: primary (never enriched OR ≤50%) first, secondary (enriched AND >50%) last
    const players = [...playersRaw].sort((a, b) => {
      const secA = !!a.external_data_fetched_at && serverCompletionPct(a) > 50;
      const secB = !!b.external_data_fetched_at && serverCompletionPct(b) > 50;
      if (secA === secB) return 0;
      return secA ? 1 : -1;
    });

    const total = players.length;
    enrichAllProgress.set(req.user.id, { running: true, total, done: 0, errors: 0 });
    res.json({ total, message: `Enrichissement de ${total} joueurs lancé en arrière-plan` });

    (async () => {
      let done = 0, errors = 0, stopped = false;
      for (const p of players) {
        // Check credit before each player — stop loop if exhausted
        if (!_isAdmin2) {
          const cc = await canUseCredit(req.user.id);
          if (!cc.ok) {
            console.log(`[enrich-all] Stopping — credit limit (${cc.error})`);
            stopped = true;
            break;
          }
        }
        try {
          const [rows] = await pool.query(
            'SELECT id, name, club, league, nationality, generation, date_of_birth, contract_end, external_data, photo_url, transfermarkt_id, foot FROM players WHERE id = ?',
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
          // Reuse stored transfermarkt_id (from any prior successful enrich) so we skip
          // the ambiguity-prone name search — same trick the single-player endpoint uses.
          let tmPath = null;
          if (row.transfermarkt_id) {
            const slug = normalizeStr(row.name).replace(/ /g, '-') || 'player';
            tmPath = `/${slug}/profil/spieler/${row.transfermarkt_id}`;
          }

          let result = await enrichOnePlayer(playerInfo, row, tmPath);
          if (result.ambiguous) {
            // No UI to disambiguate in batch mode — pick the highest-scored TM candidate
            // and re-run via direct path. DOB-aware scoring already favors the right one.
            const top = result.candidates?.[0];
            if (top?.path) {
              console.log(`[enrich-all] ${row.name} — ${result.candidates.length} candidats, auto-pick: ${top.name}`);
              result = await enrichOnePlayer(playerInfo, row, top.path);
            }
          }
          if (result.ambiguous) {
            errors++;
            console.log(`[enrich-all] ${row.name} — toujours ambigu, passé`);
          } else {
            const { setClauses, params } = result;
            params.push(p.id);
            await pool.query(`UPDATE players SET ${setClauses.join(', ')} WHERE id = ?`, params);
            done++;
            console.log(`[enrich-all] ${done}/${total} ${row.name} ✓`);
            // Await spendCredit so canUseCredit on next iteration sees the updated count
            if (!_isAdmin2) await spendCredit(req.user.id, `Enrichissement: ${row.name}`);
          }
        } catch (e) {
          errors++;
          console.error(`[enrich-all] Error for ${p.name}:`, e.message);
        }
        // Include current credit balance in progress for real-time client display
        let creditInfo = null;
        if (!_isAdmin2) {
          try {
            const planType = await getUserPlanType(req.user.id);
            const quotas = PLAN_QUOTAS[planType] || PLAN_QUOTAS.starter;
            if (quotas.daily !== -1) {
              const usage = await getUserCreditUsage(req.user.id);
              const effectiveMonthly = quotas.monthly + (usage.earned_total || 0);
              creditInfo = {
                daily: quotas.daily - usage.daily,
                weekly: quotas.weekly - usage.weekly,
                monthly: effectiveMonthly - usage.monthly,
              };
            }
          } catch {}
        }
        enrichAllProgress.set(req.user.id, { running: true, total, done, errors, credits: creditInfo });
        // Polite delay to avoid TM rate-limit
        await new Promise(r => setTimeout(r, 1500));
      }
      enrichAllProgress.set(req.user.id, { running: false, total, done, errors, stopped });
      console.log(`[enrich-all] Done: ${done} enriched, ${errors} errors`);
      // Clean up after 5 minutes
      setTimeout(() => enrichAllProgress.delete(req.user.id), 5 * 60 * 1000);
    })();

    return;
  }

  if (name === "fetch-player-photos") {
    // Premium or admin only
    const [_adminR3] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    if (!_adminR3.length) {
      const [_subR3] = await pool.query("SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
      if (!_subR3.length || !_subR3[0].is_premium) {
        return res.status(403).json({ error: "premium_required", message: "Cette fonctionnalité est réservée aux utilisateurs Premium." });
      }
    }
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
  // Paginate livescore events: keep competition structure but slice events
  function paginateEvents(data, offset, limit) {
    if (!offset && limit >= 9999) return data;
    const comps = [];
    let skipped = 0, taken = 0;
    for (const comp of (data.competitions || [])) {
      if (taken >= limit) break;
      const slicedEvents = [];
      for (const ev of comp.events) {
        if (taken >= limit) break;
        if (skipped < offset) { skipped++; continue; }
        slicedEvents.push(ev);
        taken++;
      }
      if (slicedEvents.length > 0) {
        comps.push({ ...comp, events: slicedEvents });
      }
    }
    return { competitions: comps, date: data.date, count: data.count, offset, limit, returned: taken };
  }

  if (name === "livescore-events-day") {
    const { date, offset, limit: pageLimit } = req.body || {};
    if (!date) return res.status(400).json({ error: "Missing date (YYYY-MM-DD)" });
    const pOffset = parseInt(offset) || 0;
    const pLimit = Math.min(parseInt(pageLimit) || 9999, 9999);

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
          return res.json(paginateEvents(parsed, pOffset, pLimit));
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

      // Save team data to club_logos + club_directory (fire-and-forget — NOT awaited)
      (async () => {
        try {
          // Collect all teams first, then batch insert
          const logoValues = [];
          const logoParams = [];
          const dirValues = [];
          const dirParams = [];
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

                if (badge) {
                  logoValues.push('(?, ?)');
                  logoParams.push(name, badge);
                }

                dirValues.push('(?, ?, ?, ?, ?)');
                dirParams.push(name, comp.name, comp.country, comp.country_code, badge || null);
              }
            }
          }

          // Batch insert club_logos
          if (logoValues.length > 0) {
            await pool.query(
              `INSERT IGNORE INTO club_logos (club_name, logo_url) VALUES ${logoValues.join(', ')}`,
              logoParams
            ).catch(() => {});
          }

          // Batch insert club_directory
          if (dirValues.length > 0) {
            await pool.query(
              `INSERT INTO club_directory (club_name, competition, country, country_code, logo_url)
               VALUES ${dirValues.join(', ')}
               ON DUPLICATE KEY UPDATE
                 competition = VALUES(competition),
                 country = VALUES(country),
                 country_code = VALUES(country_code),
                 logo_url = COALESCE(NULLIF(VALUES(logo_url), ''), logo_url)`,
              dirParams
            ).catch(() => {});
          }

          console.log(`[livescore] Saved ${teamsSeen.size} teams to club_directory + club_logos`);
        } catch (e) {
          console.warn("[livescore] Team data save error:", e.message);
        }
      })();

      const fullResult = { competitions, date, count: totalEvents };

      // Cache the full result for 30 minutes
      try {
        await pool.query(
          `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
           VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 30 MINUTE))
           ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 30 MINUTE)`,
          [cacheKey, JSON.stringify(fullResult)]
        );
      } catch { /* table may not exist */ }

      console.log(`[livescore] ${date}: ${totalEvents} events across ${competitions.length} competitions`);

      // Paginate: return only the requested slice of events
      return res.json(paginateEvents(fullResult, pOffset, pLimit));
    } catch (err) {
      console.error("[livescore] ERROR:", err.message, err.stack);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Livescore match lineups ─────────────────────────────────────────────────
  if (name === "livescore-match-lineups") {
    const { matchId } = req.body || {};
    if (!matchId) return res.status(400).json({ error: "Missing matchId" });

    try {
      // Check cache (1h TTL)
      const cacheKey = `lineup:${matchId}`;
      try {
        const [cached] = await pool.query(
          "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
          [cacheKey]
        );
        if (cached.length > 0) {
          const json = cached[0].response_json;
          return res.json(typeof json === "string" ? JSON.parse(json) : json);
        }
      } catch { /* table may not exist */ }

      const parseTeamLineup = (teamData) => {
        if (!teamData || !Array.isArray(teamData)) return [];
        return teamData.map((p) => ({
          name: p.Nm || p.Pn || `${p.Fn || ''} ${p.Ln || ''}`.trim() || "",
          number: p.Snu ? parseInt(p.Snu, 10) : (p.Jn ? parseInt(p.Jn, 10) : null),
          position: p.Pos || "",
          grid: p.Gd || null,
          captain: !!p.Cpt,
          substituted: !!p.Sub,
          yellow: !!p.Yc,
          red: !!p.Rc,
        }));
      };

      let homeLineup = [];
      let awayLineup = [];
      let homeFormation = null;
      let awayFormation = null;
      let homeSubs = [];
      let awaySubs = [];

      // Try the dedicated lineup endpoint first
      const luUrl = `https://prod-public-api.livescore.com/v1/api/app/lineup/soccer/${matchId}`;
      console.log(`[livescore-lineup] Fetching: ${luUrl}`);
      const resp = await fetch(luUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });

      if (resp.ok) {
        const luRaw = await resp.json();
        console.log(`[livescore-lineup] Response keys:`, Object.keys(luRaw));
        const lu = luRaw.Lu || luRaw;
        const hData = lu['1'] || lu.home || {};
        const aData = lu['2'] || lu.away || {};
        homeFormation = hData.Fo || hData.formation || null;
        awayFormation = aData.Fo || aData.formation || null;
        homeLineup = parseTeamLineup(hData.Ps || hData.players || hData.XI || []);
        awayLineup = parseTeamLineup(aData.Ps || aData.players || aData.XI || []);
        homeSubs = (hData.Sb || hData.subs || hData.Sub || []).map(p => ({ name: p.Nm || p.Pn || "", number: p.Snu ? parseInt(p.Snu, 10) : (p.Jn ? parseInt(p.Jn, 10) : null), position: p.Pos || "" }));
        awaySubs = (aData.Sb || aData.subs || aData.Sub || []).map(p => ({ name: p.Nm || p.Pn || "", number: p.Snu ? parseInt(p.Snu, 10) : (p.Jn ? parseInt(p.Jn, 10) : null), position: p.Pos || "" }));
        if (homeLineup.length === 0 && awayLineup.length === 0) {
          console.log(`[livescore-lineup] Could not parse lineup, raw structure:`, JSON.stringify(luRaw).slice(0, 2000));
        }
      } else {
        console.log(`[livescore-lineup] Lineup endpoint returned ${resp.status}, trying scoreboard fallback`);
        // Fallback: try scoreboard endpoint
        const sbUrl = `https://prod-public-api.livescore.com/v1/api/app/scoreboard/soccer/${matchId}?MD=1`;
        const sbResp = await fetch(sbUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/json" },
        });
        if (sbResp.ok) {
          const raw = await sbResp.json();
          if (raw.Lu) {
            homeLineup = parseTeamLineup(raw.Lu.home?.Ps);
            awayLineup = parseTeamLineup(raw.Lu.away?.Ps);
            homeFormation = raw.Lu.home?.Fo || null;
            awayFormation = raw.Lu.away?.Fo || null;
            homeSubs = (raw.Lu.home?.Sb || []).map(p => ({ name: p.Nm || "", number: p.Snu ? parseInt(p.Snu, 10) : null, position: p.Pos || "" }));
            awaySubs = (raw.Lu.away?.Sb || []).map(p => ({ name: p.Nm || "", number: p.Snu ? parseInt(p.Snu, 10) : null, position: p.Pos || "" }));
          }
        }
      }

      console.log(`[livescore-lineup] ${matchId}: home=${homeLineup.length} away=${awayLineup.length}`);

      const result = {
        matchId,
        home: {
          formation: homeFormation,
          players: homeLineup,
          subs: homeSubs,
        },
        away: {
          formation: awayFormation,
          players: awayLineup,
          subs: awaySubs,
        },
        available: (homeLineup.length + awayLineup.length) > 0,
      };

      // Cache for 1 hour
      try {
        await pool.query(
          `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
           VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 60 MINUTE))
           ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 60 MINUTE)`,
          [cacheKey, JSON.stringify(result)]
        );
      } catch { /* table may not exist */ }

      return res.json(result);
    } catch (err) {
      console.error("[livescore-lineup] ERROR:", err.message);
      return res.status(500).json({ error: err.message });
    }
  }

  // ── Livescore match detail (events, stats, lineups, venue, referee) ──────────
  if (name === "livescore-match-detail") {
    const { matchId } = req.body || {};
    if (!matchId) return res.status(400).json({ error: "Missing matchId" });

    try {
      const cacheKey = `match-detail:v3:${matchId}`;
      try {
        const [cached] = await pool.query(
          "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
          [cacheKey]
        );
        if (cached.length > 0) {
          const json = cached[0].response_json;
          return res.json(typeof json === "string" ? JSON.parse(json) : json);
        }
      } catch { /* table may not exist */ }

      const url = `https://prod-public-api.livescore.com/v1/api/app/scoreboard/soccer/${matchId}?MD=1`;
      console.log(`[livescore-detail] Fetching: ${url}`);

      const resp = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
        },
      });
      if (!resp.ok) {
        return res.status(502).json({ error: `Livescore returned ${resp.status}` });
      }

      const raw = await resp.json();

      // Team info
      const homeName = (raw.T1 && raw.T1[0] && raw.T1[0].Nm) || "";
      const awayName = (raw.T2 && raw.T2[0] && raw.T2[0].Nm) || "";
      const homeImg = raw.T1 && raw.T1[0] && raw.T1[0].Img
        ? `https://lsm-static-prod.livescore.com/medium/${raw.T1[0].Img}` : null;
      const awayImg = raw.T2 && raw.T2[0] && raw.T2[0].Img
        ? `https://lsm-static-prod.livescore.com/medium/${raw.T2[0].Img}` : null;

      // Scores
      const scoreHome = raw.Tr1 != null && raw.Tr1 !== "" ? parseInt(raw.Tr1, 10) : null;
      const scoreAway = raw.Tr2 != null && raw.Tr2 !== "" ? parseInt(raw.Tr2, 10) : null;
      const htScoreHome = raw.Trh1 != null && raw.Trh1 !== "" ? parseInt(raw.Trh1, 10) : null;
      const htScoreAway = raw.Trh2 != null && raw.Trh2 !== "" ? parseInt(raw.Trh2, 10) : null;

      const status = raw.Eps || raw.Epr || "NS";

      // Start time
      const esd = raw.Esd ? String(raw.Esd) : "";
      const matchTime = esd.length >= 12 ? `${esd.slice(8, 10)}:${esd.slice(10, 12)}` : null;
      const matchDate = esd.length >= 8 ? `${esd.slice(0, 4)}-${esd.slice(4, 6)}-${esd.slice(6, 8)}` : null;

      // Competition / venue / referee — prefer Stg (stage) object for competition info
      const stg = raw.Stg || {};
      const competition = stg.Snm || stg.CompN || raw.Snm || raw.Sn || "";
      const country = stg.Cnm || raw.Cnm || raw.Cn || "";
      const countryCode = stg.Ccdiso || stg.Ccd || raw.Ccd || "";
      const venue = raw.Vn || raw.Stad || (raw.Venue && typeof raw.Venue === 'object' ? (raw.Venue.Vnm || raw.Venue.Nm) : null) || null;
      const referee = raw.Ref || raw.Rfn
        || (Array.isArray(raw.Refs) && raw.Refs[0] && raw.Refs[0].Nm)
        || null;

      // ── Match events/incidents ──
      // API format: "Incs-s" → { "1": [group, ...], "2": [group, ...] }
      // Top-level keys are HALVES (1st/2nd half), NOT teams.
      // Team is on each incident/group as `Nm` (1 = home, 2 = away).
      // A group is either flat (has `IT` directly) or nested (has `Incs: [...]`).
      // IT codes (observed): 36=Goal, 37=PenaltyGoal, 39=YellowCard,
      //   40=SecondYellow, 41=RedCard, 42=Substitution, 43/45=PenMissed,
      //   44=Goal-variant, 46=VAR, 63=Assist(skip).
      // Own goals are NOT reliably distinguishable by IT code (37 was previously
      // assumed to be own_goal but is actually a penalty goal). We classify
      // own_goals using the cumulative score `Sc` delta vs. the player's team.
      const IT_MAP = {
        36: 'goal', 37: 'goal', 44: 'goal',
        39: 'yellow_card',
        40: 'second_yellow',
        41: 'red_card',
        42: 'substitution',
        43: 'penalty_missed',
        45: 'penalty_missed',
        46: 'var',
      };
      const teamFromNm = (nm) => (parseInt(nm, 10) === 2 ? 'away' : 'home');
      const events = [];
      const incsS = raw['Incs-s'];
      if (incsS && typeof incsS === 'object') {
        let runHome = 0, runAway = 0;
        for (const groups of Object.values(incsS)) {
          if (!Array.isArray(groups)) continue;
          for (const group of groups) {
            const hasNested = Array.isArray(group.Incs) && group.Incs.length > 0;
            const subIncs = hasNested ? group.Incs : [group];
            for (const inc of subIncs) {
              const itCode = typeof inc.IT === 'number' ? inc.IT : parseInt(inc.IT, 10);
              let type = IT_MAP[itCode];
              if (!type) {
                if (itCode !== 63) console.log(`[livescore-detail] Unknown IT: ${itCode} (${inc.Pn})`);
                continue;
              }
              const playerTeam = teamFromNm(inc.Nm ?? group.Nm);

              // Detect own goals from the score delta: if the goal credited the
              // OPPOSING team's score, it's an own goal regardless of IT code.
              if (type === 'goal' && Array.isArray(inc.Sc) && inc.Sc.length === 2) {
                const newH = parseInt(inc.Sc[0], 10);
                const newA = parseInt(inc.Sc[1], 10);
                if (Number.isFinite(newH) && Number.isFinite(newA)) {
                  const dH = newH - runHome;
                  const dA = newA - runAway;
                  if (dH > 0 && dA <= 0) {
                    type = playerTeam === 'home' ? 'goal' : 'own_goal';
                    runHome = newH;
                  } else if (dA > 0 && dH <= 0) {
                    type = playerTeam === 'away' ? 'goal' : 'own_goal';
                    runAway = newA;
                  } else {
                    runHome = newH;
                    runAway = newA;
                  }
                }
              }

              const event = {
                type,
                minute: parseInt(inc.Min || group.Min || 0, 10) || 0,
                extra_time: parseInt(inc.MinEx || group.MinEx || 0, 10) || 0,
                player: inc.Pn || `${inc.Fn || ''} ${inc.Ln || ''}`.trim() || "",
                player_in: null,
                team: playerTeam,
              };
              // For substitutions, pair with the other player in the same group
              if (type === 'substitution' && hasNested) {
                const other = subIncs.find(i => i !== inc && i.IT !== 63);
                if (other) {
                  event.player_in = other.Pn || `${other.Fn || ''} ${other.Ln || ''}`.trim() || null;
                }
              }
              events.push(event);
            }
          }
        }
        events.sort((a, b) => a.minute - b.minute || a.extra_time - b.extra_time);
      }

      // ── Fetch statistics & lineups from dedicated Livescore endpoints (in parallel) ──
      const lsHeaders = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/json",
      };
      const [statsResp, lineupsResp] = await Promise.all([
        fetch(`https://prod-public-api.livescore.com/v1/api/app/statistics/soccer/${matchId}`, { headers: lsHeaders }).catch(() => null),
        fetch(`https://prod-public-api.livescore.com/v1/api/app/lineups/soccer/${matchId}`, { headers: lsHeaders }).catch(() => null),
      ]);

      // ── Parse statistics ──
      // Stat: [{Tnb:1, Fls, Pss, Cos, Shon, Shof, ...}, {Tnb:2, ...}]
      const STAT_MAP = {
        Pss: 'Ball Possession', Shon: 'Shots on Target', Shof: 'Shots Off Target',
        Shbl: 'Blocked Shots', Cos: 'Corner Kicks', Fls: 'Fouls',
        Ycs: 'Yellow Cards', Rcs: 'Red Cards', Ofs: 'Offsides',
        Gks: 'Goalkeeper Saves', Ths: 'Throw-ins', Crs: 'Crosses',
        Att: 'Attacks', YRcs: 'Yellow-Red Cards',
      };
      let stats = [];
      if (statsResp?.ok) {
        try {
          const stRaw = await statsResp.json();
          const stArr = stRaw.Stat || [];
          const homeSt = stArr.find(s => s.Tnb === 1) || {};
          const awaySt = stArr.find(s => s.Tnb === 2) || {};
          for (const [key, label] of Object.entries(STAT_MAP)) {
            if (homeSt[key] != null || awaySt[key] != null) {
              const hVal = homeSt[key] ?? 0;
              const aVal = awaySt[key] ?? 0;
              // Skip if both are 0
              if (hVal === 0 && aVal === 0) continue;
              // Possession is a percentage
              const displayH = key === 'Pss' ? `${hVal}%` : hVal;
              const displayA = key === 'Pss' ? `${aVal}%` : aVal;
              stats.push({ type: label, home: displayH, away: displayA });
            }
          }
          console.log(`[livescore-detail] Stats: ${stats.length} items`);
        } catch (e) {
          console.log(`[livescore-detail] Stats parse error:`, e.message);
        }
      }

      // ── Parse lineups ──
      // Lu: [{Tnb:1, Ps:[...]}, {Tnb:2, Ps:[...]}]
      // Pos: 1=GK, 2=DEF, 3=MID, 4=FWD, 5=SUB — Pon: "GOALKEEPER", "DEFENDER", etc.
      let homeLineup = [];
      let awayLineup = [];
      let homeFormation = null;
      let awayFormation = null;
      let homeSubs = [];
      let awaySubs = [];

      if (lineupsResp?.ok) {
        try {
          const luRaw = await lineupsResp.json();
          const luArr = luRaw.Lu || [];
          for (const team of luArr) {
            const side = team.Tnb === 1 ? 'home' : 'away';
            const players = (team.Ps || []);
            const starters = players.filter(p => p.Pos !== 5 && p.Pon !== 'SUBSTITUTE_PLAYER');
            const subs = players.filter(p => p.Pos === 5 || p.Pon === 'SUBSTITUTE_PLAYER');

            const parsedStarters = starters.map(p => ({
              name: p.Pn || `${p.Fn || ''} ${p.Ln || ''}`.trim() || "",
              number: p.Snu ?? null,
              position: p.Pon || "",
              grid: p.Fp || null,
              captain: !!p.Cpt,
              substituted: p.Mo != null, // Mo = minute subbed out
              yellow: false,
              red: false,
            }));
            const parsedSubs = subs.map(p => ({
              name: p.Pn || `${p.Fn || ''} ${p.Ln || ''}`.trim() || "",
              number: p.Snu ?? null,
              position: p.Pon || "",
            }));

            // Derive formation from grid positions (Fp: "row:col")
            let formation = null;
            const grids = starters.filter(p => p.Fp).map(p => p.Fp);
            if (grids.length > 0) {
              const rows = {};
              for (const g of grids) {
                const [r] = g.split(':');
                rows[r] = (rows[r] || 0) + 1;
              }
              // Remove GK row (row 1) and build formation string
              const rowNums = Object.keys(rows).map(Number).sort((a, b) => a - b);
              const outfield = rowNums.filter(r => r > 1).map(r => rows[String(r)]);
              if (outfield.length > 0) formation = outfield.join('-');
            }

            if (side === 'home') {
              homeLineup = parsedStarters;
              homeSubs = parsedSubs;
              homeFormation = formation;
            } else {
              awayLineup = parsedStarters;
              awaySubs = parsedSubs;
              awayFormation = formation;
            }
          }
          console.log(`[livescore-detail] Lineups: home=${homeLineup.length} away=${awayLineup.length} (${homeFormation} vs ${awayFormation})`);
        } catch (e) {
          console.log(`[livescore-detail] Lineups parse error:`, e.message);
        }
      }

      console.log(`[livescore-detail] ${matchId}: ${events.length} events, ${stats.length} stats, lineups home=${homeLineup.length} away=${awayLineup.length}`);

      const result = {
        matchId,
        home_team: homeName,
        away_team: awayName,
        home_badge: homeImg,
        away_badge: awayImg,
        score_home: isNaN(scoreHome) ? null : scoreHome,
        score_away: isNaN(scoreAway) ? null : scoreAway,
        ht_score_home: isNaN(htScoreHome) ? null : htScoreHome,
        ht_score_away: isNaN(htScoreAway) ? null : htScoreAway,
        status,
        match_time: matchTime,
        match_date: matchDate,
        competition,
        country,
        country_code: countryCode,
        venue,
        referee,
        events,
        stats,
        lineups: {
          home: {
            formation: homeFormation,
            players: homeLineup,
            subs: homeSubs,
          },
          away: {
            formation: awayFormation,
            players: awayLineup,
            subs: awaySubs,
          },
          available: (homeLineup.length + awayLineup.length) > 0,
        },
      };

      const isFinishedStatus = ["FT", "AET", "AP", "PEN"].includes(status.toUpperCase());
      // Only cache long if we actually have data; otherwise short TTL to retry
      const hasData = events.length > 0 || stats.length > 0 || result.lineups.available;
      const ttl = isFinishedStatus && hasData ? 60 : 5;
      try {
        await pool.query(
          `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
           VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ${ttl} MINUTE))
           ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ${ttl} MINUTE)`,
          [cacheKey, JSON.stringify(result)]
        );
      } catch { /* table may not exist */ }

      console.log(`[livescore-detail] ${matchId}: ${events.length} events, ${stats.length} stats, lineups=${result.lineups.available}`);
      return res.json(result);
    } catch (err) {
      console.error("[livescore-detail] ERROR:", err.message);
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

    // TTL per endpoint type (minutes)
    const TSDB_TTL = {
      searchteams: 1440,       // 24h — team names don't change
      lookupteam: 1440,
      lookuphonours: 129600,   // 90 days — trophies are historical
      lookupmilestones: 129600,
      eventslast: 180,         // 3h — recent results
      eventsnext: 180,         // 3h — upcoming fixtures
      eventspastleague: 720,   // 12h — past season data
      eventsseason: 720,
      searchevents: 60,        // 1h — live-ish data
      lookupplayer: 10080,     // 7 days — player profile
      searchplayers: 10080,
    };
    const baseEndpoint = endpoint.split('?')[0].replace(/\.php$/, '');
    const ttlMinutes = TSDB_TTL[baseEndpoint] ?? 360; // default 6h

    const sortedParams = Object.entries(params || {}).sort(([a], [b]) => a.localeCompare(b));
    const cacheKey = `tsdb:${endpoint}:${sortedParams.map(([k, v]) => `${k}=${v}`).join(':')}`;

    // Check cache
    try {
      const [cached] = await pool.query(
        'SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1',
        [cacheKey]
      );
      if (cached.length > 0) {
        const json = cached[0].response_json;
        res.set('Cache-Control', `public, max-age=${ttlMinutes * 60}`);
        return res.json(typeof json === 'string' ? JSON.parse(json) : json);
      }
    } catch { /* graceful */ }

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
        // Persist to cache
        pool.query(
          `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
           VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? MINUTE))
           ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL ? MINUTE)`,
          [cacheKey, JSON.stringify(data), ttlMinutes, ttlMinutes]
        ).catch(() => {});
        res.set('Cache-Control', `public, max-age=${ttlMinutes * 60}`);
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

  // ── Discover players (Premium) — search Transfermarkt by filters ──
  if (name === "discover-players") {
    // Check premium
    const [subRows] = await pool.query("SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
    if (!subRows[0]?.is_premium) {
      return res.status(403).json({ error: "Fonctionnalité réservée aux abonnés Premium." });
    }

    const { query, clubQuery, competition, position, ageMin, ageMax, valueMin, valueMax, nationality, page } = req.body || {};
    if (!query && !clubQuery && !competition) {
      return res.status(400).json({ error: "Saisissez un nom de joueur ou un club." });
    }

    try {
      const opts = { headers: TM_HEADERS, signal: AbortSignal.timeout(15000) };
      let results = [];
      let clubName = '';

      // ── Club squad search mode ──
      if (clubQuery) {
        // Step 1: search for club on TM
        const searchUrl = `https://www.transfermarkt.fr/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(clubQuery)}`;
        const searchResp = await fetch(searchUrl, opts);
        if (!searchResp.ok) throw new Error(`TM club search returned ${searchResp.status}`);
        const searchHtml = await searchResp.text();

        // Find club in the clubs results table. TM anchors put `title` before
        // `href`, so we match the anchor block first and pull each attribute
        // separately. The previous order-sensitive regex never matched and the
        // fallback could pick up an unrelated verein link from elsewhere on
        // the page.
        let clubSlug, clubId;
        const clubAnchorMatch = searchHtml.match(/<td[^>]*class="[^"]*hauptlink[^"]*"[^>]*>\s*<a\b([^>]+)>([^<]*)<\/a>/);
        if (clubAnchorMatch) {
          const attrs = clubAnchorMatch[1];
          const hrefM = attrs.match(/href="\/([\w-]+)\/startseite\/verein\/(\d+)"/);
          const titleM = attrs.match(/title="([^"]*)"/);
          if (hrefM) {
            clubSlug = hrefM[1];
            clubId = hrefM[2];
            clubName = (titleM ? titleM[1] : clubAnchorMatch[2]).replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').trim();
          }
        }
        if (!clubId) return res.json({ players: [], clubName: '' });

        // Step 2: fetch squad page
        await new Promise(r => setTimeout(r, 400));
        const squadUrl = `https://www.transfermarkt.fr/${clubSlug}/kader/verein/${clubId}`;
        const squadResp = await fetch(squadUrl, opts);
        if (!squadResp.ok) throw new Error(`TM squad page returned ${squadResp.status}`);
        const squadHtml = await squadResp.text();

        // Find items table with nested table handling
        const tableStart = squadHtml.indexOf('<table class="items">');
        let tableEnd = -1;
        if (tableStart !== -1) {
          let d = 0;
          for (let k = tableStart; k < squadHtml.length; k++) {
            if (squadHtml.slice(k, k + 6) === '<table') d++;
            if (squadHtml.slice(k, k + 8) === '</table>') { d--; if (d === 0) { tableEnd = k + 8; break; } }
          }
        }

        if (tableStart !== -1 && tableEnd !== -1) {
          const table = squadHtml.slice(tableStart, tableEnd);
          const rowStarts = [];
          const rowPattern = /<tr class="(?:odd|even)">/g;
          let rm;
          while ((rm = rowPattern.exec(table)) !== null) rowStarts.push(rm.index);

          for (let ri = 0; ri < rowStarts.length; ri++) {
            const start = rowStarts[ri];
            const end = ri + 1 < rowStarts.length ? rowStarts[ri + 1] : table.length;
            const row = table.slice(start, end);

            // Name: <td class="hauptlink"><a href="/slug/profil/spieler/ID">Name</a>
            const nameMatch = row.match(/<td class="hauptlink">\s*<a[^>]*href="([^"]*\/profil\/spieler\/\d+)"[^>]*>\s*([^<]+)/);
            if (!nameMatch) continue;
            const tmPath = nameMatch[1].trim();
            const name = nameMatch[2].trim().replace(/&#0?39;/g, "'").replace(/&amp;/g, '&');
            // Photo
            const photoMatch = row.match(/img[^>]*src="(https:\/\/img[^"]*portrait[^"]*)"/);
            const photo = photoMatch ? photoMatch[1].replace('/small/', '/big/').replace('/medium/', '/big/') : null;
            // Position: zentriert td with plain text
            const tdZ = row.match(/<td class="zentriert">([^<]{1,30})<\/td>/g) || [];
            let posText = '', ageVal = null;
            for (const td of tdZ) {
              const v = td.replace(/<[^>]*>/g, '').trim();
              if (/^\d{1,2}$/.test(v)) ageVal = parseInt(v);
              else if (v && !posText && !/^\d+$/.test(v) && !/\d{4}/.test(v)) posText = v;
            }
            // Nationality
            const natFlags = [];
            const flagRegex = /title="([^"]*)"[^>]*class="flaggenrahmen"/g;
            let fm;
            while ((fm = flagRegex.exec(row)) !== null) natFlags.push(fm[1]);
            // Market value
            const valMatch = row.match(/<td[^>]*class="rechts hauptlink"[^>]*>([\s\S]*?)<\/td>/);
            const marketValue = valMatch ? valMatch[1].replace(/<[^>]*>/g, '').trim() : '';

            // Apply filters
            if (ageMin && ageVal && ageVal < parseInt(ageMin)) continue;
            if (ageMax && ageVal && ageVal > parseInt(ageMax)) continue;
            if (position && position !== '_all' && posText && !posText.toLowerCase().includes(position.toLowerCase())) continue;
            if (nationality && natFlags.length > 0 && !natFlags.some(f => f.toLowerCase().includes(nationality.toLowerCase()))) continue;

            results.push({
              name,
              tmPath,
              tmId: tmPath.match(/\/spieler\/(\d+)/)?.[1] || null,
              photo,
              position: posText,
              age: ageVal,
              nationality: natFlags.join(', '),
              club: clubName,
              clubLogo: '',
              marketValue,
            });
          }
        }
      }

      // ── Helper: parse player rows from TM search HTML ──
      function parseTmSearchHtml(html) {
        const parsed = [];
        const tableStart = html.indexOf('<table class="items">');
        let tableEnd = -1;
        if (tableStart !== -1) {
          let d = 0;
          for (let k = tableStart; k < html.length; k++) {
            if (html.slice(k, k + 6) === '<table') d++;
            if (html.slice(k, k + 8) === '</table>') { d--; if (d === 0) { tableEnd = k + 8; break; } }
          }
        }
        if (tableStart === -1 || tableEnd === -1) return parsed;
        const table = html.slice(tableStart, tableEnd);

        const rowStarts = [];
        const rowPattern = /<tr class="(?:odd|even)">/g;
        let rm;
        while ((rm = rowPattern.exec(table)) !== null) rowStarts.push(rm.index);

        for (let ri = 0; ri < rowStarts.length; ri++) {
          const start = rowStarts[ri];
          const end = ri + 1 < rowStarts.length ? rowStarts[ri + 1] : table.length;
          const row = table.slice(start, end);

          const photoMatch = row.match(/img[^>]*src="(https:\/\/img[^"]*portrait[^"]*)"/);
          const photo = photoMatch ? photoMatch[1].replace('/small/', '/big/') : null;
          const nameMatch = row.match(/class="hauptlink"[^>]*>\s*<a[^>]*title="([^"]*)"[^>]*href="([^"]*)"/);
          if (!nameMatch) continue;
          const pName = nameMatch[1].replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
          const tmPath = nameMatch[2];
          const tdZentriert = row.match(/<td class="zentriert">([^<]{1,30})<\/td>/g) || [];
          let posText = '', ageVal = null;
          for (const td of tdZentriert) {
            const val = td.replace(/<[^>]*>/g, '').trim();
            if (/^\d{1,2}$/.test(val)) ageVal = parseInt(val);
            else if (val && !posText && !/^\d+$/.test(val)) posText = val;
          }
          const natFlags = [];
          const flagRegex = /title="([^"]*)"[^>]*class="flaggenrahmen"/g;
          let fm;
          while ((fm = flagRegex.exec(row)) !== null) natFlags.push(fm[1]);
          const clubCellMatch = row.match(/<a[^>]*title="([^"]*)"[^>]*>[^<]*<img[^>]*class="tiny_wappen"/);
          const club = clubCellMatch ? clubCellMatch[1] : '';
          const clubLogoMatch = row.match(/<img[^>]*class="tiny_wappen"[^>]*src="([^"]*)"/);
          const clubLogo = clubLogoMatch ? clubLogoMatch[1] : '';
          const valueMatch = row.match(/<td[^>]*class="rechts hauptlink"[^>]*>([\s\S]*?)<\/td>/);
          const marketValue = valueMatch ? valueMatch[1].replace(/<[^>]*>/g, '').trim() : '';

          parsed.push({
            name: pName, tmPath,
            tmId: tmPath.match(/\/spieler\/(\d+)/)?.[1] || null,
            photo, position: posText, age: ageVal,
            nationality: natFlags.join(', '), club, clubLogo, marketValue,
          });
        }
        return parsed;
      }

      // ── Helper: fetch one TM search query and return parsed players ──
      async function fetchTmSearch(q, pg = 1) {
        try {
          const searchUrl = `https://www.transfermarkt.fr/schnellsuche/ergebnis/schnellsuche?query=${encodeURIComponent(q)}&Spieler_page=${pg}`;
          const resp = await fetch(searchUrl, opts);
          if (!resp.ok) return [];
          return parseTmSearchHtml(await resp.text());
        } catch { return []; }
      }

      // ── Helper: deduplicate by tmId, keep first occurrence ──
      function dedupeResults(arr) {
        const seen = new Set();
        return arr.filter(r => {
          const key = r.tmId || r.tmPath;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      }

      // ── Helper: apply user filters to results ──
      function applyFilters(arr) {
        return arr.filter(r => {
          if (ageMin && r.age && r.age < parseInt(ageMin)) return false;
          if (ageMax && r.age && r.age > parseInt(ageMax)) return false;
          if (position && position !== '_all' && r.position) {
            if (!r.position.toLowerCase().includes(position.toLowerCase())) return false;
          }
          if (nationality && r.nationality) {
            if (!r.nationality.toLowerCase().includes(nationality.toLowerCase())) return false;
          }
          return true;
        });
      }

      if (query) {
        // 1) Primary search with exact query
        const primary = await fetchTmSearch(query, page || 1);
        results.push(...primary);
        results = dedupeResults(results);

        // 2) If < 3 results, try broadened searches
        const MIN_RESULTS = 3;
        if (results.length < MIN_RESULTS) {
          const extraQueries = [];
          const normalizedQuery = query.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
          // Try without accents if different from original
          if (normalizedQuery !== query) extraQueries.push(normalizedQuery);
          // Try individual words (for multi-word queries like "Luis Diaz")
          const words = query.trim().split(/\s+/).filter(w => w.length >= 2);
          if (words.length >= 2) {
            for (const word of words) extraQueries.push(word);
          }
          // Try with common suffix removed (e.g., "Jr", "Jr.", "III")
          const cleanedQuery = query.replace(/\s+(Jr\.?|Sr\.?|III?|IV|V)$/i, '').trim();
          if (cleanedQuery !== query && cleanedQuery.length >= 2) extraQueries.push(cleanedQuery);

          // Run extra searches with small delays to avoid rate-limiting
          for (const eq of extraQueries) {
            if (results.length >= MIN_RESULTS) break;
            await new Promise(r => setTimeout(r, 300));
            const extra = await fetchTmSearch(eq);
            results.push(...extra);
            results = dedupeResults(results);
          }

          // 3) If still < 3, try page 2 of original query
          if (results.length < MIN_RESULTS && (!page || page === 1)) {
            await new Promise(r => setTimeout(r, 300));
            const page2 = await fetchTmSearch(query, 2);
            results.push(...page2);
            results = dedupeResults(results);
          }
        }

        // Apply filters after all searches
        results = applyFilters(results);
      }

      // Value filter
      if (valueMin || valueMax) {
        const parseValue = (v) => {
          if (!v) return 0;
          const num = parseFloat(v.replace(/[^0-9,]/g, '').replace(',', '.'));
          if (isNaN(num)) return 0;
          if (/mio/i.test(v) || /m\b/i.test(v)) return num * 1000000;
          if (/mille|k\b/i.test(v)) return num * 1000;
          return num;
        };
        const minVal = valueMin ? parseFloat(valueMin) * 1000000 : 0;
        const maxVal = valueMax ? parseFloat(valueMax) * 1000000 : Infinity;
        results = results.filter(r => {
          const val = parseValue(r.marketValue);
          return val >= minVal && val <= maxVal;
        });
      }

      return res.json({ players: results.slice(0, 50), clubName });
    } catch (err) {
      console.error("[discover-players] Error:", err);
      return res.status(500).json({ error: "Erreur lors de la recherche. Réessayez." });
    }
  }

  if (name === "create-checkout") {
    if (!stripe) return res.status(501).json({ error: "Stripe non configuré sur ce serveur." });

    const { plan, billing } = req.body || {};
    const validPlans = ["scout", "pro"];
    const validBilling = ["monthly", "annual"];
    if (!validPlans.includes(plan) || !validBilling.includes(billing)) {
      return res.status(400).json({ error: `Plan ou cycle de facturation invalide (${plan}/${billing}).` });
    }

    // Price config (amounts in cents EUR)
    const priceConfig = {
      scout_monthly: { amount: 1900, interval: "month", name: "Scout+" },
      scout_annual: { amount: 18800, interval: "year", name: "Scout+" },
      pro_monthly: { amount: 2400, interval: "month", name: "Scout Pro" },
      pro_annual: { amount: 28800, interval: "year", name: "Scout Pro" },
    };
    const config = priceConfig[`${plan}_${billing}`];

    try {
      // Find or create Stripe customer
      const [subRows] = await pool.query("SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
      let customerId = subRows[0]?.stripe_customer_id;

      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          metadata: { user_id: req.user.id },
        });
        customerId = customer.id;

        // Upsert customer ID
        const [existing] = await pool.query("SELECT id FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
        if (existing.length > 0) {
          await pool.query("UPDATE user_subscriptions SET stripe_customer_id = ?, updated_at = NOW() WHERE user_id = ?", [customerId, req.user.id]);
        } else {
          await pool.query(
            "INSERT INTO user_subscriptions (id, user_id, stripe_customer_id) VALUES (?, ?, ?)",
            [uuidv4(), req.user.id, customerId]
          );
        }
      }

      const origin = req.headers.origin || req.headers.referer?.replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{
          price_data: {
            currency: "eur",
            product_data: { name: config.name },
            unit_amount: config.amount,
            recurring: { interval: config.interval },
          },
          quantity: 1,
        }],
        success_url: `${origin}/premium-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${origin}/pricing?canceled=true`,
        metadata: {
          user_id: req.user.id,
          plan_type: plan,
          billing_cycle: billing,
        },
      });

      return res.json({ url: session.url });
    } catch (err) {
      console.error("[create-checkout] Error:", err);
      return res.status(500).json({ error: err?.message || "Erreur Stripe." });
    }
  }

  if (name === "customer-portal") {
    if (!stripe) return res.status(501).json({ error: "Stripe non configuré sur ce serveur." });

    try {
      const [subRows] = await pool.query("SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
      const customerId = subRows[0]?.stripe_customer_id;
      if (!customerId) return res.status(400).json({ error: "Aucun abonnement Stripe trouvé." });

      const origin = req.headers.origin || req.headers.referer?.replace(/\/+$/, "") || `${req.protocol}://${req.get("host")}`;
      const portalSession = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/account`,
      });

      return res.json({ url: portalSession.url });
    } catch (err) {
      console.error("[customer-portal] Error:", err);
      return res.status(500).json({ error: err?.message || "Erreur Stripe." });
    }
  }

  if (name === "payment-method") {
    if (!stripe) return res.status(501).json({ error: "Stripe non configuré sur ce serveur." });

    try {
      const [subRows] = await pool.query("SELECT stripe_customer_id FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
      const customerId = subRows[0]?.stripe_customer_id;
      if (!customerId) return res.json({ payment_method: null });

      const methods = await stripe.customers.listPaymentMethods(customerId, { type: "card", limit: 1 });
      const pm = methods.data[0];
      if (!pm) return res.json({ payment_method: null });

      return res.json({
        payment_method: {
          brand: pm.card.brand,
          last4: pm.card.last4,
          exp_month: pm.card.exp_month,
          exp_year: pm.card.exp_year,
        },
      });
    } catch (err) {
      console.error("[payment-method] Error:", err);
      return res.status(500).json({ error: err?.message || "Erreur Stripe." });
    }
  }

  // ── SofaScore: fetch league info (teams, season) ──
  if (name === "sofascore-league") {
    const { tournamentId, seasonYear, championshipName } = req.body || {};
    if (!tournamentId) return res.status(400).json({ error: "Missing tournamentId" });
    // seasonYear = e.g. 2023 → fetches the 2023-24 season; null/undefined = current season

    // Sofascore tournament ID → ESPN league slug
    const SOFA_TO_ESPN = {
      34: 'fra.1', 182: 'fra.2',
      17: 'eng.1', 18: 'eng.2', 49: 'eng.3',
      8: 'esp.1', 547: 'esp.2',
      23: 'ita.1', 53: 'ita.2',
      35: 'ger.1', 44: 'ger.2',
      238: 'por.1', 370: 'por.2',
      37: 'ned.1', 131: 'ned.2',
      38: 'bel.1', 391: 'bel.2',
      52: 'tur.1',
      215: 'sui.1',
      271: 'den.1',
      40: 'swe.1',
      200: 'nor.1',
      45: 'aut.1',
      36: 'sco.1',
      202: 'pol.1',
      170: 'rou.1',
      185: 'gre.1',
      218: 'ukr.1',
      242: 'usa.1',
      11621: 'mex.1',
      155: 'arg.1',
      955: 'ksa.1',
      180: 'kor.1',
      196: 'jpn.1',
      7: 'UEFA.CHAMPIONS',
      679: 'UEFA.EUROPA',
      17015: 'UEFA.CONFERENCE',
      16: 'FIFA.WORLD',
      1: 'UEFA.EURO',
      133: 'CONMEBOL.AMERICA',
    };

    // Infer promotion/relegation zone from position
    function getZone(slug, pos, total) {
      const r = (a, b) => pos >= a && pos <= b;
      if (slug === 'fra.1') {
        if (r(1,3)) return 'champions_league';
        if (pos === 4) return 'europa_league';
        if (pos === 5) return 'conference_league';
        if (pos >= total - 2) return 'relegation';
      } else if (slug === 'fra.2') {
        if (r(1,2)) return 'promotion';
        if (pos === 3) return 'promotion_playoff';
        if (pos >= total - 2) return 'relegation';
      } else if (slug === 'eng.1' || slug === 'esp.1' || slug === 'ita.1') {
        if (r(1,4)) return 'champions_league';
        if (pos === 5) return 'europa_league';
        if (pos === 6) return 'conference_league';
        if (pos >= total - 2) return 'relegation';
      } else if (slug === 'ger.1') {
        if (r(1,4)) return 'champions_league';
        if (pos === 5) return 'europa_league';
        if (pos === 6) return 'conference_league';
        if (pos === total - 2) return 'relegation_playoff';
        if (pos >= total - 1) return 'relegation';
      } else if (slug === 'por.1') {
        if (r(1,2)) return 'champions_league';
        if (pos === 3) return 'europa_league';
        if (pos === 4) return 'conference_league';
        if (pos >= total - 2) return 'relegation';
      } else if (slug === 'ned.1') {
        if (pos === 1) return 'champions_league';
        if (pos === 2) return 'europa_league';
        if (pos === 3) return 'conference_league';
        if (pos >= total - 1) return 'relegation';
      } else {
        // Generic fallback: top 1 = winner, bottom 3 = relegation
        if (pos === 1) return 'champions_league';
        if (pos >= total - 2) return 'relegation';
      }
      return null;
    }

    const espnSlug = SOFA_TO_ESPN[Number(tournamentId)];
    const now = new Date();
    const currentSeasonYear = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
    const safeSeasonYear = seasonYear ? parseInt(seasonYear) : null;
    const effectiveSeasonYear = safeSeasonYear ?? currentSeasonYear;
    const isHistorical = effectiveSeasonYear < currentSeasonYear;
    const forceRefresh = !!(req.body?.refresh);

    // ── Helper: fetch manual data (always available) ──────────────────────
    async function getManualData(name, year) {
      if (!name) return null;
      try {
        const [rows] = await pool.query(
          'SELECT standings_json, season_display_name, updated_at FROM championship_manual_data WHERE championship_name = ? AND season_year = ?',
          [name, year]
        );
        if (!rows.length) return null;
        const data = typeof rows[0].standings_json === 'string' ? JSON.parse(rows[0].standings_json) : rows[0].standings_json;
        return { ...data, source: 'manual', from_cache: true, manual_updated_at: rows[0].updated_at };
      } catch { return null; }
    }

    // ── 0. Manual data always wins (admin/mod entries override API) ───────
    if (!forceRefresh) {
      const manual = await getManualData(championshipName, effectiveSeasonYear);
      if (manual) return res.json(manual);
    }

    // ── 1. Check championship_standings ESPN cache ────────────────────────
    if (!forceRefresh) {
      try {
        const [rows] = await pool.query(
          'SELECT standings_json, fetched_at FROM championship_standings WHERE tournament_id = ? AND season_year = ?',
          [Number(tournamentId), effectiveSeasonYear]
        );
        if (rows.length > 0) {
          const row = rows[0];
          const fetchedAt = new Date(row.fetched_at);
          const ageHours = (Date.now() - fetchedAt.getTime()) / 3_600_000;
          if (isHistorical || ageHours < 24) {
            const data = typeof row.standings_json === 'string' ? JSON.parse(row.standings_json) : row.standings_json;
            return res.json({ ...data, fetched_at: row.fetched_at, from_cache: true });
          }
        }
      } catch (e) { console.warn('[standings-cache] read error:', e?.message); }
    }

    if (!espnSlug) {
      return res.json({ teams: [], season: null, source: 'none' });
    }

    // ── 2. Fetch from ESPN ────────────────────────────────────────────────
    try {
      const espnResp = await fetch(
        `https://site.api.espn.com/apis/v2/sports/soccer/${espnSlug}/standings?season=${effectiveSeasonYear}`,
        { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(10000) }
      );
      if (!espnResp.ok) {
        // Serve stale cache rather than an error if ESPN is down
        const [stale] = await pool.query(
          'SELECT standings_json, fetched_at FROM championship_standings WHERE tournament_id = ? AND season_year = ?',
          [Number(tournamentId), effectiveSeasonYear]
        );
        if (stale.length > 0) {
          const data = typeof stale[0].standings_json === 'string' ? JSON.parse(stale[0].standings_json) : stale[0].standings_json;
          return res.json({ ...data, fetched_at: stale[0].fetched_at, from_cache: true, stale: true });
        }
        return res.status(espnResp.status).json({ error: `ESPN returned ${espnResp.status}` });
      }

      const espnData = await espnResp.json();
      // Log top-level keys to help diagnose response format
      console.log(`[espn] ${espnSlug} top-level keys:`, Object.keys(espnData));
      if (espnData?.children) console.log(`[espn] children[0] keys:`, Object.keys(espnData.children[0] ?? {}));
      // Try all known ESPN response shapes
      let standingsObj = espnData?.children?.[0]?.standings ?? espnData?.standings ?? null;
      if (Array.isArray(standingsObj)) standingsObj = standingsObj[0] ?? null;
      console.log(`[espn] standingsObj keys:`, standingsObj ? Object.keys(standingsObj) : 'null', '| entries:', standingsObj?.entries?.length ?? 0);
      const seasonName =
        standingsObj?.seasonDisplayName ??
        espnData?.season?.displayName ??
        String(espnData?.season?.year ?? '');
      const entries = standingsObj?.entries ?? [];

      const teams = entries.map(e => {
        const stat = n => { const s = e.stats?.find(x => x.name === n); return s ? Math.round(Number(s.value)) : null; };
        const pos = stat('rank') ?? 0;
        return {
          id: e.team?.id,
          name: e.team?.displayName,
          shortName: e.team?.shortDisplayName ?? e.team?.abbreviation,
          logoUrl: e.team?.logos?.[0]?.href ?? null,
          position: pos,
          points: stat('points') ?? 0,
          played: stat('gamesPlayed') ?? 0,
          wins: stat('wins') ?? 0,
          draws: stat('ties') ?? 0,
          losses: stat('losses') ?? 0,
          goalsFor: stat('pointsFor') ?? 0,
          goalsAgainst: stat('pointsAgainst') ?? 0,
          goalDifference: stat('pointDifferential') ?? 0,
          description: e.note?.description ?? getZone(espnSlug, pos, entries.length),
          noteColor: e.note?.color ?? null,
        };
      });


      const fetchedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      const result = {
        tournamentId: Number(tournamentId),
        seasonYear: effectiveSeasonYear,
        season: { name: seasonName },
        teams,
        source: 'espn',
        fetched_at: fetchedAt,
        from_cache: false,
      };

      // ── 3. Persist to championship_standings ──────────────────────────
      try {
        await pool.query(
          `INSERT INTO championship_standings (tournament_id, season_year, espn_slug, season_name, standings_json, source, fetched_at)
           VALUES (?, ?, ?, ?, ?, 'espn', NOW())
           ON DUPLICATE KEY UPDATE
             standings_json = VALUES(standings_json),
             season_name    = VALUES(season_name),
             fetched_at     = NOW()`,
          [Number(tournamentId), effectiveSeasonYear, espnSlug, seasonName, JSON.stringify(result)]
        );
      } catch (e) { console.warn('[standings-cache] write error:', e?.message); }

      return res.json(result);
    } catch (err) {
      console.error('[espn-standings] Error:', err?.message);
      // Serve stale cache on network error
      try {
        const [stale] = await pool.query(
          'SELECT standings_json, fetched_at FROM championship_standings WHERE tournament_id = ? AND season_year = ?',
          [Number(tournamentId), effectiveSeasonYear]
        );
        if (stale.length > 0) {
          const data = typeof stale[0].standings_json === 'string' ? JSON.parse(stale[0].standings_json) : stale[0].standings_json;
          return res.json({ ...data, fetched_at: stale[0].fetched_at, from_cache: true, stale: true });
        }
      } catch {}
      return res.status(502).json({ error: 'ESPN fetch failed', detail: err?.message });
    }
  }

  return res.status(404).json({ error: `Unknown function: ${name}` });
});

app.post("/api/storage/:bucket/upload", authMiddleware, upload.single("file"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: "No file uploaded" });
  }

  // ── File size limits ─────────────────────────────────────────────────────
  const isVideo = (req.file.mimetype || "").startsWith("video/");
  const isImage = (req.file.mimetype || "").startsWith("image/");
  const MAX_VIDEO_BYTES = 10 * 1024 * 1024; // 10 MB
  const MAX_PHOTO_BYTES = 4 * 1024 * 1024;  // 4 MB

  if (isVideo && req.file.size > MAX_VIDEO_BYTES) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(413).json({ error: "video_too_large", message: "La vidéo ne doit pas dépasser 10 Mo." });
  }
  if (isImage && req.file.size > MAX_PHOTO_BYTES) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(413).json({ error: "photo_too_large", message: "La photo ne doit pas dépasser 4 Mo." });
  }

  const requestedName = String(req.body?.fileName || "").replace(/[^a-zA-Z0-9._-]/g, "");
  const imageId = requestedName || `${Date.now()}-${uuidv4()}`;

  try {
    // For images, store in DB; for other files, use saveUploadedFile as before
    const isImage = (req.file.mimetype || "").startsWith("image/");
    if (isImage) {
      const publicUrl = await saveImageToDb(req.file.path, imageId, req.file.mimetype);
      return res.json({ path: imageId, publicUrl });
    }
    const ext = path.extname(req.file.originalname || "") || ".bin";
    const finalName = requestedName || `${Date.now()}-${uuidv4()}${ext}`;
    const publicUrl = await saveUploadedFile(req.file.path, finalName, req.file.mimetype);
    return res.json({ path: finalName, publicUrl });
  } catch (err) {
    console.error("[storage/upload] Error:", err.message);
    try { if (req.file?.path) fs.unlinkSync(req.file.path); } catch {}
    return res.status(500).json({ error: "Erreur lors de l'upload" });
  }
});

// DB schema is managed via schema.sql — no runtime table creation.
async function ensureFixtureTables() { /* removed — use schema.sql */ }
async function _legacyEnsureFixtureTables() {
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
    // ── Tickets / bug reports ──
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        id CHAR(36) PRIMARY KEY,
        user_id CHAR(36) NOT NULL,
        category VARCHAR(50) NOT NULL DEFAULT 'bug',
        subject VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        page_url VARCHAR(500) NULL,
        user_agent VARCHAR(500) NULL,
        status ENUM('open','in_progress','closed') NOT NULL DEFAULT 'open',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tickets_user (user_id),
        INDEX idx_tickets_status (status, created_at),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ticket_messages (
        id CHAR(36) PRIMARY KEY,
        ticket_id CHAR(36) NOT NULL,
        sender_id CHAR(36) NOT NULL,
        is_admin TINYINT(1) NOT NULL DEFAULT 0,
        body TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_ticket_messages_ticket (ticket_id, created_at),
        FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE,
        FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log("[startup] Fixture + ticket tables ready");
  } catch (err) {
    console.error("[startup] Error creating tables:", err.message);
  }
}

// No runtime migrations — schema is managed via schema.sql

// Ensure scout_opinions table exists (runs at module load)
(async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS scout_opinions (
        id CHAR(36) PRIMARY KEY,
        player_id CHAR(36) NOT NULL,
        organization_id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        current_level DECIMAL(3,1) NOT NULL DEFAULT 5.0,
        potential DECIMAL(3,1) NOT NULL DEFAULT 5.0,
        opinion VARCHAR(20) NOT NULL DEFAULT 'À revoir',
        notes TEXT NULL,
        links JSON NULL,
        match_observed VARCHAR(255) NULL,
        observed_at DATE NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_scout_opinions_player (player_id),
        INDEX idx_scout_opinions_org (organization_id),
        INDEX idx_scout_opinions_user (user_id)
      )
    `);
    // Add columns if table existed before these changes
    try {
      const addIfMissing = async (col, def) => {
        const [c] = await pool.query(`SHOW COLUMNS FROM scout_opinions LIKE '${col}'`);
        if (c.length === 0) await pool.query(`ALTER TABLE scout_opinions ADD COLUMN ${def}`);
      };
      await addIfMissing('links', 'links JSON NULL AFTER notes');
      await addIfMissing('match_observed', 'match_observed VARCHAR(255) NULL AFTER links');
      await addIfMissing('observed_at', 'observed_at DATE NULL AFTER match_observed');
    } catch { /* ignore */ }
    console.log("[startup] scout_opinions table ready");
  } catch (err) {
    console.error("[startup] scout_opinions table error:", err?.message);
  }
})();

// ══════════════════════════════════════════════════════════════════════════════
// ── Club staff cache (coach from Sofascore + president from Wikidata) ─────────
// ══════════════════════════════════════════════════════════════════════════════

pool.query(`CREATE TABLE IF NOT EXISTS club_staff_cache (
  id CHAR(36) PRIMARY KEY,
  club_name VARCHAR(255) NOT NULL,
  sofascore_team_id INT NULL,
  sofascore_team_slug VARCHAR(255) NULL,
  coach_id INT NULL,
  coach_name VARCHAR(255) NULL,
  coach_slug VARCHAR(255) NULL,
  coach_photo_url TEXT NULL,
  coach_nationality VARCHAR(100) NULL,
  coach_date_born DATE NULL,
  coach_sofascore_url TEXT NULL,
  president_name VARCHAR(255) NULL,
  president_photo_url TEXT NULL,
  president_wikidata_id VARCHAR(50) NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_club_staff_name (club_name(191)),
  INDEX idx_club_staff_fetched (fetched_at)
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] club_staff_cache:', err?.message); });

async function fetchClubStaff(clubName) {
  const CACHE_TTL_DAYS = 7;
  const [cached] = await pool.query(
    `SELECT * FROM club_staff_cache WHERE club_name = ? AND fetched_at > DATE_SUB(NOW(), INTERVAL ? DAY)`,
    [clubName, CACHE_TTL_DAYS]
  );
  if (cached[0]) return cached[0];

  const result = {
    club_name: clubName,
    sofascore_team_id: null, sofascore_team_slug: null,
    coach_id: null, coach_name: null, coach_slug: null,
    coach_photo_url: null, coach_nationality: null, coach_date_born: null, coach_sofascore_url: null,
    president_name: null, president_photo_url: null, president_wikidata_id: null,
  };

  try {
    const searchData = await sofaFetch(`/search/all?q=${encodeURIComponent(clubName)}&page=0`);
    const teams = (searchData?.results ?? []).filter(r => r.type === 'team');
    const nameLower = clubName.toLowerCase();
    const best = teams.find(t => t.entity?.name?.toLowerCase() === nameLower)
      ?? teams.find(t => t.entity?.name?.toLowerCase().includes(nameLower.split(' ')[0]))
      ?? teams[0];

    if (best?.entity?.id) {
      result.sofascore_team_id = best.entity.id;
      result.sofascore_team_slug = best.entity.slug ?? null;
      const teamData = await sofaFetch(`/team/${best.entity.id}`);
      const manager = teamData?.team?.manager;
      if (manager?.id) {
        result.coach_id = manager.id;
        result.coach_name = manager.name ?? null;
        result.coach_slug = manager.slug ?? null;
        result.coach_sofascore_url = `https://www.sofascore.com/fr/football/manager/${manager.slug}/${manager.id}`;
        result.coach_nationality = manager.nationality?.name ?? manager.country?.name ?? null;
        result.coach_photo_url = `/api/club-staff/coach-photo/${manager.id}`;
        const mgrData = await sofaFetch(`/manager/${manager.id}`);
        if (mgrData?.manager?.dateOfBirthTimestamp) {
          result.coach_date_born = new Date(mgrData.manager.dateOfBirthTimestamp * 1000).toISOString().slice(0, 10);
        }
      }
    }
  } catch (e) { console.warn('[club-staff] Sofascore error:', e.message); }

  try {
    const wdSearch = await fetch(
      `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(clubName)}&language=fr&type=item&format=json&limit=10`,
      { signal: AbortSignal.timeout(8000) }
    );
    const wdSd = await wdSearch.json();
    const clubEnt = (wdSd?.search ?? []).find(e => /football|club|soccer|f\.c\./i.test(e.description ?? '')) ?? (wdSd?.search ?? [])[0];
    if (clubEnt?.id) {
      const wdEnt = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${clubEnt.id}&props=claims&format=json`, { signal: AbortSignal.timeout(8000) });
      const wdEd = await wdEnt.json();
      const claims = wdEd?.entities?.[clubEnt.id]?.claims ?? {};
      const chairQid = (claims.P488 ?? claims.P169 ?? [])[0]?.mainsnak?.datavalue?.value?.id;
      if (chairQid) {
        const wdPerson = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${chairQid}&props=labels|claims&languages=fr,en&format=json`, { signal: AbortSignal.timeout(8000) });
        const wdPd = await wdPerson.json();
        const pe = wdPd?.entities?.[chairQid];
        const name = pe?.labels?.fr?.value ?? pe?.labels?.en?.value ?? null;
        if (name) {
          result.president_name = name;
          result.president_wikidata_id = chairQid;
          const photoFile = pe?.claims?.P18?.[0]?.mainsnak?.datavalue?.value;
          if (photoFile) result.president_photo_url = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(photoFile)}?width=200`;
        }
      }
    }
  } catch (e) { console.warn('[club-staff] Wikidata error:', e.message); }

  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO club_staff_cache (id, club_name, sofascore_team_id, sofascore_team_slug,
         coach_id, coach_name, coach_slug, coach_photo_url, coach_nationality, coach_date_born, coach_sofascore_url,
         president_name, president_photo_url, president_wikidata_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         sofascore_team_id=VALUES(sofascore_team_id), sofascore_team_slug=VALUES(sofascore_team_slug),
         coach_id=VALUES(coach_id), coach_name=VALUES(coach_name), coach_slug=VALUES(coach_slug),
         coach_photo_url=VALUES(coach_photo_url), coach_nationality=VALUES(coach_nationality),
         coach_date_born=VALUES(coach_date_born), coach_sofascore_url=VALUES(coach_sofascore_url),
         president_name=VALUES(president_name), president_photo_url=VALUES(president_photo_url),
         president_wikidata_id=VALUES(president_wikidata_id), fetched_at=NOW()`,
      [id, clubName, result.sofascore_team_id, result.sofascore_team_slug,
       result.coach_id, result.coach_name, result.coach_slug, result.coach_photo_url,
       result.coach_nationality, result.coach_date_born, result.coach_sofascore_url,
       result.president_name, result.president_photo_url, result.president_wikidata_id]
    );
  } catch (e) { console.warn('[club-staff] DB error:', e.message); }

  return result;
}

app.get("/api/club-staff", authMiddleware, async (req, res) => {
  const { name } = req.query;
  if (!name?.trim()) return res.status(400).json({ error: "name requis" });
  try { return res.json(await fetchClubStaff(name.trim())); }
  catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post("/api/club-staff/refresh", authMiddleware, async (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: "name requis" });
  try {
    await pool.query("DELETE FROM club_staff_cache WHERE club_name = ?", [name.trim()]);
    return res.json(await fetchClubStaff(name.trim()));
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// Proxy Sofascore manager image (avoid hotlink block)
app.get("/api/club-staff/coach-photo/:managerId", async (req, res) => {
  try {
    const resp = await fetch(
      `https://api.sofascore.com/api/v1/manager/${req.params.managerId}/image`,
      { headers: { ...SOFA_HEADERS, Accept: 'image/*' }, signal: AbortSignal.timeout(8000) }
    );
    if (!resp.ok) return res.status(404).end();
    const buf = await resp.arrayBuffer();
    res.setHeader('Content-Type', resp.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400');
    return res.send(Buffer.from(buf));
  } catch { return res.status(404).end(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── Mes championnats — CRUD pour user_followed_leagues ────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// ── Saved championships (Sofascore/local catalog) ─────────────────────────────
pool.query(`CREATE TABLE IF NOT EXISTS user_saved_championships (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  championship_name VARCHAR(255) NOT NULL,
  championship_country VARCHAR(100) NULL,
  championship_logo TEXT NULL,
  sofascore_id INT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_champ (user_id, championship_name(191)),
  INDEX idx_saved_champs_user (user_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] user_saved_championships:', err?.message); });

app.get("/api/saved-championships", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT
         usc.*,
         (
           SELECT COUNT(DISTINCT p.id)
           FROM players p
           WHERE p.user_id = usc.user_id
             AND (
               EXISTS (SELECT 1 FROM championship_players cp
                       WHERE cp.player_id = p.id
                         AND cp.championship_name = usc.championship_name
                         AND cp.user_id = usc.user_id)
               OR LOWER(TRIM(COALESCE(p.league,''))) = LOWER(TRIM(usc.championship_name))
             )
         ) AS player_count,
         (
           SELECT COUNT(DISTINCT NULLIF(TRIM(p.club),''))
           FROM players p
           WHERE p.user_id = usc.user_id
             AND TRIM(COALESCE(p.club,'')) != ''
             AND (
               EXISTS (SELECT 1 FROM championship_players cp
                       WHERE cp.player_id = p.id
                         AND cp.championship_name = usc.championship_name
                         AND cp.user_id = usc.user_id)
               OR LOWER(TRIM(COALESCE(p.league,''))) = LOWER(TRIM(usc.championship_name))
             )
         ) AS club_count,
         (
           SELECT p.club
           FROM players p
           WHERE p.user_id = usc.user_id
             AND TRIM(COALESCE(p.club,'')) != ''
             AND (
               EXISTS (SELECT 1 FROM championship_players cp
                       WHERE cp.player_id = p.id
                         AND cp.championship_name = usc.championship_name
                         AND cp.user_id = usc.user_id)
               OR LOWER(TRIM(COALESCE(p.league,''))) = LOWER(TRIM(usc.championship_name))
             )
           GROUP BY p.club
           ORDER BY COUNT(*) DESC
           LIMIT 1
         ) AS top_club
       FROM user_saved_championships usc
       WHERE usc.user_id = ?
       ORDER BY usc.championship_name ASC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post("/api/saved-championships", authMiddleware, async (req, res) => {
  const { championship_name, championship_country, championship_logo, sofascore_id } = req.body || {};
  if (!championship_name?.trim()) return res.status(400).json({ error: "championship_name requis." });
  try {
    const id = uuidv4();
    await pool.query(
      `INSERT INTO user_saved_championships (id, user_id, championship_name, championship_country, championship_logo, sofascore_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE championship_country = VALUES(championship_country),
         championship_logo = VALUES(championship_logo), sofascore_id = VALUES(sofascore_id)`,
      [id, req.user.id, championship_name.trim(), championship_country || null, championship_logo || null, sofascore_id || null]
    );
    const [rows] = await pool.query("SELECT * FROM user_saved_championships WHERE user_id = ? AND championship_name = ?", [req.user.id, championship_name.trim()]);
    return res.status(201).json(rows[0]);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.delete("/api/saved-championships/:name", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM user_saved_championships WHERE user_id = ? AND championship_name = ?",
      [req.user.id, decodeURIComponent(req.params.name)]);
    return res.json({ success: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// GET /api/followed-leagues — list user's followed leagues with fixture count
app.get("/api/followed-leagues", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ufl.*,
        (SELECT COUNT(*) FROM fixtures f
         WHERE f.user_id = ufl.user_id AND f.api_league_id = ufl.league_id) AS fixture_count,
        (SELECT COUNT(*) FROM fixtures f
         WHERE f.user_id = ufl.user_id AND f.api_league_id = ufl.league_id
           AND f.match_date >= CURDATE()) AS upcoming_count
       FROM user_followed_leagues ufl
       WHERE ufl.user_id = ?
       ORDER BY ufl.league_name ASC`,
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/followed-leagues — follow a league
app.post("/api/followed-leagues", authMiddleware, async (req, res) => {
  const { league_id, league_name, league_country, league_logo, season } = req.body || {};
  if (!league_id || !league_name) return res.status(400).json({ error: "league_id et league_name requis." });
  try {
    const id = uuidv4();
    const s = season || String(new Date().getFullYear());
    await pool.query(
      `INSERT INTO user_followed_leagues (id, user_id, league_id, league_name, league_country, league_logo, season)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE league_name = VALUES(league_name), league_country = VALUES(league_country),
         league_logo = VALUES(league_logo), season = VALUES(season)`,
      [id, req.user.id, league_id, league_name, league_country || null, league_logo || null, s]
    );
    const [rows] = await pool.query("SELECT * FROM user_followed_leagues WHERE user_id = ? AND league_id = ?", [req.user.id, league_id]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// DELETE /api/followed-leagues/:leagueId — unfollow a league
app.delete("/api/followed-leagues/:leagueId", authMiddleware, async (req, res) => {
  try {
    await pool.query("DELETE FROM user_followed_leagues WHERE user_id = ? AND league_id = ?", [req.user.id, req.params.leagueId]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// ── News / Actualités — Sofascore scraping via Apify ─────────────────────────
// ══════════════════════════════════════════════════════════════════════════════

// Auto-create news_articles table. Run all DDL for this table serialized in
// an IIFE: parallel ALTERs on the same table can deadlock, and the
// news_translations FK must come AFTER the news_articles collation is fixed.
(async () => {
  try {
    await pool.query(`CREATE TABLE IF NOT EXISTS news_articles (
      id CHAR(36) PRIMARY KEY,
      external_id VARCHAR(255) NULL,
      title VARCHAR(1000) NOT NULL,
      description TEXT NULL,
      content TEXT NULL,
      image_url TEXT NULL,
      article_url TEXT NOT NULL,
      category VARCHAR(100) NULL,
      tags JSON NULL,
      author VARCHAR(255) NULL,
      published_at DATETIME NOT NULL,
      source VARCHAR(50) NOT NULL DEFAULT 'sofascore',
      scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uniq_news_url (article_url(191)),
      INDEX idx_news_published (published_at),
      INDEX idx_news_category (category),
      INDEX idx_news_source (source, published_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[warn] news_articles table:', err?.message);
  }

  // Repair: if the table was created previously without explicit collation it
  // sits in utf8mb4_0900_ai_ci, which makes the news_translations FK fail with
  // "Failed to open the referenced table". CONVERT TO is idempotent.
  try {
    const [rows] = await pool.query(
      "SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'news_articles'"
    );
    if (rows[0]?.TABLE_COLLATION && rows[0].TABLE_COLLATION !== 'utf8mb4_unicode_ci') {
      console.log('[migration] Converting news_articles collation:', rows[0].TABLE_COLLATION, '→ utf8mb4_unicode_ci');
      await pool.query("ALTER TABLE news_articles CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
    }
  } catch (err) {
    // TiDB refuses CONVERT TO on indexed columns with a different collation — harmless, skip silently.
    if (!err?.message?.includes('Unsupported converting collation')) {
      console.warn('[warn] news_articles collation check:', err?.message);
    }
  }

  // International press columns. Serialized to avoid DDL deadlocks.
  try { await pool.query("ALTER TABLE news_articles ADD COLUMN lang VARCHAR(8) NULL"); }
  catch (err) { if (err.errno !== 1060) console.warn('[warn] news_articles lang col:', err?.message); }
  try { await pool.query("ALTER TABLE news_articles ADD COLUMN country VARCHAR(2) NULL"); }
  catch (err) { if (err.errno !== 1060) console.warn('[warn] news_articles country col:', err?.message); }
  try { await pool.query("ALTER TABLE news_articles ADD INDEX idx_news_country (country, published_at)"); }
  catch (err) { if (err.errno !== 1061) console.warn('[warn] news_articles country idx:', err?.message); }

  // Backfill lang/country from the `source` slug for legacy rows that were
  // scraped before those columns existed (or any row that somehow ended up
  // with NULL). The country chips on the News page only appear for rows that
  // have country set — without this backfill, the filter looks broken even
  // though the SQL works fine.
  const SOURCE_COUNTRY_MAP = {
    lequipe: ['fr', 'FR'], rmc: ['fr', 'FR'], '20min': ['fr', 'FR'],
    gazzetta: ['it', 'IT'], 'corriere-sport': ['it', 'IT'], tuttosport: ['it', 'IT'], ansa: ['it', 'IT'],
    marca: ['es', 'ES'], as: ['es', 'ES'], 'mundo-dep': ['es', 'ES'], 'sport-es': ['es', 'ES'],
    'bbc-sport': ['en', 'GB'], guardian: ['en', 'GB'], 'sky-sports': ['en', 'GB'],
    bild: ['de', 'DE'], kicker: ['de', 'DE'], faz: ['de', 'DE'], spiegel: ['de', 'DE'],
    record: ['pt', 'PT'],
  };
  try {
    let totalBackfilled = 0;
    for (const [src, [lang, country]] of Object.entries(SOURCE_COUNTRY_MAP)) {
      const [r] = await pool.query(
        "UPDATE news_articles SET lang = COALESCE(lang, ?), country = COALESCE(country, ?) WHERE source = ? AND (lang IS NULL OR country IS NULL OR country = '')",
        [lang, country, src]
      );
      if (r.affectedRows > 0) totalBackfilled += r.affectedRows;
    }
    if (totalBackfilled > 0) {
      console.log(`[migration] news_articles: backfilled lang/country on ${totalBackfilled} legacy rows`);
    }
  } catch (err) {
    console.warn('[warn] news_articles lang/country backfill:', err?.message);
  }

  // Per-article translations cache: keyed by (article_id, target_lang). We
  // cache so a given (article, target) pair is never re-translated. FK requires
  // matching collation on the referenced col, which the CONVERT TO above
  // ensures.
  try {
    // No FK to news_articles — this codebase has multiple FKs that fail to
    // create on this DB (TiDB / collation incompatibilities); we follow the
    // same pattern and clean up orphans at the application level if needed.
    await pool.query(`CREATE TABLE IF NOT EXISTS news_translations (
      article_id CHAR(36) NOT NULL,
      target_lang VARCHAR(8) NOT NULL,
      title TEXT NOT NULL,
      description TEXT NULL,
      content LONGTEXT NULL,
      provider VARCHAR(20) NOT NULL DEFAULT 'google',
      translated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (article_id, target_lang),
      INDEX idx_news_tr_article (article_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
  } catch (err) {
    if (!err?.message?.includes('already exists')) console.warn('[warn] news_translations table:', err?.message);
  }

  // One-shot cleanup: rows scraped before the CDATA/entity-decoding fix have
  // titles that literally contain "<![CDATA[…]]>", "&lt;b&gt;…", "&quot;…",
  // and similar gibberish. The next scrape can't fix them (their article_url
  // has likely scrolled off the feed) so we just delete them — the scraper
  // will repopulate from current feeds. Idempotent: once cleaned, future
  // startups match 0 rows and the query is a no-op.
  try {
    const [result] = await pool.query(`
      DELETE FROM news_articles
      WHERE title LIKE '%<![CDATA[%'
         OR title LIKE '%&lt;%'
         OR title LIKE '%&quot;%'
         OR title LIKE '%&#39;%'
         OR title LIKE '%&hellip;%'
         OR title LIKE '%�%'
    `);
    if (result?.affectedRows > 0) {
      console.log(`[migration] news_articles: deleted ${result.affectedRows} legacy rows with un-decoded HTML/CDATA in title`);
    }
  } catch (err) {
    console.warn('[warn] news_articles cleanup:', err?.message);
  }
})();

// ── Sofascore scraping helpers ────────────────────────────────────────────────

const SOFASCORE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
  'Referer': 'https://www.sofascore.com/fr/news',
  'Origin': 'https://www.sofascore.com',
  'Cache-Control': 'no-cache',
};

function normalizeSofascoreArticle(raw) {
  // Handle multiple possible shapes returned by Sofascore API
  const title   = raw.title || raw.name || raw.headline || '';
  const desc    = raw.description || raw.subtitle || raw.summary || raw.teaser || '';
  const url     = raw.url || raw.link || raw.articleUrl || raw.slug
    ? (raw.slug ? `https://www.sofascore.com/fr/news/${raw.slug}` : null)
    : null;
  const image   = raw.imageUrl || raw.image?.url || raw.thumbnail || raw.image || null;
  const cat     = raw.category?.slug || raw.category?.name || raw.category || 'Football';
  const author  = raw.author?.name || raw.author || null;
  const pubDate = raw.publishedAt || raw.createdAt || raw.published_at || raw.date || new Date().toISOString();
  const extId   = String(raw.id || raw.externalId || raw.slug || '');
  const tags    = Array.isArray(raw.tags) ? raw.tags.map(t => typeof t === 'string' ? t : t.name || t.slug) : [];
  return { title, description: desc, article_url: url, image_url: image, category: cat, author, published_at: pubDate, external_id: extId, tags };
}

// ── Lightweight RSS parser (no external dependency) ──────────────────────────
// Why all the cleanup: real-world RSS is a mess. Different publishers do
// different combinations of CDATA wrapping, HTML-entity encoding (sometimes
// double-encoded — Record.pt literally puts `&lt;![CDATA[…]]&gt;` inside the
// title tag), and inline HTML markup (Marca wraps headlines in `<b>` etc.).
// We normalize all three so the UI only ever sees plain text.

function decodeRssEntities(s) {
  if (!s) return s;
  return String(s)
    .replace(/&#(\d+);/g,            (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g,  (_, h) => String.fromCharCode(parseInt(h, 16)))
    .replace(/&lt;/g,    '<')
    .replace(/&gt;/g,    '>')
    .replace(/&quot;/g,  '"')
    .replace(/&apos;/g,  "'")
    .replace(/&#39;/g,   "'")
    .replace(/&nbsp;/g,  ' ')
    .replace(/&laquo;/g, '«')
    .replace(/&raquo;/g, '»')
    .replace(/&ldquo;/g, '“')
    .replace(/&rdquo;/g, '”')
    .replace(/&lsquo;/g, '‘')
    .replace(/&rsquo;/g, '’')
    .replace(/&hellip;/g,'…')
    .replace(/&mdash;/g, '—')
    .replace(/&ndash;/g, '–')
    .replace(/&amp;/g,   '&');  // MUST be last, otherwise we'd un-escape pre-existing entities
}

function stripCdataWrappers(s) {
  if (!s) return s;
  let out = String(s).trim();
  // Some feeds wrap once, others wrap twice. Loop until stable.
  for (let i = 0; i < 3; i++) {
    const before = out;
    out = out.replace(/^\s*<!\[CDATA\[\s*/, '').replace(/\s*\]\]>\s*$/, '').trim();
    if (out === before) break;
  }
  return out;
}

function cleanRssText(s) {
  if (!s) return '';
  // Pass 1: strip the outer CDATA wrapper if any.
  let out = stripCdataWrappers(s);
  // Pass 2: decode HTML entities. Some feeds double-encode (the CDATA itself
  // is HTML-encoded) — we decode, then check for another CDATA wrapper to peel.
  out = decodeRssEntities(out);
  out = stripCdataWrappers(out);
  out = decodeRssEntities(out);
  // Pass 3: strip residual inline HTML tags so titles don't render <b> as text.
  out = out.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  return out;
}

function parseRSSItems(xml) {
  const items = [];
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g;
  const getTag = (str, tag) => {
    const m = str.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'));
    return m ? cleanRssText(m[1]) : '';
  };
  // Kicker (and others) emit multiple <category> tags per item — collect all
  // of them so the football filter can inspect the full classification.
  const getAllCategories = (str) => {
    const out = [];
    const re = /<category[^>]*>([\s\S]*?)<\/category>/gi;
    let cm;
    while ((cm = re.exec(str)) !== null) {
      const cleaned = cleanRssText(cm[1]);
      if (cleaned) out.push(cleaned);
    }
    return out;
  };
  let m;
  while ((m = itemRe.exec(xml)) !== null) {
    const raw = m[1];
    const imgM = raw.match(/<media:content[^>]+url="([^"]+)"/) ||
                 raw.match(/<media:thumbnail[^>]+url="([^"]+)"/) ||
                 raw.match(/<enclosure[^>]+url="([^"]+)"/) ||
                 raw.match(/<image:loc[^>]*>([^<]+)<\/image:loc>/);
    const categories = getAllCategories(raw);
    items.push({
      title:       getTag(raw, 'title'),
      link:        getTag(raw, 'link'),
      description: getTag(raw, 'description'),
      pubDate:     getTag(raw, 'pubDate') || getTag(raw, 'dc:date'),
      author:      getTag(raw, 'author') || getTag(raw, 'dc:creator'),
      image:       imgM ? imgM[1].trim() : null,
      category:    categories[0] || '',
      categories,
    });
  }
  return items;
}

// ── Football-only filter ─────────────────────────────────────────────────────
// Two-layer defense applied to EVERY feed (even URLs that look football-only —
// publishers occasionally cross-post other sports under /calcio, /football, …):
//   1. NON_FOOTBALL_HINT: any keyword from another sport in title/desc/cat → drop
//   2. FOOTBALL_HINT:     require a positive football match somewhere
// The positive check is the strict default. For football-only URL feeds it's
// nearly always satisfied; the rare miss is preferable to letting non-football
// content through.

// Avoid generic words that also appear in legitimate football articles:
//   - "vuelta" alone is Spanish for "return" → use the cycling event names
//   - "américain"/"american" too generic ("rêve américain" appears for the Bleus) → rely on NFL/super bowl
//   - "marathon"/"trail" used in football contexts ("marathon match")
const NON_FOOTBALL_HINT = /\b(cycling|cyclisme|ciclismo|radsport|tour\s*de\s*france|giro\s*d['']italia|vuelta\s+a\s+espa[ñn]a|vuelta\s+ciclista|tennis|atp|wta|roland[- ]garros|wimbledon|formel\s*1|formula\s*1|formule\s*1|\bf1\b|grand\s*prix|motogp|motorrad|motorsport|basket(?:ball)?|nba|wnba|rugby|xv\s*de\s*france|six\s*nations|boxing|boxe(?:n|o)?|mma|ufc|handball|hockey|nhl|eishockey|wintersport|ski(?:ing|fahren|sprung|alpin)?|snowboard|biathlon|leichtathletik|athlétisme|athletics|atletica|swimming|natation|schwimmen|nuoto|golf|america['']?s\s+cup|round[- ]the[- ]world|voile|esports?|formula\s*e|equestrian|pferdesport|wrestling|darts|cricket|baseball|nfl|super\s*bowl|olympia|jeux\s*olympiques|jo\s*\d{4}|paralympic|padel|p[ée]tanque|fl[ée]chettes|judo|karate|taekwondo|escrime|aviron|canoe|kayak|gymnastique|halt[ée]rophilie|patinage|curling|luge|bobsleigh|skeleton|crossfit|ironman|triathlon|water[- ]polo|volley|beach[- ]volley|softball|squash|badminton|ping[- ]pong|tennis\s*de\s*table)\b/i;

const FOOTBALL_HINT = /\b(football|futbol|fútbol|calcio|fußball|fussball|futebol|soccer|foot(?:ball)?|ligue\s*1|ligue\s*2|premier\s*league|bundesliga|serie\s*a|serie\s*b|liga|laliga|primeira\s*liga|eredivisie|champions[- ]league|europa[- ]league|conference[- ]league|coupe\s*du\s*monde|world\s*cup|copa[- ]am[ée]rica|coppa\s*italia|coupe\s*de\s*france|fa\s*cup|dfb[- ]pokal|copa\s*del\s*rey|copa\s*libertadores|mls|j[1-3]\s*league|equipe\s*de\s*france|selección|seleção|azzurri|nationalmannschaft|psg|paris\s*sg|paris\s*saint[- ]germain|real\s*madrid|barcelone|barcelona|barça|fc\s*barcelona|atletico|atlético|atl[ée]tico|bayern|borussia|dortmund|leipzig|leverkusen|juventus|inter\s*milan|ac\s*milan|napoli|roma|lazio|liverpool|manchester|chelsea|arsenal|tottenham|newcastle|man\s*city|man\s*utd|ajax|porto|benfica|sporting|fenerbahce|galatasaray|olympique\s*marseille|olympique\s*lyonnais|monaco|saint[- ]étienne|stade\s*rennais|stade\s*brestois|udinese|fiorentina|atalanta|cagliari|sassuolo|valencia|sevilla|villarreal|betis|girona|getafe|pokal|copa|ligue\s*des\s*champions|euro\s*\d{4}|qualif|qualifications?|playoff|relegation|mercato|transfert|transfer\s*window|fifa|uefa|var|penalty|tackle|attaquant|d[ée]fenseur|milieu\s*de\s*terrain|gardien|goalkeeper|striker|midfielder|defender|stadt?ion|stade|stadium|mbapp[ée]|messi|ronaldo|haaland|griezmann|benzema|neymar|vinicius|lewandowski|kane|salah|de\s*bruyne|modric|kroos|pep\s*guardiola|carlo\s*ancelotti|deschamps|kylian|antoine|kvaratskhelia|bellingham|saka|foden|rashford|sancho|pulisic|pulisić|hojlund|gyokeres|nkunku|dembele|coman|theo\s*hernandez|hernandez|barcola|kolo\s*muani|maignan|donnarumma|allianz\s*arena|santiago\s*bernabeu|santiago\s*bernab[ée]u|camp\s*nou|old\s*trafford|emirates|anfield|stamford\s*bridge|parc\s*des\s*princes|v[ée]lodrome|san\s*siro|gianlu[c]a|lione|inter|d[ée]rby|derby|d[ée]butant|recrue|signature|signing|contrat|prolongation|capitaine|captain|kapit[äa]n|championnat|saison|matchday|journ[ée]e|coup\s*franc|corner|hors[- ]jeu|offside|carton|jaune|rouge|but|gol|tor|goal|c1|c2|c3)\b/i;

function articleLooksLikeFootball(item, requirePositiveMatch = true) {
  const catText = (item.categories || []).join(' ').toLowerCase();
  const allText = `${item.title || ''} ${item.description || ''} ${catText}`.toLowerCase();
  // Strong negative override: any non-football sport keyword anywhere kills it.
  if (NON_FOOTBALL_HINT.test(allText)) return false;
  if (!requirePositiveMatch) return true;
  return FOOTBALL_HINT.test(allText);
}

// Some feeds (Atom 1.0, e.g. ones using <entry> instead of <item>) and some
// publishers serve RSS in non-UTF-8 charsets (ISO-8859-1, Windows-1252).
// `fetch()` defaults to UTF-8 decoding which mangles bytes — we read raw bytes,
// sniff the charset from headers + XML prolog, then decode with the right one.
async function fetchRssBody(url, headers) {
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const buf = Buffer.from(await res.arrayBuffer());
  const contentType = res.headers.get('content-type') || '';

  // 1. Charset from Content-Type header
  let charset = null;
  const ctMatch = contentType.match(/charset=([^;\s]+)/i);
  if (ctMatch) charset = ctMatch[1].toLowerCase().replace(/['"]/g, '');

  // 2. Fallback: sniff XML declaration in the first 200 bytes (always ASCII)
  if (!charset) {
    const head = buf.slice(0, 200).toString('latin1');
    const xmlMatch = head.match(/<\?xml[^>]+encoding=["']([^"']+)["']/i);
    if (xmlMatch) charset = xmlMatch[1].toLowerCase();
  }

  // 3. Default to UTF-8
  if (!charset) charset = 'utf-8';

  // Node's TextDecoder accepts: utf-8, iso-8859-1, windows-1252, etc.
  // Map common aliases that Node doesn't recognize verbatim.
  if (charset === 'latin1' || charset === 'latin-1' || charset === 'iso-latin-1') charset = 'iso-8859-1';
  if (charset === 'utf8') charset = 'utf-8';

  try {
    return new TextDecoder(charset).decode(buf);
  } catch {
    // Unknown encoding — fall back to latin1, which never throws and at least
    // keeps the bytes as 1:1 characters (preferable to garbled UTF-8 decoding).
    return new TextDecoder('iso-8859-1').decode(buf);
  }
}

// ── RSS news fetcher — free, reliable primary source ─────────────────────────
// Multi-country football press. `lang`/`country` are stored on each article so
// the UI can filter by country and translate on demand.
const NEWS_RSS_FEEDS = [
  // 🇫🇷 France — old direct RSS URLs (Foot Mercato, Maxifoot, Goal.com, the
  // public lequipe.fr/rss/* path) were retired by their publishers. The DWH
  // endpoint on L'Équipe still serves a full RSS for the Football section.
  { url: 'https://dwh.lequipe.fr/api/edito/rss?path=/Football',                              source: 'lequipe',        label: "L'Équipe",            lang: 'fr', country: 'FR' },
  { url: 'https://rmcsport.bfmtv.com/rss/football/',                                         source: 'rmc',            label: 'RMC Sport',           lang: 'fr', country: 'FR' },
  { url: 'https://www.20minutes.fr/feeds/rss-football.xml',                                  source: '20min',          label: '20 Minutes',          lang: 'fr', country: 'FR' },
  // 🇮🇹 Italie — Gazzetta /calcio.xml stopped refreshing after March 2026, dropped.
  // Corriere needs the URL WITHOUT .xml; the .xml endpoint serves an empty stub.
  { url: 'https://www.corrieredellosport.it/rss/calcio',                                     source: 'corriere-sport', label: 'Corriere dello Sport', lang: 'it', country: 'IT' },
  { url: 'https://www.tuttosport.com/rss/calcio',                                            source: 'tuttosport',     label: 'Tuttosport',           lang: 'it', country: 'IT' },
  { url: 'https://www.ansa.it/sito/notizie/sport/calcio/calcio_rss.xml',                     source: 'ansa',           label: 'ANSA Calcio',          lang: 'it', country: 'IT' },
  // 🇪🇸 Espagne — AS RSS endpoints all frozen since 2022 (publisher-side), dropped.
  // Marca /futbol-internacional.xml is also frozen; /futbol/mas-futbol.xml is live.
  { url: 'https://e00-marca.uecdn.es/rss/futbol/mas-futbol.xml',                             source: 'marca',          label: 'Marca',                lang: 'es', country: 'ES' },
  { url: 'https://www.mundodeportivo.com/rss/futbol.xml',                                    source: 'mundo-dep',      label: 'Mundo Deportivo',      lang: 'es', country: 'ES' },
  { url: 'https://www.sport.es/es/rss/futbol/rss.xml',                                       source: 'sport-es',       label: 'Sport.es',             lang: 'es', country: 'ES' },
  // 🇬🇧 Angleterre
  { url: 'https://feeds.bbci.co.uk/sport/football/rss.xml',                                  source: 'bbc-sport',      label: 'BBC Sport',            lang: 'en', country: 'GB' },
  { url: 'https://www.theguardian.com/football/rss',                                         source: 'guardian',       label: 'The Guardian',         lang: 'en', country: 'GB' },
  { url: 'https://www.skysports.com/rss/12040',                                              source: 'sky-sports',     label: 'Sky Sports',           lang: 'en', country: 'GB' },
  // 🇩🇪 Allemagne — Bild and Kicker mix sports, so we mark them `mixed: true`
  // to enable per-article football filtering. FAZ + Spiegel are foot-only by URL.
  { url: 'https://www.bild.de/feed/sport.xml',                                               source: 'bild',           label: 'Bild',                 lang: 'de', country: 'DE', mixed: true },
  { url: 'https://newsfeed.kicker.de/news/aktuell',                                          source: 'kicker',         label: 'Kicker',               lang: 'de', country: 'DE', mixed: true },
  { url: 'https://www.faz.net/rss/aktuell/sport/fussball/',                                  source: 'faz',            label: 'FAZ Football',         lang: 'de', country: 'DE' },
  { url: 'https://www.spiegel.de/sport/fussball/index.rss',                                  source: 'spiegel',        label: 'Spiegel Fußball',      lang: 'de', country: 'DE' },
  // 🇵🇹 Portugal — Record /rss is all sports
  { url: 'https://www.record.pt/rss',                                                        source: 'record',         label: 'Record',               lang: 'pt', country: 'PT', mixed: true },
];

// Some publishers (Sky Sports, Bild, Record) emit pubDate values with named
// timezone abbreviations like "BST", "CEST", "CET" — these are NOT in JS's
// Date parser, so `new Date(s)` returns Invalid Date and the article gets
// stamped with the current time instead. That makes them look artificially
// fresh on every scrape. Map the abbreviations to their numeric offsets first.
const TZ_ABBR_OFFSETS = {
  GMT: '+0000', UTC: '+0000', UT: '+0000', Z: '+0000',
  BST: '+0100', // British Summer Time
  CET: '+0100', WET: '+0000',
  CEST: '+0200', WEST: '+0100', EET: '+0200', EEST: '+0300',
  EST: '-0500', EDT: '-0400',
  CST: '-0600', CDT: '-0500',
  MST: '-0700', MDT: '-0600',
  PST: '-0800', PDT: '-0700',
};
function parsePubDate(raw) {
  if (!raw) return null;
  let d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  // Replace a trailing timezone abbreviation with a numeric offset.
  const m = raw.match(/(.*?)\s+([A-Z]{2,4})\s*$/);
  if (m && TZ_ABBR_OFFSETS[m[2]]) {
    d = new Date(`${m[1]} ${TZ_ABBR_OFFSETS[m[2]]}`);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

async function fetchNewsFromRSS() {
  const articles = [];
  // Run feeds in parallel batches to avoid 20× 8 s sequential timeout (~160 s)
  // while staying gentle on origin servers.
  const BATCH = 5;
  for (let i = 0; i < NEWS_RSS_FEEDS.length; i += BATCH) {
    const batch = NEWS_RSS_FEEDS.slice(i, i + BATCH);
    const results = await Promise.allSettled(batch.map(async (feed) => {
      // Use charset-aware fetcher — some feeds (Record.pt) serve ISO-8859-1
      // which Node's default UTF-8 decode mangles into � chars.
      // Use a real browser UA: L'Équipe / Foot Mercato / Maxifoot / Goal block
      // anything with "RSS Reader" / "bot" / non-Mozilla in the UA.
      const xml = await fetchRssBody(feed.url, {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        'Accept': 'application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
        'Accept-Language': feed.lang ? `${feed.lang},en;q=0.7` : 'en',
      });
      const items = parseRSSItems(xml);
      // Football filter applied to every feed — even URLs that look
      // football-only sometimes carry cross-posts of other sports. Mixed-sport
      // feeds require a strict positive football match; football-only feeds
      // only need to clear the negative check (no rugby/F1/cycling keyword),
      // so an article like "Mbappé sort sur blessure" — no club/league named —
      // still gets through.
      const filtered = items.filter(it => {
        if (!it.title || !it.link) return false;
        return articleLooksLikeFootball(it, !!feed.mixed);
      });
      const out = [];
      for (const item of filtered.slice(0, 20)) {
        if (!item.title || !item.link) continue;
        // pubDate is wildly inconsistent across publishers. parsePubDate handles
        // the named-timezone variants (BST, CEST...) that `new Date()` rejects.
        // Fall back to "now" only if we still can't parse it — that's strictly
        // better than dropping the article entirely.
        let publishedAt = new Date().toISOString();
        const parsed = parsePubDate(item.pubDate);
        if (parsed) publishedAt = parsed.toISOString();
        const cleanedDesc = item.description ? item.description.slice(0, 500) : null;
        out.push({
          external_id:  item.link,
          title:        item.title,
          description:  cleanedDesc,
          article_url:  item.link,
          image_url:    item.image || null,
          category:     item.category || 'Football',
          published_at: publishedAt,
          source:       feed.source,
          source_label: feed.label,
          lang:         feed.lang,
          country:      feed.country,
          author:       item.author || null,
          tags:         [],
        });
      }
      return { label: feed.label, count: out.length, items: out };
    }));
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const feed = batch[j];
      if (r.status === 'fulfilled') {
        articles.push(...r.value.items);
        console.log(`[news/rss] ${feed.country} ${r.value.label}: ${r.value.count} articles`);
      } else {
        console.warn(`[news/rss] ${feed.country} ${feed.label} failed:`, r.reason?.message);
      }
    }
  }
  return articles.length > 0 ? articles : null;
}

async function fetchNewsSofascoreDirect() {
  // Try known Sofascore internal API patterns
  const candidates = [
    'https://www.sofascore.com/api/v1/cms/editorial/articles?lang=fr&category=football-fr&page=0&size=30',
    'https://www.sofascore.com/api/v1/cms/editorial/articles?lang=fr&page=0&size=30',
    'https://www.sofascore.com/api/v1/news?lang=fr&category=football-fr',
    'https://api.sofascore.app/api/v1/cms/editorial/articles?lang=fr&category=football-fr',
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: SOFASCORE_HEADERS, signal: AbortSignal.timeout(8000) });
      if (!res.ok) continue;
      const ct = res.headers.get('content-type') || '';
      if (!ct.includes('json')) continue;
      const data = await res.json();
      const list = data.articles || data.news || data.data || data.items || data.results || [];
      if (Array.isArray(list) && list.length > 0) {
        console.log(`[news] Direct Sofascore API succeeded: ${list.length} articles (${url})`);
        return list.map(normalizeSofascoreArticle).filter(a => a.title && a.article_url);
      }
    } catch (err) { /* try next */ }
  }
  return null;
}

async function fetchNewsWithApify() {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) { console.warn('[news/apify] APIFY_API_KEY not set'); return null; }

  try {
    // playwright-scraper supports pageFunction; website-content-crawler does NOT
    const actorId = 'apify~playwright-scraper';
    console.log('[news/apify] Starting Apify playwright-scraper run...');
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?timeout=120&memory=1024`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,   // new-format API keys use Bearer header
        },
        body: JSON.stringify({
          startUrls: [{ url: 'https://www.sofascore.com/fr/news' }],
          maxRequestsPerCrawl: 1,
          pageFunction: `async ({ page }) => {
            await page.waitForTimeout(4000);
            return page.evaluate(() => {
              const sel = 'article,[class*="ArticleCard"],[class*="article-card"],[class*="news-card"],[data-testid*="article"]';
              return Array.from(document.querySelectorAll(sel)).slice(0, 30).map(el => ({
                title:        (el.querySelector('h1,h2,h3,h4,[class*=\\'title\\']') || {}).textContent?.trim() || '',
                description:  (el.querySelector('p,[class*=\\'desc\\'],[class*=\\'excerpt\\'],[class*=\\'subtitle\\']') || {}).textContent?.trim() || '',
                image_url:    el.querySelector('img')?.src || '',
                article_url:  el.querySelector('a')?.href || '',
                category:     (el.querySelector('[class*=\\'category\\'],[class*=\\'tag\\'],[class*=\\'badge\\']') || {}).textContent?.trim() || 'Football',
                published_at: el.querySelector('time')?.getAttribute('datetime') || new Date().toISOString(),
                author:       (el.querySelector('[class*=\\'author\\']') || {}).textContent?.trim() || null,
              })).filter(a => a.title && a.article_url && !a.article_url.includes('/fr/news'));
            });
          }`,
          proxyConfiguration: { useApifyProxy: true },
        }),
        signal: AbortSignal.timeout(140000),
      }
    );

    if (!runRes.ok) {
      const errText = await runRes.text().catch(() => '');
      console.warn(`[news/apify] Run failed: HTTP ${runRes.status} — ${errText.slice(0, 200)}`);
      return null;
    }

    const items = await runRes.json();
    const flat = Array.isArray(items) ? items.flat() : [];
    const articles = flat.filter(a => a?.title && a?.article_url).map(a => ({
      external_id:  a.article_url,
      title:        String(a.title).trim(),
      description:  a.description || null,
      image_url:    a.image_url || null,
      article_url:  a.article_url,
      category:     a.category || 'Football',
      published_at: a.published_at || new Date().toISOString(),
      author:       a.author || null,
      source:       'sofascore',
      tags:         [],
    }));

    if (articles.length > 0) {
      console.log(`[news/apify] Succeeded: ${articles.length} articles`);
      return articles;
    }
    console.warn('[news/apify] Run succeeded but returned 0 articles');
    return null;
  } catch (err) {
    console.warn('[news/apify] Error:', err?.message);
    return null;
  }
}

async function saveNewsArticles(articles) {
  const { v4: uuidv4 } = await import('uuid');
  let saved = 0;
  for (const a of articles) {
    if (!a.title || !a.article_url) continue;
    try {
      await pool.query(
        `INSERT INTO news_articles
          (id, external_id, title, description, content, image_url, article_url, category, tags, author, published_at, source, lang, country)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           title = VALUES(title), description = VALUES(description),
           image_url = VALUES(image_url), category = VALUES(category),
           tags = VALUES(tags), author = VALUES(author),
           published_at = VALUES(published_at), scraped_at = NOW(),
           lang = VALUES(lang), country = VALUES(country)`,
        [
          uuidv4(),
          a.external_id || a.article_url,
          String(a.title).slice(0, 1000),
          a.description || null,
          a.content || null,
          a.image_url || null,
          a.article_url,
          a.category || 'Football',
          JSON.stringify(a.tags || []),
          a.author || null,
          a.published_at ? new Date(a.published_at) : new Date(),
          a.source || 'sofascore',
          a.lang || null,
          a.country || null,
        ]
      );
      saved++;
    } catch (err) {
      if (!err?.message?.includes('Duplicate')) console.warn('[news] Save error:', err?.message);
    }
  }
  return saved;
}

async function runNewsScrape() {
  console.log('[news] Starting news scrape...');

  // 1. RSS feeds — free, reliable, multiple French football sources
  let articles = await fetchNewsFromRSS();
  if (articles && articles.length > 0) {
    console.log(`[news] RSS source returned ${articles.length} articles`);
    const saved = await saveNewsArticles(articles);
    console.log(`[news] RSS scrape done: ${saved} saved/updated`);
    return saved;
  }

  // 2. Sofascore direct API (often blocked but worth trying)
  console.log('[news] RSS returned nothing, trying Sofascore direct API...');
  articles = await fetchNewsSofascoreDirect();
  if (articles && articles.length > 0) {
    const saved = await saveNewsArticles(articles);
    console.log(`[news] Sofascore direct done: ${saved} saved/updated`);
    return saved;
  }

  // 3. Apify playwright scraper (paid, last resort)
  if (process.env.APIFY_API_KEY) {
    console.log('[news] Trying Apify playwright scraper...');
    articles = await fetchNewsWithApify();
    if (articles && articles.length > 0) {
      const saved = await saveNewsArticles(articles);
      console.log(`[news] Apify scrape done: ${saved} saved/updated`);
      return saved;
    }
  }

  console.log('[news] No articles found from any source.');
  return 0;
}

// ── Apify single-URL content fetcher ─────────────────────────────────────────
async function fetchArticleContentWithApify(articleUrl) {
  const apiKey = process.env.APIFY_API_KEY;
  if (!apiKey) return null;
  try {
    const actorId = 'apify~website-content-crawler';
    const runRes = await fetch(
      `https://api.apify.com/v2/acts/${actorId}/run-sync-get-dataset-items?timeout=60&memory=512`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          startUrls: [{ url: articleUrl }],
          maxCrawlDepth: 0,
          maxCrawlPages: 1,
          crawlerType: 'playwright:chrome',
          saveMarkdown: true,
          saveHtml: false,
          proxyConfiguration: { useApifyProxy: true },
        }),
        signal: AbortSignal.timeout(75000),
      }
    );
    if (!runRes.ok) return null;
    const items = await runRes.json();
    const item = Array.isArray(items) ? items[0] : null;
    if (!item) return null;
    return {
      html: item.html || null,
      markdown: item.markdown || item.text || null,
      title: item.title || null,
    };
  } catch (err) {
    console.warn('[news/apify] fetch error:', err?.message);
    return null;
  }
}

// ── GET /api/news/unified — merged news_articles + football_buzz + editorial ──
app.get("/api/news/unified", authMiddleware, async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 20, 60);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const search = (req.query.search || '').trim();
    const category = (req.query.category || '').trim();
    // 'article' = Sofascore only | 'buzz' = buzz only | 'editorial' = internal only | '' = all
    const typeFilter = (req.query.type || '').trim();

    // ISO country filter — accept "IT" or "IT,ES,GB". Whitelisted to 2-letter codes.
    const countries = (req.query.countries || req.query.country || '')
      .split(',').map(s => s.trim().toUpperCase()).filter(s => /^[A-Z]{2}$/.test(s));

    // If user wants translated titles in the listing, pass ?translate=fr
    const translateTo = sanitizeTargetLang(req.query.translate);

    const showArticle  = typeFilter === '' || typeFilter === 'article';
    const showBuzz     = typeFilter === '' || typeFilter === 'buzz';
    const showEditorial = typeFilter === '' || typeFilter === 'editorial';

    // Build per-source WHERE clauses + params independently
    const artClauses = ['1=1']; const artParams = [];
    const buzzClauses = ['1=1']; const buzzParams = [];
    const editClauses = ["ea.status = 'published'"]; const editParams = [];

    if (search) {
      if (showArticle) {
        artClauses.push('(na.title LIKE ? OR na.description LIKE ?)');
        artParams.push(`%${search}%`, `%${search}%`);
      }
      if (showBuzz) {
        buzzClauses.push('fb.content LIKE ?');
        buzzParams.push(`%${search}%`);
      }
      if (showEditorial) {
        editClauses.push('ea.title LIKE ?');
        editParams.push(`%${search}%`);
      }
    }
    if (category && showArticle) {
      artClauses.push('na.category = ?');
      artParams.push(category);
    }

    // Country filter only applies to scraped press articles. When set, drop
    // editorial + buzz unless they were specifically requested via ?type=.
    const countryFilterActive = countries.length > 0;
    if (countryFilterActive && showArticle) {
      artClauses.push(`na.country IN (${countries.map(() => '?').join(',')})`);
      artParams.push(...countries);
    }

    const artWhere  = artClauses.join(' AND ');
    const buzzWhere = buzzClauses.join(' AND ');
    const editWhere = editClauses.join(' AND ');

    // Build UNION — only include each part when shown, params follow the same order
    const unionParts = [];
    const allParams  = [];

    // When a country filter is active, hide editorial/buzz unless explicitly requested.
    const includeArt  = showArticle;
    const includeBuzz = showBuzz && (!countryFilterActive || typeFilter === 'buzz');
    const includeEd   = showEditorial && (!countryFilterActive || typeFilter === 'editorial');

    if (includeArt) {
      unionParts.push(`
        SELECT na.id, 'article' AS type, na.title, na.description AS excerpt,
               na.image_url, na.article_url AS url, na.category, na.author,
               na.published_at, na.source, na.lang, na.country,
               CASE WHEN na.content IS NOT NULL AND na.content != '' THEN 1 ELSE 0 END AS has_content
        FROM news_articles na WHERE ${artWhere}
      `);
      allParams.push(...artParams);
    }
    if (includeBuzz) {
      unionParts.push(`
        SELECT fb.id, 'buzz' AS type, fb.source_name AS title, fb.content AS excerpt,
               fb.image_url, fb.external_url AS url, NULL AS category, fb.source_handle AS author,
               fb.published_at, 'footballbuzz' AS source, NULL AS lang, NULL AS country, 1 AS has_content
        FROM football_buzz fb WHERE ${buzzWhere}
      `);
      allParams.push(...buzzParams);
    }
    if (includeEd) {
      unionParts.push(`
        SELECT ea.id, 'editorial' AS type, ea.title,
               SUBSTRING(ea.content, 1, 300) AS excerpt,
               ea.banner_url AS image_url,
               ea.id AS url,
               'Éditorial' AS category,
               COALESCE(p.full_name, u.email) AS author,
               ea.created_at AS published_at, 'internal' AS source,
               ea.lang AS lang, NULL AS country,
               1 AS has_content
        FROM editorial_articles ea
        LEFT JOIN users u ON u.id = ea.user_id
        LEFT JOIN profiles p ON p.user_id = ea.user_id
        WHERE ${editWhere}
      `);
      allParams.push(...editParams);
    }

    if (!unionParts.length) return res.json({ items: [], total: 0, categories: [], countries: [] });

    const unionSql = unionParts.join(' UNION ALL ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM (${unionSql}) u`,
      allParams
    );
    const [rows] = await pool.query(
      `SELECT * FROM (${unionSql}) u ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      [...allParams, limit, offset]
    );

    // Strip HTML tags from editorial excerpts (content is stored as rich HTML)
    let items = rows.map(row => {
      if (row.type === 'editorial' && row.excerpt) {
        const plain = String(row.excerpt)
          .replace(/<[^>]+>/g, ' ')
          .replace(/&nbsp;/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240);
        return { ...row, excerpt: plain || null };
      }
      return row;
    });

    // Listing-level translation: swap title/excerpt with cached translations
    // when ?translate=<lang> is set. We do NOT translate on the fly here (would
    // hammer the translation endpoint on every list refresh) — only pre-cached
    // translations from the article reader are applied.
    if (translateTo && items.length) {
      const ids = items.filter(it => it.type === 'article' && it.lang && it.lang !== translateTo).map(it => it.id);
      if (ids.length) {
        const [trRows] = await pool.query(
          `SELECT article_id, title, description FROM news_translations
           WHERE target_lang = ? AND article_id IN (${ids.map(() => '?').join(',')})`,
          [translateTo, ...ids]
        );
        const byId = new Map(trRows.map(r => [r.article_id, r]));
        items = items.map(it => {
          const tr = byId.get(it.id);
          if (tr) return { ...it, title: tr.title || it.title, excerpt: tr.description || it.excerpt, translated_listing: true };
          return it;
        });
      }
    }

    const [cats] = await pool.query(
      "SELECT DISTINCT category, COUNT(*) as count FROM news_articles WHERE category IS NOT NULL GROUP BY category ORDER BY count DESC LIMIT 20"
    );

    // Country facets so the UI can render filter chips with counts.
    const [countryFacets] = await pool.query(
      "SELECT country, COUNT(*) as count FROM news_articles WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY count DESC"
    );

    return res.json({ items, total, categories: cats, countries: countryFacets });
  } catch (err) {
    console.error('[GET /api/news/unified]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/news/content/:id — fetch (and cache) full article content via Apify
app.get("/api/news/content/:id", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const target = sanitizeTargetLang(req.query.translate);
    const [[row]] = await pool.query(
      'SELECT id, title, description, content, article_url, image_url, author, published_at, source, category, lang, country FROM news_articles WHERE id = ?',
      [id]
    );
    if (!row) return res.status(404).json({ error: 'Article introuvable' });

    // Make sure we have the original content first (fetch via Apify if missing)
    if (!row.content) {
      const apifyResult = await fetchArticleContentWithApify(row.article_url);
      if (apifyResult) {
        const fetched = apifyResult.markdown || apifyResult.html || null;
        if (fetched) {
          const clipped = fetched.slice(0, 65000);
          await pool.query('UPDATE news_articles SET content = ? WHERE id = ?', [clipped, id]);
          row.content = clipped;
        }
      }
      if (!row.content) {
        return res.json({ content: null, cached: false, fallback_url: row.article_url, lang: row.lang, country: row.country });
      }
    }

    // If a translation is requested AND the source language differs, return cached/fresh translation
    if (target && row.lang && row.lang !== target) {
      const translated = await ensureTranslation(row, target);
      if (translated) {
        return res.json({
          content:     translated.content || row.content,
          title:       translated.title,
          excerpt:     translated.description,
          translated:  true,
          source_lang: row.lang,
          target_lang: target,
          cached:      true,
          lang:        row.lang,
          country:     row.country,
        });
      }
    }

    return res.json({ content: row.content, cached: true, lang: row.lang, country: row.country });
  } catch (err) {
    console.error('[GET /api/news/content/:id]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── Google Translate helper ──────────────────────────────────────────────────
// Uses the public translate.googleapis.com endpoint (the same one wrapped by
// the various google-translate-api npm packages). Free, no API key, no
// dependency. Soft-limited to ~5 000 chars per request, so longer content is
// split on paragraph boundaries and reassembled.
// Every translation is still cached in news_translations so a given
// (article_id, target_lang) pair is only translated once.
const SUPPORTED_TARGET_LANGS = new Set(['fr', 'en', 'es', 'de', 'it', 'pt']);

function sanitizeTargetLang(v) {
  if (!v) return null;
  const s = String(v).toLowerCase().slice(0, 5);
  return SUPPORTED_TARGET_LANGS.has(s) ? s : null;
}

async function googleTranslateChunk(text, src, tgt) {
  const params = new URLSearchParams({
    client: 'gtx',
    sl: src || 'auto',
    tl: tgt,
    dt: 't',
    q: text,
  });
  const res = await fetch(`https://translate.googleapis.com/translate_a/single?${params}`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status} ${txt.slice(0, 120)}`);
  }
  const data = await res.json();
  // Shape: [[[translated, original, null, null, ...], ...], null, sourceLang]
  if (!Array.isArray(data) || !Array.isArray(data[0])) {
    throw new Error('Unexpected response shape');
  }
  return data[0].map(seg => (seg && seg[0]) || '').join('');
}

// Split a long string into <= CHUNK pieces, preferring paragraph breaks.
function splitForTranslate(text, chunkSize = 4500) {
  if (text.length <= chunkSize) return [text];
  const parts = [];
  let remaining = text;
  while (remaining.length > chunkSize) {
    let cut = remaining.lastIndexOf('\n\n', chunkSize);
    if (cut < chunkSize / 2) cut = remaining.lastIndexOf('\n',  chunkSize);
    if (cut < chunkSize / 2) cut = remaining.lastIndexOf('. ',  chunkSize);
    if (cut < chunkSize / 2) cut = chunkSize;
    parts.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }
  if (remaining) parts.push(remaining);
  return parts;
}

async function googleTranslate(texts, sourceLang, targetLang) {
  const src = sourceLang ? sourceLang.toLowerCase() : 'auto';
  const tgt = targetLang.toLowerCase();
  const out = [];
  try {
    for (const text of texts) {
      if (!text || !String(text).trim()) { out.push(''); continue; }
      const chunks = splitForTranslate(String(text));
      const parts = [];
      for (const c of chunks) parts.push(await googleTranslateChunk(c, src, tgt));
      out.push(parts.join(''));
    }
  } catch (err) {
    console.warn('[google-translate] error:', err?.message);
    return null;
  }
  return out;
}

async function ensureTranslation(row, targetLang) {
  const [[hit]] = await pool.query(
    'SELECT title, description, content FROM news_translations WHERE article_id = ? AND target_lang = ?',
    [row.id, targetLang]
  );
  if (hit && hit.title) return hit;

  if (!row.lang || row.lang === targetLang) return null;

  const inputs = [
    row.title || '',
    row.description || '',
    row.content || '',
  ];
  const out = await googleTranslate(inputs, row.lang, targetLang);
  if (!out || out.length < 1) return null;

  const translated = {
    title:       out[0] || row.title,
    description: out[1] || row.description,
    content:     out[2] || row.content,
  };

  try {
    await pool.query(
      `INSERT INTO news_translations (article_id, target_lang, title, description, content, provider)
       VALUES (?, ?, ?, ?, ?, 'google')
       ON DUPLICATE KEY UPDATE title = VALUES(title), description = VALUES(description), content = VALUES(content), updated_at = NOW()`,
      [
        row.id,
        targetLang,
        String(translated.title || '').slice(0, 65000),
        translated.description ? String(translated.description).slice(0, 65000) : null,
        translated.content ? String(translated.content).slice(0, 65000) : null,
      ]
    );
  } catch (err) {
    console.warn('[news/translate] cache write failed:', err?.message);
  }
  return translated;
}

// ── POST /api/news/translate/:id — translate an article to target language ──
app.post("/api/news/translate/:id", authMiddleware, async (req, res) => {
  try {
    const target = sanitizeTargetLang(req.body?.target || req.query?.target);
    if (!target) return res.status(400).json({ error: 'Langue cible invalide' });

    const [[row]] = await pool.query(
      'SELECT id, title, description, content, lang, country FROM news_articles WHERE id = ?',
      [req.params.id]
    );
    if (!row) return res.status(404).json({ error: 'Article introuvable' });
    if (!row.lang) return res.status(400).json({ error: 'Langue source inconnue pour cet article' });
    if (row.lang === target) {
      return res.json({
        translated: false,
        title: row.title, description: row.description, content: row.content,
        source_lang: row.lang, target_lang: target,
      });
    }

    const translated = await ensureTranslation(row, target);
    if (!translated) {
      return res.status(503).json({
        error: 'Traduction indisponible',
        hint:  'Le service Google Translate n\'a pas répondu — réessayez dans un instant.',
      });
    }
    return res.json({
      translated:  true,
      title:       translated.title,
      description: translated.description,
      content:     translated.content,
      source_lang: row.lang,
      target_lang: target,
    });
  } catch (err) {
    console.error('[POST /api/news/translate/:id]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/news — public listing with filters ───────────────────────────────
app.get("/api/news", async (req, res) => {
  try {
    const limit  = Math.min(parseInt(req.query.limit) || 20, 50);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const search = (req.query.search || '').trim();
    const category = (req.query.category || '').trim();
    const source = (req.query.source || '').trim();
    const from = req.query.from ? new Date(req.query.from) : null;
    const to   = req.query.to   ? new Date(req.query.to)   : null;

    const clauses = ['1=1'];
    const params = [];
    if (search)   { clauses.push('(title LIKE ? OR description LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    if (category) { clauses.push('category = ?'); params.push(category); }
    if (source)   { clauses.push('source = ?'); params.push(source); }
    if (from)     { clauses.push('published_at >= ?'); params.push(from); }
    if (to)       { clauses.push('published_at <= ?'); params.push(to); }

    const where = clauses.join(' AND ');
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM news_articles WHERE ${where}`, params);
    const [rows] = await pool.query(
      `SELECT * FROM news_articles WHERE ${where} ORDER BY published_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    // Distinct categories for filters
    const [cats] = await pool.query(
      "SELECT DISTINCT category, COUNT(*) as count FROM news_articles GROUP BY category ORDER BY count DESC LIMIT 20"
    );

    return res.json({ articles: rows, total, categories: cats, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── POST /api/admin/news/refresh — manual scrape trigger ──────────────────────
app.post("/api/admin/news/refresh", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const saved = await runNewsScrape();
    return res.json({ ok: true, saved });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/admin/news/status ────────────────────────────────────────────────
app.get("/api/admin/news/status", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const [[{ total }]] = await pool.query("SELECT COUNT(*) as total FROM news_articles");
    const [[latest]] = await pool.query("SELECT scraped_at FROM news_articles ORDER BY scraped_at DESC LIMIT 1");
    return res.json({ total, last_scraped: latest?.scraped_at || null, apify_configured: !!process.env.APIFY_API_KEY });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Football Buzz — RSS aggregator ────────────────────────────────────────────

pool.query(`CREATE TABLE IF NOT EXISTS club_overrides (
  id INT AUTO_INCREMENT PRIMARY KEY,
  club_name VARCHAR(255) NOT NULL,
  city VARCHAR(255) NULL,
  official_website VARCHAR(500) NULL,
  address TEXT NULL,
  phone VARCHAR(100) NULL,
  email VARCHAR(255) NULL,
  founded_year INT NULL,
  stadium VARCHAR(255) NULL,
  stadium_capacity INT NULL,
  manager VARCHAR(255) NULL,
  description_fr TEXT NULL,
  description_en TEXT NULL,
  league VARCHAR(255) NULL,
  colour1 VARCHAR(30) NULL,
  colour2 VARCHAR(30) NULL,
  badge_url TEXT NULL,
  updated_by VARCHAR(36) NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_club_override (club_name(191))
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] club_overrides table:', err?.message); });

// ── club_overrides — fix updated_by type + extended columns ──────────────────
pool.query("ALTER TABLE club_overrides MODIFY COLUMN updated_by VARCHAR(36) NULL").catch(() => {});
pool.query('ALTER TABLE club_overrides ADD COLUMN country VARCHAR(255) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN division VARCHAR(255) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN staff_technical TEXT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN contact_name VARCHAR(255) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN contact_role VARCHAR(100) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN contact_phone VARCHAR(100) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN contact_email VARCHAR(255) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN current_ranking INT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN current_season VARCHAR(50) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN stats_goals_for INT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN stats_goals_against INT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN stats_clean_sheets INT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN stats_wins INT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN stats_draws INT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN stats_losses INT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN transfer_budget VARCHAR(100) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN avg_salary VARCHAR(100) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN partnership_status VARCHAR(255) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN recommended_players TEXT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN scout_rating TINYINT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN coach_photo_url TEXT NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN coach_nationality VARCHAR(100) NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });
pool.query('ALTER TABLE club_overrides ADD COLUMN coach_date_born DATE NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] club_overrides:', err?.message); });

pool.query('ALTER TABLE tickets ADD COLUMN user_read_at DATETIME NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] tickets user_read_at:', err?.message); });
pool.query('ALTER TABLE tickets ADD COLUMN admin_read_at DATETIME NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] tickets admin_read_at:', err?.message); });
pool.query('ALTER TABLE organizations ADD COLUMN settings JSON NULL').catch(err => { if (err.errno !== 1060) console.warn('[warn] org settings:', err?.message); });
pool.query("ALTER TABLE organization_members ADD COLUMN messaging_blocked TINYINT(1) NOT NULL DEFAULT 0").catch(err => { if (err.errno !== 1060) console.warn('[warn] org_members messaging_blocked:', err?.message); });

// ── player_viewer_links: cross-user Wyscout import dedup ──────────────────────
pool.query(`CREATE TABLE IF NOT EXISTS player_viewer_links (
  player_id CHAR(36) NOT NULL,
  viewer_user_id CHAR(36) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, viewer_user_id),
  INDEX idx_pvl_viewer (viewer_user_id),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] player_viewer_links:', err?.message); });

// ── player_user_rating: per-user rating overlay (LEFT JOINed by /api/players) ──
// MUST exist on every environment (incl. Vercel cold starts) — the GET /api/players
// query LEFT JOINs this table, and a missing table errors the whole endpoint,
// which makes the players list appear empty on the frontend.
//
// COLLATION: explicit utf8mb4_unicode_ci because `players` was created with this
// collation; without an explicit clause, MySQL 8+ picks utf8mb4_0900_ai_ci by
// default, which mismatches and breaks `pur.player_id = p.id` JOINs with
// "Illegal mix of collations" → /api/players returns 500 → list appears empty.
pool.query(`CREATE TABLE IF NOT EXISTS player_user_rating (
  player_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  current_level DECIMAL(3,1) NOT NULL DEFAULT 0,
  potential DECIMAL(3,1) NOT NULL DEFAULT 0,
  general_opinion VARCHAR(30) NOT NULL DEFAULT 'À revoir',
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (player_id, user_id),
  INDEX idx_pur_user (user_id),
  INDEX idx_pur_player (player_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`)
  .then(async () => {
    // Repair: if the table was previously created without an explicit collation
    // (utf8mb4_0900_ai_ci), convert it to match players' utf8mb4_unicode_ci.
    // Idempotent: CONVERT TO is a no-op when the table is already in the target collation.
    try {
      const [rows] = await pool.query(
        "SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'player_user_rating'"
      );
      if (rows[0] && rows[0].TABLE_COLLATION && rows[0].TABLE_COLLATION !== 'utf8mb4_unicode_ci') {
        console.log('[migration] Converting player_user_rating collation:', rows[0].TABLE_COLLATION, '→ utf8mb4_unicode_ci');
        await pool.query("ALTER TABLE player_user_rating CONVERT TO CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
      }
    } catch (err) {
      console.warn('[warn] player_user_rating collation check:', err?.message);
    }

    // One-shot backfill: copy each player's stored rating into the overlay for
    // its owner. INSERT IGNORE preserves any existing overlay row. Idempotent.
    return pool.query(`
      INSERT IGNORE INTO player_user_rating (player_id, user_id, current_level, potential, general_opinion, updated_at)
      SELECT id, user_id, current_level, potential, general_opinion, COALESCE(updated_at, NOW())
      FROM players
      WHERE NOT (current_level = 5.0 AND potential = 5.0 AND general_opinion = 'À revoir')
        AND (current_level > 0 OR potential > 0 OR (general_opinion IS NOT NULL AND general_opinion != 'À revoir' AND general_opinion != ''))
    `).catch(err => console.warn('[warn] player_user_rating backfill:', err?.message));
  })
  .catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] player_user_rating:', err?.message); });

// Bridge between imported player names (often abbreviated/truncated, e.g. "K. Mbappé")
// and the canonical player record (e.g. "Kylian Mbappé" — typically the Transfermarkt name).
// alias_norm is the normalizeStr() form of the variant; same alias_norm can map to multiple
// players (homonyms), so reads must disambiguate by club. Written from 3 sources:
//   - 'import' : every successful Wyscout import row registers its raw name as alias
//   - 'tm'     : TM enrichment registers the canonical name returned by Transfermarkt
//   - 'manual' : admin override
pool.query(`CREATE TABLE IF NOT EXISTS player_name_aliases (
  alias_norm VARCHAR(191) NOT NULL,
  player_id CHAR(36) NOT NULL,
  source ENUM('import','tm','manual') NOT NULL DEFAULT 'import',
  raw_name VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (alias_norm, player_id),
  INDEX idx_pna_player (player_id),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] player_name_aliases:', err?.message); });

// ─── Shared TM enrichment cache (cross-user) ────────────────────────────────
// One row per TM player ID with the full scrape payload. Anyone who needs
// the data for tm_id=X gets it from here — we only scrape when the row is
// missing or expires_at <= NOW(). Default TTL 24h: the nightly cron refreshes
// after expiry, and manual user-triggered enrichments within a 24h window
// serve from cache (zero HTTP calls to TM). Replaces the older 24h entries
// in api_football_cache that used cache_key='tm-player:${tmId}'.
pool.query(`CREATE TABLE IF NOT EXISTS tm_player_cache (
  tm_id VARCHAR(50) NOT NULL PRIMARY KEY,
  canonical_name VARCHAR(255) NULL,
  payload_json LONGTEXT NOT NULL,
  fetched_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  INDEX idx_tm_cache_expires (expires_at)
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] tm_player_cache:', err?.message); });

// ─── Shared name → TM-ID resolution map ──────────────────────────────────────
// When user A successfully resolves "Kylian Mbappé / PSG" to TM id 342229,
// we record it here so user B's enrichment of the same name skips the TM
// search entirely and reads tm_player_cache directly. confidence is the
// scoring from the search (higher = stronger match). resolved_at is bumped
// each time we re-confirm. Names don't change much so we don't expire
// entries automatically; the backfill / cron overwrites stale rows.
// Note: VARCHAR widths (120, 80) keep the composite PK under MySQL's 1000-byte
// limit for utf8mb4 (120*4 + 80*4 = 800 bytes). Player names rarely exceed
// 120 chars; club names rarely exceed 80. Anything longer gets truncated for
// the resolution lookup — the rest of the row keeps the full canonical name.
pool.query(`CREATE TABLE IF NOT EXISTS tm_name_resolution (
  name_norm VARCHAR(120) NOT NULL,
  club_norm VARCHAR(80) NOT NULL DEFAULT '',
  tm_id VARCHAR(50) NOT NULL,
  confidence TINYINT NOT NULL DEFAULT 0,
  resolved_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (name_norm, club_norm),
  INDEX idx_tnr_tm (tm_id)
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] tm_name_resolution:', err?.message); });

pool.query(`CREATE TABLE IF NOT EXISTS club_profiles_cache (
  id INT AUTO_INCREMENT PRIMARY KEY,
  club_name VARCHAR(255) NOT NULL,
  data LONGTEXT NOT NULL,
  cached_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  UNIQUE KEY uniq_club_profile (club_name(191))
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] club_profiles_cache table:', err?.message); });

pool.query(`CREATE TABLE IF NOT EXISTS club_scouting_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  club_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_csn_club (club_name(191)),
  INDEX idx_csn_user (user_id)
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] club_scouting_notes table:', err?.message); });
pool.query("ALTER TABLE club_scouting_notes MODIFY COLUMN user_id VARCHAR(36) NOT NULL").catch(() => {});
pool.query("ALTER TABLE club_scouting_notes ADD COLUMN rating TINYINT NULL").catch(err => { if (err.errno !== 1060) console.warn('[warn] club_scouting_notes rating:', err?.message); });
// Deduplicate before adding unique key: keep the row with the highest id per (club_name, user_id)
pool.query(`
  DELETE n1 FROM club_scouting_notes n1
  INNER JOIN club_scouting_notes n2
    ON n1.club_name = n2.club_name AND n1.user_id = n2.user_id AND n1.id < n2.id
`).catch(() => {});
pool.query("ALTER TABLE club_scouting_notes ADD UNIQUE KEY uniq_csn_club_user (club_name(191), user_id)").catch(err => {
  // 1061 = key already exists, 1060 = duplicate column, 1062 = duplicate entry (dedup may not have run yet on first boot)
  if (err.errno !== 1061 && err.errno !== 1060 && err.errno !== 1062) console.warn('[warn] club_scouting_notes unique:', err?.message);
});

// ── Frontend error tracking ───────────────────────────────────────────────────
pool.query(`CREATE TABLE IF NOT EXISTS frontend_errors (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(36)   NULL,
  user_email    VARCHAR(255)  NULL,
  page_url      VARCHAR(1000) NULL,
  error_name    VARCHAR(255)  NULL,
  error_message TEXT          NULL,
  error_stack   TEXT          NULL,
  component_stack TEXT        NULL,
  source        VARCHAR(50)   NOT NULL DEFAULT 'frontend',
  is_resolved   TINYINT(1)    NOT NULL DEFAULT 0,
  resolved_at   DATETIME      NULL,
  resolution_note TEXT        NULL,
  created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_fe_user (user_id),
  INDEX idx_fe_resolved (is_resolved),
  INDEX idx_fe_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`
).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] frontend_errors:', err?.message); });
pool.query("ALTER TABLE frontend_errors ADD COLUMN source VARCHAR(50) NOT NULL DEFAULT 'frontend'").catch(err => { if (err.errno !== 1060) console.warn('[warn] frontend_errors source:', err?.message); });

// POST /api/errors/report — called by ErrorBoundary and Vite build plugin (no auth required)
app.post("/api/errors/report", async (req, res) => {
  try {
    const { error_name, error_message, error_stack, component_stack, page_url, source } = req.body || {};
    const eSource = ['frontend', 'build', 'server'].includes(source) ? source : 'frontend';
    let userId = null, userEmail = null;
    // Try to identify user from cookie (optional — build errors have no user)
    if (eSource === 'frontend') {
      try {
        const token = req.cookies?.[AUTH_COOKIE] || null;
        if (token) {
          const payload = jwt.verify(token, jwtSecret);
          const user = await getUserById(payload.sub);
          if (user) { userId = user.id; userEmail = user.email; }
        }
      } catch {} // ignore auth errors — error reporting must never fail
    }

    const eName = String(error_name || '').slice(0, 255);
    const eMsg  = String(error_message || '').slice(0, 1000);
    const eUrl  = String(page_url || '').slice(0, 1000);

    // Deduplicate: skip if this (source, error_name, error_message) already exists unresolved
    const [[existing]] = await pool.query(
      `SELECT id FROM frontend_errors
       WHERE is_resolved = 0
         AND source = ?
         AND error_name = ?
         AND LEFT(error_message, 500) = LEFT(?, 500)
       LIMIT 1`,
      [eSource, eName, eMsg]
    );
    if (existing) return res.json({ ok: true, skipped: true });

    await pool.query(
      `INSERT INTO frontend_errors (user_id, user_email, page_url, error_name, error_message, error_stack, component_stack, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        userId,
        userEmail,
        eUrl,
        eName,
        eMsg,
        String(error_stack || '').slice(0, 8000),
        String(component_stack || '').slice(0, 8000),
        eSource,
      ]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('[error-report]', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// GET /api/admin/errors — list frontend errors (admin only)
app.get("/api/admin/errors", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const resolved = req.query.resolved; // 'all' | '0' | '1'
    let where = '';
    if (resolved === '0') where = 'WHERE is_resolved = 0';
    else if (resolved === '1') where = 'WHERE is_resolved = 1';
    const [rows] = await pool.query(
      `SELECT id, user_id, user_email, page_url, error_name, error_message, error_stack,
              component_stack, is_resolved, resolved_at, resolution_note, created_at
       FROM frontend_errors ${where} ORDER BY created_at DESC LIMIT 500`
    );
    return res.json({ errors: rows });
  } catch (err) { return res.status(500).json({ error: err?.message }); }
});

// PUT /api/admin/errors/:id/resolve — mark as resolved
app.put("/api/admin/errors/:id/resolve", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const { resolution_note } = req.body || {};
    await pool.query(
      "UPDATE frontend_errors SET is_resolved = 1, resolved_at = NOW(), resolution_note = ? WHERE id = ?",
      [String(resolution_note || '').trim() || null, req.params.id]
    );
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message }); }
});

// DELETE /api/admin/errors/:id — delete a reported error
app.delete("/api/admin/errors/:id", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    await pool.query("DELETE FROM frontend_errors WHERE id = ?", [req.params.id]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err?.message }); }
});

pool.query(`CREATE TABLE IF NOT EXISTS championship_scouting_notes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  championship_name VARCHAR(255) NOT NULL,
  user_id VARCHAR(36) NOT NULL,
  content TEXT NOT NULL,
  rating TINYINT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_csn_champ (championship_name(191)),
  INDEX idx_csn_champ_user (user_id)
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] championship_scouting_notes table:', err?.message); });
pool.query("ALTER TABLE championship_scouting_notes ADD COLUMN rating TINYINT NULL").catch(err => { if (err.errno !== 1060) console.warn('[warn] championship_scouting_notes rating:', err?.message); });
pool.query("ALTER TABLE championship_scouting_notes ADD UNIQUE KEY uniq_csn_champ_user (championship_name(191), user_id)").catch(err => { if (err.errno !== 1061 && err.errno !== 1060) console.warn('[warn] championship_scouting_notes unique:', err?.message); });

pool.query(`CREATE TABLE IF NOT EXISTS football_buzz (
  id CHAR(36) PRIMARY KEY,
  source_name VARCHAR(100) NOT NULL,
  source_handle VARCHAR(100) NOT NULL,
  source_color VARCHAR(20) NOT NULL DEFAULT '#3B82F6',
  content TEXT NOT NULL,
  image_url TEXT NULL,
  external_url TEXT NOT NULL,
  buzz_score INT NOT NULL DEFAULT 0,
  is_hot TINYINT(1) NOT NULL DEFAULT 0,
  published_at DATETIME NOT NULL,
  scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  content_hash CHAR(64) NOT NULL,
  UNIQUE KEY uniq_buzz_hash (content_hash),
  INDEX idx_buzz_score (buzz_score, published_at),
  INDEX idx_buzz_date (published_at)
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] football_buzz table:', err?.message); });

const BUZZ_SOURCES = [
  { name: "L'Équipe",      handle: '@lequipe',       color: '#FFD700', url: 'https://www.lequipe.fr/rss/actu_rss_Football.xml',          scoreBase: 90 },
  { name: 'Goal.com',      handle: '@goal_fr',        color: '#1a9e3f', url: 'https://www.goal.com/feeds/fr/news',                        scoreBase: 80 },
  { name: 'Foot Mercato',  handle: '@footmercato',    color: '#e74c3c', url: 'https://www.footmercato.net/rss.xml',                       scoreBase: 75 },
  { name: 'RMC Sport',     handle: '@RMCsport',       color: '#e8340b', url: 'https://rmcsport.bfmtv.com/rss/football/',                  scoreBase: 85 },
  { name: 'Transfermarkt', handle: '@Transfermarkt',  color: '#00a550', url: 'https://www.transfermarkt.fr/rdf/transfergeruchte.xml',     scoreBase: 70 },
  { name: 'Eurosport',     handle: '@Eurosport_FR',   color: '#ff6900', url: 'https://www.eurosport.fr/football/rss.xml',                 scoreBase: 78 },
  { name: 'So Foot',       handle: '@sofoot',         color: '#8B5CF6', url: 'https://www.sofoot.com/rss.xml',                           scoreBase: 65 },
];

const BUZZ_KEYWORDS_HOT = ['transfert','recrute','signe','officiel','blessé','blessure','suspendu','record','titre','champion','licencié','convoqué','exclu','penalty','but','victoire','défaite','scandal','mercato'];

function buzzHash(content, url) {
  const str = (content + url).slice(0, 200);
  let h = 0;
  for (let i = 0; i < str.length; i++) { h = (Math.imul(31, h) + str.charCodeAt(i)) | 0; }
  return Math.abs(h).toString(16).padStart(16, '0') + str.length.toString(16).padStart(8, '0');
}

function parseRssItems(xml) {
  const items = [];
  const itemMatches = xml.matchAll(/<item>([\s\S]*?)<\/item>/gi);
  for (const m of itemMatches) {
    const block = m[1];
    const getTag = (tag) => {
      const r = block.match(new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>|<${tag}[^>]*>([^<]*)<\\/${tag}>`, 'i'));
      return r ? (r[1] || r[2] || '').trim() : '';
    };
    const title = getTag('title');
    const description = getTag('description');
    const link = getTag('link') || block.match(/<link>\s*(https?:\/\/[^<]+)/i)?.[1] || '';
    const pubDate = getTag('pubDate');
    const enclosure = block.match(/enclosure[^>]+url="([^"]+)"/i)?.[1] || null;
    const mediaUrl = block.match(/<media:content[^>]+url="([^"]+)"/i)?.[1] || enclosure;
    if (!title || !link) continue;
    const content = title + (description ? ' — ' + description.replace(/<[^>]+>/g, '').slice(0, 200) : '');
    const published = pubDate ? new Date(pubDate) : new Date();
    if (isNaN(published.getTime())) continue;
    items.push({ title, content: content.slice(0, 400), link: link.trim(), image_url: mediaUrl || null, published });
  }
  return items;
}

function computeBuzzScore(content, source, published) {
  let score = source.scoreBase;
  // recency bonus: +30 if < 1h, +20 if < 3h, +10 if < 6h
  const ageH = (Date.now() - published.getTime()) / 3600000;
  if (ageH < 1) score += 30;
  else if (ageH < 3) score += 20;
  else if (ageH < 6) score += 10;
  // keyword bonus
  const lc = content.toLowerCase();
  for (const kw of BUZZ_KEYWORDS_HOT) { if (lc.includes(kw)) { score += 8; break; } }
  // base randomness for variety
  score += Math.floor(Math.random() * 15);
  return Math.min(score, 200);
}

async function fetchBuzzSource(source) {
  try {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ScoutyBot/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return parseRssItems(xml).map(item => ({ ...item, source }));
  } catch (e) {
    console.warn(`[buzz] ${source.name} failed:`, e.message);
    return [];
  }
}

async function runBuzzScrape() {
  console.log('[buzz] Starting buzz scrape...');
  const allItems = [];
  for (let i = 0; i < BUZZ_SOURCES.length; i++) {
    const items = await fetchBuzzSource(BUZZ_SOURCES[i]);
    allItems.push(...items);
    if (i < BUZZ_SOURCES.length - 1) {
      const buzzDelayMs = await scrapeDelay('scrape_delay_buzz_ms', 500);
      await new Promise(r => setTimeout(r, buzzDelayMs));
    }
  }
  let saved = 0;
  for (const item of allItems) {
    const hash = buzzHash(item.content, item.link);
    const score = computeBuzzScore(item.content, item.source, item.published);
    const isHot = score >= 120 ? 1 : 0;
    try {
      await pool.query(
        `INSERT INTO football_buzz (id, source_name, source_handle, source_color, content, image_url, external_url, buzz_score, is_hot, published_at, content_hash)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE buzz_score = ?, is_hot = ?, scraped_at = NOW()`,
        [uuidv4(), item.source.name, item.source.handle, item.source.color,
         item.content, item.image_url, item.link, score, isHot, item.published, hash,
         score, isHot]
      );
      saved++;
    } catch {}
  }
  // Clean up buzz older than 7 days
  await pool.query("DELETE FROM football_buzz WHERE published_at < DATE_SUB(NOW(), INTERVAL 7 DAY)").catch(() => {});
  console.log(`[buzz] Scrape done: ${saved} posts saved/updated.`);
  return saved;
}

app.get("/api/buzz", authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 30, 60);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);
    const source = (req.query.source || '').trim();
    const filter = req.query.filter || 'trending'; // 'trending' | 'recent' | 'hot'

    const clauses = ['1=1'];
    const params = [];
    if (source) { clauses.push('source_name = ?'); params.push(source); }
    if (filter === 'hot') { clauses.push('is_hot = 1'); }

    const where = clauses.join(' AND ');
    const order = filter === 'recent' ? 'published_at DESC' : 'buzz_score DESC, published_at DESC';

    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM football_buzz WHERE ${where}`, params);
    const [rows] = await pool.query(`SELECT * FROM football_buzz WHERE ${where} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, offset]);
    const [sources] = await pool.query("SELECT DISTINCT source_name, source_handle, source_color FROM football_buzz ORDER BY source_name");
    const [[{ last_scraped }]] = await pool.query("SELECT MAX(scraped_at) as last_scraped FROM football_buzz");
    return res.json({ posts: rows, total, sources, last_scraped });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── GET /api/buzz/article — fetch & extract article content ──────────────────

app.get("/api/buzz/article", authMiddleware, async (req, res) => {
  try {
    const url = decodeURIComponent(req.query.url || '');
    if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'invalid_url' });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    let html;
    try {
      const r = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8',
        },
      });
      clearTimeout(timeout);
      const ct = r.headers.get('content-type') || '';
      if (!ct.includes('html')) return res.status(422).json({ error: 'not_html' });
      html = await r.text();
    } catch (e) {
      clearTimeout(timeout);
      return res.status(502).json({ error: 'fetch_failed', detail: e?.message });
    }

    // Detect article language from <html lang="..."> attribute
    const htmlLangM = html.match(/<html[^>]+lang=["']([a-zA-Z]{2,5})(?:-[^"']+)?["']/i);
    const contentLangM = html.match(/<meta[^>]+http-equiv=["']content-language["'][^>]+content=["']([a-zA-Z]{2})/i)
      || html.match(/<meta[^>]+content=["']([a-zA-Z]{2})["'][^>]+http-equiv=["']content-language["']/i);
    const detectedLang = (htmlLangM?.[1] || contentLangM?.[1] || '').toLowerCase().slice(0, 2) || null;

    // Extract OG / meta data
    const ogTitle   = (html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || [])[1] || '';
    const ogDesc    = (html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) || [])[1] || '';
    const ogImage   = (html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i) || html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) || [])[1] || '';
    const titleTag  = (html.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';

    // Try to extract main article body — ordered by specificity
    const SELECTORS = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<div[^>]+(?:class|id)=["'][^"']*(?:article[_-]?body|article[_-]?content|article[_-]?text|post[_-]?content|entry[_-]?content|story[_-]?body|news[_-]?content)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
    ];

    let rawBody = '';
    for (const rx of SELECTORS) {
      const m = html.match(rx);
      if (m) { rawBody = m[1]; break; }
    }
    if (!rawBody) {
      // Fallback: grab all <p> tags from the page body
      const bodyM = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
      rawBody = bodyM ? bodyM[1] : html;
    }

    // Strip scripts, styles, nav, aside, footer, ads
    rawBody = rawBody
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<aside[\s\S]*?<\/aside>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<header[\s\S]*?<\/header>/gi, '')
      .replace(/<!--[\s\S]*?-->/g, '');

    // Extract paragraphs
    const paragraphs = [];
    const pRx = /<p[^>]*>([\s\S]*?)<\/p>/gi;
    let m2;
    while ((m2 = pRx.exec(rawBody)) !== null) {
      // Strip inner tags
      const text = m2[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
      if (text.length > 40) paragraphs.push(text);
    }

    return res.json({
      title: ogTitle || titleTag,
      description: ogDesc,
      image: ogImage || null,
      paragraphs,
      source_url: url,
      lang: detectedLang,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Club profile cache ─────────────────────────────────────────────────────────

app.get("/api/club-profile-cache", authMiddleware, async (req, res) => {
  try {
    const name = (req.query.name || '').trim().toLowerCase();
    if (!name) return res.status(400).json({ error: 'missing_name' });
    const [[row]] = await pool.query(
      "SELECT data FROM club_profiles_cache WHERE club_name = ? AND expires_at > NOW()",
      [name]
    );
    if (!row) return res.status(404).json({ error: 'cache_miss' });
    return res.json(JSON.parse(row.data));
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post("/api/club-profile-cache", authMiddleware, async (req, res) => {
  try {
    const { name, data } = req.body || {};
    if (!name || !data) return res.status(400).json({ error: 'missing_fields' });
    const key = name.trim().toLowerCase();
    const expiresAt = new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      "INSERT INTO club_profiles_cache (club_name, data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at), cached_at = NOW()",
      [key, JSON.stringify(data), expiresAt]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Club upcoming fixtures (TheSportsDB via DB cache) ──────────────────────────

app.get("/api/club-fixtures", authMiddleware, async (req, res) => {
  try {
    const teamId = (req.query.teamId || '').trim();
    if (!teamId) return res.status(400).json({ error: 'missing_teamId' });

    const cacheKey = `club_fixtures_${teamId}`;
    const [[cached]] = await pool.query(
      "SELECT data FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW()",
      [cacheKey]
    );
    if (cached) return res.json(JSON.parse(cached.data));

    const apiKey = process.env.THESPORTSDB_API_KEY || '3';
    const r = await fetch(`https://www.thesportsdb.com/api/v1/json/${apiKey}/eventsnext.php?id=${teamId}`, { headers: TSDB_HEADERS });
    if (!r.ok) return res.status(502).json({ error: 'tsdb_error' });
    const tsdbData = await r.json();
    const events = tsdbData?.events ?? [];

    const expiresAt = new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      "INSERT INTO api_football_cache (cache_key, data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)",
      [cacheKey, JSON.stringify(events), expiresAt]
    ).catch(() => {});

    return res.json(events);
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Club buzz mentions ─────────────────────────────────────────────────────────

app.get("/api/buzz/club", authMiddleware, async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'missing_name' });
    const [rows] = await pool.query(
      "SELECT * FROM football_buzz WHERE content LIKE ? ORDER BY published_at DESC LIMIT 6",
      [`%${name}%`]
    );
    return res.json({ posts: rows });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Club scouting notes ────────────────────────────────────────────────────────

app.get("/api/club-notes", authMiddleware, async (req, res) => {
  try {
    const club = (req.query.club || '').trim();
    if (!club) return res.status(400).json({ error: 'missing_club' });
    const [rows] = await pool.query(
      `SELECT n.id, n.club_name, n.content, n.rating, n.created_at, n.updated_at, n.user_id,
              COALESCE(p.full_name, u.email) AS author_name
       FROM club_scouting_notes n
       LEFT JOIN users    u ON u.id = n.user_id
       LEFT JOIN profiles p ON p.user_id = n.user_id
       WHERE n.club_name = ?
       ORDER BY n.updated_at DESC`,
      [club]
    );
    return res.json({ notes: rows });
  } catch (err) {
    console.error('[club-notes GET] ERR:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

app.post("/api/club-notes", authMiddleware, async (req, res) => {
  try {
    const { club, content, id, rating } = req.body || {};
    if (!club || !content?.trim()) return res.status(400).json({ error: 'missing_fields' });
    const ratingVal = (rating != null && rating !== '' && Number.isFinite(Number(rating))) ? Number(rating) : null;
    if (id) {
      await pool.query(
        "UPDATE club_scouting_notes SET content = ?, rating = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
        [content.trim(), ratingVal, id, req.user.id]
      );
      return res.json({ ok: true });
    }
    const [r] = await pool.query(
      `INSERT INTO club_scouting_notes (club_name, user_id, content, rating)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), rating = VALUES(rating), updated_at = NOW()`,
      [club, req.user.id, content.trim(), ratingVal]
    );
    return res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error('[club-notes POST] ERR:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

app.delete("/api/club-notes/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM club_scouting_notes WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── ScoreBat video proxy ──────────────────────────────────────────────────────
// Free API (scorebat.com/video-api). SCOREBAT_TOKEN env var optional (improves rate limits).

const _scorebatCache = { data: null, fetchedAt: 0 };

async function getScoreBatFeed() {
  const TTL = 15 * 60 * 1000;
  if (_scorebatCache.data && Date.now() - _scorebatCache.fetchedAt < TTL) return _scorebatCache.data;
  const token = process.env.SCOREBAT_TOKEN || '';
  const url = token
    ? `https://www.scorebat.com/video-api/v3/feed/?token=${token}`
    : `https://www.scorebat.com/video-api/v3/feed/`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Scouty/1.0)' } });
  if (!r.ok) throw new Error(`ScoreBat ${r.status}`);
  const json = await r.json();
  const list = Array.isArray(json) ? json : (json.response || []);
  _scorebatCache.data = list;
  _scorebatCache.fetchedAt = Date.now();
  return list;
}

app.get("/api/scorebat/videos", async (req, res) => {
  try {
    const team1 = String(req.query.team1 || '').toLowerCase().trim();
    const team2 = String(req.query.team2 || '').toLowerCase().trim();
    if (!team1 && !team2) return res.json({ videos: [] });
    const feed = await getScoreBatFeed();
    const scoreV = (title) => {
      const t = title.toLowerCase();
      let s = 0;
      if (team1 && t.includes(team1)) s += 3;
      if (team2 && t.includes(team2)) s += 3;
      const t1w = team1.split(' ')[0]; const t2w = team2.split(' ')[0];
      if (t1w?.length >= 4 && t.includes(t1w)) s += 1;
      if (t2w?.length >= 4 && t.includes(t2w)) s += 1;
      return s;
    };
    const videos = feed
      .map(v => ({ ...v, _s: scoreV(v.title || '') }))
      .filter(v => v._s >= 3)
      .sort((a, b) => b._s - a._s)
      .slice(0, 6)
      .map(({ _s, ...v }) => v);
    return res.json({ videos });
  } catch (err) {
    console.error('[scorebat]', err?.message);
    return res.json({ videos: [] });
  }
});

// ── FotMob xG proxy (unofficial API — free, no key required) ─────────────────

const _fotmobDateCache = new Map(); // dateKey → { data, t }

app.get("/api/fotmob/xg", async (req, res) => {
  try {
    const team1 = String(req.query.team1 || '').trim();
    const team2 = String(req.query.team2 || '').trim();
    const date  = String(req.query.date  || '').trim();
    if (!team1 || !team2 || !date) return res.json({ xg: null });

    const dateKey = date.replace(/-/g, '');
    const norm = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');

    let matchesData;
    const fc = _fotmobDateCache.get(dateKey);
    if (fc && Date.now() - fc.t < 30 * 60 * 1000) {
      matchesData = fc.data;
    } else {
      const r = await fetch(`https://www.fotmob.com/api/matches?date=${dateKey}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
      });
      if (!r.ok) return res.json({ xg: null });
      matchesData = await r.json();
      _fotmobDateCache.set(dateKey, { data: matchesData, t: Date.now() });
    }

    let fotmobId = null;
    const t1 = norm(team1); const t2 = norm(team2);
    for (const league of (matchesData.leagues || [])) {
      for (const match of (league.matches || [])) {
        const hn = norm(match.home?.name || ''); const an = norm(match.away?.name || '');
        if ((hn.includes(t1) || t1.includes(hn)) && (an.includes(t2) || t2.includes(an))) {
          fotmobId = match.id; break;
        }
      }
      if (fotmobId) break;
    }
    if (!fotmobId) return res.json({ xg: null });

    const dr = await fetch(`https://www.fotmob.com/api/matchDetails?matchId=${fotmobId}`, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36', 'Accept': 'application/json' },
    });
    if (!dr.ok) return res.json({ xg: null });
    const detail = await dr.json();

    let xgHome = null, xgAway = null;
    const allStats = detail?.content?.stats?.Periods?.All?.stats;
    if (Array.isArray(allStats)) {
      const s = allStats.find(x =>
        String(x.type || '').toLowerCase().includes('expected') ||
        String(x.title || '').toLowerCase().includes('xg') ||
        String(x.title || '').toLowerCase().includes('expected')
      );
      if (s?.stats?.length >= 2) {
        xgHome = parseFloat(String(s.stats[0]).replace(',', '.')) || null;
        xgAway = parseFloat(String(s.stats[1]).replace(',', '.')) || null;
      }
    }
    return res.json({ xg: xgHome !== null ? { home: xgHome, away: xgAway } : null });
  } catch (err) {
    console.error('[fotmob-xg]', err?.message);
    return res.json({ xg: null });
  }
});

// ── football-data.org — forme récente + H2H (gratuit, 10 req/min) ─────────────
// Inscrivez-vous sur football-data.org et ajoutez FOOTBALL_DATA_API_KEY dans .env

const FDORG_KEY   = process.env.FOOTBALL_DATA_API_KEY || '';
const FDORG_BASE  = 'https://api.football-data.org/v4';
const FDORG_COMPS = ['PL','PD','BL1','SA','FL1','CL','EL','EC','WC','PPL','DED','ELC','BSA'];

const _fdTeamMap   = {};
let   _fdMapReady  = false;
let   _fdMapLoading = false;

async function loadFdOrgTeamMap() {
  if (_fdMapReady || _fdMapLoading || !FDORG_KEY) return;
  _fdMapLoading = true;
  const normK = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  for (const comp of FDORG_COMPS) {
    try {
      const r = await fetch(`${FDORG_BASE}/competitions/${comp}/teams`, {
        headers: { 'X-Auth-Token': FDORG_KEY },
      });
      if (r.ok) {
        const data = await r.json();
        for (const t of (data.teams || [])) {
          for (const k of [t.name, t.shortName, t.tla].filter(Boolean)) {
            _fdTeamMap[normK(k)] = { id: t.id, name: t.name };
          }
        }
      }
    } catch (e) { console.error('[fdorg-load]', e.message); }
    await new Promise(r => setTimeout(r, 6500)); // 10 req/min
  }
  _fdMapReady = true;
  _fdMapLoading = false;
  console.log(`[fdorg] Team map loaded: ${Object.keys(_fdTeamMap).length} entries`);
}

function findFdTeam(name) {
  const n = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (_fdTeamMap[n]) return _fdTeamMap[n];
  for (const [k, v] of Object.entries(_fdTeamMap)) {
    if (k.length >= 4 && (k.includes(n) || n.includes(k))) return v;
  }
  return null;
}

const _fdFormCache = new Map(); // teamId → { form, fetchedAt }

app.get("/api/fdorg/form", async (req, res) => {
  try {
    if (!FDORG_KEY) return res.json({ form: null });
    if (!_fdMapReady) { loadFdOrgTeamMap().catch(() => {}); return res.json({ form: null }); }
    const teamName = String(req.query.team || '').trim();
    if (!teamName) return res.json({ form: null });
    const team = findFdTeam(teamName);
    if (!team) return res.json({ form: null });
    const fc = _fdFormCache.get(team.id);
    if (fc && Date.now() - fc.fetchedAt < 60 * 60 * 1000) return res.json({ form: fc.form, teamName: team.name });
    const r = await fetch(`${FDORG_BASE}/teams/${team.id}/matches?status=FINISHED&limit=5`, {
      headers: { 'X-Auth-Token': FDORG_KEY },
    });
    if (!r.ok) return res.json({ form: null });
    const data = await r.json();
    const form = (data.matches || []).reverse().slice(0, 5).map(m => {
      const isHome = m.homeTeam.id === team.id;
      const my = isHome ? m.score.fullTime.home : m.score.fullTime.away;
      const op = isHome ? m.score.fullTime.away : m.score.fullTime.home;
      return {
        result: my > op ? 'W' : my < op ? 'L' : 'D',
        myScore: my, opScore: op,
        opponent: isHome ? m.awayTeam.name : m.homeTeam.name,
        date: m.utcDate, isHome,
      };
    });
    _fdFormCache.set(team.id, { form, fetchedAt: Date.now() });
    return res.json({ form, teamName: team.name });
  } catch (err) {
    console.error('[fdorg-form]', err?.message);
    return res.json({ form: null });
  }
});

app.get("/api/fdorg/h2h", async (req, res) => {
  try {
    if (!FDORG_KEY) return res.json({ matches: [] });
    if (!_fdMapReady) { loadFdOrgTeamMap().catch(() => {}); return res.json({ matches: [] }); }
    const team1Name = String(req.query.team1 || '').trim();
    const team2Name = String(req.query.team2 || '').trim();
    if (!team1Name || !team2Name) return res.json({ matches: [] });
    const team1 = findFdTeam(team1Name);
    const team2 = findFdTeam(team2Name);
    if (!team1 || !team2) return res.json({ matches: [] });
    const r = await fetch(`${FDORG_BASE}/teams/${team1.id}/matches?status=FINISHED&limit=40`, {
      headers: { 'X-Auth-Token': FDORG_KEY },
    });
    if (!r.ok) return res.json({ matches: [] });
    const data = await r.json();
    const h2h = (data.matches || [])
      .filter(m => m.homeTeam.id === team2.id || m.awayTeam.id === team2.id)
      .slice(0, 5)
      .map(m => ({
        date: m.utcDate,
        homeTeam: m.homeTeam.name, awayTeam: m.awayTeam.name,
        homeScore: m.score.fullTime.home, awayScore: m.score.fullTime.away,
        competition: m.competition?.name,
      }));
    return res.json({ matches: h2h });
  } catch (err) {
    console.error('[fdorg-h2h]', err?.message);
    return res.json({ matches: [] });
  }
});

if (FDORG_KEY) setTimeout(() => loadFdOrgTeamMap().catch(e => console.error('[fdorg-init]', e.message)), 10000);

// ── Championship scouting notes ───────────────────────────────────────────────

app.get("/api/championship-notes", authMiddleware, async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'missing_name' });
    const [rows] = await pool.query(
      `SELECT n.id, n.championship_name, n.content, n.rating, n.created_at, n.updated_at, n.user_id,
              COALESCE(p.full_name, u.email) AS author_name
       FROM championship_scouting_notes n
       LEFT JOIN users    u ON u.id = n.user_id
       LEFT JOIN profiles p ON p.user_id = n.user_id
       WHERE n.championship_name = ?
       ORDER BY n.updated_at DESC`,
      [name]
    );
    return res.json({ notes: rows });
  } catch (err) {
    console.error('[champ-notes GET] ERR:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

app.post("/api/championship-notes", authMiddleware, async (req, res) => {
  try {
    const { name, content, id, rating } = req.body || {};
    if (!name || !content?.trim()) return res.status(400).json({ error: 'missing_fields' });
    const ratingVal = (rating != null && rating !== '' && Number.isFinite(Number(rating))) ? Number(rating) : null;
    if (id) {
      await pool.query(
        "UPDATE championship_scouting_notes SET content = ?, rating = ?, updated_at = NOW() WHERE id = ? AND user_id = ?",
        [content.trim(), ratingVal, id, req.user.id]
      );
      return res.json({ ok: true });
    }
    const [r] = await pool.query(
      `INSERT INTO championship_scouting_notes (championship_name, user_id, content, rating)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE content = VALUES(content), rating = VALUES(rating), updated_at = NOW()`,
      [name, req.user.id, content.trim(), ratingVal]
    );
    return res.json({ ok: true, id: r.insertId });
  } catch (err) {
    console.error('[champ-notes POST] ERR:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

app.delete("/api/championship-notes/:id", authMiddleware, async (req, res) => {
  try {
    await pool.query(
      "DELETE FROM championship_scouting_notes WHERE id = ? AND user_id = ?",
      [req.params.id, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Club manual overrides (moderator / admin) ─────────────────────────────────

app.get("/api/club-override", authMiddleware, async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'missing_name' });
    const [[row]] = await pool.query(
      "SELECT * FROM club_overrides WHERE club_name = ?",
      [name]
    );
    return res.json(row || null);
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post("/api/club-override", authMiddleware, ensureAdminOrModerator, async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.club_name) return res.status(400).json({ error: 'missing_club_name' });

    // Helper: convert empty strings to null, coerce integers
    const str = v => (v === '' || v === undefined) ? null : String(v);
    const int = v => (v === '' || v === undefined || v === null) ? null : (Number.isFinite(Number(v)) ? Number(v) : null);

    const data = {
      club_name:          String(b.club_name),
      city:               str(b.city),
      official_website:   str(b.official_website),
      address:            str(b.address),
      phone:              str(b.phone),
      email:              str(b.email),
      founded_year:       int(b.founded_year),
      stadium:            str(b.stadium),
      stadium_capacity:   int(b.stadium_capacity),
      manager:            str(b.manager),
      description_fr:     str(b.description_fr),
      description_en:     str(b.description_en),
      league:             str(b.league),
      colour1:            str(b.colour1),
      colour2:            str(b.colour2),
      badge_url:          str(b.badge_url),
      country:            str(b.country),
      division:           str(b.division),
      staff_technical:    str(b.staff_technical),
      contact_name:       str(b.contact_name),
      contact_role:       str(b.contact_role),
      contact_phone:      str(b.contact_phone),
      contact_email:      str(b.contact_email),
      current_ranking:    int(b.current_ranking),
      current_season:     str(b.current_season),
      stats_goals_for:    int(b.stats_goals_for),
      stats_goals_against:int(b.stats_goals_against),
      stats_clean_sheets: int(b.stats_clean_sheets),
      stats_wins:         int(b.stats_wins),
      stats_draws:        int(b.stats_draws),
      stats_losses:       int(b.stats_losses),
      transfer_budget:    str(b.transfer_budget),
      avg_salary:         str(b.avg_salary),
      partnership_status: str(b.partnership_status),
      recommended_players:str(b.recommended_players),
      scout_rating:       int(b.scout_rating),
      coach_photo_url:    str(b.coach_photo_url),
      coach_nationality:  str(b.coach_nationality),
      coach_date_born:    str(b.coach_date_born),
      updated_by:         String(req.user.id),
    };

    // Build query dynamically — no risk of placeholder/value count mismatch
    const cols = Object.keys(data);
    const vals = cols.map(k => data[k]);
    const placeholders = cols.map(() => '?').join(', ');
    const updates = cols
      .filter(k => k !== 'club_name')
      .map(k => `\`${k}\` = VALUES(\`${k}\`)`)
      .join(', ');

    const sql = `INSERT INTO club_overrides (${cols.map(c => `\`${c}\``).join(', ')})
       VALUES (${placeholders})
       ON DUPLICATE KEY UPDATE ${updates}, updated_at = NOW()`;

    await pool.query(sql, vals);

    await pool.query("DELETE FROM club_profiles_cache WHERE club_name = ?", [b.club_name.toLowerCase()]).catch(() => {});

    const [[saved]] = await pool.query("SELECT * FROM club_overrides WHERE club_name = ?", [data.club_name]);
    return res.json({ ok: true, row: saved || null });
  } catch (err) {
    console.error('[club-override] ERROR:', err?.message);
    return res.status(500).json({ error: err?.message });
  }
});

// ── X / SocialData feed ──────────────────────────────────────────────────────

app.get("/api/x/feed", authMiddleware, async (req, res) => {
  try {
    const [keyRows] = await pool.query(
      'SELECT api_key FROM user_integrations WHERE user_id = ? AND service = ? AND enabled = 1 AND api_key IS NOT NULL',
      [req.user.id, 'socialdata']
    );
    const key = keyRows[0]?.api_key;
    if (!key) return res.status(402).json({ error: 'no_key' });

    const accounts = (req.query.accounts || '').split(',').map(s => s.trim()).filter(Boolean);
    const keywords = (req.query.keywords || '').split(',').map(s => s.trim()).filter(Boolean);
    const limit = Math.min(parseInt(req.query.limit) || 30, 50);

    // Build SocialData query
    const accountPart = accounts.length ? accounts.map(a => `from:${a.replace(/^@/, '')}`).join(' OR ') : '';
    const keywordPart = keywords.join(' OR ');
    let query = [accountPart ? `(${accountPart})` : '', keywordPart].filter(Boolean).join(' ');
    if (!query) query = 'football scouting';

    // Cache key
    const cacheKey = `x_feed_${req.user.id}_${Buffer.from(query).toString('base64').slice(0, 40)}`;
    const [[cached]] = await pool.query(
      "SELECT data FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW()",
      [cacheKey]
    );
    if (cached) return res.json(JSON.parse(cached.data));

    // Fetch from SocialData
    const sdUrl = `https://api.socialdata.tools/twitter/search?query=${encodeURIComponent(query)}&type=Latest&count=${limit}`;
    const sdRes = await fetch(sdUrl, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/json' },
    });
    if (!sdRes.ok) {
      const errText = await sdRes.text();
      return res.status(sdRes.status).json({ error: errText });
    }
    const sdData = await sdRes.json();

    // Normalize to our BuzzPost shape
    const tweets = (sdData.tweets || sdData.data || []);
    const posts = tweets.map(tw => {
      const user = tw.user || tw.author || {};
      const metrics = tw.public_metrics || {};
      return {
        id: tw.id_str || tw.id || String(Math.random()),
        source_name: user.name || user.username || 'X',
        source_handle: `@${user.screen_name || user.username || 'x'}`,
        source_color: '#000000',
        content: tw.full_text || tw.text || '',
        image_url: tw.entities?.media?.[0]?.media_url_https || tw.extended_entities?.media?.[0]?.media_url_https || null,
        external_url: `https://x.com/${user.screen_name || user.username}/status/${tw.id_str || tw.id}`,
        buzz_score: (metrics.like_count || tw.favorite_count || 0),
        retweet_count: metrics.retweet_count || tw.retweet_count || 0,
        reply_count: metrics.reply_count || tw.reply_count || 0,
        is_hot: (metrics.like_count || tw.favorite_count || 0) > 500 ? 1 : 0,
        published_at: tw.created_at || new Date().toISOString(),
        verified: user.verified || user.is_blue_verified || false,
        profile_image: user.profile_image_url_https || null,
      };
    });

    const payload = { posts, total: posts.length, query };

    // Cache 30 minutes
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
    await pool.query(
      "INSERT INTO api_football_cache (cache_key, data, expires_at) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE data = VALUES(data), expires_at = VALUES(expires_at)",
      [cacheKey, JSON.stringify(payload), expiresAt]
    ).catch(() => {});

    return res.json(payload);
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post("/api/admin/buzz/refresh", authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const saved = await runBuzzScrape();
    return res.json({ ok: true, saved });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// ── Cron: news scrape every 3 hours ──────────────────────────────────────────

// ── Cron: nightly enrichment for premium users ─────────────────────────────

// Auto-create cron_enrichment_logs table
pool.query(`CREATE TABLE IF NOT EXISTS cron_enrichment_logs (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  total_players INT NOT NULL DEFAULT 0,
  enriched INT NOT NULL DEFAULT 0,
  errors INT NOT NULL DEFAULT 0,
  status ENUM('running', 'done', 'failed') NOT NULL DEFAULT 'running',
  error_detail TEXT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`).catch(() => {});

/**
 * Enrich all players for a single user. Writes a log row in cron_enrichment_logs.
 * Reuses the same enrichOnePlayer() pipeline as the manual "enrich-all" endpoint.
 */
async function cronEnrichUser(userId) {
  const logId = uuidv4();
  await pool.query(
    'INSERT INTO cron_enrichment_logs (id, user_id, status) VALUES (?, ?, ?)',
    [logId, userId, 'running']
  );

  try {
    const [players] = await pool.query(
      'SELECT id, name, club, nationality, generation FROM players WHERE user_id = ? ORDER BY name',
      [userId]
    );
    const total = players.length;
    await pool.query('UPDATE cron_enrichment_logs SET total_players = ? WHERE id = ?', [total, logId]);

    let enriched = 0, errors = 0;
    for (const p of players) {
      try {
        const [rows] = await pool.query(
          'SELECT id, name, club, league, nationality, date_of_birth, contract_end, external_data, photo_url, transfermarkt_id, generation, foot FROM players WHERE id = ?',
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
        // Reuse stored transfermarkt_id when present — skips the ambiguity-prone name search
        let tmPath = null;
        if (row.transfermarkt_id) {
          const slug = normalizeStr(row.name).replace(/ /g, '-') || 'player';
          tmPath = `/${slug}/profil/spieler/${row.transfermarkt_id}`;
        }
        let result = await enrichOnePlayer(playerInfo, row, tmPath);
        if (result.ambiguous) {
          // No UI to disambiguate in cron — pick the highest-scored TM candidate
          const top = result.candidates?.[0];
          if (top?.path) result = await enrichOnePlayer(playerInfo, row, top.path);
        }
        if (result.ambiguous) { errors++; continue; }
        const { setClauses, params } = result;
        params.push(p.id, userId);
        await pool.query(`UPDATE players SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`, params);
        enriched++;
      } catch (e) {
        errors++;
        console.error(`[cron-enrich] Error for ${p.name} (user ${userId}):`, e.message);
      }
      // Rate-limit: configurable delay between players (default 2s)
      const playerDelayMs = await scrapeDelay('scrape_delay_player_ms', 2000);
      await new Promise(r => setTimeout(r, playerDelayMs));
    }

    await pool.query(
      'UPDATE cron_enrichment_logs SET finished_at = NOW(), enriched = ?, errors = ?, status = ? WHERE id = ?',
      [enriched, errors, 'done', logId]
    );
    console.log(`[cron-enrich] User ${userId}: ${enriched}/${total} enriched, ${errors} errors`);

    // Notify user
    await createNotification(userId, {
      type: 'enrichment',
      title: 'Enrichissement automatique terminé',
      message: `${enriched} joueur${enriched > 1 ? 's' : ''} enrichi${enriched > 1 ? 's' : ''}, ${errors} erreur${errors > 1 ? 's' : ''}`,
      icon: 'Zap',
    });
  } catch (err) {
    await pool.query(
      'UPDATE cron_enrichment_logs SET finished_at = NOW(), status = ?, error_detail = ? WHERE id = ?',
      ['failed', err.message, logId]
    );
    console.error(`[cron-enrich] Fatal error for user ${userId}:`, err.message);
  }
}

/**
 * Nightly cron: enrich all players for premium/pro users.
 * Runs at 02:00 every night (server timezone).
 * Processes users sequentially to avoid hammering external APIs.
 */
async function runNightlyEnrichment() {
  console.log('[cron-enrich] Starting nightly enrichment...');
  try {
    // Check feature flag — allow admins to disable via app_settings
    const [flagRows] = await pool.query(
      "SELECT setting_value FROM app_settings WHERE setting_key = 'cron_enrichment_enabled'"
    ).catch(() => [[]]);
    if (flagRows.length && flagRows[0].setting_value === '0') {
      console.log('[cron-enrich] Disabled via feature flag, skipping');
      return;
    }

    // Select premium users (is_premium = 1 OR plan_type in scout/pro)
    const [premiumUsers] = await pool.query(`
      SELECT u.id, u.email, us.plan_type
      FROM users u
      JOIN user_subscriptions us ON us.user_id = u.id
      WHERE us.is_premium = 1
        OR us.plan_type IN ('scout', 'pro')
    `);

    if (!premiumUsers.length) {
      console.log('[cron-enrich] No premium users found, skipping');
      return;
    }

    console.log(`[cron-enrich] Found ${premiumUsers.length} premium user(s) to enrich`);

    for (const user of premiumUsers) {
      console.log(`[cron-enrich] Processing user ${user.email} (plan: ${user.plan_type})`);
      await cronEnrichUser(user.id);
      // Pause between users to spread API load (configurable)
      if (premiumUsers.length > 1) {
        const userDelayMs = await scrapeDelay('scrape_delay_user_ms', 5000);
        await new Promise(r => setTimeout(r, userDelayMs));
      }
    }

    console.log('[cron-enrich] Nightly enrichment complete');
  } catch (err) {
    console.error('[cron-enrich] Fatal error:', err.message);
  }
}

// ── Image migration: download external URLs → BLOB in uploaded_images ────────
async function runImageBlobMigration({ limit = 50 } = {}) {
  const label = '[img-migration]';
  try {
    // Find players with external photo_url (not already in DB)
    const [players] = await pool.query(
      `SELECT id, photo_url FROM players
       WHERE photo_url IS NOT NULL
         AND photo_url != ''
         AND photo_url NOT LIKE '/api/images/%'
         AND photo_url NOT LIKE '/uploads/%'
       LIMIT ?`,
      [limit]
    );
    let migrated = 0;
    for (const p of players) {
      try {
        const resp = await fetch(p.photo_url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > 5 * 1024 * 1024) continue; // skip > 5MB
        const mime = resp.headers.get('content-type') || 'image/jpeg';
        const imageId = `player-photo-${p.id}`;
        await pool.query(
          `INSERT INTO uploaded_images (id, data, mime_type) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE data = VALUES(data), mime_type = VALUES(mime_type), created_at = NOW()`,
          [imageId, buf, mime]
        );
        await pool.query('UPDATE players SET photo_url = ? WHERE id = ?', [`/api/images/${imageId}`, p.id]);
        migrated++;
      } catch { /* skip on error — will retry next run */ }
    }

    // Same for org logos stored as external URLs
    const [orgs] = await pool.query(
      `SELECT id, logo_url FROM organizations
       WHERE logo_url IS NOT NULL
         AND logo_url != ''
         AND logo_url NOT LIKE '/api/images/%'
         AND logo_url NOT LIKE '/uploads/%'
       LIMIT ?`,
      [Math.max(1, Math.floor(limit / 5))]
    );
    for (const o of orgs) {
      try {
        const resp = await fetch(o.logo_url, { signal: AbortSignal.timeout(8000) });
        if (!resp.ok) continue;
        const buf = Buffer.from(await resp.arrayBuffer());
        if (buf.length > 5 * 1024 * 1024) continue;
        const mime = resp.headers.get('content-type') || 'image/png';
        const imageId = `org-logo-${o.id}`;
        await pool.query(
          `INSERT INTO uploaded_images (id, data, mime_type) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE data = VALUES(data), mime_type = VALUES(mime_type), created_at = NOW()`,
          [imageId, buf, mime]
        );
        await pool.query('UPDATE organizations SET logo_url = ? WHERE id = ?', [`/api/images/${imageId}`, o.id]);
        migrated++;
      } catch {}
    }

    if (migrated > 0) console.log(`${label} Migrated ${migrated} images to DB BLOB`);
  } catch (e) {
    console.error(`${label} Error:`, e.message);
  }
}

// Schedule: every day at 02:00 (only on local server, not Vercel serverless)
if (!isVercel && cron) {
  cron.schedule('0 2 * * *', runNightlyEnrichment, { timezone: 'Europe/Paris' });
  console.log('[startup] Cron scheduled: nightly enrichment at 02:00 Europe/Paris');
  cron.schedule('0 */3 * * *', () => runNewsScrape(), { timezone: 'Europe/Paris' });
  console.log('[startup] Cron scheduled: news-scrape every 3 hours');
  cron.schedule('*/30 * * * *', () => runBuzzScrape(), { timezone: 'Europe/Paris' });
  console.log('[startup] Cron scheduled: buzz-scrape every 30 minutes');
  // Initial buzz on startup
  runBuzzScrape().catch(e => console.warn('[buzz] Initial scrape error:', e.message));
  // Image migration: download external player/org photos to DB BLOB (50/run, hourly)
  cron.schedule('0 * * * *', () => runImageBlobMigration({ limit: 50 }), { timezone: 'Europe/Paris' });
  console.log('[startup] Cron scheduled: image blob migration every hour');
}

// ── Admin endpoint: cron enrichment logs & manual trigger ───────────────────

app.post("/api/admin/run-image-migration", authMiddleware, async (req, res) => {
  try {
    const [roles] = await pool.query('SELECT role FROM user_roles WHERE user_id = ?', [req.user.id]);
    if (!roles.some(r => r.role === 'admin')) return res.status(403).json({ error: 'Admin only' });
    const limit = Math.min(parseInt(req.body?.limit) || 200, 500);
    runImageBlobMigration({ limit }).catch(() => {});
    return res.json({ ok: true, message: `Migration lancée (limit ${limit})` });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/cron-enrichment-logs", authMiddleware, async (req, res) => {
  try {
    const [roles] = await pool.query('SELECT role FROM user_roles WHERE user_id = ?', [req.user.id]);
    if (!roles.some(r => r.role === 'admin')) return res.status(403).json({ error: 'Admin only' });

    const [logs] = await pool.query(`
      SELECT l.*, u.email AS user_email
      FROM cron_enrichment_logs l
      JOIN users u ON u.id = l.user_id
      ORDER BY l.started_at DESC
      LIMIT 50
    `);
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/cron-enrichment-trigger", authMiddleware, async (req, res) => {
  try {
    const [roles] = await pool.query('SELECT role FROM user_roles WHERE user_id = ?', [req.user.id]);
    if (!roles.some(r => r.role === 'admin')) return res.status(403).json({ error: 'Admin only' });

    // Run in background
    runNightlyEnrichment();
    return res.json({ ok: true, message: 'Enrichissement nocturne lancé manuellement' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ── Cron: inactive-user cleanup ─────────────────────────────────────────────

// Auto-create log table
pool.query(`CREATE TABLE IF NOT EXISTS cron_cleanup_logs (
  id CHAR(36) PRIMARY KEY,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  users_deleted INT NOT NULL DEFAULT 0,
  users_warned INT NOT NULL DEFAULT 0,
  status ENUM('running', 'done', 'failed') NOT NULL DEFAULT 'running',
  error_detail TEXT NULL
)`).catch(() => {});

/**
 * Delete non-admin users inactive for >= 5 years (based on last_sign_in_at,
 * falling back to created_at). Warns users at >= 4 years 11 months via email.
 * Only targets users whose only role is 'user' (never 'admin' or 'superadmin').
 */
async function runInactiveUserCleanup(dryRun = false) {
  const logId = uuidv4();
  await pool.query(
    'INSERT INTO cron_cleanup_logs (id, status) VALUES (?, ?)',
    [logId, 'running']
  );

  let usersDeleted = 0;
  let usersWarned = 0;

  try {
    // Users whose last activity (sign-in or account creation) predates 4y11m ago
    // who have NO admin/superadmin role.
    const [candidates] = await pool.query(`
      SELECT u.id, u.email,
             COALESCE(u.last_sign_in_at, u.created_at) AS last_active
      FROM users u
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles ur
        WHERE ur.user_id = u.id
          AND ur.role IN ('admin', 'superadmin')
      )
      AND COALESCE(u.last_sign_in_at, u.created_at) < DATE_SUB(NOW(), INTERVAL 4 YEAR)
      ORDER BY last_active ASC
    `);

    console.log(`[cron-cleanup] ${candidates.length} candidate(s) found`);

    for (const user of candidates) {
      const lastActive = new Date(user.last_active);
      const now = new Date();
      const monthsInactive = (now - lastActive) / (1000 * 60 * 60 * 24 * 30.44);

      if (monthsInactive >= 60) {
        // >= 5 years: delete
        if (!dryRun) {
          await pool.query('DELETE FROM users WHERE id = ?', [user.id]);
          console.log(`[cron-cleanup] Deleted inactive user ${user.email} (last active: ${lastActive.toISOString().slice(0, 10)})`);
          // Attempt farewell email (best-effort)
          sendEmail(user.email, 'Suppression de votre compte Scouty', `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="color:#6366f1">Compte Scouty supprimé</h2>
              <p>Votre compte Scouty a été automatiquement supprimé suite à 5 ans d'inactivité,
              conformément à notre politique de conservation des données.</p>
              <p>Toutes vos données personnelles ont été effacées de nos serveurs.</p>
              <p>Si vous souhaitez recommencer, vous pouvez créer un nouveau compte gratuitement
              sur <a href="https://scouty.app">scouty.app</a>.</p>
              <p style="color:#aaa;font-size:12px;margin-top:24px">Scouty — Football Scouting CRM</p>
            </div>
          `).catch(() => {});
        }
        usersDeleted++;
      } else if (monthsInactive >= 59) {
        // >= 4y11m: send warning email
        if (!dryRun) {
          const daysLeft = Math.round((60 - monthsInactive) * 30.44);
          sendEmail(user.email, 'Votre compte Scouty sera bientôt supprimé', `
            <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
              <h2 style="color:#f59e0b">Compte Scouty — Avertissement d'inactivité</h2>
              <p>Votre compte Scouty est inactif depuis presque 5 ans.</p>
              <p>Conformément à notre politique de conservation des données, votre compte et
              l'ensemble de vos données seront <strong>définitivement supprimés dans environ
              ${daysLeft} jour(s)</strong>.</p>
              <p>Pour conserver votre compte, il vous suffit de vous connecter :
              <a href="https://scouty.app/auth">scouty.app/auth</a></p>
              <p style="color:#aaa;font-size:12px;margin-top:24px">Scouty — Football Scouting CRM</p>
            </div>
          `).catch(() => {});
          console.log(`[cron-cleanup] Warning email sent to ${user.email} (~${daysLeft}d before deletion)`);
        }
        usersWarned++;
      }
    }

    await pool.query(
      'UPDATE cron_cleanup_logs SET finished_at = NOW(), users_deleted = ?, users_warned = ?, status = ? WHERE id = ?',
      [usersDeleted, usersWarned, 'done', logId]
    );
    console.log(`[cron-cleanup] Done — deleted: ${usersDeleted}, warned: ${usersWarned}${dryRun ? ' (dry-run)' : ''}`);
  } catch (err) {
    await pool.query(
      'UPDATE cron_cleanup_logs SET finished_at = NOW(), status = ?, error_detail = ? WHERE id = ?',
      ['failed', err.message, logId]
    );
    console.error('[cron-cleanup] Fatal error:', err.message);
  }
}

// Schedule: 1st of every month at 03:00 (non-Vercel only)
if (!isVercel && cron) {
  cron.schedule('0 3 1 * *', () => runInactiveUserCleanup(false), { timezone: 'Europe/Paris' });
  console.log('[startup] Cron scheduled: inactive-user cleanup on 1st of month at 03:00 Europe/Paris');
}

// GET /api/admin/cron-cleanup-logs
app.get("/api/admin/cron-cleanup-logs", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [logs] = await pool.query(
      'SELECT * FROM cron_cleanup_logs ORDER BY started_at DESC LIMIT 30'
    );
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/admin/cron-cleanup-trigger — manual trigger (dry_run=true by default from UI)
app.post("/api/admin/cron-cleanup-trigger", authMiddleware, ensureAdmin, async (req, res) => {
  const { dry_run = true } = req.body || {};
  runInactiveUserCleanup(!!dry_run);
  return res.json({ ok: true, dry_run: !!dry_run });
});

// ── Cron: generic job log helper ────────────────────────────────────────────

pool.query(`CREATE TABLE IF NOT EXISTS cron_job_logs (
  id CHAR(36) PRIMARY KEY,
  job_name VARCHAR(50) NOT NULL,
  started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at DATETIME NULL,
  status ENUM('running','done','failed') NOT NULL DEFAULT 'running',
  result_json JSON NULL,
  error_detail TEXT NULL,
  INDEX idx_cjl_job_date (job_name, started_at)
)`).catch(() => {});

async function logJobStart(jobName) {
  const id = uuidv4();
  await pool.query(
    'INSERT INTO cron_job_logs (id, job_name, status) VALUES (?, ?, ?)',
    [id, jobName, 'running']
  );
  return id;
}
async function logJobDone(id, result) {
  await pool.query(
    'UPDATE cron_job_logs SET finished_at = NOW(), status = ?, result_json = ? WHERE id = ?',
    ['done', JSON.stringify(result), id]
  );
}
async function logJobFailed(id, err) {
  await pool.query(
    'UPDATE cron_job_logs SET finished_at = NOW(), status = ?, error_detail = ? WHERE id = ?',
    ['failed', err.message, id]
  );
}

// ── Cron 1: contract-alerts — daily 08:00 ───────────────────────────────────
// Notifies each user in-app (+ email) when a tracked player's contract expires
// in exactly 30 days, 7 days, or has just expired (today).

async function runContractAlerts(dryRun = false) {
  const logId = await logJobStart('contract-alerts');
  let notified = 0;
  try {
    // Fetch all users with their alert_contract_months preference
    const [users] = await pool.query(`
      SELECT id, email, notification_prefs FROM users WHERE is_banned = 0
    `);

    for (const u of users) {
      let prefs = {};
      try { prefs = JSON.parse(u.notification_prefs || '{}'); } catch {}
      const monthsPref = Number(prefs.alert_contract_months ?? 3); // default 3 months
      if (monthsPref === 0) continue; // user disabled contract alerts

      // Calculate the alert thresholds in days for this user
      const thresholdDays = monthsPref * 30;
      // Notify at: thresholdDays, thresholdDays/2 (midpoint), and 0 (expired)
      const checkDays = [...new Set([0, Math.round(thresholdDays / 2), thresholdDays])];

      const [players] = await pool.query(`
        SELECT p.id AS player_id, p.name AS player_name, p.contract_end,
               DATEDIFF(p.contract_end, CURDATE()) AS days_left
        FROM players p
        WHERE p.user_id = ?
          AND p.contract_end IS NOT NULL
          AND p.is_archived = 0
          AND DATEDIFF(p.contract_end, CURDATE()) IN (${checkDays.join(',')})
      `, [u.id]);

      for (const row of players) {
        const daysLeft = row.days_left;
        const months = Math.round(daysLeft / 30);
        const label = daysLeft === 0 ? 'expiré aujourd\'hui'
                    : daysLeft <= 30 ? `expire dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`
                    : `expire dans ${months} mois`;
        const icon = daysLeft === 0 ? 'AlertTriangle' : 'Clock';

        if (!dryRun) {
          await createNotification(u.id, {
            type: 'contract_alert',
            title: `Contrat — ${row.player_name}`,
            message: `Le contrat de ${row.player_name} ${label}.`,
            icon,
            link: `/player/${row.player_id}`,
            playerId: row.player_id,
          });
          if (daysLeft <= 14) {
            sendEmail(u.email,
              `[Scouty] Contrat de ${row.player_name} ${label}`,
              `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
                <h2 style="color:#6366f1">Alerte contrat</h2>
                <p>Le contrat de <strong>${row.player_name}</strong> ${label}
                (${row.contract_end ? new Date(row.contract_end).toLocaleDateString('fr-FR') : ''}).</p>
                <p><a href="https://scouty.app/player/${row.player_id}" style="color:#6366f1">Voir le profil du joueur</a></p>
                <p style="color:#aaa;font-size:12px;margin-top:24px">Scouty — Football Scouting CRM</p>
              </div>`
            ).catch(() => {});
          }
        }
        notified++;
      }
    }

    await logJobDone(logId, { notified, dry_run: dryRun });
    console.log(`[cron-contracts] ${notified} alert(s)${dryRun ? ' (dry-run)' : ''}`);
  } catch (err) {
    await logJobFailed(logId, err);
    console.error('[cron-contracts] Error:', err.message);
  }
}

// ── Cron: report reminders — daily 09:30 ────────────────────────────────────
// Notifies users when a player has no scouting report for X days
async function runReportReminders(dryRun = false) {
  const logId = await logJobStart('report-reminders');
  let notified = 0;
  try {
    const [users] = await pool.query(`SELECT id, notification_prefs FROM users WHERE is_banned = 0`);

    for (const u of users) {
      let prefs = {};
      try { prefs = JSON.parse(u.notification_prefs || '{}'); } catch {}
      const daysPref = Number(prefs.alert_no_report_days ?? 30);
      if (daysPref === 0) continue;

      // Players with no report in the last daysPref days (and not archived)
      const [players] = await pool.query(`
        SELECT p.id, p.name,
               MAX(r.created_at) AS last_report_at,
               DATEDIFF(CURDATE(), COALESCE(MAX(r.created_at), p.created_at)) AS days_since
        FROM players p
        LEFT JOIN reports r ON r.player_id = p.id
        WHERE p.user_id = ?
          AND p.is_archived = 0
        GROUP BY p.id, p.name, p.created_at
        HAVING days_since >= ?
      `, [u.id, daysPref]);

      for (const row of players) {
        if (!dryRun) {
          await createNotification(u.id, {
            type: 'report_reminder',
            title: `Rapport — ${row.name}`,
            message: `Aucun rapport pour ${row.name} depuis ${row.days_since} jours.`,
            icon: 'FileText',
            link: `/player/${row.id}`,
            playerId: row.id,
          });
        }
        notified++;
      }
    }

    await logJobDone(logId, { notified, dry_run: dryRun });
    console.log(`[cron-report-reminders] ${notified} reminder(s)${dryRun ? ' (dry-run)' : ''}`);
  } catch (err) {
    await logJobFailed(logId, err);
    console.error('[cron-report-reminders] Error:', err.message);
  }
}

// ── Cron 2: match-reminders — daily 07:00 ───────────────────────────────────
// Sends in-app + email reminder for matches scheduled tomorrow.

async function runMatchReminders(dryRun = false) {
  const logId = await logJobStart('match-reminders');
  let sent = 0;
  try {
    // Matches planned for tomorrow (assigned to a specific user or owned by user)
    const [matches] = await pool.query(`
      SELECT ma.id, ma.home_team, ma.away_team, ma.match_date, ma.match_time,
             ma.competition, ma.venue,
             COALESCE(ma.assigned_to, ma.user_id) AS notify_user_id,
             u.email AS user_email
      FROM match_assignments ma
      JOIN users u ON u.id = COALESCE(ma.assigned_to, ma.user_id)
      WHERE ma.match_date = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
        AND ma.status = 'planned'
    `);

    for (const m of matches) {
      const timeStr = m.match_time ? ` à ${m.match_time}` : '';
      const venueStr = m.venue ? ` — ${m.venue}` : '';
      const title = `${m.home_team} vs ${m.away_team}`;
      const message = `Match demain${timeStr}${venueStr}${m.competition ? ` (${m.competition})` : ''}.`;

      if (!dryRun) {
        await createNotification(m.notify_user_id, {
          type: 'match_reminder',
          title: `Rappel match : ${title}`,
          message,
          icon: 'CalendarDays',
          link: `/my-matches`,
        });
        sendEmail(m.user_email,
          `[Scouty] Rappel : ${title} demain`,
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#6366f1">Rappel de match</h2>
            <p>Vous avez un match prévu <strong>demain</strong> :</p>
            <p style="font-size:18px;font-weight:bold">${title}</p>
            <p>${m.competition ? `Compétition : ${m.competition}<br>` : ''}
               ${m.match_time ? `Heure : ${m.match_time}<br>` : ''}
               ${m.venue ? `Lieu : ${m.venue}` : ''}</p>
            <p><a href="https://scouty.app/my-matches" style="color:#6366f1">Voir mes matchs</a></p>
            <p style="color:#aaa;font-size:12px;margin-top:24px">Scouty — Football Scouting CRM</p>
          </div>`
        ).catch(() => {});
      }
      sent++;
    }

    await logJobDone(logId, { sent, dry_run: dryRun });
    console.log(`[cron-reminders] ${sent} reminder(s)${dryRun ? ' (dry-run)' : ''}`);
  } catch (err) {
    await logJobFailed(logId, err);
    console.error('[cron-reminders] Error:', err.message);
  }
}

// ── Cron 3: token-cleanup — daily 04:30 ─────────────────────────────────────
// Purges expired tokens, stale 2FA codes, old notifications, old cache entries.

async function runTokenCleanup() {
  const logId = await logJobStart('token-cleanup');
  try {
    const [r1] = await pool.query('DELETE FROM password_reset_tokens WHERE expires_at < NOW()');
    const [r2] = await pool.query(
      'UPDATE users SET email_2fa_code = NULL, email_2fa_expires_at = NULL WHERE email_2fa_expires_at < NOW()'
    );
    const [r3] = await pool.query(
      'DELETE FROM notifications WHERE created_at < DATE_SUB(NOW(), INTERVAL 90 DAY)'
    );
    const [r4] = await pool.query(
      'DELETE FROM api_football_cache WHERE expires_at < DATE_SUB(NOW(), INTERVAL 7 DAY)'
    );
    const result = {
      reset_tokens: r1.affectedRows,
      stale_2fa: r2.affectedRows,
      old_notifications: r3.affectedRows,
      old_cache: r4.affectedRows,
    };
    await logJobDone(logId, result);
    console.log('[cron-cleanup-tokens]', result);
  } catch (err) {
    await logJobFailed(logId, err);
    console.error('[cron-cleanup-tokens] Error:', err.message);
  }
}

// ── Cron 4: subscription-expiry — daily 09:00 ───────────────────────────────
// Warns users whose subscription ends in exactly 7 days (D-7 alert).

async function runSubscriptionExpiryAlerts(dryRun = false) {
  const logId = await logJobStart('subscription-expiry');
  let warned = 0;
  try {
    const [subs] = await pool.query(`
      SELECT us.user_id, us.plan_type, us.subscription_end,
             u.email AS user_email
      FROM user_subscriptions us
      JOIN users u ON u.id = us.user_id
      WHERE us.is_premium = 1
        AND us.subscription_end IS NOT NULL
        AND DATEDIFF(us.subscription_end, CURDATE()) = 7
    `);

    for (const sub of subs) {
      const planLabel = sub.plan_type === 'pro' ? 'Pro' : sub.plan_type === 'elite' ? 'Elite' : 'Premium';
      const endDate = new Date(sub.subscription_end).toLocaleDateString('fr-FR');

      if (!dryRun) {
        await createNotification(sub.user_id, {
          type: 'subscription_expiry',
          title: `Votre abonnement ${planLabel} expire dans 7 jours`,
          message: `Date d'expiration : ${endDate}. Renouvelez pour conserver l'accès.`,
          icon: 'Crown',
          link: '/account',
        });
        sendEmail(sub.user_email,
          `[Scouty] Votre abonnement ${planLabel} expire dans 7 jours`,
          `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px">
            <h2 style="color:#6366f1">Renouvellement d'abonnement</h2>
            <p>Votre abonnement <strong>${planLabel}</strong> expire le <strong>${endDate}</strong>.</p>
            <p>Pour continuer à profiter de toutes les fonctionnalités Scouty, renouvelez votre abonnement dès maintenant.</p>
            <p><a href="https://scouty.app/pricing" style="display:inline-block;background:#6366f1;color:#fff;padding:10px 20px;border-radius:8px;text-decoration:none">Renouveler mon abonnement</a></p>
            <p style="color:#aaa;font-size:12px;margin-top:24px">Scouty — Football Scouting CRM</p>
          </div>`
        ).catch(() => {});
      }
      warned++;
    }

    await logJobDone(logId, { warned, dry_run: dryRun });
    console.log(`[cron-sub-expiry] ${warned} warning(s)${dryRun ? ' (dry-run)' : ''}`);
  } catch (err) {
    await logJobFailed(logId, err);
    console.error('[cron-sub-expiry] Error:', err.message);
  }
}

// ── StatsBomb watchlist form alerts ──────────────────────────────────────────
async function runWatchlistFormAlerts() {
  const logId = await logJobStart('sb-form-alerts');
  let sent = 0;
  try {
    // All users with at least one watchlist player
    const [users] = await pool.query(`
      SELECT DISTINCT w.user_id
      FROM watchlists w
      JOIN watchlist_players wp ON wp.watchlist_id = w.id
    `);

    for (const u of users) {
      // Get their watchlisted player names
      const [wlPlayers] = await pool.query(`
        SELECT DISTINCT p.id AS player_id, p.name
        FROM players p
        JOIN watchlist_players wp ON wp.player_id = p.id
        JOIN watchlists w ON w.id = wp.watchlist_id
        WHERE w.user_id = ? AND p.is_archived = 0
        LIMIT 50
      `, [u.user_id]);

      for (const player of wlPlayers) {
        // Find in StatsBomb (fuzzy match)
        const [sbMatches] = await pool.query(
          `SELECT player_id, player_name FROM sb_players
           WHERE player_name LIKE ? LIMIT 1`,
          [`%${player.name.split(' ').slice(-1)[0]}%`] // match on last name
        );
        if (!sbMatches.length) continue;

        const sbPid = sbMatches[0].player_id;
        const sbName = sbMatches[0].player_name;

        // Last 3 matches stats
        const [recent] = await pool.query(`
          SELECT xg, goals, match_date FROM sb_player_match_stats
          WHERE player_id = ? ORDER BY match_date DESC LIMIT 3
        `, [sbPid]);
        if (recent.length < 2) continue;

        // All-time average
        const [[avg]] = await pool.query(
          `SELECT AVG(xg) as avg_xg FROM sb_player_match_stats WHERE player_id = ?`,
          [sbPid]
        );
        const seasonAvg = parseFloat(avg.avg_xg) || 0;
        const recentAvg = recent.reduce((s, r) => s + parseFloat(r.xg), 0) / recent.length;

        // En forme: recent average >= 1.5x career average AND >= 0.25
        if (seasonAvg < 0.05 || recentAvg < seasonAvg * 1.5 || recentAvg < 0.25) continue;

        // Dedup: skip if similar notification sent in last 7 days
        const [[existing]] = await pool.query(
          `SELECT id FROM notifications WHERE user_id = ? AND player_id = ? AND type = 'form_alert'
           AND created_at > DATE_SUB(NOW(), INTERVAL 7 DAY) LIMIT 1`,
          [u.user_id, player.player_id]
        );
        if (existing) continue;

        await createNotification(u.user_id, {
          type: 'form_alert',
          title: `⚡ ${sbName} est en forme`,
          message: `xG moyen sur les ${recent.length} derniers matchs : ${recentAvg.toFixed(2)} (moyenne : ${seasonAvg.toFixed(2)}/match)`,
          icon: 'trending-up',
          link: `/player/${player.player_id}`,
          playerId: player.player_id,
        });
        sent++;
      }
    }
    await logJobSuccess(logId, { sent });
    console.log(`[sb-form-alerts] ${sent} notifications envoyées`);
  } catch (err) {
    await logJobError(logId, err);
    console.error('[sb-form-alerts]', err?.message);
  }
}

// ── Cron schedules (non-Vercel only) ────────────────────────────────────────

if (!isVercel && cron) {
  cron.schedule('0 7 * * *',   () => runMatchReminders(false),            { timezone: 'Europe/Paris' });
  cron.schedule('0 8 * * *',   () => runContractAlerts(false),            { timezone: 'Europe/Paris' });
  cron.schedule('30 9 * * *',  () => runReportReminders(false),           { timezone: 'Europe/Paris' });
  cron.schedule('30 4 * * *',  runTokenCleanup,                           { timezone: 'Europe/Paris' });
  cron.schedule('0 9 * * *',   () => runSubscriptionExpiryAlerts(false),  { timezone: 'Europe/Paris' });
  // StatsBomb weekly sync — every Monday at 03:00, incremental (skips if SHA unchanged)
  cron.schedule('0 3 * * 1', () => runStatsBombSyncJob(false), { timezone: 'Europe/Paris' });
  // StatsBomb form alerts — every Wednesday at 09:00
  cron.schedule('0 9 * * 3', () => runWatchlistFormAlerts(), { timezone: 'Europe/Paris' });
  console.log('[startup] Crons scheduled: match-reminders 07:00 | contract-alerts 08:00 | report-reminders 09:30 | token-cleanup 04:30 | sub-expiry 09:00 | statsbomb-sync Mon 03:00 | form-alerts Wed 09:00');
}

// ── StatsBomb sync job wrapper (logs to cron_job_logs) ───────────────────────
// sbImportRunning declared near /api/admin/statsbomb/import — shared to prevent concurrent runs
async function runStatsBombSyncJob(force = false) {
  if (sbImportRunning) return;
  sbImportRunning = true;
  const logId = await logJobStart('sb-sync');
  try {
    const { runStatsBombImport } = await import('./statsbomb-import.js');
    const result = await runStatsBombImport({ force });
    await logJobDone(logId, result);
    console.log(`[cron/statsbomb] done`, result);
  } catch (e) {
    await logJobFailed(logId, e);
    console.error('[cron/statsbomb]', e?.message);
  } finally {
    sbImportRunning = false;
  }
}

// ── Admin: cron job logs & manual triggers ───────────────────────────────────

app.get("/api/admin/cron-job-logs", authMiddleware, ensureAdmin, async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT * FROM cron_job_logs ORDER BY started_at DESC LIMIT 100`
    );
    return res.json({ logs });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// Tracks which cron jobs are currently executing to prevent concurrent runs
const _runningCronJobs = new Set();

function runCronJobGuarded(jobKey, fn) {
  if (_runningCronJobs.has(jobKey)) return false; // already running
  _runningCronJobs.add(jobKey);
  Promise.resolve().then(fn).finally(() => _runningCronJobs.delete(jobKey));
  return true;
}

app.post("/api/admin/cron-trigger", authMiddleware, ensureAdmin, async (req, res) => {
  const { job, dry_run = true } = req.body || {};
  const jobs = {
    'contract-alerts':    () => runContractAlerts(!!dry_run),
    'match-reminders':    () => runMatchReminders(!!dry_run),
    'report-reminders':   () => runReportReminders(!!dry_run),
    'token-cleanup':      () => runTokenCleanup(),
    'subscription-expiry':() => runSubscriptionExpiryAlerts(!!dry_run),
    'nightly-enrichment': () => runNightlyEnrichment(),
    'inactive-cleanup':   () => runInactiveUserCleanup(!!dry_run),
    'buzz-scrape':        () => runBuzzScrape(),
    'news-scrape':        () => runNewsScrape(),
    'sb-form-alerts':     () => runWatchlistFormAlerts(),
    'sb-sync':            () => runStatsBombSyncJob(true),
  };
  if (!jobs[job]) return res.status(400).json({ error: 'Unknown job' });
  const started = runCronJobGuarded(job, jobs[job]);
  if (!started) {
    return res.status(409).json({ error: 'already_running', message: 'Cette tâche est déjà en cours d\'exécution. Attendez qu\'elle se termine avant de la relancer.' });
  }
  return res.json({ ok: true, job, dry_run: !!dry_run });
});

// ── External cron trigger ──────────────────────────────────────────────────
// Same job catalog as /api/admin/cron-trigger but authenticated by a shared
// secret instead of a logged-in admin session — designed for Vercel Cron Jobs
// (which sends `Authorization: Bearer ${CRON_SECRET}` automatically) or any
// external scheduler. node-cron in server/index.js only runs when the dev
// server is alive, so on Vercel (serverless) it never fires; this endpoint
// is the production replacement.
//
// CRON_SECRET must be set in env. If missing, the endpoint refuses every call.
app.post("/api/cron/:job", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return res.status(503).json({ error: 'CRON_SECRET not configured on server' });
  }
  const auth = req.headers.authorization || '';
  const provided = auth.startsWith('Bearer ') ? auth.slice(7) : (req.headers['x-cron-secret'] || '');
  if (provided !== secret) {
    return res.status(401).json({ error: 'Invalid cron secret' });
  }
  const jobs = {
    'nightly-enrichment': () => runNightlyEnrichment(),
    'contract-alerts':    () => runContractAlerts(false),
    'match-reminders':    () => runMatchReminders(false),
    'report-reminders':   () => runReportReminders(false),
    'token-cleanup':      () => runTokenCleanup(),
    'subscription-expiry':() => runSubscriptionExpiryAlerts(false),
    'inactive-cleanup':   () => runInactiveUserCleanup(false),
    'buzz-scrape':        () => runBuzzScrape(),
    'news-scrape':        () => runNewsScrape(),
    'image-migration':    () => runImageBlobMigration({ limit: 50 }),
    'sb-form-alerts':     () => runWatchlistFormAlerts(),
    'sb-sync':            () => runStatsBombSyncJob(false),
  };
  const job = req.params.job;
  if (!jobs[job]) return res.status(400).json({ error: 'Unknown job', known: Object.keys(jobs) });
  const started = runCronJobGuarded(job, jobs[job]);
  if (!started) {
    return res.status(409).json({ error: 'already_running' });
  }
  console.log(`[cron-external] job=${job} triggered`);
  return res.json({ ok: true, job, startedAt: new Date().toISOString() });
});

// ── User integrations (Perplexity / Pappers / Drop Contact) ─────────────────

pool.query(`CREATE TABLE IF NOT EXISTS user_integrations (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  service VARCHAR(50) NOT NULL,
  api_key TEXT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 0,
  last_tested_at DATETIME NULL,
  test_status VARCHAR(20) NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_service (user_id, service),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`).catch(() => {});

const ALLOWED_SERVICES = new Set(['perplexity', 'pappers', 'dropcontact', 'socialdata']);

// GET /api/integrations — list user's integrations (keys masked)
app.get('/api/integrations', authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT service, enabled, last_tested_at, test_status, CASE WHEN api_key IS NOT NULL THEN 1 ELSE 0 END AS has_key FROM user_integrations WHERE user_id = ?',
      [req.user.id]
    );
    return res.json(rows);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// POST /api/integrations/:service — save key + enabled state
app.post('/api/integrations/:service', authMiddleware, async (req, res) => {
  const { service } = req.params;
  if (!ALLOWED_SERVICES.has(service)) return res.status(400).json({ error: 'Unknown service' });
  const { api_key, enabled } = req.body ?? {};
  try {
    await pool.query(
      `INSERT INTO user_integrations (id, user_id, service, api_key, enabled)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         api_key = COALESCE(NULLIF(?, ''), api_key),
         enabled = ?,
         updated_at = NOW()`,
      [uuidv4(), req.user.id, service, api_key || null, enabled ? 1 : 0, api_key || null, enabled ? 1 : 0]
    );
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// DELETE /api/integrations/:service — remove key
app.delete('/api/integrations/:service', authMiddleware, async (req, res) => {
  const { service } = req.params;
  if (!ALLOWED_SERVICES.has(service)) return res.status(400).json({ error: 'Unknown service' });
  try {
    await pool.query('DELETE FROM user_integrations WHERE user_id = ? AND service = ?', [req.user.id, service]);
    return res.json({ ok: true });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

// POST /api/integrations/:service/test — test API key connection
app.post('/api/integrations/:service/test', authMiddleware, async (req, res) => {
  const { service } = req.params;
  if (!ALLOWED_SERVICES.has(service)) return res.status(400).json({ error: 'Unknown service' });
  try {
    const [rows] = await pool.query('SELECT api_key FROM user_integrations WHERE user_id = ? AND service = ?', [req.user.id, service]);
    const key = rows[0]?.api_key;
    if (!key) return res.status(400).json({ error: 'no_key' });

    let ok = false;
    if (service === 'perplexity') {
      const r = await fetch('https://api.perplexity.ai/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'sonar', messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      });
      ok = r.status < 500;
    } else if (service === 'pappers') {
      const r = await fetch(`https://api.pappers.fr/v2/entreprise?api_token=${encodeURIComponent(key)}&siren=siren`);
      ok = r.status !== 401 && r.status !== 403;
    } else if (service === 'dropcontact') {
      const r = await fetch('https://api.dropcontact.com/b2b/v2/enrich', {
        method: 'POST',
        headers: { 'X-Access-Token': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: [{ first_name: 'Test', last_name: 'Scout' }], siren: false }),
      });
      ok = r.status !== 401 && r.status !== 403;
    } else if (service === 'socialdata') {
      const r = await fetch('https://api.socialdata.tools/twitter/search?query=football&type=Latest&count=1', {
        headers: { Authorization: `Bearer ${key}`, 'Accept': 'application/json' },
      });
      ok = r.status === 200;
    }

    await pool.query(
      'UPDATE user_integrations SET last_tested_at = NOW(), test_status = ? WHERE user_id = ? AND service = ?',
      [ok ? 'ok' : 'error', req.user.id, service]
    );
    return res.json({ ok });
  } catch (err) {
    await pool.query('UPDATE user_integrations SET last_tested_at = NOW(), test_status = ? WHERE user_id = ? AND service = ?', ['error', req.user.id, req.params.service]).catch(() => {});
    return res.status(500).json({ error: err.message });
  }
});

// POST /api/integrations/enrich/:playerId — enrich a player via all active modules
app.post('/api/integrations/enrich/:playerId', authMiddleware, async (req, res) => {
  const { playerId } = req.params;
  const { services } = req.body ?? {}; // optional array to limit which services to use

  try {
    // Check player belongs to user (or shared)
    const [pRows] = await pool.query('SELECT * FROM players WHERE id = ? AND user_id = ?', [playerId, req.user.id]);
    if (!pRows.length) return res.status(404).json({ error: 'Player not found' });
    const player = pRows[0];

    // Get active integrations
    const [integrations] = await pool.query(
      'SELECT service, api_key FROM user_integrations WHERE user_id = ? AND enabled = 1 AND api_key IS NOT NULL',
      [req.user.id]
    );
    const activeMap = Object.fromEntries(integrations.map(i => [i.service, i.api_key]));
    const toRun = services ? integrations.filter(i => services.includes(i.service)) : integrations;
    if (!toRun.length) return res.json({ ok: true, results: {} });

    const results = {};
    const externalData = typeof player.external_data === 'string'
      ? JSON.parse(player.external_data || '{}')
      : (player.external_data ?? {});

    // ── Perplexity: AI research on the player ──
    if (activeMap.perplexity && (!services || services.includes('perplexity'))) {
      try {
        const r = await fetch('https://api.perplexity.ai/chat/completions', {
          method: 'POST',
          headers: { Authorization: `Bearer ${activeMap.perplexity}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'sonar',
            messages: [{
              role: 'user',
              content: `Tu es un assistant de scouting football. Donne-moi en 3-4 phrases maximum les informations les plus récentes sur le joueur ${player.name}${player.club ? ` (${player.club})` : ''}${player.nationality ? `, nationalité ${player.nationality}` : ''} : contrat actuel, statistiques saison en cours, actualités transferts ou blessures. Sois factuel, en français, sans introduction.`,
            }],
            search_recency_filter: 'month',
            max_tokens: 300,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const summary = data.choices?.[0]?.message?.content ?? '';
          if (summary) {
            externalData.perplexity_summary = summary;
            externalData.perplexity_updated_at = new Date().toISOString();
            results.perplexity = { ok: true, summary };
          }
        } else { results.perplexity = { ok: false, status: r.status }; }
      } catch (e) { results.perplexity = { ok: false, error: e.message }; }
    }

    // ── Pappers: legal data for the player's club ──
    if (activeMap.pappers && (!services || services.includes('pappers')) && player.club) {
      try {
        const r = await fetch(`https://api.pappers.fr/v2/recherche?q=${encodeURIComponent(player.club)}&api_token=${encodeURIComponent(activeMap.pappers)}&type_entreprise=SA,SAS,SARL&nombre=1`);
        if (r.ok) {
          const data = await r.json();
          const company = data.resultats?.[0];
          if (company) {
            externalData.pappers_club = {
              nom: company.nom_entreprise ?? company.nom,
              siren: company.siren,
              siege: company.siege?.adresse_ligne_1,
              date_creation: company.date_creation,
              dirigeant: company.representants?.[0]?.nom_complet,
            };
            externalData.pappers_updated_at = new Date().toISOString();
            results.pappers = { ok: true, company: externalData.pappers_club };
          } else { results.pappers = { ok: true, found: false }; }
        } else { results.pappers = { ok: false, status: r.status }; }
      } catch (e) { results.pappers = { ok: false, error: e.message }; }
    }

    // ── Drop Contact: find contact info for the player (by name) ──
    if (activeMap.dropcontact && (!services || services.includes('dropcontact'))) {
      try {
        const nameParts = (player.name ?? '').split(' ');
        const firstName = nameParts[0] ?? '';
        const lastName = nameParts.slice(1).join(' ') ?? '';
        const r = await fetch('https://api.dropcontact.com/b2b/v2/enrich', {
          method: 'POST',
          headers: { 'X-Access-Token': activeMap.dropcontact, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            data: [{ first_name: firstName, last_name: lastName, company: player.club || '' }],
            siren: false,
          }),
        });
        if (r.ok) {
          const data = await r.json();
          const contact = data.data?.[0];
          if (contact?.email?.length) {
            externalData.dropcontact = {
              email: contact.email[0]?.email,
              confidence: contact.email[0]?.qualification,
              found_at: new Date().toISOString(),
            };
            results.dropcontact = { ok: true, email: externalData.dropcontact.email };
          } else { results.dropcontact = { ok: true, found: false }; }
        } else { results.dropcontact = { ok: false, status: r.status }; }
      } catch (e) { results.dropcontact = { ok: false, error: e.message }; }
    }

    // Save enriched external_data back
    await pool.query(
      'UPDATE players SET external_data = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
      [JSON.stringify(externalData), playerId, req.user.id]
    );

    // Consume 1 credit per active module used
    const successCount = Object.values(results).filter(r => r.ok).length;
    if (successCount > 0) {
      pool.query(
        'INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description) VALUES (?, ?, ?, ?, ?, ?)',
        [uuidv4(), req.user.id, 'module_enrichment', 'spend', successCount, `Modules: ${Object.keys(results).join(', ')}`]
      ).catch(() => {});
    }

    return res.json({ ok: true, results });
  } catch (err) {
    console.error('[integrations/enrich] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Editorial Articles ────────────────────────────────────────────────────────
pool.query(`CREATE TABLE IF NOT EXISTS editorial_articles (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(500) NOT NULL,
  slug VARCHAR(500) NOT NULL,
  content LONGTEXT NOT NULL,
  banner_url TEXT NULL,
  keywords JSON NULL,
  status ENUM('draft','published','archived') NOT NULL DEFAULT 'draft',
  views INT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_editorial_slug (slug(191)),
  INDEX idx_editorial_user (user_id),
  INDEX idx_editorial_status (status, created_at),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)`).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] editorial_articles table:', err?.message); });
pool.query("ALTER TABLE editorial_articles ADD COLUMN lang VARCHAR(10) NULL").catch(err => { if (err.errno !== 1060) console.warn('[warn] editorial lang col:', err?.message); });
pool.query("ALTER TABLE custom_fields ADD COLUMN field_hint TEXT NULL").catch(err => { if (err.errno !== 1060) console.warn('[warn] custom_fields field_hint col:', err?.message); });
pool.query("ALTER TABLE custom_fields ADD COLUMN applies_to_all TINYINT(1) NOT NULL DEFAULT 1").catch(err => { if (err.errno !== 1060) console.warn('[warn] custom_fields applies_to_all col:', err?.message); });

function hasEditorialRole(roles) {
  return roles.some(r => ['admin','rédacteur','redacteur','editeur','éditeur'].includes(r.toLowerCase()));
}

function editorialSlugify(str) {
  return str.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 120);
}

app.get("/api/editorial", authMiddleware, async (req, res) => {
  try {
    const { filter = 'published', search, limit = 20, offset = 0 } = req.query;
    const [roleRows] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
    const roles = roleRows.map(r => r.role);
    const isAdmin = roles.includes('admin');

    const where = [];
    const params = [];
    if (filter === 'mine') {
      where.push("ea.user_id = ?"); params.push(req.user.id);
    } else if (filter === 'all' && isAdmin) {
      // no filter
    } else {
      where.push("(ea.status = 'published' OR ea.user_id = ?)"); params.push(req.user.id);
    }
    if (search) {
      where.push("(ea.title LIKE ? OR JSON_SEARCH(ea.keywords, 'one', ?) IS NOT NULL)");
      params.push(`%${search}%`, search);
    }
    const whereStr = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM editorial_articles ea ${whereStr}`, params);
    const [articles] = await pool.query(
      `SELECT ea.id, ea.title, ea.slug, ea.banner_url, ea.keywords, ea.status, ea.views, ea.created_at, ea.updated_at,
              ea.user_id, u.email as author_email,
              COALESCE(p.full_name, u.email) as author_name, p.photo_url as author_photo
       FROM editorial_articles ea
       LEFT JOIN users u ON u.id = ea.user_id
       LEFT JOIN profiles p ON p.user_id = ea.user_id
       ${whereStr} ORDER BY ea.created_at DESC LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), parseInt(offset)]
    );
    return res.json({ articles, total });
  } catch (err) {
    console.error("[editorial] list error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Public share endpoint — no auth required, published articles only ────────
app.get("/api/public/editorial/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ea.id, ea.title, ea.content, ea.banner_url, ea.keywords,
              ea.status, ea.views, ea.created_at, ea.user_id,
              COALESCE(p.full_name, u.email) AS author_name,
              p.photo_url AS author_photo
       FROM editorial_articles ea
       LEFT JOIN users u ON u.id = ea.user_id
       LEFT JOIN profiles p ON p.user_id = ea.user_id
       WHERE ea.id = ? AND ea.status = 'published'`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Article introuvable ou non publié" });
    // Increment views (non-blocking)
    pool.query("UPDATE editorial_articles SET views = views + 1 WHERE id = ?", [req.params.id]).catch(() => {});
    res.set('Cache-Control', 'public, max-age=300'); // 5 min
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.get("/api/editorial/:id", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT ea.*, u.email as author_email,
              COALESCE(p.full_name, u.email) as author_name, p.photo_url as author_photo
       FROM editorial_articles ea
       LEFT JOIN users u ON u.id = ea.user_id
       LEFT JOIN profiles p ON p.user_id = ea.user_id
       WHERE ea.id = ?`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: "Article introuvable" });

    // Draft articles are only visible to their author or admins
    const article = rows[0];
    if (article.status !== 'published' && article.user_id !== req.user.id && !req.user.isAdmin) {
      return res.status(403).json({ error: "Accès non autorisé" });
    }

    if (article.status === 'published') {
      pool.query("UPDATE editorial_articles SET views = views + 1 WHERE id = ?", [req.params.id]).catch(() => {});
    }
    return res.json(article);
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.post("/api/editorial", authMiddleware, async (req, res) => {
  const [roleRows] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
  if (!hasEditorialRole(roleRows.map(r => r.role))) return res.status(403).json({ error: "Rôle rédacteur requis." });
  const { title, content, banner_url, keywords, status = 'draft', lang } = req.body || {};
  if (!title?.trim() || !content?.trim()) return res.status(400).json({ error: "Titre et contenu requis." });
  try {
    const id = uuidv4();
    let slug = editorialSlugify(title);
    const [ex] = await pool.query("SELECT id FROM editorial_articles WHERE slug = ?", [slug]);
    if (ex.length) slug = `${slug}-${Date.now()}`;
    await pool.query(
      `INSERT INTO editorial_articles (id, user_id, title, slug, content, banner_url, keywords, lang, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.user.id, title.trim(), slug, content, banner_url || null,
       keywords ? JSON.stringify(keywords) : null, lang || null, status]
    );
    const [rows] = await pool.query("SELECT * FROM editorial_articles WHERE id = ?", [id]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("[editorial] create error:", err);
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.put("/api/editorial/:id", authMiddleware, async (req, res) => {
  const [roleRows] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
  const roles = roleRows.map(r => r.role);
  const isAdmin = roles.includes('admin');
  try {
    const [rows] = await pool.query("SELECT user_id FROM editorial_articles WHERE id = ?", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Article introuvable" });
    if (rows[0].user_id !== req.user.id && !isAdmin) return res.status(403).json({ error: "Accès refusé" });
    const { title, content, banner_url, keywords, status, lang } = req.body || {};
    const updates = {};
    if (title !== undefined) updates.title = title.trim();
    if (content !== undefined) updates.content = content;
    if (banner_url !== undefined) updates.banner_url = banner_url || null;
    if (keywords !== undefined) updates.keywords = JSON.stringify(keywords);
    if (status !== undefined) updates.status = status;
    if (lang !== undefined) updates.lang = lang || null;
    if (!Object.keys(updates).length) return res.json(rows[0]);
    const setClauses = Object.keys(updates).map(k => `\`${k}\` = ?`).join(', ');
    await pool.query(`UPDATE editorial_articles SET ${setClauses} WHERE id = ?`, [...Object.values(updates), req.params.id]);
    const [updated] = await pool.query("SELECT * FROM editorial_articles WHERE id = ?", [req.params.id]);
    return res.json(updated[0]);
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

app.delete("/api/editorial/:id", authMiddleware, async (req, res) => {
  const [roleRows] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
  const roles = roleRows.map(r => r.role);
  const isAdmin = roles.includes('admin');
  try {
    const [rows] = await pool.query("SELECT user_id FROM editorial_articles WHERE id = ?", [req.params.id]);
    if (!rows[0]) return res.status(404).json({ error: "Article introuvable" });
    if (rows[0].user_id !== req.user.id && !isAdmin) return res.status(403).json({ error: "Accès refusé" });
    await pool.query("DELETE FROM editorial_articles WHERE id = ?", [req.params.id]);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── Editorial reactions (like / dislike) ─────────────────────────────────────
// Table created via _legacyRunMigrations — see migration block above

// GET /api/editorial/:id/reactions — counts + current user's reaction
app.get("/api/editorial/:id/reactions", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const [[counts]] = await pool.query(
      `SELECT
         SUM(reaction = 'like') AS likes,
         SUM(reaction = 'dislike') AS dislikes
       FROM editorial_reactions WHERE article_id = ?`,
      [id]
    );
    const [[mine]] = await pool.query(
      `SELECT reaction FROM editorial_reactions WHERE article_id = ? AND user_id = ?`,
      [id, req.user.id]
    );
    return res.json({
      likes: +(counts?.likes || 0),
      dislikes: +(counts?.dislikes || 0),
      user_reaction: mine?.reaction || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// POST /api/editorial/:id/react — toggle like or dislike
app.post("/api/editorial/:id/react", authMiddleware, async (req, res) => {
  try {
    const { id } = req.params;
    const { reaction } = req.body; // 'like' | 'dislike'
    if (!['like', 'dislike'].includes(reaction)) {
      return res.status(400).json({ error: "Réaction invalide." });
    }
    // Check article exists
    const [[art]] = await pool.query('SELECT id FROM editorial_articles WHERE id = ?', [id]);
    if (!art) return res.status(404).json({ error: "Article introuvable." });

    const [[existing]] = await pool.query(
      'SELECT reaction FROM editorial_reactions WHERE user_id = ? AND article_id = ?',
      [req.user.id, id]
    );

    if (existing?.reaction === reaction) {
      // Same reaction → remove (toggle off)
      await pool.query('DELETE FROM editorial_reactions WHERE user_id = ? AND article_id = ?', [req.user.id, id]);
    } else {
      // Insert or replace with new reaction
      await pool.query(
        `INSERT INTO editorial_reactions (user_id, article_id, reaction)
         VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE reaction = VALUES(reaction), created_at = NOW()`,
        [req.user.id, id, reaction]
      );
    }

    const [[counts]] = await pool.query(
      `SELECT SUM(reaction = 'like') AS likes, SUM(reaction = 'dislike') AS dislikes
       FROM editorial_reactions WHERE article_id = ?`,
      [id]
    );
    const [[mine]] = await pool.query(
      'SELECT reaction FROM editorial_reactions WHERE article_id = ? AND user_id = ?',
      [id, req.user.id]
    );
    return res.json({
      likes: +(counts?.likes || 0),
      dislikes: +(counts?.dislikes || 0),
      user_reaction: mine?.reaction || null,
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

app.post("/api/editorial/banner", authMiddleware, upload.single("file"), async (req, res) => {
  const [roleRows] = await pool.query("SELECT role FROM user_roles WHERE user_id = ?", [req.user.id]);
  if (!hasEditorialRole(roleRows.map(r => r.role))) return res.status(403).json({ error: "Accès refusé" });
  if (!req.file) return res.status(400).json({ error: "Fichier requis" });
  try {
    const imageId = uuidv4();
    const bannerUrl = await saveImageToDb(req.file.path, imageId, req.file.mimetype);
    return res.json({ url: bannerUrl });
  } catch (err) {
    return res.status(500).json({ error: "Erreur serveur" });
  }
});

// ── StatsBomb tables (created at startup, idempotent) ─────────────────────────
for (const sql of [
  `CREATE TABLE IF NOT EXISTS sb_import_log (
    id INT AUTO_INCREMENT PRIMARY KEY,
    commit_sha CHAR(40) NOT NULL,
    status ENUM('running','done','failed') NOT NULL DEFAULT 'running',
    competitions_imported INT NOT NULL DEFAULT 0,
    matches_imported INT NOT NULL DEFAULT 0,
    players_imported INT NOT NULL DEFAULT 0,
    started_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    finished_at DATETIME NULL,
    error_message TEXT NULL,
    INDEX idx_sb_import_sha (commit_sha)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sb_competitions (
    competition_id INT NOT NULL, season_id INT NOT NULL,
    competition_name VARCHAR(100) NOT NULL, season_name VARCHAR(50) NOT NULL,
    country_name VARCHAR(100) NULL, competition_gender VARCHAR(20) NOT NULL DEFAULT 'male',
    PRIMARY KEY (competition_id, season_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sb_teams (
    team_id INT PRIMARY KEY, team_name VARCHAR(150) NOT NULL, country VARCHAR(100) NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sb_players (
    player_id INT PRIMARY KEY, player_name VARCHAR(150) NOT NULL,
    player_nickname VARCHAR(150) NULL, country VARCHAR(100) NULL,
    INDEX idx_sb_player_name (player_name(50))
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sb_matches (
    match_id INT PRIMARY KEY, competition_id INT NOT NULL, season_id INT NOT NULL,
    match_date DATE NOT NULL, kick_off TIME NULL,
    home_team_id INT NOT NULL, away_team_id INT NOT NULL,
    home_score TINYINT UNSIGNED NULL, away_score TINYINT UNSIGNED NULL,
    stadium_name VARCHAR(150) NULL, competition_stage VARCHAR(100) NULL,
    match_week TINYINT UNSIGNED NULL, has_360 TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_sb_matches_comp (competition_id, season_id),
    INDEX idx_sb_matches_date (match_date)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sb_lineups (
    match_id INT NOT NULL, player_id INT NOT NULL, player_name VARCHAR(150) NOT NULL,
    team_id INT NOT NULL, jersey_number TINYINT UNSIGNED NULL,
    PRIMARY KEY (match_id, player_id),
    INDEX idx_sb_lineups_player (player_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
  `CREATE TABLE IF NOT EXISTS sb_player_match_stats (
    match_id INT NOT NULL, player_id INT NOT NULL, player_name VARCHAR(150) NOT NULL,
    team_id INT NOT NULL, competition_id INT NOT NULL, season_id INT NOT NULL,
    match_date DATE NOT NULL,
    shots SMALLINT NOT NULL DEFAULT 0, shots_on_target SMALLINT NOT NULL DEFAULT 0,
    goals SMALLINT NOT NULL DEFAULT 0, xg DECIMAL(6,4) NOT NULL DEFAULT 0,
    passes SMALLINT NOT NULL DEFAULT 0, passes_completed SMALLINT NOT NULL DEFAULT 0,
    key_passes SMALLINT NOT NULL DEFAULT 0, progressive_passes SMALLINT NOT NULL DEFAULT 0,
    carries SMALLINT NOT NULL DEFAULT 0, progressive_carries SMALLINT NOT NULL DEFAULT 0,
    dribbles_attempted SMALLINT NOT NULL DEFAULT 0, dribbles_completed SMALLINT NOT NULL DEFAULT 0,
    pressures SMALLINT NOT NULL DEFAULT 0, tackles SMALLINT NOT NULL DEFAULT 0,
    interceptions SMALLINT NOT NULL DEFAULT 0, blocks SMALLINT NOT NULL DEFAULT 0,
    clearances SMALLINT NOT NULL DEFAULT 0,
    duels_won SMALLINT NOT NULL DEFAULT 0, duels_total SMALLINT NOT NULL DEFAULT 0,
    aerials_won SMALLINT NOT NULL DEFAULT 0, aerials_total SMALLINT NOT NULL DEFAULT 0,
    fouls_committed SMALLINT NOT NULL DEFAULT 0, fouls_won SMALLINT NOT NULL DEFAULT 0,
    PRIMARY KEY (match_id, player_id),
    INDEX idx_sb_pms_player (player_id),
    INDEX idx_sb_pms_comp_sea (competition_id, season_id)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`,
]) {
  pool.query(sql).catch(err => { if (!err?.message?.includes('already exists')) console.warn('[warn] sb table:', err?.message); });
}

// ── StatsBomb admin endpoints ─────────────────────────────────────────────────

// GET /api/admin/statsbomb/status — import history & last SHA
app.get('/api/admin/statsbomb/status', authMiddleware, ensureAdmin, async (_req, res) => {
  try {
    const [logs] = await pool.query(
      'SELECT * FROM sb_import_log ORDER BY started_at DESC LIMIT 10'
    );
    const [[matchCount]] = await pool.query('SELECT COUNT(*) as cnt FROM sb_matches');
    const [[playerCount]] = await pool.query('SELECT COUNT(*) as cnt FROM sb_players');
    const [[compCount]] = await pool.query('SELECT COUNT(*) as cnt FROM sb_competitions');
    return res.json({
      logs,
      totals: { matches: matchCount.cnt, players: playerCount.cnt, competitions: compCount.cnt },
    });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// POST /api/admin/statsbomb/import — trigger manual import
let sbImportRunning = false;
app.post('/api/admin/statsbomb/import', authMiddleware, ensureAdmin, async (req, res) => {
  if (sbImportRunning) return res.status(409).json({ error: 'Import already running.' });
  sbImportRunning = true;
  const force = req.body?.force === true;
  // Return immediately — import runs in background
  res.json({ ok: true, message: 'Import started in background. Check /status for progress.' });
  try {
    const { runStatsBombImport } = await import('./statsbomb-import.js');
    await runStatsBombImport({ force });
  } catch (e) {
    console.error('[statsbomb/import]', e?.message);
  } finally {
    sbImportRunning = false;
  }
});

// GET /api/statsbomb/player — search player stats by name
// POST /api/statsbomb/compare-credit — Premium/Admin required; deducts 1 credit to unlock a comparison
app.post('/api/statsbomb/compare-credit', authMiddleware, ensurePremiumOrAdmin, async (req, res) => {
  try {
    const userId = req.user.id;
    // Admins bypass credit system entirely
    const [adminRows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [userId]);
    if (adminRows.length) return res.json({ ok: true, free: true });

    const creditCheck = await canUseCredit(userId);
    if (!creditCheck.ok) {
      return res.status(402).json({ error: creditCheck.error, quota: creditCheck.quota, used: creditCheck.used });
    }
    await spendCredit(userId, 'Comparaison de joueurs');
    return res.json({ ok: true });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

app.get('/api/statsbomb/player', authMiddleware, async (req, res) => {
  try {
    const name = (req.query.name || '').trim();
    if (!name) return res.status(400).json({ error: 'missing name' });

    // Find matching player(s) — fuzzy match on name
    const [players] = await pool.query(
      `SELECT player_id, player_name, player_nickname, country
       FROM sb_players
       WHERE player_name LIKE ? OR player_nickname LIKE ?
       ORDER BY player_name LIMIT 5`,
      [`%${name}%`, `%${name}%`]
    );
    if (!players.length) return res.json({ players: [], stats: [] });

    const playerIds = players.map(p => p.player_id);
    const placeholders = playerIds.map(() => '?').join(',');

    // Aggregate stats per player per competition/season
    const [stats] = await pool.query(
      `SELECT
         s.player_id, s.player_name,
         c.competition_name, c.season_name, c.competition_gender,
         s.competition_id, s.season_id,
         COUNT(DISTINCT s.match_id)     AS matches,
         SUM(s.goals)                   AS goals,
         ROUND(SUM(s.xg), 2)            AS xg,
         SUM(s.shots)                   AS shots,
         SUM(s.shots_on_target)         AS shots_on_target,
         SUM(s.passes)                  AS passes,
         SUM(s.passes_completed)        AS passes_completed,
         ROUND(100.0 * SUM(s.passes_completed) / NULLIF(SUM(s.passes),0), 1) AS pass_pct,
         SUM(s.key_passes)              AS key_passes,
         SUM(s.progressive_passes)      AS progressive_passes,
         SUM(s.dribbles_completed)      AS dribbles_completed,
         SUM(s.dribbles_attempted)      AS dribbles_attempted,
         SUM(s.pressures)               AS pressures,
         SUM(s.tackles)                 AS tackles,
         SUM(s.interceptions)           AS interceptions,
         SUM(s.duels_won)               AS duels_won,
         SUM(s.duels_total)             AS duels_total
       FROM sb_player_match_stats s
       JOIN sb_competitions c ON c.competition_id = s.competition_id AND c.season_id = s.season_id
       WHERE s.player_id IN (${placeholders})
       GROUP BY s.player_id, s.player_name, s.competition_id, s.season_id
       ORDER BY s.player_id, c.competition_name, c.season_name DESC`,
      playerIds
    );

    return res.json({ players, stats });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// GET /api/statsbomb/team-analysis — tactical profile for a club
app.get('/api/statsbomb/team-analysis', authMiddleware, async (req, res) => {
  try {
    const teamName = (req.query.team || '').trim();
    if (!teamName) return res.status(400).json({ error: 'missing team' });

    // Find matching teams
    const [teams] = await pool.query(
      `SELECT team_id, team_name FROM sb_teams WHERE team_name LIKE ? LIMIT 5`,
      [`%${teamName}%`]
    );
    if (!teams.length) return res.json({ teams: [], selected: null, stats: [], topScorers: [] });

    const teamId = teams[0].team_id;

    // Aggregate team stats across all matches (home + away)
    const [aggRows] = await pool.query(`
      SELECT
        c.competition_name, c.season_name, c.competition_id, c.season_id,
        COUNT(DISTINCT s.match_id) AS matches,
        SUM(s.goals) AS goals,
        ROUND(SUM(s.xg), 2) AS xg_total,
        ROUND(SUM(s.xg) / NULLIF(COUNT(DISTINCT s.match_id), 0), 3) AS xg_per_game,
        SUM(s.shots) AS shots,
        ROUND(SUM(s.shots) / NULLIF(COUNT(DISTINCT s.match_id), 0), 1) AS shots_per_game,
        SUM(s.passes) AS passes,
        ROUND(100.0 * SUM(s.passes_completed) / NULLIF(SUM(s.passes), 0), 1) AS pass_pct,
        ROUND(SUM(s.passes) / NULLIF(COUNT(DISTINCT s.match_id), 0), 1) AS passes_per_game,
        SUM(s.progressive_passes) AS prog_passes,
        ROUND(SUM(s.progressive_passes) / NULLIF(COUNT(DISTINCT s.match_id), 0), 1) AS prog_passes_per_game,
        SUM(s.pressures) AS pressures,
        ROUND(SUM(s.pressures) / NULLIF(COUNT(DISTINCT s.match_id), 0), 1) AS pressures_per_game,
        SUM(s.tackles) AS tackles,
        SUM(s.interceptions) AS interceptions,
        SUM(s.dribbles_completed) AS dribbles,
        ROUND(SUM(s.dribbles_completed) / NULLIF(COUNT(DISTINCT s.match_id), 0), 1) AS dribbles_per_game,
        ROUND(100.0 * SUM(s.duels_won) / NULLIF(SUM(s.duels_total), 0), 1) AS duel_win_pct
      FROM sb_player_match_stats s
      JOIN sb_competitions c ON c.competition_id = s.competition_id AND c.season_id = s.season_id
      WHERE s.team_id = ?
      GROUP BY s.competition_id, s.season_id
      ORDER BY c.competition_name, c.season_name DESC
    `, [teamId]);

    // Top scorers for this team
    const [topScorers] = await pool.query(`
      SELECT player_name, SUM(goals) AS goals, ROUND(SUM(xg), 2) AS xg, COUNT(DISTINCT match_id) AS matches
      FROM sb_player_match_stats
      WHERE team_id = ?
      GROUP BY player_id, player_name
      ORDER BY goals DESC
      LIMIT 10
    `, [teamId]);

    return res.json({ teams, selected: teams[0], stats: aggRows, topScorers });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// GET /api/statsbomb/competitions — list all available competitions
app.get('/api/statsbomb/competitions', authMiddleware, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT competition_id, season_id, competition_name, season_name, country_name, competition_gender
       FROM sb_competitions ORDER BY competition_name, season_name DESC`
    );
    return res.json({ competitions: rows });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// GET /api/statsbomb/matches — list matches, filterable by competition_id + season_id
app.get('/api/statsbomb/matches', authMiddleware, async (req, res) => {
  try {
    const competitionId = parseInt(req.query.competition_id) || null;
    const seasonId      = parseInt(req.query.season_id) || null;
    const search        = (req.query.search || '').trim();
    const limit         = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset        = parseInt(req.query.offset) || 0;

    let where = '1=1';
    const params = [];
    if (competitionId) { where += ' AND m.competition_id = ?'; params.push(competitionId); }
    if (seasonId)      { where += ' AND m.season_id = ?';      params.push(seasonId); }
    if (search) {
      where += ' AND (ht.team_name LIKE ? OR at.team_name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await pool.query(
      `SELECT m.match_id, m.match_date, m.kick_off,
              m.home_score, m.away_score, m.competition_stage, m.match_week,
              m.competition_id, m.season_id, m.has_360,
              c.competition_name, c.season_name, c.country_name,
              ht.team_name AS home_team, at.team_name AS away_team
       FROM sb_matches m
       JOIN sb_teams ht ON ht.team_id = m.home_team_id
       JOIN sb_teams at ON at.team_id = m.away_team_id
       JOIN sb_competitions c ON c.competition_id = m.competition_id AND c.season_id = m.season_id
       WHERE ${where}
       ORDER BY m.match_date DESC, m.kick_off DESC
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) as total FROM sb_matches m
       JOIN sb_teams ht ON ht.team_id = m.home_team_id
       JOIN sb_teams at ON at.team_id = m.away_team_id
       WHERE ${where}`,
      params
    );

    return res.json({ matches: rows, total, limit, offset });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// GET /api/statsbomb/match/:id — single match with top performers
app.get('/api/statsbomb/match/:id', authMiddleware, async (req, res) => {
  try {
    const matchId = parseInt(req.params.id);
    const [[match]] = await pool.query(
      `SELECT m.*, c.competition_name, c.season_name,
              ht.team_name AS home_team, at.team_name AS away_team
       FROM sb_matches m
       JOIN sb_teams ht ON ht.team_id = m.home_team_id
       JOIN sb_teams at ON at.team_id = m.away_team_id
       JOIN sb_competitions c ON c.competition_id = m.competition_id AND c.season_id = m.season_id
       WHERE m.match_id = ?`,
      [matchId]
    );
    if (!match) return res.status(404).json({ error: 'Match not found' });

    // Top performers — ordered by goals + xg + key_passes
    const [performers] = await pool.query(
      `SELECT player_name, team_id, goals, xg, shots, key_passes, passes, passes_completed,
              dribbles_completed, pressures, tackles, interceptions
       FROM sb_player_match_stats
       WHERE match_id = ?
       ORDER BY (goals * 3 + xg + key_passes + tackles + interceptions) DESC
       LIMIT 10`,
      [matchId]
    );

    // Lineups
    const [lineups] = await pool.query(
      `SELECT l.player_id, l.player_name, l.team_id, l.jersey_number,
              t.team_name,
              s.goals, s.xg, s.key_passes, s.passes_completed, s.passes, s.tackles, s.pressures
       FROM sb_lineups l
       JOIN sb_teams t ON t.team_id = l.team_id
       LEFT JOIN sb_player_match_stats s ON s.match_id = l.match_id AND s.player_id = l.player_id
       WHERE l.match_id = ?
       ORDER BY l.team_id, l.jersey_number`,
      [matchId]
    );

    return res.json({ match, performers, lineups });
  } catch (err) {
    return res.status(500).json({ error: err?.message });
  }
});

// Export for Vercel serverless
export default app;

// Start local server only when run directly (not imported by Vercel)
if (!isVercel) {
  app.listen(port, () => {
    console.log(`API listening on http://localhost:${port}`);
    runMigrations().catch(err => console.warn("[startup] migration error:", err?.message));
    // Clear stale match-detail caches on startup so new parsing logic takes effect
    pool.query("DELETE FROM api_football_cache WHERE cache_key LIKE 'match-detail:%' OR cache_key LIKE 'lineup:%'")
      .then(() => console.log("[startup] Cleared match-detail & lineup caches"))
      .catch(() => {});
    // Opt-in: one-shot news scrape on startup. Useful after fixing the parser
    // to immediately overwrite previously-mangled rows (ON DUPLICATE KEY UPDATE
    // on article_url replaces titles/descriptions for existing rows).
    if (process.env.NEWS_SCRAPE_ON_START === '1') {
      setTimeout(() => {
        console.log('[startup] NEWS_SCRAPE_ON_START=1 — triggering news scrape');
        runNewsScrape().catch(err => console.warn('[startup news scrape]', err?.message));
      }, 5000);
    }
  });
}

