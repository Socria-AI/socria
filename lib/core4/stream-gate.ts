// lib/core4/stream-gate.ts
//
// The streaming sentence gate, for Core 4 moves that are not buffered.
//
// Text goes out as complete sentences as it arrives — except that any
// interrogative sentence (explicit, disguised, or a closing offer) is HELD.
// If more exposition follows, the held question was rhetorical and is
// released in order; whatever is still held at the end of the stream ships
// only within the question budget. A sycophantic opener is removed from the
// first sentence. Code blocks pass through untouched.
//
// This is what makes the budget hold on streamed replies: the person never
// sees a question the budget did not allow, and nothing is un-sent.
//
// SOMEBODY ELSE'S WORDS ARE NEVER TOUCHED. The gate follows the line each
// sentence sits on: a sentence on a blockquote line or a table row, inside a
// draft written for somebody else (from "Here's a draft:", a "Subject:" line
// or a "Hi Sam," line to the end of the draft), or a list item that follows
// another item, is content, and goes out as it was written — the closing-offer
// rule was deleting the last line of drafts and the third of three requested
// sign-offs (lib/core4/questions.ts quotedOrDraft).
//
// FILLER, BY CLASS, AND SHADOW FIRST (LOGOS_TRIM). This is the only place
// model text is deleted, so each class is a narrow rule with a position:
// openers are taken only from the start of the first line of the first prose
// piece, and recaps and pleasantries only when they are the last thing in the
// reply. Never anything from the middle (council D4), never inside quotes,
// tables, code, drafts, requested phrasings or lists, and never in a reply
// that is not English-dominant. What each class removed — or, in a mode that
// does not apply it, would have removed — is counted, content-free, in
// stats(), so the false-positive rate can be read before a class is switched
// on. LOGOS_TRIM=on applies every class; =shadow applies none of the new ones
// and counts them; =off neither applies nor counts them; unset ("safe")
// applies only the content-free announcement lines ("Let's dive in.") and
// counts the rest. The closing-offer rule and the sycophantic opener hold in
// every mode, as they always have.
//
// AN ELEMENT THAT WAS DROPPED TAKES ITS INSTRUCTION WITH IT. When the block
// hook drops a ```ui block (it did not hold up), the sentence directly after
// it is dropped too if it tells them to work the element ("Drag a and watch
// the vertex."), because it would point at nothing. Only that one sentence,
// and only that shape.
//
// THE SAME REPLY GIVES THE SAME OUTPUT HOWEVER IT ARRIVES. A sentence is cut
// only once the whitespace after it has ended, abbreviations never end one
// ("Dr. Smith"), and a fence is found wherever its delta boundaries fall, so
// the output is byte-identical whether the model's deltas are one character
// or the whole reply (test/stream-trim.test.mjs holds this over a corpus).
//
// Pure.

import {
  interrogatives,
  hasSycophanticOpener,
  stripSycophanticOpener,
  sentencesOf,
  quotedOrTableLine,
  LIST_ITEM,
  draftStep,
  type DraftState,
  openerInterjection,
  isAnnouncement,
  recapOf,
  pleasantryOf,
  isDefinitionalOpener,
  isPolarQuestion,
  englishDominant,
  elementImperative,
} from './questions';
import { classify, conceptTerms, REDUNDANT_AT } from './considered';

/**
 * How much of the filler trimming is applied (env LOGOS_TRIM). See the head
 * of this file. Anything unrecognised is the default, "safe".
 */
export type TrimMode = 'on' | 'safe' | 'shadow' | 'off';
export function trimModeOf(value?: string | null): TrimMode {
  const v = (value ?? (typeof process !== 'undefined' ? process.env?.LOGOS_TRIM : undefined) ?? '').trim().toLowerCase();
  return v === 'on' || v === 'shadow' || v === 'off' ? v : 'safe';
}

/** The filler classes, each with its own rule (lib/core4/questions.ts). */
export type TrimClass = 'opener' | 'announce' | 'recap' | 'pleasantry' | 'definition';
const TRIM_CLASSES: readonly TrimClass[] = ['opener', 'announce', 'recap', 'pleasantry', 'definition'];
const APPLIED: Record<TrimMode, ReadonlySet<TrimClass>> = {
  on: new Set(TRIM_CLASSES),
  safe: new Set<TrimClass>(['announce']),
  shadow: new Set<TrimClass>(),
  off: new Set<TrimClass>(),
};

