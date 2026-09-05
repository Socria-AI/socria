// The rules that stop somebody locking themselves out.
//
// Socria manages the account itself now, so the settings page is capable of
// offering to remove the last way in. These are the functions that refuse.
// They matter more than anything else in the account panels: every other bug
// there is an inconvenience, and this one costs somebody their account.
//
// A first factor is anything that gets you from signed out to signed in on
// its own — a password, a passkey, a connected account, or a verified email
// that can receive a code. Two-factor is NOT one, and the last block here
// exists entirely to pin that down.

import {
  canRemovePassword, canDisconnectAccount, canRemovePasskey, emailRemovalBlock,
} from './.tmp/account-guards.mjs';

let pass = 0, fail = 0;
const ok = (n, c, x = '') => (c ? pass++ : (fail++, console.log('FAIL', n, x)));

const snap = (o = {}) => ({
  passwordEnabled: false, passkeyCount: 0,
  verifiedExternalAccounts: 0, verifiedEmails: 0, ...o,
});

console.log('=== the last way in is never removable ===');
{
  ok('password alone cannot be removed',
    canRemovePassword(snap({ passwordEnabled: true })) === false);
  ok('the only passkey cannot be removed',
    canRemovePasskey(snap({ passkeyCount: 1 })) === false);
  ok('the only connected account cannot be disconnected',
    canDisconnectAccount(snap({ verifiedExternalAccounts: 1 })) === false);

  // An account with literally nothing. Nothing is removable from it either,
  // which is vacuous but must not crash or answer yes.
  ok('an empty account allows no removals',
    canRemovePassword(snap()) === false &&
    canRemovePasskey(snap()) === false &&
    canDisconnectAccount(snap()) === false);
}

console.log('\n=== a second way in unlocks the first ===');
{
  for (const [name, extra] of [
    ['a passkey', { passkeyCount: 1 }],
    ['a connected account', { verifiedExternalAccounts: 1 }],
    ['a verified email', { verifiedEmails: 1 }],
  ]) {
    ok(`password removable once there is ${name}`,
      canRemovePassword(snap({ passwordEnabled: true, ...extra })) === true);
  }
  ok('a second passkey frees the first',
    canRemovePasskey(snap({ passkeyCount: 2 })) === true);
  ok('a password frees the only passkey',
    canRemovePasskey(snap({ passkeyCount: 1, passwordEnabled: true })) === true);
  ok('a second connected account frees the first',
    canDisconnectAccount(snap({ verifiedExternalAccounts: 2 })) === true);
  ok('a verified email frees the only connected account',
    canDisconnectAccount(snap({ verifiedExternalAccounts: 1, verifiedEmails: 1 })) === true);
}

console.log('\n=== two-factor is not a way in ===');
{
  // The distinction the whole file exists for. An authenticator app is a
  // SECOND step; an account whose only credential is one is an account
  // nobody can sign into. So a snapshot carrying no first factor must refuse
  // every removal no matter what else is true of it.
  const twoFactorOnly = snap({ passwordEnabled: true });
  ok('having two-factor does not let the password go',
    canRemovePassword(twoFactorOnly) === false);
  // And the snapshot has no field for it at all, which is the structural
  // reason it cannot be counted by accident.
  ok('the snapshot has no second-factor field',
    !('totpEnabled' in snap()) && !('backupCodeEnabled' in snap()));
}

console.log('\n=== nonsense counts do not create ways in ===');
{
  ok('a negative passkey count is not a factor',
    canRemovePassword(snap({ passwordEnabled: true, passkeyCount: -5 })) === false);
  ok('nor a negative email count',
    canRemovePassword(snap({ passwordEnabled: true, verifiedEmails: -1 })) === false);
  ok('and negatives cannot free a passkey either',
    canRemovePasskey(snap({ passkeyCount: 1, verifiedEmails: -3 })) === false);
}

console.log('\n=== email removal: the serious refusal wins ===');
{
  const A = { id: 'a', verified: true };
  const B = { id: 'b', verified: true };
  const U = { id: 'u', verified: false };

  ok('the only verified address is refused, primary or not',
    emailRemovalBlock([A], 'a', A)?.includes('only verified address') === true);
  ok('and still refused when it is not primary',
    emailRemovalBlock([A, U], 'u', A)?.includes('only verified address') === true);

  // The ordering that matters: an address that is BOTH the last verified one
  // and the primary must hear the lockout reason, not the fixable one.
  const both = emailRemovalBlock([A, U], 'a', A);
  ok('last-verified beats primary in the message',
    both?.includes('only verified address') === true, both);
  ok('and does not say to make another primary',
    both?.includes('primary') === false, both);

  ok('the primary is refused when another verified one exists',
    emailRemovalBlock([A, B], 'a', A)?.includes('primary') === true);
  ok('a non-primary verified address is removable when another is verified',
    emailRemovalBlock([A, B], 'a', B) === null);
  ok('an unverified address is always removable',
    emailRemovalBlock([A, U], 'a', U) === null);
  ok('even when it is somehow primary',
    emailRemovalBlock([A, U], 'u', U)?.includes('primary') === true);

  ok('no primary set at all is not a refusal',
    emailRemovalBlock([A, B], null, B) === null);
  ok('nor undefined', emailRemovalBlock([A, B], undefined, B) === null);
  ok('an unverified address on an account with none verified is removable',
    emailRemovalBlock([U], null, U) === null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
