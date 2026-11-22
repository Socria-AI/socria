'use client';
// components/ux-v0/V0App.tsx — SocriaUX at /ux-v0: one place to begin anything, and everything kept.
//
// The home (studio/StudioHome.tsx) asks what to make — a graphic, a website, a logo, a design system, a board or a
// critique, chosen or read from the words — and every work begins as a conversation kept on its project
// (studio/ProjectConversation.tsx): only the questions that matter, answered with choices drawn by the engines. When
// there is enough, the same project becomes the work, in the workspace its engine already has (graphics, boards,
// websites, critique), with its conversation beside it; a design system's conversation hands over to the import.
// Everything is kept in this browser first (lib/ux-v0/store.ts) and, for a signed-in designer, follows them to other
// devices. The open work is in the address (?p=<id>), so a reload or the back button lands where they were.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { makeNonce } from '@/lib/ux-v0/sandbox';
import { deleteArtifacts, deleteProject, getProject, listProjects, putProject } from '@/lib/ux-v0/store';
import { makeProject, normalizeProject, type DesignProject, type ProjectSummary } from '@/lib/ux-v0/types';
import { Workspace } from './Workspace';
import { StudioHome, type BeginRequest } from './studio/StudioHome';
import { ProjectConversation } from './studio/ProjectConversation';
import type { RemoteWork } from './studio/Collection';
import { attachFiles, conversationProject, critiqueProject, startFrom } from './studio/begin';
import { heldFile } from './studio/held';
import { usableSystems } from './studio/SystemPicker';
import type { WizardStart } from './systems/ImportWizard';
import { said } from '@/lib/ux-v0/studio/schema';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { GraphicsWorkspace } from './graphics/GraphicsWorkspace';
import { BoardWorkspace } from './boards/BoardWorkspace';
import { emptyGraphicState } from '@/lib/ux-v0/graphics/state';
import { emptyBoard } from '@/lib/ux-v0/boards/model';
import { SystemsApp } from './systems/SystemsApp';
import { applySystem } from '@/lib/ux-v0/dsi/link';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { listSystems } from '@/lib/ux-v0/dsi/store';
import '@/components/brand/socria-brand.css';
import './ux-v0.css';
import './home.css';
import './studio.css';
import './dna.css';
import './graphics/graphics.css';
import './boards/boards.css';
import './studio/studio-home.css';

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
  // the design systems in this browser (and the account's): offered for every kind of work
  const [dsList, setDsList] = useState<SystemRecord[]>([]);
  // the one chosen on the home (undefined: not chosen, so the workspace's default)
  const [homeSystem, setHomeSystem] = useState<string | null | undefined>(undefined);
  // an import begun in a conversation, handed to the Design System Manager
  const [startImport, setStartImport] = useState<(WizardStart & { next?: string }) | null>(null);

  const refresh = useCallback(async () => setList(await listProjects()), []);
  const refreshSystems = useCallback(async () => {
    try {
      setDsList(await listSystems());
    } catch {
      /* no systems kept here */
    }
  }, []);
  const defaultSystem = usableSystems(dsList).find((r) => r.isDefault)?.id ?? null;
  const chosenSystem = homeSystem === undefined ? defaultSystem : homeSystem;

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
    void refreshSystems();
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

  const home = () => {
    passage(() => setOpen(null));
    refresh();
    void refreshSystems();
    window.history.pushState(null, '', '/ux-v0');
  };
  const openNew = (p: DesignProject, file?: File | null, intent?: string) => {
    passage(() => setOpen({ p, ...(file ? { file } : {}), ...(intent ? { intent } : {}) }));
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
  };
  const toSystems = (ask?: (WizardStart & { next?: string }) | null) => {
    setStartImport(ask ?? null);
    setOpen(null);
    passage(() => setSystems(''));
    window.history.pushState(null, '', '/ux-v0?ds=1');
  };
  /** A conversation's project, gone when its work is not a project (a design system's import). */
  const dropConversation = async (id: string) => {
    await deleteProject(id);
    if (signedIn) await fetch(`/api/ux-v0/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  };

  /** The home's request: a conversation about it, kept as a project from the first word. */
  const beginStudio = async (r: BeginRequest) => {
    setError('');
    const at = await attachFiles(r.files, { critique: r.mode === 'critique', hold: r.mode === 'system' });
    if (at.error) return setError(at.error);
    const p = conversationProject(r.mode, r.prompt, { modeBy: r.modeBy, attachments: at.attachments, systemId: chosenSystem });
    await putProject(p);
    openNew(p);
  };

  /** A design brought to critique from the home: it is the whole request, so the critique opens at once. */
  const critiqueNow = async (file: File, words: string) => {
    setError('');
    const r = await critiqueProject(file, words);
    if (!r.ok) return setError(r.error);
    await putProject(r.project);
    openNew(r.project, file);
  };

  /** A conversation with enough in it: the same project becomes the work, in its workspace. */
  const startConversation = async (p: DesignProject, st: NonNullable<DesignProject['studio']>, websiteSystems: readonly MasterDesignSystem[]): Promise<string | null> => {
    const r = startFrom(p, st, { systems: dsList, websiteSystems });
    if (!r.ok) return r.error;
    if (r.kind === 'import') {
      await dropConversation(p.id);
      toSystems({ kind: r.ask.kind, files: r.ask.files, url: r.ask.url, projectId: r.ask.projectId, parts: r.ask.parts, next: r.ask.next });
      return null;
    }
    await putProject(r.project);
    passage(() => setOpen({ p: r.project, ...(r.file ? { file: r.file } : {}) }));
    return null;
  };

  /** The workspace's own way in, without the questions: the brief written there (a website's planned there). */
  const writeBrief = async (p: DesignProject) => {
    const st = p.studio;
    if (!st) return;
    if (st.mode === 'system') {
      const files = (st.answers['s.input']?.values ?? []).map((id) => heldFile(id)).filter((f): f is File => !!f);
      await dropConversation(p.id);
      return toSystems({ kind: st.answers['s.source']?.values?.[0] ?? '', files, url: st.answers['s.input']?.fields?.url ?? '', projectId: '', parts: [] });
    }
    const now = Date.now();
    const started = said({ ...st, status: 'started', startedAt: now, via: 'hand' }, { from: 'socria', kind: 'note', text: st.mode === 'website' ? 'Planned in the website workspace from here: its own questions, references, brief and directions.' : 'The brief is yours to write in the workspace; this conversation stays beside it.', at: now });
    let next: DesignProject =
      st.mode === 'graphic' || st.mode === 'logo'
        ? { ...p, medium: 'graphic', graphic: p.graphic ?? emptyGraphicState(), studio: started }
        : st.mode === 'board'
          ? { ...p, medium: 'board', board: p.board ?? emptyBoard(), studio: started }
          : { ...p, intent: '', studio: started };
    const rec = st.systemId ? usableSystems(dsList).find((x) => x.id === st.systemId) : undefined;
    if (rec) next = applySystem(next, rec).project;
    await putProject(next);
    passage(() => setOpen({ p: next, intent: st.prompt || p.intent }));
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
    // a conversation's own pictures (those not yet placed in a work)
    gfx.push(...(p?.studio?.attachments ?? []).map((a) => a.upload ?? '').filter(Boolean));
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
        startImport={startImport}
        onImportTaken={() => setStartImport(null)}
        onExit={() => {
          passage(() => setSystems(null));
          refresh();
          void refreshSystems();
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

  if (open && open.p.studio?.status === 'discovering') {
    return (
      <ProjectConversation
        key={open.p.id}
        initial={open.p}
        signedIn={signedIn}
        nonce={nonce}
        systems={dsList}
        onStart={startConversation}
        onWriteBrief={(p) => void writeBrief(p)}
        onExit={home}
        onManageSystems={() => toSystems(null)}
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
    <StudioHome
      signedIn={signedIn}
      ready={ready}
      list={list}
      elsewhere={elsewhere}
      error={error}
      nonce={nonce}
      systems={dsList}
      systemId={chosenSystem}
      onSystem={(id) => setHomeSystem(id)}
      onBegin={beginStudio}
      onCritique={(file, words) => void critiqueNow(file, words)}
      onSystems={() => toSystems(null)}
      onOpen={(id) => openById(id)}
      onDelete={remove}
    />
  );
}
