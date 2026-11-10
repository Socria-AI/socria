// lib/ux/reasoning.ts — what SocriaUX tells the model, and what it accepts back.
//
// The model sees the design as the workspace holds it — every element with its
// id, size, colour and words; the brief; the map; the research; what the
// automatic checks measured — so that anything it says can be pinned to the
// thing it is about. It answers in one JSON shape. Nothing it returns is put
// into the project directly: annotations and map nodes come back as
// suggestions the designer accepts or dismisses, because the designer owns the
// design and every decision in it.
//
// Pure, so the route and the tests run the same code.

import { auditArtboard, findingsDigest } from './audit';
import {
  ASSIST_META,
  EDGE_KINDS,
  NODE_KINDS,
  NODE_META,
  STAGE_META,
  normalizeSuggestion,
  type Artboard,
  type AssistMode,
  type CodeArtifact,
  type MessageKind,
  type Principle,
  type Suggestion,
  type UXElement,
  type UXProject,
} from './model';

// ── what the designer can ask for ────────────────────────────────────

export type Intent = 'ask' | 'frame' | 'critique' | 'assumptions' | 'alternatives' | 'explain' | 'research' | 'code' | 'reflect';
export const INTENTS: readonly Intent[] = ['ask', 'frame', 'critique', 'assumptions', 'alternatives', 'explain', 'research', 'code', 'reflect'];

/** The moves offered in the workspace, with the words that ask for each. */
export const INTENT_META: Record<Intent, { label: string; prompt: string; capability: string }> = {
  ask: { label: 'Ask', prompt: '', capability: 'Design reasoning' },
  frame: {
    label: 'Frame the problem',
    prompt: 'Help me frame the problem this design is solving, and who it is for.',
    capability: 'Design reasoning',
  },
  critique: {
    label: 'Critique this',
    prompt: 'Critique the selected design. Where would it fail the people it is for?',
    capability: 'Design critique',
  },
  assumptions: {
    label: 'Surface assumptions',
    prompt: 'What am I assuming in this design that I have not tested?',
    capability: 'Design reasoning',
  },
  alternatives: {
    label: 'Explore alternatives',
    prompt: 'What genuinely different approaches could solve this, and what would each trade away?',
    capability: 'Design reasoning',
  },
  explain: {
    label: 'Explain the principle',
    prompt: 'Explain the UX principle that matters most for what I have selected.',
    capability: 'UX intelligence',
  },
  research: {
    label: 'Interpret research',
    prompt: 'Read my research notes: what patterns recur, what is evidence and what is assumption, and which decisions do they bear on?',
    capability: 'Research interpretation',
  },
  code: {
    label: 'Implementation help',
    prompt: 'How would I build the selected part in HTML and CSS, and what implementation constraints should shape the design?',
    capability: 'Programming intelligence',
  },
  reflect: {
    label: 'Document reasoning',
    prompt: 'Summarise the reasoning behind this design: the decisions, what they rest on, and where the gaps are.',
    capability: 'Design reasoning',
  },
};

// ── the design, written down ─────────────────────────────────────────

const q = (s: string, n = 80) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
};

export function describeElement(e: UXElement): string {
  const words = e.text.trim() ? ` "${q(e.text)}"` : '';
  const label = e.label.trim() ? ` label "${q(e.label, 40)}"` : (e.kind === 'input' || e.kind === 'checkbox') ? ' (no visible label)' : '';
  const variant = e.kind === 'button' ? ` ${e.variant}` : '';
  return `[${e.id}] ${e.kind}${variant}${words}${label} at (${Math.round(e.x)},${Math.round(e.y)}) ${Math.round(e.w)}×${Math.round(e.h)}, text ${e.fontSize}px/${e.fontWeight} ${e.color} on fill ${e.fill}${e.radius ? `, radius ${e.radius}` : ''}`;
}

