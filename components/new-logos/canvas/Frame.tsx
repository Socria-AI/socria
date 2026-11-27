'use client';
// components/new-logos/canvas/Frame.tsx — what surrounds a canvas: the canvas fills the window under the top bar;
// a small floating header says where you are (breadcrumbs, title) and offers the few things a workspace needs; an
// Add button makes something without a double-click (touch, keyboard); a chooser names a connection once it is drawn.
// Nothing here is a fixed panel: the header floats and the side drawer opens only when asked.

import type { ReactNode } from 'react';
import { RELATION_KINDS, RELATION_LABEL, type RelationKind } from '@/lib/new-logos/model';

export function WorkspaceFrame({ header, tools, children, drawer, onAdd }: { header: ReactNode; tools?: ReactNode; children: ReactNode; drawer?: ReactNode; onAdd?: () => void }) {
  return (
    <main className="nl-ws">
      {children}
      <div className="nl-ws-head nl-cv-ui">{header}</div>
      {tools ? <div className="nl-ws-tools nl-cv-ui">{tools}</div> : null}
      {onAdd ? (
        <button type="button" className="nl-btn is-primary nl-ws-add nl-cv-ui" onClick={onAdd}>
          + Add
        </button>
      ) : null}
      {drawer}
    </main>
  );
}

/** What a newly drawn connection means. */
export function ConnectChooser({ screen, onPick, onClose }: { screen: { x: number; y: number }; onPick: (kind: RelationKind) => void; onClose: () => void }) {
  const left = typeof window === 'undefined' ? screen.x : Math.max(12, Math.min(screen.x, window.innerWidth - 232));
  const top = typeof window === 'undefined' ? screen.y : Math.max(60, Math.min(screen.y, window.innerHeight - 340));
  return (
    <div className="nl-creator nl-cv-ui" style={{ left, top, width: 220 }} role="dialog" aria-label="What does this connection mean?">
      <div className="nl-label">This one…</div>
      <div className="nl-pick">
        {RELATION_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => onPick(k)}>
            <span>{RELATION_LABEL[k]}</span>
          </button>
        ))}
      </div>
      <button type="button" className="nl-btn is-quiet is-small" onClick={onClose}>
        Cancel
      </button>
    </div>
  );
}
