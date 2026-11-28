'use client';
// components/ux-v0/studio/ProjectConversation.tsx — a project still in conversation: the one writer of its record
// (useV0Project, like every workspace). For a graphic, a logo, a campaign or a website, each time the person speaks
// SocriaUX decides one thing — ask one question, or make it (lib/ux-v0/studio/discover.ts; the model decides when it
// can be reached: ./discoverClient.ts) — and "make it", "you decide" or "surprise me" make it at once. Websites the
// person points to are read for reference (/api/ux-v0/reference) before the turn that follows, files are attached as
// they come, and the work begins as soon as the brief is enough, with no direction to choose first. A critique and a
// design-system import keep their own short exchange (lib/ux-v0/studio/director.ts): they only need the file.

import { useEffect, useRef, useState } from 'react';
import { SAVE_WORDS, useV0Project } from '../useV0Project';
import { putProject } from '@/lib/ux-v0/store';
import type { DesignProject } from '@/lib/ux-v0/types';
import { said, type StudioMode, type StudioState } from '@/lib/ux-v0/studio/schema';
import { readyToMake, referenceUrls, respond, seedFromWords, type DirectorEnv } from '@/lib/ux-v0/studio/director';
import { addNote, answerModule, applyPlan, awaitingPlan, changed, dropAvoid, dropTentative, editField, editPrompt, isCreative, keepTentative, makingNow, pickOption, removeChosen, removeNote, reopenModule, setPaletteColour, skipModule, startMaking, wantsMake } from '@/lib/ux-v0/studio/discover';
import { emptySpace } from '@/lib/ux-v0/studio/brief';
import { addReference, referenceOf, type SiteRead } from '@/lib/ux-v0/studio/references';
import { researchAskOf, type ResearchResponse } from '@/lib/ux-v0/research/schema';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { Conversation } from './Conversation';
import { planBrief, TurnCancelled } from './discoverClient';
import { SpatialBrief } from './SpatialBrief';
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

  // the spatial brief (a graphic, a logo, a campaign, a website): every change the person makes is applied at once;
  // the question model (or the reader) then refines the brief — a short pause first, so changes made in quick
  // succession share one call, and a newer change lets an older refinement go
  const [thinking, setThinking] = useState(false);
  const planning = useRef<AbortController | null>(null);
  const changes = useRef(0);
  const timer = useRef<number | null>(null);
  const [notices, setNotices] = useState<string[]>([]);
  const runPlan = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    planning.current?.abort();
    const ctl = new AbortController();
    planning.current = ctl;
    const at = changes.current;
    setThinking(true);
    try {
      const plan = await planBrief(latest.current, { projectId: project.id, signal: ctl.signal, ...(envRef.current.systemName ? { systemName: envRef.current.systemName } : {}) });
      if (ctl.signal.aborted || changes.current !== at || latest.current.space?.making) return;
      commit(applyPlan(latest.current, plan));
    } catch (e) {
      if (!(e instanceof TurnCancelled)) setError('Something went wrong while refining the brief. Change anything to try again — or generate now.');
    } finally {
      if (planning.current === ctl) setThinking(false);
    }
  };
  const replan = (delay = 450) => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void runPlan(), delay);
  };
  /** A change the person made: applied now, refined after. */
  const act = (fn: (s: StudioState) => StudioState, delay?: number) => {
    setError('');
    const next = fn(latest.current);
    if (next === latest.current) return;
    commit(next);
    changes.current++;
    replan(delay);
  };
  const settle = () => {
    if (timer.current) window.clearTimeout(timer.current);
    planning.current?.abort();
    setThinking(false);
  };
  useEffect(() => () => settle(), []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Generate: whatever is open is left to SocriaUX, and the work is made now. */
  const generate = () => {
    settle();
    changes.current++;
    commit(startMaking(latest.current));
    void start(latest.current);
  };

  // a conversation that said it was making the work, opened before it could (a reload): it is made now
  const resumed = useRef(false);
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    if (st.status !== 'discovering') return;
    if (isCreative(st.mode)) {
      // a brief opened on the person's idea (a new one, or one changed before SocriaUX refined it): refined now; one
      // whose Generate was pressed before the work could begin: made now
      if (makingNow(st)) void start(st);
      else if (awaitingPlan(st)) void runPlan();
      return;
    }
    const last = [...st.transcript].reverse().find((m) => m.from === 'socria');
    if (last?.kind === 'note' && readyToMake(st, env)) void start(st);
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
          const text = `Couldn’t read ${host}: ${why}. Say what you like about it, or drop in a screenshot.`;
          if (isCreative(latest.current.mode)) setNotices((n) => [...n, text].slice(-4));
          else change((s) => said(s, { from: 'socria', kind: 'note', text }));
        }
      } catch {
        const text = `Couldn’t reach ${host} from here. Say what you like about it, or drop in a screenshot.`;
        if (isCreative(latest.current.mode)) setNotices((n) => [...n, text].slice(-4));
        else change((s) => said(s, { from: 'socria', kind: 'note', text }));
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
    const turn0 = respond(latest.current, text || (ids.length ? 'These' : ''), env, { attachments: ids });
    commit(turn0.st);
    if (turn0.switchTo) {
      change((s) => switchMode(s, turn0.switchTo!));
      return after();
    }
    // a site to learn from is read before anything is made from what was said; a search is run when one was asked for
    if (turn0.research.length) await readSites(turn0.research);
    if (turn0.search) await searchRefs(turn0.search);
    if (turn0.move.kind === 'create') await after();
  };

  const onMake = async () => {
    const t = respond(latest.current, 'Make it now', env);
    commit(t.st);
    if (t.move.kind === 'create') await start(latest.current);
  };

  /** Something added in the brief's own words: pictures attached, sites read, a search run, or a note kept. */
  const onNote = async (text: string, files: File[]) => {
    setError('');
    if (files.length) {
      const r = await attachFiles(files, { critique: false, hold: false });
      if (r.error) setError(r.error);
      if (r.attachments.length) act((s) => changed({ ...s, attachments: [...s.attachments, ...r.attachments].slice(-16) }, `brought ${r.attachments.length === 1 ? 'a picture' : `${r.attachments.length} pictures`}: ${r.attachments.map((a) => a.name).join(', ')}`));
      if (!text) return;
    }
    // "make it", "you decide", "surprise me": made now, with what is understood
    if (wantsMake(text)) return generate();
    const urls = referenceUrls(text);
    if (urls.length) {
      await readSites(urls);
      return act((s) => addNote(s, text));
    }
    const ask = researchAskOf(text);
    if (ask) return void searchRefs(ask);
    act((s) => addNote(s, text));
  };

  const systemSaid = (id: string | null) => {
    const r = usable.find((x) => x.id === id);
    return { r, text: r ? `Made in ${r.name} from here: its colours, type and logo, with every composition still its own.` : 'No design system: I’ll propose an identity from your words.' };
  };

  if (isCreative(st.mode) && st.space) {
    return (
      <SpatialBrief
        studio={st}
        env={env}
        saveWords={SAVE_WORDS[save]}
        systems={props.systems}
        thinking={thinking}
        starting={starting}
        error={error}
        reading={reading}
        searching={searching}
        notices={notices}
        previews={previews}
        on={{
          answer: (id, text) => act((s) => answerModule(s, id, text)),
          pick: (id, i) => act((s) => pickOption(s, id, i), 250),
          skip: (id) => act((s) => skipModule(s, id)),
          reopen: (id) => commit(reopenModule(latest.current, id)),
          prompt: (text) => (wantsMake(text) ? generate() : act((s) => editPrompt(s, text))),
          field: (f, v) => act((s) => editField(s, f, v)),
          note: (text, files) => void onNote(text, files),
          removeNote: (id) => act((s) => removeNote(s, id)),
          removeChosen: (k) => act((s) => removeChosen(s, k)),
          colour: (i, hex) => act((s) => setPaletteColour(s, i, hex), 900),
          keep: (line) => act((s) => keepTentative(s, line)),
          drop: (line) => act((s) => dropTentative(s, line)),
          dropAvoid: (line) => act((s) => dropAvoid(s, line)),
          generate,
          reference: (id, patch) => act((s) => changed({ ...s, references: (s.references ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }, `changed what to take from a reference: ${JSON.stringify(patch)}`), 900),
          useFound: (url) => void readSites([url]).then(() => act((s) => changed(s, `chose a found page as a reference: ${url}`))),
          system: (id) => {
            const { r, text } = systemSaid(id);
            act((s) => changed({ ...s, systemId: r ? r.id : undefined }, text));
          },
          manageSystems: async () => {
            await putProject(current.current);
            props.onManageSystems();
          },
          mode: (mode) => act((s) => changed({ ...s, mode, modeBy: 'person' }, `made it a ${mode === 'board' ? 'campaign' : mode} instead`), 0),
          exit: async () => {
            settle();
            await putProject(current.current);
            props.onExit();
          },
        }}
      />
    );
  }

  return (
    <Conversation
      studio={st}
      env={env}
      nonce={props.nonce}
      saveWords={SAVE_WORDS[save]}
      systems={props.systems}
      onSystem={(id) => {
        const r = usable.find((x) => x.id === id);
        const { r: rr, text } = systemSaid(id);
        void r;
        change((s) => said({ ...s, systemId: rr ? rr.id : undefined }, { from: 'socria', kind: 'change', text }));
      }}
      onManageSystems={async () => {
        await putProject(current.current);
        props.onManageSystems();
      }}
      onSend={(t, f) => void onSend(t, f)}
      searching={searching}
      onUseFound={(url) => void readSites([url])}
      onMake={() => void onMake()}
      onChoose={() => undefined}
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
        if (isCreative(mode)) {
          // a critique or an import that turns out to be creative work: it opens as a spatial brief on the same words
          change((s) => changed({ ...switchMode(s, mode), space: s.space ?? emptySpace() }, `made it a ${mode === 'board' ? 'campaign' : mode}`));
          changes.current++;
          void runPlan();
          return;
        }
        change((s) => switchMode(s, mode));
        void after();
      }}
    />
  );
}
