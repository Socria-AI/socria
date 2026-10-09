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
import { ThinkingMap, VIEW_RESET, type MapNodeRef, type ObjectAction } from '@/components/ThinkingMap';
import { sanitizeViz } from '@/lib/logos-viz';
import { readRole } from '@/lib/onboarding-roles';
import { readName } from '@/lib/onboarding-name';
import {
  apply as applyObjectOp,
  bindNodes,
  create as createObject,
  currentOf,
  discover,
  mergeSpaces,
  objOf,
  readOperation,
  seek as seekObject,
  spaceOf,
  suggestionsIn,
  type MatrixState,
  type ObjectSpace,
  type ThoughtObject,
} from '@/lib/objects';
import { ExplorePanel } from '@/components/ExplorePanel';
import { emptyWorkspace, update as wsUpdate } from '@/lib/workspace/store';
import { bridgeSurfaces, projectMap, projectMind } from '@/lib/workspace/adapters';
import { trace } from '@/lib/workspace/trace';
import { LogosRail, type RailProject } from '@/components/LogosRail';
import { AttachmentList, LogosComposer, type Draft } from '@/components/LogosComposer';
import { LogosMessage, MsgActions, SocriaAnswering, SocriaPending, type Side } from '@/components/LogosMessage';
import { DraftSpace, type DraftHandle, type DraftSelection } from '@/components/DraftSpace';
import { DraftResponsePanel } from '@/components/DraftResponsePanel';
import { LogosGuide, GUIDE_SEEN_KEY } from '@/components/LogosGuide';
import { Tour } from '@/components/Tour';
import { MindAtlas } from '@/components/mind/MindAtlas';
import { ShareDialog } from '@/components/share/ShareDialog';
import { useSharedSession } from '@/components/share/useSharedSession';
import { RemoteCursors, useMapPointer } from '@/components/share/RemoteCursors';
import { useComments } from '@/components/share/comments/useComments';
import { CommentPins, CommentsButton, CommentsPanel } from '@/components/share/comments/Comments';
import { excerpt, nodeAnchor, openByAnchor, readAnchor } from '@/lib/share/comments';
import { hueOf } from '@/lib/share/hue';
import { LOGOS3_TOUR, LOGOS_TOUR, LOGOS_TOUR_KEY, shouldRunTour } from '@/lib/tour';
import { LogosMark } from '@/components/LogosMark';
import { AccountControl } from '@/components/account/AccountControl';
import { AccountSheet } from '@/components/account/AccountSheet';
import { useConversationStyle } from '@/components/useConversationStyle';
import { ChallengeChip } from '@/components/rewards/ChallengeChip';
import { PLAN_CHANGED, SESSION_SAVED } from '@/components/rewards/useRewards';
import { ModelPicker } from '@/components/ModelPicker';
import { CollabBar } from '@/components/CollabBar';
import { useLogosCollab } from '@/components/useLogosCollab';
import { cleanName, joinCodeFrom } from '@/lib/collab';
import { callsSocria, landReply, mentionsSocria, newMsgId, replyRefOf, withArrived, withoutTurn, type ReplyRef } from '@/lib/chat-thread';
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
  openingsFor,
  OPENING_LEAD,
  firstMapCrossed,
  openingValue,
  readStart,
  startMessage,
} from '@/lib/first-session';
import { exportMapPng } from '@/components/MapPoster';
import { sanitizeUserUnderstanding, type UserUnderstanding } from '@/lib/socria-prompt';
import { OneLock } from '@/components/OneLock';
import {
  FREE_DEPTH,
  meaningfulNodes,
  type OneFeature,
  type Plan,
} from '@/lib/socria-one';
import { MathText } from '@/components/TeX';
import { Inline, RichText } from '@/components/RichText';
import {
  SOCRIA_MODELS,
  type SocriaModel,
  type ThinkingDepth,
} from '@/lib/socria-prompt';
import type { GuardSignal } from '@/lib/logos-guidance';
import { MAX_STYLE, STYLE_KEY, storeStyle, storedStyle } from '@/lib/logos-style';
import {
  DEFAULT_PERSONALITY,
  PERSONALITY_CHANGED,
  PERSONALITY_DIMENSIONS,
  PERSONALITY_KEY,
  isDefaultPersonality,
  storePersonality,
  storedPersonality,
  type Personality,
} from '@/lib/logos-personality';
import { chooseModel, lastCoreModel } from '@/lib/socria-model-store';
import { buildStarters, PENDING_TYPES } from '@/lib/starters';
import { billingError, billingLine } from '@/lib/billing-message';
import { PersonalityDial } from '@/components/PersonalityDial';
import { ContextPanel } from '@/components/ContextPanel';
import { ConnectionsModal } from '@/components/ConnectionsModal';
import type { Attachment, AttachmentOrigin } from '@/lib/logos-attachments';
import { MAX_CONTEXTS_PER_NODE, sanitizeContexts, type NodeContext } from '@/lib/logos-sources';
import { relevantNodes, type DraftAction, type DraftResponse } from '@/lib/logos-draft';
import { boundaryNote, limitsFor, type Counter } from '@/lib/entitlements';
import { failureText } from '@/lib/upstream-error';
import { isModelOp, parseVizOps, stripVizOps, type VizModelState, type VizOp } from '@/lib/viz-model';
import {
  activeDoc,
  adopt,
  applyModelOps,
  current as currentRevision,
  docOf,
  editsState,
  EMPTY_WORKSPACE,
  modelFor,
  redo as redoDoc,
  restore as restoreDoc,
  undo as undoDoc,
} from '@/lib/model/docs';
import type { Model } from '@/lib/model/schema';
import { DOCK_SIDES, Workspace, type DockSide } from '@/components/workspace/Workspace';
import { InspectorPanel, ModelPanel, ParamsPanel, TracePanel } from '@/components/workspace/panels';
import { ScenePanel } from '@/components/scene3d/ScenePanel';
import { sceneTurn } from '@/lib/objects/scene-chat';
import type { SceneState } from '@/lib/objects/scene';
import {
  addPanel,
  configurePanel,
  maximize,
  panelsOf,
  sanitizeLayout,
  singleLayout,
  type PanelNode,
  type WorkspaceLayout,
} from '@/lib/workspace/tiling';
import { arrangementsFor, factsFrom, showLens, suggestLayout, suggestViews, type LayoutSuggestion } from '@/lib/workspace/surfaces';
import { describeFocus, type Focus } from '@/lib/workspace/focus';
import { briefOf } from '@/lib/representation';
import {
  canSynthesize,
  lastSynthesis,
  sanitizeSynthesis,
  synthesisText,
  type Next,
  type Possibility,
  type Ref as SynthRef,
  type Synthesis,
} from '@/lib/logos-synthesis';
import { LogosSynthesis, SynthesisPending } from '@/components/LogosSynthesis';
import { useThemeGuard } from '@/components/account/ThemePicker';
import { LENSES, type LensId } from '@/lib/logos-layout';

