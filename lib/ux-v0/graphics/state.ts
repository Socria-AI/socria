// lib/ux-v0/graphics/state.ts — a graphics project's state as it is kept: the brief, the directions proposed, the
// approved one, the document, and its versions.
//
// A graphics project is a SocriaUX project like a website one (lib/ux-v0/types.ts DesignProject, kept in the browser
// first and, signed in, in the account): `medium: 'graphic'` and this state. Everything is held to its shape on the
// way in: the document by normalizeDoc, the directions field by field, the versions bounded (a project stays well
// under the account copy's size limit).

import { normalizeForm } from '../form';
import { colour, normalizeAsset, normalizeDoc, type Asset, type GraphicDoc } from './doc';
import { GRAPHIC_KINDS, type GraphicBrief, type GraphicDirection } from './compose';
import { formatOf } from './formats';
import { normalizeSelection } from './styles/blend';
import { normalizeGenerativeRequest } from './generative/record';

export interface GraphicVersion {
  doc: GraphicDoc;
  /** what made it */
  label: string;
  at: number;
}

export interface GraphicState {
  brief: GraphicBrief | null;
  /** the directions proposed for this graphic */
  options: GraphicDirection[];
  /** the approved one: its decisions hold through every composition and edit */
  direction: GraphicDirection | null;
  doc: GraphicDoc | null;
  /** named versions (each generation and each change in words), newest last */
  versions: GraphicVersion[];
  /** where the direction came from, when it is a website project's */
  source?: { projectId: string; name: string };
  /** the designer's pictures, added with the brief before there is a document (the document then carries them) */
  assets?: Asset[];
}

export const MAX_GRAPHIC_VERSIONS = 12;

const o = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
const a = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');

export function emptyGraphicState(): GraphicState {
  return { brief: null, options: [], direction: null, doc: null, versions: [] };
}

export function normalizeGraphicBrief(v: unknown): GraphicBrief | null {
  const r = o(v);
  const c = o(r.content);
  const headline = str(c.headline, 300).trim();
  if (!headline) return null;
  const strings = (x: unknown, n: number, max: number) =>
    a(x)
      .map((s) => str(s, max).trim())
      .filter(Boolean)
      .slice(0, n);
  const data = a(c.data)
    .map((d) => ({ label: str(o(d).label, 60).trim(), value: Number(o(d).value) }))
    .filter((d) => d.label && Number.isFinite(d.value))
    .slice(0, 40);
  return {
    purpose: str(r.purpose, 600),
    kind: (GRAPHIC_KINDS as readonly string[]).includes(r.kind) ? r.kind : 'poster',
    formats: strings(r.formats, 12, 40).filter((id) => !!formatOf(id)),
    content: {
      headline,
      ...(str(c.subhead, 300).trim() ? { subhead: str(c.subhead, 300).trim() } : {}),
      ...(str(c.body, 1200).trim() ? { body: str(c.body, 1200).trim() } : {}),
      ...(str(c.cta, 60).trim() ? { cta: str(c.cta, 60).trim() } : {}),
      ...(strings(c.meta, 6, 120).length ? { meta: strings(c.meta, 6, 120) } : {}),
      ...(str(c.brand, 80).trim() ? { brand: str(c.brand, 80).trim() } : {}),
      ...(strings(c.items, 12, 200).length ? { items: strings(c.items, 12, 200) } : {}),
      ...(data.length ? { data } : {}),
      ...(str(c.dataSource, 160).trim() ? { dataSource: str(c.dataSource, 160).trim() } : {}),
      ...(str(c.dataUnit, 6).trim() ? { dataUnit: str(c.dataUnit, 6).trim() } : {}),
    },
    mood: strings(r.mood, 12, 30),
    images: strings(r.images, 12, 60),
  };
}

