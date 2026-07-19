// lib/conversation-controller.ts
//
// A lightweight, per-turn conversation controller for Socria Core 3.1.
//
// The static system prompt tells the model HOW to behave in general. This
// controller adds the missing per-turn signal: given the thread so far, it
// computes compact guidance ("what changed this turn", "you already asked
// two questions — don't ask a third", "don't reuse the phrasing you just
// used") and renders a short directive that is appended to the Core 3.1
// system prompt for THIS request only.
//
// It is deterministic — no extra LLM call, no added latency or cost. The
// shape matches a structured controller so a model-backed pass can be
// swapped in later without changing callers.

import type { ConversationMemory, ConversationState } from './socria-prompt';

export type ControllerMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type ConversationStage =
  | 'observe'
  | 'clarify'
  | 'challenge'
  | 'connect'
  | 'synthesize'
  | 'close';

export type ConversationMove =
  | 'question'
  | 'reflection'
  | 'challenge'
  | 'connection'
  | 'explanation'
  | 'synthesis'
  | 'reassurance';

export type ConversationGuidance = {
  stage: ConversationStage;
  previousMove: ConversationMove | null;
  conversationDelta: string;
  currentUnderstanding: string | null;
  unresolvedTension: string | null;
  userEngagement: 'low' | 'medium' | 'high';
  synthesisReadiness: 'low' | 'medium' | 'high';
  turnNumber: number;
  openingConcern: string | null;
  avoidNext: string[];
};

function clip(s: string, n = 120): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
}

