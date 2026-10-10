// Socria One for students, by verified university email.
//
// Two properties matter more than the feature, and both are security
// properties rather than product ones:
//
//   VERIFIED, NOT TYPED. Anyone can write someone@mavs.uta.edu into a form.
//   What cannot be faked is receiving the code sent to it. Every check here
//   is on verification status, never on the string alone.
//
//   OFF UNLESS SWITCHED ON. The domains come from the environment — or from a
//   student offer while it is open, which is that same decision made for one
//   school and one semester. Past the offer, a deployment that has not opted
//   in answers no to everything and the code is inert rather than merely
//   unused.
//
// And the offer itself: the FIRST MONTH free, once per account, begun when a
// verified address is first seen while the offer is open.

import {
  eduDomains, eduProgrammeOn, isEduEmail, verifiedEduEmail, hasEduAccess, eduDomainLabel,
  emailMatchesHosts, eduSchool, STUDENT_OFFER, studentOfferOpen, readStudentMonth, studentStanding,
} from './.tmp/socria-edu.mjs';

/** A moment while the offer is open, and one after it has closed. */
const OPEN = Date.UTC(2026, 9, 10, 15);
const AFTER = STUDENT_OFFER.closes + 1;
const DAY = 86_400_000;

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

/** Run a body with SOCRIA_EDU_DOMAINS set, and always put it back. */
const withDomains = (value, fn) => {
  const before = process.env.SOCRIA_EDU_DOMAINS;
  if (value === undefined) delete process.env.SOCRIA_EDU_DOMAINS;
  else process.env.SOCRIA_EDU_DOMAINS = value;
  try { return fn(); } finally {
    if (before === undefined) delete process.env.SOCRIA_EDU_DOMAINS;
    else process.env.SOCRIA_EDU_DOMAINS = before;
  }
};
const verified = (a) => ({ emailAddress: a, verification: { status: 'verified' } });
const unverified = (a) => ({ emailAddress: a, verification: { status: 'unverified' } });

console.log('=== off unless switched on — once the offer has closed ===');
{
  for (const off of [undefined, '', '   ', ',', ' , ']) {
    withDomains(off, () => {
      ok(`${JSON.stringify(off)}: the programme is off`, eduProgrammeOn(AFTER) === false);
      ok(`${JSON.stringify(off)}: no domain qualifies`, isEduEmail('a@mavs.uta.edu', AFTER) === false);
      ok(`${JSON.stringify(off)}: nobody has access`, hasEduAccess([verified('a@mavs.uta.edu')], AFTER) === false);
      ok(`${JSON.stringify(off)}: and there is nothing to say`, eduDomainLabel(AFTER) === '');
    });
  }
}

console.log('\n=== this semester’s offer switches it on, for UTA alone ===');
{
  ok('the offer is for UT Arlington’s student domain', JSON.stringify(STUDENT_OFFER.domains) === JSON.stringify(['mavs.uta.edu']));
  ok('  a month of thirty days', STUDENT_OFFER.days === 30);
  ok('  closing at the end of 9 December 2026, Central time', new Date(STUDENT_OFFER.closes).toISOString() === '2026-12-10T06:00:00.000Z');
  ok('open now, closed after', studentOfferOpen(OPEN) && !studentOfferOpen(AFTER));
  withDomains(undefined, () => {
    ok('unset, while open: the programme is on', eduProgrammeOn(OPEN) === true);
    ok('  for the offer’s domain', JSON.stringify(eduDomains(OPEN)) === JSON.stringify(['mavs.uta.edu']));
    ok('  named as UT Arlington', eduSchool(OPEN)?.short === 'UTA');
    ok('  and a verified UTA address qualifies', hasEduAccess([verified('a@mavs.uta.edu')], OPEN) === true);
    ok('  but not the staff domain, nor another school', !isEduEmail('a@uta.edu', OPEN) && !isEduEmail('a@other.edu', OPEN));
    ok('  and still verified, not typed', hasEduAccess([unverified('a@mavs.uta.edu')], OPEN) === false);
  });
  withDomains('example.edu', () => {
    ok('the variable, when set, decides instead', JSON.stringify(eduDomains(OPEN)) === JSON.stringify(['example.edu']) && !isEduEmail('a@mavs.uta.edu', OPEN));
    ok('  whatever the date', JSON.stringify(eduDomains(AFTER)) === JSON.stringify(['example.edu']));
  });
}

