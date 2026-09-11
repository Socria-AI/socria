// The typography of an assistant's reply.
//
// This exists because of a bug somebody could see: Logos printed `**` on
// screen. Two separate causes, and the suite is split the same way.
//
// The first is that Logos had no renderer at all — every mark arrived as the
// character it was. That is a wiring problem, fixed by both surfaces reading
// one parser, and what is asserted here is that the parser understands the
// vocabulary the prompts actually ask the models to write in.
//
// The second is a real bug in the inline rule, and it was in Core too, where
// there IS a renderer. Bold was `\*\*([^*\n]+)\*\*` — no asterisk and no
// newline inside — so three ordinary things leaked raw asterisks. The
// "asterisks that used to escape" block below is those three, and they are
// the reason to read this file.

import { splitInline, parseBlocks, stripMarks, isGroupHeader } from './.tmp/rich-text.mjs';
import { LOGOS_CHAT_PROMPT } from './.tmp/logos.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** A compact rendering of the segments, so a failure is readable. */
const ink = (s) =>
  splitInline(s)
    .map((p) => (p.kind === 'text' ? p.text : `${p.kind}(${p.text})`))
    .join('');

console.log('=== the marks, read plainly ===');
{
  ok('plain text is one run', ink('just words') === 'just words');
  ok('emphasis', ink('the *pivot* word') === 'the em(pivot) word');
  ok('bold', ink('a **label** here') === 'a strong(label) here');
  ok('both marks in one line',
    ink('**Cost:** the *real* one') === 'strong(Cost:) the em(real) one');
  ok('a mark at the very start', ink('*first* then') === 'em(first) then');
  ok('a mark at the very end', ink('then *last*') === 'then em(last)');
  ok('empty input', ink('') === '');
  for (const junk of [null, undefined, 42, {}]) {
    ok(`${JSON.stringify(junk) ?? 'undefined'} is empty`, splitInline(junk).length === 0);
  }
}

console.log('\n=== the asterisks that used to escape ===');
{
  // 1. Triple. The old rule failed the `**` alternative on the third
  //    asterisk, matched the middle as emphasis, and printed the outer pair.
  ok('***both*** is bold AND emphasis', ink('***both***') === 'strong-em(both)');
  ok('...and leaves no stray asterisk', !splitInline('***both***').some((p) => p.text.includes('*')));

  // 2. Emphasis nested in bold. The inner `*` closed the bold early.
  ok('**a *word* inside** keeps both',
    ink('**a *word* inside**') === 'strong(a )strong-em(word)strong( inside)');
  ok('...with no asterisk left over',
    !splitInline('**a *word* inside**').some((p) => p.text.includes('*')));

  // 3. A label that wraps. A newline was not allowed inside bold at all.
  ok('bold may cross a line break',
    ink('**a label that\nwraps a line**') === 'strong(a label that\nwraps a line)');

  // And the guard that makes the above safe: an unclosed `**` — which every
  // streaming reply has, for a moment — must not swallow what follows it.
  ok('an unclosed ** stays literal', ink('**never closed') === '**never closed');
  ok('...and does not cross a blank line',
    ink('**opened\n\nnew paragraph** here') === '**opened\n\nnew paragraph** here');
  ok('a lone asterisk is a lone asterisk', ink('2 * 3 = 6') === '2 * 3 = 6');
  ok('an unclosed single mark too', ink('half *open') === 'half *open');
}

console.log('\n=== runs are merged, so a selection copies cleanly ===');
{
  const segs = splitInline('**one *two* three**');
  ok('no zero-length runs', segs.every((p) => p.text.length > 0));
  ok('adjacent runs of a kind are joined',
    splitInline('*a**b*').every((p, i, a) => i === 0 || p.kind !== a[i - 1].kind),
    JSON.stringify(splitInline('*a**b*')));
  ok('the text survives intact',
    segs.map((p) => p.text).join('') === 'one two three');
}

console.log('\n=== stripMarks ===');
{
  ok('every mark comes off', stripMarks('**Cost:** the *real* one') === 'Cost: the real one');
  ok('and it trims', stripMarks('  *x*  ') === 'x');
  ok('plain text is untouched', stripMarks('nothing here') === 'nothing here');
}

