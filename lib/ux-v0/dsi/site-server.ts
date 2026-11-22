// lib/ux-v0/dsi/site-server.ts — fetching a public web page and its stylesheets for reconstruction, safely.
//
// The address the designer gives is held to: http or https only; no user name or password in it; the default port; a
// hostname with a dot that is not localhost, .local, .internal, .lan or .home.arpa, and not an IP address in a private,
// loopback, link-local, carrier-grade NAT, documentation, multicast or reserved range (IPv4 and IPv6, including IPv4
// mapped into IPv6). The hostname's addresses are resolved and every one must be public; the connection itself is made
// through a lookup that checks the address again at connect time, so a name that re-resolves to a private address
// between the check and the connection (DNS rebinding) is refused too. Redirects are followed by hand, at most three,
// each one checked again. Every answer is time-limited and size-capped while it streams; only HTML, CSS and logo
// pictures are accepted; nothing fetched is run. Only the page asked for, the stylesheets it names (eight at most)
// and its logo candidates (three at most) are fetched: no crawling.

import 'server-only';
import { lookup as dnsLookup } from 'node:dns';
import { isIP } from 'node:net';
import { importAsset } from './assets';
import { reconstructSite } from './site';
import type { BrandAsset } from './schema';

export const SITE_LIMITS = { html: 1_500_000, css: 800_000, image: 512_000, total: 3_500_000, sheets: 8, logos: 3, redirects: 3, timeout: 8000, budget: 25_000 } as const;

const v4 = (ip: string) => ip.split('.').map(Number);

