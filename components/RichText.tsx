'use client';

// The typography of a reply, drawn.
//
// All of the reading is in lib/rich-text.ts and all of the JSX is here, so
// the part that has the bugs is the part the suite can reach. What is left in
// this file is a switch over block kinds and a choice of element.
//
// ONE VOCABULARY, TWO SURFACES. Core and Logos emit the same class names and
// differ only in what their CSS makes of them — Core under `.prose-socria`,
// Logos under `.logos-root`, both in app/globals.css. That is
// deliberate: a reply that reads well in one should read well in the other,
// and the alternative is two renderers drifting apart, which is exactly the
// state this replaced.
//
// MATH is opt-in. Logos carries equations and Core does not, and running the
// KaTeX splitter over every sentence of a chat that will never contain a `$`
// is work for nothing — so the surface says whether to look.
//
// EDITORIAL is opt-in too: Logos 5's replies in the conversation, laid out to
// be read (lib/reply-layout.ts) — the opening statement as a standfirst,
// labelled lists as terms, short lists in columns, groups side by side, a
// comparison table as one, the later parts of a long reply (or the rest of a
// long reply with no parts) folded under a row that says what it holds, every
// element and the closing question always in view. `disclose={false}` — the
// person asked for depth — folds nothing. A document read in Content is not a
// reply and is not laid out as one.

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { copyText } from '@/lib/copy-text';
import { isTableRule, listLine, parseBlocks, splitInline, splitTableRow, stripMarks, type Block } from '@/lib/rich-text';
import { editorialBlocks, layoutReply, plainTermOf, streamingSplit, tableShape, tailShape, termOf, type TailShape } from '@/lib/reply-layout';
import { MathText } from '@/components/TeX';
import { SourceCards } from '@/components/SourceCards';
import { InlineBlock, type InlineHost } from '@/components/inline/InlineUI';
import { contentAsText } from '@/lib/inline-ui';

/**
 * How a surface draws a citation key — [A3.12], [A3.12, A4.2] — when its
 * replies cite documents (Logos). Absent, a key is just text. `before` is the
 * text just before the citation, so a surface can tell which sentence it
 * closes.
 */
export type CiteRender = (keys: string[], raw: string, before: string) => ReactNode;

const CITE = /\[\s*[A-Z]\d{1,4}\.\d{1,5}(?:\s*[,;]\s*[A-Z]?\d{1,4}\.\d{1,5})*\s*\]/g;

/** The keys in one bracket, a bare page.n taking the letter before it ("A3.12, 3.14" → A3.12, A3.14). */
function keysOf(bracket: string): string[] {
  let letter = '';
  return bracket
    .replace(/^\[\s*|\s*\]$/g, '')
    .split(/\s*[,;]\s*/)
    .map((k) => {
      if (/^[A-Z]/.test(k)) letter = k[0];
      return /^[A-Z]/.test(k) ? k : `${letter}${k}`;
    });
}

/** A run of text, with math inside it when the surface asked for math — and its citations drawn, when it draws them. */
function Body({ text, math, cite }: { text: string; math?: boolean; cite?: CiteRender }): ReactNode {
  const plain = (t: string) => (math ? <MathText>{t}</MathText> : t);
  if (!cite || !text.includes('[')) return plain(text);
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(CITE)) {
    const at = m.index ?? 0;
    if (at > last) out.push(<Fragment key={`t${last}`}>{plain(text.slice(last, at))}</Fragment>);
    out.push(<Fragment key={`c${at}`}>{cite(keysOf(m[0]), m[0], text.slice(last, at))}</Fragment>);
    last = at + m[0].length;
  }
  if (!out.length) return plain(text);
  if (last < text.length) out.push(<Fragment key={`t${last}`}>{plain(text.slice(last))}</Fragment>);
  return <>{out}</>;
}

/**
 * One line of prose with its marks.
 *
 * Exported because a streaming reply uses this alone: blocks only settle once
 * the text has stopped arriving, and re-deciding "is this a list yet?" on
 * every token makes the message jump about while somebody is reading it.
 */
