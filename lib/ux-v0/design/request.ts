// lib/ux-v0/design/request.ts — what the browser sends, read into what the designer is asked.
//
// One function for the route (app/api/ux-v0/design) and the benchmark, so the benchmark asks exactly what the
// product asks. Everything from the browser is held to its shape and size (normalizeDesignState, normalizeDoc); the
// message is built from it (prompts.ts); the tier follows the request: a short, exact change to something named is
// economy work, anything about the feel, the whole, a new design or a look at a render that is not, premium.

import { normalizeDesignState, normalizeDoc, type DesignArtboard } from './doc';
import { DEFAULT_FORMAT, formatOf } from './formats';
import type { EarlierVersion } from './history';
import { designSystem, focusFor, lookUser, reviewUser, writeUser, type CompanyTold } from './prompts';

export type Tier = 'economy' | 'premium';

/** How much a request needs, from its words (see the head of this file). */
export function requestTier(words: string, hasArtboards: boolean): { tier: Tier; why: string } {
  if (!hasArtboards) return { tier: 'premium', why: 'a new design' };
  const c = String(words ?? '').toLowerCase();
  const broad = /\b(feel|feels|feeling|mood|vibe|atmospher\w*|theme|themed|aesthetic|style|look like|looks like|direction|directions|variation|variations|concept|sophisticat\w*|premium|luxur\w*|expensive|editorial|cinematic|experimental|corporate|generic|personality|cohesive|professional|better|further|stronger|improve|rethink|redesign|rework|reimagine|transform|recompose|adapt|everything|whole|overall|entire|composition|layout|focal|hierarchy|balance|keep|preserve|original|go back|restore|like before|instead|new|another|campaign|format|formats|page|logo)\b/;
  const exact = /\b(smaller|bigger|larger|size|bold(er)?|lighter|thinner|heavier|colou?r|black|white|red|blue|green|yellow|move|left|right|top|bottom|cent(re|er)|align|remove|delete|hide|uppercase|lowercase|capitals|italic|spacing|tracking|leading|opacity|rotate|rename|replace|change the (word|text|date|title))\b/;
  if (c.length > 160) return { tier: 'premium', why: 'a long instruction' };
  if (broad.test(c)) return { tier: 'premium', why: 'a change to the feel, the composition or the whole' };
  if (exact.test(c)) return { tier: 'economy', why: 'an exact change to something named' };
  return { tier: 'premium', why: 'an open change' };
}

const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => text(x, len)).filter(Boolean).slice(0, n);
const obj = (v: unknown): Record<string, any> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, any>) : {});

/** An artboard's words, for those the designer is told of in brief (tags stripped; no parser needed). */
/**
 * Whether the words ask for the designer's judgement of the work rather than a change to it ("review this", "what do
 * you think of the typography?", "is it ready?"). A criticism the person makes themselves ("this looks generic") is
 * not that: it is a change to make. Nothing is changed by a review (flow.ts runReview).
 */
