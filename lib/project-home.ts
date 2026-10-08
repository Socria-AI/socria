// lib/project-home.ts
//
// PROJECT HOME — what opening a Project shows, decided from what is in it.
//
// Everything here is read from the Project's own content: its conversations
// (Core and Logos), the maps those built, the goals the person set, the files
// they added, and the part of the Mind graph tied to it (lib/mind/atlas.ts).
// Nothing is invented:
//
//   — PROGRESS IS ONLY WHAT THE PERSON MARKED. A goal is done when they said
//     so (its status is `historical`), never because a map has a step on it.
//   — A SUGGESTION IS NOT A DECISION. Nodes Socria proposed (`origin` socria)
//     are not counted as established; the synthesis says whose reading it is.
//   — THE OVERVIEW QUOTES. Its themes and open questions are labels from the
//     person's own maps, never paraphrased into something they did not say.
//
// The visual is chosen, not imposed: a research project is drawn as evidence,
// a plan as a road, a course as a concept map — read from what the maps were
// building (lib/representation.ts) and what kind of thinking they held. Every
// kind the content can support is offered, so the choice is theirs to change.
//
// PURE: no React, no storage, no network, no clock (`now` is passed in).

import type { ThinkingMap } from '@/lib/logos';
import { normalize } from '@/lib/mind/types';

// ── the shapes ──────────────────────────────────────────────────────

export interface HomeChat {
  id: string;
  title: string;
  kind: 'chat' | 'logos';
  updatedAt: number;
  createdAt?: number;
  /** a Logos chat's map, read lightly (atlasMapOf); null for a Core chat */
  map?: ThinkingMap | null;
  /** the person wrote in its Draft Space */
  hasDraft?: boolean;
}

export interface HomeGoal {
  id: string;
  label: string;
  content?: string;
  /** `historical` = marked done by the person; anything live is open */
  status: string;
}

export interface HomeFile {
  id: string;
  name: string;
  bytes: number;
  createdAt: number;
}

export type VisualKind = 'ideas' | 'concepts' | 'evidence' | 'roadmap' | 'timeline' | 'models';

export const VISUAL_NAME: Record<VisualKind, string> = {
  ideas: 'Idea map',
  concepts: 'Concept map',
  evidence: 'Evidence',
  roadmap: 'Roadmap',
  timeline: 'Timeline',
  models: 'Models',
};

export interface VisualChoice {
  kind: VisualKind;
  /** one line on why this one, in plain words */
  why: string;
  /** every kind the content can support, best first */
  available: VisualKind[];
}

export interface Overview {
  /** the sentence at the top */
  line: string;
  /** ideas that recur across conversations, most connective first — their own words */
  themes: string[];
  /** true when the themes really recur; false when they are only the most connected */
  recurring: boolean;
  /** questions still on their maps, newest conversation first — their own words */
  open: string[];
  goals: { open: number; done: number };
  counts: { chats: number; logos: number; core: number; files: number; models: number; plots: number };
}

export interface ContinueWith {
  id: string;
  kind: 'chat' | 'logos';
  title: string;
  why: string;
}

export interface Resource {
  /** what it is */
  kind: 'workspace' | 'model' | 'plot' | 'note' | 'file';
  label: string;
  sub?: string;
  /** where it lives: the chat to open, or the file's id */
  chatId?: string;
  fileId?: string;
  at: number;
}

export interface ChatGroup {
  label: string;
  chats: HomeChat[];
}

// ── reading the maps ────────────────────────────────────────────────

const QUESTION_TYPES = new Set(['question', 'unknown']);
const MECHANICS = new Set(['step', 'transformation', 'verification', 'error', 'result', 'inference', 'equation']);

/** A node someone could call an idea of theirs: not mechanics, not Socria's suggestion. */
function theirs(n: { type?: string; label?: string; origin?: string }): boolean {
  return !!n && typeof n.label === 'string' && !!normalize(n.label) && !MECHANICS.has(String(n.type)) && n.origin !== 'socria';
}

