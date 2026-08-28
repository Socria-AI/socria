// Assemble the exported UI fragments into trailer artboards.
//
// Each feature frame is: the real product surface, exported verbatim, seated
// on the magazine's paper with a beat number, a headline and one line of copy.
// Tokens are lifted from the app, not approximated — magazine palette from
// app/logos/logos.css, product palette from app/globals.css.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';

const FRAG = '/home/user/socria/.trailer/frag';
const OUT = '/home/user/socria/.trailer';
mkdirSync(OUT, { recursive: true });

const W = 1600, H = 1000;

// Lifted from app/logos/logos.css :root and app/globals.css
const T = {
  paper: '#F4F1E8', paper2: '#eae5d7', ink: '#20201b',
  ink70: 'rgba(32,32,27,.7)', ink45: 'rgba(32,32,27,.45)', ink25: 'rgba(32,32,27,.25)',
  border: '#ded8c6', moss: '#5e7633', moss700: '#465a26', sage: '#9CB874',
  forest: '#232f14', forest2: '#1a2410', cream: '#F0EAD8', gold: '#b8a26b',
};

const FONTS = `<link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Inter:wght@400;500;600;700&family=Kalam:wght@300;400;700&family=STIX+Two+Text:ital,wght@0,400..700;1,400..700&display=swap">`;

// next/font self-hosts at /_next/... which the canvas CSP blocks; the same
// four families come from Google Fonts instead, mapped onto the variables the
// product's CSS resolves through.
const FONTVARS = `
    :root, .docs-root, .logos-root {
      --font-serif: 'Instrument Serif'; --font-sans: 'Inter';
      --font-hand: 'Kalam'; --font-stix: 'STIX Two Text';
    }`;

function frame({ id, beat, kicker, head, copy, fragId, scale = 1, lift = 0, inner: innerW }) {
  const f = JSON.parse(readFileSync(`${FRAG}/${fragId}.json`, 'utf8'));
  // The Board lays its working out at ~700px whatever the card width, so those
  // frames take a narrower surface rather than stranding the ink in dead space.
  const inner = innerW ?? 1338;
  const s = Math.min(scale, (W - 200) / inner);
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${FONTS}
  <style>
    body { margin: 0; }
    a { color: ${T.moss700}; } a:hover { color: ${T.forest}; }
${FONTVARS}
    :root { ${f.vars} }
    ${f.css}
    /* the stage carries the wiki scope so '.docs-root .logos-root' binds;
       neutralise the shell layout it would otherwise impose */
    .tr-stage.docs-root {
      min-height: 0; display: flex; flex-direction: row; background: transparent; color: inherit;
    }
    /* the product surface is fixed/inset-0 in the app; seat it in the frame */
    .tr-stage.docs-root .logos-root.lg-demo {
      position: relative; inset: auto; width: ${inner}px; height: ${f.h}px;
      overflow: hidden; background: ${T.paper};
      border: 1px solid ${T.border}; border-radius: 12px;
      box-shadow: 0 50px 90px -60px rgba(32,32,27,.55);
    }
    .tr-stage.docs-root .logos-root.lg-demo::before { display: none; }
  </style>
</helmet>
<div style="width: ${W}px; height: ${H}px; background: ${T.paper}; font-family: 'Inter', system-ui, sans-serif; display: flex; flex-direction: column; overflow: hidden; position: relative">
  <div style="position: absolute; left: 0; top: 0; width: 100%; height: 4px; background: ${T.moss}"></div>
  <div style="display: flex; align-items: baseline; gap: 20px; padding: 54px 80px 0">
    <span style="font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 30px; color: ${T.sage}">${beat}</span>
    <span style="font-size: 11.5px; font-weight: 700; letter-spacing: .26em; text-transform: uppercase; color: ${T.moss}">${kicker}</span>
  </div>
  <h2 style="margin: 12px 80px 0; font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-size: 52px; line-height: 1.06; letter-spacing: -.015em; color: ${T.ink}; max-width: 20ch">${head}</h2>
  <p style="margin: 16px 80px 0; font-size: 17px; line-height: 1.5; color: ${T.ink70}; max-width: 64ch">${copy}</p>
  <div class="tr-stage docs-root" style="flex: 1; display: flex; align-items: flex-start; justify-content: center; padding: ${28 + lift}px 0 0; min-height: 0">
    <div style="transform: scale(${s.toFixed(4)}); transform-origin: top center">
      ${f.html}
    </div>
  </div>
</div>
</x-dc>
</body>
</html>`;
}

function card({ kicker, head, copy, foot, dark = false }) {
  const bg = dark ? `radial-gradient(120% 90% at 50% 0%, ${T.forest} 0%, ${T.forest2} 70%)` : T.paper;
  const fg = dark ? T.cream : T.ink;
  const sub = dark ? 'rgba(240,234,216,.72)' : T.ink70;
  const kick = dark ? T.sage : T.moss;
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
  ${FONTS}
  <style>
    body { margin: 0; }
    a { color: ${dark ? T.sage : T.moss700}; } a:hover { color: ${dark ? T.cream : T.forest}; }
  </style>
</helmet>
<div style="width: ${W}px; height: ${H}px; background: ${bg}; font-family: 'Inter', system-ui, sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 120px; box-sizing: border-box; gap: 26px">
  <span style="font-size: 11.5px; font-weight: 700; letter-spacing: .3em; text-transform: uppercase; color: ${kick}">${kicker}</span>
  <h1 style="margin: 0; font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-size: 92px; line-height: 1.02; letter-spacing: -.02em; color: ${fg}; max-width: 17ch">${head}</h1>
  <p style="margin: 0; font-family: 'Instrument Serif', Georgia, serif; font-style: italic; font-size: 28px; line-height: 1.35; color: ${sub}; max-width: 36ch">${copy}</p>
  ${foot ? `<p style="margin: 22px 0 0; font-size: 13px; letter-spacing: .22em; text-transform: uppercase; color: ${dark ? 'rgba(240,234,216,.55)' : T.ink45}">${foot}</p>` : ''}
</div>
</x-dc>
</body>
</html>`;
}

