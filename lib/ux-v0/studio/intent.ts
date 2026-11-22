// lib/ux-v0/studio/intent.ts — which of the six things a person is asking for, read from their words and what they
// attached, with how sure the reading is and why.
//
// Deterministic and free: no model is asked to route a sentence. A clear reading routes at once; a close call or no
// signal at all is never guessed — the conversation asks, with the likeliest modes first. The person can always choose
// the mode themselves, and their choice wins.

import type { AttachmentKind, StudioMode } from './schema';
import { STUDIO_MODES } from './schema';
import { readFacts, type StudioFacts } from './facts';

export interface IntentReading {
  /** the mode read, or null when the words do not settle it */
  mode: StudioMode | null;
  /** 0–1 */
  confidence: number;
  /** every mode with its score, likeliest first */
  ranked: { mode: StudioMode; score: number; why: string[] }[];
  facts: StudioFacts;
}

const SIGNALS: readonly [StudioMode, RegExp, number, string][] = [
  ['logo', /\b(logos?|logotype|word ?mark|letter ?mark|monogram|brand ?mark|emblem|crest)\b/, 6, 'names a logo'],
  ['logo', /\b(visual identity|brand identity|identity (?:for|of))\b/, 4, 'asks for an identity'],
  ['website', /\b(websites?|web ?sites?|landing ?pages?|home ?page|web ?pages?|web ?app|online (?:shop|store)|e-?commerce|booking (?:page|site|system|screen)|sign-?up (?:page|flow)|checkout)\b/, 6, 'names a website'],
  ['website', /\b(portfolio site|blog|newsletter site|microsite|app screens?|dashboard)\b/, 4, 'names a kind of site'],
  ['board', /\b(campaign|launch kit|set of (?:materials|assets|graphics)|series of|across (?:social|print|channels)|rollout|board)\b/, 4, 'asks for a campaign'],
  ['graphic', /\b(posters?|flyers?|leaflets?|instagram|social (?:media )?posts?|carousels?|stor(?:y|ies)|banners?|covers?|business cards?|labels?|packaging|infographics?|invitations?|menus?|tickets?|slides?|thumbnails?|advert(?:isement)?s?|ads?)\b/, 4, 'names a graphic'],
  ['system', /\b(design system|design tokens?|tokens?\.json|style ?guide|brand guidelines?|brand book|guidelines|css variables|figma (?:file|library|variables)|import (?:my|our) brand|our brand colours|token)\b/, 6, 'names a design system'],
  ['critique', /\b(critique|critic|review|feedback|what(?:'|’)s wrong|what is wrong|not working|improve (?:this|my)|audit|evaluate|rate (?:this|my)|look (?:closely )?at (?:this|my))\b/, 5, 'asks for a critique'],
];

/** How a person's opening sentence and attachments read (see the head of this file). */
export function recognizeIntent(text: string, attachments: readonly { kind: AttachmentKind }[] = []): IntentReading {
  const words = (text ?? '').trim();
  const low = words.toLowerCase();
  const facts = readFacts(words);
  const score: Record<StudioMode, number> = { graphic: 0, website: 0, logo: 0, system: 0, board: 0, critique: 0 };
  const why: Record<StudioMode, string[]> = { graphic: [], website: [], logo: [], system: [], board: [], critique: [] };
  const add = (m: StudioMode, n: number, w: string) => {
    score[m] += n;
    if (!why[m].includes(w)) why[m].push(w);
  };
  for (const [m, re, n, w] of SIGNALS) if (re.test(low)) add(m, n, w);

  // several kinds of material named, or a website beside graphics: a board
  const kinds = new Set(facts.materials.map((x) => x.kind));
  const pieces = facts.materials.reduce((t, x) => t + x.count, 0);
  if (kinds.size >= 2) add('board', 5, `names ${kinds.size} kinds of material`);
  else if (pieces >= 3 && /\b(and|plus|,)\b/.test(low)) add('board', 2, `asks for ${pieces} pieces`);
  if (kinds.has('website') && kinds.size >= 2) score.website -= 3;

  // "critique this landing page", "review my poster": the thing named is what is to be critiqued
  const verb = low.search(/\b(critique|review|feedback on|audit|evaluate|rate|look (?:closely )?at|what(?:'|’)s wrong with|what is wrong with)\b/);
  if (score.critique > 0 && verb >= 0) {
    const noun = low.search(/\b(website|site|landing ?page|home ?page|page|screen|app|poster|flyer|post|logo|design|layout|cover|banner)\b/);
    if (noun > verb || attachments.some((x) => x.kind === 'page' || x.kind === 'image')) {
      add('critique', 4, 'the work named is the one to critique');
      for (const m of ['website', 'graphic', 'logo', 'board'] as const) score[m] = Math.max(0, score[m] - 4);
    }
  }
  // a logo on a poster is a poster
  if (score.logo && score.graphic && /\b(with|including|and) (?:our|the|my|a) logo\b/.test(low)) {
    score.logo -= 4;
    add('graphic', 1, 'the logo is part of a graphic');
  }
  // a website for a logo, a logo for a website: whichever leads
  if (score.logo && score.website) {
    const l = low.search(/\blogo/);
    const w = low.search(/\b(website|site|landing page|home ?page)/);
    if (l >= 0 && w >= 0) (l < w ? (score.website -= 3) : (score.logo -= 3));
  }

  // what was attached
  for (const at of attachments) {
    if (at.kind === 'tokens' || at.kind === 'css') add('system', 7, 'a tokens or CSS file is attached');
    else if (at.kind === 'pdf') add('system', score.critique ? 1 : 3, 'a PDF is attached (guidelines, most often)');
    else if (at.kind === 'font') add('system', 2, 'a font file is attached');
    else if (at.kind === 'page') add('critique', 4, 'a page is attached');
    else if (at.kind === 'image' && score.critique) add('critique', 3, 'a design to look at is attached');
  }
  if (facts.urls.some((u) => /figma\.com\//i.test(u))) add('system', 5, 'a Figma link is given');

  // nothing named at all, but the person's own words in quotes: something to set, most often a graphic
  if (!Object.values(score).some((v) => v > 0) && facts.quoted.length) add('graphic', 2, 'gives words to set');

  const ranked = STUDIO_MODES.map((m) => ({ mode: m, score: Math.max(0, score[m]), why: why[m] })).sort((p, q) => q.score - p.score);
  const [top, second] = ranked;
  const confidence = top.score <= 0 ? 0 : Math.max(0, Math.min(1, (top.score - (second?.score ?? 0) * 0.6) / (top.score + 2)));
  // routed only when the reading is clear: a strong signal well ahead of the next
  const mode = top.score >= 4 && top.score - (second?.score ?? 0) >= 2 ? top.mode : null;
  return { mode, confidence: Math.round(confidence * 100) / 100, ranked, facts };
}

/** What a file is, by its name and type (the studio's own classification, before anything reads it). */
export function attachmentKindOf(file: { name: string; type?: string }): AttachmentKind {
  const n = file.name.toLowerCase();
  const t = (file.type ?? '').toLowerCase();
  if (/\.(json)$/.test(n) || t === 'application/json') return 'tokens';
  if (/\.(css|scss)$/.test(n) || t === 'text/css') return 'css';
  if (/\.pdf$/.test(n) || t === 'application/pdf') return 'pdf';
  if (/\.(ttf|otf|woff2?)$/.test(n) || /^font\//.test(t)) return 'font';
  if (/\.(html?|xhtml)$/.test(n) || t === 'text/html') return 'page';
  if (/\.(png|jpe?g|webp|gif|svg)$/.test(n) || /^image\//.test(t)) return 'image';
  return 'other';
}
