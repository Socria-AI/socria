'use client';

// Logos — sessions on the left, conversation in the middle, live Thinking Map
// on the right.
//
// This is the Logos EXPERIENCE, rendered by /chat whenever the Logos model is
// selected — the model switcher swaps it in place rather than navigating. The
// /logos route is the page that explains Logos to people who don't have it yet.
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
import { OnePrompt } from '@/components/OnePrompt';
import { useOnePrompt } from '@/components/useOnePrompt';
import { reasonForCounter } from '@/lib/one-prompt';
import { track } from '@/lib/analytics';
import { authUrl } from '@/lib/auth-links';
import { isSource } from '@/lib/checkout-attribution';
import { nthBucket } from '@/lib/analytics';
import {
  FIRST_MAP_KEY,
  FIRST_MAP_NOTE,
  OPENINGS,
  OPENING_LEAD,
  firstMapCrossed,
  openingValue,
  readStart,
  startMessage,
} from '@/lib/first-session';
import { exportMapPng } from '@/components/MapPoster';
import { JourneyDebugModal } from '@/components/JourneyDebugModal';
import { sanitizeUserUnderstanding, type UserUnderstanding } from '@/lib/socria-prompt';
import { OneLock } from '@/components/OneLock';
import {
  FREE_DEPTH,
  SOCRIA_ONE_KEY,
  isValidOneKey,
  meaningfulNodes,
  type OneFeature,
  type Plan,
} from '@/lib/socria-one';
import { MathText } from '@/components/TeX';
import { Inline, RichText } from '@/components/RichText';
import {
  SOCRIA_MODELS,
  THINKING_DEPTHS,
  type SocriaModel,
  type ThinkingDepth,
} from '@/lib/socria-prompt';
import type { GuardSignal } from '@/lib/logos-guidance';
import { MAX_STYLE } from '@/lib/logos-style';
import {
  DEFAULT_PERSONALITY,
  PERSONALITY_DIMENSIONS,
  isDefaultPersonality,
  sanitizePersonality,
  type Personality,
} from '@/lib/logos-personality';
import { lastCoreModel, rememberModel } from '@/lib/socria-model-store';
import { buildStarters, PENDING_TYPES } from '@/lib/starters';
import { billingError, billingLine } from '@/lib/billing-message';
import { PersonalityDial } from '@/components/PersonalityDial';
import { ContextPanel } from '@/components/ContextPanel';
import { ConnectionsModal } from '@/components/ConnectionsModal';
import type { Attachment, AttachmentOrigin } from '@/lib/logos-attachments';
import { MAX_CONTEXTS_PER_NODE, sanitizeContexts, type NodeContext } from '@/lib/logos-sources';
import { relevantNodes, type DraftAction, type DraftResponse } from '@/lib/logos-draft';
import { boundaryNote, limitsFor, type Counter } from '@/lib/entitlements';
import { DRIFT_DISMISS_LIMIT, readDrift, type DriftVerdict } from '@/lib/topic-drift';
import {
  MATH_FADE_MS,
  readMathSignal,
  readMathTopic,
  shouldShowMath,
} from '@/lib/math-context';
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
const REVEALED_KEY = 'socria.logos.revealed.v1';
/** How often this person has told us a topic change was intentional. */
const DRIFT_KEY = 'socria.logos.driftDismissals.v1';
/** a checkout interrupted by sign-in, with the trigger that led to it */
const CHECKOUT_RESUME_KEY = 'socria.checkout.resume.v1';
/** the attribution of the last checkout opened from this browser */
const CHECKOUT_LAST_KEY = 'socria.checkout.last.v1';
/** which email link brought them here, if one did — its kind only */
const VIA_KEY = 'socria.via.v1';
/** the checkout session already counted as a subscription from this tab */
const WELCOMED_KEY = 'socria.one.welcomed.v1';
/** journey passes happen this often, in the person's turns — the same cadence as Core */
const JOURNEY_EVERY_TURNS = 4;

/**
 * A first message chosen elsewhere, waiting for the composer.
 *
 * Module-level on purpose. The mount effect that reads `?start=` also strips
 * it from the URL, and React can throw that first tree away and mount a
 * fresh one (a hydration mismatch does it; StrictMode does it in
 * development) — a second instance would then read a URL with nothing in
 * it. Held here, the message survives the remount and is applied once the
 * session list has hydrated, which is also the only point at which "open a
 * fresh session for it" can be decided.
 */
let pendingStart: { id: string; message: string } | null = null;

