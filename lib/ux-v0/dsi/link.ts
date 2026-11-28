// lib/ux-v0/dsi/link.ts — a registry design system applied to projects, and its changes carried through them.
//
//   apply       link a project to a system (following its latest published version, or pinned to one): the website's
//               brief is built within it and its design takes its tokens; a graphic takes its tokens (the properties
//               the document's own token table set are bound, once) and its approved logo; a board's Master Design
//               System takes its identity and the board's sync carries it to every material
//   impact      what a new version would change in a project, before anything is applied
//   propagate   a published version carried through: only linked references change (a website's token slots, a
//               graphic's recorded bindings, a board's bindings); a slot or property the designer changed since is
//               their override and is kept, and said; a pinned project is left on its version, and said; a draft
//               never reaches a project
//   undo        every application saves the version before it, so it can be put back
//
// Nothing here is a model call or a recomposition: identity changes, expression stays.

import { capVersions } from '../history';
import { briefWithSystem } from '../design-system';
import type { DesignProject } from '../types';
import type { DesignSpec } from '../spec';
import { applyBoardOps, MAX_BOARD_VERSIONS, snapshotOf, type BoardOp, type BoardState } from '../boards/model';
import { bindingsOf, propagate, type Bindings, type MasterDesignSystem } from '../boards/system';
import { syncSystem, type SyncEntry } from '../boards/sync';
import type { GraphicDoc, ImageNode, Node, Tokens } from '../graphics/doc';
import { MAX_GRAPHIC_VERSIONS, type DocBindings, type GraphicState } from '../graphics/state';
import type { Measure } from '../graphics/text';
import { directionInBrand, logoBoardAsset, placeBrandLogo, productSlots, toGraphicTokens, toMasterSystem, toWebsiteSystem } from './adapters';
import { latestVersion, publishedContent, type SystemRecord } from './registry';
import type { SystemLink } from './link-schema';
import type { SystemContent, TokenValue } from './schema';
import { exportCss } from './exporters';
import { commit as commitDesign } from '../design/doc';
import { protectedUnder } from '../design/locks';
import type { Parse } from '../design/elements';

