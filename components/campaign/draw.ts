// components/campaign/draw.ts — one frame of the relaunch's opening.
//
// Everything is placed by lib/campaign/scene.ts as a function of time; this
// only paints it, in white on black, in CSS pixels (the caller scales the
// context for the screen's density). Drawn back to front: the chat while it is
// whole, the links, the grains in flight, the nodes, the signals.

import { TIMELINE, chatAlpha, clamp01, easeInOut, easeOut, edgeGrown, grainAt, nodeAt, nodeLight, signalsAt, smooth, wordsDim, type Scene, type Shape } from '@/lib/campaign/scene';

export interface Painter {
  /** a soft white glow, drawn once and stamped under each node */
  glow: HTMLCanvasElement;
  /** the last moment a grain is still in flight, so the loop can stop counting them */
  grainsDone: number;
}

export function painterFor(scene: Scene): Painter {
  const glow = document.createElement('canvas');
  glow.width = glow.height = 64;
  const g = glow.getContext('2d');
  if (g) {
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(0.25, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
  }
  let done = 0;
  for (const gr of scene.grains) done = Math.max(done, gr.release + gr.travel);
  return { glow, grainsDone: done + 0.05 };
}

const white = (a: number) => `rgba(255,255,255,${a.toFixed(3)})`;

function rrectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** One stroke of the chat, as it comes in and while it stays. */
function drawShape(ctx: CanvasRenderingContext2D, s: Shape, t: number, whole: number) {
  const u = clamp01((t - s.at) / 0.5);
  if (u <= 0) return;
  const a = smooth(0, 1, u) * whole;
  const dy = (1 - easeOut(u)) * s.rise;
  ctx.lineWidth = 1;
  switch (s.kind) {
    case 'rrect': {
      rrectPath(ctx, s.x, s.y + dy, s.w, s.h, s.r);
      if (s.fill > 0) {
        ctx.fillStyle = white(s.fill * a);
        ctx.fill();
      }
      // the window's frame draws itself on; the rest fade in
      if (s.rise === 0 && s.w > 200) {
        const per = 2 * (s.w + s.h);
        ctx.setLineDash([per, per]);
        ctx.lineDashOffset = per * (1 - easeInOut(clamp01((t - s.at) / 1.1)));
        ctx.strokeStyle = white(s.stroke * whole);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.strokeStyle = white(s.stroke * a);
        ctx.stroke();
      }
      return;
    }
    case 'bar':
      rrectPath(ctx, s.x, s.y + dy, s.w * (0.4 + 0.6 * easeOut(u)), s.h, s.h / 2);
      ctx.fillStyle = white(s.alpha * a);
      ctx.fill();
      return;
    case 'circle':
      ctx.beginPath();
      ctx.arc(s.cx, s.cy + dy, s.r, 0, Math.PI * 2);
      if (s.fill > 0) {
        ctx.fillStyle = white(s.fill * a);
        ctx.fill();
      }
      ctx.strokeStyle = white(s.stroke * a);
      ctx.stroke();
      return;
    case 'line':
      ctx.beginPath();
      ctx.moveTo(s.x0, s.y0 + dy);
      ctx.lineTo(s.x0 + (s.x1 - s.x0) * easeOut(u), s.y1 + dy);
      ctx.strokeStyle = white(s.alpha * a);
      ctx.stroke();
      return;
    case 'typing':
      // "typing…": three dots, each lifting in turn
      for (let i = -1; i <= 1; i++) {
        const pulse = Math.max(0, Math.sin(t * Math.PI * 2 * 1.25 - (i + 1) * 0.9)) ** 2;
        ctx.beginPath();
        ctx.arc(s.cx + i * s.gap, s.cy + dy - pulse * 2, s.r, 0, Math.PI * 2);
        ctx.fillStyle = white((0.3 + 0.6 * pulse) * a);
        ctx.fill();
      }
      return;
    case 'send': {
      ctx.beginPath();
      ctx.arc(s.cx, s.cy + dy, s.r, 0, Math.PI * 2);
      ctx.fillStyle = white(0.86 * a);
      ctx.fill();
      // the arrow, cut out in black
      const k = s.r * 0.42;
      ctx.beginPath();
      ctx.moveTo(s.cx, s.cy + dy + k);
      ctx.lineTo(s.cx, s.cy + dy - k);
      ctx.moveTo(s.cx - k * 0.75, s.cy + dy - k * 0.2);
      ctx.lineTo(s.cx, s.cy + dy - k);
      ctx.lineTo(s.cx + k * 0.75, s.cy + dy - k * 0.2);
      ctx.strokeStyle = `rgba(0,0,0,${(0.9 * a).toFixed(3)})`;
      ctx.lineWidth = 1.6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      ctx.lineCap = 'butt';
      return;
    }
    case 'caret': {
      // blinking, until the interface turns to grain
      if (t > TIMELINE.grain || Math.floor((t - s.at) * 2.2) % 2 === 1) return;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x, s.y + s.h);
      ctx.strokeStyle = white(0.75 * a);
      ctx.stroke();
      return;
    }
  }
}

