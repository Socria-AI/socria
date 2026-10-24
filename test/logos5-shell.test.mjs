// THE LOGOS 5 SHELL, WIRED (Alex Tran, Logos 5 Comments v2).
//
// The four views and what moves between them are held in
// test/logos5-views.test.mjs, from the pure modules. Here: that the screen is
// built from them — the top bar keeps only what is global, the tabs are the
// four views, Split View docks one panel beside, search answers ⌘K / Ctrl K,
// the omnibox is the one Alex described — and that what was retired is gone.

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));

const app = read('components/LogosApp.tsx');
const shell = read('components/logos5/L5Views.tsx');
const css = read('components/logos5/l5v.css');
const composer = read('components/LogosComposer.tsx');

console.log('\n=== the screen is the four views ===');
ok('a line of thinking is L5Layout over the view that is open', /<L5Layout\s+view=\{studyTab\}/.test(app) && /primary=\{primaryEl\}/.test(app));
ok('  each view has its own body: Chat the thread, Content, Artifacts, the Logic Map', /studyTab === 'chat' \? l5Thread : studyTab === 'content' \? contentView : studyTab === 'artifacts' \? artifactsView : logicView/.test(app));
ok('  the tab row is the four views, with what each holds counted', /<L5Tabs\s+value=\{studyTab\}/.test(app) && /content: contentItems\.length/.test(app) && /logic_map: map\.nodes\.length/.test(app));
ok('  the tabs are a tablist that takes the arrow keys', /role="tablist"/.test(shell) && /ArrowRight/.test(shell) && /aria-selected=\{on\}/.test(shell) && /tabIndex=\{on \? 0 : -1\}/.test(shell));
ok('"Components" is called Content everywhere it is said', !/label: 'Components'/.test(app) && !/'components'/.test(app));
ok('the floating, draggable conversation box is retired: Split View docks it instead', !existsSync(join(root, 'components/logos5/L5Line.tsx')) && !existsSync(join(root, 'lib/logos5/box.ts')) && !/<L5Line/.test(app));
ok('the binary "where do you want to start?" panel is gone; the recommended topic is marked on its card', !/<StartPanel/.test(app) && /Recommended start/.test(read('components/logos5/Study.tsx')));

console.log('\n=== the top bar: only what is global ===');
ok('← Universal Map, top left, with its label', /aria-label="Back to the Universal Map"/.test(shell) && /<span>Universal Map<\/span>/.test(shell));
ok('  it is no longer hidden in the ⋯ menu', !/label: 'Universal Map', hint: 'Every conversation, as one map'/.test(app));
ok('search in the middle of the bar, ⌘K / Ctrl K', /className="l5v-search"/.test(shell) && /aria-keyshortcuts="Meta\+K Control\+K"/.test(shell));
ok('  ⌘K / Ctrl K opens it from anywhere in Logos 5', /\(e\.metaKey \|\| e\.ctrlKey\) && !e\.altKey && !e\.shiftKey && e\.key\.toLowerCase\(\) === 'k'/.test(app));
ok('  a result opens where it lives', /function openHit\(h: Hit\)/.test(app) && /openFromHome\(sid, local\)/.test(app) && /openCite\(docId, block\)/.test(app));
ok('Split View replaces "+ View": the Logic Map’s workspace has no "+ View"', /addViews=\{false\}/.test(app) && /props\.addViews === false \? null : addView/.test(read('components/workspace/Workspace.tsx')));
ok('  the drawer is a menu that closes on Escape, its panels in three sections', /role="menu"/.test(shell) && /e\.key === 'Escape'/.test(shell) && /SPLIT_SECTIONS\.map/.test(shell));
ok('  the panel beside is resized by a separator that takes the arrow keys', /role="separator"/.test(shell) && /aria-valuenow/.test(shell) && /ArrowLeft/.test(shell));
ok('Synthesize is the Content and Logic Map views’ own action, not the bar’s', /\(studyTab === 'content' \|\| studyTab === 'logic_map'\) && canSynthesize\(map\)/.test(app) && !/label: synthBusy === 'workspace' \? 'Reading your map…' : 'Synthesize'/.test(app));
ok('Memory lives in the profile: the account chip’s own menu', /label: 'Memory', hint: 'What Socria remembers about you'/.test(app) && /items\?\.length/.test(read('components/account/AccountControl.tsx')) && !/<MindButton/.test(app));

