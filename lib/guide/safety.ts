// lib/guide/safety.ts — WHEN A GUIDE MUST NOT GUESS (Socria Live AR Guidance).
//
// Read in code, from the person's own words, before any model is asked:
//
//   emergency  someone hurt or in danger now — not breathing, choking, heavy
//              bleeding, a fire, a gas smell, an electric shock, chest pain,
//              a stroke, an overdose. No model is asked and nothing is drawn
//              on the camera: the person is told to call emergency services
//              first, and given only the short, widely published first steps
//              that are safe whatever the details (leave, don't touch, call).
//              Socria does not improvise instructions in an emergency.
//   stop       a job that should not be learned from a camera overlay — mains
//              wiring, a gas appliance, a car's brakes or airbags, anything
//              structural. No steps; who to call instead.
//   caution    a job with a real risk that a careful person can still do —
//              a knife, a power tool, a ladder, chemicals, a hot oven. Guided,
//              with the safety step first and the risk said plainly.
//   none       everything else.
//
// The model's own read can raise this (lib/guide/overlay.ts `safety`), never
// lower it: the stricter of the two holds.
//
// PURE.

import type { GuidePlan, Safety } from './overlay';

export type HazardLevel = 'emergency' | 'stop' | 'caution' | 'none';

export interface Hazard {
  level: HazardLevel;
  /** what kind of danger, for the card and the trace */
  kind: string;
  /** who to call or what to do first */
  escalate?: string;
  /** the few steps that are safe whatever the details — only for emergencies */
  first?: string[];
  /** said on the card, plainly */
  note?: string;
}

const CALL = 'Call your local emergency number now — 999 or 112 in the UK and Europe, 911 in the US and Canada.';

interface Rule {
  re: RegExp;
  level: HazardLevel;
  kind: string;
  escalate?: string;
  first?: string[];
  note?: string;
}

