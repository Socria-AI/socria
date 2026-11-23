'use client';
// components/ux-v0/design/Chat.tsx — the conversation with the designer, beside the canvas.
//
// Everything is asked here in words: a first design, a change, three directions, other formats. What the designer
// says arrives as it writes; a question comes with its choices as buttons; what could not be done is shown under the
// turn that tried. The selected element is shown above the composer, so "this" is visible before it is sent.

import { useEffect, useRef, useState } from 'react';
import type { DesignTurn } from '@/lib/ux-v0/design/doc';

export interface ChatProps {
  turns: DesignTurn[];
  busy: null | { phase: 'writing' | 'looking' | 'fixing'; say: string; started: number };
  selection: { label: string } | null;
  error: string | null;
  draft: string;
  onDraft: (v: string) => void;
  onSend: (words: string) => void;
  onCancel: () => void;
  onClearSelection: () => void;
  onAttach: (files: FileList) => void;
  onQuick: (kind: 'variations' | 'formats' | 'better') => void;
  hasArtboards: boolean;
  signedIn: boolean;
}

const PHASE: Record<string, string> = { writing: 'Designing', looking: 'Looking at the result', fixing: 'Correcting what it saw' };

export function Chat(p: ChatProps) {
  const list = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight, behavior: 'smooth' });
  }, [p.turns.length, p.busy?.say, p.busy?.phase]);
  useEffect(() => {
    if (!p.busy) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [p.busy]);
  useEffect(() => {
    if (p.draft && input.current && document.activeElement !== input.current) input.current.focus();
  }, [p.draft]);
  const last = p.turns[p.turns.length - 1];
  const send = () => {
    const w = p.draft.trim();
    if (!w || p.busy) return;
    p.onSend(w);
  };
  return (
    <section className="dx-chat" aria-label="Conversation">
      <div ref={list} className="dx-turns">
        {!p.turns.length && !p.busy && (
          <div className="dx-empty">
            <p className="dx-empty-h">What are we making?</p>
            <p className="dx-muted">Describe it in your own words — the subject, the words that must appear, how it should feel, where it will be seen. You can add pictures.</p>
          </div>
        )}
        {p.turns.map((t) => (
          <div key={t.id} className={`dx-turn is-${t.role}`}>
            {t.selection?.label && t.role === 'person' && <span className="dx-turn-sel">on {t.selection.label}</span>}
            <p>{t.text}</p>
            {t.failed?.length ? (
              <ul className="dx-failed">
                {t.failed.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            ) : null}
            {t.options?.length && t === last && !p.busy ? (
              <div className="dx-options">
                {t.options.map((o) => (
                  <button key={o} type="button" className="dx-btn" onClick={() => p.onSend(o)}>
                    {o}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {p.busy && (
          <div className="dx-turn is-designer is-live" aria-live="polite">
            <span className="dx-phase">
              <i className="dx-dot" />
              {PHASE[p.busy.phase]} · {Math.max(0, Math.round((now - p.busy.started) / 1000))} s
            </span>
            {p.busy.say && <p>{p.busy.say}</p>}
          </div>
        )}
        {p.error && <p className="dx-error">{p.error}</p>}
      </div>
      <div className="dx-compose">
        {p.selection && (
          <div className="dx-chip">
            Editing {p.selection.label}
            <button type="button" onClick={p.onClearSelection} aria-label="Clear the selection">
              ×
            </button>
          </div>
        )}
        {p.hasArtboards && !p.busy && (
          <div className="dx-quick">
            <button type="button" onClick={() => p.onQuick('variations')}>
              Three directions
            </button>
            <button type="button" onClick={() => p.onQuick('formats')}>
              Other formats
            </button>
            <button type="button" onClick={() => p.onQuick('better')}>
              Push it further
            </button>
          </div>
        )}
        <textarea
          ref={input}
          className="dx-input"
          value={p.draft}
          rows={3}
          placeholder={!p.signedIn ? 'Sign in to design with SocriaUX.' : p.hasArtboards ? (p.selection ? 'Say what to change about the selection…' : 'Say what to change, or ask for something new…') : 'A poster for… / a logo for… / a campaign for…'}
          onChange={(e) => p.onDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          disabled={!p.signedIn}
        />
        <div className="dx-compose-row">
          <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml" multiple hidden onChange={(e) => e.target.files?.length && (p.onAttach(e.target.files), (e.target.value = ''))} />
          <button type="button" className="dx-btn dx-ghost" onClick={() => file.current?.click()} disabled={!p.signedIn}>
            Add pictures
          </button>
          {p.busy ? (
            <button type="button" className="dx-btn" onClick={p.onCancel}>
              Stop
            </button>
          ) : (
            <button type="button" className="dx-btn dx-primary" onClick={send} disabled={!p.draft.trim() || !p.signedIn}>
              Send
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
