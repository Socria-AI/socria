// lib/ux-v0/design/legacy.ts — a graphic or a board made with the earlier editor, carried into the design workspace.
//
// The earlier editor kept a design as a tree of typed nodes drawn by its own renderer (lib/ux-v0/graphics/render.ts).
// Here each of its artboards is drawn once by that renderer, as the SVG it always exported, and that SVG becomes the
// artboard's markup: the design looks exactly as it did, and from now on it is changed like any other — in words, or
// by hand on the canvas. A board brings the artboards of its graphic materials, one group per material; its mockups
// and website schematics were pictures of those, and are named in the first turn, not redrawn. The old record itself
// is kept on the project (DesignProject.legacy), untouched, so nothing made before is lost.
//
// Pure: the browser passes a measure with the faces loaded and its own parser (components/ux-v0/design/legacy-open.ts),
// the tests the approximate measure and a DOM of their own. Pictures held by upload stay uploads; a picture linked from
// the web cannot be drawn in the sandboxed canvas (it has no network), so it is left out and said.

import { normalizeDoc, type Artboard, type GraphicDoc } from '../graphics/doc';
import { renderArtboard } from '../graphics/render';
import type { Measure } from '../graphics/text';
import type { DesignProject } from '../types';
import { commit, emptyState, type DesignArtboard, type DesignAsset, type DesignState } from './doc';
import { DEFAULT_FORMAT, formatOf } from './formats';
import { prepareFragment, type Parse } from './elements';

const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const safeId = (v: string, i: number) => (String(v).replace(/[^\w-]/g, '').slice(0, 36) || `ab${i}`);
const PX_PER_PT = 96 / 72;

export interface LegacyOutcome {
  project: DesignProject;
  artboards: number;
  /** what could not come over, said in the first turn */
  left: string[];
}

/** The fonts an old document is set in (to load before measuring its words). */
export function legacyFaces(p: DesignProject): string[] {
  const out = new Set<string>();
  for (const d of legacyDocs(p)) {
    out.add(d.doc.tokens.fonts.display);
    out.add(d.doc.tokens.fonts.body);
    const walk = (ns: any[]) => {
      for (const n of ns ?? []) {
        if (n?.type === 'text' && typeof n.font === 'string') out.add(n.font);
        if (Array.isArray(n?.children)) walk(n.children);
      }
    };
    for (const a of d.doc.artboards) walk(a.children);
  }
  return [...out].filter(Boolean).slice(0, 12);
}

/** Every document in an old graphic or board, with the group its artboards come in. */
function legacyDocs(p: DesignProject): { doc: GraphicDoc; group: string | null }[] {
  if (p.medium === 'graphic') {
    const d = normalizeDoc(obj(p.graphic).doc);
    return d ? [{ doc: d, group: null }] : [];
  }
  if (p.medium === 'board') {
    const out: { doc: GraphicDoc; group: string | null }[] = [];
    for (const m of (Array.isArray(obj(p.board).materials) ? obj(p.board).materials : []).slice(0, 60)) {
      if (obj(m).type !== 'graphic') continue;
      const d = normalizeDoc(obj(m).doc);
      if (d) out.push({ doc: d, group: String(obj(m).name ?? obj(m).id ?? '').slice(0, 60) || null });
    }
    return out;
  }
  return [];
}

