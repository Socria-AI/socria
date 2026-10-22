'use client';
// components/logos5/UniverseParts.tsx — the pieces the Universal Map is made of.
//
// A conversation's kind as a glyph, and its marks; the card that
// opens when one is pressed; the box that finds or starts; the View menu; the
// tray of hidden ones; and the bar for several chosen at once. The map itself
// is UniverseBubbles.tsx, the line through time UniverseTime.tsx, and the
// whole is Universe.tsx.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { relTime } from '@/lib/logos-sessions';
import type { Attachment } from '@/lib/logos-attachments';
import type { Look, Match, Tile } from '@/lib/logos5/universe';
import { STUDY_ACCEPT, intentOf, type Intent } from '@/lib/logos5/study';
import { COLOR_BY, LABELS, SIZE_BY, type Arrangement, type ColorBy, type Display, type HomeMode, type LabelLevel, type SizeBy } from '@/lib/logos5/arrange';

/** A colour key as the theme draws it. */
export const colorVar = (key: string | null | undefined) => (key ? `var(--sc-${key})` : 'var(--sc-none)');

const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Oct 5" */
export const shortDate = (at: number) => {
  const d = new Date(at);
  return `${MONTH_SHORT[d.getMonth()]} ${d.getDate()}`;
};

// ── a kind of thinking, as a glyph ───────────────────────────────────

const GLYPH: Record<Look, string> = {
  study: 'M4 6.5C6.5 5 9 5 12 6.5v12C9 17 6.5 17 4 18.5zM20 6.5C17.5 5 15 5 12 6.5v12c3-1.5 5.5-1.5 8 0z',
  deciding: 'M12 20v-6M12 14L6 6M12 14l6-8M4 6h4M16 6h4',
  planning: 'M4 7l1.5 1.5L8 6M4 13l1.5 1.5L8 12M11 7.5h9M11 13.5h9M11 18.5h6',
  learning: 'M3 9.5l9-4 9 4-9 4zM7 11.5v4c2.5 2 7.5 2 10 0v-4',
  writing: 'M5 19l4-1L19 8l-3-3L6 15zM14 7l3 3',
  thinking: 'M12 4v3.5M12 16.5V20M4 12h3.5M16.5 12H20M6.6 6.6l2.5 2.5M14.9 14.9l2.5 2.5M6.6 17.4l2.5-2.5M14.9 9.1l2.5-2.5',
  chat: 'M4 5.5h16v10.5H9.5L4 20z',
};

export function Glyph({ look, size = 14 }: { look: Look; size?: number }) {
  return (
    <svg className="l5h-glyph" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={GLYPH[look]} />
    </svg>
  );
}

const STAR = 'M12 3.8l2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.5l-5 2.7 1-5.6L3.9 9.7l5.6-.7z';

/** What was made in a conversation — charts, plans, practice — counted. */
export function MadeMark({ n }: { n: number }) {
  return (
    <span className="l5h-made" title={`${n} made in it: ${n === 1 ? 'a chart, plan or practice set' : 'charts, plans or practice'}`}>
      <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
        <path d="M5 19v-7M10 19V6M15 19v-4M20 19V9" />
      </svg>
      {n}
    </span>
  );
}

