// app/api/mr/route.ts
// GET    → whether MR runs on this deployment, the person's MR settings (and
//          the stamp they were read at), what MR adjusted for them (newest
//          first; ?conversation=<id> for one), and how many adjustments in
//          force that list has no entry for (`unlisted`)
// PUT    → change their settings: { enabled?: boolean, carryAcross?: boolean }
//          → { ok, settings, stamp } — the stamp orders two answers that
//          arrive out of order
// DELETE → forget what MR recorded: one conversation's rows
//          (?conversation=<id>), or all of them and a reset stamp. Rows
//          removed but the reset not recorded is its own answer
//          (500 { ok: false, deleted: true, stamped: false }), never
//          "nothing was cleared"
//
// Metacognitive Regulation changes how Socria helps somebody — fewer
// questions, a shorter reply, a worked example. That is only acceptable if
// they can see that it happened, switch it off, and remove what was kept
// (docs/MR.md, Privacy). This route is that. Every response is codes, counts,
// turn indices and times: the ledger holds no words, and nothing here adds
// any.
//
// Research participation is NOT settable here. It is a consent a study's own
// flow records; a product settings switch that could set it would be the
// silent enrolment the design forbids.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { cleanId } from '@/lib/mind/logos-turn';
import { mrMode } from '@/lib/mr/config';
import { publicSettings } from '@/lib/mr/adaptation';
import { summarize, unlistedInForce } from '@/lib/mr/ledger';
import { deleteForUser, forgetConversation, listForUser, readSettings, stampReset, writeSettings } from '@/lib/mr/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: NO_STORE });

/** ?conversation=<id>: absent → undefined, malformed → null (a 400), otherwise the id. */
function conversationOf(req: NextRequest): string | null | undefined {
  const raw = req.nextUrl.searchParams.get('conversation');
  if (raw === null) return undefined;
  return cleanId(raw);
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const conversation = conversationOf(req);
  if (conversation === null) return json({ error: 'Which conversation?' }, 400);

  // The decisions, and the exposure and outcome rows that say whether each is
  // still in force — read separately, so a long run of turns cannot push the
  // decisions themselves out of the page.
  const scope = conversation === undefined ? {} : { conversationKey: conversation };
  const [st, decisions, context] = await Promise.all([
    readSettings(userId),
    listForUser(userId, { limit: 50, kinds: ['decision'], ...scope }),
    listForUser(userId, { limit: 500, kinds: ['exposure', 'outcome'], ...scope }),
  ]);
  const since = st.ok ? st.settings.resetAt : null;
  const rows = [...decisions.rows, ...context.rows].filter((r) => since === null || r.created_at > since);
  const incomplete = [...(st.ok ? [] : ['settings']), ...(decisions.ok && context.ok ? [] : ['adjustments'])];

  return json({
    // Active only where MR actually changes replies: in shadow it decides
    // nothing that reaches anyone, and a control that promises adjustments
    // would be a placebo there.
    active: mrMode() === 'on',
    // Unreadable settings are null, never the defaults: their "off" may be
    // exactly what could not be read. The markers the server keeps for
    // itself are not part of their settings.
    settings: st.ok ? publicSettings(st.settings) : null,
    ...(st.ok && typeof st.stamp === 'number' ? { stamp: st.stamp } : {}),
    // a "from now on" taken back elsewhere (their settings keep that too) is not shown as reaching every conversation
    adjustments: summarize(rows, Date.now(), { revokedStanding: st.ok ? st.settings.revokedStanding : [] }),
    // in force, and not in that list — what they asked for before a reset still holds where they asked for it
    unlisted: unlistedInForce(rows),
    // The database cannot hold settings yet: a change would not be kept.
    ...(st.missing ? { settingsUnsupported: true } : {}),
    ...(incomplete.length ? { incomplete } : {}),
  });
}

const SETTABLE = new Set(['enabled', 'carryAcross']);

export async function PUT(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Nothing to change.' }, 400);
  const keys = Object.keys(body);
  if ('research' in body) return json({ error: 'Research participation is set only through a study\'s own consent.' }, 400);
  if (!keys.length || keys.some((k) => !SETTABLE.has(k))) return json({ error: 'Only enabled and carryAcross can be set here.' }, 400);
  if (keys.some((k) => typeof (body as Record<string, unknown>)[k] !== 'boolean')) return json({ error: 'Set it to true or false.' }, 400);

  const patch: { enabled?: boolean; carryAcross?: boolean } = {};
  if ('enabled' in body) patch.enabled = (body as { enabled: boolean }).enabled;
  if ('carryAcross' in body) patch.carryAcross = (body as { carryAcross: boolean }).carryAcross;

  const r = await writeSettings(userId, patch);
  if (r.ok && r.settings) return json({ ok: true, settings: publicSettings(r.settings), ...(typeof r.stamp === 'number' ? { stamp: r.stamp } : {}) });
  // A switch that silently did not switch is worse than an error: say so.
  if (r.missing) return json({ error: 'This account cannot keep MR settings yet.', unsaved: Object.keys(patch) }, 503);
  return json({ error: 'Could not save that.' }, 500);
}

export async function DELETE(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return json({ error: 'Unauthorized' }, 401);
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;

  const conversation = conversationOf(req);
  if (conversation === null) return json({ error: 'Which conversation?' }, 400);

  if (conversation !== undefined) {
    // Marked first, as the reset is below: a turn of that conversation still
    // in flight writes its rows after this delete, and the mark is how
    // lib/mr/store.ts writeRows knows not to put them back. What their words
    // took back there is kept in the same write. A mark that cannot be kept
    // does not stop the delete.
    const r = await forgetConversation(userId, conversation);
    return r.ok ? json({ ok: true }) : json({ error: 'Could not delete that.' }, 500);
  }

  // Everything. The reset is stamped FIRST, so that anything recorded before
  // it is never read back even if the delete misses it — nor written back:
  // a turn already in flight stamps its rows with the time it began, and
  // lib/mr/store.ts writeRows does not write a row from before their reset.
  // Without the column the stamp cannot be kept, and the delete alone still
  // removes everything there is. A stamp that failed (tried twice) is tried
  // twice more after the delete; if it still fails the rows are gone and the
  // reset is not, and the answer says exactly that — its own answer
  // (`deleted: true, stamped: false`), never the plain failure that would
  // tell them nothing was cleared.
  const reset = await stampReset(userId);
  const gone = await deleteForUser(userId);
  if (!gone.ok) return json({ error: 'Could not delete what MR recorded. Please try again.' }, 500);
  if (!reset.ok && !reset.missing) {
    const again = await stampReset(userId);
    if (!again.ok && !again.missing) {
      return json({ ok: false, deleted: true, stamped: false, error: 'What MR recorded was removed, but the reset itself could not be saved. Please reset again.' }, 500);
    }
  }
  return json({ ok: true });
}