/**
 * What the gate took out of one reply, by class, and what the filler classes
 * that are not applied in this mode would have taken. Counts only, never the
 * words: safe for a header or a log line.
 */
export interface GateStats {
  mode: TrimMode;
  removed: {
    /** closing offers dropped from the end */
    offer: number;
    /** questions over the budget dropped from the end */
    question: number;
    /** sentences `drop` took out (a claimed tool run that did not happen) */
    claim: number;
    opener: number;
    announce: number;
    recap: number;
    pleasantry: number;
    definition: number;
    /** an instruction to work an element that was dropped */
    imperative: number;
  };
  /** what the filler classes not applied in this mode would have removed */
  would: Record<TrimClass, number>;
  /** ```ui blocks the block hook dropped (or replaced by a notice), by kind */
  blocks: Record<string, number>;
}

/**
 * The stats as one content-free trace field, for X-Socria-Runtime or the turn
 * log: "trim=safe;o:0,b:1,r:0,p:0,d:0,c:1,q:0,s:0,i:0;would=o:1,b:0,r:0,p:1,d:0;ui-drop=chart:1".
 */
export function gateTrace(s: GateStats): string {
  const r = s.removed;
  const w = s.would;
  const kinds = Object.entries(s.blocks).map(([k, n]) => `${k}:${n}`).join(',');
  return [
    `trim=${s.mode}`,
    `o:${r.opener},b:${r.announce},r:${r.recap},p:${r.pleasantry},d:${r.definition},c:${r.offer},q:${r.question},s:${r.claim},i:${r.imperative}`,
    `would=o:${w.opener},b:${w.announce},r:${w.recap},p:${w.pleasantry},d:${w.definition}`,
    ...(kinds ? [`ui-drop=${kinds}`] : []),
  ].join(';');
}

/**
 * Where a sentence ends, read on a copy with abbreviations shielded (the same
 * list sentencesOf uses), so "Dr. Smith says…" is one piece and not "Dr. ".
 * "No." and "p." are shielded only before a number ("No. 5", "p. 12"): "No.
 * Cool it first." is an answer and a sentence of its own. The shield keeps the
 * text's length, so the index found is the index in the real text.
 */
