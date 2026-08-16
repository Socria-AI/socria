// lib/logos-draft.ts
//
// The third surface: CHAT ↔ THINKING MAP ↔ DRAFT.
//
// The draft is where the person writes. Logos never writes into it. Every
// action here returns something to READ — a question, a pressure point, a
// proposed wording — and the person decides what, if anything, lands on the
// page. That asymmetry is the entire design: the moment Logos can type into
// the draft, authorship has quietly moved.

import type { ThinkingMap } from './logos';

export const DRAFT_ACTIONS = ['clarify', 'challenge', 'trace', 'research', 'refine'] as const;
export type DraftAction = (typeof DRAFT_ACTIONS)[number];

export const DRAFT_ACTION_META: Record<
  DraftAction,
  { label: string; blurb: string; searches: boolean }
> = {
  clarify: {
    label: 'Clarify',
    blurb: 'What are you actually trying to say?',
    searches: false,
  },
  challenge: {
    label: 'Challenge',
    blurb: 'Where this gives way',
    searches: false,
  },
  trace: {
    label: 'Trace',
    blurb: 'Which of your thinking this rests on',
    searches: false,
  },
  research: {
    label: 'Research',
    blurb: 'What is known about this',
    searches: true,
  },
  refine: {
    label: 'Refine',
    blurb: 'Same meaning, clearer',
    searches: false,
  },
};

export const MAX_SELECTION = 4_000;
export const MAX_DRAFT_CHARS = 120_000;
const MAX_POINTS = 4;
const MAX_NODES_CITED = 5;

export interface DraftResponse {
  action: DraftAction;
  /** the prose Logos offers back — never inserted anywhere by itself */
  body: string;
  /** clarify/challenge/research: the specific things worth looking at */
  points?: string[];
  /** refine only: a proposed wording the person may take or leave */
  proposal?: string;
  /** refine only: what was changed and why, so it's a choice not a swap */
  changes?: string[];
  /** trace only: ids of map nodes this passage actually rests on */
  nodeIds?: string[];
  /** one question — the thing that keeps this a conversation */
  question?: string;
  sources?: { title: string; url: string; site: string }[];
}

function mapBlock(map: ThinkingMap): string {
  if (!map.nodes.length) return '(the map is empty)';
  return map.nodes.map((n) => `  ${n.id} [${n.type}] ${n.label}`).join('\n');
}

export function buildDraftPrompt(
  action: DraftAction,
  selection: string,
  around: string,
  map: ThinkingMap,
  sources: { title: string; url: string; site: string; snippet: string }[] = []
): string {
  const shared = `You are Logos. Someone is writing, and has highlighted a passage of THEIR OWN writing to work on.

The passage they selected:
"""
${selection}
"""

Where it sits in their draft:
"""
${around}
"""

Their thinking map:
${mapBlock(map)}

Absolute rules, whatever the action:
- This is their writing. You do not take it over, and you never produce the next paragraph, section or draft for them.
- Never rewrite the passage unless the action is "refine", and even then it is a PROPOSAL they may reject, never a replacement.
- Never invent facts, studies, statistics or citations.
- Plain prose. No markdown, no headings, no lists inside a field.`;

  if (action === 'clarify') {
    return `${shared}

Your job: help them see what they are actually trying to say — not say it for them.

Return ONLY JSON:
{
  "body": "2-3 sentences naming what this passage currently communicates, as a reader would take it. Where it is doing two jobs at once, or where the claim is softer or harder than they may intend, say so plainly.",
  "points": ["1-3 specific ambiguities, each ONE sentence: a word doing too much work, a claim that could be read two ways, a gap a reader would fall into."],
  "question": "ONE question that only they can answer, which would settle what this passage is for."
}

Do not offer replacement wording here. Naming the ambiguity is the work; resolving it is theirs.`;
  }

  if (action === 'challenge') {
    return `${shared}

Your job: put pressure on this passage as an argument. You are not telling them they are wrong.

Return ONLY JSON:
{
  "body": "1-2 sentences on what this passage is asking a reader to accept, and what it is resting on to get there.",
  "points": ["2-4 pressure points, each ONE sentence: an unsupported step, an assumption they haven't stated, the strongest version of the counter-case, or a place a hostile reader stops reading. Phrase each as a condition to test, not a verdict."],
  "question": "ONE question that makes the weakest point testable by them."
}

Steelman the opposition rather than knocking down a weak version. If the passage genuinely holds up on what they've written, say what it would take to move it instead of manufacturing doubt.`;
  }

  if (action === 'trace') {
    return `${shared}

Your job: show which of THEIR OWN thinking this passage rests on, using the map above. You are retracing, not extending.

Return ONLY JSON:
{
  "body": "2-3 sentences on how this passage relates to the thinking they've already done: what it draws on, what it leaves out, and whether anything in it has no support in the map at all.",
  "nodeIds": ["ids from the map above that this passage actually rests on, most important first, at most 5"],
  "question": "ONE question about the gap between what they mapped and what they wrote."
}

Only use ids that appear in the map above. If the passage rests on nothing in the map, return an empty list and say so in the body — that is a real and useful finding, not a failure.`;
  }

  if (action === 'research') {
    const block = sources.length
      ? sources.map((s, i) => `[${i + 1}] ${s.title} — ${s.site}\n${s.snippet}`).join('\n\n')
      : '(no search results available)';
    return `${shared}

Research material:
${block}

Your job: report what is actually known about the claim in this passage, and where the evidence is thin.

Return ONLY JSON:
{
  "body": "3-4 sentences on what the material above establishes about this claim, and — just as important — where it is contested, thin, or absent.",
  "points": ["1-3 findings, each ONE sentence, each traceable to the material above. Empty array if the material is empty."],
  "question": "ONE question about what evidence would actually settle this for them."
}

Never conclude what they should write. Report disagreement as disagreement rather than averaging it into a false consensus. If the material is empty, say the evidence was not retrievable and return no findings.`;
  }

  return `${shared}

Your job: propose a clearer version of this passage that keeps THEIR meaning and THEIR voice.

Return ONLY JSON:
{
  "proposal": "the passage rewritten for clarity, structure, grammar and flow. Same claims, same emphasis, same register, same vocabulary where it is doing work. Roughly the same length.",
  "changes": ["2-4 short notes on what you changed and why, each ONE sentence, so they can accept or reject each on its merits."],
  "body": "1-2 sentences on what was making the original harder to read than it needed to be.",
  "question": "ONE question, only if a choice in the passage is genuinely theirs to make rather than a matter of clarity. Otherwise an empty string."
}

Hard limits on refine:
- Do NOT strengthen, soften, or extend any claim. Clarity only.
- Do NOT add new ideas, examples, evidence or transitions carrying new content.
- Do NOT flatten their voice into neutral prose. If they write in fragments, or informally, or with a particular rhythm, that survives.
- If the passage is already clear, say so in the body and return the passage unchanged as the proposal. Rewriting for the sake of it is a failure.`;
}

