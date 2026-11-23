// lib/ux-v0/graphics/creative/interpret.ts — creative words read into a plan when the model cannot be asked.
//
// "Keep the composition, make the typography more editorial, replace the clouds with abstract organic forms, and make
// the overall aesthetic more sophisticated." is four instructions: one thing kept, three decisions changed. The words
// are split into clauses and each is read for what it is about (the colour, the type, the forms, the ground, the
// composition, the depth, the words, one object, the concept as a whole) and what it asks (keep, replace, remove, add,
// more or less of a quality, a theme, a decision turned down, a concept saved, compared or combined). What one object
// should do goes to the precise reader (edit.ts). Only when the words could mean genuinely different things — "change
// the overall aesthetic", with no direction — is one question asked, its answers ready to say. Deterministic: the
// model, when it can be reached, writes the same kind of plan (plan.ts) with more understanding.

import type { GraphicDoc } from '../doc';
import { readGraphicEdit } from '../edit';
import { readCreativeEdit } from '../generative/edits';
import type { FormKind } from './forms';
import { characterIn, qualitiesIn, QUALITIES, themeIn, type PaletteShift, type TypeCharacter } from './lexicon';
import { boardOf, creativeFormIds, readDecisions, type DecisionKey } from './decisions';
import type { Change, CreativePlan, Intent, Keepable, PlanQuestion } from './plan';
import { readIdentity } from './identity';
import { improveAimOf, improvementPlan } from './improve';

export interface ReadContext {
  doc: GraphicDoc;
  board?: string;
  /** saved concepts, for "the typography of concept 2" and "go back to the first concept" */
  concepts?: readonly { id: string; name: string }[];
  /** the question asked last: a short answer is read against its options */
  asked?: PlanQuestion | null;
}

const lower = (s: string) => s.toLowerCase().replace(/[’']/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();

// ── what a clause is about ──

const ABOUT: readonly [RegExp, Keepable][] = [
  [/\b(typography|type|typeface|typefaces|fonts?|lettering|letterforms|headline font|faces?)\b/, 'type'],
  [/\b(colou?rs?|palette|tones?|hues?|colou?r scheme|scheme)\b/, 'palette'],
  [/\b(composition|layout|arrangement|structure|placement|positions?)\b/, 'composition'],
  [/\b(clouds?|forms?|shapes?|motifs?|decorations?|ornaments?|graphics|elements|illustrations?|waves?|leaves|stars|sparkles|orbs?|circles|blobs|petals|flowers|flames|snowflakes|drops|rings|lines|ridges|mountains|blocks)\b/, 'forms'],
  [/\b(background|ground|backdrop|sky)\b/, 'background'],
  [/\b(depth|shadows?)\b/, 'depth'],
  [/\b(words|copy|text|headline|title|wording)\b/, 'words'],
  [/\b(logo|wordmark|brand ?mark)\b/, 'logo'],
  [/\b(pictures?|photos?|images?|photography)\b/, 'pictures'],
];
const aboutOf = (c: string): Keepable[] => ABOUT.filter(([re]) => re.test(c)).map(([, k]) => k);

const FORM_WORDS: readonly [RegExp, FormKind][] = [
  [/\bclouds?|cumulus|cloudy\b/, 'cloud'],
  [/\b(organic|blobs?|fluid|amorphous|soft) ?(forms?|shapes?|masses)?\b/, 'organic'],
  [/\bwaves?\b/, 'wave'],
  [/\bleaves|leaf|foliage\b/, 'leaf'],
  [/\b(orbs?|spheres?|planets?|circles|discs?|dots)\b/, 'orb'],
  [/\b(sparkles?|stars|glints?)\b/, 'sparkle'],
  [/\b(fine )?lines|rules|stripes\b/, 'line'],
  [/\bgrids?\b/, 'grid'],
  [/\b(mountains?|ridges?|hills|peaks)\b/, 'mountain'],
  [/\b(blocks|buildings?|skyline|rectangles)\b/, 'block'],
  [/\brings?|halos?\b/, 'ring'],
  [/\b(petals?|flowers?|blossoms?)\b/, 'petal'],
  [/\bflames?|fire\b/, 'flame'],
  [/\bsnow(flakes?)?\b/, 'snow'],
  [/\b(drops?|droplets?|bubbles?|raindrops?)\b/, 'drop'],
  [/\b(sun|suns)\b/, 'sun'],
  [/\bgeometric (forms?|shapes?)\b/, 'ring'],
];
/** A colour's hue, 0–360 (grey reads as 0). */
const hueOf = (hex: string): number => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn || Number.isNaN(mx)) return 0;
  const d = mx - mn;
  const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
};
const formIn = (s: string): FormKind | null => FORM_WORDS.find(([re]) => re.test(s))?.[1] ?? null;
const abstractionIn = (s: string): number | undefined =>
  /\b(very|highly|completely|fully) abstract|\bgeometric\b/.test(s) ? 92 : /\babstract(ed)?\b/.test(s) ? 80 : /\b(stylised|stylized|graphic|simplified|simple)\b/.test(s) ? 55 : /\b(realistic|literal|lifelike|natural-looking|detailed)\b/.test(s) ? 12 : undefined;

