'use client';

// components/write/Board.tsx — the Draft Space.
//
// Where an argument is put together before it is written. Ideas are dumped as
// they come — one line, one card — then sorted into piles, each of which will
// be a paragraph: a claim, what backs it, an example, the objection and the
// answer. Cards are dragged, merged, grouped and linked to the passages of the
// person's documents and the ideas on their Logic Map. Nothing is a template:
// a pile is any cards in any order, and a card's kind is a guess they change
// with one tap.
//
// What the board's shape shows (lib/write/board.ts) is said quietly on the
// card concerned, and Socria's reading of the reasoning only when asked for.
// Neither moves or rewords a card.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addCard,
  addGroup,
  CARD_KIND_LABEL,
  CARD_KINDS,
  cardsIn,
  mergeCards,
  moveCard,
  moveGroup,
  removeCards,
  removeGroup,
  renameGroup,
  unlinkCard,
  updateCard,
  groupCards,
  type Card,
  type CardKind,
  type CardLink,
  type WriteDoc,
} from '@/lib/write/doc';
import type { Hint } from '@/lib/write/board';
import type { Finding } from '@/lib/write/assist';

const isMac = () => typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** The marks a card's kind wears — its word is always beside it, never colour alone. */
const KIND_GLYPH: Record<CardKind, string> = { idea: '○', claim: '◆', evidence: '▤', example: '◇', counter: '↺', conclusion: '■', question: '?' };

export type CardAction = 'link-doc' | 'link-node' | 'link-card' | 'develop' | 'ask' | 'keep';

