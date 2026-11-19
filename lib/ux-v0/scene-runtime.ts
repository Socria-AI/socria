// lib/ux-v0/scene-runtime.ts — a design's 3D scene, drawn in place with WebGL.
//
// A "scene" section (lib/ux-v0/spec.ts) names an object, a material and a colour; this is SocriaUX's OWN script
// that draws it, the same for every design, added to the sandboxed frame by nonce and inlined in an exported page
// (the page's own content never carries a script). It is small on purpose: the frame is static HTML, so React
// Three Fiber cannot run there, and a whole 3D library inlined into every render of the canvas would slow the
// editor for every design to serve the few that have a scene.
//
//   objects    procedural geometry: a vessel and a bottle turned on a lathe, a sphere, a torus, a ring, a torus
//              knot, a monolith — each built in code, smooth-shaded — and a FORM: a supershape (the spherical
//              product of two superformulas) whose numbers the renderer derives from the design's own shape system,
//              twisted as much as the system is kinetic, so each design's object is its own
//   materials  matte, satin, gloss, metal: a key light, a fill, a rim, a highlight, gamma
//   camera     the object turns slowly; a pointer drag or the arrow keys turn it; the page's scroll turns it a
//              little as the section passes; a configurator on the page recolours it (the ux-config event)
//   economy    the drawing pauses while the scene is out of view; the pixel ratio is capped at 2
//   stillness  under prefers-reduced-motion nothing turns on its own; it is drawn once, still answering the hand
//   fallback   without WebGL (or without scripts, as in the direction studies) the section's drawn silhouette
//              stays: the page is complete either way
//
// window.__uxScene.selfTest() draws each scene once and reads its centre pixel back, so the audit and the
// benchmarks check that an object was really drawn, not that a canvas exists.

