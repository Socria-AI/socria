// test/browser/ux-v0/discover-bench.mjs — the spatial creative brief, played through with a real model's plans.
//
// Each scenario is a person with something in mind: their opening idea and what they would do next in the brief. The
// brief runs through the product's own code (lib/ux-v0/studio/discover.ts and discover-model.ts, from test/.tmp), and
// every time it changes, the plan request is written to an exchange folder exactly as the route would send it to the
// model (system.md once — with the plan's JSON schema appended, which the route enforces with structured output — and
// req-<key>.md per change). A model writes ans-<key>.json; this reads it back through normalizePlan, carries it out
// with applyPlan, and goes on. The person answers the lead consideration in words, picks from its aid ({ pick: n }),
// adds a note ({ note: '…' }), or hands it over ("You decide."). When nothing is open, or their script is spent, they
// press Generate; considerations still open then are left to SocriaUX (counted).
//
//   node test/browser/ux-v0/discover-bench.mjs [scenario]     (DISCOVER_OUT sets the folder; default under UXV0_OUT)
//
// Writes transcripts.md (every brief as the person saw it, round by round, and the brief handed to the designer) and
// report.json (considerations raised, aids shown, repeated subjects, open at Generate).
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT, S as OUTROOT } from './env.mjs';

const S = await import(pathToFileURL(join(ROOT, 'test/.tmp/studio-under-test.mjs')).href);
const OUT = process.env.DISCOVER_OUT || `${OUTROOT}discover-bench/`;
const EX = join(OUT, 'exchange');
mkdirSync(EX, { recursive: true });
const only = process.argv[2] ?? '';
const NOW = 1_800_000_000_000;

/** A person: their idea, and what they do next each time (words for the lead consideration, { pick: n }, { note }). */
const SCENARIOS = [
  { id: 'A-vague', mode: 'graphic', words: 'Make me a poster.', replies: ['An underground electronic music event.', 'Definitely chaotic, but still sophisticated.'], expect: 'a relevant opening question, then one about the feel, then made' },
  { id: 'B-detailed', mode: 'graphic', words: 'Create a brutalist editorial poster for a contemporary architecture exhibition, with oversized condensed typography, black and cream colors, asymmetrical composition, and minimal decoration.', replies: [], expect: 'made at once' },
  { id: 'C-premium', mode: 'logo', words: 'I want to make a premium-looking brand, but I’m not really sure what style I want.', replies: ['Like an old luxury magazine, but futuristic.', 'It’s called Velour. A small fragrance house.'], expect: 'explores what premium means, takes the analogy whole, asks the name' },
  { id: 'D-colour', mode: 'graphic', words: 'A poster for the spring plant sale at our nursery. Honestly I have no idea what colours to use.', replies: [{ pick: 1 }], expect: 'palettes shown, because colour is the open question' },
  { id: 'E-type', mode: 'graphic', words: 'A type-led poster for a typography conference called “Kerning Club”. I want the lettering to be really expressive, but I don’t know fonts at all.', replies: [{ pick: 0 }], expect: 'real typeface previews, because lettering carries it' },
  { id: 'F-dreamy', mode: 'graphic', words: 'I want something dreamy.', replies: ['A poster for my sister’s art show — she paints soft watercolour landscapes.', { pick: 1 }], expect: 'clarifies what dreamy means for this work without generic presets' },
  { id: 'G-paragraph', mode: 'graphic', words: 'A poster for our community garden', replies: ['Honestly it started when my grandmother planted tomatoes in the vacant lot behind the laundromat, and now forty families grow food there. I want people to feel that warmth and a bit of rebellion — not a corporate flyer.'], expect: 'reads the story for its meaning and continues naturally' },
  { id: 'H-decide', mode: 'logo', words: 'A logo for a coffee roaster called Ember & Oak', replies: ['You decide.'], expect: 'made at once, or after at most one question that is then handed over' },
  { id: 'I-change', mode: 'graphic', words: 'A playful poster for a children’s book fair', replies: [{ note: 'Actually, make it sophisticated and editorial instead.' }], expect: 'drops playful, keeps sophisticated editorial' },
  { id: 'L-vague', mode: 'graphic', words: 'something cool', replies: ['not sure', 'idk, something that looks good', 'whatever'], expect: 'reasonable decisions instead of more low-value questions' },
  { id: 'M-campaign', mode: 'board', words: 'A launch campaign for our oat milk brand', replies: ['A few posters and some Instagram posts. It’s called Pasture.', 'Warm and a bit cheeky, not health-food beige.'], expect: 'which pieces, then the feel' },
  { id: 'N-website', mode: 'website', words: 'A website for my pottery studio', replies: ['Mostly so people can book wheel-throwing classes.', 'Earthy and calm.'], expect: 'what people do there, then made' },
].filter((s) => !only || s.id === only || s.id.startsWith(only));

const schemaNote = `\n\n# The answer\nWrite one JSON object, exactly in this JSON Schema (every property present; null where it does not apply):\n\n${JSON.stringify(S.PLAN_SCHEMA, null, 1)}\n`;
writeFileSync(join(EX, 'system.md'), S.discoverSystem() + schemaNote);

const key = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);
const pending = [];
const report = {};
const lines = ['# The spatial brief — played through with a real model\n', 'Each brief ran through the product’s own code; every plan was written by a model reading the exact prompt the route sends. Each round shows what the person saw (SocriaUX’s line and the considerations open), then what they did.\n'];
const aidWords = (a) => `[${a.kind}: ${a.options.map((o) => (a.kind === 'palettes' ? `${o.name} ${o.colours.join(' ')}` : a.kind === 'type' ? `${o.name} — ${o.display}${o.body !== o.display ? ' + ' + o.body : ''}` : `${o.name} — ${o.note} (${o.display}; ${o.colours.join(' ')})`)).join(' · ')}]`;
const norm = (t) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

