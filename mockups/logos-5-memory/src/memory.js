// mockups/logos-5-memory/src/memory.js — draws the Memory network mockups.
//
// One page, ten screens: ?device=desktop|mobile&state=1..5
//   1 overview · 2 an open region · 3 a selected memory + inspector
//   4 Changes (how memories evolved) · 5 Review (proposed updates, contradictions)
// Everything is computed deterministically (seeded), as the real layout must
// be: the same memories land in the same places on every render.

(function () {
  const M = window.MEM;
  const REG = Object.fromEntries(M.regions.map((r) => [r.id, r]));
  const NODE = Object.fromEntries(M.nodes.map((n) => [n.id, n]));
  const IDS = M.regions.map((r) => r.id);
  const qs = new URLSearchParams(location.search);
  const device = qs.get('device') || 'desktop';
  const state = Number(qs.get('state') || 1);
  const SVGNS = 'http://www.w3.org/2000/svg';
  // the desktop canvas: the window less the region list and the top bar
  const CANVAS = { W: 1440 - 260, H: 900 - 72 };

  // ── small things ─────────────────────────────────────────────────
  function hash(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let t = seed >>> 0;
    return () => {
      t += 0x6d2b79f5;
      let r = Math.imul(t ^ (t >>> 15), 1 | t);
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
  }
  const f = (n) => n.toFixed(1);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  function rgba(hex, a) {
    const v = parseInt(hex.slice(1), 16);
    return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
  }
  function h(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function s(tag, attrs = {}, text) {
    const e = document.createElementNS(SVGNS, tag);
    for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
    if (text !== undefined) e.textContent = text;
    return e;
  }
  const measureCtx = document.createElement('canvas').getContext('2d');
  function textW(t, font) { measureCtx.font = font; return measureCtx.measureText(t).width; }

  // ── icons (line, 1.6) ────────────────────────────────────────────
  const I = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4.2-4.2"/>',
    filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
    net: '<circle cx="6" cy="7" r="2.4"/><circle cx="17" cy="6" r="2"/><circle cx="12" cy="17" r="2.6"/><path d="M8.2 8.2l2.6 6.5M15.6 7.6l-2.6 7M8.3 6.7l6.7-.6"/>',
    minus: '<path d="M6 12h12"/>',
    plus: '<path d="M6 12h12M12 6v12"/>',
    chevR: '<path d="M9 6l6 6-6 6"/>',
    chevD: '<path d="M6 9l6 6 6-6"/>',
    chevL: '<path d="M15 6l-6 6 6 6"/>',
    x: '<path d="M7 7l10 10M17 7L7 17"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    pencil: '<path d="M4 20l4.2-1 10.4-10.4a2 2 0 0 0-2.8-2.8L5.4 16.2 4 20z"/>',
    trash: '<path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12"/>',
    ext: '<path d="M14 5h5v5M19 5l-8 8M18 14v5H5V6h5"/>',
    chat: '<path d="M5 18l-1 3 4-1.5c1.2.6 2.6 1 4 1 4.4 0 8-3.1 8-7s-3.6-7-8-7-8 3.1-8 7c0 1.4.4 2.6 1 3.5z"/>',
    file: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4"/>',
    lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
    eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="2.8"/>',
    swap: '<path d="M7 7h11l-3-3M17 17H6l3 3"/>',
    reword: '<path d="M4 19h4l10-10-4-4L4 15v4zM13 6l4 4"/>',
    tension: '<path d="M12 4l9 15H3z"/><path d="M12 10v4M12 16.6v.4"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4.5l3 2"/>',
    wifi: '<path d="M2 9a14 14 0 0 1 20 0M5.5 12.5a9 9 0 0 1 13 0M9 16a4 4 0 0 1 6 0"/><circle cx="12" cy="19" r=".8"/>',
    // region glyphs
    identity: '<circle cx="12" cy="12" r="8"/><path d="M8.5 13.5a3.5 3.5 0 0 1 7 0M12 8.5v.01"/><circle cx="12" cy="9.5" r="1.6"/>',
    goals: '<path d="M6 21V4h11l-2.4 4 2.4 4H6"/>',
    work: '<rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5.5h6v2M3.5 12.5h17"/>',
    learning: '<path d="M3.5 6.5c3-1 6-1 8.5 1 2.5-2 5.5-2 8.5-1v12c-3-1-6-1-8.5 1-2.5-2-5.5-2-8.5-1z"/><path d="M12 7.5v12"/>',
    people: '<circle cx="9" cy="9" r="3"/><circle cx="16.5" cy="10" r="2.4"/><path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M15 14.5c2.6 0 4.6 1.4 5.2 4"/>',
    prefs: '<path d="M5 6h14M5 12h14M5 18h14"/><circle cx="9" cy="6" r="1.9" fill="var(--panel)"/><circle cx="15" cy="12" r="1.9" fill="var(--panel)"/><circle cx="8" cy="18" r="1.9" fill="var(--panel)"/>',
    recent: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5v5l3.2 2"/>',
    questions: '<circle cx="12" cy="12" r="8"/><path d="M9.6 9.6a2.5 2.5 0 1 1 3.3 2.4c-.6.3-.9.8-.9 1.5v.6M12 16.8v.2"/>',
  };
  const icon = (name, cls = 'ico', style = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true" ${style ? `style="${style}"` : ''}>${I[name]}</svg>`;

  // state glyphs (shared by legend, inspector, lists) — the same marks the network draws
  const G = {
    confirmed: (c = '#354620') => `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.6" fill="#fffdf8" stroke="${c}" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="${rgba(c, 0.55)}"/></svg>`,
    proposed: (c = '#354620') => `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.6" fill="#fffdf8" stroke="${c}" stroke-width="1.6" stroke-dasharray="2.6 2.1"/><circle cx="8" cy="8" r="2.6" fill="${rgba(c, 0.4)}"/></svg>`,
    recent: (c = '#354620') => `<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="7.6" fill="none" stroke="rgba(184,162,107,.75)" stroke-width="2"/><circle cx="8" cy="8" r="4.2" fill="#fffdf8" stroke="${c}" stroke-width="1.4"/><circle cx="8" cy="8" r="1.8" fill="${rgba(c, 0.55)}"/></svg>`,
    warn: () => `<svg viewBox="0 0 16 16"><path d="M8 1.8l6.6 11.6H1.4z" fill="#9c5b3c"/><path d="M8 6.2v3.4M8 11.3v.2" stroke="#fffdf8" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    older: (c = '#354620') => `<svg viewBox="0 0 16 16" style="opacity:.42"><circle cx="8" cy="8" r="5.6" fill="#fffdf8" stroke="${c}" stroke-width="1.6"/><circle cx="8" cy="8" r="2.6" fill="${rgba(c, 0.5)}"/></svg>`,
    pin: () => `<svg viewBox="0 0 16 16"><path d="M8 9.6v5" stroke="#8a7230" stroke-width="1.5" stroke-linecap="round"/><circle cx="8" cy="5.8" r="4" fill="#b8a26b" stroke="#8a7230" stroke-width="1.2"/><circle cx="6.8" cy="4.7" r="1" fill="#fffdf8" opacity=".7"/></svg>`,
  };

  // ── the region outline: a soft lobe, not a circle ────────────────
  function blobPath(cx, cy, R, seed, sx = 1, sy = 0.9) {
    const r = rng(seed);
    const a1 = r() * 6.283, a2 = r() * 6.283, a3 = r() * 6.283;
    const pts = [];
    const N = 40;
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      const m = 1 + 0.07 * Math.sin(3 * t + a1) + 0.045 * Math.sin(5 * t + a2) + 0.035 * Math.cos(2 * t + a3);
      pts.push([cx + Math.cos(t) * R * m * sx, cy + Math.sin(t) * R * m * sy]);
    }
    let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      d += ` C${f(p1[0] + (p2[0] - p0[0]) / 6)},${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)},${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])},${f(p2[1])}`;
    }
    return d + 'Z';
  }

  const radius = (n, k = 1) => (4.6 + 10 * n.imp) * k;
  const members = (rid) => M.nodes.filter((n) => n.r === rid);

  // ── how strongly two regions connect: the store's own edges, counted ──
  const pairKey = (a, b) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const WEIGHT = {};
  for (const [a, b] of M.edges) {
    const ra = NODE[a].r, rb = NODE[b].r;
    if (ra !== rb) WEIGHT[pairKey(ra, rb)] = (WEIGHT[pairKey(ra, rb)] || 0) + 1;
  }
  const wOf = (a, b) => WEIGHT[pairKey(a, b)] || 0;

  // ── the atlas: every region has a fixed home ─────────────────────
  // Identity in the middle; the others around it, regions that usually relate
  // side by side. The same homes for everyone, on every visit — a map learned
  // once. Only a region's size follows what it holds.
  const RING = ['goals', 'questions', 'work', 'people', 'prefs', 'learning', 'recent'];
  function atlas(o) {
    const R = (id) => o.scale * Math.sqrt(members(id).length);
    const out = { identity: { id: 'identity', cx: o.cx, cy: o.cy, R: R('identity'), sy: o.sy, centre: true } };
    RING.forEach((id, i) => {
      const a = -Math.PI / 2 + (i / RING.length) * Math.PI * 2 + (o.turn || 0);
      out[id] = { id, cx: o.cx + Math.cos(a) * o.a, cy: o.cy + Math.sin(a) * o.b, R: R(id), sy: o.sy, ux: Math.cos(a), uy: Math.sin(a) };
    });
    return out;
  }

  // a memory with relationships elsewhere leans toward those regions
  function pullDirs(L) {
    const dirs = {};
    for (const [a, b] of M.edges) {
      const A = NODE[a], B = NODE[b];
      if (A.r === B.r) continue;
      for (const [n, o] of [[A, B], [B, A]]) {
        const c = L[n.r], t = L[o.r];
        if (!c || !t) continue;
        const dx = t.cx - c.cx, dy = t.cy - c.cy, d = Math.hypot(dx, dy) || 1;
        const v = dirs[n.id] || [0, 0];
        dirs[n.id] = [v[0] + dx / d, v[1] + dy / d];
      }
    }
    for (const id of Object.keys(dirs)) { const [x, y] = dirs[id]; const d = Math.hypot(x, y) || 1; dirs[id] = [x / d, y / d]; }
    return dirs;
  }

  // ── laying a region's memories out, deterministically ────────────
  function placeRegion(rid, c, k, dirs, o = {}) {
    const sy = (c.sy ?? 0.9) * 0.96;
    const R = c.R;
    const list = members(rid).slice().sort((a, b) => b.imp - a.imp);
    const r = rng(hash(rid) + 7);
    const base = (hash(rid) % 360) * (Math.PI / 180);
    const out = list.map((m, i) => {
      const ang = base + i * 2.39996 + r() * 0.5;
      const rad = i === 0 ? R * 0.08 : R * 0.66 * Math.sqrt((i + 0.25) / list.length);
      return { n: m, x: c.cx + Math.cos(ang) * rad, y: c.cy + Math.sin(ang) * rad * sy, r: radius(m, k) };
    });
    const gapK = o.gap ?? 30;
    const N = 180;
    for (let it = 0; it < N; it++) {
      const heat = 1 - it / N;
      for (const a of out) {
        const u = dirs && dirs[a.n.id];
        if (u) { a.x += u[0] * 1.1 * heat; a.y += u[1] * 1.1 * heat; }
      }
      for (const a of out) for (const b of out) {
        if (a === b) continue;
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
        const min = a.r + b.r + gapK * k;
        if (d < min) { const p = (min - d) / 2; a.x -= (dx / d) * p; a.y -= (dy / d) * p; b.x += (dx / d) * p; b.y += (dy / d) * p; }
      }
      for (const a of out) {
        const dx = a.x - c.cx, dy = (a.y - c.cy) / sy, d = Math.hypot(dx, dy);
        const lim = R * (o.fill ?? 0.72) - a.r;
        if (d > lim) { a.x = c.cx + (dx / d) * lim; a.y = c.cy + ((dy / d) * lim) * sy; }
      }
      if (o.hole) for (const a of out) {
        const hx = o.hole.w / 2 + a.r + 4, hy = o.hole.h / 2 + a.r + 4;
        const dx = a.x - c.cx, dy = a.y - (c.cy + o.hole.dy);
        if (Math.abs(dx) < hx && Math.abs(dy) < hy) a.y = c.cy + o.hole.dy + (dy < 0 || (dy === 0 && hash(a.n.id) % 2) ? -hy : hy);
      }
    }
    return out;
  }

  // ── the scene: regions, nodes, edges — then drawn ────────────────
  function drawScene(svg, sc) {
    const W = sc.W, H = sc.H;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const uid = `s${Math.round(W)}${Math.round(H)}`;
    const defs = s('defs');
    const halo = s('radialGradient', { id: `${uid}-halo` });
    halo.append(s('stop', { offset: '0%', 'stop-color': 'rgba(214,190,120,0.42)' }), s('stop', { offset: '100%', 'stop-color': 'rgba(214,190,120,0)' }));
    const sel = s('radialGradient', { id: `${uid}-sel` });
    sel.append(s('stop', { offset: '0%', 'stop-color': 'rgba(214,190,120,0.55)' }), s('stop', { offset: '55%', 'stop-color': 'rgba(214,190,120,0.18)' }), s('stop', { offset: '100%', 'stop-color': 'rgba(214,190,120,0)' }));
    defs.append(halo, sel);
    for (const rg of M.regions) {
      const g = s('radialGradient', { id: `${uid}-rg-${rg.id}`, cx: '50%', cy: '45%', r: '60%' });
      g.append(s('stop', { offset: '0%', 'stop-color': rgba(rg.color, 0.12) }), s('stop', { offset: '100%', 'stop-color': rgba(rg.color, 0.04) }));
      defs.append(g);
    }
    svg.append(defs);

    const L = { regions: s('g'), tracts: s('g'), edges: s('g'), hi: s('g'), nodes: s('g'), marks: s('g'), labels: s('g') };
    Object.values(L).forEach((g) => svg.append(g));
    const pos = sc.pos;
    const dim = sc.dim || new Set();
    const RC = Object.fromEntries(sc.regions.map((r) => [r.id, r]));

    // what a word must not cover: memories, region names, words already placed, the page's own controls
    const boxes = (sc.avoid || []).slice();
    const hit = (b) => boxes.some((o) => !(b.x + b.w < o.x || o.x + o.w < b.x || b.y + b.h < o.y || o.y + o.h < b.y));
    const inside = (b) => b.x >= 6 && b.x + b.w <= W - 6 && b.y >= 6 && b.y + b.h <= H - 6;
    for (const p of Object.values(pos)) boxes.push({ x: p.x - p.r - 3, y: p.y - p.r - 3, w: p.r * 2 + 6, h: p.r * 2 + 6 });

    // regions, and their names
    for (const rr of sc.regions) {
      const rg = REG[rr.id];
      const sy = rr.sy ?? 0.9, sx = rr.sx ?? 1;
      const g = s('g', { opacity: rr.op ?? 1 });
      const d = blobPath(rr.cx, rr.cy, rr.R, hash(rr.id), sx, sy);
      g.append(s('path', { d, fill: `url(#${uid}-rg-${rr.id})`, class: 'rg-fill' }));
      if (rr.strong) g.append(s('path', { d, fill: rgba(rg.color, 0.035), class: 'rg-fill' }));
      g.append(s('path', { d, stroke: rgba(rg.color, rr.strong ? 0.34 : 0.22), class: 'rg-edge', 'stroke-width': rr.strong ? 1.3 : 1 }));
      L.regions.append(g);
    }
    for (const rr of sc.regions) {
      if (!rr.inner) continue;
      const rg = REG[rr.id];
      const lg = s('g');
      lg.append(s('text', { x: f(rr.cx), y: f(rr.cy - 2), class: 'rg-in', fill: rg.color, 'text-anchor': 'middle' }, rr.inner.name));
      const sub = s('text', { x: f(rr.cx), y: f(rr.cy + 12), class: 'rg-in-sub', 'text-anchor': 'middle' });
      sub.append(document.createTextNode(rr.inner.sub));
      if (rr.inner.review) { const t = s('tspan', { class: 'rv' }, ` · ${rr.inner.review}`); sub.append(t); }
      lg.append(sub);
      L.labels.append(lg);
    }
    // edges
    function curved(a, b, bendK) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
      const sgn = hash(`${a.n.id}${b.n.id}`) % 2 ? 1 : -1;
      const o = d * bendK * sgn;
      return `M${f(a.x)},${f(a.y)} Q${f(mx - (dy / d) * o)},${f(my + (dx / d) * o)} ${f(b.x)},${f(b.y)}`;
    }
    // the bundle two regions share: fibres gather at each lobe's edge, like a tract
    function ports(ra, rb) {
      const [r1, r2] = ra < rb ? [ra, rb] : [rb, ra];
      const A = RC[r1], B = RC[r2];
      const dx = B.cx - A.cx, dy = B.cy - A.cy, d = Math.hypot(dx, dy) || 1;
      const ux = dx / d, uy = dy / d;
      let bow = (hash(r1 + r2) % 2 ? 1 : -1) * Math.min(30, d * 0.06);
      const C = sc.centre;
      if (C && r1 !== C.id && r2 !== C.id) {
        // a bundle never runs through the middle region: it bends around it
        const sd = (C.cx - A.cx) * -uy + (C.cy - A.cy) * ux;
        const along = ((C.cx - A.cx) * ux + (C.cy - A.cy) * uy) / d;
        const clear = C.R + (sc.clear ?? 44);
        if (along > 0.08 && along < 0.92 && Math.abs(sd) < clear) bow = -(Math.sign(sd) || (hash(r1 + r2) % 2 ? 1 : -1)) * (clear - Math.abs(sd)) / 0.75;
      }
      const k = sc.portK ?? 0.72;
      const p1 = [A.cx + ux * A.R * k - uy * bow, A.cy + uy * A.R * k * (A.sy ?? 0.9) + ux * bow];
      const p2 = [B.cx - ux * B.R * k - uy * bow, B.cy - uy * B.R * k * (B.sy ?? 0.9) + ux * bow];
      return ra === r1 ? [p1, p2] : [p2, p1];
    }
    const bundled = (a, b) => {
      const [p1, p2] = ports(a.n.r, b.n.r);
      return `M${f(a.x)},${f(a.y)} C${f(p1[0])},${f(p1[1])} ${f(p2[0])},${f(p2[1])} ${f(b.x)},${f(b.y)}`;
    };
    if (sc.tracts) {
      for (const [key, w] of Object.entries(WEIGHT)) {
        const [r1, r2] = key.split('|');
        if (!RC[r1] || !RC[r2] || w < (sc.tractMin ?? 1)) continue;
        const A = RC[r1], B = RC[r2];
        const [q1, q2] = ports(r1, r2);
        // where the bundle leaves each lobe: its rim, toward the other
        // it begins inside each lobe and fades in, rather than stopping at the rim
        const rim = (C, q) => { const dx = q[0] - C.cx, dy = (q[1] - C.cy) / (C.sy ?? 0.9), d = Math.hypot(dx, dy) || 1; return [C.cx + (dx / d) * C.R * 0.55, C.cy + (dy / d) * C.R * 0.55 * (C.sy ?? 0.9)]; };
        const a = rim(A, q1), b = rim(B, q2);
        const mx = (q1[0] + q2[0]) / 2, my = (q1[1] + q2[1]) / 2;
        const c = [2 * mx - (a[0] + b[0]) / 2, 2 * my - (a[1] + b[1]) / 2];
        const w0 = (sc.tractW ?? 3) + w * (sc.tractK ?? 2.4);
        const N = 28, left = [], right = [];
        for (let i = 0; i <= N; i++) {
          const t = i / N, u = 1 - t;
          const x = u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], y = u * u * a[1] + 2 * u * t * c[1] + t * t * b[1];
          const tx = 2 * u * (c[0] - a[0]) + 2 * t * (b[0] - c[0]), ty = 2 * u * (c[1] - a[1]) + 2 * t * (b[1] - c[1]);
          const tl = Math.hypot(tx, ty) || 1;
          const hw = (w0 / 2) * (0.62 + 0.38 * Math.pow(2 * t - 1, 2));
          left.push([x - (ty / tl) * hw, y + (tx / tl) * hw]);
          right.push([x + (ty / tl) * hw, y - (tx / tl) * hw]);
        }
        const ring = left.concat(right.reverse());
        const d = `M${ring.map((q) => `${f(q[0])},${f(q[1])}`).join(' L')} Z`;
        const gid = `${uid}-tr-${r1}-${r2}`;
        const lg = s('linearGradient', { id: gid, gradientUnits: 'userSpaceOnUse', x1: f(a[0]), y1: f(a[1]), x2: f(b[0]), y2: f(b[1]) });
        const span = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
        const inA = Math.min(0.45, (A.R * 0.5) / span), inB = Math.min(0.45, (B.R * 0.5) / span);
        lg.append(
          s('stop', { offset: '0', 'stop-color': 'rgb(150,132,86)', 'stop-opacity': 0 }),
          s('stop', { offset: f(inA * 100) + '%', 'stop-color': 'rgb(150,132,86)', 'stop-opacity': 0.2 }),
          s('stop', { offset: f(100 - inB * 100) + '%', 'stop-color': 'rgb(150,132,86)', 'stop-opacity': 0.2 }),
          s('stop', { offset: '1', 'stop-color': 'rgb(150,132,86)', 'stop-opacity': 0 }),
        );
        defs.append(lg);
        L.tracts.append(s('path', { d, fill: `url(#${gid})` }));
      }
    }
    const elabels = [];
    const drawnLines = [];
    for (const e of M.edges) {
      const [ai, bi, rel, say, review] = e;
      const a = pos[ai], b = pos[bi];
      if (!a || !b) continue;
      if (sc.focus && a.n.r !== sc.focus && b.n.r !== sc.focus) continue;
      const inter = a.n.r !== b.n.r;
      // a possible contradiction shows at every distance; other links wait for a closer look
      if (rel !== 'contradicts' && ((inter && sc.fibres === false) || (!inter && sc.intra === false))) continue;
      const key = `${ai}>${bi}`;
      const hi = sc.hiEdges && sc.hiEdges.has(key);
      const faded = dim.has(ai) || dim.has(bi);
      const d = inter && sc.bundle && RC[a.n.r] && RC[b.n.r] ? bundled(a, b) : curved(a, b, sc.bend ?? 0.16);
      const conflict = rel === 'contradicts';
      const proposed = review === 'proposed';
      let el;
      if (hi) {
        L.hi.append(s('path', { d, fill: 'none', stroke: conflict ? 'rgba(156,91,60,0.16)' : 'rgba(214,190,120,0.32)', 'stroke-width': 8, 'stroke-linecap': 'round' }));
        el = s('path', { d, fill: 'none', stroke: conflict ? '#9c5b3c' : '#4d5f2e', 'stroke-width': 1.9, 'stroke-linecap': 'round', 'stroke-dasharray': conflict || proposed ? '5 4' : null });
        L.hi.append(el);
        if (!conflict && sc.pulse !== false) {
          // a pulse travelling along it: what a change reaches lights briefly
          const Lp = el.getTotalLength();
          const pt = el.getPointAtLength(Lp * (sc.pulseAt ?? 0.42));
          L.hi.append(s('circle', { cx: f(pt.x), cy: f(pt.y), r: 5.5, fill: 'rgba(214,190,120,0.35)' }));
          L.hi.append(s('circle', { cx: f(pt.x), cy: f(pt.y), r: 2.6, fill: '#b8a26b' }));
        }
      } else {
        const op = faded ? 0.32 : 1;
        const ia = sc.interAlpha ?? 0.2;
        L.edges.append(s('path', { d, fill: 'none', stroke: conflict ? 'rgba(156,91,60,0.1)' : inter ? 'rgba(35,36,31,0.03)' : rgba(REG[a.n.r].color, 0.07), 'stroke-width': 5, 'stroke-linecap': 'round', opacity: op }));
        el = s('path', {
          d, fill: 'none',
          stroke: conflict ? 'rgba(156,91,60,0.75)' : inter ? `rgba(35,36,31,${ia})` : rgba(REG[a.n.r].color, 0.45),
          'stroke-width': conflict ? 1.4 : 1.1, 'stroke-linecap': 'round', opacity: op,
          'stroke-dasharray': conflict || proposed ? '4 3.5' : null,
        });
        L.edges.append(el);
      }
      drawnLines.push(el);
      const want = sc.edgeLabels === 'all' ? !faded : sc.edgeLabels === 'hi' ? hi : sc.edgeLabels instanceof Set ? sc.edgeLabels.has(key) : false;
      if (want) elabels.push({ el, t: say, hi, conflict, at: sc.labelAt && sc.labelAt[key] });
    }

    // region names: uppercase, so they sit where no line runs through them
    const lineDots = [];
    for (const el of drawnLines) {
      const len = el.getTotalLength();
      for (let t = 0; t <= len; t += 6) { const q = el.getPointAtLength(t); lineDots.push([q.x, q.y]); }
    }
    for (const rr of sc.regions) {
      if (rr.label === false || rr.inner) continue;
      const rg = REG[rr.id];
      const sy = rr.sy ?? 0.9;
      const name = (rr.short ? rg.short || rg.name : rg.name).toUpperCase();
      const fs = rr.fs || 10.5;
      const nameW = textW(name, `600 ${fs}px Inter`) + name.length * fs * 0.14;
      const count = rr.count === false ? '' : String(members(rr.id).length);
      const cw = count ? textW(count, `500 ${fs}px Inter`) + 7 : 0;
      const tw = nameW + cw;
      const top = rr.cy - rr.R * sy * 1.06 - 9, bottom = rr.cy + rr.R * sy * 1.06 + fs + 7;
      const inTop = [rr.cx, rr.cy - rr.R * sy * 0.78];
      const spots = rr.spots || (rr.centre ? [[rr.cx, top], inTop] : (rr.uy ?? -1) > 0.3 ? [[rr.cx, bottom], [rr.cx, top]] : [[rr.cx, top], [rr.cx, bottom]]);
      const fit = ([x, y]) => [clamp(x, tw / 2 + 12, W - tw / 2 - 12), clamp(y, fs + 12, H - 10)];
      const boxAt = (p) => { const [x, y] = fit(p); return { x: x - tw / 2 - 5, y: y - fs - 3, w: tw + 10, h: fs + 8 }; };
      const crosses = (b) => lineDots.some(([x, y]) => x > b.x && x < b.x + b.w && y > b.y && y < b.y + b.h);
      let at = spots.find((p) => inside(boxAt(p)) && !hit(boxAt(p)) && !crosses(boxAt(p))) || spots.find((p) => inside(boxAt(p)) && !hit(boxAt(p))) || spots[0];
      boxes.push(boxAt(at));
      at = fit(at);
      const x0 = at[0] - tw / 2;
      const lg = s('g', { opacity: rr.lop ?? rr.op ?? 1 });
      lg.append(s('text', { x: f(x0), y: f(at[1]), class: 'rg-name', fill: rg.color, style: `font-size:${fs}px` }, name));
      if (count) lg.append(s('text', { x: f(x0 + nameW + 7), y: f(at[1]), class: 'rg-count', style: `font-size:${fs}px` }, count));
      L.labels.append(lg);
    }


    // dendrites, cell bodies, state marks
    for (const p of Object.values(pos)) {
      const n = p.n;
      const c = REG[n.r].color;
      const op = (n.faded && !p.keepFull ? 0.42 : 1) * (dim.has(n.id) ? 0.3 : 1) * (p.ghost ? 0.85 : 1) * (p.op ?? 1);
      const g = s('g', { opacity: f(op) });
      const r = p.r;
      // dendrites: a few short, tapering processes — the neuron, kept quiet
      if (r >= 6.5 && !p.noDend) {
        const rr = rng(hash(n.id));
        const k = 3 + (hash(n.id) % 3);
        const dg = s('g');
        for (let i = 0; i < k; i++) {
          const a = (i / k) * Math.PI * 2 + rr() * 0.9;
          const len = r * (1.25 + rr() * 0.9);
          const x0 = p.x + Math.cos(a) * r * 0.92, y0 = p.y + Math.sin(a) * r * 0.92;
          const bend = (rr() - 0.5) * 0.9;
          const x1 = p.x + Math.cos(a + bend * 0.35) * (r + len), y1 = p.y + Math.sin(a + bend * 0.35) * (r + len);
          const qx = p.x + Math.cos(a + bend * 0.2) * (r + len * 0.55), qy = p.y + Math.sin(a + bend * 0.2) * (r + len * 0.55);
          dg.append(s('path', { d: `M${f(x0)},${f(y0)} Q${f(qx)},${f(qy)} ${f(x1)},${f(y1)}`, fill: 'none', stroke: rgba(c, 0.32), 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
          if (rr() > 0.55) {
            const fa = a + (rr() > 0.5 ? 0.5 : -0.5);
            const bx = qx + Math.cos(fa) * len * 0.42, by = qy + Math.sin(fa) * len * 0.42;
            dg.append(s('path', { d: `M${f(qx)},${f(qy)} L${f(bx)},${f(by)}`, fill: 'none', stroke: rgba(c, 0.22), 'stroke-width': 1, 'stroke-linecap': 'round' }));
          }
        }
        g.append(dg);
      }
      if (p.selected) g.append(s('circle', { cx: f(p.x), cy: f(p.y), r: f(r + 30), fill: `url(#${uid}-sel)` }));
      if (n.recent && !p.selected) {
        g.append(s('circle', { cx: f(p.x), cy: f(p.y), r: f(r + 15), fill: `url(#${uid}-halo)` }));
        g.append(s('circle', { cx: f(p.x), cy: f(p.y), r: f(r + 5.2), fill: 'none', stroke: 'rgba(184,162,107,0.7)', 'stroke-width': 2.2 }));
      }
      if (p.selected) g.append(s('circle', { cx: f(p.x), cy: f(p.y), r: f(r + 6), fill: 'none', stroke: '#354620', 'stroke-width': 1.6 }));
      const dashed = n.status === 'proposed' || n.status === 'tentative';
      g.append(s('circle', { cx: f(p.x), cy: f(p.y), r: f(r), fill: '#fffdf8', stroke: c, 'stroke-width': r > 12 ? 2 : 1.7, 'stroke-dasharray': dashed ? `${f(Math.max(2.4, r * 0.38))} ${f(Math.max(2, r * 0.3))}` : null }));
      g.append(s('circle', { cx: f(p.x), cy: f(p.y), r: f(r * 0.48), fill: rgba(c, dashed ? 0.38 : 0.58) }));
      L.nodes.append(g);
      // marks: important (pin) and possible contradiction (warning) — never colour alone
      const mk = s('g', { opacity: f(dim.has(n.id) ? 0.4 : 1) });
      if (n.pinned && !p.noMarks) {
        const a = -2.35, px = p.x + Math.cos(a) * (r + 3), py = p.y + Math.sin(a) * (r + 3);
        mk.append(s('path', { d: `M${f(px + 3)},${f(py + 3)} L${f(px)},${f(py)}`, stroke: '#8a7230', 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
        mk.append(s('circle', { cx: f(px - 1.5), cy: f(py - 1.5), r: 4.3, fill: '#b8a26b', stroke: '#fffdf8', 'stroke-width': 1.2 }));
        mk.append(s('circle', { cx: f(px - 1.5), cy: f(py - 1.5), r: 3.2, fill: 'none', stroke: '#8a7230', 'stroke-width': 0.9 }));
      }
      if (n.warn && !p.noMarks) {
        const a = -0.75, wx = p.x + Math.cos(a) * (r + 5), wy = p.y + Math.sin(a) * (r + 5);
        mk.append(s('path', { d: `M${f(wx)},${f(wy - 7)} L${f(wx + 7)},${f(wy + 5.2)} L${f(wx - 7)},${f(wy + 5.2)} Z`, fill: '#9c5b3c', stroke: '#fffdf8', 'stroke-width': 1.4, 'stroke-linejoin': 'round' }));
        mk.append(s('path', { d: `M${f(wx)},${f(wy - 2.3)} L${f(wx)},${f(wy + 1.2)} M${f(wx)},${f(wy + 3.3)} L${f(wx)},${f(wy + 3.5)}`, stroke: '#fffdf8', 'stroke-width': 1.5, 'stroke-linecap': 'round' }));
      }
      L.marks.append(mk);
    }

    // words for memories: most important first, placed where they collide with nothing — else left out
    const order = Object.values(pos).filter((p) => p.label).sort((a, b) => (b.must ? 1 : 0) - (a.must ? 1 : 0) || (b.prio ?? b.n.imp) - (a.prio ?? a.n.imp));
    for (const p of order) {
      const n = p.n;
      const fs = p.fs || (p.big ? 13 : 11.5);
      const wt = p.big ? 550 : 500;
      const txt = p.text || n.label;
      const w = textW(txt, `${wt} ${fs}px Inter`);
      const kick = p.kicker ? p.kicker.toUpperCase() : null;
      const kw = kick ? textW(kick, '600 9.5px Inter') + kick.length * 0.95 : 0;
      const hh = (kick ? fs + 14 : fs + 3);
      const ww = Math.max(w, kw);
      const pad = p.r + (n.recent || p.selected ? 8 : 5);
      const cands = p.prefer || ['below', 'above', 'right', 'left'];
      const boxFor = (c) => {
        let bx, by;
        if (c === 'below') { bx = p.x - ww / 2; by = p.y + pad + 1; }
        else if (c === 'above') { bx = p.x - ww / 2; by = p.y - pad - hh - 1; }
        else if (c === 'right') { bx = p.x + pad + 4; by = p.y - hh / 2; }
        else { bx = p.x - pad - 4 - ww; by = p.y - hh / 2; }
        return { c, bx, by, box: { x: bx - 3, y: by - 2, w: ww + 6, h: hh + 4 } };
      };
      let chosen = null;
      for (const c of cands) { const t = boxFor(c); if (inside(t.box) && !hit(t.box)) { chosen = t; break; } }
      if (!chosen && p.must) chosen = boxFor(cands[0]);
      if (!chosen) continue;
      boxes.push(chosen.box);
      const anchor = chosen.c === 'right' ? 'start' : chosen.c === 'left' ? 'end' : 'middle';
      const ax = chosen.c === 'right' ? chosen.bx : chosen.c === 'left' ? chosen.bx + ww : p.x;
      const op = (n.faded && !p.keepFull ? 0.62 : 1) * (dim.has(n.id) ? 0.42 : 1);
      const gl = s('g', { opacity: f(op) });
      let y = chosen.by + (kick ? 10 : 0);
      if (kick) gl.append(s('text', { x: f(ax), y: f(y), class: 'n-type', 'text-anchor': anchor }, kick));
      y += kick ? fs + 3.5 : fs - 1;
      const tier = sc.tiers && !p.big ? ((p.prio ?? 0) >= 2.4 ? ' t1' : (p.prio ?? 0) >= 1.3 ? ' t2' : ' t3') : '';
      gl.append(s('text', { x: f(ax), y: f(y), class: `n-label${p.big ? ' big' : ''}${tier}${n.faded && !p.keepFull ? ' faded' : ''}`, 'text-anchor': anchor, style: `font-size:${fs}px` }, txt));
      L.labels.append(gl);
    }

    // relationship words, on small plates, where there is room for them
    for (const l of elabels) {
      const w = textW(l.t, 'italic 400 12.5px "Instrument Serif"') + 14;
      const len = l.el.getTotalLength();
      let at = null;
      for (const t of l.at ? [l.at] : [0.5, 0.42, 0.58, 0.34, 0.66, 0.27, 0.73]) {
        const pt = l.el.getPointAtLength(len * t);
        const b = { x: pt.x - w / 2, y: pt.y - 10, w, h: 19 };
        if (inside(b) && !hit(b)) { at = [pt, b]; break; }
      }
      if (!at) continue;
      boxes.push(at[1]);
      const [pt] = at;
      const g = s('g');
      const stroke = l.conflict ? 'stroke:rgba(156,91,60,.45)' : l.hi ? 'stroke:rgba(184,162,107,.6)' : '';
      g.append(s('rect', { x: f(pt.x - w / 2), y: f(pt.y - 10), width: f(w), height: 19, rx: 9.5, class: 'e-pill', style: stroke }));
      g.append(s('text', { x: f(pt.x), y: f(pt.y + 4), class: 'e-label', 'text-anchor': 'middle', style: l.conflict ? 'fill:#8a4f33' : l.hi ? 'fill:#3d4a26' : '' }, l.t));
      L.labels.append(g);
    }
  }

  // ── scenes ───────────────────────────────────────────────────────
  // The desktop overview's arrangement — every other desktop view keeps to it.
  let OVERVIEW = null;
  function overviewLayout() {
    if (!OVERVIEW) OVERVIEW = atlas({ cx: 578, cy: 418, a: 396, b: 250, scale: 49, sy: 0.9 });
    return OVERVIEW;
  }
  const prioOf = (n) => (n.pinned ? 3 : 0) + (n.warn || n.status !== 'confirmed' ? 2.2 : 0) + (n.recent ? 1.4 : 0) + n.imp - (n.faded ? 1.2 : 0);

  function overviewScene(W, H) {
    const Lr = overviewLayout();
    const dirs = pullDirs(Lr);
    const regions = IDS.map((id) => ({ ...Lr[id] }));
    const pos = {};
    for (const rr of regions) for (const p of placeRegion(rr.id, rr, 1, dirs)) pos[p.n.id] = p;
    for (const p of Object.values(pos)) { p.label = true; p.prio = prioOf(p.n); }
    const avoid = [
      { x: 12, y: 10, w: 520, h: 40 }, // the hint
      { x: 14, y: H - 60, w: 672, h: 48 }, // the legend
      { x: W - 176, y: H - 60, w: 162, h: 48 }, // zoom
    ];
    return { W, H, regions, pos, bundle: true, tracts: false, tiers: true, avoid, interAlpha: 0.17, centre: Lr.identity };
  }

  // An open region: its memories with their words. The other regions keep the
  // direction they had on the overview, pushed to the edge of the view, and
  // show only the memories that connect to this one.
  const WORK_AT = {
    w2: [-10, -10, ['below', 'right']], w3: [214, -112, ['above', 'right']], w4: [238, 112, ['below', 'right']],
    w1: [-200, -132, ['above', 'left']], w5: [-218, 92, ['below', 'left']], w7: [-112, 218, ['below']], w6: [82, 214, ['below']],
  };
  function focusScene(W, H, o) {
    const rid = 'work', k = o.k;
    const cx = o.cx ?? W / 2, cy = o.cy ?? H / 2 + 8;
    const pos = {};
    for (const [id, [dx, dy, prefer]] of Object.entries(WORK_AT)) {
      const n = NODE[id];
      pos[id] = { n, x: cx + dx * k, y: cy + dy * k, r: radius(n, 1.18 * Math.max(k, 0.86)), label: true, big: true, kicker: n.type, must: true, prefer, fs: o.fs };
    }
    // the open region is named by the breadcrumb; its lobe is drawn a little stronger
    const regions = [{ id: rid, cx, cy: cy + 6 * k, R: 330 * k, sx: 1.12, sy: 0.82, label: false, strong: true }];
    const Lr = overviewLayout(), c0 = Lr[rid];
    const others = IDS.filter((id) => id !== rid).map((id) => ({ id, a: Math.atan2(Lr[id].cy - c0.cy, Lr[id].cx - c0.cx) }));
    // keep them apart around the edge
    others.sort((a, b) => a.a - b.a);
    const min = (Math.PI * 2) / others.length * 0.8;
    for (let it = 0; it < 300; it++) {
      for (let i = 0; i < others.length; i++) {
        const A = others[i], B = others[(i + 1) % others.length];
        let gap = B.a - A.a; if (i === others.length - 1) gap += Math.PI * 2;
        if (gap < min) { const p = (min - gap) / 2; A.a -= p; B.a += p; }
      }
    }
    const touches = (id, n) => M.edges.some(([a, b]) => (a === n.id && NODE[b].r === id && pos[b]) || (b === n.id && NODE[a].r === id && pos[a]));
    for (const r of others) {
      const a = r.a + (o.turn?.[r.id] ?? 0);
      const ux = Math.cos(a), uy = Math.sin(a);
      const ex = W / 2 + o.out, ey = H / 2 + o.out;
      const t = 1 / Math.pow(Math.pow(Math.abs(ux) / ex, 4) + Math.pow(Math.abs(uy) / ey, 4), 0.25);
      const lx = W / 2 + ux * t, ly = H / 2 + uy * t;
      const Rp = o.Rp;
      const ghosts = members(r.id).filter((n) => touches(rid, n));
      // the name sits toward the lobe's outer side, where no relationship runs
      const spots = [];
      for (const kk of [0.3, 0.55, 0.8, 0.95]) for (const off of [0, -60, 60, -115, 115]) spots.push([lx - ux * Rp * kk - uy * off, ly - uy * Rp * kk * 0.9 + ux * off + 4]);
      regions.push({ id: r.id, cx: lx, cy: ly, R: Rp, op: ghosts.length ? 0.85 : 0.6, lop: ghosts.length ? 1 : 0.7, short: true, spots });
      ghosts.forEach((n, i) => {
        const off = (i - (ghosts.length - 1) / 2) * o.spread;
        let gx = lx - ux * Rp * 0.52 - uy * off, gy = ly - uy * Rp * 0.52 * 0.9 + ux * off;
        // never under the page's own controls: step inward until clear
        for (let step = 0; step < 12 && (o.avoid || []).some((b) => gx > b.x - 70 && gx < b.x + b.w + 70 && gy > b.y - 40 && gy < b.y + b.h + 30); step++) { gx -= ux * 14; gy -= uy * 14; }
        pos[n.id] = { n, x: clamp(gx, 44, W - 44), y: clamp(gy, 44, H - 44), r: radius(n, 0.86), ghost: true, label: true, prio: 1 + n.imp };
      });
    }
    return { W, H, regions, pos, edgeLabels: o.edgeLabels ?? 'all', bend: 0.12, avoid: o.avoid || [], focus: rid };
  }

  // ── chrome ───────────────────────────────────────────────────────
  function topBar(view) {
    return h(`<header class="top">
      <div class="top-l">
        <button class="back" aria-label="Back to the map">${icon('back')}</button>
        <div class="title"><h1>Memory</h1><p>What Socria remembers about you</p></div>
      </div>
      <div class="top-m">
        <label class="search">${icon('search')}<span class="q">Search memories, people, sources…</span><kbd>/</kbd></label>
        <button class="chip-btn">${icon('filter')}Filters</button>
      </div>
      <div class="top-r">
        <div class="seg" role="tablist" aria-label="View">
          <button class="${view === 'network' ? 'on' : ''}" role="tab">${icon('net')}Network</button>
          <button class="${view === 'changes' ? 'on' : ''}" role="tab">${icon('clock')}Changes</button>
          <button class="${view === 'review' ? 'on' : ''}" role="tab">${icon('check')}Review <span class="badge">3</span></button>
        </div>
      </div>
    </header>`);
  }

  function glyphFor(m) {
    const c = REG[m.r].color;
    if (m.warn) return G.warn();
    if (m.status === 'proposed' || m.status === 'tentative') return G.proposed(c);
    if (m.recent) return G.recent(c);
    if (m.faded) return G.older(c);
    return G.confirmed(c);
  }

  function regionNav(opts = {}) {
    const open = opts.open, sel = opts.sel;
    const rows = M.regions.map((rg) => {
      const n = members(rg.id).length;
      const isOpen = rg.id === open;
      const ct = opts.counts ? opts.counts[rg.id] : n;
      let html = `<div class="reg${isOpen ? ' on' : ''}${opts.counts && !ct ? ' dim' : ''}" style="--c:${rg.color}">
        <span class="gl">${icon(rg.id)}</span><span class="nm">${rg.name}${opts.hints ? `<small>${rg.hint}</small>` : ''}</span><span class="ct">${ct}</span></div>`;
      if (isOpen) {
        const mems = members(rg.id).sort((a, b) => (a.faded ? 1 : 0) - (b.faded ? 1 : 0) || b.imp - a.imp);
        html += `<div class="mems">${mems.map((m) => `<div class="mem${m.id === sel ? ' on' : ''}${m.faded ? ' faded' : ''}"><span class="g">${glyphFor(m)}</span><span class="nm">${m.label}</span>${m.pinned ? `<span class="pinm">${G.pin()}</span>` : ''}</div>`).join('')}</div>`;
      }
      return html;
    }).join('');
    return h(`<aside class="nav" aria-label="Regions">
      <div class="nav-h"><span class="k">${opts.title || 'Regions'}</span><button class="fold" aria-label="Collapse">${icon('chevL', 'ico', 'width:14px;height:14px')}</button></div>
      ${rows}
      <div class="nav-foot">
        <div class="nav-link"><span style="display:flex;gap:8px;align-items:center"><span style="color:var(--gold-ink);display:grid">${icon('eye', 'ico', 'width:15px;height:15px')}</span><span>Noticed once<small>Not believed until it comes up again</small></span></span><span class="badge soft">2</span></div>
        <div class="nav-note">${icon('lock')}<span>Memories from conversations you kept private never appear here.</span></div>
      </div>
    </aside>`);
  }

  function legend(compact) {
    return h(`<div class="legend${compact ? ' compact' : ''}" aria-label="What the marks mean">
      <span>${G.confirmed()}Confirmed</span>
      <span>${G.proposed()}Proposed</span>
      <span>${G.recent()}Updated this week</span>
      <span>${G.warn()}Possible contradiction</span>
      <span>${G.older()}Older</span>
      <span>${G.pin()}Important</span>
    </div>`);
  }
  // once the marks are known, the legend folds to a single control
  const legendPill = () => h(`<button class="legend-pill" aria-label="What the marks mean">${['confirmed', 'proposed', 'recent', 'warn', 'older', 'pin'].map((k) => G[k]()).join('')}<span>What the marks mean</span></button>`);
  const zoom = () => h(`<div class="zoom"><button aria-label="Zoom out">${icon('minus')}</button><button aria-label="Zoom in">${icon('plus')}</button><i></i><button class="fit">Fit all</button></div>`);

  // ── the inspector (state 3) ──────────────────────────────────────
  const W3_LINKS = [['part of', 'w2'], ['evidence', 'w4'], ['constrained by', 'g3'], ['motivated by', 'i1'], ['bears on', 'q2']];
  function inspector() {
    const n = NODE.w3;
    const c = REG.work.color;
    return h(`<aside class="insp" aria-label="Memory">
      <div class="insp-body">
        <div class="insp-top">
          <span class="pill" style="--c:${c}"><span class="dot"></span>Decision · Projects &amp; Work</span>
          <button class="x" aria-label="Close">${icon('x')}</button>
        </div>
        <div>
          <h2>${n.label}</h2>
          <p class="says">${n.content}</p>
        </div>
        <div class="states">
          <span class="st">${G.proposed(c)}Proposed change</span>
          <span class="st">${G.recent(c)}Updated 2 days ago</span>
        </div>
        <div class="change-card">
          <div class="h"><span><b>Socria read a change</b> · 20 Oct</span><span class="kd">${icon('reword', 'ico', 'width:13px;height:13px')}Reworded</span></div>
          <div class="wasnow"><span class="lb">Was</span><span class="was">Ship onboarding v2 before the January move</span><span class="lb">Now</span><span class="now">Ship onboarding v2 in two phases</span></div>
          <div class="btns"><button class="btn primary">${icon('check', 'ico', 'width:14px;height:14px')}Confirm</button><button class="btn">Not right</button><span class="fine">Held lightly until you decide</span></div>
        </div>
        <div class="sec">
          <span class="k">Why Socria remembers this</span>
          <div class="why">
            <div class="why-row"><span class="why-ic">${icon('chat')}</span><span class="why-t">You said it in “Onboarding v2 scope”<small>Logos · 20 Oct</small></span><span class="lnk">Open ${icon('ext', 'ico', 'width:12px;height:12px')}</span></div>
            <div class="why-row"><span class="why-ic">${icon('file')}</span><span class="why-t">Backed by onboarding-funnel-q3.csv<small>Your file · the 38% at step 3</small></span><span class="lnk">View ${icon('ext', 'ico', 'width:12px;height:12px')}</span></div>
          </div>
        </div>
        <div class="sec">
          <span class="k">Connected to</span>
          <div class="rel">
            ${W3_LINKS.map(([via, id]) => `<div class="rel-row"><span class="via">${via}</span><span class="to" style="--c:${REG[NODE[id].r].color}"><span class="dot"></span>${NODE[id].label}</span></div>`).join('')}
          </div>
        </div>
        <div class="sec">
          <span class="k">History</span>
          <div class="hist">
            <div class="hist-row"><span class="d">20 Oct</span><span class="rail"><i class="dash"></i></span><span class="t">Reworded — waiting for you<small>Read in “Onboarding v2 scope” · Logos</small></span></div>
            <div class="hist-row"><span class="d">13 Oct</span><span class="rail"><i></i></span><span class="t">First remembered<small>You said it in “Monday check-in” · Core</small></span></div>
          </div>
        </div>
      </div>
      <div class="insp-foot">
        <button class="btn">${icon('pencil', 'ico', 'width:14px;height:14px')}Edit</button>
        <button class="btn">This isn’t right</button>
        <span class="sp"></span>
        <button class="btn quiet danger">${icon('trash', 'ico', 'width:14px;height:14px')}Forget</button>
      </div>
    </aside>`);
  }

  // ── Changes (state 4) ────────────────────────────────────────────
  const CHANGES = [
    { m: 'October', d: '21 Oct', kind: 'Changed position', ic: 'swap', rv: 'prop', from: ['Belief', 'Remote work suits me'], to: ['Preference', 'A shared studio desk in Lisbon'], note: '“I don’t want to spend the whole year at a kitchen table.”', src: 'Monday check-in · Core', reach: ['i4'] },
    { d: '20 Oct', kind: 'Reworded', ic: 'reword', rv: 'prop', on: true, from: ['Decision', 'Ship onboarding v2 before the January move'], to: ['Decision', 'Ship onboarding v2 in two phases'], note: '“Phase two can wait until February.”', src: 'Onboarding v2 scope · Logos', reach: ['w2', 'q2'] },
    { d: '19 Oct', kind: 'Possible contradiction', ic: 'tension', rv: 'warn', from: ['Preference · since March', 'Works best in the morning'], to: ['Preference · 19 Oct', 'Best work late at night lately'], note: 'Both say when you focus best — and they disagree.', src: 'Late-night sprint · Logos', reach: ['f3'] },
    { m: 'September', d: '22 Sep', kind: 'Changed position', ic: 'swap', rv: 'ok', rvt: 'Confirmed by you', from: ['Decision', 'Considering the Northwind offer'], to: ['Decision', 'Turned down the agency offer'], note: '“Staying at Tidewater through the move.”', src: 'Freelance or stay? · Logos', reach: [] },
    { d: '18 Sep', kind: 'Reworded', ic: 'reword', rv: 'ok', rvt: 'Confirmed by you', from: ['Goal', 'Run a 10K this spring'], to: ['Goal', 'Run the Lisbon half marathon'], note: '', src: 'Half marathon plan · Logos', reach: [] },
    { m: 'March', d: '4 Mar', kind: 'Changed position', ic: 'swap', rv: 'ok', rvt: 'Confirmed by you', from: ['Plan', 'Move to Berlin'], to: ['Plan', 'Move to Lisbon in January'], note: '“The visa route was simpler, and the Lisbon team is there.”', src: 'Lisbon or Berlin? · Logos', reach: ['g2', 'r3', 'r1'] },
  ];
  function changeCard(c, compact) {
    const rv = c.rv === 'prop' ? `<span class="rv prop">${G.proposed().replace('<svg', '<svg width="12" height="12"')}Proposed · waiting for you</span>` : c.rv === 'warn' ? `<span class="rv warn">${G.warn().replace('<svg', '<svg width="12" height="12"')}Possible contradiction · waiting for you</span>` : `<span class="rv ok">${icon('check', 'ico', 'width:12px;height:12px')}${c.rvt}</span>`;
    const reach = c.reach.length ? `<div class="reach">Reached ${c.reach.length === 1 ? 'one memory' : `${c.reach.length} memories`}:${c.reach.map((id) => `<span class="rchip" style="--c:${REG[NODE[id].r].color}"><span class="dot"></span>${NODE[id].label}</span>`).join('')}</div>` : '';
    return `<div class="ch${c.on ? ' on' : ''}">
      <div class="ch-h"><span class="kind">${icon(c.ic)}${c.kind}</span>${rv}<span class="src">${c.src}</span></div>
      <div class="ft"><div class="m old"><small>${c.from[0]}</small>${c.from[1]}</div><span class="ar">${icon('chevR')}</span><div class="m"><small>${c.to[0]}</small>${c.to[1]}</div></div>
      ${c.note ? `<div class="note">${c.note}</div>` : ''}
      ${compact ? '' : reach}
    </div>`;
  }

  // a few memories, placed by hand, drawn by the same engine
  function miniScene(W, H, layout, o = {}) {
    const pos = {};
    for (const [id, x, y, extra] of layout) { const n = NODE[id]; pos[id] = { n, x, y, r: radius(n, 1.15), label: true, must: true, ...(extra || {}) }; }
    if (o.selected) pos[o.selected].selected = true;
    return { W, H, regions: [], pos, hiEdges: new Set(o.hi || []), edgeLabels: o.edgeLabels ?? 'hi', bend: o.bend ?? 0.14, labelAt: o.labelAt, pulseAt: o.pulseAt, dim: new Set(o.dim || []) };
  }

  // ── desktop screens ──────────────────────────────────────────────
  function canvasWith(app, label) {
    const cv = h(`<main class="canvas" aria-label="${label}"></main>`);
    const svg = s('svg', { class: 'net', role: 'img', 'aria-label': label });
    cv.append(svg);
    app.append(cv);
    return { cv, svg };
  }
  // the page's own controls float over the canvas: nothing is drawn beneath them
  function overlays(cv) {
    const c = cv.getBoundingClientRect();
    return [...cv.querySelectorAll('.crumb, .hint, .legend, .legend-pill, .zoom')].map((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left - c.left - 8, y: r.top - c.top - 6, w: r.width + 16, h: r.height + 12 };
    });
  }
  function desktop() {
    const app = h('<div class="app"></div>');
    const view = state === 4 ? 'changes' : state === 5 ? 'review' : 'network';
    app.append(topBar(view));
    if (state === 1) {
      app.append(regionNav({ hints: true }));
      const { cv, svg } = canvasWith(app, '39 memories in 8 regions');
      cv.append(h(`<p class="hint">Select a region to open it — or any memory to see why Socria keeps it</p>`));
      cv.append(legend(), zoom());
      document.body.append(app);
      const r = cv.getBoundingClientRect();
      const sc = overviewScene(r.width, r.height);
      sc.avoid = overlays(cv);
      drawScene(svg, sc);
      return;
    }
    if (state === 2 || state === 3) {
      app.append(regionNav({ open: 'work', sel: state === 3 ? 'w3' : null, hints: true }));
      const { cv, svg } = canvasWith(app, 'Projects and Work');
      cv.append(h(`<div class="crumb">${icon('net', 'ico', 'width:14px;height:14px')}<span>All regions</span><span class="sep">›</span><b>Projects &amp; Work</b><span class="sep">·</span><span>7 memories · ${M.edges.filter(([a, b]) => (NODE[a].r === 'work') !== (NODE[b].r === 'work')).length} links to other regions</span></div>`));
      cv.append(legendPill(), zoom());
      if (state === 3) app.append(inspector());
      document.body.append(app);
      const r = cv.getBoundingClientRect();
      const W = r.width, H = r.height;
      if (state === 2) {
        drawScene(svg, focusScene(W, H, { k: 1, out: 18, Rp: 150, spread: 80, avoid: overlays(cv) }));
      } else {
        const sc = focusScene(W, H, { k: 0.72, out: 14, Rp: 128, spread: 64, avoid: overlays(cv), edgeLabels: 'hi', cy: H / 2 + 4, fs: 12.5 });
        sc.pos.w3.selected = true;
        sc.hiEdges = new Set(['w3>w2', 'w4>w3', 'w3>g3', 'w3>i1', 'q2>w3']);
        const near = new Set(['w3', 'w2', 'w4', 'g3', 'i1', 'q2']);
        sc.dim = new Set(Object.keys(sc.pos).filter((id) => !near.has(id)));
        drawScene(svg, sc);
      }
      return;
    }
    if (state === 4) {
      const counts = { identity: 1, goals: 2, work: 2, learning: 0, people: 0, prefs: 2, recent: 0, questions: 0 };
      app.append(regionNav({ counts, title: 'Changes by region' }));
      let lastM = null;
      const rows = CHANGES.map((c) => {
        const head = c.m && c.m !== lastM ? `<div class="month">${c.m} 2026</div>` : '';
        if (c.m) lastM = c.m;
        const dot = c.rv === 'prop' ? 'dash' : c.rv === 'warn' ? 'dash warn' : '';
        return `${head}<div class="tl-row"><span class="d">${c.d}</span><span class="rail"><i class="${dot}"></i></span>${changeCard(c, !c.on && c.rv === 'ok')}</div>`;
      }).join('');
      app.append(h(`<main class="col">
        <div class="col-h"><h2>How your memory changed</h2><p>Every change Socria read from a conversation, and every one you made. Proposed changes wait for you — nothing settles until you say so.</p></div>
        <div class="filters"><span class="fchip on">All changes</span><span class="fchip">Waiting for you <span class="badge soft">3</span></span><span class="fchip">Confirmed</span><span class="fchip">Changed position</span><span class="fchip">Reworded</span><span class="fchip">Contradictions</span></div>
        <div class="tl">${rows}</div>
      </main>`));
      const side = h(`<aside class="side">
        <span class="k">In the network</span>
        <h3>Ship onboarding v2 in two phases</h3>
        <p>When a memory changes, what rests on it lights for a moment — so you can see how far a change reaches.</p>
        <div class="mini" style="height:286px"><svg></svg></div>
        <div class="sec" style="gap:10px">
          <span class="k">This memory’s history</span>
          <div class="hist">
            <div class="hist-row"><span class="d">20 Oct</span><span class="rail"><i class="dash"></i></span><span class="t">Reworded — waiting for you<small>Read in “Onboarding v2 scope” · Logos</small></span></div>
            <div class="hist-row"><span class="d">13 Oct</span><span class="rail"><i></i></span><span class="t">First remembered<small>You said it in “Monday check-in” · Core</small></span></div>
          </div>
        </div>
        <div class="sec" style="gap:8px">
          <span class="k">What your answer does</span>
          <div class="hist">
            <div class="hist-row three"><span style="color:var(--primary)">${icon('check', 'ico', 'width:14px;height:14px')}</span><span class="t"><b>Confirm</b> — the new wording stands; the old one stays in this history</span></div>
            <div class="hist-row three"><span style="color:var(--ink-45)">${icon('back', 'ico', 'width:14px;height:14px')}</span><span class="t"><b>Not right</b> — Socria puts back “Ship onboarding v2 before the January move”</span></div>
          </div>
        </div>
        <div class="btns" style="margin-top:auto"><button class="btn primary" style="flex:1">${icon('check', 'ico', 'width:14px;height:14px')}Confirm change</button><button class="btn" style="flex:1">Not right</button></div>
      </aside>`);
      app.append(side);
      document.body.append(app);
      const box = side.querySelector('.mini');
      const r = box.getBoundingClientRect();
      drawScene(box.querySelector('svg'), miniScene(r.width, r.height, [
        ['w3', 172, 128, { big: true, prefer: ['below'] }],
        ['w2', 76, 58, { prefer: ['above'] }],
        ['q2', 262, 58, { prefer: ['above'] }],
        ['i1', 60, 222, { prefer: ['below'], fs: 10.5 }],
        ['w4', 166, 238, { prefer: ['below'], fs: 10.5 }],
        ['g3', 268, 214, { prefer: ['below'], fs: 10.5 }],
      ], { selected: 'w3', hi: ['w3>w2', 'q2>w3'], edgeLabels: new Set(['w3>w2', 'q2>w3']), pulseAt: 0.5, dim: ['i1', 'w4', 'g3'] }));
      return;
    }
    if (state === 5) {
      const counts = { identity: 1, goals: 0, work: 1, learning: 0, people: 0, prefs: 2, recent: 0, questions: 0 };
      app.append(regionNav({ counts, title: 'To review, by region' }));
      app.append(h(`<main class="col">
        <div class="col-h"><h2>Review</h2><p>Socria holds these lightly until you decide. Confirm what is right, reject what isn’t — rejecting puts back exactly what was there.</p></div>
        <div class="rq on">
          <div class="rq-h"><span class="kind" style="color:var(--tension)">${G.warn().replace('<svg', '<svg width="15" height="15"')}Possible contradiction</span><span class="rv warn">Found by Socria · 19 Oct</span></div>
          <div class="vs">
            <div class="m"><small class="cap">Preference · since March</small><b>Works best in the morning</b><span>Deep work before noon; meetings after.</span><small>You said it in 6 conversations · first in “Monday check-in”</small></div>
            <div class="mid">vs</div>
            <div class="m dash"><small class="cap">Preference · 19 Oct · proposed</small><b>Best work late at night lately</b><span>The last three sprints happened after 10 pm.</span><small>You said it in “Late-night sprint” · Logos</small></div>
          </div>
          <div class="btns"><button class="btn primary">It changed — keep the newer</button><button class="btn">Both are true</button><button class="btn quiet">Forget the newer one</button></div>
        </div>
        <div class="rq">
          <div class="rq-h"><span class="kind">${icon('reword')}Reworded</span><span class="rv prop">Proposed · 20 Oct</span><span class="src">Onboarding v2 scope · Logos</span></div>
          <div class="ft"><div class="m old"><small>Decision · was</small>Ship onboarding v2 before the January move</div><span class="ar">${icon('chevR')}</span><div class="m"><small>Decision · now</small>Ship onboarding v2 in two phases</div></div>
          <div class="btns"><button class="btn primary">${icon('check', 'ico', 'width:14px;height:14px')}Confirm</button><button class="btn">Not right</button></div>
        </div>
        <div class="rq">
          <div class="rq-h"><span class="kind">${icon('swap')}Changed position</span><span class="rv prop">Proposed · 21 Oct</span><span class="src">Monday check-in · Core</span></div>
          <div class="ft"><div class="m old"><small>Belief · was</small>Remote work suits me</div><span class="ar">${icon('chevR')}</span><div class="m"><small>Preference · now</small>A shared studio desk in Lisbon</div></div>
          <div class="btns"><button class="btn primary">${icon('check', 'ico', 'width:14px;height:14px')}Confirm</button><button class="btn">Not right</button></div>
        </div>
        <div class="sec" style="gap:10px">
          <span class="k">Noticed once — not believed yet</span>
          <div class="once">
            <div class="once-row"><span style="color:var(--gold-ink);display:grid">${icon('eye', 'ico', 'width:16px;height:16px')}</span><span class="t">Gets restless in long meetings<small>Noticed in “Offsite recap” · 10 Sep. Socria believes it only if it comes up again.</small></span><button class="btn quiet">Dismiss</button></div>
            <div class="once-row"><span style="color:var(--gold-ink);display:grid">${icon('eye', 'ico', 'width:16px;height:16px')}</span><span class="t">Prefers working from cafés<small>Noticed in “Late-night sprint” · 19 Oct</small></span><button class="btn quiet">Dismiss</button></div>
          </div>
        </div>
      </main>`));
      const side = h(`<aside class="side">
        <span class="k">In the network</span>
        <h3>Two preferences that disagree</h3>
        <p>What each one rests on stays in view, so you can decide with the whole picture.</p>
        <div class="mini" style="height:244px"><svg></svg></div>
        <div class="sec" style="gap:8px">
          <span class="k">What each choice does</span>
          <div class="hist">
            <div class="hist-row three"><span style="color:var(--primary)">${icon('check', 'ico', 'width:14px;height:14px')}</span><span class="t"><b>It changed</b> — the morning one becomes an earlier position, kept as history</span></div>
            <div class="hist-row three"><span style="color:var(--ink-45)">${icon('swap', 'ico', 'width:14px;height:14px')}</span><span class="t"><b>Both are true</b> — Socria keeps both and stops asking</span></div>
            <div class="hist-row three"><span style="color:var(--tension)">${icon('trash', 'ico', 'width:14px;height:14px')}</span><span class="t"><b>Forget</b> — the late-night one is removed, and not learned again</span></div>
          </div>
        </div>
        <div class="sec" style="gap:8px">
          <span class="k">Where each came from</span>
          <div class="why">
            <div class="why-row"><span class="why-ic">${icon('chat')}</span><span class="why-t">Works best in the morning<small>6 conversations since March · first in “Monday check-in”</small></span><span class="lnk">Open ${icon('ext', 'ico', 'width:12px;height:12px')}</span></div>
            <div class="why-row"><span class="why-ic">${icon('chat')}</span><span class="why-t">Best work late at night lately<small>“Late-night sprint” · Logos · 19 Oct</small></span><span class="lnk">Open ${icon('ext', 'ico', 'width:12px;height:12px')}</span></div>
          </div>
        </div>
      </aside>`);
      app.append(side);
      document.body.append(app);
      const box = side.querySelector('.mini');
      const r = box.getBoundingClientRect();
      drawScene(box.querySelector('svg'), miniScene(r.width, r.height, [
        ['f1', 84, 74, { prefer: ['below'], fs: 11 }], ['f2', 260, 74, { prefer: ['below'], fs: 11 }],
        ['f3', 84, 182, { prefer: ['below'], fs: 11 }], ['w2', 260, 182, { prefer: ['below'], fs: 11 }],
      ], { hi: ['f1>f2'], edgeLabels: new Set(['f1>f2', 'f3>f1', 'f2>w2']), labelAt: { 'f1>f2': 0.5 } }));
    }
  }

  // ── mobile screens ───────────────────────────────────────────────
  const statusBar = () => `<div class="ph-status"><span>9:41</span><span class="r">${icon('wifi', 'ico', 'width:16px;height:16px')}<svg width="24" height="12" viewBox="0 0 24 12"><rect x=".5" y=".5" width="20" height="11" rx="3" fill="none" stroke="currentColor" opacity=".45"/><rect x="2" y="2" width="15" height="8" rx="1.6" fill="currentColor"/><rect x="21.5" y="4" width="1.6" height="4" rx=".8" fill="currentColor" opacity=".45"/></svg></span></div>`;
  function phTop(title, sub, right) {
    return `<div class="ph-top"><button class="ib" aria-label="Back">${icon('back')}</button><h1>${title}<small>${sub}</small></h1>${right || `<button class="ib" aria-label="Search">${icon('search')}</button>`}</div>`;
  }
  const phSeg = (view) => `<div class="ph-seg"><div class="seg"><button class="${view === 'network' ? 'on' : ''}">Network</button><button class="${view === 'changes' ? 'on' : ''}">Changes</button><button class="${view === 'review' ? 'on' : ''}">Review <span class="badge">3</span></button></div></div>`;

  function phOverviewScene(W, H) {
    // the desktop atlas folded to fit a phone: the same neighbours, two abreast
    const u = (H - 120) / 572;
    const at = { goals: [210, 64], recent: [90, 152], questions: [300, 152], identity: [195, 272], learning: [86, 392], work: [298, 392], prefs: [120, 506], people: [286, 514] };
    const Lr = {};
    for (const id of IDS) {
      const [x, y] = at[id];
      Lr[id] = { id, cx: (x / 390) * W, cy: y * u, R: 25.5 * Math.sqrt(members(id).length), sy: 0.9, centre: id === 'identity', uy: id === 'prefs' || id === 'people' ? 1 : -1 };
    }
    const review = { prefs: '2 to review', work: '1 to review', identity: '1 to review' };
    const regions = IDS.map((id) => ({ ...Lr[id], inner: { name: REG[id].short || REG[id].name, sub: String(members(id).length), review: review[id] } }));
    const pos = {};
    for (const rr of regions) {
      // the cells keep clear of the name, which is what a thumb aims for
      const hole = { w: textW(rr.inner.name, '600 12px Inter') + 6, h: 32, dy: 2 };
      for (const p of placeRegion(rr.id, rr, 0.5, null, { gap: 22, fill: 0.86, hole })) pos[p.n.id] = { ...p, r: 2.8 + 3.6 * p.n.imp, noDend: true, label: false };
    }
    // at this distance only the strongest bundles show; the rest appear on zooming in
    return { W, H, regions, pos, tracts: true, tractMin: 2, fibres: false, intra: false, tractW: 4, tractK: 2.6, portK: 0.7, centre: Lr.identity, clear: 16 };
  }
  function phFocusScene(W, H, o) {
    const cx = W / 2, cy = o.cy ?? H / 2;
    const k = o.k;
    const pos = {};
    const put = (id, dx, dy, extra = {}) => { const n = NODE[id]; pos[id] = { n, x: cx + dx * k, y: cy + dy * k, r: radius(n, o.rk ?? 1), label: true, must: true, fs: 11.5, ...extra }; };
    for (const [id, [dx, dy, prefer]] of Object.entries(o.at)) put(id, dx, dy, { prefer, ...(o.extra?.[id] || {}) });
    const regions = [{ id: 'work', cx, cy: cy + 8, R: 250 * k, sx: 1.16, sy: 0.98, label: false }];
    return { W, H, regions, pos, edgeLabels: false, bend: 0.12 };
  }

  function mobile() {
    const ph = h('<div class="ph"></div>');
    if (state === 1) {
      ph.innerHTML = `${statusBar()}${phTop('Memory', '39 memories · 8 regions')}${phSeg('network')}<div class="ph-net"><svg role="img" aria-label="Memory network"></svg><p class="ph-hint">Pinch to zoom · tap a region to open it</p>
        <div class="ph-fab"><button class="on">${icon('net')}Network</button><button>${icon('list')}List</button><button>${icon('filter')}Filters</button></div></div>`;
      document.body.append(ph);
      const box = ph.querySelector('.ph-net');
      const r = box.getBoundingClientRect();
      drawScene(box.querySelector('svg'), phOverviewScene(r.width, r.height));
      return;
    }
    if (state === 2 || state === 3) {
      const sel = state === 3;
      const netH = sel ? 244 : 372;
      ph.innerHTML = `${statusBar()}${phTop('Projects &amp; Work', sel ? '1 selected · 5 connections' : `7 memories · ${M.edges.filter(([a, b]) => (NODE[a].r === 'work') !== (NODE[b].r === 'work')).length} links out`, `<button class="ib" aria-label="List">${icon('list')}</button>`)}
        <div class="ph-net" style="flex:none;height:${netH}px"><svg role="img"></svg></div>`;
      const sheetTop = 44 + 52 + netH - 22;
      if (!sel) {
        const mems = members('work').sort((a, b) => (a.faded ? 1 : 0) - (b.faded ? 1 : 0) || b.imp - a.imp);
        ph.append(h(`<div class="sheet" style="top:${sheetTop}px">
          <div class="grab"></div>
          <div class="sheet-body" style="gap:4px">
            <label class="msearch">${icon('search')}Search Projects &amp; Work</label>
            <div class="mchips"><span class="fchip on">All 7</span><span class="fchip">Waiting 1</span><span class="fchip">This week 2</span><span class="fchip">Important 1</span></div>
            ${mems.slice(0, 5).map((m) => `<div class="mrow${m.faded ? ' faded' : ''}"><span class="g">${glyphFor(m).replace('<svg', '<svg width="18" height="18"')}</span><span class="t">${m.label}<small>${m.type} · ${m.status === 'proposed' ? 'proposed change' : m.recent ? 'updated this week' : `since ${m.when}`}</small></span><span class="mk">${m.pinned ? G.pin().replace('<svg', '<svg width="15" height="15"') : ''}${icon('chevR', 'ico', 'width:15px;height:15px')}</span></div>`).join('')}
          </div></div>`));
      } else {
        const c = REG.work.color;
        ph.append(h(`<div class="sheet" style="top:${sheetTop}px">
          <div class="grab"></div>
          <div class="sheet-body" style="gap:11px">
            <div class="insp-top"><span class="pill" style="--c:${c}"><span class="dot"></span>Decision · Projects &amp; Work</span><button class="x" aria-label="Close">${icon('x')}</button></div>
            <div><h2 class="mh2">Ship onboarding v2 in two phases</h2><p class="says">Phase one before the move; phase two from Lisbon in February.</p></div>
            <div class="states"><span class="st">${G.proposed(c)}Proposed change</span><span class="st">${G.recent(c)}Updated 2 days ago</span></div>
            <div class="change-card">
              <div class="h"><span><b>Socria read a change</b> · 20 Oct</span></div>
              <div class="wasnow"><span class="lb">Was</span><span class="was">Ship onboarding v2 before the January move</span><span class="lb">Now</span><span class="now">Ship onboarding v2 in two phases</span></div>
              <div class="btns"><button class="btn primary" style="flex:1;height:42px">${icon('check', 'ico', 'width:14px;height:14px')}Confirm</button><button class="btn" style="flex:1;height:42px">Not right</button></div>
            </div>
            <div class="sec" style="gap:6px"><span class="k">Why Socria remembers this</span>
              <div class="why-row"><span class="why-ic">${icon('chat')}</span><span class="why-t">You said it in “Onboarding v2 scope”<small>Logos · 20 Oct</small></span><span class="lnk">Open</span></div></div>
            <div class="sec" style="gap:2px"><span class="k" style="margin-bottom:4px">Connected to</span>
              ${W3_LINKS.slice(0, 3).map(([via, id]) => `<div class="rel-row" style="grid-template-columns:104px minmax(0,1fr)"><span class="via">${via}</span><span class="to" style="--c:${REG[NODE[id].r].color}"><span class="dot"></span>${NODE[id].label}</span></div>`).join('')}
            </div>
          </div>
          <div class="sheet-foot"><button class="btn">${icon('pencil', 'ico', 'width:15px;height:15px')}Edit</button><button class="btn">Not right</button><button class="btn danger">${icon('trash', 'ico', 'width:15px;height:15px')}Forget</button></div>
        </div>`));
      }
      document.body.append(ph);
      const box = ph.querySelector('.ph-net');
      const r = box.getBoundingClientRect();
      if (!sel) {
        const sc = phFocusScene(r.width, r.height, {
          k: 0.6, cy: r.height / 2 - 14, rk: 1,
          at: { w2: [-6, -14, ['below']], w3: [158, -168, ['below', 'left']], w4: [176, 112, ['below', 'left']], w1: [-176, -162, ['below', 'right']], w5: [-178, 96, ['below']], w7: [-74, 232, ['below']], w6: [124, 232, ['below']] },
          extra: { w2: { big: true, fs: 12.5 }, w7: { fs: 11 }, w6: { fs: 11 } },
        });
        drawScene(box.querySelector('svg'), sc);
      } else {
        const sc = phFocusScene(r.width, r.height, {
          k: 0.62, cy: r.height / 2 - 6, rk: 1,
          at: { w3: [12, -88, ['above']], w2: [-196, 40, ['below']], w4: [208, 58, ['below']], w1: [-226, -150, ['below']], w5: [-120, 196, ['below']], w7: [10, 250, ['below']], w6: [150, 220, ['below']] },
          extra: { w3: { big: true, fs: 12.5 } },
        });
        sc.pos.w3.selected = true;
        sc.hiEdges = new Set(['w3>w2', 'w4>w3']);
        sc.dim = new Set(['w1', 'w5', 'w7', 'w6']);
        for (const id of sc.dim) sc.pos[id].label = false;
        drawScene(box.querySelector('svg'), sc);
      }
      return;
    }
    if (state === 4) {
      ph.innerHTML = `${statusBar()}${phTop('Memory', 'How it changed')}${phSeg('changes')}
        <div class="ph-scroll">
          <div class="filters mfilters"><span class="fchip on">All</span><span class="fchip">Waiting <span class="badge soft">3</span></span><span class="fchip">Confirmed</span><span class="fchip">Reworded</span></div>
          <div class="month" style="padding:2px 0 0">October</div>
          ${CHANGES.slice(1, 3).map((c) => mChange(c)).join('')}
          ${mChange(CHANGES[0], true)}
        </div>`;
      document.body.append(ph);
      return;
    }
    if (state === 5) {
      ph.innerHTML = `${statusBar()}${phTop('Memory', '3 to review · 2 noticed once')}${phSeg('review')}
        <div class="ph-scroll">
          <div class="mcard warnc">
            <span class="kind" style="color:var(--tension);font-size:12.5px">${G.warn().replace('<svg', '<svg width="15" height="15"')}Possible contradiction</span>
            <div class="mvs"><small>Preference · since March</small><b>Works best in the morning</b><span>Said in 6 conversations</span></div>
            <div class="mvs-mid">vs</div>
            <div class="mvs dash"><small>Preference · 19 Oct · proposed</small><b>Best work late at night lately</b><span>Said in “Late-night sprint”</span></div>
            <button class="btn primary" style="height:42px">It changed — keep the newer</button>
            <div class="btns"><button class="btn" style="flex:1;height:40px">Both are true</button><button class="btn quiet" style="flex:1;height:40px">Forget the newer</button></div>
          </div>
          <div class="mcard">
            <div style="display:flex;align-items:center;gap:8px"><span class="kind">${icon('reword')}Reworded</span><span class="rv prop">Proposed · 20 Oct</span></div>
            <div class="mwas">Ship onboarding v2 before the January move</div>
            <div class="mnow">Ship onboarding v2 in two phases</div>
            <div class="btns"><button class="btn primary" style="flex:1;height:40px">${icon('check', 'ico', 'width:14px;height:14px')}Confirm</button><button class="btn" style="flex:1;height:40px">Not right</button></div>
          </div>
          <div class="k" style="padding:4px 2px 0">Noticed once — not believed yet</div>
          <div class="once">
            <div class="once-row"><span style="color:var(--gold-ink);display:grid">${icon('eye', 'ico', 'width:16px;height:16px')}</span><span class="t">Gets restless in long meetings<small>“Offsite recap” · 10 Sep</small></span><button class="btn quiet">Dismiss</button></div>
          </div>
        </div>`;
      document.body.append(ph);
    }
  }
  function mChange(c, partial) {
    const rv = c.rv === 'prop' ? `<span class="rv prop">Proposed</span>` : c.rv === 'warn' ? `<span class="rv warn">Possible contradiction</span>` : `<span class="rv ok">Confirmed</span>`;
    return `<div class="mcard">
      <div style="display:flex;align-items:center;gap:8px"><span class="kind">${icon(c.ic)}${c.kind}</span><span style="margin-left:auto;font-size:12px;color:var(--ink-45)">${c.d}</span></div>
      <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">${rv}<span style="font-size:11.5px;color:var(--ink-45)">${c.src}</span></div>
      <div class="${c.rv === 'warn' ? 'mold' : 'mwas'}">${c.from[1]}</div>
      <div class="mnow">${c.rv === 'warn' ? '<span class="vsw">vs </span>' : ''}${c.to[1]}</div>
      ${c.note ? `<div class="note" style="font-size:14px">${c.note}</div>` : ''}
      ${c.reach.length && !partial ? `<div class="reach">Reached:${c.reach.map((id) => `<span class="rchip" style="--c:${REG[NODE[id].r].color}"><span class="dot"></span>${NODE[id].label}</span>`).join('')}</div>` : ''}
    </div>`;
  }

  // the fonts must be in before any word is measured
  const FONTS = ['500 12px Inter', '600 12px Inter', '400 12px "Instrument Serif"', 'italic 400 12px "Instrument Serif"'];
  Promise.all(FONTS.map((x) => document.fonts.load(x))).then(() => {
    if (device === 'mobile') mobile(); else desktop();
    document.body.setAttribute('data-ready', '1');
  });
})();
