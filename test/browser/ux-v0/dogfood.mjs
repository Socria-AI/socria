// SocriaUX dogfooding: six real kinds of project, four ways of asking, drawn and measured.
//
// Projects: Socria's promotional site and its product announcement (the
// benchmark's briefs), a research lab's site, an experimental illustrator's
// portfolio, a finance product's interface, and a motion-rich dance company.
// Each is asked four ways: a minimal brief; a detailed specification (exact
// grid, scale and motion, colour and motion locked, rules); an extensive
// moodboard (notes on references, colours sampled, a moving reference); and
// experimental notes. For each: SocriaUX's direction engine proposes, the
// planner lays out hand-written copy (no model here: the copy is fixed so the
// design system is what is measured), the renderer draws it, Chromium
// photographs it at 1280 and 390 px (and mid-arrival for motion), and the
// checks measure fidelity to the direction, the brief's locks and rules.
//
// Reports: the language and motion each case got, how far apart the first
// directions for different projects are (look distance, 0–1), how far the
// four askings of one project move it, fidelity, and the locks and rules
// kept. Needs test/.tmp (node test/run.mjs builds it) and real Chromium.
import { readFileSync, writeFileSync } from 'node:fs';
import { chromium, S, FX, underTest } from './env.mjs';
import { projectsFor } from './dogfood-projects.mjs';

const V = await underTest();
const { PROJECTS, ref } = projectsFor(V);

// four ways of asking
const CONDITIONS = {
  minimal: () => ({ notes: '' }),
  detailed: (p) => ({
    notes: '',
    brief: {
      ...p.brief,
      decisions: { colour: 'locked', motion: 'locked', layout: 'locked' },
      spec: { grid: p.brief.pageType === 'app-screen' ? 'stack' : 'editorial', ratio: 1.25, density: 'spacious', motion: V.MOTION_PRESETS.measured },
      rules: ['No capitals', 'No rounded corners'],
    },
  }),
  moodboard: (p) => {
    const refs = [
      ref('cafe-bar', { note: 'The light, not the bar itself', take: ['atmosphere', 'colour'], leave: ['imagery'], swatches: ['#2a1d16', '#e9d9c3', '#b8865b'], key: true }),
      ref('grid', { note: 'This asymmetric grid, generous white space', take: ['composition'] }),
      ref('pour', { note: 'slow, calm drift', take: ['motion'], media: 'video' }),
      ref('marble', { note: 'too corporate, rounded cards', avoid: true }),
      ...p.pics.map((n) => ref(n, { asContent: true })),
    ];
    return { notes: '', board: V.normalizeMoodboard({ refs }) };
  },
  experimental: () => ({ notes: 'more experimental: kinetic, asymmetric, oversized type, louder' }),
};

