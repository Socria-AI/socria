// lib/ux-v0/graphics/director/protect.ts — what the person said to keep, enforced in code.
//
// "Keep the logo and typography. Redesign everything else." The second sentence is the director's to interpret; the
// first is not left to anyone's interpretation. What a person says to keep is read from their words here, as a small
// fixed vocabulary (the logo, the typography, the words, the colours, the layout, the background, the pictures, the
// forms, or a named part: the headline, the supporting line, the details, the call to action), and every edit the
// director answers with is checked against it before anything is carried out: an edit that would touch a protected
// object or property is not made, and that is said. "Only change the background" protects everything else the same
// way. The director is told what is protected (prompts.ts), so it plans around it; the guard is what guarantees it.

import type { Artboard, Node, Role } from '../doc';
import { walk } from '../doc';
import type { DirectedEdit, EditOp, SetProps } from './schema';

export const SUBJECTS = ['logo', 'type', 'words', 'colours', 'layout', 'background', 'pictures', 'forms', 'headline', 'subhead', 'meta', 'cta'] as const;
export type Subject = (typeof SUBJECTS)[number];

export interface Protection {
  /** what must not change */
  keep: Subject[];
  /** when set: ONLY these may change (everything else is kept) */
  only?: Subject[];
  /** the same, in words for the person and the director */
  said: string[];
}

const SUBJECT_WORDS: [Subject, RegExp][] = [
  ['logo', /\b(logo|logotype|brand ?mark|wordmark|brand ?name|branding|the brand)\b/],
  ['type', /\b(typography|typographic|type ?face|type ?faces|fonts?|lettering|type(?! of))\b/],
  ['headline', /\b(headline|title|heading|main (text|line|words))\b/],
  ['subhead', /\b(sub-?head(ing|line)?|subtitle|tag ?line|strap ?line|supporting (line|text))\b/],
  ['meta', /\b(details|dates?|venue|address|information|info|small print)\b/],
  ['cta', /\b(cta|call to action|button)\b/],
  ['colours', /\b(colou?rs?|palette|colou?r ?scheme|colou?rway)\b/],
  ['layout', /\b(layout|composition|arrangement|structure|placement|positions?|positioning)\b/],
  ['background', /\b(background|backdrop)\b/],
  ['pictures', /\b(images?|imagery|photos?|photographs?|pictures?|photography)\b/],
  ['forms', /\b(shapes?|forms|graphics|graphic elements|illustrations?|decorations?|ornaments?|motifs?)\b/],
  ['words', /\b(wording|words|copy|text|content|message)\b/],
];
const LABEL: Record<Subject, string> = { logo: 'the logo', type: 'the typography (faces, weights and styles)', words: 'the wording', colours: 'the colours', layout: 'the layout', background: 'the background', pictures: 'the pictures', forms: 'the shapes', headline: 'the headline', subhead: 'the supporting line', meta: 'the details', cta: 'the call to action' };

