// NEW LOGOS — VISUAL PRIMITIVES AND COMPOSABLE ARTIFACTS (docs/NEW-LOGOS.md, "Primitives and artifacts").
//
// What is held down:
//   • the expression language is parsed and walked, never executed: precedence, implicit multiplication, functions,
//     errors in words, and no way to reach anything but numbers;
//   • every primitive's content is structured, serialisable and checked: what does not belong is dropped, limits hold,
//     references to primitives that are not there are removed, unsafe addresses refused;
//   • shared state: variables and equation definitions are worked out in dependency order; a cycle or an unknown name
//     is an error on that equation and the rest still work; plots, table formulas and live text read the same scope,
//     so changing a variable changes every dependent primitive;
//   • the references between primitives come from the data (what each reads);
//   • one operation vocabulary changes a composition: malformed batches are refused whole, operations on what is gone
//     are skipped, a batch sent twice does nothing more, renaming a variable rewrites its uses, the size limit holds,
//     and every batch can be undone exactly;
//   • on the server, operations are applied to what is stored (concurrent edits both land), versioned per burst, and
//     refused for what is not an artifact or is archived;
//   • the assistant is told an artifact's structured state, within the existing chat contracts.

import * as X from './.tmp/new-logos-under-test.mjs';

const { Expr: E, Prim: P, Compose: C, AOps: O } = X;
let pass = 0,
  fail = 0;
