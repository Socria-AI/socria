// app/new-logos/sign-in — signing in to New Logos with an existing account (docs/NEW-LOGOS.md). No logo, no name, no
// marketing: a heading, one line, the form. Someone already signed in goes straight in.

import { redirect } from 'next/navigation';
import { SignIn } from '@clerk/nextjs';
import { signedInOnServer } from '@/components/new-logos/server-auth';
import { neutralAppearance } from '@/components/new-logos/auth-appearance';

export const metadata = { title: 'Sign in' };
export const dynamic = 'force-dynamic';

export default function NewLogosSignIn() {
  if (signedInOnServer()) redirect('/new-logos');
  return (
    <main className="nl-auth">
      <div className="nl-auth-box">
        <h1>Sign in</h1>
        <p>Use your existing account.</p>
        <SignIn
          routing="path"
          path="/new-logos/sign-in"
          signUpUrl="/new-logos/sign-up"
          forceRedirectUrl="/new-logos"
          fallbackRedirectUrl="/new-logos"
          appearance={neutralAppearance}
        />
      </div>
    </main>
  );
}
