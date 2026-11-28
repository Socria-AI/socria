// lib/ux-v0/design/guidelines.ts — brand guidelines written from a design system: its own values, and only those.
//
// Guidelines that are generated tend to be advice ("give the logo room to breathe"). These are not advice: every
// page is a statement of what the system holds — its colours with their names, values and measured contrast; its
// typefaces set as specimens; its approved logos placed as themselves; its rules, each with where it came from and
// how firmly it holds; where everything was imported from. A page whose subject the system does not have is not
// written (no logo, no logo page — it says so on the cover instead). Nothing here is asked of a model.
//
// THEY ARE OF A VERSION. Guidelines are written from a published version and say which on every page; when a newer
// one is published the project says so and they are brought up to date by the person, as a new version of the
// project (what was there stays in its history). A preview from a draft is marked DRAFT — NOT APPROVED on every
// page, and can never be mistaken for the brand.
//
// They are ordinary artboards: each page can be edited by hand, redesigned in words, approved and locked like any
// other. They are set in the system's own faces and colours — the document belongs to the brand it describes.

import { assetHref } from '../dsi/assets';
import { hexOf, parseColour } from '../dsi/colour';
import { bindingRules } from '../dsi/intelligence';
import { designCss } from '../dsi/link';
import { publishedContent, type SystemRecord } from '../dsi/registry';
import { ROLE_LABEL, type ProductRole, type SystemContent } from '../dsi/schema';
import { resolveAll } from '../dsi/tokens';
import { graphicFont } from '../fonts';
import { luminance, ratioOf } from './contrast';
import type { DesignArtboard, DesignAsset, DesignDoc } from './doc';
import { prepareFragment, type Parse } from './elements';

export interface GuidelinesOf {
  systemId: string;
  /** the published version they were written from (0: a draft preview) */
  version: number;
  at: number;
}

const W = 1920;
const H = 1080;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const lum = (hex: string) => luminance(parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16));
const contrast = (a: string, b: string) => Math.round(ratioOf(lum(a), lum(b)) * 10) / 10;
const reads = (r: number) => (r >= 7 ? 'AAA for text' : r >= 4.5 ? 'AA for text' : r >= 3 ? 'large text only' : 'not for text');
const day = (at: number) => new Date(at).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

export type GuidelinesResult = { ok: true; doc: DesignDoc; of: GuidelinesOf; assets: DesignAsset[]; notes: string[] } | { ok: false; error: string };

