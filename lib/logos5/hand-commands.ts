// lib/logos5/hand-commands.ts — WHAT YOU SAY WHILE YOUR HANDS ARE ON.
//
// Socria Voice works alongside the hands (lib/hand-session.ts): point with a
// hand and say what to do. Spoken while AR Mode is open, these drive AR Mode
// ("zoom in", "turn left", "select the rent idea", "research this", "take
// this off the map", "leave"); spoken while the hands are a pointer over the
// rest of Logos 5, they act where the hand is ("click", "open this", "scroll
// down", "zoom in"). Starting and stopping the hands, and showing or hiding
// the camera, can be said anywhere.
//
// "This" is the card the hand is on — AR Mode and the hand pointer both make
// the card a hand rests on the focus, the same focus Point & Ask uses, so a
// question ("what supports this?") is about it too.
//
// Only whole, plain commands are read here; anything else is a question for
// Socria and goes on as before. Nothing destructive is done here: taking a
// card off the map ARMS it in AR Mode, where a thumbs up, Confirm or a spoken
// "yes" does it.
//
// PURE. Text in, a command (or null) out.

/** "Hide the camera" / "show the camera", said: the camera view (components/logos5/HandCam.tsx) listens for this. */
export const HANDCAM_EVENT = 'socria:handcam';

export type ArCommand =
  | { act: 'zoom'; dir: 1 | -1 }
  | { act: 'turn'; dir: 1 | -1 }
  | { act: 'fit' }
  | { act: 'select'; label: string }
  | { act: 'deselect' }
  /** on "this": the card the hand is on, else the one selected */
  | { act: 'research' | 'challenge' | 'explore' | 'remove' }
  | { act: 'confirm' }
  | { act: 'cancel' }
  | { act: 'leave' }
  | { act: 'room'; shown: boolean };

export type HandCommand =
  | { kind: 'ar'; cmd: ArCommand }
  | { kind: 'hands'; on: boolean }
  | { kind: 'camera'; shown: boolean }
  | { kind: 'open-ar' }
  /** the hand pointer, where the hand is */
  | { kind: 'pointer'; act: 'click' | 'scroll'; dir?: 1 | -1 }
  | { kind: 'pointer'; act: 'zoom'; dir: 1 | -1 };

export interface HandCommandContext {
  /** AR Mode is open */
  ar: boolean;
  /** the hands are on (anywhere) */
  hands: boolean;
}

/** As said: lower case, no punctuation, no "please", no "Socria," in front, one space between words. */
export function plainSaid(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'’‘.,!?;:]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(hey |ok |okay )?socria /, '')
    .replace(/^(please |can you |could you |would you )+/, '')
    .replace(/ please$/, '')
    .replace(/ for me$/, '')
    .trim();
}

const THIS = '(?:this|that|it|this one|that one|this card|that card|this idea|that idea)';
const R = {
  // anywhere
  handsOn: /^(?:start|turn on|switch on) (?:hand tracking|the hand tracking|my hands|hands|using my hands)$|^use my hands$/,
  handsOff: /^(?:stop|turn off|switch off|end) (?:hand tracking|the hand tracking|my hands|hands|using my hands|the camera|camera)$/,
  cameraShow: /^show (?:the )?camera(?: view)?$/,
  cameraHide: /^hide (?:the )?camera(?: view)?$/,
  openAr: /^(?:open|start|go into|enter|turn on) (?:the )?ar(?: mode)?$|^ar mode$/,
  // AR Mode
  zoomIn: /^(?:zoom in|closer|bigger|make it bigger|enlarge)$/,
  zoomOut: /^(?:zoom out|further|further away|smaller|make it smaller)$/,
  turnLeft: /^(?:turn|rotate|spin)(?: (?:it|the map))? (?:left|anti ?clockwise|counter ?clockwise)$/,
  turnRight: /^(?:turn|rotate|spin)(?: (?:it|the map))? (?:right|clockwise)$/,
  fit: /^(?:fit(?: (?:it|the map|everything))?(?: (?:on|to) (?:the )?screen)?|show (?:me )?(?:everything|the whole map|all of it|it all)|reset(?: the view)?|centre it|center it)$/,
  deselect: /^(?:deselect|unselect|clear (?:the )?selection|close (?:the )?card|close that)$/,
  research: new RegExp(`^(?:research|look up|look into|find out about) ${THIS}$`),
  challenge: new RegExp(`^(?:challenge|question|push back on) ${THIS}$`),
  explore: new RegExp(`^(?:explore|expand|open up|go deeper on|dig into) ${THIS}$`),
  remove: new RegExp(`^(?:(?:take|move) ${THIS} (?:off|out of|away from) (?:the )?(?:map|logic map)|take ${THIS} off|(?:remove|delete) ${THIS}(?: from (?:the )?map)?)$`),
  leave: /^(?:leave|exit|close|quit|done with)(?: (?:the )?ar(?: mode)?)?$|^(?:done|i m done|im done|that s all|thats all|back to the map)$/,
  roomShow: /^show (?:the )?room$/,
  roomHide: /^hide (?:the )?room$/,
  select: /^(?:select|pick|open|show me|go to|find|focus on) (?:the )?(?:card |idea )?(.{2,60}?)(?: card| idea)?$/,
  // the hand pointer
  click: new RegExp(`^(?:click|tap|press|select|open|choose)(?: (?:on )?(?:${THIS}|here|there))?$`),
  scrollDown: /^(?:scroll|go) down$|^page down$/,
  scrollUp: /^(?:scroll|go) up$|^page up$/,
};

