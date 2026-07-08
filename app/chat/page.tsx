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
import { DepthPicker } from '@/components/DepthPicker';
import { TryCore3Pill } from '@/components/TryCore3Pill';
import { Core3IntroModal } from '@/components/Core3IntroModal';
import { InsightCard } from '@/components/InsightCard';
import { InsightShareModal } from '@/components/InsightShareModal';
import { SynthesisCard, SynthesisPending } from '@/components/SynthesisCard';
import { parseMessage } from '@/lib/synthesis';
import type { Insight } from '@/lib/socria-prompt';

// Core 3 auto-generates an Insight Card once the conversation has passed
// this many user turns, and only if we haven't shown one in the last
// INSIGHT_MIN_GAP turns.
const INSIGHT_MIN_USER_TURNS = 6;
const INSIGHT_MIN_GAP = 3;

const CORE3_INTRO_DISMISS_KEY = 'socria.core3IntroDontShowAgain.v1';
import {
  SOCRIA_MODELS,
  EMPTY_MEMORY,
  type SocriaModel,
  type ThinkingDepth,
  type ConversationMemory,
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
const MODEL_KEY = 'socria.model.v1';
const DEPTH_KEY = 'socria.depth.v1';

function readModel(): SocriaModel {
  if (typeof window === 'undefined') return 'core-2';
  try {
    const raw = localStorage.getItem(MODEL_KEY);
    return raw === 'core-3' ? 'core-3' : 'core-2';
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
  const [core3ModalOpen, setCore3ModalOpen] = useState(false);
  const [core3Dismissed, setCore3Dismissed] = useState(false);
  const [autoOpenChecked, setAutoOpenChecked] = useState(false);
  const [shareInsight, setShareInsight] = useState<Insight | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const mode: 'cloud' | 'local' = isSignedIn ? 'cloud' : 'local';

  // Anonymous users get one free thought session. They're "locked out" of
  // starting a new one once that flag is set OR they're already mid-session.
  const lockedOut =
    !isSignedIn && (usedFree || conversations.length >= 1);

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
          const list: Conversation[] = json.conversations || [];
          setConversations(list);
          setActiveId(list[0]?.id ?? null);
        } catch (e: any) {
          if (!cancelled) setError(e?.message || 'Failed to load conversations');
        }
      } else {
        const stored = loadLocal();
        if (cancelled) return;
        setConversations(stored);
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
  }, []);
  // Anonymous users may have a Core 3 selection saved from a previous
  // signed-in session — downgrade to Core 2 until they sign in again so
  // the API gate doesn't bounce every message they send.
  useEffect(() => {
    if (!isLoaded) return;
    if (!isSignedIn && SOCRIA_MODELS[model].requiresAuth) {
      setModel('core-2');
      try {
        localStorage.setItem(MODEL_KEY, 'core-2');
      } catch {}
    }
  }, [isLoaded, isSignedIn, model]);
  function pickModel(next: SocriaModel) {
    if (SOCRIA_MODELS[next].requiresAuth && !isSignedIn) {
      router.push('/sign-in?redirect_url=/chat');
      return;
    }
    setModel(next);
    try {
      localStorage.setItem(MODEL_KEY, next);
    } catch {}
  }
  function pickDepth(next: ThinkingDepth) {
    setDepth(next);
    try {
      localStorage.setItem(DEPTH_KEY, next);
    } catch {}
  }

  // Auto-open the Core 3 intro modal once per mount, unless the user has
  // permanently dismissed it or is already using Core 3.
  useEffect(() => {
    if (!isLoaded || autoOpenChecked) return;
    setAutoOpenChecked(true);
    try {
      const dismissed =
        localStorage.getItem(CORE3_INTRO_DISMISS_KEY) === '1';
      setCore3Dismissed(dismissed);
      const currentModel = localStorage.getItem(MODEL_KEY);
      if (!dismissed && currentModel !== 'core-3') {
        setCore3ModalOpen(true);
      }
    } catch {}
  }, [isLoaded, autoOpenChecked]);

  function handleCore3ModalClose(dontShowAgain: boolean) {
    if (dontShowAgain) {
      try {
        localStorage.setItem(CORE3_INTRO_DISMISS_KEY, '1');
      } catch {}
      setCore3Dismissed(true);
    }
    setCore3ModalOpen(false);
  }

  function handleCore3ModalTry() {
    // Signed-in users trying it means they've discovered it — no need to
    // nudge them again. Anon users get redirected to sign-in without a
    // permanent dismiss so the modal returns for them once they come back.
    if (isSignedIn) {
      try {
        localStorage.setItem(CORE3_INTRO_DISMISS_KEY, '1');
      } catch {}
      setCore3Dismissed(true);
    }
    setCore3ModalOpen(false);
    pickModel('core-3');
  }

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
        headers: { 'Content-Type': 'application/json' },
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
        headers: { 'Content-Type': 'application/json' },
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
    if (!isSignedIn && !activeId && (usedFree || conversations.length >= 1)) {
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: convoForRequest.messages,
          model,
          depth,
          memory: convoForRequest.memory ?? EMPTY_MEMORY,
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
      if (isSignedIn && model === 'core-3') {
        void extractAndPersistMemory(workingId!, updated);
        // Also consider generating an Insight Card. Runs in parallel and
        // dedupes internally against the memory turn markers.
        void maybeGenerateInsight(workingId!, updated);
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

  const messages = active?.messages || [];
  const hasMessages = messages.length > 0;

  return (
    <div className="flex h-dvh">
      <Core3IntroModal
        open={core3ModalOpen}
        onClose={handleCore3ModalClose}
        onTry={handleCore3ModalTry}
        isSignedIn={!!isSignedIn}
      />
      <InsightShareModal
        open={!!shareInsight}
        onClose={() => setShareInsight(null)}
        insight={shareInsight}
      />
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'flex' : 'hidden'
        } md:flex flex-col w-72 shrink-0 border-r border-border/60 h-dvh sticky top-0 bg-paper/80 backdrop-blur-sm z-20`}
      >
        <div className="px-5 h-16 flex items-center border-b border-border/60">
          <Logo />
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
          ) : conversations.length === 0 ? (
            <p className="px-3 py-2 text-xs text-ink/40 font-serif italic">
              No sessions yet. Start one.
            </p>
          ) : (
            conversations.map((c) => {
              const isActive = c.id === activeId;
              return (
                <div
                  key={c.id}
                  className={`group flex items-center justify-between px-3 py-2 rounded-md text-[13px] transition-colors cursor-pointer ${
                    isActive
                      ? 'bg-moss-50 text-ink'
                      : 'text-ink/70 hover:bg-ink/5 hover:text-ink'
                  }`}
                  onClick={() => {
                    setActiveId(c.id);
                    setSidebarOpen(false);
                  }}
                >
                  <span className="truncate flex-1">{c.title}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(c.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 text-ink/40 hover:text-ink ml-2 px-1 transition-opacity"
                    aria-label="Delete"
                  >
                    ×
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div className="border-t border-border/60 p-4">
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
        <div className="sticky top-0 z-20 border-b border-border/60 px-4 md:px-6 h-16 flex items-center justify-between shrink-0 bg-paper/85 backdrop-blur-md">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="md:hidden text-ink/70 hover:text-ink p-2 -ml-2"
            aria-label="Toggle sidebar"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink/50">
            Thought session
          </span>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-3">
              <ModelPicker
                value={model}
                onChange={pickModel}
                isSignedIn={!!isSignedIn}
                onLockedAttempt={() => router.push('/sign-in?redirect_url=/chat')}
              />
              {SOCRIA_MODELS[model].supportsDepth && (
                <DepthPicker value={depth} onChange={pickDepth} />
              )}
              <TryCore3Pill
                currentModel={model}
                visible={!core3Dismissed}
                onOpen={() => setCore3ModalOpen(true)}
              />
            </div>
            <SignedOut>
              <SignInButton >
                <button className="text-[13px] text-ink/70 hover:text-ink transition-colors">
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
            {!hasMessages && !isSignedIn && usedFree ? (
              // Anon user who used their free convo but has no active one
              // (either never created another or deleted the first). Hard
              // gate: no starter prompts, just a sign-in CTA.
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
                  {STARTER_PROMPTS.map((p) => (
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

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}

            {streamed && (
              <Bubble role="assistant" content={streamed} animate />
            )}

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
            {!isSignedIn && hasMessages && (
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
            <p className="mt-2 text-[11px] text-ink/40 text-center font-serif italic">
              Socria asks. You think. Press Enter to send, Shift+Enter for a new line.
            </p>
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
              {animate ? renderAnimated(seg.text) : renderEmphasis(seg.text)}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Static renderer for persisted assistant messages. Wraps single-asterisk
// `*emphasis*` runs in italic moss serif and leaves the rest as plain text.
function renderEmphasis(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const re = /\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push(
      <em
        key={key++}
        className="font-serif italic text-moss-700 text-[1.18em] leading-[1]"
        style={{ fontStyle: 'italic' }}
      >
        {m[1]}
      </em>
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

// Animated renderer for the *currently streaming* assistant bubble: every
// word becomes a span with the bubbleIn CSS entrance animation. Stable
// keys mean existing words don't replay the animation as the bubble re-
// renders — only the newly arrived word at the end pops in.
function renderAnimated(text: string): React.ReactNode {
  // First pass: split content into typed segments (plain | em) using the
  // same `*…*` rule as renderEmphasis.
  type Seg = { type: 'plain' | 'em'; text: string };
  const segs: Seg[] = [];
  const re = /\*([^*\n]+)\*/g;
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) segs.push({ type: 'plain', text: text.slice(last, m.index) });
    segs.push({ type: 'em', text: m[1] });
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
          className={`bubble-word${seg.type === 'em' ? ' em' : ''}`}
        >
          {p}
        </span>
      );
    });
  });
  return out;
}
