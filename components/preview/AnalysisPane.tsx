'use client';

// components/preview/AnalysisPane.tsx — "Analysis": Socria's reading of the document, beside the file.
//
// Compressed by default and opened by the person: the gist first, then what it
// finds, how it argues, what it admits, its terms, its tables and charts, its
// contents — each a fold, the first open. Socria's words are set plain; the
// document's own words, cut from its passages, are set as quotations with their
// page; a press on a page opens the file there with the passage marked
// (FilePreview). What Socria takes for granted is labelled as its reading.
//
// What costs nothing is shown at once: how well the file was read and its
// contents (both computed from the reading). The analysis itself — one model
// call — is made only when "Read it for me" is pressed, and kept on this
// device (lib/docs/brief-store.ts) so it is never asked for twice.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { qualityOf, restoreBrief, structureOf, type BriefCite, type BriefItem, type DocBrief } from '@/lib/docs/brief';
import { argumentDiagram, termsDiagram, type BriefDiagram } from '@/lib/docs/brief-map';
import { getBrief, putBrief } from '@/lib/docs/brief-store';
import { endActivity, setActivity } from '@/lib/activity';
import type { SourceDoc } from '@/lib/docs/types';
import { fold, unitOf } from '@/lib/preview/locate';

/** A quotation that only repeats Socria's sentence says nothing more: shown once. */
const repeats = (text: string, quote: string) => {
  const a = fold(text).replace(/[^a-z0-9 ]/g, '');
  const b = fold(quote).replace(/[^a-z0-9 ]/g, '').replace(/ ?$/, '');
  return a === b || a.includes(b) || (b.includes(a) && a.length >= b.length * 0.8);
};

type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; says: string; retry: boolean };

