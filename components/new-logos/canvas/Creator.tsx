'use client';
// components/new-logos/canvas/Creator.tsx — making something at a place on the canvas: a question to the assistant,
// or a node of one's own (a question, knowledge, a decision, an artifact — begun from a primitive or a small model —
// an objective). Opened by a double-click on
// the empty plane or the Add button; it appears where it was asked for, and what it makes appears there too.

import { useEffect, useRef, useState } from 'react';
import type { NodeType } from '@/lib/new-logos/model';
import { STARTERS, STARTER_LABEL, type Starter } from '@/lib/new-logos/primitives';
import { Glyph, typeLabel } from '../ui';

export type Makeable = 'ask' | NodeType;

const PLACEHOLDER: Record<Makeable, string> = {
  ask: 'Ask the assistant anything',
  objective: 'What do you want to accomplish, investigate or understand?',
  conversation: 'Start a conversation',
  question: 'What is unresolved?',
  knowledge: 'What do you know, or have found?',
  decision: 'What is being decided?',
  artifact: 'What is this artifact called?',
};

export function Creator({ screen, types, onSubmit, onClose }: { screen: { x: number; y: number }; types: Makeable[]; onSubmit: (type: Makeable, text: string, starter?: Starter) => void; onClose: () => void }) {
  const [type, setType] = useState<Makeable>(types[0]);
  const [starter, setStarter] = useState<Starter>('text');
  const [text, setText] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const w = 400;
  const left = typeof window === 'undefined' ? screen.x : Math.max(12, Math.min(screen.x - 24, window.innerWidth - w - 12));
  const top = typeof window === 'undefined' ? screen.y : Math.max(60, Math.min(screen.y - 20, window.innerHeight - 240));
  const go = () => {
    const t = text.trim();
    if (t) onSubmit(type, t, type === 'artifact' ? starter : undefined);
  };
  return (
    <div ref={ref} className="nl-creator nl-cv-ui" style={{ left, top, width: `min(${w}px, calc(100vw - 24px))` }} role="dialog" aria-label="Make something here">
      <div className="nl-seg" role="group" aria-label="What to make">
        {types.map((t) => (
          <button key={t} type="button" aria-pressed={type === t} onClick={() => setType(t)}>
            {t === 'ask' ? <span aria-hidden="true">?</span> : <Glyph type={t} size={13} />}
            {t === 'ask' ? 'Ask' : typeLabel(t)}
          </button>
        ))}
      </div>
      <textarea
        autoFocus
        rows={3}
        value={text}
        placeholder={PLACEHOLDER[type]}
        aria-label={PLACEHOLDER[type]}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            go();
          }
        }}
      />
      {type === 'artifact' ? (
        <label className="nl-row nl-hint">
          <span>Begin with</span>
          <select className="nl-select" style={{ width: 'auto' }} value={starter} onChange={(e) => setStarter(e.target.value as Starter)} aria-label="What the artifact begins with">
            {STARTERS.map((k) => (
              <option key={k} value={k}>
                {STARTER_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="nl-row" style={{ justifyContent: 'flex-end' }}>
        <span className="nl-hint nl-grow">{type === 'ask' ? 'The answer appears here, on the canvas.' : type === 'artifact' ? 'Placed here; open it to compose.' : 'It is placed here.'}</span>
        <button type="button" className="nl-btn is-quiet is-small" onClick={onClose}>
          Cancel
        </button>
        <button type="button" className="nl-btn is-primary is-small" disabled={!text.trim()} onClick={go}>
          {type === 'ask' ? 'Ask' : 'Create'}
        </button>
      </div>
    </div>
  );
}
