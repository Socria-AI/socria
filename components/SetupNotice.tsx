// What to do when a non-production build has no sign-in configured.
//
// This replaces a 500 whose stack trace said "Missing publishableKey" and
// nothing about where to put one. Server-rendered, no client JS, no Clerk —
// it has to work in exactly the situation where Clerk does not.

import type { Env } from '@/lib/environment';

export function SetupNotice({ env }: { env: Env }) {
  return (
    <main className="setup-notice">
      <p className="setup-kicker">{env === 'preview' ? 'Preview build' : 'Local build'}</p>
      <h1>Sign-in isn’t configured here.</h1>
      <p>
        This deployment has no Clerk keys, so authentication can’t start. Everything
        else is built and ready — it needs one pair of environment variables.
      </p>
      <pre>
        <code>
          NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_…{'\n'}
          CLERK_SECRET_KEY=sk_test_…
        </code>
      </pre>
      <p>
        Use the <strong>development</strong> instance keys (<code>pk_test_</code>,
        not <code>pk_live_</code>). A production key is bound to the production
        domain and will refuse this one; a development instance accepts any origin,
        which is what a preview needs.
      </p>
      <p className="setup-where">
        {env === 'preview'
          ? 'Vercel → Settings → Environment Variables → scope them to Preview only.'
          : 'Put them in .env.local. See .env.example.'}
      </p>
      <p className="setup-foot">
        Full setup, including how to keep previews private: <code>docs/PRIVATE-DEV.md</code>
      </p>
    </main>
  );
}
