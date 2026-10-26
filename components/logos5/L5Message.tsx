'use client';
// components/logos5/L5Message.tsx — ONE TURN OF A LOGOS 5 CONVERSATION.
//
// Socria's words sit on the page in a reading measure; the person's sit in a
// quiet card on the right. What a turn did to the workspace is said under the
// reply that did it — "+3 on the map", "Chart · Expenses" — and pressing it
// shows the workspace on exactly that. When a card on the map is selected,
// the turns it came from are marked here (lib/logos5/linking.ts).
//
// Every action is a real button in reading order, shown on hover and focus,
// always on a touch screen and on the latest reply: copy; reply; retry the
// latest answer; edit what you sent (in place, saying plainly what that
// replaces). Nothing here holds conversation state: it says what was pressed.

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { LogosMsg } from '@/lib/logos-sessions';
import { contentAsText, sanitizeInlineState, type InlineSpec, type InlineState } from '@/lib/inline-ui';
import type { InlineHost } from '@/components/inline/InlineUI';
import { copyText } from '@/lib/copy-text';
import { initialOf } from '@/lib/collab';
import { AttachmentList } from '@/components/LogosComposer';
import { SaidText, useCiteRender, type Side } from '@/components/LogosMessage';
import { TeX, TexPick } from '@/components/TeX';
import { RichText, StreamingRichText } from '@/components/RichText';
import type { DocRef } from '@/lib/docs/render';
import { writeUpParts } from '@/lib/logos5/content';

const I = {
  copy: <path d="M9 9h11v11H9zM5 15V6a2 2 0 0 1 2-2h9" />,
  done: <path d="M5 12.5 10 17 19 7" />,
  reply: (
    <>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h10a6 6 0 0 1 6 6v4" />
    </>
  ),
  retry: (
    <>
      <path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7" />
      <path d="M20 4v4.7h-4.7" />
      <path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3" />
    </>
  ),
  edit: <path d="M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4" />,
  map: (
    <>
      <circle cx="6" cy="7" r="2.2" />
      <circle cx="18" cy="6" r="2.2" />
      <circle cx="12" cy="17" r="2.2" />
      <path d="M8 8l3 7M16.5 7.5 13 15" />
    </>
  ),
};

function Icon({ d }: { d: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {d}
    </svg>
  );
}

export interface L5Effect {
  /** "+3 on the map" — what the turn did to the map, when it did anything */
  map?: { said: string; nodes: string[] } | null;
  /** displays, documents and models this turn opened */
  objects?: { id: string; label: string; kind: string }[];
}

export interface L5MessageProps {
  m: LogosMsg;
  side: Side;
  who: string;
  group: boolean;
  cont: boolean;
  hue?: string;
  showQuote: boolean;
  toLabel?: string;
  docRefs?: DocRef[];
  onOpenCite?: (docId: string, blockId: string) => void;
  onOpenDoc?: (docId: string) => void;
  onPickTex?: (tex: string) => void;
  onJump?: (id: string) => void;
  canReply: boolean;
  onReply?: (m: LogosMsg) => void;
  /** the latest reply: its actions are always shown, and it can be asked again */
  latest?: boolean;
  onRetry?: (m: LogosMsg) => void;
  /** your own message: it can be edited and sent again; `after` is how many messages that replaces */
  onEdit?: (m: LogosMsg, text: string) => void;
  after?: number;
  /** marked because the card selected on the map came from it */
  linked?: boolean;
  effect?: L5Effect | null;
  /** hover over an effect: light those cards; null puts them out */
  onHoverNodes?: (ids: string[] | null) => void;
  /** press an effect: show the workspace on it */
  onShowNodes?: (ids: string[]) => void;
  onOpenObject?: (id: string) => void;
  /** what was done with one of the reply's inline elements — a slider moved, a choice tapped, a draft edited — kept with it */
  onInline?: (m: LogosMsg, n: number, s: InlineState) => void;
  /** a choice tapped in the latest reply, sent as their next message */
  onChoose?: (text: string) => void;
  /** an inline element opened in Artifacts as a full artifact */
  onOpenInline?: (m: LogosMsg, n: number, spec: InlineSpec) => void;
  /**
   * A write-up they asked to read and keep (lib/logos5/content.ts): filed in
   * Content and read there, so the conversation shows its title and opening and
   * a way in — never the same pages twice.
   */
  writeUp?: { id: string; title: string; opening: string; words: number } | null;
  onOpenContent?: (id: string) => void;
  /**
   * Something that could be made from this, offered — never made unasked
   * (lib/logos5/artifacts.ts madeOffer): what it is, the button that takes it,
   * and "Not now", which is not asked again.
   */
  offer?: { said: string; take: string; onTake: () => void; onDecline: () => void } | null;
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  return (
    <button
      type="button"
      className="l5-act"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => setCopied(false), 1500);
        }
      }}
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : 'Copy'}
    >
      <Icon d={copied ? I.done : I.copy} />
      <span className="l5-act-l">{copied ? 'Copied' : 'Copy'}</span>
    </button>
  );
}

