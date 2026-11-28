// test/browser/ux-v0/convergence/analyse.mjs — what a set of first designs actually used, read from their HTML.
//
// For each design-bench output folder given (label=folder), every project-V-*.json is read (the design as the
// workspace stored it, after its look pass) and measured from the code the designer wrote:
//   - the faces it asks for, and which of them the frame really loaded — by the loader as it was before this change
//     (faces in custom properties and `font-family:"X"` with no space were never loaded; fallback names could use up
//     the twelve slots) and as it is now (lib/ux-v0/design/frame.ts facesFor) — so a face drawn in a fallback is seen
//   - the kind of each face (serif, sans, mono), the display face (the one set largest) and its kind
//   - habits: letter-spaced uppercase labels, hairline rules, a mono face for small print
// Pictures are measured separately (pictures.py: ground colour, layout similarity). Writes <out>/designs.json.
//
//   node test/browser/ux-v0/convergence/analyse.mjs <out-dir> before-s1=<dir> before-s2=<dir> after-s1=<dir> …

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../env.mjs';
import { buildOnly } from '../../../helpers/build.mjs';

await buildOnly(['design-under-test']);
const T = await import(pathToFileURL(join(ROOT, 'test/.tmp/design-under-test.mjs')).href);
const { elements: E, frame: FR, fonts } = T;

const [out, ...sets] = process.argv.slice(2);
if (!out || !sets.length) {
  console.error('usage: analyse.mjs <out-dir> label=<design-bench dir> …');
  process.exit(1);
}

// The loader before this change: the frozen baseline's own build (BEFORE_TREE, a checkout of the commit before it,
// with test/.tmp built), so what it would have drawn is read from its real code, not a copy of it.
const OLD = process.env.BEFORE_TREE ? await import(pathToFileURL(join(process.env.BEFORE_TREE, 'test/.tmp/design-under-test.mjs')).href) : null;
const oldLoaded = (a, tokens) => new Set(OLD ? OLD.frame.facesFor(a, tokens).faces : []);

const face = (n) => fonts.graphicFont(n)?.name ?? null;
const kindOf = (n) => {
  const f = fonts.graphicFont(n);
  return f ? `${f.kind}${f.displayOnly ? '-display' : ''}` : 'unknown';
};

