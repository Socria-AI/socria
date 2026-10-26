// lib/write/voice-edit.ts — THEIR WRITING, EDITED IN WORDS.
//
// The writing is theirs (lib/logos-sessions.ts LogosDraft: "Logos never
// writes into it"). These are not Socria writing in it: they are the person's
// own edits, said instead of typed — which is what Socria Voice needs to
// create, edit and format a document without a keyboard, and what works typed
// in the conversation too while the writing is open:
//
//   add       "add a heading called Results", "type: the sample was small",
//             "add a bullet: check the totals"
//   shape     "make that a heading", "make the last paragraph a bullet list",
//             "turn it into a quote"
//   format    "bold that", "italicize the last sentence", "underline it"
//   change    "change that heading to Methods", "replace rent with housing",
//             "change the title to Field notes"
//   delete    "delete that paragraph", "delete the last sentence" — Socria
//             Voice asks first (lib/voice/risk.ts)
//   dictate   with dictation on, what is said is written, with "new
//             paragraph", "new line" and spoken punctuation ("comma",
//             "period", "question mark")
//
// "That", "it" and "this" mean the block last edited this way, else the one
// the caret is in, else the last one with words. Every edit is a new document
// returned whole, so the Writing Space commits it as one undo step
// (components/write/WriteSpace.tsx apply) and "undo" takes it back.
//
// PURE.

import { emptyBlock, isHeading, isList, isTextType, replaceBlock, replaceText, spliceBlock, textBlocks, toggleMark, type Block, type BlockType, type WriteDoc } from './doc';

export type DocTarget =
  /** "that", "it", "this" — and "that heading": the heading it is, or the one over it */
  { kind: 'that'; of?: 'heading' } | { kind: 'last'; of: 'paragraph' | 'heading' | 'item' | 'any' } | { kind: 'first'; of: 'heading' } | { kind: 'heading'; text: string } | { kind: 'sentence' };

export type DocCommand =
  | { op: 'append'; t: BlockType; text: string }
  | { op: 'retype'; target: DocTarget; t: BlockType }
  | { op: 'mark'; target: DocTarget; mark: 'b' | 'i' | 'u' | 's' }
  | { op: 'retext'; target: DocTarget; text: string }
  | { op: 'title'; text: string }
  | { op: 'replace'; find: string; with: string }
  | { op: 'delete'; target: DocTarget }
  /** the edit without the words it needs ("change that heading"): asked, and the next words answer it */
  | { op: 'ask'; question: string; fill: string };

export interface DocContext {
  /** the block "that" means: the one last edited in words, else the one the caret is in */
  that?: string | null;
}

export type DocResult = { doc: WriteDoc; said: string; block: string | null } | { refused: string; fill?: string };

const LEAD = String.raw`^(?:(?:please|can you|could you|now|and|ok|okay)\s+)*`;
const Q = String.raw`["“'‘]?`;
const QE = String.raw`["”'’]?`;
const TARGET = String.raw`(that|it|this|that (?:paragraph|heading|line|item|block|sentence)|this (?:paragraph|heading|line|item|block)|the last (?:paragraph|line|block|item|heading|sentence)|the first heading|the heading ${Q}(.+?)${QE})`;
const KIND = String.raw`(heading(?: (?:one|two|three|1|2|3))?|title|subheading|sub heading|paragraph|normal text|plain text|body text|bullet(?: point)?|bulleted list|bullet list|list item|list|numbered list|numbered item|number list|quote|quotation)`;

