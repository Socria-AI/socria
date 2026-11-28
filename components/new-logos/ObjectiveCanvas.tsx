'use client';
// components/new-logos/ObjectiveCanvas.tsx — AN OBJECTIVE'S WORKSPACE, AS A SPACE.
//
// The matrix (/new-logos/n/:id) organises an objective and leads in and out of it; this is where it is worked on.
// Everything the objective contains is an object on one plane — sub-objectives, conversations, questions, knowledge,
// decisions, documents — placed by hand and kept where it was put, opened and edited in place, connected by dragging
// one onto another and saying what the connection means. What is related to the objective from elsewhere appears too,
// marked as linked. Asking the assistant from the plane starts a conversation there, inside this objective, told about
// it; asking from an object starts one about that object, beside it; a conversation's own card continues it.

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RELATION_LABEL, type NodeRow, type RelationKind } from '@/lib/new-logos/model';
import { childrenOf } from '@/lib/new-logos/ops';
import { displayTitle, failureText, newConversationId, newMessage, titleFromMessage } from '@/lib/new-logos/convo';
import { DEFAULT_SIZE, excerpt, factLines, nodeRef, placeMissing, placeNear } from '@/lib/new-logos/canvas';
import { useNL } from './state';
import { starterComposition, type Starter } from '@/lib/new-logos/primitives';
import { artifactFacts } from '@/lib/new-logos/context';
import { askMessage, reply, saveAsk, type About } from './ask';
import { Omnibox } from './sources/Omnibox';
import { mentionContext } from './sources/mentions';
import { useCanvasSources } from './sources/useCanvasSources';
import { useSources } from './sources/state';
import { Canvas, type CanvasLine, type CanvasObject } from './canvas/Canvas';
import { CardFrame, ConversationCard, NodeCard } from './canvas/Cards';
import { Creator, type Makeable } from './canvas/Creator';
import { ConnectChooser, WorkspaceFrame } from './canvas/Frame';
import { useCanvasLayout } from './canvas/useLayout';
import { Crumbs, InlineText, typeLabel } from './ui';
import { useWorkspace } from './engine/useWorkspace';
import { mentionsOf, mergeAbout } from './sources/mentions';

const W = { closed: 290, open: 440, doc: 620, conv: 480 };