export function StarMark({ on = true }: { on?: boolean }) {
  return (
    <svg className="l5h-star" viewBox="0 0 24 24" width="13" height="13" fill={on ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
      <path d={STAR} />
    </svg>
  );
}

/** "Deciding · 2d" */
export function kindLine(t: Tile): string {
  const when = relTime(t.at);
  return [t.lookSaid, when === 'now' ? 'just now' : when ? `${when} ago`.replace(/^(\w{3} \d+) ago$/, '$1') : ''].filter(Boolean).join(' · ');
}

/** For a screen reader: what the tile says. */
export function tileSaid(t: Tile, groupName?: string): string {
  const parts = [t.title, kindLine(t)];
  if (t.count) parts.push(`${t.count} ${t.count === 1 ? 'idea' : 'ideas'}`);
  if (groupName) parts.push(groupName);
  if (t.open) parts.push('a question is waiting for you');
  return parts.join(', ');
}

// ── the card that opens when one is pressed ──────────────────────────

export interface PreviewActs {
  onOpen: () => void;
  onStar: () => void;
  onHide: () => void;
  onLink?: () => void;
  onUnpin?: () => void;
  /** filed: a Project's id, or null for none */
  onMove?: (projectId: string | null) => void;
  onNewProject?: (name: string) => void;
  /** shown in a Project for its subject: filed there */
  onFileHere?: () => void;
  /** put in a subject by hand: back to the one it was read as */
  onUnsubject?: () => void;
  /** in order: the week it began in, as a map */
  onWeek?: () => void;
  /** on a map: where it is in time */
  onTime?: () => void;
  onClose: () => void;
}

export function PreviewCard({
  tile,
  home,
  suggested,
  starred,
  pinned,
  projects,
  links,
  acts,
  style,
  sheet,
}: {
  tile: Tile;
  /** where it is on the map by subject */
  home: { name: string } | null;
  /** shown in this Project for its subject, not filed there */
  suggested?: string | null;
  starred: boolean;
  pinned: boolean;
  projects: { id: string; name: string }[];
  links: { id: string; title: string; label: string }[];
  acts: PreviewActs;
  style?: CSSProperties;
  /** a phone: from the foot of the screen */
  sheet?: boolean;
}) {
  const [moving, setMoving] = useState(false);
  const [naming, setNaming] = useState<string | null>(null);
  const chat = tile.kind === 'core';
  return (
    <aside className={`l5h-pv${sheet ? ' is-sheet' : ''}`} style={style} role="dialog" aria-label={tile.title} onPointerDown={(e) => e.stopPropagation()}>
      <div className="l5h-pv-head">
        <span className="l5h-tile-k">
          <Glyph look={tile.look} size={13} />
          <span>{kindLine(tile)}</span>
          {home && <span className="l5h-pv-g">· {home.name}</span>}
        </span>
        <button type="button" className="l5h-x" aria-label="Close" onClick={acts.onClose}>
          ×
        </button>
      </div>
      <h3 className="l5h-pv-t">{tile.title}</h3>
      {tile.stands && <p className="l5h-pv-s">{tile.stands}</p>}
      {tile.made > 0 && (
        <p className="l5h-pv-made">
          <MadeMark n={tile.made} /> {tile.made === 1 ? 'Something was made in it — a chart, a plan or practice.' : `${tile.made} things were made in it — charts, plans or practice.`}
        </p>
      )}
      {tile.open && (
        <p className="l5h-pv-q">
          <span className="l5h-open" aria-hidden="true" /> Socria asked: <em>{tile.open}</em>
        </p>
      )}
      {suggested && acts.onFileHere && (
        <p className="l5h-pv-sugg">
          It is about {suggested}, but not filed in it.{' '}
          <button type="button" className="l5h-link" onClick={acts.onFileHere}>
            File it there
          </button>
        </p>
      )}
      {tile.key.length > 0 && (
        <div className="l5h-chips">
          {tile.ideas
            .slice()
            .sort((a, b) => b.degree - a.degree)
            // a study's topic and an idea of the same name are one idea
            .filter((n, i, all) => all.findIndex((m) => m.label.trim().toLowerCase() === n.label.trim().toLowerCase()) === i)
            .slice(0, 6)
            .map((n) => (
              <span key={n.id} className={`l5h-chip${n.from === 'topic' ? ' is-topic' : ''}`}>
                {n.label}
              </span>
            ))}
        </div>
      )}
      {links.length > 0 && (
        <p className="l5h-pv-links">
          Linked to{' '}
          {links.map((l, i) => (
            <span key={l.id}>
              {i > 0 && ', '}“{l.title}”{l.label ? ` — ${l.label}` : ''}
            </span>
          ))}
        </p>
      )}
      <div className="l5h-pv-acts">
        <button type="button" className="l5h-go" onClick={acts.onOpen}>
          {chat ? 'Open' : tile.open ? 'Answer it' : 'Continue'} <span aria-hidden="true">→</span>
        </button>
        <button type="button" className={`l5h-btn${starred ? ' is-on' : ''}`} aria-pressed={starred} onClick={acts.onStar}>
          <StarMark on={starred} /> {starred ? 'Starred' : 'Star'}
        </button>
        {acts.onMove && (
          <button type="button" className={`l5h-btn${moving ? ' is-on' : ''}`} aria-expanded={moving} onClick={() => setMoving((v) => !v)}>
            Move to…
          </button>
        )}
        {acts.onLink && (
          <button type="button" className="l5h-btn" onClick={acts.onLink}>
            Link to…
          </button>
        )}
        {acts.onWeek && (
          <button type="button" className="l5h-btn" onClick={acts.onWeek}>
            See that week as a map
          </button>
        )}
        {acts.onTime && (
          <button type="button" className="l5h-btn" onClick={acts.onTime} title="All time, at the day it began">
            Find it in time
          </button>
        )}
        {pinned && acts.onUnpin && (
          <button type="button" className="l5h-btn" onClick={acts.onUnpin}>
            Back in order
          </button>
        )}
        {acts.onUnsubject && (
          <button type="button" className="l5h-btn" onClick={acts.onUnsubject} title="You put it in this subject; this puts it back where it was read as belonging">
            Its own subject
          </button>
        )}
        <button type="button" className="l5h-btn is-quiet" onClick={acts.onHide}>
          Hide
        </button>
      </div>
      {moving && acts.onMove && (
        <div className="l5h-pv-move" role="menu" aria-label="Move to a Project">
          {projects.map((p) => (
            <button key={p.id} type="button" role="menuitem" className={`l5h-mi${tile.projectId === p.id ? ' is-on' : ''}`} onClick={() => (acts.onMove!(p.id), setMoving(false))}>
              {p.name}
            </button>
          ))}
          {tile.projectId && (
            <button type="button" role="menuitem" className="l5h-mi" onClick={() => (acts.onMove!(null), setMoving(false))}>
              Out of its Project
            </button>
          )}
          {acts.onNewProject &&
            (naming === null ? (
              <button type="button" role="menuitem" className="l5h-mi is-new" onClick={() => setNaming('')}>
                + New Project…
              </button>
            ) : (
              <form
                className="l5h-name"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (naming.trim()) acts.onNewProject!(naming.trim());
                  setNaming(null);
                  setMoving(false);
                }}
              >
                <input autoFocus value={naming} maxLength={80} placeholder="Name the Project" aria-label="Name the new Project" onChange={(e) => setNaming(e.target.value)} style={{ fontSize: 16 }} />
                <button type="submit" className="l5h-btn" disabled={!naming.trim()}>
                  Make it
                </button>
              </form>
            ))}
        </div>
      )}
    </aside>
  );
}

