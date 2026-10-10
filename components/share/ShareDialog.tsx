'use client';
// components/share/ShareDialog.tsx
//
// THE SHARE BUTTON'S SHEET — one for everything shareable (a Core chat, a
// Logos line of thinking, a Project and everything in it).
//
// Built to take seconds: type an address and press Invite, or flip "Anyone
// with the link" and press Copy. Everything else — roles, codes, removing
// someone, resetting the link — is on the same sheet and needs no tutorial.
//
// It decides nothing. Every change is a request to /api/share, which checks
// the role and the plan on the server; this only draws what came back — and
// that includes the free plan's one shared chat: the server says whether this
// owner may open a door here, and if not, which chat they already share.

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ROLE_WORD, hostRefusalNote, showCode, type GrantRole, type HostRefusal, type ResourceType, type Role,
} from '@/lib/share/roles';
import './share.css';

interface Member {
  id: string;
  name: string;
  email: string | null;
  role: GrantRole;
  pending: boolean;
  via: 'email' | 'link' | 'code';
  you: boolean;
}
interface State {
  role: Role;
  link: { role: GrantRole; token: string } | null;
  code: { role: GrantRole; code: string } | null;
  members: Member[];
  owner: { name: string; you: boolean };
  mayHost: boolean;
  /** the owner's plan, for the owner only */
  plan?: 'free' | 'one';
  /** why this owner may not open a door here, when they may not */
  refusal?: HostRefusal;
  /** the chat a free owner already shares, with where it opens */
  sharing?: { type: ResourceType; id: string; title: string; open: string } | null;
  emails: boolean;
}

const GRANTS: GrantRole[] = ['editor', 'commenter', 'viewer'];
const initial = (s: string) => (s.trim()[0] ?? '?').toUpperCase();

