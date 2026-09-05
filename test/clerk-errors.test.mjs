// Reading Clerk's refusals.
//
// One of these two functions decides whether somebody gets past a wall or
// stares at it. Adding an email address is a sensitive operation, so Clerk
// refuses it on a session that has not proved itself recently — and the panel
// only knows to offer that proof if it recognises the refusal. Get this wrong
// and the student programme is unreachable again, with a message that sounds
// like a misconfiguration and is not one.
//
// The codes are matched by prefix on purpose: clerk-js watches for
// session_step_up_verification_required today, later versions of the API call
// the same condition session_reverification_required, and this must not start
// failing silently on an upgrade.

import { needsReverification, clerkMessage } from './.tmp/clerk-errors.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** What Clerk actually throws: a ClerkAPIResponseError-shaped object. */
const apiError = (...errors) => Object.assign(new Error('clerk'), { errors });

console.log('=== the refusal that can be answered ===');
{
  ok('the code clerk-js itself watches for',
    needsReverification(apiError({ code: 'session_step_up_verification_required' })) === true);
  ok('the name the same condition has later',
    needsReverification(apiError({ code: 'session_reverification_required' })) === true);
  ok('matched by prefix, so a suffixed variant still counts',
    needsReverification(apiError({ code: 'session_reverification_required_v2' })) === true);
  ok('found even when it is not the first error',
    needsReverification(apiError(
      { code: 'form_param_nil' },
      { code: 'session_step_up_verification_required' },
    )) === true);

  // The real payload, as it arrives — this is the exact message that was on
  // screen when the panel had no answer for it.
  ok('the refusal seen on dev', needsReverification(apiError({
    code: 'session_step_up_verification_required',
    message: 'Additional verification required',
    longMessage: 'You need to provide additional verification to perform this operation',
  })) === true);
}

console.log('\n=== everything else is an ordinary failure ===');
{
  for (const code of [
    'form_identifier_exists', 'form_param_format_invalid', 'authorization_invalid',
    'session_exists', 'session_token_and_uat_claim_check_failed', 'verification_failed',
    'reverification_required', 'step_up_verification_required',
  ]) {
    ok(`${code} is not it`, needsReverification(apiError({ code })) === false);
  }
  ok('a session_ code that is not about verification is not it',
    needsReverification(apiError({ code: 'session_not_found' })) === false);
}

console.log('\n=== nothing else is an input ===');
{
  for (const junk of [null, undefined, 42, 'session_step_up_verification_required', {}, [],
                      new Error('plain'), { errors: null }, { errors: 'nope' }, { errors: [] },
                      { errors: [null] }, { errors: [{}] }, { errors: [{ code: 7 }] }]) {
    ok(`${JSON.stringify(junk)} is not a refusal`, needsReverification(junk) === false);
  }
}

console.log('\n=== the message shown is Clerk\'s own ===');
{
  ok('the long form is preferred',
    clerkMessage(apiError({ message: 'short', longMessage: 'the long one' }), 'fb') === 'the long one');
  ok('the short form when there is no long one',
    clerkMessage(apiError({ message: 'short' }), 'fb') === 'short');
  ok('the fallback when there is neither',
    clerkMessage(apiError({ code: 'x' }), 'fb') === 'fb');
  ok('and when there is no error list at all',
    clerkMessage(new Error('plain'), 'fb') === 'fb');
  ok('blank is not a message',
    clerkMessage(apiError({ message: '   ', longMessage: '' }), 'fb') === 'fb');
  ok('a non-string is not a message',
    clerkMessage(apiError({ message: 42, longMessage: {} }), 'fb') === 'fb');
  ok('junk falls back', clerkMessage(null, 'fb') === 'fb');
  ok('the first error is the one shown',
    clerkMessage(apiError({ message: 'first' }, { message: 'second' }), 'fb') === 'first');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
