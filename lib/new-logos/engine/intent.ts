// lib/new-logos/engine/intent.ts — WHAT WAS ASKED FOR, read from plain English without a model.
//
// The Smart Omnibox takes anything: a question, a thought, an instruction. Instructions that are plainly one of the
// workspace's operations ("group these", "turn this into a graph", "connect subscription pricing to projected
// revenue", "undo everything I just did") are read here, deterministically, into steps of the operation engine
// (lib/new-logos/engine/commands.ts), each with the words that name its objects — resolved against what is here
// afterwards (resolve.ts), so this file only reads language. Several instructions in one ("group these and then
// collapse them") become several steps, run as one change. What is not an instruction is a question or a thought for
// the intelligence layer; an instruction this cannot read is passed to it too, never guessed at.
// Pure: no I/O.

export interface Step {
  command: string;
  /** words naming objects (resolved later) and plain values */
  args: Record<string, string | boolean | number | undefined>;
}

export type Reading =
  | { kind: 'steps'; steps: Step[] }
  /** reads as an instruction, but not one of these: for the intelligence layer to resolve into operations */
  | { kind: 'instruction' }
  /** a question, a thought, something to think about: for the representation */
  | { kind: 'question' };

const clean = (s: string) =>
  s
    .trim()
    .replace(/^(?:please|can you|could you|would you|kindly|ok|okay|now|then|and)\s+/i, '')
    .replace(/^(?:please|can you|could you|would you)\s+/i, '')
    .replace(/\s+(?:please|for me|thanks|thank you)$/i, '')
    .replace(/[.!?]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

const REL_WORDS: Record<string, string> = {
  supports: 'supports', support: 'supports', 'is evidence for': 'supports',
  contradicts: 'contradicts', 'goes against': 'contradicts', against: 'contradicts', undermines: 'contradicts',
  explains: 'explains', 'would explain': 'explains',
  causes: 'causes', 'leads to': 'leads_to', 'results in': 'leads_to',
  'depends on': 'depends_on', 'relies on': 'depends_on', needs: 'depends_on',
  'is part of': 'part_of', 'part of': 'part_of',
  answers: 'answers', 'derives from': 'derives', 'is derived from': 'derives', 'comes from': 'derives',
  'refers to': 'references', references: 'references', relates: 'relates', 'relates to': 'relates',
};
const relWord = (w?: string) => (w ? REL_WORDS[w.toLowerCase().trim()] : undefined);

const KIND_OF: Record<string, string> = {
  thought: 'thought', note: 'text', text: 'text', statement: 'text', fact: 'text', point: 'text',
  question: 'question', 'open question': 'unknown', unknown: 'unknown',
  possibility: 'hypothesis', hypothesis: 'hypothesis', explanation: 'hypothesis',
  observation: 'observation', evidence: 'observation',
  caveat: 'caveat', warning: 'caveat', risk: 'caveat',
  table: 'table', comparison: 'table', 'comparison matrix': 'table', matrix: 'table', dataset: 'table',
  plot: 'plot', graph: 'plot', chart: 'plot',
  equation: 'equation', formula: 'equation',
  model: 'model', 'financial model': 'model',
  timeline: 'timeline', 'step list': 'steps', steps: 'steps', sequence: 'steps', process: 'steps',
  diagram: 'diagram', flowchart: 'diagram',
  variable: 'variable', slider: 'variable', input: 'variable',
  metric: 'metric', measure: 'metric',
};
const KIND_RE = Object.keys(KIND_OF)
  .sort((a, b) => b.length - a.length)
  .map((k) => k.replace(/ /g, '\\s'))
  .join('|');

type Rule = { re: RegExp; make: (m: RegExpMatchArray) => Step | Step[] | null };
const RULES: Rule[] = [
  // history
  { re: /^undo (?:everything|all(?: of (?:that|it))?|all (?:the|my) changes|all that) (?:i|we)(?:'ve| have)? (?:just )?(?:did|done|made|changed)$/i, make: () => ({ command: 'undo', args: { burst: true } }) },
  { re: /^(?:undo|take (?:that|it) back|revert)(?: (?:that|it|this|the last (?:change|thing|step)|my last change|what i just did))?$/i, make: () => ({ command: 'undo', args: {} }) },
  { re: /^undo (?:the )?last (\d+|two|three|four|five) (?:changes|steps|things)$/i, make: (m) => ({ command: 'undo', args: { steps: wordNumber(m[1]) } }) },
  { re: /^redo(?: (?:that|it|the last (?:change|step)))?$/i, make: () => ({ command: 'redo', args: {} }) },
  { re: /^(?:show (?:me )?)?(?:the )?(?:history|changes|what (?:has )?changed|what you changed)$/i, make: () => ({ command: 'history', args: {} }) },
  // finding and opening
  {
    re: /^(?:find|open|show(?: me)?|where(?:'s| is)|get(?: me)?|look for) (?:the |my )?(?:documents?|files?|sources?|pdfs?|papers?|uploads?|spreadsheets?|readings?)(?: (?:that )?(?:i|we) (?:uploaded|added|brought in|attached|shared|put in))?(?: (yesterday|today|earlier(?: today)?|last week|this week|recently|this morning))?(?: (?:called|named|about|on|with|titled) (.+))?$/i,
    make: (m) => ({ command: 'find-source', args: { when: m[1]?.toLowerCase(), query: m[2] } }),
  },
  { re: /^(?:open|show) (?:the |my )?(?:library|sources|source library)$/i, make: () => ({ command: 'library', args: {} }) },
  { re: /^(?:create|make|start|open|set up|begin) (?:a |an )?(?:new )?(?:workspace|objective|project|space)(?: (?:for|about|on|called|named|to))? (.+)$/i, make: (m) => ({ command: 'new-workspace', args: { title: m[1] } }) },
  // reverse relationships
  { re: /^(?:show (?:me )?|tell me |find )?where (?:else )?(.+?) (?:is|are) (?:being )?(?:used|referenced|relied on|mentioned)(?: (?:elsewhere|anywhere else|too))?$/i, make: (m) => ({ command: 'backlinks', args: { target: m[1] } }) },
  { re: /^(?:what|which (?:things|components|models)) (?:uses|use|depends on|depend on|relies on|rely on|refers to|refer to|references) (.+)$/i, make: (m) => ({ command: 'backlinks', args: { target: m[1] } }) },
  { re: /^(?:show (?:me )?)?(?:the )?(?:backlinks|references|dependencies|dependents) (?:of|for|to) (.+)$/i, make: (m) => ({ command: 'backlinks', args: { target: m[1] } }) },
  // filtering what is shown
  { re: /^(?:hide|filter out|take away) (?:everything|all|anything|things|what(?:ever)? is)(?: that is| that's| which is)? (?:unrelated|not related|irrelevant|not relevant) to (.+)$/i, make: (m) => ({ command: 'filter', args: { keep: `everything related to ${m[1]}` } }) },
  { re: /^(?:show|focus on|only show|show only|just show|keep) (?:me )?(?:only )?(?:what (?:relates|is related) to|everything (?:related to|about|to do with)|things (?:about|related to)|the (?:things|items) about) (.+)$/i, make: (m) => ({ command: 'filter', args: { keep: `everything related to ${m[1]}` } }) },
  { re: /^(?:show|bring back|unhide|reveal) (?:everything|all|it all|all of it)(?: again)?$|^(?:clear|remove|reset) (?:the )?filters?$/i, make: () => ({ command: 'filter', args: { clear: true } }) },
  { re: /^(?:hide|filter out) (.+)$/i, make: (m) => ({ command: 'filter', args: { hide: m[1] } }) },
  // grouping
  { re: /^(?:enter|go into|open|step into) (?:the )?(.+?) group$/i, make: (m) => ({ command: 'enter', args: { target: `${m[1]} group` } }) },
  { re: /^(?:ungroup|break up|dissolve|disband) (.+)$/i, make: (m) => ({ command: 'ungroup', args: { target: m[1] } }) },
  { re: /^group (.+?)(?: (?:together|into (?:a|one) group))?(?: (?:as|called|named|under|titled) ["“]?(.+?)["”]?)?$/i, make: (m) => ({ command: 'group', args: { targets: m[1], name: m[2] } }) },
  { re: /^(?:put|place|move) (.+?) (?:in|into) (?:a |one )?(?:new )?group(?: (?:called|named) ["“]?(.+?)["”]?)?$/i, make: (m) => ({ command: 'group', args: { targets: m[1], name: m[2] } }) },
  { re: /^(?:collapse|fold|close|minimi[sz]e|shrink|hide the contents of) (.+)$/i, make: (m) => ({ command: 'collapse', args: { target: m[1] } }) },
  { re: /^(?:expand|unfold|open up|maximi[sz]e|show the contents of) (.+)$/i, make: (m) => ({ command: 'expand', args: { target: m[1] } }) },
  { re: /^(?:rename|call|name|title|retitle) (.+?) (?:to |as )?["“](.+?)["”]$/i, make: (m) => ({ command: 'rename', args: { target: m[1], name: m[2] } }) },
  { re: /^rename (.+?) (?:to|as) (.+)$/i, make: (m) => ({ command: 'rename', args: { target: m[1], name: m[2] } }) },
  // connecting
  {
    re: /^(?:disconnect|unlink|separate|cut the (?:link|connection) between) (.+?) (?:from|and) (.+)$/i,
    make: (m) => ({ command: 'disconnect', args: { from: m[1], to: m[2] } }),
  },
  {
    re: /^(?:connect|link|join|relate|tie) (.+?) (?:to|with|and) (.+?)(?:,? (?:as|saying|because)(?: it| the first)? (supports|contradicts|goes against|explains|would explain|causes|leads to|results in|depends on|relies on|is part of|part of|answers|derives from|is derived from|comes from|refers to|relates to))?$/i,
    make: (m) => ({ command: 'connect', args: { from: m[1], to: m[2], kind: relWord(m[3]) } }),
  },
  {
    re: /^(?:say|mark|note) (?:that )?(.+?) (supports|contradicts|goes against|explains|causes|leads to|depends on|relies on|answers|derives from|refers to) (.+)$/i,
    make: (m) => ({ command: 'connect', args: { from: m[1], to: m[3], kind: relWord(m[2]) } }),
  },
  // placing
  { re: /^(?:move|put|place|bring|drag|position) (.+?) (?:next to|beside|near|by|alongside|close to|right of|to the right of) (.+)$/i, make: (m) => ({ command: 'move', args: { targets: m[1], beside: m[2] } }) },
  { re: /^(?:move|put|place|bring) (.+?) (?:under|below|beneath) (.+)$/i, make: (m) => ({ command: 'move', args: { targets: m[1], below: m[2] } }) },
  { re: /^(?:organi[sz]e|tidy(?: up)?|arrange|clean up|sort out|lay out|rearrange|structure)(?: (?:this|the|my))?(?: (?:workspace|canvas|space|page|board|everything|it|this|things))?$/i, make: () => ({ command: 'organise', args: {} }) },
  // setting a value: "set price to 30", "make growth 2%", "change customers to 1,200" (before transforming)
  { re: /^(?:set|change|make|put) (.+?) (?:to |= ?|at )?(-?\d[\d,]*(?:\.\d+)?)\s*(%|£|\$|€|k|m)?$/i, make: (m) => ({ command: 'set', args: { target: m[1], value: Number(m[2].replace(/,/g, '')) * (m[3]?.toLowerCase() === 'k' ? 1e3 : m[3]?.toLowerCase() === 'm' ? 1e6 : 1) } }) },
  // transforming: shown another way (a view), or made into something new (for the intelligence layer)
  {
    re: /^(?:turn|convert|change|transform|make|show|display|view|render|present|draw|rewrite|recast) (.+?) (?:into|as|to|in) (?:an? |the form of (?:an? )?)?(.+?)(?: (?:view|form))?$/i,
    make: (m) => ({ command: 'transform', args: { target: m[1], to: m[2] } }),
  },
  { re: /^(?:graph|plot|chart|tabulate) (.+)$/i, make: (m) => ({ command: 'transform', args: { target: m[1], to: /tabulate/i.test(m[0]) ? 'table' : 'plot' } }) },
  // comparing, versions: analytical, for the intelligence layer with these as what it is about
  { re: /^compare (.+?)(?: (?:and|with|to|against|versus|vs\.?) (.+))?$/i, make: (m) => ({ command: 'compare', args: { a: m[1], b: m[2] } }) },
  {
    re: /^(?:create|make|build|add|try) (?:another|a new|an alternative|a second|a different) (?:version|scenario|copy|case)(?: of (.+?))?(?: (?:assuming|where|with|in which|if|that assumes) (.+))?$/i,
    make: (m) => ({ command: 'version', args: { target: m[1], assuming: m[2] } }),
  },
  // copying, removing
  { re: /^(?:duplicate|copy|clone|make (?:a |an independent )?copy of) (.+)$/i, make: (m) => ({ command: 'duplicate', args: { targets: m[1] } }) },
  { re: /^(?:delete|remove|get rid of|discard|erase|drop) (.+)$/i, make: (m) => ({ command: 'delete', args: { targets: m[1] } }) },
  // selecting, moving the view
  { re: /^select (?:all|everything)$/i, make: () => ({ command: 'select', args: { targets: 'everything' } }) },
  { re: /^select (.+)$/i, make: (m) => ({ command: 'select', args: { targets: m[1] } }) },
  { re: /^(?:focus on|zoom (?:in )?(?:to|on|into)|go to|take me to|jump to|cent(?:re|er) on|show me) (.+)$/i, make: (m) => ({ command: 'focus', args: { target: m[1] } }) },
  { re: /^(?:inspect|show (?:me )?(?:the )?details (?:of|for)|open the details of) (.+)$/i, make: (m) => ({ command: 'inspect', args: { target: m[1] } }) },
  { re: /^open (.+)$/i, make: (m) => ({ command: 'open', args: { target: m[1] } }) },
  // making something here, with or without its words
  {
    re: new RegExp(`^(?:add|create|make|new|insert|put|start|draw|write)(?: (?:me|us))? (?:a |an |another |one more )?(?:new )?(${KIND_RE})(?:s)?(?:(?: (?:about|for|called|named|on|saying|that says|of|with))? *[:,-]? *(.*))?$`, 'i'),
    make: (m) => ({ command: 'create', args: { kind: KIND_OF[m[1].toLowerCase().replace(/\s+/g, ' ')], text: (m[2] ?? '').trim() } }),
  },
];

const NUMBERS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
const wordNumber = (w: string) => NUMBERS[w.toLowerCase()] ?? Math.min(20, Math.max(1, Number(w) || 1));

/** An instruction's first word: when nothing above reads it, the intelligence layer is asked to. */
const IMPERATIVE = /^(?:group|ungroup|move|put|place|connect|link|join|hide|show|collapse|expand|turn|convert|transform|make|create|add|delete|remove|rename|organi[sz]e|arrange|tidy|find|open|go|compare|undo|redo|duplicate|copy|select|zoom|focus|filter|sort|align|merge|split|summari[sz]e|mark|set|swap|replace|attach|pin|bring|take|keep|lay|clean)\b/i;
const QUESTION = /\?$|^(?:why|what|how|when|where|who|whom|whose|which|should|could|would|is|are|was|were|do|does|did|can|will|shall|may|might|has|have|had|am)\b/i;

/** Split "group these and then collapse them" into its instructions (never "connect A and B"). */
export function clauses(text: string): string[] {
  return text
    .split(/\s*(?:;|,?\s+and then\s+|,\s+then\s+|\.\s+(?:then\s+)?(?=[a-z])|\.\s+(?=[A-Z]))\s*/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Read one instruction into a step, or nothing. */
export function readClause(raw: string): Step | Step[] | null {
  const t = clean(raw);
  if (!t) return null;
  for (const r of RULES) {
    const m = r.re.exec(t);
    if (m) return r.make(m);
  }
  return null;
}

/**
 * What the words ask for. Every clause read: steps. Some read and some not, or none read but worded as an instruction:
 * an instruction for the intelligence layer. Otherwise a question (or a thought) for the representation.
 */
export function readIntent(text: string): Reading {
  const t = text.trim();
  if (!t) return { kind: 'question' };
  // a question is a question, even when it starts like an instruction ("show me why…" is asked, not done)
  const parts = clauses(t);
  const steps: Step[] = [];
  let unread = 0;
  for (const p of parts) {
    const s = readClause(p);
    if (!s) unread++;
    else steps.push(...(Array.isArray(s) ? s : [s]));
  }
  if (steps.length && !unread) {
    // "show me why prices rose" reads as focus on "why prices rose": a question, not a place to go
    if (steps.length === 1 && steps[0].command === 'focus' && /^(?:why|how|what|whether|if) /i.test(String(steps[0].args.target))) return { kind: 'question' };
    return { kind: 'steps', steps };
  }
  if (QUESTION.test(clean(t)) && !steps.length) return { kind: 'question' };
  if (IMPERATIVE.test(clean(t))) return { kind: 'instruction' };
  return { kind: 'question' };
}