/** A system's tokens as a design's shared styles (lib/ux-v0/design/brand.ts gives the same to the designer). */
export const designCss = (content: SystemContent) => exportCss(content).text.replace(/\/\*[\s\S]*?\*\//g, '').trim();

export type ProjectKind = 'website' | 'graphic' | 'board';
export const kindOfProject = (p: DesignProject): ProjectKind => (p.medium === 'graphic' || p.medium === 'design' ? 'graphic' : p.medium === 'board' ? 'board' : 'website');

export interface SlotChange {
  slot: string;
  from: string | number | undefined;
  to: string | number;
}

export interface ApplyReport {
  projectId: string;
  name: string;
  kind: ProjectKind;
  /** 'held': nothing was applied, because it would have changed work the person approved or protected */
  outcome: 'applied' | 'updated' | 'unchanged' | 'pinned' | 'linked' | 'not-linked' | 'held' | 'error';
  version: number;
  changed: SlotChange[];
  kept: { what: string; why: string }[];
  materials?: SyncEntry[];
  /** the version saved before the change, to put back */
  before?: string;
  summary: string;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** A minimal Master Design System over a token table, so a graphic's bindings can be recorded and propagated. */
export function systemOfTokens(t: Tokens, opts: { weight?: number; case?: 'sentence' | 'upper' | 'lower'; name?: string } = {}): MasterDesignSystem {
  return { version: 1, id: 'doctokens', name: opts.name ?? 'Document', direction: { name: '', language: '' }, personality: [], tokens: t, weights: { display: opts.weight ?? 600, body: 400 }, type: { case: opts.case ?? 'sentence', tracking: 'normal' }, composition: { intensity: 50, density: 'balanced' }, shape: null, motifs: [], imagery: '', logo: null, constraints: [] };
}

/** The content a link reads: the pinned version, or the latest published one. A draft is never read here. */
export function contentForLink(rec: SystemRecord, pin: number | 'latest'): { content: SystemContent; version: number } | null {
  const content = publishedContent(rec, pin);
  if (!content) return null;
  return { content, version: pin === 'latest' ? latestVersion(rec)!.n : pin };
}

const sameValue = (a: unknown, b: unknown) => String(a ?? '').toLowerCase() === String(b ?? '').toLowerCase();

/** Which slots move from one slot table to the next, given what the project holds now (a slot that differs from what was applied is the designer's override). */
function planSlots(prevApplied: Record<string, string | number>, current: Record<string, string | number | undefined>, next: Record<string, string | number>, first: boolean): { write: SlotChange[]; kept: { what: string; why: string }[] } {
  const write: SlotChange[] = [];
  const kept: { what: string; why: string }[] = [];
  for (const [slot, to] of Object.entries(next)) {
    const cur = current[slot];
    if (sameValue(cur, to)) continue;
    if (!first && prevApplied[slot] !== undefined && cur !== undefined && !sameValue(cur, prevApplied[slot])) {
      kept.push({ what: slot, why: `changed in this project (${cur}); kept as a local override` });
      continue;
    }
    if (!first && prevApplied[slot] === undefined && cur !== undefined && slot !== 'logo') {
      // a slot the system did not set before: the project's own value is kept unless it was never set
      kept.push({ what: slot, why: `the project set it itself (${cur}); kept` });
      continue;
    }
    write.push({ slot, from: cur, to });
  }
  return { write, kept };
}

// ── websites ──

function websiteSlots(spec: DesignSpec | undefined): Record<string, string | number | undefined> {
  if (!spec) return {};
  const out: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(spec.tokens.colors)) out[`colors.${k}`] = v;
  out['fonts.display'] = spec.tokens.fonts.display;
  out['fonts.body'] = spec.tokens.fonts.body;
  out.radius = spec.tokens.radius;
  if (spec.look) {
    out['weights.display'] = spec.look.weight;
    out.case = spec.look.case;
    if (spec.look.accent2) out['colors.accent2'] = spec.look.accent2;
  }
  return out;
}

function specWith(spec: DesignSpec, write: SlotChange[], label: string): DesignSpec {
  const tokens = { ...spec.tokens, colors: { ...spec.tokens.colors }, fonts: { ...spec.tokens.fonts } };
  const look = spec.look ? { ...spec.look } : spec.look;
  for (const w of write) {
    const [a, b] = w.slot.split('.');
    if (a === 'colors' && b !== 'accent2' && b in tokens.colors) (tokens.colors as Record<string, string>)[b] = String(w.to);
    else if (a === 'colors' && b === 'accent2' && look) look.accent2 = String(w.to);
    else if (a === 'fonts' && (b === 'display' || b === 'body')) tokens.fonts[b] = String(w.to);
    else if (w.slot === 'radius' && (w.to === 'none' || w.to === 'soft' || w.to === 'round')) tokens.radius = w.to;
    else if (w.slot === 'weights.display' && look && typeof w.to === 'number') look.weight = w.to;
    else if (w.slot === 'case' && look && (w.to === 'upper' || w.to === 'lower' || w.to === 'sentence')) look.case = w.to as typeof look.case;
  }
  return { ...spec, tokens, ...(look ? { look } : {}), version: spec.version + 1, reason: label, createdAt: Date.now() };
}

// ── graphics ──

function graphicSlots(g: GraphicState | undefined): Record<string, string | number | undefined> {
  const d = g?.doc;
  if (!d) return {};
  const out: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(d.tokens.colors)) out[`colors.${k}`] = v;
  if (d.tokens.accent2) out['colors.accent2'] = d.tokens.accent2;
  out['fonts.display'] = d.tokens.fonts.display;
  out['fonts.body'] = d.tokens.fonts.body;
  if (g?.direction?.look) {
    out['weights.display'] = g.direction.look.weight;
    out.case = g.direction.look.case;
  }
  const logo = d.artboards.flatMap((b) => b.children).find((n) => n.link?.startsWith('brand:'));
  if (logo) out.logo = logo.link!.slice(6);
  return out;
}

