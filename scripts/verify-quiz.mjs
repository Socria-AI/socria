// scripts/verify-quiz.mjs — THE QUIZ IN A REAL BROWSER: the whole flow, checked, with screenshots.
//
//   node scripts/verify-quiz.mjs --out <dir>
//
// Makes a quiz in Node from the invented course's material (test/fixtures/quiz-material.mjs) with the route's own
// code (checked, shuffled, keys sealed), opens scripts/quiz-gallery.tsx in Chromium, answers its grading requests
// with the real grading code, and walks it: the start, a miss with its cue and a second try, a number typed, a
// graph, the keyboard, the review (missed first, the answer given, the right one, why), Dive deeper and the next
// steps; an exam simulation held to the end; the Everything card and the expanded workspace as one object; a
// phone and the dark theme. Prints a JSON report and fails when a check does. Needs Chromium (PW_CHROMIUM).

import { build } from 'esbuild';
import { chromium } from 'playwright-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const arg = (k, d) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const OUT = resolve(arg('out', join(root, 'test', '.tmp', 'quiz-qa')));
const EXE = process.env.PW_CHROMIUM ?? '/opt/pw-browsers/chromium';
mkdirSync(OUT, { recursive: true });
process.env.QUIZ_SECRET = process.env.QUIZ_SECRET || 'quiz-qa-secret';

// the route's code, for Node: making the quiz and grading it
writeFileSync(
  join(OUT, 'node-entry.ts'),
  [
    `export { candidatesFrom, shapeQuiz } from ${JSON.stringify(join(root, 'lib/quiz/generate.ts'))};`,
    `export { sealKey, openKey, signGrade } from ${JSON.stringify(join(root, 'lib/quiz/seal.ts'))};`,
    `export { verdictFor } from ${JSON.stringify(join(root, 'lib/quiz/grade.ts'))};`,
  ].join('\n')
);
await build({ entryPoints: { node: join(OUT, 'node-entry.ts') }, bundle: true, format: 'esm', platform: 'node', outdir: OUT, outExtension: { '.js': '.mjs' }, tsconfig: join(root, 'tsconfig.json'), logLevel: 'error', alias: { '@': root } });
const N = await import(pathToFileURL(join(OUT, 'node.mjs')).href);
const F = await import(pathToFileURL(join(root, 'test', 'fixtures', 'quiz-material.mjs')).href);

