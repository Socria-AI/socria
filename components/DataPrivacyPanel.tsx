'use client';

// Settings → Data & Privacy.
//
// Four irreversible-ish actions and one explanation, in the order someone
// actually needs them: understand what is held, take a copy, remove the part
// they did not expect, then remove everything.
//
// The explanation comes FIRST and is not collapsed behind a link, because the
// memory Socria keeps is the thing people are most surprised by; a delete
// button for something you did not know existed is not really a choice.

import { useEffect, useState } from 'react';

type Busy = null | 'export' | 'memory' | 'account';

export function DataPrivacyPanel() {
  const [busy, setBusy] = useState<Busy>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [typed, setTyped] = useState('');
  // The occasional note by email: a map still where it was left, a
  // membership opening. One switch, backed by the same row the unsubscribe
  // link writes, so the two never disagree. null until the answer arrives;
  // shown as off when the store cannot say.
  const [notes, setNotes] = useState<boolean | null>(null);
  const [notesBusy, setNotesBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/email/preferences', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (!cancelled) setNotes(json?.lifecycle === true);
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function setNotesOn(on: boolean) {
    setNotesBusy(true); setErr(null);
    try {
      const res = await fetch('/api/email/preferences', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle: on }),
      });
      if (!res.ok) throw new Error('failed');
      setNotes(on);
    } catch {
      setErr('Could not save that just now. Try again in a moment.');
    }
    setNotesBusy(false);
  }

  async function exportData() {
    setBusy('export'); setErr(null); setNote(null);
    try {
      const res = await fetch('/api/account/export');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `socria-export-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setNote('Downloaded.');
    } catch {
      setErr('Could not export just now. Try again, or email hellosocria@gmail.com.');
    }
    setBusy(null);
  }

  async function clearMemory() {
    if (!confirm('Clear what Socria has worked out about your thinking? Your conversations and maps stay.')) return;
    setBusy('memory'); setErr(null); setNote(null);
    try {
      const res = await fetch('/api/account/memory', { method: 'DELETE' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'failed');
      // The browser's own copy of the journey goes too. Left in place it
      // would be pushed back up on the next page load as the newest copy,
      // and the clearing would have lasted exactly one reload.
      try {
        localStorage.removeItem('socria.journey.v1');
      } catch {}
      setNote('Memory cleared. Socria starts fresh from here; your conversations are untouched.');
    } catch {
      setErr('Could not clear memory. Try again.');
    }
    setBusy(null);
  }

  async function deleteAccount() {
    setBusy('account'); setErr(null); setNote(null);
    try {
      const res = await fetch('/api/account/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'DELETE' }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'failed');
      window.location.href = '/';
    } catch (e) {
      setErr(
        e instanceof Error && e.message !== 'failed'
          ? e.message
          : 'Could not delete your account. Email hellosocria@gmail.com and we will do it by hand.'
      );
      setBusy(null);
    }
  }

  return (
    <div className="dp">
      <section className="dp-explain">
        <h2>What Socria remembers</h2>
        <p>
          Two different things, kept separately and deleted separately.
        </p>
        <dl>
          <div>
            <dt>What you wrote</dt>
            <dd>
              Your messages, your Thinking Maps, your drafts. Yours — delete any
              conversation from the sidebar and it goes, along with its map.
            </dd>
          </div>
          <div>
            <dt>What Socria worked out</dt>
            <dd>
              To hold a thread across turns and sessions, Socria keeps notes{' '}
              <em>about</em> your thinking: goals, values, constraints,
              decisions and open uncertainties, plus a short running account
              across conversations of what you seem to be working through. It is
              why it does not ask you the same thing twice — and it is a
              description of how you think, not a log of what you typed.
            </dd>
          </div>
        </dl>
      </section>

      {note && <p className="dp-ok" role="status">{note}</p>}
      {err && <p className="dp-err" role="alert">{err}</p>}

      <section className="dp-act">
        <div>
          <h3>Take a copy</h3>
          <p>Everything we hold, as one JSON file — including the memory above.</p>
        </div>
        <button type="button" onClick={exportData} disabled={busy !== null}>
          {busy === 'export' ? 'Preparing…' : 'Export my data'}
        </button>
      </section>

      <section className="dp-act">
        <div>
          <h3>Notes by email</h3>
          <p>
            The occasional note from Socria about your thinking here — that a
            map is where you left it, or when something opens. Never what you
            wrote, and never more than a few a month.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void setNotesOn(!(notes ?? false))}
          disabled={notesBusy || notes === null}
          aria-pressed={notes === true}
        >
          {notes === null ? '…' : notesBusy ? 'Saving…' : notes ? 'On — turn off' : 'Off — turn on'}
        </button>
      </section>

      <section className="dp-act">
        <div>
          <h3>Clear Socria&rsquo;s memory</h3>
          <p>
            Forget what Socria worked out, and keep everything you wrote. Your
            conversations, maps and drafts stay exactly as they are.
          </p>
        </div>
        <button type="button" onClick={clearMemory} disabled={busy !== null}>
          {busy === 'memory' ? 'Clearing…' : 'Clear memory'}
        </button>
      </section>

      <section className="dp-act dp-danger">
        <div>
          <h3>Delete your account</h3>
          <p>
            Everything: conversations, maps, drafts, memory, connected accounts
            and the account itself. If you have a Socria One subscription it is
            cancelled first, so you are never billed for an account that no
            longer exists. <strong>This cannot be undone.</strong>
          </p>
          {confirmDelete && (
            <div className="dp-confirm">
              <label htmlFor="dp-type">
                Type <code>DELETE</code> to confirm
              </label>
              <input
                id="dp-type"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          )}
        </div>
        {confirmDelete ? (
          <button
            type="button"
            className="dp-go"
            onClick={deleteAccount}
            disabled={typed.trim() !== 'DELETE' || busy !== null}
          >
            {busy === 'account' ? 'Deleting…' : 'Delete everything'}
          </button>
        ) : (
          <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy !== null}>
            Delete account
          </button>
        )}
      </section>

      <p className="dp-foot">
        Questions, or anything that did not work:{' '}
        <a href="mailto:hellosocria@gmail.com">hellosocria@gmail.com</a>. What we
        collect and why is in the <a href="/privacy">privacy policy</a>.
      </p>
    </div>
  );
}
