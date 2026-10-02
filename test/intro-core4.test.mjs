// The Core 4 introduction, and the onboarding beat that sets it up.
//
// WHAT A PRODUCT TOUR CAN GO WRONG AT, in order of how badly:
//
//   it shows a drawing of the feature, which can be made better than the
//   feature, and is therefore an advertisement rather than a demonstration;
//   it announces itself to somebody who already said no, or who is already
//   using the thing;
//   it marks itself as read on the way out for somebody who never saw it —
//   a signed-out visitor sent to sign-in, who then never gets told again;
//   it teaches a control and then lands the person somewhere the control
//   does not exist.
//
// Every assertion here is one of those. The first is why the stage imports
// the picker's own Dial, the chat's own RichText and the route's own
// renderDisclosure rather than drawing any of them.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

const modal = read('components/IntroCore4Modal.tsx');
const chat = read('app/chat/page.tsx');
const onboarding = read('components/onboarding/Onboarding.tsx');
const picker = read('components/ModelPicker.tsx');

console.log('=== the stage is the real product, not a picture of it ===');
{
  ok('the dials are the picker’s own control',
    /import \{ Dial \} from '\.\/ModelPicker'/.test(modal) && /export function Dial/.test(picker));
  ok('  reading the real option tables',
    /options=\{READABILITY_OPTIONS\}/.test(modal) && /options=\{LENGTH_OPTIONS\}/.test(modal));
  ok('  and they move, because they are the control',
    /onPick=\{setReadability\}/.test(modal) && /useState<Readability>/.test(modal));
  ok('the web disclosure is the function the route calls',
    /import \{ renderDisclosure \} from '@\/lib\/core4\/web'/.test(modal) && /renderDisclosure\(RESEARCH\)/.test(modal));
  ok('the replies go through the chat’s own renderer',
    /import \{ RichText \}/.test(modal) && (modal.match(/<RichText /g) ?? []).length >= 3);
  ok('the memory cards are the design system’s node',
    /import \{ LogosNode \}/.test(modal) && /<LogosNode type="assumption"/.test(modal));

  // A tour that keeps moving while somebody is dragging a slider is a tour
  // that takes the control away mid-use.
  ok('touching a dial stops the clock', /held\.current = true/.test(modal) && /if \(!held\.current\) setT/.test(modal));
  ok('reduced motion gets no clock at all', /prefers-reduced-motion: reduce/.test(modal));
}

console.log('\n=== opened, it is the demonstration and nothing else ===');
{
  // The first version carried a kicker, a headline, a standfirst, three
  // numbered dispatches and a footnote in front of a stage that says the same
  // things by running. If the scenes do not make the case, three paragraphs
  // claiming they do will not either.
  ok('the dispatch list is gone', !/j3-dispatch/.test(modal) && !/DISPATCHES/.test(modal));
  ok('  and so is the kicker above the headline', !/j3-kicker/.test(modal));
  ok('one sentence under the title, not three', (modal.match(/j3-standfirst/g) ?? []).length === 1);
  ok('the stage itself is untouched', /c4-stage/.test(modal) && (modal.match(/scene\.id === /g) ?? []).length === 4);
  ok('and the way out is still two controls', /core3-modal-checkbox/.test(modal) && /core3-modal-primary/.test(modal));
}

console.log('\n=== the standing invitation is Logos 2’s; Core 4’s is one press away ===');
{
  // The slot beside the composer belongs to the environment now — the surface
  // a person would not guess from a text box. Core 4's announcement is not
  // gone: picking Core 4 without an account still opens it.
  const pill = read('components/TryLogos2Pill.tsx');
  ok('the pill is Logos 2’s', /Try Logos 2/.test(pill) && /ModelGlyph model="logos-2"/.test(pill));
  ok('  and the Core 4 pill is gone', !/TryCore4Pill/.test(chat));
  ok('it opens the Logos 2 cover', /onOpen=\{\(\) => setLogosModalOpen\(true\)\}/.test(chat));
  ok('nobody is invited to where they already are', /SOCRIA_MODELS\[currentModel\]\.logosSurface/.test(pill));
  ok('“don’t show again” takes the pill with it',
    /visible=\{!logosDismissed\}/.test(chat) && /setLogosDismissed\(true\)/.test(chat));
  ok('the Core 4 introduction is still opened by a gated pick', /if \(next === 'core-4'\) setCore4IntroOpen\(true\)/.test(chat));
}

