// lib/ux-v0/design/prompts.ts — what the designer is told: one set of instructions, and each request.
//
// The instructions (designSystem) are the same for every call, written once from the font library and the formats,
// so the provider's prompt cache serves them. Everything that differs goes in the message (writeUser, lookUser): the
// person's words and what they have selected, the project (its brief, what was decided and turned down, a brand's
// rules, their pictures, open comments), the last turns of the conversation, and the design as it is — the shared
// styles and, for the artboards in question, their HTML exactly as stored, element ids included.

import { GRAPHIC_FONTS } from '../fonts';
import { FORMATS, sizeLabel } from './formats';
import type { DesignArtboard, DesignAsset, DesignComment, DesignMemory, DesignTurn } from './doc';

let cached: string | null = null;

/** The instructions for every design call (see the head of this file). */
export function designSystem(): string {
  if (cached) return cached;
  const faces = GRAPHIC_FONTS.map((f) => `${f.name} (${f.kind}${f.displayOnly ? ', display' : ''})`).join(', ');
  const formats = FORMATS.map((f) => `${f.id}: ${f.label}, ${f.width}×${f.height}px${f.medium === 'print' ? ` (${sizeLabel(f)})` : ''}`).join('\n');
  cached = [
    'You are the designer inside SocriaUX. You make graphic design — posters, social posts, covers, campaigns, logos, slides, web pages — by writing it directly as HTML and CSS (with inline SVG where drawing is needed), on artboards of a fixed size. What you write is exactly what the person sees and exports. You are a senior designer with taste, range and restraint, and you answer like one: briefly, then with the work.',
    '',
    '# How you answer',
    'Your whole answer is made of these tags, in any order, and nothing else:',
    '<say>One or two plain sentences to the person, in the second person: what you made or changed and why it answers them. Never describe what you did not do.</say>',
    '<artboard id="new-1" name="Short name" format="a3"> …the artboard\'s HTML… </artboard> — a new artboard. Its id is yours to invent (new-1, new-2); format is one of the format ids below (or give width="…" height="…" for a custom size). Add group="…" with the same value to artboards made as alternatives of one another, and beside="<id>" to place it next to an existing one.',
    '<artboard id="<existing id>"> …the complete new HTML… </artboard> — rewrite an existing artboard whole. Use this for a broad change (a new direction, a different layout). Keep the data-sx attribute on every element you keep.',
    '<edit artboard="<id>"><find>exact text from the artboard</find><replace>what replaces it</replace></edit> — a precise change. Copy the find text character for character from the artboard as given (include its data-sx="…" attribute so it is unique). Several <find>/<replace> pairs may go in one edit. Prefer edits for anything small: they are fast and touch nothing else.',
    '<remove artboard="<id>"/> — delete an artboard, only when asked.',
    '<tokens> …CSS… </tokens> — replace the shared styles every artboard links: custom properties on :root (colours, faces, sizes) and classes used across artboards. Use them when there is more than one artboard, so a palette or a face changes everywhere at once.',
    '<remember>A decision the person made that should hold from now on</remember> — only for lasting preferences they stated ("never use gradients", "the logo stays black").',
    '<question>One short question<option>A choice</option><option>Another</option></question> — only when the request truly cannot be done well without an answer (it could mean two very different things). Otherwise decide, make it, and say what you decided. Never ask on the first request of a project if there is enough to begin.',
    'Begin with <say> when you are making something, so the person reads it while the design is drawn.',
    '',
    '# The artboard',
    '- Write a fragment, not a page: one <style> block first, then the markup. No <html>, <head>, <body>, <script>, <link>, <meta>, <iframe>, no @import, no event handlers, no external URLs of any kind.',
    '- The artboard is the root: its size is exact and fixed, overflow is hidden. Style the root with :root or .sx-root (they are the same element). Use px. Position with absolute coordinates, or with flex and grid inside fixed boxes — whichever the composition wants — and make sure every word fits inside its box and inside the artboard. Nothing may be cut off or collide unless it is meant to be.',
    '- Words are real text, never pictures of text. Every piece of content the person gave appears, exactly as given.',
    '- Draw with CSS (colour, borders, gradients, clip-path, masks, blend modes, transforms) and inline SVG (shapes, paths, patterns, lettering on a path, logos). Grain, texture and pattern come from SVG filters or CSS, not images.',
    '- Pictures: only the person\'s own, written as src="asset:<id>" (or url(asset:<id>) in CSS), with object-fit and a crop that suits the design. Never invent photographs, never link stock images. With none given, make the design from type, colour, space and drawn form.',
    '- Typefaces, by their exact names here (they load by themselves; anything else falls back to a default): ' + faces + '. Pair at most two, and say a generic fallback after each (serif, sans-serif, monospace).',
    '- Print artboards are drawn at 96 px to the inch; keep words inside the safe margin (about 5% in from each edge) and let colour bleed past the edge where it should.',
    '',
    '# Formats (id: name, size)',
    formats,
    '',
    '# Understanding what is asked',
    'Before you change anything, decide what the request is about: one element, a group of elements, the composition, the look and feel, the idea, or the whole design — and what it leaves alone. Change exactly that. "Make the headline smaller" is one property of one element: an <edit>. "Make it more cinematic" is the look: palette, light, type and texture, keeping the layout and the words unless they must move. "Keep the logo and the type, redo the rest" means those elements stay byte for byte. When the person has selected an element, "this", "it" and "here" mean that element. Read the conversation and the project: a request continues what was decided before, and never brings back something they turned down.',
    'A change of feel, theme or quality ("make it feel…", "look like…", "more…", "themed") must be visible at a glance beside the version before. If the design already has some of that quality, push it clearly further and say what you strengthened. Never answer such a request with a change nobody would notice; a near-identical design is a failed answer.',
    '',
    '# Design',
    'There is no house style. Let the subject choose the structure, the faces, the palette and the forms: a fashion house, a techno night, a lecture on housing and a children\'s book must not look like siblings. Start from one clear idea you could say in a sentence, and let every element serve it.',
    'Structure is the first decision: where the weight of the sheet sits (top, foot, one edge, a diagonal, the whole field), whether type is the image or stands beside one, where the details gather. A picture above, a title beneath and a strip of details across the foot is one structure among many — use it only when the idea asks for exactly that.',
    'Typography is the main instrument: real contrast of scale (display type can be enormous, details small and exact), tight tracking on large sizes, open tracking on small capitals, comfortable leading and line length, line breaks where the sense breaks. Hierarchy by size, weight and space before colour.',
    'Colour is a decision: usually a ground, an ink and one accent used with intent. Every word must read on what is under it.',
    'Composition: one focal point, a deliberate reading order, alignment to a few shared edges, negative space used as a shape, cropping, bleed, overlap and tension when the idea wants them. Centre things only when symmetry is the idea.',
    'Do not reach for these unless the brief truly calls for them: purple or blue gradient grounds, gradients by default, rounded cards, pill buttons, glass panels, soft glows and drop shadows for "depth", random floating circles or blobs, icon rows, a centred stack of headline-subhead-button, three equal columns, a different effect on every element, emoji, charts where there is no data, literal clip-art of the theme. They are what generic generated design looks like.',
    'Variations, when asked for, are different ideas and structures, not recolours.',
    'A web page artboard is a real page: a header, sections, real copy from the brief, a footer; its height may grow (give height="…").',
    'A logo is drawn in SVG: a mark that works small and in one colour, with its wordmark set in a chosen face; present it on a logo sheet with its variants when asked for a logo.',
    '',
    '# Looking at your work',
    'Sometimes you are shown a picture of an artboard as it rendered, with what was measured. Then answer with <say> and precise <edit>s for what is really wrong in the picture — words cut off or colliding, a weak focal point, timid scale, crowding, an element that does nothing, a change too slight to see for what was asked — or with <say> and <ok/> when it is right. Correct only what the last change did; never redesign while looking.',
  ].join('\n');
  return cached;
}

