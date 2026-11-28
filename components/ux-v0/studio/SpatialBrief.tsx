'use client';
// components/ux-v0/studio/SpatialBrief.tsx — the spatial creative brief: where a graphic, a logo, a campaign or a website
// is shaped before it is made. Not a chat.
//
// The person's idea opens it, large and editable in place. Beside it, what SocriaUX understands — each line marked as
// theirs or as SocriaUX's own reading, editable in place, with what they picked (a palette whose colours they can
// change, a pairing of faces, a mood), what they settled, what to avoid, their notes and the references they brought.
// In the working area, the considerations open now (lib/ux-v0/studio/brief.ts BriefModule): the most valuable given the
// most room, each a question written for this work, answered where it stands — in words, by a pick from what it shows
// (./AidPicker.tsx: palettes, faces set in themselves, moods), or skipped. A single line under the idea says what
// SocriaUX took from the latest change. Generate is always there: whatever is open is left to SocriaUX. Every change
// updates the brief at once; the question model then refines it (./ProjectConversation.tsx) without rebuilding it.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { StudioMode, StudioReference, StudioState } from '@/lib/ux-v0/studio/schema';
import type { BriefField, BriefModule, CreativeBrief, Palette, TypePair, Mood } from '@/lib/ux-v0/studio/brief';
import type { PickKind } from '@/lib/ux-v0/studio/discover-model';
import { paletteReads } from '@/lib/ux-v0/studio/discover';
import { MODES, modeInfo } from '@/lib/ux-v0/studio/modes';
import type { DirectorEnv } from '@/lib/ux-v0/studio/director';
import type { SystemRecord } from '@/lib/ux-v0/dsi/registry';
import { SystemPicker, usableSystems } from './SystemPicker';
import { AidPicker } from './AidPicker';
import { ATTACH, FoundList, ReferenceCard } from './Conversation';
import { loadFaces } from './faces';
import { ArrowUp, Attach, Check, Close, Down, FileMark, ModeGlyph } from './glyphs';

export interface SpatialBriefProps {
  studio: StudioState;
  env: DirectorEnv;
  saveWords?: string;
  systems: readonly SystemRecord[];
  /** the model (or the reader) is refining the brief after a change */
  thinking: boolean;
  /** what is happening while the work begins ('' when nothing is) */
  starting: string;
  error: string;
  reading: string[];
  searching?: string;
  /** sites that could not be read, said plainly */
  notices: string[];
  previews: Record<string, string>;
  on: {
    answer: (id: string, text: string) => void;
    pick: (id: string, index: number) => void;
    skip: (id: string) => void;
    reopen: (id: string) => void;
    prompt: (text: string) => void;
    field: (f: BriefField, value: string) => void;
    note: (text: string, files: File[]) => void;
    removeNote: (id: string) => void;
    removeChosen: (k: PickKind) => void;
    colour: (index: number, hex: string) => void;
    keep: (line: string) => void;
    drop: (line: string) => void;
    dropAvoid: (line: string) => void;
    generate: () => void;
    reference: (id: string, patch: Partial<Pick<StudioReference, 'take' | 'state'>>) => void;
    useFound: (url: string) => void;
    system: (id: string | null) => void;
    manageSystems: () => void;
    mode: (m: StudioMode) => void;
    exit: () => void;
  };
}

const stack = (face: string) => `"${face}", Inter, system-ui, sans-serif`;

/** A text area that grows with what is written, and commits on leaving it (or ⌘/Ctrl+Enter). */
function Grow({ value, onCommit, className, label, placeholder, disabled, single }: { value: string; onCommit: (v: string) => void; className: string; label: string; placeholder?: string; disabled?: boolean; single?: boolean }) {
  const [v, setV] = useState(value);
  const box = useRef<HTMLTextAreaElement>(null);
  useEffect(() => setV(value), [value]);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [v]);
  const commit = () => {
    if (v.trim() !== value.trim()) onCommit(v);
  };
  return (
    <textarea
      ref={box}
      className={className}
      aria-label={label}
      rows={1}
      value={v}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => setV(e.target.value.slice(0, 2000))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (single || e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit();
          (e.target as HTMLTextAreaElement).blur();
        }
        if (e.key === 'Escape') {
          setV(value);
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
    />
  );
}

