// lib/ux-v0/types.ts — SocriaUX v0: the shapes everything is passed in.
//
// One project holds one design and the reasoning about it: what the person
// wants (intent, discovery), the visual direction (moodboard), the agreed
// direction (brief), the design itself (an imported file, or a generated spec
// rendered by lib/ux-v0/render), and the reasoning cards attached to parts of
// it. Selections, cards and moodboard references are structured, never loose
// conversation text, so the model, the renderer and the canvas all read the
// same thing.
//
// Every normaliser here takes anything — a stored document, a request body, a
// model's output — and returns a value the rest of the code can trust, or a
// safe default. None of them throws. docs/SOCRIAUX-V0.md has the plan.

import { normalizeIntent, type DesignIntent } from './intent';
import { normalizeLayout, type LayoutDecisions } from './layout';
import { normalizeDesignSystem, type DesignSystem } from './design-system';
import { normalizeSystemLink, type SystemLink } from './dsi/link-schema';
import { normalizeStudio, type StudioState } from './studio/schema';
import { EMPTY_DIRECTION, normalizeDirectionState, type DirectionState } from './direction';
import { normalizeDNA, normalizeRefDna, type CreativeDNA, type RefDna } from './dna';
import { signatureOf, type DesignSignature } from './signature';
import { normalizeProc, procId, type ProcSpec } from './assets';
import { GRIDS, normalizeMotion, normalizeSpec, type DesignSpec, type Motion } from './spec';
import { bodyFont, displayFont } from './fonts';
import { normalizeGraphicState, type GraphicState } from './graphics/state';
import { normalizeBoard, type BoardState } from './boards/model';

// ── small helpers ────────────────────────────────────────────────────

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** A 32-hex id: an imported file's id doubles as its id in the private files bucket. */
export function fileId(): string {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});
export const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
export const str = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.replace(/\u0000/g, '').slice(0, max) : fallback);
export const clean = (v: unknown, max: number): string => str(v, max * 2).replace(/\s+/g, ' ').trim().slice(0, max);
export const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, n));
};
export const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => ((list as readonly string[]).includes(v as string) ? (v as T) : fallback);
export const idOf = (v: unknown, prefix: string): string => (typeof v === 'string' && /^[A-Za-z0-9:_.-]{1,96}$/.test(v) ? v : uid(prefix));
export const time = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : fallback);
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const hex = (v: unknown): string | null => {
  if (typeof v !== 'string' || !HEX.test(v.trim())) return null;
  const h = v.trim().toLowerCase();
  return h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h;
};
const strings = (v: unknown, n: number, max: number): string[] =>
  arr(v)
    .map((x) => clean(x, max))
    .filter(Boolean)
    .slice(0, n);
