'use client';
// components/projects/ProjectView.tsx
//
// One Project: its conversations, its files, its goals, and how its
// conversations should be handled.
//
// What it deliberately does NOT show is the graph. A Project is a region of
// the person's one Mind Graph, and the machinery of that — anchors, edges,
// activation — belongs on the Memory page, where it can be inspected and
// corrected. Here there is one line about it: how much memory is connected,
// and a link to go and look. Everything else is the workspace.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Label } from '@/components/journal/ds';
import './projects.css';

interface Project {
  id: string;
  name: string;
  description: string;
  instructions: string;
  archived: boolean;
  createdAt: number;
  updatedAt: number;
}
interface Goal { id: string; label: string; content: string; status: string }
interface Convo { id: string; title: string; updatedAt: number }
interface File { id: string; name: string; bytes: number; createdAt: number }

const when = (ms: number) =>
  ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

export function ProjectView({ id }: { id: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [p, setP] = useState<Project | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [convos, setConvos] = useState<Convo[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [connected, setConnected] = useState(0);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(
    search.get('adopted') ? 'Socria already knew about this — what it had learned is connected here.' : null
  );
  const [err, setErr] = useState<string | null>(null);

  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ name: '', description: '', instructions: '' });
  const [goal, setGoal] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [dropFiles, setDropFiles] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, { cache: 'no-store' });
      if (res.status === 404) { setMissing(true); return; }
      if (!res.ok) throw new Error('failed');
      const j = await res.json();
      setP(j.project);
      setGoals(j.goals ?? []);
      setConvos(j.conversations ?? []);
      setFiles(j.files ?? []);
      setConnected(j.connected ?? 0);
    } catch {
      setErr('This Project could not be read just now.');
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function call(url: string, init: RequestInit, done?: string): Promise<boolean> {
    setBusy(true); setErr(null); setNote(null);
    try {
      const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That did not save.');
      await load();
      if (done) setNote(done);
      return true;
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That did not save.');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const saveEdit = async () => {
    const ok = await call(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(draft) }, 'Saved.');
    if (ok) setEditing(false);
  };

  const addGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;
    const ok = await call(`/api/projects/${encodeURIComponent(id)}/goals`, { method: 'POST', body: JSON.stringify({ text: goal }) });
    if (ok) setGoal('');
  };

  // Done is a STATUS, not a deletion: the goal stays in memory as something
  // they once aimed at, which is often exactly what is worth knowing later.
  const doneGoal = (gid: string) =>
    call('/api/mind/node', { method: 'PATCH', body: JSON.stringify({ id: gid, status: 'historical' }) }, 'Marked done. It stays in Memory as a past goal.');

  const upload = async (f: globalThis.File) => {
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
      setNote(`Read ${j.chunks} passages: ${j.created} new, ${j.reinforced} already known.`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That file could not be read.');
    } finally {
      setBusy(false);
    }
  };

  const removeFile = (fid: string) =>
    call('/api/mind/upload', { method: 'DELETE', body: JSON.stringify({ id: fid }) },
      'The file is gone. What Socria learned from it stays in Memory.');

  const archive = (archived: boolean) =>
    call(`/api/projects/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ archived }) },
      archived ? 'Archived. Its memories are still there; they just stop being brought forward.' : 'Restored.');

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
      router.push('/projects');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That Project could not be deleted.');
      setBusy(false);
    }
  };

  if (missing) {
    return (
      <div className="prj-root"><div className="prj-wrap">
        <Link className="back" href="/projects">← Projects</Link>
        <h1>No such Project.</h1>
        <p className="deck">It may have been deleted. Its conversations, if it had any, are in your ordinary list.</p>
      </div></div>
    );
  }
  if (!p) {
    return (
      <div className="prj-root"><div className="prj-wrap">
        <Link className="back" href="/projects">← Projects</Link>
        {err ? <p className="err" role="alert">{err}</p> : <p className="quiet" aria-live="polite">Opening the Project…</p>}
      </div></div>
    );
  }

  const live = goals.filter((g) => g.status === 'active' || g.status === 'tentative' || g.status === 'uncertain');

  return (
    <div className="prj-root">
      <div className="prj-wrap">
        <div className="prj-top">
          <div>
            <Label tone="moss">Project{p.archived ? ' · archived' : ''}</Label>
            <h1>{p.name}</h1>
          </div>
          <Link className="back" href="/projects">← Projects</Link>
        </div>
        {p.description && !editing && <p className="deck">{p.description}</p>}

        <div className="acts">
          <Link className="pill go" href={`/chat?project=${encodeURIComponent(p.id)}`}>New conversation</Link>
          <label className="pill">
            {busy ? 'Working…' : 'Add a .txt file'}
            <input
              type="file"
              accept=".txt,text/plain"
              style={{ display: 'none' }}
              disabled={busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f) void upload(f);
              }}
            />
          </label>
          {!editing && (
            <button
              type="button"
              className="pill"
              onClick={() => { setDraft({ name: p.name, description: p.description, instructions: p.instructions }); setEditing(true); }}
            >
              Edit
            </button>
          )}
        </div>
        {note && <p className="note" role="status">{note}</p>}
        {err && <p className="err" role="alert">{err}</p>}

        {editing && (
          <div className="editing">
            <input type="text" value={draft.name} maxLength={80} aria-label="Project name"
              onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            <input type="text" value={draft.description} maxLength={600} aria-label="What it is for"
              placeholder="What is it for?"
              onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
            <textarea value={draft.instructions} maxLength={2000} aria-label="How Socria should handle this Project"
              placeholder="How should Socria handle conversations in this Project? (optional) — e.g. “Assume I know the basics; push me on proofs.”"
              onChange={(e) => setDraft({ ...draft, instructions: e.target.value })} />
            <div className="acts">
              <button type="button" className="pill go" disabled={busy || !draft.name.trim()} onClick={saveEdit}>Save</button>
              <button type="button" className="pill" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        )}
        {!editing && p.instructions && (
          <p className="quiet"><strong>For this Project:</strong> {p.instructions}</p>
        )}

        <section className="sec">
          <div className="sec-h"><h2>Goals</h2></div>
          {live.map((g) => (
            <div className="row" key={g.id}>
              <span className="grow">{g.label}</span>
              {g.status !== 'active' && <span className="meta">{g.status}</span>}
              <button type="button" className="x" disabled={busy} onClick={() => void doneGoal(g.id)}>done</button>
            </div>
          ))}
          {!live.length && <p className="quiet">No goals yet. Conversations here will pick them up too.</p>}
          <form className="add" onSubmit={addGoal}>
            <input type="text" value={goal} onChange={(e) => setGoal(e.target.value)} maxLength={400}
              placeholder="Add a goal" aria-label="Add a goal" />
            <button type="submit" className="pill" disabled={busy || !goal.trim()}>Add</button>
          </form>
        </section>

        <section className="sec">
          <div className="sec-h"><h2>Conversations</h2></div>
          {convos.map((c) => (
            <div className="row" key={c.id}>
              <Link className="grow" href={`/chat?open=${encodeURIComponent(c.id)}`}>{c.title}</Link>
              <span className="meta">{when(c.updatedAt)}</span>
            </div>
          ))}
          {!convos.length && (
            <p className="quiet">None yet. A conversation started here keeps this Project in view — and can still draw on anything else Socria knows when it is relevant.</p>
          )}
        </section>

        <section className="sec">
          <div className="sec-h"><h2>Files</h2></div>
          {files.map((f) => (
            <div className="row" key={f.id}>
              <span className="grow">{f.name}</span>
              <span className="meta">{Math.max(1, Math.round(f.bytes / 1024))} KB · {when(f.createdAt)}</span>
              <button type="button" className="x" disabled={busy} onClick={() => void removeFile(f.id)}>remove</button>
            </div>
          ))}
          {!files.length && <p className="quiet">No files. Text files added here are read into your memory and tied to this Project.</p>}
        </section>

        <section className="sec">
          <div className="sec-h">
            <h2>Memory</h2>
            <p>
              {connected === 1 ? '1 thing Socria remembers is' : `${connected} things Socria remembers are`} connected to
              this Project. They are part of your one memory, not a copy of it.
            </p>
          </div>
          <div className="acts"><Link className="pill" href="/memory">See them in Memory</Link></div>
        </section>

        <section className="sec">
          <div className="sec-h"><h2>{p.archived ? 'Archived' : 'Archive or delete'}</h2></div>
          <div className="acts">
            <button type="button" className="pill" disabled={busy} onClick={() => void archive(!p.archived)}>
              {p.archived ? 'Restore' : 'Archive'}
            </button>
            {!deleting && (
              <button type="button" className="pill danger" disabled={busy} onClick={() => setDeleting(true)}>Delete…</button>
            )}
          </div>
          {deleting && (
            <div className="confirm" role="alertdialog" aria-label={`Delete ${p.name}`}>
              <h3>Delete “{p.name}”?</h3>
              <p>
                The Project goes. {convos.length ? `Its ${convos.length} conversation${convos.length === 1 ? '' : 's'} move to your ordinary list — none are deleted.` : ''}{' '}
                The {connected} {connected === 1 ? 'memory' : 'memories'} connected to it <em>stay</em> in your memory, and
                anything they connect to elsewhere stays connected. To forget a memory, remove it from Memory.
              </p>
              {files.length > 0 && (
                <label>
                  <input type="checkbox" checked={dropFiles} onChange={(e) => setDropFiles(e.target.checked)} />
                  <span>Also delete its {files.length} file{files.length === 1 ? '' : 's'}. What was learned from them still stays.</span>
                </label>
              )}
              <div className="acts">
                <button type="button" className="pill danger" disabled={busy} onClick={() => void destroy()}>Delete the Project</button>
                <button type="button" className="pill" onClick={() => { setDeleting(false); setDropFiles(false); }}>Keep it</button>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
