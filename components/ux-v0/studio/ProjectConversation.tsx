'use client';
// components/ux-v0/studio/ProjectConversation.tsx — a project still in conversation: the one writer of its record
// (useV0Project, like every workspace), what the conversation needs to know about this browser (the design systems,
// the websites a board can take its identity from, the projects a system can be drawn from, the website directions
// proposed for these words), and the hand-over when the work begins.

import { useEffect, useMemo, useRef, useState } from 'react';
import { SAVE_WORDS, useV0Project } from '../useV0Project';
import { deleteArtifacts, listProjects, putProject } from '@/lib/ux-v0/store';
import type { DesignProject, ProjectSummary } from '@/lib/ux-v0/types';
import { said, type StudioMode, type StudioState } from '@/lib/ux-v0/studio/schema';
import type { DiscoveryEnv, Stage } from '@/lib/ux-v0/studio/discovery';
import { websiteAskOf } from '@/lib/ux-v0/studio/apply';
import { websiteSystems as proposeWebsiteSystems } from '@/lib/ux-v0/studio/options';
import { brandBoardOptions } from '@/lib/ux-v0/dsi/generate';
import { publishedContent, type SystemRecord } from '@/lib/ux-v0/dsi/registry';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { Conversation } from './Conversation';
import { attachFiles, switchMode } from './begin';
import { coloursOf, researchSaid, runResearch } from './research-client';
import { mergeLog, mergeReferences, researchPlan, type ResearchQuery } from '@/lib/ux-v0/studio/research';
import type { ResearchControls } from './controls';
import { releaseFile } from './held';
import { usableSystems } from './SystemPicker';

/** The kinds of work whose conversation looks for references (a design system or a critique starts from the person's own files). */
const RESEARCHED = new Set<StudioMode>(['graphic', 'logo', 'website', 'board']);

