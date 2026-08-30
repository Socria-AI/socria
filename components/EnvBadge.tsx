'use client';

// Which build am I looking at?
//
// A preview deployment is pixel-identical to production, which is how you end
// up testing a change against real data, or reporting a bug from a branch
// nobody has merged. This says so, quietly, in a corner — and never appears
// in production, so it costs the real site nothing.
//
// It also names the one misconfiguration that makes a preview look broken:
// production Clerk keys on a preview domain, where the sign-in handshake
// cannot complete. Better to read it here than to spend an afternoon on it.

import { useState } from 'react';

export function EnvBadge({
  env,
  clerk,
}: {
  env: 'preview' | 'development';
  /** 'ok' | 'missing' | 'mismatch' — how sign-in stands on this build */
  clerk: 'ok' | 'missing' | 'mismatch';
}) {
  const [open, setOpen] = useState(false);

  const note =
    clerk === 'mismatch'
      ? 'Sign-in will not work here: this build has production Clerk keys, which are bound to the production domain. Set the development keys (pk_test_… / sk_test_…) on Vercel’s Preview environment.'
      : clerk === 'missing'
        ? 'Sign-in is off on this build — no Clerk keys are set. Everything else works; conversations stay in this browser.'
        : 'Sign-in is using a Clerk development instance, which is what previews want.';

  return (
    <div className={`env-badge is-${env}`}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Which build is this?"
      >
        <span className={`env-dot is-${clerk}`} aria-hidden="true" />
        {env === 'preview' ? 'Preview' : 'Local'}
      </button>
      {open && (
        <div className="env-note" role="note">
          <p>{note}</p>
          <p className="env-note-sub">Not production — nothing here is indexed.</p>
        </div>
      )}
    </div>
  );
}
