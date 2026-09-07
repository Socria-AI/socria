// Getting into Socria, and not getting sent somewhere else on the way.
//
// Nothing in the app linked to /sign-up. Every entry point sent people to
// /sign-in, and the only route to creating an account was the small footer
// link inside Clerk's own card — on a page whose copy said "Welcome back" and
// "pick up where you left off". Somebody trying to join wrote in to ask how,
// which is about as clear as a bug report ever gets.
//
// The fix carries `redirect_url` between the two doors, so discovering
// mid-sign-in that you have no account does not lose where you were going.
// That is also what makes this worth testing hard: the value comes off the
// query string and goes into an anchor, and an auth screen is the most
// valuable place on any site to plant a redirect. Somebody who followed a link
// saying "sign in to Socria", signed in, and was bounced to a page that is not
// Socria has been phished with our own domain doing the convincing.
//
// So the rule is a path on this site and nothing else, and the second block
// tries the standard ways past that rule.

import { isSafeRedirect, authUrl, otherAuth, AUTH_CROSSLINK } from './.tmp/auth-links.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

console.log('=== a path on this site is fine ===');
{
  for (const p of ['/chat', '/one?checkout=1', '/account', '/chat?model=logos', '/a/b/c#frag']) {
    ok(`${p} is accepted`, isSafeRedirect(p) === true);
  }
  ok('and it round-trips through the link',
    authUrl('sign-up', '/chat?model=logos') ===
      '/sign-up?redirect_url=' + encodeURIComponent('/chat?model=logos'));
  ok('encoded once, not twice',
    !authUrl('sign-in', '/one?checkout=1').includes('%253A'));
}

console.log('\n=== and nothing else is ===');
{
  // Real techniques for getting past a naive "must start with /" check, which
  // is the check this replaced.
  const attacks = [
    ['an absolute URL', 'https://evil.example'],
    ['a scheme-less absolute', 'evil.example/login'],
    ['protocol-relative', '//evil.example'],
    ['protocol-relative with a path', '//evil.example/socria'],
    ['backslash protocol-relative', '/\\evil.example'],
    ['javascript:', 'javascript:alert(1)'],
    ['data:', 'data:text/html,<script>1</script>'],
    ['a newline, for header smuggling', '/chat\nLocation: https://evil.example'],
    ['a carriage return', '/chat\r\nSet-Cookie: a=b'],
    ['a null byte', '/chat\u0000'],
    ['a bare relative path', 'chat'],
    ['the empty string', ''],
    ['whitespace only', '   '],
  ];
  for (const [what, v] of attacks) {
    ok(`${what} is refused`, isSafeRedirect(v) === false, JSON.stringify(v));
    ok(`  ...and never reaches the link`, !authUrl('sign-in', v).includes('redirect_url'));
  }

  for (const junk of [null, undefined, 42, {}, [], true, () => {}]) {
    ok(`${typeof junk} is refused`, isSafeRedirect(junk) === false);
  }

  // Nothing legitimate needs half a kilobyte, and length is a cheap way to
  // push something odd through whatever is downstream.
  ok('an absurdly long path is refused', isSafeRedirect('/' + 'a'.repeat(600)) === false);
  ok('a reasonable one is not', isSafeRedirect('/' + 'a'.repeat(100)) === true);
}

console.log('\n=== a refused redirect still gives a working door ===');
{
  // Dropping the redirect must never drop the LINK: somebody who arrives with
  // a hostile query param should still be able to sign in.
  ok('sign-in without a redirect', authUrl('sign-in') === '/sign-in');
  ok('sign-up without a redirect', authUrl('sign-up') === '/sign-up');
  ok('an attack yields the plain door',
    authUrl('sign-up', 'https://evil.example') === '/sign-up');
  ok('so does junk', authUrl('sign-in', null) === '/sign-in');
}

console.log('\n=== the two doors point at each other ===');
{
  ok('sign-in offers sign-up', otherAuth('sign-in') === 'sign-up');
  ok('sign-up offers sign-in', otherAuth('sign-up') === 'sign-in');
  // The sign-in copy is the one that had to change: it is the page everybody
  // was sent to, including people with no account.
  ok('sign-in speaks to somebody new', AUTH_CROSSLINK['sign-in'].lead === 'New to Socria?');
  ok('and offers to make an account', /Create an account/.test(AUTH_CROSSLINK['sign-in'].action));
  ok('sign-up speaks to somebody returning',
    /Already have an account/.test(AUTH_CROSSLINK['sign-up'].lead));
  for (const k of ['sign-in', 'sign-up']) {
    ok(`${k} has both halves of the sentence`,
      AUTH_CROSSLINK[k].lead.length > 4 && AUTH_CROSSLINK[k].action.length > 4);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
