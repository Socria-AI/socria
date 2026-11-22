// lib/ux-v0/dsi/figma-server.ts — a Figma file read through the official REST API, on the server.
//
// Authorised access only: the designer's personal access token (sent with this one request, never stored, logged or
// returned) or a server-side FIGMA_TOKEN for a single-tenant deployment. Only api.figma.com is asked, plus the image
// addresses Figma itself returns for SVG exports (Figma's own storage hosts, https only). Every call is time-limited and
// size-capped, redirects are refused, and a refusal is said in words the designer can act on — never with the token in
// it. What comes back is mapped by ./figma.ts; nothing is fabricated when a call fails.

import 'server-only';
import { importAsset } from './assets';
import { figmaContent, logoNodeIds, type FigmaFetched } from './figma';
import type { BrandAsset } from './schema';

export const FIGMA_API = 'https://api.figma.com';
const TIMEOUT = 12_000;
const MAX_JSON = 25_000_000;
const MAX_SVG = 1_000_000;
const IMAGE_HOST = /(^|\.)(amazonaws\.com|figma\.com|figmausercontent\.com)$/i;

export type FigmaFetcher = (url: string, init: RequestInit) => Promise<Response>;

export interface FigmaCall {
  endpoint: string;
  status: number;
}

const authHeaders = (token: string): Record<string, string> => ({ 'X-Figma-Token': token });

/** A token that may be sent: printable, bounded, no spaces or newlines (it is never echoed back). */
export const tokenOk = (t: unknown): t is string => typeof t === 'string' && /^[\x21-\x7e]{20,300}$/.test(t);

async function capped(res: Response, max: number): Promise<string> {
  const len = Number(res.headers.get('content-length') ?? 0);
  if (len > max) throw new Error('too large');
  const text = await res.text();
  if (text.length > max) throw new Error('too large');
  return text;
}

const reasonFor = (status: number) =>
  status === 403 ? 'Figma refused the token: it may have expired, or lack the file_content:read scope.' : status === 404 || status === 400 ? 'That Figma file was not found, or this token cannot open it.' : status === 429 ? 'Figma is limiting requests just now. Try again in a minute.' : `Figma answered ${status}.`;

/** A file's styles, components, variables (where the plan allows) and logo exports, fetched and mapped. */
export async function fetchFigmaFile(fileKey: string, token: string, deps: { fetcher?: FigmaFetcher; now?: number } = {}): Promise<{ ok: true; content: ReturnType<typeof figmaContent>; calls: FigmaCall[]; assets: BrandAsset[]; file: { name: string; version?: string; lastModified?: string } } | { ok: false; error: string; status: number; calls: FigmaCall[] }> {
  const fetcher = deps.fetcher ?? fetch;
  const calls: FigmaCall[] = [];
  const get = async (path: string): Promise<{ status: number; json?: Record<string, any> }> => {
    const endpoint = path.replace(/\?.*$/, '').replace(fileKey, ':key');
    try {
      const res = await fetcher(`${FIGMA_API}${path}`, { headers: { ...authHeaders(token), accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
      calls.push({ endpoint, status: res.status });
      if (!res.ok) return { status: res.status };
      return { status: res.status, json: JSON.parse(await capped(res, MAX_JSON)) };
    } catch {
      calls.push({ endpoint, status: 0 });
      return { status: 0 };
    }
  };
  const fileRes = await get(`/v1/files/${fileKey}?depth=1`);
  if (!fileRes.json) return { ok: false, error: fileRes.status ? reasonFor(fileRes.status) : 'Figma could not be reached.', status: fileRes.status === 404 || fileRes.status === 400 ? 404 : fileRes.status === 403 ? 403 : 502, calls };
  const file = fileRes.json;
  const styleIds = Object.keys(file.styles ?? {}).slice(0, 400);
  let nodes = null as Record<string, any> | null;
  for (let i = 0; i < styleIds.length; i += 100) {
    const r = await get(`/v1/files/${fileKey}/nodes?ids=${encodeURIComponent(styleIds.slice(i, i + 100).join(','))}`);
    if (r.json?.nodes) nodes = { nodes: { ...(nodes?.nodes ?? {}), ...r.json.nodes } };
  }
  const vr = await get(`/v1/files/${fileKey}/variables/local`);
  const variables: FigmaFetched['variables'] = vr.json?.meta ? { status: 'ok', meta: vr.json.meta } : vr.status === 403 ? { status: 'forbidden', message: 'forbidden' } : vr.status ? { status: 'error', message: `answered ${vr.status}` } : { status: 'error', message: 'unreachable' };
  const logos: FigmaFetched['logos'] = [];
  const assets: BrandAsset[] = [];
  const candidates = logoNodeIds(file, 4);
  if (candidates.length) {
    const ir = await get(`/v1/images/${fileKey}?ids=${encodeURIComponent(candidates.map((c) => c.id).join(','))}&format=svg&svg_outline_text=true`);
    for (const c of candidates) {
      const href = ir.json?.images?.[c.id];
      if (typeof href !== 'string') continue;
      let u: URL;
      try {
        u = new URL(href);
      } catch {
        continue;
      }
      if (u.protocol !== 'https:' || !IMAGE_HOST.test(u.hostname)) continue;
      try {
        const res = await fetcher(u.href, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
        calls.push({ endpoint: 'figma image export', status: res.status });
        if (!res.ok) continue;
        const svg = await capped(res, MAX_SVG);
        logos.push({ id: c.id, name: c.name, svg });
        const a = await importAsset({ name: `${c.name}.svg`, bytes: new TextEncoder().encode(svg), mime: 'image/svg+xml' }, { kind: 'logo', source: { kind: 'figma', ref: fileKey, nodeId: c.id, ...(typeof file.version === 'string' ? { version: file.version } : {}) } });
        if (a.asset) assets.push({ ...a.asset, notes: [...a.asset.notes, 'Exported from Figma; not approved'].slice(0, 8) });
      } catch {
        calls.push({ endpoint: 'figma image export', status: 0 });
      }
    }
  }
  const content = figmaContent({ file, nodes, variables, logos }, { fileKey, now: deps.now });
  content.content.assets = assets;
  return { ok: true, content, calls, assets, file: { name: String(file.name ?? ''), ...(typeof file.version === 'string' ? { version: file.version } : {}), ...(typeof file.lastModified === 'string' ? { lastModified: file.lastModified } : {}) } };
}

/** The file's current version, for managed sync's polling (one small call). */
export async function figmaVersion(fileKey: string, token: string, deps: { fetcher?: FigmaFetcher } = {}): Promise<{ ok: true; version: string; lastModified: string } | { ok: false; error: string; status: number }> {
  const fetcher = deps.fetcher ?? fetch;
  try {
    const res = await fetcher(`${FIGMA_API}/v1/files/${fileKey}?depth=1`, { headers: { ...authHeaders(token), accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT) });
    if (!res.ok) return { ok: false, error: reasonFor(res.status), status: res.status };
    const j = JSON.parse(await capped(res, MAX_JSON));
    return { ok: true, version: String(j.version ?? ''), lastModified: String(j.lastModified ?? '') };
  } catch {
    return { ok: false, error: 'Figma could not be reached.', status: 502 };
  }
}
