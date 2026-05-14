#!/usr/bin/env node
// Backfill players.name with the TM canonical name when the local name is
// truncated/initialed (e.g. "A Adorante" → "Andrea Adorante").
//
// USAGE
//   node server/scripts/backfill-canonical-names.js              # dry-run
//   node server/scripts/backfill-canonical-names.js --apply      # commit
//
// SOURCES
//   - tm_player_cache.canonical_name keyed by tm_id (populated by enrichOnePlayer
//     and by backfill-tm-cache.js). When the cache row is missing we fall back
//     to the most recent TM-source alias in player_name_aliases for that player.
//
// SAFETY
//   shouldUseCanonicalName gates updates so we ONLY rewrite when:
//     • local & canonical both have ≥ 2 tokens
//     • last names match (accent-insensitive)
//     • local first name is a single-letter initial, OR canonical is a strict
//       superset of local with more tokens
//   This blocks renames across homonyms, manual full-name overrides, etc.
//
// The pre-update local name is preserved as an alias (source='tm') so lookups
// and imports of the old form still resolve to the same player.

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { createDbPoolConfig } from "../db-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

const apply = process.argv.includes("--apply");

function normalizeStr(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

  for (const t of localTokens) {
    const tn = normalizeStr(t.replace(/\./g, ""));
    if (!tn || tn.length === 1) continue;
    if (!consume(c => c === tn)) return false;
  }
  for (const t of localTokens) {
    const tn = normalizeStr(t.replace(/\./g, ""));
    if (tn.length !== 1) continue;
    if (!consume(c => c.startsWith(tn))) return false;
  }
  return true;
}

const pool = mysql.createPool(createDbPoolConfig());

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);

  // 1) Enriched players that have a canonical name in tm_player_cache.
  const [withCache] = await pool.query(`
    SELECT p.id, p.user_id, p.name, p.transfermarkt_id, c.canonical_name
      FROM players p
      JOIN tm_player_cache c ON c.tm_id = p.transfermarkt_id
     WHERE p.transfermarkt_id IS NOT NULL
       AND p.transfermarkt_id <> ''
       AND c.canonical_name IS NOT NULL
       AND c.canonical_name <> ''
  `);
  console.log(`Loaded ${withCache.length} enriched players with cached canonical name.`);

  // 2) Fallback: for enriched players without a cache row OR with NULL canonical,
  //    use the longest TM-source alias as a proxy for canonical.
  const [withoutCache] = await pool.query(`
    SELECT p.id, p.user_id, p.name, p.transfermarkt_id
      FROM players p
 LEFT JOIN tm_player_cache c ON c.tm_id = p.transfermarkt_id
     WHERE p.transfermarkt_id IS NOT NULL
       AND p.transfermarkt_id <> ''
       AND (c.tm_id IS NULL OR c.canonical_name IS NULL OR c.canonical_name = '')
  `);
  console.log(`Enriched players missing cache canonical: ${withoutCache.length} (falling back to aliases).`);

  // Pull alias raw_names for those players in one go.
  const aliasFallback = new Map(); // player_id → longest plausible alias name
  if (withoutCache.length > 0) {
    const ids = withoutCache.map(r => r.id);
    const placeholders = ids.map(() => "?").join(",");
    let aliasRows = [];
    try {
      const [r] = await pool.query(
        `SELECT player_id, raw_name FROM player_name_aliases
          WHERE source = 'tm' AND player_id IN (${placeholders})`,
        ids,
      );
      aliasRows = r;
    } catch (e) {
      console.warn(`[backfill] alias fallback query failed: ${e.message}`);
    }
    for (const a of aliasRows) {
      const cur = aliasFallback.get(a.player_id);
      const cand = String(a.raw_name || "").trim();
      // Prefer the alias with the most tokens (likely the canonical full name).
      const candTokens = cand.split(/\s+/).filter(Boolean).length;
      const curTokens  = cur ? cur.split(/\s+/).filter(Boolean).length : 0;
      if (!cur || candTokens > curTokens) aliasFallback.set(a.player_id, cand);
    }
  }

  // Build the unified candidate list.
  const candidates = [];
  for (const r of withCache) {
    candidates.push({ id: r.id, user_id: r.user_id, current: r.name, canonical: r.canonical_name, source: "cache" });
  }
  for (const r of withoutCache) {
    const alias = aliasFallback.get(r.id);
    if (alias) {
      candidates.push({ id: r.id, user_id: r.user_id, current: r.name, canonical: alias, source: "alias" });
    }
  }

  // Filter to the ones our heuristic accepts.
  const toUpdate = candidates.filter(c => shouldUseCanonicalName(c.current, c.canonical));

  console.log(`\nCandidates evaluated: ${candidates.length}`);
  console.log(`Would update: ${toUpdate.length}`);
  console.log(`Skipped: ${candidates.length - toUpdate.length}`);

  // Show a sample
  const sample = toUpdate.slice(0, 30);
  if (sample.length > 0) {
    console.log(`\nSample of planned updates:`);
    for (const u of sample) {
      console.log(`  [${u.source}] "${u.current}" → "${u.canonical}"  (id=${u.id})`);
    }
    if (toUpdate.length > sample.length) {
      console.log(`  … and ${toUpdate.length - sample.length} more`);
    }
  }

  if (!apply) {
    console.log(`\n(dry-run — re-run with --apply to commit.)`);
    await pool.end();
    return;
  }

  // Apply: per-row UPDATE so we can also stamp an alias for the old name.
  let updated = 0;
  let aliasInserted = 0;
  let failed = 0;
  for (const u of toUpdate) {
    const newName = String(u.canonical).slice(0, 255);
    const oldName = String(u.current).slice(0, 255);
    try {
      await pool.query(`UPDATE players SET name = ?, updated_at = NOW() WHERE id = ?`, [newName, u.id]);
      updated++;
      // Preserve old name → player mapping
      const aliasNorm = normalizeStr(oldName).slice(0, 191);
      if (aliasNorm) {
        try {
          const [r] = await pool.query(
            `INSERT IGNORE INTO player_name_aliases (alias_norm, player_id, source, raw_name)
             VALUES (?, ?, 'tm', ?)`,
            [aliasNorm, u.id, oldName],
          );
          if (r.affectedRows) aliasInserted++;
        } catch (e) {
          // alias failure is non-fatal
        }
      }
    } catch (e) {
      failed++;
      console.warn(`[update] id=${u.id} failed: ${e.message}`);
    }
  }

  console.log(`\n========== SUMMARY ==========`);
  console.log(`Players renamed         : ${updated}`);
  console.log(`Old-name aliases stored : ${aliasInserted}`);
  console.log(`Failures                : ${failed}`);

  await pool.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  pool.end().finally(() => process.exit(1));
});
