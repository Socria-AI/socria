// lib/ux-v0/design.ts — from an understanding to a brief, from a brief to a design, and changing it.
//
// Three model tasks, each with its instructions and the code that holds the
// answer to its shape:
//
//   brief     the understanding and the kept references → a DesignBrief the
//             designer reviews, edits and approves (or refines in words).
//   generate  the approved brief → a DesignSpec (tokens + sections from the
//             library in lib/ux-v0/spec.ts), with real copy and moodboard
//             images only; unknown facts as [bracketed placeholders].
//   refine    a comment on a selected part of the generated design → one
//             typed patch (lib/ux-v0/spec.ts applyPatch), so a small change
//             touches only its section. If the change would work against the
//             brief or the people it serves, SocriaUX says so first and the
//             designer decides; a change of direction is offered as a new
//             generation rather than squeezed into a patch.

import { normQ, readQueries } from './discovery';
import { fontMenu } from './fonts';
import { libraryMenu, normalizePatch, normalizeSpec, specDigest, type DesignSpec, type Patch } from './spec';
import {
  normalizeBrief,
  obj,
  clean,
  type DesignBrief,
  type DiscoveryQuestion,
  type Moodboard,
  type SelectionContext,
  type Understanding,
} from './types';

// ── shared ───────────────────────────────────────────────────────────

const VOICE = 'Voice: plain, calm, precise. No emoji, no exclamation marks, no hype words ("powerful", "seamless", "revolutionary").';

function keptRefs(m: Moodboard): string {
  const kept = m.refs.filter((r) => r.state === 'kept');
  if (!kept.length) return 'none kept';
  return kept
    .map((r) => `- [${r.id}] ${r.category}: ${r.title || r.query}${r.width && r.height ? ` (${r.width > r.height * 1.15 ? 'landscape' : r.height > r.width * 1.15 ? 'portrait' : 'square'})` : ''}${r.color ? `, dominant ${r.color}` : ''}`)
    .join('\n');
}

function keptTaste(m: Moodboard): string {
  const pal = m.palettes.filter((p) => p.state === 'kept').map((p) => `${p.name}: ${p.colors.map((c) => `${c.role} ${c.hex}`).join(', ')}`);
  const type = m.type.filter((t) => t.state === 'kept').map((t) => `${t.display} / ${t.body}${t.note ? ` (${t.note})` : ''}`);
  return [pal.length ? `Palettes kept: ${pal.join(' | ')}` : '', type.length ? `Type kept: ${type.join(' | ')}` : ''].filter(Boolean).join('\n');
}

// ── the brief ────────────────────────────────────────────────────────

export interface BriefInput {
  intent: string;
  understanding: Understanding;
  questions: DiscoveryQuestion[];
  moodboard: Moodboard;
  /** refining: the brief as it stands, and what to change */
  current: DesignBrief | null;
  instruction: string;
}

export function briefSystem(refining: boolean): string {
  return `You are SocriaUX. ${refining ? 'Revise the design brief as the designer asks — change what they asked, keep everything else as it is, and if the request contradicts what the brief says about its audience or objective, keep the request but name the tension in openQuestions.' : 'Synthesise a design brief from what the designer has said and kept. It is theirs to review: be specific, faithful to their words, and honest about what is still undecided (openQuestions).'}

The brief:
- objective: what the design must achieve, in one or two sentences.
- audience: who exactly, in what situation.
- userGoals: 2–6 things those people come to do.
- personality: 3–5 adjectives for the brand.
- visualDirection: the look and feel, concretely (light, density, imagery, texture, contrast).
- palette: 5–7 colours as hex, each with a distinct role from: background, surface, text, muted, accent, accent-text, line. Text must read on background (aim for 7:1), muted text 4.5:1, accent-text on accent 4.5:1. Draw on kept palettes when there are any.
- typography: display and body, chosen ONLY from: ${fontMenu()}. Say why in "rationale".
- layoutDirection: structure and rhythm.
- functionalRequirements: what it must do (sections, forms, flows).
- references: ids of kept moodboard references the design should draw on (only ids given to you).
- openQuestions: what is still undecided.
- pageType: "website" or "app-screen"; platform: "web" or "mobile".${
    refining
      ? `
- moodboardQueries: ONLY when this change moves the visual direction (light, imagery, texture, mood): 1–3 searches for a licensed photo library that show the new direction, each {"category": "imagery|texture|composition", "query": "concrete subjects, materials, light"}, none repeating a search already used. Otherwise [].`
      : ''
  }

${VOICE}
Respond with ONE JSON object with exactly these fields.`;
}

