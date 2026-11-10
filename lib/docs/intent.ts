// lib/docs/intent.ts — WHAT A QUESTION ABOUT A DOCUMENT ASKS FOR, AND HOW MUCH.
//
// "Where does it give the deadline?" and "how strong is the evidence for the
// main claim?" are both questions about the same document, and they want
// different things: one passage and a sentence, or the claims, the evidence
// under them and what they take for granted. Read here, in code, from the
// person's words — no model call — and used three ways:
//
//   1. WHAT THE MODEL IS SHOWN (lib/docs/render.ts). A lookup gets the
//      passages that match, and little else; an overview gets every section's
//      opening; a comparison shares the budget evenly between the documents;
//      a critique leans towards the method, results, limitations and
//      discussion; a question about the numbers leans towards the tables.
//   2. HOW THE ANSWER IS SHAPED. One line for the model, in this turn's
//      context: a lookup is answered in a sentence or two with its key; an
//      overview leads with the main point and stops at the essentials; a
//      critique keeps the claim, the evidence, the assumptions and the stated
//      limits apart. Compress the information, never the meaning.
//   3. HOW MUCH IS SPENT (Cognitive Allocation). A lookup needs no deep model
//      and little room; a critique or a comparison gets both
//      (lib/model-router.ts levelOf, and the reply's ceiling in the chat route).
//
// A follow-up ("why?", "and the second one?") is about what was just
// discussed: the passages the last reply cited are carried into what is
// shown (renderDocs `recent`), so the person never has to say again which
// part they mean.
//
// PURE.

export const DOC_ASKS = ['locate', 'explain', 'summary', 'compare', 'critique', 'data', 'apply', 'general'] as const;
export type DocAsk = (typeof DOC_ASKS)[number];

export interface DocShape {
  kind: DocAsk;
  /** why it was read so — for the route's log line */
  why: string;
  /** how many of the question's best passages to take, per document */
  passages: number;
  /** the share of the turn's document budget this kind of question uses */
  budget: number;
  /** show the opening passage of every section (an overview's skeleton) */
  spread: boolean;
  /** share the budget evenly between documents, whatever the question matches */
  balanced: boolean;
  /** passages of these kinds count for more */
  favour: readonly string[];
  /** passages of these kinds are shown whether or not the question's words match them (the tables, for a question about the numbers) */
  always: readonly string[];
  /** sections whose heading matches count for more */
  sections: RegExp | null;
  /** tokens of reply room this kind of answer is given, on top of the turn's own */
  room: number;
  /** whether the answer can do without the deep model */
  light: boolean;
  /** the one line the model reads about how to answer — empty for an ordinary question */
  say: string;
}

const CRITIQUE_SECTIONS = /\b(method|methods|methodology|approach|data|sample|participants|results?|findings|evidence|analysis|discussion|limitations?|threats?|caveats?|assumptions?|risks?|conclusions?)\b/i;

