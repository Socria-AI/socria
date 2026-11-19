// lib/ux-v0/quick-edit.ts — the small changes a designer asks for every few minutes, done at once, in code.
//
// "Change the button colour to black." "Make the headline bigger." "Use Source Serif 4 for the headlines."
// "Rounder corners." "Change this to “Book a class”." None of these needs a model, and none needs the page
// regenerated: each is one typed patch (lib/ux-v0/spec.ts applyPatch) to the tokens, one section's settings or
// one field's words, applied as a new version that Undo takes back, checked like any other change against what
// the designer locked and their design system. readQuickEdit() reads the everyday ways of saying them; anything
// it does not recognise for certain returns null and goes to the model as before (lib/ux-v0/refine-local.ts reads
// the look-wide ones: warmer colours, calmer motion, more space).
//
// It reads only what it can do exactly: a colour it knows by name or by value, a typeface on SocriaUX's list, a
// field the selection points at. It never guesses a part of the page it cannot name.

import { contrastRatio } from '../ux/audit';
import { HEX6, mix } from './color';
import { textPatch } from './edit';
import { FONTS, knownFont } from './fonts';
import { ensureContrast, PADS, stacksPicture, type Breakpoint, type DesignSpec, type Patch, type Section } from './spec';

export interface QuickEdit {
  patches: Patch[];
  /** what was done, in a few words, for the designer */
  label: string;
  kind: 'colour' | 'type' | 'corners' | 'words' | 'size' | 'space' | 'remove' | 'width';
  /** a reason to ask before applying it (text that would be hard to read), said as a question */
  concern?: string;
}

/** What the browser knows of the selection: the section and field an element belongs to, when it is a generated design's. */
export interface QuickSelection {
  element?: { ux?: { section?: string; path?: string } | null; tag?: string; role?: string } | null;
}

// colours a designer names, as one exact value each (said back with the value, so it can be changed)
export const NAMED_COLOURS: Record<string, string> = {
  black: '#000000', white: '#ffffff', 'off white': '#f7f5f0', 'off-white': '#f7f5f0', ivory: '#fbf8ef', cream: '#f5efe2', beige: '#e8dcc4', sand: '#d8c3a5',
  grey: '#6b7280', gray: '#6b7280', 'light grey': '#d1d5db', 'light gray': '#d1d5db', 'dark grey': '#374151', 'dark gray': '#374151', charcoal: '#2b2b2b', slate: '#475569',
  navy: '#1f2a44', 'navy blue': '#1f2a44', blue: '#1d4ed8', 'dark blue': '#1e3a8a', 'light blue': '#93c5fd', 'sky blue': '#38bdf8', sky: '#38bdf8', cobalt: '#0047ab',
  teal: '#0f766e', turquoise: '#14b8a6', mint: '#98d8c8', green: '#2e7d32', 'dark green': '#14532d', forest: '#1f4d2b', 'forest green': '#1f4d2b', olive: '#6b7a2a', sage: '#9caf88', lime: '#84cc16',
  yellow: '#f2c94c', mustard: '#d4a017', gold: '#c9a227', orange: '#e8590c', amber: '#f59e0b', terracotta: '#c8553d', rust: '#b7410e', coral: '#ff6f61', peach: '#ffcba4',
  red: '#c62828', 'dark red': '#7f1d1d', crimson: '#b0122b', burgundy: '#7b1e3a', maroon: '#6d1a36', pink: '#db2777', 'hot pink': '#ec4899', blush: '#f4c2c2', magenta: '#c026d3',
  purple: '#6d28d9', violet: '#7c3aed', lavender: '#b9a7e8', plum: '#6b2d5c', brown: '#7b4b2a', chocolate: '#4e2a1e', tan: '#c8a27a',
};

const ROLE_WORDS: [RegExp, 'accent' | 'background' | 'text'][] = [
  [/\b(buttons?|cta|call[- ]to[- ]action|primary (colou?r|action)|accent( colou?r)?|links?|highlights?)\b/, 'accent'],
  [/\b(background|backdrop|page colou?r|ground|canvas)\b/, 'background'],
  [/\b(text|body text|copy|ink|font colou?r|type colou?r|words)\b/, 'text'],
];