export function Inline({
  text,
  math,
  keyBase = 'i',
  cite,
  code,
}: {
  text: string;
  math?: boolean;
  keyBase?: string;
  cite?: CiteRender;
  /** read `inline code` too (Logos 5's rich reading) */
  code?: boolean;
}) {
  return (
    <>
      {splitInline(text, { code }).map((seg, i) => {
        const key = `${keyBase}-${i}`;
        if (seg.kind === 'code') return <code key={key} className="socria-code">{seg.text}</code>;
        const body = <Body text={seg.text} math={math} cite={cite} />;
        if (seg.kind === 'text') return <span key={key}>{body}</span>;
        if (seg.kind === 'strong') {
          return (
            <strong key={key} className="socria-strong">
              {body}
            </strong>
          );
        }
        // Emphasis is Socria's signature — italic serif, in the green — and
        // `strong-em` is that same signature inside a bold label, which is
        // where it most often lands: the one word in the label that matters.
        return (
          <em
            key={key}
            className={seg.kind === 'strong-em' ? 'socria-em is-strong' : 'socria-em'}
          >
            {body}
          </em>
        );
      })}
    </>
  );
}

/** A fenced block, with a way to copy it — the one thing a code block is for. */
function CodeBlock({ lang, text, open }: { lang: string | null; text: string; open: boolean }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <div className={`socria-codeblock${open ? ' is-open' : ''}`}>
      <div className="socria-codeblock-head">
        <span>{lang || 'text'}</span>
        <button
          type="button"
          onClick={async () => {
            if (await copyText(text)) {
              setCopied(true);
              if (timer.current) clearTimeout(timer.current);
              timer.current = setTimeout(() => setCopied(false), 1500);
            }
          }}
          aria-label={copied ? 'Copied' : 'Copy this block'}
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre>
        <code>{text}</code>
      </pre>
    </div>
  );
}

/**
 * The points nested under a list item, as one muted line under it rather than
 * a second, deeper list: what was written stays together and the page gains
 * no new depth. `tail`: the point still being written, while a reply streams.
 */
function Subs({ items, tail, math, k, cite, rich }: { items: string[]; tail?: string; math?: boolean; k: string; cite?: CiteRender; rich?: boolean }) {
  const all = tail !== undefined ? [...items, tail] : items;
  if (!all.length) return null;
  return (
    <span className="socria-sub">
      {all.map((x, j) => (
        <Fragment key={j}>
          {j > 0 && (
            <span className="socria-sub-sep" aria-hidden="true">
              {' · '}
            </span>
          )}
          <span className={tail !== undefined && j === all.length - 1 ? 'is-tail' : undefined}>
            <Inline text={x} math={math} keyBase={`${k}-s${j}`} cite={cite} code={rich} />
          </span>
        </Fragment>
      ))}
    </span>
  );
}

/** The text still being written, when it continues a block: that block's next item, a line under its last one, its next row. */
interface TailIn {
  shape: TailShape;
  text: string;
}

/** A list line still being written, without its mark — nothing yet when only the mark has arrived. */
const itemText = (t: string) => listLine(t)?.text ?? (/^\s*(?:[-•*]|\d{1,3}[.)]?)\s*$/.test(t) ? '' : t.trim());

/** A table's cells as they stand, the separator rule and any half-typed one skipped. */
function rowsOf(lines: string[]): string[][] {
  return lines.filter((l) => l.includes('|') && !isTableRule(l) && !(l.includes('-') && /^[\s|:-]*$/.test(l))).map(splitTableRow);
}

