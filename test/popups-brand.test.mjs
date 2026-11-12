// THE POPUPS, TO THE BRAND BOOK — what the consistency pass promised, read from the sources.
//
//   one family    the Sleep card and the trial's end are drawn in the Socria One sheet they lead to: the same shell,
//                 the same headline, the same full-width way on with "Keep exploring" under it; left-aligned
//   one voice     a headline that says what happened ends on a full stop; one word for staying
//   one focus     a sheet that arrives unasked takes the focus itself, so no control is ringed on arrival
//   no browser    no confirm, alert or prompt box anywhere in the app: the app's own inline confirm instead
//   the One sheet its comparison wraps rather than clipping the Socria One column; its sizes on the scale
//   motion        nothing scales or spins under the pointer; nothing overshoots; nothing pulses for ever (the +)
//   floats        the ring's tip is square paper with a hairline, as every tip is

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));
const block = (css, sel) => {
  const i = css.indexOf(sel + ' {');
  return i < 0 ? '' : css.slice(i, css.indexOf('}', i) + 1);
};

const sleepTsx = read('components/logos5/SleepMode.tsx');
const sleepCss = read('components/logos5/sleep.css');
const oneCss = read('components/one/one-sheet.css');
const oneTsx = read('components/SocriaOneModal.tsx');
const uni = read('components/logos5/universe.css');
const seeds = read('components/logos5/seeds.css');

console.log('\n=== one family: Sleep and the trial’s end are drawn in the One sheet ===');
ok('both cards are the One sheet’s shell: its scrim, its sheet, its grab handle and the bare ×', /className="os-scrim sl-scrim"/.test(sleepTsx) && /className="os-sheet sl-sheet"/.test(sleepTsx) && /className="os-grab"/.test(sleepTsx) && /<L5Close label="Close" onClose=\{onClose\} className="os-x" \/>/.test(sleepTsx));
ok('  and its stylesheet is theirs too', /import '\.\.\/one\/one-sheet\.css';/.test(sleepTsx));
ok('  the headline and the words under it are the One sheet’s (serif 32, body 15.5)', (sleepTsx.match(/className="os-title"/g) ?? []).length === 2 && (sleepTsx.match(/className="os-sub"/g) ?? []).length === 2);
ok('  the way on is the sheet’s full-width pill in One’s blue, the way to stay a word under it', /className="l5-btn is-primary is-one is-wide"/.test(sleepTsx) && /className="os-actions"/.test(sleepTsx));
ok('the old centred card is gone: no moon in a circle, no centred text, no card of its own', !/sl-moon|sl-card|sl-acts|sl-one\b/.test(sleepTsx + sleepCss) && !/text-align: center/.test(sleepCss));
ok('  nor does the One sheet centre its words (only the closing line under the pill)', !/text-align: center/.test(block(oneCss, ':is(.logos-root, .lg-tokens) .os-sheet')) && (oneCss.match(/text-align: center/g) ?? []).length === 2);
ok('the label over the headline: the moon and the trial’s day, where the One sheet has its name', /<Moon size=\{15\} \/>/.test(sleepTsx) && /`Your trial · \$\{dayOfLine\(trial\)\}`/.test(sleepTsx));
ok('what stays when the trial is over: hairline rows, no bullets', /\.tr-keep \{[^}]*list-style: none;/.test(sleepCss) && /\.tr-keep li \{[^}]*border-top: 1px solid var\(--c-rule\);/.test(sleepCss));

console.log('\n=== one voice ===');
ok('a headline that says what happened ends on a full stop', />\s*Socria is resting\.\s*</.test(sleepTsx) && />\s*Seven days are up\.\s*</.test(sleepTsx) && /'Socria, without a daily limit\.'/.test(oneTsx) && /LIMIT_HEADLINE = '[^']+\.'/.test(read('lib/entitlements.ts')));
ok('one word for staying: "Keep exploring" (the trial’s end said "Keep browsing")', /Keep exploring/.test(sleepTsx) && !/Keep browsing/.test(sleepTsx));

console.log('\n=== one focus ===');
ok('the sheet takes the focus when it arrives — no control is ringed then, and Enter buys nothing', /ref=\{ref\} tabIndex=\{-1\}/.test(sleepTsx) && /ref\.current\?\.focus\(\{ preventScroll: true \}\)/.test(sleepTsx) && !/closeRef/.test(sleepTsx));
ok('  the sheet draws no ring of its own; the controls keep theirs', /\.os-sheet\.sl-sheet:focus \{\s*outline: none;\s*\}/.test(sleepCss));

