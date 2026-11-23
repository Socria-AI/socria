'use client';
// components/ux-v0/studio/StudioHome.tsx — the SocriaUX home: one question, one place to answer it.
//
// One composer and nothing else to read past: say what to make in your own words, paste a brief, drop in pictures,
// screenshots or references, add a link. No kinds of work to choose from, no palettes, no styles, no templates: the
// words are read (lib/ux-v0/studio/intent.ts) and taken to the right place, the reading shown as it forms, and a
// question asked instead of a guess when it is not clear. What has been made lives in its own view (?work=1); the home
// offers only a quiet way back to what was in progress.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { ProjectSummary } from '@/lib/ux-v0/types';
import type { StudioMode } from '@/lib/ux-v0/studio/schema';
import { modeInfo } from '@/lib/ux-v0/studio/modes';
import { attachmentKindOf, recognizeIntent } from '@/lib/ux-v0/studio/intent';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { kindLine } from './Collection';
import { SystemPicker, usableSystems } from './SystemPicker';
import { ArrowUp, Attach, Close, FileMark, LinkMark, ModeGlyph } from './glyphs';

export interface BeginRequest {
  prompt: string;
  mode: StudioMode;
  modeBy: 'person' | 'recognised' | 'unsure';
  files: File[];
}

interface Props {
  signedIn: boolean;
  list: ProjectSummary[];
  error: string;
  systems: readonly SystemRecord[];
  systemId: string | null;
  onSystem: (id: string | null) => void;
  /** resolves 'refused' when what was attached cannot be taken (it is then let go from the composer) */
  onBegin: (r: BeginRequest) => Promise<'refused' | void> | void;
  onSystems: () => void;
  /** everything made, in its own view */
  onWork: () => void;
  onOpen: (id: string) => void;
}

const ANY_ACCEPT = '.png,.jpg,.jpeg,.webp,.gif,.svg,.json,.css,.scss,.pdf,.ttf,.otf,.woff,.woff2,.html,.htm,image/*,application/json,text/css,application/pdf,text/html';