/** An answer in the person's own words, where the question stands. */
function WordsAnswer({ id, placeholder, onAnswer, label, autoFocus, seed }: { id: string; placeholder: string; onAnswer: (t: string) => void; label: string; autoFocus?: boolean; seed?: string }) {
  const [v, setV] = useState('');
  useEffect(() => {
    if (seed) setV((cur) => (cur.trim() ? `${cur.trim().replace(/[,.]$/, '')}, ${seed}` : seed));
  }, [seed]);
  const send = () => {
    const t = v.trim();
    if (!t) return;
    onAnswer(t);
    setV('');
  };
  return (
    <form
      className="sbx-words"
      onSubmit={(e) => {
        e.preventDefault();
        send();
      }}
    >
      <label className="v0-sr" htmlFor={`sbx-a-${id}`}>
        {label}
      </label>
      <input id={`sbx-a-${id}`} value={v} placeholder={placeholder || 'In your own words'} onChange={(e) => setV(e.target.value.slice(0, 400))} autoFocus={autoFocus} />
      <button type="submit" className="sbx-send" disabled={!v.trim()} aria-label="Answer">
        <ArrowUp size={15} />
      </button>
    </form>
  );
}

/** One consideration, answered where it stands. */
function Consideration({ m, lead, onAnswer, onPick, onSkip, busy }: { m: BriefModule; lead: boolean; onAnswer: (t: string) => void; onPick: (i: number) => void; onSkip: () => void; busy: boolean }) {
  const [own, setOwn] = useState('');
  return (
    <section className={`sbx-q is-${m.kind}${lead ? ' is-lead' : ''}`} aria-labelledby={`sbx-q-${m.id}`} data-module={m.id}>
      <p className="sbx-topic">{m.topic}</p>
      <h2 className="sbx-question" id={`sbx-q-${m.id}`}>
        {m.question}
      </h2>
      {m.kind === 'choice' && (
        <div className="sbx-options" role="group" aria-label={m.question}>
          {m.options.map((o, i) => (
            <button key={o} type="button" className="sbx-option" style={{ ['--i' as string]: i }} disabled={busy} onClick={() => onAnswer(o)}>
              {o}
            </button>
          ))}
        </div>
      )}
      {m.aid && !busy && <AidPicker aid={m.aid} onPick={onPick} onWrite={(t) => setOwn(t)} />}
      <WordsAnswer id={m.id} label={`Answer “${m.question}” in your own words`} placeholder={m.kind === 'text' ? m.placeholder : m.aid ? (m.aid.kind === 'palettes' ? 'Or describe the colours, or give hex codes' : m.aid.kind === 'type' ? 'Or describe the lettering you want' : 'Or say how it should feel') : 'Or in your own words'} onAnswer={onAnswer} autoFocus={lead && m.kind === 'text'} seed={own} />
      <button type="button" className="sbx-skip" onClick={onSkip} disabled={busy}>
        Skip — SocriaUX decides
      </button>
    </section>
  );
}

/** A colour of the picked palette, changeable in place. */
function Swatch({ hex, i, label, onColour }: { hex: string; i: number; label: string; onColour: (i: number, hex: string) => void }) {
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const el = input.current;
    if (!el) return;
    const done = () => onColour(i, el.value);
    el.addEventListener('change', done);
    return () => el.removeEventListener('change', done);
  }, [i, onColour]);
  return (
    <label className="sbx-sw" style={{ background: hex }} title={`${label}: ${hex} — change it`}>
      <span className="v0-sr">
        {label} {hex}, change it
      </span>
      <input ref={input} type="color" defaultValue={hex} key={hex} />
    </label>
  );
}

const SWATCH_ROLE = ['Ground', 'Ink', 'Accent', 'Support', 'Support'];

function PalettePicked({ p, onColour, onRemove }: { p: Palette; onColour: (i: number, hex: string) => void; onRemove: () => void }) {
  return (
    <div className="sbx-pick">
      <div className="sbx-pick-head">
        <span className="sbx-pick-k">Colours</span>
        <span className="sbx-pick-n">{p.name}</span>
        <button type="button" className="sbx-x" onClick={onRemove} aria-label={`Take back the colours “${p.name}”`}>
          <Close size={13} />
        </button>
      </div>
      <div className="sbx-sws" role="group" aria-label={`The colours of ${p.name}`}>
        {p.colours.map((c, i) => (
          <Swatch key={`${i}-${c}`} hex={c} i={i} label={SWATCH_ROLE[i] ?? 'Colour'} onColour={onColour} />
        ))}
      </div>
      <p className="sbx-pick-hex">{p.colours.join(' · ')}</p>
      {!paletteReads(p) && <p className="sbx-warn">Its ink may be hard to read on its ground.</p>}
    </div>
  );
}

