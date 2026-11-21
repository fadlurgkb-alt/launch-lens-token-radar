import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildRows, type Protocol } from './lib/model.ts';
import { buildDossier } from './vendor/makefun-board.ts';

type Snapshot = { as_of: string; source: string; floor_usd: number; protocols: Protocol[]; watchlist: string[] };

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const input = resolve(arg('--input') ?? '/input/snapshot.json');
const output = resolve(process.env.MAKEFUN_OUTPUT_DIR ?? '/output');
const snapshot = JSON.parse(readFileSync(input, 'utf8')) as Snapshot;
const rows = buildRows(snapshot.protocols, snapshot.watchlist, snapshot.as_of);
const covered = new Set(rows.map((row) => row.slug));
const missing = snapshot.watchlist.filter((slug) => !covered.has(slug));
if (rows.length < 100) throw new Error(`Model produced only ${rows.length} rows; at least 100 are required`);
if (missing.length) throw new Error(`Watchlist coverage failed: ${missing.join(', ')}`);
if (rows.some((row, i) => row.rank !== i + 1 || (i > 0 && row.implied_value_usd > rows[i - 1]!.implied_value_usd))) {
  throw new Error('Rank and implied-value ordering invariant failed');
}

rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
cpSync(resolve('dashboard'), resolve(output, 'dashboard'), { recursive: true });
cpSync(resolve('screenshots'), resolve(output, 'screenshots'), { recursive: true });
writeFileSync(resolve(output, 'board.json'), `${JSON.stringify({ schema: 'launch-lens/v1', as_of: snapshot.as_of, rows }, null, 2)}\n`);
writeFileSync(resolve(output, 'dashboard/data.dat'), `${JSON.stringify({ as_of: snapshot.as_of, floor_usd: snapshot.floor_usd, rows })}\n`);
writeFileSync(resolve(output, 'dossier.json'), buildDossier(output, { text_max_bytes: 65536 }));

console.log(`Launch Lens wrote ${rows.length} ranked rows to ${output}`);
