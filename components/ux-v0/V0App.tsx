'use client';
// components/ux-v0/V0App.tsx — SocriaUX at /ux-v0: one place to begin anything, and everything kept.
//
// The home (studio/StudioHome.tsx) is one composer: what to make, said in words, with pictures, files and links; the
// words are read to know what kind of work it is. Every work begins as a conversation kept on its project
// (studio/ProjectConversation.tsx): real references looked for on the internet, only the questions that matter,
// answered with choices drawn from those references and the person's words. When there is enough, the same project
// becomes the work, in the workspace its engine already has (graphics, boards, websites, critique), with the
// conversation docked beside it; a design attached to critique opens its critique at once, and a design system's
// conversation hands over to the import. Everything made is in its own view (?work=1). Everything is kept in this
// browser first (lib/ux-v0/store.ts) and, for a signed-in designer, follows them to other devices. The open work is in
// the address (?p=<id>), so a reload or the back button lands where they were.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { flushSync } from 'react-dom';
import { makeNonce } from '@/lib/ux-v0/sandbox';
import { deleteArtifacts, deleteProject, getProject, listProjects, putProject } from '@/lib/ux-v0/store';
import { normalizeProject, type DesignProject, type ProjectSummary } from '@/lib/ux-v0/types';
import { Workspace } from './Workspace';
import { StudioHome, type BeginRequest } from './studio/StudioHome';
import { YourWork } from './studio/YourWork';
import { ProjectConversation } from './studio/ProjectConversation';
import type { RemoteWork } from './studio/Collection';
import { attachFiles, conversationProject, critiqueProject, startFrom } from './studio/begin';
import { readyToMake } from '@/lib/ux-v0/studio/director';
import { isCreative, makingNow } from '@/lib/ux-v0/studio/discover';
import { usableSystems } from './studio/SystemPicker';
import type { WizardStart } from './systems/ImportWizard';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { DesignWorkspace } from './design/DesignWorkspace';
import { openLegacy } from './design/legacy-open';
import { SystemsApp } from './systems/SystemsApp';
import { CompanyApp } from './company/CompanyApp';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { listSystems } from '@/lib/ux-v0/dsi/store';
import '@/components/brand/socria-brand.css';
import './ux-v0.css';
import './home.css';
import './studio.css';
import './dna.css';
import './studio/studio-home.css';
import './studio/spatial-brief.css';

const idFromUrl = () => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('p');
  return v && /^[A-Za-z0-9_-]{1,96}$/.test(v) ? v : null;
};
/** Everything made, in its own view: ?work=1. */
const workFromUrl = () => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('work') === '1';
/** The Design System Manager in the address: ?ds=1 (the list) or ?ds=<system id>. */
const systemsFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('ds');
  return v === '1' ? '' : v && /^dsys_[\w-]{4,64}$/.test(v) ? v : null;
};

