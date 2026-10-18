// SOCRIA EVENTS — the rules, without a database.
//
// What is held down here: name and email are the only required fields and
// any valid address is accepted (personal or .edu); marketing consent is true
// only when the box was ticked; bots are screened without bothering people;
// an unconfirmed date is never shown; a staff-only note never reaches the
// public shape; a date cannot be "confirmed" without a start; the door finds
// people by code or name; sheet and CSV rows are in the agreed columns and
// cannot smuggle in a formula; the numbers count walk-ins apart from RSVPs.

import * as E from './.tmp/events-under-test.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? (pass++, console.log('  ok   ' + n)) : (fail++, console.log('  FAIL ' + n + '  ' + x)));
const J = JSON.stringify;

console.log('\n=== the RSVP, checked ===');
{
  const good = E.checkRsvp({ fullName: '  Maya   Patel ', email: 'Maya.Patel@Gmail.com' });
  ok('name and email are enough', good.ok && good.value.fullName === 'Maya Patel');
  ok('the email is kept as typed, matched lowercased', good.ok && good.value.email === 'Maya.Patel@Gmail.com' && good.value.emailNorm === 'maya.patel@gmail.com');
  for (const e of ['someone@mavs.uta.edu', 'a@b.co', 'first.last+events@outlook.com', 'x@sub.domain.org']) ok(`${e} is accepted — no university address required`, E.checkRsvp({ fullName: 'A Person', email: e }).ok);
  for (const e of ['', 'nope', 'a@b', 'a b@c.com', 'a@b.c', '<a@b.com>', 'a@-b.com']) ok(`"${e}" is refused, on the email field`, (() => { const r = E.checkRsvp({ fullName: 'A Person', email: e }); return !r.ok && r.field === 'email'; })());
  const noName = E.checkRsvp({ fullName: ' ', email: 'a@b.com' });
  ok('a name is required', !noName.ok && noName.field === 'fullName');
  ok('marketing consent is off unless ticked', good.ok && good.value.marketingConsent === false);
  ok('…and on only for an explicit true (never "true" or 1)', E.checkRsvp({ fullName: 'A B', email: 'a@b.com', marketingConsent: 'true' }).value.marketingConsent === false && E.checkRsvp({ fullName: 'A B', email: 'a@b.com', marketingConsent: true }).value.marketingConsent === true);
  const full = E.checkRsvp({ fullName: 'A B', email: 'a@b.com', interest: 'other', interestOther: 'Robotics\nclub', source: 'student-org' });
  ok('the optional answers are kept, one line each', full.value.interest === 'other' && full.value.interestOther === 'Robotics club' && full.value.source === 'student-org');
  ok('"other" text is kept only when Other is chosen', E.checkRsvp({ fullName: 'A B', email: 'a@b.com', interest: 'ai', interestOther: 'x' }).value.interestOther === null);
  ok('answers outside the lists become nothing', E.checkRsvp({ fullName: 'A B', email: 'a@b.com', interest: 'crypto', source: 'tiktok' }).value.interest === null);
  const tags = E.checkRsvp({ fullName: 'A B', email: 'a@b.com', utm: { source: 'Instagram', campaign: 'in-public-002', medium: '<script>' }, ref: 'ACM Chapter' });
  ok('link tags are tokens, never free text', tags.value.utm.source === 'instagram' && tags.value.utm.campaign === 'in-public-002' && tags.value.utm.medium === null && tags.value.ref === 'acm-chapter');
  ok('names are clipped and stripped of control characters', E.checkRsvp({ fullName: 'A\u0000B' + 'c'.repeat(300), email: 'a@b.com' }).value.fullName.length <= 100);
}

console.log('\n=== bots, screened quietly ===');
{
  ok('a filled hidden field is a bot', E.spamSignal({ website: 'http://x', elapsedMs: 9000 }) === 'honeypot');
  ok('a form sent in under 2.5 s is a bot', E.spamSignal({ elapsedMs: 800 }) === 'too-fast');
  ok('no timing at all is refused', E.spamSignal({}) === 'too-fast');
  ok('a person passes', E.spamSignal({ website: '', elapsedMs: 14000 }) === null);
}

const row = (o = {}) => ({
  id: 'rsvp_' + 'a'.repeat(24), event_id: 'in-public-002', full_name: 'Maya Patel', email: 'maya@gmail.com', email_norm: 'maya@gmail.com',
  interest: 'ai', interest_other: null, source: 'instagram', utm_source: 'instagram', utm_medium: null, utm_campaign: 'in-public-002', ref: null,
  registered_at: Date.UTC(2026, 9, 20, 15), registered_via: 'web', attendance: 'registered', checked_in_at: null, checked_in_by: null,
  marketing_consent: false, consent_at: null, token_hash: 'h', code: 'K7P4QX', ...o,
});
const event = (o = {}) => ({
  id: 'in-public-002', title: 'Socria: In Public 002', summary: 's', description: 'd', location: 'Maverick Hall, Room 1309, University of Texas at Arlington',
  starts_at: null, ends_at: null, timezone: 'America/Chicago', date_confirmed: false, tentative_note: 'Target: Nov 4 (tentative)', status: 'open', capacity: null,
  expectations: ['A candid look'], created_at: 1, updated_at: 1, ...o,
});