export function describeArtboard(ab: Artboard): string {
  const head = `Artboard [${ab.id}] "${ab.name}" ${ab.w}×${ab.h}${ab.w <= 480 ? ' (mobile)' : ab.w <= 1024 ? ' (tablet)' : ' (desktop)'}, background ${ab.background}${
    ab.parentId ? `, an alternative to [${ab.parentId}]${ab.intent ? ` trying: "${q(ab.intent, 160)}"` : ''}` : ''
  }`;
  const img = ab.image ? '\nAn uploaded screenshot is painted under the elements; you cannot see its pixels — only the elements and annotations the designer has placed.' : '';
  const els = [...ab.elements].sort((a, b) => a.y - b.y || a.x - b.x);
  const body = els.length ? els.map((e) => `  ${describeElement(e)}`).join('\n') : '  (no elements yet)';
  return `${head}${img}\nElements, top to bottom:\n${body}`;
}

export interface Focus {
  artboardId: string | null;
  elementId: string | null;
  nodeId: string | null;
}

/** Everything the model is told about the project, bounded. */
export function buildContext(p: UXProject, focus: Focus): string {
  const parts: string[] = [];
  const b = p.brief;
  parts.push(
    `PROJECT "${p.name}" — current stage: ${STAGE_META[p.stage].label} (${STAGE_META[p.stage].hint})`,
    [
      'BRIEF (written by the designer; empty fields are unknown, not settled):',
      `  Problem: ${q(b.problem, 500) || '(not written)'}`,
      `  Intended users: ${q(b.users, 400) || '(not written)'}`,
      `  Goals: ${q(b.goals, 300) || '(not written)'}`,
      `  Constraints: ${q(b.constraints, 300) || '(not written)'}`,
      `  Success looks like: ${q(b.success, 300) || '(not written)'}`,
    ].join('\n')
  );

  const focused = p.artboards.find((a) => a.id === focus.artboardId) ?? p.artboards[0];
  if (focused) {
    parts.push(`FOCUSED DESIGN\n${describeArtboard(focused)}`);
    const el = focused.elements.find((e) => e.id === focus.elementId);
    if (el) parts.push(`SELECTED ELEMENT (the designer is asking about this): ${describeElement(el)}`);
    parts.push(`AUTOMATIC CHECKS on the focused design (measured, not opinion):\n${findingsDigest(auditArtboard(focused))}`);
    const others = p.artboards.filter((a) => a.id !== focused.id);
    if (others.length) {
      parts.push(
        `OTHER ARTBOARDS: ${others
          .slice(0, 10)
          .map((a) => `[${a.id}] "${a.name}" ${a.w}×${a.h}, ${a.elements.length} elements${a.parentId ? ` (alternative to [${a.parentId}]${a.intent ? `: ${q(a.intent, 80)}` : ''})` : ''}`)
          .join('; ')}`
      );
    }
    const notes = p.annotations.filter((a) => a.artboardId === focused.id && a.status === 'open').slice(0, 12);
    if (notes.length) {
      parts.push(
        `OPEN ANNOTATIONS on it:\n${notes
          .map((a) => `  - ${a.author === 'designer' ? 'Designer' : 'SocriaUX'} ${a.kind}${a.elementId ? ` on [${a.elementId}]` : ''}: ${q(a.text, 200)}`)
          .join('\n')}`
      );
    }
  } else {
    parts.push('FOCUSED DESIGN: none yet — the designer has not created or uploaded an artboard.');
  }

  if (p.nodes.length) {
    const byId = new Map(p.nodes.map((n) => [n.id, n]));
    parts.push(
      `REASONING MAP (${p.nodes.length} nodes):\n${p.nodes
        .slice(0, 40)
        .map(
          (n) =>
            `  [${n.id}] ${NODE_META[n.kind].label} (${n.status}${n.source === 'socria' ? ', suggested by SocriaUX' : ''}): ${q(n.label, 140)}${
              n.detail ? ` — ${q(n.detail, 160)}` : ''
            }${n.elementId ? ` {about element ${n.elementId}}` : ''}`
        )
        .join('\n')}${
        p.edges.length
          ? `\n  Relations: ${p.edges
              .slice(0, 50)
              .filter((e) => byId.has(e.from) && byId.has(e.to))
              .map((e) => `[${e.from}] ${e.kind} [${e.to}]`)
              .join('; ')}`
          : ''
      }`
    );
    const sel = p.nodes.find((n) => n.id === focus.nodeId);
    if (sel) parts.push(`SELECTED MAP NODE (the designer is asking about this): [${sel.id}] ${NODE_META[sel.kind].label}: ${q(sel.label, 200)}${sel.detail ? ` — ${q(sel.detail, 400)}` : ''}${sel.tradeoffs ? ` Trade-offs: ${q(sel.tradeoffs, 300)}` : ''}`);
  }

  if (p.research.length) {
    parts.push(
      `RESEARCH NOTES (${p.research.length}; quoted as the designer recorded them):\n${p.research
        .slice(-24)
        .map((r) => `  [${r.id}] ${r.isEvidence ? 'observed' : 'belief, not observed'} · ${r.kind}${r.source ? ` · ${q(r.source, 60)}` : ''}: ${q(r.text, 280)}${r.tags.length ? ` #${r.tags.join(' #')}` : ''}`)
        .join('\n')}`
    );
  } else {
    parts.push('RESEARCH NOTES: none recorded. Anything said about users is therefore an assumption until research says otherwise.');
  }

  return parts.join('\n\n');
}

