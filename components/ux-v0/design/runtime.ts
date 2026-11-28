'use client';
// components/ux-v0/design/runtime.ts — the design flow's transport and bench in the browser.
//
// The transport is the design route (app/api/ux-v0/design), called with the shared post helper so a cancel, a
// timeout, a sign-in or a budget refusal is said the same way as everywhere in SocriaUX; the answer's text is passed
// on as it streams. The bench takes pictures with lib/ux-v0/design/export.ts and measures an artboard by drawing it
// in a hidden sandboxed frame whose own script reports what is cut off or outside (frame.ts INTERACT_SOURCE).

import { getArtifact } from '@/lib/ux-v0/store';
import { makeNonce } from '@/lib/ux-v0/sandbox';
import type { DesignArtboard, DesignAsset, DesignDoc } from '@/lib/ux-v0/design/doc';
import { frameDoc } from '@/lib/ux-v0/design/frame';
import { artboardPixels, lookPicture, toDataUrl } from '@/lib/ux-v0/design/export';
import { contrastFacts, contrastSaid, type TextBox } from '@/lib/ux-v0/design/contrast';
import { brandFacts, brandSaid, logoFacts, type Allowed, type BrandBasis, type ImageBox } from '@/lib/ux-v0/design/brandcheck';
import { layoutSignature, motionFacts, placementFacts, repeatedLayout, repetitionSaid, resolutionFacts } from '@/lib/ux-v0/design/production';
import type { Bench, Sent, Transport, WriteBody } from '@/lib/ux-v0/design/flow';
import { operationId, post } from '../api';

export const parseHtml = (html: string) => new DOMParser().parseFromString(html, 'text/html');

/** The route, streamed (see the head of this file). */
export function routeTransport(projectId: string): Transport {
  return {
    async send(body: WriteBody, onText, signal): Promise<Sent> {
      const r = await post<{ text: string; model?: string; usage?: Record<string, unknown> }>(
        '/api/ux-v0/design',
        { ...body, projectId },
        { signal, onText, operationId: operationId(body.mode === 'look' ? 'design-look' : 'design'), timeoutMs: 300_000 }
      );
      if (!r.ok) return { ok: false, error: r.error, ...(r.cancelled ? { cancelled: true } : {}), ...(r.signIn ? { signIn: true } : {}), ...(r.limit ? { limit: true } : {}) };
      return { ok: true, text: String(r.data.text ?? ''), model: r.data.model ?? null, usage: r.data.usage ?? null };
    },
  };
}

const dataCache = new Map<string, string>();

/** Each asset's picture as a data address (uploads read from this browser); those it does not have are left out. */
export async function assetData(assets: readonly DesignAsset[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const a of assets) {
    if (a.src.startsWith('data:')) {
      out.set(a.id, a.src);
      continue;
    }
    const hit = dataCache.get(a.src);
    if (hit) {
      out.set(a.id, hit);
      continue;
    }
    if (!a.src.startsWith('upload:')) continue;
    try {
      const rec = await getArtifact(a.src.slice('upload:'.length));
      if (!rec) continue;
      const url = await toDataUrl(rec.data);
      dataCache.set(a.src, url);
      out.set(a.id, url);
    } catch {
      /* missing: drawn as nothing, said by the workspace */
    }
  }
  return out;
}

