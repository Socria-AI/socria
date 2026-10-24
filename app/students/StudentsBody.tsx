// app/students/StudentsBody.tsx — the /students page itself, given whether
// the offer is open, so both states render (and can be checked) the same way.

import Link from 'next/link';
import { Button, Label } from '@/components/ds';
import { TryInSocria } from '@/components/TryInSocria';
import { STUDENT_OFFER } from '@/lib/socria-edu';

const DOMAIN = STUDENT_OFFER.domains[0] ?? 'mavs.uta.edu';

/** The last day a month can begin, on the campus clock: "9 December 2026". */
export const CLOSES = new Date(STUDENT_OFFER.closes - 1).toLocaleDateString('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Chicago',
});

export function StudentsBody({ open }: { open: boolean }) {
  return (
    <div className="app-root">
      <div className="plate-wrap">
        <div className="plate wide">
          <Link href="/" className="auth-mark" aria-label="Socria home">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/socria-logo.png" alt="" width={34} height={34} />
            <span>Socria</span>
          </Link>

          {open ? (
            <>
              <div>
                <Label tone="moss">For UTA students</Label>
                <h1 style={{ marginTop: '12px' }}>
                  Your first month of Socria One, <span className="em">free.</span>
                </h1>
              </div>
              <p className="lede">
                Verify your @{DOMAIN} address and Socria One is yours for {STUDENT_OFFER.days} days — everything
                Socria does, without the ceiling. No card, and nothing renews.
              </p>

              <ol className="steps">
                <li>
                  <strong>Create your free account</strong> — or sign in if you have one.
                </li>
                <li>
                  <strong>Add your UTA email</strong> under Account, and type in the code we send to it.
                </li>
                <li>
                  <strong>That&rsquo;s it.</strong> Your month of Socria One begins when the address is verified.
                </li>
              </ol>

              <div className="stack" style={{ gap: '12px' }}>
                <Button as="a" href="/sign-up?redirect_url=%2Faccount" variant="primary" size="lg" arrow>
                  Create my free account
                </Button>
                <p className="auth-cross">
                  Already have one? <Link href="/account">Verify your UTA email</Link>
                </p>
              </div>

              <hr className="rule" />

              <div className="stack" style={{ gap: '10px' }}>
                <h2 className="steps-h">What it&rsquo;s for</h2>
                <ul className="steps plain">
                  <li>Understand it, don&rsquo;t just memorize it — move the variable and watch what the concept does.</li>
                  <li>Read a paper with Logos and see what it actually says — each citation checked against the page it came from.</li>
                  <li>Find the hole in your argument before the essay is due.</li>
                </ul>
                <p className="auth-cross">
                  <TryInSocria
                    className="try-link"
                    text="I have to choose between two majors and I keep going back and forth. Help me work out what I actually care about."
                  >
                    Try it first — no account needed
                  </TryInSocria>
                </p>
              </div>

              <p className="vow">Open until {CLOSES}. Your UTA address is verified by a code sent to it.</p>
            </>
          ) : (
            <>
              <div>
                <Label tone="moss">For UTA students</Label>
                <h1 style={{ marginTop: '12px' }}>
                  The free month has <span className="em">closed.</span>
                </h1>
              </div>
              <p className="lede">
                It ran until {CLOSES}. Socria is still free to start, and you can think with it right now — no account
                needed.
              </p>
              <div className="stack" style={{ gap: '12px' }}>
                <Button as="a" href="/chat" variant="primary" size="lg" arrow>
                  Start thinking
                </Button>
                <p className="auth-cross">
                  <Link href="/one">See Socria One</Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
