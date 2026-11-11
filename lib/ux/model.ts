// lib/ux/model.ts — SocriaUX: the project, and everything that changes it.
//
// SocriaUX (/ux) is a design workspace with a reasoning system beside it. The
// design is the centre of the project, and everything else hangs off it:
// annotations are pinned to an element, map nodes link to the element they are
// about, a decision names the evidence it rests on. One object holds all of it
// so the reasoning can never drift away from the thing being reasoned about.
//
// Pure: no React, no storage, no network. The workspace (components/ux) keeps
// a project in a reducer built from `reduce` below; the browser keeps it in
// localStorage (lib/ux/storage.ts) and a signed-in designer's copy is synced
// through /api/ux/projects, which runs every document through `normalizeProject`
// before it is stored — the same function the browser uses to read one back.

// ── vocabulary ───────────────────────────────────────────────────────

/** How much SocriaUX hands over. Guided discovery is the default. */
export type AssistMode = 'guided' | 'instructional' | 'direct';
export const ASSIST_MODES: readonly AssistMode[] = ['guided', 'instructional', 'direct'];
export const ASSIST_META: Record<AssistMode, { label: string; short: string; note: string }> = {
  guided: {
    label: 'Guided discovery',
    short: 'Guided',
    note: 'Questions and challenges first, with the explanation you need to answer them.',
  },
  instructional: {
    label: 'Instructional',
    short: 'Teach',
    note: 'Principles, methods and worked examples — why, in more depth.',
  },
  direct: {
    label: 'Direct assistance',
    short: 'Direct',
    note: 'Explicit recommendations and implementation help. The decision is still yours.',
  },
};

/** The workflow, compressed to five stages. A label, not a gate. */
export type Stage = 'frame' | 'design' | 'explore' | 'evidence' | 'refine';
export const STAGES: readonly Stage[] = ['frame', 'design', 'explore', 'evidence', 'refine'];
export const STAGE_META: Record<Stage, { label: string; hint: string }> = {
  frame: { label: 'Frame', hint: 'Define the problem and who it is for.' },
  design: { label: 'Design', hint: 'Develop or upload the interface.' },
  explore: { label: 'Explore', hint: 'Interrogate it: assumptions, usability, trade-offs.' },
  evidence: { label: 'Evidence', hint: 'Connect research to the decisions it supports.' },
  refine: { label: 'Refine', hint: 'Revise, compare alternatives, document the reasoning.' },
};

export type ElementKind = 'heading' | 'text' | 'button' | 'input' | 'checkbox' | 'link' | 'image' | 'rect' | 'nav';
export const ELEMENT_KINDS: readonly ElementKind[] = ['heading', 'text', 'button', 'input', 'checkbox', 'link', 'image', 'rect', 'nav'];
export const INTERACTIVE: ReadonlySet<ElementKind> = new Set(['button', 'input', 'checkbox', 'link', 'nav']);
export const TEXTUAL: ReadonlySet<ElementKind> = new Set(['heading', 'text', 'button', 'link', 'input', 'checkbox', 'nav']);

export type ButtonVariant = 'primary' | 'secondary' | 'ghost';

export interface UXElement {
  id: string;
  kind: ElementKind;
  /** position and size in artboard pixels */
  x: number;
  y: number;
  w: number;
  h: number;
  /** visible text: a heading's words, a button's label, an input's placeholder */
  text: string;
  /** an input's or checkbox's visible label; empty means none is shown */
  label: string;
  fill: string;
  color: string;
  fontSize: number;
  fontWeight: number;
  radius: number;
  variant: ButtonVariant;
  /** a designer's name for it, shown in Layers */
  name: string;
}

export interface Artboard {
  id: string;
  name: string;
  /** where it sits on the canvas */
  x: number;
  y: number;
  w: number;
  h: number;
  background: string;
  elements: UXElement[];
  /** an uploaded screenshot, painted under the elements */
  image: { src: string; w: number; h: number } | null;
  /** the artboard this one is an alternative to */
  parentId: string | null;
  /** what this alternative is trying — the hypothesis in a sentence */
  intent: string;
  createdAt: number;
}

export type AnnotationKind = 'note' | 'issue' | 'question' | 'principle';
export type Severity = 'low' | 'medium' | 'high';
export type AnnotationStatus = 'open' | 'resolved' | 'dismissed';

export interface Annotation {
  id: string;
  artboardId: string;
  elementId: string | null;
  /** position relative to the artboard (used when there is no element) */
  x: number;
  y: number;
  author: 'designer' | 'socria';
  kind: AnnotationKind;
  severity: Severity | null;
  text: string;
  principle: string;
  status: AnnotationStatus;
  createdAt: number;
}

