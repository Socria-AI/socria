'use client';
// components/ux-v0/studio/controls.tsx — the ways a question can be answered: visual cards, chips, a ranking, colours,
// type set in its own faces, sliders, fields, counts and files. Every control holds a draft the stage card commits;
// a single choice commits on the click (the conversation moves on at once), a multiple one when the person says
// Continue. Every option is a button that says whether it is chosen; nothing here depends on colour alone.

import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { StudioAnswer, StudioAttachment, StudioReference, StudioState } from '@/lib/ux-v0/studio/schema';
import { REF_TAKES, type RefTake } from '@/lib/ux-v0/studio/schema';
import type { Stage, StageOption } from '@/lib/ux-v0/studio/discovery';
import { previewWords } from '@/lib/ux-v0/studio/options';
import { likedOf, researchStatus } from '@/lib/ux-v0/studio/research';
import { DNA_META, type DnaKey } from '@/lib/ux-v0/dna';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import { PreviewOf, useFacesFor } from './previews';
import { Check, Down, FileMark, Minus, Plus, Up, Close, Picture } from './glyphs';

export interface Draft {
  values: string[];
  text?: string;
  numbers?: Record<string, number>;
  fields?: Record<string, string>;
}

export interface ControlProps {
  stage: Stage;
  st: StudioState;
  draft: Draft;
  setDraft: (d: Draft) => void;
  /** answer now with this draft (a single choice) */
  commit: (d: Draft) => void;
  nonce: string;
  websiteSystems?: readonly MasterDesignSystem[];
  /** the conversation's files, for an upload question and for colours taken from a picture */
  attachments: readonly StudioAttachment[];
  onFiles: (files: File[], stage: Stage) => Promise<{ ids: string[]; error?: string }>;
  onRemoveFile: (id: string) => void;
  /** the references found on the internet: searching, and what the person makes of each */
  research?: ResearchControls;
}

export interface ResearchControls {
  busy: boolean;
  onReference: (id: string, patch: Partial<Pick<StudioReference, 'state' | 'take'>>) => void;
  /** search for these words */
  onSearch: (query: string) => void;
  /** search again for what the brief asks (after a search that could not be completed) */
  onRetry: () => void;
}

