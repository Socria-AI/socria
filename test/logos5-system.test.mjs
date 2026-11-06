// test/logos5-system.test.mjs — LOGOS 5.5, THE INTERFACE SYSTEM.
//
// Fill means do, wash means here, a hairline means you can. One controls sheet
// (l5-controls.css) replaces buttons.css, buttons-soft.css and the artifact
// strip's key; one icon button, one menu, one close, one label; six type steps
// and four radii in the workspace's sheets; selected is the wash everywhere;
// no blur. These read the sources: the rules are the product's, not a page's.
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0;
let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) pass++;
  else fail++;
  console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${!cond && extra ? `  ${extra}` : ''}`);
};

const app = read('components/LogosApp.tsx');
const chrome = read('components/logos5/L5Chrome.tsx');
const views = read('components/logos5/L5Views.tsx');
const composer = read('components/LogosComposer.tsx');
const controls = read('components/logos5/l5-controls.css');
const SHEETS = ['l5', 'l5v', 'redesign', 'study', 'canvas', 'tips', 'make-gallery'].map((f) => [f, read(`components/logos5/${f}.css`)]);

console.log('\n=== one controls sheet ===');
ok('buttons.css and buttons-soft.css are gone', !existsSync(join(root, 'components/logos5/buttons.css')) && !existsSync(join(root, 'components/logos5/buttons-soft.css')));
ok('l5-controls.css loads right after l5.css', /import '\.\/logos5\/l5\.css';\s*import '\.\/logos5\/l5-controls\.css';/.test(app));
ok('  …and nothing imports the old sheets', !/buttons(-soft)?\.css'/.test(app + read('components/logos5/UniverseParts.tsx') + read('components/OnePrompt.tsx') + read('components/SocriaOneModal.tsx')));
ok('the three states: fill (is-primary), wash (aria-pressed/selected/expanded, is-on), hairline (the default)', /\.l5-btn\.is-primary \{/.test(controls) && /\[aria-pressed='true'\], \[aria-selected='true'\], \[aria-expanded='true'\], \.is-on/.test(controls) && /--c-wash: rgba\(var\(--c-fill-rgb\), 0\.08\)/.test(controls));
ok('the --l5b-* names the other sheets read now say the 5.5 values', /--l5b-r: 999px;/.test(controls) && /--l5b-ledge: none;/.test(controls) && /--l5b-edge: var\(--c-edge\);/.test(controls));
ok('the artifact strip is hairline chips, its old key gone', /className=\{`l5-chip l5s-art-pill/.test(read('components/logos5/Study.tsx')) && !/\.l5s-art-pill:active/.test(read('components/logos5/redesign.css')));

