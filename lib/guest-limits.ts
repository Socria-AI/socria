// lib/guest-limits.ts — what a guest gets before signing up, for the browser and the server alike.
//
// Signed out, Logos 5 gives one line of thinking and its map (lib/guest-pass.ts), and in it
// GUEST_TURNS messages. The server holds the line (app/api/logos/chat counts the guest's own
// messages in the turn it is sent); the app counts the same way to say how many are left and to
// show the sign-up card before a turn it would refuse.

/** Messages a guest may send in their one line of thinking. */
export const GUEST_TURNS = 5;

/** How many messages a guest has sent: their own turns, across what they hold. */
export function guestTurnsUsed(messages: readonly { role?: unknown }[] | null | undefined): number {
  return Array.isArray(messages) ? messages.filter((m) => m && m.role === 'user').length : 0;
}

/** What a guest is told when the messages run out. */
export const GUEST_TURNS_LIMIT = `Guests get ${GUEST_TURNS} messages and one map. Sign up free to keep going — this conversation comes with you.`;
