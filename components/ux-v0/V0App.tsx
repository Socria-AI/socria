'use client';
// components/ux-v0/V0App.tsx — SocriaUX v0 at /ux-v0: two ways in, and the designs kept.
//
// Create: say what you want to make. Critique: bring a design. Everything is
// kept in this browser first (lib/ux-v0/store.ts) and, for a signed-in
// designer, follows them to other devices. The open design is in the address
// (?p=<id>), so a reload or the back button lands where they were.

import { useCallback, useEffect, useRef, useState } from 'react';
import { deleteProject, getProject, listProjects, putProject } from '@/lib/ux-v0/store';
import { makeProject, normalizeProject, type DesignProject, type ProjectSummary } from '@/lib/ux-v0/types';
import { checkFile } from './files';
import { Workspace } from './Workspace';
import '@/components/brand/socria-brand.css';
import './ux-v0.css';

const idFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('p');
  return v && /^[A-Za-z0-9_-]{1,96}$/.test(v) ? v : null;
};

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export function V0App({ signedIn }: { signedIn: boolean }) {
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [remote, setRemote] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [open, setOpen] = useState<{ p: DesignProject; intent?: string; file?: File | null } | null>(null);
  const [intent, setIntent] = useState('');
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  // the design whose deletion is being asked about: the app's own inline confirm, never the browser's dialog
  const [deleting, setDeleting] = useState<string | null>(null);
  const [dropping, setDropping] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => setList(await listProjects()), []);

  const openById = useCallback(
    async (id: string, push = true) => {
      let p = await getProject(id);
      if (signedIn) {
        try {
          const r = await fetch(`/api/ux-v0/projects?id=${encodeURIComponent(id)}`);
          const theirs = r.ok ? normalizeProject((await r.json()).project) : null;
          if (theirs && (!p || theirs.updatedAt > p.updatedAt)) {
            p = theirs;
            await putProject(theirs);
          }
        } catch {
          /* offline: the browser's copy */
        }
      }
      if (!p) return setError('That design is not in this browser.');
      setOpen({ p });
      if (push) window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(id)}`);
    },
    [signedIn]
  );

  useEffect(() => {
    refresh().then(() => setReady(true));
    const id = idFromUrl();
    if (id) openById(id, false);
    const onPop = () => {
      const pid = idFromUrl();
      if (pid) openById(pid, false);
      else {
        setOpen(null);
        refresh();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!signedIn || open) return;
    fetch('/api/ux-v0/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setRemote(Array.isArray(j?.projects) ? j.projects : []))
      .catch(() => undefined);
  }, [signedIn, open]);

  const start = async (mode: 'create' | 'critique', opts: { intent?: string; file?: File | null } = {}) => {
    // a file that cannot be imported is refused here, before it leaves an empty project behind
    if (opts.file) {
      const checked = await checkFile(opts.file);
      if (!checked.ok) return setError(checked.error);
    }
    setError('');
    const p = makeProject(mode, mode === 'critique' && opts.file ? opts.file.name.replace(/\.[a-z0-9]+$/i, '') : '');
    await putProject(p);
    setOpen({ p, ...opts });
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
  };

  const remove = async (s: ProjectSummary) => {
    setDeleting(null);
    const p = await getProject(s.id);
    const artifactId = p?.artifact?.type === 'imported' ? p.artifact.id : undefined;
    await deleteProject(s.id, artifactId);
    if (signedIn) {
      await fetch(`/api/ux-v0/projects?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' }).catch(() => undefined);
      if (artifactId && p?.artifact?.type === 'imported' && p.artifact.kept === 'account') await fetch(`/api/files/original/${artifactId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    refresh();
  };

  if (open) {
    return (
      <Workspace
        key={open.p.id}
        initial={open.p}
        signedIn={signedIn}
        startIntent={open.intent}
        startFile={open.file}
        onExit={() => {
          setOpen(null);
          refresh();
          window.history.pushState(null, '', '/ux-v0');
        }}
      />
    );
  }

  const local = new Set(list.map((x) => x.id));
  const elsewhere = remote.filter((r) => !local.has(r.id));

  return (
    <div className="v0 v0-home-page sb">
      <header className="v0-head">
        <div className="v0-head-l">
          <a className="v0-home" href="/">
            <img src="/socria-mark.png" alt="" width={20} height={20} />
            <span className="v0-brand">
              Socria<em>UX</em>
            </span>
            <span className="v0-tag">v0</span>
          </a>
        </div>
        <div className="v0-head-r">
          {signedIn ? (
            <a className="sb-link is-meta" href="/account">
              Account
            </a>
          ) : (
            <a className="sb-link is-meta is-strong" href="/sign-in?redirect_url=/ux-v0">
              Sign in
            </a>
          )}
        </div>
      </header>
      <main className="v0-landing">
        <section className="v0-way">
          <span className="sb-label">Create</span>
          <h1 className="v0-intent-q">What do you want to make?</h1>
          <p className="v0-body">SocriaUX asks before it designs: a few precise questions, a moodboard of real, licensed imagery, and a brief you approve. Then it generates the design — and you question and change it.</p>
          <div className="sb-compose-line v0-intent-line">
            <textarea
              rows={2}
              value={intent}
              placeholder="A premium coffee shop website, for…"
              aria-label="What do you want to make?"
              onChange={(e) => setIntent(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && intent.trim()) {
                  e.preventDefault();
                  start('create', { intent: intent.trim() });
                }
              }}
            />
            <button type="button" className="sb-btn is-primary" onClick={() => start('create', { intent: intent.trim() })} disabled={!intent.trim()}>
              Begin
            </button>
          </div>
        </section>
        <section
          className={`v0-way v0-way-drop${dropping ? ' is-over' : ''}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDropping(true);
          }}
          onDragLeave={() => setDropping(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDropping(false);
            const f = e.dataTransfer.files?.[0];
            if (f) start('critique', { file: f });
          }}
        >
          <span className="sb-label">Critique</span>
          <h2 className="v0-way-title">Bring a design to look at closely.</h2>
          <p className="v0-body">HTML, PNG, JPG or SVG — choose one, or drop it here. Select an element or drag across an area, say what you see, and reason it through.</p>
          <button type="button" className="sb-link is-go" onClick={() => fileInput.current?.click()}>
            Choose a file <span className="sb-ar">→</span>
          </button>
        </section>
        {error && (
          <p className="v0-error-line" role="alert">
            {error}
          </p>
        )}
        <section className="v0-list" aria-label="Your designs">
          <span className="sb-label">Your designs</span>
          {ready && !list.length && !elsewhere.length && <p className="v0-empty">None yet. They are kept in this browser{signedIn ? ' and with your account' : '; sign in to keep them across devices'}.</p>}
          <ul>
            {list.map((s) =>
              deleting === s.id ? (
                <li key={s.id} className="sb-row v0-list-row">
                  <div
                    className="v0-confirm"
                    role="group"
                    aria-label={`Delete ${s.name}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Escape') (e.stopPropagation(), setDeleting(null));
                    }}
                  >
                    <p>
                      Delete “{s.name}” and its cards? It goes from this browser{signedIn ? ' and from your account' : ''}, and cannot be brought back.
                    </p>
                    <div className="v0-confirm-acts">
                      <button type="button" className="sb-btn is-sm is-danger is-solid" onClick={() => remove(s)}>
                        Delete it
                      </button>
                      <button type="button" className="sb-btn is-sm" autoFocus onClick={() => setDeleting(null)}>
                        Keep it
                      </button>
                    </div>
                  </div>
                </li>
              ) : (
                <li key={s.id} className="sb-row v0-list-row">
                  <button type="button" className="v0-list-open" onClick={() => openById(s.id)}>
                    <span className="v0-cell-title">{s.name}</span>
                    <span className="v0-quiet">
                      {s.mode === 'create' ? 'Create' : 'Critique'} · {s.cards} card{s.cards === 1 ? '' : 's'} · {ago(s.updatedAt)}
                    </span>
                  </button>
                  <button type="button" className="sb-link is-meta" onClick={() => setDeleting(s.id)}>
                    Delete
                  </button>
                </li>
              )
            )}
            {elsewhere.map((s) => (
              <li key={s.id} className="sb-row v0-list-row">
                <button type="button" className="v0-list-open" onClick={() => openById(s.id)}>
                  <span className="v0-cell-title">{s.name}</span>
                  <span className="v0-quiet">From another device · {ago(s.updatedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <input
        ref={fileInput}
        type="file"
        accept=".html,.htm,.png,.jpg,.jpeg,.svg,text/html,image/png,image/jpeg,image/svg+xml"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) start('critique', { file: f });
          e.target.value = '';
        }}
      />
    </div>
  );
}
