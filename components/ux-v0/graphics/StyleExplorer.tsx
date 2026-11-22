'use client';

// components/ux-v0/graphics/StyleExplorer.tsx — the design's language: seen, chosen, blended, compared, read from a
// picture, and kept as one's own.
//
// The Styles panel (in the editor's left column) says what the design speaks and lets the person move it: the
// influence and how strongly, density, experimentation, ornament, and a lock that holds the style through
// regeneration. The Explorer (a full-width sheet over the canvas) browses the library by category and by plain-words
// search ("vintage music poster", "elegant 1920s", "old internet aesthetic"); every card shows the design's own words
// composed in that style (a real composition, not a sample picture), with what makes the style and what it is for. Up
// to four can be compared side by side with the exact text. A reference picture is measured in this browser and read
// into a profile (nothing copied). The person's own styles are made, renamed, duplicated, organised, exported and
// imported here. Every change of language is shown as a preview on the canvas before it is applied, and undo takes it
// back. Nothing here calls a model.

import { useEffect, useMemo, useRef, useState } from 'react';
import type { GraphicDirection, GraphicKind } from '@/lib/ux-v0/graphics/compose';
import type { Artboard, GraphicDoc, Op } from '@/lib/ux-v0/graphics/doc';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import type { Measure } from '@/lib/ux-v0/graphics/text';
import { effectiveDNA, type StyleSelection } from '@/lib/ux-v0/graphics/styles/blend';
import {
  CONTROL_FACES,
  customFromBrand,
  customFromControls,
  customFromDoc,
  customFromSelection,
  customFromWords,
  duplicateStyle,
  exportLibrary,
  importLibrary,
  MAX_CUSTOM_STYLES,
  renameStyle,
  type Controls,
  type CustomLibrary,
} from '@/lib/ux-v0/graphics/styles/custom';
import { evaluateStyle, type Fidelity } from '@/lib/ux-v0/graphics/styles/evaluate';
import { restyleArtboard, sketchInStyle } from '@/lib/ux-v0/graphics/styles/edit';
import { readReference, selectionFromReferences, type ReferenceReading } from '@/lib/ux-v0/graphics/styles/reference';
import { allStyles, searchStyles, styleById } from '@/lib/ux-v0/graphics/styles/registry';
import { CONSTRUCTIONS, DIMENSIONS, STYLE_CATEGORIES, type Dimension, type StyleCategory, type StyleDNA } from '@/lib/ux-v0/graphics/styles/schema';
import { download, loadFaces, slug } from './faces';
import { useStyleLibrary } from './styleLibrary';

export interface StyleProps {
  doc: GraphicDoc;
  board: Artboard;
  /** the direction the design is composed in */
  dir: GraphicDirection;
  kind?: GraphicKind;
  measure: Measure;
  href: (id: string, src: string) => string;
  /** a new document shown on the canvas as a preview, to apply or discard */
  onPreview: (next: GraphicDoc, label: string) => void;
  onOps: (ops: Op[], label: string) => void;
  onNote: (text: string, tone?: 'ok' | 'warn') => void;
}

const CATEGORY_LABEL: Record<StyleCategory, string> = {
  historical: 'Historical',
  contemporary: 'Contemporary',
  digital: 'Digital',
  print: 'Print',
  cultural: 'Cultural',
  custom: 'Mine',
};
const SLIDERS = [
  ['density', 'Density'],
  ['experimentation', 'Experimentation'],
  ['ornament', 'Ornament'],
] as const;

/** The rows of a fidelity reading, in the order a designer reads a design. */
const FID_ROWS: readonly (readonly [keyof Fidelity['dims'], string])[] = [
  ['typography', 'Typography'],
  ['colour', 'Colour'],
  ['composition', 'Composition'],
  ['geometry', 'Geometry'],
  ['texture', 'Surface'],
  ['imagery', 'Imagery'],
  ['ornament', 'Ornament'],
  ['coherence', 'Coherence'],
  ['brief', 'The brief’s words'],
  ['readability', 'Readability'],
  ['editability', 'Editability'],
];

/** Manual controls starting from a style: its own colours, headline face and case, density, ornament, surface and construction. */
function controlsOf(id: string, customs: readonly StyleDNA[]): Controls | null {
  const s = styleById(id, customs);
  if (!s) return null;
  return {
    base: s.id,
    ground: s.colour.ground,
    ink: s.colour.ink,
    accent: s.colour.accent,
    display: s.typography.display.faces[0],
    case: s.typography.display.case,
    density: s.composition.density,
    ornament: s.ornament.density,
    texture: Math.max(0, ...Object.values(s.texture)),
    construction: s.composition.constructions[0],
  };
}

