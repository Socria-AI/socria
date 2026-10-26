// lib/logos5/commands.ts — THE WORKSPACE, OPERATED IN WORDS.
//
// Everything in Logos 5 that was reachable only by a press — a tab, Split
// View, an artifact's pill, the way home and back, another line of thinking,
// a new one, Memory, search, the length dial, Undo and Redo, Start writing,
// Synthesize, Retry, Save as template, Map this conversation, Save the map as
// an image, Hide the bars — is also a sentence here, read whole (never a word inside a longer message) and done by
// the same functions the presses call. Socria Voice needs it to operate the
// workspace without hands; typed, the same sentences work too, because there
// is one dispatcher (components/LogosApp.tsx send) and both kinds of turn go
// through it. What was done is said in the conversation, as the map's own
// commands always were, and nothing is sent to a model or spent.
//
// Conservative by construction: a command is the whole turn, so "can you open
// the map of Europe I drew last week and explain it" is a question for
// Socria, not a command; a name that matches nothing is not guessed at.
//
// PURE.

import type { Viewport } from './views';
import { plain } from '../voice/speech';

export type ReplyLength = 'concise' | 'standard' | 'detailed';

export type WorkspaceCommand =
  | { kind: 'view'; view: Viewport }
  | { kind: 'beside'; view: Viewport }
  | { kind: 'pair'; view: Viewport; beside: Viewport }
  | { kind: 'close-beside' }
  | { kind: 'artifact'; key: string; title: string }
  | { kind: 'home' }
  | { kind: 'new' }
  | { kind: 'length'; length: ReplyLength }
  | { kind: 'undo' }
  | { kind: 'redo' }
  | { kind: 'writing' }
  | { kind: 'synthesize' }
  | { kind: 'retry' }
  | { kind: 'template' }
  | { kind: 'thinking'; id: string; title: string }
  | { kind: 'memory' }
  | { kind: 'back' }
  | { kind: 'search'; query: string }
  | { kind: 'remap' }
  | { kind: 'map-image' }
  | { kind: 'bars'; hide: boolean }
  | { kind: 'captures' }
  | { kind: 'deselect' };

export interface CommandContext {
  /** what Artifacts holds, as its strip names it */
  artifacts: readonly { key: string; kind: string; title: string }[];
  /** the lines of thinking there are, by title — "open my rent conversation" */
  conversations?: readonly { id: string; title: string }[];
  /** what is over the line of thinking: the Universal Map, or Memory — where "go back" means back into it */
  over?: 'home' | 'memory' | null;
}

const LEAD = String.raw`(?:(?:please|can you|could you|would you|will you|hey socria|socria|ok|okay|now|and|so)\s+)*`;
const END = String.raw`(?:\s+(?:please|now|for me|thanks|thank you))?`;
const VIEWS = String.raw`(?:the\s+)?(chat|conversation|content|artifacts|logic map|thinking map|map)(?:\s+(?:view|tab|page))?`;
const viewOf = (w: string): Viewport => (w === 'chat' || w === 'conversation' ? 'chat' : w === 'content' ? 'content' : w === 'artifacts' ? 'artifacts' : 'logic_map');
const rx = (body: string) => new RegExp(`^${LEAD}(?:${body})${END}$`);

