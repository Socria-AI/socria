'use client';
// components/ux-v0/studio/StudioHome.tsx — the SocriaUX home: one question, one place to answer it.
//
// Chat-first: a single composer to say what to make, with files, pictures and links, and the design system it is made
// in. Six kinds of work can be chosen — Graphic, Website, Logo, Design system, Board, Critique — each said plainly
// with how it goes; or nothing is chosen and the words are read (lib/ux-v0/studio/intent.ts) to route them, with the
// reading shown live and a question asked instead of a guess when it is not clear. Below: the works still in
// conversation or in progress, and everything made, searchable. One platform, six capabilities; each opens the engine
// its workspace already uses.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectSummary } from '@/lib/ux-v0/types';
import type { StudioMode } from '@/lib/ux-v0/studio/schema';
import { MODES, modeInfo } from '@/lib/ux-v0/studio/modes';
import { attachmentKindOf, recognizeIntent } from '@/lib/ux-v0/studio/intent';
import { modeOptions } from '@/lib/ux-v0/studio/discovery';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { Collection, Plate, kindLine, type RemoteWork } from './Collection';
import { SystemPicker } from './SystemPicker';
import { Arrow, ArrowUp, Attach, Close, FileMark, LinkMark, ModeGlyph } from './glyphs';

export interface BeginRequest {
  prompt: string;
  mode: StudioMode;
  modeBy: 'person' | 'recognised';
  files: File[];
}

interface Props {
  signedIn: boolean;
  ready: boolean;
  list: ProjectSummary[];
  elsewhere: RemoteWork[];
  error: string;
  nonce: string;
  systems: readonly SystemRecord[];
  systemId: string | null;
  onSystem: (id: string | null) => void;
  onBegin: (r: BeginRequest) => Promise<void> | void;
  /** a design brought to critique: opened at once (it is the request) */
  onCritique: (file: File, words: string) => void;
  onSystems: () => void;
  onOpen: (id: string) => void;
  onDelete: (s: ProjectSummary) => void;
}

type Choice = StudioMode | 'auto';

const PLACEHOLDER: Record<Choice, string> = {
  auto: 'Describe what you want to make…',
  graphic: 'A poster for “Field Lines”, a creative coding night…',
  website: 'A website for a yoga studio, with bookings…',
  logo: 'A logo for “Halden”, a small coffee roastery…',
  system: 'Bring in our tokens, guidelines, website or Figma…',
  board: 'A launch campaign: two posters, three posts and a website…',
  critique: 'What should we look at? The hierarchy, the words, the call to action… (optional)',
};

const AUTO_EXAMPLES = ['A poster for “Field Lines”, a creative coding night', 'A logo for “Halden”, a small coffee roastery', 'A website for a yoga studio, with bookings', 'A launch campaign: two posters, three posts and a website'];