console.log('\n=== blocks ===');
{
  const b = (s) => parseBlocks(s).map((x) => x.kind).join(',');

  ok('prose is a paragraph', b('a sentence.') === 'p');
  ok('blank lines separate paragraphs', b('one\n\ntwo') === 'p,p');
  ok('a wrapped paragraph stays one block', b('one\ntwo\nthree') === 'p');

  ok('hyphen bullets', b('- a\n- b') === 'ul');
  ok('bullet dots', b('• a\n• b') === 'ul');
  ok('asterisk bullets', b('* a\n* b') === 'ul');
  ok('numbered', b('1. a\n2. b') === 'ol');
  ok('numbered with a paren', b('1) a\n2) b') === 'ol');

  ok('a list keeps its items',
    JSON.stringify(parseBlocks('- a\n- b')[0].items) === JSON.stringify(['a', 'b']));
  ok('the bullet mark is stripped from the item',
    parseBlocks('-   spaced out')[0].items[0] === 'spaced out');

  // Prose either side of a list, which is the ordinary shape of a reply.
  ok('prose, list, prose', b('Before.\n\n- a\n- b\n\nAfter.') === 'p,ul,p');
  ok('a list ends a paragraph without a blank line', b('Before:\n- a\n- b') === 'p,ul');
}

console.log('\n=== titled groups ===');
{
  ok('a short label ending in a colon is a header', isGroupHeader('Cost:'));
  ok('...even wearing bold', isGroupHeader('**Cost:**'));
  ok('a whole sentence is not', !isGroupHeader('This is a point that runs on and on and on and on:'));
  ok('no colon, no header', !isGroupHeader('Cost'));

  const g = parseBlocks('- Cost:\n- it is cheap\n- Time:\n- it is slow')[0];
  ok('labelled bullets become groups', g.kind === 'groups');
  ok('...one group per label', g.groups.length === 2);
  ok('...each keeping its own points',
    g.groups[0].header === 'Cost:' && g.groups[0].items[0] === 'it is cheap');

  // All labels, or none, is an ordinary list — a "group" of nothing is worse
  // than a bullet, and this is the check that keeps a plain list plain.
  ok('all labels stays a list', parseBlocks('- A:\n- B:')[0].kind === 'ul');
  ok('no labels stays a list', parseBlocks('- a\n- b')[0].kind === 'ul');
}

console.log('\n=== tables ===');
{
  const t = parseBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |')[0];
  ok('a header and a rule make a table', t.kind === 'table');
  ok('the header is read', JSON.stringify(t.header) === JSON.stringify(['a', 'b']));
  ok('the rows are read', JSON.stringify(t.rows) === JSON.stringify([['1', '2']]));
  ok('outer pipes are optional',
    parseBlocks('a | b\n--- | ---\n1 | 2')[0].kind === 'table');

  // A pipe in ordinary prose is a pipe. Without the rule beneath it, nothing
  // here should decide a sentence was secretly a table.
  ok('a pipe alone is not a table', parseBlocks('this | that')[0].kind === 'p');
  ok('a rule alone is not a table', parseBlocks('| --- |')[0].kind === 'p');
}

console.log('\n=== a whole reply, of the shape Logos actually writes ===');
{
  const reply = [
    'Two things are pulling against each other here.',
    '',
    '- **The offer:** more money, and you have said that matters.',
    '- **The work:** you have not learned anything in *three years*.',
    '',
    'Which of those would you regret more?',
  ].join('\n');

  const blocks = parseBlocks(reply);
  ok('three blocks', blocks.length === 3, JSON.stringify(blocks.map((x) => x.kind)));
  ok('prose, groups or list, prose',
    blocks[0].kind === 'p' && blocks[2].kind === 'p');
  const list = blocks[1];
  ok('the middle is a list', list.kind === 'ul' || list.kind === 'groups');
  ok('the bold labels survive into the items',
    ink(list.items[0]).startsWith('strong(The offer:)'), ink(list.items[0]));
  ok('and the emphasis inside an item',
    ink(list.items[1]).includes('em(three years)'), ink(list.items[1]));
  ok('nothing anywhere still carries a raw mark',
    !blocks.some((bl) =>
      (bl.kind === 'p' ? [bl.text] : bl.items ?? []).some((s) =>
        splitInline(s).some((p) => p.kind !== 'text' && p.text.includes('*'))
      )
    ));
}

