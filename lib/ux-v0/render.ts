// lib/ux-v0/render.ts — a DesignSpec, drawn as a real page.
//
// Deterministic: the same spec always gives the same HTML. Semantic: headings
// in order, real buttons and links, every form field with a visible label.
// Responsive: one stylesheet, mobile first, two breakpoints. Inspectable:
// every element carries data-ux-section (its section's id) and data-ux-path
// (the field it shows), so a selection in the canvas knows exactly what in the
// spec it touches, and iteration can change only that.
//
// Images come only from the moodboard (by reference id); each one used is
// credited on the page itself, as its licence asks. Unknown facts the model
// left as [bracketed placeholders] are drawn as visible placeholders, never
// filled in.

import { fontStack, fontStylesheet } from './fonts';
import { contrastRatio } from '../ux/audit';
import { NEEDS_IMAGE, ensureContrast, kindDef, type DesignSpec, type DesignTokens, type Section } from './spec';
import type { MoodboardRef } from './types';

export interface Credit {
  id: string;
  text: string;
  url: string;
  license: string;
}

export interface Rendered {
  html: string;
  css: string;
  credits: Credit[];
}

// ── text ─────────────────────────────────────────────────────────────

const esc = (v: unknown): string =>
  String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Escaped text, with [placeholders] marked so nobody mistakes them for content. */
const t = (v: unknown): string => esc(v).replace(/\[([^\]\n]{2,40})\]/g, '<span class="ph" title="Placeholder — fill this in">[$1]</span>');

const attr = (section: string, path: string) => `data-ux-section="${esc(section)}" data-ux-path="${esc(path)}"`;

// ── icons: a small stroke set, drawn inline ───────────────────────────

const ICON_PATHS: Record<string, string> = {
  spark: 'M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6',
  leaf: 'M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7',
  cup: 'M5 9h11v5a5 5 0 01-5 5H10a5 5 0 01-5-5V9zM16 10h2a2 2 0 010 4h-2M8 3c0 1.5 1 1.5 1 3M11 3c0 1.5 1 1.5 1 3',
  clock: 'M12 3a9 9 0 110 18 9 9 0 010-18zM12 7v5l3 2',
  map: 'M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2zM9 4v14M15 6v14',
  shield: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z',
  heart: 'M12 20s-7-4.4-7-10a4 4 0 017-2.6A4 4 0 0119 10c0 5.6-7 10-7 10z',
  users: 'M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2.5 20a6.5 6.5 0 0113 0M16 4.5a3.5 3.5 0 010 6.5M18 14a5.5 5.5 0 013.5 6',
  chart: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  book: 'M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19a2 2 0 012-2h13',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  star: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  check: 'M4 12.5l5 5L20 6.5',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7l1-8z',
  globe: 'M12 3a9 9 0 110 18 9 9 0 010-18zM3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18',
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2z',
  mail: 'M3 6h18v12H3zM3 7l9 6 9-6',
  camera: 'M4 8h4l2-3h4l2 3h4v11H4zM12 17a3.5 3.5 0 100-7 3.5 3.5 0 000 7z',
  music: 'M9 18V5l11-2v13M9 18a3 3 0 11-6 0 3 3 0 016 0zM20 16a3 3 0 11-6 0 3 3 0 016 0z',
  code: 'M8 7l-5 5 5 5M16 7l5 5-5 5M14 4l-4 16',
  layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17l9 5 9-5',
  compass: 'M12 3a9 9 0 110 18 9 9 0 010-18zM15.5 8.5l-2 5-5 2 2-5 5-2z',
  home: 'M3 11l9-7 9 7v9H3zM9 20v-6h6v6',
  search: 'M11 4a7 7 0 110 14 7 7 0 010-14zM21 21l-5-5',
};

const icon = (name: string) =>
  ICON_PATHS[name] ? `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${ICON_PATHS[name]}"/></svg>` : '';

// ── the accent as ink ────────────────────────────────────────────────
// The accent fills buttons and bands at any lightness; where it colours text (an eyebrow, a numeral,
// a rising figure) it is moved toward black or white, keeping its hue, until it reads at 4.5:1 on
// both the background and the surface.
export function accentInk(c: DesignTokens['colors']): string {
  const onBg = ensureContrast(c.accent, c.background, 4.5);
  return contrastRatio(onBg, c.surface) >= 4.5 ? onBg : ensureContrast(onBg, c.surface, 4.5);
}

// ── images ───────────────────────────────────────────────────────────

class Images {
  used = new Map<string, MoodboardRef>();
  constructor(private refs: Map<string, MoodboardRef>) {}
  img(section: Section, i: number, cls: string, eager = false): string {
    const id = section.images[i];
    const ref = id ? this.refs.get(id) : undefined;
    if (!ref) return `<div class="${cls} img-missing" ${attr(section.id, `images.${i}`)} role="img" aria-label="Image to come"></div>`;
    this.used.set(ref.id, ref);
    const alt = ref.title && !/^(untitled|image|photo)$/i.test(ref.title) ? ref.title : '';
    return `<img class="${cls}" src="${esc(ref.url)}" alt="${esc(alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer" ${attr(section.id, `images.${i}`)}>`;
  }
  has(section: Section, i: number) {
    const id = section.images[i];
    return !!(id && this.refs.get(id));
  }
}

// ── sections ─────────────────────────────────────────────────────────

type R = (s: Section, c: Record<string, any>, im: Images, first: boolean) => string;

const eyebrow = (s: Section, v: unknown) => (v ? `<p class="eyebrow" ${attr(s.id, 'eyebrow')}>${t(v)}</p>` : '');
const head = (s: Section, c: Record<string, any>, level = 2) =>
  `${eyebrow(s, c.eyebrow)}${c.title ? `<h${level} class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h${level}>` : ''}${c.intro ? `<p class="lede" ${attr(s.id, 'intro')}>${t(c.intro)}</p>` : ''}`;
const btn = (s: Section, path: string, label: unknown, kind: 'primary' | 'secondary') =>
  label ? `<a class="btn btn-${kind}" href="#" ${attr(s.id, path)}>${t(label)}</a>` : '';

