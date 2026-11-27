// test/browser/ux-v0/discover-bench.mjs — creative discovery, played through with a real model's answers.
//
// Each scenario is a person with something in mind: their opening words and what they would say next. The conversation
// runs through the product's own code (lib/ux-v0/studio/discover.ts and discover-model.ts, from test/.tmp), and every
// turn SocriaUX takes is written to an exchange folder exactly as the route would send it to the question model
// (system.md once — with the answer's JSON schema appended, which the route enforces with structured output — and
// req-<key>.md per turn). A model writes ans-<key>.json; this reads it back through normalizeDecision, carries it out,
// and goes on. When a question shows an aid, the person picks the option their script says (or writes instead). When
// their script runs out and SocriaUX is still asking, they say "You decide." — counted as an over-asked turn.
//
//   node test/browser/ux-v0/discover-bench.mjs [scenario]     (DISCOVER_OUT sets the folder; default under UXV0_OUT)
//
// Writes transcripts.md (every conversation as the person saw it, and the brief handed to the designer) and
// report.json (questions per scenario, aids shown, redundant questions, over-asked turns).
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

/** A person: what they open with, and what they say to each question (a string, or { pick: n } for an aid). */
const SCENARIOS = [
  { id: 'A-vague', mode: 'graphic', words: 'Make me a poster.', replies: ['An underground electronic music event.', 'Definitely chaotic, but still sophisticated.'], expect: 'a relevant opening question, then one about the feel, then made' },
  { id: 'B-detailed', mode: 'graphic', words: 'Create a brutalist editorial poster for a contemporary architecture exhibition, with oversized condensed typography, black and cream colors, asymmetrical composition, and minimal decoration.', replies: [], expect: 'made at once' },
  { id: 'C-premium', mode: 'logo', words: 'I want to make a premium-looking brand, but I’m not really sure what style I want.', replies: ['Like an old luxury magazine, but futuristic.', 'It’s called Velour. A small fragrance house.'], expect: 'explores what premium means, takes the analogy whole, asks the name' },
  { id: 'D-colour', mode: 'graphic', words: 'A poster for the spring plant sale at our nursery. Honestly I have no idea what colours to use.', replies: [{ pick: 1 }], expect: 'palettes shown, because colour is the open question' },
  { id: 'E-type', mode: 'graphic', words: 'A type-led poster for a typography conference called “Kerning Club”. I want the lettering to be really expressive, but I don’t know fonts at all.', replies: [{ pick: 0 }], expect: 'real typeface previews, because lettering carries it' },
  { id: 'F-dreamy', mode: 'graphic', words: 'I want something dreamy.', replies: ['A poster for my sister’s art show — she paints soft watercolour landscapes.', { pick: 1 }], expect: 'clarifies what dreamy means for this work without generic presets' },
  { id: 'G-paragraph', mode: 'graphic', words: 'A poster for our community garden', replies: ['Honestly it started when my grandmother planted tomatoes in the vacant lot behind the laundromat, and now forty families grow food there. I want people to feel that warmth and a bit of rebellion — not a corporate flyer.'], expect: 'reads the story for its meaning and continues naturally' },
  { id: 'H-decide', mode: 'logo', words: 'A logo for a coffee roaster called Ember & Oak', replies: ['You decide.'], expect: 'made at once, or after at most one question that is then handed over' },
  { id: 'I-change', mode: 'graphic', words: 'A playful poster for a children’s book fair', replies: ['Actually, make it sophisticated and editorial instead.'], expect: 'drops playful, keeps sophisticated editorial' },
  { id: 'L-vague', mode: 'graphic', words: 'something cool', replies: ['not sure', 'idk, something that looks good', 'whatever'], expect: 'reasonable decisions instead of more low-value questions' },
  { id: 'M-campaign', mode: 'board', words: 'A launch campaign for our oat milk brand', replies: ['A few posters and some Instagram posts. It’s called Pasture.', 'Warm and a bit cheeky, not health-food beige.'], expect: 'which pieces, then the feel' },
  { id: 'N-website', mode: 'website', words: 'A website for my pottery studio', replies: ['Mostly so people can book wheel-throwing classes.', 'Earthy and calm.'], expect: 'what people do there, then made' },
].filter((s) => !only || s.id === only || s.id.startsWith(only));

const schemaNote = `\n\n# The answer\nWrite one JSON object, exactly in this JSON Schema (every property present; null where it does not apply):\n\n${JSON.stringify(S.DISCOVER_SCHEMA, null, 1)}\n`;
writeFileSync(join(EX, 'system.md'), S.discoverSystem() + schemaNote);

const key = (text) => createHash('sha256').update(text).digest('hex').slice(0, 12);
const pending = [];
const report = {};
const lines = ['# Creative discovery — conversations with a real model\n', 'Each conversation ran through the product’s own discovery code; every SocriaUX turn was decided by a model reading the exact prompt the route sends. *Aids* are shown in brackets as the person saw them.\n'];