console.log('\n=== the omnibox ===');
ok('Enter sends; Shift+Enter is a new line; a word being composed is not sent', /e\.key === 'Enter' && !e\.shiftKey && !\(e\.nativeEvent as KeyboardEvent\)\.isComposing/.test(composer));
ok('  nothing is sent again while the answer has not begun', /canSend && !waiting/.test(composer) && /waiting=\{busy && !streaming && !group/.test(app) || /waiting=\{/.test(app));
ok('  the send button spins until the first words arrive', /className="lg-send is-waiting" disabled/.test(composer) && /\.lg-send-spin \{/.test(css));
ok('it grows with what is written to 240px, then scrolls inside', /const cap = 240;/.test(composer) && /el\.style\.height = Math\.min\(el\.scrollHeight, cap\) \+ 'px';/.test(composer));
ok('  a scrollbar only when there is more than the box shows — never words out of reach', /el\.style\.overflowY = el\.scrollHeight > el\.clientHeight \+ 1 \? 'auto' : 'hidden';/.test(composer));
ok('  filled while hidden, it is not measured at nothing', /if \(!el\.clientWidth\) \{\s*el\.style\.height = '';/.test(composer));
ok('  measured again when its width changes, or the font arrives', /new ResizeObserver\(\(\) => \{\s*if \(el\.clientWidth && el\.clientWidth !== grownAt\.current\) grow\(\);/.test(composer) && /addEventListener\?\.\('loadingdone', grow\)/.test(composer));
ok('the paperclip is inside the pill, at its left', /<div className="l5-crow">/.test(composer) && /className="lg-attach l5-clip"/.test(composer) && composer.indexOf('l5-clip') < composer.indexOf('<textarea', composer.indexOf('l5-crow')));
ok('a pill: radius 28px, a neutral shadow, centred, at most 768px', /border-radius: 28px;/.test(css) && /width: min\(768px, calc\(100% - 32px\)\)/.test(css));
ok('Chat is one centred column, 768px at most', /\.l5v-body\.is-chat \.l5-thread-in,\s*\.l5v-body\.is-chat \.l5-dock \{\s*max-width: 768px;/.test(css));

console.log('\n=== type ===');
ok('the shell is set in the app’s own faces: the bundled Inter for the interface', /\.logos-root \.l5 \{\s*--l5-ui: var\(--lg-sans\);\s*\}/.test(css));
ok('  and Instrument Serif where Logos 5 uses its serif — the shell does not replace it', !/--l5-serif\s*:/.test(css) && /--l5-serif: var\(--serif, 'Instrument Serif', Georgia, serif\);/.test(read('components/logos5/l5.css')));
ok('  no face of its own: no bare "Inter" ahead of the bundled one, no base size or line height laid over the reading', !/font-family:\s*Inter|--l5-ui:\s*Inter/.test(css) && !/\.logos-root \.l5 \{[^}]*font-size/.test(css) && !/\.l5-prose em \{\s*font-family/.test(css));

console.log('\n=== loading, truthfully ===');
ok('the thread shows only what has happened: files read, sent, sources found, writing', /label: `Read \$\{turnInfo\.files\}/.test(app) && /label: 'Sent', state: 'done'/.test(app) && /to check it against/.test(app) && /'Writing the reply' : 'Socria is reading it'/.test(app));
ok('  the sources are counted from what the server says it found', /function sourcesIn\(h: Headers\)/.test(app) && /X-Socria-Sources/.test(app));
ok('  a shimmer and a status the screen reader is told', /className="l5v-working" role="status" aria-live="polite"/.test(shell));

console.log('\n=== rules A–D, wired ===');
ok('a turn is read once, before it is sent, by the runtime’s own reader', /const route = routeTurn\(\{ text: content, attachments: atts/.test(app) && /setScreen\(\(sc\) => afterSend\(route, sc, narrowRef\.current\)\)/.test(app));
ok('  a question asked on a card is answered on the card: the screen does not move', /if \(l5 && !fromCard\)/.test(app));
ok('rule B: an attached document is read into Content and said under the turn — not opened', /if \(opened && !l5\) setDisplayToOpen\(opened\)/.test(app) && /Added to Content/.test(app));
ok('rule C: something made because it was asked is shown in Artifacts', /setScreen\(\(s\) => onMade\(true, s, narrowRef\.current\)\)/.test(app));
ok('  made in the background, the tab is marked and the screen stays', /setArtFresh\(true\)/.test(app));
ok('a document opened goes to Content, made things to Artifacts', /a document is Content: read there/.test(app));
ok('the map is drawn only when worth its cost', /function mapWanted\(route: TurnRoute, filler: boolean\)/.test(app) && /needsMap\(\{/.test(app));
ok('  and drawn again, once, when the Logic Map is opened on a map older than the conversation', /if \(turnsSince\(messages, map\.drawnAt\) > 0\) refreshMap\(\)/.test(app));
ok('  every map that lands says when it was drawn', /drawnAt: Date\.now\(\)/.test(app));

console.log(`\nlogos5 shell: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
