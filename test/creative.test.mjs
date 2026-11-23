// SocriaUX creative intelligence — creative words read into plans of design decisions and carried out by the engine,
// concepts as structured, editable records: the reader on every example the designer gave (broad, ambiguous,
// targeted, compound, redesigns), the plan held to its shape (what a model could send that must never be carried
// out), the executor preserving what was not asked to change (the words, the logo, kept decisions, locks), each
// decision turned down on its own, the ground following the palette, forms kept off the words, concepts kept,
// revisited and combined, the record kept with each artboard and its copies, the model's reading and its strict
// schema. No model, no network.

import * as C from './.tmp/creative-under-test.mjs';

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, String(x).slice(0, 900))));
const J = JSON.stringify;

const POSTER = { purpose: 'A poster for a summer music festival', kind: 'poster', formats: ['a4'], content: { headline: 'Open Air', subhead: 'Music in the park, all weekend', details: ['12–14 July 2027', 'Victoria Park, London'], brand: 'Parklife Society' }, mood: ['bold'], images: [] };
const SOCIAL = { purpose: 'Launch post for Halo, a smart reading lamp', kind: 'social', formats: ['instagram-square'], content: { headline: 'Meet Halo', subhead: 'Light that follows your day', details: ['Available 3 March'], brand: 'Lumen Works', cta: 'Pre-order now' }, mood: ['minimal', 'calm'], images: [] };
const make = (brief, words, seedWord, seed) => {
  const dir = C.languageDirection(brief.content.headline, brief.mood, seedWord);
  return { doc: C.composeGraphic(brief, dir, { seed }).doc, dir, kind: brief.kind };
};
const poster = () => make(POSTER, null, 'seed-a', 5);
const social = () => make(SOCIAL, null, 'seed-h', 3);
const board = (doc) => doc.artboards[0];
const words = (doc) => C.walk(board(doc)).filter((l) => l.node.type === 'text' && !l.node.decorative).map((l) => l.node.text).sort().join('|');
const logoOf = (doc) => C.walk(board(doc)).filter((l) => l.node.role === 'logo').map((l) => l.node);
const kinds = (plan) => plan.changes.map((c) => c.decision);
const has = (plan, decision, pred = () => true) => plan.changes.some((c) => c.decision === decision && pred(c));

// ── 2. a plan held to its shape (what a model might send) ──
{
  const strict = {
    intent: 'theme',
    summary: 'You get a cloud-themed sky.',
    keep: ['words', 'everything'],
    changes: [
      { decision: 'theme', theme: 'cloud', forms: null, abstraction: null, mode: null },
      { decision: 'theme', theme: 'atlantis', forms: null, abstraction: null, mode: null },
      { decision: 'type', character: null, display: 'Comic Sans MS', body: null, weight: null, case: null, from: null },
      { decision: 'palette', shifts: ['cooler', 'sparkly'], colours: { ground: '#zzzzzz', ink: null, accent: '#F0A050', support: ['#ffffff', 'nope'] }, from: null },
      { decision: 'forms', kind: 'cloud', abstraction: 400, delta: null, count: 9, scale: null, remove: null, from: null },
      { decision: 'content', role: 'headline', text: 'Invented copy' },
      { decision: 'delete-everything' },
      { decision: 'concept', action: 'save', ref: null, name: null },
    ],
    question: { text: 'Which?', options: [{ label: 'Only one', words: 'one' }] },
  };
  const p = C.normalizePlan(strict, 'make it cloud themed', 'model');
  ok('a plan with nulls where there is nothing to say is read (the strict schema’s shape)', !!p && p.by === 'model' && p.intent === 'theme', J(p));
  ok('  a theme outside the catalogue is dropped, a real one kept', p.changes.filter((c) => c.decision === 'theme').length === 1);
  ok('  a font off the list leaves the type change empty, so it is dropped', !p.changes.some((c) => c.decision === 'type'));
  ok('  colours that are not colours are dropped; real ones kept, in lower case', J(p.changes.find((c) => c.decision === 'palette')) === J({ decision: 'palette', shifts: ['cooler'], colours: { accent: '#f0a050', support: ['#ffffff'] } }), J(p.changes.find((c) => c.decision === 'palette')));
  ok('  numbers are bounded', p.changes.find((c) => c.decision === 'forms')?.abstraction === 100 && p.changes.find((c) => c.decision === 'forms')?.count === 3);
  ok('  words the designer did not write are never carried', !p.changes.some((c) => c.decision === 'content'));
  ok('  an unknown decision is dropped', !p.changes.some((c) => c.decision === 'delete-everything'));
  ok('  keep holds only what can be kept', J(p.keep) === J(['words']));
  ok('  a question needs at least two answers', !p.question);
  const kept = C.normalizePlan({ intent: 'global', summary: 's', keep: ['type'], changes: [{ decision: 'type', character: 'editorial' }, { decision: 'palette', shifts: ['warmer'] }] }, 'x', 'model');
  ok('a decision kept is never changed by the same plan', kept && !kept.changes.some((c) => c.decision === 'type') && kept.changes.some((c) => c.decision === 'palette'), J(kept));
  ok('nothing to do and nothing to ask: no plan', C.normalizePlan({ intent: 'global', summary: 's', keep: [], changes: [] }, 'x', 'model') === null);
  ok('a question is held to two to four answers', C.normalizeQuestion({ text: 'Which?', options: ['a', 'b', 'c', 'd', 'e'] })?.options.length === 4 && C.normalizeQuestion({ text: 'Which?', options: ['a'] }) === null);
}


console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
