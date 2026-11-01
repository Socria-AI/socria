// lib/rich-text.ts
//
// How an assistant's prose becomes typography. Pure: no React, no DOM.
//
// Both surfaces write in the same small vocabulary — a bullet list, a
// numbered list, a little pipe table, a bold label, a word in emphasis — and
// until now only ONE of them could read it. Core grew a 200-line renderer
// inside app/chat/page.tsx; Logos had nothing at all, so a reply that used
// any of it arrived on screen as literal asterisks and hyphens. The model was
// not misbehaving. It was told (lib/logos.ts) that it may use structure when
// structure helps, and then the structure was printed rather than drawn.
//
// So the vocabulary lives here, once, and the two surfaces differ only in
// what the CSS makes of it.
//
// THE SPLIT. Parsing is here and rendering is in components/RichText.tsx,
// because parsing is where the bugs are and JSX cannot be tested by the
// plain-node harness in test/. Everything below returns plain data.

import { INLINE_KINDS, parseInlineSpec, type InlineSpec } from './inline-ui';

/** One run of inline text, and what it is. */
export interface Inline {
  kind: 'text' | 'em' | 'strong' | 'strong-em' | 'code';
  text: string;
}

export interface TableBlock {
  kind: 'table';
  header: string[];
  rows: string[][];
  /**
   * Logos 5's editorial reading (lib/reply-layout.ts): the table sets things
   * against each other on the same points — its first column names the
   * points — so it is drawn as a comparison, with row headers.
   */
  compare?: boolean;
}

export interface GroupsBlock {
  kind: 'groups';
  groups: { header: string | null; items: string[] }[];
  /** Logos 5's editorial reading: two to four short groups (Pros, Cons…) set side by side */
  side?: boolean;
}

/**
 * The sources a turn actually read, as cards rather than a column of URLs.
 *
 * WHY THE PARSER AND NOT A SIDE CHANNEL. The disclosure is written into the
 * reply itself (lib/core4/web.ts renderDisclosure) because that is what makes
 * it durable: it is stored with the message, it survives a reload, it is there
 * in an export. Reading it back out of the text keeps that property — the
 * transcript stays something a person can read, and the cards are a way of
 * DRAWING it rather than a second copy of it living somewhere else.
 */
export interface SourcesBlock {
  kind: 'sources';
  /** exactly what was searched for, where the disclosure said */
  query: string | null;
  items: { n: number; title: string; url: string }[];
}

/**
 * A list's items, and — rich reading only — what is nested under each.
 *
 * NESTING. A model that writes "- Hire an engineer" with "  - faster product"
 * and "  - burns runway" under it is saying the second two belong to the
 * first. Read flat, that hierarchy was lost and two options with their
 * consequences became six undifferentiated bullets, longer and harder to read
 * than what was written. `subs[i]` holds the lines under item i (empty when
 * there are none); it is present only when some item has any, so a plain list
 * is exactly what it always was. Only one level is kept: anything deeper is
 * read as part of the level above, because the page draws one muted run under
 * an item, not a tree.
 *
 * START. A numbered list remembers the number it began at, so a list that
 * picks up again after a paragraph ("3. …") is drawn as 3, not as 1 again.
 * Absent when it begins at 1.
 *
 * COMPACT (Logos 5's editorial reading only, lib/reply-layout.ts): a list of
 * many short items laid out in columns instead of a tall line each.
 */
export type Block =
  /** `split`: the rest of an opening paragraph whose first sentence was set apart as the lead (Logos 5's editorial reading only) */
  | { kind: 'p'; text: string; split?: boolean }
  | { kind: 'ul'; items: string[]; subs?: string[][]; compact?: boolean }
  | { kind: 'ol'; items: string[]; subs?: string[][]; start?: number }
  | GroupsBlock
  | TableBlock
  | SourcesBlock
  // ── RICH ONLY (Logos 5: parseBlocks(text, { rich: true })) ──
  | { kind: 'h'; level: 1 | 2 | 3; text: string }
  | { kind: 'code'; lang: string | null; text: string; open: boolean }
  | { kind: 'quote'; text: string }
  /**
   * An inline element (lib/inline-ui.ts): a ```ui block, its spec validated
   * here as well as on the server — null when it is not one of the six — and
   * `n`, its position among the reply's inline blocks, which keys its state.
   * `open` while the reply is still writing it.
   */
  | { kind: 'ui'; spec: InlineSpec | null; open: boolean; n: number; pending?: string }
  /**
   * A list read as labels and their text — never produced by parseBlocks
   * itself, only by Logos 5's editorial reading of a reply
   * (lib/reply-layout.ts editorialBlocks), which lays it out as terms. An item
   * with an empty label is one that came after the list had already been read
   * as terms and is not written that way: it is drawn as a plain row rather
   * than turning the whole list back into bullets (a list settles line by line
   * while it streams, so the decision is made once, from its first items).
   */
  | { kind: 'terms'; ordered: boolean; items: { label: string; body: string; sub?: string[] }[]; start?: number };

