'use client';
// components/ux-v0/Moodboard.tsx — the human moodboard: the atmosphere the project should have.
//
// References come from licensed libraries (imagery, texture, composition) or
// from the designer (pictures, GIFs, clips, kept in this browser). Each one
// says what to take from it and what to leave (chips, or a note SocriaUX reads
// as it is written: "this typography, not the palette"), whether it is key,
// whether it is something to steer away from, and whether the picture itself
// may appear on the page (only then is it placed; otherwise it inspires).
// Colours can be sampled from a picture and kept as a palette. A line under
// the header says what SocriaUX reads from the whole board, so nothing about
// its interpretation is hidden. Type pairs are set in the real fonts;
// palettes show their contrast. Every image carries its creator, source and
// licence.

import { useEffect, useMemo, useRef, useState } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { fontStack, fontStylesheet } from '@/lib/ux-v0/fonts';
import type { Aspect } from '@/lib/ux-v0/discovery';
import { ASPECT_LABEL, interpretNote, paletteFromSwatches, readBoard, takenFrom } from '@/lib/ux-v0/references';
import { MOOD_CATEGORIES, REF_ASPECTS, creditText, type MoodCategory, type Moodboard as Board, type MoodboardRef, type Palette, type RefAspect, type RefState, type TypePair } from '@/lib/ux-v0/types';

const CAT_LABEL: Record<MoodCategory, string> = { imagery: 'Imagery', texture: 'Texture', composition: 'Composition' };

interface Props {
  board: Board;
  sample: string;
  busy: string | null;
  error: string;
  onRef: (id: string, state: RefState) => void;
  onReplace: (ref: MoodboardRef) => void;
  onPalette: (id: string, state: RefState) => void;
  onType: (id: string, state: RefState) => void;
  onDirection: (aspect: Aspect) => void;
  onMore: () => void;
  onMoreLike: (category: MoodCategory) => void;
  onSearch: (category: MoodCategory, query: string) => void;
  /** change what a reference means: what to take, its note, key, steer away, use on the page, its colours */
  onUpdate: (id: string, patch: Partial<MoodboardRef>) => void;
  /** the designer's own files */
  onUpload: (files: File[]) => void;
  /** keep a palette made from a reference's colours */
  onAddPalette: (p: Palette) => void;
  /** sample a library picture's colours (when its library allows it) */
  onSample: (ref: MoodboardRef) => void;
  signedIn: boolean;
}

/** The designer's own search: a few words, in one kind of image. */
function BoardSearch({ busy, onSearch }: { busy: boolean; onSearch: Props['onSearch'] }) {
  const [term, setTerm] = useState('');
  const [cat, setCat] = useState<MoodCategory>('imagery');
  return (
    <form
      className="v0-board-search"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        if (term.trim()) onSearch(cat, term.trim());
      }}
    >
      <label className="v0-sr" htmlFor="v0-board-q">
        Search the image libraries
      </label>
      <svg className="st-search-icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
        <circle cx="7" cy="7" r="4.6" />
        <path d="M10.4 10.4 14 14" />
      </svg>
      <input id="v0-board-q" className="v0-board-q" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search the libraries" maxLength={80} />
      <select className="st-search-kind" aria-label="Kind of image" value={cat} onChange={(e) => setCat(e.target.value as MoodCategory)}>
        {MOOD_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CAT_LABEL[c]}
          </option>
        ))}
      </select>
      <button type="submit" className="st-search-go" disabled={busy || !term.trim()}>
        Search
      </button>
    </form>
  );
}

function useSpecimenFonts(pairs: TypePair[]) {
  const href = useMemo(() => fontStylesheet(pairs.flatMap((t) => [t.display, t.body])), [pairs]);
  useEffect(() => {
    if (!href) return;
    if (document.querySelector(`link[data-v0-fonts="${CSS.escape(href)}"]`)) return;
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = href;
    l.dataset.v0Fonts = href;
    document.head.appendChild(l);
  }, [href]);
}