const SECTIONS: Record<string, R> = {
  nav: (s, c) => {
    const links = (c.links as string[]).map((l, i) => `<li><a href="#" ${attr(s.id, `links.${i}`)}>${t(l)}</a></li>`).join('');
    return `<header class="wrap nav-in"><a class="brand" href="#" ${attr(s.id, 'brand')}>${t(c.brand)}</a>${links ? `<nav aria-label="Main"><ul class="nav-links">${links}</ul></nav>` : ''}${c.cta ? btn(s, 'cta', c.cta, 'primary') : ''}</header>`;
  },
  hero: (s, c, im, first) => {
    const H = first ? 1 : 1;
    const text = `<div class="hero-text">${eyebrow(s, c.eyebrow)}<h${H} class="h-hero" ${attr(s.id, 'title')}>${t(c.title)}</h${H}>${c.subtitle ? `<p class="hero-sub" ${attr(s.id, 'subtitle')}>${t(c.subtitle)}</p>` : ''}${c.primary || c.secondary ? `<div class="actions">${btn(s, 'primary', c.primary, 'primary')}${btn(s, 'secondary', c.secondary, 'secondary')}</div>` : ''}${c.note ? `<p class="small muted" ${attr(s.id, 'note')}>${t(c.note)}</p>` : ''}</div>`;
    if (s.variant === 'full-bleed' && im.has(s, 0)) return `<div class="hero-bleed">${im.img(s, 0, 'bleed-img', true)}<div class="bleed-shade"></div><div class="wrap">${text}</div></div>`;
    if (s.variant === 'split' && im.has(s, 0)) return `<div class="wrap hero-split">${text}<div class="hero-media">${im.img(s, 0, 'media-img', true)}</div></div>`;
    if (s.variant === 'editorial') return `<div class="wrap hero-editorial">${text}${im.has(s, 0) ? `<div class="hero-wide">${im.img(s, 0, 'media-img', true)}</div>` : ''}</div>`;
    return `<div class="wrap hero-centered">${text}${im.has(s, 0) ? `<div class="hero-wide">${im.img(s, 0, 'media-img', true)}</div>` : ''}</div>`;
  },
  features: (s, c) => {
    const items = (c.items as any[])
      .map(
        (it, i) =>
          `<li class="feature">${s.variant === 'numbered' ? `<span class="num" aria-hidden="true">${String(i + 1).padStart(2, '0')}</span>` : it.icon ? icon(it.icon) : ''}<h3 class="h-item" ${attr(s.id, `items.${i}.title`)}>${t(it.title)}</h3>${it.text ? `<p ${attr(s.id, `items.${i}.text`)}>${t(it.text)}</p>` : ''}</li>`
      )
      .join('');
    return `<div class="wrap"><div class="section-head">${head(s, c)}</div><ul class="features f-${s.variant} n-${Math.min(4, (c.items as any[]).length)}">${items}</ul></div>`;
  },
  split: (s, c, im) => {
    const bullets = (c.bullets as string[]).length ? `<ul class="ticks">${(c.bullets as string[]).map((b, i) => `<li ${attr(s.id, `bullets.${i}`)}>${icon('check')}<span>${t(b)}</span></li>`).join('')}</ul>` : '';
    const text = `<div class="split-text">${eyebrow(s, c.eyebrow)}<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>${c.text ? `<p class="body-lg" ${attr(s.id, 'text')}>${t(c.text)}</p>` : ''}${bullets}${c.cta ? `<div class="actions">${btn(s, 'cta', c.cta, 'secondary')}</div>` : ''}</div>`;
    const media = im.has(s, 0) ? `<div class="split-media">${im.img(s, 0, 'media-img')}</div>` : '';
    return `<div class="wrap split ${s.variant === 'image-left' ? 'is-left' : ''} ${media ? '' : 'no-media'}">${s.variant === 'image-left' ? media + text : text + media}</div>`;
  },
  gallery: (s, c, im) => {
    const imgs = s.images.map((_, i) => `<figure class="g-item">${im.img(s, i, 'g-img')}</figure>`).join('');
    return `<div class="wrap">${c.title || c.eyebrow ? `<div class="section-head">${head(s, c)}</div>` : ''}<div class="gallery g-${s.variant} n-${Math.min(8, s.images.length)}">${imgs}</div>${c.caption ? `<p class="small muted caption" ${attr(s.id, 'caption')}>${t(c.caption)}</p>` : ''}</div>`;
  },
  quote: (s, c, im) =>
    `<div class="wrap quote q-${s.variant}">${s.variant === 'with-portrait' && im.has(s, 0) ? `<div class="q-portrait">${im.img(s, 0, 'portrait')}</div>` : ''}<figure><blockquote ${attr(s.id, 'quote')}><p>${t(c.quote)}</p></blockquote><figcaption><span class="q-author" ${attr(s.id, 'author')}>${t(c.author)}</span>${c.role ? `<span class="q-role muted" ${attr(s.id, 'role')}>${t(c.role)}</span>` : ''}</figcaption></figure></div>`,
  stats: (s, c) =>
    `<div class="wrap">${c.title ? `<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}<dl class="stats st-${s.variant}">${(c.items as any[])
      .map((it, i) => `<div class="stat"><dt ${attr(s.id, `items.${i}.label`)}>${t(it.label)}</dt><dd ${attr(s.id, `items.${i}.value`)}>${t(it.value)}</dd></div>`)
      .join('')}</dl></div>`,
  logos: (s, c) =>
    `<div class="wrap logos">${c.title ? `<p class="eyebrow" ${attr(s.id, 'title')}>${t(c.title)}</p>` : ''}<ul class="names">${(c.names as string[]).map((n, i) => `<li ${attr(s.id, `names.${i}`)}>${t(n)}</li>`).join('')}</ul></div>`,
  pricing: (s, c) =>
    `<div class="wrap"><div class="section-head center">${head(s, c)}</div><div class="plans n-${(c.plans as any[]).length}">${(c.plans as any[])
      .map(
        (p, i) =>
          `<article class="plan${p.featured ? ' is-featured' : ''}"><h3 class="h-item" ${attr(s.id, `plans.${i}.name`)}>${t(p.name)}</h3><p class="price"><span ${attr(s.id, `plans.${i}.price`)}>${t(p.price)}</span>${p.period ? `<span class="muted small" ${attr(s.id, `plans.${i}.period`)}> ${t(p.period)}</span>` : ''}</p>${(p.features as string[]).length ? `<ul class="ticks">${(p.features as string[]).map((f, j) => `<li ${attr(s.id, `plans.${i}.features.${j}`)}>${icon('check')}<span>${t(f)}</span></li>`).join('')}</ul>` : ''}${p.cta ? btn(s, `plans.${i}.cta`, p.cta, p.featured ? 'primary' : 'secondary') : ''}</article>`
      )
      .join('')}</div></div>`,
  list: (s, c) =>
    `<div class="wrap"><div class="section-head">${head(s, c)}</div><div class="lists l-${s.variant} n-${Math.min(3, (c.groups as any[]).length)}">${(c.groups as any[])
      .map(
        (g, gi) =>
          `<div class="list-group">${g.title ? `<h3 class="h-item" ${attr(s.id, `groups.${gi}.title`)}>${t(g.title)}</h3>` : ''}<ul>${(g.items as any[])
            .map(
              (it, ii) =>
                `<li class="list-item"><div class="li-main"><span class="li-name" ${attr(s.id, `groups.${gi}.items.${ii}.name`)}>${t(it.name)}</span>${it.meta ? `<span class="li-meta muted" ${attr(s.id, `groups.${gi}.items.${ii}.meta`)}>${t(it.meta)}</span>` : ''}</div>${it.price ? `<span class="li-price" ${attr(s.id, `groups.${gi}.items.${ii}.price`)}>${t(it.price)}</span>` : ''}${it.text ? `<p class="li-text muted" ${attr(s.id, `groups.${gi}.items.${ii}.text`)}>${t(it.text)}</p>` : ''}</li>`
            )
            .join('')}</ul></div>`
      )
      .join('')}</div></div>`,
  faq: (s, c) =>
    `<div class="wrap faq fq-${s.variant}">${c.title ? `<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}<div class="faq-items">${(c.items as any[])
      .map((it, i) => `<details class="qa"${i === 0 ? ' open' : ''}><summary ${attr(s.id, `items.${i}.q`)}>${t(it.q)}</summary><p ${attr(s.id, `items.${i}.a`)}>${t(it.a)}</p></details>`)
      .join('')}</div></div>`,
  cta: (s, c, im) => {
    const inner = `<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>${c.text ? `<p class="body-lg" ${attr(s.id, 'text')}>${t(c.text)}</p>` : ''}<div class="actions">${btn(s, 'primary', c.primary, 'primary')}${btn(s, 'secondary', c.secondary, 'secondary')}</div>`;
    if (s.variant === 'image' && im.has(s, 0)) return `<div class="wrap cta-image"><div class="cta-media">${im.img(s, 0, 'media-img')}</div><div class="cta-text">${inner}</div></div>`;
    return `<div class="wrap"><div class="cta-box c-${s.variant}">${inner}</div></div>`;
  },
  form: (s, c) => {
    const fields = (c.fields as any[])
      .map((f, i) => {
        const id = `${s.id}-f${i}`;
        const req = f.required ? ' required' : '';
        const label = `<label for="${id}" ${attr(s.id, `fields.${i}.label`)}>${t(f.label)}${f.required ? ' <span class="req" aria-hidden="true">*</span>' : ''}</label>`;
        const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
        if (f.type === 'checkbox') return `<div class="field is-check"><input id="${id}" type="checkbox"${req}>${label}</div>`;
        if (f.type === 'textarea') return `<div class="field">${label}<textarea id="${id}" rows="4"${ph}${req}></textarea></div>`;
        if (f.type === 'select') return `<div class="field">${label}<select id="${id}"${req}>${((f.options as string[]).length ? (f.options as string[]) : ['Choose one']).map((o) => `<option>${esc(o)}</option>`).join('')}</select></div>`;
        return `<div class="field">${label}<input id="${id}" type="${esc(f.type || 'text')}"${ph}${req}></div>`;
      })
      .join('');
    const form = `<form class="form" action="#" method="post"><div class="fields">${fields}</div><button type="submit" class="btn btn-primary" ${attr(s.id, 'submit')}>${t(c.submit)}</button>${c.note ? `<p class="small muted" ${attr(s.id, 'note')}>${t(c.note)}</p>` : ''}</form>`;
    return `<div class="wrap form-wrap fm-${s.variant}"><div class="form-head"><h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>${c.intro ? `<p class="body-lg" ${attr(s.id, 'intro')}>${t(c.intro)}</p>` : ''}</div>${form}</div>`;
  },
  text: (s, c) =>
    `<div class="wrap text-block tb-${s.variant}"><div class="tb-head">${eyebrow(s, c.eyebrow)}${c.title ? `<h2 class="h-section" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}</div><div class="tb-body">${(c.paragraphs as string[]).map((p, i) => `<p ${attr(s.id, `paragraphs.${i}`)}>${t(p)}</p>`).join('')}</div></div>`,
  footer: (s, c) =>
    `<footer class="wrap foot">${`<div class="foot-brand"><p class="brand" ${attr(s.id, 'brand')}>${t(c.brand)}</p>${c.tagline ? `<p class="muted" ${attr(s.id, 'tagline')}>${t(c.tagline)}</p>` : ''}</div>`}${(c.columns as any[]).length ? `<div class="foot-cols">${(c.columns as any[])
      .map(
        (col, i) =>
          `<div>${col.title ? `<p class="foot-title" ${attr(s.id, `columns.${i}.title`)}>${t(col.title)}</p>` : ''}<ul>${(col.links as string[]).map((l, j) => `<li><a href="#" ${attr(s.id, `columns.${i}.links.${j}`)}>${t(l)}</a></li>`).join('')}</ul></div>`
      )
      .join('')}</div>` : ''}${c.legal ? `<p class="legal small muted" ${attr(s.id, 'legal')}>${t(c.legal)}</p>` : ''}<!--credits--></footer>`,
  'app-nav': (s, c) =>
    `<div class="appnav an-${s.variant}"><p class="brand" ${attr(s.id, 'brand')}>${t(c.brand)}</p><nav aria-label="App"><ul>${(c.items as string[])
      .map((it, i) => `<li><a href="#"${it === c.active || (!c.active && i === 0) ? ' aria-current="page"' : ''} ${attr(s.id, `items.${i}`)}>${icon(['home', 'chart', 'users', 'calendar', 'layers', 'book', 'compass'][i % 7])}<span>${t(it)}</span></a></li>`)
      .join('')}</ul></nav>${c.user ? `<p class="an-user muted small" ${attr(s.id, 'user')}>${t(c.user)}</p>` : ''}</div>`,
  'app-header': (s, c) =>
    `<div class="apphead"><div><h1 class="h-app" ${attr(s.id, 'title')}>${t(c.title)}</h1>${c.subtitle ? `<p class="muted" ${attr(s.id, 'subtitle')}>${t(c.subtitle)}</p>` : ''}</div><div class="apphead-acts">${c.search ? `<label class="search"><span class="vh">Search</span>${icon('search')}<input type="search" placeholder="Search"></label>` : ''}${(c.actions as string[]).map((a, i) => btn(s, `actions.${i}`, a, i === 0 ? 'primary' : 'secondary')).join('')}</div></div>`,
  'stat-cards': (s, c) =>
    `<div class="cards-row">${(c.items as any[])
      .map(
        (it, i) =>
          `<div class="card stat-card"><p class="muted small" ${attr(s.id, `items.${i}.label`)}>${t(it.label)}</p><p class="stat-value" ${attr(s.id, `items.${i}.value`)}>${t(it.value)}</p>${it.delta ? `<p class="delta d-${it.trend || 'flat'}" ${attr(s.id, `items.${i}.delta`)}>${it.trend === 'down' ? '↓' : it.trend === 'up' ? '↑' : '→'} ${t(it.delta)}</p>` : ''}</div>`
      )
      .join('')}</div>`,
  chart: (s, c) => `<div class="card chart-card"><h2 class="h-card" ${attr(s.id, 'title')}>${t(c.title)}</h2>${chartSvg(s, c)}${c.note ? `<p class="small muted" ${attr(s.id, 'note')}>${t(c.note)}</p>` : ''}</div>`,
  table: (s, c) =>
    `<div class="card table-card">${c.title ? `<h2 class="h-card" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}<div class="table-scroll"><table><thead><tr>${(c.columns as string[]).map((h, i) => `<th scope="col" ${attr(s.id, `columns.${i}`)}>${t(h)}</th>`).join('')}${(c.rows as any[]).some((r) => r.status) ? '<th scope="col">Status</th>' : ''}</tr></thead><tbody>${(c.rows as any[])
      .map(
        (r, i) =>
          `<tr>${(c.columns as string[]).map((_, j) => `<td ${attr(s.id, `rows.${i}.cells.${j}`)}>${t((r.cells as string[])[j] ?? '')}</td>`).join('')}${(c.rows as any[]).some((x) => x.status) ? `<td ${attr(s.id, `rows.${i}.status`)}>${r.status ? `<span class="status"><span class="dot" aria-hidden="true"></span>${t(r.status)}</span>` : ''}</td>` : ''}</tr>`
      )
      .join('')}</tbody></table></div></div>`,
  feed: (s, c) =>
    `<div class="card feed-card">${c.title ? `<h2 class="h-card" ${attr(s.id, 'title')}>${t(c.title)}</h2>` : ''}<ol class="feed">${(c.items as any[])
      .map((it, i) => `<li><p class="feed-title" ${attr(s.id, `items.${i}.title`)}>${t(it.title)}</p>${it.meta ? `<p class="small muted" ${attr(s.id, `items.${i}.meta`)}>${t(it.meta)}</p>` : ''}${it.text ? `<p class="small" ${attr(s.id, `items.${i}.text`)}>${t(it.text)}</p>` : ''}</li>`)
      .join('')}</ol></div>`,
};