/** An https URL, as a provider returned it — never one assembled from model text. */
export const httpsUrl = (v: unknown): string => (typeof v === 'string' && /^https:\/\/[^\s"'<>]{4,2000}$/.test(v) ? v : '');

// ── vocabulary ───────────────────────────────────────────────────────

export type ProjectMode = 'create' | 'critique';
export type ArtifactKind = 'html' | 'png' | 'jpg' | 'svg';
export type Viewport = 'desktop' | 'tablet' | 'mobile';
export const VIEWPORTS: readonly Viewport[] = ['desktop', 'tablet', 'mobile'];
export const VIEWPORT_WIDTH: Record<Viewport, number> = { desktop: 1440, tablet: 834, mobile: 390 };

export const LIMITS = {
  name: 80,
  intent: 1200,
  answer: 800,
  comment: 2000,
  questions: 24,
  cards: 120,
  turns: 12,
  refs: 160,
  seen: 2000,
  specs: 30,
  crop: 260_000,
  thumb: 120_000,
  htmlBytes: 2_000_000,
  svgBytes: 2_000_000,
  imageBytes: 15_000_000,
} as const;

// ── imported and generated designs ───────────────────────────────────

export interface ImportedArtifact {
  type: 'imported';
  /** 32 hex characters: also the file's id in the private files bucket when synced */
  id: string;
  kind: ArtifactKind;
  name: string;
  bytes: number;
  /** natural size for images; for HTML the page's measured size at the current viewport */
  width: number;
  height: number;
  /** HTML only: the page's own scripts run (inside the same sandbox) */
  runScripts: boolean;
  /** where the original is kept */
  kept: 'device' | 'account' | 'failed';
  /** resources the page asked for that could not load */
  missing: string[];
  /** a text reading of the design: the page's outline (HTML, made locally) or the model's one-time read (images) */
  summary: string;
  createdAt: number;
}

export interface GeneratedArtifact {
  type: 'generated';
  createdAt: number;
}

export type Artifact = ImportedArtifact | GeneratedArtifact;

// ── selections ───────────────────────────────────────────────────────

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** One element of a rendered page, as the inspector inside the sandbox read it. */
export interface ElementCapture {
  tag: string;
  role: string;
  /** accessible name */
  name: string;
  /** visible text, trimmed */
  text: string;
  /** a readable chain: "main > section.hero > a.btn" */
  path: string;
  /** a structural selector that finds the element again */
  selector: string;
  attrs: Record<string, string>;
  styles: Record<string, string>;
  box: Box;
  /** the colour the element's text actually sits on, when it can be known */
  background: string;
  /** the nearest section's heading */
  section: string;
  /** generated designs: the spec section and field this element came from */
  ux: { section: string; path: string } | null;
  parent: string;
  siblings: number;
  children: number;
  interactive: boolean;
}

export interface Measured {
  id: string;
  label: string;
  value: string;
  ok: boolean;
  principle: string;
}

export interface SelectionContext {
  id: string;
  type: 'element' | 'region';
  /** the imported file's id, or "generated" */
  artifactId: string;
  viewport: Viewport | null;
  element: ElementCapture | null;
  region: { box: Box; elements: ElementCapture[]; container: string } | null;
  /** images: the selected area, downscaled; the model sees this instead of the whole image */
  crop: { dataUrl: string; box: Box } | null;
  /** short text: where this sits in the design */
  surrounding: string;
  measured: Measured[];
  /** how the selection is named everywhere: "Button “Book a table”", "Area 412 × 180" */
  label: string;
  createdAt: number;
}

// ── reasoning cards ──────────────────────────────────────────────────

export type Verdict = 'works' | 'mixed' | 'problem' | 'unclear';
export const VERDICTS: readonly Verdict[] = ['works', 'mixed', 'problem', 'unclear'];

export interface Reasoning {
  /** what it sees, grounded in the selection */
  read: string;
  verdict: Verdict;
  questions: string[];
  principles: { name: string; applies: string }[];
  issues: { text: string; evidence: string }[];
  alternatives: { text: string; tradeoff: string }[];
  /** one quiet line on what the reasoning rests on */
  basis: string;
}

export interface Usage {
  model: string;
  /** every input token billed, the cached ones included */
  input: number;
  /** of `input`, the ones the provider read from its prompt cache (billed at its cached price) */
  cached: number;
  /** every output token billed, the reasoning included */
  output: number;
  /** of `output`, the ones spent reasoning, when the provider says (never shown to anyone, but billed) */
  reasoning?: number;
  /** US$; null when the model has no published price */
  cost: number | null;
  /** the stage and tier the call was routed to, and its reasoning effort (lib/ux-v0/model.ts routeFor) */
  stage?: CallKind;
  tier?: 'economy' | 'premium';
  effort?: string;
  /** the operation's time on the server, from its arrival to its answer (ms, measured) */
  ms?: number;
}

export interface CardTurn {
  id: string;
  comment: string;
  reasoning: Reasoning | null;
  /** a turn whose reasoning could not be had keeps the comment, with why */
  error: string;
  usage: Usage | null;
  createdAt: number;
}

export interface ReasoningCard {
  id: string;
  /** the pin's number on the canvas */
  n: number;
  selection: SelectionContext;
  turns: CardTurn[];
  state: 'open' | 'kept' | 'dismissed';
  createdAt: number;
  updatedAt: number;
}

// ── the moodboard ────────────────────────────────────────────────────

export type MoodCategory = 'imagery' | 'texture' | 'composition';
export const MOOD_CATEGORIES: readonly MoodCategory[] = ['imagery', 'texture', 'composition'];
// The picture libraries a moodboard reference was found in. 'openverse' is kept only so that references saved before
// the Openverse integration was removed still read back: nothing in SocriaUX calls Openverse any more (research now
// goes through the workspace's configured search provider, lib/ux-v0/research/providers-server.ts).
export type Provider = 'unsplash' | 'openverse' | 'pexels';
export const PROVIDERS: readonly Provider[] = ['unsplash', 'openverse', 'pexels'];
export type RefState = 'proposed' | 'kept' | 'rejected';

/**
 * What a reference is for. A photograph may be kept for its light, a spread
 * for its typography, a building for its composition, a clip for its pacing:
 * the designer says which (or SocriaUX reads it from their note), and only
 * that is taken from it. "imagery" is the subject itself.
 */
export const REF_ASPECTS = ['atmosphere', 'colour', 'typography', 'composition', 'imagery', 'texture', 'motion'] as const;
export type RefAspect = (typeof REF_ASPECTS)[number];

export interface MoodboardRef {
  /** provider:id (an upload: upload:<file id>) */
  id: string;
  /** a licensed library, the designer's own upload (kept in this browser's file store), or a picture SocriaUX made for this project (lib/ux-v0/assets.ts) */
  provider: Provider | 'upload' | 'socriaux';
  providerId: string;
  url: string;
  thumb: string;
  width: number;
  height: number;
  /** the provider's dominant colour, when it gives one */
  color: string | null;
  title: string;
  creator: string;
  creatorUrl: string;
  sourceUrl: string;
  license: string;
  licenseUrl: string;
  /** the credit line, ready to print */
  attribution: string;
  /** Unsplash: the endpoint its guidelines ask to be told when a photo is used */
  downloadPing: string;
  category: MoodCategory;
  query: string;
  state: RefState;
  addedAt: number;
  /** what to take from it; none means its overall atmosphere */
  take?: RefAspect[];
  /** what to leave behind: "this typography, not the palette" */
  leave?: RefAspect[];
  /** a reference to steer away from */
  avoid?: boolean;
  /** a key reference: it counts most */
  key?: boolean;
  /** the designer's own words about it */
  note?: string;
  /**
   * The picture may appear in the design itself. References inspire; only a
   * picture the designer marks as content is placed on the page. (Absent on
   * references kept before the distinction existed, which stay usable.)
   */
  asContent?: boolean;
  /** colours sampled from it, most present first */
  swatches?: string[];
  /** an upload can be a picture or a moving reference (a clip or an animated GIF) */
  media?: 'image' | 'video';
  /** its design DNA, measured from its pixels (lib/ux-v0/ref-dna.ts) and kept so it is never measured again */
  dna?: RefDna;
  /** a picture SocriaUX made: its recipe (drawn wherever it is shown, never stored as pixels) */
  proc?: ProcSpec;
  /** why a made picture exists: the part that asked for it */
  reason?: string;
  /** where its subject is, as a share of its width and height (0–100): what stays in view however it is cropped */
  focus?: { x: number; y: number };
}

export interface Palette {
  id: string;
  name: string;
  colors: { hex: string; role: string }[];
  state: RefState;
}

export interface TypePair {
  id: string;
  display: string;
  body: string;
  note: string;
  state: RefState;
}

export interface MoodQuery {
  category: MoodCategory;
  query: string;
  /** the next page to ask for: a replacement or "more" never repeats */
  page: number;
}

export interface Moodboard {
  refs: MoodboardRef[];
  /** every reference id ever shown in this project, so nothing comes back */
  seen: string[];
  queries: MoodQuery[];
  palettes: Palette[];
  type: TypePair[];
}

// ── discovery ────────────────────────────────────────────────────────

export type Topic = 'audience' | 'needs' | 'objective' | 'brand' | 'visual' | 'functionality' | 'hierarchy' | 'constraints' | 'content' | 'platform';
export const TOPICS: readonly Topic[] = ['audience', 'needs', 'objective', 'brand', 'visual', 'functionality', 'hierarchy', 'constraints', 'content', 'platform'];
export const TOPIC_LABEL: Record<Topic, string> = {
  audience: 'Audience',
  needs: 'User needs',
  objective: 'Objective',
  brand: 'Brand',
  visual: 'Visual direction',
  functionality: 'Functionality',
  hierarchy: 'Hierarchy',
  constraints: 'Constraints',
  content: 'Content',
  platform: 'Platform',
};

export interface DiscoveryQuestion {
  id: string;
  topic: Topic;
  question: string;
  why: string;
  options: string[];
  multi: boolean;
  answer: string;
  skipped: boolean;
  /** left to SocriaUX: "you decide" */
  delegated?: boolean;
  askedAt: number;
}

export interface Understanding {
  summary: string;
  known: Partial<Record<Topic, string>>;
  gaps: Topic[];
}

export interface Discovery {
  questions: DiscoveryQuestion[];
  understanding: Understanding;
  ready: boolean;
  /** one sentence reflecting back what is now understood */
  note: string;
}

// ── the brief ────────────────────────────────────────────────────────

export type PaletteRole = 'background' | 'surface' | 'text' | 'muted' | 'accent' | 'accent-text' | 'line';
export const PALETTE_ROLES: readonly PaletteRole[] = ['background', 'surface', 'text', 'muted', 'accent', 'accent-text', 'line'];
export type PageType = 'website' | 'app-screen';
export type Platform = 'web' | 'mobile';

// ── the brief as a creative specification ────────────────────────────

/** The parts of a brief a decision can be made about. */
export const BRIEF_PARTS = ['audience', 'experience', 'personality', 'colour', 'typography', 'layout', 'imagery', 'motion', 'function', 'accessibility', 'responsive', 'rules'] as const;
export type BriefPart = (typeof BRIEF_PARTS)[number];
/**
 * Where a decision stands. Proposed: SocriaUX suggested it. Approved: the
 * designer agrees (and the model is told so). Locked: a rule, applied to every
 * direction and never changed by SocriaUX. Delegated: SocriaUX decides.
 */
export const DECISIONS = ['proposed', 'approved', 'locked', 'delegated'] as const;
export type Decision = (typeof DECISIONS)[number];

/** Exact specifications, for a designer who wants them. Each one reaches the look the renderer draws. */
export interface BriefSpec {
  /** the modular type scale: each step is this times the one below */
  ratio?: number;
  density?: 'compact' | 'comfortable' | 'spacious';
  grid?: (typeof GRIDS)[number];
  width?: 'narrow' | 'standard' | 'wide';
  corners?: 'none' | 'soft' | 'round';
  motion?: Motion;
  /** the contrast every text must reach: AA 4.5:1, AAA 7:1 */
  contrast?: 'AA' | 'AAA';
}

export interface DesignBrief {
  objective: string;
  audience: string;
  userGoals: string[];
  personality: string[];
  visualDirection: string;
  palette: { name: string; hex: string; role: PaletteRole }[];
  typography: { display: string; body: string; rationale: string };
  layoutDirection: string;
  functionalRequirements: string[];
  /** moodboard reference ids the design should draw on */
  references: string[];
  openQuestions: string[];
  pageType: PageType;
  platform: Platform;
  /** how it should feel to use, in a sentence */
  experience?: string;
  /** where each decision stands */
  decisions?: Partial<Record<BriefPart, Decision>>;
  /** hard rules the design must follow; everything else is a preference */
  rules?: string[];
  accessibility?: string[];
  responsive?: string[];
  spec?: BriefSpec;
  /** what is being made (lib/ux-v0/intent.ts): the experience, its task and its requirements, with stable ids */
  intent?: DesignIntent;
  /** the layout decisions (lib/ux-v0/layout.ts): what leads, the arrangement, the alignment, the pictures; the rest varies */
  layout?: LayoutDecisions;
  /** the designer's own design system (lib/ux-v0/design-system.ts): built within, checked against */
  system?: DesignSystem;
  /** optional parts the designer added to the brief */
  parts?: BriefPart[];
}

// ── usage ────────────────────────────────────────────────────────────

export type CallKind = 'discover' | 'direction' | 'brief' | 'refine-brief' | 'art-direction' | 'generate' | 'refine' | 'critique' | 'creative-edit' | 'studio-questions' | 'image';
export const CALL_KINDS: readonly CallKind[] = ['discover', 'direction', 'brief', 'refine-brief', 'art-direction', 'generate', 'refine', 'critique', 'creative-edit', 'studio-questions', 'image'];

/** What each stage is, in words, for the cost panel, the settings and the report. */
export const STAGE_LABEL: Record<CallKind, string> = {
  discover: 'Questions',
  direction: 'Moodboard direction',
  brief: 'Brief',
  'refine-brief': 'Brief revision',
  'art-direction': 'Art direction',
  generate: 'Generation',
  refine: 'Refinement',
  critique: 'Critique',
  'creative-edit': 'Creative change',
  'studio-questions': 'Creative questions',
  // a picture made by an image model (lib/ux-v0/image-gen-server.ts): priced and capped apart from the text stages
  image: 'Images',
};

export interface StageSpend {
  calls: number;
  /** US$, as the provider reported it (measured) */
  cost: number;
  /** of those calls, how many ran on the premium model */
  premium: number;
  /** the time they took on the server (ms, measured; from when it was recorded) */
  ms?: number;
}

export interface UsageTotals {
  calls: number;
  input: number;
  output: number;
  cost: number;
  /** of `input`, read from the provider's prompt cache; of `output`, spent reasoning (measured, when reported) */
  cached?: number;
  reasoning?: number;
  /** what each stage cost: the questions, the brief, art direction, generation… (measured) */
  byStage?: Partial<Record<CallKind, StageSpend>>;
  /** the design versions the designer accepted by downloading them: cost per accepted design is cost / accepted */
  accepted?: number[];
  /** the time the calls took on the server (ms, measured; from when it was recorded) */
  ms?: number;
}

// ── the project ──────────────────────────────────────────────────────

export interface DesignProject {
  v: 1;
  id: string;
  name: string;
  mode: ProjectMode;
  intent: string;
  discovery: Discovery;
  moodboard: Moodboard;
  brief: { doc: DesignBrief | null; approved: boolean; version: number };
  /** the art direction: proposed options, the designer's notes and locks, and the one approved (lib/ux-v0/direction.ts) */
  direction: DirectionState;
  /** the Creative DNA (lib/ux-v0/dna.ts): derived from the brief and references, set and locked by the designer */
  dna?: CreativeDNA;
  /** generated designs: every version, newest last; specIndex is the one shown */
  specs: DesignSpec[];
  specIndex: number;
  /** compositions the designer set aside while exploring (their arrangement signatures): not proposed again */
  compositions?: { rejected: string[] };
  /** the scoped edits made in words: how many, and how many tried to change more than was asked (put back) */
  edits?: { edits: number; confined: number };
  /** versions the designer chose to keep: never let go when older versions are (lib/ux-v0/history.ts) */
  keptVersions?: number[];
  /** what is being made: a website (the default), a graphic (lib/ux-v0/graphics), or a board of many materials in one
   * design system (lib/ux-v0/boards) */
  medium?: 'website' | 'graphic' | 'board';
  /** a graphic's brief, directions, document and versions (lib/ux-v0/graphics/state.ts) */
  graphic?: GraphicState;
  /** a board: its request, its Master Design System, its materials, what is on its canvas (lib/ux-v0/boards/model.ts) */
  board?: BoardState;
  /** the registry design system it is built in (lib/ux-v0/dsi): which version, pinned or following, and its overrides */
  systemLink?: SystemLink;
  /** the studio conversation it was begun in (lib/ux-v0/studio): what was asked for, every decision since, the
   * conversation itself; read by the workspace the work continues in */
  studio?: StudioState;
  artifact: Artifact | null;
  cards: ReasoningCard[];
  usage: UsageTotals;
  viewport: Viewport;
  createdAt: number;
  updatedAt: number;
}

export interface ProjectSummary {
  id: string;
  name: string;
  mode: ProjectMode;
  /** a graphic, not a website: what kind of graphic (poster, carousel, cover, …) */
  graphic?: string;
  /** a board, not a website: how many materials it holds */
  board?: number;
  intent: string;
  updatedAt: number;
  cards: number;
  hasDesign: boolean;
  /** what the home's wall label says about it */
  createdAt: number;
  /** how far it has come: questions, a brief, a direction, a design (or an imported file) */
  stage: 'begun' | 'discovery' | 'brief' | 'direction' | 'design' | 'imported';
  /** versions of the generated design */
  versions: number;
  /** a website or an app screen, once there is a brief */
  pageType: PageType | null;
  /** an imported file's kind */
  medium: ArtifactKind | null;
  /** its design's signature, so a new design can be checked against it (lib/ux-v0/signature.ts) */
  signature?: DesignSignature;
  /** the art direction the design follows */
  direction: string;
  /** up to three kept moodboard thumbnails: the studies behind a work in progress */
  studies: string[];
  /** begun in the studio: its kind, and whether it is still in conversation */
  studio?: { mode: StudioState['mode']; status: StudioState['status'] };
}

// ── normalisers ──────────────────────────────────────────────────────

const box = (v: unknown): Box => {
  const r = obj(v);
  return { x: num(r.x, -1e5, 1e5, 0), y: num(r.y, -1e5, 1e6, 0), w: num(r.w, 0, 1e5, 0), h: num(r.h, 0, 1e6, 0) };
};

const record = (v: unknown, keys: number, max: number): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [k, val] of Object.entries(obj(v)).slice(0, keys)) {
    if (/^[a-z][a-z0-9-]{0,40}$/i.test(k) && typeof val === 'string') out[k] = val.slice(0, max);
  }
  return out;
};

