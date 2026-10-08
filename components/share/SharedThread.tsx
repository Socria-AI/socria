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
//
// A GROUP CHAT. With others here, a message goes to everyone and Socria
// answers when it is asked — @socria, or a reply to something it said
// (lib/chat-thread.ts). Your words sit on the right; everyone else's on the
// left under their name; Socria's on the left, saying whom it is answering.
//
// NOTHING SAID HERE IS WIPED BY THE POLL. Every message carries an id from the
// moment it is made; what this screen has said and the server does not hold
// yet stays on screen, joined to each poll's answer, and its save is tried
// again until it lands (the server skips an id it already has). Socria's
// answer is on screen the moment it is written — it used to vanish between
// the end of the stream and the reload, and was dropped if the save failed.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RichText } from '@/components/RichText';
import { readActivity } from '@/lib/core4/activity';
import { ROLE_WORD, type Role } from '@/lib/share/roles';
import { hueOf } from '@/lib/share/hue';
import { excerpt, messageAnchor, readAnchor } from '@/lib/share/comments';
import { useComments } from './comments/useComments';
import { callsSocria, mentionParts, newMsgId, replyRefOf, type ReplyRef } from '@/lib/chat-thread';
import { copyText } from '@/lib/copy-text';
import type { ConversationStyle } from '@/lib/conversation-style';
import { CommentComposer, CommentThread, CommentsButton, CommentsPanel } from './comments/Comments';
import './share.css';
import './shared-thread.css';

interface Msg { id?: string; at?: number; role: 'user' | 'assistant'; content: string; by?: { id: string; name: string; seat: string }; replyTo?: ReplyRef }
interface Convo { id: string; title: string; kind: 'chat' | 'logos'; messages: Msg[]; projectId: string | null; updatedAt: number }
interface Present { id: string; name: string; you: boolean; role: Role; cursor: { x: number; y: number; on?: string } | null; doing?: 'asking' | null; at: number }