export function StudioHome(p: Props) {
  const [words, setWords] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [linking, setLinking] = useState(false);
  const [link, setLink] = useState('');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reading, setReading] = useState(() => recognizeIntent(''));
  const field = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const linkInput = useRef<HTMLInputElement>(null);

  // the reading follows the words, a moment after typing stops
  const kinds = useMemo(() => files.map((f) => ({ kind: attachmentKindOf(f) })), [files]);
  useEffect(() => {
    const t = window.setTimeout(() => setReading(recognizeIntent([words, link].filter(Boolean).join(' '), kinds)), 140);
    return () => window.clearTimeout(t);
  }, [words, link, kinds]);

  // pictures shown small in the composer, by object address, let go when they leave it
  useEffect(() => {
    const next: Record<string, string> = {};
    for (const f of files) if (/^image\//.test(f.type)) next[`${f.name}|${f.size}`] = thumbs[`${f.name}|${f.size}`] ?? URL.createObjectURL(f);
    for (const [k, u] of Object.entries(thumbs)) if (!next[k]) URL.revokeObjectURL(u);
    setThumbs(next);
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  // the textarea grows with what is said (a brief pasted in can be long)
  useEffect(() => {
    const el = field.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(320, el.scrollHeight)}px`;
  }, [words]);

  useEffect(() => field.current?.focus(), []);

  const add = (list: FileList | File[] | null) => {
    const xs = [...(list ?? [])];
    if (!xs.length) return;
    setFiles((cur) => [...cur, ...xs.filter((f) => !cur.some((c) => c.name === f.name && c.size === f.size))].slice(0, 12));
  };

  const begin = async () => {
    const text = [words.trim(), link.trim()].filter(Boolean).join(' ');
    if (!text && !files.length) {
      field.current?.focus();
      return;
    }
    const r = recognizeIntent(text, kinds);
    // words that do not settle the kind of work begin the conversation anyway: its first question is what it is
    const likeliest = [...r.ranked].sort((x, y) => y.score - x.score)[0];
    const mode: StudioMode = r.mode ?? (likeliest && likeliest.score > 0 ? likeliest.mode : 'graphic');
    setBusy(true);
    try {
      if ((await p.onBegin({ prompt: text, mode, modeBy: r.mode ? 'recognised' : 'unsure', files })) === 'refused') setFiles([]);
    } finally {
      setBusy(false);
    }
  };

  const top = reading.ranked[0];
  const second = reading.ranked[1];
  const said = !!(words.trim() || link || files.length);
  const readout = (() => {
    if (!said) return null;
    if (reading.mode) return { glyph: reading.mode, text: `Reads as ${modeInfo(reading.mode).label.toLowerCase()}` };
    if (top && top.score > 0 && second && second.score > 0) return { glyph: null as StudioMode | null, text: `${modeInfo(top.mode).label} or ${modeInfo(second.mode).label.toLowerCase()}? You will be asked.` };
    return { glyph: null as StudioMode | null, text: 'I’ll ask what it is.' };
  })();

  // what was in progress: conversations still going first, then what changed last
  const recent = useMemo(() => [...p.list].sort((a, b) => Number(b.studio?.status === 'discovering') - Number(a.studio?.status === 'discovering') || b.updatedAt - a.updatedAt).slice(0, 3), [p.list]);
  const systemsHere = usableSystems(p.systems).length > 0;

  return (
    <div className="v0-home-page sb mu sd sd-home is-minimal">
      <header className="sd-mast">
        <a className="sd-mark" href="/" aria-label="Socria, home">
          <img src="/socria-mark.png" alt="" width={20} height={20} />
          <span className="sd-wordmark">
            Socria<em>UX</em>
          </span>
        </a>
        <nav className="sd-mast-nav" aria-label="SocriaUX">
          <button type="button" className="sd-textlink" onClick={p.onWork}>
            Your work
          </button>
          <button type="button" className="sd-textlink" onClick={p.onSystems}>
            Design systems
          </button>
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

      <main className="sd-hero" id="begin" aria-labelledby="sd-hello">
        <h1 className="sd-hello" id="sd-hello">
          What do you want to <em>make</em>?
        </h1>
        <p className="sd-stand">Describe it in your own words, paste a brief, or bring pictures and references. SocriaUX asks what matters, looks for real inspiration, then makes it with you.</p>

        <form
          className={`sd-composer v0-intent-line${over ? ' is-over' : ''}`}
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
          <label htmlFor="sd-words" className="v0-sr">
            What do you want to make?
          </label>
          <textarea
            id="sd-words"
            ref={field}
            rows={3}
            value={words}
            aria-label="What do you want to make?"
            placeholder="A poster for a creative coding night, a logo for a coffee roastery, a website that takes bookings…"
            onChange={(e) => setWords(e.target.value.slice(0, 4000))}
            onPaste={(e) => {
              // a screenshot or picture pasted is brought in; pasted words stay words
              const pics = [...e.clipboardData.files];
              if (pics.length) {
                e.preventDefault();
                add(pics.map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `Pasted ${new Date().toLocaleTimeString().replace(/[^\d]/g, '')}${i ? `-${i}` : ''}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`, { type: f.type }))));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
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
                placeholder="https:// — a website, a reference, or a Figma file"
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
            <button type="button" className="sd-icon" onClick={() => fileInput.current?.click()} aria-label="Attach files, pictures or screenshots" title="Attach files, pictures or screenshots">
              <Attach size={18} />
            </button>
            <button type="button" className="sd-icon" onClick={() => setLinking((v) => !v)} aria-label="Add a link" title="Add a link" aria-expanded={linking}>
              <LinkMark size={18} />
            </button>
            {systemsHere && <SystemPicker systems={p.systems} value={p.systemId} onChange={p.onSystem} onManage={p.onSystems} />}
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
          <input ref={fileInput} type="file" hidden multiple accept={ANY_ACCEPT} onChange={(e) => (add(e.target.files), (e.target.value = ''))} />
        </form>

        {p.error && (
          <p className="v0-error-line sd-error" role="alert">
            {p.error}
          </p>
        )}

        {recent.length > 0 && (
          <nav className="sd-continue" aria-label="Continue where you left off">
            <span className="sd-continue-k">Continue</span>
            {recent.map((s) => (
              <button key={s.id} type="button" className="sd-continue-item" onClick={() => p.onOpen(s.id)}>
                <span className="sd-continue-t">{s.name || 'Untitled'}</span>
                <span className="sd-continue-h">{s.studio?.status === 'discovering' ? 'in conversation' : kindLine(s).toLowerCase()}</span>
              </button>
            ))}
            {p.list.length > recent.length && (
              <button type="button" className="sd-textlink is-small" onClick={p.onWork}>
                All {p.list.length}
              </button>
            )}
          </nav>
        )}
      </main>

      <footer className="sd-foot">
        <p>Nothing here calls a model. Websites you point to are read for what they can teach — their colours, their type — and never copied into the work.</p>
      </footer>
    </div>
  );
}