export function normalizeCapture(v: unknown): ElementCapture {
  const r = obj(v);
  const ux = obj(r.ux);
  return {
    tag: clean(r.tag, 24).toLowerCase() || 'div',
    role: clean(r.role, 32),
    name: clean(r.name, 200),
    text: clean(r.text, 400),
    path: clean(r.path, 240),
    selector: str(r.selector, 600),
    attrs: record(r.attrs, 16, 300),
    styles: record(r.styles, 32, 160),
    box: box(r.box),
    background: clean(r.background, 60),
    section: clean(r.section, 120),
    ux: typeof ux.section === 'string' && ux.section ? { section: clean(ux.section, 64), path: clean(ux.path, 120) } : null,
    parent: clean(r.parent, 160),
    siblings: num(r.siblings, 0, 1e4, 0),
    children: num(r.children, 0, 1e4, 0),
    interactive: r.interactive === true,
  };
}

const normalizeMeasured = (v: unknown): Measured | null => {
  const r = obj(v);
  const label = clean(r.label, 80);
  if (!label) return null;
  return { id: clean(r.id, 40) || 'fact', label, value: clean(r.value, 120), ok: r.ok !== false, principle: clean(r.principle, 80) };
};

// ── the selection's budget ───────────────────────────────────────────
//
// A selection is context for reasoning, not a copy of the page: under 6 KB
// (the crop image aside) whatever the frame sent. Trimmed in steps — the
// styles that matter for design, then shorter text and attributes, then fewer
// elements in an area — and only as far as it must. Facts are measured before
// this, so nothing measured is lost.

