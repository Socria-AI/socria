'use client';
// components/share/SharedThread.tsx
//
// THINK TOGETHER, IN A CORE CONVERSATION — the shared chat, open in the main
// pane (/chat?shared=<id>).
//
// Everyone sees the same turns, kept in step by a cheap poll (the route
// answers "unchanged" when nothing moved). Each person's turn is named. Who
// else is here is shown, and when someone is typing. Anyone who may comment
// can comment on any turn; an editor can resolve. The history says who did
// what. A viewer reads; a commenter reads and comments; an editor also asks
// Socria — and every one of those limits is the server's, not this page's.
//
// Socria's replies here carry nobody's memory (lib/share/turn.ts): a reply in
// a shared conversation is read by everyone in it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RichText } from '@/components/RichText';
import { readActivity } from '@/lib/core4/activity';
import { ROLE_WORD, type Role } from '@/lib/share/roles';
import { hueOf } from '@/lib/share/hue';
import { excerpt, messageAnchor, readAnchor } from '@/lib/share/comments';
import { useComments } from './comments/useComments';
import { CommentComposer, CommentThread, CommentsButton, CommentsPanel } from './comments/Comments';
import './share.css';
import './shared-thread.css';

interface Msg { role: 'user' | 'assistant'; content: string; by?: { id: string; name: string; seat: string } }
interface Convo { id: string; title: string; kind: 'chat' | 'logos'; messages: Msg[]; projectId: string | null; updatedAt: number }
interface Present { id: string; name: string; you: boolean; role: Role; cursor: { x: number; y: number; on?: string } | null; at: number }