console.log('\n=== the first month, free — once ===');
{
  withDomains(undefined, () => {
    const uta = [verified('me@gmail.com'), verified('ella@mavs.uta.edu')];
    const first = studentStanding({ emails: uta, recorded: null, now: OPEN });
    ok('a verified student with no month begins one now', first.begins && first.active && first.month?.since === OPEN);
    ok('  thirty days long', first.month?.until === OPEN + 30 * DAY);
    ok('  with the address that began it', first.month?.email === 'ella@mavs.uta.edu' && first.email === 'ella@mavs.uta.edu');

    const recorded = readStudentMonth({ email: 'ella@mavs.uta.edu', since: OPEN });
    ok('the record reads back as the same month', recorded?.until === OPEN + 30 * DAY && recorded?.email === 'ella@mavs.uta.edu');
    const day12 = studentStanding({ emails: uta, recorded, now: OPEN + 12 * DAY });
    ok('day twelve: Socria One, and nothing new to record', day12.active && !day12.begins);
    const day31 = studentStanding({ emails: uta, recorded, now: OPEN + 30 * DAY + 1 });
    ok('day thirty-one: over', !day31.active && !day31.begins && day31.month?.until === OPEN + 30 * DAY);
    ok('  and never a second month, while the offer is still open', studentOfferOpen(OPEN + 31 * DAY) && !studentStanding({ emails: uta, recorded, now: OPEN + 31 * DAY }).begins);

    const removed = studentStanding({ emails: [verified('me@gmail.com')], recorded, now: OPEN + 5 * DAY });
    ok('removing the address pauses it', !removed.active && !removed.begins);
    const readded = studentStanding({ emails: uta, recorded, now: OPEN + 6 * DAY });
    ok('  adding it back picks the SAME month up — it does not begin another', readded.active && !readded.begins && readded.month?.since === OPEN);
    const typed = studentStanding({ emails: [verified('me@gmail.com'), unverified('ella@mavs.uta.edu')], recorded: null, now: OPEN });
    ok('an unverified address begins nothing', !typed.begins && !typed.active && typed.month === null);
    const late = studentStanding({ emails: uta, recorded: null, now: AFTER });
    ok('verified after the offer closed: no month', !late.begins && !late.active && late.month === null);
    const straddle = readStudentMonth({ email: 'ella@mavs.uta.edu', since: STUDENT_OFFER.closes - 2 * DAY });
    const january = studentStanding({ emails: uta, recorded: straddle, now: STUDENT_OFFER.closes + 10 * DAY });
    ok('a month begun before the close runs its whole length past it', january.active && eduProgrammeOn(STUDENT_OFFER.closes + 10 * DAY) === false);
  });
  for (const junk of [null, undefined, 'x', 42, {}, { email: '' , since: 5 }, { email: 'a@mavs.uta.edu' }, { email: 'a@mavs.uta.edu', since: 'yesterday' }, { email: 'a@mavs.uta.edu', since: -1 }, { email: 'a@mavs.uta.edu', since: Infinity }]) {
    ok(`a record of ${JSON.stringify(junk)} reads as none`, readStudentMonth(junk) === null);
  }
  ok('a record’s address is read as the address, whatever its case', readStudentMonth({ email: ' Ella@MAVS.uta.edu ', since: OPEN })?.email === 'ella@mavs.uta.edu');
}

