// lib/ux-v0/motion.ts — how a design moves: presets, words, and the CSS that plays them.
//
// Motion is part of a design's look (spec.ts `Motion`), chosen in the art
// direction like its type and colour, and drawn by the renderer as CSS only:
//
//   - the opening headline arrives on load: a fade, a mask that rises, or kinetic
//     typography word by word or letter by letter (the words wrapped in spans);
//   - everything else arrives as it scrolls into view, tied to the scroll with
//     CSS scroll-driven animation (`animation-timeline: view()`), staggered
//     across a row by shifting each item's range;
//   - pictures and shapes move at their own depth as the page scrolls (layered
//     parallax), coloured sections wipe or open as they arrive, and the
//     navigation stays and condenses;
//   - hovers lift, underline, invert or zoom.
//
// No scripts: it plays in the sealed preview and in an exported page alike.
// Where a browser has no scroll timelines the content is simply there (only the
// first screen's load arrival plays), and under `prefers-reduced-motion` every
// movement is replaced by a short fade or nothing. A static mode writes none of
// the time- or scroll-driven parts, for the canvas and for measuring.

import { STILL_MOTION, normalizeMotion, type Look, type Motion } from './spec';

export type MotionMode = 'play' | 'reduced' | 'static';

export const MOTION_LABEL: Record<Motion['feel'], string> = { still: 'Still', calm: 'Calm', measured: 'Measured', lively: 'Lively', kinetic: 'Kinetic' };

export const EASE_CURVE: Record<Motion['ease'], string> = {
  gentle: 'cubic-bezier(.25,.1,.25,1)',
  out: 'cubic-bezier(.2,.7,.2,1)',
  expo: 'cubic-bezier(.16,1,.3,1)',
  snap: 'cubic-bezier(.7,0,.2,1)',
  linear: 'linear',
};
export const EASE_LABEL: Record<Motion['ease'], string> = { gentle: 'Gentle', out: 'Settling', expo: 'Long glide', snap: 'Snap', linear: 'Even' };
export const ENTRANCE_LABEL: Record<Motion['entrance'], string> = { none: 'Already there', fade: 'Fade in', rise: 'Rise', slide: 'Slide across', scale: 'Grow', mask: 'Mask reveal' };
export const HEADLINE_LABEL: Record<Motion['headline'], string> = { none: 'Still', fade: 'Fade', mask: 'Mask reveal', words: 'Word by word', letters: 'Letter by letter' };
export const HOVER_LABEL: Record<Motion['hover'], string> = { none: 'None', lift: 'Lift', underline: 'Underline', invert: 'Invert', zoom: 'Zoom pictures' };
export const SECTION_LABEL: Record<Motion['sections'], string> = { none: 'None', wipe: 'Wipe across', expand: 'Open out' };

/** Each feel as a whole: the timings and behaviours that belong together. */
export const MOTION_PRESETS: Record<Motion['feel'], Motion> = {
  still: { ...STILL_MOTION },
  calm: { feel: 'calm', duration: 900, stagger: 90, distance: 14, ease: 'gentle', entrance: 'fade', headline: 'fade', scroll: true, parallax: 1, hover: 'zoom', sections: 'none', nav: true, scrub: 0, story: false, media: 'none', magnetic: false, cursor: 'none', draw: false },
  measured: { feel: 'measured', duration: 620, stagger: 70, distance: 20, ease: 'out', entrance: 'rise', headline: 'mask', scroll: true, parallax: 0, hover: 'underline', sections: 'none', nav: true, scrub: 0, story: false, media: 'mask', magnetic: false, cursor: 'none', draw: true },
  lively: { feel: 'lively', duration: 520, stagger: 55, distance: 30, ease: 'expo', entrance: 'slide', headline: 'words', scroll: true, parallax: 2, hover: 'lift', sections: 'wipe', nav: true, scrub: 1, story: false, media: 'mask', magnetic: true, cursor: 'none', draw: true },
  kinetic: { feel: 'kinetic', duration: 760, stagger: 38, distance: 52, ease: 'expo', entrance: 'scale', headline: 'letters', scroll: true, parallax: 3, hover: 'invert', sections: 'expand', nav: true, scrub: 2, story: true, media: 'scale', magnetic: true, cursor: 'tilt', draw: true },
};