const SHAPES: Record<DocAsk, Omit<DocShape, 'kind' | 'why'>> = {
  locate: {
    passages: 10,
    budget: 0.45,
    spread: false,
    balanced: false,
    favour: [],
    always: [],
    sections: null,
    room: 120,
    light: true,
    say: 'They want one thing found in the document. Answer in one or two sentences: what it says, with its key. Quote the exact words when the wording matters. No overview, no preamble. If it is not in the passages shown, say so and say where you looked.',
  },
  explain: {
    passages: 36,
    budget: 0.75,
    spread: false,
    balanced: false,
    favour: ['heading', 'equation', 'quote'],
    always: [],
    sections: null,
    room: 260,
    light: false,
    say: 'They want something in the document made clear. Say what it means in one plain sentence first, then the document’s own words with the key, then one example or consequence only if it helps. Keep the document’s words and your explanation visibly apart.',
  },
  summary: {
    passages: 48,
    budget: 1,
    spread: true,
    balanced: false,
    favour: ['title', 'heading', 'caption'],
    always: [],
    sections: /\b(abstract|summary|overview|introduction|conclusions?|key findings|recommendations?)\b/i,
    room: 340,
    light: false,
    say: 'They want the gist. Lead with the document’s main point in one sentence, cited. Then the three to five things that matter most, one line each, each with its key. Detail (method, secondary points) only if it changes the picture, and after. Compress the information, not the meaning: keep the qualifiers that change what a claim says (conditions, sample sizes, “may”, “in some cases”).',
  },
  compare: {
    passages: 30,
    budget: 1,
    spread: true,
    balanced: true,
    favour: ['heading', 'table'],
    always: [],
    sections: null,
    room: 420,
    light: false,
    say: 'They want a comparison. Lead with the difference or agreement that matters most, cited on both sides. Use a table only when three or more dimensions differ; otherwise a few lines. Where one side is silent on a point, say it is silent — silence is not disagreement. Name any direct contradiction with both keys.',
  },
  critique: {
    passages: 48,
    budget: 1,
    spread: false,
    balanced: false,
    favour: ['heading', 'table'],
    always: [],
    sections: CRITIQUE_SECTIONS,
    room: 420,
    light: false,
    say: 'They want the reasoning examined. Keep apart, and label: what the document claims (cited), the evidence it gives for it (cited), what it assumes without showing (your reading — say so), and the limits it states itself (cited). Name the weakest link first. Raise no problem the passages do not support; where the document answers a concern, say where.',
  },
  data: {
    passages: 30,
    budget: 0.85,
    spread: false,
    balanced: false,
    favour: ['table', 'figure', 'caption'],
    always: ['table', 'figure'],
    sections: null,
    room: 320,
    light: false,
    say: 'They are asking about the document’s numbers, tables or charts. Read values from the table rows exactly and cite the table’s key. Show any calculation in one line with its inputs. A chart that was described rather than read gives no exact values — say so. If the data does not answer the question, say what it does show.',
  },
  apply: {
    passages: 36,
    budget: 0.85,
    spread: false,
    balanced: false,
    favour: ['heading'],
    always: [],
    sections: /\b(recommendations?|implications?|discussion|conclusions?|practice|guidance|next steps)\b/i,
    room: 320,
    light: false,
    say: 'They want to use what the document says. Separate what the document establishes (cited) from how you would apply it (your judgement — say so). Be concrete about their situation, and name the condition under which the finding would not carry over.',
  },
  general: {
    passages: 40,
    budget: 1,
    spread: false,
    balanced: false,
    favour: [],
    always: [],
    sections: null,
    room: 310,
    light: false,
    say: '',
  },
};