console.log('\n=== the prompt and the renderer agree ===');
{
  // The original bug in one sentence: lib/logos.ts told the model it could
  // use structure, and the surface had no renderer, so the structure was
  // printed instead of drawn. Nothing failed — the two halves simply had no
  // reason to know about each other.
  //
  // So they are pinned together here. Every mark the prompt PROMISES is
  // rendered must actually be understood by the parser, and the one thing it
  // forbids must stay forbidden. Change either side alone and this fails.
  const p = LOGOS_CHAT_PROMPT;

  ok('the prompt names the emphasis mark', /\*single asterisks\*/.test(p));
  ok('...and the renderer draws it', ink('a *word* here') === 'a em(word) here');

  ok('the prompt names the bold mark', /\*\*double asterisks\*\*/.test(p));
  ok('...and the renderer draws it', ink('**Label:**') === 'strong(Label:)');

  ok('the prompt names bullets and numbered steps', /hyphen bullets, or 1\. numbered steps/.test(p));
  ok('...and the renderer draws both',
    parseBlocks('- a\n- b')[0].kind === 'ul' && parseBlocks('1. a\n2. b')[0].kind === 'ol');

  ok('the prompt names titled sections', /titled sections/.test(p));
  ok('...and the renderer draws them',
    parseBlocks('- Cost:\n- cheap\n- Time:\n- slow')[0].kind === 'groups');

  ok('the prompt names the table', /pipe \| table/.test(p) || /\| pipe \| table/.test(p));
  ok('...and the renderer draws it',
    parseBlocks('| a | b |\n| --- | --- |\n| 1 | 2 |')[0].kind === 'table');

  // The forbidden one. Nothing here renders a heading, so a `#` must arrive
  // on screen as the character it is rather than silently vanishing.
  ok('the prompt forbids headings', /[Nn]ever # headings/.test(p));
  ok('...and a # stays a #', parseBlocks('# Not a heading')[0].kind === 'p');
  ok('...intact, not swallowed', parseBlocks('# Not a heading')[0].text === '# Not a heading');
  ok('the prompt forbids code fences', /never code fences/.test(p));
  ok('the prompt forbids nested lists', /never nested lists/.test(p));
}

console.log('\n=== an item that wraps stays one item ===');
{
  // Blocks are read before marks are, so an item split across two lines also
  // splits any bold across it — and the asterisks are then printed. This is
  // the shape that put `**` on screen even after the inline rule was fixed.
  const wrapped = parseBlocks('1. Whether **a label that wraps\n   a line break** reads as one.\n2. Next.');
  ok('an indented line continues the item', wrapped[0].kind === 'ol' && wrapped[0].items.length === 2,
    JSON.stringify(wrapped));
  ok('...joined with a space, not a break',
    wrapped[0].items[0] === 'Whether **a label that wraps a line break** reads as one.', wrapped[0].items[0]);
  ok('...so the bold survives it',
    ink(wrapped[0].items[0]) === 'Whether strong(a label that wraps a line break) reads as one.',
    ink(wrapped[0].items[0]));
  ok('bullets continue the same way',
    parseBlocks('- one long item\n  continued here\n- two')[0].items[0] === 'one long item continued here');

  // The other half, and the reason the rule is indentation rather than
  // markdown's "join anything": a closing sentence under a list, with no
  // blank line, must not be swallowed into the last bullet.
  const trailing = parseBlocks('- a\n- b\nWhich of those?');
  ok('an UNindented line ends the list', trailing.length === 2 && trailing[1].kind === 'p',
    JSON.stringify(trailing));
  ok('...and the sentence stays its own', trailing[1].text === 'Which of those?');
  ok('...with the list untouched', JSON.stringify(trailing[0].items) === JSON.stringify(['a', 'b']));

  // A blank line ends it too, indentation or not.
  ok('a blank line ends the list',
    parseBlocks('- a\n\n  indented after a gap').length === 2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
