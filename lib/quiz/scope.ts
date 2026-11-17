// lib/quiz/scope.ts — WHAT A QUIZ REQUEST ASKS FOR, READ FROM THE STUDENT'S OWN WORDS.
//
// "Quiz me for my microeconomics exam." "10 questions, one at a time, no explanations until the end." "Exam
// simulation on chapters 3–5, hard." "Test me on the Lecture 7 slides only." Everything that can be read from the
// words is read here, by rule, so an explicit preference is always honoured and nothing has to be set up:
//
//   count        a number of questions ("10 questions", "five"), else a sensible default for the mode
//   mode         exam simulation · marks as you go with explanations at the end · guided practice (default)
//   difficulty   easier · harder · mixed, else adaptive
//   formats      multiple choice only, true/false, short answer, numerical, "with graphs"
//   topics       "on X", "about X", "covering X and Y"; "not X", "except X", "skip X"
//   sources      "from the slides", "from Lecture 7", "from chapter 3", "only from my notes": a request to stay
//                inside named material. When that material is not there, the quiz says so rather than
//                quietly using general knowledge (lib/quiz/context.ts)
//   general      "you can use outside knowledge", "general questions": general knowledge is allowed, and said
//
// PURE.

import type { QuestionType, QuizMode } from './types';

export interface QuizScope {
  count: number | null;
  mode: QuizMode;
  /** whether the mode was asked for, rather than chosen for them */
  modeAsked: boolean;
  difficulty: 'easier' | 'harder' | 'mixed' | null;
  /** formats asked for, or null for the course's own mix */
  formats: QuestionType[] | null;
  graphs: boolean;
  /** topics asked for, and topics to leave out, in the student's words */
  topics: string[];
  exclude: string[];
  /** material named as the only source: "the Lecture 7 slides", "chapter 3", "my notes" */
  sourcesNamed: string[];
  strictSources: boolean;
  /** general knowledge allowed beyond the material */
  allowGeneral: boolean;
  /** "for my microeconomics exam": the assessment it is for, when said */
  forAssessment: string | null;
}

const WORD_NUM: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, 'a couple of': 2, 'a few': 4 };

/**
 * Is this message a request to be quizzed? Only when it ASKS for one: the quiz is the object of a request ("quiz me",
 * "make me a quiz", "can I have a quiz on…", "let's do a quiz", "I want to be quizzed"). A message that only
 * MENTIONS a quiz is a message to answer — "I have a quiz tomorrow, can you help me study?", "help with a quiz
 * question", "I'm going to be tested on this", "I'm stuck on these practice problems" — and making a quiz in its
 * place was taking their question away (the near-misses are held in test/quiz.test.mjs).
 */