/**
 * RICH READING — Logos 5's thread, and nowhere else unless asked.
 *
 * The default stays what it always was: a stray `#` or a code fence is text.
 * With `rich`, three more shapes are read, because a workspace reply that
 * walks through a derivation or a plan uses them and printing the marks is
 * worse than drawing them: a heading (`#`–`###`), a fenced block (```), and a
 * quotation (`> `). Inline `code` is read too (splitInline with `code`). An
 * unclosed fence — a reply still streaming — is a code block to the end,
 * marked `open`, so the half-written block does not flash as prose.
 */
export interface ReadOptions {
  rich?: boolean;
}
const FENCE_RE = /^\s*```\s*([\w+#.-]{0,20})\s*$/;
/**
 * The ways a model actually writes an inline block that the strict shape
 * above does not read, each seen in a streamed reply:
 *
 *   ```ui {"type":"chart",…}```     the whole block on one line
 *   ```ui {"type":"chart",…         the JSON starting on the opening line
 *   …}```                           the closing fence at the end of a line
 *   ```Drag the slider…             a closing fence with the next sentence
 *                                   run straight onto it
 *
 * The server's stream gate is the first line of defence and normalises a
 * block before it is sent; this is the second, so a block that reaches the
 * page in one of these shapes is still drawn as the element it is — and the
 * words after it are still words — instead of the JSON appearing as prose.
 */