export function wantsReview(words: string): boolean {
  const w = String(words ?? '').trim().toLowerCase().replace(/[’`]/g, "'");
  if (!w || w.length > 600) return false;
  if (/^(?:(?:please|can you|could you|would you|now)\s+)*(?:review|critique|criticise|criticize|evaluate|assess|vet|audit|appraise|scrutini[sz]e)\b(?!\s+(?:section|page|card|panel|tab|screen|button|list|form|step)\b)/.test(w)) return true;
  if (/\b(?:what do you (?:think|make) of|give (?:me |us )?(?:your |some |an? )?(?:honest |candid |critical )?(?:feedback|critique|opinion|thoughts|review)|your (?:honest |candid )?(?:opinion|critique|feedback|thoughts|verdict) on|any (?:feedback|thoughts|critique|criticism)\??|what(?:'s| is) (?:wrong|weak|not working|working|missing)\b|how (?:could|can|would|might) (?:this|it|we) (?:be (?:better|improved|stronger)|improve)\??$)/.test(w)) return true;
  // a question about the work with nothing asked to be made or changed
  if (/^(?:is|does|do|are) (?:this|it|the|these|our)\b[^.!]*\?$/.test(w) && !/\b(?:make|change|add|remove|replace|try|use|turn|set|move|redo|rewrite)\b/.test(w)) return true;
  return false;
}

export const wordsOfHtml = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<defs[\s\S]*?<\/defs>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

export type ReadRequest =
  | { ok: true; mode: 'write' | 'look' | 'review'; system: string; user: string; images: string[]; tier: Tier; why: string }
  | { ok: false; error: string };

/** The company as the browser sent it, held to its shape and size. */
export function readCompany(v: unknown): CompanyTold | null {
  const c = obj(v);
  const name = text(c.name, 80);
  if (!v || typeof v !== 'object' || !name) return null;
  return { name, about: list(c.about, 14, 400), products: list(c.products, 16, 300), audiences: list(c.audiences, 8, 300), principles: list(c.principles, 12, 300), avoid: list(c.avoid, 16, 300), missing: list(c.missing, 14, 240) };
}

/** Earlier versions as the browser sent them (their HTML held to size; nothing in them is trusted as instruction). */
function readEarlier(v: unknown): EarlierVersion[] {
  const out: EarlierVersion[] = [];
  let used = 0;
  for (const x of Array.isArray(v) ? v.slice(0, 3) : []) {
    const o = obj(x);
    const n = Math.round(Number(o.n));
    if (!Number.isFinite(n) || n < 1 || n > 999) continue;
    const artboards: EarlierVersion['artboards'] = [];
    for (const a of Array.isArray(o.artboards) ? o.artboards.slice(0, 2) : []) {
      const r = obj(a);
      const html = typeof r.html === 'string' ? r.html.slice(0, 80_000) : '';
      if (!/^[\w-]{1,40}$/.test(String(r.id)) || !html || used + html.length > 120_000) continue;
      used += html.length;
      artboards.push({ id: String(r.id), name: text(r.name, 80) || 'Artboard', html });
    }
    if (!artboards.length) continue;
    out.push({ n, said: text(o.said, 300), by: o.by === 'person' ? 'person' : 'model', kept: typeof o.kept === 'string' ? text(o.kept, 120) : null, tokens: typeof o.tokens === 'string' ? o.tokens.slice(0, 20_000) : null, artboards });
  }
  return out;
}

/** The browser's request (the route's body) as the designer's call: instructions, message, pictures, tier. */
export function readDesignRequest(body: unknown, picture: (v: unknown) => string | null): ReadRequest {
  const b = obj(body);
  const words = typeof b.words === 'string' ? b.words.trim().slice(0, 6000) : '';
  if (!words) return { ok: false, error: 'Say what to make or change.' };
  const state = normalizeDesignState({ doc: normalizeDoc(b.doc), turns: b.turns, memory: b.memory, comments: b.comments, assets: [], kind: b.kind, format: b.format, versions: [] });
  if (!state) return { ok: false, error: 'The design could not be read.' };
  const doc = state.doc;
  const measured: Record<string, string[]> = {};
  for (const [k, x] of Object.entries(obj(b.measured)).slice(0, 40)) if (/^[\w-]{1,40}$/.test(k)) measured[k] = list(x, 12, 200);
  const sys = obj(b.system);
  const system = b.system && typeof b.system === 'object' ? { name: text(sys.name, 80) || 'the brand', rules: list(sys.rules, 30, 300) } : null;
  const assets = (Array.isArray(b.assets) ? b.assets : [])
    .slice(0, 40)
    .map((x: any) => ({ id: text(x?.id, 40), name: text(x?.name, 120) || 'image', src: '', width: Math.round(Number(x?.width) || 1000), height: Math.round(Number(x?.height) || 1000), ...(text(x?.note, 480) ? { note: text(x?.note, 480) } : {}) }))
    .filter((x: { id: string }) => /^[\w-]{1,40}$/.test(x.id));

  const company = readCompany(b.company);

  if (b.mode === 'look' || b.mode === 'review') {
    const ids = list(b.artboards, 3, 40);
    const boards = ids.map((id) => doc.artboards.find((a) => a.id === id)).filter((a): a is DesignArtboard => !!a);
    const pictures = (Array.isArray(b.pictures) ? b.pictures : []).slice(0, boards.length).map(picture);
    if (!boards.length || pictures.length !== boards.length || pictures.some((p) => !p)) return { ok: false, error: 'The artboards and their pictures are needed.' };
    // a review is judgement about the whole: premium work; a look at what was just made is not
    if (b.mode === 'review') return { ok: true, mode: 'review', system: designSystem(), user: reviewUser({ made: '', words, artboards: boards, tokens: doc.tokens, measured, memory: state.memory, system, company, assets }), images: pictures as string[], tier: 'premium', why: 'a review' };
    return { ok: true, mode: 'look', system: designSystem(), user: lookUser({ made: text(b.made, 400) || 'a change', words, artboards: boards, tokens: doc.tokens, measured, memory: state.memory }), images: pictures as string[], tier: 'economy', why: 'a look at the render' };
  }

  const s = obj(b.selection);
  const selection = b.selection && typeof s.artboard === 'string' ? { artboard: text(s.artboard, 40), element: typeof s.element === 'string' ? text(s.element, 40) : null, label: text(s.label, 120) } : null;
  const a = obj(b.answering);
  const answering = b.answering && typeof b.answering === 'object' ? { text: text(a.text, 600), options: list(a.options, 6, 120) } : null;
  const focus = focusFor(words, doc.artboards, selection?.artboard ?? null);
  const words_of = Object.fromEntries(doc.artboards.filter((x) => !focus.includes(x.id)).map((x) => [x.id, wordsOfHtml(x.html)]));
  const format = formatOf(text(b.format, 40))?.id ?? DEFAULT_FORMAT;
  const pic = picture(b.picture);
  const t = requestTier(words, doc.artboards.length > 0);
  return {
    ok: true,
    mode: 'write',
    system: designSystem(),
    user: writeUser({ words, selection, answering, kind: state.kind, format, memory: state.memory, system, assets, comments: state.comments, turns: state.turns, tokens: doc.tokens, artboards: doc.artboards, focus, words_of, measured, earlier: readEarlier(b.earlier), company }),
    images: pic ? [pic] : [],
    tier: t.tier,
    why: t.why,
  };
}
