'use client';

// Clicking a node opens this: what the world knows about that idea, tied
// back to the person's own words, ending in a question rather than an
// answer. A drawer over the map, never a replacement for it.

import { useEffect, useState } from 'react';
import type { LogosNodeType } from '@/lib/logos';
import type { ExploreResult } from '@/lib/logos-explore';
import { NodeGlyph } from './NodeGlyph';

export function ExplorePanel({
  open,
  loading,
  error,
  node,
  data,
  onClose,
}: {
  open: boolean;
  loading: boolean;
  error: string | null;
  node: { label: string; type: LogosNodeType } | null;
  data: ExploreResult | null;
  onClose: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);

  const images = (data?.images ?? []).filter((i) => !broken.has(i.url));

  useEffect(() => {
    setSlide(0);
  }, [data]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // Gentle auto-advance; pauses while the reader is on it.
  useEffect(() => {
    if (!open || paused || images.length < 2) return;
    const t = setInterval(() => setSlide((s) => (s + 1) % images.length), 4200);
    return () => clearInterval(t);
  }, [open, paused, images.length]);

  if (!open) return null;

  return (
    <div className="lg-explore" role="dialog" aria-label="Explore this idea">
      <header className="lg-x-head">
        <div className="lg-x-title">
          {node && (
            <span className={`lg-x-chip lg-node-${node.type}`}>
              <NodeGlyph type={node.type} />
              {node.type}
            </span>
          )}
          <span className="lg-x-label">{node?.label}</span>
        </div>
        <button type="button" onClick={onClose} className="lg-x-close" aria-label="Close">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      <div className="lg-x-body">
        {loading && (
          <div className="lg-x-loading">
            <span className="lg-thinking" aria-label="Looking">
              <span /> <span /> <span />
            </span>
            <p>Looking at what&rsquo;s known about this…</p>
          </div>
        )}

        {error && !loading && <p className="lg-x-error">{error}</p>}

        {data && !loading && (
          <>
            {images.length > 0 && (
              <div
                className="lg-x-slides"
                onMouseEnter={() => setPaused(true)}
                onMouseLeave={() => setPaused(false)}
              >
                <div className="lg-x-frame">
                  {images.map((img, i) => (
                    <img
                      key={img.url}
                      src={img.url}
                      alt={img.title || ''}
                      className={i === slide ? 'is-on' : undefined}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setBroken((b) => {
                          const n = new Set(b);
                          n.add(img.url);
                          return n;
                        })
                      }
                    />
                  ))}
                </div>
                {images.length > 1 && (
                  <div className="lg-x-dots">
                    {images.map((img, i) => (
                      <button
                        key={img.url}
                        type="button"
                        className={i === slide ? 'is-on' : undefined}
                        onClick={() => setSlide(i)}
                        aria-label={`Image ${i + 1}`}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            <span className="lg-x-concept">{data.concept}</span>
            {data.framing && <p className="lg-x-framing">{data.framing}</p>}

            {data.connection && (
              <p className="lg-x-connection">{data.connection}</p>
            )}

            {data.question && <p className="lg-x-question">{data.question}</p>}

            {data.sources.length > 0 && (
              <div className="lg-x-sources">
                <span className="lg-x-sources-label">Sources</span>
                {data.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                    <span className="lg-x-src-title">{s.title}</span>
                    <span className="lg-x-src-site">
                      {s.site} <span aria-hidden="true">↗</span>
                    </span>
                  </a>
                ))}
              </div>
            )}

            <p className="lg-x-fine">
              Context, not conclusions — the thinking stays yours.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