console.log('\n=== the date, only when confirmed ===');
{
  const draft = E.publicEvent(event({ starts_at: Date.UTC(2026, 10, 5, 0), date_confirmed: false }));
  ok('a set but unconfirmed date is not public', draft.when.confirmed === false && E.whenSaid(draft.when) === null);
  ok('the planning note never reaches the public shape', !J(draft).includes('tentative') && !J(draft).includes('Nov 4'));
  const live = E.publicEvent(event({ starts_at: Date.UTC(2026, 10, 5, 0), ends_at: Date.UTC(2026, 10, 5, 1, 30), date_confirmed: true }));
  const w = E.whenSaid(live.when);
  ok('a confirmed date reads on the event’s own clock', w?.date === 'Wednesday, November 4, 2026' && /^6:00\s?PM – 7:30\s?PM CST$/.test(w.time), J(w));
  ok('confirmed without a start time is not a date', E.publicEvent(event({ date_confirmed: true, starts_at: null })).when.confirmed === false);
  const p = E.checkEventPatch({ date_confirmed: true }, { starts_at: null });
  ok('an admin cannot confirm a date with no start', !p.ok && /start time/.test(p.error));
  const clear = E.checkEventPatch({ starts_at: null }, { starts_at: 5 });
  ok('clearing the start un-confirms the date', clear.ok && clear.patch.date_confirmed === false);
  ok('an end before the start is refused', !E.checkEventPatch({ starts_at: 2000, ends_at: 1000 }).ok);
  ok('an unknown timezone is refused', !E.checkEventPatch({ timezone: 'Mars/Olympus' }).ok);
  const local = '2026-11-04T18:00';
  const ms = E.zonedToUtc(local, 'America/Chicago');
  ok('the admin’s wall-clock time maps to the right instant (CST, after DST ends)', ms === Date.UTC(2026, 10, 5, 0, 0), String(ms));
  ok('…and back', E.utcToZoned(ms, 'America/Chicago') === local);
  ok('…across a DST change too (CDT in October)', E.zonedToUtc('2026-10-20T18:00', 'America/Chicago') === Date.UTC(2026, 9, 20, 23, 0));
  ok('route words cannot be event addresses', E.checkNewEventId('admin') === null && E.checkNewEventId('in-public-003') === 'in-public-003' && E.checkNewEventId('In Public!') === null);
}

console.log('\n=== the door ===');
{
  const rows = [row(), row({ id: 'rsvp_' + 'b'.repeat(24), full_name: 'José Álvarez', email: 'jose@mavs.uta.edu', email_norm: 'jose@mavs.uta.edu', code: 'M3N8PA' }), row({ id: 'rsvp_' + 'c'.repeat(24), full_name: 'Maya Chen', email: 'mchen@x.com', email_norm: 'mchen@x.com', code: 'Q2W3E4' })];
  ok('a code finds exactly one person, typed any way', J(E.searchRegistrations(rows, 'k7p-4qx').map((r) => r.full_name)) === J(['Maya Patel']));
  ok('a first name finds everyone with it', E.searchRegistrations(rows, 'maya').length === 2);
  ok('accents do not get in the way', E.searchRegistrations(rows, 'jose alvarez').length === 1);
  ok('an email finds them', E.searchRegistrations(rows, 'mavs.uta').length === 1);
  ok('nothing typed, nothing shown', E.searchRegistrations(rows, '  ').length === 0);
  const d = E.doorRow(rows[0]);
  ok('the door sees a name, a masked email and the code — not the address, not the answers', d.emailHint === 'm•••@gmail.com' && !('email' in d) && !('interest' in d) && d.code === 'K7P4QX');
  ok('a check-in code never looks like 0/O or 1/I/L', !/[01OIL]/.test(E.CODE_ALPHABET) && E.CODE.test('K7P4QX'));
}