const RX = {
  // "type …" and "write down …" take what follows; "insert" only words said to be words ("insert a table" is not a sentence to write)
  type: new RegExp(`${LEAD}(?:type(?!\\s+of\\b)|write down|put down|insert the (?:words|text)|insert[:,])[:,]?\\s+(.+)$`, 'i'),
  para: new RegExp(`${LEAD}add (?:a |another |one more )?(?:new )?(?:paragraph|line|sentence)(?:\\s+(?:saying|that says|reading))?[:,]?\\s+(.+)$`, 'i'),
  head: new RegExp(`${LEAD}add (?:a |another |one more )?(?:new )?(title|heading|subheading|sub heading|section heading|section)(?:\\s+(?:called|named|saying))?[:,]?\\s+(.+)$`, 'i'),
  bullet: new RegExp(`${LEAD}add (?:a |another |one more )?(?:new )?(bullet(?: point)?|list item|item)(?:\\s+(?:saying|that says))?[:,]?\\s+(.+)$`, 'i'),
  numbered: new RegExp(`${LEAD}add (?:a |another |one more )?numbered (?:item|point|step)[:,]?\\s+(.+)$`, 'i'),
  quote: new RegExp(`${LEAD}add (?:a |another )?(?:quote|quotation)[:,]?\\s+(.+)$`, 'i'),
  retype: new RegExp(`${LEAD}(?:make|turn|change|set)\\s+${TARGET}\\s+(?:into\\s+|to\\s+|as\\s+)?(?:a\\s+|an\\s+)?${KIND}$`, 'i'),
  mark: new RegExp(`${LEAD}(bold|embolden|italici[sz]e|italic|underline|strike(?: ?through)?|cross out)\\s*${TARGET}?$`, 'i'),
  markAs: new RegExp(`${LEAD}make\\s+${TARGET}\\s+(bold|italic|italics|underlined|crossed out)$`, 'i'),
  retext: new RegExp(`${LEAD}(?:change|rename|retitle|reword|rewrite)\\s+(that|this|the|the last|the first) heading\\s+(?:to|into|as)\\s+${Q}(.+?)${QE}$`, 'i'),
  retextAsk: new RegExp(`${LEAD}(?:change|rename|retitle|reword|rewrite)\\s+(that|this|the|the last|the first) heading[.!?]?$`, 'i'),
  retextNamed: new RegExp(`${LEAD}(?:change|rename|retitle)\\s+the heading\\s+${Q}(.+?)${QE}\\s+(?:to|into|as)\\s+${Q}(.+?)${QE}$`, 'i'),
  retextThat: new RegExp(`${LEAD}(?:change|replace)\\s+(that|it|this)\\s+(?:to|with)\\s+${Q}(.+?)${QE}$`, 'i'),
  title: new RegExp(`${LEAD}(?:change|set|rename) (?:the |my )?(?:document |doc |essay |writing )?title to\\s+${Q}(.+?)${QE}$`, 'i'),
  titleName: new RegExp(`${LEAD}(?:call|title|name) (?:the |my |this )(?:document|doc|essay|writing|draft)\\s+${Q}(.+?)${QE}$`, 'i'),
  replace: new RegExp(`${LEAD}replace\\s+${Q}(.+?)${QE}\\s+with\\s+${Q}(.+?)${QE}$`, 'i'),
  del: new RegExp(`${LEAD}(?:delete|remove|erase|cut)\\s+${TARGET}$`, 'i'),
};

function targetOf(phrase: string, named?: string): DocTarget {
  const p = phrase.toLowerCase();
  if (named) return { kind: 'heading', text: named };
  if (/^the last sentence$|^that sentence$/.test(p)) return { kind: 'sentence' };
  if (/^the last heading$/.test(p)) return { kind: 'last', of: 'heading' };
  if (/^the first heading$/.test(p)) return { kind: 'first', of: 'heading' };
  if (/^the last paragraph$/.test(p)) return { kind: 'last', of: 'paragraph' };
  if (/^the last item$/.test(p)) return { kind: 'last', of: 'item' };
  if (/^the last (?:line|block)$/.test(p)) return { kind: 'last', of: 'any' };
  return { kind: 'that' };
}

/** "that heading", "the last heading", "the first heading" — "the heading" is the one meant now, else the last. */
function headingOf(which: string): DocTarget {
  const w = which.toLowerCase();
  return w === 'the first' ? { kind: 'first', of: 'heading' } : w === 'the last' ? { kind: 'last', of: 'heading' } : { kind: 'that', of: 'heading' };
}

