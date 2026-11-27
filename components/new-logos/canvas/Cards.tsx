'use client';
// components/new-logos/canvas/Cards.tsx — the objects that live on a canvas.
//
// Every object shares one frame: a handle to move it by (its top bar), what kind of thing it is (glyph and word, never
// colour alone), its title, and a control to open or close it. Closed, an object is a compact summary; open, it is the
// thing itself, worked on in place: an exchange's whole reply, a question's resolution, a decision to accept, a
// document to write and preview. Any object can be asked about — the question goes to the assistant with the object
// as its "this", and the answer appears beside it.

import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ARTIFACT_SUBTYPES, KNOWLEDGE_KINDS, STATES, type NodeRow, type NodeType } from '@/lib/new-logos/model';
import { displayTitle, type Conversation } from '@/lib/new-logos/convo';
import { excerpt, exchangesOf, type Exchange } from '@/lib/new-logos/canvas';
import { Prose } from '../Prose';
import { Glyph, Menu, nodeHref, typeLabel, when } from '../ui';
import { useNL } from '../state';

export function CardFrame({
  type,
  kicker,
  title,
  open,
  onToggle,
  menu,
  children,
  foot,
  linked,
}: {
  type: NodeType | 'exchange';
  kicker: string;
  title: ReactNode;
  open: boolean;
  onToggle: () => void;
  menu?: ReactNode;
  children?: ReactNode;
  foot?: ReactNode;
  linked?: boolean;
}) {
  return (
    <div className={`nl-card is-${type}${open ? ' is-open' : ''}${linked ? ' is-linked' : ''}`}>
      <div className="nl-card-head" data-drag title="Drag to move">
        <span className="nl-card-grip" aria-hidden="true" />
        <Glyph type={type === 'exchange' ? 'conversation' : type} size={14} />
        <span className="nl-card-kicker">{kicker}</span>
        <span className="nl-grow" />
        {menu}
        <button type="button" className="nl-icon-btn nl-card-toggle" aria-expanded={open} aria-label={open ? 'Close' : 'Open'} onClick={onToggle}>
          {open ? '−' : '+'}
        </button>
      </div>
      <div className="nl-card-title">{title}</div>
      {children}
      {foot ? <div className="nl-card-foot">{foot}</div> : null}
    </div>
  );
}

/** A question to the assistant, asked from inside an object. */
export function InlineAsk({ placeholder, onAsk, disabled, autoFocus }: { placeholder: string; onAsk: (text: string) => void; disabled?: boolean; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const go = () => {
    const t = text.trim();
    if (!t || disabled) return;
    onAsk(t);
    setText('');
  };
  return (
    <div className="nl-ask nl-cv-noDrag">
      <textarea
        rows={2}
        value={text}
        placeholder={placeholder}
        aria-label={placeholder}
        autoFocus={autoFocus}
        disabled={disabled}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            go();
          }
        }}
      />
      <button type="button" className="nl-btn is-primary is-small" disabled={disabled || !text.trim()} onClick={go}>
        Ask
      </button>
    </div>
  );
}

/** Text saved as it is edited: on leaving the field, or shortly after typing stops. */
export function EditText({ value, onSave, label, placeholder, rows = 3, mono, debounce = 900 }: { value: string; onSave: (v: string) => void; label: string; placeholder?: string; rows?: number; mono?: boolean; debounce?: number }) {
  const [v, setV] = useState(value);
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    if (!dirty.current) setV(value);
  }, [value]);
  const flush = (t: string) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = null;
    dirty.current = false;
    if (t !== value) onSave(t);
  };
  return (
    <textarea
      className={`nl-textarea nl-cv-scroll${mono ? ' nl-doc-inline' : ''}`}
      aria-label={label}
      rows={rows}
      value={v}
      placeholder={placeholder}
      onChange={(e) => {
        setV(e.target.value);
        dirty.current = true;
        const t = e.target.value;
        if (timer.current) window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => flush(t), debounce);
      }}
      onBlur={() => dirty.current && flush(v)}
    />
  );
}

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ── an exchange: a person's turn and the replies to it ──