export function Board({
  doc,
  onChange,
  hints,
  findings,
  narrow,
  onCardAction,
  onOpenLink,
  onOutline,
  onReview,
  reviewing,
  canKeep,
}: {
  doc: WriteDoc;
  onChange: (next: WriteDoc) => void;
  hints: Hint[];
  findings: Finding[] | null;
  narrow: boolean;
  onCardAction: (card: Card, action: CardAction, anchor: DOMRect) => void;
  onOpenLink: (link: CardLink) => void;
  onOutline: (pile?: string | null) => void;
  onReview: () => void;
  reviewing: boolean;
  /** signed in: a card can be kept in memory */
  canKeep?: boolean;
}) {
  const [dump, setDump] = useState('');
  const [editing, setEditing] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [menu, setMenu] = useState<{ card: string; kind: 'kind' | 'more'; x: number; y: number } | null>(null);
  const [pileMenu, setPileMenu] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ id: string; x: number; y: number; pile: string | null; index: number } | null>(null);
  const [lit, setLit] = useState<string[]>([]);
  const dumpRef = useRef<HTMLTextAreaElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const docRef = useRef(doc);
  docRef.current = doc;

  const hintOf = useMemo(() => new Map(hints.map((h) => [h.card, h])), [hints]);
  const piles: { id: string | null; title: string }[] = useMemo(() => [{ id: null, title: '' }, ...doc.groups.map((g) => ({ id: g.id, title: g.title }))], [doc.groups]);
  const written = useMemo(() => new Set(doc.blocks.flatMap((b) => b.from ?? [])), [doc.blocks]);

  useEffect(() => {
    setSelected((s) => s.filter((id) => doc.cards.some((c) => c.id === id)));
  }, [doc.cards]);

  // ── adding ─────────────────────────────────────────────────────────
  function addFromDump(text: string, group: string | null = null) {
    // a pasted list is many cards: one a line, its bullets left behind
    const lines = text
      .split(/\n+/)
      .map((l) => l.replace(/^\s*([-*•–]|\d+[.)])\s+/, '').trim())
      .filter(Boolean);
    if (!lines.length) return;
    let d = docRef.current;
    for (const line of lines) d = addCard(d, line, { group }).doc;
    onChange(d);
  }

  // ── editing a card ─────────────────────────────────────────────────
  function startEdit(c: Card) {
    setEditing(c.id);
    setDraftText(c.text);
  }
  function saveEdit() {
    if (!editing) return;
    const c = docRef.current.cards.find((x) => x.id === editing);
    setEditing(null);
    if (!c) return;
    const text = draftText.trim();
    if (!text) onChange(removeCards(docRef.current, [c.id]));
    else if (text !== c.text) onChange(updateCard(docRef.current, c.id, { text }));
  }

  // ── moving ─────────────────────────────────────────────────────────
  function moveBy(c: Card, dy: number, dx: number) {
    const d = docRef.current;
    const at = piles.findIndex((p) => p.id === c.group);
    if (dx) {
      const to = piles[at + dx];
      if (!to) return;
      onChange(moveCard(d, c.id, to.id, cardsIn(d, to.id).length));
      return;
    }
    const list = cardsIn(d, c.group);
    const i = list.findIndex((x) => x.id === c.id);
    const j = i + dy;
    if (j < 0 || j >= list.length) return;
    onChange(moveCard(d, c.id, c.group, j));
  }

  function onGripDown(e: React.PointerEvent, c: Card) {
    if (e.button !== 0) return;
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    let moved = false;
    const target = e.currentTarget as HTMLElement;
    target.setPointerCapture?.(e.pointerId);
    const locate = (x: number, y: number): { pile: string | null; index: number } | null => {
      const els = document.elementsFromPoint(x, y);
      const pileEl = els.find((el) => (el as HTMLElement).dataset?.pile !== undefined) as HTMLElement | undefined;
      if (!pileEl) return null;
      const pile = pileEl.dataset.pile === '' ? null : pileEl.dataset.pile!;
      const cardEls = Array.from(pileEl.querySelectorAll<HTMLElement>('[data-card]')).filter((el) => el.dataset.card !== c.id);
      let index = cardEls.length;
      for (let k = 0; k < cardEls.length; k++) {
        const r = cardEls[k].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = k;
          break;
        }
      }
      return { pile, index };
    };
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 6) return;
      moved = true;
      const at = locate(ev.clientX, ev.clientY);
      setDrag({ id: c.id, x: ev.clientX, y: ev.clientY, pile: at?.pile ?? c.group, index: at?.index ?? -1 });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setDrag(null);
      if (!moved) return;
      const at = locate(ev.clientX, ev.clientY);
      if (at) onChange(moveCard(docRef.current, c.id, at.pile, at.index));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function onCardKey(e: React.KeyboardEvent, c: Card) {
    // the card's own keys, when the card itself has focus — not a key pressed on a button or box inside it
    if (editing === c.id || e.target !== e.currentTarget) return;
    const moveKeys = isMac() ? e.ctrlKey && e.shiftKey && !e.metaKey : e.altKey && e.shiftKey;
    if (moveKeys && e.key.startsWith('Arrow')) {
      e.preventDefault();
      if (e.key === 'ArrowUp') moveBy(c, -1, 0);
      else if (e.key === 'ArrowDown') moveBy(c, 1, 0);
      else if (e.key === 'ArrowLeft') moveBy(c, 0, -1);
      else moveBy(c, 0, 1);
      requestAnimationFrame(() => boardRef.current?.querySelector<HTMLElement>(`[data-card="${c.id}"]`)?.focus());
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      startEdit(c);
      return;
    }
    if (e.key === ' ') {
      e.preventDefault();
      toggle(c.id);
      return;
    }
    if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onChange(removeCards(docRef.current, [c.id]));
    }
  }

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const shapeOf = (cards: Card[]) => cards.map((c) => CARD_KIND_LABEL[c.kind]).filter((k, i, a) => a.indexOf(k) === i);

  const renderCard = (c: Card) => {
    const hint = hintOf.get(c.id);
    const isSel = selected.includes(c.id);
    const inWriting = written.has(c.id);
    return (
      <li
        key={c.id}
        data-card={c.id}
        className={`w-card is-${c.kind}${isSel ? ' is-sel' : ''}${lit.includes(c.id) ? ' is-lit' : ''}${drag?.id === c.id ? ' is-moving' : ''}`}
        tabIndex={0}
        aria-label={`${CARD_KIND_LABEL[c.kind]}: ${c.text}${isSel ? ' (selected)' : ''}`}
        onKeyDown={(e) => onCardKey(e, c)}
      >
        <div className="w-card-top">
          <button type="button" className="w-grip" aria-label="Drag to move this card" title="Drag to move" onPointerDown={(e) => onGripDown(e, c)}>
            <svg viewBox="0 0 10 16" width="8" height="13" aria-hidden="true">
              <circle cx="3" cy="3" r="1.3" />
              <circle cx="7" cy="3" r="1.3" />
              <circle cx="3" cy="8" r="1.3" />
              <circle cx="7" cy="8" r="1.3" />
              <circle cx="3" cy="13" r="1.3" />
              <circle cx="7" cy="13" r="1.3" />
            </svg>
          </button>
          <button
            type="button"
            className="w-kind"
            aria-haspopup="menu"
            aria-label={`Kind: ${CARD_KIND_LABEL[c.kind]} — change`}
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ card: c.id, kind: 'kind', x: r.left, y: r.bottom });
            }}
          >
            <span aria-hidden="true">{KIND_GLYPH[c.kind]}</span> {CARD_KIND_LABEL[c.kind]}
          </button>
          {inWriting && (
            <span className="w-in" title="Already in your writing">
              written
            </span>
          )}
          <label className="w-pick" title="Select (Space)">
            <input type="checkbox" checked={isSel} onChange={() => toggle(c.id)} aria-label="Select this card" />
          </label>
          <button
            type="button"
            className="w-more"
            aria-haspopup="menu"
            aria-label="More for this card"
            onClick={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setMenu({ card: c.id, kind: 'more', x: r.right, y: r.bottom });
            }}
          >
            ⋯
          </button>
        </div>
        {editing === c.id ? (
          <textarea
            className="w-card-edit"
            value={draftText}
            autoFocus
            rows={Math.min(8, Math.max(2, Math.ceil(draftText.length / 38)))}
            aria-label="Card text"
            onChange={(e) => setDraftText(e.target.value)}
            onBlur={saveEdit}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                saveEdit();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                setEditing(null);
              }
            }}
          />
        ) : (
          <p className="w-card-text" onClick={() => startEdit(c)}>
            {c.text}
          </p>
        )}
        {!!c.links?.length && (
          <ul className="w-links" aria-label="Linked to">
            {c.links.map((l) => (
              <li key={`${l.k}:${l.doc ?? ''}:${l.id}`} className={`w-link is-${l.k}`}>
                <button type="button" className="w-link-go" onClick={() => onOpenLink(l)} title={l.quote ? `“${l.quote}”` : l.label}>
                  <span aria-hidden="true">{l.k === 'doc' ? '¶' : l.k === 'node' ? '◆' : '↳'}</span> {l.label}
                </button>
                <button type="button" className="w-link-x" aria-label={`Unlink ${l.label}`} onClick={() => onChange(unlinkCard(docRef.current, c.id, l))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
        )}
        {hint && (
          <details className={`w-hint is-${hint.kind}`}>
            <summary>{hint.kind === 'repeat' ? 'Says the same as another card' : hint.kind === 'unsupported' ? 'Nothing backs this yet' : hint.kind === 'floating' ? 'Backs nothing yet' : hint.kind === 'unanswered' ? 'Not answered' : 'What leads here?'}</summary>
            <p>{hint.says}</p>
            {hint.kind === 'repeat' && hint.other && (
              <button type="button" className="w-mini" onClick={() => onChange(mergeCards(docRef.current, [hint.other!, c.id]).doc)}>
                Merge them
              </button>
            )}
          </details>
        )}
      </li>
    );
  };

  const menuCard = menu ? doc.cards.find((c) => c.id === menu.card) : null;

  return (
    <div className={`w-board${narrow ? ' is-narrow' : ''}`} ref={boardRef}>
      <form
        className="w-dump"
        onSubmit={(e) => {
          e.preventDefault();
          addFromDump(dump);
          setDump('');
        }}
      >
        <textarea
          ref={dumpRef}
          className="w-dump-in"
          value={dump}
          rows={1}
          placeholder="Brain-dump an idea, then Enter — paste a list to add many"
          aria-label="Add an idea to your notes"
          onChange={(e) => setDump(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              addFromDump(dump);
              setDump('');
            }
          }}
          onPaste={(e) => {
            const text = e.clipboardData.getData('text/plain');
            if (text.includes('\n')) {
              e.preventDefault();
              addFromDump(text);
            }
          }}
        />
        <button type="submit" className="w-btn" disabled={!dump.trim()}>
          Add
        </button>
      </form>

      {findings && (
        <section className="w-findings" aria-label="Socria’s reading of the board">
          <p className="w-eyebrow">Socria’s reading — gaps to look at, nothing changed</p>
          {findings.length ? (
            <ul>
              {findings.map((f, k) => (
                <li key={k} onMouseEnter={() => setLit(f.cards)} onMouseLeave={() => setLit([])} onFocus={() => setLit(f.cards)} onBlur={() => setLit([])} tabIndex={0}>
                  <b>{f.kind === 'missing' ? 'A missing step' : f.kind === 'repetition' ? 'Repetition' : f.kind === 'unsupported' ? 'Unsupported' : 'A weak connection'}</b> {f.says}
                  {f.question && <em> {f.question}</em>}
                </li>
              ))}
            </ul>
          ) : (
            <p className="w-quiet">The board holds together — no gaps Socria could point to.</p>
          )}
        </section>
      )}

      <div className="w-piles">
        {piles.map((p) => {
          const cards = cardsIn(doc, p.id);
          const dropHere = drag && drag.pile === p.id;
          return (
            <section key={p.id ?? 'loose'} className={`w-pile${p.id ? '' : ' is-loose'}${dropHere ? ' is-drop' : ''}`} data-pile={p.id ?? ''} aria-label={p.id ? `Pile: ${p.title || 'untitled'}` : 'Loose ideas'}>
              <header className="w-pile-head">
                {p.id ? (
                  <input
                    className="w-pile-title"
                    value={p.title}
                    placeholder="Untitled — what this paragraph argues"
                    aria-label="Pile title"
                    onChange={(e) => onChange(renameGroup(docRef.current, p.id!, e.target.value))}
                  />
                ) : (
                  <h2 className="w-pile-title is-static">Loose ideas</h2>
                )}
                {p.id && (
                  <div className="w-pile-acts">
                    <button type="button" className="w-more" aria-haspopup="menu" aria-expanded={pileMenu === p.id} aria-label="More for this pile" onClick={() => setPileMenu((m) => (m === p.id ? null : p.id))}>
                      ⋯
                    </button>
                    {pileMenu === p.id && (
                      <div className="w-menu is-pile" role="menu" onMouseLeave={() => setPileMenu(null)}>
                        <button type="button" role="menuitem" onClick={() => (setPileMenu(null), onOutline(p.id))} disabled={!cards.length}>
                          Outline this pile in the writing
                        </button>
                        <button type="button" role="menuitem" onClick={() => (setPileMenu(null), onChange(moveGroup(docRef.current, p.id!, -1)))}>
                          {narrow ? 'Move up' : 'Move left'}
                        </button>
                        <button type="button" role="menuitem" onClick={() => (setPileMenu(null), onChange(moveGroup(docRef.current, p.id!, 1)))}>
                          {narrow ? 'Move down' : 'Move right'}
                        </button>
                        <button type="button" role="menuitem" className="is-danger" onClick={() => (setPileMenu(null), onChange(removeGroup(docRef.current, p.id!)))}>
                          Remove the pile (its cards stay, loose)
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </header>
              {p.id && cards.length > 0 && (
                <p className="w-shape" aria-label="The shape of this paragraph">
                  {shapeOf(cards).join(' → ')}
                </p>
              )}
              <ol className="w-cards">
                {cards.map((c, k) => (
                  <FragmentWithDrop key={c.id} show={!!dropHere && drag!.index === k}>
                    {renderCard(c)}
                  </FragmentWithDrop>
                ))}
                {dropHere && drag!.index >= cards.filter((c) => c.id !== drag!.id).length && <li className="w-drop" aria-hidden="true" />}
              </ol>
              {!cards.length && <p className="w-pile-empty">{p.id ? 'Drag cards here.' : 'Ideas you add land here.'}</p>}
              <AddCard onAdd={(text) => addFromDump(text, p.id)} />
            </section>
          );
        })}
        <button
          type="button"
          className="w-pile w-newpile"
          onClick={() => {
            const made = addGroup(docRef.current);
            onChange(made.doc);
            requestAnimationFrame(() => boardRef.current?.querySelector<HTMLInputElement>(`[data-pile="${made.group.id}"] .w-pile-title`)?.focus());
          }}
        >
          + New pile <span>a paragraph to build</span>
        </button>
      </div>

      <footer className="w-board-foot">
        {selected.length ? (
          <>
            <span className="w-count">{selected.length} selected</span>
            <button type="button" className="w-btn" disabled={selected.length < 2} onClick={() => (onChange(mergeCards(docRef.current, selected).doc), setSelected([]))}>
              Merge
            </button>
            <button type="button" className="w-btn" onClick={() => (onChange(groupCards(docRef.current, selected).doc), setSelected([]))}>
              Make a pile
            </button>
            <button type="button" className="w-btn is-danger" onClick={() => (onChange(removeCards(docRef.current, selected)), setSelected([]))}>
              Delete
            </button>
            <button type="button" className="w-btn is-quiet" onClick={() => setSelected([])}>
              Clear
            </button>
          </>
        ) : (
          <>
            <button type="button" className="w-btn is-primary" onClick={() => onOutline()} disabled={!doc.cards.some((c) => !written.has(c.id))} title="Adds an outline to the end of your writing — nothing written is changed">
              Turn into an outline
            </button>
            <button type="button" className="w-btn" onClick={onReview} disabled={reviewing || doc.cards.length < 2}>
              {reviewing ? 'Reading the board…' : 'Look for gaps'}
            </button>
            <span className="w-quiet">{doc.cards.length ? `${doc.cards.length} card${doc.cards.length === 1 ? '' : 's'}` : ''}</span>
          </>
        )}
      </footer>

      {menu && menuCard && (
        <div className="w-scrim" onClick={() => setMenu(null)}>
          <div
            className="w-menu"
            role="menu"
            style={narrow ? undefined : { left: Math.min(menu.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - 260), top: menu.y + 4 }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.key === 'Escape' && setMenu(null)}
          >
            {menu.kind === 'kind'
              ? CARD_KINDS.map((k) => (
                  <button
                    key={k}
                    type="button"
                    role="menuitemradio"
                    aria-checked={menuCard.kind === k}
                    autoFocus={menuCard.kind === k}
                    onClick={() => (setMenu(null), onChange(updateCard(docRef.current, menuCard.id, { kind: k })))}
                  >
                    <span aria-hidden="true">{KIND_GLYPH[k]}</span> {CARD_KIND_LABEL[k]}
                  </button>
                ))
              : (
                  <>
                    {(
                      [
                        ['link-doc', 'Link a passage from your files'],
                        ['link-node', 'Link an idea on the Logic Map'],
                        ['link-card', 'Link another card'],
                        ['develop', 'Develop this — questions, not words'],
                        ['ask', 'Ask about this in the conversation'],
                        ...(canKeep ? [['keep', 'Keep in memory'] as [CardAction, string]] : []),
                      ] as [CardAction, string][]
                    ).map(([a, label], k) => (
                      <button
                        key={a}
                        type="button"
                        role="menuitem"
                        autoFocus={k === 0}
                        onClick={(e) => {
                          const r = (e.currentTarget.parentElement ?? e.currentTarget).getBoundingClientRect();
                          setMenu(null);
                          onCardAction(menuCard, a, r);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                    <button type="button" role="menuitem" onClick={() => (setMenu(null), startEdit(menuCard))}>
                      Edit
                    </button>
                    {(() => {
                      const list = cardsIn(doc, menuCard.group);
                      const next = list[list.findIndex((x) => x.id === menuCard.id) + 1];
                      return next ? (
                        <button type="button" role="menuitem" onClick={() => (setMenu(null), onChange(mergeCards(docRef.current, [menuCard.id, next.id]).doc))}>
                          Merge with the card below
                        </button>
                      ) : null;
                    })()}
                    <p className="w-menu-k">Move to</p>
                    {piles
                      .filter((p) => p.id !== menuCard.group)
                      .map((p) => (
                        <button key={p.id ?? 'loose'} type="button" role="menuitem" onClick={() => (setMenu(null), onChange(moveCard(docRef.current, menuCard.id, p.id, cardsIn(docRef.current, p.id).length)))}>
                          {p.id ? p.title.trim() || 'Untitled pile' : 'Loose ideas'}
                        </button>
                      ))}
                    <button type="button" role="menuitem" className="is-danger" onClick={() => (setMenu(null), onChange(removeCards(docRef.current, [menuCard.id])))}>
                      Delete
                    </button>
                  </>
                )}
          </div>
        </div>
      )}
      {drag && (
        <div className="w-ghost" style={{ left: drag.x + 12, top: drag.y + 10 }} aria-hidden="true">
          {doc.cards.find((c) => c.id === drag.id)?.text.slice(0, 80)}
        </div>
      )}
    </div>
  );
}

function FragmentWithDrop({ show, children }: { show: boolean; children: React.ReactNode }) {
  return (
    <>
      {show && <li className="w-drop" aria-hidden="true" />}
      {children}
    </>
  );
}

/** "+ Add a card" at the foot of a pile. */
function AddCard({ onAdd }: { onAdd: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open)
    return (
      <button type="button" className="w-addcard" onClick={() => setOpen(true)}>
        + Add a card
      </button>
    );
  return (
    <textarea
      className="w-card-edit is-new"
      autoFocus
      rows={2}
      value={text}
      placeholder="A claim, a piece of evidence, an example…"
      aria-label="New card"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim()) onAdd(text);
        setText('');
        setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (text.trim()) onAdd(text);
          setText('');
        } else if (e.key === 'Escape') {
          setText('');
          setOpen(false);
        }
      }}
    />
  );
}
