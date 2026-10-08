import 'server-only';
// lib/share/email.ts
//
// The invitation email — the one email somebody ASKED Socria to send, to an
// address they typed. So it has its own switch, separate from the lifecycle
// kill switch: INVITE_EMAILS=on. Unset is off, and then nothing is sent; the
// Share dialog hands the owner the invitation link to send themselves, which
// is honest and still takes seconds.
//
// Never logs the address. Never throws.

import { emailBaseUrl, emailFrom, SEND_TIMEOUT_MS } from '@/lib/email';

export const invitesOn = () => (process.env.INVITE_EMAILS || '').trim().toLowerCase() === 'on' && !!(process.env.RESEND_API_KEY || '').trim();

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function inviteUrl(token: string): string {
  return `${emailBaseUrl()}/s/i/${encodeURIComponent(token)}`;
}

export async function sendInvite(opts: {
  to: string;
  from: string;
  title: string;
  what: 'project' | 'chat' | 'logos';
  role: string;
  url: string;
}): Promise<boolean> {
  if (!invitesOn()) return false;
  const thing = opts.what === 'project' ? 'a Project' : opts.what === 'logos' ? 'a line of thinking in Logos' : 'a conversation';
  const subject = `${opts.from} shared ${thing} with you on Socria`;
  const text = `${opts.from} invited you to “${opts.title}” on Socria (${opts.role.toLowerCase()}).\n\nOpen it: ${opts.url}\n\nSign in with this address to accept. If you were not expecting this, you can ignore it.`;
  const html = `<div style="font-family:Georgia,serif;max-width:520px;margin:0 auto;padding:28px;color:#1f1f1f;background:#f5f3eb">
<p style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#475a28;font-family:system-ui,sans-serif">Socria</p>
<h1 style="font-weight:400;font-size:26px;line-height:1.15;margin:8px 0 14px">${esc(opts.from)} shared “${esc(opts.title)}” with you</h1>
<p style="font-family:system-ui,sans-serif;font-size:15px;line-height:1.6;color:#444">${esc(thing.charAt(0).toUpperCase() + thing.slice(1))} — ${esc(opts.role.toLowerCase())}.</p>
<p style="margin:22px 0"><a href="${esc(opts.url)}" style="font-family:system-ui,sans-serif;background:#1f1f1f;color:#f5f3eb;padding:11px 20px;border-radius:999px;text-decoration:none;font-size:14px">Open it</a></p>
<p style="font-family:system-ui,sans-serif;font-size:12.5px;color:#777">Sign in with this address to accept. If you were not expecting this, you can ignore it.</p></div>`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: emailFrom(), to: [opts.to], subject, text, html }),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!res.ok) console.error(`[share] invite email refused (${res.status})`);
    return res.ok;
  } catch {
    console.error('[share] invite email failed to send');
    return false;
  } finally {
    clearTimeout(timer);
  }
}
