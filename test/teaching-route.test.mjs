// COURSE PROFILES THROUGH THE REAL ROUTE (app/api/logos/chat).
//
// Only the database (fake-supabase), Clerk and the model (fake-openai-logos: it records what it was sent and
// streams a scripted reply) are replaced. The course pack is made from the invented course's materials
// (test/fixtures/course-materials.mjs) by the same code the browser runs (lib/teaching). Held down:
//   • no pack, or LOGOS_COURSES=off: the route exactly as it was (byte-identical prompts, no header);
//   • a learning turn: the course block in THIS turn's context (never the stable prompt), with the course's
//     terms, what it keeps coming back to, and where this student struggled (from their ledger);
//   • the planner leans as the course teaches: an example first where the course opens with one;
//   • a practice turn: the course's assessment demands aimed at the student's gaps — and MR's quiz contract
//     holds (the difficulty kept, the answer kept back);
//   • a sentence claiming to know what an exam will ask never reaches them; counted, never quoted;
//   • copied wording measured against the course's past questions, as a count;
//   • the gate: a guest, a collaborative thread, an off-the-record turn get no course;
//   • a pack that does not hold together is ignored, never an error.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { systemOf } from './helpers/prompt.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-teaching');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
await build({
  entryPoints: [join(root, 'app/api/logos/chat/route.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: join(OUT, 'chat.mjs'),
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [
    {
      name: 'swap',
      setup(b) {
        b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
          const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
          if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
          return undefined;
        });
        b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
        b.onResolve({ filter: /^openai$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-openai-logos.mjs')).href, external: true }));
        b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
        b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
      },
    },
  ],
  external: ['next', 'next/*', 'undici', '@supabase/*', 'stripe', 'resend'],
  logLevel: 'error',
});
// the profile code the browser runs, bundled the same way
await build({ entryPoints: [join(root, 'lib/teaching/teaching.ts')], bundle: true, format: 'esm', platform: 'node', outfile: join(OUT, 'teaching.mjs'), tsconfig: join(root, 'tsconfig.json'), logLevel: 'error' });

const courseLog = [];
const quiet = (orig) => (...a) => {
  const first = typeof a[0] === 'string' ? a[0] : '';
  if (first.startsWith('[course]')) return void courseLog.push(first);
  if (/^\[(socria|logos|core4|tokens|search|epistemic|mr|explain)/.test(first) || first.startsWith('logos') || first.startsWith('conversations')) return;
  orig(...a);
};
console.info = quiet(console.info.bind(console));
console.warn = quiet(console.warn.bind(console));
console.error = quiet(console.error.bind(console));

process.env.OPENAI_API_KEY = 'test';
process.env.RATE_LIMIT_DISABLED = '1';
globalThis.__uid = 'user_course';
await import(pathToFileURL(FAKE_DB).href);
const chat = await import(pathToFileURL(join(OUT, 'chat.mjs')).href);
const T = await import(pathToFileURL(join(OUT, 'teaching.mjs')).href);
const F = await import(pathToFileURL(join(here, 'fixtures', 'course-materials.mjs')).href);
const { NextRequest } = await import('next/server.js');

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 500))));
const U = (content) => ({ role: 'user', content });
const DAY = 86_400_000;

// the invented course, read as the browser reads it
const now = Date.now();
let profile = T.newProfile({ course: 'My course' }, now);
for (const d of [F.syllabus(), F.slides(), F.midterm1(), F.midterm2(), F.quiz()]) profile = T.addMaterial(profile, T.digestMaterial(d, { now, allowed: true }), now);
const pack = T.packOf(profile, 'materials');
const leaning = { ...pack, codes: [...pack.codes, { code: 'intro.example-first', c: 'moderate', b: 'inferred' }] };
const ledger = [{ topic: 'consumer surplus', seen: 4, right: 1, wrong: 3, last: now - 2 * DAY, box: 0, failed: ['analogy'] }];