console.log('\n=== the sheet and the export ===');
{
  ok('the sheet has the agreed columns, in order', J(E.SHEET_HEADER.slice(0, 12)) === J(['Registration ID', 'Event', 'Full Name', 'Email', 'Interest', 'Other Interest', 'Acquisition Source', 'RSVP Timestamp', 'Attendance Status', 'Check-in Timestamp', 'Marketing Consent', 'Consent Timestamp']));
  const r = E.sheetRow(row({ attendance: 'attended', checked_in_at: Date.UTC(2026, 10, 5, 0, 5), marketing_consent: true, consent_at: Date.UTC(2026, 9, 20, 15) }), 'Socria: In Public 002');
  ok('a row reads as a person would want it', r[4] === 'AI and technology' && r[6] === 'Instagram' && r[8] === 'Attended' && r[9] === '2026-11-05T00:05:00.000Z' && r[10] === 'Yes' && r[11] === '2026-10-20T15:00:00.000Z');
  ok('one row per registration, the same length as the header', r.length === E.SHEET_HEADER.length);
  const evil = E.sheetRow(row({ full_name: '=HYPERLINK("http://x","click")', interest: 'other', interest_other: '+1+1' }), 'T');
  ok('a name that would run as a formula is defused', evil[2].startsWith("'=") && evil[5].startsWith("'+"));
  const csv = E.toCsv([row({ full_name: 'Smith, "Jo"' })], 'Socria: In Public 002');
  ok('CSV quotes commas and quotes, and ends rows with CRLF', csv.includes('"Smith, ""Jo"""') && csv.endsWith('\r\n') && csv.split('\r\n')[0].startsWith('Registration ID,Event'));
}

console.log('\n=== the numbers ===');
{
  const rows = [
    row({ attendance: 'attended', checked_in_at: 1 }),
    row({ id: 'rsvp_' + 'b'.repeat(24), source: 'friend', email_norm: 'b@x.com', utm_source: null, utm_campaign: null, ref: 'acm' }),
    row({ id: 'rsvp_' + 'c'.repeat(24), source: null, email_norm: 'c@x.com', registered_at: Date.UTC(2026, 9, 22, 15), marketing_consent: true, consent_at: 1 }),
    row({ id: 'rsvp_' + 'd'.repeat(24), registered_via: 'walk-in', email: null, email_norm: null, attendance: 'attended', checked_in_at: 1, source: null }),
  ];
  const s = E.statsOf(rows);
  ok('RSVPs exclude walk-ins; check-ins include them', s.rsvps === 3 && s.walkIns === 1 && s.attended === 2);
  ok('the show rate is attended RSVPs over RSVPs (1 of 3)', Math.abs(s.showRate - 1 / 3) < 1e-9);
  ok('sources, with "not answered" said', J(s.bySource.map((x) => [x.id, x.n])) === J([['instagram', 1], ['friend', 1], ['none', 1]]));
  ok('links: referral codes and campaigns kept apart', s.byCampaign.some((c) => c.id === 'ref:acm') && s.byCampaign.some((c) => c.id === 'instagram / in-public-002'));
  ok('registrations by day, on the event clock', J(s.daily) === J([{ day: '2026-10-20', n: 2 }, { day: '2026-10-22', n: 1 }]));
  ok('opt-ins counted', s.consented === 1);
  ok('no registrations: no rate, not zero', E.statsOf([]).showRate === null);
}

console.log('\n=== retention, and the email ===');
{
  ok('registrations are kept a year by default', E.retentionDays({}) === 365);
  ok('a shorter period can be set, but not under 30 days', E.retentionDays({ EVENT_RETENTION_DAYS: '90' }) === 90 && E.retentionDays({ EVENT_RETENTION_DAYS: '3' }) === 365);
  const link = E.ticketUrl('https://socria.app', 'in-public-002', 'T'.repeat(43));
  ok('the confirmation link carries its secret in the #fragment, which no server or analytics tool sees', link === `https://socria.app/events/in-public-002/ticket#t=${'T'.repeat(43)}`);
  const m = E.confirmationEmail({ event: event(), firstName: 'Maya', code: 'K7P4QX', link });
  ok('an unconfirmed date is not in the email', /to be announced/i.test(m.text) && !/Nov|November/.test(m.text));
  ok('it carries the place, the code, the link and how to cancel', m.text.includes('Maverick Hall, Room 1309') && m.text.includes('K7P4QX') && m.text.includes(link) && /cancel/i.test(m.text));
  ok('nothing about food or prizes', !/food|pizza|prize|giveaway|swag/i.test(m.text + m.html));
  const xss = E.confirmationEmail({ event: event({ title: '<img src=x onerror=alert(1)>' }), firstName: '<b>', code: 'K7P4QX', link });
  ok('the HTML is escaped', !xss.html.includes('<img src=x') && !xss.html.includes('<b>,'));
  const dated = E.confirmationEmail({ event: event({ starts_at: Date.UTC(2026, 10, 5, 0), date_confirmed: true }), firstName: 'Maya', code: 'K7P4QX', link });
  ok('a confirmed date is in it', dated.text.includes('Wednesday, November 4, 2026'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
