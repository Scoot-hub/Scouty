/**
 * Standalone cache warmer for SofaScore performance stats.
 *
 * Vercel's shared serverless IP pool is rate-limited (429) by SofaScore.
 * This script runs on GitHub Actions (or locally) — a different IP pool —
 * fetches stats directly, and writes them into `players.external_data`
 * plus the `api_football_cache` table, so Vercel never needs to call
 * SofaScore at runtime.
 *
 * Usage:
 *   node scripts/warm-sofascore-cache.mjs
 *
 * Env:
 *   DATABASE_URL (or TIDB_* / DB_*)     — required, read by db-config.js
 *   REFRESH_DAYS=7                      — re-fetch players whose stats are older
 *   MAX_PLAYERS=0                       — limit run (0 = all)
 *   DELAY_MS=2000                       — pause between unique players
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDbPoolConfig } from '../server/db-config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const REFRESH_DAYS = parseInt(process.env.REFRESH_DAYS || '7', 10);
const MAX_PLAYERS = parseInt(process.env.MAX_PLAYERS || '0', 10) || Infinity;
const DELAY_MS = parseInt(process.env.DELAY_MS || '2000', 10);
const CACHE_TTL_DAYS = 30;

const SOFA_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
  'Referer': 'https://www.sofascore.com/',
  'Origin': 'https://www.sofascore.com',
  'Cache-Control': 'no-cache',
};
const SOFA_BASE = 'https://api.sofascore.com/api/v1';

const pool = mysql.createPool(createDbPoolConfig());

function normalizeStr(str) {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function sofaFetch(apiPath, timeoutMs = 10000) {
  const resp = await fetch(`${SOFA_BASE}${apiPath}`, {
    headers: SOFA_HEADERS,
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!resp.ok) {
    console.warn(`[sofascore] ${resp.status} ${apiPath}`);
    return null;
  }
  return resp.json();
}

async function fetchPlayerStatsFromSofaScore(playerInfo) {
  const searchName = playerInfo.name.trim();
  const searchData = await sofaFetch(`/search/all?q=${encodeURIComponent(searchName)}&page=0`);
  if (!searchData) return null;

  const playerResults = [];
  if (searchData.results) {
    for (const group of searchData.results) {
      if (group.type === 'player' && group.entity) playerResults.push(group.entity);
      if (group.type === 'player' && group.entities) playerResults.push(...group.entities);
    }
  }
  if (playerResults.length === 0 && Array.isArray(searchData.players)) {
    playerResults.push(...searchData.players);
  }
  if (playerResults.length === 0) return null;

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

    if (birthYear && p.dateOfBirthTimestamp) {
      const pYear = new Date(p.dateOfBirthTimestamp * 1000).getFullYear();
      if (pYear === birthYear) score += 30;
      else if (Math.abs(pYear - birthYear) <= 1) score += 15;
    }

    if (playerInfo.club && p.team?.name) {
      const pClub = normalizeStr(playerInfo.club);
      const sClub = normalizeStr(p.team.name);
      if (pClub === sClub || pClub.includes(sClub) || sClub.includes(pClub)) score += 25;
    }

    if (score > bestScore) { bestScore = score; best = p; }
  }

  if (!best || bestScore < 40) return null;

  const sofaId = best.id;
  await new Promise(r => setTimeout(r, 400));
  const playerData = await sofaFetch(`/player/${sofaId}`);
  if (!playerData?.player) return null;

  const pl = playerData.player;
  const teamId = pl.team?.id;
  const tournamentId = pl.team?.tournament?.uniqueTournament?.id;

  if (!teamId || !tournamentId) {
    return {
      sofascore_id: sofaId,
      season: null,
      league: null,
      team: pl.team?.name || null,
      stats: { rating: null, appearances: 0, lineups: 0, minutes: 0, goals: 0, assists: 0 },
      per90: {},
      all_competitions: [],
      source: 'sofascore',
    };
  }

  await new Promise(r => setTimeout(r, 400));
  const seasonsData = await sofaFetch(`/unique-tournament/${tournamentId}/seasons`);
  const currentSeason = seasonsData?.seasons?.[0];
  if (!currentSeason) return null;

  await new Promise(r => setTimeout(r, 400));
  const statsData = await sofaFetch(
    `/player/${sofaId}/unique-tournament/${tournamentId}/season/${currentSeason.id}/statistics/overall`
  );

  const rawStats = statsData?.statistics || {};

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
    passes_accuracy: rawStats.accuratePassesPercentage != null
      ? Math.round(rawStats.accuratePassesPercentage * 100) / 100
      : (rawStats.accuratePasses && rawStats.totalPasses
        ? Math.round(rawStats.accuratePasses / rawStats.totalPasses * 10000) / 100
        : null),
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

  try {
    await new Promise(r => setTimeout(r, 400));
    const tournamentsData = await sofaFetch(`/player/${sofaId}/statistics/seasons`);
    if (tournamentsData?.uniqueTournamentSeasons) {
      for (const ut of tournamentsData.uniqueTournamentSeasons.slice(0, 5)) {
        const utId = ut.uniqueTournament?.id;
        const utSeason = ut.seasons?.[0];
        if (!utId || !utSeason) continue;

        if (utId === tournamentId) {
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
    console.warn('[sofascore] multi-competition error:', e.message);
  }

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

  return result;
}

async function writeCacheEntry(cacheKey, result) {
  const expiresAt = new Date(Date.now() + CACHE_TTL_DAYS * 24 * 60 * 60 * 1000)
    .toISOString().slice(0, 19).replace('T', ' ');
  await pool.query(
    `INSERT INTO api_football_cache (cache_key, response_json, expires_at) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE response_json = VALUES(response_json), expires_at = VALUES(expires_at), fetched_at = NOW()`,
    [cacheKey, JSON.stringify(result), expiresAt]
  );
}

async function updatePlayerRow(row, result) {
  let ext = {};
  try { ext = JSON.parse(row.external_data || '{}') || {}; } catch {}
  ext.performance_stats = { ...result, _fetched_at: new Date().toISOString() };
  if (result.sofascore_id) ext.sofascore_id = result.sofascore_id;
  await pool.query(
    'UPDATE players SET external_data = ?, external_data_fetched_at = NOW() WHERE id = ?',
    [JSON.stringify(ext), row.id]
  );
}

async function main() {
  console.log(`[warm] Config: REFRESH_DAYS=${REFRESH_DAYS}, MAX_PLAYERS=${MAX_PLAYERS === Infinity ? 'all' : MAX_PLAYERS}, DELAY_MS=${DELAY_MS}`);

  const [rows] = await pool.query(
    `SELECT id, name, club, nationality, generation, external_data
     FROM players
     WHERE name IS NOT NULL AND name <> ''
     ORDER BY name`
  );
  console.log(`[warm] ${rows.length} player rows in DB`);

  // Group rows by unique (name, generation) so we only hit SofaScore once per real player
  const groups = new Map();
  for (const row of rows) {
    const key = `${normalizeStr(row.name)}_${row.generation || ''}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }

  // Figure out which groups need refresh
  const cutoff = Date.now() - REFRESH_DAYS * 24 * 60 * 60 * 1000;
  const needRefresh = [];
  for (const [key, groupRows] of groups) {
    const anyStale = groupRows.some(r => {
      let ext = {};
      try { ext = JSON.parse(r.external_data || '{}') || {}; } catch {}
      const fetched = ext.performance_stats?._fetched_at;
      if (!fetched) return true;
      return new Date(fetched).getTime() < cutoff;
    });
    if (anyStale) needRefresh.push({ key, groupRows });
  }
  console.log(`[warm] ${groups.size} unique players, ${needRefresh.length} need refresh`);

  const toProcess = needRefresh.slice(0, MAX_PLAYERS);
  let ok = 0, fail = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const { key, groupRows } = toProcess[i];
    const first = groupRows[0];
    const playerInfo = {
      name: first.name,
      club: first.club,
      nationality: first.nationality,
      generation: first.generation ? parseInt(first.generation) : null,
    };

    try {
      const result = await fetchPlayerStatsFromSofaScore(playerInfo);
      if (result) {
        await writeCacheEntry(`sofascore_player_${key}`, result);
        for (const r of groupRows) {
          await updatePlayerRow(r, result);
        }
        ok++;
        console.log(`[warm] ${i + 1}/${toProcess.length} ${first.name} ✓ (${result.stats?.appearances || 0} apps, ${groupRows.length} row${groupRows.length > 1 ? 's' : ''})`);
      } else {
        fail++;
        console.log(`[warm] ${i + 1}/${toProcess.length} ${first.name} ✗ no match`);
      }
    } catch (e) {
      fail++;
      console.warn(`[warm] ${i + 1}/${toProcess.length} ${first.name} error: ${e.message}`);
    }

    if (i < toProcess.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`[warm] Done: ${ok} updated, ${fail} failed, ${groups.size - needRefresh.length} still fresh`);
  await pool.end();
}

main().catch(e => {
  console.error('[warm] Fatal:', e);
  process.exit(1);
});
