'use client';
// components/new-logos/ui.tsx — New Logos' small pieces: type glyphs, breadcrumbs, a menu, a dialog, and the words
// a node is shown with. Built here, from nothing, in the neutral style of app/new-logos/nl.css.

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { TYPE_LABEL, type NodeRow, type NodeType } from '@/lib/new-logos/model';
import { ancestorsOf, indexNodes } from '@/lib/new-logos/ops';
import { displayTitle, type Conversation } from '@/lib/new-logos/convo';

/** A type's glyph: 16px, one stroke, no colour — the type is told by shape and by its label beside it. */
export function Glyph({ type, size = 16 }: { type: NodeType | 'home'; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.4, 'aria-hidden': true as const };
  switch (type) {
    case 'objective':
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="6.2" />
          <circle cx="8" cy="8" r="3.2" />
          <circle cx="8" cy="8" r="0.6" fill="currentColor" />
        </svg>
      );
    case 'conversation':
      return (
        <svg {...p}>
          <path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" strokeLinejoin="round" />
        </svg>
      );
    case 'question':
      return (
        <svg {...p}>
          <circle cx="8" cy="8" r="6.2" />
          <path d="M6.2 6.3a1.9 1.9 0 1 1 2.7 1.7c-.6.3-.9.7-.9 1.3v.4" strokeLinecap="round" />
          <circle cx="8" cy="11.4" r="0.5" fill="currentColor" />
        </svg>
      );
    case 'knowledge':
      return (
        <svg {...p}>
          <rect x="3" y="2.5" width="10" height="11" />
          <path d="M5.5 5.5h5M5.5 8h5M5.5 10.5h3" strokeLinecap="round" />
        </svg>
      );
    case 'decision':
      return (
        <svg {...p}>
          <path d="M8 1.8 14.2 8 8 14.2 1.8 8z" strokeLinejoin="round" />
          <path d="M8 5.5v3.2" strokeLinecap="round" />
          <circle cx="8" cy="10.6" r="0.5" fill="currentColor" />
        </svg>
      );
    case 'artifact':
      return (
        <svg {...p}>
          <path d="M3.5 2.5h6l3 3v8h-9z" strokeLinejoin="round" />
          <path d="M9.5 2.5v3h3" strokeLinejoin="round" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <rect x="2.5" y="2.5" width="4.5" height="4.5" />
          <rect x="9" y="2.5" width="4.5" height="4.5" />
          <rect x="2.5" y="9" width="4.5" height="4.5" />
          <rect x="9" y="9" width="4.5" height="4.5" />
        </svg>
      );
  }
}

/** What a node is called. A conversation's name lives on the conversation. */
export function nodeTitle(n: NodeRow, conversations: Map<string, Conversation>): string {
  if (n.type !== 'conversation') return n.title;
  const c = n.conversation_id ? conversations.get(n.conversation_id) : undefined;
  return c ? displayTitle(c.title) : 'Conversation unavailable';
}

export function nodeHref(n: NodeRow): string {
  if (n.type === 'conversation' && n.conversation_id) return `/new-logos/c/${encodeURIComponent(n.conversation_id)}`;
  return `/new-logos/n/${encodeURIComponent(n.id)}`;
}

export const typeLabel = (t: NodeType) => TYPE_LABEL[t].one;

export function when(ms: number): string {
  if (!ms) return '';
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(sameYear ? {} : { year: 'numeric' }) });
}

/** The way back up: Home, then each objective above, then (optionally) where you are. */
export function Crumbs({
  nodes,
  at,
  current,
  onDropTo,
}: {
  nodes: NodeRow[];
  at: string | null;
  current?: string;
  onDropTo?: (parentId: string | null, e: React.DragEvent) => void;
}) {
  const index = indexNodes(nodes);
  const chain = at ? [...ancestorsOf(index, at), ...(index.get(at) ? [index.get(at) as NodeRow] : [])] : [];
  const [over, setOver] = useState<string | null>(null);
  const drop = (id: string | null) =>
    onDropTo
      ? {
          onDragOver: (e: React.DragEvent) => {
            e.preventDefault();
            setOver(id ?? 'home');
          },
          onDragLeave: () => setOver(null),
          onDrop: (e: React.DragEvent) => {
            setOver(null);
            onDropTo(id, e);
          },
        }
      : {};
  return (
    <nav className="nl-crumbs" aria-label="Breadcrumb">
      <Link href="/new-logos" className={over === 'home' ? 'is-drop' : ''} {...drop(null)}>
        Home
      </Link>
      {chain.map((n, i) => {
        const last = i === chain.length - 1 && !current;
        return (
          <span key={n.id} style={{ display: 'contents' }}>
            <span className="nl-crumb-sep" aria-hidden="true">
              /
            </span>
            {last ? (
              <span aria-current="page">{n.title}</span>
            ) : (
              <Link href={`/new-logos/n/${encodeURIComponent(n.id)}`} className={over === n.id ? 'is-drop' : ''} {...drop(n.id)}>
                {n.title}
              </Link>
            )}
          </span>
        );
      })}
      {current ? (
        <>
          <span className="nl-crumb-sep" aria-hidden="true">
            /
          </span>
          <span aria-current="page">{current}</span>
        </>
      ) : null}
    </nav>
  );
}

/** A small menu behind a button. Closes on a choice, on Escape and on a click elsewhere. */
export function Menu({ label, children }: { label: string; children: (close: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="nl-icon-btn" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
          <circle cx="3.5" cy="8" r="1.2" fill="currentColor" />
          <circle cx="8" cy="8" r="1.2" fill="currentColor" />
          <circle cx="12.5" cy="8" r="1.2" fill="currentColor" />
        </svg>
      </button>
      {open ? (
        <div className="nl-menu" role="menu">
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}

/** A modal dialog. Escape and the backdrop close it; focus goes to its first field. */
export function Dialog({ title, onClose, children, foot }: { title: string; onClose: () => void; children: ReactNode; foot?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = ref.current?.querySelector<HTMLElement>('input, textarea, select, button:not([data-close])');
    first?.focus();
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('keydown', esc);
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <div className="nl-dialog-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="nl-dialog" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div className="nl-dialog-head">
          <h2>{title}</h2>
          <button type="button" className="nl-icon-btn" aria-label="Close" data-close onClick={onClose}>
            ×
          </button>
        </div>
        <div className="nl-dialog-body">{children}</div>
        {foot ? <div className="nl-dialog-foot">{foot}</div> : null}
      </div>
    </div>
  );
}

/** Text edited in place and saved when it is left (blur or Enter). */
export function InlineText({
  value,
  onSave,
  label,
  className,
  placeholder,
  disabled,
}: {
  value: string;
  onSave: (v: string) => void;
  label: string;
  className?: string;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    const t = v.trim();
    if (!t) setV(value);
    else if (t !== value) onSave(t);
  };
  return (
    <input
      className={className ?? 'nl-title-input'}
      aria-label={label}
      value={v}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setV(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

/** An in-page confirmation for something that cannot be undone. "Keep it" has the focus; the danger is one button. */
export function ConfirmDialog({ title, body, action, onConfirm, onClose }: { title: string; body: string; action: string; onConfirm: () => void; onClose: () => void }) {
  return (
    <Dialog
      title={title}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="nl-btn" onClick={onClose}>
            Keep it
          </button>
          <button
            type="button"
            className="nl-btn is-danger"
            onClick={() => {
              onClose();
              onConfirm();
            }}
          >
            {action}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 14 }}>{body}</p>
    </Dialog>
  );
}
