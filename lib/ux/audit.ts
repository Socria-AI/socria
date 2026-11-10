// lib/ux/audit.ts — what can be measured about a design, measured.
//
// Contrast, target size, labels, competing primary actions, near-misses in
// alignment: none of these needs a model to notice. They are checked here, on
// every edit, in the browser, for free — and handed to the model as facts, so
// its turn is spent on what cannot be measured: whether the design serves the
// person it is for.
//
// Every finding carries three registers, because SocriaUX answers in three:
//   question     — guided discovery: what to ask yourself about it
//   explanation  — instructional: the principle and why it matters
//   fix          — direct assistance: what would resolve it
// The workspace shows whichever the designer's mode calls for, and the rest a
// click away. A finding is never a verdict on the design, only on the measure.

import { INTERACTIVE, TEXTUAL, type Artboard, type Severity, type UXElement } from './model';

export type Rule =
  | 'contrast'
  | 'target-size'
  | 'small-text'
  | 'input-label'
  | 'competing-primary'
  | 'density'
  | 'near-alignment'
  | 'off-artboard'
  | 'overlap'
  | 'no-heading'
  | 'line-length';

export interface Finding {
  /** stable across edits: rule + element, so a dismissed finding stays dismissed */
  id: string;
  rule: Rule;
  severity: Severity;
  artboardId: string;
  elementId: string | null;
  title: string;
  question: string;
  explanation: string;
  fix: string;
  principle: string;
  /** the measured value, for display: "2.9:1", "32×32px" */
  measure: string;
}

// ── colour ───────────────────────────────────────────────────────────

export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '');
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-f]{6}$/i.test(full)) return null;
  return [parseInt(full.slice(0, 2), 16), parseInt(full.slice(2, 4), 16), parseInt(full.slice(4, 6), 16)];
}

/** WCAG 2.x relative luminance. */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio, 1–21. */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
}

/** "Large text" in WCAG terms: 24px, or 18.66px (14pt) bold. */
export const isLargeText = (e: Pick<UXElement, 'fontSize' | 'fontWeight'>) =>
  e.fontSize >= 24 || (e.fontSize >= 18.66 && e.fontWeight >= 600);

const contains = (outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }) =>
  inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;

const overlaps = (a: UXElement, b: UXElement) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/**
 * The colour text actually sits on. A button paints its own fill; anything
 * else sits on the topmost filled shape below it that contains it, else the
 * artboard. Elements later in the list are drawn on top.
 */
export function backgroundOf(ab: Artboard, el: UXElement): string {
  if (el.kind === 'button' && el.variant !== 'ghost') return el.fill;
  if (el.kind === 'input' || el.kind === 'nav') return el.fill;
  const idx = ab.elements.findIndex((e) => e.id === el.id);
  for (let i = idx - 1; i >= 0; i--) {
    const under = ab.elements[i];
    if ((under.kind === 'rect' || under.kind === 'nav' || under.kind === 'image') && contains(under, el)) return under.fill;
  }
  return ab.background;
}

// ── the rules ────────────────────────────────────────────────────────

const describe = (e: UXElement) => {
  const words = (e.text || e.label || e.name || e.kind).replace(/\s+/g, ' ').trim();
  return `${e.kind} “${words.length > 32 ? `${words.slice(0, 31)}…` : words}”`;
};