export function ExchangeCard({
  ex,
  open,
  streaming,
  note,
  onToggle,
  onAsk,
  onKeep,
  onRetry,
  busy,
}: {
  ex: Exchange;
  open: boolean;
  /** the reply as it arrives, for the exchange being answered */
  streaming?: string | null;
  note?: { text: string; retry: boolean } | null;
  onToggle: () => void;
  onAsk: (text: string) => void;
  onKeep: (type: NodeType, which: 'ask' | 'reply') => void;
  onRetry?: () => void;
  busy: boolean;
}) {
  const [asking, setAsking] = useState(false);
  const reply = ex.replies.map((r) => r.content).join('\n\n');
  const thought = !ex.replies.length && ex.ask?.via === 'thought';
  const at = ex.ask?.at ?? ex.replies[0]?.at;
  const title = ex.ask ? excerpt(ex.ask.content, 120) || 'Untitled' : 'From the assistant';
  return (
    <CardFrame
      type="exchange"
      kicker={`${thought ? 'Thought' : 'Exchange'}${at ? ` · ${when(at)}` : ''}`}
      title={title}
      open={open}
      onToggle={onToggle}
      menu={
        <Menu label="Exchange actions">
          {(close) => (
            <>
              <button type="button" role="menuitem" onClick={() => (close(), setAsking(true))}>
                Ask about this
              </button>
              {(['knowledge', 'question', 'decision', 'artifact'] as NodeType[]).map((t) => (
                <button key={t} type="button" role="menuitem" disabled={!reply && t !== 'question'} onClick={() => (close(), onKeep(t, reply ? 'reply' : 'ask'))}>
                  Keep as {typeLabel(t).toLowerCase()}
                </button>
              ))}
            </>
          )}
        </Menu>
      }
    >
      {open ? (
        <div className="nl-card-body nl-cv-scroll">
          {ex.ask ? <div className="nl-card-ask">{ex.ask.content}</div> : null}
          {streaming !== undefined && streaming !== null ? (
            streaming ? <Prose text={streaming} streaming /> : <p className="nl-hint nl-typing">Thinking</p>
          ) : reply ? (
            <Prose text={reply} />
          ) : thought ? (
            <p className="nl-hint">Kept as a thought, without a reply.</p>
          ) : null}
        </div>
      ) : reply || streaming ? (
        <div className="nl-card-summary">{excerpt(streaming || reply, 200)}</div>
      ) : null}
      {note ? (
        <div className="nl-card-note" role="status">
          {note.text}
          {note.retry && onRetry ? (
            <button type="button" className="nl-btn is-small" onClick={onRetry} disabled={busy}>
              Try again
            </button>
          ) : null}
        </div>
      ) : null}
      {asking || (open && !busy && !note) ? (
        <InlineAsk placeholder={asking ? 'Ask about this exchange' : 'Ask a follow-up'} onAsk={(t) => (setAsking(false), onAsk(t))} disabled={busy} autoFocus={asking} />
      ) : null}
    </CardFrame>
  );
}

// ── a node ──

