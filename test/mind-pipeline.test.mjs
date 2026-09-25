// The parts of the pipeline that can be tested without a database: what the
// extractor is allowed to return, and how a file becomes passages.
//
// The graph logic itself is test/mind-graph. This covers the two seams where
// untrusted input enters — a model's JSON, and somebody's file.

import { sanitizeExtraction } from './.tmp/extract.mjs';
import { chunkText, CHUNK_CHARS, MAX_CHUNKS } from './.tmp/ingest-text.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

console.log('=== nothing the model returns is trusted in unexamined ===');
{
  ok('garbage is nothing', sanitizeExtraction(null).nodes.length === 0);
  ok('a string is nothing', sanitizeExtraction('{}').nodes.length === 0);
  ok('missing arrays are nothing', sanitizeExtraction({}).nodes.length === 0);

  const good = sanitizeExtraction({
    nodes: [{ type: 'Project', label: 'Core 4', content: 'The model', kind: 'stated', confidence: 0.9 }],
    edges: [{ sourceLabel: 'Core 4', targetLabel: 'Socria', relationship: 'part_of', kind: 'stated' }],
  });
  ok('a good node survives', good.nodes.length === 1 && good.nodes[0].label === 'Core 4');
  ok('a good edge survives', good.edges.length === 1 && good.edges[0].relationship === 'part_of');

  const noLabel = sanitizeExtraction({ nodes: [{ type: 'Project', content: 'x', kind: 'stated' }] });
  ok('a node with no label is dropped', noLabel.nodes.length === 0);
  const noType = sanitizeExtraction({ nodes: [{ label: 'x', content: 'y', kind: 'stated' }] });
  ok('a node with no type is dropped', noType.nodes.length === 0);
}

console.log('\n=== an unknown TYPE is kept, an unknown KIND is not ===');
{
  // The ontology is meant to grow, so an unfamiliar type stores and renders.
  const odd = sanitizeExtraction({ nodes: [{ type: 'Recipe', label: 'Sourdough', content: 'How they bake it', kind: 'stated' }] });
  ok('an unfamiliar type is allowed', odd.nodes[0]?.type === 'Recipe', 'the ontology must be extensible');

  // Register decides what may persist, so a value the gate cannot interpret
  // must not default to something permissive.
  const bad = sanitizeExtraction({ nodes: [{ type: 'Belief', label: 'x', content: 'y', kind: 'definitely-true' }] });
  ok('an unknown kind becomes inferred', bad.nodes[0]?.kind === 'inferred',
     'it must never default to something that can assert');
  const missing = sanitizeExtraction({ nodes: [{ type: 'Belief', label: 'x', content: 'y' }] });
  // A MISSING field is not the same as a WRONG one. 'inferred' is the register
  // the corroboration gate holds back, so defaulting an absent field to it
  // meant a model that forgot to emit `kind` lost the fact silently — an
  // extraction bug becoming memory loss with nothing in any log. 'tentative'
  // persists, is discounted in retrieval, and is labelled as a reading.
  ok('a missing kind becomes tentative, not inferred', missing.nodes[0]?.kind === 'tentative', String(missing.nodes[0]?.kind));
}

console.log('\n=== scores are clamped, not trusted ===');
{
  const r = sanitizeExtraction({ nodes: [{ type: 'Concept', label: 'x', content: 'y', kind: 'stated', confidence: 99, importance: -5 }] });
  ok('confidence is clamped', r.nodes[0].confidence === 1, `${r.nodes[0].confidence}`);
  ok('importance is clamped', r.nodes[0].importance === 0, `${r.nodes[0].importance}`);
  const nan = sanitizeExtraction({ nodes: [{ type: 'Concept', label: 'x', content: 'y', kind: 'stated', confidence: 'high' }] });
  ok('a non-number is dropped', nan.nodes[0].confidence === undefined);
}

console.log('\n=== a flood is bounded ===');
{
  const many = { nodes: Array.from({ length: 200 }, (_, i) => ({ type: 'Concept', label: `n${i}`, content: 'x', kind: 'stated' })) };
  ok('at most 30 nodes per extraction', sanitizeExtraction(many).nodes.length === 30);
  const manyEdges = { edges: Array.from({ length: 200 }, () => ({ sourceLabel: 'a', targetLabel: 'b', relationship: 'supports', kind: 'stated' })) };
  ok('at most 60 edges', sanitizeExtraction(manyEdges).edges.length === 60);
}

console.log('\n=== a file becomes passages, with offsets that point at it ===');
{
  const para = 'Sentence one here. Sentence two here.\n\n';
  const text = para.repeat(200);
  const chunks = chunkText(text);
  ok('it is split', chunks.length > 1, `${chunks.length}`);
  ok('and bounded', chunks.length <= MAX_CHUNKS, `${chunks.length}`);
  ok('offsets are into the ORIGINAL text',
     chunks.every((c) => text.slice(c.start, c.end) === c.text),
     'a provenance offset that does not resolve shows the wrong sentence');
  ok('they are contiguous', chunks.every((c, i) => i === 0 || c.start === chunks[i - 1].end));
  ok('none is oversized', chunks.every((c) => c.text.length <= CHUNK_CHARS + 2));
  ok('it prefers paragraph breaks', chunks.slice(0, -1).filter((c) => text.slice(c.end - 2, c.end) === '\n\n').length > 0);

  ok('a short file is one passage', chunkText('Just a line about something.').length === 1);
  ok('an empty file is no passages', chunkText('   \n  ').length === 0);
  // The split lands ON a boundary: the character after a chunk is
  // whitespace, or the text ran out. A chunk ending with a complete word has
  // no trailing space, so "ends in whitespace" would be the wrong test.
  {
    const run = 'word '.repeat(2000);
    const cs = chunkText(run);
    ok('no word is cut in half',
       cs.every((c) => c.end >= run.length || /\s/.test(run[c.end])),
       cs.map((c) => JSON.stringify(run.slice(c.end - 3, c.end + 2))).join(' '));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
