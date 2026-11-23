'use client';
// components/ux-v0/studio/ProjectConversation.tsx — a project still in conversation: the one writer of its record
// (useV0Project, like every workspace), every message and every option tapped read by the creative director
// (lib/ux-v0/studio/director.ts), each creative question written for this brief by the model when it can be reached
// (./questionPlanner.ts; the reader's question stands otherwise), websites the person points to read for reference
// (/api/ux-v0/reference) before anything is made from them, files attached as they come, and the hand-over when the
// work begins — as soon as the brief is enough, with no direction to choose first.

import { useEffect, useRef, useState } from 'react';
import { SAVE_WORDS, useV0Project } from '../useV0Project';
import { putProject } from '@/lib/ux-v0/store';
import type { DesignProject } from '@/lib/ux-v0/types';
import { said, type StudioMode, type StudioState } from '@/lib/ux-v0/studio/schema';
import { chooseOption, enoughToMake, readyToMake, respond, rethinkQuestion, seedFromWords, type DirectorEnv } from '@/lib/ux-v0/studio/director';
import { addReference, referenceOf, type SiteRead } from '@/lib/ux-v0/studio/references';
import { researchAskOf, type ResearchResponse } from '@/lib/ux-v0/research/schema';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { Conversation } from './Conversation';
import { planQuestion, questionModelWorthAsking } from './questionPlanner';
import { attachFiles, switchMode } from './begin';
import { usableSystems } from './SystemPicker';

const STARTING: Record<StudioMode, string> = {
  graphic: 'Composing it from what you said…',
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
  const env: DirectorEnv = { hasSystem: !!rec, ...(rec ? { systemName: rec.name } : {}) };
  const envRef = useRef(env);
  envRef.current = env;

  const start = async (from: StudioState) => {
    setError('');
    setStarting(STARTING[from.mode]);
    await putProject({ ...current.current, studio: from });
    // a website is made in the first look its words call for (within its design system when it has one)
    const err = await props.onStart({ ...current.current, studio: from }, from, []);
    if (err) {
      setStarting('');
      setError(err);
    }
  };
  /** Made now if the conversation's last word was that it is being made (a switch of kind can say so, or ask). */
  const after = async () => {
    if (readyToMake(latest.current, envRef.current)) await start(latest.current);
  };

  // each creative question is written for this brief by the model when it can be reached: the reader's question is
  // held back while it writes (a moment), then the model's takes its place — or the brief is judged enough and the
  // work is made. Answered in the meantime, or not reachable: the reader's question stands, nothing is lost.
  const [thinking, setThinking] = useState<string | null>(null);
  const tried = useRef(new Set<string>());
  const planning = useRef<AbortController | null>(null);
  const waiting = st.status === 'discovering' && st.pending === 'discover' ? st.discovery?.current : undefined;
  useEffect(() => {
    const q = waiting;
    if (!q || q.by !== 'reader' || tried.current.has(q.id) || !questionModelWorthAsking()) return;
    tried.current.add(q.id);
    setThinking(q.id);
    const ctl = new AbortController();
    planning.current = ctl;
    void planQuestion(latest.current, { projectId: project.id, signal: ctl.signal })
      .then(async (r) => {
        if (r.by !== 'model' || ctl.signal.aborted) return;
        const now = latest.current;
        if (now.pending !== 'discover' || now.discovery?.current?.id !== q.id) return;
        if (r.ready) {
          const next = enoughToMake(now, q.id, envRef.current);
          if (next !== now) {
            commit(next);
            await after();
          }
          return;
        }
        commit(rethinkQuestion(now, q.id, r.question));
      })
      .finally(() => setThinking((t) => (t === q.id ? null : t)));
  }, [waiting?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => planning.current?.abort(), []);
  /** Whatever the person does next answers the question as shown: a question still being written is let go. */
  const settle = () => {
    if (!thinking) return;
    planning.current?.abort();
    setThinking(null);
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

  /** References searched for through the workspace's provider; what was found (each with its source), or why nothing
   * was, is said — never results that were not found. */
  const [searching, setSearching] = useState('');
  const searchRefs = async (ask: { query: string; kind: 'websites' | 'images' }) => {
    setSearching(ask.query);
    try {
      const res = await fetch('/api/ux-v0/research', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ask) });
      const j = (await res.json().catch(() => null)) as ResearchResponse | null;
      if (res.status === 429) return change((s) => said(s, { from: 'socria', kind: 'note', text: 'Too many searches just now — try again in a minute. Links you paste are read meanwhile.' }));
      if (!j || !Array.isArray(j.results)) return change((s) => said(s, { from: 'socria', kind: 'note', text: 'The search did not happen just now, so nothing was found. Paste links to sites you like, or drop in pictures.' }));
      if (j.status !== 'ok' || !j.results.length) return change((s) => said(s, { from: 'socria', kind: 'note', text: j.message }));
      const results = j.results.slice(0, 12).map((r) => ({ id: r.id, kind: r.kind, title: r.title, url: r.url, host: r.host, ...(r.snippet ? { snippet: r.snippet } : {}), ...(r.thumb ? { thumb: r.thumb } : {}), provider: r.provider }));
      change((s) => said(s, { from: 'socria', kind: 'research', text: `${j.message} Each one is linked to where it was found. Choose the ones worth learning from and I will read them — they are for inspiration, never copied into the work.`, found: { query: j.query, provider: j.provider ?? 'search', results } }));
    } catch {
      change((s) => said(s, { from: 'socria', kind: 'note', text: 'The search could not be reached from here, so nothing was found. Paste links to sites you like, or drop in pictures.' }));
    } finally {
      setSearching('');
    }
  };
  // an opening sentence that asks for references: they are searched for at once
  const searchedOpening = useRef(false);
  useEffect(() => {
    if (searchedOpening.current) return;
    searchedOpening.current = true;
    const ask = researchAskOf(st.prompt);
    if (ask && st.transcript.length <= 3 && !st.transcript.some((m) => m.kind === 'research' || /^Looking for references/.test(m.text))) {
      change((s) => said(s, { from: 'socria', kind: 'note', text: `Looking for references: “${ask.query}”.` }));
      void searchRefs(ask);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const onSend = async (text: string, files: File[]) => {
    setError('');
    settle();
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
    // a site to learn from is read before anything is made from what was said; a search is run when one was asked for
    if (turn.research.length) await readSites(turn.research);
    if (turn.search) await searchRefs(turn.search);
    if (turn.move.kind === 'create') await after();
  };

  const onMake = async () => {
    settle();
    const turn = respond(latest.current, 'Make it now', env);
    commit(turn.st);
    if (turn.move.kind === 'create') await start(latest.current);
  };

  /** One of the options a creative question offered, tapped: the decision taken, then the next question or the work. */
  const onChoose = async (optionId: string) => {
    setError('');
    settle();
    const turn = chooseOption(latest.current, optionId, env);
    commit(turn.st);
    if (turn.research.length) await readSites(turn.research);
    if (turn.move.kind === 'create') await after();
  };

  return (
    <Conversation
      studio={st}
      env={env}
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
      searching={searching}
      onUseFound={(url) => void readSites([url])}
      onMake={() => void onMake()}
      onChoose={(id) => void onChoose(id)}
      thinking={!!thinking && thinking === waiting?.id}
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