function BlockNode({ block, math, k, cite, rich, inline, tail }: { block: Block; math?: boolean; k: string; cite?: CiteRender; rich?: boolean; inline?: InlineHost; tail?: TailIn }): ReactNode {
  const tailLi = tail?.shape === 'li' ? itemText(tail.text) : null;
  const tailSub = tail?.shape === 'sub' ? itemText(tail.text) : undefined;
  switch (block.kind) {
    case 'p':
      return <p key={k}>{<Inline text={block.text} math={math} keyBase={k} cite={cite} code={rich} />}</p>;

    case 'h': {
      const H = (`h${block.level + 2}` as 'h3' | 'h4' | 'h5');
      return (
        <H key={k} className={`socria-h socria-h${block.level}`}>
          <Inline text={block.text} math={math} keyBase={k} code={rich} />
        </H>
      );
    }

    case 'code':
      return <CodeBlock key={k} lang={block.lang} text={block.text} open={block.open} />;

    case 'quote':
      return (
        <blockquote key={k} className="socria-quote">
          <Inline text={block.text} math={math} keyBase={k} cite={cite} code={rich} />
        </blockquote>
      );

    // a list of many short items sits in columns (lib/reply-layout.ts listShape) — columns, never chips
    case 'ul':
    case 'ol': {
      const List = block.kind;
      const last = block.items.length - 1;
      return (
        <List
          key={k}
          className={block.kind === 'ul' && block.compact ? 'socria-list is-short' : undefined}
          start={block.kind === 'ol' && block.start ? block.start : undefined}
        >
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} math={math} keyBase={`${k}-${i}`} cite={cite} code={rich} />
              <Subs items={block.subs?.[i] ?? []} tail={i === last ? tailSub : undefined} math={math} k={`${k}-${i}`} cite={cite} rich={rich} />
            </li>
          ))}
          {tailLi !== null && (
            <li className="is-tail">
              <Inline text={tailLi} math={math} keyBase={`${k}-t`} code={rich} />
            </li>
          )}
        </List>
      );
    }

    // Labelled items, laid out as terms: the label, then what it says (Logos 5's editorial reading).
    // (an item with no label came after the list was read as terms and is not written that way: a plain row of it)
    case 'terms': {
      const List = block.ordered ? 'ol' : 'ul';
      const last = block.items.length - 1;
      const next = tailLi !== null ? termOf(tailLi) ?? plainTermOf(tailLi) ?? { label: '', body: tailLi } : null;
      const row = (it: { label: string; body: string; sub?: string[] }, i: number | 't', more?: string) => (
        <li key={i} className={[it.label ? '' : 'is-plain', i === 't' ? 'is-tail' : ''].filter(Boolean).join(' ') || undefined}>
          {it.label && (
            <span className="socria-term">
              <Inline text={it.label} math={math} keyBase={`${k}-t${i}`} cite={cite} code={rich} />
            </span>
          )}
          <span className="socria-term-body">
            <Inline text={it.body} math={math} keyBase={`${k}-d${i}`} cite={cite} code={rich} />
            <Subs items={it.sub ?? []} tail={more} math={math} k={`${k}-${i}`} cite={cite} rich={rich} />
          </span>
        </li>
      );
      return (
        <List
          key={k}
          className={`socria-terms${block.ordered ? ' is-ordered' : ''}`}
          style={block.ordered && block.start ? { counterReset: `rx-term ${block.start - 1}` } : undefined}
        >
          {block.items.map((it, i) => row(it, i, i === last ? tailSub : undefined))}
          {next && row(next, 't')}
        </List>
      );
    }

    // A labelled list is a set of small sections, not a wall of bullets.
    // (two to four short groups — Pros and Cons, two options and their points — are set side by side)
    case 'groups': {
      const lastG = block.groups.length - 1;
      return (
        <div key={k} className={`socria-groups${block.side ? ' is-side' : ''}`}>
          {block.groups.map((g, gi) => {
            // the line still being written: the group's next point, whether written as an item or under one
            const more = gi === lastG ? tailLi ?? tailSub ?? null : null;
            return (
              <div key={gi} className="socria-group">
                {g.header && (
                  <div className="socria-group-head">
                    {stripMarks(g.header).replace(/:$/, '')}
                  </div>
                )}
                {(g.items.length > 0 || more !== null) && (
                  <ul>
                    {g.items.map((it, ii) => (
                      <li key={ii}>
                        <Inline text={it} math={math} keyBase={`${k}-${gi}-${ii}`} cite={cite} code={rich} />
                      </li>
                    ))}
                    {more !== null && (
                      <li className="is-tail">
                        <Inline text={more} math={math} keyBase={`${k}-${gi}-t`} code={rich} />
                      </li>
                    )}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    // What the turn read, drawn as what it read rather than as a column of
    // addresses. See components/SourceCards.tsx.
    case 'sources':
      return <SourceCards key={k} query={block.query} items={block.items} />;

    // An inline element (components/inline/InlineUI.tsx): drawn from its
    // validated spec; what the person does with it goes to the surface's host.
    case 'ui':
      return (
        <InlineBlock
          key={k}
          spec={block.spec}
          open={block.open}
          n={block.n}
          host={inline}
          renderInline={(t, key) => <Inline text={t} math={math} keyBase={`${k}-${key}`} code={rich} />}
        />
      );

    case 'table':
      return <Table key={k} block={block} math={math} k={k} cite={cite} rich={rich} pending={tail?.shape === 'row' ? splitTableRow(tail.text) : undefined} />;
  }
}

/**
 * A table. One that compares things on the same points (lib/reply-layout.ts
 * tableShape) names each point in a row header, so a screen reader says which
 * point a value is on, and on a phone each row stacks into a small card of
 * its own — every value labelled with the column it came from — rather than
 * squeezing four columns into the width of one. `pending`: the row still
 * being written, while a reply streams.
 */
function Table({ block, math, k, cite, rich, pending, writing }: { block: Extract<Block, { kind: 'table' }>; math?: boolean; k: string; cite?: CiteRender; rich?: boolean; pending?: string[]; writing?: boolean }) {
  const cmp = !!block.compare;
  const labels = block.header.map((c) => stripMarks(c));
  const row = (r: string[], ri: number | 't') => (
    <tr key={ri} className={ri === 't' ? 'is-tail' : undefined}>
      {r.map((c, ci) =>
        cmp && ci === 0 ? (
          <th key={ci} scope="row">
            <Inline text={c} math={math} keyBase={`${k}-${ri}-${ci}`} cite={cite} code={rich} />
          </th>
        ) : (
          <td key={ci} data-label={cmp ? labels[ci] || undefined : undefined}>
            {/* one box for the value, so a phone's stacked row lays label and value side by side (reply.css) */}
            <span className={cmp ? 'socria-cell' : undefined}>
              <Inline text={c} math={math} keyBase={`${k}-${ri}-${ci}`} cite={cite} code={rich} />
            </span>
          </td>
        )
      )}
    </tr>
  );
  return (
    // The wrapper scrolls on its own so a wide table never makes the
    // whole conversation scroll sideways.
    <div className={`socria-table-wrap${cmp ? ' is-compare' : ''}${cmp && block.header.length <= 4 ? ' is-stack' : ''}${writing ? ' is-tail' : ''}`}>
      <table className={cmp ? 'socria-table is-compare' : undefined}>
        <thead>
          <tr>
            {block.header.map((c, ci) => (
              <th key={ci} scope={cmp ? 'col' : undefined}>
                <Inline text={c} math={math} keyBase={`${k}-h${ci}`} cite={cite} code={rich} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {block.rows.map((r, ri) => row(r, ri))}
          {pending && row(pending, 't')}
        </tbody>
      </table>
    </div>
  );
}

/**
 * The text still being written, drawn as what it will be — the first item of
 * a list, a table whose rule has not arrived — or, for prose, the paragraph as
 * it stands, its line breaks kept (l5.css), never a run-on line of marks.
 */
function TailNode({ text, shape, math, k }: { text: string; shape: TailShape; math?: boolean; k: string }): ReactNode {
  if (shape === 'list') {
    const item = listLine(text);
    const List = item?.ordered ? 'ol' : 'ul';
    return (
      <List key={k} start={item?.ordered && item.n !== 1 ? item.n : undefined}>
        <li className="is-tail">
          <Inline text={item?.text ?? text} math={math} code />
        </li>
      </List>
    );
  }
  if (shape === 'table') {
    const [head, ...rows] = rowsOf(text.split('\n'));
    if (head) return <Table key={k} block={tableShape({ kind: 'table', header: head, rows })} math={math} k={k} rich writing />;
  }
  return (
    <p key={k} className="is-tail">
      <Inline text={text} math={math} code />
    </p>
  );
}

/**
 * A finished reply: paragraphs, lists, titled groups and small tables — and,
 * where the surface draws them, its citations. `rich` (Logos 5) also reads
 * headings, fenced code, quotations, inline code and the inline elements
 * (lib/inline-ui.ts), whose state and actions `inline` carries. A surface that
 * does not draw those reads each one as the words it stands for.
 */
export function RichText({ text, math, cite, rich, askLast, inline, editorial, disclose }: { text: string; math?: boolean; cite?: CiteRender; rich?: boolean; askLast?: boolean; inline?: InlineHost; editorial?: boolean; disclose?: boolean }) {
  if (editorial) return <EditorialText text={text} math={math} cite={cite} askLast={askLast} inline={inline} disclose={disclose} />;
  const blocks = parseBlocks(!rich && text.includes('```') ? contentAsText(text) : text, { rich });
  const last = blocks.length - 1;
  const apart = !!askLast && setsApart(text);
  return (
    <>
      {blocks.map((b, i) => {
        // Logos 5: a reply that ends by asking, asks in its own voice — the closing question set apart
        const split = apart && i === last && b.kind === 'p' ? closingQuestion(b.text) : null;
        if (!split) return BlockNode({ block: b, math, k: `b${i}`, cite, rich, inline });
        return (
          <p key={`b${i}`}>
            {split.body && (
              <>
                <Inline text={split.body} math={math} keyBase={`b${i}a`} cite={cite} code={rich} />{' '}
              </>
            )}
            <em className="socria-ask">
              <Inline text={split.question} math={math} keyBase={`b${i}q`} cite={cite} code={rich} />
            </em>
          </p>
        );
      })}
    </>
  );
}

/**
 * A Logos 5 reply, laid out to be read (lib/reply-layout.ts): the lead, terms,
 * folded parts, the closing question in view. Rich reading throughout. While
 * it streams, `tail` is the paragraph still being written: it is laid out
 * where it will land — inside a fold when its part is folded, so a part being
 * written under a folded title says "Writing…" instead of spilling out and
 * then jumping in.
 */
function EditorialText({ text, tail, joins, math, cite, askLast, inline, streaming, disclose }: { text: string; tail?: string; joins?: boolean; math?: boolean; cite?: CiteRender; askLast?: boolean; inline?: InlineHost; streaming?: boolean; disclose?: boolean }) {
  const blocks = editorialBlocks(parseBlocks(text, { rich: true }), { more: !!streaming });
  // what the text still being written is: the next item of the list above it, a row of the table, a paragraph…
  const shape = tail ? tailShape(blocks, tail, !!joins) : null;
  const tailIn = shape === 'li' || shape === 'sub' || shape === 'row';
  const pieces = layoutReply(blocks, { streaming, tail, tailIn, disclose: disclose !== false });
  const apart = !!askLast && setsApart(text);
  const folds = pieces.filter((p) => p.kind === 'fold').length;
  const reply = replyKey(text);
  const lastFold = pieces.map((p) => p.kind).lastIndexOf('fold');
  const [openFolds, setOpenFolds] = useState(0);
  const draw = (i: number, key: string): ReactNode => {
    if (i === blocks.length) return tail && shape ? <TailNode key={key} text={tail} shape={shape} math={math} k={key} /> : null;
    const b = blocks[i];
    // a part of a reply is a section under the page's one heading (the conversation's title): h2, whatever it was written as
    if (b.kind === 'h')
      return (
        <h2 key={key} className={`socria-h socria-h${b.level}`}>
          <Inline text={b.text} math={math} keyBase={key} code />
        </h2>
      );
    return BlockNode({ block: b, math, k: key, cite, rich: true, inline, tail: tailIn && tail && shape && i === blocks.length - 1 ? { shape, text: tail } : undefined });
  };
  return (
    <>
      {pieces.map((p, pi) => {
        if (p.kind === 'block') {
          const b = blocks[p.i];
          if (p.lead && b?.kind === 'p') {
            return (
              <p key={`b${p.i}`} className="socria-lead">
                <Inline text={b.text} math={math} keyBase={`b${p.i}`} cite={cite} code />
              </p>
            );
          }
          return draw(p.i, `b${p.i}`);
        }
        if (p.kind === 'ask') {
          const b = blocks[p.i];
          const split = apart && b.kind === 'p' ? closingQuestion(b.text) : null;
          if (!split) return draw(p.i, `b${p.i}`);
          return (
            <p key={`b${p.i}`} className="socria-asks">
              {split.body && (
                <>
                  <Inline text={split.body} math={math} keyBase={`b${p.i}a`} cite={cite} code />{' '}
                </>
              )}
              <em className="socria-ask">
                <Inline text={split.question} math={math} keyBase={`b${p.i}q`} cite={cite} code />
              </em>
            </p>
          );
        }
        // a part's fold is titled by its heading; a fold the paragraphs earned, by the sentence it opens on
        // (or "More"); the rest of a fold an element interrupted is the same part carrying on, untitled
        const head = p.head >= 0 && !p.cont ? blocks[p.head] : undefined;
        const fk = p.cont ? `fc${p.body[0]}` : p.head >= 0 ? `f${p.head}` : `fs${p.body[0]}`;
        const titled = head?.kind === 'h' ? <Inline text={head.text} math={math} keyBase={`${fk}t`} code /> : p.title && !p.cont ? <Inline text={p.title} math={math} keyBase={`${fk}t`} code /> : 'More';
        return (
          <Fragment key={fk}>
            <details
              className={`socria-fold${p.writing ? ' is-writing' : ''}${p.head < 0 ? ' is-prose' : ''}${p.cont ? ' is-cont' : ''}`}
              data-fold={fk}
              open={OPENED.get(`${reply}#${fk}`) ?? false}
              onToggle={(e) => {
                keepOpened(`${reply}#${fk}`, e.currentTarget.open);
                // counted from the page, not kept in step by hand: one press or "Open all", the count is what is open
                const root = e.currentTarget.closest('.l5-prose') ?? e.currentTarget.parentElement;
                setOpenFolds(root ? root.querySelectorAll('details.socria-fold[open]').length : 0);
              }}
            >
              <summary className="socria-fold-sum">
                <span className="socria-fold-t">
                  {titled}
                  {p.count && <span className="socria-fold-n"> · {p.count}</span>}
                </span>
                <span className="socria-fold-p" aria-hidden="true">
                  {p.writing ? 'Writing…' : p.preview}
                </span>
              </summary>
              <div className="socria-fold-body">{p.body.map((i) => draw(i, `b${i}`))}</div>
            </details>
            {pi === lastFold && folds >= 2 && !streaming && <FoldAll count={folds} allOpen={openFolds >= folds} />}
          </Fragment>
        );
      })}
    </>
  );
}

/**
 * WHAT WAS OPENED STAYS OPEN WHEN A REPLY LANDS. A reply being written and
 * the same reply landed are drawn by different components (L5Pending, then
 * L5Message), so a fold someone opened while it was still arriving used to
 * close under them the moment it finished. Which folds are open is kept here,
 * by the reply's opening words and the fold's place in it — the same for the
 * reply mid-stream and landed — for as long as the page is open. Memory only:
 * nothing is stored, and a reload starts with every fold closed, as before.
 */
const OPENED = new Map<string, boolean>();
const OPENED_MAX = 400;
const replyKey = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 160);
/** A fold opened (or closed) in the reply that begins with `text` — exported for the suite, which cannot press. */
export function keepFoldOpen(text: string, fold: string, open: boolean) {
  keepOpened(`${replyKey(text)}#${fold}`, open);
}
function keepOpened(key: string, open: boolean) {
  OPENED.delete(key);
  if (open) OPENED.set(key, true);
  // the oldest go first: a long session never grows this without end
  while (OPENED.size > OPENED_MAX) OPENED.delete(OPENED.keys().next().value as string);
}

/** Every folded part of this reply opened, or closed again — one press for someone who wants all of it. */
function FoldAll({ count, allOpen }: { count: number; allOpen: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    const root = ref.current?.closest('.l5-prose') ?? ref.current?.parentElement;
    root?.querySelectorAll<HTMLDetailsElement>('details.socria-fold').forEach((d) => {
      d.open = !allOpen;
    });
  };
  return (
    <button ref={ref} type="button" className="socria-foldall" onClick={toggle} aria-expanded={allOpen}>
      {allOpen ? 'Close all' : `Open all ${count}`}
    </button>
  );
}

/**
 * Whether a reply's closing question is set apart at all. After a reply with
 * substance, the question is the turn handed back and setting it apart lets it
 * be seen. In two lines of conversation — "Quiet day on my end. You?" — the
 * same serif italic turns a passing "you?" into a tutor's prompt, so a short
 * reply, or a question of a word or three, stays in the sentence.
 */
export function setsApart(text: string): boolean {
  const t = text.trim();
  const m = /([^.!?…\n]*\?)["'’”)\]]*\s*$/.exec(t);
  if (!m) return false;
  const before = t.slice(0, m.index).split(/\s+/).filter(Boolean).length;
  const asked = m[1].trim().split(/\s+/).filter(Boolean).length;
  return before >= 25 && asked >= 4;
}

/**
 * A paragraph's closing question, apart from what comes before it — only
 * when it ends with one, and only when the cut leaves no bold, code, link or
 * maths open on either side of it.
 */
export function closingQuestion(text: string): { body: string; question: string } | null {
  const t = text.trim();
  if (!t.endsWith('?')) return null;
  const m = /^([\s\S]*[.!?:;…])\s+([^.!?]*\?)$/.exec(t);
  const body = m ? m[1].trim() : '';
  const question = m ? m[2].trim() : t;
  if (question.length < 4) return null;
  const balanced = (x: string) => (x.match(/\*\*/g) ?? []).length % 2 === 0 && (x.match(/`/g) ?? []).length % 2 === 0 && (x.match(/\$/g) ?? []).length % 2 === 0 && (x.match(/\[/g) ?? []).length === (x.match(/\]/g) ?? []).length;
  if (!balanced(body) || !balanced(question)) return null;
  return { body, question };
}

/**
 * A reply still arriving, read richly without jumping: every paragraph that
 * has finished (a blank line after it) is drawn as the blocks it is, and only
 * the paragraph still being written stays inline — so a list or a table forms
 * once, when its paragraph ends, rather than flickering token by token. In a
 * Logos 5 reply (`editorial`), a list or a table forms a line at a time
 * instead: each complete item or row is drawn where it will stay, and only the
 * line still being written is drawn as it stands, inside the list or table it
 * belongs to.
 */
export function StreamingRichText({ text, math, rich, editorial, disclose }: { text: string; math?: boolean; rich?: boolean; editorial?: boolean; disclose?: boolean }) {
  // inside an unclosed fence the whole tail is the block still being written (lib/reply-layout.ts streamingSplit);
  // in a Logos 5 reply, a list or a table settles a line at a time
  const { settled, tail, joins } = streamingSplit(text, !!editorial);
  if (editorial) return <EditorialText text={settled} tail={tail} joins={joins} math={math} streaming disclose={disclose} />;
  return (
    <>
      {settled && <RichText text={settled} math={math} rich={rich} />}
      {tail && (
        <p className="is-tail">
          <Inline text={tail} math={math} code={rich} />
        </p>
      )}
    </>
  );
}