/** The bindings a graphic gets when it is linked: what its own token table set, recorded once (never matched again later). */
export function bindForBrand(doc: GraphicDoc, look?: { weight?: number; case?: 'sentence' | 'upper' | 'lower' }): DocBindings {
  return bindingsOf(doc, systemOfTokens(doc.tokens, { weight: look?.weight, case: look?.case })) as unknown as DocBindings;
}

/** Linked logo images moved to a new approved logo file, fitted in the same box; one the designer edited (resized out of proportion, cropped, recoloured) is kept and said. */
export function relinkBrandLogo(doc: GraphicDoc, c: SystemContent): { doc: GraphicDoc; updated: number; kept: string[] } {
  let updated = 0;
  const kept: string[] = [];
  const assets = new Map(doc.assets.map((a) => [a.id, a]));
  const added = new Map<string, ReturnType<typeof logoBoardAsset>>();
  const artboards = doc.artboards.map((b) => {
    const ground = typeof b.background === 'string' ? b.background : '#ffffff';
    const next = logoBoardAsset(c, ground);
    const children = b.children.map((n): Node => {
      if (n.type !== 'image' || !n.link?.startsWith('brand:')) return n;
      const img = n as ImageNode;
      if (!next || img.asset === next.id) return n;
      const was = assets.get(img.asset);
      const edited = !!img.crop || !!img.filter || !!img.adjust || (was && Math.abs(img.w / Math.max(1, img.h) - was.width / Math.max(1, was.height)) > 0.03);
      if (edited) {
        kept.push(`${img.name ?? 'A logo'} was edited in this design: kept as a local override`);
        return n;
      }
      added.set(next.id, next);
      updated++;
      const k = Math.min(img.w / next.width, img.h / next.height);
      const w = next.width * k;
      const h = next.height * k;
      return { ...img, asset: next.id, link: `brand:${next.id}`, x: img.x + (img.w - w) / 2, y: img.y + (img.h - h) / 2, w, h };
    });
    return { ...b, children };
  });
  if (!updated) return { doc, updated, kept };
  return { doc: { ...doc, artboards, assets: [...doc.assets.filter((a) => !added.has(a.id)), ...[...added.values()].filter((a): a is NonNullable<typeof a> => !!a)], revision: doc.revision + 1 }, updated, kept };
}

function applyGraphic(g: GraphicState, c: SystemContent, link: SystemLink, write: SlotChange[], label: string, measure?: Measure): { graphic: GraphicState; kept: { what: string; why: string }[]; updatedProps: number } {
  const doc0 = g.doc!;
  const look = g.direction?.look;
  const from = systemOfTokens(doc0.tokens, { weight: look?.weight, case: look?.case });
  const bindings = (g.bindings ?? bindForBrand(doc0, look)) as unknown as Bindings;
  const nextTokens = toGraphicTokens(c, { mode: link.mode, overrides: link.overrides });
  // only the slots planned to change move; a kept override keeps its old token value
  const tokens: Tokens = { colors: { ...doc0.tokens.colors }, fonts: { ...doc0.tokens.fonts }, ...(doc0.tokens.accent2 ? { accent2: doc0.tokens.accent2 } : {}) };
  for (const w of write) {
    const [a, b] = w.slot.split('.');
    if (a === 'colors' && b === 'accent2') tokens.accent2 = String(w.to);
    else if (a === 'colors') (tokens.colors as Record<string, string>)[b] = String(w.to);
    else if (a === 'fonts' && (b === 'display' || b === 'body')) tokens.fonts[b] = String(w.to);
  }
  void nextTokens;
  const weight = write.find((w) => w.slot === 'weights.display')?.to;
  const cs = write.find((w) => w.slot === 'case')?.to;
  const to = systemOfTokens(tokens, { weight: typeof weight === 'number' ? weight : look?.weight, case: (cs as 'sentence' | 'upper' | 'lower' | undefined) ?? look?.case });
  const pr = propagate(doc0, bindings, from, to, measure);
  let doc: GraphicDoc = { ...pr.doc, tokens };
  const kept = pr.kept.map((k) => ({ what: `${k.name} (${k.prop})`, why: k.why }));
  let logoNote: string[] = [];
  if (write.some((w) => w.slot === 'logo')) {
    const placed = placeBrandLogo(doc, c);
    doc = placed.doc;
    const re = relinkBrandLogo(doc, c);
    doc = re.doc;
    logoNote = re.kept;
  }
  kept.push(...logoNote.map((n) => ({ what: 'logo', why: n })));
  const versions = [...g.versions, { doc: doc0, label: `Before ${label}`, at: Date.now() }].slice(-MAX_GRAPHIC_VERSIONS);
  const direction = g.direction ? directionInBrand(c, g.direction, { mode: link.mode, overrides: link.overrides }) : g.direction;
  return { graphic: { ...g, doc, versions, direction, bindings: pr.bindings as unknown as DocBindings }, kept, updatedProps: pr.updated };
}

