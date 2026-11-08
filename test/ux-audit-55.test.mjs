// LOGOS 5.5 — THE UX AUDIT (desktop, tablet, phone; paper and dark).
//
// What the audit found broken or inconsistent, and what each fix promises.
// These read the sources: the rules are the product's, not one page's.
//
//   collisions   the home box drawn over the map on a phone; Socria's reply
//                under the chatbox and the guest note; Words' card behind the
//                box; "← The space" run into "Chat"; the canvas that could not
//                scroll (the dot grid's class is also the typing dots)
//   one name     Files, Artifacts, Logic Map, Conversation — everywhere
//   one system   no blur; the secondary inks readable; More a word like its
//                neighbours; the guest's count in words; Send legible at rest
//   the map      labels readable at any zoom; every subject's disc deep enough
//                for its white title
//   less         empty kinds not offered; "Thinking" not said on every row;
//                search one row per finding, sentence case, one column

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 300))));

const r2 = read('components/logos5/revision2.css');
const space = read('components/logos5/space.css');
const spaceTsx = read('components/logos5/L5Space.tsx');
const app = read('components/LogosApp.tsx');
const controls = read('components/logos5/l5-controls.css');
const uni = read('components/logos5/universe.css');

console.log('\n=== collisions ===');
ok('the Universal Map ends where the box begins: paper comes up under the foot (and the map can still be dragged through it)', /\.l5h-main \.l5h-foot::before \{[^}]*z-index: -1; pointer-events: none; background: linear-gradient\(to top, var\(--c-paper\)/.test(r2));
ok('  a touch screen zooms with two fingers: no + − Fit keys over a phone\'s map', /@media \(pointer: coarse\) \{ \.logos-root \.l5 \.l5h\.is-narrow \.l5h-zoom \{ display: none; \} \}/.test(r2));
ok('the space\'s canvas is a block: the dot grid\'s class (also the typing dots, inline-flex) no longer pins its columns to the screen\'s height', /\.logos-root \.ls-canvas\.l5-dots \{ display: block; \}/.test(space));
ok('  and its foot is the chatbox\'s measured height, so what the box covers can always be scrolled clear', /padding: 28px 40px calc\(var\(--ls-foot, 134px\) \+ 56px\)/.test(space) && /root\.style\.setProperty\('--ls-foot', `\$\{chat\.offsetHeight\}px`\)/.test(spaceTsx) && /<div className="ls-chat" ref=\{chatRef\}>/.test(spaceTsx));
ok('Socria\'s reply is kept whole above the chatbox — on arrival, once the cards settle, and when a note grows the foot', /const keepReplyClear = \(smooth = false\) =>/.test(spaceTsx) && /el\.querySelector\('\.ls-bub'\)/.test(spaceTsx) && /if \(!arriving\) keepRef\.current\(true\);/.test(spaceTsx) && /if \(grew\) keepRef\.current\(true\);/.test(spaceTsx));
ok('the open idea is framed with the whole of the column after it, not a fixed 320px that left a made card cut by the edge', /const after = next instanceof HTMLElement && next\.classList\.contains\('ls-col'\) \? gap \+ next\.offsetWidth \+ 40 : 40;/.test(spaceTsx) && !/right \+ 320 - sc\.clientWidth/.test(spaceTsx));
ok('  the space\'s edges fade into the paper (sides, and the top once scrolled) instead of slicing cards', /mask-image: linear-gradient\(to right, transparent, #000 32px, #000 calc\(100% - 32px\), transparent\), linear-gradient\(to bottom, transparent, #000 28px\);/.test(space) && /mask-composite: intersect;/.test(space));
ok('Words brings the latest turn\'s words up clear of the box', /if \(narrow \|\| kind !== 'words'\) return;/.test(spaceTsx) && /querySelectorAll<HTMLElement>\('\.ls-word'\)/.test(spaceTsx));
ok('"← The space" is set off from the views by a hairline (it read "The spaceChat")', /\.l5v-top-c \.l5-tospace \{ align-self: center; margin-right: 24px; padding-right: 24px; border-right: 1px solid var\(--c-rule-2\);/.test(r2));
ok('the floating guest note never sits over a dialog (it showed above Search\'s dimmed page)', /<GuestNudge open=\{nudgeOpen && !\(convoOpen && !homeShown && !mindShown\) && searchOpen === null && !guideOpen && !oneOpen && !guestWall\}/.test(app));
ok('  in the one space the inline note is paper — it floats over the canvas there', /\.ls-chat \.l5-guestnudge\.is-inline \{[^}]*background-color: var\(--c-paper\);/.test(r2));

console.log('\n=== one name for each thing ===');
ok('the space\'s row says Files and Artifacts — the names of the views and the menus — not Brought and Made', /KIND_NAMES: Record<SpaceKind, string> = \{ all: 'Everything', ideas: 'Ideas', brought: 'Files', made: 'Artifacts', words: 'Words' \}/.test(spaceTsx));
ok('the board\'s column is "Files and artifacts"', /Files and artifacts · /.test(read('components/logos5/L5Board.tsx')) && !/Brought and made/.test(read('components/logos5/L5Board.tsx')));
ok('the conversation view is called Conversation (as "Read as a conversation" and the split already said), not Chat', /chat: 'Conversation',\n  \/\/ Logos 5: the view is called Files/.test(read('lib/logos5/views.ts')));
ok('the Logic Map is never "the Thinking Map" to the person: the asking-about source, the limit note, the panel, the poster, privacy', !/'Thinking Map'/.test(app) && !/Your free Thinking Map/.test(app) && /eyebrow: context \? `Logic Map · \$\{context\}` : 'Logic Map'/.test(read('components/MapPoster.tsx')) && /your Logic Maps, your drafts/.test(read('components/DataPrivacyPanel.tsx')));
ok('the canvas filters say Artifacts and Conversations', /\{ id: 'made', label: 'Artifacts' \},\n  \{ id: 'chats', label: 'Conversations' \}/.test(read('components/logos5/L5Canvas.tsx')));

console.log('\n=== one system ===');
ok('no blur behind the Socria One sheet (every sheet over Logos 5 dims the page; none blurs it)', !/backdrop-filter:\s*blur/.test(read('components/one/one-sheet.css')));
ok('the secondary inks are readable: 0.66 (4.9:1, as the older sheets\' --lg-ink-60) and 0.55 (3.5:1, was 2.7:1)', /--c-ink-60: rgba\(var\(--c-ink-rgb\), 0\.66\);/.test(controls) && /--c-ink-45: rgba\(var\(--c-ink-rgb\), 0\.55\);/.test(controls));
ok('  Socria\'s reply actions (Copy, Reply, Retry, Listen) in the readable ink', /\.l5-act \{[^}]*color: var\(--c-ink-60\);/.test(space));
ok('More is a word the size, weight and ink of Search and List beside it, in both headers', /:is\(\.l5-head-end, \.l5v-top-r\) > \.l5-menuhost > \.l5-link \{ font-size: 13\.5px; font-weight: 500; color: var\(--c-ink-70\);/.test(r2));
ok('the guest\'s count is words ("3 free messages left"), not five dots that said it again', !/l5-guestmeter-dots/.test(app) && /free \{GUEST_TURNS - guestUsed === 1 \? 'message' : 'messages'\} left/.test(app) && /\.l5-guestmeter \{ height: auto; padding: 0; border: 0; background: none;/.test(r2));
ok('the guest note is a line, not a toast: no badge, and its action is the page\'s one filled control (ink, moss on hover)', /\.l5-guestnudge-spark \{ display: none; \}/.test(r2) && /:is\(\.l5-guestnudge-go, \.l5-guestwall-go\) \{ background: var\(--c-ink\); color: var\(--c-paper\);/.test(r2));
ok('Send with nothing to send is quiet but legible (it was a quarter ink under a quarter opacity)', /\.lg-send\.l5-btn\.is-primary:disabled:not\(\.is-waiting\) \{ background: transparent; color: var\(--c-ink-45\); box-shadow: inset 0 0 0 1px var\(--c-ink-25\); opacity: 1; \}/.test(r2));

console.log('\n=== the map ===');
ok('a subject\'s name stays 10.5px or more on screen at any zoom (it came out at six pixels fitted to the window)', /font-size: max\(11\.5px, calc\(10\.5px \/ var\(--k, 1\)\)\);/.test(uni));
ok('  and a conversation\'s title 12px or more', /font-size: max\(var\(--f, 18px\), calc\(12px \/ var\(--k, 1\)\)\);/.test(uni));
{
  // every subject's disc carries a white title at 4.5:1 or more
  const block = uni.slice(uni.indexOf('.logos-root .l5 .l5h {'), uni.indexOf('}', uni.indexOf('.logos-root .l5 .l5h {')));
  const L = (h) => {
    const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  };
  const white = L('#fbfaf5');
  const weak = [...block.matchAll(/--sc-(\w+): (#[0-9a-f]{6});/g)].map(([, n, h]) => [n, (white + 0.05) / (L(h) + 0.05)]).filter(([, c]) => c < 4.5);
  ok('every subject colour on paper is deep enough for a white title (4.5:1)', weak.length === 0, JSON.stringify(weak));
}

console.log('\n=== less ===');
ok('a kind with nothing in it is not offered in the space\'s row ("Files 0" brought nothing forward); the chosen one stays', /filter\(\(k\) => k === 'all' \|\| k === kind \|\| \(k === 'words' \? turns\.length > 0 : Number\(counts\[k\]\) > 0\)\)/.test(spaceTsx));
ok('the list does not say "Thinking" on every row — only the kinds that tell you something', /t\.look === 'thinking' \? '' : t\.lookSaid/.test(read('components/logos5/UniverseParts.tsx')));
ok('the empty map says it once: its tip waits for a node to point at', /anchor: '\.l5b-hub',/.test(read('lib/logos5/tips.ts')) && !/anchor: '\.l5h-empty \.l5h-go, \.l5b-hub'/.test(read('lib/logos5/tips.ts')));
ok('  and its way to the box is a word in moss, not a dark banner', /\.l5h-main \.l5h-empty \.l5h-go \{[^}]*background: none;[^}]*color: var\(--c-moss\);/.test(r2));
{
  const search = read('components/logos5/GlobalSearch.tsx');
  const l5v = read('components/logos5/l5v.css');
  ok('search: a message found only by its conversation\'s name is not its own row, and the same words twice are one', /if \(!words \|\| words === \(h\.entity\.title \|\| ''\)\.trim\(\)\) return false;/.test(search) && /const key = `\$\{h\.entity\.session \?\? ''\}\|\$\{words\}`;/.test(search));
  ok('  its kinds are said as written (not title-cased to "Line Of Thinking") in one column, so every result starts in line', /\.l5gs-kind \{[^}]*flex: 0 0 116px;/.test(l5v) && !/\.l5gs-kind \{[^}]*text-transform: capitalize/.test(l5v));
}
ok('an idea opened from no particular turn says what can be done, not "Put on the map as the conversation went"', /'Drawn from the conversation\. Ask about it below\.'/.test(app) && !/Put on the map as the conversation went/.test(app));

console.log(`\nux audit 5.5: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
