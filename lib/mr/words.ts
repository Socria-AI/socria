// lib/mr/words.ts — WHAT MR CHANGED, SAID TO THE PERSON IT CHANGED IT FOR.
//
// The ledger and the API speak in codes: an Action, and a trigger id that is
// the rule that fired ('ifr.explicit.stop_questions', 'mr.observed.failed_attempts',
// 'mr.revert'). The account sheet lists the latest adjustments, and a person
// reading that list should not need to know any of it. These are the words.
//
// Three rules the words keep:
//   • Words come from a fixed table, never from the record. A trigger is
//     matched by its code suffix and an unknown one gets the general line;
//     the input is never echoed back, so nothing a record carries can reach
//     the page as text.
//   • A reason is about what was said or what happened in the conversation,
//     never about how the person felt. "Because the questions weren't
//     helping" is about the questions; there is no "because you were
//     frustrated" in here, even for 'explicit.frustration' — their own word
//     for it is not ours to repeat back as a finding.
//   • 'none' has no words: nothing was adjusted, so nothing is listed.
//
// Pure.

import type { Action, ObservationCode } from './types';

const ACTION_WORDS: Readonly<Record<Action, string>> = Object.freeze({
  none: '',
  direct: 'Answered directly',
  fewer_questions: 'Asked fewer questions',
  guided_discovery: 'Let you work it out',
  worked_example: 'Showed a worked example first',
  more_scaffolding: 'Broke it into smaller steps',
  less_scaffolding: 'Gave you more room to work',
  simplify: 'Explained more simply',
  verify: 'Said what it checked',
  shorter: 'Kept replies shorter',
  task_specific: 'Stuck to what you asked for',
  preserve_challenge: 'Kept the quiz a quiz',
  execute: 'Just did the task',
  revert: 'Went back to normal',
});

/**
 * Why, in their terms, keyed by observation code. Every code is listed so a
 * new one cannot slip in without a decision about its words; '' means "use
 * the general line" — the weak readings, which never fire a rule alone.
 */
const CODE_WORDS: Readonly<Record<ObservationCode, string>> = Object.freeze({
  'explicit.direct_answer': 'because you asked for the answer',
  'explicit.show_steps': 'because you asked to see the steps',
  'explicit.stop_questions': 'because you asked it to stop asking questions',
  'explicit.wants_questions': 'because you asked for questions',
  'explicit.quiz': 'because you asked to be quizzed',
  'explicit.own_try': 'because you wanted to try it yourself first',
  'explicit.shorter': 'because you asked for shorter replies',
  'explicit.longer': 'because you asked for more detail',
  'explicit.simpler': 'because you asked for a simpler explanation',
  'explicit.verify': 'because you asked it to double-check',
  'explicit.own_work': 'because you said the work is yours',
  'explicit.edit_only': 'because you asked for only those edits',
  'explicit.rewrite': 'because you asked for a rewrite',
  'explicit.learning_goal': 'because you said you want to work it out yourself',
  'explicit.confused': "because you said it didn't make sense yet",
  'explicit.revoke': 'because you asked it to go back to how it was',
  'explicit.end_practice': 'because you said the quiz was over',
  'explicit.positive': 'because you said it helped',
  'explicit.negative': "because you said it wasn't helping",
  // their word was about how it was going; the line stays about that too
  'explicit.frustration': "because you said it wasn't going well",
  'explicit.standing': 'because you said "from now on"',
  'observed.question_streak': 'because it had asked several questions in a row',
  'observed.unproductive_questions': "because the questions weren't helping",
  'observed.repeated_confusion': "because an explanation didn't land",
  'observed.failed_attempts': "because a couple of attempts didn't check out",
  'observed.repeated_request': 'because you had to ask again',
  'observed.verbose_replies': 'because its replies were running long',
  'observed.routine_task': 'because it was a routine task',
  'observed.writing_task': 'because it was your own writing',
  'observed.practice': 'because this was practice',
  'observed.verified_correct': 'because your answer checked out',
  'observed.verified_incorrect': "because an answer didn't check out",
  'weak.short_reply': '',
  'weak.terse_run': '',
});

/** 'mr.<rule>' triggers that are not named after an observation. */
const RULE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  // their words ended an adjustment, or the adjustment was taken back after it was judged
  revert: 'because an earlier change came to an end',
});

/** 'user.<setting>' triggers: a choice of theirs outside the conversation. */
const SETTING_WORDS: Readonly<Record<string, string>> = Object.freeze({
  carryAcross: 'because you said it in an earlier conversation',
  length: 'because of your reply-length setting',
});

/** The line when the trigger is not one these words know. */
export const MR_GENERAL_REASON = 'because of how the conversation was going';

const own = (t: Readonly<Record<string, string>>, k: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(t, k) ? t[k] : undefined;

/** What Socria did, as a short phrase that starts a sentence. '' for 'none' and for anything that is not an Action. */
export function actionWords(a: Action): string {
  return typeof a === 'string' ? own(ACTION_WORDS, a) ?? '' : '';
}

/**
 * Why, as a clause starting "because …". The trigger is matched by its code
 * suffix: 'ifr.<ObservationCode>', 'mr.<ObservationCode>' or 'mr.<rule>',
 * 'user.<setting>', or a bare ObservationCode. A ':' tail (an intervention
 * id's ':carried') is ignored. 'none' and '' have no words; anything else
 * not in the tables gets MR_GENERAL_REASON.
 */
export function triggerWords(trigger: string): string {
  if (typeof trigger !== 'string') return MR_GENERAL_REASON;
  const t = trigger.trim().split(':')[0];
  if (!t || t === 'none') return '';
  const dot = t.indexOf('.');
  const family = dot > 0 ? t.slice(0, dot) : '';
  const rest = dot > 0 ? t.slice(dot + 1) : t;
  if (family === 'user') return own(SETTING_WORDS, rest) || MR_GENERAL_REASON;
  if (family === 'ifr' || family === 'mr') return own(CODE_WORDS, rest) || own(RULE_WORDS, rest) || MR_GENERAL_REASON;
  return own(CODE_WORDS, t) || MR_GENERAL_REASON;
}

/** One line for the list: "Asked fewer questions because the questions weren't helping". '' when nothing was adjusted. */
export function adjustmentWords(action: Action, trigger: string): string {
  const what = actionWords(action);
  if (!what) return '';
  const why = triggerWords(trigger);
  return why ? `${what} ${why}` : what;
}

/** How far an adjustment reaches, when that is more than the turn it was made on. */
export function adjustmentReachWords(a: { standing?: boolean; conversation?: boolean }): string {
  if (a.standing === true) return 'in every conversation';
  if (a.conversation === true) return 'for the rest of that conversation';
  return '';
}