/** A colour in the designer's words: a hex, an rgb(), or a name SocriaUX knows. */
export function colourIn(words: string): { hex: string; said: string } | null {
  const w = words.toLowerCase();
  const hex = w.match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map((c) => c + c).join('') : hex[1];
    return { hex: `#${h}`, said: `#${h}` };
  }
  const rgb = w.match(/rgb\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/);
  if (rgb) {
    const [r, g, b] = rgb.slice(1, 4).map((n) => Math.max(0, Math.min(255, +n)));
    const out = `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
    return { hex: out, said: out };
  }
  // the longest name first ("navy blue" before "blue", "off white" before "white"), each found once; two different
  // colours named is a request with more than one change in it, and the model's to read
  const names = Object.keys(NAMED_COLOURS).sort((a, b) => b.length - a.length);
  let rest = w;
  const found: { hex: string; said: string }[] = [];
  for (const n of names) {
    const re = new RegExp(`\\b${n.replace(/[-\s]/g, '[-\\s]')}\\b`);
    if (re.test(rest)) {
      found.push({ hex: NAMED_COLOURS[n], said: n });
      rest = rest.replace(re, ' ');
    }
  }
  const distinct = [...new Set(found.map((f) => f.hex))];
  return distinct.length === 1 ? found[0] : null;
}

/** A typeface on SocriaUX's list, named in the words: the longest name that matches. */
export function fontIn(words: string): string | null {
  const w = ` ${words.toLowerCase()} `;
  const names = FONTS.map((f) => f.name).sort((a, b) => b.length - a.length);
  for (const n of names) if (w.includes(` ${n.toLowerCase()} `) || w.includes(` ${n.toLowerCase()},`) || w.includes(` ${n.toLowerCase()}.`)) return n;
  return null;
}

/** Words in quotes: the new text the designer wants, exactly. */
export function quotedIn(words: string): string | null {
  const m = words.match(/[“"']([^“”"]{1,300})[”"']\s*[.!]?\s*$/) ?? words.match(/[“"]([^“”"]{1,300})[”"]/);
  return m ? m[1].trim() : null;
}

const readableOn = (bg: string) => (contrastRatio('#ffffff', bg) >= contrastRatio('#111111', bg) ? '#ffffff' : '#111111');

function colourPatch(spec: DesignSpec, role: 'accent' | 'background' | 'text', hex: string, said: string): QuickEdit | null {
  if (!HEX6.test(hex)) return null;
  const c = spec.tokens.colors;
  const what0 = role === 'accent' ? 'buttons and accent' : role === 'background' ? 'background' : 'text';
  // already so: nothing to change, said as much (no model asked to find that out)
  if (c[role]?.toLowerCase() === hex.toLowerCase()) return { patches: [], label: `the ${what0} ${role === 'accent' ? 'are' : 'is'} already ${said}`, kind: 'colour' };
  const colors: Record<string, string> = { [role]: hex };
  const notes: string[] = [];
  if (role === 'accent') {
    // the words on a button stay readable on its new colour
    colors.accentText = readableOn(hex);
  } else if (role === 'background') {
    // the page's words stay readable on its new ground; a surface that matched the old ground follows it
    if (contrastRatio(c.text, hex) < 4.5) (colors.text = ensureContrast(c.text, hex, 4.5)), notes.push('the text was adjusted to stay readable');
    if (contrastRatio(c.muted, hex) < 4.5) colors.muted = ensureContrast(c.muted, hex, 4.5);
    if (c.surface?.toLowerCase() === c.background?.toLowerCase()) colors.surface = hex;
    else if (contrastRatio(colors.text ?? c.text, c.surface) < 4.5) colors.surface = mix(hex, colors.text ?? c.text, 0.04);
    if (contrastRatio(c.line, hex) < 1.2) colors.line = mix(hex, colors.text ?? c.text, 0.18);
  }
  // text the designer asks for that would be hard to read is theirs to choose, but asked about first
  const concern = role === 'text' && contrastRatio(hex, c.background) < 4.5 ? `${said.charAt(0).toUpperCase()}${said.slice(1)} text on this background has a contrast of ${contrastRatio(hex, c.background).toFixed(1)}:1, below the 4.5:1 that text needs to be read easily. Make the change anyway?` : undefined;
  const what = role === 'accent' ? 'buttons and accent' : role === 'background' ? 'background' : 'text';
  return { patches: [{ op: 'tokens', tokens: { colors }, summary: `The ${what} in ${said}` }], label: `the ${what} to ${said}${said.startsWith('#') ? '' : ` (${hex})`}${notes.length ? `; ${notes.join('; ')}` : ''}`, kind: 'colour', ...(concern ? { concern } : {}) };
}

const sectionOf = (spec: DesignSpec, id: string | undefined) => (id ? spec.sections.find((x) => x.id === id) ?? null : null);
const firstOf = (spec: DesignSpec, kinds: string[]): Section | null => spec.sections.find((x) => kinds.includes(x.kind)) ?? null;
const isButtonPath = (path: string | undefined) => /^(primary|secondary|cta|action|button)$/.test(path ?? '');

/**
 * The quick edit these words ask for on this design, or null when they ask for something only a model can work out.
 * The selection says which part "this", "it" and "here" mean.
 */
export function readQuickEdit(comment: string, spec: DesignSpec | null | undefined, selection: QuickSelection | null | undefined = null): QuickEdit | null {
  if (!spec) return null;
  const raw = String(comment ?? '').trim();
  if (!raw || raw.length > 160) return null;
  const w = raw.toLowerCase().replace(/[’']/g, "'");
  // a request that is about more than one small thing is the model's to read
  if (/\b(and also|as well as|then)\b/.test(w) || (w.match(/\band\b/g) ?? []).length > 1) return null;
  const ux = selection?.element?.ux ?? null;
  const selected = sectionOf(spec, ux?.section ?? undefined);

  // NEW WORDS for a field: "change this to “…”", "make the headline say “…”", "rename the button “…”"
  const quoted = quotedIn(raw);
  if (quoted && /\b(change|make|set|rename|replace|say|says|read|reads|call|retitle|to)\b/.test(w)) {
    let sec = selected;
    let path = ux?.path ?? '';
    if (!sec || !path) {
      if (/\b(headline|heading|title)\b/.test(w)) (sec = firstOf(spec, ['hero', 'compose'])), (path = 'title');
      else if (/\b(button|cta|call to action)\b/.test(w)) (sec = firstOf(spec, ['hero', 'cta'])), (path = sec?.kind === 'cta' ? 'primary' : 'primary');
    }
    if (sec && path) {
      const p = textPatch(sec, path, quoted);
      if (p) return { patches: [p], label: `new words: “${quoted.slice(0, 60)}${quoted.length > 60 ? '…' : ''}”`, kind: 'words' };
    }
    return null;
  }

  // AT A WIDTH, for the selected part: "hide this on phones", "centre it on mobile", "picture first on phones",
  // "smaller headings on tablets" (lib/ux-v0/spec.ts Responsive); without a selection it is the model's to place
  const bp: Breakpoint | null = /\b(on|for|at) (phones?|mobiles?|small screens?)\b/.test(w) ? 'mobile' : /\b(on|for|at) (tablets?|ipads?)\b/.test(w) ? 'tablet' : null;
  if (bp) {
    if (!selected) return null;
    const where = bp === 'mobile' ? 'on phones' : 'on tablets';
    const picture = /\b(picture|image|photo|media|object)\b/.test(w);
    const heads = /\b(headlines?|headings?|titles?|type)\b/.test(w);
    const [rule, said]: [Record<string, unknown> | null, string] = /\b(hide|hidden|remove|drop|don't show|do not show)\b/.test(w)
      ? [{ hide: true }, 'hidden']
      : /\b(show|unhide|bring (it )?back)\b/.test(w)
        ? [{ hide: null }, 'shown again']
        : picture && stacksPicture(selected) && /\b(first|above|before|on top|at the top)\b/.test(w)
          ? [{ media: 'first' }, 'picture before the words']
          : picture && stacksPicture(selected) && /\b(last|below|after|under|underneath|at the bottom)\b/.test(w)
            ? [{ media: 'last' }, 'picture after the words']
            : /\b(cent(re|er)(d|ed)?)\b/.test(w)
              ? [{ align: 'center' }, 'centred']
              : /\b(left|left-aligned)\b/.test(w)
                ? [{ align: 'start' }, 'set left']
                : heads && /\b(smaller|less prominent)\b/.test(w)
                  ? [{ type: 's' }, 'smaller headings']
                  : heads && /\b(bigger|larger)\b/.test(w)
                    ? [{ type: 'l' }, 'larger headings']
                    : /\b(more (space|padding|room)|airier|roomier)\b/.test(w)
                      ? [{ pad: 'l' }, 'generous spacing']
                      : /\b(less (space|padding|room)|tighter|more compact)\b/.test(w)
                        ? [{ pad: 's' }, 'tight spacing']
                        : [null, ''];
    if (!rule) return null;
    return { patches: [{ op: 'responsive', sectionId: selected.id, breakpoint: bp, rule, summary: `${said.charAt(0).toUpperCase()}${said.slice(1)} ${where}` }], label: `${said} ${where}`, kind: 'width' };
  }

  // A COLOUR for a role: "the button colour to black", "a white background", "make it navy" (with a button selected)
  const colour = colourIn(w);
  if (colour && /\b(colou?r|make|change|turn|set|use|paint|to|in)\b/.test(w)) {
    const roles = [...new Set(ROLE_WORDS.filter(([re]) => re.test(w)).map(([, r]) => r))];
    if (roles.length > 1) return null;
    let role = roles[0] ?? null;
    if (!role && selection?.element && (isButtonPath(ux?.path) || /^(a|button)$/i.test(selection.element.tag ?? '') || selection.element.role === 'button')) role = 'accent';
    if (role) return colourPatch(spec, role, colour.hex, colour.said);
    return null;
  }

  // A TYPEFACE from SocriaUX's list, for the headlines or the text
  const font = fontIn(raw);
  if (font && /\b(use|switch|change|set|make|font|typeface|type)\b/.test(w)) {
    const f = knownFont(font);
    const display = /\b(headlines?|headings?|titles?|display)\b/.test(w);
    const body = /\b(body|text|paragraphs?|copy|reading)\b/.test(w);
    if (!f || display === body) return null;
    if (body && f.displayOnly) return null;
    const role = display ? 'display' : 'body';
    if (spec.tokens.fonts[role] === font) return { patches: [], label: `${role === 'display' ? 'the headlines are' : 'the text is'} already in ${font}`, kind: 'type' };
    return { patches: [{ op: 'tokens', tokens: { fonts: { [role]: font } }, summary: `${role === 'display' ? 'Headlines' : 'Text'} in ${font}` }], label: `${role === 'display' ? 'the headlines' : 'the text'} in ${font}`, kind: 'type' };
  }

  // CORNERS: rounder, softer, square
  if (/\bcorners?\b|\brounded\b|\bpill\b/.test(w)) {
    const radius = /\b(square|sharp|squarer|no round(ed|ing)?|straight)\b/.test(w) ? 'none' : /\b(soft(er)?|slightly|a little|subtle)\b/.test(w) ? 'soft' : /\b(round(er|ed)?|pill|more rounded)\b/.test(w) ? 'round' : null;
    if (!radius) return null;
    if (spec.tokens.radius === radius) return { patches: [], label: `the corners are already ${radius === 'none' ? 'square' : radius === 'soft' ? 'soft' : 'round'}`, kind: 'corners' };
    return { patches: [{ op: 'tokens', tokens: { radius }, summary: radius === 'none' ? 'Square corners' : radius === 'soft' ? 'Softer corners' : 'Rounder corners' }], label: radius === 'none' ? 'square corners' : radius === 'soft' ? 'softer corners' : 'rounder corners', kind: 'corners' };
  }

  // THE HEADLINE'S SIZE: bigger or smaller (the opening's own setting)
  const bigger = /\b(bigger|larger|huge|more prominent)\b/.test(w);
  const smaller = /\b(smaller|less prominent|tone down)\b/.test(w);
  if ((bigger || smaller) && /\b(headline|heading|title|this|it)\b/.test(w)) {
    const hero = selected?.kind === 'hero' ? selected : /\b(headline|heading|title)\b/.test(w) ? firstOf(spec, ['hero']) : null;
    if (!hero) return null;
    const now = Number((hero.shape as { scale?: number } | undefined)?.scale ?? 1);
    const to = Math.round(Math.max(0.82, Math.min(1.25, now + (bigger ? 0.1 : -0.1))) * 100) / 100;
    if (to === now) return null;
    return { patches: [{ op: 'shape', sectionId: hero.id, shape: { scale: to }, summary: bigger ? 'A bigger headline' : 'A smaller headline' }], label: bigger ? 'a bigger headline' : 'a smaller headline', kind: 'size' };
  }

  // SPACE around the selected part: more or less
  if (selected && /\b(here|this|it|section|around)\b/.test(w)) {
    const more = /\b(more (space|padding|room|air|breathing room)|airier|roomier)\b/.test(w);
    const less = /\b(less (space|padding|room)|tighter|more compact|denser)\b/.test(w);
    if (more !== less) {
      const i = PADS.indexOf((selected.pad ?? 'm') as (typeof PADS)[number]);
      const pad = PADS[Math.max(0, Math.min(PADS.length - 1, i + (more ? 1 : -1)))];
      if (pad !== (selected.pad ?? 'm')) return { patches: [{ op: 'tone', sectionId: selected.id, pad, summary: more ? 'More space around it' : 'Less space around it' }], label: more ? 'more space around it' : 'less space around it', kind: 'space' };
      return null;
    }
    // REMOVING the selected part
    if (/^(please )?(remove|delete|hide)( this| it| the section| this section)?[.!]?$/.test(w) && selected.kind !== 'nav') {
      return { patches: [{ op: 'remove', sectionId: selected.id, summary: 'Removed the section' }], label: 'removed the section', kind: 'remove' };
    }
  }
  return null;
}
