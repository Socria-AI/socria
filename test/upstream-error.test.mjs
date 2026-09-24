// What a failure is allowed to say.
//
// Tobias Lasco reported that every chat errored before producing a word. He
// reloaded, started new conversations, signed out and back in, sent a
// screenshot, and offered — unprompted — to paste anything useful from the
// network tab. Then he pasted four responses, and not one of them could say
// what had gone wrong, because the only route that knew answered:
//
//     { "error": "Internal error" }
//
// An expired key, a model the account cannot reach, and the provider being
// down are three different problems with three different fixes, and that
// string is all three. So this suite is about two things: that the sentence
// somebody sees names something they can act on, and that nothing from the
// upstream error object rides along with it.

import { classifyUpstream, failureText, streamFailureNotice } from './.tmp/upstream-error.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const err = (o) => Object.assign(new Error(o.message ?? 'x'), o);

// The same three, once the reply has started streaming. Reported from dev:
// every message, including "hi", came back as "[Connection interrupted.
// Please try again.]" and nothing else — the generic line, one layer in.
// Reported from dev after the notice above shipped: "[Something went wrong on
// our side. (ref 5cgzr3)]" — the unclassified branch. A provider nobody can
// reach and a bug in our own code both landed there, and they have different
// fixes, which is the whole complaint this file started from.
console.log('=== the request that never arrived, and the bug that is ours ===');
{
  const undici = Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.openai.com'), { code: 'ENOTFOUND' }),
  });
  ok('"fetch failed" is read through its cause, not taken at face value', classifyUpstream(undici).code === 'upstream_unreachable', classifyUpstream(undici).code);
  ok('  and says the request never arrived', /never arrived/.test(streamFailureNotice('t', undici, false)));
  ok('  without leaking the host it could not resolve', !/openai/i.test(streamFailureNotice('t', undici, false)));
  const sdk = err({ name: 'APIConnectionError', message: 'Connection error.' });
  ok('the SDK\'s own connection error lands there too', classifyUpstream(sdk).code === 'upstream_unreachable');
  const refused = Object.assign(new TypeError('fetch failed'), { cause: err({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' }) });
  ok('a refused socket too', classifyUpstream(refused).code === 'upstream_unreachable');
  const slow = err({ name: 'APIConnectionTimeoutError', message: 'Request timed out.' });
  ok('a timeout is still a timeout, not unreachable', classifyUpstream(slow).code === 'upstream_timeout');
  const ours = new TypeError("Cannot read properties of null (reading 'decision')");
  const f = classifyUpstream(ours);
  ok('a bug in our code stays internal, but names its class', f.code === 'internal' && f.detail === 'TypeError', JSON.stringify(f));
  const notice = streamFailureNotice('t', ours, false);
  ok('  so the two no longer read the same', /\(TypeError\)/.test(notice) && !/never arrived/.test(notice), notice);
  ok('  and the message itself never rides along', !/Cannot read properties/.test(notice), notice);
  ok('a plain Error adds no class name', classifyUpstream(new Error('???')).detail === undefined);
  ok('a cause chain cannot loop forever', (() => { const a = err({ message: 'a' }); a.cause = a; return classifyUpstream(a).code === 'internal'; })());
}

console.log('=== a failure that lands after the headers ===');
{
  const auth = streamFailureNotice('t', err({ status: 401, message: 'Incorrect API key provided' }), false);
  ok('a bad key names authentication, not the connection', /authenticate with the model provider/.test(auth) && !/Connection interrupted/.test(auth), auth);
  ok('  and carries a reference to quote', /\(ref [a-z0-9]{6}\)/.test(auth), auth);
  const quota = streamFailureNotice('t', err({ status: 429, message: 'Rate limit reached' }), false);
  ok('quota is told apart from a bad key', /rate-limiting or has run out of quota/.test(quota), quota);
  const model = streamFailureNotice('t', err({ status: 404, message: 'The model `x` does not exist' }), false);
  ok('an unreachable model is told apart from both', /model .* is unavailable to this deployment/.test(model), model);
  ok('the three no longer read the same', new Set([auth, quota, model].map((s) => s.replace(/ref [a-z0-9]+/, ''))).size === 3);
  const mid = streamFailureNotice('t', err({ status: 500, message: 'upstream boom' }), true);
  ok('mid-reply, it says the reply stopped', /^\n\n\[The reply stopped here\./.test(mid), mid);
  ok('  and nothing from the error object rides along', !/boom/.test(mid) && !/500/.test(mid), mid);
  ok('an unclassifiable failure still says something', /Something went wrong on our side/.test(streamFailureNotice('t', new Error('???'), false)));
}

console.log('=== the three that used to look identical ===');
{
  const auth = classifyUpstream(err({ status: 401, message: 'Incorrect API key provided' }));
  ok('a bad key is an auth problem', auth.code === 'upstream_auth', auth.code);
  ok('...and says it is ours, not theirs', /our configuration|not anything you did/.test(auth.reason));

  const model = classifyUpstream(err({ status: 404, message: 'The model `gpt-5.6-sol` does not exist' }));
  ok('a missing model is a model problem', model.code === 'upstream_model', model.code);
  ok('...and also says it is ours', /our configuration/.test(model.reason));

  const down = classifyUpstream(err({ status: 503, message: 'upstream connect error' }));
  ok('a provider outage is its own thing', down.code === 'upstream_unavailable', down.code);
  ok('...and tells them to try again', /try again/i.test(down.reason));

  ok('and the three are actually distinguishable',
    new Set([auth.code, model.code, down.code]).size === 3);
  ok('...as are their sentences',
    new Set([auth.reason, model.reason, down.reason]).size === 3);
}

console.log('\n=== the rest of the fixed set ===');
{
  ok('429 is quota', classifyUpstream(err({ status: 429 })).code === 'upstream_quota');
  ok('"insufficient_quota" is quota too',
    classifyUpstream(err({ message: 'insufficient_quota' })).code === 'upstream_quota');
  ok('403 is auth, not model',
    classifyUpstream(err({ status: 403, message: 'forbidden' })).code === 'upstream_auth');
  ok('a timeout is a timeout',
    classifyUpstream(err({ message: 'Request timed out' })).code === 'upstream_timeout');
  ok('a reset socket is a timeout',
    classifyUpstream(err({ code: 'ECONNRESET' })).code === 'upstream_timeout');
  ok('an abort is a timeout',
    classifyUpstream(Object.assign(new Error('aborted'), { name: 'AbortError' })).code === 'upstream_timeout');
  ok('anything else is internal', classifyUpstream(err({ message: 'weird' })).code === 'internal');

  // Ordering: a 401 answers every request, so it must be read as auth even
  // when its message mentions a model.
  ok('auth is checked before model',
    classifyUpstream(err({ status: 401, message: 'no access to model x' })).code === 'upstream_auth');
}

console.log('\n=== the status the browser gets ===');
{
  // A 500 for an upstream failure is a lie about whose fault it is, and it is
  // what monitoring reads. These are gateway statuses.
  ok('auth answers 502', classifyUpstream(err({ status: 401 })).status === 502);
  ok('quota answers 503', classifyUpstream(err({ status: 429 })).status === 503);
  ok('a timeout answers 504', classifyUpstream(err({ message: 'timed out' })).status === 504);
  ok('only a genuine internal fault answers 500',
    classifyUpstream(err({ message: 'weird' })).status === 500);
}

console.log('\n=== nothing from the error object rides along ===');
{
  // THE RULE THIS FILE PROTECTS. An upstream error carries request bodies,
  // internal URLs and occasionally a key fragment echoed from a header.
  const nasty = err({
    status: 401,
    message: 'Incorrect API key provided: sk-proj-REALKEY123. Visit https://internal.example/keys',
    request: { headers: { authorization: 'Bearer sk-proj-REALKEY123' } },
  });
  const f = classifyUpstream(nasty);
  const sent = JSON.stringify({ error: f.reason, code: f.code, ref: f.ref });
  ok('no key fragment', !sent.includes('sk-proj'));
  ok('no internal url', !sent.includes('internal.example'));
  ok('no upstream message at all', !sent.includes('Incorrect API key'));
  ok('what IS sent is a sentence', f.reason.length > 30 && f.reason.endsWith('.'));
}

console.log('\n=== the reference ===');
{
  const a = classifyUpstream(err({ status: 500 }));
  const b = classifyUpstream(err({ status: 500 }));
  ok('six characters', /^[a-z0-9]{6}$/.test(a.ref), a.ref);
  ok('different each time', a.ref !== b.ref);
  // It is only worth anything because the same string goes to the log; that
  // pairing lives in reportUpstream, which is the only thing routes call.
}

console.log('\n=== junk is classified, never thrown on ===');
{
  for (const junk of [null, undefined, 42, {}, [], 'a string', new Error()]) {
    const f = classifyUpstream(junk);
    ok(`${JSON.stringify(junk) ?? typeof junk} classifies`, typeof f.code === 'string' && typeof f.ref === 'string');
  }
}


console.log('\n=== the reference reaches a human, or it was never worth minting ===');
{
  // THE OMISSION. classifyUpstream mints a ref and logs it; the client read
  // body.error and threw the rest away, so no user ever saw one.
  const f = classifyUpstream({ status: 401 });
  const shown = failureText({ error: f.reason, code: f.code, ref: f.ref });
  ok('the sentence survives', shown.includes(f.reason), shown);
  ok('and so does the reference', shown.includes(f.ref), shown);
  ok('the ref is readable, not buried', /\(ref [a-z0-9]{4,12}\)$/.test(shown), shown);

  // A body with no ref reads as a plain sentence — no empty brackets.
  ok('no ref, no brackets', failureText({ error: 'Nope.' }) === 'Nope.', failureText({ error: 'Nope.' }));
  ok('no trailing "(ref )"', !failureText({ error: 'Nope.', ref: '' }).includes('(ref'));
}

console.log('\n=== it runs inside a catch, so it may not throw ===');
{
  for (const junk of [null, undefined, 0, '', 'a string', [], true, () => {}, NaN]) {
    let threw = null, out;
    try { out = failureText(junk); } catch (e) { threw = e; }
    ok(`${typeof junk} does not throw`, threw === null, String(threw));
    ok(`${typeof junk} still yields a sentence`, typeof out === 'string' && out.length > 0, String(out));
  }
  ok('the default fallback is used', failureText(null) === 'Something went wrong.');
  ok('a caller may pass its own', failureText(null, 'Nope') === 'Nope');
}

console.log('\n=== nothing from a body is trusted into the UI unchecked ===');
{
  // `error` and `ref` arrive over the wire. They are rendered to a person, so
  // neither may be a channel for arbitrary text.
  const huge = failureText({ error: 'x'.repeat(5000) });
  ok('an absurd sentence falls back rather than rendering', huge === 'Something went wrong.', huge.slice(0, 40));

  for (const bad of ['<script>', 'a b', 'ref with spaces', '../../etc', 'x'.repeat(200), 'ABC123', '!!', 'a']) {
    const out = failureText({ error: 'Failed.', ref: bad });
    ok(`a ref of ${JSON.stringify(bad.slice(0, 16))} is not echoed`, out === 'Failed.', out);
  }
  // Non-string fields are ignored rather than stringified.
  ok('an object error is not [object Object]',
    failureText({ error: { a: 1 } }) === 'Something went wrong.',
    failureText({ error: { a: 1 } }));
  ok('a numeric ref is not echoed', failureText({ error: 'Failed.', ref: 123456 }) === 'Failed.');
  // The real shape still passes.
  ok('a genuine six-char ref is kept',
    failureText({ error: 'Failed.', ref: 'a1b2c3' }) === 'Failed. (ref a1b2c3)');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
