'use client';

// components/ux-v0/graphics/GraphicBrief.tsx — the first two steps of a graphic: what it is and says (the brief), then
// three directions to choose from, each shown as the design itself, composed, not described.
//
// The words of a graphic are the designer's, exactly: SocriaUX reads a first draft of the fields from their sentence
// (readGraphicBrief: quoted words become the headline, the subtitle, the points) and they correct it. A headline is
// required: nothing is composed around invented words. Numbers for a chart are theirs too, and the chart says where
// they came from.

import { useMemo, useRef } from 'react';
import { FORMATS, formatOf, sizeLabel } from '@/lib/ux-v0/graphics/formats';
import { composeGraphic, GRAPHIC_KINDS, readGraphicBrief, type GraphicBrief, type GraphicDirection, type GraphicKind } from '@/lib/ux-v0/graphics/compose';
import { normalizeGraphicBrief } from '@/lib/ux-v0/graphics/state';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { refineDoc } from '@/lib/ux-v0/graphics/check';
import type { Asset } from '@/lib/ux-v0/graphics/doc';
import type { Measure } from '@/lib/ux-v0/graphics/text';
import { styleById } from '@/lib/ux-v0/graphics/styles/registry';
import type { StyleDNA } from '@/lib/ux-v0/graphics/styles/schema';

/** What a direction's design language is, in a line: its period and kind. */
const styleLine = (id: string, customs?: readonly StyleDNA[]): string => {
  const s = styleById(id, customs ?? []);
  return s ? [s.era, s.category === 'custom' ? 'your style' : s.category].filter(Boolean).join(' · ') : id;
};

export const KIND_LABEL: Record<GraphicKind, string> = {
  poster: 'Poster or flyer',
  social: 'Social post',
  carousel: 'Carousel',
  ad: 'Advertisement',
  banner: 'Banner',
  magazine: 'Magazine cover',
  book: 'Book cover',
  album: 'Album cover',
  card: 'Business card',
  label: 'Label or packaging',
  infographic: 'Infographic',
  identity: 'Identity board',
  announcement: 'Announcement',
  presentation: 'Presentation slide',
  campaign: 'Campaign, in several formats',
};

/** The brief as the form holds it: text, so a half-typed line is kept as typed. */
export interface BriefFields {
  words: string;
  kind: GraphicKind;
  formats: string[];
  headline: string;
  subhead: string;
  body: string;
  cta: string;
  brand: string;
  meta: string;
  items: string;
  data: string;
  dataSource: string;
  dataUnit: string;
  mood: string;
}

const lines = (s: string) =>
  s
    .split('\n')
    .map((x) => x.trim())
    .filter(Boolean);

/** “Label: value” lines into numbers to chart; a line that is not one is left out (and said by the count). */
export function parseData(s: string): { label: string; value: number; percent: boolean }[] {
  return lines(s)
    .map((l) => l.match(/^(.+?)\s*[:=]\s*(-?[\d.,]+)\s*(%?)\s*$/) ?? l.match(/^(.+?)\s+[–—-]\s+(-?[\d.,]+)\s*(%?)\s*$/))
    .filter((m): m is RegExpMatchArray => !!m && Number.isFinite(Number(m[2].replace(/,/g, ''))))
    .map((m) => ({ label: m[1].trim().slice(0, 60), value: Number(m[2].replace(/,/g, '')), percent: m[3] === '%' }));
}

export function fieldsOf(b: GraphicBrief | null, words = ''): BriefFields {
  const r = b ?? (words.trim() ? readGraphicBrief(words) : null);
  const c = r?.content;
  return {
    words: r?.purpose ?? words,
    kind: r?.kind ?? 'poster',
    formats: r?.formats ?? ['a4'],
    headline: c?.headline && c.headline !== '[Headline]' ? c.headline : '',
    subhead: c?.subhead ?? '',
    body: c?.body ?? '',
    cta: c?.cta ?? '',
    brand: c?.brand ?? '',
    meta: (c?.meta ?? []).join('\n'),
    items: (c?.items ?? []).join('\n'),
    data: (c?.data ?? []).map((d) => `${d.label}: ${d.value}`).join('\n'),
    dataSource: c?.dataSource ?? '',
    dataUnit: c?.dataUnit ?? '',
    mood: (r?.mood ?? []).join(', '),
  };
}

