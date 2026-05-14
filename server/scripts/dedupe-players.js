#!/usr/bin/env node
// Standalone duplicate-player merger for a single user account.
//
// USAGE
//   node server/scripts/dedupe-players.js --email <user-email>
//   node server/scripts/dedupe-players.js --user-id <uuid>
//   node server/scripts/dedupe-players.js --email <e> --apply   # actually merge
//
// SAFETY
//   * Dry-run by default. Pass --apply to commit changes.
//   * Each merge runs in its own transaction; a failing merge rolls back
//     without touching the others.
//   * Operates ONLY on players belonging to the target user_id.
//   * Logs every action; nothing is silent.
//
// DETECTION RULES (each pair is consumed by the FIRST rule that catches it)
//   R1 same_tm_id     — both rows have the same non-null transfermarkt_id
//   R2 exact_name     — same normalize_name AND same normalize_club (or both empty)
//   R3 name_only      — same normalize_name, club differs but at least one is empty
//   R4 initial_last   — "K. Mbappé" ↔ "Kylian Mbappé" + same normalize_club
//
// WINNER SELECTION (highest score wins; tie → most-recent updated_at)
//   +10  has transfermarkt_id
//   + 5  has external_data (was enriched)
//   + 3  has photo_url
//   + 2  has date_of_birth
//   + 1 per extra char in `name` length (canonical names are usually longer)
//
// RELATED TABLES (player_id FK moved from loser → winner)
//   Discovered dynamically from INFORMATION_SCHEMA so newly added tables are
//   handled automatically. For tables with unique keys involving player_id,
//   conflicting loser rows are DELETED (winner's row is kept); non-conflicting
//   rows are migrated.

import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import mysql from "mysql2/promise";
import { createDbPoolConfig } from "../db-config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, "..", "..", ".env") });

// ─── CLI ────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const has = (name) => args.includes(name);
const apply  = has("--apply");
const email  = arg("--email");
const userId = arg("--user-id");
const limit  = parseInt(arg("--limit") || "0", 10) || 0;

if (!email && !userId) {
  console.error("Usage: node server/scripts/dedupe-players.js --email <e> [--apply] [--limit N]");
  process.exit(1);
}

