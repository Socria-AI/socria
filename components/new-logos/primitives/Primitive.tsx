'use client';
// components/new-logos/primitives/Primitive.tsx — one primitive, drawn from its data by the renderer for its type,
// inside a frame that says what it is. The same drawing serves the artifact's own canvas (where it is moved and
// resized) and an artifact embedded on another canvas or page (where it is used and edited in place): rendering is
// independent of where it appears.

import type { ArtifactOp } from '@/lib/new-logos/artifact-ops';
import type { Scope } from '@/lib/new-logos/compose';
import { PRIMITIVE_LABEL, type Composition, type Primitive } from '@/lib/new-logos/primitives';
import { BoardPrim } from './Board';
import { ControlPrim } from './Control';
import { EquationPrim } from './Equation';
import { MediaPrim } from './Media';
import { PlotPrim } from './Plot';
import { TablePrim } from './Table';
import { TextPrim } from './Text';
import { PrimGlyph } from './common';

export interface BodyProps {
  p: Primitive;
  comp: Composition;
  scope: Scope;
  editable: boolean;
  selected: boolean;
  run: (ops: ArtifactOp[]) => void;
}

export function PrimitiveBody(props: BodyProps) {
  const { p } = props;
  switch (p.type) {
    case 'text':
      return <TextPrim {...props} p={p} />;
    case 'equation':
      return <EquationPrim {...props} p={p} />;
    case 'control':
      return <ControlPrim {...props} p={p} />;
    case 'plot':
      return <PlotPrim {...props} p={p} />;
    case 'table':
      return <TablePrim {...props} p={p} />;
    case 'graph':
      return <BoardPrim {...props} p={p} />;
    case 'diagram':
      return <BoardPrim {...props} p={p} />;
    case 'media':
      return <MediaPrim {...props} p={p} />;
  }
}

/** The frame: a quiet head naming it (the handle it is moved by, where it can be moved), then the primitive. */
export function PrimitiveFrame({ head, ...props }: BodyProps & { head?: 'drag' | 'plain' | 'none'; related?: boolean }) {
  const { p, selected } = props;
  const name = p.label || PRIMITIVE_LABEL[p.type];
  return (
    <div className={`nl-prim is-${p.type}${selected ? ' is-selected' : ''}${props.related ? ' is-related' : ''}${p.type === 'text' ? ` is-text-${p.data.style}` : ''}`}>
      {head !== 'none' ? (
        <div className="nl-prim-head" {...(head === 'drag' ? { 'data-drag': true, title: 'Drag to move' } : {})}>
          <PrimGlyph type={p.type} size={12} />
          <span className="nl-prim-name">{name}</span>
        </div>
      ) : null}
      <div className="nl-prim-body">
        <PrimitiveBody {...props} />
      </div>
    </div>
  );
}