// Generic-coaching tells we watch for in the assistant's recent turns. If the
// model just used one, we tell it not to reuse the pattern.
const BANNED_PATTERNS: { re: RegExp; label: string }[] = [
  { re: /\bit sounds like\b/i, label: '"it sounds like"' },
  { re: /\bit seems like\b/i, label: '"it seems like"' },
  { re: /\bthat sounds\b/i, label: '"that sounds…"' },
  { re: /\bthat suggests\b/i, label: '"that suggests…"' },
  { re: /\bthis could mean\b/i, label: '"this could mean…"' },
  { re: /\bit'?s important to\b/i, label: '"it\'s important to…"' },
  { re: /\bthat'?s understandable\b/i, label: '"that\'s understandable"' },
  { re: /\bthat'?s (perfectly )?okay\b/i, label: '"that\'s okay"' },
  { re: /\bthat makes sense\b/i, label: '"that makes sense"' },
  { re: /\bwhat are the main (factors|considerations|concerns|reasons)\b/i, label: 'broad "what are the main…" intake questions' },
  { re: /\bwhat are you hoping to (find|get|achieve)\b/i, label: '"what are you hoping to find" questions' },
  { re: /\bwhat kind of .{0,20}\bexcite/i, label: '"what kind of … excites you" questions' },
  { re: /\bcan you (tell me more|elaborate)\b/i, label: '"tell me more / elaborate"' },
  { re: /\bhow does that make you feel\b/i, label: '"how does that make you feel"' },
  { re: /\bsignificant decision\b/i, label: 'calling the topic a "significant decision"' },
  { re: /\bi'?m noticing\b/i, label: '"I\'m noticing…"' },
  { re: /\bone possibility is\b/i, label: '"one possibility is…" hedging' },
  { re: /\bit might be that\b/i, label: '"it might be that…" hedging' },
  { re: /\byou may be (experiencing|feeling|facing)\b/i, label: '"you may be experiencing…" hedging' },
  { re: /\bperhaps you\b/i, label: '"perhaps you…" hedging' },
  { re: /\bisn'?t (just|really|only) about\b/i, label: '"this isn\'t just about…" manufactured depth' },
  { re: /\bthe (real|deeper) question (is|here)\b/i, label: '"the real question is…" manufactured depth' },
];

const UNCERTAIN_RE = /^\s*(hmm+|idk|i (don'?t|do not) know|not sure|no idea|maybe|dunno|i guess|unsure)\b/i;

function endsWithQuestion(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // Last non-empty line ends with a question mark.
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean);
  const last = lines[lines.length - 1] || '';
  return last.endsWith('?');
}

function inferMove(assistant: string): ConversationMove {
  const t = assistant.toLowerCase();
  if (t.includes('::synthesis')) return 'synthesis';
  if (/\b(you said|you mentioned|earlier you|you keep returning|across the conversation|you'?ve (repeatedly|consistently))\b/i.test(assistant)) {
    return 'connection';
  }
  if (/\b(that'?s understandable|that'?s okay|you'?re not|it makes sense that|you do not sound|you are not going in circles)\b/i.test(assistant)) {
    return 'reassurance';
  }
  if (endsWithQuestion(assistant)) return 'question';
  return 'reflection';
}

function firstNonEmptyLine(m: ConversationMemory | null | undefined, key: keyof ConversationMemory): string | null {
  if (!m) return null;
  const v = (m as any)[key];
  if (Array.isArray(v) && v.length && typeof v[0] === 'string') return v[0];
  return null;
}

/**
 * Compute per-turn guidance from the thread. `messages` is the full cleaned
 * history (user/assistant only is fine; system messages are ignored). The
 * last message is expected to be the user's newest turn.
 */
// Depth-paced synthesis-readiness: Quick users want a wrap-up early; Abstract
// conversations earn their synthesis later. Mirrors the prompt's cadences.
const READINESS_TURNS: Record<string, number> = {
  quick: 4,
  balanced: 6,
  deep: 7,
  abstract: 8,
};

export function computeGuidance(
  messages: ControllerMessage[],
  memory?: ConversationMemory | null,
  depth?: string
): ConversationGuidance {
  const convo = messages.filter((m) => m.role === 'user' || m.role === 'assistant');
  const userTurns = convo.filter((m) => m.role === 'user');
  const assistantTurns = convo.filter((m) => m.role === 'assistant');
  const userCount = userTurns.length;

  const latestUser = userTurns[userTurns.length - 1]?.content?.trim() ?? '';
  const lastAssistant = assistantTurns[assistantTurns.length - 1]?.content ?? '';
  const prevAssistant = assistantTurns[assistantTurns.length - 2]?.content ?? '';

  const previousMove: ConversationMove | null = lastAssistant
    ? inferMove(lastAssistant)
    : null;

  // Engagement: short, low-content or repeated-"I don't know" replies read low.
  const recentUser = userTurns.slice(-3).map((m) => m.content.trim());
  const avgLen = recentUser.length
    ? recentUser.reduce((a, b) => a + b.length, 0) / recentUser.length
    : 0;
  const uncertainStreak = recentUser.filter((c) => UNCERTAIN_RE.test(c)).length;
  const userEngagement: ConversationGuidance['userEngagement'] =
    avgLen < 24 || uncertainStreak >= 2 ? 'low' : avgLen < 90 ? 'medium' : 'high';

  // Synthesis readiness climbs with turns and accumulated memory signal.
  const memoryDepth =
    (memory?.uncertainties?.length ?? 0) +
    (memory?.values?.length ?? 0) +
    (memory?.goals?.length ?? 0) +
    (memory?.emergingUnderstanding?.length ?? 0);
  const readyAt = READINESS_TURNS[depth ?? 'balanced'] ?? 6;
  const synthesisReadiness: ConversationGuidance['synthesisReadiness'] =
    userCount >= readyAt || memoryDepth >= 4
      ? 'high'
      : userCount >= Math.ceil(readyAt / 2)
        ? 'medium'
        : 'low';

  // Stage: rough, monotonic-ish read of where the conversation is.
  let stage: ConversationStage;
  if (userCount <= 1) stage = 'observe';
  else if (userCount === 2) stage = 'clarify';
  else if (synthesisReadiness === 'high') stage = 'synthesize';
  else if (userCount >= 4) stage = 'connect';
  else stage = 'challenge';

  // --- Anti-loop: build the "do not" list from recent assistant behavior ---
  const avoidNext: string[] = [];

  const lastWasQuestion = lastAssistant && endsWithQuestion(lastAssistant);
  const prevWasQuestion = prevAssistant && endsWithQuestion(prevAssistant);
  if (lastWasQuestion && prevWasQuestion) {
    avoidNext.push(
      'ask another question — your last two replies both ended in one; make an observation, connection, or synthesis instead'
    );
  } else if (lastWasQuestion) {
    avoidNext.push('open with another broad clarifying question');
  }

  // Ban reuse of any generic phrase used in the last two assistant turns.
  const recentAssistantText = `${lastAssistant}\n${prevAssistant}`;
  for (const { re, label } of BANNED_PATTERNS) {
    if (re.test(recentAssistantText)) avoidNext.push(`reuse the ${label} pattern`);
  }

  // Standing guardrails once the topic is established.
  if (userCount >= 2) {
    avoidNext.push('generic reassurance that adds no new understanding');
    avoidNext.push('paraphrasing the latest message back without adding a connection, distinction, or inference');
  }

  // --- conversationDelta: what changed this turn (deterministic-lite) ---
  let conversationDelta: string;
  if (userCount <= 1) {
    conversationDelta =
      'The user has opened the conversation. Establish the actual question before anything else.';
  } else if (UNCERTAIN_RE.test(latestUser)) {
    conversationDelta =
      'The user answered with uncertainty rather than new content. Do not re-ask broadly — offer a distinction or a small read of where things stand that gives them something to react to.';
  } else if (latestUser.length < 40) {
    conversationDelta =
      'The user added a short but pointed statement. Treat it as a shift in the picture, not a new topic — say what it changes about the decision so far, then (optionally) one narrow question.';
  } else {
    conversationDelta =
      'The user added substantive new information. State explicitly what is now clearer or different from a moment ago, and connect it to something they said earlier.';
  }

  const openingConcern =
    userTurns.length >= 3 && userTurns[0]?.content
      ? clip(userTurns[0].content)
      : null;

  return {
    stage,
    previousMove,
    conversationDelta,
    currentUnderstanding:
      firstNonEmptyLine(memory, 'emergingUnderstanding') ??
      firstNonEmptyLine(memory, 'goals'),
    unresolvedTension: firstNonEmptyLine(memory, 'uncertainties'),
    userEngagement,
    synthesisReadiness,
    turnNumber: userCount,
    openingConcern,
    avoidNext,
  };
}

const STAGE_HINT: Record<ConversationStage, string> = {
  observe: 'Establish the real question. One focused move.',
  clarify: 'Resolve only ambiguity that changes the discussion. Do not linger here.',
  challenge: 'Test an assumption or framing rather than gathering more intake.',
  connect: 'Link this turn to something said earlier; make the structure visible.',
  synthesize: 'Enough has accumulated — reflect the shape of their thinking back, not another question.',
  close: 'Help them articulate where they have arrived; do not reopen.',
};

/**
 * Render the compact turn directive appended to the Core 3.1 system prompt.
 * Deliberately short so it sits at the END of the prompt (high attention)
 * without bloating token count.
 */
export function renderTurnDirective(
  g: ConversationGuidance,
  opts: { hasSemanticState?: boolean } = {}
): string {
  const lines: string[] = [];
  lines.push('=== THIS TURN (highest priority — overrides general guidance if they conflict) ===');
  lines.push('');
  lines.push('Answer what changed in your understanding, not the message itself.');
  lines.push(`Current move: ${g.stage}. ${STAGE_HINT[g.stage]}`);
  if (g.previousMove) {
    lines.push(
      `Your previous reply was a ${g.previousMove}. Vary the shape this turn — do not reuse the same reflection→question rhythm.`
    );
  }
  // When the semantic state pass ran, it supplies a far better "what changed"
  // and living understanding — skip the deterministic-lite versions here to
  // avoid a weaker, conflicting read.
  if (!opts.hasSemanticState) {
    lines.push(`What changed this turn: ${g.conversationDelta}`);
  }
  if (g.openingConcern) {
    lines.push(
      `Thread arc: this is turn ${g.turnNumber}. It opened with — "${g.openingConcern}". Hold that against where the conversation is now. If the focus has quietly drifted from the opening, naming that drift ("we started on X; most of this has actually become about Y") is often the most valuable thing you can say — prefer it over another question.`
    );
  }
  if (!opts.hasSemanticState && g.currentUnderstanding) {
    lines.push(`Working understanding so far: ${g.currentUnderstanding}`);
  }
  if (!opts.hasSemanticState && g.unresolvedTension) {
    lines.push(`Unresolved tension to advance: ${g.unresolvedTension}`);
  }
  if (g.avoidNext.length) {
    lines.push('Do NOT:');
    for (const a of g.avoidNext) lines.push(`- ${a}`);
  }
  lines.push('');
  lines.push(
    'Update the conversation’s understanding using the new information. Ask at most one narrow question, and only if it genuinely advances the unresolved tension. It is good for this reply to contain no question.'
  );
  if (g.synthesisReadiness === 'high') {
    lines.push(
      'Match length to value: if this turn is a full synthesis, use the ::synthesis structured format — tight bullets, no filler. Otherwise keep it to two to four sentences.'
    );
  } else {
    lines.push(
      'Keep it short: two to four sentences, often fewer. Cut anything that repeats, paraphrases, or explains the obvious. (Structured blocks — ::synthesis, ::choices, a comparison — are exempt; trim per bullet, not the structure.)'
    );
  }
  lines.push(
    'Speak like a mentor: if the thread already supports the observation, state it plainly with no hedging ("I think you\'re focusing on the wrong question"). Reserve hedges for genuinely early or uncertain reads.'
  );
  lines.push(
    'Format like a text conversation: short paragraphs of 1–3 sentences with blank lines between them; let a key observation or the question stand on its own line. No dense blocks.'
  );
  lines.push(
    'Mark the one pivot or loaded word that carries this turn in *single asterisks* (Socria\'s green-serif signature) — one per reply, on a word that genuinely lands, never decorative.'
  );
  if (g.synthesisReadiness === 'high') {
    lines.push('The conversation is ready for synthesis before it starts repeating — prefer reflecting the shape of their thinking over another question.');
  }
  return lines.join('\n');
}

const DELTA_VERB: Record<ConversationState['delta'], string> = {
  confirm: 'confirmed',
  refine: 'refined',
  contradict: 'contradicted',
  replace: 'replaced the question behind',
  none: 'added little to',
};

/**
 * Render the living-understanding directive from the semantic state pass.
 * This is the answer to "what changed because of the last message?" — the
 * reply must be built from it, not from the last message in isolation.
 */
const STAKES_HINT: Record<ConversationState['stakes'], string> = {
  everyday:
    'Stakes: everyday/practical. Be a helpful, grounded friend — direct, conversational, useful. NO hidden-meaning excavation, no psychological framing, no "this isn\'t really about…". A practical suggestion plus at most one practical question is the right shape.',
  meaningful:
    'Stakes: a real decision or concern. Thoughtful help with light reflection where it earns its place.',
  weighty:
    'Stakes: this genuinely matters to them. Engage the full depth their selected mode invites.',
};

export function renderStateDirective(s: ConversationState): string {
  const lines: string[] = [];
  lines.push('=== CONVERSATION STATE (respond FROM this, not from the last message) ===');
  lines.push('');
  lines.push(STAKES_HINT[s.stakes]);
  lines.push(`Living understanding: ${s.understanding}`);
  if (s.whatChanged) {
    lines.push(`The last message ${DELTA_VERB[s.delta]} the understanding — ${s.whatChanged}`);
  }
  if (s.resolved) {
    const r = s.resolved.replace(/[.\s]+$/, '');
    lines.push(
      `Resolved — do NOT keep investigating this: ${r}. The user has answered it; treat it as settled and do not re-explain it.`
    );
  }
  if (s.nextFocus) {
    lines.push(`Next layer to move toward: ${s.nextFocus}`);
  }
  lines.push('');
  lines.push(
    'Build the reply around this change and where the conversation now stands — never around restating the last message. Name what shifted, not the fact the user reported. If the earlier question is resolved, do not re-explain it; move to the difficulty or hesitation that remains.'
  );
  return lines.join('\n');
}
