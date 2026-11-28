'use client';
// components/new-logos/sources/Omnibox.tsx — THE OMNIBOX: one floating line at the bottom centre of a canvas, for asking
// the assistant from where you are. Typing @ searches the workspace — sources in the library, artifacts, findings,
// questions, decisions, objectives, conversations — and choosing one attaches it to what is being written, shown as a
// small removable mark above the line ("@Business Plan.pdf ×"); deleting its words removes it too, and the marks are
// always exactly what will be sent. A source mentioned brings the passages that bear on the
// question (never the whole document); a component mentioned brings what it says. Files can be brought in from here
// too: they go to the library and are attached to the question, and nothing is put on the canvas. The + makes a
// question, finding, decision or artifact on the canvas instead.

import { useEffect, useMemo, useRef, useState } from 'react';
import { displayTitle } from '@/lib/new-logos/convo';
import { matchMentions, type Mentionable } from '@/lib/new-logos/sources';
import { TYPE_LABEL } from '@/lib/new-logos/model';
import { useNL } from '../state';
import { useSources } from './state';

export type Mention = Mentionable;
/** a mark above the line: `typed` when it was chosen after an @ (it lives in the words: delete them and it goes),
 *  not when a file brought in was attached (it has no words: only its × removes it) */
type Attached = Mention & { typed?: boolean };

const KIND_WORD = (k: Mention['kind']) => (k === 'source' ? 'Source' : TYPE_LABEL[k].one);
/** what is being typed after an @, up to the caret */
const atQuery = (text: string, caret: number) => /(^|\s)@([^\s@]{0,40})$/.exec(text.slice(0, caret));
const atLabel = (m: Mention) => `@${m.label.replace(/\s+/g, ' ')}`;

