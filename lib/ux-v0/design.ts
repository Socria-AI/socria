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

import { designFromDirection, directionBrief, LOCK_LABEL, planLayout, type ArtDirection, type LockGroup } from './direction';
import { normQ, readQueries } from './discovery';
import { fontMenu } from './fonts';
import { knowledgeBrief } from './knowledge';
import { avoidRefs, contentRefs, describeRef, inspirationRefs, isContent } from './references';
import { BUTTONS, CONTAINERS, GRIDS, LABELS, libraryMenu, MOTIFS, normalizePatch, normalizeSpec, specDigest, TONES, type DesignSpec, type Patch } from './spec';
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

/** What the designer decided, said plainly: rules are not preferences, and delegated parts are the model's. */
function briefDecisions(b: DesignBrief): string {
  const dec = Object.entries(b.decisions ?? {});
  const rules = b.rules ?? [];
  if (!dec.length && !rules.length && !b.accessibility?.length && !b.responsive?.length) return '';
  const by = (k: string) => dec.filter(([, v]) => v === k).map(([p]) => p);
  return [
    rules.length ? `RULES (non-negotiable: never break one, whatever else asks): ${rules.join('; ')}.` : '',
    by('locked').length || by('approved').length ? `DECIDED BY THE DESIGNER (follow exactly): ${[...by('locked'), ...by('approved')].join(', ')}.` : '',
    by('delegated').length ? `LEFT TO YOU (decide well, and say what you chose in the copy's voice, not in notes): ${by('delegated').join(', ')}.` : '',
    b.accessibility?.length ? `ACCESSIBILITY: ${b.accessibility.join('; ')}.` : '',
    b.responsive?.length ? `ON SMALLER SCREENS: ${b.responsive.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join('\n');
}

/** Pictures the design may place: the ones the designer marked as content. */
function keptRefs(m: Moodboard): string {
  const kept = contentRefs(m);
  if (!kept.length) return 'none: no picture is marked for the page. Use variants that need no picture, and never invent an image id.';
  return kept
    .map((r) => `- [${r.id}] ${r.category}: ${r.title || r.query}${r.width && r.height ? ` (${r.width > r.height * 1.15 ? 'landscape' : r.height > r.width * 1.15 ? 'portrait' : 'square'})` : ''}${r.color ? `, dominant ${r.color}` : ''}`)
    .join('\n');
}

/**
 * References that inspire: what to take from each and what to leave, in the
 * designer's words. They shape tone, composition, type, colour and copy; they
 * are never placed on the page.
 */
function inspiration(m: Moodboard): string {
  const like = inspirationRefs(m).filter((r) => !isContent(r) || r.note || r.take?.length || r.leave?.length);
  const away = avoidRefs(m);
  if (!like.length && !away.length) return '';
  return [
    like.length ? `REFERENCES THAT INSPIRE (take only what each says; never place them, never copy them literally):\n${like.slice(0, 16).map((r) => `- ${describeRef(r)}`).join('\n')}` : '',
    away.length ? `REFERENCES TO STEER AWAY FROM:\n${away.slice(0, 8).map((r) => `- ${describeRef(r)}`).join('\n')}` : '',
  ]
    .filter(Boolean)
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
- references: ids of the pictures marked for the page that the design should show (only ids listed under PICTURES MARKED FOR THE PAGE; an empty list when none are). Inspiring references shape the other fields: say in visualDirection and layoutDirection what is taken from them.
- openQuestions: what is still undecided.
- experience: how it should feel to use, in one sentence (optional).
- rules: ONLY constraints the designer stated as musts or nevers ("no animation", "must work without images"), each short; omit otherwise.
- accessibility, responsive: short notes, only where the designer or the audience makes them matter (optional).
- pageType: "website" or "app-screen"; platform: "web" or "mobile".
${refining ? 'Parts the designer approved or locked (in "decisions") stay exactly as they are; "delegated" parts are yours to decide.\n' : ''}${
    refining
      ? `
- moodboardQueries: ONLY when this change moves the visual direction (light, imagery, texture, mood): 1–3 searches for licensed photo libraries that show the new direction, each {"category": "imagery|texture|composition", "query": "two or three words, a concrete subject first"}, none repeating a search already used. Otherwise [].`
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
    inspiration(input.moodboard),
    `PICTURES MARKED FOR THE PAGE:\n${keptRefs(input.moodboard)}`,
    keptTaste(input.moodboard),
    input.current ? `THE BRIEF AS IT STANDS:\n${JSON.stringify(input.current)}` : '',
    input.instruction ? `CHANGE: “${input.instruction}”` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function parseBrief(raw: unknown, moodboard: Moodboard): DesignBrief | null {
  const kept = new Set(contentRefs(moodboard).map((r) => r.id));
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

/** What generated pages do by habit, and this one must not do unless the direction asks for it. */
const NOT_GENERIC = `Avoid the generic generated page:
- No stock phrases: never "unlock", "elevate", "empower", "seamless", "transform your", "welcome to", "your journey", "discover the power", "cutting-edge", "next-level", "world-class", "revolutionise", "game-changer", "supercharge", "leverage".
- Headlines say something only this brand could say: a particular, a number, a place, a promise. Short. One may emphasise a single word by wrapping it in *asterisks*.
- Do not open every section with an eyebrow label; use one only where it adds information (a date, a place, a category), at most on half the sections.
- Not a three-icon card grid by default: use features only for genuinely parallel points, and the variant the direction prefers.
- Vary the structure: no two neighbouring sections of the same kind; not the stock order hero → features → pricing → questions → call to action unless this brief needs exactly that.`;

export function generateSystem(brief: DesignBrief, dir: ArtDirection | null = null): string {
  const tokens = dir
    ? '- Tokens and the look are already decided by the approved art direction below: do not write "tokens".'
    : "- Tokens: colors {background, surface, text, muted, accent, accentText, line} from the brief's palette roles; fonts {display, body} from the brief's typography; scale compact|comfortable|spacious; radius none|soft|round; style editorial|minimal|bold|warm|technical; imageTreatment natural|muted|warm|mono — all chosen to express the brief's personality and visual direction.";
  return `You are SocriaUX's design generator. Turn the approved brief into a design specification that a renderer draws. You do not write HTML: you choose sections from the library below and write their content${dir ? '' : ', and choose tokens'}.
${dir ? `
${directionBrief(dir, brief.pageType)}
${knowledgeBrief(dir.look)}
` : ''}
THE LIBRARY (only these kinds, variants and fields; * marks required):
${libraryMenu(brief.pageType)}

Rules:
${tokens}
- Structure: ${brief.pageType === 'website' ? 'a nav first, a footer last; 5–9 sections between them, in the order a visitor needs them; one primary action, repeated at most twice.' : 'an app-nav first (tabbar for mobile, sidebar or topbar for web), then an app-header, then the content the screen exists for.'}
- Copy: real, specific to this brief, in ${dir ? 'the voice the direction describes' : "the brand's voice"}. Never lorem ipsum. Headlines short and concrete. Facts you were not given — prices, addresses, dates, numbers, opening hours, people's names — are written as [bracketed placeholders] (e.g. "[Opening hours]", "[£ price]"); never invent them. A testimonial without a real source uses "[Customer name]".
- Images: only the moodboard ids listed below, in "images" on the sections that take them; prefer landscape for wide slots and portrait for tall ones. If there are none, choose variants that need no image.
- Every section has a short unique id (lowercase, hyphenated), a kind, a variant, content and images.

${NOT_GENERIC}

${VOICE}
Respond with ONE JSON object: {"title": "...", "pageType": "${brief.pageType}", "platform": "${brief.platform}", ${dir ? '' : '"tokens": {...}, '}"sections": [{"id": "...", "kind": "...", "variant": "...", "content": {...}, "images": ["..."]}]}`;
}

export function generateUser(input: GenerateInput): string {
  return [
    `THE APPROVED BRIEF:\n${JSON.stringify(input.brief)}`,
    briefDecisions(input.brief),
    `PICTURES YOU MAY PLACE (id, category, subject, orientation):\n${keptRefs(input.moodboard)}`,
    inspiration(input.moodboard),
    input.direction ? `A NEW DIRECTION THE DESIGNER ASKED FOR: “${input.direction}”` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

/**
 * The model's answer as a spec. With an approved art direction, the tokens and
 * the look are the direction's (whatever the model wrote), and the page is
 * planned for rhythm (direction.ts planLayout).
 */
export function parseGenerate(raw: unknown, brief: DesignBrief, moodboard: Moodboard, version: number, reason: string, dir: ArtDirection | null = null): DesignSpec | null {
  const r = obj(raw);
  if (dir) {
    const { tokens, look } = designFromDirection(dir);
    const spec = normalizeSpec({ ...r, tokens, look, pageType: brief.pageType, platform: brief.platform, version, reason, createdAt: Date.now() }, moodboard);
    return spec ? planLayout(spec) : null;
  }
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
  /** what the designer locked in the art direction */
  locks?: readonly LockGroup[];
}

export function refineSystem(): string {
  return `You are SocriaUX. The designer is changing a generated design by commenting on a part of it. Translate the comment into ONE patch to the design specification, touching as little as possible.

Patch operations (the "op"):
- "tokens": change design tokens — {"tokens": {"colors": {...}, "fonts": {...}, "scale"|"radius"|"style"|"imageTreatment": ...}} (fonts only from: ${fontMenu()}).
- "look": change how the page is composed — {"look": {any of: "ratio" (type scale 1.15–1.7), "weight" (100–900), "case" sentence|upper, "emphasis" italic|accent|underline|highlight|none, "label" ${LABELS.join('|')}, "grid" ${GRIDS.join('|')}, "align" left|center, "width" narrow|standard|wide, "containers" ${CONTAINERS.join('|')}, "rules" none|hairline|heavy, "buttons" ${BUTTONS.join('|')}, "motifs" [${MOTIFS.join(', ')}]}}.
- "tone": set the ground one section sits on, or its spacing — {"sectionId", "tone": ${TONES.join('|')}, "pad": s|m|l}.
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
    `PICTURES THAT MAY BE PLACED:\n${keptRefs(input.moodboard)}`,
    where,
    input.locks?.length ? `LOCKED IN THE ART DIRECTION (the designer decided these): ${input.locks.map((g) => LOCK_LABEL[g]).join(', ')}. If the comment asks to change one, make the patch but say in "challenge" that it changes a locked decision.` : '',
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