/** Where a person's own Logos 3 arrangement is kept: this browser, never the session. */
const WS_KEY = 'socria.logos3.workspace.v2';
/** A scene with nothing in it: what the first description typed into the chat, with Live 3D open, is built on. */
const EMPTY_SCENE: SceneState = { nodes: [], next: 1, unit: 'm' };
/** Where the conversation dock sits around the stage. */
const DOCK_KEY = 'socria.logos3.dock.v1';
/** the chats bar and header, hidden from the top-right control — per browser */
const CHROME_KEY = 'socria.logos.chrome.v1';
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
  sanitizeMap,
  summarizeDelta,
  type ThinkingMap as TMap,
} from '@/lib/logos';
import { owesExtraction } from '@/lib/conversation-surface';
import { FirstRunIntro } from '@/components/onboarding/FirstRunIntro';
import { LogosCover } from '@/components/LogosCover';
import { useFirstRun } from '@/components/useFirstRun';
import { wantsIntro } from '@/lib/first-run';
import { computationFacts, whatChanged } from '@/lib/model/inspect';
import { viewsFor } from '@/lib/model/views';
import { affectedBy } from '@/lib/model/deps';
import { readSeen, markSeen } from '@/lib/hints';
import { applyMapEdits, dropRemoved, readMapCommand, type MapEdit } from '@/lib/map-edit';
import { readViewRequest, viewSaid } from '@/lib/view-request';
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
// The personality and the person's own instructions are kept by
// lib/logos-personality.ts and lib/logos-style.ts, which Manage Account writes
// through too (components/account/PersonalitySettings.tsx).
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
  // The sentence somebody wrote during onboarding. /chat reads it (once —
  // the handover clears as it is read) and hands it down, so it reaches
  // whichever composer actually mounted rather than racing for it.
  initialInput,
  // WHICH Logos surface this is. It used to be assumed: the composer's model
  // menu said "Logos", ticked Logos as the current one and offered it as a
  // choice — from inside Logos 2. One surface telling somebody it was another.
  // Defaults to 'logos' so a caller that mounts this alone still works.
  model = 'logos',
  // The Core conversations, so the rail shows everything somebody has been
  // working on rather than only the half this surface made. Handed down by
  // /chat, which already holds them; absent where Logos is mounted alone, and
  // then the rail is exactly what it was.
  chats,
  onOpenChat,
  onOpenProject,
  // The person's Projects, and the three things a folder can do that only the
  // host knows how to do: open a chat in one, open its settings, make one.
  // Filing a LINE OF THINKING is this surface's own business (moveSession),
  // because the session is this surface's state; filing a chat row goes back
  // to the host, whose state the chat is.
  projects,
  onProjectSettings,
  onCreateProject,
  onMoveChat,
  autoSend = false,
  tourAfter = false,
}: {
  onSwitchModel?: (next: SocriaModel) => void;
  initialInput?: string;
  /** send initialInput on landing — onboarding's first thought, free once per account */
  autoSend?: boolean;
  /** run the tour once Socria's first reply is on screen — onboarding starts it */
  tourAfter?: boolean;
  model?: SocriaModel;
  chats?: { id: string; title: string; updatedAt: number; projectId?: string | null }[];
  onOpenChat?: (id: string) => void;
  /** a Project's folder name was pressed: open its home (on the Core surface) */
  onOpenProject?: (id: string) => void;
  /** undefined until the host has loaded them — the rail shows no folders before that */
  projects?: RailProject[];
  onProjectSettings?: (id: string) => void;
  /** make a Project; resolves to its id, or null if it could not be made */
  onCreateProject?: (name: string) => Promise<string | null>;
  onMoveChat?: (id: string, projectId: string | null) => void;
} = {}) {
  const { isLoaded, isSignedIn, user } = useUser();
  // The account's Conversation Style (Manage Account → Personalization):
  // carried by every generation request beside depth and the guard.
  const { ref: conversationStyleRef } = useConversationStyle(!!isSignedIn);
  const [unlocked, setUnlocked] = useState(false);
  // Don't hang behind Clerk: if it never initializes (preview builds), fall
  // through to the key gate rather than showing nothing forever.
  const [authSettled, setAuthSettled] = useState(false);

  const [sessions, setSessions] = useState<LogosSession[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [hydrating, setHydrating] = useState(true);
  const [railOpen, setRailOpen] = useState(true);
  /**
   * THE CHATS BAR AND THE HEADER, PUT AWAY — the control at the top right.
   * The thinking gets the whole window; one small button in the corner brings
   * both back. Kept per browser. (The ≡ at the top left still hides the chats
   * bar alone.)
   */
  const [chromeHidden, setChromeHidden] = useState(false);
  useEffect(() => {
    try {
      setChromeHidden(localStorage.getItem(CHROME_KEY) === 'hidden');
    } catch {}
  }, []);
  const hideChrome = useCallback((hide: boolean) => {
    setChromeHidden(hide);
    try {
      if (hide) localStorage.setItem(CHROME_KEY, 'hidden');
      else localStorage.removeItem(CHROME_KEY);
    } catch {}
  }, []);
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
  // Depth modes are the model's to have, not the surface's: Logos 3 has them
  // and offers them in the model picker, as Core 3.1 does; Logos 2 is
  // registered without them (supportsDepth: false), so it shows no depth
  // control and every request goes at the one depth it answers at.
  const depthOn = !!SOCRIA_MODELS[model]?.supportsDepth;
  const router = useRouter();

  // ── Socria One ────────────────────────────────────────────────────
  const [plan, setPlan] = useState<Plan>('free');
  // The server has answered — until then a One theme is trusted, not reset.
  const [planKnown, setPlanKnown] = useState(false);
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
  const [gateHref, setGateHref] = useState(`/sign-in?redirect_url=%2Fchat%3Fmodel%3D${model === 'logos-3' ? 'logos-3' : 'logos-2'}`);
  /** what Socria knows about this person, for the prompt and the viewer (accounts only) */
  const [understanding, setUnderstanding] = useState<UserUnderstanding | null>(null);
  const understandingRef = useRef<UserUnderstanding | null>(null);
  understandingRef.current = understanding;
  /** sessions in which the recurrence line has already been injected once */
  const recurrenceSaidRef = useRef<Set<string>>(new Set());
  /** attribution stashed across a sign-in, so a resumed checkout keeps its trigger */
  const resumeRef = useRef<{ trigger?: string; surface?: string; source?: string } | null>(null);
  // The boundary note is dismissible — said once, not nagged.
  const [limitNoteOff, setLimitNoteOff] = useState(false);
  // The extraction wanted to add something and the free map was full.
  const [mapCapped, setMapCapped] = useState(false);
  /** what the engine said about a model built (or refused) this turn */
  const [buildNote, setBuildNote] = useState<string | null>(null);
  // They have a Stripe customer behind them, so billing can be managed.
  const [oneManageable, setOneManageable] = useState(false);
  // Just came back from a completed checkout.
  const [oneWelcome, setOneWelcome] = useState(false);
  const one = plan === 'one';
  useThemeGuard(one, planKnown);
  // THE ACCOUNT, FROM HERE TOO.
  //
  // This surface had no account control at all — no sheet, no sign-out, no
  // route to /account, and so no University verification section either. That
  // would be a gap anywhere; it is a hole here, because a One member (which
  // includes a verified student) opens /chat and lands STRAIGHT in Logos.
  // The most-entitled people in the product had the least reachable account.
  const [acctOpen, setAcctOpen] = useState(false);
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
  /** the message the next one answers — set by Reply, shown above the composer */
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);

  // Seeded once, and only while the composer is still untouched: someone who
  // has started typing their own sentence must never have it replaced.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !initialInput) return;
    seeded.current = true;
    setInput(initialInput);
  }, [initialInput]);
  /** the Mind view in place of the map: how this chat connects to everything else */
  const [mindOpen, setMindOpen] = useState(false);
  /** this send is onboarding's sentence — the one the server lets through free, once */
  const firstThoughtRef = useRef(false);
  /** …and the server let it through free: one quiet line under the answer says so */
  const [gifted, setGifted] = useState(false);
  const autoSentRef = useRef(false);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // What the last extraction actually reorganized, so it can be seen happening.
  const [changed, setChanged] = useState<Set<string>>(new Set());
  const [deltaNote, setDeltaNote] = useState<string | null>(null);
  // SYNTHESIS: which scope is being read right now, and what is picked on the map.
  const [synthBusy, setSynthBusy] = useState<null | 'workspace' | 'selection'>(null);
  const [picked, setPicked] = useState<Set<string>>(() => new Set());

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
  // The part of an object of thought the person has selected — a row, an
  // entry, a parameter. Per person and ephemeral, like the workspace focus.
  const [objSel, setObjSel] = useState<{ obj: string; part: string } | null>(null);
  const objSelRef = useRef(objSel);
  objSelRef.current = objSel;
  // the part a description in the conversation last made or changed in a Live 3D scene — what "it" means next
  const sceneLastRef = useRef<string | null>(null);
  // asks the composer to take focus, with the caret where a filled-in form wants it
  const [composerFocus, setComposerFocus] = useState<{ n: number; caret?: number } | null>(null);
  const draftToComposer = (text: string, caret?: number) => {
    setInput(text);
    setComposerFocus((f) => ({ n: (f?.n ?? 0) + 1, ...(caret !== undefined ? { caret } : {}) }));
  };
  /** the object whose plane picture is on the Plot lens, so the picture follows it */
  const planeOfRef = useRef<string | null>(null);
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

  // ── Trace's structural half ───────────────────────────────────────
  // The map stays the store; this projects it into the shared workspace
  // vocabulary (lib/workspace) so Trace can WALK what a node rests on and what
  // rests on it, instead of asking a model to describe it. Only computed while
  // the Trace lens is actually open on a node, because projecting is O(map).
  //
  // Durable memory joins it when there is an account to read one from, which is
  // what lets a trace of something drawn a minute ago reach something said in
  // March. Fetched through ?scope=logos: this surface can export itself as an
  // image, so private material must never arrive here at all — a filter applied
  // in the browser is a filter that has already been sent.
  const [durable, setDurable] = useState<{
    nodes: unknown[];
    edges: unknown[];
    waiting: { nodeId: string; becauseId: string; becauseLabel: string; kind: 'recompute' | 'review'; distance: number; at: number }[];
  } | null>(null);
  const askedDurable = useRef(false);
  useEffect(() => {
    if (!cloud || !explore.open || explore.mode !== 'trace' || askedDurable.current) return;
    askedDurable.current = true;
    let live = true;
    void (async () => {
      try {
        const res = await fetch('/api/mind?scope=logos', { cache: 'no-store' });
        if (!res.ok) return;
        const j = await res.json();
        if (live) setDurable({ nodes: j.nodes ?? [], edges: j.edges ?? [], waiting: j.waiting ?? [] });
      } catch {
        // Trace works without it; what is lost is reach, not correctness.
      }
    })();
    return () => {
      live = false;
    };
  }, [cloud, explore.open, explore.mode]);

  const structure = useMemo(() => {
    if (!explore.open || explore.mode !== 'trace' || !explore.node) return null;
    let ws = projectMap(emptyWorkspace(), map);
    if (durable) {
      ws = projectMind(
        ws,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        { nodes: durable.nodes as any, edges: durable.edges as any, tombstones: [], pending: [] },
        { excludePrivate: true }
      );
      for (const w of durable.waiting) {
        const id = `mind:${w.nodeId}`;
        if (!ws.objects.has(id)) continue;
        ws = wsUpdate(
          ws,
          id,
          { stale: { because: `mind:${w.becauseId}`, label: w.becauseLabel, at: w.at, kind: w.kind, distance: w.distance } },
          'system',
          w.at
        );
      }
      // Joined by label, never merged: each copy keeps its own standing and its
      // own grounds (bridgeSurfaces, lib/workspace/adapters.ts).
      ws = bridgeSurfaces(ws);
    }
    return trace(ws, `map:${explore.node.id}`);
  }, [explore.open, explore.mode, explore.node, map, durable]);

  // Keeping a node: the one place in Logos that writes to durable memory. It
  // goes through the same write path as the Memory page, so a tombstone still
  // outranks it and a duplicate still comes back as the id of what is there.
  const [keepState, setKeepState] = useState<Record<string, string>>({});
  const keepNode = useCallback(
    async (node: { id: string; label: string; type: string }) => {
      setKeepState((k) => ({ ...k, [node.id]: 'sending' }));
      try {
        const res = await fetch('/api/mind/node', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: node.type,
            label: node.label,
            note: `kept from a Thinking Map (${node.id})`,
          }),
        });
        const j = await res.json().catch(() => null);
        if (!res.ok) throw new Error(j?.error || 'failed');
        if (j.ok === false) {
          setKeepState((k) => ({ ...k, [node.id]: j.say as string }));
          return;
        }
        setKeepState((k) => ({ ...k, [node.id]: 'kept' }));
        // It is durable now, so the next trace should be able to reach it.
        askedDurable.current = false;
      } catch {
        setKeepState((k) => ({ ...k, [node.id]: 'That could not be kept just now.' }));
      }
    },
    []
  );

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

  // ── the first model ──
  // What this person has already been taught, on every surface (lib/first-run.ts):
  // the Logos sequence runs once per person, on their own first map or model,
  // and never again on any device the record has been merged with.
  const firstRun = useFirstRun({ signedIn: !!isSignedIn, surface: 'logos' });
  // THERE IS NO LOGOS-ONLY ONBOARDING. The three-beat sequence that used to
  // open over a first map is gone: onboarding is one sequence for all of
  // Socria (components/onboarding/FirstRunIntro.tsx). What remains here is
  // the record of what the person did — facts about them, which the notes
  // found along the way read — and the map's arrival, once.
  const signalFirstMap = useCallback(
    (sig: 'map-drew' | 'model-built' | 'control-moved' | 'node-pressed' | 'asked' | 'action-taken') => {
      if (sig === 'map-drew' || sig === 'model-built') return firstRun.reach('logos.model');
      if (sig === 'control-moved') return firstRun.reach('logos.manipulated');
      if (sig === 'node-pressed' || sig === 'action-taken') return firstRun.reach('logos.inspected');
      if (sig === 'asked') return firstRun.reach('logos.asked');
      return false;
    },
    [firstRun]
  );
  // The emergence: the first map a person ever gets rises card by card and
  // its lines draw, for a few seconds, once — the moment their language
  // became structure. No coach marks; nothing to press.
  const [emerging, setEmerging] = useState(false);

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
  // ── the picture, as one half of a shared state ───────────────────
  //
  // WHAT THIS IS FOR. Somebody asked their black hole "what's the blue" and
  // got "if you're seeing blue, it might represent…" — from the thing that had
  // drawn it. The picture holds the answer (the disc's colour is the blackbody
  // colour of a temperature the code computed) and the conversation could not
  // reach it. These two lines are the reach: the mounted surface hands up a
  // function that reads its whole state, and a reply may hand back a short
  // list of changes to apply to it.
  //
  // PULLED AT SEND TIME, not held as state: the clock ticks sixty times a
  // second, and a state kept in React would re-render the entire app around a
  // number nobody is reading. The only moment it matters is the moment a
  // message goes.
  const vizRead = useRef<(() => VizModelState) | null>(null);
  const takeViz = useCallback((read: (() => VizModelState) | null) => {
    vizRead.current = read;
  }, []);
  const [vizOps, setVizOps] = useState<{ seq: number; ops: VizOp[] } | null>(null);
  /** the latest map extraction asked for; older answers are dropped */
  const mapSeqRef = useRef(0);
  /** patchSession, reachable from callbacks defined before it */
  const patchSessionRef = useRef<((id: string | null, fn: (s: LogosSession) => LogosSession, save?: boolean) => void) | null>(null);
  /** the trailing save after a surface edit */
  const adoptSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * Apply what the reply asked for — and the two kinds of op part company here.
   *
   * A VIEW OP changes how the model is looked at (a control, a layer, a slice, the
   * clock) and goes to the surface, which owns the camera and the frame.
   *
   * A MODEL OP changes the model: it removes a part, swaps a damper for a spring,
   * undoes, branches, deletes. Those cannot go to a renderer, because a renderer
   * has nothing to remove — the object lives in a document with a stable id and
   * revisions (lib/model/docs.ts), and the edit produces a new revision that the
   * whole surface is then rebuilt from. That is the difference between an edit and
   * a redraw, and this split is where it is enforced.
   */
  const applyVizOps = useCallback((ops: VizOp[], into: string | null = activeIdRef.current) => {
    if (!ops.length) return;
    // `set` GOES TO BOTH, and that is not a hedge.
    //
    // applyModelOps has a `case 'set'` whose comment says moving a control is a
    // change to the model that should be undoable — and MODEL_OPS did not list
    // `set`, so it never arrived: a reply saying "set the tax to 20" moved the
    // slider in the view and the document never heard about it. Undo could not
    // undo it and a reload reverted it.
    //
    // It goes to the view as well because a surface with no document behind it —
    // a model built straight from a proposal, a benchmark from the library — has
    // nothing for applyModelOps to write to, and dropping the op there would
    // take working sliders away. Applying it twice is harmless: setValue to a
    // value a control already has is a no-op, and ModelView resyncs from the
    // document's own revision when one exists.
    // `select` joins `set` in going to both. It is CANONICAL — linked views stay
    // in step by reading one selection rather than by messaging each other, and
    // "ask about this" has to be handed an identity — and it is also what the
    // view highlights, so it goes to the view too. It coalesces in the document's
    // history, so clicking around does not fill undo with clicks.
    const modelOps = ops.filter((o) => isModelOp(o) || o.op === 'set' || o.op === 'select');
    const viewOps = ops.filter((o) => !isModelOp(o));
    if (modelOps.length) {
      patchSessionRef.current?.(into, (sess) => {
        const map = sess.map ?? EMPTY_MAP;
        const ws = map.models ?? EMPTY_WORKSPACE;
        if (!ws.docs.length) return sess;
        const done = applyModelOps(ws, modelOps, { at: Date.now() });
        // A REFUSAL IS SAID. The engine's own words — "m1 is the only body"
        // — were thrown away here, while the reply, written "as though the
        // change has already happened", said it was removed. The note slot
        // carries what the engine actually did.
        if (!done.changed) {
          if (done.said.length) setBuildNote(done.said.join(' ').slice(0, 300));
          return sess;
        }
        return { ...sess, map: { ...map, models: done.workspace } };
      });
    }
    if (viewOps.length) setVizOps((prev) => ({ seq: (prev?.seq ?? 0) + 1, ops: viewOps }));
  }, []);

  /** the fields every Logos generation request carries */
  const guidance = () => ({
    // A surface with no depth modes answers at the one depth it has. The
    // stored depth is shared with the Core chat, so without this a "Deep"
    // chosen on Core 3.1 rode along into Logos with no control to see it by.
    depth: depthOn ? depthRef.current : ('balanced' as ThinkingDepth),
    guard: guardRef.current,
    // the character chosen for the account, above the dials and the
    // written instructions below it (lib/conversation-style.ts)
    conversationStyle: conversationStyleRef.current,
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
    storeStyle(next);
    setStyleUpdatedNote(true);
    return reply.slice(0, at).trimEnd();
  }

  /**
   * What the person should see of a still-streaming reply.
   *
   * Two things are held back: the REMEMBER line, and the block of changes to
   * the picture. Neither is prose, and watching `set m 8` being typed out one
   * character at a time would be watching the machinery rather than the
   * answer. stripVizOps works on a half-written block for exactly this reason.
   */
  const visibleStream = (acc: string) => {
    const at = acc.indexOf(REMEMBER_MARK);
    return stripVizOps(at === -1 ? acc : acc.slice(0, at).trimEnd());
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
    storeStyle(next);
    storePersonality(personaDraft);
  }

  // Saved somewhere else — Manage Account, or Logos in another tab — and used
  // from the next message here, without a reload.
  useEffect(() => {
    const read = () => {
      setStyleText(storedStyle());
      setPersona(storedPersonality());
    };
    const fromOtherTab = (e: StorageEvent) => {
      if (e.key === null || e.key === PERSONALITY_KEY || e.key === STYLE_KEY) read();
    };
    window.addEventListener(PERSONALITY_CHANGED, read);
    window.addEventListener('storage', fromOtherTab);
    return () => {
      window.removeEventListener(PERSONALITY_CHANGED, read);
      window.removeEventListener('storage', fromOtherTab);
    };
  }, []);

  function pickDepth(next: ThinkingDepth) {
    // Every depth is open on every plan. The routes clamp through
    // depthForPlan() against the same table, so the menu and the answer
    // always agree — including if a plan ever closes them again.
    if (!limits.allDepths && next !== FREE_DEPTH) {
      ask('depth-locked');
      return;
    }
    setDepth(next);
    try {
      localStorage.setItem(DEPTH_KEY, next);
    } catch {}
  }

  // Logos is one of the models, so switching away from it is a navigation,
  // not a setting. Write the choice where the Core chat reads it, then go —
  // /chat picks it up on mount instead of opening on whatever was there last.
  function pickModel(next: SocriaModel) {
    // The one you are already on. Compared against THIS surface rather than
    // the string 'logos', or picking Logos 2 from inside Logos 2 would count
    // as a switch and reload the room you are standing in.
    if (next === model) return;
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
    // Pressing "Socria chat" is a choice, and it outranks the automatic
    // default from here on — otherwise a member who wanted Core back would be
    // put into Logos again on the next visit, for ever.
    chooseModel(next);
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

  // The first map worth the name — four cards, or a model — rises once.
  useEffect(() => {
    if (!firstRun.ready || busy) return;
    const shaped = (map.nodes?.length ?? 0) >= 4 || !!map.models?.docs?.length;
    if (!shaped || firstRun.has('logos.model')) return;
    if (signalFirstMap(map.models?.docs?.length ? 'model-built' : 'map-drew')) {
      setEmerging(true);
      const t = setTimeout(() => setEmerging(false), 3200);
      return () => clearTimeout(t);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.nodes?.length, map.models?.docs?.length, firstRun.ready, busy]);

  // ONBOARDING'S SENTENCE GOES STRAIGHT THROUGH. Written on /onboarding, it is
  // sent the moment there is a session to send it in — they should land on
  // Socria answering them, not on their own sentence waiting in a box. It is
  // marked as the first thought, which the server lets through without
  // spending one of the month's chats (once per account, kept on the server).
  useEffect(() => {
    if (!autoSend || autoSentRef.current || !initialInput || hydrating || busy || !activeId) return;
    autoSentRef.current = true;
    seeded.current = true;
    firstThoughtRef.current = true;
    void send(initialInput).finally(() => {
      firstThoughtRef.current = false;
    });
    // send reads the state it needs when it runs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, initialInput, hydrating, busy, activeId]);

  // …and once the answer is in and the map has drawn, the tour: four notes,
  // once. It waits for the screen to be free — never over the guide, a sheet,
  // or the first map rising — and gives the map a few seconds at most.
  const [tourOpen, setTourOpen] = useState(false);
  const tourShownRef = useRef(false);
  const hasReply = messages.some((m) => m.role === 'assistant');
  const mapDrawn = (map.nodes?.length ?? 0) > 0 && !mapping;
  const screenBusy = guideOpen || styleOpen || emerging || explore.open || ctxPanel.open;
  useEffect(() => {
    if (tourShownRef.current || busy || !hasReply) return;
    let done = false;
    try {
      done = localStorage.getItem(LOGOS_TOUR_KEY) === '1';
    } catch {}
    if (!shouldRunTour({ done, justOnboarded: tourAfter, blocked: screenBusy })) return;
    const t = setTimeout(() => {
      tourShownRef.current = true;
      setTourOpen(true);
    }, mapDrawn ? 900 : 6000);
    return () => clearTimeout(t);
  }, [tourAfter, busy, hasReply, mapDrawn, screenBusy]);
  const endTour = useCallback(() => {
    setTourOpen(false);
    try {
      localStorage.setItem(LOGOS_TOUR_KEY, '1');
    } catch {}
  }, []);

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

  // THE THREAD FOLLOWS THE CONVERSATION — AND ONLY THE THREAD MOVES. This was
  // scrollIntoView, which scrolls every ancestor to bring the end into view,
  // overflow:hidden ones included: in Logos 3 it shifted the workspace itself
  // on every streamed token, so an expanded conversation jumped and the
  // composer could end up out of reach. Now only the thread's own scrollTop
  // changes, and a streaming reply follows only someone already at the end —
  // whoever scrolled up to read is left where they are.
  const threadRef = useRef<HTMLDivElement>(null);
  const atEndRef = useRef(true);
  useEffect(() => {
    const t = threadRef.current;
    if (t) t.scrollTop = t.scrollHeight;
    atEndRef.current = true;
  }, [messages.length]);
  useEffect(() => {
    const t = threadRef.current;
    if (t && atEndRef.current) t.scrollTop = t.scrollHeight;
  }, [streaming, busy]);

  // On mobile the rail is an overlay, so it must not start open across the
  // whole screen. One check at mount; resizing a desktop window later is a
  // choice the person can manage with the toggle.
  useEffect(() => {
    if (window.innerWidth <= 900) setRailOpen(false);
  }, []);

  /**
   * Put the drawer away after it has been used — but only where it IS a
   * drawer. /chat closes its sidebar on every row click because above 768px
   * the flag does not hide anything; here the same flag also owns a column of
   * the desktop grid, so closing it unconditionally would collapse the rail
   * of somebody who just picked a session with a mouse.
   */
  const usedRail = () => {
    if (window.innerWidth <= 900) setRailOpen(false);
  };

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
      const st = storedStyle();
      if (st) setStyleText(st);
    });
    load(() => {
      setPersona(storedPersonality());
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

  // THE GUIDE NO LONGER OPENS ITSELF. A modal of miniature demonstrations
  // before a word has been said was Logos explaining itself in place of
  // doing the thing; the first map does the explaining now (the sequence
  // below), on the person's own words. In Logos 2 the guide stays behind the
  // "?" in the header for anyone who wants the walk-through; Logos 3 has no
  // "?".
  void GUIDE_SEEN_KEY;

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
      // What the client believes it holds. The routes check for themselves.
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
        setPlanKnown(true);
        try {
          // a reward's Socria One is not remembered as a belief: it ends, and the belief would not
          if (json.plan === 'one' && !json?.promo?.only) localStorage.setItem(ONE_KEY_STORAGE, '1');
          else localStorage.removeItem(ONE_KEY_STORAGE);
        } catch {}
      }
      setOneManageable(!!json?.manageable);
    } catch {
      // Offline or unconfigured — keep whatever we believed.
    }
  }, [keyHeaders]);

  // A reward landed, or promotional time started or ended (components/rewards/useRewards): ask again.
  useEffect(() => {
    const again = () => void syncPlan();
    window.addEventListener(PLAN_CHANGED, again);
    return () => window.removeEventListener(PLAN_CHANGED, again);
  }, [syncPlan]);

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
      // No local judgement: /api/logos/redeem checks the code against the
      // server's environment and is the only thing that can grant One.
      const ok = await fetch('/api/access/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typed }),
      })
        .then((r) => (r.ok ? r.json().catch(() => null) : null))
        .then((j) => j?.ok === true && j?.scope === 'one')
        .catch(() => false);
      if (!ok) return false;
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

  // ── Logos 3 — two people in one line of thinking ──────────────────
  //
  // The whole of the room lives in this hook and the bar it feeds; the rest
  // of this surface calls it at three points (a message sent, a map
  // extracted, the request that tells Socria who is in the room) and is
  // otherwise untouched. On a model without `collab` the hook is disabled
  // and none of this runs. Restored from the parked room — see
  // docs/LOGOS-ROOMS-PARKED.md for why each guard below exists.
  const collab = !!SOCRIA_MODELS[model]?.collab;
  const joinCode = useMemo(
    () => (typeof window === 'undefined' ? null : joinCodeFrom(window.location.search)),
    []
  );
  // A SIGNED-OUT PERSON OPENING A THINK TOGETHER ROOM LINK may be about to make an account to join
  // it. If they do, the host brought them to Socria (Socria Rewards, "Give 7, Get 7"): the server is
  // asked to remember that, once. It changes nothing about the room or the gate in front of it.
  useEffect(() => {
    if (!isLoaded || isSignedIn || !joinCode) return;
    void fetch('/api/rewards/invite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ room: joinCode }),
    }).catch(() => {});
  }, [isLoaded, isSignedIn, joinCode]);
  /** every session id that has ever been a shared room in this tab */
  const sharedIdsRef = useRef<Set<string>>(new Set());
  const room = useLogosCollab({
    enabled: collab,
    identity: { id: user?.id || '', name: cleanName(user?.firstName || user?.username, 'You') },
    joinCode,
    getSession: () => sessionsRef.current.find((x) => x.id === activeIdRef.current) ?? null,
    setSession: (shared) => {
      sharedIdsRef.current.add(shared.id);
      // the other person's words reach the map too — the extractor reads this record
      if (shared.id === activeIdRef.current) chronRef.current = withArrived(chronRef.current, shared.messages);
      // A guest with no session of its own adopts the host's; both then keep
      // the shared session as the active one, merged by the reducer.
      applySessions(
        sessionsRef.current.some((x) => x.id === shared.id)
          ? sessionsRef.current.map((x) => (x.id === shared.id ? shared : x))
          : [shared, ...sessionsRef.current]
      );
      if (activeIdRef.current !== shared.id) setActiveId(shared.id);
    },
  });
  const roomRef = useRef(room);
  roomRef.current = room;

  /** sessions that are someone else's, opened here because they were shared */
  const foreignIdsRef = useRef<Set<string>>(new Set());
  /** the shared-session sync for the active line of thinking (useSharedSession) */
  const togetherRef = useRef<ReturnType<typeof useSharedSession> | null>(null);

  const persist = useCallback(
    async (s: LogosSession) => {
      // A SHARED ROOM IS NOT SAVED TO ANYBODY'S CONVERSATION ROW. The host's
      // client holds the merged session — both people's words — and saving it
      // would put the guest's thinking under the host's account, where the
      // guest could neither export nor delete it. The room's own event log is
      // the shared record, and every row in it carries who wrote it. The same
      // after leaving: the session still in memory is the merged one.
      if (roomRef.current?.active || sharedIdsRef.current.has(s.id)) return;
      // A SHARED line of thinking is written through the share routes, never
      // as a whole row: turns are appended and the map is sent against the
      // version it was drawn on, so two people working at once both land
      // (lib/share/sync.ts). Someone else's is never saved as one's own.
      const t = togetherRef.current;
      if (t?.active && s.id === activeIdRef.current) {
        // what the server lacks, read from the session when the write goes
        void t.push();
        t.keepOwn(s.draft, s.contexts);
        return;
      }
      if (foreignIdsRef.current.has(s.id)) return;
      if (!cloud) {
        saveLocal(sessionsRef.current);
        return;
      }
      try {
        const res = await fetch('/api/conversations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: { ...s, kind: 'logos' } }),
        });
        // the stored map changed: Socria Rewards reads progress from it (components/rewards/useRewards)
        if (res.ok) window.dispatchEvent(new Event(SESSION_SAVED));
      } catch {
        // A failed save must never interrupt thinking. The session stays in
        // memory and the next turn tries again.
      }
    },
    [cloud]
  );

  /**
   * Update ONE session, by id, and save it.
   *
   * BY ID, because a reply lands when it lands. The landed turn and the ops
   * the reply carried used to be written into whichever session was active at
   * that moment — so a reader who clicked another line of thinking while a
   * reply streamed got session A's transcript written into session B, and
   * persisted there. Everything that belongs to the session that was SENT
   * patches that session.
   */
  const patchSession = useCallback(
    (id: string | null, fn: (s: LogosSession) => LogosSession, save = true) => {
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
  patchSessionRef.current = patchSession;

  // THINK TOGETHER: the active line of thinking, if it is shared, kept in step
  // with everyone else who has it open — turns, the map, its models, objects
  // and plots (all of which live in the map), presence and pointers.
  const together = useSharedSession({
    // Any Logos surface, not only Logos 3: a line of thinking in a shared
    // Project can be opened on Logos 2 too, and a whole-row save from there
    // would write over a collaborator's map. The hook does nothing more than
    // one read for a session nobody else can reach.
    enabled: !!isSignedIn && !room.active,
    sessionId: activeId,
    getLocal: (id) => {
      const cur = sessionsRef.current.find((x) => x.id === id);
      return cur ? { messages: cur.messages as never, map: cur.map, title: cur.title } : null;
    },
    busy,
    // What the server holds, already JOINED with this screen (lib/share/sync.ts
    // absorb) — for the session it was read for, never whichever is open now.
    // Nothing said here is wiped by someone else's write landing first.
    onRemote: (id, r) => {
      patchSession(
        id,
        (cur) => ({
          ...cur,
          messages: r.messages as never,
          map: r.map !== undefined ? ((r.map as LogosSession['map']) ?? cur.map) : cur.map,
          title: r.title || cur.title,
        }),
        false
      );
      const cur = sessionsRef.current.find((x) => x.id === id);
      if (cur && id === activeIdRef.current) {
        mapRef.current = cur.map;
        // the extractor's record gains what arrived; a thread opened inside a
        // node, kept only there, stays in it
        chronRef.current = withArrived(chronRef.current, cur.messages);
      }
    },
  });
  togetherRef.current = together;
  /** may this person add to the shared line of thinking open now? */
  const togetherReadOnly = together.active && together.role !== 'owner' && together.role !== 'editor';
  /**
   * The name this person's words go under — the one the share routes and the
   * room sign them with, so a quote of their message reads the same on every
   * screen and in what Socria is shown.
   */
  const myName =
    together.people.find((p) => p.you)?.name ||
    (room.active ? room.me.name : '') ||
    cleanName(user?.firstName || user?.username, 'Someone');
  // a reply belongs to the conversation it was started in
  useEffect(() => {
    setReplyTo(null);
  }, [activeId]);
  const [shareOpen, setShareOpen] = useState(false);
  // this person's pointer over the shared map, in map coordinates
  useMapPointer(together.active, together.point);
  // COMMENTS on a shared line of thinking — on a card, or on the whole of it.
  // Read by anyone it is shared with; written by commenters and up (the
  // server decides, lib/share/collab.ts).
  const comments = useComments('conversation', activeId, together.active);
  const [commentsOpen, setCommentsOpen] = useState(false);
  /** the card whose threads the panel is showing, when opened from a pin */
  const [commentsOn, setCommentsOn] = useState<string | null>(null);
  useEffect(() => {
    setCommentsOpen(false);
    setCommentsOn(null);
  }, [activeId]);
  /** Update the active session and save it. */
  const patchActive = useCallback(
    (fn: (s: LogosSession) => LogosSession, save = true) => patchSession(activeIdRef.current, fn, save),
    [patchSession]
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
            // ── EVERY CONVERSATION, NOT ONLY THE ONES THAT STARTED HERE ──
            //
            // This read `.filter(c => c.kind === 'logos')`, which made `kind` a
            // GATE: a conversation begun in Core was not merely unopened on
            // this surface, it was ABSENT — and somebody who had typed four
            // model specifications into Core chats could not open any of them
            // on the surface that draws models.
            //
            // lib/session-rail.ts had already settled the principle for the
            // rail — "the surface is an implementation detail of how it
            // started" — and this loader never got it. `kind` is a memory of
            // where a conversation was last left (lib/conversation-surface.ts),
            // not a wall around it, so every one of them loads here and the
            // picker decides which surface opens the one you are in.
            list = (json.conversations || [])
              .map((c: any) => ({
                id: c.id,
                title: c.title,
                messages: Array.isArray(c.messages) ? c.messages : [],
                // RE-VALIDATED ON THE WAY IN, not trusted. A stored map may
                // carry model documents built on an earlier turn, and they are
                // worth what they can still prove — sanitizeMap's stored mode
                // puts every revision back through the engine and drops a model
                // that no longer computes (lib/model/propose.ts revalidate).
                map: c.map?.nodes ? sanitizeMap(c.map, { trust: 'stored' }) : { ...EMPTY_MAP },
                draft:
                  c.draft && typeof c.draft.html === 'string'
                    ? { title: String(c.draft.title ?? ''), html: c.draft.html }
                    : undefined,
                contexts: sanitizeContexts(c.contexts),
                projectId: typeof c.projectId === 'string' ? c.projectId : null,
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
      // …or a new line of thinking begun from a Project's home: /chat?in=<id>
      let startIn: string | null = null;
      let sharedLink = false;
      try {
        const q = new URLSearchParams(window.location.search);
        wanted = q.get('s');
        sharedLink = q.get('shared') === '1';
        const pin = q.get('in');
        startIn = pin && /^[A-Za-z0-9_-]{1,80}$/.test(pin) ? pin : null;
      } catch {}

      // SOMEONE ELSE'S line of thinking, shared with them (/chat?s=<id>&shared=1):
      // read through the share gate and opened alongside their own — never
      // saved to their conversations (persist() skips it), always written
      // through the share routes (useSharedSession).
      if (wanted && sharedLink && isSignedIn && !list.some((x) => x.id === wanted)) {
        try {
          const r = await fetch(`/api/shared/conversation/${encodeURIComponent(wanted)}`, { cache: 'no-store' });
          const j = r.ok ? await r.json() : null;
          const c = j?.conversation;
          if (c && c.kind === 'logos') {
            foreignIdsRef.current.add(c.id);
            list = [
              {
                ...emptySession(),
                id: c.id,
                title: c.title || UNTITLED,
                messages: Array.isArray(c.messages) ? c.messages : [],
                map: c.map ?? { ...EMPTY_MAP },
                projectId: c.projectId ?? null,
                updatedAt: Number(c.updatedAt) || Date.now(),
              },
              ...list,
            ];
          }
        } catch {
          /* not reachable: they land on their own sessions */
        }
      }
      if (cancelled) return;
      if (list.length === 0) list = [emptySession()];
      let sorted = sortSessions(list);
      // A first message chosen elsewhere goes into a line of thinking of its
      // own, not on top of the one they were last in — without going through
      // newSession(), which asks and spends; nothing is spent until they send.
      if (pendingStart && !wanted && sorted[0].messages.length > 0) {
        sorted = [emptySession(), ...sorted];
      }
      // Begun from a Project's home: an empty session filed there, nothing
      // spent until the first message — the same as pendingStart above.
      if (startIn && !wanted) {
        const fresh = { ...emptySession(), projectId: startIn };
        sorted = [fresh, ...sorted];
        wanted = fresh.id;
        try {
          const u = new URL(window.location.href);
          u.searchParams.delete('in');
          window.history.replaceState({}, '', u.pathname + u.search);
        } catch {}
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

  // A Project that no longer exists unfiles what was in it. The server moves
  // a deleted Project's conversations out; this is the same fact on the client,
  // so the next save of one of them does not file it back under a folder that
  // is gone. Only once the host has actually loaded the list — `undefined` is
  // "not yet", and clearing against an empty list that merely had not arrived
  // would unfile everything on every load.
  useEffect(() => {
    if (!projects) return;
    const live = new Set(projects.map((p) => p.id));
    if (!sessionsRef.current.some((s) => s.projectId && !live.has(s.projectId))) return;
    applySessions(sessionsRef.current.map((s) => (s.projectId && !live.has(s.projectId) ? { ...s, projectId: null } : s)));
  }, [projects, applySessions]);

  // The counts belong to a conversation as much as to a month, so they are
  // re-read whenever the conversation on screen changes.
  useEffect(() => {
    void refreshUsage(activeId);
  }, [activeId, plan, refreshUsage]);

  function switchSession(id: string) {
    setPicked(new Set());
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
    // The engine's note and the last reply's ops belong to the session they
    // were made in; carried over, the ops replayed onto the next surface.
    setBuildNote(null);
    setVizOps(null);

    // ── A CONVERSATION ARRIVING HERE WITH A HISTORY AND NO MAP ──────
    //
    // Every conversation can be opened on this surface now, which means most
    // of them arrive having been talked through somewhere else. Starting them
    // blank would show an empty map under a thread twenty turns long and read
    // as the map being broken.
    //
    // So the extractor runs once, over everything already said — which is what
    // refreshMap does anyway, since it always sends the whole conversation.
    // ONCE: `owesExtraction` is false the moment a map has nodes, because
    // re-running would overwrite anything moved, renamed or deleted by hand and
    // the extractor cannot tell which of those were theirs.
    const opened = sessionsRef.current.find((x) => x.id === id);
    if (opened && owesExtraction({ messages: opened.messages, map: opened.map }, { logosSurface: true })) {
      refreshMap();
    }
  }

  function newSession(projectId: string | null = null) {
    // The month's count is the server's, and it is spent when a line of
    // thinking BEGINS rather than when an empty one is created — so opening
    // Logos and closing it again costs nothing. Everything already open stays
    // open and stays usable; what runs out is starting another.
    if (!one && chatsSpent) {
      ask('chats-spent');
      return;
    }
    // Begun inside a folder, it is filed there from its first save: the
    // session carries its Project and persist() sends it with everything else.
    const fresh = projectId ? { ...emptySession(), projectId } : emptySession();
    applySessions([fresh, ...sessionsRef.current]);
    switchSession(fresh.id);
    // A brand-new empty session isn't worth a round trip until it has content.
  }

  /**
   * File a line of thinking under a Project, or take it out of one.
   *
   * The same PATCH a Core chat uses (app/api/conversations/route.ts,
   * moveToProject), so the server re-ties what the session taught in the
   * Mind Graph the same way. Optimistic, and put back if the server refuses.
   * `updatedAt` is left alone: filing is not thinking, and the rail is
   * ordered by thinking.
   */
  async function moveSession(id: string, projectId: string | null) {
    const current = sessionsRef.current.find((s) => s.id === id);
    if (!current || (current.projectId ?? null) === projectId) return;
    const before = sessionsRef.current;
    applySessions(before.map((s) => (s.id === id ? { ...s, projectId } : s)));
    // Not saved yet: its first save will carry the folder with it.
    if (!cloud || !current.messages.length) return;
    try {
      const res = await fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, projectId }),
      });
      if (!res.ok) throw new Error('refused');
    } catch {
      applySessions(before);
      setError('That line of thinking could not be moved.');
    }
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

  // The gate is judged by the server, not here. Comparing a typed code
  // against a constant in this file is what put both codes in the public
  // bundle; the page now forwards what was typed and keeps only the answer.
  async function unlockWith(code: string): Promise<boolean> {
    const typed = code.trim();
    let scope: 'core' | 'one' | null = null;
    try {
      const res = await fetch('/api/access/unlock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: typed }),
      });
      const json = res.ok ? await res.json().catch(() => null) : null;
      if (json?.ok) scope = json.scope === 'one' ? 'one' : 'core';
    } catch {
      /* offline, or the gate is not configured — treated as a wrong code */
    }
    if (!scope) return false;
    setUnlocked(true);
    try {
      localStorage.setItem(KEY_STORAGE, '1');
    } catch {}
    // The One code opens everything at once, and a signed-in redemption is
    // written to the account so it follows them.
    if (scope === 'one') void takeOne(typed);
    return true;
  }

  // ── map ────────────────────────────────────────────────────────────
  function refreshMap(contextsOverride?: Record<string, NodeContext[]>) {
    const forSession = activeIdRef.current;
    // SEQUENCED. Two extractions in flight — a send and a focus-thread send,
    // or a switch and a send — could resolve out of order and the older map
    // overwrote the newer, models included.
    const seq = ++mapSeqRef.current;
    // What was SENT, so the echo can be told from news: the server hands the
    // request-time workspace back unchanged when the turn proposed nothing.
    const sentModels = JSON.stringify(mapRef.current.models ?? null);
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
          if (json?.map && activeIdRef.current === forSession && seq === mapSeqRef.current) {
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
              // THE SERVER'S MODELS ARE AN ECHO UNLESS IT BUILT SOMETHING.
              // The route returns the workspace it was sent; by the time it
              // returns, the reply's ops have usually edited the live one —
              // "remove the damper" updated the picture, then reverted when
              // the extraction landed. The live workspace wins over an echo
              // of what was sent; a workspace the server changed wins over
              // both.
              const echoed = JSON.stringify(json.map.models ?? null) === sentModels;
              const models = echoed ? s.map?.models : json.map.models;
              // THE LIVE OBJECTS WIN, too. An operation taken while the
              // extraction was in flight is the person's; the server may only
              // ADD an object, never roll one back (lib/objects/core.ts).
              const objects = mergeSpaces(s.map?.objects, json.map.objects);
              const unbound = { ...json.map, ...(viz ? { viz } : {}), ...(models ? { models } : {}), ...(objects ? { objects } : {}) };
              if (!models) delete (unbound as { models?: unknown }).models;
              if (!objects) delete (unbound as { objects?: unknown }).objects;
              // A matrix the extractor wrote into a node is drawn as the
              // object when it IS one of its computed states — and is not
              // shown as a result when nothing computed it.
              const map = bindNodes(unbound as TMap, s.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'));
              // What the person took off stays off, whatever the extractor
              // made of a transcript that still mentions it (lib/map-edit.ts).
              const kept = dropRemoved(map, s.map?.removed);
              // Shared: the host draws, both see it. onLocalMap returns the
              // map with each node attributed to whoever it was drawn from,
              // so the local view shows the same author dots the other
              // person sees; alone it returns the map unchanged.
              const shown =
                roomRef.current.active && sharedIdsRef.current.has(s.id)
                  ? roomRef.current.onLocalMap(kept as TMap)
                  : kept;
              return { ...s, map: shown, contexts };
            });
            setChanged(new Set(delta.changed));
            setDeltaNote(summarizeDelta(delta));
            // The server says whether this line of thinking outgrew a free map.
            setMapCapped(!!json.capped);
            // …and what the engine did with a model this turn proposed. A
            // refusal is as much news as a build: "I can hold the structure but
            // I need a value for the mass" is the useful state, and it would
            // otherwise be invisible.
            //
            // AND A TURN THAT ASKED FOR A MODEL AND GOT NONE SAYS SO. That case
            // used to be completely silent: the map came back with a plausible
            // node on it and nothing told the person that the thing they asked
            // to be BUILT had not been. The server settles the ask against the
            // result (lib/model/ask.ts) and names which kind of failure it was,
            // so what appears here is the actual reason rather than an absence.
            if (json.build?.says) {
              const b = json.build;
              const left: string[] = Array.isArray(b.unanswered) ? b.unanswered : [];
              const note = [
                String(b.says),
                // Built, but not everything they named made it in. Worth saying:
                // silently dropping a variable somebody asked for is how a model
                // ends up answering a question nobody put.
                left.length
                  ? `You named ${left.join(', ')}, which ${left.length === 1 ? 'is' : 'are'} not in it — say so and I will add ${left.length === 1 ? 'it' : 'them'}.`
                  : '',
              ]
                .filter(Boolean)
                .join(' ');
              setBuildNote(note.slice(0, 300));
            } else {
              // A turn with no build dismisses the last one's note — it was
              // never cleared, so "built …" outranked the delta line forever.
              setBuildNote(null);
            }
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

    // The state of the picture at this instant. Taken before the request so
    // the same snapshot is both what the model was told and what its answer is
    // checked against — a control moved while the reply streams cannot make a
    // command land somewhere the model never saw.
    const sentViz = vizRead.current?.() ?? null;
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
          // A node opened beside the picture is still a conversation about
          // the picture: "why does this one curve" is asked here as often as
          // in the main thread.
          ...(sentViz ? { vizState: sentViz } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(failureText(body));
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
      applyVizOps(parseVizOps(acc, sentViz));
      acc = stripVizOps(acc);
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
    void send(input, ready, replyTo);
  }

  /**
   * The person edits the map by hand — from a card's menu, a key, or a
   * sentence in the conversation. Applied here, deterministically, and saved;
   * no model is consulted about whether to do what they asked. A removal is
   * remembered on the map (`removed`) so the next extraction cannot undo it.
   */
  function editMap(edits: MapEdit[]): string | null {
    const current = sessionsRef.current.find((x) => x.id === activeIdRef.current);
    if (!current) return null;
    const out = applyMapEdits(current.map, edits);
    if (!out.applied.length) {
      if (out.refused.length) setError(out.refused[0]);
      return null;
    }
    const liveIds = new Set(out.map.nodes.map((n) => n.id));
    patchActive((s) => {
      // Grounding keyed on a removed node would linger invisibly.
      const contexts = Object.fromEntries(Object.entries(s.contexts ?? {}).filter(([id]) => liveIds.has(id)));
      return { ...s, map: out.map, contexts };
    });
    const said = out.applied.map((a) => a.said).join(' ');
    const before = new Set(current.map.nodes.map((n) => n.id));
    const fresh = out.map.nodes.filter((n) => !before.has(n.id)).map((n) => n.id);
    setChanged(new Set(out.applied.flatMap((a) => ('id' in a.edit ? [a.edit.id] : 'from' in a.edit ? [a.edit.from, a.edit.to] : fresh))));
    setDeltaNote(said);
    return said;
  }

  // ── SYNTHESIS: STRUCTURE → UNDERSTANDING ─────────────────────────
  //
  // Socria reads the map the person built — not the chat — and holds up a
  // mirror: what it amounts to, where it is weak, what it does not yet hold
  // (lib/logos-synthesis.ts). The synthesis lands in the conversation as
  // itself, never writes to the map, and anything it suggests enters the map
  // only when the person takes it — marked as Socria's for good.
  async function synthesize(kind: 'workspace' | 'selection') {
    const sid = activeIdRef.current;
    const s = sessionsRef.current.find((x) => x.id === sid);
    if (!sid || !s || synthBusy) return;
    const ids = kind === 'selection' ? [...picked] : [];
    setSynthBusy(kind);
    setError(null);
    try {
      const res = await fetch('/api/logos/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          map: s.map,
          messages: s.messages.slice(-8).map((m) => ({ role: m.role, content: m.content, ...(m.synthesis ? { synthesis: true } : {}) })),
          scope: { kind, ids },
          // What the next synthesis compares against: the last one's snapshot.
          ...(kind === 'workspace' && lastSynthesis(s.messages) ? { since: lastSynthesis(s.messages) } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      const syn = res.ok ? sanitizeSynthesis(json?.synthesis) : undefined;
      if (!syn) throw new Error(json?.error || 'Socria could not read the map just now. Try again in a moment.');
      const said: Msg = { id: newMsgId(), at: Date.now(), role: 'assistant', content: synthesisText(syn), synthesis: syn };
      // in a room it goes through the room's record, so it is on both screens and stays there
      if (roomRef.current.active && sharedIdsRef.current.has(sid ?? '')) roomRef.current.onLocalReply(said);
      else patchSession(sid, (x) => ({ ...x, messages: [...x.messages, said] }));
      if (kind === 'selection') setPicked(new Set());
      if (workspaceOn) setDockOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Socria could not read the map just now.');
    } finally {
      setSynthBusy(null);
    }
  }

  /** The person's choice on something a synthesis offered — remembered on the synthesis itself. */
  function markTaken(synId: string, key: string, v: 'added' | 'dismissed') {
    patchActive((x) => ({
      ...x,
      messages: x.messages.map((m) =>
        m.synthesis?.id === synId ? { ...m, synthesis: { ...m.synthesis, taken: { ...(m.synthesis.taken ?? {}), [key]: v } } } : m
      ),
    }));
  }

  function focusComposer() {
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>('.lg-composer textarea');
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }

  const synthProps = (syn: Synthesis, latest: boolean) => ({
    synthesis: syn,
    latest,
    onNext: (n: Next) => {
      if (n.id === 'continue' || !n.say) return focusComposer();
      void send(n.say);
    },
    onPossibility: (p: Possibility, act: 'explore' | 'add' | 'dismiss') => {
      if (act === 'explore') {
        setInput(`Let's explore this: ${p.text}`);
        focusComposer();
      } else if (act === 'add') {
        if (editMap([{ op: 'add', node: { label: p.label, type: p.type, origin: 'socria' } }])) markTaken(syn.id, p.id, 'added');
      } else markTaken(syn.id, p.id, 'dismissed');
    },
    onReading: (key: string, item: SynthRef, act: 'add' | 'dismiss') => {
      if (act === 'add') {
        const label = item.text.length > 90 ? item.text.slice(0, 89).trimEnd() + '…' : item.text;
        if (editMap([{ op: 'add', node: { label, type: 'value', role: 'value', origin: 'socria' } }])) markTaken(syn.id, key, 'added');
      } else markTaken(syn.id, key, 'dismissed');
    },
    onRef: (id: string) => {
      setChanged(new Set([id]));
      if (workspaceOn) setFocus({ kind: 'node', id });
    },
  });
  // RESET VIEW — confirmed in "+ View". Everything about how Logos 3 is
  // ARRANGED goes back to how it starts: one surface (the model if there is
  // one, else the map), the conversation below, the map's tabs on top at 100%.
  // Nothing the person thought is touched: no message, node or model changes.
  function resetView() {
    changeLayout(singleLayout(wsHasModel ? 'model' : 'map'));
    moveDock('bottom');
    try {
      localStorage.removeItem(DOCK_KEY);
    } catch {}
    setDockOpen(false);
    setFocus(null);
    setPicked(new Set());
    window.dispatchEvent(new Event(VIEW_RESET));
  }

  const lastSynthIndex = (() => {
    for (let i = messages.length - 1; i >= 0; i--) if (messages[i].synthesis) return i;
    return -1;
  })();

  /** The objects of thought, written back into the active line of thinking. */
  function commitObjects(space: ObjectSpace, touched?: ThoughtObject | null) {
    // A 2 × 2 matrix whose plane picture is on screen: the picture is the
    // same object seen another way, so it follows the object — computed from
    // the new entries, never redrawn from a description.
    let viz = mapRef.current.viz;
    if (touched && touched.kind === 'matrix' && planeOfRef.current === touched.id && viz?.kind === 'matrix') {
      const rows = (touched.states[touched.at] as MatrixState).rows;
      const next = sanitizeViz({ ...viz, matrix: rows.map((r) => r.map((v) => { const [n, d] = v.split('/'); return Number(n) / Number(d ?? 1); })) });
      if (next) viz = next;
    }
    mapRef.current = { ...mapRef.current, objects: space, ...(viz ? { viz } : {}) };
    patchActive((s) => ({ ...s, map: { ...(s.map ?? EMPTY_MAP), objects: space, ...(viz ? { viz } : {}) } }));
  }

  /**
   * THE OBJECTS IN A MESSAGE, BEFORE ANYTHING ELSE. A matrix or a function
   * written in it becomes an object the person can work on. An operation
   * written in it ("R2 ← R2 − 3R1") is computed on the object it is about,
   * here and exactly — and the reply is then told what THEIR step did, never
   * asked to work it out (lib/objects/).
   */
  function takeObjects(content: string, atts: Attachment[]) {
    const space0 = spaceOf(mapRef.current);
    const found = discover(space0, content, 'person');
    let space = found.space;
    for (const a of atts) {
      const t = a.kind === 'note' ? a.text : a.reading;
      if (t) space = discover(space, t, 'source').space;
    }
    let lastStep: { obj: string; said: string } | null = null;
    let refused: string | null = null;
    let touched: ThoughtObject | null = null;
    // a message that brings an object in is not also an operation on it
    if (space === space0) {
      const read = readOperation(space, content, objSelRef.current?.obj);
      if (read) {
        const r = applyObjectOp(space, read.id, read.op, read.args, { by: 'person' });
        if (r.ok) {
          space = r.space;
          touched = r.obj;
          lastStep = { obj: read.id, said: r.step.said };
        } else refused = r.why;
      }
    }
    // THE SCENE, BY CONVERSATION. With a Live 3D panel open, a message that reads fully as a description of
    // the scene is built — one step for the whole message, undone whole — and said in the conversation. One
    // that is plainly a description but could only be read in part builds nothing, and says what was not
    // read. Anything else is an ordinary message (lib/objects/scene-chat.ts).
    let scene: { said: string } | null = null;
    const open = space === space0 && !refused && !atts.length ? openScene(space) : null;
    if (open) {
      const st = open.obj ? (currentOf(open.obj) as SceneState) : EMPTY_SCENE;
      const sel = objSelRef.current;
      const turn = sceneTurn(content, st, { selected: sel && open.obj && sel.obj === open.obj.id ? sel.part : null, last: sceneLastRef.current });
      if (turn?.kind === 'partial') scene = { said: turn.said };
      else if (turn?.kind === 'build') {
        let sp = space;
        let id = open.obj?.id ?? null;
        if (!id) {
          const n = sp.objs.filter((o) => o.kind === 'scene').length;
          const made = createObject(sp, 'scene', EMPTY_SCENE, { name: n ? `Scene${n + 1}` : 'Scene', origin: 'person' });
          if (made) {
            sp = made.space;
            id = made.obj.id;
          } else scene = { said: 'Nothing was built: a line of thinking holds at most eight objects, and this one is full.' };
        }
        if (id) {
          // every operation of the description shares one moment, so undo takes the whole of it back
          const at = Date.now();
          let why: string | null = null;
          let obj: ThoughtObject | null = null;
          for (const o of turn.reading.ops) {
            const r = applyObjectOp(sp, id, o.op, o.args, { by: 'person', at });
            if (!r.ok) {
              why = r.why;
              break;
            }
            sp = r.space;
            obj = r.obj;
          }
          if (why) scene = { said: `Nothing was built: ${why}` };
          else {
            space = sp;
            touched = obj;
            scene = { said: turn.said };
            if (!open.obj && wsLayout) changeLayout(configurePanel(wsLayout, open.panel.id, { obj: id }));
            const part = turn.reading.changes.added.at(-1) ?? turn.reading.changes.changed.at(-1) ?? null;
            if (part) {
              // what it made is in hand, as it would be had they clicked it — so "make it red" next is about it
              sceneLastRef.current = part;
              setObjSel({ obj: id, part });
              if (workspaceOn) setFocus({ kind: 'part', obj: id, part });
            }
          }
        }
      }
    }
    if (space !== space0) commitObjects(space, touched);
    return { lastStep, refused, claims: found.claims, scene };
  }

  /** The Live 3D panel the conversation builds in — the one showing the selected scene, else the first — and its scene, if it has one. */
  function openScene(space: ObjectSpace): { panel: PanelNode; obj: ThoughtObject | null } | null {
    if (!workspaceOn || !wsLayout) return null;
    const ps = panelsOf(wsLayout).filter((p) => p.type === 'scene');
    if (!ps.length) return null;
    const objOfPanel = (p: PanelNode) => {
      const pinned = p.config?.obj ? space.objs.find((o) => o.id === p.config!.obj && o.kind === 'scene') : null;
      return pinned ?? (p.config?.obj ? null : space.objs.find((o) => o.kind === 'scene') ?? null);
    };
    const sel = objSelRef.current?.obj;
    const panel = ps.find((p) => sel && objOfPanel(p)?.id === sel) ?? ps[0];
    return { panel, obj: objOfPanel(panel) };
  }

  /** Something done TO an object in the workspace: computed here, and only here. */
  function onObject(a: ObjectAction): { ok: boolean; why?: string } | void {
    const space = spaceOf(mapRef.current);
    if (a.type === 'op') {
      // someone who may only read or comment on a shared line of thinking cannot change its objects
      if (togetherRef.current?.active && togetherRef.current.role !== 'owner' && togetherRef.current.role !== 'editor') {
        return { ok: false, why: 'You can look at this line of thinking, but not change it.' };
      }
      // the steps one description makes share its moment, so undo takes the description back whole
      const r = applyObjectOp(space, a.obj, a.op, a.args, { by: 'person', suggested: a.suggested, ...(a.at ? { at: a.at } : {}) });
      if (!r.ok) return { ok: false, why: r.why };
      commitObjects(r.space, r.obj);
      return { ok: true };
    }
    if (a.type === 'draft') {
      // a form a figure offers — a row operation's shape — goes into the chat box, where it is completed and sent
      draftToComposer(a.text, a.caret);
      return;
    }
    if (a.type === 'seek') {
      const next = seekObject(space, a.obj, a.at);
      commitObjects(next, objOf(next, a.obj));
      return;
    }
    if (a.type === 'select') {
      const v = a.part ? { obj: a.obj, part: a.part } : null;
      setObjSel(v);
      if (workspaceOn) setFocus(v ? { kind: 'part', ...v } : null);
      return;
    }
    if (a.type === 'view' && a.view === '3d') {
      // A SCENE, OPENED WHERE IT IS WORKED ON: its Live 3D panel — the one
      // already showing it, else a new one beside what is there.
      if (!workspaceOn || !wsLayout) return;
      const ps = panelsOf(wsLayout);
      const there = ps.find((p) => p.type === 'scene' && p.config?.obj === a.obj) ?? ps.find((p) => p.type === 'scene' && !p.config?.obj);
      if (there) {
        const pinned = there.config?.obj ? wsLayout : configurePanel(wsLayout, there.id, { obj: a.obj });
        changeLayout(ps.length > 1 ? maximize(pinned, there.id) : pinned);
      } else changeLayout(addPanel(wsLayout, { type: 'scene', config: { obj: a.obj } }, 1.6, 0.5).layout);
      return;
    }
    if (a.type === 'view' && a.view === 'plane') {
      // ANOTHER VIEW OF THE SAME OBJECT, not a new artefact: the plane picture
      // of a 2 × 2 matrix, built from its current entries and kept in step.
      const o = objOf(space, a.obj);
      if (!o || o.kind !== 'matrix') return;
      const rows = (o.states[o.at] as MatrixState).rows;
      const viz = sanitizeViz({
        kind: 'matrix',
        matrix: rows.map((r) => r.map((v) => { const [n, d] = v.split('/'); return Number(n) / Number(d ?? 1); })),
        title: `${o.name} acting on the plane`,
        says: { caption: `Matrix ${o.name}, as it stands now — computed from its entries.` },
      });
      if (!viz) return;
      planeOfRef.current = o.id;
      mapRef.current = { ...mapRef.current, viz };
      patchActive((s) => ({ ...s, map: { ...(s.map ?? EMPTY_MAP), viz } }));
    }
  }

  /**
   * Is anyone else here right now? Then this is a group: people talk to each
   * other, and Socria speaks when it is asked (lib/chat-thread.ts callsSocria).
   * Alone — even in a shared line of thinking nobody else has open — every
   * message is said to Socria, as always.
   */
  function groupNow(): boolean {
    return (
      (roomRef.current.active && roomRef.current.people.length >= 2) ||
      (!!togetherRef.current?.active && togetherRef.current.people.some((p) => !p.you))
    );
  }

  /** Put a message into the conversation everyone sees — through the room's record in a room. */
  function postTurn(turn: Msg, save: boolean): Msg {
    if (roomRef.current.active && sharedIdsRef.current.has(activeIdRef.current ?? '')) {
      // stamped with who wrote it and broadcast; the room's record puts it on screen
      return roomRef.current.onLocalMessage(turn);
    }
    // in a shared line of thinking it is signed here too, so it reads as theirs at once
    // (the server signs it again, and its signature is the one kept)
    const t = togetherRef.current;
    const signed: Msg =
      t?.active && t.me && turn.role === 'user'
        ? { ...turn, by: { id: t.me, name: myName, seat: t.role === 'owner' ? 'host' : 'guest' } }
        : turn;
    patchActive((s) => ({ ...s, messages: [...s.messages, signed] }), save);
    return signed;
  }

  /** A command's turn and what was done, said into the conversation (and the room's record, in a room). */
  function postPair(turn: Msg, reply: Msg) {
    if (roomRef.current.active && sharedIdsRef.current.has(activeIdRef.current ?? '')) {
      const sent = roomRef.current.onLocalMessage(turn);
      roomRef.current.onLocalReply({ ...reply, ...(groupNow() ? { replyTo: replyRefOf(sent, myName) } : {}) });
    } else {
      const sent = postTurn(turn, false);
      patchActive((s) => ({ ...s, messages: [...s.messages, { ...reply, ...(groupNow() ? { replyTo: replyRefOf(sent, myName) } : {}) }] }));
    }
    chronRef.current = [...chronRef.current, turn, reply];
  }

  async function send(text: string, atts: Attachment[] = [], replying: ReplyRef | null = null) {
    const content = text.trim();
    if ((!content && !atts.length) || !activeIdRef.current) return;
    if (togetherRef.current?.active && togetherRef.current.role !== 'owner' && togetherRef.current.role !== 'editor') {
      setError(togetherRef.current.role === 'commenter' ? 'You can read and comment on this line of thinking, but not add to it.' : 'You can read this line of thinking, but not add to it.');
      return;
    }

    // IN A GROUP, SOCRIA SPEAKS WHEN IT IS ASKED — @socria, or a reply to
    // something it said. Anything else is said to the others: posted to
    // everyone at once, with no model, no map pass, nothing spent. Alone,
    // everything is said to Socria.
    const group = groupNow();
    const asks = callsSocria({ group, text: content, replyTo: replying });
    if (!asks) {
      setError(null);
      setInput('');
      setReplyTo(null);
      const turn: Msg = {
        id: newMsgId(),
        at: Date.now(),
        role: 'user',
        content,
        ...(atts.length ? { attachments: atts } : {}),
        ...(replying ? { replyTo: replying } : {}),
      };
      const sent = postTurn(turn, true);
      chronRef.current = [...chronRef.current, sent];
      return;
    }
    // One answer at a time from this screen. Talking to the others never waits.
    if (busy) {
      if (group) setError('Socria is still answering — send this again in a moment.');
      return;
    }

    const objTurn = takeObjects(content, atts);
    const pairOf = (said: string): [Msg, Msg] => [
      { id: newMsgId(), at: Date.now(), role: 'user', content, ...(replying ? { replyTo: replying } : {}) },
      { id: newMsgId(), at: Date.now(), role: 'assistant', content: said },
    ];

    // A DESCRIPTION OF THE SCENE IS A COMMAND, like a command to the map: it was built just now, and what was
    // built is written into the conversation. Nothing goes to the model, and nothing is spent.
    if (objTurn.scene) {
      setError(null);
      setInput('');
      setReplyTo(null);
      postPair(...pairOf(objTurn.scene.said));
      return;
    }

    // A VIEW ASKED FOR BY NAME — "show this as a structure", "organize it into
    // a mind map" (lib/view-request.ts). In Logos 3 the map, in that view,
    // takes over the stage. When the view already has something to draw, that
    // is the whole answer and nothing goes to the model. When it does not yet
    // — a timeline before the map has an order — the sentence goes on to
    // Socria, whose map pass reorganizes the thinking into that shape, and
    // the view opens as soon as it can.
    if (workspaceOn && wsLayout && !atts.length && !objTurn.lastStep) {
      const want = readViewRequest(content);
      if (want) {
        changeLayout(showLens(wsLayout, want.lens));
        if (wsFacts.lenses.includes(want.lens)) {
          setError(null);
          setInput('');
          setReplyTo(null);
          postPair(...pairOf(viewSaid(want.lens)));
          return;
        }
      }
    }

    // A COMMAND TO THE MAP IS NOT A QUESTION FOR LOGOS. "Remove the node about
    // rent" used to go to the model, which answered in prose while the node
    // stayed. It is read here, against the map's own labels, and done — with
    // what was done written into the conversation so the record is complete
    // and the extractor sees it too. A sentence that is not plainly a command
    // is not touched (lib/map-edit.ts decides, and errs toward sending).
    if (!atts.length && !objTurn.lastStep) {
      const cmd = readMapCommand(content, mapRef.current);
      if (cmd) {
        setError(null);
        setInput('');
        setReplyTo(null);
        const said = 'edits' in cmd ? editMap(cmd.edits) ?? cmd.said : cmd.refused;
        postPair(...pairOf(said));
        return;
      }
    }

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
    // Onboarding's sentence is exempt — the server decides whether it still is.
    if (!one && chatsSpent && !firstThoughtRef.current && !messages.some((m) => m.role === 'user')) {
      if (!ask('chats-spent')) setError(boundaryNote('chats'));
      return;
    }

    setError(null);
    setInput('');
    setReplyTo(null);
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
      id: newMsgId(),
      at: Date.now(),
      role: 'user',
      content,
      ...(atts.length ? { attachments: atts } : {}),
      ...(replying ? { replyTo: replying } : {}),
    };
    // In a shared room — and in the room's own session — the turn is stamped
    // with who wrote it and broadcast to the other person before anything
    // else happens. In a group it is posted to everyone at once, so the
    // question is there while Socria answers it. Alone, it is held until the
    // answer lands, and saved with it.
    const inShared = roomRef.current.active && sharedIdsRef.current.has(activeIdRef.current ?? '');
    const sid = activeIdRef.current ?? '';
    const before = messages;
    const sent = postTurn(turn, group);
    // The first thought, anywhere — once, ever (lib/first-run.ts).
    firstRun.reach('socria.thought');
    // the conversation as it stands now, with this turn — others' words included
    const next = sessionsRef.current.find((x) => x.id === sid)?.messages ?? [...before, sent];
    chronRef.current = [...chronRef.current, sent];
    setBusy(true);
    setStreaming('');
    // everyone else sees that an answer is coming
    if (group) togetherRef.current?.asking(true);
    // In a group, the one Socria is answering — by name, and how they asked.
    const addressed = group
      ? { name: myName, how: replying?.role === 'assistant' && !mentionsSocria(content) ? 'reply' : 'mention' }
      : null;
    const people = inShared
      ? roomRef.current.people
      : togetherRef.current?.active
        ? togetherRef.current.people.map((p) => ({ name: p.name, seat: p.role === 'owner' ? ('host' as const) : ('guest' as const) }))
        : [];
    // Socria's memory of this person is theirs: never in an answer others will read.
    const shared = inShared || !!togetherRef.current?.active || foreignIdsRef.current.has(sid);

    // A line of thinking begins: which one is this for the person? Shape
    // only — first, second, or later — so activation can be read without a
    // word of what was said.
    if (!before.some((m) => m.role === 'user')) {
      const prior = sessionsRef.current.filter(
        (x) => x.id !== activeIdRef.current && x.messages.some((m) => m.role === 'user')
      ).length;
      track('logos_session_started', { nth: nthBucket(prior + 1), surface: 'logos', signed_in: !!isSignedIn });
    }
    const u = isSignedIn && !shared ? understandingRef.current : null;
    // The state of the picture at this instant. Taken before the request so
    // the same snapshot is both what the model was told and what its answer is
    // checked against — a control moved while the reply streams cannot make a
    // command land somewhere the model never saw.
    const sentViz = vizRead.current?.() ?? null;

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
          // What they are looking at, so "why is it flat there" has something
          // to be about. Re-sanitised on the server like every other field.
          ...(mapRef.current?.viz ? { viz: mapRef.current.viz } : {}),
          // …and the picture's OWN state: every object with what it means,
          // where each control stands, which layers are on, what is selected.
          // Read here, at the moment of sending, so the reply is answering the
          // picture as it actually stands rather than as it opened.
          ...(sentViz ? { vizState: sentViz } : {}),
          // The objects they are working on, and what this turn did to them.
          // Re-sanitised on the server, where every step is RE-COMPUTED from
          // the state before it — so what the reply is told was computed was.
          ...(mapRef.current?.objects ? { objects: mapRef.current.objects } : {}),
          // what they told onboarding they mostly think about (an id, or nothing)
          ...(readRole() ? { role: readRole() } : {}),
          ...(readName() ? { name: readName() } : {}),
          // LOGOS 3 REMEMBERS through the same Mind graph as Core 4: recalled
          // before the reply, learned from after it (app/api/logos/chat). Never
          // in a shared room — the other person's words are not theirs to keep.
          ...(workspaceOn && cloud && !shared
            ? { mind: true, ...(active?.projectId ? { projectId: active.projectId } : {}) }
            : {}),
          // the sentence onboarding sent for them: free, once per account
          // (the server keeps the once — lib/usage.ts firstThoughtUsed)
          ...(firstThoughtRef.current ? { firstThought: true } : {}),
          ...(objTurn.lastStep ? { objectStep: objTurn.lastStep } : {}),
          ...(objTurn.refused ? { objectRefused: objTurn.refused } : {}),
          ...(objTurn.claims.length ? { objectClaims: objTurn.claims } : {}),
          // Logos 3: what they have selected in the workspace, described from
          // canonical state — so "why is this negative?" is about β₂.
          ...(() => {
            const brief = workspaceOn ? describeFocus(focusRef.current, mapRef.current) : null;
            return brief ? { focus: brief } : {};
          })(),
          // What the map reads them as building, and its spine in order.
          ...(() => {
            const b = mapRef.current ? briefOf(mapRef.current) : null;
            return b ? { building: b } : {};
          })(),
          // Two or more people here: their names, so Socria answers as the
          // layer between them — and who asked it, so it answers them. Names
          // only — never who is signed in.
          ...(people.length >= 2 ? { collab: { people } } : {}),
          ...(addressed && people.length >= 2 ? { addressed } : {}),
        }),
      });
      if (res.status === 402) {
        // A boundary rather than a failure. Alone, the turn is put back in the
        // composer so nothing they wrote is lost to a limit. In a group it was
        // already said to everyone, and stays said.
        const body = await res.json().catch(() => ({}));
        void refreshUsage(activeIdRef.current);
        if (!group) {
          patchSession(sid, (sn) => ({ ...sn, messages: withoutTurn(sn.messages, sent) }), false);
          chronRef.current = withoutTurn(chronRef.current, sent);
          setInput(content);
          setReplyTo(replying);
        }
        setBusy(false);
        // Same rule as the pre-flight above: the sheet once, then in place.
        if (!ask('chats-spent')) setError(body?.error || boundaryNote('chats'));
        return;
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(failureText(body));
      }

      // The turn was accepted. Now the map may be rebuilt from it.
      refreshMap();
      // The server says when this was onboarding's free first thought, so the
      // free plan's count can be read honestly under the answer.
      if (res.headers.get('X-Socria-First-Thought') === '1') {
        setGifted(true);
        void refreshUsage(activeIdRef.current);
      }

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
      // Changes to the picture, checked against the very state that was sent:
      // unknown ids dropped, numbers clamped to the ranges the physics owns.
      // Applied before the text lands so the picture and the sentence that
      // describes it change together.
      applyVizOps(parseVizOps(acc, sentViz), sid);
      acc = stripVizOps(acc);
      setStreaming('');
      // Socria's answer, with its own name — and, in a group, the turn it answers,
      // so everyone can see whom it is talking to.
      const reply: Msg = {
        id: newMsgId(),
        at: Date.now(),
        role: 'assistant',
        content: acc,
        ...(group ? { replyTo: replyRefOf(sent, myName) } : {}),
      };
      // Into the session that SENT, which may no longer be the active one —
      // and into it as it is NOW. It used to be written as the copy taken when
      // the question went, which erased whatever had arrived since: someone
      // else's message, or the question itself after a sync. In a room it goes
      // through the room's record, which is what puts it on both screens.
      if (inShared) roomRef.current.onLocalReply(reply);
      else patchSession(sid, (s) => ({ ...s, messages: landReply(s.messages, sent, reply) }));
      chronRef.current = [...chronRef.current, reply];
      if (u && u.entries.length) recurrenceSaidRef.current.add(sid);
      // A thought completed. The proactive check runs from an effect rather
      // than here, so it sees the map this turn produced instead of the one
      // captured when this function was defined.
      setLandedTurns((n) => n + 1);
      // What Logos learned about the person, folded into the memory it
      // shares with Core — every few turns, for accounts only, and never
      // from a line of thinking the map read as reflecting: that memory is
      // private, and Logos is the surface whose map can be shown to someone.
      const landed = sessionsRef.current.find((x) => x.id === sid)?.messages ?? [...next, reply];
      const userTurns = landed.filter((m) => m.role === 'user').length;
      if (
        isSignedIn &&
        userTurns >= JOURNEY_EVERY_TURNS &&
        userTurns % JOURNEY_EVERY_TURNS === 0 &&
        mapRef.current.context !== 'reflecting' &&
        // NEVER from a line of thinking anyone else is in — a room, a shared
        // line of thinking, someone else's. The understanding pass reads the
        // whole conversation and writes what it concludes into this account's
        // permanent profile: it would fold other people's words into a private
        // record they cannot see, export or delete.
        !shared &&
        !sharedIdsRef.current.has(sid)
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
      if (group) {
        // Said to everyone already; only Socria's answer failed. Ask again with @socria.
        setError(`${e?.message || 'Something went wrong.'} Your message is posted — mention @socria to ask again.`);
      } else {
        setError(e?.message || 'Something went wrong.');
        // The turn that never landed, taken out by its own name — whatever
        // else arrived meanwhile stays.
        patchSession(sid, (s) => ({ ...s, messages: withoutTurn(s.messages, sent) }), false);
        chronRef.current = withoutTurn(chronRef.current, sent);
        setInput(content);
        setReplyTo(replying);
        // Hand the attachments back so a failed turn doesn't lose them.
        if (atts.length) {
          setDrafts((prev) => [
            ...prev,
            ...atts.map((a, i) => ({ ...a, id: `re_${Date.now()}_${i}`, status: 'ready' as const })),
          ]);
        }
      }
    } finally {
      setBusy(false);
      togetherRef.current?.asking(false);
    }
  }

  // ── FOUND ALONG THE WAY ─────────────────────────────────────────
  // One capability, said once, when its value is legible on screen — never
  // on a timer, never during the first-model sequence, never two at once.
  // Each is a real fact about the model on screen: a backend that ran, a
  // second view that exists, a selection with dependents, a change the
  // inspector can list, a card with evidence behind it. Dismissals live with
  // the hints (lib/hints.ts), so the account sheet's "Show hints again"
  // brings these back too.
  const [foundSeen, setFoundSeen] = useState<string[]>([]);
  useEffect(() => {
    setFoundSeen(readSeen(window.localStorage));
  }, []);
  const found = useMemo<{ id: 'trace' | 'views' | 'dependencies' | 'compare' | 'evidence'; kicker: string; text: string } | null>(() => {
    if (!firstRun.ready || busy || mapping) return null;
    const doc = map.models ? activeDoc(map.models) : null;
    const m = doc ? modelFor(doc) : null;
    // Eligibility is the dismissal, not the milestone: the milestone is
    // reached the moment a note is shown (for analytics, once), and gating on
    // it here made each note disqualify itself as it appeared and the next
    // one take its place — four notes reached, none ever read.
    const can = (id: string, _milestone: 'found.trace' | 'found.views' | 'found.dependencies' | 'found.compare' | 'found.evidence') =>
      !foundSeen.includes(id);
    if (m) {
      if (m.selected && can('dependencies', 'found.dependencies')) {
        const n = affectedBy(m, [m.selected]).filter((id) => id !== m.selected).length;
        if (n >= 3) return { id: 'dependencies', kicker: 'Dependencies', text: `${n} parts of your model depend on this. Understand traces them.` };
      }
      if (can('compare', 'found.compare') && whatChanged(m)) {
        return { id: 'compare', kicker: 'Changed', text: 'See what changed — Understand lists what moved, and what did not.' };
      }
      if (can('trace', 'found.trace') && computationFacts(m).length) {
        return { id: 'trace', kicker: 'Computed', text: 'Computed from your model. Understand shows what ran, and on what.' };
      }
      if (can('views', 'found.views') && viewsFor(m).length > 1) {
        return { id: 'views', kicker: 'Views', text: 'There is another way to see this — the row of views under the picture.' };
      }
    }
    if (can('evidence', 'found.evidence')) {
      const backed = map.edges.some((e) => e.relation === 'supports') && map.nodes.some((n) => n.status === 'supported');
      if (backed) return { id: 'evidence', kicker: 'Evidence', text: 'See where this came from — press the supported card and choose Trace.' };
    }
    return null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map.models, map.nodes, map.edges, foundSeen, busy, mapping, firstRun.ready, firstRun.state]);
  const foundShown = useRef<string | null>(null);
  useEffect(() => {
    if (!found || foundShown.current === found.id) return;
    foundShown.current = found.id;
    firstRun.reach(`found.${found.id}` as const);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found?.id]);
  const dismissFound = (id: string) => {
    setFoundSeen(markSeen(window.localStorage, id));
  };


  // ── LOGOS 3: THE COMPOSABLE WORKSPACE ───────────────────────────────
  //
  // On a model with `workspace`, the conversation, the map and the model stop
  // being fixed columns and become panels the person arranges (lib/workspace/
  // tiling.ts). Everything below is the arrangement and the person's focus —
  // never the intellectual state, which stays in the session: the layout is
  // kept per browser and never travels with a line of thinking or into a
  // shared room, and focus is ephemeral and never written into a model.
  const workspaceOn = !!SOCRIA_MODELS[model]?.workspace;
  const [wsLayout, setWsLayout] = useState<WorkspaceLayout | null>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const focusRef = useRef<Focus>(null);
  focusRef.current = focus;
  const [wsDismissed, setWsDismissed] = useState<Set<string>>(() => new Set());
  const wsFacts = useMemo(() => ({ ...factsFrom(map), mind: cloud }), [map, cloud]);
  // Something to look at besides the map: a built model, or a picture.
  const wsHasModel = wsFacts.docs.length > 0 || !!wsFacts.viz;
  useEffect(() => {
    if (!workspaceOn || wsLayout) return;
    let saved: WorkspaceLayout | null = null;
    try {
      saved = sanitizeLayout(JSON.parse(localStorage.getItem(WS_KEY) || 'null'));
    } catch {}
    // ONE THING IN FOCUS. Logos 3 starts on a single surface — the model when
    // there is one, the Thinking Map when there is not — with the composer
    // beneath it. Everything else is a "+ View" away.
    setWsLayout(saved && saved.root ? saved : singleLayout(wsHasModel ? 'model' : 'map'));
  }, [workspaceOn, wsLayout, wsHasModel]);
  const wsSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeLayout = useCallback((next: WorkspaceLayout) => {
    setWsLayout(next);
    if (wsSaveRef.current) clearTimeout(wsSaveRef.current);
    wsSaveRef.current = setTimeout(() => {
      try {
        localStorage.setItem(WS_KEY, JSON.stringify(next));
      } catch {}
    }, 250);
  }, []);
  const wsViews = useMemo(() => (wsLayout ? suggestViews(wsFacts, wsLayout) : []), [wsFacts, wsLayout]);
  const wsArrangements = useMemo(() => (wsLayout ? arrangementsFor(wsFacts, wsLayout) : []), [wsFacts, wsLayout]);
  // THE ONE SURFACE FOLLOWS THE WORK — only while it is one surface. When a
  // line of thinking that was all map builds its first model, the model is
  // what there is to look at; a line opened without a model shows its map.
  // An arrangement somebody made of several panels is theirs and never moves.
  const wsSeen = useRef<{ id: string | null; docs: number }>({ id: null, docs: 0 });
  useEffect(() => {
    if (!workspaceOn || !wsLayout) return;
    const seen = wsSeen.current;
    const docs = wsFacts.docs.length + (wsFacts.viz ? 1 : 0);
    const ps = panelsOf(wsLayout);
    const one = ps.length === 1 ? ps[0] : null;
    if (one && seen.id !== null) {
      const switched = seen.id !== activeId;
      if (one.type === 'map' && wsHasModel && (switched || docs > seen.docs)) changeLayout(singleLayout('model'));
      else if (one.type === 'model' && !wsHasModel) changeLayout(singleLayout('map'));
    }
    wsSeen.current = { id: activeId, docs };
  }, [workspaceOn, wsLayout, wsFacts, wsHasModel, activeId, changeLayout]);
  // The conversation, while it is not a panel: a composer and Socria's latest
  // reply beneath the stage, opened into its history only when asked.
  const [dockOpen, setDockOpen] = useState(false);
  // WHERE THE CONVERSATION SITS — below, above, or beside the stage. The
  // person moves it by its grip; kept per browser, like the layout.
  const [dockSide, setDockSide] = useState<DockSide>('bottom');
  useEffect(() => {
    try {
      const v = localStorage.getItem(DOCK_KEY);
      if (v && (DOCK_SIDES as readonly string[]).includes(v)) setDockSide(v as DockSide);
    } catch {}
  }, []);
  // Unfolding the conversation shows its end — the thread was not laid out
  // while folded, so it has no scroll position worth keeping.
  useEffect(() => {
    const t = threadRef.current;
    if (!t) return;
    t.scrollTop = t.scrollHeight;
    atEndRef.current = true;
  }, [dockOpen, dockSide]);
  const moveDock = useCallback((side: DockSide) => {
    setDockSide(side);
    try {
      localStorage.setItem(DOCK_KEY, side);
    } catch {}
  }, []);
  const lastSaid = useMemo(() => [...messages].reverse().find((x) => x.role === 'user')?.content ?? '', [messages]);
  const wsSuggestion = useMemo(
    () => (workspaceOn && wsLayout ? suggestLayout(wsFacts, wsLayout, lastSaid, wsDismissed) : null),
    [workspaceOn, wsFacts, wsLayout, lastSaid, wsDismissed]
  );
  // Stable seams for the memoised panels: they hold a ref, so a reply
  // streaming into the conversation does not redraw a model.
  const modelEditedRef = useRef<(docId: string, m: Model) => void>(() => {});
  const stableModelEdited = useCallback((docId: string, m: Model) => modelEditedRef.current(docId, m), []);
  const askAboutRef = useRef<(id: string, label: string) => void>(() => {});
  const stableAskAbout = useCallback((id: string, label: string) => askAboutRef.current(id, label), []);
  const docHistoryRef = useRef<(docId: string, op: 'undo' | 'redo' | number) => void>(() => {});
  const stableUndo = useCallback((docId: string) => docHistoryRef.current(docId, 'undo'), []);
  const stableRedo = useCallback((docId: string) => docHistoryRef.current(docId, 'redo'), []);
  const stableRestore = useCallback((docId: string, at: number) => docHistoryRef.current(docId, at), []);
  const askLabelRef = useRef<(label: string) => void>(() => {});
  const stableAskLabel = useCallback((label: string) => askLabelRef.current(label), []);

  if (!hasAccess) {
    // THE COVER IS THE GATE. The same card the chat opens from its pill —
    // the real thing built live, the terms read from the plan table, the way
    // in — naming the Logos this surface is, so the two doors say the same
    // thing in the same words. The access key stays behind its disclosure.
    return (
      <div className="logos-root">
        {authSettled && (
          <LogosCover as="gate" version={model === 'logos-3' ? 'logos-3' : 'logos-2'} isSignedIn={false} primaryHref={gateHref} onUnlock={unlockWith} />
        )}
      </div>
    );
  }

  // THE PREMISE, for a person with nothing here yet and nothing carried in.
  // The record is shared with the chat, so a Core veteran opening Logos is
  // not shown it, and a Logos-first person is not shown it again by the chat.
  const introWanted =
    firstRun.ready &&
    wantsIntro(firstRun.state, {
      work: sessions.filter((x) => x.messages.length > 0 || !!x.map?.nodes?.length).length,
      carried: !!initialInput || !!pendingStart,
      hydrated: !hydrating,
    });

  // ── ONE WRITE PATH FOR EVERY SURFACE ─────────────────────────────
  // A slider, a cursor, a selection or an open view goes into the document
  // (lib/model/docs.ts adopt — coalesced, so a drag is one revision), whether
  // it was moved on the map's plot lens, in a Logos 3 model panel or in the
  // Parameters panel. Every view of the model reads the document, so every
  // view follows. The state lands at once; the save trails the drag.
  function handleModelEdited(docId: string, m: Model) {
    // What kind of touch this was, read off the model rather than
    // guessed: a value moved, or something selected / a view opened.
    const was = sessionsRef.current.find((x) => x.id === activeIdRef.current)?.map?.models?.docs.find((d) => d.id === docId);
    const prev = was ? modelFor(was) : null;
    if (prev) {
      const moved =
        (prev.params ?? []).some((p) => (m.params ?? []).find((q) => q.id === p.id)?.value !== p.value) ||
        JSON.stringify(prev.at ?? {}) !== JSON.stringify(m.at ?? {});
      if (moved) signalFirstMap('control-moved');
      else if ((m.selected ?? null) !== (prev.selected ?? null) && m.selected) signalFirstMap('node-pressed');
    }
    patchActive((s) => {
      const map = s.map ?? EMPTY_MAP;
      const ws = map.models;
      if (!ws) return s;
      const next = adopt(ws, docId, m, Date.now());
      return next === ws ? s : { ...s, map: { ...map, models: next } };
    }, false);
    if (adoptSaveRef.current) clearTimeout(adoptSaveRef.current);
    adoptSaveRef.current = setTimeout(() => {
      const cur = sessionsRef.current.find((x) => x.id === activeIdRef.current);
      if (cur) void persist(cur);
    }, 700);
    // The workspace follows a canonical selection: selecting a part of the
    // model in any view makes it what the inspector and the conversation mean
    // by "this".
    const wasSel = (() => {
      const d = sessionsRef.current.find((x) => x.id === activeIdRef.current)?.map?.models?.docs.find((x) => x.id === docId);
      return d ? (modelFor(d).selected ?? null) : null;
    })();
    if ((m.selected ?? null) !== wasSel) {
      if (m.selected) setFocus({ kind: 'object', doc: docId, id: m.selected });
      else setFocus((f) => (f && f.kind === 'object' && f.doc === docId ? null : f));
    }
  }
  modelEditedRef.current = handleModelEdited;

  // ASK ABOUT THIS — from the map's plot lens or any model panel: the turn
  // carries the object's identity, and the composer is seeded, never sent.
  function handleAskAbout(id: string, label: string) {
    setInput((cur) => (cur.trim() ? cur : `About ${label} — why is it what it is?`));
    // Selecting what is already selected is not an edit, and the
    // op's refusal ("… is already selected") is not news.
    const doc = mapRef.current.models ? activeDoc(mapRef.current.models) : null;
    if (!doc || modelFor(doc).selected !== id) applyVizOps([{ op: 'select', id }]);
    signalFirstMap('asked');
  }
  askAboutRef.current = handleAskAbout;

  // UNDO, REDO, RETURN TO A POINT — the model's own history, from the Trace
  // panel. Each is a document verb (lib/model/docs.ts), so it is the same
  // history the conversation's "undo that" walks.
  docHistoryRef.current = (docId, op) => {
    patchActive((s) => {
      const mp = s.map ?? EMPTY_MAP;
      const ws = mp.models;
      if (!ws) return s;
      const next = op === 'undo' ? undoDoc(ws, docId) : op === 'redo' ? redoDoc(ws, docId) : restoreDoc(ws, docId, op);
      return next === ws ? s : { ...s, map: { ...mp, models: next } };
    });
  };
  // "Ask about this" from the inspector: the composer is seeded, never sent,
  // and the cursor goes to it — the composer is always on screen.
  askLabelRef.current = (label) => {
    setInput((cur) => (cur.trim() ? cur : `About ${label} — why is it what it is?`));
    requestAnimationFrame(() => {
      const ta = document.querySelector<HTMLTextAreaElement>('.lg-composer textarea');
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  };

  // ── THE WORKSPACE'S PANELS ───────────────────────────────────────
  //
  // Each panel draws a surface over the session's own state. Which model a
  // panel shows is its config's `doc`, or the active one; the first model
  // panel follows the model's canonical open view, and any other — or one
  // given a view of its own — pins its representation, so two panels can show
  // one model two ways while sharing its parameters and its selection.
  const wsDocs = map.models?.docs ?? [];
  const wsActiveDoc = map.models ? (activeDoc(map.models) ?? wsDocs[wsDocs.length - 1] ?? null) : null;
  const panelDoc = (p: PanelNode) => (p.config?.doc && map.models ? docOf(map.models, p.config.doc) : wsActiveDoc);
  const firstOf = (t: PanelNode['type']) => (wsLayout ? panelsOf(wsLayout).find((x) => x.type === t)?.id ?? null : null);
  const focusBrief = workspaceOn ? describeFocus(focus, map) : null;

  const sceneOf = (p: PanelNode): ThoughtObject | null => {
    const objs = map.objects?.objs ?? [];
    const pinned = p.config?.obj ? objs.find((o) => o.id === p.config!.obj && o.kind === 'scene') : null;
    return pinned ?? (p.config?.obj ? null : objs.find((o) => o.kind === 'scene') ?? null);
  };

  function renderPanel(p: PanelNode) {
    switch (p.type) {
      case 'chat':
        return (
          <div className="lg-convo lg-convo-panel">
            {focusBrief && (
              <div className="ws-chat-focus" role="status">
                <span>About</span>
                <strong>{focusBrief.label}</strong>
                <span>{focusBrief.of}</span>
                <button type="button" aria-label="Clear what the conversation is about" onClick={() => setFocus(null)}>×</button>
              </div>
            )}
            {convoBody}
          </div>
        );
      case 'map':
        return <div className="lg-panel lg-panel-in">{mapBody({ lens: p.config?.lens, primary: p.id === firstOf('map') })}</div>;
      case 'model': {
        const doc = panelDoc(p);
        const primary = p.id === firstOf('model');
        const pinned = p.config?.view !== undefined || !primary;
        return (
          <ModelPanel
            doc={doc}
            edits={map.models ? (editsState(map.models) ?? undefined) : undefined}
            viz={doc ? null : (map.viz ?? null)}
            pinnedView={pinned ? (p.config?.view ?? null) : undefined}
            onPinView={pinned ? (id) => changeLayout(configurePanel(wsLayout!, p.id, { view: id ?? undefined })) : undefined}
            onModel={stableModelEdited}
            onAsk={stableAskAbout}
            onRead={primary ? takeViz : undefined}
            ops={primary ? vizOps : null}
          />
        );
      }
      case 'params':
        return <ParamsPanel doc={panelDoc(p)} focus={focus} onModel={stableModelEdited} onFocus={setFocus} />;
      case 'inspector':
        return <InspectorPanel map={map} doc={panelDoc(p)} focus={focus} onFocus={setFocus} onAsk={stableAskLabel} />;
      case 'trace':
        return <TracePanel doc={panelDoc(p)} onUndo={stableUndo} onRedo={stableRedo} onRestore={stableRestore} />;
      case 'scene': {
        // LIVE 3D (experimental): a scene object of thought, built by describing it in the chat. Only the
        // panel a sent description would build in previews it.
        const sc = sceneOf(p);
        const target = openScene(spaceOf(map))?.panel.id === p.id;
        return (
          <ScenePanel
            obj={sc}
            selected={sc && objSel?.obj === sc.id ? objSel.part : null}
            onSelect={(part) => sc && onObject({ type: 'select', obj: sc.id, part })}
            onOp={(id, op, args, at) => {
              const r = onObject({ type: 'op', obj: id, op, args, at }) ?? { ok: false, why: 'Nothing here can compute that.' };
              // a part moved or resized by hand is "it" for the next description, as one the conversation made is
              if (r.ok && typeof args.id === 'string') sceneLastRef.current = args.id;
              return r;
            }}
            onSeek={(id, at) => onObject({ type: 'seek', obj: id, at })}
            draft={target ? input : ''}
            last={sceneLastRef.current}
            onSuggest={(text) => draftToComposer(text)}
            readOnly={togetherReadOnly}
          />
        );
      }
      case 'mind':
        // WHERE THIS LINE OF THINKING SITS among every other, and what Socria
        // remembers (lib/mind/atlas.ts) — read through the logos scope, so
        // nothing private arrives here at all.
        return (
          <div className="lg-mind-host">
            <MindAtlas
              scope="logos"
              embedded
              focusChat={activeId}
              refreshKey={`${activeId}:${messages.length}:${busy ? 1 : 0}`}
              onOpenChat={(id, surface) => {
                if (surface === 'logos') switchSession(id);
                else onOpenChat?.(id);
              }}
            />
          </div>
        );
    }
  }

  function panelTitle(p: PanelNode): { title: string; sub?: string } {
    const doc = panelDoc(p);
    const docTitle = doc ? currentRevision(doc).title : undefined;
    switch (p.type) {
      case 'chat':
        return { title: 'Conversation' };
      case 'map': {
        const lens = p.config?.lens ? LENSES.find((l) => l.id === p.config!.lens)?.label : null;
        return { title: 'Thinking Map', sub: lens ?? (map.context ? CONTEXT_LABEL[map.context] : undefined) };
      }
      case 'model': {
        const v = p.config?.view && doc ? wsFacts.docs.find((d) => d.id === doc.id)?.views.find((x) => x.id === p.config!.view) : null;
        return { title: doc ? 'Model' : map.viz?.kind === 'simulation' ? 'Simulation' : 'Model', sub: v ? `${docTitle} · ${v.variant}` : docTitle };
      }
      case 'params':
        return { title: 'Parameters', sub: docTitle };
      case 'inspector':
        return { title: 'Inspector', sub: focusBrief?.label };
      case 'trace':
        return { title: 'Trace', sub: docTitle };
      case 'scene': {
        const sc = sceneOf(p);
        return { title: 'Live 3D', sub: sc ? `${sc.name} · experimental` : 'experimental' };
      }
      case 'mind':
        return { title: 'Mind', sub: 'what this connects to' };
    }
  }

  function acceptSuggestion(sg: LayoutSuggestion) {
    const arr = wsArrangements.find((a) => a.id === sg.arrangement);
    if (arr) changeLayout(arr.layout);
    setWsDismissed((d) => new Set(d).add(sg.id));
  }

  // ── THE SURFACES, AS NAMED PIECES ─────────────────────────────────
  //
  // The conversation's header, the conversation itself and the map are the
  // same JSX they always were. Logos 2 sets them in its two fixed columns
  // exactly as before; Logos 3 hands them to the workspace as panels, beside
  // the model, its parameters, the inspector and the trace — all drawn over
  // the one session this component holds. Nothing here copies state.
  const convoHead = (
          <header className={`lg-head${collab ? ' lg-head-collab' : ''}`}>
            {/* The header measures itself; this row is what it arranges. They
                are two elements because a container query cannot restyle the
                container — only what is inside it (globals.css, "the header,
                when the conversation column is narrow"). */}
            <div className="lg-head-row">
            {/* The rail's toggle, and it is HERE rather than in the rail
                because the rail is the Core surface's and the Core surface's
                has no desktop collapse. Logos needs one — it shows three
                columns and the draft makes four — so the control sits with the
                other layout controls instead of being bolted onto a shared
                component. On a phone the rail is a drawer and this is the
                hamburger that brings it back; the × inside the drawer, which
                app-shell.css shows only at that width, puts it away again. */}
            <button
              type="button"
              className="lg-mrail"
              onClick={() => setRailOpen((v) => !v)}
              aria-expanded={railOpen}
              aria-label={railOpen ? 'Hide your lines of thinking' : 'Your lines of thinking'}
              title={railOpen ? 'Hide the rail' : 'Your lines of thinking'}
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
            {/* WHERE THE MEMORY BUTTON WENT. It was here, and it opened the
                Thinking Journey. /chat moved the same control into the rail's
                footer as a link to /memory, because /memory IS the Mind Graph
                — the rows the prompt is actually built from — and the Journey
                is on that page too, labelled as the older Cores' store and
                carrying the per-entry forget. Logos now shows the Core rail, so
                that link is already on this screen; a second control in the
                header, pointing somewhere else, is how one product ends up
                telling a person two things about what it remembers. */
            }
            {/* Logos 2 only. Logos 3's header keeps to the workspace: the
                walk-through and the working-style sheet have no button here.
                The sheet still opens from the note shown when the chat
                changes how Socria works with you. */}
            {!workspaceOn && (
              <>
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
              </>
            )}
            {/* Socria Rewards: the 5-Node Challenge, quietly, beside the map it is about —
                while the rail (and its mark beside the Socria mark) is put away. */}
            <ChallengeChip enabled={cloud} progress={!(railOpen && !chromeHidden)} onOpenAccount={() => setAcctOpen(true)} />
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
            {/* Logos 3: who is here, and how to bring someone in. */}
            {/* THINK TOGETHER: who is here, the comments, and the one way to
                bring someone in — on Logos 3, and on any Logos surface once
                the line of thinking is shared. A room joined by its old code
                keeps its own bar. */}
            {collab && room.active ? (
              <CollabBar room={room} />
            ) : isSignedIn && activeId && (SOCRIA_MODELS[model]?.workspace || together.active) ? (
              <span className="tg-bar">
                {together.active && together.people.length > 1 && (
                  <span className="tg-faces" aria-label={`${together.people.length} here now`}>
                    {together.people.slice(0, 5).map((p) => (
                      <i key={p.id} style={{ background: hueOf(p.id) }} title={p.you ? 'You' : `${p.name} · ${p.role}`}>
                        {p.name.trim()[0]?.toUpperCase() ?? '?'}
                      </i>
                    ))}
                  </span>
                )}
                {together.active && (
                  <CommentsButton
                    state={comments}
                    active={commentsOpen}
                    onClick={() => {
                      setCommentsOn(null);
                      setCommentsOpen((o) => !o);
                    }}
                  />
                )}
                <button type="button" className="sh-open" onClick={() => setShareOpen(true)}>
                  Share
                </button>
              </span>
            ) : null}
            <button type="button" className="lg-back" onClick={leaveForChat} aria-label="Back to Socria chat">
              <span className="lg-lbl-long">Socria chat</span>
              <span className="lg-lbl-short" aria-hidden="true">Chat</span> <span aria-hidden="true">→</span>
            </button>
            {isSignedIn && (
              <AccountControl onOpen={() => setAcctOpen(true)} isOne={one} />
            )}
            <button
              type="button"
              className="lg-chrome-hide"
              onClick={() => hideChrome(true)}
              aria-label="Hide the chats bar and header"
              title="Hide the chats bar and header"
            >
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              </svg>
            </button>
            </div>
          </header>
  );
  // NOTES ON THE WORK, IN THE CONVERSATION (Logos 3). What the engine did with
  // a model this turn proposed, a cue to something worth finding, the first
  // map's save nudge: said under Socria's latest reply, where the person is
  // already reading, rather than as strips across the top of the map — the
  // surface being thought about keeps the screen. Logos 2 keeps its strips.
  const chatNotes =
    workspaceOn && !busy && !mapping && (buildNote || found || firstMapNote) ? (
      <div className="lg-annots" aria-label="Notes on this turn">
        {buildNote && (
          <p className="lg-annot" role="status">
            <span className="lg-annot-k">The model</span>
            <span className="lg-annot-t">{buildNote}</span>
            <button type="button" className="lg-annot-x" aria-label="Dismiss" onClick={() => setBuildNote(null)}>
              ×
            </button>
          </p>
        )}
        {found && !buildNote && (
          <p className="lg-annot" role="note">
            <span className="lg-annot-k">{found.kicker}</span>
            <span className="lg-annot-t">{found.text}</span>
            <button type="button" className="lg-annot-x" aria-label="Dismiss" onClick={() => dismissFound(found.id)}>
              ×
            </button>
          </p>
        )}
        {firstMapNote && (
          <p className="lg-annot" role="note">
            <span className="lg-annot-t">{FIRST_MAP_NOTE}</span>
            <button
              type="button"
              className="lg-annot-act"
              onClick={() => {
                void exportMapPng(map, active?.title && active.title !== UNTITLED ? active.title : 'A line of thinking');
                setFirstMapNote(false);
              }}
            >
              Save as image
            </button>
            <button type="button" className="lg-annot-x" aria-label="Dismiss" onClick={() => setFirstMapNote(false)}>
              ×
            </button>
          </p>
        )}
      </div>
    ) : null;
  // ── WHO SAID WHAT ──────────────────────────────────────────────────
  // A conversation more than one person is in reads like a group chat
  // (components/LogosMessage.tsx): what this person said on the right, everyone
  // else on the left under their name, Socria on the left with its mark.
  const meId = room.active ? room.me.id : together.me;
  function isMine(m: Msg): boolean {
    if (m.role !== 'user') return false;
    if (m.by) return !!meId && m.by.id === meId;
    // unsigned: said before anyone else was here — the host's, the owner's
    if (room.active) return room.me.seat === 'host';
    if (together.active) return together.role === 'owner';
    return !foreignIdsRef.current.has(activeId ?? '');
  }
  const groupView = room.active || together.active || messages.some((m) => m.role === 'user' && !!m.by && !isMine(m));
  /** the name a message goes under, for everyone — what a reply's quote records */
  function whoOf(m: Msg): string {
    if (m.role === 'assistant') return 'Socria';
    if (isMine(m)) return myName;
    return m.by?.name || together.owner || 'Someone';
  }
  /** …and as this screen shows it */
  const shownWho = (m: Msg) => (m.role === 'user' && isMine(m) ? 'You' : whoOf(m));
  /** one author per run: Socria answering one person is one run, answering the next is another */
  function authorKey(m: Msg): string {
    if (m.role === 'assistant') return `socria:${groupView ? m.replyTo?.who ?? '' : ''}`;
    if (isMine(m)) return 'me';
    return m.by?.id ?? 'owner';
  }
  /** who else is waiting on an answer from Socria right now */
  const answeringOthers = together.active ? together.people.filter((p) => !p.you && p.doing === 'asking').map((p) => p.name) : [];
  /** is anyone else here now? Then Socria answers when asked */
  const groupLive = (room.active && room.people.length >= 2) || (together.active && together.people.some((p) => !p.you));
  /** Reply: the composer takes a quote of this message, and the caret */
  function startReply(m: Msg) {
    setReplyTo(replyRefOf(m, whoOf(m)));
    setComposerFocus((f) => ({ n: (f?.n ?? 0) + 1 }));
  }
  /**
   * To the message a quote points at. The thread scrolls itself — never
   * scrollIntoView, which moves every scrollable ancestor and once pushed the
   * Logos 3 composer out of reach.
   */
  function jumpTo(id: string) {
    const t = threadRef.current;
    const el = t?.querySelector<HTMLElement>(`[id="lg-m-${id}"]`);
    if (!t || !el) return;
    t.scrollTop += el.getBoundingClientRect().top - t.getBoundingClientRect().top - 16;
    el.classList.remove('is-flash');
    void el.offsetWidth;
    el.classList.add('is-flash');
    window.setTimeout(() => el.classList.remove('is-flash'), 1400);
  }

  const convoBody = (
    <>

          <div
            className="lg-thread"
            ref={threadRef}
            onScroll={(e) => {
              const t = e.currentTarget;
              atEndRef.current = t.scrollHeight - t.scrollTop - t.clientHeight < 48;
            }}
          >
            {messages.length === 0 && !streaming && (
              <div className="lg-intro">
                <h1>Think out loud.</h1>
                {workspaceOn ? (
                  <p>
                    Type what you’re working through. Logos asks questions back,
                    draws the shape of your reasoning as you go, and builds what
                    you describe beside it: a model you can move, a matrix you
                    can work, a shape in Live 3D.
                  </p>
                ) : (
                  <p>
                    Type what you’re working through. Logos asks questions back,
                    and draws the shape of your reasoning on the right as you go.
                  </p>
                )}
                {noSessions && !input ? (
                  // Nothing has ever been said here. The chips would send a
                  // line too thin to draw; these are four complete first
                  // messages, put into the composer and NEVER sent — the
                  // person edits them into their own situation first.
                  <div className="lg-openings">
                    <p className="lg-openings-lead">{OPENING_LEAD}</p>
                    {openingsFor(workspaceOn).map((o) => (
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

            {messages.map((m, i) => {
              if (m.synthesis) {
                // Socria's reading of the map: copied or replied to like anything else it says
                return (
                  <div key={m.id ?? i} id={m.id ? `lg-m-${m.id}` : undefined} className="lg-synth-wrap">
                    <LogosSynthesis {...synthProps(m.synthesis, i === lastSynthIndex && i === messages.length - 1)} />
                    <MsgActions m={m} who="Socria" canReply={!togetherReadOnly} onReply={startReply} />
                  </div>
                );
              }
              const prev = i > 0 ? messages[i - 1] : null;
              const side: Side = m.role === 'assistant' ? 'socria' : isMine(m) ? 'mine' : 'other';
              return (
                <LogosMessage
                  key={m.id ?? i}
                  m={m}
                  side={side}
                  who={shownWho(m)}
                  group={groupView}
                  cont={!!prev && !prev.synthesis && authorKey(prev) === authorKey(m)}
                  hue={groupView && side === 'other' ? hueOf(authorKey(m)) : undefined}
                  // Socria's answer right under the question it answers needs no quote of it
                  showQuote={!!m.replyTo && (m.role === 'user' || !prev?.id || prev.id !== m.replyTo.id)}
                  canReply={!togetherReadOnly && (m.role === 'assistant' || (groupView && side === 'other'))}
                  onReply={startReply}
                  onJump={jumpTo}
                  toLabel={m.replyTo?.id && messages.some((x) => x.id === m.replyTo!.id && isMine(x)) ? 'You' : undefined}
                />
              );
            })}

            {/* Logos 3: notes on the work, under the reply they belong to */}
            {chatNotes}

            {/* someone else asked Socria; its answer is on its way to them */}
            <SocriaAnswering names={answeringOthers} />

            {streaming && <SocriaPending text={streaming} group={groupView} to={groupView ? 'You' : null} />}

            {synthBusy && <SynthesisPending scope={synthBusy} />}

            {busy && !streaming && <SocriaPending text="" group={groupView} to={groupView ? 'You' : null} />}

            {gifted && !busy && !one && (
              <p className="lg-gift" role="note">
                This one was on us.{' '}
                {usage.chats?.limit != null
                  ? (() => {
                      const left = Math.max(0, usage.chats.limit - usage.chats.used);
                      return `You still have ${left} free Logos ${left === 1 ? 'chat' : 'chats'} this month.`;
                    })()
                  : 'Your free Logos chats this month are all still there.'}
              </p>
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

          {togetherReadOnly && (
            <p className="tg-note" role="note">
              {together.role === 'commenter' ? 'You can read and comment on this line of thinking.' : 'You can read this line of thinking.'}
              {together.owner ? ` It is ${together.owner}’s.` : ''}
            </p>
          )}
          <LogosComposer
            value={input}
            onChange={setInput}
            focusSignal={composerFocus}
            mathAvailable={mathAvailable}
            mathTopic={mathTopic}
            drafts={drafts}
            setDrafts={setDrafts}
            onSend={sendFromComposer}
            busy={busy}
            readImage={readImage}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            group={groupLive}
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

            {/* Logos is itself one of the models, so this is THE SAME SWITCH
                the Core chat carries — the same component, so the button, the
                sheet, the order and the words are one design on both
                surfaces. This was a menu of its own, and it drifted: a
                different button, a different list order, glyphs instead of
                the "how it answers" sheet. Picking another model navigates
                there; Logos 2 has no axes of its own to show beneath it. */}
            {/* SYNTHESIZE — the payoff after externalising: Socria reads what
                the map has become. Quiet until there is enough to read. */}
            <button
              type="button"
              className="lg-synth"
              onClick={() => void synthesize('workspace')}
              disabled={!canSynthesize(map) || !!synthBusy || busy}
              title={canSynthesize(map) ? 'See where your thinking stands' : 'Synthesis needs at least two things on the map'}
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" aria-hidden="true">
                <path d="M2 3.5h5.5M2 8h4M2 12.5h5.5M9.5 3.5 13 8l-3.5 4.5M7.5 8H13" />
              </svg>
              {synthBusy === 'workspace' ? 'Reading your map…' : 'Synthesize'}
            </button>
            {/* Depth rides in the picker, as in the Core chat — one control,
                two questions: which model, and how far it goes. Only where
                the model has depth modes (Logos 3); Logos 2 shows the model
                axis alone. */}
            <ModelPicker
              value={model}
              onChange={pickModel}
              isSignedIn={!!isSignedIn || unlocked}
              depth={depthOn ? depth : undefined}
              onDepth={depthOn ? pickDepth : undefined}
              plan={planKnown ? plan : undefined}
            />
          </div>
    </>
  );
  const mapBody = ({ lens, primary }: { lens?: string; primary: boolean }) => (
    <>
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
            {/* Logos 3 remembers through the Mind graph; this is where you see
                how this line of thinking connects to everything else. */}
            {primary && workspaceOn && cloud && (
              <button
                type="button"
                className={`lg-panel-mind${mindOpen ? ' is-on' : ''}`}
                aria-pressed={mindOpen}
                onClick={() => setMindOpen((v) => !v)}
              >
                {mindOpen ? 'Back to the map' : 'Mind'}
              </button>
            )}
          </header>
          {/* What the engine did with a model this turn proposed — a build or a
              refusal, in its own words. A LINE OF ITS OWN under the head, not
              a label in the title row: it is a sentence, sometimes three, and
              set beside "THINKING MAP · GRAPHING" it wrapped down the side of
              the panel in capitals. Dismissed by the next turn, or by hand. */}
          {buildNote && !mapping && !workspaceOn && (
            <p className="lg-panel-note" role="status">
              <span className="lg-panel-note-text">{buildNote}</span>
              <button type="button" className="lg-panel-note-x" aria-label="Dismiss" onClick={() => setBuildNote(null)}>
                ×
              </button>
            </p>
          )}
          {/* The first-model sequence, in flow under the head rather than
              floating over the figure: its last cue points at the Understand
              bar, which a card pinned to the bottom of the pane was covering. */}
          {found && !buildNote && !mapping && !workspaceOn && (
            <p className="lg-found" role="note">
              <span className="lg-found-text">
                <b>{found.kicker}</b>
                {found.text}
              </span>
              <button type="button" className="lg-found-x" aria-label="Dismiss" onClick={() => dismissFound(found.id)}>
                ×
              </button>
            </p>
          )}
          {/* The share nudge waits for the sequence: two notes about the
              same first map, stacked, is the product talking over itself. */}
          {firstMapNote && !workspaceOn && (
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
          {/* PICKED FOR A SYNTHESIS — shift- or ⌘-click cards to gather them. */}
          {primary && picked.size > 0 && (
            <div className="lg-picked-bar" role="status">
              <span>{picked.size} selected</span>
              {picked.size >= 2 && (
                <button type="button" className="is-go" disabled={!!synthBusy} onClick={() => void synthesize('selection')}>
                  {synthBusy === 'selection' ? 'Reading…' : 'Synthesize these'}
                </button>
              )}
              <button type="button" onClick={() => setPicked(new Set())}>Clear</button>
            </div>
          )}
          {primary && mindOpen ? (
            // EVERYTHING SOCRIA REMEMBERS, CONNECTED — this chat in the middle,
            // what it touches around it, and the other chats, Projects and
            // memories those lead to (lib/mind/atlas.ts). Read through the
            // logos scope, so nothing private arrives here at all.
            <div className="lg-mind-host">
              <MindAtlas
                scope="logos"
                embedded
                focusChat={activeId}
                refreshKey={`${activeId}:${messages.length}:${busy ? 1 : 0}`}
                onOpenChat={(id, surface) => {
                  if (surface === 'logos') switchSession(id);
                  else onOpenChat?.(id);
                }}
              />
            </div>
          ) : (
          <ThinkingMap
            key={`tm-${lens ?? ''}`}
            // where the person put this line of thinking's cards, kept for it
            layoutKey={activeId}
            // THE OBJECTS OF THOUGHT, worked on in place: every operation is
            // computed here (lib/objects/) and comes back as the next state.
            onObject={onObject}
            objectSel={objSel}
            // what Socria suggested in its last reply — offered, never applied,
            // and not offered at all while the person is learning
            objectSuggestions={
              guarded || !map.objects?.objs.length
                ? undefined
                : suggestionsIn([...messages].reverse().find((m) => m.role === 'assistant' && !m.synthesis)?.content ?? '', spaceOf(map))
            }
            picked={picked}
            onPick={(id) => setPicked((cur) => {
              const next = new Set(cur);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            })}
            initialLens={lens as LensId | undefined}
            workspace={workspaceOn}
            onSelectNode={(id) => setFocus({ kind: 'node', id })}
            map={map}
            onAction={(mode, node) => {
              signalFirstMap('action-taken');
              runAction(mode, node);
            }}
            onNodePress={() => signalFirstMap('node-pressed')}
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
            onEdit={(edit) => editMap([edit])}
            // ASK ABOUT THIS: the selection is already canonical on the model, so
            // the turn carries the object's IDENTITY and the reply reasons about
            // the object — its provenance, its dependency chain, what it rests on
            // — rather than about what a picture looks like near a pixel. The
            // composer is seeded rather than sent, because the question is still
            // the person's to ask.
            onAskAbout={stableAskAbout}
            emerging={emerging}
            guarded={guarded}
            onViz={(viz) =>
              patchActive((s) => ({ ...s, map: { ...(s.map ?? EMPTY_MAP), viz } }))
            }
            onVizRead={takeViz}
            vizOps={vizOps}
            // A slider, a cursor, a selection or an open view goes into the
            // document (lib/model/docs.ts adopt — coalesced, so a drag is one
            // revision). The state lands at once; the save trails the drag.
            onModelEdited={stableModelEdited}
          />
          )}
          {primary && (<>
          <ExplorePanel
            open={explore.open}
            mode={explore.mode}
            loading={explore.loading}
            error={explore.error}
            node={explore.node}
            data={explore.data}
            lineage={explore.node ? describeLineage(map, explore.node.id) : []}
            structure={structure}
            onKeep={
              cloud && explore.node
                ? () => void keepNode(explore.node as { id: string; label: string; type: string })
                : undefined
            }
            keepState={explore.node ? (keepState[explore.node.id] ?? 'idle') : 'idle'}
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
          </>)}
    </>
  );

  // ── LOGOS 3, AT REST ───────────────────────────────────────────────
  //
  // THE DOCK. While the conversation is not a panel, it is this: Socria's
  // latest reply as a few lines, the composer, and — only when asked — the
  // history above them. The thing being thought about keeps the screen.
  const chatPanelOpen = !!wsLayout && panelsOf(wsLayout).some((x) => x.type === 'chat');
  // (no hooks here: this runs after the access gate's early return)
  // Alone, the peek is Socria's latest reply. In a group it is the latest
  // message from anyone, under their name — someone's new line is not hidden
  // behind an older answer from Socria.
  const peekMsg = groupView ? [...messages].reverse().find((x) => !x.synthesis) : [...messages].reverse().find((x) => x.role === 'assistant');
  const lastReply = peekMsg?.content ?? '';
  const peekWho = streaming || !peekMsg ? 'Socria' : shownWho(peekMsg);
  const lastIsSynth = !!messages[messages.length - 1]?.synthesis;
  const peek = streaming || (busy || lastIsSynth ? '' : lastReply);
  // Beside the stage the history is always shown; below or above, on demand.
  const dockShown = dockOpen || dockSide === 'left' || dockSide === 'right';
  const wsDock =
    workspaceOn && !chatPanelOpen ? (
      <div className={`ws-dock lg-convo${dockShown ? ' is-open' : ''}${messages.length ? '' : ' is-new'}`}>
        {/* A synthesis opens above the composer — the moment it exists for. */}
        {!dockShown && synthBusy && <SynthesisPending scope={synthBusy} />}
        {!dockShown && !synthBusy && lastIsSynth && !busy && !streaming && (
          <LogosSynthesis {...synthProps(messages[messages.length - 1].synthesis!, true)} />
        )}
        {messages.length > 0 && (
          <div className="ws-dock-row">
            {!dockShown && (peek || busy) ? (
              <button type="button" className="ws-peek" onClick={() => setDockOpen(true)} aria-label={`${peekWho === 'Socria' ? 'Socria’s latest reply' : 'The latest message'} — open the conversation`}>
                <span className="ws-peek-who">{peekWho}</span>
                {peek ? (
                  <span className="ws-peek-text">
                    <Inline text={peek} math />
                  </span>
                ) : (
                  <span className="lg-thinking" aria-label="Thinking">
                    <span /> <span /> <span />
                  </span>
                )}
              </button>
            ) : (
              <span className="ws-peek-gap" />
            )}
            <button
              type="button"
              className="ws-dock-toggle"
              aria-expanded={dockShown}
              onClick={() => setDockOpen((v) => !v)}
              title={dockOpen ? 'Fold the conversation away' : 'The whole conversation'}
            >
              {dockOpen ? 'Fold away' : `Conversation · ${messages.length}`}
            </button>
          </div>
        )}
        {/* folded, the notes sit under the reply's peek; open, in the thread */}
        {!dockShown && chatNotes}
        {focusBrief && (
          <div className="ws-chat-focus" role="status">
            <span>About</span>
            <strong>{focusBrief.label}</strong>
            <span>{focusBrief.of}</span>
            <button type="button" aria-label="Clear what the conversation is about" onClick={() => setFocus(null)}>×</button>
          </div>
        )}
        {convoBody}
      </div>
    ) : null;
  // THE INSPECTOR, WHEN THERE IS SOMETHING TO INSPECT. Selecting a part of a
  // model, a parameter or an input brings a small card describing it; it
  // goes when the selection does. "Keep open" makes it a panel.
  const inspectorOpen = !!wsLayout && panelsOf(wsLayout).some((x) => x.type === 'inspector');
  const cardFocus = focus && focus.kind !== 'node' && focus.kind !== 'part' ? focus : null;
  const cardDoc = cardFocus && map.models ? (docOf(map.models, cardFocus.doc) ?? wsActiveDoc) : null;
  const wsCard =
    workspaceOn && cardFocus && cardDoc && !inspectorOpen ? (
      <aside className="ws-card" aria-label="What is selected">
        <div className="ws-card-acts">
          <button
            type="button"
            className="ws-card-keep"
            onClick={() => wsLayout && changeLayout(addPanel(wsLayout, { type: 'inspector' }, 1.6, 0.32).layout)}
          >
            Keep open
          </button>
          <button type="button" className="ws-act" aria-label="Close" onClick={() => setFocus(null)}>
            ×
          </button>
        </div>
        <InspectorPanel map={map} doc={cardDoc} focus={cardFocus} onFocus={setFocus} onAsk={stableAskLabel} />
      </aside>
    ) : null;

  return (
    <div
      className="logos-root"
    >
      {introWanted && (
        <LogosIntroOnce
          onStart={(text) => {
            firstRun.reach('socria.intro');
            // straight through: the answer to their own question is the welcome
            void send(text);
          }}
          onSkip={() => firstRun.reach('socria.intro', { skipped: true })}
        />
      )}
      <LogosGuide open={guideOpen} onClose={closeGuide} edition={workspaceOn ? 3 : 2} />
      {shareOpen && activeId && (
        <ShareDialog
          type="conversation"
          id={activeId}
          title={active?.title && active.title !== UNTITLED ? active.title : 'A line of thinking'}
          open
          onClose={() => {
            setShareOpen(false);
            together.recheck();
          }}
          onUpgrade={() => window.location.assign('/one')}
          onLeft={() => {
            setShareOpen(false);
            if (activeIdRef.current && foreignIdsRef.current.has(activeIdRef.current)) window.location.assign('/chat');
          }}
        />
      )}
      {together.active && <RemoteCursors people={together.people} />}
      {together.active && (
        <CommentPins
          counts={openByAnchor(comments.comments)}
          onOpen={(id) => {
            setCommentsOn(nodeAnchor(id));
            setCommentsOpen(true);
          }}
        />
      )}
      {together.active && commentsOpen && (
        <CommentsPanel
          state={comments}
          labelFor={(anchor) => {
            const a = readAnchor(anchor);
            if (a.kind === 'node') return map.nodes.find((n) => n.id === a.ref)?.label ?? null;
            if (a.kind === 'message') {
              const m = active?.messages[Number(a.ref)];
              return m ? excerpt(m.content) : null;
            }
            return null;
          }}
          generalAnchor=""
          generalLabel="this line of thinking"
          hint="Select a card on the map to comment on it."
          target={
            focus?.kind === 'node' && commentsOn == null
              ? { anchor: nodeAnchor(focus.id), label: map.nodes.find((n) => n.id === focus.id)?.label ?? 'this card' }
              : null
          }
          onClearTarget={() => setFocus(null)}
          focusAnchor={commentsOn}
          onClearFocus={() => setCommentsOn(null)}
          onJump={(anchor) => {
            const a = readAnchor(anchor);
            if (a.kind === 'node') setFocus({ kind: 'node', id: a.ref });
          }}
          onClose={() => {
            setCommentsOpen(false);
            setCommentsOn(null);
          }}
        />
      )}
      <Tour open={tourOpen} steps={workspaceOn ? LOGOS3_TOUR : LOGOS_TOUR} onDone={endTour} />
      {styleOpen && (
        <div className="lg-style-scrim" role="dialog" aria-modal="true" aria-label="How should Socria work with you?">
          <div className="lg-style-back" onClick={() => setStyleOpen(false)} aria-hidden="true" />
          <div className="lg-style-sheet">
            <h2 className="lg-style-title">Socria Personality</h2>
            <p className="lg-style-sub">
              How Socria communicates while it thinks with you. How far the
              thinking goes is Logos&rsquo;s to judge; this decides how it
              sounds on the way.
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

      {/* The account, over the map — the same sheet /chat opens, so there is
          one account surface in the product rather than two that drift. */}
      <AccountSheet
        open={acctOpen}
        onClose={() => setAcctOpen(false)}
        isOne={one}
        onRetakeTour={() => setTourOpen(true)}
      />

      <SocriaOneModal
        open={oneOpen}
        onClose={() => setOneOpen(false)}
        onUnlock={takeOne}
        reason={oneReason}
        busy={oneBusy}
        error={oneError}
      />

      {/* The Thinking Journey sheet used to be mounted here, behind the
          header's memory button. Both are gone: the rail's footer links to
          /memory, which holds the Mind Graph AND the Journey with the same
          per-entry forget this sheet carried. Nothing was dropped on the way
          past — it is one screen instead of two. */}

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
        className={`lg-split${workspaceOn ? ' is-ws' : ''}${railOpen && !chromeHidden ? '' : ' rail-closed'}${chromeHidden ? ' chrome-hidden' : ''}${draftOpen ? ' draft-open' : ''}${
          mobileView === 'map' ? ' mv-map' : ''
        }`}
      >
        {/* The rail is the Core surface's rail, and app-shell.css scopes every
            `.s-*` rule under `.app-root` — so it arrives inside one. The host
            is a box in this grid and nothing more: `.app-root`'s own page
            background and 100svh floor belong to a page, not to one column of
            this one, and globals.css turns both off for `.lg-railhost`. */}
        <div className="app-root lg-railhost">
          <LogosRail
            sessions={sessions}
            rewards={cloud}
            chats={chats}
            onOpenChat={onOpenChat}
            activeId={activeId}
            open={railOpen && !chromeHidden}
            syncing={hydrating}
            onSelect={(id) => {
              switchSession(id);
              usedRail();
            }}
            onNew={() => {
              newSession();
              usedRail();
            }}
            onDelete={deleteSession}
            onRename={renameSession}
            onToggle={() => setRailOpen((v) => !v)}
            projects={projects}
            onOpenProject={onOpenProject}
            onNewInProject={(pid) => {
              newSession(pid);
              usedRail();
            }}
            onProjectSettings={onProjectSettings}
            onCreateProject={onCreateProject}
            onMoveSession={(id, pid) => void moveSession(id, pid)}
            onMoveChat={onMoveChat}
          />
        </div>

        {workspaceOn && wsLayout ? (
          <div className="lg-ws-col">
            <Workspace
              layout={wsLayout}
              onLayout={changeLayout}
              render={renderPanel}
              titleOf={panelTitle}
              views={wsViews}
              arrangements={wsArrangements}
              suggestion={wsSuggestion}
              onAccept={acceptSuggestion}
              onDismiss={(s) => setWsDismissed((d) => new Set(d).add(s.id))}
              head={convoHead}
              dock={wsDock}
              dockSide={dockSide}
              onDockSide={moveDock}
              onResetView={resetView}
              overlay={wsCard}
            />
          </div>
        ) : (
          <>
            {/* ── Conversation ───────────────────────────────── */}
            <section className="lg-convo" aria-label="Conversation">
              {convoHead}
              {convoBody}
            </section>

            {/* ── Thinking Map ───────────────────────────────── */}
            <section className="lg-panel" aria-label="Thinking map">
              {mapBody({ primary: true })}
            </section>
          </>
        )}

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
        {chromeHidden && (
          <button
            type="button"
            className="lg-chrome-show"
            onClick={() => hideChrome(false)}
            aria-label="Show the chats bar and header"
            title="Show the chats bar and header"
          >
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
              <path d="M3.5 9h17M9 9v10.5" />
            </svg>
          </button>
        )}
        {railOpen && !chromeHidden && (
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


/**
 * The first-run screen over Logos — and its own "started" event, fired once
 * per showing rather than per render.
 */
function LogosIntroOnce({ onStart, onSkip }: { onStart: (text: string) => void; onSkip: () => void }) {
  useEffect(() => {
    track('socria_intro_started', { surface: 'logos' });
  }, []);
  return <FirstRunIntro surface="logos" onStart={onStart} onSkip={onSkip} />;
}