const SHIFT_WORDS: readonly [RegExp, PaletteShift][] = [
  [/\bwarm(er)?\b/, 'warmer'],
  [/\bcool(er)?\b|\bcolder\b/, 'cooler'],
  [/\bdark(er)?\b|\bdeeper\b|\bmoodier\b/, 'darker'],
  [/\blight(er)?\b|\bbright(er)?\b|\bpaler\b/, 'lighter'],
  [/\bmuted\b|\bdesaturat\w*|\bsubtler\b|\btoned down\b/, 'muted'],
  [/\bvivid\b|\bsaturated\b|\bpunch(y|ier)\b|\bmore colou?rful\b|\bbolder colou?rs?\b/, 'vivid'],
  [/\bcontrast\b/, 'contrast'],
  [/\bmonochrom\w*|\bblack and white\b|\bgreyscale|\bgrayscale\b/, 'monochrome'],
  [/\bpastel\b/, 'pastel'],
  [/\bneon\b|\bluminous\b|\belectric\b/, 'neon'],
  [/\bearthy\b|\bearth tones?\b/, 'earthy'],
  [/\bvintage\b|\bfaded\b|\bretro colou?rs?\b/, 'vintage'],
  [/\b(gold|golden|metallic|silver)\b/, 'metallic'],
  [/\bricher\b|\bdeep(er)? colou?rs?\b/, 'richer'],
];
export const shiftsIn = (s: string): PaletteShift[] => [...new Set(SHIFT_WORDS.filter(([re]) => re.test(s)).map(([, k]) => k))];

