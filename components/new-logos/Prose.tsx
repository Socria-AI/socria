'use client';
// components/new-logos/Prose.tsx — text as New Logos draws it: paragraphs, headings, lists, tables, quotations, code
// and mathematics. The reading of the text is the shared, pure parser (lib/rich-text.ts parseBlocks, the same reading
// every stored reply was written for); the drawing is new and neutral. Interactive elements a reply may carry are not
// drawn here yet: they are named, quietly, rather than shown as raw markup.

import katex from 'katex';
import { Fragment, type ReactNode } from 'react';
import { parseBlocks, splitInline, withoutMarkers, type Block } from '@/lib/rich-text';

// $$…$$, \[…\], \(…\), and $…$ when it hugs its content (so "$5 and $10" stays money)
const MATH = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$(?=\S)[^$\n]*?\S\$(?!\d))/g;

function tex(src: string, display: boolean): ReactNode {
  try {
    const html = katex.renderToString(src, { displayMode: display, throwOnError: false, strict: 'ignore', trust: false, output: 'html' });
    return <span dangerouslySetInnerHTML={{ __html: html }} />;
  } catch {
    return <code>{src}</code>;
  }
}

function withMath(text: string, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(MATH)) {
    const at = m.index ?? 0;
    if (at > last) out.push(text.slice(last, at));
    const s = m[0];
    const display = s.startsWith('$$') || s.startsWith('\\[');
    const inner = s.startsWith('$$') ? s.slice(2, -2) : s.startsWith('\\[') || s.startsWith('\\(') ? s.slice(2, -2) : s.slice(1, -1);
    out.push(<Fragment key={`${key}-m${i++}`}>{tex(inner.trim(), display)}</Fragment>);
    last = at + s.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Inline({ text, k = 'i' }: { text: string; k?: string }) {
  const parts = splitInline(withoutMarkers(text), { code: true });
  return (
    <>
      {parts.map((p, i) => {
        const key = `${k}-${i}`;
        switch (p.kind) {
          case 'code':
            return <code key={key}>{p.text}</code>;
          case 'strong':
            return <strong key={key}>{withMath(p.text, key)}</strong>;
          case 'em':
            return <em key={key}>{withMath(p.text, key)}</em>;
          case 'strong-em':
            return (
              <strong key={key}>
                <em>{withMath(p.text, key)}</em>
              </strong>
            );
          case 'link':
            return p.href ? (
              <a key={key} href={p.href} target="_blank" rel="noopener noreferrer">
                {p.text}
              </a>
            ) : (
              <Fragment key={key}>{p.text}</Fragment>
            );
          default:
            return <Fragment key={key}>{withMath(p.text, key)}</Fragment>;
        }
      })}
    </>
  );
}

function Items({ items, subs, k }: { items: string[]; subs?: string[][]; k: string }) {
  return (
    <>
      {items.map((it, i) => (
        <li key={`${k}-${i}`}>
          <Inline text={it} k={`${k}-${i}`} />
          {subs?.[i]?.length ? (
            <ul>
              {subs[i].map((s, j) => (
                <li key={j}>
                  <Inline text={s} k={`${k}-${i}-${j}`} />
                </li>
              ))}
            </ul>
          ) : null}
        </li>
      ))}
    </>
  );
}

function BlockView({ b, k }: { b: Block; k: string }) {
  switch (b.kind) {
    case 'p': {
      const t = b.text.trim();
      const display = /^(\$\$[\s\S]+\$\$|\\\[[\s\S]+\\\])$/.test(t);
      return display ? <div>{tex(t.startsWith('$$') ? t.slice(2, -2) : t.slice(2, -2), true)}</div> : <p><Inline text={b.text} k={k} /></p>;
    }
    case 'h': {
      const Tag = (b.level === 1 ? 'h3' : b.level === 2 ? 'h4' : 'h5') as 'h3' | 'h4' | 'h5';
      return (
        <Tag>
          <Inline text={b.text} k={k} />
        </Tag>
      );
    }
    case 'ul':
      return (
        <ul>
          <Items items={b.items} subs={b.subs} k={k} />
        </ul>
      );
    case 'ol':
      return (
        <ol start={b.start}>
          <Items items={b.items} subs={b.subs} k={k} />
        </ol>
      );
    case 'quote':
      return (
        <blockquote>
          <Inline text={b.text} k={k} />
        </blockquote>
      );
    case 'code':
      return (
        <pre>
          <code>{b.text}</code>
        </pre>
      );
    case 'table':
      return (
        <table>
          <thead>
            <tr>
              {b.header.map((h, i) => (
                <th key={i}>
                  <Inline text={h} k={`${k}-h${i}`} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>
                    <Inline text={c} k={`${k}-${i}-${j}`} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      );
    case 'groups':
      return (
        <div>
          {b.groups.map((g, i) => (
            <div key={i}>
              {g.header ? (
                <p>
                  <strong>
                    <Inline text={g.header} k={`${k}-g${i}`} />
                  </strong>
                </p>
              ) : null}
              <ul>
                <Items items={g.items} k={`${k}-g${i}`} />
              </ul>
            </div>
          ))}
        </div>
      );
    case 'sources':
      return (
        <div>
          <p className="nl-hint">Sources{b.query ? ` for “${b.query}”` : ''}</p>
          <ol>
            {b.items.map((s) => (
              <li key={s.n}>
                <a href={s.url} target="_blank" rel="noopener noreferrer">
                  {s.title || s.url}
                </a>
              </li>
            ))}
          </ol>
        </div>
      );
    case 'ui':
      return <span className="nl-placeholder">Interactive element — not shown in this view yet</span>;
    case 'terms':
      return (
        <ul>
          {b.items.map((t, i) => (
            <li key={i}>
              {t.label ? <strong>{t.label}: </strong> : null}
              <Inline text={t.body} k={`${k}-t${i}`} />
            </li>
          ))}
        </ul>
      );
    default:
      return null;
  }
}

/** Markdown-ish text, drawn. `streaming` marks the end of a reply still arriving. */
export function Prose({ text, streaming }: { text: string; streaming?: boolean }) {
  const blocks = parseBlocks(text, { rich: true });
  return (
    <div className={`nl-prose${streaming ? ' nl-typing' : ''}`}>
      {blocks.map((b, i) => (
        <BlockView key={i} b={b} k={`b${i}`} />
      ))}
    </div>
  );
}
