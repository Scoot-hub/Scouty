/**
 * seed-logos-i18n.js
 * Populates name_fr, name_en, name_es columns in club_logos
 * by querying Wikidata for multilingual team labels.
 *
 * Usage: node server/seed-logos-i18n.js
 * Resumable: skips clubs that already have all 3 translations filled.
 *
 * Sources:
 *   1. Wikidata wbsearchentities + wbgetentities (free, no key)
 *   2. TheSportsDB strTeamAlternate as fallback aliases
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createDbPoolConfig } from './db-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const DELAY = 400; // ms between API calls

// ── DB ──────────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  ...createDbPoolConfig(),
  connectionLimit: 3,
});

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Wikidata helpers ────────────────────────────────────────────────────────

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return res.json();
  } catch { return null; }
}

/**
 * Search Wikidata for a football club entity matching the given name.
 * Returns the entity ID (e.g. "Q30") or null.
 */
async function wikidataSearch(clubName) {
  // Try English first, then French
  for (const lang of ['en', 'fr', 'es']) {
    const url = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(clubName)}&language=${lang}&type=item&format=json&limit=10`;
    const data = await fetchJSON(url);
    if (!data?.search?.length) continue;

    // Return best match — prefer items whose description mentions "football" or "soccer"
    const footballItem = data.search.find(item =>
      (item.description || '').match(/football|soccer|fútbol|calcio|voetbal|fußball|club/i)
    );
    if (footballItem) return footballItem.id;

    // Fallback: first result
    return data.search[0].id;
  }
  return null;
}

/**
 * Get multilingual labels (fr, en, es) + aliases for a Wikidata entity.
 */
async function wikidataGetLabels(entityId) {
  const url = `https://www.wikidata.org/w/api.php?action=wbgetentities&ids=${entityId}&props=labels|aliases&languages=fr|en|es&format=json`;
  const data = await fetchJSON(url);
  if (!data?.entities?.[entityId]) return null;

  const entity = data.entities[entityId];
  const labels = entity.labels || {};
  const aliases = entity.aliases || {};

  return {
    name_fr: labels.fr?.value || (aliases.fr?.[0]?.value) || null,
    name_en: labels.en?.value || (aliases.en?.[0]?.value) || null,
    name_es: labels.es?.value || (aliases.es?.[0]?.value) || null,
  };
}

/**
 * Try TheSportsDB to get strTeamAlternate as extra aliases.
 */
async function tsdbGetAlternate(clubName) {
  const url = `https://www.thesportsdb.com/api/v1/json/3/searchteams.php?t=${encodeURIComponent(clubName)}`;
  const data = await fetchJSON(url);
  if (!data?.teams?.length) return [];

  const soccer = data.teams.find(t => t.strSport === 'Soccer') || data.teams[0];
  const alternates = (soccer.strTeamAlternate || '').split(',').map(s => s.trim()).filter(Boolean);
  // Also include strTeam if it differs from club_name
  if (soccer.strTeam && soccer.strTeam !== clubName) {
    alternates.unshift(soccer.strTeam);
  }
  return alternates;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connexion à la base de données…');

  // Get clubs that still need translations
  const [rows] = await pool.query(
    `SELECT club_name, name_fr, name_en, name_es FROM club_logos
     WHERE name_fr IS NULL OR name_en IS NULL OR name_es IS NULL`
  );

  console.log(`${rows.length} clubs need translations\n`);

  let updated = 0;
  let skipped = 0;
  let notFound = 0;

  for (let i = 0; i < rows.length; i++) {
    const { club_name, name_fr: existFr, name_en: existEn, name_es: existEs } = rows[i];

    process.stdout.write(`[${i + 1}/${rows.length}] ${club_name}… `);

    // 1. Search Wikidata
    const entityId = await wikidataSearch(club_name);
    await delay(DELAY);

    let labels = { name_fr: null, name_en: null, name_es: null };

    if (entityId) {
      const wdLabels = await wikidataGetLabels(entityId);
      await delay(DELAY);
      if (wdLabels) {
        labels = wdLabels;
      }
    }

    // 2. If Wikidata didn't return a specific language, try TheSportsDB alternates
    // TheSportsDB alternates aren't language-tagged, but can fill gaps
    if (!labels.name_fr || !labels.name_en || !labels.name_es) {
      const alternates = await tsdbGetAlternate(club_name);
      await delay(DELAY);

      // Use alternates to fill empty fields — they're better than nothing
      if (alternates.length > 0 && !labels.name_en) {
        labels.name_en = alternates[0]; // strTeam is usually English-ish
      }
    }

    // 3. Don't overwrite existing values, and skip if nothing new
    const newFr = existFr || labels.name_fr;
    const newEn = existEn || labels.name_en;
    const newEs = existEs || labels.name_es;

    const hasUpdate = (newFr !== existFr) || (newEn !== existEn) || (newEs !== existEs);

    if (!hasUpdate && !newFr && !newEn && !newEs) {
      console.log('✗ not found');
      notFound++;
      continue;
    }

    if (!hasUpdate) {
      console.log('– skip (no new data)');
      skipped++;
      continue;
    }

    // 4. Update DB
    await pool.query(
      `UPDATE club_logos SET name_fr = ?, name_en = ?, name_es = ?, updated_at = NOW()
       WHERE club_name = ?`,
      [newFr, newEn, newEs, club_name]
    );

    const parts = [];
    if (newFr) parts.push(`fr="${newFr}"`);
    if (newEn) parts.push(`en="${newEn}"`);
    if (newEs) parts.push(`es="${newEs}"`);
    console.log(`✓ ${parts.join(', ')}`);
    updated++;
  }

  console.log('\n══ Terminé ══');
  console.log(`Mis à jour : ${updated}`);
  console.log(`Ignorés    : ${skipped}`);
  console.log(`Non trouvés: ${notFound}`);

  const [count] = await pool.query(
    'SELECT COUNT(*) as total, COUNT(name_fr) as has_fr, COUNT(name_en) as has_en, COUNT(name_es) as has_es FROM club_logos'
  );
  console.log(`\nTotal en base : ${count[0].total}`);
  console.log(`Avec name_fr  : ${count[0].has_fr}`);
  console.log(`Avec name_en  : ${count[0].has_en}`);
  console.log(`Avec name_es  : ${count[0].has_es}`);

  await pool.end();
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
