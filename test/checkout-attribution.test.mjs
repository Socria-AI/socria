// Which moment led to a subscription — and only that.
//
// The trigger travels from the browser into Stripe's metadata and back out
// through the webhook into analytics. Two things have to be true of every
// value that makes the trip: it is one of a fixed set of short tokens, and it
// carries nothing about what the person was thinking. Both ends validate,
// because metadata is editable in the Stripe dashboard and the webhook feeds
// what it reads straight into event properties.

import {
  SURFACES,
  SOURCES,
  META_KEYS,
  readAttribution,
  attributionMetadata,
  attributionFromMetadata,
} from './.tmp/checkout-attribution.mjs';
import { TRIGGER_REASONS, TRIGGERS } from './.tmp/one-prompt.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== a known trigger is accepted, and implies its own category ===');
{
  for (const t of TRIGGER_REASONS) {
    const a = readAttribution({ trigger: t, surface: 'logos' });
    ok(`${t} survives`, a.trigger === t);
    ok(`${t} carries its category`, a.category === TRIGGERS[t].category);
    ok(`${t} carries its intent`, a.intent === TRIGGERS[t].intent);
  }
  for (const s of SURFACES) {
    ok(`surface ${s} survives`, readAttribution({ surface: s }).surface === s);
  }
  // First touch: the email kind or the Explore page that brought them back.
  for (const v of SOURCES) {
    ok(`source ${v} survives`, readAttribution({ source: v }).source === v);
  }
  ok('an unknown source is dropped', readAttribution({ source: 'utm_campaign=summer' }).source === undefined);
  const trip = attributionFromMetadata(attributionMetadata(readAttribution({ trigger: 'asked', surface: 'core', source: 'day-3' })));
  ok('source round-trips through metadata', trip.source === 'day-3' && trip.trigger === 'asked' && trip.surface === 'core');
}

console.log('\n=== nothing else gets through ===');
{
  const junk = [
    'explore-spent; DROP TABLE',
    'I was deciding whether to leave my partner',
    'EXPLORE-SPENT',
    ' explore-spent',
    '',
    42,
    null,
    undefined,
    {},
    [],
    true,
  ];
  for (const v of junk) {
    const a = readAttribution({ trigger: v, surface: v });
    ok(`${JSON.stringify(v) ?? String(v)} is dropped as a trigger`, a.trigger === undefined);
    ok(`...and as a surface`, a.surface === undefined);
    ok(`...and implies nothing`, a.category === undefined && a.intent === undefined);
  }
  // Category and intent are never read from the body, whatever it claims.
  const claimed = readAttribution({ trigger: 'asked', category: 'entitlement', intent: 'urgent' });
  ok('a claimed category is ignored', claimed.category === TRIGGERS.asked.category);
  ok('a claimed intent is ignored', claimed.intent === TRIGGERS.asked.intent);
  // And a body that is not an object is simply empty.
  for (const b of [null, undefined, 'explore-spent', 7, []]) {
    ok(`${JSON.stringify(b) ?? 'undefined'} body → empty`, Object.keys(readAttribution(b)).length === 0);
  }
}

console.log('\n=== the round trip through Stripe metadata ===');
{
  const a = readAttribution({ trigger: 'map-full', surface: 'logos' });
  const meta = attributionMetadata(a);
  ok('metadata is flat strings', Object.values(meta).every((v) => typeof v === 'string'));
  ok('keys are prefixed', Object.keys(meta).every((k) => k.startsWith('socria_')));
  ok('trigger key', meta[META_KEYS.trigger] === 'map-full');
  ok('surface key', meta[META_KEYS.surface] === 'logos');
  const back = attributionFromMetadata(meta);
  ok('trigger round-trips', back.trigger === 'map-full');
  ok('surface round-trips', back.surface === 'logos');
  ok('category is recomputed, not stored', back.category === TRIGGERS['map-full'].category);

  // Empty in, empty out — a checkout from the One page with no prompt behind
  // it must not invent a trigger.
  ok('no attribution → no metadata', Object.keys(attributionMetadata({})).length === 0);
  ok('no metadata → no attribution', Object.keys(attributionFromMetadata({})).length === 0);
  ok('null metadata → no attribution', Object.keys(attributionFromMetadata(null)).length === 0);

  // Edited in the dashboard: re-validated on the way back.
  const tampered = attributionFromMetadata({
    [META_KEYS.trigger]: 'whatever they typed',
    [META_KEYS.surface]: 'logos',
  });
  ok('a tampered trigger is dropped', tampered.trigger === undefined);
  ok('but the valid surface is kept', tampered.surface === 'logos');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
