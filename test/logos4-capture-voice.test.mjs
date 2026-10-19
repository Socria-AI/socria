// LOGOS 4 — QUICK CAPTURE AND VOICE TO TEXT, through the real routes.
//
// Only the database (fake-supabase), Clerk (fake-clerk) and OpenAI's
// transcription endpoint (a fake fetch) are replaced. The routes, the store
// and the cleaners are the code that ships.
//
// What is held down:
//   Quick Capture — signed in only; each person sees only their own inbox;
//   a capture is cleaned by the composer's own sanitiser; a retried save or a
//   device moving its captures twice never duplicates; edits and deletes touch
//   only the owner's row; the inbox has a ceiling; a database without the
//   table is reported as "unavailable", not as an error.
//   Voice — the mic is offered only with a key and the flag on; a signed-out
//   caller without a key is refused; audio that is not audio, too large or
//   empty is refused before any paid call; a provider that rejects the model
//   name falls back to whisper-1; the words come back cleaned; nothing is
//   stored.

import { build } from 'esbuild';
import { mkdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve as res } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(here, '.tmp', 'e2e-logos4-cv');
const FAKE_DB = join(here, 'helpers', 'fake-supabase.mjs');

const ROUTES = {
  captures: 'app/api/captures/route.ts',
  transcribe: 'app/api/transcribe/route.ts',
  voice: 'lib/logos4/voice.ts',
  cap: 'lib/logos4/captures.ts',
};

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const swap = {
  name: 'swap',
  setup(b) {
    b.onResolve({ filter: /(^|\/)supabase$/ }, (a) => {
      const p = a.path.startsWith('@/') ? join(root, a.path.slice(2)) : res(a.resolveDir, a.path);
      if (p === join(root, 'lib', 'supabase')) return { path: pathToFileURL(FAKE_DB).href, external: true };
      return undefined;
    });
    b.onResolve({ filter: /^@clerk\/nextjs\/server$/ }, () => ({ path: pathToFileURL(join(here, 'helpers', 'fake-clerk.mjs')).href, external: true }));
    b.onResolve({ filter: /^server-only$/ }, () => ({ path: join(here, 'helpers', 'server-only-shim.mjs') }));
    b.onResolve({ filter: /^next\/(server|headers)$/ }, (a) => ({ path: `${a.path}.js`, external: true }));
  },
};
await build({
  entryPoints: Object.fromEntries(Object.entries(ROUTES).map(([k, p]) => [k, join(root, p)])),
  bundle: true,
  format: 'esm',
  platform: 'node',
  outdir: OUT,
  outExtension: { '.js': '.mjs' },
  tsconfig: join(root, 'tsconfig.json'),
  plugins: [swap],
  external: ['next', 'next/*', 'undici', '@supabase/*'],
  logLevel: 'error',
});

console.error = ((orig) => (...a) => (/^\[(captures|transcribe)\]/.test(String(a[0])) ? undefined : orig(...a)))(console.error.bind(console));
process.env.RATE_LIMIT_DISABLED = '1';

const R = {};
for (const k of Object.keys(ROUTES)) R[k] = await import(pathToFileURL(join(OUT, `${k}.mjs`)).href);
const { db } = await import(pathToFileURL(FAKE_DB).href);
const { NextRequest } = await import('next/server.js');

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;
const req = (method, body) =>
  new NextRequest('https://socria.test/api/captures', { method, headers: { 'content-type': 'application/json' }, ...(body === undefined ? {} : { body: J(body) }) });
const as = (uid) => (globalThis.__uid = uid);
const call = async (method, body) => {
  const r = await R.captures[method](req(method, body));
  return { status: r.status, j: await r.json() };
};

// ── Quick Capture ───────────────────────────────────────────────────────
console.log('\n=== Quick Capture: who may use the inbox ===');
as(null);
{
  const r = await call('GET');
  ok('signed out → 401 (the inbox lives on the device)', r.status === 401, J(r));
}