/** The fields as a brief held to its shape; null without a headline. */
export function briefOf(f: BriefFields, images: readonly string[]): GraphicBrief | null {
  const data = parseData(f.data);
  return normalizeGraphicBrief({
    purpose: f.words,
    kind: f.kind,
    formats: f.formats,
    content: {
      headline: f.headline,
      subhead: f.subhead,
      body: f.body,
      cta: f.cta,
      brand: f.brand,
      meta: lines(f.meta),
      items: lines(f.items),
      data: data.map(({ label, value }) => ({ label, value })),
      dataSource: f.dataSource,
      dataUnit: f.dataUnit || (data.length && data.every((d) => d.percent) ? '%' : ''),
    },
    mood: f.mood
      .split(/[,;\n]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
    images,
  });
}

const DEFAULT_FORMATS: Record<GraphicKind, string[]> = {
  poster: ['a4'],
  social: ['instagram-square'],
  carousel: ['instagram-square'],
  ad: ['instagram-portrait'],
  banner: ['banner-wide'],
  magazine: ['magazine'],
  book: ['book'],
  album: ['album'],
  card: ['business-card'],
  label: ['label'],
  infographic: ['instagram-portrait'],
  identity: ['presentation'],
  announcement: ['linkedin'],
  presentation: ['presentation'],
  campaign: ['instagram-square', 'story', 'landscape', 'a4'],
};

export interface WebsiteSource {
  id: string;
  name: string;
  direction: string;
}

export function BriefStage({
  fields,
  setFields,
  assets,
  thumb,
  onUpload,
  onRemoveAsset,
  websites,
  source,
  onUseWebsite,
  onContinue,
  error,
}: {
  fields: BriefFields;
  setFields: (f: BriefFields) => void;
  assets: readonly Asset[];
  thumb: (a: Asset) => string;
  onUpload: (f: File) => void;
  onRemoveAsset: (id: string) => void;
  websites: readonly WebsiteSource[];
  source: { projectId: string; name: string } | null;
  onUseWebsite: (id: string | null) => void;
  onContinue: () => void;
  error: string;
}) {
  const file = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<BriefFields>) => setFields({ ...fields, ...patch });
  const data = parseData(fields.data);
  const dataLines = lines(fields.data).length;
  const read = () => {
    const b = readGraphicBrief(fields.words);
    const f = fieldsOf(b);
    // what the designer already wrote in a field stays theirs
    const keep = (k: keyof BriefFields) => (typeof fields[k] === 'string' && (fields[k] as string).trim() ? fields[k] : f[k]);
    setFields({ ...f, words: fields.words, headline: keep('headline') as string, subhead: keep('subhead') as string, body: keep('body') as string, cta: keep('cta') as string, brand: keep('brand') as string, meta: keep('meta') as string, items: keep('items') as string, data: keep('data') as string, dataSource: keep('dataSource') as string, dataUnit: keep('dataUnit') as string, mood: keep('mood') as string });
  };
  const toggleFormat = (id: string) => {
    const on = fields.formats.includes(id);
    const next = on ? fields.formats.filter((x) => x !== id) : [...fields.formats, id];
    set({ formats: next.length ? next : fields.formats });
  };
  const screen = FORMATS.filter((f) => f.unit === 'px');
  const print = FORMATS.filter((f) => f.unit === 'pt');
  return (
    <div className="gx-brief">
      <header className="gx-brief-h">
        <p className="gx-kicker">A graphic · 1 of 3</p>
        <h1>What is it, and what does it say?</h1>
        <p className="v0-quiet">Describe it in a sentence; put the exact words in quotes. SocriaUX reads a first draft of the fields below. Correct anything: the words on the design are only ever yours.</p>
      </header>

      <div className="gx-field">
        <label htmlFor="gx-words">In a sentence</label>
        <textarea id="gx-words" rows={3} value={fields.words} placeholder="A poster for “Letters in Motion”, an experimental typography exhibition, 12–30 June 2027" onChange={(e) => set({ words: e.target.value })} />
        <button type="button" className="sb-btn is-sm" onClick={read} disabled={!fields.words.trim()}>
          Read my words into the fields
        </button>
      </div>

      <div className="gx-cols">
        <div className="gx-field">
          <label htmlFor="gx-kind">What kind of graphic</label>
          <select id="gx-kind" className="v0-select" value={fields.kind} onChange={(e) => set({ kind: e.target.value as GraphicKind, formats: DEFAULT_FORMATS[e.target.value as GraphicKind] })}>
            {GRAPHIC_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]}
              </option>
            ))}
          </select>
        </div>
        <div className="gx-field">
          <label htmlFor="gx-mood">Mood, in a few words</label>
          <input id="gx-mood" value={fields.mood} placeholder="bold, experimental" onChange={(e) => set({ mood: e.target.value })} />
        </div>
      </div>

      <fieldset className="gx-formats">
        <legend>Formats {fields.kind === 'carousel' ? '(a carousel makes several slides of one)' : '(one artboard each)'}</legend>
        <p className="gx-formats-h">Screens</p>
        <div className="gx-chips">
          {screen.map((f) => (
            <label key={f.id} className={`gx-chip${fields.formats.includes(f.id) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={fields.formats.includes(f.id)} onChange={() => toggleFormat(f.id)} />
              {f.label} <span>{sizeLabel(f)}</span>
            </label>
          ))}
        </div>
        <p className="gx-formats-h">Print</p>
        <div className="gx-chips">
          {print.map((f) => (
            <label key={f.id} className={`gx-chip${fields.formats.includes(f.id) ? ' is-on' : ''}`}>
              <input type="checkbox" checked={fields.formats.includes(f.id)} onChange={() => toggleFormat(f.id)} />
              {f.label} <span>{sizeLabel(f)}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <section className="gx-words" aria-labelledby="gx-words-h">
        <h2 id="gx-words-h">The words, exactly</h2>
        <div className="gx-field">
          <label htmlFor="gx-headline">
            Headline <em>required</em>
          </label>
          <input id="gx-headline" value={fields.headline} aria-required="true" onChange={(e) => set({ headline: e.target.value })} />
        </div>
        <div className="gx-cols">
          <div className="gx-field">
            <label htmlFor="gx-subhead">Subtitle</label>
            <input id="gx-subhead" value={fields.subhead} onChange={(e) => set({ subhead: e.target.value })} />
          </div>
          <div className="gx-field">
            <label htmlFor="gx-brand">Brand, author or artist</label>
            <input id="gx-brand" value={fields.brand} onChange={(e) => set({ brand: e.target.value })} />
          </div>
        </div>
        <div className="gx-field">
          <label htmlFor="gx-body">Body text</label>
          <textarea id="gx-body" rows={2} value={fields.body} onChange={(e) => set({ body: e.target.value })} />
        </div>
        <div className="gx-cols">
          <div className="gx-field">
            <label htmlFor="gx-meta">Details, one per line</label>
            <textarea id="gx-meta" rows={3} value={fields.meta} placeholder={'12–30 June 2027\nThe Print Room, Lisbon'} onChange={(e) => set({ meta: e.target.value })} />
          </div>
          <div className="gx-field">
            <label htmlFor="gx-items">{fields.kind === 'carousel' ? 'Slides, one per line' : 'Points, one per line'}</label>
            <textarea id="gx-items" rows={3} value={fields.items} onChange={(e) => set({ items: e.target.value })} />
          </div>
        </div>
        <div className="gx-field">
          <label htmlFor="gx-cta">Call to action</label>
          <input id="gx-cta" value={fields.cta} placeholder="Book now" onChange={(e) => set({ cta: e.target.value })} />
        </div>
      </section>

      <details className="gx-data" open={fields.kind === 'infographic' || !!fields.data.trim()}>
        <summary>Numbers to chart</summary>
        <p className="v0-quiet">Only numbers you give are charted; none are invented. One per line, “label: value”.</p>
        <div className="gx-cols">
          <div className="gx-field">
            <label htmlFor="gx-data">Data</label>
            <textarea id="gx-data" rows={4} value={fields.data} placeholder={'Programmes: 72%\nFundraising: 18%\nRunning costs: 10%'} onChange={(e) => set({ data: e.target.value })} />
            {dataLines > 0 && (
              <p className={`gx-hint${data.length < dataLines ? ' is-warn' : ''}`} role="status">
                {data.length} of {dataLines} line{dataLines === 1 ? '' : 's'} read as numbers{data.length < dataLines ? ' (the others are left out)' : ''}.
              </p>
            )}
          </div>
          <div>
            <div className="gx-field">
              <label htmlFor="gx-source">Where the numbers come from</label>
              <input id="gx-source" value={fields.dataSource} placeholder="Annual report 2026" onChange={(e) => set({ dataSource: e.target.value })} />
            </div>
            <div className="gx-field">
              <label htmlFor="gx-unit">Unit</label>
              <input id="gx-unit" value={fields.dataUnit} maxLength={6} placeholder="%" onChange={(e) => set({ dataUnit: e.target.value })} />
            </div>
          </div>
        </div>
      </details>

      <section className="gx-pics" aria-labelledby="gx-pics-h">
        <h2 id="gx-pics-h">Your pictures</h2>
        <p className="v0-quiet">Optional. Kept in this browser, used as they are: never redrawn or generated.</p>
        <ul className="gx-pic-list">
          {assets.map((a) => (
            <li key={a.id}>
              <img src={thumb(a)} alt={a.name} />
              <span>{a.name}</span>
              <button type="button" className="sb-link is-meta" onClick={() => onRemoveAsset(a.id)} aria-label={`Remove ${a.name}`}>
                Remove
              </button>
            </li>
          ))}
        </ul>
        <button type="button" className="sb-btn is-sm" onClick={() => file.current?.click()}>
          Add a picture
        </button>
        <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => (e.target.files?.[0] && onUpload(e.target.files[0]), (e.target.value = ''))} />
      </section>

      {websites.length > 0 && (
        <div className="gx-field">
          <label htmlFor="gx-site">Use the direction of one of your websites</label>
          <select id="gx-site" className="v0-select" value={source?.projectId ?? ''} onChange={(e) => onUseWebsite(e.target.value || null)}>
            <option value="">No: propose directions for this graphic</option>
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name} · {w.direction}
              </option>
            ))}
          </select>
          <p className="v0-quiet">Its colours, typefaces, shapes and type habits carry over, so the graphic belongs to the same brand.</p>
        </div>
      )}

      {error && (
        <p className="v0-error-line" role="alert">
          {error}
        </p>
      )}
      <div className="gx-go">
        <button type="button" className="sb-btn is-primary" onClick={onContinue}>
          {source ? 'Compose it in that direction' : 'See three directions'}
        </button>
      </div>
    </div>
  );
}

/** One direction's card: the design composed in it, at its first format. */
export function DirectionsStage({
  brief,
  options,
  assets,
  measure,
  href,
  source,
  onChoose,
  onMore,
  onBack,
}: {
  brief: GraphicBrief;
  options: readonly GraphicDirection[];
  assets: Asset[];
  measure: Measure;
  href: (id: string, src: string) => string;
  source: { projectId: string; name: string } | null;
  onChoose: (d: GraphicDirection) => void;
  onMore: () => void;
  onBack: () => void;
}) {
  const previews = useMemo(
    () =>
      options.map((d, i) => {
        // checked and repaired as the design will be when chosen: the preview is what the designer gets
        const { doc: made, plans } = composeGraphic(brief, d, { measure, seed: 7 + i, assets });
        const doc = refineDoc(made, measure).doc;
        const b = doc.artboards[0];
        const svg = renderArtboard(doc, b, { measure, href, idPrefix: `dp${i}-` }).replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"');
        return { svg, ratio: b.width / b.height, plan: plans[0], boards: doc.artboards.length };
      }),
    [options, brief, measure, assets, href],
  );
  const f = formatOf(brief.formats[0]);
  return (
    <div className="gx-dirs">
      <header className="gx-brief-h">
        <p className="gx-kicker">A graphic · 2 of 3</p>
        <h1>Three directions for “{brief.content.headline}”</h1>
        <p className="v0-quiet">
          Each is the design itself{f ? `, at ${f.label} (${sizeLabel(f)})` : ''}, with your words exactly. Choose one to edit; nothing is final.
        </p>
      </header>
      <ol className="gx-dir-list">
        {options.map((d, i) => {
          const p = previews[i];
          return (
            <li key={`${d.name}-${i}`} className="gx-dir">
              <div className="gx-dir-art" style={{ aspectRatio: String(p.ratio) }} aria-hidden="true" dangerouslySetInnerHTML={{ __html: p.svg }} />
              <h2>
                {d.name}
                {source && i === 0 ? <span className="gx-badge">From {source.name}</span> : null}
              </h2>
              <p className="gx-dir-lang">{d.style ? styleLine(d.style.primary, d.style.customs) : d.language.replace(/-/g, ' ')}</p>
              {d.concept && <p className="gx-dir-concept">{d.concept}</p>}
              <p className="gx-swatches" aria-label="Colours">
                {(['background', 'text', 'accent', 'muted'] as const).map((k) => (
                  <span key={k} style={{ background: d.tokens.colors[k] }} title={`${k} ${d.tokens.colors[k]}`} />
                ))}
              </p>
              <p className="v0-quiet">
                {d.tokens.fonts.display} and {d.tokens.fonts.body}
                {p.plan ? ` · ${p.plan.archetype.replace(/-/g, ' ')} composition` : ''}
                {p.boards > 1 ? ` · ${p.boards} artboards` : ''}
              </p>
              {p.plan?.said.length ? (
                <details className="gx-why">
                  <summary>Why it is composed this way</summary>
                  <ul>
                    {p.plan.said.slice(0, 5).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </details>
              ) : null}
              <button type="button" className="sb-btn is-primary is-sm" onClick={() => onChoose(d)}>
                Make it in this direction
              </button>
            </li>
          );
        })}
      </ol>
      <div className="gx-go">
        <button type="button" className="sb-btn" onClick={onMore}>
          Show three others
        </button>
        <button type="button" className="sb-link is-meta" onClick={onBack}>
          Back to the brief
        </button>
      </div>
    </div>
  );
}