// the real typefaces, through the session's proxy when there is one (so the photographs show the type the
// direction chose); with no network, an empty stylesheet and the system's fallbacks, which the report notes
const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1,images.example.test' } : undefined;
const b = await chromium.launch(proxy ? { proxy } : {});
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));
if (!proxy || process.env.UXV0_FONTS === 'stub') await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
const realFonts = !!proxy && process.env.UXV0_FONTS !== 'stub';
const page = await ctx.newPage();
const rows = [];
const firsts = {};
for (const p of PROJECTS) {
  for (const [cond, make] of Object.entries(CONDITIONS)) {
    const c = make(p);
    const theBrief = c.brief ? V.normalizeBrief(c.brief, null) : p.brief;
    const board = c.board ?? V.normalizeMoodboard({ refs: p.pics.map((n) => ref(n, { asContent: true })) });
    const dirs = V.proposeDirections({ brief: theBrief, notes: c.notes, board: V.readBoard(board) });
    const d = dirs[0];
    const look = V.designFromDirection(d);
    const spec = V.planLayout(V.normalizeSpec({ version: 1, pageType: theBrief.pageType, platform: theBrief.platform, title: p.name, tokens: look.tokens, look: look.look, sections: p.sections, notes: [], reason: 'dogfood', createdAt: Date.now() }, board));
    const ev = V.evaluateDesign(spec, {}, d.locks, { direction: d, brief: theBrief, board });
    const html = V.renderDesign(spec, board.refs).html;
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.setContent(html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(250);
    await page.screenshot({ path: `${S}df-${p.id}-${cond}.png` });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(150);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    // a word broken across two lines (a headline too large for its longest word) reads as a mistake
    const brokenWords = await page.evaluate(() => {
      const out = [];
      for (const h of document.querySelectorAll('h1, h2, .h-giant')) {
        const walker = document.createTreeWalker(h, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const re = /\S+/g;
          for (let m = re.exec(n.data); m; m = re.exec(n.data)) {
            const r = document.createRange();
            r.setStart(n, m.index);
            r.setEnd(n, m.index + m[0].length);
            const lines = new Set([...r.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top)));
            if (lines.size > 1) out.push(m[0]);
          }
        }
      }
      return out;
    });
    const overflowing = overflow > 0 ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.marquee')).slice(0, 4).map((e) => `${e.tagName.toLowerCase()}.${[...e.classList].join('.')} → ${Math.round(e.getBoundingClientRect().right)}px`)) : [];
    await page.screenshot({ path: `${S}df-${p.id}-${cond}-phone.png` });
    if (cond === 'minimal' || cond === 'experimental') {
      // mid-arrival: the motion, really playing
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.setContent(V.renderDesign(spec, board.refs, { motion: 'play' }).html, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(260);
      await page.screenshot({ path: `${S}df-${p.id}-${cond}-moving.png` });
    }
    // the page as the Preview and the export play it, on a phone: kinetic words are unbreakable there
    await page.setViewportSize({ width: 390, height: 844 });
    await page.setContent(V.renderDesign(spec, board.refs, { motion: 'play' }).html, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const playOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const row = {
      project: p.id,
      cond,
      language: d.language,
      motion: d.look.motion.feel,
      fonts: `${d.tokens.fonts.display} / ${d.tokens.fonts.body}`,
      grid: d.look.grid,
      locks: d.locks.join(','),
      fidelity: ev.fidelity,
      findings: ev.findings.filter((f) => f.kind === 'fidelity').map((f) => f.message),
      kept: ev.kept.length,
      phoneOverflow: overflow,
      playOverflow,
      overflowing,
      brokenWords,
      said: d.rationale.filter((r) => /From your notes|Colours sampled/.test(r)).join(' '),
    };
    rows.push(row);
    if (cond === 'minimal') firsts[p.id] = d;
    console.log(`${p.id.padEnd(14)} ${cond.padEnd(12)} ${d.language.padEnd(13)} motion:${d.look.motion.feel.padEnd(9)} ${row.grid.padEnd(11)} fidelity:${ev.fidelity} overflow:${overflow} ${row.locks ? 'locks:' + row.locks : ''}`);
  }
}
// how far apart: first directions of different projects; and the four askings of one project
const ids = Object.keys(firsts);
const across = [];
const pairs = [];
for (let i = 0; i < ids.length; i++)
  for (let j = i + 1; j < ids.length; j++) {
    const dist = V.directionDistance(firsts[ids[i]], firsts[ids[j]]);
    across.push(dist);
    pairs.push({ pair: `${ids[i]} · ${ids[j]}`, distance: Math.round(dist * 1000) / 1000 });
  }
pairs.sort((x, y) => x.distance - y.distance);
const within = PROJECTS.map((p) => {
  const ds = rows.filter((r) => r.project === p.id);
  return new Set(ds.map((r) => `${r.language}|${r.motion}|${r.grid}`)).size;
});
const summary = {
  cases: rows.length,
  languagesUsed: [...new Set(rows.map((r) => r.language))],
  motionFeels: [...new Set(rows.map((r) => r.motion))],
  meanDistanceAcrossProjects: Math.round((across.reduce((a, x) => a + x, 0) / across.length) * 1000) / 1000,
  minDistanceAcrossProjects: Math.min(...across),
  closestPairs: pairs.slice(0, 3),
  distinctLooksPerProject: within,
  meanFidelity: Math.round(rows.reduce((a, r) => a + r.fidelity, 0) / rows.length),
  fidelityBelow100: rows.filter((r) => r.fidelity < 100).map((r) => `${r.project}/${r.cond}: ${r.findings.join('; ')}`),
  phoneOverflows: rows.filter((r) => r.phoneOverflow > 0).map((r) => `${r.project}/${r.cond}`),
  playingPhoneOverflows: rows.filter((r) => r.playOverflow > 0).map((r) => `${r.project}/${r.cond}: ${r.playOverflow}px`),
  phoneBrokenWords: rows.filter((r) => r.brokenWords.length).map((r) => `${r.project}/${r.cond}: ${r.brokenWords.join(', ')}`),
  detailedKeptLocks: rows.filter((r) => r.cond === 'detailed').every((r) => /palette/.test(r.locks) && /motion/.test(r.locks)),
  realFonts,
};
writeFileSync(`${S}dogfood.json`, JSON.stringify({ summary, rows }, null, 2));
console.log(JSON.stringify(summary, null, 2));
await b.close();
