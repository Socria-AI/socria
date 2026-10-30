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

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  displayMeta,
  documentFromDoc,
  forgetBefore,
  isDisplayKind,
  kindOf,
  makeDisplay,
  localDay,
  mergeSpaces,
  objOf,
  readOperation,
  seek as seekObject,
  spaceOf,
  suggestionsIn,
  type CustomState,
  type MatrixState,
  type ObjectSpace,
  type ThoughtObject,
} from '@/lib/objects';
import { ExplorePanel } from '@/components/ExplorePanel';
import { emptyWorkspace, update as wsUpdate } from '@/lib/workspace/store';
import { bridgeSurfaces, projectMap, projectMind } from '@/lib/workspace/adapters';
import { trace } from '@/lib/workspace/trace';
import { LogosRail, type RailProject } from '@/components/LogosRail';
import { LogosComposer, type Draft } from '@/components/LogosComposer';
import { MsgActions, SocriaAnswering, type Side } from '@/components/LogosMessage';
import { WriteSpace, type SaveState, type WriteSpaceHandle } from '@/components/write/WriteSpace';
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
import { AccountControl } from '@/components/account/AccountControl';
import { AccountSheet } from '@/components/account/AccountSheet';
import { useConversationStyle } from '@/components/useConversationStyle';
import { ChallengeChip } from '@/components/rewards/ChallengeChip';
import { PLAN_CHANGED, SESSION_SAVED } from '@/components/rewards/useRewards';
import { CollabBar } from '@/components/CollabBar';
import { useLogosCollab } from '@/components/useLogosCollab';
import { cleanName, joinCodeFrom } from '@/lib/collab';
import { callsSocria, cleanWebSources, landReply, mentionsSocria, newMsgId, replyRefOf, withArrived, withoutTurn, type ReplyRef } from '@/lib/chat-thread';
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
  firstMapCrossed,
  openingValue,
  readStart,
  startMessage,
} from '@/lib/first-session';
import { exportMapPng } from '@/components/MapPoster';
import { sanitizeUserUnderstanding, type UserUnderstanding } from '@/lib/socria-prompt';
import {
  FREE_DEPTH,
  meaningfulNodes,
  type Plan,
} from '@/lib/socria-one';
import {
  SOCRIA_MODELS,
  type ReplyLength,
  type SocriaModel,
  type ThinkingDepth,
} from '@/lib/socria-prompt';
import { guardWatches, type GuardSignal } from '@/lib/logos-guidance';
import { MAX_STYLE, STYLE_CHANGED, STYLE_KEY, storeStyle, storedStyle } from '@/lib/logos-style';
import { readLength, rememberLength } from '@/lib/socria-model-store';
import { ConcisePicker } from '@/components/logos5/ConcisePicker';
import { MakePicker } from '@/components/logos5/MakePicker';
import { askFor, makeChoice } from '@/lib/logos5/make';
import { saveTemplate, templateChoice, templateOf, templatePayload } from '@/lib/logos5/templates';
import { useTemplates } from '@/components/logos5/useTemplates';
import { MADE_OFFER, madeAsked, madeListed, madeOffer, mapArtifacts, pictureRepeatsDisplay, plotArtifact, readMade, writeMade, type MadeKey, type MadeRecord } from '@/lib/logos5/artifacts';
import { cleanTitle } from '@/lib/session-rail';
import { artifactFromSpec, sanitizeInlineStateOne, type InlineSpec, type InlineState } from '@/lib/inline-ui';
import { buildStarters, PENDING_TYPES } from '@/lib/starters';
import { billingError, billingLine } from '@/lib/billing-message';
import { ContextPanel } from '@/components/ContextPanel';
import { ConnectionsModal } from '@/components/ConnectionsModal';
import { MAX_ATTACHMENTS, MAX_NOTE_CHARS, type Attachment, type AttachmentOrigin } from '@/lib/logos-attachments';
import { MAX_CONTEXTS_PER_NODE, sanitizeContexts, type NodeContext } from '@/lib/logos-sources';
import { relevantNodes } from '@/lib/write/links';
import { addCard as addDraftCard, emptyDoc, isEmptyDoc, type CardKind, type WriteDoc } from '@/lib/write/doc';
import { normalizeDraft, storedFrom } from '@/lib/write/parse';
import { describeWriting, type WriteSel } from '@/lib/write/focus';
import type { AssistInput, AssistResult } from '@/lib/write/assist';
import { boundaryNote, DIRECT_UPLOAD_BYTES, limitsFor, type Counter } from '@/lib/entitlements';
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
import { DisplayPanel } from '@/components/display/DisplayPanel';
import { DocsContext, type DocsApi } from '@/components/display/docs-context';
import { AUTO_PAGES, docNow, loadDocs, onDoc, pagesToRead, putDoc, putOriginal, readFileAsDoc, readPages as readDocPages } from '@/lib/docs/client';
import { docLetters, docsForRequest } from '@/lib/docs/conversation';
import { renderDocAsNote, type DocRef } from '@/lib/docs/render';
import { BLOCK_ID } from '@/lib/docs/sanitize';
import type { SourceDoc } from '@/lib/docs/types';
import type { DocumentState } from '@/lib/objects/display-document';
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
import { afterDisplay, arrangementsFor, factsFrom, interfaceContext, layoutForRequest, openBeside, showLens, suggestLayout, suggestViews, viewCatalogue, type LayoutSuggestion } from '@/lib/workspace/surfaces';
import { interfaceSaid, readInterfaceRequest } from '@/lib/workspace/interface-request';
import { describeFocus, type Focus } from '@/lib/workspace/focus';
import { LOGOS4 } from '@/lib/logos4/flags';
import { MAP_EVERY_TURN } from '@/lib/logos5/flags';
import { L5Layout, L5Tabs, L5TopBar, L5Working, SplitView } from '@/components/logos5/L5Views';
import { GlobalSearch } from '@/components/logos5/GlobalSearch';
import { ContentView, PlainReader, WriteUpReader } from '@/components/logos5/ContentView';
import { broughtBy, contentOf, isWriteUp, writeUpId, writeUpParts } from '@/lib/logos5/content';
import { OPENING, SPLIT_NAMES, afterSend, chatVisible, choose, dock, fit, onMade, readBesideShare, screenForRequest, splitMenu, writeBesideShare, type ModelTool, type Screen, type SplitChoice, type Viewport } from '@/lib/logos5/views';
import { acceptTitle } from '@/lib/logos5/title';
import { needsMap, routeTurn, tableInReply, turnsSince, type TurnRoute } from '@/lib/runtime/orchestrate';
import type { Hit, IndexDoc } from '@/lib/runtime/representation';
import { effectSaid, linksOf, turnEffect } from '@/lib/logos5/linking';
import { L5Message, L5Pending, type L5Effect } from './logos5/L5Message';
import { ModelArtifact } from './logos5/ModelTools';
import { L5Header, L5LinkBar, L5Menu, type L5MenuItem } from './logos5/L5Chrome';
import { ArtifactsView, StudyBoard, StudyPractice, TopicInspector, type ArtifactItem } from './logos5/Study';
import { L5Ask, type AskExchange } from './logos5/L5Ask';
import { UniverseView, type SharedIn } from './logos5/Universe';
import { MemoryView } from './logos5/MemoryView';
import type { UniverseIn } from '@/lib/logos5/universe';
import { checkPractice, clozeFrom, intentOf, looksLikeEntries, plainSort, sortedSaid, type Gap, type Intent, type Practice, type Sorted, type StudyQuote, type StudyState as StudyCore } from '@/lib/logos5/study';
import { restudy, studyIn, type StudyState } from '@/lib/objects/display-study';
import './logos5/l5.css';
import './logos5/redesign.css';
import './logos5/l5v.css';
import { CaptureInbox } from './CaptureInbox';
import { cleanCaptureText, forComposer, forNode, newCaptureId, readLocalCaptures, writeLocalCaptures, type Capture } from '@/lib/logos4/captures';
import { anchorOf, browserStorage, forgetView, partStands, pickUp, readResume, selectionStands, writeView, type ScrollAt, type SessionView } from '@/lib/logos4/resume';
import { digestOf } from '@/lib/cognition/digest';
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
import { LENSES, isMadeLens, type LensId, type MadeLens } from '@/lib/logos-layout';

