// test/paste.test.mjs — PASTING A SCREENSHOT INTO SOCRIA (lib/paste.ts, the composer, the start box).
//
// A screenshot on the clipboard is attached as if it had been dropped, wherever the browser put
// it (items or files, or both); it is named for when it was pasted; a copied paragraph that
// carries a picture of itself (Word, Docs) stays text; a file copied in Finder is a file.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as P from './.tmp/paste.mjs';

const read = (f) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', f), 'utf8');
let pass = 0;
let fail = 0;
const ok = (name, cond, info) => {
  if (cond) pass++;
  else fail++;
  console.log(`${cond ? '  ok  ' : '  FAIL'} ${name}${!cond && info !== undefined ? `  — ${typeof info === 'string' ? info : JSON.stringify(info)}` : ''}`);
};

const png = (name = 'image.png', bytes = 10) => new File([new Uint8Array(bytes)], name, { type: 'image/png' });
const item = (f) => ({ kind: 'file', type: f.type, getAsFile: () => f });
const at = new Date(2026, 10, 3, 14, 5, 32);

console.log('\n=== finding what was pasted ===');
{
  const shot = png();
  const a = P.pastedFiles({ items: [item(shot)], files: [] }, { at });
  ok('Chrome: a screenshot in items', a.length === 1 && a[0].type === 'image/png');
  const b = P.pastedFiles({ items: [], files: [shot] }, { at });
  ok('Safari / Firefox: a screenshot in files', b.length === 1);
  const c = P.pastedFiles({ items: [item(shot)], files: [shot] }, { at });
  ok('listed in both: taken once', c.length === 1, c.length);
  ok('a text item is not a file', P.pastedFiles({ items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }], files: [] }).length === 0);
  ok('nothing on the clipboard: nothing', P.pastedFiles(null).length === 0 && P.pastedFiles({}).length === 0);
  const doc = new File(['x'], 'notes.pdf', { type: 'application/pdf' });
  ok('a copied PDF comes too', P.pastedFiles({ files: [doc] }).length === 1);
  ok('…unless only pictures are wanted', P.pastedFiles({ files: [doc, shot] }, { imagesOnly: true }).length === 1);
}

console.log('\n=== naming it ===');
{
  const [one] = P.pastedFiles({ files: [png()] }, { at });
  ok('"image.png" becomes the time it was pasted', one.name === 'Screenshot 14.05.32.png', one.name);
  const two = P.pastedFiles({ files: [png('image.png', 10), png('image.png', 20)] }, { at });
  ok('two at once are told apart', two[0].name === 'Screenshot 14.05.32.png' && two[1].name === 'Screenshot 14.05.32 (2).png', two.map((f) => f.name));
  const jpg = P.pastedFiles({ files: [new File([new Uint8Array(3)], '', { type: 'image/jpeg' })] }, { at });
  ok('no name at all: named, with the right extension', jpg[0].name === 'Screenshot 14.05.32.jpg', jpg[0].name);
  const kept = P.pastedFiles({ files: [png('Bridge diagram.png')] }, { at });
  ok('a real name is kept', kept[0].name === 'Bridge diagram.png');
  ok('the picture is unchanged', one.size === 10 && one.type === 'image/png');
  for (const g of ['image.png', 'blob', 'image', 'Pasted image.png', 'untitled.jpg']) ok(`"${g}" says nothing`, P.isGenericName(g));
  for (const g of ['Screenshot 2026-11-03.png', 'notes.png']) ok(`"${g}" says something`, !P.isGenericName(g));
}

console.log('\n=== a picture, or the text it came with ===');
{
  const shot = [png()];
  ok('a screenshot alone is a picture', P.pasteIsFiles('', shot));
  ok('"Copy image" from a browser (no text) is a picture', P.pasteIsFiles(null, shot));
  ok('a paragraph from Word that carries a picture of itself stays text', !P.pasteIsFiles('The press caused the Reformation.', shot));
  ok('a file copied in Finder (its name as the text) is a file', P.pasteIsFiles('notes.png', [png('notes.png')]));
  ok('…with its path, on Windows', P.pasteIsFiles('C:\\Users\\a\\notes.png', [png('notes.png')]));
  ok('two copied files, one name per line', P.pasteIsFiles('a.png\nb.png', [png('a.png'), png('b.png')]));
  ok('no files: never', !P.pasteIsFiles('', []));
}

console.log('\n=== where it is wired ===');
{
  const comp = read('components/LogosComposer.tsx');
  ok('the chat composer attaches a pasted picture, as if dropped', /const files = pastedFiles\(e\.clipboardData\);\s*if \(pasteIsFiles\(e\.clipboardData\?\.getData\('text\/plain'\), files\)\) \{\s*e\.preventDefault\(\);\s*void takeFiles\(files\);/.test(comp));
  ok('…and one pasted with nothing focused, when the box is on screen', /document\.addEventListener\('paste', onDocPaste\)/.test(comp) && /isEditable\(document\.activeElement\)/.test(comp) && /offsetParent === null/.test(comp));
  const box = read('components/logos5/UniverseParts.tsx');
  ok('the Universal Map’s start box takes a pasted picture', /onPaste=\{\(e\) => \{[\s\S]{0,300}pastedFiles\(e\.clipboardData\)[\s\S]{0,200}void take\(pasted\)/.test(box));
  ok('…and one pasted on the map itself', /document\.addEventListener\('paste', onDocPaste\)/.test(box));
  ok('a long pasted paragraph still becomes a note', /text\.length > NOTE_THRESHOLD/.test(comp));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