export type NodeKind = 'need' | 'evidence' | 'assumption' | 'decision' | 'hypothesis' | 'question' | 'risk';
export const NODE_KINDS: readonly NodeKind[] = ['need', 'evidence', 'assumption', 'decision', 'hypothesis', 'question', 'risk'];
export const NODE_META: Record<NodeKind, { label: string; plural: string; note: string }> = {
  need: { label: 'User need', plural: 'User needs', note: 'What a person is trying to get done.' },
  evidence: { label: 'Evidence', plural: 'Evidence', note: 'Something observed, measured or said — checkable.' },
  assumption: { label: 'Assumption', plural: 'Assumptions', note: 'Believed, not yet tested.' },
  decision: { label: 'Decision', plural: 'Decisions', note: 'A choice made in the design, with its reasons.' },
  hypothesis: { label: 'Hypothesis', plural: 'Hypotheses', note: 'If we do this, we expect that — testable.' },
  question: { label: 'Open question', plural: 'Open questions', note: 'Something nobody has answered yet.' },
  risk: { label: 'Risk', plural: 'Risks', note: 'A way this could go wrong for someone.' },
};

export type NodeStatus = 'open' | 'validated' | 'invalidated';
export const NODE_STATUSES: readonly NodeStatus[] = ['open', 'validated', 'invalidated'];

export interface ReasonNode {
  id: string;
  kind: NodeKind;
  label: string;
  detail: string;
  /** decisions only: the trade-offs accepted */
  tradeoffs: string;
  x: number;
  y: number;
  status: NodeStatus;
  artboardId: string | null;
  elementId: string | null;
  source: 'designer' | 'socria' | 'research';
  /** a research note this was drawn from */
  researchId: string | null;
  createdAt: number;
}

export type EdgeKind = 'supports' | 'contradicts' | 'informs' | 'tests' | 'depends';
export const EDGE_KINDS: readonly EdgeKind[] = ['supports', 'contradicts', 'informs', 'tests', 'depends'];

export interface ReasonEdge {
  id: string;
  from: string;
  to: string;
  kind: EdgeKind;
}

export type ResearchKind = 'interview' | 'observation' | 'survey' | 'analytics' | 'usability-test' | 'other';
export const RESEARCH_KINDS: readonly ResearchKind[] = ['interview', 'observation', 'survey', 'analytics', 'usability-test', 'other'];

export interface ResearchNote {
  id: string;
  kind: ResearchKind;
  /** who or where it came from: "P3, interview, 12 Oct" */
  source: string;
  text: string;
  tags: string[];
  /** true: observed or measured. false: a belief somebody wrote down. */
  isEvidence: boolean;
  createdAt: number;
}

export interface CodeArtifact {
  id: string;
  title: string;
  language: 'html' | 'css' | 'js' | 'jsx' | 'tsx';
  content: string;
  explanation: string;
  artboardId: string | null;
  createdAt: number;
}

export type MessageKind = 'question' | 'explanation' | 'critique' | 'code' | 'answer' | 'note';

export interface Principle {
  name: string;
  summary: string;
}

/** Something SocriaUX proposes adding. Nothing is added until the designer says so. */
export type Suggestion =
  | {
      id: string;
      type: 'annotation';
      state: 'pending' | 'accepted' | 'dismissed';
      elementId: string | null;
      kind: AnnotationKind;
      severity: Severity | null;
      text: string;
      principle: string;
    }
  | {
      id: string;
      type: 'node';
      state: 'pending' | 'accepted' | 'dismissed';
      kind: NodeKind;
      label: string;
      detail: string;
      elementId: string | null;
      /** an existing node this one should connect to, and how */
      linkTo: string | null;
      linkKind: EdgeKind | null;
    };

export interface UXMessage {
  id: string;
  role: 'designer' | 'socria';
  text: string;
  mode: AssistMode;
  kind: MessageKind;
  /** what it was about: the selection when it was asked */
  focus: { artboardId: string | null; elementId: string | null; nodeId: string | null };
  questions: string[];
  principles: Principle[];
  suggestions: Suggestion[];
  code: { language: CodeArtifact['language']; title: string; content: string; explanation: string } | null;
  createdAt: number;
}

export interface Brief {
  problem: string;
  users: string;
  goals: string;
  constraints: string;
  success: string;
}

export interface UXProject {
  v: 1;
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  mode: AssistMode;
  stage: Stage;
  brief: Brief;
  artboards: UXElementHost[];
  annotations: Annotation[];
  nodes: ReasonNode[];
  edges: ReasonEdge[];
  research: ResearchNote[];
  messages: UXMessage[];
  code: CodeArtifact[];
}
/** An artboard, under the name the project uses for its list. */
export type UXElementHost = Artboard;

export interface ProjectSummary {
  id: string;
  name: string;
  updatedAt: number;
  artboards: number;
  problem: string;
}

// ── limits ───────────────────────────────────────────────────────────