for (const sc of SCENARIOS) {
  let st = S.said(S.emptyStudio(sc.mode, sc.words, { now: NOW, modeBy: 'words' }), { from: 'person', kind: 'prompt', text: sc.words, at: NOW });
  const r = { questions: 0, aids: [], overAsked: 0, decisions: [], ended: null, waiting: null };
  let replyAt = 0;
  for (let step = 0; step < 8; step++) {
    // "make it", "you decide": made at once, as the conversation page does, with no model call
    const lastText = st.transcript[st.transcript.length - 1].text;
    if (step > 0 && S.wantsMake(lastText)) {
      st = S.applyDecision(st, S.makeNow(st), NOW + step * 10);
      r.decisions.push('make (handed over)');
      r.ended = 'made';
      break;
    }
    const c = S.discoverContextOf(st);
    const user = S.discoverUser(c);
    const k = `turn-${key(user)}`;
    const ans = join(EX, `ans-${k}.json`);
    if (!existsSync(ans)) {
      writeFileSync(join(EX, `req-${k}.md`), user);
      pending.push({ key: k, scenario: sc.id });
      r.waiting = k;
      break;
    }
    let raw = readFileSync(ans, 'utf8').trim().replace(/^```(?:json)?\s*|\s*```$/g, '');
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }
    const d = S.normalizeDecision(parsed, c);
    if (!d) {
      r.decisions.push('unusable answer → reader');
    }
    const decision = d ?? S.readerDecision(st);
    st = S.applyDecision(st, decision, NOW + step * 10 + 1);
    r.decisions.push(decision.action + (decision.ask?.aid ? ` + ${decision.ask.aid.kind}` : ''));
    if (decision.action === 'make') {
      r.ended = 'made';
      break;
    }
    r.questions++;
    if (decision.ask?.aid) r.aids.push(decision.ask.aid.kind);
    // the person answers: their next line, an aid picked, or (their script spent) "You decide."
    const next = sc.replies[replyAt++];
    if (next === undefined) {
      r.overAsked++;
      st = S.personSays(st, 'You decide.', { now: NOW + step * 10 + 2 });
    } else if (typeof next === 'object' && decision.ask?.aid) {
      st = S.chooseAid(st, Math.min(next.pick, decision.ask.aid.options.length - 1), NOW + step * 10 + 2) ?? S.personSays(st, 'That one.', { now: NOW + step * 10 + 2 });
    } else if (typeof next === 'object') {
      st = S.personSays(st, 'Whatever you think suits it.', { now: NOW + step * 10 + 2 });
    } else {
      st = S.personSays(st, next, { now: NOW + step * 10 + 2 });
    }
  }
  report[sc.id] = r;
  lines.push(`\n## ${sc.id} — expected: ${sc.expect}\n`);
  for (const m of st.transcript) {
    const who = m.from === 'person' ? '**Person**' : '**SocriaUX**';
    const aid = m.aid ? `\n  > [${m.aid.kind}: ${m.aid.options.map((o) => (m.aid.kind === 'palettes' ? `${o.name} ${o.colours.join(' ')}` : m.aid.kind === 'type' ? `${o.name} — ${o.display}${o.body !== o.display ? ' + ' + o.body : ''}` : `${o.name} — ${o.note} (${o.display}; ${o.colours.join(' ')})`)).join(' · ')}]` : '';
    const sugg = m.suggestions?.length ? `\n  > replies offered: ${m.suggestions.join(' · ')}` : '';
    lines.push(`- ${who}: ${m.text}${aid}${sugg}`);
  }
  if (r.ended === 'made') lines.push(`\n<details><summary>Brief handed to the designer</summary>\n\n\`\`\`\n${S.designBriefOf(st)}\n\`\`\`\n</details>\n`);
  else lines.push(`\n_(waiting for the model’s turn: ${r.waiting})_\n`);
  console.log(`${sc.id}: ${r.decisions.join(' → ') || 'waiting'}${r.waiting ? ' … waiting' : ''} (questions ${r.questions}, aids ${r.aids.join(',') || 'none'}, over-asked ${r.overAsked})`);
  writeFileSync(join(OUT, `brief-${sc.id}.txt`), S.designBriefOf(st));
  writeFileSync(join(OUT, `state-${sc.id}.json`), JSON.stringify(st, null, 1));
}

writeFileSync(join(OUT, 'transcripts.md'), lines.join('\n'));
writeFileSync(join(OUT, 'report.json'), JSON.stringify({ at: new Date().toISOString(), scenarios: report }, null, 1));
writeFileSync(join(OUT, 'pending.json'), JSON.stringify(pending, null, 1));
console.log(`\n${pending.length} waiting: ${EX}`);
for (const p of pending) console.log(`  ${p.key} (${p.scenario})`);
