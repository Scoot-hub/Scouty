/**
 * Download league logo PNGs from API-Football CDN to public/leagues/
 * Run: node scripts/download-league-logos.mjs
 */
import https from 'https';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '..', 'public', 'leagues');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// league slug → API-Football league ID
const LEAGUES = {
  // Europe — Top 5
  'ligue-1': 61,
  'ligue-2': 62,
  'premier-league': 39,
  'championship': 40,
  'league-one': 41,
  'la-liga': 140,
  'la-liga-2': 141,
  'serie-a': 135,
  'serie-b': 136,
  'bundesliga': 78,
  'bundesliga-2': 79,
  // Europe — autres
  'liga-portugal': 94,
  'liga-portugal-2': 95,
  'eredivisie': 88,
  'eerste-divisie': 89,
  'jupiler-pro-league': 144,
  'challenger-pro-league': 145,
  'super-lig': 203,
  'super-league-suisse': 207,
  'challenge-league-suisse': 208,
  'superligaen': 119,
  'allsvenskan': 113,
  'superettan': 114,
  'eliteserien': 103,
  'ekstraklasa': 106,
  'fortuna-liga': 345,
  'nb-i': 271,
  'premier-league-russe': 235,
  'premier-league-ukrainienne': 333,
  'premier-league-ecosse': 179,
  'superliga-serbie': 392,
  'hnl': 210,
  'super-league-grece': 197,
  // Coupes européennes
  'champions-league': 2,
  'europa-league': 3,
  'conference-league': 848,
  // Amériques
  'mls': 253,
  'liga-mx': 262,
  'brasileirao-serie-a': 71,
  'brasileirao-serie-b': 72,
  'liga-profesional-argentina': 128,
  'liga-betplay': 239,
  'primera-division-uruguay': 268,
  'primera-division-chili': 265,
  'canadian-premier-league': 484,
  // Asie
  'j-league': 98,
  'k-league': 292,
  'chinese-super-league': 169,
  'saudi-pro-league': 307,
  'uae-pro-league': 435,
  // Afrique
  'botola-pro': 200,
  // Autres compétitions mondiales
  'copa-libertadores': 13,
  'copa-sudamericana': 11,
  'world-cup': 1,
  'euro': 4,
  'nations-league': 5,
  'copa-america': 9,
  'african-cup': 6,
};

function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const client = url.startsWith('https') ? https : http;
    const req = client.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 ScoutyApp/1.0' },
      timeout: 10000,
    }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        fs.unlink(dest, () => {});
        return download(res.headers.location, dest).then(resolve).catch(reject);
      }
      if (res.statusCode !== 200) {
        file.close();
        fs.unlink(dest, () => {});
        return resolve(false);
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(true); });
    });
    req.on('error', () => { file.close(); fs.unlink(dest, () => {}); resolve(false); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  const entries = Object.entries(LEAGUES);
  let ok = 0, fail = 0;
  console.log(`Downloading ${entries.length} league logos to public/leagues/\n`);

  for (const [slug, id] of entries) {
    const dest = path.join(OUT_DIR, `${slug}.png`);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 500) {
      console.log(`  ✓ [skip] ${slug}.png already exists`);
      ok++;
      continue;
    }
    const url = `https://media.api-sports.io/football/leagues/${id}.png`;
    const result = await download(url, dest);
    if (result) {
      const size = fs.statSync(dest).size;
      if (size < 200) { // empty/error response
        fs.unlink(dest, () => {});
        console.log(`  ✗ [empty] ${slug} (id=${id})`);
        fail++;
      } else {
        console.log(`  ✓ ${slug}.png (${(size/1024).toFixed(1)} KB)`);
        ok++;
      }
    } else {
      console.log(`  ✗ [error] ${slug} (id=${id})`);
      fail++;
    }
    await sleep(150); // be polite with the CDN
  }

  console.log(`\nDone: ${ok} downloaded, ${fail} failed`);
  console.log(`Output: ${OUT_DIR}`);
}

main().catch(console.error);
