'use client';

// components/account/ConnectionsPanel.tsx — accounts you sign in with.

import { useMemo } from 'react';
import { useUser } from '@clerk/nextjs';
import { getOAuthProviderData } from '@clerk/types';
import type { ExternalAccountResource, OAuthStrategy } from '@clerk/types';
import { canDisconnectAccount } from '@/lib/account-guards';
import { Button, Confirm, Note, Panel, Row, Tag, usePanel, useCapabilities } from './kit';

/** "oauth_google" → "Google", falling back to something readable. */
function providerName(strategy: string): string {
  const data = getOAuthProviderData({ strategy: strategy as OAuthStrategy });
  if (data?.name) return data.name;
  const bare = strategy.replace(/^oauth(_custom)?_/, '').replace(/[-_]/g, ' ');
  return bare.charAt(0).toUpperCase() + bare.slice(1);
}

export function ConnectionsPanel() {
  const { user } = useUser();
  const caps = useCapabilities();
  const { busy, err, note, run, clear } = usePanel();

  const accounts = useMemo(() => user?.externalAccounts ?? [], [user]);

  // Providers this instance offers that are not connected yet. Where the
  // environment could not be read this is empty, so the panel still lists
  // and disconnects what exists — it just cannot offer to add more.
  const connectable = useMemo(() => {
    const held = new Set(accounts.map((a) => `oauth_${a.provider}`));
    return caps.socialStrategies.filter((s) => !held.has(s));
  }, [accounts, caps.socialStrategies]);

  if (!user) return null;
  if (!accounts.length && !connectable.length) return null;

  /**
   * Connecting leaves the page: Clerk creates the account unverified, hands
   * back a URL at the provider, and the browser goes there and comes back.
   * So this navigates rather than awaiting anything.
   */
  const connect = (strategy: string) =>
    run(
      `add-${strategy}`,
      async () => {
        const account = await user.createExternalAccount({
          strategy: strategy as OAuthStrategy,
          redirectUrl: `${window.location.origin}/account`,
        });
        const url = account.verification?.externalVerificationRedirectURL;
        if (!url) throw new Error('no redirect');
        window.location.href = url.toString();
      },
      { fallback: `Could not start connecting ${providerName(strategy)}.`, reload: false },
    );

  const unusable = (a: ExternalAccountResource) => a.verification?.status !== 'verified';

  // A connected account is a first factor, so disconnecting the only one on
  // an account with nothing else locks it.
  const otherFactors = canDisconnectAccount({
    passwordEnabled: user.passwordEnabled,
    passkeyCount: user.passkeys.length,
    verifiedExternalAccounts: user.verifiedExternalAccounts.length,
    verifiedEmails: user.emailAddresses.filter((e) => e.verification?.status === 'verified').length,
  });

  return (
    <Panel
      id="connections"
      title="Connected accounts"
      lede="Accounts you can sign in with. Disconnecting one does not delete anything in Socria."
    >
      <Note err={err} note={note} />

      {accounts.map((a) => (
        <Row
          key={a.id}
          label={providerName(`oauth_${a.provider}`)}
          tags={unusable(a) ? <Tag kind="warn">Needs reconnecting</Tag> : null}
          meta={a.emailAddress || a.username || undefined}
          actions={
            <>
              {unusable(a) && (
                <Button
                  onClick={() =>
                    run(
                      `re-${a.id}`,
                      async () => {
                        const done = await a.reauthorize({
                          redirectUrl: `${window.location.origin}/account`,
                          additionalScopes: [],
                        });
                        const url = done.verification?.externalVerificationRedirectURL;
                        if (!url) throw new Error('no redirect');
                        window.location.href = url.toString();
                      },
                      { fallback: 'Could not reconnect that account.', reload: false },
                    )
                  }
                  disabled={!!busy}
                >
                  {busy === `re-${a.id}` ? 'Opening…' : 'Reconnect'}
                </Button>
              )}
              {otherFactors ? (
                <Confirm
                  label="Disconnect"
                  question={`Disconnect ${providerName(`oauth_${a.provider}`)}?`}
                  confirm="Disconnect"
                  disabled={!!busy}
                  onConfirm={() =>
                    run(`rm-${a.id}`, async () => void (await a.destroy()), {
                      fallback: 'Could not disconnect that account.',
                      done: 'Account disconnected.',
                    })
                  }
                />
              ) : (
                <Button kind="danger" disabled>
                  Disconnect
                </Button>
              )}
            </>
          }
        />
      ))}

      {!accounts.length && <p className="acct-empty">Nothing connected.</p>}

      {connectable.length > 0 && (
        <div className="acct-form-actions" style={{ marginTop: 14 }}>
          {connectable.map((s) => (
            <Button
              key={s}
              onClick={() => {
                clear();
                connect(s);
              }}
              disabled={!!busy}
            >
              {busy === `add-${s}` ? 'Opening…' : `+ Connect ${providerName(s)}`}
            </Button>
          ))}
        </div>
      )}
    </Panel>
  );
}
