'use client';

// components/display/KeptFigure.tsx — AN ELEMENT KEPT FROM THE CONVERSATION, drawn.
//
// The same component the conversation drew it with (components/inline/InlineUI.tsx),
// opened at the state the person left it in, and still theirs to change: what
// they do with it here is kept with it (lib/objects/display-kept.ts, op
// "state"). Above it, where it came from — the reply it was in and when — so a
// kept graph is never a picture with no story.

import { InlineBlock, type InlineHost } from '@/components/inline/InlineUI';
import { Inline } from '@/components/RichText';
import { keptName, type KeptState } from '@/lib/objects/display-kept';
import type { FigureProps } from '@/components/objects/figures';
import { DisplayShell, useDisplay } from './DisplayShell';
import './kept.css';

export function KeptFigure(p: FigureProps) {
  const d = useDisplay<KeptState>(p);
  const s = d.state;
  if (p.mode !== 'live')
    return (
      <DisplayShell p={p} d={d}>
        {null}
      </DisplayShell>
    );
  const when = s.from.at ? new Date(s.from.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';
  const host: InlineHost = {
    state: s.ui ? { 0: s.ui } : {},
    live: d.live,
    ...(d.live ? { onState: (_n: number, st) => void d.act('state', { state: JSON.stringify(st) }) } : {}),
  };
  return (
    <DisplayShell p={p} d={d} aside={keptName(s.spec)}>
      <p className="kp-from">
        Kept from the conversation
        {s.from.said ? <> — <q>{s.from.said}</q></> : null}
        {when ? <span className="kp-when"> · {when}</span> : null}
      </p>
      <div className="kp-body">
        <InlineBlock spec={s.spec} open={false} n={0} host={host} renderInline={(t, k) => <Inline text={t} math keyBase={`kp-${k}`} />} />
      </div>
    </DisplayShell>
  );
}
