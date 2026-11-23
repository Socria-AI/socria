// app/api/ux-v0/graphic-design/route.ts
// POST { brief, … } → { design } — a graphic designed from its brief by the creative director.
// POST { mode: 'review', sheet, picture, … } → { review } — the director looking at the rendered result.
//
// The director (lib/ux-v0/graphics/director) is told one set of instructions for every call (principles.ts) and, per
// call, the task, the person's words, the content to set, what the conversation already decided, the project's memory
// and an attached brand's constraints (prompts.ts). It answers with the idea, a palette, two faces and a design
// program — or, for a review, what it sees in the picture and a few precise edits. Whatever it answers is held to its
// shape here (schema.ts) and again in the browser, where it is scaled, passed through the program gate, compiled,
// checked and rendered (design.ts, compose.ts composeProgram): nothing a model writes is trusted or executed.
//
// When this route cannot answer (signed out, not configured, busy, over a budget), the browser composes with
// SocriaUX's own engine and says which made the design. Nothing is stored here.

import { NextRequest } from 'next/server';
import { withMeter } from '@/lib/token-meter';
import { MAX_TOKENS } from '@/lib/ux-v0/model';
import { bad, imageDataUrl, projectIdOf, readBodyPrinted } from '@/lib/ux-v0/route-kit';
import { admit, refuse, runStage } from '@/lib/ux-v0/stage-server';
import { normalizeGraphicBrief } from '@/lib/ux-v0/graphics/state';
import { formatOf } from '@/lib/ux-v0/graphics/formats';
import { frameOf } from '@/lib/ux-v0/graphics/director/frame';
import { directorSystem } from '@/lib/ux-v0/graphics/director/principles';
import { designUser, reviewUser } from '@/lib/ux-v0/graphics/director/prompts';
import { normalizeDesign, normalizeReview } from '@/lib/ux-v0/graphics/director/schema';
import { normalizeMemory, normalizeSheet } from '@/lib/ux-v0/graphics/director/sheet';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const text = (v: unknown, n: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
const list = (v: unknown, n: number, len: number) => (Array.isArray(v) ? v : []).map((x) => text(x, len)).filter(Boolean).slice(0, n);
const HEX = /^#[0-9a-fA-F]{6}$/;

export const POST = withMeter(async function POST(req: NextRequest) {
  const a = await admit(req);
  if (!a.ok) return a.res;
  const { body, print } = await readBodyPrinted(req, 900_000);
  if (!body) return refuse(req, bad('The brief is needed.'));
  const ctx = { userId: a.userId, orgId: a.orgId, projectId: projectIdOf(body.projectId), fingerprint: print };
  const memory = normalizeMemory(body.memory);

  if (body.mode === 'review') {
    const sheet = normalizeSheet(body.sheet);
    const picture = imageDataUrl(body.picture, 700_000);
    if (!sheet || !picture) return refuse(req, bad('The design and its picture are needed.'));
    const ids = new Set(sheet.objects.map((o) => o.id));
    return runStage(req, ctx, {
      stage: 'graphic-review',
      operation: 'review',
      label: 'ux-v0/graphic-review',
      prompt: {
        system: directorSystem(),
        user: reviewUser({ sheet, memory, made: text(body.made, 300) || 'a new design', measured: list(body.measured, 10, 220), protectedSaid: list(body.protectedSaid, 8, 80) }),
        maxTokens: MAX_TOKENS['graphic-review'],
        temperature: 0.3,
        images: [{ url: picture, detail: 'high' }],
        extraChars: 6000,
        cacheScope: 'director',
      },
      finish: (asked) => {
        const review = normalizeReview(asked.json, { ids });
        if (!review) return { status: 422, body: { error: 'The review came back without anything SocriaUX can use.', unreadable: true } };
        return { body: { review } };
      },
    });
  }

  const brief = normalizeGraphicBrief(body.brief);
  const f = brief ? formatOf(brief.formats[0]) : null;
  if (!brief || !f || brief.kind === 'logo') return refuse(req, bad('The brief is needed (a headline and a format).'));
  const d = body.decided && typeof body.decided === 'object' ? (body.decided as Record<string, any>) : {};
  const palette = d.palette && typeof d.palette === 'object' ? Object.fromEntries(Object.entries(d.palette as Record<string, unknown>).filter(([k, v]) => /^[a-z0-9]{1,10}$/i.test(k) && typeof v === 'string' && HEX.test(v)).slice(0, 6)) : {};
  const fonts = d.fonts && text(d.fonts.display, 60) && text(d.fonts.body, 60) ? { display: text(d.fonts.display, 60), body: text(d.fonts.body, 60) } : undefined;
  return runStage(req, ctx, {
    stage: 'graphic-design',
    operation: body.another === true ? 'another' : 'design',
    label: 'ux-v0/graphic-design',
    prompt: {
      system: directorSystem(),
      user: designUser({
        brief,
        frame: frameOf(f),
        formatLabel: f.label,
        memory,
        decided: { ...(Object.keys(palette).length ? { palette: palette as Record<string, string> } : {}), ...(fonts ? { fonts } : {}), ...(list(d.avoid, 6, 80).length ? { avoid: list(d.avoid, 6, 80) } : {}) },
        avoid: list(body.avoid, 6, 200),
        another: body.another === true,
      }),
      maxTokens: MAX_TOKENS['graphic-design'],
      temperature: 0.9,
      cacheScope: 'director',
    },
    finish: (asked) => {
      const design = normalizeDesign(asked.json);
      if (!design) return { status: 422, body: { error: asked.incomplete ? 'The design was cut short before it was complete.' : 'The design came back in a shape SocriaUX cannot build.', unreadable: true } };
      return { body: { design } };
    },
  });
});
