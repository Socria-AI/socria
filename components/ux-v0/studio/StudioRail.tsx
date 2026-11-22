'use client';
// components/ux-v0/studio/StudioRail.tsx — the conversation, carried into the workspace.
//
// A work begun in the studio keeps its conversation beside it: everything said and decided, and a place to keep
// talking. What is said here goes to the workspace's own way of taking words (a change to a graphic or a board in
// words, a refinement of a page, a question on a critique), and what the workspace answers is kept in the same
// transcript, so the conversation reads as one from the first sentence to the latest change. On the left, where the
// conversation began; docked on wide screens (the workspace moves aside for it), over the work on narrow ones; it can
// be put away and brought back. While it is open it is the one place to type: the workspace's own ask bars step back.

import { useEffect, useRef, useState } from 'react';
import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { said } from '@/lib/ux-v0/studio/schema';
import type { DiscoveryEnv } from '@/lib/ux-v0/studio/discovery';
import { modeInfo } from '@/lib/ux-v0/studio/modes';
import { DesignContext } from './DesignContext';
import { ArrowUp, Chat, Close, ModeGlyph } from './glyphs';

const KEY = 'socriaux.studio.rail';
/** Open by default on a wide screen when the work came out of the conversation; put away when the person chose to
 * work directly (the brief written by hand, or a critique, whose own cards are its conversation). The person's own
 * choice, once made, is kept. */
/** Wide enough for the work to keep its room beside the rail (below it, the rail opens over the left side). */
export const DOCK_WIDTH = 1280;
const readOpen = (byDefault: boolean) => {
  const wide = typeof window !== 'undefined' && window.innerWidth >= DOCK_WIDTH;
  try {
    const v = window.localStorage.getItem(KEY);
    return v ? v === 'open' : byDefault && wide;
  } catch {
    return byDefault && wide;
  }
};

/** Waiting for a workspace to answer: resolved by the next thing it says (a note, a preview), or nothing after a while. */
export function useRailReply<T>(signal: T | null, textOf: (s: T) => string | null) {
  const waiting = useRef<((s: string | null) => void) | null>(null);
  const latest = useRef(textOf);
  latest.current = textOf;
  useEffect(() => {
    if (!signal || !waiting.current) return;
    const t = latest.current(signal);
    if (!t) return;
    const done = waiting.current;
    waiting.current = null;
    done(t);
  }, [signal]);
  return (ms = 6000) =>
    new Promise<string | null>((res) => {
      waiting.current?.(null);
      waiting.current = res;
      window.setTimeout(() => {
        if (waiting.current === res) {
          waiting.current = null;
          res(null);
        }
      }, ms);
    });
}

export function StudioRail({ studio, onStudio, onAsk, placeholder, env = {}, systemName, onOpenChange }: { studio: StudioState; onStudio: (fn: (s: StudioState) => StudioState) => void; onAsk: (words: string) => Promise<string | null>; placeholder: string; env?: DiscoveryEnv; systemName?: string | null; /** told whether the rail is open (the workspace's own ask bar steps back while it is) */ onOpenChange?: (open: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'talk' | 'decisions'>('talk');
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const info = modeInfo(studio.mode);

  useEffect(() => setOpen(readOpen(studio.via !== 'hand' && studio.mode !== 'critique')), []); // eslint-disable-line react-hooks/exhaustive-deps
  // the workspace moves aside while the rail is docked
  useEffect(() => {
    document.body.classList.toggle('sd-railed', open);
    onOpenChange?.(open);
    return () => document.body.classList.remove('sd-railed');
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!open || tab !== 'talk') return;
    end.current?.scrollIntoView({ block: 'end' });
  }, [studio.transcript.length, open, tab]);

  const toggle = (v: boolean) => {
    setOpen(v);
    try {
      window.localStorage.setItem(KEY, v ? 'open' : 'closed');
    } catch {
      /* the choice lasts the visit */
    }
  };

  const send = async () => {
    const w = words.trim();
    if (!w || busy) return;
    setWords('');
    setBusy(true);
    onStudio((s) => said(s, { from: 'person', kind: 'reply', text: w }));
    try {
      const r = await onAsk(w);
      if (r) onStudio((s) => said(s, { from: 'socria', kind: 'reply', text: r.slice(0, 1200) }));
    } finally {
      setBusy(false);
    }
  };

  if (!open)
    return (
      <button type="button" className="sd-rail-tab" onClick={() => toggle(true)} aria-label="Show the conversation" aria-expanded={false}>
        <Chat size={16} />
        <span>Conversation</span>
      </button>
    );

  return (
    <aside className="sb sd sd-rail" aria-label="The conversation">
      <div className="sd-rail-head">
        <p className="sd-rail-t">
          <ModeGlyph mode={studio.mode} size={16} />
          <span>{info.label}</span>
          {systemName ? <span className="sd-rail-sys">in {systemName}</span> : null}
        </p>
        <span className="sb-seg is-tight" role="tablist" aria-label="Conversation">
          <button type="button" role="tab" aria-selected={tab === 'talk'} className={`sb-seg-item${tab === 'talk' ? ' is-on' : ''}`} onClick={() => setTab('talk')}>
            Talk
          </button>
          <button type="button" role="tab" aria-selected={tab === 'decisions'} className={`sb-seg-item${tab === 'decisions' ? ' is-on' : ''}`} onClick={() => setTab('decisions')}>
            Decisions
          </button>
        </span>
        <button type="button" className="sd-icon" onClick={() => toggle(false)} aria-label="Put the conversation away">
          <Close size={16} />
        </button>
      </div>
      {tab === 'talk' ? (
        <div className="sd-rail-body">
          <ol className="sd-transcript is-compact" aria-label="Everything said">
            {studio.transcript.map((m) => (
              <li key={m.id} className={`sd-msg is-${m.from} k-${m.kind}`}>
                {m.from === 'person' ? (
                  <div className="sd-bubble">
                    <p>{m.text}</p>
                  </div>
                ) : (
                  <p className={m.kind === 'question' ? 'sd-said-q' : 'sd-said'}>{m.text}</p>
                )}
              </li>
            ))}
            {busy && (
              <li className="sd-msg is-socria">
                <p className="sd-said is-wait">Working it out…</p>
              </li>
            )}
          </ol>
          <div ref={end} />
        </div>
      ) : (
        <div className="sd-rail-body">
          <DesignContext st={studio} env={env} systemName={systemName} title="Decided in the conversation" />
          <p className="sd-rail-note">To change any of it now, say so in words: the change is made in the workspace and kept here.</p>
        </div>
      )}
      <form
        className="sd-rail-reply"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <label htmlFor="sd-rail-in" className="v0-sr">
          Say what to change
        </label>
        <textarea
          id="sd-rail-in"
          rows={2}
          value={words}
          placeholder={placeholder}
          onChange={(e) => setWords(e.target.value.slice(0, 1200))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              void send();
            }
          }}
        />
        <button type="submit" className="sd-send" disabled={!words.trim() || busy} aria-label="Send">
          <ArrowUp size={16} />
        </button>
      </form>
    </aside>
  );
}