const SAYS_DATA_THING = /\b(tables?|charts?|graphs?|figures?|fig\.|plots?|columns?|rows?|spreadsheet|sheet|cells?|axis|axes)\b/i;
const COMPARE = /\b(compare|comparing|comparison|contrast|differ|differs|difference|differences|versus|vs\.?|similar(ity|ities)?|in common|agree|disagree|both (documents|files|papers|reports|of them)|each (document|file|paper|report)|across (the |these |both )?(documents|files|papers|reports|sources))\b/i;
const CONTRADICT = /\b(contradict\w*|inconsisten\w*|conflict\w*)\b/i;
const CRITIQUE = /\b(assum\w*|limitations?|weak(ness|nesses|est)?|flaw\w*|critique|critici[sz]\w*|evaluate|assess|how (strong|convincing|reliable|solid|good) is|evidence (for|behind|that)|supported by|back(s|ed)? (it|this|that) up|justif\w*|bias\w*|gaps?|holes?|valid\w*|reliab\w*|robust\w*|caveats?|counter\w*|fallac\w*|logic(al)?|sound)\b/i;
const SUMMARY = /\b(summar\w*|tl;?dr|overview|gist|main (points?|ideas?|arguments?|findings?|claims?|takeaways?)|key (points?|findings?|takeaways?|ideas?|claims?|arguments?)|what('s| is) (this|it|the (document|paper|report|file|deck)) (about|saying)|outline|structure of|in short|briefly|brief me|big picture|walk me through (it|this|the document))\b/i;
const NUMBERS = /\b(how (much|many)|average|mean|median|total|sum|percent(age)?|%|growth|grew|increase[ds]?|decrease[ds]?|declin\w*|trend\w*|rate|ratio|statistic\w*|figures? for|numbers?|values?|highest|lowest|largest|smallest|peak)\b/i;
const LOCATE = /\b(where (does|do|is|are|did)|which (page|section|slide|sheet|part|chapter|paragraph)|what (page|section|slide)|find|look up|locate|point me|quote|exact (words|wording)|word for word|does (it|the (document|paper|report)) (say|mention|define|state|include)|is there (a|any) (mention|reference|section|clause)|(is|are) .{1,40} mentioned|what (date|deadline|year|amount|price|fee|name|title)|when (was|is|did|does|will)|who (is|was|wrote|are|signed))\b/i;
const APPLY = /\b(apply|applied|in practice|real[- ]world|what (should|would|could) (i|we)|how (can|could|do|should) (i|we) (use|apply)|implications?|so what|what does (this|it) mean for|use (this|it) (for|in|to|at)|for (my|our) (case|situation|team|company|project|class))\b/i;
const MEANING = /\b(what (does|do|did) .{1,60} mean|what is meant|meaning of|define|definition of)\b/i;
const EXPLAIN = /\b(explain|what does .{1,60} mean|meaning of|what is meant|define|definition|clarify|in plain|simpl(er|y|ify)|help me understand|i don'?t (get|understand)|why (does|do|is|are|did)|how (does|do|is|are))\b/i;

/**
 * What a question about the documents asks for. `docs` is how many documents
 * came with the turn — a comparison of two files needs two.
 */
export function docAskOf(text: string, docs: number): DocShape {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  const pick = (kind: DocAsk, why: string): DocShape => ({ kind, why, ...SHAPES[kind] });
  if (!t || docs <= 0) return pick('general', docs <= 0 ? 'no documents' : 'nothing asked');
  if (COMPARE.test(t) && (docs >= 2 || /\b(sections?|chapters?|parts?|slides?|pages?|versions?)\b/i.test(t))) return pick('compare', 'asks for a comparison');
  if (CONTRADICT.test(t)) return pick(docs >= 2 ? 'compare' : 'critique', 'asks about contradictions');
  if (CRITIQUE.test(t)) return pick('critique', 'asks for the reasoning examined');
  if (SAYS_DATA_THING.test(t) && !SUMMARY.test(t.replace(SAYS_DATA_THING, ''))) return pick('data', 'names a table, chart or figure');
  if (SUMMARY.test(t)) return pick('summary', 'asks for the gist');
  if (APPLY.test(t)) return pick('apply', 'asks how to use it');
  if (LOCATE.test(t)) return pick('locate', 'asks for one thing in it');
  // "what does X mean" asks for a meaning, not an average
  if (MEANING.test(t)) return pick('explain', 'asks what something means');
  if (NUMBERS.test(t)) return pick('data', 'asks about its numbers');
  if (EXPLAIN.test(t)) return pick('explain', 'asks for something made clear');
  return pick('general', 'an ordinary question');
}

/** The shape of a kind, for callers that already know it. */
export function shapeOf(kind: DocAsk): DocShape {
  return { kind, why: 'given', ...SHAPES[kind] };
}

/** A short follow-up that leans on what was just said: its passages are carried into the next turn. */
export function leansOnLast(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  const words = t.split(/\s+/).length;
  return words <= 14 && /\b(it|this|that|these|those|they|them|there|the (first|second|third|last|other|same) one|why|how so|go on|more|and)\b/i.test(t);
}

/** The line the model reads about how to answer, or '' when the question is an ordinary one. */
export function docAskLine(shape: DocShape): string {
  return shape.say ? `\n\nTHIS QUESTION ABOUT THE DOCUMENTS (${shape.kind}). ${shape.say}` : '';
}
