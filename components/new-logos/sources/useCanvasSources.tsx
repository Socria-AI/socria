'use client';
// components/new-logos/sources/useCanvasSources.tsx — sources on a workspace canvas (a conversation's or an
// objective's), the same way on both.
//
// A source is on a canvas only when the person put it there — dragged from the library, dropped as a file, or "Place
// on canvas" — as a layout item s:<source id>: a reference to the library's record, drawn by SourceCard. Connecting it
// to a component (drag its circle onto a question, finding, decision or artifact), or dropping a source from the
// library straight onto a component, makes that component refer to it (a reference, sources.ts) — the line between
// them says "draws on". Taking it off the canvas removes the placement only.

import { useEffect, useRef, useState } from 'react';
import { placeNear, type CanvasLayout, type ItemLayout } from '@/lib/new-logos/canvas';
import { nodeRef } from '@/lib/new-logos/canvas';
import { sourceRef, usesOf } from '@/lib/new-logos/sources';
import { useNL } from '../state';
import type { CanvasLine, CanvasObject } from '../canvas/Canvas';
import { SourceCard } from './SourceCard';
import { useSources } from './state';

const SIZE = { w: 320, h: 170 };

export function useCanvasSources(o: {
  layout: CanvasLayout;
  setItem: (ref: string, patch: Partial<ItemLayout> | null) => void;
  sizeOf: (ref: string) => { w: number; h: number };
  /** the plane point at the centre of the view */
  centre: () => { x: number; y: number };
  /** the conversation files dropped here join */
  conversationId?: string;
  focusOn?: (ref: string) => void;
}) {
  const { nodes, conversations, say } = useNL();
  const { sources, refs, placements, addRef, upload, setPlacer } = useSources();
  const [dropNote, setDropNote] = useState<string | null>(null);
  const oRef = useRef(o);
  oRef.current = o;

  const place = (id: string, at: { x: number; y: number }) => {
    const ref = sourceRef(id);
    if (oRef.current.layout.items[ref]) {
      oRef.current.focusOn?.(ref);
      return;
    }
    const p = placeNear(oRef.current.layout, { x: at.x - SIZE.w / 2, y: at.y - 40 }, SIZE, oRef.current.sizeOf);
    oRef.current.setItem(ref, { x: p.x, y: p.y });
    oRef.current.focusOn?.(ref);
  };

  // while this canvas is open, the library can place a source on it (where dragging is not available)
  useEffect(() => {
    setPlacer((id) => place(id, oRef.current.centre()));
    return () => setPlacer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPlacer]);

  const placed = sources.filter((s) => o.layout.items[sourceRef(s.id)]);
  const objects: CanvasObject[] = placed.map((s) => {
    const ref = sourceRef(s.id);
    const open = !!o.layout.items[ref]?.open;
    const u = usesOf(s, refs, nodes, conversations.values(), placements);
    return {
      ref,
      width: open ? 420 : SIZE.w,
      label: `Source: ${s.name}`,
      connectable: true,
      className: 'is-source',
      content: <SourceCard source={s} open={open} usedBy={u.nodes.length} onToggle={() => o.setItem(ref, { open: !open })} onRemove={() => (o.setItem(ref, null), say(`Taken off this canvas. “${s.name}” stays in the library.`))} />,
    };
  });

  const lines = (present: Set<string>): CanvasLine[] =>
    refs
      .filter((r) => present.has(sourceRef(r.source_id)) && present.has(nodeRef(r.node_id)))
      .filter((r, i, all) => all.findIndex((x) => x.node_id === r.node_id && x.source_id === r.source_id) === i)
      .map((r) => ({ id: `src-${r.node_id}-${r.source_id}`, from: nodeRef(r.node_id), to: sourceRef(r.source_id), label: 'draws on', style: 'dotted' as const }));

  /** a connection drawn to or from a source: the component refers to it. True when it was about a source. */
  const connect = (from: string, to: string): boolean => {
    const s = from.startsWith('s:') ? from : to.startsWith('s:') ? to : null;
    if (!s) return false;
    const other = s === from ? to : from;
    if (!other.startsWith('n:')) {
      say('A source is connected to a question, finding, decision, artifact or objective. Keep an exchange as one of those first.');
      return true;
    }
    void addRef({ sourceId: s.slice(2), nodeId: other.slice(2) }).then((r) => r && say('It now refers to this source.'));
    return true;
  };

  const dropSource = (id: string, at: { x: number; y: number }, onto: string | null) => {
    if (onto && onto.startsWith('n:')) {
      void addRef({ sourceId: id, nodeId: onto.slice(2) }).then((r) => r && say('It now refers to this source.'));
      return;
    }
    place(id, at);
  };

  const dropFiles = async (files: File[], at: { x: number; y: number }) => {
    setDropNote(`Bringing in ${files.length === 1 ? files[0].name : `${files.length} files`}…`);
    const made = await upload(files, { conversationId: o.conversationId });
    setDropNote(null);
    made.forEach((s, k) => place(s.id, { x: at.x + k * 28, y: at.y + k * 28 }));
  };

  return { objects, lines, connect, dropSource, dropFiles, dropNote, place };
}