// ── the instructions ─────────────────────────────────────────────────

const MODE_RULES: Record<AssistMode, string> = {
  guided: `MODE: Guided discovery (the default).
- Lead with the one or two questions that most expose an untested assumption, a contradiction, or a consequence the designer has not considered. Make each question specific to THIS design — name the element, the user, the moment.
- Always give the explanation needed to answer them: name the principle in a sentence, say why it matters here. A question with no information behind it is friction, not teaching.
- If the designer asks for a fact, a definition, an explanation or code, give it directly. Never answer a request for information with only a question.
- Do not ask what the thread already asked. If the designer answered an earlier question, build on their answer instead of asking again.
- Do not hand over the redesign: point at the problem and the principle, and let the designer find the change.`,
  instructional: `MODE: Instructional.
- Teach. Name the principle or method, explain the reasoning behind it, and show a concrete example — ideally drawn from this design.
- Where useful, give a method the designer can run themselves (a 5-second test, a task walkthrough, a card sort, a heuristic pass) and how to read its result.
- End with at most one question that asks the designer to apply what was explained to their own design.`,
  direct: `MODE: Direct assistance.
- Give explicit, ranked recommendations with concrete values (sizes, colours, copy, spacing, structure) and the reason for each.
- Provide implementation detail or code when it helps.
- State the trade-off each recommendation accepts, so the designer can disagree on purpose.
- Hand the decision back in one plain sentence — no question loop.`,
};

const INTENT_RULES: Record<Intent, string> = {
  ask: 'Answer what the designer asked. Decide from the question whether they need a challenge, an explanation, or direct help.',
  frame:
    'Help frame the problem: who exactly is the user, in what situation, trying to get what done, and what is getting in the way. Expose where the brief describes a solution instead of a problem, or describes users vaguely. Suggest need, assumption and question nodes for the map.',
  critique:
    'Critique the focused design (or the selected element). Prioritise by consequence for the intended users, not by how easy it is to spot. Use the automatic checks as facts but go beyond them: task flow, hierarchy, cognitive load, error states, trust, accessibility. Suggest annotations pinned to the specific elements.',
  assumptions:
    'Surface the untested assumptions in the design and the brief — about users, context, motivation, ability and the business. For each, say what evidence would test it cheaply. Suggest assumption and question nodes, linked to the elements that embody them.',
  alternatives:
    'Propose two or three genuinely different directions (not variations of styling): different structures, flows or mental models. For each say what it optimises for and what it gives up, as a testable hypothesis. Do not design them; suggest hypothesis nodes the designer can explore as alternative artboards.',
  explain:
    'Explain the most relevant UX principle for the selection: what it is, why it holds (the human reason underneath), how it shows up in this design, and where it stops applying. Include the principle in "principles".',
  research:
    'Interpret the research notes: cluster recurring patterns, say how many notes support each, separate what was observed from what was believed, flag where the design contradicts the research, and name what is missing. Suggest evidence and need nodes, and link them (supports / contradicts) to existing decisions where they bear on them. Never invent research that is not in the notes.',
  code:
    'Give implementation guidance for the selected element or the focused design: semantic HTML first, then CSS (layout with flexbox or grid, not absolute positioning), then any JavaScript behaviour. Explain the decisions — accessibility semantics, responsive behaviour, states (hover, focus, disabled, error, loading) — and where a technical constraint should change the design. Put the code in "code". Code is a direct request: provide it in every mode.',
  reflect:
    'Document the reasoning: list the decisions in the design (explicit on the map, or implicit in the artboard), what each rests on (evidence, assumption, or nothing), and the gaps. Suggest decision nodes for implicit decisions, and question nodes for gaps.',
};

