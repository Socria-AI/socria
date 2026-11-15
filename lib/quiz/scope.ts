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

/** Is this message a request to be quizzed? (In any of the ordinary ways of asking.) */
export function asksForQuiz(text: string): boolean {
  const t = (text || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!t || t.length > 600) return false;
  // a question about quizzes, not a request for one ("how do quizzes work", "what's on the quiz")
  if (/^(how|what|why|when|where|who)\b[^?]*\b(quiz|test)\w*\b[^?]*\?$/.test(t) && !/\b(quiz|test) me\b/.test(t)) return false;
  if (/\b(quiz|test|drill|examine) (me|myself|us)\b/.test(t)) return true;
  if (/\b(give|make|create|generate|build|set|write) (me |us )?(a |an |some |another |\d+ |[a-z]+ )?(short |quick |practice |mock |timed |hard |harder |easy |easier )*(quiz|test|practice (test|exam|questions?)|mock exam|exam simulation|questions to practi[sc]e)\b/.test(t)) return true;
  if (/\b(practi[sc]e|mock) (exam|test|quiz)\b/.test(t) && /\b(start|begin|let'?s|can we|could we|i want|i'd like|give|do)\b/.test(t)) return true;
  if (/\bexam simulation\b|\bsimulate (the|my|an) (exam|test|midterm|final)\b/.test(t)) return true;
  if (/^(quiz|test) (on|about|over|for)\b/.test(t)) return true;
  return false;
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
  const on = t.match(/\b(?:on|about|covering|over|around|focus(?:ing|ed)? on)\s+(?!me\b|my exam\b|the exam\b|an? (?:exam|test|quiz)\b)([a-z][a-z0-9 ,'&/-]{2,90}?)(?=[.;!?]|$| for | from | using | in exam| with | but | except | not | without | one at a time)/);
  if (on) {
    scope.topics = on[1]
      .split(/,| and | & /)
      .map((x) => x.trim().replace(/^(the|my) /, ''))
      .filter((x) => x.length >= 3 && !/^(\d+ )?(questions?|problems?|a time)$/.test(x) && !scope.sourcesNamed.some((s) => s.includes(x)))
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