const ORDER: Motion['feel'][] = ['still', 'calm', 'measured', 'lively', 'kinetic'];

export function motionFor(feel: Motion['feel'], tweak: Partial<Motion> = {}): Motion {
  return normalizeMotion({ ...MOTION_PRESETS[feel], ...tweak, feel }, MOTION_PRESETS[feel]);
}

/** One step calmer (-1) or livelier (+1): the next feel, keeping what the designer set by hand where it still fits. */
export function stepMotion(m: Motion, dir: -1 | 1): Motion {
  const i = Math.max(0, Math.min(ORDER.length - 1, ORDER.indexOf(m.feel) + dir));
  if (ORDER[i] === m.feel) return m;
  const next = MOTION_PRESETS[ORDER[i]];
  // the designer's hover and easing survive a change of energy unless the new feel is still
  return ORDER[i] === 'still' ? { ...next } : { ...next, hover: m.hover === 'none' ? next.hover : m.hover, ease: m.ease };
}

/** What the designer's words say about motion: a feel, parallax, or none at all. */
export function readMotionWords(text: string): { feel?: Motion['feel']; parallax?: boolean; said: string[] } {
  const n = ` ${text.toLowerCase()} `;
  const out: { feel?: Motion['feel']; parallax?: boolean; said: string[] } = { said: [] };
  if (/\b(no|without|zero) (motion|animation|animations)\b|\b(static|motionless)\b|\bkeep it still\b/.test(n)) (out.feel = 'still'), out.said.push('no motion');
  else if (/\b(kinetic|cinematic|motion[- ]rich|animated|dynamic|energetic|explosive|frenetic)\b/.test(n)) (out.feel = 'kinetic'), out.said.push('kinetic motion');
  else if (/\b(lively|playful|bouncy|snappy|punchy motion|fast motion|quick)\b/.test(n)) (out.feel = 'lively'), out.said.push('lively motion');
  else if (/\b(slow|calm|gentle|subtle|soft motion|quiet motion|less motion|reduce(d)? motion|unhurried|serene|meditative)\b/.test(n)) (out.feel = 'calm'), out.said.push('calm motion');
  else if (/\b(measured|precise motion|restrained motion)\b/.test(n)) (out.feel = 'measured'), out.said.push('measured motion');
  if (/\bno parallax\b|\bwithout parallax\b/.test(n)) (out.parallax = false), out.said.push('no parallax');
  else if (/\bparallax|depth|layered\b/.test(n)) (out.parallax = true), out.said.push('layered parallax');
  return out;
}

/** The motion in a sentence, for the brief, the direction and the checks. */
export function describeMotion(m: Motion): string {
  if (m.feel === 'still') return 'Still: nothing moves but what the hand moves; hover states only change colour.';
  const bits = [
    `${MOTION_LABEL[m.feel]}: things ${ENTRANCE_LABEL[m.entrance].toLowerCase() === 'already there' ? 'are simply there' : `arrive with a ${ENTRANCE_LABEL[m.entrance].toLowerCase()}`} over ${m.duration} ms (${EASE_LABEL[m.ease].toLowerCase()} easing)`,
    m.headline !== 'none' ? `the headline ${m.headline === 'words' ? 'comes in word by word' : m.headline === 'letters' ? 'comes in letter by letter' : m.headline === 'mask' ? 'rises through a mask' : 'fades in'}` : '',
    m.scroll ? 'each section as it scrolls into view' : 'only the first screen moves',
    m.parallax ? `${['', 'gentle', 'clear', 'deep'][m.parallax]} parallax on pictures and shapes` : '',
    m.sections !== 'none' ? `coloured sections ${m.sections === 'wipe' ? 'wipe across' : 'open out'}` : '',
    m.hover !== 'none' ? `hover ${m.hover === 'zoom' ? 'zooms pictures' : m.hover === 'lift' ? 'lifts cards' : m.hover === 'invert' ? 'inverts buttons' : 'underlines links'}` : '',
  ].filter(Boolean);
  return `${bits.join('; ')}.`;
}

