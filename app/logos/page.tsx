'use client';

// Logos — sessions on the left, conversation in the middle, live Thinking Map
// on the right.
//
// Every user message fires two independent requests in parallel: the
// conversational reply (streamed) and a fresh map extraction. The map is
// deliberately not derived from the reply — it grows and REORGANIZES while the
// answer is still arriving, which is the whole interaction being tested here.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { ThinkingMap, type MapNodeRef } from '@/components/ThinkingMap';
import { ExplorePanel } from '@/components/ExplorePanel';
import { LogosRail } from '@/components/LogosRail';
import { AttachmentList, LogosComposer, type Draft } from '@/components/LogosComposer';
import { DraftSpace, type DraftHandle, type DraftSelection } from '@/components/DraftSpace';
import { DraftResponsePanel } from '@/components/DraftResponsePanel';
import { LogosGuide, GUIDE_SEEN_KEY } from '@/components/LogosGuide';
import { LogosMark } from '@/components/LogosMark';
import { ModelGlyph } from '@/components/ModelGlyph';
import { SocriaOneModal } from '@/components/SocriaOneModal';
import { OneLock } from '@/components/OneLock';
import {
  FREE_LIMITS,
  SOCRIA_ONE_KEY,
  isValidOneKey,
  meaningfulNodes,
  type OneFeature,
  type Plan,
} from '@/lib/socria-one';
import { MathText } from '@/components/TeX';
import {
  SOCRIA_MODELS,
  THINKING_DEPTHS,
  type SocriaModel,
  type ThinkingDepth,
} from '@/lib/socria-prompt';
import type { GuardSignal } from '@/lib/logos-guidance';
import { ContextPanel } from '@/components/ContextPanel';
import { ConnectionsModal } from '@/components/ConnectionsModal';
import type { Attachment, AttachmentOrigin } from '@/lib/logos-attachments';
import { MAX_CONTEXTS_PER_NODE, sanitizeContexts, type NodeContext } from '@/lib/logos-sources';
import { relevantNodes, type DraftAction, type DraftResponse } from '@/lib/logos-draft';
import {
  CONTEXT_LABEL,
  EMPTY_MAP,
  describeLineage,
  diffMaps,
  summarizeDelta,
  type ThinkingMap as TMap,
} from '@/lib/logos';
import type { ExploreResult, NodeMode } from '@/lib/logos-explore';
import {
  emptySession,
  loadLocal,
  saveLocal,
  sortSessions,
  titleFor,
  UNTITLED,
  type LogosMsg as Msg,
  type LogosSession,
} from '@/lib/logos-sessions';
import { CORE3_ACCESS_KEY, isValidAccessKey } from '@/lib/socria-prompt';

// Shared with Core 3.1 — unlocking once covers both.
const KEY_STORAGE = 'socria.core3AccessKey.v1';
// Depth is shared with the Core chat, so switching there carries over.
const DEPTH_KEY = 'socria.depth.v1';
// Same store the Core chat reads, so picking a model here lands there.
const MODEL_KEY = 'socria.model.v1';
const REVEALED_KEY = 'socria.logos.revealed.v1';
// Socria One, held client-side the way the Core 3 key already is. The routes
// re-decide this for themselves; nothing here is the authority.
const ONE_KEY_STORAGE = 'socria.one.v1';
const RESEARCH_KEY = 'socria.logos.research.v1';

const STARTERS = [
  'I’m debating whether to build Logos now.',
  'I can’t tell if I want this career or just the idea of it.',
  'We keep shipping features but retention is flat.',
];

// Long enough to notice the map settle, short enough not to nag.
const CHANGE_FLASH_MS = 4200;