/** Where a person's own Logos 3 arrangement is kept: this browser, never the session. */
const WS_KEY = 'socria.logos3.workspace.v2';
/** A scene with nothing in it: what the first description typed into the chat, with Live 3D open, is built on. */
const EMPTY_SCENE: SceneState = { nodes: [], next: 1, unit: 'm' };
/** A new 3D studio (CAD), open in Artifacts before anything is built in it — and the panel it is drawn in. */
const STUDIO = 's:new';
const STUDIO_PANEL = 'l5a-s-new';
/** Where the conversation dock sits around the stage. */
const DOCK_KEY = 'socria.logos3.dock.v1';
/** the chats bar and header, hidden from the top-right control — per browser */
const CHROME_KEY = 'socria.logos.chrome.v1';
import { readDrift, type DriftVerdict } from '@/lib/topic-drift';
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
import { lastReplyIn, skipsMap } from '@/lib/map-skip';
import { OWED_PACE_MS, OWED_PER_DAY, countDrawn, drawnOn, nextOwed, readOwed, writeOwed } from '@/lib/logos5/merge';
import { FirstRunIntro } from '@/components/onboarding/FirstRunIntro';
import { WhatsNew } from '@/components/onboarding/WhatsNew';
import { GUEST_TURNS, guestTurnsUsed } from '@/lib/guest-limits';
import { GuestWall } from '@/components/logos5/GuestWall';
import { useFirstRun } from '@/components/useFirstRun';
import { wantsIntro, wantsWhatsNew } from '@/lib/first-run';
import { computationFacts, whatChanged } from '@/lib/model/inspect';
import { viewsFor } from '@/lib/model/views';
import { affectedBy } from '@/lib/model/deps';
import { readSeen, markSeen } from '@/lib/hints';
import { applyMapEdits, dropRemoved, keyOf as mapKeyOf, readMapAdd, readMapCommandAbout, readMapSelect, replayMapChange, type MapEdit, type Touched } from '@/lib/map-edit';
import { besideEmpty, fillSlot, readCapture, readWorkspaceCommand, VIEW_SAID, type CommandContext, type Slot, type WorkspaceCommand } from '@/lib/logos5/commands';
import { applyDocCommand, dictate, docDeleteOf, readDocCommand } from '@/lib/write/voice-edit';
import { cleanUtterance, DEFAULT_VOICE, pickEngine, readControl, readVoiceSettings, splitSteps, writeVoiceSettings, type Control, type VoiceEngine, type VoiceSettings } from '@/lib/voice/speech';
import { riskOf, type Risk } from '@/lib/voice/risk';
import { SOCRIA_VOICE } from '@/lib/voice/flag';
import { useEar, useSocriaVoice } from '@/components/logos5/useSocriaVoice';
import { VoiceButton, VoiceOffNote, VoicePanel, VoiceSheet, type SheetKind, type VoiceConfirming, type VoiceOutcome, type VoiceQueued } from '@/components/logos5/SocriaVoice';
import { forgetMapBefore, recordChange } from '@/lib/map-history';
import type { AskExperience, WorkspaceAction, WorkspaceResult } from '@/components/objects/figures';
import { readViewRequest, viewSaid } from '@/lib/view-request';
import type { ExploreResult, NodeMode } from '@/lib/logos-explore';
import {
  emptySession,
  loadLocal,
  saveLocal,
  sortSessions,
  titleFor,
  UNTITLED,
  relTime,
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

/** A change to a line of thinking's map, kept for Undo and Redo this visit (components/LogosApp.tsx undoMap). */
interface MapChange {
  sid: string;
  before: TMap;
  after: TMap;
  said: string;
}

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
// The person's own instructions are kept by lib/logos-style.ts, which Manage
// Account writes through too (components/account/LogosInstructions.tsx). The
// personality is the account's Conversation Style, the same one Core 4 uses.
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
  onUpdateProject,
  onMoveChat,
  // The Core chats brought into Logos 5 (lib/logos5/merge.ts), told to the
  // host so its own list moves them too: from then on its rail opens them here.
  onConversationsMoved,
  // What others have shared with them, and the two ways in: pressing one, and
  // an eight-character code (the host holds the dialog and where each opens).
  shared,
  onOpenShared,
  onJoinWithCode,
  autoSend = false,
  tourAfter = false,
}: {
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
  /** rename a Project or change its colour; what went wrong, or null */
  onUpdateProject?: (id: string, patch: { name?: string; color?: string | null }) => Promise<string | null>;
  onMoveChat?: (id: string, projectId: string | null) => void;
  onConversationsMoved?: (moved: { id: string; title: string; updatedAt: number; projectId: string | null }[]) => void;
  /** what is shared with them (/api/shared); undefined signed out — the contents column then has no such group */
  shared?: SharedIn[];
  onOpenShared?: (item: SharedIn) => void;
  /** signed in: "Join with a code", in the More menu and under Shared with you */
  onJoinWithCode?: () => void;
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
  const mobileViewRef = useRef(mobileView);
  mobileViewRef.current = mobileView;
  // "How should Socria work with you?" — their standing instructions.
  const [styleText, setStyleText] = useState('');
  const [styleOpen, setStyleOpen] = useState(false);
  const [styleDraftText, setStyleDraftText] = useState('');
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
  /** what the engine said about a model built (or refused) this turn */
  const [buildNote, setBuildNote] = useState<string | null>(null);
  // a display the last turn made, to be opened beside the map once the map holds it (surfaces.ts afterDisplay)
  const [displayToOpen, setDisplayToOpen] = useState<string | null>(null);
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
  const inputRef = useRef(input);
  inputRef.current = input;
  /** the message the next one answers — set by Reply, shown above the composer */
  const [replyTo, setReplyTo] = useState<ReplyRef | null>(null);
  const replyToRef = useRef(replyTo);
  replyToRef.current = replyTo;

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
  /** Socria is answering — as of now, not as of the last render (send sets it the moment a turn goes) */
  const busyRef = useRef(false);
  busyRef.current = busy;
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
  const [relevant, setRelevant] = useState<Set<string>>(new Set());
  // the Draft Space and the Writing Space, open (components/write/WriteSpace.tsx)
  const writeRef = useRef<WriteSpaceHandle>(null);
  /** POINT & ASK on writing: words of the draft, or a card, asked about in the conversation */
  const [writeSel, setWriteSel] = useState<WriteSel | null>(null);
  const writeSelRef = useRef<WriteSel | null>(null);
  writeSelRef.current = writeSel;
  const [draftSaveState, setDraftSaveState] = useState<SaveState>('saved');
  /** the lines of thinking whose writing was opened on this visit — a blank page is shown only once asked for */
  const [writeStarted, setWriteStarted] = useState<Record<string, true>>({});
  /** the paragraph being written lights what it touches on the map — a new set only when that changes */
  const onWritingParagraph = useCallback((text: string) => {
    const ids = text.trim() ? relevantNodes(mapRef.current, text) : [];
    setRelevant((prev) => (prev.size === ids.length && ids.every((id) => prev.has(id)) ? prev : new Set(ids)));
  }, []);
  /** a phone's width, for the writing's own layout wherever it is shown */
  const [writeNarrow, setWriteNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 720px)');
    const on = () => setWriteNarrow(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);

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
  // Logos 5: what to make, chosen before asking (components/logos5/MakePicker.tsx) — spent by the message that asks for it
  const [makeId, setMakeId] = useState<string | null>(null);
  // the person's own templates (lib/logos5/templates.ts): choices in Make beside the list
  const templates = useTemplates();
  const ownChoices = useMemo(() => templates.map(templateChoice), [templates]);
  const pickMake = (id: string | null) => {
    // CAD is built here, by describing it: the studio opens in Artifacts, and nothing is asked of a model
    if (makeChoice(id, ownChoices)?.opens === 'studio') {
      openStudio();
      setComposerFocus((f) => ({ n: (f?.n ?? 0) + 1 }));
      return;
    }
    setMakeId(id);
    if (id) setComposerFocus((f) => ({ n: (f?.n ?? 0) + 1 }));
  };
  // Logos 4, Quick Capture: the inbox is open
  const [captureOpen, setCaptureOpen] = useState(false);
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

  // ── DOCUMENTS (lib/docs) ──────────────────────────────────────────
  // Every document this line of thinking was given, as it was read. The
  // reading stays on this device (lib/docs/client.ts — memory and IndexedDB):
  // a turn sends the conversation's documents with it, the replies' citations
  // are checked against them here, and the document view shows them. Letters
  // come from the conversation itself (lib/docs/conversation.ts), the same
  // way the server letters what it shows the model.
  const [docs, setDocs] = useState<ReadonlyMap<string, SourceDoc>>(() => new Map());
  const docsRef = useRef(docs);
  docsRef.current = docs;
  const [docReading, setDocReading] = useState<Record<string, { done: number; of: number }>>({});
  const letters = useMemo(() => docLetters(messages), [messages]);
  const docRefs = useMemo<DocRef[]>(() => [...letters].flatMap(([id, letter]) => (docs.get(id) ? [{ letter, doc: docs.get(id)! }] : [])), [letters, docs]);
  const docIdsKey = [...letters.keys()].join(',');
  // a document changed anywhere on this device — a page read, a correction — is the one shown and sent
  useEffect(() => onDoc((doc) => setDocs((m) => (m.get(doc.id) === doc ? m : new Map(m).set(doc.id, doc)))), []);
  // the documents of the open line of thinking, from what this device kept
  useEffect(() => {
    const missing = (docIdsKey ? docIdsKey.split(',') : []).filter((id) => !docsRef.current.has(id));
    if (!missing.length) return;
    let off = false;
    void loadDocs(missing).then((found) => {
      if (off || !found.length) return;
      setDocs((m) => {
        const n = new Map(m);
        for (const d of found) n.set(d.id, d);
        return n;
      });
    });
    return () => {
      off = true;
    };
  }, [docIdsKey]);

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
  // the document of the Draft Space and the Writing Space; a blank one until something is written
  const storedWriteDoc = active?.draft?.doc;
  const writeDoc = useMemo<WriteDoc>(() => storedWriteDoc ?? emptyDoc(0), [storedWriteDoc]);
  const writeDocRef = useRef(writeDoc);
  writeDocRef.current = writeDoc;
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
  const guard: GuardSignal = guardWatches(map, (map.objects?.objs ?? []).some((o) => !!displayMeta(o.kind)?.practice))
    ? revealedIds.has(activeId ?? '')
      ? 'reveal'
      : 'guard'
    : '';
  const guarded = guard === 'guard';
  // async closures (refreshMap, sends) read the latest through refs
  const depthRef = useRef<ThinkingDepth>('balanced');
  depthRef.current = depth;
  // LOGOS 5: HOW MUCH IT SAYS, THE ONE SETTING (components/logos5/ConcisePicker.tsx).
  // Kept where Core 4 keeps its length (lib/socria-model-store.ts), so the two
  // agree. Logos 5 offers no depth: it answers at Balanced, and length is the
  // dial — l5Ref says which surface is asking, set once l5 is known below.
  const [replyLength, setReplyLength] = useState<ReplyLength>('standard');
  const lengthRef = useRef<ReplyLength>('standard');
  lengthRef.current = replyLength;
  const l5Ref = useRef(false);
  useEffect(() => setReplyLength(readLength()), []);
  const pickLength = (next: ReplyLength) => {
    setReplyLength(next);
    rememberLength(next);
  };
  const guardRef = useRef<GuardSignal>('');
  guardRef.current = guard;
  const styleRef = useRef('');
  styleRef.current = styleText;
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
    // Logos 5 has no depth control at all — its one setting is the length —
    // so it answers Balanced, whatever another surface stored.
    depth: !l5Ref.current && depthOn ? depthRef.current : ('balanced' as ThinkingDepth),
    // Logos 5 — the new Socria, behind its access code: its one setting (how
    // long the answers run), and which screen this is, so the reply speaks as
    // Logos 5 here and as the Logos they had everywhere else (lib/runtime personaOf)
    ...(l5Ref.current ? { length: lengthRef.current, surface: 'logos5' as const } : {}),
    guard: guardRef.current,
    // the character chosen for the account — the same one Core 4 uses —
    // and the written instructions below it (lib/conversation-style.ts)
    conversationStyle: conversationStyleRef.current,
    style: styleRef.current,
    // where they are, so the reply knows when "today" is (app/api/logos/chat nowLine)
    tz: browserTimeZone(),
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
    setStyleOpen(false);
    setStyleUpdatedNote(false);
    storeStyle(next);
  }

  // Saved somewhere else — Manage Account, or Logos in another tab — and used
  // from the next message here, without a reload.
  useEffect(() => {
    const read = () => setStyleText(storedStyle());
    const fromOtherTab = (e: StorageEvent) => {
      if (e.key === null || e.key === STYLE_KEY) read();
    };
    window.addEventListener(STYLE_CHANGED, read);
    window.addEventListener('storage', fromOtherTab);
    return () => {
      window.removeEventListener(STYLE_CHANGED, read);
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
  // INSTANT RESUME: a line of thinking opens where its thread was left — the
  // message that was at the top, as far into it as it was — or at its end.
  // Opening one with as many messages as the last no longer keeps the last
  // one's scroll position by accident.
  const pendingScrollRef = useRef<ScrollAt | null>(null);
  /** the session whose view was just restored — its reply is not to be cleared */
  const restoredForRef = useRef<string | null>(null);
  useEffect(() => {
    if (hydrating) return;
    const t = threadRef.current;
    if (!t) return;
    const want = pendingScrollRef.current;
    pendingScrollRef.current = null;
    requestAnimationFrame(() => {
      const el = want && 'msg' in want ? t.querySelector<HTMLElement>(`[id="lg-m-${want.msg}"]`) : null;
      if (el && want && 'msg' in want) t.scrollTop += el.getBoundingClientRect().top - t.getBoundingClientRect().top - want.offset;
      else t.scrollTop = t.scrollHeight;
      atEndRef.current = t.scrollHeight - t.scrollTop - t.clientHeight < 48;
    });
  }, [activeId, hydrating]);

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

  // EVERYONE, once the account has answered: signed in, holding the access
  // key, or a GUEST — signed out, with one line of thinking and its map
  // (lib/guest-pass.ts; a second asks them to sign up, GuestWall).
  const hasAccess = unlocked || !!isSignedIn || authSettled;
  const guest = authSettled && !isSignedIn && !unlocked;
  const guestRef = useRef(guest);
  guestRef.current = guest;
  /** the guest's one line of thinking, claimed on this server (POST /api/logos/guest) */
  const guestClaimRef = useRef<string | null>(null);
  const [guestWall, setGuestWall] = useState(false);
  const signUpHref = authUrl('sign-up', '/chat');
  const signInHref = authUrl('sign-in', '/chat');
  /** Claim the guest's one line of thinking before its first turn: false when another is already theirs. */
  async function claimGuestPass(sessionId: string | null): Promise<boolean> {
    if (!sessionId) return false;
    if (guestClaimRef.current === sessionId) return true;
    try {
      const r = await fetch('/api/logos/guest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) });
      if (!r.ok) return false;
      guestClaimRef.current = sessionId;
      return true;
    } catch {
      return false;
    }
  }
  /** A guest already has a line of thinking with words in it, other than this one. */
  const guestHasAnother = (id: string | null) => sessionsRef.current.some((x) => x.id !== id && x.messages.length > 0);
  /** the messages a guest has sent, of GUEST_TURNS (lib/guest-limits.ts) */
  const guestUsed = guest ? sessions.reduce((n, x) => n + guestTurnsUsed(x.messages), 0) : 0;
  const guestUsedNow = () => sessionsRef.current.reduce((n, x) => n + guestTurnsUsed(x.messages), 0);

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

  /** Save a session: true when it landed, false when it did not, null where this device does not save it as a row. */
  const persist = useCallback(
    async (s: LogosSession): Promise<boolean | null> => {
      // A SHARED ROOM IS NOT SAVED TO ANYBODY'S CONVERSATION ROW. The host's
      // client holds the merged session — both people's words — and saving it
      // would put the guest's thinking under the host's account, where the
      // guest could neither export nor delete it. The room's own event log is
      // the shared record, and every row in it carries who wrote it. The same
      // after leaving: the session still in memory is the merged one.
      if (roomRef.current?.active || sharedIdsRef.current.has(s.id)) return null;
      // A SHARED line of thinking is written through the share routes, never
      // as a whole row: turns are appended and the map is sent against the
      // version it was drawn on, so two people working at once both land
      // (lib/share/sync.ts). Someone else's is never saved as one's own.
      const t = togetherRef.current;
      if (t?.active && s.id === activeIdRef.current) {
        // what the server lacks, read from the session when the write goes
        void t.push();
        t.keepOwn(s.draft, s.contexts);
        return null;
      }
      if (foreignIdsRef.current.has(s.id)) return null;
      if (!cloud) {
        saveLocal(sessionsRef.current);
        return true;
      }
      try {
        const res = await fetch('/api/conversations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: { ...s, kind: 'logos' } }),
        });
        // the stored map changed: Socria Rewards reads progress from it (components/rewards/useRewards)
        if (res.ok) window.dispatchEvent(new Event(SESSION_SAVED));
        return res.ok;
      } catch {
        // A failed save must never interrupt thinking. The session stays in
        // memory and the next turn tries again.
        return false;
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
  // a reply belongs to the conversation it was started in — and comes back
  // with it (Instant Resume restores it when the session opens)
  useEffect(() => {
    if (restoredForRef.current === activeId) return;
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
                // an old draft opens as a document, every word kept (lib/write/parse.ts)
                draft: normalizeDraft(c.draft),
                contexts: sanitizeContexts(c.contexts),
                projectId: typeof c.projectId === 'string' ? c.projectId : null,
                updatedAt: Number(c.updatedAt) || 0,
              }));
          }
        } catch {
          // Fall through to an empty list rather than blocking the page.
        }
        // A GUEST WHO SIGNED UP: what they thought through signed out, on this
        // browser, comes with them — saved to the account once, then no longer
        // kept on the device (lib/guest-pass.ts; GuestWall promises it).
        const carried = loadLocal().filter((x) => x.messages.length > 0 && !list.some((y) => y.id === x.id)).slice(0, 5);
        if (carried.length && !cancelled) {
          const kept: LogosSession[] = [];
          for (const x of carried) {
            try {
              const r = await fetch('/api/conversations', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversation: { ...x, kind: 'logos' } }),
              });
              if (r.ok) kept.push(x);
            } catch {
              /* kept on the device; the next sign-in tries again */
            }
          }
          if (kept.length) {
            const keptIds = new Set(kept.map((x) => x.id));
            list = [...kept, ...list];
            saveLocal(loadLocal().filter((x) => !keptIds.has(x.id)));
          }
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
      // INSTANT RESUME: the line of thinking that was open when they left, on
      // this browser — unless a link or a first message chose another.
      const left = LOGOS4.resume && !wanted && !pendingStart ? readResume(browserStorage()).last : null;
      const target = (wanted && sorted.find((s) => s.id === wanted)?.id) || (left && sorted.find((s) => s.id === left)?.id) || sorted[0].id;
      setActiveId(target);
      activeIdRef.current = target;
      // LOGOS 5 opens on the Universal Map — unless a link, a Project or a
      // first message chose a line of thinking, or there is nothing on it yet
      if (!wanted && !pendingStart && sorted.some((x) => x.messages.length > 0)) setL5Home(true);
      chronRef.current = [...(sorted.find((s) => s.id === target)?.messages ?? [])];
      if (!pendingStart) restoreView(target, 'load');
      setHydrating(false);
      // Applied, not consumed: the tree this runs in may be thrown away and
      // mounted again (see pendingStart), and the message has to survive
      // that. It is cleared when the person sends it — the one event that
      // means it has left the composer.
      if (pendingStart) {
        const { id, message } = pendingStart;
        // Logos 5 begins on the Universal Map: the opening goes into the box at its foot
        setHomeStart(message);
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
    saveView();
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
    setLimitNoteOff(false);
    setError(null);
    setStreaming('');
    // The engine's note and the last reply's ops belong to the session they
    // were made in; carried over, the ops replayed onto the next surface.
    setBuildNote(null);
    setVizOps(null);
    // ...and its own view comes back: its half-typed message, its selection, its place
    restoreView(id, 'switch');

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

  function newSession(projectId: string | null = null): boolean {
    // a guest has one line of thinking: starting another is where an account comes in
    if (guestRef.current && sessionsRef.current.some((x) => x.messages.length > 0)) {
      setGuestWall(true);
      return false;
    }
    // The month's count is the server's, and it is spent when a line of
    // thinking BEGINS rather than when an empty one is created — so opening
    // Logos and closing it again costs nothing. Everything already open stays
    // open and stays usable; what runs out is starting another.
    if (!one && chatsSpent) {
      ask('chats-spent');
      return false;
    }
    // Begun inside a folder, it is filed there from its first save: the
    // session carries its Project and persist() sends it with everything else.
    const fresh = projectId ? { ...emptySession(), projectId } : emptySession();
    applySessions([fresh, ...sessionsRef.current]);
    switchSession(fresh.id);
    // A brand-new empty session isn't worth a round trip until it has content.
    return true;
  }

  // ── QUICK CAPTURE (Logos 4, components/CaptureInbox.tsx) ─────────
  // A capture goes where the person sends it, and no further: into the
  // composer (a new line of thinking's, or this one's) or onto the map as a
  // card. Nothing is sent and nothing is filed by itself.
  function captureToComposer(c: Capture, fresh: boolean) {
    const { text, attachments } = forComposer(c);
    if (fresh && !newSession()) return setCaptureOpen(false);
    const room = Math.max(0, MAX_ATTACHMENTS - (fresh ? 0 : drafts.length));
    const extra: Draft[] = attachments.slice(0, room).map((a, i) => ({ ...a, id: `cap_${c.id}_${i}_${Date.now().toString(36)}`, status: 'ready' as const }));
    if (fresh) setDrafts(extra);
    else if (extra.length) setDrafts((prev) => [...prev, ...extra]);
    const joined = fresh || !inputRef.current.trim() ? text : text ? `${inputRef.current.trimEnd()}\n\n${text}` : inputRef.current;
    draftToComposer(joined);
    setMobileView('chat');
    setCaptureOpen(false);
  }

  function captureToMap(c: Capture) {
    const said = editMap([{ op: 'add', node: { label: forNode(c), type: 'idea' } }]);
    if (said) {
      setMobileView('map');
      setCaptureOpen(false);
    }
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
    forgetView(browserStorage(), id);
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
            sessionId: forSession,
            messages: chronRef.current,
            map: mapRef.current,
            // contextsRef is only reassigned on render, so a just-attached
            // context isn't in it yet — callers that just changed grounding
            // pass the fresh map explicitly.
            contexts: contextsOverride ?? contextsRef.current,
            // the person's own calendar day, for a plan's "next Friday" — never the server's
            today: localDay(),
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
              // WHAT CHANGED, AND WHEN — kept for the Time Machine, with the
              // person's own words on the turn that changed it (lib/map-history.ts)
              const words = [...s.messages].reverse().find((m) => m.role === 'user')?.content;
              const history = recordChange(s.map?.history, s.map?.nodes ?? [], kept.nodes, Date.now(), 'turn', typeof words === 'string' ? words : undefined);
              // Shared: the host draws, both see it. onLocalMap returns the
              // map with each node attributed to whoever it was drawn from,
              // so the local view shows the same author dots the other
              // person sees; alone it returns the map unchanged.
              const drawn =
                roomRef.current.active && sharedIdsRef.current.has(s.id)
                  ? roomRef.current.onLocalMap(kept as TMap)
                  : kept;
              // when it was drawn: the Logic Map knows whether it is behind the conversation (lib/runtime/orchestrate.ts)
              const shown = { ...(history ? { ...drawn, history } : drawn), drawnAt: Date.now() };
              return { ...s, map: shown, contexts };
            });
            setChanged(new Set(delta.changed));
            setDeltaNote(summarizeDelta(delta));
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
            } else if (json.display?.says) {
              // AN EVERYDAY DISPLAY: made, or why not, in a sentence — and when
              // it was made it opens beside the map (Logos 3.5).
              setBuildNote(String(json.display.says).slice(0, 300));
            } else {
              // A turn with no build dismisses the last one's note — it was
              // never cleared, so "built …" outranked the delta line forever.
              setBuildNote(null);
            }
            if (json.display?.ok && typeof json.display.id === 'string') setDisplayToOpen(json.display.id);
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

  // ── the Draft Space and the Writing Space ──────────────────────────
  // The document is handed here by the WriteSpace a moment after typing stops
  // (components/write/WriteSpace.tsx) and saved on a timer rather than per
  // handoff: a round trip per pause would be absurd, and losing a sentence
  // would be worse. BY SESSION ID, so writing handed over as a line of thinking
  // is left lands in that one, never in whichever is open now.
  const draftSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const draftRetry = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveDraftNow = useCallback(
    async (id: string) => {
      if (draftSave.current) clearTimeout(draftSave.current);
      draftSave.current = null;
      const s = sessionsRef.current.find((x) => x.id === id);
      if (!s) return;
      const ok = await persist(s);
      setDraftSaveState(!cloud ? 'local' : ok === false ? 'offline' : 'saved');
      // a save that did not land is tried again, quietly, until it does
      if (ok === false) {
        if (draftRetry.current) clearTimeout(draftRetry.current);
        draftRetry.current = setTimeout(() => void saveDraftNow(id), 15_000);
      }
    },
    [persist, cloud]
  );
  function patchWriteDoc(id: string, doc: WriteDoc) {
    patchSession(id, (s) => ({ ...s, draft: storedFrom(doc) }), false);
    setDraftSaveState(cloud ? 'saving' : 'local');
    if (draftSave.current) clearTimeout(draftSave.current);
    draftSave.current = setTimeout(() => void saveDraftNow(id), 1200);
  }

  // Save whatever is unsaved before the tab goes away — the writing still in
  // the WriteSpace's hands first.
  useEffect(() => {
    const flush = () => {
      writeRef.current?.flush();
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

  /** Socria, asked about the person's own writing (app/api/logos/write). */
  const runWriteAssist = useCallback(
    async (input: AssistInput): Promise<AssistResult> => {
      const res = await fetch('/api/logos/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({ ...input, ...guidance() }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.result) throw new Error(json?.error || 'That could not be done just now.');
      return json.result as AssistResult;
    },
    // guidance() reads refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [keyHeaders]
  );

  /**
   * Words of the person's own writing kept in memory, because they asked: the
   * same write path as the Memory page, so a tombstone still outranks it and a
   * duplicate comes back as what is already there. Says what happened.
   */
  const keepWritingInMemory = useCallback(async (text: string, kind: CardKind): Promise<string> => {
    const label = text.replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!label) return 'There are no words there to keep.';
    const type = kind === 'claim' ? 'Belief' : kind === 'question' ? 'Question' : kind === 'evidence' || kind === 'example' ? 'Evidence' : 'Insight';
    const title = writeDocRef.current.title.trim();
    const res = await fetch('/api/mind/node', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, label, note: `kept from your writing${title ? ` “${title.slice(0, 80)}”` : ''}` }),
    });
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(j?.error || 'That could not be kept just now.');
    if (j?.ok === false) return typeof j.say === 'string' ? j.say : 'That is already in your memory.';
    return 'Kept in your memory — you will find it on the Memory page.';
  }, []);

  /** POINT & ASK on writing: the words become the conversation's "this", and the cursor goes to the box. */
  function askAboutWriting(sel: WriteSel) {
    setFocus(null);
    setObjSel(null);
    setWriteSel(sel);
    setMobileView('chat');
    focusComposer();
  }

  /** A Logic Map idea, made a note beside the writing — linked back to the idea it came from. */
  function addNodeToDraft(node: MapNodeRef) {
    const t = node.type;
    const kind: CardKind =
      t === 'claim' || t === 'belief' ? 'claim' : t === 'evidence' || t === 'source' || t === 'given' ? 'evidence' : t === 'question' || t === 'unknown' ? 'question' : t === 'counterpoint' || t === 'counterexample' || t === 'tension' ? 'counter' : t === 'consequence' || t === 'result' ? 'conclusion' : 'idea';
    const links = [{ k: 'node' as const, id: node.id, label: node.label }];
    if (writeRef.current) {
      writeRef.current.addCard(node.label, { kind, links });
      return;
    }
    const id = activeIdRef.current;
    if (!id) return;
    const cur = sessionsRef.current.find((x) => x.id === id)?.draft?.doc ?? emptyDoc();
    patchWriteDoc(id, { ...addDraftCard(cur, node.label, { kind, links }).doc, face: 'draft' });
    openWriting();
  }

  /** The writing, opened: the Writing artifact in Logos 5, the writing column beside the map before it. */
  function openWriting() {
    if (!limits.draftSpace) {
      ask('draft-locked');
      return;
    }
    // Writing belongs to a line of thinking. On the Universal Map none is on
    // screen, so pressing Write did nothing: it opens in the empty one waiting,
    // or a new one — never in whichever was open last. Inside one, whatever is
    // over it (Memory, the list) steps aside.
    if (l5) {
      if (l5Home || !activeIdRef.current) {
        if (!newFromHome()) return;
      } else {
        setL5Mind(false);
        setL5List(false);
      }
    }
    const id = activeIdRef.current;
    if (id) setWriteStarted((m) => (m[id] ? m : { ...m, [id]: true }));
    if (l5) showArtifact('w:doc');
    else setDraftOpen(true);
  }

  /** A link on a card or a citation, followed: the passage in its document, or the idea on the map. */
  function openWritingPassage(docId: string, blockId: string) {
    // the passage, selected in its document — in Content (the display-open effect takes it there)
    openCite(docId, blockId);
  }
  function openWritingNode(id: string) {
    if (l5) setStudyTab('logic_map');
    setChanged(new Set([id]));
    if (workspaceOn) setFocus({ kind: 'node', id });
  }

  /** A document the browser cannot read itself (OpenDocument, RTF), read as attachments are — for opening into the writing. */
  const readOtherDoc = useCallback(
    async (file: File): Promise<SourceDoc> => {
      const read = await readFileAsDoc(file, { headers: keyHeaders, uploadLimit: limits.uploadBytes, directLimit: DIRECT_UPLOAD_BYTES });
      if (!read.doc) throw new Error(read.note?.why || 'That document could not be read.');
      return read.doc;
    },
    [keyHeaders, limits.uploadBytes]
  );

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
  // the free day's ten Logos messages (lib/entitlements.ts `messages`)
  const messagesSpent = spentOf('messages');
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
        // A node's conversation spends the same day's messages as the main
        // one: at the boundary, the sheet once (then the sentence in place).
        if (res.status === 402 && body?.upgrade === 'messages') {
          void refreshUsage(activeIdRef.current);
          ask('messages-spent');
        }
        throw new Error(failureText(body));
      }

      // Accepted — the reasoning done in this node belongs on the map. Same
      // rules as the main composer: a refused turn is not extracted from, and
      // an "ok" changes nothing (lib/map-skip.ts).
      if (mapWanted(routeTurn({ text: content, view: screenRef.current.view, lastReply: lastReplyIn(prior) }), skipsMap({ text: content, lastReply: lastReplyIn(prior), mapNodes: mapRef.current.nodes.length }))) refreshMap();

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

  /** Pages of a document read from their pictures, with how far it has got shown while it reads. */
  const readPagesNow = useCallback(
    async (doc: SourceDoc, pages: number[]): Promise<{ doc: SourceDoc; read: number; stopped?: string }> => {
      if (!pages.length) return { doc, read: 0 };
      setDocReading((r) => ({ ...r, [doc.id]: { done: 0, of: pages.length } }));
      try {
        return await readDocPages(doc, pages, {
          headers: keyHeaders,
          sessionId: activeIdRef.current,
          onPage: () => setDocReading((r) => (r[doc.id] ? { ...r, [doc.id]: { ...r[doc.id], done: r[doc.id].done + 1 } } : r)),
        });
      } finally {
        setDocReading((r) => {
          const n = { ...r };
          delete n[doc.id];
          return n;
        });
      }
    },
    [keyHeaders]
  );

  /**
   * A document attached in the composer: read once (lib/docs/client.ts), kept
   * on this device, and carried into the conversation as an attachment that
   * names its reading. A scan has no text to read, so its first pages are
   * read from their pictures before it is sent — the rest when asked for in
   * the document view.
   */
  const readDocument = useCallback(
    async (file: File): Promise<Attachment> => {
      const read = await readFileAsDoc(file, { headers: keyHeaders, uploadLimit: limits.uploadBytes, directLimit: DIRECT_UPLOAD_BYTES });
      // too large to come back as a reading: it travels as its text, like a note, and says so
      if (read.note) {
        const text = read.note.text.slice(0, MAX_NOTE_CHARS);
        return { kind: 'note', name: file.name, origin: 'source', text, words: text.split(/\s+/).filter(Boolean).length, ...(read.note.truncated || read.note.text.length > MAX_NOTE_CHARS ? { truncated: true } : {}) };
      }
      const doc = read.doc;
      await putDoc(doc);
      let cur = doc;
      // a PDF's original stays on this device: its pages can be looked at in the
      // conversation, and a scan's read from their pictures
      if (doc.format === 'pdf' || doc.format === 'image') await putOriginal(doc.id, file);
      const waiting = pagesToRead(doc);
      if (waiting.length && (doc.format === 'pdf' || doc.format === 'image')) {
        cur = (await readPagesNow(doc, waiting.slice(0, AUTO_PAGES))).doc;
      }
      return docAttachment(cur);
    },
    [keyHeaders, limits.uploadBytes, readPagesNow]
  );

  /** What the document view reads from: the documents here, their letters, and reading more of them. */
  const docsApi = useMemo<DocsApi>(
    () => ({
      docs,
      letterOf: (id) => letters.get(id) ?? null,
      readPages: async (id, pages) => {
        const doc = docsRef.current.get(id) ?? docNow(id);
        if (!doc) return { read: 0, stopped: 'That document is not on this device.' };
        const r = await readPagesNow(doc, pages);
        return { read: r.read, ...(r.stopped ? { stopped: r.stopped } : {}) };
      },
      reading: docReading,
      save: (doc) => void putDoc(doc),
    }),
    [docs, letters, docReading, readPagesNow]
  );

  /** The document view of a document in this workspace — made if there is none yet. Null when it cannot be. */
  function documentDisplay(docId: string): string | null {
    let space = spaceOf(mapRef.current);
    const there = space.objs.find((o) => o.kind === 'document' && (o.states[o.at] as DocumentState | undefined)?.doc === docId);
    if (there) return there.id;
    // someone who may only read a shared line of thinking adds nothing to it
    if (togetherRef.current?.active && togetherRef.current.role !== 'owner' && togetherRef.current.role !== 'editor') return null;
    const doc = docsRef.current.get(docId) ?? docNow(docId);
    const state = doc ? documentFromDoc(doc) : null;
    if (!state) return null;
    const made = makeDisplay(space, 'document', state, 'source');
    if (!made.ok) {
      setError(made.says);
      return null;
    }
    space = made.space;
    commitObjects(space, made.obj);
    return made.obj.id;
  }

  /** Open a document as it was read, beside the map. */
  function openDoc(docId: string) {
    if (!workspaceOn) return;
    const id = documentDisplay(docId);
    if (id) setDisplayToOpen(id);
  }

  /** Open the passage a citation names, selected — so what is asked next is about it. */
  function openCite(docId: string, blockId: string) {
    if (!workspaceOn) return;
    const id = documentDisplay(docId);
    if (!id) return;
    onObject({ type: 'select', obj: id, part: blockId });
    setDisplayToOpen(id);
  }

  /** The passage selected in a document view, as the next turn's "this". */
  function docFocusOf(sel: { obj: string; part: string } | null): { doc: string; block: string } | null {
    if (!sel || !BLOCK_ID.test(sel.part)) return null;
    const o = objOf(spaceOf(mapRef.current), sel.obj);
    if (!o || o.kind !== 'document') return null;
    const st = o.states[o.at] as DocumentState | undefined;
    return st?.doc ? { doc: st.doc, block: sel.part } : null;
  }

  /** `asked`: the message in place of what is typed — a chosen artifact, asked for in words (lib/logos5/make.ts) */
  function sendFromComposer(asked?: string, make?: Msg['make']) {
    // Anything still being read, or that failed, is left behind rather than
    // sent as a silent blank.
    const ready: Attachment[] = drafts
      .filter((d) => d.status === 'ready')
      .map(({ id, status, error: _e, ...rest }) => rest);
    setDrafts([]);
    void send(typeof asked === 'string' ? asked : input, ready, replyTo, make);
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
    // an edit by hand is a change the Time Machine can show, as one
    const history = recordChange(current.map.history, current.map.nodes, out.map.nodes, Date.now(), 'edit');
    const edited = history ? { ...out.map, history } : out.map;
    patchActive((s) => {
      // Grounding keyed on a removed node would linger invisibly.
      const contexts = Object.fromEntries(Object.entries(s.contexts ?? {}).filter(([id]) => liveIds.has(id)));
      return { ...s, map: edited, contexts };
    });
    const said = out.applied.map((a) => a.said).join(' ');
    const before = new Set(current.map.nodes.map((n) => n.id));
    const fresh = out.map.nodes.filter((n) => !before.has(n.id)).map((n) => n.id);
    setChanged(new Set(out.applied.flatMap((a) => ('id' in a.edit ? [a.edit.id] : 'from' in a.edit ? [a.edit.from, a.edit.to] : fresh))));
    setDeltaNote(said);
    // Undo, said or typed, takes it back (undoNow); "that" and "another" mean what it touched (recentIdea)
    mapJournalRef.current = { past: [...mapJournalRef.current.past, { sid: current.id, before: current.map, after: edited, said }].slice(-30), future: [] };
    lastChangeRef.current = { kind: 'map' };
    const last = out.applied[out.applied.length - 1]?.edit;
    if (last?.op === 'add') {
      const n = out.map.nodes.find((x) => mapKeyOf(x.label) === mapKeyOf(last.node.label));
      if (n) touchedRef.current = { id: n.id, label: n.label, ...(last.near ? { near: last.near } : {}) };
    } else if (last?.op === 'remove') touchedRef.current = null;
    else if (last) {
      const n = out.map.nodes.find((x) => x.id === ('id' in last ? last.id : last.from));
      if (n) touchedRef.current = { id: n.id, label: n.label };
    }
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

  /** what this screen shows of the open line of thinking, as Instant Resume keeps it */
  function captureView(id: string): Omit<SessionView, 'at'> {
    const t = threadRef.current;
    let scroll: ScrollAt | undefined;
    if (t && t.clientHeight > 0) {
      const top = t.getBoundingClientRect().top;
      const rects = [...t.querySelectorAll<HTMLElement>('[id^="lg-m-"]')].map((el) => {
        const r = el.getBoundingClientRect();
        return { id: el.id.slice(5), top: r.top - top, bottom: r.bottom - top };
      });
      scroll = anchorOf(rects, atEndRef.current);
    } else {
      // folded away, or behind the map on a phone: where it was last seen
      scroll = readResume(browserStorage()).views[id]?.scroll;
    }
    const draft = inputRef.current;
    return {
      ...(scroll ? { scroll } : {}),
      ...(draft.trim() ? { draft } : {}),
      ...(replyToRef.current ? { replyTo: replyToRef.current } : {}),
      ...(focusRef.current ? { focus: focusRef.current } : {}),
      ...(objSelRef.current ? { sel: objSelRef.current } : {}),
      ...(mobileViewRef.current === 'map' ? { surface: 'map' as const } : {}),
    };
  }

  function saveView(id: string | null = activeIdRef.current) {
    if (!LOGOS4.resume || !id) return;
    if (viewTimer.current) clearTimeout(viewTimer.current);
    writeView(browserStorage(), id, captureView(id));
  }

  /**
   * A line of thinking opens as this screen left it. On a switch, the
   * composer is its own (the one left kept its draft); on a reload, a draft
   * comes back only into an empty composer — never over a sentence onboarding
   * or a link just put there. Anything that no longer exists stays gone.
   */
  function restoreView(id: string, how: 'load' | 'switch') {
    if (!LOGOS4.resume) return;
    restoredForRef.current = id;
    const v = readResume(browserStorage()).views[id];
    const session = sessionsRef.current.find((x) => x.id === id);
    const msgs = session?.messages ?? [];
    if (how === 'switch') setInput(v?.draft ?? '');
    else if (v?.draft && !inputRef.current.trim()) setInput(v.draft);
    setReplyTo(v?.replyTo?.id && msgs.some((m) => m.id === v.replyTo!.id) ? v.replyTo : null);
    const m = session?.map ?? null;
    setFocus(v?.focus && m && workspaceOn && selectionStands(v.focus, m, msgs) ? v.focus : null);
    setObjSel(v?.sel && m && partStands(v.sel, m) ? v.sel : null);
    setMobileView(v?.surface === 'map' ? 'map' : 'chat');
    pendingScrollRef.current = v?.scroll ?? null;
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

  // ── POINT & ASK (Logos 4) ────────────────────────────────────────
  // Anything selectable can be asked about: it becomes the workspace's focus,
  // the composer's chip names it, and the cursor goes to the box. Nothing is
  // typed or sent for them, and on a phone the conversation comes forward.

  /** "Ask Socria" on a card of the map. */
  function askAboutNode(node: { id: string }) {
    setObjSel(null);
    setFocus({ kind: 'node', id: node.id });
    setMobileView('chat');
    focusComposer();
  }

  /** An expression in one of Socria's replies, picked (click, tap or Enter). */
  function askAboutExpression(tex: string) {
    setObjSel(null);
    setFocus({ kind: 'expression', tex, where: 'Socria’s reply' });
    focusComposer();
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
      // a document is read as a document (its equations are graphed from its view), not mined for objects
      const t = a.kind === 'note' ? a.text : a.kind === 'image' ? a.reading : undefined;
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
            // the new 3D studio's first description made its scene: Artifacts shows that scene from now on
            if (open.panel.id === STUDIO_PANEL) {
              const sid = activeIdRef.current;
              if (sid) setArtSel((m) => ({ ...m, [sid]: `s:${id}` }));
            }
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
    // Logos 5: the Live 3D scene on screen — open in Artifacts, as the view or beside it
    const ps = l5
      ? [artShownRef.current?.startsWith('s:') && (screenRef.current.view === 'artifacts' || screenRef.current.beside === 'artifacts') ? artPanelOf(artShownRef.current) : null].filter((p): p is PanelNode => p?.type === 'scene')
      : panelsOf(wsLayout).filter((p) => p.type === 'scene');
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
  /**
   * WHAT AN EXPERIENCE ASKS OF THE WORKSPACE (components/objects/figures.ts
   * WorkspaceAction): a linked object made beside it, Socria's own steps from a
   * reply it was asked for, a look back, a fresh start from an earlier state,
   * history forgotten. Each is the person's action, refused for anyone who may
   * only read; each lands as an ordinary change to the objects, so it undoes,
   * syncs and is read by the conversation like any other.
   */
  function onWorkspace(a: WorkspaceAction): WorkspaceResult {
    if (togetherRef.current?.active && togetherRef.current.role !== 'owner' && togetherRef.current.role !== 'editor') {
      return { ok: false, why: 'You can look at this line of thinking, but not change it.' };
    }
    let space = spaceOf(mapRef.current);
    if (a.type === 'make') {
      const made = makeDisplay(space, a.kind, a.state, a.origin === 'source' ? 'source' : 'person');
      if (!made.ok) return { ok: false, why: made.says };
      space = made.space;
      // the connection both ways, where each side can hold one
      if (a.from) {
        const there = applyObjectOp(space, made.obj.id, 'link', { obj: a.from.obj, ...(a.from.part ? { part: a.from.part } : {}), rel: 'from' }, { by: 'person' });
        if (there.ok) space = there.space;
        const back = applyObjectOp(space, a.from.obj, 'link', { obj: made.obj.id, ...(a.from.part ? { part: a.from.part } : {}), rel: 'led_to' }, { by: 'person' });
        if (back.ok) space = back.space;
      }
      commitObjects(space, objOf(space, made.obj.id));
      setDisplayToOpen(made.obj.id);
      return { ok: true, id: made.obj.id };
    }
    if (a.type === 'socria') {
      let n = 0;
      let why: string | undefined;
      const at = Date.now();
      for (const step of a.ops.slice(0, 24)) {
        const r = applyObjectOp(space, a.obj, step.op, step.args, { by: 'socria', at });
        if (r.ok) {
          space = r.space;
          n++;
        } else why ??= r.why;
      }
      if (n) commitObjects(space, objOf(space, a.obj));
      return n ? { ok: true, applied: n, ...(why ? { why } : {}) } : { ok: false, why: why ?? 'Nothing came back that could be used.' };
    }
    if (a.type === 'seek') {
      const next = seekObject(space, a.obj, a.at);
      commitObjects(next, objOf(next, a.obj));
      return { ok: true, id: a.obj };
    }
    if (a.type === 'branch') {
      const o = objOf(space, a.obj);
      const state = o?.states[a.at];
      if (!o || state === undefined) return { ok: false, why: 'That moment is no longer kept.' };
      // a new object from an earlier state — the old one is untouched
      const made = makeDisplay(space, o.kind, state, o.origin === 'socria' ? 'socria' : 'person');
      if (!made.ok) {
        const c = !isDisplayKind(o.kind) ? createObject(space, o.kind, state, { origin: o.origin }) : null;
        if (!c) return { ok: false, why: made.says };
        space = c.space;
        commitObjects(space, c.obj);
        return { ok: true, id: c.obj.id };
      }
      space = made.space;
      if (kindOf(o.kind)?.ops.link) {
        const r = applyObjectOp(space, made.obj.id, 'link', { obj: o.id, rel: 'from' }, { by: 'person' });
        if (r.ok) space = r.space;
      }
      if (a.from) {
        const r = applyObjectOp(space, a.from, 'link', { obj: made.obj.id, rel: 'led_to' }, { by: 'person' });
        if (r.ok) space = r.space;
      }
      commitObjects(space, objOf(space, made.obj.id));
      setDisplayToOpen(made.obj.id);
      return { ok: true, id: made.obj.id };
    }
    if (a.type === 'forget') {
      const next = forgetBefore(space, a.obj, a.before);
      commitObjects(next, objOf(next, a.obj));
      return { ok: true };
    }
    if (a.type === 'forgetMap') {
      const h = mapRef.current.history;
      if (!h) return { ok: false, why: 'There is no record of the map to forget.' };
      const history = forgetMapBefore(h, a.before);
      mapRef.current = { ...mapRef.current, history };
      patchActive((s) => ({ ...s, map: { ...(s.map ?? EMPTY_MAP), history } }));
      return { ok: true };
    }
    if (a.type === 'open') {
      if (!objOf(space, a.obj)) return { ok: false, why: 'That is no longer in this workspace.' };
      setDisplayToOpen(a.obj);
      return { ok: true, id: a.obj };
    }
    return { ok: false, why: 'That cannot be done here.' };
  }

  /** The experience route, asked for one thing — a counterpart's line, suggestions. What comes back is applied as Socria's, never by itself. */
  const askExperience: AskExperience = async (body) => {
    try {
      const res = await fetch('/api/logos/experience', { method: 'POST', headers: { 'Content-Type': 'application/json', ...keyHeaders() }, body: JSON.stringify(body) });
      const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) return { ok: false, why: typeof json.error === 'string' ? json.error : 'Socria could not answer just now — try again in a moment.' };
      return { ok: true, data: json };
    } catch {
      return { ok: false, why: 'Socria could not be reached — check your connection and try again.' };
    }
  };

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
      // Logos 5: a scene is something made — Artifacts, on it
      if (l5) return showArtifact(`s:${a.obj}`);
      // A SCENE, OPENED WHERE IT IS WORKED ON: its Live 3D panel — the one
      // already showing it, else a new one beside what is there.
      if (!workspaceOn || !wsLayout) return;
      const ps = panelsOf(wsLayout);
      const there = ps.find((p) => p.type === 'scene' && p.config?.obj === a.obj) ?? ps.find((p) => p.type === 'scene' && !p.config?.obj);
      if (there) {
        const pinned = there.config?.obj ? wsLayout : configurePanel(wsLayout, there.id, { obj: a.obj });
        changeLayout(ps.length > 1 ? maximize(pinned, there.id) : pinned);
      } else changeLayout(addPanel(wsLayout, { type: 'scene', config: { obj: a.obj } }, 1.6, 0.5).layout);
      openStage();
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

  /**
   * Every turn, typed or said (Socria Voice: `via` 'voice'), goes through here.
   * Returns what a command did, when the turn was one of the workspace's own
   * commands and was done here rather than sent to Socria.
   */
  async function send(text: string, atts: Attachment[] = [], replying: ReplyRef | null = null, make?: Msg['make'], via?: 'voice'): Promise<string | undefined> {
    // a spoken turn is not what is in the box: whatever is typed there stays
    const clearBox = () => {
      if (via !== 'voice') setInput('');
    };
    const said0 = text.trim();
    if ((!said0 && !atts.length) || !activeIdRef.current) return;
    // THE WORDS A COMMAND WAS MISSING ("add a branch" … "cost"), typed or said
    // next: the turn is read as the command they complete, and kept as said
    const slot = slotRef.current;
    slotRef.current = null;
    const filled = !atts.length ? fillSlot(slot, said0, Date.now()) : null;
    if (filled && 'dropped' in filled) {
      setError(null);
      clearBox();
      postPair(
        { id: newMsgId(), at: Date.now(), role: 'user', content: said0, ...(via ? { via } : {}) },
        { id: newMsgId(), at: Date.now(), role: 'assistant', content: 'Left as it was.' }
      );
      return 'Left as it was.';
    }
    const content = filled && 'command' in filled ? filled.command : said0;
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
      clearBox();
      setReplyTo(null);
      const turn: Msg = {
        id: newMsgId(),
        at: Date.now(),
        role: 'user',
        content: said0,
        ...(atts.length ? { attachments: atts } : {}),
        ...(replying ? { replyTo: replying } : {}),
        ...(via ? { via } : {}),
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

    const pairOf = (said: string): [Msg, Msg] => [
      { id: newMsgId(), at: Date.now(), role: 'user', content: said0, ...(replying ? { replyTo: replying } : {}), ...(via ? { via } : {}) },
      { id: newMsgId(), at: Date.now(), role: 'assistant', content: said },
    ];

    // THE WORKSPACE, OPERATED IN WORDS (lib/logos5/commands.ts): a view, Split
    // View, an artifact by name, home, Memory, search, the length, Undo, Start
    // writing, Synthesize, Retry, Save as template… — every press, said or
    // typed as a whole turn, done by the function the press calls. And what is
    // on screen is edited first: the writing, when it is open (lib/write/
    // voice-edit.ts — "make that a heading"); the Logic Map, when it is shown
    // ("add a branch called cost", "rename that to housing"). Nothing is sent
    // to a model, and nothing is spent.
    if (l5 && !atts.length) {
      const done = localCommand(content);
      if (done) {
        setError(null);
        clearBox();
        setReplyTo(null);
        if (done.post !== false) postPair(...pairOf(done.said));
        if (done.fill) slotRef.current = { fill: done.fill, at: Date.now() };
        return done.said;
      }
    }

    const objTurn = takeObjects(content, atts);

    // A DESCRIPTION OF THE SCENE IS A COMMAND, like a command to the map: it was built just now, and what was
    // built is written into the conversation. Nothing goes to the model, and nothing is spent.
    if (objTurn.scene) {
      setError(null);
      clearBox();
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
      // a table of the answer is asked of Socria, in the conversation — not the map's comparison lens (lib/runtime/orchestrate.ts)
      const want = tableInReply(content) ? null : readViewRequest(content);
      if (want && l5 && want.lens === 'plot') {
        // Logos 5: a plot is something to look at — Artifacts, on it, beside the conversation
        if (wsFacts.lenses.includes('plot')) {
          const sid = activeIdRef.current;
          if (sid) setArtSel((m) => ({ ...m, [sid]: plotItem() }));
          setScreen((s) => onMade(true, s, narrowRef.current));
          setError(null);
          clearBox();
          setReplyTo(null);
          postPair(...pairOf(viewSaid(want.lens)));
          return;
        }
      } else if (want) {
        changeLayout(showLens(wsLayout, want.lens));
        openStage();
        if (wsFacts.lenses.includes(want.lens)) {
          setError(null);
          clearBox();
          setReplyTo(null);
          postPair(...pairOf(viewSaid(want.lens)));
          return;
        }
      }
    }

    // A SURFACE ASKED FOR BY NAME — "open the display", "show the model beside
    // the map", "close the 3D view", "just the map" (lib/workspace/
    // interface-request.ts, whole names only). The workspace is arranged and
    // what was done is said in a line; nothing goes to the model and nothing
    // is spent. A lens asked for by name was read just above, as it always was.
    if (workspaceOn && wsLayout && !atts.length && !objTurn.lastStep) {
      // a table of the answer is the conversation's, not the map in its comparison lens (lib/runtime/orchestrate.ts tableInReply)
      const asked = tableInReply(content) ? null : readInterfaceRequest(content, interfaceContext(wsFacts));
      if (asked && l5) {
        // Logos 5: the surfaces are views and what docks beside them (lib/logos5/views.ts)
        const to = screenForRequest(asked, screenRef.current, narrowRef.current);
        const sid = activeIdRef.current;
        const key =
          to.artifact === 'plot'
            ? plotItem()
            : to.artifact === 'model'
              ? wsFacts.docs.length
                ? `m:${wsFacts.activeDoc ?? wsFacts.docs[wsFacts.docs.length - 1].id}`
                : wsFacts.viz
                  ? 'v:viz'
                  : null
              : to.artifact === 'scene'
                ? wsFacts.scenes.length
                  ? `s:${wsFacts.scenes[wsFacts.scenes.length - 1].id}`
                  : null
                : to.artifact === 'display'
                  ? (() => {
                      const d = (wsFacts.displays ?? []).filter((x) => x.kind !== 'document');
                      return d.length ? `d:${d[d.length - 1].id}` : null;
                    })()
                  : null;
        if (sid && key) setArtSel((m) => ({ ...m, [sid]: key }));
        // a model's parameters, inspector or history open beside it, inside its artifact; memory is the account's own place
        if (to.tool !== undefined) setModelTool(to.tool);
        if (to.memory && cloud) setL5Mind(true);
        setScreen(() => to.screen);
        if (asked.lens && asked.lens !== 'plot') changeLayout(showLens(wsLayout, asked.lens));
        setError(null);
        clearBox();
        setReplyTo(null);
        postPair(...pairOf(interfaceSaid(asked)));
        return;
      }
      if (asked) {
        changeLayout(layoutForRequest(asked, wsLayout, wsFacts));
        if (asked.op !== 'close') openStage();
        setError(null);
        clearBox();
        setReplyTo(null);
        postPair(...pairOf(interfaceSaid(asked)));
        return;
      }
    }

    // A COMMAND TO THE MAP IS NOT A QUESTION FOR LOGOS. "Remove the node about
    // rent" used to go to the model, which answered in prose while the node
    // stayed. It is read here, against the map's own labels, and done — with
    // what was done written into the conversation so the record is complete
    // and the extractor sees it too. A sentence that is not plainly a command
    // is not touched (lib/map-edit.ts decides, and errs toward sending).
    if (!atts.length && !objTurn.lastStep) {
      // …and "that", "it", "another" mean the idea last touched; an idea can be added in words too
      const cmd = readMapCommandAbout(content, mapRef.current, recentIdea()) ?? (l5 ? readMapAdd(content, mapRef.current, recentIdea()) : null);
      if (cmd) {
        setError(null);
        clearBox();
        setReplyTo(null);
        const said = 'edits' in cmd ? runMapCommand(cmd) : cmd.refused;
        if (!('edits' in cmd) && cmd.fill) slotRef.current = { fill: cmd.fill, at: Date.now() };
        postPair(...pairOf(said));
        return said;
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
    // The day's messages are spent: the same reasoning, for every turn that
    // would go to Socria. A command to the map or the scene never reaches
    // here — those spend nothing — and neither does a word said to the others
    // in a group. The count can be a turn stale; the server holds the line.
    if (!one && messagesSpent && !firstThoughtRef.current) {
      if (!ask('messages-spent')) setError(boundaryNote('messages'));
      return;
    }
    // A GUEST: their one line of thinking, claimed before its first turn (lib/guest-pass.ts). Words
    // in another one already, or the server says so: the sign-up note, and nothing is sent.
    // from here this turn is Socria's to answer: a spoken turn after it waits (onVoiceTurn), even across the guest check
    busyRef.current = true;
    if (guestRef.current && (guestUsedNow() >= GUEST_TURNS || guestHasAnother(activeIdRef.current) || !(await claimGuestPass(activeIdRef.current)))) {
      setGuestWall(true);
      return;
    }

    setError(null);
    clearBox();
    setReplyTo(null);
    pendingStart = null;

    // WHERE THE TURN IS READ (Alex Tran's rules A–D, lib/runtime/orchestrate.ts
    // routeTurn — the same reading the server makes): talk stays in Chat,
    // documents fill Content in the background, something asked to be made
    // opens Artifacts beside the conversation, structure asked for opens the
    // Logic Map. A question asked on a card is answered on the card.
    const route = routeTurn({ text: content, attachments: atts, view: screenRef.current.view, mapNodes: mapRef.current.nodes.length, lastReply: lastReplyIn(messages) });
    const fromCard = cardAskRef.current;
    cardAskRef.current = false;
    if (l5 && !fromCard) setScreen((sc) => afterSend(route, sc, narrowRef.current));
    askedMakeRef.current = route.intent === 'visual';
    // a write-up they asked to keep is written in Content: the reply arriving says so, not the pages
    setPendingPlace(route.intent === 'reading' ? 'content' : 'chat');

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

    // POINT & ASK: what is selected as it is sent — described from canonical
    // state (lib/workspace/focus.ts), told to the reply, and kept on the
    // message so the thread still says what "this" was after the selection
    // has gone.
    // their own writing, when words of the draft are what they selected (lib/write/focus.ts)
    const askBrief = writeSelRef.current
      ? describeWriting(writeDocRef.current, writeSelRef.current)
      : workspaceOn
        ? describeFocus(focusRef.current, mapRef.current, docsRef.current)
        : null;
    const turn: Msg = {
      id: newMsgId(),
      at: Date.now(),
      role: 'user',
      content,
      ...(atts.length ? { attachments: atts } : {}),
      ...(replying ? { replyTo: replying } : {}),
      ...(askBrief ? { about: { kind: askBrief.kind, label: askBrief.label, ...(askBrief.of ? { of: askBrief.of } : {}) } } : {}),
      // a custom artifact asked for from one of their templates: the template goes with it to the map pass
      ...(make ? { make } : {}),
      // said, not typed (Socria Voice): marked, and told to Socria with the turn
      ...(via ? { via } : {}),
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
    // A document attached for the first time opens beside the map, as it was read.
    // Logos 5: it is read into Content in the background, and the turn says so
    // under it (Alex's rule B) — the screen stays on the conversation.
    if (workspaceOn) {
      const fresh = atts.filter((a) => a.kind === 'doc' && a.doc && !before.some((m) => m.attachments?.some((x) => x.kind === 'doc' && x.doc === a.doc)));
      let opened: string | null = null;
      for (const a of fresh) opened = documentDisplay(a.doc!) ?? opened;
      if (opened && !l5) setDisplayToOpen(opened);
    }
    // The first thought, anywhere — once, ever (lib/first-run.ts).
    firstRun.reach('socria.thought');
    // the conversation as it stands now, with this turn — others' words included
    const next = sessionsRef.current.find((x) => x.id === sid)?.messages ?? [...before, sent];
    chronRef.current = [...chronRef.current, sent];
    setBusy(true);
    // at once, not at the next render: a spoken turn after this one waits for the answer (onVoiceTurn)
    busyRef.current = true;
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
    // what has actually happened, for the thread's working state: the files were read here before it was sent
    setTurnInfo({ files: atts.filter((a) => a.kind === 'doc' || a.kind === 'note').length, headers: false, sources: 0 });

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
    // Logos 5: the answer can be stopped. What has arrived stays; if nothing
    // has, the turn goes back into the composer as if it was never sent.
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    /** stopped before a word arrived: the turn is taken back, unsent */
    const takeBack = () => {
      patchSession(sid, (sn) => ({ ...sn, messages: withoutTurn(sn.messages, sent) }), false);
      chronRef.current = withoutTurn(chronRef.current, sent);
      setInput(content);
      setReplyTo(replying);
      if (atts.length) setDrafts((prev) => [...prev, ...atts.map((a, i) => ({ ...a, id: `re_${Date.now()}_${i}`, status: 'ready' as const }))]);
    };
    try {
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        signal: ctrl.signal,
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          sessionId: activeIdRef.current,
          messages: next,
          // The conversation's documents, as read on this device — the newest
          // first, within a size (lib/docs/conversation.ts). The server shows
          // the model their passages, keyed, and only for documents attached here.
          ...(() => {
            const held = new Map<string, SourceDoc>();
            for (const id of docLetters(next).keys()) {
              const d = docsRef.current.get(id) ?? docNow(id);
              if (d) held.set(id, d);
            }
            const sentDocs = docsForRequest(next, held);
            return sentDocs.length ? { docs: sentDocs } : {};
          })(),
          // the passage selected in a document view: what "this" means
          ...(() => {
            const f = docFocusOf(objSelRef.current);
            return f ? { docFocus: f } : {};
          })(),
          ...guidance(),
          // LOGOS 4 — the engine's two inputs from this screen (lib/cognition):
          // a few facts about their own map, so a challenge is grounded in what
          // it marks unexamined; and how long this line of thinking sat
          // untouched before this turn (one recall question on return, only
          // when they were learning).
          ...(() => {
            const dg = digestOf(mapRef.current);
            return dg ? { mapDigest: dg } : {};
          })(),
          ...(s0?.messages.length && s0.updatedAt ? { resumedAfterMs: Math.max(0, Date.now() - s0.updatedAt) } : {}),
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
          ...(askBrief ? { focus: askBrief } : {}),
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
        // Same rule as the pre-flight above: the sheet once, then in place —
        // for whichever boundary the server named.
        const reached: Counter = body?.upgrade === 'messages' ? 'messages' : 'chats';
        if (!ask(reasonForCounter(reached))) setError(body?.error || boundaryNote(reached));
        return;
      }
      if (res.status === 401 && guestRef.current) {
        const body = await res.json().catch(() => ({}));
        if (body?.guestLimit) {
          guestClaimRef.current = null;
          patchSession(sid, (sn) => ({ ...sn, messages: withoutTurn(sn.messages, sent) }), false);
          chronRef.current = withoutTurn(chronRef.current, sent);
          setInput(content);
          setReplyTo(replying);
          setBusy(false);
          setGuestWall(true);
          return;
        }
        throw new Error(failureText(body));
      }
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(failureText(body));
      }

      // the reply is on its way: whether sources were found to check it against is known now
      setTurnInfo((t) => (t ? { ...t, headers: true, sources: sourcesIn(res.headers) } : t));
      // …and which: kept with the reply and listed under it, so its [1], [2] can be opened (L5Message)
      const web = webSourcesIn(res.headers);
      // The turn was accepted. Now the map may be rebuilt from it — unless all
      // it said was "ok" or "thanks", which cannot change it; the next turn
      // that says something sends the whole conversation (lib/map-skip.ts).
      // Logos 5 draws it only when it is worth its cost (mapWanted).
      if (mapWanted(route, skipsMap({ text: content, attachments: atts.length, replying: !!replying, lastReply: lastReplyIn(before), mapNodes: mapRef.current.nodes.length }))) refreshMap();
      // ...and it was one of the day's messages: the count is re-read, so the
      // next send knows where the free day stands before it goes.
      if (!one) void refreshUsage(activeIdRef.current);
      // The server says when this was onboarding's free first thought, so the
      // free plan's count can be read honestly under the answer.
      if (res.headers.get('X-Socria-First-Thought') === '1') {
        setGifted(true);
        void refreshUsage(activeIdRef.current);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      let stopped = false;
      if (reader) {
        try {
          for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            acc += decoder.decode(value, { stream: true });
            setStreaming(visibleStream(acc));
          }
        } catch (e) {
          if ((e as Error)?.name !== 'AbortError') throw e;
          stopped = true;
        }
      }
      if (stopped && !visibleStream(acc).trim()) {
        setStreaming('');
        if (!group) takeBack();
        return;
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
        ...(web ? { sources: web } : {}),
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
      // a reply that landed while the conversation was not on screen: the Chat tab says so
      if (l5 && sid === activeIdRef.current && screenRef.current.view !== 'chat' && screenRef.current.beside !== 'chat') setChatFresh(true);
      // THE TOPIC, NAMED ONCE (lib/logos5/title.ts). After the first reply a
      // small model names what this line of thinking is about — as a concept,
      // never the request — for the Universal Map. Accounts only, never in a
      // shared line of thinking, and never over a title the person chose.
      if (l5 && isSignedIn && !shared && !titledRef.current.has(sid)) {
        const here = sessionsRef.current.find((x) => x.id === sid);
        const firstUser = here?.messages.find((m) => m.role === 'user');
        const auto = (x: LogosSession) => x.title === UNTITLED || x.title === titleFor(x.messages);
        if (here && firstUser?.content?.trim() && here.messages.filter((m) => m.role === 'user').length === 1 && auto(here)) {
          titledRef.current.add(sid);
          const opening = here.messages.slice(0, 2).map((m) => ({ role: m.role, content: m.content }));
          void (async () => {
            try {
              const r = await fetch('/api/extract-memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ titleOnly: true, titleStyle: 'topic', messages: opening }) });
              if (!r.ok) return;
              const t = acceptTitle((await r.json())?.suggestedTitle, firstUser.content);
              const now = sessionsRef.current.find((x) => x.id === sid);
              if (t && now && auto(now)) renameSession(sid, t);
            } catch {
              /* the deterministic title stands */
            }
          })();
        }
      }
      // What Logos learned about the person, folded into the memory it
      // shares with Core — every few turns, for accounts only, and never
      // from a line of thinking the map read as reflecting: that memory is
      // private, and Logos is the surface whose map can be shown to someone.
      const landed = sessionsRef.current.find((x) => x.id === sid)?.messages ?? [...next, reply];
      const userTurns = landed.filter((m) => m.role === 'user').length;
      if (
        isSignedIn &&
        // ONE MEMORY OF A PERSON. With the Mind Graph on (Logos 5 sends `mind`
        // for an account), this turn is remembered there (app/api/logos/chat
        // remember()); writing the older profile as well would keep the same
        // things twice, in two stores that drift apart.
        !(workspaceOn && cloud) &&
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
      if (e?.name === 'AbortError') {
        // stopped before the answer began: nothing to keep
        if (!group) takeBack();
        return;
      }
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
      setTurnInfo(null);
      togetherRef.current?.asking(false);
      if (abortRef.current === ctrl) abortRef.current = null;
    }
  }

  /**
   * THE MAP PASS, WHEN IT IS WORTH ITS COST (lib/runtime/orchestrate.ts
   * needsMap). Before Logos 5 the map is on screen beside every turn and is
   * drawn after every one but an "ok". In Logos 5 it is drawn when structure
   * or something to look at was asked for, while the Logic Map is open, and
   * on a light cadence in the background — so the Universal Map, search and
   * the rewards challenge still see maps.
   */
  function mapWanted(route: TurnRoute, filler: boolean): boolean {
    if (!l5) return !filler;
    const m = mapRef.current;
    const said = sessionsRef.current.find((x) => x.id === activeIdRef.current)?.messages ?? [];
    return needsMap({
      route,
      view: screenRef.current.view,
      filler,
      turnsSinceMap: turnsSince(said, m.drawnAt),
      neverDrawn: !m.drawnAt && !m.nodes.length,
      everyTurn: MAP_EVERY_TURN,
    }).map;
  }

  /** Stop the answer that is arriving (Logos 5). */
  function stopAnswer() {
    abortRef.current?.abort();
  }

  /**
   * Ask the latest question again (Logos 5): the reply and the question it
   * answers are taken out, and the question is sent as it was — its words, its
   * attachments, what it replied to.
   */
  function retryLast(reply: Msg) {
    if (busy || togetherReadOnly || groupNow()) return;
    const list = sessionsRef.current.find((x) => x.id === activeIdRef.current)?.messages ?? [];
    const at = list.findIndex((m) => m.id === reply.id);
    if (at < 0 || at !== list.length - 1) return;
    let q = at - 1;
    while (q >= 0 && list[q].role !== 'user') q--;
    if (q < 0) return;
    const question = list[q];
    patchActive((sn) => ({ ...sn, messages: sn.messages.slice(0, q) }), false);
    chronRef.current = chronRef.current.filter((m) => m !== question && m !== reply);
    void send(question.content, question.attachments ?? [], question.replyTo ?? null);
  }

  /**
   * Edit something you sent and send it again (Logos 5): it and everything
   * after it are replaced by the new turn. The person was told so in place,
   * before pressing Send; the map keeps what it has.
   */
  function editTurn(turn: Msg, text: string) {
    if (busy || togetherReadOnly || groupNow()) return;
    const list = sessionsRef.current.find((x) => x.id === activeIdRef.current)?.messages ?? [];
    const at = list.findIndex((m) => m.id === turn.id);
    if (at < 0) return;
    const gone = new Set(list.slice(at));
    patchActive((sn) => ({ ...sn, messages: sn.messages.slice(0, at) }), false);
    chronRef.current = chronRef.current.filter((m) => !gone.has(m));
    void send(text, turn.attachments ?? [], turn.replyTo ?? null);
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
  // a selection anywhere else in the workspace is the newer "this": the writing's yields to it
  useEffect(() => {
    if (focus) setWriteSel(null);
  }, [focus]);

  // ── LOGOS 5: CONVERSATION FIRST, A WORKSPACE BESIDE IT (docs/LOGOS-5.md) ──
  //
  // The same session, the same workspace machinery, a new screen. The stage
  // (the workspace) is open or put away per line of thinking, in this browser;
  // it opens when something is MADE or asked for, never because a map grew
  // from ordinary talk. The links between the thread and the map are read
  // from what the session already holds (lib/logos5/linking.ts).
  const l5 = true;
  l5Ref.current = l5;
  // THE MAP IS THE SCREEN (docs/LOGOS-5.md §6). A line of thinking shows one
  // of three things — its Components (the files as topics), its Artifacts
  // (what was made: charts, plans, documents, practice) or its Logic Map (the
  // workspace, the Thinking Map in it) — with a switch in the header. The
  // conversation is a panel folded away beside it until it is asked for.
  // Which view, and which artifact, belong to this visit only.
  const study = useMemo(() => (l5 ? studyIn(map.objects) : null), [l5, map.objects]);
  // THE WRITING'S DOCUMENTS: this line of thinking's own — attached in its
  // conversation, or sorted in its Components — for linking cards and citing
  // paragraphs; never another conversation's, though this device has read it
  const writeDocIds = useMemo(() => Array.from(new Set([...letters.keys(), ...(study?.state.files.map((f) => f.doc) ?? [])])).sort().join(','), [letters, study]);
  useEffect(() => {
    const missing = (writeDocIds ? writeDocIds.split(',') : []).filter((id) => !docsRef.current.has(id));
    if (!missing.length) return;
    let off = false;
    void loadDocs(missing).then((found) => {
      if (off || !found.length) return;
      setDocs((m) => {
        const n = new Map(m);
        for (const d of found) n.set(d.id, d);
        return n;
      });
    });
    return () => {
      off = true;
    };
  }, [writeDocIds]);
  const writeDocs = useMemo(() => {
    const m = new Map<string, SourceDoc>();
    for (const id of writeDocIds ? writeDocIds.split(',') : []) {
      const d = docs.get(id);
      if (d) m.set(id, d);
    }
    return m;
  }, [writeDocIds, docs]);
  // THE FOUR VIEWS (Alex Tran, Logos 5 Comments v2; lib/logos5/views.ts).
  // A line of thinking opens on Chat. Content holds what was brought to it,
  // Artifacts what was made in it, the Logic Map the structure of the
  // reasoning — each a tab away — and Split View docks one more panel beside
  // whichever is open. What decides a view is the runtime's reading of the
  // turn (lib/runtime/orchestrate.ts routeTurn). Which view, and what is
  // beside it, belong to this visit only.
  const [screens, setScreens] = useState<Record<string, Screen>>({});
  const rawScreen: Screen = screens[activeId ?? ''] ?? OPENING;
  const studyTab: Viewport = rawScreen.view;
  /** the artifact open in Artifacts, per line of thinking */
  const [artSel, setArtSel] = useState<Record<string, string>>({});
  /** where the reply being written is read: the conversation, or Content (a write-up they asked to keep) */
  const [pendingPlace, setPendingPlace] = useState<'chat' | 'content'>('chat');
  /** the tool open beside a model in its artifact — its parameters, inspector or history (components/logos5/ModelTools.tsx) */
  const [modelTool, setModelTool] = useState<ModelTool | null>(null);
  /** MADE WHEN ASKED (lib/logos5/artifacts.ts): the offers of the map's own drawings taken and declined in this line of thinking */
  const [madeRec, setMadeRec] = useState<MadeRecord>({ taken: [], declined: [] });
  useEffect(() => {
    setMadeRec(activeId ? readMade(browserStorage(), activeId) : { taken: [], declined: [] });
  }, [activeId]);
  /** the document open in Content, per line of thinking */
  const [contentSel, setContentSel] = useState<Record<string, string | null>>({});
  function setScreen(next: (s: Screen) => Screen, id = activeIdRef.current) {
    if (!id) return;
    setScreens((m) => {
      const cur = m[id] ?? OPENING;
      const n = next(cur);
      return n.view === cur.view && n.beside === cur.beside ? m : { ...m, [id]: n };
    });
  }
  function setStudyTab(t: Viewport) {
    setScreen((s) => choose(t, s));
  }
  /**
   * A NEW 3D STUDIO (CAD): an empty Live 3D scene open in Artifacts, with the conversation beside it, so
   * the next description builds in it (openScene) — the first one makes its scene. Nothing exists until then.
   */
  function openStudio() {
    const id = activeIdRef.current;
    if (!id) return;
    // chosen by hand: something asked for earlier and still on its way does not take its place when it arrives
    askedMakeRef.current = false;
    setArtSel((m) => ({ ...m, [id]: STUDIO }));
    setScreen((s) => onMade(true, s, narrowRef.current));
  }
  /** An artifact, at full size: "w:doc", "d:<display>", "p:<practice>", "m:<model>", "v:plot". Artifacts open beside is already on screen. */
  function showArtifact(key: string) {
    const id = activeIdRef.current;
    if (!id) return;
    setArtSel((m) => ({ ...m, [id]: key }));
    setScreen((s) => (s.view === 'artifacts' || s.beside === 'artifacts' ? s : choose('artifacts', s)));
  }
  /**
   * The conversation on screen, or not. On a wide screen it docks beside the
   * view it was opened from, so what they were looking at stays; on a phone
   * it is the view.
   */
  function setConvo(open: boolean) {
    if (!l5) return;
    if (open) setScreen((s) => chatVisible(s, narrowRef.current));
    else setScreen((s) => (s.beside === 'chat' ? { ...s, beside: null } : s));
  }
  /** the workspace — the Logic Map — is what the screen shows */
  const stageOpen = l5 && !!activeId && studyTab === 'logic_map';

  // ── SOCRIA VOICE (EXPERIMENTAL) ─────────────────────────────────────
  //
  // Logos 5, operated by speech (lib/voice/, components/logos5/useSocriaVoice.ts
  // and SocriaVoice.tsx). It is an input, not a second chatbot: a spoken turn
  // is a message like a typed one — through send(), so through the same
  // commands, Cognitive Allocation, MR, memory, the map pass and the artifacts
  // — marked as said, and Socria answers in text in the conversation. What is
  // only Voice's is here: the few things said to Voice itself ("stop",
  // "pause listening", "…scratch that", "yes"/"no"), a turn held while Socria
  // is still answering, a "yes" asked for first where a misheard word could
  // take something away or reach beyond this conversation (lib/voice/risk.ts),
  // several commands said as one ("open the Logic Map, then add a branch
  // called cost"), and dictation into the writing.
  const voiceAllowed = l5 && SOCRIA_VOICE && hasAccess && !togetherReadOnly;
  /** what search opens with, when it was asked for in words ("search for rent") */
  const [searchFor, setSearchFor] = useState('');
  const [voiceSet, setVoiceSet] = useState<VoiceSettings>(DEFAULT_VOICE);
  useEffect(() => setVoiceSet(readVoiceSettings(browserStorage())), []);
  const voiceSetRef = useRef(voiceSet);
  voiceSetRef.current = voiceSet;
  const [voiceSheet, setVoiceSheet] = useState<SheetKind | null>(null);
  const [voiceConfirm, setVoiceConfirm] = useState<(VoiceConfirming & { run: () => void }) | null>(null);
  const voiceConfirmRef = useRef(voiceConfirm);
  voiceConfirmRef.current = voiceConfirm;
  const [voiceQueue, setVoiceQueue] = useState<(VoiceQueued & { heard: string })[]>([]);
  const voiceQueueRef = useRef(voiceQueue);
  voiceQueueRef.current = voiceQueue;
  const [voiceOutcome, setVoiceOutcome] = useState<VoiceOutcome | null>(null);
  const [dictating, setDictating] = useState(false);
  const dictatingRef = useRef(false);
  dictatingRef.current = dictating;
  const onVoiceTurnRef = useRef<(text: string) => void>(() => {});
  const onVoiceUnsentRef = useRef<(text: string) => void>(() => {});
  const ear = useSocriaVoice({ turn: (t) => onVoiceTurnRef.current(t), unsent: (t) => onVoiceUnsentRef.current(t) }, voiceSet.pace, voiceAllowed);
  const voicePhase = useEar(ear, (s) => s.phase);
  const voiceHas = useEar(ear, (s) => s.has);
  const voiceOn = voicePhase !== 'off';
  /** the button is drawn only where Voice can listen: this browser's recogniser, or Socria's */
  const voiceOffered = voiceAllowed && !!ear && (voiceHas.browser || voiceHas.socria);

  /**
   * A command to the map, done — and what the conversation says: the command's
   * own sentence when it was done ("Added “time” to the map, from “cost”."),
   * else why not ("“cost” is already on the map.") — never a refusal said as
   * if it had been done.
   */
  function runMapCommand(cmd: { edits: MapEdit[]; said: string }): string {
    const cur = sessionsRef.current.find((x) => x.id === activeIdRef.current)?.map;
    const trial = cur ? applyMapEdits(cur, cmd.edits) : null;
    if (!trial || !trial.applied.length) return trial?.refused[0] ?? 'Nothing on the map could be changed.';
    return editMap(cmd.edits) ? cmd.said : trial.refused[0] ?? cmd.said;
  }

  /** What "that", "it" and "another" mean on the map: the card selected, else the idea last touched. */
  const touchedRef = useRef<Touched | null>(null);
  /** what "that" means in the writing: the block last edited in words */
  const docThatRef = useRef<string | null>(null);
  /** the paragraph a dictation is writing into */
  const dictIntoRef = useRef<string | null>(null);
  /** a command waiting for its missing words (lib/logos5/commands.ts fillSlot) */
  const slotRef = useRef<Slot | null>(null);
  /** the map's changes made by hand or by a command, for Undo and Redo — this visit */
  const mapJournalRef = useRef<{ past: MapChange[]; future: MapChange[] }>({ past: [], future: [] });
  /** what a command changed last — for "undo" said with only the conversation on screen */
  const lastChangeRef = useRef<{ kind: 'map' } | { kind: 'object'; id: string } | { kind: 'writing' } | null>(null);
  /** what Artifacts holds, as its strip names it (set where the strip is built) */
  const artifactListRef = useRef<{ key: string; kind: string; title: string }[]>([]);
  // another line of thinking: what "that" meant, a command waiting for words, dictation — all of this one's
  useEffect(() => {
    touchedRef.current = null;
    docThatRef.current = null;
    slotRef.current = null;
    lastChangeRef.current = null;
    setDictating(false);
  }, [activeId]);

  function recentIdea(): Touched | null {
    const f = focusRef.current;
    if (f?.kind === 'node') {
      const n = mapRef.current.nodes.find((x) => x.id === f.id);
      if (n) return { id: n.id, label: n.label };
    }
    const t = touchedRef.current;
    return t && mapRef.current.nodes.some((n) => n.id === t.id) ? t : null;
  }
  const showing = (v: Viewport) => screenRef.current.view === v || screenRef.current.beside === v;
  /** the writing is on screen and open to edit in words */
  const writingOnScreen = () => artShownRef.current === 'w:doc' && showing('artifacts') && !!writeRef.current;
  /** what is over the line of thinking, where "go back" means back into it */
  const overNow = (): 'home' | 'memory' | null => (l5Mind ? 'memory' : l5Home || !activeIdRef.current ? 'home' : null);
  function commandContext(): CommandContext {
    return {
      artifacts: artifactListRef.current,
      conversations: sessionsRef.current
        .filter((x) => !foreignIdsRef.current.has(x.id) && x.title && x.title !== UNTITLED)
        .map((x) => ({ id: x.id, title: x.title })),
      over: overNow(),
    };
  }

  /**
   * THE TURN, IF IT IS ONE OF THE WORKSPACE'S OWN COMMANDS — read here for
   * typed and spoken turns alike (send), and done: the press it stands for.
   * Null when it is for Socria. `post: false` for a command that leaves the
   * conversation (home, another line of thinking): nothing is written in it.
   */
  function localCommand(text: string): { said: string; post?: boolean; fill?: string } | null {
    const wc = readWorkspaceCommand(text, commandContext());
    if (wc) return doWorkspaceCommand(wc);
    // "capture: call the landlord" — kept in Quick Capture for later, not sent anywhere
    const kept = LOGOS4.capture ? readCapture(text) : null;
    if (kept) return { said: keepCapture(kept) };
    // "select the rent idea": the card in hand, as a press would put it (Point & Ask)
    const sel = readMapSelect(text, mapRef.current);
    if (sel) {
      if ('refused' in sel) return { said: sel.refused };
      setFocus({ kind: 'node', id: sel.node.id });
      touchedRef.current = { id: sel.node.id, label: sel.node.label };
      return { said: `Selected “${sel.node.label}” — what you ask next is about it.` };
    }
    // their writing, when it is open: an edit said instead of typed
    if (writingOnScreen()) {
      const dc = readDocCommand(text);
      if (dc) return docCommand(dc);
    }
    // the Logic Map, when it is on screen, before anything an artifact might read in the words — but
    // a lens or a surface asked for by name ("show it as a timeline", "close the 3D view") keeps its own reader (send)
    const named = workspaceOn && wsLayout ? !!readViewRequest(text) || !!readInterfaceRequest(text, interfaceContext(wsFacts)) : false;
    if (showing('logic_map') && !showing('artifacts') && !named) {
      const mc = readMapCommandAbout(text, mapRef.current, recentIdea()) ?? readMapAdd(text, mapRef.current, recentIdea());
      if (mc) return 'edits' in mc ? { said: runMapCommand(mc) } : { said: mc.refused, ...(mc.fill ? { fill: mc.fill } : {}) };
    }
    return null;
  }

  function docCommand(dc: NonNullable<ReturnType<typeof readDocCommand>>): { said: string; fill?: string } {
    const h = writeRef.current;
    if (!h) return { said: 'Open your writing first — say “open my writing”.' };
    const box: { refused?: { refused: string; fill?: string } } = {};
    const out = h.apply((doc, caret) => {
      const r = applyDocCommand(doc, dc, { that: docThatRef.current ?? caret });
      if ('refused' in r) {
        box.refused = r;
        return null;
      }
      return r;
    });
    if (out) {
      docThatRef.current = out.block;
      lastChangeRef.current = { kind: 'writing' };
      return { said: out.said };
    }
    return { said: box.refused?.refused ?? 'That could not be done in your writing.', ...(box.refused?.fill ? { fill: box.refused.fill } : {}) };
  }

  /** A workspace command, done — by the function its press calls. What was done, in a sentence. */
  function doWorkspaceCommand(cmd: WorkspaceCommand): { said: string; post?: boolean } {
    const sid = activeIdRef.current;
    const narrowNow = narrowRef.current;
    const cap = (x: string) => x.charAt(0).toUpperCase() + x.slice(1);
    switch (cmd.kind) {
      case 'view':
        setL5Home(false);
        setL5Mind(false);
        if (screenRef.current.view === cmd.view && !l5Home && !l5Mind) return { said: `${cap(VIEW_SAID[cmd.view])} is open.` };
        setStudyTab(cmd.view);
        return { said: cmd.view === 'chat' ? 'Back to the conversation.' : `Opened ${VIEW_SAID[cmd.view]}.` };
      case 'beside':
      case 'pair': {
        const view = cmd.kind === 'pair' ? cmd.view : screenRef.current.view === cmd.view ? 'chat' : screenRef.current.view;
        const beside = cmd.kind === 'pair' ? cmd.beside : cmd.view;
        if (narrowNow) {
          setStudyTab(beside);
          return { said: `A phone shows one view at a time — opened ${VIEW_SAID[beside]}.` };
        }
        if (view === beside) return { said: `${cap(VIEW_SAID[beside])} is already open.` };
        // Split View offers only what this line of thinking has (lib/logos5/views.ts splitMenu)
        const empty = besideEmpty(beside, { content: contentItems.length, ideas: mapRef.current.nodes.length, artifacts: artifactListRef.current.length });
        if (empty) return { said: empty };
        setScreen(() => fit({ view, beside }, false));
        return { said: `${cap(VIEW_SAID[beside])} is beside ${VIEW_SAID[view]} now.` };
      }
      case 'close-beside':
        if (!screenRef.current.beside) return { said: 'Nothing is open beside — this is one view already.' };
        setScreen((s) => ({ ...s, beside: null }));
        return { said: 'Closed the split view.' };
      case 'artifact':
        showArtifact(cmd.key);
        return { said: `Opened “${cmd.title}” in Artifacts.` };
      case 'home':
        goHome();
        return { said: 'Went to the Universal Map.', post: false };
      case 'new':
        return newFromHome() ? { said: 'Started a new line of thinking.', post: false } : { said: 'A new line of thinking could not be started just now.', post: false };
      case 'thinking':
        if (cmd.id === activeIdRef.current && !l5Home && !l5Mind) return { said: `“${cmd.title}” is the one open.` };
        openFromHome(cmd.id);
        return { said: `Opened “${cmd.title}”.`, post: false };
      case 'memory':
        if (!cloud) return { said: 'Memory is kept for an account — sign in to have one.' };
        setL5Mind(true);
        return { said: 'Opened Memory — what Socria remembers about you.', post: false };
      case 'back':
        if (l5Mind) {
          setL5Mind(false);
          return { said: 'Back from Memory.', post: false };
        }
        if (activeIdRef.current) {
          setL5Home(false);
          return { said: 'Back to the line of thinking.', post: false };
        }
        return { said: 'There is no line of thinking open to go back to — say “start a new line of thinking”.', post: false };
      case 'length':
        pickLength(cmd.length);
        return { said: cmd.length === 'concise' ? 'Shorter answers from now on.' : cmd.length === 'detailed' ? 'Fuller, more detailed answers from now on.' : 'Answers at their usual length from now on.' };
      case 'undo':
        return { said: undoNow(false) };
      case 'redo':
        return { said: undoNow(true) };
      case 'writing':
        openWriting();
        return { said: 'Opened your writing.' };
      case 'synthesize': {
        if (!sid || !mapRef.current.nodes.length) return { said: 'There is nothing on the Logic Map to synthesize yet.' };
        if (synthBusy) return { said: 'A synthesis is already on its way.' };
        void synthesize('workspace');
        return { said: 'Reading the Logic Map for a synthesis — it will be here in a moment.', post: false };
      }
      case 'retry': {
        const list = sessionsRef.current.find((x) => x.id === sid)?.messages ?? [];
        const last = list[list.length - 1];
        if (!last || last.role !== 'assistant' || busyRef.current || groupNow()) return { said: 'There is no answer to try again just now.' };
        retryLast(last);
        return { said: 'Asking that again.', post: false };
      }
      case 'template': {
        const key = artShownRef.current;
        const o = key?.startsWith('d:') && showing('artifacts') ? objOf(spaceOf(mapRef.current), key.slice(2)) : null;
        if (!o || o.kind !== 'custom') return { said: 'Only a custom artifact can be kept as a template — open one in Artifacts first.' };
        const st = currentOf(o) as CustomState;
        const r = saveTemplate(browserStorage(), st, Date.now());
        return { said: r ? `Saved “${r.saved.name}” as a template — it is in Make, under Yours, on this device.` : 'This one could not be kept as a template.' };
      }
      case 'search':
        setSearchFor(cmd.query);
        setSearchOpen(Date.now());
        return { said: cmd.query ? `Searching everything for “${cmd.query}”.` : 'Opened search.', post: false };
      case 'remap': {
        if (!sid || !messages.some((m) => m.role === 'user')) return { said: 'There is nothing in this conversation to map yet.' };
        if (togetherReadOnly) return { said: 'You can look at this line of thinking, but not change it.' };
        refreshMap();
        return { said: 'Drawing the Logic Map from this conversation.' };
      }
      case 'map-image': {
        const m = mapRef.current;
        if (!m.nodes.length) return { said: 'The Logic Map is empty — there is nothing to save yet.' };
        void exportMapPng(m, active?.title && active.title !== UNTITLED ? active.title : 'A line of thinking');
        return { said: 'Saved the Logic Map as an image.' };
      }
      case 'bars':
        hideChrome(cmd.hide);
        return { said: cmd.hide ? 'Hid the bars — say “show the bars” to bring them back.' : 'The bars are back.', post: false };
      case 'captures':
        if (!LOGOS4.capture) return { said: 'Quick Capture is not on here.' };
        setCaptureOpen(true);
        return { said: 'Opened Quick Capture.', post: false };
      case 'deselect':
        if (!focusRef.current && !writeSelRef.current) return { said: 'Nothing is selected.' };
        clearAbout();
        return { said: 'Cleared the selection.' };
    }
  }

  /** A thought kept for later in Quick Capture — on this device, and moved into the account when the inbox next opens there. */
  function keepCapture(text: string): string {
    const t = cleanCaptureText(text);
    if (!t) return 'There was nothing to keep.';
    const at = Date.now();
    const c: Capture = { id: newCaptureId(), text: t, createdAt: at, updatedAt: at };
    const ok = writeLocalCaptures(browserStorage(), [c, ...readLocalCaptures(browserStorage())]);
    return ok ? `Kept in Quick Capture for later: “${t.length > 80 ? `${t.slice(0, 79)}…` : t}”.` : 'This browser could not keep it — its storage is full or blocked.';
  }

  /**
   * UNDO AND REDO, OF WHAT IS ON SCREEN. The writing has its own history,
   * which takes back typing and spoken edits alike; an artifact on screen steps
   * back through its own; the Logic Map takes back the last change made to it
   * by hand or by a command (replayed onto the map as it is now — the map pass
   * draws after every answer, lib/map-edit.ts replayMapChange). With only the
   * conversation on screen, the last thing a command changed.
   */
  function undoNow(redo: boolean): string {
    const sid = activeIdRef.current;
    if (!sid) return 'There is nothing open to undo.';
    const art = artShownRef.current;
    const last = lastChangeRef.current;
    const writing = () => {
      const h = writeRef.current;
      if (!h) return 'Open your writing to undo there — say “open my writing”.';
      const ok = redo ? h.redo() : h.undo();
      return ok ? (redo ? 'Put the last change to your writing back.' : 'Took back the last change to your writing.') : redo ? 'There is nothing to redo in your writing.' : 'There is nothing to undo in your writing.';
    };
    // what is on screen, first
    if (writingOnScreen()) return writing();
    if (showing('artifacts') && art && /^[ds]:/.test(art)) return stepObject(art.slice(2), redo);
    if (showing('logic_map')) return undoMap(sid, redo);
    // else what a command changed last
    if (last?.kind === 'writing') return writing();
    if (last?.kind === 'object') return stepObject(last.id, redo);
    return undoMap(sid, redo);
  }

  /** An artifact one change back (or forward): every change of one description goes together. */
  function stepObject(id: string, redo: boolean): string {
    const space = spaceOf(mapRef.current);
    const o = objOf(space, id);
    const name = artifactListRef.current.find((a) => a.key.slice(2) === id)?.title ?? o?.name ?? 'it';
    if (!o) return 'That artifact is not here any more.';
    let at = o.at;
    if (!redo) {
      if (at <= 0) return `There is nothing to undo in “${name}”.`;
      const moment = o.steps[at - 1]?.at;
      while (at > 0 && o.steps[at - 1]?.at === moment) at--;
    } else {
      if (at >= o.states.length - 1) return `There is nothing to redo in “${name}”.`;
      const moment = o.steps[at]?.at;
      while (at < o.states.length - 1 && o.steps[at]?.at === moment) at++;
    }
    const next = seekObject(space, id, at);
    commitObjects(next, objOf(next, id));
    lastChangeRef.current = { kind: 'object', id };
    return redo ? `Put the last change to “${name}” back.` : `Took back the last change to “${name}”.`;
  }

  function undoMap(sid: string, redo: boolean): string {
    const j = mapJournalRef.current;
    const from = redo ? j.future : j.past;
    const i = from.map((e) => e.sid).lastIndexOf(sid);
    if (i < 0) return redo ? 'There is nothing to redo on the Logic Map.' : 'There is nothing to undo here.';
    const e = from[i];
    const cur = sessionsRef.current.find((x) => x.id === sid)?.map;
    if (!cur) return 'There is nothing to undo here.';
    const r = redo ? replayMapChange(cur, e.before, e.after) : replayMapChange(cur, e.after, e.before);
    const rest = [...from.slice(0, i), ...from.slice(i + 1)];
    mapJournalRef.current = redo ? { past: [...j.past, e], future: rest } : { past: rest, future: [...j.future, e] };
    if (!r.changed) return 'The Logic Map has changed since — that edit is no longer there to take back.';
    const history = recordChange(cur.history, cur.nodes, r.map.nodes, Date.now(), 'edit');
    const liveIds = new Set(r.map.nodes.map((n) => n.id));
    patchSession(sid, (x) => ({ ...x, map: history ? { ...r.map, history } : r.map, contexts: Object.fromEntries(Object.entries(x.contexts ?? {}).filter(([id]) => liveIds.has(id))) }));
    lastChangeRef.current = { kind: 'map' };
    const what = e.said.charAt(0).toLowerCase() + e.said.slice(1);
    return redo ? `Redone — ${what}` : `Undone — ${what}`;
  }

  /** Socria Voice's own few words (lib/voice/speech.ts readControl). */
  function voiceControl(c: Control, heard: string, said: (did: string) => void) {
    switch (c) {
      case 'yes': {
        const k = voiceConfirmRef.current;
        setVoiceConfirm(null);
        voiceConfirmRef.current = null;
        if (k) k.run();
        else said('There was nothing waiting for a yes.');
        return;
      }
      case 'no':
        setVoiceConfirm(null);
        voiceConfirmRef.current = null;
        said('Not done.');
        return;
      case 'stop':
        if (busyRef.current) {
          stopAnswer();
          said('Stopped the answer.');
        } else said('Nothing is being answered. Say “stop listening” to turn Voice off.');
        return;
      case 'pause':
        ear?.pause('Paused by voice. Press Resume when you want to talk again.');
        return;
      case 'end':
        voiceOff('Voice is off.');
        return;
      case 'help':
        setVoiceSheet('help');
        said('Here is what you can say.');
        return;
      case 'dictate':
        startDictation(said);
        return;
      case 'undictate':
        setDictating(false);
        said(dictatingRef.current ? 'Stopped dictating.' : 'You were not dictating.');
        return;
      case 'send':
        if (input.trim() || drafts.some((d) => d.status === 'ready') || makeChoice(makeId, ownChoices)) {
          sendFromStudy();
          said('Sent what was in the box.');
        } else said('The box is empty — nothing to send.');
        return;
      case 'discard':
        said(heard ? 'Thrown away — not sent.' : 'Thrown away.');
        return;
    }
  }

  function startDictation(said: (did: string) => void) {
    if (!activeIdRef.current || overNow()) {
      said('Open a line of thinking first — dictation writes into its writing.');
      return;
    }
    if (!limits.draftSpace) {
      said('Writing is part of Socria One.');
      return;
    }
    if (!writingOnScreen()) openWriting();
    // a dictation starts a paragraph of its own (lib/write/voice-edit.ts dictate)
    dictIntoRef.current = null;
    setDictating(true);
    said('Dictating into your writing. Say “new paragraph” for a new one, and “stop dictating” to finish.');
  }

  /** What is said while dictating is written — unless it is an edit of the writing ("make that a heading"). */
  function dictateTurn(text: string, said: (did: string) => void, tries = 0) {
    const h = writeRef.current;
    if (!h) {
      // the writing is opening: a moment for it to be there
      if (tries < 8) {
        if (!writingOnScreen() && tries === 0) openWriting();
        setTimeout(() => dictateTurn(text, said, tries + 1), 150);
      } else said('Your writing did not open — say “open my writing”, then dictate again.');
      return;
    }
    // the words an edit asked for ("change that heading" — to what?) complete it, rather than being written
    const filled = fillSlot(slotRef.current, text, Date.now());
    slotRef.current = null;
    const dc = filled && 'command' in filled ? readDocCommand(filled.command) : filled ? null : readDocCommand(text);
    if (filled && 'dropped' in filled) {
      said('Left as it was.');
      return;
    }
    if (dc && (dc.op !== 'append' || filled)) {
      const r = docCommand(dc);
      if (r.fill) slotRef.current = { fill: r.fill, at: Date.now() };
      said(r.said);
      return;
    }
    const out = h.apply((doc, caret) => {
      const r = dictate(doc, text, { into: dictIntoRef.current, after: caret });
      return 'doc' in r ? r : null;
    });
    if (out) {
      dictIntoRef.current = out.block;
      docThatRef.current = out.block;
      lastChangeRef.current = { kind: 'writing' };
      said(out.said);
    } else said('Nothing was heard to write.');
  }

  /** A spoken turn that may not go without a "yes": what it would take away or reach, read by the readers that would do it. */
  function voiceRisk(text: string): Risk | null {
    const map = mapRef.current;
    const mc = readMapCommandAbout(text, map, recentIdea());
    const mapRemoves = mc && 'edits' in mc ? mc.edits.flatMap((e) => (e.op === 'remove' ? [map.nodes.find((n) => n.id === e.id)?.label ?? ''] : [])).filter(Boolean) : null;
    const dc = writingOnScreen() ? readDocCommand(text) : null;
    const docDelete = dc ? docDeleteOf(writeDocRef.current, dc, { that: docThatRef.current }) : null;
    const op = readOperation(spaceOf(map), text, objSelRef.current?.obj);
    const o = op ? objOf(spaceOf(map), op.id) : null;
    const objectRemove = op && o && /remove|delete|clear|drop|erase|reset|untick/i.test(op.op) ? kindOf(o.kind)?.ops[op.op]?.say(op.args) ?? null : null;
    return riskOf(text, { mapRemoves, docDelete, objectRemove });
  }

  /** Is this part of a turn one of the workspace's own commands? — what lets "…, then …" be split into steps. */
  function isCommandTurn(part: string): boolean {
    const map = mapRef.current;
    return !!readWorkspaceCommand(part, commandContext()) || !!readMapAdd(part, map) || !!readMapCommandAbout(part, map, recentIdea()) || (writingOnScreen() && !!readDocCommand(part));
  }

  /**
   * A SPOKEN TURN, sent as a typed one would be (sendFromStudy): with what is
   * in the box attached (files, a reply, an artifact chosen in Make), through
   * send(), marked as said. The words typed in the box stay there.
   */
  function sendSpoken(text: string, heard: string) {
    const outcome = (did: string) => setVoiceOutcome({ heard, did, at: Date.now() });
    if (overNow() === 'home') {
      // over the Universal Map: a first thought begins a line of thinking, as the box at the map's foot does
      startFromHome(text, undefined, 'voice');
      outcome('Started a new line of thinking with it.');
      return;
    }
    if (overNow() === 'memory') {
      outcome('Memory is open — say “go back” to return to your line of thinking, or “go home”.');
      return;
    }
    const ready: Attachment[] = drafts.filter((d) => d.status === 'ready').map(({ id, status, error: _e, ...rest }) => rest);
    const choice = makeChoice(makeId, ownChoices);
    // with others here, Socria answers when it is named (@socria): said, "Socria, …" names it
    let words = groupNow() ? text.replace(/^(?:(?:hey|ok|okay)\s+)?socria\b[\s,:]*/i, '@socria ') : text;
    let make: Msg['make'] | undefined;
    if (choice) {
      const asked = askFor(choice, words, messages.length > 0);
      if (asked) {
        words = asked;
        setMakeId(null);
        const own = templateOf(makeId, templates);
        if (own) make = { template: templatePayload(own) };
      }
    }
    if (ready.length) setDrafts([]);
    const p = send(words, ready, replyTo, make, 'voice');
    if (busyRef.current) outcome('Sent to Socria.');
    void p.then((r) => r && outcome(r));
  }

  /** A turn for Socria or a command, now — after its "yes", where it needs one. */
  function runVoice(text: string, heard: string, confirmed = false) {
    if (!confirmed) {
      const risk = voiceRisk(text);
      if (risk) {
        const k = { what: risk.what, level: risk.level, text, run: () => runVoice(text, heard, true) };
        setVoiceConfirm(k);
        voiceConfirmRef.current = k;
        setVoiceOutcome(null);
        return;
      }
    }
    sendSpoken(text, heard);
  }

  /** A spoken turn while Socria is answering: moving around happens now; the rest waits for the answer — or stops it. */
  function dispatchVoice(text: string, heard: string) {
    if (busyRef.current || voiceQueueRef.current.length || voiceConfirmRef.current) {
      const wc = l5 && !voiceQueueRef.current.length ? readWorkspaceCommand(text, commandContext()) : null;
      if (wc && (wc.kind === 'view' || wc.kind === 'beside' || wc.kind === 'pair' || wc.kind === 'close-beside' || wc.kind === 'artifact')) {
        setVoiceOutcome({ heard, did: doWorkspaceCommand(wc).said, at: Date.now() });
        return;
      }
      if (busyRef.current && voiceSetRef.current.whileAnswering === 'interrupt') stopAnswer();
      const q = [...voiceQueueRef.current, { id: `vq${Date.now().toString(36)}${voiceQueueRef.current.length}`, text, heard }];
      voiceQueueRef.current = q;
      setVoiceQueue(q);
      return;
    }
    runVoice(text, heard);
  }

  /** The turns held while Socria answered, one at a time, once it has finished. */
  function pumpVoice() {
    while (voiceQueueRef.current.length && !busyRef.current && !voiceConfirmRef.current) {
      const [next, ...rest] = voiceQueueRef.current;
      voiceQueueRef.current = rest;
      setVoiceQueue(rest);
      runVoice(next.text, next.heard);
    }
  }
  const pumpRef = useRef(pumpVoice);
  pumpRef.current = pumpVoice;
  useEffect(() => {
    if (!busy && !voiceConfirm) pumpRef.current();
  }, [busy, voiceConfirm]);

  /** EVERY SPOKEN TURN ARRIVES HERE (components/logos5/useSocriaVoice.ts). */
  function onVoiceTurn(raw: string) {
    const text = cleanUtterance(raw);
    if (!text) return;
    const said = (did: string) => setVoiceOutcome({ heard: text, did, at: Date.now() });
    const c = readControl(text, { confirming: !!voiceConfirmRef.current, dictating: dictatingRef.current });
    if (c) return voiceControl(c.control, c.rest, said);
    // a "yes" was waited for and something else was said: what waited is not done, and this goes on
    if (voiceConfirmRef.current) {
      setVoiceConfirm(null);
      voiceConfirmRef.current = null;
    }
    if (dictatingRef.current) return dictateTurn(text, said);
    if (!voiceSetRef.current.autoSend) {
      putInBox(text);
      said('In the box — say “send”, or press Send.');
      return;
    }
    // over the Universal Map or Memory, the workspace's own commands (back, open, new, search…) first
    const over = overNow();
    if (over) {
      const wc = readWorkspaceCommand(text, commandContext());
      if (wc) {
        said(doWorkspaceCommand(wc).said);
        return;
      }
    }
    // "open the Logic Map, then add a branch called cost": the steps, one after another
    for (const step of splitSteps(text, isCommandTurn)) dispatchVoice(step, text);
  }
  onVoiceTurnRef.current = onVoiceTurn;

  /** Words heard when listening was paused or turned off mid-turn: into the box, never sent. */
  function putInBox(text: string) {
    const t = cleanUtterance(text);
    if (!t) return;
    setInput((v) => (v.trim() ? `${v.replace(/\s+$/, '')} ${t}` : t));
    setComposerFocus((f) => ({ n: (f?.n ?? 0) + 1 }));
  }
  onVoiceUnsentRef.current = (t) => {
    putInBox(t);
    setVoiceOutcome({ heard: cleanUtterance(t), did: 'Not sent — it is in the box.', at: Date.now() });
  };

  /** The Voice button: on (after the notice, the first time), or off. A press: phones start the microphone only from one. */
  function pressVoice() {
    if (!ear) return;
    if (voiceOn) {
      voiceOff(null);
      return;
    }
    if (!voiceSetRef.current.consented) {
      setVoiceSheet('consent');
      return;
    }
    const engine = pickEngine(ear.get().has, voiceSetRef.current.engine);
    if (!engine) {
      setVoiceSheet('consent');
      return;
    }
    setVoiceOutcome(null);
    ear.start(engine);
  }
  function voiceOff(note: string | null) {
    ear?.stop(note);
    setDictating(false);
    setVoiceConfirm(null);
    voiceConfirmRef.current = null;
    voiceQueueRef.current = [];
    setVoiceQueue([]);
    setVoiceOutcome(null);
  }
  function changeVoiceSettings(next: VoiceSettings) {
    const was = voiceSetRef.current;
    setVoiceSet(writeVoiceSettings(browserStorage(), next));
    voiceSetRef.current = next;
    // another recogniser chosen while listening: listening goes on with it
    if (ear && voiceOn && next.engine && next.engine !== was.engine) ear.start(next.engine);
  }
  function startVoiceFromSheet(engine: VoiceEngine) {
    changeVoiceSettings({ ...voiceSetRef.current, engine, consented: true });
    setVoiceSheet(null);
    setVoiceOutcome(null);
    ear?.start(engine);
  }
  function switchVoiceEngine(engine: VoiceEngine) {
    changeVoiceSettings({ ...voiceSetRef.current, engine });
    ear?.start(engine);
  }
  const voiceButton = voiceOffered ? <VoiceButton ear={ear} onPress={pressVoice} /> : null;
  const voicePanel = (floating: boolean) =>
    ear && voiceOn ? (
      <VoicePanel
        ear={ear}
        floating={floating}
        busy={busy}
        queued={voiceQueue}
        confirming={voiceConfirm}
        outcome={voiceOutcome}
        dictating={dictating}
        boxMode={!voiceSet.autoSend}
        where={overNow() === 'home' ? 'into a new line of thinking' : 'to Socria'}
        onSettings={() => setVoiceSheet('settings')}
        onHelp={() => setVoiceSheet('help')}
        onConfirm={(yes) => {
          const k = voiceConfirmRef.current;
          setVoiceConfirm(null);
          voiceConfirmRef.current = null;
          if (yes) k?.run();
          else setVoiceOutcome({ heard: k?.text ?? '', did: 'Not done.', at: Date.now() });
        }}
        onDrop={(id) => {
          const q = voiceQueueRef.current.filter((x) => x.id !== id);
          voiceQueueRef.current = q;
          setVoiceQueue(q);
        }}
        onStopAnswer={stopAnswer}
        onOff={() => voiceOff(null)}
        onSwitch={switchVoiceEngine}
      />
    ) : null;
  /** the turn just sent asked for something to be made: what the engine makes is shown (rule C) */
  const askedMakeRef = useRef(false);
  /** a question asked from a card's popover is read there: the screen does not move for it */
  const cardAskRef = useRef(false);
  /** the lines of thinking whose topic has been asked for a name, this visit (lib/logos5/title.ts) */
  const titledRef = useRef(new Set<string>());
  /** the artifact Artifacts is showing, as of the last render — for the Live 3D panel a description builds in */
  const artShownRef = useRef<string | null>(null);
  /** search everything (Cmd/Ctrl+K): when it was opened, or null */
  const [searchOpen, setSearchOpen] = useState<number | null>(null);
  useEffect(() => {
    if (!l5) return;
    const onKey = (e: KeyboardEvent) => {
      // a key the page already used — Ctrl/⌘+K is a link in the writing — is not also a search
      if (e.defaultPrevented) return;
      if ((e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen((v) => (v ? null : Date.now()));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [l5]);
  /** Split View: the panel beside's share of the width, per browser */
  const [besideShare, setBesideShare] = useState(0.4);
  useEffect(() => {
    if (l5) setBesideShare(readBesideShare(browserStorage()));
  }, [l5]);
  /** the turn on its way: what has actually happened so far, for the thread's skeleton */
  const [turnInfo, setTurnInfo] = useState<{ files: number; headers: boolean; sources: number } | null>(null);
  /** files dropped on an empty Components, being read */
  const [readingFiles, setReadingFiles] = useState<string | null>(null);
  /** Memory: what Socria remembers, as its own place (components/logos5/MemoryView.tsx) */
  const [l5Mind, setL5Mind] = useState(false);
  /** something new landed on the stage while it was put away */
  const [stageFresh, setStageFresh] = useState(false);
  /** something was made in the background while Artifacts was not open: the tab says so, the screen does not move */
  const [artFresh, setArtFresh] = useState(false);
  useEffect(() => {
    if (studyTab === 'artifacts') setArtFresh(false);
  }, [studyTab]);
  /** a reply landed while the conversation was not on screen */
  const [chatFresh, setChatFresh] = useState(false);
  useEffect(() => {
    if (studyTab === 'chat' || rawScreen.beside === 'chat') setChatFresh(false);
  }, [studyTab, rawScreen.beside]);
  /** the card selected on the map whose turns are marked in the thread, and which of them is in view */
  const [linkNode, setLinkNode] = useState<string | null>(null);
  const [linkAt, setLinkAt] = useState(0);
  /** cards the thread is pointing at: hovered (for a moment) or pressed (until let go) */
  const [hoverNodes, setHoverNodes] = useState<string[] | null>(null);
  const [litNodes, setLitNodes] = useState<string[] | null>(null);
  const [revealNode, setRevealNode] = useState<{ id: string; n: number } | null>(null);
  /** a display opened by a turn → the person's message it answered (this visit only; nothing stored) */
  const [objMsg, setObjMsg] = useState<Record<string, string>>({});
  /** the answer arriving can be stopped */
  const abortRef = useRef<AbortController | null>(null);
  /** the thread is scrolled away from its end: offer the way back */
  const [awayFromEnd, setAwayFromEnd] = useState(false);
  /** narrower than a desktop: the stage is a sheet over the conversation, not a column beside it */
  const [narrow, setNarrow] = useState(false);
  const narrowRef = useRef(false);
  narrowRef.current = narrow;
  /** what the screen shows: on a phone, one thing at a time */
  const screen: Screen = fit(rawScreen, narrow);
  const screenRef = useRef(screen);
  screenRef.current = screen;
  const convoOpen = l5 && !!activeId && (screen.view === 'chat' || screen.beside === 'chat');
  useEffect(() => {
    if (!l5 || typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(max-width: 1023px)');
    const on = () => setNarrow(mq.matches);
    on();
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, [l5]);
  const links = useMemo(
    () => (l5 ? linksOf(messages, map.nodes, map.history) : null),
    [l5, messages, map.nodes, map.history]
  );
  useEffect(() => {
    setLinkNode(null);
    setLitNodes(null);
    setHoverNodes(null);
    setStageFresh(false);
    setArtFresh(false);
    setChatFresh(false);
  }, [activeId]);
  /** The Logic Map on screen (or not — there is nothing else to put away now: the views are the screen). */
  function setStage(open: boolean) {
    if (!l5 || !open) return;
    setStudyTab('logic_map');
    setStageFresh(false);
  }
  /** Something was made or asked for in the workspace: the screen goes to the Logic Map. */
  function openStage() {
    setStage(true);
  }
  // THE LOGIC MAP IS LIVE WHILE IT IS LOOKED AT. The map is no longer drawn
  // after every turn (lib/runtime/orchestrate.ts needsMap): opened on a map
  // older than the conversation, it is drawn again, once, now.
  useEffect(() => {
    if (!l5 || !stageOpen || mapping || busy || togetherReadOnly) return;
    if (!messages.some((m) => m.role === 'user')) return;
    if (turnsSince(messages, map.drawnAt) > 0) refreshMap();
    // once per opening: the map's own landing must not draw it again
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l5, stageOpen, activeId]);
  // A map that grows while another view is up does not take the screen — the switch marks it.
  const mapSize = map.nodes.length;
  const mapSizeRef = useRef(mapSize);
  useEffect(() => {
    if (l5 && !stageOpen && mapSize > mapSizeRef.current) setStageFresh(true);
    if (stageOpen) setStageFresh(false);
    mapSizeRef.current = mapSize;
  }, [l5, mapSize, stageOpen]);
  /** A reply's effect pressed: the Logic Map, with those cards lit and the first in view. */
  function showNodes(ids: string[]) {
    if (!ids.length) return;
    openStage();
    if (wsLayout && !panelsOf(wsLayout).some((p) => p.type === 'map')) changeLayout(openBeside(wsLayout, { type: 'map' }, wsFacts).layout);
    setLitNodes(ids);
    setRevealNode((r) => ({ id: ids[0], n: (r?.n ?? 0) + 1 }));
  }
  /** A display or document a turn opened: Artifacts, on it. */
  function showObject(id: string) {
    showArtifact(`d:${id}`);
  }

  // ── INLINE ELEMENTS (lib/inline-ui.ts, components/inline/InlineUI.tsx) ──
  //
  // A reply's chart, slider, comparison, folded reasoning, choices or draft is
  // drawn from a validated description in the message itself. What the person
  // does with one is theirs and is kept with that message; nothing here calls
  // a model — a tapped choice is simply what they say next.

  /** What was done with one of a reply's inline elements, merged into what is kept with that message. */
  function keepInline(msg: Msg, n: number, s: InlineState) {
    if (!msg.id) return;
    const key = String(n);
    const swap: { from?: Msg; to?: Msg } = {};
    patchActive((sn) => ({
      ...sn,
      messages: sn.messages.map((x) => {
        if (x.id !== msg.id) return x;
        const ui = { ...(x.ui ?? {}) };
        const one = sanitizeInlineStateOne({ ...(ui[key] ?? {}), ...s });
        if (one) ui[key] = one;
        else delete ui[key];
        swap.from = x;
        swap.to = { ...x, ui: Object.keys(ui).length ? ui : undefined };
        return swap.to;
      }),
    }));
    // the record the map reads holds the same turn: it follows, so nothing is said twice
    const { from, to } = swap;
    if (from && to) chronRef.current = chronRef.current.map((c) => (c === from ? to : c));
  }

  /** A choice tapped in the latest reply: sent as their next message, and whatever they had started typing stays. */
  function chooseInline(text: string) {
    const typed = input;
    void send(text);
    if (typed.trim()) setInput(typed);
  }

  /**
   * An inline chart or comparison as the full artifact it stands for
   * (artifactFromSpec): a data display, a comparison — in Artifacts, where it
   * can be edited, re-viewed and kept. Made once; pressed again, what it made
   * opens.
   */
  function openInline(msg: Msg, n: number, spec: InlineSpec) {
    if (!workspaceOn) return;
    const space = spaceOf(mapRef.current);
    const had = msg.ui?.[String(n)]?.artifact;
    if (had && objOf(space, had)) return showObject(had);
    if (togetherRef.current?.active && togetherRef.current.role !== 'owner' && togetherRef.current.role !== 'editor') {
      setError('You can look at this line of thinking, but not change it.');
      return;
    }
    const a = artifactFromSpec(spec);
    if (!a) return;
    const made = makeDisplay(space, a.kind, a.state, 'socria');
    if (!made.ok) return setError(made.says);
    commitObjects(made.space, objOf(made.space, made.obj.id));
    keepInline(msg, n, { artifact: made.obj.id });
    showObject(made.obj.id);
  }

  // ── LOGOS 5: STUDY (lib/logos5/study.ts, docs/LOGOS-5.md §4) ──────────
  //
  // Files and a sentence become topics (Components), practice made from the
  // files (Practice) and — only when asked for — the conversation and its
  // Logic Map. The study is one display in this line of thinking's map
  // (lib/objects/display-study.ts), saved and shared with it; which of its
  // three screens is showing belongs to this visit only. A line of thinking
  // with no study is the conversation, exactly as before.
  /** the topic open on the board */
  const [studyTopic, setStudyTopic] = useState<string | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [makingFor, setMakingFor] = useState<string | null>(null);
  const [studyNote, setStudyNote] = useState<string | null>(null);
  /** the topic opened by "Recommend for me", whose reason is shown with it */
  const [studyWhy, setStudyWhy] = useState<string | null>(null);
  // HOME IS THE UNIVERSAL MAP (lib/logos5/universe.ts). Logos 5 opens on every
  // conversation merged into one mind map, not on a list: a line of thinking is
  // opened from the map, and a new one begun from it. The rail is put away; it
  // is still there ("List") for renaming, deleting and filing.
  const [l5Home, setL5Home] = useState(false);
  /** an opening chosen elsewhere, put in the map's box to be made their own before it is sent */
  const [homeStart, setHomeStart] = useState<string | null>(null);
  /** files sent from the map's box: sorted once the new line of thinking they begin is the one open */
  const sortNextRef = useRef<{ id: string; atts: Attachment[]; said: string; goal: Intent } | null>(null);
  /** files sent from the map are waiting to be sorted — for the line of thinking to open, or for an answer still coming to finish */
  const [sortPending, setSortPending] = useState(false);
  useEffect(() => {
    const job = sortNextRef.current;
    if (!job || job.id !== activeId || busy || organizing) return;
    sortNextRef.current = null;
    setSortPending(false);
    void organize(job.atts, job.said, job.goal);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, sortPending, busy, organizing]);
  /** home's contents column: every line of thinking, by Project */
  const [l5List, setL5List] = useState(false);
  /** the rail, asked for to rename, delete or file conversations */
  const [l5Manage, setL5Manage] = useState(false);
  /**
   * What the Universal Map draws: every conversation. Signed in, that is all
   * of them as conversations of this surface, Core chats included — their
   * words and their maps, not their names alone (lib/logos5/merge.ts). A Core
   * chat this surface does not hold (signed out, where the two are kept
   * apart) is drawn by its name and opens on Core.
   */
  const universeIn = useMemo<UniverseIn[]>(() => {
    if (!l5) return [];
    const here = new Set(sessions.map((x) => x.id));
    return [
      ...sessions.map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt, projectId: x.projectId ?? null, map: x.map, messages: x.messages })),
      ...(chats ?? []).filter((c) => !here.has(c.id)).map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt, projectId: c.projectId ?? null, kind: 'core' as const })),
    ];
  }, [l5, sessions, chats]);

  /** A conversation this surface holds — on Logos 5 a Core chat is one too — opens here, wherever it was pressed. */
  const heldHere = (id: string) => l5 && sessionsRef.current.some((x) => x.id === id);

  // ── THE CORE CHATS, BROUGHT IN — ONCE (lib/logos5/merge.ts) ──────────
  //
  // The first time Logos 5 opens on an account after the two histories became
  // one, every Core chat is moved here (app/api/conversations/merge): its kind
  // and nothing else. Then each one's map is drawn — once, in the background,
  // one at a time and paced — through the ordinary map pass, which spends
  // nothing of the month's allowance. A visit cut short carries on the next
  // time; one that cannot be drawn now is drawn when it is opened.
  /** the maps being drawn for them: how many of how many, while it lasts */
  const [drawing, setDrawing] = useState<{ done: number; total: number } | null>(null);
  const mergeAskedRef = useRef(false);
  const drawingRef = useRef(false);
  /** the conversation whose map is being drawn in the background right now */
  const drawingIdRef = useRef<string | null>(null);
  /** on the Universal Map or the Mind Graph, the open line of thinking is not on screen */
  const offStageRef = useRef(false);
  offStageRef.current = l5Home || l5Mind || (messages.length === 0 && !busy && !streaming);
  const movedRef = useRef(onConversationsMoved);
  movedRef.current = onConversationsMoved;

  /**
   * A map the pass drew for a conversation that had none: what refreshMap
   * keeps of one, without the news it gives the screen — there was nothing on
   * it to protect, no workspace, no scene, nothing moved by hand.
   */
  function firstDrawn(s: LogosSession, got: TMap): TMap {
    const objects = mergeSpaces(s.map?.objects, got.objects);
    const unbound = { ...got, ...(objects ? { objects } : {}) };
    if (!objects) delete (unbound as { objects?: unknown }).objects;
    const map = bindNodes(unbound as TMap, s.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'));
    const kept = dropRemoved(map, s.map?.removed);
    const words = [...s.messages].reverse().find((m) => m.role === 'user')?.content;
    const history = recordChange(s.map?.history, s.map?.nodes ?? [], kept.nodes, Date.now(), 'turn', typeof words === 'string' ? words : undefined);
    return history ? { ...kept, history } : kept;
  }

  /** Draw the maps still owed, one at a time, until none are left or the pass says to stop. */
  async function drawOwed() {
    if (drawingRef.current) return;
    drawingRef.current = true;
    const store = browserStorage();
    let done = 0;
    try {
      for (;;) {
        const owed = readOwed(store);
        // never one that is shared or someone else's: this browser does not save those as a whole
        const skip = new Set([...sharedIdsRef.current, ...foreignIdsRef.current]);
        const { id, drop } = nextOwed(owed, sessionsRef.current, skip, offStageRef.current ? null : activeIdRef.current);
        if (drop.length) writeOwed(store, owed.filter((x) => !drop.includes(x)));
        // enough for one day: the rest tomorrow, or each when it is opened
        if (!id || drawnOn(store, localDay()) >= OWED_PER_DAY) break;
        setDrawing({ done, total: done + readOwed(store).length });
        const s = sessionsRef.current.find((x) => x.id === id)!;
        drawingIdRef.current = id;
        let stop = false;
        try {
          const res = await fetch('/api/logos/map', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...keyHeaders() },
            body: JSON.stringify({
              messages: s.messages,
              map: s.map ?? { ...EMPTY_MAP },
              contexts: s.contexts ?? {},
              today: localDay(),
              ...guidance(),
              // its own guard, not the open one's: on whenever its map is one the guard watches
              guard: guardWatches(s.map ?? EMPTY_MAP) ? 'guard' : '',
            }),
          });
          // too many at once, or no longer signed in: the rest wait for the next visit
          if (res.status === 429 || res.status === 401 || res.status === 403) stop = true;
          else countDrawn(store, localDay());
          if (!stop && res.ok) {
            const json = await res.json().catch(() => null);
            const cur = sessionsRef.current.find((x) => x.id === id);
            // still without one — not drawn by opening it, or by hand, meanwhile
            if (json?.map?.nodes?.length && cur && !(cur.map?.nodes ?? []).length) {
              const drawn = firstDrawn(cur, json.map as TMap);
              // THE MAP ALONE, and only onto a conversation still without one:
              // this browser's copy of its messages is from when the page
              // loaded, and saving the whole of it would write that back over
              // anything said since, here or on another device.
              const put = await fetch('/api/conversations', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, firstMap: drawn }),
              });
              const said = put.ok ? await put.json().catch(() => null) : null;
              const now = sessionsRef.current.find((x) => x.id === id);
              // when it was last worked on is unchanged: drawing its map is not working on it
              if (said?.ok && said.kept === false && now && !(now.map?.nodes ?? []).length) {
                applySessions(sessionsRef.current.map((x) => (x.id === id ? { ...now, map: { ...drawn, unopened: true } } : x)));
              }
            }
          }
        } catch {
          // offline: the rest wait
          stop = true;
        } finally {
          drawingIdRef.current = null;
        }
        if (stop) break;
        // asked for once, drawn or not: one the pass could not draw is drawn when it is opened
        writeOwed(store, readOwed(store).filter((x) => x !== id));
        done++;
        await new Promise((r) => setTimeout(r, OWED_PACE_MS));
      }
    } finally {
      drawingRef.current = false;
      setDrawing(null);
    }
  }

  // OPENED HERE, IT IS THEIRS. A map drawn in the background is marked
  // `unopened` until the person opens its conversation in Logos — on screen,
  // not merely the one last open behind the Universal Map (lib/logos.ts).
  const activeUnopened = !!active?.map?.unopened;
  useEffect(() => {
    if (hydrating || !activeId || !activeUnopened || l5Home || l5Mind) return;
    const id = activeId;
    const s = sessionsRef.current.find((x) => x.id === id);
    if (!s?.map?.unopened) return;
    const { unopened: _mark, ...map } = s.map;
    applySessions(sessionsRef.current.map((x) => (x.id === id ? { ...x, map } : x)));
    if (!cloud) return;
    void fetch('/api/conversations', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, opened: true }),
    })
      // the stored map changed: Socria Rewards reads progress from it, as from any save
      .then((r) => r.ok && window.dispatchEvent(new Event(SESSION_SAVED)))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, activeUnopened, hydrating, l5Home, l5Mind, cloud]);

  useEffect(() => {
    if (!l5 || !cloud || hydrating || !firstRun.ready) return;
    // what a visit cut short left owed
    if (readOwed(browserStorage()).length) void drawOwed();
    if (mergeAskedRef.current || firstRun.has('logos.merged')) return;
    mergeAskedRef.current = true;
    void (async () => {
      try {
        const res = await fetch('/api/conversations/merge', { method: 'POST' });
        // refused or unreachable: asked again on the next visit
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (!json) return;
        firstRun.reach('logos.merged');
        const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x: unknown): x is string => typeof x === 'string') : []);
        const ids = strings(json.moved);
        if (!ids.length) return;
        const moved = new Set(ids);
        movedRef.current?.(
          sessionsRef.current
            .filter((x) => moved.has(x.id))
            .map((x) => ({ id: x.id, title: x.title, updatedAt: x.updatedAt, projectId: x.projectId ?? null }))
        );
        // only the ones the server says may be drawn: never one kept quiet
        const draw = strings(json.draw).filter((x) => moved.has(x));
        if (!draw.length) return;
        writeOwed(browserStorage(), [...readOwed(browserStorage()), ...draw]);
        void drawOwed();
      } catch {
        /* offline: asked again on the next visit */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [l5, cloud, hydrating, firstRun.ready]);
  useEffect(() => {
    setStudyTopic(null);
    setStudyNote(null);
    setStudyWhy(null);
  }, [activeId]);
  /** The documents a study was made from, as this device holds them. */
  function studyDocs(st: StudyCore): SourceDoc[] {
    return st.files.map((f) => docsRef.current.get(f.doc) ?? docNow(f.doc)).filter((d): d is SourceDoc => !!d);
  }
  /**
   * The study changed as a whole — saved with the line of thinking it belongs
   * to, like any display. That is the one it was begun in: if another was
   * opened while practice was being made, it goes to its own, not the open one.
   */
  function commitStudy(next: StudyState, sid: string | null = activeIdRef.current) {
    if (!sid) return;
    if (sid === activeIdRef.current) {
      const space = spaceOf(mapRef.current);
      const cur = studyIn(space);
      const after = cur ? restudy(space, cur.obj.id, next) : null;
      if (after) commitObjects(after);
      return;
    }
    patchSession(sid, (x) => {
      const space = spaceOf(x.map ?? EMPTY_MAP);
      const cur = studyIn(space);
      const after = cur ? restudy(space, cur.obj.id, next) : null;
      return after ? { ...x, map: { ...(x.map ?? EMPTY_MAP), objects: after } } : x;
    });
  }
  /**
   * "Organize it": the files read on this device, sorted into topics
   * (/api/logos/organize; by their own headings when that cannot be). Their
   * words and files go into the conversation as a turn, and what Socria did
   * as its reply — so the documents belong to this line of thinking and every
   * later question carries them.
   */
  async function organize(atts: Attachment[], said: string, goal: Intent) {
    const sid = activeIdRef.current;
    if (!sid || organizing || busy) return;
    if (togetherReadOnly) return setStudyNote('You can read this line of thinking, but not add to it.');
    const fresh = atts.flatMap((a) => (a.kind === 'doc' && a.doc ? [docsRef.current.get(a.doc) ?? docNow(a.doc)] : [])).filter((d): d is SourceDoc => !!d);
    if (!fresh.length) return void send(said, atts);
    // more files dropped on a study: everything is sorted again, together
    const before = studyIn(mapRef.current.objects);
    const held = [...(before ? studyDocs(before.state) : []), ...fresh].filter((d, i, all) => all.findIndex((x) => x.id === d.id) === i).slice(0, 6);
    setOrganizing(true);
    setStudyNote(null);
    let sorted: Sorted | null = null;
    let plain = false;
    let note: string | null = null;
    try {
      const res = await fetch('/api/logos/organize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({ docs: held, said, goal }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.sorted?.topics?.length) {
        sorted = json.sorted as Sorted;
        plain = !!json.plain;
        note = typeof json.note === 'string' ? json.note : null;
      } else if (json?.error && (res.status === 401 || res.status === 429)) note = String(json.error);
    } catch {}
    if (!sorted) {
      sorted = plainSort(held);
      plain = true;
      note = note ?? 'Sorted by the files’ own headings — Socria could not sort them just now.';
    }
    if (!sorted) {
      setOrganizing(false);
      setStudyNote('There is not enough readable text in these files to sort.');
      return;
    }
    const state: StudyState = {
      v: 1,
      title: sorted.course || held[0].title || held[0].name,
      view: 'board',
      course: sorted.course,
      goal,
      said,
      files: held.map((d) => ({ doc: d.id, name: d.name, pages: d.pageCount })),
      topics: sorted.topics,
      start: sorted.start,
      why: sorted.why,
      ...(plain ? { plain: true } : {}),
      practice: [],
      at: Date.now(),
    };
    const start = sorted.topics.find((t) => t.id === sorted!.start);
    const reply = [
      `I ${sortedSaid(state)}${plain ? ' by their own headings' : ''}: ${sorted.topics.map((t) => t.title).join(' · ')}.`,
      start ? `Start with **${start.title}**${sorted.why ? ` — ${sorted.why.replace(/\.$/, '')}` : ''}.` : '',
      'Every quote on the board is your files’ own words, with its page; nothing more is made until you ask.',
    ]
      .filter(Boolean)
      .join(' ');
    const turn: Msg = { id: newMsgId(), at: Date.now(), role: 'user', content: said || (held.length === 1 ? 'Sort this file into topics.' : 'Sort these files into topics.'), attachments: atts };
    const answer: Msg = { id: newMsgId(), at: Date.now() + 1, role: 'assistant', content: reply };
    const studied = (m: TMap) => {
      const space0 = spaceOf(m);
      const cur = studyIn(space0);
      if (cur) return restudy(space0, cur.obj.id, state);
      const made = makeDisplay(space0, 'study', state, 'source');
      return made.ok ? made.space : null;
    };
    // the sorting is written into the line of thinking it began in, even if another was opened meanwhile
    if (sid === activeIdRef.current) {
      postPair(turn, answer);
      const made = studied(mapRef.current);
      if (made) commitObjects(made);
      else note = `This line of thinking already holds as many things as it keeps, so the topics are in the conversation only.`;
    } else {
      patchSession(sid, (x) => {
        const made = studied(x.map ?? EMPTY_MAP);
        return { ...x, messages: [...x.messages, turn, answer], ...(made ? { map: { ...(x.map ?? EMPTY_MAP), objects: made } } : {}) };
      });
      setOrganizing(false);
      return;
    }
    // Logos 5: the topics are in Content, and the screen stays where it was (Alex's rule B) —
    // the turn says what was sorted, and Content is a press away
    if (!l5) setStudyTab('content');
    setStudyTopic(null);
    setStudyNote(note);
    setOrganizing(false);
  }
  /**
   * "Practice this": journal entries from the topic's own passages when it is
   * bookkeeping (/api/logos/practice), else fill-in-the-blank cut from its
   * sentences here, with no model. `more` makes new ones like the last.
   */
  async function makePractice(topicId: string, more = false) {
    const sid = activeIdRef.current;
    const cur = studyIn(mapRef.current.objects);
    if (!cur || makingFor) return;
    const st = cur.state;
    const topic = st.topics.find((t) => t.id === topicId);
    if (!topic) return;
    const held = studyDocs(st);
    const prev = [...st.practice].reverse().find((p) => p.topic === topicId);
    const round = more && prev ? prev.round + 1 : 0;
    const id = `p${st.practice.reduce((m, p) => Math.max(m, Number(p.id.slice(1)) || 0), 0) + 1}`;
    setMakingFor(topicId);
    setStudyNote(null);
    let made: Practice | null = null;
    let note: string | null = null;
    const entries = held.length > 0 && (more ? prev?.kind === 'journal' : looksLikeEntries(topic, held));
    if (entries) {
      try {
        const review = st.topics.filter((t) => t.kind === 'review' && t.id !== topic.id);
        const needed = new Set([topic, ...review].flatMap((t) => t.blocks.map((b) => b.doc)));
        const res = await fetch('/api/logos/practice', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...keyHeaders() },
          body: JSON.stringify({
            topic,
            review,
            docs: held.filter((d) => needed.has(d.id)),
            avoid: st.practice.filter((p) => p.topic === topicId).flatMap((p) => p.journal?.events.map((e) => e.text) ?? []),
          }),
        });
        const json = await res.json().catch(() => null);
        if (res.ok && Array.isArray(json?.events) && json.events.length) {
          made = {
            id,
            topic: topicId,
            kind: 'journal',
            title: json.title || `Record the entries: ${topic.title}`,
            made: json.events.map((e: { cite: StudyQuote }) => e.cite).slice(0, 3),
            journal: { events: more ? json.events.slice(0, 3) : json.events, balance: more ? null : json.balance ?? null, accounts: json.accounts ?? [] },
            answers: {},
            checked: null,
            round,
          };
        }
      } catch {}
      if (!made) note = 'Journal entries could not be made from these pages just now — here are the topic’s own sentences to fill in instead.';
    }
    if (!made) {
      const items = clozeFrom(topic, held, { round, n: more ? 3 : 6 });
      if (items.length) made = { id, topic: topicId, kind: 'cloze', title: `Fill in the blanks: ${topic.title}`, made: items.map((c) => c.quote).slice(0, 3), cloze: items, answers: {}, checked: null, round };
    }
    setMakingFor(null);
    if (!made) return setStudyNote('There isn’t enough in this topic’s pages to practise from yet.');
    // what the study is now, in the line of thinking it belongs to — kept, if another was opened meanwhile
    const now = sid === activeIdRef.current ? studyIn(mapRef.current.objects)?.state : studyIn(sessionsRef.current.find((x) => x.id === sid)?.map?.objects)?.state;
    commitStudy({ ...(now ?? st), practice: [...(now ?? st).practice, made] } as StudyState, sid);
    if (sid !== activeIdRef.current) return;
    showArtifact(`p:${id}`);
    setStudyNote(note);
  }
  function editPractice(pid: string, fn: (p: Practice) => Practice) {
    const cur = studyIn(mapRef.current.objects);
    if (cur) commitStudy({ ...cur.state, practice: cur.state.practice.map((p) => (p.id === pid ? fn(p) : p)) });
  }
  /**
   * Into the conversation, on the study's material: the topic pointed at
   * (Point & Ask), the Logic Map open beside it when the question is why.
   */
  function askInLogic(text: string, opts: { map?: boolean; topic?: string | null } = {}) {
    if (l5) {
      // asked in the conversation, beside what it is about; a "why" is a structure — the Logic Map,
      // the conversation beside it
      if (opts.map) setScreen(() => fit({ view: 'logic_map', beside: 'chat' }, narrowRef.current));
    } else {
      setStudyTab('logic_map');
      if (opts.map) {
        openStage();
        if (wsLayout && !panelsOf(wsLayout).some((p) => p.type === 'map')) changeLayout(openBeside(wsLayout, { type: 'map' }, wsFacts).layout);
      }
    }
    const cur = studyIn(mapRef.current.objects);
    if (opts.topic && cur) {
      const f: Focus = { kind: 'part', obj: cur.obj.id, part: opts.topic };
      focusRef.current = f;
      setFocus(f);
    }
    void send(text);
  }
  const openQuote = (q: StudyQuote) => openCite(q.doc, q.block);

  // ── INSTANT RESUME (Logos 4, lib/logos4/resume.ts) ───────────────
  // This screen's view of each line of thinking — the thread's place, the
  // half-typed message and what it replies to, the selection, the phone's
  // surface — kept in this browser as it changes, written again when the page
  // is hidden, and restored when the session opens. No database write.
  const viewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveViewRef = useRef<() => void>(() => {});
  saveViewRef.current = () => saveView();
  useEffect(() => {
    if (!LOGOS4.resume || hydrating) return;
    if (viewTimer.current) clearTimeout(viewTimer.current);
    viewTimer.current = setTimeout(() => saveViewRef.current(), 700);
  }, [input, replyTo, focus, objSel, mobileView, hydrating]);
  useEffect(() => {
    if (!LOGOS4.resume) return;
    const flush = () => saveViewRef.current();
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);
  /** a new line of thinking offers the latest one still waiting on them */
  const pickUpOffer = useMemo(
    () =>
      LOGOS4.resume && !hydrating && messages.length === 0
        ? pickUp(sessions, readResume(browserStorage()), { except: activeId, skip: (id) => foreignIdsRef.current.has(id) || sharedIdsRef.current.has(id) })
        : null,
    [sessions, activeId, messages.length, hydrating]
  );

  const [wsDismissed, setWsDismissed] = useState<Set<string>>(() => new Set());
  const wsFacts = useMemo(() => {
    const f = factsFrom(map);
    // a study is drawn on its own screen (Logos 5), never as a workspace panel
    return { ...f, displays: f.displays?.filter((d) => d.kind !== 'study'), mind: cloud };
  }, [map, cloud]);
  // Something to look at besides the map: a built model, or a picture.
  const wsHasModel = wsFacts.docs.length > 0 || !!wsFacts.viz;
  // LOGOS 5: what each reply did in the workspace — the cards its turn put on
  // the map (from the map's own record) and the displays it opened (this
  // visit) — said under the reply, so the conversation shows its effects.
  const l5Effects = useMemo(() => {
    const out = new Map<string, L5Effect>();
    if (!l5) return out;
    const live = new Set(map.nodes.map((n) => n.id));
    const named = new Map((wsFacts.displays ?? []).map((d) => [d.id, d]));
    let lastUser: string | null = null;
    for (const m of messages) {
      if (m.role === 'user') {
        lastUser = m.id ?? null;
        continue;
      }
      if (!m.id || m.synthesis) continue;
      const fx = turnEffect(m.id, messages, map.history, live);
      const said = effectSaid(fx.added.length, fx.renamed.length);
      const objects = lastUser
        ? Object.entries(objMsg)
            .filter(([, u]) => u === lastUser)
            .map(([id]) => named.get(id))
            .filter((d): d is NonNullable<typeof d> => !!d)
            .map((d) => ({ id: d.id, label: d.title || d.name, kind: d.noun }))
        : [];
      if (said || objects.length) out.set(m.id, { map: said ? { said, nodes: [...fx.added, ...fx.renamed] } : null, objects });
    }
    return out;
  }, [l5, messages, map.nodes, map.history, wsFacts.displays, objMsg]);
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
  // LOGOS 5: THE LOGIC MAP IS THE MAP, AND ONLY IT. What was made is in
  // Artifacts and one more panel docks beside with Split View, so the
  // workspace holds the Thinking Map alone. Not written back: an arrangement
  // kept for Logos 3 in this browser is left as it was.
  useEffect(() => {
    if (!l5 || !wsLayout) return;
    const ps = panelsOf(wsLayout);
    if (ps.length === 1 && ps[0].type === 'map' && ps[0].config?.lens !== 'plot') return;
    const kept = ps.find((p) => p.type === 'map' && p.config?.lens !== 'plot');
    setWsLayout(singleLayout('map', kept?.config));
  }, [l5, wsLayout]);
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
  // A DISPLAY THE TURN MADE OPENS where it can be worked in — beside the map,
  // once the map that holds it has landed. Asked for in words, so shown, not suggested.
  useEffect(() => {
    if (!displayToOpen) return;
    if (!workspaceOn || !wsLayout) return setDisplayToOpen(null);
    if (!wsFacts.displays?.some((d) => d.id === displayToOpen)) return;
    if (l5) {
      const o = (map.objects?.objs ?? []).find((x) => x.id === displayToOpen);
      const docId = o?.kind === 'document' ? (o.states[o.at] as DocumentState | undefined)?.doc : undefined;
      if (docId) {
        // a document is Content: read there, as it was read in
        const sid = activeIdRef.current;
        if (sid) setContentSel((m) => ({ ...m, [sid]: `doc:${docId}` }));
        setStudyTab('content');
      } else {
        // what was made is shown in Artifacts, at full size, beside the conversation (Alex's rule C),
        // and the turn that made it says so — unless a new 3D studio was opened by hand since: it is
        // listed, and the studio stays open to be described
        const sid = activeIdRef.current;
        if (sid) setArtSel((m) => (m[sid] === STUDIO ? m : { ...m, [sid]: `d:${displayToOpen}` }));
        setScreen((s) => onMade(true, s, narrowRef.current));
        const asked = [...messages].reverse().find((m) => m.role === 'user' && m.id);
        if (asked?.id) setObjMsg((x) => (x[displayToOpen] ? x : { ...x, [displayToOpen]: asked.id! }));
      }
    } else {
      const next = afterDisplay(wsLayout, wsFacts, displayToOpen);
      if (next) changeLayout(next);
    }
    setDisplayToOpen(null);
  }, [displayToOpen, workspaceOn, wsLayout, wsFacts, changeLayout]);
  const wsViews = useMemo(() => (wsLayout ? suggestViews(wsFacts, wsLayout) : []), [wsFacts, wsLayout]);
  const wsArrangements = useMemo(() => (wsLayout ? arrangementsFor(wsFacts, wsLayout) : []), [wsFacts, wsLayout]);
  // THE ONE SURFACE FOLLOWS THE WORK — only while it is one surface. When a
  // line of thinking that was all map builds its first model, the model is
  // what there is to look at; a line opened without a model shows its map.
  // An arrangement somebody made of several panels is theirs and never moves.
  const wsSeen = useRef<{ id: string | null; docs: number; models: number; plot: boolean; solve?: boolean }>({ id: null, docs: 0, models: 0, plot: false });
  const wsWasSeen = (id: string | null, docs: number, models = 0, plot = false, solve = false) => {
    wsSeen.current = { id, docs, models, plot, solve };
  };
  useEffect(() => {
    if (!workspaceOn || !wsLayout) return;
    const seen = wsSeen.current;
    const docs = wsFacts.docs.length + (wsFacts.viz ? 1 : 0);
    const ps = panelsOf(wsLayout);
    const one = ps.length === 1 ? ps[0] : null;
    if (one && seen.id !== null && !l5) {
      const switched = seen.id !== activeId;
      if (one.type === 'map' && wsHasModel && (switched || docs > seen.docs)) changeLayout(singleLayout('model'));
      else if (one.type === 'model' && !wsHasModel) changeLayout(singleLayout('map'));
    }
    // Logos 5: a model built this turn is something made, and is shown in
    // Artifacts (Alex's rule C) — a picture drawn by the map in the
    // background is shown only when the turn asked for something to see
    const plot = wsFacts.lenses.includes('plot');
    if (l5 && seen.id === activeId && (docs > seen.docs || (plot && !seen.plot))) {
      const built = wsFacts.docs.length > seen.models;
      if (built || askedMakeRef.current) {
        const key = built ? `m:${wsFacts.docs[wsFacts.docs.length - 1].id}` : docs > seen.docs ? 'v:viz' : 'v:plot';
        // a plot made for a turn that asked for something to see is taken, so it is listed (lib/logos5/artifacts.ts)
        if (key === 'v:plot' && activeId) setMadeRec(writeMade(browserStorage(), activeId, 'plot', 'taken'));
        // a new 3D studio opened by hand stays open; what arrived is listed beside it
        setArtSel((m) => (activeId && m[activeId] !== STUDIO ? { ...m, [activeId]: key } : m));
        setScreen((s) => onMade(true, s, narrowRef.current));
      } else if (docs > seen.docs && screenRef.current.view !== 'artifacts') setArtFresh(true);
    }
    // The working, and functions the map could plot, drawn in the background: offered under the reply
    // (madeOffer), never listed or marked new unasked — four views, four jobs.
    const solve = wsFacts.lenses.includes('solve');
    wsWasSeen(activeId, docs, wsFacts.docs.length, plot, solve);
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

  // Logos 5: a note landing under the latest reply stays in view for someone already at the end
  useEffect(() => {
    const t = threadRef.current;
    if (l5 && t && atEndRef.current) requestAnimationFrame(() => (t.scrollTop = t.scrollHeight));
  }, [l5, buildNote, firstMapNote, found, mapping]);

  // Until the account has answered there is nothing to show; after, everyone
  // gets Logos 5 — a guest with one line of thinking and its map.
  if (!hasAccess) return <div className="logos-root" />;

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
  // carries the object's identity; the composer names it and is never sent.
  function handleAskAbout(id: string, _label: string) {
    focusComposer();
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
  // "Ask about this" from the inspector: what it describes is already the
  // selection, so the cursor goes to the composer, whose chip names it.
  // Nothing is typed for them.
  askLabelRef.current = () => {
    focusComposer();
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
  const focusBrief = writeSel ? describeWriting(writeDoc, writeSel) : workspaceOn ? describeFocus(focus, map, docs) : null;
  // POINT & ASK, CLEARED: the selection goes everywhere at once — the chip,
  // the highlighted part, the passage a document view holds.
  const clearAbout = () => {
    setFocus(null);
    setObjSel(null);
    setWriteSel(null);
  };

  const sceneOf = (p: PanelNode): ThoughtObject | null => {
    const objs = map.objects?.objs ?? [];
    const pinned = p.config?.obj ? objs.find((o) => o.id === p.config!.obj && o.kind === 'scene') : null;
    return pinned ?? (p.config?.obj ? null : objs.find((o) => o.kind === 'scene') ?? null);
  };

  /** The display a display panel shows: the one it is pinned to, else the newest. */
  const displaysHere = (map.objects?.objs ?? []).filter((o) => isDisplayKind(o.kind) && o.kind !== 'study');
  const displayOfPanel = (p: PanelNode): ThoughtObject | null =>
    (p.config?.obj ? displaysHere.find((o) => o.id === p.config!.obj) : null) ?? displaysHere[displaysHere.length - 1] ?? null;

  /** The artifact that draws the plot (lib/logos5/artifacts.ts). */
  function plotItem(): string {
    return plotArtifact(wsFacts.docs.map((d) => d.id), wsFacts.activeDoc, !!wsFacts.viz);
  }
  /** Logos 5, Artifacts: the panel an artifact is drawn in — a model, the picture, the plot, a Live 3D scene. */
  function artPanelOf(key: string): PanelNode | null {
    if (key.startsWith('m:')) return { kind: 'panel', id: `l5a-m-${key.slice(2)}`, type: 'model', config: { doc: key.slice(2) } };
    if (key === 'v:viz') return { kind: 'panel', id: 'l5a-viz', type: 'model' };
    // the plot, the worked solution, the working: the map's made lenses, each drawn on its own (lib/logos-layout.ts MADE_LENSES)
    if (key.startsWith('v:') && isMadeLens(key.slice(2))) return { kind: 'panel', id: `l5a-${key.slice(2)}`, type: 'map', config: { lens: key.slice(2) } };
    if (key.startsWith('s:')) return { kind: 'panel', id: `l5a-s-${key.slice(2)}`, type: 'scene', config: { obj: key.slice(2) } };
    return null;
  }

  function renderPanel(p: PanelNode) {
    switch (p.type) {
      case 'chat':
        // Logos 5: the conversation is always beside the workspace, never inside it
        return <p className="l5-chatnote">The conversation is beside the workspace.</p>;
      case 'map':
        // Logos 5: the Logic Map draws the person's ideas — as the view or beside it, the same map; an
        // artifact (the plot, the working) draws its one made lens
        return (
          <div className="lg-panel lg-panel-in">
            {mapBody({
              lens: p.config?.lens,
              primary: p.id === firstOf('map'),
              ...(l5 ? { shapes: /^l5a-/.test(p.id) && isMadeLens(p.config?.lens) ? p.config.lens : 'ideas' } : {}),
            })}
          </div>
        );
      case 'model': {
        const doc = panelDoc(p);
        // Logos 5: the model open in Artifacts takes the reply's moves
        const primary = l5 ? p.id.startsWith('l5a-') : p.id === firstOf('model');
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
            guarded={guarded}
          />
        );
      }
      case 'display': {
        // AN EVERYDAY DISPLAY (Logos 3.5): the plan, table or worksheet itself,
        // worked in here — every change an operation on the object, so it
        // undoes, syncs and is read by the conversation like any other.
        // Logos 5: a document is Content's, the rest are Artifacts' — each place shows its own,
        // with its own strip (so the display's own picker is off there)
        const own = l5 && (p.id.startsWith('l5c-') || p.id.startsWith('art-'));
        const pool = l5 && !p.id.startsWith('l5c-') ? displaysHere.filter((o) => o.kind !== 'document') : displaysHere;
        const d = (p.config?.obj ? displaysHere.find((o) => o.id === p.config!.obj) : null) ?? pool[pool.length - 1] ?? null;
        return (
          <DisplayPanel
            obj={d}
            all={pool}
            pick={!own}
            guarded={guarded}
            sel={d && objSel?.obj === d.id ? objSel.part : null}
            onSelect={(part) => d && onObject({ type: 'select', obj: d.id, part })}
            onOp={(op, args) => (d ? onObject({ type: 'op', obj: d.id, op, args }) : null) ?? { ok: false, why: 'Nothing here can compute that.' }}
            onSeek={(at) => d && onObject({ type: 'seek', obj: d.id, at })}
            onPick={(id) => wsLayout && changeLayout(configurePanel(wsLayout, p.id, { obj: id }))}
            readOnly={togetherReadOnly}
            space={map.objects}
            history={map.history}
            me={{ id: user?.id || (room.active ? room.me.id : 'you'), name: myName }}
            shared={together.active || (room.active && sharedIdsRef.current.has(activeId ?? ''))}
            onWorkspace={onWorkspace}
            ask={askExperience}
            onPrompt={(text) => draftToComposer(text)}
            onDraft={(text) => draftToComposer(text)}
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
                if (surface === 'logos' || heldHere(id)) switchSession(id);
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
      case 'display': {
        const d = displayOfPanel(p);
        const noun = d ? (displayMeta(d.kind)?.noun ?? d.kind) : null;
        return { title: noun ? noun[0].toUpperCase() + noun.slice(1) : 'Display', sub: d ? String((d.states[d.at] as { title?: unknown } | undefined)?.title ?? d.name) : undefined };
      }
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
  // Who is here, the comments, and the one way to bring someone in — the same bar in Logos 4's header and Logos 5's.
  const presenceBar = (
    <>
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
    </>
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

  // The notes under the conversation — the Answer Guard, One, the style note, the map's limit, the
  // drift offer, a read-only share — shared by Logos 4's dock and Logos 5's column.
  const convoNotes = (
    <>
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
                <b>Noted.</b> Socria updated how it works with you — see it in
                {' '}
                <button
                  type="button"
                  className="lg-style-note-link"
                  onClick={() => {
                    setStyleDraftText(styleText);
                    setStyleOpen(true);
                    setStyleUpdatedNote(false);
                  }}
                >
                  your instructions
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
    </>
  );
  const mapBody = ({ lens, primary, shapes }: { lens?: string; primary: boolean; shapes?: 'ideas' | MadeLens }) => (
    <>
          <header className="lg-panel-head">
            <span className="lg-panel-title">
              {shapes && shapes !== 'ideas' ? LENSES.find((l) => l.id === shapes)?.label : 'Thinking Map'}
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
                  if (surface === 'logos' || heldHere(id)) switchSession(id);
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
            shapes={shapes}
            workspace={workspaceOn}
            onSelectNode={(id) => {
              // in Logos 5 a pressed card is asked about in its own popover, not in the composer
              if (!(l5 && !togetherReadOnly)) setFocus({ kind: 'node', id });
              if (l5) selectLinked(id);
            }}
            {...(l5 ? { linked: mapLit, reveal: revealNode } : {})}
            onAsk={workspaceOn && LOGOS4.pointAsk ? askAboutNode : undefined}
            {...(l5 && !togetherReadOnly ? { askCard: askCardFor } : {})}
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
            canFocus={limits.draftSpace}
            onFocus={(node) => addNodeToDraft(node)}
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

  // (no hooks here: this runs after the access gate's early return)
  // THE INSPECTOR, WHEN THERE IS SOMETHING TO INSPECT. Selecting a part of a
  // model, a parameter or an input brings a small card describing it; it
  // goes when the selection does. "Keep open" makes it a panel.
  const inspectorOpen = !!wsLayout && panelsOf(wsLayout).some((x) => x.type === 'inspector');
  const cardFocus = focus && (focus.kind === 'param' || focus.kind === 'input' || focus.kind === 'object') ? focus : null;
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

  // ── LOGOS 5 — THE SCREEN (docs/LOGOS-5.md) ────────────────────────────
  // (no hooks here: this runs after the access gate's early return)
  /** cards the conversation points at: a reply's effect hovered or pressed */
  const mapLit: ReadonlySet<string> = new Set([...(hoverNodes ?? []), ...(litNodes ?? [])]);
  /** the messages the selected card came from, in order */
  const linkList = linkNode && links ? links.fromNode.get(linkNode) ?? [] : [];
  const linkedMsgs = new Set(linkList);
  const linkLabel = linkNode ? map.nodes.find((n) => n.id === linkNode)?.label ?? '' : '';
  /** A card selected on the map: its turns are marked, and the first is brought into view. */
  function selectLinked(id: string) {
    setLinkNode(id);
    setLinkAt(0);
    setLitNodes(null);
    const first = links?.fromNode.get(id)?.[0];
    if (first) requestAnimationFrame(() => jumpTo(first));
  }
  function stepLinked(dir: 1 | -1) {
    if (!linkList.length) return;
    const at = (linkAt + dir + linkList.length) % linkList.length;
    setLinkAt(at);
    jumpTo(linkList[at]);
  }
  function clearLinked() {
    setLinkNode(null);
    setLitNodes(null);
    setFocus((f) => (f?.kind === 'node' ? null : f));
  }
  const l5Title = study ? study.state.course || study.state.title : active?.title && active.title !== UNTITLED ? active.title : messages.length ? 'A line of thinking' : 'Logos';
  /** the list is open when it was asked for and the rail is out (a tap beside it on a phone puts the rail away) */
  const listOpen = l5Manage && railOpen && !chromeHidden;
  // The Universal Map is the bar's first control and Synthesize is the Content and Logic Map
  // views' own (Alex Tran, Logos 5 Comments v2): neither is hidden in here any more.
  // Renaming, deleting and filing a line of thinking are on its card on the
  // Universal Map (components/logos5/UniverseParts.tsx PreviewCard), where it
  // lives, rather than in a list brought back from here.
  const l5Menu: L5MenuItem[] = [
    { label: 'Write', hint: limits.draftSpace ? 'Your writing and notes — Socria only when you ask' : 'Part of Socria One', onSelect: openWriting },
    ...(LOGOS4.capture ? [{ label: 'Quick capture', hint: 'Keep a thought for later', onSelect: () => setCaptureOpen(true) }] : []),
    ...(map.nodes.length ? [{ label: 'Save the map as an image', onSelect: () => void exportMapPng(map, l5Title) }] : []),
    ...(onJoinWithCode ? [{ label: 'Join with a code', hint: 'Open what someone shared with you', onSelect: onJoinWithCode }] : []),
    { label: 'What Logos does', sep: true, onSelect: () => setGuideOpen(true) },
    ...(!one ? [{ label: 'Socria One', hint: 'No daily limit', onSelect: () => askOne() }] : oneManageable ? [{ label: 'Manage Socria One', onSelect: manageOne }] : []),
    { label: 'Hide the bars', sep: true, onSelect: () => hideChrome(true) },
  ];
  // The meter, only when it is about to matter: at three or fewer left, or at the limit.
  const l5Meter = (() => {
    if (one || !usage.chats) return null;
    const chatsLeft = Math.max(0, (usage.chats.limit ?? 0) - usage.chats.used);
    const msgsLeft = usage.messages?.limit != null ? Math.max(0, usage.messages.limit - usage.messages.used) : null;
    const low = (msgsLeft !== null && msgsLeft <= 3) || (messages.length === 0 && chatsLeft <= 1);
    if (!low) return null;
    return (
      <p className={`l5-meter${msgsLeft === 0 ? ' is-out' : ''}`} role="note">
        {msgsLeft !== null && (msgsLeft === 0 ? 'No free messages left today.' : `${msgsLeft} free ${msgsLeft === 1 ? 'message' : 'messages'} left today.`)}
        {messages.length === 0 && ` ${chatsLeft} of ${usage.chats.limit} new lines of thinking left this month.`}{' '}
        <button type="button" className="l5-link" onClick={() => askOne()}>
          Socria One
        </button>
      </p>
    );
  })();
  // ── the study's screens (components/logos5/Study.tsx) ──
  const studyTopicObj = study && studyTopic ? study.state.topics.find((t) => t.id === studyTopic) ?? null : null;
  const artKey = artSel[activeId ?? ''] ?? null;
  const studioOpen = artKey === STUDIO && (studyTab === 'artifacts' || screen.beside === 'artifacts');
  const studyPlaceholder: string | null = studioOpen
    ? 'Describe it — e.g. a desk 120 cm wide with two drawers'
    : studyTab === 'content' && study
      ? studyTopicObj
        ? `Ask about ${studyTopicObj.title}…`
        : narrow
          ? 'Ask about these notes…'
          : 'Ask about these notes, or drop more files…'
      : studyTab === 'artifacts' && artKey?.startsWith('p:')
        ? narrow
          ? 'Ask about a blank…'
          : 'Ask about any blank, or type here…'
        : null;
  /** Sent from the composer: files sent from Content with no question are sorted in; anything else is asked in the conversation. */
  function sendFromStudy() {
    // WHAT TO MAKE, chosen before asking: what they typed, asked for as that artifact, and the choice is spent
    const choice = makeChoice(makeId, ownChoices);
    if (choice) {
      const asked = askFor(choice, input, messages.length > 0);
      if (!asked) return;
      setMakeId(null);
      // one of their own templates travels with the words that ask for it
      const own = templateOf(makeId, templates);
      sendFromComposer(asked, own ? { template: templatePayload(own) } : undefined);
      return;
    }
    const ready: Attachment[] = drafts.filter((d) => d.status === 'ready').map(({ id, status, error: _e, ...rest }) => rest);
    if (studyTab === 'content' && !input.trim() && ready.some((a) => a.kind === 'doc')) {
      setDrafts([]);
      const said = input.trim();
      setInput('');
      void organize(ready, said || study?.state.said || '', study?.state.goal ?? intentOf(said, ready.length));
      return;
    }
    sendFromComposer();
  }
  /** Files dropped on an empty Components: read on this device, then sorted. */
  async function organizeFiles(files: File[]) {
    if (readingFiles || organizing) return;
    const atts: Attachment[] = [];
    for (const [i, f] of files.slice(0, 6).entries()) {
      setReadingFiles(`Reading ${f.name}${files.length > 1 ? ` · ${i + 1} of ${Math.min(files.length, 6)}` : ''}…`);
      try {
        atts.push(await readDocument(f));
      } catch {
        /* a file that cannot be read is left out; the rest are sorted */
      }
    }
    setReadingFiles(atts.length ? 'Sorting…' : null);
    if (atts.length) await organize(atts, '', intentOf('', atts.length));
    setReadingFiles(null);
  }
  const pickTopic = (id: string | null) => {
    setStudyTopic(id);
    setStudyWhy(null);
    // the topic rides on the composer: what is asked next is about it (Point & Ask)
    if (id && study) setFocus({ kind: 'part', obj: study.obj.id, part: id });
    else setFocus((f) => (f?.kind === 'part' && f.obj === study?.obj.id ? null : f));
  };
  /** a question about a card on the map, asked where the card is */
  function askCardQuestion(node: MapNodeRef, text: string) {
    // the card is the subject of this one turn — send reads it before its first await —
    // and the composer goes back to whatever it was asking about
    const before = focusRef.current;
    focusRef.current = { kind: 'node', id: node.id };
    cardAskRef.current = true;
    void send(text);
    cardAskRef.current = false;
    focusRef.current = before;
  }
  /** The last thing asked about a card, and Socria's answer to it (or what has arrived of it). */
  function exchangeAbout(label: string): AskExchange | null {
    let qi = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === 'user' && m.about?.kind === 'node' && m.about.label === label) {
        qi = i;
        break;
      }
    }
    if (qi < 0) return null;
    const answer = messages.slice(qi + 1).find((m) => m.role === 'assistant');
    const waiting = !answer && qi === messages.length - 1 && (busy || !!streaming);
    const plain = (t: string) => t.replace(/\[[A-Z]\d+\.\d+\]/g, '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
    return { q: messages[qi].content, a: plain(answer ? answer.content : streaming || ''), streaming: waiting };
  }
  /** "Asking about": what a pressed card opens with, on the Logic Map (components/logos5/L5Ask.tsx). */
  const askCardFor = (node: MapNodeRef, close: () => void) => {
    const full = map.nodes.find((x) => x.id === node.id);
    const n = links?.fromNode.get(node.id)?.length ?? 0;
    const came = n
      ? {
          said: n === 1 ? 'Came from one message' : `Came from ${n} messages`,
          onShow: () => {
            close();
            setConvo(true);
            selectLinked(node.id);
          },
        }
      : full?.origin === 'socria'
        ? { said: 'Socria’s suggestion, kept by you' }
        : full?.origin === 'source'
          ? { said: 'From your files' }
          : null;
    return (
      <L5Ask
        label={node.label}
        exchange={exchangeAbout(node.label)}
        came={came}
        busy={busy}
        onClose={close}
        onAsk={(text) => askCardQuestion(node, text)}
        quick={[
          { label: 'Why does this one matter?', text: 'Why does this one matter?' },
          { label: 'Challenge it', text: `Challenge this — is “${node.label}” really so?` },
          { label: 'What rests on this?', text: `What rests on “${node.label}”?` },
        ]}
      />
    );
  };
  const userTurns = messages.filter((m) => m.role === 'user').length;
  const l5Dock = (
      <div className="l5-dock">
      {convoNotes}
      {/* Socria Voice, while it listens: what it hears and does, over the box it speaks into */}
      {voicePanel(false)}
      {voiceOffered && !voiceOn && <VoiceOffNote ear={ear} onOn={pressVoice} />}
      <LogosComposer
        layout="stacked"
        value={input}
        onChange={setInput}
        focusSignal={composerFocus}
        mathAvailable={mathAvailable}
        mathTopic={mathTopic}
        drafts={drafts}
        setDrafts={setDrafts}
        onSend={sendFromStudy}
        busy={busy}
        // sent, and nothing has arrived yet: the button spins and nothing more is sent (alone; in a
        // group the others can still be talked to while Socria answers)
        waiting={busy && !streaming && !groupLive}
        onStop={stopAnswer}
        readImage={readImage}
        readDocument={readDocument}
        onOpenDoc={openDoc}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        group={groupLive}
        about={focusBrief ? { kind: focusBrief.kind, label: focusBrief.label, of: focusBrief.of } : null}
        onClearAbout={clearAbout}
        voice={LOGOS4.voice && hasAccess && !togetherReadOnly}
        voiceButton={voiceButton}
        voiceLive={voiceOn}
        {...(LOGOS4.capture ? { onCapture: () => setCaptureOpen(true) } : {})}
        idlePlaceholder={
          makeChoice(makeId, ownChoices)?.placeholder ?? (focusBrief ? 'Ask about this, or anything…' : studyPlaceholder ?? (messages.length ? 'Reply to Socria…' : 'What are you working through?'))
        }
        // a chosen artifact can be made from the conversation so far, with nothing typed
        sendable={!!makeChoice(makeId, ownChoices) && messages.length > 0}
        footer={
          <>
            <MakePicker value={makeId} onChange={pickMake} />
            <ConcisePicker value={replyLength} onChange={pickLength} />
          </>
        }
      />
      {l5Meter}
    </div>
  );
  // ── THE FOUR VIEWS (lib/logos5/views.ts) ──
  //
  // CONTENT: what was brought to this line of thinking — its documents, notes
  // and pictures, each a card to arrange — and, once files were sorted, their
  // topics, the recommended one marked on its card (no "where do you want to
  // start?" in the way: Alex Tran, Logos 5 Comments v2).
  const contentItems = contentOf(messages, study?.state.files ?? [], docs);
  const contentIds = new Set(contentItems.map((c) => c.id));
  const contentOpen = (() => {
    const id = contentSel[activeId ?? ''] ?? null;
    return id && contentIds.has(id) ? id : null;
  })();
  /** A document, a note or a picture, open in Content to be read. */
  function openContent(id: string | null) {
    const sid = activeIdRef.current;
    if (!sid) return;
    setContentSel((m) => ({ ...m, [sid]: id }));
    if (id) setStudyTab('content');
  }
  const contentReader = (() => {
    const it = contentOpen ? contentItems.find((c) => c.id === contentOpen) : null;
    if (!it) return null;
    if (it.kind === 'doc' && it.doc) {
      const shown = displaysHere.find((o) => o.kind === 'document' && (o.states[o.at] as DocumentState | undefined)?.doc === it.doc);
      return shown ? renderPanel({ kind: 'panel', id: `l5c-${shown.id}`, type: 'display', config: { obj: shown.id } }) : <PlainReader text={it.text} />;
    }
    if (it.kind === 'writeup') return <WriteUpReader text={it.text ?? ''} />;
    return <PlainReader text={it.text} image={it.image} caption={it.caption} />;
  })();
  const topicsEl = study ? (
    <StudyBoard
      study={study.state}
      selected={studyTopic}
      onSelect={pickTopic}
      narrow={narrow && (typeof window === 'undefined' || window.innerWidth <= 640)}
      inspector={
        studyTopicObj ? (
          <TopicInspector
            topic={studyTopicObj}
            study={study.state}
            why={studyWhy}
            making={makingFor === studyTopicObj.id}
            onClose={() => pickTopic(null)}
            onOpen={openQuote}
            onPractice={() => void makePractice(studyTopicObj.id)}
            onExplain={() => askInLogic(`Explain “${studyTopicObj.title}” simply, from my files.`, { topic: studyTopicObj.id })}
            onChallenge={() => askInLogic(`Challenge me on “${studyTopicObj.title}” — one question at a time, from my files, and let me try before you tell me.`, { topic: studyTopicObj.id })}
            onWhy={() => askInLogic(`Why does “${studyTopicObj.title}” work the way it does? Show me its anchors, the evidence in my files, and the traps.`, { topic: studyTopicObj.id, map: true })}
          />
        ) : null
      }
      start={
        studyNote && studyTab === 'content' ? (
          <p className="l5s-note l5s-main-note" role="status">
            {studyNote}
          </p>
        ) : null
      }
    />
  ) : null;
  const contentView = (
    <ContentView
      session={activeId ?? ''}
      items={contentItems}
      opened={contentOpen}
      onOpen={(id) => {
        const it = contentItems.find((c) => c.id === id);
        // a document is read as it was read in, from the view that holds its pages
        if (it?.kind === 'doc' && it.doc) documentDisplay(it.doc);
        openContent(id);
      }}
      onBack={() => openContent(null)}
      reader={contentReader}
      topics={topicsEl}
      reading={readingFiles ?? (organizing ? 'Sorting your files into topics…' : null)}
      onFiles={(files) => void organizeFiles(files)}
      narrow={narrow}
    />
  );
  // ARTIFACTS: what was made in it — the writing (once begun), every display
  // but a document's (documents are Content), models and what they picture,
  // the plot, Live 3D scenes, practice.
  const writingShown = limits.draftSpace && !!activeId && (!isEmptyDoc(writeDoc) || !!writeStarted[activeId]);
  // What the map draws itself, listed once (lib/logos5/artifacts.ts): a picture that repeats a display
  // is not listed — the display is the answer — and the plot only where nothing else draws it.
  const drawn = mapArtifacts({
    models: wsFacts.docs.length,
    viz: wsFacts.viz,
    plot: wsFacts.lenses.includes('plot'),
    repeats: pictureRepeatsDisplay(
      map.viz?.title,
      wsFacts.viz === 'simulation',
      displaysHere.map((o) => String((o.states[o.at] as { title?: unknown } | undefined)?.title ?? o.name)),
    ),
  });
  // what is being worked on as itself (a matrix, a function); displays and 3D scenes are artifacts of their own
  const worked = (map.objects?.objs ?? []).filter((o) => !isDisplayKind(o.kind) && o.kind !== 'scene' && o.kind !== 'study');
  const workedHere = wsFacts.lenses.includes('work') && worked.length ? (worked.length === 1 ? (worked[0].name ? `Working on ${worked[0].name}` : 'What you are working on') : `${worked.length} things you are working on`) : null;
  // MADE WHEN ASKED (lib/logos5/artifacts.ts): the plot, the working and the thing worked on, drawn by the map
  // from a mathematical conversation, are listed once asked for in words or taken from the offer under the
  // latest reply; until then they are offered, once, never listed. One already open stays.
  const madeAvailable: MadeKey[] = [...(drawn.plot ? (['plot'] as const) : []), ...(wsFacts.lenses.includes('solve') ? (['solve'] as const) : []), ...(workedHere ? (['work'] as const) : [])];
  const openArt = artSel[activeId ?? ''] ?? '';
  const madeWanted: MadeKey[] = [
    ...new Set<MadeKey>([
      ...madeAsked(messages.filter((m) => m.role === 'user').map((m) => m.content)),
      ...madeRec.taken,
      ...((['plot', 'solve', 'work'] as const).filter((k) => openArt === `v:${k}`)),
    ]),
  ];
  const madeShown = madeListed(madeAvailable, madeWanted);
  const madeOffered = madeOffer(madeAvailable, madeWanted, madeRec.declined);
  /** An offer taken: listed from now on, and shown. Nothing is asked of a model — the map already drew it. */
  function takeMade(k: MadeKey) {
    const sid = activeIdRef.current;
    if (!sid) return;
    setMadeRec(writeMade(browserStorage(), sid, k, 'taken'));
    setArtSel((m) => ({ ...m, [sid]: k === 'plot' ? plotItem() : `v:${k}` }));
    setScreen((s) => onMade(true, s, narrowRef.current));
  }
  /** "Not now": not offered again in this line of thinking. */
  function declineMade(k: MadeKey) {
    const sid = activeIdRef.current;
    if (sid) setMadeRec(writeMade(browserStorage(), sid, k, 'declined'));
  }
  const artifactItems: ArtifactItem[] = [
    // THE WRITING: the person's own document — one artifact among the rest, there once they
    // have started it (Start writing, Write in the menu, Add to notes) and never chosen for them
    ...(writingShown
      ? [
          {
            key: 'w:doc',
            kind: 'Writing',
            title: writeDoc.title.trim() || 'Untitled',
            bare: true,
            render: () => writeSpaceEl('artifact'),
          },
        ]
      : []),
    // a model, with its own tools beside it inside its card: parameters, inspector, history
    ...wsFacts.docs.map((d) => ({
      key: `m:${d.id}`,
      kind: d.dynamic ? 'Simulation' : 'Model',
      title: d.title || 'Model',
      render: () => (
        <ModelArtifact
          model={renderPanel(artPanelOf(`m:${d.id}`)!)}
          tool={modelTool}
          onTool={setModelTool}
          renderTool={(t) => renderPanel({ kind: 'panel', id: `l5a-${t}-${d.id}`, type: t, config: { doc: d.id } })}
        />
      ),
    })),
    ...(drawn.viz ? [{ key: 'v:viz', kind: wsFacts.viz === 'simulation' ? 'Simulation' : 'Picture', title: map.viz?.title || (wsFacts.viz === 'simulation' ? 'Simulation' : 'Picture'), render: () => renderPanel(artPanelOf('v:viz')!) }] : []),
    // The plot lens draws the picture or the model when there is one — which is already the
    // item above — so it is an artifact of its own only for functions nothing else draws.
    ...(drawn.plot && madeShown.includes('plot') ? [{ key: 'v:plot', kind: 'Plot', title: 'The functions, plotted', render: () => renderPanel(artPanelOf('v:plot')!) }] : []),
    // the working, step by step, and the things being worked on (a matrix, a function): made from the
    // ideas, so here rather than on the Logic Map, which keeps to the ideas themselves
    ...(wsFacts.lenses.includes('solve') && madeShown.includes('solve') ? [{ key: 'v:solve', kind: 'Solution', title: 'The working, step by step', render: () => renderPanel(artPanelOf('v:solve')!) }] : []),
    ...(workedHere && madeShown.includes('work') ? [{ key: 'v:work', kind: 'Working', title: workedHere, render: () => renderPanel(artPanelOf('v:work')!) }] : []),
    // CAD: a Live 3D scene, built by describing it — and a new studio, while it is open and still empty
    ...wsFacts.scenes.map((s) => ({ key: `s:${s.id}`, kind: 'CAD', title: s.name, render: () => renderPanel(artPanelOf(`s:${s.id}`)!) })),
    ...(artKey === STUDIO ? [{ key: STUDIO, kind: 'CAD', title: 'New 3D studio', render: () => renderPanel(artPanelOf(STUDIO)!) }] : []),
    ...displaysHere
      .filter((o) => o.kind !== 'document')
      .map((o) => {
        const noun = displayMeta(o.kind)?.noun ?? o.kind;
        return {
          key: `d:${o.id}`,
          kind: noun[0].toUpperCase() + noun.slice(1),
          title: String((o.states[o.at] as { title?: unknown } | undefined)?.title ?? o.name),
          render: () => renderPanel({ kind: 'panel', id: `art-${o.id}`, type: 'display', config: { obj: o.id } }),
        };
      }),
    ...(study
      ? study.state.practice.map((pr) => ({
          key: `p:${pr.id}`,
          kind: 'Practice',
          title: pr.title,
          render: () => (
            <StudyPractice
              study={study.state}
              practice={pr}
              making={makingFor === pr.topic}
              onAnswers={(answers) => editPractice(pr.id, (x) => ({ ...x, answers }))}
              onCheck={(answers) => editPractice(pr.id, (x) => ({ ...x, answers, checked: checkPractice({ ...x, answers }) }))}
              onAgain={() => editPractice(pr.id, (x) => ({ ...x, checked: null }))}
              onMore={() => void makePractice(pr.topic, true)}
              onWhy={(gap: Gap | null) =>
                askInLogic(gap ? `Why is it “${gap.answer}” for “${gap.label}”? Walk me through the logic, from my files.` : 'Why do these answers work? Walk me through the logic, from my files.', { topic: pr.topic, map: true })
              }
              onOpen={openQuote}
              onPick={(id) => showArtifact(`p:${id}`)}
            />
          ),
        }))
      : []),
  ];
  // what Artifacts shows: the one chosen, else the newest (components/logos5/Study.tsx ArtifactsView)
  artShownRef.current = (artifactItems.find((i) => i.key === artKey) ?? artifactItems[artifactItems.length - 1])?.key ?? null;
  // what Artifacts holds, by name — for "open the habit tracker", said or typed (lib/logos5/commands.ts)
  artifactListRef.current = artifactItems.map((a) => ({ key: a.key, kind: a.kind, title: a.title }));
  const artifactsView = (
    <>
      <ArtifactsView
        items={artifactItems}
        selected={artKey}
        onSelect={showArtifact}
        narrow={narrow}
        onWrite={limits.draftSpace && !writingShown ? openWriting : undefined}
        // choose what to make, then say what it is about: in the conversation, beside (on a phone, as the view)
        onMake={
          togetherReadOnly
            ? undefined
            : (id) => {
                pickMake(id);
                // the studio is described from where it is; anything else is asked for in the conversation
                if (makeChoice(id, ownChoices)?.opens !== 'studio') setScreen((s) => chatVisible(s, narrowRef.current));
              }
        }
      />
      {studyNote && studyTab === 'artifacts' && (
        <p className="l5s-note l5s-main-note" role="status">
          {studyNote}
        </p>
      )}
    </>
  );
  // Synthesize is the Content view's and the Logic Map's own action (Alex Tran), not the bar's
  const synthAction =
    (studyTab === 'content' || studyTab === 'logic_map') && canSynthesize(map) ? (
      <button type="button" className="l5v-btn" onClick={() => void synthesize('workspace')} disabled={!!synthBusy || busy} title="See where your thinking stands">
        {synthBusy === 'workspace' ? 'Reading…' : 'Synthesize'}
      </button>
    ) : null;
  const tabsEl = (
    <L5Tabs
      value={studyTab}
      onChange={setStudyTab}
      counts={{
        content: contentItems.length,
        // a blank document is not something made yet
        artifacts: artifactItems.length - (artifactItems[0]?.key === 'w:doc' && isEmptyDoc(writeDoc) ? 1 : 0),
        logic_map: map.nodes.length,
      }}
      fresh={{ chat: chatFresh, artifacts: artFresh, logic_map: stageFresh }}
      actions={synthAction}
    />
  );
  /** the turn on its way, said truthfully: only what has actually happened (Alex Tran: real loading feedback) */
  const workingSteps: { label: string; state: 'done' | 'now' | 'next' }[] = [
    ...(turnInfo?.files ? [{ label: `Read ${turnInfo.files} ${turnInfo.files === 1 ? 'file' : 'files'} on this device`, state: 'done' as const }] : []),
    { label: 'Sent', state: 'done' as const },
    ...(turnInfo?.headers && turnInfo.sources ? [{ label: `Found ${turnInfo.sources} ${turnInfo.sources === 1 ? 'source' : 'sources'} to check it against`, state: 'done' as const }] : []),
    { label: turnInfo?.headers ? 'Writing the reply' : 'Socria is reading it', state: 'now' as const },
    ...(mapping ? [{ label: 'Drawing the Logic Map', state: 'now' as const }] : []),
  ];
  const l5Thread = (
    <section className={`l5-col${messages.length === 0 && !streaming && !busy ? ' is-empty' : ''}`} aria-label="Conversation">
      {linkNode && <L5LinkBar label={linkLabel} count={linkList.length} at={linkAt} onStep={stepLinked} onClear={clearLinked} />}
      <div
        className="l5-thread"
        ref={threadRef}
        onScroll={(e) => {
          const t = e.currentTarget;
          const atEnd = t.scrollHeight - t.scrollTop - t.clientHeight < 48;
          atEndRef.current = atEnd;
          setAwayFromEnd(!atEnd);
          if (LOGOS4.resume) {
            if (viewTimer.current) clearTimeout(viewTimer.current);
            viewTimer.current = setTimeout(() => saveViewRef.current(), 700);
          }
        }}
      >
        <div className="l5-thread-in">
          {messages.length === 0 && !streaming && !busy && (organizing || sortPending) && (
            <L5Working
              steps={[
                { label: 'Read your files on this device', state: 'done' },
                { label: organizing ? 'Sorting them into topics' : 'Sorting them into topics, once this opens', state: 'now' },
              ]}
            />
          )}
          {messages.length === 0 && !streaming && !busy && !organizing && !sortPending && (
            <div className="l5-hello">
              <h2>What are you working through?</h2>
              <p>Think out loud — Socria asks back. Files you add are kept in Content; anything made for you is in Artifacts.</p>
              {pickUpOffer && (
                <button type="button" className="l5-pickup" onClick={() => switchSession(pickUpOffer.id)}>
                  <span className="l5-pickup-k">Pick up where you left off · {relTime(pickUpOffer.at)}</span>
                  <span className="l5-pickup-t">{pickUpOffer.title}</span>
                  <span className="l5-pickup-q">
                    {pickUpOffer.kind === 'question' ? 'Socria asked' : 'You had started'}: “{pickUpOffer.waiting}”
                  </span>
                </button>
              )}
              <div className="l5-starts">
                {(noSessions && !input ? openingsFor(true).map((o) => ({ key: o.id, label: o.label, fill: o.message, id: o.id })) : logosStarters.map((st) => ({ key: st.prompt, label: st.label, fill: st.prompt, id: null as string | null }))).map((o) => (
                  <button
                    key={o.key}
                    type="button"
                    className="l5-start"
                    onClick={() => {
                      // put into the composer to be made their own — never sent by itself
                      setInput(o.fill);
                      if (o.id) startIdRef.current = o.id;
                      setComposerFocus((f) => ({ n: (f?.n ?? 0) + 1 }));
                    }}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((m, i) => {
            if (m.synthesis) {
              return (
                <div key={m.id ?? i} id={m.id ? `lg-m-${m.id}` : undefined} className="l5-synth">
                  <LogosSynthesis {...synthProps(m.synthesis, i === lastSynthIndex && i === messages.length - 1)} />
                  <MsgActions m={m} who="Socria" canReply={!togetherReadOnly} onReply={startReply} />
                </div>
              );
            }
            const prev = i > 0 ? messages[i - 1] : null;
            const side: Side = m.role === 'assistant' ? 'socria' : isMine(m) ? 'mine' : 'other';
            const latest = i === messages.length - 1 && m.role === 'assistant';
            const solo = !groupView && !togetherReadOnly;
            const brought = m.role === 'user' ? broughtBy(m, contentItems) : [];
            // a write-up they asked to keep lives in Content: here, its title, its opening and the way to it
            const writeUp = m.role === 'assistant' && isWriteUp(messages, i) ? { id: writeUpId(m, i), ...writeUpParts(m.content) } : null;
            // one quiet offer of what the map could draw from this, under the latest reply — never made unasked
            const offer =
              latest && solo && !busy && madeOffered
                ? { said: MADE_OFFER[madeOffered].said, take: MADE_OFFER[madeOffered].take, onTake: () => takeMade(madeOffered), onDecline: () => declineMade(madeOffered) }
                : null;
            return (
              <Fragment key={m.id ?? i}>
              <L5Message
                m={m}
                side={side}
                who={shownWho(m)}
                group={groupView}
                cont={!!prev && !prev.synthesis && authorKey(prev) === authorKey(m)}
                hue={groupView && side === 'other' ? hueOf(authorKey(m)) : undefined}
                showQuote={!!m.replyTo && (m.role === 'user' || !prev?.id || prev.id !== m.replyTo.id)}
                toLabel={m.replyTo?.id && messages.some((x) => x.id === m.replyTo!.id && isMine(x)) ? 'You' : undefined}
                docRefs={docRefs}
                onOpenCite={openCite}
                onOpenDoc={openDoc}
                {...(LOGOS4.pointAsk ? { onPickTex: askAboutExpression } : {})}
                onJump={jumpTo}
                canReply={!togetherReadOnly && (m.role === 'assistant' || (groupView && side === 'other'))}
                onReply={startReply}
                latest={latest}
                {...(latest && solo && !busy && m.id ? { onRetry: retryLast } : {})}
                {...(m.role === 'user' && side === 'mine' && solo && !busy && m.id ? { onEdit: editTurn, after: messages.length - i - 1 } : {})}
                linked={!!m.id && linkedMsgs.has(m.id)}
                effect={m.id ? l5Effects.get(m.id) ?? null : null}
                onHoverNodes={setHoverNodes}
                onShowNodes={showNodes}
                onOpenObject={showObject}
                {...(m.role === 'assistant' && m.id && !togetherReadOnly
                  ? { onInline: keepInline, onOpenInline: openInline, ...(latest && solo && !busy ? { onChoose: chooseInline } : {}) }
                  : {})}
                writeUp={writeUp}
                onOpenContent={openContent}
                offer={offer}
              />
              {/* RULE B: what was brought is read into Content in the background, said here in a line, a press away */}
              {brought.length > 0 && (
                <p className="l5v-ingest" role="note">
                  <span className="l5v-ingest-k">Added to Content</span>
                  {brought.map((c) => (
                    <button key={c.id} type="button" className="l5v-link" onClick={() => openContent(c.id)}>
                      {c.title}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="l5v-link is-quiet"
                    onClick={() => {
                      openContent(null);
                      setStudyTab('content');
                    }}
                  >
                    Open Content
                  </button>
                </p>
              )}
              </Fragment>
            );
          })}

          {chatNotes}
          <SocriaAnswering names={answeringOthers} />
          {streaming && <L5Pending text={streaming} group={groupView} to={groupView ? 'You' : null} place={pendingPlace} />}
          {synthBusy && <SynthesisPending scope={synthBusy} />}
          {busy && !streaming && (groupView ? <L5Pending text="" group to="You" /> : <L5Working steps={workingSteps} onStop={stopAnswer} />)}
          {gifted && !busy && !one && (
            <p className="l5-note" role="note">
              This one was on us.{' '}
              {usage.chats?.limit != null
                ? (() => {
                    const left = Math.max(0, usage.chats.limit - usage.chats.used);
                    return `You still have ${left} free Logos ${left === 1 ? 'chat' : 'chats'} this month.`;
                  })()
                : 'Your free Logos chats this month are all still there.'}
            </p>
          )}
          {error && (
            <p className="l5-error" role="alert">
              {error}
            </p>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      {awayFromEnd && messages.length > 0 && (
        <button
          type="button"
          className="l5-tolatest"
          onClick={() => {
            const t = threadRef.current;
            if (t) t.scrollTo({ top: t.scrollHeight, behavior: 'smooth' });
          }}
          aria-label="To the latest message"
        >
          ↓ Latest
        </button>
      )}
      {l5Dock}
    </section>
  );
  // LOGIC MAP: the person's own ideas, in whatever shape the thinking takes — a
  // web, a hierarchy, a flow, a timeline, tensions, evidence, a comparison —
  // and only that, whatever the subject. What was made from them (charts,
  // plots, the worked solution, models) is in Artifacts; one more panel docks
  // beside with Split View.
  const logicView = wsLayout ? (
    <div className="l5v-logic">
      {map.nodes.length === 0 && !mapping ? (
        <div className="l5v-empty">
          <h2>Nothing mapped yet.</h2>
          <p>{userTurns ? 'The Logic Map draws your ideas — how they connect, what rests on what, where they pull against each other — in whatever shape your thinking takes.' : 'Say what you are working through, and your ideas can be drawn here.'}</p>
          {userTurns > 0 && !togetherReadOnly && (
            <button type="button" className="l5v-btn is-primary" onClick={() => refreshMap()} disabled={busy}>
              Map this conversation
            </button>
          )}
        </div>
      ) : (
        <Workspace
          layout={wsLayout}
          onLayout={changeLayout}
          render={renderPanel}
          titleOf={panelTitle}
          views={[]}
          arrangements={[]}
          facts={wsFacts}
          suggestion={null}
          onAccept={acceptSuggestion}
          onDismiss={(sg) => setWsDismissed((d) => new Set(d).add(sg.id))}
          addViews={false}
          onResetView={resetView}
          overlay={wsCard}
        />
      )}
    </div>
  ) : null;

  // SPLIT VIEW (lib/logos5/views.ts): two of the views side by side — the one open, and beside it the
  // conversation, Content, the Logic Map, or Artifacts on the artifact chosen — each drawn as its own
  // tab draws it. Only what this line of thinking has is offered.
  const splitChoices = splitMenu({
    view: studyTab,
    beside: screen.beside,
    artifacts: artifactItems.map((a) => ({ key: a.key, kind: a.kind, title: a.title })),
    open: artShownRef.current,
    content: contentItems.length,
    ideas: map.nodes.length,
  });
  const viewEl = (v: Viewport) => (v === 'chat' ? l5Thread : v === 'content' ? contentView : v === 'artifacts' ? artifactsView : logicView);
  const primaryEl = viewEl(studyTab);
  const besideEl = screen.beside && screen.beside !== studyTab ? viewEl(screen.beside) : null;
  /** A Split View choice: a view beside, or Artifacts beside on an artifact named; chosen again, it goes. */
  function pickSplit(c: SplitChoice | null) {
    const sid = activeIdRef.current;
    if (!c) return setScreen((s) => ({ ...s, beside: null }));
    if (c.artifact) {
      if (c.on) return setScreen((s) => ({ ...s, beside: null }));
      if (sid) setArtSel((m) => ({ ...m, [sid]: c.artifact! }));
      return setScreen((s) => fit({ ...s, beside: 'artifacts' }, narrowRef.current));
    }
    setScreen((s) => dock(c.beside, s));
  }
  const l5Line = (
    <L5Layout
      view={studyTab}
      primary={primaryEl}
      beside={besideEl}
      besideView={besideEl ? screen.beside : null}
      besideTitle={screen.beside ? SPLIT_NAMES[screen.beside] : ''}
      onCloseBeside={() => setScreen((s) => ({ ...s, beside: null }))}
      // the composer, wherever the conversation is not on screen: what is said here is still said to Socria
      omni={convoOpen ? null : l5Dock}
      share={besideShare}
      onShare={(s) => {
        setBesideShare(s);
        writeBesideShare(browserStorage(), s);
      }}
      narrow={narrow}
    />
  );
  const projectName = active?.projectId ? projects?.find((p) => p.id === active.projectId)?.name : undefined;
  /** the account chip opens the profile's own menu: the account, and Memory (Alex Tran: the mind graph lives in the profile) */
  const accountEl = guest ? (
    // a guest: how many free messages are left, and the way to sign in, top right
    <div className="l5-guestacct">
      <span className={`l5-guestmeter${guestUsed >= GUEST_TURNS ? ' is-out' : ''}`} title={`Guests get ${GUEST_TURNS} free messages and one map`}>
        <span className="l5-guestmeter-dots" aria-hidden="true">
          {Array.from({ length: GUEST_TURNS }, (_, i) => (
            <i key={i} className={i < guestUsed ? 'is-used' : ''} />
          ))}
        </span>
        <span className="l5-guestmeter-l">{Math.max(0, GUEST_TURNS - guestUsed)} free left</span>
      </span>
      <a className="l5-signin" href={signInHref}>
        Sign in
      </a>
    </div>
  ) : isSignedIn ? (
    <AccountControl
      onOpen={() => setAcctOpen(true)}
      isOne={one}
      items={[
        { label: 'Account settings', hint: 'Profile, plan, devices, export', onSelect: () => setAcctOpen(true) },
        ...(cloud ? [{ label: 'Memory', hint: 'What Socria remembers about you', onSelect: () => setL5Mind(true) }] : []),
      ]}
    />
  ) : null;
  const moreEl = (
    <L5Menu
      label="More"
      items={l5Menu}
      button={
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <circle cx="5.5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="18.5" cy="12" r="1.6" />
        </svg>
      }
    />
  );
  const l5Head = (
    <L5TopBar
      title={[study?.state.course || projectName, active?.title && active.title !== UNTITLED ? active.title : messages.length ? 'A line of thinking' : ''].filter(Boolean).join(' · ')}
      onHome={goHome}
      onSearch={() => setSearchOpen(Date.now())}
      onNew={() => void newFromHome()}
      split={
        !narrow && activeId ? (
          <SplitView menu={splitChoices} besideOn={!!besideEl} onPick={pickSplit} />
        ) : null
      }
      presence={
        <>
          <ChallengeChip enabled={cloud} progress={!(railOpen && !chromeHidden)} onOpenAccount={() => setAcctOpen(true)} />
          {presenceBar}
        </>
      }
      menu={moreEl}
      account={accountEl}
      narrow={narrow}
    />
  );

  // ── LOGOS 5: HOME, THE UNIVERSAL MAP ──
  // Home is the Universal Map — where a returning person lands, and what the
  // bar's first control goes back to. A line of thinking opens on Chat (Alex
  // Tran: the default landing state of a session), a new one included: there
  // is no start screen and no "where do you want to start?" — the composer is
  // where it begins.
  const emptyHere = messages.length === 0 && !busy && !streaming && !groupView && !togetherReadOnly;
  const homeShown = l5 && l5Home && !l5Mind && !hydrating && !room.active;
  // WHAT CHANGED, once, to somebody who used the Socria before the map — told
  // on the map, because the map is what changed (lib/first-run.ts
  // wantsWhatsNew). Every conversation they had counts as having been here,
  // the Core chats listed beside these included.
  const withWork = sessions.filter((x) => x.messages.length > 0 || !!x.map?.nodes?.length);
  const workHere = new Set(withWork.map((x) => x.id));
  const chatsBeside = (chats ?? []).filter((c) => !workHere.has(c.id));
  const whatsNewShown =
    homeShown &&
    !togetherReadOnly &&
    wantsWhatsNew(firstRun.state, {
      work: [...withWork.map((x) => x.updatedAt), ...chatsBeside.map((c) => c.updatedAt)],
      hydrated: !hydrating,
      synced: firstRun.synced,
      introShowing: introWanted,
      busy: busy || !!streaming || organizing || sortPending,
    });
  /** Memory is its own place: over home and over a line of thinking alike */
  const mindShown = l5 && l5Mind && !hydrating && !room.active;
  function goHome() {
    setL5Home(true);
    setL5Mind(false);
    setL5Manage(false);
  }
  /** the contents column, on home */
  function toggleList() {
    setL5List((v) => !v);
  }
  /** a conversation pressed on the map: opened — at the card pressed, when one was */
  function openFromHome(id: string, node?: string) {
    setL5Home(false);
    setL5Mind(false);
    setL5List(false);
    // The one already open when the map was shown is not switched to, so it
    // draws the map it is owed here — unless the background is drawing it now.
    const same = sessionsRef.current.find((x) => x.id === id && x.id === activeIdRef.current);
    if (same && drawingIdRef.current !== id && owesExtraction({ messages: same.messages, map: same.map }, { logosSurface: true })) refreshMap();
    switchSession(id);
    if (node)
      setTimeout(() => {
        setStudyTab('logic_map');
        showNodes([node]);
      }, 80);
  }
  /** Every document this device has read for any line of thinking — for search, read when its box opens. */
  async function readAllDocs(): Promise<IndexDoc[]> {
    const ids = new Set<string>();
    for (const x of sessionsRef.current) {
      for (const m of x.messages) for (const a of m.attachments ?? []) if (a.kind === 'doc' && a.doc && !docsRef.current.has(a.doc)) ids.add(a.doc);
    }
    if (!ids.size) return [];
    try {
      return await loadDocs([...ids].slice(0, 200));
    } catch {
      return [];
    }
  }
  /**
   * A SEARCH RESULT, OPENED WHERE IT LIVES: its line of thinking, on the view
   * that holds it — a turn in Chat (scrolled to), a document or a passage in
   * Content, something made in Artifacts, a card on the Logic Map.
   */
  function openHit(h: Hit) {
    const e = h.entity;
    const local = e.id.includes('/') ? e.id.slice(e.id.indexOf('/') + 1) : '';
    const docId = e.id.startsWith('doc:') ? e.id.slice(4) : e.id.startsWith('blk:') ? e.id.slice(4).split('#')[0] : null;
    const block = e.id.startsWith('blk:') ? e.id.split('#')[1] ?? null : null;
    // a document belongs to every line of thinking it was brought to: the one open, else the newest
    const holds = (x: LogosSession) => !!docId && (x.messages.some((m) => m.attachments?.some((a) => a.kind === 'doc' && a.doc === docId)) || (studyIn(x.map?.objects)?.state.files ?? []).some((f) => f.doc === docId));
    const sid = e.session ?? (docId ? (sessionsRef.current.find((x) => x.id === activeIdRef.current && holds(x)) ?? sessionsRef.current.find(holds))?.id : undefined);
    if (!sid) return;
    let to: Screen = { view: e.view, beside: null };
    let art: string | null = null;
    if (e.kind === 'artifact') {
      if (e.id.startsWith('model:')) art = `m:${local}`;
      else if (e.id.startsWith('scene:')) art = 'v:viz';
      else if (e.sub === 'scene') art = `s:${local}`;
      else if (e.sub === 'document' || e.sub === 'study') to = { view: 'content', beside: null };
      else art = `d:${local}`;
    } else if (e.kind === 'writing' || e.kind === 'card') art = 'w:doc';
    if (art) setArtSel((m) => ({ ...m, [sid]: art! }));
    if (docId) setContentSel((m) => ({ ...m, [sid]: `doc:${docId}` }));
    setScreens((m) => ({ ...m, [sid]: fit(to, narrowRef.current) }));
    if (e.kind === 'node') return openFromHome(sid, local);
    openFromHome(sid);
    if (e.kind === 'message' && local && !/^\d+$/.test(local)) setTimeout(() => jumpTo(local), 140);
    // the passage, selected in its document, so what is asked next is about it
    if (docId) setTimeout(() => (block ? openCite(docId, block) : documentDisplay(docId)), 140);
  }
  /** a new line of thinking — the empty one already waiting, if there is one */
  function newFromHome(): boolean {
    const waiting = sessionsRef.current.find((x) => !x.messages.length && !(x.map?.nodes ?? []).length && !foreignIdsRef.current.has(x.id) && !(x.map?.objects?.objs ?? []).length);
    if (waiting) switchSession(waiting.id);
    else if (!newSession()) return false;
    setL5Home(false);
    setL5Mind(false);
    setL5List(false);
    return true;
  }
  /**
   * The box at the map's foot — where every line of thinking begins now: its
   * first question the words typed there; or, with files, those sorted into
   * topics first (once the new line of thinking is the one open, so the
   * sorting is written into it). Nothing typed and nothing added begins
   * nothing: an empty line of thinking is never opened.
   */
  function startFromHome(text: string, files?: { atts: Attachment[]; goal: Intent }, via?: 'voice') {
    const said = text.trim();
    if (!said && !files?.atts.length) return;
    if (!newFromHome()) return;
    setHomeStart(null);
    if (files?.atts.length && activeIdRef.current) {
      sortNextRef.current = { id: activeIdRef.current, atts: files.atts, said, goal: files.goal };
      setSortPending(true);
    } else void send(said, [], null, undefined, via);
  }
  /** filed from the map: a line of thinking as the rail files it, a Core chat by its host */
  function fileFromHome(id: string, kind: 'logos' | 'core', projectId: string | null) {
    if (kind === 'logos') void moveSession(id, projectId);
    else onMoveChat?.(id, projectId);
  }
  const l5MindView = mindShown ? (
    <MemoryView
      signedIn={!!isSignedIn}
      narrow={narrow}
      onOpen={(place) => {
        if (heldHere(place.id)) openFromHome(place.id);
        else if (place.surface === 'core') onOpenChat?.(place.id);
      }}
      head={(center) =>
        chromeHidden ? null : (
          <L5Header
            onHome={goHome}
            eyebrow="Memory"
            title="What Socria remembers about you"
            stage={null}
            center={center}
            menu={l5Menu}
            account={accountEl}
            extra={
              <button type="button" className="l5-unibtn" onClick={() => (l5Home || !activeId ? goHome() : setL5Mind(false))}>
                <span className="l5-unibtn-l">{l5Home || !activeId ? '← Universal Map' : '← Back'}</span>
              </button>
            }
          />
        )
      }
    />
  ) : null;
  const l5HomeView = homeShown ? (
    <UniverseView
      conversations={universeIn}
      projects={projects?.map((p) => ({ id: p.id, name: p.name, color: p.color ?? null, createdAt: p.createdAt, archived: p.archived }))}
      activeId={activeId}
      signedIn={!!isSignedIn}
      narrow={narrow}
      onOpen={(id) => openFromHome(id)}
      onOpenChat={(id) => onOpenChat?.(id)}
      onStart={startFromHome}
      onFile={cloud ? fileFromHome : undefined}
      onCreateProject={onCreateProject}
      onUpdateProject={onUpdateProject}
      onRename={(id, title) => {
        const name = cleanTitle(title);
        if (name) renameSession(id, name);
      }}
      onDelete={(id) => void deleteSession(id)}
      onMind={cloud ? () => setL5Mind(true) : undefined}
      contents={l5List}
      shared={shared}
      onOpenShared={onOpenShared}
      onJoinCode={onJoinWithCode}
      drawing={drawing}
      readDocument={readDocument}
      picker={<ConcisePicker value={replyLength} onChange={pickLength} />}
      // talking instead of typing, here too: the words into the box (held mic), or Socria Voice
      voice={LOGOS4.voice && hasAccess && !togetherReadOnly}
      voiceButton={voiceButton}
      voiceLive={voiceOn}
      startWith={homeStart}
      startIn={emptyHere && active?.projectId ? projects?.find((p) => p.id === active.projectId)?.name ?? null : null}
      working={(organizing || sortPending) && messages.length === 0 ? 'Sorting your files into topics…' : null}
      notice={messages.length === 0 ? studyNote : null}
      head={(center, count) =>
        chromeHidden ? null : (
          <L5Header
            onHome={goHome}
            eyebrow={count ? `Universal Map · ${count}` : 'Universal Map'}
            title=""
            stage={null}
            center={center}
            menu={l5Menu}
            account={accountEl}
            extra={
              <>
                <button type="button" className="l5-unibtn l5-searchbtn" onClick={() => setSearchOpen(Date.now())} aria-label="Search everything" aria-keyshortcuts="Meta+K Control+K" title="Search everything (⌘K / Ctrl K)">
                  <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                    <circle cx="11" cy="11" r="6.5" />
                    <path d="M20 20l-4.2-4.2" />
                  </svg>
                  <span className="l5-unibtn-l">Search</span>
                </button>
                <button type="button" className={`l5-unibtn is-list${l5List ? ' is-on' : ''}`} onClick={toggleList} aria-pressed={l5List} title="Every conversation, as a list">
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                    <path d="M8 7h12M8 12h12M8 17h12M4 7h.01M4 12h.01M4 17h.01" />
                  </svg>
                  <span className="l5-unibtn-l">List</span>
                </button>
              </>
            }
          />
        )
      }
      atlas={
        cloud ? (
          <MindAtlas
            scope="logos"
            onOpenChat={(id, surface) => {
              if (surface === 'logos' || heldHere(id)) openFromHome(id);
              else onOpenChat?.(id);
            }}
          />
        ) : undefined
      }
    />
  ) : null;

  // shared by both screens: the rail, the draft column, and the bars' own show/hide
  const railEl = (
    <>
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
            setL5Home(false);
            setL5Mind(false);
            setL5Manage(false);
          }}
          onNew={() => {
            newSession();
            usedRail();
            setL5Home(false);
            setL5Mind(false);
            setL5Manage(false);
          }}
          onDelete={deleteSession}
          onRename={renameSession}
          onToggle={() => {
            setRailOpen((v) => !v);
            setL5Manage(false);
          }}
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
    </>
  );
  /** The Draft Space and the Writing Space, for this line of thinking — as an artifact, or as the column beside the map. */
  const writeSpaceEl = (where: 'artifact' | 'column') =>
    activeId ? (
      <WriteSpace
        key={activeId}
        ref={writeRef}
        sessionId={activeId}
        doc={writeDoc}
        onChange={(d) => patchWriteDoc(activeId, d)}
        saveState={draftSaveState}
        docs={writeDocs}
        map={map}
        assist={runWriteAssist}
        onAsk={askAboutWriting}
        asking={writeSel}
        onOpenPassage={openWritingPassage}
        onOpenNode={openWritingNode}
        onParagraph={l5 ? undefined : onWritingParagraph}
        readOther={readOtherDoc}
        narrow={writeNarrow}
        where={where}
        onClose={where === 'column' ? () => setDraftOpen(false) : undefined}
        autoFocus
        cloud={cloud}
        topic={active?.title}
        onKeep={cloud ? keepWritingInMemory : undefined}
      />
    ) : null;
  const draftEl = (
    <>
      {/* ── the writing, beside the map (before Logos 5; in Logos 5 it is the Writing artifact) ── */}
      {draftOpen && !l5 && <div className="lg-draft-col">{writeSpaceEl('column')}</div>}
    </>
  );
  const chromeEls = (
    <>
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
    </>
  );
  return (
    <DocsContext.Provider value={docsApi}>
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
      {whatsNewShown && (
        <WhatsNew
          surface="logos"
          kept={withWork.length + chatsBeside.length}
          // the map is underneath: it lifts away to show it
          onDone={() => firstRun.reach('socria.new')}
          onSkip={() => firstRun.reach('socria.new', { skipped: true })}
        />
      )}
      {LOGOS4.capture && (
        <CaptureInbox
          open={captureOpen}
          onClose={() => setCaptureOpen(false)}
          signedIn={!!isSignedIn}
          readImage={readImage}
          onNewThread={(c) => captureToComposer(c, true)}
          onToComposer={(c) => captureToComposer(c, false)}
          {...(!togetherReadOnly ? { onAddToMap: captureToMap } : {})}
        />
      )}
      <LogosGuide open={guideOpen} onClose={closeGuide} edition={3} name="Logos 5" />
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
            {/* No dials here any more: Socria's personality is the account's
                Conversation Style (Manage Account → Personalization). What is
                left is the person's own words. */}
            <h2 className="lg-style-title">How should Socria work with you?</h2>
            <p className="lg-style-sub">
              In your own words, layered over your Conversation Style — set
              under Manage Account.
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
              This shapes how Socria works with you, not its principles — your
              thinking, your authorship and the learning guard stay yours
              whatever you write.
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
          className={`l5${listOpen ? ' list-open' : ' rail-closed'}${homeShown ? ' is-home' : ''}${mindShown ? ' is-mind' : ''}${chromeHidden ? ' chrome-hidden' : ''}${draftOpen ? ' draft-open' : ''}`}
        >
          {railEl}
          <div className="l5-main">
            {!chromeHidden && !mindShown && !homeShown && l5Head}
            {!mindShown && !homeShown && <div className={`l5v-tabhost${chromeHidden ? ' is-bare' : ''}`}>{tabsEl}</div>}
            <div className="l5-body">{mindShown ? l5MindView : homeShown ? l5HomeView : l5Line}</div>
            {/* over the Universal Map and Memory, Voice keeps listening where it can be seen and stopped */}
            {(mindShown || homeShown) && voicePanel(true)}
          </div>
          {draftEl}
          {chromeEls}
          <GuestWall open={guestWall && guest} signUpHref={signUpHref} signInHref={signInHref} onClose={() => setGuestWall(false)} />
          {searchOpen !== null && (
            <GlobalSearch
              sessions={sessions}
              docs={docs}
              more={readAllDocs}
              titleOf={(id) => {
                const t = sessions.find((x) => x.id === id)?.title ?? chats?.find((c) => c.id === id)?.title;
                return t && t !== UNTITLED ? t : 'A line of thinking';
              }}
              onPick={(h) => {
                setSearchOpen(null);
                openHit(h);
              }}
              onClose={() => {
                setSearchOpen(null);
                setSearchFor('');
              }}
              now={searchOpen}
              initial={searchFor}
            />
          )}
          {voiceSheet && (
            <VoiceSheet
              kind={voiceSheet}
              has={voiceHas}
              settings={voiceSet}
              onChange={changeVoiceSettings}
              onStart={startVoiceFromSheet}
              onClose={() => setVoiceSheet(null)}
            />
          )}
        </div>
    </div>
    </DocsContext.Provider>
  );
}

/** A document as an attachment: its reading's id, its text for wherever the reading is not at hand, and what its checks found. */
function docAttachment(doc: SourceDoc): Attachment {
  const note = renderDocAsNote(doc, MAX_NOTE_CHARS);
  const issues = doc.checks.filter((c) => c.level !== 'ok').map((c) => c.says);
  return {
    kind: 'doc',
    name: doc.name,
    origin: 'source',
    doc: doc.id,
    text: note.text,
    ...(note.truncated ? { truncated: true } : {}),
    pages: doc.pageCount,
    format: doc.format,
    ...(issues.length ? { checks: issues.join(' ').slice(0, 400) } : {}),
  };
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

/** The time zone this browser is in, as it names it (America/Chicago), or nothing. */
function browserTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
  } catch {
    return undefined;
  }
}

/** The web pages the server gave the reply to read (X-Socria-Sources), as kept with it. */
function webSourcesIn(h: Headers): Msg['sources'] | undefined {
  try {
    const raw = h.get('X-Socria-Sources');
    return raw ? cleanWebSources(JSON.parse(decodeURIComponent(raw))) : undefined;
  } catch {
    return undefined;
  }
}

/** How many sources the server found to check the reply against (X-Socria-Sources, app/api/logos/chat). */
function sourcesIn(h: Headers): number {
  try {
    const raw = h.get('X-Socria-Sources');
    if (!raw) return 0;
    const j = JSON.parse(decodeURIComponent(raw)) as { sources?: unknown[] };
    return Array.isArray(j?.sources) ? j.sources.length : 0;
  } catch {
    return 0;
  }
}
