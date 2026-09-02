// app/chat/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useUser,
} from '@clerk/nextjs';
import { Logo } from '@/components/Logo';
import { ModelPicker } from '@/components/ModelPicker';
import { usePlan } from '@/components/usePlan';
import { OneFoot } from '@/components/OneMark';
import { ModelGlyph } from '@/components/ModelGlyph';
import { LogosApp } from '@/components/LogosApp';
import { isValidOneKey } from '@/lib/socria-one';
import { MODEL_KEY, rememberModel } from '@/lib/socria-model-store';
import { buildStarters } from '@/lib/starters';
import { loadLocal as loadLocalLogos } from '@/lib/logos-sessions';
import { DepthPicker } from '@/components/DepthPicker';
import { TryLogosPill } from '@/components/TryLogosPill';
import { TryLogosModal } from '@/components/TryLogosModal';
import { InsightCard } from '@/components/InsightCard';
import { InsightShareModal } from '@/components/InsightShareModal';
import { ImportProfileModal } from '@/components/ImportProfileModal';
import { JourneyDebugModal } from '@/components/JourneyDebugModal';
import { SynthesisCard, SynthesisPending } from '@/components/SynthesisCard';
import { ChoiceChips } from '@/components/ChoiceChips';
import { parseMessage, splitChoices, type SynthesisData } from '@/lib/synthesis';
import { synthesisCadence, type Insight } from '@/lib/socria-prompt';

// Core 3 auto-generates an Insight Card once the conversation has passed
// this many user turns, and only if we haven't shown one in the last
// INSIGHT_MIN_GAP turns.
const INSIGHT_MIN_USER_TURNS = 6;
const INSIGHT_MIN_GAP = 3;

// A key of its own: dismissing the old Core 3.1 note is not a decision about
// Logos, so anyone who had seen that one is still shown this once.
const LOGOS_INTRO_DISMISS_KEY = 'socria.logosIntroDontShowAgain.v1';
// Set to '1' once the user unlocks auth-gated models with the typed access
// key. Lets anonymous (not-signed-in) users reach Core 3.1.
const SMART_KEY_STORAGE = 'socria.core3AccessKey.v1';
// Profile imported from another AI ("import your history"). Kept locally and,
// for signed-in users, mirrored to the cloud via /api/profile.
const PROFILE_KEY = 'socria.importedProfile.v1';
// Cross-conversation thinking journey (evolving understanding, open threads,
// timeline). Same storage pattern as the profile; refreshed every few turns.
const JOURNEY_KEY = 'socria.journey.v1';
const JOURNEY_EVERY_TURNS = 4;
import {
  SOCRIA_MODELS,
  EMPTY_MEMORY,
  CORE3_ACCESS_KEY,
  isValidAccessKey,

  type SocriaModel,
  type ThinkingDepth,
  sanitizeUserUnderstanding,
  hasJourneyContent,
  type ConversationMemory,
  type UserUnderstanding,
} from '@/lib/socria-prompt';

type Role = 'user' | 'assistant';
interface Message {
  role: Role;
  content: string;
}
interface Conversation {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  // Core 3 thread memory — extracted from user messages, injected into
  // future turns. Optional so Core 2 conversations don't carry an unused
  // field.
  memory?: ConversationMemory;
  // Last title Core 3's extractor auto-suggested. If the current title
  // still matches this string, we treat the title as "auto" and are free
  // to replace it with a newer suggestion. If the user renamed manually,
  // c.title will no longer match c.autoTitledAs and we won't override.
  autoTitledAs?: string;
}

const STORAGE_KEY = 'socria.conversations.v1';
const ACTIVE_KEY = 'socria.activeConversationId.v1';
const MIGRATED_KEY = 'socria.cloudMigrated.v1';
// Set the first time an anonymous user finishes a thought session (gets an
// AI reply). From then on, starting a *second* anonymous session requires
// sign-in — even if they delete the first one. Cleared on sign-in.
const USED_FREE_KEY = 'socria.usedFreeConvo.v1';
const DEPTH_KEY = 'socria.depth.v1';

function readModel(): SocriaModel {
  if (typeof window === 'undefined') return 'core-2';
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    if (raw === 'core-3' || raw === 'logos') return raw;
    return 'core-2';
  } catch {
    return 'core-2';
  }
}

function readDepth(): ThinkingDepth {
  if (typeof window === 'undefined') return 'balanced';
  try {
    const raw = localStorage.getItem(DEPTH_KEY);
    if (raw === 'quick' || raw === 'deep' || raw === 'abstract') return raw;
    return 'balanced';
  } catch {
    return 'balanced';
  }
}

function readSmartUnlocked(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(SMART_KEY_STORAGE) === '1';
  } catch {
    return false;
  }
}

// The openings offered to someone with no history — and the top-up for
// everyone else. buildStarters puts what they have actually been thinking
// about ahead of these.
const STARTER_PROMPTS = [
  'I don’t know what decision to make',
  'Help me think through this idea',
  'I’m stuck on what to build',
  'Challenge my reasoning',
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadLocal(): Conversation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocal(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  } catch (e) {
    console.error('Could not save conversations locally:', e);
  }
}

