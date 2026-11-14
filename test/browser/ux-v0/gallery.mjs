// Every gallery count (1–8), grid and mosaic, at three widths: no image-sized hole, no overflow.
// Needs test/.tmp (node test/run.mjs builds it).
import { chromium, S, FX, ROOT, BASE, underTest } from './env.mjs';
// Every gallery count, both filled variants, three widths: is there a hole bigger than the gap?
import { readFileSync } from 'node:fs';
const V = await underTest();
const names = ['cafe-bar', 'pour', 'window', 'people', 'marble', 'ceramic', 'beans', 'grid'];
const refs = names.map((n) => ({ provider: 'openverse', providerId: n, id: `openverse:${n}`, url: `https://images.example.test/${n}.jpg`, thumb: `https://images.example.test/${n}.jpg`, width: 1600, height: 1067, title: n, creator: 'A', creatorUrl: '', sourceUrl: 'https://example.org/' + n, license: 'CC BY 2.0', licenseUrl: '', attribution: n, category: 'imagery', state: 'kept' }));
const b = await chromium.launch();
const ctx = await b.newContext();
await ctx.route('https://images.example.test/**', (r) => r.fulfill({ contentType: 'image/jpeg', body: readFileSync(FX + r.request().url().split('/').pop()) }));
const page = await ctx.newPage();
const bad = [];
let checked = 0;
for (const variant of ['grid', 'mosaic']) {
  for (let n = 1; n <= 8; n++) {
    const spec = { title: 'G', pageType: 'website', platform: 'web', tokens: { colors: { background: '#f6f1e9', surface: '#ffffff', text: '#222222', muted: '#555555', accent: '#5b3a24', accentText: '#ffffff', line: '#e2d9c8' }, fonts: { display: 'Fraunces', body: 'Inter' }, scale: 'comfortable', radius: 'soft', style: 'editorial', imageTreatment: 'natural' }, sections: [{ id: 'g', kind: 'gallery', variant, content: { title: 'Inside' }, images: refs.slice(0, n).map((r) => r.id) }] };
    const { html, css } = V.renderDesign(spec, refs);
    const doc = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>${css}</style></head><body>${html}</body></html>`;
    for (const w of [1440, 900, 390]) {
      await page.setViewportSize({ width: w, height: 900 });
      await page.setContent(doc.replace(/loading="lazy"/g, ''), { waitUntil: 'networkidle' });
      const r = await page.evaluate(() => {
        const g = document.querySelector('.gallery');
        if (!g) return { err: 'no gallery' };
        const gr = g.getBoundingClientRect();
        const items = [...g.querySelectorAll('.g-item')].map((x) => x.getBoundingClientRect());
        const gap = parseFloat(getComputedStyle(g).rowGap) || 14;
        let worst = 0;
        for (let y = gr.top + 2; y < gr.bottom - 2; y += 8) for (let x = gr.left + 2; x < gr.right - 2; x += 8) {
          const d = Math.min(...items.map((b) => Math.hypot(Math.max(b.left - x, 0, x - b.right), Math.max(b.top - y, 0, y - b.bottom))));
          worst = Math.max(worst, d);
        }
        const overflow = items.some((b) => b.right > gr.right + 1 || b.left < gr.left - 1);
        return { worst: Math.round(worst), gap, overflow, h: Math.round(gr.height), cols: getComputedStyle(g).gridTemplateColumns.split(' ').length };
      });
      checked++;
      if (r.err || r.overflow || r.worst > r.gap) bad.push(`${variant} n=${n} w=${w}: ${JSON.stringify(r)}`);
      if (variant === 'mosaic' && n === 4 && w === 1440) await page.screenshot({ path: S + 'gal-mosaic-4.png', fullPage: true });
      if (variant === 'grid' && n === 5 && w === 1440) await page.screenshot({ path: S + 'gal-grid-5.png', fullPage: true });
    }
  }
}
console.log('checked', checked, 'layouts;', bad.length ? 'HOLES:\n' + bad.join('\n') : 'no holes, no overflow');
await b.close();