/** The pages (see the head of this file). `version`: a published version's number, 'latest', or 'draft' for a marked preview. */
export function guidelinesDoc(rec: SystemRecord, o: { version?: number | 'latest' | 'draft'; parse: Parse; now?: number }): GuidelinesResult {
  const now = o.now ?? Date.now();
  const draft = o.version === 'draft';
  const n: number = draft ? 0 : typeof o.version === 'number' ? o.version : rec.published;
  const c: SystemContent | null = draft ? rec.draft : publishedContent(rec, n || 'latest');
  if (!c || (!draft && !n)) return { ok: false, error: `${rec.name} has no published version. Guidelines are written from what is approved: publish it first, or make a preview from the draft (every page of it is marked as a draft).` };
  const notes: string[] = [];
  const resolved = resolveAll(c, { mode: c.modes[0] ?? 'light' });
  const colourOf = (path: string | undefined) => (path ? hexOf(resolved.get(path)?.value) : null);
  const role = (r: ProductRole) => colourOf(c.roles[r]?.path);
  // (a colour with an alpha is not the colour of its hex: it is shown as it lands on the ground, and said to be see-through)
  const colours = [...resolved.values()]
    .filter((r) => r.ok && r.type === 'color')
    .map((r) => ({ path: r.path, hex: hexOf(r.value), alpha: Math.round((parseColour(r.value)?.a ?? 1) * 100) / 100 }))
    .filter((x): x is { path: string; hex: string; alpha: number } => !!x.hex && x.alpha > 0);
  const paper = role('background') ?? '#ffffff';
  const ink = role('text') ?? (lum(paper) > 0.4 ? '#111111' : '#f5f5f5');
  const accent = role('accent') ?? ink;
  const faceOf = (path: string | undefined) => {
    const v = path ? resolved.get(path)?.value : null;
    const first = (Array.isArray(v) ? String(v[0] ?? '') : String(v ?? '')).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    return first && !/^(serif|sans-serif|monospace|system-ui|inherit|undefined|null)$/i.test(first) ? first : null;
  };
  const faces = [...new Set([faceOf(c.roles.display?.path), faceOf(c.roles.body?.path), ...[...resolved.values()].filter((r) => r.ok && r.type === 'fontFamily').map((r) => faceOf(r.path))].filter((x): x is string => !!x))].slice(0, 4);
  const display = faces[0] ?? null;
  const body = faceOf(c.roles.body?.path) ?? faces[1] ?? display;
  const stack = (f: string | null, fallback: string) => (f ? `'${f.replace(/'/g, '')}', ${graphicFont(f)?.kind === 'serif' ? 'serif' : graphicFont(f)?.kind === 'mono' ? 'monospace' : fallback}` : fallback);
  const stamp = draft ? 'DRAFT — NOT APPROVED' : `Version ${n} · published ${day(rec.versions.find((v) => v.n === n)?.at ?? now)}`;
  const foot = `<footer class="gl-foot"><span>${esc(c.identity.name || rec.name)} — brand guidelines</span><span class="${draft ? 'gl-draft' : ''}">${esc(stamp)}</span></footer>`;
  const base = `.sx-root{background:${paper};color:${ink};font-family:${stack(body, 'sans-serif')};font-size:26px;line-height:1.45}
.gl{position:absolute;inset:96px 120px 120px}
.gl h1{margin:0 0 12px;font:400 104px/1.02 ${stack(display, 'serif')};letter-spacing:-0.01em}
.gl h2{margin:0 0 40px;font:400 72px/1.05 ${stack(display, 'serif')}}
.gl p{margin:0 0 14px;max-width:1100px}
.gl-kicker{font-size:20px;letter-spacing:.14em;text-transform:uppercase;opacity:.6;margin:0 0 28px}
.gl-foot{position:absolute;left:120px;right:120px;bottom:48px;display:flex;justify-content:space-between;font-size:18px;opacity:.7;border-top:1px solid currentColor;padding-top:14px}
.gl-draft{color:#c0392b;font-weight:700;opacity:1;letter-spacing:.06em}
.gl-small{font-size:20px;opacity:.72}`;
  const page = (id: string, name: string, css: string, inner: string): DesignArtboard => ({
    id: `gl-${id}`,
    name,
    format: 'presentation',
    width: W,
    height: H,
    medium: 'screen',
    group: 'guidelines',
    x: 0,
    y: 0,
    html: prepareFragment(`<style>${base}\n${css}</style><div class="gl">${inner}</div>${foot}`, o.parse),
  });
  const pages: DesignArtboard[] = [];
  const assets: DesignAsset[] = [];

  // ── cover ──
  const logos = c.assets.filter((a) => a.kind === 'logo' && a.approved && !a.lowRes && !!assetHref(a));
  const { hard, soft } = bindingRules(c);
  const has = [colours.length ? 'colour' : '', faces.length ? 'typography' : '', logos.length ? 'the logo' : '', hard.length + soft.length ? 'rules' : ''].filter(Boolean);
  const lacks = [!colours.length ? 'colours' : '', !faces.length ? 'typefaces' : '', !logos.length ? 'an approved logo' : '', !(hard.length + soft.length) ? 'stated rules' : ''].filter(Boolean);
  pages.push(
    page(
      'cover',
      'Cover',
      `.gl-cover{position:absolute;left:0;bottom:0;right:0}.gl-cover h1{font-size:168px}.gl-bar{position:absolute;left:0;top:0;width:240px;height:18px;background:${accent}}`,
      `<div class="gl-bar"></div><div class="gl-cover"><p class="gl-kicker">Brand guidelines</p><h1>${esc(c.identity.name || rec.name)}</h1>${c.identity.description ? `<p>${esc(c.identity.description.slice(0, 320))}</p>` : ''}<p class="gl-small">What this system holds: ${esc(has.join(', ') || 'nothing yet')}.${lacks.length ? ` It does not hold ${esc(lacks.join(', '))}; nothing is written here about what it does not hold.` : ''}</p></div>`
    )
  );

  // ── colour ──
  if (colours.length) {
    const named: { label: string; path: string; hex: string; alpha: number }[] = [];
    for (const r of ['background', 'surface', 'text', 'muted', 'accent', 'accent2', 'line'] as ProductRole[]) {
      const path = c.roles[r]?.path;
      const found = colours.find((x) => x.path === path);
      if (path && found && !named.some((x) => x.path === path)) named.push({ label: ROLE_LABEL[r] ?? r, ...found });
    }
    const others = colours.filter((x) => !named.some((y) => y.path === x.path));
    // (two rows fit under the roles; what does not fit is counted, not squeezed in)
    const rest = others.slice(0, 16);
    const mix = (hex: string, a: number) => (a >= 1 ? hex : `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * a + parseInt(paper.slice(i, i + 2), 16) * (1 - a)).toString(16).padStart(2, '0')).join('')}`);
    const sw = (x: { label?: string; path: string; hex: string; alpha: number }, big: boolean) => {
      const seen = mix(x.hex, x.alpha);
      const onPaper = contrast(seen, paper);
      const onInk = contrast(seen, ink);
      const fg = lum(seen) > 0.4 ? '#111111' : '#ffffff';
      const value = `${x.hex.toUpperCase()}${x.alpha < 1 ? ` at ${Math.round(x.alpha * 100)}%` : ''}`;
      return `<div class="gl-sw${big ? ' is-big' : ''}"><div class="gl-chip" style="background:${seen};color:${fg}">${big ? esc(value) : ''}</div><div class="gl-cap"><strong>${esc(x.label ?? x.path)}</strong>${big ? `<span>${esc(x.path)}</span><span>${onPaper}:1 on the ground (${reads(onPaper)}) · ${onInk}:1 on the text colour</span>` : `<span>${esc(value)}</span>`}</div></div>`;
    };
    pages.push(
      page(
        'colour',
        'Colour',
        `.gl h2{margin-bottom:28px}
.gl-roles{display:grid;grid-template-columns:repeat(${Math.min(4, Math.max(2, named.length))},1fr);gap:24px;margin-bottom:28px}
.gl-rest{display:grid;grid-template-columns:repeat(8,1fr);gap:16px}
.gl-chip{height:${named.length > 4 ? 110 : 170}px;border-radius:6px;display:flex;align-items:flex-end;padding:14px;font-size:20px;box-shadow:inset 0 0 0 1px rgba(128,128,128,.25)}
.gl-sw:not(.is-big) .gl-chip{height:72px}
.gl-cap{display:flex;flex-direction:column;font-size:17px;line-height:1.35;margin-top:8px}.gl-cap strong{font-size:20px}.gl-cap span{opacity:.72}
.gl-sw:not(.is-big) .gl-cap strong{font-size:15px;font-weight:400;overflow-wrap:anywhere}`,
        `<p class="gl-kicker">Colour</p><h2>${named.length ? 'What each colour is for' : 'The palette'}</h2>${named.length ? `<div class="gl-roles">${named.slice(0, named.length > 4 ? 8 : 4).map((x) => sw(x, true)).join('')}</div>` : ''}${rest.length ? `<div class="gl-rest">${rest.map((x) => sw(x, false)).join('')}</div>` : ''}<p class="gl-small" style="margin-top:22px">Contrast is measured (WCAG) between each colour and the system’s ground and text colours. A see-through colour is shown as it lands on the ground.${others.length > rest.length ? ` ${others.length - rest.length} more colour${others.length - rest.length === 1 ? ' is' : 's are'} in the system and not shown here.` : ''}</p>`
      )
    );
  }

  // ── typography ──
  if (faces.length) {
    const weights = [...resolved.values()].filter((r) => r.ok && r.type === 'fontWeight').map((r) => String(r.value)).slice(0, 6);
    const spec = faces
      .map((f, i) => {
        const served = graphicFont(f);
        const what = i === 0 && f === display ? 'Display' : f === body ? 'Text' : 'Also';
        return `<div class="gl-face"><p class="gl-kicker">${what} · ${esc(f)}</p><div class="gl-aa" style="font-family:${stack(f, 'sans-serif')}">${esc(c.identity.name || rec.name)}</div><div class="gl-abc" style="font-family:${stack(f, 'sans-serif')}">ABCDEFGHIJKLMNOPQRSTUVWXYZ<br>abcdefghijklmnopqrstuvwxyz 0123456789</div><p class="gl-small">${served ? `Drawn here in ${esc(served.name)} itself.` : `${esc(f)} is not a face SocriaUX can draw: unless this computer has it, what you see here is a fallback, not ${esc(f)}. Add its font file to the company’s library to see it everywhere.`}</p></div>`;
      })
      .join('');
    pages.push(
      page(
        'type',
        'Typography',
        `.gl-faces{display:grid;grid-template-columns:repeat(${Math.min(2, faces.length)},1fr);gap:56px 72px}
.gl-aa{font-size:${faces.length > 2 ? 92 : 132}px;line-height:1;margin-bottom:18px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gl-abc{font-size:${faces.length > 2 ? 24 : 30}px;line-height:1.4;margin-bottom:14px;overflow-wrap:anywhere}`,
        `<p class="gl-kicker">Typography</p><div class="gl-faces">${spec}</div>${weights.length ? `<p class="gl-small">Weights the system names: ${esc([...new Set(weights)].join(', '))}.</p>` : ''}`
      )
    );
  }

  // ── the logo ──
  if (logos.length) {
    const min = [...hard, ...soft].map((i) => i.check).find((k): k is { kind: 'logo-min-size'; px: number } => k?.kind === 'logo-min-size');
    const said = [...hard, ...soft].filter((i) => i.kind === 'logo').slice(0, 5);
    const some = logos.slice(0, 3);
    const groundH = some.length > 1 ? 380 : 420;
    const shown = some.map((a) => {
      const id = `lib-${a.hash.slice(0, 12)}`;
      if (!assets.some((x) => x.id === id)) assets.push({ id, name: a.name, src: assetHref(a)!, width: a.width ?? 1000, height: a.height ?? 1000, note: `${rec.name}'s approved logo: placed as it is` });
      // (each on the ground it was approved for: a reversed logo on the text colour, any other on the system's ground —
      // it is not tried on a ground nobody approved it for)
      const reversed = a.role === 'reversed';
      return `<figure class="gl-logo"><div class="gl-ground" style="background:${reversed ? ink : paper}"><img src="asset:${id}" alt="${esc(a.name)}"></div><figcaption><strong>${esc(a.name)}</strong>${a.role ? ` · ${esc(a.role)}` : ''} · ${a.vector ? 'vector' : `${a.width ?? '?'} × ${a.height ?? '?'} px`} · approved · shown on the ${reversed ? 'text colour' : 'ground'}</figcaption></figure>`;
    });
    const hasReversed = some.some((a) => a.role === 'reversed');
    pages.push(
      page(
        'logo',
        'Logo',
        `.gl-logos{display:grid;grid-template-columns:repeat(${Math.min(3, shown.length)},1fr);gap:40px}
.gl h2{margin-bottom:28px}
.gl-logo{margin:0}.gl-ground{height:${groundH}px;display:flex;align-items:center;justify-content:center;border-radius:6px;box-shadow:inset 0 0 0 1px rgba(128,128,128,.25);margin-bottom:12px;overflow:hidden}
.gl-ground img{display:block;width:auto;height:auto;max-width:70%;max-height:${Math.round(groundH * 0.72)}px}
.gl-logo figcaption{font-size:18px;opacity:.8}
.gl-list{margin:28px 0 0;padding:0;list-style:none}.gl-list li{padding:8px 0;border-top:1px solid rgba(128,128,128,.3);font-size:22px}`,
        `<p class="gl-kicker">Logo</p><h2>As approved</h2><div class="gl-logos">${shown.join('')}</div>${min || said.length ? `<ul class="gl-list">${min ? `<li>Never drawn smaller than ${min.px} px on its shorter side.</li>` : ''}${said.slice(0, 3).map((i) => `<li>${esc(i.statement)}</li>`).join('')}</ul>` : `<p class="gl-small" style="margin-top:22px">The system states no rule about the logo’s size or space${hasReversed ? '' : ', and holds no version for dark grounds'}. SocriaUX places it only as it is: never redrawn, recoloured, cropped, stretched or tilted.</p>`}`
      )
    );
  }

  // ── rules ──
  if (hard.length + soft.length) {
    const li = (i: (typeof hard)[number]) => `<li><span>${esc(i.statement)}</span><em>${esc(i.evidence[0]?.source.ref ? `from ${i.evidence[0].source.ref}${i.evidence[0].source.page ? `, p. ${i.evidence[0].source.page}` : ''}` : i.status === 'approved' ? 'approved by the owner' : 'stated by the owner')}</em></li>`;
    pages.push(
      page(
        'rules',
        'Rules',
        `.gl-cols{display:grid;grid-template-columns:1fr 1fr;gap:72px}.gl-cols h3{margin:0 0 14px;font:600 24px/1.2 inherit;letter-spacing:.04em;text-transform:uppercase}
.gl-rules{margin:0;padding:0;list-style:none}.gl-rules li{padding:12px 0;border-top:1px solid rgba(128,128,128,.3);display:flex;flex-direction:column;gap:2px;font-size:23px;line-height:1.35}.gl-rules em{font-style:normal;font-size:17px;opacity:.65}`,
        `<p class="gl-kicker">Rules</p><div class="gl-cols"><div><h3>Requirements</h3>${hard.length ? `<ul class="gl-rules">${hard.slice(0, 7).map(li).join('')}</ul>` : '<p class="gl-small">The system states none. Nothing below is a requirement.</p>'}</div><div><h3>Principles</h3>${soft.length ? `<ul class="gl-rules">${soft.slice(0, 7).map(li).join('')}</ul>` : '<p class="gl-small">The system states none.</p>'}</div></div>`
      )
    );
  }

  // ── where it comes from ──
  pages.push(
    page(
      'sources',
      'Sources',
      `.gl-src{margin:0;padding:0;list-style:none;max-width:1300px}.gl-src li{padding:12px 0;border-top:1px solid rgba(128,128,128,.3);display:flex;justify-content:space-between;gap:24px;font-size:22px}.gl-src em{font-style:normal;opacity:.65;white-space:nowrap}`,
      `<p class="gl-kicker">Sources</p><h2>Where this comes from</h2>${rec.sources.length ? `<ul class="gl-src">${rec.sources.slice(-8).map((s) => `<li><span>${esc(s.ref.slice(0, 90))}</span><em>${esc(s.kind)} · ${s.counts.tokens} values · ${day(s.at)}</em></li>`).join('')}</ul>` : '<p>Its values were entered by hand in SocriaUX.</p>'}<p class="gl-small" style="margin-top:28px">${draft ? 'This is a preview of a draft. It is not the brand until the draft is published.' : `Written by SocriaUX from ${esc(rec.name)} version ${n}: ${Object.keys(c.tokens).length} values, ${c.assets.length} assets, ${hard.length + soft.length} rules. Every value on these pages is the system’s own; nothing was added.`}</p>`
    )
  );

  // side by side, in order
  pages.forEach((p, i) => {
    p.x = i * (W + 120);
  });
  const unserved = faces.filter((f) => !graphicFont(f));
  if (unserved.length) notes.push(`${unserved.join(', ')} ${unserved.length === 1 ? 'is' : 'are'} not in SocriaUX’s font library: the typography page says so, and shows a fallback.`);
  if (!logos.length) notes.push('The system has no approved logo: no logo page was written.');
  return { ok: true, doc: { artboards: pages, tokens: designCss(c) }, of: { systemId: rec.id, version: n, at: now }, assets, notes };
}

