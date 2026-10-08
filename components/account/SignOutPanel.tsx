'use client';

// components/account/SignOutPanel.tsx — leaving this device.
//
// The last thing on the account page, as it is the last thing in the account
// sheet. The same two steps as the sheet's: this browser's Socria data first —
// a shared device must not hand the next person this one's conversations,
// sessions or derived memory — then the sign-out, back to the front page
// rather than to a sign-in prompt for the page just left.

import { useState } from 'react';
import { useClerk } from '@clerk/nextjs';
import { clearSocriaLocalData } from '@/lib/local-data';
import { Button, Panel } from './kit';

export function SignOutPanel() {
  const { signOut } = useClerk();
  const [busy, setBusy] = useState(false);
  return (
    <Panel
      id="sign-out"
      title="Sign out"
      lede="Of this device only. Your lines of thinking and what Socria remembers stay in your account, ready when you sign back in."
    >
      <div className="acct-form-actions">
        <Button
          disabled={busy}
          onClick={() => {
            setBusy(true);
            clearSocriaLocalData();
            void signOut({ redirectUrl: '/' });
          }}
        >
          {busy ? 'Signing out…' : 'Sign out'}
        </Button>
      </div>
    </Panel>
  );
}
