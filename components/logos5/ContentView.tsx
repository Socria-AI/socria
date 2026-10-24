'use client';
// components/logos5/ContentView.tsx — CONTENT (Alex Tran: formerly "Components").
//
// What was brought to this line of thinking — documents, notes, sources —
// as cards on a canvas the person arranges: drag a card anywhere, drop it on
// another to stack them, open one to read it. Below them, when the files were
// sorted into topics, the topics.
//
// Every drag has another way: a focused card moves with the arrow keys
// (Shift for a longer step), and its menu stacks it onto another card or
// takes it out of a stack. Where things sit is kept on this device
// (lib/logos5/contentBoard.ts); the documents are never changed.

import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as RPointerEvent, type ReactNode } from 'react';
import { CARD, EMPTY_BOARD, moveTo, nudge, placeAll, prune, readBoard, stackOf, stackOnto, unstack, writeBoard, type Board } from '@/lib/logos5/contentBoard';

export interface ContentItem {
  id: string;
  title: string;
  /** "PDF · 12 pages" */
  meta: string;
  snippet?: string;
}

const store = () => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

interface DragState {
  id: string;
  pointer: number;
  x0: number;
  y0: number;
  from: { x: number; y: number };
  moved: boolean;
  at: { x: number; y: number };
}

export function ContentView({
  session,
  items,
  opened,
  onOpen,
  onBack,
  reader,
  topics,
  reading,
  onFiles,
  narrow,
}: {
  session: string;
  items: ContentItem[];
  /** the document being read, if one is */
  opened: string | null;
  onOpen: (id: string) => void;
  onBack: () => void;
  /** the reader for the opened document */
  reader: ReactNode | null;
  /** the topics the files were sorted into, when they were */
  topics: ReactNode | null;
  /** files being read on this device, said truthfully */
  reading: string | null;
  onFiles: (files: File[]) => void;
  narrow: boolean;
}) {
  const [board, setBoard] = useState<Board>(EMPTY_BOARD);
  const [width, setWidth] = useState(720);
  const [drag, setDrag] = useState<DragState | null>(null);
  const [menu, setMenu] = useState<string | null>(null);
  const [spread, setSpread] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  /** a drag that moved a card is not also a press that opens it */
  const moved = useRef(false);
  const ids = useMemo(() => items.map((i) => i.id), [items]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  useEffect(() => setBoard(prune(readBoard(store(), session), ids)), [session, ids]);
  const save = (b: Board) => {
    setBoard(b);
    writeBoard(store(), session, b);
  };
  useLayoutEffect(() => {
    const el = canvas.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [opened]);

  const placed = useMemo(() => placeAll(board, ids, width), [board, ids, width]);
  const height = Math.max(CARD.h + 24, ...placed.map((p) => p.y + CARD.h + 24));

  const dropTarget = (x: number, y: number, self: string): string | null => {
    const hit = placed.find((p) => p.id !== self && x >= p.x && x <= p.x + CARD.w && y >= p.y && y <= p.y + CARD.h);
    return hit?.id ?? null;
  };
  const onDown = (e: RPointerEvent<HTMLDivElement>, id: string, at: { x: number; y: number }) => {
    if ((e.target as HTMLElement).closest('.l5c-more, .l5c-count, .l5c-menu, .l5c-spread') || e.button !== 0) return;
    moved.current = false;
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    setDrag({ id, pointer: e.pointerId, x0: e.clientX, y0: e.clientY, from: at, moved: false, at });
  };
  const onMove = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const dx = e.clientX - drag.x0;
    const dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    moved.current = true;
    setDrag({ ...drag, moved: true, at: { x: Math.max(0, drag.from.x + dx), y: Math.max(0, drag.from.y + dy) } });
  };
  const onUp = (e: RPointerEvent<HTMLDivElement>) => {
    if (!drag || drag.pointer !== e.pointerId) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) return;
    const target = dropTarget(d.at.x + CARD.w / 2, d.at.y + CARD.h / 2, d.id);
    const st = stackOf(board, d.id);
    if (target) save(stackOnto(board, st ? st.items[0] : d.id, target));
    else save(moveTo(board, d.id, d.at.x, d.at.y));
  };
  const onKey = (e: KeyboardEvent<HTMLButtonElement>, id: string, at: { x: number; y: number }) => {
    const step = e.shiftKey ? 64 : 16;
    const d = e.key === 'ArrowLeft' ? [-step, 0] : e.key === 'ArrowRight' ? [step, 0] : e.key === 'ArrowUp' ? [0, -step] : e.key === 'ArrowDown' ? [0, step] : null;
    if (!d) return;
    e.preventDefault();
    save(nudge(board, id, at, d[0], d[1]));
  };

  const drop = (
    <label
      className={`l5c-drop${over ? ' is-over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const files = Array.from(e.dataTransfer.files ?? []);
        if (files.length) onFiles(files);
      }}
    >
      <input
        type="file"
        multiple
        className="l5c-file"
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []);
          e.target.value = '';
          if (files.length) onFiles(files);
        }}
      />
      <span className="l5c-drop-t">{reading ?? (items.length ? 'Add documents, notes or PDFs' : 'Bring your material here')}</span>
      {!reading && <span className="l5c-drop-s">{items.length ? 'Drop files, or choose them' : 'Drop documents, notes or PDFs — or attach them in the chat. They are read on this device.'}</span>}
    </label>
  );

  if (opened && reader) {
    return (
      <section className="l5c" aria-label="Content">
        <div className="l5c-readhead">
          <button type="button" className="l5v-link" onClick={onBack}>
            ← All content
          </button>
          <span className="l5c-readt">{byId.get(opened)?.title ?? 'Document'}</span>
        </div>
        <div className="l5c-reader">{reader}</div>
      </section>
    );
  }

  return (
    <section className="l5c" aria-label="Content">
      {items.length ? (
        <>
          <p className="l5c-help" id="l5c-help">
            Drag a card to place it, or onto another to stack them. With the keyboard: arrows move a card, Enter opens it.
          </p>
          <div ref={canvas} className="l5c-canvas" style={{ height }} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={() => setDrag(null)}>
            {placed.map((p) => {
              const top = byId.get(p.id);
              if (!top) return null;
              const moving = drag?.id === p.id && drag.moved;
              const at = moving ? drag!.at : p;
              const n = p.stack?.items.length ?? 1;
              const others = placed.filter((o) => o.id !== p.id);
              return (
                <div
                  key={p.id}
                  className={`l5c-card${moving ? ' is-moving' : ''}${n > 1 ? ' is-stack' : ''}`}
                  style={{ transform: `translate(${at.x}px, ${at.y}px)`, width: CARD.w, height: CARD.h }}
                  onPointerDown={(e) => onDown(e, p.id, { x: p.x, y: p.y })}
                >
                  <button
                    type="button"
                    className="l5c-open"
                    aria-describedby="l5c-help"
                    aria-label={`${top.title}${n > 1 ? `, a stack of ${n}` : ''}. ${top.meta}. Open`}
                    onKeyDown={(e) => onKey(e, p.id, { x: p.x, y: p.y })}
                    onClick={() => {
                      if (moved.current) {
                        moved.current = false;
                        return;
                      }
                      onOpen(p.id);
                    }}
                  >
                    <span className="l5c-meta">{top.meta}</span>
                    <span className="l5c-t">{top.title}</span>
                    {top.snippet && <span className="l5c-snip">{top.snippet}</span>}
                  </button>
                  {n > 1 && (
                    <button type="button" className="l5c-count" aria-expanded={spread === p.id} onClick={() => setSpread((s) => (s === p.id ? null : p.id))}>
                      {n} in this stack
                    </button>
                  )}
                  <button type="button" className="l5c-more" aria-label={`More for ${top.title}`} aria-haspopup="menu" aria-expanded={menu === p.id} onClick={() => setMenu((m) => (m === p.id ? null : p.id))}>
                    ⋯
                  </button>
                  {menu === p.id && (
                    <div className="l5c-menu" role="menu" aria-label={`${top.title}`}>
                      <button type="button" role="menuitem" onClick={() => (setMenu(null), onOpen(p.id))}>
                        Open
                      </button>
                      {others.slice(0, 8).map((o) => (
                        <button key={o.id} type="button" role="menuitem" onClick={() => (setMenu(null), save(stackOnto(board, p.id, o.id)))}>
                          Stack onto “{byId.get(o.id)?.title ?? 'card'}”
                        </button>
                      ))}
                      {n > 1 && (
                        <button type="button" role="menuitem" onClick={() => (setMenu(null), save(unstack(board, p.id, { x: p.x, y: p.y })))}>
                          Take the top card out
                        </button>
                      )}
                    </div>
                  )}
                  {spread === p.id && p.stack && (
                    <ul className="l5c-spread" aria-label="In this stack">
                      {p.stack.items.map((x) => (
                        <li key={x}>
                          <button type="button" className="l5v-link" onClick={() => onOpen(x)}>
                            {byId.get(x)?.title ?? 'Document'}
                          </button>
                          <button type="button" className="l5c-out" aria-label={`Take “${byId.get(x)?.title ?? 'it'}” out of the stack`} onClick={() => save(unstack(board, x, { x: p.x, y: p.y }))}>
                            Take out
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
          {drop}
        </>
      ) : (
        drop
      )}
      {topics && (
        <div className={`l5c-topics${narrow ? ' is-narrow' : ''}`}>
          <h2 className="l5c-h">Topics</h2>
          {topics}
        </div>
      )}
    </section>
  );
}

/** A note or a picture, read in Content: the words as they were given, the picture as it was shown and what was read in it. */
export function PlainReader({ text, image, caption }: { text?: string; image?: string; caption?: string }) {
  return (
    <article className="l5c-plain">
      {image && (
        // a data URL of the person's own picture, kept small when it was attached
        // eslint-disable-next-line @next/next/no-img-element
        <img className="l5c-img" src={image} alt={caption ? `The picture: ${caption.slice(0, 120)}` : 'The picture that was attached'} />
      )}
      {caption && (
        <p className="l5c-caption">
          <b>Read in it:</b> {caption}
        </p>
      )}
      {text && <div className="l5c-text">{text}</div>}
      {!image && !text && !caption && <p className="l5c-caption">This is not on this device any more.</p>}
    </article>
  );
}
