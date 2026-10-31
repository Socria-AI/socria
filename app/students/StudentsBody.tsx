// app/students/StudentsBody.tsx — the /students page itself: the UTA student
// month has ended, and here is what Socria is now.

import Link from 'next/link';
import { Button, Label } from '@/components/ds';
import { freePlanSentence } from '@/lib/entitlements';
import { priceWithPeriod } from '@/lib/socria-one';

export function StudentsBody() {
  return (
    <div className="app-root">
      <div className="plate-wrap">
        <div className="plate wide">
          <Link href="/" className="auth-mark" aria-label="Socria home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-logo.png" alt="" width={34} height={34} />
            <span>Socria</span>
          </Link>

          <div>
            <Label tone="moss">For UTA students</Label>
            <h1 style={{ marginTop: '12px' }}>
              The student month has <span className="em">ended.</span>
            </h1>
          </div>
          <p className="lede">
            Socria One is no longer offered free. Socria is still free to start: you can think with it right now, no
            account needed, and a free account has {freePlanSentence()}. Socria One is {priceWithPeriod()}.
          </p>
          <div className="stack" style={{ gap: '12px' }}>
            <Button as="a" href="/chat" variant="primary" size="lg" arrow>
              Start thinking
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
