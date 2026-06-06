// Trim a user's players down to "valuable" ones (have a report OR shared with an org).
// Dry-run by default; pass --apply to actually delete. Always writes a JSON backup
// of the players that would be deleted before touching anything.
//
//   node scripts/trim-account.mjs            # dry run + backup file
//   node scripts/trim-account.mjs --apply    # backup + delete
import { writeFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
import { createDbPoolConfig } from '../server/db-config.js';

const EMAIL = 'alexmasson69@gmail.com';
const APPLY = process.argv.includes('--apply');
const BACKUP_PATH = new URL('./deleted-players-backup.json', import.meta.url).pathname.replace(/^\/(\w:)/, '$1');

const pool = mysql.createPool(createDbPoolConfig());

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

try {
  const [users] = await pool.query('SELECT id, email FROM users WHERE email = ?', [EMAIL]);
  if (!users.length) throw new Error(`User ${EMAIL} not found`);
  const userId = users[0].id;

  // KEEP set = players with >=1 report OR shared_with_org=1 OR present in player_org_shares
  const [rows] = await pool.query(
    `SELECT DISTINCT p.id
       FROM players p
       LEFT JOIN reports r ON r.player_id = p.id
       LEFT JOIN player_org_shares s ON s.player_id = p.id
      WHERE p.user_id = ?
        AND (r.id IS NOT NULL OR p.shared_with_org = 1 OR s.id IS NOT NULL)`,
    [userId]
  );
  const keepIds = rows.map((r) => r.id);

  const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM players WHERE user_id = ?', [userId]);
  const keepCount = keepIds.length;
  const deleteCount = total - keepCount;

  console.log(`User:        ${EMAIL} (${userId})`);
  console.log(`Total:       ${total}`);
  console.log(`KEEP:        ${keepCount}  (reports OR shared)`);
  console.log(`DELETE:      ${deleteCount}`);

  // Backup the to-be-deleted rows (full row data).
  if (!keepIds.length) throw new Error('Keep set empty — aborting to avoid wiping everything');
  const placeholders = keepIds.map(() => '?').join(',');
  const [toDelete] = await pool.query(
    `SELECT * FROM players WHERE user_id = ? AND id NOT IN (${placeholders})`,
    [userId, ...keepIds]
  );
  writeFileSync(BACKUP_PATH, JSON.stringify({ email: EMAIL, userId, exportedCount: toDelete.length, players: toDelete }, null, 2));
  console.log(`Backup:      ${toDelete.length} rows -> ${BACKUP_PATH}`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to delete.');
    process.exit(0);
  }

  // Delete in batches to avoid a single huge statement. DELETE ... LIMIT is allowed.
  let deleted = 0;
  for (;;) {
    const [res] = await pool.query(
      `DELETE FROM players WHERE user_id = ? AND id NOT IN (${placeholders}) LIMIT 2000`,
      [userId, ...keepIds]
    );
    deleted += res.affectedRows;
    if (res.affectedRows === 0) break;
    console.log(`  ...deleted ${deleted}/${deleteCount}`);
  }
  const [[{ remaining }]] = await pool.query('SELECT COUNT(*) AS remaining FROM players WHERE user_id = ?', [userId]);
  console.log(`\nDONE. Deleted ${deleted}. Players remaining for account: ${remaining}.`);
} finally {
  await pool.end();
}