await build({
  entryPoints: [join(here, 'quiz-gallery.tsx')],
  bundle: true,
  format: 'iife',
  platform: 'browser',
  outfile: join(OUT, 'quiz.js'),
  tsconfig: join(root, 'tsconfig.json'),
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
  loader: { '.css': 'css', '.woff2': 'file', '.woff': 'file', '.ttf': 'file', '.svg': 'file', '.png': 'file' },
  logLevel: 'error',
  minify: true,
});
writeFileSync(join(OUT, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="quiz.css"><style>body{margin:0}</style></head><body><div id="root"></div><script src="quiz.js"></script></body></html>`);

const OWNER = 'user_qa';
/** A quiz as the route makes it, in a mode. */
function makeQuiz(mode, id) {
  const { title, candidates } = N.candidatesFrom({ title: 'Monopoly, costs and derivatives', questions: F.CANDIDATES.filter((c) => !c.want).map((c) => c.q) });
  const shaped = N.shapeQuiz(id, title, candidates, F.DOCS, { count: 8, strictSources: false, avoidHashes: [], avoidStems: [] });
  const pool = shaped.questions.map((q, i) => ({ ...q, sealed: N.sealKey({ ...shaped.keys[i], mode }, OWNER) }));
  return {
    state: { quiz: id, title, view: 'quiz', mode, count: shaped.main, difficulty: null, pool, asked: [], records: {}, phase: 'taking', basis: { course: 'ECO 101', instructor: 'Dr Rivera', sources: F.DOCS.map((d) => ({ doc: d.id, title: d.name })), grounding: shaped.grounding, missing: [], style: { basis: 'inferred', said: 'Questions follow how ECO 101 teaches, read from your slides; no past quizzes were added, so the format is a reasonable guess, not observed.' }, targets: [] }, links: {}, priority: {}, made: 1, looked: [], children: [] },
    keys: shaped.keys,
  };
}

const errors = [];
const report = {};
const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
async function open(quiz, { vp = { width: 1180, height: 900 }, theme = 'light', both = false, dpr = 1 } = {}) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
  const requests = [];
  // the grading route, answered by the real grading code
  await p.route('**/api/logos/quiz/grade', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    requests.push(body);
    const results = {};
    for (const it of body.items ?? []) {
      const key = N.openKey(it.sealed, OWNER, body.quiz, it.qid);
      if (!key) return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ error: 'not-yours' }) });
      if (body.action === 'reveal') {
        results[it.qid] = { shown: { correct: key.answerText, why: key.why } };
        continue;
      }
      if (!it.answer) {
        if (body.action === 'finish') results[it.qid] = { shown: { correct: key.answerText, why: key.why } };
        continue;
      }
      const v = N.verdictFor(key, it.answer, it.attempt ?? 0, { final: body.action === 'finish' });
      if (!v) return route.fulfill({ status: 409, contentType: 'application/json', body: JSON.stringify({ error: 'graded at the end' }) });
      results[it.qid] = { graded: { ...v, sig: N.signGrade(OWNER, body.quiz, it.qid, it.attempt ?? 0, it.answer, v.grade), at: Date.now() } };
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ results }) });
  });
  await p.addInitScript((init) => (window.__quizInit = init), quiz.state);
  await p.goto(`${pathToFileURL(join(OUT, 'index.html')).href}?theme=${theme}${both ? '&both=1' : ''}`);
  await p.waitForSelector('.qz');
  return { p, ctx, requests };
}
const shot = async (p, name) => {
  await p.waitForTimeout(400); // the question's short fade-in, finished
  // the workspace scrolls inside the page: its whole height, as one picture
  const el = await p.$('[data-view="workspace"] .qz');
  const h = el ? await el.evaluate((n) => n.scrollHeight) : 0;
  const vp = p.viewportSize();
  if (h > vp.height) await p.setViewportSize({ width: vp.width, height: Math.min(h + 40, 4000) });
  await p.screenshot({ path: join(OUT, `${name}.png`) });
  if (h > vp.height) await p.setViewportSize(vp);
};
const check = (name, cond, detail = '') => {
  report[name] = cond ? 'ok' : `FAIL ${detail}`;
  if (!cond) process.exitCode = 1;
};
const keyFor = (quiz, qid) => quiz.keys.find((k) => k.qid === qid);
const current = (p) => p.evaluate(() => window.__space.objs[0].states[window.__space.objs[0].states.length - 1]);

// ── guided practice ──
{
  const quiz = makeQuiz('practice', 'zqa1');
  const { p, ctx, requests } = await open(quiz, { dpr: 2 });
  await shot(p, '1-start');
  const html0 = await p.content();
  check('no answer key in the page before an answer: no explanation, no answer text beyond the options', quiz.keys.every((k) => !html0.includes(k.why)) && !html0.includes('"correct"'));
  await p.click('.qz-intro .qz-primary');
  await p.waitForSelector('.qz-stem');
  // answer the first question wrong (a choice question), then right
  let s = await current(p);
  let qid = s.asked[0];
  let q = s.pool.find((x) => x.id === qid);
  const key0 = keyFor(quiz, qid);
  if (q.options) {
    const wrong = q.options.find((o) => !key0.correct.includes(o.id));
    await p.click(`.qz-opt:has(input[value="${wrong.id}"])`);
    await p.click('.qz-foot .qz-primary');
    await p.waitForSelector('.qz-fb.is-wrong');
    await shot(p, '2-first-miss');
    const fb = await p.textContent('.qz-fb');
    check('a first miss in practice: "Not quite", a cue — and not the answer', /Not quite/.test(fb) && !fb.includes(key0.answerText) && !fb.includes(key0.why), fb);
    await p.click('.qz-fb-acts .qz-secondary');
    await p.click(`.qz-opt:has(input[value="${key0.correct[0]}"])`);
    await p.click('.qz-foot .qz-primary');
    await p.waitForSelector('.qz-fb.is-right');
    check('  a second try, right: said so, with why', /second try/.test(await p.textContent('.qz-fb')));
  }
  // the rest: keyboard for choices, typing for the others; the first later choice question missed on purpose
  let missedOne = false;
  for (let i = 1; i < 8; i++) {
    s = await current(p);
    if (s.asked.length >= s.count) break;
    await p.click('.qz-foot .qz-primary'); // next
    await p.waitForTimeout(80);
    s = await current(p);
    qid = s.asked[s.asked.length - 1];
    q = s.pool.find((x) => x.id === qid);
    const k = keyFor(quiz, qid);
    if (q.figure) await shot(p, '3-figure');
    if (q.type === 'single' || q.type === 'truefalse') {
      // the keyboard: the option's number, then Enter (one wrong on purpose, for the review)
      const miss = !missedOne && i >= 2;
      if (miss) missedOne = true;
      const pick = miss ? q.options.find((o) => !k.correct.includes(o.id)) : q.options.find((o) => k.correct.includes(o.id));
      await p.locator('.qz-live').focus();
      await p.keyboard.press(String(q.options.indexOf(pick) + 1));
      await p.keyboard.press('Enter');
    } else if (q.type === 'multi') {
      for (const id of k.correct) await p.click(`.qz-opt:has(input[value="${id}"])`);
      await p.click('.qz-foot .qz-primary');
    } else {
      const typed = q.type === 'numeric' ? String(k.value) : q.type === 'expression' ? '3*x^2' : 'cos(x)';
      await p.fill('.qz-input', typed);
      await p.keyboard.press('Enter');
    }
    await p.waitForSelector('.qz-fb', { timeout: 8000 }).catch(async (e) => {
      await shot(p, 'debug-no-feedback');
      throw new Error(`no feedback on ${q.type} question ${qid}: ${await p.evaluate(() => JSON.stringify({ active: document.activeElement?.className, feed: document.querySelector('.qz-feed')?.textContent, err: document.querySelector('.qz-error')?.textContent }))}`);
    });
    // a miss on purpose: see the answer, and go on
    if (await p.$('.qz-fb.is-wrong .qz-fb-acts')) {
      await p.click('.qz-fb-acts .qz-link');
      await p.waitForSelector('.qz-fb.is-shown');
    }
  }
  s = await current(p);
  check('every question asked, every answer graded and kept', s.asked.length === s.count && s.asked.every((id) => s.records[id].attempts.every((a) => a.graded)), JSON.stringify(s.asked));
  check('  the requests carried the sealed key and the answer, never the key in the clear', requests.every((r) => (r.items ?? []).every((it) => it.sealed?.startsWith('k1.'))));
  await p.click('.qz-foot .qz-primary'); // See your results
  await p.waitForSelector('.qz-review');
  await shot(p, '4-review');
  s = await current(p);
  const missedCards = await p.$$eval('.qz-missed .qz-rc', (els) => els.map((e) => ({ yours: e.querySelector('.qz-rc-ans .is-wrong dd')?.textContent, right: e.querySelector('.qz-rc-ans .is-right dd')?.textContent, why: e.querySelector('.qz-rc-why')?.textContent })));
  check('the review: the score, the missed questions with the answer given, the right one, and why', (await p.textContent('.qz-score')).includes('/') && missedCards.length >= 1 && missedCards.every((c) => c.yours && c.right && c.why), JSON.stringify(missedCards));
  check('  the quiz told the conversation it finished (for the note and the ledger)', (await p.evaluate(() => window.__actions.map((a) => a.action))).includes('finished'));
  await p.click('.qz-dive-btn');
  await shot(p, '5-dive-deeper');
  await p.click('.qz-dive-opts .qz-secondary');
  const acts = await p.evaluate(() => window.__actions);
  check('Dive deeper asks the conversation about that exact question', acts.some((a) => a.action === 'deep-dive' && a.how === 'reasoning' && s.asked.includes(a.q)), JSON.stringify(acts));
  await p.click('.qz-next .qz-primary');
  check('Practise weak spots asks for a practice on what was missed', (await p.evaluate(() => window.__actions.map((a) => a.action))).includes('practice'));
  await p.click('.qz-next .qz-link');
  check('Back to the conversation is asked for', (await p.evaluate(() => window.__actions.map((a) => a.action))).includes('return'));
  report['practice score'] = `${s.asked.filter((id) => s.records[id].attempts.some((a) => a.graded?.grade === 'right')).length}/${s.count}`;
  await ctx.close();
}

// ── exam simulation ──
{
  const quiz = makeQuiz('exam', 'zqa2');
  const { p, ctx, requests } = await open(quiz);
  await p.click('.qz-intro .qz-primary');
  for (let i = 0; i < 8; i++) {
    let s = await current(p);
    const qid = s.asked[s.asked.length - 1];
    const q = s.pool.find((x) => x.id === qid);
    if (q.options) await p.click(`.qz-opt:has(input[value="${q.options[0].id}"])`);
    else await p.fill('.qz-input', q.type === 'numeric' ? '1' : 'x');
    await p.click('.qz-foot .qz-primary');
    await p.waitForSelector('.qz-saved');
    s = await current(p);
    if (s.asked.length >= s.count) break;
    await p.click('.qz-foot .qz-primary');
  }
  check('an exam simulation: no grading request and no feedback before the end', requests.length === 0 && !(await p.$('.qz-fb')));
  await shot(p, '6-exam-taking');
  await p.click('.qz-foot .qz-primary');
  await p.waitForSelector('.qz-review');
  const s = await current(p);
  check('  the end grades every answer at once and shows the answer to every question', requests.length === 1 && requests[0].action === 'finish' && s.asked.every((id) => s.records[id].attempts[0].graded && s.records[id].shown), JSON.stringify(requests.map((r) => r.action)));
  await shot(p, '7-exam-review');
  await ctx.close();
}

// ── one object, two views; a phone; the dark theme ──
{
  const quiz = makeQuiz('practice', 'zqa3');
  const { p, ctx } = await open(quiz, { both: true, vp: { width: 1400, height: 900 } });
  await p.click('[data-view="everything"] .qz-intro .qz-primary');
  const s = await current(p);
  const k = keyFor(quiz, s.asked[0]);
  const q = s.pool.find((x) => x.id === s.asked[0]);
  if (q.options) await p.click(`[data-view="everything"] .qz-opt:has(input[value="${k.correct[0]}"])`);
  else await p.fill('[data-view="everything"] .qz-input', q.type === 'numeric' ? String(k.value) : '3*x^2');
  await p.click('[data-view="everything"] .qz-foot .qz-primary');
  await p.waitForSelector('[data-view="workspace"] .qz-fb.is-right');
  check('the Everything card and the expanded workspace are one quiz: answered in one, graded in both', !!(await p.$('[data-view="everything"] .qz-fb.is-right')) && (await p.textContent('[data-view="workspace"] .qz-q-n')) === (await p.textContent('[data-view="everything"] .qz-q-n')));
  await shot(p, '8-two-views');
  await ctx.close();
  for (const [name, opts] of [
    ['9-phone', { vp: { width: 390, height: 844 }, dpr: 2 }],
    ['10-dark', { theme: 'dark', dpr: 2 }],
  ]) {
    const { p: pp, ctx: c2 } = await open(makeQuiz('practice', `zqa-${name}`), opts);
    await pp.click('.qz-intro .qz-primary');
    await pp.waitForSelector('.qz-stem');
    const wide = await pp.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    check(`${name}: nothing overflows the screen`, !wide);
    await shot(pp, name);
    await c2.close();
  }
}

// ── reduced motion ──
{
  const ctx = await browser.newContext({ viewport: { width: 900, height: 700 }, reducedMotion: 'reduce' });
  const p = await ctx.newPage();
  await p.addInitScript((init) => (window.__quizInit = init), makeQuiz('practice', 'zqa4').state);
  await p.goto(pathToFileURL(join(OUT, 'index.html')).href);
  await p.click('.qz-intro .qz-primary');
  const anim = await p.evaluate(() => getComputedStyle(document.querySelector('.qz-q')).animationName);
  check('reduced motion: the question does not animate in', anim === 'none', anim);
  await ctx.close();
}

await browser.close();
if (errors.length) {
  report.errors = errors.slice(0, 10);
  process.exitCode = 1;
}
writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 1));