console.log('\n=== Quick Capture: keep, list, clean ===');
as('user_a');
const id1 = R.cap.newCaptureId();
const id2 = R.cap.newCaptureId() + 'b';
{
  const r = await call('POST', { captures: [{ id: id1, text: '  idea:\u0007 pricing tiers\r\n\r\n\r\n\r\nfor students  ', createdAt: 1_700_000_000_000 }] });
  ok('a typed capture is kept', r.status === 200 && r.j.added?.[0] === id1, J(r));
  const row = db.rows('captures').find((x) => x.id === id1);
  ok('stored under its owner', row?.user_id === 'user_a');
  ok('control characters gone, blank lines collapsed, ends trimmed', row?.text === 'idea: pricing tiers\n\nfor students', J(row?.text));
}
{
  const r = await call('POST', { captures: [{ id: id2, text: '', attachment: { kind: 'image', name: 'board.jpg', reading: 'A whiteboard: supply and demand curves crossing at P=4.', thumb: 'data:image/jpeg;base64,AAAA', preview: 'data:image/jpeg;base64,BBBB' } }] });
  ok('a photo-only capture is kept', r.status === 200, J(r));
  const row = db.rows('captures').find((x) => x.id === id2);
  ok('the photo keeps its reading and thumbnail', row?.attachment?.reading?.startsWith('A whiteboard') && row?.attachment?.thumb === 'data:image/jpeg;base64,AAAA', J(row?.attachment));
  ok('the larger preview is not kept', row?.attachment && !('preview' in row.attachment));
}
{
  const r = await call('POST', { captures: [{ id: R.cap.newCaptureId(), attachment: { kind: 'image', thumb: 'https://evil.example/x.png' } }] });
  ok('a remote image URL is not a photo → nothing to keep', r.status === 400, J(r));
  const r2 = await call('POST', { captures: [{ id: 'not-an-id', text: 'hi' }] });
  ok('an id that is not a capture id is refused', r2.status === 400, J(r2));
  const r3 = await call('POST', { captures: [] });
  ok('an empty batch is refused', r3.status === 400);
  const r4 = await call('POST', { captures: Array.from({ length: 51 }, () => ({ id: R.cap.newCaptureId(), text: 'x' })) });
  ok('a batch over 50 is refused', r4.status === 413);
}
{
  const before = db.rows('captures').length;
  const r = await call('POST', { captures: [{ id: id1, text: 'a retried save with other words' }] });
  ok('a retried save adds nothing', r.status === 200 && r.j.added.length === 0 && db.rows('captures').length === before, J(r));
  ok('…and overwrites nothing', db.rows('captures').find((x) => x.id === id1).text.startsWith('idea: pricing'));
}
{
  const r = await call('GET');
  ok('the inbox lists both, newest first', r.status === 200 && r.j.captures.length === 2 && r.j.captures[0].id === id2, J(r.j.captures?.map((c) => c.id)));
  ok('…as the client shape (createdAt, not created_at)', typeof r.j.captures[1].createdAt === 'number' && !('user_id' in r.j.captures[1]));
}

console.log('\n=== Quick Capture: one person never sees or touches another’s ===');
as('user_b');
{
  const r = await call('GET');
  ok('another person’s inbox is empty', r.status === 200 && r.j.captures.length === 0, J(r));
  const e = await call('PATCH', { id: id1, text: 'hijacked' });
  ok('editing someone else’s capture → not found', e.status === 404, J(e));
  const d = await call('DELETE', { id: id1 });
  ok('deleting someone else’s capture changes nothing', d.status === 200 && !!db.rows('captures').find((x) => x.id === id1));
  const p = await call('POST', { captures: [{ id: id1, text: 'same id, other person' }] });
  ok('reusing someone else’s id cannot overwrite their capture', db.rows('captures').find((x) => x.id === id1).user_id === 'user_a' && db.rows('captures').find((x) => x.id === id1).text.startsWith('idea'), J(p));
}

console.log('\n=== Quick Capture: edit and delete ===');
as('user_a');
{
  const r = await call('PATCH', { id: id1, text: 'pricing tiers: students free, then $8' });
  ok('the owner edits a capture', r.status === 200 && r.j.capture.text === 'pricing tiers: students free, then $8', J(r));
  ok('…its updatedAt moves, its createdAt does not', r.j.capture.updatedAt >= r.j.capture.createdAt && r.j.capture.createdAt === 1_700_000_000_000, J(r.j.capture));
  const empty = await call('PATCH', { id: id1, text: '   ' });
  ok('emptying a capture with no photo is refused (delete it instead)', empty.status === 400, J(empty));
  const photoText = await call('PATCH', { id: id2, text: 'Econ lecture 4', attachment: db.rows('captures').find((x) => x.id === id2).attachment });
  ok('words can be added to a photo capture, keeping the photo', photoText.status === 200 && photoText.j.capture.attachment?.kind === 'image', J(photoText));
  const d = await call('DELETE', { id: id2 });
  ok('the owner deletes a capture', d.status === 200 && !db.rows('captures').find((x) => x.id === id2));
}