export const LIMITS = {
  name: 80,
  brief: 1200,
  artboards: 24,
  elements: 160,
  text: 400,
  annotations: 300,
  nodes: 200,
  edges: 400,
  research: 300,
  researchText: 2000,
  messages: 200,
  messageText: 6000,
  code: 40,
  codeText: 20000,
  /** a data URL for an uploaded screenshot, after it is downscaled in the browser */
  image: 1_600_000,
  canvas: 20000,
  artboardSize: 4000,
} as const;

// ── small helpers ────────────────────────────────────────────────────

export function uid(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

const str = (v: unknown, max: number, fallback = ''): string =>
  typeof v === 'string' ? v.slice(0, max) : fallback;
const num = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? v : fallback;
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100));
};
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T =>
  (list as readonly string[]).includes(v as string) ? (v as T) : fallback;
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' ? (v as Record<string, any>) : {});
const HEX = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;
export const color = (v: unknown, fallback: string): string => (typeof v === 'string' && HEX.test(v.trim()) ? v.trim().toLowerCase() : fallback);
const idOf = (v: unknown, prefix: string): string =>
  typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : uid(prefix);
const time = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : fallback);

// ── factories ────────────────────────────────────────────────────────

export const ELEMENT_DEFAULTS: Record<ElementKind, Partial<UXElement>> = {
  heading: { w: 320, h: 40, text: 'Heading', fontSize: 28, fontWeight: 600, color: '#20201b', fill: '#ffffff', radius: 0 },
  text: { w: 320, h: 48, text: 'Supporting text that explains what this screen is for.', fontSize: 16, fontWeight: 400, color: '#4a4a43', fill: '#ffffff', radius: 0 },
  button: { w: 160, h: 48, text: 'Continue', fontSize: 16, fontWeight: 600, color: '#ffffff', fill: '#354620', radius: 999, variant: 'primary' },
  input: { w: 320, h: 48, text: 'Placeholder', label: 'Label', fontSize: 16, fontWeight: 400, color: '#20201b', fill: '#ffffff', radius: 10 },
  checkbox: { w: 240, h: 24, text: '', label: 'I agree', fontSize: 15, fontWeight: 400, color: '#20201b', fill: '#ffffff', radius: 4 },
  link: { w: 140, h: 24, text: 'Learn more', fontSize: 15, fontWeight: 500, color: '#465a26', fill: '#ffffff', radius: 0 },
  image: { w: 320, h: 180, text: 'Image', fontSize: 13, fontWeight: 400, color: '#6b6a62', fill: '#e9e5d9', radius: 12 },
  rect: { w: 320, h: 160, text: '', fontSize: 14, fontWeight: 400, color: '#20201b', fill: '#f4f1e8', radius: 14 },
  nav: { w: 1280, h: 64, text: 'Home · Projects · Reports · Settings', fontSize: 15, fontWeight: 500, color: '#20201b', fill: '#ffffff', radius: 0 },
};

export function makeElement(kind: ElementKind, at: Partial<UXElement> = {}): UXElement {
  const d = ELEMENT_DEFAULTS[kind];
  return normalizeElement({ ...d, ...at, kind, id: at.id ?? uid('el') });
}

export function makeArtboard(at: Partial<Artboard> = {}): Artboard {
  return normalizeArtboard({
    name: 'Screen',
    w: 390,
    h: 844,
    x: 0,
    y: 0,
    background: '#ffffff',
    elements: [],
    image: null,
    parentId: null,
    intent: '',
    createdAt: Date.now(),
    ...at,
    id: at.id ?? uid('ab'),
  });
}

export function emptyBrief(): Brief {
  return { problem: '', users: '', goals: '', constraints: '', success: '' };
}

export function makeProject(name: string, at: Partial<UXProject> = {}, now = Date.now()): UXProject {
  return normalizeProject({
    v: 1,
    id: uid('ux'),
    name: name.trim() || 'Untitled project',
    createdAt: now,
    updatedAt: now,
    mode: 'guided',
    stage: 'frame',
    brief: emptyBrief(),
    artboards: [],
    annotations: [],
    nodes: [],
    edges: [],
    research: [],
    messages: [],
    code: [],
    ...at,
  }) as UXProject;
}

export function makeNode(kind: NodeKind, label: string, at: Partial<ReasonNode> = {}): ReasonNode {
  return normalizeNode({ kind, label, x: 80, y: 80, source: 'designer', createdAt: Date.now(), ...at, id: at.id ?? uid('n') });
}

// ── normalisation: every document read or received passes through here ─