export function auditArtboard(ab: Artboard): Finding[] {
  const out: Finding[] = [];
  const push = (f: Omit<Finding, 'id' | 'artboardId'>) =>
    out.push({ ...f, artboardId: ab.id, id: `${f.rule}:${ab.id}:${f.elementId ?? '*'}` });
  const mobile = ab.w <= 480;
  const els = ab.elements;

  for (const e of els) {
    // contrast — 1.4.3 for text, 1.4.11 for an input's edge is not modelled
    if (TEXTUAL.has(e.kind) && (e.text.trim() || e.label.trim())) {
      const bg = backgroundOf(ab, e);
      const ratio = contrastRatio(e.color, bg);
      const need = isLargeText(e) ? 3 : 4.5;
      if (ratio < need) {
        push({
          rule: 'contrast',
          severity: ratio < 3 ? 'high' : 'medium',
          elementId: e.id,
          title: `Low contrast on ${describe(e)}`,
          measure: `${ratio.toFixed(2)}:1 (needs ${need}:1)`,
          question: `Who reads this ${e.kind} in bright sunlight, on a dim screen, or with low vision — and what happens to them at ${ratio.toFixed(1)}:1?`,
          explanation: `Text needs a contrast ratio of at least ${need}:1 against what is behind it (WCAG 1.4.3). ${
            isLargeText(e) ? 'Large text gets the lower threshold because its strokes are thicker.' : 'Body-size text needs more, because thin strokes lose definition first.'
          } Low contrast is often chosen to make secondary text feel quiet — hierarchy can be made with size, weight and position instead.`,
          fix: `Darken the text (or lighten the background) until the ratio reaches ${need}:1. Keep it quiet with size or weight, not with lightness.`,
          principle: 'WCAG 2.2 · 1.4.3 Contrast (Minimum)',
        });
      }
    }

    // target size — 2.5.8 is 24px (AA); 44px is the comfortable touch size
    if (INTERACTIVE.has(e.kind) && e.kind !== 'nav') {
      const minSide = Math.min(e.w, e.h);
      const touchMin = mobile ? 44 : 24;
      if (minSide < touchMin) {
        push({
          rule: 'target-size',
          severity: minSide < 24 ? 'high' : 'medium',
          elementId: e.id,
          title: `Small target: ${describe(e)}`,
          measure: `${Math.round(e.w)}×${Math.round(e.h)}px`,
          question: `How often does someone mean to press this ${e.kind} and miss — and what does missing cost them here?`,
          explanation: `Fitts's law: the time to hit a target grows as it gets smaller and further away. WCAG 2.5.8 sets a 24×24px floor; on touch screens 44×44px is the widely used comfortable minimum, because a fingertip covers roughly that much. ${
            e.kind === 'checkbox' || e.kind === 'link' ? 'For a checkbox or a link, the label can be part of the target — the visible box can stay small while the pressable area does not.' : ''
          }`,
          fix: `Make the pressable area at least ${touchMin}×${touchMin}px — padding counts, the visible shape can stay smaller.`,
          principle: "Fitts's law · WCAG 2.2 · 2.5.8 Target Size",
        });
      }
    }

    // small text
    if (TEXTUAL.has(e.kind) && e.text.trim()) {
      if (e.fontSize < 12) {
        push({
          rule: 'small-text',
          severity: 'medium',
          elementId: e.id,
          title: `Very small text: ${describe(e)}`,
          measure: `${e.fontSize}px`,
          question: `Is this text meant to be read, or only noticed? If it matters to the decision on this screen, why is it the smallest thing on it?`,
          explanation: 'Below about 12px, text stops being comfortably readable for many people, and legal or pricing detail set this small is a recognised dark pattern. Small type is a signal that something is unimportant — make sure that is true.',
          fix: 'Set it to at least 12px (14px+ for anything people must act on), and reduce its prominence with colour or weight instead.',
          principle: 'Legibility · WCAG 1.4.4 Resize Text',
        });
      } else if (mobile && e.kind === 'text' && e.fontSize < 15 && e.text.length > 60) {
        push({
          rule: 'small-text',
          severity: 'low',
          elementId: e.id,
          title: `Small body copy on mobile: ${describe(e)}`,
          measure: `${e.fontSize}px`,
          question: 'Would you read this paragraph at arm’s length on a moving bus?',
          explanation: 'Mobile body copy is usually set at 16px or more; below it, people zoom or skip. iOS also zooms inputs set under 16px, which is a hint about what the platform considers readable.',
          fix: 'Set paragraph text to 16px on small screens.',
          principle: 'Legibility on mobile',
        });
      }
    }

    // inputs without a visible label
    if ((e.kind === 'input' || e.kind === 'checkbox') && !e.label.trim()) {
      push({
        rule: 'input-label',
        severity: 'high',
        elementId: e.id,
        title: `No visible label: ${describe(e)}`,
        measure: e.text.trim() ? 'placeholder only' : 'no label',
        question: `What does this field ask for once someone has started typing in it — and how do they check their answer before submitting?`,
        explanation:
          'A placeholder is not a label: it disappears on the first keystroke, so people must remember what the field wanted, and its low-contrast grey usually fails contrast. Screen readers may not announce it consistently either (WCAG 3.3.2, 1.3.1).',
        fix: 'Add a persistent visible label above the field; keep the placeholder, if any, for an example of the format.',
        principle: 'WCAG 2.2 · 3.3.2 Labels or Instructions',
      });
    }

    // off the artboard
    if (e.x + e.w <= 0 || e.y + e.h <= 0 || e.x >= ab.w || e.y >= ab.h) {
      push({
        rule: 'off-artboard',
        severity: 'low',
        elementId: e.id,
        title: `${describe(e)} is outside the screen`,
        measure: `at ${Math.round(e.x)}, ${Math.round(e.y)}`,
        question: 'Is this meant to be off-screen (below the fold, in a later state), or did it drift?',
        explanation: 'Elements outside the artboard are invisible in the design but still counted by the checks and still in the export.',
        fix: 'Move it back inside, delete it, or put it on its own artboard as a separate state.',
        principle: 'Housekeeping',
      });
    }

    // long lines
    if (e.kind === 'text' && e.fontSize > 0) {
      const charsPerLine = e.w / (e.fontSize * 0.5);
      if (charsPerLine > 90 && e.text.length > 120) {
        push({
          rule: 'line-length',
          severity: 'low',
          elementId: e.id,
          title: `Long line length: ${describe(e)}`,
          measure: `≈${Math.round(charsPerLine)} characters per line`,
          question: 'When a reader reaches the end of a line here, how easily do they find the start of the next one?',
          explanation: 'Comfortable reading sits around 45–75 characters per line. Longer lines make the return sweep error-prone and reading slower.',
          fix: 'Constrain the text box to roughly 60–70 characters (about 32–36em).',
          principle: 'Typography · measure',
        });
      }
    }
  }

  // more than one primary action
  const primaries = els.filter((e) => e.kind === 'button' && e.variant === 'primary');
  if (primaries.length > 1) {
    push({
      rule: 'competing-primary',
      severity: 'medium',
      elementId: primaries[1].id,
      title: `${primaries.length} primary buttons compete`,
      measure: primaries.map((p) => `“${p.text}”`).join(', '),
      question: `If someone could only do one thing on this screen, which of ${primaries.map((p) => `“${p.text}”`).join(' or ')} should it be — and does the design say so?`,
      explanation:
        "Visual hierarchy is a promise about importance. When several actions share the strongest treatment, nothing is emphasised, and Hick's law applies: more equal options, slower and less confident choices.",
      fix: 'Keep one primary action per screen or section; demote the others to secondary or ghost buttons.',
      principle: "Visual hierarchy · Hick's law",
    });
  }

  // density
  const interactive = els.filter((e) => INTERACTIVE.has(e.kind));
  const limit = mobile ? 8 : 14;
  if (interactive.length > limit) {
    push({
      rule: 'density',
      severity: 'medium',
      elementId: null,
      title: `Many controls on one screen (${interactive.length})`,
      measure: `${interactive.length} interactive elements`,
      question: 'What is the one job this screen exists for? Which of these controls serve that job, and which are here because there was room?',
      explanation:
        'Every control is something to perceive, understand and decide about. Cognitive load rises with the number of options competing for attention; progressive disclosure moves the rarely used ones out of the way without removing them.',
      fix: 'Group related controls, and move secondary ones behind a menu, a later step or an advanced section.',
      principle: 'Cognitive load · progressive disclosure',
    });
  }

  // overlap between interactive elements
  for (let i = 0; i < interactive.length; i++) {
    for (let j = i + 1; j < interactive.length; j++) {
      const a = interactive[i];
      const b = interactive[j];
      if (overlaps(a, b)) {
        push({
          rule: 'overlap',
          severity: 'medium',
          elementId: b.id,
          title: `${describe(a)} overlaps ${describe(b)}`,
          measure: 'overlapping hit areas',
          question: 'When someone presses where these two meet, which one did they mean?',
          explanation: 'Overlapping targets make the result of a press ambiguous and are a common source of accidental actions.',
          fix: 'Separate them with at least 8px of space.',
          principle: "Fitts's law · Gestalt proximity",
        });
      }
    }
  }

  // near-alignment: left edges 1–6px apart
  const lefts = els.filter((e) => e.kind !== 'nav' && e.w < ab.w * 0.95).map((e) => ({ id: e.id, x: Math.round(e.x) }));
  const near: string[] = [];
  for (let i = 0; i < lefts.length; i++) {
    for (let j = i + 1; j < lefts.length; j++) {
      const d = Math.abs(lefts[i].x - lefts[j].x);
      if (d >= 1 && d <= 6) near.push(lefts[j].id);
    }
  }
  if (near.length) {
    push({
      rule: 'near-alignment',
      severity: 'low',
      elementId: near[0],
      title: `${near.length} element${near.length > 1 ? 's' : ''} almost aligned`,
      measure: 'left edges 1–6px apart',
      question: 'Are these meant to share an edge? If so, what is the grid; if not, is the difference big enough to look intended?',
      explanation:
        'Edges that nearly line up read as a mistake rather than a choice — the eye notices the misalignment more than it would a clear offset. Alignment is how layouts communicate that things belong together (Gestalt: common region, continuity).',
      fix: 'Snap these to the same x position, or offset them by a clear step of your spacing scale.',
      principle: 'Gestalt · alignment and continuity',
    });
  }

  // a screen with content and no heading
  if (els.length >= 5 && !els.some((e) => e.kind === 'heading') && !ab.image) {
    push({
      rule: 'no-heading',
      severity: 'low',
      elementId: null,
      title: 'No heading on this screen',
      measure: `${els.length} elements, 0 headings`,
      question: 'In the first second on this screen, how does someone know where they are?',
      explanation:
        'A heading orients people and is how screen-reader users navigate a page (WCAG 2.4.6, 1.3.1). Without one, the first thing read is whatever happens to come first.',
      fix: 'Add a heading that names the screen’s purpose in the user’s words.',
      principle: 'Orientation · WCAG 2.4.6 Headings and Labels',
    });
  }

  const rank: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/** One line per finding, for the model. */
export function findingsDigest(findings: readonly Finding[], max = 12): string {
  if (!findings.length) return 'No measurable issues found by the automatic checks.';
  return findings
    .slice(0, max)
    .map((f) => `- [${f.severity}] ${f.title} — ${f.measure} (${f.principle})${f.elementId ? ` {element ${f.elementId}}` : ''}`)
    .join('\n');
}

/** A score for the header: how many open problems of each weight. */
export function tally(findings: readonly Finding[]): Record<Severity, number> {
  const t: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const f of findings) t[f.severity]++;
  return t;
}