/**
 * Paint the opening at time t. `px`, `py` are the pointer's offset from the
 * centre (0 when there is none), which the nodes follow a little; `fade` dims
 * everything (1 is full), for the way out.
 */
export function drawFrame(ctx: CanvasRenderingContext2D, scene: Scene, painter: Painter, t: number, px = 0, py = 0, fade = 1) {
  ctx.clearRect(0, 0, scene.w, scene.h);
  ctx.globalAlpha = 1;

  // the chat, while it is whole
  const whole = chatAlpha(t) * fade;
  if (whole > 0.003) for (const s of scene.shapes) drawShape(ctx, s, t, whole);

  const pos = scene.nodes.map((n) => nodeAt(n, t, px, py));
  const light = scene.nodes.map((n) => nodeLight(n, t));

  // the links, each drawn out from the end that lit first
  ctx.lineWidth = 0.9;
  for (const e of scene.edges) {
    const g = edgeGrown(e, t);
    if (g <= 0) continue;
    const first = scene.nodes[e.a].form <= scene.nodes[e.b].form;
    const p = pos[first ? e.a : e.b];
    const q = pos[first ? e.b : e.a];
    const x1 = p.x + (q.x - p.x) * g;
    const y1 = p.y + (q.y - p.y) * g;
    const a = (e.strong ? 0.24 : 0.14) * wordsDim(scene, (p.x + q.x) / 2, (p.y + q.y) / 2, t) * fade;
    if (a < 0.004) continue;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(x1, y1);
    ctx.strokeStyle = white(a);
    ctx.stroke();
  }

  // the grains, from where they sat on the chat to the node each ends in
  if (t >= TIMELINE.grain && t <= painter.grainsDone) {
    ctx.fillStyle = '#fff';
    for (const g of scene.grains) {
      const s = grainAt(scene, g, t, px, py);
      const a = s.alpha * fade * (t > TIMELINE.title - 0.4 ? wordsDim(scene, s.x, s.y, t) : 1);
      if (a < 0.02) continue;
      ctx.globalAlpha = a;
      ctx.fillRect(s.x - s.size / 2, s.y - s.size / 2, s.size, s.size);
    }
    ctx.globalAlpha = 1;
  }

  // the nodes: a glow, a core, and a ring the moment each lights
  for (let i = 0; i < scene.nodes.length; i++) {
    const n = scene.nodes[i];
    const l = light[i];
    if (l.alpha < 0.01) continue;
    const p = pos[i];
    const dim = wordsDim(scene, p.x, p.y, t) * fade;
    const gs = (n.hub ? 30 : 15) * scene.unit;
    ctx.globalAlpha = l.alpha * dim * (n.hub ? 0.6 : 0.28);
    ctx.drawImage(painter.glow, p.x - gs / 2, p.y - gs / 2, gs, gs);
    ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.arc(p.x, p.y, l.r, 0, Math.PI * 2);
    ctx.fillStyle = white(0.95 * l.alpha * dim);
    ctx.fill();
    const ring = clamp01((t - n.form) / 0.9);
    if (ring > 0 && ring < 1) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, n.r + easeOut(ring) * 12 * scene.unit, 0, Math.PI * 2);
      ctx.strokeStyle = white(0.3 * (1 - ring) * dim);
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // signals, running along the links once the network has settled
  for (const s of signalsAt(scene, t)) {
    const e = scene.edges[s.edge];
    const p = pos[s.reverse ? e.b : e.a];
    const q = pos[s.reverse ? e.a : e.b];
    for (let k = 0; k < 4; k++) {
      const along = s.along - k * 0.035;
      if (along < 0) continue;
      const x = p.x + (q.x - p.x) * along;
      const y = p.y + (q.y - p.y) * along;
      const a = Math.sin(Math.PI * s.along) * (0.85 - k * 0.2) * wordsDim(scene, x, y, t) * fade;
      if (a < 0.02) continue;
      ctx.beginPath();
      ctx.arc(x, y, (1.6 - k * 0.3) * scene.unit, 0, Math.PI * 2);
      ctx.fillStyle = white(a);
      ctx.fill();
    }
  }
}
