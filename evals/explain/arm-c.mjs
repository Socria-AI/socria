// evals/explain/arm-c.mjs — arm C: one strong single prompt, no runtime (evals/explain/strong-prompt.md).
//
//   node evals/explain/arm-c.mjs --battery FILE --out DIR
//
// Writes, per scenario, the request a good single-prompt tutor would send: the strong prompt as the one system
// message, then the conversation as it stands. Compared with the route's arms (capture.mjs), it asks whether
// Socria's runtime beats a well-written prompt, not only whether the engine beats its absence.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : d;
};
const battery = JSON.parse(readFileSync(resolve(arg('--battery', join(here, 'battery.json'))), 'utf8'));
const out = resolve(arg('--out', join(here, '..', '..', '.tmp-arm-c')));
mkdirSync(out, { recursive: true });
const system = readFileSync(join(here, 'strong-prompt.md'), 'utf8').trim();
for (const s of battery) {
  const messages = [{ role: 'system', content: system }, ...s.history.map((m) => ({ role: m.role, content: m.content })), { role: 'user', content: s.message }];
  writeFileSync(join(out, `${s.id}.json`), JSON.stringify({ arm: 'C', id: s.id, messages }, null, 2));
}
console.log(`arm C: ${battery.length} requests → ${out}`);