console.log('\n=== one icon button, one menu, one close, one label ===');
const tsx = [app, chrome, views, composer, read('components/logos5/UniverseParts.tsx'), read('components/OnePrompt.tsx'), read('components/SocriaOneModal.tsx')].join('\n');
ok('no .l5-iconbtn, .l5-icon-btn or .l5-menu-list is drawn any more', !/\bl5-iconbtn\b|\bl5-icon-btn\b|\bl5-menu-list\b/.test(tsx));
ok('a menu is .l5-menu, each item .l5-mi', /className=\{`l5-menu is-\$\{align\}/.test(chrome) && /className=\{`l5-mi\$\{it\.hint \? ' has-hint' : ''\}`\}/.test(chrome));
ok('the one close: an icon button with the × glyph, top right', /export function L5Close/.test(chrome) && /M6\.5 6\.5l11 11M17\.5 6\.5l-11 11/.test(chrome) && /className=\{`l5-icon l5-close/.test(chrome));
ok('  …used by the ask card, the model tools, the stage and the panel beside', /<L5Close className="l5-ask-x"/.test(read('components/logos5/L5Ask.tsx')) && /<L5Close className="l5m-x"/.test(read('components/logos5/ModelTools.tsx')) && /<L5Close className="l5-stage-x"/.test(chrome) && /<L5Close label=\{`Close \$\{besideTitle\}`\}/.test(views));
ok('the one label: 10.5 / 600 / .18em / uppercase / ink 45', /\.l5-label \{\s*font-size: 10\.5px;\s*font-weight: 600;\s*letter-spacing: 0\.18em;\s*text-transform: uppercase;/.test(controls));

console.log('\n=== six steps of type, four radii, no blur ===');
const STEPS = new Set([10.5, 12.5, 13.5, 15.5, 18, 32]);
const offStep = [];
for (const [f, css] of SHEETS) {
  for (const m of css.matchAll(/font-size:\s*([0-9.]+)px/g)) {
    const v = Number(m[1]);
    // glyph sizes (17, 20, 22, 30 for a × or an icon character), a thumbnail's 9 and one display numeral stay
    // their own; 16 is a field's size on a touch screen, where anything smaller makes the browser zoom in
    if (!STEPS.has(v) && v >= 10 && v <= 16.75 && v !== 16) offStep.push(`${f}:${v}`);
  }
}
ok('every reading size in the workspace sheets is one of the six steps', offStep.length === 0, offStep.slice(0, 8).join(' '));
const offRadius = [];
for (const [f, css] of SHEETS) {
  for (const m of css.matchAll(/border-radius:\s*([^;]+);/g)) {
    for (const part of m[1].split(/\s+/)) {
      const px = /^([0-9.]+)px$/.exec(part);
      if (!px) continue;
      const v = Number(px[1]);
      if (v > 2 && v < 60 && ![6, 10, 16].includes(v)) offRadius.push(`${f}:${v}`);
    }
  }
}
ok('every corner is 999, 16, 10 or 6 (hairline bars keep 1–2)', offRadius.length === 0, offRadius.slice(0, 8).join(' '));
ok('your words: 16 16 6 16, in the wash', /border-radius: 16px 16px 6px 16px;\s*background: rgba\(var\(--lg-primary-rgb, 53, 70, 32\), 0\.08\);/.test(read('components/logos5/l5v.css')));
ok('no backdrop blur anywhere in the workspace', SHEETS.every(([, css]) => !/backdrop-filter:\s*blur/.test(css)));
ok('no press travel and no lit, lipped primary', SHEETS.every(([, css]) => !/transform: translateY\(1px\)/.test(css) && !/inset 0 1px 0 rgba\(255, 255, 255, 0\.16\)/.test(css)));

console.log('\n=== colour on its job ===');
ok('something new is a 6px primary dot, not gold', /\.l5-switch-i \.l5-new \{[^}]*background: var\(--lg-primary\);/.test(read('components/logos5/redesign.css')) && !/l5-switch-dot[^}]*--lg-secondary/.test(read('components/logos5/redesign.css')));
ok("Socria's question is ink — green is yours", /\.socria-ask \{[^}]*color: var\(--lg-ink\);/.test(read('components/logos5/redesign.css')));
ok("Memory's regions are one ink, told apart by place and label", /--l5mm-region: rgba\(var\(--lg-ink-rgb, 35, 36, 31\), 0\.62\);/.test(read('components/logos5/memory.css')) && (read('components/logos5/memory.css').match(/--l5mm-(identity|goals|work|learning|people|prefs|recent|questions): var\(--l5mm-region\);/g) ?? []).length === 16);
ok('counts are plain tabular type, never badges', /\.l5-count \{\s*\/\*[^*]*\*\/\s*font-size: 12\.5px;\s*font-weight: 400;\s*font-variant-numeric: tabular-nums;/.test(read('components/logos5/l5.css')));

console.log('\n=== the header and the switch ===');
ok('one bar: the mark home, a label and the name in italic, the switch, Search ⌘K, Memory, More, the account', /className=\{`l5v-top/.test(views) && /src="\/socria-mark\.png"/.test(views) && /<span className="l5-label">\{kind\}<\/span>/.test(views) && /<div className="l5v-top-c">\{switcher\}<\/div>/.test(views) && /\{memory\}\s*\{presence\}\s*\{menu\}\s*\{account\}/.test(views));
ok('the switch is a tablist with arrow keys, aria-selected and a roving tab stop', /role="tablist" aria-label=\{label\} onKeyDown=\{onKey\}/.test(chrome) && /aria-selected=\{value === it\.id\}/.test(chrome) && /tabIndex=\{it\.id === focusId \? 0 : -1\}/.test(chrome) && /e\.key === 'ArrowRight'/.test(chrome));
ok('Chat · Files n · Artifacts n · Logic Map, and none chosen while zoomed out', /\{ id: 'content', label: VIEW_LABELS\.content, count: contentItems\.length \}/.test(app) && /\{ id: 'artifacts', label: VIEW_LABELS\.artifacts, count: artifactItems\.length, fresh: artFresh \}/.test(app) && /value=\{oneView \? studyTab : zoomed \? '' : studyTab\}/.test(app));
ok('the view is called Files; its id stays content', /content: 'Files',/.test(read('lib/logos5/views.ts')));

console.log('\n=== the composer: four controls ===');
ok('"+" holds Attach, the host\'s own (Make), Search my files and ∑', /label="Add"[\s\S]{0,600}label: 'Attach'[\s\S]{0,300}\.\.\.\(plusItems \?\? \[\]\)[\s\S]{0,200}label: 'Search my files'[\s\S]{0,200}Mathematical symbols/.test(composer));
ok('Make lives under "+": its picker opens from there and shows a button only once something is chosen', /plusItems=\{\[\{ label: 'Make'/.test(app) && /<MakePicker value=\{makeId\} onChange=\{pickMake\} open=\{makeOpen\} onOpenChange=\{setMakeOpen\} bare \/>/.test(app) && /\(!bare \|\| now\) &&/.test(read('components/logos5/MakePicker.tsx')));
ok('"Asking about · {topic} ×": one line, a label and the one close', /className=\{`lg-about-chip l5-asking\$\{guide \? ' has-guide' : ''\}`\}/.test(composer) && /<span className="l5-label">Asking about<\/span>/.test(composer) && /<L5Close className="l5-asking-x"/.test(composer));
ok('the only white: the composer, on Paper; the placeholder serif italic', /--l5-composer: #fff;/.test(read('components/logos5/l5v.css')) && /textarea::placeholder \{\s*font-family: var\(--l5-serif\);\s*font-style: italic;\s*font-size: 18px;/.test(read('components/logos5/l5v.css')));
ok('folded, the first tool unfolds the conversation: "Conversation n"', /: !convoOpen && !narrow && activeId && messages\.length > 0 \?/.test(app) && /Conversation <span className="l5-count">\{userTurns\}<\/span>/.test(app));

console.log('\n=== the Logic Map ===');
ok('asking about a card: Challenge it · Trace it back · Take it to research', /label: 'Challenge it'/.test(app) && /label: 'Trace it back'/.test(app) && /label: 'Take it to research'/.test(app));
ok('the legend is type at the foot: supports, depends on, conflicts, relates, and how many ideas', /<ul className="l5v-legend" aria-label="What the lines mean">/.test(app) && /is-conflicts[\s\S]{0,80}conflicts/.test(app) && /\{map\.nodes\.length\} \{map\.nodes\.length === 1 \? 'idea' : 'ideas'\}/.test(app));
ok('the conversation beside docks on the left unless put elsewhere — on the right beside a study\'s desk (Screen 4)', /fresh: Side = 'left'/.test(read('lib/logos5/views.ts')) && /return s\.beside === 'chat' \? fresh : 'right';/.test(read('lib/logos5/views.ts')) && /const chatSideFresh: ChatSide = deskOn && studyTab === 'artifacts' \? 'right' : 'left';/.test(app) && /const chatSideNow: ChatSide = chatSide \?\? chatSideFresh;/.test(app));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
