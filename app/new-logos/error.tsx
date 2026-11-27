'use client';
// app/new-logos/error.tsx — a page under /new-logos that failed, said neutrally (the site's own error page would
// otherwise be shown here). A failure caused by a newer deployment reloads once, as the site's page does
// (lib/stale-deploy.ts); anything else offers to try again. Nothing the person wrote is lost: it is saved as it is made.
import { useEffect, useState } from 'react';
import { isStaleDeployError, reloadForUpdate } from '@/lib/stale-deploy';

export default function NewLogosError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [stale, setStale] = useState(() => isStaleDeployError(error));
  useEffect(() => {
    console.error('[workspace] a page failed:', error);
    // a reload already tried within the minute means the failure is real: say so rather than loop
    if (isStaleDeployError(error) && !reloadForUpdate()) setStale(false);
  }, [error]);
  return (
    <main className="nl-auth">
      <div className="nl-auth-box">
        <h1>{stale ? 'Updating…' : 'Something went wrong'}</h1>
        <p>{stale ? 'A newer version is available. Reloading.' : 'This page could not be shown. Your saved work is not affected.'}</p>
        {!stale ? (
          <p className="nl-row">
            <button type="button" className="nl-btn is-primary" onClick={() => reset()}>
              Try again
            </button>
            <a href="/new-logos" className="nl-btn">
              Go to Home
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}
