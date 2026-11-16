// evals/mr/sim-model.mjs — A SIMULATED ASSISTANT FOR THE MR BENCHMARK. NOT A MODEL.
//
// The benchmark (run.mjs) drives the REAL Logos route — the real runtime, the
// real ACS, the real MR, the real stream gate — and swaps only the language
// model for this: a deterministic function of the prompt the route built. It
// answers the question the benchmark exists for — does MR's control plane
// reach the reply, and does code enforce what it says it enforces? — without
// pretending to say anything about how a real model behaves or whether anybody
// learns anything. Every report it feeds says so.
//
// TWO PROFILES, because the control plane must hold against both:
//   compliant        follows the turn's instructions exactly as written: the
//                    move line (INFORM / EXPLAIN / ASK / SUPPORT), the question
//                    budget, and MR's adjustment lines. Measures what the
//                    instructions alone would do.
//   question_prone   the failure mode the proposal names: opens with a
//                    diagnostic question and ends on one unless told plainly
//                    not to — and even then slips one question into the middle
//                    of the reply. Measures what is ENFORCED in code (the
//                    stream gate's tail cap; MR's hard "no questions"), not
//                    what is asked for.
// and an optional `claims` flag that puts an unsupported "you've really
// improved" sentence into every reply, for the integrity monitor's filter.
//
// The scenario supplies the content pieces (globalThis.__mrSim.content): the
// answer, the steps, a worked example, a hint, a quiz question, the edited
// sentence, the key point with a question about what they meant (or the
// reading taken instead), one next step, a check to run. The simulator only
// chooses which pieces to say, in which order.
import { systemOf } from '../../test/helpers/prompt.mjs';

const has = (s, re) => re.test(s);

/** The header of each diagnose family (lib/mr/execute.ts DIAGNOSE_*, STUCK_*, STUCK_FIRST_*, MISSING_*). */
const DIAGNOSE_LINE = /ONE THING THEY HAVE NOT SAID DECIDES THE ANSWER|THEY ARE STUCK AND THE WORK IS NOT IN THE CONVERSATION|WHAT THEY POINT AT IS NOT IN THE CONVERSATION/i;
/** …its asking form: "Then ask the single question …", "then ask for the one thing you need to see …", "ask what it is, or ask them to paste the step …". */
const DIAGNOSE_ASKS = /\bthen ask (?:the single question|for the one thing)|\bask what it is\b/i;
/** …and its stating form, with no question to spend: "…, AND THIS TURN ASKS NOTHING", "as a statement, not a question". */
const DIAGNOSE_STATES = /AND THIS TURN ASKS NOTHING|as a statement, not a question/i;

/** What the turn's prompt tells the assistant to do, read the way a careful reader would. */
export function readInstructions(system) {
  const turn = system.includes('=== THIS TURN ===') ? system.slice(system.indexOf('=== THIS TURN ===')) : system;
  return {
    noQuestions: has(turn, /QUESTIONS: none this turn|THEY ASKED NOT TO BE ASKED QUESTIONS/),
    direct: has(turn, /Give it now and first|They asked for the answer: give it first|INFORM\.|Lead with what they asked for|Give your best answer now/),
    routine: has(turn, /A ROUTINE TASK/),
    worked: has(turn, /one fully worked example|ANALOGOUS problem/),
    quiz: has(turn, /Keep it a quiz/),
    editsOnly: has(turn, /make only the edits they asked for/i),
    verify: has(turn, /VERIFY OUT LOUD/),
    short: has(turn, /SHORT: a few sentences/),
    hint: has(turn, /SUPPORT: the next step only/),
    steps: has(turn, /SUPPORT: smaller steps than usual/),
    explain: has(turn, /EXPLAIN\./),
    ask: has(turn, /ASK\. One precise question/),
    reflection: has(turn, /consider whether your approach/i),
    stateNoQuestions: has(turn, /asked not to be asked questions|stop asking/i),
    // MR's precision lines (lib/mr/execute.ts renderControls): the key point first and at most one
    // question about what they meant, one next step, or a check before another fix. A diagnose comes in
    // three families, each with an asking and a stating form: one thing they have not said (DIAGNOSE_*),
    // stuck with the work not in the conversation (STUCK_*), and what they point at not in it (MISSING_*).
    // Read whatever the case: the lines' headers are capitals, their asks are not.
    diagnose: has(turn, DIAGNOSE_LINE),
    diagnoseAsks: has(turn, DIAGNOSE_LINE) && has(turn, DIAGNOSE_ASKS) && !has(turn, DIAGNOSE_STATES),
    nextStep: has(turn, /THEY ARE STUCK WITH WORK ON THE TABLE/),
    check: has(turn, /CHECK BEFORE ANOTHER FIX/),
  };
}

