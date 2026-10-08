// Large uploads (Socria One, up to 30 MB) go around the server through
// private storage. The rules that keep that safe: a path belongs to one
// person and says so without saying who; only the owner may have it read;
// nothing stays — read files are deleted, unread ones swept within the hour
// — and the routes are wired to do exactly that.
import { readFileSync } from 'node:fs';
import { ownerPrefix, uploadPath, ownsUploadPath, safeFileName, uploadMadeAt, UPLOAD_TTL_MS } from './.tmp/upload-paths.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));
const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

console.log('=== a path is one person’s, and does not say who ===');
{
  const p = uploadPath('user_abc123', 'Lecture 3 — notes.pdf', 1760000000000, 'a1b2c3d4e5f6');
  ok('the account id is not in the path', !p.includes('user_abc123'), p);
  ok('the owner’s digest leads it', p.startsWith(ownerPrefix('user_abc123') + '/'));
  ok('the owner may have it read', ownsUploadPath('user_abc123', p));
  ok('no one else may', !ownsUploadPath('user_other', p));
  ok('a path walking out of its folder is refused', !ownsUploadPath('user_abc123', `${ownerPrefix('user_abc123')}/1760000000000-a1b2c3d4e5f6/../x.pdf`) && !ownsUploadPath('user_abc123', `${ownerPrefix('user_abc123')}/../../etc/passwd`));
  ok('nor anything not shaped like ours', !ownsUploadPath('user_abc123', `${ownerPrefix('user_abc123')}/x/y.pdf`) && !ownsUploadPath('user_abc123', 42));
  ok('file names lose slashes and control characters', safeFileName('../a/b\u0000.pdf') === 'ab.pdf' && safeFileName('') === 'file');
  ok('the folder says when it was made', uploadMadeAt('1760000000000-a1b2c3d4e5f6') === 1760000000000 && uploadMadeAt('nope') === null);
  ok('an unread upload lives at most an hour', UPLOAD_TTL_MS === 3600000);
}

console.log('=== the routes do what they say ===');
{
  const up = read('app/api/files/upload/route.ts');
  ok('signed uploads need an account', /if \(!userId\) return NextResponse\.json\(\{ error: 'Sign in to attach files\.' \}, \{ status: 401 \}\)/.test(up));
  ok('  and the plan’s limit, read from the plan table', /limitsFor\(plan\)\.uploadBytes/.test(up) && /resolvePlanForRequest\(req, userId\)/.test(up));
  ok('  and are only for files too big to send directly', /size <= DIRECT_UPLOAD_BYTES/.test(up));
  ok('  at a path made for that person', /uploadPath\(userId, name\)/.test(up));
  const rd = read('app/api/files/read/route.ts');
  ok('reading from storage checks the path is the caller’s', /if \(!ownsUploadPath\(userId, path\)\)/.test(rd));
  ok('  checks the size against the plan again', /buf\.length > limit/.test(rd));
  ok('  and deletes the file however the read went', /finally \{\s*await removeUpload\(path as string\);\s*\}/.test(rd));
  ok('direct sends stay capped at what a request can carry', /declared > DIRECT_UPLOAD_BYTES \+ 64 \* 1024/.test(rd) && /file\.size > DIRECT_UPLOAD_BYTES/.test(rd));
  const store = read('lib/upload-store.ts');
  ok('the bucket is private, and its own ceiling is the plan’s limit', /createBucket\(UPLOAD_BUCKET, \{ public: false, fileSizeLimit: limitsFor\('one'\)\.uploadBytes \}\)/.test(store));
  ok('the daily cron sweeps unread uploads', /await sweepStaleUploads\(\);/.test(read('app/api/cron/lifecycle/route.ts')));
  ok('account deletion removes a person’s uploads', /await purgeUploads\(userId\);/.test(read('app/api/account/delete/route.ts')));
  const client = read('components/ChatAttachments.tsx');
  ok('the browser sends large files to storage, small ones directly', /if \(file\.size > DIRECT_UPLOAD_BYTES\)/.test(client) && /fetch\('\/api\/files\/upload'/.test(client) && /method: 'PUT'/.test(client));
  ok('  and refuses past the plan’s limit, saying what One allows', /Socria One reads documents up to/.test(client));
  ok('the chat page passes the plan’s limit', /uploadLimit: \(\) => limitsFor\(planState\.plan === 'one' \? 'one' : 'free'\)\.uploadBytes/.test(read('app/chat/page.tsx')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
