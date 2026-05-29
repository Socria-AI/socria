// app/chat/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';

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

const STARTER_PROMPTS = [
  'I don\u2019t know what decision to make',
  'Help me think through this idea',
  'I\u2019m stuck on what to build',
  'Challenge my reasoning',
];

function uid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function loadConversations(): Conversation[] {
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

function saveConversations(convos: Conversation[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(convos));
  } catch (e) {
    console.error('Could not save conversations:', e);
  }
}

export default function ChatPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamed, setStreamed] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Load from localStorage on mount
  useEffect(() => {
    const stored = loadConversations();
    setConversations(stored);
    const lastActive = localStorage.getItem(ACTIVE_KEY);
    if (lastActive && stored.some((c) => c.id === lastActive)) {
      setActiveId(lastActive);
    } else if (stored.length > 0) {
      setActiveId(stored[0].id);
    }
  }, []);

  // Persist active id
  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_KEY, activeId);
  }, [activeId]);

  // Scroll to bottom when messages or stream changes
  const active = conversations.find((c) => c.id === activeId);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [active?.messages.length, streamed]);

  function newSession() {
    const id = uid();
    const fresh: Conversation = {
      id,
      title: 'New thought session',
      messages: [],
      updatedAt: Date.now(),
    };
    const next = [fresh, ...conversations];
    setConversations(next);
    saveConversations(next);
    setActiveId(id);
    setSidebarOpen(false);
    setError(null);
  }

  function deleteSession(id: string) {
    if (!confirm('Delete this thought session?')) return;
    const next = conversations.filter((c) => c.id !== id);
    setConversations(next);
    saveConversations(next);
    if (activeId === id) {
      setActiveId(next.length > 0 ? next[0].id : null);
    }
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
    saveConversations(withUser);

    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);
    setStreamed('');

    try {
      const convoForRequest = withUser.find((c) => c.id === workingId)!;
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: convoForRequest.messages }),
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
      // Re-sort so most recent floats to top
      withAssistant.sort((a, b) => b.updatedAt - a.updatedAt);
      setConversations(withAssistant);
      saveConversations(withAssistant);
    } catch (e: any) {
      setError(e?.message || 'Failed to send');
      // Roll back the user message we just added
      const rolledBack = withUser.map((c) =>
        c.id === workingId
          ? { ...c, messages: c.messages.slice(0, -1) }
          : c
      );
      setConversations(rolledBack);
      saveConversations(rolledBack);
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
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside
        className={`${
          sidebarOpen ? 'flex' : 'hidden'
        } md:flex flex-col w-72 shrink-0 border-r border-border/60 h-dvh sticky top-0 bg-paper/80 backdrop-blur-sm z-20`}
      >
        <div className="px-5 h-16 flex items-center border-b border-border/60">
          <Link href="/" className="inline-flex items-baseline gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-moss-600 translate-y-[-1px]" />
            <span className="font-serif text-2xl tracking-tight text-ink">
              Socria
            </span>
          </Link>
        </div>

        <div className="p-3">
          <button
            onClick={newSession}
            className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg border border-ink/15 hover:border-moss-600 hover:bg-moss-50/40 transition-all group"
          >
            <span className="text-moss-700 text-lg leading-none">+</span>
            <span className="text-[14px] text-ink/80 group-hover:text-ink font-medium">
              New thought session
            </span>
          </button>
        </div>

        <div className="px-5 pt-2 pb-1 text-[10px] uppercase tracking-wider text-ink/40">
          Saved sessions
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {conversations.length === 0 ? (
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

        <div className="border-t border-border/60 p-4 text-[11px] text-ink/40 font-serif italic">
          Socria Core 1.0 — saved on this device
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <div className="border-b border-border/60 px-4 md:px-6 h-16 flex items-center justify-between shrink-0 bg-paper/70 backdrop-blur-sm">
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
          <span className="font-serif italic text-ink/40 text-sm hidden sm:inline">
            Socria Core 1.0
          </span>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-2xl mx-auto px-6 py-10">
            {!hasMessages && (
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
              </div>
            )}

            {messages.map((m, i) => (
              <Bubble key={i} role={m.role} content={m.content} />
            ))}

            {streamed && <Bubble role="assistant" content={streamed} />}

            {sending && !streamed && (
              <div className="my-6 flex items-center gap-1 text-ink/50">
                <span className="dot" />
                <span className="dot" />
                <span className="dot" />
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
          {content}
        </div>
      </div>
    </div>
  );
}
