// lib/ux-v0/dsi/figma.ts — a Figma design system, from the official REST API's responses, as the canonical system.
//
// Read, never scraped: what the file's owner lets the token see. Mapped, with every token's source kept (the file key,
// the variable, collection and node ids, the mode, the file's version):
//
//   variables (GET /v1/files/:key/variables/local)  → tokens, with every collection mode as a mode and aliases as
//                                                      references; remote variables not in the file are said
//   styles (GET /v1/files/:key + /nodes?ids=)        → colour (solid and gradient fills), typography (with the family
//                                                      as its own token), shadow and blur, layout grids
//   components and component sets                    → component definitions: names, variants and their properties,
//                                                      descriptions. Definitions only: a Figma component is not code,
//                                                      and nothing here claims to produce a working component
//   logo-named nodes (GET /v1/images/:key?format=svg) → SVG assets, sanitized, awaiting the owner's approval
//
// The REST variables endpoint needs a Figma Enterprise plan (and the file_variables:read scope); where it answers 403
// the import says so and continues with styles. This module only maps; ./figma-server.ts does the fetching.

import { colourFromDtcg } from './colour';
import { emptyContent, modeName, normalizePath, uid, type ComponentDef, type SourceRef, type SystemContent, type Token, type TokenType, type TokenValue } from './schema';
import { dimensionKind } from './classify';

export interface FigmaIssue {
  severity: 'error' | 'warning' | 'info';
  path?: string;
  message: string;
  fix?: string;
}

const KEY = /^[A-Za-z0-9]{10,128}$/;