const HAND_SLIDERS = [
  ['density', 'Density'],
  ['ornament', 'Ornament'],
  ['texture', 'Surface'],
] as const;

/** The custom styles a selection refers to, carried in it so the design stays whole wherever it goes. */
function withCustoms(sel: StyleSelection, lib: readonly StyleDNA[]): StyleSelection {
  const ids = new Set([sel.primary, sel.secondary, sel.tertiary, ...Object.values(sel.dims ?? {})].filter(Boolean) as string[]);
  const carried = [...(sel.customs ?? []), ...lib].filter((c, i, all) => ids.has(c.id) && all.findIndex((x) => x.id === c.id) === i).slice(0, 6);
  return carried.length ? { ...sel, customs: carried } : (({ customs: _c, ...rest }) => rest)(sel);
}

const svgOf = (doc: GraphicDoc, href: StyleProps['href'], prefix: string) => {
  const b = doc.artboards[0];
  return {
    svg: renderArtboard(doc, b, { href, idPrefix: prefix }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"'),
    ratio: b.width / b.height,
  };
};

/** A design composed in a style, drawn small: what a card and a comparison show. */
function useSketch(p: StyleProps, sel: StyleSelection | null, customs: readonly StyleDNA[], key: string) {
  return useMemo(() => {
    if (!sel) return null;
    try {
      const d = sketchInStyle(p.doc, p.board.id, sel, {
        dir: p.dir,
        kind: p.kind,
        measure: p.measure,
        customs,
      });
      return d ? svgOf(d, p.href, `sx-${key}-`) : null;
    } catch {
      return null;
    }
    // the sketch depends on the words and pictures of the artboard, the style, and the faces' measure
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [p.board, p.doc.tokens, sel, customs, p.measure, key]);
}

function StyleCard({ p, style, customs, on, compared, onCompare, onUse }: { p: StyleProps; style: StyleDNA; customs: readonly StyleDNA[]; on: boolean; compared: boolean; onCompare: () => void; onUse: () => void }) {
  const sel = useMemo<StyleSelection>(
    () => ({
      primary: style.id,
      strength: 0,
      ...(style.category === 'custom' ? { customs: [style] } : {}),
    }),
    [style],
  );
  const sketch = useSketch(p, sel, customs, style.id);
  return (
    <li className={`gx-style-card${on ? ' is-on' : ''}`}>
      <div className="gx-style-art" style={{ aspectRatio: String(sketch?.ratio ?? 0.8) }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: sketch?.svg ?? '' }} />
      <div className="gx-style-body">
        <p className="gx-style-name">
          {style.name}
          {on && <span className="gx-badge">In use</span>}
        </p>
        <p className="gx-style-era">
          {style.era} · {CATEGORY_LABEL[style.category]}
        </p>
        <p className="gx-style-desc">{style.description}</p>
        <p className="gx-style-traits">{style.principles.slice(0, 2).join(' · ')}</p>
        <p className="gx-style-uses">
          <span className="v0-quiet">For</span> {style.uses.slice(0, 3).join(', ')}
        </p>
        <div className="gx-style-acts">
          <button type="button" className="sb-btn is-sm is-primary" onClick={onUse}>
            Preview on the design
          </button>
          <label className="gx-check">
            <input type="checkbox" checked={compared} onChange={onCompare} /> Compare
          </label>
        </div>
      </div>
    </li>
  );
}

function Comparison({ p, ids, customs, onUse, onRemove }: { p: StyleProps; ids: readonly string[]; customs: readonly StyleDNA[]; onUse: (id: string) => void; onRemove: (id: string) => void }) {
  return (
    <ul className="gx-compare" aria-label="Styles side by side">
      {ids.map((id) => (
        <CompareCell key={id} p={p} id={id} customs={customs} onUse={() => onUse(id)} onRemove={() => onRemove(id)} />
      ))}
    </ul>
  );
}
function CompareCell({ p, id, customs, onUse, onRemove }: { p: StyleProps; id: string; customs: readonly StyleDNA[]; onUse: () => void; onRemove: () => void }) {
  const s = styleById(id, customs);
  const sel = useMemo<StyleSelection>(
    () => ({
      primary: id,
      strength: 0,
      ...(s?.category === 'custom' ? { customs: [s] } : {}),
    }),
    [id, s],
  );
  const sketch = useSketch(p, sel, customs, `c-${id}`);
  if (!s) return null;
  return (
    <li className="gx-compare-cell">
      <div className="gx-style-art" style={{ aspectRatio: String(sketch?.ratio ?? 0.8) }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: sketch?.svg ?? '' }} />
      <p className="gx-style-name">{s.name}</p>
      <p className="gx-style-era">{s.composition.constructions[0].replace(/-/g, ' ')}</p>
      <div className="gx-style-acts">
        <button type="button" className="sb-btn is-sm is-primary" onClick={onUse}>
          Preview on the design
        </button>
        <button type="button" className="sb-link is-meta" onClick={onRemove}>
          Remove
        </button>
      </div>
    </li>
  );
}

