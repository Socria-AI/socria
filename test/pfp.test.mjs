// Your picture, and the one thing about it that is not taste.
//
// Whether a mark can be MADE OUT on its ground is measurable, and this file
// measures it. Ink is paired with each ground rather than chosen separately
// precisely so nobody can select their way into moss on sage — two colours
// from the same palette, individually correct, illegible together — and the
// pairings are checked here against a real WCAG number rather than an eye.

import {
  GROUNDS, BRAND_MARKS, GROUPS, RINGS, TEXTURES, DEFAULT_PFP, PFP_KEY,
  luminance, isDark, takesLightInk, contrastOf, groundOf, markOf, nodeTypes, needsOne, sanitizePfp,
} from './.tmp/pfp.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== CONTRAST: every pairing has to be readable at 28px ===');
{
  for (const g of GROUNDS) {
    const r = contrastOf(g.bg, g.ink);
    // 4.5:1 is the WCAG AA bar for normal text. A mark in a sidebar chip is
    // small, so the bar is not lowered for it.
    ok(`${g.name}: ink carries on the ground (${r.toFixed(2)}:1)`, r >= 4.5, `${g.bg} on ${g.ink}`);
  }

  // The rendering path must agree with the pairing. This is derived from the
  // pair rather than from a threshold on the background precisely so it
  // cannot disagree — Gold sits just under a 0.42 luminance cut and a
  // bg-only test called it dark while its ink is dark too, which would draw
  // a light mark and dark text on the same ground.
  for (const g of GROUNDS) {
    const light = takesLightInk(g);
    ok(`${g.name}: the mark follows the ink`, light === (luminance(g.ink) > luminance(g.bg)),
      `${g.bg} / ${g.ink}`);
    // And the ink is genuinely on the other side of the ground from itself.
    ok(`${g.name}: ink and ground are not the same weight`,
      Math.abs(luminance(g.ink) - luminance(g.bg)) > 0.15,
      `${luminance(g.bg).toFixed(3)} vs ${luminance(g.ink).toFixed(3)}`);
  }
  // Gold specifically, because it is the one that exposed this.
  ok('Gold is drawn with DARK marks, matching its ink',
    takesLightInk(GROUNDS.find((g) => g.id === 'gold')) === false);
}

console.log('\n=== the colour maths ===');
{
  ok('black is 0', luminance('#000000') === 0);
  ok('white is 1', Math.abs(luminance('#FFFFFF') - 1) < 1e-9);
  ok('white on black is 21:1', Math.abs(contrastOf('#000000', '#FFFFFF') - 21) < 1e-6);
  ok('a colour against itself is 1:1', Math.abs(contrastOf('#5E7633', '#5E7633') - 1) < 1e-9);
  ok('order does not matter',
    Math.abs(contrastOf('#000', '#FFF') - contrastOf('#FFF', '#000')) < 1e-9);
  ok('shorthand hex works', Math.abs(luminance('#FFF') - 1) < 1e-9);
  ok('black is dark', isDark('#000000'));
  ok('white is not', !isDark('#FFFFFF'));
  ok('paper is not dark', !isDark('#F4F1E8'));
  ok('forest is dark', isDark('#1A2410'));
  // Never throws on rubbish: this runs while drawing an avatar.
  for (const junk of ['', 'nonsense', '#', '#zzzzzz']) {
    let threw = null;
    try { luminance(junk); isDark(junk); } catch (e) { threw = e; }
    ok(`${JSON.stringify(junk)} does not throw`, threw === null, String(threw));
  }
}

console.log('\n=== the tables ===');
{
  ok('ground ids are unique', new Set(GROUNDS.map((g) => g.id)).size === GROUNDS.length);
  ok('mark ids are unique', new Set(BRAND_MARKS.map((m) => m.id)).size === BRAND_MARKS.length);
  ok('the default ground exists', !!GROUNDS.find((g) => g.id === DEFAULT_PFP.ground));
  ok('the default mark exists', !!BRAND_MARKS.find((m) => m.id === DEFAULT_PFP.mark));
  // The default must be reachable by a FREE account, or every new picture
  // opens on something locked.
  ok('the default ground is free', !groundOf(DEFAULT_PFP.ground).one);
  ok('the default mark is free', !markOf(DEFAULT_PFP.mark).one);
  ok('the default needs no membership', !needsOne(DEFAULT_PFP));

  ok('node types are unique across groups',
    new Set(nodeTypes()).size === nodeTypes().length, String(nodeTypes().length));
  ok('the brand group holds no node types', GROUPS[0].types === null);
  ok('there are node types at all', nodeTypes().length > 20, String(nodeTypes().length));
  ok('some grounds are free', GROUNDS.some((g) => !g.one));
  ok('some are membership', GROUNDS.some((g) => g.one));
}