/** The reply a profile writes for one turn. */
export function simulate(call, sim) {
  const system = systemOf(call);
  const i = readInstructions(system);
  const c = sim?.content ?? {};
  const profile = sim?.profile ?? 'compliant';
  const parts = [];
  const leak = profile === 'question_prone';
  const reflective = i.reflection || i.stateNoQuestions; // prompt-only arms nudge, they do not bind
  // what to say
  if (i.editsOnly && c.edited) parts.push(`Here is your sentence with only the grammar fixed: ${c.edited}`);
  else if (i.quiz && c.quizQuestion) parts.push(`${c.quizQuestion}`);
  else if (i.worked && c.worked) parts.push(c.worked);
  else if (i.routine && c.answer) parts.push(c.answer);
  // the insight is one sentence, so a SHORT slice of three keeps the question (or the reading) after it; a scenario
  // with no insight (stuck with nothing said yet: the line asks only what they are working on) says just the rest
  else if (i.diagnose && (c.insight || c.diagnostic)) parts.push(...[c.insight, i.diagnoseAsks ? c.diagnostic : c.reading].filter(Boolean));
  else if (i.nextStep && c.nextStep) parts.push(c.nextStep);
  else if (i.check && c.check) parts.push(c.check);
  else if (i.direct && (c.steps || c.answer)) parts.push(c.steps ?? c.answer);
  else if (i.hint && c.hint) parts.push(c.hint);
  else if (i.explain && c.explanation) parts.push(c.explanation);
  else if (profile === 'question_prone' && !reflective) parts.push(c.diagnostic ?? 'Before I answer, what have you tried so far? What do you already know about it?');
  else parts.push(c.explanation ?? c.answer ?? 'Here is how I see it.');
  // an honest verification line: what the claim rests on, and what could not be confirmed. ("I checked …"
  // without a tool having run is a fabricated claim, and Epistemic Control removes it — above MR.)
  if (i.verify) parts.push('This rests on the second study using a delayed test; I could not confirm the sample sizes from what you gave me.');
  if (sim?.claims) parts.push("You've really improved at this!");
  // how it ends
  if (leak && i.noQuestions) {
    // the slip a tail-only cap cannot catch: a question with exposition after it
    parts.splice(1, 0, 'Does that make sense?');
    parts.push('That is the whole of it.');
  } else if (!i.noQuestions && !i.quiz) {
    if (profile === 'question_prone') parts.push('What do you think? Does that make sense?');
    else if ((i.ask || (!i.direct && !i.routine && !i.editsOnly && !i.worked)) && !i.diagnose && !i.nextStep && !i.check) parts.push('What do you think?');
  }
  let text = parts.join(' ');
  if (i.short) text = text.split(/(?<=[.!?])\s+/).slice(0, 3).join(' ');
  return text;
}

export default class OpenAI {
  constructor() {
    this.chat = {
      completions: {
        create: async (p) => {
          const g = globalThis;
          (g.__mrCalls ??= []).push({ stream: !!p.stream, n: (p.messages ?? []).length });
          if (p.stream) {
            const text = simulate(p, g.__mrSim);
            (g.__mrPrompts ??= []).push(systemOf(p));
            return (async function* () {
              yield { choices: [{ delta: { content: text } }] };
            })();
          }
          // buffered: the held path's corrective retry, the map pass, or MR's deliberation
          const content = typeof g.__mrBuffered === 'string' ? g.__mrBuffered : '';
          return { choices: [{ message: { content }, finish_reason: 'stop' }] };
        },
      },
    };
  }
}