export const SELECTION_BUDGET = 6000;
const DESIGN_STYLES = ['color', 'background-color', 'font-family', 'font-size', 'font-weight', 'line-height', 'border-radius', 'display'];
const sizeOf = (s: SelectionContext) => JSON.stringify(s.crop ? { ...s, crop: null } : s).length;

function lighten(c: ElementCapture, level: number): ElementCapture {
  const styles = Object.fromEntries(
    Object.entries(c.styles)
      .filter(([k]) => DESIGN_STYLES.includes(k))
      .map(([k, v]) => [k, level < 2 ? v : v.slice(0, 48)])
  );
  const attrs = Object.fromEntries(
    Object.entries(c.attrs)
      .slice(0, level < 2 ? 16 : 6)
      .map(([k, v]) => [k, level < 2 ? v : v.slice(0, 100)])
  );
  return { ...c, styles, attrs, text: level < 2 ? c.text : c.text.slice(0, level < 3 ? 160 : 80), name: level < 3 ? c.name : c.name.slice(0, 80), path: level < 3 ? c.path : c.path.slice(-120) };
}

export function fitSelection(s: SelectionContext): SelectionContext {
  let out = s;
  for (let level = 1; level <= 3 && sizeOf(out) > SELECTION_BUDGET; level++) {
    out = {
      ...out,
      element: s.element ? lighten(s.element, level) : null,
      region: s.region ? { ...s.region, elements: s.region.elements.map((e) => lighten(e, level)) } : null,
    };
  }
  while (sizeOf(out) > SELECTION_BUDGET && out.region && out.region.elements.length > 3) {
    out = { ...out, region: { ...out.region, elements: out.region.elements.slice(0, -1) } };
  }
  return out;
}

export function normalizeSelection(v: unknown): SelectionContext | null {
  const r = obj(v);
  const type = oneOf(r.type, ['element', 'region'] as const, 'element');
  const element = r.element ? normalizeCapture(r.element) : null;
  const rg = obj(r.region);
  const region = r.region
    ? { box: box(rg.box), elements: arr(rg.elements).slice(0, 12).map(normalizeCapture), container: clean(rg.container, 160) }
    : null;
  const cp = obj(r.crop);
  const crop =
    typeof cp.dataUrl === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(cp.dataUrl) && cp.dataUrl.length <= LIMITS.crop
      ? { dataUrl: cp.dataUrl, box: box(cp.box) }
      : null;
  if (type === 'element' && !element) return null;
  if (type === 'region' && !region) return null;
  return fitSelection({
    id: idOf(r.id, 'sel'),
    type,
    artifactId: clean(r.artifactId, 64) || 'generated',
    viewport: r.viewport == null ? null : oneOf(r.viewport, VIEWPORTS, 'desktop'),
    element,
    region,
    crop,
    surrounding: clean(r.surrounding, 600),
    measured: arr(r.measured).map(normalizeMeasured).filter((m): m is Measured => !!m).slice(0, 12),
    label: clean(r.label, 140) || (type === 'region' ? 'Area' : 'Element'),
    createdAt: time(r.createdAt, Date.now()),
  });
}

export function normalizeReasoning(v: unknown): Reasoning | null {
  const r = obj(v);
  const read = clean(r.read, 900);
  if (!read) return null;
  return {
    read,
    verdict: oneOf(r.verdict, VERDICTS, 'unclear'),
    questions: strings(r.questions, 2, 300),
    principles: arr(r.principles)
      .map(obj)
      .map((p) => ({ name: clean(p.name, 60), applies: clean(p.applies, 400) }))
      .filter((p) => p.name && p.applies)
      .slice(0, 3),
    issues: arr(r.issues)
      .map(obj)
      .map((p) => ({ text: clean(p.text, 400), evidence: clean(p.evidence, 200) }))
      .filter((p) => p.text)
      .slice(0, 3),
    alternatives: arr(r.alternatives)
      .map(obj)
      .map((p) => ({ text: clean(p.text, 400), tradeoff: clean(p.tradeoff, 300) }))
      .filter((p) => p.text)
      .slice(0, 3),
    basis: clean(r.basis, 200),
  };
}

