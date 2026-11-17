// lib/ux-v0/inspector.ts — the small script that runs inside the sandboxed page.
//
// It is the canvas's eyes inside the frame, and it can only talk: every
// message goes to the parent with postMessage and carries `__uxv0: 1`. It
// reports the page's size and outline when it loads, the element under the
// pointer and the element clicked (in element mode), the elements inside a
// rectangle (asked for by the parent, in area mode), resources that failed to
// load, and wheel and key events so the canvas can zoom and pan while the
// pointer is over the page. It stops links and forms from going anywhere.
//
// It is written as a plain-JavaScript string, not a function turned into
// text, because a bundler may rewrite a function with helpers that do not
// exist inside the frame. It uses nothing newer than ES2015 browsers support.
// String.raw keeps every backslash as written.

import { AUDIT_SOURCE } from './audit-source';

// The audit (lib/ux-v0/audit-source.ts) rides along: asked with { type: 'audit' }, it measures the page as laid out.
export const INSPECTOR_SOURCE = AUDIT_SOURCE + '\n' + String.raw`(function () {
  'use strict';
  if (window.__uxv0Inspector) return;
  window.__uxv0Inspector = true;
  var MODE = 'none';
  var missing = [];
  var lastH = 0;
  var hoverPending = false;
  var lastHover = null;
  function P(m) { m.__uxv0 = 1; try { parent.postMessage(m, '*'); } catch (e) {} }
  var IMPLICIT = { A: 'link', BUTTON: 'button', H1: 'heading', H2: 'heading', H3: 'heading', H4: 'heading', H5: 'heading', H6: 'heading', IMG: 'img', NAV: 'navigation', HEADER: 'banner', FOOTER: 'contentinfo', MAIN: 'main', FORM: 'form', UL: 'list', OL: 'list', LI: 'listitem', TEXTAREA: 'textbox', SELECT: 'combobox', TABLE: 'table', ASIDE: 'complementary', ARTICLE: 'article', LABEL: 'label', P: 'paragraph', SECTION: 'region', FIGURE: 'figure', SUMMARY: 'button', SVG: 'img' };
  var STYLES = ['color', 'background-color', 'background-image', 'font-family', 'font-size', 'font-weight', 'line-height', 'letter-spacing', 'text-transform', 'text-align', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'margin-top', 'margin-bottom', 'border-radius', 'border-top-width', 'border-top-style', 'border-top-color', 'display', 'position', 'gap', 'opacity', 'box-shadow', 'text-decoration-line', 'width', 'height', 'max-width'];
  function txt(s, n) { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }
  function esc(s) { return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }
  function role(el) {
    var r = el.getAttribute('role'); if (r) return r;
    if (el.tagName === 'A' && !el.hasAttribute('href')) return '';
    if (el.tagName === 'INPUT') {
      var t = (el.getAttribute('type') || 'text').toLowerCase();
      return t === 'checkbox' ? 'checkbox' : t === 'radio' ? 'radio' : (t === 'submit' || t === 'button') ? 'button' : t === 'range' ? 'slider' : 'textbox';
    }
    return IMPLICIT[el.tagName.toUpperCase()] || '';
  }
  function accName(el) {
    var v = el.getAttribute('aria-label'); if (v) return txt(v, 200);
    var lb = el.getAttribute('aria-labelledby');
    if (lb) { var j = txt(lb.split(/\s+/).map(function (id) { var n = document.getElementById(id); return n ? n.textContent : ''; }).join(' '), 200); if (j) return j; }
    if (el.tagName === 'IMG') return txt(el.getAttribute('alt') || '', 200);
    if (el.id) { var l = document.querySelector('label[for="' + esc(el.id) + '"]'); if (l) return txt(l.textContent, 200); }
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(el.tagName)) { var w = el.closest('label'); if (w) return txt(w.textContent, 200); }
    if (el.getAttribute('title')) return txt(el.getAttribute('title'), 200);
    if (el.getAttribute('placeholder')) return txt(el.getAttribute('placeholder'), 200);
    return txt(el.innerText || el.textContent || '', 200);
  }
  function selectorOf(el) {
    var parts = [];
    while (el && el.nodeType === 1 && el !== document.documentElement) {
      if (el === document.body) { parts.unshift('body'); break; }
      var i = 1, s = el.previousElementSibling;
      while (s) { if (s.tagName === el.tagName) i++; s = s.previousElementSibling; }
      parts.unshift(el.tagName.toLowerCase() + ':nth-of-type(' + i + ')');
      el = el.parentElement;
    }
    return parts.join('>');
  }
  function short(el) {
    var s = el.tagName.toLowerCase();
    if (el.id) s += '#' + String(el.id).slice(0, 24);
    var cls = (typeof el.className === 'string' ? el.className : '').split(/\s+/).filter(Boolean).slice(0, 2);
    if (cls.length) s += '.' + cls.join('.').slice(0, 40);
    return s;
  }
  function pathOf(el) { var out = []; var n = el; while (n && n.nodeType === 1 && n !== document.body && out.length < 5) { out.unshift(short(n)); n = n.parentElement; } return out.join(' > '); }
  function bgOf(el) {
    var n = el;
    while (n && n.nodeType === 1) {
      var cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return 'image';
      if (n.tagName === 'IMG' && n !== el) return 'image';
      var c = cs.backgroundColor;
      if (c && c !== 'transparent' && !/^rgba\(\s*0,\s*0,\s*0,\s*0\s*\)$/.test(c)) {
        var m = c.match(/rgba?\(([^)]+)\)/);
        if (!m) return c;
        var p = m[1].split(',');
        if (p.length < 4 || parseFloat(p[3]) > 0.85) return c;
      }
      n = n.parentElement;
    }
    return 'rgb(255, 255, 255)';
  }
  function sectionOf(el) {
    var s = el.closest('[data-ux-section],section,header,footer,nav,article,aside,main,form');
    if (!s) return '';
    var h = s.querySelector('h1,h2,h3,h4');
    var id = s.getAttribute('data-ux-section');
    return (id ? id : short(s)) + (h ? ': ' + txt(h.textContent, 80) : '');
  }
  function boxOf(el) { var r = el.getBoundingClientRect(); return { x: Math.round(r.left + window.scrollX), y: Math.round(r.top + window.scrollY), w: Math.round(r.width), h: Math.round(r.height) }; }
  function interactive(el) { return /^(A|BUTTON|INPUT|SELECT|TEXTAREA|SUMMARY)$/.test(el.tagName) || /^(button|link|tab|checkbox|menuitem|switch)$/.test(el.getAttribute('role') || '') || el.hasAttribute('tabindex'); }
  function capture(el, light) {
    var cs = getComputedStyle(el);
    var styles = {};
    var names = light ? ['color', 'background-color', 'font-size', 'font-weight', 'font-family'] : STYLES;
    for (var i = 0; i < names.length; i++) { var v = cs.getPropertyValue(names[i]); if (v) styles[names[i]] = String(v).slice(0, 160); }
    var attrs = {};
    if (!light) ['href', 'src', 'alt', 'type', 'placeholder', 'title', 'role', 'aria-label', 'aria-expanded', 'aria-current', 'name', 'for', 'target', 'disabled', 'required'].forEach(function (a) { if (el.hasAttribute(a)) attrs[a] = String(el.getAttribute(a) || '').slice(0, 300); });
    var uxS = el.closest('[data-ux-section]');
    var uxP = el.closest('[data-ux-path]');
    var p = el.parentElement;
    return {
      tag: el.tagName.toLowerCase(), role: role(el), name: accName(el),
      text: txt(el.innerText || el.textContent || '', light ? 120 : 400),
      path: pathOf(el), selector: selectorOf(el), attrs: attrs, styles: styles, box: boxOf(el),
      background: bgOf(el), section: light ? '' : sectionOf(el),
      ux: uxS ? { section: uxS.getAttribute('data-ux-section') || '', path: uxP ? (uxP.getAttribute('data-ux-path') || '') : '' } : null,
      parent: p ? short(p) + ' (' + p.children.length + ' children)' : '',
      siblings: p ? p.children.length - 1 : 0, children: el.children.length, interactive: interactive(el)
    };
  }
  // the keyboard's way round the page: up to the parent, into the first child, along to a sibling
  function stepable(n) {
    if (!n || n.nodeType !== 1) return false;
    if (/^(SCRIPT|STYLE|TEMPLATE|NOSCRIPT|LINK|META|BR)$/.test(n.tagName)) return false;
    if (n.hidden) return false;
    try { var cs = getComputedStyle(n); if (cs.display === 'none' || cs.visibility === 'hidden') return false; } catch (e) {}
    return true;
  }
  function stepFrom(el, dir) {
    var n = null;
    if (dir === 'parent') return el.parentElement;
    if (dir === 'child') { for (n = el.firstElementChild; n; n = n.nextElementSibling) if (stepable(n)) return n; return null; }
    if (dir === 'next') { for (n = el.nextElementSibling; n; n = n.nextElementSibling) if (stepable(n)) return n; return null; }
    if (dir === 'prev') { for (n = el.previousElementSibling; n; n = n.previousElementSibling) if (stepable(n)) return n; return null; }
    return null;
  }
  function leafText(el) { for (var i = 0; i < el.childNodes.length; i++) { var c = el.childNodes[i]; if (c.nodeType === 3 && c.textContent.trim().length > 1) return true; } return false; }
  function area(rect) {
    var all = document.body ? document.body.getElementsByTagName('*') : [];
    var out = [];
    var n = Math.min(all.length, 4000);
    for (var i = 0; i < n; i++) {
      var el = all[i];
      if (/^(SCRIPT|STYLE|META|LINK|BR|NOSCRIPT|TEMPLATE|HEAD|TITLE)$/i.test(el.tagName)) continue;
      var b = boxOf(el);
      if (b.w < 4 || b.h < 4) continue;
      var ix = Math.max(0, Math.min(b.x + b.w, rect.x + rect.w) - Math.max(b.x, rect.x));
      var iy = Math.max(0, Math.min(b.y + b.h, rect.y + rect.h) - Math.max(b.y, rect.y));
      var inter = ix * iy;
      if (!inter) continue;
      var cov = inter / (b.w * b.h);
      var cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      var w = interactive(el) ? 4 : /^H[1-6]$/.test(el.tagName) ? 3 : (el.tagName === 'IMG' || el.tagName.toLowerCase() === 'svg') ? 2.5 : leafText(el) ? 2 : 0.5;
      if (cov >= 0.6 || (w >= 2.5 && cov >= 0.3)) out.push({ el: el, cov: cov, w: w });
    }
    out = out.filter(function (o) { if (o.w >= 2) return true; for (var j = 0; j < out.length; j++) { if (out[j] !== o && o.el.contains(out[j].el)) return false; } return true; });
    out.sort(function (a, b) { return (b.w - a.w) || (b.cov - a.cov); });
    var els = out.slice(0, 12).map(function (o) { var c = capture(o.el, true); c.coverage = Math.round(o.cov * 100) / 100; return c; });
    var cont = document.elementFromPoint(rect.x + rect.w / 2 - window.scrollX, rect.y + rect.h / 2 - window.scrollY);
    while (cont && cont !== document.body && cont !== document.documentElement) {
      var bb = boxOf(cont);
      if (bb.x <= rect.x && bb.y <= rect.y && bb.x + bb.w >= rect.x + rect.w && bb.y + bb.h >= rect.y + rect.h) break;
      cont = cont.parentElement;
    }
    return { elements: els, container: cont && cont.nodeType === 1 ? pathOf(cont) || 'body' : 'body' };
  }
  function outline() {
    var lines = [];
    var nodes = document.querySelectorAll('header,nav,main,section,article,aside,footer,form,h1,h2,h3,[data-ux-section]');
    for (var i = 0; i < nodes.length && lines.length < 30; i++) {
      var el = nodes[i];
      if (/^H[1-3]$/.test(el.tagName)) lines.push(el.tagName.toLowerCase() + ' \u201c' + txt(el.textContent, 70) + '\u201d');
      else lines.push(short(el) + (el.getAttribute('data-ux-section') ? ' [' + el.getAttribute('data-ux-section') + ']' : ''));
    }
    var count = function (sel) { return document.querySelectorAll(sel).length; };
    lines.push('Counts: ' + count('a[href]') + ' links, ' + count('button,[role=button],input[type=submit]') + ' buttons, ' + count('img,svg') + ' images, ' + count('input,select,textarea') + ' fields');
    var bodyCs = document.body ? getComputedStyle(document.body) : null;
    if (bodyCs) lines.push('Body text: ' + bodyCs.fontFamily.split(',')[0] + ' ' + bodyCs.fontSize + ', colour ' + bodyCs.color + ' on ' + bgOf(document.body));
    return lines.join('\n');
  }
  function size() { var d = document.documentElement, b = document.body; return { width: Math.max(d.scrollWidth, b ? b.scrollWidth : 0), height: Math.max(d.scrollHeight, b ? b.scrollHeight : 0, d.offsetHeight) }; }
  function report(force) { var s = size(); if (force || Math.abs(s.height - lastH) > 2) { lastH = s.height; P({ type: 'size', width: s.width, height: s.height }); } }
  function hoverTarget(t) { if (!t || t.nodeType !== 1 || t === document.documentElement || t === document.body) return null; return t; }
  document.addEventListener('mousemove', function (e) {
    if (MODE !== 'element') return;
    var el = hoverTarget(e.target);
    if (el === lastHover) return;
    lastHover = el;
    if (hoverPending) return;
    hoverPending = true;
    requestAnimationFrame(function () {
      hoverPending = false;
      if (!lastHover) { P({ type: 'hover', box: null }); return; }
      P({ type: 'hover', box: boxOf(lastHover), label: lastHover.tagName.toLowerCase() + (txt(lastHover.innerText || '', 30) ? ' \u00b7 ' + txt(lastHover.innerText || '', 30) : '') });
    });
  }, true);
  document.addEventListener('mouseleave', function () { lastHover = null; P({ type: 'hover', box: null }); });
  document.addEventListener('click', function (e) {
    var a = e.target && e.target.closest ? e.target.closest('a,button,input[type=submit],summary') : null;
    if (MODE === 'element') {
      e.preventDefault(); e.stopPropagation();
      var el = hoverTarget(e.target);
      if (el) P({ type: 'select', element: capture(el, false) });
      return;
    }
    if (a && a.tagName === 'A') e.preventDefault();
  }, true);
  document.addEventListener('submit', function (e) { e.preventDefault(); }, true);
  window.addEventListener('wheel', function (e) {
    e.preventDefault();
    P({ type: 'wheel', deltaX: e.deltaX, deltaY: e.deltaY, deltaMode: e.deltaMode, ctrlKey: e.ctrlKey, metaKey: e.metaKey, shiftKey: e.shiftKey, x: e.clientX, y: e.clientY });
  }, { passive: false });
  document.addEventListener('keydown', function (e) {
    var k = e.key;
    if (k === 'Escape' || ((e.metaKey || e.ctrlKey) && (k === '=' || k === '+' || k === '-' || k === '0'))) {
      if (k !== 'Escape') e.preventDefault();
      P({ type: 'key', key: k, metaKey: e.metaKey, ctrlKey: e.ctrlKey, shiftKey: e.shiftKey });
    }
  }, true);
  window.addEventListener('error', function (e) {
    var t = e.target;
    if (t && t !== window && t.nodeType === 1) {
      var u = t.getAttribute('src') || t.getAttribute('href') || '';
      if (u && missing.indexOf(u) < 0 && missing.length < 30) { missing.push(u.slice(0, 300)); P({ type: 'missing', list: missing.slice() }); }
    }
  }, true);
  window.addEventListener('message', function (e) {
    if (e.source !== parent) return;
    var m = e.data;
    if (!m || m.__uxv0 !== 1 || typeof m.type !== 'string') return;
    if (m.type === 'mode') {
      MODE = m.mode === 'element' ? 'element' : m.mode === 'area' ? 'area' : 'none';
      document.documentElement.style.cursor = MODE === 'element' ? 'crosshair' : '';
      if (MODE !== 'element') { lastHover = null; P({ type: 'hover', box: null }); }
    } else if (m.type === 'query' && m.rect) {
      P({ type: 'area', id: m.id, result: area(m.rect) });
    } else if ((m.type === 'pick' || m.type === 'parent' || m.type === 'step') && typeof m.selector === 'string') {
      var el = null;
      try { el = document.querySelector(m.selector); } catch (err) { el = null; }
      if (el && m.type === 'parent') el = el.parentElement;
      else if (el && m.type === 'step') el = stepFrom(el, m.dir);
      if (el && (el === document.body || el === document.documentElement)) el = null;
      P({ type: 'select', id: m.id, element: el ? capture(el, false) : null });
    } else if (m.type === 'measure') {
      report(true);
    } else if (m.type === 'audit') {
      var result = null;
      try { result = window.__uxv0Audit ? window.__uxv0Audit() : null; } catch (err) { result = null; }
      P({ type: 'audit', id: m.id, result: result });
    }
  });
  function ready() { var s = size(); lastH = s.height; P({ type: 'ready', width: s.width, height: s.height, outline: outline() }); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ready); else ready();
  window.addEventListener('load', function () { report(true); if (missing.length) P({ type: 'missing', list: missing.slice() }); });
  if (window.ResizeObserver) { try { new ResizeObserver(function () { report(false); }).observe(document.documentElement); } catch (e) {} }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { report(true); });
  setTimeout(function () { report(true); }, 1500);
})();`;