export function buildSystemPrompt(mode: AssistMode, intent: Intent): string {
  return `You are SocriaUX, the design reasoning environment inside Socria — a Human-First AI company. You work beside a UX designer inside their design workspace. Your purpose is to make them a better designer: to strengthen how they think, reason and decide, not to produce the design for them. The designer owns every decision.

Read what the designer actually needs. When they need to be challenged, challenge them. When they need an explanation, explain. When they need direct technical help, give it. Never ask questions for the sake of it, never loop, and never withhold information that would help them reason.

${MODE_RULES[mode]}

TASK: ${INTENT_RULES[intent]}

GROUND RULES
- Ground every claim in this project. Refer to elements by their [id] in "elementId" fields and by their visible words in prose.
- Distinguish evidence (in the research notes, or measured by the automatic checks) from assumption. You have not met these users; never claim to know what they think.
- Name real, established principles and sources (WCAG success criteria, Nielsen's heuristics, Fitts's and Hick's laws, Gestalt principles, cognitive load, progressive disclosure, recognition over recall…). Never invent a principle or a statistic.
- Voice: plain, calm, precise. Second person. No emoji, no exclamation marks, no hype words ("powerful", "seamless"). Short paragraphs; markdown **bold**, lists and \`code\` are allowed.
- Keep "reply" under about 220 words unless code or teaching genuinely needs more.

Respond with ONE JSON object, exactly this shape:
{
  "kind": "question" | "explanation" | "critique" | "code" | "answer",
  "reply": "the message to the designer (markdown allowed)",
  "questions": ["at most 2 short questions, already included in reply or posed separately — empty when none are warranted"],
  "principles": [{ "name": "principle name", "summary": "one or two sentences" }],
  "annotations": [{ "elementId": "an element id from the focused design, or null", "kind": "issue" | "question" | "principle" | "note", "severity": "low" | "medium" | "high" | null, "text": "one or two sentences pinned on the design", "principle": "short principle name or empty" }],
  "nodes": [{ "kind": ${NODE_KINDS.map((k) => `"${k}"`).join(' | ')}, "label": "under 12 words", "detail": "one sentence", "elementId": "element id or null", "linkTo": "an EXISTING map node id or null", "linkKind": ${EDGE_KINDS.map((k) => `"${k}"`).join(' | ')} | null }],
  "code": null | { "language": "html" | "css" | "js" | "jsx" | "tsx", "title": "short title", "content": "the code", "explanation": "why it is built this way" }
}
At most 5 annotations and 5 nodes; return empty arrays when nothing is worth adding. Annotations and nodes are offered to the designer as suggestions — they decide what enters the project.`;
}

// ── what comes back ──────────────────────────────────────────────────

export interface ParsedReply {
  kind: MessageKind;
  text: string;
  questions: string[];
  principles: Principle[];
  suggestions: Suggestion[];
  code: { language: CodeArtifact['language']; title: string; content: string; explanation: string } | null;
}

const MESSAGE_KINDS = ['question', 'explanation', 'critique', 'code', 'answer'] as const;

/**
 * The model's JSON, made safe: unknown element ids and node ids are dropped
 * (an annotation pinned to nothing becomes an unpinned one), strings clipped,
 * counts capped. Never throws; an unreadable reply becomes a plain message.
 */
