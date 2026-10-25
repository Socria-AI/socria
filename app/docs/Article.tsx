// app/docs/Article.tsx — the building blocks every docs page is written with.
//
// Server components: the prose ships as HTML. The only client piece in the
// wiki is the shell's sidebar.

import Link from 'next/link';
import type { ReactNode } from 'react';
import { neighbors, type DocPage, type DocSection } from './registry';

export function Article({
  page,
  sections = [],
  children,
}: {
  page: DocPage;
  /** the on-this-page strip; each id must match an H2 below */
  sections?: DocSection[];
  children: ReactNode;
}) {
  const { prev, next } = neighbors(page.slug);
  return (
    <article className="d-article">
      <span className="d-kicker">{page.group}</span>
      <h1>{page.title}</h1>
      <p className="d-lead">{page.blurb}</p>
      {page.archived && <ArchivedNote page={page} />}
      {sections.length > 1 && (
        <nav className="d-toc" aria-label="On this page">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`}>{s.heading}</a>
          ))}
        </nav>
      )}
      {children}
      <nav className="d-pn" aria-label="More pages">
        {prev && (
          <Link href={prev.slug === 'overview' ? '/docs' : `/docs/${prev.slug}`} className="prev">
            <span className="lbl">Previous</span>
            <span className="ttl">{prev.title}</span>
          </Link>
        )}
        {next && (
          <Link href={`/docs/${next.slug}`} className="next">
            <span className="lbl">Next</span>
            <span className="ttl">{next.title}</span>
          </Link>
        )}
      </nav>
    </article>
  );
}

/**
 * The banner every archived page opens with, drawn from the registry so they
 * all say the same three things: when, what replaced it, and that nothing a
 * person wrote went anywhere.
 */
function ArchivedNote({ page }: { page: DocPage }) {
  const a = page.archived!;
  return (
    <aside className="d-archived" aria-label="Archived">
      <span className="d-callout-tag">Archived</span>
      <p>
        <strong>{a.what} is no longer offered.</strong> It was archived {a.on}, and gave way to{' '}
        {a.replacedBy}. Conversations from it open in <Link href="/docs/logos-5">Logos 5</Link> —
        nothing was deleted. This page is kept as a record of how it worked, so it describes it as it
        was; <Link href="/docs/history">the history</Link> says where it sits among the rest.
      </p>
    </aside>
  );
}

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id}>
      {children}
      <a href={`#${id}`} className="d-hash" aria-label="Link to this section">#</a>
    </h2>
  );
}

export function Callout({
  tag,
  warn = false,
  children,
}: {
  tag: string;
  warn?: boolean;
  children: ReactNode;
}) {
  return (
    <aside className={`d-callout${warn ? ' is-warn' : ''}`}>
      <span className="d-callout-tag">{tag}</span>
      {children}
    </aside>
  );
}

export function Defs({ children }: { children: ReactNode }) {
  return <dl className="d-defs">{children}</dl>;
}

export function Def({ term, children }: { term: ReactNode; children: ReactNode }) {
  return (
    <div className="d-def">
      <dt>{term}</dt>
      <dd>{children}</dd>
    </div>
  );
}

export function TableWrap({ children }: { children: ReactNode }) {
  return <div className="d-tablewrap">{children}</div>;
}