export function normalizeGraphicDirection(v: unknown): GraphicDirection | null {
  const r = o(v);
  const t = o(r.tokens);
  const tc = o(t.colors);
  const name = str(r.name, 80).trim();
  if (!name) return null;
  const l = o(r.look);
  const form = r.form ? normalizeForm(r.form) : null;
  return {
    name,
    language: str(r.language, 40),
    ...(str(r.concept, 400) ? { concept: str(r.concept, 400) } : {}),
    tokens: {
      colors: {
        background: colour(tc.background, '#f5f2ea'),
        surface: colour(tc.surface, '#ffffff'),
        text: colour(tc.text, '#161512'),
        muted: colour(tc.muted, '#5d5a52'),
        accent: colour(tc.accent, '#2f3d1e'),
        accentText: colour(tc.accentText, '#ffffff'),
        line: colour(tc.line, '#d8d3c6'),
      },
      fonts: { display: str(o(t.fonts).display, 60) || 'Fraunces', body: str(o(t.fonts).body, 60) || 'Inter' },
      ...(colour(t.accent2, '') ? { accent2: colour(t.accent2, '') } : {}),
    },
    look: {
      case: l.case === 'upper' ? 'upper' : l.case === 'lower' ? 'lower' : 'sentence',
      tracking: ['tight', 'normal', 'wide'].includes(l.tracking) ? l.tracking : 'normal',
      weight: Math.max(100, Math.min(900, Math.round(Number(l.weight) / 100) * 100 || 600)),
      motifs: a(l.motifs).map((m) => str(m, 30)).filter(Boolean).slice(0, 12),
      ...(str(l.frame, 30) ? { frame: str(l.frame, 30) } : {}),
      ...(str(l.buttons, 30) ? { buttons: str(l.buttons, 30) } : {}),
      ...(typeof l.trackingValue === 'number' && Number.isFinite(l.trackingValue) ? { trackingValue: Math.max(-100, Math.min(400, Math.round(l.trackingValue))) } : {}),
      ...(typeof l.lineHeight === 'number' && Number.isFinite(l.lineHeight) ? { lineHeight: Math.max(0.7, Math.min(2, Math.round(l.lineHeight * 100) / 100)) } : {}),
    },
    form,
    ...(['orthogonal', 'diagonal', 'radial', 'scattered', 'layered'].includes(r.axis) ? { axis: r.axis } : {}),
    ...(['structural', 'editorial', 'quiet', 'functional'].includes(r.typeRole) ? { typeRole: r.typeRole } : {}),
    intensity: Math.max(0, Math.min(100, Math.round(Number(r.intensity) || 0))),
    // the design language it speaks, held to the styles SocriaUX has (an unknown one is dropped, the direction kept)
    ...((sel) => (sel ? { style: sel } : {}))(r.style ? normalizeSelection(r.style) : null),
    // what the generative engine is asked for (an interpretation's lead and seed), and the engine itself
    ...((g) => (g ? { generative: g } : {}))(r.generative ? normalizeGenerativeRequest(r.generative) : undefined),
    ...(r.engine === 'templates' ? { engine: 'templates' as const } : {}),
    ...(r.origin === 'generated' ? { origin: 'generated' as const } : {}),
  };
}

/** A graphics project's state held to its shape; undefined when there is none. */
export function normalizeGraphicState(v: unknown): GraphicState | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = o(v);
  const doc = r.doc ? normalizeDoc(r.doc) : null;
  const versions = a(r.versions)
    .map((x) => {
      const d = normalizeDoc(o(x).doc);
      return d ? { doc: d, label: str(o(x).label, 160) || 'A version', at: typeof o(x).at === 'number' ? Math.round(o(x).at) : Date.now() } : null;
    })
    .filter((x): x is GraphicVersion => !!x)
    .slice(-MAX_GRAPHIC_VERSIONS);
  return {
    brief: normalizeGraphicBrief(r.brief),
    options: a(r.options)
      .map(normalizeGraphicDirection)
      .filter((x): x is GraphicDirection => !!x)
      .slice(0, 6),
    direction: normalizeGraphicDirection(r.direction),
    doc,
    versions,
    ...(r.source && typeof r.source === 'object' && typeof o(r.source).projectId === 'string' ? { source: { projectId: str(o(r.source).projectId, 96), name: str(o(r.source).name, 100) } } : {}),
    ...((xs) => (xs.length ? { assets: xs } : {}))(
      a(r.assets)
        .map((x) => normalizeAsset(x))
        .filter((x): x is Asset => !!x)
        .filter((x, i, all) => all.findIndex((y) => y.id === x.id) === i)
        .slice(0, 24),
    ),
  };
}