export function normalizeUsage(v: unknown): Usage | null {
  const r = obj(v);
  if (!r.model) return null;
  return {
    model: clean(r.model, 60),
    input: num(r.input, 0, 1e8, 0),
    cached: num(r.cached, 0, 1e8, 0),
    output: num(r.output, 0, 1e8, 0),
    ...(typeof r.reasoning === 'number' && r.reasoning > 0 ? { reasoning: num(r.reasoning, 0, 1e8, 0) } : {}),
    cost: typeof r.cost === 'number' && Number.isFinite(r.cost) && r.cost >= 0 ? r.cost : null,
    ...((CALL_KINDS as readonly string[]).includes(r.stage as string) ? { stage: r.stage as CallKind } : {}),
    ...(r.tier === 'economy' || r.tier === 'premium' ? { tier: r.tier } : {}),
    ...(typeof r.effort === 'string' && /^[a-z]{2,8}$/.test(r.effort) ? { effort: r.effort } : {}),
    ...(typeof r.ms === 'number' && r.ms > 0 ? { ms: num(r.ms, 0, 6e5, 0) } : {}),
  };
}

const normalizeTurn = (v: unknown): CardTurn | null => {
  const r = obj(v);
  const comment = str(r.comment, LIMITS.comment).trim();
  if (!comment) return null;
  return {
    id: idOf(r.id, 't'),
    comment,
    reasoning: normalizeReasoning(r.reasoning),
    error: clean(r.error, 300),
    usage: normalizeUsage(r.usage),
    createdAt: time(r.createdAt, Date.now()),
  };
};

export function normalizeCard(v: unknown): ReasoningCard | null {
  const r = obj(v);
  const selection = normalizeSelection(r.selection);
  const turns = arr(r.turns).map(normalizeTurn).filter((t): t is CardTurn => !!t).slice(0, LIMITS.turns);
  if (!selection || !turns.length) return null;
  const now = Date.now();
  return {
    id: idOf(r.id, 'card'),
    n: num(r.n, 1, 9999, 1),
    selection,
    turns,
    state: oneOf(r.state, ['open', 'kept', 'dismissed'] as const, 'open'),
    createdAt: time(r.createdAt, now),
    updatedAt: time(r.updatedAt, now),
  };
}

/** A focal point held to the picture: whole percentages; the centre is no focal point at all. */
function focusOf(v: unknown): { focus?: { x: number; y: number } } {
  const f = obj(v);
  if (typeof f.x !== 'number' || typeof f.y !== 'number' || !Number.isFinite(f.x) || !Number.isFinite(f.y)) return {};
  const x = Math.max(0, Math.min(100, Math.round(f.x)));
  const y = Math.max(0, Math.min(100, Math.round(f.y)));
  return x === 50 && y === 50 ? {} : { focus: { x, y } };
}

export function normalizeRef(v: unknown): MoodboardRef | null {
  const r = obj(v);
  // a picture SocriaUX made: its recipe is the picture; its id is the recipe's
  if (r.provider === 'socriaux') {
    const proc = normalizeProc(r.proc);
    if (!proc) return null;
    const providerId = procId(proc);
    return {
      id: `socriaux:${providerId}`,
      provider: 'socriaux',
      providerId,
      proc,
      url: '',
      thumb: '',
      width: num(r.width, 0, 100000, 0),
      height: num(r.height, 0, 100000, 0),
      color: hex(r.color),
      title: clean(r.title, 200) || 'Made by SocriaUX',
      creator: 'SocriaUX',
      creatorUrl: '',
      sourceUrl: '',
      license: 'Made by SocriaUX for this project (no third-party rights)',
      licenseUrl: '',
      attribution: 'Made by SocriaUX for this project',
      downloadPing: '',
      category: oneOf(r.category, MOOD_CATEGORIES, 'imagery'),
      query: '',
      state: oneOf(r.state, ['proposed', 'kept', 'rejected'] as const, 'kept'),
      addedAt: time(r.addedAt, Date.now()),
      asContent: r.asContent !== false,
      ...(clean(r.reason, 200) ? { reason: clean(r.reason, 200) } : {}),
      ...focusOf(r.focus),
      ...(r.key === true ? { key: true } : {}),
      ...((dna) => (dna ? { dna } : {}))(normalizeRefDna(r.dna)),
    };
  }
  const upload = r.provider === 'upload';
  const provider: MoodboardRef['provider'] = upload ? 'upload' : oneOf(r.provider, PROVIDERS, 'openverse');
  // an upload's picture lives in this browser's file store, found by its id; its address is made when it is shown
  const url = upload ? '' : httpsUrl(r.url);
  const providerId = upload ? (typeof r.providerId === 'string' && /^[a-f0-9]{32}$/.test(r.providerId) ? r.providerId : '') : clean(r.providerId, 80);
  if ((!url && !upload) || !providerId) return null;
  const aspects = (x: unknown): RefAspect[] => [...new Set(arr(x).filter((a): a is RefAspect => (REF_ASPECTS as readonly string[]).includes(a as string)))];
  const take = aspects(r.take);
  const leave = aspects(r.leave).filter((a) => !take.includes(a));
  const swatches = arr(r.swatches).map(hex).filter((x): x is string => !!x).slice(0, 6);
  return {
    ...(take.length ? { take } : {}),
    ...(leave.length ? { leave } : {}),
    ...(r.avoid === true ? { avoid: true } : {}),
    ...(r.key === true ? { key: true } : {}),
    ...(clean(r.note, 400) ? { note: clean(r.note, 400) } : {}),
    ...(typeof r.asContent === 'boolean' ? { asContent: r.asContent } : {}),
    ...(swatches.length ? { swatches } : {}),
    ...(r.media === 'video' ? { media: 'video' as const } : {}),
    ...((dna) => (dna ? { dna } : {}))(normalizeRefDna(r.dna)),
    ...focusOf(r.focus),
    id: `${provider}:${providerId}`,
    provider,
    providerId,
    url,
    thumb: upload ? '' : httpsUrl(r.thumb) || url,
    width: num(r.width, 0, 100000, 0),
    height: num(r.height, 0, 100000, 0),
    color: hex(r.color),
    title: clean(r.title, 200),
    creator: clean(r.creator, 120),
    creatorUrl: httpsUrl(r.creatorUrl),
    sourceUrl: httpsUrl(r.sourceUrl),
    license: clean(r.license, 80),
    licenseUrl: httpsUrl(r.licenseUrl),
    attribution: clean(r.attribution, 400),
    downloadPing: httpsUrl(r.downloadPing),
    category: oneOf(r.category, MOOD_CATEGORIES, 'imagery'),
    query: clean(r.query, 120),
    state: oneOf(r.state, ['proposed', 'kept', 'rejected'] as const, 'proposed'),
    addedAt: time(r.addedAt, Date.now()),
  };
}

export function normalizePalette(v: unknown): Palette | null {
  const r = obj(v);
  const colors = arr(r.colors)
    .map(obj)
    .map((c) => ({ hex: hex(c.hex) ?? '', role: clean(c.role, 24) || 'colour' }))
    .filter((c) => c.hex)
    .slice(0, 7);
  if (colors.length < 2) return null;
  return { id: idOf(r.id, 'pal'), name: clean(r.name, 60) || 'Palette', colors, state: oneOf(r.state, ['proposed', 'kept', 'rejected'] as const, 'proposed') };
}