// Order matters: the first rule that matches decides.
const RULES: readonly Rule[] = [
  {
    re: /\b(?:not breathing|isn'?t breathing|stopped breathing|no pulse|unconscious|won'?t wake|unresponsive|cpr|collapsed)\b/i,
    level: 'emergency',
    kind: 'breathing',
    escalate: CALL,
    first: ['Call emergency services and put the phone on speaker — the call handler will talk you through what to do.', 'If there is a defibrillator (AED) nearby, send someone for it.'],
  },
  {
    re: /\b(?:choking|can'?t breathe|cannot breathe|something stuck in (?:my|his|her|their) throat)\b/i,
    level: 'emergency',
    kind: 'choking',
    escalate: CALL,
    first: ['Call emergency services now.', 'If they can cough, encourage them to keep coughing.'],
  },
  {
    re: /\b(?:bleeding (?:heavily|a lot|badly|won'?t stop)|won'?t stop bleeding|deep cut|gushing blood|severed|amputat\w*)\b/i,
    level: 'emergency',
    kind: 'bleeding',
    escalate: CALL,
    first: ['Call emergency services now.', 'Press firmly on the wound with a clean cloth and keep pressing.'],
  },
  {
    re: /\b(?:on fire|house fire|kitchen fire|fire (?:in|on) (?:the|my)|flames|smoke alarm going|pan (?:is )?on fire|grease fire)\b/i,
    level: 'emergency',
    kind: 'fire',
    escalate: CALL,
    first: ['Get everyone out and stay out.', 'Close doors behind you if you can do it safely.', 'Call the fire service from outside.'],
    note: 'Never put water on a pan of burning oil.',
  },
  {
    re: /\b(?:smell(?:s|ing)? (?:of )?gas|gas leak|leaking gas|carbon monoxide|co alarm)\b/i,
    level: 'emergency',
    kind: 'gas',
    escalate: 'Leave, then call your gas emergency line or emergency services from outside — in the UK, 0800 111 999.',
    first: ['Do not switch lights or anything electrical on or off.', 'Open doors and windows on your way out if it is quick to do.', 'Leave the building, then call from outside.'],
  },
  {
    re: /\b(?:electric(?:al)? shock|electrocut\w*|got shocked|live wire (?:touching|on)|sparks? coming)\b/i,
    level: 'emergency',
    kind: 'shock',
    escalate: CALL,
    first: ['Do not touch the person while they may still be touching the source.', 'Switch the power off at the fuse box or unplug it if you can do so safely.', 'Call emergency services.'],
  },
  {
    re: /\b(?:chest pain|heart attack|stroke|face (?:is )?drooping|slurred speech|overdos\w*|seizure|anaphyla\w*|allergic reaction|swallowed (?:bleach|poison|pills|battery)|poisoned)\b/i,
    level: 'emergency',
    kind: 'medical',
    escalate: CALL,
    first: ['Call emergency services now and tell them what you see.', 'Stay with the person.'],
  },
  {
    re: /\b(?:car (?:crash|accident)|trapped|drowning|suicid\w*|kill (?:myself|me)|hurt (?:myself|me))\b/i,
    level: 'emergency',
    kind: 'danger',
    escalate: CALL + ' If you are thinking about harming yourself, you can also call or text a crisis line — 116 123 (Samaritans, UK) or 988 (US).',
    first: ['Call emergency services now.'],
  },
  // jobs a camera overlay should not teach
  {
    re: /\b(?:fuse ?box|consumer unit|breaker panel|mains (?:wiring|cable|electric\w*)|rewir\w*|wire (?:a|the) (?:socket|plug socket|light fitting|outlet|switch)|install (?:a|an) (?:socket|outlet|light fitting|circuit)|live wires?)\b/i,
    level: 'stop',
    kind: 'mains electrics',
    escalate: 'This is work for a qualified electrician. If anything is sparking, burning or hot, switch the power off at the fuse box if it is safe to, and keep away.',
    note: 'Mains wiring can kill and must be safe for whoever uses it next — Socria will not guide it step by step.',
  },
  {
    re: /\b(?:boiler|gas (?:cooker|hob|fire|pipe|appliance|meter)|gas line)\b/i,
    level: 'stop',
    kind: 'gas appliance',
    escalate: 'Gas appliances should be worked on by a registered gas engineer (Gas Safe in the UK).',
    note: 'A gas fitting done wrong can leak or poison — Socria will not guide it step by step.',
  },
  {
    re: /\b(?:brake (?:pads?|lines?|fluid|discs?|calipers?)|airbag|load[- ]bearing|structural|jack up (?:the|a|my) car|under (?:the|a|my) car)\b/i,
    level: 'stop',
    kind: 'safety-critical repair',
    escalate: 'Have this checked by a qualified mechanic or builder.',
    note: 'A mistake here can hurt someone later — Socria will not guide it step by step.',
  },
  // careful, but fine to guide
  {
    re: /\b(?:knife|blade|saw|chisel|drill|angle grinder|power tool|ladder|roof|bleach|ammonia|drain cleaner|oven cleaner|chemicals?|hot oil|deep fryer|oven|kettle|boiling|soldering|broken glass|razor|mandoline|car battery|jump[- ]start)\b/i,
    level: 'caution',
    kind: 'sharp, hot or hazardous',
    note: 'Go slowly, keep fingers clear, and stop if anything feels wrong.',
  },
];

/** The danger in what they asked, read before anything else. */
export function hazardOf(text: string): Hazard {
  const t = (text || '').replace(/\s+/g, ' ').trim();
  for (const r of RULES) {
    if (r.re.test(t)) return { level: r.level, kind: r.kind, ...(r.escalate ? { escalate: r.escalate } : {}), ...(r.first ? { first: r.first } : {}), ...(r.note ? { note: r.note } : {}) };
  }
  return { level: 'none', kind: 'none' };
}

const RANK: Record<Safety, number> = { none: 0, caution: 1, stop: 2 };

/** The stricter of what the words say and what the model read. An emergency is a stop. */
export function stricter(words: HazardLevel, model: Safety | undefined): Safety {
  const w: Safety = words === 'emergency' || words === 'stop' ? 'stop' : words === 'caution' ? 'caution' : 'none';
  const m = model ?? 'none';
  return RANK[w] >= RANK[m] ? w : m;
}

/** The plan for an emergency or a stop, decided from the words alone: no frame read, no model asked. */
export function safetyPlan(question: string): GuidePlan | null {
  const h = hazardOf(question);
  if (h.level !== 'emergency' && h.level !== 'stop') return null;
  return {
    task: h.level === 'emergency' ? 'Get help now' : 'Not one to guide',
    objects: [],
    steps: [],
    confidence: 1,
    safety: 'stop',
    safetyNote: h.note ?? (h.level === 'emergency' ? 'Socria will not improvise instructions in an emergency.' : 'This is not something to learn from a camera guide.'),
    ...(h.escalate ? { escalate: h.escalate } : {}),
    ...(h.level === 'emergency' && h.first?.length ? { first: h.first } : {}),
  };
}

