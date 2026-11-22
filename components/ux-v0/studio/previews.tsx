'use client';
// components/ux-v0/studio/previews.tsx — what a choice looks like, drawn by the engines themselves.
//
// A style card is the person's own words composed in that style by the graphics engine; a composition card is the same
// words organised by the generative engine under that one constraint; a logo card is a concept the logo engine
// constructs for the name in that form; a website card is a working page the website engine makes from the
// conversation in that system. They are inspiration to choose from, not templates: the choice reaches the engine as a
// parameter and the engine composes the real work afresh. Each is made only when its card comes near the screen, one
// at a time in the browser's idle moments, and kept for the visit, so the conversation never waits on a preview.
// Pages are shown in sealed frames with no scripts; drawings are the renderer's own escaped SVG.

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { composeGraphic, type GraphicBrief, type GraphicDirection, type GraphicKind } from '@/lib/ux-v0/graphics/compose';
import { renderArtboard } from '@/lib/ux-v0/graphics/render';
import { styledDirection } from '@/lib/ux-v0/graphics/styles/apply';
import { languageDirection } from '@/lib/ux-v0/graphics/generative/language';
import { readLogoBrief } from '@/lib/ux-v0/graphics/logo/brief';
import { explore } from '@/lib/ux-v0/graphics/logo/compose';
import { logoDoc } from '@/lib/ux-v0/graphics/logo/build';
import type { LogoCategory } from '@/lib/ux-v0/graphics/logo/constants';
import { formatOf } from '@/lib/ux-v0/graphics/formats';
import type { Org } from '@/lib/ux-v0/graphics/generative/principles';
import type { GraphicDoc } from '@/lib/ux-v0/graphics/doc';
import { renderDesign } from '@/lib/ux-v0/render';
import { buildSandboxDoc } from '@/lib/ux-v0/sandbox';
import { currentSpec } from '@/lib/ux-v0/types';
import type { MasterDesignSystem } from '@/lib/ux-v0/boards/system';
import type { StudioState } from '@/lib/ux-v0/studio/schema';
import { answerOf, logoWordsOf, personalityOf, prefsOf, tokensFromPalette, treatmentEffects, wordsOf } from '@/lib/ux-v0/studio/apply';
import { getArtifact } from '@/lib/ux-v0/store';
import { previewWords } from '@/lib/ux-v0/studio/options';
import { GRAPHIC_FORMS } from '@/lib/ux-v0/studio/catalog';
import { startWebsite } from '@/lib/ux-v0/studio/start';
import type { Preview } from '@/lib/ux-v0/studio/discovery';
import { facesUsed, loadFaces } from '../graphics/faces';
import { ModeGlyph } from './glyphs';

// ── the queue: one preview at a time, in idle moments, kept for the visit ──

const made = new Map<string, string>();
const waiting = new Map<string, Set<(v: string) => void>>();
const queue: { key: string; make: () => string }[] = [];
let working = false;
const MAX_KEPT = 160;

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
const whenIdle = (cb: () => void) => {
  const w = window as IdleWindow;
  if (typeof w.requestIdleCallback === 'function') w.requestIdleCallback(cb, { timeout: 500 });
  else window.setTimeout(cb, 24);
};

function pump() {
  if (working || typeof window === 'undefined') return;
  const job = queue.shift();
  if (!job) return;
  working = true;
  whenIdle(() => {
    let out = '';
    try {
      out = job.make();
    } catch {
      out = '';
    }
    made.set(job.key, out);
    if (made.size > MAX_KEPT) made.delete(made.keys().next().value as string);
    for (const cb of waiting.get(job.key) ?? []) cb(out);
    waiting.delete(job.key);
    working = false;
    pump();
  });
}