export function normalizeTypePair(v: unknown): TypePair | null {
  const r = obj(v);
  if (!r.display && !r.body) return null;
  return {
    id: idOf(r.id, 'type'),
    display: displayFont(r.display),
    body: bodyFont(r.body),
    note: clean(r.note, 200),
    state: oneOf(r.state, ['proposed', 'kept', 'rejected'] as const, 'proposed'),
  };
}

/**
 * The credit an image is shown with: its title, creator and licence (Creative
 * Commons' title–author–licence form, with the source and licence linked where
 * it is shown), never a library's long legal sentence.
 */
export function creditText(r: Pick<MoodboardRef, 'provider' | 'title' | 'creator' | 'license'>): string {
  if (r.provider === 'upload') return `${r.title ? `“${r.title}”, ` : ''}your own reference`;
  if (r.provider === 'socriaux') return `${r.title ? `“${r.title}”, ` : ''}made by SocriaUX for this project`;
  const by = r.creator ? ` by ${r.creator}` : '';
  if (r.provider === 'unsplash') return `Photo${by} on Unsplash`;
  if (r.provider === 'pexels') return `Photo${by} on Pexels`;
  const t = (r.title || '').trim();
  const title = t && !/^(untitled|image|photo|picture)$/i.test(t) ? `“${t.length > 70 ? t.slice(0, 69).trimEnd() + '…' : t}”` : 'Image';
  return `${title}${by}${r.license ? `, ${r.license}` : ''}`;
}

export function normalizeMoodboard(v: unknown): Moodboard {
  const r = obj(v);
  const refs = arr(r.refs).map(normalizeRef).filter((x): x is MoodboardRef => !!x);
  const seenIds = new Set<string>();
  const all = refs.filter((x) => (seenIds.has(x.id) ? false : (seenIds.add(x.id), true)));
  // over the limit, the board lets go of what was removed first, then the oldest not kept — never a kept image
  let unique = all;
  if (all.length > LIMITS.refs) {
    const drop = new Set<string>();
    for (const state of ['rejected', 'proposed'] as const) {
      for (const x of all) {
        if (all.length - drop.size <= LIMITS.refs) break;
        if (x.state === state) drop.add(x.id);
      }
    }
    unique = all.filter((x) => !drop.has(x.id));
  }
  const seen = [...new Set([...strings(r.seen, LIMITS.seen, 120), ...unique.map((x) => x.id)])].slice(-LIMITS.seen);
  const queries = arr(r.queries)
    .map(obj)
    .map((q) => ({ category: oneOf(q.category, MOOD_CATEGORIES, 'imagery'), query: clean(q.query, 120), page: num(q.page, 1, 50, 1) }))
    .filter((q) => q.query)
    .slice(-60);
  return {
    refs: unique,
    seen,
    queries,
    palettes: arr(r.palettes).map(normalizePalette).filter((x): x is Palette => !!x).slice(-12),
    type: arr(r.type).map(normalizeTypePair).filter((x): x is TypePair => !!x).slice(-12),
  };
}

export function normalizeQuestion(v: unknown): DiscoveryQuestion | null {
  const r = obj(v);
  const question = clean(r.question, 300);
  if (!question) return null;
  return {
    id: idOf(r.id, 'q'),
    topic: oneOf(r.topic, TOPICS, 'objective'),
    question,
    why: clean(r.why, 240),
    options: strings(r.options, 6, 80),
    multi: r.multi === true,
    answer: str(r.answer, LIMITS.answer).trim(),
    skipped: r.skipped === true,
    ...(r.delegated === true ? { delegated: true } : {}),
    askedAt: time(r.askedAt, Date.now()),
  };
}

export function normalizeUnderstanding(v: unknown): Understanding {
  const r = obj(v);
  const known: Partial<Record<Topic, string>> = {};
  for (const t of TOPICS) {
    const s = clean(obj(r.known)[t], 400);
    if (s) known[t] = s;
  }
  return {
    summary: clean(r.summary, 700),
    known,
    gaps: [...new Set(arr(r.gaps).filter((g): g is Topic => (TOPICS as readonly unknown[]).includes(g)))],
  };
}

export function normalizeDiscovery(v: unknown): Discovery {
  const r = obj(v);
  return {
    questions: arr(r.questions).map(normalizeQuestion).filter((q): q is DiscoveryQuestion => !!q).slice(-LIMITS.questions),
    understanding: normalizeUnderstanding(r.understanding),
    ready: r.ready === true,
    note: clean(r.note, 300),
  };
}

export function normalizeBrief(v: unknown, keptRefIds?: ReadonlySet<string>): DesignBrief | null {
  const r = obj(v);
  const objective = clean(r.objective, 600);
  if (!objective) return null;
  const t = obj(r.typography);
  const seenRoles = new Set<string>();
  const palette = arr(r.palette)
    .map(obj)
    .map((c) => ({ name: clean(c.name, 40) || 'Colour', hex: hex(c.hex) ?? '', role: oneOf(c.role, PALETTE_ROLES, 'accent') }))
    .filter((c) => c.hex && !seenRoles.has(c.role) && (seenRoles.add(c.role), true))
    .slice(0, 7);
  const refs = strings(r.references, 16, 120).filter((id) => !keptRefIds || keptRefIds.has(id));
  return {
    objective,
    audience: clean(r.audience, 600),
    userGoals: strings(r.userGoals, 8, 200),
    personality: strings(r.personality, 6, 40),
    visualDirection: clean(r.visualDirection, 800),
    palette,
    typography: { display: displayFont(t.display), body: bodyFont(t.body), rationale: clean(t.rationale, 400) },
    layoutDirection: clean(r.layoutDirection, 600),
    functionalRequirements: strings(r.functionalRequirements, 12, 200),
    references: refs,
    openQuestions: strings(r.openQuestions, 6, 200),
    pageType: oneOf(r.pageType, ['website', 'app-screen'] as const, 'website'),
    platform: oneOf(r.platform, ['web', 'mobile'] as const, 'web'),
    ...briefExtras(r),
  };
}