export function NodeCard({
  node,
  open,
  onToggle,
  onAsk,
  busy,
  linked,
  extra,
}: {
  node: NodeRow;
  open: boolean;
  onToggle: () => void;
  onAsk?: (text: string) => void;
  busy?: boolean;
  linked?: boolean;
  extra?: ReactNode;
}) {
  const { nodeAction, nodes, say } = useNL();
  const [asking, setAsking] = useState(false);
  const [preview, setPreview] = useState(false);
  const saveRef = useRef(nodeAction);
  saveRef.current = nodeAction;
  const save = async (fields: Record<string, unknown>) => {
    const r = await saveRef.current(node.id, 'update', fields);
    if (!r.ok) say(r.error ?? 'Not saved.');
  };
  const act = async (a: string) => {
    const r = await saveRef.current(node.id, a);
    if (!r.ok) say(r.error ?? null);
  };
  const c = node.content as Record<string, unknown>;
  const body = String(c.body ?? '');
  const kids = node.type === 'objective' ? nodes.filter((n) => n.parent_id === node.id && n.archived_at === null).length : 0;
  const origin = node.provenance.origin === 'ai' ? 'AI-generated' : node.provenance.origin === 'external' ? `Source: ${node.provenance.source?.label || 'external'}` : 'Yours';
  const kicker =
    node.type === 'decision'
      ? `Decision · ${node.state === 'accepted' ? 'accepted' : node.state}`
      : node.type === 'question'
        ? `Question · ${node.state}`
        : node.type === 'knowledge'
          ? `Knowledge · ${origin}`
          : node.type === 'artifact'
            ? `${ARTIFACT_SUBTYPES.find((s) => s.id === c.subtype)?.label ?? 'Document'}`
            : node.type === 'objective'
              ? `Objective · ${kids} inside`
              : typeLabel(node.type);
  return (
    <CardFrame
      type={node.type}
      kicker={`${kicker}${linked ? ' · linked' : ''}`}
      title={node.title}
      open={open}
      onToggle={onToggle}
      linked={linked}
      menu={
        <Menu label={`${typeLabel(node.type)} actions`}>
          {(close) => (
            <>
              {onAsk ? (
                <button type="button" role="menuitem" onClick={() => (close(), setAsking(true))}>
                  Ask about this
                </button>
              ) : null}
              <Link href={nodeHref(node)} role="menuitem" className="nl-menu-link" onClick={close}>
                Open details
              </Link>
              {node.type === 'objective' ? (
                <Link href={`/new-logos/w/${encodeURIComponent(node.id)}`} role="menuitem" className="nl-menu-link" onClick={close}>
                  Open its workspace
                </Link>
              ) : null}
            </>
          )}
        </Menu>
      }
    >
      {!open ? (
        node.type === 'artifact' ? (
          <div className="nl-card-summary">{excerpt(body, 160) || 'Empty document'}</div>
        ) : node.type === 'knowledge' ? (
          <div className="nl-card-summary">{excerpt(body, 160)}</div>
        ) : node.type === 'decision' && c.rationale ? (
          <div className="nl-card-summary">{excerpt(String(c.rationale), 160)}</div>
        ) : node.description ? (
          <div className="nl-card-summary">{excerpt(node.description, 160)}</div>
        ) : null
      ) : (
        <div className="nl-card-body nl-card-form nl-cv-noDrag">
          {node.type === 'question' ? (
            <>
              <div className="nl-seg" role="group" aria-label="State">
                {STATES.question.map((s) => (
                  <button key={s} type="button" aria-pressed={node.state === s} onClick={() => node.state !== s && void save({ state: s })}>
                    {cap(s)}
                  </button>
                ))}
              </div>
              <EditText label="Resolution" value={String(c.resolution ?? '')} placeholder="What settles it, once you know" onSave={(v) => void save({ content: { resolution: v } })} />
            </>
          ) : null}
          {node.type === 'knowledge' ? (
            <>
              <select className="nl-select" value={String(c.kind ?? 'finding')} aria-label="Kind" onChange={(e) => void save({ content: { kind: e.target.value } })}>
                {KNOWLEDGE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {cap(k)}
                  </option>
                ))}
              </select>
              <EditText label="What is known" value={body} rows={6} onSave={(v) => void save({ content: { body: v } })} />
            </>
          ) : null}
          {node.type === 'decision' ? (
            <>
              <div className="nl-row">
                <span className="nl-hint nl-grow">
                  {node.state === 'accepted' ? 'Accepted by you.' : node.provenance.origin === 'ai' ? 'Proposed by the assistant: not yours until you accept it.' : 'Proposed.'}
                </span>
                {node.state !== 'accepted' ? (
                  <button type="button" className="nl-btn is-primary is-small" onClick={() => void act('accept')}>
                    Accept
                  </button>
                ) : (
                  <button type="button" className="nl-btn is-small" onClick={() => void act('reopen')}>
                    Reopen
                  </button>
                )}
                {node.state === 'proposed' ? (
                  <button type="button" className="nl-btn is-small" onClick={() => void act('reject')}>
                    Reject
                  </button>
                ) : null}
              </div>
              <EditText label="Rationale" value={String(c.rationale ?? '')} rows={4} placeholder="Why this, and not the alternatives" onSave={(v) => void save({ content: { rationale: v } })} />
            </>
          ) : null}
          {node.type === 'artifact' ? (
            <>
              <div className="nl-row">
                <span className="nl-hint nl-grow">{preview ? 'Preview' : 'Markdown; maths in $…$'}</span>
                <div className="nl-seg" role="group" aria-label="View">
                  <button type="button" aria-pressed={!preview} onClick={() => setPreview(false)}>
                    Edit
                  </button>
                  <button type="button" aria-pressed={preview} onClick={() => setPreview(true)}>
                    Preview
                  </button>
                </div>
              </div>
              {preview ? (
                <div className="nl-card-doc nl-cv-scroll">{body.trim() ? <Prose text={body} /> : <p className="nl-hint">Nothing written yet.</p>}</div>
              ) : (
                <EditText label="Document" value={body} rows={14} mono placeholder="# Heading" onSave={(v) => void save({ content: { body: v } })} />
              )}
            </>
          ) : null}
          {node.type === 'objective' ? (
            <>
              {c.outcome ? <p className="nl-hint">Outcome: {String(c.outcome)}</p> : null}
              <div className="nl-row">
                <Link className="nl-btn is-small" href={`/new-logos/w/${encodeURIComponent(node.id)}`}>
                  Open its workspace
                </Link>
                <Link className="nl-btn is-quiet is-small" href={nodeHref(node)}>
                  Its matrix
                </Link>
              </div>
            </>
          ) : null}
          {extra}
        </div>
      )}
      {asking ? <InlineAsk placeholder={`Ask about “${node.title}”`} onAsk={(t) => (setAsking(false), onAsk?.(t))} disabled={busy} autoFocus /> : null}
    </CardFrame>
  );
}

