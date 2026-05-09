/**
 * StatsBomb Open Data — Import Script
 *
 * Fetches data from https://github.com/statsbomb/open-data (raw GitHub)
 * and populates the sb_* tables in the database.
 *
 * Strategy:
 *  1. Check GitHub API for the latest commit SHA on master
 *  2. Compare with the last successful import SHA stored in sb_import_log
 *  3. If unchanged → skip (nothing new)
 *  4. If changed  → import only NEW matches (incremental by match_id)
 *
 * Event aggregation:
 *  Raw events are NOT stored (too large — millions of rows).
 *  They are aggregated at import time → sb_player_match_stats.
 *
 * Run manually:
 *   node server/statsbomb-import.js
 *
 * Or trigger via POST /api/admin/statsbomb/import (admin only)
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import { createDbPoolConfig } from './db-config.js';

// Load .env (same logic as server/index.js)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const pool = mysql.createPool(createDbPoolConfig());

const RAW = 'https://raw.githubusercontent.com/statsbomb/open-data/master/data';
const GH_API = 'https://api.github.com/repos/statsbomb/open-data';

// Respect GitHub rate limits — 60 req/h unauthenticated, use a small delay
const FETCH_DELAY_MS = 500;
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function sbFetch(url, json = true) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'scouty-statsbomb-importer/1.0',
      'Accept': 'application/json',
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`);
  return json ? res.json() : res.text();
}

// ── GitHub latest commit SHA ──────────────────────────────────────────────────
async function getLatestCommitSha() {
  const data = await sbFetch(`${GH_API}/commits?per_page=1&sha=master`);
  return data[0]?.sha || null;
}

async function getLastImportedSha() {
  try {
    const [[row]] = await pool.query(
      "SELECT commit_sha FROM sb_import_log WHERE status = 'done' ORDER BY finished_at DESC LIMIT 1"
    );
    return row?.commit_sha || null;
  } catch { return null; }
}

// ── Already imported match IDs (to skip on incremental run) ──────────────────
async function getImportedMatchIds() {
  const [rows] = await pool.query('SELECT match_id FROM sb_matches');
  return new Set(rows.map(r => r.match_id));
}

// ── Upsert helpers ────────────────────────────────────────────────────────────
async function upsertTeam(conn, teamObj) {
  if (!teamObj?.id) return;
  await conn.query(
    `INSERT INTO sb_teams (team_id, team_name, country) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE team_name = VALUES(team_name)`,
    [teamObj.id, teamObj.name, teamObj.country?.name || null]
  );
}

async function upsertPlayer(conn, p) {
  if (!p?.id) return;
  await conn.query(
    `INSERT INTO sb_players (player_id, player_name, player_nickname, country)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE player_name = VALUES(player_name)`,
    [p.id, p.name, p.nickname || null, p.country?.name || null]
  );
}

// ── Aggregate events for one match into per-player stats maps ─────────────────
function aggregateEvents(events) {
  // Map: player_id → stats object
  const stats = {};

  const get = (playerId, playerName, teamId) => {
    if (!stats[playerId]) {
      stats[playerId] = {
        player_id: playerId,
        player_name: playerName,
        team_id: teamId,
        shots: 0, shots_on_target: 0, goals: 0, xg: 0,
        passes: 0, passes_completed: 0, key_passes: 0, progressive_passes: 0,
        carries: 0, progressive_carries: 0,
        dribbles_attempted: 0, dribbles_completed: 0,
        pressures: 0, tackles: 0, interceptions: 0, blocks: 0, clearances: 0,
        duels_won: 0, duels_total: 0,
        aerials_won: 0, aerials_total: 0,
        fouls_committed: 0, fouls_won: 0,
      };
    }
    return stats[playerId];
  };

  for (const ev of events) {
    const pid = ev.player?.id;
    if (!pid) continue;

    const s = get(pid, ev.player.name, ev.team?.id);
    const type = ev.type?.name;

    if (type === 'Shot') {
      s.shots++;
      s.xg += ev.shot?.statsbomb_xg || 0;
      if (ev.shot?.outcome?.name === 'Goal') s.goals++;
      if (['Goal', 'Saved', 'Saved To Post'].includes(ev.shot?.outcome?.name)) s.shots_on_target++;
    }

    if (type === 'Pass') {
      s.passes++;
      if (ev.pass?.outcome == null) s.passes_completed++; // null outcome = success
      if (ev.pass?.shot_assist || ev.pass?.goal_assist) s.key_passes++;
      // Progressive: end location advances ball ≥10m towards goal and ends in opp half
      const loc = ev.location;
      const endLoc = ev.pass?.end_location;
      if (loc && endLoc) {
        const distToGoalBefore = Math.hypot(120 - loc[0], 40 - loc[1]);
        const distToGoalAfter = Math.hypot(120 - endLoc[0], 40 - endLoc[1]);
        if (distToGoalAfter < distToGoalBefore - 10 && endLoc[0] > 60) s.progressive_passes++;
      }
    }

    if (type === 'Carry') {
      s.carries++;
      const loc = ev.location;
      const endLoc = ev.carry?.end_location;
      if (loc && endLoc) {
        const distToGoalBefore = Math.hypot(120 - loc[0], 40 - loc[1]);
        const distToGoalAfter = Math.hypot(120 - endLoc[0], 40 - endLoc[1]);
        if (distToGoalAfter < distToGoalBefore - 10 && endLoc[0] > 60) s.progressive_carries++;
      }
    }

    if (type === 'Dribble') {
      s.dribbles_attempted++;
      if (ev.dribble?.outcome?.name === 'Complete') s.dribbles_completed++;
    }

    if (type === 'Pressure') s.pressures++;

    if (type === 'Tackle') {
      s.tackles++;
    }

    if (type === 'Interception') s.interceptions++;
    if (type === 'Block') s.blocks++;
    if (type === 'Clearance') s.clearances++;

    if (type === 'Duel') {
      s.duels_total++;
      if (ev.duel?.outcome?.name && ['Won', 'Success', 'Success In Play', 'Success Out'].includes(ev.duel.outcome.name)) {
        s.duels_won++;
      }
    }

    if (type === '50/50') {
      s.aerials_total++;
      if (['Won', 'Success To Team', 'Success To Opposition'].includes(ev['50_50']?.outcome?.name)) {
        s.aerials_won++;
      }
    }

    if (type === 'Foul Committed') s.fouls_committed++;
    if (type === 'Foul Won') s.fouls_won++;
  }

  return stats;
}

// ── Import a single match ─────────────────────────────────────────────────────
async function importMatch(conn, match, competitionId, seasonId) {
  const mid = match.match_id;

  // Upsert teams
  await upsertTeam(conn, match.home_team);
  await upsertTeam(conn, match.away_team);

  // Insert match metadata
  await conn.query(
    `INSERT INTO sb_matches
       (match_id, competition_id, season_id, match_date, kick_off,
        home_team_id, away_team_id, home_score, away_score,
        stadium_name, competition_stage, match_week, has_360)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE match_date = VALUES(match_date)`,
    [
      mid, competitionId, seasonId,
      match.match_date, match.kick_off || null,
      match.home_team.id, match.away_team.id,
      match.home_score ?? null, match.away_score ?? null,
      match.stadium?.name || null,
      match.competition_stage?.name || null,
      match.match_week || null,
      match.match_status_360 === 'available' ? 1 : 0,
    ]
  );

  await sleep(FETCH_DELAY_MS);

  // Fetch lineups
  let lineups = [];
  try {
    lineups = await sbFetch(`${RAW}/lineups/${mid}.json`);
  } catch (e) {
    console.warn(`  [warn] lineups ${mid}: ${e.message}`);
  }

  for (const team of lineups) {
    for (const p of team.lineup || []) {
      await upsertPlayer(conn, p);
      await conn.query(
        `INSERT INTO sb_lineups (match_id, player_id, player_name, team_id, jersey_number)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE jersey_number = VALUES(jersey_number)`,
        [mid, p.player_id, p.player_name, team.team_id, p.jersey_number || null]
      );
    }
  }

  await sleep(FETCH_DELAY_MS);

  // Fetch events and aggregate
  let events = [];
  try {
    events = await sbFetch(`${RAW}/events/${mid}.json`);
  } catch (e) {
    console.warn(`  [warn] events ${mid}: ${e.message}`);
    return;
  }

  const aggStats = aggregateEvents(events);

  for (const [_pid, s] of Object.entries(aggStats)) {
    await conn.query(
      `INSERT INTO sb_player_match_stats
         (match_id, player_id, player_name, team_id, competition_id, season_id, match_date,
          shots, shots_on_target, goals, xg,
          passes, passes_completed, key_passes, progressive_passes,
          carries, progressive_carries,
          dribbles_attempted, dribbles_completed,
          pressures, tackles, interceptions, blocks, clearances,
          duels_won, duels_total, aerials_won, aerials_total,
          fouls_committed, fouls_won)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE goals = VALUES(goals)`,
      [
        mid, s.player_id, s.player_name, s.team_id, competitionId, seasonId, match.match_date,
        s.shots, s.shots_on_target, s.goals, parseFloat(s.xg.toFixed(4)),
        s.passes, s.passes_completed, s.key_passes, s.progressive_passes,
        s.carries, s.progressive_carries,
        s.dribbles_attempted, s.dribbles_completed,
        s.pressures, s.tackles, s.interceptions, s.blocks, s.clearances,
        s.duels_won, s.duels_total, s.aerials_won, s.aerials_total,
        s.fouls_committed, s.fouls_won,
      ]
    );
  }
}

// ── Main import function ──────────────────────────────────────────────────────
export async function runStatsBombImport({ force = false, onProgress = null } = {}) {
  const log = (msg) => {
    console.log(`[statsbomb] ${msg}`);
    if (onProgress) onProgress(msg);
  };

  log('Checking GitHub for latest commit...');
  const latestSha = await getLatestCommitSha();
  if (!latestSha) throw new Error('Could not fetch GitHub commit SHA');

  const lastSha = await getLastImportedSha();
  if (!force && lastSha === latestSha) {
    log(`Already up to date (SHA: ${latestSha.slice(0, 8)}). Nothing to import.`);
    return { skipped: true, sha: latestSha };
  }

  log(`New data detected: ${latestSha.slice(0, 8)} (was: ${lastSha?.slice(0, 8) || 'none'})`);

  // Create import log entry
  const [[{ insertId: logId }]] = await pool.query(
    "INSERT INTO sb_import_log (commit_sha, status) VALUES (?, 'running')",
    [latestSha]
  );

  const importedMatchIds = await getImportedMatchIds();
  let competitionsImported = 0;
  let matchesImported = 0;
  let playersImported = 0;

  try {
    // Fetch competition catalog
    log('Fetching competitions.json...');
    const competitions = await sbFetch(`${RAW}/competitions.json`);

    const conn = await pool.getConnection();
    try {
      // Upsert all competitions
      for (const c of competitions) {
        await conn.query(
          `INSERT INTO sb_competitions
             (competition_id, season_id, competition_name, season_name, country_name, competition_gender)
           VALUES (?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE competition_name = VALUES(competition_name)`,
          [c.competition_id, c.season_id, c.competition_name, c.season_name, c.country_name || null, c.competition_gender || 'male']
        );
        competitionsImported++;
      }

      // Process each competition/season
      for (const comp of competitions) {
        const cid = comp.competition_id;
        const sid = comp.season_id;
        log(`  → ${comp.competition_name} ${comp.season_name}`);

        await sleep(FETCH_DELAY_MS);
        let matches;
        try {
          matches = await sbFetch(`${RAW}/matches/${cid}/${sid}.json`);
        } catch (e) {
          console.warn(`  [warn] matches ${cid}/${sid}: ${e.message}`);
          continue;
        }

        for (const match of matches) {
          if (importedMatchIds.has(match.match_id) && !force) {
            continue; // skip already imported
          }
          try {
            await importMatch(conn, match, cid, sid);
            matchesImported++;
            importedMatchIds.add(match.match_id);
            log(`    ✓ Match ${match.match_id} (${match.home_team?.name} vs ${match.away_team?.name})`);
          } catch (e) {
            console.warn(`    [warn] match ${match.match_id}: ${e.message}`);
          }
        }
      }

      // Count players imported
      const [[{ cnt }]] = await conn.query('SELECT COUNT(*) as cnt FROM sb_players');
      playersImported = cnt;

    } finally {
      conn.release();
    }

    // Mark import as done
    await pool.query(
      `UPDATE sb_import_log SET status='done', competitions_imported=?, matches_imported=?, players_imported=?, finished_at=NOW()
       WHERE id=?`,
      [competitionsImported, matchesImported, playersImported, logId]
    );

    log(`✅ Import complete — ${competitionsImported} competitions, ${matchesImported} new matches, ${playersImported} players total`);
    return { success: true, sha: latestSha, competitionsImported, matchesImported, playersImported };

  } catch (err) {
    await pool.query(
      "UPDATE sb_import_log SET status='failed', error_message=?, finished_at=NOW() WHERE id=?",
      [err.message, logId]
    );
    throw err;
  }
}

// ── CLI entry point (node server/statsbomb-import.js) ────────────────────────
if (process.argv[1]?.endsWith('statsbomb-import.js')) {
  const force = process.argv.includes('--force');
  runStatsBombImport({ force, onProgress: console.log })
    .then(r => { console.log('Done:', r); process.exit(0); })
    .catch(e => { console.error('Error:', e); process.exit(1); });
}