export function briefUser(input: BriefInput): string {
  const answers = input.questions.filter((q) => q.answer).map((q) => `- [${q.topic}] ${q.question} → ${q.answer}`);
  return [
    `WHAT THEY WANT TO MAKE: “${input.intent}”`,
    input.understanding.summary ? `UNDERSTOOD: ${input.understanding.summary}` : '',
    answers.length ? `THEIR ANSWERS:\n${answers.join('\n')}` : '',
    `KEPT MOODBOARD REFERENCES:\n${keptRefs(input.moodboard)}`,
    keptTaste(input.moodboard),
    input.current ? `THE BRIEF AS IT STANDS:\n${JSON.stringify(input.current)}` : '',
    input.instruction ? `CHANGE: “${input.instruction}”` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseBrief(raw: unknown, moodboard: Moodboard): DesignBrief | null {
  const kept = new Set(moodboard.refs.filter((r) => r.state === 'kept').map((r) => r.id));
  return normalizeBrief(raw, kept);
}

/** The searches a refinement brings for the board when it moved the visual direction: at most three, none already used. */
export function briefQueries(raw: unknown, moodboard: Moodboard) {
  const used = new Set(moodboard.queries.map((q) => normQ(q.query)));
  return readQueries(obj(raw).moodboardQueries, used, 3);
}

// ── generating the design ────────────────────────────────────────────

export interface GenerateInput {
  brief: DesignBrief;
  moodboard: Moodboard;
  /** a new direction asked for in words, when regenerating */
  direction: string;
}

export function generateSystem(brief: DesignBrief): string {
  return `You are SocriaUX's design generator. Turn the approved brief into a design specification that a renderer draws. You do not write HTML: you choose tokens and sections from the library below and write their content.

THE LIBRARY (only these kinds, variants and fields; * marks required):
${libraryMenu(brief.pageType)}

Rules:
- Tokens: colors {background, surface, text, muted, accent, accentText, line} from the brief's palette roles; fonts {display, body} from the brief's typography; scale compact|comfortable|spacious; radius none|soft|round; style editorial|minimal|bold|warm|technical; imageTreatment natural|muted|warm|mono — all chosen to express the brief's personality and visual direction.
- Structure: ${brief.pageType === 'website' ? 'a nav first, a footer last; 5–9 sections between them, in the order a visitor needs them; one primary action, repeated at most twice.' : 'an app-nav first (tabbar for mobile, sidebar or topbar for web), then an app-header, then the content the screen exists for.'}
- Copy: real, specific to this brief, in the brand's voice. Never lorem ipsum. Headlines short and concrete. Facts you were not given — prices, addresses, dates, numbers, opening hours, people's names — are written as [bracketed placeholders] (e.g. "[Opening hours]", "[£ price]"); never invent them. A testimonial without a real source uses "[Customer name]".
- Images: only the moodboard ids listed below, in "images" on the sections that take them; prefer landscape for wide slots and portrait for tall ones. If there are none, choose variants that need no image.
- Every section has a short unique id (lowercase, hyphenated), a kind, a variant, content and images.

${VOICE}
Respond with ONE JSON object: {"title": "...", "pageType": "${brief.pageType}", "platform": "${brief.platform}", "tokens": {...}, "sections": [{"id": "...", "kind": "...", "variant": "...", "content": {...}, "images": ["..."]}]}`;
}

export function generateUser(input: GenerateInput): string {
  return [
    `THE APPROVED BRIEF:\n${JSON.stringify(input.brief)}`,
    `MOODBOARD IMAGES YOU MAY USE (id, category, subject, orientation):\n${keptRefs(input.moodboard)}`,
    input.direction ? `A NEW DIRECTION THE DESIGNER ASKED FOR: “${input.direction}”` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseGenerate(raw: unknown, brief: DesignBrief, moodboard: Moodboard, version: number, reason: string): DesignSpec | null {
  const r = obj(raw);
  const pal = Object.fromEntries(brief.palette.map((p) => [p.role, p.hex]));
  const t = obj(r.tokens);
  const colors = obj(t.colors);
  const tokens = {
    ...t,
    colors: {
      background: colors.background ?? pal.background,
      surface: colors.surface ?? pal.surface,
      text: colors.text ?? pal.text,
      muted: colors.muted ?? pal.muted,
      accent: colors.accent ?? pal.accent,
      accentText: colors.accentText ?? pal['accent-text'],
      line: colors.line ?? pal.line,
    },
    fonts: { display: obj(t.fonts).display ?? brief.typography.display, body: obj(t.fonts).body ?? brief.typography.body },
  };
  return normalizeSpec({ ...r, tokens, pageType: brief.pageType, platform: brief.platform, version, reason, createdAt: Date.now() }, moodboard);
}

// ── changing it ──────────────────────────────────────────────────────

export interface RefineInput {
  brief: DesignBrief | null;
  spec: DesignSpec;
  moodboard: Moodboard;
  selection: SelectionContext | null;
  comment: string;
  /** the designer has seen SocriaUX's concern and wants the change anyway */
  force: boolean;
}

export function refineSystem(): string {
  return `You are SocriaUX. The designer is changing a generated design by commenting on a part of it. Translate the comment into ONE patch to the design specification, touching as little as possible.

Patch operations (the "op"):
- "tokens": change design tokens — {"tokens": {"colors": {...}, "fonts": {...}, "scale"|"radius"|"style"|"imageTreatment": ...}} (fonts only from: ${fontMenu()}).
- "content": change fields of one section — {"sectionId", "content": {only the fields that change}}.
- "variant": switch one section's variant — {"sectionId", "variant"}.
- "images": change which moodboard images one section uses — {"sectionId", "images": [ids]}.
- "replace": rewrite one section, possibly as another kind — {"sectionId", "section": {"kind", "variant", "content", "images"}}.
- "add": insert a new section — {"after": sectionId or null, "section": {...}}.
- "remove": remove one section — {"sectionId"}.
- "move": move one section — {"sectionId", "to": index from 0}.
- "none": no change (when the comment is a question, or too ambiguous to act on).

Before changing anything, judge it: if the change would work against the brief or the people it serves (unreadable contrast, a hidden primary action, a broken hierarchy), set "challenge" to one or two sentences saying why — unless "force" is true, in which case make the change as asked. If the comment asks for a different overall direction rather than a change, set "regenerate" to a one-sentence direction and use op "none". If it is ambiguous, set "question" to one short clarifying question and op "none".
Content rules: real copy, unknown facts as [bracketed placeholders], images only from the moodboard ids given.

${VOICE}
Respond with ONE JSON object: {"understood": "one sentence: what you will change", "challenge": null, "question": null, "regenerate": null, "patch": {"op": "...", "summary": "a short label for the change", ...}}`;
}

export function refineUser(input: RefineInput): string {
  const s = input.selection;
  const where = s
    ? `THE SELECTION: ${s.label}${s.element?.ux ? ` — section [${s.element.ux.section}], field ${s.element.ux.path || '(the section)'}` : ''}${s.region?.elements.length ? ` — elements: ${s.region.elements.map((e) => (e.ux ? `[${e.ux.section}] ${e.ux.path}` : e.tag)).join(', ')}` : ''}.`
    : 'THE SELECTION: none — the comment is about the whole design.';
  return [
    input.brief ? `THE BRIEF: objective — ${input.brief.objective}; audience — ${input.brief.audience}; personality — ${input.brief.personality.join(', ')}.` : '',
    `THE DESIGN NOW:\n${specDigest(input.spec)}`,
    `MOODBOARD IMAGES AVAILABLE:\n${keptRefs(input.moodboard)}`,
    where,
    `THE COMMENT: “${input.comment}”`,
    `force: ${input.force}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

export interface RefineResult {
  understood: string;
  challenge: string;
  question: string;
  regenerate: string;
  patch: Patch;
}

export function parseRefine(raw: unknown, force: boolean): RefineResult {
  const r = obj(raw);
  const patch = normalizePatch(r.patch);
  const challenge = force ? '' : clean(r.challenge, 400);
  return {
    understood: clean(r.understood, 240),
    challenge,
    question: clean(r.question, 240),
    regenerate: clean(r.regenerate, 240),
    // a change SocriaUX has a concern about waits for the designer
    patch: challenge ? { ...patch, summary: patch.summary || clean(r.understood, 120) } : patch,
  };
}