// ── boards ──

function boardSlots(b: BoardState | undefined): Record<string, string | number | undefined> {
  const s = b?.system;
  if (!s) return {};
  const out: Record<string, string | number | undefined> = {};
  for (const [k, v] of Object.entries(s.tokens.colors)) out[`colors.${k}`] = v;
  if (s.tokens.accent2) out['colors.accent2'] = s.tokens.accent2;
  out['fonts.display'] = s.tokens.fonts.display;
  out['fonts.body'] = s.tokens.fonts.body;
  out['weights.display'] = s.weights.display;
  out.case = s.type.case;
  if (s.logo?.asset) out.logo = s.logo.asset;
  return out;
}

function applyBoard(b: BoardState, c: SystemContent, link: SystemLink, version: number, label: string, keep: ReadonlySet<string>, measure?: Measure): { board: BoardState; entries: SyncEntry[]; summary: string } | { error: string } {
  if (!b.system) return { error: 'The board has no system yet.' };
  const logo = logoBoardAsset(c, b.system.tokens.colors.background);
  const next = toMasterSystem(c, b.system, { mode: link.mode, overrides: link.overrides, link: { id: link.id, version, name: c.identity.name }, ...(logo ? { assetId: logo.id } : {}) });
  // the board's own overrides of the system stay
  for (const slot of keep) {
    const [a, k] = slot.split('.');
    if (a === 'colors' && k === 'accent2') next.tokens.accent2 = b.system.tokens.accent2;
    else if (a === 'colors' && k in next.tokens.colors) (next.tokens.colors as Record<string, string>)[k] = (b.system.tokens.colors as Record<string, string>)[k];
    else if (a === 'fonts' && (k === 'display' || k === 'body')) next.tokens.fonts[k] = b.system.tokens.fonts[k];
    else if (slot === 'weights.display') next.weights.display = b.system.weights.display;
    else if (slot === 'case') next.type.case = b.system.type.case;
  }
  const ops: BoardOp[] = [];
  if (logo && !b.assets.some((a) => a.id === logo.id)) ops.push({ op: 'asset', asset: logo });
  const plan = syncSystem(b, next, { measure });
  ops.push(...plan.ops);
  const r = applyBoardOps(b, ops);
  if (!r.ok) return { error: r.error };
  let board = r.board;
  // the approved logo placed in materials that set the brand's name, and moved to a new file where it changed
  if (logo) {
    board = {
      ...board,
      materials: board.materials.map((m) => {
        if (m.type !== 'graphic' || !m.doc) return m;
        let doc = placeBrandLogo(m.doc, c).doc;
        doc = relinkBrandLogo(doc, c).doc;
        return doc === m.doc ? m : { ...m, doc, revision: m.revision + 1 };
      }),
    };
  }
  board = { ...board, versions: [...b.versions, { label: `Before ${label}`, at: Date.now(), state: snapshotOf(b) }].slice(-MAX_BOARD_VERSIONS) };
  return { board, entries: plan.entries, summary: plan.summary };
}