/** True once the element has come near the screen (and stays true). */
function useNear<T extends HTMLElement>(): [React.RefObject<T>, boolean] {
  const ref = useRef<T>(null);
  const [near, setNear] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || near) return;
    if (typeof IntersectionObserver === 'undefined') return setNear(true);
    const io = new IntersectionObserver((es) => es.some((e) => e.isIntersecting) && (setNear(true), io.disconnect()), { rootMargin: '400px 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, [near]);
  return [ref, near];
}

/** A preview made once for its key, when wanted: null while it is being made, '' when it could not be. */
function usePreview(key: string, make: () => string, wanted: boolean): string | null {
  const [v, setV] = useState<string | null>(() => made.get(key) ?? null);
  const latest = useRef(make);
  latest.current = make;
  useEffect(() => {
    const have = made.get(key);
    if (have !== undefined) return setV(have);
    setV(null);
    if (!wanted) return;
    let live = true;
    const cb = (out: string) => {
      if (live) setV(out);
    };
    let set = waiting.get(key);
    if (!set) {
      set = new Set();
      waiting.set(key, set);
      queue.push({ key, make: () => latest.current() });
      pump();
    }
    set.add(cb);
    return () => {
      live = false;
      set?.delete(cb);
    };
  }, [key, wanted]);
  return v;
}

const hash = (s: string) => [...s].reduce((h, c) => (h * 33 + c.charCodeAt(0)) >>> 0, 5381).toString(36);
const fit = (svg: string) => svg.replace(/^<svg([^>]*?) width="[^"]+" height="[^"]+"/, '<svg$1 width="100%" height="100%"');

// ── the words a preview is composed with ──

interface Sample {
  brief: GraphicBrief;
  ratio: number;
  salt: string;
}

/** The person's words as a small brief: the form they chose (or a portrait post), their headline, their temperament. */
function sampleOf(st: StudioState): Sample {
  const w = previewWords(st);
  const details = wordsOf(st, st.mode === 'board' ? 'b.words' : 'g.words').details.slice(0, 3);
  const form = st.mode === 'graphic' ? GRAPHIC_FORMS.find((f) => f.id === answerOf(st, 'g.kind')?.values[0]) : undefined;
  const fmt = formatOf(form?.format) ?? formatOf('instagram-portrait')!;
  const kind: GraphicKind = form?.kind && form.kind !== 'carousel' && form.kind !== 'infographic' ? form.kind : 'poster';
  const brief: GraphicBrief = {
    purpose: st.prompt.slice(0, 300) || w.headline,
    kind,
    formats: [fmt.id],
    content: { headline: w.headline, ...(w.subhead ? { subhead: w.subhead } : {}), ...(details.length ? { meta: details } : {}) },
    mood: personalityOf(st).slice(0, 4),
    images: [],
  };
  return { brief, ratio: Math.max(0.56, Math.min(2.2, fmt.width / fmt.height)), salt: `${st.createdAt}|${w.headline}|${w.subhead}|${brief.mood.join(',')}|${fmt.id}` };
}

/** A preview is inspiration, not a proof: the engine's bracketed placeholders ("[Date]") are left out of it. */
type Kids = { children?: Kids[]; type?: string; text?: string };
const unplaced = (xs: Kids[]): Kids[] => xs.filter((n) => !(n.type === 'text' && /^(\s*\[[^\]]+\]\s*)+$/.test(n.text ?? ''))).map((n) => (n.children ? { ...n, children: unplaced(n.children) } : n));

function drawn(raw: GraphicDoc, prefix: string): string {
  const doc = { ...raw, artboards: raw.artboards.map((b) => ({ ...b, children: unplaced(b.children as unknown as Kids[]) as unknown as typeof b.children })) };
  void loadFaces(facesUsed(doc));
  return fit(renderArtboard(doc, doc.artboards[0], { idPrefix: prefix, href: (_id, src) => (src.startsWith('upload:') ? '' : src) }));
}

/** The direction a composition preview is drawn in: the style chosen (else the words' own language), the palette and
 * faces chosen, so every composition card is the person's design organised differently. */