async function turn(body, { reply = 'Here it is.', env = {}, uid } = {}) {
  const saved = Object.fromEntries(Object.keys(env).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(env)) v === undefined ? delete process.env[k] : (process.env[k] = v);
  const savedUid = globalThis.__uid;
  if (uid !== undefined) globalThis.__uid = uid;
  try {
    globalThis.__logosCalls = [];
    globalThis.__logosPrompts = [];
    globalThis.__logosReply = reply;
    globalThis.__logosScript = [];
    const before = courseLog.length;
    const r = await chat.POST(new NextRequest('http://localhost/api/logos/chat', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ surface: 'logos5', sessionId: 'conv_course_1', ...body }) }));
    const received = await r.text().catch(() => '');
    await new Promise((ok) => setTimeout(ok, 40));
    const streamed = globalThis.__logosCalls.find((c) => c.stream);
    return { status: r.status, received, system: systemOf(streamed), streamed, course: r.headers.get('x-socria-course'), explain: r.headers.get('x-socria-explain'), mr: r.headers.get('x-socria-mr'), log: courseLog.slice(before) };
  } finally {
    for (const [k, v] of Object.entries(saved)) v === undefined ? delete process.env[k] : (process.env[k] = v);
    globalThis.__uid = savedUid;
  }
}
const promptOf = (call) => JSON.stringify(call?.messages ?? null).replace(/NOW: [^"\\]*? where they are/g, 'NOW: <the time> where they are');
const stableOf = (call) => String(call?.messages?.[0]?.content ?? '');
const ASK = 'What is consumer surplus, and why does a price ceiling change it?';

console.log('\n=== no course: the route as it was ===');
{
  const none = await turn({ messages: [U(ASK)] });
  const off = await turn({ messages: [U(ASK)], course: pack }, { env: { LOGOS_COURSES: 'off' } });
  ok('LOGOS_COURSES=off sends the prompt a turn without a course sends, byte for byte', none.status === 200 && promptOf(none.streamed) === promptOf(off.streamed));
  ok('  no course header, no course line', none.course === null && off.course === null && none.log.length === 0 && off.log.length === 0, `${off.course} ${off.log.join('|')}`);
}

console.log('\n=== a learning turn in the course ===');
{
  const r = await turn({ messages: [U(ASK)], course: pack, learning: ledger });
  ok('the course block is in this turn’s context', /THIS COURSE — ECO 304K · Smith/.test(r.system), r.system.slice(-900));
  ok('  never in the stable prompt (the cache prefix is untouched)', !stableOf(r.streamed).includes('THIS COURSE'));
  ok('  the course’s terms, and what it keeps coming back to', /Use the course's own terms where they fit: [^\n]*consumer surplus/.test(r.system) && /keeps coming back to \(6 past questions\)/.test(r.system), r.system.slice(-900));
  ok('  where this student struggled, from their own ledger', /got consumer surplus wrong before/.test(r.system) && /lost after an analogy/.test(r.system), r.system.slice(-900));
  ok('  and it says what it is: never what the course will ask', /never what it will ask/.test(r.system));
  ok('the trace says which course, why, and what it shaped — content-free', /^why=materials;codes=\d+;g=1;p=0$/.test(r.course ?? '') && !/consumer|surplus|ECO/.test(r.course ?? ''), r.course);
}

console.log('\n=== the planner leans as the course teaches ===');
{
  const LEARN = 'Help me understand consumer surplus for my economics course — I keep getting it confused.';
  const plain = await turn({ messages: [U(LEARN)] });
  const leaned = await turn({ messages: [U(LEARN)], course: leaning });
  ok('a course that opens with an example: the explanation opens with one too', /worked/.test(leaned.explain ?? '') && !/worked/.test(plain.explain ?? ''), `${plain.explain} → ${leaned.explain}`);
  ok('  and the block says so', /concrete example before the general idea/.test(leaned.system));
}

console.log('\n=== practice in the course’s style ===');
{
  const r = await turn({ messages: [U('Quiz me in the style of ECO 304K, starting with consumer surplus — one question at a time.')], course: pack, learning: ledger }, { reply: 'Here is the first one. Suppose a city caps rents below the market price: what happens to consumer surplus?' });
  ok('the course’s assessment demands, aimed at the student', /Formats, as the course's past questions run: about 3 in 5 multiple choice/.test(r.system) && /reading or drawing a graph or diagram/.test(r.system) && /Aim first at: consumer surplus/.test(r.system), r.system.slice(-1400));
  ok('  new questions, never the course’s wording, never a claim about the exam', /never the wording of the course’s own questions/.test(r.system) && /never say or suggest that a question will be on their exam/.test(r.system));
  ok('  traced as practice', /;p=1$/.test(r.course ?? ''), r.course);
  ok('MR’s quiz contract holds: the difficulty kept, the question allowed', /;a=preserve_challenge;/.test(r.mr ?? '') && /what happens to consumer surplus\?/.test(r.received), `${r.mr} | ${r.received}`);
}

console.log('\n=== never a prediction ===');
{
  const reply = 'This will definitely be on your exam. Consumer surplus is the area between the demand curve and the price paid.';
  const r = await turn({ messages: [U(ASK)], course: pack }, { reply });
  ok('the sentence claiming to know the exam never reaches them; the explanation does', !/definitely be on your exam/.test(r.received) && /area between the demand curve/.test(r.received), r.received);
  ok('  counted in the course line, never quoted', r.log.some((l) => /;predicted=1$/.test(l)) && !r.log.some((l) => /definitely/.test(l)), r.log.join(' | '));
  const without = await turn({ messages: [U(ASK)] }, { reply });
  ok('  (no course in play: the gate is the course’s, nothing changes)', /definitely be on your exam/.test(without.received));
}

console.log('\n=== copied wording, measured ===');
{
  const r = await turn({ messages: [U('Quiz me in the style of ECO 304K.')], course: pack }, { reply: 'Which of the following is NOT a determinant of demand? a) consumer income b) the prices of related goods c) the cost of inputs' });
  const copied = Number(/;copied=(\d+)/.exec(r.log.join(' '))?.[1] ?? -1);
  ok('a reply that repeats a past question is counted', copied >= 4, r.log.join(' | '));
  const fresh = await turn({ messages: [U('Quiz me in the style of ECO 304K.')], course: pack }, { reply: 'A city caps rents below the market price. Sketch the market and shade what consumers lose.' });
  ok('  a new one with the same demand is not', /;copied=0;/.test(fresh.log.join(' ')), fresh.log.join(' | '));
}

console.log('\n=== the gate ===');
{
  const guest = await turn({ messages: [U(ASK)], course: pack }, { uid: null });
  ok('a guest: no course', !/THIS COURSE/.test(guest.system) && guest.course === null, JSON.stringify({ status: guest.status, course: guest.course, body: guest.received.slice(0, 160) }));
  const collab = await turn({ messages: [U(ASK)], course: pack, collab: true });
  ok('a collaborative thread: no course', !/THIS COURSE/.test(collab.system) && collab.course === null);
  const offRecord = await turn({ messages: [U(`Off the record: ${ASK}`)], course: pack });
  ok('an off-the-record turn: no course', !/THIS COURSE/.test(offRecord.system) && offRecord.course === null, offRecord.course);
  const junk = await turn({ messages: [U(ASK)], course: { id: 'DROP TABLE;', label: 42, codes: 'all of them' } });
  ok('a pack that does not hold together is ignored, never an error', junk.status === 200 && !/THIS COURSE/.test(junk.system) && junk.course === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
