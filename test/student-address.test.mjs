// A university address is not a mailing list.
//
// Socria One is free for students, checked by a verified email address at an
// approved university. That address is on the account for one reason —
// proving eligibility — and the privacy policy now says, in so many words,
// that nothing Socria sends is ever addressed to it, and that if it is the
// only address we hold then nothing is sent at all.
//
// A promise like that is worth exactly as much as the code behind it, which
// is why the rule lives in lib/lifecycle.ts beside the sender rather than
// only on the policy page. This suite is the thing that keeps the two from
// drifting: if someone later reaches for the primary address directly, or
// widens the domain match, these fail.
//
// The domain rule is deliberately duplicated between lib/lifecycle.ts (which
// ships wherever the sender does) and lib/socria-edu.ts (which ships only
// where the programme's UI does). They are not identical, and the last block
// says why: the two answer the question in opposite directions of caution.
// GRANTING free membership must be narrow — only the exact approved domain,
// because a lookalike is registrable by anyone. REFUSING to send mail must be
// broad — a subdomain of an approved university is still that university, and
// the cost of being wrong is an email we promised not to send. So the
// sender's set must CONTAIN the programme's, and that is what is asserted.

import { isStudentAddress, lifecycleAddress, studentDomains } from './.tmp/lifecycle.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const UTA = ['mavs.uta.edu'];
const addr = (address, primary = false) => ({ address, primary });

console.log('=== the programme exists only where it is switched on ===');
{
  // Every deployment that has not opted in has SOCRIA_EDU_DOMAINS unset, and
  // then there is no such thing as a student address — the rule is inert
  // rather than merely unused.
  delete process.env.SOCRIA_EDU_DOMAINS;
  ok('no domains without the variable', studentDomains().length === 0);
  ok('nothing is a student address', isStudentAddress('someone@mavs.uta.edu') === false);
  ok('...so the primary address is simply used',
    lifecycleAddress([addr('someone@mavs.uta.edu', true)]) === 'someone@mavs.uta.edu');

  process.env.SOCRIA_EDU_DOMAINS = ' @Mavs.UTA.edu , ';
  ok('domains are read, trimmed, lowercased and unprefixed',
    JSON.stringify(studentDomains()) === JSON.stringify(['mavs.uta.edu']));
  delete process.env.SOCRIA_EDU_DOMAINS;
}

console.log('\n=== which addresses are the university’s ===');
{
  ok('the domain itself', isStudentAddress('a@mavs.uta.edu', UTA));
  ok('case does not matter', isStudentAddress('A.Person@Mavs.UTA.Edu', UTA));
  ok('a trailing dot does not matter', isStudentAddress('a@mavs.uta.edu.', UTA));
  ok('a subdomain of it counts', isStudentAddress('a@mail.mavs.uta.edu', UTA));

  // Both of these are registrable by anybody, and a naive suffix test would
  // hand them the discount — and, worse, would silence the person's email.
  ok('a lookalike suffix does not count', !isStudentAddress('a@notmavs.uta.edu', UTA));
  ok('a domain that merely contains it does not count', !isStudentAddress('a@mavs.uta.edu.example.com', UTA));
  ok('a different school does not count', !isStudentAddress('a@other.edu', UTA));
  ok('the plain address does not count', !isStudentAddress('a@gmail.com', UTA));

  // The domain is what follows the LAST "@" — an address may contain one.
  ok('only the real domain is read', !isStudentAddress('"a@mavs.uta.edu"@gmail.com', UTA));

  for (const junk of [null, undefined, 42, {}, '', 'not-an-address', '@', 'a@']) {
    ok(`${JSON.stringify(junk) ?? 'undefined'} is not a student address`, isStudentAddress(junk, UTA) === false);
  }
}

console.log('\n=== nothing Socria sends is addressed to one ===');
{
  // The ordinary case: the note goes to the primary address.
  ok('the primary address is used',
    lifecycleAddress([addr('me@gmail.com', true), addr('other@work.com')], UTA) === 'me@gmail.com');

  // The case this exists for: the university address is the PRIMARY one, and
  // the note goes to the other address instead.
  ok('a student primary is stepped past',
    lifecycleAddress([addr('me@mavs.uta.edu', true), addr('me@gmail.com')], UTA) === 'me@gmail.com');
  ok('...whichever order they arrive in',
    lifecycleAddress([addr('me@gmail.com'), addr('me@mavs.uta.edu', true)], UTA) === 'me@gmail.com');

  // And the case that decides whether the promise is real: it is the only
  // address we have. Nothing is sent. A person who handed over a student
  // address for a discount did not hand over a way to be mailed.
  ok('a student-only account is not written to',
    lifecycleAddress([addr('me@mavs.uta.edu', true)], UTA) === null);
  ok('...nor when they hold several, all at the university',
    lifecycleAddress([addr('a@mavs.uta.edu', true), addr('b@mail.mavs.uta.edu')], UTA) === null);

  // No addresses at all, and junk, are the same answer: do not send.
  ok('no addresses → null', lifecycleAddress([], UTA) === null);
  ok('null → null', lifecycleAddress(null, UTA) === null);
  ok('undefined → null', lifecycleAddress(undefined, UTA) === null);
  ok('junk entries are ignored',
    lifecycleAddress([{ address: 42 }, { address: 'no-at-sign' }, addr('me@gmail.com')], UTA) === 'me@gmail.com');

  // With the programme off, a .edu address is just an address.
  ok('with the programme off nothing is stepped past',
    lifecycleAddress([addr('me@mavs.uta.edu', true)], []) === 'me@mavs.uta.edu');
}

console.log('\n=== the sender never mails an address the programme counts ===');
{
  // Where the programme ships, every address it would grant membership for
  // must be one the sender refuses to write to. The reverse is allowed and
  // deliberate: a subdomain does not earn free membership but is still the
  // university, so the sender steps past it anyway.
  const edu = await import('./.tmp/socria-edu.mjs').then((m) => m).catch(() => null);
  if (!edu) {
    console.log('  (the student programme is not on this branch — skipped)');
  } else {
    const cases = [
      'a@mavs.uta.edu',
      'A@Mavs.UTA.Edu',
      'a@mavs.uta.edu.',
      'a@mail.mavs.uta.edu',
      'a@notmavs.uta.edu',
      'a@mavs.uta.edu.example.com',
      'a@gmail.com',
      'a@other.edu',
      'not-an-address',
    ];
    for (const c of cases) {
      const grants = edu.emailMatchesHosts(c, UTA);
      const refuses = isStudentAddress(c, UTA);
      ok(`"${c}": granted ⇒ never mailed`, !grants || refuses, `grants=${grants} refuses=${refuses}`);
    }
    // And the one place they deliberately differ, stated so nobody "fixes" it.
    ok('a subdomain earns nothing', edu.emailMatchesHosts('a@mail.mavs.uta.edu', UTA) === false);
    ok('...but is still not mailed', isStudentAddress('a@mail.mavs.uta.edu', UTA) === true);
    // Neither side is fooled by the lookalikes.
    for (const bad of ['a@notmavs.uta.edu', 'a@mavs.uta.edu.example.com']) {
      ok(`neither counts "${bad}"`, !edu.emailMatchesHosts(bad, UTA) && !isStudentAddress(bad, UTA));
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