// ── the whole ──

/** Whether a project's design has a place for the brand's logo. */
function logoPlaceable(p: DesignProject, c: SystemContent): boolean {
  const name = c.identity.name.trim().toLowerCase();
  const docs = kindOfProject(p) === 'graphic' ? [p.graphic?.doc] : kindOfProject(p) === 'board' ? (p.board?.materials ?? []).map((m) => (m.type === 'graphic' ? m.doc : null)) : [];
  if (kindOfProject(p) === 'board') return true;
  return docs.some((d) => d?.artboards.some((b) => b.children.some((n) => n.link?.startsWith('brand:') || (n.type === 'text' && n.role === 'logo' && (n as { text: string }).text.trim().toLowerCase() === name))));
}

// a design holds the system as shared styles, not as slots: what it holds is what was applied, unless the person
// changed those styles (then every slot is theirs, and nothing would be written)
const slotsOf = (p: DesignProject) => (p.medium === 'design' ? { ...(p.systemLink?.applied ?? {}) } : slotsOfMedium(p));
const slotsOfMedium = (p: DesignProject) => (kindOfProject(p) === 'website' ? websiteSlots(p.specs[p.specIndex]) : kindOfProject(p) === 'graphic' ? graphicSlots(p.graphic) : boardSlots(p.board));

/**
 * A project linked to a system and brought into it (see the head of this file). `pin` 'latest' follows each published
 * version; a number stays on that version until changed.
 */
