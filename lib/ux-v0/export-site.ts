// lib/ux-v0/export-site.ts — a generated website as a folder that builds and runs without SocriaUX.
//
// The single downloaded HTML page was a picture of the site with its scripts inlined. This is the site itself:
//
//   index.html            the page, drawn by the same renderer the canvas uses, its motion playing, its forms
//                         sending where the designer set (lib/ux-v0/render.ts RenderOptions.live); no inline script
//                         runs, so a strict Content Security Policy (script-src 'self') holds
//   styles.css            its styles
//   js/                   SocriaUX's own behaviour, motion and (when there is a scene) 3D runtimes, as files
//   assets/               the pictures SocriaUX made and the designer's uploads, as files (photographs from image
//                         libraries stay at their library's address, as their licences ask, and are credited)
//   scripts/build.mjs     a build with no dependencies: copies the site to dist/, applies SITE_URL and FORM_ACTION,
//                         checks that every asset and anchor resolves, and says what is not connected yet
//   scripts/preview.mjs   a static server for dist/, no dependencies
//   README.md             how to build, preview and deploy it; its environment variables; what is not connected;
//                         the creative decisions it was made with
//   CREDITS.md, .env.example, netlify.toml, vercel.json, robots.txt (and sitemap.xml once its address is known)
//   socriaux.json         the design and its direction, to open it again in SocriaUX
//
// Pure: no DOM, no network. The workspace zips the files (jszip); the export bench writes, builds and serves them.

import { BEHAVIOR_SOURCE } from './behaviors';
import { describeLink, resolveLinks, type ResolvedLink } from './links';
import { MOTION_RUNTIME } from './motion-runtime';
import { pageDescription, renderDesign } from './render';
import { SCENE_RUNTIME } from './scene-runtime';
import { kindDef, type DesignSpec } from './spec';
import { creditText, type MoodboardRef } from './types';

export interface ExportFile {
  path: string;
  data: string | Uint8Array;
}

export interface ExportReport {
  /** buttons and links that go nowhere yet: said in the README and by the build */
  unlinked: { label: string; where: string }[];
  /** whether the page's forms send anywhere */
  forms: 'none' | 'connected' | 'not-connected';
  /** where the description comes from */
  description: 'set' | 'from-page' | 'none';
  /** the site's address, when the designer set one */
  url: string;
  /** photographs that stay at their library's address */
  remote: { url: string; credit: string }[];
  /** pictures written into assets/ */
  assets: number;
  /** everything said plainly before the site goes live */
  todo: string[];
}

export interface SiteExport {
  /** the folder's name */
  name: string;
  files: ExportFile[];
  report: ExportReport;
}

export interface ExportContext {
  /** the project's name, when the design has no title of its own */
  projectName?: string;
  /** the approved direction, said in the README and kept in socriaux.json */
  direction?: { name?: string; language?: string; summary?: string; said?: string[] } | null;
  /** when it was exported (tests pass a fixed time) */
  now?: number;
}

export const EXPORT_FORMAT = 'socriaux.site/1';

/** What stands between the design and a live site, said plainly: cheap enough to read on every change. */
export interface Readiness {
  /** buttons and links that go nowhere yet */
  unlinked: ResolvedLink[];
  forms: 'none' | 'connected' | 'not-connected';
  url: string;
  description: { text: string; from: 'set' | 'page' | 'none' };
  /** each point, done or not, in the designer's words */
  items: { done: boolean; text: string }[];
}