const GATE_ABBR = /\b(?:e\.g|i\.e|etc|vs|cf|et al|approx|Dr|Mr|Mrs|Ms|St|Fig|Eq|No(?=\.\s*\d)|pp?(?=\.\s*\d))\.(?=\s)/g;
function boundary(buf: string): RegExpExecArray | null {
  const shielded = buf.replace(GATE_ABBR, (m) => m.slice(0, -1) + '\u2024');
  return /[.!?]+["'’”)\]]*\s+|\n{2,}/.exec(shielded);
}

/** A ```ui fence, and the kind it names (lowercase letters only, so it is safe in a trace). */
function uiKind(chunk: string): string | null {
  const m = /^\s*```[ \t]*([\w-]*)/.exec(chunk);
  if (!m || m[1].toLowerCase() !== 'ui') return null;
  const k = /"type"\s*:\s*"([A-Za-z][\w-]{0,30})"/.exec(chunk)?.[1]?.toLowerCase();
  return k && /^[a-z][a-z-]*$/.test(k) ? k : 'unknown';
}

/** A held sentence: what it is, decided once when it arrived. */
interface Held {
  text: string;
  offer: boolean;
  question: boolean;
  /** a filler class held for the tail: recap or pleasantry */
  tail?: 'recap' | 'pleasantry';
}

/** A piece held at the start of the reply while the lead is decided. */
interface LeadItem {
  text: string;
  cls: 'opener' | 'announce' | 'definition' | 'ws';
  /** already sent: its class is not applied in this mode, and it is only counted */
  sent: boolean;
}

/** What the line a piece starts on says about it. */
interface LineContext {
  /** the line is a blockquote or a table row */
  quoted: boolean;
  /** the line lies inside a draft for somebody else */
  draft: boolean;
  /** the line is a list item */
  list: boolean;
}

/** The exchanges that are talk, where a pleasantry is natural conversation (lib/cognition/register.ts TALK). */
const TALK = new Set(['social', 'playful', 'personal']);

/**
 * For unbuffered moves: emit text as complete sentences, but HOLD back any
 * interrogative sentence and a sycophantic opener until the end, where the
 * question budget decides. Code blocks pass through untouched.
 */
export class SentenceGate {
  private buf = '';
  private held: Held[] = [];
  private inCode = false;
  private first = true;
  out = '';

  /**
   * passQuestions: the person asked FOR questions (a quiz, interview
   * questions), so interrogatives are content and pass straight through;
   * closing offers are still held.
   */
  /**
   * drop: a sentence that must never ship at all — a claimed tool run that did
   * not happen (guard2.ts fabricatedToolClaim). Dropped whole, as the guard's
   * always-strip list does on a held turn; recorded in `stripped`.
   */
  stripped: string[] = [];

  /**
   * filterOnly: apply `drop` and nothing else — no held questions, no opener
   * strip. For a surface (Logos) that has its own voice rules and only needs
   * a claimed tool run kept out of the stream.
   */
  /**
   * keepOpener: leave the first sentence's opener alone — for a reply the
   * math engine has confirmed answers a real mistake of Socria's, where "you're
   * right" is the honest first word (lib/accuracy theyCaughtIt).
   */
  /**
   * rewrite: change a sentence before anything else reads it — Logos 5's
   * citation check (lib/runtime/epistemic.ts rewriteCitations) takes out a
   * citation that names no source and a link no source carried, and keeps the
   * rest of the sentence. Fenced code never reaches it.
   */
  /**
   * neverEmpty: a reply that would end up empty because everything in it was a
   * closing offer sends the offers instead (Logos). Questions over the budget
   * are still dropped.
   */
  /**
   * keep: an interrogative sentence another filter has already judged and
   * kept as somebody else's words (Logos 5's Metacognitive Regulation under a
   * "stop asking": a quoted draft's question, a table cell, a listed question
   * they asked for) goes out in order instead of being held for the tail cap,
   * which cannot see that it is not a question put to them. Unset: nothing
   * changes.
   */
  /**
   * rewriteAll: `rewrite` for a filter that may hand back the sentence as
   * several pieces, each then read as a sentence of its own (or none: the
   * sentence is gone, as `drop` would take it) — Metacognitive Regulation
   * holds a list's number until its item arrives and gives both back apart,
   * so the gate reads the number as it would have without the filter. Takes
   * the place of `rewrite` when set. Unset: nothing changes.
   */
  /**
   * see: a piece that is only whitespace never reaches `rewrite`; a filter
   * that follows line breaks (Metacognitive Regulation) is shown it here, and
   * what it returns goes out in its place. Unset: nothing changes.
   */
  /**
   * block: a finished fenced block, before anyone sees it — Logos 5's inline
   * vocabulary (lib/inline-ui.ts gateInlineBlock) checks a ```ui block here and
   * sends its canonical form, a notice, or nothing; anything else it returns
   * unchanged. `open` is a block the stream ended inside of.
   */
  /**
   * trim: the filler mode (see the head of this file); unset reads LOGOS_TRIM.
   *
   * What the route knows about the turn, which some filler rules need and
   * which none of them guesses at. Each is optional; a rule whose input is
   * missing does not run (and is not counted), so an unwired caller gets the
   * conservative gate:
   *   asked     the person's message this turn. A Class A interjection
   *             ("Absolutely.") is never removed when it answers a yes/no
   *             question ("Can I freeze rice?"), so without it Class A never
   *             runs. Also read for language: a message that is not English
   *             turns the filler rules off.
   *   exchange  the exchange kind (lib/cognition/register.ts). A pleasantry
   *             ("Enjoy!") is natural conversation on a social, playful or
   *             personal turn, so without it pleasantries are never removed
   *             ("I hope this helps" still is, outside talk).
   *   shape     the presentation shape. The textbook opener ("X is a
   *             fundamental concept in Y.") is removed only on an
   *             understand/explain turn.
   *   phrasing  they asked for wordings (ExplicitSignals.requestsPhrasing):
   *             what comes back is the wordings, so no closing offer and no
   *             list item is held or trimmed, and no filler class runs.
   *             (Unset, a list item that follows another item is still never
   *             read as a closing offer: see the head of this file.)
   */
  constructor(
    private emit: (s: string) => void,
    private opts: {
      passQuestions?: boolean;
      drop?: (sentence: string) => boolean;
      filterOnly?: boolean;
      keepOpener?: boolean;
      rewrite?: (sentence: string) => string;
      neverEmpty?: boolean;
      keep?: (sentence: string) => boolean;
      see?: (whitespace: string) => string;
      rewriteAll?: (sentence: string) => string[];
      block?: (chunk: string, open: boolean) => string;
      trim?: TrimMode;
      asked?: string;
      exchange?: string;
      shape?: string;
      phrasing?: boolean;
    } = {}
  ) {
    this.mode = opts.trim ?? trimModeOf();
  }

  private mode: TrimMode;
  private removed: GateStats['removed'] = { offer: 0, question: 0, claim: 0, opener: 0, announce: 0, recap: 0, pleasantry: 0, definition: 0, imperative: 0 };
  private would: GateStats['would'] = { opener: 0, announce: 0, recap: 0, pleasantry: 0, definition: 0 };
  private blocks: Record<string, number> = {};

  // ── the line each piece sits on ──
  /** what the current line holds so far, of everything accepted */
  private lineHead = '';
  /** where the reply stands with respect to a draft (questions.ts draftStep) */
  private draft: DraftState = 'none';
  /** the last line that was not blank was a list item */
  private lastWasItem = false;

  // ── the lead ──
  private leadOpen = true;
  private leadItems: LeadItem[] = [];

  /** the kind of the ```ui block just dropped, until the next sentence arrives */
  private afterDrop: string | null = null;
  /** a block was just sent: blank lines after it are capped at one */
  private afterBlock = false;

  /** What the gate took out of this reply, by class; content-free (see gateTrace). */
  stats(): GateStats {
    return { mode: this.mode, removed: { ...this.removed }, would: { ...this.would }, blocks: { ...this.blocks } };
  }

  push(delta: string) {
    this.buf += delta;
    for (;;) {
      if (this.inCode) {
        // buf starts with the opening fence while inCode: the close is the
        // next fence after it, not that one (searching from 0 found the
        // opening fence again, and every block that spanned two deltas went
        // out unchecked, as sentences)
        const end = this.buf.indexOf('```', 3);
        if (end < 0) return;
        const chunk = this.buf.slice(0, end + 3);
        this.buf = this.buf.slice(end + 3);
        this.inCode = false;
        this.sendBlock(chunk);
        continue;
      }
      const fence = this.buf.indexOf('```');
      const m = boundary(this.buf);
      if (fence >= 0 && (!m || fence < m.index)) {
        // what comes before the fence goes out, a bare line break included
        // (it was discarded, so the same reply came out with or without a
        // blank line before its block depending on where a delta ended)
        const before = this.buf.slice(0, fence);
        if (before) this.consider(before);
        this.buf = this.buf.slice(fence);
        this.inCode = true;
        continue;
      }
      if (!m) return;
      // the whitespace after a sentence may go on in the next delta: wait for
      // it to end, so a sentence and its line breaks always travel together
      if (m.index + m[0].length === this.buf.length) return;
      const sentence = this.buf.slice(0, m.index + m[0].length);
      this.buf = this.buf.slice(m.index + m[0].length);
      this.consider(sentence);
    }
  }

  private consider(sentence: string) {
    if (this.opts.rewriteAll && sentence.trim()) {
      for (const piece of this.opts.rewriteAll(sentence)) this.accept(piece);
      return;
    }
    if (this.opts.rewrite && sentence.trim()) sentence = this.opts.rewrite(sentence);
    // a piece that is only a line or paragraph break: shown to a filter that follows lines (unset: nothing changes)
    else if (this.opts.see && sentence && !sentence.trim()) sentence = this.opts.see(sentence);
    this.accept(sentence);
  }

  private accept(sentence: string) {
    if (this.opts.drop && sentence.trim() && this.opts.drop(sentence)) {
      this.stripped.push(sentence.trim());
      this.removed.claim++;
      return;
    }
    if (this.opts.filterOnly) {
      this.send(sentence);
      return;
    }
    if (!sentence.trim()) {
      // a break held in the lead stays in its place there
      if (this.leadItems.length) {
        this.leadItems.push({ text: sentence, cls: 'ws', sent: false });
        this.observe(sentence);
        return;
      }
      this.flushHeldInline();
      this.send(this.capBlank(sentence));
      this.observe(sentence);
      return;
    }
    const at = this.contextOf(sentence);
    // the instruction to work an element that was just dropped goes with it
    if (this.afterDrop !== null) {
      const kind = this.afterDrop;
      this.afterDrop = null;
      if (!at.quoted && !at.draft && elementImperative(sentence, kind)) {
        this.removed.imperative++;
        return;
      }
    }
    if (this.first) {
      this.first = false;
      // "Great question — the answer is 42." keeps "The answer is 42."
      if (!this.opts.keepOpener && hasSycophanticOpener(sentence)) {
        const rest = stripSycophanticOpener(sentence);
        if (rest === null) return;
        sentence = rest + (/\s*$/.exec(sentence)?.[0] ?? '');
      }
    }
    if (this.leadOpen) {
      const rest = this.lead(sentence, at);
      if (rest === null) return;
      sentence = rest;
    }
    const seen = this.scan(sentence);
    this.observe(sentence);
    // somebody else's words, and a listed phrasing they asked for: content, in order
    if (!seen.open) {
      this.flushHeldInline();
      this.send(sentence);
      return;
    }
    const q = interrogatives(seen.visible);
    const offer = interrogatives(seen.offers).offers.length > 0 && !this.opts.phrasing;
    const question = !this.opts.passQuestions && (q.explicit.length > 0 || q.disguised.length > 0);
    if ((question || offer) && !this.opts.keep?.(sentence)) {
      this.held.push({ text: sentence, offer, question });
      return;
    }
    const tail = this.tailOf(sentence, at);
    if (tail) {
      this.held.push({ text: sentence, offer: false, question: false, tail });
      return;
    }
    this.flushHeldInline();
    this.send(sentence);
  }

  // ── line context ──

  /** The line this piece starts on: quoted, in a draft, a list item, one after another. */
  private contextOf(piece: string): LineContext {
    let head = this.lineHead;
    let state = this.draft;
    // leading line breaks belong to the lines before the piece
    const lead = /^\s*/.exec(piece)?.[0] ?? '';
    const breaks = lead.split('\n');
    for (let i = 0; i < breaks.length - 1; i++) {
      state = draftStep(state, head + breaks[i]);
      head = '';
    }
    const line = head + piece.slice(lead.length).split('\n')[0];
    const st = draftStep(state, line);
    return { quoted: quotedOrTableLine(line), draft: st === 'body' || st === 'signoff', list: LIST_ITEM.test(line) };
  }

  /**
   * The piece as the question and offer rules should read it: every line in
   * it that is quoted, a table row or inside a draft is blanked (a piece may
   * run over several lines when they carry no full stop), and for offers a
   * list item after another item is blanked too. `open`: some line of it is
   * still Socria speaking.
   */
  private scan(piece: string): { visible: string; offers: string; open: boolean } {
    let head = this.lineHead;
    let state = this.draft;
    let lastItem = this.lastWasItem;
    const segs = piece.split('\n');
    const visible: string[] = [];
    const offers: string[] = [];
    let open = false;
    segs.forEach((seg, i) => {
      const line = head + seg;
      const st = draftStep(state, line);
      const item = LIST_ITEM.test(line);
      const exempt = quotedOrTableLine(line) || st === 'body' || st === 'signoff' || (!!this.opts.phrasing && item);
      // the whole of an item that follows another, not only a sentence that
      // starts its line: "3. Thank you for your time. Let me know if you have
      // any questions." is one requested sign-off, and its second sentence
      // was being dropped as a closing offer
      const sibling = item && lastItem;
      // a continuation of a line keeps its head for reading ("…? Let me know" on a ">" line)
      visible.push(exempt ? ' ' : seg);
      offers.push(exempt || sibling ? ' ' : seg);
      if (!exempt && seg.trim()) open = true;
      if (i < segs.length - 1) {
        state = st;
        if (line.trim()) lastItem = item;
        head = '';
      }
    });
    return { visible: visible.join('\n'), offers: offers.join('\n'), open };
  }

  /** Follow the lines of what was accepted (sent or held), in order. */
  private observe(text: string) {
    const segs = text.split('\n');
    for (let i = 0; i < segs.length - 1; i++) {
      const line = this.lineHead + segs[i];
      this.draft = draftStep(this.draft, line);
      if (line.trim()) this.lastWasItem = LIST_ITEM.test(line);
      this.lineHead = '';
    }
    this.lineHead += segs[segs.length - 1];
  }

  // ── the lead: openers, announcements and the textbook opener ──

  /**
   * Read a piece while the lead is open. Returns the piece to go on with
   * (perhaps without an opener), or null when it is held in the lead until
   * what follows it is known.
   */
  private lead(piece: string, at: LineContext): string | null {
    const heading = /^\s*(?:#{1,6}\s|(?:\*\*|__)[^*_\n]{1,80}(?:\*\*|__)\s*$)/.test(piece);
    if (heading && !this.leadItems.length) return piece; // the first prose piece comes after it
    const off =
      this.mode === 'off' ||
      !!this.opts.keepOpener ||
      !!this.opts.phrasing ||
      heading ||
      at.quoted ||
      at.draft ||
      at.list ||
      !englishDominant(piece) ||
      (!!this.opts.asked && !englishDominant(this.opts.asked)) ||
      // only the first line of the reply's prose
      this.leadItems.some((x) => x.cls !== 'ws' && /\n/.test(x.text)) ||
      this.leadItems.some((x) => x.cls === 'ws' && /\n/.test(x.text));
    if (off) return this.closeLead(piece);
    let rest = piece;
    const firstProse = !this.leadItems.some((x) => x.cls !== 'ws');
    const a = firstProse ? openerInterjection(rest) : null;
    if (a) {
      this.hold({ text: a.cut, cls: 'opener' });
      rest = a.rest;
      if (!rest.trim()) return this.holdBreak(rest);
    }
    const nl = rest.indexOf('\n');
    const line = nl < 0 ? rest : rest.slice(0, nl);
    if (isAnnouncement(line)) {
      // the announcement and the breaks after it; anything after them is content
      const m = /^[^\n]*\n?(?:[ \t]*\n)*/.exec(rest)?.[0] ?? rest;
      this.hold({ text: m, cls: 'announce' });
      rest = rest.slice(m.length);
      if (!rest.trim()) return this.holdBreak(rest);
      return this.closeLead(rest);
    }
    if (firstProse && !a && (nl < 0 || !rest.slice(nl).trim()) && isDefinitionalOpener(rest)) {
      this.hold({ text: rest, cls: 'definition' });
      return null;
    }
    return this.closeLead(rest);
  }

  /** The whitespace left after a candidate keeps its place in the lead (a line break after "Sure!" is still there if "Sure!" stays). */
  private holdBreak(rest: string): null {
    if (rest) this.hold({ text: rest, cls: 'ws' });
    return null;
  }

  /** Hold a lead candidate — or, where its class is not applied in this mode, send it now and only count it later. */
  private hold(item: { text: string; cls: LeadItem['cls'] }) {
    const applied = item.cls !== 'ws' && APPLIED[this.mode].has(item.cls);
    const holding = this.leadItems.some((x) => !x.sent);
    const sent = !applied && !holding;
    if (sent) {
      this.flushHeldInline();
      this.send(item.text);
    }
    this.leadItems.push({ ...item, sent });
    this.observe(item.text);
  }

  /**
   * The lead is decided: `next` is what followed it (null at the end of the
   * reply, `block` when it was a fenced block). Each candidate goes only when
   * its own rule holds and its class is applied; what is left goes out in
   * order, and a reply that now starts later starts with a capital.
   */
  private closeLead(next: string | null, block = false): string | null {
    this.leadOpen = false;
    const items = this.leadItems;
    this.leadItems = [];
    if (!items.length) return next;
    const asked = this.opts.asked;
    const after = (i: number) => items.slice(i + 1).map((x) => x.text).join('') + (next ?? '');
    // the words on the line that follows the candidate (its own line, or the next if it stood alone)
    const words = (s: string) => s.trimStart().split('\n')[0].trim().split(/\s+/).filter(Boolean).length;
    let cutFromStart = true;
    let cut = false;
    items.forEach((it, i) => {
      if (it.cls === 'ws') {
        if (!it.sent && !(cutFromStart && cut)) this.send(it.text);
        return;
      }
      let fits = false;
      if (next !== null || block) {
        if (it.cls === 'opener') fits = asked !== undefined && !isPolarQuestion(asked) && words(after(i)) >= 4;
        else if (it.cls === 'announce') {
          // a line that introduces a table, a list or a block is its caption: it stays
          const following = block ? '```' : (items.slice(i + 1).find((x) => x.cls !== 'ws')?.text ?? next ?? '').trimStart();
          fits = !(/:\s*$/.test(it.text.trim()) && (block || /^(?:\||```|>|[-*+•]\s|\d{1,3}[.)]\s)/.test(following)));
        } else if (it.cls === 'definition') {
          fits = (this.opts.shape === 'understand' || this.opts.shape === 'explain') && i === items.findIndex((x) => x.cls !== 'ws') && !!next && words(next) >= 6;
        }
      }
      if (fits && !it.sent && APPLIED[this.mode].has(it.cls)) {
        this.removed[it.cls]++;
        cut = true;
        return;
      }
      if (fits && this.mode !== 'off') this.would[it.cls]++;
      if (!it.sent) this.send(it.text);
      cutFromStart = false;
    });
    if (next !== null && cutFromStart && cut) {
      const t = next.replace(/^\s+/, '');
      return t.charAt(0).toUpperCase() + t.slice(1);
    }
    return next;
  }

  // ── the tail: recaps and pleasantries ──

  /** A recap or a pleasantry, held so that it can go if it turns out to be last. */
  private tailOf(piece: string, at: LineContext): Held['tail'] | undefined {
    if (this.mode === 'off' || this.opts.phrasing || at.list || at.quoted || at.draft) return undefined;
    if (!englishDominant(piece) || (this.opts.asked && !englishDominant(this.opts.asked))) return undefined;
    if (recapOf(piece) !== null) return 'recap';
    const p = pleasantryOf(piece);
    if (!p) return undefined;
    // a pleasantry in talk is natural conversation; unknown, it is left alone
    if (this.opts.exchange && TALK.has(this.opts.exchange)) return undefined;
    if (p === 'pleasantry' && !this.opts.exchange) return undefined;
    return 'pleasantry';
  }

  /** A held recap may go only when it is last, says nothing the reply has not, and the reply is long enough to have a recap. */
  private recapFits(h: Held): boolean {
    const rest = recapOf(h.text);
    if (!rest || !this.out.trim() || !englishDominant(this.out)) return false;
    const said = sentencesOf(this.out.replace(/```[\s\S]*?```/g, ' ')).map((x) => x.trim()).filter(Boolean);
    if (said.length + 1 < 3) return false;
    // nothing new: every figure in it was already given, and its own terms are
    // covered. similarity() (inside classify) divides by the SHORTER text's
    // terms, so a long recap that adds a caveat ("…but only if you never need
    // weekend support, which costs $15 extra") scored as covered by a short
    // reply; the coverage is read from the recap's side here as well.
    const whole = said.join(' ');
    const figures = (t: string) => t.match(/\d+(?:[.,]\d+)*/g) ?? [];
    const given = new Set(figures(whole));
    if (figures(rest).some((n) => !given.has(n))) return false;
    const terms = conceptTerms(rest);
    const known = conceptTerms(whole);
    let covered = 0;
    for (const t of terms) if (known.has(t)) covered++;
    if (terms.size && covered / terms.size < REDUNDANT_AT) return false;
    return classify(rest.trim(), [...said, whole]).verdict === 'REDUNDANT';
  }

  /** A held sentence: is it what more exposition was waiting for? */
  /**
   * More exposition followed what was held: it was rhetorical (a question) or
   * mid-reply (an offer-shaped sentence), and goes out in order. Only
   * TRAILING offers and over-budget questions are ever dropped (council D4)
   * — nothing is removed from the middle of a reply.
   */
  private flushHeldInline() {
    if (!this.held.length) return;
    const held = this.held;
    this.held = [];
    for (const h of held) this.send(h.text);
  }

  private send(s: string) {
    if (this.afterBlock) {
      // at most one blank line after a block, however its breaks arrived
      if (/\n\n$/.test(this.out)) s = s.replace(/^(?:[ \t]*\n)+/, '');
      if (s.trim()) this.afterBlock = false;
    }
    if (!s) return;
    this.out += s;
    this.emit(s);
  }

  /** A piece that is only whitespace, kept to at most one blank line at the end of what was sent. */
  private capBlank(s: string): string {
    if (!/\n/.test(s)) return s;
    const trailing = /\n*$/.exec(this.out.replace(/[ \t]+$/, ''))?.[0].length ?? 0;
    return '\n'.repeat(Math.min((s.match(/\n/g) ?? []).length, Math.max(0, 2 - trailing)));
  }

  /** A finished fenced block: through the block hook, if there is one, and always on a line of its own. */
  private sendBlock(chunk: string, open = false) {
    if (this.leadOpen) {
      this.closeLead(null, true);
    }
    this.flushHeldInline();
    this.afterDrop = null;
    const kind = this.opts.block ? uiKind(chunk) : null;
    const out = this.opts.block ? this.opts.block(chunk, open) : chunk;
    // a ```ui block the hook did not send as a block was dropped (or replaced by a notice)
    if (kind && !/```ui\b/i.test(out)) {
      this.blocks[kind] = (this.blocks[kind] ?? 0) + 1;
      this.afterDrop = kind;
    }
    // what follows a block starts a line of its own; a draft that was about to begin is the block's
    if (this.draft === 'armed') this.draft = 'none';
    this.lineHead = '';
    this.lastWasItem = false;
    if (!out) return;
    // a fence the reader can find starts a line; one glued to a sentence is read as text
    const lead = out.startsWith('```') && this.out && !this.out.endsWith('\n') ? '\n\n' : '';
    this.send(lead + out);
    this.afterBlock = true;
  }

  /**
   * End of stream: the trailing held sentences ship only within the budget,
   * and never a question that re-asks something already considered (the
   * one deletion word overlap may make on its own — council D9).
   * Returns what was dropped.
   */
  finish(maxQuestions: 0 | 1, considered: readonly string[] = []): string[] {
    // a stream that ended inside a fenced block: the hook decides (a cut-off
    // inline spec is dropped; other code goes out as it was)
    if (this.inCode && this.opts.block && this.buf.trim()) this.sendBlock(this.buf, true);
    else if (this.buf.trim()) this.consider(this.buf);
    this.buf = '';
    this.inCode = false;
    // a lead still held at the end has nothing after it: it all goes out
    if (this.leadOpen) this.closeLead(null);
    const held = this.held;
    this.held = [];
    // The interrogatives first, in order, as the budget has always read them.
    const fate: ('send' | 'drop' | 'tail')[] = [];
    let allowed = maxQuestions;
    for (const h of held) {
      if (h.tail) {
        fate.push('tail');
        continue;
      }
      // "Hope this helps, and good luck!" — good luck is meant; it stays
      if (h.offer && !h.question && /\bgood luck\b/i.test(h.text)) {
        fate.push('send');
        continue;
      }
      const reasked = considered.length > 0 && classify(h.text.trim(), considered).verdict === 'REDUNDANT';
      if (!h.offer && !reasked && allowed > 0) {
        allowed--;
        fate.push('send');
      } else fate.push('drop');
    }
    // Then the filler held for the tail, from the end: it is trailing only
    // while nothing after it is going out.
    let trailing = true;
    for (let i = held.length - 1; i >= 0; i--) {
      if (fate[i] === 'send') trailing = false;
      if (fate[i] !== 'tail') continue;
      const h = held[i];
      const fits = trailing && !!this.out.trim() && englishDominant(this.out) && (h.tail === 'recap' ? this.recapFits(h) : true);
      const cls: TrimClass = h.tail === 'recap' ? 'recap' : 'pleasantry';
      if (fits && APPLIED[this.mode].has(cls)) {
        fate[i] = 'drop';
        this.removed[cls]++;
      } else {
        if (fits && this.mode !== 'off') this.would[cls]++;
        fate[i] = 'send';
        trailing = false;
      }
    }
    const dropped: string[] = [];
    held.forEach((h, i) => {
      if (fate[i] === 'send') this.send(h.text);
      else {
        dropped.push(h.text.trim());
        if (!h.tail) h.offer ? this.removed.offer++ : this.removed.question++;
      }
    });
    // NOT NOTHING, WHERE THE SURFACE ASKS FOR IT (Logos). A reply that was
    // nothing but closing offers — "How can I help you today?" and no more —
    // would reach the person as an empty turn, which is worse than the line;
    // the offers go out as written. Never a question over the budget: a limit
    // they set holds even then. Core 4 keeps its own rule (council D4): a
    // draft that is only a question it may not ask sends nothing.
    if (this.opts.neverEmpty && !this.out.trim() && dropped.length) {
      const offers = held.filter((h, i) => fate[i] === 'drop' && (h.offer || h.tail));
      for (const h of offers) this.send(h.text);
      this.removed.offer -= offers.filter((h) => !h.tail).length;
      const sent = new Set(offers.map((h) => h.text.trim()));
      return dropped.filter((d) => !sent.has(d));
    }
    return dropped;
  }
}