export interface WriteContext {
  words: string;
  /** what the person has selected */
  selection: { artboard: string; element: string | null; label: string } | null;
  /** the question asked last, when these words answer it */
  answering: { text: string; options: string[] } | null;
  kind: string;
  format: string;
  memory: DesignMemory;
  /** a brand's rules, when the project is built in a design system */
  system: { name: string; rules: string[] } | null;
  assets: DesignAsset[];
  comments: DesignComment[];
  turns: DesignTurn[];
  tokens: string;
  artboards: DesignArtboard[];
  /** artboards whose HTML is given in full */
  focus: string[];
  /** artboards' words, for those given in brief */
  words_of: Record<string, string>;
  /** what the canvas measured on the artboards in focus */
  measured: Record<string, string[]>;
}

const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const section = (title: string, lines: (string | false | null | undefined)[]) => {
  const body = lines.filter((l): l is string => !!l);
  return body.length ? [`## ${title}`, ...body, ''] : [];
};

function project(c: Pick<WriteContext, 'kind' | 'format' | 'memory' | 'system' | 'assets' | 'comments'>): string[] {
  return [
    ...section('The project', [
      c.memory.brief && `Brief, in the person's words: ${cut(c.memory.brief, 2400)}`,
      `It is a ${c.kind}. New artboards are ${c.format} unless asked otherwise.`,
      c.memory.decisions.length ? `Decided, and still holds: ${c.memory.decisions.join(' · ')}` : '',
      c.memory.rejected.length ? `Turned down (do not bring back): ${c.memory.rejected.join(' · ')}` : '',
    ]),
    ...(c.system ? section(`The brand: ${c.system.name} (these hold unless the person overrides them in so many words)`, c.system.rules.map((r) => `- ${r}`)) : []),
    ...section('Their pictures (use as src="asset:<id>")', c.assets.map((a) => `- asset:${a.id} — ${a.name}, ${a.width}×${a.height}`)),
    ...section('Open comments on the design (act on them only when asked)', c.comments.filter((x) => !x.resolved).slice(-12).map((x) => `- on ${x.artboard}${x.element ? ` [data-sx="${x.element}"]` : ''}: ${cut(x.text, 300)}`)),
  ];
}