export function sanitizeDraftResponse(
  raw: any,
  action: DraftAction,
  map: ThinkingMap,
  sources: { title: string; url: string; site: string }[] = []
): DraftResponse | null {
  if (!raw || typeof raw !== 'object') return null;
  const str = (v: any, n: number) =>
    typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '';

  const body = str(raw.body, 900);
  const question = str(raw.question, 300);
  const points = (Array.isArray(raw.points) ? raw.points : [])
    .map((p: any) => str(p, 300))
    .filter(Boolean)
    .slice(0, MAX_POINTS);

  const proposal =
    action === 'refine' && typeof raw.proposal === 'string'
      ? raw.proposal.trim().slice(0, MAX_SELECTION)
      : '';
  const changes = (Array.isArray(raw.changes) ? raw.changes : [])
    .map((c: any) => str(c, 240))
    .filter(Boolean)
    .slice(0, MAX_POINTS);

  // Node ids are checked against the real map, so a trace can never point at
  // reasoning that isn't there.
  const known = new Set(map.nodes.map((n) => n.id));
  const nodeIds = (Array.isArray(raw.nodeIds) ? raw.nodeIds : [])
    .map((id: any) => (typeof id === 'string' ? id.trim() : ''))
    .filter((id: string) => known.has(id))
    .slice(0, MAX_NODES_CITED);

  const usable =
    action === 'refine' ? !!proposal : action === 'trace' ? !!(body || nodeIds.length) : !!(body || points.length);
  if (!usable) return null;

  return {
    action,
    body,
    ...(points.length ? { points } : {}),
    ...(proposal ? { proposal } : {}),
    ...(changes.length ? { changes } : {}),
    ...(nodeIds.length ? { nodeIds } : {}),
    ...(question ? { question } : {}),
    ...(sources.length ? { sources } : {}),
  };
}

// ── map ↔ draft, without a model call ────────────────────────────────
//
// As someone writes, the map softly lights the reasoning their current
// paragraph touches. Doing this with the model would mean a request per
// keystroke-ish, so it's plain word overlap: cheap, instant, and wrong in a
// way that costs nothing — a node that lights up by coincidence is a moment's
// distraction, not a false claim.

const STOP = new Set(
  `the a an and or but if then than that this these those of to in on for with as at by from is are was
   were be been being it its it's i you he she they we my your our their his her not no do does did have
   has had will would can could should may might must about into over under just very really more most
   some any all what which who when where how why so because there here them us me him`
    .split(/\s+/)
    .filter(Boolean)
);

function terms(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s'-]/g, ' ')
      .split(/\s+/)
      .map((w) => w.replace(/^['-]+|['-]+$/g, ''))
      .filter((w) => w.length > 3 && !STOP.has(w))
  );
}

/** Node ids whose labels overlap the passage enough to be worth lighting. */
export function relevantNodes(map: ThinkingMap, passage: string): string[] {
  if (!passage.trim() || !map.nodes.length) return [];
  const words = terms(passage);
  if (!words.size) return [];

  const scored = map.nodes
    .map((n) => {
      const label = terms(n.label);
      if (!label.size) return { id: n.id, score: 0 };
      let hit = 0;
      for (const w of label) if (words.has(w)) hit++;
      return { id: n.id, score: hit / label.size };
    })
    // Half a label matching is a real echo; one incidental word is not.
    .filter((s) => s.score >= 0.5)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6);

  return scored.map((s) => s.id);
}
