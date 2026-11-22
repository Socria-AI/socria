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
  // a script that fails on the page is a finding, not a silence: collected from the moment the inspector runs
  // (before SocriaUX's runtimes); a picture that fails to load is an image finding, not an error here
  var errors = [];
  window.addEventListener('error', function (e) { if (errors.length < 5 && e && e.message) errors.push(String(e.message).slice(0, 120)); });
  window.addEventListener('unhandledrejection', function (e) { if (errors.length < 5) errors.push(('a promise failed: ' + String(e && e.reason && (e.reason.message || e.reason) || '')).slice(0, 120)); });
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
    var st = { gradients: 0, shadows: 0, roundedBoxes: 0, trackedCaps: 0, centred: 0, blocks: 0, emoji: 0, icons: 0, rails: 0, blurs: 0, families: {} };
    var emojiRe = /[☀-➿]|\uD83C[\uDF00-\uDFFF]|\uD83D[\uDC00-\uDE4F\uDE80-\uDEFF]|\uD83E[\uDD00-\uDDFF]/;
    for (var k = 0; k < n; k++) {
      var el = all[k];
      if (/^(SCRIPT|STYLE|META|LINK|BR|NOSCRIPT|TEMPLATE|svg|path|circle|rect|g|feColorMatrix|filter)$/i.test(el.tagName)) { if (el.classList && el.classList.contains('ic')) st.icons++; continue; }
      if (!visible(el)) continue;
      var cs = getComputedStyle(el);
      var rect = el.getBoundingClientRect();
      var decorative = el.closest('.scrim,.bleed-shade,.img-missing,.hero-bleed .wrap');
      if (!decorative && /gradient/.test(cs.backgroundImage)) st.gradients++;
      var bf = cs.backdropFilter || cs.webkitBackdropFilter || '';
      if (bf && bf !== 'none' && /blur/.test(bf)) st.blurs++;
      if (cs.boxShadow && cs.boxShadow !== 'none' && !/^(rgba?\([^)]*\) )?\d+px \d+px 0px/.test(cs.boxShadow)) st.shadows++;
      var rad = parseFloat(cs.borderTopLeftRadius) || 0;
      var boxed = (rgba(cs.backgroundColor) || [0, 0, 0, 0])[3] > 0.05 || parseFloat(cs.borderTopWidth) > 0;
      if (rad >= 12 && boxed && rect.width > 120 && rect.height > 80 && el.tagName !== 'IMG') st.roundedBoxes++;
      // an accent bar down one side of a rounded box: a thick coloured left edge the other edges do not share
      if (rad >= 6 && rect.width > 120 && rect.height > 60) {
        var blw = parseFloat(cs.borderLeftWidth) || 0;
        var lc = rgba(cs.borderLeftColor);
        var tc = rgba(cs.borderTopColor);
        var inset = /inset\s+([3-9]|1[0-9])px\s+0(px)?\s+0(px)?/.test(cs.boxShadow || '');
        if ((blw >= 3 && lc && lc[3] > 0.5 && (!tc || parseFloat(cs.borderTopWidth) < 1 || Math.abs(lc[0] - tc[0]) + Math.abs(lc[1] - tc[1]) + Math.abs(lc[2] - tc[2]) > 60)) || inset) st.rails++;
      }
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
    // …and every gallery, filter, chart key, table filter and configurator, tried in place and put back
    try { out.interactive = window.__uxBehaviors && window.__uxBehaviors.selfTestInteractive ? window.__uxBehaviors.selfTestInteractive() : []; } catch (e) { out.interactive = [{ kind: 'page', index: 0, items: 0, problems: ['the interaction check failed: ' + String(e && e.message || e).slice(0, 80)] }]; }
    // …and each 3D scene: drawn (its centre pixel read back), or its drawn silhouette standing in
    try { out.scenes = window.__uxScene && window.__uxScene.selfTest ? window.__uxScene.selfTest() : []; } catch (e) { out.scenes = [{ index: 0, webgl: true, drawn: false, problems: ['the scene check failed: ' + String(e && e.message || e).slice(0, 80)] }]; }
    out.errors = errors.slice();
    // where pieces were placed over one another (a composed field): words that run into other words. Each cell's
    // lines of text as the browser set them, compared with every other cell's
    out.collisions = [];
    var fields = document.querySelectorAll('.cp-field');
    for (var fi = 0; fi < fields.length && fi < 8; fi++) {
      if (getComputedStyle(fields[fi]).display !== 'grid') continue;
      var cells = [], kids = fields[fi].children;
      for (var ci = 0; ci < kids.length && ci < 8; ci++) {
        if (kids[ci].classList.contains('cp-media')) continue;
        var rg = document.createRange();
        rg.selectNodeContents(kids[ci]);
        var lr = rg.getClientRects(), lines = [];
        for (var li = 0; li < lr.length && lines.length < 40; li++) if (lr[li].width > 2 && lr[li].height > 6 && lr[li].height < 400) lines.push(lr[li]);
        cells.push({ el: kids[ci], lines: lines });
      }
      for (var a1 = 0; a1 < cells.length; a1++) for (var b1 = a1 + 1; b1 < cells.length; b1++) {
        var hit = false;
        for (var x1 = 0; x1 < cells[a1].lines.length && !hit; x1++) for (var y1 = 0; y1 < cells[b1].lines.length && !hit; y1++) {
          var A = cells[a1].lines[x1], B = cells[b1].lines[y1];
          var w = Math.min(A.right, B.right) - Math.max(A.left, B.left), h = Math.min(A.bottom, B.bottom) - Math.max(A.top, B.top);
          if (w > 4 && h > 4 && w * h > 0.12 * Math.min(A.width * A.height, B.width * B.height)) hit = true;
        }
        if (hit && out.collisions.length < 6) { var wc2 = where(cells[b1].el.querySelector('[data-ux-path]') || cells[b1].el); out.collisions.push({ section: wc2.section, path: wc2.path, text: txt(cells[b1].el.innerText || '', 40), with: txt(cells[a1].el.innerText || '', 40) }); }
      }
    }
    // what the page weighs: its markup, its pictures, and pictures far larger than they are shown (a vector
    // drawing has no size to waste, so it is not counted)
    var dpr = window.devicePixelRatio || 1, over = 0, inline = 0, imgs = [], all = document.images;
    // (the large view the gallery opens shows a picture the page already has: it weighs nothing more)
    for (var q0 = 0; q0 < all.length; q0++) if (!(all[q0].closest && all[q0].closest('.ux-lb'))) imgs.push(all[q0]);
    for (var q = 0; q < imgs.length; q++) {
      var im = imgs[q], src = im.currentSrc || im.src || '';
      if (/^data:/.test(src)) inline += src.length;
      if (/^data:image\/svg|\.svg(\?|$)/i.test(src)) continue;
      var shown = im.getBoundingClientRect().width;
      if (im.naturalWidth > 2000 && shown > 0 && im.naturalWidth > shown * dpr * 3) over++;
    }
    out.weight = { html: de.outerHTML.length, images: imgs.length, oversized: over, inline: inline };
    // accessibility the browser can tell without a model (the failures axe-core reports most): pictures with no
    // text alternative, controls with no name, fields with no label, headings that skip a level, page titles,
    // the main landmark, the page's language; and links that go nowhere yet or to a part that is not there
    var a11y = { noAlt: [], noName: [], noLabel: [], skips: [], h1: 0, main: !!document.querySelector('main,[role="main"]'), lang: de.getAttribute('lang') || '', unlinked: [], broken: [] };
    function shownA(el) { if (el.closest('[hidden],[aria-hidden="true"],.ux-lb')) return false; var r0 = el.getBoundingClientRect(); return r0.width > 0 && r0.height > 0; }
    var ims = document.images;
    for (var ia = 0; ia < ims.length && a11y.noAlt.length < 8; ia++) if (!ims[ia].hasAttribute('alt') && shownA(ims[ia])) a11y.noAlt.push(where(ims[ia]));
    var ctl = document.querySelectorAll('a[href],button');
    for (var ib = 0; ib < ctl.length && a11y.noName.length < 8; ib++) {
      var c0 = ctl[ib];
      if (!shownA(c0)) continue;
      var nm = (c0.getAttribute('aria-label') || c0.textContent || c0.getAttribute('title') || '').trim();
      if (!nm) { var im0 = c0.querySelector('img[alt]'); nm = im0 ? (im0.getAttribute('alt') || '').trim() : ''; }
      if (!nm) a11y.noName.push(where(c0));
    }
    var fl = document.querySelectorAll('input,select,textarea');
    for (var ic = 0; ic < fl.length && a11y.noLabel.length < 8; ic++) {
      var f0 = fl[ic];
      if (/^(hidden|submit|button|reset|image)$/.test(f0.type) || !shownA(f0)) continue;
      var lab = (f0.id && document.querySelector('label[for="' + f0.id + '"]')) || f0.closest('label') || f0.getAttribute('aria-label') || f0.getAttribute('aria-labelledby') || f0.getAttribute('title');
      if (!lab) a11y.noLabel.push(where(f0));
    }
    var hs = document.querySelectorAll('h1,h2,h3,h4,h5,h6'), lastLv = 0;
    for (var ih = 0; ih < hs.length; ih++) {
      if (!shownA(hs[ih])) continue;
      var lv = Number(hs[ih].tagName.slice(1));
      if (lv === 1) a11y.h1++;
      if (lastLv && lv > lastLv + 1 && a11y.skips.length < 6) { var wh = where(hs[ih]); a11y.skips.push({ section: wh.section, path: wh.path, from: lastLv, to: lv, text: txt(hs[ih].innerText, 60) }); }
      lastLv = lv;
    }
    var an = document.querySelectorAll('a[href]');
    for (var ie = 0; ie < an.length; ie++) {
      var hr = an[ie].getAttribute('href') || '', wa = where(an[ie]);
      if (an[ie].hasAttribute('data-ux-unlinked')) { if (a11y.unlinked.length < 12 && !an[ie].closest('.nav-over')) a11y.unlinked.push({ section: wa.section, path: wa.path, text: txt(an[ie].innerText, 40) }); }
      else if (hr.charAt(0) === '#' && hr.length > 1 && !document.getElementById(hr.slice(1)) && a11y.broken.length < 8) a11y.broken.push({ section: wa.section, path: wa.path, text: txt(an[ie].innerText, 40), href: hr.slice(0, 80) });
    }
    out.a11y = a11y;
    // composition the eye notices: a part with a wide band where nothing is (no words, picture or shape across
    // it), and a shape plane standing alone (touching no words and no picture), which reads as a placeholder
    out.voids = [];
    out.lone = [];
    var vh = window.innerHeight || 900;
    var parts = document.querySelectorAll('.sx[data-ux-section]');
    for (var iv = 0; iv < parts.length && iv < 20; iv++) {
      var part = parts[iv];
      if (/\bsx-(nav|footer)\b/.test(part.className)) continue;
      var pr = part.getBoundingClientRect();
      if (pr.height < 240) continue;
      var stuff = part.querySelectorAll('h1,h2,h3,h4,p,li,figcaption,label,blockquote,a.btn,button,img,svg,canvas,.cp-shape,.cp-figure,.cp-frag,table,form');
      var spans = [], words = [], pics = [];
      for (var is = 0; is < stuff.length && is < 400; is++) {
        var el2 = stuff[is];
        if (el2.closest('[hidden],[aria-hidden="true"]:not(.cp-shape):not(svg),.nav-over,.ux-lb')) continue;
        var r2 = el2.getBoundingClientRect();
        if (r2.width < 2 || r2.height < 2) continue;
        spans.push([r2.top - pr.top, r2.bottom - pr.top]);
        if (/^(IMG|CANVAS)$/.test(el2.tagName) || el2.classList.contains('cp-frag')) pics.push(r2);
        else if (!el2.classList.contains('cp-shape') && el2.tagName !== 'svg' && (el2.textContent || '').trim()) words.push(r2);
      }
      if (spans.length) {
        spans.sort(function (a, b) { return a[0] - b[0]; });
        var reach = spans[0][1], gap = 0, at = 0;
        for (var ig = 1; ig < spans.length; ig++) {
          if (spans[ig][0] > reach) { if (spans[ig][0] - reach > gap) { gap = spans[ig][0] - reach; at = reach; } }
          if (spans[ig][1] > reach) reach = spans[ig][1];
        }
        if (gap > Math.max(220, vh * 0.42)) { var wv = where(part); out.voids.push({ section: wv.section, gap: Math.round(gap), at: Math.round(at), height: Math.round(pr.height) }); }
      }
      var planes = part.querySelectorAll('.cp-shape:not(.cp-t-line)');
      for (var ip = 0; ip < planes.length && out.lone.length < 6; ip++) {
        var r3 = planes[ip].getBoundingClientRect();
        if (r3.width * r3.height < 0.04 * pr.width * pr.height) continue;
        var touches = false, all3 = words.concat(pics);
        for (var it = 0; it < all3.length && !touches; it++) {
          var o3 = all3[it];
          if (Math.min(o3.right, r3.right) - Math.max(o3.left, r3.left) > 8 && Math.min(o3.bottom, r3.bottom) - Math.max(o3.top, r3.top) > 8) touches = true;
        }
        if (!touches) { var wl = where(planes[ip]); out.lone.push({ section: wl.section, path: planes[ip].getAttribute('data-ux-path') || wl.path, share: Math.round((100 * r3.width * r3.height) / (pr.width * pr.height)) }); }
      }
    }
    return out;
  };
})();`;
