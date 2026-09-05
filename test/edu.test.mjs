// Socria One for students, by verified university email.
//
// Two properties matter more than the feature, and both are security
// properties rather than product ones:
//
//   VERIFIED, NOT TYPED. Anyone can write someone@mavs.uta.edu into a form.
//   What cannot be faked is receiving the code sent to it. Every check here
//   is on verification status, never on the string alone.
//
//   OFF UNLESS SWITCHED ON. The domains come from the environment, so a
//   deployment that has not opted in answers no to everything and the code is
//   inert rather than merely unused.

import {
  eduDomains, eduProgrammeOn, isEduEmail, verifiedEduEmail, hasEduAccess, eduDomainLabel,
  emailMatchesHosts, eduSchool,
} from './.tmp/socria-edu.mjs';

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

console.log('=== off unless switched on ===');
{
  for (const off of [undefined, '', '   ', ',', ' , ']) {
    withDomains(off, () => {
      ok(`${JSON.stringify(off)}: the programme is off`, eduProgrammeOn() === false);
      ok(`${JSON.stringify(off)}: no domain qualifies`, isEduEmail('a@mavs.uta.edu') === false);
      ok(`${JSON.stringify(off)}: nobody has access`, hasEduAccess([verified('a@mavs.uta.edu')]) === false);
      ok(`${JSON.stringify(off)}: and there is nothing to say`, eduDomainLabel() === '');
    });
  }
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
    ok('the programme being off silences it', eduSchool() === null);
  });
  withDomains(undefined, () => {
    ok('and so does it being unset', eduSchool() === null);
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