function readUsedFree(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(USED_FREE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeUsedFree(v: boolean) {
  try {
    if (v) localStorage.setItem(USED_FREE_KEY, '1');
    else localStorage.removeItem(USED_FREE_KEY);
  } catch {}
}

export default function ChatPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const router = useRouter();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  // Logos sessions live in the same store; listed here so one sidebar shows
  // everything you've been thinking about, whichever surface produced it —
  // interleaved by when you last touched it, not filed under the model that
  // produced it. Which one it was is a mark on the row, not a heading.
  const [logosSessions, setLogosSessions] = useState<
    { id: string; title: string; nodes: number; updatedAt: number }[]
  >([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamed, setStreamed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [hydrating, setHydrating] = useState(true);
  const [usedFree, setUsedFree] = useState(false);
  const [model, setModel] = useState<SocriaModel>('core-2');
  const [depth, setDepth] = useState<ThinkingDepth>('balanced');
  const [smartUnlocked, setSmartUnlocked] = useState(false);
  const [logosModalOpen, setLogosModalOpen] = useState(false);
  const [logosDismissed, setLogosDismissed] = useState(false);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);
  const [shareInsight, setShareInsight] = useState<Insight | null>(null);
  const [importedProfile, setImportedProfile] = useState('');
  const [importOpen, setImportOpen] = useState(false);
  const [journeyDebugOpen, setJourneyDebugOpen] = useState(false);
  const [journey, setJourney] = useState<UserUnderstanding | null>(null);
  // Freshest journey, immune to stale closures (the cadence update fires from
  // async flows that captured an older render).
  const journeyRef = useRef<UserUnderstanding | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mode: 'cloud' | 'local' = isSignedIn ? 'cloud' : 'local';

  // Signed in OR unlocked with the typed access key → may use Core 3.1.
  const canUseCore3 = !!isSignedIn || smartUnlocked;
  // What they hold, for the two quiet mentions of One on this page: the
  // sidebar foot and the model menu. Both wait for `known` — see usePlan.
  const planState = usePlan();

  // Anonymous users get one free thought session. They're "locked out" of
  // starting a new one once that flag is set OR they're already mid-session.
  // Unlocking with the access key lifts the cap too, so Core 3.1 is usable.
  const lockedOut =
    !isSignedIn && !smartUnlocked && (usedFree || conversations.length >= 1);

  // Header sent to gated API routes when the user unlocked via access key
  // instead of signing in. Harmless (and omitted) for signed-in users.
  const keyHeaders = (): Record<string, string> =>
    smartUnlocked && !isSignedIn ? { 'x-socria-key': CORE3_ACCESS_KEY } : {};

  // Load conversations whenever auth state resolves or flips.
  useEffect(() => {
    if (!isLoaded) return;
    let cancelled = false;

    async function hydrate() {
      setHydrating(true);
      setError(null);

      if (isSignedIn) {
        // Signed-in users have no per-session cap; clear the local flag.
        writeUsedFree(false);
        setUsedFree(false);
        // First sign-in for this browser: push localStorage into the cloud.
        try {
          const migratedFor = localStorage.getItem(MIGRATED_KEY);
          const local = loadLocal();
          if (user?.id && migratedFor !== user.id && local.length > 0) {
            await fetch('/api/conversations', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversations: local }),
            });
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem(ACTIVE_KEY);
          }
          if (user?.id) localStorage.setItem(MIGRATED_KEY, user.id);
        } catch (e) {
          console.error('Migration failed:', e);
        }

        try {
          const res = await fetch('/api/conversations', { cache: 'no-store' });
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(
              body.error || `Failed to load conversations (HTTP ${res.status})`
            );
          }
          const json = await res.json();
          if (cancelled) return;
          const all: Conversation[] = json.conversations || [];
          // Logos sessions share this store but not this UI: they're listed
          // in the same sidebar and opened in Logos, where their map lives.
          const list = all.filter((c: any) => c.kind !== 'logos');
          setLogosSessions(
            all
              .filter((c: any) => c.kind === 'logos')
              .map((c: any) => ({
                id: c.id,
                title: c.title,
                nodes: c.map?.nodes?.length ?? 0,
                updatedAt: Number(c.updatedAt) || 0,
              }))
          );
          setConversations(list);
          setActiveId(list[0]?.id ?? null);
        } catch (e: any) {
          if (!cancelled) setError(e?.message || 'Failed to load conversations');
        }
      } else {
        const stored = loadLocal();
        if (cancelled) return;
        setConversations(stored);
        setLogosSessions(
          loadLocalLogos().map((s) => ({
            id: s.id,
            title: s.title,
            nodes: s.map?.nodes?.length ?? 0,
            updatedAt: Number(s.updatedAt) || 0,
          }))
        );
        setUsedFree(readUsedFree());
        const lastActive =
          typeof window !== 'undefined'
            ? localStorage.getItem(ACTIVE_KEY)
            : null;
        if (lastActive && stored.some((c) => c.id === lastActive)) {
          setActiveId(lastActive);
        } else {
          setActiveId(stored[0]?.id ?? null);
        }
      }

      if (!cancelled) setHydrating(false);
    }

    hydrate();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn, user?.id]);

  // Persist active id locally for anonymous users.
  useEffect(() => {
    if (mode !== 'local') return;
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId, mode]);

  // Hydrate + persist the selected Socria model and thinking depth.
  useEffect(() => {
    setModel(readModel());
    setDepth(readDepth());
    setSmartUnlocked(readSmartUnlocked());
    try {
      setImportedProfile(localStorage.getItem(PROFILE_KEY) || '');
    } catch {}
    try {
      const rawJourney = localStorage.getItem(JOURNEY_KEY);
      if (rawJourney) {
        const parsed = sanitizeUserUnderstanding(JSON.parse(rawJourney));
        // Clamp corrupt future timestamps so cloud sync can't be blocked.
        if (parsed.updatedAt > Date.now()) parsed.updatedAt = Date.now();
        if (hasJourneyContent(parsed)) {
          setJourney(parsed);
          journeyRef.current = parsed;
        }
      }
    } catch {}
  }, []);

  // Signed-in users: sync the imported profile with the cloud. Cloud value
  // wins when present; a local-only profile is pushed up once. All failures
  // are silent — the feature degrades to local-only.
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/profile', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled) return;
        const cloud: string = json?.profile || '';
        const local = (() => {
          try {
            return localStorage.getItem(PROFILE_KEY) || '';
          } catch {
            return '';
          }
        })();
        if (cloud) {
          setImportedProfile(cloud);
          try {
            localStorage.setItem(PROFILE_KEY, cloud);
          } catch {}
        } else if (local) {
          void fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ profile: local }),
          }).catch(() => {});
        }

        // Journey: newest copy wins (both sides carry updatedAt).
        const cloudJourney: UserUnderstanding | null = json?.understanding
          ? sanitizeUserUnderstanding(json.understanding)
          : null;
        const localJourney = journeyRef.current;
        if (
          cloudJourney &&
          hasJourneyContent(cloudJourney) &&
          (!localJourney ||
            (cloudJourney.updatedAt || 0) >= (localJourney.updatedAt || 0))
        ) {
          setJourney(cloudJourney);
          journeyRef.current = cloudJourney;
          try {
            localStorage.setItem(JOURNEY_KEY, JSON.stringify(cloudJourney));
          } catch {}
        } else if (
          localJourney &&
          (!cloudJourney ||
            (localJourney.updatedAt || 0) > (cloudJourney.updatedAt || 0))
        ) {
          // Local copy is newer (e.g. built anonymously with the access key
          // before signing in) — push it up so other devices see it.
          void fetch('/api/profile', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ understanding: localJourney }),
          }).catch(() => {});
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [isLoaded, isSignedIn]);

  function saveJourney(next: UserUnderstanding) {
    // Never regress: a slow in-flight update resolving late must not
    // overwrite a newer journey (and then propagate via newest-wins sync).
    const cur = journeyRef.current;
    if (cur && (next.updatedAt || 0) < (cur.updatedAt || 0)) return;
    setJourney(next);
    journeyRef.current = next;
    try {
      localStorage.setItem(JOURNEY_KEY, JSON.stringify(next));
    } catch {}
    if (isSignedIn) {
      void fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ understanding: next }),
      }).catch(() => {});
    }
  }

  function saveImportedProfile(next: string) {
    setImportedProfile(next);
    try {
      if (next) localStorage.setItem(PROFILE_KEY, next);
      else localStorage.removeItem(PROFILE_KEY);
    } catch {}
    if (isSignedIn) {
      void fetch('/api/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profile: next }),
      }).catch(() => {});
    }
  }

  // Anonymous users without the access key may have a Core 3 selection saved
  // from a previous signed-in (or unlocked) session — downgrade to Core 2 so
  // the API gate doesn't bounce every message they send.
  useEffect(() => {
    if (!isLoaded) return;
    if (!canUseCore3 && SOCRIA_MODELS[model].requiresAuth) {
      setModel('core-2');
      rememberModel('core-2');
    }
  }, [isLoaded, canUseCore3, model]);
  function pickModel(next: SocriaModel) {
    const config = SOCRIA_MODELS[next];
    // Gated model, and the user hasn't signed in or unlocked with the key:
    // open the intro modal, which offers both the key entry and sign-in.
    if (config.requiresAuth && !canUseCore3) {
      setLogosModalOpen(true);
      return;
    }
    // Logos lives on its own route — it needs the split screen for the map.
    if (config.href) {
      router.push(config.href);
      return;
    }
    setModel(next);
    rememberModel(next);
  }

  // Validate + persist a typed access key. Returns true when accepted.
  // The Socria One code is a master key: typed here, it unlocks Core 3 AND
  // switches One on (Logos reads the same storage), and a signed-in
  // redemption is written to the account so it follows them.
  function handleUnlockKey(key: string): boolean {
    if (!isValidAccessKey(key)) return false;
    setSmartUnlocked(true);
    try {
      localStorage.setItem(SMART_KEY_STORAGE, '1');
      if (isValidOneKey(key)) {
        localStorage.setItem('socria.one.v1', '1');
        void fetch('/api/logos/redeem', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: key }),
        }).catch(() => {});
      }
    } catch {}
    return true;
  }
  function pickDepth(next: ThinkingDepth) {
    setDepth(next);
    try {
      localStorage.setItem(DEPTH_KEY, next);
    } catch {}
  }

  // Show the Logos invitation once per mount, unless it has been permanently
  // dismissed or they are already in Logos — where the pitch would be absurd.
  useEffect(() => {
    if (!isLoaded || autoOpenChecked) return;
    setAutoOpenChecked(true);
    try {
      const dismissed = localStorage.getItem(LOGOS_INTRO_DISMISS_KEY) === '1';
      setLogosDismissed(dismissed);
      if (!dismissed && localStorage.getItem(MODEL_KEY) !== 'logos') {
        setLogosModalOpen(true);
      }
    } catch {}
  }, [isLoaded, autoOpenChecked]);

  function handleLogosModalClose(dontShowAgain: boolean) {
    if (dontShowAgain) {
      try {
        localStorage.setItem(LOGOS_INTRO_DISMISS_KEY, '1');
      } catch {}
      setLogosDismissed(true);
    }
    setLogosModalOpen(false);
  }

  function handleLogosModalTry() {
    // Anyone with access goes straight in and stops being nudged. Anyone else
    // is sent to sign-in WITHOUT a permanent dismiss, so the invitation is
    // still there when they come back with an account.
    if (canUseCore3) {
      try {
        localStorage.setItem(LOGOS_INTRO_DISMISS_KEY, '1');
      } catch {}
      setLogosDismissed(true);
      setLogosModalOpen(false);
      setModel('logos');
      rememberModel('logos');
      return;
    }
    setLogosModalOpen(false);
    router.push('/sign-in?redirect_url=%2Fchat%3Fmodel%3Dlogos');
  }

  // A valid access key opens the whole product, so it goes straight to Logos.
  function handleLogosModalUnlock(key: string): boolean {
    if (!handleUnlockKey(key)) return false;
    try {
      localStorage.setItem(LOGOS_INTRO_DISMISS_KEY, '1');
    } catch {}
    setLogosDismissed(true);
    setLogosModalOpen(false);
    setModel('logos');
    rememberModel('logos');
    return true;
  }

  // The empty screen's chips. An open thread is an unfinished line of thought,
  // so it outranks a finished conversation's title; both outrank the generic
  // openings, which stay to top the list up and to keep one way in to
  // something new.
  const starters = buildStarters({
    threads: journey?.openThreads,
    recent: conversations.map((c) => ({ title: c.title, updatedAt: c.updatedAt })),
    fallback: STARTER_PROMPTS,
  });

  // One sidebar, one order. Chat sessions and Logos sessions are the same
  // thing to the person reading the list — something they were thinking about
  // — so they interleave by when each was last touched. The Logos mark on the
  // row says which surface opens it; no heading files them apart.
  const sessionRail = [
    ...conversations.map((c) => ({
      kind: 'chat' as const,
      id: c.id,
      title: c.title,
      updatedAt: c.updatedAt,
      nodes: 0,
    })),
    ...logosSessions.map((s) => ({ kind: 'logos' as const, ...s })),
  ].sort((a, b) => b.updatedAt - a.updatedAt);

  // Scroll to bottom when messages or stream changes
  const active = conversations.find((c) => c.id === activeId);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, streamed]);

  // Fire-and-forget: extract updated thread memory from the latest exchange,
  // patch the conversation with it, and persist to cloud/local. Core 3 only.
  async function extractAndPersistMemory(
    convoId: string,
    convo: Conversation
  ) {
    try {
      const res = await fetch('/api/extract-memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          messages: convo.messages,
          currentMemory: convo.memory ?? EMPTY_MEMORY,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const nextMemory: ConversationMemory | undefined = json?.memory;
      const suggestedTitle: string | null = json?.suggestedTitle ?? null;
      if (!nextMemory) return;

      let latestPatched: Conversation | undefined;
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== convoId) return c;
          // Preserve any insight state that lives in the CURRENT conversation
          // memory. The extractor ran on a snapshot captured before the
          // insight was generated (both fire in parallel), so its response's
          // insight fields are stale — merging live state here prevents the
          // insight card from being wiped a beat after it appears.
          const mergedMemory: ConversationMemory = {
            ...nextMemory,
            latestInsight:
              c.memory?.latestInsight ?? nextMemory.latestInsight ?? null,
            lastInsightAtTurn: Math.max(
              c.memory?.lastInsightAtTurn ?? 0,
              nextMemory.lastInsightAtTurn ?? 0
            ),
            latestSynthesis:
              c.memory?.latestSynthesis ?? nextMemory.latestSynthesis ?? null,
            lastSynthesisAtTurn: Math.max(
              c.memory?.lastSynthesisAtTurn ?? 0,
              nextMemory.lastSynthesisAtTurn ?? 0
            ),
          };
          const patch: Partial<Conversation> = { memory: mergedMemory };
          // Auto-title: only replace if the current title is either the
          // default, the first-user-message stub, or a prior auto-suggestion.
          // Once the user renames manually (via a future rename UI), the
          // stored title no longer matches `autoTitledAs` and we won't touch it.
          if (suggestedTitle) {
            const firstUser = c.messages.find((m) => m.role === 'user');
            const firstUserStub = firstUser
              ? firstUser.content
                  .slice(0, 60)
                  .replace(/\s+/g, ' ')
                  .trim()
              : null;
            const looksAuto =
              c.title === 'New thought session' ||
              c.title === c.autoTitledAs ||
              (firstUserStub != null && c.title === firstUserStub);
            if (looksAuto && suggestedTitle !== c.title) {
              patch.title = suggestedTitle;
              patch.autoTitledAs = suggestedTitle;
              patch.updatedAt = Date.now();
            }
          }
          return { ...c, ...patch };
        });
        latestPatched = next.find((c) => c.id === convoId);
        if (mode === 'local') saveLocal(next);
        return next;
      });

      if (mode === 'cloud' && latestPatched) {
        // Persist the memory update to Supabase without waiting.
        try {
          await fetch('/api/conversations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation: latestPatched }),
          });
        } catch (e) {
          console.error('Persist memory update failed:', e);
        }
      }

      // Cross-conversation journey: every few turns, fold this
      // conversation's evolving memory into the user-level understanding
      // (narrative, open threads, timeline). Fire-and-forget; failures
      // leave the previous journey intact.
      const journeyTurns = convo.messages.filter(
        (m) => m.role === 'user'
      ).length;
      if (journeyTurns >= JOURNEY_EVERY_TURNS && journeyTurns % JOURNEY_EVERY_TURNS === 0) {
        try {
          const jr = await fetch('/api/update-understanding', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...keyHeaders() },
            body: JSON.stringify({
              understanding: journeyRef.current ?? undefined,
              memory: latestPatched?.memory ?? nextMemory,
              title: latestPatched?.title ?? convo.title,
              messages: convo.messages,
            }),
          });
          if (jr.ok) {
            const jj = await jr.json();
            if (jj?.understanding) saveJourney(jj.understanding);
          }
        } catch {}
      }
    } catch (e) {
      console.error('Memory extraction failed:', e);
    }
  }

  // Generate an Insight Card in the background. Only fires when the
  // conversation has meaningful depth and we haven't shown one recently.
  async function maybeGenerateInsight(convoId: string, convo: Conversation) {
    const userTurns = convo.messages.filter(
      (m) => m.role === 'user'
    ).length;
    if (userTurns < INSIGHT_MIN_USER_TURNS) return;
    const lastAt = convo.memory?.lastInsightAtTurn ?? 0;
    if (userTurns - lastAt < INSIGHT_MIN_GAP) return;
    // Don't stack a new insight on top of an unread one.
    if (convo.memory?.latestInsight) return;

    try {
      const res = await fetch('/api/generate-insight', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          messages: convo.messages,
          memory: convo.memory ?? EMPTY_MEMORY,
          atTurn: userTurns,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const insight: Insight | null = json?.insight ?? null;
      if (!insight) return;

      let latestPatched: Conversation | undefined;
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== convoId) return c;
          const nextMemory = {
            ...(c.memory ?? EMPTY_MEMORY),
            latestInsight: insight,
            lastInsightAtTurn: userTurns,
          };
          return { ...c, memory: nextMemory };
        });
        latestPatched = next.find((c) => c.id === convoId);
        if (mode === 'local') saveLocal(next);
        return next;
      });

      if (mode === 'cloud' && latestPatched) {
        try {
          await fetch('/api/conversations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation: latestPatched }),
          });
        } catch (e) {
          console.error('Persist insight failed:', e);
        }
      }
    } catch (e) {
      console.error('Insight generation failed:', e);
    }
  }

  function dismissInsight(convoId: string) {
    let latestPatched: Conversation | undefined;
    setConversations((prev) => {
      const next = prev.map((c) => {
        if (c.id !== convoId) return c;
        const nextMemory = {
          ...(c.memory ?? EMPTY_MEMORY),
          latestInsight: null,
        };
        return { ...c, memory: nextMemory };
      });
      latestPatched = next.find((c) => c.id === convoId);
      if (mode === 'local') saveLocal(next);
      return next;
    });
    if (mode === 'cloud' && latestPatched) {
      // Fire and forget — server-side just needs the cleared state.
      fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: latestPatched }),
      }).catch((e) => console.error('Persist insight dismiss failed:', e));
    }
  }

  // Auto-synthesis: on a depth-paced cadence, generate a structured
  // synthesis of the conversation and store it as an interactive card.
  // Re-fires as the conversation grows (larger gap for later syntheses).
  async function maybeGenerateSynthesis(convoId: string, convo: Conversation) {
    const userTurns = convo.messages.filter((m) => m.role === 'user').length;
    const { firstAt, gap } = synthesisCadence(depth);
    const lastAt = convo.memory?.lastSynthesisAtTurn ?? 0;
    // Not enough conversation yet for the first synthesis.
    if (userTurns < firstAt) return;
    // Respect the cadence gap after a prior synthesis.
    if (lastAt > 0 && userTurns - lastAt < gap) return;
    // Don't stack a new synthesis on top of an unread one.
    if (convo.memory?.latestSynthesis) return;

    try {
      const res = await fetch('/api/generate-synthesis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          messages: convo.messages,
          memory: convo.memory ?? EMPTY_MEMORY,
          depth,
          atTurn: userTurns,
        }),
      });
      if (!res.ok) return;
      const json = await res.json();
      const synthesis: SynthesisData | null = json?.synthesis ?? null;
      if (!synthesis || !synthesis.sections?.length) return;

      let latestPatched: Conversation | undefined;
      setConversations((prev) => {
        const next = prev.map((c) => {
          if (c.id !== convoId) return c;
          const nextMemory = {
            ...(c.memory ?? EMPTY_MEMORY),
            latestSynthesis: synthesis,
            lastSynthesisAtTurn: userTurns,
          };
          return { ...c, memory: nextMemory };
        });
        latestPatched = next.find((c) => c.id === convoId);
        if (mode === 'local') saveLocal(next);
        return next;
      });

      if (mode === 'cloud' && latestPatched) {
        try {
          await fetch('/api/conversations', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversation: latestPatched }),
          });
        } catch (e) {
          console.error('Persist synthesis failed:', e);
        }
      }
    } catch (e) {
      console.error('Synthesis generation failed:', e);
    }
  }

  function dismissSynthesis(convoId: string) {
    let latestPatched: Conversation | undefined;
    setConversations((prev) => {
      const next = prev.map((c) => {
        if (c.id !== convoId) return c;
        return {
          ...c,
          memory: { ...(c.memory ?? EMPTY_MEMORY), latestSynthesis: null },
        };
      });
      latestPatched = next.find((c) => c.id === convoId);
      if (mode === 'local') saveLocal(next);
      return next;
    });
    if (mode === 'cloud' && latestPatched) {
      fetch('/api/conversations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversation: latestPatched }),
      }).catch((e) => console.error('Persist synthesis dismiss failed:', e));
    }
  }

  async function persistConversation(c: Conversation, allConvos: Conversation[]) {
    if (mode === 'cloud') {
      try {
        await fetch('/api/conversations', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversation: c }),
        });
      } catch (e) {
        console.error('Could not save conversation to cloud:', e);
      }
    } else {
      saveLocal(allConvos);
    }
  }

  async function removeConversation(id: string) {
    if (mode === 'cloud') {
      try {
        await fetch(`/api/conversations/${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
      } catch (e) {
        console.error('Could not delete conversation in cloud:', e);
      }
    }
    // For local mode, saveLocal is called by the caller after state update.
  }

  function newSession() {
    // Anonymous users only get one session; nudge to sign-in for a second.
    if (lockedOut) {
      router.push('/sign-in?redirect_url=/chat');
      return;
    }
    const id = uid();
    const fresh: Conversation = {
      id,
      title: 'New thought session',
      messages: [],
      updatedAt: Date.now(),
    };
    const next = [fresh, ...conversations];
    setConversations(next);
    setActiveId(id);
    setSidebarOpen(false);
    setError(null);
    // Don't write empty sessions to the cloud; they'll be saved on first message.
    if (mode === 'local') saveLocal(next);
  }

  async function deleteSession(id: string) {
    if (!confirm('Delete this thought session?')) return;
    const next = conversations.filter((c) => c.id !== id);
    setConversations(next);
    if (activeId === id) {
      setActiveId(next.length > 0 ? next[0].id : null);
    }
    if (mode === 'local') saveLocal(next);
    await removeConversation(id);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setInput(e.target.value);
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height =
        Math.min(textareaRef.current.scrollHeight, 220) + 'px';
    }
  }

  async function send(content: string) {
    const text = content.trim();
    if (!text || sending) return;
    setError(null);

    // Anonymous user trying to spin up a *second* session — gate to sign-in.
    // (They can keep messaging inside their existing session; activeId is set.)
    // Key-unlocked users bypass the cap.
    if (
      !isSignedIn &&
      !smartUnlocked &&
      !activeId &&
      (usedFree || conversations.length >= 1)
    ) {
      router.push('/sign-in?redirect_url=/chat');
      return;
    }

    // Ensure we have an active conversation
    let workingId = activeId;
    let working = conversations;
    if (!workingId) {
      const id = uid();
      const fresh: Conversation = {
        id,
        title: 'New thought session',
        messages: [],
        updatedAt: Date.now(),
      };
      working = [fresh, ...conversations];
      workingId = id;
      setActiveId(id);
    }

    // Append user message
    const withUser = working.map((c) =>
      c.id === workingId
        ? {
            ...c,
            messages: [...c.messages, { role: 'user' as Role, content: text }],
            updatedAt: Date.now(),
            title:
              c.title === 'New thought session' && c.messages.length === 0
                ? text.slice(0, 60).replace(/\s+/g, ' ').trim()
                : c.title,
          }
        : c
    );
    setConversations(withUser);
    if (mode === 'local') saveLocal(withUser);

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);
    setStreamed('');

    try {
      const convoForRequest = withUser.find((c) => c.id === workingId)!;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({
          messages: convoForRequest.messages,
          model,
          depth,
          memory: convoForRequest.memory ?? EMPTY_MEMORY,
          profile: importedProfile || undefined,
          understanding: journey ?? undefined,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong');
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      if (reader) {
        // Two parallel loops:
        //  1. Receive: pull chunks from the OpenAI stream into `received`.
        //  2. Reveal:  drip `received` into `revealed` one *complete word*
        //              at a time so each word can pop in with its own CSS
        //              entrance animation.
        // We never reveal a partial word mid-stream: we only advance once
        // we have a word followed by trailing whitespace in the buffer.
        // When the stream ends, any trailing partial word is flushed.
        // Speed-up rules keep the lag bounded once the buffer's ahead.
        let received = '';
        let streamDone = false;

        const reveal = new Promise<void>((resolve) => {
          const BASE_MS = 78;
          let revealed = '';
          const tick = () => {
            const lag = received.length - revealed.length;

            if (lag > 0) {
              const remaining = received.slice(revealed.length);
              // Take one full word + its trailing whitespace.
              const m = remaining.match(/^(\s*\S+\s+)/);
              if (m) {
                const advanceWords =
                  lag > 220 ? 4 : lag > 100 ? 2 : 1;
                let take = 0;
                let rest = remaining;
                for (let i = 0; i < advanceWords; i++) {
                  const mi = rest.match(/^(\s*\S+\s+)/);
                  if (!mi) break;
                  take += mi[0].length;
                  rest = rest.slice(mi[0].length);
                }
                revealed = received.slice(0, revealed.length + take);
                setStreamed(revealed);
              } else if (streamDone) {
                // Trailing partial word (no closing space). Flush it.
                revealed = received;
                setStreamed(revealed);
              }
            }

            if (revealed.length >= received.length && streamDone) {
              assistantText = revealed;
              resolve();
              return;
            }

            // Faster cadence when we're behind; gentler when caught up.
            const next =
              lag > 220 ? 28 : lag > 100 ? 50 : BASE_MS;
            setTimeout(tick, next);
          };
          tick();
        });

        const receive = (async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;
              received += decoder.decode(value, { stream: true });
            }
          } finally {
            streamDone = true;
          }
        })();

        await Promise.all([reveal, receive]);
      }

      // Persist assistant message
      setStreamed('');
      const withAssistant = withUser.map((c) =>
        c.id === workingId
          ? {
              ...c,
              messages: [
                ...c.messages,
                { role: 'assistant' as Role, content: assistantText },
              ],
              updatedAt: Date.now(),
            }
          : c
      );
      withAssistant.sort((a, b) => b.updatedAt - a.updatedAt);
      setConversations(withAssistant);

      const updated = withAssistant.find((c) => c.id === workingId)!;
      await persistConversation(updated, withAssistant);

      // Anonymous user just finished one full exchange — they've used their
      // free session. Any new-session attempt from here on opens the sign-in.
      if (!isSignedIn) {
        writeUsedFree(true);
        setUsedFree(true);
      }

      // Core 3 thread memory: extract in the background. The next turn
      // will read whatever's in the conversation's memory field. If this
      // fails, the conversation still works — memory just doesn't update.
      if (canUseCore3 && model === 'core-3') {
        void extractAndPersistMemory(workingId!, updated);
        // Also consider generating an Insight Card + auto-synthesis. Both
        // run in parallel and dedupe internally against their turn markers.
        void maybeGenerateInsight(workingId!, updated);
        void maybeGenerateSynthesis(workingId!, updated);
      }
    } catch (e: any) {
      setError(e?.message || 'Failed to send');
      // Roll back the user message we just added.
      const rolledBack = withUser
        .map((c) =>
          c.id === workingId
            ? { ...c, messages: c.messages.slice(0, -1) }
            : c
        )
        .filter((c) => c.messages.length > 0 || c.id !== workingId);
      setConversations(rolledBack);
      if (mode === 'local') saveLocal(rolledBack);
      if (!rolledBack.some((c) => c.id === workingId)) {
        setActiveId(rolledBack[0]?.id ?? null);
      }
      setInput(text);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  }

  // Any entry point can ask for a model by link — /chat?model=logos — which is
  // how the explainer page, the Socria One page and the sidebar all open Logos
  // without needing a route of its own.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const want = params.get('model');
    if (want !== 'logos' && want !== 'core-3' && want !== 'core-2') return;
    setModel(want);
    rememberModel(want);
    const url = new URL(window.location.href);
    url.searchParams.delete('model');
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);

  const messages = active?.messages || [];
  const hasMessages = messages.length > 0;

  // Logos is a model, not a destination: selecting it swaps the whole
  // experience in here rather than navigating away, so /chat stays the
  // address of "talking to Socria" whichever mind is answering. Every hook
  // above has already run, so this branch is safe.
  // Switching back out of Logos is the same swap in reverse, so it has to be
  // a state change here — Logos pushing /chat would only re-render itself.
  if (model === 'logos')
    return (
      <LogosApp
        onSwitchModel={(next) => {
          setModel(next);
          rememberModel(next);
        }}
      />
    );

  return (
    <div className="flex h-dvh">
      <TryLogosModal
        open={logosModalOpen}
        onClose={handleLogosModalClose}
        onTry={handleLogosModalTry}
        onUnlock={handleLogosModalUnlock}
        isSignedIn={!!isSignedIn}
      />
      <InsightShareModal
        open={!!shareInsight}
        onClose={() => setShareInsight(null)}
        insight={shareInsight}
      />
      <ImportProfileModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        profile={importedProfile}
        onSave={saveImportedProfile}
      />
      <JourneyDebugModal
        open={journeyDebugOpen}
        onClose={() => setJourneyDebugOpen(false)}
        journey={journey}
      />
      {/* Mobile backdrop when sidebar is open */}
      {sidebarOpen && (
        <div
          className="md:hidden fixed inset-0 z-30 bg-ink/30 backdrop-blur-[2px]"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Sidebar — overlay on mobile, static column on desktop */}
      <aside
        className={`${
          sidebarOpen ? 'flex' : 'hidden'
        } md:flex flex-col w-[min(18rem,84vw)] md:w-72 shrink-0 border-r border-border/60 h-dvh fixed md:static top-0 left-0 z-40 bg-paper md:bg-paper/80 backdrop-blur-sm`}
      >
        <div className="px-5 h-16 flex items-center justify-between border-b border-border/60">
          <Logo />
          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden text-ink/50 hover:text-ink p-1 -mr-1"
            aria-label="Close sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="p-3">
          <button
            onClick={newSession}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-ink/15 hover:border-moss-600 hover:bg-moss-50/40 transition-all group"
            title={
              lockedOut
                ? 'Sign in to start more sessions'
                : 'Start a new thought session'
            }
          >
            <span className="text-moss-700 text-lg leading-none">
              {lockedOut ? '↗' : '+'}
            </span>
            <span className="text-[14px] text-ink/80 group-hover:text-ink font-medium">
              {lockedOut ? 'Sign in for more sessions' : 'New thought session'}
            </span>
          </button>
        </div>

        <div className="px-5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-ink/40">
          Saved sessions
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {hydrating ? (
            <p className="px-3 py-2 text-xs text-ink/40 font-serif italic">
              Loading sessions…
            </p>
          ) : sessionRail.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink/40 font-serif italic">
              No sessions yet. Start one.
            </p>
          ) : (
            sessionRail.map((item) =>
              item.kind === 'logos' ? (
                <a
                  key={`logos-${item.id}`}
                  href={`/chat?s=${encodeURIComponent(item.id)}`}
                  // Opening one of these is a model switch as well as a
                  // navigation: record it before leaving, or coming back to
                  // /chat would land on whatever was active before and
                  // contradict where they just were.
                  onClick={() => rememberModel('logos')}
                  className="group flex items-center gap-2 px-3 py-2 rounded-md text-[13px] text-ink/70 hover:bg-ink/5 hover:text-ink transition-colors"
                  title={`${item.title} — opens in Logos`}
                >
                  <ModelGlyph
                    model="logos"
                    size={13}
                    className="text-moss-700 shrink-0"
                  />
                  <span className="truncate flex-1">{item.title}</span>
                  <span className="text-[10px] text-ink/35 shrink-0">
                    {item.nodes ? `${item.nodes} nodes` : 'no map'}
                  </span>
                </a>
              ) : (
                <div
                  key={`chat-${item.id}`}
                  className={`group flex items-center justify-between px-3 py-2 rounded-md text-[13px] transition-colors cursor-pointer ${
                    item.id === activeId
                      ? 'bg-moss-50 text-ink'
                      : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
                  }`}
                  onClick={() => {
                    setActiveId(item.id);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="truncate flex-1">{item.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(item.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-ink/40 hover:text-ink ml-2 px-1 transition-opacity"
                    aria-label="Delete"
                  >
                    ×
                  </button>
                </div>
              )
            )
          )}
        </div>

        <div className="border-t border-border/60 p-4">
          {/* Socria One, said once and left alone. The same plate as the
              /one cover, at the size of a sidebar row; it never moves and
              never changes what it says. A member sees what they hold. */}
          {planState.known && (
            <div className="mb-3">
              <OneFoot state={planState} />
            </div>
          )}
          <button
            type="button"
            onClick={() => {
              setImportOpen(true);
              setSidebarOpen(false);
            }}
            className="mb-3 w-full flex items-center gap-2 text-left text-[12.5px] text-ink/70 hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-moss-700">
              <path d="M12 3v12" />
              <path d="M7 10l5 5 5-5" />
              <path d="M4 19h16" />
            </svg>
            <span>
              Import your history{' '}
              {importedProfile ? (
                <span className="text-moss-700 font-medium">· active</span>
              ) : (
                <span className="text-ink/40">from other AIs</span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setJourneyDebugOpen(true);
              setSidebarOpen(false);
            }}
            className="mb-3 w-full flex items-center gap-2 text-left text-[12.5px] text-ink/70 hover:text-ink transition-colors"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-moss-700">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v4l2.5 2.5" strokeLinecap="round" />
            </svg>
            <span>
              Thinking journey{' '}
              {journey ? (
                <span className="text-moss-700 font-medium">· view</span>
              ) : (
                <span className="text-ink/40">· empty so far</span>
              )}
            </span>
          </button>
          <SignedIn>
            <div className="flex items-center gap-3">
              <UserButton afterSignOutUrl="/chat" userProfileMode="navigation" userProfileUrl="/account" />
              <div className="text-[11px] text-ink/50 font-serif italic leading-tight">
                Synced across your devices
              </div>
            </div>
          </SignedIn>
          <SignedOut>
            <SignInButton >
              <button className="w-full text-left text-[12px] text-ink/70 hover:text-ink font-serif italic">
                Sign in to sync across devices →
              </button>
            </SignInButton>
            <p className="mt-2 text-[10px] text-ink/40 font-serif italic">
              Saved on this device only
            </p>
          </SignedOut>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="sticky top-0 z-20 border-b border-border/60 px-3 md:px-6 h-16 flex items-center justify-between gap-2 shrink-0 bg-paper/85 backdrop-blur-md">
          {/* Left: sidebar toggle (mobile) — the model and depth pickers now live
              down beside the composer, where the typing happens */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={() => setSidebarOpen((v) => !v)}
              className="md:hidden text-ink/70 hover:text-ink p-2 -ml-1 shrink-0"
              aria-label="Toggle sidebar"
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>

          {/* Right: the Logos invitation (desktop) + auth */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:block">
              <TryLogosPill
                currentModel={model}
                visible={!logosDismissed}
                onOpen={() => setLogosModalOpen(true)}
              />
            </div>
            <SignedOut>
              <SignInButton >
                <button className="text-[13px] text-ink/70 hover:text-ink transition-colors whitespace-nowrap">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/chat" userProfileMode="navigation" userProfileUrl="/account" />
            </SignedIn>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-10">
            {!hasMessages && !isSignedIn && !smartUnlocked && usedFree ? (
              // Anon user who used their free convo but has no active one
              // (either never created another or deleted the first). Hard
              // gate: no starter prompts, just a sign-in CTA. Key-unlocked
              // users skip this wall entirely.
              <div className="text-center mt-12 animate-fade-up">
                <h2 className="font-serif text-3xl md:text-4xl text-ink leading-tight">
                  You&rsquo;ve used your free session.
                </h2>
                <p className="mt-3 text-ink/60 font-serif italic max-w-md mx-auto">
                  Create a free account to keep thinking with Socria. Your
                  sessions sync across every device.
                </p>
                <SignInButton >
                  <button className="mt-8 inline-flex items-center gap-2 rounded-full bg-moss-600 text-paper hover:bg-moss-700 transition-colors h-12 px-7 text-[15px] font-medium">
                    Create a free account
                    <span aria-hidden>→</span>
                  </button>
                </SignInButton>
                <p className="mt-4 text-[12px] text-ink/40">
                  Takes 30 seconds. No credit card.
                </p>
              </div>
            ) : !hasMessages ? (
              <div className="text-center mt-12 animate-fade-up">
                <h2 className="font-serif text-3xl md:text-4xl text-ink leading-tight">
                  What would you like to think through?
                </h2>
                <p className="mt-3 text-ink/60 font-serif italic">
                  Bring a question, a draft, or a decision. Socria will ask,
                  not answer for you.
                </p>

                <div className="mt-10 grid sm:grid-cols-2 gap-3 text-left">
                  {starters.map((p) => (
                    <button
                      key={p}
                      onClick={() => send(p)}
                      disabled={sending}
                      className="p-4 rounded-xl border border-border bg-paper hover:border-moss-600 hover:bg-moss-50/40 transition-all text-[14px] text-ink/80 text-left"
                    >
                      {p}
                    </button>
                  ))}
                </div>

                <SignedOut>
                  <div className="mt-8 p-5 rounded-xl border border-moss-200/60 bg-moss-50/40 text-left flex items-center gap-4">
                    <div className="flex-1">
                      <p className="text-[14px] text-ink/80 leading-relaxed">
                        Your first session is free. After that, sign in to
                        keep thinking and sync across devices.
                      </p>
                    </div>
                    <SignInButton >
                      <button className="shrink-0 inline-flex items-center gap-2 rounded-full bg-moss-600 text-paper hover:bg-moss-700 transition-colors h-10 px-5 text-[13px] font-medium">
                        Create account
                        <span aria-hidden>→</span>
                      </button>
                    </SignInButton>
                  </div>
                </SignedOut>
              </div>
            ) : null}

            {messages.map((m, i) => {
              const isAssistant = m.role === 'assistant';
              const { body, choices } = isAssistant
                ? splitChoices(m.content)
                : { body: m.content, choices: [] as string[] };
              const isLast = i === messages.length - 1;
              // Only the newest assistant message's choices stay actionable,
              // and only when we're idle (not streaming a reply).
              const showChoices =
                isAssistant &&
                isLast &&
                choices.length > 0 &&
                !sending &&
                !streamed;
              return (
                <div key={i}>
                  <Bubble role={m.role} content={body} />
                  {showChoices && (
                    <ChoiceChips
                      choices={choices}
                      onPick={(t) => send(t)}
                      disabled={sending}
                    />
                  )}
                </div>
              );
            })}

            {streamed && (
              <Bubble
                role="assistant"
                content={splitChoices(streamed).body}
                animate
              />
            )}

            {/* Auto-synthesis — a depth-paced interactive synthesis card,
                shown after the reply. Dismiss to keep chatting; it re-
                generates as the conversation grows. */}
            {!sending &&
              !streamed &&
              active?.memory?.latestSynthesis?.sections?.length &&
              active.id ? (
                <div className="synthesis-auto">
                  <div className="synthesis-auto-eyebrow">
                    Socria synthesized where your thinking is
                  </div>
                  <SynthesisCard data={active.memory.latestSynthesis} />
                  <button
                    type="button"
                    className="synthesis-auto-continue"
                    onClick={() => dismissSynthesis(active.id)}
                  >
                    Keep thinking →
                  </button>
                </div>
              ) : null}

            {/* Insight Card — appears after the assistant reply once
                enough depth is reached. Not while a stream is in flight. */}
            {!sending &&
              !streamed &&
              active?.memory?.latestInsight &&
              active.id && (
                <InsightCard
                  insight={active.memory.latestInsight}
                  onContinue={() => dismissInsight(active.id)}
                  onShare={() =>
                    setShareInsight(active.memory?.latestInsight ?? null)
                  }
                />
              )}

            {sending && !streamed && (
              <div className="my-6 flex items-center gap-1 text-ink/50">
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="thinking-dot" />
                <span className="ml-2 font-serif italic text-sm">thinking</span>
              </div>
            )}

            {error && (
              <div className="my-4 p-3 rounded-lg border border-red-300 bg-red-50 text-sm text-red-900">
                {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </div>

        <div className="border-t border-border/60 bg-paper/80 backdrop-blur-sm">
          <div className="max-w-2xl mx-auto px-6 py-4">
            {!isSignedIn && !smartUnlocked && hasMessages && (
              <div className="mb-3 flex items-center justify-between gap-3 px-1 text-[12px] text-ink/55">
                <span className="font-serif italic">
                  This is your free session — sign in to start more.
                </span>
                <SignInButton >
                  <button className="text-moss-700 hover:text-moss-800 font-medium">
                    Sign in →
                  </button>
                </SignInButton>
              </div>
            )}
            <div className="flex items-end gap-3 rounded-2xl border border-ink/15 bg-white px-4 py-3 focus-within:border-moss-600 transition-colors">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={handleInputChange}
                onKeyDown={handleKeyDown}
                placeholder="Share what you're thinking through…"
                rows={1}
                disabled={sending}
                className="flex-1 resize-none bg-transparent outline-none text-ink placeholder:text-ink/40 leading-relaxed py-1 max-h-[220px]"
              />
              <button
                onClick={() => send(input)}
                disabled={!input.trim() || sending}
                className="shrink-0 w-9 h-9 rounded-full bg-moss-600 text-paper flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed hover:bg-moss-700 transition-colors"
                aria-label="Send"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
            {/* Which mind you're talking to, and how deep it goes — kept
                within reach of the box you type in rather than parked in the
                header. Both menus open upward; they sit at the screen's edge. */}
            <div className="mt-2 flex items-center justify-between gap-3">
              <p className="hidden sm:block text-[11px] text-ink/40 font-serif italic min-w-0 truncate">
                Socria asks. You think. Enter to send, Shift+Enter for a new line.
              </p>
              <div className="flex items-center gap-2 shrink-0 ml-auto">
                {SOCRIA_MODELS[model].supportsDepth && (
                  <DepthPicker value={depth} onChange={pickDepth} dropUp align="right" />
                )}
                <ModelPicker
                  value={model}
                  onChange={pickModel}
                  isSignedIn={canUseCore3}
                  onLockedAttempt={() => setLogosModalOpen(true)}
                  dropUp
                  align="right"
                  plan={planState.known ? planState.plan : undefined}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
  animate = false,
}: {
  role: Role;
  content: string;
  animate?: boolean;
}) {
  const isUser = role === 'user';

  if (isUser) {
    return (
      <div className="my-6 flex justify-end">
        <div className="max-w-[85%] bg-moss-50 border border-moss-200/60 rounded-2xl rounded-br-md px-5 py-3">
          <div className="prose-socria text-ink">{content}</div>
        </div>
      </div>
    );
  }

  // Assistant message — may contain a structured synthesis block. Parse it
  // into segments so the synthesis renders as an interactive card and the
  // surrounding prose renders normally.
  const segments = parseMessage(content);
  const hasCard = segments.some(
    (s) => s.type === 'synthesis' || s.type === 'synthesis-pending'
  );

  return (
    <div className="my-6 flex justify-start">
      <div className={hasCard ? 'w-full' : 'max-w-[85%]'}>
        <div className="text-[10px] uppercase tracking-[0.16em] text-moss-700 mb-1.5 font-medium">
          Socria
        </div>
        {segments.map((seg, i) => {
          if (seg.type === 'synthesis') {
            return <SynthesisCard key={i} data={seg.data} />;
          }
          if (seg.type === 'synthesis-pending') {
            return <SynthesisPending key={i} />;
          }
          return (
            <div
              key={i}
              className="prose-socria text-ink/90 text-[15.5px]"
            >
              {animate ? renderAnimated(seg.text) : renderRichText(seg.text)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Inline renderer: `*emphasis*` → italic moss serif (Core 3.1's language-
// noticing signature); `**bold**` → bold label (the model uses it for list
// headings). Handling both keeps stray asterisks from ever leaking through.
function renderInline(text: string, keyBase: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  // Bold first so `**x**` isn't mistaken for two single-asterisk runs.
  const re = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    if (m[1] !== undefined) {
      parts.push(
        <strong key={`${keyBase}-b${key++}`} className="socria-strong">
          {m[1]}
        </strong>
      );
    } else {
      parts.push(
        <em
          key={`${keyBase}-e${key++}`}
          className="font-serif italic text-moss-700 text-[1.18em] leading-[1]"
          style={{ fontStyle: 'italic' }}
        >
          {m[2]}
        </em>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const BULLET_RE = /^\s*([-•]|\*)\s+(.*)$/;
const ORDERED_RE = /^\s*\d+[.)]\s+(.*)$/;
const TABLE_SEP_RE = /^\s*\|?[\s:|-]*-{2,}[\s:|-]*\|?\s*$/;

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim());
}

// A bullet item is a group "header" when it's a short label ending in a colon
// (e.g. "**Chipotle:**", "Mood-based decision:") rather than a full point.
// These become titled sections so a labeled list reads as a clean visual map.
function stripMarks(s: string): string {
  return s.replace(/\*+/g, '').trim();
}
function isGroupHeader(item: string): boolean {
  const s = stripMarks(item);
  return /:$/.test(s) && s.length <= 42;
}

// Static renderer for persisted assistant messages. Core 3.1 formats
// adaptively — mostly conversational prose, but bullet lists, numbered
// steps, and small pipe tables when comparing or planning. Parse those
// blocks so they render as real lists/tables instead of raw markup;
// everything inside still gets inline `*emphasis*`.
function renderRichText(text: string): React.ReactNode {
  const lines = text.replace(/\r/g, '').split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Table: a `|` line immediately followed by a separator row.
    if (
      line.includes('|') &&
      i + 1 < lines.length &&
      TABLE_SEP_RE.test(lines[i + 1]) &&
      lines[i + 1].includes('-')
    ) {
      const header = splitTableRow(line);
      i += 2;
      const rows: string[][] = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
        rows.push(splitTableRow(lines[i]));
        i++;
      }
      const k = key++;
      blocks.push(
        <div key={`tbl-${k}`} className="socria-table-wrap">
          <table>
            <thead>
              <tr>
                {header.map((c, ci) => (
                  <th key={ci}>{renderInline(c, `tbl-${k}-h${ci}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => (
                    <td key={ci}>{renderInline(c, `tbl-${k}-${ri}-${ci}`)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      continue;
    }

    // Bullet list.
    if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(lines[i].replace(BULLET_RE, '$2'));
        i++;
      }
      const k = key++;

      // If the list uses "Label:" headers, render it as titled groups — a
      // light visual map — instead of one flat bullet run.
      if (items.some(isGroupHeader) && items.some((it) => !isGroupHeader(it))) {
        const groups: { header: string | null; items: string[] }[] = [];
        let cur: { header: string | null; items: string[] } = { header: null, items: [] };
        for (const it of items) {
          if (isGroupHeader(it)) {
            if (cur.header || cur.items.length) groups.push(cur);
            cur = { header: it, items: [] };
          } else {
            cur.items.push(it);
          }
        }
        if (cur.header || cur.items.length) groups.push(cur);

        blocks.push(
          <div key={`grp-${k}`} className="socria-groups">
            {groups.map((g, gi) => (
              <div key={gi} className="socria-group">
                {g.header && (
                  <div className="socria-group-head">
                    {stripMarks(g.header).replace(/:$/, '')}
                  </div>
                )}
                {g.items.length > 0 && (
                  <ul>
                    {g.items.map((it, ii) => (
                      <li key={ii}>{renderInline(it, `grp-${k}-${gi}-${ii}`)}</li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        );
        continue;
      }

      blocks.push(
        <ul key={`ul-${k}`}>
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `ul-${k}-${ii}`)}</li>
          ))}
        </ul>
      );
      continue;
    }

    // Numbered / ordered list.
    if (ORDERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(lines[i].replace(ORDERED_RE, '$1'));
        i++;
      }
      const k = key++;
      blocks.push(
        <ol key={`ol-${k}`}>
          {items.map((it, ii) => (
            <li key={ii}>{renderInline(it, `ol-${k}-${ii}`)}</li>
          ))}
        </ol>
      );
      continue;
    }

    // Paragraph: gather until a blank line or a structural line.
    const para: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !BULLET_RE.test(lines[i]) &&
      !ORDERED_RE.test(lines[i]) &&
      !(
        lines[i].includes('|') &&
        i + 1 < lines.length &&
        TABLE_SEP_RE.test(lines[i + 1]) &&
        lines[i + 1].includes('-')
      )
    ) {
      para.push(lines[i]);
      i++;
    }
    const k = key++;
    blocks.push(<p key={`p-${k}`}>{renderInline(para.join('\n'), `p-${k}`)}</p>);
  }

  return blocks;
}

// Animated renderer for the *currently streaming* assistant bubble: every
// word becomes a span with the bubbleIn CSS entrance animation. Stable
// keys mean existing words don't replay the animation as the bubble re-
// renders — only the newly arrived word at the end pops in.
function renderAnimated(text: string): React.ReactNode {
  // First pass: split content into typed segments (plain | em) using the
  // same `*…*` rule as renderInline. (Streaming stays plain-flow — block
  // structures like lists/tables only render once persisted via renderRichText.)
  type Seg = { type: 'plain' | 'em' | 'bold'; text: string };
  const segs: Seg[] = [];
  const re = /\*\*([^*\n]+)\*\*|\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'plain', text: text.slice(last, m.index) });
    if (m[1] !== undefined) segs.push({ type: 'bold', text: m[1] });
    else segs.push({ type: 'em', text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) segs.push({ type: 'plain', text: text.slice(last) });

  // Second pass: split each segment by whitespace, keep whitespace as
  // text nodes, wrap each non-whitespace word in a `.bubble-word` span.
  // Keys are stable: `${segIndex}-${partIndex}`.
  const out: React.ReactNode[] = [];
  segs.forEach((seg, si) => {
    const parts = seg.text.split(/(\s+)/);
    parts.forEach((p, pi) => {
      if (p === '') return;
      if (/^\s+$/.test(p)) {
        out.push(p);
        return;
      }
      out.push(
        <span
          key={`${si}-${pi}`}
          className={`bubble-word${seg.type === 'em' ? ' em' : seg.type === 'bold' ? ' bold' : ''}`}
        >
          {p}
        </span>
      );
    });
  });
  return out;
}