/** The file key from a Figma URL (file/, design/, proto/, board/) or a bare key; null otherwise. */
export function figmaKey(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (KEY.test(s)) return s;
  const m = s.match(/^https:\/\/(?:www\.)?figma\.com\/(?:file|design|proto|board)\/([A-Za-z0-9]{10,128})(?:[/?#]|$)/);
  return m ? m[1] : null;
}

const rgbaHex = (c: unknown, opacity = 1): string | null => {
  if (!c || typeof c !== 'object') return null;
  const r = c as Record<string, number>;
  if (![r.r, r.g, r.b].every((x) => typeof x === 'number' && Number.isFinite(x))) return null;
  return colourFromDtcg({ colorSpace: 'srgb', components: [r.r, r.g, r.b], alpha: (typeof r.a === 'number' ? r.a : 1) * opacity });
};

/** A Figma name ("Color/Brand/Primary 500") as a token path ("Color.Brand.Primary-500"). */
export function pathOfName(name: string, prefix?: string): string | null {
  const segs = String(name)
    .split('/')
    .map((s) => s.trim().replace(/\s+/g, '-').replace(/[{}.$]/g, '-').replace(/^-+|-+$/g, ''))
    .filter(Boolean);
  if (prefix && segs[0]?.toLowerCase() !== prefix.toLowerCase()) segs.unshift(prefix);
  return normalizePath(segs.join('.'));
}

const SIZE_SCOPES = ['CORNER_RADIUS', 'WIDTH_HEIGHT', 'GAP', 'STROKE_FLOAT', 'FONT_SIZE', 'LINE_HEIGHT', 'LETTER_SPACING', 'PARAGRAPH_SPACING', 'PARAGRAPH_INDENT', 'EFFECT_FLOAT'];

function floatType(path: string, scopes: string[]): TokenType {
  if (scopes.includes('FONT_WEIGHT')) return 'fontWeight';
  if (scopes.some((s) => SIZE_SCOPES.includes(s)) && !scopes.includes('LINE_HEIGHT')) return 'dimension';
  if (scopes.includes('OPACITY') || scopes.includes('LINE_HEIGHT')) return 'number';
  const k = dimensionKind(path);
  if (/weight/i.test(path)) return 'fontWeight';
  return k !== 'other' && k !== 'lineHeight' ? 'dimension' : 'number';
}

/**
 * Figma variables (the REST response's meta: { variables, variableCollections }) as tokens: one token per variable,
 * collection modes as modes, aliases as references, scopes and code syntax kept as extensions.
 */
export function mapFigmaVariables(meta: Record<string, any>, opts: { fileKey: string; version?: string; now?: number }): { content: SystemContent; notes: string[]; issues: FigmaIssue[] } {
  const now = opts.now ?? Date.now();
  const content = emptyContent('');
  const notes: string[] = [];
  const issues: FigmaIssue[] = [];
  const vars: Record<string, any> = meta?.variables && typeof meta.variables === 'object' ? meta.variables : {};
  const cols: Record<string, any> = meta?.variableCollections && typeof meta.variableCollections === 'object' ? meta.variableCollections : {};
  // names that occur in more than one collection are prefixed with their collection
  const nameCount = new Map<string, number>();
  for (const v of Object.values(vars)) nameCount.set(String(v?.name ?? ''), (nameCount.get(String(v?.name ?? '')) ?? 0) + 1);
  const pathOf = new Map<string, string>();
  for (const [id, v] of Object.entries(vars)) {
    const col = cols[v?.variableCollectionId];
    const prefix = (nameCount.get(String(v?.name)) ?? 0) > 1 && col?.name ? String(col.name) : undefined;
    const p = pathOfName(String(v?.name ?? ''), prefix);
    if (p) pathOf.set(id, p);
  }
  const modeOf = new Map<string, string>();
  const modes: string[] = [];
  const colList = Object.values(cols).filter((c) => c && Array.isArray(c.modes));
  // the default mode of the collection with the most modes leads; single-mode collections are mode-independent
  const lead = [...colList].sort((a, b) => b.modes.length - a.modes.length)[0];
  for (const c of colList) {
    for (const m of c.modes) {
      const n = modeName(m?.name) || 'default';
      modeOf.set(`${c.id}|${m.modeId}`, n);
      if (c.modes.length > 1 && !modes.includes(n)) (c === lead && m.modeId === c.defaultModeId ? modes.unshift(n) : modes.push(n));
    }
  }
  content.modes = modes.length ? modes : ['light'];
  const resolveValue = (raw: any, type: TokenType): TokenValue | null => {
    if (raw && typeof raw === 'object' && raw.type === 'VARIABLE_ALIAS') {
      const target = pathOf.get(String(raw.id));
      if (target) return `{${target}}`;
      return `{figma-remote.${String(raw.id).replace(/[^\w]/g, '-')}}`;
    }
    if (type === 'color') return rgbaHex(raw);
    if (type === 'dimension') return typeof raw === 'number' ? `${Math.round(raw * 1000) / 1000}px` : null;
    if (type === 'number' || type === 'fontWeight') return typeof raw === 'number' ? raw : null;
    if (type === 'boolean') return typeof raw === 'boolean' ? raw : null;
    return typeof raw === 'string' ? raw : raw === undefined ? null : String(raw);
  };
  let remote = 0;
  for (const [id, v] of Object.entries(vars)) {
    const path = pathOf.get(id);
    if (!path) {
      issues.push({ severity: 'warning', message: `The variable “${v?.name}” has a name SocriaUX cannot use as a token path; it was skipped.` });
      continue;
    }
    if (content.tokens[path]) {
      issues.push({ severity: 'warning', path, message: `Two variables are both ${path}; the first was kept.` });
      continue;
    }
    const col = cols[v.variableCollectionId];
    const scopes: string[] = Array.isArray(v.scopes) ? v.scopes.map(String) : [];
    const type: TokenType = v.resolvedType === 'COLOR' ? 'color' : v.resolvedType === 'BOOLEAN' ? 'boolean' : v.resolvedType === 'FLOAT' ? floatType(path, scopes) : scopes.includes('FONT_FAMILY') || /font-?family|typeface/i.test(path) ? 'fontFamily' : scopes.includes('FONT_STYLE') ? 'fontStyle' : 'string';
    const byMode: Record<string, any> = v.valuesByMode && typeof v.valuesByMode === 'object' ? v.valuesByMode : {};
    const defId = col?.defaultModeId ?? Object.keys(byMode)[0];
    const def = resolveValue(byMode[defId], type);
    if (def === null) {
      issues.push({ severity: 'warning', path, message: `${path} has no value SocriaUX can read in its default mode; it was skipped.` });
      continue;
    }
    if (typeof def === 'string' && def.startsWith('{figma-remote.')) remote++;
    const tokModes: Record<string, TokenValue> = {};
    if (col && col.modes.length > 1) {
      for (const [mid, raw] of Object.entries(byMode)) {
        if (mid === defId) continue;
        const mn = modeOf.get(`${col.id}|${mid}`);
        const mv = resolveValue(raw, type);
        if (mn && mv !== null && mn !== content.modes[0]) tokModes[mn] = mv;
      }
    }
    const source: SourceRef = { kind: 'figma', ref: opts.fileKey, variableId: id, ...(col?.id ? { collectionId: String(col.id) } : {}), ...(col?.modes?.find((m: any) => m.modeId === defId)?.name ? { mode: String(col.modes.find((m: any) => m.modeId === defId).name) } : {}), ...(opts.version ? { version: opts.version } : {}), property: String(v.name) };
    const t: Token = {
      path,
      type,
      value: def,
      ...(Object.keys(tokModes).length ? { modes: tokModes } : {}),
      ...(typeof v.description === 'string' && v.description.trim() ? { description: v.description.trim().slice(0, 600) } : {}),
      ...(v.deletedButReferenced ? { deprecated: 'Deleted in Figma but still referenced' } : {}),
      provenance: { source, importedAt: now, original: (byMode[defId] ?? def) as TokenValue, status: 'imported', confidence: 1 },
      extensions: { 'com.figma': { scopes, ...(v.codeSyntax && typeof v.codeSyntax === 'object' ? { codeSyntax: v.codeSyntax } : {}), ...(v.hiddenFromPublishing ? { hiddenFromPublishing: true } : {}), ...(col?.name ? { collection: String(col.name) } : {}) } },
    };
    content.tokens[path] = t;
  }
  if (remote) issues.push({ severity: 'warning', message: `${remote} variable${remote === 1 ? '' : 's'} refer to variables from another library that this file does not include.`, fix: 'Import that library too, or point those variables at local ones.' });
  notes.push(`Figma variables: ${Object.keys(content.tokens).length} from ${colList.length} collection${colList.length === 1 ? '' : 's'}${content.modes.length > 1 ? `, modes ${content.modes.join(', ')}` : ''}.`);
  content.unknown['figma.collections'] = colList.map((c) => ({ id: c.id, name: c.name, modes: c.modes.map((m: any) => m.name), defaultModeId: c.defaultModeId }));
  return { content, notes, issues };
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'family';

/**
 * Styles as tokens: `file` is GET /v1/files/:key (its `styles` map), `nodes` is GET /v1/files/:key/nodes?ids=… for
 * the style nodes (their fills, text styles, effects and grids).
 */
export function mapFigmaStyles(file: Record<string, any>, nodes: Record<string, any>, opts: { fileKey: string; version?: string; now?: number }): { tokens: Record<string, Token>; notes: string[]; issues: FigmaIssue[] } {
  const now = opts.now ?? Date.now();
  const tokens: Record<string, Token> = {};
  const notes: string[] = [];
  const issues: FigmaIssue[] = [];
  const styles: Record<string, any> = file?.styles && typeof file.styles === 'object' ? file.styles : {};
  const docs: Record<string, any> = nodes?.nodes && typeof nodes.nodes === 'object' ? nodes.nodes : {};
  const families = new Map<string, string>();
  const put = (path: string | null, type: TokenType, value: TokenValue, nodeId: string, name: string, description?: string) => {
    if (!path || tokens[path]) return;
    tokens[path] = {
      path,
      type,
      value,
      ...(description ? { description: description.slice(0, 600) } : {}),
      provenance: { source: { kind: 'figma', ref: opts.fileKey, nodeId, property: name, ...(opts.version ? { version: opts.version } : {}) }, importedAt: now, original: value, status: 'imported', confidence: 1 },
    };
  };
  let counts = { fill: 0, text: 0, effect: 0, grid: 0 };
  for (const [nodeId, s] of Object.entries(styles)) {
    const node = docs[nodeId]?.document;
    const name = String(s?.name ?? '');
    if (!node) {
      issues.push({ severity: 'info', message: `The style “${name}” could not be read (its node was not returned).` });
      continue;
    }
    const desc = typeof s.description === 'string' ? s.description : '';
    if (s.styleType === 'FILL') {
      const fill = (Array.isArray(node.fills) ? node.fills : []).filter((f: any) => f && f.visible !== false).pop();
      if (!fill) continue;
      if (fill.type === 'SOLID') {
        const hex = rgbaHex(fill.color, typeof fill.opacity === 'number' ? fill.opacity : 1);
        if (hex) put(pathOfName(name, 'color'), 'color', hex, nodeId, name, desc), counts.fill++;
      } else if (/^GRADIENT_/.test(fill.type) && Array.isArray(fill.gradientStops)) {
        const stops = fill.gradientStops.map((g: any) => ({ color: rgbaHex(g.color) ?? '#000000', position: Math.round(Number(g.position ?? 0) * 1000) / 1000 }));
        put(pathOfName(name, 'gradient'), 'gradient', stops, nodeId, name, desc);
        counts.fill++;
      }
    } else if (s.styleType === 'TEXT' && node.style) {
      const st = node.style;
      const fam = String(st.fontFamily ?? '').trim();
      if (!fam) continue;
      let famPath = families.get(fam);
      if (!famPath) {
        famPath = `font.family.${slug(fam)}`;
        families.set(fam, famPath);
        put(famPath, 'fontFamily', fam, nodeId, `${fam} (from text styles)`);
      }
      const size = Number(st.fontSize);
      const value: Record<string, unknown> = { fontFamily: `{${famPath}}`, fontWeight: Number(st.fontWeight) || 400, fontSize: `${Number.isFinite(size) ? size : 16}px` };
      if (typeof st.lineHeightPercentFontSize === 'number') value.lineHeight = Math.round(st.lineHeightPercentFontSize) / 100;
      else if (typeof st.lineHeightPx === 'number' && size) value.lineHeight = Math.round((st.lineHeightPx / size) * 100) / 100;
      if (typeof st.letterSpacing === 'number') value.letterSpacing = `${Math.round(st.letterSpacing * 100) / 100}px`;
      if (st.textCase && st.textCase !== 'ORIGINAL') value.textCase = String(st.textCase).toLowerCase();
      put(pathOfName(name, 'typography'), 'typography', value, nodeId, name, desc);
      counts.text++;
    } else if (s.styleType === 'EFFECT') {
      const fx = (Array.isArray(node.effects) ? node.effects : []).filter((e: any) => e && e.visible !== false);
      const shadows = fx.filter((e: any) => e.type === 'DROP_SHADOW' || e.type === 'INNER_SHADOW').map((e: any) => ({ color: rgbaHex(e.color) ?? '#00000040', offsetX: `${e.offset?.x ?? 0}px`, offsetY: `${e.offset?.y ?? 0}px`, blur: `${e.radius ?? 0}px`, spread: `${e.spread ?? 0}px`, ...(e.type === 'INNER_SHADOW' ? { inset: true } : {}) }));
      if (shadows.length) put(pathOfName(name, 'shadow'), 'shadow', shadows.length === 1 ? shadows[0] : shadows, nodeId, name, desc), counts.effect++;
      const blur = fx.find((e: any) => e.type === 'LAYER_BLUR' || e.type === 'BACKGROUND_BLUR');
      if (blur && !shadows.length) put(pathOfName(name, 'blur'), 'dimension', `${blur.radius ?? 0}px`, nodeId, name, desc), counts.effect++;
    } else if (s.styleType === 'GRID') {
      const g = (Array.isArray(node.layoutGrids) ? node.layoutGrids : []).find((x: any) => x.pattern === 'COLUMNS') ?? (Array.isArray(node.layoutGrids) ? node.layoutGrids[0] : null);
      const base = pathOfName(name, 'grid');
      if (g && base) {
        if (Number.isFinite(g.count)) put(`${base}.columns`, 'number', Number(g.count), nodeId, name, desc);
        if (Number.isFinite(g.gutterSize)) put(`${base}.gutter`, 'dimension', `${g.gutterSize}px`, nodeId, name, desc);
        if (Number.isFinite(g.offset)) put(`${base}.margin`, 'dimension', `${g.offset}px`, nodeId, name, desc);
        counts.grid++;
      }
    }
  }
  notes.push(`Figma styles: ${counts.fill} fill, ${counts.text} text, ${counts.effect} effect, ${counts.grid} grid.`);
  return { tokens, notes, issues };
}

/** "Size=Large, State=Hover" → { Size: 'Large', State: 'Hover' }. */
export function variantProps(name: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of String(name).split(',')) {
    const m = part.match(/^\s*([^=]+?)\s*=\s*(.+?)\s*$/);
    if (m && !/^(__proto__|prototype|constructor)$/.test(m[1])) out[m[1].slice(0, 40)] = m[2].slice(0, 80);
  }
  return out;
}

/** Component sets and components as definitions (names, variants, properties, descriptions) — never as code. */
export function mapFigmaComponents(file: Record<string, any>, opts: { fileKey: string; version?: string }): ComponentDef[] {
  const comps: Record<string, any> = file?.components && typeof file.components === 'object' ? file.components : {};
  const sets: Record<string, any> = file?.componentSets && typeof file.componentSets === 'object' ? file.componentSets : {};
  const out: ComponentDef[] = [];
  const bySet = new Map<string, { id: string; c: any }[]>();
  for (const [id, c] of Object.entries(comps)) {
    if (c?.componentSetId && sets[c.componentSetId]) {
      if (!bySet.has(c.componentSetId)) bySet.set(c.componentSetId, []);
      bySet.get(c.componentSetId)!.push({ id, c });
    } else {
      out.push({ id: `figma:${id}`, name: String(c?.name ?? 'Component').slice(0, 80), description: String(c?.description ?? '').slice(0, 600), variants: [], properties: [], tokens: [], source: { kind: 'figma', ref: opts.fileKey, nodeId: id, ...(opts.version ? { version: opts.version } : {}) }, notes: [] });
    }
  }
  for (const [setId, members] of bySet) {
    const s = sets[setId];
    const variants = members.map((m) => ({ name: String(m.c.name), props: variantProps(m.c.name) }));
    const props = new Map<string, Set<string>>();
    for (const v of variants) for (const [k, val] of Object.entries(v.props)) (props.get(k) ?? props.set(k, new Set()).get(k)!).add(val);
    out.push({
      id: `figma:${setId}`,
      name: String(s?.name ?? 'Component').slice(0, 80),
      description: String(s?.description ?? '').slice(0, 600),
      variants: variants.slice(0, 80),
      properties: [...props].map(([name, opts2]) => ({ name, type: 'variant' as const, options: [...opts2].slice(0, 30) })),
      tokens: [],
      source: { kind: 'figma', ref: opts.fileKey, nodeId: setId, ...(opts.version ? { version: opts.version } : {}) },
      notes: [],
    });
  }
  return out.slice(0, 300);
}

/** Nodes whose names say they are a logo (components first), for exporting as SVG. */
export function logoNodeIds(file: Record<string, any>, max = 6): { id: string; name: string }[] {
  const out: { id: string; name: string }[] = [];
  const comps: Record<string, any> = file?.components ?? {};
  for (const [id, c] of Object.entries(comps)) if (/\blogo|wordmark|logomark|brandmark\b/i.test(String(c?.name ?? ''))) out.push({ id, name: String(c.name) });
  const walk = (n: any, depth: number) => {
    if (!n || depth > 4 || out.length >= max) return;
    if (n.id && /\blogo|wordmark|logomark\b/i.test(String(n.name ?? '')) && (n.type === 'COMPONENT' || n.type === 'FRAME' || n.type === 'GROUP' || n.type === 'INSTANCE' || n.type === 'VECTOR') && !out.some((x) => x.id === n.id)) out.push({ id: String(n.id), name: String(n.name) });
    for (const ch of Array.isArray(n.children) ? n.children : []) walk(ch, depth + 1);
  };
  walk(file?.document, 0);
  return out.slice(0, max);
}

export interface FigmaFetched {
  file: Record<string, any>;
  nodes: Record<string, any> | null;
  variables: { status: 'ok'; meta: Record<string, any> } | { status: 'forbidden' | 'error' | 'skipped'; message: string };
  logos: { id: string; name: string; svg: string }[];
}

/** Everything fetched from one file, as the canonical system's parts (assets are sanitized by the caller). */
export function figmaContent(f: FigmaFetched, opts: { fileKey: string; now?: number }): { content: SystemContent; notes: string[]; issues: FigmaIssue[] } {
  const version = typeof f.file.version === 'string' ? f.file.version : undefined;
  const content = emptyContent(String(f.file.name ?? 'Figma design system').slice(0, 80));
  const notes: string[] = [];
  const issues: FigmaIssue[] = [];
  if (f.variables.status === 'ok') {
    const v = mapFigmaVariables(f.variables.meta, { fileKey: opts.fileKey, version, now: opts.now });
    Object.assign(content.tokens, v.content.tokens);
    content.modes = v.content.modes;
    content.unknown = { ...content.unknown, ...v.content.unknown };
    notes.push(...v.notes);
    issues.push(...v.issues);
  } else if (f.variables.status === 'forbidden') {
    issues.push({ severity: 'warning', message: 'Figma did not share this file’s variables: the REST variables endpoint needs an Enterprise plan and the file_variables:read scope.', fix: 'Styles, components and logos were imported. To bring variables too, export them as JSON from Figma (a variables export plugin) and import that file.' });
  } else if (f.variables.status === 'error') issues.push({ severity: 'warning', message: `Variables could not be read: ${f.variables.message}` });
  if (f.nodes) {
    const s = mapFigmaStyles(f.file, f.nodes, { fileKey: opts.fileKey, version, now: opts.now });
    for (const [p, t] of Object.entries(s.tokens)) if (!content.tokens[p]) content.tokens[p] = t;
    notes.push(...s.notes);
    issues.push(...s.issues);
  }
  content.components = mapFigmaComponents(f.file, { fileKey: opts.fileKey, version });
  if (content.components.length) notes.push(`${content.components.length} component definitions (names, variants, properties). They describe the components; they are not code.`);
  content.unknown['figma.file'] = { key: opts.fileKey, name: f.file.name, version, lastModified: f.file.lastModified };
  return { content, notes, issues };
}

export const figmaAssetId = () => uid('fg');