/** Whether an IP address is public (not private, loopback, link-local, shared, documentation, multicast or reserved). */
export function isPublicIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const [a, b, c] = v4(ip);
    if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 192 && b === 0 && (c === 0 || c === 2)) return false;
    if (a === 192 && b === 88 && c === 99) return false;
    if (a === 198 && (b === 18 || b === 19)) return false;
    if (a === 198 && b === 51 && c === 100) return false;
    if (a === 203 && b === 0 && c === 113) return false;
    return true;
  }
  if (kind === 6) {
    const s = ip.toLowerCase().replace(/^\[|\]$/g, '');
    // IPv4 inside IPv6: mapped (::ffff:a.b.c.d), compatible, NAT64 (64:ff9b::), 6to4 (2002:xxxx:xxxx::)
    const tail = s.match(/(\d+\.\d+\.\d+\.\d+)$/);
    if (tail && /^(::ffff:|::|64:ff9b::)/.test(s)) return isPublicIp(tail[1]);
    const full = expand6(s);
    if (!full) return false;
    const w = full.map((x) => parseInt(x, 16));
    if (w.every((x) => x === 0)) return false; // ::
    if (w.slice(0, 7).every((x) => x === 0) && w[7] === 1) return false; // ::1
    if (w[0] === 0 && w[1] === 0 && w[2] === 0 && w[3] === 0 && w[4] === 0 && w[5] === 0xffff) return isPublicIp(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`);
    if (w[0] === 0x64 && w[1] === 0xff9b) return isPublicIp(`${w[6] >> 8}.${w[6] & 255}.${w[7] >> 8}.${w[7] & 255}`);
    if (w[0] === 0x2002) return isPublicIp(`${w[1] >> 8}.${w[1] & 255}.${w[2] >> 8}.${w[2] & 255}`);
    if ((w[0] & 0xfe00) === 0xfc00) return false; // unique local fc00::/7
    if ((w[0] & 0xffc0) === 0xfe80) return false; // link-local fe80::/10
    if ((w[0] & 0xff00) === 0xff00) return false; // multicast
    if (w[0] === 0x2001 && w[1] === 0x0db8) return false; // documentation
    if (w[0] === 0x0100 && w[1] === 0 && w[2] === 0 && w[3] === 0) return false; // discard-only
    if (w[0] === 0x2001 && w[1] < 0x0200) return false; // IETF protocol assignments (Teredo etc.)
    return true;
  }
  return false;
}

function expand6(s: string): string[] | null {
  if (!/^[0-9a-f:]+$/.test(s)) return null;
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const fill = 8 - head.length - tail.length;
  if (fill < 0 || (halves.length === 1 && fill !== 0)) return null;
  const all = [...head, ...Array(halves.length === 2 ? fill : 0).fill('0'), ...tail];
  return all.length === 8 && all.every((x) => /^[0-9a-f]{1,4}$/.test(x)) ? all : null;
}

const BLOCKED_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa|localdomain|corp|onion)$/i;

/** An address the designer gave, checked before any network use (see the head of this file). */
export function checkUrl(input: unknown): { ok: true; url: URL } | { ok: false; reason: string } {
  const raw = String(input ?? '').trim();
  if (!raw || raw.length > 2000) return { ok: false, reason: 'Give the address of a public web page, like https://example.com.' };
  let url: URL;
  try {
    url = new URL(/^[a-z][\w+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, reason: 'That is not a web address.' };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: 'Only http and https pages can be read.' };
  if (url.username || url.password) return { ok: false, reason: 'An address with a user name or password is not read.' };
  if (url.port && !((url.protocol === 'https:' && url.port === '443') || (url.protocol === 'http:' && url.port === '80'))) return { ok: false, reason: 'Only pages on the standard web ports are read.' };
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (isIP(host)) return isPublicIp(host) ? { ok: false, reason: 'Give the site’s name, not an IP address.' } : { ok: false, reason: 'That address is private or reserved, so it is not read.' };
  if (!host.includes('.') || BLOCKED_HOST.test(host) || host.length > 253) return { ok: false, reason: 'That is not a public website, so it is not read.' };
  url.hash = '';
  return { ok: true, url };
}

export type Resolver = (host: string) => Promise<{ address: string; family: number }[]>;
export const systemResolver: Resolver = (host) =>
  new Promise((resolve, reject) => dnsLookup(host, { all: true, verbatim: true }, (err, addrs) => (err ? reject(err) : resolve(addrs as { address: string; family: number }[]))));

/** A hostname's addresses, every one public, or why not. */
export async function resolvePublic(host: string, resolver: Resolver = systemResolver): Promise<{ ok: true; addresses: { address: string; family: number }[] } | { ok: false; reason: string }> {
  let addrs: { address: string; family: number }[];
  try {
    addrs = await resolver(host);
  } catch {
    return { ok: false, reason: `${host} could not be found.` };
  }
  if (!addrs.length) return { ok: false, reason: `${host} could not be found.` };
  const bad = addrs.find((a) => !isPublicIp(a.address));
  if (bad) return { ok: false, reason: `${host} points to a private or reserved address, so it is not read.` };
  return { ok: true, addresses: addrs };
}

/** The lookup a connection is made through: the address used is checked at connect time (no DNS rebinding). */
export function guardedLookup(resolver: Resolver = systemResolver) {
  return (hostname: string, options: { all?: boolean } | number | undefined, cb: (err: Error | null, address?: string | { address: string; family: number }[], family?: number) => void) => {
    resolvePublic(hostname, resolver).then((r) => {
      if (!r.ok) return cb(Object.assign(new Error(r.reason), { code: 'EBLOCKED' }));
      if (typeof options === 'object' && options?.all) return cb(null, r.addresses);
      cb(null, r.addresses[0].address, r.addresses[0].family);
    }, cb);
  };
}

export type Fetcher = (url: string, init: { headers: Record<string, string>; redirect: 'manual'; signal: AbortSignal }) => Promise<Response>;

let agentFetch: Fetcher | null = null;
async function defaultFetcher(): Promise<Fetcher> {
  if (agentFetch) return agentFetch;
  const { Agent, fetch } = await import('undici');
  const dispatcher = new Agent({ connect: { lookup: guardedLookup() as never, timeout: SITE_LIMITS.timeout } } as never);
  agentFetch = (url, init) => fetch(url, { ...init, dispatcher } as never) as unknown as Promise<Response>;
  return agentFetch;
}

export interface Fetched {
  url: string;
  status: number;
  type: string;
  bytes: number;
  error?: string;
}

/** One resource fetched through the checks: redirects by hand, size capped while it streams, its type checked. */
export async function guardedFetch(input: string, opts: { accept: RegExp; max: number; signal: AbortSignal; fetcher?: Fetcher; resolver?: Resolver; log?: Fetched[] }): Promise<{ ok: true; url: string; body: Uint8Array; type: string } | { ok: false; reason: string }> {
  const fetcher = opts.fetcher ?? (await defaultFetcher());
  let current = input;
  for (let hop = 0; hop <= SITE_LIMITS.redirects; hop++) {
    const checked = checkUrl(current);
    if (!checked.ok) {
      opts.log?.push({ url: current, status: 0, type: '', bytes: 0, error: checked.reason });
      return { ok: false, reason: checked.reason };
    }
    const dns = await resolvePublic(checked.url.hostname, opts.resolver);
    if (!dns.ok) {
      opts.log?.push({ url: current, status: 0, type: '', bytes: 0, error: dns.reason });
      return { ok: false, reason: dns.reason };
    }
    let res: Response;
    try {
      res = await fetcher(checked.url.href, { headers: { 'user-agent': 'SocriaUX-design-system-reader/1.0', accept: 'text/html,text/css;q=0.9,image/svg+xml;q=0.8,image/*;q=0.5' }, redirect: 'manual', signal: AbortSignal.any ? AbortSignal.any([opts.signal, AbortSignal.timeout(SITE_LIMITS.timeout)]) : opts.signal });
    } catch (e) {
      const reason = /EBLOCKED/.test(String((e as { cause?: { code?: string } })?.cause?.code ?? (e as Error)?.message)) ? 'That address resolves to a private network, so it is not read.' : (e as Error)?.name === 'TimeoutError' || (e as Error)?.name === 'AbortError' ? 'The site took too long to answer.' : 'The site could not be reached.';
      opts.log?.push({ url: current, status: 0, type: '', bytes: 0, error: reason });
      return { ok: false, reason };
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get('location');
      opts.log?.push({ url: current, status: res.status, type: 'redirect', bytes: 0 });
      if (!loc) return { ok: false, reason: 'The site redirected without saying where.' };
      try {
        current = new URL(loc, checked.url).href;
      } catch {
        return { ok: false, reason: 'The site redirected to an address that is not valid.' };
      }
      continue;
    }
    if (!res.ok) {
      opts.log?.push({ url: current, status: res.status, type: '', bytes: 0, error: `answered ${res.status}` });
      return { ok: false, reason: res.status === 404 ? 'That page was not found.' : res.status === 401 || res.status === 403 ? 'That page is not public.' : `The site answered ${res.status}.` };
    }
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!opts.accept.test(type)) {
      opts.log?.push({ url: current, status: res.status, type, bytes: 0, error: 'not an expected type' });
      return { ok: false, reason: `That address is ${type || 'of an unknown type'}, not what was expected.` };
    }
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > opts.max) {
      opts.log?.push({ url: current, status: res.status, type, bytes: len, error: 'too large' });
      return { ok: false, reason: 'That is too large to read.' };
    }
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > opts.max) {
          await reader.cancel().catch(() => undefined);
          opts.log?.push({ url: current, status: res.status, type, bytes: total, error: 'too large' });
          return { ok: false, reason: 'That is too large to read.' };
        }
        chunks.push(value);
      }
    }
    const body = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) body.set(c, off), (off += c.length);
    opts.log?.push({ url: current, status: res.status, type, bytes: total });
    return { ok: true, url: current, body, type };
  }
  return { ok: false, reason: 'The site redirected too many times.' };
}

/** A public page read and reconstructed (./site.ts), with everything fetched or refused listed. */
export async function extractSite(input: unknown, deps: { fetcher?: Fetcher; resolver?: Resolver; now?: number } = {}): Promise<{ ok: true; result: ReturnType<typeof reconstructSite>; fetched: Fetched[]; assets: BrandAsset[] } | { ok: false; error: string; status: number; fetched: Fetched[] }> {
  const checked = checkUrl(input);
  const fetched: Fetched[] = [];
  if (!checked.ok) return { ok: false, error: checked.reason, status: 400, fetched };
  const budget = AbortSignal.timeout(SITE_LIMITS.budget);
  const common = { signal: budget, fetcher: deps.fetcher, resolver: deps.resolver, log: fetched };
  const page = await guardedFetch(checked.url.href, { ...common, accept: /text\/html|application\/xhtml\+xml/, max: SITE_LIMITS.html });
  if (!page.ok) return { ok: false, error: page.reason, status: 422, fetched };
  const html = new TextDecoder().decode(page.body);
  const first = reconstructSite({ url: page.url, html, css: [] }, { now: deps.now });
  let total = page.body.length;
  const css: { url: string; text: string }[] = [];
  for (const href of first.page.stylesheets.slice(0, SITE_LIMITS.sheets)) {
    if (total > SITE_LIMITS.total) break;
    const r = await guardedFetch(href, { ...common, accept: /text\/css|text\/plain/, max: SITE_LIMITS.css });
    if (r.ok) {
      total += r.body.length;
      css.push({ url: r.url, text: new TextDecoder().decode(r.body) });
    }
  }
  const result = reconstructSite({ url: page.url, html, css }, { now: deps.now });
  const assets: BrandAsset[] = [];
  const source = { kind: 'website' as const, ref: page.url };
  for (const svg of first.page.inlineSvgLogos.slice(0, 2)) {
    const a = await importAsset({ name: `${new URL(page.url).hostname} logo.svg`, bytes: new TextEncoder().encode(svg) }, { kind: 'logo', source: { ...source, property: 'inline svg' } });
    if (a.asset) assets.push({ ...a.asset, notes: [...a.asset.notes, 'Found on the site; not approved'].slice(0, 8) });
  }
  for (const l of first.page.logos.slice(0, SITE_LIMITS.logos)) {
    if (total > SITE_LIMITS.total || assets.length >= SITE_LIMITS.logos) break;
    const r = await guardedFetch(l.src, { ...common, accept: /image\/(svg\+xml|png|jpeg|webp)/, max: SITE_LIMITS.image });
    if (!r.ok) continue;
    total += r.body.length;
    const a = await importAsset({ name: decodeURIComponent(new URL(r.url).pathname.split('/').pop() || 'logo'), bytes: r.body, mime: r.type }, { kind: 'logo', source: { ...source, file: r.url } });
    if (a.asset) assets.push({ ...a.asset, notes: [...a.asset.notes, 'Found on the site; not approved'].slice(0, 8) });
  }
  result.content.assets = assets;
  return { ok: true, result, fetched, assets };
}
