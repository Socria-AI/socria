'use client';

// components/ux/UXStudio.tsx — SocriaUX at /ux: the projects, and the one open.
//
// The home screen starts a project the way the workflow does: a name, the
// problem, the people — then a first screen, from a template, a blank frame or
// a screenshot of a design that already exists. Projects are kept in this
// browser (lib/ux/storage.ts); a signed-in designer's also follow them to
// other devices through /api/ux/projects, and the newer copy wins.
//
// The open project is in the address (?p=<id>), so a reload, the back button
// and a bookmark all land where the designer was.

import { useCallback, useEffect, useRef, useState } from 'react';
import { makeProject, normalizeProject, type ProjectSummary, type UXProject } from '@/lib/ux/model';
import { deleteProject, loadProject, newer, readIndex, saveProject } from '@/lib/ux/storage';
import { TEMPLATES, artboardFromTemplate, exampleProject, type TemplateId } from '@/lib/ux/templates';
import { UXWorkspace } from './UXWorkspace';
import { boardSizeFor, readScreenshot } from './image';
import './ux.css';

type Start = TemplateId | 'upload';

const ago = (t: number) => {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const idFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('p');
  return v && /^[A-Za-z0-9_-]{1,64}$/.test(v) ? v : null;
};

export function UXStudio({ signedIn }: { signedIn: boolean }) {
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [cloud, setCloud] = useState<{ id: string; name: string; updatedAt: number }[]>([]);
  const [open, setOpen] = useState<UXProject | null>(null);
  const [ready, setReady] = useState(false);
  const [name, setName] = useState('');
  const [problem, setProblem] = useState('');
  const [users, setUsers] = useState('');
  const [start, setStart] = useState<Start>('blank-mobile');
  const [err, setErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const shotRef = useRef<HTMLInputElement>(null);
  const importRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => setList(readIndex()), []);

  const openProject = useCallback(async (id: string, push = true) => {
    let p = loadProject(id);
    if (signedIn) {
      try {
        const r = await fetch(`/api/ux/projects?id=${encodeURIComponent(id)}`);
        if (r.ok) {
          const j = await r.json();
          const remote = normalizeProject(j.project);
          p = newer(p, remote);
          if (p && p === remote) saveProject(p);
        }
      } catch {
        /* offline: the browser copy */
      }
    }
    if (!p) {
      setErr('That project is not in this browser.');
      return;
    }
    setOpen(p);
    if (push) window.history.pushState(null, '', `/ux?p=${encodeURIComponent(id)}`);
  }, [signedIn]);

  // first load: the list, and the project in the address
  useEffect(() => {
    refresh();
    const id = idFromUrl();
    if (id) openProject(id, false).finally(() => setReady(true));
    else setReady(true);
    const onPop = () => {
      const pid = idFromUrl();
      if (pid) openProject(pid, false);
      else {
        setOpen(null);
        refresh();
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // the synced list, for projects started on another device
  useEffect(() => {
    if (!signedIn) return;
    fetch('/api/ux/projects')
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => setCloud(Array.isArray(j?.projects) ? j.projects : []))
      .catch(() => {});
  }, [signedIn, open]);

  const begin = (p: UXProject) => {
    const r = saveProject(p);
    if (!r.ok) {
      setErr(r.reason === 'quota' ? 'This browser’s storage is full. Delete a project with screenshots, or use a smaller image.' : 'This browser will not store projects (private mode?).');
      return;
    }
    setOpen(p);
    window.history.pushState(null, '', `/ux?p=${encodeURIComponent(p.id)}`);
  };

  const create = async () => {
    setErr(null);
    setCreating(true);
    try {
      const base = makeProject(name || 'Untitled project', {
        brief: { problem: problem.trim(), users: users.trim(), goals: '', constraints: '', success: '' },
        stage: problem.trim() ? 'design' : 'frame',
      });
      if (start === 'upload') {
        const file = shotRef.current?.files?.[0];
        if (!file) {
          setErr('Choose a screenshot first.');
          return;
        }
        const shot = await readScreenshot(file);
        const { w, h } = boardSizeFor(shot);
        const ab = artboardFromTemplate(w > 480 ? 'blank-desktop' : 'blank-mobile', { name: file.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 60) || 'Screenshot', w, h, image: shot });
        begin({ ...base, artboards: [ab], stage: 'explore' });
      } else {
        begin({ ...base, artboards: [artboardFromTemplate(start)] });
      }
      setName('');
      setProblem('');
      setUsers('');
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'The project could not be created.');
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id: string, label: string) => {
    if (!window.confirm(`Delete “${label}”? This removes it from this browser${signedIn ? ' and from your synced projects' : ''}.`)) return;
    deleteProject(id);
    if (signedIn) {
      await fetch(`/api/ux/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => {});
      setCloud((c) => c.filter((x) => x.id !== id));
    }
    refresh();
  };

  const exportJson = (id: string) => {
    const p = loadProject(id);
    if (!p) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(p, null, 2)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.name.replace(/[^\w-]+/g, '-').toLowerCase()}.socriaux.json`;
    a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importJson = async (file: File) => {
    try {
      const p = normalizeProject(JSON.parse(await file.text()));
      if (!p) throw new Error();
      // an import is a copy: a new id, so it never overwrites the original
      begin({ ...p, id: makeProject('x').id, name: `${p.name} (imported)`, updatedAt: Date.now() });
    } catch {
      setErr('That file is not a SocriaUX project.');
    }
  };

  if (open) {
    return (
      <UXWorkspace
        key={open.id}
        initial={open}
        signedIn={signedIn}
        onExit={() => {
          setOpen(null);
          refresh();
          window.history.pushState(null, '', '/ux');
        }}
      />
    );
  }

  const localIds = new Set(list.map((p) => p.id));
  const remoteOnly = cloud.filter((c) => !localIds.has(c.id));

  return (
    <div className="uxs lg-tokens">
      <header className="uxs-head">
        <a href="/" className="uxh-home" aria-label="Socria">
          <img src="/socria-mark.png" alt="" width={24} height={24} />
          <span className="uxh-brand">
            Socria<em>UX</em>
          </span>
        </a>
        <span className="uxs-tag">Human-first design reasoning</span>
        <span className="uxs-head-right">
          {signedIn ? (
            <a href="/account" className="uxs-link">
              Account
            </a>
          ) : (
            <a href="/sign-in?redirect_url=/ux" className="uxs-link">
              Sign in
            </a>
          )}
        </span>
      </header>

      <main className="uxs-main">
        <section className="uxs-hero">
          <span className="uxr-eyebrow">SocriaUX · a design environment</span>
          <h1>
            Why is it designed <em>that</em> way?
          </h1>
          <p>
            A workspace where the design stays at the centre and a reasoning system works beside it — questioning your assumptions, teaching the principle behind a problem, critiquing the screen, connecting research to decisions, and helping you build it. It does not design for you. It helps you become the designer who can say why.
          </p>
        </section>

        <div className="uxs-grid">
          <section className="uxs-new" aria-labelledby="uxs-new-title">
            <h2 id="uxs-new-title">Start a project</h2>
            <label className="uxr-field">
              <span>Name</span>
              <input className="uxr-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Clinic sign-up" />
            </label>
            <label className="uxr-field">
              <span>What problem are you solving?</span>
              <textarea className="uxr-input" rows={2} value={problem} onChange={(e) => setProblem(e.target.value)} placeholder="New patients abandon sign-up before they book." />
            </label>
            <label className="uxr-field">
              <span>Who is it for?</span>
              <textarea className="uxr-input" rows={2} value={users} onChange={(e) => setUsers(e.target.value)} placeholder="Patients over 60, often on a phone, sometimes helped by family." />
            </label>
            <fieldset className="uxs-starts">
              <legend>First screen</legend>
              {TEMPLATES.map((t) => (
                <label key={t.id} className={`uxs-start${start === t.id ? ' is-on' : ''}`}>
                  <input type="radio" name="start" value={t.id} checked={start === t.id} onChange={() => setStart(t.id)} />
                  <span className="uxs-start-name">{t.name}</span>
                  <span className="uxs-start-meta">
                    {t.size} · {t.note}
                  </span>
                </label>
              ))}
              <label className={`uxs-start${start === 'upload' ? ' is-on' : ''}`}>
                <input type="radio" name="start" value="upload" checked={start === 'upload'} onChange={() => setStart('upload')} />
                <span className="uxs-start-name">A screenshot of an existing design</span>
                <span className="uxs-start-meta">PNG or JPG — critique and annotate what you already have.</span>
              </label>
              {start === 'upload' && <input ref={shotRef} className="uxs-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif" aria-label="Screenshot" />}
            </fieldset>
            {err && (
              <p className="uxp-error" role="alert">
                {err}
              </p>
            )}
            <button type="button" className="uxr-btn wide lg" onClick={create} disabled={creating}>
              {creating ? 'Creating…' : 'Create project →'}
            </button>
            <p className="uxp-hint">You can leave the problem blank and frame it inside the project — SocriaUX will start there with you.</p>
          </section>

          <section className="uxs-list" aria-labelledby="uxs-list-title">
            <div className="uxs-list-head">
              <h2 id="uxs-list-title">Your projects</h2>
              <button type="button" className="uxr-btn ghost sm" onClick={() => importRef.current?.click()}>
                Import
              </button>
            </div>
            <button type="button" className="uxs-example" onClick={() => begin(exampleProject())}>
              <span className="uxr-eyebrow">Worked example</span>
              <span className="uxs-example-title">Clinic sign-up</span>
              <span className="uxs-example-note">A first-draft mobile sign-up with research notes, a reasoning map and a decision that the evidence contradicts. Open it to see every part of the workspace in use.</span>
            </button>
            {!ready ? null : list.length === 0 && remoteOnly.length === 0 ? (
              <p className="uxp-hint">No projects yet. They are kept in this browser{signedIn ? ' and synced to your account' : '; sign in to keep them across devices'}.</p>
            ) : (
              <ul className="uxs-projects">
                {list.map((p) => (
                  <li key={p.id} className="uxs-project">
                    <button type="button" className="uxs-project-open" onClick={() => openProject(p.id)}>
                      <span className="uxs-project-name">{p.name}</span>
                      {p.problem && <span className="uxs-project-problem">{p.problem}</span>}
                      <span className="uxs-project-meta">
                        {p.artboards} screen{p.artboards === 1 ? '' : 's'} · edited {ago(p.updatedAt)}
                      </span>
                    </button>
                    <span className="uxs-project-actions">
                      <button type="button" className="uxr-btn ghost sm" onClick={() => exportJson(p.id)}>
                        Export
                      </button>
                      <button type="button" className="uxr-btn ghost sm danger" onClick={() => remove(p.id, p.name)}>
                        Delete
                      </button>
                    </span>
                  </li>
                ))}
                {remoteOnly.map((p) => (
                  <li key={p.id} className="uxs-project">
                    <button type="button" className="uxs-project-open" onClick={() => openProject(p.id)}>
                      <span className="uxs-project-name">{p.name}</span>
                      <span className="uxs-project-meta">From another device · edited {ago(p.updatedAt)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <section className="uxs-how" aria-label="How SocriaUX helps">
          {[
            ['Guided discovery', 'The default. Questions that expose an untested assumption, with the explanation you need to answer them — never a question for its own sake.'],
            ['Instructional', 'The principle, why it holds, and a worked example from your own screen. A method you can run yourself.'],
            ['Direct assistance', 'Explicit recommendations, concrete values and implementation code, with the trade-off each one accepts. The decision stays yours.'],
          ].map(([t, d]) => (
            <div key={t} className="uxs-how-item">
              <span className="uxs-how-title">{t}</span>
              <span>{d}</span>
            </div>
          ))}
        </section>
      </main>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) importJson(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
