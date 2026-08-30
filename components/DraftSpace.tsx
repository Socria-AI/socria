'use client';

// The Draft Space — where the person writes.
//
// Deliberately close to a sheet of paper: a title, headings, paragraphs, and
// nothing else competing for attention. The only affordances that appear are
// the ones you get by selecting your own words, and none of them can change
// the page without you saying so.
//
// contentEditable with a hand-rolled block model rather than an editor
// framework: the requirement is headings, paragraphs, quotes and paste, and
// pulling in a full rich-text stack for that would drag its own design
// language into a room that already has one.

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import type { LogosNodeType } from '@/lib/logos';
import { DRAFT_ACTIONS, DRAFT_ACTION_META, type DraftAction } from '@/lib/logos-draft';
import { NodeGlyph } from './NodeGlyph';

export interface DraftSelection {
  text: string;
  around: string;
}

// Enough to decide which side of the line the menu opens on.
const MENU_H = 40;
const MENU_W = 310;

const BLOCKS: { tag: string; label: string; title: string }[] = [
  { tag: 'h2', label: 'H1', title: 'Heading' },
  { tag: 'h3', label: 'H2', title: 'Subheading' },
  { tag: 'p', label: '¶', title: 'Body' },
  { tag: 'blockquote', label: '❝', title: 'Quote' },
];

export interface DraftHandle {
  /** swap the passage an action was run on for the wording the person accepted */
  applyProposal: (text: string) => void;
}

