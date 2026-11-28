'use client';
// components/new-logos/engine/useEngine.ts — RUNNING THE OPERATION ENGINE'S PLANS in a workspace, and undoing them.
//
// Whatever asked for a change — the Smart Omnibox (plain English or a / command), the floating toolbar, the context
// menu, a keyboard shortcut, a drag on the canvas, or the assistant — it arrives here as a plan
// (lib/new-logos/engine/commands.ts) and is run the same way, as ONE change:
//   1. the layout (positions, groups) — applied at once, its exact inverse kept;
//   2. the components — sent through the validated route (the same pure operations run on the server);
//   3. nodes — a new workspace, a node renamed, archived or connected — through their own routes;
//   4. the interface — selection, focus, filter, navigation, the library, inspection.
// If a part fails, the parts already made are reversed, so a compound change happens whole or not at all. Every change
// is recorded with how to reverse it (and to make it again): undo and redo walk that record, newest first; "undo
// everything I just did" reverses the person's latest burst. Nothing here writes to storage but through those routes.

import { useCallback, useRef, useState } from 'react';
import { invertPatch, type LayoutPatch } from '@/lib/new-logos/groups';
import type { CanvasLayout } from '@/lib/new-logos/canvas';
import type { NodeIntent, Plan, UiIntent } from '@/lib/new-logos/engine/commands';
import type { RepApi } from '../represent/useRepresentation';

type Part =
  | { kind: 'layout'; undo: LayoutPatch; redo: LayoutPatch }
  | { kind: 'rep'; entry: string }
  | { kind: 'node-create'; id: string }
  | { kind: 'node-archive'; id: string }
  | { kind: 'node-rename'; id: string; before: string; after: string }
  | { kind: 'node-link'; id: string; from: string; to: string; relation: string }
  | { kind: 'node-unlinked'; from: string; to: string; relation: string };

export interface Txn {
  label: string;
  at: number;
  by: 'person' | 'ai';
  parts: Part[];
}

export interface EngineDeps {
  R: Pick<RepApi, 'change' | 'undo'>;
  layout: { apply: (p: LayoutPatch) => void; current: () => CanvasLayout };
  nodes: {
    create: (type: 'objective', title: string) => Promise<{ ok: boolean; id?: string; error?: string }>;
    action: (id: string, action: 'archive' | 'restore' | 'update', fields?: Record<string, unknown>) => Promise<{ ok: boolean; error?: string }>;
    link: (from: string, to: string, kind: string) => Promise<{ ok: boolean; id?: string; error?: string }>;
    unlink: (from: string, to: string) => Promise<{ ok: boolean; error?: string }>;
    titleOf: (id: string) => string;
  };
  ui: (intent: UiIntent) => void;
  /** an analytical transformation: a question for the intelligence layer about these objects */
  ask: (text: string, refs: string[]) => void;
}

export interface RunResult {
  ok: boolean;
  label?: string;
  /** the change was recorded (it can be undone) */
  recorded?: boolean;
  error?: string;
  /** waiting for a yes (destructive or consequential) */
  confirm?: string;
}

const BURST_MS = 180_000;