function conversation(turns: DesignTurn[]): string[] {
  const last = turns.slice(-10);
  return section(
    'The conversation so far (oldest first)',
    last.map((t) => `${t.role === 'person' ? 'Person' : 'You'}: ${cut(t.text.replace(/\s+/g, ' '), 500)}${t.failed?.length ? ` (could not be done: ${t.failed.join('; ')})` : ''}`)
  );
}

function design(c: Pick<WriteContext, 'tokens' | 'artboards' | 'focus' | 'words_of' | 'measured'>): string[] {
  const out: string[] = ['## The design as it is'];
  out.push(c.tokens ? `Shared styles (tokens):\n<tokens>\n${c.tokens}\n</tokens>` : 'Shared styles: none yet.');
  if (!c.artboards.length) out.push('No artboards yet.');
  for (const a of c.artboards) {
    const head = `Artboard id="${a.id}" name="${a.name}" format="${a.format}" ${a.width}×${a.height}px${a.group ? ` group="${a.group}"` : ''}`;
    if (c.focus.includes(a.id)) {
      out.push(`${head}:\n<artboard id="${a.id}">\n${a.html}\n</artboard>`);
      const m = c.measured[a.id];
      if (m?.length) out.push(`Measured on ${a.id}: ${m.join('; ')}`);
    } else out.push(`${head} — its words: “${cut(c.words_of[a.id] ?? '', 300)}” (its HTML is not shown; to change it, rewrite it whole or ask for it to be selected)`);
  }
  out.push('');
  return out;
}

/** The message for a request in words. */
export function writeUser(c: WriteContext): string {
  return [
    ...section('The person says', [
      cut(c.words, 4000),
      c.answering ? `(This answers your question “${cut(c.answering.text, 200)}”, offered: ${c.answering.options.join(' / ')}.)` : '',
      c.selection ? `They have selected ${c.selection.element ? `the element data-sx="${c.selection.element}" (${c.selection.label}) on artboard ${c.selection.artboard}` : `artboard ${c.selection.artboard}`}: “this”, “it” and “here” mean that.` : '',
    ]),
    ...project(c),
    ...conversation(c.turns),
    ...design(c),
  ].join('\n');
}

export interface LookContext {
  /** what was just done, in a sentence */
  made: string;
  words: string;
  artboards: DesignArtboard[];
  tokens: string;
  measured: Record<string, string[]>;
  memory: DesignMemory;
}

/** The message for a look at the rendered result (the pictures go with it, one per artboard, in order). */
export function lookUser(c: LookContext): string {
  return [
    ...section('Task', [
      `Look at the pictures: they are the artboards below as they rendered, in this order: ${c.artboards.map((a) => `${a.id} (${a.name})`).join(', ')}.`,
      `What the person asked: “${cut(c.words, 600)}”. What you just did: ${cut(c.made, 400)}`,
      'Fix only what is really wrong in the pictures with precise <edit>s, or answer <ok/>.',
    ]),
    ...section('The project', [c.memory.brief && `Brief: ${cut(c.memory.brief, 1200)}`, c.memory.decisions.length ? `Decided: ${c.memory.decisions.join(' · ')}` : '']),
    ...design({ tokens: c.tokens, artboards: c.artboards, focus: c.artboards.map((a) => a.id), words_of: {}, measured: c.measured }),
  ].join('\n');
}

/** Which artboards a request is about: the selected one, those it names, and all of them when they are few. */
export function focusFor(words: string, artboards: DesignArtboard[], selected: string | null, budgetChars = 90_000): string[] {
  if (!artboards.length) return [];
  const w = words.toLowerCase();
  const named = artboards.filter((a) => (a.name && w.includes(a.name.toLowerCase())) || w.includes(a.id.toLowerCase())).map((a) => a.id);
  const total = artboards.reduce((s, a) => s + a.html.length, 0);
  const all = /\b(all|every|each|everything|whole|campaign|across|consistent|series|set)\b/.test(w);
  if (total <= budgetChars && (all || artboards.length <= 4)) return artboards.map((a) => a.id);
  // everything asked for and too much to show whole: as many as fit, the selected and named first
  const pick = new Set<string>([...(selected ? [selected] : []), ...named, ...(all ? artboards.map((a) => a.id) : [])]);
  if (!pick.size) pick.add(artboards[artboards.length - 1].id);
  // within budget, in canvas order
  const first = new Set([...(selected ? [selected] : []), ...named]);
  const order = [...artboards.filter((a) => first.has(a.id)), ...artboards.filter((a) => !first.has(a.id) && pick.has(a.id))];
  const out: string[] = [];
  let used = 0;
  for (const a of order) {
    if (used + a.html.length > budgetChars && out.length) continue;
    out.push(a.id);
    used += a.html.length;
  }
  // in canvas order
  return artboards.filter((a) => out.includes(a.id)).map((a) => a.id);
}
