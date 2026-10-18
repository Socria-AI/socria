// lib/events/email.ts — the RSVP confirmation email.
//
// Transactional: sent once, because the person registered. It carries the
// event details, their check-in code, and their personal confirmation link
// (the secret travels in the link's #fragment, so it never reaches a server
// log or an analytics tool when the link is opened). No marketing, no
// unsubscribe list — consent to marketing is a separate choice and is not
// acted on here.
//
// PURE copy; the route sends it with lib/email.ts sendEmail (stream 'event').

import { publicEvent, whenSaid, type EventRow } from './model';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function ticketUrl(base: string, eventId: string, token: string): string {
  return `${base}/events/${eventId}/ticket#t=${token}`;
}

export function confirmationEmail(o: { event: EventRow; firstName: string; code: string; link: string }): { subject: string; text: string; html: string } {
  const e = publicEvent(o.event);
  const when = whenSaid(e.when);
  const whenLine = when ? `${when.date}, ${when.time}` : 'Date and time to be announced — we’ll email you when they’re confirmed.';
  const subject = `You’re registered: ${e.title}`;
  const text = [
    `Hi ${o.firstName},`,
    '',
    `You’re registered for ${e.title}.`,
    '',
    `When: ${whenLine}`,
    `Where: ${e.location}`,
    'Admission: free',
    '',
    `Your check-in code: ${o.code}`,
    '',
    'At the door, show the QR code on your confirmation page, or just tell us your name or this code.',
    `Your confirmation: ${o.link}`,
    '',
    'Can’t make it? You can cancel from your confirmation page, which also deletes your registration.',
    '',
    '— Socria',
  ].join('\n');
  const html = `<!doctype html><html><body style="margin:0;background:#F5F3EB;font-family:Georgia,serif;color:#1F2420">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F3EB;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#ffffff;border:1px solid #e7e2d3;border-radius:18px;padding:32px">
<tr><td style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#4E6230">You’re registered</td></tr>
<tr><td style="font-size:28px;line-height:1.15;padding:10px 0 16px">${esc(e.title)}</td></tr>
<tr><td style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:15px;line-height:1.6;color:#3d423c">
<p style="margin:0 0 14px">Hi ${esc(o.firstName)}, your place is saved.</p>
<p style="margin:0 0 6px"><strong>When</strong><br>${esc(whenLine)}</p>
<p style="margin:0 0 6px"><strong>Where</strong><br>${esc(e.location)}</p>
<p style="margin:0 0 18px"><strong>Admission</strong><br>Free</p>
<p style="margin:0 0 6px">Your check-in code</p>
<p style="margin:0 0 18px;font-family:ui-monospace,Menlo,monospace;font-size:26px;letter-spacing:.18em;color:#1F2420">${esc(o.code)}</p>
<p style="margin:0 0 22px">At the door, show the QR code on your confirmation page — or just tell us your name or this code.</p>
<p style="margin:0 0 22px"><a href="${esc(o.link)}" style="display:inline-block;background:#1F2420;color:#F5F3EB;text-decoration:none;padding:12px 20px;border-radius:999px;font-weight:600">Open my confirmation</a></p>
<p style="margin:0;font-size:13px;color:#5c6159">Can’t make it? Cancel from your confirmation page; that also deletes your registration.</p>
</td></tr></table></td></tr></table></body></html>`;
  return { subject, text, html };
}
