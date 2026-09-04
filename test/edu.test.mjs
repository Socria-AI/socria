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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