export function asksForQuiz(text: string): boolean {
  const t = (text || '').toLowerCase().replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!t || t.length > 600) return false;
  // a question about quizzes, not a request for one ("how do quizzes work", "what's on the quiz")
  if (/^(how|what|why|when|where|who)\b[^?]*\b(quiz|test)\w*\b[^?]*\?$/.test(t) && !/\b(quiz|test) me\b/.test(t)) return false;
  // what a request is made of: someone asking for something, then (adjectives) the quiz itself
  const ASK = "(?:give|make|create|generate|build|write|set|send|run|start|begin|do|take|have|get|want|need)";
  const POLITE = `(?:(?:can|could|would|will) (?:you|i|we) (?:please )?|please |i(?:'d| would) like (?:to )?|i want (?:to )?|i need (?:to )?|let'?s |lets |time (?:for|to)|how about )`;
  const DET = '(?:a |an |another |one more |some |a few |a quick |a short |\\d+ |(?:\\d+|[a-z]+)[- ]questions? )';
  const ADJ = '(?:(?:quick|short|pop|little|practice|mock|timed|hard|harder|easy|easier|new|full|proper|final|\\d+|questions?|[a-z]+[- ]questions?)[ -])*';
  const THING = '(?:quiz|quizzes|test|practice (?:test|exam|questions?|problems?|quiz)|mock (?:exam|test)|exam simulation|questions to practi[sc]e)';
  // "quiz me", "test me on…", "drill us", "quizz me"
  if (/\b(quiz|quizz|test|drill|examine) (me|myself|us)\b/.test(t)) return true;
  // software tests are not quizzes: "write a test for this function", "add unit tests", a pasted block of code
  if (/```|\b(?:unit|integration|e2e|end-to-end|regression|load|smoke|snapshot|automated) tests?\b|\btests? (?:for|of|to cover) (?:this|my|the|a|an) (?:function|code|class|method|component|module|api|endpoint|script|app|program|feature|page|hook|route|query)\b|\btest (?:case|suite|file|coverage)s?\b/.test(t)) return false;
  // "give me a quiz", "make us 10 practice questions", "can you make me a quick quiz", "start a mock exam"
  if (new RegExp(`\\b${ASK} (?:me |us )?${DET}?${ADJ}${THING}\\b`).test(t) && !/\b(?:have|had|got|get) (?:a |an |my |the )?(?:quiz|test|exam)\b.*\b(?:tomorrow|today|tonight|on (?:mon|tues|wednes|thurs|fri|satur|sun)day|next week|this week|later)\b/.test(t)) {
    // "i have a quiz…", "i need a test…" said about their week, not asked of Socria
    if (/^(?:i|we) (?:have|had|got|need) (?:a |an |my |the |another )/.test(t) && !/\b(?:quiz me|test me|give me|make me|for me|(?:make|write|create|give me|set) (?:one|it|that|me one)|can you (?:make|write|create|give)\b)/.test(t)) return false;
    return true;
  }
  // "can I have a quiz on cells", "I'd like a quiz", "let's do a quiz", "how about a quiz", "time for a quiz"
  if (new RegExp(`${POLITE}(?:${ASK} )?(?:me |us )?${DET}${ADJ}(?:quiz|quizzes|practice quiz|mock exam|practice test)\\b(?! (?:question|answer|result|grade|score|mark)s?\\b)`).test(t)) return true;
  // "another quiz please", "one more quiz", "pop quiz!", "quiz time" — said as the whole message
  if (/^(?:another|one more|a|a quick|a new) quiz\b[^?]{0,40}$/.test(t) || /^(?:pop quiz|quiz time)[!. ]*$/.test(t)) return true;
  // "a ten-question test please", "10 question quiz on cells" — the whole message is the thing asked for
  if (/^(?:a |an )?(?:\d+|[a-z]+)[- ]questions? (?:quiz|test|practice test)\b[^?]{0,60}$/.test(t)) return true;
  // "I want to be quizzed", "can I get tested on this", "I'd like to be tested on chapter 3"
  if (/\b(?:want|like|need|ready|happy) (?:to )?(?:be|get) (?:quizzed|tested)\b|\b(?:can|could) (?:i|we|you) (?:be|get) (?:quizzed|tested)\b/.test(t)) return true;
  // "test my knowledge of…", "check my understanding with a few questions"
  if (/\btest (?:my|our) (?:knowledge|understanding|memory|recall)\b/.test(t)) return true;
  // "ask me some questions about…", "ask me 5 questions on…"
  if (/\bask me (?:some |a few |a couple of |\d+ |[a-z]+ )?(?:more )?(?:questions|qs)\b/.test(t)) return true;
  // "exam simulation", "simulate my midterm"
  if (/\bexam simulation\b|\bsimulate (?:the|my|an) (?:exam|test|midterm|final)\b/.test(t)) return true;
  // "quiz on cost curves", "test on chapter 3" — as the start of the message
  if (/^(?:quiz|test) (?:on|about|over)\b/.test(t)) return true;
  return false;
}

const ASKING_WORDS = new Set(
  ('quiz quizz quizzes quizzed test tests tested testing me us myself please can could would you i i\'d id like want need lets let\'s do give make create generate build set write ' +
    'a an the some another one more new quick short pop little practice mock timed hard harder easy easier mixed question questions problems qs ' +
    'my our knowledge understanding memory recall on about of over around covering for with to and in it this that be get getting ask check ' +
    'again now time start begin round session up yourself here what we covered talked so far conversation chat everything all ' +
    'has have been discussed gone went learned learnt today exam exams midterm midterms final finals assessment upcoming tomorrow next week class course').split(/\s+/)
);

/** Does the request name a subject at all ("quiz me on enzymes", "quiz me for biology"), beyond the asking itself? */
export function namesSubject(text: string): boolean {
  const words = (text || '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').split(/\s+/).filter(Boolean);
  return words.some((w) => w.length >= 3 && !/^\d+$/.test(w) && !ASKING_WORDS.has(w));
}

/** Read what a quiz request asks for. */
export function readScope(text: string): QuizScope {
  const t = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const scope: QuizScope = {
    count: null,
    mode: 'practice',
    modeAsked: false,
    difficulty: null,
    formats: null,
    graphs: false,
    topics: [],
    exclude: [],
    sourcesNamed: [],
    strictSources: false,
    allowGeneral: false,
    forAssessment: null,
  };

  // ── how many ──
  const n = t.match(/\b(\d{1,2})\s*(?:-|to)?\s*(?:\d{1,2}\s*)?(?:multiple[- ]choice |mcq |short[- ]answer |true[- ]or[- ]false |numerical |practice |hard |easy |quick |more )?(?:questions?|qs|problems?|items?)\b/);
  if (n) scope.count = Number(n[1]);
  else {
    const w = t.match(/\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|a couple of|a few)\s+(?:quick |short |hard |easy |more |practice )?(?:questions?|problems?)\b/);
    if (w) scope.count = WORD_NUM[w[1]] ?? null;
  }
  if (scope.count !== null) scope.count = Math.max(1, Math.min(25, scope.count));

  // ── the mode ──
  if (/\bexam (simulation|mode|conditions)\b|\bsimulate\b|\bmock (exam|test|midterm|final)\b|\blike (the|a|my) real (exam|test)\b|\btimed\b/.test(t)) {
    scope.mode = 'exam';
    scope.modeAsked = true;
  } else if (/\b(no|without|hold|save|keep) (the )?(explanations?|feedback|answers?|corrections?)( back)? (until|till|to|for) the end\b|\bexplanations? (at|until|till) the end\b|\bdon'?t (tell|show) me (the )?(answers?|explanations?)\b/.test(t)) {
    scope.mode = /\b(no|without) (marks|scores?|feedback|telling me)\b|\bdon'?t tell me (if|whether)\b/.test(t) ? 'exam' : 'marks';
    scope.modeAsked = true;
  } else if (/\b(guided|walk me through|explain as (we|you) go|with (hints|explanations|feedback))\b/.test(t)) {
    scope.mode = 'practice';
    scope.modeAsked = true;
  }

  // ── how hard ──
  if (/\b(harder|hard|difficult|challenging|tough|advanced|stretch)\b/.test(t)) scope.difficulty = 'harder';
  else if (/\b(easier|easy|basic|gentle|simple|warm[- ]?up|beginner)\b/.test(t)) scope.difficulty = 'easier';
  else if (/\bmixed (difficulty|levels?)\b|\bmix of (easy|hard)\b/.test(t)) scope.difficulty = 'mixed';

  // ── formats ──
  const formats: QuestionType[] = [];
  if (/\bmultiple[- ]choice\b|\bmcqs?\b/.test(t)) formats.push('single');
  if (/\b(select|choose) all\b|\bmultiple[- ]answers?\b|\bmulti[- ]select\b/.test(t)) formats.push('multi');
  if (/\btrue[- ](or|\/)[- ]?false\b|\bt\/f\b/.test(t)) formats.push('truefalse');
  if (/\bshort[- ]answers?\b|\bopen[- ](ended|response)\b|\bwritten answers?\b|\bfree[- ]response\b/.test(t)) formats.push('short');
  if (/\b(numerical|numeric|calculations?|compute|problems? with numbers|maths? problems?|math problems?)\b/.test(t)) formats.push('numeric');
  if (/\b(derivatives?|integrals?|expressions?|simplify|differentiate|integrate)\b/.test(t) && /\b(type|write|give) (the|an) (expression|answer)\b/.test(t)) formats.push('expression');
  if (formats.length) scope.formats = [...new Set(formats)];
  scope.graphs = /\b(graphs?|diagrams?|curves?|plots?|charts?)\b/.test(t);

  // ── material named as the source ──
  const src = [...t.matchAll(/\b(?:from|using|based on|only (?:from|on)|out of|in)\s+(?:the |my )?((?:lecture|lec|week|chapter|ch|unit|module|section|slides?|deck|reading|notes?|handout|study guide|textbook|book|homework|hw|problem set|pset|past (?:exam|quiz|paper)s?)\b[^,.;!?]{0,40})/g)].map((m) => m[1].trim());
  for (const s of src) {
    const cleaned = s.replace(/\s+(only|please|and|so|then|for|with)\b.*$/, '').trim();
    if (cleaned && !scope.sourcesNamed.includes(cleaned)) scope.sourcesNamed.push(cleaned);
  }
  scope.strictSources = scope.sourcesNamed.length > 0 && (/\bonly\b/.test(t) || /\b(lecture|lec|chapter|ch|week|unit|module|section) ?\d/.test(scope.sourcesNamed.join(' ')) || /\bslides?\b|\bnotes?\b/.test(scope.sourcesNamed.join(' ')));
  scope.allowGeneral = /\b(outside|general|external|any) (knowledge|sources|questions)\b|\bbeyond (the|my) (slides|notes|materials?)\b|\bdoesn'?t have to be from\b/.test(t);

  // ── topics, and what to leave out ──
  const ex = [...t.matchAll(/\b(?:not|except|excluding|skip|leave out|no questions (?:on|about))\s+(?:on |about |the )?([a-z][a-z0-9 '&-]{2,40}?)(?=[,.;!?]|$| and | but | or )/g)].map((m) => m[1].trim());
  scope.exclude = [...new Set(ex)].filter((x) => !/^(sure|too|very|yet|now|explanations?|feedback|answers?)$/.test(x)).slice(0, 4);
  const on = t.match(/\b(?:on|about|covering|over|around|of|focus(?:ing|ed)? on)\s+(?!me\b|my exam\b|the exam\b|an? (?:exam|test|quiz)\b)([a-z][a-z0-9 ,'&/-]{2,90}?)(?=[.;!?]|$| for | from | using | in exam| with | but | except | not | without | one at a time)/);
  if (on) {
    scope.topics = on[1]
      .split(/,| and | & /)
      .map((x) => x.trim().replace(/^(the|my) /, ''))
      .filter((x) => x.length >= 3 && !/^(\d+ )?(questions?|problems?|a time)$/.test(x) && !scope.sourcesNamed.some((s) => s.includes(x)))
      // "this", "what we covered", "this conversation": the conversation itself, not a topic by name — the
      // conversation's own subject goes with the request instead (the route's topic hint)
      .filter((x) => !/^(this|that|it|these|those|this one|all (of )?(this|that|it)|everything|the above|the (conversation|chat|lesson|last (reply|answer|part))|(this|our) (conversation|chat|topic|lesson|session)|what (we|you|i|this conversation|this chat)( have|'ve)? (talked about|covered|discussed|been (talking )?about|gone over|learned|learnt)( so far| today| here)?|what (this conversation|this chat|we) (has |have )?covered( so far)?)$/.test(x))
      .slice(0, 5);
  }

  // ── what it is for ──
  const f = t.match(/\bfor (?:my|the|our|an?|this|next|tomorrow'?s|friday'?s|monday'?s) ([a-z0-9][a-z0-9 '-]{1,40}?(?:exam|test|midterm|final|quiz|mock|paper|assessment))\b/);
  if (f) scope.forAssessment = f[1].trim();

  return scope;
}

/** The number of questions when none was asked for: enough to learn from, never a wall. */
export function defaultCount(scope: Pick<QuizScope, 'mode' | 'count'>): number {
  if (scope.count) return scope.count;
  return scope.mode === 'exam' ? 10 : 8;
}
