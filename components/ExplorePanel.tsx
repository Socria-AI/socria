'use client';

// Acting on a node opens this. Four modes share the drawer — explore the idea,
// challenge it, research the evidence, trace where it came from — and all four
// stop short of resolving it. Whatever the mode, the node keeps ONE thread, so
// the conversation about a piece of reasoning survives switching lenses on it.

import { useEffect, useRef, useState } from 'react';
import type { LogosNodeType } from '@/lib/logos';
import { MODE_META, type ExploreResult, type NodeMode } from '@/lib/logos-explore';
import { NodeGlyph } from './NodeGlyph';
import { MathText } from './TeX';

export type FocusMsg = { role: 'user' | 'assistant'; content: string };

const LOADING_COPY: Record<NodeMode, string> = {
  explore: 'Looking at what’s known about this…',
  challenge: 'Working out where this would break…',
  research: 'Checking what the evidence actually says…',
  trace: 'Retracing where this came from…',
};

const POINTS_LABEL: Partial<Record<NodeMode, string>> = {
  challenge: 'Where it takes weight',
  research: 'What the material shows',
};

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

export function ExplorePanel({
  open,
  mode,
  loading,
  error,
  node,
  data,
  lineage,
  thread,
  streaming,
  busy,
  threadError,
  onSend,
  onMode,
  onClose,
}: {
  open: boolean;
  mode: NodeMode;
  loading: boolean;
  error: string | null;
  node: { label: string; type: LogosNodeType } | null;
  data: ExploreResult | null;
  /** how this node sits in the map right now — computed, never model-authored */
  lineage: string[];
  thread: FocusMsg[];
  streaming: string;
  busy: boolean;
  threadError: string | null;
  onSend: (text: string) => void;
  onMode: (mode: NodeMode) => void;
  onClose: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const [broken, setBroken] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const [draft, setDraft] = useState('');
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);

  const images = (data?.images ?? []).filter((i) => !broken.has(i.url));

  useEffect(() => {
    setSlide(0);
  }, [data]);

  // Each node keeps its own draft; switching nodes shouldn't carry text over.
  useEffect(() => {
    setDraft('');
    if (taRef.current) taRef.current.style.height = 'auto';
  }, [node?.label]);

  // Follow the conversation as it grows — but never on open. Reopening a node
  // should land you back on the framing, not scrolled past it.
  const settled = useRef<string | null>(null);
  useEffect(() => {
    const here = node?.label ?? null;
    if (settled.current !== here) {
      settled.current = here;
      return;
    }
    if (thread.length || streaming) {
      endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [thread.length, streaming, node?.label]);

  function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    if (taRef.current) taRef.current.style.height = 'auto';
    onSend(text);
  }

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

      {/* Switch how you're looking at the same node without losing the thread. */}
      <div className="lg-x-modes" role="tablist" aria-label="How to look at this">
        {(Object.keys(MODE_META) as NodeMode[]).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            className={`lg-x-mode${mode === m ? ' is-on' : ''}`}
            onClick={() => onMode(m)}
          >
            {MODE_META[m].label}
          </button>
        ))}
      </div>

      <div className="lg-x-body">
        {loading && (
          <div className="lg-x-loading">
            <span className="lg-thinking" aria-label="Working">
              <span /> <span /> <span />
            </span>
            <p>{LOADING_COPY[mode]}</p>
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
                  {images[slide]?.link && (
                    <a
                      className="lg-x-imgsrc"
                      href={images[slide].link}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={images[slide].title || 'Open image source'}
                    >
                      {hostOf(images[slide].link!)} <span aria-hidden="true">↗</span>
                    </a>
                  )}
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

            {MODE_META[mode].searches && (
              <span className="lg-x-concept">{data.concept}</span>
            )}
            {data.framing && (
              <p className="lg-x-framing">
                <MathText>{data.framing}</MathText>
              </p>
            )}

            {/* Trace: the actual moments this grew out of, sliced from the
                transcript rather than written by the model. */}
            {!!data.origins?.length && (
              <div className="lg-x-origins">
                <span className="lg-x-block-label">First said</span>
                {data.origins.map((o, i) => (
                  <blockquote key={i} className={`lg-x-origin lg-x-origin-${o.who}`}>
                    <span className="lg-x-origin-who">{o.who === 'you' ? 'You' : 'Logos'}</span>
                    <MathText>{o.quote}</MathText>
                  </blockquote>
                ))}
              </div>
            )}

            {mode === 'trace' && lineage.length > 0 && (
              <div className="lg-x-lineage">
                <span className="lg-x-block-label">Where it sits now</span>
                <ul>
                  {lineage.map((l, i) => (
                    <li key={i}>{l}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Challenge: pressure points. Research: findings. Same shape. */}
            {!!data.points?.length && (
              <div className={`lg-x-points lg-x-points-${mode}`}>
                <span className="lg-x-block-label">{POINTS_LABEL[mode] ?? 'Points'}</span>
                <ul>
                  {data.points.map((p, i) => (
                    <li key={i}><MathText>{p}</MathText></li>
                  ))}
                </ul>
              </div>
            )}

            {data.connection && (
              <p className="lg-x-connection">
                <MathText>{data.connection}</MathText>
              </p>
            )}

            {data.question && (
              <p className="lg-x-question">
                <MathText>{data.question}</MathText>
              </p>
            )}

            {data.sources.length > 0 && (
              <div className="lg-x-sources">
                <span className="lg-x-sources-label">Sources</span>
                {data.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer">
                    <span className="lg-x-src-title">
                      {s.title}
                      {s.cited && <span className="lg-x-cited">cited</span>}
                    </span>
                    <span className="lg-x-src-site">
                      {s.site} <span aria-hidden="true">↗</span>
                    </span>
                  </a>
                ))}
              </div>
            )}

            {MODE_META[mode].searches && data.sources.length === 0 && (
              <p className="lg-x-nosources">
                No web sources for this one — the framing above is conceptual,
                and nothing was cited.
              </p>
            )}

            <p className="lg-x-fine">
              {mode === 'challenge'
                ? 'Pressure, not a verdict — whether it holds is yours to test.'
                : mode === 'trace'
                  ? 'A record of how you got here, not a judgement on it.'
                  : 'Context, not conclusions — the thinking stays yours.'}
            </p>
          </>
        )}

        {/* The node's own thread — narrower than the main conversation,
            kept with the node so reopening it resumes where you left off. */}
        {(thread.length > 0 || streaming || threadError) && (
          <div className="lg-x-thread">
            <span className="lg-x-thread-label">Thinking about this</span>
            {thread.map((m, i) => (
              <div key={i} className={`lg-x-turn lg-x-turn-${m.role}`}>
                <MathText>{m.content}</MathText>
              </div>
            ))}
            {streaming && (
              <div className="lg-x-turn lg-x-turn-assistant">
                <MathText>{streaming}</MathText>
              </div>
            )}
            {busy && !streaming && (
              <div className="lg-x-turn lg-x-turn-assistant">
                <span className="lg-thinking" aria-label="Thinking">
                  <span /> <span /> <span />
                </span>
              </div>
            )}
            {threadError && <p className="lg-x-error">{threadError}</p>}
          </div>
        )}
        <div ref={endRef} />
      </div>

      {!loading && (data || thread.length > 0) && (
        <div className="lg-x-ask">
          <textarea
            ref={taRef}
            rows={1}
            value={draft}
            placeholder={
              thread.length ? 'Keep going…' : 'Answer it, push back, or think out loud…'
            }
            disabled={busy}
            onChange={(e) => {
              setDraft(e.target.value);
              const el = e.target;
              el.style.height = 'auto';
              el.style.height = Math.min(el.scrollHeight, 120) + 'px';
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
          />
          <button
            type="button"
            onClick={submit}
            disabled={!draft.trim() || busy}
            aria-label="Send"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
