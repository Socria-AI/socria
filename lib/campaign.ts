// lib/campaign.ts — what the relaunch page says, safe for the browser.
//
// The page is components/campaign/Campaign.tsx; the gate behind it — which
// pages it takes over, the code, the entry cookie — is lib/takeover.ts, which
// only the server and the edge may import.

/** The campaign's one message. Nothing else on the page is a message. */
export const CAMPAIGN_LINE = 'WE KILLED THE CHATBOT.';

/** Set when the opening has played in this tab, so a reload goes straight to the network. */
export const CAMPAIGN_SEEN_KEY = 'socria.campaign.seen.v1';

/** Where the code is sent (app/api/access/enter). */
export const ENTER_ROUTE = '/api/access/enter';

/** What the field says when an attempt does not get in — quietly, under it. */
export function enterError(status: number | null): string {
  if (status === 400) return 'That code isn’t right.';
  if (status === 429) return 'Too many tries. Wait a minute.';
  if (status === 503) return 'Entry is closed right now.';
  return 'Couldn’t reach Socria. Try again.';
}

/** Where an email for the waitlist is sent (app/api/waitlist). */
export const WAITLIST_ROUTE = '/api/waitlist';

/** What the field says when an email does not get on the list. */
export function waitlistError(status: number | null): string {
  if (status === 400) return 'That doesn’t look like an email.';
  if (status === 429) return 'Too many tries. Wait a minute.';
  return 'Couldn’t reach Socria. Try again.';
}