// ── kinetic typography ────────────────────────────────────────────────

/**
 * Wrap the words (or the letters of each word) of a headline's HTML in spans
 * that animate one after another. Tags (the emphasis) are kept as they are;
 * spaces stay plain text so the line still breaks between words.
 */
export function kineticHeadline(html: string, by: 'words' | 'letters'): string {
  const plainLength = html.replace(/<[^>]+>/g, '').length;
  const mode = by === 'letters' && plainLength > 42 ? 'words' : by;
  let i = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      // an emphasised word learns where its letters start, so a highlight behind it can arrive with them
      if (part.startsWith('<em class="em"')) return part.replace('<em class="em"', `<em class="em" style="--hl-i:${i}"`);
      if (!part || part.startsWith('<')) return part;
      return part
        .split(/(\s+)/)
        .map((w) => {
          if (!w || /^\s+$/.test(w)) return w;
          if (mode === 'words') return `<span class="kw" style="--i:${i++}">${w}</span>`;
          // letters inside an unbreakable word; entities stay whole
          const letters = w.match(/&[a-z#0-9]+;|./gi) ?? [w];
          return `<span class="kword">${letters.map((ch) => `<span class="kl" style="--i:${i++}">${ch}</span>`).join('')}</span>`;
        })
        .join('');
    })
    .join('');
}

// ── the CSS ───────────────────────────────────────────────────────────

const ARRIVE = [
  '.sec-no', '.eyebrow', '.h-section', '.lede', '.body-lg', '.ticks li', '.feature', '.card', '.stat', '.plan', '.list-item', '.g-item', '.split-media',
  '.tb-body > p', '.qa', 'blockquote', '.q-author', '.actions', '.logos li', '.cta-text', '.cta-media', '.field',
].map((x) => `.sx:not(.sx-hero):not(.sx-nav) ${x}`);
const ROW_ITEMS = ['.feature', '.card', '.stat', '.plan', '.list-item', '.g-item', '.logos li', '.ticks li'];
const PICTURES = ['.hero-media img', '.split-media img', '.hero-wide img', '.g-item img', '.cta-media img', '.hp-media img', '.bleed-img'];
const PICTURE_FRAMES = ['.hero-media', '.split-media', '.hero-wide', '.g-item', '.cta-media', '.hp-media'];

function arrivalFrames(m: Motion, name: string): string {
  const e = `animation-timing-function:var(--mo-e)`;
  switch (m.entrance) {
    case 'fade':
      return `@keyframes ${name}{from{opacity:0;${e}}to{opacity:1}}`;
    case 'slide':
      return `@keyframes ${name}{from{opacity:0;transform:translateX(calc(var(--mo-x) * -1));${e}}to{opacity:1;transform:none}}`;
    case 'scale':
      return `@keyframes ${name}{from{opacity:0;transform:translateY(calc(var(--mo-x) * .5)) scale(.9);${e}}to{opacity:1;transform:none}}`;
    case 'mask':
      return `@keyframes ${name}{from{clip-path:polygon(-10% 100%,110% 100%,110% 140%,-10% 140%);transform:translateY(calc(var(--mo-x) * .5));${e}}to{clip-path:polygon(-10% -40%,110% -40%,110% 140%,-10% 140%);transform:none}}`;
    case 'rise':
    default:
      return `@keyframes ${name}{from{opacity:0;transform:translateY(var(--mo-x));${e}}to{opacity:1;transform:none}}`;
  }
}

