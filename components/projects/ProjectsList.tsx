'use client';
// components/projects/ProjectsList.tsx
//
// The Projects area: every Project, and a way to make one.
//
// Kept deliberately plain. A Project is a place to work, and the page that
// lists them is a list — not a dashboard of counts and charts about the
// graph. The graph is on the Memory page for anyone who wants to look at it.

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Label } from '@/components/journal/ds';
import './projects.css';

interface Row {
  id: string;
  name: string;
  description: string;
  archived: boolean;
  updatedAt: number;
  conversations: number;
  files: number;
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function ProjectsList() {
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fault, setFault] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      if (!res.ok) throw new Error('failed');
      const j = await res.json();
      setFault(j.storage?.ok === false);
      setRows(j.projects ?? []);
    } catch {
      setErr('Your Projects could not be read just now.');
      setRows([]);
    }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, description }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That Project could not be created.');
      router.push(`/projects/${encodeURIComponent(j.project.id)}${j.adopted ? '?adopted=1' : ''}`);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'That Project could not be created.');
      setBusy(false);
    }
  }

  const live = (rows ?? []).filter((r) => !r.archived);
  const archived = (rows ?? []).filter((r) => r.archived);

  const card = (r: Row) => (
    <Link key={r.id} href={`/projects/${encodeURIComponent(r.id)}`} className={`card${r.archived ? ' archived' : ''}`}>
      <span className="nm">{r.name}</span>
      <span className="ct">
        {plural(r.conversations, 'conversation', 'conversations')} · {plural(r.files, 'file', 'files')}
      </span>
      {r.description && <span className="ds">{r.description}</span>}
    </Link>
  );

  return (
    <div className="prj-root">
      <div className="prj-wrap">
        <div className="prj-top">
          <div>
            <Label tone="moss">Core 4 · Projects</Label>
            <h1>Projects.</h1>
          </div>
          <Link className="back" href="/chat">← Back to the app</Link>
        </div>
        <p className="deck">
          A place to keep ongoing work together — its conversations, files and goals. Inside a Project, Socria
          looks there first. It is still <em>one memory</em>: what you learn in one Project can help in another
          when it is genuinely relevant.
        </p>

        {fault ? (
          <div className="fault">
            <p className="quiet">
              Projects are not set up on this deployment yet — the table they live in does not exist. Nothing is
              lost. Re-running <code>supabase/schema.sql</code> adds it; <code>npm run doctor:mind</code> says
              exactly what is missing.
            </p>
          </div>
        ) : (
          <>
            <form className="new" onSubmit={create}>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Name a new Project — Calculus, Research, Transfer application…"
                aria-label="Project name"
                maxLength={80}
              />
              <button type="submit" className="pill go" disabled={busy || !name.trim()}>
                {busy ? 'Creating…' : 'Create'}
              </button>
              {name.trim() && (
                <input
                  className="desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What is it for? (optional)"
                  aria-label="Project description"
                  maxLength={600}
                />
              )}
            </form>
            {err && <p className="err" role="alert">{err}</p>}

            {rows === null ? (
              <p className="quiet" aria-live="polite">Reading your Projects…</p>
            ) : !live.length && !archived.length ? (
              <p className="quiet">
                No Projects yet. Make one for anything you keep coming back to — a course, a piece of research,
                an application — and start its conversations from inside it.
              </p>
            ) : (
              <>
                <div className="list">{live.map(card)}</div>
                {!live.length && <p className="quiet">Everything is archived.</p>}
                {archived.length > 0 && (
                  <details className="shelf">
                    <summary>Archived · {archived.length}</summary>
                    <div className="list">{archived.map(card)}</div>
                  </details>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