export function siteReadiness(spec: DesignSpec): Readiness {
  const links = resolveLinks(spec);
  const formCount = spec.sections.filter((s) => s.kind === 'form').length;
  const forms: Readiness['forms'] = !formCount ? 'none' : spec.site?.formAction ? 'connected' : 'not-connected';
  const description = pageDescription(spec);
  const url = spec.site?.url ?? '';
  const where = (l: ResolvedLink) => kindDef(spec.sections.find((s) => s.id === l.section)?.kind ?? '')?.label.toLowerCase() ?? l.section;
  const items = [
    { done: !links.unlinked.length, text: links.unlinked.length ? `${links.unlinked.length} link${links.unlinked.length > 1 ? 's go' : ' goes'} nowhere yet: ${links.unlinked.map((l) => `“${l.label}” (${where(l)})`).join(', ')}.` : `Every button and link goes somewhere (${links.all.length}).` },
    ...(forms === 'none' ? [] : [{ done: forms === 'connected', text: forms === 'connected' ? `The form sends to ${spec.site!.formAction!.replace(/^mailto:/, '')}.` : `The form${formCount > 1 ? 's do' : ' does'} not send anywhere yet: until it does, it says so.` }]),
    { done: !!url, text: url ? `Lives at ${url}.` : 'No address yet: canonical link, link previews and the sitemap wait for one.' },
    { done: description.from !== 'none', text: description.from === 'set' ? 'Has its own description for search results.' : description.from === 'page' ? 'Search results show its opening words; a description of its own reads better.' : 'No description for search results.' },
  ];
  return { unlinked: links.unlinked, forms, url, description, items };
}

/** A folder or package name from a title. */
export function slugOf(title: string): string {
  return (
    title
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'website'
  );
}

const EXT: Record<string, string> = { 'image/svg+xml': 'svg', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'image/avif': 'avif' };