export const SCENE_RUNTIME = String.raw`(function () {
  'use strict';
  if (window.__uxScene) return;
  var els = Array.prototype.slice.call(document.querySelectorAll('[data-ux-scene]'));
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var report = { scenes: els.length, webgl: 0, fallback: 0, frames: 0 };
  var TAU = Math.PI * 2;

  function hex(h) {
    var rgb = /^rgba?\(\s*(\d+)[ ,]+(\d+)[ ,]+(\d+)/i.exec((h || '').trim());
    if (rgb) return [rgb[1] / 255, rgb[2] / 255, rgb[3] / 255];
    var m = /^#?([0-9a-f]{6})$/i.exec((h || '').trim());
    var n = m ? parseInt(m[1], 16) : 0x8a8a8a;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }
  // ── geometry: positions, normals, indices ──
  function mesh(pos, nor, idx) { return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) }; }
  // a turned profile, smoothed through its points (Catmull-Rom), so a vessel's shoulder is a curve, not a kink
  function smooth(pr, k) {
    var out = [];
    for (var i = 0; i < pr.length - 1; i++) {
      var p0 = pr[Math.max(0, i - 1)], p1 = pr[i], p2 = pr[i + 1], p3 = pr[Math.min(pr.length - 1, i + 2)];
      for (var j = 0; j < k; j++) {
        var t = j / k, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map(function (d) {
          return 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3);
        }));
      }
    }
    out.push(pr[pr.length - 1]);
    return out.map(function (q) { return [Math.max(0, q[0]), q[1]]; });
  }
  function lathe(profile, seg) {
    profile = smooth(profile, 6);
    var pos = [], nor = [], idx = [], n = profile.length;
    for (var i = 0; i < n; i++) {
      var a = profile[Math.max(0, i - 1)], b = profile[Math.min(n - 1, i + 1)];
      var tr = b[0] - a[0], ty = b[1] - a[1], l = Math.sqrt(tr * tr + ty * ty) || 1;
      var nr = ty / l, ny = -tr / l;
      for (var j = 0; j <= seg; j++) {
        var t = (j / seg) * TAU, c = Math.cos(t), s = Math.sin(t);
        pos.push(profile[i][0] * c, profile[i][1], profile[i][0] * s);
        nor.push(nr * c, ny, nr * s);
      }
    }
    for (i = 0; i < n - 1; i++) for (j = 0; j < seg; j++) {
      var p = i * (seg + 1) + j, q = p + seg + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    return mesh(pos, nor, idx);
  }
  function sphere(r) {
    var pr = [];
    for (var i = 0; i <= 24; i++) { var a = -Math.PI / 2 + (i / 24) * Math.PI; pr.push([Math.cos(a) * r, Math.sin(a) * r]); }
    return lathe(pr, 48);
  }
  function torus(R, r, s1, s2) {
    var pos = [], nor = [], idx = [];
    for (var i = 0; i <= s1; i++) {
      var u = (i / s1) * TAU, cu = Math.cos(u), su = Math.sin(u);
      for (var j = 0; j <= s2; j++) {
        var v = (j / s2) * TAU, cv = Math.cos(v), sv = Math.sin(v);
        pos.push((R + r * cv) * cu, r * sv, (R + r * cv) * su);
        nor.push(cv * cu, sv, cv * su);
      }
    }
    for (i = 0; i < s1; i++) for (j = 0; j < s2; j++) {
      var p = i * (s2 + 1) + j, q = p + s2 + 1;
      idx.push(p, q, p + 1, p + 1, q, q + 1);
    }
    return mesh(pos, nor, idx);
  }
  function knot(P, Q, s1, s2, r) {
    function c(t) { var k = 2 + Math.cos(Q * t); return [k * Math.cos(P * t) * 0.34, Math.sin(Q * t) * 0.34, k * Math.sin(P * t) * 0.34]; }
    function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
    function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
    function norm(a) { var l = Math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
    var pos = [], nor = [], idx = [];
    for (var i = 0; i <= s1; i++) {
      var t = (i / s1) * TAU, p0 = c(t), p1 = c(t + 0.001), p2 = c(t - 0.001);
      var T = norm(sub(p1, p0)), A = sub(sub(p1, p0), sub(p0, p2)), B = norm(cross(T, A));
      if (!isFinite(B[0])) B = [0, 1, 0];
      var N = norm(cross(B, T));
      for (var j = 0; j <= s2; j++) {
        var v = (j / s2) * TAU, cv = Math.cos(v), sv = Math.sin(v);
        var n = [cv * N[0] + sv * B[0], cv * N[1] + sv * B[1], cv * N[2] + sv * B[2]];
        pos.push(p0[0] + r * n[0], p0[1] + r * n[1], p0[2] + r * n[2]);
        nor.push(n[0], n[1], n[2]);
      }
    }
    for (i = 0; i < s1; i++) for (j = 0; j < s2; j++) {
      var a = i * (s2 + 1) + j, b = a + s2 + 1;
      idx.push(a, b, a + 1, a + 1, b, b + 1);
    }
    return mesh(pos, nor, idx);
  }
  function box(w, h, d) {
    var x = w / 2, y = h / 2, z = d / 2, pos = [], nor = [], idx = [];
    var faces = [
      [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z], [1, 0, 0]], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z], [-1, 0, 0]],
      [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z], [0, 1, 0]], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z], [0, -1, 0]],
      [[-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z], [0, 0, 1]], [[x, -y, -z], [-x, -y, -z], [-x, y, -z], [x, y, -z], [0, 0, -1]]
    ];
    faces.forEach(function (f, k) {
      for (var i = 0; i < 4; i++) { pos.push(f[i][0], f[i][1], f[i][2]); nor.push(f[4][0], f[4][1], f[4][2]); }
      var o = k * 4;
      idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
    });
    return mesh(pos, nor, idx);
  }
  // a supershape: r(θ) = (|cos(mθ/4)|^n2 + |sin(mθ/4)|^n3)^(-1/n1), one across the equator and one pole to pole,
  // its normals from its own grid; the numbers come from data-form ("m n1 n2 n3 m2 n4 n5 n6 twist")
  function sf(t, m, n1, n2, n3) {
    var v = Math.pow(Math.abs(Math.cos((m * t) / 4)), n2) + Math.pow(Math.abs(Math.sin((m * t) / 4)), n3);
    return v > 1e-9 ? Math.min(6, Math.pow(v, -1 / n1)) : 6;
  }
  function supershape(k) {
    var U = 96, Vn = 48, pts = [], max = 0, pos = [], nor = [], idx = [];
    for (var j = 0; j <= Vn; j++) {
      var phi = -Math.PI / 2 + (j / Vn) * Math.PI, r2 = sf(phi, k[4], k[5], k[6], k[7]);
      for (var i = 0; i <= U; i++) {
        var th = -Math.PI + (i / U) * TAU, r1 = sf(th, k[0], k[1], k[2], k[3]);
        var x = r1 * Math.cos(th) * r2 * Math.cos(phi), z = r1 * Math.sin(th) * r2 * Math.cos(phi), y = r2 * Math.sin(phi);
        var tw = k[8] * y;
        var p = [x * Math.cos(tw) - z * Math.sin(tw), y, x * Math.sin(tw) + z * Math.cos(tw)];
        max = Math.max(max, Math.sqrt(p[0] * p[0] + p[1] * p[1] + p[2] * p[2]));
        pts.push(p);
      }
    }
    var s = 0.98 / (max || 1);
    function at(i, j) { return pts[Math.max(0, Math.min(Vn, j)) * (U + 1) + ((i + U) % U)]; }
    for (j = 0; j <= Vn; j++) for (i = 0; i <= U; i++) {
      var a = at(i + 1, j), b = at(i - 1, j), c = at(i, j + 1), d = at(i, j - 1);
      var t1 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]], t2 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      var n = [t1[1] * t2[2] - t1[2] * t2[1], t1[2] * t2[0] - t1[0] * t2[2], t1[0] * t2[1] - t1[1] * t2[0]];
      var l = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]) || 1, q = at(i, j);
      // outward: the normal points away from the centre
      var o = n[0] * q[0] + n[1] * q[1] + n[2] * q[2] < 0 ? -1 : 1;
      pos.push(q[0] * s, q[1] * s, q[2] * s);
      nor.push((o * n[0]) / l, (o * n[1]) / l, (o * n[2]) / l);
    }
    for (j = 0; j < Vn; j++) for (i = 0; i < U; i++) {
      var p0 = j * (U + 1) + i, p1 = p0 + U + 1;
      idx.push(p0, p0 + 1, p1, p0 + 1, p1 + 1, p1);
    }
    return mesh(pos, nor, idx);
  }
  var MODELS = {
    form: function (el) {
      var k = (el && el.getAttribute('data-form') || '6 2 3 3 2 2 2 2 0').split(/\s+/).map(Number);
      return supershape(k.length === 9 && k.every(isFinite) ? k : [6, 2, 3, 3, 2, 2, 2, 2, 0]);
    },
    vessel: function () { return lathe([[0, -1], [0.5, -1], [0.6, -0.9], [0.7, -0.45], [0.68, 0.05], [0.5, 0.48], [0.3, 0.74], [0.27, 0.92], [0.33, 1]], 56); },
    bottle: function () { return lathe([[0, -1.05], [0.42, -1.05], [0.46, -0.98], [0.47, 0.25], [0.4, 0.45], [0.17, 0.62], [0.15, 0.95], [0.18, 1.05], [0, 1.05]], 56); },
    sphere: function () { return sphere(0.95); },
    torus: function () { return torus(0.72, 0.3, 64, 28); },
    ring: function () { return torus(0.85, 0.11, 72, 18); },
    knot: function () { return knot(2, 3, 220, 18, 0.16); },
    monolith: function () { return box(0.62, 1.9, 0.62); }
  };
  var MATERIALS = { matte: [6, 0.05, 0], satin: [22, 0.28, 0], gloss: [90, 0.75, 0], metal: [56, 0.95, 0.85] };

  // ── column-major matrices ──
  function persp(f, a, n, fr) { var t = 1 / Math.tan(f / 2), r = 1 / (n - fr); return [t / a, 0, 0, 0, 0, t, 0, 0, 0, 0, (fr + n) * r, -1, 0, 0, 2 * fr * n * r, 0]; }
  function mul(a, b) {
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    return o;
  }
  function rotY(t) { var c = Math.cos(t), s = Math.sin(t); return [c, 0, -s, 0, 0, 1, 0, 0, s, 0, c, 0, 0, 0, 0, 1]; }
  function rotX(t) { var c = Math.cos(t), s = Math.sin(t); return [1, 0, 0, 0, 0, c, s, 0, 0, -s, c, 0, 0, 0, 0, 1]; }
  function view(z) { return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -0.05, -z, 1]; }

  var VS = 'attribute vec3 p;attribute vec3 n;uniform mat4 m;uniform mat4 vp;varying vec3 wn;varying vec3 wp;void main(){vec4 w=m*vec4(p,1.0);wp=w.xyz;wn=mat3(m)*n;gl_Position=vp*w;}';
  var FS = 'precision mediump float;uniform vec3 col;uniform vec3 eye;uniform vec3 mat;varying vec3 wn;varying vec3 wp;' +
    'void main(){vec3 N=normalize(wn);vec3 V=normalize(eye-wp);vec3 L1=normalize(vec3(-0.55,0.85,0.75));vec3 L2=normalize(vec3(0.8,0.15,-0.55));' +
    'float d1=max(dot(N,L1),0.0);float d2=max(dot(N,L2),0.0)*0.35;vec3 H=normalize(L1+V);float s=pow(max(dot(N,H),0.0),mat.x)*mat.y;' +
    'float rim=pow(1.0-max(dot(N,V),0.0),3.0)*0.32;vec3 base=col*(0.26+0.74*d1+d2)*(1.0-mat.z*0.55);vec3 sc=mix(vec3(1.0),col,mat.z);' +
    'vec3 c=base+sc*s+rim*mix(vec3(1.0),col,0.5);gl_FragColor=vec4(pow(c,vec3(0.88)),1.0);}';

  function shader(gl, type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }

  function scene(el) {
    var canvas = el.querySelector('canvas');
    var gl = null;
    try { gl = canvas && (canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: false }) || canvas.getContext('experimental-webgl')); } catch (e) { gl = null; }
    if (!gl) { report.fallback++; return null; }
    var vs = shader(gl, gl.VERTEX_SHADER, VS), fs = shader(gl, gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) { report.fallback++; return null; }
    var prog = gl.createProgram();
    gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { report.fallback++; return null; }
    gl.useProgram(prog);
    var geo = (MODELS[el.getAttribute('data-model')] || MODELS.vessel)(el);
    function buf(target, data) { var b = gl.createBuffer(); gl.bindBuffer(target, b); gl.bufferData(target, data, gl.STATIC_DRAW); return b; }
    var bp = buf(gl.ARRAY_BUFFER, geo.pos), bn = buf(gl.ARRAY_BUFFER, geo.nor);
    buf(gl.ELEMENT_ARRAY_BUFFER, geo.idx);
    var ap = gl.getAttribLocation(prog, 'p'), an = gl.getAttribLocation(prog, 'n');
    gl.bindBuffer(gl.ARRAY_BUFFER, bp); gl.enableVertexAttribArray(ap); gl.vertexAttribPointer(ap, 3, gl.FLOAT, false, 0, 0);
    gl.bindBuffer(gl.ARRAY_BUFFER, bn); gl.enableVertexAttribArray(an); gl.vertexAttribPointer(an, 3, gl.FLOAT, false, 0, 0);
    var U = { m: gl.getUniformLocation(prog, 'm'), vp: gl.getUniformLocation(prog, 'vp'), col: gl.getUniformLocation(prog, 'col'), eye: gl.getUniformLocation(prog, 'eye'), mat: gl.getUniformLocation(prog, 'mat') };
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    // its own colour, or the page's accent as the section draws it (the silhouette's colour)
    var col = hex(el.getAttribute('data-color') || getComputedStyle(el).color);
    var mat = MATERIALS[el.getAttribute('data-material')] || MATERIALS.satin;
    var st = { yaw: 0.6, pitch: -0.18, spin: 0, scroll: 0, drag: null, visible: true, last: 0, live: false, frames: 0 };

    function size() {
      var r = canvas.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
      var w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, w, h);
      return w / h;
    }
    function draw() {
      var aspect = size();
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var model = mul(rotX(st.pitch), rotY(st.yaw + st.spin + st.scroll));
      var vp = mul(persp(0.62, aspect, 0.1, 40), view(4.6));
      gl.uniformMatrix4fv(U.m, false, new Float32Array(model));
      gl.uniformMatrix4fv(U.vp, false, new Float32Array(vp));
      gl.uniform3fv(U.col, new Float32Array(col));
      gl.uniform3fv(U.eye, new Float32Array([0, 0.05, 4.6]));
      gl.uniform3fv(U.mat, new Float32Array(mat));
      gl.drawElements(gl.TRIANGLES, geo.idx.length, gl.UNSIGNED_SHORT, 0);
      st.frames++;
      report.frames++;
    }
    function loop(t) {
      if (!st.live) return;
      if (st.visible) {
        if (st.last && !st.drag && !reduce) st.spin += Math.min(0.05, (t - st.last) / 1000) * 0.32;
        st.last = t;
        var r = el.getBoundingClientRect(), vh = window.innerHeight || 1;
        st.scroll = (Math.max(-1, Math.min(1, (r.top + r.height / 2 - vh / 2) / vh))) * -0.6;
        draw();
      } else st.last = 0;
      if (!reduce || st.drag) window.requestAnimationFrame(loop);
    }
    function start() { if (!st.live) { st.live = true; window.requestAnimationFrame(loop); } }
    // the hand: drag to turn; the keys: arrows to turn
    canvas.addEventListener('pointerdown', function (ev) { st.drag = { x: ev.clientX, y: ev.clientY, yaw: st.yaw, pitch: st.pitch }; try { canvas.setPointerCapture(ev.pointerId); } catch (e) {} if (reduce) { st.live = false; start(); } });
    canvas.addEventListener('pointermove', function (ev) {
      if (!st.drag) return;
      st.yaw = st.drag.yaw + (ev.clientX - st.drag.x) * 0.01;
      st.pitch = Math.max(-0.9, Math.min(0.9, st.drag.pitch + (ev.clientY - st.drag.y) * 0.008));
      if (reduce) draw();
    });
    function up() { st.drag = null; }
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    el.addEventListener('keydown', function (ev) {
      var k = ev.key, d = { ArrowLeft: [-0.2, 0], ArrowRight: [0.2, 0], ArrowUp: [0, -0.12], ArrowDown: [0, 0.12] }[k];
      if (!d) return;
      ev.preventDefault();
      st.yaw += d[0];
      st.pitch = Math.max(-0.9, Math.min(0.9, st.pitch + d[1]));
      draw();
    });
    // a configurator on the page recolours the object
    document.addEventListener('ux-config', function (ev) { if (ev.detail && ev.detail.swatch) { col = hex(ev.detail.swatch); draw(); } });
    if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es.forEach(function (e) { st.visible = e.isIntersecting; }); }).observe(el);
    if (window.ResizeObserver) new ResizeObserver(function () { draw(); }).observe(canvas);
    el.classList.add('sc-live');
    report.webgl++;
    draw();
    if (!reduce) start();
    return { el: el, gl: gl, draw: draw, st: st, setColor: function (h) { col = hex(h); draw(); } };
  }

  var live = els.map(scene).filter(Boolean);
  function selfTest() {
    return els.map(function (el, i) {
      var s = live.filter(function (x) { return x.el === el; })[0];
      if (!s) return { index: i, webgl: false, drawn: false, problems: ['no WebGL here: the drawn silhouette stands in'] };
      s.draw();
      var px = new Uint8Array(4);
      s.gl.readPixels(Math.floor(s.gl.drawingBufferWidth / 2), Math.floor(s.gl.drawingBufferHeight / 2), 1, 1, s.gl.RGBA, s.gl.UNSIGNED_BYTE, px);
      var drawn = px[3] > 0;
      return { index: i, webgl: true, drawn: drawn, model: el.getAttribute('data-model'), pixel: [px[0], px[1], px[2], px[3]], problems: drawn ? [] : ['nothing was drawn at the centre of the scene'] };
    });
  }
  window.__uxScene = { report: report, selfTest: selfTest, scenes: live };
})();`;