/** The CSS of the scripted layer: the scrubbed opening, the pinned story, pictures arriving, tilt, line drawing. */
function scriptedCss(m: Motion): string {
  const out: string[] = [];
  const R = '.mo-ready';
  if (m.scrub) {
    const lift = m.scrub >= 2 ? 150 : 64;
    const zoom = m.scrub >= 2 ? 0.16 : 0.06;
    // the opening's words lift away and fade as the page leaves it; its picture settles in scale (desktop only)
    out.push(`@media (min-width:761px){${R} .sx-hero .hero-text,${R} .sx-hero .hs-words,${R} .sx-hero .h-poster{translate:0 calc(var(--hp,0) * -${lift}px);filter:opacity(calc(1 - var(--hp,0) * .85))}${R} .sx-hero figure img,${R} .sx-hero .bleed-img{scale:calc(1 + var(--hp,0) * ${zoom})}}`);
  }
  if (m.story) {
    // one sequence pinned: the section holds the screen while its points take the stage one at a time
    out.push(`@media (min-width:761px){${R} .mo-story{height:calc(var(--n,4) * 72vh + 28vh)}${R} .mo-story>.wrap{position:sticky;top:0;min-height:100vh;box-sizing:border-box;display:grid;align-content:center;padding-block:8vh}${R} .mo-story .features{position:relative;display:block;min-height:min(52vh,520px)}${R} .mo-story [data-mo-step]{position:absolute;inset:0 auto auto 0;width:min(62ch,100%);opacity:0;translate:0 -18px;transition:opacity calc(var(--mo-d) * .3) var(--mo-e),translate calc(var(--mo-d) * .3) var(--mo-e);animation:none!important}${R} .mo-story [data-mo-step].is-on{opacity:1;translate:none;transition-duration:var(--mo-d);transition-delay:calc(var(--mo-d) * .28)}${R} .mo-story [data-mo-step]:not(.is-on){pointer-events:none}${R} .mo-story [data-mo-step] .h-item{font-size:clamp(30px,4.2vw,64px);line-height:1.04}${R} .mo-story>.wrap::after{content:"";display:block;height:2px;margin-top:4vh;background:currentColor;opacity:.45;transform-origin:left center;transform:scaleX(var(--sp,0))}}`);
  }
  if (m.media === 'mask') out.push(`${R} [data-mo-in] img{clip-path:inset(0 0 100% 0);transition:clip-path calc(var(--mo-d) * 1.6) var(--mo-e)}${R} [data-mo-in].is-in img{clip-path:inset(0)}`);
  if (m.media === 'scale') out.push(`${R} [data-mo-in]{overflow:hidden}${R} [data-mo-in] img{scale:1.18;transition:scale calc(var(--mo-d) * 2) var(--mo-e)}${R} [data-mo-in].is-in img{scale:1}`);
  if (m.cursor === 'tilt') out.push(`@media (hover:hover) and (pointer:fine){${R} [data-mo-tilt]{transition:transform 260ms var(--mo-e)}}`);
  if (m.magnetic) out.push(`@media (hover:hover) and (pointer:fine){${R} .btn{transition:translate 200ms var(--mo-e)}}`);
  if (m.draw) out.push(`${R} .mo-draw{stroke-dasharray:1;stroke-dashoffset:1;transition:stroke-dashoffset calc(var(--mo-d) * 2.4) var(--mo-e)}${R} .is-in .mo-draw{stroke-dashoffset:0}`);
  return out.join('');
}

