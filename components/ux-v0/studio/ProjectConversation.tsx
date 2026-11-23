'use client';
// components/ux-v0/studio/ProjectConversation.tsx — a project still in conversation: the one writer of its record
// (useV0Project, like every workspace), every message read by the creative director (lib/ux-v0/studio/director.ts),
// websites the person points to read for reference (/api/ux-v0/reference) before anything is made from them, files
// attached as they come, a website's looks drawn when they are offered, and the hand-over when the work begins.

import { useEffect, useMemo, useRef, useState } from 'react';
import { SAVE_WORDS, useV0Project } from '../useV0Project';
import { putProject } from '@/lib/ux-v0/store';
import type { DesignProject } from '@/lib/ux-v0/types';
import { said, type StudioMode, type StudioState } from '@/lib/ux-v0/studio/schema';
import { chooseLook, readyToMake, respond, seedFromWords, type DirectorEnv } from '@/lib/ux-v0/studio/director';
import { addReference, referenceOf, type SiteRead } from '@/lib/ux-v0/studio/references';
import { websiteAskOf } from '@/lib/ux-v0/studio/apply';
import { websiteSystems as proposeWebsiteSystems } from '@/lib/ux-v0/studio/options';
import { brandBoardOptions } from '@/lib/ux-v0/dsi/generate';
import { publishedContent, type SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { Conversation } from './Conversation';
import { attachFiles, switchMode } from './begin';
import { usableSystems } from './SystemPicker';

const STARTING: Record<StudioMode, string> = {
  graphic: 'Composing three directions from what you said…',
  logo: 'Constructing logo concepts from the name and what it stands for…',
  website: 'Making the page: its structure, its working parts, your words…',
  board: 'Planning the board and the identity its pieces share…',
  system: 'Opening the import with what you brought…',
  critique: 'Opening the design…',
};

const hostOf = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

export function ProjectConversation(props: {
  initial: DesignProject;
  signedIn: boolean;
  nonce: string;
  systems: readonly SystemRecord[];
  /** begin the work: resolves with why it could not, or null once it has (and the view has moved on) */
  onStart: (p: DesignProject, st: StudioState, websiteSystems: readonly MasterDesignSystem[]) => Promise<string | null>;
  onExit: () => void;
  onManageSystems: () => void;
}) {
  const { project, update, save, current } = useV0Project(props.initial, props.signedIn);
  const st = project.studio!;
  const [starting, setStarting] = useState('');
  const [error, setError] = useState('');
  const [reading, setReading] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});

  // the record as this conversation last wrote it: every change goes through here, so an answer that arrives while a
  // site is being read never loses one that was made in between
  const latest = useRef(st);
  latest.current = st;
  const commit = (next: StudioState) => {
    latest.current = next;
    update((p) => (p.studio ? { ...p, studio: next } : p));
  };
  const change = (fn: (s: StudioState) => StudioState) => commit(fn(latest.current));

  const usable = usableSystems(props.systems);
  const rec = usable.find((r) => r.id === st.systemId) ?? null;
  const content = useMemo(() => (rec ? publishedContent(rec, 'latest') : null), [rec]);
  const env: DirectorEnv = { hasSystem: !!rec, ...(rec ? { systemName: rec.name } : {}) };

  // the looks a website could take: proposed for these words (in a design system, three expressions of it)
  const wsKey = st.mode === 'website' ? JSON.stringify([st.prompt, st.answers['w.words']?.fields, st.answers['w.purpose']?.values, st.answers['w.functions']?.values, st.answers['w.palette'], st.answers['w.personality']?.values, st.answers['w.look']?.text, (st.references ?? []).filter((r) => r.state === 'liked').map((r) => [r.id, r.take]), st.round, st.systemId, st.createdAt]) : '';
  const websiteSystems = useMemo<MasterDesignSystem[]>(() => {
    if (st.mode !== 'website') return [];
    const ask = websiteAskOf(st);
    if (!ask) return [];
    try {
      return content ? brandBoardOptions(content, ask.board, `${st.createdAt}|${st.round ?? 0}`, { round: st.round ?? 0 }).slice(0, 3) : proposeWebsiteSystems(st);
    } catch {
      return [];
    }
  }, [wsKey, content]); // eslint-disable-line react-hooks/exhaustive-deps

  const start = async (from: StudioState) => {
    setError('');
    setStarting(STARTING[from.mode]);
    await putProject({ ...current.current, studio: from });
    const err = await props.onStart({ ...current.current, studio: from }, from, websiteSystems);
    if (err) {
      setStarting('');
      setError(err);
    }
  };
  /** Made now if the conversation's last word was that it is being made (a switch of kind can say so, or ask). */
  const after = async () => {
    if (readyToMake(latest.current, env)) await start(latest.current);
  };

  // a conversation that said it was making the work, opened before it could (a reload): it is made now
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const last = [...st.transcript].reverse().find((m) => m.from === 'socria');
    if (st.status === 'discovering' && last?.kind === 'note' && readyToMake(st, env)) void start(st);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** Websites the person pointed to, read one after another; what was read (or why it could not be) is said. */
  const readSites = async (urls: readonly string[]) => {
    for (const url of urls) {
      const host = hostOf(url);
      setReading((r) => [...r, host]);
      try {
        const res = await fetch('/api/ux-v0/reference', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }) });
        const j = (await res.json().catch(() => null)) as { read?: SiteRead; preview?: string; error?: string } | null;
        if (res.ok && j?.read) {
          const ref = referenceOf(j.read);
          if (j.preview) setPreviews((p) => ({ ...p, [ref.id]: j.preview! }));
          change((s) => addReference(s, ref));
        } else {
          const why = res.status === 429 ? 'too many sites read just now — try again in a minute' : (j?.error ?? 'it did not answer').replace(/\.$/, '').toLowerCase();
          change((s) => said(s, { from: 'socria', kind: 'note', text: `I couldn’t read ${host}: ${why}. Tell me what you like about it, or drop in a screenshot.` }));
        }
      } catch {
        change((s) => said(s, { from: 'socria', kind: 'note', text: `I couldn’t reach ${host} from here. Tell me what you like about it, or drop in a screenshot.` }));
      } finally {
        setReading((r) => r.filter((x) => x !== host));
      }
    }
  };

  const onSend = async (text: string, files: File[]) => {
    setError('');
    let ids: string[] = [];
    if (files.length) {
      const r = await attachFiles(files, { critique: latest.current.mode === 'critique', hold: latest.current.mode === 'system' });
      if (r.error) setError(r.error);
      if (r.attachments.length) {
        ids = r.attachments.map((a) => a.id);
        // what the files settle is taken from them (a critique's design, a design system's source)
        change((s) => seedFromWords({ ...s, attachments: [...s.attachments, ...r.attachments].slice(-16) }));
      }
      if (!r.attachments.length && !text) return;
    }
    const turn = respond(latest.current, text || (ids.length ? 'These' : ''), env, { attachments: ids });
    commit(turn.st);
    if (turn.switchTo) {
      change((s) => switchMode(s, turn.switchTo!));
      return after();
    }
    // a site to learn from is read before anything is made from what was said
    if (turn.research.length) await readSites(turn.research);
    if (turn.move.kind === 'create') await after();
  };

  const onMake = async () => {
    const turn = respond(latest.current, 'Make it now', env);
    commit(turn.st);
    if (turn.move.kind === 'create') await start(latest.current);
  };

  return (
    <Conversation
      studio={st}
      env={env}
      websiteSystems={websiteSystems}
      nonce={props.nonce}
      saveWords={SAVE_WORDS[save]}
      systems={props.systems}
      onSystem={(id) => {
        const r = usable.find((x) => x.id === id);
        change((s) => said({ ...s, systemId: r ? r.id : undefined }, { from: 'socria', kind: 'change', text: r ? `Made in ${r.name} from here: its colours, type and logo, with every composition still its own.` : 'No design system: I’ll propose an identity from your words.' }));
      }}
      onManageSystems={async () => {
        await putProject(current.current);
        props.onManageSystems();
      }}
      onSend={(t, f) => void onSend(t, f)}
      onMake={() => void onMake()}
      onChooseLook={(choice) => {
        const next = chooseLook(latest.current, choice);
        commit(next);
        void start(next);
      }}
      onDifferent={() => {
        const turn = respond(latest.current, 'Something different', env);
        commit(turn.st);
      }}
      onReference={(id, patch) => change((s) => ({ ...s, references: (s.references ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }))}
      previews={previews}
      reading={reading}
      starting={starting}
      error={error}
      onExit={async () => {
        await putProject(current.current);
        props.onExit();
      }}
      onSwitchMode={(mode) => {
        change((s) => switchMode(s, mode));
        void after();
      }}
    />
  );
}
