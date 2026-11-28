// test/browser/ux-v0/production-qa.mjs — production, in a real browser, with every export opened and checked.
//
// A small campaign is made (a story that moves, an A4 sheet, two product screens that lead to one another) and then
// taken out of SocriaUX every way it offers. Nothing is taken on trust: the ZIP is unpacked and its pictures
// measured, the print PDF's boxes are read and its bleed looked at pixel by pixel, the video is opened with ffprobe
// and its frames counted, a moment of the motion is checked against where the animation says the block should be,
// the prototype file is opened and clicked through. What the format asks of the design (a platform's cover, a
// sheet's margin, motion without a still) is checked to have been measured and said.
//
//   node test/browser/ux-v0/production-qa.mjs            (UXV0_OUT sets where files go; needs ffprobe and python3+PIL)
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { chromium, S, ROOT } from './env.mjs';

const require = createRequire(import.meta.url);
const JSZip = require('jszip');
const OUT = `${S}production-qa/`;
mkdirSync(OUT, { recursive: true });
const BUNDLE = `${OUT}bundle/`;
await build({ entryPoints: [join(ROOT, 'test/browser/ux-v0/design-harness/entry.tsx')], bundle: true, format: 'esm', platform: 'browser', outdir: BUNDLE, jsx: 'automatic', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.png': 'dataurl' }, logLevel: 'error' });

let pass = 0;
let fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok  ', n)) : (fail++, console.log('  FAIL', n, String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 600))));
const py = (code, ...args) => execFileSync('python3', ['-I', '-c', code, ...args], { encoding: 'utf8' }).trim();

const CAMPAIGN = `<say>One line, four places.</say>
<artboard id="new-1" name="Story" format="story" group="c" seconds="2">
<style>
.sx-root{background:#f5f3eb;color:#1f1f1f;font-family:'Inter',sans-serif}
@keyframes cross{from{transform:translateX(0)}to{transform:translateX(800px)}}
@keyframes arrive{from{opacity:0}to{opacity:1}}
.line{position:absolute;left:80px;top:120px;margin:0;font:400 96px/1 'Instrument Serif',serif}
.block{position:absolute;left:40px;top:900px;width:200px;height:200px;background:#354620;animation:cross 2s linear both}
.sub{position:absolute;left:80px;top:1250px;margin:0;font-size:44px;animation:arrive .5s ease-out 1s both}
</style>
<h1 class="line">Think for yourself.</h1>
<div class="block"></div>
<p class="sub">An AI that asks before it answers.</p>
</artboard>
<artboard id="new-2" name="Sheet" format="a4" group="c">
<style>
.sx-root{background:#f5f3eb;color:#1f1f1f;font-family:'Inter',sans-serif}
.band{position:absolute;left:0;top:0;width:100%;height:300px;background:#354620}
.edge{position:absolute;left:0;top:300px;width:120px;height:823px;background:#b8a26b}
.line{position:absolute;left:20px;top:420px;margin:0;font:400 72px/1 'Instrument Serif',serif}
.body{position:absolute;left:160px;top:640px;width:500px;margin:0;font-size:18px;line-height:1.5}
</style>
<div class="band"></div><div class="edge"></div>
<h1 class="line">Think for yourself.</h1>
<p class="body">Socria is a thinking environment, not an answer machine.</p>
</artboard>
<artboard id="new-3" name="Home" format="mobile-screen" group="p">
<style>.sx-root{background:#fff;color:#1f1f1f;font-family:'Inter',sans-serif}h2{margin:60px 24px 12px;font-size:28px}.open{display:block;margin:24px;padding:16px;border-radius:12px;background:#354620;color:#fff;font-size:17px;text-align:center}</style>
<h2>Today</h2><div class="open" data-go="new-4">Open the conversation</div>
</artboard>
<artboard id="new-4" name="Conversation" format="mobile-screen" group="p">
<style>.sx-root{background:#f5f3eb;color:#1f1f1f;font-family:'Inter',sans-serif}h2{margin:60px 24px 12px;font-size:28px}.back{margin:24px;color:#354620;font-size:17px}</style>
<div class="back" data-go="new-3">← Back</div><h2>What are you working on?</h2>
</artboard>`;

const requests = [];
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 950 }, acceptDownloads: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 300)));
page.on('console', (m) => m.type() === 'error' && !/Failed to load resource|favicon/.test(m.text()) && errors.push(`console: ${m.text().slice(0, 200)}`));
const ORIGIN = 'http://localhost:4998';
const cfg = { brief: 'A small campaign for Socria: “Think for yourself.”', kind: 'campaign', format: 'story', name: 'Think campaign' };
const html = `<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/entry.css"><script>window.__HARNESS__=${JSON.stringify(cfg)}</script></head><body><div id="root"></div><script type="module" src="/entry.js"></script></body></html>`;
await ctx.route(`${ORIGIN}/**`, async (route) => {
  const u = new URL(route.request().url());
  if (u.pathname === '/') return route.fulfill({ status: 200, contentType: 'text/html', body: html });
  if (u.pathname === '/entry.js') return route.fulfill({ status: 200, contentType: 'text/javascript', body: readFileSync(`${BUNDLE}entry.js`) });
  if (u.pathname === '/entry.css') return route.fulfill({ status: 200, contentType: 'text/css', body: existsSync(`${BUNDLE}entry.css`) ? readFileSync(`${BUNDLE}entry.css`) : '' });
  if (u.pathname === '/proto.html') return route.fulfill({ status: 200, contentType: 'text/html', body: readFileSync(`${OUT}prototype.html`) });
  if (u.pathname === '/api/ux-v0/design') {
    const body = JSON.parse(route.request().postData() ?? '{}');
    requests.push(body);
    const text = body.mode === 'look' ? '<say>Seen.</say><ok/>' : body.doc.artboards.length ? '<say>Noted.</say><ok/>' : CAMPAIGN;
    const lines = [{ type: 'accepted', op: 'x' }, ...text.match(/[\s\S]{1,400}/g).map((d) => ({ type: 'text', delta: d })), { type: 'result', status: 200, body: { text, model: 'scripted', usage: { input: 0, output: 0, cost: 0 } } }];
    return route.fulfill({ status: 200, contentType: 'application/x-ndjson', body: lines.map((l) => JSON.stringify(l)).join('\n') + '\n' });
  }
  if (u.pathname === '/socria-mark.png') return route.fulfill({ status: 200, contentType: 'image/png', body: readFileSync(join(ROOT, 'public/socria-mark.png')) });
  if (u.pathname.startsWith('/api/')) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
  return route.fulfill({ status: 404, body: '' });
});
const settle = (ms = 600) => page.waitForTimeout(ms);
const stateOf = () => page.evaluate(() => new Promise((res) => { const r = indexedDB.open('socria-ux-v0', 1); r.onsuccess = () => { const g = r.result.transaction('projects', 'readonly').objectStore('projects').get(window.__PROJECT_ID__); g.onsuccess = () => res(g.result?.design ?? null); }; }));
const save = async (click, name, timeout = 120000) => {
  const [d] = await Promise.all([page.waitForEvent('download', { timeout }), click()]);
  const p = `${OUT}${name}`;
  await d.saveAs(p);
  return { path: p, suggested: d.suggestedFilename(), bytes: readFileSync(p) };
};
const menu = async (label) => {
  await page.locator('.dx-head button:text-is("Export")').click();
  await settle(200);
  return page.locator(`.dx-menu button:has(b:text-is("${label}"))`);
};
const board = (name) => page.locator(`.dx-board:has(.dx-label-name:text-is("${name}"))`);
const select = async (name) => {
  await board(name).locator('.dx-label-name').click();
  await settle(400);
};

