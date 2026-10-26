'use client';
// components/logos5/ModelTools.tsx — A MODEL'S OWN TOOLS, INSIDE ITS ARTIFACT.
//
// A model's parameters, its inspector and its history used to be panels of
// their own, docked beside whatever view was open (Split View's "Parameters",
// "Inspector", "Trace"). They are the model's: here they open beside the model,
// inside its card in Artifacts, one at a time — so Split View holds only the
// views themselves (lib/logos5/views.ts splitMenu).

import type { ReactNode } from 'react';
import type { ModelTool } from '@/lib/logos5/views';

export const MODEL_TOOLS: readonly { id: ModelTool; label: string; says: string }[] = [
  { id: 'params', label: 'Parameters', says: 'its controls and inputs' },
  { id: 'inspector', label: 'Inspector', says: 'the part selected' },
  { id: 'trace', label: 'History', says: 'every change, to step back through' },
];

/** The model, with its tools beside it when one is open. */
export function ModelArtifact({ model, tool, onTool, renderTool }: { model: ReactNode; tool: ModelTool | null; onTool: (t: ModelTool | null) => void; renderTool: (t: ModelTool) => ReactNode }) {
  const open = MODEL_TOOLS.find((t) => t.id === tool) ?? null;
  return (
    <div className={`l5m-art${open ? ' has-tool' : ''}`}>
      <div className="l5m-tools" role="toolbar" aria-label="The model’s tools">
        {MODEL_TOOLS.map((t) => (
          <button key={t.id} type="button" className={`l5m-tool${tool === t.id ? ' is-on' : ''}`} aria-pressed={tool === t.id} title={t.says} onClick={() => onTool(tool === t.id ? null : t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      <div className="l5m-body">
        <div className="l5m-model">{model}</div>
        {open && (
          <aside className="l5m-side" aria-label={open.label}>
            <div className="l5m-side-head">
              <span>{open.label}</span>
              <button type="button" className="l5m-x" aria-label={`Close ${open.label}`} onClick={() => onTool(null)}>
                ×
              </button>
            </div>
            <div className="l5m-side-body">{renderTool(open.id)}</div>
          </aside>
        )}
      </div>
    </div>
  );
}