function chosenDirection(st: StudioState, salt: string): GraphicDirection {
  const prefs = prefsOf(st);
  const base = languageDirection(st.prompt || previewWords(st).headline, prefs.personality, `${salt}|base`);
  let dir = prefs.styles[0] ? styledDirection(base, { primary: prefs.styles[0], ...(prefs.styles[1] ? { secondary: prefs.styles[1] } : {}), strength: 55 }, { seed: salt }) : base;
  if (prefs.palette) dir = { ...dir, tokens: { ...dir.tokens, colors: { ...dir.tokens.colors, ...tokensFromPalette(prefs.palette, dir.tokens.colors) } } };
  if (prefs.faces) dir = { ...dir, tokens: { ...dir.tokens, fonts: { display: prefs.faces.display, body: prefs.faces.body } } };
  return dir;
}

// ── the frames ──

function Frame({ ratio, html, label, children }: { ratio: number; html: string | null; label?: string; children?: ReactNode }) {
  return (
    <span className={`sd-shot${html === null ? ' is-making' : ''}`} style={{ aspectRatio: String(ratio) }} aria-hidden="true">
      {html ? <span className="sd-shot-svg" dangerouslySetInnerHTML={{ __html: html }} /> : html === '' ? <span className="sd-shot-none">{label ?? 'No preview'}</span> : <span className="sd-shot-wait" />}
      {children}
    </span>
  );
}

/** The person's design organised under one composition constraint (the generative engine's own organisation). */
export function OrgShot({ st, org }: { st: StudioState; org: Org }) {
  const [ref, near] = useNear<HTMLSpanElement>();
  const s = sampleOf(st);
  const prefs = prefsOf(st);
  const key = `org|${org}|${hash(`${s.salt}|${prefs.styles.join(',')}|${JSON.stringify(prefs.palette)}|${prefs.faces?.display ?? ''}`)}`;
  const html = usePreview(
    key,
    () => {
      const dir = chosenDirection(st, s.salt);
      const constrained: GraphicDirection = { ...dir, generative: { ...(dir.generative ?? {}), seed: `${s.salt}|${org}`, constraints: { ...(dir.generative?.constraints ?? {}), org } } };
      const { doc } = composeGraphic(s.brief, constrained, { seed: 5 });
      return drawn(doc, `sd${hash(key)}-`);
    },
    near,
  );
  return (
    <span ref={ref} className="sd-shot-wrap">
      <Frame ratio={s.ratio} html={html} />
    </span>
  );
}

/** A concept the logo engine constructs for the name, in one form. */
export function LogoShot({ st, category }: { st: StudioState; category: string }) {
  const [ref, near] = useNear<HTMLSpanElement>();
  const { name, words } = logoWordsOf(st);
  const key = `logo|${category}|${hash(`${name}|${words}|${st.createdAt}`)}`;
  const html = usePreview(
    key,
    () => {
      if (!name) return '';
      const cat = category as LogoCategory;
      const b = readLogoBrief(words || name, { name, wanted: cat });
      // a one-word name has one initial: its monogram is a lettermark
      const tries: LogoCategory[] = cat === 'monogram' ? ['monogram', 'lettermark'] : [cat];
      const c = tries.map((t) => explore({ ...b, wanted: t }, { only: [t], count: 1, seed: `${st.createdAt}|${category}` })[0]).find(Boolean);
      if (!c) return '';
      const doc = logoDoc(c, { width: 960, height: 600 });
      return drawn(doc, `sd${hash(key)}-`);
    },
    near,
  );
  return (
    <span ref={ref} className="sd-shot-wrap">
      <Frame ratio={1.6} html={html} label={name ? 'No concept in this form' : 'The name comes first'} />
    </span>
  );
}

