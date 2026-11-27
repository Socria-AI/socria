'use client';
// components/new-logos/Conversation.tsx — THE CONVERSATION WORKSPACE.
//
// The conversation is the canonical one (the conversations table, through /api/conversations): the same messages the
// existing interface shows, and anything said here is there too. The assistant is the existing chat endpoint
// (/api/logos/chat) — the same accounts, limits and reasoning — told about the objective this conversation serves when
// it serves one (lib/new-logos/context.ts, assembled by /api/new-logos/context).
//
// What this page adds is the conversation's place in the work: the objective it sits in (or none — a conversation
// never has to belong to one), the nodes related to it, and a way to keep what comes out of it as an objective, a
// question, knowledge, a decision or an artifact, with its provenance recorded.
//
// The order of a turn: the person's message is saved first (so it is never lost), then the reply streams, then the
// reply is saved. A reply that fails leaves the message saved and offers to try again.

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodeRow, NodeType } from '@/lib/new-logos/model';
import {
  displayTitle,
  failureText,
  forAssistant,
  newConversationId,
  newMessage,
  placementOf,
  titleFromMessage,
  visibleReply,
  type StoredMessage,
} from '@/lib/new-logos/convo';
import { stripMarks } from '@/lib/rich-text';
import { useNL } from './state';
import { ObjectivePicker } from './Matrix';
import { Relations } from './NodeView';
import { Prose } from './Prose';
import { Crumbs, Dialog, Glyph, InlineText, Menu, nodeHref, nodeTitle, typeLabel, when } from './ui';

const KEEP_AS: NodeType[] = ['knowledge', 'question', 'decision', 'artifact'];
const CREATE_FROM: NodeType[] = ['objective', 'question', 'knowledge', 'decision', 'artifact'];

function firstLine(text: string): string {
  const line = stripMarks((text || '').split('\n').map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? '');
  return line.length > 120 ? `${line.slice(0, 119).trimEnd()}…` : line;
}

function CreateDialog({ type, onCreate, onClose }: { type: NodeType; onCreate: (title: string) => Promise<void>; onClose: () => void }) {
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      title={`New ${typeLabel(type).toLowerCase()} from this conversation`}
      onClose={onClose}
      foot={
        <>
          <button type="button" className="nl-btn is-quiet" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="nl-btn is-primary"
            disabled={busy || !title.trim()}
            onClick={async () => {
              setBusy(true);
              await onCreate(title.trim());
              setBusy(false);
            }}
          >
            Create
          </button>
        </>
      }
    >
      <input className="nl-input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={type === 'objective' ? 'What this conversation is working towards' : `${typeLabel(type)} title`} aria-label="Title" />
      {type === 'objective' ? <p className="nl-hint">The conversation will be placed inside the new objective.</p> : null}
    </Dialog>
  );
}