function chartSvg(s: Section, c: Record<string, any>): string {
  const labels = c.labels as string[];
  const series = (c.series as any[]).map((x) => ({ name: x.name as string, values: (x.values as number[]).slice(0, labels.length) }));
  const W = 640;
  const H = 240;
  const pad = { l: 40, r: 12, t: 12, b: 28 };
  const all = series.flatMap((x) => x.values);
  const max = Math.max(1, ...all);
  const min = Math.min(0, ...all);
  const span = max - min || 1;
  const n = Math.max(2, labels.length);
  const x = (i: number) => pad.l + ((W - pad.l - pad.r) * i) / (n - 1);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - (v - min) / span);
  const grid = [0, 0.25, 0.5, 0.75, 1]
    .map((f) => {
      const v = min + span * f;
      return `<line class="grid" x1="${pad.l}" x2="${W - pad.r}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="axis" x="${pad.l - 6}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${esc(Math.round(v))}</text>`;
    })
    .join('');
  const xl = labels.map((l, i) => `<text class="axis" x="${(s.variant === 'bar' ? pad.l + ((W - pad.l - pad.r) * (i + 0.5)) / labels.length : x(i)).toFixed(1)}" y="${H - 8}" text-anchor="middle">${esc(l)}</text>`).join('');
  let marks = '';
  if (s.variant === 'bar') {
    const groupW = (W - pad.l - pad.r) / labels.length;
    const barW = Math.max(4, (groupW * 0.64) / series.length);
    marks = series
      .map((se, k) =>
        se.values
          .map((v, i) => {
            const bx = pad.l + groupW * i + groupW * 0.18 + barW * k;
            return `<rect class="bar s${k}" x="${bx.toFixed(1)}" y="${y(Math.max(0, v)).toFixed(1)}" width="${barW.toFixed(1)}" height="${Math.abs(y(v) - y(0)).toFixed(1)}" rx="2"/>`;
          })
          .join('')
      )
      .join('');
  } else {
    marks = series
      .map((se, k) => {
        const pts = se.values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
        const area = s.variant === 'area' ? `<polygon class="area s${k}" points="${x(0).toFixed(1)},${y(min).toFixed(1)} ${pts} ${x(se.values.length - 1).toFixed(1)},${y(min).toFixed(1)}"/>` : '';
        return `${area}<polyline class="line s${k}" points="${pts}"/>`;
      })
      .join('');
  }
  const summary = series.map((se) => `${se.name}: ${se.values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`).join('; ');
  const legend = series.length > 1 ? `<ul class="legend">${series.map((se, k) => `<li><span class="key s${k}" aria-hidden="true"></span>${esc(se.name)}</li>`).join('')}</ul>` : '';
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${c.title}. ${summary}`)}" ${attr(s.id, 'series')}>${grid}${marks}${xl}</svg>${legend}`;
}