console.log('\n=== who is asked, and who is not ===');
{
  ok('it has its own dismissal key, not the Logos one',
    /CORE4_INTRO_DISMISS_KEY = 'socria\.core4IntroDontShowAgain\.v1'/.test(chat));
  ok('  which is a different key from the Logos invitation’s',
    /LOGOS_INTRO_DISMISS_KEY = 'socria\.logosIntroDontShowAgain\.v1'/.test(chat));
  // THE ANNOUNCEMENT NO LONGER OPENS ITSELF. A first visit is taught by the
  // first reply (lib/first-run.ts); the modal is reached from the pill and
  // the picker, and only there.
  ok('the announcement no longer opens itself', /THE ANNOUNCEMENT NO LONGER OPENS ITSELF/.test(chat)
    && !/if \(!dismissed && here !== 'core-4'/.test(chat));
  ok('  the dismissals are still read, for the pill', /setCore4Dismissed\(localStorage\.getItem\(CORE4_INTRO_DISMISS_KEY\) === '1'\)/.test(chat));
  ok('it takes the slot the Logos invitation had',
    /setCore4IntroOpen\(true\)/.test(chat) && !/if \(!dismissed && !isLogosSurface\(readModel\(\)\)\) \{\s*setLogosModalOpen\(true\)/.test(chat));

  // THE ONE THAT MATTERS. A visitor sent to sign-in has not seen Core 4.
  const start = chat.slice(chat.indexOf('function handleCore4IntroStart'), chat.indexOf('function handleCore4IntroStart') + 900);
  ok('signing in does not mark the announcement as read',
    start.indexOf("router.push('/sign-in") > start.indexOf('setItem(CORE4_INTRO_DISMISS_KEY'),
    'the dismiss must be inside the hasAccount branch');
  ok('  and the redirect comes back to Core 4', /redirect_url=%2Fchat%3Fmodel%3Dcore-4/.test(chat));
  ok('starting on Core 4 is recorded as their choice, not our default',
    /setModel\('core-4'\);\s*\n\s*chooseModel\('core-4'\)/.test(chat));

  // Pressing Core 4 in the picker while signed out should explain Core 4.
  ok('a gated Core 4 press opens the Core 4 introduction', /if \(next === 'core-4'\) setCore4IntroOpen\(true\)/.test(chat));
  ok('  and anything else still opens the Logos one', /else setLogosModalOpen\(true\)/.test(chat));
}

console.log('\n=== the beginning is the premise and the thought, then the product ===');
{
  // The five-beat sequence — intents, a rehearsed reply, a drawn map, the
  // dials — is gone. What a new account meets is the same two beats every
  // surface shows a first-time visitor (components/onboarding/FirstRunIntro.tsx),
  // and then the real product with their sentence in its composer.
  ok('the onboarding is the shared first-run screen', /FirstRunIntro/.test(onboarding));
  ok('  with no dials of its own', !/import \{ Dial \}/.test(onboarding) && !/rememberReadability/.test(onboarding));
  ok('  and no rehearsed reply', !/resolveScript/.test(onboarding));
  ok('it carries the sentence rather than asking for it twice', /carry\(/.test(onboarding));
  ok('it lands them in the chat', /router\.push\(toLogos \? '\/chat\?model=logos-2' : '\/chat'\)/.test(onboarding));
  ok('  or in Logos when that is where they were going', /params\?\.get\('to'\) === 'logos'/.test(onboarding));
  ok('  and never on a withdrawn surface', !/router\.push\('\/chat\?model=logos'\)/.test(onboarding));
  ok('the premise is recorded once, skipped or not', /reach\('socria\.intro', \{ skipped: true \}\)/.test(onboarding));

  // The chat and the onboarding must agree about where a preference lives.
  const store = read('lib/socria-model-store.ts');
  ok('one definition of each key', /READABILITY_KEY = 'socria\.readability\.v1'/.test(store) && !/READABILITY_KEY = /.test(chat));
  ok('an unknown stored value is standard, not an error',
    /raw === 'simple' \|\| raw === 'advanced' \? raw : 'standard'/.test(store));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