export function Omnibox({
  placeholder,
  busy,
  onAsk,
  onMake,
  conversationId,
  autoFocus,
}: {
  placeholder: string;
  busy?: boolean;
  onAsk: (text: string, mentions: Mention[]) => void;
  onMake?: () => void;
  /** the conversation files brought in here join */
  conversationId?: string;
  autoFocus?: boolean;
}) {
  const { nodes, conversations } = useNL();
  const { sources, upload } = useSources();
  const [text, setText] = useState('');
  const [mentions, setMentions] = useState<Attached[]>([]);
  const [q, setQ] = useState<string | null>(null);
  const [hi, setHi] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const everything = useMemo<Mention[]>(() => {
    const out: Mention[] = sources.map((s) => ({ kind: 'source' as const, id: s.id, label: s.name, hint: 'Source' }));
    for (const n of nodes) {
      if (n.archived_at !== null) continue;
      if (n.type === 'conversation') {
        const c = n.conversation_id ? conversations.get(n.conversation_id) : undefined;
        if (c) out.push({ kind: 'conversation', id: n.id, label: displayTitle(c.title), hint: 'Conversation' });
        continue;
      }
      out.push({ kind: n.type, id: n.id, label: n.title, hint: TYPE_LABEL[n.type].one });
    }
    return out;
  }, [sources, nodes, conversations]);
  const found = q === null ? [] : matchMentions(everything.filter((m) => !mentions.some((x) => x.id === m.id)), q, 7);

  useEffect(() => setHi(0), [q]);
  // the line grows with what is written, to a few lines
  useEffect(() => {
    const el = area.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }, [text]);

  const choose = (m: Mention) => {
    const el = area.current;
    const caret = el?.selectionStart ?? text.length;
    const hit = atQuery(text, caret);
    if (!hit) return;
    const start = caret - hit[2].length - 1;
    const label = m.label.replace(/\s+/g, ' ');
    const next = `${text.slice(0, start)}@${label} ${text.slice(caret)}`;
    setText(next);
    setMentions((all) => [...all, { ...m, typed: true }]);
    setQ(null);
    window.setTimeout(() => {
      el?.focus();
      const at = start + label.length + 2;
      el?.setSelectionRange(at, at);
    }, 0);
  };

  const send = () => {
    const t = text.trim();
    if (!t || busy) return;
    // what travels is exactly what the marks above the line show
    onAsk(
      t,
      mentions.map((m) => ({ kind: m.kind, id: m.id, label: m.label, hint: m.hint }))
    );
    setText('');
    setMentions([]);
    setQ(null);
  };

  const bring = async (files: FileList | null) => {
    const list = files ? [...files] : [];
    if (!list.length) return;
    const made = await upload(list, { conversationId });
    if (made.length) setMentions((all) => [...all, ...made.filter((s) => !all.some((m) => m.id === s.id)).map((s) => ({ kind: 'source' as const, id: s.id, label: s.name, hint: 'Source' }))]);
  };

  return (
    <div className="nl-omni nl-cv-ui" role="group" aria-label="Ask">
      {q !== null && found.length ? (
        <ul className="nl-omni-found" role="listbox" aria-label="Mention">
          {found.map((m, k) => (
            <li key={`${m.kind}-${m.id}`} role="option" aria-selected={k === hi}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => choose(m)} className={k === hi ? 'is-hi' : ''}>
                <span className="nl-omni-kind">{KIND_WORD(m.kind)}</span>
                <span className="nl-omni-label">{m.label}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {mentions.length ? (
        <div className="nl-omni-chips" aria-label="Attached">
          {mentions.map((m) => (
            <span key={`${m.kind}-${m.id}`} className="nl-omni-chip">
              <span className="nl-omni-kind">{KIND_WORD(m.kind)}</span>@{m.label}
              <button type="button" aria-label={`Remove ${m.label}`} onClick={() => setMentions((all) => all.filter((x) => x.id !== m.id))}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <div className="nl-omni-line">
        {onMake ? (
          <button type="button" className="nl-icon-btn" aria-label="Make something on the canvas" title="Make a question, finding, decision or artifact" onClick={onMake}>
            +
          </button>
        ) : null}
        <textarea
          ref={area}
          rows={1}
          autoFocus={autoFocus}
          value={text}
          placeholder={placeholder}
          aria-label={placeholder}
          aria-autocomplete="list"
          onChange={(e) => {
            const value = e.target.value;
            setText(value);
            // a mention whose words were deleted goes with them
            setMentions((all) => (all.some((m) => m.typed && !value.includes(atLabel(m))) ? all.filter((m) => !m.typed || value.includes(atLabel(m))) : all));
            const hit = atQuery(e.target.value, e.target.selectionStart ?? e.target.value.length);
            setQ(hit ? hit[2] : null);
          }}
          onKeyDown={(e) => {
            if (q !== null && found.length) {
              if (e.key === 'ArrowDown') return (e.preventDefault(), setHi((hi + 1) % found.length));
              if (e.key === 'ArrowUp') return (e.preventDefault(), setHi((hi - 1 + found.length) % found.length));
              if (e.key === 'Enter' || e.key === 'Tab') return (e.preventDefault(), choose(found[hi]));
              if (e.key === 'Escape') return (e.preventDefault(), e.stopPropagation(), setQ(null));
            }
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          onBlur={() => window.setTimeout(() => setQ(null), 120)}
        />
        <button type="button" className="nl-icon-btn" aria-label="Bring in files" title="Bring files into the library and attach them here" onClick={() => fileRef.current?.click()}>
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true">
            <path d="M10.5 4.5 5.8 9.2a1.6 1.6 0 0 0 2.3 2.3l5-5a3 3 0 0 0-4.3-4.3l-5.2 5.2a4.3 4.3 0 0 0 6.1 6.1L13 10.2" strokeLinecap="round" />
          </svg>
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => (void bring(e.target.files), (e.target.value = ''))} />
        <button type="button" className="nl-btn is-primary is-small" disabled={busy || !text.trim()} onClick={send}>
          Ask
        </button>
      </div>
    </div>
  );
}