const STARTING: Record<StudioMode, string> = {
  graphic: 'Composing three directions from what you said…',
  logo: 'Constructing logo concepts from the name and what it stands for…',
  website: 'Making the page: its structure, its working parts, your words…',
  board: 'Planning the board and the identity its materials share…',
  system: 'Opening the import with what you brought…',
  critique: 'Opening the design…',
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
  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [starting, setStarting] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    listProjects()
      .then(setProjects)
      .catch(() => undefined);
  }, []);

  const onStudio = (fn: (s: StudioState) => StudioState) => update((p) => (p.studio ? { ...p, studio: fn(p.studio) } : p));

  // ── references, looked for on the internet (Openverse, from this browser) ──
  const [researching, setResearching] = useState(false);
  const asked = useRef('');
  const search = async (queries: readonly ResearchQuery[], opening: boolean) => {
    if (!queries.length) return;
    const mode = st.mode;
    setResearching(true);
    try {
      const exclude = new Set((current.current.studio?.references ?? []).map((r) => r.id));
      const { refs, log } = await runResearch(queries, { exclude });
      onStudio((s) => {
        // a search for another kind of work (the person changed it meanwhile) is let go
        if (s.mode !== mode) return s;
        const next = { ...s, references: mergeReferences(s.references ?? [], refs), research: mergeLog(s.research, log) };
        return opening || !refs.length ? said(next, { from: 'socria', kind: 'note', text: researchSaid(log, refs.length) }) : next;
      });
    } finally {
      setResearching(false);
    }
  };
  // a brief that will be made is researched as soon as its conversation opens, once (and again for another kind)
  useEffect(() => {
    if (!RESEARCHED.has(st.mode) || st.research || st.status !== 'discovering') return;
    const key = `${project.id}|${st.mode}`;
    if (asked.current === key) return;
    asked.current = key;
    void search(researchPlan(st), true);
  }, [st.mode, !!st.research]); // eslint-disable-line react-hooks/exhaustive-deps

  const research: ResearchControls = {
    busy: researching,
    onReference: (id, patch) => {
      onStudio((s) => ({ ...s, references: (s.references ?? []).map((r) => (r.id === id ? { ...r, ...patch } : r)) }));
      // a liked reference's colours are read from its picture, once (a picture that cannot be read gives none)
      const r = (current.current.studio?.references ?? []).find((x) => x.id === id);
      if (patch.state === 'liked' && r && !r.swatches?.length)
        void coloursOf(r)
          .then((sw) => sw.length && onStudio((s) => ({ ...s, references: (s.references ?? []).map((x) => (x.id === id ? { ...x, swatches: sw.slice(0, 6) } : x)) })))
          .catch(() => undefined);
    },
    onSearch: (q) => {
      const query = q.trim().slice(0, 80);
      if (!query || researching) return;
      onStudio((s) => said(s, { from: 'person', kind: 'reply', text: `Search for “${query}”` }));
      void search([{ q: query, why: query }], true);
    },
    onRetry: () => {
      if (!researching) void search(researchPlan(current.current.studio ?? st), true);
    },
  };

  const usable = usableSystems(props.systems);
  const rec = usable.find((r) => r.id === st.systemId) ?? null;
  const content = useMemo(() => (rec ? publishedContent(rec, 'latest') : null), [rec]);
  // the directions a website could be made in: proposed for these words (or, in a design system, three expressions of it)
  const wsKey = st.mode === 'website' ? JSON.stringify([st.prompt, st.answers['w.words']?.fields, st.answers['w.purpose']?.values, st.answers['w.audience']?.values, st.answers['w.functions']?.values, st.answers['w.palette'], (st.references ?? []).filter((r) => r.state === 'liked').map((r) => [r.id, r.swatches?.length ?? 0, r.take]), st.systemId, st.createdAt]) : '';
  const websiteSystems = useMemo<MasterDesignSystem[]>(() => {
    if (st.mode !== 'website') return [];
    const ask = websiteAskOf(st);
    if (!ask) return [];
    try {
      return content ? brandBoardOptions(content, ask.board, String(st.createdAt)).slice(0, 3) : proposeWebsiteSystems(st);
    } catch {
      return [];
    }
  }, [wsKey, content]); // eslint-disable-line react-hooks/exhaustive-deps

  const env: DiscoveryEnv = {
    hasSystem: !!rec,
    systemName: rec?.name,
    systems: usable.map((r) => ({ id: r.id, name: r.name })),
    websites: projects.filter((s) => !s.graphic && s.board === undefined && s.mode === 'create' && !!s.direction && s.id !== project.id && s.studio?.status !== 'discovering').map((s) => ({ id: s.id, name: s.name || 'Untitled' })),
    projects: projects.filter((s) => s.id !== project.id && s.studio?.status !== 'discovering' && s.stage === 'design').map((s) => ({ id: s.id, name: s.name || 'Untitled', kind: s.graphic ? 'A graphic' : s.board !== undefined ? 'A board' : 'A website' })),
    websiteSystems,
  };

  const start = async (from: StudioState) => {
    setError('');
    setStarting(STARTING[from.mode]);
    // the record as it is now, with the last change in it (a state update may not have landed yet)
    const p = { ...current.current, studio: from };
    const err = await props.onStart(p, from, websiteSystems);
    if (err) {
      setStarting('');
      setError(err);
    }
  };

  return (
    <Conversation
      studio={st}
      onStudio={onStudio}
      env={env}
      websiteSystems={websiteSystems}
      nonce={props.nonce}
      saveWords={SAVE_WORDS[save]}
      systems={props.systems}
      onSystem={(id) => {
        const r = usable.find((x) => x.id === id);
        onStudio((s) => said({ ...s, systemId: r ? r.id : undefined }, { from: 'socria', kind: 'change', text: r ? `Made in ${r.name} from here: its colours, type and logo, with every composition still its own.` : 'No design system: SocriaUX proposes an identity from your words.' }));
      }}
      onManageSystems={async () => {
        await putProject(current.current);
        props.onManageSystems();
      }}
      onStart={(from) => void start(from)}
      starting={starting}
      error={error}
      onExit={async () => {
        await putProject(current.current);
        props.onExit();
      }}
      onSwitchMode={(mode) => onStudio((s) => switchMode(s, mode))}
      research={research}
      onFiles={async (files: File[], stage: Stage) => {
        const r = await attachFiles(files, { critique: stage.id === 'c.file', hold: stage.id === 's.input' });
        if (r.attachments.length) onStudio((s) => ({ ...s, attachments: [...s.attachments, ...r.attachments].slice(-16) }));
        return { ids: r.attachments.map((a) => a.id), ...(r.error ? { error: r.error } : {}) };
      }}
      onRemoveFile={(id) => {
        const a = st.attachments.find((x) => x.id === id);
        releaseFile(id);
        if (a?.upload) void deleteArtifacts([a.upload]);
        onStudio((s) => ({
          ...s,
          attachments: s.attachments.filter((x) => x.id !== id),
          answers: Object.fromEntries(Object.entries(s.answers).map(([k, v]) => [k, v.values.includes(id) ? { ...v, values: v.values.filter((x) => x !== id) } : v])),
        }));
      }}
    />
  );
}