// ── a conversation, on an objective's canvas ──

export function ConversationCard({
  node,
  conv,
  open,
  onToggle,
  streaming,
  note,
  onAsk,
  busy,
}: {
  node: NodeRow;
  conv: Conversation | undefined;
  open: boolean;
  onToggle: () => void;
  streaming: { ask: string; text: string } | null;
  note: string | null;
  onAsk: (text: string) => void;
  busy: boolean;
}) {
  const exchanges = conv ? exchangesOf(conv.messages) : [];
  const last = exchanges[exchanges.length - 1];
  const title = conv ? displayTitle(conv.title) : 'Conversation unavailable';
  return (
    <CardFrame
      type="conversation"
      kicker={`Conversation · ${exchanges.length} exchange${exchanges.length === 1 ? '' : 's'}${conv ? ` · ${when(conv.updatedAt)}` : ''}`}
      title={title}
      open={open}
      onToggle={onToggle}
      menu={
        conv ? (
          <Menu label="Conversation actions">
            {(close) => (
              <Link href={`/new-logos/c/${encodeURIComponent(conv.id)}`} role="menuitem" className="nl-menu-link" onClick={close}>
                Open its canvas
              </Link>
            )}
          </Menu>
        ) : null
      }
    >
      {!open ? (
        last ? (
          <div className="nl-card-summary">{excerpt(last.replies.map((r) => r.content).join(' ') || last.ask?.content || '', 180)}</div>
        ) : null
      ) : (
        <div className="nl-card-body nl-cv-scroll">
          {exchanges.slice(-3).map((e) => (
            <div key={e.key} className="nl-card-mini">
              {e.ask ? <div className="nl-card-ask">{e.ask.content}</div> : null}
              {e === last && !streaming ? <Prose text={e.replies.map((r) => r.content).join('\n\n')} /> : <div className="nl-card-summary">{excerpt(e.replies.map((r) => r.content).join(' '), 200)}</div>}
            </div>
          ))}
          {streaming ? (
            <div className="nl-card-mini">
              <div className="nl-card-ask">{streaming.ask}</div>
              {streaming.text ? <Prose text={streaming.text} streaming /> : <p className="nl-hint nl-typing">Thinking</p>}
            </div>
          ) : null}
          {conv ? (
            <Link className="nl-btn is-quiet is-small" href={`/new-logos/c/${encodeURIComponent(conv.id)}`}>
              Open its canvas
            </Link>
          ) : null}
        </div>
      )}
      {note ? (
        <div className="nl-card-note" role="status">
          {note}
        </div>
      ) : null}
      {open && conv ? <InlineAsk placeholder="Continue this conversation" onAsk={onAsk} disabled={busy} /> : null}
    </CardFrame>
  );
}
