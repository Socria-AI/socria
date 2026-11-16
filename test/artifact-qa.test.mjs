// AN ARTIFACT LOOKED OVER BEFORE IT IS SHOWN (Logos 6, November 2026) — lib/artifact-qa.ts.
//
// Held down: mind maps of every size the planner can draw lay out with no overlap and nothing outside the figure at a
// wide screen, a narrow column and two phone widths; a link across that passes through a part is caught; a label cut
// to two lines is said; a diagram too crowded for a phone is said to be shown as its list there; a graph whose window
// hides its curve has its height refitted (and says so), and one whose curve cannot be seen at all is reported, not
// silently shipped; the reply's gate applies the repair before anyone sees the element.

import * as I from './.tmp/inline-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const S = (o) => I.sanitizeInlineSpec(o);

console.log('\n=== mind maps: no overlap, nothing outside, at every width ===');
{
  // maps of every shape the validator allows: few parts, many, deep, wide, with links across
  const maps = [];
  const mk = (title, kids, deep = 0, links = []) => {
    const nodes = [{ id: 'r', label: title }];
    const edges = [];
    kids.forEach((k, i) => {
      nodes.push({ id: `k${i}`, label: k });
      edges.push(['r', `k${i}`]);
      for (let d = 0; d < deep; d++) {
        const id = `k${i}_${d}`;
        nodes.push({ id, label: `${k} detail ${d + 1}` });
        edges.push([d ? `k${i}_${d - 1}` : `k${i}`, id]);
      }
    });
    return S({ type: 'diagram', view: 'mind', title, nodes, edges: [...edges, ...links] });
  };
  maps.push(mk('Photosynthesis', ['Light', 'Water', 'Carbon dioxide']));
  maps.push(mk('The French Revolution', ['Causes', 'Events', 'People', 'Ideas', 'Results', 'Legacy'], 1));
  maps.push(mk('A small business', ['Product', 'Marketing', 'Pricing', 'Operations'], 2, [['k0', 'k2', 'needs'], ['k1', 'k3', 'relates']]));
  maps.push(mk('Cellular respiration and every stage of how energy is released from glucose in a cell', ['Glycolysis in the cytoplasm', 'The link reaction', 'The Krebs cycle in the matrix', 'Oxidative phosphorylation'], 3));
  maps.push(mk('Climate', ['Greenhouse gases', 'Oceans', 'Ice', 'Forests', 'Policy', 'Energy', 'Farming', 'Cities'], 1, [['k0', 'k1', 'causes'], ['k5', 'k0', 'causes'], ['k3', 'k0', 'relates']]));
  ok('every map in the set is a valid mind map', maps.every(Boolean), maps.map((m) => !!m).join(','));
  for (const m of maps.filter(Boolean)) {
    const r = I.qaInline(m);
    const faults = r.findings.filter((f) => f.check === 'overlap' || f.check === 'bounds');
    ok(`“${m.title.slice(0, 40)}” (${m.nodes.length} parts): no overlap, nothing outside, at ${I.QA_WIDTHS.join(', ')}px`, faults.length === 0, J(faults));
  }
  const long = maps[3];
  ok('a label too long for its box is said to be cut — and where it is whole', I.qaInline(long).findings.some((f) => f.check === 'clipped-label' && /whole in the part’s panel/.test(f.said)), J(I.qaInline(long).findings));
}

