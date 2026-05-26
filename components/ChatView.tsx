// components/ChatView.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Message } from '@/lib/types';

interface Props {
  conversationId: string;
  initialMessages: Message[];
}

const STARTER_PROMPTS = [
  'I don\u2019t know what decision to make',
  'Help me think through this idea',
  'I\u2019m stuck on what to build',
  'Challenge my reasoning',
];

export function ChatView({ conversationId, initialMessages }: Props) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [streamedAssistant, setStreamedAssistant] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamedAssistant]);

  // Auto-resize textarea
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

    // Optimistic user message
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      conversation_id: conversationId,
      role: 'user',
      content: text,
      created_at: new Date().toISOString(),
    };
    setMessages((m) => [...m, tempUserMsg]);
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setSending(true);
    setStreamedAssistant('');

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          content: text,
        }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'Something went wrong');
      }

      // Stream the response
      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          assistantText += chunk;
          setStreamedAssistant(assistantText);
        }
      }

      // Replace temp + add assistant message; refresh to pick up real IDs/titles
      setStreamedAssistant('');
      setMessages((m) => [
        ...m,
        {
          id: `assistant-${Date.now()}`,
          conversation_id: conversationId,
          role: 'assistant',
          content: assistantText,
          created_at: new Date().toISOString(),
        },
      ]);
      // Re-fetch the sidebar (title may have updated on first message)
      router.refresh();
    } catch (e: any) {
      setError(e?.message || 'Failed to send');
      // Roll back optimistic message
      setMessages((m) => m.filter((x) => x.id !== tempUserMsg.id));
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

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-dvh">
      {/* Header */}
      <div className="border-b border-border/60 px-6 h-16 flex items-center justify-between shrink-0 bg-paper/70 backdrop-blur-sm">
        <span className="text-[11px] uppercase tracking-[0.18em] text-ink/50">
          Thought session
        </span>
        <span className="font-serif italic text-ink/40 text-sm">
          Socria Core 1.0
        </span>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-6 py-10">
          {!hasMessages && (
            <div className="text-center mt-12 animate-fade-up">
              <h2 className="font-serif text-3xl md:text-4xl text-ink leading-tight">
                What would you like to think through?
              </h2>
              <p className="mt-3 text-ink/60 font-serif italic">
                Bring a question, a draft, or a decision. Socria will ask, not
                answer for you.
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

          {messages.map((m) => (
            <MessageBubble key={m.id} role={m.role} content={m.content} />
          ))}

          {streamedAssistant && (
            <MessageBubble role="assistant" content={streamedAssistant} />
          )}

          {sending && !streamedAssistant && (
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

      {/* Composer */}
      <div className="border-t border-border/60 bg-paper/80 backdrop-blur-sm">
        <div className="max-w-2xl mx-auto px-6 py-4">
          <div className="flex items-end gap-3 rounded-2xl border border-ink/15 bg-white px-4 py-3 focus-within:border-moss-600 transition-colors shadow-[0_1px_0_rgba(0,0,0,0.02)]">
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
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
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
  );
}

function MessageBubble({
  role,
  content,
}: {
  role: 'user' | 'assistant' | 'system';
  content: string;
}) {
  if (role === 'system') return null;
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
        <div
          className={`prose-socria ${
            isUser ? 'text-ink' : 'text-ink/90 text-[15.5px]'
          }`}
        >
          {content}
        </div>
      </div>
    </div>
  );
}
