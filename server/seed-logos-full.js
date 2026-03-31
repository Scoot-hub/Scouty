/**
 * seed-logos-full.js
 * Importe TOUS les logos de clubs disponibles sur TheSportsDB en
 * interrogeant chaque pays (search_all_teams) + les 10 ligues connues
 * (lookup_all_teams) sur le free tier (clé=3).
 *
 * Usage: node server/seed-logos-full.js
 * Resumable: saute les clubs déjà en base.
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createDbPoolConfig } from './db-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const TSDB = 'https://www.thesportsdb.com/api/v1/json/3';
const DELAY = 700; // ms entre appels pour rester dans les limites du free tier

// ── Tous les pays FIFA + extras ─────────────────────────────────────────────
const COUNTRIES = [
  'Afghanistan','Albania','Algeria','American Samoa','Andorra','Angola',
  'Anguilla','Antigua and Barbuda','Argentina','Armenia','Aruba',
  'Australia','Austria','Azerbaijan','Bahamas','Bahrain','Bangladesh',
  'Barbados','Belarus','Belgium','Belize','Benin','Bermuda','Bhutan',
  'Bolivia','Bosnia and Herzegovina','Botswana','Brazil','British Virgin Islands',
  'Brunei','Bulgaria','Burkina Faso','Burundi','Cambodia','Cameroon',
  'Canada','Cape Verde','Cayman Islands','Central African Republic','Chad',
  'Chile','China','Chinese Taipei','Colombia','Comoros','Congo',
  'Congo DR','Cook Islands','Costa Rica','Croatia','Cuba','Curacao',
  'Cyprus','Czech Republic','Denmark','Djibouti','Dominica',
  'Dominican Republic','Ecuador','Egypt','El Salvador','England',
  'Equatorial Guinea','Eritrea','Estonia','Ethiopia','Faroe Islands',
  'Fiji','Finland','France','Gabon','Gambia','Georgia','Germany',
  'Ghana','Gibraltar','Greece','Grenada','Guam','Guatemala',
  'Guinea','Guinea-Bissau','Guyana','Haiti','Honduras','Hong Kong',
  'Hungary','Iceland','India','Indonesia','Iran','Iraq','Ireland',
  'Israel','Italy','Ivory Coast','Jamaica','Japan','Jordan','Kazakhstan',
  'Kenya','Kosovo','Kuwait','Kyrgyzstan','Laos','Latvia','Lebanon',
  'Lesotho','Liberia','Libya','Liechtenstein','Lithuania','Luxembourg',
  'Macau','Madagascar','Malawi','Malaysia','Maldives','Mali','Malta',
  'Mauritania','Mauritius','Mexico','Moldova','Mongolia','Montenegro',
  'Montserrat','Morocco','Mozambique','Myanmar','Namibia','Nepal',
  'Netherlands','New Caledonia','New Zealand','Nicaragua','Niger',
  'Nigeria','Northern Ireland','North Korea','North Macedonia',
  'Norway','Oman','Pakistan','Palestine','Panama','Papua New Guinea',
  'Paraguay','Peru','Philippines','Poland','Portugal','Puerto Rico',
  'Qatar','Republic of Ireland','Romania','Russia','Rwanda',
  'Saint Kitts and Nevis','Saint Lucia','Saint Vincent and the Grenadines',
  'Samoa','San Marino','Sao Tome and Principe','Saudi Arabia','Scotland',
  'Senegal','Serbia','Seychelles','Sierra Leone','Singapore',
  'Slovakia','Slovenia','Solomon Islands','Somalia','South Africa',
  'South Korea','South Sudan','Spain','Sri Lanka','Sudan','Suriname',
  'Sweden','Switzerland','Syria','Tajikistan','Tanzania','Thailand',
  'Timor-Leste','Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey',
  'Turkmenistan','Turks and Caicos Islands','Uganda','Ukraine',
  'United Arab Emirates','United States','Uruguay','Uzbekistan',
  'Vanuatu','Venezuela','Vietnam','Wales','Yemen','Zambia','Zimbabwe',
];

// IDs des 10 ligues soccer connues sur le free tier
const KNOWN_LEAGUE_IDS = [4328,4329,4330,4331,4332,4334,4335,4336,4337,4338];

// ── DB ───────────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  ...createDbPoolConfig(),
  connectionLimit: 3,
});

async function getExisting() {
  const [rows] = await pool.query('SELECT club_name FROM club_logos');
  return new Set(rows.map(r => r.club_name));
}

async function saveLogo(clubName, logoUrl) {
  await pool.query(
    'INSERT INTO club_logos (club_name, logo_url) VALUES (?, ?) ON DUPLICATE KEY UPDATE logo_url = VALUES(logo_url), updated_at = NOW()',
    [clubName.slice(0, 255), logoUrl]
  );
}

// ── API ──────────────────────────────────────────────────────────────────────
function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith('<')) return null; // HTML = rate limit page
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Retourne la liste des équipes avec badge pour un pays donné
async function teamsByCountry(country) {
  const url = `${TSDB}/search_all_teams.php?s=Soccer&c=${encodeURIComponent(country)}`;
  const data = await fetchJSON(url);
  if (!data || !data.teams) return [];
  return data.teams.filter(t => t.strBadge);
}

// Retourne la liste des équipes avec badge pour une ligue donnée
async function teamsByLeague(leagueId) {
  const url = `${TSDB}/lookup_all_teams.php?id=${leagueId}`;
  const data = await fetchJSON(url);
  if (!data || !data.teams) return [];
  return data.teams.filter(t => t.strBadge);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('Connexion à la base de données…');
  const existing = await getExisting();
  console.log(`Logos déjà en base : ${existing.size}\n`);

  let saved = 0;
  let skipped = 0;

  // Compteurs de progression
  const totalSteps = KNOWN_LEAGUE_IDS.length + COUNTRIES.length;
  let step = 0;

  function processTeams(teams, source) {
    let newCount = 0;
    for (const t of teams) {
      if (!t.strTeam || !t.strBadge) continue;
      if (existing.has(t.strTeam)) { skipped++; continue; }
      // Sauvegarde async — on attend en dehors pour ne pas bloquer
      return { toSave: teams.filter(tt => tt.strTeam && tt.strBadge && !existing.has(tt.strTeam)) };
    }
    return { toSave: [] };
  }

  async function saveTeams(teams, source) {
    const toSave = teams.filter(t => t.strTeam && t.strBadge && !existing.has(t.strTeam));
    for (const t of toSave) {
      try {
        await saveLogo(t.strTeam, t.strBadge);
        existing.add(t.strTeam); // évite les doublons en mémoire
        saved++;
        console.log(`  ✓ ${t.strTeam}`);
      } catch (err) {
        console.error(`  ✗ DB error ${t.strTeam}: ${err.message}`);
      }
    }
    if (toSave.length === 0 && teams.filter(t=>t.strBadge).length > 0) {
      skipped += teams.filter(t=>t.strBadge).length;
    }
  }

  // ── 1. Ligues connues ──────────────────────────────────────────────────────
  console.log(`=== Phase 1: ${KNOWN_LEAGUE_IDS.length} ligues connues ===\n`);
  for (const id of KNOWN_LEAGUE_IDS) {
    step++;
    process.stdout.write(`[${step}/${totalSteps}] Ligue ID ${id}… `);
    const teams = await teamsByLeague(id);
    console.log(`${teams.length} clubs avec badge`);
    await saveTeams(teams, `ligue ${id}`);
    await delay(DELAY);
  }

  // ── 2. Tous les pays ───────────────────────────────────────────────────────
  console.log(`\n=== Phase 2: ${COUNTRIES.length} pays ===\n`);
  for (const country of COUNTRIES) {
    step++;
    process.stdout.write(`[${step}/${totalSteps}] ${country}… `);

    let teams = await teamsByCountry(country);

    // Retry si rate-limited (réponse vide alors que pays connu)
    if (teams.length === 0) {
      await delay(2000);
      teams = await teamsByCountry(country);
    }

    console.log(`${teams.length} clubs avec badge`);
    await saveTeams(teams, country);
    await delay(DELAY);
  }

  // ── Résumé ─────────────────────────────────────────────────────────────────
  console.log('\n══ Terminé ══');
  console.log(`Logos sauvegardés : ${saved}`);
  console.log(`Déjà en base      : ${skipped}`);
  const [count] = await pool.query('SELECT COUNT(*) as n FROM club_logos');
  console.log(`Total en base     : ${count[0].n}`);

  await pool.end();
}

main().catch(err => {
  console.error('Erreur fatale:', err);
  process.exit(1);
});
