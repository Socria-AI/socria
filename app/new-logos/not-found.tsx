// app/new-logos/not-found.tsx — an address under /new-logos that leads nowhere, said neutrally (the site's own 404
// would otherwise be shown here, with its name and marks).
import Link from 'next/link';

export const metadata = { title: 'Not found' };

export default function NewLogosNotFound() {
  return (
    <main className="nl-auth">
      <div className="nl-auth-box">
        <h1>Not found</h1>
        <p>There is nothing at this address.</p>
        <p>
          <Link href="/new-logos" className="nl-btn">
            Go to Home
          </Link>
        </p>
      </div>
    </main>
  );
}