console.log('\n=== verified, not typed ===');
{
  withDomains('mavs.uta.edu', () => {
    ok('a verified university address qualifies', hasEduAccess([verified('ella@mavs.uta.edu')]) === true);
    ok('and it says which one', verifiedEduEmail([verified('ella@mavs.uta.edu')]) === 'ella@mavs.uta.edu');

    // The whole point: typing is not evidence.
    ok('an UNVERIFIED one does not', hasEduAccess([unverified('ella@mavs.uta.edu')]) === false);
    for (const status of ['unverified', 'transferable', 'failed', 'expired', '', null, undefined]) {
      ok(`status ${JSON.stringify(status)} does not qualify`,
        hasEduAccess([{ emailAddress: 'a@mavs.uta.edu', verification: { status } }]) === false);
    }
    ok('no verification object at all does not', hasEduAccess([{ emailAddress: 'a@mavs.uta.edu' }]) === false);
    ok('a null verification does not', hasEduAccess([{ emailAddress: 'a@mavs.uta.edu', verification: null }]) === false);

    // Their ordinary account, with the university address added alongside.
    ok('a personal address beside a verified one still qualifies',
      hasEduAccess([verified('me@gmail.com'), verified('ella@mavs.uta.edu')]) === true);
    ok('and the university one is the one named',
      verifiedEduEmail([verified('me@gmail.com'), verified('ella@mavs.uta.edu')]) === 'ella@mavs.uta.edu');
    ok('a verified personal address alone does not qualify',
      hasEduAccess([verified('me@gmail.com')]) === false);
    ok('nor does an unverified university one beside a verified personal one',
      hasEduAccess([verified('me@gmail.com'), unverified('ella@mavs.uta.edu')]) === false);
  });
}

console.log('\n=== the domain must be the domain ===');
{
  withDomains('mavs.uta.edu', () => {
    ok('the exact domain matches', isEduEmail('a@mavs.uta.edu') === true);
    ok('case does not matter', isEduEmail('A@MAVS.UTA.EDU') === true);
    ok('nor does surrounding space', isEduEmail('  a@mavs.uta.edu  '.trim()) === true);

    // A suffix test would accept every one of these, and each is registrable
    // by anyone who wants free access.
    ok('a longer domain does NOT match', isEduEmail('a@notmavs.uta.edu') === false);
    ok('a domain that merely ends with it does not', isEduEmail('a@evilmavs.uta.edu') === false);
    ok('nor one that continues past it', isEduEmail('a@mavs.uta.edu.attacker.com') === false);
    ok('nor a parent domain', isEduEmail('a@uta.edu') === false);
    ok('nor a subdomain of it', isEduEmail('a@sub.mavs.uta.edu') === false);
    // The address part is not the domain.
    ok('the domain in the local part does not count', isEduEmail('mavs.uta.edu@gmail.com') === false);
    ok('and neither does a second @', isEduEmail('a@gmail.com@mavs.uta.edu') === true);
    ok('but only because the LAST @ decides', isEduEmail('a@mavs.uta.edu@gmail.com') === false);

    for (const junk of ['', '   ', 'nope', '@', 'a@', '@mavs.uta.edu', null, undefined, 42, {}, []]) {
      ok(`${JSON.stringify(junk)} is not an address`, isEduEmail(junk) === false);
    }
  });
}

console.log('\n=== configuration is forgiving about how it is written ===');
{
  withDomains(' @MAVS.UTA.EDU , .example.edu ', () => {
    ok('a leading @ is tolerated', isEduEmail('a@mavs.uta.edu') === true);
    ok('a leading dot too', isEduEmail('b@example.edu') === true);
    ok('two domains both work', eduDomains().length === 2);
    ok('and the label names both', eduDomainLabel() === '@mavs.uta.edu or @example.edu', eduDomainLabel());
  });
  withDomains('mavs.uta.edu', () => {
    ok('one domain reads as one', eduDomainLabel() === '@mavs.uta.edu');
  });
  withDomains('a.edu,b.edu,c.edu', () => {
    ok('three read as a list', eduDomainLabel() === '@a.edu, @b.edu or @c.edu', eduDomainLabel());
  });
}

console.log('\n=== nothing else is an input ===');
{
  withDomains('mavs.uta.edu', () => {
    for (const junk of [null, undefined, 'emails', 42, {}]) {
      ok(`${JSON.stringify(junk)} is not a list`, hasEduAccess(junk) === false);
    }
    ok('an empty list is not access', hasEduAccess([]) === false);
    ok('a list of junk is not access',
      hasEduAccess([null, undefined, 'a@mavs.uta.edu', 42, {}]) === false);
  });
}