const reducedMotion = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** What a reference means: its note (read as it is written), what to take and leave, and its flags. */
function RefPanel({ r, p }: { r: MoodboardRef; p: Props }) {
  const [note, setNote] = useState(r.note ?? '');
  const reading = note.trim() ? interpretNote(note) : null;
  const t = takenFrom(r);
  const manual = !!(r.take?.length || r.leave?.length);
  const state = (a: RefAspect): 'take' | 'leave' | 'none' => (manual ? (r.take?.includes(a) ? 'take' : r.leave?.includes(a) ? 'leave' : 'none') : t.take.includes(a) && r.note ? 'take' : t.leave.includes(a) ? 'leave' : 'none');
  const cycle = (a: RefAspect) => {
    const now = state(a);
    const take = (manual ? r.take ?? [] : r.note ? t.take : []).filter((x) => x !== a);
    const leave = (manual ? r.leave ?? [] : r.note ? t.leave : []).filter((x) => x !== a);
    if (now === 'none') take.push(a);
    if (now === 'take') leave.push(a);
    p.onUpdate(r.id, { take, leave });
  };
  const saveNote = () => {
    const v = note.trim();
    if (v === (r.note ?? '')) return;
    const read = v ? interpretNote(v) : null;
    // the note leads what is taken until the designer sets the chips by hand
    p.onUpdate(r.id, {
      note: v,
      ...(read && !manual && (read.take.length || read.leave.length) ? { take: read.take, leave: read.leave } : {}),
      ...(read?.avoid ? { avoid: true, asContent: false } : {}),
      ...(read?.key ? { key: true } : {}),
    });
  };
  const pal = r.swatches?.length ? paletteFromSwatches(r.swatches) : null;
  const said = (x: { take: RefAspect[]; leave: RefAspect[]; avoid: boolean; key: boolean }) =>
    [
      x.take.length ? `take ${x.take.map((a) => ASPECT_LABEL[a].toLowerCase()).join(', ')}` : '',
      x.leave.length ? `leave ${x.leave.map((a) => ASPECT_LABEL[a].toLowerCase()).join(', ')}` : '',
      x.key ? 'a key reference' : '',
      x.avoid ? 'something to steer away from' : '',
    ]
      .filter(Boolean)
      .join('; ');
  return (
    <div className="st-refpanel" role="group" aria-label={`What “${r.title || 'this reference'}” is for`}>
      <label className="st-refnote">
        <span className="st-refpanel-l">In your words</span>
        <textarea
          rows={2}
          value={note}
          placeholder="“The typography, not the palette”, “the light”, “how it moves”…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={saveNote}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) (e.preventDefault(), saveNote(), (e.target as HTMLTextAreaElement).blur());
          }}
        />
      </label>
      {reading && said(reading) && (
        <p className="st-reading" aria-live="polite">
          Read as {said(reading)}.
        </p>
      )}
      <div className="st-refpanel-row">
        <span className="st-refpanel-l">Take from it</span>
        <div className="st-aspects">
          {REF_ASPECTS.map((a) => {
            const s = state(a);
            return (
              <button key={a} type="button" className={`st-aspect is-${s}`} onClick={() => cycle(a)} aria-label={`${ASPECT_LABEL[a]}: ${s === 'take' ? 'taken' : s === 'leave' ? 'left behind' : 'not said'}`} title="Once: take it · twice: leave it · three times: not said">
                {s === 'leave' ? <s>{ASPECT_LABEL[a]}</s> : ASPECT_LABEL[a]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="st-refpanel-row st-flags">
        <label className="st-flag">
          <input type="checkbox" checked={!!r.key} onChange={(e) => p.onUpdate(r.id, { key: e.target.checked })} /> Key reference
        </label>
        <label className="st-flag">
          <input type="checkbox" checked={!!r.avoid} onChange={(e) => p.onUpdate(r.id, { avoid: e.target.checked, ...(e.target.checked ? { asContent: false } : {}) })} /> Steer away from it
        </label>
        <label className={`st-flag${r.media === 'video' || r.avoid ? ' is-off' : ''}`}>
          <input type="checkbox" checked={r.asContent === true} disabled={r.media === 'video' || !!r.avoid} onChange={(e) => p.onUpdate(r.id, { asContent: e.target.checked })} /> Use the picture on the page
        </label>
      </div>
      <div className="st-refpanel-row">
        <span className="st-refpanel-l">Its colours</span>
        {r.swatches?.length ? (
          <span className="st-refswatches">
            {r.swatches.map((h) => (
              <span key={h} style={{ background: h }} title={h} aria-hidden="true" />
            ))}
            {pal && (
              <button
                type="button"
                className="sb-link is-meta is-strong"
                onClick={() =>
                  p.onAddPalette({
                    id: `pal_ref_${r.providerId.replace(/[^a-z0-9]/gi, '').slice(0, 12)}_${Date.now().toString(36)}`,
                    name: `From “${(r.title || 'a reference').slice(0, 40)}”`,
                    colors: [
                      { role: 'background', hex: pal.background },
                      { role: 'text', hex: pal.text },
                      { role: 'accent', hex: pal.accent },
                      ...r.swatches!.filter((h) => ![pal.background, pal.accent].includes(h)).slice(0, 2).map((hex) => ({ role: 'surface', hex })),
                    ],
                    state: 'kept',
                  })
                }
              >
                Keep as a palette
              </button>
            )}
          </span>
        ) : r.provider === 'upload' ? (
          <span className="st-none">None could be read.</span>
        ) : (
          <button type="button" className="sb-link is-meta" onClick={() => p.onSample(r)}>
            Sample its colours
          </button>
        )}
      </div>
    </div>
  );
}

function Tile({ r, p, big = false }: { r: MoodboardRef; p: Props; big?: boolean }) {
  const [open, setOpen] = useState(false);
  const ratio = r.width && r.height ? r.height / r.width : 0.75;
  const { take, leave } = takenFrom(r);
  const said = !!(r.take?.length || r.leave?.length || r.note);
  return (
    <figure className={`v0-tile${r.state === 'kept' ? ' is-kept' : ''}${r.avoid ? ' is-avoid' : ''}${big ? ' is-key' : ''}${open ? ' is-open' : ''}`} style={{ ['--ratio' as any]: Math.min(1.6, Math.max(0.5, ratio)) }}>
      <div className="v0-tile-img" style={{ background: r.color ?? undefined }}>
        {r.media === 'video' ? (
          r.url ? <video src={r.url} muted loop playsInline autoPlay={!reducedMotion()} preload="metadata" aria-label={r.title || 'A moving reference'} /> : <span className="st-tile-missing">This clip is kept in another browser.</span>
        ) : r.url || r.thumb ? (
          <img src={r.thumb || r.url} alt={r.title || `${CAT_LABEL[r.category]} reference`} loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="st-tile-missing">This picture is kept in another browser.</span>
        )}
        <span className="st-badges" aria-hidden="true">
          {r.state === 'kept' && !r.avoid && <span className="st-kept-badge">Kept</span>}
          {r.key && <span className="st-badge is-key">Key</span>}
          {r.asContent === true && !r.avoid && <span className="st-badge is-content">On the page</span>}
          {r.avoid && <span className="st-badge is-avoid">Steer away</span>}
        </span>
      </div>
      <figcaption>
        {said && (
          <span className="st-takes">
            {take.map((a) => (
              <span key={a} className="st-take">
                {ASPECT_LABEL[a]}
              </span>
            ))}
            {leave.map((a) => (
              <span key={a} className="st-take is-leave">
                <s>{ASPECT_LABEL[a]}</s>
              </span>
            ))}
            {r.note && <span className="st-note">“{r.note}”</span>}
          </span>
        )}
        <span className="v0-credit">
          {r.sourceUrl ? (
            <a href={r.sourceUrl} target="_blank" rel="noreferrer">
              {creditText(r)}
            </a>
          ) : (
            creditText(r)
          )}
          {r.licenseUrl && (
            <>
              {' · '}
              <a href={r.licenseUrl} target="_blank" rel="noreferrer">
                licence
              </a>
            </>
          )}
        </span>
        <span className="v0-tile-acts">
          {r.state === 'kept' ? (
            <button type="button" className="sb-link is-meta is-strong" onClick={() => p.onRef(r.id, 'proposed')} aria-pressed="true">
              Kept
            </button>
          ) : (
            <button type="button" className="sb-link is-meta is-strong" onClick={() => p.onRef(r.id, 'kept')} aria-pressed="false">
              Keep
            </button>
          )}
          {r.provider !== 'upload' && (
            <button type="button" className="sb-link is-meta" onClick={() => p.onReplace(r)}>
              Replace
            </button>
          )}
          <button type="button" className="sb-link is-meta" onClick={() => p.onRef(r.id, 'rejected')}>
            Remove
          </button>
          <button type="button" className="sb-link is-meta st-more" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            {open ? 'Done' : 'Notes'}
          </button>
        </span>
        {open && <RefPanel r={r} p={p} />}
      </figcaption>
    </figure>
  );
}

function PaletteRow({ p, onPalette }: { p: Palette; onPalette: Props['onPalette'] }) {
  const bg = p.colors.find((c) => c.role === 'background')?.hex ?? p.colors[0].hex;
  const text = p.colors.find((c) => c.role === 'text')?.hex ?? p.colors[p.colors.length - 1].hex;
  const ratio = contrastRatio(text, bg);
  return (
    <div className={`v0-palette${p.state === 'kept' ? ' is-kept' : ''}`}>
      <div className="v0-palette-strip">
        {p.state === 'kept' && (
          <span className="st-kept-badge" aria-hidden="true">
            Kept
          </span>
        )}
        {p.colors.map((c, i) => (
          <span key={i} className="v0-chip-colour" style={{ background: c.hex, color: contrastRatio('#ffffff', c.hex) > contrastRatio('#111111', c.hex) ? '#fff' : '#111' }}>
            <span>{c.role}</span>
            <span>{c.hex}</span>
          </span>
        ))}
      </div>
      <p className="st-taste-name">{p.name}</p>
      <p className={`st-taste-note${ratio < 4.5 ? ' is-fail' : ''}`}>
        Text on background {ratio.toFixed(1)}:1{ratio < 4.5 ? ', too faint for body text' : ''}
      </p>
      <span className="v0-tile-acts">
        <button type="button" className="sb-link is-meta is-strong" onClick={() => onPalette(p.id, p.state === 'kept' ? 'proposed' : 'kept')} aria-pressed={p.state === 'kept'}>
          {p.state === 'kept' ? 'Kept' : 'Keep'}
        </button>
        <button type="button" className="sb-link is-meta" onClick={() => onPalette(p.id, 'rejected')}>
          Remove
        </button>
      </span>
    </div>
  );
}

function TypeCard({ t, sample, onType }: { t: TypePair; sample: string; onType: Props['onType'] }) {
  return (
    <div className={`v0-type${t.state === 'kept' ? ' is-kept' : ''}`}>
      {t.state === 'kept' && (
        <span className="st-kept-badge" aria-hidden="true">
          Kept
        </span>
      )}
      <p className="v0-type-display" style={{ fontFamily: fontStack(t.display) }}>
        {sample}
      </p>
      <p className="v0-type-body" style={{ fontFamily: fontStack(t.body) }}>
        Set in {t.body}: steady over a long paragraph, and quiet enough to let the headline lead.
      </p>
      <p className="st-taste-name">
        {t.display} <span>with {t.body}</span>
      </p>
      {t.note && <p className="st-taste-note">{t.note}</p>}
      <span className="v0-tile-acts">
        <button type="button" className="sb-link is-meta is-strong" onClick={() => onType(t.id, t.state === 'kept' ? 'proposed' : 'kept')} aria-pressed={t.state === 'kept'}>
          {t.state === 'kept' ? 'Kept' : 'Keep'}
        </button>
        <button type="button" className="sb-link is-meta" onClick={() => onType(t.id, 'rejected')}>
          Remove
        </button>
      </span>
    </div>
  );
}

export function Moodboard(p: Props) {
  const pairs = p.board.type.filter((t) => t.state !== 'rejected');
  useSpecimenFonts(pairs);
  const shown = p.board.refs.filter((r) => r.state !== 'rejected');
  const kept = shown.filter((r) => r.state === 'kept').length;
  const keys = shown.filter((r) => r.key && !r.avoid);
  const away = shown.filter((r) => r.avoid);
  const rest = shown.filter((r) => !r.key && !r.avoid);
  const palettes = p.board.palettes.filter((x) => x.state !== 'rejected');
  const credits = shown.filter((r) => r.state === 'kept' && r.provider !== 'upload');
  const reading = useMemo(() => readBoard(p.board), [p.board]);
  const onPage = shown.filter((r) => r.asContent === true && !r.avoid).length;
  const files = useRef<HTMLInputElement>(null);
  const [dropping, setDropping] = useState(false);
  return (
    <div
      className={`v0-board${dropping ? ' is-dropping' : ''}`}
      aria-label="Moodboard"
      onDragOver={(e) => {
        if (![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node)) return;
        setDropping(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files?.length) return;
        e.preventDefault();
        setDropping(false);
        p.onUpload([...e.dataTransfer.files]);
      }}
    >
      <header className="v0-board-head st-board-head">
        <h2 className="st-board-title">The moodboard</h2>
        <span className="st-board-count">
          {shown.length} reference{shown.length === 1 ? '' : 's'}
          {kept ? ` · ${kept} kept` : ''}
          {onPage ? ` · ${onPage} on the page` : ''}
        </span>
        {p.busy && (
          <span className="st-board-busy" role="status" aria-live="polite">
            {p.busy}
          </span>
        )}
        <span className="v0-spacer" />
        <button type="button" className="sb-btn is-sm st-add-own" onClick={() => files.current?.click()}>
          Add your own
        </button>
        <BoardSearch busy={!!p.busy} onSearch={p.onSearch} />
        <button type="button" className="sb-link is-meta" onClick={p.onMore} disabled={!!p.busy || !p.board.queries.length}>
          More images
        </button>
        <input
          ref={files}
          type="file"
          multiple
          hidden
          aria-label="Add your own references"
          accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm"
          onChange={(e) => {
            const fs = [...(e.target.files ?? [])];
            if (fs.length) p.onUpload(fs);
            e.target.value = '';
          }}
        />
      </header>
      <p className="st-board-reading">
        {reading.said.length ? (
          <>
            <span className="st-board-reading-l">SocriaUX reads</span> {reading.said.join(' · ')}.
          </>
        ) : (
          <>
            <span className="st-board-reading-l">References inspire; they are not pasted in.</span> Open a reference’s notes to say what to take from it, or mark a picture to use on the page.
          </>
        )}
      </p>
      {p.error && (
        <p className="v0-error-line" role="alert">
          {p.error}
        </p>
      )}
      {!shown.length && !palettes.length && !pairs.length && (
        <p className="v0-empty v0-board-empty">
          {p.signedIn ? 'Images appear here as the direction becomes clear. Answer a question or two, search for something above, or add your own: a spread, a still, a clip.' : 'Images appear here as the direction becomes clear. Sign in to let SocriaUX find them, or add your own references.'}
        </p>
      )}
      {keys.length > 0 && (
        <section className="v0-board-group st-keys" aria-label="Key references">
          <div className="v0-group-head">
            <span className="sb-label">Key references</span>
          </div>
          <div className="st-keygrid">
            {keys.map((r) => (
              <Tile key={r.id} r={r} p={p} big />
            ))}
          </div>
        </section>
      )}
      {MOOD_CATEGORIES.map((c) => {
        const refs = rest.filter((r) => r.category === c);
        if (!refs.length) return null;
        return (
          <section key={c} className="v0-board-group" aria-label={CAT_LABEL[c]}>
            <div className="v0-group-head">
              <span className="sb-label">{CAT_LABEL[c]}</span>
              <button type="button" className="sb-link is-meta" onClick={() => p.onMoreLike(c)} disabled={!!p.busy}>
                More like these
              </button>
              <button type="button" className="sb-link is-meta" onClick={() => p.onDirection(c)} disabled={!!p.busy}>
                Another direction
              </button>
            </div>
            <div className="v0-masonry">
              {refs.map((r) => (
                <Tile key={r.id} r={r} p={p} />
              ))}
            </div>
          </section>
        );
      })}
      {(palettes.length > 0 || pairs.length > 0) && (
        <section className="v0-board-group" aria-label="Colour and type">
          <div className="v0-group-head">
            <span className="sb-label">Colour and type</span>
            <button type="button" className="sb-link is-meta" onClick={() => p.onDirection('palette')} disabled={!!p.busy}>
              Another palette
            </button>
            <button type="button" className="sb-link is-meta" onClick={() => p.onDirection('type')} disabled={!!p.busy}>
              Another type pair
            </button>
          </div>
          <div className="v0-taste">
            {palettes.map((x) => (
              <PaletteRow key={x.id} p={x} onPalette={p.onPalette} />
            ))}
            {pairs.map((t) => (
              <TypeCard key={t.id} t={t} sample={p.sample} onType={p.onType} />
            ))}
          </div>
        </section>
      )}
      {away.length > 0 && (
        <section className="v0-board-group st-away" aria-label="Steer away from">
          <div className="v0-group-head">
            <span className="sb-label">
              <span className="st-glyph g-objection is-sm" aria-hidden="true" /> Steer away from
            </span>
          </div>
          <div className="v0-masonry">
            {away.map((r) => (
              <Tile key={r.id} r={r} p={p} />
            ))}
          </div>
        </section>
      )}
      {credits.length > 0 && (
        <footer className="v0-credits">
          <span className="sb-label">Credits for kept images</span>
          <ul>
            {credits.map((r) => (
              <li key={r.id}>{creditText(r)}</li>
            ))}
          </ul>
        </footer>
      )}
      {dropping && (
        <div className="st-dropveil" aria-hidden="true">
          <span>Drop to add your own references</span>
        </div>
      )}
    </div>
  );
}