/** Labels that recur across chats, with how many chats each is in. */
function recurring(chats: HomeChat[]): { label: string; n: number; type: string }[] {
  const by = new Map<string, { label: string; chats: Set<string>; type: string; deg: number }>();
  // oldest first, so an idea is named the way it was first said
  const inOrder = [...chats].sort((a, b) => (a.createdAt || a.updatedAt) - (b.createdAt || b.updatedAt));
  for (const c of inOrder) {
    const map = c.map;
    if (!map?.nodes) continue;
    const deg = new Map<string, number>();
    for (const e of map.edges ?? []) {
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    for (const n of map.nodes) {
      if (!theirs(n as any) || QUESTION_TYPES.has(n.type)) continue;
      const key = normalize(n.label);
      const r = by.get(key) ?? { label: n.label.trim(), chats: new Set<string>(), type: n.type, deg: 0 };
      r.chats.add(c.id);
      r.deg += deg.get(n.id) ?? 0;
      by.set(key, r);
    }
  }
  return [...by.values()]
    .map((r) => ({ label: r.label, n: r.chats.size, type: r.type, deg: r.deg }))
    .sort((a, b) => b.n - a.n || b.deg - a.deg || a.label.localeCompare(b.label));
}

// ── the visual ──────────────────────────────────────────────────────

const BUILDING_TO: Record<string, VisualKind> = {
  process: 'roadmap', plan: 'roadmap', timeline: 'timeline',
  research: 'evidence', argument: 'evidence', model: 'models',
  decision: 'ideas', comparison: 'ideas', brainstorm: 'ideas', system: 'concepts',
};
const CONTEXT_TO: Record<string, VisualKind> = {
  learning: 'concepts', math: 'concepts', researching: 'evidence', analysing: 'evidence',
  planning: 'roadmap', deciding: 'ideas', brainstorming: 'ideas', creating: 'ideas',
  writing: 'ideas', reflecting: 'ideas',
};
const TYPE_TO: Record<string, VisualKind> = {
  evidence: 'evidence', source: 'evidence', claim: 'evidence', counterpoint: 'evidence',
  concept: 'concepts', definition: 'concepts', theorem: 'concepts', axiom: 'concepts', lemma: 'concepts', misconception: 'concepts',
  milestone: 'roadmap', constraint: 'roadmap', goal: 'roadmap',
};

const WHY: Record<VisualKind, string> = {
  ideas: 'The ideas across these conversations, and how they connect.',
  concepts: 'Mostly learning — the concepts, and what each one rests on.',
  evidence: 'Mostly research — the claims, and the evidence for and against them.',
  roadmap: 'Mostly planning — the goals and the steps toward them.',
  timeline: 'Worked on over time — what came up, and when.',
  models: 'Built around models and plots — each one, where it was made.',
};

export function chooseVisual(chats: HomeChat[], goals: HomeGoal[] = []): VisualChoice {
  const score: Record<VisualKind, number> = { ideas: 0.5, concepts: 0, evidence: 0, roadmap: 0, timeline: 0, models: 0 };
  for (const c of chats) {
    const m = c.map;
    if (!m) continue;
    const b = (m as any).building?.kind as string | undefined;
    if (b && BUILDING_TO[b]) score[BUILDING_TO[b]] += 3;
    const ctx = (m as any).context as string | undefined;
    if (ctx && CONTEXT_TO[ctx]) score[CONTEXT_TO[ctx]] += 2;
    for (const n of m.nodes ?? []) {
      const k = TYPE_TO[n.type];
      if (k) score[k] += 0.3;
    }
    if (m.models?.docs?.length) score.models += 2 * m.models.docs.length;
    if (m.viz) score.models += 1;
  }
  if (goals.length >= 2) score.roadmap += 1.5;
  const times = chats.map((c) => c.updatedAt).filter((t) => t > 0);
  const span = times.length ? Math.max(...times) - Math.min(...times) : 0;
  if (chats.length >= 4 && span > 14 * 86_400_000) score.timeline += 1.5;

  const order = (Object.keys(score) as VisualKind[]).sort((a, b) => score[b] - score[a] || a.localeCompare(b));
  const available = order.filter((k) => {
    if (k === 'ideas') return true;
    if (k === 'timeline') return chats.length >= 2;
    if (k === 'roadmap') return score.roadmap > 0 || goals.length > 0;
    return score[k] > 0;
  });
  const kind = available[0] ?? 'ideas';
  return { kind, why: WHY[kind], available };
}

// ── the overview ────────────────────────────────────────────────────

const DAY = 86_400_000;
export function ago(t: number, now: number): string {
  const d = Math.floor((now - t) / DAY);
  if (!t || d < 0) return 'recently';
  if (d === 0) return 'today';
  if (d === 1) return 'yesterday';
  if (d < 7) return `${d} days ago`;
  if (d < 14) return 'last week';
  if (d < 60) return `${Math.round(d / 7)} weeks ago`;
  return `${Math.round(d / 30)} months ago`;
}
const monthOf = (t: number) =>
  new Date(t).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });

/** Open questions, newest conversation first, their own words. */
export function openQuestions(chats: HomeChat[], limit = 5): { label: string; chatId: string }[] {
  const out: { label: string; chatId: string }[] = [];
  const seen = new Set<string>();
  for (const c of [...chats].sort((a, b) => b.updatedAt - a.updatedAt)) {
    for (const n of c.map?.nodes ?? []) {
      if (!QUESTION_TYPES.has(n.type) || !theirs(n as any)) continue;
      // a question the map itself marks resolved is not open
      if ((n as any).status === 'resolved' || (n as any).status === 'answered') continue;
      const key = normalize(n.label);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ label: n.label.trim(), chatId: c.id });
      if (out.length >= limit) return out;
    }
  }
  return out;
}

export function overview(
  input: { chats: HomeChat[]; goals: HomeGoal[]; files: HomeFile[]; createdAt?: number },
  now: number
): Overview {
  const chats = [...input.chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const logos = chats.filter((c) => c.kind === 'logos').length;
  const models = chats.reduce((n, c) => n + (c.map?.models?.docs?.length ?? 0), 0);
  const plots = chats.filter((c) => c.map?.viz).length;
  const done = input.goals.filter((g) => g.status === 'historical').length;
  const counts = { chats: chats.length, logos, core: chats.length - logos, files: input.files.length, models, plots };
  // "You keep coming back to" is a claim; it is only made of ideas that did
  // come back. With none, the most connected few are offered as what the
  // Project is mostly about — and labelled that way.
  const all = recurring(chats);
  const again = all.filter((r) => r.n >= 2);
  const themes = (again.length ? again : all.slice(0, 3)).slice(0, 5).map((r) => r.label);
  const open = openQuestions(chats, 4).map((q) => q.label);

  let line: string;
  if (!chats.length) {
    line = input.files.length
      ? `Nothing discussed here yet — ${input.files.length} ${input.files.length === 1 ? 'file is' : 'files are'} waiting.`
      : 'Nothing here yet. Start a conversation and this page fills in as you think.';
  } else {
    const first = Math.min(...chats.map((c) => c.createdAt || c.updatedAt));
    const parts = [
      `${chats.length} ${chats.length === 1 ? 'conversation' : 'conversations'}${logos && logos < chats.length ? ` (${logos} in Logos)` : logos ? ' in Logos' : ''}`,
    ];
    if (first && now - first > 20 * DAY) parts.push(`since ${monthOf(first)}`);
    line = `${parts.join(' ')}. Last worked on ${ago(chats[0].updatedAt, now)}: “${chats[0].title || 'Untitled'}”.`;
  }
  return { line, themes, recurring: again.length > 0, open, goals: { open: input.goals.length - done, done }, counts };
}

// ── continuing ──────────────────────────────────────────────────────

/**
 * The conversation to pick up. The most recent, unless a nearly-as-recent one
 * still holds open questions — then that one, and it says why.
 */
export function continueWith(chats: HomeChat[], now: number): ContinueWith | null {
  if (!chats.length) return null;
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const latest = sorted[0];
  const openIn = (c: HomeChat) => openQuestions([c], 9).length;
  const pick =
    !openIn(latest) && sorted[1] && openIn(sorted[1]) && latest.updatedAt - sorted[1].updatedAt < 2 * DAY ? sorted[1] : latest;
  const q = openIn(pick);
  const why = `${pick.kind === 'logos' ? 'Logos' : 'Chat'} · ${ago(pick.updatedAt, now)}${q ? ` · ${q} open ${q === 1 ? 'question' : 'questions'}` : ''}`;
  return { id: pick.id, kind: pick.kind, title: pick.title || 'Untitled', why };
}

// ── resources ───────────────────────────────────────────────────────

const PLOT_NAME: Record<string, string> = {
  function: 'Function plot', derivative: 'Derivative', limit: 'Limit', riemann: 'Riemann sum', taylor: 'Taylor series',
  sequence: 'Sequence', vectors: 'Vectors', matrix: 'Matrix', distribution: 'Distribution', ode: 'Differential equation',
  'supply-demand': 'Supply and demand', ppc: 'Production possibilities', 'ad-as': 'AD–AS', simulation: 'Simulation', scene: 'Scene',
};

export function resources(chats: HomeChat[], files: HomeFile[]): Resource[] {
  const out: Resource[] = [];
  for (const c of chats) {
    if (c.kind === 'logos') {
      const n = c.map?.nodes?.length ?? 0;
      out.push({ kind: 'workspace', label: c.title || 'Untitled', sub: n ? `${n} ${n === 1 ? 'idea' : 'ideas'} on the map` : 'An empty map', chatId: c.id, at: c.updatedAt });
    }
    for (const d of c.map?.models?.docs ?? []) {
      if (d?.title) out.push({ kind: 'model', label: d.title, sub: `in “${c.title || 'Untitled'}”`, chatId: c.id, at: c.updatedAt });
    }
    const v = c.map?.viz as { kind?: string; expr?: string; sim?: { object?: string } } | undefined;
    if (v?.kind) {
      const name = v.kind === 'simulation' && v.sim?.object ? `${v.sim.object.replace(/-/g, ' ')} simulation` : PLOT_NAME[v.kind] ?? v.kind;
      out.push({ kind: 'plot', label: name.charAt(0).toUpperCase() + name.slice(1), sub: v.expr ? v.expr : `in “${c.title || 'Untitled'}”`, chatId: c.id, at: c.updatedAt });
    }
    if (c.hasDraft) out.push({ kind: 'note', label: `Draft — ${c.title || 'Untitled'}`, sub: 'Your writing, kept with its map', chatId: c.id, at: c.updatedAt });
  }
  for (const f of files) out.push({ kind: 'file', label: f.name, sub: kb(f.bytes), fileId: f.id, at: f.createdAt });
  return out.sort((a, b) => b.at - a.at);
}
const kb = (b: number) => (b >= 1_048_576 ? `${(b / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

// ── grouping a long list ────────────────────────────────────────────

/** This week, earlier this month, then by month — a list of fifty still reads. */
export function groupChats(chats: HomeChat[], now: number): ChatGroup[] {
  const sorted = [...chats].sort((a, b) => b.updatedAt - a.updatedAt);
  const groups: ChatGroup[] = [];
  const push = (label: string, c: HomeChat) => {
    const g = groups[groups.length - 1];
    if (g && g.label === label) g.chats.push(c);
    else groups.push({ label, chats: [c] });
  };
  const thisMonth = monthOf(now);
  for (const c of sorted) {
    const d = (now - c.updatedAt) / DAY;
    if (d < 7) push('This week', c);
    else if (monthOf(c.updatedAt) === thisMonth) push('Earlier this month', c);
    else push(monthOf(c.updatedAt), c);
  }
  return groups;
}

// ── synthesis ───────────────────────────────────────────────────────

export interface SynthItem {
  text: string;
  /** the conversations it was read from — ids that exist in the Project */
  chats: string[];
}

export interface ProjectSynthesis {
  /** a short paragraph: what the Project is, as the work stands */
  summary: string;
  established: SynthItem[];
  unresolved: SynthItem[];
  contradictions: SynthItem[];
  improvements: SynthItem[];
  /** who read it: the model, or the structure alone */
  source: 'model' | 'structure';
}

/**
 * The reading the structure alone supports, used when no model is available
 * and as the floor the model's reading is checked against.
 *
 *   established   — ideas the person returned to in more than one
 *                   conversation, or that their own evidence supports
 *   unresolved    — questions still on their maps
 *   contradictions— what their maps mark as conflicting, and tensions
 *   improvements  — open goals no conversation has touched, and questions
 *                   left open the longest
 */
export function synthesizeFromStructure(chats: HomeChat[], goals: HomeGoal[], now: number): ProjectSynthesis {
  const est = new Map<string, SynthItem>();
  const add = (m: Map<string, SynthItem>, label: string, chat: string) => {
    const k = normalize(label);
    const it = m.get(k) ?? { text: label.trim(), chats: [] };
    if (!it.chats.includes(chat)) it.chats.push(chat);
    m.set(k, it);
  };
  const conflicts = new Map<string, SynthItem>();
  const seenIn = new Map<string, Set<string>>();
  for (const c of chats) {
    const nodes = new Map((c.map?.nodes ?? []).map((n) => [n.id, n]));
    for (const n of c.map?.nodes ?? []) {
      if (!theirs(n as any) || QUESTION_TYPES.has(n.type)) continue;
      const k = normalize(n.label);
      (seenIn.get(k) ?? seenIn.set(k, new Set()).get(k)!).add(c.id);
      if (n.type === 'tension') add(conflicts, n.label, c.id);
    }
    for (const e of c.map?.edges ?? []) {
      const a = nodes.get(e.from);
      const b = nodes.get(e.to);
      if (!a || !b) continue;
      if (e.relation === 'conflicts' && theirs(a as any) && theirs(b as any)) add(conflicts, `${a.label.trim()} — and — ${b.label.trim()}`, c.id);
      if (e.relation === 'supports' && (a.type === 'evidence' || a.type === 'source') && theirs(b as any) && !QUESTION_TYPES.has(b.type)) add(est, b.label, c.id);
    }
  }
  for (const c of chats) {
    for (const n of c.map?.nodes ?? []) {
      const k = normalize(n.label ?? '');
      if ((seenIn.get(k)?.size ?? 0) >= 2) add(est, n.label, c.id);
    }
  }
  const open = openQuestions(chats, 8);
  const unresolved = open.map((q) => ({ text: q.label, chats: [q.chatId] }));
  const touched = new Set(chats.flatMap((c) => (c.map?.nodes ?? []).map((n) => normalize(n.label ?? ''))));
  const improvements: SynthItem[] = goals
    .filter((g) => g.status !== 'historical' && !touched.has(normalize(g.label)))
    .slice(0, 4)
    .map((g) => ({ text: `“${g.label}” is a goal no conversation here has worked on yet.`, chats: [] }));
  const stale = open.filter((q) => {
    const c = chats.find((x) => x.id === q.chatId);
    return c && now - c.updatedAt > 21 * DAY;
  });
  for (const q of stale.slice(0, 2)) improvements.push({ text: `“${q.label}” has been open for a while.`, chats: [q.chatId] });

  const established = [...est.values()].sort((a, b) => b.chats.length - a.chats.length).slice(0, 8);
  const summary = chats.length
    ? `Read from the structure of ${chats.length} ${chats.length === 1 ? 'conversation' : 'conversations'}: ${established.length} ${established.length === 1 ? 'idea holds' : 'ideas hold'} across them, ${unresolved.length} ${unresolved.length === 1 ? 'question is' : 'questions are'} open${conflicts.size ? `, and ${conflicts.size} ${conflicts.size === 1 ? 'thing pulls' : 'things pull'} against another` : ''}.`
    : 'There is nothing here to synthesize yet.';
  return {
    summary,
    established,
    unresolved,
    contradictions: [...conflicts.values()].slice(0, 6),
    improvements,
    source: 'structure',
  };
}

/** What the model is given: the Project's own structure, compact, nothing personal beyond it. */
export function synthesisDigest(
  project: { name: string; description?: string },
  chats: HomeChat[],
  goals: HomeGoal[],
  files: HomeFile[]
): string {
  const lines: string[] = [`PROJECT: ${project.name}`];
  if (project.description) lines.push(`DESCRIPTION: ${project.description.slice(0, 400)}`);
  if (goals.length) {
    lines.push('GOALS (status as the person marked it):');
    for (const g of goals.slice(0, 12)) lines.push(`- ${g.label}${g.status === 'historical' ? ' [done]' : ''}`);
  }
  if (files.length) lines.push(`FILES: ${files.slice(0, 12).map((f) => f.name).join(', ')}`);
  lines.push('CONVERSATIONS (newest first):');
  for (const c of [...chats].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 30)) {
    lines.push(`## [${c.id}] ${c.title || 'Untitled'} (${c.kind === 'logos' ? 'Logos' : 'Core'})`);
    const nodes = (c.map?.nodes ?? []).filter((n) => theirs(n as any)).slice(0, 18);
    for (const n of nodes) lines.push(`  - (${n.type}) ${n.label.slice(0, 120)}`);
    const byId = new Map((c.map?.nodes ?? []).map((n) => [n.id, n.label]));
    for (const e of (c.map?.edges ?? []).slice(0, 18)) {
      if (e.relation === 'conflicts' || e.relation === 'supports' || e.relation === 'depends') {
        const a = byId.get(e.from);
        const b = byId.get(e.to);
        if (a && b) lines.push(`  * ${a.slice(0, 60)} —${e.relation}→ ${b.slice(0, 60)}`);
      }
    }
  }
  return lines.join('\n').slice(0, 14_000);
}