/** Rules of the artboard's styles (and the shared tokens): selector → declarations, custom properties resolved. */
function rules(html, tokens) {
  const css = [tokens, ...[...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1])].join('\n');
  const vars = new Map();
  for (const m of css.matchAll(/(--[\w-]+)\s*:\s*([^;}]+)/g)) vars.set(m[1], m[2].trim());
  const resolve = (v, d = 0) => (d > 4 ? v : v.replace(/var\((--[\w-]+)(?:\s*,\s*([^)]+))?\)/g, (_, k, fb) => resolve(vars.get(k) ?? fb ?? '', d + 1)));
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const decl = {};
    for (const d of m[2].split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decl[d.slice(0, i).trim().toLowerCase()] = resolve(d.slice(i + 1).trim());
    }
    out.push({ sel: m[1].trim(), decl });
  }
  // SVG text sets its face and size in attributes
  for (const m of html.matchAll(/<(?:text|tspan|g)\b([^>]*)>/gi)) {
    const fam = m[1].match(/font-family\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    const sz = m[1].match(/font-size\s*=\s*["']?([\d.]+)/i);
    if (fam || sz) out.push({ sel: '[svg]', decl: { ...(fam ? { 'font-family': resolve((fam[1] ?? fam[2]).replace(/&quot;/g, '"')) } : {}), ...(sz ? { 'font-size': `${sz[1]}px` } : {}) } });
  }
  // inline styles count too (a model often sizes the headline inline)
  for (const m of html.matchAll(/style="([^"]*)"/gi)) {
    const decl = {};
    for (const d of m[1].replace(/&quot;/g, '"').split(';')) {
      const i = d.indexOf(':');
      if (i > 0) decl[d.slice(0, i).trim().toLowerCase()] = resolve(d.slice(i + 1).trim());
    }
    out.push({ sel: '[inline]', decl });
  }
  return out;
}

const px = (v) => {
  const m = String(v ?? '').match(/(-?[\d.]+)(px|em|rem)?/);
  if (!m) return null;
  return m[2] === 'em' || m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
};
const firstFace = (v) => (v ?? '').split(',').map((x) => x.trim().replace(/^['"]|['"]$/g, '')).find((x) => x && !/^(serif|sans-serif|monospace|var\()/i.test(x)) ?? null;
const shorthandFace = (v) => {
  const m = String(v ?? '').match(/(?:\d+(?:px|pt|em|rem|%)\S*)\s+(.+)$/);
  return m ? firstFace(m[1]) : null;
};

const designs = [];
for (const s of sets) {
  const [label, dir] = s.split('=');
  for (const f of readdirSync(dir).filter((x) => /^project-V-.+\.json$/.test(x)).sort()) {
    const brief = f.replace(/^project-|\.json$/g, '');
    const p = JSON.parse(readFileSync(join(dir, f), 'utf8'));
    const doc = p.design.doc;
    const a = doc.artboards[0];
    const named = E.facesNamed(a.html, doc.tokens);
    const library = [...new Set(named.map((n) => face(n)).filter(Boolean))];
    const oldSet = oldLoaded(a, doc.tokens);
    const newLoaded = new Set(FR.facesFor(a, doc.tokens).faces);
    const rs = rules(a.html, doc.tokens);
    // the face set largest: the display face
    let display = null;
    let size = 0;
    const used = new Set();
    let monoSmall = false;
    // a rule that sizes text without naming a face inherits the root's (set on :root / .sx-root / body)
    const rootRule = rs.find((r) => /(^|,)\s*(:root|\.sx-root|body|html|\*)\s*$/.test(r.sel) && (r.decl['font-family'] || r.decl.font));
    const rootFam = rootRule ? firstFace(rootRule.decl['font-family']) ?? shorthandFace(rootRule.decl.font) : null;
    for (const r of rs) {
      const fam = firstFace(r.decl['font-family']) ?? shorthandFace(r.decl.font) ?? (r.sel !== '[svg]' ? rootFam : null);
      const sz = px(r.decl['font-size']) ?? px(String(r.decl.font ?? '').match(/(\d[\d.]*(?:px|em|rem))/)?.[1]);
      if (fam) used.add(face(fam) ?? fam);
      if (fam && sz && sz > size) (size = sz), (display = face(fam) ?? fam);
      if (fam && kindOf(fam).startsWith('mono') && sz && sz <= 20) monoSmall = true;
    }
    // small tracked labels: letter-spaced (≥ 0.08em, or ≥ 2px) at a small size (≤ 22px), whether the capitals are
    // typed or made by text-transform — the label habit either way
    const tracked = (r) => {
      const ls = String(r.decl['letter-spacing'] ?? '');
      if (!ls) return false;
      if (/em/.test(ls)) return Number(ls.match(/-?[\d.]+/)?.[0]) >= 0.08;
      const v = px(ls);
      return v !== null && v >= 2;
    };
    const small = (r) => {
      const sz = px(r.decl['font-size']) ?? px(String(r.decl.font ?? '').match(/(\d[\d.]*(?:px|em|rem))/)?.[1]);
      return sz === null || sz <= 22;
    };
    const labels = rs.filter((r) => tracked(r) && small(r)).length + [...a.html.matchAll(/<(?:text|tspan)\b[^>]*letter-spacing\s*=\s*["']?([\d.]+)[^>]*font-size\s*=\s*["']?([\d.]+)/gi)].filter((m) => Number(m[1]) >= 2 && Number(m[2]) <= 22).length;
    const hairlines = rs.filter((r) => Object.entries(r.decl).some(([k, v]) => (/^border(-top|-bottom|-left|-right)?$/.test(k) && /\b(0\.5|1|1\.5)px\b/.test(v)) || ((k === 'height' || k === 'width') && /^(0\.5|1|1\.5)px$/.test(v.trim())))).length;
    const unserved = FR.unservedFaces(a, doc.tokens);
    designs.push({
      set: label,
      condition: label.split('-')[0],
      seed: label.split('-')[1] ?? '',
      brief,
      format: a.format,
      faces: library,
      kinds: library.map(kindOf),
      display,
      displayKind: display ? kindOf(display) : null,
      unserved,
      notLoadedBefore: OLD ? library.filter((n) => !oldSet.has(n)) : [],
      notLoadedNow: library.filter((n) => !newLoaded.has(n)),
      labels,
      hairlines,
      monoSmall,
      said: p.design.turns.find((t) => t.role === 'socria')?.text ?? '',
      looked: p.design.turns.filter((t) => t.role === 'socria').length > 1,
    });
  }
}
writeFileSync(join(out, 'designs.json'), JSON.stringify(designs, null, 1));

// ── the tally, per condition ──
const by = (c) => designs.filter((d) => d.condition === c);
const tally = (list) => {
  const faceCount = new Map();
  for (const d of list) for (const f of d.faces) faceCount.set(f, (faceCount.get(f) ?? 0) + 1);
  const top = [...faceCount].sort((a, b) => b[1] - a[1]);
  const kinds = { serif: 0, sans: 0, mono: 0 };
  for (const d of list) for (const k of d.kinds) kinds[k.split('-')[0]] = (kinds[k.split('-')[0]] ?? 0) + 1;
  const displayKinds = {};
  for (const d of list) if (d.displayKind) displayKinds[d.displayKind.split('-')[0]] = (displayKinds[d.displayKind.split('-')[0]] ?? 0) + 1;
  return {
    designs: list.length,
    distinctFaces: faceCount.size,
    topFaces: top.slice(0, 8).map(([f, n]) => `${f} ×${n}`),
    mostCommonShare: top.length ? +(top[0][1] / list.length).toFixed(2) : 0,
    kinds,
    displayKinds,
    withSmallTrackedLabels: list.filter((d) => d.labels > 0).length,
    withHairlines: list.filter((d) => d.hairlines > 0).length,
    monoForSmallPrint: list.filter((d) => d.monoSmall).length,
    facesNotLoadedByOldLoader: list.reduce((n, d) => n + d.notLoadedBefore.length, 0),
    designsHitByOldLoader: list.filter((d) => d.notLoadedBefore.length).map((d) => `${d.set}/${d.brief}: ${d.notLoadedBefore.join(', ')}`),
    facesNotLoadedNow: list.reduce((n, d) => n + d.notLoadedNow.length, 0),
    unservedFaces: list.flatMap((d) => d.unserved.map((u) => `${d.set}/${d.brief}: ${u}`)),
  };
};
const conditions = [...new Set(designs.map((d) => d.condition))];
const summary = Object.fromEntries(conditions.map((c) => [c, tally(by(c))]));
writeFileSync(join(out, 'fonts-summary.json'), JSON.stringify(summary, null, 1));
console.log(JSON.stringify(summary, null, 1));
for (const d of designs) console.log(`${d.set.padEnd(10)} ${d.brief.padEnd(16)} ${d.faces.join(' + ').padEnd(48)} display ${d.display ?? '—'} (${d.displayKind ?? '—'})  caps ${d.labels} rules ${d.hairlines}${d.notLoadedBefore.length ? `  [old loader missed: ${d.notLoadedBefore.join(', ')}]` : ''}${d.unserved.length ? `  [not in library: ${d.unserved.join(', ')}]` : ''}`);