function EditBox({ initial, after, onSave, onCancel }: { initial: string; after: number; onSave: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 320)}px`;
  }, [text]);
  const changed = text.trim() && text.trim() !== initial.trim();
  return (
    <div className="l5-edit">
      <textarea
        ref={ref}
        value={text}
        aria-label="Edit your message"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
          if (e.key === 'Enter' && !e.shiftKey && changed) {
            e.preventDefault();
            onSave(text.trim());
          }
        }}
      />
      {after > 0 && (
        <p className="l5-edit-note">
          Sending this replaces the {after === 1 ? 'reply' : `${after} messages`} after it. The map keeps what it has.
        </p>
      )}
      <div className="l5-edit-acts">
        <button type="button" className="l5-btn" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="l5-btn is-primary" disabled={!changed} onClick={() => changed && onSave(text.trim())}>
          Send
        </button>
      </div>
    </div>
  );
}

export function L5Message(p: L5MessageProps) {
  const { m, side, group } = p;
  const [editing, setEditing] = useState(false);
  const cite = useCiteRender(m.content, m.role, p.docRefs, p.onOpenCite);
  const style = p.hue ? ({ '--by': p.hue } as CSSProperties) : undefined;
  const to = group && side === 'socria' && m.replyTo?.role === 'user' ? p.toLabel ?? m.replyTo.who : null;
  const quote = p.showQuote ? m.replyTo : undefined;
  const mapFx = m.role === 'assistant' ? p.effect?.map : null;
  const objFx = m.role === 'assistant' ? p.effect?.objects ?? [] : [];
  const whose = p.who === 'You' ? 'your' : `${p.who}’s`;
  // the reply's inline elements: what was done with them, and where their actions go
  const { onInline, onChoose, onOpenInline, latest } = p;
  const inline = useMemo<InlineHost | undefined>(
    () =>
      m.role === 'assistant'
        ? {
            state: sanitizeInlineState(m.ui),
            onState: onInline ? (n, s) => onInline(m, n, s) : undefined,
            onChoose: latest ? onChoose : undefined,
            onOpen: onOpenInline ? (n, spec) => onOpenInline(m, n, spec) : undefined,
            live: !!latest,
          }
        : undefined,
    [m, onInline, onChoose, onOpenInline, latest]
  );

  return (
    <article
      id={m.id ? `lg-m-${m.id}` : undefined}
      className={`l5-msg l5-${m.role === 'assistant' ? 'a' : 'u'} is-${side}${group ? ' is-group' : ''}${p.cont ? ' is-cont' : ''}${p.linked ? ' is-linked' : ''}${p.latest ? ' is-latest' : ''}`}
      style={style}
      aria-label={m.role === 'assistant' ? 'Socria' : p.who === 'You' ? 'You' : p.who}
    >
      {group && side !== 'mine' && !p.cont && (
        <div className="l5-who">
          {side === 'socria' ? (
            <span className="l5-av is-socria" aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/socria-mark.png" alt="" width={14} height={14} />
            </span>
          ) : (
            <span className="l5-av" aria-hidden="true">
              {initialOf(p.who)}
            </span>
          )}
          <span>
            {p.who}
            {to && <span className="l5-to"> → {to}</span>}
          </span>
        </div>
      )}

      {quote && (
        <button
          type="button"
          className="l5-quote"
          onClick={() => quote.id && p.onJump?.(quote.id)}
          disabled={!quote.id || !p.onJump}
          aria-label={`Replying to ${quote.who}: ${quote.excerpt}`}
        >
          <b>{quote.who}</b> <span>{quote.excerpt}</span>
        </button>
      )}

      {m.role === 'user' && m.about && (
        <span className="l5-about">
          <span className="l5-about-k">About</span> {m.about.kind === 'expression' ? <TeX tex={m.about.label} /> : <b>{m.about.label}</b>}
          {m.about.of ? <span className="l5-about-of"> · {m.about.of}</span> : null}
        </span>
      )}

      {m.role === 'user' && m.via === 'voice' && (
        <span className="l5-spoken" title="Said with Socria Voice">
          <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="3" width="6" height="11" rx="3" />
            <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" />
          </svg>
          Said
        </span>
      )}

      {!!m.attachments?.length && (
        <div className="l5-atts">
          <AttachmentList items={m.attachments} onOpenDoc={p.onOpenDoc} />
        </div>
      )}

      {editing && p.onEdit ? (
        <EditBox
          initial={m.content}
          after={p.after ?? 0}
          onCancel={() => setEditing(false)}
          onSave={(t) => {
            setEditing(false);
            p.onEdit!(m, t);
          }}
        />
      ) : !m.content && m.role === 'assistant' && !m.attachments?.length ? (
        // an answer that came back with no words (held back by its own checks) says so, and can be asked again
        <p className="l5-empty">No words came back this time.</p>
      ) : m.role === 'assistant' && p.writeUp ? (
        <WriteUpCard w={p.writeUp} onOpen={p.onOpenContent} />
      ) : (
        m.content && (
          <div className={m.role === 'assistant' ? 'l5-prose' : 'l5-said'}>
            {m.role === 'assistant' ? (
              <TexPick.Provider value={p.onPickTex ?? null}>
                <RichText text={m.content} math rich cite={cite} askLast inline={inline} />
              </TexPick.Provider>
            ) : (
              <SaidText text={m.content} />
            )}
          </div>
        )
      )}

      {m.role === 'assistant' && p.offer && (
        <div className="l5-offer" role="group" aria-label="Something that could be made from this">
          <span className="l5-offer-s">{p.offer.said}</span>
          <button type="button" className="l5-offer-take" onClick={p.offer.onTake}>
            {p.offer.take}
          </button>
          <button type="button" className="l5-offer-no" onClick={p.offer.onDecline}>
            Not now
          </button>
        </div>
      )}

      {(mapFx || objFx.length > 0) && (
        <div className="l5-fx" aria-label="What this turn did in the workspace">
          {mapFx && (
            <button
              type="button"
              className="l5-fx-chip"
              onMouseEnter={() => p.onHoverNodes?.(mapFx.nodes)}
              onMouseLeave={() => p.onHoverNodes?.(null)}
              onFocus={() => p.onHoverNodes?.(mapFx.nodes)}
              onBlur={() => p.onHoverNodes?.(null)}
              onClick={() => p.onShowNodes?.(mapFx.nodes)}
              title="Show these on the map"
            >
              <Icon d={I.map} />
              {mapFx.said}
            </button>
          )}
          {objFx.map((o) => (
            <button key={o.id} type="button" className="l5-fx-chip is-obj" onClick={() => p.onOpenObject?.(o.id)} title={`Open ${o.label}`}>
              <span className="l5-fx-kind">{o.kind}</span>
              {o.label}
            </button>
          ))}
        </div>
      )}

      {(m.content || p.onRetry) && !editing && (
        <div className="l5-acts" role="group" aria-label={`Actions for ${whose} message`}>
          {m.content && <CopyButton text={m.role === 'assistant' ? contentAsText(m.content) : m.content} label={`Copy ${whose} message`} />}
          {p.canReply && p.onReply && (
            <button type="button" className="l5-act" onClick={() => p.onReply!(m)} aria-label={`Reply to ${whose} message`} title="Reply">
              <Icon d={I.reply} />
              <span className="l5-act-l">Reply</span>
            </button>
          )}
          {p.onRetry && (
            <button type="button" className="l5-act" onClick={() => p.onRetry!(m)} aria-label="Ask again" title="Ask again">
              <Icon d={I.retry} />
              <span className="l5-act-l">Retry</span>
            </button>
          )}
          {p.onEdit && (
            <button type="button" className="l5-act" onClick={() => setEditing(true)} aria-label="Edit your message" title="Edit">
              <Icon d={I.edit} />
              <span className="l5-act-l">Edit</span>
            </button>
          )}
        </div>
      )}
    </article>
  );
}

/** A write-up, in the conversation: what it is, how it opens, and the way to it in Content. */
function WriteUpCard({ w, onOpen }: { w: { id: string; title: string; opening: string; words: number }; onOpen?: (id: string) => void }) {
  return (
    <div className="l5-writeup" role="group" aria-label={`Written in Content: ${w.title}`}>
      <span className="l5-writeup-k">Written in Content</span>
      <b className="l5-writeup-t">{w.title}</b>
      {w.opening && <p className="l5-writeup-o">{w.opening}</p>}
      {onOpen && (
        <button type="button" className="l5-writeup-open" onClick={() => onOpen(w.id)}>
          Read it in Content · {w.words} {w.words === 1 ? 'word' : 'words'} <span aria-hidden="true">→</span>
        </button>
      )}
    </div>
  );
}

/** Socria, still writing — formatted as it arrives (finished paragraphs as blocks), or thinking. A write-up is written in Content, and said so here. */
export function L5Pending({ text, group, to, mapping, onStop, place }: { text: string; group: boolean; to?: string | null; mapping?: boolean; onStop?: () => void; place?: 'chat' | 'content' }) {
  return (
    <article className={`l5-msg l5-a is-socria is-pending${group ? ' is-group' : ''}`} aria-live="polite" aria-busy="true">
      {group && (
        <div className="l5-who">
          <span className="l5-av is-socria" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-mark.png" alt="" width={14} height={14} />
          </span>
          <span>
            Socria{to && <span className="l5-to"> → {to}</span>}
          </span>
        </div>
      )}
      {text && place === 'content' ? (
        <div className="l5-writeup is-writing" role="status">
          <span className="l5-writeup-k">Writing in Content</span>
          <b className="l5-writeup-t">{writeUpParts(text).title}</b>
          <span className="l5-writeup-n">
            {writeUpParts(text).words} words so far
            <span className="l5-caret" aria-hidden="true" />
          </span>
        </div>
      ) : text ? (
        <div className="l5-prose is-streaming">
          <StreamingRichText text={text} math rich />
          <span className="l5-caret" aria-hidden="true" />
        </div>
      ) : (
        <div className="l5-thinking">
          <span className="l5-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>{mapping ? 'Thinking, and reading the map…' : 'Thinking…'}</span>
          {onStop && (
            <button type="button" className="l5-link" onClick={onStop}>
              Stop
            </button>
          )}
        </div>
      )}
    </article>
  );
}
