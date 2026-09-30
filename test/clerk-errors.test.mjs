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

import {
  needsReverification,
  clerkMessage,
  looksUnreachable,
  reverificationOpener,
  withReverification,
  ReverifyCancelled,
} from './.tmp/clerk-errors.mjs';

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

console.log('\n=== a JS bug is not a network failure ===');
{
  // This is the false positive that cost a real evening. clerk-js answered
  // 403 and the panel said "could not reach Clerk, this is usually a
  // production key on a preview domain" — sending everyone after a
  // configuration problem that did not exist. Any TypeError counted as a
  // transport failure, and a property read on undefined is a TypeError.
  for (const bug of [
    "Cannot read properties of undefined (reading 'emailAddress')",
    'undefined is not an object',
    'clerk.openThing is not a function',
    'open is not defined',
    'x is not iterable',
  ]) {
    ok(`"${bug.slice(0, 34)}…" is a bug, not a network failure`,
      looksUnreachable(new TypeError(bug)) === false, bug);
  }
  // …while the transport phrasings a TypeError really does carry still count.
  ok('but a bare TypeError with an unfamiliar phrasing still counts',
    looksUnreachable(new TypeError('The network connection was lost')) === true);
}

console.log('\n=== finding the box that says "prove it is you" ===');
{
  // clerk-js ships from Clerk's CDN at whatever version they are on, while
  // @clerk/nextjs is pinned in package.json. The reverification method has
  // already been renamed underneath us once, and the panel dead-ended on a
  // 403 with no way past it. These are the names, and then the shape.
  const noop = () => {};

  const modern = { __internal_openReverification: noop, __internal_closeReverification: noop };
  ok('the current name is found', typeof reverificationOpener(modern) === 'function');

  const legacy = { __experimental_openUserVerification: noop };
  ok('the older name is found', typeof reverificationOpener(legacy) === 'function');

  // Both present: the newer one wins, because the older is the one on its
  // way out and may be a deprecation shim.
  let which = '';
  const both = {
    __internal_openReverification: () => { which = 'new'; },
    __experimental_openUserVerification: () => { which = 'old'; },
  };
  reverificationOpener(both)({});
  ok('the newer name wins when both exist', which === 'new', which);

  // A rename we have never seen must not be a dead end.
  let shapeCalled = false;
  const renamed = { __private_openIdentityVerification: () => { shapeCalled = true; } };
  const byShape = reverificationOpener(renamed);
  ok('an unknown rename is found by shape', typeof byShape === 'function');
  if (byShape) byShape({});
  ok('...and is the one that runs', shapeCalled === true);

  // The exact keys clerk-js 5.127.2 exposes, from a real console. Closing the
  // box and handling a magic link are both "verification" and neither is this.
  const real = {
    __internal_openReverification: noop,
    __internal_closeReverification: noop,
    handleEmailLinkVerification: noop,
  };
  ok('clerk-js 5.127 resolves', typeof reverificationOpener(real) === 'function');
  ok('close is never mistaken for open',
    typeof reverificationOpener({ __internal_closeReverification: noop }) !== 'function');
  ok('nor is the email-link handler',
    typeof reverificationOpener({ handleEmailLinkVerification: noop }) !== 'function');

  // Bound, so the caller can hold it detached without losing `this`.
  const host = {
    marker: 'me',
    seen: null,
    __internal_openReverification() { this.seen = this.marker; },
  };
  reverificationOpener(host)({});
  ok('it is bound to the Clerk instance', host.seen === 'me');

  // Nothing to find, and nothing to crash on.
  ok('a build without it returns null', reverificationOpener({ signOut: noop }) === null);
  for (const junk of [null, undefined, 42, 'clerk', []]) {
    ok(`${JSON.stringify(junk)} yields null`, reverificationOpener(junk) === null);
  }
  ok('a non-function under the right name is refused',
    reverificationOpener({ __internal_openReverification: 'nope' }) === null);
}