/** Copy, with a moment of "Copied" when it worked. */
function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="st-act"
      onClick={async () => {
        if (await copyText(text)) {
          setDone(true);
          window.setTimeout(() => setDone(false), 1600);
        }
      }}
      aria-label="Copy this message"
    >
      {done ? 'Copied' : 'Copy'}
    </button>
  );
}

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
  conversationStyle,
  onClose,
  onShare,
  onUpgrade,
}: {
  id: string;
  /** how this person asked Socria to talk with them — replies to their turns use it */
  conversationStyle?: ConversationStyle;
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
  /** the alias this person's own turns are signed with (the server says) */
  const [me, setMe] = useState('');
  /** the message the next one answers */
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  /** said here, not yet held by the server — kept on screen through every poll */
  const pending = useRef<Map<string, Msg>>(new Map());
  const saving = useRef(false);
  const asking = useRef(false);
  const beatNow = useRef<(() => void) | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [openAt, setOpenAt] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);
  const [history, setHistory] = useState<{ who: string; summary: string; at: number; you: boolean }[] | null>(null);
  const updated = useRef(0);
  const typing = useRef(false);
  const bottom = useRef<HTMLDivElement>(null);

  const may = useMemo(() => ({ ask: role === 'owner' || role === 'editor' }), [role]);
  // the comments, their threads, and what this person may do with them
  const comments = useComments('conversation', id, true);

  /** The server's turns, then what this screen has said that it does not hold yet. */
  const withPending = useCallback((server: Msg[]): Msg[] => {
    const held = new Set(server.map((m) => m.id).filter(Boolean) as string[]);
    for (const k of Array.from(pending.current.keys())) if (held.has(k)) pending.current.delete(k);
    return [...server, ...Array.from(pending.current.values())];
  }, []);

  /**
   * Save what this screen has said and the server does not hold — in order, a
   * few at a time, tried again with a pause when it fails. A turn the server
   * already has is skipped there, so trying again never says anything twice.
   */
  const save = useCallback(async (): Promise<boolean> => {
    if (saving.current) return false;
    saving.current = true;
    try {
      for (let attempt = 0; attempt < 4; ) {
        const turns = Array.from(pending.current.values()).filter((m) => m.content.trim());
        if (!turns.length) return true;
        const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          // the server signs each person's turn itself; a name sent from here is never kept
          body: JSON.stringify({ append: turns.slice(0, 4).map(({ by: _by, ...m }) => m) }),
        }).catch(() => null);
        const j = res ? await res.json().catch(() => null) : null;
        if (res?.ok && Array.isArray(j?.messages)) {
          updated.current = Number(j.updatedAt) || updated.current;
          setConvo((c) => (c ? { ...c, messages: withPending(j.messages) } : c));
          continue;
        }
        if (res?.status === 403) {
          setSendErr(j?.error || 'You can read this conversation, but not add to it.');
          return false;
        }
        attempt++;
        await new Promise((r) => setTimeout(r, 900 * 2 ** attempt));
      }
      setSendErr('Not saved yet — it stays here, and is tried again in a moment.');
      return false;
    } finally {
      saving.current = false;
    }
  }, [id, withPending]);

  const load = useCallback(async (quiet = false) => {
    try {
      const q = quiet && updated.current ? `?since=${updated.current}` : '';
      const res = await fetch(`/api/shared/conversation/${encodeURIComponent(id)}${q}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'This conversation could not be opened.');
      if (!j.unchanged) {
        updated.current = j.conversation.updatedAt;
        // joined, never replaced: what was just said here stays on screen
        setConvo({ ...j.conversation, messages: withPending(j.conversation.messages ?? []) });
        setRole(j.role);
        setOwner(j.owner);
        if (typeof j.me === 'string') setMe(j.me);
        setErr(null);
      }
      // a save that failed is tried again — but never under a reply still being written
      if (pending.current.size && !asking.current) void save();
    } catch (e) {
      if (!quiet) setErr(e instanceof Error ? e.message : 'This conversation could not be opened.');
    }
  }, [id, save, withPending]);

  // first read, then the poll that keeps everyone in step
  useEffect(() => {
    updated.current = 0;
    pending.current = new Map();
    setConvo(null);
    setReplyTo(null);
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
        body: JSON.stringify({
          type: 'conversation',
          id,
          cursor: { x: 0, y: 0, on: typing.current ? 'typing' : 'reading', ...(asking.current ? { doing: 'asking' } : {}) },
        }),
      }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (live && j?.present) setPeople(j.present);
    };
    beatNow.current = () => void beat();
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
    if (!text || !convo) return;
    // With others here it is a group: Socria speaks when it is asked.
    const group = people.some((p) => !p.you);
    const replying = replyTo;
    const asks = callsSocria({ group, text, replyTo: replying });
    if (asks && streaming !== null) {
      setSendErr('Socria is still answering — send this again in a moment.');
      return;
    }
    setSendErr(null);
    setInput('');
    setReplyTo(null);
    typing.current = false;
    const myName = people.find((p) => p.you)?.name || 'You';
    const mine: Msg = {
      id: newMsgId(),
      at: Date.now(),
      role: 'user',
      content: text,
      by: { id: me || 'me', name: myName, seat: role === 'owner' ? 'host' : 'guest' },
      ...(replying ? { replyTo: replying } : {}),
    };
    pending.current.set(mine.id!, mine);
    setConvo((c) => (c ? { ...c, messages: [...c.messages, mine] } : c));
    // In a group it is said to everyone at once — and when it does not ask
    // Socria, that is all it is.
    if (group) void save();
    if (!asks) return;

    setStreaming('');
    asking.current = true;
    beatNow.current?.();
    // who said what, for Socria: each person's line under their name in a group
    const turns = [...convo.messages, mine].map((m) => ({
      role: m.role,
      content: group && m.role === 'user' ? `${m.by?.name ?? owner}: ${m.content}` : m.content,
      ...(m.role === 'user' && m.replyTo ? { replyTo: m.replyTo } : {}),
    }));
    let reply = '';
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'core-4',
          conversationId: id,
          messages: turns.slice(-24),
          ...(convo.projectId ? { projectId: convo.projectId } : {}),
          ...(conversationStyle ? { conversationStyle } : {}),
        }),
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
      // Socria's answer is on screen the moment it is written, and stays there
      // until the server holds it — then both go into the shared row, which
      // the server appends to as it stands, so nobody writing at the same
      // moment loses anything.
      if (reply.trim()) {
        const answer: Msg = {
          id: newMsgId(),
          at: Date.now(),
          role: 'assistant',
          content: reply,
          ...(group ? { replyTo: replyRefOf(mine, myName) } : {}),
        };
        pending.current.set(answer.id!, answer);
        setConvo((c) => (c ? { ...c, messages: [...c.messages, answer] } : c));
      }
      setStreaming(null);
      asking.current = false;
      await save();
    } catch (er) {
      setSendErr((s) => s ?? (er instanceof Error ? er.message : 'Socria could not answer just now.'));
      if (!group) {
        // alone, the turn goes back to the box rather than standing unanswered
        pending.current.delete(mine.id!);
        setConvo((c) => (c ? { ...c, messages: c.messages.filter((m) => m.id !== mine.id) } : c));
        setInput(text);
        setReplyTo(replying);
      }
    } finally {
      setStreaming(null);
      asking.current = false;
      beatNow.current?.();
    }
  }

  /** Reply to a message: its quote above the box, and the caret in it. */
  function startReply(m: Msg) {
    const who = m.role === 'assistant' ? 'Socria' : m.by?.name ?? owner;
    setReplyTo(replyRefOf(m, who));
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  /** To the turn a quote points at. */
  function jumpToTurn(mid: string) {
    const el = document.querySelector<HTMLElement>(`[data-mid="${mid}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
    window.setTimeout(() => el.classList.remove('is-flash'), 1400);
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
  /** someone else asked Socria; its answer is on its way to them */
  const answering = others.filter((p) => p.doing === 'asking').map((p) => p.name);
  const group = others.length > 0;
  const isMine = (m: Msg) => m.role === 'user' && (m.by ? !!me && m.by.id === me : role === 'owner');
  const keyOf = (m: Msg) => (m.role === 'assistant' ? `socria:${m.replyTo?.who ?? ''}` : isMine(m) ? 'me' : m.by?.id ?? 'owner');
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
            const mine = isMine(m);
            const prev = i > 0 ? convo.messages[i - 1] : null;
            const cont = !!prev && keyOf(prev) === keyOf(m);
            const who = m.role === 'assistant' ? 'Socria' : mine ? 'You' : m.by?.name ?? owner;
            // Socria's answer right under the question it answers needs no quote of it
            const quote = m.replyTo && (m.role === 'user' || !prev?.id || prev.id !== m.replyTo.id) ? m.replyTo : null;
            return (
              <div
                key={m.id ?? i}
                id={`st-turn-${i}`}
                data-mid={m.id}
                className={`st-turn ${m.role} ${m.role === 'assistant' ? 'is-socria' : mine ? 'is-mine' : 'is-other'}${cont ? ' is-cont' : ''}`}
              >
                {!cont && !mine && (
                  <span className="st-who" style={m.role === 'user' ? { color: hueOf(m.by?.id ?? 'owner') } : undefined}>
                    {who}
                    {m.role === 'assistant' && m.replyTo?.role === 'user' && (
                      <span className="st-to"> → {convo.messages.some((x) => x.id === m.replyTo!.id && isMine(x)) ? 'You' : m.replyTo.who}</span>
                    )}
                  </span>
                )}
                {quote && (
                  <button
                    type="button"
                    className="st-quote"
                    onClick={() => quote.id && jumpToTurn(quote.id)}
                    disabled={!quote.id}
                    aria-label={`Replying to ${quote.who}: ${quote.excerpt}`}
                  >
                    <b>{quote.who}</b> {quote.excerpt}
                  </button>
                )}
                <div className="st-body">
                  {m.role === 'assistant' ? (
                    <RichText text={m.content} />
                  ) : (
                    <p>{mentionParts(m.content).map((part, k) => (part.mention ? <span key={k} className="st-mention">@socria</span> : part.text))}</p>
                  )}
                </div>
                <div className="st-turn-acts">
                  {may.ask && !mine && (
                    <button type="button" className="st-act" onClick={() => startReply(m)} aria-label={`Reply to ${who === 'You' ? 'your' : `${who}’s`} message`}>
                      Reply
                    </button>
                  )}
                  <CopyButton text={m.content} />
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
                </div>
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
            <div className="st-turn assistant is-socria">
              <span className="st-who">Socria{group && <span className="st-to"> → You</span>}</span>
              <div className="st-body">{streaming ? <RichText text={streaming} /> : <p className="sh-quiet">Thinking…</p>}</div>
            </div>
          )}
          {answering.length > 0 && (
            <p className="st-typing" aria-live="polite">Socria is answering {answering.join(' and ')}…</p>
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
            <>
            {replyTo && (
              <div className="st-reply" role="status">
                <span className="st-reply-text">
                  <b>Replying to {replyTo.who}</b>
                  <span>{replyTo.excerpt}</span>
                </span>
                <button type="button" className="st-reply-x" aria-label={`Stop replying to ${replyTo.who}`} title="Stop replying (Esc)" onClick={() => setReplyTo(null)}>
                  ×
                </button>
              </div>
            )}
            <form className="st-composer" onSubmit={send}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => { setInput(e.target.value); typing.current = !!e.target.value.trim(); }}
                onBlur={() => { typing.current = false; }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && replyTo) { e.preventDefault(); setReplyTo(null); return; }
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(e as unknown as React.FormEvent); }
                }}
                placeholder={replyTo ? `Reply to ${replyTo.who}…` : group ? 'Message everyone — @socria to ask Socria' : 'Think it through together…'}
                aria-label="Message"
                rows={1}
              />
              {/* talking to the others never waits on Socria; asking it again does */}
              <button className="sh-btn" type="submit" disabled={!input.trim() || (streaming !== null && !group)}>Send</button>
            </form>
            </>
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