console.log('\n=== a campaign: a story that moves, a sheet, two screens ===');
await page.goto(`${ORIGIN}/`);
await page.waitForSelector('.dx-board iframe', { timeout: 20000 });
await page.waitForFunction(() => !document.querySelector('.dx-phase'), null, { timeout: 40000 });
await settle(2500);
let st = await stateOf();
const [story, sheet, home, convo] = st.doc.artboards;
ok('four artboards are made, each at its format’s size; the story is 2 s long', st.doc.artboards.length === 4 && story.width === 1080 && story.height === 1920 && story.seconds === 2 && sheet.width === 794 && sheet.height === 1123 && home.width === 390, st.doc.artboards.map((a) => [a.name, a.width, a.height, a.seconds]));
ok('the screens lead to one another by the ids they were given', home.html.includes(`data-go="${convo.id}"`) && convo.html.includes(`data-go="${home.id}"`));
const look = requests.find((r) => r.mode === 'look');
const facts = look?.measured ?? {};
ok('the look is told, as measured, that the story’s line sits under the platform’s interface', (facts[story.id] ?? []).some((x) => /under the platform's interface, measured: “Think for yourself\.”[^\n]*the top 250 px/.test(x)), facts[story.id]);
ok('…that the story moves and offers nothing to people who asked for less motion', (facts[story.id] ?? []).some((x) => /prefers-reduced-motion/.test(x)), facts[story.id]);
ok('…and that the sheet’s line is nearer the trim than its margin, in millimetres', (facts[sheet.id] ?? []).some((x) => /too near the trim, measured: “Think for yourself\.”[^\n]*is 5\.3 mm from the edge[^\n]*keeps words 12 mm in/.test(x)), facts[sheet.id]);

console.log('\n=== guides ===');
await page.locator('.dx-head button:text-is("Guides")').click();
await settle(400);
ok('the story shows the two bands a platform covers; the sheet its safe margin and its bleed', (await board('Story').locator('.dx-guide-cover').count()) === 2 && (await board('Sheet').locator('.dx-guide-safe').count()) === 1 && (await board('Sheet').locator('.dx-guide-bleed').count()) === 1);
await page.screenshot({ path: `${OUT}1-guides.png` });
await page.locator('.dx-head button:text-is("Guides")').click();

console.log('\n=== every artboard as pictures in one file ===');
{
  const z = await save(async () => (await menu('PNG files (ZIP)')).click(), 'campaign.zip');
  const zip = await JSZip.loadAsync(z.bytes);
  const names = Object.keys(zip.files).sort();
  const dims = [];
  for (const n of names) {
    const buf = await zip.files[n].async('nodebuffer');
    dims.push([n, buf.readUInt32BE(16), buf.readUInt32BE(20), buf.subarray(1, 4).toString()]);
  }
  ok('the ZIP holds four PNGs, numbered in order and named for their artboards', names.length === 4 && /^1-story\.png$/.test(names[0]) && /^2-sheet\.png$/.test(names[1]) && dims.every((d) => d[3] === 'PNG'), names);
  ok('a screen design at twice its size; a print sheet at 300 to the inch', dims[0][1] === 2160 && dims[0][2] === 3840 && dims[1][1] === Math.round((794 * 300) / 96) && dims[1][2] === Math.round((1123 * 300) / 96), dims);
  writeFileSync(`${OUT}story.png`, await zip.files[names[0]].async('nodebuffer'));
}

console.log('\n=== the print sheet, for a printer ===');
{
  await select('Sheet');
  const f = await save(() => page.locator('.dx-inspect button:text-is("Print PDF with bleed and crop marks")').click(), 'sheet-print.pdf');
  const pdf = f.bytes.toString('latin1');
  const box = (n) => (new RegExp(`/${n} \\[([\\d. ]+)\\]`).exec(pdf)?.[1] ?? '').split(' ').map(Number);
  const media = box('MediaBox');
  const trim = box('TrimBox');
  const bleed = box('BleedBox');
  const mm = (pt) => (pt / 72) * 25.4;
  ok('the trim box is A4 (210 × 297 mm), exactly', Math.abs(mm(trim[2] - trim[0]) - 210) < 0.3 && Math.abs(mm(trim[3] - trim[1]) - 297.1) < 0.3, [mm(trim[2] - trim[0]), mm(trim[3] - trim[1])]);
  ok('the bleed box is 3 mm beyond it on every side; the page leaves room for marks', Math.abs(mm(trim[0] - bleed[0]) - 3) < 0.25 && Math.abs(mm(bleed[2] - trim[2]) - 3) < 0.25 && media[2] > bleed[2] + 10 && bleed[0] > 10, { trim, bleed, media });
  ok('it has crop marks, is RGB, and claims no CMYK or print standard', /0\.25 w 0 0 0 RG/.test(pdf) && /\/DeviceRGB/.test(pdf) && !/DeviceCMYK|OutputIntent|PDF\/X/.test(pdf));
  ok('…and the person is told so', /RGB — it is not a CMYK file and claims no print standard/.test((await page.locator('.dx-toast').textContent().catch(() => '')) ?? ''), await page.locator('.dx-toast').textContent().catch(() => ''));
  // the picture inside: its bleed is the design carried past the cut
  const start = f.bytes.indexOf(Buffer.from([0xff, 0xd8, 0xff]));
  const end = f.bytes.lastIndexOf(Buffer.from([0xff, 0xd9]));
  writeFileSync(`${OUT}sheet-bleed.jpg`, f.bytes.subarray(start, end + 2));
  const seen = JSON.parse(py(`
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
b = round(3 / 25.4 * 300)
near = lambda a, c: all(abs(x - y) < 18 for x, y in zip(a, c))
print(json.dumps({
  'size': [w, h], 'bleed': b,
  'top_bleed': im.getpixel((w // 2, b // 2)), 'top_inside': im.getpixel((w // 2, b + 40)),
  'left_bleed': im.getpixel((b // 2, h // 2)), 'left_inside': im.getpixel((b + 40, h // 2)),
  'corner': im.getpixel((b // 2, b // 2)),
}))`, `${OUT}sheet-bleed.jpg`));
  const close = (a, c) => a.every((v, i) => Math.abs(v - c[i]) < 20);
  ok('the picture is the sheet at 300 to the inch plus its bleed', seen.size[0] === Math.round((794 * 300) / 96) + 2 * seen.bleed && seen.size[1] === Math.round((1123 * 300) / 96) + 2 * seen.bleed, seen);
  ok('the green band that runs to the top edge runs on into the top bleed; the ochre edge into the left bleed', close(seen.top_bleed, [53, 70, 32]) && close(seen.top_inside, [53, 70, 32]) && close(seen.left_bleed, [184, 162, 107]) && close(seen.left_inside, [184, 162, 107]) && close(seen.corner, [53, 70, 32]), seen);
}

console.log('\n=== the story as a video and as frames ===');
{
  await select('Story');
  await page.waitForSelector('.dx-inspect input[aria-label="Moment"]');
  // a moment of it, on the canvas
  await page.locator('.dx-inspect input[aria-label="Moment"]').fill('1');
  await settle(500);
  const x = await board('Story').frameLocator('iframe').locator('.block').evaluate((el) => el.getBoundingClientRect().left);
  ok('the canvas shows the moment asked for: at 1 s of 2 s, the block is halfway across', Math.abs(x - (40 + 400)) < 6, x);
  const fz = await save(() => page.locator('.dx-inspect button:text-is("Frames (ZIP)")').click(), 'story-frames.zip', 240000);
  const zip = await JSZip.loadAsync(fz.bytes);
  const pngs = Object.keys(zip.files).filter((n) => n.endsWith('.png')).sort();
  ok('the frames are 48 numbered PNGs (2 s at 24 a second), with a note of what they are', pngs.length === 48 && /48 frames at 24 frames a second \(2 s\), 608 × 1080 px/.test(await zip.files['README.txt'].async('string')), [pngs.length, await zip.files['README.txt'].async('string')]);
  for (const [i, n] of [[0, 'first'], [24, 'mid'], [47, 'last']]) writeFileSync(`${OUT}frame-${n}.png`, await zip.files[pngs[i]].async('nodebuffer'));
  // where the green block is in each frame, and whether the second line has arrived
  const at = JSON.parse(py(`
import sys, json
from PIL import Image
out = {}
for name in ['first', 'mid', 'last']:
    im = Image.open(sys.argv[1] + 'frame-' + name + '.png').convert('RGB')
    w, h = im.size
    k = w / 1080
    y = round(1000 * k)
    xs = [x for x in range(w) if all(abs(a - b) < 24 for a, b in zip(im.getpixel((x, y)), (53, 70, 32)))]
    ty = round(1275 * k)
    dark = sum(1 for x in range(round(80 * k), round(700 * k)) if sum(im.getpixel((x, ty))) < 300)
    out[name] = {'left': (min(xs) / k) if xs else None, 'sub_dark': dark}
print(json.dumps(out))`, OUT));
  ok('in the frames the block is where its animation puts it: at the start, 51% across at frame 25, at rest at the end', Math.abs(at.first.left - 40) < 8 && Math.abs(at.mid.left - (40 + 800 * (24 / 47))) < 10 && Math.abs(at.last.left - 840) < 8, at);
  ok('the second line has not arrived at the start, and has at the end (its delay and fade are kept)', at.first.sub_dark === 0 && at.last.sub_dark > 10, at);
  const v = await save(() => page.locator('.dx-inspect button:has-text("Video (")').click(), 'story.video', 240000);
  const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,width,height,nb_read_frames,r_frame_rate:format=format_name', '-of', 'json', v.path], { encoding: 'utf8' }));
  const vs = probe.streams?.[0] ?? {};
  ok('the video is a real video file: a video stream at the story’s shape', /^(vp8|vp9|h264)$/.test(vs.codec_name) && vs.width === 608 && vs.height === 1080 && /webm|matroska|mp4/.test(probe.format?.format_name ?? ''), probe);
  ok('…holding the frames that were drawn (48, give or take the recorder’s first and last)', Math.abs(Number(vs.nb_read_frames) - 48) <= 6, vs.nb_read_frames);
  const said = (await page.locator('.dx-toast').textContent().catch(() => '')) ?? '';
  ok('…and the person is told what it is: its kind, length, rate, size, and that it has no sound', /(WebM|MP4 \(H\.264\)) video: 2 s at 24 frames a second, 608 × 1080 px, no sound/.test(said) && v.suggested.endsWith(vs.codec_name === 'h264' ? '.mp4' : '.webm'), [said, v.suggested]);
  // one decoded frame of the video is the design
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', v.path, '-vf', 'select=eq(n\\,40)', '-vframes', '1', `${OUT}video-frame.png`]);
  const vf = JSON.parse(py(`
import sys, json
from PIL import Image
im = Image.open(sys.argv[1]).convert('RGB')
w, h = im.size
k = w / 1080
y = round(1000 * k)
xs = [x for x in range(w) if all(abs(a - b) < 40 for a, b in zip(im.getpixel((x, y)), (53, 70, 32)))]
print(json.dumps({'left': (min(xs) / k) if xs else None, 'paper': im.getpixel((5, 5))}))`, `${OUT}video-frame.png`));
  ok('a frame decoded from the video shows the design (paper ground, the block near where it should be by then)', vf.left !== null && vf.left > 500 && vf.paper.every((c, i) => Math.abs(c - [245, 243, 235][i]) < 16), vf);
}

console.log('\n=== the screens as a prototype ===');
{
  await page.locator('.dx-head button:text-is("Present")').click();
  await settle(900);
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await settle(900);
  ok('presenting says it is a click-through, not a product', /A click-through of designed screens — not a working product\./.test((await page.locator('.dx-present-bar').textContent()) ?? '') && /Home · 3 \/ 4/.test((await page.locator('.dx-present-bar span').textContent()) ?? ''));
  await page.frameLocator('.dx-present-board iframe').locator('.open').click();
  await settle(900);
  ok('a click on what leads somewhere goes there', /Conversation · 4 \/ 4/.test((await page.locator('.dx-present-bar span').textContent()) ?? ''), await page.locator('.dx-present-bar span').textContent());
  await page.frameLocator('.dx-present-board iframe').locator('.back').click();
  await settle(900);
  ok('…and back', /Home · 3 \/ 4/.test((await page.locator('.dx-present-bar span').textContent()) ?? ''));
  await page.keyboard.press('Escape');
  const f = await save(async () => (await menu('Prototype (HTML)')).click(), 'prototype.html');
  ok('the prototype is one HTML file, named as one', f.suggested.endsWith('-prototype.html') && f.bytes.length > 2000 && !/data-sx=/.test(f.bytes.toString()));
  const p2 = await ctx.newPage();
  await p2.goto(`${ORIGIN}/proto.html#${home.id}`);
  await p2.waitForSelector('section:not([hidden]) iframe');
  await p2.waitForTimeout(600);
  ok('opened on its own, it shows the screen asked for', /Home · 3 \/ 4/.test(await p2.locator('#where').textContent()));
  await p2.frameLocator('section:not([hidden]) iframe').locator('.open').click();
  await p2.waitForTimeout(400);
  ok('…its links work with nothing of SocriaUX around it', /Conversation · 4 \/ 4/.test(await p2.locator('#where').textContent()), await p2.locator('#where').textContent());
  ok('…its words are live text', (await p2.frameLocator('section:not([hidden]) iframe').locator('h2').textContent()) === 'What are you working on?');
  await p2.screenshot({ path: `${OUT}2-prototype-file.png` });
  await p2.close();
}

console.log('\n=== one line, changed in one place ===');
{
  await select('Sheet');
  await page.locator('.dx-inspect button:text-is("Approve")').click();
  await settle(700);
  await board('Story').frameLocator('iframe').locator('h1.line').click();
  await settle(400);
  const words = page.locator('.dx-inspect textarea.dx-text');
  await words.fill('Come out sharper.');
  await words.blur();
  await settle(900);
  const bar = (await page.locator('.dx-follow').textContent().catch(() => '')) ?? '';
  ok('the same words on another artboard are found and offered, the approved one named as staying', /“Think for yourself\.” is also on “Sheet”/.test(bar) && /1 protected: it stays as approved/.test(bar), bar);
  ok('nothing is offered to change, since the only other place is approved', (await page.locator('.dx-follow button.dx-primary').count()) === 0);
  await page.locator('.dx-follow button:has-text("Leave")').click();
  st = await stateOf();
  ok('the story says the new line; the approved sheet still says the old one', /Come out sharper\./.test(st.doc.artboards[0].html) && /Think for yourself\./.test(st.doc.artboards[1].html) && st.doc.artboards[1].state === 'approved');
  // reopened, it can follow
  await select('Sheet');
  await page.locator('.dx-approved button:text-is("Reopen for changes")').click();
  await settle(600);
  await board('Story').frameLocator('iframe').locator('h1.line').click();
  await settle(400);
  await words.fill('The thinking stays yours.');
  await words.blur();
  await settle(700);
  ok('once reopened it is no longer protected… but it no longer carries the same words either: nothing is offered', (await page.locator('.dx-follow').count()) === 0);
  await board('Sheet').frameLocator('iframe').locator('h1.line').click();
  await settle(400);
  await words.fill('The thinking stays yours.');
  await words.blur();
  await settle(700);
  await board('Story').frameLocator('iframe').locator('h1.line').click();
  await settle(400);
  await words.fill('Think for yourself.');
  await words.blur();
  await settle(900);
  ok('with the same words on both, changing one offers the other', /is also on “Sheet”/.test((await page.locator('.dx-follow').textContent().catch(() => '')) ?? '') && (await page.locator('.dx-follow button.dx-primary').count()) === 1);
  await page.locator('.dx-follow button.dx-primary').click();
  await settle(900);
  st = await stateOf();
  ok('…and on the person’s word it follows, as one version, everything else untouched', /Think for yourself\./.test(st.doc.artboards[1].html) && /Changed the same words on 1 other artboard/.test(st.versions[st.at].said) && st.doc.artboards[1].html.includes('class="band"'), st.versions[st.at].said);
}

ok('no errors on the page', errors.length === 0, errors);
console.log(`\nproduction-qa: ${pass} passed, ${fail} failed · files in ${OUT}`);
await b.close();
process.exit(fail ? 1 : 0);
