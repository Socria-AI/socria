'use client';
// components/ux-v0/V0App.tsx — SocriaUX v0 at /ux-v0: two ways in, and the designs kept.
//
// Create: say what you want to make. Critique: bring a design. The home that
// offers both and shows the collection is ./Home.tsx; this keeps the state
// and the actions (begin, open, delete, the account's copies). Everything is
// kept in this browser first (lib/ux-v0/store.ts) and, for a signed-in
// designer, follows them to other devices. The open design is in the address
// (?p=<id>), so a reload or the back button lands where they were.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { makeNonce } from '@/lib/ux-v0/sandbox';
import { deleteArtifacts, deleteProject, getProject, listProjects, putProject } from '@/lib/ux-v0/store';
import { makeProject, normalizeProject, type DesignProject, type ProjectSummary } from '@/lib/ux-v0/types';
import { checkFile } from './files';
import { Home, type RemoteWork } from './Home';
import { Workspace } from './Workspace';
import { GraphicsWorkspace } from './graphics/GraphicsWorkspace';
import { BoardWorkspace } from './boards/BoardWorkspace';
import { emptyGraphicState } from '@/lib/ux-v0/graphics/state';
import { emptyBoard } from '@/lib/ux-v0/boards/model';
import { SystemsApp } from './systems/SystemsApp';
import { applySystem } from '@/lib/ux-v0/dsi/link';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { listSystems } from '@/lib/ux-v0/dsi/store';

/** A new project built in the workspace's default design system, when one is set and published. */
async function inDefaultSystem(p: DesignProject): Promise<DesignProject> {
  try {
    const def = (await listSystems()).find((r) => r.isDefault && r.status === 'active' && r.published > 0);
    return def ? applySystem(p, def).project : p;
  } catch {
    return p;
  }
}
import '@/components/brand/socria-brand.css';
import './ux-v0.css';
import './home.css';
import './studio.css';
import './dna.css';
import './graphics/graphics.css';
import './boards/boards.css';

const idFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('p');
  return v && /^[A-Za-z0-9_-]{1,96}$/.test(v) ? v : null;
};
/** The Design System Manager in the address: ?ds=1 (the list) or ?ds=<system id>. */
const systemsFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('ds');
  return v === '1' ? '' : v && /^dsys_[\w-]{4,64}$/.test(v) ? v : null;
};

/**
 * Moving between the home and a work: a short cross-fade where the browser
 * offers view transitions, the plain swap where it does not or where the
 * visitor has asked for less motion.
 */
