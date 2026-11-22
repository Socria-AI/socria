// lib/ux-v0/image-gen-server.ts — photographs and illustrations from an image model, server-side only.
//
// The text model cannot make finished images, and SocriaUX never pretends it can. A picture from an image model
// is its own pathway, apart from code generation: its own call (OpenAI's Images API, through the official SDK),
// its own price, its own daily cap, its own line in the call log (stage "image"), and the organisation's budgets
// still hold over it. It is OFF unless the server turns it on (SOCRIAUX_IMAGE_GEN=on) and has a provider key; a
// designer asks for each picture explicitly, sees what it will cost first, and nothing is generated to fill space.
//
// The prompt is written here, from the approved brief and the direction (its subject, the treatment of pictures,
// the palette, the mood, the composition the part needs) — never the designer's whole conversation — and asks for
// no text, no logos and no watermarks. The answer is checked to be a real image (PNG, JPEG or WebP, within a size
// limit) before anything is kept. Keys never leave the server.

import type OpenAI from 'openai';
import type { DesignBrief } from './types';
import type { ProcRatio } from './assets';

type Env = Record<string, string | undefined>;
export type ImageQuality = 'low' | 'medium' | 'high';

export interface ImageGenConfig {
  enabled: boolean;
  model: string;
  quality: ImageQuality;
  /** US$ a person may spend on pictures a day */
  dailyUsd: number;
  /** why it is off, said to the designer */
  why: string;
}

const num = (v: string | undefined, d: number) => {
  const n = parseFloat(v ?? '');
  return Number.isFinite(n) && n >= 0 ? n : d;
};

export function imageGenConfig(env: Env = process.env): ImageGenConfig {
  const on = (env.SOCRIAUX_IMAGE_GEN ?? '').trim().toLowerCase() === 'on';
  const key = !!(env.OPENAI_API_KEY ?? '').trim();
  const quality = (['low', 'medium', 'high'] as const).find((q) => q === (env.SOCRIAUX_IMAGE_QUALITY ?? '').trim().toLowerCase()) ?? 'medium';
  const dailyUsd = num(env.SOCRIAUX_IMAGE_DAILY_USD, 1);
  const model = (env.SOCRIAUX_IMAGE_MODEL ?? '').trim() || 'gpt-image-1';
  const why = !on ? 'Pictures from an image model are off on this server.' : !key ? 'This server has no image provider key.' : dailyUsd <= 0 ? 'This server gives no budget to pictures.' : '';
  return { enabled: !why, model, quality, dailyUsd, why };
}

/**
 * US$ per picture, as the provider lists them for gpt-image-1 (an estimate: what is charged is what the provider
 * reports, and a deployment can set its own with SOCRIAUX_IMAGE_PRICE_<LOW|MEDIUM|HIGH> for a square picture).
 */
const LIST: Record<ImageQuality, { square: number; wide: number }> = { low: { square: 0.011, wide: 0.016 }, medium: { square: 0.042, wide: 0.063 }, high: { square: 0.167, wide: 0.25 } };

export function sizeFor(ratio: ProcRatio): '1024x1024' | '1536x1024' | '1024x1536' {
  if (ratio === '1:1') return '1024x1024';
  return ratio === '3:4' ? '1024x1536' : '1536x1024';
}

export function imagePrice(cfg: Pick<ImageGenConfig, 'quality'>, ratio: ProcRatio, env: Env = process.env): number {
  const own = num(env[`SOCRIAUX_IMAGE_PRICE_${cfg.quality.toUpperCase()}`], -1);
  const list = LIST[cfg.quality];
  const square = own >= 0 ? own : list.square;
  return sizeFor(ratio) === '1024x1024' ? square : Math.round(square * (list.wide / list.square) * 1000) / 1000;
}

export interface ImageAsk {
  brief: DesignBrief | null;
  /** what the picture is for: "the opening", "a project in the gallery"… */
  purpose: string;
  /** what it shows, when the designer said */
  subject?: string;
  ratio: ProcRatio;
  /** the direction's treatment of pictures and its colours, named */
  treatment?: string;
  colours?: string[];
  mood?: string[];
}

const clip = (s: unknown, n: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '');

/** The prompt: the subject, the use, the art direction, the composition; never text, logos or watermarks. */
export function imagePrompt(a: ImageAsk): string {
  const b = a.brief;
  const subject = clip(a.subject, 200) || clip(b?.objective, 200) || 'the subject of the brief';
  const lines = [
    `Subject: ${subject}.`,
    `It is ${clip(a.purpose, 120) || 'a picture'} for ${clip(b?.objective, 160) || 'a website'}${b?.audience ? `, seen by ${clip(b.audience, 100)}` : ''}.`,
    a.treatment ? `Treatment: ${clip(a.treatment, 120)}.` : '',
    a.colours?.length ? `Colours that belong with it: ${a.colours.slice(0, 5).map((c) => clip(c, 30)).join(', ')}.` : '',
    a.mood?.length || b?.personality?.length ? `Mood: ${(a.mood?.length ? a.mood : b!.personality).slice(0, 4).map((m) => clip(m, 30)).join(', ')}.` : '',
    `Composition for a ${a.ratio} frame, the subject placed to leave room for type; natural, believable light.`,
    'No text, letters, numbers, logos, signage or watermarks anywhere in the picture.',
  ];
  return lines.filter(Boolean).join(' ').slice(0, 1800);
}

/** A model's answer, checked to be a real picture of a size SocriaUX keeps. */
export function checkImage(b64: unknown, maxBytes = 8 * 1024 * 1024): { ok: true; mime: string; bytes: number } | { ok: false; error: string } {
  if (typeof b64 !== 'string' || b64.length < 64) return { ok: false, error: 'No picture came back.' };
  if (!/^[A-Za-z0-9+/=\s]+$/.test(b64.slice(0, 4096))) return { ok: false, error: 'What came back was not a picture.' };
  const head = Buffer.from(b64.slice(0, 64), 'base64');
  const bytes = Math.floor((b64.replace(/\s/g, '').length * 3) / 4);
  if (bytes > maxBytes) return { ok: false, error: 'The picture was too large to keep.' };
  const png = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  const jpg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const webp = head.slice(0, 4).toString('ascii') === 'RIFF' && head.slice(8, 12).toString('ascii') === 'WEBP';
  if (!png && !jpg && !webp) return { ok: false, error: 'What came back was not a picture SocriaUX can keep.' };
  return { ok: true, mime: png ? 'image/png' : jpg ? 'image/jpeg' : 'image/webp', bytes };
}

/** One picture from the provider (the route makes at most one per request and records what it cost). */
export async function generateImage(client: OpenAI, cfg: ImageGenConfig, prompt: string, ratio: ProcRatio, signal?: AbortSignal): Promise<{ b64: string }> {
  const res = await client.images.generate({ model: cfg.model, prompt, size: sizeFor(ratio), quality: cfg.quality, n: 1 } as Parameters<OpenAI['images']['generate']>[0], { signal });
  const b64 = (res as { data?: { b64_json?: string }[] }).data?.[0]?.b64_json ?? '';
  return { b64 };
}