console.log('\n=== lookups are total ===');
{
  for (const junk of [null, undefined, 42, {}, '', 'nope']) {
    ok(`groundOf(${JSON.stringify(junk) ?? typeof junk}) still returns one`, !!groundOf(junk).bg);
    ok(`markOf(${JSON.stringify(junk) ?? typeof junk}) still returns one`, !!markOf(junk).kind);
  }
  // A node type is not in BRAND_MARKS and must come back as a node.
  ok('a node type reads as a node', markOf('tension').kind === 'node');
  ok('a brand mark reads as itself', markOf('logos').kind === 'logos');
}

console.log('\n=== membership gates the parts, not the whole ===');
{
  ok('a One ground needs One', needsOne({ ...DEFAULT_PFP, ground: 'gold' }));
  ok('the seal needs One', needsOne({ ...DEFAULT_PFP, mark: 'one' }));
  ok('the seal ring needs One', needsOne({ ...DEFAULT_PFP, ring: 'seal' }));
  ok('a plain picture does not', !needsOne({ mark: 'logos', ground: 'moss', ring: 'ring' }));
}

console.log('\n=== a stored picture survives a downgrade ===');
{
  // THE CASE THAT MATTERS. A member composes gold-with-a-seal, then lapses.
  // The picture must fall back to something drawable — and must NOT be
  // rewritten, so it returns intact if they subscribe again.
  const fancy = { mark: 'one', ground: 'gold', ring: 'seal', texture: 'grain', letter: 'JR' };
  const asMember = sanitizePfp(fancy, { isOne: true });
  ok('a member keeps all of it', asMember.ground === 'gold' && asMember.mark === 'one' && asMember.ring === 'seal',
    JSON.stringify(asMember));

  const asFree = sanitizePfp(fancy, { isOne: false });
  ok('a free account falls back to a free ground', !groundOf(asFree.ground).one, asFree.ground);
  ok('...and a free mark', !markOf(asFree.mark).one, asFree.mark);
  ok('...and a free ring', asFree.ring !== 'seal', asFree.ring);
  // Texture and letter are not gated, so they survive.
  ok('the texture survives', asFree.texture === 'grain', asFree.texture);
  ok('the letter survives', asFree.letter === 'JR', asFree.letter);
  // And the ORIGINAL object is untouched, which is what makes it restorable.
  ok('the stored config was not mutated', fancy.ground === 'gold' && fancy.ring === 'seal');
}

console.log('\n=== nothing stored can break the page ===');
{
  for (const junk of [null, undefined, 0, '', 'string', [], true, { mark: 42 }]) {
    const c = sanitizePfp(junk);
    ok(`${JSON.stringify(junk) ?? typeof junk} yields a drawable config`,
      !!groundOf(c.ground).bg && !!markOf(c.mark).kind && !!c.letter);
  }
  ok('an unknown ground falls back', sanitizePfp({ ground: 'chartreuse' }).ground === DEFAULT_PFP.ground);
  ok('an unknown texture falls back', sanitizePfp({ texture: 'velvet' }).texture === 'none');
  ok('a node type is kept as the mark', sanitizePfp({ mark: 'tension' }).mark === 'tension');
  ok('an unknown mark falls back', sanitizePfp({ mark: 'wat' }).mark === DEFAULT_PFP.mark);
  // The initial is drawn at 42% of the avatar; three characters would spill.
  ok('a long initial is clipped to two', sanitizePfp({ letter: 'ABCDEF' }).letter.length === 2);
  ok('an empty initial falls back', sanitizePfp({ letter: '   ' }).letter === DEFAULT_PFP.letter);
  ok('the key is versioned', /v\d+$/.test(PFP_KEY), PFP_KEY);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