const VIEW = rx(String.raw`(?:go(?: back)? to|open|show(?: me)?|switch to|take me to|bring up|back to|go to the)\s+${VIEWS}`);
const BESIDE = rx(String.raw`(?:put|open|show|dock|bring|keep)\s+${VIEWS}\s+(?:beside|next to|alongside|on the side)(?:\s+(?:it|this|me|the view|the chat))?`);
const SPLIT_WITH = rx(String.raw`(?:split(?: the)? (?:view|screen)|split view)(?: with)?\s+${VIEWS}`);
const PAIR = rx(String.raw`(?:show|open|put)\s+${VIEWS}\s+and\s+${VIEWS}\s+side by side`);
const CLOSE_BESIDE = rx(String.raw`(?:close|hide|exit|end|leave)(?: the)? (?:split view|split screen|split|view beside|panel beside|side view|side panel)|(?:full screen|one view only|single view)`);
const HOME = rx(String.raw`go home|go back home|home|(?:go )?back to (?:the )?universal map|(?:open|show(?: me)?|go to)(?: the)? universal map|go back to all my (?:thinking|conversations)`);
const NEW = rx(String.raw`(?:start|begin|open|make|create)(?: a)? new (?:line of thinking|conversation|chat|thread|session)|new (?:line of thinking|conversation|chat)`);
const CONCISE = rx(
  String.raw`less detail|(?:be )?(?:more )?(?:brief|concise)|(?:give me |i want |use )?(?:shorter|short|concise|brief|briefer) (?:answers|replies|responses)|set (?:the )?length to (?:concise|short|brief)|(?:make|keep) (?:your |the )?(?:answers|replies|responses) (?:shorter|short|concise|brief)`
);
const DETAILED = rx(
  String.raw`(?:in )?more detail|go into more detail|(?:give me |i want |use )?(?:longer|long|detailed|more detailed|fuller) (?:answers|replies|responses)|set (?:the )?length to (?:detailed|long|longer)|(?:make|keep) (?:your |the )?(?:answers|replies|responses) (?:longer|detailed|more detailed)`
);
const STANDARD = rx(String.raw`(?:give me |use )?(?:normal|standard|balanced|regular) (?:answers|replies|responses|length)|set (?:the )?length to (?:normal|standard|balanced)`);
const UNDO = rx(String.raw`undo|undo that|undo it|undo the last (?:edit|change|thing|step|one)|undo my last (?:edit|change)|take that back|revert that|go back a step`);
const REDO = rx(String.raw`redo|redo that|redo it|put it back|bring it back`);
const WRITING = rx(String.raw`start writing|open my (?:writing|document|doc|draft)|show(?: me)? my (?:writing|document|doc|draft)|open (?:the )?writing|go to my (?:writing|document)|new document`);
const SYNTH = rx(String.raw`synthesi[sz]e(?: (?:this|it|my thinking|the map|my map|the conversation))?|where does my thinking stand|summari[sz]e my thinking`);
const RETRY = rx(String.raw`try again|retry|regenerate|ask (?:that|it) again|redo (?:the|your) (?:answer|reply)`);
const TEMPLATE = rx(String.raw`save (?:this|it|that)(?: artifact)? as (?:a |my )?template|keep (?:this|it) as (?:a )?template|make (?:this|it) (?:a|my) template`);
const OPEN_NAMED = rx(String.raw`(?:open|show(?: me)?|go to|bring up|switch to)\s+(?:the |my )?(.+?)(?:\s+artifact)?`);
const THINKING = String.raw`(?:conversation|line of thinking|chat|thread|thinking)`;
const OPEN_THINKING_ABOUT = rx(String.raw`(?:open|show(?: me)?|go to|switch to|bring up|take me to|go back to)\s+(?:the |my )?${THINKING}\s+(?:about|on|called|named|titled)\s+(.+)`);
const OPEN_THINKING_NAMED = rx(String.raw`(?:open|show(?: me)?|go to|switch to|bring up|take me to|go back to)\s+(?:the |my )?(.+?)\s+${THINKING}`);
const MEMORY = rx(String.raw`(?:open|show(?: me)?|go to|take me to)\s+(?:my |the )?memory(?: page)?|(?:open|show)\s+what (?:you|socria) remembers? about me`);
const BACK = rx(String.raw`go back|back|go back to (?:my |the )?(?:line of thinking|conversation|thinking)|close (?:the )?memory`);
// "search", said as such: "find the derivative" is a question for Socria, not a search of their work
const SEARCH = rx(String.raw`(?:search for|search|search my (?:work|thinking|notes|conversations|documents|files) for|search everything for)\s+(.+)`);
const OPEN_SEARCH = rx(String.raw`(?:open|show)\s+(?:the )?search|search`);
const REMAP = rx(String.raw`map (?:this|the|my) conversation|(?:redraw|refresh|update|draw) (?:the |my )?(?:logic )?map`);
const MAP_IMAGE = rx(String.raw`save (?:the |my )?(?:logic )?map as (?:an )?(?:image|picture|png)|export (?:the |my )?(?:logic )?map(?: as (?:an )?(?:image|picture|png))?`);
const CAPTURES = rx(String.raw`(?:open|show(?: me)?)\s+(?:my |the )?(?:quick capture|captures|capture inbox|inbox)`);
const DESELECT = rx(String.raw`(?:clear|drop|forget)(?: the| my)? selection|deselect(?: (?:it|that|everything))?|select nothing|unselect(?: it| that)?`);
const HIDE_BARS = rx(String.raw`hide (?:the )?(?:bars|toolbars|menus|chrome)|(?:go )?full ?screen`);
const SHOW_BARS = rx(String.raw`show (?:the )?(?:bars|toolbars|menus|chrome)|exit full ?screen|leave full ?screen`);