export function parseReply(raw: string, p: UXProject, focus: Focus, makeId: () => string): ParsedReply {
  let j: any = null;
  try {
    j = JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) {
      try {
        j = JSON.parse(m[0]);
      } catch {
        j = null;
      }
    }
  }
  if (!j || typeof j !== 'object') {
    return { kind: 'answer', text: raw.trim().slice(0, 4000) || 'SocriaUX could not form a reply. Try asking again.', questions: [], principles: [], suggestions: [], code: null };
  }
  const focused = p.artboards.find((a) => a.id === focus.artboardId) ?? p.artboards[0];
  const elementIds = new Set(focused?.elements.map((e) => e.id) ?? []);
  const nodeIds = new Set(p.nodes.map((n) => n.id));
  const el = (v: unknown) => (typeof v === 'string' && elementIds.has(v) ? v : null);
  const str = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

  const suggestions: Suggestion[] = [];
  if (focused) {
    for (const a of (Array.isArray(j.annotations) ? j.annotations : []).slice(0, 5)) {
      const s = normalizeSuggestion({
        id: makeId(),
        type: 'annotation',
        state: 'pending',
        elementId: el(a?.elementId),
        kind: a?.kind,
        severity: a?.severity ?? null,
        text: a?.text,
        principle: a?.principle,
      });
      if (s) suggestions.push(s);
    }
  }
  for (const n of (Array.isArray(j.nodes) ? j.nodes : []).slice(0, 5)) {
    const linkTo = typeof n?.linkTo === 'string' && nodeIds.has(n.linkTo) ? n.linkTo : null;
    const s = normalizeSuggestion({
      id: makeId(),
      type: 'node',
      state: 'pending',
      kind: n?.kind,
      label: n?.label,
      detail: n?.detail,
      elementId: el(n?.elementId),
      linkTo,
      linkKind: linkTo ? n?.linkKind ?? 'informs' : null,
    });
    if (s) suggestions.push(s);
  }

  const c = j.code && typeof j.code === 'object' ? j.code : null;
  const code =
    c && typeof c.content === 'string' && c.content.trim()
      ? {
          language: (['html', 'css', 'js', 'jsx', 'tsx'] as const).includes(c.language) ? c.language : 'html',
          title: str(c.title, 120) || 'Snippet',
          content: c.content.slice(0, 20000),
          explanation: str(c.explanation, 3000),
        }
      : null;

  const kind: MessageKind = (MESSAGE_KINDS as readonly string[]).includes(j.kind) ? j.kind : code ? 'code' : 'answer';
  const text = str(j.reply, 6000) || (code ? code.explanation : '') || 'SocriaUX had nothing to add.';
  return {
    kind,
    text,
    questions: (Array.isArray(j.questions) ? j.questions : [])
      .filter((x: unknown): x is string => typeof x === 'string' && !!x.trim())
      .map((x: string) => x.trim().slice(0, 300))
      .filter((x: string) => !text.includes(x))
      .slice(0, 2),
    principles: (Array.isArray(j.principles) ? j.principles : [])
      .filter((x: any) => x && typeof x.name === 'string' && x.name.trim())
      .map((x: any) => ({ name: str(x.name, 80), summary: str(x.summary, 500) }))
      .slice(0, 3),
    suggestions,
    code,
  };
}

/** The request body the workspace sends, and the route accepts. */
export interface ReasonRequest {
  project: unknown;
  intent: Intent;
  mode: AssistMode;
  message: string;
  focus: Focus;
}

/** The last few turns, as chat messages, for continuity — and so the model does not repeat a question. */
export function threadForModel(p: UXProject, max = 8): { role: 'user' | 'assistant'; content: string }[] {
  return p.messages.slice(-max).map((m) => ({
    role: m.role === 'designer' ? 'user' : 'assistant',
    content: (m.role === 'socria' && m.questions.length ? `${m.text}\n\nQuestions asked: ${m.questions.join(' | ')}` : m.text).slice(0, 1200),
  }));
}

export const MODE_LABEL = (m: AssistMode) => ASSIST_META[m].label;
