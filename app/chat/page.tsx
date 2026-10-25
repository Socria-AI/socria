// app/chat/page.tsx
'use client';

// /chat — LOGOS 5, AND ONLY LOGOS 5.
//
// This was the Core chat. Logos was a model chosen inside it, and choosing it
// swapped the whole surface in here, so /chat stayed the address of "talking
// to Socria" whichever mind answered. On 24 October 2026 the Core chat was
// archived with every model but Logos 5 (docs/ARCHIVE.md): Core 2, Core 3.1,
// Core 4, Logos 1 and Logos 2 are withdrawn in lib/socria-prompt.ts, and the
// screen that hosted them is gone. Everybody opens Logos 5 — somebody signed
// out as a guest, with one line of thinking and its map (lib/guest-pass.ts),
// which comes with them when they sign up.
//
// WHAT THIS PAGE STILL DOES, because it is the host:
//   • A GUEST'S CORE CHATS, CARRIED IN. A browser that talked to Core 3.1
//     signed out kept those chats in localStorage. On the first sign-in they
//     go to the account exactly as before, and Logos 5 brings them in with
//     every other Core chat (lib/logos5/merge.ts). Until then they stay where
//     they are, untouched.
//   • THE PROFILE AND THE JOURNEY, CARRIED UP. Core's imported profile and its
//     thinking journey were mirrored to the account from here; one built
//     signed out is still pushed up once, so nothing a guest made is lost.
//   • PROJECTS — the folders Logos 5's rail and Universal Map file into, their
//     settings sheet, and a Project's home (?p=), which is where a shared
//     Project's link lands.
//   • A CORE CONVERSATION SHARED WITH THEM (?shared=<id>). Its owner's chats
//     come into Logos 5 when the owner next opens it; until then the shared
//     thread opens here, on its own, as it did beside the Core chat.
//   • Onboarding's sentence, handed to Logos 5 once, and sent for them.
//
// OLD LINKS STILL LAND. ?model=<anything> is dropped — there is one surface —
// and ?c=<id>, which opened one Core chat, opens that conversation in Logos 5.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import '../app-shell.css';
import { useGateSync } from '@/components/account/AccessCode';
import { useThemeGuard } from '@/components/account/ThemePicker';
import { LogosApp } from '@/components/LogosApp';
import type { RailProject } from '@/components/LogosRail';
import type { SharedIn } from '@/components/logos5/Universe';
import { ProjectSheet } from '@/components/projects/ProjectSheet';
import { ProjectHome } from '@/components/projects/ProjectHome';
import { JoinCodeDialog, ShareDialog } from '@/components/share/ShareDialog';
import { SharedThread } from '@/components/share/SharedThread';
import { RewardsPopups } from '@/components/rewards/RewardsPopups';
import { useConversationStyle } from '@/components/useConversationStyle';
import { Logo } from '@/components/Logo';
import { usePlan } from '@/components/usePlan';
import { takeCarried } from '@/lib/onboarding-script';
import { isSource } from '@/lib/checkout-attribution';
import { chooseModel } from '@/lib/socria-model-store';
import { hasJourneyContent, sanitizeUserUnderstanding, type UserUnderstanding } from '@/lib/socria-prompt';
import type { ResourceType } from '@/lib/share/roles';

// A guest's Core chats, kept by the Core chat in this browser, and the record
// of which account they were carried into. Read only to carry them.
const STORAGE_KEY = 'socria.conversations.v1';
const ACTIVE_KEY = 'socria.activeConversationId.v1';
const MIGRATED_KEY = 'socria.cloudMigrated.v1';
// Core's imported profile ("import your history") and its thinking journey.
const PROFILE_KEY = 'socria.importedProfile.v1';
const JOURNEY_KEY = 'socria.journey.v1';

/** A conversation, as the host lists it for Logos 5. */
interface Row {
  id: string;
  title: string;
  updatedAt: number;
  projectId: string | null;
}