/** A data: URI's bytes or text, and the file extension its type has; null when it is not one SocriaUX writes. */
function decodeData(uri: string): { data: string | Uint8Array; ext: string } | null {
  const m = /^data:([a-z]+\/[a-z0-9.+-]+)((?:;[a-z0-9-]+=[^;,]+)*)(;base64)?,(.*)$/is.exec(uri);
  if (!m) return null;
  const ext = EXT[m[1].toLowerCase()];
  if (!ext) return null;
  if (m[3]) {
    const bin = atob(m[4]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return { data: bytes, ext };
  }
  try {
    return { data: decodeURIComponent(m[4]), ext };
  } catch {
    return null;
  }
}

/** Every data: picture in the markup and styles moved to a file of its own; the same picture is written once. */
function extractPictures(html: string, css: string): { html: string; css: string; files: ExportFile[] } {
  const seen = new Map<string, string>();
  const files: ExportFile[] = [];
  const fileFor = (uri: string, prefix: string): string | null => {
    const known = seen.get(uri);
    if (known) return known;
    const d = decodeData(uri);
    if (!d) return null;
    const path = `assets/${uri.startsWith('data:image/svg') ? 'art' : 'image'}-${files.length + 1}.${d.ext}`;
    seen.set(uri, path);
    files.push({ path, data: d.data });
    return `${prefix}${path}`;
  };
  // in attributes (src, href, content) the address runs to the closing quote; in styles, inside url(…)
  const inMarkup = html.replace(/(=")(data:image\/[^"]+)(")/g, (all, a, uri, b) => {
    const to = fileFor(uri, '');
    return to ? `${a}${to}${b}` : all;
  });
  const inStyle = (s: string, prefix: string) =>
    s.replace(/url\((["']?)(data:image\/[^"')]+)\1\)/g, (all, q, uri) => {
      const to = fileFor(uri, prefix);
      return to ? `url(${q}${to}${q})` : all;
    });
  // styles in the page's own attributes are relative to the page; styles.css sits beside it too
  return { html: inStyle(inMarkup, ''), css: inStyle(css, ''), files };
}

/** The finished page: styles and scripts as files, nothing inline that runs. */
function pageFiles(spec: DesignSpec, refs: readonly MoodboardRef[]): { html: string; css: string; scene: boolean; pictures: ExportFile[] } {
  const r = renderDesign(spec, refs, { motion: 'play', live: true });
  const scene = spec.sections.some((x) => x.kind === 'scene');
  let html = r.html;
  const styleAt = html.indexOf('<style>');
  const styleEnd = html.indexOf('</style>', styleAt);
  const css = styleAt >= 0 && styleEnd > styleAt ? html.slice(styleAt + 7, styleEnd) : r.css;
  if (styleAt >= 0 && styleEnd > styleAt) html = `${html.slice(0, styleAt)}<link rel="stylesheet" href="styles.css">${html.slice(styleEnd + 8)}`;
  const scripts = ['<script src="js/behaviors.js"></script>', '<script src="js/motion.js"></script>', ...(scene ? ['<script src="js/scene.js"></script>'] : [])].join('\n');
  html = html.replace(/\n<\/body>\n<\/html>\s*$/, `\n${scripts}\n</body>\n</html>\n`);
  if (!html.includes('js/behaviors.js')) html = html.replace('</body>', `${scripts}\n</body>`);
  const moved = extractPictures(html, css);
  return { html: moved.html, css: moved.css, scene, pictures: moved.files };
}

const BUILD_SCRIPT = String.raw`// scripts/build.mjs — builds this website into dist/. No dependencies: Node 18 or later.
//
//   SITE_URL     the address the site will live at (https://…): canonical link, link previews, sitemap
//   FORM_ACTION  where the forms send (an https form endpoint, or mailto:you@example.com)
//   STRICT=1     fail the build while any button goes nowhere or a form is not connected
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
const env = process.env;
const say = (s) => console.log(s);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const f of ['styles.css', 'robots.txt']) cpSync(join(root, f), join(out, f));
for (const d of ['js', 'assets']) if (existsSync(join(root, d))) cpSync(join(root, d), join(out, d), { recursive: true });

let html = readFileSync(join(root, 'index.html'), 'utf8');
const problems = [];
const todo = [];

// the site's address: given now (SITE_URL), else the one set in SocriaUX
const set = (html.match(/<link rel="canonical" href="([^"]+)"/) || [])[1] || '';
const url = (env.SITE_URL || set).trim().replace(/\/+$/, '');
if (url && !/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(url)) problems.push('SITE_URL must be an https address: ' + url);
else if (url) {
  if (!set) {
    html = html.replace('</title>', '</title>\n<link rel="canonical" href="' + esc(url + '/') + '">\n<meta property="og:url" content="' + esc(url + '/') + '">');
    html = html.replace(/("@type":"WebSite")/, '$1,"url":' + JSON.stringify(url + '/'));
  }
  writeFileSync(join(out, 'sitemap.xml'), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>' + esc(url + '/') + '</loc></url></urlset>\n');
  writeFileSync(join(out, 'robots.txt'), readFileSync(join(root, 'robots.txt'), 'utf8').trimEnd() + '\nSitemap: ' + url + '/sitemap.xml\n');
}

// where the forms send, when it is given now and was not set in SocriaUX
const action = (env.FORM_ACTION || '').trim();
if (action && !/^(https:\/\/\S+|mailto:[^\s@]+@\S+)$/i.test(action)) problems.push('FORM_ACTION must be an https address or mailto: — ' + action);
else if (action) {
  html = html.replace(/<form class="form" action="#" method="post"/g, '<form class="form" action="' + esc(action) + '" method="post"' + (action.startsWith('mailto:') ? ' enctype="text/plain"' : '') + ' data-ux-live=""');
  html = html.replace(/Checked\. <span class="muted">This form is not connected yet: nothing was sent\.<\/span>/g, 'Sending…');
}
const forms = (html.match(/<form class="form"/g) || []).length;
const unconnected = (html.match(/<form class="form" action="#"/g) || []).length;
if (unconnected) todo.push(unconnected + ' form' + (unconnected > 1 ? 's are' : ' is') + ' not connected: set FORM_ACTION (a form service endpoint or mailto:).');

// every button and link goes somewhere
const unlinked = [...html.matchAll(/<a [^>]*data-ux-unlinked[^>]*>([\s\S]*?)<\/a>/g)].map((m) => m[1].replace(/<[^>]+>/g, '').trim());
if (unlinked.length) todo.push(unlinked.length + ' link' + (unlinked.length > 1 ? 's go' : ' goes') + ' nowhere yet: ' + unlinked.map((t) => '“' + t + '”').join(', ') + ' (set them in SocriaUX, or edit index.html).');

// every part a link goes to is on the page, and every file the page asks for is in the build
const ids = new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]));
for (const m of html.matchAll(/href="#([^"]+)"/g)) if (!ids.has(m[1])) problems.push('A link goes to #' + m[1] + ', which is not on the page.');
const css = readFileSync(join(root, 'styles.css'), 'utf8');
const local = [...html.matchAll(/(?:src|href)="((?:assets|js)\/[^"]+|styles\.css)"/g), ...css.matchAll(/url\(["']?((?:assets)\/[^"')]+)["']?\)/g), ...html.matchAll(/url\(["']?((?:assets)\/[^"')]+)["']?\)/g)].map((m) => m[1]);
for (const f of new Set(local)) if (!existsSync(join(out, f))) problems.push('The page asks for ' + f + ', which is not in the build.');

writeFileSync(join(out, 'index.html'), html);
say('Built dist/: index.html, styles.css, ' + new Set(local).size + ' files it uses' + (url ? ', sitemap.xml' : '') + '.');
say(forms ? forms - unconnected + ' of ' + forms + ' form' + (forms > 1 ? 's' : '') + ' connected.' : 'No forms.');
for (const t of todo) say('To do: ' + t);
for (const p of problems) console.error('Problem: ' + p);
if (problems.length || (env.STRICT === '1' && todo.length)) process.exit(1);
`;

const PREVIEW_SCRIPT = String.raw`// scripts/preview.mjs — serves dist/ at http://localhost:4173 (PORT to change it). No dependencies.
import { createServer } from 'node:http';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('Build it first: npm run build');
  process.exit(1);
}
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml', '.json': 'application/json' };
const port = Number(process.env.PORT) || 4173;
createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  const file = normalize(join(dist, path.endsWith('/') ? path + 'index.html' : path));
  if (!file.startsWith(dist) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    return res.end('Not found');
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  res.end(readFileSync(file));
}).listen(port, () => console.log('Serving dist/ at http://localhost:' + port));
`;

const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' https: data:; form-action 'self' https: mailto:; frame-ancestors 'self'; base-uri 'self'";

/** The README: how to build, preview and deploy; what to set; what is not connected; how it was made. */
function readme(name: string, spec: DesignSpec, report: ExportReport, ctx: ExportContext, scene: boolean): string {
  const d = ctx.direction;
  const kinds = spec.sections.map((s) => kindDef(s.kind)?.label ?? s.kind);
  const lines = [
    `# ${spec.title}`,
    '',
    `A website designed in SocriaUX${d?.name ? ` in the “${d.name}” direction` : ''} and exported on ${new Date(ctx.now ?? Date.now()).toISOString().slice(0, 10)}. One page: ${kinds.join(', ').toLowerCase()}.`,
    '',
    '## Build and preview',
    '',
    'Needs Node 18 or later. There is nothing to install: the build and the preview server have no dependencies.',
    '',
    '```bash',
    'npm run build',
    '```',
    '',
    '```bash',
    'npm run preview',
    '```',
    '',
    'The build writes the site to `dist/` and checks it: every file the page uses is there, every link to a part of the page lands on it. It says what is not connected yet.',
    '',
    '## Environment variables',
    '',
    '| Name | What it does | Set now |',
    '| --- | --- | --- |',
    `| \`SITE_URL\` | The site's address (https). Adds the canonical link and link-preview address, and writes \`sitemap.xml\`. | ${report.url ? `already set in SocriaUX: ${report.url}` : 'no'} |`,
    `| \`FORM_ACTION\` | Where the forms send: a form service's endpoint (https) or \`mailto:you@example.com\`. | ${report.forms === 'connected' ? 'already set in SocriaUX' : report.forms === 'none' ? 'no form on the page' : 'no'} |`,
    '| `STRICT` | `1` fails the build while anything below is not done. | — |',
    '',
    'Set them in your host\'s settings, or on the command line (`SITE_URL=https://example.com npm run build`). With Node 20.6 or later, `node --env-file=.env scripts/build.mjs` reads a copy of `.env.example`.',
    '',
    '## Deploy',
    '',
    'Any static host serves `dist/`.',
    '',
    '- **Netlify:** connect the folder or repository; `netlify.toml` sets the build command and `dist/`.',
    '- **Vercel:** import it; `vercel.json` sets the build command and `dist/`.',
    '- **GitHub Pages, S3, any web server:** run the build and upload `dist/`.',
    '',
    `Suggested security header (already in \`netlify.toml\` and \`vercel.json\`): \`Content-Security-Policy: ${CSP}\`. No script on the page runs inline.`,
    '',
    '## Before it goes live',
    '',
    ...(report.todo.length ? report.todo.map((t) => `- ${t}`) : ['- Nothing: every button has a destination and every form sends somewhere.']),
    '',
    '## What is in it',
    '',
    '- `index.html`, `styles.css`: the page.',
    `- \`js/\`: SocriaUX's runtime for the page's behaviour (menus, galleries, forms, bookings, tables, filters) and motion${scene ? ', and the 3D scene' : ''}. Motion stops for visitors who ask their system for reduced motion.`,
    `- \`assets/\`: ${report.assets ? `${report.assets} picture${report.assets > 1 ? 's' : ''} made for or uploaded to the project.` : 'no local pictures.'}`,
    `- Photographs from image libraries stay at their library's address, as their licences ask: ${report.remote.length ? `${report.remote.length}, credited on the page and in \`CREDITS.md\`.` : 'none on this page.'}`,
    '- Fonts load from Google Fonts. To host them yourself, download the families named in the stylesheet link in `index.html` and replace the link.',
    '- `socriaux.json`: the design and its direction, to open it again in SocriaUX.',
    '',
    '## How it was designed',
    '',
    ...(d?.summary ? [d.summary, ''] : []),
    `- Typefaces: ${spec.tokens.fonts.display} for headlines, ${spec.tokens.fonts.body} for text.`,
    `- Colours: ground ${spec.tokens.colors.background}, text ${spec.tokens.colors.text}, accent ${spec.tokens.colors.accent}.`,
    ...(d?.said ?? []).slice(0, 8).map((x) => `- ${x}`),
    '',
    '## Browser support',
    '',
    'Current versions of Chrome, Edge, Firefox and Safari. Outline type uses `-webkit-text-stroke` and shows filled where it is not supported; scroll-linked effects need `animation-timeline` and are simply absent elsewhere.',
    '',
  ];
  return lines.join('\n');
}

/** The site as files (see the head of this file). */
export function exportSite(spec: DesignSpec, refs: readonly MoodboardRef[], ctx: ExportContext = {}): SiteExport {
  const name = slugOf(spec.title || ctx.projectName || 'website');
  const page = pageFiles(spec, refs);
  const links = resolveLinks(spec);
  const formCount = spec.sections.filter((s) => s.kind === 'form').length;
  const used = new Set<string>();
  for (const s of spec.sections) for (const id of s.images) used.add(id);
  const remote = refs
    .filter((r) => used.has(r.id) && /^https:\/\//.test(r.url) && r.provider !== 'socriaux' && r.provider !== 'upload')
    .map((r) => ({ url: r.sourceUrl || r.url, credit: creditText(r) }));
  const report: ExportReport = {
    unlinked: links.unlinked.map((l) => ({ label: l.label, where: kindDef(spec.sections.find((s) => s.id === l.section)?.kind ?? '')?.label ?? l.section })),
    forms: !formCount ? 'none' : spec.site?.formAction ? 'connected' : 'not-connected',
    description: spec.site?.description ? 'set' : /<meta name="description"/.test(page.html) ? 'from-page' : 'none',
    url: spec.site?.url ?? '',
    remote,
    assets: page.pictures.length,
    todo: [],
  };
  if (report.unlinked.length) report.todo.push(`${report.unlinked.length} link${report.unlinked.length > 1 ? 's go' : ' goes'} nowhere yet: ${report.unlinked.map((u) => `“${u.label}” (${u.where.toLowerCase()})`).join(', ')}. Give each a destination in SocriaUX (Publish), or edit \`index.html\`.`);
  if (report.forms === 'not-connected') report.todo.push(`The form${formCount > 1 ? 's do' : ' does'} not send anywhere yet: set \`FORM_ACTION\`, or a destination in SocriaUX. Until then ${formCount > 1 ? 'they say' : 'it says'} plainly that nothing was sent.`);
  if (!report.url) report.todo.push('The site has no address yet: set `SITE_URL` for the canonical link, link previews and the sitemap.');
  if (report.description === 'none') report.todo.push('There is no description for search results: add one in SocriaUX (Publish).');

  const linkList = links.all.length ? `\n## Where its links go\n\n${links.all.map((l) => `- “${l.label}” → ${describeLink(l, spec)}`).join('\n')}\n` : '';
  const files: ExportFile[] = [
    { path: 'index.html', data: page.html },
    { path: 'styles.css', data: page.css },
    { path: 'js/behaviors.js', data: BEHAVIOR_SOURCE },
    { path: 'js/motion.js', data: MOTION_RUNTIME },
    ...(page.scene ? [{ path: 'js/scene.js', data: SCENE_RUNTIME }] : []),
    ...page.pictures,
    { path: 'scripts/build.mjs', data: BUILD_SCRIPT },
    { path: 'scripts/preview.mjs', data: PREVIEW_SCRIPT },
    {
      path: 'package.json',
      data: `${JSON.stringify({ name, private: true, version: '1.0.0', description: `${spec.title}: a website designed in SocriaUX`, type: 'module', scripts: { build: 'node scripts/build.mjs', preview: 'node scripts/preview.mjs' }, engines: { node: '>=18' } }, null, 2)}\n`,
    },
    { path: 'README.md', data: readme(name, spec, report, ctx, page.scene) + linkList },
    { path: 'CREDITS.md', data: `# Credits\n\n${remote.length ? remote.map((r) => `- ${r.credit}: ${r.url}`).join('\n') : 'No photographs from image libraries are used.'}\n\nPictures in \`assets/\` were made by SocriaUX for this project or uploaded by its designer.\n` },
    { path: '.env.example', data: `# The site's address (https), for the canonical link, link previews and the sitemap\nSITE_URL=${report.url}\n# Where the forms send: an https form endpoint, or mailto:you@example.com\nFORM_ACTION=${spec.site?.formAction ?? ''}\n# 1 fails the build while a link goes nowhere or a form is not connected\nSTRICT=0\n` },
    { path: 'robots.txt', data: 'User-agent: *\nAllow: /\n' },
    { path: 'netlify.toml', data: `[build]\n  command = "npm run build"\n  publish = "dist"\n\n[[headers]]\n  for = "/*"\n  [headers.values]\n    Content-Security-Policy = "${CSP}"\n    X-Content-Type-Options = "nosniff"\n    Referrer-Policy = "strict-origin-when-cross-origin"\n` },
    { path: 'vercel.json', data: `${JSON.stringify({ buildCommand: 'npm run build', outputDirectory: 'dist', headers: [{ source: '/(.*)', headers: [{ key: 'Content-Security-Policy', value: CSP }, { key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }] }] }, null, 2)}\n` },
    { path: '.gitignore', data: 'dist/\nnode_modules/\n.env\n' },
    {
      path: 'socriaux.json',
      data: `${JSON.stringify({ format: EXPORT_FORMAT, exportedAt: new Date(ctx.now ?? Date.now()).toISOString(), direction: ctx.direction ?? null, spec, pictures: refs.filter((r) => used.has(r.id)).map((r) => ({ id: r.id, provider: r.provider, credit: creditText(r), ...(/^https:/.test(r.url) ? { url: r.url } : {}) })) }, null, 2)}\n`,
    },
  ];
  return { name, files, report };
}