/** The email kind that brought them here, if one did. */
function readVia(): string | undefined {
  try {
    return sessionStorage.getItem(VIA_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}
// Custom instructions — how Socria should work with this person. The key is
// product-wide by design so other surfaces can adopt it; today Logos is the
// one that reads it.
const STYLE_KEY = 'socria.style.v1';
const PERSONALITY_KEY = 'socria.personality.v1';
// The chat can update the standing instructions itself: when the person asks
// Socria to REMEMBER a way of working, the model ends its reply with this
// machine-read line, which the client strips and applies.
const REMEMBER_MARK = '[[REMEMBER]]';
// Socria One, held client-side the way the Core 3 key already is. The routes
// re-decide this for themselves; nothing here is the authority.
const ONE_KEY_STORAGE = 'socria.one.v1';

// The research counter used to live in localStorage and be posted with each
// request, which made the browser the authority on its own limit. It is on
// the server now; see lib/usage.ts.
// Connected sources (Drive/Docs/Calendar/Gmail/Notion) are dormant: Google's
// restricted scopes can't be published publicly without a paid security
// assessment, so rather than gate Socria behind a test-user list, the door is
// hidden. The server decides for itself (lib/logos-connect.ts connectorsEnabled);
// this only governs whether the UI offers it. Set NEXT_PUBLIC_SOCRIA_CONNECTORS=on
// alongside SOCRIA_CONNECTORS=on to bring it back.
const CONNECTORS_ON = process.env.NEXT_PUBLIC_SOCRIA_CONNECTORS === 'on';

// Shown to someone with no lines of thinking yet; afterwards they top up the
// ones drawn from what they have actually been working through.
// Written to look like something a person would actually type into an empty
// box: direct, a bit under-specified, no shape to them. The set they replace
// was three well-made sentences — one of which invited you to deliberate
// about whether to build the product you were sitting inside — and a
// placeholder that reads better than real input is a placeholder nobody
// believes.
const STARTERS = [
  'I have two job offers and I keep going back and forth.',
  'Help me work out if this idea is any good.',
  'We keep shipping features but retention is flat.',
];

// Long enough to notice the map settle, short enough not to nag.
const CHANGE_FLASH_MS = 4200;

export function LogosApp({
  // Set by /chat, which renders this component. Switching model there is a
  // state change, not a navigation — see switchTo.
  onSwitchModel,
}: {
  onSwitchModel?: (next: SocriaModel) => void;
} = {}) {
  const { isLoaded, isSignedIn } = useUser();
  const [unlocked, setUnlocked] = useState(false);
  // Don't hang behind Clerk: if it never initializes (preview builds), fall
  // through to the key gate rather than showing nothing forever.
  const [authSettled, setAuthSettled] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyOpen, setKeyOpen] = useState(false);
  const [keyError, setKeyError] = useState(false);

  const [sessions, setSessions] = useState<LogosSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  // On a phone there is room for one surface at a time: the conversation by
  // default, the map when asked. Desktop ignores this entirely.
  const [mobileView, setMobileView] = useState<'chat' | 'map'>('chat');
  // "How should Socria work with you?" — their standing instructions.
  const [styleText, setStyleText] = useState('');
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleDraftText, setStyleDraftText] = useState('');
  // Socria Personality — the structured registers, above the free text.
  const [persona, setPersona] = useState<Personality>(DEFAULT_PERSONALITY);
  const [personaDraft, setPersonaDraft] = useState<Personality>(DEFAULT_PERSONALITY);
  // A quiet line under the composer when the chat updated the instructions.
  const [styleUpdatedNote, setStyleUpdatedNote] = useState(false);
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
  // What has actually been spent, as the SERVER counts it. The client used
  // to keep this itself and post it with each request, which meant the
  // browser was the authority on its own limits; now it only draws them.
  const [usage, setUsage] = useState<Record<string, { used: number; limit: number | null }>>({});
  // Checkout is a redirect, so the button needs to show it's gone somewhere.
  const [oneBusy, setOneBusy] = useState(false);
  const [oneError, setOneError] = useState<string | null>(null);
  /** Completed assistant turns this mount — the proactive prompt's only cue. */
  const [landedTurns, setLandedTurns] = useState(0);
  /**
   * The map on screen just took a shape — crossed the first-map threshold in
   * a fresh extraction in THIS tab. Read once by the landed-turn effect and
   * cleared; never set by hydrating a saved session.
   */
  const shapedRef = useRef(false);
  /** whether a reply is in flight right now, readable from the extraction handler */
  const inFlightRef = useRef(false);
  /** sessions that have had at least one extraction in this tab */
  const extractedRef = useRef<Set<string>>(new Set());
  /** the person's first map just took a shape: the share moment owns the screen */
  const [firstMapNote, setFirstMapNote] = useState(false);
  const shareNoteRef = useRef(false);
  /** which opening or scenario this tab began from, for the activation event */
  const startIdRef = useRef<string | null>(null);
  /** where the sign-in gate should bring them back to — set on mount, so the query survives */
  const [gateHref, setGateHref] = useState('/sign-in?redirect_url=%2Fchat%3Fmodel%3Dlogos');
  /** what Socria knows about this person, for the prompt and the viewer (accounts only) */
  const [understanding, setUnderstanding] = useState<UserUnderstanding | null>(null);
  const understandingRef = useRef<UserUnderstanding | null>(null);
  understandingRef.current = understanding;
  /** sessions in which the recurrence line has already been injected once */
  const recurrenceSaidRef = useRef<Set<string>>(new Set());
  /** attribution stashed across a sign-in, so a resumed checkout keeps its trigger */
  const resumeRef = useRef<{ trigger?: string; surface?: string; source?: string } | null>(null);
  const [memoryOpen, setMemoryOpen] = useState(false);
  // The boundary note is dismissible — said once, not nagged.
  const [limitNoteOff, setLimitNoteOff] = useState(false);
  // The extraction wanted to add something and the free map was full.
  const [mapCapped, setMapCapped] = useState(false);
  // They have a Stripe customer behind them, so billing can be managed.
  const [oneManageable, setOneManageable] = useState(false);
  // Just came back from a completed checkout.
  const [oneWelcome, setOneWelcome] = useState(false);
  const one = plan === 'one';
  // What this plan opens, read from the table rather than from `one`.
  //
  // These are all true on both plans now — inside a line of thinking the free
  // tier is the whole product — but the UI asks lib/entitlements.ts rather
  // than assuming, so that a change to the table is a change to the product
  // instead of a change the interface quietly disagrees with. `one` still
  // decides the things that really are the subscription: how many lines of
  // thinking, and connected sources.
  const limits = limitsFor(plan);
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

  // ── is mathematics in play? ───────────────────────────────────────
  // Local and deterministic, so it can run on every keystroke; sticky, so the
  // control never blinks under a moving thumb. The map's own verdict outranks
  // the regexes, and a scene on the plot settles it outright.
  const mathInput = useMemo(
    () => ({
      context: map.context,
      composer: input,
      recent: (active?.messages ?? []).slice(-4).map((m) => m.content),
      hasViz: !!map.viz,
    }),
    [map.context, map.viz, input, active?.messages]
  );
  const mathSignal = useMemo(() => readMathSignal(mathInput), [mathInput]);
  const mathTopic = useMemo(() => readMathTopic(mathInput), [mathInput]);
  const lastStrongRef = useRef(0);
  const [mathAvailable, setMathAvailable] = useState(false);
  useEffect(() => {
    const now = Date.now();
    if (mathSignal === 'strong') lastStrongRef.current = now;
    const next = shouldShowMath(mathSignal, mathAvailable, lastStrongRef.current, now);
    if (next !== mathAvailable) setMathAvailable(next);
    // While it is fading, re-check once the window is up so it actually goes.
    if (mathAvailable && mathSignal !== 'strong') {
      const t = setTimeout(() => setMathAvailable(false), MATH_FADE_MS);
      return () => clearTimeout(t);
    }
  }, [mathSignal, mathAvailable]);

  // ── wrong-chat ────────────────────────────────────────────────────
  // Held rather than acted on: the message is sent and answered either way,
  // and the note is an offer beside it, never a gate in front of it.
  const [drift, setDrift] = useState<(DriftVerdict & { text: string }) | null>(null);
  const [driftDismissals, setDriftDismissals] = useState(0);
  useEffect(() => {
    try {
      const n = Number(localStorage.getItem(DRIFT_KEY));
      if (Number.isFinite(n) && n > 0) setDriftDismissals(n);
    } catch {}
  }, []);
  const dismissDrift = useCallback(() => {
    setDrift(null);
    setDriftDismissals((n) => {
      const next = n + 1;
      try {
        localStorage.setItem(DRIFT_KEY, String(next));
      } catch {}
      return next;
    });
  }, []);
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
  const styleRef = useRef('');
  styleRef.current = styleText;
  const personaRef = useRef<Personality>(DEFAULT_PERSONALITY);
  personaRef.current = persona;
  /** the fields every Logos generation request carries */
  const guidance = () => ({
    depth: depthRef.current,
    guard: guardRef.current,
    style: styleRef.current,
    persona: personaRef.current,
  });

  /**
   * A streamed reply may end with the REMEMBER line — the model updating the
   * standing instructions because the person asked it to. Strip it from what
   * they see and apply it, exactly as if they had typed it in the settings.
   */
  function absorbRemember(reply: string): string {
    const at = reply.lastIndexOf(REMEMBER_MARK);
    if (at === -1) return reply;
    const next = reply.slice(at + REMEMBER_MARK.length).trim().slice(0, MAX_STYLE);
    setStyleText(next);
    try {
      if (next) localStorage.setItem(STYLE_KEY, next);
      else localStorage.removeItem(STYLE_KEY);
    } catch {}
    setStyleUpdatedNote(true);
    return reply.slice(0, at).trimEnd();
  }

  /** What the person should see of a still-streaming reply. */
  const visibleStream = (acc: string) => {
    const at = acc.indexOf(REMEMBER_MARK);
    return at === -1 ? acc : acc.slice(0, at).trimEnd();
  };

  useEffect(() => {
    if (!styleOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setStyleOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [styleOpen]);

  function saveStyle() {
    const next = styleDraftText.trim();
    setStyleText(next);
    setPersona(personaDraft);
    setStyleOpen(false);
    setStyleUpdatedNote(false);
    try {
      if (next) localStorage.setItem(STYLE_KEY, next);
      else localStorage.removeItem(STYLE_KEY);
      if (isDefaultPersonality(personaDraft)) localStorage.removeItem(PERSONALITY_KEY);
      else localStorage.setItem(PERSONALITY_KEY, JSON.stringify(personaDraft));
    } catch {}
  }

  function pickDepth(next: ThinkingDepth) {
    // Every depth is open on every plan. The routes clamp through
    // depthForPlan() against the same table, so the menu and the answer
    // always agree — including if a plan ever closes them again.
    if (!limits.allDepths && next !== FREE_DEPTH) {
      ask('depth-locked');
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
    switchTo(next);
  }

  /** The way out of Logos: back to whichever Core model they came from. */
  function leaveForChat() {
    switchTo(lastCoreModel());
  }

  // Leaving Logos is a model switch. It USED to be `router.push('/chat')`,
  // which does nothing visible: /chat is already the route — it renders this
  // component whenever the model is Logos — so pushing it again re-renders
  // the same surface with the same state. Remembering the new model doesn't
  // help either, since /chat only reads storage on mount. So when /chat is
  // our host, hand the switch back to it and let it re-render; the router is
  // only for the case where this is mounted somewhere else.
  function switchTo(next: SocriaModel) {
    rememberModel(next);
    if (onSwitchModel) {
      onSwitchModel(next);
      return;
    }
    router.push(SOCRIA_MODELS[next].href ?? '/chat');
  }

  // The chips on an empty line of thinking. Logos keeps no journey of its own,
  // but a session is titled after the first thing said in it, which is enough
  // to offer a way back into one; the written openings top the list up. The
  // active (empty) session is skipped — offering a way back into the screen
  // you are already looking at is no offer at all.
  // A map's own unfinished business is the best thing this surface knows: an
  // open question, a tension nobody resolved, an assumption never tested. It
  // is exact, it costs nothing, and it exists the moment a map does — which
  // is the whole reason a Logos screen should not be offering "More on" a
  // conversation's first sentence instead.
  const pendingFromMaps = sessions
    .filter((s) => s.id !== activeId)
    .flatMap((s) =>
      (s.map?.nodes ?? [])
        .filter((n) => PENDING_TYPES.includes(n.type))
        .map((n) => ({ label: n.label, type: n.type, updatedAt: s.updatedAt }))
    );

  // First-ever: nothing has been said or drawn in any session. The store
  // always holds one empty placeholder, so "no sessions" cannot mean an
  // empty list.
  const noSessions =
    !hydrating && sessions.every((x) => x.messages.length === 0 && !(x.map?.nodes?.length));

  const logosStarters = buildStarters(
    {
      pending: pendingFromMaps,
      recent: sessions
        .filter((s) => s.id !== activeId && s.messages.length > 0)
        .map((s) => ({ title: s.title, updatedAt: s.updatedAt })),
      fallback: STARTERS,
    },
    STARTERS.length
  );

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

  // On mobile the rail is an overlay, so it must not start open across the
  // whole screen. One check at mount; resizing a desktop window later is a
  // choice the person can manage with the toggle.
  useEffect(() => {
    if (window.innerWidth <= 900) setRailOpen(false);
  }, []);

  useEffect(() => {
    // Each setting restores in its own try, and that is the point rather than
    // fussiness. These all shared one, so a single unparseable key — a
    // half-written REVEALED_KEY, anything — threw and silently skipped every
    // line after it. Personality was the last line, which made "my settings
    // keep resetting" the symptom of a corrupt value three settings earlier.
    const load = (fn: () => void) => {
      try {
        fn();
      } catch {}
    };
    load(() => {
      if (localStorage.getItem(KEY_STORAGE) === '1') setUnlocked(true);
    });
    load(() => {
      const d = localStorage.getItem(DEPTH_KEY);
      if (d === 'quick' || d === 'balanced' || d === 'deep' || d === 'abstract') setDepth(d);
    });
    load(() => {
      const rev = JSON.parse(localStorage.getItem(REVEALED_KEY) || '[]');
      if (Array.isArray(rev)) setRevealedIds(new Set(rev.filter((x) => typeof x === 'string')));
    });
    load(() => {
      if (localStorage.getItem(ONE_KEY_STORAGE) === '1') setPlan('one');
    });
    load(() => {
      const st = localStorage.getItem(STYLE_KEY);
      if (typeof st === 'string' && st.trim()) setStyleText(st);
    });
    load(() => {
      setPersona(sanitizePersonality(JSON.parse(localStorage.getItem(PERSONALITY_KEY) || '{}')));
    });
    const t = setTimeout(() => setAuthSettled(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Coming back from Stripe. The webhook may still be in flight when the
  // browser lands, so ask the server a few times before believing 'free' —
  // telling someone who has just paid that they haven't would be the worst
  // possible first second of a subscription.
  useEffect(() => {
    // Where the sign-in gate brings them back to: this page, query and all,
    // so a ?start= from /explore survives the trip (lib/auth-links validates).
    setGateHref(authUrl('sign-in', window.location.pathname + window.location.search));

    // A first message chosen elsewhere — an opening, or an exhibit on
    // /explore. Into the composer, never sent: the person edits it into
    // their own situation before it costs them a line of thinking.
    {
      const { id, search } = readStart(window.location.search);
      if (id) {
        const msg = startMessage(id);
        if (msg) pendingStart = { id, message: msg };
        window.history.replaceState({}, '', window.location.pathname + search);
      }
    }

    // A link from an email says which one it was; remembered for checkout.
    {
      const via = new URLSearchParams(window.location.search).get('via');
      if (via) {
        try {
          if (isSource(via)) sessionStorage.setItem(VIA_KEY, via);
        } catch {}
        const url = new URL(window.location.href);
        url.searchParams.delete('via');
        window.history.replaceState({}, '', url.pathname + url.search);
      }
    }

    const params = new URLSearchParams(window.location.search);

    // Back from sign-in with a checkout to finish. Consumed exactly once.
    if (params.get('checkout') === '1') {
      const url = new URL(window.location.href);
      url.searchParams.delete('checkout');
      window.history.replaceState({}, '', url.pathname + url.search);
      try {
        const raw = sessionStorage.getItem(CHECKOUT_RESUME_KEY);
        sessionStorage.removeItem(CHECKOUT_RESUME_KEY);
        const stash = raw ? (JSON.parse(raw) as { trigger?: string; source?: string; at?: number }) : null;
        if (stash && Date.now() - (stash.at ?? 0) < 15 * 60_000) {
          resumeRef.current = { trigger: stash.trigger, surface: 'logos', source: stash.source };
        }
      } catch {}
      setResumeCheckout(true);
    }

    const flag = params.get('one');
    if (!flag) {
      void syncPlan();
      return;
    }
    // Clean the query so a refresh doesn't replay this.
    const sessionId = params.get('session_id');
    window.history.replaceState({}, '', '/chat');
    if (flag !== 'welcome') return;

    // The payment, counted from the browser as well as the webhook: the
    // webhook's event arrives as a visit by Stripe and may be bot-filtered,
    // and this one belongs to the person's own session. Once per checkout.
    if (sessionId) {
      try {
        const seen = sessionStorage.getItem(WELCOMED_KEY);
        if (seen !== sessionId) {
          sessionStorage.setItem(WELCOMED_KEY, sessionId);
          const last = JSON.parse(localStorage.getItem(CHECKOUT_LAST_KEY) || 'null') as {
            trigger?: string;
            surface?: string;
            source?: string;
          } | null;
          track('one_subscribed', {
            trigger: last?.trigger,
            surface: last?.surface ?? 'logos',
            source: last?.source ?? 'client',
            plan: 'one',
            signed_in: !!isSignedIn,
          });
        }
      } catch {}
    }

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

  // The checkout they started before signing in, finished without a second
  // press. Waits for the account to be settled so the POST carries it, and
  // runs once; the server refuses to sell One twice, so a person who bought
  // it elsewhere in the meantime lands on a 409 and simply gets on with it.
  const [resumeCheckout, setResumeCheckout] = useState(false);
  useEffect(() => {
    if (!resumeCheckout || !isLoaded || !isSignedIn) return;
    setResumeCheckout(false);
    void takeOne('');
    // takeOne is redefined each render; this intentionally runs once per resume.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeCheckout, isLoaded, isSignedIn]);

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

  // Returning from an OAuth consent screen: /chat?connect=ok|denied|error|signin
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
      if (CONNECTORS_ON) setConnOpen(true);
    } else if (c === 'error') {
      setConnBanner(params.get('msg') || 'That connection didn’t go through.');
      // While connectors are dormant a stale link shouldn't open an empty room.
      if (CONNECTORS_ON) setConnOpen(true);
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
  const refreshUsage = useCallback(
    async (chatId?: string | null) => {
      try {
        const q = chatId ? `?chat=${encodeURIComponent(chatId)}` : '';
        const res = await fetch(`/api/logos/usage${q}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json?.counters) setUsage(json.counters);
      } catch {
        /* the panel simply does not update; nothing depends on it */
      }
    },
    []
  );

  const keyHeaders = useCallback(
    (): Record<string, string> => ({
      ...(unlocked && !isSignedIn ? { 'x-socria-key': CORE3_ACCESS_KEY } : {}),
      // What the client believes it holds. The routes check for themselves.
      ...(plan === 'one' ? { 'x-socria-one': SOCRIA_ONE_KEY } : {}),
    }),
    [unlocked, isSignedIn, plan]
  );

  /**
   * The prompt controller. Every mention of Socria One that Logos raises on
   * its own goes through `ask` — it holds the plan check, the cooldowns, the
   * once-per-session rule and the analytics in one place, so no component
   * here can open an upgrade modal that nothing is able to rate-limit.
   */
  // Only sessions with something in them count as engagement. The store
  // always holds one empty placeholder, and newSession() makes more, each
  // stamped with the current time — two of those on two days would read as
  // "this person came back" when nobody has said a word.
  const thoughtSessions = useMemo(() => sessions.filter((x) => x.messages.length > 0), [sessions]);
  const { prompt: onePrompt, ask, cancelPending, dismiss: dismissPrompt, accept: acceptPrompt } =
    useOnePrompt({
      plan,
      signedIn: !!isSignedIn,
      context: map.context,
      sessions: thoughtSessions,
      mapNodes: meaningfulNodes(map),
      surface: 'logos',
    });

  /**
   * The one proactive prompt in the product.
   *
   * It has a single cue: a thought just finished. Not a timer, not a session
   * count, not page load — the moment a reply lands is the only moment where
   * mentioning more room is a continuation of what someone is doing rather
   * than an interruption of it. Everything else — has this person come back
   * across days, is the map substantial, have they dismissed one recently, is
   * this a reflective conversation — is decided inside `ask`.
   *
   * The short wait is not a timed trigger. The trigger already fired; this
   * only keeps the sheet from landing on top of a reply someone has not
   * finished reading. Typing again cancels it, because someone still working
   * is someone not to interrupt.
   */
  useEffect(() => {
    if (landedTurns === 0 || one || busy || streaming) return;
    // The first map belongs to the share moment. One note slot per screen.
    if (shareNoteRef.current) return;
    // The delay lives in the controller now: proactive asks settle for a
    // moment and are decided together, so the shaped map — which arrives a
    // beat after the reply, once the extraction lands — can outrank the
    // generic nudge instead of losing the tab's one slot to it.
    if (shapedRef.current) {
      shapedRef.current = false;
      ask('map-shaped');
    }
    ask('returning-thinker');
  }, [landedTurns, one, busy, streaming, ask]);

  // Someone still working is someone not to interrupt: typing, or a request
  // in flight, drops whatever was waiting to be decided.
  useEffect(() => {
    if (input || busy) cancelPending();
  }, [input, busy, cancelPending]);
  useEffect(() => {
    inFlightRef.current = busy || !!streaming;
  }, [busy, streaming]);

  // What Socria knows about this person, for accounts. Anonymous, key-unlocked
  // Logos has no person to remember — and must not read Core's local journey
  // either, which would push one browser's memory into whichever account
  // signs in next.
  useEffect(() => {
    if (!isSignedIn) {
      setUnderstanding(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.understanding) return;
        setUnderstanding(sanitizeUserUnderstanding(json.understanding));
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn]);

  /**
   * Open the full Socria One screen — the invitation plate with everything on
   * it. This is the deliberate path: someone pressed a button that says
   * Socria One, so they get the whole picture rather than a single sentence
   * about whatever just stopped.
   */
  const askOne = useCallback(
    (reason?: string) => {
      if (plan === 'one') return; // a member is never sold to
      setOneReason(reason);
      setOneOpen(true);
      track('one_prompt_shown', {
        trigger: 'asked',
        category: 'proactive',
        intent: 'low',
        surface: 'logos',
        plan,
        hard_limit: false,
        signed_in: !!isSignedIn,
      });
    },
    [plan, isSignedIn]
  );

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
      // One code, whole product: the same key also opens the Core 3 / Logos
      // access gate, so nobody unlocks One and then hits a second door.
      setUnlocked(true);
      try {
        localStorage.setItem(KEY_STORAGE, '1');
      } catch {}
      // Redeem through the server too: signed in, the grant is written to the
      // account and follows them to their next device. Fire-and-forget — the
      // local unlock works either way, and syncPlan reconciles later.
      void fetch('/api/logos/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typed }),
      }).catch(() => {});
      setPlan('one');
      setOneOpen(false);
      try {
        localStorage.setItem(ONE_KEY_STORAGE, '1');
      } catch {}
      return true;
    }

    setOneBusy(true);
    setOneError(null);
    // Recorded before the redirect, because after it this page is gone. The
    // trigger that led here is on the prompt, if a prompt is what led here.
    // A checkout resumed after sign-in carries the trigger it started with;
    // a first-touch source (an email, the Explore page) rides along from the
    // stash the mount effect wrote.
    const attribution = {
      trigger: resumeRef.current?.trigger ?? onePrompt?.reason ?? (oneOpen ? 'asked' : undefined),
      surface: 'logos' as const,
      source: resumeRef.current?.source ?? readVia(),
    };
    resumeRef.current = null;
    track('one_checkout_started', {
      trigger: attribution.trigger,
      category: onePrompt?.category ?? (oneOpen ? 'proactive' : undefined),
      intent: onePrompt?.intent,
      surface: 'logos',
      source: attribution.source,
      plan,
      signed_in: !!isSignedIn,
    });
    try {
      localStorage.setItem(CHECKOUT_LAST_KEY, JSON.stringify(attribution));
    } catch {}
    try {
      const res = await fetch('/api/stripe/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        // The same trigger the event above carries, so the payment — which
        // arrives later, on a webhook with no browser attached — can be
        // counted against the moment that earned it.
        body: JSON.stringify(attribution),
      });
      if (res.status === 401) {
        // Sign in, then come straight back and finish — with the trigger
        // that led here, which would otherwise be lost with the page.
        try {
          sessionStorage.setItem(CHECKOUT_RESUME_KEY, JSON.stringify({ ...attribution, at: Date.now() }));
        } catch {}
        window.location.href = authUrl('sign-in', '/chat?model=logos&checkout=1');
        return true;
      }
      if (res.status === 409) {
        // Already a member. The server will not sell it twice, and the right
        // response is to let them get on with it.
        setPlan('one');
        setOneOpen(false);
        return true;
      }
      const json = await res.json().catch(() => null);
      if (res.ok && json?.url) {
        window.location.href = json.url;
        return true;
      }
      setOneError(
        billingLine(
          billingError(
            json,
            'Could not start checkout. If this deployment has no billing configured, an access code still works.'
          )
        )
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

      // Deep-link from elsewhere in the app: /chat?s=<id>
      let wanted: string | null = null;
      try {
        wanted = new URLSearchParams(window.location.search).get('s');
      } catch {}

      if (list.length === 0) list = [emptySession()];
      let sorted = sortSessions(list);
      // A first message chosen elsewhere goes into a line of thinking of its
      // own, not on top of the one they were last in — without going through
      // newSession(), which asks and spends; nothing is spent until they send.
      if (pendingStart && !wanted && sorted[0].messages.length > 0) {
        sorted = [emptySession(), ...sorted];
      }
      sessionsRef.current = sorted;
      setSessions(sorted);
      const target = (wanted && sorted.find((s) => s.id === wanted)?.id) || sorted[0].id;
      setActiveId(target);
      activeIdRef.current = target;
      chronRef.current = [...(sorted.find((s) => s.id === target)?.messages ?? [])];
      setHydrating(false);
      // Applied, not consumed: the tree this runs in may be thrown away and
      // mounted again (see pendingStart), and the message has to survive
      // that. It is cleared when the person sends it — the one event that
      // means it has left the composer.
      if (pendingStart) {
        const { id, message } = pendingStart;
        setInput(message);
        startIdRef.current = id;
        requestAnimationFrame(() => {
          const ta = document.querySelector<HTMLTextAreaElement>('.lg-composer textarea');
          if (ta) {
            ta.focus();
            ta.setSelectionRange(ta.value.length, ta.value.length);
          }
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasAccess, authSettled, isSignedIn]);

  // The counts belong to a conversation as much as to a month, so they are
  // re-read whenever the conversation on screen changes.
  useEffect(() => {
    void refreshUsage(activeId);
  }, [activeId, plan, refreshUsage]);

  function switchSession(id: string) {
    if (id === activeIdRef.current) return;
    // The share note belongs to the map it was shown on.
    setFirstMapNote(false);
    shareNoteRef.current = false;
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
    // The month's count is the server's, and it is spent when a line of
    // thinking BEGINS rather than when an empty one is created — so opening
    // Logos and closing it again costs nothing. Everything already open stays
    // open and stays usable; what runs out is starting another.
    if (!one && chatsSpent) {
      ask('chats-spent');
      return;
    }
    const fresh = emptySession();
    applySessions([fresh, ...sessionsRef.current]);
    switchSession(fresh.id);
    // A brand-new empty session isn't worth a round trip until it has content.
  }

  /**
   * Take the message that looked misfiled into a conversation of its own.
   *
   * It is a MOVE: the turn is removed from where it landed, so the line of
   * thinking it interrupted reads as though it was never interrupted. What
   * was said in reply goes with it, because an answer to a question that is
   * no longer there is worse than nothing.
   */
  function moveDriftToNewChat() {
    const d = drift;
    if (!d) return;
    const from = activeIdRef.current;
    setDrift(null);
    const fresh = emptySession();
    applySessions([
      fresh,
      ...sessionsRef.current.map((x) => {
        if (x.id !== from) return x;
        let cut = x.messages.length;
        for (let i = x.messages.length - 1; i >= 0; i--) {
          if (x.messages[i].role === 'user' && x.messages[i].content === d.text) {
            cut = i;
            break;
          }
        }
        return { ...x, messages: x.messages.slice(0, cut), updatedAt: Date.now() };
      }),
    ]);
    switchSession(fresh.id);
    void send(d.text);
  }

  /**
   * Give a session the name its owner wants.
   *
   * `patchActive` only auto-titles a session still called UNTITLED, so a name
   * set here survives every later turn without needing a flag to say it was
   * deliberate — the presence of a real title IS the flag.
   */
  function renameSession(id: string, title: string) {
    const next = sessionsRef.current.map((s) => (s.id === id ? { ...s, title } : s));
    // The list is ordered by when a session was last touched, and renaming is
    // not thinking — leaving `updatedAt` alone keeps a rename from shuffling
    // the row out from under the cursor that just used it.
    applySessions(next);
    // PATCH rather than `persist`: a rename knows the id and the name and
    // nothing else, and sending a whole-row PUT from here would race whatever
    // the conversation is mid-way through saving.
    if (cloud) {
      void fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, title }),
      }).catch(() => {});
    }
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
    const typed = keyInput.trim();
    if (!isValidAccessKey(typed)) {
      setKeyError(true);
      return;
    }
    setKeyError(false);
    setUnlocked(true);
    try {
      localStorage.setItem(KEY_STORAGE, '1');
    } catch {}
    // The One code is a master key — at this gate it opens everything at
    // once, and a signed-in redemption is written to the account.
    if (isValidOneKey(typed)) void takeOne(typed);
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
            // A crossing observed in this tab — never a level. Hydrating a
            // saved session with nine nodes is not a map taking shape, so the
            // first extraction of an existing session does not count; a map
            // that was empty a moment ago and is not now does.
            const prevN = mapRef.current.nodes.length;
            const nextN = (json.map.nodes as unknown[]).length;
            const sessionKey = forSession ?? '';
            const seenBefore = extractedRef.current.has(sessionKey) || prevN === 0;
            extractedRef.current.add(sessionKey);
            if (seenBefore && firstMapCrossed(prevN, nextN)) {
              // The extraction usually lands AFTER the reply, by which time
              // the landed-turn effect has already queued the generic nudge.
              // Asking here too puts the shaped map into the same settle, so
              // it is decided alongside and outranks it. While a reply is
              // still in flight the flag waits for the landed effect instead,
              // so nothing is decided mid-stream.
              if (inFlightRef.current) shapedRef.current = true;
              else if (!shareNoteRef.current) ask('map-shaped');
              let firstEver = false;
              try {
                firstEver = !localStorage.getItem(FIRST_MAP_KEY);
                if (firstEver) localStorage.setItem(FIRST_MAP_KEY, String(Date.now()));
              } catch {}
              if (firstEver) {
                // The person's first map. It belongs to the share moment, not
                // to a prompt about One: the note takes the slot and the
                // proactive triggers stand down for this tab.
                track('first_map_shaped', { opening: openingValue(startIdRef.current), surface: 'logos' });
                setFirstMapNote(true);
                shareNoteRef.current = true;
                shapedRef.current = false;
                cancelPending();
              }
            }
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
              // A turn that produced no scene is not a request to remove the
              // one already on screen — the extractor simply had nothing new
              // to say about the picture. Carry it across, so a graph someone
              // is in the middle of adjusting survives the next message. A
              // scene the model DOES send replaces it, and if the thinking
              // stops being mathematical the sanitizer drops it anyway.
              // A turn that produced no scene is not a request to remove the
              // one already on screen — the extractor simply had nothing new
              // to say about the picture. Carry it across, so a graph someone
              // is in the middle of adjusting survives the next message. A
              // scene the model DOES send replaces it, and if the thinking
              // stops being mathematical the sanitizer drops it anyway.
              let viz = json.map.viz ?? s.map?.viz;
              // The reader's curves outlive a distracted extraction. If a new
              // scene arrives with no opinion about overlays, the ones already
              // plotted stay; only an explicit empty list clears them. Someone
              // who asked for x² five turns ago should not lose it because
              // this turn was about something else.
              if (json.map.viz && json.map.viz.overlays === undefined && s.map?.viz?.overlays?.length) {
                viz = { ...json.map.viz, overlays: s.map.viz.overlays };
              }
              const map = { ...json.map, ...(viz ? { viz } : {}) };
              return { ...s, map, contexts };
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
  /**
   * The map is full: new thinking will no longer be added to it.
   *
   * Never, now — `mapNodes` is null on both plans and a map grows as far as
   * the thinking does. The check reads the table rather than being deleted so
   * the note below is one table entry away from coming back.
   */
  const atMapBoundary = meaningfulNodes(map) >= (limits.mapNodes ?? Infinity);

  /** Whether a metered action has run out, by the server's count. */
  const spentOf = (c: Counter) => {
    const u = usage[c];
    return !!u && u.limit !== null && u.used >= u.limit;
  };
  const chatsSpent = spentOf('chats');
  const researchLocked = spentOf('research');

  async function runAction(mode: NodeMode, node: MapNodeRef) {
    // Every move on every node is open at every tier. Research still has a
    // ceiling, but it is fair use — the same one a member has, set where
    // serious work does not reach it — so ask() will decline to open a sheet
    // ('shared-ceiling'), and the inline path below is the one that runs.
    if (mode === 'research' && researchLocked) {
      // The panel opens on the node they pressed and says what happened
      // there. A press that produces nothing at all is the one outcome this
      // is not allowed to have.
      if (!ask('research-spent')) {
        setExplore({
          key: `spent::${node.id}::${mode}`,
          mode,
          node,
          data: null,
          loading: false,
          error: boundaryNote('research'),
          open: true,
        });
      }
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
    // The spend happens on the server, at the moment it does the work — a
    // cached result reopened never reaches the route, so it costs nothing.
    // All the client does afterwards is re-read the count.
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
          ...guidance(),
        }),
      });
      if (res.status === 402) {
        // A boundary, not a failure: the server has the authoritative count.
        const json = await res.json().catch(() => null);
        void refreshUsage(activeIdRef.current);
        const said = ask(reasonForCounter(mode as Counter));
        // The sheet stays shut for two reasons now: this boundary was already
        // explained in this tab, or it is a fair-use ceiling Socria One shares
        // and there is nothing to offer. Either way the panel says what
        // happened rather than closing on nothing.
        setExplore((e) =>
          said
            ? { ...e, loading: false, open: false }
            : {
                ...e,
                loading: false,
                error: json?.error || boundaryNote(mode as Counter),
              }
        );
        return;
      }
      if (!res.ok) throw new Error('Could not look that up right now.');
      const json = await res.json();
      void refreshUsage(activeIdRef.current);
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

    const payload = [...messages.slice(-8), ...nextThread];

    try {
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          sessionId: activeIdRef.current,
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

      // Accepted — the reasoning done in this node belongs on the map. Same
      // rule as the main composer: a refused turn is not extracted from.
      refreshMap();

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setFocusStream(visibleStream(acc));
        }
      }
      acc = absorbRemember(acc);
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
        body: JSON.stringify({ image: dataUrl, sessionId: activeIdRef.current }),
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

    // The month's chats are spent and this turn would BEGIN one.
    //
    // The server would refuse it anyway — that is where the boundary really
    // lives — but sending it first meant the refusal arrived after the map
    // extraction had already run beside it, so a spent account watched new
    // nodes appear on every attempt and got a sheet each time. Stopping here
    // costs a round trip that was never going to produce anything, and the
    // sentence stays in the composer where they can still send it once they
    // have room. Continuing an OPEN line of thinking is not a beginning and
    // is not stopped: a chat is counted once, when it starts.
    //
    // If the sheet has already explained this boundary in this tab, it stays
    // shut and the sentence is said in place instead. Something must answer
    // a press that does nothing — that was the whole reason entitlement
    // prompts were never rationed, and the once-per-tab rule only holds
    // because this line keeps the promise the sheet used to.
    if (!one && chatsSpent && !messages.some((m) => m.role === 'user')) {
      if (!ask('chats-spent')) setError(boundaryNote('chats'));
      return;
    }

    setError(null);
    setInput('');
    pendingStart = null;

    // Once, here, on the message as sent — never while typing. The reply
    // proceeds regardless; this only decides whether a note appears beside it.
    const s0 = sessionsRef.current.find((x) => x.id === activeIdRef.current);
    const v = readDrift({
      message: content,
      title: s0?.title === UNTITLED ? undefined : s0?.title,
      recent: (s0?.messages ?? []).map((m) => m.content),
      context: s0?.map?.context,
      dismissals: driftDismissals,
    });
    setDrift(v.flag ? { ...v, text: content } : null);

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

    // A line of thinking begins: which one is this for the person? Shape
    // only — first, second, or later — so activation can be read without a
    // word of what was said.
    if (!before.some((m) => m.role === 'user')) {
      const prior = sessionsRef.current.filter(
        (x) => x.id !== activeIdRef.current && x.messages.some((m) => m.role === 'user')
      ).length;
      track('logos_session_started', { nth: nthBucket(prior + 1), surface: 'logos', signed_in: !!isSignedIn });
    }
    const sid = activeIdRef.current ?? '';
    const u = isSignedIn ? understandingRef.current : null;

    // Conversational reply.
    //
    // The map extraction USED to be fired here, in parallel, so it could run
    // while the answer streamed. It cost nothing when the turn was accepted
    // and was wrong when it was not: a refused turn still had its map rebuilt
    // beside it, which is how a spent account kept watching nodes appear
    // after the boundary. It now waits for the response HEADERS — not the
    // body — so the extraction still overlaps the whole of the stream, which
    // is where the time actually goes, and a turn the server refuses is not
    // extracted from at all.
    try {
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          sessionId: activeIdRef.current,
          messages: next,
          ...guidance(),
          // What Logos knows about this person, for accounts; the server
          // decides what the plan carries of it. The recurrence line is
          // owed until it has been injected once in this session.
          ...(u ? { understanding: u, recurrence: !recurrenceSaidRef.current.has(sid) } : {}),
        }),
      });
      if (res.status === 402) {
        // A boundary rather than a failure: the turn is put back in the
        // composer so nothing they wrote is lost to a limit.
        const body = await res.json().catch(() => ({}));
        void refreshUsage(activeIdRef.current);
        patchActive((sn) => ({ ...sn, messages: sn.messages.slice(0, -1) }), false);
        setInput(content);
        setBusy(false);
        // Same rule as the pre-flight above: the sheet once, then in place.
        if (!ask('chats-spent')) setError(body?.error || boundaryNote('chats'));
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong.');
      }

      // The turn was accepted. Now the map may be rebuilt from it.
      refreshMap();

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      if (reader) {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += decoder.decode(value, { stream: true });
          setStreaming(visibleStream(acc));
        }
      }
      acc = absorbRemember(acc);
      setStreaming('');
      const landed: Msg[] = [...next, { role: 'assistant', content: acc }];
      patchActive((s) => ({ ...s, messages: landed }));
      chronRef.current = [...chronRef.current, { role: 'assistant', content: acc }];
      if (u && u.entries.length) recurrenceSaidRef.current.add(sid);
      // A thought completed. The proactive check runs from an effect rather
      // than here, so it sees the map this turn produced instead of the one
      // captured when this function was defined.
      setLandedTurns((n) => n + 1);
      // What Logos learned about the person, folded into the memory it
      // shares with Core — every few turns, for accounts only, and never
      // from a line of thinking the map read as reflecting: that memory is
      // private, and Logos is the surface whose map can be shown to someone.
      const userTurns = landed.filter((m) => m.role === 'user').length;
      if (
        isSignedIn &&
        userTurns >= JOURNEY_EVERY_TURNS &&
        userTurns % JOURNEY_EVERY_TURNS === 0 &&
        mapRef.current.context !== 'reflecting'
      ) {
        void (async () => {
          try {
            const s0 = sessionsRef.current.find((x) => x.id === sid);
            const jr = await fetch('/api/update-understanding', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                understanding: understandingRef.current ?? undefined,
                title: s0 && s0.title !== UNTITLED ? s0.title : null,
                messages: landed.map((m) => ({ role: m.role, content: m.content })),
                surface: 'logos',
                conversationId: sid,
                mapContext: mapRef.current.context ?? null,
              }),
            });
            if (jr.ok) {
              const jj = await jr.json();
              if (jj?.understanding) setUnderstanding(sanitizeUserUnderstanding(jj.understanding));
            }
          } catch {}
        })();
      }
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
                <span className="lg-sr">Socria Logos</span>
              </span>
              <h1>A reasoning environment.</h1>
              <p>
                A split screen: you talk on the left, and a map of your
                reasoning is drawn on the right. Sign in to open it.
              </p>
              {/* Logos is open to anyone with an account, so signing in is the
                  way in and leads. The access key stays for people without one
                  — comped members, anyone handed a code — but it no longer
                  fronts the screen as though this were invite-only. */}
              <a className="lg-gate-go" href={gateHref}>
                Sign in to open Logos
              </a>
              <button
                type="button"
                className="lg-gate-toggle"
                aria-expanded={keyOpen}
                onClick={() => setKeyOpen((v) => !v)}
              >
                Have an access key?
              </button>
              <div className="lg-gate-row" hidden={!keyOpen}>
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
                Free to start — two lines of thinking, and the whole loop.
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
      {styleOpen && (
        <div className="lg-style-scrim" role="dialog" aria-modal="true" aria-label="How should Socria work with you?">
          <div className="lg-style-back" onClick={() => setStyleOpen(false)} aria-hidden="true" />
          <div className="lg-style-sheet">
            <h2 className="lg-style-title">Socria Personality</h2>
            <p className="lg-style-sub">
              How Socria communicates while it thinks with you. Depth stays
              separate — it decides how far the thinking goes; this decides how
              it sounds on the way.
            </p>

            <div className="lg-persona-grid">
              {PERSONALITY_DIMENSIONS.map((d) => (
                <PersonalityDial
                  key={d.id}
                  dimension={d}
                  value={personaDraft[d.id] ?? d.options[0].id}
                  onChange={(next) =>
                    setPersonaDraft((prev) => ({ ...prev, [d.id]: next }))
                  }
                />
              ))}
            </div>
            {!isDefaultPersonality(personaDraft) && (
              <button
                type="button"
                className="lg-persona-reset"
                onClick={() => setPersonaDraft(DEFAULT_PERSONALITY)}
              >
                Reset to Socria defaults
              </button>
            )}

            <h3 className="lg-style-title2">How should Socria work with you?</h3>
            <p className="lg-style-sub">
              In your own words, layered over the settings above — whatever they
              don&rsquo;t say.
            </p>
            <textarea
              className="lg-style-input"
              value={styleDraftText}
              onChange={(e) => setStyleDraftText(e.target.value)}
              maxLength={MAX_STYLE}
              rows={6}
              placeholder={
                'Talk casually with me. Keep responses concise.\nChallenge my assumptions more, and ask fewer questions.\nFor math, act like a lab instructor.'
              }
            />
            <p className="lg-style-tip">
              For one conversation, just ask in the chat — &ldquo;be more
              casual&rdquo;, &ldquo;fewer questions&rdquo; — and Socria adapts on
              the spot. Say &ldquo;remember this&rdquo; and it updates these
              instructions itself; what&rsquo;s written here is remembered.
            </p>
            <p className="lg-style-note">
              This shapes Socria&rsquo;s personality, not its principles — your
              thinking, your authorship and the learning guard stay yours on
              every setting.
            </p>
            <div className="lg-style-row">
              <button type="button" className="lg-style-save" onClick={saveStyle}>
                Save
              </button>
              {styleDraftText.trim() && (
                <button
                  type="button"
                  className="lg-style-clear"
                  onClick={() => setStyleDraftText('')}
                >
                  Clear
                </button>
              )}
              <button type="button" className="lg-style-cancel" onClick={() => setStyleOpen(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <SocriaOneModal
        open={oneOpen}
        onClose={() => setOneOpen(false)}
        onUnlock={takeOne}
        reason={oneReason}
        busy={oneBusy}
        error={oneError}
      />

      {/* The contextual prompt. Says what stopped and how to keep going, and
          nothing else — the full plate above is for when someone goes looking
          for it. Both end at the same checkout. */}
      <JourneyDebugModal
        open={memoryOpen}
        onClose={() => setMemoryOpen(false)}
        journey={understanding}
        plan={plan}
        signedIn={!!isSignedIn}
        onForget={async (id) => {
          try {
            const res = await fetch('/api/profile/forget', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id }),
            });
            if (res.ok) {
              const j = await res.json();
              if (j?.understanding) setUnderstanding(sanitizeUserUnderstanding(j.understanding));
            }
          } catch {}
        }}
        onForgetAll={async () => {
          try {
            const res = await fetch('/api/account/memory', { method: 'DELETE' });
            if (res.ok) setUnderstanding(null);
          } catch {}
        }}
      />

      <OnePrompt
        view={onePrompt}
        onDismiss={dismissPrompt}
        onAccept={() => {
          acceptPrompt();
          void takeOne('');
        }}
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
        className={`lg-split${railOpen ? '' : ' rail-closed'}${draftOpen ? ' draft-open' : ''}${
          mobileView === 'map' ? ' mv-map' : ''
        }`}
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
          onRename={renameSession}
          onToggle={() => setRailOpen((v) => !v)}
        />

        {/* ── Conversation ───────────────────────────────── */}
        <section className="lg-convo" aria-label="Conversation">
          <header className="lg-head">
            {/* mobile: the rail lives behind this; on desktop the rail has
                its own toggle and this button does not exist */}
            <button
              type="button"
              className="lg-mrail"
              onClick={() => setRailOpen(true)}
              aria-label="Your lines of thinking"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h10" />
              </svg>
            </button>
            <span className="lg-word">
              <LogosMark size={26} />
              <span className="lg-sr">Socria Logos</span>
            </span>
            <span className="lg-head-note">A reasoning environment</span>
            {/* Logos hears "you've leaned on this before"; this is where it
                came from, and where it can be forgotten — on every plan. */}
            {isSignedIn && (
              <button type="button" className="lg-memory-btn" onClick={() => setMemoryOpen(true)}>
                What Socria remembers
              </button>
            )}
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
              className="lg-style-open"
              onClick={() => {
                setStyleDraftText(styleText);
                setPersonaDraft(persona);
                setStyleOpen(true);
              }}
              aria-label="How should Socria work with you?"
              title="How should Socria work with you?"
            >
              <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h9M17 7h3M4 17h3M11 17h9" />
                <circle cx="15" cy="7" r="2.2" />
                <circle cx="9" cy="17" r="2.2" />
              </svg>
            </button>
            {/* Connected sources are dormant (see connectorsEnabled) — no
                door to a room that isn't open. */}
            {CONNECTORS_ON && (
              <button
                type="button"
                className="lg-conn-open"
                onClick={() =>
                  one
                    ? setConnOpen(true)
                    : ask('connections-locked')
                }
                aria-label="Connections"
                title={one ? 'Connect Google, Notion, and more' : 'Connected sources are part of Socria One'}
              >
                <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M9 11a4 4 0 0 1 0-5l1-1a4 4 0 0 1 6 6l-1 1" />
                  <path d="M15 13a4 4 0 0 1 0 5l-1 1a4 4 0 0 1-6-6l1-1" />
                </svg>
              </button>
            )}
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
                limits.draftSpace
                  ? setDraftOpen((v) => !v)
                  : ask('draft-locked')
              }
            >
              Draft
              {!limits.draftSpace && <OneLock className="lg-draft-lock" />}
            </button>
            {/* Leaving is a model switch, not just a link: /chat opens on
                whichever model is remembered, and that is still Logos — so a
                bare href back to it re-rendered this and looked like a dead
                button. Hand back the Core model they came from. */}
            <button type="button" className="lg-back" onClick={leaveForChat}>
              Socria chat <span aria-hidden="true">→</span>
            </button>
          </header>

          <div className="lg-thread">
            {messages.length === 0 && !streaming && (
              <div className="lg-intro">
                <h1>Think out loud.</h1>
                <p>
                  Type what you’re working through. Logos asks questions back,
                  and draws the shape of your reasoning on the right as you go.
                </p>
                {noSessions && !input ? (
                  // Nothing has ever been said here. The chips would send a
                  // line too thin to draw; these are four complete first
                  // messages, put into the composer and NEVER sent — the
                  // person edits them into their own situation first.
                  <div className="lg-openings">
                    <p className="lg-openings-lead">{OPENING_LEAD}</p>
                    {OPENINGS.map((o) => (
                      <button
                        key={o.id}
                        type="button"
                        className="lg-opening"
                        onClick={() => {
                          setInput(o.message);
                          startIdRef.current = o.id;
                          requestAnimationFrame(() => {
                            const ta = document.querySelector<HTMLTextAreaElement>('.lg-composer textarea');
                            if (ta) {
                              ta.focus();
                              ta.setSelectionRange(ta.value.length, ta.value.length);
                            }
                          });
                        }}
                      >
                        <strong>{o.label}</strong>
                        <small>{o.shows}</small>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="lg-starters">
                    {logosStarters.map((s) => (
                      <button
                        key={s.prompt}
                        type="button"
                        onClick={() => send(s.prompt)}
                        title={s.prompt !== s.label ? s.prompt : undefined}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`lg-msg lg-msg-${m.role}`}>
                {m.role === 'assistant' && <span className="lg-msg-who">Socria</span>}
                <div className="lg-msg-stack">
                  {!!m.attachments?.length && <AttachmentList items={m.attachments} />}
                  {m.content && (
                    <div className="lg-msg-body">
                      {m.role === 'assistant' ? (
                        // Socria's prose carries the same small vocabulary
                        // Core's does — a list, a numbered sequence, a bold
                        // label, the one word in emphasis — and until this it
                        // arrived as literal asterisks and hyphens. What the
                        // person typed is never reinterpreted: their own
                        // asterisks stay asterisks.
                        <RichText text={m.content} math />
                      ) : (
                        <MathText>{m.content}</MathText>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}

            {streaming && (
              <div className="lg-msg lg-msg-assistant">
                <span className="lg-msg-who">Socria</span>
                {/* Inline marks only while the words are still arriving.
                    Blocks settle when the text stops: re-deciding "is this a
                    list yet?" on every token makes a half-written reply jump
                    about under somebody who is reading it. */}
                <div className="lg-msg-body is-streaming">
                  <Inline text={streaming} math />
                </div>
              </div>
            )}

            {busy && !streaming && (
              <div className="lg-msg lg-msg-assistant">
                <span className="lg-msg-who">Socria</span>
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
                    <b>Socria One is open.</b> Begin as many lines of thinking as you
                    have, and Socria carries what it learns about how you reason from
                    each one into the next.
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

          {/* The chat just updated the standing instructions on their ask. */}
          {styleUpdatedNote && (
            <div className="lg-one-note lg-style-note-bar" role="status">
              <span className="lg-one-note-text">
                <b>Noted.</b> Socria updated how it works with you — see it under
                the{' '}
                <button
                  type="button"
                  className="lg-style-note-link"
                  onClick={() => {
                    setStyleDraftText(styleText);
                    setPersonaDraft(persona);
                    setStyleOpen(true);
                    setStyleUpdatedNote(false);
                  }}
                >
                  personality settings
                </button>
                .
              </span>
              <button
                type="button"
                className="lg-one-note-x"
                onClick={() => setStyleUpdatedNote(false)}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          {/* The free map has grown as far as it goes. Said plainly, once,
              and dismissible — the map itself stays exactly as it is. */}
          {!limitNoteOff && atMapBoundary && (
            <div className="lg-one-note" role="note">
              <span className="lg-one-note-text">
                <b>Your free Thinking Map has reached its limit.</b> Everything here
                stays open — Socria One lets it keep growing with your thinking.
              </span>
              <button
                type="button"
                className="lg-one-note-go"
                onClick={() =>
                  ask('map-full')
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

          {/* An offer, after the fact. The message was sent and answered;
              this only asks whether it landed where it was meant to. */}
          {drift && (
            <div className="lg-drift" role="note">
              <span className="lg-drift-text">
                That reads like {drift.domain === 'code' ? 'a coding' : `a ${drift.domain}`} question,
                and this line of thinking has been about something else. Did you mean it here?
              </span>
              <span className="lg-drift-acts">
                <button type="button" className="lg-drift-stay" onClick={dismissDrift}>
                  Keep it here
                </button>
                <button type="button" className="lg-drift-move" onClick={moveDriftToNewChat}>
                  Move to a new chat
                </button>
              </span>
              <button
                type="button"
                className="lg-drift-x"
                onClick={dismissDrift}
                aria-label="Dismiss"
              >
                ×
              </button>
            </div>
          )}

          <LogosComposer
            value={input}
            onChange={setInput}
            mathAvailable={mathAvailable}
            mathTopic={mathTopic}
            drafts={drafts}
            setDrafts={setDrafts}
            onSend={sendFromComposer}
            busy={busy}
            readImage={readImage}
          />

          {/* Which mind you're talking to, and how deep it goes — kept beside
              the box you type in rather than parked up in the header. Both
              menus open upward; they sit at the bottom of the screen. */}
          {/* What the free tier holds, said plainly and once. Nobody should
              discover a limit by hitting it. Reads the same count the routes
              enforce against, so it cannot claim room that is not there.
              It used to list the per-conversation ceilings beside the month —
              "1 Explore per chat", "1 Research per chat" — which read as a
              product measured out by the spoonful. Those ceilings are fair use
              now, identical on both plans and far out of reach, so the panel
              says the one number that is actually a boundary and then says
              what is NOT bounded, because that is the more useful sentence. */}
          {!one && usage.chats && (
            <div className="lg-allow" role="note">
              <span className="lg-allow-tier">Free Logos</span>
              <span className="lg-allow-items">
                {(() => {
                  const cap = usage.chats.limit ?? 0;
                  const left = Math.max(0, cap - usage.chats.used);
                  return (
                    <span className={left === 0 ? 'is-out' : undefined}>
                      {/* the plural agrees with the TOTAL, not the remainder:
                          "1 of 2 chats left", never "1 of 2 chat left" */}
                      {left} of {cap} {cap === 1 ? 'chat' : 'chats'} left this month
                    </span>
                  );
                })()}
                <span>everything inside them, in full</span>
              </span>
              <button type="button" className="lg-allow-go" onClick={() => askOne()}>
                Socria One
              </button>
            </div>
          )}

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
                          {!limits.allDepths && d.id !== FREE_DEPTH && <OneLock />}
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
            {/* Every plan. A picture of your own thinking is not a thing to
                sell; the title goes into the file and nowhere else. */}
            <button
              type="button"
              className="lg-panel-save"
              hidden={firstMapNote}
              disabled={!map.nodes.length || mapping}
              onClick={() => void exportMapPng(map, active?.title && active.title !== UNTITLED ? active.title : 'A line of thinking')}
            >
              Save as image
            </button>
          </header>
          {firstMapNote && (
            <div className="lg-guard lg-share-note" role="note">
              <span className="lg-guard-dot" aria-hidden="true" />
              <span className="lg-guard-text">{FIRST_MAP_NOTE}</span>
              <button
                type="button"
                className="lg-share-save"
                onClick={() => {
                  void exportMapPng(map, active?.title && active.title !== UNTITLED ? active.title : 'A line of thinking');
                  setFirstMapNote(false);
                }}
              >
                Save as image
              </button>
              <button type="button" className="lg-guard-x" aria-label="Dismiss" onClick={() => setFirstMapNote(false)}>
                ×
              </button>
            </div>
          )}
          <ThinkingMap
            map={map}
            onAction={runAction}
            lensLimit={limits.lenses}
            onLocked={() =>
              ask('lenses-locked')
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
            onViz={(viz) =>
              patchActive((s) => ({ ...s, map: { ...(s.map ?? EMPTY_MAP), viz } }))
            }
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

        {/* mobile: the rail overlays; tapping the dimmed page puts it away.
            These live at the split level so hiding one surface (chat or map)
            never hides the controls that swap them. */}
        {railOpen && (
          <div className="lg-mscrim" onClick={() => setRailOpen(false)} aria-hidden="true" />
        )}
        <div className="lg-mswitch" role="tablist" aria-label="View">
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === 'chat'}
            className={`lg-mswitch-btn${mobileView === 'chat' ? ' is-on' : ''}`}
            onClick={() => setMobileView('chat')}
          >
            Conversation
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mobileView === 'map'}
            className={`lg-mswitch-btn${mobileView === 'map' ? ' is-on' : ''}`}
            onClick={() => setMobileView('map')}
          >
            Map
          </button>
        </div>
      </div>
    </div>
  );
}