export default function LogosPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [unlocked, setUnlocked] = useState(false);
  // Don't hang behind Clerk: if it never initializes (preview builds), fall
  // through to the key gate rather than showing nothing forever.
  const [authSettled, setAuthSettled] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState(false);

  const [sessions, setSessions] = useState<LogosSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  // Depth: how deeply Logos helps you think (global). Answer Guard: which
  // learning sessions the person has chosen to reveal the solution for.
  const [depth, setDepth] = useState<ThinkingDepth>('balanced');
  const [depthOpen, setDepthOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const router = useRouter();

  // ── Socria One ────────────────────────────────────────────────────
  const [plan, setPlan] = useState<Plan>('free');
  const [oneOpen, setOneOpen] = useState(false);
  const [oneReason, setOneReason] = useState<string | undefined>();
  // Research runs already spent, per session id.
  const [researchUsed, setResearchUsed] = useState<Record<string, number>>({});
  // Checkout is a redirect, so the button needs to show it's gone somewhere.
  const [oneBusy, setOneBusy] = useState(false);
  const [oneError, setOneError] = useState<string | null>(null);
  // The boundary note is dismissible — said once, not nagged.
  const [limitNoteOff, setLimitNoteOff] = useState(false);
  // The extraction wanted to add something and the free map was full.
  const [mapCapped, setMapCapped] = useState(false);
  // They have a Stripe customer behind them, so billing can be managed.
  const [oneManageable, setOneManageable] = useState(false);
  // Just came back from a completed checkout.
  const [oneWelcome, setOneWelcome] = useState(false);
  const one = plan === 'one';
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const [input, setInput] = useState('');
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the last extraction actually reorganized, so it can be seen happening.
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [deltaNote, setDeltaNote] = useState<string | null>(null);

  const [explore, setExplore] = useState<{
    key: string;
    mode: NodeMode;
    node: MapNodeRef | null;
    data: ExploreResult | null;
    loading: boolean;
    error: string | null;
    open: boolean;
  }>({ key: '', mode: 'explore', node: null, data: null, loading: false, error: null, open: false });
  const exploreSeq = useRef(0);
  const exploreCache = useRef<Map<string, ExploreResult>>(new Map());
  const [exploredIds, setExploredIds] = useState<Set<string>>(new Set());

  // "Add context" — grounding one node in real material. One panel at a time:
  // opening this closes the explore drawer and vice versa.
  const [ctxPanel, setCtxPanel] = useState<{ open: boolean; node: MapNodeRef | null }>({
    open: false,
    node: null,
  });
  const [connOpen, setConnOpen] = useState(false);
  // Bumped when a connection changes so the picker re-reads which sources are live.
  const [connEpoch, setConnEpoch] = useState(0);
  const [connBanner, setConnBanner] = useState<string | null>(null);

  // One thread per node, shared across all four modes — switching from Explore
  // to Challenge is a change of lens, not a new conversation.
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [focusStream, setFocusStream] = useState('');
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);

  // ── draft space ────────────────────────────────────────────────────
  // The third surface. Off by default: someone opening Logos for the first
  // time should meet a conversation, not a workspace.
  const [draftOpen, setDraftOpen] = useState(false);
  // Shown once, the first time someone gets through the gate.
  const [guideOpen, setGuideOpen] = useState(false);
  const [draftFocus, setDraftFocus] = useState<MapNodeRef | null>(null);
  const [relevant, setRelevant] = useState<Set<string>>(new Set());
  const [dr, setDr] = useState<{
    open: boolean;
    action: DraftAction;
    selection: string;
    data: DraftResponse | null;
    loading: boolean;
    error: string | null;
  }>({ open: false, action: 'clarify', selection: '', data: null, loading: false, error: null });
  const drSeq = useRef(0);
  const draftRef = useRef<DraftHandle>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const sessionsRef = useRef<LogosSession[]>([]);
  sessionsRef.current = sessions;
  const activeIdRef = useRef<string | null>(null);
  activeIdRef.current = activeId;

  // Everything said anywhere in this session, in the order it was said. The map
  // reads from this — thinking done inside a node is still thinking.
  const chronRef = useRef<Msg[]>([]);

  const cloud = !!isSignedIn;
  const active = useMemo(
    () => sessions.find((s) => s.id === activeId) ?? null,
    [sessions, activeId]
  );
  const messages = active?.messages ?? [];
  const map = active?.map ?? EMPTY_MAP;
  const draft = active?.draft ?? { title: '', html: '' };
  const contexts = active?.contexts ?? {};
  const contextsRef = useRef<Record<string, NodeContext[]>>({});
  contextsRef.current = contexts;
  const groundedCounts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const [id, list] of Object.entries(contexts)) if (list?.length) out[id] = list.length;
    return out;
  }, [contexts]);
  const mapRef = useRef<TMap>(EMPTY_MAP);
  mapRef.current = map;

  // The Answer Guard is one shared state: on only while LEARNING math and the
  // person hasn't chosen to reveal this session's solution. Every surface reads
  // the same signal, so Chat can't hide an answer that the map or board leaks.
  const guard: GuardSignal =
    map.context === 'math' && map.intent === 'learning'
      ? revealedIds.has(activeId ?? '')
        ? 'reveal'
        : 'guard'
      : '';
  const guarded = guard === 'guard';
  // async closures (refreshMap, sends) read the latest through refs
  const depthRef = useRef<ThinkingDepth>('balanced');
  depthRef.current = depth;
  const guardRef = useRef<GuardSignal>('');
  guardRef.current = guard;
  /** the two fields every Logos generation request carries */
  const guidance = () => ({ depth: depthRef.current, guard: guardRef.current });

  function pickDepth(next: ThinkingDepth) {
    // Free thinking happens at Balanced; the other registers are One's. The
    // routes clamp this too, so the menu and the answer always agree.
    if (!one && next !== 'balanced') {
      askOne('Quick, Deep and Abstract change how far Logos thinks with you. Socria One opens all four.');
      return;
    }
    setDepth(next);
    setDepthOpen(false);
    try {
      localStorage.setItem(DEPTH_KEY, next);
    } catch {}
  }

  // Logos is one of the models, so switching away from it is a navigation,
  // not a setting. Write the choice where the Core chat reads it, then go —
  // /chat picks it up on mount instead of opening on whatever was there last.
  function pickModel(next: SocriaModel) {
    setModelOpen(false);
    if (next === 'logos') return;
    try {
      localStorage.setItem(MODEL_KEY, next);
    } catch {}
    router.push(SOCRIA_MODELS[next].href ?? '/chat');
  }

  function reveal() {
    const id = activeIdRef.current;
    if (!id) return;
    setRevealedIds((prev) => {
      const n = new Set(prev).add(id);
      try {
        localStorage.setItem(REVEALED_KEY, JSON.stringify([...n]));
      } catch {}
      return n;
    });
    // guardRef updates on the next render, but the refresh below fires now —
    // set it explicitly so the re-extraction runs with the guard already lifted
    // (otherwise "Show solution" would refresh under the old, still-guarded state).
    guardRef.current = 'reveal';
    // let every surface re-generate now that the guard is lifted
    refreshMap();
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streaming]);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY_STORAGE) === '1') setUnlocked(true);
      const d = localStorage.getItem(DEPTH_KEY);
      if (d === 'quick' || d === 'balanced' || d === 'deep' || d === 'abstract') setDepth(d);
      const rev = JSON.parse(localStorage.getItem(REVEALED_KEY) || '[]');
      if (Array.isArray(rev)) setRevealedIds(new Set(rev.filter((x) => typeof x === 'string')));
      if (localStorage.getItem(ONE_KEY_STORAGE) === '1') setPlan('one');
      const spent = JSON.parse(localStorage.getItem(RESEARCH_KEY) || '{}');
      if (spent && typeof spent === 'object') setResearchUsed(spent);
    } catch {}
    const t = setTimeout(() => setAuthSettled(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Coming back from Stripe. The webhook may still be in flight when the
  // browser lands, so ask the server a few times before believing 'free' —
  // telling someone who has just paid that they haven't would be the worst
  // possible first second of a subscription.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const flag = params.get('one');
    if (!flag) {
      void syncPlan();
      return;
    }
    // Clean the query so a refresh doesn't replay this.
    window.history.replaceState({}, '', '/logos');
    if (flag !== 'welcome') return;

    setOneWelcome(true);
    let tries = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      await syncPlan();
      tries += 1;
      if (tries < 6) timer = setTimeout(poll, 1000 * tries);
    };
    void poll();
    return () => clearTimeout(timer);
    // syncPlan is stable enough for mount-only; re-running would restart polling
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (isLoaded) setAuthSettled(true);
  }, [isLoaded]);

  const hasAccess = unlocked || !!isSignedIn;

  useEffect(() => {
    if (!hasAccess) return;
    try {
      if (localStorage.getItem(GUIDE_SEEN_KEY) !== '1') setGuideOpen(true);
    } catch {}
  }, [hasAccess]);

  function closeGuide() {
    setGuideOpen(false);
    try {
      localStorage.setItem(GUIDE_SEEN_KEY, '1');
    } catch {}
  }

  // Returning from an OAuth consent screen: /logos?connect=ok|denied|error|signin
  useEffect(() => {
    let params: URLSearchParams;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return;
    }
    const c = params.get('connect');
    if (!c) return;
    const provider = params.get('provider') ?? 'that source';
    if (c === 'ok') {
      setConnBanner(`${provider === 'google' ? 'Google' : provider === 'notion' ? 'Notion' : provider} connected.`);
      setConnEpoch((n) => n + 1);
    } else if (c === 'denied') {
      setConnBanner('Connection cancelled — nothing was shared.');
    } else if (c === 'signin') {
      setConnBanner('Sign in first, then connect your accounts.');
      setConnOpen(true);
    } else if (c === 'error') {
      setConnBanner(params.get('msg') || 'That connection didn’t go through.');
      setConnOpen(true);
    }
    // Clean the URL so a refresh doesn't replay the banner.
    try {
      const url = new URL(window.location.href);
      ['connect', 'provider', 'msg'].forEach((k) => url.searchParams.delete(k));
      window.history.replaceState({}, '', url.pathname + url.search);
    } catch {}
    const t = setTimeout(() => setConnBanner(null), 6000);
    return () => clearTimeout(t);
  }, []);

  // Anonymous but key-unlocked callers identify with the header; signed-in
  // users are authorized by their session alone.
  const keyHeaders = useCallback(
    (): Record<string, string> => ({
      ...(unlocked && !isSignedIn ? { 'x-socria-key': CORE3_ACCESS_KEY } : {}),
      // What the client believes it holds. The routes check for themselves.
      ...(plan === 'one' ? { 'x-socria-one': SOCRIA_ONE_KEY } : {}),
    }),
    [unlocked, isSignedIn, plan]
  );

  /** Open the Socria One screen, saying which boundary they walked into. */
  const askOne = useCallback((reason?: string) => {
    setOneReason(reason);
    setOneOpen(true);
  }, []);

  /** What the server says we hold. Its answer replaces our local belief. */
  const syncPlan = useCallback(async () => {
    try {
      const res = await fetch('/api/logos/plan', { headers: keyHeaders() });
      if (!res.ok) return;
      const json = await res.json();
      if (json?.plan === 'one' || json?.plan === 'free') {
        setPlan(json.plan);
        try {
          if (json.plan === 'one') localStorage.setItem(ONE_KEY_STORAGE, '1');
          else localStorage.removeItem(ONE_KEY_STORAGE);
        } catch {}
      }
      setOneManageable(!!json?.manageable);
    } catch {
      // Offline or unconfigured — keep whatever we believed.
    }
  }, [keyHeaders]);

  /**
   * Take up Socria One.
   *
   * A typed access code unlocks locally (the soft gate Core 3.1 established,
   * for deployments with no billing). Everything else goes to Stripe Checkout,
   * and the entitlement only becomes real when the webhook says so — this
   * function never grants the plan to itself.
   */
  async function takeOne(typed: string): Promise<boolean> {
    if (typed) {
      if (!isValidOneKey(typed)) return false;
      setPlan('one');
      setOneOpen(false);
      try {
        localStorage.setItem(ONE_KEY_STORAGE, '1');
      } catch {}
      return true;
    }

    setOneBusy(true);
    setOneError(null);
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url;
        return true;
      }
      setOneError(
        json?.error ??
          'Could not start checkout. If this deployment has no billing configured, an access code still works.'
      );
    } catch {
      setOneError('Could not reach checkout.');
    }
    setOneBusy(false);
    return false;
  }

  /** Open Stripe's billing portal — cancelling is theirs, not a support ticket. */
  async function manageOne() {
    try {
      const res = await fetch('/api/stripe/portal', {
        method: 'POST',
        headers: keyHeaders(),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) window.location.href = json.url;
    } catch {}
  }

  // ── sessions ───────────────────────────────────────────────────────
  const applySessions = useCallback(
    (next: LogosSession[]) => {
      const sorted = sortSessions(next);
      sessionsRef.current = sorted;
      setSessions(sorted);
      if (!cloud) saveLocal(sorted);
    },
    [cloud]
  );

  const persist = useCallback(
    async (s: LogosSession) => {
      if (!cloud) {
        saveLocal(sessionsRef.current);
        return;
      }
      try {
        await fetch('/api/conversations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: { ...s, kind: 'logos' } }),
        });
      } catch {
        // A failed save must never interrupt thinking. The session stays in
        // memory and the next turn tries again.
      }
    },
    [cloud]
  );

  /** Update the active session and save it. */
  const patchActive = useCallback(
    (fn: (s: LogosSession) => LogosSession, save = true) => {
      const id = activeIdRef.current;
      if (!id) return;
      const current = sessionsRef.current.find((s) => s.id === id);
      if (!current) return;
      const updated = { ...fn(current), updatedAt: Date.now() };
      updated.title =
        updated.title && updated.title !== UNTITLED ? updated.title : titleFor(updated.messages);
      applySessions(sessionsRef.current.map((s) => (s.id === id ? updated : s)));
      if (save) void persist(updated);
    },
    [applySessions, persist]
  );

  // Load the session list once access resolves.
  useEffect(() => {
    if (!hasAccess || !authSettled) return;
    let cancelled = false;

    (async () => {
      let list: LogosSession[] = [];
      if (isSignedIn) {
        try {
          const res = await fetch('/api/conversations', { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            list = (json.conversations || [])
              .filter((c: any) => c.kind === 'logos')
              .map((c: any) => ({
                id: c.id,
                title: c.title,
                messages: Array.isArray(c.messages) ? c.messages : [],
                map: c.map?.nodes ? c.map : { ...EMPTY_MAP },
                draft:
                  c.draft && typeof c.draft.html === 'string'
                    ? { title: String(c.draft.title ?? ''), html: c.draft.html }
                    : undefined,
                contexts: sanitizeContexts(c.contexts),
                updatedAt: Number(c.updatedAt) || 0,
              }));
          }
        } catch {
          // Fall through to an empty list rather than blocking the page.
        }
      } else {
        list = loadLocal();
      }
      if (cancelled) return;

      // Deep-link from elsewhere in the app: /logos?s=<id>
      let wanted: string | null = null;
      try {
        wanted = new URLSearchParams(window.location.search).get('s');
      } catch {}

      if (list.length === 0) list = [emptySession()];
      const sorted = sortSessions(list);
      sessionsRef.current = sorted;
      setSessions(sorted);
      const target = (wanted && sorted.find((s) => s.id === wanted)?.id) || sorted[0].id;
      setActiveId(target);
      activeIdRef.current = target;
      chronRef.current = [...(sorted.find((s) => s.id === target)?.messages ?? [])];
      setHydrating(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [hasAccess, authSettled, isSignedIn]);

  function switchSession(id: string) {
    if (id === activeIdRef.current) return;
    setActiveId(id);
    activeIdRef.current = id;
    chronRef.current = [...(sessionsRef.current.find((s) => s.id === id)?.messages ?? [])];
    // Everything below is about one session's nodes — none of it carries over.
    exploreCache.current.clear();
    setExploredIds(new Set());
    setThreads({});
    setExplore((e) => ({ ...e, open: false, data: null, node: null }));
    setCtxPanel({ open: false, node: null });
    setChanged(new Set());
    setDeltaNote(null);
    // The boundary belongs to a map, not to the reader — a different line of
    // thinking gets its own room and its own notice.
    setMapCapped(false);
    setLimitNoteOff(false);
    setError(null);
    setStreaming('');
  }

  function newSession() {
    // A free reader keeps two lines of thinking. Both stay entirely usable —
    // it's starting a THIRD that One opens, and an empty unused session
    // doesn't count against them.
    if (!one) {
      const used = sessionsRef.current.filter((x) => x.messages.length > 0).length;
      if (used >= FREE_LIMITS.conversations) {
        askOne('You have both of your free lines of thinking open. Socria One keeps as many as you have.');
        return;
      }
    }
    const fresh = emptySession();
    applySessions([fresh, ...sessionsRef.current]);
    switchSession(fresh.id);
    // A brand-new empty session isn't worth a round trip until it has content.
  }

  async function deleteSession(id: string) {
    const remaining = sessionsRef.current.filter((s) => s.id !== id);
    const next = remaining.length ? remaining : [emptySession()];
    applySessions(next);
    if (activeIdRef.current === id) switchSession(next[0].id);
    if (cloud) {
      try {
        await fetch(`/api/conversations/${encodeURIComponent(id)}`, { method: 'DELETE' });
      } catch {}
    }
  }

  function submitKey() {
    if (!isValidAccessKey(keyInput.trim())) {
      setKeyError(true);
      return;
    }
    setKeyError(false);
    setUnlocked(true);
    try {
      localStorage.setItem(KEY_STORAGE, '1');
    } catch {}
  }

  // ── map ────────────────────────────────────────────────────────────
  function refreshMap(contextsOverride?: Record<string, NodeContext[]>) {
    const forSession = activeIdRef.current;
    setMapping(true);
    void (async () => {
      try {
        const res = await fetch('/api/logos/map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...keyHeaders() },
          body: JSON.stringify({
            messages: chronRef.current,
            map: mapRef.current,
            // contextsRef is only reassigned on render, so a just-attached
            // context isn't in it yet — callers that just changed grounding
            // pass the fresh map explicitly.
            contexts: contextsOverride ?? contextsRef.current,
            ...guidance(),
          }),
        });
        if (res.ok) {
          const json = await res.json();
          // A map that arrives after the reader has moved on belongs to a
          // different line of thinking — drop it rather than cross the wires.
          if (json?.map && activeIdRef.current === forSession) {
            const delta = diffMaps(mapRef.current, json.map);
            const liveIds = new Set(json.map.nodes.map((n: any) => n.id));
            patchActive((s) => {
              // A node the extractor merged or dropped takes its id with it;
              // grounding keyed on that id would linger invisibly. Only prune
              // when the map genuinely has nodes (never on an empty blip).
              let contexts = s.contexts ?? {};
              if (json.map.nodes.length) {
                const kept = Object.fromEntries(
                  Object.entries(contexts).filter(([id]) => liveIds.has(id))
                );
                if (Object.keys(kept).length !== Object.keys(contexts).length) contexts = kept;
              }
              return { ...s, map: json.map, contexts };
            });
            setChanged(new Set(delta.changed));
            setDeltaNote(summarizeDelta(delta));
            // The server says whether this line of thinking outgrew a free map.
            setMapCapped(!!json.capped);
          }
        }
      } catch {
        // The map is allowed to lag or skip a turn — never break the chat.
      } finally {
        setMapping(false);
      }
    })();
  }

  // Let the highlight fade on its own; a permanent marker stops meaning much.
  useEffect(() => {
    if (!changed.size && !deltaNote) return;
    const t = setTimeout(() => {
      setChanged(new Set());
      setDeltaNote(null);
    }, CHANGE_FLASH_MS);
    return () => clearTimeout(t);
  }, [changed, deltaNote]);

  // ── draft ──────────────────────────────────────────────────────────
  // Writing is saved on a timer rather than per keystroke: a network round
  // trip per character would be absurd, and losing a sentence would be worse.
  const draftSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  function patchDraft(next: { title?: string; html?: string }) {
    patchActive(
      (s) => ({ ...s, draft: { ...(s.draft ?? { title: '', html: '' }), ...next } }),
      false
    );
    if (draftSave.current) clearTimeout(draftSave.current);
    draftSave.current = setTimeout(() => {
      const id = activeIdRef.current;
      const s = sessionsRef.current.find((x) => x.id === id);
      if (s) void persist(s);
    }, 1200);
  }

  // Save whatever is unsaved before the tab goes away.
  useEffect(() => {
    const flush = () => {
      if (!draftSave.current) return;
      clearTimeout(draftSave.current);
      draftSave.current = null;
      const s = sessionsRef.current.find((x) => x.id === activeIdRef.current);
      if (s) void persist(s);
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [persist]);

  /** The map softly lights whatever the passage being written touches. */
  function onDraftSelect(sel: DraftSelection | null) {
    const passage = sel?.text.trim() || sel?.around || '';
    setRelevant(new Set(passage ? relevantNodes(mapRef.current, passage) : []));
  }

  async function runDraftAction(action: DraftAction, sel: DraftSelection) {
    const seq = ++drSeq.current;
    setDr({ open: true, action, selection: sel.text, data: null, loading: true, error: null });
    try {
      const res = await fetch('/api/logos/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          action,
          selection: sel.text,
          around: sel.around,
          map: mapRef.current,
          ...guidance(),
        }),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b.error || 'Could not work with that passage.');
      }
      const json = await res.json();
      if (seq !== drSeq.current) return;
      const result: DraftResponse | null = json?.result ?? null;
      setDr((d) => ({ ...d, data: result, loading: false }));
      // Trace lights the reasoning the passage actually rests on.
      if (result?.action === 'trace') setRelevant(new Set(result.nodeIds ?? []));
    } catch (e: any) {
      if (seq !== drSeq.current) return;
      setDr((d) => ({ ...d, loading: false, error: e?.message || 'Something went wrong.' }));
    }
  }

  // ── grounding a node in real material ──────────────────────────────
  function openAddContext(node: MapNodeRef) {
    setExplore((e) => ({ ...e, open: false }));
    setCtxPanel({ open: true, node });
  }

  // Anything an action generated for this node was composed under the old
  // grounding, so drop it when the grounding changes.
  function dropExploreCacheForNode(nodeId: string) {
    for (const key of Array.from(exploreCache.current.keys())) {
      if (key.split('::')[1] === nodeId) exploreCache.current.delete(key);
    }
  }

  function attachContext(nodeId: string, ctx: NodeContext) {
    const all = { ...(contextsRef.current ?? {}) };
    all[nodeId] = [...(all[nodeId] ?? []), ctx].slice(0, MAX_CONTEXTS_PER_NODE);
    patchActive((s) => ({ ...s, contexts: all }));
    dropExploreCacheForNode(nodeId);
    // The extractor should see the new grounding — it may sharpen the node.
    refreshMap(all);
  }

  function removeContext(nodeId: string, ctxId: string) {
    const all = { ...(contextsRef.current ?? {}) };
    all[nodeId] = (all[nodeId] ?? []).filter((c) => c.id !== ctxId);
    if (!all[nodeId].length) delete all[nodeId];
    patchActive((s) => ({ ...s, contexts: all }));
    dropExploreCacheForNode(nodeId);
    refreshMap(all);
  }

  function setContextOrigin(nodeId: string, ctxId: string, origin: AttachmentOrigin) {
    const all = { ...(contextsRef.current ?? {}) };
    all[nodeId] = (all[nodeId] ?? []).map((c) => (c.id === ctxId ? { ...c, origin } : c));
    patchActive((s) => ({ ...s, contexts: all }));
    // Whose-thinking-it-is changes what every action would say about it.
    dropExploreCacheForNode(nodeId);
    refreshMap(all);
  }

  // ── acting on a node ───────────────────────────────────────────────
  /** The free map is full: new thinking will no longer be added to it. */
  const atMapBoundary = !one && meaningfulNodes(map) >= FREE_LIMITS.mapNodes;

  /** Research runs already spent in the conversation on screen. */
  const researchSpent = researchUsed[activeId ?? ''] ?? 0;
  /** Research is the only node action a free reader can run out of. */
  const researchLocked = !one && researchSpent >= FREE_LIMITS.research;

  async function runAction(mode: NodeMode, node: MapNodeRef) {
    // Explore, Challenge and Trace stay open at every tier — Trace especially,
    // since seeing where your own thinking came from is not a feature to sell.
    // Research is the one that has a free edge, and only on the second reach.
    if (mode === 'research' && researchLocked) {
      askOne('You have seen what Research does. Socria One takes any node on the map out to the evidence, as often as the thinking needs.');
      return;
    }
    // Generated once per node per mode, then reused — reopening is instant and
    // costs nothing. Keyed on the label too, so a node the map rewords is
    // treated as a different idea and looked up again.
    const groundingMark = (contextsRef.current[node.id] ?? [])
      .map((c) => `${c.id}:${c.origin}`)
      .join(',');
    const cacheKey = `${mode}::${node.id}::${node.label}::${groundingMark}`;
    setCtxPanel((c) => ({ ...c, open: false }));
    setFocusStream('');
    setFocusError(null);

    const cached = exploreCache.current.get(cacheKey);
    if (cached) {
      exploreSeq.current++; // cancel anything still in flight
      setExplore({ key: cacheKey, mode, node, data: cached, loading: false, error: null, open: true });
      return;
    }

    const seq = ++exploreSeq.current;
    // Spend the run only when we actually go and look — a cached result
    // reopened costs nothing and shouldn't count against them.
    if (mode === 'research' && !one) {
      const sid = activeIdRef.current ?? '';
      setResearchUsed((prev) => {
        const next = { ...prev, [sid]: (prev[sid] ?? 0) + 1 };
        try {
          localStorage.setItem(RESEARCH_KEY, JSON.stringify(next));
        } catch {}
        return next;
      });
    }
    setExplore({ key: cacheKey, mode, node, data: null, loading: true, error: null, open: true });
    try {
      const res = await fetch('/api/logos/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          mode,
          label: node.label,
          type: node.type,
          nodeId: node.id,
          messages,
          map: mode === 'trace' ? map : undefined,
          contexts: contextsRef.current[node.id] ?? [],
          researchUsed: researchSpent,
          ...guidance(),
        }),
      });
      if (!res.ok) throw new Error('Could not look that up right now.');
      const json = await res.json();
      // A newer click may have landed while this was in flight.
      if (seq !== exploreSeq.current) return;
      const result: ExploreResult | null = json?.explore ?? null;
      if (result) {
        exploreCache.current.set(cacheKey, result);
        setExploredIds((prev) => new Set(prev).add(node.id));
      }
      setExplore((e) => ({ ...e, data: result, loading: false }));
    } catch (err: any) {
      if (seq !== exploreSeq.current) return;
      setExplore((e) => ({
        ...e,
        loading: false,
        error: err?.message || 'Could not look that up right now.',
      }));
    }
  }

  // ── conversation ───────────────────────────────────────────────────
  // A turn inside an opened node. Same model, narrower aperture: it sees the
  // main conversation for context, then this node's own thread.
  async function sendFocused(text: string) {
    const content = text.trim();
    const node = explore.node;
    if (!content || focusBusy || !node) return;
    const key = `${node.id}::${node.label}`;

    setFocusError(null);
    const prior = threads[key] ?? [];
    const nextThread: Msg[] = [...prior, { role: 'user', content }];
    setThreads((t) => ({ ...t, [key]: nextThread }));
    setFocusBusy(true);
    setFocusStream('');

    // Reasoning done here is still reasoning — it belongs in the map. Marked
    // so the extractor knows which node the person was looking at.
    const marked: Msg = { role: 'user', content: `[on “${node.label}”] ${content}` };
    chronRef.current = [...chronRef.current, marked];
    refreshMap();

    const payload = [...messages.slice(-8), ...nextThread];

    try {
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          messages: payload,
          focus: {
            label: node.label,
            type: node.type,
            concept: explore.data?.concept,
            framing: explore.data?.framing,
            contexts: contextsRef.current[node.id] ?? [],
          },
          ...guidance(),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong.');
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setFocusStream(acc);
        }
      }
      setFocusStream('');
      setThreads((t) => ({ ...t, [key]: [...nextThread, { role: 'assistant', content: acc }] }));
      chronRef.current = [...chronRef.current, { role: 'assistant', content: acc }];
    } catch (e: any) {
      setFocusStream('');
      setFocusError(e?.message || 'Something went wrong.');
      setThreads((t) => ({ ...t, [key]: prior }));
      chronRef.current = chronRef.current.filter((m) => m !== marked);
    } finally {
      setFocusBusy(false);
    }
  }

  /** Hand off an image for its one-time reading. */
  const readImage = useCallback(
    async (dataUrl: string): Promise<string> => {
      const res = await fetch('/api/logos/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({ image: dataUrl }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'could not be read');
      }
      const json = await res.json();
      if (!json?.reading) throw new Error('could not be read');
      return json.reading as string;
    },
    [keyHeaders]
  );

  function sendFromComposer() {
    // Anything still being read, or that failed, is left behind rather than
    // sent as a silent blank.
    const ready: Attachment[] = drafts
      .filter((d) => d.status === 'ready')
      .map(({ id, status, error: _e, ...rest }) => rest);
    setDrafts([]);
    void send(input, ready);
  }

  async function send(text: string, atts: Attachment[] = []) {
    const content = text.trim();
    if ((!content && !atts.length) || busy || !activeIdRef.current) return;
    setError(null);
    setInput('');

    const turn: Msg = {
      role: 'user',
      content,
      ...(atts.length ? { attachments: atts } : {}),
    };
    const before = messages;
    const next = [...before, turn];
    patchActive((s) => ({ ...s, messages: next }), false);
    chronRef.current = [...chronRef.current, turn];
    setBusy(true);
    setStreaming('');

    // Independent pass: rebuild the map from everything said so far.
    refreshMap();

    // Conversational reply.
    try {
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({ messages: next, ...guidance() }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong.');
      }
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreaming(acc);
        }
      }
      setStreaming('');
      patchActive((s) => ({ ...s, messages: [...next, { role: 'assistant', content: acc }] }));
      chronRef.current = [...chronRef.current, { role: 'assistant', content: acc }];
    } catch (e: any) {
      setStreaming('');
      setError(e?.message || 'Something went wrong.');
      patchActive((s) => ({ ...s, messages: before }), false);
      // Drop the turn that never landed, by identity — a focused reply may
      // have appended to the transcript while this was in flight.
      chronRef.current = chronRef.current.filter((m) => m !== turn);
      setInput(content);
      // Hand the attachments back so a failed turn doesn't lose them.
      if (atts.length) {
        setDrafts((prev) => [
          ...prev,
          ...atts.map((a, i) => ({ ...a, id: `re_${Date.now()}_${i}`, status: 'ready' as const })),
        ]);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!hasAccess) {
    return (
      <div className="logos-root">
        <div className="lg-gate">
          {authSettled && (
            <div className="lg-gate-card">
              <span className="lg-word">
                <LogosMark size={44} />
                <span className="lg-sr">Logos</span>
              </span>
              <h1>A reasoning environment.</h1>
              <p>
                An early prototype: you think out loud, and the shape of your
                reasoning is drawn beside you as you talk.
              </p>
              <div className="lg-gate-row">
                <input
                  type="text"
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="Access key"
                  value={keyInput}
                  onChange={(e) => {
                    setKeyInput(e.target.value);
                    if (keyError) setKeyError(false);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitKey();
                    }
                  }}
                  className={keyError ? 'is-error' : undefined}
                  aria-invalid={keyError}
                  aria-label="Access key"
                />
                <button type="button" onClick={submitKey}>
                  Enter
                </button>
              </div>
              {keyError && (
                <span className="lg-gate-error" role="alert">
                  That key isn&rsquo;t right.
                </span>
              )}
              <p className="lg-gate-fine">
                Signed-in Socria accounts have access automatically.
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="logos-root">
      <LogosGuide open={guideOpen} onClose={closeGuide} />
      <SocriaOneModal
        open={oneOpen}
        onClose={() => setOneOpen(false)}
        onUnlock={takeOne}
        reason={oneReason}
        busy={oneBusy}
        error={oneError}
      />

      <ConnectionsModal
        open={connOpen}
        authHeaders={keyHeaders}
        onClose={() => setConnOpen(false)}
        onChanged={() => setConnEpoch((n) => n + 1)}
      />
      {connBanner && (
        <div className="lg-conn-banner" role="status">
          {connBanner}
        </div>
      )}
      <div
        className={`lg-split${railOpen ? '' : ' rail-closed'}${draftOpen ? ' draft-open' : ''}`}
      >
        <LogosRail
          sessions={sessions}
          activeId={activeId}
          open={railOpen}
          syncing={hydrating}
          cloud={cloud}
          onSelect={switchSession}
          onNew={newSession}
          onDelete={deleteSession}
          onToggle={() => setRailOpen((v) => !v)}
        />

        {/* ── Conversation ───────────────────────────────── */}
        <section className="lg-convo" aria-label="Conversation">
          <header className="lg-head">
            <span className="lg-word">
              <LogosMark size={26} />
              <span className="lg-sr">Logos</span>
            </span>
            <span className="lg-head-note">A reasoning environment</span>
            <button
              type="button"
              className="lg-guide-open"
              onClick={() => setGuideOpen(true)}
              aria-label="What Logos does"
              title="What Logos does"
            >
              ?
            </button>
            <button
              type="button"
              className="lg-conn-open"
              onClick={() =>
                one
                  ? setConnOpen(true)
                  : askOne('Socria One reads your own material — Drive, Docs, Notion and pasted work — into the thinking rather than around it.')
              }
              aria-label="Connections"
              title={one ? 'Connect Google, Notion, and more' : 'Connected sources are part of Socria One'}
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M9 11a4 4 0 0 1 0-5l1-1a4 4 0 0 1 6 6l-1 1" />
                <path d="M15 13a4 4 0 0 1 0 5l-1 1a4 4 0 0 1-6-6l1-1" />
              </svg>
            </button>
            {/* Deep ceiling, quiet door. It nudges only once the thinking
                has actually turned into something worth writing. */}
            <button
              type="button"
              className={`lg-draft-open${
                !draftOpen && (map.context === 'writing' || map.context === 'creating')
                  ? ' is-nudged'
                  : ''
              }${draftOpen ? ' is-on' : ''}`}
              onClick={() =>
                one
                  ? setDraftOpen((v) => !v)
                  : askOne('Draft Space lets you write beside your map with the reasoning still in view. It is part of Socria One.')
              }
            >
              Draft
              {!one && <OneLock className="lg-draft-lock" />}
            </button>
            <a href="/chat" className="lg-back">
              Socria chat <span aria-hidden="true">→</span>
            </a>
          </header>

          <div className="lg-thread">
            {messages.length === 0 && !streaming && (
              <div className="lg-intro">
                <h1>Think out loud.</h1>
                <p>
                  Logos won’t hand you an answer. It listens, asks, and draws
                  the shape of your reasoning beside you as you talk.
                </p>
                <div className="lg-starters">
                  {STARTERS.map((s) => (
                    <button key={s} type="button" onClick={() => send(s)}>
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`lg-msg lg-msg-${m.role}`}>
                {m.role === 'assistant' && <span className="lg-msg-who">Logos</span>}
                <div className="lg-msg-stack">
                  {!!m.attachments?.length && <AttachmentList items={m.attachments} />}
                  {m.content && (
                    <div className="lg-msg-body">
                      <MathText>{m.content}</MathText>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {streaming && (
              <div className="lg-msg lg-msg-assistant">
                <span className="lg-msg-who">Logos</span>
                <div className="lg-msg-body">
                  <MathText>{streaming}</MathText>
                </div>
              </div>
            )}

            {busy && !streaming && (
              <div className="lg-msg lg-msg-assistant">
                <span className="lg-msg-who">Logos</span>
                <div className="lg-thinking" aria-label="Thinking">
                  <span /> <span /> <span />
                </div>
              </div>
            )}

            {error && <p className="lg-error">{error}</p>}
            <div ref={bottomRef} />
          </div>

          {/* Answer Guard: while learning math, Logos gives hints, not
              answers — but never traps you. You can ask for another hint or
              deliberately reveal the whole solution. */}
          {guarded && (
            <div className="lg-guard" role="note">
              <span className="lg-guard-dot" aria-hidden="true" />
              <span className="lg-guard-text">
                Guiding, not solving — you&rsquo;re working this one out.
              </span>
              <button
                type="button"
                className="lg-guard-hint"
                disabled={busy}
                onClick={() => send('Can I have another hint?')}
              >
                Another hint
              </button>
              <button type="button" className="lg-guard-reveal" onClick={reveal}>
                Show solution
              </button>
            </div>
          )}

          {/* Just back from checkout. Says the one thing worth saying and
              then goes away — nobody needs a receipt read aloud. */}
          {oneWelcome && (
            <div className="lg-one-note" role="status">
              <span className="lg-one-note-text">
                {one ? (
                  <>
                    <b>Socria One is open.</b> Your maps grow as far as the thinking
                    does, every lens and depth is yours, and Research runs the whole map.
                  </>
                ) : (
                  <>
                    <b>Thank you — setting up your subscription.</b> This takes a moment;
                    the environment opens as soon as Stripe confirms.
                  </>
                )}
              </span>
              <button
                type="button"
                className="lg-one-note-x"
                onClick={() => setOneWelcome(false)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* The free map has grown as far as it goes. Said plainly, once,
              and dismissible — the map itself stays exactly as it is. */}
          {!one && !limitNoteOff && atMapBoundary && (
            <div className="lg-one-note" role="note">
              <span className="lg-one-note-text">
                <b>Your free Thinking Map has reached its limit.</b> Everything here
                stays open — Socria One lets it keep growing with your thinking.
              </span>
              <button
                type="button"
                className="lg-one-note-go"
                onClick={() =>
                  askOne('This line of thinking has more in it than a free map holds. Socria One lets the map keep growing.')
                }
              >
                Socria One
              </button>
              <button
                type="button"
                className="lg-one-note-x"
                onClick={() => setLimitNoteOff(true)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          <LogosComposer
            value={input}
            onChange={setInput}
            drafts={drafts}
            setDrafts={setDrafts}
            onSend={sendFromComposer}
            busy={busy}
            readImage={readImage}
          />

          {/* Which mind you're talking to, and how deep it goes — kept beside
              the box you type in rather than parked up in the header. Both
              menus open upward; they sit at the bottom of the screen. */}
          <div className="lg-tools">
            {one && oneManageable && (
              <button
                type="button"
                className="lg-one-chip"
                onClick={manageOne}
                title="Manage your Socria One subscription"
              >
                Socria One
              </button>
            )}
            <div className="lg-depth">
              <button
                type="button"
                className="lg-depth-btn"
                onClick={() => setDepthOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={depthOpen}
                title="Thinking depth — how deeply Logos helps you think"
              >
                {THINKING_DEPTHS.find((d) => d.id === depth)!.label}
                <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {depthOpen && (
                <>
                  <div className="lg-depth-scrim" onClick={() => setDepthOpen(false)} />
                  <div className="lg-depth-menu is-up is-right" role="listbox">
                    {THINKING_DEPTHS.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        role="option"
                        aria-selected={depth === d.id}
                        className={`lg-depth-opt${depth === d.id ? ' is-on' : ''}`}
                        onClick={() => pickDepth(d.id)}
                      >
                        <span className="lg-depth-opt-label">
                          {d.label}
                          {!one && d.id !== 'balanced' && <OneLock />}
                        </span>
                        <span className="lg-depth-opt-desc">{d.description}</span>
                      </button>
                    ))}
                    <p className="lg-depth-foot">Depth changes how deeply Logos helps you think — never how quickly it gives answers.</p>
                  </div>
                </>
              )}
            </div>

            {/* Logos is itself one of the models, so this is the same switch
                the Core chat carries — picking another one navigates there. */}
            <div className="lg-model">
              <button
                type="button"
                className="lg-model-btn"
                onClick={() => setModelOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={modelOpen}
                title="Which Socria you're thinking with"
              >
                <ModelGlyph model="logos" size={14} />
                <span className="lg-model-name">{SOCRIA_MODELS.logos.short}</span>
                <svg viewBox="0 0 24 24" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
              {modelOpen && (
                <>
                  <div className="lg-depth-scrim" onClick={() => setModelOpen(false)} />
                  <div className="lg-depth-menu is-up is-right" role="listbox">
                    {(Object.keys(SOCRIA_MODELS) as SocriaModel[]).map((id) => {
                      const m = SOCRIA_MODELS[id];
                      const on = id === 'logos';
                      return (
                        <button
                          key={id}
                          type="button"
                          role="option"
                          aria-selected={on}
                          className={`lg-depth-opt${on ? ' is-on' : ''}`}
                          onClick={() => pickModel(id)}
                        >
                          <span className="lg-depth-opt-label">
                            <ModelGlyph model={id} size={14} />
                            {m.short}
                            {!on && <span className="lg-model-go" aria-hidden="true"> →</span>}
                          </span>
                          <span className="lg-depth-opt-desc">{m.description}</span>
                        </button>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>

        {/* ── Thinking Map ───────────────────────────────── */}
        <section className="lg-panel" aria-label="Thinking map">
          <header className="lg-panel-head">
            <span className="lg-panel-title">
              Thinking Map
              {/* What kind of thinking this turned out to be — read from the
                  conversation, never chosen from a menu. */}
              {map.context && <em className="lg-panel-context">{CONTEXT_LABEL[map.context]}</em>}
            </span>
            {deltaNote && !mapping ? (
              <span className="lg-panel-delta">{deltaNote}</span>
            ) : (
              <span className={`lg-panel-state${mapping ? ' is-working' : ''}`}>
                {mapping
                  ? 'reading'
                  : map.nodes.length
                    ? `${map.nodes.length} node${map.nodes.length === 1 ? '' : 's'}`
                    : 'empty'}
              </span>
            )}
          </header>
          <ThinkingMap
            map={map}
            onAction={runAction}
            lensesLocked={!one}
            onLocked={() =>
              askOne('Structure, Board and the other lenses read the same reasoning different ways. Socria One opens them.')
            }
            researchLocked={researchLocked}
            explored={exploredIds}
            changed={changed}
            relevant={relevant}
            canFocus={draftOpen}
            onFocus={(node) => setDraftFocus(node)}
            grounded={groundedCounts}
            onAddContext={openAddContext}
            guarded={guarded}
          />
          <ExplorePanel
            open={explore.open}
            mode={explore.mode}
            loading={explore.loading}
            error={explore.error}
            node={explore.node}
            data={explore.data}
            lineage={explore.node ? describeLineage(map, explore.node.id) : []}
            thread={
              explore.node ? (threads[`${explore.node.id}::${explore.node.label}`] ?? []) : []
            }
            streaming={focusStream}
            busy={focusBusy}
            threadError={focusError}
            onSend={sendFocused}
            onMode={(m) => explore.node && runAction(m, explore.node)}
            onClose={() => setExplore((e) => ({ ...e, open: false }))}
          />
          <ContextPanel
            open={ctxPanel.open}
            node={ctxPanel.node}
            attached={ctxPanel.node ? (contexts[ctxPanel.node.id] ?? []) : []}
            authHeaders={keyHeaders}
            readImage={readImage}
            onAttach={attachContext}
            onRemove={removeContext}
            onOrigin={setContextOrigin}
            reloadKey={connEpoch}
            onConnect={() => setConnOpen(true)}
            onClose={() => setCtxPanel((c) => ({ ...c, open: false }))}
          />
        </section>

        {/* ── Draft ──────────────────────────────────────── */}
        {draftOpen && (
          <div className="lg-draft-col">
            <DraftSpace
              ref={draftRef}
              html={draft.html}
              onChange={(html) => patchDraft({ html })}
              title={draft.title}
              onTitle={(title) => patchDraft({ title })}
              focus={
                draftFocus
                  ? { ...draftFocus, lineage: describeLineage(map, draftFocus.id) }
                  : null
              }
              onClearFocus={() => setDraftFocus(null)}
              onSelect={onDraftSelect}
              onAction={runDraftAction}
              busy={dr.loading}
              onClose={() => setDraftOpen(false)}
            />
            <DraftResponsePanel
              open={dr.open}
              loading={dr.loading}
              error={dr.error}
              action={dr.action}
              selection={dr.selection}
              data={dr.data}
              onApply={(text) => {
                draftRef.current?.applyProposal(text);
                setDr((d) => ({ ...d, open: false }));
              }}
              onClose={() => setDr((d) => ({ ...d, open: false }))}
            />
          </div>
        )}
      </div>
    </div>
  );
}
