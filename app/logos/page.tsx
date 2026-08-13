'use client';

// Logos — conversation on the left, live Thinking Map on the right.
//
// Every user message fires two independent requests in parallel: the
// conversational reply (streamed) and a fresh map extraction. The map is
// deliberately not derived from the reply — it grows while the answer is
// still arriving, which is the whole interaction being tested here.

import { useEffect, useRef, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { ThinkingMap } from '@/components/ThinkingMap';
import { ExplorePanel } from '@/components/ExplorePanel';
import { EMPTY_MAP, type ThinkingMap as TMap, type LogosNodeType } from '@/lib/logos';
import type { ExploreResult } from '@/lib/logos-explore';
import { CORE3_ACCESS_KEY, isValidAccessKey } from '@/lib/socria-prompt';

type Msg = { role: 'user' | 'assistant'; content: string };

// Shared with Core 3.1 — unlocking once covers both.
const KEY_STORAGE = 'socria.core3AccessKey.v1';

const STARTERS = [
  'I’m debating whether to build Logos now.',
  'I can’t tell if I want this career or just the idea of it.',
  'We keep shipping features but retention is flat.',
];

export default function LogosPage() {
  const { isLoaded, isSignedIn } = useUser();
  const [unlocked, setUnlocked] = useState(false);
  // Don't hang behind Clerk: if it never initializes (preview builds), fall
  // through to the key gate rather than showing nothing forever.
  const [authSettled, setAuthSettled] = useState(false);
  const [keyInput, setKeyInput] = useState('');
  const [keyError, setKeyError] = useState(false);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [map, setMap] = useState<TMap>(EMPTY_MAP);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState('');
  const [busy, setBusy] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [explore, setExplore] = useState<{
    key: string;
    node: { label: string; type: LogosNodeType } | null;
    data: ExploreResult | null;
    loading: boolean;
    error: string | null;
    open: boolean;
  }>({ key: '', node: null, data: null, loading: false, error: null, open: false });
  const exploreSeq = useRef(0);
  const exploreCache = useRef<Map<string, ExploreResult>>(new Map());
  const [exploredIds, setExploredIds] = useState<Set<string>>(new Set());

  // Each explored node keeps its own thread, so reopening it resumes rather
  // than restarts. Lives for the session only, like everything else here.
  const [threads, setThreads] = useState<Record<string, Msg[]>>({});
  const [focusStream, setFocusStream] = useState('');
  const [focusBusy, setFocusBusy] = useState(false);
  const [focusError, setFocusError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const mapRef = useRef<TMap>(EMPTY_MAP);
  mapRef.current = map;

  // Everything said anywhere, in the order it was said. The map reads from
  // this — thinking done inside a node is still thinking, and belongs in it.
  const chronRef = useRef<Msg[]>([]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, streaming]);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY_STORAGE) === '1') setUnlocked(true);
    } catch {}
    const t = setTimeout(() => setAuthSettled(true), 1200);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (isLoaded) setAuthSettled(true);
  }, [isLoaded]);

  const hasAccess = unlocked || !!isSignedIn;

  // Anonymous but key-unlocked callers identify with the header; signed-in
  // users are authorized by their session alone.
  const keyHeaders = (): Record<string, string> =>
    unlocked && !isSignedIn ? { 'x-socria-key': CORE3_ACCESS_KEY } : {};

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

  // Rebuild the map from everything said so far, wherever it was said.
  function refreshMap() {
    setMapping(true);
    void (async () => {
      try {
        const res = await fetch('/api/logos/map', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...keyHeaders() },
          body: JSON.stringify({ messages: chronRef.current, map: mapRef.current }),
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
  }

  async function openExplore(node: { id: string; label: string; type: LogosNodeType }) {
    // Generated once per node, then reused — reopening is instant and costs
    // nothing. Keyed on the label too, so a node the map rewords is treated
    // as a different idea and looked up again.
    const cacheKey = `${node.id}::${node.label}`;
    setFocusStream('');
    setFocusError(null);

    const cached = exploreCache.current.get(cacheKey);
    if (cached) {
      exploreSeq.current++; // cancel anything still in flight
      setExplore({ key: cacheKey, node, data: cached, loading: false, error: null, open: true });
      return;
    }

    const seq = ++exploreSeq.current;
    setExplore({ key: cacheKey, node, data: null, loading: true, error: null, open: true });
    try {
      const res = await fetch('/api/logos/explore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
        body: JSON.stringify({ label: node.label, type: node.type, messages }),
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

  // A turn inside an opened node. Same model, narrower aperture: it sees the
  // main conversation for context, then this node's own thread.
  async function sendFocused(text: string) {
    const content = text.trim();
    const node = explore.node;
    const key = explore.key;
    if (!content || focusBusy || !node || !key) return;

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

    // Main conversation first for context, then the focused exchange.
    const payload = [
      ...messages.slice(-8),
      ...nextThread,
    ];

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
          },
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

  async function send(text: string) {
    const content = text.trim();
    if (!content || busy) return;
    setError(null);
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';

    const turn: Msg = { role: 'user', content };
    const next = [...messages, turn];
    setMessages(next);
    chronRef.current = [...chronRef.current, turn];
    setBusy(true);
    setStreaming('');

    // Independent pass: rebuild the map from the conversation so far.
    refreshMap();

    // Conversational reply.
    try {
      const res = await fetch('/api/logos/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...keyHeaders() },
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
      chronRef.current = [...chronRef.current, { role: 'assistant', content: acc }];
    } catch (e: any) {
      setStreaming('');
      setError(e?.message || 'Something went wrong.');
      setMessages(messages);
      // Drop the turn that never landed, by identity — a focused reply may
      // have appended to the transcript while this was in flight.
      chronRef.current = chronRef.current.filter((m) => m !== turn);
      setInput(content);
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
              <span className="lg-word">Logos</span>
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
      <div className="lg-split">
        {/* ── Conversation ───────────────────────────────── */}
        <section className="lg-convo" aria-label="Conversation">
          <header className="lg-head">
            <span className="lg-word">Logos</span>
            <span className="lg-head-note">A reasoning environment</span>
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
          <ThinkingMap map={map} onExplore={openExplore} explored={exploredIds} />
          <ExplorePanel
            open={explore.open}
            loading={explore.loading}
            error={explore.error}
            node={explore.node}
            data={explore.data}
            thread={threads[explore.key] ?? []}
            streaming={focusStream}
            busy={focusBusy}
            threadError={focusError}
            onSend={sendFocused}
            onClose={() => setExplore((e) => ({ ...e, open: false }))}
          />
        </section>
      </div>
    </div>
  );
}
