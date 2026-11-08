// components/SubscribeForm.tsx — the blog's way to the newsletter.
//
// IT TAKES NO ADDRESS, BECAUSE NOTHING HERE COULD KEEP ONE. This used to be an
// email field whose button said "Subscribed ✓" and sent nothing: there is no
// route that takes an address for the newsletter. The newsletter is a choice an
// account holds — one row in the ledger (lib/newsletter.ts), written by the box
// on the sign-up form (ticked to begin with only where the law allows —
// lib/newsletter-consent.ts) and by the switch under Data & Privacy, and
// removed by the unsubscribe link in every issue. So this offers those two
// doors rather than pretending to be a third; the line under it on the blog
// says which is which.

import { Button } from '@/components/ds';

export function SubscribeForm() {
  return (
    <div className="sub-form reveal d1">
      <Button as="a" href="/sign-up?redirect_url=%2Fblog" variant="primary" size="md" onDark arrow>
        Create a free account
      </Button>
      <Button as="a" href="/account/data" variant="quiet" size="md" onDark>
        Turn it on in your account
      </Button>
    </div>
  );
}