const KEEP = /\b(keep|keeping|preserve|preserving|leave|leaving|maintain|maintaining|retain|retaining|protect|stick with|don'?t (?:change|touch|alter|move|modify|replace|lose)|do not (?:change|touch|alter|move|modify|replace|lose)|without (?:changing|touching|altering|moving|losing)|not (?:the|touching the))\b/;
const STAYS = /\b(?:should |must |to )?(?:stays?|remains?|(?:is|are) (?:fine|good|perfect|great)|as (?:it is|they are)|unchanged|untouched|intact|the same)\b/;
const ONLY = /\b(?:only|just)\b[^.;]*?\b(?:change|touch|adjust|edit|alter|update|modify|redo|rework|redesign|restyle|fix)\b|\b(?:change|touch|adjust|edit|alter|update|modify|redo|rework|redesign|restyle)\b[^.;]*?\b(?:only|just|nothing but)\b|\bnothing else\b|\bleave (?:everything|all) else\b|\b(?:everything|all) else (?:stays?|as (?:it is)|unchanged|the same)\b/;
const REST = /\b(everything|all|anything) else\b|\bthe rest\b|\bthe remainder\b/;

const subjectsIn = (text: string): Subject[] => SUBJECT_WORDS.filter(([, re]) => re.test(text)).map(([s]) => s);

/**
 * What the words say to keep. Clause by clause: a clause that says keep/preserve/leave/don't change names what it
 * protects; "X stays / as it is / is perfect" does too; "only change X" (or "… nothing else") protects everything but
 * X. "Keep everything else" protects nothing by name (the rest is kept by scope). A clause is never read as both.
 */
export function protectionsIn(words: string): Protection {
  const text = words.toLowerCase().replace(/[“”"]/g, ' ');
  const clauses = text.split(/[.;!?\n]+|\s+but\s+|\s+however\s+|,\s*(?=(?:but|and then|then|redesign|rethink|change|make|give|turn)\b)/).map((c) => c.trim()).filter(Boolean);
  const keep = new Set<Subject>();
  let only: Set<Subject> | null = null;
  for (const c of clauses) {
    if (ONLY.test(c)) {
      const what = subjectsIn(c.replace(REST, ' '));
      if (what.length) only = new Set([...(only ?? []), ...what]);
      continue;
    }
    const k = KEEP.exec(c);
    if (k) {
      // what follows the keep-word, up to where the clause turns to what should change
      const after = c.slice(k.index + k[0].length).split(/\b(?:and|then|while|whilst)\s+(?:make|change|redesign|rethink|rework|replace|give|turn|update|adjust|move)\b/)[0];
      if (REST.test(after) && !subjectsIn(after.replace(REST, ' ')).length) continue;
      subjectsIn(after).forEach((s) => keep.add(s));
      continue;
    }
    if (STAYS.test(c) && !/\b(make|change|replace|redesign|rethink|rework)\b/.test(c)) subjectsIn(c.replace(REST, ' ')).forEach((s) => keep.add(s));
  }
  // "the text" as wording is always kept; as a protection it only matters when said beside a real one
  const list = [...keep];
  const said = [...list.map((s) => LABEL[s]), ...(only ? [`everything except ${[...only].map((s) => LABEL[s]).join(' and ')}`] : [])];
  return { keep: list, ...(only ? { only: [...only] } : {}), said };
}

const TYPE_PROPS: (keyof SetProps)[] = ['font', 'weight', 'italic', 'case', 'tracking', 'outline'];
const COLOUR_PROPS: (keyof SetProps)[] = ['color', 'fill', 'stroke', 'accentWord'];
const ROLE_OF: Partial<Record<Subject, Role[]>> = { logo: ['logo'], headline: ['headline'], subhead: ['subhead'], meta: ['meta'], cta: ['cta'] };

interface Facts {
  role: string;
  type: Node['type'];
  background: boolean;
  decorative: boolean;
  words: boolean;
  /** the roles of the groups it is inside */
  within: string[];
}

function factsOf(board: Artboard): Map<string, Facts> {
  const out = new Map<string, Facts>();
  const area = board.width * board.height;
  for (const l of walk(board)) {
    const n = l.node;
    out.set(n.id, {
      role: n.role ?? 'none',
      type: n.type,
      background: n.role === 'background' || (n.type === 'shape' && n.w * n.h >= area * 0.9),
      decorative: !!n.decorative || (n.type === 'shape' && n.role !== 'logo' && n.role !== 'cta') || n.type === 'pattern',
      words: n.type === 'text' && !n.decorative,
      within: l.parents.map((p) => p.role ?? 'none'),
    });
  }
  return out;
}

/** The subjects an object belongs to (a logo is the logo; a headline is words, type, colours and layout too). */
function subjectsOf(f: Facts): Subject[] {
  const out: Subject[] = [];
  const roles = [f.role, ...f.within];
  for (const [s, rs] of Object.entries(ROLE_OF) as [Subject, Role[]][]) if (rs.some((r) => roles.includes(r))) out.push(s);
  if (f.type === 'image' && !roles.includes('logo')) out.push('pictures');
  if (f.background) out.push('background');
  else if (f.decorative && !roles.includes('logo')) out.push('forms');
  return out;
}

export interface Guarded {
  edit: DirectedEdit;
  /** what was not done because it was to be kept, said */
  kept: string[];
  /** ids no later step (a palette or face change, a repair) may touch */
  frozen: Set<string>;
  /** the palette and the faces may not change */
  lockColours: boolean;
  lockType: boolean;
}

/** The edit with everything that would touch a protected object or property taken out (and said). */
export function guard(edit: DirectedEdit, board: Artboard, p: Protection, opts: { mayRemoveWords?: boolean } = {}): Guarded {
  const facts = factsOf(board);
  const kept = new Set<string>();
  const keeps = new Set<Subject>(p.keep);
  const only = p.only ? new Set<Subject>(p.only) : null;
  // objects wholly protected: a role named to keep, or (with "only") everything not named
  const frozen = new Set<string>();
  for (const [id, f] of facts) {
    const subs = subjectsOf(f);
    if (subs.some((s) => keeps.has(s) && (ROLE_OF[s] || s === 'pictures' || s === 'background' || s === 'forms'))) frozen.add(id);
    if (only) {
      const mine = new Set<Subject>([...subs, ...(f.words ? (['type', 'words', 'colours', 'layout'] as Subject[]) : (['colours', 'layout'] as Subject[]))]);
      if (![...only].some((s) => mine.has(s))) frozen.add(id);
    }
  }
  const lockType = keeps.has('type') || (!!only && !only.has('type') && ![...only].some((s) => ROLE_OF[s]));
  const lockColours = keeps.has('colours') || (!!only && !only.has('colours') && !only.has('background') && ![...only].some((s) => ROLE_OF[s] || s === 'forms' || s === 'pictures'));
  const lockLayout = keeps.has('layout') || (!!only && !only.has('layout') && ![...only].some((s) => ROLE_OF[s] || s === 'forms' || s === 'pictures'));
  const lockGround = keeps.has('background') || lockColours || (!!only && !only.has('background') && !only.has('colours'));
  const label = (id: string) => {
    const f = facts.get(id);
    return f ? (subjectsOf(f).map((s) => LABEL[s])[0] ?? (f.words ? 'the words' : 'that object')) : 'that object';
  };
  const edits: EditOp[] = [];
  for (const e of edit.edits) {
    if (e.do === 'ground') {
      if (lockGround) kept.add(keeps.has('colours') ? LABEL.colours : LABEL.background);
      else edits.push(e);
      continue;
    }
    if (e.do === 'add') {
      // new material is a change to the forms; under "only", it belongs to what may change when forms or the background may
      if (keeps.has('forms') || (only && !only.has('forms') && !only.has('background') && !only.has('pictures'))) kept.add(LABEL.forms);
      else edits.push(e);
      continue;
    }
    if (e.do === 'restore') {
      edits.push(e);
      continue;
    }
    if (frozen.has(e.id)) {
      kept.add(label(e.id));
      continue;
    }
    const f = facts.get(e.id);
    if (e.do === 'words') {
      if (keeps.has('words')) kept.add(LABEL.words);
      else edits.push(e);
      continue;
    }
    if (e.do === 'place' || e.do === 'order') {
      if (lockLayout && f && (f.words || f.type === 'image' || f.type === 'chart')) kept.add(LABEL.layout);
      else edits.push(e);
      continue;
    }
    if (e.do === 'remove') {
      // words are removed only when the person asked for something to be taken away
      if (f?.words && !opts.mayRemoveWords) kept.add('the words (nothing that is read is removed unless you ask)');
      else edits.push(e);
      continue;
    }
    // set: the protected properties are taken out, the rest stands
    const props: SetProps = { ...e.props };
    if (lockType && f?.type === 'text') for (const k of TYPE_PROPS) if (k in props) (delete props[k], kept.add(LABEL.type));
    if (lockColours) for (const k of COLOUR_PROPS) if (k in props) (delete props[k], kept.add(LABEL.colours));
    if (lockLayout && f?.words && 'size' in props) (delete props.size, kept.add(LABEL.layout));
    if (Object.keys(props).length) edits.push({ ...e, props });
  }
  const next: DirectedEdit = { ...edit, edits };
  if (lockColours && next.palette) (delete next.palette, kept.add(LABEL.colours));
  if (lockType && next.fonts) (delete next.fonts, kept.add(LABEL.type));
  return { edit: next, kept: [...kept], frozen, lockColours, lockType };
}

export const NO_PROTECTION: Protection = { keep: [], said: [] };
