// lib/ux-v0/dsi/exporters.ts — a design system written out: as SocriaUX's own lossless JSON, as W3C DTCG tokens (one
// file, modes carried in $extensions, plus one file per mode), as Style Dictionary tokens, as CSS custom properties
// (themes as [data-theme] blocks and prefers-color-scheme), as SCSS variables, and as a guideline summary (Markdown and a
// printable HTML page). References stay references in every token format (var(--x) in CSS). Each format is read back
// by SocriaUX's importers to the same tokens (the round-trip tests hold this). Figma is not written to: exporting to a
// Figma library is not implemented.

import { contrastRatio } from '../../ux/audit';
import { colourCategory, topCategory } from './classify';
import { dtcgColour, hexOf } from './colour';
import { bindingRules, visualLanguageOf } from './intelligence';
import { productPalette } from './adapters';
import { cssVarName, dimensionText, isAlias, pathFromCssName, refsIn, resolveToken } from './tokens';
import { PRODUCT_ROLES, ROLE_LABEL, type SystemContent, type Token, type TokenValue } from './schema';
import type { SystemRecord } from './registry';

export const SOCRIAUX_SCHEMA = 'https://socriaux.app/schema/design-system/1';

export interface ExportFile {
  name: string;
  mime: string;
  text: string;
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'design-system';

/** SocriaUX's own format: the whole content, provenance and all (reads back exactly). */
export function exportCanonical(c: SystemContent, rec?: Pick<SystemRecord, 'id' | 'published'>): ExportFile {
  return { name: `${slug(c.identity.name)}.socriaux.json`, mime: 'application/json', text: JSON.stringify({ $schema: SOCRIAUX_SCHEMA, ...(rec ? { id: rec.id, version: rec.published } : {}), exportedAt: new Date().toISOString(), system: c }, null, 2) };
}

const setPath = (root: Record<string, any>, path: string, leaf: Record<string, unknown>) => {
  const segs = path.split('.');
  let cur = root;
  for (const s of segs.slice(0, -1)) {
    if (!cur[s] || typeof cur[s] !== 'object' || '$value' in cur[s] || 'value' in cur[s]) cur[s] = { ...(cur[s] && !('$value' in cur[s]) && !('value' in cur[s]) ? cur[s] : {}) };
    cur = cur[s];
  }
  cur[segs[segs.length - 1]] = leaf;
};

/** A value in DTCG 2025 form: colours as colour objects (or hex), dimensions and durations as { value, unit }. */
function dtcgValue(t: Token, v: TokenValue, colours: 'object' | 'hex'): unknown {
  if (isAlias(v) || (typeof v === 'string' && refsIn(v).length)) return v;
  if (t.type === 'color' && colours === 'object') return dtcgColour(v) ?? v;
  if (t.type === 'dimension') {
    const d = dimensionText(v);
    const m = d?.match(/^(-?[\d.]+)(px|rem)$/);
    return m ? { value: Number(m[1]), unit: m[2] } : v;
  }
  if (t.type === 'duration' && typeof v === 'string') {
    const m = v.match(/^([\d.]+)(ms|s)$/);
    return m ? { value: Number(m[1]), unit: m[2] } : v;
  }
  return v;
}

/** W3C DTCG tokens: one file with every mode in $extensions (com.socriaux.modes), and one file per extra mode. */
export function exportDtcg(c: SystemContent, opts: { colours?: 'object' | 'hex'; provenance?: boolean } = {}): ExportFile[] {
  const colours = opts.colours ?? 'hex';
  const root: Record<string, any> = {};
  for (const [g, meta] of Object.entries(c.groups)) {
    const leaf: Record<string, unknown> = {};
    if (meta.description) leaf.$description = meta.description;
    if (meta.type) leaf.$type = meta.type;
    if (Object.keys(leaf).length && !c.tokens[g]) setPath(root, g, leaf);
  }
  const perMode: Record<string, Record<string, any>> = {};
  for (const t of Object.values(c.tokens)) {
    const ext: Record<string, unknown> = { ...(t.extensions ?? {}) };
    const own: Record<string, unknown> = {};
    if (t.modes && Object.keys(t.modes).length) own.modes = Object.fromEntries(Object.entries(t.modes).map(([m, v]) => [m, dtcgValue(t, v, colours)]));
    if (opts.provenance !== false) own.provenance = { source: t.provenance.source, status: t.provenance.status, confidence: t.provenance.confidence };
    if (Object.keys(own).length) ext['com.socriaux'] = own;
    const leaf: Record<string, unknown> = { $type: t.type, $value: dtcgValue(t, t.value, colours), ...(t.description ? { $description: t.description } : {}), ...(t.deprecated ? { $deprecated: t.deprecated } : {}), ...(Object.keys(ext).length ? { $extensions: ext } : {}) };
    setPath(root, t.path, leaf);
    for (const [m, v] of Object.entries(t.modes ?? {})) setPath((perMode[m] ??= {}), t.path, { $type: t.type, $value: dtcgValue(t, v, colours) });
  }
  const base = slug(c.identity.name);
  return [{ name: `${base}.tokens.json`, mime: 'application/json', text: JSON.stringify(root, null, 2) }, ...Object.entries(perMode).map(([m, tree]) => ({ name: `${base}.${m}.tokens.json`, mime: 'application/json', text: JSON.stringify(tree, null, 2) }))];
}

/** Style Dictionary (v4) tokens: value / type / comment, references as {path}. */
export function exportStyleDictionary(c: SystemContent): ExportFile {
  const root: Record<string, any> = {};
  // Style Dictionary has no modes of its own: they travel in $extensions (SocriaUX reads them back; other tools ignore them)
  for (const t of Object.values(c.tokens)) setPath(root, t.path, { value: t.value, type: t.type, ...(t.description ? { comment: t.description } : {}), ...(t.modes && Object.keys(t.modes).length ? { $extensions: { 'com.socriaux': { modes: t.modes } } } : {}) });
  return { name: `${slug(c.identity.name)}.style-dictionary.json`, mime: 'application/json', text: JSON.stringify(root, null, 2) };
}

/** A token value as CSS: references as var(), maths as calc(), composites written out. */
function cssValue(t: Token, v: TokenValue): string {
  const ref = (s: string) => s.replace(/\{([^{}]+)\}/g, (_m, p: string) => `var(${cssVarName(p)})`);
  if (isAlias(v)) return ref(String(v));
  if (typeof v === 'string') return refsIn(v).length && /[*/+]|\s-\s/.test(v) ? `calc(${ref(v)})` : ref(v);
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    if (t.type === 'fontFamily') return v.map((f) => (/\s/.test(String(f)) && !/^["']/.test(String(f)) ? `"${f}"` : String(f))).join(', ');
    if (t.type === 'cubicBezier') return `cubic-bezier(${v.join(', ')})`;
    if (t.type === 'gradient') return `linear-gradient(90deg, ${v.map((s) => { const st = s as Record<string, unknown>; return `${ref(String(st.color))} ${Math.round(Number(st.position) * 100)}%`; }).join(', ')})`;
    if (t.type === 'shadow') return v.map((s) => cssValue({ ...t }, s as TokenValue)).join(', ');
    return JSON.stringify(v);
  }
  const o = v as Record<string, unknown>;
  if (t.type === 'shadow') return `${o.inset ? 'inset ' : ''}${ref(String(dimensionText(o.offsetX) ?? o.offsetX ?? 0))} ${ref(String(dimensionText(o.offsetY) ?? o.offsetY ?? 0))} ${ref(String(dimensionText(o.blur) ?? o.blur ?? 0))} ${ref(String(dimensionText(o.spread) ?? o.spread ?? 0))} ${ref(String(o.color ?? '#000'))}`;
  if (t.type === 'border') return `${ref(String(dimensionText(o.width) ?? o.width ?? '1px'))} ${String(o.style ?? 'solid')} ${ref(String(o.color ?? 'currentColor'))}`;
  if (t.type === 'typography') return `${ref(String(o.fontWeight ?? 400))} ${ref(String(dimensionText(o.fontSize) ?? o.fontSize ?? '16px'))}/${ref(String(o.lineHeight ?? 1.4))} ${ref(Array.isArray(o.fontFamily) ? o.fontFamily.join(', ') : String(o.fontFamily ?? 'sans-serif'))}`;
  if (t.type === 'color') return dtcgColour(v)?.hex ?? '#000000';
  return JSON.stringify(v);
}

/** CSS custom properties: :root for the default mode, [data-theme] and prefers-color-scheme for the others. */
export function exportCss(c: SystemContent): ExportFile {
  const lines: string[] = [];
  const paths: Record<string, string> = {};
  // every path whose CSS name does not read back as itself — tokens and the paths they refer to — is listed
  const named = new Set([...Object.keys(c.tokens), ...Object.values(c.tokens).flatMap((t) => refsIn([t.value, ...Object.values(t.modes ?? {})]))]);
  for (const p of named) {
    const n = cssVarName(p);
    if (pathFromCssName(n) !== p) paths[n] = p;
  }
  lines.push(`/* ${c.identity.name} — design tokens exported by SocriaUX. References are var() references. */`);
  if (Object.keys(paths).length) lines.push(`/* socriaux:paths ${JSON.stringify(paths)} */`);
  lines.push(':root {');
  for (const t of Object.values(c.tokens)) lines.push(`  ${cssVarName(t.path)}: ${cssValue(t, t.value)};`);
  lines.push('}');
  for (const m of c.modes.slice(1)) {
    const own = Object.values(c.tokens).filter((t) => t.modes?.[m] !== undefined);
    if (!own.length) continue;
    const body = own.map((t) => `  ${cssVarName(t.path)}: ${cssValue(t, t.modes![m])};`).join('\n');
    lines.push('', `[data-theme="${m}"] {`, body, '}');
    if (m === 'dark') lines.push('', '@media (prefers-color-scheme: dark) {', '  :root:not([data-theme]) {', body.replace(/^/gm, '  '), '  }', '}');
  }
  return { name: `${slug(c.identity.name)}.tokens.css`, mime: 'text/css', text: `${lines.join('\n')}\n` };
}

/** SCSS variables (the default mode; references as variables). */
export function exportScss(c: SystemContent): ExportFile {
  const name = (p: string) => `$${p.replace(/\./g, '-').replace(/[^\w-]/g, '-')}`;
  const lines = [`// ${c.identity.name} — design tokens exported by SocriaUX`];
  const ordered = [...Object.values(c.tokens)].sort((a, b) => (refsIn(a.value).length ? 1 : 0) - (refsIn(b.value).length ? 1 : 0));
  for (const t of ordered) {
    const v = cssValue(t, t.value).replace(/var\((--[\w-]+)\)/g, (_m, n: string) => `$${n.slice(2)}`);
    lines.push(`${name(t.path)}: ${v};`);
  }
  return { name: `_${slug(c.identity.name)}.tokens.scss`, mime: 'text/x-scss', text: `${lines.join('\n')}\n` };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The guideline summary in Markdown: identity, colours with contrast, type, layout, logo, brand statements by standing, governance, sources. */
export function exportGuidelinesMarkdown(c: SystemContent, rec?: Pick<SystemRecord, 'published' | 'sources'>): ExportFile {
  const pal = productPalette(c);
  const vl = visualLanguageOf(c);
  const L: string[] = [`# ${c.identity.name}`, ''];
  if (c.identity.description) L.push(c.identity.description, '');
  L.push(`_Design system${rec?.published ? ` v${rec.published}` : ''}, summarised by SocriaUX. Statements are marked by where they come from: **confirmed** (stated by the source or the owner), **approved** (a reading the owner accepted), **SocriaUX inference** (not enforced)._`, '');
  L.push('## Colour', '', '| Role | Token | Colour | Contrast on background |', '| --- | --- | --- | --- |');
  for (const r of PRODUCT_ROLES.filter((x) => x !== 'display' && x !== 'body' && x !== 'mono')) {
    const b = c.roles[r];
    const hex = (pal.colors as Record<string, string>)[r] ?? (r === 'accent2' ? pal.accent2 : undefined);
    if (!hex) continue;
    L.push(`| ${ROLE_LABEL[r]} | ${b ? `\`${b.path}\`${b.status === 'inferred' ? ' (inferred)' : ''}` : 'derived'} | ${hex} | ${contrastRatio(hex, pal.colors.background).toFixed(1)}:1 |`);
  }
  const palette = Object.values(c.tokens).filter((t) => t.type === 'color');
  if (palette.length) {
    L.push('', '### All colours', '');
    for (const t of palette.slice(0, 80)) {
      const r = resolveToken(c, t.path);
      L.push(`- \`${t.path}\` ${r.ok ? hexOf(r.value) : '—'}${isAlias(t.value) ? ` → ${t.value}` : ''} · ${colourCategory(t).category}${t.modes ? ` · ${Object.entries(t.modes).map(([m, v]) => `${m}: ${typeof v === 'string' ? v : JSON.stringify(v)}`).join(', ')}` : ''}${t.description ? ` — ${t.description}` : ''}`);
    }
  }
  L.push('', '## Typography', '');
  for (const f of pal.families) L.push(`- ${f.role === 'display' ? 'Headlines' : f.role === 'body' ? 'Text' : 'Code'}: **${f.family}**${f.standIn !== f.family ? ` (drawn with ${f.standIn} in SocriaUX)` : ''}`);
  const typeTokens = Object.values(c.tokens).filter((t) => topCategory(t) === 'typography' && t.type !== 'fontFamily');
  for (const t of typeTokens.slice(0, 30)) L.push(`- \`${t.path}\`: ${typeof t.value === 'string' || typeof t.value === 'number' ? t.value : JSON.stringify(t.value)}`);
  const layout = Object.values(c.tokens).filter((t) => topCategory(t) === 'layout');
  if (layout.length) {
    L.push('', '## Layout', '');
    for (const t of layout.slice(0, 40)) L.push(`- \`${t.path}\`: ${typeof t.value === 'string' || typeof t.value === 'number' ? t.value : JSON.stringify(t.value)}`);
  }
  const logos = c.assets.filter((a) => a.kind === 'logo');
  if (logos.length) {
    L.push('', '## Logo', '');
    for (const a of logos) L.push(`- ${a.name} (${a.role ?? 'logo'}, ${a.format.toUpperCase()}${a.width ? `, ${Math.round(a.width)}×${Math.round(a.height ?? 0)}` : ''}): ${a.approved ? '**approved — protected: never redrawn, recoloured, cropped or distorted**' : 'not approved'}${a.lowRes ? ' · low resolution: a reference only' : ''}`);
  }
  const groups: [string, (s: string) => boolean][] = [
    ['Confirmed', (s) => s === 'confirmed'],
    ['Approved interpretations', (s) => s === 'approved'],
    ['SocriaUX inferences (suggestions, not enforced)', (s) => s === 'inferred'],
  ];
  L.push('', '## Brand', '');
  if (vl.personality.length) L.push(`Personality: ${vl.personality.join('; ')}`, '');
  for (const [title, test] of groups) {
    const items = c.intelligence.filter((i) => test(i.status));
    if (!items.length) continue;
    L.push(`### ${title}`, '');
    for (const i of items) L.push(`- ${i.statement}${i.enforce === 'hard' ? ' — **rule**' : i.enforce === 'soft' ? ' — preference' : ''}${i.evidence[0]?.source.page ? ` (p. ${i.evidence[0].source.page})` : ''}`);
    L.push('');
  }
  const { hard } = bindingRules(c);
  L.push('## Governance', '', `- Rules every design is held to: ${hard.length}`, `- Locked tokens: ${c.governance.locked.length ? c.governance.locked.map((g) => `\`${g}\``).join(', ') : 'none'}`, `- Project overrides allowed on: ${c.governance.overridable.project.join(', ') || 'nothing'}`, `- Restricted assets: ${c.governance.restrictedAssets.length}`, `- Publishing needs review: ${c.governance.requireReview ? 'yes' : 'no'}`);
  if (rec?.sources?.length) {
    L.push('', '## Sources', '');
    for (const s of rec.sources) L.push(`- ${s.kind}: ${s.ref} (${new Date(s.at).toISOString().slice(0, 10)}) — ${s.counts.tokens} tokens, ${s.counts.assets} assets`);
  }
  return { name: `${slug(c.identity.name)}-guidelines.md`, mime: 'text/markdown', text: `${L.join('\n')}\n` };
}

/** The guideline summary as a printable HTML page (print it to PDF from the browser if a PDF is wanted). */
export function exportGuidelinesHtml(c: SystemContent, rec?: Pick<SystemRecord, 'published' | 'sources'>): ExportFile {
  const pal = productPalette(c);
  const md = exportGuidelinesMarkdown(c, rec).text;
  const body = md
    .split('\n')
    .map((l) => {
      if (l.startsWith('### ')) return `<h3>${esc(l.slice(4))}</h3>`;
      if (l.startsWith('## ')) return `<h2>${esc(l.slice(3))}</h2>`;
      if (l.startsWith('# ')) return `<h1>${esc(l.slice(2))}</h1>`;
      if (l.startsWith('| ---')) return '';
      if (l.startsWith('|')) {
        const cells = l.split('|').slice(1, -1).map((x) => x.trim());
        const sw = cells.find((x) => /^#[0-9a-f]{6}$/i.test(x));
        return `<tr>${cells.map((x) => `<td>${x === sw ? `<span class="sw" style="background:${x}"></span>` : ''}${esc(x).replace(/`([^`]+)`/g, '<code>$1</code>')}</td>`).join('')}</tr>`;
      }
      if (l.startsWith('- ')) return `<li>${esc(l.slice(2)).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</li>`;
      return l.trim() ? `<p>${esc(l).replace(/_([^_]+)_/g, '<em>$1</em>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>` : '';
    })
    .join('\n')
    .replace(/(<tr>[\s\S]*?<\/tr>\n?)+/g, (m) => `<table>${m}</table>`)
    .replace(/(<li>[\s\S]*?<\/li>\n?)+/g, (m) => `<ul>${m}</ul>`);
  const logo = c.assets.find((a) => a.kind === 'logo' && a.approved && a.svg);
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(c.identity.name)} — guidelines</title><style>
body{font:15px/1.55 system-ui,sans-serif;color:${pal.colors.text};background:${pal.colors.background};max-width:860px;margin:40px auto;padding:0 20px}
h1{font-size:40px;margin:0 0 8px}h2{margin-top:36px;border-top:1px solid ${pal.colors.line};padding-top:16px}table{border-collapse:collapse;width:100%}td{border-bottom:1px solid ${pal.colors.line};padding:6px 8px;vertical-align:middle}
.sw{display:inline-block;width:14px;height:14px;border-radius:3px;margin-right:6px;vertical-align:-2px;border:1px solid rgba(0,0,0,.15)}code{font-size:13px}.logo{max-width:280px;margin:12px 0 24px}
@media print{body{margin:0;max-width:none}}</style></head><body>${logo ? `<div class="logo">${logo.svg}</div>` : ''}${body}</body></html>`;
  return { name: `${slug(c.identity.name)}-guidelines.html`, mime: 'text/html', text: html };
}

/** Every text export of a system, for the export panel and the bundle. */
export function exportAll(c: SystemContent, rec?: Pick<SystemRecord, 'id' | 'published' | 'sources'>): ExportFile[] {
  return [exportCanonical(c, rec), ...exportDtcg(c), exportStyleDictionary(c), exportCss(c), exportScss(c), exportGuidelinesMarkdown(c, rec), exportGuidelinesHtml(c, rec)];
}

/** The system's SVG assets as files (sanitized as they were imported). Rasters and fonts are written by the bundle in the browser. */
export function svgAssetFiles(c: SystemContent): ExportFile[] {
  return c.assets.filter((a) => a.svg).map((a) => ({ name: `assets/${slug(a.name)}${a.role ? `-${a.role}` : ''}.svg`, mime: 'image/svg+xml', text: a.svg! }));
}
