'use client';

// components/display/DisplayPanel.tsx — an everyday display in a workspace panel of its own.
//
// The same figure the map draws (components/objects/figures.ts), given the
// room of a panel: the plan, the table, the worksheet the person works in.
// A panel shows the display it is pinned to, or the newest one; when there
// are several, they are named along the top and any can be brought here. A
// shared line of thinking someone may only read is drawn without its
// controls — the operations are refused upstream too (LogosApp onObject).

import { ObjectFigure } from '@/components/objects/ObjectFigure';
import { displayMeta, type ThoughtObject } from '@/lib/objects';

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
}) {
  if (!obj) {
    return (
      <div className="dsp-panel dsp-panel-empty">
        <p className="dsp-empty">
          No display yet. Ask for one in the conversation — “make me a study plan for finals”, “put these options in a comparison table”, “turn this map into a
          checklist” — and it opens here, yours to change.
        </p>
      </div>
    );
  }
  return (
    <div className="dsp-panel">
      {all.length > 1 && (
        <nav className="dsp-panel-pick" aria-label="Displays in this line of thinking">
          {all.map((o) => {
            const title = String((o.states[o.at] as { title?: unknown } | undefined)?.title ?? o.name);
            return (
              <button key={o.id} type="button" className={o.id === obj.id ? 'is-on' : ''} aria-pressed={o.id === obj.id} onClick={() => o.id !== obj.id && onPick(o.id)}>
                <span className="dsp-panel-noun">{displayMeta(o.kind)?.noun ?? o.kind}</span> {title}
              </button>
            );
          })}
        </nav>
      )}
      <ObjectFigure
        obj={obj}
        at={obj.at}
        mode="live"
        guarded={guarded}
        sel={sel}
        onSelect={onSelect}
        onSeek={onSeek}
        {...(readOnly ? {} : { onOp: (op: string, args: Record<string, string | number>) => onOp(op, args) })}
      />
    </div>
  );
}
