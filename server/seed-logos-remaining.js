/**
 * seed-logos-remaining.js
 * Cible uniquement les pays qui ont été rate-limités lors des passes précédentes.
 * Usage: node server/seed-logos-remaining.js
 */

import mysql from 'mysql2/promise';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createDbPoolConfig } from './db-config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, '..', '.env') });

const TSDB = 'https://www.thesportsdb.com/api/v1/json/3';
const DELAY = 900; // délai plus long pour éviter le rate limit

// Pays qui ont retourné 0 clubs lors des passes précédentes (par ordre prioritaire)
const COUNTRIES = [
  // S-Z manquants
  'Slovenia','Solomon Islands','Somalia','South Africa','South Korea',
  'South Sudan','Spain','Sri Lanka','Sudan','Suriname','Sweden',
  'Switzerland','Syria','Tajikistan','Tanzania','Thailand','Timor-Leste',
  'Togo','Tonga','Trinidad and Tobago','Tunisia','Turkey','Turkmenistan',
  'Turks and Caicos Islands','Uganda','Ukraine','United Arab Emirates',
  'United States','Uruguay','Uzbekistan','Vanuatu','Venezuela','Vietnam',
  'Wales','Yemen','Zambia','Zimbabwe',
  // Republic of Ireland (raté aussi)
  'Republic of Ireland',
];

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

function delay(ms) { return new Promise(r => setTimeout(r, ms)); }

async function fetchJSON(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    if (text.startsWith('<')) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function teamsByCountry(country) {
  const url = `${TSDB}/search_all_teams.php?s=Soccer&c=${encodeURIComponent(country)}`;
  const data = await fetchJSON(url);
  if (!data || !data.teams) return [];
  return data.teams.filter(t => t.strBadge);
}

async function main() {
  console.log('Connexion DB…');
  const existing = await getExisting();
  console.log(`Logos en base : ${existing.size}\n`);

  let saved = 0;
  let skipped = 0;
  let rateLimited = [];

  for (let i = 0; i < COUNTRIES.length; i++) {
    const country = COUNTRIES[i];
    process.stdout.write(`[${i + 1}/${COUNTRIES.length}] ${country}… `);

    let teams = await teamsByCountry(country);

    // Double retry si vide
    if (teams.length === 0) {
      await delay(3000);
      teams = await teamsByCountry(country);
    }
    if (teams.length === 0) {
      await delay(5000);
      teams = await teamsByCountry(country);
    }

    console.log(`${teams.length} clubs avec badge`);

    if (teams.length === 0) {
      rateLimited.push(country);
    }

    for (const t of teams) {
      if (!t.strTeam || !t.strBadge) continue;
      if (existing.has(t.strTeam)) { skipped++; continue; }
      try {
        await saveLogo(t.strTeam, t.strBadge);
        existing.add(t.strTeam);
        saved++;
        console.log(`  ✓ ${t.strTeam}`);
      } catch (err) {
        console.error(`  ✗ ${t.strTeam}: ${err.message}`);
      }
    }

    await delay(DELAY);
  }

  console.log('\n══ Terminé ══');
  console.log(`Logos sauvegardés  : ${saved}`);
  console.log(`Déjà en base       : ${skipped}`);
  if (rateLimited.length > 0) {
    console.log(`Rate-limités (0)   : ${rateLimited.join(', ')}`);
  }
  const [count] = await pool.query('SELECT COUNT(*) as n FROM club_logos');
  console.log(`Total en base      : ${count[0].n}`);
  await pool.end();
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