const ART_STOP = new Set(['the', 'a', 'an', 'my', 'of', 'for', 'and', 'artifact']);
const words = (s: string) =>
  plain(s)
    .split(' ')
    .filter((w) => w && !ART_STOP.has(w));

/** The artifact a name means: its title exactly, or every word of the name in one title, or a kind there is one of. */
function artifactNamed(name: string, list: CommandContext['artifacts']): CommandContext['artifacts'][number] | null {
  const want = words(name);
  if (!want.length) return null;
  const key = want.join(' ');
  const exact = list.filter((a) => words(a.title).join(' ') === key);
  if (exact.length === 1) return exact[0];
  const holds = list.filter((a) => {
    const have = new Set(words(a.title));
    return want.every((w) => have.has(w));
  });
  if (holds.length === 1) return holds[0];
  // "the chart", "the CAD", "the plan": a kind there is exactly one of
  const kinds = list.filter((a) => words(a.kind).join(' ') === key);
  return kinds.length === 1 ? kinds[0] : null;
}

/** The line of thinking a name means: its title exactly, else every word of the name in exactly one title. */
function thinkingNamed(name: string, list: CommandContext['conversations']): { id: string; title: string } | null {
  const want = words(name);
  if (!want.length || !list?.length) return null;
  const key = want.join(' ');
  const exact = list.filter((c) => words(c.title).join(' ') === key);
  if (exact.length === 1) return exact[0];
  const holds = list.filter((c) => {
    const have = new Set(words(c.title));
    return want.every((w) => have.has(w));
  });
  return holds.length === 1 ? holds[0] : null;
}

/** The workspace command a whole turn is, or null when it is for Socria. */
export function readWorkspaceCommand(text: string, ctx: CommandContext): WorkspaceCommand | null {
  const t = plain(text);
  if (!t || t.length > 120) return null;
  let m: RegExpExecArray | null;
  if (ctx.over && BACK.test(t)) return { kind: 'back' };
  if (MEMORY.test(t)) return { kind: 'memory' };
  if ((m = OPEN_THINKING_ABOUT.exec(t)) || (m = OPEN_THINKING_NAMED.exec(t))) {
    const c = thinkingNamed(m[1], ctx.conversations);
    if (c) return { kind: 'thinking', id: c.id, title: c.title };
  }
  if (REMAP.test(t)) return { kind: 'remap' };
  if (MAP_IMAGE.test(t)) return { kind: 'map-image' };
  if (HIDE_BARS.test(t)) return { kind: 'bars', hide: true };
  if (SHOW_BARS.test(t)) return { kind: 'bars', hide: false };
  if (OPEN_SEARCH.test(t)) return { kind: 'search', query: '' };
  if (CAPTURES.test(t)) return { kind: 'captures' };
  if (DESELECT.test(t)) return { kind: 'deselect' };
  if ((m = PAIR.exec(t))) return { kind: 'pair', view: viewOf(m[1]), beside: viewOf(m[2]) };
  if ((m = BESIDE.exec(t))) return { kind: 'beside', view: viewOf(m[1]) };
  if ((m = SPLIT_WITH.exec(t))) return { kind: 'beside', view: viewOf(m[1]) };
  if (CLOSE_BESIDE.test(t)) return { kind: 'close-beside' };
  if ((m = VIEW.exec(t))) return { kind: 'view', view: viewOf(m[1]) };
  if (HOME.test(t)) return { kind: 'home' };
  if (NEW.test(t)) return { kind: 'new' };
  if (CONCISE.test(t)) return { kind: 'length', length: 'concise' };
  if (DETAILED.test(t)) return { kind: 'length', length: 'detailed' };
  if (STANDARD.test(t)) return { kind: 'length', length: 'standard' };
  if (UNDO.test(t)) return { kind: 'undo' };
  if (REDO.test(t)) return { kind: 'redo' };
  if (WRITING.test(t)) return { kind: 'writing' };
  if (SYNTH.test(t)) return { kind: 'synthesize' };
  if (RETRY.test(t)) return { kind: 'retry' };
  if (TEMPLATE.test(t)) return { kind: 'template' };
  if ((m = OPEN_NAMED.exec(t))) {
    // over the Universal Map, a name is a line of thinking; inside one, what it holds comes first
    const a = ctx.over === 'home' ? null : artifactNamed(m[1], ctx.artifacts);
    if (a) return { kind: 'artifact', key: a.key, title: a.title };
    const c = thinkingNamed(m[1], ctx.conversations);
    if (c) return { kind: 'thinking', id: c.id, title: c.title };
  }
  // "search for …" last: "find the rent node" on the map is not a search of everything
  if ((m = SEARCH.exec(t)) && !/\b(?:node|idea|branch|card|heading|paragraph)\b/.test(m[1])) return { kind: 'search', query: m[1] };
  return null;
}

