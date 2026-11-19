// lib/ux-v0/behaviors.ts — what makes a generated design work, not just look right.
//
// A generated design is a specification the renderer draws; the model never
// writes code, and nothing it writes runs. This is SocriaUX's OWN script, the
// same for every design, added to the sandboxed frame by nonce next to the
// inspector (lib/ux-v0/sandbox.ts) and inlined in an exported page. It gives the
// declarative components their state:
//
//   booking   the chosen day shows its times; a chosen time is summarised and
//             enables the confirm action; confirming without a time says so; a
//             short loading state, then the confirmation, which says plainly
//             that it is a prototype and no booking was made; "change the time"
//             goes back. Full times cannot be chosen.
//   form      required fields and email/phone formats are checked on submit,
//             each error said beside its field; a valid form shows that it was
//             "sent", again said to be a prototype.
//   table     column headers sort the rows (ascending, then descending); a table of six rows or more
//             filters its rows as you type.
//   gallery   each picture opens large: previous, next, Escape and the arrow keys, focus returned on close.
//   filters   a gallery's kinds of picture, a menu's groups: one at a time, or all.
//   chart     each series can be shown or hidden (one always stays); each reading says its value.
//   configurator  options chosen in place: the total and the choice said as they change, a finish's
//             colour shown (and sent to a 3D scene on the page); the action says plainly that it is a
//             prototype and nothing was ordered.
//
// A state change (a filter, a configuration) passes through the View Transitions API where the browser has it
// and the visitor has not asked for reduced motion: the page changes as one movement, not a jump.
//
// Nothing here reaches the network, storage or the page around the frame (the
// frame has none of them to reach). Motion respects prefers-reduced-motion.
//
// window.__uxBehaviors.selfTest() exercises each booking in place — choose the
// first open time, confirm, see the confirmation, change back — and reports
// what failed; the rendered-page audit calls it, so a booking that does not
// work is a finding, not a surprise.

