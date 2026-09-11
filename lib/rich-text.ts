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

/** One run of inline text, and what it is. */
export interface Inline {
  kind: 'text' | 'em' | 'strong' | 'strong-em';
  text: string;
}

export interface TableBlock {
  kind: 'table';
  header: string[];
  rows: string[][];
}

export interface GroupsBlock {
  kind: 'groups';
  groups: { header: string | null; items: string[] }[];
}

export type Block =
  | { kind: 'p'; text: string }
  | { kind: 'ul'; items: string[] }
  | { kind: 'ol'; items: string[] }
  | GroupsBlock
  | TableBlock;

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
export function splitInline(input: string): Inline[] {
  const text = typeof input === 'string' ? input : '';
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

/** A heading row followed by a `|---|` rule is a table and nothing else is. */
function startsTable(lines: string[], i: number): boolean {
  return (
    lines[i].includes('|') &&
    i + 1 < lines.length &&
    TABLE_SEP_RE.test(lines[i + 1]) &&
    lines[i + 1].includes('-')
  );
}

function splitTableRow(line: string): string[] {
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

/** Bullets that carry labels become titled groups; otherwise a plain list. */
function bulletBlock(items: string[]): Block {
  const labelled = items.some(isGroupHeader);
  const plain = items.some((it) => !isGroupHeader(it));
  if (!labelled || !plain) return { kind: 'ul', items };

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
export function parseBlocks(input: string): Block[] {
  const text = typeof input === 'string' ? input : '';
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    if (lines[i].trim() === '') {
      i++;
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
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(lines[i].replace(ORDERED_RE, '$1'));
        i++;
        i = absorbContinuation(lines, i, items);
      }
      blocks.push({ kind: 'ol', items });
      continue;
    }

    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i]) &&
      !startsTable(lines, i)
    ) {
      para.push(lines[i]);
      i++;
    }
    blocks.push({ kind: 'p', text: para.join('\n') });
  }

  return blocks;
}
