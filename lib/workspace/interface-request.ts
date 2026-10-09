// lib/workspace/interface-request.ts
//
// "OPEN THE MODEL." "SHOW IT IN 3D." "PUT THE MAP BESIDE THE MODEL." A request
// for an interface, read from what the person typed. The workspace answers it
// by changing what is on screen, instead of with a reply about a screen that
// never changed.
//
// Before this, only the Thinking Map's lenses could be asked for by name
// (lib/view-request.ts). "Open the model", "show it in 3D", "open Live 3D" and
// "show the map and the model side by side" went to the reply, and the reply is
// told never to talk about a visualization, so nothing moved. Worse, "close the
// map" and "remove the 3D model" were read as map edits (lib/map-edit.ts) and
// could delete an idea on the map labelled "Interactive 3D model".
//
// The client reads this BEFORE map commands, so a view verb never reaches a
// node edit, and the workspace applies it (lib/workspace/surfaces.ts
// layoutForRequest). A lens asked for by name is still read by
// readViewRequest, unchanged, and comes back here as the map in that lens.
//
// CONSERVATIVE ON PURPOSE.
//   · A request names a surface after a verb of showing, opening, switching or
//     closing, or is nothing but the surface's name with a "please" or a panel
//     word ("the 3D view", "the model panel").
//   · A question about something is not a request to see it ("what is a
//     model?", "is the map right?").
//   · Construction is not a request for an interface. "Model a 2×2×2 m cube",
//     "make a 3D model of a cone", "build a model of supply and demand" and
//     "show me how a cone's volume changes" go on to Socria, whose map pass
//     builds; the workspace opens what was built when it lands (afterBuild).
//     Nothing here reads a verb of making, and a surface named with "a" ("show
//     me a model") is the start of a description, not a reference to one.
//   · Short messages only: twelve words, a hundred characters.
//
// PURE.

import type { LensId } from '@/lib/logos-layout';
import { readViewRequest, viewSaid } from '@/lib/view-request';
import type { SurfaceType } from './tiling';

/**
 * What to do with the surfaces named.
 *   open   make them visible, beside what is there
 *   close  take them off the stage
 *   only   give the stage to them: one is maximised (restore brings the rest
 *          back), several become the whole workspace
 *   pair   two of the map, the model and the 3D view, side by side
 *   all    all three of them, together
 */
export type InterfaceOp = 'open' | 'close' | 'only' | 'pair' | 'all';

export interface InterfaceRequest {
  op: InterfaceOp;
  /** in the order the workspace lays them out: map, model, 3D view, then the rest */
  surfaces: SurfaceType[];
  /** the map's lens, when one was asked for ("show this as a structure", "math plotting") */
  lens?: LensId;
  /** the words they used for it, for the reply */
  called: string;
  /**
   * Asked to open, and nothing in this line of thinking for it to show yet (no
   * model; nothing in 3D). The panel still opens on its own empty state, as it
   * does from "+ View"; the reply says why it is empty.
   */
  missing?: SurfaceType[];
}

/** What is there to show, as far as the caller knows. Unknown (undefined) is read generously. */
export interface InterfaceContext {
  /** a model document, or a simulation, is in this line of thinking */
  hasModel?: boolean;
  /** something can be shown in 3D: a Live 3D scene, or a model with 3D solids */
  hasScene?: boolean;
  /** the map holds ideas */
  hasMap?: boolean;
}

const MAX_CHARS = 100;
const MAX_WORDS = 12;

/** The order panels are laid out in, left to right. */
const ORDER: SurfaceType[] = ['map', 'model', 'scene', 'params', 'inspector', 'trace', 'mind', 'chat'];
const STAGE = new Set<SurfaceType>(['map', 'model', 'scene']);

type Token =
  | { kind: 'surface'; surface: SurfaceType; lens?: LensId }
  | { kind: '3dmodel' }
  | { kind: 'in3d' }
  | { kind: 'both' }
  | { kind: 'all'; three: boolean }
  | { kind: 'pronoun' };

// ── the words ────────────────────────────────────────────────────

const THREE_D = `(?:3d|3-d|3 d|three[- ]?d|three[- ]dimensional)`;