export function ConversationView({ id }: { id: string }) {
  const nl = useNL();
  const { conversations, conversationsLoaded, nodes, setup, appendTurns, rename, createNode, link, nodeAction, deleteNode, say } = nl;
  const router = useRouter();
  const params = useSearchParams();
  const isNew = id === 'new';
  const [convId] = useState(() => (isNew ? newConversationId() : id));
  const [created, setCreated] = useState(!isNew);
  const inParam = params?.get('in') ?? null;
  const investigates = params?.get('investigates') ?? null;
  const canonical = conversations.get(convId);
  const [local, setLocal] = useState<StoredMessage[]>([]);
  const [streaming, setStreaming] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [note, setNote] = useState<{ text: string; retry?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [creating, setCreating] = useState<NodeType | null>(null);
  const abort = useRef<AbortController | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  const stored = canonical?.messages ?? [];
  const messages = useMemo(() => {
    const have = new Set(stored.map((m) => m.id).filter(Boolean));
    return [...stored, ...local.filter((m) => !m.id || !have.has(m.id))];
  }, [stored, local]);

  const placement = placementOf(nodes, convId);
  const live = placement && placement.archived_at === null ? placement : undefined;
  const container = live?.parent_id ? nodes.find((n) => n.id === live.parent_id) : undefined;
  const pendingParent = !created ? (inParam ? nodes.find((n) => n.id === inParam && n.type === 'objective') : undefined) : undefined;
  const objective = container ?? pendingParent;
  const title = canonical ? displayTitle(canonical.title) : created ? displayTitle('') : 'New conversation';
  const taken = nodes.filter((n) => n.archived_at === null && n.provenance.conversationId === convId);
  const question = investigates ? nodes.find((n) => n.id === investigates) : undefined;

  useEffect(() => {
    document.title = `${title} · Workspace`;
  }, [title]);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, streaming]);
  useEffect(() => {
    if (isNew) boxRef.current?.focus();
  }, [isNew]);

  /** The reply to the conversation as it stands (its last message is the person's). */
  async function reply(history: StoredMessage[], placedNow = false) {
    setBusy(true);
    setNote(null);
    setStreaming('');
    const ctrl = new AbortController();
    abort.current = ctrl;
    try {
      let objectiveTurn: unknown = null;
      if (setup && (placedNow || placementOf(nl.nodes, convId))) {
        const c = await fetch(`/api/new-logos/context?conversation=${encodeURIComponent(convId)}&turns=${history.length}`, { cache: 'no-store' }).catch(() => null);
        const j = c && c.ok ? await c.json().catch(() => null) : null;
        objectiveTurn = j?.turn ?? null;
      }
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: convId, messages: forAssistant(history), ...(objectiveTurn ? { objective: objectiveTurn } : {}) }),
      });
      if (!res.ok || !res.body) {
        setStreaming(null);
        setNote({ text: failureText(res.status), retry: res.status !== 413 });
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let stopped = false;
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreaming(visibleReply(acc));
        }
      } catch (e) {
        if ((e as Error)?.name !== 'AbortError') throw e;
        stopped = true;
      }
      const text = visibleReply(acc).trim();
      setStreaming(null);
      if (!text) {
        setNote({ text: stopped ? 'Stopped before a reply arrived.' : failureText(500), retry: true });
        return;
      }
      const answer = newMessage('assistant', text, Date.now());
      setLocal((l) => [...l, answer]);
      const saved = await appendTurns(convId, [answer]);
      if (!saved.ok) setNote({ text: saved.gone ? 'This conversation was deleted in another window. The reply was not saved.' : 'The reply could not be saved just now. It is shown here; it will not appear elsewhere until it is saved.' });
      else setLocal((l) => l.filter((m) => m.id !== answer.id));
    } catch (e) {
      setStreaming(null);
      if ((e as Error)?.name === 'AbortError') setNote({ text: 'Stopped before a reply arrived.', retry: true });
      else setNote({ text: failureText(0), retry: true });
    } finally {
      abort.current = null;
      setBusy(false);
    }
  }

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const first = !created && !canonical;
    const mine = newMessage('user', text, Date.now());
    setLocal((l) => [...l, mine]);
    setInput('');
    setBusy(true);
    const saved = await appendTurns(convId, [mine], first ? { title: titleFromMessage(text) } : undefined);
    if (!saved.ok) {
      setLocal((l) => l.filter((m) => m.id !== mine.id));
      setInput(text);
      setBusy(false);
      setNote({ text: saved.gone ? 'This conversation was deleted in another window.' : 'Your message could not be saved just now. It is back in the box; try again.' });
      return;
    }
    setLocal((l) => l.filter((m) => m.id !== mine.id));
    let placedNow = false;
    if (first) {
      setCreated(true);
      // the address becomes the conversation's own, without leaving the page
      window.history.replaceState(null, '', `/new-logos/c/${encodeURIComponent(convId)}`);
      if (setup && (pendingParent || question)) {
        const placed = await createNode({ type: 'conversation', conversationId: convId, parentId: pendingParent?.id ?? null });
        placedNow = !!placed.ok;
        if (placed.ok && placed.node && question) await link(placed.node.id, question.id, 'investigates');
      }
    }
    await reply([...messages.filter((m) => m.id !== mine.id), mine], placedNow);
  }

  async function keepAs(type: NodeType, m: StoredMessage) {
    const r = await createNode({
      type,
      title: firstLine(m.content) || typeLabel(type),
      parentId: container?.id ?? null,
      provenance: { origin: m.role === 'assistant' ? 'ai' : 'human', conversationId: convId, ...(m.id ? { messageId: m.id } : {}) },
      ...(type === 'knowledge' ? { content: { body: m.content, kind: 'finding' } } : type === 'artifact' ? { content: { subtype: 'document', body: m.content } } : type === 'decision' ? { content: { rationale: m.content } } : { description: m.content }),
    });
    if (!r.ok || !r.node) return say(r.error ?? null);
    if (live) await link(r.node.id, live.id, 'derived_from');
    say(`Kept as ${typeLabel(type).toLowerCase()}${type === 'decision' && m.role === 'assistant' ? ' (a proposal until you accept it)' : ''}.`);
  }

  async function createFrom(type: NodeType, t: string) {
    if (type === 'objective') {
      const r = await createNode({ type: 'objective', title: t, parentId: container?.id ?? null });
      if (!r.ok || !r.node) return say(r.error ?? null);
      const p = await createNode({ type: 'conversation', conversationId: convId, parentId: r.node.id });
      setCreating(null);
      return say(p.ok ? `Created “${t}” and placed this conversation in it.` : p.error ?? null);
    }
    const r = await createNode({ type, title: t, parentId: container?.id ?? null, provenance: { origin: 'human', conversationId: convId } });
    if (!r.ok || !r.node) return say(r.error ?? null);
    if (live) await link(r.node.id, live.id, 'derived_from');
    setCreating(null);
    router.push(nodeHref(r.node));
  }

  const lastIsMine = messages.length > 0 && messages[messages.length - 1].role === 'user';
  if (!isNew && conversationsLoaded && !canonical && !local.length)
    return (
      <main className="nl-page is-narrow">
        <Crumbs nodes={nodes} at={null} current="Conversation" />
        <div className="nl-empty">This conversation does not exist, was deleted, or is not on this account.</div>
      </main>
    );

  return (
    <main className="nl-page">
      <Crumbs nodes={nodes} at={objective?.id ?? null} current={title} />
      <div className="nl-convo">
        <div>
          <div className="nl-head">
            <span className="nl-kicker">
              <Glyph type="conversation" />
              Conversation
            </span>
            {canonical ? <InlineText value={displayTitle(canonical.title)} label="Conversation title" onSave={(t) => void rename(convId, t).then((ok) => !ok && say('Not renamed.'))} /> : <h1 className="nl-title">{title}</h1>}
            <div className="nl-row nl-hint">
              {objective ? (
                <span>
                  In{' '}
                  <Link href={nodeHref(objective)} style={{ textDecoration: 'underline' }}>
                    {objective.title}
                  </Link>
                </span>
              ) : (
                <span>Not in an objective</span>
              )}
              {question ? <span>· Investigating “{question.title}”</span> : null}
              {canonical ? <span>· {canonical.messages.length} messages · {when(canonical.updatedAt)}</span> : null}
            </div>
          </div>
          <div className="nl-thread" aria-live="polite">
            {!messages.length && streaming === null ? (
              <div className="nl-empty">
                {objective ? `A conversation in “${objective.title}”. The assistant will be told about this objective and what it holds.` : 'Say what you are working on, thinking about or trying to understand. Organising it can come later.'}
              </div>
            ) : null}
            {messages.map((m, i) => (
              <article key={m.id ?? `i${i}`} className={`nl-msg is-${m.role}`}>
                <div className="nl-msg-who">
                  <span>{m.role === 'user' ? 'You' : 'Assistant'}</span>
                  {m.at ? <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{when(m.at)}</span> : null}
                </div>
                {m.role === 'user' ? <div className="nl-msg-body">{m.content}</div> : <Prose text={visibleReply(m.content)} />}
                {setup !== false && created ? (
                  <div className="nl-msg-actions is-hover">
                    {KEEP_AS.map((t) => (
                      <button key={t} type="button" className="nl-btn is-quiet is-small" onClick={() => void keepAs(t, m)}>
                        Keep as {typeLabel(t).toLowerCase()}
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}
            {streaming !== null ? (
              <article className="nl-msg is-assistant">
                <div className="nl-msg-who">Assistant</div>
                {streaming ? <Prose text={streaming} streaming /> : <span className="nl-hint nl-typing">Thinking</span>}
              </article>
            ) : null}
            {/* the newest message is scrolled to just above the composer, never under it */}
            <div ref={endRef} style={{ scrollMarginBottom: 200 }} />
          </div>
        </div>

        <aside className="nl-side">
          <section className="nl-panel" aria-label="Place">
            <div className="nl-panel-title">
              <span>Objective</span>
              {setup !== false && created ? (
                live ? (
                  <Menu label="Placement">
                    {(close) => (
                      <>
                        <button type="button" role="menuitem" onClick={() => (close(), setPlacing(true))}>
                          Move to…
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={async () => {
                            close();
                            const r = await deleteNode(live.id);
                            say(r.ok ? 'Removed from the objective. The conversation is unchanged.' : r.error ?? null);
                          }}
                        >
                          Remove from objective
                        </button>
                      </>
                    )}
                  </Menu>
                ) : null
              ) : null}
            </div>
            {objective ? (
              <Link href={nodeHref(objective)} className="nl-rel" style={{ borderTop: 0 }}>
                <Glyph type="objective" size={14} />
                <span style={{ fontWeight: 600 }}>{objective.title}</span>
              </Link>
            ) : setup !== false && created ? (
              <button type="button" className="nl-btn is-small" onClick={() => setPlacing(true)}>
                Place in an objective…
              </button>
            ) : (
              <p className="nl-hint">Not in an objective.</p>
            )}
          </section>
          {live ? <Relations node={live} /> : null}
          {taken.length ? (
            <section className="nl-panel" aria-label="Kept from this conversation">
              <div className="nl-panel-title">Kept from this conversation</div>
              <div>
                {taken.map((n: NodeRow) => (
                  <Link key={n.id} href={nodeHref(n)} className="nl-rel">
                    <Glyph type={n.type} size={14} />
                    <span style={{ fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nodeTitle(n, conversations)}</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
          {setup !== false && created ? (
            <section className="nl-panel" aria-label="Create from this conversation">
              <div className="nl-panel-title">Create from this conversation</div>
              <div className="nl-row">
                {CREATE_FROM.map((t) => (
                  <button key={t} type="button" className="nl-btn is-small" onClick={() => setCreating(t)}>
                    <Glyph type={t} size={13} />
                    {typeLabel(t)}
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </aside>
      </div>

      <div className="nl-composer">
        <div className="nl-composer-inner">
          <div>
            <div className="nl-composer-box">
              <textarea
                ref={boxRef}
                rows={1}
                value={input}
                placeholder={busy ? 'Waiting for the reply…' : 'Write a message'}
                aria-label="Message"
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void send();
                  }
                }}
              />
              {busy && streaming !== null ? (
                <button type="button" className="nl-btn" onClick={() => abort.current?.abort()}>
                  Stop
                </button>
              ) : (
                <button type="button" className="nl-btn is-primary" disabled={busy || !input.trim()} onClick={() => void send()}>
                  Send
                </button>
              )}
            </div>
            <div className="nl-composer-note" role="status">
              {note ? (
                <span className="nl-row" style={{ gap: 8 }}>
                  <span>{note.text}</span>
                  {note.retry && lastIsMine && !busy ? (
                    <button type="button" className="nl-btn is-small" onClick={() => void reply(messages)}>
                      Try again
                    </button>
                  ) : null}
                </span>
              ) : (
                'Enter to send · Shift+Enter for a new line'
              )}
            </div>
          </div>
          <div />
        </div>
      </div>

      {placing ? (
        <ObjectivePicker
          title="Place this conversation in…"
          current={live?.parent_id}
          onClose={() => setPlacing(false)}
          onPick={async (parentId) => {
            setPlacing(false);
            const r = live ? await nodeAction(live.id, 'move', { parentId }) : await createNode({ type: 'conversation', conversationId: convId, parentId });
            say(r.ok ? (parentId ? 'Placed.' : 'Placed at the top level.') : r.error ?? null);
          }}
        />
      ) : null}
      {creating ? <CreateDialog type={creating} onClose={() => setCreating(null)} onCreate={(t) => createFrom(creating, t)} /> : null}
    </main>
  );
}
