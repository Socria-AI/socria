// Every section kind × variant, across styles and palettes: renders cleanly, text reads at 4.5:1 (over images, at the
// worst case), targets are 44 px at 390, nothing scrolls sideways. Needs test/.tmp (node test/run.mjs builds it).
import { chromium, S, FX, ROOT, BASE, underTest } from './env.mjs';
// Every section kind × variant: renders cleanly, reads at 4.5:1, targets ≥ 44px at 390, no sideways scroll.
import { readFileSync } from 'node:fs';
const V = await underTest();
const names = ['cafe-bar', 'pour', 'window', 'people', 'marble', 'ceramic'];
const refs = names.map((n) => ({ provider: 'openverse', providerId: n, id: `openverse:${n}`, url: `https://images.example.test/${n}.jpg`, thumb: `https://images.example.test/${n}.jpg`, width: 1600, height: 1067, title: n, creator: 'A', creatorUrl: '', sourceUrl: 'https://example.org/' + n, license: 'CC BY 2.0', licenseUrl: '', attribution: n, category: 'imagery', state: 'kept' }));
const words = 'Morning light falls across the long table where neighbours meet before work and stay a little longer than planned'.split(' ');
const text = (max, seed = 0) => { let s = ''; let i = seed; while (s.length < Math.min(max, 64)) s += (s ? ' ' : '') + words[i++ % words.length]; return s.slice(0, max).replace(/\s+\S*$/, '') || 'Coffee'; };
function sample(field, key, seed) {
  switch (field.t) {
    case 'text': return key === 'price' ? '£4' : key === 'value' ? '1,240' : key === 'delta' ? '+12%' : key === 'period' ? 'a month' : text(field.max, seed);
    case 'texts': return Array.from({ length: Math.max(field.n[0], Math.min(field.n[1], 3)) }, (_, i) => text(field.max, seed + i * 3));
    case 'nums': return [3, 5, 4, 7, 6].slice(0, Math.max(field.n[0], 5));
    case 'enum': return field.values[0];
    case 'bool': return key === 'featured' ? seed % 2 === 0 : key === 'search';
    case 'list': return Array.from({ length: Math.max(field.n[0], Math.min(field.n[1], 3)) }, (_, i) => Object.fromEntries(Object.entries(field.item).map(([k, f]) => [k, sample(f, k, seed + i * 5)])));
    default: return undefined;
  }
}
const contentFor = (def) => {
  const c = Object.fromEntries(Object.entries(def.fields).map(([k, f]) => [k, sample(f, k, k.length)]));
  if (def.kind === 'chart') { c.labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']; c.series = [{ name: 'Visits', values: [3, 5, 4, 7, 6] }]; }
  if (def.kind === 'table') { c.columns = ['Name', 'Time', 'Seats']; c.rows = [{ cells: ['Ada', '8:00', '4'], status: 'Booked' }, { cells: ['Ben', '9:30', '2'], status: 'Waiting' }]; }
  if (def.kind === 'form') c.fields = [{ label: 'Your name', type: 'text', required: true }, { label: 'Email', type: 'email', required: true }, { label: 'How many?', type: 'select', options: ['2', '4', '6'] }, { label: 'Notes', type: 'textarea' }, { label: 'Keep me posted', type: 'checkbox' }];
  return c;
};
const PALETTES = {
  roast: { background: '#f4efe6', surface: '#fbf8f2', text: '#221c17', muted: '#6b6157', accent: '#5b3a24', accentText: '#fbf8f2', line: '#e2d8c9' },
  ochre: { background: '#fffaf0', surface: '#ffffff', text: '#2a2620', muted: '#77706a', accent: '#e8a33d', accentText: '#ffffff', line: '#efe6d6' },
  night: { background: '#14161a', surface: '#1d2026', text: '#f2f0ea', muted: '#a8a49a', accent: '#d9b25f', accentText: '#14161a', line: '#2c3038' },
};
// the classic styles, then every visual language (look:<id>) — each section on a ground of its own, so every tone is drawn
const PALS = ['roast', 'ochre', 'night'];
const LOOKS = V.LANGUAGES.map((l, i) => `look-${l.id}:${PALS[i % 3]}`);
const RUNS = (process.env.RUNS || ['editorial:roast,bold:roast,warm:roast,technical:roast,minimal:roast,editorial:ochre,bold:ochre,warm:night', ...LOOKS].join(',')).split(',').map((x) => x.split(':'));
const SAMPLE = V.normalizeBrief({ pageType: 'website', objective: 'A sample', personality: ['warm'], palette: [], typography: { display: 'Fraunces', body: 'Inter' } }, new Set());
let tokens;
const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));
await ctx.route('https://fonts.googleapis.com/**', (r) => r.fulfill({ contentType: 'text/css', body: '' }));
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const report = [];
let checked = 0;
for (const [style, pal] of RUNS) {
let look;
if (style.startsWith('look-')) {
  const d = V.buildDirection(V.languageOf(style.slice(5)), SAMPLE, { seed: 7, faithful: false });
  tokens = { ...d.tokens, colors: PALETTES[pal] };
  look = { ...d.look, accent2: d.look.accent2 ? '#3f7c85' : '' };
} else {
  tokens = { colors: PALETTES[pal], fonts: { display: 'Instrument Serif', body: 'Inter' }, scale: 'comfortable', radius: 'soft', style, imageTreatment: 'natural' };
  look = undefined;
}
let vi = 0;
for (const def of V.LIBRARY) {
  for (const variant of def.variants) {
    const tone = look ? V.TONES[vi++ % V.TONES.length] : undefined;
    const app = !def.pages.includes('website');
    const wantImgs = def.kind === 'gallery' ? 4 : def.images[1] > 0 ? 1 : 0;
    const sec = { id: 's', kind: def.kind, variant, content: contentFor(def), images: refs.slice(0, wantImgs).map((r) => r.id), tone };
    const raw = { title: 'Check', pageType: app ? 'app-screen' : 'website', platform: 'web', tokens, look, sections: app && def.kind !== 'app-nav' ? [{ id: 'nav', kind: 'app-nav', variant: 'topbar', content: { brand: 'Studio', items: ['Today', 'Classes', 'Profile'] }, images: [] }, sec] : [sec] };
    const spec = V.normalizeSpec(raw, { refs, seen: refs.map((r) => r.id), queries: [], palettes: [], type: [] });
    const tag = `${style}:${pal} ${def.kind}/${variant}`;
    if (!spec || !spec.sections.some((x) => x.kind === def.kind)) { report.push(`${tag}: did not survive normalisation`); continue; }
    const shown = spec.sections.find((x) => x.kind === def.kind).variant;
    const { html, css } = V.renderDesign(spec, refs);
    const doc = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${css}</style></head><body>${html}</body></html>`.replace(/loading="lazy"/g, '');
    for (const w of [1440, 390]) {
      errs.length = 0;
      await page.setViewportSize({ width: w, height: 900 });
      await page.setContent(doc, { waitUntil: 'networkidle' });
      const r = await page.evaluate((mobile) => {
        const lum = (c) => { const m = c.match(/[\d.]+/g); if (!m) return null; const [r, g, b, a = 1] = m.map(Number); if (a < 0.99) return null; const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
        const bgOf = (el) => { for (let n = el; n; n = n.parentElement) { const cs = getComputedStyle(n); if (cs.backgroundImage !== 'none' || n.tagName === 'IMG') return 'image'; const c = cs.backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m[3] === undefined || Number(m[3]) > 0.99)) return c; } return 'rgb(255,255,255)'; };
        const bad = [];
        const seen = new Set();
        for (const el of document.querySelectorAll('body *')) {
          const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 1);
          if (!own) continue;
          const rect = el.getBoundingClientRect();
          if (!rect.width || !rect.height) continue;
          const cs = getComputedStyle(el);
          if (cs.visibility === 'hidden' || Number(cs.opacity) < 0.5 || el.closest('.sr-only,.ph,[aria-hidden="true"]')) continue;
          let bg = bgOf(el);
          const bleed = el.closest('.hero-bleed');
          const ownBg = (() => { for (let n = el; n && n !== bleed; n = n.parentElement) { const c = getComputedStyle(n).backgroundColor; const m = c.match(/[\d.]+/g); if (m && (m[3] === undefined || Number(m[3]) > 0.99)) return c; } return null; })();
          if (bleed && ownBg) bg = ownBg;
          else if (bleed) {
            // worst case: the scrim over pure white, at the height where this text begins
            // every dark layer over the image, each read from its own computed gradient, at the y where this text begins
            const alphaAt = (bgImage, y0, h, y) => {
              const stops = [...bgImage.matchAll(/rgba\(0, 0, 0, ([\d.]+)\) ([\d.]+)(px|%)/g)].map((m) => [m[3] === '%' ? (Number(m[2]) / 100) * h : Number(m[2]), Number(m[1])]);
              if (!stops.length) return 0;
              const at = y - y0;
              if (at <= stops[0][0]) return stops[0][1];
              for (let i = 1; i < stops.length; i++) if (at <= stops[i][0]) return stops[i - 1][1] + ((at - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0] || 1)) * (stops[i][1] - stops[i - 1][1]);
              return stops.at(-1)[1];
            };
            const hr = bleed.getBoundingClientRect();
            const a1 = alphaAt(getComputedStyle(bleed.querySelector('.bleed-shade')).backgroundImage, hr.top, hr.height, rect.top);
            const wrap = bleed.querySelector('.wrap');
            const wr = wrap.getBoundingClientRect();
            const pb = getComputedStyle(wrap, '::before');
            const top = wr.top + parseFloat(pb.top || '0');
            const a2 = pb.content && pb.content !== 'none' ? alphaAt(pb.backgroundImage, top, wr.bottom - top, rect.top) : 0;
            const a = 1 - (1 - a1) * (1 - a2);
            const v = Math.round(255 * (1 - a));
            bg = `rgb(${v}, ${v}, ${v})`;
          } else if (bg === 'image') continue;
          const a = lum(cs.color), c = lum(bg);
          if (a == null || c == null) continue;
          const ratio = (Math.max(a, c) + 0.05) / (Math.min(a, c) + 0.05);
          const large = parseFloat(cs.fontSize) >= 24 || (parseFloat(cs.fontSize) >= 18.66 && Number(cs.fontWeight) >= 700);
          if (ratio < (large ? 3 : 4.5)) { const k = `${el.tagName.toLowerCase()} ${ratio.toFixed(2)}`; if (!seen.has(k)) { seen.add(k); bad.push(`contrast ${k}:1 “${el.textContent.trim().slice(0, 30)}”`); } }
        }
        if (mobile) {
          for (const el of document.querySelectorAll('a, button, input, select, textarea, summary, [role="button"]')) {
            const rect = el.getBoundingClientRect();
            if (!rect.width || !rect.height || getComputedStyle(el).visibility === 'hidden') continue;
            if (el.tagName === 'A' && el.closest('p, li p, .prose, .caption, .credits, .legal')) continue; // inline links in running text are exempt
            if (el.type === 'checkbox' || el.type === 'radio') { const lab = el.closest('label') || document.querySelector(`label[for="${el.id}"]`); const lr = lab ? lab.getBoundingClientRect() : rect; if (lr.height >= 44) continue; }
            const wrap = el.closest('label');
            if (wrap && wrap.getBoundingClientRect().height >= 43.5) continue;
            if (rect.height < 43.5) bad.push(`target ${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${Math.round(rect.width)}×${Math.round(rect.height)} “${(el.textContent || el.getAttribute('aria-label') || el.type || '').trim().slice(0, 24)}”`);
          }
        }
        const over = document.documentElement.scrollWidth > window.innerWidth + 1;
        if (over) bad.push(`overflow ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
        return bad;
      }, w === 390);
      checked++;
      const problems = [...new Set(r)].slice(0, 6);
      if (errs.length) problems.push('errors: ' + errs.join(' | ').slice(0, 120));
      if (problems.length) report.push(`${tag}${shown !== variant ? ` (drawn as ${shown})` : ''} @${w}: ${problems.join('; ')}`);
    }
  }
}
}
console.log(`checked ${checked} renders (${RUNS.length} style and palette runs) of ${V.LIBRARY.reduce((n, d) => n + d.variants.length, 0)} variants`);
console.log(report.length ? report.join('\n') : 'all clean');
await b.close();
