'use client';
// components/projects/ProjectHome.tsx
//
// PROJECT HOME — what opens when a Project is opened.
//
// It organises what is already there; it replaces nothing. The rail keeps its
// folders and the conversations inside them stay one click away there; this
// page is the same Project read as a whole: what it is, what is in it, where
// the thinking stands, a picture of it that follows its content, and the way
// back into the work.
//
// Read from one route (app/api/projects/[id]/home), computed from the
// Project's own content (lib/project-home.ts). Nothing on this page is
// invented: themes and questions are the person's own words from their maps,
// progress is only what they marked, and the synthesis is labelled as
// Socria's reading.
//
// A two-chat Project should feel like a page, not a dashboard; a fifty-chat
// one should still be navigable. So sections fold (and remember it), long
// lists show their head and offer the rest, and nothing appears that the
// Project has nothing to put in.

import { useCallback, useEffect, useMemo, useState } from 'react';
import { NodeGlyph } from '@/components/NodeGlyph';
import type { LogosNodeType } from '@/lib/logos';
import type { Atlas } from '@/lib/mind/atlas';
import {
  PROJECT_COLORS,
  PROJECT_ICONS,
  ago,
  type ChatGroup,
  type ContinueWith,
  type HomeView,
  type ProjectSynthesis,
  type Resource,
  type VisualKind,
} from '@/lib/project-home';
import { ROLE_WORD, can, type Role } from '@/lib/share/roles';
import { ProjectVisual } from './ProjectVisual';
import { hueOf } from '@/components/share/SharedThread';
import './project-home.css';

interface HomeChatRow {
  id: string;
  title: string;
  kind: 'chat' | 'logos';
  updatedAt: number;
  createdAt: number;
  nodes: number;
  hasDraft: boolean;
  plot: boolean;
  models: number;
}

interface HomeData {
  role: Role;
  project: {
    id: string;
    name: string;
    description: string;
    instructions?: string;
    icon: string | null;
    color: string | null;
    archived: boolean;
    createdAt: number;
    updatedAt: number;
    anchor: string | null;
  };
  goals: { id: string; label: string; content?: string; status: string }[];
  files: { id: string; name: string; bytes: number; createdAt: number }[];
  chats: HomeChatRow[];
  atlas: Atlas;
  home: HomeView;
}

const ICON_GLYPH: Record<string, LogosNodeType | 'folder'> = {
  folder: 'folder', idea: 'idea', question: 'question', evidence: 'evidence', concept: 'concept', goal: 'goal',
  milestone: 'milestone', theme: 'theme', source: 'source', equation: 'equation', character: 'character', value: 'value',
};

const FOLDER = (
  <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 7.5A1.5 1.5 0 0 1 4.5 6h4.2l1.8 2h9A1.5 1.5 0 0 1 21 9.5v8A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
  </svg>
);

function Mark({ icon, color, size = 'lg' }: { icon: string | null; color: string | null; size?: 'lg' | 'sm' }) {
  const g = ICON_GLYPH[icon ?? 'folder'] ?? 'folder';
  return (
    <span className={`ph-mark c-${color ?? 'moss'} s-${size}`} aria-hidden="true">
      {g === 'folder' ? FOLDER : <NodeGlyph type={g} />}
    </span>
  );
}

