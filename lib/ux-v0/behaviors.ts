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
//   table     column headers sort the rows (ascending, then descending).
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
  function formBehaviour(f) {
    f.addEventListener('submit', function (e) {
      e.preventDefault();
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

  var bookings = $$(document, '[data-ux-booking]').filter(fresh).map(booking).filter(Boolean);
  $$(document, 'form[data-ux-form]').filter(fresh).forEach(formBehaviour);
  $$(document, '.table-card table').filter(fresh).forEach(tableBehaviour);

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
      return { index: i, slots: open.length, problems: problems };
    });
  }
  window.__uxBehaviors = { selfTest: selfTest, bookings: bookings.length };
})();`;
