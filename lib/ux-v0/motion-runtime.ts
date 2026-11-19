// lib/ux-v0/motion-runtime.ts — the scripted layer of a design's motion, where the page plays.
//
// Most of a design's motion is CSS (lib/ux-v0/motion.ts): arrivals tied to the scroll, kinetic headlines,
// parallax, hovers. What CSS cannot do alone is here, as SocriaUX's OWN script — the same for every design,
// added to the sandboxed frame by nonce (lib/ux-v0/sandbox.ts) and inlined in an exported page:
//
//   scrub     the opening transformed by the scroll: its words lift away and fade, its picture settles in scale
//             (--hp, 0 → 1 over the opening's height), gentle or pronounced
//   story     one sequence of points pinned and told step by step as the page scrolls: the section holds the
//             screen, each point takes the stage in turn (.is-on), a rule shows how far through it is (--sp)
//   media     pictures arriving through a mask, or settling from a larger scale, as they come into view (.is-in)
//   magnetic  buttons drawn a few pixels toward a fine pointer near them
//   tilt      pictures and cards tilting toward a fine pointer over them
//   draw      line art (a chart's line, generated line work) drawing itself as it comes into view
//
// Every effect moves only transform, opacity, clip-path or a stroke offset: nothing that reflows the page. Scroll
// work happens once per frame (requestAnimationFrame), listeners are passive, and nothing runs at all under
// prefers-reduced-motion — the page is simply there. The CSS for each effect applies only once this script has
// run (body.mo-ready), so a page without it reads as an ordinary, complete page.
//
// window.__uxMotion.selfTest() reports what is wired and plays the story through its steps, so the rendered-page
// audit and the benchmarks can check that the motion actually works rather than that it was written.

export const MOTION_RUNTIME = String.raw`(function () {
  'use strict';
  if (window.__uxMotion) return;
  var b = document.body;
  if (!b) return;
  var d = b.dataset || {};
  var reduce = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var fine = !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function clamp(x) { return x < 0 ? 0 : x > 1 ? 1 : x; }
  var report = { reduced: reduce, scrub: 0, stories: 0, steps: 0, reveal: 0, revealed: 0, magnetic: 0, tilt: 0, draw: 0, frames: 0 };
  if (reduce || d.mo === undefined) { window.__uxMotion = { report: report, selfTest: function () { return { report: report, story: [] }; } }; return; }

  var hero = document.querySelector('.sx-hero');
  var scrub = +(d.moScrub || 0);
  var stories = $$('.mo-story');
  stories.forEach(function (s) {
    s.__steps = $$('[data-mo-step]', s);
    s.__i = -1;
    s.style.setProperty('--n', String(Math.max(1, s.__steps.length)));
    report.steps += s.__steps.length;
  });
  report.stories = stories.length;
  report.scrub = hero && scrub ? scrub : 0;

  var ticking = false;
  function frame() {
    ticking = false;
    report.frames++;
    var vh = window.innerHeight || 1;
    if (hero && scrub) {
      var r = hero.getBoundingClientRect();
      hero.style.setProperty('--hp', clamp(-r.top / Math.max(1, r.height)).toFixed(3));
    }
    for (var k = 0; k < stories.length; k++) {
      var s = stories[k];
      var rs = s.getBoundingClientRect();
      var p = clamp(-rs.top / Math.max(1, rs.height - vh));
      s.style.setProperty('--sp', p.toFixed(3));
      var n = s.__steps.length;
      var i = n ? Math.min(n - 1, Math.floor(p * n)) : -1;
      if (i !== s.__i) {
        s.__i = i;
        for (var j = 0; j < n; j++) {
          s.__steps[j].classList.toggle('is-on', j === i);
          s.__steps[j].setAttribute('aria-current', j === i ? 'step' : 'false');
        }
      }
    }
  }
  function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(frame); } }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // what arrives as it comes into view: pictures through a mask or in scale, line art drawing itself
  var reveal = $$('[data-mo-in]');
  report.reveal = reveal.length;
  report.draw = $$('[data-mo-in] .mo-draw, .mo-draw[data-mo-in]').length;
  function show(el) { if (!el.classList.contains('is-in')) { el.classList.add('is-in'); report.revealed++; } }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { show(e.target); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });
    reveal.forEach(function (el) { io.observe(el); });
  } else reveal.forEach(show);

  // a fine pointer: buttons drawn toward it, pictures and cards tilting toward it
  if (fine && d.moMagnetic !== undefined) {
    $$('.btn').forEach(function (el) {
      report.magnetic++;
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        var x = (ev.clientX - (r.left + r.width / 2)) / r.width;
        var y = (ev.clientY - (r.top + r.height / 2)) / r.height;
        el.style.translate = (x * 10).toFixed(1) + 'px ' + (y * 8).toFixed(1) + 'px';
      });
      el.addEventListener('pointerleave', function () { el.style.translate = ''; });
    });
  }
  if (fine && d.moCursor === 'tilt') {
    $$('[data-mo-tilt]').forEach(function (el) {
      report.tilt++;
      el.addEventListener('pointermove', function (ev) {
        var r = el.getBoundingClientRect();
        var x = (ev.clientX - r.left) / Math.max(1, r.width) - 0.5;
        var y = (ev.clientY - r.top) / Math.max(1, r.height) - 0.5;
        el.style.transform = 'perspective(900px) rotateX(' + (-y * 5).toFixed(2) + 'deg) rotateY(' + (x * 6).toFixed(2) + 'deg)';
      });
      el.addEventListener('pointerleave', function () { el.style.transform = ''; });
    });
  }

  b.classList.add('mo-ready');
  frame();

  // plays the story through its steps (scrolling the page) and reports what moved; restores the scroll
  function selfTest() {
    var out = { report: report, story: [] };
    var y0 = window.scrollY;
    stories.forEach(function (s) {
      var seen = [];
      var top = s.getBoundingClientRect().top + window.scrollY;
      var span = s.offsetHeight - (window.innerHeight || 1);
      for (var q = 0; q < s.__steps.length; q++) {
        window.scrollTo(0, top + span * ((q + 0.5) / s.__steps.length));
        frame();
        seen.push(s.__i);
      }
      out.story.push({ steps: s.__steps.length, seen: seen, pinned: getComputedStyle(s.querySelector('.wrap') || s).position === 'sticky' });
    });
    window.scrollTo(0, y0);
    frame();
    return out;
  }
  window.__uxMotion = { report: report, selfTest: selfTest };
})();`;