/**
 * The model's reading, held to the shape and to the Project: strings clipped,
 * lists bounded, and every conversation it cites one that is actually here.
 * A reading that cites nothing real for an "established" claim keeps the
 * claim but not the pretence of a source.
 */
export function sanitizeSynthesis(raw: unknown, chatIds: ReadonlySet<string>): ProjectSynthesis | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
  const items = (v: unknown): SynthItem[] =>
    (Array.isArray(v) ? v : [])
      .slice(0, 8)
      .map((x) => {
        const o = (x && typeof x === 'object' ? x : { text: x }) as Record<string, unknown>;
        const text = str(o.text, 280);
        const chats = (Array.isArray(o.chats) ? o.chats : []).filter((c): c is string => typeof c === 'string' && chatIds.has(c)).slice(0, 6);
        return { text, chats };
      })
      .filter((x) => x.text);
  const summary = str(r.summary, 700);
  if (!summary) return null;
  return {
    summary,
    established: items(r.established),
    unresolved: items(r.unresolved),
    contradictions: items(r.contradictions),
    improvements: items(r.improvements),
    source: 'model',
  };
}

// ── appearance ──────────────────────────────────────────────────────

/** The marks a Project can wear — drawn glyphs, not emoji, so they sit in the type. */
export const PROJECT_ICONS = ['folder', 'idea', 'question', 'evidence', 'concept', 'goal', 'milestone', 'theme', 'source', 'equation', 'character', 'value'] as const;
export type ProjectIcon = (typeof PROJECT_ICONS)[number];
/** Muted, and every one a token-backed pair so themes keep working. */
export const PROJECT_COLORS = ['moss', 'clay', 'slate', 'ochre', 'plum', 'ink'] as const;
export type ProjectColor = (typeof PROJECT_COLORS)[number];

export const cleanIcon = (v: unknown): ProjectIcon | null =>
  typeof v === 'string' && (PROJECT_ICONS as readonly string[]).includes(v) ? (v as ProjectIcon) : null;
export const cleanColor = (v: unknown): ProjectColor | null =>
  typeof v === 'string' && (PROJECT_COLORS as readonly string[]).includes(v) ? (v as ProjectColor) : null;

// ── the whole home ──────────────────────────────────────────────────

export interface HomeView {
  overview: Overview;
  visual: VisualChoice;
  continueWith: ContinueWith | null;
  resources: Resource[];
  groups: ChatGroup[];
  questions: { label: string; chatId: string }[];
}

export function buildHome(
  input: { chats: HomeChat[]; goals: HomeGoal[]; files: HomeFile[]; createdAt?: number },
  now: number
): HomeView {
  return {
    overview: overview(input, now),
    visual: chooseVisual(input.chats, input.goals),
    continueWith: continueWith(input.chats, now),
    resources: resources(input.chats, input.files),
    groups: groupChats(input.chats, now),
    questions: openQuestions(input.chats, 8),
  };
}
