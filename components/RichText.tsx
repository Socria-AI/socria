'use client';

// The typography of a reply, drawn.
//
// All of the reading is in lib/rich-text.ts and all of the JSX is here, so
// the part that has the bugs is the part the suite can reach. What is left in
// this file is a switch over block kinds and a choice of element.
//
// ONE VOCABULARY, TWO SURFACES. Core and Logos emit the same class names and
// differ only in what their CSS makes of them — Core under `.prose-socria` in
// app/globals.css, Logos under `.logos-root` in app/logos/logos.css. That is
// deliberate: a reply that reads well in one should read well in the other,
// and the alternative is two renderers drifting apart, which is exactly the
// state this replaced.
//
// MATH is opt-in. Logos carries equations and Core does not, and running the
// KaTeX splitter over every sentence of a chat that will never contain a `$`
// is work for nothing — so the surface says whether to look.

import { Fragment, type ReactNode } from 'react';
import { parseBlocks, splitInline, stripMarks, type Block } from '@/lib/rich-text';
import { MathText } from '@/components/TeX';
import { SourceCards } from '@/components/SourceCards';

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
}: {
  text: string;
  math?: boolean;
  keyBase?: string;
  cite?: CiteRender;
}) {
  return (
    <>
      {splitInline(text).map((seg, i) => {
        const key = `${keyBase}-${i}`;
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

function BlockNode({ block, math, k, cite }: { block: Block; math?: boolean; k: string; cite?: CiteRender }): ReactNode {
  switch (block.kind) {
    case 'p':
      return <p key={k}>{<Inline text={block.text} math={math} keyBase={k} cite={cite} />}</p>;

    case 'ul':
      return (
        <ul key={k}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} math={math} keyBase={`${k}-${i}`} cite={cite} />
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol key={k}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} math={math} keyBase={`${k}-${i}`} cite={cite} />
            </li>
          ))}
        </ol>
      );

    // A labelled list is a set of small sections, not a wall of bullets.
    case 'groups':
      return (
        <div key={k} className="socria-groups">
          {block.groups.map((g, gi) => (
            <div key={gi} className="socria-group">
              {g.header && (
                <div className="socria-group-head">
                  {stripMarks(g.header).replace(/:$/, '')}
                </div>
              )}
              {g.items.length > 0 && (
                <ul>
                  {g.items.map((it, ii) => (
                    <li key={ii}>
                      <Inline text={it} math={math} keyBase={`${k}-${gi}-${ii}`} cite={cite} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );

    // What the turn read, drawn as what it read rather than as a column of
    // addresses. See components/SourceCards.tsx.
    case 'sources':
      return <SourceCards key={k} query={block.query} items={block.items} />;

    case 'table':
      return (
        // The wrapper scrolls on its own so a wide table never makes the
        // whole conversation scroll sideways.
        <div key={k} className="socria-table-wrap">
          <table>
            <thead>
              <tr>
                {block.header.map((c, ci) => (
                  <th key={ci}>
                    <Inline text={c} math={math} keyBase={`${k}-h${ci}`} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>
                      <Inline text={c} math={math} keyBase={`${k}-${ri}-${ci}`} cite={cite} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

/** A finished reply: paragraphs, lists, titled groups and small tables — and, where the surface draws them, its citations. */
export function RichText({ text, math, cite }: { text: string; math?: boolean; cite?: CiteRender }) {
  return <>{parseBlocks(text).map((b, i) => BlockNode({ block: b, math, k: `b${i}`, cite }))}</>;
}
