// app/new-logos/sign-up — making an account, for someone who has none (docs/NEW-LOGOS.md). It is the same account
// system as everywhere else; somebody with an account signs in instead and never needs a second one.

import { redirect } from 'next/navigation';
import { SignUp } from '@clerk/nextjs';
import { signedInOnServer } from '@/components/new-logos/server-auth';
import { neutralAppearance } from '@/components/new-logos/auth-appearance';

export const metadata = { title: 'Create an account' };
export const dynamic = 'force-dynamic';

export default function NewLogosSignUp() {
  if (signedInOnServer()) redirect('/new-logos');
  return (
    <main className="nl-auth">
      <div className="nl-auth-box">
        <h1>Create an account</h1>
        <p>Already have one? Sign in instead.</p>
        <SignUp
          routing="path"
          path="/new-logos/sign-up"
          signInUrl="/new-logos/sign-in"
          forceRedirectUrl="/new-logos"
          fallbackRedirectUrl="/new-logos"
          appearance={neutralAppearance}
        />
      </div>
    </main>
  );
}