/** Whether a draft can be given as the answer. */
export function draftReady(stage: Stage, d: Draft): boolean {
  if (d.text?.trim() && stage.allowText) return true;
  switch (stage.control) {
    case 'fields':
      return (stage.fields ?? []).filter((f) => f.required).every((f) => !!d.fields?.[f.id]?.trim()) && Object.values(d.fields ?? {}).some((v) => v.trim());
    case 'counts':
      return Object.values(d.numbers ?? {}).some((n) => n > 0);
    case 'sliders':
      return Object.keys(d.numbers ?? {}).length > 0;
    case 'rank':
      return d.values.length > 0;
    case 'palette':
      return d.values.length > 0 || ['ground', 'ink', 'accent'].every((k) => /^#[0-9a-f]{6}$/i.test(d.fields?.[k] ?? ''));
    default:
      return d.values.length > 0;
  }
}

/** A draft from an answer already given (or one just taken back to be given again), or the question's starting point. */
export function draftOf(stage: Stage, st: StudioState, prior?: StudioAnswer | null): Draft {
  const a = st.answers[stage.id] ?? prior ?? undefined;
  // what the person liked is held on the references themselves, wherever it was liked
  if (stage.control === 'references') return { values: likedOf(st).map((r) => r.id), ...(a?.text && !a.skipped && !a.delegated ? { text: a.text } : {}) };
  if (a && !a.skipped && !a.delegated) return { values: [...a.values], ...(a.text ? { text: a.text } : {}), ...(a.numbers ? { numbers: { ...a.numbers } } : {}), ...(a.fields ? { fields: { ...a.fields } } : {}) };
  if (stage.control === 'rank') return { values: stage.options.map((o) => o.id) };
  return { values: [] };
}

const toggle = (stage: Stage, d: Draft, id: string): Draft => {
  if (stage.select === 'single') return { ...d, values: d.values[0] === id ? [] : [id] };
  if (d.values.includes(id)) return { ...d, values: d.values.filter((v) => v !== id) };
  const max = stage.max ?? 99;
  // at the limit, the earliest choice gives way to the newest
  const kept = d.values.length >= max ? d.values.slice(d.values.length - max + 1) : d.values;
  return { ...d, values: [...kept, id] };
};

function Badge({ o }: { o: StageOption }) {
  return o.recommended ? <span className="sd-likely">Likely</span> : null;
}

/** Arrow keys move between the options of a group (Tab leaves it). */
function arrows(e: KeyboardEvent<HTMLElement>) {
  if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return;
  const items = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[data-opt]:not([disabled])')];
  const i = items.indexOf(document.activeElement as HTMLButtonElement);
  if (i < 0) return;
  e.preventDefault();
  const next = items[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
  next?.focus();
}

// ── cards: a picture of each choice ──

function Cards({ stage, st, draft, setDraft, commit, nonce, websiteSystems }: ControlProps) {
  const wide = stage.options.some((o) => o.preview?.kind === 'website');
  const small = stage.options.every((o) => !o.preview || o.preview.kind === 'mode' || o.preview.kind === 'source');
  return (
    <div className={`sd-cards${wide ? ' is-wide' : ''}${small ? ' is-small' : ''}`} role="group" aria-label={stage.question} onKeyDown={arrows}>
      {stage.options.map((o, i) => {
        const on = draft.values.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            data-opt
            className={`sd-card${on ? ' is-on' : ''}`}
            aria-pressed={on}
            style={{ ['--i' as string]: Math.min(i, 8) }}
            onClick={() => {
              const next = toggle(stage, draft, o.id);
              if (stage.select === 'single' && next.values.length) commit(next);
              else setDraft(next);
            }}
          >
            {o.preview && <PreviewOf preview={o.preview} st={st} nonce={nonce} systems={websiteSystems} />}
            {!o.preview && o.swatches && <Swatches colours={o.swatches} />}
            <span className="sd-card-text">
              <span className="sd-card-label">
                {o.label}
                <Badge o={o} />
              </span>
              {o.hint && <span className="sd-card-hint">{o.hint}</span>}
              {o.swatches && o.preview && <Swatches colours={o.swatches} small />}
            </span>
            <span className="sd-tick" aria-hidden="true">
              <Check size={14} />
            </span>
          </button>
        );
      })}
    </div>
  );
}

function Swatches({ colours, small }: { colours: readonly string[]; small?: boolean }) {
  return (
    <span className={`sd-swatches${small ? ' is-small' : ''}`} aria-hidden="true">
      {colours.map((c, i) => (
        <span key={`${c}-${i}`} style={{ background: c }} />
      ))}
    </span>
  );
}

// ── chips: many words to pick from ──

function Chips({ stage, draft, setDraft, commit }: ControlProps) {
  const [all, setAll] = useState(false);
  const LIMIT = 14;
  // the chosen and the likely are always on show
  const shown = all || stage.options.length <= LIMIT + 2 ? stage.options : stage.options.filter((o, i) => i < LIMIT || draft.values.includes(o.id) || o.recommended);
  return (
    <div className="sd-chips-wrap">
      <div className="sd-chips" role="group" aria-label={stage.question} onKeyDown={arrows}>
        {shown.map((o, i) => {
          const on = draft.values.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              data-opt
              className={`sd-chip${on ? ' is-on' : ''}${o.recommended ? ' is-likely' : ''}`}
              aria-pressed={on}
              title={o.hint}
              style={{ ['--i' as string]: Math.min(i, 12) }}
              onClick={() => {
                const next = toggle(stage, draft, o.id);
                if (stage.select === 'single' && next.values.length) commit(next);
                else setDraft(next);
              }}
            >
              {on && <Check size={13} />}
              {o.label}
            </button>
          );
        })}
        {shown.length < stage.options.length && (
          <button type="button" className="sd-chip is-more" onClick={() => setAll(true)}>
            <Plus size={13} />
            {stage.options.length - shown.length} more
          </button>
        )}
      </div>
      {stage.select === 'multi' && stage.max && (
        <p className="sd-count" aria-live="polite">
          {draft.values.length ? `${draft.values.length} of ${stage.max} chosen` : `Pick up to ${stage.max}`}
        </p>
      )}
    </div>
  );
}

// ── rank: an order of importance ──