console.log('\n=== the browser gets the same rule, not a second one ===');
{
  // The verification form runs in the browser, which cannot read
  // SOCRIA_EDU_DOMAINS, so it checks against the host list the plan endpoint
  // hands it. That check must not be a looser copy of the one above — this is
  // where a suffix match or a local-part match would quietly reappear.
  const hosts = ['mavs.uta.edu'];
  ok('the qualifying domain matches', emailMatchesHosts('ella@mavs.uta.edu', hosts) === true);
  ok('case does not matter', emailMatchesHosts('ELLA@MAVS.UTA.EDU', hosts) === true);
  ok('a different domain does not', emailMatchesHosts('ella@gmail.com', hosts) === false);
  ok('a longer label is not a match',
    emailMatchesHosts('a@notmavs.uta.edu', hosts) === false);
  ok('and neither is a subdomain of it',
    emailMatchesHosts('a@mavs.uta.edu.example.com', hosts) === false);
  ok('the domain in the local part does not count',
    emailMatchesHosts('mavs.uta.edu@gmail.com', hosts) === false);
  ok('the LAST @ decides', emailMatchesHosts('a@gmail.com@mavs.uta.edu', hosts) === true);
  ok('so this one does not qualify',
    emailMatchesHosts('a@mavs.uta.edu@gmail.com', hosts) === false);

  ok('an empty host list matches nothing',
    emailMatchesHosts('ella@mavs.uta.edu', []) === false);
  for (const junk of ['', '   ', 'nope', '@', 'a@', '@mavs.uta.edu', null, undefined, 42, {}, []]) {
    ok(`${JSON.stringify(junk)} is not an address`, emailMatchesHosts(junk, hosts) === false);
  }

  // The two must agree wherever both can answer, because they are the same
  // decision made in two places.
  withDomains('mavs.uta.edu, example.edu', () => {
    const list = eduDomains();
    for (const address of [
      'ella@mavs.uta.edu', 'ELLA@Example.edu', 'a@gmail.com', 'a@notmavs.uta.edu',
      'a@mavs.uta.edu.example.com', 'mavs.uta.edu@gmail.com', 'a@', '@x.edu', 'nope',
    ]) {
      ok(`server and client agree on ${address}`,
        isEduEmail(address) === emailMatchesHosts(address, list), address);
    }
  });
}

console.log('\n=== naming the school, and knowing when not to ===');
{
  // Naming the place is better copy than "a university address" — but only
  // while it is true. Every case below where it stays quiet is a case where
  // naming one school would tell another school's students they do not
  // qualify, which is worse than the vague wording it replaced.
  withDomains('mavs.uta.edu', () => {
    ok('the student domain names UT Arlington', eduSchool()?.name === 'UT Arlington');
    ok('and shortens to UTA', eduSchool()?.short === 'UTA');
  });
  withDomains('uta.edu', () => {
    ok('so does the staff domain', eduSchool()?.name === 'UT Arlington');
  });
  withDomains(' @MAVS.UTA.EDU , uta.edu ', () => {
    ok('two domains at one school still name it', eduSchool()?.name === 'UT Arlington');
  });

  withDomains('mavs.uta.edu, example.edu', () => {
    ok('an unknown domain alongside silences it', eduSchool() === null);
  });
  withDomains('example.edu', () => {
    ok('an unknown domain alone silences it', eduSchool() === null);
  });
  withDomains('', () => {
    ok('the programme being off silences it', eduSchool(AFTER) === null);
  });
  withDomains(undefined, () => {
    ok('and so does it being unset, once the offer has closed', eduSchool(AFTER) === null);
  });

  // The naming must never be what decides access.
  withDomains('example.edu', () => {
    ok('an unnamed school still qualifies', isEduEmail('a@example.edu') === true);
    ok('and still grants access', hasEduAccess([
      { emailAddress: 'a@example.edu', verification: { status: 'verified' } },
    ]) === true);
  });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