for (const sc of SCENARIOS) {
  let st = { ...S.said(S.emptyStudio(sc.mode, sc.words, { now: NOW, modeBy: 'words' }), { from: 'person', kind: 'prompt', text: sc.words, at: NOW }), space: S.emptySpace() };
  const r = { raised: 0, aids: [], repeated: 0, rounds: [], openAtGenerate: 0, ended: null, waiting: null };
  const story = [];
  const topics = new Set();
  let replyAt = 0;
  for (let step = 0; step < 7; step++) {
    const c = S.spaceContextOf(st);
    const user = S.discoverUser(c);
    const k = `plan-${key(user)}`;
    const ans = join(EX, `ans-${k}.json`);
    if (!existsSync(ans)) {
      writeFileSync(join(EX, `req-${k}.md`), user);
      pending.push({ key: k, scenario: sc.id });
      r.waiting = k;
      break;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(readFileSync(ans, 'utf8').trim().replace(/^```(?:json)?\s*|\s*```$/g, ''));
    } catch {
      parsed = null;
    }
    const p = S.normalizePlan(parsed, c);
    if (!p) r.rounds.push('unusable plan → reader');
    const before = new Set(st.space.modules.map((m) => m.id));
    st = S.applyPlan(st, p ?? S.readerPlan(st));
    const open = st.space.modules.filter((m) => m.status === 'open');
    const fresh = open.filter((m) => !before.has(m.id));
    for (const m of fresh) {
      r.raised++;
      if (m.aid) r.aids.push(m.aid.kind);
      const t = norm(m.topic);
      if (topics.has(t)) r.repeated++;
      topics.add(t);
    }
    r.rounds.push(`${open.length} open${fresh.length ? ` (${fresh.map((m) => m.topic + (m.aid ? ` + ${m.aid.kind}` : '')).join(', ')})` : ''}${st.space.ready ? ', ready' : ''}`);
    story.push(`\n**Round ${step + 1}** — SocriaUX: _${st.space.note || '(no line)'}_${st.space.ready ? ' · ready to make' : ''}`);
    for (const m of open) story.push(`- ${m.lead ? '**lead** ' : ''}${m.topic}: “${m.question}” (${m.kind})${m.kind === 'choice' ? ` — ${m.options.join(' / ')}` : ''}${m.aid ? `\n  > ${aidWords(m.aid)}` : ''}`);
    const lead = open.find((m) => m.lead) ?? open[0];
    const next = sc.replies[replyAt];
    // nothing more to say, or nothing open and nothing to add: Generate
    if (next === undefined || (!lead && !(typeof next === 'object' && next.note))) {
      r.openAtGenerate = open.length;
      story.push(`- _Person presses Generate${open.length ? ` (${open.length} left to SocriaUX)` : ''}._`);
      st = S.startMaking(st, NOW + step * 10 + 2);
      r.ended = 'made';
      break;
    }
    replyAt++;
    if (typeof next === 'string' && S.wantsMake(next)) {
      story.push(`- _Person: “${next}” — Generate._`);
      r.openAtGenerate = open.length;
      st = S.startMaking(st, NOW + step * 10 + 2);
      r.ended = 'made';
      break;
    }
    if (typeof next === 'object' && next.note) {
      story.push(`- _Person adds a note: “${next.note}”_`);
      st = S.addNote(st, next.note, NOW + step * 10 + 2);
    } else if (typeof next === 'object' && lead.aid) {
      const i = Math.min(next.pick, lead.aid.options.length - 1);
      story.push(`- _Person picks “${lead.aid.options[i].name}” for ${lead.topic}._`);
      st = S.pickOption(st, lead.id, i, NOW + step * 10 + 2);
    } else if (typeof next === 'object' && lead.kind === 'choice') {
      const i = Math.min(next.pick, lead.options.length - 1);
      story.push(`- _Person picks “${lead.options[i]}” for ${lead.topic}._`);
      st = S.answerModule(st, lead.id, lead.options[i], NOW + step * 10 + 2);
    } else {
      const words = typeof next === 'object' ? 'Whatever you think suits it.' : next;
      story.push(`- _Person answers ${lead.topic}: “${words}”_`);
      st = S.answerModule(st, lead.id, words, NOW + step * 10 + 2);
    }
  }
  report[sc.id] = r;
  lines.push(`\n## ${sc.id} — expected: ${sc.expect}\n`, `Idea: “${sc.words}”`, ...story);
  if (r.ended === 'made') lines.push(`\n<details><summary>Brief handed to the designer</summary>\n\n\`\`\`\n${S.designBriefOf(st)}\n\`\`\`\n</details>\n`);
  else lines.push(`\n_(waiting for the model’s plan: ${r.waiting})_\n`);
  console.log(`${sc.id}: ${r.rounds.join(' → ') || 'waiting'}${r.waiting ? ' … waiting' : ''} (raised ${r.raised}, aids ${r.aids.join(',') || 'none'}, repeated ${r.repeated}, open at Generate ${r.openAtGenerate})`);
  writeFileSync(join(OUT, `brief-${sc.id}.txt`), S.designBriefOf(st));
  writeFileSync(join(OUT, `state-${sc.id}.json`), JSON.stringify(st, null, 1));
}

writeFileSync(join(OUT, 'transcripts.md'), lines.join('\n'));
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), scenarios: report }, null, 1));
writeFileSync(join(OUT, 'pending.json'), JSON.stringify(pending, null, 1));
console.log(`\n${pending.length} waiting: ${EX}`);
for (const p of pending) console.log(`  ${p.key} (${p.scenario})`);