// ═══ THE WRAPPER THAT LIES ══════════════════════════════════════════
//
// The bug this section exists for, reported from production:
//
//   this.clerkjs.__experimental_openUserVerification is not a function
//
// `useClerk()` does not return clerk-js. It returns IsomorphicClerk, which
// defines EVERY method as its own property in its constructor and forwards to
// whatever bundle the CDN loaded. So the old name is present on the wrapper,
// every feature check passes, and the failure arrives at the call — on the one
// screen where somebody is verifying their email address.
console.log('\n=== the wrapper that has the method and the instance that does not ===');
{
  /** @clerk/clerk-react 5.12's IsomorphicClerk, reduced to what matters. */
  const isomorphic = (inner) => ({
    clerkjs: inner,
    // Assigned in the constructor whether or not `inner` has it — this is the
    // property that made every check pass.
    __experimental_openUserVerification(props) {
      this.clerkjs.__experimental_openUserVerification(props);
    },
    __experimental_closeUserVerification() {},
  });

  // clerk-js as it ships today: renamed, and the old name simply gone.
  let opened = null;
  const modernInner = {
    __internal_openReverification(props) { opened = props; },
    __internal_closeReverification() {},
    handleEmailLinkVerification() {},
  };

  const wrapper = isomorphic(modernInner);

  // THE REGRESSION, STATED DIRECTLY. Before the fix this resolved the
  // wrapper's own stale property and threw on the call.
  const open = reverificationOpener(wrapper);
  ok('a wrapper over a renamed build still yields an opener', typeof open === 'function');
  let threw = null;
  try { open({ afterVerification: () => {} }); } catch (e) { threw = e; }
  ok('  and calling it does not throw', threw === null, String(threw));
  ok('  and it is the loaded build that opened the box', opened !== null);

  // …and the queue still works before clerk-js has loaded, which is the whole
  // reason the wrapper defines these properties in the first place.
  let queued = null;
  const notLoaded = { clerkjs: null, __experimental_openUserVerification(p) { queued = p; } };
  const pre = reverificationOpener(notLoaded);
  ok('before clerk-js loads, the wrapper is used', typeof pre === 'function');
  if (pre) pre({ afterVerification: () => {} });
  ok('  and the call is queued rather than lost', queued !== null);

  // A refusal Clerk raises for a REAL reason must not be swallowed by trying
  // the next candidate — only "is not a function" means "wrong name".
  const angry = {
    clerkjs: { __internal_openReverification() { throw new Error('no session'); } },
    __experimental_openUserVerification() { throw new Error('should not be reached'); },
  };
  let real = null;
  try { reverificationOpener(angry)({}); } catch (e) { real = e; }
  ok('a real refusal is not retried against another name', real?.message === 'no session', String(real));
}

// ═══ run it, prove it is you, run it again ══════════════════════════
console.log('\n=== the one implementation of getting past the wall ===');
{
  const stepUp = () => Object.assign(new Error('clerk'), {
    errors: [{ code: 'session_step_up_verification_required', longMessage: 'Prove it is you.' }],
  });
  const clerk = (onOpen) => ({
    clerkjs: { __internal_openReverification: onOpen },
  });

  // The happy path: refused, verified, run again, and ONLY once more.
  {
    let calls = 0;
    const got = await withReverification(
      clerk((p) => p.afterVerification()),
      async () => { calls++; if (calls === 1) throw stepUp(); return 'done'; },
    );
    ok('it retries after verification', got === 'done');
    ok('  exactly twice, never in a loop', calls === 2, String(calls));
  }

  // Still refused after verifying: the person reads the refusal.
  {
    let calls = 0;
    let out = null;
    try {
      await withReverification(clerk((p) => p.afterVerification()), async () => { calls++; throw stepUp(); });
    } catch (e) { out = e; }
    ok('a still-refused operation is not retried again', calls === 2, String(calls));
    ok('  and the refusal is what comes back', needsReverification(out));
  }

  // Cancelled.
  {
    let out = null;
    try {
      await withReverification(clerk((p) => p.afterVerificationCancelled()), async () => { throw stepUp(); });
    } catch (e) { out = e; }
    ok('cancelling raises the cancellation', out instanceof ReverifyCancelled);
  }

  // Clerk calling back twice must not settle twice, which is what left a
  // button spinning for ever in the copy that had no guard.
  {
    let calls = 0;
    const both = clerk((p) => { p.afterVerification(); p.afterVerificationCancelled(); });
    const got = await withReverification(both, async () => { calls++; if (calls === 1) throw stepUp(); return 'ok'; });
    ok('a double callback settles once', got === 'ok');
  }

  // A failure that is not a reverification wall passes straight through.
  {
    let out = null;
    try {
      await withReverification(clerk(() => {}), async () => { throw Object.assign(new Error('x'), { errors: [{ code: 'form_identifier_exists' }] }); });
    } catch (e) { out = e; }
    ok('an ordinary refusal is untouched', out?.errors?.[0]?.code === 'form_identifier_exists');
  }

  // No opener anywhere: the original refusal, not a hang and not a new error.
  {
    let out = null;
    try {
      await withReverification({ signOut() {} }, async () => { throw stepUp(); });
    } catch (e) { out = e; }
    ok('with no opener the refusal itself comes back', needsReverification(out));
  }

  // Every opener in reach throws the forwarding TypeError: still not a hang.
  {
    const broken = { __experimental_openUserVerification() { throw new TypeError('x is not a function'); } };
    let out = null;
    try {
      await withReverification(broken, async () => { throw stepUp(); });
    } catch (e) { out = e; }
    ok('a box that cannot open gives back the refusal', needsReverification(out));
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