const NAMED: Record<string, string> = { red: '#d6402b', orange: '#e8772e', yellow: '#f2c230', green: '#3f8f4f', teal: '#1f8a8a', turquoise: '#1fb3aa', blue: '#2f6bd6', navy: '#1c2c5b', purple: '#6b4fbb', violet: '#7b4fd6', pink: '#e05a8c', magenta: '#d62f8f', black: '#141414', white: '#ffffff', gold: '#c9a86a', silver: '#b8bcc2', brown: '#7a4b2a', grey: '#8a8a86', gray: '#8a8a86', cream: '#f3ead8', coral: '#ff7a59', lilac: '#b7a3e0', mint: '#9fdcc0', burgundy: '#7a1f33', olive: '#7a7a2f', sky: '#8fc3f2' };
const namedIn = (s: string) => Object.keys(NAMED).find((k) => new RegExp(`\\b${k}\\b`).test(s));
const hexesIn = (s: string) => [...s.matchAll(/#[0-9a-f]{6}\b/g)].map((m) => m[0]);

// "less X" and "too X" ask for the opposite quality
const OPPOSITE: Record<string, string> = { sophisticated: 'playful', futuristic: 'classic', dramatic: 'calm', expressive: 'minimal', playful: 'sophisticated', minimal: 'expressive', calm: 'expressive', corporate: 'playful', dark: 'light', light: 'dark', colourful: 'muted', muted: 'colourful', premium: 'raw', retro: 'modern', raw: 'sophisticated', alive: 'calm', editorial: 'modern', warm: 'cool', cool: 'warm', classic: 'modern', modern: 'classic', depth: 'minimal' };
const TOO_FLAT = /\b(plain|boring|dull|bland|flat|lifeless|static|safe|basic|empty)\b/;
const TOO_BUSY = /\b(busy|cluttered|much|crowded|noisy|loud|chaotic|messy)\b/;

function qualitiesOf(c: string): string[] {
  const out: string[] = [];
  const less = c.match(/\bless ([a-z-]+)/);
  const too = c.match(/\btoo ([a-z-]+)/);
  if (too && /\bgeneric|predictable|samey|template|safe|obvious|ordinary|common|cliche|clichéd\b/.test(too[1])) out.push('original');
  else if (too && TOO_FLAT.test(too[1])) out.push('expressive');
  else if (too && TOO_BUSY.test(too[1])) out.push('minimal');
  for (const q of qualitiesIn(c)) {
    const negated = (less && q.words.test(less[1])) || (too && q.words.test(too[1]));
    const id = negated ? OPPOSITE[q.id] : q.id;
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** Words that name one object of the design (what is said about it goes to the precise reader). */
const OBJECT_WORDS = /\b(headline|title|heading|subhead|subtitle|strapline|tagline|logo|wordmark|button|cta|call to action|picture|photo|image|date|price|caption|body text|paragraph|chart|graph|icon|badge|sticker|the circle|the square|the line|this shape|that shape|selected|selection)\b/;

const KEEP = /^(please )?(keep|preserve|leave|maintain|retain|stick with|hold|don'?t (change|touch)|do not (change|touch)|without changing|but keep|keep it)\b/;
const LIKE = /\b(i )?(like|love|liked|loved) (the|this|its|it'?s)?\s*([a-z ]+)/;

export interface ReadResult {
  plan: CreativePlan;
  /** clauses nothing could be made of (said back, never guessed at) */
  unread: string[];
  /** the words were read whole and plainly (one clear instruction, nothing left over, nothing to ask): a model would
   * write the same plan, so it need not be asked */
  certain: boolean;
}

/** The plan the words ask for, or null when they ask for nothing creative (the editor's own commands, empty words). */
export function readCreative(words0: string, ctx: ReadContext): ReadResult | null {
  const words = lower(words0);
  if (!words || words.length > 600) return null;

  // a short answer to the question asked last
  if (ctx.asked?.options.length) {
    const picked = answerOf(words, ctx.asked);
    if (picked) return readCreative(picked, { ...ctx, asked: null });
  }

  const concept = conceptMove(words, ctx);
  if (concept) return { plan: concept, unread: [], certain: true };

  // a vague improvement ("make it more interesting", "it feels flat"): the design in front is measured for what holds it
  // back, and the strongest moves planned with their reasons (a question only when nothing measures weak)
  const aim = improveAimOf(words);
  if (aim) {
    const { plan } = improvementPlan(ctx.doc, ctx.board, words0, aim);
    return { plan, unread: [], certain: !plan.question };
  }
  // an identity ("turn this into a premium architectural studio identity"): a visual language generated from the words
  const identity = readIdentity(words0, { doc: ctx.doc, board: ctx.board });
  if (identity) return { plan: identity.plan, unread: [], certain: false };

  // genuinely open: a change with no direction at all
  if (/^(change|redo|redesign|update|switch up|refresh|rework|transform)( the| its)?( (overall|whole|entire|general))? (aesthetic|style|look|vibe|feel|design|it|this)( completely)?$/.test(words) || /^(make it|can you make it) (better|nicer|look better|more interesting|look good|work)$/.test(words) || /^(something else|try again|change it|do something)$/.test(words)) {
    return {
      plan: {
        intent: 'style',
        summary: 'a new direction for the aesthetic',
        keep: [],
        changes: [],
        question: {
          text: 'Which way should it go?',
          options: [
            { label: 'Quieter and more refined', words: 'make it more sophisticated' },
            { label: 'Bolder and more expressive', words: 'make it more expressive and alive' },
            { label: 'Darker and more dramatic', words: 'make it more dramatic' },
            { label: 'Something completely different', words: 'this feels too generic, try something more original' },
          ],
        },
        by: 'reader',
      },
      unread: [],
      certain: false,
    };
  }

  const clauses = words
    .split(/\s*(?:[,;]|\.\s+|\.$|\bbut\b|\balso\b|\bplus\b|\band then\b|\bthen\b|\band (?=(?:make|keep|replace|change|add|remove|use|turn|give|set|put|try|swap|take|bring|leave|preserve|lose|drop|get rid)\b))\s*/)
    .map((x) => x.trim())
    .filter((x) => x.length > 1);

  const keep = new Set<Keepable>();
  const changes: Change[] = [];
  const unread: string[] = [];
  const said: string[] = [];
  const intents = new Set<Intent>();
  const add = (c: Change, what: string, intent: Intent) => {
    changes.push(c);
    said.push(what);
    intents.add(intent);
  };
  const doc = ctx.doc;
  const board = boardOf(doc, ctx.board);
  const hasCreativeForms = creativeFormIds(doc, board).length > 0;

  for (const c of clauses) {
    // ── kept ──
    if (KEEP.test(c) || /\b(as it is|unchanged|the same|intact|untouched)\b/.test(c) && !/\b(make|change|replace|add|remove)\b/.test(c)) {
      // the visual language, the look: every decision of the look, the arrangement free to change
      if (/\b(visual language|look( and feel)?|aesthetic|vibe|visual identity)\b/.test(c) && !aboutOf(c).length) {
        (['palette', 'type', 'forms', 'background', 'depth'] as Keepable[]).forEach((k) => keep.add(k));
        said.push('keeping the visual language');
        continue;
      }
      const what = aboutOf(c);
      if (/\b(everything else|the rest|all else)\b/.test(c) && !what.length) continue;
      (what.length ? what : (['composition'] as Keepable[])).forEach((k) => keep.add(k));
      said.push(`keeping ${what.length ? what.map((k) => (k === 'type' ? 'the typography' : k === 'palette' ? 'the colours' : `the ${k}`)).join(' and ') : 'the composition'}`);
      continue;
    }
    // ── a decision turned down ──
    const rev = c.match(/\b(undo|revert|reject|go back on|put back|bring back|restore|don'?t like|do not like|hate|lose) (just |only )?(the )?(new |previous |old |last )?(typography|type|fonts?|colou?rs?|palette|forms?|shapes|clouds|background|ground|composition|layout|depth|mood)( change| decision)?/);
    if (rev) {
      const k = rev[5];
      const target: DecisionKey = /typ|font/.test(k) ? 'type' : /colou?r|palette/.test(k) ? 'palette' : /form|shape|cloud/.test(k) ? 'forms' : /background|ground/.test(k) ? 'background' : /compos|layout/.test(k) ? 'composition' : /depth/.test(k) ? 'depth' : 'mood';
      add({ decision: 'revert', target }, `the ${k} put back as it was`, 'global');
      continue;
    }

    const like = c.match(LIKE);
    if (like && !/\b(don'?t|do not|didn'?t|not|never|no longer)\s+(really\s+)?(like|love)\b/.test(c) && !/\b(make|change|replace|add|remove|more|less)\b/.test(c)) {
      const what = aboutOf(like[4]);
      if (/\b(direction|concept|idea|it|this|design)\b/.test(like[4]) && !what.length) ['composition', 'forms'].forEach((k) => keep.add(k as Keepable));
      else what.forEach((k) => keep.add(k));
      said.push('keeping what you like');
      continue;
    }

    // ── the words themselves, only as written ──
    const content = c.match(/\b(?:change|make|set|rename|update)\s+(?:the )?(headline|title|subtitle|subhead|tagline|strapline|date|cta|button|body)\s+(?:to|say|read|into|as)\s+"([^"]{1,200})"/);
    if (content) {
      const role = /sub|strap|tag/.test(content[1]) ? 'subhead' : /date/.test(content[1]) ? 'meta' : /cta|button/.test(content[1]) ? 'cta' : /body/.test(content[1]) ? 'body' : 'headline';
      add({ decision: 'content', role: role as never, text: words0.match(/["“]([^"”]{1,200})["”]/)?.[1] ?? content[2] }, `the ${content[1]} changed as you wrote it`, 'content');
      continue;
    }

    // ── replace X with Y ──
    const rep = c.match(/\b(?:replace|swap|exchange|substitute|change|turn) (?:the |all the |these |those )?(.+?) (?:with|for|into|to) (?:an? |some |more )?(.+)$/);
    if (rep) {
      const [, what, to] = rep;
      const theme = themeIn(to);
      if (/\b(background|ground|backdrop|sky)\b/.test(what)) {
        const t = themeIn(to);
        const named = namedIn(to);
        add({ decision: 'background', kind: /\bgradient|graded|fade\b/.test(to) ? 'gradient' : /\btexture|grain|paper\b/.test(to) ? 'texture' : t ? 'gradient' : 'flat', ...(named ? { colours: [NAMED[named]] } : hexesIn(to).length ? { colours: hexesIn(to) } : {}), ...(t ? { tone: 'theme' } : {}) }, `the ground changed to ${to}`, 'global');
        if (t) changes.push({ decision: 'theme', theme: t.id });
        continue;
      }
      if (/\b(typography|type|fonts?|typeface)\b/.test(what)) {
        const ch = characterIn(to);
        if (ch) {
          add({ decision: 'type', character: ch }, `the typography made ${ch}`, 'typography');
          continue;
        }
      }
      if (/\b(colou?rs?|palette)\b/.test(what)) {
        const sh = shiftsIn(to);
        const hx = hexesIn(to);
        const named = namedIn(to);
        if (sh.length || hx.length || named || theme) {
          add({ decision: 'palette', ...(sh.length ? { shifts: sh } : {}), ...(hx.length ? { colours: { accent: hx[0], ...(hx[1] ? { ground: hx[1] } : {}) } } : named ? { colours: { accent: NAMED[named] } } : {}) }, `the colours made ${to}`, 'global');
          if (theme && !sh.length && !hx.length && !named) changes.push({ decision: 'theme', theme: theme.id });
          continue;
        }
      }
      const kind = formIn(to) ?? (theme ? theme.forms : null);
      if (kind && (aboutOf(what).includes('forms') || formIn(what))) {
        add({ decision: 'forms', kind, ...(abstractionIn(to) !== undefined ? { abstraction: abstractionIn(to) } : {}) }, `${what} replaced with ${to}`, 'global');
        continue;
      }
    }

    // ── take out ──
    const rem = c.match(/\b(?:remove|delete|get rid of|lose|drop|take out|take away|no more|without) (?:the |all the |any )?(.+)$/);
    if (rem && !/\b(colou?r|contrast)\b/.test(rem[1])) {
      if (/\b(gradient|background|ground|texture|grain)\b/.test(rem[1])) {
        add({ decision: 'background', kind: 'flat' }, 'a flat ground', 'global');
        continue;
      }
      if (/\b(shadows?|depth)\b/.test(rem[1])) {
        add({ decision: 'depth', level: 0 }, 'no shadows or depth', 'global');
        continue;
      }
      if (formIn(rem[1]) || aboutOf(rem[1]).includes('forms')) {
        add({ decision: 'forms', remove: true }, `the ${rem[1]} taken out`, 'global');
        continue;
      }
    }

    // ── add ──
    const addm = c.match(/\badd (?:some |a few |a |an |more |a bit of |a little |plenty of )?(.+)$/);
    if (addm) {
      const what = addm[1];
      if (/\b(depth|dimension|shadows?|layers?)\b/.test(what)) {
        add({ decision: 'depth', delta: /\b(lots|a lot|much|plenty)\b/.test(c) ? 2 : 1 }, 'more depth', 'global');
        continue;
      }
      if (/\b(texture|grain|noise)\b/.test(what)) {
        add({ decision: 'background', kind: 'texture' }, 'a textured ground', 'global');
        continue;
      }
      if (/\bgradient\b/.test(what)) {
        add({ decision: 'background', kind: 'gradient' }, 'a graded ground', 'global');
        continue;
      }
      const kind = formIn(what);
      if (kind) {
        const theme = themeIn(what);
        if (theme && theme.forms === kind && !hasCreativeForms) add({ decision: 'theme', theme: theme.id }, `${theme.label}`, 'theme');
        else add({ decision: 'forms', kind, count: /\bmore|lots|many\b/.test(c) ? 0.5 : 0, ...(abstractionIn(what) !== undefined ? { abstraction: abstractionIn(what) } : {}) }, `${what} added`, 'global');
        continue;
      }
    }

    // ── the forms there, changed ──
    const formsTalk = formIn(c) || /\b(forms?|shapes?|motifs?)\b/.test(c);
    if (formsTalk && !themeIn(c.replace(/\b(the )?clouds?\b/, '')) && /\b(more|less|abstract|realistic|literal|simpler|softer|stylised|stylized|geometric|bigger|larger|smaller|fewer|subtler|bolder|denser|sparser)\b/.test(c) && !/\b(theme|themed|inspired|identity)\b/.test(c)) {
      const ch: Extract<Change, { decision: 'forms' }> = { decision: 'forms' };
      if (/\bmore abstract|\babstract\b|\bsimpler\b|\bgeometric\b|\bstylis|\bstyliz/.test(c) && !/\bless abstract\b/.test(c)) ch.delta = /\bmuch|completely|very\b/.test(c) ? 55 : 35;
      if (/\bless abstract|\bmore (realistic|literal|detailed)\b|\brealistic\b/.test(c)) ch.delta = -35;
      if (/\b(bigger|larger)\b/.test(c)) ch.scale = 0.35;
      if (/\bsmaller|subtler\b/.test(c)) ch.scale = -0.3;
      if (/\bfewer|less of them|sparser\b/.test(c)) ch.count = -0.4;
      if (/\bmore (of them|clouds|forms|shapes)\b|\bdenser\b/.test(c)) ch.count = 0.5;
      if (/\bsofter\b/.test(c)) ch.delta = (ch.delta ?? 0) + 15;
      if (Object.keys(ch).length > 1) {
        if (!hasCreativeForms && formIn(c) && formIn(c) !== 'organic') ch.kind = formIn(c)!;
        add(ch, `the forms ${ch.delta && ch.delta > 0 ? 'more abstract' : ch.delta && ch.delta < 0 ? 'more literal' : ch.scale && ch.scale > 0 ? 'larger' : ch.scale ? 'smaller' : ch.count && ch.count < 0 ? 'fewer' : 'more of them'}`, 'global');
        continue;
      }
    }

    // ── a theme ──
    const theme = themeIn(c);
    if (theme && (/\b(theme|themed|inspired|feel|vibe|look|identity|style|world|mood|aesthetic|motif|atmosphere|make it|make this|give it|turn it|turn this|into|like|about)\b/.test(c) || c.split(' ').length <= 3)) {
      add({ decision: 'theme', theme: theme.id, ...(abstractionIn(c) !== undefined ? { abstraction: abstractionIn(c) } : {}), ...(/\b(night|dark|darker)\b/.test(c) ? { mode: 'dark' as const } : /\b(light|bright|daytime|day)\b/.test(c) ? { mode: 'light' as const } : {}) }, `${theme.label}: ${theme.says}`, /\b(identity|brand)\b/.test(c) ? 'brand' : 'theme');
      continue;
    }

    // ── typography ──
    if (aboutOf(c).includes('type') && !/\b(colou?r)\b/.test(c)) {
      const ch: Extract<Change, { decision: 'type' }> = { decision: 'type' };
      const q = qualitiesOf(c)[0];
      const character = characterIn(c) ?? (q ? (QUALITIES.find((x) => x.id === q)?.type as TypeCharacter | undefined) : undefined);
      if (character) ch.character = character;
      if (/\b(heavier|bolder|thicker|stronger)\b/.test(c)) ch.weight = 'heavier';
      if (/\b(lighter|thinner|finer|more delicate)\b/.test(c)) ch.weight = 'lighter';
      if (/\b(capitals|caps|uppercase|all caps)\b/.test(c)) ch.case = 'upper';
      if (/\b(lowercase|sentence case|no caps|no capitals)\b/.test(c)) ch.case = 'none';
      if (Object.keys(ch).length > 1) {
        add(ch, `the typography ${ch.character ? `made ${ch.character}` : ch.weight ?? ''}`.trim(), 'typography');
        continue;
      }
    }

    // ── colour ──
    if (aboutOf(c).includes('palette') || (shiftsIn(c).length && /\b(make it|make this|turn it|go)\b/.test(c) && !aboutOf(c).length)) {
      const sh = shiftsIn(c);
      const hx = hexesIn(c);
      const named = namedIn(c);
      const q = qualitiesOf(c).flatMap((id) => QUALITIES.find((x) => x.id === id)?.palette ?? []);
      const shifts = [...new Set([...sh, ...q])];
      if (shifts.length || hx.length || named) {
        const accentOnly = /\baccent\b/.test(c);
        add({ decision: 'palette', ...(shifts.length ? { shifts } : {}), ...(hx.length ? { colours: accentOnly || hx.length === 1 ? { accent: hx[0] } : { ground: hx[0], accent: hx[1] } } : named ? { colours: /\b(background|ground)\b/.test(c) ? { ground: NAMED[named] } : { accent: NAMED[named] } } : {}) }, `the colours ${shifts.join(', ') || 'changed'}`, 'global');
        continue;
      }
    }

    // ── the ground ──
    if (aboutOf(c).includes('background')) {
      const t = themeIn(c.replace(/\bbackground\b/, ''));
      const named = namedIn(c);
      const tone = /\bdark(er)?\b/.test(c) ? 'darker' : /\blight(er)?|bright(er)?\b/.test(c) ? 'lighter' : t ? 'theme' : undefined;
      add({ decision: 'background', ...(/\bgradient|graded|fade\b/.test(c) ? { kind: 'gradient' as const } : /\btexture|grain|paper\b/.test(c) ? { kind: 'texture' as const } : /\bflat|plain|solid\b/.test(c) ? { kind: 'flat' as const } : {}), ...(named ? { colours: [NAMED[named]] } : hexesIn(c).length ? { colours: hexesIn(c) } : {}), ...(tone ? { tone: tone as 'darker' | 'lighter' | 'theme' } : {}) }, 'the ground changed', 'global');
      if (t) changes.push({ decision: 'theme', theme: t.id });
      continue;
    }

    // ── the whole redesigned around what is kept ("keep the type and logo, but completely redesign the rest") ──
    if (/\b(re-?design|rework|redo|reinvent|re-?imagine|overhaul|rebuild|reconceive)\b/.test(c) && /\b(the rest|everything else|all else|everything|the whole( thing| design)?|it all|it|this|completely|entirely|totally|from scratch)\b/.test(c) && !aboutOf(c.replace(/\b(the rest|everything else|all else)\b/g, '')).some((k) => k !== 'composition')) {
      const bold = /\b(completely|entirely|totally|radically|from scratch)\b/.test(c);
      const d = readDecisions(doc, board.id);
      // a new palette that moves away from the one there: the other mode, the other temperature
      const hue = hueOf(d.palette.accent);
      const shifts: PaletteShift[] = [d.palette.mode === 'dark' ? 'lighter' : 'darker', hue < 75 || hue > 300 ? 'cooler' : 'warmer', ...(bold ? (['richer'] as PaletteShift[]) : [])];
      add({ decision: 'composition', action: bold ? 'unexpected' : 'rethink' }, 'a new composition', 'redesign');
      changes.push({ decision: 'palette', shifts }, { decision: 'background', kind: d.background.kind === 'flat' ? 'gradient' : 'flat' });
      if (bold) changes.push({ decision: 'mood', qualities: ['original'] });
      said.push(`a new palette (${shifts.join(', ')}) and ground`);
      continue;
    }

    // ── the composition ──
    if (aboutOf(c).includes('composition') || /\b(rethink|re-?think|re-?imagine|rearrange|re-?compose|start over|from scratch)\b/.test(c)) {
      const action = /\b(unexpected|surprising|unusual|original|experimental|daring|radical)\b/.test(c) ? 'unexpected' : /\b(more (space|room|air)|airier|breath|spacious|open it up|negative space)\b/.test(c) ? 'airy' : /\b(fuller|denser|tighter|more compact|fill)\b/.test(c) ? 'denser' : /\b(asymmetric\w*|off-?centre|off-?center|dynamic|diagonal)\b/.test(c) ? 'asymmetric' : /\b(centre|center|centred|centered|symmetrical)\b/.test(c) ? 'centred' : 'rethink';
      add({ decision: 'composition', action }, action === 'rethink' ? 'the composition rethought' : `the composition ${action}`, 'composition');
      continue;
    }
    if (/\b(more (space|room|air|breathing room)|negative space|airier|spacious)\b/.test(c)) {
      add({ decision: 'composition', action: 'airy' }, 'more space', 'composition');
      continue;
    }

    // ── depth ──
    if (/\b(depth|dimension\w*|3d|three-?dimensional|layered|deeper|flatter|flat design)\b/.test(c)) {
      const flat = /\b(flatter|flat design|less depth|no depth|completely flat)\b/.test(c);
      add({ decision: 'depth', ...(flat ? (/\bcompletely|no depth|flat design\b/.test(c) ? { level: 0 } : { delta: -1 }) : { delta: /\b(much|a lot|lots|far|way)\b/.test(c) ? 2 : 1 }) }, flat ? 'flatter' : 'more depth', 'global');
      continue;
    }

    // ── qualities of the whole ("make it more editorial"), unless one object is named ("make the headline bolder") ──
    const qsWhole = qualitiesOf(c);
    if (qsWhole.length && !OBJECT_WORDS.test(c)) {
      add({ decision: 'mood', qualities: qsWhole }, qsWhole.map((q) => QUALITIES.find((x) => x.id === q)?.says ?? q).join('; '), qsWhole.includes('original') ? 'redesign' : /\b(brand|identity)\b/.test(c) ? 'brand' : 'style');
      continue;
    }

    // ── what one object should do: the precise reader ──
    const precise = readGraphicEdit(c, doc, { artboard: board.id, selection: [] });
    const creativeEdit = readCreativeEdit(c);
    if (precise || creativeEdit) {
      add({ decision: 'object', words: c }, precise?.label ?? creativeEdit?.label ?? c, creativeEdit ? 'composition' : 'object');
      continue;
    }

    // ── qualities of the whole ──
    const qs = qualitiesOf(c);
    if (qs.length) {
      add({ decision: 'mood', qualities: qs }, qs.map((q) => QUALITIES.find((x) => x.id === q)?.says ?? q).join('; '), qs.includes('original') ? 'redesign' : /\b(brand|identity)\b/.test(c) ? 'brand' : 'style');
      continue;
    }

    // a theme named alone ("clouds", "the ocean")
    const lone = themeIn(c);
    if (lone) {
      add({ decision: 'theme', theme: lone.id }, `${lone.label}: ${lone.says}`, 'theme');
      continue;
    }
    if (/^(please|thanks|thank you|ok|okay|great|nice|cool|hmm+|i want|i'd like|i would like|can you|could you)$/.test(c)) continue;
    unread.push(c);
  }

  if (!changes.length) {
    if (!unread.length && !keep.size) return null;
    // nothing to act on: one question, with ways to answer that would work
    if (!keep.size) {
      return {
        plan: {
          intent: 'style',
          summary: 'a direction to take',
          keep: [],
          changes: [],
          question: {
            text: `I want to get “${words0.trim().slice(0, 80)}” right — which is closest to what you mean?`,
            options: [
              { label: 'A theme (clouds, the ocean, space…)', words: 'give it a theme' },
              { label: 'More refined', words: 'make it more sophisticated' },
              { label: 'Bolder and more alive', words: 'make it more expressive and alive' },
              { label: 'A completely new idea', words: 'this feels too generic, try something more original' },
            ],
          },
          by: 'reader',
        },
        unread,
        certain: false,
      };
    }
    return { plan: { intent: 'global', summary: [...said].join('; '), keep: [...keep], changes: [], by: 'reader' }, unread, certain: false };
  }

  // the qualities said across clauses, as one change (said twice is said once)
  const moods = changes.filter((ch): ch is Extract<Change, { decision: 'mood' }> => ch.decision === 'mood');
  if (moods.length > 1) {
    const merged: Change = { decision: 'mood', qualities: [...new Set(moods.flatMap((m) => m.qualities))] };
    const at = changes.indexOf(moods[0]);
    for (const m of moods) changes.splice(changes.indexOf(m), 1);
    changes.splice(at, 0, merged);
  }
  const intent: Intent = intents.has('redesign') || (intents.has('composition') && intents.size > 2) ? 'redesign' : intents.has('brand') ? 'brand' : intents.has('theme') ? 'theme' : intents.size === 1 ? [...intents][0] : 'global';
  const keepList = [...keep];
  // kept decisions are not changed, even by a theme or a quality said in the same breath
  const kept = new Set<string>(keepList);
  const finalChanges = changes.filter((ch) => !kept.has(ch.decision === 'theme' ? 'forms' : ch.decision === 'mood' || ch.decision === 'object' || ch.decision === 'revert' || ch.decision === 'content' ? '' : ch.decision));
  const summary = said.join('; ').replace(/^./, (x) => x.toUpperCase());
  // plainly read: one instruction (a "keep" beside it is fine), every clause understood, nothing said about one object
  // that the precise reader would have to interpret
  const certain = !unread.length && clauses.length - keepList.length <= 1 && finalChanges.length > 0 && finalChanges.every((ch) => ch.decision !== 'object');
  return { plan: { intent, summary, keep: keepList, changes: finalChanges, by: 'reader' }, unread, certain };
}

/**
 * A short answer to the question asked last — "the second one", "2", a few words of an option — as the words of the
 * option it picks; null when the words are an instruction of their own (longer than an answer, or naming none).
 */
export function answerOf(words0: string, asked: PlanQuestion): string | null {
  const words = lower(words0);
  const opts = asked.options;
  if (!opts.length || !words) return null;
  const exact = opts.find((o) => words === lower(o.label) || words === lower(o.words));
  if (exact) return exact.words;
  // an instruction of its own is not an answer ("take the type from the first and the layout from the second")
  if (words.split(' ').length > 6) return null;
  const ord = ['first', 'second', 'third', 'fourth'].findIndex((w) => new RegExp(`\\b${w}\\b`).test(words));
  const num = words.match(/^\s*(\d)\b/);
  const pick = ord >= 0 ? opts[ord] : num ? opts[Number(num[1]) - 1] : opts.find((o) => lower(o.label).split(' ').filter((w) => w.length > 3).some((w) => words.includes(w)));
  return pick?.words ?? null;
}

/** Moves on concepts themselves: save, duplicate, compare, revisit, combine, new ones, another interpretation. */
function conceptMove(w: string, ctx: ReadContext): CreativePlan | null {
  const name = w.match(/\b(?:as|called|named)\s+"?([a-z0-9][\w -]{0,40})"?$/)?.[1];
  const ref = w.match(/\bconcept\s*(?:"([^"]+)"|(\d+|[a-z]+))/)?.slice(1).find(Boolean) ?? w.match(/\b(first|second|third|fourth|last|previous|original) (?:concept|version|one)\b/)?.[1];
  const concept = (action: 'save' | 'duplicate' | 'compare' | 'revisit' | 'new' | 'alternative', summary: string, extra: { ref?: string; name?: string } = {}): CreativePlan => ({ intent: 'concept', summary, keep: [], changes: [{ decision: 'concept', action, ...extra }], by: 'reader' });
  if (/\b(save|keep|store|bookmark)\b.*\b(this|it|current|as)\b.*\bconcept\b|\bsave (this|it)( as a concept)?$/.test(w)) return concept('save', 'this concept saved', name ? { name } : {});
  if (/\b(duplicate|copy|clone|fork)\b.*\b(concept|this|it)\b/.test(w) || /\b(explore|try|make) (a|another) (copy|variation|version)\b/.test(w)) return concept('duplicate', 'a copy of this concept to explore from', name ? { name } : {});
  if (/\bcompare\b/.test(w)) return concept('compare', 'concepts side by side', ref ? { ref } : {});
  if (/\b(go back to|revisit|return to|switch to|reopen|open|show me|back to) (the )?(concept|version|first|second|third|previous|original|last|earlier)\b/.test(w) || (/\b(go back to|revisit|return to|switch to)\b/.test(w) && ref)) return concept('revisit', 'an earlier concept brought back', ref ? { ref } : {});
  if (/\b(new|fresh|more|other|different|another set of|three) concepts?\b|\bstart (a )?new concept\b/.test(w)) return concept('new', 'new concepts from the brief');
  if (/\b(another|alternative|different|other) interpretations?\b|\binterpret (it|this) differently\b|\banother take\b/.test(w)) return concept('alternative', 'another interpretation of this concept, its decisions kept');
  // combining: decisions taken from another concept
  if (ref && /\b(take|use|borrow|combine|merge|bring|with|from|apply|steal|mix)\b/.test(w)) {
    const keys: DecisionKey[] = [];
    if (/\b(typography|type|fonts?|typefaces?)\b/.test(w)) keys.push('type');
    if (/\b(colou?rs?|palette)\b/.test(w)) keys.push('palette');
    if (/\b(forms?|shapes?|clouds|motifs?)\b/.test(w)) keys.push('forms');
    if (/\b(background|ground)\b/.test(w)) keys.push('background');
    if (keys.length) {
      const changes: Change[] = keys.map((k) => (k === 'type' ? { decision: 'type', from: ref } : k === 'palette' ? { decision: 'palette', from: ref } : k === 'forms' ? { decision: 'forms', from: ref } : { decision: 'background', from: ref }) as Change);
      return { intent: 'concept', summary: `the ${keys.map((k) => (k === 'type' ? 'typography' : k === 'palette' ? 'colours' : k)).join(' and ')} of concept ${ref}, the rest kept`, keep: [], changes, by: 'reader' };
    }
  }
  return null;
}
