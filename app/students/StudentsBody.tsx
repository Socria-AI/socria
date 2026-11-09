// app/students/StudentsBody.tsx — the /students page itself: the UTA student
// month has ended, and here is what Socria is now.

import Link from 'next/link';
import { Button, Label, Logo } from '@/components/ds';
import { freePlanSentence } from '@/lib/entitlements';
import { priceWithPeriod } from '@/lib/socria-one';

export function StudentsBody() {
  return (
    <div className="app-root">
      <div className="plate-wrap">
        <div className="plate wide">
          <Link href="/" className="auth-mark" aria-label="Socria home">
            <Logo size="md" markSrc="/socria-mark.png" />
          </Link>

          <div>
            <Label tone="moss">For UTA students</Label>
            <h1 style={{ marginTop: '12px' }}>
              The student month has <span className="em">ended.</span>
            </h1>
          </div>
          <p className="lede">
            Socria One is no longer offered free. You can still try Socria right now with no account, and a new
            account has {freePlanSentence()}. After that, Socria One is {priceWithPeriod()}.
          </p>
          <div className="stack" style={{ gap: '12px' }}>
            {/* Where every public "Start a conversation" goes (components/site/chrome.tsx START),
                written out so this plate does not load the public site's stylesheet. */}
            <Button as="a" href="/logos" variant="primary" size="lg" arrow>
              Start a conversation
            </Button>
            <p className="auth-cross">
              <Link href="/one">See Socria One</Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