/** Which sections are folded, and the chosen view — per Project, in this browser. */
function usePrefs(id: string) {
  const key = `socria.projecthome.v1:${id}`;
  const [prefs, setPrefs] = useState<{ folded: string[]; visual?: VisualKind }>({ folded: [] });
  useEffect(() => {
    try {
      const raw = localStorage.getItem(key);
      setPrefs(raw ? { folded: [], ...JSON.parse(raw) } : { folded: [] });
    } catch {
      setPrefs({ folded: [] });
    }
  }, [key]);
  const save = useCallback(
    (next: { folded: string[]; visual?: VisualKind }) => {
      setPrefs(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {}
    },
    [key]
  );
  return [prefs, save] as const;
}

export function ProjectHome({
  id,
  onOpenChat,
  onNewChat,
  onSettings,
  onShare,
  onRenamed,
  refreshKey,
}: {
  id: string;
  onOpenChat: (id: string, kind: 'chat' | 'logos') => void;
  onNewChat: (kind: 'chat' | 'logos') => void;
  onSettings?: () => void;
  onShare?: () => void;
  onRenamed?: (id: string, kind: 'chat' | 'logos', title: string) => void;
  refreshKey?: unknown;
}) {
  const [data, setData] = useState<HomeData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [prefs, savePrefs] = usePrefs(id);
  const [synth, setSynth] = useState<{ busy: boolean; result: ProjectSynthesis | null; err: string | null }>({ busy: false, result: null, err: null });
  const [allChats, setAllChats] = useState(false);
  const [resFilter, setResFilter] = useState<Resource['kind'] | 'all'>('all');
  const [renaming, setRenaming] = useState<{ id: string; title: string } | null>(null);
  const [picker, setPicker] = useState(false);
  // COLLABORATIVE, only once shared: who has access, who is here now, and
  // what has changed. A personal Project shows none of it.
  const [people, setPeople] = useState<{ owner: string; members: { id: string; name: string; role: string; pending: boolean; you: boolean }[] } | null>(null);
  const [here, setHere] = useState<{ id: string; name: string; you: boolean }[]>([]);
  const [activity, setActivity] = useState<{ who: string; summary: string; at: number; you: boolean }[]>([]);
  useEffect(() => {
    let live = true;
    setPeople(null);
    setHere([]);
    setActivity([]);
    void (async () => {
      const res = await fetch(`/api/share?type=project&id=${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (!live || !j) return;
      const shared = j.role !== 'owner' || (j.members?.length ?? 0) > 0 || !!j.link || !!j.code;
      if (!shared) return;
      setPeople({ owner: j.owner?.name ?? '', members: j.members ?? [] });
      const a = await fetch(`/api/shared/activity?type=project&id=${encodeURIComponent(id)}`, { cache: 'no-store' }).catch(() => null);
      const aj = a && a.ok ? await a.json().catch(() => null) : null;
      if (live && aj?.activity) setActivity(aj.activity);
    })();
    return () => {
      live = false;
    };
  }, [id, refreshKey]);
  useEffect(() => {
    if (!people) return;
    let live = true;
    const beat = async () => {
      if (document.hidden) return;
      const res = await fetch('/api/shared/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'project', id }) }).catch(() => null);
      const j = res && res.ok ? await res.json().catch(() => null) : null;
      if (live && j?.present) setHere(j.present);
    };
    void beat();
    const t = setInterval(beat, 6000);
    return () => {
      live = false;
      clearInterval(t);
      void fetch('/api/shared/presence', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'project', id, leave: true }) }).catch(() => null);
    };
  }, [people, id]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/home`, { cache: 'no-store' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'This Project could not be opened.');
      setData(j as HomeData);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'This Project could not be opened.');
    }
  }, [id]);

  useEffect(() => {
    setData(null);
    setSynth({ busy: false, result: null, err: null });
    setAllChats(false);
    void load();
  }, [load, refreshKey]);

  const folded = (k: string) => prefs.folded.includes(k);
  const fold = (k: string) =>
    savePrefs({ ...prefs, folded: folded(k) ? prefs.folded.filter((x) => x !== k) : [...prefs.folded, k] });

  const visual = useMemo<VisualKind>(() => {
    if (!data) return 'ideas';
    const want = prefs.visual;
    return want && data.home.visual.available.includes(want) ? want : data.home.visual.kind;
  }, [data, prefs.visual]);

  async function synthesize() {
    setSynth({ busy: true, result: null, err: null });
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(id)}/synthesize`, { method: 'POST' });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error(j?.error || 'That could not be read just now.');
      setSynth({ busy: false, result: j.synthesis as ProjectSynthesis, err: null });
    } catch (e) {
      setSynth({ busy: false, result: null, err: e instanceof Error ? e.message : 'That could not be read just now.' });
    }
  }

  async function rename(chat: { id: string; kind: 'chat' | 'logos' }, title: string) {
    const t = title.replace(/\s+/g, ' ').trim().slice(0, 120);
    setRenaming(null);
    if (!t) return;
    setData((d) => (d ? { ...d, chats: d.chats.map((c) => (c.id === chat.id ? { ...c, title: t } : c)) } : d));
    try {
      const res = await fetch('/api/conversations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: chat.id, title: t }),
      });
      if (!res.ok) throw new Error();
      onRenamed?.(chat.id, chat.kind, t);
    } catch {
      void load();
    }
  }

  async function setMark(patch: { icon?: string; color?: string }) {
    if (!data) return;
    setData({ ...data, project: { ...data.project, ...patch } });
    await fetch(`/api/projects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => null);
  }

  if (err) {
    return (
      <div className="ph-root">
        <div className="ph-wrap">
          <p className="ph-fault" role="alert">{err}</p>
        </div>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="ph-root" aria-busy="true">
        <div className="ph-wrap">
          <div className="ph-skel">
            <i className="a" /><i className="b" /><i className="c" /><i className="d" />
          </div>
        </div>
      </div>
    );
  }

  const { project, home, role } = data;
  const owner = role === 'owner';
  const mayEdit = can(role, 'edit');
  const mayAsk = can(role, 'ask');
  const titles = new Map(data.chats.map((c) => [c.id, c]));
  const chatsByGroup: ChatGroup[] = home.groups.map((g) => ({
    label: g.label,
    chats: g.chats.map((c) => titles.get(c.id) ?? (c as unknown as HomeChatRow)) as never,
  }));
  const LIMIT = 8;
  let shown = 0;
  const cont: ContinueWith | null = home.continueWith;
  const resources = home.resources.filter((r) => resFilter === 'all' || r.kind === resFilter);
  const resKinds = (['workspace', 'model', 'plot', 'note', 'file'] as const).filter((k) => home.resources.some((r) => r.kind === k));
  const RES_WORD: Record<Resource['kind'], string> = { workspace: 'Logos', model: 'Models', plot: 'Plots', note: 'Notes', file: 'Files' };
  const expand = () => {
    const logos = data.chats.filter((c) => c.kind === 'logos').sort((a, b) => b.updatedAt - a.updatedAt)[0];
    if (logos) onOpenChat(logos.id, 'logos');
    else if (mayAsk) onNewChat('logos');
  };

  return (
    <div className="ph-root">
      <div className="ph-wrap">
        {/* ── the header ── */}
        <header className="ph-head">
          <div className="ph-mark-wrap">
            <button
              type="button"
              className="ph-mark-btn"
              disabled={!owner}
              aria-label={owner ? 'Change how this Project looks' : undefined}
              onClick={() => setPicker((v) => !v)}
            >
              <Mark icon={project.icon} color={project.color} />
            </button>
            {picker && owner && (
              <div className="ph-picker" role="dialog" aria-label="How this Project looks">
                <div className="row">
                  {PROJECT_ICONS.map((ic) => (
                    <button key={ic} aria-label={ic} aria-pressed={(project.icon ?? 'folder') === ic} onClick={() => void setMark({ icon: ic })}>
                      <Mark icon={ic} color={project.color} size="sm" />
                    </button>
                  ))}
                </div>
                <div className="row colors">
                  {PROJECT_COLORS.map((c) => (
                    <button key={c} aria-label={c} aria-pressed={(project.color ?? 'moss') === c} className={`sw c-${c}`} onClick={() => void setMark({ color: c })} />
                  ))}
                </div>
                <button className="done" onClick={() => setPicker(false)}>Done</button>
              </div>
            )}
          </div>
          <div className="ph-title">
            <span className="ph-kicker">
              Project
              {!owner && <> · <b>{ROLE_WORD[role]}</b></>}
              {project.archived && <> · archived</>}
            </span>
            <h1>{project.name}</h1>
            {project.description ? (
              <p className="ph-desc">{project.description}</p>
            ) : owner && onSettings ? (
              <button className="ph-desc ph-add" onClick={onSettings}>Add a description</button>
            ) : null}
          </div>
          <div className="ph-head-acts">
            {here.length > 1 && (
              <span className="ph-faces" aria-label={`${here.length} here now`}>
                {here.slice(0, 5).map((p) => (
                  <i key={p.id} style={{ background: hueOf(p.id) }} title={p.you ? 'You' : p.name}>{p.name.trim()[0]?.toUpperCase() ?? '?'}</i>
                ))}
              </span>
            )}
            {onShare && (
              <button className="ph-btn ghost" onClick={onShare}>
                Share
              </button>
            )}
            {owner && onSettings && (
              <button className="ph-btn ghost" onClick={onSettings} aria-label="Project settings">
                Settings
              </button>
            )}
          </div>
        </header>

        {/* ── where it stands, and the way back in ── */}
        <section className="ph-over">
          <p className="ph-line">{home.overview.line}</p>
          {(home.overview.themes.length > 0 || home.overview.open.length > 0 || home.overview.goals.open + home.overview.goals.done > 0) && (
            <div className="ph-over-grid">
              {home.overview.themes.length > 0 && (
                <div>
                  <span className="ph-k">{home.overview.recurring ? 'You keep coming back to' : 'Mostly about'}</span>
                  <ul className="ph-chips">
                    {home.overview.themes.map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              )}
              {home.questions.length > 0 && (
                <div>
                  <span className="ph-k">Still open</span>
                  <ul className="ph-qs">
                    {home.questions.slice(0, 4).map((q) => (
                      <li key={q.label}>
                        <button onClick={() => { const c = titles.get(q.chatId); if (c) onOpenChat(c.id, c.kind); }}>{q.label}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {home.overview.goals.open + home.overview.goals.done > 0 && (
                <div>
                  <span className="ph-k">Goals</span>
                  <ul className="ph-goal-list">
                    {data.goals.slice(0, 5).map((g) => (
                      <li key={g.id} className={g.status === 'historical' ? 'done' : ''}>{g.label}</li>
                    ))}
                  </ul>
                  {home.overview.goals.done > 0 && (
                    <span className="ph-small">{home.overview.goals.done} of {home.overview.goals.open + home.overview.goals.done} marked done by you</span>
                  )}
                </div>
              )}
            </div>
          )}
          <div className="ph-continue">
            {cont ? (
              <button className="ph-go" onClick={() => onOpenChat(cont.id, cont.kind)}>
                <span className="t">Continue: <b>{cont.title}</b></span>
                <span className="w">{cont.why}</span>
                <span className="ar" aria-hidden="true">→</span>
              </button>
            ) : null}
            {mayAsk && (
              <span className="ph-new">
                <button className="ph-btn" onClick={() => onNewChat('chat')}>New chat</button>
                <button className="ph-btn ghost" onClick={() => onNewChat('logos')}>New line of thinking in Logos</button>
              </span>
            )}
          </div>
        </section>

        {/* ── the picture ── */}
        <Section id="visual" title="The project, drawn" folded={folded('visual')} onFold={fold}>
          <ProjectVisual
            atlas={data.atlas}
            anchor={project.anchor}
            kind={visual}
            available={home.visual.available}
            why={visual === home.visual.kind ? home.visual.why : WHYS[visual]}
            chats={data.chats}
            goals={data.goals}
            onKind={(k) => savePrefs({ ...prefs, visual: k })}
            onOpenChat={onOpenChat}
            onExpand={data.chats.some((c) => c.kind === 'logos') || mayAsk ? expand : undefined}
          />
        </Section>

        {/* ── the conversations ── */}
        <Section
          id="chats"
          title="Conversations"
          count={data.chats.length}
          folded={folded('chats')}
          onFold={fold}
        >
          {data.chats.length === 0 ? (
            <p className="ph-empty">No conversations yet. {mayAsk ? 'Start one above — it is filed here from its first message.' : ''}</p>
          ) : (
            <div className="ph-groups">
              {chatsByGroup.map((g) => {
                if (!allChats && shown >= LIMIT) return null;
                const rows = (g.chats as unknown as HomeChatRow[]).filter(() => allChats || shown++ < LIMIT);
                if (!rows.length) return null;
                return (
                  <div key={g.label} className="ph-group">
                    <span className="ph-k">{g.label}</span>
                    <ul className="ph-rows">
                      {rows.map((c) => (
                        <li key={c.id} className="ph-row">
                          {renaming?.id === c.id ? (
                            <form
                              className="ph-rename"
                              onSubmit={(e) => { e.preventDefault(); void rename(c, renaming.title); }}
                            >
                              <input
                                autoFocus
                                value={renaming.title}
                                aria-label="New title"
                                onChange={(e) => setRenaming({ id: c.id, title: e.target.value })}
                                onBlur={() => void rename(c, renaming.title)}
                                onKeyDown={(e) => { if (e.key === 'Escape') setRenaming(null); }}
                              />
                            </form>
                          ) : (
                            <button className="ph-open" onClick={() => onOpenChat(c.id, c.kind)}>
                              <span className={`ph-kind k-${c.kind}`} aria-hidden="true">{c.kind === 'logos' ? <NodeGlyph type="theme" /> : <NodeGlyph type="claim" />}</span>
                              <span className="t">{c.title || 'Untitled'}</span>
                              <span className="m">
                                {c.kind === 'logos' && c.nodes > 0 && <i>{c.nodes} on the map</i>}
                                {c.plot && <i>plot</i>}
                                {c.models > 0 && <i>{c.models === 1 ? 'model' : `${c.models} models`}</i>}
                                {c.hasDraft && <i>draft</i>}
                                <time>{ago(c.updatedAt, Date.now())}</time>
                              </span>
                            </button>
                          )}
                          {mayEdit && renaming?.id !== c.id && (
                            <button className="ph-act" aria-label={`Rename ${c.title || 'Untitled'}`} onClick={() => setRenaming({ id: c.id, title: c.title })}>
                              Rename
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
              {data.chats.length > LIMIT && (
                <button className="ph-more" onClick={() => setAllChats((v) => !v)}>
                  {allChats ? 'Show fewer' : `Show all ${data.chats.length}`}
                </button>
              )}
            </div>
          )}
        </Section>

        {/* ── what was made ── */}
        {home.resources.length > 0 && (
          <Section id="resources" title="Resources" count={home.resources.length} folded={folded('resources')} onFold={fold}>
            {resKinds.length > 1 && (
              <span className="ph-seg small" role="tablist" aria-label="Which resources">
                <button role="tab" aria-selected={resFilter === 'all'} onClick={() => setResFilter('all')}>All</button>
                {resKinds.map((k) => (
                  <button key={k} role="tab" aria-selected={resFilter === k} onClick={() => setResFilter(k)}>{RES_WORD[k]}</button>
                ))}
              </span>
            )}
            <ul className="ph-res">
              {resources.slice(0, 24).map((r, i) => (
                <li key={`${r.kind}-${r.chatId ?? r.fileId}-${i}`} className={`k-${r.kind}`}>
                  {r.chatId ? (
                    <button onClick={() => { const c = titles.get(r.chatId!); if (c) onOpenChat(c.id, c.kind); }}>
                      <span className="k">{RES_WORD[r.kind].replace(/s$/, '')}</span>
                      <b>{r.label}</b>
                      {r.sub && <span className="s">{r.sub}</span>}
                    </button>
                  ) : (
                    <div className="file">
                      <span className="k">File</span>
                      <b>{r.label}</b>
                      {r.sub && <span className="s">{r.sub}</span>}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        )}

        {/* ── together: only for a shared Project ── */}
        {people && (
          <Section id="together" title="People and activity" count={people.members.length + 1} folded={folded('together')} onFold={fold}>
            <div className="ph-together">
              <ul className="ph-people">
                <li><span className="av">{people.owner.trim()[0]?.toUpperCase() ?? '?'}</span><span className="n">{people.owner}</span><span className="r">Owner</span></li>
                {people.members.map((m) => (
                  <li key={m.id} className={m.pending ? 'pending' : ''}>
                    <span className="av">{m.name.trim()[0]?.toUpperCase() ?? '?'}</span>
                    <span className="n">{m.you ? `${m.name} (you)` : m.name}{m.pending ? ' · invited' : ''}</span>
                    <span className="r">{ROLE_WORD[m.role as Role] ?? m.role}</span>
                  </li>
                ))}
              </ul>
              {activity.length > 0 && (
                <ul className="ph-activity">
                  {activity.slice(0, 12).map((a, i) => (
                    <li key={i}><span>{a.you ? a.summary.replace(/^\S+/, 'You') : a.summary}</span><time>{ago(a.at, Date.now())}</time></li>
                  ))}
                </ul>
              )}
            </div>
          </Section>
        )}

        {/* ── the reading ── */}
        <Section id="synth" title="Synthesize the project" folded={folded('synth')} onFold={fold}>
          {!synth.result ? (
            <div className="ph-synth-start">
              <p>
                What is established, what is still open, what pulls against what, and what could be stronger —
                read across every conversation here. <em>A reading, not a decision.</em>
              </p>
              <button className="ph-btn" disabled={synth.busy || !data.chats.length} onClick={() => void synthesize()}>
                {synth.busy ? 'Reading…' : 'Synthesize'}
              </button>
              {synth.err && <p className="ph-fault">{synth.err}</p>}
            </div>
          ) : (
            <div className="ph-synth">
              <p className="sum">{synth.result.summary}</p>
              <SynthList title="Established" items={synth.result.established} titles={titles} onOpenChat={onOpenChat} />
              <SynthList title="Still open" items={synth.result.unresolved} titles={titles} onOpenChat={onOpenChat} />
              <SynthList title="Pulling against each other" items={synth.result.contradictions} titles={titles} onOpenChat={onOpenChat} />
              <SynthList title="Could be stronger" items={synth.result.improvements} titles={titles} onOpenChat={onOpenChat} />
              <p className="ph-small">
                {synth.result.source === 'model' ? 'Socria’s reading of your material.' : 'Read from the structure of your maps.'} Nothing here was written to your memory or marked as decided.
                {' '}<button className="ph-link" onClick={() => void synthesize()}>Read again</button>
              </p>
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

const WHYS: Record<VisualKind, string> = {
  ideas: 'The ideas across these conversations, and how they connect.',
  concepts: 'The concepts and questions, and what each one rests on.',
  evidence: 'The claims, and the evidence for and against them.',
  roadmap: 'Your goals, and the conversations in the order they began.',
  timeline: 'What came up, when — and what carried from one conversation into the next.',
  models: 'Every model, plot and object of thought, and where it was made.',
};

function Section({
  id, title, count, folded, onFold, children,
}: {
  id: string; title: string; count?: number; folded: boolean; onFold: (id: string) => void; children: React.ReactNode;
}) {
  return (
    <section className={`ph-sec${folded ? ' is-folded' : ''}`} aria-labelledby={`ph-${id}`}>
      <h2 id={`ph-${id}`}>
        <button aria-expanded={!folded} onClick={() => onFold(id)}>
          <span className="chev" aria-hidden="true">{folded ? '▸' : '▾'}</span>
          {title}
          {count !== undefined && count > 0 && <span className="n">{count}</span>}
        </button>
      </h2>
      {!folded && <div className="ph-sec-body">{children}</div>}
    </section>
  );
}

function SynthList({
  title, items, titles, onOpenChat,
}: {
  title: string;
  items: ProjectSynthesis['established'];
  titles: Map<string, HomeChatRow>;
  onOpenChat: (id: string, kind: 'chat' | 'logos') => void;
}) {
  if (!items.length) return null;
  return (
    <div className="ph-synth-list">
      <span className="ph-k">{title}</span>
      <ul>
        {items.map((it, i) => (
          <li key={i}>
            <span>{it.text}</span>
            {it.chats.length > 0 && (
              <span className="from">
                {it.chats.slice(0, 3).map((cid) => {
                  const c = titles.get(cid);
                  return c ? (
                    <button key={cid} onClick={() => onOpenChat(c.id, c.kind)}>{c.title || 'Untitled'}</button>
                  ) : null;
                })}
              </span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
