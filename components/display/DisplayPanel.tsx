'use client';

// components/display/DisplayPanel.tsx — an everyday display in a workspace panel of its own.
//
// The same figure the map draws (components/objects/figures.ts), given the
// room of a panel: the plan, the table, the worksheet the person works in.
// A panel shows the display it is pinned to, or the newest one; when there
// are several, they are named along the top and any can be brought here. A
// shared line of thinking someone may only read is drawn without its
// controls — the operations are refused upstream too (LogosApp onObject).

import { useState } from 'react';
import { ObjectFigure } from '@/components/objects/ObjectFigure';
import type { AskExperience, WorkspaceAction, WorkspaceResult } from '@/components/objects/figures';
import { displayMeta, type ObjectSpace, type ThoughtObject } from '@/lib/objects';
import type { MapHistory } from '@/lib/map-history';
import { Gallery } from './Gallery';

export function DisplayPanel({
  obj,
  all,
  guarded,
  sel,
  onSelect,
  onOp,
  onSeek,
  onPick,
  readOnly,
  space,
  history,
  me,
  shared,
  onWorkspace,
  ask,
  onPrompt,
}: {
  obj: ThoughtObject | null;
  all: ThoughtObject[];
  guarded: boolean;
  sel: string | null;
  onSelect: (part: string | null) => void;
  onOp: (op: string, args: Record<string, string | number>) => { ok: boolean; why?: string };
  onSeek: (at: number) => void;
  onPick: (id: string) => void;
  readOnly?: boolean;
  space?: ObjectSpace;
  history?: MapHistory;
  me?: { id: string; name: string };
  shared?: boolean;
  onWorkspace?: (a: WorkspaceAction) => WorkspaceResult;
  ask?: AskExperience;
  /** put an example prompt into the composer, to be finished and sent there */
  onPrompt?: (text: string) => void;
}) {
  const [browsing, setBrowsing] = useState(false);
  if (!obj || browsing) {
    return (
      <div className="dsp-panel dsp-panel-empty">
        <Gallery
          onPrompt={
            onPrompt
              ? (text) => {
                  onPrompt(text);
                  setBrowsing(false);
                }
              : undefined
          }
          onClose={obj ? () => setBrowsing(false) : undefined}
        />
      </div>
    );
  }
  return (
    <div className="dsp-panel">
      <nav className="dsp-panel-pick" aria-label="Displays in this line of thinking">
        {all.length > 1 &&
          all.map((o) => {
            const title = String((o.states[o.at] as { title?: unknown } | undefined)?.title ?? o.name);
            return (
              <button key={o.id} type="button" className={o.id === obj.id ? 'is-on' : ''} aria-pressed={o.id === obj.id} onClick={() => o.id !== obj.id && onPick(o.id)}>
                <span className="dsp-panel-noun">{displayMeta(o.kind)?.noun ?? o.kind}</span> {title}
              </button>
            );
          })}
        <button type="button" className="dsp-panel-new" onClick={() => setBrowsing(true)} title="What else can be made here">
          New…
        </button>
      </nav>
      <ObjectFigure
        obj={obj}
        at={obj.at}
        mode="live"
        guarded={guarded}
        sel={sel}
        onSelect={onSelect}
        onSeek={onSeek}
        space={space}
        history={history}
        me={me}
        shared={shared}
        {...(readOnly ? {} : { onOp: (op: string, args: Record<string, string | number>) => onOp(op, args), onWorkspace, ask })}
      />
    </div>
  );
}