export function normalizeElement(raw: unknown): UXElement {
  const r = obj(raw);
  const kind = oneOf(r.kind, ELEMENT_KINDS, 'rect');
  const d = ELEMENT_DEFAULTS[kind];
  return {
    id: idOf(r.id, 'el'),
    kind,
    x: num(r.x, -LIMITS.artboardSize, LIMITS.artboardSize, 24),
    y: num(r.y, -LIMITS.artboardSize, LIMITS.artboardSize, 24),
    w: num(r.w, 4, LIMITS.artboardSize, d.w ?? 120),
    h: num(r.h, 4, LIMITS.artboardSize, d.h ?? 40),
    text: str(r.text, LIMITS.text, d.text ?? ''),
    label: str(r.label, 120, d.label ?? ''),
    fill: color(r.fill, d.fill ?? '#ffffff'),
    color: color(r.color, d.color ?? '#20201b'),
    fontSize: num(r.fontSize, 6, 160, d.fontSize ?? 16),
    fontWeight: [300, 400, 500, 600, 700].includes(Number(r.fontWeight)) ? Number(r.fontWeight) : d.fontWeight ?? 400,
    radius: num(r.radius, 0, 999, d.radius ?? 0),
    variant: oneOf(r.variant, ['primary', 'secondary', 'ghost'] as const, d.variant ?? 'primary'),
    name: str(r.name, 60),
  };
}

export function normalizeArtboard(raw: unknown): Artboard {
  const r = obj(raw);
  const img = obj(r.image);
  const image =
    typeof img.src === 'string' && /^data:image\/(png|jpeg|webp|gif);base64,/.test(img.src) && img.src.length <= LIMITS.image
      ? { src: img.src, w: num(img.w, 1, 10000, 1), h: num(img.h, 1, 10000, 1) }
      : null;
  return {
    id: idOf(r.id, 'ab'),
    name: str(r.name, LIMITS.name, 'Screen') || 'Screen',
    x: num(r.x, -LIMITS.canvas, LIMITS.canvas, 0),
    y: num(r.y, -LIMITS.canvas, LIMITS.canvas, 0),
    w: num(r.w, 120, LIMITS.artboardSize, 390),
    h: num(r.h, 120, LIMITS.artboardSize, 844),
    background: color(r.background, '#ffffff'),
    elements: arr(r.elements).slice(0, LIMITS.elements).map(normalizeElement),
    image,
    parentId: typeof r.parentId === 'string' ? r.parentId.slice(0, 64) : null,
    intent: str(r.intent, 400),
    createdAt: time(r.createdAt, Date.now()),
  };
}

function normalizeAnnotation(raw: unknown): Annotation {
  const r = obj(raw);
  return {
    id: idOf(r.id, 'an'),
    artboardId: str(r.artboardId, 64),
    elementId: typeof r.elementId === 'string' && r.elementId ? r.elementId.slice(0, 64) : null,
    x: num(r.x, -LIMITS.artboardSize, LIMITS.artboardSize, 0),
    y: num(r.y, -LIMITS.artboardSize, LIMITS.artboardSize, 0),
    author: oneOf(r.author, ['designer', 'socria'] as const, 'designer'),
    kind: oneOf(r.kind, ['note', 'issue', 'question', 'principle'] as const, 'note'),
    severity: r.severity == null ? null : oneOf(r.severity, ['low', 'medium', 'high'] as const, 'low'),
    text: str(r.text, 1200),
    principle: str(r.principle, 160),
    status: oneOf(r.status, ['open', 'resolved', 'dismissed'] as const, 'open'),
    createdAt: time(r.createdAt, Date.now()),
  };
}

export function normalizeNode(raw: unknown): ReasonNode {
  const r = obj(raw);
  return {
    id: idOf(r.id, 'n'),
    kind: oneOf(r.kind, NODE_KINDS, 'question'),
    label: str(r.label, 200, 'Untitled').trim() || 'Untitled',
    detail: str(r.detail, 1500),
    tradeoffs: str(r.tradeoffs, 1000),
    x: num(r.x, -LIMITS.canvas, LIMITS.canvas, 0),
    y: num(r.y, -LIMITS.canvas, LIMITS.canvas, 0),
    status: oneOf(r.status, NODE_STATUSES, 'open'),
    artboardId: typeof r.artboardId === 'string' && r.artboardId ? r.artboardId.slice(0, 64) : null,
    elementId: typeof r.elementId === 'string' && r.elementId ? r.elementId.slice(0, 64) : null,
    source: oneOf(r.source, ['designer', 'socria', 'research'] as const, 'designer'),
    researchId: typeof r.researchId === 'string' && r.researchId ? r.researchId.slice(0, 64) : null,
    createdAt: time(r.createdAt, Date.now()),
  };
}

function normalizeEdge(raw: unknown): ReasonEdge | null {
  const r = obj(raw);
  if (typeof r.from !== 'string' || typeof r.to !== 'string' || r.from === r.to) return null;
  return { id: idOf(r.id, 'e'), from: r.from.slice(0, 64), to: r.to.slice(0, 64), kind: oneOf(r.kind, EDGE_KINDS, 'informs') };
}