export function ShareDialog({
  type,
  id,
  title,
  open,
  onClose,
  onUpgrade,
  onLeft,
}: {
  type: ResourceType;
  id: string;
  title: string;
  open: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
  /** a member left: the thing is no longer theirs to see */
  onLeft?: () => void;
}) {
  const [state, setState] = useState<State | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<GrantRole>('editor');
  const [sendLink, setSendLink] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [needsOne, setNeedsOne] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setErr(null);
    try {
      const res = await fetch(`/api/share?type=${type}&id=${encodeURIComponent(id)}`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j?.owner || !Array.isArray(j?.members)) throw new Error(j?.error || 'Sharing could not be opened.');
      setState(j as State);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Sharing could not be opened.');
    }
  }, [type, id]);

  useEffect(() => {
    if (!open) return;
    setState(null);
    setSendLink(null);
    setNeedsOne(false);
    void load();
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => clearTimeout(t);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);

  async function act(body: Record<string, unknown>): Promise<Record<string, unknown> | null> {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, ...body }),
      });
      const j = await res.json().catch(() => null);
      if (res.status === 402) {
        // the server says why: a Project, or the one chat already shared
        setNeedsOne(true);
        setState((s) => (s ? { ...s, mayHost: false, refusal: j?.refusal ?? s.refusal, sharing: j?.sharing ?? s.sharing ?? null } : s));
        return null;
      }
      if (!res.ok) throw new Error(j?.error || 'That could not be changed.');
      if (j?.left) {
        onLeft?.();
        onClose();
        return null;
      }
      setState((s) => (s ? { ...s, ...j } : j));
      return j;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That could not be changed.');
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    const address = email.trim();
    if (!address) return;
    const j = await act({ action: 'invite', email: address, role });
    if (j) {
      setEmail('');
      const inv = j.invited as { known: boolean; emailed: boolean; link: string | null } | undefined;
      setSendLink(inv && !inv.known && !inv.emailed ? inv.link : null);
    }
  }

  async function copy(text: string, what: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* the text is selectable on the sheet either way */
    }
    setCopied(what);
    setTimeout(() => setCopied((c) => (c === what ? null : c)), 1600);
  }

  if (!open) return null;
  const owner = state?.role === 'owner';
  const linkUrl = state?.link ? `${window.location.origin}/s/${state.link.token}` : null;
  const thing = type === 'project' ? 'this Project' : 'this conversation';

  return (
    <div className="sh-scrim" role="dialog" aria-modal="true" aria-label={`Share ${title}`}>
      <div className="sh-back" onClick={onClose} aria-hidden="true" />
      <div className="sh-sheet">
        <header className="sh-head">
          <span className="sh-kicker">{type === 'project' ? 'Share Project' : 'Share'}</span>
          <h2>“{title || 'Untitled'}”</h2>
          <button className="sh-x" onClick={onClose} aria-label="Close">×</button>
        </header>

        {!state && !err && <p className="sh-quiet">Reading who can see {thing}…</p>}
        {err && <p className="sh-err" role="alert">{err}</p>}

        {state && (
          <>
            {owner && (needsOne || !state.mayHost) && (
              <div className="sh-one">
                <p>
                  {state.refusal ? hostRefusalNote(state.refusal, state.sharing ? state.sharing.title || 'Untitled' : null) : 'Sharing this is part of Socria One.'}{' '}
                  Anyone you invite joins for free.
                </p>
                {state.sharing && (
                  <a className="sh-btn ghost" href={state.sharing.open}>Open “{state.sharing.title || 'Untitled'}”</a>
                )}
                {onUpgrade && <button className="sh-btn" onClick={onUpgrade}>Get Socria One</button>}
              </div>
            )}
            {owner && state.mayHost && state.plan === 'free' && (
              <p className="sh-quiet sh-freeline">
                {state.members.length > 0 || state.link || state.code
                  ? 'This is the one chat you can share on the free plan. Stop sharing it to share another — or Socria One shares as many as you like.'
                  : 'On the free plan you can share one chat at a time.'}
              </p>
            )}

            {owner && (
              <form className="sh-add" onSubmit={sendInvite}>
                <input
                  ref={inputRef}
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  placeholder="Add people by email"
                  aria-label="Email address to invite"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={busy || !state.mayHost}
                />
                <select aria-label="What they can do" value={role} onChange={(e) => setRole(e.target.value as GrantRole)} disabled={!state.mayHost}>
                  {GRANTS.map((g) => <option key={g} value={g}>{ROLE_WORD[g]}</option>)}
                </select>
                <button className="sh-btn" type="submit" disabled={busy || !email.trim() || !state.mayHost}>Invite</button>
              </form>
            )}
            {sendLink && (
              <div className="sh-sendlink">
                <p>They don’t have an account yet{state.emails ? '' : ', and this deployment doesn’t send email'} — send them this invitation:</p>
                <div className="sh-copyrow">
                  <input readOnly value={sendLink} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} />
                  <button className="sh-btn ghost" onClick={() => void copy(sendLink, 'invite')}>{copied === 'invite' ? 'Copied' : 'Copy'}</button>
                </div>
              </div>
            )}

            <div className="sh-people">
              <span className="sh-k">People with access</span>
              <ul>
                <li>
                  <span className="sh-av">{initial(state.owner.name)}</span>
                  <span className="sh-who">{state.owner.you ? `${state.owner.name} (you)` : state.owner.name}</span>
                  <span className="sh-role is-fixed">Owner</span>
                </li>
                {state.members.map((m) => (
                  <li key={m.id} className={m.pending ? 'pending' : ''}>
                    <span className="sh-av">{initial(m.email ?? m.name)}</span>
                    <span className="sh-who">
                      {m.pending ? (m.email ?? 'Invited') : m.you ? `${m.name} (you)` : m.name}
                      {m.pending && <em>invited</em>}
                      {!m.pending && m.via !== 'email' && <em>joined by {m.via}</em>}
                    </span>
                    {owner ? (
                      <>
                        <select
                          className="sh-role"
                          aria-label={`What ${m.name} can do`}
                          value={m.role}
                          disabled={busy}
                          onChange={(e) => void act({ action: 'role', memberId: m.id, role: e.target.value })}
                        >
                          {GRANTS.map((g) => <option key={g} value={g}>{ROLE_WORD[g]}</option>)}
                        </select>
                        <button className="sh-rm" aria-label={`Remove ${m.pending ? m.email : m.name}`} disabled={busy} onClick={() => void act({ action: 'remove', memberId: m.id })}>×</button>
                      </>
                    ) : (
                      <>
                        <span className="sh-role is-fixed">{ROLE_WORD[m.role]}</span>
                        {m.you && <button className="sh-leave" disabled={busy} onClick={() => void act({ action: 'remove', memberId: m.id })}>Leave</button>}
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </div>

            {owner && (
              <div className="sh-general">
                <span className="sh-k">General access</span>
                <div className="sh-access">
                  <span className={`sh-glyph${state.link ? ' on' : ''}`} aria-hidden="true">{state.link ? '⌁' : '◌'}</span>
                  <div className="sh-access-main">
                    <select
                      aria-label="Who can open it"
                      value={state.link ? 'link' : 'restricted'}
                      disabled={busy || (!state.link && !state.mayHost)}
                      onChange={(e) => void act({ action: 'link', role: e.target.value === 'link' ? 'viewer' : null })}
                    >
                      <option value="restricted">Restricted — only people added</option>
                      <option value="link">Anyone with the link</option>
                    </select>
                    <span className="sh-sub">{state.link ? 'Anyone signed in who has the link can open it.' : 'Only the people above can open it.'}</span>
                  </div>
                  {state.link && (
                    <select className="sh-role" aria-label="What people with the link can do" value={state.link.role} disabled={busy}
                      onChange={(e) => void act({ action: 'link', role: e.target.value })}>
                      {GRANTS.map((g) => <option key={g} value={g}>{ROLE_WORD[g]}</option>)}
                    </select>
                  )}
                </div>
                {linkUrl && (
                  <div className="sh-copyrow">
                    <input readOnly value={linkUrl} aria-label="Share link" onFocus={(e) => e.currentTarget.select()} />
                    <button className="sh-btn" onClick={() => void copy(linkUrl, 'link')}>{copied === 'link' ? 'Copied' : 'Copy link'}</button>
                  </div>
                )}
                {state.link && (
                  <button className="sh-small" disabled={busy} onClick={() => void act({ action: 'reset-link' })}>
                    Reset link — the old one stops working
                  </button>
                )}

                <div className="sh-code">
                  <label className="sh-switch">
                    <input
                      type="checkbox"
                      checked={!!state.code}
                      disabled={busy || (!state.code && !state.mayHost)}
                      onChange={(e) => void act({ action: 'code', role: e.target.checked ? 'viewer' : null })}
                    />
                    <span>Invite code</span>
                  </label>
                  {state.code && (
                    <div className="sh-code-row">
                      <button className="sh-codebox" onClick={() => void copy(showCode(state.code!.code), 'code')} aria-label="Copy the invite code">
                        {showCode(state.code.code)}
                        <i>{copied === 'code' ? 'copied' : 'copy'}</i>
                      </button>
                      <select className="sh-role" aria-label="What people with the code can do" value={state.code.role} disabled={busy}
                        onChange={(e) => void act({ action: 'code', role: e.target.value })}>
                        {GRANTS.map((g) => <option key={g} value={g}>{ROLE_WORD[g]}</option>)}
                      </select>
                      <button className="sh-small" disabled={busy} onClick={() => void act({ action: 'code', role: state.code!.role, fresh: true })}>New code</button>
                    </div>
                  )}
                  <span className="sh-sub">Readable aloud — for a room, a call, a class. Joined with “Join with a code” in the sidebar.</span>
                </div>
              </div>
            )}

            <p className="sh-privacy">
              {type === 'project'
                ? 'Shared: this Project’s conversations, maps, models and goals. Never your memory, your other conversations or your email.'
                : 'Shared: this conversation and its map. Never your memory, your other conversations or your email.'}
            </p>

            <footer className="sh-foot">
              {owner && (state.members.length > 0 || state.link || state.code) && (
                <button className="sh-stop" disabled={busy} onClick={() => void act({ action: 'stop' })}>Stop sharing</button>
              )}
              <button className="sh-btn" onClick={onClose}>Done</button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

/** "Join with a code" — eight characters, then straight in. */
export function JoinWithCode({ onDone, autoFocus = false }: { onDone?: () => void; autoFocus?: boolean }) {
  const [code, setCode] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function join(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch('/api/share/accept', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That code did not open anything.');
      onDone?.();
      window.location.assign(j.open);
    } catch (er) {
      setErr(er instanceof Error ? er.message : 'That code did not open anything.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="sh-join" onSubmit={join}>
      <input
        value={code}
        onChange={(e) => setCode(e.target.value.toUpperCase())}
        placeholder="ABCD-EFGH"
        aria-label="Invite code"
        autoFocus={autoFocus}
        maxLength={9}
        autoCapitalize="characters"
        spellCheck={false}
      />
      <button type="submit" disabled={busy || code.replace(/[^A-Z0-9]/gi, '').length !== 8}>Join</button>
      {err && <span className="sh-join-err" role="alert">{err}</span>}
    </form>
  );
}

/**
 * The code, asked for in a popup — opened from the rail's "Join with a code"
 * button rather than sitting in the rail as a field. Escape, the backdrop or ×
 * closes it; a code that opens something goes straight there.
 */
export function JoinCodeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sh-scrim" role="dialog" aria-modal="true" aria-label="Join with a code">
      <div className="sh-back" onClick={onClose} aria-hidden="true" />
      <div className="sh-sheet sh-joinsheet">
        <header className="sh-head">
          <span className="sh-kicker">Shared with you</span>
          <h2>Join with a code</h2>
          <button className="sh-x" onClick={onClose} aria-label="Close">×</button>
        </header>
        <p className="sh-quiet">The eight-character code someone gave you, for a Project, a conversation or a room.</p>
        <JoinWithCode onDone={onClose} autoFocus />
      </div>
    </div>
  );
}