/** The guest's Core chats, verbatim — whatever shape the Core chat wrote them in. */
function loadGuestChats(): unknown[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const idOk = (v: string | null, max: number): v is string => !!v && new RegExp(`^[A-Za-z0-9_-]{1,${max}}$`).test(v);

export default function ChatPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  // How Socria talks with them (Manage Account → Personalization), for a shared thread.
  const { style: conversationStyle } = useConversationStyle(!!isSignedIn);
  const planState = usePlan();
  // A lapsed member goes back to paper on every page this host shows — a
  // Project's home and a shared thread too, which open without Logos 5 (it
  // guards its own screen).
  useThemeGuard(planState.plan === 'one', planState.known);
  // A feature unlocked on another device (Manage Account → Access code).
  useGateSync();

  /** their conversations that are not lines of thinking yet — Logos 5 brings them in */
  const [chats, setChats] = useState<Row[]>([]);
  /** their lines of thinking, for what a Project's home opens */
  const [lines, setLines] = useState<Row[]>([]);
  const [hydrating, setHydrating] = useState(true);
  /** The person's Projects. Signed-in only. */
  const [projects, setProjects] = useState<RailProject[]>([]);
  /** true once the list has actually been fetched — Logos files nothing against a list that has not arrived */
  const [projectsLoaded, setProjectsLoaded] = useState(false);
  /** the Project whose settings sheet is open */
  const [sheet, setSheet] = useState<string | null>(null);
  /** the Project whose home is open (?p=) */
  const [homeProject, setHomeProject] = useState<string | null>(null);
  /** a Core conversation shared with them, open together (?shared=<id>) */
  const [sharedOpen, setSharedOpen] = useState<string | null>(null);
  /** what is shared with this person (/api/shared): listed under Shared with you, and a shared Project's name */
  const [sharedItems, setSharedItems] = useState<SharedIn[]>([]);
  /** "Join with a code", open (from the More menu or under Shared with you) */
  const [joinOpen, setJoinOpen] = useState(false);
  /** the Share sheet, open for one thing */
  const [shareFor, setShareFor] = useState<{ type: ResourceType; id: string; title: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** the URL has been read: Logos 5 mounts after, so it sees what was carried and the links it reads */
  const [urlRead, setUrlRead] = useState(false);
  /** the sentence written during onboarding, for Logos 5's composer */
  const [carriedText, setCarriedText] = useState('');
  /** onboarding's sentence is sent on landing, and the tour follows Socria's first answer */
  const [autoSend, setAutoSend] = useState(false);
  const [tourAfter, setTourAfter] = useState(false);

  // DON'T HANG BEHIND CLERK. If it never initialises — a blocked script, a
  // preview build, a flaky network — this page reads as signed out after a
  // few seconds, and again on the real answer when Clerk does arrive.
  const [authTimedOut, setAuthTimedOut] = useState(false);
  useEffect(() => {
    if (isLoaded) return;
    const t = setTimeout(() => setAuthTimedOut(true), 4000);
    return () => clearTimeout(t);
  }, [isLoaded]);
  const authSettled = isLoaded || authTimedOut;

  // ── the URL, read once, before Logos 5 mounts ─────────────────────
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const u = new URL(window.location.href);
    // One surface. Whatever a link or a bookmark asked for, it opens here —
    // and is remembered as the choice, so nothing reads an archived one back.
    if (params.has('model')) u.searchParams.delete('model');
    chooseModel('logos-3');
    // ?c=<id> opened one Core chat; it opens in Logos 5, which reads ?s=.
    const c = params.get('c');
    if (idOk(c, 120) && !params.get('s')) u.searchParams.set('s', c);
    u.searchParams.delete('c');
    // A Project's home, and a Core conversation shared with them. A shared line
    // of thinking is ?s=<id>&shared=1, and Logos 5 opens that itself.
    const p = params.get('p');
    if (idOk(p, 80)) setHomeProject(p);
    const shared = params.get('shared');
    if (idOk(shared, 120) && shared !== '1' && !params.get('s')) setSharedOpen(shared);
    // A link from an email says which one it was; remembered for checkout.
    const via = params.get('via');
    if (via) {
      try {
        if (isSource(via)) sessionStorage.setItem('socria.via.v1', via);
      } catch {}
      u.searchParams.delete('via');
    }
    // The sentence they wrote during onboarding. takeCarried clears as it
    // reads, so it is read here, once, and handed down.
    const carried = takeCarried(sessionStorage);
    if (carried) {
      setCarriedText(carried.text);
      if (carried.send) {
        setAutoSend(true);
        setTourAfter(true);
      }
    }
    if (u.href !== window.location.href) window.history.replaceState({}, '', u.pathname + u.search);
    setUrlRead(true);
  }, []);

  // ?p= and ?shared= follow what is open, so a reload or a copied link lands in
  // the same place. Only one that WAS open is taken out of the URL.
  const homeWas = useRef<string | null>(null);
  const sharedWas = useRef<string | null>(null);
  useEffect(() => {
    if (!urlRead) return;
    try {
      const u = new URL(window.location.href);
      if (homeProject) u.searchParams.set('p', homeProject);
      else if (homeWas.current) u.searchParams.delete('p');
      if (sharedOpen) u.searchParams.set('shared', sharedOpen);
      else if (sharedWas.current) u.searchParams.delete('shared');
      homeWas.current = homeProject;
      sharedWas.current = sharedOpen;
      if (u.href !== window.location.href) window.history.replaceState({}, '', u.pathname + u.search);
    } catch {}
  }, [urlRead, homeProject, sharedOpen]);

  // ── their conversations: a guest's carried in, then listed ───────
  useEffect(() => {
    if (!authSettled) return;
    let cancelled = false;
    (async () => {
      setHydrating(true);
      if (!isSignedIn) {
        // Signed out there is nothing to list: Logos 5 keeps its own lines of
        // thinking for a key-holder, and a guest's Core chats wait here for
        // their first sign-in.
        setChats([]);
        setLines([]);
        setHydrating(false);
        return;
      }
      // First sign-in for this browser: a guest's Core chats go into the account.
      try {
        const migratedFor = localStorage.getItem(MIGRATED_KEY);
        const local = loadGuestChats();
        if (user?.id && migratedFor !== user.id && local.length > 0) {
          const res = await fetch('/api/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversations: local }),
          });
          // Kept until the account has them: a failed write is tried again next time.
          if (res.ok) {
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ACTIVE_KEY);
            localStorage.setItem(MIGRATED_KEY, user.id);
          }
        } else if (user?.id) {
          localStorage.setItem(MIGRATED_KEY, user.id);
        }
      } catch (e) {
        console.error('Migration failed:', e);
      }
      try {
        const res = await fetch('/api/conversations', { cache: 'no-store' });
        if (!res.ok) throw new Error(`Failed to load conversations (HTTP ${res.status})`);
        const json = await res.json();
        if (cancelled) return;
        const rows = (json.conversations || []) as any[];
        const row = (c: any): Row => ({
          id: c.id,
          title: c.title,
          updatedAt: Number(c.updatedAt) || 0,
          projectId: typeof c.projectId === 'string' ? c.projectId : null,
        });
        setChats(rows.filter((c) => c.kind !== 'logos').map(row));
        setLines(rows.filter((c) => c.kind === 'logos').map(row));
      } catch (e: any) {
        if (!cancelled) setError(e?.message || 'Failed to load conversations');
      }
      if (!cancelled) setHydrating(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authSettled, isSignedIn, user?.id]);

  // ── the profile and the journey, carried up once ─────────────────
  //
  // The Core chat mirrored both to the account. One built signed out (with the
  // access key, before an account existed) is pushed up the first time it is
  // newer than the account's, so it reaches every device; the account's copy is
  // left alone otherwise. Every failure is silent: nothing here is in the way.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const put = (body: object) =>
          void fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
        const localProfile = localStorage.getItem(PROFILE_KEY) || '';
        if (json?.profile) localStorage.setItem(PROFILE_KEY, json.profile);
        else if (localProfile) put({ profile: localProfile });
        const raw = localStorage.getItem(JOURNEY_KEY);
        const local: UserUnderstanding | null = raw ? sanitizeUserUnderstanding(JSON.parse(raw)) : null;
        const cloud: UserUnderstanding | null = json?.understanding ? sanitizeUserUnderstanding(json.understanding) : null;
        if (local && hasJourneyContent(local) && Math.min(local.updatedAt || 0, Date.now()) > (cloud?.updatedAt || 0)) put({ understanding: local });
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  // ── Projects ──────────────────────────────────────────────────────
  const loadProjects = useCallback(async () => {
    if (!isSignedIn) {
      setProjects([]);
      setProjectsLoaded(false);
      return;
    }
    try {
      const res = await fetch('/api/projects', { cache: 'no-store' });
      if (!res.ok) return;
      const j = await res.json();
      // A deployment without the table answers with a storage fault: no folders.
      setProjects(j.storage?.ok === false ? [] : (j.projects ?? []));
      setProjectsLoaded(true);
    } catch {}
  }, [isSignedIn]);
  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  // What others have shared with them — read when they arrive and whenever the Share sheet closes.
  const loadShared = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await fetch('/api/shared', { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (res.ok && Array.isArray(j?.items)) setSharedItems(j.items);
    } catch {}
  }, [isSignedIn]);
  useEffect(() => {
    void loadShared();
  }, [loadShared]);

  /** Make a Project by name; its id, or null when it could not be made. */
  async function createProject(name: string): Promise<string | null> {
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That project could not be created.');
      await loadProjects();
      return j.project.id as string;
    } catch (e: any) {
      setError(e?.message || 'That project could not be created.');
      return null;
    }
  }

  /** Rename a Project or change its colour (the Universal Map does both); what went wrong, or null. */
  async function updateProject(id: string, patch: { name?: string; color?: string | null }): Promise<string | null> {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) return j?.error || 'That Project could not be changed.';
      await loadProjects();
      return null;
    } catch {
      return 'That Project could not be changed.';
    }
  }

  /**
   * File a conversation Logos 5 does not hold into a Project, out of one, or
   * between two. The server also re-files what it taught in the Mind Graph
   * (app/api/conversations moveToProject). Optimistic, and put back if it fails.
   */
  async function moveChat(id: string, pid: string | null) {
    const c = chats.find((x) => x.id === id);
    if (!c || c.projectId === pid) return;
    const before = chats;
    setChats((cs) => cs.map((x) => (x.id === id ? { ...x, projectId: pid } : x)));
    try {
      const res = await fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId: pid }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That conversation could not be moved.');
    } catch (e: any) {
      setChats(before);
      setError(e?.message || 'That conversation could not be moved.');
    }
  }

  /** Into a conversation from a Project's home: theirs in Logos 5; someone else's, opened together. */
  function openFromHome(id: string, kind: 'chat' | 'logos') {
    const mine = chats.some((c) => c.id === id) || lines.some((x) => x.id === id);
    if (mine) return window.location.assign(`/chat?s=${encodeURIComponent(id)}`);
    if (kind === 'logos') return window.location.assign(`/chat?s=${encodeURIComponent(id)}&shared=1`);
    setHomeProject(null);
    setSharedOpen(id);
  }

  /** Back to Logos 5 from a Project's home or a shared thread. */
  const backToLogos = () => {
    setHomeProject(null);
    setSharedOpen(null);
  };

  /** Into something shared with them: a Project's home; a line of thinking, together; a Core conversation, beside Logos 5. */
  function openShared(it: SharedIn) {
    if (it.type === 'project') return setHomeProject(it.id);
    if (it.kind === 'logos') return window.location.assign(`/chat?s=${encodeURIComponent(it.id)}&shared=1`);
    setSharedOpen(it.id);
  }

  // Socria Rewards may greet someone arriving — into a quiet room only:
  // not over onboarding's first exchange, a sheet or a Project's page.
  const rewardsQuiet = isLoaded && !hydrating && planState.known && !autoSend && !tourAfter && !shareFor && !sheet && !joinOpen;

  const shareSheet = shareFor && (
    <ShareDialog
      type={shareFor.type}
      id={shareFor.id}
      title={shareFor.title}
      open
      onClose={() => {
        setShareFor(null);
        void loadShared();
      }}
      onUpgrade={() => window.location.assign('/one')}
      onLeft={() => {
        if (shareFor.type === 'project' && homeProject === shareFor.id) setHomeProject(null);
        if (sharedOpen === shareFor.id) setSharedOpen(null);
      }}
    />
  );
  const projectSheet = sheet && (
    <ProjectSheet
      id={sheet}
      onClose={() => setSheet(null)}
      onChanged={() => void loadProjects()}
      onDeleted={() => {
        const gone = sheet;
        setChats((cs) => cs.map((c) => (c.projectId === gone ? { ...c, projectId: null } : c)));
        setLines((ls) => ls.map((x) => (x.projectId === gone ? { ...x, projectId: null } : x)));
        if (homeProject === gone) setHomeProject(null);
        setSheet(null);
        void loadProjects();
      }}
    />
  );

  // A Project's home and a shared Core thread are pages of their own beside
  // Logos 5: a bar back to it, and the page.
  if (urlRead && (homeProject || sharedOpen)) {
    return (
      <div className="app-root chat-aside">
        {shareSheet}
        {projectSheet}
        <header className="chat-aside-bar">
          <button type="button" className="chat-aside-back" onClick={backToLogos}>
            <span aria-hidden="true">←</span> Logos
          </button>
          <Logo size="sm" />
        </header>
        {error && (
          <p className="chat-aside-error" role="alert">
            {error}
          </p>
        )}
        {homeProject ? (
          <ProjectHome
            id={homeProject}
            onShare={
              isSignedIn
                ? () =>
                    setShareFor({
                      type: 'project',
                      id: homeProject,
                      title: projects.find((x) => x.id === homeProject)?.name ?? sharedItems.find((x) => x.id === homeProject)?.title ?? 'This Project',
                    })
                : undefined
            }
            onOpenChat={openFromHome}
            // Every new conversation is a line of thinking, begun in the Project.
            onNewChat={() => window.location.assign(`/chat?in=${encodeURIComponent(homeProject)}`)}
            onSettings={() => setSheet(homeProject)}
            onRenamed={(id, _kind, title) => {
              setChats((cs) => cs.map((c) => (c.id === id ? { ...c, title } : c)));
              setLines((ls) => ls.map((x) => (x.id === id ? { ...x, title } : x)));
            }}
            refreshKey={projects.find((x) => x.id === homeProject)?.updatedAt}
          />
        ) : (
          <SharedThread
            id={sharedOpen!}
            conversationStyle={conversationStyle}
            onClose={backToLogos}
            onShare={(title) => setShareFor({ type: 'conversation', id: sharedOpen!, title })}
            onUpgrade={() => window.location.assign('/one')}
          />
        )}
      </div>
    );
  }

  return (
    <>
      {shareSheet}
      {projectSheet}
      <JoinCodeDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      {/* The rewards popups, for the Logos rail's marks — Logos's own sheets and
          tour are seen by the popup itself (it never opens over a dialog). */}
      <RewardsPopups enabled={!!isSignedIn} quiet={rewardsQuiet} surface="logos" />
      {urlRead && (
        <LogosApp
          initialInput={carriedText}
          // onboarding's sentence is sent for them, and the tour follows the reply
          autoSend={autoSend}
          tourAfter={tourAfter}
          model="logos-3"
          // Their conversations not yet brought in, so the Universal Map and the
          // rail show everything; Logos 5 holds every one of them once it has
          // loaded (lib/logos5/merge.ts).
          chats={isSignedIn ? chats : undefined}
          // Undefined until fetched, so Logos never files anything against a list that has not arrived.
          projects={isSignedIn && projectsLoaded ? projects : undefined}
          onProjectSettings={(id) => setSheet(id)}
          onCreateProject={createProject}
          onUpdateProject={updateProject}
          onMoveChat={(id, pid) => void moveChat(id, pid)}
          // A conversation Logos 5 does not hold: theirs opens in it by its id;
          // a Core conversation someone shared with them opens beside it.
          onOpenChat={(id) => {
            if (chats.some((c) => c.id === id)) window.location.assign(`/chat?s=${encodeURIComponent(id)}`);
            else setSharedOpen(id);
          }}
          onOpenProject={(pid) => setHomeProject(pid)}
          // What others shared with them, under their own in the List; a code opens the rest.
          shared={isSignedIn ? sharedItems : undefined}
          onOpenShared={openShared}
          onJoinWithCode={isSignedIn ? () => setJoinOpen(true) : undefined}
          // The Core chats brought into Logos 5: moved in this list too.
          onConversationsMoved={(moved) => {
            const ids = new Set(moved.map((m) => m.id));
            setChats((cs) => cs.filter((c) => !ids.has(c.id)));
            setLines((ls) => [...moved.filter((m) => !ls.some((l) => l.id === m.id)), ...ls]);
          }}
        />
      )}
    </>
  );
}