function normalizeResearch(raw: unknown): ResearchNote {
  const r = obj(raw);
  return {
    id: idOf(r.id, 'r'),
    kind: oneOf(r.kind, RESEARCH_KINDS, 'interview'),
    source: str(r.source, 160),
    text: str(r.text, LIMITS.researchText),
    tags: arr(r.tags)
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.trim().toLowerCase().slice(0, 32))
      .filter(Boolean)
      .slice(0, 8),
    isEvidence: r.isEvidence !== false,
    createdAt: time(r.createdAt, Date.now()),
  };
}

const CODE_LANGS = ['html', 'css', 'js', 'jsx', 'tsx'] as const;

function normalizeCode(raw: unknown): CodeArtifact {
  const r = obj(raw);
  return {
    id: idOf(r.id, 'c'),
    title: str(r.title, 120, 'Snippet') || 'Snippet',
    language: oneOf(r.language, CODE_LANGS, 'html'),
    content: str(r.content, LIMITS.codeText),
    explanation: str(r.explanation, 3000),
    artboardId: typeof r.artboardId === 'string' && r.artboardId ? r.artboardId.slice(0, 64) : null,
    createdAt: time(r.createdAt, Date.now()),
  };
}

export function normalizeSuggestion(raw: unknown): Suggestion | null {
  const r = obj(raw);
  const state = oneOf(r.state, ['pending', 'accepted', 'dismissed'] as const, 'pending');
  const elementId = typeof r.elementId === 'string' && r.elementId ? r.elementId.slice(0, 64) : null;
  if (r.type === 'annotation') {
    const text = str(r.text, 600).trim();
    if (!text) return null;
    return {
      id: idOf(r.id, 's'),
      type: 'annotation',
      state,
      elementId,
      kind: oneOf(r.kind, ['note', 'issue', 'question', 'principle'] as const, 'issue'),
      severity: r.severity == null ? null : oneOf(r.severity, ['low', 'medium', 'high'] as const, 'low'),
      text,
      principle: str(r.principle, 160),
    };
  }
  if (r.type === 'node') {
    const label = str(r.label, 200).trim();
    if (!label) return null;
    return {
      id: idOf(r.id, 's'),
      type: 'node',
      state,
      kind: oneOf(r.kind, NODE_KINDS, 'assumption'),
      label,
      detail: str(r.detail, 800),
      elementId,
      linkTo: typeof r.linkTo === 'string' && r.linkTo ? r.linkTo.slice(0, 64) : null,
      linkKind: r.linkKind == null ? null : oneOf(r.linkKind, EDGE_KINDS, 'informs'),
    };
  }
  return null;
}

function normalizeMessage(raw: unknown): UXMessage {
  const r = obj(raw);
  const f = obj(r.focus);
  const c = obj(r.code);
  const fid = (v: unknown) => (typeof v === 'string' && v ? v.slice(0, 64) : null);
  return {
    id: idOf(r.id, 'm'),
    role: oneOf(r.role, ['designer', 'socria'] as const, 'designer'),
    text: str(r.text, LIMITS.messageText),
    mode: oneOf(r.mode, ASSIST_MODES, 'guided'),
    kind: oneOf(r.kind, ['question', 'explanation', 'critique', 'code', 'answer', 'note'] as const, 'answer'),
    focus: { artboardId: fid(f.artboardId), elementId: fid(f.elementId), nodeId: fid(f.nodeId) },
    questions: arr(r.questions).filter((q): q is string => typeof q === 'string' && !!q.trim()).map((q) => q.slice(0, 300)).slice(0, 4),
    principles: arr(r.principles)
      .map(obj)
      .filter((p) => typeof p.name === 'string' && p.name.trim())
      .map((p) => ({ name: str(p.name, 80), summary: str(p.summary, 500) }))
      .slice(0, 4),
    suggestions: arr(r.suggestions).map(normalizeSuggestion).filter((s): s is Suggestion => !!s).slice(0, 12),
    code:
      typeof c.content === 'string' && c.content.trim()
        ? {
            language: oneOf(c.language, CODE_LANGS, 'html'),
            title: str(c.title, 120, 'Snippet') || 'Snippet',
            content: str(c.content, LIMITS.codeText),
            explanation: str(c.explanation, 3000),
          }
        : null,
    createdAt: time(r.createdAt, Date.now()),
  };
}

/**
 * Any document — from localStorage, from the network, from an old version —
 * into a project that the workspace can trust. Never throws. Returns null only
 * when the input is not a project at all.
 */
