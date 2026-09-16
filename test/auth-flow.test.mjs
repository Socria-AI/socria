// Socria's own sign-in, and the branches it has to get right.
//
// Replacing Clerk's <SignIn> means taking over its state machine, and the
// failure mode of getting that wrong is not a wrong colour — it is somebody
// on a screen with nothing to press. Every assertion here is about a branch
// that would strand a person:
//
//  - an instance that wants a password, and one that wants a mailed code;
//  - an account that has neither, because it was made with Google;
//  - a status this code has never heard of;
//  - a sign-up that needs a password AND an unverified email, in that order.

import {
  AFTER_AUTH,
  RESEND_AFTER_SECONDS,
  chooseFactor,
  cleanCode,
  cleanEmail,
  resendIn,
  signInStep,
  signUpNeeds,
  signUpStep,
} from './.tmp/auth-flow.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

{
  ok('an ordinary address', cleanEmail('Sam@Example.com') === 'sam@example.com');
  // Somebody who signed up as Sam@ and returns as sam@ must not be told no
  // account exists.
  ok('case is not identity', cleanEmail('SAM@EXAMPLE.COM') === cleanEmail('sam@example.com'));
  ok('space around it is a paste, not a mistake', cleanEmail('  a@b.co  ') === 'a@b.co');
  ok('a plus address is an address', cleanEmail('sam+socria@example.com') === 'sam+socria@example.com');
  ok('a subdomain is fine', cleanEmail('sam@mail.uta.edu') === 'sam@mail.uta.edu');

  ok('no @, no address', cleanEmail('sam.example.com') === null);
  ok('no dot after the @', cleanEmail('sam@example') === null);
  ok('two @s', cleanEmail('a@b@c.com') === null);
  ok('a space inside', cleanEmail('sam @example.com') === null);
  ok('nothing', cleanEmail('') === null);
  ok('not a string', cleanEmail(null) === null && cleanEmail(12) === null);
  // 254 is the real limit; past it something is being pasted that is not an
  // address, and the box should say so before the network does.
  ok('absurdly long', cleanEmail('a'.repeat(250) + '@b.co') === null);
}

{
  ok('six digits', cleanCode('123456') === '123456');
  // The code arrives in an email that often renders it as "123 456".
  // Refusing the exact string somebody copied is a self-inflicted wound.
  ok('spaces in the middle', cleanCode('123 456') === '123456');
  ok('dashes too', cleanCode('123-456') === '123456');
  ok('and around it', cleanCode('  123456 ') === '123456');
  ok('letters are not a code', cleanCode('12a456') === null);
  ok('too short', cleanCode('12') === null);
  ok('too long', cleanCode('1234567890') === null);
  ok('not a string', cleanCode(undefined) === null);
}

{
  const code = { strategy: 'email_code', emailAddressId: 'idn_1' };
  const pw = { strategy: 'password' };

  // A mailed code is preferred wherever both are offered: the design's form
  // asks for an email and nothing else, and "check your email" has no failure
  // mode that ends in a reset flow.
  const both = chooseFactor([pw, code]);
  ok('a code beats a password', both?.strategy === 'email_code');
  ok('and carries the address to mail', both?.emailAddressId === 'idn_1');
  ok('password when that is all there is', chooseFactor([pw])?.strategy === 'password');
  ok('and it needs no address', chooseFactor([pw])?.emailAddressId === undefined);

  // An OAuth-only account reaching a password box is somebody who will try
  // three passwords and leave. Null means "say so", not "show an empty form".
  ok('neither is null', chooseFactor([{ strategy: 'oauth_google' }]) === null);
  ok('nothing is null', chooseFactor([]) === null);
  ok('absent is null', chooseFactor(undefined) === null && chooseFactor(null) === null);
  // A code factor with no address id cannot be prepared, so it does not count.
  ok('a code with nowhere to send it is not a code',
     chooseFactor([{ strategy: 'email_code' }]) === null);
  ok('…but it falls through to the password beside it',
     chooseFactor([{ strategy: 'email_code' }, pw])?.strategy === 'password');
}

{
  const code = { strategy: 'email_code', emailAddressId: 'i' };
  const pw = { strategy: 'password' };

  ok('complete is the only done', signInStep('complete', code) === 'done');
  ok('a code factor asks for the code', signInStep('needs_first_factor', code) === 'code');
  ok('a password factor asks for the password',
     signInStep('needs_first_factor', pw) === 'password');

  // A status nobody here has heard of must not read as success. A form that
  // believes it succeeded hands the caller a session id that is not there.
  ok('an unknown status is not done', signInStep('needs_new_password', code) === 'identify');
  ok('second factor is not done', signInStep('needs_second_factor', code) === 'identify');
  ok('undefined is not done', signInStep(undefined, code) === 'identify');
  ok('null is not done', signInStep(null, null) === 'identify');
}

{
  const n = (m) => signUpNeeds(m);
  ok('the fields we have boxes for',
     n(['email_address', 'password']).fields.join() === 'email_address,password');
  ok('and nothing is blocked', n(['email_address', 'password']).blocked === false);
  ok('names are collectable', n(['first_name']).fields.join() === 'first_name');

  // A required field with no box is a dead end, and the screen has to say so
  // rather than showing a Continue that cannot work.
  ok('a field we cannot collect blocks', n(['phone_number']).blocked === true);
  ok('and is not offered as a field', n(['phone_number']).fields.length === 0);
  ok('a mixed list reports both',
     n(['password', 'phone_number']).fields.join() === 'password' &&
     n(['password', 'phone_number']).blocked === true);
  ok('junk is ignored, not collected', n([null, 7, {}]).fields.length === 0);
  ok('absent is empty', n(undefined).fields.length === 0 && n(undefined).blocked === false);
}

{
  ok('complete is done', signUpStep('complete', [], []) === 'done');

  // The order matters. Clerk will not accept the emailed code until the
  // account is otherwise complete, so asking for the code first produces a
  // verification that keeps failing for a reason the screen does not mention.
  ok('password before code',
     signUpStep('missing_requirements', ['password'], ['email_address']) === 'password');
  ok('the code once nothing else is missing',
     signUpStep('missing_requirements', [], ['email_address']) === 'code');
  ok('back to the top when the email itself is missing',
     signUpStep('missing_requirements', ['email_address'], []) === 'identify');
  ok('and when nothing at all is pending',
     signUpStep('missing_requirements', [], []) === 'identify');
  ok('an unknown status waits on the code', signUpStep('abandoned', [], []) === 'code');
}

{
  const t0 = 1_000_000;
  ok('the hold is the full length at zero', resendIn(t0, t0) === RESEND_AFTER_SECONDS);
  ok('it counts down', resendIn(t0, t0 + 10_000) === RESEND_AFTER_SECONDS - 10);
  ok('it reaches zero', resendIn(t0, t0 + RESEND_AFTER_SECONDS * 1000) === 0);
  // Never negative: the link's label reads "Send it again (0)" otherwise, or
  // worse, counts upward.
  ok('and stays there', resendIn(t0, t0 + 999_000) === 0);
  ok('a nonsense clock is no hold', resendIn(NaN, t0) === 0);

  // Long enough that pressing it means having waited; short enough that
  // somebody whose mail never arrived is not stuck.
  ok('the hold is seconds, not minutes',
     RESEND_AFTER_SECONDS >= 15 && RESEND_AFTER_SECONDS <= 60);
}

ok('one default landing, shared by both doors and the callback', AFTER_AUTH === '/chat');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
