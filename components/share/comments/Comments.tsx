'use client';
// components/share/comments/Comments.tsx
//
// THE COMMENTS INTERFACE — one set of parts for every shared thing:
//
//   CommentsPanel   every thread, open first; a composer that comments on the
//                   card you have selected (or on the whole thing); filters
//                   for open and resolved; a jump to what each is about
//   CommentThread   one thread: the comment, its replies, and what you may do
//                   — reply, resolve or reopen, edit or delete your own
//   CommentPins     the number of open threads, pinned to each card on a
//                   shared Logos map; press one to read them
//
// It decides nothing about permission. Buttons appear for what the role
// allows (useComments reads the role from the server), and the server checks
// again on every write (lib/share/collab.ts).

import { useEffect, useMemo, useRef, useState } from 'react';
import { filterThreads, readAnchor, whenSaid, type CommentItem, type Thread, type ThreadFilter } from '@/lib/share/comments';
import { hueOf } from '@/lib/share/hue';
import type { CommentsState } from './useComments';
import './comments.css';

const initial = (s: string) => (s.trim()[0] ?? '?').toUpperCase();

// ── writing one ─────────────────────────────────────────────────────

export function CommentComposer({
  placeholder = 'Add a comment',
  onSubmit,
  autoFocus = false,
  submitLabel = 'Comment',
  onCancel,
  initialValue = '',
}: {
  placeholder?: string;
  onSubmit: (body: string) => Promise<boolean>;
  autoFocus?: boolean;
  submitLabel?: string;
  onCancel?: () => void;
  initialValue?: string;
}) {
  const [text, setText] = useState(initialValue);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.focus();
  }, [autoFocus]);
  // grows with what is typed, up to a few lines
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);
  async function submit() {
    const body = text.trim();
    if (!body || busy) return;
    setBusy(true);
    const ok = await onSubmit(body);
    setBusy(false);
    if (ok) setText('');
  }
  return (
    <form
      className="cm-compose"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <textarea
        ref={ref}
        rows={1}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            void submit();
          }
          if (e.key === 'Escape' && onCancel) {
            e.preventDefault();
            onCancel();
          }
        }}
      />
      <span className="cm-compose-acts">
        {onCancel && (
          <button type="button" className="cm-link" onClick={onCancel}>
            Cancel
          </button>
        )}
        <button type="submit" className="cm-post" disabled={!text.trim() || busy}>
          {busy ? '…' : submitLabel}
        </button>
      </span>
    </form>
  );
}

// ── one comment ─────────────────────────────────────────────────────

function One({
  c,
  state,
  now,
  isRoot,
  resolved,
  onReply,
}: {
  c: CommentItem;
  state: CommentsState;
  now: number;
  isRoot: boolean;
  resolved: boolean;
  onReply?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (c.deleted) {
    return <div className="cm-one is-gone"><p className="cm-body">This comment was deleted.</p></div>;
  }
  const mayResolve = isRoot && (c.mine || state.mayResolveAny);
  return (
    <div className="cm-one">
      <div className="cm-meta">
        <span className="cm-av" style={{ background: hueOf(c.authorId || c.id) }}>{initial(c.author)}</span>
        <span className="cm-who">{c.mine ? 'You' : c.author}</span>
        <time className="cm-when">{whenSaid(c.at, now)}{c.edited ? ' · edited' : ''}</time>
        {isRoot && resolved && <span className="cm-tag">Resolved</span>}
      </div>
      {editing ? (
        <CommentComposer
          autoFocus
          initialValue={c.body}
          submitLabel="Save"
          placeholder="Edit your comment"
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => {
            const ok = await state.change(c.id, { body });
            if (ok) setEditing(false);
            return ok;
          }}
        />
      ) : (
        <p className="cm-body">{c.body}</p>
      )}
      {!editing && (
        <div className="cm-acts">
          {onReply && state.mayComment && <button className="cm-link" onClick={onReply}>Reply</button>}
          {mayResolve && (
            <button className="cm-link" onClick={() => void state.change(c.id, { resolve: !resolved })}>
              {resolved ? 'Reopen' : 'Resolve'}
            </button>
          )}
          {c.mine && <button className="cm-link" onClick={() => setEditing(true)}>Edit</button>}
          {(c.mine || state.isOwner) &&
            (confirm ? (
              <>
                <button className="cm-link danger" onClick={() => void state.change(c.id, { remove: true })}>Delete it</button>
                <button className="cm-link" onClick={() => setConfirm(false)}>Keep</button>
              </>
            ) : (
              <button className="cm-link" onClick={() => setConfirm(true)}>Delete</button>
            ))}
        </div>
      )}
    </div>
  );
}