const passage = (change: () => void) => {
  type Passage = { ready?: Promise<unknown>; finished?: Promise<unknown>; updateCallbackDone?: Promise<unknown> };
  const d = document as Document & { startViewTransition?: (cb: () => void) => Passage };
  if (typeof d.startViewTransition !== 'function' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return change();
  try {
    const t = d.startViewTransition(() => flushSync(change));
    // a passage cut short by the next one still makes its change; only the fade is skipped
    for (const p of [t?.ready, t?.finished, t?.updateCallbackDone]) p?.catch(() => undefined);
  } catch {
    change();
  }
};

export function V0App({ signedIn }: { signedIn: boolean }) {
  const [list, setList] = useState<ProjectSummary[]>([]);
  const [remote, setRemote] = useState<RemoteWork[]>([]);
  const [open, setOpen] = useState<{ p: DesignProject; intent?: string; file?: File | null } | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  // the Design System Manager: null closed, '' the list, an id that system
  const [systems, setSystems] = useState<string | null>(null);
  // the home's plates show imported pages in the same sealed frames as the workspace
  const nonce = useMemo(() => makeNonce(), []);

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
      const found = p;
      passage(() => setOpen({ p: found }));
      if (push) window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(id)}`);
    },
    [signedIn]
  );

  useEffect(() => {
    refresh().then(() => setReady(true));
    const id = idFromUrl();
    const ds = systemsFromUrl();
    if (ds !== null) setSystems(ds);
    else if (id) openById(id, false);
    const onPop = () => {
      const pid = idFromUrl();
      const sid = systemsFromUrl();
      if (sid !== null) {
        setOpen(null);
        setSystems(sid);
      } else if (pid) {
        setSystems(null);
        openById(pid, false);
      } else {
        setOpen(null);
        setSystems(null);
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
    const p0 = makeProject(mode, mode === 'critique' && opts.file ? opts.file.name.replace(/\.[a-z0-9]+$/i, '') : '');
    const p = mode === 'create' ? await inDefaultSystem(p0) : p0;
    await putProject(p);
    passage(() => setOpen({ p, ...opts }));
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
  };

  /** A graphics project (lib/ux-v0/graphics): begun from the words typed on the home, if any. */
  const startGraphic = async (intent: string) => {
    setError('');
    const p = await inDefaultSystem({ ...makeProject('create', 'Untitled graphic'), medium: 'graphic', graphic: emptyGraphicState(), intent: intent.slice(0, 600) });
    await putProject(p);
    passage(() => setOpen({ p, intent }));
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
  };

  /** A board (lib/ux-v0/boards): many materials in one design system, begun from the words typed on the home. */
  const startBoard = async (intent: string) => {
    setError('');
    const p = await inDefaultSystem({ ...makeProject('create', 'Untitled board'), medium: 'board', board: emptyBoard(), intent: intent.slice(0, 600) });
    await putProject(p);
    passage(() => setOpen({ p, intent }));
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
  };

  /** A new project built in a registry design system: linked (identity from the system), then opened. */
  const startInSystem = async (kind: 'graphic' | 'board' | 'website', rec: SystemRecord) => {
    const base = makeProject('create', `${rec.name} ${kind}`);
    const p0: DesignProject = kind === 'graphic' ? { ...base, medium: 'graphic', graphic: emptyGraphicState() } : kind === 'board' ? { ...base, medium: 'board', board: emptyBoard() } : base;
    const { project } = applySystem(p0, rec);
    await putProject(project);
    setSystems(null);
    passage(() => setOpen({ p: project }));
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(project.id)}`);
  };

  const remove = async (s: ProjectSummary) => {
    const p = await getProject(s.id);
    const artifactId = p?.artifact?.type === 'imported' ? p.artifact.id : undefined;
    await deleteProject(s.id, artifactId);
    // the designer's own references go with the project, and a graphic's own pictures
    const gfx = p?.graphic ? [...(p.graphic.assets ?? []), ...(p.graphic.doc?.assets ?? []), ...p.graphic.versions.flatMap((v) => v.doc.assets)].map((a) => a.src).filter((src) => src.startsWith('upload:')).map((src) => src.slice('upload:'.length)) : [];
    // a board's own pictures (its references, its materials', its versions'); its website stays, a project of its own
    if (p?.board) {
      const states = [p.board, ...p.board.versions.map((v) => v.state)];
      gfx.push(...states.flatMap((st) => [...st.assets, ...st.materials.flatMap((m) => (m.type === 'graphic' && m.doc ? m.doc.assets : []))]).map((a) => a.src).filter((src) => src.startsWith('upload:')).map((src) => src.slice('upload:'.length)));
    }
    await deleteArtifacts([...new Set([...(p?.moodboard.refs.filter((r) => r.provider === 'upload').map((r) => r.providerId) ?? []), ...gfx])]);
    if (signedIn) {
      await fetch(`/api/ux-v0/projects?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' }).catch(() => undefined);
      if (artifactId && p?.artifact?.type === 'imported' && p.artifact.kept === 'account') await fetch(`/api/files/original/${artifactId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    refresh();
  };

  if (systems !== null && !open) {
    return (
      <SystemsApp
        signedIn={signedIn}
        initialId={systems || null}
        onExit={() => {
          passage(() => setSystems(null));
          refresh();
          window.history.pushState(null, '', '/ux-v0');
        }}
        onOpenProject={(id) => {
          setSystems(null);
          openById(id);
        }}
        onNewProject={(kind, rec) => void startInSystem(kind, rec)}
      />
    );
  }

  if (open && open.p.medium === 'board') {
    return (
      <BoardWorkspace
        key={open.p.id}
        initial={open.p}
        signedIn={signedIn}
        startIntent={open.intent}
        onOpenProject={(id) => openById(id)}
        onExit={() => {
          passage(() => setOpen(null));
          refresh();
          window.history.pushState(null, '', '/ux-v0');
        }}
      />
    );
  }

  if (open && open.p.medium === 'graphic') {
    return (
      <GraphicsWorkspace
        onOpenProject={(id) => openById(id)}
        key={open.p.id}
        initial={open.p}
        signedIn={signedIn}
        startIntent={open.intent}
        onExit={() => {
          passage(() => setOpen(null));
          refresh();
          window.history.pushState(null, '', '/ux-v0');
        }}
      />
    );
  }

  if (open) {
    return (
      <Workspace
        key={open.p.id}
        initial={open.p}
        signedIn={signedIn}
        startIntent={open.intent}
        startFile={open.file}
        onExit={() => {
          passage(() => setOpen(null));
          refresh();
          window.history.pushState(null, '', '/ux-v0');
        }}
      />
    );
  }

  const local = new Set(list.map((x) => x.id));
  const elsewhere = remote.filter((r) => !local.has(r.id));

  return (
    <Home
      signedIn={signedIn}
      ready={ready}
      list={list}
      elsewhere={elsewhere}
      error={error}
      nonce={nonce}
      onCreate={(intent) => start('create', { intent })}
      onCritique={(file) => start('critique', { file })}
      onGraphic={(intent) => startGraphic(intent)}
      onBoard={(intent) => startBoard(intent)}
      onSystems={() => {
        passage(() => setSystems(''));
        window.history.pushState(null, '', '/ux-v0?ds=1');
      }}
      onOpen={(id) => openById(id)}
      onDelete={remove}
    />
  );
}