const ok = (name, cond, extra = '') => (cond ? (pass++, console.log('  ok   ' + name)) : (fail++, console.log('  FAIL ' + name + (extra ? '  ' + String(extra).slice(0, 400) : ''))));
const ev = (s, values = {}, locals) => {
  try {
    return E.evaluate(E.parse(s), { values, locals });
  } catch (e) {
    return `ERR ${e.message}`;
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const comp = (primitives = [], variables = []) => P.sanitizeComposition({ primitives, variables });

console.log('\n=== the expression language ===');
{
  ok('precedence and associativity: 2^3^2 = 512, 10-2-3 = 5, 8/2/2 = 2', ev('2^3^2') === 512 && ev('10 - 2 - 3') === 5 && ev('8/2/2') === 2);
  ok('−x² is −(x²)', ev('-x^2', { x: 3 }) === -9 && ev('-2^2') === -4);
  ok('implicit multiplication: 2x, 3(x+1), (1+2)(3+4), a b', ev('2x', { x: 3 }) === 6 && ev('3(x+1)', { x: 2 }) === 9 && ev('(1+2)(3+4)') === 21 && ev('a b', { a: 2, b: 5 }) === 10);
  ok('a(b + 1) with a a value is a product; with a a function, a call', ev('a(b+1)', { a: 2, b: 3 }) === 8);
  ok('two numbers side by side are a mistake, said in words', String(ev('2 3')).startsWith('ERR Unexpected'));
  ok('comparisons and logic give 1 or 0; if chooses', ev('1 < 2 and 3 > 4') === 0 && ev('1 < 2 or 3 > 4') === 1 && ev('not 0') === 1 && ev('if(x > 0, 1, -1)', { x: -2 }) === -1);
  ok('functions and constants', Math.abs(ev('sin(pi/2)') - 1) < 1e-12 && ev('max(1, 5, 3)') === 5 && ev('log(8, 2)') === 3 && ev('round(3.14159, 2)') === 3.14 && ev('mod(-1, 3)') === 2);
  ok('a wrong number of values is said in words', String(ev('sin(1, 2)')).includes('takes 1 value'));
  ok('an unknown name is said in words', ev('zz + 1') === 'ERR “zz” is not defined.');
  ok('nothing but numbers can be reached: no properties, no constructors, no prototype', [ev('constructor'), ev('__proto__'), ev('toString(1)'), ev('valueOf'), ev('constructor(1)'), ev('1 constructor 2'), ev('hasOwnProperty')].every((r) => String(r).startsWith('ERR')), [ev('constructor'), ev('__proto__'), ev('constructor(1)'), ev('1 constructor 2')].join(' | '));
  const viaFn = (() => {
    try {
      return E.evaluate(E.parse('f(1)'), { values: {}, fns: { f: { params: ['x'], ast: E.parse('x + constructor') } } });
    } catch (e) {
      return `ERR ${e.message}`;
    }
  })();
  ok('…not even inside a function, whose parameters are its only extra names', viaFn === 'ERR “constructor” is not defined.');
  ok('names that JavaScript objects already have cannot be given to anything', !E.isIdent('constructor') && !E.isIdent('__proto__') && !E.isIdent('toString') && !E.isIdent('prototype') && !E.isIdent('__x'));
  const proto = P.sanitizePrimitive({ type: 'table', data: { columns: [{ id: 'constructor', name: 'C', kind: 'number' }, { id: '__proto__', name: 'P', kind: 'number' }], rows: [{ cells: { constructor: '1' } }] } });
  ok('a part cannot take such a name as its id either (it would read as that thing)', proto.data.columns.every((c) => c.id !== 'constructor' && c.id !== '__proto__') && C.computeTable(proto.data, C.evaluateScope(P.EMPTY_COMPOSITION)).length === 1);
  ok('characters that are not part of the language are refused', String(ev('a.b')).startsWith('ERR') && String(ev('x; y')).startsWith('ERR') && String(ev('"s"')).startsWith('ERR'));
  ok('length and nesting are limited', String(ev('1+'.repeat(300) + '1')).startsWith('ERR') && String(ev('('.repeat(80) + '1' + ')'.repeat(80))).startsWith('ERR'));
  ok('x^2y is x²·y, and 2x^2 is 2·x² (implicit multiplication at the level of ×)', ev('x^2y', { x: 2, y: 3 }) === 12 && ev('2x^2', { x: 3 }) === 18 && ev('1/2x', { x: 4 }) === 2);
  ok('a negated factor is drawn in brackets, never as a subtraction', E.toTex(E.parse('x*-y')) === 'x\\,\\left(-y\\right)' && E.toTex(E.parse('2*-x')).includes('\\left(-x\\right)'));
  const chain = { values: {}, fns: {} };
  chain.fns.f1 = { params: ['x'], ast: E.parse('x+1') };
  for (let k = 2; k <= 6; k++) chain.fns[`f${k}`] = { params: ['x'], ast: E.parse(Array.from({ length: 40 }, () => `f${k - 1}(x)`).join('+')) };
  const t0 = Date.now();
  const runaway = (() => { try { return E.evaluate(E.parse('f6(1)'), chain); } catch (e) { return `ERR ${e.message}`; } })();
  ok('functions calling functions cannot run away with the page: stopped, in words, at once', runaway === 'ERR Too much work to work out.' && Date.now() - t0 < 500, `${runaway} in ${Date.now() - t0}ms`);
  ok('symbols people paste work: × ÷ − π', ev('6 × 2 ÷ 3 − 1') === 3 && Math.abs(ev('2π') - 2 * Math.PI) < 1e-12);
  ok('division by zero is infinity, shown as ∞', ev('1/0') === Infinity && E.formatNumber(1 / 0) === '∞' && E.formatNumber(NaN) === 'undefined');
  const tex = (s) => E.toTex(E.parse(s));
  ok('drawn as mathematics from the structure', tex('(x+1)/(x-1)') === '\\frac{x + 1}{x - 1}' && tex('sqrt(x^2+1)') === '\\sqrt{{x}^{2} + 1}' && tex('alpha_1 * beta') === '\\alpha_{1}\\,\\beta' && tex('2*3') === '2 \\cdot 3');
  ok('renaming touches only that name', E.renameIn('a*x + a2 + sin(a)', 'a', 'k') === 'k*x + a2 + sin(k)');
  ok('names: identifiers that do not already mean something', E.isIdent('price') && E.isIdent('x_1') && !E.isIdent('sin') && !E.isIdent('pi') && !E.isIdent('1x') && !E.isIdent('a-b'));
  ok('numbers as a person reads them (four digits stay together, so a year reads as a year)', E.formatNumber(2029) === '2029' && E.formatNumber(1234567.891) === '1,234,568' && E.formatNumber(-3.14159265) === '−3.142' && E.formatNumber(1 / 3) === '0.3333' && E.formatNumber(0.1 + 0.2) === '0.3');
}

console.log('\n=== primitives: structured, serialisable, checked ===');
{
  const t = P.sanitizePrimitive({ type: 'text', id: 'p_text1', x: 10.4, y: -3, w: 5, h: 99999, label: 'Note\u0000', data: { body: 'Hello', style: 'shout', stray: true } });
  ok('a primitive keeps identity, place and size (clamped), label cleaned, content checked', t.id === 'p_text1' && t.x === 10 && t.w === P.PRIMITIVE_LIMITS.minW && t.h === P.PRIMITIVE_LIMITS.maxSize && t.label === 'Note' && t.data.style === 'plain' && !('stray' in t.data));
  ok('an unknown type is not a primitive', P.sanitizePrimitive({ type: 'script', data: {} }) === null);
  ok('a malformed id is replaced', /^p_[a-z0-9]{12}$/.test(P.sanitizePrimitive({ type: 'text', id: '../evil' }).id));
  const eq = P.sanitizePrimitive({ type: 'equation', data: { name: 'sin', params: ['x'], expr: 'x' } });
  ok('an equation cannot define a name that already means something', eq.data.name === '' && eq.data.params.length === 0);
  const fn = P.sanitizePrimitive({ type: 'equation', data: { name: 'f', params: ['x', 'x', 'f', 'sin', 'y'], expr: 'x + y' } });
  ok("a function's parameters are distinct names, not its own", same(fn.data.params, ['x', 'y']));
  const g = P.sanitizePrimitive({ type: 'graph', data: { nodes: [{ id: 'a', label: 'A', x: 1, y: 2 }, { id: 'a', label: 'dup', x: 0, y: 0 }, { label: '' }], edges: [{ from: 'a', to: 'nobody' }, { from: 'a', to: 'a' }] } });
  ok('graph: duplicate ids made unique, empty labels named, edges to nothing or to themselves dropped', g.data.nodes.length === 3 && new Set(g.data.nodes.map((n) => n.id)).size === 3 && g.data.nodes[2].label === 'Concept' && g.data.edges.length === 0);
  const many = P.sanitizePrimitive({ type: 'graph', data: { nodes: Array.from({ length: 400 }, (_, i) => ({ id: `n${i}`, label: `N${i}` })) } });
  ok('limits hold (a graph keeps at most 150 concepts)', many.data.nodes.length === P.PRIMITIVE_LIMITS.graphNodes);
  const tb = P.sanitizePrimitive({ type: 'table', data: { columns: [{ id: 'c1', name: 'Unit price (£)', kind: 'number' }, { id: 'c2', name: 'Unit price', kind: 'number' }, { id: 'c3', name: 'Total', kind: 'formula', expr: 'unit_price * 2' }], rows: [{ id: 'r1', cells: { c1: '3', c3: 'should go', c9: 'unknown' } }] } });
  ok('table: formula names come from column names, unique; formula and unknown cells are not kept', tb.data.columns[0].key === 'unit_price' && tb.data.columns[1].key === 'unit_price2' && same(tb.data.rows[0].cells, { c1: '3' }));
  const m1 = P.sanitizePrimitive({ type: 'media', data: { src: { kind: 'url', url: 'javascript:alert(1)' }, source: { label: 'x', url: 'data:text/html,hi' } } });
  const m2 = P.sanitizePrimitive({ type: 'media', data: { src: { kind: 'upload', id: '../../etc/passwd' } } });
  const m3 = P.sanitizePrimitive({ type: 'media', data: { src: { kind: 'upload', id: 'a'.repeat(32) }, caption: 'Figure 1', source: { label: 'Bulletin', url: 'https://example.org/b' } } });
  ok('media: script and data addresses refused, an upload only by a proper id', m1.data.src === null && !m1.data.source.url && m2.data.src === null && m3.data.src.id === 'a'.repeat(32) && m3.data.source.url === 'https://example.org/b');
  const ctl = P.sanitizePrimitive({ type: 'control', data: { variable: 'pi', kind: 'dial', options: [{ label: 'Low', value: 1 }, { value: 'x' }] } });
  ok('control: bound only to a proper name; unknown kinds become sliders; choices need numbers', ctl.data.variable === '' && ctl.data.kind === 'slider' && ctl.data.options.length === 1);
  const pl = P.sanitizePrimitive({ type: 'plot', data: { x: { min: 5, max: 1 }, series: Array.from({ length: 12 }, () => ({ kind: 'fn', expr: 'x' })) } });
  ok('plot: an empty range is reset; at most 8 series', pl.data.x.min === -10 && pl.data.x.max === 10 && pl.data.series.length === 8);
  const c = P.sanitizeComposition({
    primitives: [
      { id: 'p_same', type: 'text', data: { body: 'a', style: 'annotation', target: 'p_missing' } },
      { id: 'p_same', type: 'text', data: { body: 'b' } },
      { id: 'p_plot', type: 'plot', data: { series: [{ kind: 'table', table: 'p_gone', x: 'c1', y: 'c2' }, { kind: 'fn', expr: 'x' }] } },
    ],
    variables: [{ name: 'a', value: 1 }, { name: 'a', value: 2 }, { name: 'sin', value: 3 }, { name: 't', kind: 'boolean', value: 7 }],
  });
  ok('composition: ids unique; references to primitives that are not there removed', new Set(c.primitives.map((p) => p.id)).size === 3 && !c.primitives[0].data.target && c.primitives[2].data.series.length === 1);
  ok('composition: variables unique and properly named; a boolean is 0 or 1', c.variables.length === 2 && c.variables[0].value === 1 && c.variables[1].value === 1 && c.variables[1].max === 1);
  ok('a composition is plain JSON: it survives a round trip unchanged', same(P.sanitizeComposition(JSON.parse(JSON.stringify(c))), c));
  const long = P.sanitizeComposition({ subtype: 'document', body: 'w '.repeat(30_000) });
  ok('a long document from before (60,000 characters) is kept whole', long.primitives[0].data.body.length === 60_000);
  const tmpl = P.sanitizeComposition({ subtype: 'document', body: 'Hello {{name}}' });
  ok('…and its {{…}} stay as written, not live values', tmpl.primitives[0].data.live === false && C.describePrimitive(tmpl.primitives[0], tmpl, C.evaluateScope(tmpl)).includes('Hello {{name}}'));
  const legacy = P.sanitizeComposition({ subtype: 'document', body: '# Notes' });
  ok('a Markdown document from before is read as one text primitive with a fixed id', legacy.primitives.length === 1 && legacy.primitives[0].id === 'p_body' && legacy.primitives[0].data.body === '# Notes');
  for (const s of P.STARTERS) {
    const sc = P.starterComposition(s, 'Hello');
    const scope = C.evaluateScope(sc);
    if (!(Object.keys(scope.errors).length === 0 && same(P.sanitizeComposition(sc), sc))) ok(`starter ${s} is clean`, false, JSON.stringify(scope.errors));
  }
  ok('every starting point is canonical and works out without errors', true);
  ok('the model starter composes controls, an equation, a plot and a live note', P.starterComposition('model').primitives.map((p) => p.type).join() === 'control,control,equation,plot,text');
}

console.log('\n=== shared state: values in dependency order ===');
{
  const c = comp(
    [
      { id: 'p_profit', type: 'equation', data: { name: 'profit', expr: 'revenue - cost' } },
      { id: 'p_rev', type: 'equation', data: { name: 'revenue', expr: 'price * quantity' } },
      { id: 'p_cost', type: 'equation', data: { name: 'cost', expr: 'fixed + unit * quantity' } },
      { id: 'p_ff', type: 'equation', data: { name: 'demand', params: ['p'], expr: 'max(0, 500 - 10 p)' } },
      { id: 'p_qq', type: 'equation', data: { name: 'atprice', expr: 'demand(price)' } },
      { id: 'p_bare', type: 'equation', data: { expr: 'profit / revenue' } },
    ],
    [{ name: 'price', value: 20 }, { name: 'quantity', value: 100 }, { name: 'fixed', value: 500 }, { name: 'unit', value: 8 }]
  );
  const s = C.evaluateScope(c);
  ok('definitions are worked out after what they read, whatever their order on the plane', s.values.revenue === 2000 && s.values.cost === 1300 && s.values.profit === 700 && !Object.keys(s.errors).length);
  ok('functions are defined and called', s.values.atprice === 300 && s.fns.demand.params.join() === 'p');
  ok('a bare expression is worked out too', Math.abs(s.results.p_bare - 0.35) < 1e-12);
  const bad = comp(
    [
      { id: 'p_aa', type: 'equation', data: { name: 'aa', expr: 'bb + 1' } },
      { id: 'p_bb', type: 'equation', data: { name: 'bb', expr: 'aa * 2' } },
      { id: 'p_cc', type: 'equation', data: { name: 'cc', expr: 'aa + 1' } },
      { id: 'p_dd', type: 'equation', data: { name: 'price', expr: '3' } },
      { id: 'p_ee', type: 'equation', data: { name: 'g', params: ['x'], expr: 'x + typo' } },
      { id: 'p_ok', type: 'equation', data: { name: 'fine', expr: 'price * 2' } },
    ],
    [{ name: 'price', value: 5 }]
  );
  const bs = C.evaluateScope(bad);
  ok('a cycle is an error on each equation in it, said in words', bs.errors.p_aa.startsWith('Depends on itself') && bs.errors.p_bb.startsWith('Depends on itself'));
  ok('what depends on a cycle says so', !!bs.errors.p_cc);
  ok('a definition cannot take a variable’s name', bs.errors.p_dd.includes('already a variable'));
  ok('a misspelt name in a function body is said where it is written', bs.errors.p_ee.includes('typo'));
  ok('…and the rest still work', bs.values.fine === 10 && !bs.errors.p_ok);
  ok('names nobody defines are found (offered as variables to make)', same(C.undefinedNames(bs, 'price * k + x', ['x']), ['k']));
}

console.log('\n=== reading the scope: tables, plots, live text ===');
{
  const c = comp(
    [
      { id: 'p_tab', type: 'table', label: 'Costs', data: { columns: [{ id: 'c1', name: 'Item', kind: 'text' }, { id: 'c2', name: 'Qty', kind: 'number' }, { id: 'c3', name: 'Each', kind: 'number' }, { id: 'c4', name: 'Total', kind: 'formula', expr: 'qty * each * (1 + rate)' }, { id: 'c5', name: 'Bad', kind: 'formula', expr: 'nope + 1' }], rows: [{ id: 'r1', cells: { c1: 'Rent', c2: '1', c3: '£1,200' } }, { id: 'r2', cells: { c1: 'Ads', c2: '3', c3: '150' } }, { id: 'r3', cells: { c1: 'Odd', c2: 'many' } }] } },
      { id: 'p_plot', type: 'plot', data: { x: { min: -3, max: 3 }, series: [{ id: 's1', kind: 'fn', expr: 'k x^2' }, { id: 's2', kind: 'table', table: 'p_tab', x: 'c2', y: 'c4', mark: 'points' }, { id: 's3', kind: 'point', x: '1', y: 'k' }] } },
      { id: 'p_tan', type: 'plot', data: { x: { min: -3, max: 3 }, series: [{ id: 't1', kind: 'fn', expr: 'tan(x)' }] } },
      { id: 'p_txt', type: 'text', data: { body: 'Total rent: {{1200 * (1 + rate)}}; k is {{k}}; {{missing}}' } },
    ],
    [{ name: 'rate', value: 0.2 }, { name: 'k', value: 2 }]
  );
  const s = C.evaluateScope(c);
  const t = C.computeTable(c.primitives[0].data, s);
  ok('table: numbers read as typed (£, commas), formulas per row from the row and the shared values', t[0].c3.value === 1200 && t[0].c4.value === 1440 && t[1].c4.value === 540);
  ok('table: what is not a number stays text (its formula waits, blank), and a formula that cannot be worked out says why', t[2].c2.value === null && t[2].c4.text === '' && !t[2].c4.error && t[0].c5.error.includes('nope'));
  const blank = C.computeTable(P.sanitizePrimitive({ type: 'table', data: { columns: [{ id: 'c1', name: 'Value', kind: 'number' }, { id: 'c2', name: 'Double', kind: 'formula', expr: 'value * 2' }], rows: [{ id: 'r1', cells: { c1: '4' } }, { id: 'r2', cells: {} }] } }).data, s);
  ok('table: a row whose inputs are not filled in yet is blank, not an error', blank[0].c2.value === 8 && blank[1].c2.text === '' && !blank[1].c2.error);
  const smp = C.samplePlot(c.primitives[1].data, c, s, 60);
  ok('plot: a function sampled across x, against the scope', smp.curves[0].segments[0].length === 61 && smp.curves[0].segments[0][60][1] === 18);
  ok('plot: data read from the table, sorted, numbers only', same(smp.curves[1].points, [[1, 1440], [3, 540]]));
  ok('plot: a point worked out from the shared values', smp.points[0].x === 1 && smp.points[0].y === 2);
  const tan = C.samplePlot(c.primitives[2].data, c, s, 300);
  ok('plot: a function is broken where it jumps across the plot (tan x at ±π/2)', tan.curves[0].segments.length >= 3);
  ok('plot: the fitted range ignores what an asymptote throws up', tan.y.max < 100 && tan.y.min > -100);
  ok('live text: values now, and a problem said in place', C.interpolate(c.primitives[3].data.body, s) === 'Total rent: 1440; k is 2; [missing: “missing” is not defined]');
  // the same composition after a variable changes: every dependent primitive follows
  const moved = O.applyOps(c, [{ op: 'var.set', name: 'rate', value: 0.5 }, { op: 'var.set', name: 'k', value: -1 }]).comp;
  const s2 = C.evaluateScope(moved);
  const t2 = C.computeTable(moved.primitives[0].data, s2);
  const smp2 = C.samplePlot(moved.primitives[1].data, moved, s2, 60);
  ok('changing a variable changes the table, the plot, the point and the text at once', t2[0].c4.value === 1800 && smp2.curves[0].segments[0][60][1] === -9 && smp2.points[0].y === -1 && C.interpolate(moved.primitives[3].data.body, s2).startsWith('Total rent: 1800; k is −1'));
  const ticks = C.ticks(-3, 3, 6);
  ok('axis ticks are round numbers', same(ticks, [-3, -2, -1, 0, 1, 2, 3]));
}

console.log('\n=== references between primitives ===');
{
  const m = P.starterComposition('model');
  const [ca, cb, eq, plot, note] = m.primitives;
  const links = C.linksOf(m);
  const has = (from, to, kind, via) => links.some((l) => l.from === from.id && l.to === to.id && l.kind === kind && (!via || l.via === via));
  ok('a control drives what reads its variable', has(ca, eq, 'drives', 'a') && has(cb, eq, 'drives', 'b'));
  ok('an equation gives its definition to the plot and the live note that use it', has(eq, plot, 'defines', 'f') && has(eq, note, 'defines', 'f'));
  ok('what is downstream of a control follows the references', same([...C.downstreamOf(links, ca.id)].sort(), [eq.id, plot.id, note.id].sort()));
  const c2 = comp([{ id: 'p_tt', type: 'table', data: { columns: [{ id: 'c1', name: 'x', kind: 'number' }] } }, { id: 'p_pl', type: 'plot', data: { series: [{ kind: 'table', table: 'p_tt', x: 'c1', y: 'c1' }] } }, { id: 'p_an', type: 'text', data: { body: 'Look here', style: 'annotation', target: 'p_pl' } }]);
  const l2 = C.linksOf(c2);
  ok('a table supplies a plot; an annotation points at its subject', l2.some((l) => l.from === 'p_tt' && l.to === 'p_pl' && l.kind === 'data') && l2.some((l) => l.from === 'p_an' && l.to === 'p_pl' && l.kind === 'annotates'));
}

console.log('\n=== operations: one vocabulary, checked ===');
{
  const base = P.starterComposition('model');
  const eq = base.primitives[2];
  ok('a malformed batch is refused whole', !O.parseOps([{ op: 'move', id: eq.id, x: 1 }]).ok && !O.parseOps([{ op: 'blow-up' }]).ok && !O.parseOps([]).ok && !O.parseOps('nope').ok && !O.parseOps([{ op: 'var.set', name: 'a', value: Infinity }]).ok);
  ok('a batch has a size limit', !O.parseOps(Array.from({ length: 101 }, () => ({ op: 'remove', id: eq.id }))).ok);
  const frozen = JSON.stringify(base);
  const r = O.applyOps(base, [{ op: 'move', id: eq.id, x: 5e9, y: 7.6 }, { op: 'resize', id: eq.id, w: 1, h: 99999 }]);
  ok('move and resize are clamped; the input is never changed', r.ok && r.comp.primitives[2].x === P.PRIMITIVE_LIMITS.coord && r.comp.primitives[2].y === 8 && r.comp.primitives[2].w === P.PRIMITIVE_LIMITS.minW && r.comp.primitives[2].h === P.PRIMITIVE_LIMITS.maxSize && JSON.stringify(base) === frozen);
  const added = O.applyOps(base, [{ op: 'add', primitive: { id: 'p_new1', type: 'text', data: { body: 'x' } } }]);
  const twice = O.applyOps(added.comp, [{ op: 'add', primitive: { id: 'p_new1', type: 'text', data: { body: 'changed' } } }]);
  ok('adding what is already there is skipped: a batch sent twice does nothing more', twice.ok && same(twice.skipped, [0]) && twice.comp.primitives.filter((p) => p.id === 'p_new1').length === 1 && twice.comp.primitives.find((p) => p.id === 'p_new1').data.body === 'x');
  const gone = O.applyOps(base, [{ op: 'update', id: 'p_ghost', data: { body: 'x' } }, { op: 'var.set', name: 'zz', value: 1 }, { op: 'var.set', name: 'a', value: 2 }]);
  ok('operations on what is gone are skipped and listed; the rest apply', gone.ok && same(gone.skipped, [0, 1]) && gone.comp.variables[0].value === 2);
  const merged = O.applyOps(base, [{ op: 'update', id: eq.id, data: { expr: 'a x + b' } }]).comp.primitives[2].data;
  const replaced = O.applyOps(base, [{ op: 'update', id: eq.id, data: { expr: '2' }, replace: true }]).comp.primitives[2].data;
  ok('an update merges into the content, or replaces it, and is checked either way', merged.name === 'f' && merged.expr === 'a x + b' && replaced.name === '' && replaced.expr === '2');
  const plot = base.primitives[3];
  const tbl = P.newPrimitive('table', { x: 0, y: 0 });
  const withData = O.applyOps(base, [{ op: 'add', primitive: tbl }, { op: 'update', id: plot.id, data: { series: [...plot.data.series, { id: 's9', kind: 'table', table: tbl.id, x: 'c1', y: 'c2', mark: 'line' }] } }, { op: 'add', primitive: { id: 'p_ann', type: 'text', data: { body: 'see', style: 'annotation', target: tbl.id } } }]).comp;
  const removed = O.applyOps(withData, [{ op: 'remove', id: tbl.id }]).comp;
  ok('removing a primitive detaches what referred to it', !removed.primitives.find((p) => p.id === plot.id).data.series.some((s) => s.kind === 'table') && !removed.primitives.find((p) => p.id === 'p_ann').data.target);
  const dup = O.applyOps(base, [{ op: 'duplicate', id: eq.id, as: 'p_copy1' }]).comp;
  const dupEq = dup.primitives.find((p) => p.id === 'p_copy1');
  ok('a duplicated equation defines the next free name, so nothing is defined twice', dupEq.data.name === 'f2' && dupEq.x === eq.x + 24 && !Object.keys(C.evaluateScope(dup).errors).length);
  const ord = O.applyOps(base, [{ op: 'order', id: eq.id, to: 'front' }]).comp;
  ok('order changes what is drawn on top', ord.primitives[ord.primitives.length - 1].id === eq.id);
  ok('a variable needs a proper name and cannot take an equation’s', !O.applyOps(base, [{ op: 'var.add', variable: { name: 'sin' } }]).ok && !O.applyOps(base, [{ op: 'var.add', variable: { name: 'f' } }]).ok);
  const setOnly = O.applyOps(base, [{ op: 'var.set', name: 'a', value: 50 }]).comp.variables[0];
  ok('a value sets the value only (a range is changed by var.update)', setOnly.value === 50 && setOnly.max === 3);
  const run1 = [{ op: 'var.set', name: 'a', value: 250 }, { op: 'var.set', name: 'a', value: 25 }, { op: 'var.update', name: 'b', patch: { max: 99 } }];
  ok('…so a run of values sent as the last one means exactly the same', same(O.applyOps(base, run1).comp, O.applyOps(base, O.coalesce(run1)).comp));
  const renamed = O.applyOps(P.sanitizeComposition({
    primitives: [
      ...base.primitives,
      { id: 'p_shadow', type: 'equation', data: { name: 'h', params: ['a'], expr: 'a + 1' } },
      { id: 'p_tab', type: 'table', data: { columns: [{ id: 'c1', name: 'a', kind: 'number' }, { id: 'c2', name: 'T', kind: 'formula', expr: 'a * 2' }] } },
      { id: 'p_tab2', type: 'table', data: { columns: [{ id: 'c1', name: 'q', kind: 'number' }, { id: 'c2', name: 'T', kind: 'formula', expr: 'q * a' }] } },
    ],
    variables: base.variables,
  }), [{ op: 'var.rename', from: 'a', to: 'slope' }]).comp;
  const byId = (id) => renamed.primitives.find((p) => p.id === id);
  ok('renaming a variable rewrites every use: equation, controls, live text', byId(eq.id).data.expr === 'slope x^2 + b' && renamed.primitives.filter((p) => p.type === 'control').map((p) => p.data.variable).join() === 'slope,b' && renamed.variables[0].name === 'slope');
  ok('…but not a parameter or a column of the same name, which are different things there', byId('p_shadow').data.expr === 'a + 1' && byId('p_tab').data.columns[1].expr === 'a * 2' && byId('p_tab2').data.columns[1].expr === 'q * slope');
  ok('a rename to a name already used is refused', !O.applyOps(base, [{ op: 'var.rename', from: 'a', to: 'b' }]).ok && !O.applyOps(base, [{ op: 'var.rename', from: 'a', to: 'f' }]).ok);
  const capture = P.sanitizeComposition({
    primitives: [
      { id: 'p_pl1', type: 'plot', data: { series: [{ kind: 'fn', expr: 'a * x' }] } },
      { id: 'p_fn1', type: 'equation', data: { name: 'g', params: ['t'], expr: 'a * t' } },
      { id: 'p_tb1', type: 'table', data: { columns: [{ id: 'c1', name: 'qty', kind: 'number' }, { id: 'c2', name: 'T', kind: 'formula', expr: 'qty * a' }] } },
    ],
    variables: [{ name: 'a', value: 2 }],
  });
  const tries = ['x', 't', 'qty'].map((to) => O.applyOps(capture, [{ op: 'var.rename', from: 'a', to }]));
  ok('a rename that would be captured (a plot’s x, a parameter, a column) is refused, saying where', tries.every((r) => !r.ok) && /plot/.test(tries[0].error) && /g\(t\)/.test(tries[1].error) && /table/.test(tries[2].error), tries.map((r) => r.error).join(' | '));
  ok('…and a safe one still rewrites everything', O.applyOps(capture, [{ op: 'var.rename', from: 'a', to: 'k' }]).comp.primitives[0].data.series[0].expr === 'k * x');
  const cleared = O.applyOps(P.sanitizeComposition({ primitives: [{ id: 'p_tgt1', type: 'plot', data: {} }, { id: 'p_ann1', type: 'text', data: { body: 'x', style: 'annotation', target: 'p_tgt1' } }, { id: 'p_med1', type: 'media', data: { source: { label: 'Bulletin' } } }] }), JSON.parse(JSON.stringify([{ op: 'update', id: 'p_ann1', data: { target: null } }, { op: 'update', id: 'p_med1', data: { source: null } }])));
  ok('a field is cleared by null, which survives being sent (undefined would not)', !cleared.comp.primitives[1].data.target && !cleared.comp.primitives[2].data.source);
  const logDup = O.applyOps(P.sanitizeComposition({ primitives: [{ id: 'p_log1', type: 'equation', data: { name: 'log1', expr: '1' } }] }), [{ op: 'duplicate', id: 'p_log1', as: 'p_logcopy' }]).comp.primitives[1].data.name;
  ok('a duplicated equation never takes a name that already means something (log2 is a function)', logDup === 'log3', logDup);
  const limit = O.applyOps(base, Array.from({ length: 20 }, (_, i) => ({ op: 'add', primitive: { id: `p_big${i}`, type: 'text', data: { body: 'z'.repeat(19_000) } } })));
  ok('the size limit holds, and a refused batch changes nothing', !limit.ok && limit.code === 'limit' && limit.comp === base);
  ok('fast changes are sent as fewer operations', same(O.coalesce([{ op: 'var.set', name: 'a', value: 1 }, { op: 'var.set', name: 'a', value: 2 }, { op: 'move', id: 'p_x', x: 1, y: 1 }, { op: 'move', id: 'p_x', x: 3, y: 4 }, { op: 'update', id: 'p_x', data: { a: 1 } }, { op: 'update', id: 'p_x', data: { b: 2 } }]), [{ op: 'var.set', name: 'a', value: 2 }, { op: 'move', id: 'p_x', x: 3, y: 4 }, { op: 'update', id: 'p_x', data: { a: 1, b: 2 } }]));
}

console.log('\n=== undo: every batch can be undone exactly ===');
{
  const base = P.starterComposition('model');
  const [ca, , eq, plot, note] = base.primitives;
  const tbl = P.newPrimitive('table', { x: 600, y: 0 });
  const withTable = O.applyOps(base, [{ op: 'add', primitive: tbl }, { op: 'update', id: plot.id, data: { series: [...plot.data.series, { id: 's9', kind: 'table', table: tbl.id, x: 'c2', y: 'c2' }] } }]).comp;
  const batches = [
    [{ op: 'remove', id: plot.id }, { op: 'var.set', name: 'b', value: 4 }],
    [{ op: 'var.rename', from: 'a', to: 'alpha' }, { op: 'var.remove', name: 'b' }],
    [{ op: 'duplicate', id: eq.id, as: 'p_dupe1' }, { op: 'move', id: ca.id, x: 900, y: 900 }, { op: 'order', id: note.id, to: 'back' }],
    [{ op: 'update', id: note.id, label: 'N', data: { body: 'changed', style: 'callout' } }, { op: 'resize', id: plot.id, w: 999, h: 600 }],
    [{ op: 'var.add', variable: { name: 'z', value: 3 } }, { op: 'add', primitive: P.newPrimitive('control', { x: 0, y: 0 }, { variable: 'z' }) }, { op: 'var.update', name: 'a', patch: { min: -10, max: 10, label: 'Slope' } }],
  ];
  for (const [k, b] of batches.entries()) {
    const after = O.applyOps(base, b);
    const back = O.applyOps(after.comp, O.inverseBatch(base, b));
    if (!after.ok || !back.ok || !same(back.comp, base)) ok(`undo of batch ${k + 1}`, false, JSON.stringify(O.inverseBatch(base, b)));
  }
  ok('remove, rename, duplicate, move, order, update, resize, add and variable changes all undo exactly', true);
  const rmTable = O.applyOps(withTable, [{ op: 'remove', id: tbl.id }]).comp;
  const restored = O.applyOps(rmTable, O.inverseBatch(withTable, [{ op: 'remove', id: tbl.id }])).comp;
  ok('undoing a removal gives back what pointed at it (a plot’s data from that table)', same(restored, withTable));
}

console.log('\n=== on the server: operations against what is stored ===');
{
  const A = 'user_a';
  let t = 5_000_000;
  const now = () => (t += 1000);
  const store = X.memoryStore();
  const made = await X.createNode(store, A, { type: 'artifact', title: 'Sim', content: P.starterComposition('model') }, now());
  const art = made.value;
  const eqId = art.content.primitives[2].id;
  const r1 = await X.applyArtifactOps(store, A, art.id, [{ op: 'var.set', name: 'a', value: 2 }], now());
  const r2 = await X.applyArtifactOps(store, A, art.id, [{ op: 'move', id: eqId, x: 40, y: 40 }], now());
  const stored = (await store.nodes(A)).find((n) => n.id === art.id);
  ok('two batches, neither carrying a version, both land', r1.ok && r2.ok && stored.content.variables[0].value === 2 && stored.content.primitives[2].x === 40 && stored.version === 3);
  ok('a burst of edits keeps one version (the state before it), not one per change', (await store.versions(A, art.id)).length === 0);
  t += X.OPS_VERSION_QUIET_MS + 5000;
  await X.applyArtifactOps(store, A, art.id, [{ op: 'var.set', name: 'b', value: 1 }], now());
  const vs = await store.versions(A, art.id);
  ok('after a quiet minute, the next edit keeps a version first', vs.length === 1 && vs[0].snapshot.content.variables[1].value === 0);
  const back = await X.restoreVersion(store, A, art.id, vs[0].version, (await store.nodes(A)).find((n) => n.id === art.id).version, now());
  ok('a composition version can be brought back', back.ok && back.value.content.variables[1].value === 0);
  const flaky = { ...store, fails: 1, async updateNode(...a) { if (this.fails-- > 0) return false; return store.updateNode(...a); } };
  const r3 = await X.applyArtifactOps(flaky, A, art.id, [{ op: 'var.set', name: 'a', value: 3 }], now());
  ok('a write that lost a race is applied again to what is stored', r3.ok && (await store.nodes(A)).find((n) => n.id === art.id).content.variables[0].value === 3);
  const k = await X.createNode(store, A, { type: 'knowledge', title: 'K' }, now());
  ok('only an artifact takes operations', !(await X.applyArtifactOps(store, A, k.value.id, [{ op: 'var.set', name: 'a', value: 1 }], now())).ok);
  ok('a malformed batch changes nothing', !(await X.applyArtifactOps(store, A, art.id, [{ op: 'nope' }], now())).ok);
  ok("another account's artifact is not found", (await X.applyArtifactOps(store, 'user_b', art.id, [{ op: 'var.set', name: 'a', value: 9 }], now())).error?.code === 'not_found');
  const cur = (await store.nodes(A)).find((n) => n.id === art.id);
  await X.archiveNode(store, A, art.id, cur.version, now());
  ok('an archived artifact is not changed', (await X.applyArtifactOps(store, A, art.id, [{ op: 'var.set', name: 'a', value: 1 }], now())).error?.code === 'archived');
  const pic = await X.createNode(store, A, { type: 'artifact', title: 'Pics', content: { primitives: [{ type: 'media', data: { src: { kind: 'upload', id: 'b'.repeat(32) } } }] } }, now());
  const fake = { snapshot: { content: { primitives: [{ type: 'media', data: { src: { kind: 'upload', id: 'c'.repeat(32) } } }] } } };
  ok('the pictures an artifact shows, now and in its versions, are known (to release them when it is deleted)', same(X.nodeMediaIds(pic.value, [fake]).sort(), ['b'.repeat(32), 'c'.repeat(32)]));
}

console.log('\n=== what the assistant is told ===');
{
  const A = 'user_c';
  let t = 9_000_000;
  const now = () => (t += 1000);
  const store = X.memoryStore({ conversations: [{ id: 'lg_c1', user_id: A }] });
  const obj = (await X.createNode(store, A, { type: 'objective', title: 'Price the product' }, now())).value;
  await X.createNode(store, A, { type: 'conversation', conversationId: 'lg_c1', parentId: obj.id }, now());
  const content = P.sanitizeComposition({
    primitives: [
      { id: 'p_rev', type: 'equation', data: { name: 'revenue', expr: 'price * quantity' } },
      { id: 'p_ctl', type: 'control', label: 'Price', data: { variable: 'price' } },
      { id: 'p_tab', type: 'table', y: 200, data: { columns: [{ id: 'c1', name: 'Tier', kind: 'text' }, { id: 'c2', name: 'Users', kind: 'number' }], rows: [{ id: 'r1', cells: { c1: 'Basic', c2: '120' } }] } },
    ],
    variables: [{ name: 'price', value: 12, min: 0, max: 50, unit: '£' }, { name: 'quantity', value: 100 }],
  });
  const art = (await X.createNode(store, A, { type: 'artifact', title: 'Revenue model', parentId: obj.id, content }, now())).value;
  const turn = X.contextFor(await store.nodes(A), await store.relations(A), 'lg_c1', 2);
  ok('the objective context says what an artifact holds and its values now', turn.work.artifacts[0].startsWith('Revenue model (') && turn.work.artifacts[0].includes('price = 12'));
  const clean = X.sanitizeObjectiveTurn(turn, Date.now());
  ok('…within the existing objective contract', !!clean && clean.work.artifacts[0] === turn.work.artifacts[0]);
  const facts = X.artifactFacts(art);
  ok('a question about an artifact carries its structured state: variables, values, each primitive', facts.some((l) => l.includes('price = 12 £')) && facts.some((l) => l.includes('revenue = price * quantity = 1200')) && facts.some((l) => l.includes('Slider “Price” for price')) && facts.some((l) => l.includes('[Basic, 120]')));
  const brief = X.sanitizeFocus({ kind: 'part', label: art.title, of: 'the objective', lines: facts });
  ok('…within the existing focus contract (lines kept, none cut off)', !!brief && brief.lines.length === facts.length && facts.length <= 12 && facts.every((l) => l.length <= 220));
  const big = P.sanitizeComposition({ primitives: Array.from({ length: 40 }, (_, i) => ({ type: 'text', y: i, data: { body: `Line ${i} `.repeat(60) } })) });
  const lines = C.describeComposition(big, C.evaluateScope(big), 12);
  ok('a large artifact is described in at most 12 lines of at most 220 characters, saying there is more', lines.length === 12 && lines.every((l) => l.length <= 220) && lines[11].includes('(and more)'));
}

console.log('\n=== equations as a person writes them ===');
{
  const r = (s) => X.readEquationLine(s);
  ok('f(x, y) = … is a function', same(r('f(x, y) = x + y'), { ok: true, data: { name: 'f', params: ['x', 'y'], expr: 'x + y' } }));
  ok('name = … is a definition', same(r('revenue = price*quantity').data, { name: 'revenue', params: [], expr: 'price*quantity' }));
  ok('a comparison is not mistaken for a definition', same(r('x == 2').data, { name: '', params: [], expr: 'x == 2' }) && same(r('a <= b').data, { name: '', params: [], expr: 'a <= b' }));
  ok('a name that already means something is refused, in words', !r('sin = 3').ok && !r('f(f) = 2').ok);
  ok('written back the way it was read', X.equationLine({ name: 'f', params: ['x'], expr: 'a x^2' }) === 'f(x) = a x^2' && X.equationLine({ name: '', params: [], expr: '2+2' }) === '2+2');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