// ── a thread ────────────────────────────────────────────────────────

export function CommentThread({
  thread,
  state,
  label,
  onJump,
}: {
  thread: Thread;
  state: CommentsState;
  /** what it is about, when it is about something in particular */
  label?: string | null;
  onJump?: () => void;
}) {
  const [replying, setReplying] = useState(false);
  const now = Date.now();
  return (
    <article className={`cm-thread${thread.open ? '' : ' is-resolved'}`}>
      {label && (
        <button className="cm-about" onClick={onJump} disabled={!onJump} title={onJump ? 'Show it' : undefined}>
          <span>On</span> “{label}”{onJump && <i aria-hidden="true">→</i>}
        </button>
      )}
      <One c={thread.root} state={state} now={now} isRoot resolved={!thread.open} onReply={() => setReplying(true)} />
      {thread.replies.length > 0 && (
        <div className="cm-replies">
          {thread.replies.map((r) => (
            <One key={r.id} c={r} state={state} now={now} isRoot={false} resolved={false} />
          ))}
        </div>
      )}
      {replying && state.mayComment && (
        <div className="cm-replies">
          <CommentComposer
            autoFocus
            placeholder="Reply"
            submitLabel="Reply"
            onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const ok = await state.add(thread.root.anchor, body, thread.root.id);
              if (ok) setReplying(false);
              return ok;
            }}
          />
        </div>
      )}
    </article>
  );
}

// ── the panel ───────────────────────────────────────────────────────

export function CommentsPanel({
  state,
  labelFor,
  generalAnchor,
  generalLabel,
  target,
  onClearTarget,
  focusAnchor,
  onClearFocus,
  onJump,
  onClose,
  hint,
  variant = 'drawer',
}: {
  state: CommentsState;
  /** what an anchor is called here — a card's label, a turn's first words */
  labelFor: (anchor: string) => string | null;
  /** where a comment on the whole thing goes: '' for a conversation, 'project' for a Project */
  generalAnchor: string;
  generalLabel: string;
  /** the card selected on the map: the composer comments on it */
  target?: { anchor: string; label: string } | null;
  onClearTarget?: () => void;
  /** show only the threads on one card or turn */
  focusAnchor?: string | null;
  onClearFocus?: () => void;
  onJump?: (anchor: string) => void;
  onClose?: () => void;
  /** a line under the composer: where else a comment can go */
  hint?: string;
  variant?: 'drawer' | 'inline';
}) {
  const [filter, setFilter] = useState<ThreadFilter>('open');
  const { threads, markSeen, comments } = state;
  // looking at the panel is seeing what is in it
  useEffect(() => {
    markSeen();
  }, [markSeen, comments.length]);

  const scoped = useMemo(
    () => (focusAnchor != null ? threads.filter((t) => t.root.anchor === focusAnchor) : threads),
    [threads, focusAnchor]
  );
  const open = scoped.filter((t) => t.open).length;
  const resolved = scoped.length - open;
  // a focused card with only resolved threads should not look empty
  const effective: ThreadFilter = filter === 'open' && open === 0 && resolved > 0 && focusAnchor != null ? 'all' : filter;
  const shown = filterThreads(scoped, effective);
  const writeAt = target?.anchor ?? (focusAnchor != null ? focusAnchor : generalAnchor);
  const writeLabel = target?.label ?? (focusAnchor != null ? labelFor(focusAnchor) : null);

  return (
    <section className={`cm-panel is-${variant}`} aria-label="Comments">
      <header className="cm-head">
        {variant === 'drawer' && <h2>Comments</h2>}
        <span className="cm-seg" role="tablist" aria-label="Which comments">
          <button role="tab" aria-selected={effective === 'open'} onClick={() => setFilter('open')}>Open{open ? ` ${open}` : ''}</button>
          <button role="tab" aria-selected={effective === 'resolved'} onClick={() => setFilter('resolved')}>Resolved{resolved ? ` ${resolved}` : ''}</button>
          <button role="tab" aria-selected={effective === 'all'} onClick={() => setFilter('all')}>All</button>
        </span>
        {onClose && <button className="cm-x" onClick={onClose} aria-label="Close comments">×</button>}
      </header>

      {focusAnchor != null && (
        <p className="cm-scope">
          On “{labelFor(focusAnchor) ?? 'this'}”
          {onClearFocus && <button className="cm-link" onClick={onClearFocus}>Show all comments</button>}
        </p>
      )}

      {state.mayComment ? (
        <div className="cm-new">
          <span className="cm-on">
            {writeLabel ? <>On <b>“{writeLabel}”</b></> : <>On {generalLabel}</>}
            {target && onClearTarget && (
              <button className="cm-link" onClick={onClearTarget} aria-label="Comment on the whole thing instead">×</button>
            )}
          </span>
          <CommentComposer
            placeholder={writeLabel ? `Comment on “${writeLabel}”` : 'Add a comment'}
            onSubmit={(body) => state.add(writeAt, body)}
          />
          {hint && !target && focusAnchor == null && <span className="cm-hint">{hint}</span>}
        </div>
      ) : state.role ? (
        <p className="cm-readonly">You can read the comments here.</p>
      ) : null}
      {state.error && <p className="cm-error" role="alert">{state.error}</p>}

      <div className="cm-list">
        {shown.length ? (
          shown.map((t) => {
            const a = readAnchor(t.root.anchor);
            // what each thread is about — unless the panel is already showing one thing
            const about = a.kind === 'general' || a.kind === 'project' || focusAnchor != null ? null : labelFor(t.root.anchor);
            const gone = !about && focusAnchor == null && a.kind === 'node';
            return (
              <CommentThread
                key={t.root.id}
                thread={t}
                state={state}
                label={about ?? (gone ? 'a card no longer on the map' : null)}
                onJump={onJump && about ? () => onJump(t.root.anchor) : undefined}
              />
            );
          })
        ) : (
          <p className="cm-empty">
            {effective === 'resolved'
              ? 'Nothing resolved yet.'
              : threads.length
                ? 'No open comments. Everything here has been resolved.'
                : 'No comments yet.'}
          </p>
        )}
      </div>
    </section>
  );
}