const POLL_MS = 3000;
const BEAT_MS = 5000;
const when = (t: number) => {
  const d = (Date.now() - t) / 60000;
  if (d < 1) return 'just now';
  if (d < 60) return `${Math.round(d)}m ago`;
  if (d < 1440) return `${Math.round(d / 60)}h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export function SharedThread({
  id,
  onClose,
  onShare,
  onUpgrade,
}: {
  id: string;
  onClose: () => void;
  onShare?: (title: string) => void;
  onUpgrade?: () => void;
}) {
  const [convo, setConvo] = useState<Convo | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [owner, setOwner] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [people, setPeople] = useState<Present[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState<string | null>(null);
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [history, setHistory] = useState<{ who: string; summary: string; at: number; you: boolean }[] | null>(null);
  const updated = useRef(0);
  const typing = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const may = useMemo(() => ({ ask: role === 'owner' || role === 'editor' }), [role]);
  // the comments, their threads, and what this person may do with them
  const comments = useComments('conversation', id, true);

  const load = useCallback(async (quiet = false) => {
    try {
      const q = quiet && updated.current ? `?since=${updated.current}` : '';
      const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}${q}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'This conversation could not be opened.');
      if (j.unchanged) return;
      updated.current = j.conversation.updatedAt;
      setConvo(j.conversation);
      setRole(j.role);
      setOwner(j.owner);
      setErr(null);
    } catch (e) {
      if (!quiet) setErr(e instanceof Error ? e.message : 'This conversation could not be opened.');
    }
  }, [id]);

  // first read, then the poll that keeps everyone in step
  useEffect(() => {
    updated.current = 0;
    setConvo(null);
    void load();
    const t = setInterval(() => {
      if (document.hidden) return;
      void load(true);
    }, POLL_MS);
    return () => clearInterval(t);
  }, [load]);

  // presence: here, and typing or reading
  useEffect(() => {
    let live = true;
    const beat = async () => {
      if (document.hidden) return;
      const res = await fetch('/api/shared/presence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'conversation', id, cursor: { x: 0, y: 0, on: typing.current ? 'typing' : 'reading' } }),
      }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (live && j?.present) setPeople(j.present);
    };
    void beat();
    const t = setInterval(beat, BEAT_MS);
    const bye = () => navigator.sendBeacon?.('/api/shared/presence', new Blob([JSON.stringify({ type: 'conversation', id, leave: true })], { type: 'application/json' }));
    window.addEventListener('pagehide', bye);
    return () => {
      live = false;
      clearInterval(t);
      window.removeEventListener('pagehide', bye);
      void fetch('/api/shared/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'conversation', id, leave: true }) }).catch(() => null);
    };
  }, [id]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: 'end' });
  }, [convo?.messages.length, streaming]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || !convo || streaming !== null) return;
    setSendErr(null);
    setInput('');
    typing.current = false;
    const turns = [...convo.messages.map((m) => ({ role: m.role, content: m.content })), { role: 'user' as const, content: text }];
    setConvo({ ...convo, messages: [...convo.messages, { role: 'user', content: text, by: { id: 'me', name: 'You', seat: 'guest' } }] });
    setStreaming('');
    let reply = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'core-4', conversationId: id, messages: turns.slice(-24), ...(convo.projectId ? { projectId: convo.projectId } : {}) }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        if (res.status === 402) onUpgrade && setSendErr(j?.error ?? 'That is the limit for today.');
        throw new Error(j?.error || 'Socria could not answer just now.');
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let tail = '';
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          const parsed = readActivity(tail + decoder.decode(value, { stream: true }));
          tail = parsed.tail;
          reply += parsed.text;
          setStreaming(reply);
        }
      }
      // both turns into the shared row — the server appends to the row as it
      // stands, so a collaborator writing at the same moment loses nothing
      const saved = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ append: [{ role: 'user', content: text }, ...(reply.trim() ? [{ role: 'assistant', content: reply }] : [])] }),
      });
      if (!saved.ok) throw new Error((await saved.json().catch(() => null))?.error || 'That could not be saved.');
    } catch (er) {
      setSendErr((s) => s ?? (er instanceof Error ? er.message : 'Socria could not answer just now.'));
      setInput(text);
    } finally {
      setStreaming(null);
      updated.current = 0;
      void load();
    }
  }

  /** from the panel to the turn a thread is about */
  function jumpTo(anchor: string) {
    const a = readAnchor(anchor);
    if (a.kind !== 'message') return;
    setOpenAt(anchor);
    document.getElementById(`st-turn-${a.ref}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  async function showHistory() {
    if (history) return setHistory(null);
    const res = await fetch(`/api/shared/activity?type=conversation&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const j = await res.json().catch(() => null);
    setHistory(j?.activity ?? []);
  }

  if (err) {
    return (
      <div className="st-root">
        <div className="st-wrap"><p className="sh-err" role="alert">{err}</p><button className="sh-btn ghost" onClick={onClose}>Back</button></div>
      </div>
    );
  }
  if (!convo || !role) return <div className="st-root" aria-busy="true"><div className="st-wrap"><p className="sh-quiet">Opening…</p></div></div>;

  const others = people.filter((p) => !p.you);
  const typingNow = others.filter((p) => p.cursor?.on === 'typing');
  const threadsAt = (a: string) => comments.threads.filter((t) => t.root.anchor === a);

  return (
    <div className="st-root">
      <header className="st-head">
        <button className="st-back" onClick={onClose} aria-label="Back to your conversations">←</button>
        <div className="st-title">
          <span className="sh-kicker">Shared{role !== 'owner' ? ` by ${owner} · ${ROLE_WORD[role]}` : ' · you own this'}</span>
          <h1>{convo.title || 'Untitled'}</h1>
        </div>
        <div className="st-acts">
          <span className="st-faces" aria-label={`${people.length} here now`}>
            {people.slice(0, 5).map((p) => (
              <i key={p.id} style={{ background: hueOf(p.id) }} title={`${p.you ? 'You' : p.name}${p.cursor?.on === 'typing' ? ' — typing' : ''}`}>
                {p.name.trim()[0]?.toUpperCase() ?? '?'}
              </i>
            ))}
          </span>
          <CommentsButton state={comments} active={panel} onClick={() => setPanel((o) => !o)} />
          <button className="sh-open" onClick={() => void showHistory()} aria-pressed={!!history}>History</button>
          {onShare && <button className="sh-open" onClick={() => onShare(convo.title || 'Untitled')}>Share</button>}
        </div>
      </header>

      {history && (
        <aside className="st-history" aria-label="History">
          {history.length ? (
            <ul>{history.map((h, i) => <li key={i}><b>{h.you ? 'You' : h.who}</b> {h.summary.replace(new RegExp(`^${h.who}\\s*`), '')}<time>{when(h.at)}</time></li>)}</ul>
          ) : <p className="sh-quiet">Nothing has changed since it was shared.</p>}
        </aside>
      )}

      <div className="st-thread">
        <div className="st-wrap">
          {convo.messages.map((m, i) => {
            const anchor = messageAnchor(i);
            const threads = threadsAt(anchor);
            const open = openAt === anchor;
            const unresolved = threads.filter((t) => t.open).length;
            return (
              <div key={i} id={`st-turn-${i}`} className={`st-turn ${m.role}`}>
                <span className="st-who" style={m.by ? { color: hueOf(m.by.id) } : undefined}>
                  {m.role === 'assistant' ? 'Socria' : m.by?.name ?? owner}
                </span>
                <div className="st-body">{m.role === 'assistant' ? <RichText text={m.content} /> : <p>{m.content}</p>}</div>
                {(comments.mayComment || threads.length > 0) && (
                  <button
                    className={`st-cbtn${unresolved ? ' has' : ''}`}
                    onClick={() => {
                      setOpenAt(open ? null : anchor);
                      comments.markSeen();
                    }}
                    aria-expanded={open}
                  >
                    {threads.length
                      ? unresolved
                        ? `${unresolved} open ${unresolved === 1 ? 'comment' : 'comments'}`
                        : `${threads.length} resolved`
                      : 'Comment'}
                  </button>
                )}
                {open && (
                  <div className="st-comments">
                    {threads.map((t) => (
                      <CommentThread key={t.root.id} thread={t} state={comments} />
                    ))}
                    {comments.mayComment && (
                      <CommentComposer
                        autoFocus={!threads.length}
                        placeholder="Comment on this turn"
                        onSubmit={(body) => comments.add(anchor, body)}
                        onCancel={() => setOpenAt(null)}
                      />
                    )}
                    {comments.error && <p className="sh-err">{comments.error}</p>}
                  </div>
                )}
              </div>
            );
          })}
          {streaming !== null && (
            <div className="st-turn assistant">
              <span className="st-who">Socria</span>
              <div className="st-body">{streaming ? <RichText text={streaming} /> : <p className="sh-quiet">Thinking…</p>}</div>
            </div>
          )}
          <div ref={bottom} />
        </div>
      </div>

      {panel && (
        <CommentsPanel
          state={comments}
          labelFor={(anchor) => {
            const a = readAnchor(anchor);
            const m = a.kind === 'message' ? convo.messages[Number(a.ref)] : null;
            return m ? excerpt(m.content) : null;
          }}
          generalAnchor=""
          generalLabel="this conversation"
          hint="Or comment on one turn, under it."
          onJump={jumpTo}
          onClose={() => setPanel(false)}
        />
      )}

      <footer className="st-foot">
        <div className="st-wrap">
          {typingNow.length > 0 && <p className="st-typing">{typingNow.map((p) => p.name).join(' and ')} {typingNow.length === 1 ? 'is' : 'are'} typing…</p>}
          {sendErr && <p className="sh-err">{sendErr} {onUpgrade && /limit|Socria One/.test(sendErr) && <button className="sh-small" onClick={onUpgrade}>Socria One</button>}</p>}
          {may.ask ? (
            <form className="st-composer" onSubmit={send}>
              <textarea
                value={input}
                onChange={(e) => { setInput(e.target.value); typing.current = !!e.target.value.trim(); }}
                onBlur={() => { typing.current = false; }}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e as unknown as React.FormEvent); } }}
                placeholder="Think it through together…"
                aria-label="Message"
                rows={1}
              />
              <button className="sh-btn" type="submit" disabled={!input.trim() || streaming !== null}>Send</button>
            </form>
          ) : (
            <p className="st-readonly">
              {role === 'commenter' ? 'You can read and comment on this conversation.' : 'You can read this conversation.'}
            </p>
          )}
          <p className="st-privacy">Replies here use no one’s personal memory — everyone in this conversation can read them.</p>
        </div>
      </footer>
    </div>
  );
}