const CRITIQUE_ACCEPT = '.html,.htm,.png,.jpg,.jpeg,.svg,text/html,image/png,image/jpeg,image/svg+xml';
const ANY_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.svg,.json,.css,.scss,.pdf,.ttf,.otf,.woff,.woff2,.html,.htm,image/*,application/json,text/css,application/pdf,text/html';

export function StudioHome(p: Props) {
  const [words, setWords] = useState('');
  const [choice, setChoice] = useState<Choice>('auto');
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  const [clarify, setClarify] = useState<ReturnType<typeof modeOptions> | null>(null);
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(() => recognizeIntent(''));
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);
  const modesRef = useRef<HTMLDivElement>(null);

  // the reading follows the words, a moment after typing stops
  const kinds = useMemo(() => files.map((f) => ({ kind: attachmentKindOf(f) })), [files]);
  useEffect(() => {
    const t = window.setTimeout(() => setReading(recognizeIntent(words, kinds)), 140);
    return () => window.clearTimeout(t);
  }, [words, kinds]);

  // pictures shown small in the composer, by object address, let go when they leave it
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of files) if (/^image\//.test(f.type)) next[`${f.name}|${f.size}`] = thumbs[`${f.name}|${f.size}`] ?? URL.createObjectURL(f);
    for (const [k, u] of Object.entries(thumbs)) if (!next[k]) URL.revokeObjectURL(u);
    setThumbs(next);
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  // the textarea grows with what is said
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(260, el.scrollHeight)}px`;
  }, [words]);

  const critique = choice === 'critique';
  const add = (list: FileList | File[] | null) => {
    const xs = [...(list ?? [])];
    if (!xs.length) return;
    if (critique) return p.onCritique(xs[0], words.trim());
    setFiles((cur) => [...cur, ...xs.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))].slice(0, 12));
    setClarify(null);
  };

  const begin = async (forced?: StudioMode) => {
    const text = [words.trim(), link.trim()].filter(Boolean).join(' ');
    if (!text && !files.length && !forced && choice !== 'critique' && choice !== 'system') {
      field.current?.focus();
      return;
    }
    const r = recognizeIntent(text, kinds);
    const mode = forced ?? (choice === 'auto' ? r.mode : choice);
    if (!mode) {
      setClarify(modeOptions(r.ranked));
      return;
    }
    setClarify(null);
    setBusy(true);
    try {
      await p.onBegin({ prompt: text, mode, modeBy: forced || choice !== 'auto' ? 'person' : 'recognised', files });
    } finally {
      setBusy(false);
    }
  };

  const pick = (c: Choice) => {
    setChoice(c);
    setClarify(null);
  };

  const info = choice === 'auto' ? null : modeInfo(choice);
  const top = reading.ranked[0];
  const second = reading.ranked[1];
  const readout = (() => {
    if (choice !== 'auto') return null;
    if (!words.trim() && !files.length) return { glyph: null as StudioMode | null, text: 'SocriaUX reads what you say and takes it to the right place.' };
    if (reading.mode) return { glyph: reading.mode, text: `Reads as ${modeInfo(reading.mode).label.toLowerCase()} — ${reading.ranked[0].why[0] ?? 'from your words'}` };
    if (top && top.score > 0 && second && second.score > 0) return { glyph: null, text: `Could be ${modeInfo(top.mode).label.toLowerCase()} or ${modeInfo(second.mode).label.toLowerCase()}: you will be asked.` };
    if (top && top.score > 0) return { glyph: null, text: `Perhaps ${modeInfo(top.mode).label.toLowerCase()}. Say a little more, or choose below.` };
    return { glyph: null, text: 'Say what it is and who it is for, or choose below.' };
  })();

  // the works in progress first: conversations still going, then what changed last
  const recent = useMemo(() => [...p.list].sort((a, b) => Number(b.studio?.status === 'discovering') - Number(a.studio?.status === 'discovering') || b.updatedAt - a.updatedAt).slice(0, 4), [p.list]);

  const onModesKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
    e.preventDefault();
    const all: Choice[] = ['auto', ...MODES.map((m) => m.mode)];
    const i = all.indexOf(choice);
    const j = e.key === 'Home' ? 0 : e.key === 'End' ? all.length - 1 : (i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + all.length) % all.length;
    pick(all[j]);
    window.setTimeout(() => modesRef.current?.querySelector<HTMLButtonElement>(`[data-mode="${all[j]}"]`)?.focus(), 0);
  };

  return (
    <div className="v0-home-page sb mu sd sd-home">
      <a className="mu-skip" href="#collection">
        Skip to your work
      </a>
      <header className="sd-mast">
        <a className="sd-mark" href="/" aria-label="Socria, home">
          <img src="/socria-mark.png" alt="" width={20} height={20} />
          <span className="sd-wordmark">
            Socria<em>UX</em>
          </span>
        </a>
        <nav className="sd-mast-nav" aria-label="SocriaUX">
          <button type="button" className="sd-textlink" onClick={p.onSystems}>
            Design systems
          </button>
          <a className="sd-textlink" href="#collection">
            Your work
          </a>
          {p.signedIn ? (
            <a className="sd-textlink" href="/account">
              Account
            </a>
          ) : (
            <a className="sd-pill is-quiet" href="/sign-in?redirect_url=/ux-v0">
              Sign in
            </a>
          )}
        </nav>
      </header>

      <main>
        <section className="sd-hero" id="begin" aria-labelledby="sd-hello">
          <p className="sd-kicker">
            <span>SocriaUX</span>
            <span aria-hidden="true">·</span>
            <span>Design, by asking first</span>
          </p>
          <h1 className="sd-hello" id="sd-hello">
            What do you want to <em>make</em>?
          </h1>
          <p className="sd-stand">Say it in a sentence. SocriaUX asks only what it needs, shows you choices drawn from your own words, and begins as soon as there is enough.</p>

          <form
            className={`sd-composer v0-intent-line${critique ? ' v0-way-drop is-critique' : ''}${over ? ' is-over' : ''}`}
            onSubmit={(e) => {
              e.preventDefault();
              void begin();
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setOver(false);
              add(e.dataTransfer.files);
            }}
          >
            {critique && (
              <div className="sd-door">
                <FileMark size={20} />
                <p className="sd-door-t">Bring a design to look at closely.</p>
                <p className="sd-door-b">HTML, PNG, JPG or SVG — drop it here, or choose one. It stays in this browser.</p>
                <button type="button" className="sd-pill is-quiet" onClick={() => fileInput.current?.click()}>
                  Choose a file
                </button>
              </div>
            )}
            <label htmlFor="sd-words" className="v0-sr">
              What do you want to make?
            </label>
            <textarea
              id="sd-words"
              ref={field}
              rows={critique ? 1 : 2}
              value={words}
              placeholder={PLACEHOLDER[choice]}
              aria-label="What do you want to make?"
              onChange={(e) => (setWords(e.target.value.slice(0, 2000)), setClarify(null))}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !critique) {
                  e.preventDefault();
                  void begin();
                }
              }}
            />
            {(files.length > 0 || link) && (
              <ul className="sd-attached" aria-label="Brought in">
                {files.map((f) => (
                  <li key={`${f.name}|${f.size}`} className="sd-att">
                    {thumbs[`${f.name}|${f.size}`] ? <img src={thumbs[`${f.name}|${f.size}`]} alt="" /> : <FileMark size={15} />}
                    <span className="sd-att-n">{f.name}</span>
                    <button type="button" className="sd-icon is-small" aria-label={`Remove ${f.name}`} onClick={() => setFiles((xs) => xs.filter((x) => x !== f))}>
                      <Close size={13} />
                    </button>
                  </li>
                ))}
                {link && (
                  <li className="sd-att is-link">
                    <LinkMark size={15} />
                    <span className="sd-att-n">{link}</span>
                    <button type="button" className="sd-icon is-small" aria-label="Remove the link" onClick={() => setLink('')}>
                      <Close size={13} />
                    </button>
                  </li>
                )}
              </ul>
            )}
            {linking && (
              <div className="sd-linkrow">
                <LinkMark size={15} />
                <input
                  ref={linkInput}
                  type="url"
                  placeholder="https:// — a website, or a Figma file"
                  aria-label="A link to bring in"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      const v = e.currentTarget.value.trim();
                      if (/^https?:\/\/\S+$/i.test(v)) (setLink(v.slice(0, 400)), setLinking(false));
                    }
                    if (e.key === 'Escape') setLinking(false);
                  }}
                />
                <button
                  type="button"
                  className="sd-pill is-quiet is-sm"
                  onClick={() => {
                    const v = linkInput.current?.value.trim() ?? '';
                    if (/^https?:\/\/\S+$/i.test(v)) (setLink(v.slice(0, 400)), setLinking(false));
                  }}
                >
                  Add
                </button>
              </div>
            )}
            <div className="sd-bar">
              {!critique && (
                <>
                  <button type="button" className="sd-icon" onClick={() => fileInput.current?.click()} aria-label="Attach files or pictures" title="Attach files or pictures">
                    <Attach size={18} />
                  </button>
                  <button type="button" className="sd-icon" onClick={() => setLinking((v) => !v)} aria-label="Add a link" title="Add a link" aria-expanded={linking}>
                    <LinkMark size={18} />
                  </button>
                </>
              )}
              {choice !== 'critique' && choice !== 'system' && <SystemPicker systems={p.systems} value={p.systemId} onChange={p.onSystem} onManage={p.onSystems} onImport={() => pick('system')} />}
              <span className="sd-bar-gap" />
              {readout && (
                <span className="sd-reading" aria-live="polite">
                  {readout.glyph && <ModeGlyph mode={readout.glyph} size={15} />}
                  {readout.text}
                </span>
              )}
              <button type="submit" className="sd-begin" disabled={busy}>
                Begin
                <ArrowUp size={16} />
              </button>
            </div>
            <input ref={fileInput} type="file" hidden multiple={!critique} accept={critique ? CRITIQUE_ACCEPT : ANY_ACCEPT} onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
          </form>

          {clarify && (
            <section className="sd-clarify" aria-labelledby="sd-clarify-t">
              <p className="sd-said" id="sd-clarify-t">
                I’m not sure yet what this is. Which of these?
              </p>
              <div className="sd-cards is-small" role="group" aria-label="What are we making?">
                {clarify.map((o, i) => (
                  <button key={o.id} type="button" className="sd-card" style={{ ['--i' as string]: i }} onClick={() => void begin(o.id as StudioMode)}>
                    <span className="sd-sketch is-glyph" aria-hidden="true">
                      <ModeGlyph mode={o.id as StudioMode} size={26} />
                    </span>
                    <span className="sd-card-text">
                      <span className="sd-card-label">
                        {o.label}
                        {o.recommended && <span className="sd-likely">Likely</span>}
                      </span>
                      {o.hint && <span className="sd-card-hint">{o.hint}</span>}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="sd-modes" role="radiogroup" aria-label="What you are making" ref={modesRef} onKeyDown={onModesKey}>
            {(['auto', ...MODES.map((m) => m.mode)] as Choice[]).map((c) => {
              const on = choice === c;
              return (
                <button key={c} type="button" role="radio" aria-checked={on} tabIndex={on ? 0 : -1} data-mode={c} className={`sd-mode-pill${on ? ' is-on' : ''}`} onClick={() => pick(c)}>
                  {c === 'auto' ? <span className="sd-auto-dot" aria-hidden="true" /> : <ModeGlyph mode={c} size={16} />}
                  {c === 'auto' ? 'Any' : modeInfo(c).label}
                </button>
              );
            })}
          </div>

          <div className="sd-modecard" key={choice}>
            {info ? (
              <>
                <p className="sd-modecard-t">
                  <ModeGlyph mode={info.mode} size={18} />
                  <span>{info.line}</span>
                </p>
                <p className="sd-modecard-d">{info.does}</p>
                <p className="sd-examples">
                  {info.examples.map((x) => (
                    <button key={x} type="button" className="sd-example" onClick={() => (setWords(x), field.current?.focus())}>
                      {x}
                      <Arrow size={13} />
                    </button>
                  ))}
                </p>
              </>
            ) : (
              <>
                <p className="sd-modecard-d">Graphics, websites, logos, design systems, boards and critiques — one place to begin any of them. Say it your way; you will be asked only what matters.</p>
                <p className="sd-examples">
                  {AUTO_EXAMPLES.map((x) => (
                    <button key={x} type="button" className="sd-example" onClick={() => (setWords(x), field.current?.focus())}>
                      {x}
                      <Arrow size={13} />
                    </button>
                  ))}
                </p>
              </>
            )}
          </div>

          {p.error && (
            <p className="v0-error-line sd-error" role="alert">
              {p.error}
            </p>
          )}
        </section>

        {recent.length > 0 && (
          <section className="sd-recent" aria-labelledby="sd-recent-t">
            <div className="sd-sec-head">
              <h2 className="sd-h2" id="sd-recent-t">
                Pick up where you left off
              </h2>
            </div>
            <ul className="sd-recent-list">
              {recent.map((s, i) => (
                <li key={s.id} className="sd-recent-item" style={{ ['--i' as string]: i }}>
                  <div className="sd-recent-plate">
                    <Plate s={s} ratio={4 / 3} nonce={p.nonce} />
                  </div>
                  <p className="sd-recent-k">{s.studio?.status === 'discovering' ? 'In conversation' : kindLine(s)}</p>
                  <button type="button" className="sd-recent-open" onClick={() => p.onOpen(s.id)}>
                    {s.name || 'Untitled'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <Collection signedIn={p.signedIn} ready={p.ready} list={p.list} elsewhere={p.elsewhere} nonce={p.nonce} onOpen={p.onOpen} onDelete={p.onDelete} onBegin={() => field.current?.focus()} />
      </main>

      <footer className="mu-colophon sd-colophon">
        <div className="mu-colophon-mark">
          <img src="/socria-mark.png" alt="" width={18} height={18} />
          <span className="mu-wordmark">Socria</span>
          <span className="mu-tagline">Think for yourself.</span>
        </div>
        <p>SocriaUX asks before it designs, shows its working, and keeps every decision yours. Nothing on this page calls a model.</p>
        <p className="mu-colophon-q">
          <a className="sb-link is-meta" href="/">
            Socria
          </a>
          {p.signedIn && (
            <a className="sb-link is-meta" href="/account">
              Account
            </a>
          )}
        </p>
      </footer>
    </div>
  );
}
