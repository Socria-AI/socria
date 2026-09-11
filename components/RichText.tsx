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

import type { ReactNode } from 'react';
import { parseBlocks, splitInline, stripMarks, type Block } from '@/lib/rich-text';
import { MathText } from '@/components/TeX';

/** A run of text, with math inside it when the surface asked for math. */
function Body({ text, math }: { text: string; math?: boolean }): ReactNode {
  return math ? <MathText>{text}</MathText> : text;
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
}: {
  text: string;
  math?: boolean;
  keyBase?: string;
}) {
  return (
    <>
      {splitInline(text).map((seg, i) => {
        const key = `${keyBase}-${i}`;
        const body = <Body text={seg.text} math={math} />;
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

function BlockNode({ block, math, k }: { block: Block; math?: boolean; k: string }): ReactNode {
  switch (block.kind) {
    case 'p':
      return <p key={k}>{<Inline text={block.text} math={math} keyBase={k} />}</p>;

    case 'ul':
      return (
        <ul key={k}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} math={math} keyBase={`${k}-${i}`} />
            </li>
          ))}
        </ul>
      );

    case 'ol':
      return (
        <ol key={k}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} math={math} keyBase={`${k}-${i}`} />
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
                      <Inline text={it} math={math} keyBase={`${k}-${gi}-${ii}`} />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      );

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
                      <Inline text={c} math={math} keyBase={`${k}-${ri}-${ci}`} />
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

/** A finished reply: paragraphs, lists, titled groups and small tables. */
export function RichText({ text, math }: { text: string; math?: boolean }) {
  return <>{parseBlocks(text).map((b, i) => BlockNode({ block: b, math, k: `b${i}` }))}</>;
}