/**
 * Guidelines brought up to date with pages written from a newer version: each written page replaces the one before
 * it (where it sits on the canvas is kept), new pages are added, and pages the person approved or locked are left
 * exactly as they are and named. Pages the person added themselves are not touched. It is one new version of the
 * project: what was there stays in its history.
 */
export function refreshGuidelines<S extends { doc: DesignDoc; assets: DesignAsset[] }>(s: S, fresh: { doc: DesignDoc; assets: DesignAsset[] }): { doc: DesignDoc; assets: DesignAsset[]; replaced: string[]; kept: string[]; added: string[]; tokensHeld: boolean } {
  const replaced: string[] = [];
  const kept: string[] = [];
  const added: string[] = [];
  const now = new Map(fresh.doc.artboards.map((a) => [a.id, a]));
  const artboards = s.doc.artboards.map((a) => {
    const f = now.get(a.id);
    if (!f) return a;
    now.delete(a.id);
    if (a.locked) {
      kept.push(a.name);
      return a;
    }
    if (f.html === a.html) return a;
    replaced.push(a.name);
    return { ...a, html: f.html, name: f.name };
  });
  let x = Math.max(0, ...artboards.map((a) => a.x + a.width)) + 120;
  for (const f of now.values()) {
    artboards.push({ ...f, x, y: 0 });
    x += f.width + 120;
    added.push(f.name);
  }
  // the shared styles move with the version only when no approved page would change under them
  const tokensHeld = kept.length > 0 && fresh.doc.tokens !== s.doc.tokens;
  const assets = [...s.assets, ...fresh.assets.filter((a) => !s.assets.some((b) => b.id === a.id))];
  return { doc: { artboards, tokens: tokensHeld ? s.doc.tokens : fresh.doc.tokens }, assets, replaced, kept, added, tokensHeld };
}