export function AnalysisPane({
  doc,
  headers,
  onGo,
  onAskText,
  onMap,
}: {
  doc: SourceDoc;
  headers: () => Record<string, string>;
  /** open the file at a passage */
  onGo: (block: string) => void;
  /** put a question in the composer */
  onAskText?: (text: string) => void;
  /** file a drawing of the analysis in Artifacts */
  onMap?: (d: BriefDiagram) => void;
}) {
  const [brief, setBrief] = useState<DocBrief | null>(null);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [looked, setLooked] = useState(false);
  const quality = useMemo(() => qualityOf(doc), [doc]);
  const structure = useMemo(() => structureOf(doc), [doc]);
  const unit = unitOf(doc.format);
  const pageWord = unit === 'Page' ? 'p.' : unit.toLowerCase();

  // a reading kept on this device: read back against the document as it is now
  useEffect(() => {
    let live = true;
    setBrief(null);
    setLooked(false);
    void getBrief(doc.id)
      .then((raw) => {
        if (!live) return;
        const b = raw ? restoreBrief(raw, doc) : null;
        if (b) setBrief(b);
      })
      .finally(() => live && setLooked(true));
    return () => {
      live = false;
    };
  }, [doc]);

  const make = async () => {
    setStatus({ kind: 'loading' });
    setNote('');
    // said above the chatbox too, so it is seen from the conversation while the preview is aside
    setActivity(`brief:${doc.id}`, `Analysing ${doc.name}…`);
    try {
      const r = await fetch('/api/docs/brief', { method: 'POST', headers: { 'content-type': 'application/json', ...headers() }, body: JSON.stringify({ doc }) });
      const j = (await r.json().catch(() => null)) as { brief?: unknown; note?: string; error?: string } | null;
      if (!r.ok || !j?.brief) {
        const says =
          j?.error ||
          (r.status === 429 ? 'Socria is resting for now — try again later.' : r.status === 402 ? 'This month’s documents are used up on your plan.' : 'Socria could not read this document just now.');
        setStatus({ kind: 'error', says, retry: r.status >= 500 || r.status === 0 });
        return;
      }
      const b = restoreBrief({ ...(j.brief as object), at: Date.now() }, doc);
      if (!b) {
        setStatus({ kind: 'error', says: 'What came back could not be checked against this document.', retry: true });
        return;
      }
      setBrief(b);
      setNote(j.note ?? '');
      setStatus({ kind: 'idle' });
      void putBrief(b);
    } catch {
      setStatus({ kind: 'error', says: 'Socria could not be reached. Check the connection and try again.', retry: true });
    } finally {
      endActivity(`brief:${doc.id}`);
    }
  };

  const Pages = ({ cites }: { cites: BriefCite[] }) => {
    const seen = new Set<number>();
    const list = cites.filter((c) => !seen.has(c.page) && seen.add(c.page)).slice(0, 3);
    if (!list.length) return null;
    return (
      <span className="fp-an-pgs">
        {list.map((c) => (
          <button key={c.block} type="button" className="fp-an-pg" onClick={() => onGo(c.block)} aria-label={`Show ${unit.toLowerCase()} ${c.page} in the file, with the passage marked`}>
            {pageWord} {c.page}
          </button>
        ))}
      </span>
    );
  };
  const Item = ({ it, reading }: { it: BriefItem; reading?: boolean }) => (
    <li className={`fp-an-item${reading ? ' is-reading' : ''}`}>
      <p className="fp-an-say">
        {reading && <span className="fp-an-tag">Socria’s reading</span>}
        {it.ground === 'derived' && <span className="fp-an-tag">calculated</span>}
        {it.text} <Pages cites={it.cites} />
      </p>
      {it.quote && !repeats(it.text, it.quote) && <blockquote className="fp-an-quote">{it.quote}</blockquote>}
    </li>
  );

  const terms = brief && onMap ? termsDiagram(brief, pageWord) : null;
  const argument = brief && onMap ? argumentDiagram(brief, pageWord) : null;
  const pagesRead = quality.pages;

  return (
    <div className="fp-an" aria-live="polite" aria-busy={status.kind === 'loading'}>
      <p className={`fp-an-quality is-${quality.level}`}>
        <span className="fp-an-dot" aria-hidden="true" />
        {quality.says}
      </p>

      {!brief && looked && status.kind !== 'loading' && (
        <div className="fp-an-start">
          <p className="fp-an-lede">Socria can read this for you: what it finds, how it argues, the terms it rests on, what its tables show and what it admits — each point linked to its {unit.toLowerCase()}.</p>
          <button type="button" className="l5-btn is-primary" onClick={make}>
            Read it for me
          </button>
          <p className="fp-an-small">Nothing is kept anywhere but this device. Points the document does not bear out are left out.</p>
        </div>
      )}

      {status.kind === 'loading' && (
        <div className="fp-an-loading" role="status">
          <p className="fp-an-small">
            Reading {pagesRead} {unit.toLowerCase()}
            {pagesRead === 1 ? '' : 's'} and checking every point against them…
          </p>
          <span className="fp-an-bar" />
          <span className="fp-an-bar is-short" />
          <span className="fp-an-bar" />
        </div>
      )}

      {status.kind === 'error' && (
        <p className="fp-an-error" role="alert">
          {status.says}{' '}
          {status.retry && (
            <button type="button" className="l5-link" onClick={make}>
              Try again
            </button>
          )}
        </p>
      )}

      {brief && (
        <>
          {brief.gist && (
            <p className="fp-an-gist">
              {brief.gist} <Pages cites={brief.gistCites} />
            </p>
          )}
          {note && <p className="fp-an-note">{note}</p>}
          {!brief.plain && <p className="fp-an-legend">Socria’s words are set plain; the document’s own words are set as quotations. Press a {unit.toLowerCase()} to see the passage in the file.</p>}

          <Fold title="What it finds" n={brief.findings.length} open>
            <ol className="fp-an-list">
              {brief.findings.map((f, i) => (
                <Item key={i} it={f} />
              ))}
            </ol>
          </Fold>

          <Fold title="How it argues" n={brief.claims.length} open={!brief.findings.length}>
            {brief.claims.map((c, i) => (
              <div key={i} className="fp-an-claim">
                <p className="fp-an-say is-claim">
                  {c.text} <Pages cites={c.cites} />
                </p>
                {c.quote && !repeats(c.text, c.quote) && <blockquote className="fp-an-quote">{c.quote}</blockquote>}
                {c.evidence.length > 0 && (
                  <>
                    <h5 className="fp-an-sub">Because</h5>
                    <ul className="fp-an-list">
                      {c.evidence.map((e, j) => (
                        <Item key={j} it={e} />
                      ))}
                    </ul>
                  </>
                )}
                {c.assumptions.length > 0 && (
                  <>
                    <h5 className="fp-an-sub">Assumes</h5>
                    <ul className="fp-an-list">
                      {c.assumptions.map((a, j) => (
                        <Item key={j} it={a} reading />
                      ))}
                    </ul>
                  </>
                )}
              </div>
            ))}
            {argument && (
              <button type="button" className="l5-link is-go fp-an-map" onClick={() => onMap?.(argument)}>
                Map the argument <span className="l5-ar">→</span>
              </button>
            )}
          </Fold>

          <Fold title="What it admits" n={brief.limits.length}>
            <ul className="fp-an-list">
              {brief.limits.map((l, i) => (
                <Item key={i} it={l} />
              ))}
            </ul>
          </Fold>

          <Fold title="Terms" n={brief.concepts.length}>
            <dl className="fp-an-terms">
              {brief.concepts.map((c, i) => (
                <div key={i} className="fp-an-term">
                  <dt>{c.term}</dt>
                  <dd>
                    {c.meaning} <Pages cites={c.cites} />
                  </dd>
                </div>
              ))}
            </dl>
            {terms && (
              <button type="button" className="l5-link is-go fp-an-map" onClick={() => onMap?.(terms)}>
                Map the terms <span className="l5-ar">→</span>
              </button>
            )}
          </Fold>

          <Fold title="Tables and charts" n={brief.data.length}>
            <ul className="fp-an-list">
              {brief.data.map((d) => (
                <li key={d.block} className="fp-an-item">
                  <p className="fp-an-say">
                    <span className="fp-an-label">{d.label}</span>
                    {d.says ? ` — ${d.says}` : ''} <Pages cites={[{ block: d.block, page: d.page }]} />
                  </p>
                  {d.described && <p className="fp-an-small">Described from its picture, so it gives no exact values.</p>}
                </li>
              ))}
            </ul>
          </Fold>
        </>
      )}

      <Fold title="Contents" n={structure.length} open={!brief && looked && status.kind === 'idle'}>
        <ol className="fp-an-toc">
          {structure.map((h) => (
            <li key={h.block} style={{ paddingLeft: `${Math.max(0, h.level - 1) * 14}px` }}>
              <button type="button" onClick={() => onGo(h.block)}>
                <span>{h.text}</span>
                <span className="fp-an-tocpg">{h.page}</span>
              </button>
            </li>
          ))}
        </ol>
      </Fold>

      {brief && brief.questions.length > 0 && onAskText && (
        <section className="fp-an-next" aria-label="Questions to ask next">
          <h4 className="fp-an-h">Ask next</h4>
          <ul>
            {brief.questions.map((q) => (
              <li key={q}>
                <button type="button" onClick={() => onAskText(q)}>
                  {q}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {brief && (
        <p className="fp-an-foot">
          {brief.plain
            ? 'Made from the reading alone, without Socria’s analysis.'
            : brief.read.total > brief.read.shown
              ? `Socria read ${brief.read.shown} of the ${brief.read.total} passages: every heading, the opening of each section, every table, and a spread of the rest.`
              : 'Socria read the whole document.'}
          {brief.dropped > 0 ? ` ${brief.dropped} point${brief.dropped === 1 ? ' was' : 's were'} left out because the document did not bear ${brief.dropped === 1 ? 'it' : 'them'} out.` : ''}{' '}
          <button type="button" className="l5-link is-meta" onClick={make} disabled={status.kind === 'loading'}>
            Read it again
          </button>
        </p>
      )}
    </div>
  );
}

function Fold({ title, n, open, children }: { title: string; n: number; open?: boolean; children: ReactNode }) {
  if (!n) return null;
  return (
    <details className="fp-an-fold" open={open}>
      <summary>
        <span className="fp-an-h">{title}</span>
        <span className="fp-an-n">{n}</span>
      </summary>
      <div className="fp-an-body">{children}</div>
    </details>
  );
}
