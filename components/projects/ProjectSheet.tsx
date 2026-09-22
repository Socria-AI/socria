'use client';
// components/projects/ProjectSheet.tsx
//
// One Project's settings, opened from its folder in the chat rail.
//
// A Project is a folder people work in, not a place they go to — so there is
// no Projects page. The folder sits in the rail with its chats; this sheet is
// where the rest of it lives: its name, how Socria should handle it, its
// goals and files, and archiving or deleting it.
//
// What it does not show is the graph. A Project is a region of the person's
// one Mind Graph (lib/mind/projects.ts); the machinery of that belongs on the
// Memory page, and here there is one line about it and a link.

import { useCallback, useEffect, useState } from 'react';
import './project-sheet.css';

interface Detail {
  project: { id: string; name: string; description: string; instructions: string; archived: boolean };
  goals: { id: string; label: string; status: string }[];
  files: { id: string; name: string; bytes: number; createdAt: number }[];
  conversations: { id: string }[];
  connected: number;
}

const when = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '';

export function ProjectSheet({
  id,
  onClose,
  onChanged,
  onDeleted,
}: {
  id: string;
  onClose: () => void;
  /** something the rail shows changed — the name, archived, the chats in it */
  onChanged: () => void;
  onDeleted: () => void;
}) {
  const [d, setD] = useState<Detail | null>(null);
  const [name, setName] = useState('');
  const [instructions, setInstructions] = useState('');
  const [goal, setGoal] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dropFiles, setDropFiles] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const j: Detail = await res.json();
      setD(j);
      setName(j.project.name);
      setInstructions(j.project.instructions);
    } catch {
      setErr('This Project could not be read just now.');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  // Escape closes, like every other sheet in the app.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function call(url: string, init: RequestInit, done?: string, rail = false): Promise<boolean> {
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That did not save.');
      await load();
      if (rail) onChanged();
      if (done) setNote(done);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not save.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>, done: string, rail = false) =>
    call(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(body) }, done, rail);

  const upload = async (f: File) => {
    setBusy(true); setErr(null); setNote(null);
    try {
      const text = await f.text();
      const res = await fetch('/api/mind/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: f.name, text, projectId: id }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That file could not be read.');
      await load();
      onChanged();
      setNote(`Read ${j.chunks} passages: ${j.created} new, ${j.reinforced} already known.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const destroy = async () => {
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: dropFiles ? 'delete' : 'keep' }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That Project could not be deleted.');
      onDeleted();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That Project could not be deleted.');
      setBusy(false);
    }
  };

  const live = (d?.goals ?? []).filter((g) => g.status === 'active' || g.status === 'tentative' || g.status === 'uncertain');
  const chats = d?.conversations.length ?? 0;

  return (
    <div className="psheet" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="psheet-card" role="dialog" aria-modal="true" aria-label={d ? `Project: ${d.project.name}` : 'Project'}>
        <div className="psheet-h">
          <span className="lbl">Project{d?.project.archived ? ' · archived' : ''}</span>
          <button type="button" className="x" onClick={onClose} aria-label="Close">×</button>
        </div>

        {!d ? (
          err ? <p className="err" role="alert">{err}</p> : <p className="quiet" aria-live="polite">Opening…</p>
        ) : (
          <div className="psheet-body">
            <div className="field">
              <input
                className="name"
                value={name}
                maxLength={80}
                aria-label="Project name"
                onChange={(e) => setName(e.target.value)}
                onBlur={() => { if (name.trim() && name.trim() !== d.project.name) void patch({ name }, 'Renamed.', true); }}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              />
            </div>

            <div className="field">
              <label htmlFor="ps-instr">How Socria should handle this Project</label>
              <textarea
                id="ps-instr"
                value={instructions}
                maxLength={2000}
                placeholder="Optional — e.g. “Assume I know the basics; push me on proofs.”"
                onChange={(e) => setInstructions(e.target.value)}
              />
              {instructions !== d.project.instructions && (
                <div className="row-acts">
                  <button type="button" className="pill go" disabled={busy} onClick={() => void patch({ instructions }, 'Saved.')}>Save</button>
                  <button type="button" className="pill" onClick={() => setInstructions(d.project.instructions)}>Cancel</button>
                </div>
              )}
            </div>

            <div className="field">
              <label>Goals</label>
              {live.map((g) => (
                <div className="line" key={g.id}>
                  <span className="grow">{g.label}</span>
                  <button
                    type="button"
                    className="lnk"
                    disabled={busy}
                    // Done is a STATUS, not a deletion: it stays in memory as
                    // something they once aimed at.
                    onClick={() => void call('/api/mind/node', { method: 'PATCH', body: JSON.stringify({ id: g.id, status: 'historical' }) }, 'Marked done.')}
                  >
                    done
                  </button>
                </div>
              ))}
              <form
                className="add"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!goal.trim()) return;
                  if (await call(`/api/projects/${encodeURIComponent(id)}/goals`, { method: 'POST', body: JSON.stringify({ text: goal }) })) setGoal('');
                }}
              >
                <input value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={400} placeholder="Add a goal" aria-label="Add a goal" />
                <button type="submit" className="pill" disabled={busy || !goal.trim()}>Add</button>
              </form>
            </div>

            <div className="field">
              <label>Files</label>
              {d.files.map((f) => (
                <div className="line" key={f.id}>
                  <span className="grow">{f.name}</span>
                  <span className="meta">{Math.max(1, Math.round(f.bytes / 1024))} KB · {when(f.createdAt)}</span>
                  <button
                    type="button"
                    className="lnk"
                    disabled={busy}
                    onClick={() => void call('/api/mind/upload', { method: 'DELETE', body: JSON.stringify({ id: f.id }) }, 'Removed. What was learned from it stays in Memory.', true)}
                  >
                    remove
                  </button>
                </div>
              ))}
              <label className="pill upload">
                {busy ? 'Working…' : 'Add a .txt file'}
                <input
                  type="file"
                  accept=".txt,text/plain"
                  disabled={busy}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = '';
                    if (f) void upload(f);
                  }}
                />
              </label>
            </div>

            <p className="quiet">
              {d.connected === 1 ? '1 thing Socria remembers is' : `${d.connected} things Socria remembers are`} connected
              to this Project — part of your one memory, not a copy of it. <a href="/memory">See them in Memory</a>.
            </p>

            {note && <p className="note" role="status">{note}</p>}
            {err && <p className="err" role="alert">{err}</p>}

            <div className="foot">
              <button
                type="button"
                className="pill"
                disabled={busy}
                onClick={() => void patch({ archived: !d.project.archived }, d.project.archived ? 'Restored.' : 'Archived.', true)}
              >
                {d.project.archived ? 'Restore' : 'Archive'}
              </button>
              {!deleting && (
                <button type="button" className="pill danger" disabled={busy} onClick={() => setDeleting(true)}>Delete…</button>
              )}
            </div>
            {deleting && (
              <div className="confirm" role="alertdialog" aria-label={`Delete ${d.project.name}`}>
                <p>
                  <strong>Delete “{d.project.name}”?</strong>{' '}
                  {chats ? `Its ${chats} chat${chats === 1 ? '' : 's'} move back to your ordinary list — none are deleted. ` : ''}
                  What Socria learned in it <em>stays</em> in your memory, still connected to everything else. To forget
                  something, remove it from Memory.
                </p>
                {d.files.length > 0 && (
                  <label className="check">
                    <input type="checkbox" checked={dropFiles} onChange={(e) => setDropFiles(e.target.checked)} />
                    <span>Also delete its {d.files.length} file{d.files.length === 1 ? '' : 's'}.</span>
                  </label>
                )}
                <div className="row-acts">
                  <button type="button" className="pill danger" disabled={busy} onClick={() => void destroy()}>Delete the Project</button>
                  <button type="button" className="pill" onClick={() => { setDeleting(false); setDropFiles(false); }}>Keep it</button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