/** The company page in the address: ?company=1 (the one chosen in this browser) or ?company=<id>. */
const companyFromUrl = (): string | null => {
  if (typeof window === 'undefined') return null;
  const v = new URLSearchParams(window.location.search).get('company');
  return v === '1' ? '' : v && /^co_[\w-]{4,64}$/.test(v) ? v : null;
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
  // the company page: null closed, '' the company chosen in this browser, an id that company
  const [company, setCompany] = useState<string | null>(null);
  // everything made, in its own view (the home is one question)
  const [work, setWork] = useState(false);
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
    const co = companyFromUrl();
    if (co !== null) setCompany(co);
    else if (ds !== null) setSystems(ds);
    else if (id) openById(id, false);
    else if (workFromUrl()) setWork(true);
    const onPop = () => {
      const pid = idFromUrl();
      const sid = systemsFromUrl();
      setWork(workFromUrl());
      setCompany(companyFromUrl());
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
    passage(() => (setOpen(null), setWork(false)));
    refresh();
    void refreshSystems();
    window.history.pushState(null, '', '/ux-v0');
  };
  const toWork = () => {
    passage(() => (setOpen(null), setWork(true)));
    refresh();
    window.history.pushState(null, '', '/ux-v0?work=1');
  };
  const openNew = (p: DesignProject, file?: File | null, intent?: string) => {
    passage(() => setOpen({ p, ...(file ? { file } : {}), ...(intent ? { intent } : {}) }));
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
  };
  const toCompany = (id = '') => {
    setOpen(null);
    setSystems(null);
    passage(() => setCompany(id));
    window.history.pushState(null, '', `/ux-v0?company=${id || '1'}`);
  };
  const toSystems = (ask?: (WizardStart & { next?: string }) | null) => {
    setStartImport(ask ?? null);
    setOpen(null);
    setCompany(null);
    passage(() => setSystems(''));
    window.history.pushState(null, '', '/ux-v0?ds=1');
  };
  /** A conversation's project, gone when its work is not a project (a design system's import). */
  const dropConversation = async (id: string) => {
    await deleteProject(id);
    if (signedIn) await fetch(`/api/ux-v0/projects?id=${encodeURIComponent(id)}`, { method: 'DELETE' }).catch(() => undefined);
  };

  /** The home's request: a conversation about it, kept as a project from the first word. A design brought to critique
   * is the whole request, so its critique opens at once (a file it cannot take is refused before anything is kept). */
  const beginStudio = async (r: BeginRequest): Promise<'refused' | void> => {
    setError('');
    if (r.mode === 'critique' && r.files.length) {
      const c = await critiqueProject(r.files[0], r.prompt);
      if (!c.ok) {
        setError(c.error);
        return 'refused';
      }
      await putProject(c.project);
      return openNew(c.project, r.files[0]);
    }
    const at = await attachFiles(r.files, { critique: r.mode === 'critique', hold: r.mode === 'system' });
    if (at.error) {
      setError(at.error);
      return;
    }
    const rec = chosenSystem ? usableSystems(dsList).find((x) => x.id === chosenSystem) : undefined;
    const p = conversationProject(r.mode, r.prompt, { modeBy: r.modeBy, attachments: at.attachments, systemId: chosenSystem, ...(rec ? { systemName: rec.name } : {}) });
    await putProject(p);
    // words that are already enough go straight to the work, the conversation beside it (a website's looks are
    // chosen in the conversation first)
    // the opening said it has enough and is making the work: straight to it (anything else opens the conversation)
    if (p.studio && (isCreative(p.studio.mode) ? makingNow(p.studio) : readyToMake(p.studio, { hasSystem: !!rec, ...(rec ? { systemName: rec.name } : {}) }))) {
      window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
      const err = await startConversation(p, p.studio, []);
      if (!err) return;
      setError(err);
      window.history.replaceState(null, '', '/ux-v0');
    }
    openNew(p);
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

  /** A new project built in a registry design system: linked (identity from the system), then opened. */
  const startInSystem = async (kind: 'graphic' | 'board' | 'website', rec: SystemRecord) => {
    // a conversation like any other, the system already chosen: it asks only what the work needs (never its colours,
    // lettering or mood: the system decides those)
    const p = conversationProject(kind, '', { modeBy: 'person', attachments: [], systemId: rec.id, systemName: rec.name });
    await putProject(p);
    // the systems as they are now (one made or published in the manager a moment ago is the one the work is made in)
    await refreshSystems();
    setSystems(null);
    passage(() => setOpen({ p }));
    window.history.pushState(null, '', `/ux-v0?p=${encodeURIComponent(p.id)}`);
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
    // a design's own pictures, and those of the earlier record it was carried over from
    gfx.push(...(p?.design?.assets ?? []).map((a) => a.src).filter((src) => src.startsWith('upload:')).map((src) => src.slice('upload:'.length)));
    if (p?.legacy) gfx.push(...[...JSON.stringify(p.legacy.data).matchAll(/"upload:([\w-]{1,80})"/g)].map((m) => m[1]));
    // a conversation's own pictures (those not yet placed in a work)
    gfx.push(...(p?.studio?.attachments ?? []).map((a) => a.upload ?? '').filter(Boolean));
    await deleteArtifacts([...new Set([...(p?.moodboard.refs.filter((r) => r.provider === 'upload').map((r) => r.providerId) ?? []), ...gfx])]);
    if (signedIn) {
      await fetch(`/api/ux-v0/projects?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' }).catch(() => undefined);
      if (artifactId && p?.artifact?.type === 'imported' && p.artifact.kept === 'account') await fetch(`/api/files/original/${artifactId}`, { method: 'DELETE' }).catch(() => undefined);
    }
    refresh();
  };

  if (company !== null && !open) {
    return (
      <CompanyApp
        signedIn={signedIn}
        initialId={company || null}
        onExit={() => {
          passage(() => setCompany(null));
          refresh();
          window.history.pushState(null, '', '/ux-v0');
        }}
        onOpenProject={(id) => {
          setCompany(null);
          void openById(id);
        }}
        onOpenSystems={(id) => {
          setCompany(null);
          passage(() => setSystems(id ?? ''));
          window.history.pushState(null, '', `/ux-v0?ds=${id || '1'}`);
        }}
      />
    );
  }

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
          void refreshSystems();
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
        onExit={home}
        onManageSystems={() => toSystems(null)}
      />
    );
  }

  if (open && open.p.medium === 'design') {
    return (
      <DesignWorkspace
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

  // a graphic or a board made with the earlier editor: carried into the design workspace as it was drawn
  if (open && (open.p.medium === 'graphic' || open.p.medium === 'board')) {
    return (
      <LegacyOpen
        key={open.p.id}
        p={open.p}
        onReady={(p) => setOpen({ p })}
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

  if (work) return <YourWork signedIn={signedIn} ready={ready} list={list} elsewhere={elsewhere} nonce={nonce} onOpen={(id) => openById(id)} onDelete={remove} onNew={home} onSystems={() => toSystems(null)} onCompany={() => toCompany()} />;

  return (
    <StudioHome
      signedIn={signedIn}
      list={list}
      error={error}
      systems={dsList}
      systemId={chosenSystem}
      onSystem={(id) => setHomeSystem(id)}
      onBegin={beginStudio}
      onSystems={() => toSystems(null)}
      onCompany={() => toCompany()}
      onWork={toWork}
      onOpen={(id) => openById(id)}
    />
  );
}

/** An old graphic or board, carried over once (lib/ux-v0/design/legacy.ts), kept, then opened as a design. */
function LegacyOpen({ p, onReady, onExit }: { p: DesignProject; onReady: (p: DesignProject) => void; onExit: () => void }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    openLegacy(p)
      .then(async (r) => {
        if (!live) return;
        if (!r) return setFailed(true);
        await putProject(r.project);
        if (live) onReady(r.project);
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [p]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="sx-legacy" aria-busy={!failed}>
      <p>{failed ? 'This design could not be carried over from the earlier editor.' : 'Carrying this design over from the earlier editor…'}</p>
      {failed && (
        <button type="button" onClick={onExit}>
          Back to your work
        </button>
      )}
    </main>
  );
}
