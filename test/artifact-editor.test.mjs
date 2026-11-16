// THE ARTIFACT'S OWN WORKSPACE, USED AS A PERSON USES IT (Logos 6, November 2026) — in a browser (jsdom).
//
// Held down here, by pressing and typing rather than by reading markup: Edit opens the editor and nothing else does;
// a change typed shows at once, keeps exactly what was typed, and is saved by itself after a pause as one step that
// says what changed; a formula half-written never breaks the picture; words the artifact can read are applied as an
// edit, the rest go to Socria about this artifact by name; Versions lists each change with who made it (using it —
// a slider moved — is not a version); a version chosen is shown and nothing is erased; Redo, Duplicate and Export
// do what they say; a reader sees the element and no way to edit it.
//
// The browser is set up BEFORE anything that loads React DOM is imported (the display shell imports createPortal):
// React DOM decides at load whether the page can tell it about typing, and one loaded first never hears it.

import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { pretendToBeVisual: true, url: 'https://socria.app/logos' });
for (const k of ['window', 'document', 'navigator', 'HTMLElement', 'HTMLAnchorElement', 'HTMLInputElement', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'XMLSerializer', 'Image', 'sessionStorage', 'SVGElement']) {
  try {
    globalThis[k] = k === 'window' ? dom.window : dom.window[k];
  } catch {}
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = await import('react');
const { createElement: h, act } = React;
const { createRoot } = await import('react-dom/client');
const I = await import('./.tmp/inline-under-test.mjs');
const { ObjectFigure } = await import('./.tmp/ObjectFigure.mjs');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const S = (o) => I.sanitizeInlineSpec(o);
const MARKET = S({ type: 'graph', title: 'A tax on sellers', expr: '10-x', label: 'demand', curves: [{ expr: '2+x+t', label: 'supply' }], x: [0, 10], params: [{ name: 't', label: 'tax', value: 0, min: 0, max: 4, step: 0.5 }], features: ['crossings'] });

console.log('\n=== the editor, pressed and typed into ===');
{
  const quiet = console.error;
  console.error = () => {};
  const downloads = [];
  URL.createObjectURL = () => 'blob:socria/x';
  URL.revokeObjectURL = () => {};
  dom.window.HTMLAnchorElement.prototype.click = function () { downloads.push(this.download); };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const byText = (root, sel, t) => [...root.querySelectorAll(sel)].find((e) => e.textContent.trim() === t || e.textContent.trim().startsWith(t));
  const type = async (el, v) => {
    const set = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      set.call(el, v);
      el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
  };
  const click = async (el) => act(async () => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })));
  try {
    const k = I.keptFrom(MARKET, undefined, { session: 'sL6_edit_0001', message: 'm_edit1', said: 'A tax shifts supply up…', at: 1730000000000 });
    let space = I.makeDisplay(I.EMPTY_SPACE, 'kept', k, 'person').space;
    const id = space.objs[0].id;
    // a slider moved in Artifacts before any edit: a step Undo takes back, not a version
    space = I.applyObjectStep(space, id, 'state', { state: J({ values: { t: 1 } }) }, { by: 'person', at: 1730000001000 }).space;
    const log = [];
    const sent = [];
    let setOuter = null;
    function Harness() {
      const [sp, setSp] = React.useState(space);
      setOuter = setSp;
      const o = sp.objs.find((x) => x.id === id);
      return h(ObjectFigure, {
        obj: o,
        at: o.at,
        mode: 'live',
        onOp: (op, args) => {
          const r = I.applyObjectStep(sp, id, op, args, { by: 'person', at: Date.now() });
          log.push({ op, args, ok: r.ok });
          if (r.ok) setSp(r.space);
          return r.ok ? { ok: true } : { ok: false, why: r.why };
        },
        onSeek: (at) => setSp(I.seekObject(sp, id, at)),
        onWorkspace: (a) => (log.push({ workspace: a }), { ok: true }),
        onSend: (t) => sent.push(t),
      });
    }
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(h(Harness)));
    const tools = host.querySelector('.dsp-tools');
    ok('Artifacts: Edit, Versions, Duplicate and Export are real buttons on the kept element', ['Edit', 'Versions', 'Duplicate', 'Export'].every((t) => byText(tools, 'button', t)), tools?.textContent);
    ok('…using it (the slider moved) is not counted as a version', byText(tools, 'button', 'Versions').textContent.trim() === 'Versions');
    ok('…and the editor is closed until Edit is pressed: the element alone', !host.querySelector('.kp-edit') && host.querySelector('.kp-body .ln'));
    await click(byText(tools, 'button', 'Edit'));
    ok('Edit opens the artifact’s own workspace: the element large, its controls beside it', host.querySelector('.kp-edit .kp-edit-pic .ln') && host.querySelector('.kp-edit-panel .se'), host.innerHTML.slice(0, 300));
    const title = [...host.querySelectorAll('.se-field')].find((l) => l.querySelector('.se-k')?.textContent === 'Title')?.querySelector('input');
    await type(title, 'A tax on sellers, ');
    ok('typed: the field keeps what was typed (the trailing space and comma), the picture follows at once', title.value === 'A tax on sellers, ' && /Saving/.test(host.textContent), title.value);
    await type(title, 'A tax on sellers, shared');
    const saves = () => log.filter((l) => l.op === 'spec' || l.op === 'edit');
    ok('…not saved on every keystroke', !saves().length);
    await act(async () => sleep(1100));
    const saved = saves();
    ok('saved by itself after a pause, as one step that says what changed', saved.length === 1 && saved[0].ok && String(saved[0].args.said) === 'renamed it “A tax on sellers, shared”', J(saved));
    ok('…carrying only what changed (the title), not the whole artifact again', saved[0]?.op === 'edit' && J(JSON.parse(String(saved[0].args.ops))) === J([{ op: 'replace', path: '/title', value: 'A tax on sellers, shared' }]), J(saved[0]));
    ok('…the field still says exactly what was typed', title.value === 'A tax on sellers, shared');
    ok('…and it is now a version', byText(host.querySelector('.dsp-tools'), 'button', 'Versions').textContent.trim() === 'Versions (2)', byText(host.querySelector('.dsp-tools'), 'button', 'Versions').textContent);
    const eq = [...host.querySelectorAll('.se-field input')].find((i) => i.value === '2+x+t');
    await type(eq, '2+x+t+');
    ok('a formula half-written does not break the picture, nor take the curve out of it: a line says it does not hold yet', /A curve does not hold as it stands — the picture shows the last version that held/.test(host.textContent) && /supply/.test(host.querySelector('.kp-edit-pic .ln-eqs')?.textContent ?? ''), J({ said: host.querySelector('.se-problem')?.textContent, eqs: host.querySelector('.kp-edit-pic .ln-eqs')?.textContent }));
    await type(eq, '2+x+t');
    await act(async () => sleep(1100));
    ok('…and put back, nothing is saved (it changes nothing)', saves().length === 1, J(log.map((l) => l.op)));
    const askBox = host.querySelector('.kp-ask input');
    await type(askBox, 'add the curve y = 2 + x called supply before');
    await act(async () => host.querySelector('.kp-ask').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    ok('words it can read are applied at once, as an edit — the rest of it untouched', log.at(-1)?.op === 'edit' && log.at(-1).ok && /Changed — added the curve “supply before”/.test(host.textContent), J(log.at(-1)));
    await type(host.querySelector('.kp-ask input'), 'compare two tax rates side by side');
    await act(async () => host.querySelector('.kp-ask').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
    ok('words it cannot read go to Socria, about this artifact by name', sent.length === 1 && sent[0] === 'A tax on sellers, shared: compare two tax rates side by side' && /Asked Socria/.test(host.textContent), J(sent));
    await click(byText(host.querySelector('.dsp-tools'), 'button', 'Versions'));
    const items = [...host.querySelectorAll('.kp-versions li')];
    ok('Versions lists what was kept and each change, with who made it — the slider move is not one', items.length === 3 && /As kept from the conversation/.test(items[0].textContent) && /chosen by you/.test(items[1].textContent) && /Added the curve/.test(items[2].textContent) && items[2].className === 'is-on', items.map((i) => i.textContent).join(' | '));
    await click(items[0].querySelector('button'));
    ok('a version chosen is shown — the title as it was kept — and marked; nothing is erased', host.querySelector('.kp-versions li').className === 'is-on' && /Showing an earlier version/.test(host.textContent) && byText(host.querySelector('.dsp-tools'), 'button', 'Versions').textContent.trim() === 'Versions (3)', host.querySelector('.kp-versions')?.textContent);
    ok('…the editor follows the version shown (Undo restarts the form from it)', [...host.querySelectorAll('.se-field')].find((l) => l.querySelector('.se-k')?.textContent === 'Title')?.querySelector('input').value === 'A tax on sellers');
    const redo = host.querySelector('button[aria-label="Redo"]');
    await click(redo);
    ok('Redo steps forward again, through the slider move too', !!redo);
    await click(byText(host.querySelector('.dsp-tools'), 'button', 'Duplicate'));
    ok('Duplicate copies it as an artifact of its own, from the version showing', log.some((l) => l.workspace?.type === 'branch' && l.workspace.obj === id) && /Copied as an artifact of its own/.test(host.textContent));
    await click(byText(host.querySelector('.dsp-tools'), 'button', 'Export'));
    const menu = host.querySelector('.kp-export-menu');
    ok('Export offers its data, its picture and an image', menu && ['Data (JSON)', 'Picture (SVG)', 'Image (PNG)'].every((t) => byText(menu, 'button', t)));
    await click(byText(menu, 'button', 'Data (JSON)'));
    ok('…the data downloads under its name', downloads.at(-1) === 'a-tax-on-sellers.json' || /\.json$/.test(downloads.at(-1) ?? ''), J(downloads));
    await click(byText(host.querySelector('.dsp-tools'), 'button', 'Export'));
    await click(byText(host.querySelector('.kp-export-menu'), 'button', 'Picture (SVG)'));
    ok('…and the picture, as an SVG', /\.svg$/.test(downloads.at(-1) ?? ''), J(downloads));
    await click(byText(host.querySelector('.dsp-tools'), 'button', 'Done'));
    ok('Done closes the editor; the element stays as changed', !host.querySelector('.kp-edit') && host.querySelector('.kp-body .ln'));
    // read-only (someone else’s line, read by a viewer): it is shown, never edited
    const ro = document.createElement('div');
    document.body.appendChild(ro);
    const r2 = createRoot(ro);
    await act(async () => r2.render(h(ObjectFigure, { obj: space.objs[0], at: space.objs[0].at, mode: 'live' })));
    ok('read-only: no Edit, no Duplicate, no controls — the element alone', !byText(ro, 'button', 'Edit') && !byText(ro, 'button', 'Duplicate') && !ro.querySelector('.se') && ro.querySelector('.kp-body .ln'));
    void setOuter;
  } finally {
    console.error = quiet;
  }
}


console.log(`\nartifact editor: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