export function ObjectiveCanvas({ id }: { id: string }) {
  const { loaded, nodes, relations, conversations, setup, appendTurns, createNode, link, nodeAction, say } = useNL();
  const { sources, passages } = useSources();
  const objective = nodes.find((n) => n.id === id && n.type === 'objective');
  const L = useCanvasLayout(objective ? `o:${id}` : null);
  const [selected, setSelected] = useState<string | null>(null);
  const [creator, setCreator] = useState<{ at: { x: number; y: number }; screen: { x: number; y: number } } | null>(null);
  const [connecting, setConnecting] = useState<{ from: string; to: string; screen: { x: number; y: number } } | null>(null);
  const [streams, setStreams] = useState<Record<string, { ask: string; text: string }>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<{ at: { x: number; y: number }; text: string } | null>(null);
  const [focus, setFocus] = useState<{ ref: string; nonce: number } | null>(null);
  const busy = !!pending || Object.keys(streams).length > 0;
  const measured = useRef<Record<string, { w: number; h: number }>>({});
  // this objective's own components (thoughts, tables, models…), grouped, connected, transformed — the same layer as a
  // conversation's space; a question asked here starts a conversation in it
  const thinkRef = useRef<(text: string, about: About | undefined, refs: string[]) => void>(() => {});
  const WS = useWorkspace({
    wsKey: `o:${id}`,
    enabled: !!objective && setup !== false,
    container: id,
    L,
    measured,
    think: (t, a, r) => thinkRef.current(t, a, r),
    setFocus,
    openHistory: () => {},
    busy,
    working: pending ? { text: 'Starting a conversation about it' } : null,
  });

  const members = useMemo(() => (objective ? childrenOf(nodes, id) : []), [nodes, id, objective]);
  const linked = useMemo(() => {
    if (!objective) return [];
    const ids = new Set(members.map((m) => m.id));
    const out: NodeRow[] = [];
    for (const r of relations) {
      const other = r.from_id === id ? r.to_id : r.to_id === id ? r.from_id : null;
      const n = other ? nodes.find((x) => x.id === other && x.archived_at === null) : undefined;
      if (n && !ids.has(n.id) && !out.some((o) => o.id === n.id)) out.push(n);
    }
    return out;
  }, [relations, nodes, id, members, objective]);

  useEffect(() => {
    if (objective) document.title = `${objective.title} · Workspace`;
  }, [objective]);

  const widthOf = useCallback(
    (n: NodeRow) => {
      const open = !!L.layout.items[nodeRef(n.id)]?.open;
      if (!open) return W.closed;
      return n.type === 'artifact' ? W.doc : n.type === 'conversation' ? W.conv : W.open;
    },
    [L.layout.items]
  );
  const all = useMemo(() => [...members, ...linked], [members, linked]);
  const sizeOf = useCallback(
    (ref: string) => {
      if (ref.startsWith('r:')) return WS.sizeOf(ref);
      const n = all.find((x) => nodeRef(x.id) === ref);
      return measured.current[ref] ?? { w: n ? widthOf(n) : W.closed, h: L.layout.items[ref]?.open ? 440 : DEFAULT_SIZE.h };
    },
    [all, widthOf, L.layout.items, WS]
  );
  const layout = useMemo(() => (L.loaded ? placeMissing(L.layout, all.map((n) => ({ ref: nodeRef(n.id) })), sizeOf) : L.layout), [L.loaded, L.layout, all, sizeOf]);
  useEffect(() => {
    if (!L.loaded) return;
    const fresh = Object.keys(layout.items).filter((r) => !L.layout.items[r]);
    if (fresh.length) L.setItems(Object.fromEntries(fresh.map((r) => [r, layout.items[r]])));
  }, [L, layout]);

  // ── sources placed here (a reference to the library's record each) ──
  const centre = () => {
    const v = layout.view ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, k: 1 };
    return { x: (window.innerWidth / 2 - v.x) / v.k, y: (window.innerHeight / 2 - 48 - v.y) / v.k };
  };
  const src = useCanvasSources({ layout, setItem: L.setItem, sizeOf, centre, focusOn: (ref) => setFocus({ ref, nonce: Date.now() }) });

  // ── asking ──
  const deps = { appendTurns, placed: true, passages: (q: { docIds: string[]; query: string }) => passages(q) };
  const aboutNode = (n: NodeRow): About => {
    const c = n.content as Record<string, unknown>;
    return {
      label: n.type === 'conversation' ? displayTitle(conversations.get(n.conversation_id ?? '')?.title) : n.title,
      of: `the objective “${objective?.title ?? ''}”`,
      lines: n.type === 'artifact' ? artifactFacts(n) : [`A ${typeLabel(n.type).toLowerCase()}${n.type === 'decision' || n.type === 'question' ? ` (${n.state})` : ''}`, ...factLines(String(c.body ?? c.rationale ?? c.outcome ?? n.description ?? ''), 6)],
    };
  };

  /** A new conversation in this objective, begun with `text`, placed at a point or beside an object. */
  async function askNew(text: string, opts: { at?: { x: number; y: number }; from?: string; about?: About; attachments?: unknown[]; sourceIds?: string[] }) {
    if (busy || !objective) return;
    const convId = newConversationId();
    const mine = askMessage(text, opts.about, Date.now(), opts.attachments);
    const at = opts.at
      ? placeNear(layout, opts.at, { w: W.conv, h: 460 }, sizeOf)
      : opts.from
        ? placeMissing(layout, [{ ref: 'n:pending', near: opts.from }], (r) => (r === 'n:pending' ? { w: W.conv, h: 460 } : sizeOf(r))).items['n:pending']
        : { x: 0, y: 0 };
    setPending({ at, text });
    const saved = await saveAsk(deps, convId, mine, { title: titleFromMessage(text) });
    if (!saved.ok) {
      setPending(null);
      return say(saved.note);
    }
    const placed = await createNode({ type: 'conversation', conversationId: convId, parentId: id });
    setPending(null);
    if (!placed.ok || !placed.node) return say(placed.error ?? 'The conversation was started but could not be placed here.');
    const ref = nodeRef(placed.node.id);
    L.setItem(ref, { x: Math.round(at.x), y: Math.round(at.y), open: true, ...(opts.from ? { from: opts.from } : {}) });
    setFocus({ ref, nonce: Date.now() });
    // the conversation's first turn: a representation of it (its card shows it), as on the conversation's own canvas
    const res = await fetch('/api/new-logos/represent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ conversationId: convId, message: { id: mine.id, content: mine.content }, history: [], ...(opts.about ? { about: opts.about } : {}), sourceIds: opts.sourceIds ?? [] }),
    }).catch(() => null);
    const j = res ? await res.json().catch(() => null) : null;
    if (res?.ok && j?.ok) {
      await appendTurns(convId, [newMessage('assistant', String(j.record ?? ''), Date.now())]);
      return;
    }
    // before the representations' table exists: answered as before
    if (j?.setup === false) return void (await stream(convId, text, [mine], opts.about));
    setNotes((n) => ({ ...n, [convId]: typeof j?.error === 'string' && j.error ? j.error : failureText(res?.status ?? 0) }));
  }
  thinkRef.current = (t, a, r) => {
    const srcRefs = r.filter((x) => x.startsWith('s:'));
    const asMentions = mentionsOf(r, sources, nodes);
    void (asMentions.length ? mentionContext(asMentions, t, { sources, nodes, passages }) : Promise.resolve({ attachments: [] as unknown[], about: undefined as About | undefined })).then((ctx) =>
      askNew(t, { at: centre(), about: mergeAbout(a, ctx.about), attachments: ctx.attachments, sourceIds: srcRefs.map((x) => x.slice(2)) })
    );
  };

  /** Continue a conversation that is on this canvas. */
  async function askIn(n: NodeRow, text: string) {
    const convId = n.conversation_id;
    const conv = convId ? conversations.get(convId) : undefined;
    if (busy || !convId || !conv) return;
    const mine = askMessage(text, undefined, Date.now());
    setStreams((s) => ({ ...s, [convId]: { ask: text, text: '' } }));
    const saved = await saveAsk(deps, convId, mine);
    if (!saved.ok) {
      setStreams((s) => {
        const next = { ...s };
        delete next[convId];
        return next;
      });
      return say(saved.note);
    }
    await stream(convId, text, [...conv.messages, mine], undefined);
  }

  async function stream(convId: string, text: string, hist: Parameters<typeof reply>[2], about: About | undefined) {
    setNotes((n) => {
      const next = { ...n };
      delete next[convId];
      return next;
    });
    setStreams((s) => ({ ...s, [convId]: { ask: text, text: '' } }));
    const res = await reply(deps, convId, hist, about, (t) => setStreams((s) => ({ ...s, [convId]: { ask: text, text: t } })));
    setStreams((s) => {
      const next = { ...s };
      delete next[convId];
      return next;
    });
    if (!res.ok) setNotes((n) => ({ ...n, [convId]: res.note }));
  }

  async function createAt(type: Makeable, text: string, at: { x: number; y: number }, starter: Starter = 'text') {
    setCreator(null);
    if (type === 'ask') return void askNew(text, { at });
    const r = await createNode({ type, title: text, parentId: id, ...(type === 'artifact' ? { content: starterComposition(starter) } : {}) });
    if (!r.ok || !r.node) return say(r.error ?? null);
    L.setItem(nodeRef(r.node.id), { ...placeNear(layout, at, { w: type === 'artifact' ? W.doc : W.open, h: 360 }, sizeOf), open: type !== 'objective' });
  }

  const openCreatorAtCentre = () => {
    const v = layout.view ?? { x: window.innerWidth / 2, y: window.innerHeight / 2, k: 1 };
    const sx = window.innerWidth / 2, sy = window.innerHeight / 2;
    setCreator({ at: { x: (sx - v.x) / v.k, y: (sy - 48 - v.y) / v.k }, screen: { x: sx - 180, y: sy - 80 } });
  };

  if (!loaded) return <main className="nl-page"><p className="nl-hint">Loading…</p></main>;
  if (setup === false || !objective)
    return (
      <main className="nl-page is-narrow">
        <Crumbs nodes={nodes} at={null} current="Not found" />
        <div className="nl-empty">This objective does not exist, or it is not on this account.</div>
      </main>
    );

  // ── what is drawn ──
  const card = (n: NodeRow, isLinked: boolean): CanvasObject => {
    const ref = nodeRef(n.id);
    const open = !!layout.items[ref]?.open;
    const toggle = () => L.setItem(ref, { open: !open });
    if (n.type === 'conversation') {
      const convId = n.conversation_id ?? '';
      return {
        ref,
        width: widthOf(n),
        label: `Conversation: ${displayTitle(conversations.get(convId)?.title)}`,
        connectable: true,
        content: <ConversationCard node={n} conv={conversations.get(convId)} open={open} onToggle={toggle} streaming={streams[convId] ?? null} note={notes[convId] ?? null} busy={busy} onAsk={(t) => void askIn(n, t)} />,
      };
    }
    return {
      ref,
      width: widthOf(n),
      label: `${typeLabel(n.type)}: ${n.title}`,
      connectable: true,
      className: isLinked ? 'is-linked' : undefined,
      content: <NodeCard node={n} open={open} linked={isLinked} busy={busy} onToggle={toggle} onAsk={(t) => void askNew(t, { from: ref, about: aboutNode(n) })} />,
    };
  };
  const objects: CanvasObject[] = [
    ...WS.objects,
    ...[...members.map((n) => card(n, false)), ...linked.map((n) => card(n, true))].filter((o) => !WS.hidden.has(o.ref)).map((o) => ({ ...o, className: `${o.className ?? ''} ${WS.classOf(o.ref)}` })),
  ];
  if (pending) {
    objects.push({
      ref: 'n:pending',
      width: W.conv,
      label: 'A new conversation, starting',
      content: (
        <CardFrame type="conversation" kicker="Conversation · starting" title={excerpt(pending.text, 120)} open onToggle={() => {}}>
          <div className="nl-card-body">
            <p className="nl-hint nl-typing">Starting</p>
          </div>
        </CardFrame>
      ),
    });
  }
  const withTiles = { ...layout, items: { ...layout.items, ...WS.tilePlaces } };
  const shown = pending ? { ...withTiles, items: { ...withTiles.items, 'n:pending': { x: pending.at.x, y: pending.at.y, open: true } } } : withTiles;
  objects.push(...src.objects.filter((o) => !WS.hidden.has(o.ref)).map((o) => ({ ...o, className: `${o.className ?? ''} ${WS.classOf(o.ref)}` })));
  const present = new Set(objects.map((o) => o.ref));
  const lines: CanvasLine[] = [
    ...WS.lines,
    ...src.lines(present),
    ...relations
      .filter((r) => present.has(nodeRef(r.from_id)) && present.has(nodeRef(r.to_id)))
      .map((r) => ({ id: r.id, from: nodeRef(r.from_id), to: nodeRef(r.to_id), label: RELATION_LABEL[r.kind], style: 'solid' as const })),
    ...Object.entries(shown.items)
      .filter(([ref, it]) => it.from && present.has(ref) && present.has(it.from))
      .map(([ref, it]) => ({ id: `from-${ref}`, from: it.from as string, to: ref, label: 'asked about', style: 'dashed' as const })),
  ];

  return (
    <WorkspaceFrame
      omnibox={
        <Omnibox
          placeholder="Ask about this objective, or say what to do. / for commands, @ to point at anything"
          busy={busy}
          onAsk={(t, m) => WS.submit(t, m)}
          onMake={openCreatorAtCentre}
          extra={WS.mentionables}
          slash={WS.slash}
          pointing={WS.pointing}
          onUnpoint={WS.unpoint}
        />
      }
      header={
        <>
          <Crumbs nodes={nodes} at={objective.parent_id} current={objective.title} />
          <div className="nl-row nl-ws-title">
            <InlineText
              value={objective.title}
              label="Objective"
              className="nl-ws-title-input"
              onSave={async (t) => {
                const r = await nodeAction(id, 'update', { title: t });
                if (!r.ok) say(r.error ?? null);
              }}
            />
          </div>
          <div className="nl-row nl-hint">
            {objective.content.outcome ? <span>Outcome: {String(objective.content.outcome)}</span> : <span>Objective</span>}
            <Link className="nl-btn is-quiet is-small" href={`/new-logos/n/${encodeURIComponent(id)}`}>
              Its matrix
            </Link>
          </div>
        </>
      }
    >
      {L.loaded ? (
        <Canvas
          objects={objects}
          lines={lines}
          layout={shown}
          selected={WS.primary ?? selected}
          onSelect={(ref) => (setSelected(ref), WS.select(ref ? [ref] : []))}
          onMove={(ref, x, y) => (ref.startsWith('r:') || ref.startsWith('g:') ? WS.onMove(ref, x, y) : ref !== 'n:pending' && L.setItem(ref, { x, y }))}
          onView={L.setView}
          onCreateAt={(at, screen) => setCreator({ at, screen })}
          onDropSource={src.dropSource}
          onDropFiles={(files, at) => void src.dropFiles(files, at)}
          onConnect={(from, to) => {
            if (src.connect(from, to)) return;
            if (from === 'n:pending' || to === 'n:pending') return;
            const el = document.querySelector(`[data-ref="${CSS.escape(to)}"]`)?.getBoundingClientRect();
            setConnecting({ from, to, screen: { x: el ? el.left : window.innerWidth / 2, y: el ? el.top : window.innerHeight / 2 } });
          }}
          focus={focus}
          onSizes={(s) => (measured.current = s)}
          {...WS.canvasProps}
          empty={
            <div>
              <p>This objective’s workspace is empty.</p>
              <p className="nl-hint">Ask in the box below, or double-click anywhere to ask or to put down a question, knowledge, a decision, an artifact or a sub-objective there. Sources stay in the library, bottom left, until you place or mention one.</p>
            </div>
          }
        />
      ) : (
        <p className="nl-hint" style={{ padding: 24 }}>
          Loading…
        </p>
      )}
      {WS.overlays}
      {creator ? <Creator screen={creator.screen} types={['ask', 'question', 'knowledge', 'decision', 'artifact', 'objective']} onClose={() => setCreator(null)} onSubmit={(t, text, starter) => void createAt(t, text, creator.at, starter)} /> : null}
      {connecting ? (
        <ConnectChooser
          screen={connecting.screen}
          onClose={() => setConnecting(null)}
          onPick={async (kind: RelationKind) => {
            const c = connecting;
            setConnecting(null);
            const r = await link(c.from.slice(2), c.to.slice(2), kind);
            if (!r.ok) say(r.error ?? null);
          }}
        />
      ) : null}
    </WorkspaceFrame>
  );
}