// ── find, or start ───────────────────────────────────────────────────

export interface Found {
  tile: Tile;
  match: Match;
  hidden: boolean;
  group: string;
}

/** A file put in the box: read here, in the browser, before anything is sent. */
interface BoxFile {
  id: string;
  name: string;
  status: 'reading' | 'ready' | 'error';
  att?: Attachment;
  error?: string;
}

/** at most this many files at once */
const BOX_MAX = 6;

/** The badge on a file: what kind of file it is, in three letters. */
export function fileType(name: string): string {
  const ext = (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? '').toLowerCase();
  if (ext === 'pdf') return 'PDF';
  if (['doc', 'docx', 'odt', 'rtf'].includes(ext)) return 'DOC';
  if (['ppt', 'pptx', 'odp', 'key'].includes(ext)) return 'PPT';
  if (['xls', 'xlsx', 'ods', 'csv', 'tsv'].includes(ext)) return 'XLS';
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'heic'].includes(ext)) return 'IMG';
  return 'TXT';
}

/**
 * One box, at the map's foot — where everything begins now that there is no
 * start screen. What is typed is looked for on the map (what does not match
 * dims) and the first answer is a press of Enter away; or, if nothing is
 * right, its round ↑ begins a new line of thinking with those words as its
 * first question. Files dropped on it (or on the map), or added with its
 * clip, are read here first; sent, Socria sorts them into topics. Its list
 * opens upward, over the map.
 */