/** One old artboard as a new one: its SVG, drawn by the renderer it was made with, filling the artboard. */
export function artboardFromLegacy(doc: GraphicDoc, a: Artboard, i: number, measure?: Measure, parse?: Parse): Omit<DesignArtboard, 'x' | 'y'> {
  const k = a.unit === 'pt' ? PX_PER_PT : 1;
  const width = Math.max(16, Math.round(a.width * k));
  const height = Math.max(16, Math.round(a.height * k));
  const id = safeId(a.id, i);
  const svg = renderArtboard(doc, a, { ...(measure ? { measure } : {}), idPrefix: `${id}-`, href: (assetId) => `asset:${assetId}` }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 class="legacy" width="100%" height="100%" preserveAspectRatio="none"');
  const f = formatOf(String(a.format ?? ''));
  const bg = a.background && /^#[0-9a-f]{3,8}$/i.test(a.background) ? a.background : 'transparent';
  return {
    id,
    name: (a.name || doc.name || 'Artboard').slice(0, 80),
    format: f && Math.abs(f.width - width) < 2 && Math.abs(f.height - height) < 2 ? f.id : 'custom',
    width,
    height,
    medium: f?.medium ?? (a.unit === 'pt' ? 'print' : 'screen'),
    // cleaned and given element ids like any artboard the designer writes, so its words select and edit by hand
    html: ((h) => (parse ? prepareFragment(h, parse) : h))(`<style>.sx-root{background:${bg}}svg.legacy{position:absolute;inset:0;display:block}</style>${svg}`),
  };
}

/** An old graphic or board project as a design project (see the head of this file); null for anything else. */
export function designFromLegacy(p: DesignProject, o: { measure?: Measure; parse?: Parse; now: number }): LegacyOutcome | null {
  if (p.medium !== 'graphic' && p.medium !== 'board') return null;
  const docs = legacyDocs(p);
  const left: string[] = [];
  const g = obj(p.graphic);
  const b = obj(p.board);
  const brief = p.medium === 'graphic' ? obj(g.brief) : obj(b.brief);
  const words = [p.intent, brief.purpose, obj(brief.content).headline, p.medium === 'board' ? b.request : ''].filter((x) => typeof x === 'string' && x.trim()).join('\n');
  const kind = p.medium === 'board' ? 'campaign' : typeof brief.kind === 'string' && brief.kind ? brief.kind : 'graphic';

  // artboards, laid out in rows: one row per document (a board's material), side by side within it
  const artboards: DesignArtboard[] = [];
  const assets = new Map<string, DesignAsset>();
  const seen = new Set<string>();
  let y = 0;
  for (const { doc, group } of docs) {
    let x = 0;
    let rowH = 0;
    for (const a of doc.artboards.slice(0, 40)) {
      const made = artboardFromLegacy(doc, a, artboards.length, o.measure, o.parse);
      let id = made.id;
      while (seen.has(id)) id = `${made.id}-${artboards.length}`;
      seen.add(id);
      artboards.push({ ...made, id, ...(group ? { group: `legacy-${group}` } : {}), x, y });
      x += made.width + 120;
      rowH = Math.max(rowH, made.height);
    }
    y += rowH + 240;
    for (const s of doc.assets) {
      if (assets.has(s.id)) continue;
      if (/^(upload:|data:image\/)/.test(s.src)) assets.set(s.id, { id: s.id, name: s.name || 'picture', src: s.src, width: s.width, height: s.height });
      else left.push(`the picture “${s.name || s.id}”, which was linked from the web`);
    }
  }
  if (p.medium === 'board') {
    const others = (Array.isArray(b.materials) ? b.materials : []).filter((m: unknown) => obj(m).type !== 'graphic');
    const mock = others.filter((m: unknown) => obj(m).type === 'mockup').length;
    const site = others.filter((m: unknown) => obj(m).type === 'website').length;
    if (mock) left.push(`${mock} mockup${mock === 1 ? '' : 's'} (pictures of the designs above, in a setting)`);
    if (site) left.push(`${site} website schematic${site === 1 ? '' : 's'}`);
  }

  const format = formatOf(String(docs[0]?.doc.artboards[0]?.format ?? ''))?.id ?? DEFAULT_FORMAT;
  let state: DesignState = { ...emptyState(kind, format, words), assets: [...assets.values()] };
  const doc = { artboards, tokens: '' };
  if (artboards.length) state = commit(state, doc, 'Carried over from the earlier editor', 'model', o.now);
  const n = artboards.length;
  const said = n
    ? `This was made with the earlier editor. I've carried it over exactly as it was drawn: ${n === 1 ? 'its artboard is' : `its ${n} artboards are`} now ${n === 1 ? 'a drawing' : 'drawings'} you can change here — ask in words, or select something on the canvas and edit it by hand.${left.length ? ` Not carried over: ${left.join('; ')}.` : ''} The original stays with the project.`
    : `This was begun with the earlier editor but has no artboards yet. Say what to make and I'll design it here.`;
  state = { ...state, turns: [{ id: `t-legacy-${o.now.toString(36)}`, role: 'designer', text: said, at: o.now }] };

  const { graphic: _g, board: _b, ...rest } = p;
  const project: DesignProject = {
    ...rest,
    medium: 'design',
    design: state,
    legacy: { medium: p.medium, data: p.medium === 'graphic' ? p.graphic : p.board, at: o.now },
    updatedAt: o.now,
  };
  return { project, artboards: n, left };
}