export const BEHAVIOR_SOURCE = String.raw`(function () {
  'use strict';
  // bound once per COMPONENT, never per window or document: both can outlive their content
  // (document.open/write keeps them), and a global guard would leave new content with no behaviour,
  // its booking form submitting natively. Every listener here is on the component itself.
  function fresh(el) { if (el.hasAttribute('data-ux-bound')) return false; el.setAttribute('data-ux-bound', ''); return true; }
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var DELAY = reduce ? 0 : 650;
  function $(root, sel) { return root.querySelector(sel); }
  function $$(root, sel) { return Array.prototype.slice.call(root.querySelectorAll(sel)); }
  function text(el) { return (el && el.textContent || '').replace(/\s+/g, ' ').trim(); }

  // ── booking ──
  function booking(root) {
    var form = $(root, '[data-ux-booking-form]');
    var done = $(root, '[data-ux-done]');
    var btn = $(root, '[data-ux-confirm]');
    var err = $(root, '[data-ux-error]');
    var choice = $(root, '[data-ux-bind="choice"]');
    var summary = $(root, '[data-ux-bind="summary"]');
    var item = text($(root, '.bk-item-name'));
    var label = btn ? text(btn) : '';
    var listMode = root.classList.contains('bk-list');
    if (!form || !btn) return null;
    function chosen() { return $(root, 'input[type=radio][name$="-time"]:checked'); }
    function say() {
      var c = chosen();
      var s = c ? (c.getAttribute('data-day-label') + ' at ' + c.getAttribute('data-time')) : '';
      if (choice) choice.textContent = c ? s : 'No time chosen yet';
      btn.setAttribute('aria-disabled', c ? 'false' : 'true');
      if (c && err) err.hidden = true;
      return s;
    }
    function showDay(i) {
      if (listMode) return;
      $$(root, '.bk-times').forEach(function (f) { f.hidden = f.getAttribute('data-day') !== String(i); });
      $$(root, 'input[name$="-time"]').forEach(function (r) { r.checked = false; });
      say();
    }
    root.addEventListener('change', function (e) {
      var t = e.target;
      if (!t || t.type !== 'radio') return;
      if (/-day$/.test(t.name)) showDay(t.value);
      else say();
    });
    function confirm(instant) {
      var c = chosen();
      if (!c) {
        if (err) err.hidden = false;
        var first = $(root, '.bk-times:not([hidden]) input[name$="-time"]:not([disabled])');
        if (first) first.focus();
        return false;
      }
      var s = item ? item + ', ' + say() : say();
      btn.setAttribute('aria-busy', 'true');
      btn.textContent = 'Booking…';
      $$(form, 'input').forEach(function (r) { r.disabled = true; });
      function finish() {
        btn.removeAttribute('aria-busy');
        btn.textContent = label;
        form.hidden = true;
        if (summary) summary.textContent = s;
        if (done) {
          // the confirmation arrives (a transition, not an animation): from just below, faded, to its place
          if (!instant && DELAY && window.requestAnimationFrame) { done.classList.add('is-arriving'); requestAnimationFrame(function () { requestAnimationFrame(function () { done.classList.remove('is-arriving'); }); }); }
          done.hidden = false;
          try { done.focus({ preventScroll: true }); } catch (x) { done.focus(); }
        }
      }
      if (instant || !DELAY) finish(); else setTimeout(finish, DELAY);
      return true;
    }
    function change() {
      if (done) done.hidden = true;
      form.hidden = false;
      $$(form, 'input').forEach(function (r) { r.disabled = !!r.closest('.is-full, .is-closed'); });
      var c = chosen();
      if (c) c.focus();
      say();
    }
    form.addEventListener('submit', function (e) { e.preventDefault(); confirm(false); });
    var back = $(root, '[data-ux-change]');
    if (back) back.addEventListener('click', change);
    say();
    return { root: root, confirm: confirm, change: change, chosen: chosen, say: say, showDay: showDay };
  }

  // ── forms ──
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  var PHONE = /^[+()\d][\d\s()+-]{5,}$/;
  var forms = [];
  function formBehaviour(f) {
    // each field said beside itself; returns the first one wrong, or null when all is well
    function check() {
      var bad = null;
      $$(f, '.field').forEach(function (field) {
        var input = $(field, 'input, textarea, select');
        if (!input) return;
        var v = input.type === 'checkbox' ? (input.checked ? 'y' : '') : String(input.value || '').trim();
        var msg = '';
        if (input.required && !v) msg = input.type === 'checkbox' ? 'Please tick this to continue.' : 'This is needed.';
        else if (v && input.type === 'email' && !EMAIL.test(v)) msg = 'That email address does not look complete.';
        else if (v && input.type === 'tel' && !PHONE.test(v)) msg = 'That number does not look complete.';
        var note = $(field, '.fm-error');
        field.classList.toggle('is-invalid', !!msg);
        input.setAttribute('aria-invalid', msg ? 'true' : 'false');
        if (msg) {
          if (!note) { note = document.createElement('p'); note.className = 'fm-error'; note.id = (input.id || 'f') + '-err'; field.appendChild(note); }
          note.textContent = msg;
          input.setAttribute('aria-describedby', note.id);
          if (!bad) bad = input;
        } else if (note) { note.remove(); input.removeAttribute('aria-describedby'); }
      });
      return bad;
    }
    forms.push({ root: f, check: check });
    f.addEventListener('submit', function (e) {
      e.preventDefault();
      var bad = check();
      if (bad) { bad.focus(); return; }
      var done = $(f, '[data-ux-done]');
      var submit = $(f, '[type=submit]');
      if (submit) { submit.setAttribute('aria-busy', 'true'); submit.disabled = true; }
      setTimeout(function () {
        if (submit) { submit.removeAttribute('aria-busy'); submit.disabled = false; }
        if (done) { done.hidden = false; try { done.focus({ preventScroll: true }); } catch (x) { done.focus(); } }
      }, DELAY);
    });
  }

  // ── tables ──
  function tableBehaviour(table) {
    var heads = $$(table, 'thead th');
    var body = $(table, 'tbody');
    if (!body || !heads.length) return;
    heads.forEach(function (th, col) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'th-sort';
      b.innerHTML = th.innerHTML;
      th.innerHTML = '';
      th.appendChild(b);
      th.setAttribute('aria-sort', 'none');
      b.addEventListener('click', function () {
        var dir = th.getAttribute('aria-sort') === 'ascending' ? 'descending' : 'ascending';
        heads.forEach(function (h) { h.setAttribute('aria-sort', 'none'); });
        th.setAttribute('aria-sort', dir);
        var rows = $$(body, 'tr');
        rows.sort(function (a, z) {
          var x = text(a.children[col]), y = text(z.children[col]);
          var nx = parseFloat(x.replace(/[^\d.-]/g, '')), ny = parseFloat(y.replace(/[^\d.-]/g, ''));
          var r = !isNaN(nx) && !isNaN(ny) ? nx - ny : x.localeCompare(y);
          return dir === 'ascending' ? r : -r;
        });
        rows.forEach(function (r) { body.appendChild(r); });
      });
    });
  }

  // ── a state change as one movement, where the browser can and the visitor has not asked for stillness ──
  function vt(f) {
    if (!reduce && document.startViewTransition) { try { document.startViewTransition(f); return; } catch (e) { /* drawn at once below */ } }
    f();
  }

  // ── filters: a gallery's kinds of picture, a menu's groups ──
  function filters(group) {
    var root = group.parentNode;
    var chips = $$(group, '[data-ux-filter]');
    var items = $$(root, '[data-tag]');
    if (chips.length < 2 || !items.length) return null;
    function show(tag, instant) {
      function draw() {
        chips.forEach(function (c) { c.setAttribute('aria-pressed', c.getAttribute('data-ux-filter') === tag ? 'true' : 'false'); });
        items.forEach(function (it) { it.hidden = !!tag && it.getAttribute('data-tag') !== tag; });
      }
      if (instant) draw(); else vt(draw);
    }
    chips.forEach(function (c) { c.addEventListener('click', function () { show(c.getAttribute('data-ux-filter') || ''); }); });
    return { root: root, chips: chips, items: items, show: show };
  }

  // ── a picture opened large ──
  var lb = null;
  function lightbox() {
    if (lb) return lb;
    var el = document.createElement('div');
    el.className = 'ux-lb';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'The picture, large');
    el.innerHTML = '<img alt=""><div class="ux-lb-bar"><button type="button" data-lb="prev">Previous</button><span data-lb="count" aria-live="polite"></span><span><button type="button" data-lb="next">Next</button> <button type="button" data-lb="close">Close</button></span></div>';
    document.body.appendChild(el);
    var img = $(el, 'img');
    var count = $(el, '[data-lb="count"]');
    var list = [], at = 0, back = null;
    function draw() {
      var src = $(list[at], 'img');
      img.src = src ? (src.currentSrc || src.src) : '';
      img.alt = src ? src.alt : '';
      count.textContent = (at + 1) + ' of ' + list.length;
    }
    function open(items, i) { list = items; at = i; back = document.activeElement; draw(); el.hidden = false; $(el, '[data-lb="close"]').focus(); }
    function close() { el.hidden = true; if (back && back.focus) back.focus(); }
    function step(d) { if (!list.length) return; at = (at + d + list.length) % list.length; draw(); }
    el.addEventListener('click', function (ev) {
      var b = ev.target.closest('[data-lb]');
      if (!b) { if (ev.target === el) close(); return; }
      var k = b.getAttribute('data-lb');
      if (k === 'close') close(); else if (k === 'prev') step(-1); else if (k === 'next') step(1);
    });
    el.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') close(); else if (ev.key === 'ArrowRight') step(1); else if (ev.key === 'ArrowLeft') step(-1);
    });
    lb = { el: el, open: open, close: close, step: step, at: function () { return at; } };
    return lb;
  }
  function gallery(root) {
    var figs = $$(root, '[data-ux-open]').filter(function (f) { return !!$(f, 'img'); });
    if (!figs.length) return null;
    figs.forEach(function (f) {
      f.setAttribute('tabindex', '0');
      f.setAttribute('role', 'button');
      f.setAttribute('aria-label', 'Open the picture large');
      function go() { var shown = figs.filter(function (x) { return !x.hidden; }); lightbox().open(shown, Math.max(0, shown.indexOf(f))); }
      f.addEventListener('click', go);
      f.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
    });
    return { root: root, figs: figs };
  }

  // ── a chart's series, shown or hidden (one always stays) ──
  function legend(root) {
    var card = root.parentNode;
    var svg = card && $(card, 'svg.chart');
    var btns = $$(root, '[data-ux-series]');
    if (!svg || btns.length < 2) return null;
    function toggle(b) {
      var on = b.getAttribute('aria-pressed') !== 'false';
      if (on && btns.filter(function (x) { return x.getAttribute('aria-pressed') !== 'false'; }).length <= 1) return false;
      b.setAttribute('aria-pressed', on ? 'false' : 'true');
      $$(svg, '.s' + b.getAttribute('data-ux-series')).forEach(function (m) { m.classList.toggle('is-off', on); });
      return true;
    }
    btns.forEach(function (b) { b.addEventListener('click', function () { toggle(b); }); });
    return { root: root, btns: btns, svg: svg, toggle: toggle };
  }

  // ── a table's rows, filtered as you type ──
  function tableFilter(input) {
    var card = input.closest('.table-card');
    var body = card && $(card, 'tbody');
    if (!body) return null;
    function run() {
      var q = input.value.trim().toLowerCase();
      $$(body, 'tr').forEach(function (r) { r.hidden = !!q && text(r).toLowerCase().indexOf(q) < 0; });
    }
    input.addEventListener('input', run);
    return { input: input, body: body, run: run };
  }

  // ── a configurator ──
  function configurator(root) {
    var form = $(root, '[data-ux-config-form]');
    var total = $(root, '[data-ux-config-total]');
    var choice = $(root, '[data-ux-config-choice]');
    var done = $(root, '[data-ux-config-done]');
    var said = $(root, '[data-ux-config-said]');
    if (!form || !total) return null;
    var base = parseFloat(total.getAttribute('data-base')) || 0;
    var cur = total.getAttribute('data-cur') || '';
    function picked() { return $$(form, 'input[type=radio]:checked'); }
    function update() {
      var p = picked();
      var sum = base + p.reduce(function (a, r) { return a + (parseFloat(r.getAttribute('data-price')) || 0); }, 0);
      total.textContent = cur + (Math.round(sum * 100) / 100).toLocaleString('en-GB');
      if (choice) choice.textContent = p.map(function (r) { return r.getAttribute('data-label'); }).join(' · ');
      var sw = p.map(function (r) { return r.getAttribute('data-swatch'); }).filter(Boolean)[0];
      if (sw) {
        root.style.setProperty('--cfg', sw);
        try { document.dispatchEvent(new CustomEvent('ux-config', { detail: { swatch: sw } })); } catch (e) { /* an old browser: the swatch still shows */ }
      }
      if (done) done.hidden = true;
      return sum;
    }
    form.addEventListener('change', function () { vt(update); });
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (said) said.textContent = (choice ? choice.textContent : '') + ', ' + total.textContent;
      if (done) { done.hidden = false; done.focus(); }
    });
    return { root: root, form: form, update: update, total: total, choice: choice, done: done };
  }

  var bookings = $$(document, '[data-ux-booking]').filter(fresh).map(booking).filter(Boolean);
  $$(document, 'form[data-ux-form]').filter(fresh).forEach(formBehaviour);
  $$(document, '.table-card table').filter(fresh).forEach(tableBehaviour);
  var filterSets = $$(document, '[data-ux-filters]').filter(fresh).map(filters).filter(Boolean);
  var galleries = $$(document, '[data-ux-gallery]').filter(fresh).map(gallery).filter(Boolean);
  var legends = $$(document, '[data-ux-legend]').filter(fresh).map(legend).filter(Boolean);
  var tableFilters = $$(document, '[data-ux-table-filter]').filter(fresh).map(tableFilter).filter(Boolean);
  var configs = $$(document, '[data-ux-config]').filter(fresh).map(configurator).filter(Boolean);

  // the audit's look at whether each interactive part works, in place, and back as it was
  function selfTestInteractive() {
    var out = [];
    galleries.forEach(function (g, i) {
      var p = [];
      var L = lightbox();
      g.figs[0].click();
      if (L.el.hidden) p.push('a picture does not open large');
      else {
        L.step(1);
        if (g.figs.length > 1 && L.at() !== 1) p.push('next does not move on');
        L.close();
        if (!L.el.hidden) p.push('the large picture does not close');
      }
      out.push({ kind: 'gallery', index: i, items: g.figs.length, problems: p });
    });
    filterSets.forEach(function (f, i) {
      var p = [];
      var tag = f.chips[1].getAttribute('data-ux-filter');
      f.show(tag, true);
      var shown = f.items.filter(function (x) { return !x.hidden; });
      if (!shown.length) p.push('a filter shows nothing');
      if (shown.some(function (x) { return x.getAttribute('data-tag') !== tag; })) p.push('a filter shows other kinds');
      f.show('', true);
      if (f.items.some(function (x) { return x.hidden; })) p.push('"All" does not show everything');
      out.push({ kind: 'filter', index: i, items: f.items.length, problems: p });
    });
    legends.forEach(function (l, i) {
      var p = [];
      var b = l.btns[1];
      l.toggle(b);
      var hidden = $$(l.svg, '.s1').every(function (m) { return m.classList.contains('is-off'); });
      if (!hidden) p.push('hiding a series leaves it drawn');
      l.toggle(b);
      if ($$(l.svg, '.is-off').length) p.push('a series shown again stays hidden');
      l.btns.forEach(function (x, k) { if (k > 0 && x.getAttribute('aria-pressed') !== 'false') l.toggle(x); });
      if (l.toggle(l.btns[0])) p.push('every series can be hidden');
      l.btns.forEach(function (x) { if (x.getAttribute('aria-pressed') === 'false') l.toggle(x); });
      out.push({ kind: 'chart', index: i, items: l.btns.length, problems: p });
    });
    tableFilters.forEach(function (t, i) {
      var p = [];
      var rows = $$(t.body, 'tr');
      var probe = text(rows[rows.length - 1].children[0]);
      t.input.value = probe;
      t.run();
      var shown = rows.filter(function (r) { return !r.hidden; });
      if (!shown.length) p.push('filtering by a row’s own words hides it');
      if (shown.length === rows.length && rows.length > 1 && rows.some(function (r) { return text(r).toLowerCase().indexOf(probe.toLowerCase()) < 0; })) p.push('filtering hides nothing');
      t.input.value = '';
      t.run();
      if (rows.some(function (r) { return r.hidden; })) p.push('clearing the filter does not show every row');
      out.push({ kind: 'table', index: i, items: rows.length, problems: p });
    });
    configs.forEach(function (c, i) {
      var p = [];
      var before = picked(c);
      var start = c.update();
      var groups = $$(c.form, 'fieldset');
      groups.forEach(function (g) { var opts = $$(g, 'input[type=radio]'); opts[opts.length - 1].checked = true; });
      var after = c.update();
      var priced = $$(c.form, 'input[data-price]').some(function (r) { return parseFloat(r.getAttribute('data-price')) > 0; });
      if (priced && after === start && groups.some(function (g) { var o = $$(g, 'input'); return o[0].getAttribute('data-price') !== o[o.length - 1].getAttribute('data-price'); })) p.push('the total does not change with the choice');
      var labels = groups.map(function (g) { var o = $$(g, 'input'); return o[o.length - 1].getAttribute('data-label'); });
      if (c.choice && labels.some(function (l) { return c.choice.textContent.indexOf(l) < 0; })) p.push('the choice is not said');
      c.form.dispatchEvent(new Event('submit', { cancelable: true }));
      if (c.done && c.done.hidden) p.push('the action shows nothing');
      else if (c.done && !/prototype/i.test(c.done.textContent)) p.push('the action does not say it is a prototype');
      before.forEach(function (r) { r.checked = true; });
      c.update();
      out.push({ kind: 'configurator', index: i, items: groups.length, problems: p });
    });
    return out;
  }
  function picked(c) { return $$(c.form, 'input[type=radio]:checked'); }

  // the audit's look at whether each booking works: choose, confirm, see it, and back as it was
  function selfTest() {
    return bookings.map(function (b, i) {
      var problems = [];
      var root = b.root;
      var open = $$(root, 'input[name$="-time"]:not([disabled])');
      if (!open.length) problems.push('no time can be chosen');
      var before = b.chosen();
      var dayBefore = $(root, 'input[name$="-day"]:checked');
      var btn = $(root, '[data-ux-confirm]');
      // confirming with nothing chosen must say so, not book
      if (!before) {
        if (b.confirm(true)) problems.push('confirmed with no time chosen');
        var err = $(root, '[data-ux-error]');
        if (err && err.hidden) problems.push('no message when confirming without a time');
        if (err) err.hidden = true;
      }
      var pick = open.filter(function (r) { return !r.closest('[hidden]'); })[0] || open[0];
      if (pick) {
        var fs = pick.closest('.bk-times');
        if (fs && fs.hidden) {
          var day = $(root, 'input[name$="-day"][value="' + fs.getAttribute('data-day') + '"]');
          if (day) { day.checked = true; day.dispatchEvent(new Event('change', { bubbles: true })); }
        }
        pick.checked = true;
        pick.dispatchEvent(new Event('change', { bubbles: true }));
        if (btn && btn.getAttribute('aria-disabled') !== 'false') problems.push('choosing a time does not enable the confirm action');
        var choice = $(root, '[data-ux-bind="choice"]');
        if (choice && choice.textContent.indexOf(pick.getAttribute('data-time')) < 0) problems.push('the chosen time is not shown');
        b.confirm(true);
        var done = $(root, '[data-ux-done]');
        if (!done || done.hidden) problems.push('confirming does not show a confirmation');
        else if (done.textContent.indexOf(pick.getAttribute('data-time')) < 0) problems.push('the confirmation does not say which time');
        b.change();
        // back exactly as it was: its day, its time (or none), its summary
        if (dayBefore) { dayBefore.checked = true; b.showDay(dayBefore.value); }
        pick.checked = false;
        if (before) before.checked = true;
        b.say();
      }
      return { index: i, kind: 'booking', slots: open.length, problems: problems };
    }).concat(forms.map(testForm));
  }
  // a form: empty, each required field is said beside it; complete, it is accepted; then back as it was
  function testForm(fm, i) {
    var problems = [];
    var inputs = $$(fm.root, 'input, textarea, select').filter(function (x) { return x.type !== 'hidden' && x.type !== 'submit'; });
    var saved = inputs.map(function (x) { return x.type === 'checkbox' || x.type === 'radio' ? x.checked : x.value; });
    var required = inputs.filter(function (x) { return x.required; });
    inputs.forEach(function (x) {
      if (x.type === 'checkbox' || x.type === 'radio') x.checked = false;
      else if (x.tagName === 'SELECT') x.selectedIndex = -1;
      else x.value = '';
    });
    var empty = fm.check();
    if (required.length && !empty) problems.push('an empty form is accepted');
    if (required.length && !$(fm.root, '.fm-error')) problems.push('no message beside a missing field');
    inputs.forEach(function (x) {
      if (x.type === 'checkbox' || x.type === 'radio') x.checked = true;
      else if (x.tagName === 'SELECT') { var o = $$(x, 'option').findIndex(function (op) { return !!op.value; }); x.selectedIndex = o < 0 ? 0 : o; }
      else x.value = x.type === 'email' ? 'name@example.com' : x.type === 'tel' ? '+44 20 7946 0000' : x.type === 'number' ? '1' : x.type === 'date' ? '2030-01-01' : 'Sample';
    });
    if (fm.check()) problems.push('a complete form is refused');
    inputs.forEach(function (x, j) {
      if (x.type === 'checkbox' || x.type === 'radio') x.checked = saved[j];
      else x.value = saved[j];
      x.removeAttribute('aria-invalid');
      x.removeAttribute('aria-describedby');
    });
    $$(fm.root, '.fm-error').forEach(function (n) { n.parentNode.removeChild(n); });
    $$(fm.root, '.field.is-invalid').forEach(function (n) { n.classList.remove('is-invalid'); });
    return { index: i, kind: 'form', slots: inputs.length, problems: problems };
  }
  window.__uxBehaviors = { selfTest: selfTest, selfTestInteractive: selfTestInteractive, bookings: bookings.length, forms: forms.length, galleries: galleries.length, filters: filterSets.length, charts: legends.length, tables: tableFilters.length, configurators: configs.length };
})();`;