export function FindOrStart({
  query,
  onQuery,
  found,
  resume,
  onPick,
  onStart,
  inputRef,
  readDocument,
  onStartFiles,
  picker,
  placeholder,
  takeRef,
}: {
  query: string;
  onQuery: (q: string) => void;
  found: Found[];
  resume: Tile | null;
  onPick: (t: Tile) => void;
  onStart: (text: string) => void;
  inputRef: React.RefObject<HTMLInputElement>;
  /** files can be put in it: each read here before it is sent */
  readDocument?: (file: File) => Promise<Attachment>;
  /** begun with files: Socria sorts them, with what was said about them */
  onStartFiles?: (text: string, atts: Attachment[], goal: Intent) => void;
  /** the model and how far it goes, in the box */
  picker?: ReactNode;
  /** what the empty box says (it says something else with files in it) */
  placeholder?: string;
  /** told how to take files dropped anywhere on the map */
  takeRef?: React.MutableRefObject<((files: File[]) => void) | null>;
}) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState(0);
  const [files, setFiles] = useState<BoxFile[]>([]);
  const [over, setOver] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const q = query.trim();
  const ready = files.filter((f) => f.status === 'ready' && f.att);
  const reading = files.some((f) => f.status === 'reading');
  const canFiles = !!readDocument && !!onStartFiles;

  async function take(list: FileList | File[]) {
    if (!readDocument) return;
    setNotice(null);
    const all = Array.from(list).slice(0, Math.max(0, BOX_MAX - files.length));
    if (list.length > all.length) setNotice(`Up to ${BOX_MAX} files at a time.`);
    for (const file of all) {
      const id = `f${++seq.current}`;
      setFiles((fs) => [...fs, { id, name: file.name, status: 'reading' }]);
      try {
        const att = await readDocument(file);
        setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, status: 'ready', att } : f)));
      } catch (e: unknown) {
        setFiles((fs) => fs.map((f) => (f.id === id ? { ...f, status: 'error', error: (e as Error)?.message || 'could not be read' } : f)));
      }
    }
  }
  if (takeRef) takeRef.current = canFiles ? (list) => void take(list) : null;

  /** begin: with the files, if there are any; else with the words; with neither, the box asks for them */
  const begin = () => {
    if (reading) return;
    if (ready.length && onStartFiles) {
      onStartFiles(q, ready.map((f) => f.att!), intentOf(q, ready.length));
      setFiles([]);
      onQuery('');
      return;
    }
    if (q) return onStart(q);
    inputRef.current?.focus();
  };

  const options: { key: string; run: () => void; el: ReactNode }[] = [];
  if (!q && resume && !files.length)
    options.push({
      key: 'resume',
      run: () => onPick(resume),
      el: (
        <>
          <span className="l5h-o-k">Pick up where you left off</span>
          <span className="l5h-o-t">{resume.title}</span>
        </>
      ),
    });
  if (!files.length)
    for (const f of found.slice(0, 6))
      options.push({
        key: f.tile.id,
        run: () => onPick(f.tile),
        el: (
          <>
            <span className="l5h-o-k">
              <Glyph look={f.tile.look} size={12} /> {f.group}
              {f.hidden ? ' · hidden' : ''}
            </span>
            <span className="l5h-o-t">{f.tile.title}</span>
            {f.match.why !== 'title' && <span className="l5h-o-s">{f.match.why === 'idea' ? `idea: ${f.match.said}` : f.match.said}</span>}
          </>
        ),
      });
  if (q && !files.length)
    options.push({
      key: 'start',
      run: () => onStart(q),
      el: (
        <>
          <span className="l5h-o-k">Start a new line of thinking</span>
          <span className="l5h-o-t">“{q}”</span>
        </>
      ),
    });
  useEffect(() => setAt(0), [query]);
  const pick = (i: number) => {
    const o = options[i];
    if (!o) return;
    setOpen(false);
    inputRef.current?.blur();
    o.run();
  };
  const said = files.length ? (reading ? 'Reading…' : 'Say what you are doing with these — or just press ↑') : placeholder ?? 'Search or start something new…';
  return (
    <div
      className={`l5h-find${open && options.length ? ' is-open' : ''}${files.length ? ' has-files' : ''}${over ? ' is-drop' : ''}`}
      onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOpen(false)}
      onDragEnter={(e) => canFiles && e.dataTransfer?.types?.includes('Files') && (e.preventDefault(), setOver(true))}
      onDragOver={(e) => canFiles && e.dataTransfer?.types?.includes('Files') && e.preventDefault()}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={(e) => {
        if (!canFiles || !e.dataTransfer?.files?.length) return;
        e.preventDefault();
        e.stopPropagation();
        setOver(false);
        void take(e.dataTransfer.files);
      }}
    >
      {files.length > 0 && (
        <ul className="l5h-files" aria-label="Files to sort">
          {files.map((f) => (
            <li key={f.id} className={`l5h-file is-${f.status}`} title={f.status === 'error' ? f.error : f.name}>
              <span className={`l5h-ftype is-${fileType(f.name).toLowerCase()}`} aria-hidden="true">
                {fileType(f.name)}
              </span>
              <span className="l5h-file-t">
                <span className="l5h-file-n">{f.name}</span>
                <span className="l5h-file-s">{f.status === 'reading' ? 'reading…' : f.status === 'error' ? f.error : f.att?.kind === 'doc' ? `${f.att.pages ?? 1} ${(f.att.pages ?? 1) === 1 ? 'page' : 'pages'}` : 'read'}</span>
              </span>
              <button type="button" className="l5h-file-x" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((x) => x.id !== f.id))}>
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="l5h-find-row">
        <input
          ref={inputRef}
          type="search"
          value={query}
          placeholder={said}
          aria-label="Find a conversation or an idea, or start a new line of thinking"
          role="combobox"
          aria-expanded={open && options.length > 0}
          aria-controls="l5h-find-list"
          aria-activedescendant={open && options.length ? `l5h-o-${at}` : undefined}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            onQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' && options.length) {
              e.preventDefault();
              setOpen(true);
              setAt((i) => Math.min(options.length - 1, i + 1));
            } else if (e.key === 'ArrowUp' && options.length) {
              e.preventDefault();
              setAt((i) => Math.max(0, i - 1));
            } else if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
              e.preventDefault();
              if (files.length) return begin();
              if (open && options[at]) return pick(at);
              const first = q && found[0] ? options.findIndex((o) => o.key === found[0].tile.id) : -1;
              if (first >= 0) pick(first);
              else begin();
            } else if (e.key === 'Escape') {
              if (query) onQuery('');
              else inputRef.current?.blur();
              setOpen(false);
            }
          }}
          style={{ fontSize: 16 }}
        />
        {q && !files.length && <span className="l5h-find-n">{found.length}</span>}
        {query && (
          <button
            type="button"
            className="l5h-find-x"
            aria-label="Clear"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              onQuery('');
              inputRef.current?.focus();
            }}
          >
            ×
          </button>
        )}
        {picker && <span className="l5h-find-pick">{picker}</span>}
        {canFiles && (
          <button type="button" className="l5h-find-att" aria-label="Add files — notes, slides, an exam review" title="Add files — notes, slides, an exam review. Or drop them anywhere on the map." onMouseDown={(e) => e.preventDefault()} onClick={() => fileRef.current?.click()}>
            <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M20.5 11.5l-8.3 8.3a5 5 0 0 1-7.1-7.1l8.6-8.6a3.4 3.4 0 0 1 4.8 4.8l-8.6 8.6a1.7 1.7 0 0 1-2.4-2.4l7.9-7.9" />
            </svg>
          </button>
        )}
        <button
          type="button"
          className="l5h-find-go"
          disabled={reading}
          aria-label={ready.length ? `Sort ${ready.length === 1 ? 'this file' : `these ${ready.length} files`} into topics` : q ? `Start a new line of thinking: ${q}` : 'Start a new line of thinking'}
          title={ready.length ? 'Sort them into topics' : q ? 'Start something new with this' : 'Type what you are working on, or add your notes'}
          onMouseDown={(e) => e.preventDefault()}
          onClick={begin}
        >
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 19V5M6 11l6-6 6 6" />
          </svg>
        </button>
      </div>
      {canFiles && (
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={STUDY_ACCEPT}
          hidden
          onChange={(e) => {
            if (e.target.files?.length) void take(e.target.files);
            e.target.value = '';
          }}
        />
      )}
      {notice && <p className="l5h-find-note">{notice}</p>}
      {open && options.length > 0 && (
        <div className="l5h-find-list" id="l5h-find-list" role="listbox" aria-label="Found, or start">
          {options.map((o, i) => (
            <button
              key={o.key}
              id={`l5h-o-${i}`}
              type="button"
              role="option"
              aria-selected={i === at}
              className={`l5h-o${i === at ? ' is-on' : ''}${o.key === 'start' ? ' is-start' : ''}`}
              onMouseEnter={() => setAt(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(i)}
            >
              {o.el}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── the View menu ────────────────────────────────────────────────────

const LABEL_SAID: Record<LabelLevel, string> = { minimal: 'Minimal', titles: 'Titles', ideas: 'Ideas' };
const COLOR_SAID: Record<ColorBy, string> = { project: 'Subject', kind: 'Kind', recency: 'Recency' };
/** a hub's size: how much it holds, how recent it is, or all alike */
const SIZE_SAID: Record<SizeBy, string> = { ideas: 'Depth', recency: 'Recency', same: 'Same' };

function Seg<T extends string>({ label, value, options, said, onPick }: { label: string; value: T; options: readonly T[]; said: Record<T, string>; onPick: (v: T) => void }) {
  return (
    <div className="l5h-vm-row">
      <span className="l5h-vm-l">{label}</span>
      <div className="l5h-seg" role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button key={o} type="button" role="radio" aria-checked={value === o} className={value === o ? 'is-on' : ''} onClick={() => onPick(o)}>
            {said[o]}
          </button>
        ))}
      </div>
    </div>
  );
}

function Check({ label, on, onFlip, hint }: { label: string; on: boolean; onFlip: () => void; hint?: string }) {
  return (
    <label className="l5h-vm-check">
      <input type="checkbox" checked={on} onChange={onFlip} />
      <span>{label}</span>
      {hint && <em>{hint}</em>}
    </label>
  );
}

export function ViewMenu({
  arr,
  lens,
  groups,
  hasChats = true,
  hiddenCount,
  onDisplay,
  onProjects,
  onSaveView,
  onApplyView,
  onRemoveView,
  onTray,
  onNote,
  onReset,
  onAtlas,
  onClose,
}: {
  arr: Arrangement;
  lens: HomeMode;
  /** every subject there is — Projects, courses, fields — to choose which are shown */
  groups: { key: string; name: string }[];
  /** any Core chat drawn by its name alone (signed out); signed in, every chat is a conversation here and there is nothing to put away */
  hasChats?: boolean;
  hiddenCount: number;
  onDisplay: (patch: Partial<Display>) => void;
  onProjects: (keys: string[] | null) => void;
  onSaveView: (name: string) => void;
  onApplyView: (id: string) => void;
  onRemoveView: (id: string) => void;
  onTray: () => void;
  onNote?: () => void;
  onReset: () => void;
  onAtlas?: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [sure, setSure] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (ref.current && !ref.current.contains(t) && !t?.closest?.('.l5h-viewbtn')) onClose();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', esc);
    };
  }, [onClose]);
  const shown = (k: string) => !arr.projects || arr.projects.includes(k);
  // in order (This month, All time) the line itself is the picture: nothing is placed, coloured or sized another way
  const inTime = lens === 'month' || lens === 'all';
  return (
    <div className="l5h-vm" ref={ref} role="dialog" aria-label="How the map is shown">
      <section>
        <h4>Show</h4>
        {hasChats && <Check label="Core chats" on={arr.display.chats} onFlip={() => onDisplay({ chats: !arr.display.chats })} />}
        {!inTime && <Check label="Ideas they share" on={arr.display.ideas} onFlip={() => onDisplay({ ideas: !arr.display.ideas })} />}
        {!inTime && (
          <>
            <Seg label="Labels" value={arr.display.labels} options={LABELS} said={LABEL_SAID} onPick={(v) => onDisplay({ labels: v })} />
            <Seg label="Colour by" value={arr.display.color} options={COLOR_BY} said={COLOR_SAID} onPick={(v) => onDisplay({ color: v })} />
            <Seg label="Size by" value={arr.display.size} options={SIZE_BY} said={SIZE_SAID} onPick={(v) => onDisplay({ size: v })} />
          </>
        )}
        {inTime && <p className="l5h-vm-note">In order: each where it began, joined when it followed on within a week.</p>}
      </section>
      {groups.length > 1 && (
        <section>
          <h4>
            Subjects{' '}
            {arr.projects && (
              <button type="button" className="l5h-link" onClick={() => onProjects(null)}>
                show all
              </button>
            )}
          </h4>
          {groups.map((g) => (
            <Check
              key={g.key}
              label={g.name}
              on={shown(g.key)}
              onFlip={() => {
                const cur = arr.projects ?? groups.map((x) => x.key);
                const next = shown(g.key) ? cur.filter((k) => k !== g.key) : [...cur, g.key];
                onProjects(next.length === groups.length ? null : next);
              }}
            />
          ))}
        </section>
      )}
      <section>
        <h4>Saved views</h4>
        {arr.views.map((v) => (
          <div key={v.id} className="l5h-vm-view">
            <button type="button" className="l5h-link" onClick={() => onApplyView(v.id)}>
              {v.name}
            </button>
            <button type="button" className="l5h-x" aria-label={`Forget the view “${v.name}”`} onClick={() => onRemoveView(v.id)}>
              ×
            </button>
          </div>
        ))}
        <form
          className="l5h-name"
          onSubmit={(e) => {
            e.preventDefault();
            if (!name.trim()) return;
            onSaveView(name.trim());
            setName('');
          }}
        >
          <input value={name} maxLength={40} placeholder="Name this view to keep it" aria-label="Name this view" onChange={(e) => setName(e.target.value)} style={{ fontSize: 16 }} />
          <button type="submit" className="l5h-btn" disabled={!name.trim()}>
            Save
          </button>
        </form>
      </section>
      <section className="l5h-vm-acts">
        {hiddenCount > 0 && (
          <button type="button" className="l5h-btn" onClick={onTray}>
            Hidden · {hiddenCount}
          </button>
        )}
        {onNote && (
          <button type="button" className="l5h-btn" onClick={onNote}>
            Add a note
          </button>
        )}
        {sure ? (
          <span className="l5h-sure">
            Open every folded subject again?{' '}
            <button type="button" className="l5h-btn is-danger" onClick={() => (onReset(), setSure(false))}>
              Reset
            </button>{' '}
            <button type="button" className="l5h-btn" onClick={() => setSure(false)}>
              Keep
            </button>
          </span>
        ) : (
          <button type="button" className="l5h-btn is-quiet" onClick={() => setSure(true)}>
            Reset layout
          </button>
        )}
        {onAtlas && (
          <button type="button" className="l5h-btn" onClick={onAtlas}>
            Everything remembered
          </button>
        )}
      </section>
    </div>
  );
}

// ── hidden, and chosen ───────────────────────────────────────────────

export function HiddenTray({ tiles, onShow, onShowAll, onClose }: { tiles: Tile[]; onShow: (id: string) => void; onShowAll: () => void; onClose: () => void }) {
  return (
    <div className="l5h-tray" role="dialog" aria-label="Hidden from the map">
      <div className="l5h-pv-head">
        <span className="l5h-tile-k">Hidden from the map · {tiles.length}</span>
        <button type="button" className="l5h-x" aria-label="Close" onClick={onClose}>
          ×
        </button>
      </div>
      <p className="l5h-tray-p">Still here, and still found by search — only not drawn.</p>
      <div className="l5h-tray-list">
        {tiles.map((t) => (
          <div key={t.id} className="l5h-tray-i">
            <Glyph look={t.look} size={13} />
            <span className="l5h-tray-t">{t.title}</span>
            <button type="button" className="l5h-btn" onClick={() => onShow(t.id)}>
              Show
            </button>
          </div>
        ))}
      </div>
      {tiles.length > 1 && (
        <button type="button" className="l5h-btn" onClick={onShowAll}>
          Show them all
        </button>
      )}
    </div>
  );
}

export function ActionBar({
  count,
  pinned,
  projects,
  onNewProject,
  onMove,
  onStar,
  onHide,
  onUnpin,
  onClear,
}: {
  count: number;
  pinned: boolean;
  projects: { id: string; name: string }[];
  onNewProject?: (name: string) => void;
  onMove?: (projectId: string | null) => void;
  onStar: () => void;
  onHide: () => void;
  onUnpin: () => void;
  onClear: () => void;
}) {
  const [naming, setNaming] = useState<string | null>(null);
  const [moving, setMoving] = useState(false);
  return (
    <div className="l5h-bar-sel" role="toolbar" aria-label={`${count} chosen`}>
      <span className="l5h-bar-n">{count} chosen</span>
      {naming !== null ? (
        <form
          className="l5h-name"
          onSubmit={(e) => {
            e.preventDefault();
            if (naming.trim() && onNewProject) onNewProject(naming.trim());
            setNaming(null);
          }}
        >
          <input autoFocus value={naming} maxLength={80} placeholder="Name the Project" aria-label="Name the new Project" onChange={(e) => setNaming(e.target.value)} style={{ fontSize: 16 }} />
          <button type="submit" className="l5h-go" disabled={!naming.trim()}>
            Make it
          </button>
          <button type="button" className="l5h-btn" onClick={() => setNaming(null)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          {onNewProject && (
            <button type="button" className="l5h-go" onClick={() => setNaming('')}>
              New Project from these
            </button>
          )}
          {onMove && projects.length > 0 && (
            <span className="l5h-rel">
              <button type="button" className={`l5h-btn${moving ? ' is-on' : ''}`} aria-expanded={moving} onClick={() => setMoving((v) => !v)}>
                Move to…
              </button>
              {moving && (
                <span className="l5h-pv-move is-up" role="menu">
                  {projects.map((p) => (
                    <button key={p.id} type="button" role="menuitem" className="l5h-mi" onClick={() => (onMove(p.id), setMoving(false))}>
                      {p.name}
                    </button>
                  ))}
                  <button type="button" role="menuitem" className="l5h-mi" onClick={() => (onMove(null), setMoving(false))}>
                    Out of their Projects
                  </button>
                </span>
              )}
            </span>
          )}
          <button type="button" className="l5h-btn" onClick={onStar}>
            <StarMark /> Star
          </button>
          <button type="button" className="l5h-btn" onClick={onHide}>
            Hide
          </button>
          {pinned && (
            <button type="button" className="l5h-btn" onClick={onUnpin}>
              Back in order
            </button>
          )}
          <button type="button" className="l5h-x" aria-label="Choose none" onClick={onClear}>
            ×
          </button>
        </>
      )}
    </div>
  );
}
