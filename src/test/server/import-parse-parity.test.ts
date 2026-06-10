/**
 * Import parse-parity test
 *
 * Proves the data-import refactor is safe: instead of uploading the raw file
 * (rejected by Vercel at >4.5 MB with FUNCTION_PAYLOAD_TOO_LARGE), the client
 * now parses the workbook in-browser and POSTs the rows as JSON batches.
 *
 * For the import to behave identically, the rows the server feeds to its
 * downstream upsert logic MUST be the same whether they came from:
 *   (A) the OLD path — server reads the uploaded file buffer:  XLSX.read(buf, {type:'buffer'})
 *   (B) the NEW path — client parses a binary string, rows go through JSON:
 *       XLSX.read(binaryStr, {type:'binary'}) → JSON.stringify → JSON.parse
 *
 * Both use the same xlsx library and the same sheet_to_json(ws, {defval:''}).
 * This test builds a representative Wyscout-like workbook and asserts the two
 * paths yield deeply-equal rows. It also verifies the client byte-budget
 * batching splits and re-concatenates without losing or reordering rows.
 *
 * Run: npx vitest run src/test/server/import-parse-parity.test.ts
 */
import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';

// Mirror of the client batching logic in src/pages/DataImport.tsx (handleImport)
const MAX_BATCH_BYTES = 3_000_000;
function batchRows(rows: Record<string, unknown>[], maxBytes = MAX_BATCH_BYTES) {
  const batches: Record<string, unknown>[][] = [];
  let cur: Record<string, unknown>[] = [];
  let curBytes = 0;
  for (const row of rows) {
    const rowBytes = JSON.stringify(row).length + 1;
    if (cur.length && curBytes + rowBytes > maxBytes) {
      batches.push(cur);
      cur = [];
      curBytes = 0;
    }
    cur.push(row);
    curBytes += rowBytes;
  }
  if (cur.length) batches.push(cur);
  return batches;
}

// Build a workbook that exercises the data shapes the importer cares about:
// accented names (multi-byte UTF-8), integers, floats, string-formatted money,
// date-ish strings, season/division meta, and empty cells (-> defval '').
function buildWorkbookBuffer(rowCount: number): Buffer {
  const header = [
    'Player', 'Team', 'Position', 'Age', 'Birth country', 'Foot',
    'Market value', 'Contract expires', 'On loan',
    'Minutes played', 'Goals', 'xG', 'Duels per 90',
    'season', 'division', 'continent', 'country', 'year_start', 'year_end',
  ];
  const aoa: unknown[][] = [header];
  for (let i = 0; i < rowCount; i++) {
    aoa.push([
      i % 3 === 0 ? 'Kylian Mbappé' : `Joué Türköğlu ${i}`, // accents on purpose
      'Real Madrid',
      ['GK', 'DC', 'MC', 'ATT'][i % 4],
      18 + (i % 20),                 // Age: integer
      'France',
      ['right', 'left', 'both'][i % 3],
      '€180.00m',                    // Market value: string with € and suffix
      '2026-06-30',                  // Contract expires: date string
      i % 5 === 0 ? 'yes' : '',      // On loan + an empty cell elsewhere
      i % 7 === 0 ? '' : 1500 + i,   // Minutes: sometimes empty (-> defval '')
      i % 2,                         // Goals: integer
      0.37 + (i % 10) / 100,         // xG: float
      8.4 + (i % 5) / 10,            // Duels per 90: float
      '23/24',
      'D1',
      'Europe',
      'Spain',
      2023,
      2024,
    ]);
  }
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

describe('data-import — parse parity between file-upload and JSON-batch paths', () => {
  it('produces identical rows whether read from a buffer or from a JSON-transported binary parse', () => {
    const buf = buildWorkbookBuffer(50);

    // (A) OLD path: server reads the uploaded file buffer
    const wbServer = XLSX.read(buf, { type: 'buffer' });
    const rowsServer = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wbServer.Sheets[wbServer.SheetNames[0]], { defval: '' }
    );

    // (B) NEW path: client reads a binary string (== FileReader.readAsBinaryString),
    //     then rows travel over the wire as JSON.
    const binaryStr = buf.toString('binary'); // latin1 — exactly what readAsBinaryString yields
    const wbClient = XLSX.read(binaryStr, { type: 'binary' });
    const rowsClient = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      wbClient.Sheets[wbClient.SheetNames[0]], { defval: '' }
    );
    const rowsAfterTransport = JSON.parse(JSON.stringify(rowsClient));

    // The rows fed to the server's downstream upsert logic must be identical.
    expect(rowsAfterTransport).toEqual(rowsServer);
    expect(rowsAfterTransport).toHaveLength(50);
  });

  it('preserves value types (string/number/empty) across the JSON round-trip', () => {
    const buf = buildWorkbookBuffer(1);
    const binaryStr = buf.toString('binary');
    const wb = XLSX.read(binaryStr, { type: 'binary' });
    const [row] = JSON.parse(JSON.stringify(
      XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: '' })
    ));

    expect(typeof row['Player']).toBe('string');
    expect(typeof row['Age']).toBe('number');        // integers stay numbers
    expect(typeof row['xG']).toBe('number');          // floats stay numbers
    expect(row['Market value']).toBe('€180.00m');     // accented/€ string intact
    expect(row['Minutes played']).toBe('');           // empty cell stays '' (defval)
    expect(row['On loan']).toBe('yes');
  });

  it('batches by byte budget without losing, duplicating, or reordering rows', () => {
    const buf = buildWorkbookBuffer(500);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      XLSX.read(buf, { type: 'buffer' }).Sheets['Sheet1'], { defval: '' }
    );

    // Force several batches with a tiny budget to exercise the splitting path.
    const batches = batchRows(rows, 20_000);
    expect(batches.length).toBeGreaterThan(1);

    // Every batch must stay under the budget (except a single row that alone exceeds it).
    for (const b of batches) {
      const bytes = JSON.stringify({ rows: b }).length;
      expect(b.length).toBeGreaterThan(0);
      if (b.length > 1) expect(bytes).toBeLessThanOrEqual(20_000 + 2_000);
    }

    // Re-concatenating the batches reproduces the original rows exactly.
    const flat = batches.flat();
    expect(flat).toEqual(rows);
  });

  it('keeps a realistic 200-column batch under Vercel’s 4.5 MB request-body cap', () => {
    // Worst case: wide Wyscout export. 200 columns/row with accented values so
    // UTF-8 byte size exceeds JSON string .length (the budget's blind spot).
    const rows: Record<string, unknown>[] = [];
    for (let r = 0; r < 8000; r++) {
      const row: Record<string, unknown> = {};
      for (let i = 0; i < 200; i++) row[`col_${i}`] = i % 2 ? r * 0.137 + i : `é${r}_${i}`;
      rows.push(row);
    }

    const batches = batchRows(rows); // default 3 MB budget
    expect(batches.length).toBeGreaterThan(1);
    for (const b of batches) {
      // UTF-8 byte length is the true wire size; .length undercounts multi-byte chars.
      const wireBytes = Buffer.byteLength(JSON.stringify({ rows: b }), 'utf8');
      expect(wireBytes).toBeLessThan(4_500_000); // hard Vercel cap
    }
  });
});