export const DraftSpace = forwardRef<DraftHandle, {
  html: string;
  onChange: (html: string) => void;
  title: string;
  onTitle: (t: string) => void;
  /** a map node pinned while writing — context, never content */
  focus: { id: string; label: string; type: LogosNodeType; lineage: string[] } | null;
  onClearFocus: () => void;
  /** current selection, so the map can light what this passage touches */
  onSelect: (sel: DraftSelection | null) => void;
  onAction: (action: DraftAction, sel: DraftSelection) => void;
  busy: boolean;
  onClose: () => void;
}>(function DraftSpace(
  { html, onChange, title, onTitle, focus, onClearFocus, onSelect, onAction, busy, onClose },
  handleRef
) {
  const ref = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    x: number;
    y: number;
    below: boolean;
    sel: DraftSelection;
  } | null>(null);
  const [words, setWords] = useState(0);
  // The passage an action was run on, held so a proposal accepted minutes
  // later still lands in the right place.
  const savedRange = useRef<Range | null>(null);

  useImperativeHandle(handleRef, () => ({
    applyProposal(text: string) {
      const el = ref.current;
      const range = savedRange.current;
      if (!el) return;
      el.focus();
      const sel = window.getSelection();
      if (range && sel && el.contains(range.commonAncestorContainer)) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      document.execCommand('insertText', false, text);
      savedRange.current = null;
      onChange(el.innerHTML);
      countWords();
    },
  }));

  // Only write into the DOM when the incoming html genuinely differs, or the
  // caret jumps to the start on every keystroke.
  useEffect(() => {
    const el = ref.current;
    if (el && el.innerHTML !== html) el.innerHTML = html;
  }, [html]);

  const countWords = useCallback(() => {
    const text = ref.current?.innerText ?? '';
    const t = text.trim();
    setWords(t ? t.split(/\s+/).length : 0);
  }, []);

  useEffect(countWords, [html, countWords]);

  /** The paragraph the caret or selection sits in — what the map reacts to. */
  function currentSelection(): DraftSelection | null {
    const el = ref.current;
    const sel = window.getSelection();
    if (!el || !sel || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!el.contains(range.commonAncestorContainer)) return null;

    let block: Node | null = range.commonAncestorContainer;
    while (block && block !== el && (block as HTMLElement).parentElement !== el) {
      block = block.parentNode;
    }
    const around = (block as HTMLElement)?.innerText ?? el.innerText ?? '';
    const text = sel.toString();
    return { text, around: around.slice(0, 2500) };
  }

  function refreshSelection() {
    const el = ref.current;
    const sel = currentSelection();
    onSelect(sel);

    const raw = window.getSelection();
    if (!sel || !sel.text.trim() || !raw || raw.isCollapsed || !el) {
      setMenu(null);
      return;
    }
    const rect = raw.getRangeAt(0).getBoundingClientRect();
    const box = el.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      setMenu(null);
      return;
    }
    // Room is measured against the visible scroll area, not the document, or
    // a selection sitting near the top of the view gets a menu placed outside
    // the sheet — where overflow quietly clips it out of existence.
    const sheet = sheetRef.current?.getBoundingClientRect();
    const roomAbove = sheet ? rect.top - sheet.top : rect.top - box.top;
    const below = roomAbove < MENU_H + 10;
    const half = MENU_W / 2 + 6;
    setMenu({
      x: Math.min(Math.max(rect.left - box.left + rect.width / 2, half), box.width - half),
      y: below
        ? rect.bottom - box.top + 10
        : rect.top - box.top - 12,
      below,
      sel,
    });
  }

  useEffect(() => {
    const onUp = () => refreshSelection();
    document.addEventListener('selectionchange', onUp);
    return () => document.removeEventListener('selectionchange', onUp);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setBlock(tag: string) {
    ref.current?.focus();
    document.execCommand('formatBlock', false, tag);
    onChange(ref.current?.innerHTML ?? '');
  }

  return (
    <section className="lg-draft" aria-label="Draft">
      <header className="lg-draft-head">
        <input
          className="lg-draft-title"
          value={title}
          placeholder="Untitled"
          onChange={(e) => onTitle(e.target.value)}
          aria-label="Draft title"
        />
        <span className="lg-draft-count">{words ? `${words.toLocaleString()} words` : ''}</span>
        <button type="button" className="lg-draft-close" onClick={onClose} aria-label="Close draft">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </header>

      {/* A node held in view while writing. It is here to be looked at, not
          to be pasted — nothing about it enters the page on its own. */}
      {focus && (
        <div className="lg-draft-focus">
          <span className={`lg-x-chip lg-node-${focus.type}`}>
            <NodeGlyph type={focus.type} />
            {focus.type}
          </span>
          <span className="lg-draft-focus-body">
            <strong>{focus.label}</strong>
            {focus.lineage.length > 0 && <em>{focus.lineage.slice(0, 2).join(' · ')}</em>}
          </span>
          <button type="button" onClick={onClearFocus} aria-label="Stop holding this in view">
            ×
          </button>
        </div>
      )}

      <div className="lg-draft-tools">
        {BLOCKS.map((b) => (
          <button key={b.tag} type="button" title={b.title} onMouseDown={(e) => e.preventDefault()} onClick={() => setBlock(b.tag)}>
            {b.label}
          </button>
        ))}
      </div>

      <div className="lg-draft-sheet" ref={sheetRef}>
        <div
          ref={ref}
          className="lg-draft-body"
          contentEditable
          suppressContentEditableWarning
          spellCheck
          data-placeholder="Start writing. Your thinking is next door."
          onInput={() => {
            onChange(ref.current?.innerHTML ?? '');
            countWords();
          }}
          onKeyUp={refreshSelection}
          onMouseUp={refreshSelection}
          onBlur={() => onChange(ref.current?.innerHTML ?? '')}
          onPaste={(e) => {
            // Paste as text: a draft that inherits fonts and colours from
            // wherever it was copied stops looking like one document.
            e.preventDefault();
            const text = e.clipboardData.getData('text/plain');
            document.execCommand('insertText', false, text);
            onChange(ref.current?.innerHTML ?? '');
          }}
        />

        {menu && (
          <div
            className={`lg-draft-menu${menu.below ? ' is-below' : ''}`}
            style={{ left: menu.x, top: menu.y }}
            onMouseDown={(e) => e.preventDefault()}
          >
            {DRAFT_ACTIONS.map((a) => (
              <button
                key={a}
                type="button"
                disabled={busy}
                title={DRAFT_ACTION_META[a].blurb}
                onClick={() => {
                  const raw = window.getSelection();
                  savedRange.current =
                    raw && raw.rangeCount ? raw.getRangeAt(0).cloneRange() : null;
                  onAction(a, menu.sel);
                  setMenu(null);
                }}
              >
                {DRAFT_ACTION_META[a].label}
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
});