function Rank({ stage, draft, setDraft }: ControlProps) {
  const order = draft.values.length ? draft.values : stage.options.map((o) => o.id);
  const label = (id: string) => stage.options.find((o) => o.id === id);
  const move = (i: number, by: -1 | 1) => {
    const j = i + by;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j], next[i]];
    setDraft({ ...draft, values: next });
  };
  return (
    <ol className="sd-rank" aria-label={stage.question}>
      {order.map((id, i) => {
        const o = label(id);
        if (!o) return null;
        return (
          <li key={id} className="sd-rank-row">
            <span className="sd-rank-n">{i + 1}</span>
            <span className="sd-rank-text">
              <span className="sd-card-label">{o.label}</span>
              {o.hint && <span className="sd-card-hint">{o.hint}</span>}
            </span>
            <span className="sd-rank-acts">
              <button type="button" className="sd-icon" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${o.label} up`}>
                <Up size={16} />
              </button>
              <button type="button" className="sd-icon" onClick={() => move(i, 1)} disabled={i === order.length - 1} aria-label={`Move ${o.label} down`}>
                <Down size={16} />
              </button>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ── colours: palettes to choose from, your own, or a picture's ──

const HEX = /^#[0-9a-f]{6}$/i;
const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
const lum = (h: string) => {
  const [r, g, b] = rgb(h).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const sat = (h: string) => {
  const [r, g, b] = rgb(h);
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
};

/** A palette read from a picture's colours: its lightest as ground, darkest as ink, its most saturated as accent. */
export function paletteFromSwatches(sw: readonly string[]): string[] | null {
  const xs = [...new Set(sw.filter((c) => HEX.test(c)).map((c) => c.toLowerCase()))];
  if (xs.length < 3) return null;
  const byLum = [...xs].sort((a, b) => lum(b) - lum(a));
  const ground = byLum[0];
  const ink = byLum[byLum.length - 1];
  const rest = xs.filter((c) => c !== ground && c !== ink).sort((a, b) => sat(b) - sat(a));
  const accent = rest[0] ?? byLum[1];
  return [ground, ink, accent, rest[1] ?? accent];
}

function PaletteControl(p: ControlProps) {
  const { stage, draft, setDraft, commit, attachments } = p;
  const [own, setOwn] = useState(() => !!draft.fields?.accent);
  const fromPictures = useMemo(
    () =>
      attachments
        .filter((a) => a.kind === 'image' && (a.swatches?.length ?? 0) >= 3)
        .map((a) => ({ a, pal: paletteFromSwatches(a.swatches ?? []) }))
        .filter((x): x is { a: StudioAttachment; pal: string[] } => !!x.pal)
        .slice(0, 2),
    [attachments],
  );
  const options: StageOption[] = [...stage.options, ...fromPictures.map(({ a, pal }) => ({ id: pal.join('|'), label: `From “${a.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 28)}”`, hint: 'The colours of your picture', swatches: pal }))];
  const f = draft.fields ?? {};
  const set = (k: string, v: string) => setDraft({ ...draft, values: [], fields: { ground: f.ground ?? '#f5f3eb', ink: f.ink ?? '#20201b', accent: f.accent ?? '#5e7633', ...f, [k]: v } });
  return (
    <div className="sd-palette">
      <div className="sd-palettes" role="group" aria-label={stage.question} onKeyDown={arrows}>
        {options.map((o, i) => {
          const on = draft.values[0] === o.id;
          return (
            <button key={o.id} type="button" data-opt className={`sd-pal${on ? ' is-on' : ''}`} aria-pressed={on} style={{ ['--i' as string]: Math.min(i, 8) }} onClick={() => commit({ ...draft, values: [o.id], fields: undefined })}>
              <span className="sd-pal-strip" aria-hidden="true">
                {(o.swatches ?? o.id.split('|')).slice(0, 4).map((c, k) => (
                  <span key={`${c}-${k}`} style={{ background: c }} />
                ))}
              </span>
              <span className="sd-card-label">{o.label}</span>
            </button>
          );
        })}
      </div>
      {!own ? (
        <button type="button" className="sd-textlink" onClick={() => (setOwn(true), set('ground', f.ground ?? '#f5f3eb'))}>
          Choose your own colours
        </button>
      ) : (
        <div className="sd-own" role="group" aria-label="Your own colours">
          {(
            [
              ['ground', 'Ground'],
              ['ink', 'Ink'],
              ['accent', 'Accent'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="sd-own-row">
              <input type="color" value={HEX.test(f[k] ?? '') ? f[k] : '#5e7633'} onChange={(e) => set(k, e.target.value)} aria-label={`${l} colour`} />
              <span className="sd-own-l">{l}</span>
              <input className="sd-hex" value={f[k] ?? ''} onChange={(e) => set(k, e.target.value.trim().slice(0, 7))} aria-label={`${l} as a hex value`} spellCheck={false} />
            </label>
          ))}
          <span className="sd-own-sample" aria-hidden="true" style={{ background: HEX.test(f.ground ?? '') ? f.ground : undefined, color: HEX.test(f.ink ?? '') ? f.ink : undefined }}>
            Aa <b style={{ color: HEX.test(f.accent ?? '') ? f.accent : undefined }}>●</b>
          </span>
        </div>
      )}
    </div>
  );
}

// ── type: each pairing in its own letters ──

function TypeControl({ stage, st, draft, commit }: ControlProps) {
  const pairs = useMemo(() => stage.options.map((o) => o.faces).filter((x): x is { display: string; body: string } => !!x), [stage.options]);
  useFacesFor(pairs);
  const words = previewWords(st);
  const sample = (st.mode === 'logo' ? st.answers['l.name']?.fields?.name : '') || words.headline;
  return (
    <div className="sd-types" role="group" aria-label={stage.question} onKeyDown={arrows}>
      {stage.options.map((o, i) => {
        const on = draft.values[0] === o.id;
        const f = o.faces;
        return (
          <button key={o.id} type="button" data-opt className={`sd-type${on ? ' is-on' : ''}`} aria-pressed={on} style={{ ['--i' as string]: Math.min(i, 8) }} onClick={() => commit({ ...draft, values: [o.id] })}>
            <span className="sd-type-show" aria-hidden="true">
              <span className="sd-type-aa" style={{ fontFamily: f ? `'${f.display}', serif` : undefined }}>
                Aa
              </span>
              <span className="sd-type-head" style={{ fontFamily: f ? `'${f.display}', serif` : undefined }}>
                {sample.slice(0, 40)}
              </span>
              {st.mode !== 'logo' && (
                <span className="sd-type-body" style={{ fontFamily: f ? `'${f.body}', sans-serif` : undefined }}>
                  The text face carries the details: dates, places, the small print.
                </span>
              )}
            </span>
            <span className="sd-card-text">
              <span className="sd-card-label">
                {o.label}
                <Badge o={o} />
              </span>
              {o.hint && <span className="sd-card-hint">{o.hint}</span>}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── sliders: only what is moved is said ──

const wordFor = (k: DnaKey, v: number) => DNA_META[k].words[Math.max(0, Math.min(4, Math.floor(v / 20)))];

function Sliders({ stage, draft, setDraft }: ControlProps) {
  const n = draft.numbers ?? {};
  return (
    <div className="sd-sliders">
      {(stage.sliders ?? []).map((s) => {
        const moved = n[s.id] !== undefined;
        const v = n[s.id] ?? 50;
        return (
          <div key={s.id} className={`sd-slider${moved ? ' is-moved' : ''}`}>
            <div className="sd-slider-top">
              <label htmlFor={`sd-sl-${s.id}`} className="sd-card-label">
                {s.label}
              </label>
              <span className="sd-slider-word" aria-hidden="true">
                {moved ? wordFor(s.id, v) : 'SocriaUX decides'}
              </span>
              {moved && (
                <button
                  type="button"
                  className="sd-textlink is-small"
                  onClick={() => {
                    const next = { ...n };
                    delete next[s.id];
                    setDraft({ ...draft, numbers: next });
                  }}
                >
                  Leave it
                </button>
              )}
            </div>
            <input id={`sd-sl-${s.id}`} type="range" min={0} max={100} step={1} value={v} aria-valuetext={moved ? wordFor(s.id, v) : 'Left to SocriaUX'} onChange={(e) => setDraft({ ...draft, numbers: { ...n, [s.id]: Number(e.target.value) } })} style={{ ['--v' as string]: `${v}%` }} />
            <div className="sd-slider-ends" aria-hidden="true">
              <span>{s.low}</span>
              <span>{s.high}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ── fields: the person's own words, exactly ──

function Fields({ stage, draft, setDraft, commit }: ControlProps) {
  const f = draft.fields ?? {};
  return (
    <div className="sd-fields">
      {(stage.fields ?? []).map((fd, i) => (
        <label key={fd.id} className={`sd-field${fd.multiline ? ' is-multi' : ''}`}>
          <span className="sd-field-l">
            {fd.label}
            {fd.required ? <span className="sd-req"> · needed</span> : null}
          </span>
          {fd.multiline ? (
            <textarea rows={3} value={f[fd.id] ?? ''} placeholder={fd.placeholder} onChange={(e) => setDraft({ ...draft, fields: { ...f, [fd.id]: e.target.value.slice(0, 400) } })} />
          ) : (
            <input
              value={f[fd.id] ?? ''}
              placeholder={fd.placeholder}
              autoFocus={i === 0}
              onChange={(e) => setDraft({ ...draft, fields: { ...f, [fd.id]: e.target.value.slice(0, 400) } })}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && draftReady(stage, draft)) {
                  e.preventDefault();
                  commit(draft);
                }
              }}
            />
          )}
          {fd.hint && <span className="sd-card-hint">{fd.hint}</span>}
        </label>
      ))}
    </div>
  );
}

// ── counts: how many of each ──

function Counts({ stage, draft, setDraft }: ControlProps) {
  const n = draft.numbers ?? {};
  const set = (id: string, v: number, max: number) => {
    const next = { ...n, [id]: Math.max(0, Math.min(max, v)) };
    if (!next[id]) delete next[id];
    setDraft({ ...draft, numbers: next, values: Object.keys(next) });
  };
  const total = Object.values(n).reduce((t, x) => t + x, 0);
  return (
    <div className="sd-counts-wrap">
      <ul className="sd-counts">
        {(stage.counts ?? []).map((c) => {
          const v = n[c.id] ?? 0;
          return (
            <li key={c.id} className={`sd-countrow${v ? ' is-on' : ''}`}>
              <span className="sd-card-label">{c.label}</span>
              <span className="sd-stepper" role="group" aria-label={c.label}>
                <button type="button" className="sd-icon" onClick={() => set(c.id, v - 1, c.max)} disabled={v === 0} aria-label={`One fewer: ${c.label}`}>
                  <Minus size={15} />
                </button>
                <output aria-live="polite">{v}</output>
                <button type="button" className="sd-icon" onClick={() => set(c.id, v + 1, c.max)} disabled={v >= c.max} aria-label={`One more: ${c.label}`}>
                  <Plus size={15} />
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="sd-count" aria-live="polite">
        {total ? `${total} material${total === 1 ? '' : 's'} on the board` : 'Add at least one'}
      </p>
    </div>
  );
}

// ── files ──

function Upload({ stage, draft, setDraft, commit, attachments, onFiles, onRemoveFile }: ControlProps) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const mine = attachments.filter((a) => draft.values.includes(a.id));
  const add = async (list: FileList | null) => {
    const files = [...(list ?? [])];
    if (!files.length) return;
    setBusy(true);
    setError('');
    const r = await onFiles(stage.select === 'single' ? files.slice(0, 1) : files, stage);
    setBusy(false);
    if (r.error) setError(r.error);
    if (!r.ids.length) return;
    const next = { ...draft, values: stage.select === 'single' ? r.ids.slice(0, 1) : [...new Set([...draft.values, ...r.ids])] };
    if (stage.select === 'single' && !r.error) commit(next);
    else setDraft(next);
  };
  return (
    <div className="sd-upload-wrap">
      <div
        className={`sd-drop${over ? ' is-over' : ''}`}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void add(e.dataTransfer.files);
        }}
      >
        <Picture size={22} />
        <span className="sd-drop-t">{busy ? 'Reading…' : stage.select === 'single' ? 'Drop the file here' : 'Drop files here'}</span>
        <button type="button" className="sd-pill is-quiet" onClick={() => input.current?.click()} disabled={busy}>
          Choose {stage.select === 'single' ? 'a file' : 'files'}
        </button>
        <input ref={input} type="file" hidden multiple={stage.select !== 'single'} accept={stage.accept} onChange={(e) => (void add(e.target.files), (e.target.value = ''))} aria-label={stage.question} />
      </div>
      {error && (
        <p className="sd-error" role="alert">
          {error}
        </p>
      )}
      {mine.length > 0 && (
        <ul className="sd-files">
          {mine.map((a) => (
            <li key={a.id} className="sd-file">
              {a.swatches?.length ? (
                <span className="sd-file-sw" aria-hidden="true">
                  {a.swatches.slice(0, 4).map((c, i) => (
                    <span key={`${c}-${i}`} style={{ background: c }} />
                  ))}
                </span>
              ) : (
                <FileMark size={16} />
              )}
              <span className="sd-file-n">{a.name}</span>
              <button
                type="button"
                className="sd-icon is-small"
                aria-label={`Remove ${a.name}`}
                onClick={() => {
                  setDraft({ ...draft, values: draft.values.filter((v) => v !== a.id) });
                  onRemoveFile(a.id);
                }}
              >
                <Close size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── references found on the internet ──

const ORIGIN: Record<string, string> = { flickr: 'Flickr', wikimedia: 'Wikimedia Commons', met: 'The Met', smithsonian: 'Smithsonian', clevelandmuseum: 'Cleveland Museum of Art', brooklynmuseum: 'Brooklyn Museum', rawpixel: 'rawpixel', stocksnap: 'StockSnap', geographorguk: 'Geograph', nappy: 'nappy', sciencemuseum: 'Science Museum' };
const originOf = (o?: string) => (o ? ORIGIN[o] ?? o.replace(/_/g, ' ') : '');
const TAKE_LABEL: Record<RefTake, string> = { colour: 'Colour', type: 'Type', composition: 'Composition', mood: 'Mood', imagery: 'Imagery' };

function RefCard({ r, i, research, onToggle, onReject }: { r: StudioReference; i: number; research: ResearchControls; onToggle: (liked: boolean) => void; onReject: () => void }) {
  const liked = r.state === 'liked';
  const [gone, setGone] = useState(false);
  // a picture the library can no longer serve is not shown (nothing stands in for it)
  if (gone) return null;
  const ratio = r.width && r.height ? Math.max(0.62, Math.min(1.7, r.width / r.height)) : 1.25;
  const like = (r.tags.length ? r.tags.slice(0, 2).join(' ') : r.title.split(/\s+/).slice(0, 3).join(' ')).trim();
  return (
    <li className={`sd-ref${liked ? ' is-liked' : ''}`} style={{ ['--i' as string]: i % 12 }} data-ref={r.id}>
      <button type="button" className="sd-ref-img" style={{ aspectRatio: String(ratio) }} aria-pressed={liked} onClick={() => onToggle(!liked)} aria-label={`${liked ? 'Liked' : 'Like'}: ${r.title || 'this reference'}${r.creator ? `, by ${r.creator}` : ''}`}>
        <img src={r.thumb} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setGone(true)} />
        <span className="sd-ref-tick" aria-hidden="true">
          <Check size={13} />
        </span>
      </button>
      <span className="sd-ref-cap">
        <span className="sd-ref-t">{r.title || 'Untitled'}</span>
        <span className="sd-ref-c">
          {[r.creator, originOf(r.origin), r.license].filter(Boolean).join(' · ')}
          {r.sourceUrl && (
            <>
              {' · '}
              <a href={r.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
                Source<span className="v0-sr"> (opens the page it comes from)</span>
              </a>
            </>
          )}
        </span>
      </span>
      <span className="sd-ref-acts">
        <button type="button" className={`sd-chip is-tiny${liked ? ' is-on' : ''}`} aria-pressed={liked} onClick={() => onToggle(!liked)}>
          {liked ? <Check size={12} /> : <Plus size={12} />}
          {liked ? 'Liked' : 'Like'}
        </button>
        <button type="button" className="sd-chip is-tiny is-ghost" onClick={onReject} aria-label={`Not this: ${r.title || 'this reference'}`}>
          Not this
        </button>
        {liked && like && (
          <button type="button" className="sd-textlink is-small" disabled={research.busy} onClick={() => research.onSearch(like)} title={`Search Openverse for “${like}”`}>
            More like this
          </button>
        )}
      </span>
      {liked && (
        <span className="sd-ref-take" role="group" aria-label={`What you like about “${r.title || 'it'}”`}>
          <span className="sd-ref-take-k">For its</span>
          {REF_TAKES.map((t) => {
            const on = (r.take ?? []).includes(t);
            return (
              <button key={t} type="button" className={`sd-chip is-tiny${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => research.onReference(r.id, { take: on ? (r.take ?? []).filter((x) => x !== t) : [...(r.take ?? []), t] })}>
                {TAKE_LABEL[t]}
              </button>
            );
          })}
        </span>
      )}
    </li>
  );
}

