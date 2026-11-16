'use client';
// components/ux-v0/Moodboard.tsx — the visual direction, as a board.
//
// Real images from licensed libraries, grouped by what they are for: imagery
// (the subject world), texture (materials and surfaces) and composition
// (layouts to learn from). Every image carries its creator, source and
// licence. Keep what fits, replace what nearly does, remove what does not —
// a replacement never brings back an image this project has already seen.
// Type pairs are set in the real fonts; palettes show their contrast.

import { useEffect, useMemo, useState } from 'react';
import { contrastRatio } from '@/lib/ux/audit';
import { fontStack, fontStylesheet } from '@/lib/ux-v0/fonts';
import type { Aspect } from '@/lib/ux-v0/discovery';
import { MOOD_CATEGORIES, creditText, type MoodCategory, type Moodboard as Board, type MoodboardRef, type Palette, type RefState, type TypePair } from '@/lib/ux-v0/types';

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
      <input id="v0-board-q" className="v0-field v0-board-q" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search the libraries — two or three words work best" maxLength={80} />
      <select className="v0-select" aria-label="Kind of image" value={cat} onChange={(e) => setCat(e.target.value as MoodCategory)}>
        {MOOD_CATEGORIES.map((c) => (
          <option key={c} value={c}>
            {CAT_LABEL[c]}
          </option>
        ))}
      </select>
      <button type="submit" className="sb-link is-meta is-strong" disabled={busy || !term.trim()}>
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

function Tile({ r, onRef, onReplace }: { r: MoodboardRef; onRef: Props['onRef']; onReplace: Props['onReplace'] }) {
  const ratio = r.width && r.height ? r.height / r.width : 0.75;
  return (
    <figure className={`v0-tile${r.state === 'kept' ? ' is-kept' : ''}`} style={{ ['--ratio' as any]: Math.min(1.6, Math.max(0.5, ratio)) }}>
      <div className="v0-tile-img" style={{ background: r.color ?? undefined }}>
        <img src={r.thumb} alt={r.title || `${CAT_LABEL[r.category]} reference`} loading="lazy" referrerPolicy="no-referrer" />
      </div>
      <figcaption>
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
            <button type="button" className="sb-link is-meta is-strong" onClick={() => onRef(r.id, 'proposed')} aria-pressed="true">
              Kept
            </button>
          ) : (
            <button type="button" className="sb-link is-meta is-strong" onClick={() => onRef(r.id, 'kept')} aria-pressed="false">
              Keep
            </button>
          )}
          <button type="button" className="sb-link is-meta" onClick={() => onReplace(r)}>
            Replace
          </button>
          <button type="button" className="sb-link is-meta" onClick={() => onRef(r.id, 'rejected')}>
            Remove
          </button>
        </span>
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
        {p.colors.map((c, i) => (
          <span key={i} className="v0-chip-colour" style={{ background: c.hex, color: contrastRatio('#ffffff', c.hex) > contrastRatio('#111111', c.hex) ? '#fff' : '#111' }}>
            <span>{c.role}</span>
            <span>{c.hex}</span>
          </span>
        ))}
      </div>
      <p className="v0-quiet">
        {p.name} · text on background {ratio.toFixed(1)}:1{ratio < 4.5 ? ' — too faint for body text' : ''}
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
      <p className="v0-type-display" style={{ fontFamily: fontStack(t.display) }}>
        {sample}
      </p>
      <p className="v0-type-body" style={{ fontFamily: fontStack(t.body) }}>
        Body text set in {t.body}: legible at small sizes, steady over a long paragraph, and quiet enough to let the headline lead.
      </p>
      <p className="v0-quiet">
        {t.display} / {t.body}
        {t.note ? ` — ${t.note}` : ''}
      </p>
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
  const palettes = p.board.palettes.filter((x) => x.state !== 'rejected');
  const credits = shown.filter((r) => r.state === 'kept');
  return (
    <div className="v0-board" aria-label="Moodboard">
      <header className="v0-board-head">
        <span className="sb-label">Moodboard</span>
        <span className="v0-quiet">
          {shown.length} image{shown.length === 1 ? '' : 's'} · {kept} kept
        </span>
        <span className="v0-spacer" />
        {p.busy && (
          <span className="v0-quiet" role="status" aria-live="polite">
            {p.busy}
          </span>
        )}
        <button type="button" className="sb-link is-meta" onClick={p.onMore} disabled={!!p.busy || !p.board.queries.length}>
          More images
        </button>
      </header>
      <BoardSearch busy={!!p.busy} onSearch={p.onSearch} />
      {p.error && (
        <p className="v0-error-line" role="alert">
          {p.error}
        </p>
      )}
      {!shown.length && !palettes.length && !pairs.length && (
        <p className="v0-empty v0-board-empty">{p.signedIn ? 'Images appear here as the direction becomes clear. Answer a question or two, or search for something above.' : 'Images appear here as the direction becomes clear. Sign in to let SocriaUX find them.'}</p>
      )}
      {MOOD_CATEGORIES.map((c) => {
        const refs = shown.filter((r) => r.category === c);
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
                <Tile key={r.id} r={r} onRef={p.onRef} onReplace={p.onReplace} />
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
    </div>
  );
}
