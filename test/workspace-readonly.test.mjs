// Panels for someone who may only look.
//
// A viewer or commenter in a shared line of thinking could drag a slider in
// the model, parameters or trace panels: the write was refused (403) and the
// screen stopped following the owner's (audit exp5-sync.mjs). Each panel that
// writes the model now takes `readOnly`: its controls are still shown, but
// disabled and titled "View only", and no edit callback can fire.
//
// Checked twice: on the markup a browser receives (react-dom/server), and by
// driving the rendered panel in a DOM (jsdom) the way a person would — each
// time with the panel NOT read-only as the control, so a test that "nothing
// fired" is not passing because nothing could have.

import { renderToStaticMarkup } from 'react-dom/server';
import { createElement as h } from 'react';
import { ModelPanel, ParamsPanel, TracePanel, VIEW_ONLY } from './.tmp/panels.mjs';
import { openFromProposal, setValue, docOf, EMPTY_WORKSPACE } from './.tmp/docs.mjs';
import { torus } from './.tmp/library.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

let ws = openFromProposal(EMPTY_WORKSPACE, torus(), { at: 1 }).workspace;
ws = setValue(ws, 'torus', 'r', 2.5, 2).workspace;
ws = setValue(ws, 'torus', 'r', 3, 3).workspace;
const doc = docOf(ws, 'torus'); // three revisions, at the last: undo and two restores are possible
const noop = () => {};
const count = (html, re) => (html.match(re) || []).length;

console.log('=== the markup ===');
{
  const ro = renderToStaticMarkup(h(ParamsPanel, { doc, focus: null, onModel: noop, onFocus: noop, readOnly: true }));
  const rw = renderToStaticMarkup(h(ParamsPanel, { doc, focus: null, onModel: noop, onFocus: noop }));
  const sliders = count(rw, /<input type="range"/g);
  ok('the parameters panel shows its sliders either way', sliders === 2 && count(ro, /<input type="range"/g) === sliders, String(sliders));
  ok('  read-only, every slider is disabled', count(ro, /<input type="range"[^>]*disabled=""/g) === sliders, ro.slice(0, 400));
  ok('  and says why when pointed at', count(ro, new RegExp(`title="${VIEW_ONLY.replace(/[—]/g, '.')}"`, 'g')) >= sliders);
  ok('  and the panel says it is view only', /view only/.test(ro));
  ok('not read-only, nothing changed: no slider disabled', !/disabled=""/.test(rw) && !/view only/i.test(rw));
  ok('  the control names still select — reading, not editing', count(ro, /<button type="button" class="ws-ctl-name"/g) === sliders && !/<button[^>]*class="ws-ctl-name"[^>]*disabled/.test(ro));

  const tro = renderToStaticMarkup(h(TracePanel, { doc, onUndo: noop, onRedo: noop, onRestore: noop, readOnly: true }));
  const trw = renderToStaticMarkup(h(TracePanel, { doc, onUndo: noop, onRedo: noop, onRestore: noop }));
  ok('the trace shows its history either way', count(tro, /ws-trace-said/g) === 3 && count(trw, /ws-trace-said/g) === 3);
  ok('  read-only, undo, redo and every return-to-this-point are disabled', count(tro, /<button type="button" disabled=""/g) === count(tro, /<button type="button"/g), tro);
  ok('  each titled View only', count(tro, /title="View only/g) === count(tro, /<button type="button"/g));
  ok('not read-only, undo and the two earlier points are live', /<button type="button">Undo<\/button>/.test(trw) && count(trw, /<li[^>]*><button type="button" title="Return the model to this point">/g) === 2, trw);

  // the model view is a client component; rendered on the server it says so about its layout effects
  const said = console.error;
  console.error = (...a) => (/useLayoutEffect does nothing on the server/.test(String(a[0])) ? undefined : said(...a));
  const mro = renderToStaticMarkup(h(ModelPanel, { doc, viz: null, onModel: noop, readOnly: true }));
  const mrw = renderToStaticMarkup(h(ModelPanel, { doc, viz: null, onModel: noop }));
  console.error = said;
  ok('the model panel, read-only, holds the model in a disabled fieldset titled View only', /<fieldset disabled="" title="View only/.test(mro));
  ok('  the model is still drawn', /class="eng-stack"/.test(mro) && /class="eng-stack"/.test(mrw));
  ok('not read-only, the model panel is exactly as it was: no fieldset', !/<fieldset/.test(mrw));
}

console.log('=== driven like a person would ===');
{
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
  const w = dom.window;
  for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    try {
      globalThis[k] = k === 'window' ? w : w[k];
    } catch {}
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const quiet = console.error;
  console.error = (...a) => (/not wrapped in act|ReactDOMTestUtils|Not implemented/.test(String(a[0])) ? undefined : quiet(...a));

  const mount = async (el) => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(el));
    return { host, unmount: () => act(async () => root.unmount()) };
  };
  const slide = async (input, value) => {
    const set = Object.getOwnPropertyDescriptor(w.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      set.call(input, String(value));
      input.dispatchEvent(new w.Event('input', { bubbles: true }));
      input.dispatchEvent(new w.Event('change', { bubbles: true }));
    });
  };
  const press = async (button) => {
    await act(async () => {
      button.dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
    });
  };

  // parameters
  for (const readOnly of [false, true]) {
    const calls = [];
    const p = await mount(h(ParamsPanel, { doc, focus: null, onModel: (...a) => calls.push(a), onFocus: noop, readOnly }));
    const input = p.host.querySelector('input[type="range"]');
    await slide(input, 1.25);
    if (readOnly) ok('read-only: dragging a parameter calls nothing', calls.length === 0, String(calls.length));
    else ok('(control) not read-only, the same drag reaches onModel', calls.length === 1 && calls[0][0] === 'torus');
    await p.unmount();
  }

  // trace
  for (const readOnly of [false, true]) {
    const calls = [];
    const p = await mount(h(TracePanel, { doc, onUndo: (id) => calls.push(['undo', id]), onRedo: (id) => calls.push(['redo', id]), onRestore: (id, at) => calls.push(['restore', id, at]), readOnly }));
    const buttons = [...p.host.querySelectorAll('button')];
    for (const b of buttons) await press(b);
    if (readOnly) ok('read-only: undo, redo and every restore call nothing', calls.length === 0, JSON.stringify(calls));
    else ok('(control) not read-only, undo and the restores are called', calls.some((c) => c[0] === 'undo') && calls.filter((c) => c[0] === 'restore').length === 2, JSON.stringify(calls));
    await p.unmount();
  }

  // the model panel: whatever controls the model view draws are inert
  {
    const calls = [];
    const p = await mount(h(ModelPanel, { doc, viz: null, onModel: (...a) => calls.push(a), readOnly: true }));
    const controls = [...p.host.querySelectorAll('input, button, select, textarea')];
    ok('read-only: every control the model draws is disabled, by its fieldset', controls.length > 0 && controls.every((c) => c.matches(':disabled')), `${controls.length} controls, ${controls.filter((c) => !c.matches(':disabled')).length} live`);
    for (const c of controls.filter((x) => x.matches('input[type="range"]'))) await slide(c, Number(c.max));
    for (const c of controls.filter((x) => x.matches('button'))) await press(c);
    ok('  and touching them reaches nothing', calls.length === 0, String(calls.length));
    await p.unmount();
  }
  console.error = quiet;
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
