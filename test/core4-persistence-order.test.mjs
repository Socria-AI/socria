// The memory write must be registered while the request still exists.
//
// THE PRODUCTION RISK, and it is the worst KIND of risk: it fails silently and
// invisibly. `after()` registers the Mind Graph write with waitUntil, and
// waitUntil needs the request context it is registered from. It was called
// AFTER controller.close() — registered against a response that had already
// finished. On Vercel that is documented as unreliable; when it drops, the
// reply is perfect, the next conversation knows nothing, and nothing in the
// log says why. "Memory is completely broken" and "memory works fine" produce
// identical traces.
//
// A source test rather than a behavioural one, deliberately: what is being
// asserted is an ORDERING inside a `finally` block on a streaming response,
// and reproducing Vercel's request-context lifetime in a unit test would test
// the mock rather than the code.

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = readFileSync(join(root, 'app/api/chat/route.ts'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));

console.log('=== the write is registered before the stream closes ===');
{
  // Scoped to core4Reply's own finally block: the file has other close()
  // calls, and comparing indexes across the whole file compares nothing.
  // Anchored on the writeback itself: the file has several finally blocks and
  // several close() calls, and comparing indexes across all of them compares
  // nothing.
  // Comments stripped first. The first version of this test failed against a
  // correct file, because the comment explaining the fix contains the words
  // "controller.close()" — prose about code is not code.
  const fin = src.indexOf('if (p) await finishTurn(');
  const tail = src.slice(fin, fin + 1800).split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
  const afterCall = tail.indexOf('x.after(reply)');
  const close = tail.indexOf('controller.close()');
  ok('x.after runs before controller.close', afterCall > 0 && close > 0 && afterCall < close, `after@${afterCall} close@${close}`);
  // And the turn's own writeback is still awaited before either.
  const finish = tail.indexOf('await finishTurn(');
  ok('the state writeback is awaited first', finish >= 0 && finish < afterCall, `${finish} vs ${afterCall}`);
}

console.log('\n=== a runtime without waitUntil still writes ===');
{
  ok('the registration is guarded', /try \{\s*waitUntil\(write\(\)\);\s*\} catch/.test(src));
  ok('  and falls back to writing inline', /writing memory inline[\s\S]{0,120}void write\(\)/.test(src));
  ok('  with one definition of the write, not two', (src.match(/remember\(userId,/g) ?? []).length === 1);
}

console.log('\n=== off the record still stops it ===');
{
  // The fix must not have widened what gets written.
  const after = src.slice(src.indexOf('after: (reply: string)'), src.indexOf('after: (reply: string)') + 1400);
  ok('signed out writes nothing', /if \(!userId\) return;/.test(after));
  ok('off the record writes nothing', /persistPolicy === 'none'\) return;/.test(after));
  ok('a sensitive conversation writes private', /persistPolicy === 'conversation_only' \? \{ private: true \}/.test(after));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