function kindOf(word: string): BlockType {
  const w = word.toLowerCase();
  if (/^(?:title|heading (?:one|1))$/.test(w)) return 'h1';
  if (/^heading (?:three|3)$|^sub ?heading$/.test(w)) return 'h3';
  if (/^heading/.test(w)) return 'h2';
  if (/^(?:paragraph|normal text|plain text|body text)$/.test(w)) return 'p';
  if (/^(?:numbered|number)/.test(w)) return 'ol';
  if (/^(?:quote|quotation)$/.test(w)) return 'quote';
  return 'ul';
}

/** Words said to be written: quotes off, and a capital to start — unless the word is already cased its own way ("iPhone"). */
const clean = (s: string) => {
  const t = s
    .replace(/\s+/g, ' ')
    .replace(/^["“'‘]|["”'’]$/g, '')
    .trim();
  return /^[a-z](?![A-Z])/.test(t) ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};
/** A name to find in the writing, as said: compared without case, so left as it came. */
const name = (s: string) =>
  s
    .replace(/\s+/g, ' ')
    .replace(/^["“'‘]|["”'’]$/g, '')
    .trim();

/** The edit a turn asks of their writing, or null. */
export function readDocCommand(text: string): DocCommand | null {
  const t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!t || t.length > 1500) return null;
  let m: RegExpExecArray | null;
  if ((m = RX.retextNamed.exec(t))) return { op: 'retext', target: { kind: 'heading', text: name(m[1]) }, text: clean(m[2]) };
  if ((m = RX.retext.exec(t))) return { op: 'retext', target: headingOf(m[1]), text: clean(m[2]) };
  if ((m = RX.retextAsk.exec(t))) return { op: 'ask', question: 'What should the heading say?', fill: `change ${m[1].toLowerCase()} heading to {}` };
  if ((m = RX.title.exec(t)) || (m = RX.titleName.exec(t))) return { op: 'title', text: clean(m[1]) };
  if ((m = RX.replace.exec(t))) return { op: 'replace', find: name(m[1]), with: name(m[2]) };
  if ((m = RX.retype.exec(t))) return { op: 'retype', target: targetOf(m[1], m[2]), t: kindOf(m[3]) };
  if ((m = RX.markAs.exec(t))) return { op: 'mark', target: targetOf(m[1], m[2]), mark: /^bold/i.test(m[3]) ? 'b' : /^ital/i.test(m[3]) ? 'i' : /^under/i.test(m[3]) ? 'u' : 's' };
  if ((m = RX.mark.exec(t)))
    return { op: 'mark', target: m[2] ? targetOf(m[2], m[3]) : { kind: 'that' }, mark: /^(?:bold|embolden)/i.test(m[1]) ? 'b' : /^ital/i.test(m[1]) ? 'i' : /^under/i.test(m[1]) ? 'u' : 's' };
  if ((m = RX.del.exec(t))) return { op: 'delete', target: targetOf(m[1], m[2]) };
  if ((m = RX.retextThat.exec(t))) return { op: 'retext', target: { kind: 'that' }, text: clean(m[2]) };
  if ((m = RX.head.exec(t))) return { op: 'append', t: /^title$/i.test(m[1]) ? 'h1' : /^sub ?heading$/i.test(m[1]) ? 'h3' : 'h2', text: clean(m[2]) };
  if ((m = RX.numbered.exec(t))) return { op: 'append', t: 'ol', text: clean(m[1]) };
  if ((m = RX.bullet.exec(t))) return { op: 'append', t: 'ul', text: clean(m[2]) };
  if ((m = RX.quote.exec(t))) return { op: 'append', t: 'quote', text: clean(m[1]) };
  if ((m = RX.para.exec(t)) || (m = RX.type.exec(t))) return { op: 'append', t: 'p', text: clean(m[1]) };
  return null;
}

// ── applying ─────────────────────────────────────────────────────────

const has = (b: Block) => isTextType(b.t) && !!b.text.trim();
const quoted = (s: string) => `“${s.length > 50 ? `${s.slice(0, 47)}…` : s}”`;
const KIND_SAID: Partial<Record<BlockType, string>> = { h1: 'a title', h2: 'a heading', h3: 'a subheading', p: 'a paragraph', ul: 'a bullet', ol: 'a numbered item', quote: 'a quote' };
const MARK_SAID = { b: 'bold', i: 'in italics', u: 'underlined', s: 'struck through' } as const;
const normal = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** The block a target means, or null. */
export function blockFor(doc: WriteDoc, target: DocTarget, ctx: DocContext = {}): Block | null {
  const top = doc.blocks;
  const lastOf = (ok: (b: Block) => boolean) => [...top].reverse().find((b) => ok(b) && has(b)) ?? null;
  switch (target.kind) {
    case 'that': {
      const b = ctx.that ? top.find((x) => x.id === ctx.that) : null;
      if (target.of === 'heading') {
        if (b && isHeading(b.t)) return b;
        // the heading over the block meant — the section it is in — else the last heading
        for (let j = b ? top.indexOf(b) : -1; j >= 0; j--) if (isHeading(top[j].t) && has(top[j])) return top[j];
        return lastOf((x) => isHeading(x.t));
      }
      return b && isTextType(b.t) ? b : lastOf(() => true);
    }
    case 'sentence':
      return lastOf((b) => b.t === 'p' || isList(b.t) || b.t === 'quote');
    case 'first':
      return top.find((b) => isHeading(b.t) && has(b)) ?? null;
    case 'heading': {
      const want = normal(target.text);
      return top.find((b) => isHeading(b.t) && normal(b.text) === want) ?? top.find((b) => isHeading(b.t) && normal(b.text).includes(want)) ?? null;
    }
    case 'last':
      return target.of === 'heading' ? lastOf((b) => isHeading(b.t)) : target.of === 'paragraph' ? lastOf((b) => b.t === 'p') : target.of === 'item' ? lastOf((b) => isList(b.t)) : lastOf(() => true);
  }
}

/** Where the last sentence of a block is: [start, end). */
function lastSentence(text: string): [number, number] {
  const end = text.replace(/\s+$/, '').length;
  const body = text.slice(0, end);
  const cut = body.slice(0, -1).search(/[.!?]["”’)]?\s+[^\s]*[^.!?]*$/);
  const start = cut >= 0 ? body.indexOf(' ', cut) + 1 : 0;
  return [Math.max(0, start), end];
}

/** A new block of words put after `after` (or at the end), the document's lone empty line used rather than left. */
function insertAfter(doc: WriteDoc, block: Block, after: string | null | undefined): WriteDoc {
  const lone = doc.blocks.length === 1 && isTextType(doc.blocks[0].t) && !doc.blocks[0].text.trim();
  if (lone) return { ...doc, blocks: [block] };
  const i = after ? doc.blocks.findIndex((b) => b.id === after) : -1;
  const at = i >= 0 ? i + 1 : doc.blocks.length;
  return { ...doc, blocks: [...doc.blocks.slice(0, at), block, ...doc.blocks.slice(at)] };
}

/** The words a delete would take away — what Socria Voice asks about first. */
export function docDeleteOf(doc: WriteDoc, cmd: DocCommand, ctx: DocContext = {}): string | null {
  if (cmd.op !== 'delete') return null;
  const b = blockFor(doc, cmd.target, ctx);
  if (!b) return null;
  if (cmd.target.kind === 'sentence') {
    const [s, e] = lastSentence(b.text);
    return b.text.slice(s, e) || null;
  }
  return b.text || null;
}

/** The edit, applied: the new document, what was done, and the block it touched (what "that" means next). */
export function applyDocCommand(doc: WriteDoc, cmd: DocCommand, ctx: DocContext = {}): DocResult {
  const now = Date.now();
  const stamp = (d: WriteDoc): WriteDoc => ({ ...d, updatedAt: now });
  switch (cmd.op) {
    case 'ask':
      return { refused: cmd.question, fill: cmd.fill };
    case 'append': {
      if (!cmd.text) return { refused: 'Say what to write.' };
      const block: Block = { ...emptyBlock(cmd.t), text: cmd.text, ...(isList(cmd.t) ? { lvl: 1 } : {}) };
      return { doc: stamp(insertAfter(doc, block, ctx.that)), said: `Added ${KIND_SAID[cmd.t] ?? 'a block'} to your writing: ${quoted(cmd.text)}.`, block: block.id };
    }
    case 'title':
      if (!cmd.text) return { refused: 'Say what the title should be.' };
      return { doc: stamp({ ...doc, title: cmd.text.slice(0, 200) }), said: `Titled your writing ${quoted(cmd.text)}.`, block: ctx.that ?? null };
    case 'replace': {
      if (!cmd.find) return { refused: 'Say what to replace.' };
      const rx = new RegExp(cmd.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      let next = doc;
      let n = 0;
      for (const b of textBlocks(doc)) {
        const hits = [...b.text.matchAll(rx)];
        if (!hits.length) continue;
        let nb = b;
        for (const h of hits.reverse()) nb = spliceBlock(nb, h.index ?? 0, (h.index ?? 0) + h[0].length, cmd.with);
        next = replaceText(next, nb);
        n += hits.length;
      }
      if (!n) return { refused: `${quoted(cmd.find)} is not in your writing.` };
      return { doc: stamp(next), said: `Replaced ${quoted(cmd.find)} with ${quoted(cmd.with)}${n > 1 ? ` (${n} times)` : ''}.`, block: ctx.that ?? null };
    }
  }
  const b = blockFor(doc, cmd.target, ctx);
  if (!b) return { refused: cmd.target.kind === 'heading' ? `There is no heading called ${quoted(cmd.target.text)} in your writing.` : 'There is nothing in your writing for that yet.' };
  switch (cmd.op) {
    case 'retype': {
      const next: Block = { ...b, t: cmd.t, ...(isList(cmd.t) ? { lvl: b.lvl ?? 1 } : { lvl: undefined }) };
      return { doc: stamp(replaceBlock(doc, next)), said: `Made ${quoted(b.text)} ${KIND_SAID[cmd.t] ?? 'that'}.`, block: b.id };
    }
    case 'mark': {
      const [s, e] = cmd.target.kind === 'sentence' ? lastSentence(b.text) : [0, b.text.length];
      const next = toggleMark(b, s, e, cmd.mark);
      const on = (next.marks ?? []).some((m) => m.t === cmd.mark && m.s <= s && m.e >= e);
      return {
        doc: stamp(replaceBlock(doc, next)),
        said: `${on ? 'Made' : 'Took off'} ${MARK_SAID[cmd.mark]}${on ? '' : ' from'} ${quoted(b.text.slice(s, e))}.`
          .replace('Took off bold from', 'Took the bold off')
          .replace('Took off in italics from', 'Took the italics off')
          .replace('Took off underlined from', 'Took the underline off')
          .replace('Took off struck through from', 'Took the strike-through off'),
        block: b.id,
      };
    }
    case 'retext': {
      if (!cmd.text) return { refused: 'Say what it should say.' };
      const next = spliceBlock(b, 0, b.text.length, cmd.text);
      return { doc: stamp(replaceBlock(doc, next)), said: `Changed ${quoted(b.text)} to ${quoted(cmd.text)}.`, block: b.id };
    }
    case 'delete': {
      if (cmd.target.kind === 'sentence') {
        const [s, e] = lastSentence(b.text);
        const next = spliceBlock(b, s, e, '');
        const gone = b.text.slice(s, e);
        const kept = next.text.trim() ? replaceBlock(doc, { ...next, text: next.text.replace(/\s+$/, '') }) : { ...doc, blocks: doc.blocks.filter((x) => x.id !== b.id) };
        return { doc: stamp(kept.blocks.length ? kept : { ...kept, blocks: [emptyBlock()] }), said: `Deleted ${quoted(gone)}.`, block: next.text.trim() ? b.id : null };
      }
      const blocks = doc.blocks.filter((x) => x.id !== b.id);
      return { doc: stamp({ ...doc, blocks: blocks.length ? blocks : [emptyBlock()] }), said: `Deleted ${quoted(b.text)} from your writing.`, block: null };
    }
  }
}

// ── dictation ────────────────────────────────────────────────────────

const PUNCT: [RegExp, string][] = [
  [/\s*\b(?:full stop|period)\b/gi, '.'],
  [/\s*\bcomma\b/gi, ','],
  [/\s*\bquestion mark\b/gi, '?'],
  [/\s*\bexclamation (?:mark|point)\b/gi, '!'],
  [/\s*\bsemicolon\b/gi, ';'],
  [/\s*\bcolon\b/gi, ':'],
];

/** What dictation writes: the words, spoken punctuation made punctuation, "new paragraph" a new block, "new line" a line break. */
export function dictationParts(raw: string): { text: string; newBlock: boolean }[] {
  const out: { text: string; newBlock: boolean }[] = [];
  const pieces = String(raw ?? '').split(/\s*\b(?:new|next) paragraph\b[.,]?\s*/i);
  pieces.forEach((p, i) => {
    let t = p;
    for (const [rx, mark] of PUNCT) t = t.replace(rx, mark);
    t = t
      .replace(/\s*\bnew line\b[.,]?\s*/gi, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ +([.,;:!?])/g, '$1')
      .trim();
    // a sentence after punctuation that ends one begins with a capital
    t = t.replace(/([.!?]\s+)([a-z])/g, (_, a: string, c: string) => a + c.toUpperCase());
    if (t || i > 0) out.push({ text: t, newBlock: i > 0 });
  });
  return out.filter((x) => x.text || x.newBlock);
}

export interface DictationContext {
  /** the paragraph being dictated into — continued, until "new paragraph" */
  into?: string | null;
  /** where a new paragraph goes: after this block (the one the caret is in), else at the end */
  after?: string | null;
}

/** A word that keeps its capital wherever it falls: "I", "I'm", "I've"… */
const ALWAYS_CAPITAL = /^I(?:\b|['’])/;

/**
 * Dictated words, written. The first of a dictation starts a paragraph of its
 * own — after the block the caret is in, else at the end — and what follows
 * continues it, with a space and in mid-sentence lower case, until "new
 * paragraph" starts the next. Returns the paragraph being dictated into.
 */
export function dictate(doc: WriteDoc, raw: string, ctx: DictationContext = {}): DocResult {
  const parts = dictationParts(raw);
  if (!parts.length) return { refused: 'Nothing was heard to write.' };
  let next = doc;
  let at = ctx.into && doc.blocks.some((b) => b.id === ctx.into && isTextType(b.t)) ? ctx.into : null;
  let after = ctx.after && doc.blocks.some((b) => b.id === ctx.after) ? ctx.after : null;
  let words = 0;
  for (const part of parts) {
    const cur = at ? next.blocks.find((b) => b.id === at) : null;
    if (!part.newBlock && cur && isTextType(cur.t)) {
      const ends = /[.!?]["”’)]?\s*$/.test(cur.text) || !cur.text.trim();
      // mid-sentence, the recogniser's capital comes off; a new sentence keeps it
      const text = !ends && /^[A-Z][a-z]/.test(part.text) && !ALWAYS_CAPITAL.test(part.text) ? part.text.charAt(0).toLowerCase() + part.text.slice(1) : part.text;
      const join = cur.text && !/\s$/.test(cur.text) && text && !/^[.,;:!?]/.test(text) ? ' ' : '';
      next = replaceBlock(next, spliceBlock(cur, cur.text.length, cur.text.length, join + text));
    } else {
      const text = /^[a-z]/.test(part.text) ? part.text.charAt(0).toUpperCase() + part.text.slice(1) : part.text;
      const nb: Block = { ...emptyBlock('p'), text };
      next = insertAfter(next, nb, at ?? after);
      at = nb.id;
      after = nb.id;
    }
    words += part.text.split(/\s+/).filter(Boolean).length;
  }
  return { doc: { ...next, updatedAt: Date.now() }, said: `Wrote ${words} word${words === 1 ? '' : 's'}.`, block: at };
}
