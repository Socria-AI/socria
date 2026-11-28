'use client';
// components/new-logos/primitives/Text.tsx — text: Markdown and mathematics, as a plain block, a note, a callout or
// an annotation pointing at another primitive. {{expression}} in the text is a live value from the shared state.
// Double-click (or Edit) to write in place.

import { useState } from 'react';
import { interpolate } from '@/lib/new-logos/compose';
import { Prose } from '../Prose';
import { Hint, type PrimProps } from './common';

export function TextPrim({ p, scope, editable, selected, run }: PrimProps<'text'>) {
  const [editing, setEditing] = useState(false);
  const body = p.data.body;
  if (editing && editable) {
    return (
      <textarea
        autoFocus
        className="nl-prim-textarea nl-cv-noDrag nl-cv-scroll"
        defaultValue={body}
        aria-label="Text (Markdown)"
        placeholder={'Write in plain text or Markdown. Maths in $…$. {{a * 2}} shows a live value.'}
        onBlur={(e) => {
          setEditing(false);
          if (e.target.value !== body) run([{ op: 'update', id: p.id, data: { body: e.target.value } }]);
        }}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Escape' || (e.key === 'Enter' && (e.metaKey || e.ctrlKey))) (e.currentTarget as HTMLTextAreaElement).blur();
        }}
      />
    );
  }
  return (
    <div className={`nl-prim-text is-${p.data.style} nl-cv-scroll`} onDoubleClick={() => editable && setEditing(true)}>
      {body.trim() ? <Prose text={p.data.live === false ? body : interpolate(body, scope)} /> : <Hint>{editable ? 'Double-click to write. Markdown; maths in $…$; {{a * 2}} shows a live value.' : 'Empty'}</Hint>}
      {editable && selected ? (
        <button type="button" className="nl-btn is-small nl-prim-edit" onClick={() => setEditing(true)}>
          Edit
        </button>
      ) : null}
    </div>
  );
}