const UI_ONE_LINE_RE = /^\s*```[ \t]*ui[ \t]*(\{.*\})[ \t]*```[ \t]*(.*)$/i;
const UI_OPEN_INLINE_RE = /^\s*```[ \t]*ui[ \t]+(\{.*)$/i;
const CLOSE_RE = /^\s*```(?!`)[ \t]*(.*)$/;
const UI_CLOSE_INSIDE_RE = /^(.*\})[ \t]*```[ \t]*(.*)$/;
/**
 * a bare language tag after a closing fence is what it always was — the fence closing — not a sentence.
 * Tags are lower case: a capitalised word run on ("```Next") is the reply's next word, and is kept.
 */
const LANG_WORD_RE = /^[a-z][a-z0-9+#-]{0,19}$/;
/** Element kinds an open bare fence may still turn out to be: the vocabulary, and the kinds being added to it. */
const ARRIVING_KINDS: readonly string[] = [...INLINE_KINDS, 'diagram', 'balance', 'equation'];
/**
 * Whether what an open fence holds so far could still be an inline element's
 * spec: nothing yet, or JSON that opens on its "type" naming (or still
 * spelling) an element kind. A bare fence of ordinary JSON — a package.json,
 * an API's reply, `"type": "module"` — is code from its first key on: it was
 * drawn as an element's placeholder, its text nowhere on the page, for as long
 * as it was written, and for good in a reply that stopped inside it.
 */
function mayBeSpec(said: string): boolean {
  if (!said) return true;
  if (!said.startsWith('{')) return false;
  const rest = said.slice(1).trimStart();
  // still writing its first key
  if ('"type"'.startsWith(rest)) return true;
  const m = /^"type"\s*:?\s*("?)([a-z]*)("?)/.exec(rest);
  if (!m) return false;
  const [all, q1, word, q2] = m;
  // the kind named in full: one of the vocabulary's
  if (q1 && q2) return ARRIVING_KINDS.includes(word);
  // still being spelled, with nothing written after it yet
  return all.length === rest.length && (!word || ARRIVING_KINDS.some((k) => k.startsWith(word)));
}
const HEADING_RE = /^(#{1,3})\s+(\S.*)$/;
const QUOTE_RE = /^\s*>\s?(.*)$/;

// ── inline ───────────────────────────────────────────────────────────

/**
 * The one regular expression, and the reason it is not the obvious one.
 *
 * It used to say bold is two asterisks, then one or more characters that are
 * neither an asterisk nor a newline, then two asterisks. Three ordinary
 * things break on that, and all three put raw asterisks on screen:
 *
 *   ***emphatic***        the `**` alternative fails on the third asterisk,
 *                         the `*` one then matches the middle, and the outer
 *                         asterisks are printed
 *   **a *word* inside**   the inner emphasis ends the bold early
 *   **a label that
 *   wraps a line**        a newline is not allowed at all
 *
 * So: three alternatives, longest first, each non-greedy. Bold may cross a
 * single line break but never a blank one — an unclosed `**` at the end of a
 * streaming reply must not swallow everything after it, and a blank line is
 * the boundary no sentence crosses. Emphasis stays single-line, because a
 * `*` at the start of a line is a bullet, not an opening mark.
 */
const INLINE_SOURCE =
  /\*\*\*([^*\n]+)\*\*\*|\*\*((?:[^*\n]|\n(?!\s*\n)|\*(?!\*))+?)\*\*|\*([^*\n]+)\*/
    .source;

/**
 * A FRESH one per call, never a shared module-level constant.
 *
 * splitInline recurses — bold carrying emphasis inside it re-enters — and a
 * `/g` regex carries `lastIndex` on the object itself. Sharing one meant the
 * inner call moved the outer call's cursor, which did not throw or return
 * something wrong: it looped for ever on the first reply that used both marks
 * together. Reentrancy is the whole reason this is a function.
 */
function inlineRe(): RegExp {
  return new RegExp(INLINE_SOURCE, 'g');
}

/**
 * Text as a flat run of typed segments.
 *
 * Flat rather than nested: `**a *word* inside**` becomes strong / strong-em /
 * strong, so a caller never has to recurse to render it. Emphasis inside bold
 * is the only nesting the vocabulary has, and it is common enough — a label
 * with the one word that matters inside it — to be worth handling rather than
 * dropping.
 */
export function splitInline(input: string, opts: { code?: boolean } = {}): Inline[] {
  const text = typeof input === 'string' ? input : '';
  // Inline code first, when asked: what is inside backticks is never read for marks.
  if (opts.code && text.includes('`')) {
    const parts: Inline[] = [];
    const re = /`([^`\n]+)`/g;
    let at = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (m.index > at) parts.push(...splitInline(text.slice(at, m.index)));
      parts.push({ kind: 'code', text: m[1] });
      at = m.index + m[0].length;
    }
    if (at < text.length) parts.push(...splitInline(text.slice(at)));
    return parts;
  }
  const out: Inline[] = [];
  const push = (kind: Inline['kind'], body: string) => {
    if (!body) return;
    const last = out[out.length - 1];
    // Adjacent runs of the same kind are one run: fewer DOM nodes, and a
    // selection that spans them copies as one piece of text.
    if (last && last.kind === kind) last.text += body;
    else out.push({ kind, text: body });
  };

  const re = inlineRe();
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) push('text', text.slice(last, m.index));
    if (m[1] !== undefined) {
      push('strong-em', m[1]);
    } else if (m[2] !== undefined) {
      // Bold, which may carry emphasis inside it.
      for (const inner of splitInline(m[2])) {
        push(inner.kind === 'em' ? 'strong-em' : 'strong', inner.text);
      }
    } else {
      push('em', m[3]);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) push('text', text.slice(last));
  return out;
}

/** Every mark removed, for somewhere that can only hold plain text. */
export function stripMarks(s: string): string {
  return splitInline(s)
    .map((p) => p.text)
    .join('')
    .trim();
}

// ── blocks ───────────────────────────────────────────────────────────

const BULLET_RE = /^\s*([-•]|\*)\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/;
/** How far a line is indented, a tab counted as two spaces. */
const indentOf = (l: string): number => (l.match(/^[ \t]*/)?.[0] ?? '').replace(/\t/g, '  ').length;

/** A heading row followed by a `|---|` rule is a table and nothing else is. */
function startsTable(lines: string[], i: number): boolean {
  return (
    lines[i].includes('|') &&
    i + 1 < lines.length &&
    TABLE_SEP_RE.test(lines[i + 1]) &&
    lines[i + 1].includes('-')
  );
}

/**
 * One line read as a list item — its mark, its words, how far in it sits —
 * or null when it is not one. For a reply still streaming
 * (lib/reply-layout.ts), which draws the line being written inside the list
 * it belongs to instead of as a run-on line of raw marks.
 */
export function listLine(line: string): { ordered: boolean; text: string; indent: number; n: number } | null {
  if (BULLET_RE.test(line)) return { ordered: false, text: line.replace(BULLET_RE, '$2'), indent: indentOf(line), n: 0 };
  if (ORDERED_RE.test(line)) return { ordered: true, text: line.replace(ORDERED_RE, '$1'), indent: indentOf(line), n: Number(line.match(/^\s*(\d+)/)?.[1] ?? 1) };
  return null;
}

/** A table's `|---|---|` rule. */
export const isTableRule = (line: string): boolean => TABLE_SEP_RE.test(line) && line.includes('-');

export function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

/**
 * A bullet item is a group HEADER when it is a short label ending in a colon
 * — "Cost:", "**What it gives you:**" — rather than a point in its own right.
 * A list written that way is really a set of small sections, and drawing it
 * as one is the difference between a wall of bullets and something readable.
 */
export function isGroupHeader(item: string): boolean {
  const s = stripMarks(item);
  return /:$/.test(s) && s.length <= 42;
}

/**
 * Bullets that carry labels become titled groups; otherwise a plain list.
 * Exported for Logos 5's editorial reading, which joins a loose list — items
 * with blank lines between them, parsed as one list each — back into the one
 * list it is and reads it again.
 *
 * With nesting (`subs`): a list whose every item is a label with points under
 * it ("- **Pros:**" over "  - fast") is that set of groups, exactly as the flat
 * spelling of it always was. A list that mixes labels and points at the top
 * keeps the old reading, its nested points following their item, because
 * which group a nested point belongs to is then a guess.
 */
export function bulletBlock(items: string[], subs?: string[][]): Block {
  const nested = !!subs && subs.some((x) => x.length > 0);
  if (nested && items.every(isGroupHeader)) return { kind: 'groups', groups: items.map((h, k) => ({ header: h, items: subs![k] ?? [] })) };
  if (nested && items.some(isGroupHeader)) return bulletBlock(items.flatMap((it, k) => [it, ...(subs![k] ?? [])]));
  const labelled = items.some(isGroupHeader);
  const plain = items.some((it) => !isGroupHeader(it));
  if (!labelled || !plain) return nested ? { kind: 'ul', items, subs } : { kind: 'ul', items };

  const groups: GroupsBlock['groups'] = [];
  let cur: GroupsBlock['groups'][number] = { header: null, items: [] };
  for (const it of items) {
    if (isGroupHeader(it)) {
      if (cur.header || cur.items.length) groups.push(cur);
      cur = { header: it, items: [] };
    } else {
      cur.items.push(it);
    }
  }
  if (cur.header || cur.items.length) groups.push(cur);
  return { kind: 'groups', groups };
}


/**
 * A long item that wraps onto the next line belongs to that item.
 *
 * The rule is INDENTATION, and only indentation. An indented line following
 * an item continues it; an unindented one ends the list. Markdown itself is
 * laxer — it joins any following line — and that is the wrong trade here,
 * because the commonest shape in a reply is a list with a closing sentence
 * under it and no blank line between, and swallowing that sentence into the
 * last bullet is a worse failure than splitting a wrapped one.
 *
 * It matters beyond tidiness: blocks are read before marks are, so an item
 * split in two also splits any bold across it, and the asterisks are then
 * printed. That is how `**a label that wraps` arrived on screen with its
 * asterisks showing.
 */
/**
 * A list, read richly (Logos 5): its items, what is nested under each, and
 * the number it starts at. The rules are the flat reading's — an indented line
 * continues the item above, an unindented line that is not an item ends the
 * list — plus one: an item indented two or more spaces further than the
 * list's own items is nested under the item above it, whichever mark it uses
 * ("1. Plan it" over "   - book the room" is common). A mark of the other
 * kind at the list's own depth still ends it, as it always did.
 */
function richListAt(lines: string[], from: number): { block: Block; next: number } {
  const ordered = !BULLET_RE.test(lines[from]);
  const own = ordered ? ORDERED_RE : BULLET_RE;
  const base = indentOf(lines[from]);
  const items: string[] = [];
  const subs: string[][] = [];
  const startN = ordered ? Number(lines[from].match(/^\s*(\d+)/)?.[1] ?? 1) : 1;
  let i = from;
  let inSub = false;
  while (i < lines.length && lines[i].trim() !== '') {
    const l = lines[i];
    const marked = BULLET_RE.test(l) || ORDERED_RE.test(l);
    const depth = indentOf(l);
    if (marked && depth >= base + 2 && items.length) {
      subs[items.length - 1].push(l.replace(BULLET_RE.test(l) ? BULLET_RE : ORDERED_RE, BULLET_RE.test(l) ? '$2' : '$1'));
      inSub = true;
    } else if (marked && own.test(l) && depth < base + 2) {
      items.push(l.replace(own, ordered ? '$1' : '$2'));
      subs.push([]);
      inSub = false;
    } else if (!marked && /^\s{2,}\S/.test(l) && items.length) {
      const into = inSub ? subs[items.length - 1] : items;
      into[into.length - 1] += ' ' + l.trim();
    } else break;
    i++;
  }
  const nested = subs.some((x) => x.length > 0);
  if (!ordered) return { block: bulletBlock(items, nested ? subs : undefined), next: i };
  return { block: { kind: 'ol', items, ...(nested ? { subs } : {}), ...(startN !== 1 && Number.isFinite(startN) ? { start: startN } : {}) }, next: i };
}

function absorbContinuation(lines: string[], from: number, items: string[]): number {
  let i = from;
  while (
    i < lines.length &&
    lines[i].trim() !== '' &&
    /^\s{2,}\S/.test(lines[i]) &&
    !BULLET_RE.test(lines[i]) &&
    !ORDERED_RE.test(lines[i])
  ) {
    items[items.length - 1] += ' ' + lines[i].trim();
    i++;
  }
  return i;
}

/**
 * Prose as blocks.
 *
 * Deliberately not a markdown parser. It reads the handful of shapes the
 * models are actually asked for and leaves everything else as paragraphs —
 * which means a stray `#` or a code fence renders as the text it is rather
 * than as a surprise, and there is no third-party parser in the bundle whose
 * behaviour nobody here decided.
 */
/**
 * One line of the disclosure: `[1] Some title — https://example.com/x`.
 *
 * The dash is an em dash because renderDisclosure writes one, and the title
 * has already been flattened there, so a title containing an em dash of its
 * own still parses: the URL is anchored to the end of the line and the split
 * is made at the LAST dash before it.
 */
const SOURCE_RE = /^\[(\d{1,2})\]\s+(.+?)\s+—\s+(https?:\/\/\S+)\s*$/;

/** `*Searched the web for “ai articles”*` — the line above the list. */
const SEARCHED_RE = /^\*Searched (?:the web|the page) for [“"']?(.+?)[”"']?\*\s*$/;

function sourcesAt(lines: string[], i: number): { block: SourcesBlock; next: number } | null {
  let at = i;
  let query: string | null = null;
  const head = lines[at]?.match(SEARCHED_RE);
  if (head) {
    query = head[1].trim() || null;
    at++;
  }
  const items: SourcesBlock['items'] = [];
  while (at < lines.length) {
    const m = lines[at].match(SOURCE_RE);
    if (!m) break;
    items.push({ n: Number(m[1]), title: m[2].trim(), url: m[3] });
    at++;
  }
  // A heading with nothing under it is prose — "nothing usable came back"
  // reads as a sentence and should stay one.
  if (!items.length) return null;
  return { block: { kind: 'sources', query, items }, next: at };
}

export function parseBlocks(input: string, opts: ReadOptions = {}): Block[] {
  const text = typeof input === 'string' ? input : '';
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  const rich = !!opts.rich;
  /** inline blocks met so far — the next one's position */
  let uiSeen = 0;
  /** a line that starts a rich block — a paragraph stops before it */
  const richStart = (l: string) => rich && (FENCE_RE.test(l) || UI_ONE_LINE_RE.test(l) || UI_OPEN_INLINE_RE.test(l) || HEADING_RE.test(l) || QUOTE_RE.test(l));
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
      continue;
    }

    if (rich) {
      const one = lines[i].match(UI_ONE_LINE_RE);
      if (one) {
        blocks.push({ kind: 'ui', spec: parseInlineSpec(one[1]), open: false, n: uiSeen++ });
        // what was run on after the closing fence is read as the line it would have been
        if (one[2].trim()) lines[i] = one[2];
        else i++;
        continue;
      }
      const inlineOpen = lines[i].match(UI_OPEN_INLINE_RE);
      const fence = inlineOpen ? null : lines[i].match(FENCE_RE);
      if (fence || inlineOpen) {
        const lang = inlineOpen ? 'ui' : (fence![1] || '').toLowerCase();
        const isUi = lang === 'ui';
        const body: string[] = inlineOpen ? [inlineOpen[1]] : [];
        i++;
        let open = true;
        while (i < lines.length) {
          // a code block closes only on a fence line of its own, as it always has; a line in it that
          // merely starts with backticks is code. An inline block is JSON, so it can be read more freely.
          const close = isUi ? lines[i].match(CLOSE_RE) : FENCE_RE.test(lines[i]) ? ['', ''] : null;
          if (close) {
            const rest = close[1].trim();
            open = false;
            if (!rest || LANG_WORD_RE.test(rest)) i++;
            else lines[i] = rest;
            break;
          }
          const inside = isUi ? lines[i].match(UI_CLOSE_INSIDE_RE) : null;
          if (inside) {
            body.push(inside[1]);
            open = false;
            if (inside[2].trim()) lines[i] = inside[2];
            else i++;
            break;
          }
          body.push(lines[i++]);
        }
        // the very first characters of an inline block — "```", "```u" — while the reply is still
        // writing it: a placeholder, never a code block that flashes and then turns into the element
        const said = body.join('\n').trim();
        const uiArriving = open && 'ui'.startsWith(lang) && mayBeSpec(said);
        if (isUi || uiArriving) {
          const kind = open ? said.match(/"type"\s*:\s*"([a-z]+)"/)?.[1] : undefined;
          blocks.push({ kind: 'ui', spec: open ? null : parseInlineSpec(body.join('\n')), open, n: uiSeen++, ...(kind ? { pending: kind } : {}) });
          continue;
        }
        blocks.push({ kind: 'code', lang: fence?.[1] || null, text: body.join('\n'), open });
        continue;
      }
      const h = lines[i].match(HEADING_RE);
      if (h) {
        blocks.push({ kind: 'h', level: h[1].length as 1 | 2 | 3, text: h[2].replace(/\s+#+\s*$/, '').trim() });
        i++;
        continue;
      }
      if (QUOTE_RE.test(lines[i])) {
        const said: string[] = [];
        while (i < lines.length && lines[i].trim() !== '' && QUOTE_RE.test(lines[i])) said.push(lines[i++].replace(QUOTE_RE, '$1'));
        blocks.push({ kind: 'quote', text: said.join('\n') });
        continue;
      }
    }

    // Before everything else: the lines a turn's own machinery wrote. They
    // are not prose and must not be laid out as prose.
    const src = sourcesAt(lines, i);
    if (src) {
      blocks.push(src.block);
      i = src.next;
      continue;
    }

    if (startsTable(lines, i)) {
      const header = splitTableRow(lines[i]);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      blocks.push({ kind: 'table', header, rows });
      continue;
    }

    if (rich && (BULLET_RE.test(lines[i]) || ORDERED_RE.test(lines[i]))) {
      const list = richListAt(lines, i);
      blocks.push(list.block);
      i = list.next;
      continue;
    }

    if (BULLET_RE.test(lines[i])) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, '$2'));
        i++;
        i = absorbContinuation(lines, i, items);
      }
      blocks.push(bulletBlock(items));
      continue;
    }

    if (ORDERED_RE.test(lines[i])) {
      const items: string[] = [];
      const startN = Number(lines[i].match(/^\s*(\d+)/)?.[1] ?? 1);
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(lines[i].replace(ORDERED_RE, '$1'));
        i++;
        i = absorbContinuation(lines, i, items);
      }
      blocks.push(startN !== 1 && Number.isFinite(startN) ? { kind: 'ol', items, start: startN } : { kind: 'ol', items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i]) &&
      !startsTable(lines, i) &&
      // A reply that ends "…here are the sources:" runs straight into the
      // list with no blank line, and a paragraph that swallowed it would
      // print the URLs it was supposed to draw.
      !sourcesAt(lines, i) &&
      !(para.length && richStart(lines[i]))
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: para.join('\n') });
  }

  return blocks;
}