export function applySystem(p: DesignProject, rec: SystemRecord, opts: { pin?: number | 'latest'; mode?: string; overrides?: Record<string, TokenValue>; measure?: Measure; now?: number; parse?: Parse } = {}): { project: DesignProject; report: ApplyReport } {
  const kind = kindOfProject(p);
  const pin = opts.pin ?? p.systemLink?.pin ?? 'latest';
  const base = contentForLink(rec, pin);
  const now = opts.now ?? Date.now();
  const report: ApplyReport = { projectId: p.id, name: p.name, kind, outcome: 'error', version: 0, changed: [], kept: [], summary: '' };
  if (!base) return { project: p, report: { ...report, summary: `${rec.name} has no published version yet: publish it first. A draft never reaches a project.` } };
  const { content, version } = base;
  const prev = p.systemLink?.id === rec.id ? p.systemLink : undefined;
  const first = !prev;
  const link: SystemLink = { id: rec.id, name: rec.name, pin, version, ...(opts.mode ?? prev?.mode ? { mode: opts.mode ?? prev?.mode } : {}), overrides: opts.overrides ?? prev?.overrides ?? {}, applied: { ...(prev?.applied ?? {}) }, at: now };
  const next = productSlots(content, { mode: link.mode, overrides: link.overrides });
  const current = slotsOf(p);
  const planned = planSlots(prev?.applied ?? {}, current, next, first);
  const kept = planned.kept;
  // a logo is only "changed" where the design has a place for it (a linked logo, or the brand's name set as a logo)
  const write = planned.write.filter((w) => w.slot !== 'logo' || logoPlaceable(p, content));
  // what the project now holds from the system: every slot written or already equal; a slot kept as an override keeps
  // its previous applied value, so it stays recognised as the designer's
  const keptSlots = new Set(kept.map((k) => k.what));
  for (const [slot, to] of Object.entries(next)) if (!keptSlots.has(slot)) link.applied[slot] = to;
  const label = `${rec.name} v${version}`;
  let project: DesignProject = { ...p, systemLink: link, updatedAt: now };
  if (kind === 'website') {
    const spec = p.specs[p.specIndex];
    const ds = toWebsiteSystem(content, { mode: link.mode, overrides: link.overrides, link: { id: rec.id, version, name: rec.name } });
    if (p.brief.doc) project = { ...project, brief: { ...p.brief, doc: briefWithSystem(p.brief.doc, ds) } };
    if (spec && write.length) {
      const v = specWith(spec, write, `Applied ${label}`);
      const specs = capVersions([...p.specs.slice(0, p.specIndex + 1), v], p.keptVersions);
      project = { ...project, specs, specIndex: specs.length - 1 };
      report.before = `v${spec.version}`;
    }
    const outcome = spec ? (write.length ? (first ? 'applied' : 'updated') : 'unchanged') : 'linked';
    return { project, report: { ...report, outcome, version, changed: write, kept, summary: summaryOf(outcome, label, write, kept, spec ? '' : p.brief.doc ? 'The brief is built within it; the design will be too.' : 'It applies as soon as there is a brief.') } };
  }
  // a design written as HTML artboards takes the system at request time (lib/ux-v0/design/brand.ts): its tokens as
  // the shared styles of a design that has none, its rules in what the designer is told
  // A new version reaches the design's shared styles when they are the system's as applied before (or empty); styles
  // the person changed are theirs, kept and said.
  if (p.medium === 'design' && p.design) {
    const css = designCss(content);
    const was = prev ? contentForLink(rec, prev.version) : null;
    const tokens = p.design.doc.tokens.trim();
    const ours = !tokens || (!!was && tokens === designCss(was.content));
    const made = p.design.doc.artboards.length > 0;
    if (!ours) return { project, report: { ...report, outcome: 'linked', version, kept: [{ what: 'shared styles', why: 'changed in the design' }] as ApplyReport['kept'], summary: `Linked to ${label}. The design's shared styles were changed here, so they are kept; ask to bring them into the system.` } };
    if (tokens === css) return { project, report: { ...report, outcome: first ? 'linked' : 'unchanged', version, summary: first ? `Linked to ${label}: everything designed from now on is made within it.` : `Already on ${label}.` } };
    // approved or protected work is never changed by a system's update: nothing is applied, and it is said which
    // artboards hold it back (the person reopens them, or the project stays where it is)
    const held = protectedUnder(p.design.doc, css, opts.parse);
    if (held.length) {
      const names = held.map((a) => `“${a.name}”`);
      const list = names.length > 2 ? `${names.slice(0, 2).join(', ')} and ${names.length - 2} more` : names.join(' and ');
      return {
        project: p,
        report: {
          ...report,
          outcome: 'held',
          version: prev?.version ?? 0,
          kept: held.map((a) => ({ what: a.name, why: a.state === 'approved' ? 'approved' : 'protected' })),
          summary: `Not ${first ? 'applied' : 'updated'}: ${label} would change ${list}, which ${held.length === 1 ? 'is' : 'are'} ${held.every((a) => a.state === 'approved') ? 'approved' : 'approved or protected'}. Nothing was changed. Reopen ${held.length === 1 ? 'it' : 'them'} to bring ${held.length === 1 ? 'it' : 'them'} onto ${label}${prev ? `, or stay on v${prev.version}` : ''}.`,
        },
      };
    }
    const design = commitDesign(p.design, { ...p.design.doc, tokens: css }, `Applied ${label}`, 'model', now);
    project = { ...project, design };
    return { project, report: { ...report, outcome: first ? 'applied' : 'updated', version, before: `Before ${label}`, summary: `${first ? 'Linked to' : 'Updated to'} ${label}: its colours and type are the design's shared styles${made ? ', so every artboard that uses them follows' : ''}.` } };
  }
  if (kind === 'graphic') {
    if (!p.graphic?.doc) {
      const g = p.graphic ? { ...p.graphic, ...(p.graphic.direction ? { direction: directionInBrand(content, p.graphic.direction, { mode: link.mode, overrides: link.overrides }) } : {}) } : p.graphic;
      return { project: { ...project, ...(g ? { graphic: g } : {}) }, report: { ...report, outcome: 'linked', version, summary: `Linked to ${label}: the next composition is made in it.` } };
    }
    const r = applyGraphic(p.graphic, content, link, write, label, opts.measure);
    project = { ...project, graphic: r.graphic };
    const allKept = [...kept, ...r.kept];
    const outcome = write.length || r.updatedProps ? (first ? 'applied' : 'updated') : 'unchanged';
    return { project, report: { ...report, outcome, version, changed: write, kept: allKept, before: `Before ${label}`, summary: summaryOf(outcome, label, write, allKept, r.updatedProps ? `${plural(r.updatedProps, 'property', 'properties')} of the design followed.` : '') } };
  }
  if (!p.board?.system) return { project, report: { ...report, outcome: 'linked', version, summary: `Linked to ${label}: the board’s system will take its identity when it is made.` } };
  const r = applyBoard(p.board, content, link, version, label, keptSlots, opts.measure);
  if ('error' in r) return { project: p, report: { ...report, summary: r.error } };
  project = { ...project, board: r.board };
  const outcome = write.length ? (first ? 'applied' : 'updated') : 'unchanged';
  return { project, report: { ...report, outcome, version, changed: write, kept, materials: r.entries, before: `Before ${label}`, summary: `${summaryOf(outcome, label, write, kept, '')} ${r.summary}`.trim() } };
}