console.log('\n=== no browser dialogs ===');
{
  // the SocriaUX workspace (/ux, components/ux) is its own tool with its own conventions, and is left out
  const walk = (d) =>
    readdirSync(join(root, d)).flatMap((f) => {
      const p = join(d, f);
      if (statSync(join(root, p)).isDirectory()) return f === 'node_modules' || p === join('components', 'ux') ? [] : walk(p);
      return /\.(tsx?|jsx?)$/.test(f) ? [p] : [];
    });
  const files = [...walk('app'), ...walk('components'), ...walk('lib')];
  const native = files.filter((f) => /window\.(confirm|alert|prompt)\(|(^|[^.\w])(confirm|alert|prompt)\(\s*['"`]/m.test(read(f)));
  ok('no confirm, alert or prompt box anywhere in the app', native.length === 0, native.join(', '));
}
ok('deleting a course profile asks in the sheet: "Delete it" in the one red, "Keep it" focused', /className="cs-confirm" role="group"/.test(read('components/logos5/CourseSheet.tsx')) && /className="l5-btn is-sm is-danger is-solid"/.test(read('components/logos5/CourseSheet.tsx')) && /autoFocus onClick=\{\(\) => setDeleting\(null\)\}/.test(read('components/logos5/CourseSheet.tsx')));
ok('  clearing memory asks in its card', /className="dp-pair"/.test(read('components/DataPrivacyPanel.tsx')) && /Clear it\?/.test(read('components/DataPrivacyPanel.tsx')));
ok('  deleting a capture asks in its row', /className="qc-confirm" role="group"/.test(read('components/CaptureInbox.tsx')) && /className="qc-save is-small is-danger"/.test(read('components/CaptureInbox.tsx')));

console.log('\n=== the One sheet ===');
ok('its comparison wraps rather than clipping the Socria One column', !/white-space: nowrap/.test(block(oneCss, ':is(.logos-root, .lg-tokens) .os-cmp tbody td')) && /\.os-cmp-wrap \{[^}]*overflow: hidden;/.test(oneCss));
ok('  its sizes are the app’s: the label 10.5 / .18em, the words 15.5, the foot 12.5, a card inside it 10', /\.os-brand \{[^}]*font-size: 10\.5px;[^}]*letter-spacing: 0\.18em;/.test(oneCss) && /\.os-sub \{[^}]*font-size: 15\.5px;/.test(oneCss) && /\.os-foot \{[^}]*font-size: 12\.5px;/.test(oneCss) && /\.os-cmp-wrap \{[^}]*border-radius: 10px;/.test(oneCss));
{
  // the scale (10.5 / 12.5 / 13.5 / 15.5 / 18 / 32), and two that are not copy: the monogram's letter (15, in its 26px
  // ring) and the locked Logic Map card's heading in the canvas (24)
  const sizes = [...oneCss.matchAll(/font-size: ([\d.]+)px/g)].map((m) => Number(m[1]));
  const off = sizes.filter((n) => ![10.5, 12.5, 13.5, 15, 15.5, 18, 24, 32].includes(n));
  ok('  and nothing in it off the type scale', off.length === 0, off.join(', '));
}

console.log('\n=== motion: nothing scales, spins, overshoots or pulses for ever ===');
{
  const plus = uni.slice(uni.indexOf('/* THE + (UniverseParts.tsx StartDisc)'), uni.indexOf('/* a lens with nothing in it yet'));
  ok('the + lifts 2px and turns moss under the pointer — it does not grow or spin', /\.l5plus:hover \.l5plus-o \{ transform: translateY\(-2px\); background: var\(--c-moss\); \}/.test(plus) && !/:hover[^{]*\{[^}]*(scale\(|rotate\()/.test(plus));
  ok('  its ring goes out twice as it arrives, then it is still', /l5plusPing [^;]* 2 both;/.test(plus) && !/infinite/.test(plus));
  ok('  flat ink, a ring in the ground’s primary and a glow — no gradient fill, no gold of its own', /background: var\(--c-ink\);/.test(plus) && !/gradient\(/.test(plus) && !/--l5h-gold/.test(plus));
  ok('  and reduced motion stills it', /@media \(prefers-reduced-motion: reduce\) \{\s*\.logos-root \.l5 \.l5plus-o \{ transition: none; \}/.test(plus));
}
{
  const over = [...(uni + seeds + oneCss + sleepCss).matchAll(/cubic-bezier\(([\d.]+), ([\d.]+), ([\d.]+), ([\d.]+)\)/g)].filter((m) => Number(m[2]) > 1 || Number(m[4]) > 1).map((m) => m[0]);
  ok('no spring or overshoot easing on the map, the idea bubbles or the sheets', over.length === 0, over.join(', '));
  const kf = (name) => uni.slice(uni.indexOf(`@keyframes ${name} {`), uni.indexOf('}\n}', uni.indexOf(`@keyframes ${name} {`)) + 3);
  ok('  a subject arrives as the brand book draws a node card coming in (.92 → 1), not past its size', /scale\(0\.92\)/.test(kf('l5b-pop')) && !/scale\(1\.\d/.test(kf('l5b-pop')));
  ok('  a small mark settles at its size', !/scale: 1\.\d/.test(kf('l5b-settle')));
}
ok('the idea bubbles lift and do not grow; nothing turns', /\.ls-seed:hover, \.logos-root \.ls-seed:focus-visible \{ transform: translateY\(-2px\);/.test(seeds) && !/scale\(1\.0/.test(seeds) && !/rotate\(360deg\)/.test(seeds));

console.log('\n=== floats ===');
ok('the ring’s tip is square paper with a hairline and no shadow, as every tip is', /\.sl-ringtip \{[^}]*border-radius: 0;[^}]*box-shadow: none;/.test(sleepCss));

console.log(`\npopups-brand: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