/** The specification parts of a brief, kept only where they say something. */
function briefExtras(r: Record<string, any>): Partial<DesignBrief> {
  const out: Partial<DesignBrief> = {};
  const experience = clean(r.experience, 400);
  if (experience) out.experience = experience;
  const d = obj(r.decisions);
  const decisions: Partial<Record<BriefPart, Decision>> = {};
  for (const k of BRIEF_PARTS) if ((DECISIONS as readonly string[]).includes(d[k]) && d[k] !== 'proposed') decisions[k] = d[k];
  if (Object.keys(decisions).length) out.decisions = decisions;
  for (const k of ['rules', 'accessibility', 'responsive'] as const) {
    const xs = strings(r[k], 12, 240);
    if (xs.length) out[k] = xs;
  }
  const sp = obj(r.spec);
  const spec: BriefSpec = {};
  if (typeof sp.ratio === 'number' && Number.isFinite(sp.ratio)) spec.ratio = Math.round(Math.max(1.125, Math.min(1.618, sp.ratio)) * 1000) / 1000;
  if (['compact', 'comfortable', 'spacious'].includes(sp.density)) spec.density = sp.density;
  if ((GRIDS as readonly string[]).includes(sp.grid)) spec.grid = sp.grid;
  if (['narrow', 'standard', 'wide'].includes(sp.width)) spec.width = sp.width;
  if (['none', 'soft', 'round'].includes(sp.corners)) spec.corners = sp.corners;
  if (sp.motion && typeof sp.motion === 'object') spec.motion = normalizeMotion(sp.motion);
  if (sp.contrast === 'AA' || sp.contrast === 'AAA') spec.contrast = sp.contrast;
  if (Object.keys(spec).length) out.spec = spec;
  const intent = normalizeIntent(r.intent);
  if (intent) out.intent = intent;
  const layout = normalizeLayout(r.layout);
  if (layout) out.layout = layout;
  const system = normalizeDesignSystem(r.system);
  if (system) out.system = system;
  const parts = strings(r.parts, BRIEF_PARTS.length, 20).filter((x): x is BriefPart => (BRIEF_PARTS as readonly string[]).includes(x));
  if (parts.length) out.parts = [...new Set(parts)];
  return out;
}

export function normalizeArtifact(v: unknown): Artifact | null {
  const r = obj(v);
  if (r.type === 'generated') return { type: 'generated', createdAt: time(r.createdAt, Date.now()) };
  if (r.type !== 'imported') return null;
  const id = typeof r.id === 'string' && /^[a-f0-9]{32}$/.test(r.id) ? r.id : fileId();
  return {
    type: 'imported',
    id,
    kind: oneOf(r.kind, ['html', 'png', 'jpg', 'svg'] as const, 'png'),
    name: clean(r.name, 160) || 'Design',
    bytes: num(r.bytes, 0, 1e9, 0),
    width: num(r.width, 0, 1e5, 0),
    height: num(r.height, 0, 1e6, 0),
    runScripts: r.runScripts === true,
    kept: oneOf(r.kept, ['device', 'account', 'failed'] as const, 'device'),
    missing: strings(r.missing, 30, 300),
    summary: clean(r.summary, 2400),
    createdAt: time(r.createdAt, Date.now()),
  };
}

const usageTotals = (v: unknown): UsageTotals => {
  const r = obj(v);
  const out: UsageTotals = { calls: num(r.calls, 0, 1e7, 0), input: num(r.input, 0, 1e12, 0), output: num(r.output, 0, 1e12, 0), cost: num(r.cost, 0, 1e7, 0) };
  if (num(r.cached, 0, 1e12, 0)) out.cached = num(r.cached, 0, 1e12, 0);
  if (num(r.reasoning, 0, 1e12, 0)) out.reasoning = num(r.reasoning, 0, 1e12, 0);
  if (num(r.ms, 0, 1e12, 0)) out.ms = num(r.ms, 0, 1e12, 0);
  const by: Partial<Record<CallKind, StageSpend>> = {};
  for (const [k, x] of Object.entries(obj(r.byStage))) {
    if (!(CALL_KINDS as readonly string[]).includes(k)) continue;
    const o = obj(x);
    by[k as CallKind] = { calls: num(o.calls, 0, 1e7, 0), cost: num(o.cost, 0, 1e7, 0), premium: num(o.premium, 0, 1e7, 0), ...(num(o.ms, 0, 1e12, 0) ? { ms: num(o.ms, 0, 1e12, 0) } : {}) };
  }
  if (Object.keys(by).length) out.byStage = by;
  const accepted = (Array.isArray(r.accepted) ? r.accepted : []).filter((x): x is number => Number.isInteger(x) && x > 0 && x < 1e6);
  if (accepted.length) out.accepted = [...new Set(accepted)].slice(-200);
  return out;
};

export function emptyDiscovery(): Discovery {
  return { questions: [], understanding: { summary: '', known: {}, gaps: [] }, ready: false, note: '' };
}

export function emptyMoodboard(): Moodboard {
  return { refs: [], seen: [], queries: [], palettes: [], type: [] };
}

/**
 * Any document — from the browser's store, the network or an older version —
 * into a project the workspace can trust. Null only when it is not a project.
 * `forSync`: drop what does not travel (crops, which can be rebuilt from the file).
 */
export function normalizeProject(v: unknown, opts: { forSync?: boolean } = {}): DesignProject | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const r = obj(v);
  if (r.v !== undefined && r.v !== 1) return null;
  const now = Date.now();
  const moodboard = normalizeMoodboard(r.moodboard);
  const kept = new Set(moodboard.refs.filter((x) => x.state === 'kept').map((x) => x.id));
  const b = obj(r.brief);
  const specs = arr(r.specs)
    .map((s) => normalizeSpec(s, moodboard))
    .filter((s): s is DesignSpec => !!s)
    .slice(-LIMITS.specs);
  const cards = arr(r.cards)
    .map(normalizeCard)
    .filter((c): c is ReasoningCard => !!c)
    .slice(-LIMITS.cards)
    .map((c) => (opts.forSync && c.selection.crop ? { ...c, selection: { ...c.selection, crop: null } } : c));
  return {
    v: 1,
    id: idOf(r.id, 'uxv0'),
    name: clean(r.name, LIMITS.name) || 'Untitled design',
    mode: oneOf(r.mode, ['create', 'critique'] as const, 'create'),
    intent: str(r.intent, LIMITS.intent).trim(),
    discovery: normalizeDiscovery(r.discovery),
    moodboard,
    brief: { doc: normalizeBrief(b.doc, kept.size ? kept : undefined), approved: b.approved === true, version: num(b.version, 0, 1e4, 0) },
    direction: normalizeDirectionState(r.direction),
    ...((dna) => (dna && Object.keys(dna.dims).length ? { dna } : {}))(normalizeDNA(r.dna)),
    specs,
    specIndex: specs.length ? num(r.specIndex, 0, specs.length - 1, specs.length - 1) : -1,
    ...((rej) => (rej.length ? { compositions: { rejected: rej } } : {}))(
      arr(obj(r.compositions).rejected)
        .filter((x): x is string => typeof x === 'string' && x.length <= 2000)
        .slice(-60),
    ),
    ...((e) => (Number.isFinite(e.edits) && e.edits > 0 ? { edits: { edits: Math.min(1e6, Math.round(e.edits)), confined: Math.max(0, Math.min(Math.round(e.edits), Math.round(Number(e.confined) || 0))) } } : {}))({ edits: Number(obj(r.edits).edits), confined: obj(r.edits).confined }),
    ...((k) => (k.length ? { keptVersions: k } : {}))(
      arr(r.keptVersions)
        .filter((x): x is number => typeof x === 'number' && Number.isInteger(x) && x > 0 && specs.some((sp) => sp.version === x))
        .slice(0, 30),
    ),
    ...(r.medium === 'graphic' ? { medium: 'graphic' as const } : r.medium === 'board' ? { medium: 'board' as const } : {}),
    ...((g) => (g && r.medium === 'graphic' ? { graphic: g } : {}))(normalizeGraphicState(r.graphic)),
    ...((bd) => (bd ? { board: bd } : {}))(r.medium === 'board' ? normalizeBoard(r.board) : null),
    ...((ln) => (ln ? { systemLink: ln } : {}))(normalizeSystemLink(r.systemLink)),
    ...((st) => (st ? { studio: st } : {}))(normalizeStudio(r.studio)),
    artifact: normalizeArtifact(r.artifact),
    cards,
    usage: usageTotals(r.usage),
    viewport: oneOf(r.viewport, VIEWPORTS, 'desktop'),
    createdAt: time(r.createdAt, now),
    updatedAt: time(r.updatedAt, now),
  };
}

