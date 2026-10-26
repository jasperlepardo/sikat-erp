/**
 * A fingerprint of everything the seeded year produces: purchasingHistory(), stockHistory(),
 * seededLedger(), and the items and cost layers as the collections load them. An optimisation of
 * the history builders or a refactor of src/mocks should leave every hash unchanged.
 *
 *   npx tsx scripts/seed-fingerprint.ts [other checkout] [--json out.json]
 *
 * Prints one hash per part. `--json` also writes the full output, for diffing when a hash moves.
 */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { fromSrc, memoryStorage, stubLatency } from './lib/harness';

memoryStorage();
stubLatency();

const toJson = (v: unknown) => JSON.stringify(v, (_k, x) => (x instanceof Map ? Object.fromEntries(x) : x instanceof Set ? [...x] : x));

const parts: Record<string, unknown> = {
  purchasingHistory: (await fromSrc('services/purchasingHistory.ts')).purchasingHistory(),
  stockHistory: (await fromSrc('services/stockHistory.ts')).stockHistory(),
  seededLedger: (await fromSrc('services/ledgerHistory.ts')).seededLedger(),
  items: await (await fromSrc('services/items.ts')).listItems(),
  layers: await (await fromSrc('services/costLayers.ts')).listCostLayers(),
};
for (const [name, value] of Object.entries(parts)) console.log(`${name.padEnd(18)} ${createHash('sha256').update(toJson(value)).digest('hex').slice(0, 16)}`);

const out = process.argv[process.argv.indexOf('--json') + 1];
if (process.argv.includes('--json') && out) writeFileSync(out, toJson(parts));
