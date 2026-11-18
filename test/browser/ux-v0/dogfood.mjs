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
import { BRIEFS } from './benchmark-briefs.mjs';

const V = await underTest();
const ref = (n, o = {}) => ({ provider: 'openverse', providerId: n, id: `openverse:${n}`, url: `https://images.example.test/${n}.jpg`, thumb: `https://images.example.test/${n}.jpg`, width: 1600, height: 1067, title: n.replace(/-/g, ' '), creator: 'A', creatorUrl: '', sourceUrl: 'https://example.org/' + n, license: 'CC BY 2.0', licenseUrl: '', attribution: n, category: 'imagery', state: 'kept', ...o });
const brief = (o) => V.normalizeBrief({ pageType: 'website', platform: 'web', userGoals: [], functionalRequirements: [], openQuestions: [], references: [], ...o }, null);

const fromBench = (id) => {
  const b = BRIEFS.find((x) => x.id === id);
  return { brief: V.normalizeBrief(b.brief, null), sections: b.sections, pics: [] };
};

const PROJECTS = [
  { id: 'socria-promo', name: 'Socria, promotional site', ...fromBench('socria') },
  { id: 'socria-launch', name: 'Socria One, product announcement', ...fromBench('socria-one') },
  {
    id: 'research',
    name: 'Northfield Climate Lab, research site',
    brief: brief({
      objective: 'Share the lab’s research on coastal flooding, its open data and papers, and recruit doctoral students.',
      audience: 'Researchers, policy makers and prospective doctoral students',
      personality: ['rigorous', 'clear', 'open', 'calm'],
      visualDirection: 'Precise and data-forward, like a well-made academic report: editorial, quiet, trustworthy.',
      palette: [{ hex: '#f7f7f4', role: 'background' }, { hex: '#14213d', role: 'text' }, { hex: '#1d6e8a', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }],
      typography: { display: 'Source Serif 4', body: 'Public Sans', rationale: '' },
      layoutDirection: 'An index of programmes, figures, papers and data.',
    }),
    pics: ['dusk', 'grid'],
    sections: [
      { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Northfield Climate Lab', links: ['Research', 'Data', 'Papers', 'People'], cta: 'Apply' } },
      { id: 'hero', kind: 'hero', variant: 'editorial', content: { eyebrow: 'Coastal flooding, measured', title: 'How the sea comes *in*, street by street.', subtitle: 'Twenty years of tide, rain and surge records, open to anyone, and the models we build from them.', primary: 'Explore the data', secondary: 'Read the papers' }, images: ['openverse:dusk'] },
      { id: 'figs', kind: 'stats', variant: 'row', content: { items: [{ value: '2,400', label: 'gauges' }, { value: '20 yrs', label: 'of records' }, { value: '61', label: 'papers' }] } },
      { id: 'prog', kind: 'features', variant: 'index', content: { title: 'Programmes', items: [{ title: 'Surge forecasting', text: 'Predicting the next ten days of coastal water levels.' }, { title: 'Urban drainage', text: 'Where rain goes when the drains are full.' }, { title: 'Policy and risk', text: 'Turning flood models into decisions councils can make.' }] } },
      { id: 'data', kind: 'split', variant: 'image-right', content: { eyebrow: 'Open data', title: 'Every measurement, downloadable', text: 'Hourly records from every gauge, documented and licensed for reuse.', bullets: ['CSV and NetCDF', 'Versioned releases', 'API access'], cta: 'Browse the data' }, images: ['openverse:grid'] },
      { id: 'cta', kind: 'cta', variant: 'band', content: { title: 'Doctoral places for 2027', text: 'Four funded places, starting in October.', primary: 'Apply by 31 January' } },
      { id: 'foot', kind: 'footer', variant: 'columns', content: { brand: 'Northfield Climate Lab', tagline: 'Coastal flooding, measured.', columns: [{ title: 'Lab', links: ['Research', 'People'] }], legal: '© Northfield' } },
    ],
  },
  {
    id: 'portfolio',
    name: 'Mira Okafor, experimental portfolio',
    brief: brief({
      objective: 'Show Mira’s illustration and animation work and bring in editorial and studio commissions.',
      audience: 'Art directors at magazines, studios and agencies',
      personality: ['playful', 'strange', 'bold', 'warm'],
      visualDirection: 'Experimental: oversized type, colour fields, asymmetric, the work at full size.',
      palette: [{ hex: '#fff4e6', role: 'background' }, { hex: '#1e1b18', role: 'text' }, { hex: '#e8452c', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }],
      typography: { display: 'Unbounded', body: 'Inter', rationale: '' },
      layoutDirection: 'The work first, words second.',
    }),
    pics: ['people', 'ceramic', 'window', 'marble'],
    sections: [
      { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Mira Okafor', links: ['Work', 'Motion', 'About'], cta: 'Commission' } },
      { id: 'hero', kind: 'hero', variant: 'poster', content: { eyebrow: 'Illustration · animation', title: 'Drawings that *move*.', subtitle: 'For magazines, studios and the odd record sleeve.', primary: 'See the work' } },
      { id: 'work', kind: 'gallery', variant: 'mosaic', content: { title: 'Recent work' }, images: ['openverse:people', 'openverse:ceramic', 'openverse:window', 'openverse:marble'] },
      { id: 'about', kind: 'text', variant: 'lead', content: { title: 'Mira draws the way people talk with their hands.', paragraphs: ['Ten years of editorial illustration, three animated shorts, and a habit of drawing on the train.'] } },
      { id: 'q', kind: 'quote', variant: 'pull', content: { quote: 'She made our quarterly feel like a comic you wanted to keep.', author: 'An art director', role: 'a design magazine' } },
      { id: 'cta', kind: 'cta', variant: 'statement', content: { title: 'Got a strange brief?', primary: 'Write to Mira' } },
      { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Mira Okafor', tagline: 'Drawings that move.', legal: '© Mira Okafor' } },
    ],
  },
  {
    id: 'product-ui',
    name: 'Ledgerline, finance operations interface',
    brief: brief({
      objective: 'Give finance teams one calm screen for this month’s close: what is reconciled, what is not, and who is on it.',
      audience: 'Finance operations leads in mid-sized companies',
      personality: ['precise', 'calm', 'trustworthy'],
      visualDirection: 'A sophisticated product interface: dense where it must be, quiet everywhere else.',
      palette: [{ hex: '#ffffff', role: 'background' }, { hex: '#101828', role: 'text' }, { hex: '#3b5bdb', role: 'accent' }, { hex: '#ffffff', role: 'accent-text' }],
      typography: { display: 'Inter', body: 'Inter', rationale: '' },
      pageType: 'app-screen',
    }),
    pics: [],
    sections: [
      { id: 'nav', kind: 'app-nav', variant: 'sidebar', content: { brand: 'Ledgerline', items: ['Close', 'Accounts', 'Reconcile', 'Reports', 'Team'], active: 'Close', user: 'A. Finance' } },
      { id: 'head', kind: 'app-header', variant: 'default', content: { title: 'November close', subtitle: 'Day 3 of 5 · 82% reconciled', actions: ['Export', 'Assign'], search: true } },
      { id: 'figs', kind: 'stat-cards', variant: 'default', content: { items: [{ label: 'Reconciled', value: '82%', delta: '+9 today', trend: 'up' }, { label: 'Open items', value: '146', delta: '−31', trend: 'down' }, { label: 'Days left', value: '2', trend: 'flat' }] } },
      { id: 'chart', kind: 'chart', variant: 'area', content: { title: 'Reconciled by day', labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'], series: [{ name: 'This month', values: [31, 58, 82, 82, 82] }, { name: 'Last month', values: [24, 49, 71, 90, 100] }] } },
      { id: 'table', kind: 'table', variant: 'default', content: { title: 'Accounts', columns: ['Account', 'Owner', 'Status'], rows: [{ cells: ['Bank: operating', 'Priya'], status: 'Reconciled' }, { cells: ['Payroll', 'Tom'], status: 'Open' }, { cells: ['Card spend', 'Ana'], status: 'In review' }] } },
    ],
  },
  {
    id: 'motion-site',
    name: 'Pulse Dance Company, motion-rich site',
    brief: brief({
      objective: 'Sell tickets for Pulse’s 2027 season and make the company’s movement felt before anyone reads a word.',
      audience: 'Contemporary dance audiences and curious first-timers',
      personality: ['kinetic', 'bold', 'physical', 'night'],
      visualDirection: 'Motion-rich: kinetic type, a dark stage, light in one strong colour.',
      palette: [{ hex: '#0f0e12', role: 'background' }, { hex: '#f4f1ea', role: 'text' }, { hex: '#ff3d7f', role: 'accent' }, { hex: '#0f0e12', role: 'accent-text' }],
      typography: { display: 'Anton', body: 'Inter', rationale: '' },
      layoutDirection: 'One huge statement, then the season as a running list.',
    }),
    pics: ['people', 'dusk', 'window'],
    sections: [
      { id: 'nav', kind: 'nav', variant: 'inline', content: { brand: 'Pulse', links: ['Season', 'Company', 'Visit'], cta: 'Tickets' } },
      { id: 'hero', kind: 'hero', variant: 'statement', content: { eyebrow: 'Season 2027', title: 'Bodies in *motion*.', subtitle: 'Six new works, one stage, forty nights.', primary: 'Book the season', secondary: 'Watch the trailer' } },
      { id: 'works', kind: 'features', variant: 'columns', content: { title: 'This season', items: [{ title: 'Undertow', text: 'Twelve dancers and a falling wall of sound.' }, { title: 'Glass hours', text: 'A duet for two dancers and one light.' }, { title: 'Run', text: 'Forty minutes that never stop.' }] } },
      { id: 'gal', kind: 'gallery', variant: 'grid', content: { title: 'In rehearsal' }, images: ['openverse:people', 'openverse:dusk', 'openverse:window'] },
      { id: 'figs', kind: 'stats', variant: 'giant', content: { items: [{ value: '6', label: 'new works' }, { value: '40', label: 'nights' }] } },
      { id: 'cta', kind: 'cta', variant: 'statement', content: { title: 'Book the whole season', primary: 'Season tickets' } },
      { id: 'foot', kind: 'footer', variant: 'simple', content: { brand: 'Pulse Dance Company', tagline: 'Bodies in motion.', legal: '© Pulse' } },
    ],
  },
];

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