/** A picture's pixels, drawn small in this browser (nothing leaves it). */
async function pixelsOf(f: File): Promise<{ width: number; height: number; data: Uint8ClampedArray }> {
  const url = URL.createObjectURL(f);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const k = 96 / Math.max(img.naturalWidth, img.naturalHeight);
    const W = Math.max(8, Math.round(img.naturalWidth * k));
    const H = Math.max(8, Math.round(img.naturalHeight * k));
    const c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new Error('no canvas');
    ctx.drawImage(img, 0, 0, W, H);
    return ctx.getImageData(0, 0, W, H);
  } finally {
    URL.revokeObjectURL(url);
  }
}

type Sheet = 'browse' | 'compare' | 'picture' | 'mine';

export function StyleExplorer(p: StyleProps & { open: boolean; onClose: () => void; initialQuery?: string }) {
  const { library, setLibrary, stored } = useStyleLibrary();
  const customs = library.styles;
  const current = p.doc.style ?? p.dir.style ?? null;
  const [sheet, setSheet] = useState<Sheet>('browse');
  const [query, setQuery] = useState(p.initialQuery ?? '');
  const [cat, setCat] = useState<StyleCategory | 'all'>('all');
  const [shown, setShown] = useState(12);
  const [compare, setCompare] = useState<string[]>([]);
  const [refs, setRefs] = useState<{ name: string; reading: ReferenceReading; dims: Dimension[] }[]>([]);
  const [makeWords, setMakeWords] = useState('');
  const [editing, setEditing] = useState<{
    id: string;
    field: 'name' | 'folder';
    value: string;
  } | null>(null);
  const [brand, setBrand] = useState({ name: '', colours: '', display: '' });
  const [hand, setHand] = useState<Controls | null>(null);
  const [handName, setHandName] = useState('');
  // a style by hand starts from any style: the library's, the person's own, or one the design carries (a reference
  // picture read into a style travels inside the design, not in the library)
  const handPool = useMemo(() => [...customs, ...(current?.customs ?? []).filter((c) => !customs.some((x) => x.id === c.id))], [customs, current?.customs]);
  const handNow = hand ?? controlsOf(current?.primary ?? 'bauhaus', handPool) ?? controlsOf('bauhaus', handPool);
  const handBase = handNow ? styleById(handNow.base, handPool) : null;
  const importRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const pool = allStyles(customs);
    const q = query.trim();
    const list = q
      ? searchStyles(q, { customs, limit: pool.length })
          .filter((h) => h.score > 0)
          .map((h) => h.style)
      : pool;
    return cat === 'all' ? list : list.filter((s) => s.category === cat);
  }, [query, cat, customs]);
  const page = results.slice(0, shown);

  // the faces of what is shown, loaded so the previews are set in them
  useEffect(() => {
    if (!p.open) return;
    const ids = [...page.map((s) => s.id), ...compare];
    const faces = ids.flatMap((id) => {
      const s = styleById(id, customs);
      return s
        ? [
            {
              face: s.typography.display.faces[0],
              weight: s.typography.display.weight,
              italic: false,
            },
            { face: s.typography.body.faces[0], weight: 400, italic: false },
          ]
        : [];
    });
    void loadFaces(faces.filter((f) => !!f.face));
  }, [p.open, page, compare, customs]);

  useEffect(() => {
    if (!p.open) return;
    const k = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose();
    window.addEventListener('keydown', k);
    dialogRef.current?.focus();
    return () => window.removeEventListener('keydown', k);
  }, [p.open, p.onClose]);

  const preview = (sel: StyleSelection, label: string) => {
    const full = withCustoms(sel, customs);
    const r = restyleArtboard(p.doc, p.board.id, full, {
      dir: p.dir,
      kind: p.kind,
      measure: p.measure,
      customs,
    });
    if (!r) return p.onNote('This artboard has no headline to carry into another style.', 'warn');
    p.onPreview(r.doc, `${label}${r.kept ? ` (${r.kept} locked object${r.kept === 1 ? '' : 's'} kept)` : ''}`);
    p.onClose();
  };
  const useStyle = (id: string) => {
    const s = styleById(id, customs);
    if (!s) return;
    preview(
      {
        primary: id,
        strength: 0,
        ...(current?.seedKey ? { seedKey: current.seedKey } : {}),
      },
      `in ${s.name}`,
    );
  };
  const toggleCompare = (id: string) => setCompare((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id].slice(-4)));

  const addReference = async (f: File) => {
    try {
      const px = await pixelsOf(f);
      const name = f.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 40) || 'Reference';
      const reading = readReference(px, { name: `From ${name}`, customs });
      setRefs((r) => [...r, { name, reading, dims: [] }].slice(-2));
      setSheet('picture');
    } catch (e) {
      p.onNote(`That picture could not be read: ${(e as Error).message || 'it may be too small'}.`, 'warn');
    }
  };
  const saveCustom = (dna: StyleDNA | null, what: string) => {
    if (!dna) return p.onNote(`Nothing to keep: ${what}.`, 'warn');
    if (library.styles.length >= MAX_CUSTOM_STYLES) return p.onNote(`Your library holds at most ${MAX_CUSTOM_STYLES} styles. Remove one first.`, 'warn');
    setLibrary((l) => ({ ...l, styles: [...l.styles, dna] }));
    p.onNote(`Kept as “${dna.name}” in your styles.`, 'ok');
  };

  if (!p.open) return null;
  return (
    <div className="gx-explorer" role="dialog" aria-modal="true" aria-label="Style Explorer" tabIndex={-1} ref={dialogRef}>
      <header className="gx-explorer-h">
        <div>
          <p className="gx-kicker">Style Explorer</p>
          <h2>{current ? `Speaking ${effectiveDNA(current, customs).dna.name}` : 'This design speaks no named style yet'}</h2>
        </div>
        <nav className="sb-seg" aria-label="Style Explorer sections">
          {(
            [
              ['browse', `Browse (${allStyles(customs).length})`],
              ['compare', `Compare (${compare.length})`],
              ['picture', 'From a picture'],
              ['mine', `My styles (${customs.length})`],
            ] as [Sheet, string][]
          ).map(([id, label]) => (
            <button key={id} type="button" className={`sb-seg-item${sheet === id ? ' is-on' : ''}`} aria-pressed={sheet === id} onClick={() => setSheet(id)}>
              {label}
            </button>
          ))}
        </nav>
        <button type="button" className="sb-btn is-sm" onClick={p.onClose}>
          Close
        </button>
      </header>

      {sheet === 'browse' && (
        <section className="gx-explorer-body" aria-label="Browse styles">
          <div className="gx-explorer-find">
            <label className="gx-text">
              <span className="v0-sr">Search styles in plain words</span>
              <input value={query} onChange={(e) => (setQuery(e.target.value), setShown(12))} placeholder="Search in plain words: “vintage music poster”, “elegant 1920s”, “old internet aesthetic”…" autoComplete="off" />
            </label>
            <div className="gx-chips" role="group" aria-label="Category">
              {(['all', ...STYLE_CATEGORIES] as const).map((c) => (
                <button key={c} type="button" className={`gx-chip${cat === c ? ' is-on' : ''}`} aria-pressed={cat === c} onClick={() => (setCat(c), setShown(12))}>
                  {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
                </button>
              ))}
            </div>
          </div>
          {!results.length && <p className="v0-quiet">No style matches “{query}”. Try fewer words, a decade, or a mood.</p>}
          <ul className="gx-style-grid">
            {page.map((s) => (
              <StyleCard key={s.id} p={p} style={s} customs={customs} on={current?.primary === s.id} compared={compare.includes(s.id)} onCompare={() => toggleCompare(s.id)} onUse={() => useStyle(s.id)} />
            ))}
          </ul>
          {results.length > shown && (
            <button type="button" className="sb-btn is-sm" onClick={() => setShown((n) => n + 12)}>
              Show {Math.min(12, results.length - shown)} more of {results.length - shown}
            </button>
          )}
        </section>
      )}

      {sheet === 'compare' && (
        <section className="gx-explorer-body" aria-label="Compare styles">
          {compare.length ? (
            <>
              <p className="v0-quiet">The same words, exactly, in each style. Choose one to preview it on the design.</p>
              <Comparison p={p} ids={compare} customs={customs} onUse={useStyle} onRemove={(id) => setCompare((c) => c.filter((x) => x !== id))} />
            </>
          ) : (
            <p className="v0-quiet">Tick “Compare” on up to four styles in Browse to see them side by side.</p>
          )}
        </section>
      )}

      {sheet === 'picture' && (
        <section className="gx-explorer-body" aria-label="A style from a picture">
          <p>A picture is measured here, in this browser — its density, quiet space, symmetry, colour, surface and the run of its lines — and read into a style. Nothing of it is copied: not its layout, its words or its marks.</p>
          <label className="sb-btn is-sm gx-file">
            Add a reference picture
            <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => (e.target.files?.[0] && void addReference(e.target.files[0]), (e.target.value = ''))} />
          </label>
          {refs.map((r, i) => (
            <article key={`${r.name}-${i}`} className="gx-ref">
              <p className="gx-style-name">{r.name}</p>
              <div className="gx-palette">
                {r.reading.palette.map((c) => (
                  <span key={c} className="gx-swatch" style={{ background: c }} title={c} />
                ))}
              </div>
              <ul className="gx-ref-reads">
                {(['composition', 'colour', 'texture', 'geometry', 'imagery', 'typography'] as const).map((d) => (
                  <li key={d}>
                    <b>{d}</b> {r.reading.reads[d]}
                  </li>
                ))}
                <li>
                  <b>nearest</b> {r.reading.reads.influences.join(', ')}
                </li>
              </ul>
              <p className="v0-quiet">{r.reading.notes[0]}</p>
              <div className="gx-style-acts">
                <button
                  type="button"
                  className="sb-btn is-sm is-primary"
                  onClick={() =>
                    preview(
                      selectionFromReferences([{ dna: r.reading.dna }], current, 'all') ?? {
                        primary: r.reading.dna.id,
                        strength: 0,
                        customs: [r.reading.dna],
                      },
                      `in the style of ${r.name}, your content kept`,
                    )
                  }
                >
                  Use as the style (keep my content)
                </button>
                <button
                  type="button"
                  className="sb-btn is-sm"
                  onClick={() =>
                    preview(
                      selectionFromReferences([{ dna: r.reading.dna }], current, 'not-layout') ?? {
                        primary: r.reading.dna.id,
                        strength: 0,
                        customs: [r.reading.dna],
                      },
                      `${r.name}’s visual language, the layout kept`,
                    )
                  }
                >
                  Its visual language, not its layout
                </button>
                <button type="button" className="sb-link is-meta" onClick={() => saveCustom({ ...r.reading.dna, id: `${r.reading.dna.id}` }, 'the reading')}>
                  Keep as my style
                </button>
              </div>
              <fieldset className="gx-ref-dims">
                <legend className="gx-panel-sub">Take only some dimensions from it</legend>
                {DIMENSIONS.map((d) => (
                  <label key={d} className="gx-check">
                    <input
                      type="checkbox"
                      checked={r.dims.includes(d)}
                      onChange={(e) =>
                        setRefs((all) =>
                          all.map((x, j) =>
                            j === i
                              ? {
                                  ...x,
                                  dims: e.target.checked ? [...x.dims, d] : x.dims.filter((y) => y !== d),
                                }
                              : x,
                          ),
                        )
                      }
                    />{' '}
                    {d}
                  </label>
                ))}
              </fieldset>
            </article>
          ))}
          {refs.some((r) => r.dims.length) && (
            <button
              type="button"
              className="sb-btn is-sm is-primary"
              onClick={() => {
                const parts = refs.filter((r) => r.dims.length).map((r) => ({ dna: r.reading.dna, dims: r.dims }));
                const sel = selectionFromReferences(
                  parts,
                  current ?? {
                    primary: parts[0].dna.id,
                    strength: 0,
                    customs: [parts[0].dna],
                  },
                  'dims',
                );
                if (sel)
                  preview(
                    sel,
                    refs
                      .filter((r) => r.dims.length)
                      .map((r) => `${r.dims.join(' and ')} from ${r.name}`)
                      .join('; '),
                  );
              }}
            >
              Preview the chosen dimensions on the design
            </button>
          )}
        </section>
      )}

      {sheet === 'mine' && (
        <section className="gx-explorer-body" aria-label="My styles">
          {!stored && <p className="gx-note is-warn">This browser is not keeping your styles (private browsing?): they last until you close the page. Export them to keep them.</p>}
          <div className="gx-mine-make">
            <button
              type="button"
              className="sb-btn is-sm"
              disabled={!current}
              onClick={() => current && saveCustom(customFromSelection(withCustoms(current, customs), `${effectiveDNA(current, customs).dna.name} (mine)`, customs), 'no style is in use')}
            >
              Keep the style in use
            </button>
            <button type="button" className="sb-btn is-sm" onClick={() => saveCustom(customFromDoc(p.doc, `${p.doc.name.slice(0, 40)} style`, customs), 'the design')}>
              Make one from this design
            </button>
          </div>
          <form className="gx-mine-row" onSubmit={(e) => (e.preventDefault(), saveCustom(customFromWords(makeWords, makeWords.slice(0, 40), customs), 'those words name no style'), setMakeWords(''))}>
            <label className="gx-text">
              <span>From words</span>
              <input value={makeWords} onChange={(e) => setMakeWords(e.target.value)} placeholder="“warm risograph with Swiss typography”" />
            </label>
            <button type="submit" className="sb-btn is-sm" disabled={!makeWords.trim()}>
              Make it
            </button>
          </form>
          <form
            className="gx-mine-row"
            onSubmit={(e) => {
              e.preventDefault();
              const colours = brand.colours
                .split(/[\s,]+/)
                .filter((c) => /^#?[0-9a-f]{6}$/i.test(c))
                .map((c) => (c.startsWith('#') ? c : `#${c}`));
              saveCustom(
                customFromBrand(
                  {
                    name: brand.name || 'Brand style',
                    colours,
                    display: brand.display || undefined,
                  },
                  customs,
                ),
                'give the brand’s colours as hex (#1a2b3c)',
              );
              setBrand({ name: '', colours: '', display: '' });
            }}
          >
            <label className="gx-text">
              <span>From brand guidelines</span>
              <input value={brand.name} onChange={(e) => setBrand((b) => ({ ...b, name: e.target.value }))} placeholder="Brand name" />
            </label>
            <label className="gx-text">
              <span>Colours (hex)</span>
              <input value={brand.colours} onChange={(e) => setBrand((b) => ({ ...b, colours: e.target.value }))} placeholder="#0b1f3a #f4efe6 #e4572e" />
            </label>
            <label className="gx-text">
              <span>Headline face</span>
              <input value={brand.display} onChange={(e) => setBrand((b) => ({ ...b, display: e.target.value }))} placeholder="Fraunces" />
            </label>
            <button type="submit" className="sb-btn is-sm" disabled={!brand.colours.trim()}>
              Make it
            </button>
          </form>
          {handNow && (
            <details className="gx-mine-hand">
              <summary>By hand: start from a style, then set its colours, headline face and case, density, ornament, surface and construction</summary>
              <form
                className="gx-hand"
                aria-label="A style by hand"
                onSubmit={(e) => {
                  e.preventDefault();
                  saveCustom(customFromControls(handNow, (handName.trim() || `${handBase?.name ?? 'Style'} by hand`).slice(0, 60), handPool), 'choose the style to start from');
                  setHandName('');
                }}
              >
                <label className="gx-sel-field">
                  <span>Start from</span>
                  <select className="v0-select" value={handNow.base} onChange={(e) => setHand(controlsOf(e.target.value, handPool))}>
                    {allStyles(handPool).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="gx-hand-colours">
                  {(
                    [
                      ['ground', 'Ground'],
                      ['ink', 'Ink'],
                      ['accent', 'Accent'],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="gx-hand-colour">
                      <span>{label}</span>
                      <input type="color" value={handNow[key] ?? '#000000'} onChange={(e) => setHand({ ...handNow, [key]: e.target.value })} />
                    </label>
                  ))}
                </div>
                <label className="gx-sel-field">
                  <span>Headline face</span>
                  <select className="v0-select" value={handNow.display ?? ''} onChange={(e) => setHand({ ...handNow, display: e.target.value })}>
                    {CONTROL_FACES().map((f) => (
                      <option key={f} value={f}>
                        {f}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="gx-sel-field">
                  <span>Headline case</span>
                  <select className="v0-select" value={handNow.case ?? 'sentence'} onChange={(e) => setHand({ ...handNow, case: e.target.value as Controls['case'] })}>
                    <option value="sentence">As written</option>
                    <option value="upper">Capitals</option>
                    <option value="lower">Lower case</option>
                  </select>
                </label>
                {HAND_SLIDERS.map(([key, label]) => (
                  <label key={key} className="gx-num is-range">
                    <span>
                      {label} · {handNow[key] ?? 0}
                    </span>
                    <input type="range" min={0} max={100} step={5} value={handNow[key] ?? 0} onChange={(e) => setHand({ ...handNow, [key]: Number(e.target.value) })} />
                  </label>
                ))}
                <label className="gx-sel-field">
                  <span>Construction</span>
                  <select className="v0-select" value={handNow.construction ?? ''} onChange={(e) => setHand({ ...handNow, construction: e.target.value })}>
                    {(handBase?.composition.constructions ?? []).map((c) => (
                      <option key={c} value={c}>
                        {CONSTRUCTIONS[c as keyof typeof CONSTRUCTIONS]?.label ?? c}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="gx-text">
                  <span>Name</span>
                  <input value={handName} onChange={(e) => setHandName(e.target.value)} placeholder={`${handBase?.name ?? 'Style'} by hand`} />
                </label>
                <button type="submit" className="sb-btn is-sm is-primary">
                  Make it
                </button>
              </form>
            </details>
          )}
          {!customs.length && <p className="v0-quiet">No styles of your own yet.</p>}
          <ul className="gx-mine-list">
            {customs.map((s) => (
              <li key={s.id}>
                <span>
                  <b>{s.name}</b>
                  <em className="v0-quiet">
                    {library.folders[s.id] ? `${library.folders[s.id]} · ` : ''}
                    {s.description.slice(0, 120)}
                  </em>
                </span>
                <button type="button" className="sb-link is-meta" onClick={() => useStyle(s.id)}>
                  Preview
                </button>
                {editing?.id === s.id ? (
                  <form
                    className="gx-mine-row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const v = editing.value.trim();
                      if (editing.field === 'name') {
                        if (v)
                          setLibrary((l) => ({
                            ...l,
                            styles: l.styles.map((x) => (x.id === s.id ? renameStyle(x, v) : x)),
                          }));
                      } else
                        setLibrary((l) => ({
                          ...l,
                          folders: {
                            ...Object.fromEntries(Object.entries(l.folders).filter(([k]) => k !== s.id)),
                            ...(v ? { [s.id]: v } : {}),
                          },
                        }));
                      setEditing(null);
                    }}
                  >
                    <label className="gx-text">
                      <span className="v0-sr">{editing.field === 'name' ? 'New name' : 'Folder (empty: none)'}</span>
                      <input autoFocus value={editing.value} onChange={(e) => setEditing({ ...editing, value: e.target.value })} placeholder={editing.field === 'name' ? 'Name' : 'Folder (empty: none)'} />
                    </label>
                    <button type="submit" className="sb-btn is-sm is-primary">
                      Save
                    </button>
                    <button type="button" className="sb-link is-meta" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </form>
                ) : (
                  <button type="button" className="sb-link is-meta" onClick={() => setEditing({ id: s.id, field: 'name', value: s.name })}>
                    Rename
                  </button>
                )}
                <button type="button" className="sb-link is-meta" onClick={() => saveCustom(duplicateStyle(s, customs), 'it')}>
                  Duplicate
                </button>
                <button
                  type="button"
                  className="sb-link is-meta"
                  onClick={() =>
                    setEditing({
                      id: s.id,
                      field: 'folder',
                      value: library.folders[s.id] ?? '',
                    })
                  }
                >
                  Folder
                </button>
                <button
                  type="button"
                  className="sb-link is-meta"
                  onClick={() =>
                    setLibrary((l) => ({
                      ...l,
                      styles: l.styles.filter((x) => x.id !== s.id),
                      folders: Object.fromEntries(Object.entries(l.folders).filter(([k]) => k !== s.id)),
                    }))
                  }
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
          <div className="gx-mine-make">
            <button
              type="button"
              className="sb-btn is-sm"
              disabled={!customs.length}
              onClick={() =>
                download(
                  new Blob([exportLibrary(library)], {
                    type: 'application/json',
                  }),
                  `${slug('socriaux styles')}.json`,
                )
              }
            >
              Export my styles
            </button>
            <button type="button" className="sb-btn is-sm" onClick={() => importRef.current?.click()}>
              Import styles…
            </button>
            <input
              ref={importRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={async (e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (f.size > 2_000_000) return p.onNote('That file is too large to be a styles file.', 'warn');
                const r = importLibrary(library, await f.text());
                setLibrary(() => r.library);
                p.onNote(`${r.added} style${r.added === 1 ? '' : 's'} added.${r.notes.length ? ` ${r.notes.slice(0, 2).join(' ')}` : ''}`, r.added ? 'ok' : 'warn');
              }}
            />
          </div>
          <p className="v0-quiet">Your styles are kept in this browser and travel inside every design that uses them. Sharing a library with a team workspace is not available yet: export it as a file to pass it on.</p>
        </section>
      )}
    </div>
  );
}

/** The left column's Styles panel: what the design speaks, and its controls (see the head of this file). */
export function StylePanel(p: StyleProps & { onExplore: (query?: string) => void }) {
  const { library } = useStyleLibrary();
  const customs = library.styles;
  const current = p.doc.style ?? p.dir.style ?? null;
  const eff = current ? effectiveDNA(current, [...(current.customs ?? []), ...customs]) : null;
  const [draft, setDraft] = useState<StyleSelection | null>(current);
  const key = JSON.stringify(current);
  useEffect(() => setDraft(current), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const [q, setQ] = useState('');
  const pool = useMemo(() => allStyles(customs), [customs]);
  const changed = JSON.stringify(draft) !== key;
  const d = draft ? effectiveDNA(draft, [...(draft.customs ?? []), ...customs]) : null;
  // how closely this artboard speaks its language: measured from the design itself, by rules, never a model's opinion
  const fid = useMemo(() => (current ? evaluateStyle({ ...p.doc, artboards: [p.board] }, { selection: current, customs, measure: p.measure }) : null), [p.doc, p.board, current, customs, p.measure]);
  const apply = () => {
    if (!draft) return;
    const r = restyleArtboard(p.doc, p.board.id, withCustoms(draft, customs), {
      dir: p.dir,
      kind: p.kind,
      measure: p.measure,
      customs,
    });
    if (!r) return p.onNote('This artboard has no headline to carry into another style.', 'warn');
    p.onPreview(r.doc, `${d?.dna.name ?? 'the style'}, as set${r.kept ? ` (${r.kept} locked object${r.kept === 1 ? '' : 's'} kept)` : ''}`);
  };
  return (
    <section className="gx-panel" aria-label="Styles">
      <p className="gx-panel-h">{eff ? eff.dna.name : 'No named style'}</p>
      {eff ? (
        <>
          <p className="v0-quiet">{styleById(current!.primary, [...(current!.customs ?? []), ...customs])?.era}</p>
          {!!eff.says.length && (
            <ul className="gx-style-says">
              {eff.says.slice(0, 3).map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          )}
          {fid && (
            <details className="gx-fidelity">
              <summary>
                How closely it speaks it: <b>{fid.overall}</b> of 100
              </summary>
              <ul className="gx-fid-list">
                {FID_ROWS.filter(([k]) => !fid.dims[k].unchecked).map(([k, label]) => (
                  <li key={k}>
                    <span>{label}</span>
                    <meter min={0} max={100} low={50} high={80} optimum={100} value={fid.dims[k].score} aria-label={`${label}: ${fid.dims[k].score} of 100`} />
                    <b>{fid.dims[k].score}</b>
                    <em className="v0-quiet">{fid.dims[k].notes.slice(0, 2).join('; ')}</em>
                  </li>
                ))}
              </ul>
              <p className="gx-panel-sub">For your eye (never scored)</p>
              <ul className="gx-style-says">
                {fid.checkpoints.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="v0-quiet">Measured from the design itself, by rules: a guide, not a verdict. Your eye decides.</p>
            </details>
          )}
        </>
      ) : (
        <p className="v0-quiet">Choose a design language: its type, colour, shapes, surface and composition, not only its colours.</p>
      )}
      <form className="gx-mine-row" onSubmit={(e) => (e.preventDefault(), p.onExplore(q))}>
        <label className="gx-text">
          <span className="v0-sr">Find a style</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="“elegant 1920s”, “old internet”…" autoComplete="off" />
        </label>
        <button type="submit" className="sb-btn is-sm is-primary">
          Explore styles
        </button>
      </form>
      {draft && (
        <fieldset className="gx-fields">
          <label className="gx-sel-field">
            <span>Primary</span>
            <select className="v0-select" value={draft.primary} onChange={(e) => setDraft({ ...draft, primary: e.target.value })}>
              {pool.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="gx-sel-field">
            <span>Influence</span>
            <select
              className="v0-select"
              value={draft.secondary ?? ''}
              onChange={(e) =>
                setDraft(
                  e.target.value
                    ? {
                        ...draft,
                        secondary: e.target.value,
                        strength: draft.strength || 40,
                      }
                    : (({ secondary: _s, ...rest }) => ({
                        ...rest,
                        strength: 0,
                      }))(draft),
                )
              }
            >
              <option value="">None</option>
              {pool
                .filter((s) => s.id !== draft.primary)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          {draft.secondary && (
            <label className="gx-num is-range">
              <span>Blend strength · {draft.strength}%</span>
              <input type="range" min={0} max={100} step={5} value={draft.strength} onChange={(e) => setDraft({ ...draft, strength: Number(e.target.value) })} />
            </label>
          )}
          {SLIDERS.map(([k, label]) => (
            <label key={k} className="gx-num is-range">
              <span>
                {label} · {draft[k] ?? (d ? d[k] : 0)}
              </span>
              <input type="range" min={0} max={100} step={5} value={draft[k] ?? (d ? d[k] : 0)} onChange={(e) => setDraft({ ...draft, [k]: Number(e.target.value) })} />
            </label>
          ))}
          <div className="gx-style-acts">
            <button type="button" className="sb-btn is-sm is-primary" disabled={!changed || !!current?.locked} onClick={apply}>
              Preview these settings
            </button>
            {changed && (
              <button type="button" className="sb-link is-meta" onClick={() => setDraft(current)}>
                Reset
              </button>
            )}
          </div>
        </fieldset>
      )}
      {current && (
        <label className="gx-check">
          <input
            type="checkbox"
            checked={!!current.locked}
            onChange={(e) =>
              p.onOps(
                [
                  {
                    op: 'style',
                    set: { ...current, locked: e.target.checked },
                  },
                ],
                e.target.checked ? 'style locked' : 'style unlocked',
              )
            }
          />{' '}
          Lock the style (regenerating and changes in words keep it)
        </label>
      )}
      <p className="v0-quiet">Changes of language are shown on the canvas first; Apply keeps them, undo takes them back. Your words, pictures and locked objects are kept.</p>
    </section>
  );
}
