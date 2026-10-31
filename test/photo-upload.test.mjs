// A PHONE'S PHOTO, TAKEN HOWEVER IT COMES — and shown as a picture.
//
//   known       by what the browser calls it, by its name when it calls it
//               nothing (Files, Drive, a chat app), by its first bytes in the
//               end: JPEG as "image/jpg", ".jfif", no type at all; HEIC;
//               AVIF; a PDF called photo.jpg is not a photo
//   opened      the browser's own decoder first (right way up), then HEIC
//               converted here (heic-to, loaded only when needed); stepped
//               down by halves so a thumbnail stays sharp, never a step
//               larger than a phone's canvas
//   taken       every photo picker asks for "image/*"; the composer, Quick
//               capture, the context panel, Easy view, the profile picture
//               and the writing all take the same photos
//   shown       in a message a photo is a picture that opens large, with
//               what Socria read in it; in the box its chip says what is
//               happening (opening, converting from HEIC, reading)
//
// lib/image-kind.ts, lib/logos-upload.ts, components/LogosComposer.tsx,
// components/PhotoViewer.tsx, components/photos.css.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from './.tmp/image-kind.mjs';

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8');
let pass = 0,
  fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + String(x).slice(0, 400))));
const J = JSON.stringify;
const bytes = (...parts) => Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? [...p].map((c) => c.charCodeAt(0)) : p)));
const box = (major, ...compat) => bytes([0, 0, 0, 16 + 4 * compat.length], 'ftyp', major, [0, 0, 0, 0], ...compat);

console.log('=== known: by type, by name, by bytes ===');
const CASES = [
  [{ type: 'image/jpeg', name: 'IMG_2041.JPG' }, 'jpeg'],
  [{ type: 'image/jpg', name: 'photo' }, 'jpeg'],
  [{ type: 'image/pjpeg', name: 'scan' }, 'jpeg'],
  [{ type: '', name: 'IMG_2041.jpg' }, 'jpeg'],
  [{ type: '', name: 'download.jfif' }, 'jpeg'],
  [{ type: 'application/octet-stream', name: 'menu.JPEG' }, 'jpeg'],
  [{ type: 'image/heic', name: 'IMG_0007.HEIC' }, 'heic'],
  [{ type: 'image/heif', name: 'x' }, 'heic'],
  [{ type: '', name: 'IMG_0007.HEIC' }, 'heic'],
  [{ type: 'image/heic-sequence', name: 'live' }, 'heic'],
  [{ type: '', name: 'pic.hif' }, 'heic'],
  [{ type: 'image/avif', name: 'a' }, 'avif'],
  [{ type: 'image/png', name: 'Screenshot 2026-10-31.png' }, 'png'],
  [{ type: 'image/webp', name: 'w' }, 'webp'],
  [{ type: 'image/gif', name: 'g' }, 'gif'],
  [{ type: 'image/bmp', name: 'b' }, 'bmp'],
  [{ type: 'image/png; charset=binary', name: 'p' }, 'png'],
];
for (const [f, want] of CASES) ok(`${J(f)} is ${want}`, K.photoFormatOf(f) === want, K.photoFormatOf(f));
ok(
  'a type that names something else is believed: a PDF called photo.jpg is not a photo',
  K.photoFormatOf({ type: 'application/pdf', name: 'photo.jpg' }) === null && K.photoFormatOf({ type: 'text/plain', name: 'a.png' }) === null
);
ok(
  'nor is an image this cannot open: SVG, TIFF, RAW',
  [
    { type: 'image/svg+xml', name: 'a.svg' },
    { type: 'image/tiff', name: 'a.tif' },
    { type: '', name: 'IMG.DNG' },
    { type: '', name: 'notes' },
  ].every((f) => !K.isPhotoFile(f))
);
ok('isPhotoFile is photoFormatOf, said as yes or no', K.isPhotoFile({ type: '', name: 'x.heic' }) && !K.isPhotoFile({ type: '', name: 'x.pdf' }));