// ─── Helpers (mirror server/index.js semantics) ────────────────────────────
function normalizeStr(str) {
  return (str || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function initialLastKey(s) {
  const n = normalizeStr(s);
  if (!n) return "";
  const tokens = n.split(" ").filter(Boolean);
  if (tokens.length < 2) return "";
  return `${tokens[0][0]} ${tokens[tokens.length - 1]}`;
}
function scorePlayer(p) {
  let s = 0;
  if (p.transfermarkt_id) s += 10;
  if (p.external_data) s += 5;
  if (p.photo_url) s += 3;
  if (p.date_of_birth) s += 2;
  s += Math.min(20, (p.name || "").length);
  return s;
}
function pickWinner(rows) {
  return rows.slice().sort((a, b) => {
    const sa = scorePlayer(a), sb = scorePlayer(b);
    if (sb !== sa) return sb - sa;
    const ta = a.updated_at ? new Date(a.updated_at).getTime() : 0;
    const tb = b.updated_at ? new Date(b.updated_at).getTime() : 0;
    return tb - ta;
  })[0];
}

// ─── Connect ────────────────────────────────────────────────────────────────
const pool = mysql.createPool(createDbPoolConfig());
let resolvedUserId = userId;

async function resolveUserId() {
  if (resolvedUserId) return resolvedUserId;
  const [rows] = await pool.query(
    "SELECT id, email FROM users WHERE email = ? LIMIT 1",
    [email]
  );
  if (!rows.length) throw new Error(`No user found with email ${email}`);
  resolvedUserId = rows[0].id;
  console.log(`→ Resolved user: ${rows[0].email} (id=${rows[0].id})`);
  return resolvedUserId;
}

// ─── Detect duplicate groups ────────────────────────────────────────────────
async function loadPlayers(uid) {
  const [rows] = await pool.query(
    `SELECT id, name, club, transfermarkt_id, external_data, photo_url,
            date_of_birth, updated_at, created_at, wyscout_division
       FROM players
      WHERE user_id = ?`,
    [uid]
  );
  return rows;
}

function buildGroups(players) {
  const groups = []; // [{rule, key, members:[...players]}]
  const consumed = new Set();
  const claim = (ids) => ids.forEach(id => consumed.add(id));

  // R1: same transfermarkt_id
  {
    const byTm = new Map();
    for (const p of players) {
      if (!p.transfermarkt_id || consumed.has(p.id)) continue;
      const k = String(p.transfermarkt_id);
      const arr = byTm.get(k) || [];
      arr.push(p); byTm.set(k, arr);
    }
    for (const [k, arr] of byTm) {
      if (arr.length < 2) continue;
      groups.push({ rule: "same_tm_id", key: k, members: arr });
      claim(arr.map(p => p.id));
    }
  }

  // R2: exact normalized name + club
  {
    const byNc = new Map();
    for (const p of players) {
      if (consumed.has(p.id)) continue;
      const nm = normalizeStr(p.name);
      if (!nm) continue;
      const cl = normalizeStr(p.club);
      const k = `${nm}\0${cl}`;
      const arr = byNc.get(k) || [];
      arr.push(p); byNc.set(k, arr);
    }
    for (const [k, arr] of byNc) {
      if (arr.length < 2) continue;
      groups.push({ rule: "exact_name", key: k, members: arr });
      claim(arr.map(p => p.id));
    }
  }

  // R3: exact normalized name (any club; at least one empty)
  {
    const byN = new Map();
    for (const p of players) {
      if (consumed.has(p.id)) continue;
      const nm = normalizeStr(p.name);
      if (!nm) continue;
      const arr = byN.get(nm) || [];
      arr.push(p); byN.set(nm, arr);
    }
    for (const [k, arr] of byN) {
      if (arr.length < 2) continue;
      const hasEmptyClub = arr.some(p => !normalizeStr(p.club));
      if (!hasEmptyClub) continue; // require at least one with empty club
      groups.push({ rule: "name_only", key: k, members: arr });
      claim(arr.map(p => p.id));
    }
  }

  // R4: initial+last + same normalized club
  {
    const byIl = new Map();
    for (const p of players) {
      if (consumed.has(p.id)) continue;
      const il = initialLastKey(p.name);
      if (!il) continue;
      const cl = normalizeStr(p.club);
      const k = `${il}\0${cl}`;
      const arr = byIl.get(k) || [];
      arr.push(p); byIl.set(k, arr);
    }
    for (const [k, arr] of byIl) {
      if (arr.length < 2) continue;
      // Require at least two distinct normalized names (otherwise R2 would have caught it)
      const distinctNames = new Set(arr.map(p => normalizeStr(p.name)));
      if (distinctNames.size < 2) continue;
      // Require at least one truncated form (single-token first name OR initial-style)
      const hasTruncated = arr.some(p => {
        const tokens = normalizeStr(p.name).split(" ").filter(Boolean);
        return tokens.length >= 2 && tokens[0].length === 1;
      });
      if (!hasTruncated) continue;
      groups.push({ rule: "initial_last", key: k, members: arr });
      claim(arr.map(p => p.id));
    }
  }

  return groups;
}

// ─── Discover player_id-bearing tables ──────────────────────────────────────
async function discoverPlayerIdTables() {
  const [rows] = await pool.query(`
    SELECT TABLE_NAME, COLUMN_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND COLUMN_NAME  = 'player_id'
       AND COLUMN_TYPE LIKE 'char(36)%'
       AND TABLE_NAME  <> 'players'
  `);
  return rows.map(r => r.TABLE_NAME);
}

async function getUniqueKeysWithPlayerId(table) {
  // Find composite unique keys that contain player_id; return list of {key_name, other_cols}
  const [idx] = await pool.query(`SHOW INDEX FROM \`${table}\``);
  const grouped = new Map();
  for (const r of idx) {
    if (r.Non_unique !== 0) continue;
    const arr = grouped.get(r.Key_name) || [];
    arr.push(r.Column_name); grouped.set(r.Key_name, arr);
  }
  const out = [];
  for (const [name, cols] of grouped) {
    if (!cols.includes("player_id")) continue;
    if (cols.length === 1) continue; // PK on player_id alone — caller must handle
    out.push({ name, otherCols: cols.filter(c => c !== "player_id") });
  }
  return out;
}

// ─── Merge a single duplicate group ────────────────────────────────────────
async function mergeGroup(group, tables, conn) {
  const winner = pickWinner(group.members);
  const losers = group.members.filter(p => p.id !== winner.id);
  const stats = { winnerId: winner.id, loserIds: losers.map(l => l.id), rowsMoved: 0, rowsDeleted: 0, perTable: {} };

  for (const loser of losers) {
    for (const t of tables) {
      const uks = await getUniqueKeysWithPlayerId(t);
      let moved = 0, deleted = 0;

      // For each unique key, delete loser rows that would collide with winner rows
      for (const uk of uks) {
        const otherCols = uk.otherCols.map(c => `\`${c}\``).join(", ");
        const matchCond = uk.otherCols.map(c => `l.\`${c}\` = w.\`${c}\``).join(" AND ");
        const [res] = await conn.query(
          `DELETE l FROM \`${t}\` l
             JOIN \`${t}\` w ON ${matchCond}
            WHERE l.player_id = ? AND w.player_id = ? AND l.player_id <> w.player_id`,
          [loser.id, winner.id]
        );
        deleted += res.affectedRows || 0;
      }

      // Move remaining loser rows to winner. Wrap in try/catch in case there's
      // a single-column unique key on player_id alone (PK), or other constraints.
      try {
        const [res] = await conn.query(
          `UPDATE \`${t}\` SET player_id = ? WHERE player_id = ?`,
          [winner.id, loser.id]
        );
        moved = res.affectedRows || 0;
      } catch (err) {
        if (err.code === "ER_DUP_ENTRY") {
          // Final fallback: delete the leftover loser rows
          const [res] = await conn.query(`DELETE FROM \`${t}\` WHERE player_id = ?`, [loser.id]);
          deleted += res.affectedRows || 0;
        } else {
          throw err;
        }
      }

      if (moved || deleted) {
        stats.perTable[t] = stats.perTable[t] || { moved: 0, deleted: 0 };
        stats.perTable[t].moved   += moved;
        stats.perTable[t].deleted += deleted;
        stats.rowsMoved   += moved;
        stats.rowsDeleted += deleted;
      }
    }

    // Finally drop the loser player row
    await conn.query("DELETE FROM players WHERE id = ?", [loser.id]);
  }

  return stats;
}

// ─── Main ───────────────────────────────────────────────────────────────────
async function main() {
  const uid = await resolveUserId();
  const players = await loadPlayers(uid);
  console.log(`\nLoaded ${players.length} players for user.`);

  const groups = buildGroups(players);
  const totalDupRows = groups.reduce((n, g) => n + g.members.length, 0);
  const wouldDelete  = groups.reduce((n, g) => n + (g.members.length - 1), 0);

  // ─── Per-rule stats ──
  const byRule = {};
  for (const g of groups) {
    byRule[g.rule] = byRule[g.rule] || { groups: 0, players: 0 };
    byRule[g.rule].groups  += 1;
    byRule[g.rule].players += g.members.length;
  }

  console.log("\n========== DRY-RUN SUMMARY ==========");
  console.log(`Total players                 : ${players.length}`);
  console.log(`Duplicate groups detected     : ${groups.length}`);
  console.log(`Players in duplicate groups   : ${totalDupRows}`);
  console.log(`Players that WOULD be deleted : ${wouldDelete}`);
  console.log(`Per rule:`);
  for (const [r, s] of Object.entries(byRule)) {
    console.log(`  - ${r.padEnd(14)} : ${s.groups} groups, ${s.players} players`);
  }

  // Show up to 10 examples per rule (so initial_last groups are not hidden behind name_only ones)
  const PER_RULE_EXAMPLES = 10;
  const grouped = {};
  for (const g of groups) (grouped[g.rule] = grouped[g.rule] || []).push(g);
  for (const rule of Object.keys(grouped)) {
    console.log(`\n========== EXAMPLES rule=${rule} (showing ${Math.min(PER_RULE_EXAMPLES, grouped[rule].length)} of ${grouped[rule].length}) ==========`);
    for (const g of grouped[rule].slice(0, PER_RULE_EXAMPLES)) {
      const winner = pickWinner(g.members);
      console.log(`[${g.rule}] key="${g.key.replace(/\0/g, " | ")}"`);
      for (const p of g.members) {
        const tag = p.id === winner.id ? "WIN " : "drop";
        console.log(`  ${tag} ${p.id.slice(0, 8)}  name="${p.name}"  club="${p.club || ""}"  tm=${p.transfermarkt_id || "-"}  ext=${p.external_data ? "y" : "n"}  upd=${p.updated_at?.toISOString?.()?.slice(0, 10) || "-"}`);
      }
    }
  }

  if (!apply) {
    console.log(`\n(dry-run — no changes made. Re-run with --apply to commit.)`);
    await pool.end();
    return;
  }

  // ─── APPLY ──
  console.log("\n========== APPLYING MERGES ==========");
  const tables = await discoverPlayerIdTables();
  console.log(`Related tables discovered: ${tables.length} → ${tables.join(", ")}`);

  const toRun = limit > 0 ? groups.slice(0, limit) : groups;
  const totals = { groupsMerged: 0, playersDeleted: 0, rowsMoved: 0, rowsDeleted: 0, errors: [] };
  let i = 0;
  for (const g of toRun) {
    i++;
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      const stats = await mergeGroup(g, tables, conn);
      await conn.commit();
      totals.groupsMerged   += 1;
      totals.playersDeleted += stats.loserIds.length;
      totals.rowsMoved      += stats.rowsMoved;
      totals.rowsDeleted    += stats.rowsDeleted;
      if (i <= 50 || i % 50 === 0) {
        console.log(`  [${i}/${toRun.length}] ${g.rule} → winner=${stats.winnerId.slice(0, 8)} losers=${stats.loserIds.length} moved=${stats.rowsMoved} deleted=${stats.rowsDeleted}`);
      }
    } catch (err) {
      await conn.rollback();
      console.error(`  [${i}/${toRun.length}] FAILED ${g.rule} key="${g.key}": ${err.message}`);
      totals.errors.push({ rule: g.rule, key: g.key, error: err.message });
    } finally {
      conn.release();
    }
  }

  console.log("\n========== APPLY DONE ==========");
  console.log(`Groups merged    : ${totals.groupsMerged}/${toRun.length}`);
  console.log(`Players deleted  : ${totals.playersDeleted}`);
  console.log(`FK rows moved    : ${totals.rowsMoved}`);
  console.log(`FK rows deleted  : ${totals.rowsDeleted}`);
  console.log(`Errors           : ${totals.errors.length}`);
  if (totals.errors.length > 0) {
    console.log("First 5 errors:");
    totals.errors.slice(0, 5).forEach(e => console.log(`  - [${e.rule}] ${e.key}: ${e.error}`));
  }

  await pool.end();
}

main().catch(err => {
  console.error("FATAL:", err);
  pool.end().finally(() => process.exit(1));
});
