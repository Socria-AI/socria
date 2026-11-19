// lib/ux-v0/design-system-server.ts — a design system's files, from a public GitHub repository.
//
// The designer gives a repository ("github.com/acme/design-system", optionally a branch and a folder). The
// server lists it once (GitHub's trees API) and fetches at most eight files that look like a design system:
// token files (JSON), CSS custom properties, and the guidelines (README, DESIGN.md…). Then
// lib/ux-v0/design-system.ts reads them as text.
//
// Safe by construction: only two hosts are ever asked (api.github.com, raw.githubusercontent.com), with the
// owner, repository, branch and paths checked before they are put in a URL; no redirect is followed; every
// answer is size-capped and timed out; nothing fetched is run. A server-side GITHUB_TOKEN, when set, is sent to
// GitHub only (for its rate limit) and never reaches the browser.

import 'server-only';
import type { DSFile } from './design-system';

export interface RepoTarget {
  owner: string;
  repo: string;
  ref: string;
  dir: string;
}

const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})$/;
const REPO = /^[A-Za-z0-9._-]{1,100}$/;
const REF = /^[A-Za-z0-9._/-]{1,100}$/;

/** A public repository the designer named, or null: "owner/repo", or a github.com URL with a branch and folder. */
export function repoTarget(v: unknown): RepoTarget | null {
  let s = String(v ?? '').trim();
  if (!s || s.length > 300) return null;
  s = s.replace(/^https?:\/\//i, '').replace(/^www\./i, '');
  if (/^github\.com\//i.test(s)) s = s.slice('github.com/'.length);
  else if (/^[^/]+\.[^/]+\//.test(s)) return null; // another host
  const parts = s.replace(/\.git$/i, '').split('/').filter(Boolean);
  const [owner, repo] = parts;
  if (!owner || !repo || !OWNER.test(owner) || !REPO.test(repo) || repo === '.' || repo === '..') return null;
  let ref = 'HEAD';
  let dir = '';
  if (parts[2] === 'tree' || parts[2] === 'blob') {
    ref = parts[3] ?? 'HEAD';
    dir = parts.slice(4).join('/');
  }
  if (!REF.test(ref) || ref.includes('..') || dir.includes('..') || !/^[A-Za-z0-9._/ -]{0,200}$/.test(dir)) return null;
  return { owner, repo, ref, dir: dir.replace(/\/+$/, '') };
}

const MAX_FILE = 300_000;
const MAX_TOTAL = 1_200_000;
const TIMEOUT = 8000;

/** The files in a tree that look like a design system, best first: tokens, then CSS variables, then guidelines. */
export function pickFiles(paths: readonly { path: string; size: number }[], dir: string): string[] {
  const inDir = (p: string) => !dir || p === dir || p.startsWith(`${dir}/`);
  const ok = paths.filter((p) => inDir(p.path) && p.size <= MAX_FILE && !/(^|\/)(node_modules|dist|build|\.git|vendor|test|tests|__tests__|fixtures|examples?)\//i.test(p.path));
  const score = (p: string) => {
    const f = p.toLowerCase();
    if (/(^|\/)(design-?)?tokens?(\.[\w-]+)?\.json$|(^|\/)tokens\/.+\.json$|(^|\/)(theme|colors?|palette|typography|style-dictionary)\.json$/.test(f)) return 0;
    if (/(^|\/)(tokens|variables|vars|theme|globals|colors?|design-tokens)\.(css|scss)$/.test(f)) return 1;
    if (/(^|\/)(design|brand|style-?guide|guidelines|principles)\.mdx?$/.test(f)) return 2;
    if (/^readme\.md$/i.test(f) || f === `${dir.toLowerCase()}/readme.md`) return 3;
    return 9;
  };
  return ok
    .map((p) => ({ p: p.path, s: score(p.path) }))
    .filter((x) => x.s < 9)
    .sort((a, b) => a.s - b.s || a.p.length - b.p.length)
    .slice(0, 8)
    .map((x) => x.p);
}

type Fetcher = (url: string, init: RequestInit) => Promise<Response>;

async function capped(res: Response, max: number): Promise<string> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > max) throw new Error('too large');
  const text = await res.text();
  if (text.length > max) throw new Error('too large');
  return text;
}

/** A repository's design-system files, or a reason the designer can act on. */
export async function fetchSystemFiles(t: RepoTarget, fetcher: Fetcher = fetch): Promise<{ files: DSFile[] } | { error: string; status: number }> {
  const headers: Record<string, string> = { accept: 'application/vnd.github+json', 'user-agent': 'socriaux-design-system-import' };
  if (process.env.GITHUB_TOKEN) headers.authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const tree = await fetcher(`https://api.github.com/repos/${t.owner}/${t.repo}/git/trees/${encodeURIComponent(t.ref)}?recursive=1`, { headers, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
  if (tree.status === 404) return { error: 'That repository was not found, or it is private. Only public repositories can be read.', status: 404 };
  if (tree.status === 403 || tree.status === 429) return { error: 'GitHub is limiting requests just now. Try again in a few minutes, or upload the files instead.', status: 429 };
  if (!tree.ok) return { error: 'GitHub could not list that repository just now.', status: 502 };
  const listing = JSON.parse(await capped(tree, 5_000_000)) as { tree?: { path?: string; type?: string; size?: number }[] };
  const blobs = (listing.tree ?? []).filter((x) => x.type === 'blob' && typeof x.path === 'string').map((x) => ({ path: String(x.path), size: Number(x.size ?? 0) }));
  const paths = pickFiles(blobs, t.dir);
  if (!paths.length) return { error: 'No design tokens were found in that repository: no tokens JSON, CSS variables or design guidelines.', status: 422 };
  const files: DSFile[] = [];
  let total = 0;
  for (const path of paths) {
    const url = `https://raw.githubusercontent.com/${t.owner}/${t.repo}/${encodeURIComponent(t.ref)}/${path.split('/').map(encodeURIComponent).join('/')}`;
    try {
      const res = await fetcher(url, { headers: { 'user-agent': headers['user-agent'] }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
      if (!res.ok) continue;
      const text = await capped(res, MAX_FILE);
      total += text.length;
      if (total > MAX_TOTAL) break;
      files.push({ path, text });
    } catch {
      // one file that cannot be read does not stop the others
    }
  }
  if (!files.length) return { error: 'The design system’s files could not be read from GitHub just now.', status: 502 };
  return { files };
}