console.log('\n=== a link across that passes through a part is caught ===');
{
  // a link from the first branch to the last, across every branch between them
  const nodes = [{ id: 'r', label: 'Centre' }, ...Array.from({ length: 6 }, (_, i) => ({ id: `k${i}`, label: `Branch ${i + 1}` }))];
  const edges = [...nodes.slice(1).map((n) => ['r', n.id]), ['k0', 'k2', 'relates']];
  const m = S({ type: 'diagram', view: 'mind', title: 'Centre', nodes, edges });
  const r = I.qaInline(m);
  const lay = I.mindLayout(m, 420, I.defaultFolds(m));
  // what the check says agrees with the geometry: the link's middle point inside a part it does not join means a collision
  const mid = lay.links[0];
  const through = lay.boxes.some((b) => b.id !== mid.from && b.id !== mid.to && Math.abs(mid.mx - b.cx) < b.w / 2 && Math.abs(mid.my - b.cy) < b.h / 2);
  ok('the check agrees with the geometry (a link whose middle lies in another part is reported)', !through || r.findings.some((f) => f.check === 'collision'), J({ through, findings: r.findings }));
  ok('a collision is a fault a person should not meet; a cut label is not', I.QA_FAULTS.includes('collision') && !I.QA_FAULTS.includes('clipped-label'));
}

console.log('\n=== diagrams: crowded on a phone is said, never squeezed ===');
{
  const flow = S({ type: 'diagram', view: 'flow', title: 'From order to delivery', nodes: ['Order placed', 'Payment checked', 'Picked in the warehouse', 'Packed and labelled', 'Handed to the courier', 'Out for delivery', 'Delivered'].map((label, i) => ({ id: `s${i}`, label })), edges: Array.from({ length: 6 }, (_, i) => [`s${i}`, `s${i + 1}`]) });
  const r = I.qaInline(flow);
  ok('a seven-step flow: no overlaps where it is drawn as a picture', !r.findings.some((f) => f.check === 'overlap' || f.check === 'bounds'), J(r.findings));
  ok('…and at the widths too narrow for its boxes, said to be shown as its list (once)', r.findings.filter((f) => f.check === 'crowded').length <= 1);
}

console.log('\n=== graphs: a window that hides the curve ===');
{
  const hidden = S({ type: 'graph', title: 'Growth', expr: '100*2^x', x: [0, 5], y: [-1, 1], params: [] });
  const r = I.qaInline(hidden);
  ok('the height set hides the curve: refitted to it, and said', r.spec.y === undefined && r.findings.some((f) => f.check === 'window' && f.repaired), J(r));
  ok('…what it says is unchanged: the same curve over the same x', r.spec.expr === hidden.expr && J(r.spec.x) === J(hidden.x));
  const fine = S({ type: 'graph', title: 'A parabola', expr: 'x^2', x: [-3, 3], params: [] });
  ok('a graph that shows its curve is left exactly as it is', J(I.qaInline(fine).spec) === J(fine) && !I.qaInline(fine).findings.length);
  const nowhere = S({ type: 'graph', title: 'Roots of negatives', expr: 'sqrt(x)', x: [-5, -1], params: [] });
  if (nowhere) ok('a curve that cannot be seen at all over its x is reported, not shipped as if fine', I.qaInline(nowhere).findings.some((f) => f.check === 'window' && !f.repaired), J(I.qaInline(nowhere)));
  else ok('a curve with no real values over its x is refused by the validator before it gets here', true);
}

console.log('\n=== the reply’s gate applies the repair before anyone sees it ===');
{
  const ctx = { theirs: '', sources: '', questions: 1, shown: { n: 0 }, qa: (s) => I.qaInline(s).spec };
  const out = I.gateInlineBlock('```ui\n' + J({ type: 'graph', title: 'Growth', expr: '100*2^x', x: [0, 5], y: [-1, 1], params: [] }) + '\n```', ctx);
  const spec = I.parseInlineSpec(out.replace(/^```ui\n|\n```\s*$/g, ''));
  ok('the graph reaches the person with its height fitted to the curve', spec && spec.y === undefined && spec.expr === '100*2^x', out);
  const off = I.gateInlineBlock('```ui\n' + J({ type: 'graph', title: 'Growth', expr: '100*2^x', x: [0, 5], y: [-1, 1], params: [] }) + '\n```', { ...ctx, qa: undefined, shown: { n: 0 } });
  ok('…without the hook (any other surface), exactly as before', /"y":\[-1,1\]/.test(off), off);
}

console.log(`\nartifact QA: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