/** A working page made from the conversation in one proposed system, in a sealed frame. */
export function WebsiteShot({ st, system, nonce }: { st: StudioState; system: MasterDesignSystem | undefined; nonce: string }) {
  const [ref, near] = useNear<HTMLSpanElement>();
  const box = useRef<HTMLSpanElement>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => setW(e.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const key = `site|${hash(`${st.createdAt}|${system?.direction.name ?? ''}|${system?.tokens.colors.accent ?? ''}|${JSON.stringify(st.answers['w.words']?.fields ?? {})}|${(st.answers['w.functions']?.values ?? []).join(',')}|${(st.answers['w.purpose']?.values ?? []).join(',')}`)}`;
  const html = usePreview(
    key,
    () => {
      if (!system) return '';
      const r = startWebsite(st, system, { now: st.createdAt });
      if (!r.ok) return '';
      const spec = currentSpec(r.project);
      if (!spec) return '';
      const page = renderDesign(spec, []).html;
      return buildSandboxDoc(page, { parse: (h) => new DOMParser().parseFromString(h, 'text/html'), runScripts: false, nonce, inspector: '' }).doc;
    },
    near,
  );
  const scale = w / 1280;
  return (
    <span ref={ref} className="sd-shot-wrap">
      <span ref={box} className={`sd-shot is-page${html === null ? ' is-making' : ''}`} style={{ aspectRatio: '16 / 11' }} aria-hidden="true">
        {html && w > 0 ? <iframe className="sd-shot-frame" title="" sandbox="" srcDoc={html} tabIndex={-1} style={{ width: 1280, height: Math.ceil((w / (16 / 11)) / scale), transform: `scale(${scale})` }} /> : html === '' ? <span className="sd-shot-none">No preview</span> : <span className="sd-shot-wait" />}
      </span>
    </span>
  );
}

/** A picture kept in this browser, by object address (made once per visit). */
const pictureUrls = new Map<string, Promise<string | null>>();
const pictureUrl = (upload: string) => {
  let p = pictureUrls.get(upload);
  if (!p) {
    p = getArtifact(upload)
      .then((rec) => (rec ? URL.createObjectURL(rec.data) : null))
      .catch(() => null);
    pictureUrls.set(upload, p);
  }
  return p;
};

/** The person's own picture under one treatment, drawn by the graphics renderer with the engine's own effects. */
export function TreatmentShot({ st, treatment }: { st: StudioState; treatment: string }) {
  const [ref, near] = useNear<HTMLSpanElement>();
  const pic = st.attachments.find((a) => a.kind === 'image' && !!a.upload);
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!pic?.upload || !near) return;
    let live = true;
    void pictureUrl(pic.upload).then((u) => live && setUrl(u));
    return () => {
      live = false;
    };
  }, [pic?.upload, near]);
  const palette = prefsOf(st).palette;
  const w = pic?.width || 1200;
  const h = pic?.height || 900;
  const ratio = Math.max(0.6, Math.min(1.8, w / h));
  const key = `treat|${treatment}|${pic?.upload ?? ''}|${palette ? `${palette.ground}${palette.ink}${palette.accent}` : ''}`;
  const html = usePreview(
    key,
    () => {
      if (!pic?.upload || !url) return '';
      const W = 720;
      const H = Math.round(W / ratio);
      const doc: GraphicDoc = {
        schema: 1,
        id: 'doc_treat',
        name: 'treatment',
        tokens: { colors: { background: '#ffffff', surface: '#ffffff', text: '#20201b', muted: '#5d5a52', accent: '#5e7633', accentText: '#ffffff', line: '#ded8c6' }, fonts: { display: 'Inter', body: 'Inter' } },
        artboards: [{ id: 'ab_treat', name: 'treatment', width: W, height: H, unit: 'px', dpi: 72, format: 'custom', background: '#ffffff', bleed: 0, safe: 0, children: [{ id: 'n_pic', type: 'image', role: 'image', asset: 'as_pic', fit: 'cover', x: 0, y: 0, w: W, h: H, rotation: 0, opacity: 1, effects: treatmentEffects(treatment, palette) }] }],
        assets: [{ id: 'as_pic', kind: 'image', src: `upload:${pic.upload}`, width: w, height: h, name: pic.name, credit: 'Your own', source: 'upload' }],
        revision: 0,
        updatedAt: 0,
      };
      return fit(renderArtboard(doc, doc.artboards[0], { idPrefix: `sd${hash(key)}-`, href: () => url }));
    },
    near && !!url,
  );
  return (
    <span ref={ref} className="sd-shot-wrap">
      <Frame ratio={ratio} html={pic ? html : ''} label="Add a picture to see it treated" />
    </span>
  );
}

