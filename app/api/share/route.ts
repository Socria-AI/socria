// app/api/share/route.ts
// GET  ?type=&id=          → who can reach it and how (lib/share/server.ts shareState)
// POST {type, id, action}  → change it. Actions:
//        link    {role|null}          turn the link on, change its role, or off
//        reset-link                   a new link; every copy of the old one dies
//        code    {role|null, fresh?}  an invite code on, changed, renewed, or off
//        invite  {email, role}        invite somebody by address
//        role    {memberId, role}     change what someone may do
//        remove  {memberId}           take someone out (or leave, for yourself)
//        stop                         stop sharing: link, code and everyone gone
//
// ENFORCED HERE, NOT IN THE DIALOG. Every action but leaving is the owner's,
// checked against the database (lib/share/server.ts). Opening a door — a
// link, a code, an invitation — is hosting. On Socria One, anything; on the
// free plan, one chat at a time and no Projects (lib/share/roles.ts
// hostRefusal). Closing a door is never paywalled, so an owner whose plan
// lapsed can still take everyone out.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { enforceRateLimit } from '@/lib/rate-limit';
import { resolvePlanForRequest } from '@/lib/socria-one-server';
import {
  cleanEmail, cleanRole, cleanType, hostRefusal, hostRefusalNote, landing, ROLE_WORD,
  type HostRefusal, type ResourceType,
} from '@/lib/share/roles';
import {
  ShareError, displayNameOf, invite, openShares, removeMember, resetLink, resourceInfo, setCode, setLink,
  setMemberRole, shareState, stopSharing, type OpenShare,
} from '@/lib/share/server';
import { inviteUrl, invitesOn, sendInvite } from '@/lib/share/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cleanId = (v: unknown) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,120}$/.test(v) ? v : null);

function fail(e: unknown) {
  if (e instanceof ShareError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('[share] failed', e);
  return NextResponse.json({ error: 'That could not be changed just now.' }, { status: 500 });
}

interface Hosting {
  plan: 'free' | 'one';
  refusal: HostRefusal | null;
  /** the chat a free owner already has open, when that is the reason */
  sharing: (OpenShare & { open: string }) | null;
}

/**
 * May this owner open a door on this thing — and if not, why. Socria One
 * hosts anything; the free plan, one conversation at a time and no Project.
 * Read from the database each time, never from the dialog.
 */
async function hosting(req: NextRequest, userId: string, type: ResourceType, id: string): Promise<Hosting> {
  const plan = (await resolvePlanForRequest(req, userId)) === 'one' ? 'one' : 'free';
  if (plan === 'one') return { plan, refusal: null, sharing: null };
  const open = type === 'conversation' ? await openShares(userId, 'conversation') : [];
  const others = open.filter((o) => o.id !== id);
  const refusal = hostRefusal({ plan, type, open: open.some((o) => o.id === id), othersOpen: others.length });
  const other = refusal === 'one-chat' ? others[0] ?? null : null;
  return { plan, refusal, sharing: other ? { ...other, open: landing(other) } : null };
}

/** What the sheet is told about hosting, beside who has access. */
function hostingAnswer(h: Hosting) {
  return {
    mayHost: !h.refusal,
    plan: h.plan,
    ...(h.refusal ? { refusal: h.refusal, refusalNote: hostRefusalNote(h.refusal, h.sharing?.title || (h.sharing ? 'Untitled' : null)), sharing: h.sharing } : {}),
  };
}

export async function GET(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const type = cleanType(req.nextUrl.searchParams.get('type'));
  const id = cleanId(req.nextUrl.searchParams.get('id'));
  if (!type || !id) return NextResponse.json({ error: 'Nothing to share.' }, { status: 400 });
  try {
    const state = await shareState(userId, type, id);
    if (!state) return NextResponse.json({ error: 'No such thing.' }, { status: 404 });
    const host = state.role === 'owner' ? hostingAnswer(await hosting(req, userId, type, id)) : { mayHost: false };
    return NextResponse.json({ ...state, ...host, emails: invitesOn() });
  } catch (e) {
    return fail(e);
  }
}

export async function POST(req: NextRequest) {
  const { userId } = auth();
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await enforceRateLimit(req, userId, 'aux');
  if (limited) return limited;
  const body = await req.json().catch(() => null);
  const type = cleanType(body?.type);
  const id = cleanId(body?.id);
  const action = typeof body?.action === 'string' ? body.action : '';
  if (!type || !id) return NextResponse.json({ error: 'Nothing to share.' }, { status: 400 });

  // Opening a door is hosting; closing one never is.
  const opens =
    (action === 'link' && body?.role !== null) || (action === 'code' && body?.role !== null) || action === 'invite' || action === 'reset-link';
  if (opens) {
    let h: Hosting;
    try {
      h = await hosting(req, userId, type, id);
    } catch (e) {
      return fail(e);
    }
    if (h.refusal) {
      return NextResponse.json({ error: hostRefusalNote(h.refusal, h.sharing?.title || (h.sharing ? 'Untitled' : null)), upgrade: 'share', ...hostingAnswer(h) }, { status: 402 });
    }
  }

  try {
    switch (action) {
      case 'link': {
        const role = body?.role === null ? null : cleanRole(body?.role);
        if (body?.role !== null && !role) return NextResponse.json({ error: 'Choose what people with the link can do.' }, { status: 400 });
        await setLink(userId, type, id, role);
        break;
      }
      case 'reset-link':
        await resetLink(userId, type, id);
        break;
      case 'code': {
        const role = body?.role === null ? null : cleanRole(body?.role);
        if (body?.role !== null && !role) return NextResponse.json({ error: 'Choose what people with the code can do.' }, { status: 400 });
        await setCode(userId, type, id, role, body?.fresh === true);
        break;
      }
      case 'invite': {
        const email = cleanEmail(body?.email);
        const role = cleanRole(body?.role) ?? 'viewer';
        if (!email) return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 });
        const r = await invite(userId, type, id, email, role);
        // An address with no account yet gets a one-time invitation link —
        // emailed when this deployment sends email, and handed back to the
        // owner to send themselves when it does not.
        let emailed = false;
        let link: string | null = null;
        if (r.inviteToken) {
          link = inviteUrl(r.inviteToken);
          const info = await resourceInfo(type, id);
          emailed = await sendInvite({
            to: email,
            from: await displayNameOf(userId),
            title: info?.title || 'Untitled',
            what: info?.kind ?? 'chat',
            role: ROLE_WORD[role],
            url: link,
          });
        }
        const state = await shareState(userId, type, id);
        return NextResponse.json({ ...state, invited: { known: r.known, emailed, link: emailed ? null : link } });
      }
      case 'role': {
        const role = cleanRole(body?.role);
        const memberId = cleanId(body?.memberId);
        if (!role || !memberId) return NextResponse.json({ error: 'Choose a role.' }, { status: 400 });
        await setMemberRole(userId, type, id, memberId, role);
        break;
      }
      case 'remove': {
        const memberId = cleanId(body?.memberId);
        if (!memberId) return NextResponse.json({ error: 'Nobody to remove.' }, { status: 400 });
        await removeMember(userId, type, id, memberId);
        break;
      }
      case 'stop':
        await stopSharing(userId, type, id);
        break;
      default:
        return NextResponse.json({ error: 'Unknown action.' }, { status: 400 });
    }
    const state = await shareState(userId, type, id);
    return NextResponse.json(state ?? { left: true });
  } catch (e) {
    return fail(e);
  }
}
