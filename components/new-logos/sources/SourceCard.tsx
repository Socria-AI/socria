'use client';
// components/new-logos/sources/SourceCard.tsx — a source PLACED ON A CANVAS: a lightweight reference to the library's
// record (a canvas layout item s:<id>), never a copy. Closed, it is a compact preview — the file's name, how well it
// was read and its opening words; open, its outline (each heading opens the source in focus there) and what uses it;
// "Focus" opens the whole of it over the canvas. Drag its circle onto a question, a finding, a decision or an artifact
// and that component refers to it. "Take off this canvas" removes this placement only: the source stays in the
// library, and every reference to it stays.

import { useEffect } from 'react';
import { excerptOf, outlineOf, statusLabel, type SourceMeta } from '@/lib/new-logos/sources';
import { Menu } from '../ui';
import { SourceGlyph } from './Library';
import { useSources } from './state';

export function SourceCard({ source, open, onToggle, onRemove, usedBy }: { source: SourceMeta; open: boolean; onToggle: () => void; onRemove: () => void; usedBy: number }) {
  const { reading, readingNow, openViewer } = useSources();
  const doc = readingNow(source.id);
  useEffect(() => {
    void reading(source.id);
  }, [reading, source.id]);
  const outline = outlineOf(doc, 10);
  const opening = excerptOf(doc, null, open ? 420 : 160);
  return (
    <div className={`nl-card is-source${open ? ' is-open' : ''}`}>
      <div className="nl-card-head" data-drag title="Drag to move">
        <span className="nl-card-grip" aria-hidden="true" />
        <SourceGlyph kind={source.kind} />
        <span className="nl-card-kicker">
          Source{source.format ? ` · ${source.format.toUpperCase()}` : ''}
          {usedBy ? ` · used by ${usedBy}` : ''}
        </span>
        <span className="nl-grow" />
        <Menu label="Source actions">
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => (close(), openViewer({ sourceId: source.id }))}>
                Focus
              </button>
              <button type="button" role="menuitem" onClick={() => (close(), onRemove())}>
                Take off this canvas
              </button>
            </>
          )}
        </Menu>
        <button type="button" className="nl-icon-btn nl-card-toggle" aria-expanded={open} aria-label={open ? 'Close' : 'Open'} onClick={onToggle}>
          {open ? '−' : '+'}
        </button>
      </div>
      <div className="nl-card-title">{source.name}</div>
      <div className="nl-card-summary nl-src-status">{statusLabel(source, doc)}</div>
      {opening ? <div className="nl-card-summary">{opening}</div> : null}
      {open ? (
        <div className="nl-card-body nl-cv-noDrag">
          {outline.length ? (
            <ul className="nl-src-outline">
              {outline.map((h) => (
                <li key={h.id}>
                  <button type="button" className="nl-linkish" onClick={() => openViewer({ sourceId: source.id, passage: h.id })}>
                    {h.text}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="nl-row">
            <button type="button" className="nl-btn is-small" onClick={() => openViewer({ sourceId: source.id })}>
              Focus
            </button>
            <button type="button" className="nl-btn is-quiet is-small" onClick={onRemove}>
              Take off this canvas
            </button>
          </div>
          <p className="nl-hint">Drag the circle on its edge to a question, finding, decision or artifact to make it refer to this source.</p>
        </div>
      ) : null}
    </div>
  );
}