/** What a command says it did, in the conversation. */
export const VIEW_SAID: Record<Viewport, string> = { chat: 'the conversation', content: 'Content', artifacts: 'Artifacts', logic_map: 'the Logic Map' };

/**
 * Why a view cannot go beside, said — or null when it can. Split View offers
 * only what this line of thinking has (lib/logos5/views.ts splitMenu), and so
 * does saying it: there is nothing to put beside in an empty view.
 */
export function besideEmpty(view: Viewport, has: { content: number; ideas: number; artifacts: number }): string | null {
  if (view === 'content' && !has.content) return 'There is nothing in Content yet — the files you bring and the write-ups you ask for are kept there.';
  if (view === 'logic_map' && !has.ideas) return 'The Logic Map has no ideas on it yet, so there is nothing to put beside.';
  if (view === 'artifacts' && !has.artifacts) return 'Nothing has been made yet — ask for a chart, a plan, or any artifact of your own.';
  return null;
}

// ── the words a command was missing ──────────────────────────────────
//
// "Add a branch" — what should it say? — "cost". "Change that heading" — to
// what? — "Methods". A command that lacked only its words asks for them in
// the conversation and keeps itself (`fill`, with {} where the words go); the
// next short turn is those words, unless it is plainly something else: a
// question for Socria, another command, a way of letting it go.

export interface Slot {
  /** the command, with {} where the missing words go */
  fill: string;
  at: number;
}

/** How long a command waits for its words. */
export const SLOT_MS = 2 * 60_000;
const MAX_FILL_WORDS = 8;
const LET_GO = /^(?:cancel|never ?mind|forget it|no|nothing|leave it|skip it|doesnt matter|it doesnt matter)$/;
const NOT_WORDS = /^(?:explain|tell me|show me|what|why|how|who|when|where|which|can you|could you|would you|should|please|lets|i want|id like|actually|help|open|go to|start|stop|undo|redo)\b/;

/** What a turn does with a command waiting for its words: completes it, lets it go, or (null) is a turn of its own. */
export function fillSlot(slot: Slot | null | undefined, text: string, now: number): { command: string } | { dropped: true } | null {
  if (!slot || now - slot.at > SLOT_MS) return null;
  const t = String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.!,;:]+$/, '');
  const p = plain(t);
  if (!p) return null;
  if (LET_GO.test(p)) return { dropped: true };
  const asksQuestion = /\bquestion\b/.test(slot.fill);
  if (p.split(' ').length > MAX_FILL_WORDS) return null;
  if (!asksQuestion && (/\?$/.test(t) || NOT_WORDS.test(p))) return null;
  return { command: slot.fill.replace('{}', t.replace(/^["“']|["”']$/g, '')) };
}

// ── Quick Capture, said ──────────────────────────────────────────────

const CAPTURE = /^(?:(?:please|can you|could you|now|and|ok|okay)\s+)*(?:quick capture|capture|capture this|note for later|keep for later|save for later|remind me later)[:,]?\s+(.+)$/i;

/** "Capture: call the landlord" — a thought kept in Quick Capture for later, as it was said (its own case and punctuation). */
export function readCapture(text: string): string | null {
  const m = CAPTURE.exec(
    String(text ?? '')
      .replace(/\s+/g, ' ')
      .trim()
  );
  const t = m?.[1]?.trim().replace(/^["“']|["”']$/g, '') ?? '';
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : null;
}