const FRAMES = [
  ['Main', card({
    kicker: 'Socria',
    head: 'Logos',
    copy: 'Think out loud, and watch the shape of your reasoning appear beside you.',
    foot: 'A Human-First reasoning environment',
  })],
  ['Split', frame({ beat: 'i.', kicker: 'The Thinking Map', fragId: 'split',
    head: 'Your reasoning, drawn as you talk.',
    copy: 'The conversation runs on the left. On the right, a live map of what you actually said — claims, assumptions, tensions, evidence — reorganizing as your mind does.' })],
  ['Lenses', frame({ beat: 'ii.', kicker: 'Four Lenses', fragId: 'lenses',
    head: 'One map. Four ways to read it.',
    copy: 'Structure shows what rests on what. Tensions face your conflicts off against each other. Evidence asks which claims are actually held up.' })],
  ['Moves', frame({ beat: 'iii.', kicker: 'Four Moves', fragId: 'moves',
    head: 'Press on any thought.',
    copy: 'Explore an idea, challenge it, take it out to real research, or trace it back to the moment you said it — quoted verbatim. Every move ends on a question, never a verdict.' })],
  ['Board', frame({ beat: 'iv.', kicker: 'The Board', fragId: 'board', inner: 840,
    head: 'Mistakes are struck through, never erased.',
    copy: 'When the work is mathematical the map becomes the working — a hand-drawn page where the wrong turn stays on the board with the fix beside it.' })],
  ['Calculus', frame({ beat: 'v.', kicker: 'At Any Level', fragId: 'calculus', inner: 840,
    head: 'The same board, from algebra to calculus.',
    copy: 'Nothing subject-specific was added: integration by parts and hypothesis tests chain exactly the way a quadratic does.' })],
  ['Guard', frame({ beat: 'vi.', kicker: 'The Answer Guard', fragId: 'guard', inner: 900, lift: 40,
    head: 'While you are learning, it will not hand you the answer.',
    copy: 'Ask it to. It declines — kindly — and guides instead. The door out is always there, and it is never priced.' })],
  ['Dials', frame({ beat: 'vii.', kicker: 'Socria Personality', fragId: 'dials',
    head: 'Nine settings for how it talks. Zero for what it decides.',
    copy: 'Turn any dial and the manner changes. Your authorship, the guard, and the record of where a thought came from hold on every setting.' })],
  ['Close', card({
    dark: true,
    kicker: 'Socria One · $15 / month',
    head: 'The thinking stays yours.',
    copy: 'Every map you build remains open, interactive, and yours — at every tier, always.',
    foot: 'socria.app',
  })],
];

for (const [name, html] of FRAMES) writeFileSync(`${OUT}/${name}.dc.html`, html);

const cols = 3, gapX = 220, gapY = 260;
const canvas = {
  artboards: FRAMES.map(([name], i) => ({
    file: `${name}.dc.html`,
    x: (i % cols) * (W + gapX),
    y: Math.floor(i / cols) * (H + gapY),
    w: W, h: H,
  })),
  annotations: [{
    id: 'trailer-brief', x: 0, y: -190, w: 620,
    text: 'Socria Logos — feature trailer, nine beats.\nEvery product frame is the real interface exported from the running app, not a mockup: real map layout, real Board ink, real dials.',
  }],
  launch: { view: 'canvas' },
};
writeFileSync(`${OUT}/canvas.json`, JSON.stringify(canvas, null, 2));
console.log(`wrote ${FRAMES.length} artboards + canvas.json`);