/** Surface names, after an article and a panel word are taken off. Exact, whole names only. */
const NAMES: [RegExp, Token][] = [
  [new RegExp(`^${THREE_D} (?:models?|objects?|shapes?|solids?|versions?)$`), { kind: '3dmodel' }],
  [new RegExp(`^(?:${THREE_D}|live ${THREE_D}|${THREE_D} scene|scene|cad|studio|studio \\(cad\\)|studio cad|cad studio|${THREE_D} studio|${THREE_D} cad|${THREE_D} viewer|${THREE_D} view)$`), { kind: 'surface', surface: 'scene' }],
  [/^(?:thinking map|map|reasoning map|ideas? map|mind ?map|concept map|map of ideas)$/, { kind: 'surface', surface: 'map' }],
  [/^(?:maths? plotting|plotting|plot|plots|chart|charts|maths? plot|function plot)$/, { kind: 'surface', surface: 'map', lens: 'plot' }],
  [/^(?:models?|modell?ing|simulation)$/, { kind: 'surface', surface: 'model' }],
  [/^(?:parameters?|params?|sliders?|controls|knobs|dials)$/, { kind: 'surface', surface: 'params' }],
  [/^inspector$/, { kind: 'surface', surface: 'inspector' }],
  [/^(?:trace|history|model history|model's history|history of the model|change history|change log|changelog|revisions|revision history|undo history)$/, { kind: 'surface', surface: 'trace' }],
  [/^(?:mind|mind atlas|atlas)$/, { kind: 'surface', surface: 'mind' }],
  [/^(?:chat|conversation|thread|messages|composer)$/, { kind: 'surface', surface: 'chat' }],
  [/^(?:both|both of them|both of those|them both|the two|the two of them|two)$/, { kind: 'both' }],
  [/^(?:all three|all 3|all three of them|the three|three)$/, { kind: 'all', three: true }],
  [/^(?:all|all of them|everything|every|the lot)$/, { kind: 'all', three: false }],
  [/^(?:it|this|that|them|these|those|they)$/, { kind: 'pronoun' }],
];

/**
 * Names that are the product's own names for a view: enough on their own, with
 * no verb and no "please" ("Live 3D", "the thinking map"). A single common word
 * ("model", "map", "both") is not — on its own it is far more often an answer.
 */
const OWN_NAME = new RegExp(`^(?:live ${THREE_D}|thinking map|studio \\(cad\\)|maths? plotting|mind atlas)$`);

const ARTICLE = /^(?:the|my|this|that|these|those|your|our|its|their)\s+/;
/** "a", only before a panel word: "open a 3D view" is a panel; "show me a model" is a description beginning */
const INDEFINITE = /^(?:a|an|another)\s+(?:new\s+)?/;
const PANEL = /\s+(?:views?|panels?|panes?|windows?|tabs?|surfaces?|screens?|viewer|mode)$/;

/** "it in 3D", "the model in 3D", "in 3D" */
const IN_3D = new RegExp(`^(.*?)\\s*\\bin (?:${THREE_D}|live ${THREE_D}|cad|the studio|studio|3 dimensions|three dimensions)$`);
/** what may stand before "in 3D": a pronoun, or something definite and short ("the cone", "my design") */
const IN_3D_HEAD = /^(?:|it|this|that|them|these|those|everything|(?:the|my|this|that|your|our) [a-z0-9'-]+(?: [a-z0-9'-]+){0,2})$/;

const JOIN = /\s*,\s*(?:and\s+)?|\s+(?:and(?: also)?|&|\+|plus|with|beside|besides|next to|alongside|along with|together with|side[- ]by[- ]side with|as well as|and then)\s+/;
const POSITIONAL = /\s(?:beside|next to|alongside|side[- ]by[- ]side with)\s/;

const TOGETHER_TAIL = /\s*,?\s*(?:side[- ]by[- ]side|next to each other|beside each other|alongside each other|together|at once|at the same time|in a row|in split[- ]screen|split[- ]screen|in split view|in two panes|on (?:one|the same) screen)$/;
const ONLY_TAIL = /\s+(?:only|alone|instead|on (?:its|their) own|by (?:itself|themselves)|full[- ]?screen|in full[- ]?screen|bigger|larger|big|as the main view)$/;
const PARTICLE_TAIL = /\s+(?:away|down|off|back|up|out of the way)$/;

const FILLER = /^(?:(?:ok(?:ay)?|alright|all right|right|so|and|also|then|now|great|good|cool|nice|perfect|thanks|thank you|hey|hi|hmm+|um+|socria|logos)[,.!:]*\s+)+/;
const POLITE_TAIL = /(?:[,\s]+(?:please|pls|plz|thanks|thank you|thx|for me|for us|now|again|too|as well|right now|here|then|if you can|if possible))+$/;
/** the words that make a bare name a request ("the model, please"); "now" or "here" alone do not */
const PLEASE = /(?:^|[,\s])(?:please|pls|plz|kindly|thanks|thank you|thx)(?:[,\s]|$)/;
const POLITE_YOU = /^(?:can|could|would|will) you(?: please| kindly| just)?\s+/;
const SEE = /^(?:(?:can|could|may) (?:i|we) (?:see|have|get|look at|view)|(?:i'?d|i would|we'?d|we would) like to (?:see|have|look at)|i (?:want|wanna|need) to see|(?:i|we) (?:want|need)|let me (?:see|look at|have)|let'?s (?:see|look at|have)|let us (?:see|look at)|give me|gimme|get me|bring me)\s+/;
/** a question about something — not a request to see it */
const QUESTION = /^(?:what|what's|whats|why|how|who|whom|whose|when|where|which|is|isn't|are|aren't|was|were|does|doesn't|do|don't|did|didn't|has|hasn't|have|haven't|had|should|shall|might|must|am)\b/;
const CAN_ABOUT = /^(?:can|could|would|will|may)\b/;

type Verb = 'open' | 'only' | 'close' | 'place' | 'make' | 'particle';
const VERBS: [RegExp, Verb][] = [
  [/^(?:bring|pull|call|open|put) up\s+/, 'open'],
  [/^bring back\s+/, 'open'],
  [/^(?:switch|change|flip|go|jump|move|return|get|come)(?: back| over)*(?: over)? to\s+/, 'only'],
  [/^(?:take me|back) to\s+/, 'only'],
  [/^(?:maximi[sz]e|max|expand|enlarge|focus on|zoom (?:in )?(?:on|to)|fill the screen with)\s+/, 'only'],
  [/^(?:close(?: down)?|shut(?: down)?|hide|remove|dismiss|collapse|minimi[sz]e|turn off|switch off|disable|take (?:down|away|off)|put away|get rid of|fold (?:away|up)|tuck away)\s+/, 'close'],
  [/^(?:show|display|view|see|reopen|re-open|open|add|unhide|restore|reveal|turn on|switch on|enable)(?: me| us)?\s+/, 'open'],
  [/^(?:put|place|set|move|arrange|lay out|line up|dock|tile|split)\s+/, 'place'],
  [/^make\s+/, 'make'],
  [/^(?:take|bring|get)\s+/, 'particle'],
];

// ── reading ──────────────────────────────────────────────────────

function clean(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/[“”«»]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function segmentToken(seg: string): { token: Token; marked: boolean; own: boolean } | null {
  let s = seg.trim().replace(/^"(.*)"$/, '$1');
  if (!s) return null;
  // "in 3D", with what is shown in it — never the map or a panel that is not a picture
  const in3 = s.match(IN_3D);
  if (in3) {
    const head = in3[1].trim();
    if (!IN_3D_HEAD.test(head)) return null;
    const named = head ? segmentToken(head) : null;
    if (named && named.token.kind === 'surface' && named.token.surface !== 'model' && named.token.surface !== 'scene') return null;
    return { token: { kind: 'in3d' }, marked: true, own: false };
  }
  let indefinite = false;
  if (ARTICLE.test(s)) s = s.replace(ARTICLE, '');
  else if (INDEFINITE.test(s)) {
    s = s.replace(INDEFINITE, '');
    indefinite = true;
  }
  const own = OWN_NAME.test(s);
  let panel = false;
  if (PANEL.test(s)) {
    const bare = s.replace(PANEL, '');
    // "3D view" is a name in its own right; "the model view" is the model with a panel word
    if (bare && NAMES.some(([rx]) => rx.test(bare))) {
      s = bare;
      panel = true;
    }
  }
  if (indefinite && !panel) return null;
  for (const [rx, token] of NAMES) if (rx.test(s)) return { token, marked: panel || own, own };
  return null;
}

/** The partner a single named surface is paired with, "side by side" — or "both" when nothing is named. */
function partnerOf(s: SurfaceType | null, ctx: InterfaceContext): SurfaceType[] | null {
  const model = ctx.hasModel !== false;
  const map = ctx.hasMap !== false;
  const scene = !!ctx.hasScene;
  if (s === 'map') return model ? ['map', 'model'] : scene ? ['map', 'scene'] : null;
  if (s === 'model') return map ? ['map', 'model'] : scene ? ['model', 'scene'] : null;
  if (s === 'scene') return model ? ['model', 'scene'] : ['map', 'scene'];
  if (s === null) {
    if (model && map) return ['map', 'model'];
    if (model && scene) return ['model', 'scene'];
    if (map && scene) return ['map', 'scene'];
    return null;
  }
  return null;
}

const ordered = (xs: Iterable<SurfaceType>) => ORDER.filter((s) => new Set(xs).has(s));

/**
 * Is this message a request to open, close or arrange an interface? If so,
 * which surfaces, and how. Null means "not a request — read it as anything
 * else would be read" (a map command, a message for Socria).
 */
export function readInterfaceRequest(text: unknown, ctx: InterfaceContext = {}): InterfaceRequest | null {
  if (typeof text !== 'string') return null;
  // A lens asked for by name is the map in that lens — read exactly as it
  // always was, so "show this as a structure" behaves as it did.
  const lens = readViewRequest(text);
  if (lens) return { op: 'open', surfaces: ['map'], lens: lens.lens, called: lens.called };

  let t = clean(text);
  if (!t || t.length > MAX_CHARS || t.split(' ').length > MAX_WORDS) return null;
  t = t.replace(FILLER, '');
  const asked = /\?\s*$/.test(t);
  t = t.replace(/[.!?…]+$/, '').trim();
  const pleased = PLEASE.test(t);
  t = t.replace(POLITE_TAIL, '').replace(/^(?:please|pls|kindly)\s+/, '').trim();

  // "can you …", "could I see …": a request, however it is phrased
  let polite = false;
  if (POLITE_YOU.test(t)) {
    t = t.replace(POLITE_YOU, '');
    polite = true;
  }
  let verb: Verb | null = null;
  if (SEE.test(t)) {
    t = t.replace(SEE, '');
    verb = 'open';
    polite = true;
  }
  // anything else asked is a question about something, not a request to see it
  if (!polite && (QUESTION.test(t) || CAN_ABOUT.test(t))) return null;
  if (asked && !polite) return null;
  t = t.replace(/^(?:please|pls|kindly)\s+/, '');

  let only = false;
  if (/^(?:just|only)\s+/.test(t)) {
    t = t.replace(/^(?:just|only)\s+/, '');
    only = true;
  }
  if (!verb) {
    for (const [rx, v] of VERBS) {
      if (rx.test(t)) {
        verb = v;
        t = t.replace(rx, '');
        break;
      }
    }
  }
  if (/^(?:just|only)\s+/.test(t)) {
    t = t.replace(/^(?:just|only)\s+/, '');
    only = true;
  }
  if (verb === 'open' || verb === 'only') t = t.replace(/^(?:me|us)\s+/, '');

  // what comes after the names
  let together = false;
  let particle: string | null = null;
  for (let i = 0; i < 3; i++) {
    const before = t;
    if (TOGETHER_TAIL.test(t)) {
      together = true;
      t = t.replace(TOGETHER_TAIL, '');
    }
    if (ONLY_TAIL.test(t)) {
      only = true;
      t = t.replace(ONLY_TAIL, '');
    }
    const p = t.match(PARTICLE_TAIL);
    if (p) {
      particle = p[0].trim();
      t = t.replace(PARTICLE_TAIL, '');
    }
    if (t === before) break;
  }
  t = t.trim();
  // "side by side, please" with nothing named is the lens request read above, or nothing
  if (!t) return null;
  // "both the map and the model"
  if (/^both\s+\S/.test(t) && JOIN.test(t.replace(/^both\s+/, ''))) {
    t = t.replace(/^both\s+/, '');
    together = true;
  }
  if (POSITIONAL.test(` ${t} `)) together = true;

  // the verbs that are only a request with something after the names
  let close = verb === 'close';
  if (verb === 'particle') {
    if (particle === 'away' || particle === 'down' || particle === 'off' || particle === 'out of the way') close = true;
    else if (particle === 'back' || particle === 'up') verb = 'open';
    else return null;
  } else if (particle) {
    // "put the map away", "close the model down", "bring the map back"
    if (verb === 'place' && particle === 'away') close = true;
    else if (verb === 'place' && particle === 'back') verb = 'open';
    else if (!(close && particle === 'down') && !(verb === 'open' && (particle === 'back' || particle === 'up'))) return null;
  }
  if (verb === 'make' && !only) return null;
  if (verb === 'place' && !close && !together) return null;

  const segs = t.split(JOIN).filter(Boolean);
  if (!segs.length || segs.length > 4) return null;
  const read = segs.map(segmentToken);
  if (read.some((r) => !r)) return null;
  const tokens = read.map((r) => r!.token);

  // A message with no verb is a request only when it says so. "Both", "all"
  // and a pronoun need more than a "please": "both, please" answers a question
  // as often as it asks for a screen.
  if (!verb) {
    const vague = tokens.some((tk) => tk.kind === 'both' || tk.kind === 'all' || tk.kind === 'pronoun');
    const marked = vague ? together : pleased || together || only || (read.length === 1 && (read[0]!.marked || read[0]!.own));
    if (!marked) return null;
  }

  // ── what the names mean ────────────────────────────────────────
  const surfaces = new Set<SurfaceType>();
  let wantLens: LensId | undefined;
  let plainMap = false;
  let named = 0;
  let three = false;
  let both = false;
  let all = false;
  let pronoun = false;
  for (const tk of tokens) {
    switch (tk.kind) {
      case 'surface':
        if (tk.surface === 'map') {
          // the map, and the map in a lens, are one panel asked to be two things
          if (tk.lens ? plainMap : wantLens) return null;
          if (!tk.lens) plainMap = true;
        }
        surfaces.add(tk.surface);
        if (tk.lens) wantLens = tk.lens;
        named++;
        break;
      case '3dmodel':
        if (close) {
          surfaces.add('model');
          surfaces.add('scene');
        } else surfaces.add(ctx.hasScene === false && ctx.hasModel !== false ? 'model' : 'scene');
        named++;
        break;
      case 'in3d':
        surfaces.add('scene');
        named++;
        break;
      case 'both':
        both = true;
        break;
      case 'all':
        all = true;
        three = three || tk.three;
        break;
      case 'pronoun':
        pronoun = true;
        break;
    }
  }
  let everything = false;
  if (all) {
    // "close everything": back to the map, where Logos 3 rests; the conversation keeps its place
    if (close) {
      ['model', 'scene', 'params', 'inspector', 'trace', 'mind'].forEach((s) => surfaces.add(s as SurfaceType));
      everything = true;
    } else {
      if (three || ctx.hasMap !== false) surfaces.add('map');
      if (three || ctx.hasModel !== false) surfaces.add('model');
      if (three || ctx.hasScene) surfaces.add('scene');
    }
  } else if (both || (pronoun && together)) {
    if (close) return null; // "close both" — of what is open, which the reader cannot see
    if (named === 0) {
      const pair = partnerOf(null, ctx);
      if (!pair) return null;
      pair.forEach((s) => surfaces.add(s));
    } else if (named === 1) {
      // "put it beside the map": "it" is the other one there is
      const one = [...surfaces][0];
      const pair = STAGE.has(one) ? partnerOf(one, ctx) : null;
      if (!pair) return null;
      pair.forEach((s) => surfaces.add(s));
    }
  } else if (pronoun) {
    return null; // "show it", "close that": nothing named
  } else if (together && !close && named === 1) {
    // "the model side by side" — with the other one there is
    const one = [...surfaces][0];
    const pair = STAGE.has(one) ? partnerOf(one, ctx) : null;
    if (!pair) return null;
    pair.forEach((s) => surfaces.add(s));
  }
  if (!surfaces.size) return null;
  const list = ordered(surfaces);
  const stage = list.filter((s) => STAGE.has(s)).length;
  if (verb === 'place' && !close && list.length < 2) return null;

  let op: InterfaceOp;
  if (close) op = 'close';
  else if (only || verb === 'only' || verb === 'make') op = 'only';
  else if (stage >= 3) op = 'all';
  else if (stage === 2) op = 'pair';
  else op = 'open';

  const req: InterfaceRequest = { op, surfaces: list, called: everything ? 'everything' : segs.join(' and ').trim() };
  if (wantLens) req.lens = wantLens;
  if (op !== 'close') {
    const missing = list.filter(
      (s) => ((s === 'model' || s === 'params' || s === 'trace') && ctx.hasModel === false) || (s === 'scene' && ctx.hasScene === false)
    );
    if (missing.length) req.missing = missing;
  }
  return req;
}

/**
 * Which of the map, the model and the 3D view a sentence names — not a
 * request, only a mention. "Side by side" in a long message means the
 * surfaces it names, and the arrangement suggested follows them
 * (surfaces.ts suggestLayout).
 */
export function surfacesNamed(text: unknown): SurfaceType[] {
  if (typeof text !== 'string') return [];
  let t = ` ${clean(text)} `;
  const out = new Set<SurfaceType>();
  const threeD = new RegExp(`[^a-z0-9](?:live )?${THREE_D}(?: models?| views?| scenes?)?[^a-z0-9]|\\bcad\\b|\\bstudio\\b|\\bscene\\b`);
  if (threeD.test(t)) out.add('scene');
  // a 3D model is the 3D view of it; the word "model" in it is not a second surface
  t = t.replace(new RegExp(`${THREE_D} models?`, 'g'), ' ');
  if (/\b(?:thinking |mind |concept )?map\b/.test(t)) out.add('map');
  if (/\bmodel(?:s|ing|ling)?\b/.test(t)) out.add('model');
  return ordered(out);
}

// ── what Socria says ─────────────────────────────────────────────

const NAME: Record<SurfaceType, string> = {
  map: 'the map',
  model: 'the model',
  scene: 'the 3D view',
  params: 'the parameters',
  inspector: 'the inspector',
  trace: 'the trace',
  mind: 'the Mind view',
  chat: 'the conversation',
};

const listed = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

/** What Socria says when it changes the workspace, in place of a reply. One line, plain. */
export function interfaceSaid(req: InterfaceRequest): string {
  // a lens asked for by name says what it always said
  if (req.lens && req.op !== 'close' && req.surfaces.length === 1 && req.surfaces[0] === 'map') return viewSaid(req.lens);
  if (req.op === 'close') {
    if (req.called === 'everything') return 'Closed everything but the map.';
    if (req.lens === 'plot' && req.surfaces.length === 1) return 'Closed the plot.';
    return `Closed ${listed(req.surfaces.map((s) => NAME[s]))}.`;
  }
  const missing = new Set(req.missing ?? []);
  const shown = req.surfaces.filter((s) => !missing.has(s));
  const parts: string[] = [];
  if (shown.length === 1) {
    const s = shown[0];
    const own = req.op === 'only' ? ', on its own' : '';
    parts.push(s === 'scene' ? `Here it is in 3D${own}.` : `Here ${s === 'params' ? 'are' : 'is'} ${NAME[s]}${own}.`);
  } else if (shown.length > 1) {
    const how = req.op === 'pair' ? ', side by side' : req.op === 'all' ? ', together' : req.op === 'only' ? ', on their own' : '';
    parts.push(`Here are ${listed(shown.map((s) => NAME[s]))}${how}.`);
  }
  if (missing.has('model') || missing.has('params') || missing.has('trace')) {
    parts.push(shown.length ? 'There is no model yet — ask for one and it appears beside it.' : 'There is no model in this line of thinking yet — ask for one and it appears here.');
  }
  if (missing.has('scene')) parts.push('Nothing is in 3D yet — describe a shape and it is drawn there.');
  return parts.join(' ') || 'Here it is.';
}