const SNIFF = [
  [bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0x10], 'JFIF'), 'jpeg'],
  [bytes([0xff, 0xd8, 0xff, 0xe1, 0, 0x10], 'Exif'), 'jpeg'],
  [bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]), 'png'],
  [bytes('GIF89a', [1, 0, 1, 0]), 'gif'],
  [bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '), 'webp'],
  [bytes('BM', [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), 'bmp'],
  [box('heic', 'mif1', 'heic'), 'heic'],
  [box('heix', 'mif1'), 'heic'],
  [box('mif1', 'heic', 'miaf'), 'heic'],
  [box('msf1', 'hevc'), 'heic'],
  [box('avif', 'mif1', 'miaf'), 'avif'],
  [box('mif1', 'avif', 'miaf'), 'avif'],
];
for (const [b, want] of SNIFF) ok(`bytes ${String.fromCharCode(...b.subarray(0, 12)).replace(/[^\x20-\x7e]/g, '.')} are ${want}`, K.sniffPhoto(b) === want, K.sniffPhoto(b));
ok(
  'not a photo by its bytes: a PDF, text, a video, nothing',
  [bytes('%PDF-1.4\n1 0 obj'), bytes('hello, world'), box('isom', 'mp41'), bytes([0xff, 0xd8]), new Uint8Array(0)].every((b) => K.sniffPhoto(b) === null)
);
ok('every kind has a word for the person', Object.keys(K.PHOTO_WORD).length === 7 && K.PHOTO_WORD.heic === 'HEIC');

console.log('\n=== opened: stepped down sharply, within a phone’s canvas ===');
ok(
  'fit within an edge: the long side, never larger than it was',
  J(K.fitWithin(4032, 3024, 1400)) === J([1400, 1050]) && J(K.fitWithin(3024, 4032, 720)) === J([540, 720]) && J(K.fitWithin(300, 200, 1400)) === J([300, 200])
);
ok('a small step is one draw: no halving', J(K.stepSizes(1400, 1050, 720, 540)) === J([]));
ok('a 12 MP photo to 1400: halved once on the way', J(K.stepSizes(4032, 3024, 1400, 1050)) === J([[2016, 1512]]));
ok('to a thumbnail: halved while still more than twice as big', J(K.stepSizes(720, 540, 220, 165)) === J([[360, 270]]));
{
  const steps = K.stepSizes(6000, 8000, 1050, 1400);
  ok('a 48 MP photo: every step drawn fits a phone’s canvas (16 million pixels)', steps.length >= 1 && steps.every(([w, h]) => w * h <= 16_000_000) && steps[steps.length - 1][0] <= 2100, J(steps));
}
ok(
  '  and a 108 MP one skips the steps that would not',
  K.stepSizes(12000, 9000, 1400, 1050).every(([w, h]) => w * h <= 16_000_000)
);

console.log('\n=== the pipeline: lib/logos-upload.ts ===');
const up = read('lib/logos-upload.ts');
ok(
  'the bytes decide: sniffed before anything is opened',
  /const format = sniffPhoto\(new Uint8Array\(await file\.slice\(0, 64\)\.arrayBuffer\(\)\)\)/.test(up) && /if \(!format\) throw new Error\(PHOTO_SAYS\.notPhoto\)/.test(up)
);
ok('opened from an object URL, not a base64 copy of the whole file', /URL\.createObjectURL\(blob\)/.test(up) && !/readAsDataURL/.test(up));
ok(
  'the browser first, the right way up; then a bitmap; then HEIC converted',
  /\(await viaElement\(file\)\.catch\(\(\) => null\)\) \?\? \(await viaBitmap\(file\)\.catch\(\(\) => null\)\)/.test(up) &&
    /imageOrientation: 'from-image'/.test(up) &&
    /if \(format !== 'heic'\) throw new Error\(PHOTO_SAYS\.cannotOpen\)/.test(up)
);
ok('  the HEIC decoder is loaded only when it is needed', /await import\('heic-to\/next'\)/.test(up) && !/^import .*heic-to/m.test(up));
ok('  and the person is told it is converting', /onConvert\?\.\(\)/.test(up));
ok('smoothed at high quality, on a white ground', /imageSmoothingQuality = 'high'/.test(up) && /fillStyle = '#fff'/.test(up));
ok(
  'three sizes: read once (1400), shown (720, within its budget), the chip (220)',
  /export const READ_MAX_EDGE = 1400/.test(up) &&
    /export const PREVIEW_MAX_EDGE = 720/.test(up) &&
    /export const PREVIEW_BUDGET_CHARS = 100_000/.test(up) &&
    /export const THUMB_MAX_EDGE = 220/.test(up)
);
ok(
  '  the shown size fits what a message keeps',
  Number(/PREVIEW_BUDGET_CHARS = ([\d_]+)/.exec(up)[1].replace(/_/g, '')) <= Number(/MAX_PREVIEW_CHARS = ([\d_]+)/.exec(read('lib/logos-attachments.ts'))[1].replace(/_/g, ''))
);
ok('a phone’s photo up to 30 MB is taken — it is made small before anything is sent', /export const MAX_IMAGE_BYTES = 30 \* 1024 \* 1024/.test(up) && /maxBytes = MAX_IMAGE_BYTES/.test(up));
ok('what goes wrong is said with what to do', /choose a JPEG, PNG, HEIC or WebP picture/.test(up) && /take a screenshot of it and send that/.test(up) && /Most Compatible/.test(up));
ok('one way to make any photo a JPEG, for places that keep the file (profile, writing)', /export async function toJpegBlob/.test(up) && /export async function photoAsJpeg/.test(up));
ok('heic-to is a pinned dependency', /"heic-to": "1\.6\.7"/.test(read('package.json')));

console.log('\n=== taken everywhere: "image/*" ===');
const PICKERS = {
  'components/LogosComposer.tsx': /const DOC_ACCEPT = \[IMAGE_ACCEPT, /,
  'components/CaptureInbox.tsx': /accept=\{IMAGE_ACCEPT\}/,
  'components/ContextPanel.tsx': /accept=\{`\$\{IMAGE_ACCEPT\},text\/plain/,
  'components/logos5/EasyCapture.tsx': /accept=\{IMAGE_ACCEPT\}/,
  'components/account/ProfilePanel.tsx': /accept=\{IMAGE_ACCEPT\}/,
  'components/write/WriteSpace.tsx': /accept=\{IMAGE_ACCEPT\}/,
};
for (const [f, re] of Object.entries(PICKERS)) ok(`${f}: asks for every photo`, re.test(read(f)) && !/accept="image\/png,image\/jpeg/.test(read(f)));
ok('the composer without documents asks for photos and text', /const PLAIN_ACCEPT = `\$\{IMAGE_ACCEPT\},text\/plain/.test(read('components/LogosComposer.tsx')));
ok('the profile picture: a HEIC, a typeless or too large photo is made a JPEG first', /photoAsJpeg\(f, AVATAR_EDGE\)/.test(read('components/account/ProfilePanel.tsx')));
ok(
  'the writing: a HEIC (or AVIF, BMP) is made a JPEG, then kept like any picture',
  /if \(sniffPhoto\(bytes\.subarray\(0, 64\)\)\) return prepare\(await toJpegBlob\(input, MAX_EDGE\)\)/.test(read('components/write/media-client.ts'))
);
{
  const up2 = read('lib/logos-upload.ts');
  ok(
    'a file that says nothing about itself (no type, no extension) is asked by its bytes',
    /export async function isPhotoByBytes/.test(up2) && /export const saysNothing = \(f: \{ type\?: string \}\) => !f\.type \|\| f\.type === 'application\/octet-stream'/.test(up2)
  );
  for (const f of ['components/LogosComposer.tsx', 'components/CaptureInbox.tsx', 'components/logos5/EasyCapture.tsx', 'components/ContextPanel.tsx'])
    ok(`  ${f}: asks the bytes when the file says nothing`, /saysNothing\(\w+\)[^\n]*isPhotoByBytes\(\w+\)/.test(read(f)));
}
ok(
  'Quick capture waits for a photo still opening before it saves',
  /const photoBusy = photo\?\.status === 'opening' \|\| photo\?\.status === 'converting' \|\| photo\?\.status === 'reading'/.test(read('components/CaptureInbox.tsx'))
);
ok('the server’s list is unchanged: HEIC never reaches it, it is converted first', !/heic/.test(/IMAGE_EXTENSIONS = \[[^\]]*\]/.exec(read('lib/file-kinds.ts'))[0]));

console.log('\n=== shown: a picture in the message, opened large ===');
const comp = read('components/LogosComposer.tsx');
ok(
  'the chip is there at once, saying it is opening — then converting, then reading',
  /addDraft\(\{ id, kind: 'image', name: file\.name \|\| 'Photo', status: 'reading', phase: 'opening' \}\)/.test(comp) &&
    /onConvert: \(\) => patch\(\{ phase: 'converting' \}\)/.test(comp) &&
    /'converting from HEIC…'/.test(comp) &&
    /'Converting the HEIC photo…'/.test(comp)
);
ok(
  'the picture to show goes with the message',
  /patch\(\{ name: prepared\.name, thumb: prepared\.thumb, \.\.\.\(prepared\.preview \? \{ preview: prepared\.preview \} : \{\}\), phase: undefined \}\)/.test(comp)
);
ok('  and the stage is not sent with it', (read('components/LogosApp.tsx').match(/phase: _p, \.\.\.rest/g) ?? []).length === 3);
ok('a photo that cannot be opened leaves no empty chip, and says why', /setDrafts\(\(prev\) => prev\.filter\(\(d\) => d\.id !== id\)\);\s*setNotice\(e\?\.message/.test(comp));
ok(
  'in a message: a picture that opens large; in the box: a chip whose thumbnail opens it',
  /className=\{`lg-pic\$\{a\.preview \? '' : ' is-small'\}`\}/.test(comp) && /className="lg-pic-open"/.test(comp) && /className="lg-att-look"/.test(comp) && /<PhotoViewer src=\{openSrc\}/.test(comp)
);
const viewer = read('components/PhotoViewer.tsx');
ok(
  'opened large: a dialog named by the photo, a close button, Escape, the ground around it',
  /role="dialog" aria-modal="true" aria-label=\{name\}/.test(viewer) &&
    /aria-label="Close"/.test(viewer) &&
    /e\.key !== 'Escape'/.test(viewer) &&
    /e\.target === e\.currentTarget && onClose\(\)/.test(viewer)
);
ok('  full size on a press, to pan across small print; what Socria read, a press away', /aria-pressed=\{full\}/.test(viewer) && /What Socria read in it/.test(viewer));
ok('  the focus goes back where it was, and a reply streaming in does not take it', /back\?\.focus\?\.\(\)/.test(viewer) && /closing\.current = onClose/.test(viewer) && /\}, \[\]\);/.test(viewer));
const css = read('components/photos.css');
ok(
  'the brand book: hairline, the whole frame (never cropped), lifted 2px under a pointer, no gradient',
  /\.lg-pic-open \{[\s\S]*?border: 1px solid var\(--lg-line\)/.test(css) && !/object-fit: cover/.test(css) && /@media \(hover: hover\)[\s\S]*?translateY\(-2px\)/.test(css) && !/gradient/.test(css)
);
ok(
  '  opened on ink, paper words, the name in the serif; still for reduced motion',
  /rgba\(32, 32, 27, 0\.94\)/.test(css) && /color: #f4f1e8/.test(css) && /\.pv-name \{[\s\S]*?var\(--serif/.test(css) && /prefers-reduced-motion: reduce/.test(css)
);
ok(
  '  a 44px close button, and the phone’s notch and home bar left clear',
  /\.pv-x \{[\s\S]*?width: 44px;\s*height: 44px/.test(css) && /safe-area-inset-top/.test(css) && /safe-area-inset-bottom/.test(css)
);

console.log(`\nphoto-upload: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