// ── sketches: proportion and structure, drawn plainly ──

/** A format's proportions, with where the words would sit. */
export function FormatSketch({ format }: { format: string }) {
  const f = formatOf(format);
  const r = f ? f.width / f.height : 1;
  const W = r >= 1 ? 88 : 88 * r;
  const H = r >= 1 ? 88 / r : 88;
  const x = (100 - W) / 2;
  const y = (100 - H) / 2;
  const pad = Math.min(W, H) * 0.12;
  return (
    <span className="sd-sketch" aria-hidden="true">
      <svg viewBox="0 0 100 100" width="100%" height="100%">
        <rect x={x} y={y} width={W} height={H} rx="1.6" className="sd-sk-page" />
        <rect x={x + pad} y={y + pad} width={(W - pad * 2) * 0.78} height={Math.max(2.4, H * 0.1)} rx="0.8" className="sd-sk-ink" />
        <rect x={x + pad} y={y + pad + Math.max(2.4, H * 0.1) + 2.2} width={(W - pad * 2) * 0.5} height={Math.max(1.4, H * 0.045)} rx="0.6" className="sd-sk-soft" />
        <circle cx={x + W - pad - Math.min(W, H) * 0.12} cy={y + H - pad - Math.min(W, H) * 0.12} r={Math.min(W, H) * 0.12} className="sd-sk-accent" />
      </svg>
    </span>
  );
}

const SECTION_H: Record<string, number> = { hero: 30, features: 16, gallery: 22, list: 18, booking: 22, form: 14, text: 12, feed: 20 };

/** What a kind of website holds, in the order it holds it. */
export function PurposeSketch({ sections }: { sections: readonly string[] }) {
  let y = 9;
  const parts: ReactNode[] = [];
  for (const [i, s] of sections.entries()) {
    const h = SECTION_H[s] ?? 12;
    if (y + h > 98) break;
    const k = `${s}-${i}`;
    if (s === 'hero') parts.push(<rect key={k} x="8" y={y + 3} width="54" height="6" rx="1" className="sd-sk-ink" />, <rect key={`${k}b`} x="8" y={y + 12} width="34" height="3" rx="1" className="sd-sk-soft" />, <rect key={`${k}c`} x="8" y={y + 19} width="18" height="5" rx="2.5" className="sd-sk-accent" />, <rect key={`${k}d`} x="68" y={y + 2} width="24" height={h - 6} rx="1.4" className="sd-sk-block" />);
    else if (s === 'features') [0, 1, 2].forEach((c) => parts.push(<rect key={`${k}${c}`} x={8 + c * 29} y={y + 3} width="26" height={h - 6} rx="1.2" className="sd-sk-block" />));
    else if (s === 'gallery') [0, 1, 2, 3].forEach((c) => parts.push(<rect key={`${k}${c}`} x={8 + (c % 2) * 43} y={y + 2 + Math.floor(c / 2) * 10} width="41" height="8" rx="1" className="sd-sk-block" />));
    else if (s === 'list' || s === 'feed') [0, 1, 2].forEach((c) => parts.push(<rect key={`${k}${c}`} x="8" y={y + 3 + c * 5} width={c === 2 ? 60 : 84} height="3" rx="1" className="sd-sk-soft" />));
    else if (s === 'booking') {
      [0, 1, 2, 3, 4].forEach((c) => parts.push(<rect key={`${k}${c}`} x={8 + c * 12} y={y + 3} width="10" height="7" rx="1" className={c === 1 ? 'sd-sk-accent' : 'sd-sk-block'} />));
      [0, 1, 2].forEach((c) => parts.push(<rect key={`${k}t${c}`} x={8 + c * 16} y={y + 13} width="14" height="4" rx="2" className="sd-sk-soft" />));
    } else if (s === 'form') parts.push(<rect key={k} x="8" y={y + 3} width="52" height="5" rx="1" className="sd-sk-field" />, <rect key={`${k}b`} x="62" y={y + 3} width="18" height="5" rx="2.5" className="sd-sk-accent" />);
    else parts.push(<rect key={k} x="8" y={y + 3} width="70" height="2.6" rx="1" className="sd-sk-soft" />, <rect key={`${k}b`} x="8" y={y + 7.5} width="58" height="2.6" rx="1" className="sd-sk-soft" />);
    y += h;
  }
  return (
    <span className="sd-sketch is-page" aria-hidden="true">
      <svg viewBox="0 0 100 100" width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        <rect x="2" y="2" width="96" height="96" rx="2" className="sd-sk-page" />
        <rect x="8" y="5" width="12" height="2" rx="1" className="sd-sk-ink" />
        <rect x="70" y="5" width="22" height="2" rx="1" className="sd-sk-soft" />
        {parts}
      </svg>
    </span>
  );
}

