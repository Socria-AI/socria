'use client';

// components/account/AccountSettings.tsx
//
// Socria's account management, in place of Clerk's embedded card.
//
// The order is the order somebody reads it in: who you are, how you are
// reached, how you get in, what is guarding it, what is connected, where you
// are signed in. Data and deletion stay on their own page — those are about
// what Socria holds rather than about the account, and they deserve the
// distance.

import { CapabilitiesProvider } from './kit';
import { ProfilePanel } from './ProfilePanel';
import { EmailPanel } from './EmailPanel';
import { PasswordPanel } from './PasswordPanel';
import { TwoFactorPanel } from './TwoFactorPanel';
import { ConnectionsPanel } from './ConnectionsPanel';
import { DevicesPanel } from './DevicesPanel';

export function AccountSettings() {
  return (
    <CapabilitiesProvider>
      <div className="acct-stack">
        <ProfilePanel />
        <EmailPanel />
        <PasswordPanel />
        <TwoFactorPanel />
        <ConnectionsPanel />
        <DevicesPanel />
      </div>
    </CapabilitiesProvider>
  );
}