function References({ st, draft, setDraft, research }: ControlProps) {
  const [query, setQuery] = useState('');
  const [showTurned, setShowTurned] = useState(false);
  if (!research) return null;
  const refs = st.references ?? [];
  const shown = refs.filter((r) => r.state !== 'rejected');
  const turned = refs.filter((r) => r.state === 'rejected');
  const status = researchStatus(st, research.busy);
  const setLiked = (id: string, liked: boolean) => {
    const ids = new Set(draft.values);
    if (liked) ids.add(id);
    else ids.delete(id);
    setDraft({ ...draft, values: [...ids] });
  };
  return (
    <div className="sd-refs">
      <p className={`sd-refs-status${research.busy ? ' is-busy' : ''}${status.failed ? ' is-failed' : ''}`} role="status" aria-live="polite">
        {research.busy && <span className="sd-refs-dot" aria-hidden="true" />}
        <span>{status.text}</span>
        {status.failed && !research.busy && (
          <button type="button" className="sd-textlink is-small" onClick={research.onRetry}>
            Try again
          </button>
        )}
      </p>
      {research.busy && !shown.length ? (
        <ul className="sd-refs-grid is-waiting" aria-hidden="true">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i} className="sd-ref is-wait" style={{ ['--i' as string]: i }} />
          ))}
        </ul>
      ) : shown.length ? (
        <ul className="sd-refs-grid" aria-label="References">
          {shown.map((r, i) => (
            <RefCard
              key={r.id}
              r={r}
              i={i}
              research={research}
              onToggle={(v) => {
                research.onReference(r.id, { state: v ? 'liked' : 'proposed' });
                setLiked(r.id, v);
              }}
              onReject={() => {
                research.onReference(r.id, { state: 'rejected' });
                setLiked(r.id, false);
              }}
            />
          ))}
        </ul>
      ) : null}
      {turned.length > 0 && (
        <button type="button" className="sd-textlink is-small" onClick={() => setShowTurned((v) => !v)} aria-expanded={showTurned}>
          {showTurned ? 'Hide' : 'Show'} the {turned.length} turned down
        </button>
      )}
      {showTurned && (
        <ul className="sd-refs-turned" aria-label="Turned down">
          {turned.map((r) => (
            <li key={r.id}>
              <img src={r.thumb} alt="" loading="lazy" referrerPolicy="no-referrer" />
              <span>{r.title || 'Untitled'}</span>
              <button type="button" className="sd-textlink is-small" onClick={() => research.onReference(r.id, { state: 'proposed' })}>
                Bring back
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="sd-refs-search"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          const q = query.trim();
          if (!q || research.busy) return;
          research.onSearch(q);
          setQuery('');
        }}
      >
        <label htmlFor="sd-refs-q" className="v0-sr">
          Search Openverse for other references
        </label>
        <input id="sd-refs-q" value={query} onChange={(e) => setQuery(e.target.value.slice(0, 80))} placeholder="Search for something else: “art deco poster”, “hand-painted sign”…" autoComplete="off" enterKeyHint="search" />
        <button type="submit" className="sd-pill is-quiet is-sm" disabled={!query.trim() || research.busy}>
          Search
        </button>
      </form>
      <p className="sd-refs-note">Openly licensed works found through Openverse, each credited with its creator, licence and source. They are inspiration only: SocriaUX learns from what you like — colour, type, composition, mood — and never copies a reference into your work.</p>
    </div>
  );
}

/** The control a question asks with. */
export function StageControl(p: ControlProps) {
  switch (p.stage.control) {
    case 'references':
      return <References {...p} />;
    case 'cards':
      return <Cards {...p} />;
    case 'chips':
      return <Chips {...p} />;
    case 'rank':
      return <Rank {...p} />;
    case 'palette':
      return <PaletteControl {...p} />;
    case 'type':
      return <TypeControl {...p} />;
    case 'sliders':
      return <Sliders {...p} />;
    case 'fields':
      return <Fields {...p} />;
    case 'counts':
      return <Counts {...p} />;
    case 'upload':
      return <Upload {...p} />;
  }
}