// ── the stylesheet ───────────────────────────────────────────────────

function css(tk: DesignTokens, platform: string): string {
  const c = tk.colors;
  const r = tk.radius === 'none' ? '0px' : tk.radius === 'round' ? '22px' : '10px';
  const br = tk.radius === 'none' ? '0px' : tk.radius === 'round' ? '999px' : '8px';
  const space = tk.scale === 'compact' ? 'clamp(44px, 6vw, 72px)' : tk.scale === 'spacious' ? 'clamp(72px, 11vw, 160px)' : 'clamp(56px, 8.5vw, 116px)';
  const heroSize = tk.scale === 'compact' ? 'clamp(2.3rem, 4.8vw, 3.8rem)' : tk.scale === 'spacious' ? 'clamp(2.8rem, 7.4vw, 6.4rem)' : 'clamp(2.5rem, 6vw, 5rem)';
  const h2Size = tk.scale === 'compact' ? 'clamp(1.6rem, 2.8vw, 2.3rem)' : 'clamp(1.8rem, 3.6vw, 3rem)';
  const headWeight = tk.style === 'bold' ? 700 : tk.style === 'minimal' || tk.style === 'technical' ? 500 : 400;
  const filter = tk.imageTreatment === 'muted' ? 'saturate(.7) contrast(.96)' : tk.imageTreatment === 'warm' ? 'sepia(.16) saturate(1.08)' : tk.imageTreatment === 'mono' ? 'grayscale(1) contrast(1.05)' : 'none';
  return `
:root{--bg:${c.background};--surface:${c.surface};--text:${c.text};--muted:${c.muted};--accent:${c.accent};--accent-ink:${accentInk(c)};--on-accent:${c.accentText};--line:${c.line};
--display:${fontStack(tk.fonts.display)};--body:${fontStack(tk.fonts.body)};--r:${r};--btn-r:${br};--space:${space};--hero:${heroSize};--h2:${h2Size};--hw:${headWeight};--img:${filter};--wrap:1200px}
*,*::before,*::after{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--body);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{display:block;max-width:100%}
a{color:inherit}
:focus-visible{outline:2px solid var(--accent);outline-offset:3px}
.wrap{width:min(var(--wrap),100% - 40px);margin-inline:auto}
.sx{padding-block:var(--space)}
.sx-nav{padding-block:18px}
.sx-footer{padding-block:56px 40px;border-top:1px solid var(--line)}
.ph{text-decoration:underline dotted;text-underline-offset:3px;color:var(--muted)}
.muted{color:var(--muted)}.small{font-size:.875rem;line-height:1.5}
.vh{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.eyebrow{margin:0 0 14px;font-size:.78rem;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--muted)}
.h-hero,.h-section,.h-item,.h-app,.h-card,.brand,.price,.stat dd,.stat-value,blockquote{font-family:var(--display);font-weight:var(--hw)}
.h-hero{margin:0;font-size:var(--hero);line-height:1.02;letter-spacing:-.025em;text-wrap:balance}
.h-section{margin:0 0 14px;font-size:var(--h2);line-height:1.1;letter-spacing:-.018em;text-wrap:balance}
.h-item{margin:0 0 6px;font-size:1.25rem;line-height:1.25;letter-spacing:-.005em}
.lede,.body-lg,.hero-sub{font-size:1.15rem;line-height:1.6;color:var(--muted);max-width:60ch}
.hero-sub{margin:20px 0 0;font-size:clamp(1.1rem,1.6vw,1.3rem)}
.section-head{max-width:720px;margin-bottom:clamp(28px,4vw,48px)}.section-head.center{margin-inline:auto;text-align:center}.section-head.center .lede{margin-inline:auto}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.btn{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 24px;border-radius:var(--btn-r);font:inherit;font-size:1rem;font-weight:600;text-decoration:none;cursor:pointer;transition:transform .2s,background-color .2s,color .2s;border:1.5px solid transparent}
.btn-primary{background:var(--accent);color:var(--on-accent)}
.btn-primary:hover{transform:translateY(-2px)}
.btn-secondary{border-color:currentColor;background:transparent;color:var(--text)}
.ic{width:26px;height:26px;fill:none;stroke:var(--accent);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round}
.ticks{list-style:none;margin:20px 0 0;padding:0;display:grid;gap:10px}.ticks li{display:flex;gap:10px;align-items:flex-start}.ticks .ic{width:20px;height:20px;flex:none;margin-top:3px}
/* nav */
.nav-in{display:flex;align-items:center;gap:28px}.brand{margin:0;font-size:1.35rem;text-decoration:none;letter-spacing:-.01em}
.nav-links{display:flex;gap:24px;list-style:none;margin:0 0 0 auto;padding:0}.nav-links a{text-decoration:none;font-size:.95rem;color:var(--muted)}.nav-links a:hover{color:var(--text)}
.v-centered .nav-in{justify-content:center;flex-wrap:wrap}.v-centered .nav-links{margin:0}.v-minimal .nav-links{display:none}
.nav-in .btn{min-height:44px;padding:0 18px;font-size:.92rem}.nav-in .brand{display:inline-flex;align-items:center;min-height:44px}.v-inline .nav-in .btn,.v-minimal .nav-in .btn{margin-left:auto}.v-inline .nav-links~.btn{margin-left:0}
/* hero */
.hero-text{max-width:780px}.hero-centered{text-align:center}.hero-centered .hero-text{margin-inline:auto}.hero-centered .hero-sub{margin-inline:auto}.hero-centered .actions{justify-content:center}
.hero-wide{margin-top:clamp(36px,5vw,64px)}.hero-wide .media-img{width:100%;aspect-ratio:16/8;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.hero-editorial .h-hero{font-size:calc(var(--hero) * 1.12);max-width:14ch}
.hero-split{display:grid;gap:clamp(28px,5vw,64px);align-items:center}
.hero-media .media-img{width:100%;aspect-ratio:4/5;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.sx-hero.v-full-bleed{padding:0}
.hero-bleed{position:relative;overflow:hidden;min-height:min(86vh,820px);display:flex;align-items:flex-end;color:#fff}
.bleed-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:var(--img)}
.bleed-shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.1) 0%,rgba(0,0,0,.3) 100%)}
.hero-bleed .wrap{position:relative;z-index:1;padding-block:clamp(48px,8vw,96px)}.hero-bleed .wrap::before{content:"";position:absolute;z-index:-1;inset:-140px -100vw 0;background:linear-gradient(180deg,rgba(0,0,0,0) 0,rgba(0,0,0,.58) 140px,rgba(0,0,0,.68) 100%)}/* over the image every word is white, whatever the style colours eyebrows elsewhere */.hero-bleed .hero-text :is(.hero-sub,.eyebrow,.muted){color:#fff}.hero-bleed .btn-secondary{color:#fff}
/* features */
.features{list-style:none;margin:0;padding:0;display:grid;gap:clamp(24px,3vw,40px)}
.feature p{margin:0;color:var(--muted)}.feature .ic{margin-bottom:14px}
.f-list .feature{display:grid;grid-template-columns:auto 1fr;column-gap:18px;padding-top:22px;border-top:1px solid var(--line)}.f-list .feature .ic{grid-row:span 2;margin:2px 0 0}
.f-numbered .feature{padding-top:20px;border-top:1px solid var(--line)}.num{display:block;font-family:var(--display);font-size:1.6rem;color:var(--accent-ink);margin-bottom:10px}
/* split */
.split{display:grid;gap:clamp(28px,5vw,72px);align-items:center}
.split-media .media-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.split-text .body-lg{margin:0}
/* gallery */
.gallery{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}.g-item{margin:0}
.g-img{width:100%;height:100%;aspect-ratio:1;object-fit:cover;border-radius:var(--r);filter:var(--img)}
.g-strip{grid-auto-flow:column;grid-auto-columns:minmax(220px,1fr);grid-template-columns:none;overflow-x:auto}.g-strip .g-img{aspect-ratio:3/4}
@media (max-width:759px){.gallery:not(.g-strip):is(.n-1,.n-3,.n-5,.n-7) .g-item:first-child{grid-column:1/-1}.gallery:not(.g-strip):is(.n-1,.n-3,.n-5,.n-7) .g-item:first-child .g-img{aspect-ratio:3/2}}
.caption{margin-top:14px}
/* quote */
.quote figure{margin:0;max-width:900px}.quote blockquote{margin:0}.quote blockquote p{margin:0;font-size:clamp(1.6rem,3.4vw,2.6rem);line-height:1.2;letter-spacing:-.015em;text-wrap:balance}
.quote figcaption{margin-top:22px;display:flex;flex-direction:column;gap:2px}.q-author{font-weight:600}
.q-large{text-align:center}.q-large figure{margin-inline:auto}.q-with-portrait{display:grid;gap:32px;align-items:center}
.portrait{width:100%;max-width:340px;aspect-ratio:1;object-fit:cover;border-radius:var(--r);filter:var(--img)}
/* stats */
.stats{display:grid;gap:24px;margin:28px 0 0;grid-template-columns:repeat(2,minmax(0,1fr))}.stat{border-top:1px solid var(--line);padding-top:18px}
.stat dd{margin:0;order:-1;font-size:clamp(2.2rem,4.6vw,3.4rem);line-height:1;letter-spacing:-.02em}.stat{display:flex;flex-direction:column;gap:8px}.stat dt{color:var(--muted)}
.st-band{background:var(--accent);color:var(--on-accent);padding:32px;border-radius:var(--r)}.st-band .stat{border-color:color-mix(in srgb,var(--on-accent) 30%,transparent)}.st-band dt{color:inherit;opacity:.85}
/* names */
.logos{text-align:center}.names{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-wrap:wrap;justify-content:center;gap:14px 44px}.names li{font-family:var(--display);font-size:1.35rem;color:var(--muted)}
/* pricing */
.plans{display:grid;gap:20px}.plan{display:flex;flex-direction:column;gap:6px;padding:28px;border:1px solid var(--line);border-radius:var(--r);background:var(--surface)}
.plan.is-featured{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}.price{margin:6px 0 4px;font-size:2.4rem;line-height:1}.plan .ticks{margin-bottom:22px}.plan .btn{margin-top:auto}
/* lists */
.lists{display:grid;gap:clamp(28px,4vw,56px)}.list-group ul{list-style:none;margin:10px 0 0;padding:0}
.list-item{display:grid;grid-template-columns:1fr auto;gap:2px 18px;padding:14px 0;border-bottom:1px solid var(--line)}
.li-main{display:flex;flex-direction:column}.li-name{font-weight:600}.li-price{font-variant-numeric:tabular-nums;font-weight:600}.li-text{grid-column:1/-1;margin:2px 0 0;font-size:.95rem}
.l-menu .li-main{flex-direction:row;align-items:baseline;gap:10px}.l-schedule .li-meta{order:-1;font-variant-numeric:tabular-nums}
/* faq */
.faq-items{border-top:1px solid var(--line);margin-top:24px}.qa{border-bottom:1px solid var(--line);padding:18px 0}
.qa summary{cursor:pointer;font-weight:600;font-size:1.08rem;list-style:none;display:flex;justify-content:space-between;gap:16px}.qa summary::after{content:"+";color:var(--muted)}.qa[open] summary::after{content:"−"}.qa summary::-webkit-details-marker{display:none}.qa p{margin:12px 0 0;color:var(--muted);max-width:70ch}
/* cta */
.cta-box{padding:clamp(36px,6vw,72px);border-radius:var(--r);text-align:center}.cta-box .actions{justify-content:center}.cta-box .body-lg{margin-inline:auto}
.c-band{background:var(--accent);color:var(--on-accent)}.c-band .body-lg{color:inherit;opacity:.88}.c-band .btn-primary{background:var(--on-accent);color:var(--accent)}.c-band .btn-secondary{color:var(--on-accent)}
.c-centered{background:var(--surface);border:1px solid var(--line)}
.cta-image{display:grid;gap:clamp(28px,5vw,64px);align-items:center}.cta-media .media-img{width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--r);filter:var(--img)}
/* forms */
.form-wrap{display:grid;gap:clamp(24px,4vw,56px)}.form{display:grid;gap:18px;max-width:620px}.fields{display:grid;gap:16px}
.field{display:flex;flex-direction:column;gap:6px}.field label{font-weight:600;font-size:.95rem}.req{color:var(--accent-ink)}
.field input:not([type=checkbox]),.field textarea,.field select{width:100%;min-height:48px;padding:12px 14px;border:1.5px solid color-mix(in srgb,var(--text) 32%,transparent);border-radius:calc(var(--r) * .6);background:var(--surface);color:var(--text);font:inherit}
.field.is-check{flex-direction:row;align-items:center;gap:10px}.field.is-check label{display:flex;align-items:center;min-height:44px;cursor:pointer}.field.is-check input{width:22px;height:22px;accent-color:var(--accent)}
.form .btn{justify-self:start}
/* text */
.tb-narrow{max-width:760px}.tb-body p{margin:0 0 1.1em;font-size:1.08rem;max-width:68ch}.tb-two-column{display:grid;gap:clamp(24px,4vw,64px)}
/* footer */
.foot{display:grid;gap:36px}.foot ul{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:8px}.foot a{text-decoration:none;color:var(--muted)}.foot a:hover{color:var(--text)}
.foot-cols{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:28px}.foot-title{margin:0;font-weight:600;font-size:.95rem}.legal{margin:0}
.credits{margin:0;font-size:.78rem;line-height:1.5;color:var(--muted)}.credits a{color:inherit}
/* app screens */
.app{min-height:100vh;display:grid;background:var(--bg)}.app>*{min-width:0}.app main{min-width:0;padding:clamp(18px,3vw,36px);display:grid;gap:22px;align-content:start}
.app .sx{padding:0}.appnav{padding:20px;display:flex;flex-direction:column;gap:22px;background:var(--surface);border-right:1px solid var(--line)}
.appnav ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}.appnav a{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 12px;border-radius:calc(var(--r) * .7);text-decoration:none;color:var(--muted);font-weight:500}
.appnav a[aria-current=page]{background:color-mix(in srgb,var(--accent) 12%,transparent);color:var(--text)}.appnav .ic{width:20px;height:20px;stroke:currentColor}.an-user{margin-top:auto}
.app.nav-topbar{grid-template-rows:auto 1fr}.nav-topbar .appnav{flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--line);padding:10px 20px}.nav-topbar .appnav{overflow-x:auto}.nav-topbar .appnav ul{display:flex}.nav-topbar .appnav a,.nav-sidebar .appnav a{white-space:nowrap}.nav-topbar .an-user{margin:0 0 0 auto}
.app.nav-tabbar{grid-template-rows:1fr auto}.nav-tabbar .appnav{order:2;position:sticky;bottom:0;flex-direction:row;padding:6px 8px;border-right:0;border-top:1px solid var(--line)}.nav-tabbar .appnav .brand,.nav-tabbar .an-user{display:none}
.nav-tabbar .appnav ul{display:flex;width:100%;justify-content:space-around}.nav-tabbar .appnav a{flex-direction:column;gap:2px;min-height:52px;font-size:.72rem;padding:4px 8px}
.app.is-mobile{max-width:430px;margin-inline:auto;border-inline:1px solid var(--line)}
.apphead{display:flex;flex-wrap:wrap;align-items:flex-end;justify-content:space-between;gap:16px}.h-app{margin:0;font-size:clamp(1.6rem,2.6vw,2.2rem);line-height:1.1}.apphead p{margin:6px 0 0}
.apphead-acts{display:flex;flex-wrap:wrap;gap:10px;align-items:center}.apphead .btn{min-height:44px;padding:0 18px;font-size:.92rem}
.search{display:flex;align-items:center;gap:8px;min-height:44px;padding:0 12px;border:1.5px solid var(--line);border-radius:var(--btn-r);background:var(--surface)}.search .ic{width:18px;height:18px;stroke:var(--muted)}.search input{align-self:stretch;border:0;background:none;font:inherit;color:var(--text);outline:none;min-width:0;flex:1}
.cards-row{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(170px,1fr))}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--r);padding:20px}.h-card{margin:0 0 14px;font-size:1.15rem}
.stat-card p{margin:0}.stat-value{font-size:2rem;line-height:1.1;margin:6px 0 4px!important;letter-spacing:-.02em}.delta{font-size:.875rem;font-weight:600}.d-up{color:var(--accent-ink)}.d-down{color:var(--muted)}
.chart{width:100%;height:auto;overflow:visible}.chart .grid{stroke:var(--line);stroke-width:1}.chart .axis{fill:var(--muted);font-size:11px;font-family:var(--body)}
.chart .line{fill:none;stroke-width:2.4;stroke-linejoin:round;stroke-linecap:round}.chart .area{opacity:.14}
.s0{stroke:var(--accent);fill:var(--accent);background:var(--accent)}.s1{stroke:var(--muted);fill:var(--muted);background:var(--muted)}.s2{stroke:var(--text);fill:var(--text);background:var(--text)}
.line.s0,.line.s1,.line.s2{fill:none}.legend{display:flex;gap:16px;list-style:none;margin:10px 0 0;padding:0;font-size:.85rem;color:var(--muted)}.key{display:inline-block;width:10px;height:10px;border-radius:2px;margin-right:6px}
.table-scroll{overflow-x:auto}table{width:100%;border-collapse:collapse;font-size:.94rem}th{text-align:left;font-weight:600;color:var(--muted);font-size:.82rem;padding:10px 12px;border-bottom:1px solid var(--line)}td{padding:12px;border-bottom:1px solid var(--line)}
.status{display:inline-flex;align-items:center;gap:6px}.status .dot{width:8px;height:8px;border-radius:50%;background:var(--accent)}
.feed{list-style:none;margin:0;padding:0;display:grid}.feed li{padding:12px 0;border-bottom:1px solid var(--line)}.feed p{margin:0}.feed-title{font-weight:600}
.img-missing{background:repeating-linear-gradient(45deg,color-mix(in srgb,var(--line) 60%,transparent) 0 10px,transparent 10px 20px);min-height:200px;border-radius:var(--r)}
/* styles */
.s-editorial .sx+.sx:not(.sx-footer):not(.sx-cta){border-top:1px solid var(--line)}
.s-editorial .eyebrow{color:var(--accent-ink)}
.s-bold .h-hero{letter-spacing:-.035em;line-height:.98}.s-bold .eyebrow{color:var(--accent-ink)}
.s-warm .sx:nth-of-type(even):not(.sx-footer):not(.sx-nav){background:var(--surface)}
.s-technical .eyebrow,.s-technical .axis,.s-technical .li-meta{font-family:ui-monospace,Menlo,monospace;letter-spacing:.04em}
.s-technical .h-hero{letter-spacing:-.02em}
.s-minimal .eyebrow{letter-spacing:.12em}
@media (min-width:760px){
.gallery{grid-template-columns:repeat(3,minmax(0,1fr))}.g-mosaic .g-item:first-child{grid-column:span 2;grid-row:span 2}
.gallery.n-1:not(.g-strip){grid-template-columns:1fr}.gallery.n-1:not(.g-strip) .g-item:first-child{grid-column:auto;grid-row:auto}.gallery.n-1:not(.g-strip) .g-img{aspect-ratio:16/9}
.g-grid:not(.n-1){grid-template-columns:repeat(6,minmax(0,1fr))}.g-grid .g-item{grid-column:span 2}
.g-grid.n-2 .g-item,.g-grid.n-4 .g-item,.g-grid.n-5 .g-item:nth-child(n+4),.g-grid.n-7 .g-item:nth-child(n+4),.g-grid.n-8 .g-item:nth-child(n+7){grid-column:span 3}
.g-grid.n-2 .g-img,.g-grid.n-4 .g-img,.g-grid.n-5 .g-item:nth-child(n+4) .g-img,.g-grid.n-7 .g-item:nth-child(n+4) .g-img,.g-grid.n-8 .g-item:nth-child(n+7) .g-img{aspect-ratio:3/2}
.g-mosaic.n-2{grid-template-columns:2fr 1fr}.g-mosaic.n-2 .g-item:first-child{grid-column:auto;grid-row:auto}.g-mosaic.n-2 .g-item:first-child .g-img{aspect-ratio:4/3}
.g-mosaic.n-4 .g-item:nth-child(4),.g-mosaic.n-7 .g-item:nth-child(7){grid-column:1/-1}.g-mosaic.n-4 .g-item:nth-child(4) .g-img,.g-mosaic.n-7 .g-item:nth-child(7) .g-img{aspect-ratio:3/1}
.g-mosaic.n-5 .g-item:nth-child(4),.g-mosaic.n-8 .g-item:nth-child(7){grid-column:span 2}.g-mosaic.n-5 .g-item:nth-child(4) .g-img,.g-mosaic.n-8 .g-item:nth-child(7) .g-img{aspect-ratio:2/1}
.stats{grid-template-columns:repeat(var(--cols,4),minmax(0,1fr))}
.features.n-2{grid-template-columns:repeat(2,minmax(0,1fr))}.features.n-3,.features.n-4{grid-template-columns:repeat(2,minmax(0,1fr))}
.lists.n-2,.lists.n-3{grid-template-columns:repeat(2,minmax(0,1fr))}
.plans.n-2{grid-template-columns:repeat(2,minmax(0,1fr))}.plans.n-3,.plans.n-4{grid-template-columns:repeat(2,minmax(0,1fr))}
.foot{grid-template-columns:1.2fr 2fr}.foot-cols{grid-template-columns:repeat(auto-fit,minmax(140px,1fr))}.legal,.credits{grid-column:1/-1}
.fq-two-column .faq-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));column-gap:48px;border-top:0}
}
@media (min-width:1100px){
.hero-split{grid-template-columns:1.1fr 1fr}.split{grid-template-columns:1fr 1fr}.cta-image{grid-template-columns:1fr 1fr}
.q-with-portrait{grid-template-columns:340px 1fr}.form-wrap.fm-split{grid-template-columns:1fr 1.2fr}.tb-two-column{grid-template-columns:1fr 1.6fr}
.features.n-3{grid-template-columns:repeat(3,minmax(0,1fr))}.features.n-4{grid-template-columns:repeat(4,minmax(0,1fr))}.f-list{grid-template-columns:repeat(2,minmax(0,1fr))!important}
.lists.n-3{grid-template-columns:repeat(3,minmax(0,1fr))}.plans.n-3{grid-template-columns:repeat(3,minmax(0,1fr))}.plans.n-4{grid-template-columns:repeat(4,minmax(0,1fr))}
.gallery.g-grid.n-4{grid-template-columns:repeat(4,minmax(0,1fr))}.gallery.g-grid.n-4 .g-item{grid-column:auto}.gallery.g-grid.n-4 .g-img{aspect-ratio:1}
.app.nav-sidebar{grid-template-columns:248px 1fr}
.app main{grid-template-columns:repeat(12,minmax(0,1fr))}.app main>*{grid-column:1/-1}.app main>.sx-chart{grid-column:span 8}.app main>.sx-feed{grid-column:span 4}
}
@media (max-width:759px){
.nav-links{display:none}.nav-in .btn{margin-left:auto}
.app.nav-sidebar .appnav{flex-direction:row;align-items:center;border-right:0;border-bottom:1px solid var(--line);overflow-x:auto}.app.nav-sidebar .appnav ul{display:flex}.app.nav-sidebar .an-user{display:none}
}
@media (prefers-reduced-motion:reduce){*{transition:none!important}}
${platform === 'mobile' ? '' : ''}`;
}