/** A spoken command for the hands or AR Mode, or null — the words are then a question for Socria. */
export function readHandCommand(text: string, ctx: HandCommandContext): HandCommand | null {
  const t = plainSaid(text);
  if (!t || t.length > 80) return null;

  if (R.handsOff.test(t)) return ctx.hands ? { kind: 'hands', on: false } : null;
  if (R.handsOn.test(t)) return { kind: 'hands', on: true };
  if (ctx.hands && R.cameraShow.test(t)) return { kind: 'camera', shown: true };
  if (ctx.hands && R.cameraHide.test(t)) return { kind: 'camera', shown: false };

  if (ctx.ar) {
    if (R.zoomIn.test(t)) return { kind: 'ar', cmd: { act: 'zoom', dir: 1 } };
    if (R.zoomOut.test(t)) return { kind: 'ar', cmd: { act: 'zoom', dir: -1 } };
    if (R.turnLeft.test(t)) return { kind: 'ar', cmd: { act: 'turn', dir: -1 } };
    if (R.turnRight.test(t)) return { kind: 'ar', cmd: { act: 'turn', dir: 1 } };
    if (R.fit.test(t)) return { kind: 'ar', cmd: { act: 'fit' } };
    if (R.deselect.test(t)) return { kind: 'ar', cmd: { act: 'deselect' } };
    if (R.research.test(t)) return { kind: 'ar', cmd: { act: 'research' } };
    if (R.challenge.test(t)) return { kind: 'ar', cmd: { act: 'challenge' } };
    if (R.explore.test(t)) return { kind: 'ar', cmd: { act: 'explore' } };
    if (R.remove.test(t)) return { kind: 'ar', cmd: { act: 'remove' } };
    if (R.roomShow.test(t)) return { kind: 'ar', cmd: { act: 'room', shown: true } };
    if (R.roomHide.test(t)) return { kind: 'ar', cmd: { act: 'room', shown: false } };
    if (R.leave.test(t)) return { kind: 'ar', cmd: { act: 'leave' } };
    const sel = R.select.exec(t);
    if (sel && !new RegExp(`^${THIS}$`).test(sel[1])) return { kind: 'ar', cmd: { act: 'select', label: sel[1].trim() } };
    if (new RegExp(`^(?:select|pick|open) ${THIS}$`).test(t)) return { kind: 'ar', cmd: { act: 'explore' } };
    return null;
  }

  if (R.openAr.test(t)) return { kind: 'open-ar' };
  if (ctx.hands) {
    if (R.click.test(t)) return { kind: 'pointer', act: 'click' };
    if (R.scrollDown.test(t)) return { kind: 'pointer', act: 'scroll', dir: 1 };
    if (R.scrollUp.test(t)) return { kind: 'pointer', act: 'scroll', dir: -1 };
    if (R.zoomIn.test(t)) return { kind: 'pointer', act: 'zoom', dir: 1 };
    if (R.zoomOut.test(t)) return { kind: 'pointer', act: 'zoom', dir: -1 };
  }
  return null;
}

/** The card a spoken label means, by its words: an exact label first, then the one that contains them, then the most words in common. */
export function findCard<T extends { id: string; label: string }>(cards: readonly T[], said: string): T | null {
  const want = plainSaid(said).replace(/^(?:the|a|an) /, '');
  if (!want) return null;
  const norm = (s: string) => plainSaid(s);
  const exact = cards.find((c) => norm(c.label) === want);
  if (exact) return exact;
  const holds = cards.filter((c) => norm(c.label).includes(want));
  if (holds.length) return holds.sort((a, b) => a.label.length - b.label.length)[0];
  const words = want.split(' ').filter((w) => w.length > 2);
  let best: T | null = null;
  let bestN = 0;
  for (const c of cards) {
    const l = norm(c.label);
    const n = words.filter((w) => l.includes(w)).length;
    if (n > bestN) {
      best = c;
      bestN = n;
    }
  }
  return bestN >= Math.max(1, Math.ceil(words.length / 2)) ? best : null;
}