function summaryOf(outcome: ApplyReport['outcome'], label: string, write: SlotChange[], kept: { what: string; why: string }[], extra: string): string {
  const head = outcome === 'applied' ? `Applied ${label}` : outcome === 'updated' ? `Updated to ${label}` : outcome === 'unchanged' ? `Already in ${label}` : outcome === 'linked' ? `Linked to ${label}` : label;
  const parts = [head + (write.length ? `: ${plural(write.length, 'value')} changed (${write.slice(0, 4).map((w) => w.slot).join(', ')}${write.length > 4 ? '…' : ''}).` : '.')];
  if (kept.length) parts.push(`${plural(kept.length, 'override')} kept: ${kept.slice(0, 3).map((k) => k.what).join(', ')}${kept.length > 3 ? '…' : ''}.`);
  if (extra) parts.push(extra);
  return parts.join(' ');
}

/** What applying the system's latest published version (or `content`, for a draft preview) would change in a project. */
export function impactOn(p: DesignProject, rec: SystemRecord, content: SystemContent, version: number, opts: { measure?: Measure } = {}): ApplyReport {
  const kind = kindOfProject(p);
  const link = p.systemLink;
  const report: ApplyReport = { projectId: p.id, name: p.name, kind, outcome: 'not-linked', version, changed: [], kept: [], summary: '' };
  if (!link || link.id !== rec.id) return { ...report, summary: 'Not linked to this system: unchanged.' };
  if (link.pin !== 'latest' && link.pin !== version) return { ...report, outcome: 'pinned', summary: `Pinned to v${link.pin}: stays as it is until its pin changes.` };
  const next = productSlots(content, { mode: link.mode, overrides: link.overrides });
  const { write, kept } = planSlots(link.applied, slotsOf(p), next, false);
  let materials: SyncEntry[] | undefined;
  if (kind === 'board' && p.board?.system && write.length) {
    const nextSys = toMasterSystem(content, p.board.system, { mode: link.mode, overrides: link.overrides });
    materials = syncSystem(p.board, nextSys, { measure: opts.measure, annotate: false }).entries;
  }
  const outcome = write.length ? 'updated' : 'unchanged';
  return { ...report, outcome, changed: write, kept, ...(materials ? { materials } : {}), summary: summaryOf(outcome, `v${version}`, write, kept, materials ? `${materials.filter((m) => m.outcome === 'updated').length} of ${materials.length} materials would change.` : '') };
}

