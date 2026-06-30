// app/chat/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  SignedIn,
  SignedOut,
  SignInButton,
  UserButton,
  useClerk,
  useUser,
} from '@clerk/nextjs';
import { Logo } from '@/components/Logo';
import { ModelPicker } from '@/components/ModelPicker';
import { DepthPicker } from '@/components/DepthPicker';
import {
  SOCRIA_MODELS,
  type SocriaModel,
  type ThinkingDepth,
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
  const { openSignIn } = useClerk();
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
  function pickModel(next: SocriaModel) {
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

  // Scroll to bottom when messages or stream changes
  const active = conversations.find((c) => c.id === activeId);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, streamed]);

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
      openSignIn({});
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
      openSignIn({});
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
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          assistantText += decoder.decode(value, { stream: true });
          setStreamed(assistantText);
        }
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
              <UserButton afterSignOutUrl="/chat" />
              <div className="text-[11px] text-ink/50 font-serif italic leading-tight">
                Synced across your devices
              </div>
            </div>
          </SignedIn>
          <SignedOut>
            <SignInButton mode="modal">
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
              <ModelPicker value={model} onChange={pickModel} />
              {SOCRIA_MODELS[model].supportsDepth && (
                <DepthPicker value={depth} onChange={pickDepth} />
              )}
            </div>
            <SignedOut>
              <SignInButton mode="modal">
                <button className="text-[13px] text-ink/70 hover:text-ink transition-colors">
                  Sign in
                </button>
              </SignInButton>
            </SignedOut>
            <SignedIn>
              <UserButton afterSignOutUrl="/chat" />
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
                <SignInButton mode="modal">
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
                    <SignInButton mode="modal">
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

            {streamed && <Bubble role="assistant" content={streamed} />}

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
                <SignInButton mode="modal">
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

function Bubble({ role, content }: { role: Role; content: string }) {
  const isUser = role === 'user';
  return (
    <div className={`my-6 flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? 'bg-moss-50 border border-moss-200/60 rounded-2xl rounded-br-md px-5 py-3'
            : ''
        }`}
      >
        {!isUser && (
          <div className="text-[10px] uppercase tracking-[0.16em] text-moss-700 mb-1.5 font-medium">
            Socria
          </div>
        )}
        <div className={`prose-socria ${isUser ? 'text-ink' : 'text-ink/90 text-[15.5px]'}`}>
          {isUser ? content : renderEmphasis(content)}
        </div>
      </div>
    </div>
  );
}

// Parse single-asterisk `*emphasis*` runs and render them as italic
// Instrument Serif in the brand green. Anything outside asterisks renders
// as plain text. Streaming-safe: a dangling `*` at the end of the buffer
// (mid-token) is rendered literally until the closing `*` arrives.
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
