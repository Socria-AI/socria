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

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';
import { copyText } from '@/lib/copy-text';
import { parseBlocks, splitInline, stripMarks, type Block } from '@/lib/rich-text';
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

function BlockNode({ block, math, k, cite, rich, inline }: { block: Block; math?: boolean; k: string; cite?: CiteRender; rich?: boolean; inline?: InlineHost }): ReactNode {
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

    case 'ul':
      return (
        <ul key={k}>
          {block.items.map((it, i) => (
            <li key={i}>
              <Inline text={it} math={math} keyBase={`${k}-${i}`} cite={cite} code={rich} />
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

/**
 * A finished reply: paragraphs, lists, titled groups and small tables — and,
 * where the surface draws them, its citations. `rich` (Logos 5) also reads
 * headings, fenced code, quotations, inline code and the inline elements
 * (lib/inline-ui.ts), whose state and actions `inline` carries. A surface that
 * does not draw those reads each one as the words it stands for.
 */
export function RichText({ text, math, cite, rich, askLast, inline }: { text: string; math?: boolean; cite?: CiteRender; rich?: boolean; askLast?: boolean; inline?: InlineHost }) {
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
 * once, when its paragraph ends, rather than flickering token by token.
 */
export function StreamingRichText({ text, math, rich }: { text: string; math?: boolean; rich?: boolean }) {
  const cut = text.lastIndexOf('\n\n');
  // inside an unclosed fence the whole tail is the block still being written
  const fences = (text.match(/^\s*```/gm) ?? []).length;
  const settled = fences % 2 === 1 ? text : cut > 0 ? text.slice(0, cut) : '';
  const tail = fences % 2 === 1 ? '' : cut > 0 ? text.slice(cut + 2) : text;
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