console.log('\n=== Quick Capture: the ceiling ===');
{
  db.tables.captures = db.rows('captures').concat(Array.from({ length: 199 }, (_, i) => ({ id: `cp_fill${String(i).padStart(4, '0')}x`, user_id: 'user_a', text: 'x', attachment: null, created_at: 1, updated_at: 1 })));
  const r = await call('POST', { captures: [{ id: R.cap.newCaptureId(), text: 'one too many' }] });
  ok('a full inbox (200) refuses another, with how to make room', r.status === 409 && /Delete a few/.test(r.j.error), J(r));
  db.tables.captures = db.rows('captures').filter((x) => !x.id.startsWith('cp_fill'));
}

console.log('\n=== Quick Capture: a database without the table ===');
{
  db.absent.add('captures');
  const r = await call('GET');
  ok('GET says unavailable (the inbox falls back to the device), not 500', r.status === 200 && r.j.unavailable === true && r.j.captures.length === 0, J(r));
  const p = await call('POST', { captures: [{ id: R.cap.newCaptureId(), text: 'x' }] });
  ok('POST reports 503 unavailable, with a plain reason', p.status === 503 && p.j.code === 'unavailable', J(p));
  db.absent.delete('captures');
}

console.log('\n=== Quick Capture: the browser’s side ===');
{
  const store = new Map();
  const ls = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v) };
  const c = R.cap.cleanCapture({ id: R.cap.newCaptureId(), text: 'on the bus: ask about the midterm' });
  ok('written to this browser', R.cap.writeLocalCaptures(ls, [c]) === true);
  ok('read back as written', R.cap.readLocalCaptures(ls)[0]?.text === 'on the bus: ask about the midterm');
  store.set(R.cap.LOCAL_CAPTURES_KEY, '{broken');
  ok('a corrupted store reads as empty, not a crash', R.cap.readLocalCaptures(ls).length === 0);
  const full = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
  ok('a full storage is reported (false), not hidden', R.cap.writeLocalCaptures(full, [c]) === false);
  const long = R.cap.cleanCapture({ id: R.cap.newCaptureId(), text: 'word '.repeat(400) });
  const fc = R.cap.forComposer(long);
  ok('a long capture goes to the composer as a note chip, the box left free', fc.text === '' && fc.attachments[0]?.kind === 'note', J(fc).slice(0, 120));
  const short = R.cap.forComposer(c);
  ok('a short one goes into the box as words', short.text === c.text && short.attachments.length === 0);
  ok('as a map card it is its first line', R.cap.forNode(R.cap.cleanCapture({ id: R.cap.newCaptureId(), text: 'Title line\nmore' })) === 'Title line');
}

// ── Voice to Text ───────────────────────────────────────────────────────
console.log('\n=== Voice: pure parts ===');
{
  const V = R.voice;
  ok('recorder type: first supported wins', V.pickRecorderType((t) => t === 'audio/mp4') === 'audio/mp4');
  ok('recorder type: none supported → let the browser choose', V.pickRecorderType(() => false) === '' && V.pickRecorderType(undefined) === '');
  ok('extension from a typed mime with codecs', V.audioExtension('audio/webm;codecs=opus') === 'webm' && V.audioExtension('audio/mp4') === 'mp4');
  ok('not audio → no extension', V.audioExtension('image/png') === null && V.audioExtension('') === null);
  ok('refusal: wrong type 415', V.audioRefusal(5000, 'text/plain')?.status === 415);
  ok('refusal: over 4 MB 413', V.audioRefusal(V.MAX_AUDIO_BYTES + 1, 'audio/webm')?.status === 413);
  ok('refusal: nothing recorded 422', V.audioRefusal(10, 'audio/webm')?.status === 422);
  ok('a normal recording passes', V.audioRefusal(60_000, 'audio/webm') === null);
  ok('transcript cleaned', V.cleanTranscript('  so the\u0000 demand curve\r\n\r\n\r\nshifts  ') === 'so the demand curve\n\nshifts');
  ok('transcript of a non-string is empty', V.cleanTranscript({}) === '');
  const a = V.insertSpoken('Compare', 'supply and demand');
  ok('spoken words join with a space', a.text === 'Compare supply and demand' && a.caret === a.text.length, J(a));
  const b = V.insertSpoken('Why does . happen', 'the price drop', 9, 10);
  ok('spoken words replace the selection, spaced', b.text === 'Why does the price drop happen', J(b));
  const c = V.insertSpoken('', '  hello ');
  ok('into an empty box: just the words', c.text === 'hello' && c.caret === 5);
  const d = V.insertSpoken('end.', 'next', 0);
  ok('at the start: a space before what follows', d.text === 'next end.', J(d));
  ok('mic errors in plain words', /blocked/.test(V.micError({ name: 'NotAllowedError' })) && /No microphone/.test(V.micError({ name: 'NotFoundError' })) && /in use/.test(V.micError({ name: 'NotReadableError' })));
  ok('clock', V.clock(0) === '0:00' && V.clock(75.6) === '1:15' && V.clock(120) === '2:00');
}

