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

import { classifyUpstream } from './.tmp/upstream-error.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const err = (o) => Object.assign(new Error(o.message ?? 'x'), o);

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