export function makeProject(mode: ProjectMode, name: string, now = Date.now()): DesignProject {
  return {
    v: 1,
    id: uid('uxv0'),
    name: clean(name, LIMITS.name) || (mode === 'create' ? 'Untitled design' : 'Design critique'),
    mode,
    intent: '',
    discovery: emptyDiscovery(),
    moodboard: emptyMoodboard(),
    brief: { doc: null, approved: false, version: 0 },
    direction: { ...EMPTY_DIRECTION, options: [], seen: [] },
    specs: [],
    specIndex: -1,
    artifact: null,
    cards: [],
    usage: { calls: 0, input: 0, output: 0, cost: 0 },
    viewport: 'desktop',
    createdAt: now,
    updatedAt: now,
  };
}

export function summarize(p: DesignProject): ProjectSummary {
  const imported = p.artifact?.type === 'imported' ? p.artifact : null;
  const g = p.medium === 'graphic' ? p.graphic : undefined;
  const bd = p.medium === 'board' ? p.board : undefined;
  const stage: ProjectSummary['stage'] = bd
    ? bd.materials.some((m) => m.status === 'ready')
      ? 'design'
      : bd.system
        ? 'direction'
        : bd.brief
          ? 'brief'
          : 'begun'
    : g
    ? g.doc
      ? 'design'
      : g.options.length
        ? 'direction'
        : g.brief
          ? 'brief'
          : 'begun'
    : imported
    ? 'imported'
    : p.specs.length
      ? 'design'
      : p.direction.options.length && p.brief.approved
        ? 'direction'
        : p.brief.doc
          ? 'brief'
          : p.intent
            ? 'discovery'
            : 'begun';
  return {
    id: p.id,
    name: p.name,
    mode: p.mode,
    ...(p.medium === 'graphic' ? { graphic: g?.brief?.kind ?? 'graphic' } : {}),
    ...(bd ? { board: bd.materials.length } : {}),
    intent: p.intent.slice(0, 160),
    updatedAt: p.updatedAt,
    cards: p.cards.length,
    hasDesign: !!p.artifact || p.specs.length > 0,
    createdAt: p.createdAt,
    stage,
    versions: bd ? bd.versions.length : g ? g.versions.length : p.specs.length,
    pageType: p.brief.doc?.pageType ?? currentSpec(p)?.pageType ?? null,
    medium: imported ? imported.kind : null,
    direction: bd ? bd.system?.direction.name ?? '' : g ? g.direction?.name ?? '' : p.direction.chosen?.name ?? '',
    ...((spec) => (spec && !imported ? { signature: signatureOf(spec, p.id, p.name) } : {}))(currentSpec(p)),
    studies: p.moodboard.refs
      .filter((r) => r.state === 'kept' && r.thumb)
      .slice(0, 3)
      .map((r) => r.thumb),
    ...(p.studio ? { studio: { mode: p.studio.mode, status: p.studio.status } } : {}),
  };
}

/** The spec being shown, if any. */
export function currentSpec(p: DesignProject): DesignSpec | null {
  return p.specIndex >= 0 ? p.specs[p.specIndex] ?? null : null;
}

/** Add one call's usage to a project's totals. */
export function addUsage(t: UsageTotals, u: Usage | null): UsageTotals {
  if (!u) return t;
  const round = (n: number) => Math.round(n * 1e6) / 1e6;
  const out: UsageTotals = { ...t, calls: t.calls + 1, input: t.input + u.input, output: t.output + u.output, cost: round(t.cost + (u.cost ?? 0)) };
  if (u.cached) out.cached = (t.cached ?? 0) + u.cached;
  if (u.reasoning) out.reasoning = (t.reasoning ?? 0) + u.reasoning;
  if (u.ms) out.ms = (t.ms ?? 0) + u.ms;
  if (u.stage) {
    const was = t.byStage?.[u.stage] ?? { calls: 0, cost: 0, premium: 0 };
    const ms = (was.ms ?? 0) + (u.ms ?? 0);
    out.byStage = { ...(t.byStage ?? {}), [u.stage]: { calls: was.calls + 1, cost: round(was.cost + (u.cost ?? 0)), premium: was.premium + (u.tier === 'premium' ? 1 : 0), ...(ms ? { ms } : {}) } };
  }
  return out;
}

/** The project's spend with one more design version accepted (downloaded). */
export function acceptDesign(t: UsageTotals, version: number): UsageTotals {
  return { ...t, accepted: [...new Set([...(t.accepted ?? []), version])].slice(-200) };
}

/** What each accepted design cost, on average (measured spend over accepted versions), or null before any. */
export function costPerAccepted(t: UsageTotals): number | null {
  const n = t.accepted?.length ?? 0;
  return n ? Math.round((t.cost / n) * 1e6) / 1e6 : null;
}

/**
 * What it took to reach each accepted design, on average, from what was measured: the money (text and pictures
 * apart), the attempts (designs generated, changes worked out by a model), and the time the calls took. Null
 * before a design is accepted. Pictures from an image model are their own line, never folded into text.
 */
export interface AcceptedEconomics {
  accepted: number;
  cost: number;
  text: number;
  images: number;
  generations: number;
  refinements: number;
  /** seconds of server time per accepted design; null when no call recorded its time */
  seconds: number | null;
}
export function acceptedEconomics(t: UsageTotals): AcceptedEconomics | null {
  const n = t.accepted?.length ?? 0;
  if (!n) return null;
  const r6 = (x: number) => Math.round(x * 1e6) / 1e6;
  const images = t.byStage?.image?.cost ?? 0;
  return {
    accepted: n,
    cost: r6(t.cost / n),
    text: r6(Math.max(0, t.cost - images) / n),
    images: r6(images / n),
    generations: Math.round(((t.byStage?.generate?.calls ?? 0) / n) * 10) / 10,
    refinements: Math.round(((t.byStage?.refine?.calls ?? 0) / n) * 10) / 10,
    seconds: t.ms ? Math.round(t.ms / n / 100) / 10 : null,
  };
}