function TypePicked({ t, sample, onRemove }: { t: TypePair; sample: string; onRemove: () => void }) {
  return (
    <div className="sbx-pick">
      <div className="sbx-pick-head">
        <span className="sbx-pick-k">Lettering</span>
        <span className="sbx-pick-n">{t.name}</span>
        <button type="button" className="sbx-x" onClick={onRemove} aria-label={`Take back the lettering “${t.name}”`}>
          <Close size={13} />
        </button>
      </div>
      <p className="sbx-pick-spec" style={{ fontFamily: stack(t.display), fontWeight: t.weight ?? 400, textTransform: t.upper ? 'uppercase' : 'none' }}>
        {sample}
      </p>
      <p className="sbx-pick-body" style={{ fontFamily: stack(t.body) }}>
        {t.display}
        {t.body !== t.display ? ` with ${t.body}` : ''} — {t.note}
      </p>
    </div>
  );
}

function MoodPicked({ m, sample, onRemove }: { m: Mood; sample: string; onRemove: () => void }) {
  const [ground, ink, accent] = m.colours;
  return (
    <div className="sbx-pick">
      <div className="sbx-pick-head">
        <span className="sbx-pick-k">Atmosphere</span>
        <span className="sbx-pick-n">{m.name}</span>
        <button type="button" className="sbx-x" onClick={onRemove} aria-label={`Take back the mood “${m.name}”`}>
          <Close size={13} />
        </button>
      </div>
      <div className="sbx-pick-mood" style={{ background: ground, color: ink }}>
        <span style={{ fontFamily: stack(m.display) }}>{sample}</span>
        <span className="sbx-pick-bar" style={{ background: accent }} />
      </div>
      <p className="sbx-pick-body">{m.note}</p>
    </div>
  );
}

const FIELD_LABEL: Record<BriefField, string> = { kind: 'What it is', purpose: 'What it is for', audience: 'Who it is for', content: 'Words to set', feel: 'How it should feel' };

