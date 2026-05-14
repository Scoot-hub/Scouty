#!/usr/bin/env node
// Backfill tm_player_cache + tm_name_resolution from existing data.
//
// USAGE
//   node server/scripts/backfill-tm-cache.js              # dry-run
//   node server/scripts/backfill-tm-cache.js --apply      # commit
//
// SOURCES (all rows ALREADY scraped at some point — we just consolidate them
// in the new shared tables so subsequent calls become zero-cost):
//   1. players.external_data + players.transfermarkt_id
//      → one row per distinct tm_id in tm_player_cache (picks the freshest)
//      → one row per (normalize(name), normalize(club)) in tm_name_resolution
//   2. player_name_aliases joined to players
//      → additional rows in tm_name_resolution mapping every known variant
//        (e.g. "K. Mbappé" → tm_id 342229) to the same canonical tm_id
//
// CACHE FRESHNESS
//   We carry over players.external_data_fetched_at as the "fetched_at" of the
//   cache row. expires_at = fetched_at + 24h, so anything fetched >24h ago is
//   already considered stale (correct — we don't want to lie about freshness).

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

const pool = mysql.createPool(createDbPoolConfig());

async function main() {
  console.log(`Mode: ${apply ? "APPLY" : "DRY-RUN"}`);

  // ─── 1) Build tm_player_cache rows from players.external_data ─────────────
  // Group by tm_id; pick the most recent external_data_fetched_at per group.
  const [enriched] = await pool.query(`
    SELECT p.id, p.transfermarkt_id, p.name, p.club, p.external_data, p.external_data_fetched_at
      FROM players p
     WHERE p.transfermarkt_id IS NOT NULL
       AND p.transfermarkt_id <> ''
       AND p.external_data IS NOT NULL
  `);
  console.log(`Loaded ${enriched.length} enriched player rows with TM id.`);

  // Pick best payload per tm_id (most recent fetched_at; tie → longer JSON)
  const byTm = new Map();
  for (const r of enriched) {
    const ex = byTm.get(r.transfermarkt_id);
    const candTime = r.external_data_fetched_at ? new Date(r.external_data_fetched_at).getTime() : 0;
    const exTime   = ex?.external_data_fetched_at ? new Date(ex.external_data_fetched_at).getTime() : 0;
    if (!ex || candTime > exTime || (candTime === exTime && (r.external_data?.length || 0) > (ex.external_data?.length || 0))) {
      byTm.set(r.transfermarkt_id, r);
    }
  }
  console.log(`Distinct TM ids → ${byTm.size}`);

  // tm_player_cache payload should match what enrichOnePlayer expects from the
  // TM-fetch function: { tmId, canonicalName, contract, marketValue, agent, ... }.
  // external_data is the POST-merge enriched_data already (TM + TSDB + Wikidata).
  // We can't perfectly reconstruct the pre-merge TM-only payload, so we build a
  // best-effort projection of the TM-relevant fields. Callers will still pick up
  // TSDB/Wikidata enrichment on next refresh — this just avoids re-scraping TM.
  let cacheInserted = 0;
  for (const [tmId, row] of byTm) {
    let ext = {};
    try { ext = typeof row.external_data === "string" ? JSON.parse(row.external_data) : row.external_data || {}; } catch {}

    const payload = {
      tmId: String(tmId),
      canonicalName: row.name || ext.canonical_name || null,
      contract: ext.contract_end || null,
      heightCm: ext.height ? parseInt(String(ext.height).replace(/\D/g, ""), 10) || null : null,
      agent: ext.agent || null,
      marketValue: ext.market_value || null,
      currentClub: ext.enriched_club || row.club || null,
      onLoan: !!ext.on_loan,
      parentClub: ext.parent_club || null,
      loanEndDate: ext.loan_end_date || null,
      parentContractEnd: null,
      photoUrl: null, // photo lives on players.photo_url, not in ext
      clubLogoUrl: null,
      footRaw: null,
      positionRaw: null,
      nationalityRaw: null,
      career: ext.career || null,
      seasonStats: ext.season_stats || null,
    };

    const fetchedAt = row.external_data_fetched_at || new Date();
    if (apply) {
      try {
        await pool.query(
          `INSERT INTO tm_player_cache (tm_id, canonical_name, payload_json, fetched_at, expires_at)
           VALUES (?, ?, ?, ?, DATE_ADD(?, INTERVAL 24 HOUR))
           ON DUPLICATE KEY UPDATE
             canonical_name = VALUES(canonical_name),
             payload_json   = VALUES(payload_json),
             fetched_at     = VALUES(fetched_at),
             expires_at     = VALUES(expires_at)`,
          [String(tmId), payload.canonicalName, JSON.stringify(payload), fetchedAt, fetchedAt]
        );
        cacheInserted++;
      } catch (e) {
        console.warn(`[cache] tm=${tmId} failed: ${e.message}`);
      }
    } else {
      cacheInserted++;
    }
  }
  console.log(`tm_player_cache rows ${apply ? "inserted/updated" : "would be inserted"}: ${cacheInserted}`);

  // ─── 2) Build tm_name_resolution from canonical players + aliases ─────────
  // Phase A: canonical (player.name, player.club) → tm_id, confidence=100
  // Phase B: every alias_norm pointing at an enriched player → tm_id, confidence=80
  const seenKey = new Set();
  const resolutionRows = [];

  for (const r of enriched) {
    const nm = normalizeStr(r.name).slice(0, 120);
    const cl = normalizeStr(r.club).slice(0, 80);
    if (!nm) continue;
    const k = `${nm}\0${cl}`;
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    resolutionRows.push({ nameNorm: nm, clubNorm: cl, tmId: String(r.transfermarkt_id), confidence: 100 });
  }
  console.log(`Phase A (canonical name+club): ${resolutionRows.length} unique rows`);

  // Phase B: aliases. Join player_name_aliases with players to get tm_id and club
  let aliasRows = [];
  try {
    const [r] = await pool.query(`
      SELECT a.alias_norm, p.transfermarkt_id, p.club
        FROM player_name_aliases a
        JOIN players p ON p.id = a.player_id
       WHERE p.transfermarkt_id IS NOT NULL AND p.transfermarkt_id <> ''
    `);
    aliasRows = r;
  } catch (e) {
    console.warn(`[backfill] player_name_aliases not available: ${e.message}`);
  }

  let aliasAdded = 0;
  for (const a of aliasRows) {
    const nm = String(a.alias_norm || '').slice(0, 120);
    const cl = normalizeStr(a.club).slice(0, 80);
    if (!nm) continue;
    const k = `${nm}\0${cl}`;
    if (seenKey.has(k)) continue;
    seenKey.add(k);
    resolutionRows.push({ nameNorm: nm, clubNorm: cl, tmId: String(a.transfermarkt_id), confidence: 80 });
    aliasAdded++;
  }
  console.log(`Phase B (aliases): +${aliasAdded} unique rows`);
  console.log(`tm_name_resolution rows ${apply ? "to insert" : "would insert"}: ${resolutionRows.length}`);

  if (apply && resolutionRows.length > 0) {
    const CHUNK = 500;
    let inserted = 0;
    for (let i = 0; i < resolutionRows.length; i += CHUNK) {
      const slice = resolutionRows.slice(i, i + CHUNK);
      const ph = slice.map(() => "(?, ?, ?, ?, NOW())").join(", ");
      const vals = slice.flatMap(r => [r.nameNorm, r.clubNorm, r.tmId, r.confidence]);
      try {
        await pool.query(
          `INSERT INTO tm_name_resolution (name_norm, club_norm, tm_id, confidence, resolved_at)
           VALUES ${ph}
           ON DUPLICATE KEY UPDATE
             tm_id       = IF(VALUES(confidence) >= confidence, VALUES(tm_id), tm_id),
             confidence  = GREATEST(confidence, VALUES(confidence)),
             resolved_at = NOW()`,
          vals
        );
        inserted += slice.length;
      } catch (e) {
        console.warn(`[resolution] chunk ${i} failed: ${e.message}`);
      }
    }
    console.log(`tm_name_resolution: ${inserted} rows committed.`);
  }

  // ─── Summary ──────────────────────────────────────────────────────────────
  const [[{ c1 }]] = await pool.query("SELECT COUNT(*) AS c1 FROM tm_player_cache").catch(() => [[{ c1: 0 }]]);
  const [[{ c2 }]] = await pool.query("SELECT COUNT(*) AS c2 FROM tm_name_resolution").catch(() => [[{ c2: 0 }]]);
  console.log(`\n========== SUMMARY ==========`);
  console.log(`tm_player_cache total rows     : ${c1}`);
  console.log(`tm_name_resolution total rows  : ${c2}`);
  if (!apply) console.log(`\n(dry-run — re-run with --apply to commit.)`);

  await pool.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  pool.end().finally(() => process.exit(1));
});
