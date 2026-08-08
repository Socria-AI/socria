'use client';

// Logos — conversation on the left, live Thinking Map on the right.
//
// Every user message fires two independent requests in parallel: the
// conversational reply (streamed) and a fresh map extraction. The map is
// deliberately not derived from the reply — it grows while the answer is
// still arriving, which is the whole interaction being tested here.

import { useEffect, useRef, useState } from 'react';
import { ThinkingMap } from '@/components/ThinkingMap';
import { EMPTY_MAP, type ThinkingMap as TMap } from '@/lib/logos';

type Msg = { role: 'user' | 'assistant'; content: string };

const STARTERS = [
  'I’m debating whether to build Logos now.',
  'I can’t tell if I want this career or just the idea of it.',
  'We keep shipping features but retention is flat.',
];

export default function LogosPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [map, setMap] = useState<TMap>(EMPTY_MAP);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mapRef = useRef<TMap>(EMPTY_MAP);
  mapRef.current = map;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streaming]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';

    const next = [...messages, { role: 'user' as const, content }];
    setMessages(next);
    setBusy(true);
    setStreaming('');

    // Independent pass: rebuild the map from the conversation so far.
    setMapping(true);
    void (async () => {
      try {
        const res = await fetch('/api/logos/map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: next, map: mapRef.current }),
        });
        if (res.ok) {
          const json = await res.json();
          if (json?.map) setMap(json.map);
        }
      } catch {
        // The map is allowed to lag or skip a turn — never break the chat.
      } finally {
        setMapping(false);
      }
    })();

    // Conversational reply.
    try {
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next }),
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
      setMessages([...next, { role: 'assistant', content: acc }]);
    } catch (e: any) {
      setStreaming('');
      setError(e?.message || 'Something went wrong.');
      setMessages(messages);
      setInput(content);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="logos-root">
      <div className="lg-split">
        {/* ── Conversation ───────────────────────────────── */}
        <section className="lg-convo" aria-label="Conversation">
          <header className="lg-head">
            <span className="lg-word">Logos</span>
            <span className="lg-head-note">A reasoning environment</span>
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
                <div className="lg-msg-body">{m.content}</div>
              </div>
            ))}

            {streaming && (
              <div className="lg-msg lg-msg-assistant">
                <span className="lg-msg-who">Logos</span>
                <div className="lg-msg-body">{streaming}</div>
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

          <div className="lg-composer">
            <div className="lg-composer-box">
              <textarea
                ref={taRef}
                value={input}
                rows={1}
                placeholder="What are you working through?"
                disabled={busy}
                onChange={(e) => {
                  setInput(e.target.value);
                  const el = e.target;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 160) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
              />
              <button
                type="button"
                className="lg-send"
                onClick={() => send(input)}
                disabled={!input.trim() || busy}
                aria-label="Send"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </button>
            </div>
          </div>
        </section>

        {/* ── Thinking Map ───────────────────────────────── */}
        <section className="lg-panel" aria-label="Thinking map">
          <header className="lg-panel-head">
            <span className="lg-panel-title">Thinking Map</span>
            <span className={`lg-panel-state${mapping ? ' is-working' : ''}`}>
              {mapping
                ? 'reading'
                : map.nodes.length
                  ? `${map.nodes.length} node${map.nodes.length === 1 ? '' : 's'}`
                  : 'empty'}
            </span>
          </header>
          <ThinkingMap map={map} />
        </section>
      </div>
    </div>
  );
}