/** The latest published version carried into a linked project (unless it is pinned elsewhere). */
export function propagateTo(p: DesignProject, rec: SystemRecord, opts: { measure?: Measure; now?: number; parse?: Parse } = {}): { project: DesignProject; report: ApplyReport } {
  const link = p.systemLink;
  const latest = latestVersion(rec);
  const base: ApplyReport = { projectId: p.id, name: p.name, kind: kindOfProject(p), outcome: 'not-linked', version: latest?.n ?? 0, changed: [], kept: [], summary: 'Not linked to this system.' };
  if (!link || link.id !== rec.id || !latest) return { project: p, report: base };
  if (link.pin !== 'latest') return { project: p, report: { ...base, outcome: 'pinned', version: link.pin, summary: `Pinned to v${link.pin}${latest.n !== link.pin ? `; v${latest.n} is available` : ''}.` } };
  if (link.version === latest.n) return { project: p, report: { ...base, outcome: 'unchanged', summary: `Already on v${latest.n}.` } };
  return applySystem(p, rec, { pin: 'latest', measure: opts.measure, now: opts.now, parse: opts.parse });
}

/** The project put back as it was before an application or update (its saved version), and the link back on that version. */
export function undoApply(p: DesignProject, report: Pick<ApplyReport, 'before'> & { previous?: SystemLink }): { project: DesignProject; ok: boolean; error?: string } {
  const label = report.before;
  if (!label) return { project: p, ok: false, error: 'Nothing was saved before that change.' };
  const link = report.previous ?? undefined;
  if (kindOfProject(p) === 'website') {
    const n = Number(label.replace(/^v/, ''));
    const i = p.specs.findIndex((s) => s.version === n);
    if (i < 0) return { project: p, ok: false, error: 'That version is no longer kept.' };
    return { project: { ...p, specIndex: i, ...(link ? { systemLink: link } : {}), updatedAt: Date.now() }, ok: true };
  }
  // a design: the version before the one the system was applied in, committed again (its history kept)
  if (p.medium === 'design' && p.design) {
    const said = `Applied ${label.replace(/^Before /, '')}`;
    const i = p.design.versions.map((v) => v.said).lastIndexOf(said);
    if (i < 0) return { project: p, ok: false, error: 'That version is no longer kept.' };
    const doc = i > 0 ? p.design.versions[i - 1].doc : { ...p.design.versions[i].doc, tokens: '' };
    return { project: { ...p, design: commitDesign(p.design, doc, `Undone: ${label.replace(/^Before /, '')}`, 'person'), ...(link ? { systemLink: link } : {}), updatedAt: Date.now() }, ok: true };
  }
  if (kindOfProject(p) === 'graphic' && p.graphic) {
    const v = [...p.graphic.versions].reverse().find((x) => x.label === label);
    if (!v) return { project: p, ok: false, error: 'That version is no longer kept.' };
    return { project: { ...p, graphic: { ...p.graphic, doc: v.doc, versions: [...p.graphic.versions, { doc: p.graphic.doc!, label: `Undone: ${label.replace(/^Before /, '')}`, at: Date.now() }].slice(-MAX_GRAPHIC_VERSIONS) }, ...(link ? { systemLink: link } : {}), updatedAt: Date.now() }, ok: true };
  }
  if (p.board) {
    const v = [...p.board.versions].reverse().find((x) => x.label === label);
    if (!v) return { project: p, ok: false, error: 'That version is no longer kept.' };
    return { project: { ...p, board: { ...v.state, versions: p.board.versions }, ...(link ? { systemLink: link } : {}), updatedAt: Date.now() }, ok: true };
  }
  return { project: p, ok: false, error: 'Nothing to put back.' };
}

/** A project unlinked: it keeps everything it has, now its own to change. */
export function unlinkSystem(p: DesignProject): DesignProject {
  if (!p.systemLink) return p;
  const { systemLink, ...rest } = p;
  void systemLink;
  return { ...(rest as DesignProject), updatedAt: Date.now() };
}

/** A project's link pinned to a version, or set to follow the latest. */
export function setPin(p: DesignProject, pin: number | 'latest'): DesignProject {
  return p.systemLink ? { ...p, systemLink: { ...p.systemLink, pin }, updatedAt: Date.now() } : p;
}