/** An artboard drawn in a hidden frame and measured by its own script; nothing when it does not answer in time. */
export function measureOffscreen(a: DesignArtboard, tokens: string, assets: ReadonlyMap<string, string>, timeoutMs = 4000): Promise<{ issues: { id: string; kind: string; text: string }[]; height: number; texts: TextBox[]; images: ImageBox[] } | null> {
  return new Promise((resolve) => {
    const f = document.createElement('iframe');
    f.setAttribute('sandbox', 'allow-scripts');
    f.setAttribute('aria-hidden', 'true');
    f.tabIndex = -1;
    f.style.cssText = `position:fixed;left:-${a.width + 100}px;top:0;width:${a.width}px;height:${a.height}px;border:0;visibility:hidden;pointer-events:none`;
    let done = false;
    const finish = (v: { issues: { id: string; kind: string; text: string }[]; height: number; texts: TextBox[]; images: ImageBox[] } | null) => {
      if (done) return;
      done = true;
      window.removeEventListener('message', on);
      clearTimeout(timer);
      f.remove();
      resolve(v);
    };
    const on = (e: MessageEvent) => {
      if (e.source !== f.contentWindow) return;
      const m = e.data;
      if (!m || typeof m !== 'object' || m.sx !== 'ready' || m.passive) return;
      const issues = Array.isArray(m.issues) ? m.issues.filter((x: any) => x && typeof x.id === 'string' && typeof x.kind === 'string').slice(0, 20).map((x: any) => ({ id: String(x.id).slice(0, 12), kind: String(x.kind).slice(0, 12), text: String(x.text ?? '').slice(0, 60) })) : [];
      const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
      const texts: TextBox[] = Array.isArray(m.texts)
        ? m.texts
            .filter((x: any) => x && typeof x.id === 'string' && /^e\d{1,6}$/.test(x.id) && typeof x.color === 'string')
            .slice(0, 40)
            .map((x: any) => ({ id: x.id, x: n(x.x), y: n(x.y), w: n(x.w), h: n(x.h), color: String(x.color).slice(0, 60), size: n(x.size), weight: n(x.weight) || 400, text: String(x.text ?? '').slice(0, 60) }))
        : [];
      const images: ImageBox[] = Array.isArray(m.imgs)
        ? m.imgs
            .filter((x: any) => x && typeof x.id === 'string' && /^e\d{1,6}$/.test(x.id))
            .slice(0, 30)
            .map((x: any) => ({ id: x.id, nw: n(x.nw), nh: n(x.nh), w: n(x.w), h: n(x.h), fit: String(x.fit ?? '').slice(0, 20), filter: String(x.filter ?? '').slice(0, 80), opacity: typeof x.opacity === 'number' ? x.opacity : 1, blend: String(x.blend ?? '').slice(0, 20), tilt: x.tilt === true, clip: String(x.clip ?? '').slice(0, 40), vec: x.vec === true }))
        : [];
      finish({ issues, height: Number(m.height) || a.height, texts, images });
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    window.addEventListener('message', on);
    f.srcdoc = frameDoc(a, tokens, { parse: parseHtml, nonce: makeNonce(), assets, interactive: true });
    document.body.appendChild(f);
  });
}

/** Issues said in words, for the designer. */
export function issuesSaid(issues: { id: string; kind: string; text: string }[]): string[] {
  return issues.slice(0, 10).map((i) => (i.kind === 'cut' ? `words cut off in data-sx="${i.id}" (“${i.text}”)` : `words outside the artboard in data-sx="${i.id}" (“${i.text}”)`));
}

/** What a design is checked against beyond itself: its brand, its protected logos, what the person allowed. */
export interface BrandContext {
  basis: BrandBasis | null;
  protectedIds: ReadonlySet<string>;
  allowed: Allowed | undefined;
}

/** What an artboard does against its brand, as checked and as measured (lib/ux-v0/design/brandcheck.ts). */
export async function brandOf(a: DesignArtboard, tokens: string, assets: ReadonlyMap<string, string>, ctx: BrandContext, images?: ImageBox[]) {
  const imgs = images ?? (ctx.protectedIds.size && /asset:/.test(a.html) ? (await measureOffscreen(a, tokens, assets))?.images ?? [] : []);
  return [...logoFacts(imgs, a.html, ctx.protectedIds, ctx.basis), ...brandFacts(a, tokens, ctx.basis, ctx.allowed)];
}

/** The browser's bench for the flow: pictures and measures of artboards. */
export function browserBench(assets: () => Promise<Map<string, string>>, brand?: () => BrandContext | null): Bench {
  return {
    async picture(a: DesignArtboard, tokens: string) {
      return lookPicture(a, tokens, await assets());
    },
    async measure(doc: DesignDoc, ids: string[]) {
      const map = await assets();
      const out: Record<string, string[]> = {};
      for (const id of ids.slice(0, 4)) {
        const a = doc.artboards.find((x) => x.id === id);
        if (!a) continue;
        const m = await measureOffscreen(a, doc.tokens, map);
        if (m?.issues.length) out[id] = issuesSaid(m.issues);
        // the contrast of its words, measured on the picture (a still sheet: one that moves is measured as it rests)
        if (m?.texts.length) {
          const px = await artboardPixels(a, doc.tokens, map);
          const low = px ? contrastFacts(m.texts, px) : [];
          if (low.length) out[id] = [...(out[id] ?? []), ...low.map(contrastSaid)];
        }
        // against the place it is made for: a platform's interface, a sheet's trim, a picture's pixels, motion
        if (m && !a.locked) {
          const place = [...placementFacts(a, m.texts), ...resolutionFacts(a, m.images), ...motionFacts(a)];
          if (place.length) out[id] = [...(out[id] ?? []), ...place];
        }
        // against its brand: colours, faces, and the protected logo as it is drawn (a locked artboard is not re-judged)
        const ctx = brand?.();
        if (ctx && m && !a.locked) {
          const off = await brandOf(a, doc.tokens, map, ctx, m.images);
          if (off.length) out[id] = [...(out[id] ?? []), ...off.slice(0, 8).map(brandSaid)];
        }
      }
      return out;
    },
  };
}

/**
 * Whether the slides of a deck (the artboards of one group, or all of one format) mostly arrange their words the same
 * way — measured by drawing each; said about the deck, for a review. Nothing when they differ or are too few.
 */
export async function deckFact(doc: DesignDoc, of: DesignArtboard, assets: ReadonlyMap<string, string>): Promise<string | null> {
  const slides = doc.artboards.filter((a) => (of.group ? a.group === of.group : a.format === of.format && a.format === 'presentation')).slice(0, 16);
  if (slides.length < 4) return null;
  const sig: Record<string, string[]> = {};
  for (const a of slides) {
    const m = await measureOffscreen(a, doc.tokens, assets, 3000);
    if (m) sig[a.id] = layoutSignature(m.texts, a.width, a.height);
  }
  const r = repeatedLayout(sig);
  return r ? repetitionSaid(r) : null;
}