console.log('\n=== Voice: the route ===');
const openai = { calls: [], reply: () => new Response(J({ text: '  Okay so the equilibrium price is four dollars.  ' }), { status: 200 }) };
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url === 'https://api.openai.com/v1/audio/transcriptions') {
    const form = init.body;
    openai.calls.push({ auth: init.headers?.Authorization, model: form.get('model'), file: form.get('file'), language: form.get('language') });
    return openai.reply(form.get('model'));
  }
  return realFetch(input, init);
};
const audio = (bytes = 9000, type = 'audio/webm;codecs=opus') => new Blob([new Uint8Array(bytes).fill(7)], { type });
const tReq = (blob, extra = {}) => {
  const f = new FormData();
  if (blob) f.append('audio', blob, 'speech');
  for (const [k, v] of Object.entries(extra)) f.append(k, v);
  return new NextRequest('https://socria.test/api/transcribe', { method: 'POST', body: f });
};
const T = async (blob, extra) => {
  const r = await R.transcribe.POST(tReq(blob, extra));
  return { status: r.status, j: await r.json() };
};
{
  delete process.env.OPENAI_API_KEY;
  const g = await (await R.transcribe.GET()).json();
  ok('no key → the mic is not offered', g.available === false, J(g));
  as('user_a');
  const r = await T(audio());
  ok('no key → POST 503, no provider call', r.status === 503 && openai.calls.length === 0, J(r));

  process.env.OPENAI_API_KEY = 'sk-test';
  ok('key set → offered', (await (await R.transcribe.GET()).json()).available === true);
  process.env.NEXT_PUBLIC_LOGOS4_VOICE = 'off';
  ok('flag off → not offered even with a key', (await (await R.transcribe.GET()).json()).available === false);
  delete process.env.NEXT_PUBLIC_LOGOS4_VOICE;

  as(null);
  const anon = await T(audio());
  ok('signed out, no access key → 401, no provider call', anon.status === 401 && openai.calls.length === 0, J(anon));

  as('user_a');
  const wrong = await T(audio(9000, 'text/plain'));
  ok('not audio → 415 before any paid call', wrong.status === 415 && openai.calls.length === 0, J(wrong));
  const tiny = await T(audio(100));
  ok('nothing recorded → 422 before any paid call', tiny.status === 422 && openai.calls.length === 0, J(tiny));
  const none = await T(null);
  ok('no audio field → 400', none.status === 400);

  const good = await T(audio(), { language: 'en-US' });
  ok('a recording comes back as words, trimmed', good.status === 200 && good.j.text === 'Okay so the equilibrium price is four dollars.', J(good));
  const c = openai.calls.at(-1);
  ok('sent with the server key, never one from the browser', c.auth === 'Bearer sk-test');
  ok('sent as a named audio file the provider recognises', c.file?.name === 'speech.webm', c.file?.name);
  ok('the default model is gpt-4o-mini-transcribe', c.model === 'gpt-4o-mini-transcribe', c.model);
  ok('a language hint is passed as two letters', c.language === 'en', c.language);
  ok('nothing about the audio is written to the database', !db.log.some(([, t]) => /audio|voice|transcri/.test(String(t))));

  openai.calls.length = 0;
  openai.reply = (model) => (model === 'whisper-1' ? new Response(J({ text: 'fallback words' }), { status: 200 }) : new Response(J({ error: { message: 'The model `gpt-4o-mini-transcribe` does not exist' } }), { status: 404 }));
  const fb = await T(audio());
  ok('a model name the account lacks falls back to whisper-1', fb.status === 200 && fb.j.text === 'fallback words' && openai.calls.map((x) => x.model).join() === 'gpt-4o-mini-transcribe,whisper-1', J({ fb, m: openai.calls.map((x) => x.model) }));

  openai.reply = () => new Response(J({ error: 'rate' }), { status: 429 });
  const busy = await T(audio());
  ok('provider busy → 502 with a retryable message', busy.status === 502 && /busy/i.test(busy.j.error), J(busy));
  openai.reply = () => new Response(J({ text: '   ' }), { status: 200 });
  const silent = await T(audio());
  ok('silence → 422 "no words were heard"', silent.status === 422 && /No words/.test(silent.j.error), J(silent));
  openai.reply = () => {
    throw Object.assign(new Error('timeout'), { name: 'TimeoutError' });
  };
  const down = await T(audio());
  ok('provider unreachable → 502, not a crash', down.status === 502, J(down));
}

globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
