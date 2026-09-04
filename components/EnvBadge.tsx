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
      ? 'Sign-in is off here. This build has PRODUCTION Clerk keys, and a production instance is bound to its own domain, so the handshake can never complete on a preview URL. Everything else works and conversations stay in this browser.'
      : clerk === 'missing'
        ? 'Sign-in is off on this build — no Clerk keys are set. Everything else works; conversations stay in this browser.'
        : 'Sign-in is using a Clerk development instance, which is what previews want.';

  /** The fix, where there is one — named precisely enough to act on. */
  const fix =
    clerk === 'mismatch' || clerk === 'missing'
      ? 'Fix: Clerk dashboard → the DEVELOPMENT instance → API keys. Put that pair on Vercel → Settings → Environment Variables, scoped to Preview, then redeploy.'
      : null;

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
          {fix && (
            <p className="env-note-fix">
              <code>NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…</code>
              <code>CLERK_SECRET_KEY=sk_test_…</code>
              {fix}
            </p>
          )}
          <p className="env-note-sub">Not production — nothing here is indexed.</p>
        </div>
      )}
    </div>
  );
}