/** What the scripted layer marks on the page, as body attributes and as markers in the rendered sections. */
export function scriptedMarks(m: Motion | undefined): { body: string; story: boolean; media: boolean; tilt: boolean; draw: boolean } {
  if (!m || m.feel === 'still') return { body: '', story: false, media: false, tilt: false, draw: false };
  const attrs = [' data-mo=""'];
  if (m.scrub) attrs.push(` data-mo-scrub="${m.scrub}"`);
  if (m.magnetic) attrs.push(' data-mo-magnetic=""');
  if (m.cursor && m.cursor !== 'none') attrs.push(` data-mo-cursor="${m.cursor}"`);
  if (m.media && m.media !== 'none') attrs.push(` data-mo-media="${m.media}"`);
  return { body: attrs.join(''), story: !!m.story, media: !!m.media && m.media !== 'none', tilt: m.cursor === 'tilt', draw: !!m.draw };
}

/**
 * The motion stylesheet for a look. `play` writes everything; `reduced` writes
 * the reduced-motion alternative unconditionally (for previewing it); `static`
 * writes only hover states, which never move anything on their own.
 */
export function motionCss(look: Look, mode: MotionMode, opts: { app?: boolean } = {}): string {
  const m = look.motion ?? STILL_MOTION;
  if (m.feel === 'still') return '';
  const out: string[] = [];
  const add = (x: string) => out.push(x);
  const hoverMs = Math.max(120, Math.min(260, Math.round(m.duration * 0.4)));
  const pictureParallax = m.parallax > 0 && !['arch', 'circle', 'offset'].includes(look.frame);
  add(`:root{--mo-d:${m.duration}ms;--mo-s:${m.stagger}ms;--mo-x:${m.distance}px;--mo-e:${EASE_CURVE[m.ease]};--mo-hd:${hoverMs}ms;--mo-p:${m.parallax * 3}%;--mo-ps:${(1.02 + m.parallax * 0.06).toFixed(2)}}`);

  // hover: in every mode, under a pointer that can hover; individual transform properties so they compose with arrivals
  const hover: string[] = [];
  if (m.hover === 'lift') hover.push(`.card,.plan,.feature,.g-item,.stat-card{transition:translate var(--mo-hd) var(--mo-e)}.card:hover,.plan:hover,.feature:hover,.g-item:hover,.stat-card:hover{translate:0 -5px}`);
  if (m.hover === 'underline') hover.push(`a:not(.btn):not(.brand){text-decoration-line:underline;text-decoration-color:transparent;text-underline-offset:.28em;text-decoration-thickness:1px;transition:text-decoration-color var(--mo-hd) var(--mo-e)}a:not(.btn):not(.brand):hover{text-decoration-color:currentColor}.btn-primary{transition:letter-spacing var(--mo-hd) var(--mo-e)}`);
  if (m.hover === 'invert') hover.push(`.btn{transition:background-color var(--mo-hd) var(--mo-e),color var(--mo-hd) var(--mo-e),border-color var(--mo-hd) var(--mo-e)}.btn-primary:hover{background:var(--text)!important;color:var(--bg)!important;border-color:var(--text)!important}.btn-secondary:hover{background:var(--accent)!important;color:var(--accent-text,var(--bg))!important;border-color:var(--accent)!important}`);
  if (m.hover === 'zoom') hover.push(`${PICTURE_FRAMES.join(',')}{overflow:hidden}${PICTURES.join(',')}{transition:scale calc(var(--mo-hd) * 4) var(--mo-e)}${PICTURE_FRAMES.map((f) => `${f}:hover img`).join(',')}{scale:1.045}`);
  if (hover.length) add(`@media (hover:hover){${hover.join('')}}`);
  if (mode === 'static') return out.join('\n');

  if (mode === 'reduced') {
    // the reduced alternative: the first screen fades in, briefly; nothing travels, nothing follows the scroll
    add(`@keyframes mo-fade{from{opacity:0}to{opacity:1}}.sx-hero .hero-text,.sx-hero .hs-words,.sx-hero .h-poster{animation:mo-fade 240ms ease-out both}`);
    return out.join('\n');
  }

  // ── the first screen, on load
  add(`@keyframes mo-t-rise{from{opacity:0;transform:translateY(var(--mo-x))}to{opacity:1;transform:none}}`);
  add(`@keyframes mo-t-fade{from{opacity:0}to{opacity:1}}`);
  add(`@keyframes mo-t-media{from{opacity:0;transform:scale(1.06)}to{opacity:1;transform:none}}`);
  add(`@keyframes mo-t-mask{from{clip-path:polygon(-10% 100%,110% 100%,110% 140%,-10% 140%);transform:translateY(.32em)}to{clip-path:polygon(-10% -40%,110% -40%,110% 140%,-10% 140%);transform:none}}`);
  add(`@keyframes mo-t-word{from{opacity:0;transform:translateY(calc(var(--mo-x) * 1.1))${m.feel === 'kinetic' ? ' rotate(4deg)' : ''}}to{opacity:1;transform:none}}`);
  const hl = '.sx-hero .h-hero';
  if (m.headline === 'fade') add(`${hl}{animation:mo-t-fade calc(var(--mo-d) * 1.2) var(--mo-e) both}`);
  if (m.headline === 'mask') add(`${hl}{animation:mo-t-mask calc(var(--mo-d) * 1.5) var(--mo-e) both}`);
  if (m.headline === 'words' || m.headline === 'letters') {
    add(`${hl} .kw,${hl} .kl{display:inline-block;animation:mo-t-word var(--mo-d) var(--mo-e) both;animation-delay:calc(var(--i) * var(--mo-s) + 60ms)}${hl} .kword{display:inline-block;white-space:nowrap}`);
    // a highlighted word: the highlight sweeps in with its first letter, instead of waiting there empty
    if (look.emphasis === 'highlight')
      add(`@keyframes mo-hl{from{background-size:0% 100%}to{background-size:100% 100%}}${hl} .em{background-color:transparent;background-image:linear-gradient(color-mix(in srgb,var(--accent) 32%,transparent),color-mix(in srgb,var(--accent) 32%,transparent));background-repeat:no-repeat;background-size:100% 100%;animation:mo-hl calc(var(--mo-d) * 1.1) var(--mo-e) both;animation-delay:calc(var(--hl-i,0) * var(--mo-s) + 60ms)}`);
  }
  const after = m.headline === 'words' || m.headline === 'letters' ? 'calc(var(--mo-d) * .7 + var(--mo-s) * 6)' : 'calc(var(--mo-d) * .55)';
  add(`.sx-hero .eyebrow{animation:mo-t-rise var(--mo-d) var(--mo-e) both}.sx-hero .hero-sub,.sx-hero .hs-foot,.sx-hero .hp-text{animation:mo-t-rise var(--mo-d) var(--mo-e) both;animation-delay:${after}}.sx-hero .actions{animation:mo-t-rise var(--mo-d) var(--mo-e) both;animation-delay:calc(${after} + var(--mo-s) * 2)}`);
  add(`.sx-hero figure,.sx-hero .bleed-img,.sx-hero .art{animation:mo-t-media calc(var(--mo-d) * 1.8) var(--mo-e) both;animation-delay:calc(var(--mo-d) * .15)}`);
  if (opts.app) add(`.app main{animation:mo-t-fade calc(var(--mo-d) * .8) var(--mo-e) both}`);

  // a running marquee runs
  if (look.motifs.includes('marquee')) add(`@keyframes mo-mq{to{transform:translateX(-50%)}}.mq-track{animation:mo-mq ${Math.round(46000 / (1 + ORDER.indexOf(m.feel)))}ms linear infinite}`);

  // ── what follows the scroll
  const scrollParts: string[] = [];
  if (m.scroll && m.entrance !== 'none' && !opts.app) {
    scrollParts.push(arrivalFrames(m, 'mo-in'));
    scrollParts.push(`${ARRIVE.join(',')}{animation:mo-in linear both;animation-timeline:view();animation-range:entry calc(4% + var(--mo-i, 0) * 7%) cover calc(24% + var(--mo-i, 0) * 7%)}`);
    // a row arrives one after another: each item's range starts a little later
    for (let i = 2; i <= 6; i++) scrollParts.push(`${ROW_ITEMS.map((x) => `${x}:nth-child(${i})`).join(',')}{--mo-i:${i - 1}}`);
  }
  if (pictureParallax && !opts.app) {
    scrollParts.push(`@keyframes mo-par{from{transform:translateY(calc(var(--mo-p) * -1)) scale(var(--mo-ps))}to{transform:translateY(var(--mo-p)) scale(var(--mo-ps))}}`);
    scrollParts.push(`${PICTURE_FRAMES.join(',')}{overflow:hidden}.hero-bleed{overflow:hidden}${PICTURES.join(',')}{animation:mo-par linear both;animation-timeline:view();animation-range:cover}`);
  }
  if (m.parallax > 0 && look.motifs.includes('shapes') && !opts.app) {
    scrollParts.push(`@keyframes mo-drift{from{transform:translateY(calc(var(--mo-p) * 4)) rotate(-6deg)}to{transform:translateY(calc(var(--mo-p) * -4)) rotate(6deg)}}@keyframes mo-drift2{from{transform:translateY(calc(var(--mo-p) * -3))}to{transform:translateY(calc(var(--mo-p) * 3))}}`);
    scrollParts.push(`.art>*{animation:mo-drift linear both;animation-timeline:view();animation-range:cover}.art>*:nth-child(even){animation-name:mo-drift2}`);
  }
  if (m.sections !== 'none' && !opts.app) {
    scrollParts.push(
      m.sections === 'wipe'
        ? `@keyframes mo-sec{from{clip-path:inset(0 100% 0 0)}to{clip-path:inset(0 0 0 0)}}`
        : `@keyframes mo-sec{from{clip-path:inset(6% 5% round 32px)}to{clip-path:inset(0 0 0 0 round 0)}}`
    );
    scrollParts.push(`.sx.tone-accent:not(.sx-hero),.sx.tone-accent2:not(.sx-hero),.sx.tone-invert:not(.sx-hero),.marquee{animation:mo-sec linear backwards;animation-timeline:view();animation-range:entry 0% entry 85%}`);
  }
  if (scrollParts.length) add(`@supports (animation-timeline: view()){${scrollParts.join('')}}`);
  if (m.nav && !opts.app) {
    add(`.sx-nav{position:sticky;top:0;z-index:30;background:var(--bg)}`);
    add(`@supports (animation-timeline: scroll()){@keyframes mo-nav{to{box-shadow:0 1px 0 var(--line)}}@keyframes mo-brand{to{scale:.88}}.sx-nav{animation:mo-nav linear both;animation-timeline:scroll(root);animation-range:0 180px}.sx-nav .brand{transform-origin:left center;animation:mo-brand linear both;animation-timeline:scroll(root);animation-range:0 180px}}`);
  }
  // ── the scripted layer (lib/ux-v0/motion-runtime.ts): applies only once the runtime has run (body.mo-ready),
  // so a page without it is simply complete; under reduced motion the runtime never marks the page ready
  add(scriptedCss(m));
  // phones: shorter travel, no parallax
  add(`@media (max-width:760px){:root{--mo-x:${Math.round(m.distance * 0.6)}px}${PICTURES.join(',')},.art>*{animation:none!important}}`);
  // reduced motion: nothing travels; the first screen fades in briefly
  add(`@media (prefers-reduced-motion:reduce){body *,body *::before,body *::after{animation:none!important;transition:none!important;translate:none!important;scale:none!important}.sx-hero .hero-text,.sx-hero .hs-words,.sx-hero .h-poster{animation:mo-t-fade 240ms ease-out both!important}}`);
  return out.join('\n');
}
