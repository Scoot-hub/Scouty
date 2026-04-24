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
const jwtSecret = process.env.API_JWT_SECRET || "change-this-secret";

const pool = mysql.createPool(createDbPoolConfig());

// In-memory progress tracker for enrich-all (keyed by userId)
const enrichAllProgress = new Map();

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());

// ── Global API rate limiter ────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 2000,                 // 2000 requests per window per IP
  standardHeaders: true,     // Return rate limit info in RateLimit-* headers
  legacyHeaders: false,      // Disable X-RateLimit-* headers
  message: { error: "Trop de requêtes, veuillez réessayer plus tard." },
  skip: () => process.env.NODE_ENV !== "production",
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

app.use(express.json({ limit: "5mb" }));
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
app.get("/api/stripe/session-status", async (req, res) => {
  if (!stripe) return res.status(501).json({ error: "Stripe non configuré." });
  const sessionId = req.query.session_id;
  if (!sessionId) return res.status(400).json({ error: "session_id requis." });
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

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
      _debug: {
        metadata_user_id: session.metadata?.user_id || null,
        client_reference_id: session.client_reference_id || null,
        subscription: session.subscription || null,
        customer: session.customer || null,
      },
    });
  } catch (err) {
    console.error("[session-status] Error:", err?.message);
    return res.status(500).json({ error: "Impossible de récupérer la session." });
  }
});