/** Where a design system comes from, drawn as a plain mark (never another company's logo). */
export function SourceGlyph({ source }: { source: string }) {
  const body: Record<string, ReactNode> = {
    json: <path d="M9 5c-2 0-2 2-2 4s-1 3-2.5 3C6 12 7 13 7 15s0 4 2 4M15 5c2 0 2 2 2 4s1 3 2.5 3c-1.5 0-2.5 1-2.5 3s0 4-2 4" />,
    css: <path d="M10 4 8 20M16 4l-2 16M5 9h15M4 15h15" />,
    pdf: (
      <>
        <path d="M7 3.5h6.5L18 8v12.5H7z" />
        <path d="M13.5 3.5V8H18M9.5 12h5M9.5 15h5M9.5 18h3" />
      </>
    ),
    website: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M3 9h18M6 7h.01M8.5 7h.01" />
      </>
    ),
    figma: (
      <>
        <rect x="5" y="5" width="14" height="14" rx="1.5" />
        <path d="M5 9.5h14M9.5 9.5V19" />
      </>
    ),
    assets: (
      <>
        <circle cx="8" cy="8" r="3.2" />
        <path d="M14 4.8 19.5 13h-11z" />
        <rect x="11" y="14" width="7" height="6" rx="1" />
      </>
    ),
    project: (
      <>
        <rect x="7" y="4" width="12" height="12" rx="1.5" />
        <path d="M5 8v10a2 2 0 0 0 2 2h10" />
      </>
    ),
  };
  return (
    <span className="sd-sketch is-glyph" aria-hidden="true">
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
        {body[source] ?? body.project}
      </svg>
    </span>
  );
}

/** A card's picture, whatever the question's preview kind. */
export function PreviewOf({ preview, st, nonce, systems }: { preview: Preview; st: StudioState; nonce: string; systems?: readonly MasterDesignSystem[] }) {
  switch (preview.kind) {
    case 'format':
      return <FormatSketch format={preview.format} />;
    case 'org':
      return <OrgShot st={st} org={preview.org} />;
    case 'logo':
      return <LogoShot st={st} category={preview.category} />;
    case 'website':
      return <WebsiteShot st={st} system={systems?.[preview.index]} nonce={nonce} />;
    case 'purpose':
      return <PurposeSketch sections={preview.sections} />;
    case 'mode':
      return (
        <span className="sd-sketch is-glyph" aria-hidden="true">
          <ModeGlyph mode={preview.mode} size={30} />
        </span>
      );
    case 'source':
      return <SourceGlyph source={preview.source} />;
    case 'treatment':
      return <TreatmentShot st={st} treatment={preview.treatment} />;
  }
}

/** Faces for type cards: loaded once, so each pairing is seen in its own letters. */
export function useFacesFor(pairs: readonly { display: string; body: string }[]) {
  const key = pairs.map((p) => `${p.display}|${p.body}`).join(';');
  useEffect(() => {
    if (!pairs.length) return;
    void loadFaces(pairs.flatMap((p) => [{ face: p.display, weight: 400, italic: false }, { face: p.display, weight: 700, italic: false }, { face: p.body, weight: 400, italic: false }]));
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