export function normalizeProject(raw: unknown): UXProject | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = obj(raw);
  if (r.v !== undefined && r.v !== 1) return null;
  const now = Date.now();
  const b = obj(r.brief);
  const artboards = arr(r.artboards).slice(0, LIMITS.artboards).map(normalizeArtboard);
  const abIds = new Set(artboards.map((a) => a.id));
  const nodes = arr(r.nodes).slice(0, LIMITS.nodes).map(normalizeNode);
  const nodeIds = new Set(nodes.map((n) => n.id));
  const seen = new Set<string>();
  const edges = arr(r.edges)
    .slice(0, LIMITS.edges)
    .map(normalizeEdge)
    .filter((e): e is ReasonEdge => {
      if (!e || !nodeIds.has(e.from) || !nodeIds.has(e.to)) return false;
      const k = `${e.from}>${e.to}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  return {
    v: 1,
    id: idOf(r.id, 'ux'),
    name: str(r.name, LIMITS.name, 'Untitled project').trim() || 'Untitled project',
    createdAt: time(r.createdAt, now),
    updatedAt: time(r.updatedAt, now),
    mode: oneOf(r.mode, ASSIST_MODES, 'guided'),
    stage: oneOf(r.stage, STAGES, 'frame'),
    brief: {
      problem: str(b.problem, LIMITS.brief),
      users: str(b.users, LIMITS.brief),
      goals: str(b.goals, LIMITS.brief),
      constraints: str(b.constraints, LIMITS.brief),
      success: str(b.success, LIMITS.brief),
    },
    artboards,
    annotations: arr(r.annotations)
      .slice(0, LIMITS.annotations)
      .map(normalizeAnnotation)
      .filter((a) => abIds.has(a.artboardId)),
    nodes,
    edges,
    research: arr(r.research).slice(0, LIMITS.research).map(normalizeResearch),
    messages: arr(r.messages).slice(-LIMITS.messages).map(normalizeMessage),
    code: arr(r.code).slice(-LIMITS.code).map(normalizeCode),
  };
}

export function summarize(p: UXProject): ProjectSummary {
  return { id: p.id, name: p.name, updatedAt: p.updatedAt, artboards: p.artboards.length, problem: p.brief.problem.slice(0, 160) };
}

// ── what changes a project ───────────────────────────────────────────

export type Action =
  | { type: 'project/rename'; name: string }
  | { type: 'brief/set'; patch: Partial<Brief> }
  | { type: 'mode/set'; mode: AssistMode }
  | { type: 'stage/set'; stage: Stage }
  | { type: 'artboard/add'; artboard: Artboard }
  | { type: 'artboard/update'; id: string; patch: Partial<Omit<Artboard, 'id' | 'elements'>> }
  | { type: 'artboard/remove'; id: string }
  | { type: 'artboard/alternative'; id: string; newId: string; intent: string }
  | { type: 'element/add'; artboardId: string; element: UXElement }
  | { type: 'element/update'; artboardId: string; id: string; patch: Partial<Omit<UXElement, 'id'>> }
  | { type: 'element/remove'; artboardId: string; id: string }
  | { type: 'element/order'; artboardId: string; id: string; dir: 'front' | 'back' }
  | { type: 'annotation/add'; annotation: Annotation }
  | { type: 'annotation/update'; id: string; patch: Partial<Omit<Annotation, 'id'>> }
  | { type: 'annotation/remove'; id: string }
  | { type: 'node/add'; node: ReasonNode }
  | { type: 'node/update'; id: string; patch: Partial<Omit<ReasonNode, 'id'>> }
  | { type: 'node/remove'; id: string }
  | { type: 'edge/add'; edge: ReasonEdge }
  | { type: 'edge/update'; id: string; kind: EdgeKind }
  | { type: 'edge/remove'; id: string }
  | { type: 'research/add'; note: ResearchNote }
  | { type: 'research/update'; id: string; patch: Partial<Omit<ResearchNote, 'id'>> }
  | { type: 'research/remove'; id: string }
  | { type: 'message/add'; message: UXMessage }
  | { type: 'message/suggestion'; messageId: string; suggestionId: string; state: Suggestion['state'] }
  | { type: 'messages/clear' }
  | { type: 'code/add'; artifact: CodeArtifact }
  | { type: 'code/remove'; id: string }
  | { type: 'project/replace'; project: UXProject };

const mapAb = (p: UXProject, id: string, f: (a: Artboard) => Artboard): Artboard[] =>
  p.artboards.map((a) => (a.id === id ? f(a) : a));

/** Where a new alternative goes: to the right of everything in its row. */
export function nextArtboardSlot(p: UXProject, w: number, gap = 120): { x: number; y: number } {
  if (!p.artboards.length) return { x: 0, y: 0 };
  const right = Math.max(...p.artboards.map((a) => a.x + a.w));
  const top = Math.min(...p.artboards.map((a) => a.y));
  return { x: right + gap, y: top };
}

/** One step. Returns the same object when nothing changed, so React can skip a render. */
export function reduce(p: UXProject, a: Action, now = Date.now()): UXProject {
  const next = step(p, a);
  if (next === p) return p;
  return a.type === 'project/replace' ? next : { ...next, updatedAt: now };
}

function step(p: UXProject, a: Action): UXProject {
  switch (a.type) {
    case 'project/rename': {
      const name = a.name.slice(0, LIMITS.name);
      return name.trim() && name !== p.name ? { ...p, name } : p;
    }
    case 'brief/set': {
      const brief = { ...p.brief };
      for (const k of Object.keys(a.patch) as (keyof Brief)[]) {
        const v = a.patch[k];
        if (typeof v === 'string') brief[k] = v.slice(0, LIMITS.brief);
      }
      return { ...p, brief };
    }
    case 'mode/set':
      return p.mode === a.mode ? p : { ...p, mode: a.mode };
    case 'stage/set':
      return p.stage === a.stage ? p : { ...p, stage: a.stage };

    case 'artboard/add':
      if (p.artboards.length >= LIMITS.artboards) return p;
      return { ...p, artboards: [...p.artboards, normalizeArtboard(a.artboard)] };
    case 'artboard/update': {
      if (!p.artboards.some((b) => b.id === a.id)) return p;
      return { ...p, artboards: mapAb(p, a.id, (b) => normalizeArtboard({ ...b, ...a.patch, id: b.id, elements: b.elements })) };
    }
    case 'artboard/remove': {
      if (!p.artboards.some((b) => b.id === a.id)) return p;
      return {
        ...p,
        artboards: p.artboards.filter((b) => b.id !== a.id).map((b) => (b.parentId === a.id ? { ...b, parentId: null } : b)),
        annotations: p.annotations.filter((n) => n.artboardId !== a.id),
        nodes: p.nodes.map((n) => (n.artboardId === a.id ? { ...n, artboardId: null, elementId: null } : n)),
      };
    }
    case 'artboard/alternative': {
      const src = p.artboards.find((b) => b.id === a.id);
      if (!src || p.artboards.length >= LIMITS.artboards) return p;
      const slot = nextArtboardSlot(p, src.w);
      // Elements keep their ids inside the copy: an element is identified by
      // (artboard, element), so "the same button in the alternative" stays
      // recognisably the same button when the two are compared.
      const copy: Artboard = {
        ...src,
        id: a.newId,
        name: `${src.name} — alternative`,
        x: slot.x,
        y: slot.y,
        parentId: src.id,
        intent: a.intent.slice(0, 400),
        elements: src.elements.map((e) => ({ ...e })),
        createdAt: Date.now(),
      };
      return { ...p, artboards: [...p.artboards, copy] };
    }

    case 'element/add': {
      const ab = p.artboards.find((b) => b.id === a.artboardId);
      if (!ab || ab.elements.length >= LIMITS.elements) return p;
      return { ...p, artboards: mapAb(p, a.artboardId, (b) => ({ ...b, elements: [...b.elements, normalizeElement(a.element)] })) };
    }
    case 'element/update': {
      const ab = p.artboards.find((b) => b.id === a.artboardId);
      if (!ab || !ab.elements.some((e) => e.id === a.id)) return p;
      return {
        ...p,
        artboards: mapAb(p, a.artboardId, (b) => ({
          ...b,
          elements: b.elements.map((e) => (e.id === a.id ? normalizeElement({ ...e, ...a.patch, id: e.id }) : e)),
        })),
      };
    }
    case 'element/remove': {
      const ab = p.artboards.find((b) => b.id === a.artboardId);
      if (!ab || !ab.elements.some((e) => e.id === a.id)) return p;
      return {
        ...p,
        artboards: mapAb(p, a.artboardId, (b) => ({ ...b, elements: b.elements.filter((e) => e.id !== a.id) })),
        annotations: p.annotations.map((n) =>
          n.artboardId === a.artboardId && n.elementId === a.id ? { ...n, elementId: null } : n
        ),
        nodes: p.nodes.map((n) => (n.artboardId === a.artboardId && n.elementId === a.id ? { ...n, elementId: null } : n)),
      };
    }
    case 'element/order': {
      const ab = p.artboards.find((b) => b.id === a.artboardId);
      const el = ab?.elements.find((e) => e.id === a.id);
      if (!ab || !el) return p;
      const rest = ab.elements.filter((e) => e.id !== a.id);
      const elements = a.dir === 'front' ? [...rest, el] : [el, ...rest];
      return { ...p, artboards: mapAb(p, a.artboardId, (b) => ({ ...b, elements })) };
    }

    case 'annotation/add':
      if (p.annotations.length >= LIMITS.annotations || !p.artboards.some((b) => b.id === a.annotation.artboardId)) return p;
      return { ...p, annotations: [...p.annotations, normalizeAnnotation(a.annotation)] };
    case 'annotation/update':
      if (!p.annotations.some((n) => n.id === a.id)) return p;
      return { ...p, annotations: p.annotations.map((n) => (n.id === a.id ? normalizeAnnotation({ ...n, ...a.patch, id: n.id }) : n)) };
    case 'annotation/remove':
      if (!p.annotations.some((n) => n.id === a.id)) return p;
      return { ...p, annotations: p.annotations.filter((n) => n.id !== a.id) };

    case 'node/add':
      if (p.nodes.length >= LIMITS.nodes) return p;
      return { ...p, nodes: [...p.nodes, normalizeNode(a.node)] };
    case 'node/update':
      if (!p.nodes.some((n) => n.id === a.id)) return p;
      return { ...p, nodes: p.nodes.map((n) => (n.id === a.id ? normalizeNode({ ...n, ...a.patch, id: n.id }) : n)) };
    case 'node/remove':
      if (!p.nodes.some((n) => n.id === a.id)) return p;
      return { ...p, nodes: p.nodes.filter((n) => n.id !== a.id), edges: p.edges.filter((e) => e.from !== a.id && e.to !== a.id) };

    case 'edge/add': {
      const e = normalizeEdge(a.edge);
      if (!e || p.edges.length >= LIMITS.edges) return p;
      const ids = new Set(p.nodes.map((n) => n.id));
      if (!ids.has(e.from) || !ids.has(e.to)) return p;
      // one relation between two nodes, in either direction: a second drag replaces the kind
      const existing = p.edges.find((x) => (x.from === e.from && x.to === e.to) || (x.from === e.to && x.to === e.from));
      if (existing) return existing.kind === e.kind ? p : { ...p, edges: p.edges.map((x) => (x === existing ? { ...x, kind: e.kind } : x)) };
      return { ...p, edges: [...p.edges, e] };
    }
    case 'edge/update':
      if (!p.edges.some((e) => e.id === a.id)) return p;
      return { ...p, edges: p.edges.map((e) => (e.id === a.id ? { ...e, kind: a.kind } : e)) };
    case 'edge/remove':
      if (!p.edges.some((e) => e.id === a.id)) return p;
      return { ...p, edges: p.edges.filter((e) => e.id !== a.id) };

    case 'research/add':
      if (p.research.length >= LIMITS.research) return p;
      return { ...p, research: [...p.research, normalizeResearch(a.note)] };
    case 'research/update':
      if (!p.research.some((r) => r.id === a.id)) return p;
      return { ...p, research: p.research.map((r) => (r.id === a.id ? normalizeResearch({ ...r, ...a.patch, id: r.id }) : r)) };
    case 'research/remove':
      if (!p.research.some((r) => r.id === a.id)) return p;
      return {
        ...p,
        research: p.research.filter((r) => r.id !== a.id),
        nodes: p.nodes.map((n) => (n.researchId === a.id ? { ...n, researchId: null } : n)),
      };

    case 'message/add':
      return { ...p, messages: [...p.messages, normalizeMessage(a.message)].slice(-LIMITS.messages) };
    case 'message/suggestion': {
      const m = p.messages.find((x) => x.id === a.messageId);
      if (!m || !m.suggestions.some((s) => s.id === a.suggestionId)) return p;
      return {
        ...p,
        messages: p.messages.map((x) =>
          x.id === a.messageId
            ? { ...x, suggestions: x.suggestions.map((s) => (s.id === a.suggestionId ? { ...s, state: a.state } : s)) as Suggestion[] }
            : x
        ),
      };
    }
    case 'messages/clear':
      return p.messages.length ? { ...p, messages: [] } : p;

    case 'code/add':
      return { ...p, code: [...p.code, normalizeCode(a.artifact)].slice(-LIMITS.code) };
    case 'code/remove':
      if (!p.code.some((c) => c.id === a.id)) return p;
      return { ...p, code: p.code.filter((c) => c.id !== a.id) };

    case 'project/replace':
      return normalizeProject(a.project) ?? p;
  }
}

// ── reading a project ────────────────────────────────────────────────

/** The evidence a node rests on: what supports it, directly. */
export function supportOf(p: UXProject, nodeId: string): { supports: ReasonNode[]; contradicts: ReasonNode[] } {
  const byId = new Map(p.nodes.map((n) => [n.id, n]));
  const supports: ReasonNode[] = [];
  const contradicts: ReasonNode[] = [];
  for (const e of p.edges) {
    if (e.to !== nodeId) continue;
    const n = byId.get(e.from);
    if (!n) continue;
    if (e.kind === 'supports' || e.kind === 'informs') supports.push(n);
    if (e.kind === 'contradicts') contradicts.push(n);
  }
  return { supports, contradicts };
}

/**
 * Decisions resting on nothing but assumptions — the reasoning gap a designer
 * most often cannot see in their own work. A decision is "grounded" when at
 * least one validated node or one piece of evidence supports it.
 */
export function ungroundedDecisions(p: UXProject): ReasonNode[] {
  return p.nodes.filter((n) => {
    if (n.kind !== 'decision') return false;
    const { supports } = supportOf(p, n.id);
    return !supports.some((s) => s.kind === 'evidence' || s.status === 'validated');
  });
}

/** How far the brief is filled in, 0–5. */
export function briefFilled(b: Brief): number {
  return (['problem', 'users', 'goals', 'constraints', 'success'] as const).filter((k) => b[k].trim().length >= 8).length;
}