export function useEngine(deps: EngineDeps) {
  const done = useRef<Txn[]>([]);
  const undone = useRef<Txn[]>([]);
  const [, setTick] = useState(0);
  const bump = () => setTick((t) => t + 1);
  const d = useRef(deps);
  d.current = deps;

  /** reverse one part; what to record to make it again */
  const reverse = async (p: Part): Promise<Part | null> => {
    const x = d.current;
    switch (p.kind) {
      case 'layout':
        x.layout.apply(p.undo);
        return { kind: 'layout', undo: p.redo, redo: p.undo };
      case 'rep': {
        const r = await x.R.undo(p.entry);
        return r.ok && r.entry ? { kind: 'rep', entry: r.entry } : null;
      }
      case 'node-create': {
        const r = await x.nodes.action(p.id, 'archive');
        return r.ok ? { kind: 'node-archive', id: p.id } : null;
      }
      case 'node-archive': {
        const r = await x.nodes.action(p.id, 'restore');
        return r.ok ? { kind: 'node-create', id: p.id } : null;
      }
      case 'node-rename': {
        const r = await x.nodes.action(p.id, 'update', { title: p.before });
        return r.ok ? { kind: 'node-rename', id: p.id, before: p.after, after: p.before } : null;
      }
      case 'node-link': {
        const r = await x.nodes.unlink(p.from, p.to);
        return r.ok ? { kind: 'node-unlinked', from: p.from, to: p.to, relation: p.relation } : null;
      }
      case 'node-unlinked': {
        const r = await x.nodes.link(p.from, p.to, p.relation);
        return r.ok ? { kind: 'node-link', id: r.id ?? '', from: p.from, to: p.to, relation: p.relation } : null;
      }
    }
  };

  const runNodes = async (intents: NodeIntent[], parts: Part[], after: (() => void)[]): Promise<string | null> => {
    const x = d.current;
    for (const n of intents) {
      if (n.do === 'create') {
        const r = await x.nodes.create(n.type, n.title);
        if (!r.ok || !r.id) return r.error ?? 'Not made.';
        parts.push({ kind: 'node-create', id: r.id });
        if (n.then === 'navigate') after.push(() => x.ui({ do: 'navigate', href: `/new-logos/w/${encodeURIComponent(r.id as string)}` }));
      } else if (n.do === 'archive') {
        const r = await x.nodes.action(n.id, 'archive');
        if (!r.ok) return r.error ?? 'Not archived.';
        parts.push({ kind: 'node-archive', id: n.id });
      } else if (n.do === 'rename') {
        const before = x.nodes.titleOf(n.id);
        const r = await x.nodes.action(n.id, 'update', { title: n.title });
        if (!r.ok) return r.error ?? 'Not renamed.';
        parts.push({ kind: 'node-rename', id: n.id, before, after: n.title });
      } else if (n.do === 'link') {
        const r = await x.nodes.link(n.from, n.to, n.kind);
        if (!r.ok) return r.error ?? 'Not connected.';
        parts.push({ kind: 'node-link', id: r.id ?? '', from: n.from, to: n.to, relation: n.kind });
      } else if (n.do === 'unlink') {
        const r = await x.nodes.unlink(n.from, n.to);
        if (!r.ok) return r.error ?? 'Not disconnected.';
      } else if (n.do === 'adopt') {
        parts.push({ kind: 'node-create', id: n.id });
      }
    }
    return null;
  };

  const undo = useCallback(async (n: number | 'burst' = 1): Promise<RunResult> => {
    const stack = done.current;
    if (!stack.length) return { ok: false, error: 'There is nothing to undo.' };
    let count = typeof n === 'number' ? n : 0;
    if (n === 'burst') {
      // the person's latest burst: their changes back to the last pause, or the assistant's last turn
      const latest = stack[stack.length - 1].at;
      for (let i = stack.length - 1; i >= 0 && stack[i].by === 'person' && latest - stack[i].at < BURST_MS; i--) count++;
      if (!count) count = 1;
    }
    const labels: string[] = [];
    for (let k = 0; k < count && stack.length; k++) {
      const t = stack.pop() as Txn;
      const again: Part[] = [];
      for (const p of [...t.parts].reverse()) {
        const r = await reverse(p);
        if (r) again.unshift(r);
      }
      undone.current.push({ ...t, parts: again });
      labels.push(t.label);
    }
    bump();
    return { ok: true, label: labels.length === 1 ? `Undid: ${labels[0].charAt(0).toLowerCase()}${labels[0].slice(1)}` : `Undid ${labels.length} changes` };
  }, []);

  const redo = useCallback(async (): Promise<RunResult> => {
    const t = undone.current.pop();
    if (!t) return { ok: false, error: 'There is nothing to redo.' };
    const again: Part[] = [];
    for (const p of [...t.parts].reverse()) {
      const r = await reverse(p);
      if (r) again.unshift(r);
    }
    done.current.push({ ...t, parts: again });
    bump();
    return { ok: true, label: `Redid: ${t.label.charAt(0).toLowerCase()}${t.label.slice(1)}` };
  }, []);

  /** Run a plan as one change. */
  const run = useCallback(
    async (plan: Plan, opts: { by?: 'person' | 'ai'; confirmed?: boolean } = {}): Promise<RunResult> => {
      if (plan.history?.undo !== undefined) return undo(plan.history.undo);
      if (plan.history?.redo) return redo();
      if (plan.confirm && !opts.confirmed) return { ok: false, confirm: plan.confirm };
      const x = d.current;
      const parts: Part[] = [];
      const after: (() => void)[] = [];
      const fail = async (why: string): Promise<RunResult> => {
        for (const p of [...parts].reverse()) await reverse(p);
        return { ok: false, error: why };
      };
      if (plan.layout && (plan.layout.items || plan.layout.groups)) {
        const before = x.layout.current();
        const inv = invertPatch(before, plan.layout);
        x.layout.apply(plan.layout);
        parts.push({ kind: 'layout', undo: inv, redo: plan.layout });
      }
      if (plan.rep?.length) {
        const r = await x.R.change(plan.rep, plan.label);
        if (!r.ok) return fail(r.error ?? 'Not saved.');
        if (r.entry) parts.push({ kind: 'rep', entry: r.entry.id });
      }
      if (plan.nodes?.length) {
        const why = await runNodes(plan.nodes, parts, after);
        if (why) return fail(why);
      }
      if (parts.length) {
        done.current.push({ label: plan.label, at: Date.now(), by: opts.by ?? 'person', parts });
        if (done.current.length > 200) done.current.shift();
        undone.current = [];
        bump();
      }
      for (const u of plan.ui ?? []) x.ui(u);
      for (const f of after) f();
      if (plan.ask) x.ask(plan.ask.text, plan.ask.refs);
      return { ok: true, label: plan.label, recorded: parts.length > 0 };
    },
    [undo, redo]
  );

  /** A change made elsewhere that undo should reach too (the assistant's turn, logged on the server). */
  const record = useCallback((label: string, entry: string, by: 'person' | 'ai') => {
    done.current.push({ label, at: Date.now(), by, parts: [{ kind: 'rep', entry }] });
    undone.current = [];
    bump();
  }, []);

  return { run, undo, redo, record, canUndo: done.current.length > 0, canRedo: undone.current.length > 0, lastLabel: done.current[done.current.length - 1]?.label ?? '' };
}
