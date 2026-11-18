// lib/ux-v0/audit-source.ts — looking at the page as drawn, from inside its sandbox.
//
// SocriaUX cannot photograph the sandboxed page from outside it (it runs at an
// opaque origin, and the server has no browser), so it measures it instead:
// this script, part of the inspector, reads the page the browser actually
// laid out — every section's box and ground, every heading's size and how
// many lines it broke into, the contrast of real text on its real ground,
// targets too small to tap, images that did not load, anything wider than the
// screen, and the habits that make a page look generated (gradients, soft
// shadows, rounded boxes, letter-spaced capitals, centred everything, emoji).
// lib/ux-v0/evaluate.ts turns the measurements into findings and fixes.
//
// Plain ES5 in a string for the same reason as the inspector: it runs inside
// the frame, where no bundler helper exists. The benchmark (test/browser/
// ux-v0/benchmark.mjs) runs the very same source on real screenshots.

export const AUDIT_SOURCE = String.raw`(function () {
  'use strict';
  if (window.__uxv0Audit) return;
  function rgba(s) {
    var m = String(s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    var p = m[1].split(/[\s,\/]+/).filter(function (x) { return x !== ''; }).map(parseFloat);
    return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
  }
  function lin(c) { c = c / 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }
  function lum(c) { return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]); }
  function ratio(a, b) { var x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
  function blend(top, under) { var a = top[3]; return [top[0] * a + under[0] * (1 - a), top[1] * a + under[1] * (1 - a), top[2] * a + under[2] * (1 - a), 1]; }
  // the colour behind an element: the first opaque ground up the tree, blending translucent ones; 'image' over a picture
  function ground(el) {
    var stack = [];
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return 'image';
      if (n.classList && (n.classList.contains('hero-bleed') || n.classList.contains('scrim'))) return 'image';
      var c = rgba(cs.backgroundColor);
      if (c && c[3] > 0) { stack.push(c); if (c[3] >= 0.99) break; }
      n = n.parentElement;
    }
    var out = [255, 255, 255, 1];
    for (var i = stack.length - 1; i >= 0; i--) out = blend(stack[i], out);
    return out;
  }
  function visible(el) {
    var r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    var cs = getComputedStyle(el);
    return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05;
  }
  function ownText(el) { var s = ''; for (var i = 0; i < el.childNodes.length; i++) { var c = el.childNodes[i]; if (c.nodeType === 3) s += c.textContent; } return s.replace(/\s+/g, ' ').trim(); }
  function txt(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  function where(el) {
    var s = el.closest('[data-ux-section]');
    var p = el.closest('[data-ux-path]');
    return { section: s ? s.getAttribute('data-ux-section') || '' : '', path: p ? p.getAttribute('data-ux-path') || '' : '' };
  }
  function clipped(el) {
    var n = el.parentElement;
    while (n && n !== document.body) { var cs = getComputedStyle(n); if (/(auto|scroll|hidden|clip)/.test(cs.overflowX)) return true; n = n.parentElement; }
    return false;
  }
  window.__uxv0Audit = function () {
    var de = document.documentElement;
    var W = de.clientWidth;
    var body = document.body;
    var out = { width: W, viewport: window.innerHeight, height: Math.max(de.scrollHeight, body ? body.scrollHeight : 0), overflowX: Math.max(de.scrollWidth, body ? body.scrollWidth : 0) - W,
      bodySize: body ? parseFloat(getComputedStyle(body).fontSize) : 16,
      sections: [], headings: [], contrast: [], targets: [], images: [], overflow: [], measure: [], style: {} };
    var secs = document.querySelectorAll('.sx[data-ux-section]');
    for (var i = 0; i < secs.length && i < 40; i++) {
      var s = secs[i];
      var r = s.getBoundingClientRect();
      var cls = s.className || '';
      var g = ground(s);
      out.sections.push({ id: s.getAttribute('data-ux-section') || '', kind: ((cls.match(/\bsx-([a-z-]+)/) || [])[1]) || '', variant: ((cls.match(/\bv-([a-z-]+)/) || [])[1]) || '',
        tone: ((cls.match(/\btone-([a-z0-9]+)/) || [])[1]) || 'base', top: Math.round(r.top + window.scrollY), height: Math.round(r.height),
        ground: g === 'image' ? 'image' : 'rgb(' + g.slice(0, 3).map(Math.round).join(',') + ')', words: txt(s.innerText || '', 100000).split(' ').length });
    }
    var hs = document.querySelectorAll('h1,h2,h3');
    for (var h = 0; h < hs.length && h < 60; h++) {
      var he = hs[h];
      if (!visible(he)) continue;
      var hcs = getComputedStyle(he);
      var size = parseFloat(hcs.fontSize);
      var lh = parseFloat(hcs.lineHeight) || size * 1.2;
      var hr = he.getBoundingClientRect();
      var w = where(he);
      out.headings.push({ level: +he.tagName.slice(1), size: Math.round(size * 10) / 10, lines: Math.max(1, Math.round(hr.height / lh)), width: Math.round(hr.width), section: w.section, path: w.path, text: txt(he.textContent, 80), align: hcs.textAlign, transform: hcs.textTransform, family: hcs.fontFamily.split(',')[0].replace(/["']/g, '') });
    }
    var all = body ? body.getElementsByTagName('*') : [];
    var n = Math.min(all.length, 5000);
    var st = { gradients: 0, shadows: 0, roundedBoxes: 0, trackedCaps: 0, centred: 0, blocks: 0, emoji: 0, icons: 0, families: {} };
    var emojiRe = /[☀-➿]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF]/;
    for (var k = 0; k < n; k++) {
      var el = all[k];
      if (/^(SCRIPT|STYLE|META|LINK|BR|NOSCRIPT|TEMPLATE|svg|path|circle|rect|g|feColorMatrix|filter)$/i.test(el.tagName)) { if (el.classList && el.classList.contains('ic')) st.icons++; continue; }
      if (!visible(el)) continue;
      var cs = getComputedStyle(el);
      var rect = el.getBoundingClientRect();
      var decorative = el.closest('.scrim,.bleed-shade,.img-missing,.hero-bleed .wrap');
      if (!decorative && /gradient/.test(cs.backgroundImage)) st.gradients++;
      if (cs.boxShadow && cs.boxShadow !== 'none' && !/^(rgba?\([^)]*\) )?\d+px \d+px 0px/.test(cs.boxShadow)) st.shadows++;
      var rad = parseFloat(cs.borderTopLeftRadius) || 0;
      var boxed = (rgba(cs.backgroundColor) || [0, 0, 0, 0])[3] > 0.05 || parseFloat(cs.borderTopWidth) > 0;
      if (rad >= 12 && boxed && rect.width > 120 && rect.height > 80 && el.tagName !== 'IMG') st.roundedBoxes++;
      var own = ownText(el);
      if (own.length > 1) {
        var size = parseFloat(cs.fontSize);
        if (cs.textTransform === 'uppercase' && size < 16 && parseFloat(cs.letterSpacing) > size * 0.06) st.trackedCaps++;
        if (/^(H1|H2|H3|P|LI|DD|DT|BLOCKQUOTE|FIGCAPTION)$/.test(el.tagName) || el.parentElement && el.parentElement.tagName === 'BLOCKQUOTE') {
          st.blocks++;
          if (cs.textAlign === 'center') st.centred++;
        }
        if (emojiRe.test(own)) st.emoji++;
        var fam = cs.fontFamily.split(',')[0].replace(/["']/g, '').trim();
        st.families[fam] = (st.families[fam] || 0) + 1;
        // contrast of real text on its real ground
        var fg = rgba(cs.color);
        var bg = ground(el);
        if (fg && bg !== 'image' && out.contrast.length < 40) {
          var weight = parseInt(cs.fontWeight, 10) || 400;
          var large = size >= 24 || (size >= 18.66 && weight >= 700);
          var need = large ? 3 : 4.5;
          var rt = ratio(blend(fg, bg), bg);
          if (rt < need) { var wc = where(el); out.contrast.push({ section: wc.section, path: wc.path, ratio: Math.round(rt * 100) / 100, need: need, size: Math.round(size), text: txt(own, 50) }); }
        }
        if (el.tagName === 'P' && own.length > 120 && out.measure.length < 20) {
          var cpl = rect.width / (size * 0.5);
          if (cpl > 92) { var wm = where(el); out.measure.push({ section: wm.section, path: wm.path, cpl: Math.round(cpl) }); }
        }
      }
      if (/^(A|BUTTON|SUMMARY|INPUT|SELECT|TEXTAREA)$/.test(el.tagName) && out.targets.length < 30) {
        var inline = el.tagName === 'A' && cs.display === 'inline';
        if (!inline && (rect.height < 43.5 || rect.width < 43.5) && !(el.closest('.credits'))) { var wt = where(el); out.targets.push({ section: wt.section, path: wt.path, w: Math.round(rect.width), h: Math.round(rect.height), text: txt(el.innerText || el.getAttribute('aria-label') || '', 40) }); }
      }
      // an image still on its way (lazy, below the fold) is not a broken one: only a finished load with no pixels is
      if (el.tagName === 'IMG' && out.images.length < 40) { var wi = where(el); out.images.push({ section: wi.section, path: wi.path, ok: !(el.complete && el.naturalWidth === 0 && el.getAttribute('src')), w: Math.round(rect.width), h: Math.round(rect.height) }); }
      if ((rect.right > W + 1 || rect.left < -1) && !clipped(el) && out.overflow.length < 20) { var wo = where(el); if (!out.overflow.some(function (o) { return o.section === wo.section; })) out.overflow.push({ section: wo.section, path: wo.path, by: Math.round(Math.max(rect.right - W, -rect.left)), tag: el.tagName.toLowerCase() }); }
    }
    out.style = st;
    // whether its components work: SocriaUX's behaviour runtime tries each booking in place (lib/ux-v0/behaviors.ts)
    try { out.behaviors = window.__uxBehaviors && window.__uxBehaviors.selfTest ? window.__uxBehaviors.selfTest() : []; } catch (e) { out.behaviors = [{ index: 0, slots: 0, problems: ['the behaviour check failed: ' + String(e && e.message || e).slice(0, 80)] }]; }
    return out;
  };
})();`;