// ── pins on a shared map ────────────────────────────────────────────

/**
 * The open threads on each card of a shared Logos map, as small pins at the
 * card's corner — placed over the map from the cards' own positions every
 * frame, so they follow a pan or a zoom.
 */
export function CommentPins({ counts, onOpen }: { counts: Record<string, number>; onOpen: (nodeId: string) => void }) {
  const ids = Object.keys(counts).filter((a) => a.startsWith('node:') && counts[a] > 0).map((a) => a.slice(5));
  const [placed, setPlaced] = useState<{ id: string; x: number; y: number; n: number }[]>([]);
  const key = ids.join('|');
  const latest = useRef(counts);
  latest.current = counts;
  useEffect(() => {
    if (!ids.length) {
      setPlaced([]);
      return;
    }
    let raf = 0;
    const frame = () => {
      const map = document.querySelector<HTMLElement>('.logos-root .lg-map:not(.is-embedded)');
      const box = map?.getBoundingClientRect();
      const next: { id: string; x: number; y: number; n: number }[] = [];
      if (map && box) {
        for (const id of ids) {
          const el = map.querySelector<HTMLElement>(`.lg-node-pos[data-id="${CSS.escape(id)}"]`);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          if (r.right < box.left || r.top > box.bottom || r.bottom < box.top || r.right > box.right + 8) continue;
          next.push({ id, x: r.right - 6, y: r.top - 8, n: latest.current[`node:${id}`] ?? 0 });
        }
      }
      setPlaced((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!placed.length) return null;
  return (
    <div className="cm-pins">
      {placed.map((p) => (
        <button
          key={p.id}
          className="cm-pin"
          style={{ transform: `translate(${p.x}px, ${p.y}px)` }}
          onClick={() => onOpen(p.id)}
          aria-label={`${p.n} open ${p.n === 1 ? 'comment' : 'comments'} on this card`}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /></svg>
          {p.n}
        </button>
      ))}
    </div>
  );
}

/** The Comments button: with a dot when something new arrived, the count when threads are open. */
export function CommentsButton({ state, onClick, active }: { state: CommentsState; onClick: () => void; active?: boolean }) {
  return (
    <button type="button" className={`cm-open${active ? ' is-on' : ''}`} onClick={onClick} aria-pressed={!!active}>
      <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z" /></svg>
      Comments
      {state.open > 0 && <span className="n">{state.open}</span>}
      {state.unseen > 0 && !active && <span className="dot" aria-label={`${state.unseen} new`} />}
    </button>
  );
}
