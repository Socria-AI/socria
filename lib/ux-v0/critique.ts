// lib/ux-v0/critique.ts — a comment on a selection, reasoned about, and held to evidence.
//
// THE GATE, after Logos 6's challenge gate (lib/challenge/challenge-gate.ts):
// an issue must cite something real — a value the browser measured, a style
// value, the selection's own text — or it is not presented as an issue; it
// becomes a question instead. Principles must be established ones, named, and
// tied to this design. Questions already asked on the card are not asked
// again. "This works" is a valid answer and is kept as one. The result is
// reasoning that neither agrees with the designer by default nor treats every
// decision as wrong.

import { evidenceText } from './selection';
import { normalizeReasoning, type ArtifactKind, type CardTurn, type DesignBrief, type Reasoning, type SelectionContext, type Verdict, type Viewport } from './types';

// ── principles ───────────────────────────────────────────────────────

export const PRINCIPLES: readonly { name: string; match: RegExp }[] = [
  { name: 'Visual hierarchy', match: /visual hierarchy|hierarchy/ },
  { name: 'Gestalt: proximity', match: /proximity/ },
  { name: 'Gestalt: similarity', match: /similarity/ },
  { name: 'Gestalt: common region', match: /common region|enclosure/ },
  { name: 'Gestalt: continuity', match: /continuity|alignment/ },
  { name: 'Gestalt: figure and ground', match: /figure[- ]?(and[- ])?ground/ },
  { name: 'Gestalt: closure', match: /closure/ },
  { name: 'Cognitive load', match: /cognitive load|mental load|working memory|miller/ },
  { name: "Hick's law", match: /hick/ },
  { name: "Fitts's law", match: /fitts?'?s?/ },
  { name: "Jakob's law", match: /jakob/ },
  { name: 'Recognition over recall', match: /recognition( rather than| over)? recall/ },
  { name: 'Consistency and standards', match: /consisten/ },
  { name: 'Visibility of system status', match: /system status|visibility of status/ },
  { name: 'Error prevention', match: /error prevention|prevent errors?/ },
  { name: 'Aesthetic and minimalist design', match: /minimalis|aesthetic/ },
  { name: 'Match with the real world', match: /real world|real-world/ },
  { name: 'User control and freedom', match: /user control|control and freedom/ },
  { name: 'Help users recover from errors', match: /recover from errors|error recovery/ },
  { name: 'Affordance', match: /affordance/ },
  { name: 'Signifiers', match: /signifier/ },
  { name: 'Feedback', match: /^feedback$|feedback loop|immediate feedback/ },
  { name: 'Progressive disclosure', match: /progressive disclosure/ },
  { name: 'Information scent', match: /information scent|scent/ },
  { name: 'Information architecture', match: /information architecture|\bia\b/ },
  { name: 'F- and Z-pattern scanning', match: /f-pattern|z-pattern|scanning pattern|scan path/ },
  { name: 'Serial position effect', match: /serial position|primacy|recency/ },
  { name: 'Von Restorff effect', match: /von restorff|isolation effect/ },
  { name: 'Aesthetic-usability effect', match: /aesthetic[- ]usability/ },
  { name: 'Doherty threshold', match: /doherty/ },
  { name: 'Tesler’s law', match: /tesler|conservation of complexity/ },
  { name: 'Contrast (WCAG 1.4.3)', match: /contrast|1\.4\.3/ },
  { name: 'Target size (WCAG 2.5.8)', match: /target size|2\.5\.8|touch target/ },
  { name: 'Text alternatives (WCAG 1.1.1)', match: /text alternative|alt text|1\.1\.1/ },
  { name: 'Labels and instructions (WCAG 3.3.2)', match: /labels? and instructions|3\.3\.2|form label/ },
  { name: 'Link purpose (WCAG 2.4.4)', match: /link purpose|2\.4\.4/ },
  { name: 'Focus visible (WCAG 2.4.7)', match: /focus visible|2\.4\.7|focus indicator/ },
  { name: 'Readable measure', match: /line length|measure|characters per line/ },
  { name: 'Typographic scale', match: /typographic scale|type scale|modular scale/ },
  { name: 'White space', match: /white ?space|negative space|breathing room/ },
  { name: 'Emphasis', match: /emphasis|focal point/ },
  { name: 'Mobile-first', match: /mobile[- ]first|responsive/ },
  { name: 'Trust and credibility', match: /trust|credibility/ },
];

/** An established principle's name, from however the model wrote it — or null. */
export function canonicalPrinciple(name: string): string | null {
  const n = name.toLowerCase().replace(/[’']/g, "'").trim();
  if (!n) return null;
  const exact = PRINCIPLES.find((p) => p.name.toLowerCase() === n);
  if (exact) return exact.name;
  return PRINCIPLES.find((p) => p.match.test(n))?.name ?? null;
}

// ── what the model is told ───────────────────────────────────────────

export interface CritiqueInput {
  selection: SelectionContext;
  comment: string;
  history: CardTurn[];
  brief: DesignBrief | null;
  /** the design around the selection: an imported page's outline, an image's earlier read, or the generated spec's digest */
  summary: string;
  /** generated designs: the spec section the selection belongs to */
  section: string;
  kind: ArtifactKind | 'generated';
  name: string;
  viewport: Viewport | null;
  /** a thumbnail of the whole image is attached, and no earlier read exists: ask for one */
  wantsSummary: boolean;
}

export function critiqueSystem(): string {
  return `You are SocriaUX, the design reasoning environment inside Socria, a Human-First AI company. A designer has selected part of a design and commented on it. Your purpose is to strengthen their judgement — not to judge for them, not to agree with them by default, and not to treat every decision as wrong.

How to answer:
1. READ the selection accurately first: what it is, what it is doing in this design, for whom. Ground it in the selection, the measured facts and the surrounding design. One or two sentences.
2. VERDICT: "works", "mixed", "problem" or "unclear". Many decisions are sound: when the facts and context support it, say "works" and say why it works, naming the principle. If the designer's assertion is wrong, say so plainly and why; if it is right, say so and why.
3. ISSUES (0–3): only real ones that matter for the people using this design. Each must cite EVIDENCE copied exactly from what you were given — a measured value (e.g. "2.85:1"), a style value (e.g. "font-size: 13px"), a size, or the selection's own words. If you cannot cite evidence, do not state it as an issue: ask it as a question.
4. QUESTIONS (0–2): Socratic, specific to this element, its users and its context — the questions that would most improve the designer's own judgement. Never re-ask what this card already asked. Do not ask for the sake of asking: if the comment asks for an explanation or a fact, give it in the read.
5. PRINCIPLES (0–3): established UX principles that genuinely apply, each with how it applies HERE in one sentence. Do not force irrelevant ones. Use names from this list: ${PRINCIPLES.map((p) => p.name).join('; ')}.
6. ALTERNATIVES (0–3): concrete, actionable options the designer could try, each with its trade-off. The decision stays theirs.

Voice: plain, calm, precise, second person. No emoji, no exclamation marks, no flattery, no hype. Short.

Respond with ONE JSON object:
{"read": "...", "verdict": "works|mixed|problem|unclear", "issues": [{"text": "...", "evidence": "..."}], "questions": ["..."], "principles": [{"name": "...", "applies": "..."}], "alternatives": [{"text": "...", "tradeoff": "..."}]${'' /* artifactSummary only when asked */}}
When told to, also include "artifactSummary": 3–5 sentences describing the WHOLE design in the thumbnail — layout, hierarchy, palette, typography — to be kept as context for later comments.`;
}

const capLine = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

function describeSelection(sel: SelectionContext): string {
  const lines: string[] = [`THE SELECTION: ${sel.label} (${sel.type === 'element' ? 'one element' : 'an area'}).`];
  const el = sel.element;
  if (el) {
    lines.push(
      `- Element: <${el.tag}>${el.role ? ` role ${el.role}` : ''}; accessible name “${capLine(el.name, 120)}”; text “${capLine(el.text, 300)}”.`,
      `- Where: ${el.path}${el.section ? `; section ${el.section}` : ''}${el.parent ? `; parent ${el.parent}` : ''}; ${el.siblings} siblings, ${el.children} children.`,
      `- Box: ${Math.round(el.box.w)}×${Math.round(el.box.h)}px at (${Math.round(el.box.x)}, ${Math.round(el.box.y)}); background behind it: ${el.background}.`,
      `- Styles: ${Object.entries(el.styles)
        .filter(([, v]) => v && v !== 'none' && v !== 'normal' && v !== '0px' && v !== 'auto')
        .map(([k, v]) => `${k}: ${v}`)
        .join('; ')}.`
    );
    if (Object.keys(el.attrs).length) lines.push(`- Attributes: ${Object.entries(el.attrs).map(([k, v]) => `${k}="${capLine(v, 80)}"`).join(' ')}.`);
  }
  if (sel.region) {
    lines.push(`- Area: ${Math.round(sel.region.box.w)}×${Math.round(sel.region.box.h)}px at (${Math.round(sel.region.box.x)}, ${Math.round(sel.region.box.y)})${sel.region.container ? `, inside ${sel.region.container}` : ''}.`);
    if (sel.region.elements.length) {
      lines.push(`- Elements in it:`);
      for (const e of sel.region.elements) {
        lines.push(`  · <${e.tag}>${e.role ? ` ${e.role}` : ''} “${capLine(e.name || e.text, 80)}” ${Math.round(e.box.w)}×${Math.round(e.box.h)}px, ${e.styles['font-size'] ?? ''} ${e.styles['font-weight'] ?? ''}, colour ${e.styles.color ?? '?'} on ${e.background}`);
      }
    }
  }
  if (sel.crop) lines.push('- The selected area is attached as an image (a crop at its natural resolution).');
  if (sel.surrounding) lines.push(`- ${sel.surrounding}`);
  return lines.join('\n');
}

export function critiqueUser(input: CritiqueInput): string {
  const b = input.brief;
  const parts: string[] = [];
  parts.push(`DESIGN: ${input.kind === 'generated' ? 'generated in SocriaUX' : `imported ${input.kind.toUpperCase()}`} “${input.name}”${input.viewport ? `, viewed at ${input.viewport}` : ''}.`);
  if (b) parts.push(`THE AGREED BRIEF: objective — ${b.objective}; audience — ${b.audience}; personality — ${b.personality.join(', ')}; visual direction — ${b.visualDirection}.`);
  if (input.summary) parts.push(`THE DESIGN AROUND IT:\n${capLine(input.summary, 2400)}`);
  if (input.section) parts.push(`THE SPEC SECTION THIS BELONGS TO:\n${capLine(input.section, 1200)}`);
  parts.push(describeSelection(input.selection));
  parts.push(
    input.selection.measured.length
      ? `MEASURED BY THE BROWSER (facts):\n${input.selection.measured.map((m) => `- ${m.label}: ${m.value} [${m.ok ? 'meets' : 'fails'}] (${m.principle})`).join('\n')}`
      : 'MEASURED BY THE BROWSER: nothing measurable (an image region).'
  );
  // the context's budget: the last six turns, each capped
  const recent = input.history.slice(-6);
  if (recent.length) {
    parts.push(
      `EARLIER ON THIS CARD:\n${recent
        .map((t, i) => `${i + 1}. Designer: “${capLine(t.comment, 400)}”${t.reasoning ? `\n   SocriaUX: ${capLine(t.reasoning.read, 400)}${t.reasoning.questions.length ? `\n   Asked: ${t.reasoning.questions.join(' | ')}` : ''}` : ''}`)
        .join('\n')}`
    );
  }
  if (input.wantsSummary) parts.push('A small thumbnail of the whole design is attached too. Include "artifactSummary".');
  parts.push(`THE DESIGNER'S COMMENT: “${input.comment}”`);
  return parts.join('\n\n');
}

// ── the gate ─────────────────────────────────────────────────────────

const norm = (s: string) => s.toLowerCase().replace(/[“”"']/g, '').replace(/\s+/g, ' ').trim();

/** Is this evidence really in the material? Quoted words must appear; numbers must appear. */
export function supported(evidence: string, hay: string): boolean {
  const ev = norm(evidence);
  if (ev.length < 2) return false;
  if (hay.includes(ev)) return true;
  const quoted = [...evidence.matchAll(/[“"']([^“”"']{2,80})[”"']/g)].map((m) => norm(m[1]));
  if (quoted.length && quoted.every((q) => hay.includes(q))) return true;
  const numbers = ev.match(/\d+(?:\.\d+)?(?::1|px|%|pt|rem|em)?/g) ?? [];
  const meaningful = numbers.filter((n) => !/^[0-3]$/.test(n));
  if (meaningful.length && meaningful.every((n) => hay.includes(n.replace(/:1$/, '')))) return true;
  const hexes = ev.match(/#[0-9a-f]{3,6}\b/g) ?? [];
  return hexes.length > 0 && hexes.every((h) => hay.includes(h));
}

const asQuestion = (text: string) => {
  const t = text.trim().replace(/[.!]+$/, '');
  if (t.endsWith('?')) return t;
  return `Is it the case that ${t.charAt(0).toLowerCase()}${t.slice(1)}?`;
};

const similar = (a: string, b: string) => {
  const A = new Set(norm(a).split(' ').filter((w) => w.length > 3));
  const B = new Set(norm(b).split(' ').filter((w) => w.length > 3));
  if (!A.size || !B.size) return norm(a) === norm(b);
  let same = 0;
  for (const w of A) if (B.has(w)) same++;
  return same / Math.min(A.size, B.size) >= 0.8;
};

export interface Gated {
  reasoning: Reasoning;
  artifactSummary: string | null;
  /** issues turned into questions for want of evidence */
  demoted: number;
}

export function gateReasoning(raw: unknown, input: CritiqueInput): Gated {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const base = normalizeReasoning(r) ?? {
    read: 'SocriaUX could not form a grounded reading of this selection.',
    verdict: 'unclear' as Verdict,
    questions: [],
    principles: [],
    issues: [],
    alternatives: [],
    basis: '',
  };
  const sel = input.selection;
  const visualOnly = !!sel.crop && !sel.element && !(sel.region?.elements.length ?? 0);
  const hay = evidenceText(sel, `${input.summary} ${input.section}`);

  // issues: evidence or a question
  const kept: Reasoning['issues'] = [];
  const demotedTo: string[] = [];
  for (const issue of base.issues) {
    if (visualOnly ? issue.evidence.length >= 3 : supported(issue.evidence, hay)) {
      if (kept.length < (visualOnly ? 2 : 3)) kept.push(issue);
    } else demotedTo.push(asQuestion(issue.text));
  }

  // questions: none the card already asked, at most two, the model's own first
  const asked = input.history.flatMap((t) => t.reasoning?.questions ?? []);
  const questions: string[] = [];
  for (const q of [...base.questions, ...demotedTo]) {
    if (questions.length >= 2) break;
    if (asked.some((x) => similar(x, q)) || questions.some((x) => similar(x, q))) continue;
    questions.push(q);
  }

  // principles: established ones, tied to this design
  const seen = new Set<string>();
  const principles = base.principles
    .map((p) => ({ name: canonicalPrinciple(p.name) ?? '', applies: p.applies }))
    .filter((p) => p.name && p.applies.length >= 20 && !seen.has(p.name) && (seen.add(p.name), true))
    .slice(0, 3);

  // alternatives: each with what it costs
  const alternatives = base.alternatives.filter((a) => a.tradeoff.length >= 6).slice(0, 3);

  // a verdict that matches what survived
  let verdict: Verdict = base.verdict;
  if (verdict === 'problem' && !kept.length) verdict = questions.length ? 'unclear' : 'mixed';
  if (verdict === 'works' && kept.length) verdict = 'mixed';
  // "this works" over a measured failure is agreement past the evidence: the verdict says so, and the
  // failure is put to the designer as the first question — theirs to defend, not the model's to wave through
  const failing0 = sel.measured.find((m) => !m.ok);
  if (verdict === 'works' && failing0) {
    verdict = 'mixed';
    const q = `${failing0.label} measures ${failing0.value} here (${failing0.principle}). Is that what you intend for this element?`;
    if (!asked.some((x) => similar(x, q)) && !questions.some((x) => similar(x, q))) {
      questions.unshift(q);
      questions.splice(2);
    }
  }

  const facts = sel.measured.length;
  const failing = sel.measured.filter((m) => !m.ok).length;
  const basis = visualOnly
    ? 'Read from the image itself; nothing in an image can be measured, so check what it saw.'
    : `Rests on ${facts} measured fact${facts === 1 ? '' : 's'}${failing ? ` (${failing} failing)` : ''} and the selection’s own styles and text.${demotedTo.length ? ` ${demotedTo.length} point${demotedTo.length === 1 ? '' : 's'} without evidence became question${demotedTo.length === 1 ? '' : 's'}.` : ''}`;

  const summary = input.wantsSummary && typeof r.artifactSummary === 'string' ? r.artifactSummary.replace(/\s+/g, ' ').trim().slice(0, 1200) : null;
  return { reasoning: { read: base.read, verdict, questions, principles, issues: kept, alternatives, basis }, artifactSummary: summary || null, demoted: demotedTo.length };
}
