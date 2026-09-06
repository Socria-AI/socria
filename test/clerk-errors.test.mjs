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

import { needsReverification, clerkMessage, looksUnreachable } from './.tmp/clerk-errors.mjs';

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
  // With no coded message, the wrapper's own message is used before the
  // fallback. That is the fix, not a regression: throwing away err.message
  // is what put "Could not send the code. Try again." on screen while the
  // reason sat one property away. See the block below.
  ok('an uncoded error falls back to the wrapper message',
    clerkMessage(apiError({ code: 'x' }), 'fb') === 'clerk');
  ok('a plain Error surfaces its message',
    clerkMessage(new Error('plain'), 'fb') === 'plain');
  ok('blank coded messages are not messages',
    clerkMessage(Object.assign(new Error(''), { errors: [{ message: '   ', longMessage: '' }] }), 'fb') === 'fb');
  ok('nor are non-strings',
    clerkMessage(Object.assign(new Error(''), { errors: [{ message: 42, longMessage: {} }] }), 'fb') === 'fb');
  ok('junk falls back', clerkMessage(null, 'fb') === 'fb');
  ok('the first error is the one shown',
    clerkMessage(apiError({ message: 'first' }, { message: 'second' }), 'fb') === 'first');
}

console.log('\n=== a failure with no error code still says something ===');
{
  // The regression this block exists for: "Could not send the code. Try
  // again." on screen while the real reason sat in err.message, discarded
  // because it was not a coded API refusal. Two whole classes of Clerk
  // failure arrive that way — ClerkRuntimeError for clerk-js's own problems,
  // and a bare TypeError when the request never left the page — and both were
  // being thrown away in favour of the caller's fallback.
  const runtime = Object.assign(new Error('Clerk: cannot render the component'), { name: 'ClerkRuntimeError' });
  ok('a runtime error surfaces its own message',
    clerkMessage(runtime, 'fb') === 'Clerk: cannot render the component');

  const net = Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' });
  ok('so does a network failure', clerkMessage(net, 'fb') === 'Failed to fetch');

  // A coded refusal still wins: it is the more specific answer.
  const coded = Object.assign(new Error('generic wrapper text'), {
    errors: [{ longMessage: 'That email address is taken.' }],
  });
  ok('a coded refusal beats the wrapper message',
    clerkMessage(coded, 'fb') === 'That email address is taken.');

  ok('and the fallback is still there for nothing at all',
    clerkMessage({}, 'fb') === 'fb' && clerkMessage(null, 'fb') === 'fb');
  ok('a blank message is not a message',
    clerkMessage(new Error('   '), 'fb') === 'fb');
}

console.log('\n=== unreachable is not the same as refused ===');
{
  // The fix for the two is completely different — one is Clerk saying no,
  // the other is configuration — so the panel must be able to tell them
  // apart before it offers advice.
  ok('a failed fetch is unreachable',
    looksUnreachable(Object.assign(new TypeError('Failed to fetch'), { name: 'TypeError' })) === true);
  ok('so is a NetworkError', looksUnreachable(new Error('NetworkError when attempting to fetch resource')) === true);
  ok('and a Safari "Load failed"', looksUnreachable(new Error('Load failed')) === true);
  ok('and a chrome net error', looksUnreachable(new Error('net::ERR_CONNECTION_REFUSED')) === true);

  // A coded refusal DID reach Clerk, whatever its message happens to say.
  ok('a coded refusal is never unreachable',
    looksUnreachable({ errors: [{ code: 'form_identifier_exists', message: 'Failed to fetch' }] }) === false);
  ok('a reverification demand is not unreachable',
    looksUnreachable({ errors: [{ code: 'session_step_up_verification_required' }] }) === false);
  ok('an ordinary error is not unreachable', looksUnreachable(new Error('nope')) === false);
  for (const junk of [null, undefined, {}, 42, 'Failed to fetch', { errors: [] }]) {
    ok(`${JSON.stringify(junk)} is not a network failure`, looksUnreachable(junk) === false);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