// ── the page ─────────────────────────────────────────────────────────

/**
 * The variant a section can really be drawn as. An image can leave the
 * moodboard after the spec named it; a variant built around that image then
 * falls back — in its markup and its class alike — instead of drawing the
 * image's empty place.
 */
function effective(s: Section, im: Images): Section {
  const fallback = NEEDS_IMAGE[s.kind]?.[s.variant];
  return fallback && !im.has(s, 0) ? { ...s, variant: fallback } : s;
}

function creditLine(ref: MoodboardRef): Credit {
  const by = ref.creator ? ` by ${ref.creator}` : '';
  const text =
    ref.provider === 'unsplash'
      ? `Photo${by} on Unsplash`
      : ref.provider === 'pexels'
        ? `Photo${by} on Pexels`
        : ref.attribution || `“${ref.title || 'Image'}”${by}${ref.license ? `, ${ref.license}` : ''}`;
  return { id: ref.id, text, url: ref.sourceUrl || ref.creatorUrl, license: ref.license };
}

/** Draw a spec. `refs`: the project's moodboard references. */
export function renderDesign(spec: DesignSpec, refs: readonly MoodboardRef[]): Rendered {
  const im = new Images(new Map(refs.filter((r) => r.state !== 'rejected').map((r) => [r.id, r])));
  const app = spec.pageType === 'app-screen';
  let heroSeen = false;
  const blocks = spec.sections.map((s0) => {
    const s = effective(s0, im);
    const fn = SECTIONS[s.kind];
    if (!fn || !kindDef(s.kind)) return '';
    const first = s.kind === 'hero' && !heroSeen;
    if (s.kind === 'hero') heroSeen = true;
    const cols = s.kind === 'stats' ? ` style="--cols:${Math.min(4, (s.content.items as unknown[]).length)}"` : '';
    const tag = s.kind === 'nav' || s.kind === 'footer' || s.kind === 'app-nav' ? 'div' : 'section';
    return `<${tag} class="sx sx-${s.kind} v-${s.variant}" data-ux-section="${esc(s.id)}"${cols}>${fn(s, s.content, im, first)}</${tag}>`;
  });
  const credits = [...im.used.values()].map(creditLine);
  const creditHtml = credits.length
    ? `<p class="credits">Images: ${credits.map((c) => (c.url ? `<a href="${esc(c.url)}" rel="noreferrer">${esc(c.text)}</a>` : esc(c.text))).join(' · ')}</p>`
    : '';
  let body = blocks.join('\n');
  if (creditHtml) body = body.includes('<!--credits-->') ? body.replace('<!--credits-->', creditHtml) : `${body}\n<div class="sx sx-credits"><div class="wrap">${creditHtml}</div></div>`;
  else body = body.replace('<!--credits-->', '');

  if (app) {
    const navIdx = spec.sections.findIndex((s) => s.kind === 'app-nav');
    const nav = navIdx >= 0 ? blocks[navIdx] : '';
    const rest = blocks.filter((_, i) => i !== navIdx).join('\n');
    const navVariant = navIdx >= 0 ? spec.sections[navIdx].variant : 'sidebar';
    body = `<div class="app nav-${navVariant}${spec.platform === 'mobile' ? ' is-mobile' : ''}">${nav}<main>${rest}${creditHtml ? `<div class="sx">${creditHtml}</div>` : ''}</main></div>`;
  }

  const fonts = fontStylesheet([spec.tokens.fonts.display, spec.tokens.fonts.body]);
  const style = css(spec.tokens, spec.platform);
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(spec.title)}</title>
${fonts ? `<link rel="stylesheet" href="${esc(fonts)}">` : ''}
<style>${style}</style>
</head>
<body class="s-${spec.tokens.style}">
${body}
</body>
</html>`;
  return { html, css: style, credits };
}
