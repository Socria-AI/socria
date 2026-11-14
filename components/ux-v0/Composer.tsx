'use client';
// components/ux-v0/Composer.tsx — commenting on the design, not chatting.
//
// The house composer (components/logos5/l5-controls.css .l5-compose): a ruled
// line to write on, the line above it saying what the words are about — the
// selected element, the card being replied to, the question being answered,
// the brief — and Send as the surface's one filled control.

import { useEffect, useRef } from 'react';

export type ComposeMode = 'ask' | 'change';

interface Props {
  guide: React.ReactNode;
  onClearGuide?: () => void;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  onSend: () => void;
  busy: boolean;
  disabled?: boolean;
  modes?: { value: ComposeMode; onChange: (m: ComposeMode) => void } | null;
  foot?: React.ReactNode;
  sendLabel?: string;
}

export function Composer(p: Props) {
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const t = area.current;
    if (!t) return;
    t.style.height = 'auto';
    t.style.height = `${Math.min(140, t.scrollHeight)}px`;
  }, [p.value]);
  const canSend = !!p.value.trim() && !p.busy && !p.disabled;
  return (
    <div className="v0-band">
      <div className="l5-compose v0-compose">
        <div className="l5-compose-guide v0-guide">
          <span className="l5-dot" aria-hidden="true" />
          <span className="v0-guide-text">{p.guide}</span>
          {p.onClearGuide && (
            <button type="button" className="l5-link is-meta" onClick={p.onClearGuide}>
              Clear
            </button>
          )}
          {p.modes && (
            <span className="v0-modes l5-tabs is-tight" role="radiogroup" aria-label="What the comment does">
              <button type="button" role="radio" aria-checked={p.modes.value === 'ask'} className={`l5-tab${p.modes.value === 'ask' ? ' is-on' : ''}`} onClick={() => p.modes!.onChange('ask')}>
                Ask
              </button>
              <button type="button" role="radio" aria-checked={p.modes.value === 'change'} className={`l5-tab${p.modes.value === 'change' ? ' is-on' : ''}`} onClick={() => p.modes!.onChange('change')}>
                Change
              </button>
            </span>
          )}
        </div>
        <div className="l5-compose-line">
          <textarea
            ref={area}
            rows={1}
            value={p.value}
            placeholder={p.placeholder}
            aria-label={p.placeholder}
            onChange={(e) => p.onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (canSend) p.onSend();
              }
            }}
            disabled={p.disabled}
          />
          <button type="button" className="l5-btn is-primary" onClick={p.onSend} disabled={!canSend}>
            {p.busy ? 'Working…' : p.sendLabel ?? 'Send'}
          </button>
        </div>
        {p.foot && <div className="l5-compose-foot v0-foot">{p.foot}</div>}
      </div>
    </div>
  );
}