/** What is understood: each line marked as theirs or as SocriaUX's reading, editable in place. */
function Understanding({ st, b, sample, p, busy }: { st: StudioState; b: CreativeBrief; sample: string; p: SpatialBriefProps; busy: boolean }) {
  const sp = st.space!;
  const own = new Set(sp.own);
  // a pick is shown by its card (taking it back reopens its consideration), so it is not listed again; a line of the
  // brief that only repeats a settled answer is not shown twice either
  const pickShown = (m: BriefModule) => m.answer?.pick != null && ((m.aid?.kind === 'palettes' && !!b.chosen.palette) || (m.aid?.kind === 'type' && !!b.chosen.type) || (m.aid?.kind === 'moods' && !!b.chosen.mood));
  const settled = sp.modules.filter((m) => m.status !== 'open' && !pickShown(m));
  const same = (x: string) => x.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  const answered = new Set(settled.map((m) => (m.status === 'answered' && m.answer ? same(m.answer.text) : '')).filter(Boolean));
  const fields = (['kind', 'purpose', 'audience', 'content', 'feel'] as BriefField[]).filter((f) => b[f] && (own.has(f) || !answered.has(same(b[f]))));
  const refs = st.references ?? [];
  const pictures = st.attachments.filter((a) => a.kind === 'image');
  const found = [...st.transcript].reverse().find((m) => m.kind === 'research' && m.found)?.found;
  const used = new Set(refs.map((r) => r.url));
  return (
    <aside className="sbx-known" aria-label="What SocriaUX understands">
      <h2 className="sbx-known-h">What’s understood</h2>
      {fields.length > 0 && (
        <dl className="sbx-facts">
          {fields.map((f) => (
            <div key={f} className={`sbx-fact${own.has(f) ? ' is-own' : ''}`}>
              <dt>
                {FIELD_LABEL[f]}
                {own.has(f) && <span className="sbx-mine">yours</span>}
              </dt>
              <dd>
                <Grow className="sbx-edit" label={FIELD_LABEL[f]} value={b[f]} onCommit={(v) => p.on.field(f, v)} disabled={busy} single={f !== 'content'} />
              </dd>
            </div>
          ))}
        </dl>
      )}
      {(b.chosen.palette || b.chosen.type || b.chosen.mood) && (
        <div className="sbx-picks">
          {b.chosen.mood && <MoodPicked m={b.chosen.mood} sample={sample} onRemove={() => p.on.removeChosen('mood')} />}
          {b.chosen.palette && <PalettePicked p={b.chosen.palette} onColour={p.on.colour} onRemove={() => p.on.removeChosen('palette')} />}
          {b.chosen.type && <TypePicked t={b.chosen.type} sample={sample} onRemove={() => p.on.removeChosen('type')} />}
        </div>
      )}
      {b.explicit.length > 0 && (
        <div className="sbx-group">
          <h3 className="sbx-group-h">From your words</h3>
          <ul className="sbx-asked">
            {b.explicit.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
      {settled.length > 0 && (
        <ul className="sbx-settled" aria-label="Settled">
          {settled.map((m) => (
            <li key={m.id}>
              <span className="sbx-settled-t">{m.topic}</span>
              <span className={`sbx-settled-a${m.status === 'skipped' ? ' is-left' : ''}`}>{m.status === 'skipped' ? 'Left to SocriaUX' : m.answer?.text}</span>
              <button type="button" className="sbx-link" onClick={() => p.on.reopen(m.id)} disabled={busy} aria-label={`Change “${m.topic}”`}>
                Change
              </button>
            </li>
          ))}
        </ul>
      )}
      {b.tentative.length > 0 && (
        <div className="sbx-group">
          <h3 className="sbx-group-h">SocriaUX’s reading — not settled</h3>
          <ul className="sbx-guess">
            {b.tentative.map((t) => (
              <li key={t}>
                <span>{t}</span>
                <button type="button" className="sbx-x" onClick={() => p.on.keep(t)} disabled={busy} aria-label={`Keep: ${t}`} title="Keep it">
                  <Check size={13} />
                </button>
                <button type="button" className="sbx-x" onClick={() => p.on.drop(t)} disabled={busy} aria-label={`Not this: ${t}`} title="Not this">
                  <Close size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {b.avoid.length > 0 && (
        <div className="sbx-group">
          <h3 className="sbx-group-h">Keep out</h3>
          <ul className="sbx-avoid">
            {b.avoid.map((t) => (
              <li key={t}>
                <span>{t}</span>
                <button type="button" className="sbx-x" onClick={() => p.on.dropAvoid(t)} disabled={busy} aria-label={`No longer avoid: ${t}`}>
                  <Close size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {sp.notes.length > 0 && (
        <div className="sbx-group">
          <h3 className="sbx-group-h">Your notes</h3>
          <ul className="sbx-notes">
            {sp.notes.map((n) => (
              <li key={n.id}>
                <span>{n.text}</span>
                <button type="button" className="sbx-x" onClick={() => p.on.removeNote(n.id)} disabled={busy} aria-label={`Take back: ${n.text}`}>
                  <Close size={13} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {(refs.length > 0 || pictures.length > 0 || p.reading.length > 0 || found || p.searching || p.notices.length > 0) && (
        <div className="sbx-group sbx-refs">
          <h3 className="sbx-group-h">References</h3>
          {pictures.length > 0 && (
            <ul className="sbx-pics" aria-label="Pictures you brought">
              {pictures.map((a) => (
                <li key={a.id}>
                  <FileMark size={15} />
                  <span className="sbx-pic-n">{a.name}</span>
                  {a.swatches?.length ? (
                    <span className="sbx-pic-sw" aria-label={`Its colours: ${a.swatches.slice(0, 5).join(', ')}`}>
                      {a.swatches.slice(0, 5).map((c) => (
                        <i key={c} style={{ background: c }} />
                      ))}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {refs.map((r) => (
            <ReferenceCard key={r.id} r={r} preview={p.previews[r.id]} onReference={p.on.reference} />
          ))}
          {p.reading.map((h) => (
            <p key={h} className="sbx-quiet" role="status">
              Reading {h}…
            </p>
          ))}
          {p.searching && (
            <p className="sbx-quiet" role="status">
              Looking for references: “{p.searching}”…
            </p>
          )}
          {p.notices.map((n) => (
            <p key={n} className="sbx-quiet is-notice">
              {n}
            </p>
          ))}
          {found && <FoundList found={found} used={used} onUse={p.on.useFound} />}
        </div>
      )}
      {fields.length === 0 && !settled.length && !b.explicit.length && !b.chosen.palette && !b.chosen.type && !b.chosen.mood && !refs.length && !pictures.length && <p className="sbx-quiet">As you shape it, what SocriaUX understands gathers here.</p>}
    </aside>
  );
}

export function SpatialBrief(p: SpatialBriefProps) {
  const st = p.studio;
  const sp = st.space!;
  const b = st.brief ?? { kind: '', purpose: '', audience: '', content: '', feel: '', explicit: [], implied: [], tentative: [], avoid: [], references: [], open: [], chosen: {} };
  const info = modeInfo(st.mode);
  const busy = !!p.starting;
  const open = sp.modules.filter((m) => m.status === 'open');
  const lead = open.find((m) => m.lead) ?? open[0];
  const others = open.filter((m) => m !== lead);
  const [modeOpen, setModeOpen] = useState(false);
  const modeBox = useRef<HTMLDivElement>(null);
  const [say, setSay] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  // what the work is called, set in the lettering or mood they picked
  const sample = (b.content.split('\n')[0] || '').trim().slice(0, 28) || 'Aa';
  useEffect(() => {
    const faces = [b.chosen.type && { face: b.chosen.type.display, weight: b.chosen.type.weight ?? 400, italic: false }, b.chosen.type && { face: b.chosen.type.body, weight: 400, italic: false }, b.chosen.mood && { face: b.chosen.mood.display, weight: 400, italic: false }].filter(Boolean) as { face: string; weight: number; italic: boolean }[];
    if (faces.length) void loadFaces(faces);
  }, [b.chosen.type?.display, b.chosen.type?.body, b.chosen.mood?.display]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!modeOpen) return;
    const away = (e: PointerEvent) => !modeBox.current?.contains(e.target as Node) && setModeOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setModeOpen(false);
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [modeOpen]);
  const sendSay = () => {
    const t = say.trim();
    if (!t && !files.length) return;
    p.on.note(t, files);
    setSay('');
    setFiles([]);
  };
  // the composition follows what is open: a visual consideration takes the room it needs; with nothing open, the
  // brief itself is the page
  const shape = !lead ? 'settled' : lead.aid ? 'visual' : lead.kind === 'choice' ? 'choice' : 'words';

  return (
    <div className="v0 sb sd sbx">
      <header className="sd-head sbx-head">
        <div className="sd-head-l">
          <button type="button" className="sd-mark" onClick={p.on.exit} aria-label="SocriaUX home">
            <img src="/socria-mark.png" alt="" width={18} height={18} />
            <span className="sd-wordmark">
              Socria<em>UX</em>
            </span>
          </button>
          {st.modeBy !== 'unsure' && (
            <div className="sd-mode" ref={modeBox}>
              <button type="button" className="sd-pill sd-mode-btn" aria-expanded={modeOpen} aria-haspopup="true" onClick={() => setModeOpen((o) => !o)} title="Change what we are making" disabled={busy}>
                <ModeGlyph mode={st.mode} size={16} />
                <span>{info.label}</span>
                <Down size={13} />
              </button>
              {modeOpen && (
                <div className="sd-pop is-modes" role="group" aria-label="What we are making">
                  <p className="sd-pop-k">What we are making</p>
                  {MODES.filter((m) => m.mode !== 'critique' && m.mode !== 'system').map((m) => (
                    <button
                      key={m.mode}
                      type="button"
                      className={`sd-pop-item${m.mode === st.mode ? ' is-on' : ''}`}
                      aria-pressed={m.mode === st.mode}
                      onClick={() => {
                        setModeOpen(false);
                        if (m.mode !== st.mode) p.on.mode(m.mode);
                      }}
                    >
                      <ModeGlyph mode={m.mode} size={18} />
                      <span className="sd-pop-t">{m.label}</span>
                      <span className="sd-pop-h">{m.line}</span>
                      {m.mode === st.mode && <Check size={15} />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="sd-head-r">
          {usableSystems(p.systems).length > 0 && <SystemPicker systems={p.systems} value={st.systemId ?? null} onChange={p.on.system} onManage={p.on.manageSystems} label={false} align="end" />}
          {p.saveWords && (
            <span className="sd-save" role="status">
              {p.saveWords}
            </span>
          )}
          <button type="button" className="sd-pill is-primary sbx-go" onClick={p.on.generate} disabled={busy}>
            Generate
          </button>
          <button type="button" className="sd-icon" onClick={p.on.exit} aria-label="Leave the brief (it is kept)">
            <Close size={17} />
          </button>
        </div>
      </header>

      <main className="sbx-main" data-shape={shape} data-kind={st.mode}>
        <section className="sbx-idea" aria-label="Your idea">
          <Grow className="sbx-prompt" label="Your idea — edit it any time" value={st.prompt} onCommit={p.on.prompt} disabled={busy} />
          <p className={`sbx-line${p.thinking ? ' is-thinking' : ''}`} aria-live="polite">
            {busy ? p.starting : p.thinking ? 'Reading it…' : sp.note || (open.length ? '' : sp.ready ? 'Nothing essential is missing. Generate when you’re ready — or keep shaping it.' : '')}
          </p>
          {p.error && (
            <p className="sbx-error" role="alert">
              {p.error}
            </p>
          )}
        </section>

        <div className="sbx-work">
          {lead ? (
            <div className="sbx-open">
              <Consideration key={lead.id} m={lead} lead onAnswer={(t) => p.on.answer(lead.id, t)} onPick={(i) => p.on.pick(lead.id, i)} onSkip={() => p.on.skip(lead.id)} busy={busy} />
              {others.length > 0 && (
                <div className="sbx-more">
                  {others.map((m) => (
                    <Consideration key={m.id} m={m} lead={false} onAnswer={(t) => p.on.answer(m.id, t)} onPick={(i) => p.on.pick(m.id, i)} onSkip={() => p.on.skip(m.id)} busy={busy} />
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="sbx-open is-empty">
              <p className="sbx-ready">{p.thinking ? 'Looking at what would make the biggest difference…' : 'Nothing is waiting on you.'}</p>
              <button type="button" className="sd-pill is-primary sbx-go-big" onClick={p.on.generate} disabled={busy}>
                Generate {info.label.toLowerCase()}
              </button>
            </div>
          )}
          <Understanding st={st} b={b} sample={sample} p={p} busy={busy} />
        </div>

        <form
          className="sbx-say"
          onSubmit={(e) => {
            e.preventDefault();
            sendSay();
          }}
        >
          <label className="sbx-say-k" htmlFor="sbx-say">
            Add anything, or change something
          </label>
          {files.length > 0 && (
            <ul className="sd-attached" aria-label="To add">
              {files.map((f) => (
                <li key={`${f.name}|${f.size}`} className="sd-att">
                  <FileMark size={15} />
                  <span className="sd-att-n">{f.name}</span>
                  <button type="button" className="sd-icon is-small" aria-label={`Remove ${f.name}`} onClick={() => setFiles((xs) => xs.filter((x) => x !== f))}>
                    <Close size={13} />
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="sbx-say-in">
            <button type="button" className="sd-icon" onClick={() => fileInput.current?.click()} aria-label="Add pictures or files" title="Add pictures or files" disabled={busy}>
              <Attach size={18} />
            </button>
            <input
              id="sbx-say"
              value={say}
              disabled={busy}
              placeholder="“Darker, more mysterious”, a link to a site you like, what must stay…"
              onChange={(e) => setSay(e.target.value.slice(0, 1200))}
              onPaste={(e) => {
                const pics = [...e.clipboardData.files];
                if (pics.length) {
                  e.preventDefault();
                  setFiles((cur) => [...cur, ...pics].slice(0, 8));
                }
              }}
            />
            <button type="submit" className="sbx-send is-dark" disabled={(!say.trim() && !files.length) || busy} aria-label="Add to the brief">
              <ArrowUp size={16} />
            </button>
            <input ref={fileInput} type="file" hidden multiple accept={ATTACH} onChange={(e) => (setFiles((cur) => [...cur, ...[...(e.target.files ?? [])]].slice(0, 8)), (e.target.value = ''))} />
          </div>
        </form>
      </main>

      <div className="sbx-dock">
        <button type="button" className="sd-pill is-primary is-block" onClick={p.on.generate} disabled={busy}>
          {busy ? 'Making it…' : 'Generate'}
        </button>
      </div>
    </div>
  );
}