const ALLOWED_TABLES = {
  users: ["id", "email", "created_at", "last_sign_in_at"],
  profiles: ["id", "user_id", "full_name", "club", "role", "social_x", "social_instagram", "social_linkedin", "social_public", "social_facebook", "social_snapchat", "social_tiktok", "social_telegram", "social_whatsapp", "photo_url", "first_name", "last_name", "company", "siret", "phone", "civility", "address", "date_of_birth", "reference_club", "referred_by", "created_at", "updated_at"],
  players: [
    "id", "name", "photo_url", "generation", "nationality", "foot", "club", "league", "zone", "position", "position_secondaire", "role",
    "current_level", "potential", "general_opinion", "contract_end", "notes", "ts_report_published", "date_of_birth", "market_value",
    "transfermarkt_id", "external_data", "external_data_fetched_at", "shared_with_org", "has_news", "task", "is_archived", "user_id", "created_at", "updated_at",
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
  community_posts: ["id", "user_id", "author_name", "category", "title", "content", "likes", "replies_count", "is_archived", "created_at"],
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
  if (col === "ts_report_published" || col === "is_premium" || col === "is_favorite" || col === "is_archived") {
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

// DB schema is managed via schema.sql — runtime migrations ensure columns exist.
async function runMigrations() { return _legacyRunMigrations(); }
async function _legacyRunMigrations() {
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

  // Ensure is_archived column exists on community_posts
  try {
    await pool.query(`ALTER TABLE community_posts ADD COLUMN is_archived TINYINT(1) NOT NULL DEFAULT 0`);
  } catch { /* column already exists */ }

  // Ensure has_news column exists on players
  try {
    await pool.query(`ALTER TABLE players ADD COLUMN has_news VARCHAR(50) NULL DEFAULT NULL`);
  } catch { /* column already exists */ }
  try {
    await pool.query(`ALTER TABLE players MODIFY COLUMN has_news VARCHAR(50) NULL DEFAULT NULL`);
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

  // Fix wrong leagues using static club→league mapping
  try {
    const CLUB_TO_LEAGUE = require('../src/data/club-to-league.json');
    let totalFixed = 0;
    for (const [clubName, correctLeague] of Object.entries(CLUB_TO_LEAGUE)) {
      const [result] = await pool.query(
        "UPDATE players SET league = ? WHERE club = ? AND (league IS NULL OR league = '' OR league != ?)",
        [correctLeague, clubName, correctLeague]
      );
      totalFixed += result.affectedRows || 0;
    }
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

  // org logo_url
  try { await pool.query("ALTER TABLE organizations ADD COLUMN logo_url TEXT NULL"); } catch (err) { if (err?.errno !== 1060) console.warn("[warn] org logo_url migration:", err?.message); }

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
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS uploaded_images (
        id VARCHAR(255) PRIMARY KEY,
        data LONGBLOB NOT NULL,
        mime_type VARCHAR(100) NOT NULL DEFAULT 'image/jpeg',
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
  } catch (err) {
    if (!err?.message?.includes("already exists")) console.warn("[warn] uploaded_images table migration:", err?.message);
  }

  await migrateLegacyProfilePhotosToDb();

  console.log("[startup] Legacy migrations complete");
}

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
             p.generation, p.photo_url, p.market_value, p.current_level, p.potential,
             p.general_opinion, p.transfermarkt_id, p.user_id,
             pr.full_name AS scout_name, pr.photo_url AS scout_photo, pr.club AS scout_club
      FROM players p
      LEFT JOIN profiles pr ON pr.user_id = p.user_id
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
  const { email, password, fullName = "", club = "", role = "scout", referralCode = "" } = req.body || {};
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

    // Resolve referrer from referral code (format: SCOUTY-XXXXXXXX)
    let referrerId = null;
    if (referralCode) {
      const codeUpper = String(referralCode).trim().toUpperCase();
      const prefix = codeUpper.startsWith('SCOUTY-') ? codeUpper.slice(7) : codeUpper;
      if (prefix.length === 8) {
        const [refRows] = await conn.query(
          "SELECT id FROM users WHERE UPPER(SUBSTRING(id, 1, 8)) = ? LIMIT 1",
          [prefix]
        );
        if (refRows.length && refRows[0].id !== userId) {
          referrerId = refRows[0].id;
        }
      }
    }

    await conn.query(
      `INSERT INTO users (id, email, password_hash, created_at, updated_at, last_sign_in_at)
       VALUES (?, ?, ?, NOW(), NOW(), NOW())`,
      [userId, normalizedEmail, hash],
    );

    await conn.query(
      `INSERT INTO profiles (id, user_id, full_name, club, role, referred_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())`,
      [uuidv4(), userId, normalizedFullName, normalizedClub, normalizedRole, referrerId],
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

    // Award 100 affiliate credits to the referrer
    if (referrerId) {
      try {
        await ensureCreditTable();
        await pool.query(
          "INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description) VALUES (?, ?, 'affiliate_reward', 'earn', 100, ?)",
          [uuidv4(), referrerId, `Parrainage de ${normalizedEmail}`]
        );
      } catch (e) {
        console.warn('[signup] affiliate credit award failed:', e.message);
      }
    }

    const user = await getUserById(userId);
    return res.json({ user: normalizeUserRow(user), session: buildSession(user, res) });
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

    // If TOTP 2FA is enabled, don't return session yet — require TOTP code
    if (user.totp_enabled) {
      return res.json({ requires2FA: true, method: 'totp', userId: user.id });
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

      return res.json({ requires2FA: true, method: 'email', userId: user.id });
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
  if (!club_name) return res.status(400).json({ error: "Nom du club requis." });
  try {
    const id = uuidv4();
    await pool.query(
      "INSERT INTO followed_clubs (id, user_id, club_name, notes) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE notes = VALUES(notes)",
      [id, req.user.id, club_name.trim(), notes || null]
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

app.get("/api/admin/tickets", authMiddleware, async (req, res) => {
  try {
    const [tickets] = await pool.query(`
      SELECT t.*, u.email AS user_email, p.full_name AS user_name,
        CASE WHEN t.status = 'closed' THEN 0 ELSE
          (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_admin = 0
            AND tm.created_at > COALESCE((SELECT MAX(tm2.created_at) FROM ticket_messages tm2 WHERE tm2.ticket_id = t.id AND tm2.is_admin = 1), '1970-01-01')
          )
        END AS unread_count
      FROM tickets t
      LEFT JOIN users u ON u.id = t.user_id
      LEFT JOIN profiles p ON p.user_id = t.user_id
      ORDER BY t.updated_at DESC
    `);
    return res.json(tickets);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.get("/api/admin/tickets/unread-count", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT COUNT(DISTINCT t.id) AS count FROM tickets t
      WHERE t.status != 'closed'
        AND (NOT EXISTS (SELECT 1 FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_admin = 1)
          OR EXISTS (SELECT 1 FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_admin = 0
            AND tm.created_at > (SELECT MAX(tm2.created_at) FROM ticket_messages tm2 WHERE tm2.ticket_id = t.id AND tm2.is_admin = 1)))
    `);
    return res.json({ count: rows[0]?.count || 0 });
  } catch { return res.json({ count: 0 }); }
});

app.get("/api/admin/tickets/:id", authMiddleware, async (req, res) => {
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
    return res.json({ ticket: tickets[0], messages });
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.post("/api/admin/tickets/:id/reply", authMiddleware, async (req, res) => {
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

app.post("/api/admin/tickets/:id/email", authMiddleware, async (req, res) => {
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

app.patch("/api/admin/tickets/:id/status", authMiddleware, async (req, res) => {
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
    const [tickets] = await pool.query(`SELECT t.*,
      (SELECT COUNT(*) FROM ticket_messages tm WHERE tm.ticket_id = t.id AND tm.is_admin = 1
        AND tm.created_at > COALESCE((SELECT MAX(tm2.created_at) FROM ticket_messages tm2 WHERE tm2.ticket_id = t.id AND tm2.is_admin = 0), t.created_at)
      ) AS unread_count
      FROM tickets t WHERE t.user_id = ? ORDER BY t.updated_at DESC`, [req.user.id]);
    return res.json(tickets);
  } catch (err) { return res.status(500).json({ error: err.message }); }
});

app.get("/api/my-tickets/:id", authMiddleware, async (req, res) => {
  try {
    const [tickets] = await pool.query("SELECT * FROM tickets WHERE id = ? AND user_id = ?", [req.params.id, req.user.id]);
    if (!tickets.length) return res.status(404).json({ error: "Not found" });
    const [messages] = await pool.query(`SELECT tm.*, p.full_name AS sender_name FROM ticket_messages tm LEFT JOIN profiles p ON p.user_id = tm.sender_id WHERE tm.ticket_id = ? ORDER BY tm.created_at ASC`, [req.params.id]);
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

// POST /api/auth/2fa/email/disable — disable email 2FA
app.post("/api/auth/2fa/email/disable", authMiddleware, async (req, res) => {
  try {
    const [rows] = await pool.query("SELECT email_2fa_enabled FROM users WHERE id = ? LIMIT 1", [req.user.id]);
    if (!rows[0]?.email_2fa_enabled) return res.status(400).json({ error: "La 2FA par email n'est pas activée." });

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
  const { userId, code } = req.body || {};
  if (!userId || !code) return res.status(400).json({ error: "userId et code requis." });

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
    const levelMin = req.query.levelMin ? parseFloat(req.query.levelMin) : null;
    const levelMax = req.query.levelMax ? parseFloat(req.query.levelMax) : null;
    const potMin = req.query.potMin ? parseFloat(req.query.potMin) : null;
    const potMax = req.query.potMax ? parseFloat(req.query.potMax) : null;
    const ageMin = req.query.ageMin ? parseInt(req.query.ageMin) : null;
    const ageMax = req.query.ageMax ? parseInt(req.query.ageMax) : null;
    const contractRanges = req.query.contractRanges ? req.query.contractRanges.split(",") : [];
    const ratingMin = req.query.ratingMin ? parseFloat(req.query.ratingMin) : null;
    const ratingMax = req.query.ratingMax ? parseFloat(req.query.ratingMax) : null;
    const goalsMin = req.query.goalsMin ? parseInt(req.query.goalsMin) : null;
    const assistsMin = req.query.assistsMin ? parseInt(req.query.assistsMin) : null;
    const minutesMin = req.query.minutesMin ? parseInt(req.query.minutesMin) : null;
    const sort = req.query.sort || "name";

    const hasTaskCol = await playersHasColumn("task");
    const hasNewsCol = await playersHasColumn("has_news");

    const clauses = ["`user_id` = ?"];
    const params = [userId];

    // Archived (column may not exist on older DBs)
    if (hasArchivedCol) {
      clauses.push("`is_archived` = ?");
      params.push(archived ? 1 : 0);
    }

    // Text search (name, club, league)
    if (search) {
      clauses.push("(LOWER(`name`) LIKE ? OR LOWER(`club`) LIKE ? OR LOWER(`league`) LIKE ?)");
      const like = `%${search.toLowerCase()}%`;
      params.push(like, like, like);
    }

    // Enum filters
    if (opinions.length) {
      clauses.push(`\`general_opinion\` IN (${opinions.map(() => "?").join(",")})`);
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
    if (levelMin !== null) { clauses.push("`current_level` >= ?"); params.push(levelMin); }
    if (levelMax !== null) { clauses.push("`current_level` <= ?"); params.push(levelMax); }
    if (potMin !== null) { clauses.push("`potential` >= ?"); params.push(potMin); }
    if (potMax !== null) { clauses.push("`potential` <= ?"); params.push(potMax); }

    // Age filter — derived from generation (YEAR(NOW()) - generation)
    if (ageMin !== null) {
      clauses.push("(YEAR(CURDATE()) - `generation`) >= ?");
      params.push(ageMin);
    }
    if (ageMax !== null) {
      clauses.push("(YEAR(CURDATE()) - `generation`) <= ?");
      params.push(ageMax);
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

    const whereSql = `WHERE ${clauses.join(" AND ")}`;

    // ── Sorting ──
    // has_news players always on top (if column exists), then by chosen sort
    const orderParts = [];
    if (hasNewsCol) {
      orderParts.push("CASE WHEN `has_news` IS NOT NULL AND `has_news` != '' THEN 0 ELSE 1 END ASC");
    }
    switch (sort) {
      case "name": orderParts.push("`name` ASC"); break;
      case "age-asc": orderParts.push("`generation` DESC"); break;
      case "age-desc": orderParts.push("`generation` ASC"); break;
      case "level": orderParts.push("`current_level` DESC"); break;
      case "potential": orderParts.push("`potential` DESC"); break;
      case "recent": orderParts.push("`updated_at` DESC"); break;
      case "contract": orderParts.push("CASE WHEN `contract_end` IS NULL THEN 1 ELSE 0 END ASC, `contract_end` ASC"); break;
      case "rating": orderParts.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.rating') AS DECIMAL(5,2)) DESC"); break;
      case "goals": orderParts.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.goals') AS UNSIGNED) DESC"); break;
      case "assists": orderParts.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.assists') AS UNSIGNED) DESC"); break;
      case "minutes": orderParts.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.minutes') AS UNSIGNED) DESC"); break;
      case "xg": orderParts.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.expected_goals') AS DECIMAL(5,2)) DESC"); break;
      case "pass-accuracy": orderParts.push("CAST(JSON_EXTRACT(`external_data`, '$.performance_stats.stats.passes_accuracy') AS DECIMAL(5,2)) DESC"); break;
      default: orderParts.push("`name` ASC");
    }
    const orderSql = `ORDER BY ${orderParts.join(", ")}`;

    // ── IDs-only mode (for "select all" across all pages) ──
    if (req.query.idsOnly === "1") {
      const [idRows] = await pool.query(`SELECT \`id\` FROM \`players\` ${whereSql}`, params);
      return res.json({ ids: idRows.map(r => r.id) });
    }

    // ── Count total (for "X / Y displayed") ──
    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM \`players\` ${whereSql}`, params);
    const total = countRows[0].total;

    // ── Fetch page ──
    const [rows] = await pool.query(
      `SELECT * FROM \`players\` ${whereSql} ${orderSql} LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    const data = rows.map(parseRowJsonColumns);
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

    return res.json({
      leagues: leagueRows.map(r => r.league),
      clubs: clubRows.map(r => r.club),
      roles: roleRows.map(r => r.role),
      activeCount: countRows[0]?.activeCount || 0,
      archivedCount: countRows[0]?.archivedCount || 0,
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
      `SELECT om.id, om.user_id, om.role, om.joined_at,
              p.full_name, p.club, p.role AS profile_role, p.social_x, p.social_instagram, p.social_linkedin, p.social_public,
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
      profile: {
        full_name: r.full_name,
        club: r.club,
        role: r.profile_role,
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

async function ensureAdmin(req, res, next) {
  const [rows] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
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
const PROTECTED_ROLES = ['admin', 'user', 'moderateur'];
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
    });
  } catch (err) {
    console.error("[admin/analytics] Error:", err);
    res.status(500).json({ error: "Erreur serveur." });
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
    const customMessage = String(message || "").trim();
    if (!customMessage) {
      return res.status(400).json({ error: "Un message de suppression est requis." });
    }

    const [orgRows] = await pool.query("SELECT name, logo_url FROM organizations WHERE id = ? LIMIT 1", [id]);
    if (!orgRows.length) return res.status(404).json({ error: "Organisation introuvable." });

    const orgName = orgRows[0].name;
    const logoUrl = orgRows[0]?.logo_url;
    await deleteImageFromDb(logoUrl);
    await deleteStoredFile(logoUrl);

    const [usersToNotify] = await pool.query("SELECT id FROM users");
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
app.get("/api/admin/feature-flags", authMiddleware, async (req, res) => {
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

// Public endpoint: check if a feature is enabled (used by frontend)
app.get("/api/feature-flags", async (_req, res) => {
  try {
    const [rows] = await pool.query("SELECT setting_key, setting_value FROM app_settings WHERE setting_key LIKE 'feature_%'");
    const flags = {};
    for (const r of rows) flags[r.setting_key] = r.setting_value === '1';
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

// GET /api/credits/me — current user usage + quotas
app.get("/api/credits/me", authMiddleware, async (req, res) => {
  try {
    const planType = await getUserPlanType(req.user.id);
    const quotas = PLAN_QUOTAS[planType] || PLAN_QUOTAS.starter;
    const usage = await getUserCreditUsage(req.user.id);
    // Effective monthly quota = plan quota + all-time earned bonus
    const effectiveQuotas = quotas.monthly === -1 ? quotas : {
      daily: quotas.daily,
      weekly: quotas.weekly,
      monthly: quotas.monthly + (usage.earned_total || 0),
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
  const q = String(req.query.q || "").trim();
  if (q.length < 2) return res.json([]);
  try {
    const like = `%${q}%`;
    const [rows] = await pool.query(`
      SELECT DISTINCT club_name, logo_url, competition, country, country_code
      FROM (
        SELECT cd.club_name, cd.logo_url, cd.competition, cd.country, cd.country_code
        FROM club_directory cd WHERE cd.club_name LIKE ?
        UNION
        SELECT cl.club_name, cl.logo_url, '' AS competition, '' AS country, '' AS country_code
        FROM club_logos cl WHERE cl.club_name LIKE ? AND cl.club_name NOT IN (SELECT club_name FROM club_directory WHERE club_name LIKE ?)
      ) combined
      ORDER BY
        CASE WHEN club_name LIKE ? THEN 0 ELSE 1 END,
        club_name
      LIMIT 20
    `, [like, like, like, `${q}%`]);
    return res.json(rows);
  } catch (err) {
    return res.json([]);
  }
});

// ── Nominatim geocoding helper (OpenStreetMap, no API key required) ─────────
async function geocodeClub(clubName, country) {
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
    // Try with "football" first to hit sports leisure entries
    country ? `${clubName} football ${country}` : `${clubName} football`,
    country ? `${clubName} ${country}` : clubName,
    stripped !== clubName && country ? `${stripped} football ${country}` : null,
    stripped !== clubName && country ? `${stripped} ${country}` : null,
    stripped !== clubName ? stripped : null,
  ].filter(Boolean);
  for (const q of tries) {
    const data = await query(q);
    const r = pick(data);
    if (r) return r;
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

    // Find club links in the search results
    const clubs = [];
    const regex = /<td[^>]*class="[^"]*hauptlink[^"]*"[^>]*>\s*<a[^>]*href="\/([\w-]+)\/startseite\/verein\/(\d+)"[^>]*title="([^"]*)"/g;
    let m;
    while ((m = regex.exec(html)) !== null && clubs.length < 5) {
      clubs.push({ slug: m[1], clubId: m[2], clubName: m[3] });
    }
    // Fallback: any verein link
    if (clubs.length === 0) {
      const fb = html.match(/href="\/([\w-]+)\/startseite\/verein\/(\d+)"/);
      if (fb) clubs.push({ slug: fb[1], clubId: fb[2], clubName: q });
    }

    if (clubs.length === 0) return res.json(null);

    // Return first match, but also fetch its profile to populate club_directory
    const best = clubs[0];
    const profileResp = await fetch(`${req.protocol}://${req.get("host")}/api/club-tm/${best.clubId}`);
    const profile = profileResp.ok ? await profileResp.json() : best;

    return res.json(profile);
  } catch (err) {
    console.error("[club-tm-search] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Transfermarkt player injuries scraping ─────────────────────────────────
app.get("/api/player-tm-injuries/:tmId", async (req, res) => {
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
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
        [cacheKey, JSON.stringify(result)]
      );
    } catch {}

    return res.json(result);
  } catch (err) {
    console.error("[player-tm-injuries] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ── Transfermarkt player market value history scraping ──────────────────────
app.get("/api/player-tm-market-value/:tmId", async (req, res) => {
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
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
        [cacheKey, JSON.stringify(result)]
      );
    } catch {}

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

// Compare two agent strings loosely (case/whitespace/accent-insensitive).
function agentsEquivalent(a, b) {
  return normalizeStr(a || '') === normalizeStr(b || '');
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

  // Shared cross-user cache by TM player ID (24h). Avoids re-scraping TM when
  // another user already enriched the same player. Bypassed when forceRefresh is true.
  async function getCachedByTmId(tmId) {
    if (forceRefresh || !tmId) return null;
    try {
      const [rows] = await pool.query(
        "SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW() LIMIT 1",
        [`tm-player:${tmId}`]
      );
      if (rows.length) {
        const v = rows[0].response_json;
        return typeof v === 'string' ? JSON.parse(v) : v;
      }
    } catch {}
    return null;
  }
  async function setCachedByTmId(tmId, data) {
    if (!tmId || !data) return;
    try {
      await pool.query(
        `INSERT INTO api_football_cache (cache_key, response_json, fetched_at, expires_at)
         VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL 24 HOUR))
         ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), fetched_at = NOW(), expires_at = DATE_ADD(NOW(), INTERVAL 24 HOUR)`,
        [`tm-player:${tmId}`, JSON.stringify(data)]
      );
    } catch {}
  }

  try {
    const opts = { headers: TM_HEADERS, signal: AbortSignal.timeout(20000) };

    // ── 1. Search (with fallback queries for typos / compound names) ──────────
    const rowRe = /href="(\/([^/]+)\/profil\/spieler\/(\d+))"[^>]*>([^<]+)<\/a>(?:.*?zentriert">(\d+)<\/td>)?(?:.*?rechts hauptlink">\s*([^<]*)<\/td>)?(?:.*?berater\/\d+">\s*([^<]*)<\/a>)?/gs;
    const playerClubNorm = normalizeStr(player.club || '');

    let best = null, bestScore = -1;
    const allCandidates = []; // collect all matching candidates for disambiguation

    const playerNatNorm = normalizeStr(player.nationality || '');
    const genKnown = player.generation && player.generation !== 2000;

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

          // ── Age matching (stricter for known generations) ──
          const candidateAge = age ? parseInt(age) : null;
          const candidateBornYear = candidateAge ? (new Date().getFullYear() - candidateAge) : null;
          if (genKnown && candidateBornYear) {
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
            if (!lastsMatch || !firstsClose) continue;
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
    const result = { tmId: best.id, contract, heightCm, agent, marketValue, currentClub, onLoan, parentClub, loanEndDate, parentContractEnd, photoUrl, clubLogoUrl, footRaw, positionRaw, nationalityRaw, career, seasonStats };
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
    const cacheKey = `sofascore_player_${normalizeStr(playerInfo.name)}_${playerInfo.generation || ''}`;
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
    const searchData = await sofaFetch(`/search/all?q=${encodeURIComponent(searchName)}&page=0`);
    if (!searchData) return null;

    // Extract player results
    const playerResults = [];
    if (searchData.results) {
      for (const group of searchData.results) {
        if (group.type === 'player' && group.entity) playerResults.push(group.entity);
        if (group.type === 'player' && group.entities) playerResults.push(...group.entities);
      }
    }
    // Some API versions return flat array
    if (playerResults.length === 0 && Array.isArray(searchData.players)) {
      playerResults.push(...searchData.players);
    }

    if (playerResults.length === 0) {
      console.log(`[sofascore] No player results for "${searchName}"`);
      return null;
    }

    // ── 2. Find best match by name + birth year + nationality ──
    const normalizedSearch = searchName.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const birthYear = playerInfo.generation || null;
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

      // Birth year
      if (birthYear && p.dateOfBirthTimestamp) {
        const pYear = new Date(p.dateOfBirthTimestamp * 1000).getFullYear();
        if (pYear === birthYear) score += 30;
        else if (Math.abs(pYear - birthYear) <= 1) score += 15;
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

  // ── Build SET clauses ────────────────────────────────────────────────
  const setClauses = ['external_data = ?', 'external_data_fetched_at = NOW()', 'updated_at = NOW()', 'contract_end = ?'];
  const params = [JSON.stringify(ext), contractEnd];

  if (newsLabel) { setClauses.push('has_news = ?'); params.push(newsLabel); }

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

  // ── TM position: update from profile if missing ───────────────────
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
    const pos = mapPos(tm.positionRaw);
    if (pos) {
      setClauses.push('position = ?'); params.push(pos);
      setClauses.push('zone = ?'); params.push(posZone[pos] || '');
    }
  }

  // ── TM nationality: update if missing, unknown, or different ──────
  if (tm?.nationalityRaw) {
    const nat = tm.nationalityRaw.split(/\s{2,}/)[0].trim();
    if (nat) {
      const currentNat = normalizeStr(row.nationality || '');
      const tmNat = normalizeStr(nat);
      console.log(`[enrich] Nationality check: DB="${row.nationality}" (norm="${currentNat}") vs TM="${nat}" (norm="${tmNat}") → ${currentNat !== tmNat ? 'UPDATING' : 'same'}`);
      if (!row.nationality || row.nationality === 'Inconnu' || currentNat !== tmNat) {
        setClauses.push('nationality = ?'); params.push(nat);
      }
    }
  } else {
    console.log(`[enrich] No TM nationalityRaw found (tm=${!!tm}, nationalityRaw=${tm?.nationalityRaw})`);
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
    // Premium or admin only
    const [_adminR] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    if (!_adminR.length) {
      const [_subR] = await pool.query("SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
      if (!_subR.length || !_subR[0].is_premium) {
        return res.status(403).json({ error: "premium_required", message: "L'enrichissement est réservé aux utilisateurs Premium." });
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

      // Consume 1 credit for enrichment (fire-and-forget — don't fail the request)
      pool.query(
        "INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description) VALUES (?, ?, 'enrichment', 'spend', 1, ?)",
        [uuidv4(), req.user.id, `Enrichissement: ${playerName}`]
      ).catch(() => {});

      return res.json({
        success: true,
        sources: { thesportsdb: !!tsdb, wikidata: !!wd, transfermarkt: !!tm },
        tmNotFound: !tm,
        changes, // [{field, old, new}]
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
      // Fallback: capitalise slug from URL path
      if (!playerName) {
        const slugM = tmPath.match(/^\/([^/]+)\//);
        if (slugM) playerName = slugM[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      }

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
        // Fallback: extract age from "(25 ans)" or "(25)" to compute generation
        if (!generation) {
          const ageM = dobRaw.match(/\((\d{1,2})\s*(?:ans)?\s*\)/);
          if (ageM) generation = new Date().getFullYear() - parseInt(ageM[1]);
        }
      }
      // Last resort: look for age in the page header area (TM always shows age)
      if (!generation) {
        const ageHeaderM = html.match(/class="data-header__label"[^>]*>[^<]*?(\d{1,2})\s*(?:ans|jaar|years?|Jahre?)/i);
        if (ageHeaderM) generation = new Date().getFullYear() - parseInt(ageHeaderM[1]);
      }
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
      let clubLogo = null;
      const logoM = html.match(/data-header__profile-image[^>]*src="([^"]+)"/);
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

          // Prefer the title attribute of the <a> tag (canonical "FirstName LastName")
          // over the anchor text which may be abbreviated (e.g. "K. Mbappé")
          const tagCtx = sectionHtml.slice(Math.max(0, linkStart - 150), linkStart);
          const titleAttrM = tagCtx.match(/title="([^"]{2,60})"\s*$/);
          const name = decodeHtmlEntities(titleAttrM ? titleAttrM[1].trim() : anchorText);

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


          // Date of birth / generation: parse full DOB first, fallback to age
          let dateOfBirth = null;
          let generation = null;
          const cellTexts = [...outerCells.matchAll(/<td[^>]*class="zentriert"[^>]*>([\s\S]*?)<\/td>/g)]
            .map(m => m[1].replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').trim());
          for (const cellText of cellTexts) {
            if (dateOfBirth) break;
            // Try full date: "1 juil. 1999 (26)" or "01.07.1999 (26)"
            const dob = parseFrDateAny(cellText);
            if (dob) {
              // Validate year range: must be a plausible birth year (not a contract end date)
              const dobYear = parseInt(dob.split('-')[0], 10);
              if (dobYear >= 1970 && dobYear <= new Date().getFullYear() - 10) {
                dateOfBirth = dob;
                generation = dobYear;
                break;
              }
            }
            // Try age in parentheses: "(26 ans)" or "(26)"
            if (!generation) {
              const ageInParens = cellText.match(/\((\d{1,2})\s*(?:ans)?\s*\)/);
              if (ageInParens) generation = new Date().getFullYear() - parseInt(ageInParens[1]);
            }
          }
          // Fallback: bare age number in a zentriert cell
          if (!generation) {
            const ageM = outerCells.match(/<td[^>]*class="zentriert"[^>]*>\s*(\d{1,2})\s*<\/td>/);
            if (ageM) generation = new Date().getFullYear() - parseInt(ageM[1]);
          }

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

        // ── Starters: from formation-player-container divs ──
        const starterRegex = /formation-player-container[\s\S]*?tm-shirt-number[^>]*>\s*(\d+)\s*<\/div>[\s\S]*?href="(\/[^"]*\/profil\/spieler\/(\d+))">([^<]+)<\/a>/g;
        let sm;
        while ((sm = starterRegex.exec(formationHtml)) !== null) {
          const tmId = sm[3];
          if (seenIds.has(tmId)) continue;
          seenIds.add(tmId);
          starters.push({
            tmId,
            tmProfilePath: sm[2],
            name: decodeHtmlEntities(sm[4].trim()),
            shirtNumber: parseInt(sm[1]),
            starter: true,
            position: null,
          });
        }

        // ── Bench: from ersatzbank table rows ──
        const benchRowRegex = /<tr>([\s\S]*?)<\/tr>/g;
        let br;
        while ((br = benchRowRegex.exec(benchHtml)) !== null) {
          const row = br[1];
          const linkM = row.match(/href="(\/[^"]*\/profil\/spieler\/(\d+))"[^>]*>([^<]+)<\/a>/);
          if (!linkM) continue;
          const tmId = linkM[2];
          if (seenIds.has(tmId)) continue;
          seenIds.add(tmId);

          const numM = row.match(/tm-shirt-number[^>]*>\s*(\d+)\s*<\/div>/);
          // Position abbreviation is in the last <td>
          const posM = row.match(/<td>\s*([A-ZÀ-Ü][A-Za-zÀ-ü]+)\s*<\/td>\s*$/);
          const posAbbr = posM ? posM[1].trim() : null;
          const posExpanded = posAbbr && TM_BENCH_POS[posAbbr] ? TM_BENCH_POS[posAbbr] : posAbbr;

          bench.push({
            tmId,
            tmProfilePath: linkM[1],
            name: decodeHtmlEntities(linkM[3].trim()),
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

  if (name === "enrich-all-players") {
    // Premium or admin only
    const [_adminR2] = await pool.query("SELECT id FROM user_roles WHERE user_id = ? AND role = 'admin' LIMIT 1", [req.user.id]);
    if (!_adminR2.length) {
      const [_subR2] = await pool.query("SELECT is_premium FROM user_subscriptions WHERE user_id = ? LIMIT 1", [req.user.id]);
      if (!_subR2.length || !_subR2[0].is_premium) {
        return res.status(403).json({ error: "premium_required", message: "L'enrichissement est réservé aux utilisateurs Premium." });
      }
    }
    // Prevent concurrent runs
    const existing = enrichAllProgress.get(req.user.id);
    if (existing && existing.running) {
      return res.json({ total: existing.total, message: 'Enrichissement déjà en cours', alreadyRunning: true });
    }

    const [players] = await pool.query(
      'SELECT id, name, club, nationality, generation FROM players WHERE user_id = ? ORDER BY name',
      [req.user.id]
    );
    if (!players.length) return res.json({ total: 0, message: 'No players to enrich' });

    const total = players.length;
    enrichAllProgress.set(req.user.id, { running: true, total, done: 0, errors: 0 });
    res.json({ total, message: `Enrichissement de ${total} joueurs lancé en arrière-plan` });

    (async () => {
      let done = 0, errors = 0;
      for (const p of players) {
        try {
          const [rows] = await pool.query(
            'SELECT id, name, club, league, nationality, date_of_birth, contract_end, external_data, photo_url, foot FROM players WHERE id = ?',
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
          // Consume 1 credit per enriched player
          pool.query(
            "INSERT INTO user_credit_events (id, user_id, action_type, direction, amount, description) VALUES (?, ?, 'enrichment', 'spend', 1, ?)",
            [uuidv4(), req.user.id, `Enrichissement: ${row.name}`]
          ).catch(() => {});
        } catch (e) {
          errors++;
          console.error(`[enrich-all] Error for ${p.name}:`, e.message);
        }
        enrichAllProgress.set(req.user.id, { running: true, total, done, errors });
        // Polite delay to avoid TM rate-limit
        await new Promise(r => setTimeout(r, 1500));
      }
      enrichAllProgress.set(req.user.id, { running: false, total, done, errors });
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

        // Find club in the clubs results table (hauptlink containing /startseite/verein/)
        let clubSlug, clubId;
        const clubLinkMatch = searchHtml.match(/<td[^>]*class="[^"]*hauptlink[^"]*"[^>]*>\s*<a[^>]*href="(\/([^"]*?)\/startseite\/verein\/(\d+))"[^>]*title="([^"]*)"/);
        if (clubLinkMatch) {
          clubSlug = clubLinkMatch[2]; clubId = clubLinkMatch[3]; clubName = clubLinkMatch[4];
        } else {
          // Fallback: first verein link anywhere
          const fallback = searchHtml.match(/href="(\/([^"]*?)\/startseite\/verein\/(\d+))"/);
          if (!fallback) return res.json({ players: [], clubName: '' });
          clubSlug = fallback[2]; clubId = fallback[3]; clubName = clubQuery;
        }

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
    const { tournamentId } = req.body || {};
    if (!tournamentId) return res.status(400).json({ error: "Missing tournamentId" });

    const SOFA_HEADERS = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Accept': 'application/json, text/plain, */*',
      'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      'Referer': 'https://www.sofascore.com/',
      'Origin': 'https://www.sofascore.com',
      'Cache-Control': 'no-cache',
    };
    const opts = { headers: SOFA_HEADERS, signal: AbortSignal.timeout(12000) };
    const apiBase = 'https://api.sofascore.com/api/v1';

    // Check DB cache first (24h TTL)
    const cacheKey = `sofascore_league_${tournamentId}`;
    try {
      const [cached] = await pool.query(
        'SELECT response_json FROM api_football_cache WHERE cache_key = ? AND expires_at > NOW()',
        [cacheKey]
      );
      if (cached.length > 0) {
        return res.json(JSON.parse(cached[0].response_json));
      }
    } catch { /* cache miss, continue */ }

    try {
      // 1. Fetch seasons to get the current one
      const seasonsResp = await fetch(`${apiBase}/unique-tournament/${tournamentId}/seasons`, opts);
      if (!seasonsResp.ok) {
        console.warn(`[sofascore] seasons ${seasonsResp.status} for tournament ${tournamentId}`);
        return res.status(seasonsResp.status).json({ error: `SofaScore returned ${seasonsResp.status}` });
      }
      const seasonsData = await seasonsResp.json();
      const currentSeason = seasonsData?.seasons?.[0]; // first = most recent
      if (!currentSeason) return res.json({ teams: [], season: null });

      // 2. Fetch standings to get teams
      await new Promise(r => setTimeout(r, 500));
      const standingsResp = await fetch(
        `${apiBase}/unique-tournament/${tournamentId}/season/${currentSeason.id}/standings/total`,
        opts
      );
      let teams = [];
      if (standingsResp.ok) {
        const standingsData = await standingsResp.json();
        const rows = standingsData?.standings?.[0]?.rows ?? [];
        teams = rows.map(r => ({
          id: r.team?.id,
          name: r.team?.name,
          shortName: r.team?.shortName,
          position: r.position,
          points: r.points,
          played: r.matches,
          wins: r.wins,
          draws: r.draws,
          losses: r.losses,
          goalsFor: r.scoresFor,
          goalsAgainst: r.scoresAgainst,
        }));
      } else {
        console.warn(`[sofascore] standings ${standingsResp.status} for ${tournamentId}/${currentSeason.id}`);
      }

      const result = {
        tournamentId: Number(tournamentId),
        season: { id: currentSeason.id, name: currentSeason.name, year: currentSeason.year },
        teams,
      };

      // Cache for 24h
      try {
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 19).replace('T', ' ');
        await pool.query(
          `INSERT INTO api_football_cache (cache_key, response_json, expires_at) VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), expires_at = VALUES(expires_at), fetched_at = NOW()`,
          [cacheKey, JSON.stringify(result), expiresAt]
        );
      } catch { /* cache write failure is non-critical */ }

      return res.json(result);
    } catch (err) {
      console.error('[sofascore] Error:', err?.message);
      return res.status(502).json({ error: 'SofaScore fetch failed', detail: err?.message });
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
        const result = await enrichOnePlayer(playerInfo, row);
        if (result.ambiguous) { errors++; continue; }
        const { setClauses, params } = result;
        params.push(p.id, userId);
        await pool.query(`UPDATE players SET ${setClauses.join(', ')} WHERE id = ? AND user_id = ?`, params);
        enriched++;
      } catch (e) {
        errors++;
        console.error(`[cron-enrich] Error for ${p.name} (user ${userId}):`, e.message);
      }
      // Rate-limit: 2s between players to respect external APIs
      await new Promise(r => setTimeout(r, 2000));
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
      // Pause between users to spread API load
      if (premiumUsers.length > 1) {
        await new Promise(r => setTimeout(r, 5000));
      }
    }

    console.log('[cron-enrich] Nightly enrichment complete');
  } catch (err) {
    console.error('[cron-enrich] Fatal error:', err.message);
  }
}

// Schedule: every day at 02:00 (only on local server, not Vercel serverless)
if (!isVercel && cron) {
  cron.schedule('0 2 * * *', runNightlyEnrichment, { timezone: 'Europe/Paris' });
  console.log('[startup] Cron scheduled: nightly enrichment at 02:00 Europe/Paris');
}

// ── Admin endpoint: cron enrichment logs & manual trigger ───────────────────

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
    // Players whose contract expires today, in 7 days, or in 30 days
    const [players] = await pool.query(`
      SELECT p.id AS player_id, p.name AS player_name, p.contract_end,
             p.user_id, u.email AS user_email,
             DATEDIFF(p.contract_end, CURDATE()) AS days_left
      FROM players p
      JOIN users u ON u.id = p.user_id
      WHERE p.contract_end IS NOT NULL
        AND p.is_archived = 0
        AND DATEDIFF(p.contract_end, CURDATE()) IN (0, 7, 30)
    `);

    for (const row of players) {
      const daysLeft = row.days_left;
      const label = daysLeft === 0 ? 'expiré aujourd\'hui'
                  : daysLeft === 7 ? 'expire dans 7 jours'
                  : 'expire dans 30 jours';
      const icon = daysLeft === 0 ? 'AlertTriangle' : 'Clock';

      if (!dryRun) {
        await createNotification(row.user_id, {
          type: 'contract_alert',
          title: `Contrat — ${row.player_name}`,
          message: `Le contrat de ${row.player_name} ${label}.`,
          icon,
          link: `/player/${row.player_id}`,
          playerId: row.player_id,
        });
        if (daysLeft <= 7) {
          sendEmail(row.user_email,
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

    await logJobDone(logId, { notified, dry_run: dryRun });
    console.log(`[cron-contracts] ${notified} alert(s)${dryRun ? ' (dry-run)' : ''}`);
  } catch (err) {
    await logJobFailed(logId, err);
    console.error('[cron-contracts] Error:', err.message);
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

// ── Cron schedules (non-Vercel only) ────────────────────────────────────────

if (!isVercel && cron) {
  cron.schedule('0 7 * * *',   () => runMatchReminders(false),            { timezone: 'Europe/Paris' });
  cron.schedule('0 8 * * *',   () => runContractAlerts(false),            { timezone: 'Europe/Paris' });
  cron.schedule('30 4 * * *',  runTokenCleanup,                           { timezone: 'Europe/Paris' });
  cron.schedule('0 9 * * *',   () => runSubscriptionExpiryAlerts(false),  { timezone: 'Europe/Paris' });
  console.log('[startup] Crons scheduled: match-reminders 07:00 | contract-alerts 08:00 | token-cleanup 04:30 | sub-expiry 09:00');
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

app.post("/api/admin/cron-trigger", authMiddleware, ensureAdmin, async (req, res) => {
  const { job, dry_run = true } = req.body || {};
  const jobs = {
    'contract-alerts':    () => runContractAlerts(!!dry_run),
    'match-reminders':    () => runMatchReminders(!!dry_run),
    'token-cleanup':      () => runTokenCleanup(),
    'subscription-expiry':() => runSubscriptionExpiryAlerts(!!dry_run),
    'nightly-enrichment': () => runNightlyEnrichment(),
    'inactive-cleanup':   () => runInactiveUserCleanup(!!dry_run),
  };
  if (!jobs[job]) return res.status(400).json({ error: 'Unknown job' });
  jobs[job]();
  return res.json({ ok: true, job, dry_run: !!dry_run });
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
  });
}

