// app/api/ux-v0/design/route.ts
// POST { mode: 'write', words, … the design … }  → streamed: the designer's answer as it is written ({ type: 'text' })
//                                                   and, at the end, { text } — the whole answer.
// POST { mode: 'look', words, made, artboards, pictures, … } → the same, for one look at the rendered artboards.
//
// The designer writes the design itself, as HTML and CSS, in the tags of lib/ux-v0/design/protocol.ts. Nothing it
// writes is run here or trusted: the browser parses it, cleans every artboard (lib/ux-v0/design/elements.ts), and
// draws it in a sandboxed frame with no network (lib/ux-v0/design/frame.ts). This route only builds the message from
// what the browser sends (held to sizes here), asks the model through the shared stage runner (sign-in, budgets,
// concurrency, the call log, cancellation) and passes the answer on as it comes. Nothing is stored here.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, imageDataUrl, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { designSystem, focusFor, lookUser, writeUser } from '@/lib/ux-v0/design/prompts';
import { normalizeDesignState, normalizeDoc, type DesignMemory } from '@/lib/ux-v0/design/doc';
import { DEFAULT_FORMAT, formatOf } from '@/lib/ux-v0/design/formats';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// a design is written in tens of seconds; a campaign of several artboards can take a few minutes
export const maxDuration = 300;

const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => text(x, len)).filter(Boolean).slice(0, n);
const budgetMs = () => {
  const n = parseInt(process.env.SOCRIAUX_DESIGN_BUDGET_MS ?? '', 10);
  return Number.isFinite(n) && n >= 20_000 ? Math.min(n, 290_000) : 280_000;
};
/** An artboard's words, for those the model is told of in brief (no parser on the server: tags are stripped). */
const wordsOf = (html: string) =>
  html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<defs[\s\S]*?<\/defs>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400);

function measuredOf(v: unknown): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  if (!v || typeof v !== 'object') return out;
  for (const [k, x] of Object.entries(v as Record<string, unknown>).slice(0, 40)) if (/^[\w-]{1,40}$/.test(k)) out[k] = list(x, 12, 200);
  return out;
}

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;
  const { body, print } = await readBodyPrinted(req, 4_000_000);
  if (!body) return refuse(req, bad('The request is needed.'));
  const words = typeof body.words === 'string' ? body.words.trim().slice(0, 6000) : '';
  if (!words) return refuse(req, bad('Say what to make or change.'));
  const ctx = { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print };
  // the design as the browser holds it, read through the same normaliser the project store uses
  const state = normalizeDesignState({ doc: normalizeDoc(body.doc), turns: body.turns, memory: body.memory, comments: body.comments, assets: [], kind: body.kind, format: body.format, versions: [] });
  if (!state) return refuse(req, bad('The design could not be read.'));
  const memory: DesignMemory = state.memory;
  const system = body.system && typeof body.system === 'object' ? { name: text((body.system as any).name, 80) || 'the brand', rules: list((body.system as any).rules, 30, 300) } : null;
  const assets = (Array.isArray(body.assets) ? body.assets : []).slice(0, 40).map((x: any) => ({ id: text(x?.id, 40), name: text(x?.name, 120) || 'image', src: '', width: Math.round(Number(x?.width) || 1000), height: Math.round(Number(x?.height) || 1000) })).filter((x: { id: string }) => /^[\w-]{1,40}$/.test(x.id));
  const doc = state.doc;
  const measured = measuredOf(body.measured);

  if (body.mode === 'look') {
    const ids = list(body.artboards, 3, 40);
    const boards = ids.map((id) => doc.artboards.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b);
    const pictures = (Array.isArray(body.pictures) ? body.pictures : []).slice(0, boards.length).map((p: unknown) => imageDataUrl(p, 900_000));
    if (!boards.length || pictures.length !== boards.length || pictures.some((p: string | null) => !p)) return refuse(req, bad('The artboards and their pictures are needed.'));
    return runStage(req, ctx, {
      stage: 'design-look',
      operation: 'look',
      label: 'ux-v0/design-look',
      budgetMs: Math.min(budgetMs(), 120_000),
      prompt: {
        system: designSystem(),
        user: lookUser({ made: text(body.made, 400) || 'a change', words, artboards: boards, tokens: doc.tokens, measured, memory }),
        maxTokens: MAX_TOKENS['design-look'],
        temperature: 0.3,
        images: (pictures as string[]).map((url) => ({ url, detail: 'high' as const })),
        extraChars: 8000 * boards.length,
        cacheScope: 'design',
        plainText: true,
      },
      finish: (asked) => ({ body: { text: asked.raw, incomplete: asked.incomplete, model: asked.model, usage: asked.usage } }),
    });
  }

  const selection = body.selection && typeof body.selection === 'object' && typeof (body.selection as any).artboard === 'string' ? { artboard: text((body.selection as any).artboard, 40), element: typeof (body.selection as any).element === 'string' ? text((body.selection as any).element, 40) : null, label: text((body.selection as any).label, 120) } : null;
  const answering = body.answering && typeof body.answering === 'object' ? { text: text((body.answering as any).text, 600), options: list((body.answering as any).options, 6, 120) } : null;
  const focus = focusFor(words, doc.artboards, selection?.artboard ?? null);
  const words_of = Object.fromEntries(doc.artboards.filter((b) => !focus.includes(b.id)).map((b) => [b.id, wordsOf(b.html)]));
  const format = formatOf(text(body.format, 40))?.id ?? DEFAULT_FORMAT;
  // a picture of the selected artboard may travel with a request about how it looks
  const picture = imageDataUrl(body.picture, 900_000);
  return runStage(req, ctx, {
    stage: 'design-write',
    operation: 'design',
    label: 'ux-v0/design-write',
    budgetMs: budgetMs(),
    prompt: {
      system: designSystem(),
      user: writeUser({ words, selection, answering, kind: state.kind, format, memory, system, assets, comments: state.comments, turns: state.turns, tokens: doc.tokens, artboards: doc.artboards, focus, words_of, measured }),
      maxTokens: MAX_TOKENS['design-write'],
      temperature: 0.7,
      ...(picture ? { images: [{ url: picture, detail: 'high' as const }], extraChars: 8000 } : {}),
      cacheScope: 'design',
      plainText: true,
    },
    finish: (asked) => ({ body: { text: asked.raw, incomplete: asked.incomplete, model: asked.model, usage: asked.usage } }),
  });
});
