'use client';

// components/account/EmailPanel.tsx — the addresses on the account.
//
// Every address here is a way in: Clerk will sign somebody in with a code to
// any verified address on the account, so an address that should not be one
// is a way in that should not exist. That makes the removal rules the real
// content of this file, and they are stricter than Clerk's own — see below.

import { useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import type { EmailAddressResource } from '@clerk/types';
import { emailRemovalBlock } from '@/lib/account-guards';
import { Button, Confirm, Field, Note, Panel, Row, Tag, usePanel } from './kit';

const isVerified = (e: EmailAddressResource) => e.verification?.status === 'verified';

export function EmailPanel() {
  const { user } = useUser();
  const { busy, err, note, run, clear, setErr, setNote } = usePanel();

  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState('');
  // The address a code has been sent to, waiting on the code.
  const [pending, setPending] = useState<EmailAddressResource | null>(null);
  const [code, setCode] = useState('');

  const emails = useMemo(() => user?.emailAddresses ?? [], [user]);

  if (!user) return null;

  const primaryId = user.primaryEmailAddressId;

  // The rules live in lib/account-guards so the suite can exercise every
  // account shape; here they are only asked.
  const blockedReason = (e: EmailAddressResource) =>
    emailRemovalBlock(
      emails.map((x) => ({ id: x.id, verified: isVerified(x) })),
      primaryId,
      { id: e.id, verified: isVerified(e) },
    );

  const send = async () => {
    const address = draft.trim().toLowerCase();
    if (!address) return;
    clear();
    let created: EmailAddressResource | null = null;
    const ok = await run(
      'add',
      async () => {
        created = await user.createEmailAddress({ email: address });
        await created.prepareVerification({ strategy: 'email_code' });
      },
      { fallback: 'Could not add that address.', reload: false },
    );
    if (ok && created) {
      setPending(created);
      setNote(`Six-digit code sent to ${address}.`);
    }
  };

  const confirm = async () => {
    if (!pending || !code.trim()) return;
    const target = pending;
    const ok = await run(
      'verify',
      async () => void (await target.attemptVerification({ code: code.trim() })),
      { fallback: 'That code was not accepted.', done: 'Address verified.' },
    );
    if (ok) {
      setPending(null);
      setCode('');
      setDraft('');
      setAdding(false);
    }
  };

  /** Send a fresh code for an address added earlier and never finished. */
  const resume = async (e: EmailAddressResource) => {
    clear();
    const ok = await run(
      `resume-${e.id}`,
      async () => void (await e.prepareVerification({ strategy: 'email_code' })),
      { fallback: 'Could not send a code to that address.', reload: false },
    );
    if (ok) {
      setAdding(true);
      setPending(e);
      setDraft(e.emailAddress);
      setNote(`Six-digit code sent to ${e.emailAddress}.`);
    }
  };

  return (
    <Panel
      id="emails"
      title="Email addresses"
      lede="Any verified address here can be used to sign in and to reach you. An address you no longer control should not stay on the account."
    >
      <Note err={err} note={note} />

      {emails.map((e) => {
        const blocked = blockedReason(e);
        return (
          <Row
            key={e.id}
            label={e.emailAddress}
            tags={
              <>
                {e.id === primaryId && <Tag kind="good">Primary</Tag>}
                {!isVerified(e) && <Tag kind="warn">Unverified</Tag>}
              </>
            }
            meta={blocked ?? undefined}
            actions={
              <>
                {!isVerified(e) && (
                  <Button onClick={() => resume(e)} disabled={!!busy}>
                    {busy === `resume-${e.id}` ? 'Sending…' : 'Verify'}
                  </Button>
                )}
                {isVerified(e) && e.id !== primaryId && (
                  <Button
                    onClick={() =>
                      run(
                        `primary-${e.id}`,
                        async () => void (await user.update({ primaryEmailAddressId: e.id })),
                        { fallback: 'Could not change your primary address.', done: 'Primary address changed.' },
                      )
                    }
                    disabled={!!busy}
                  >
                    {busy === `primary-${e.id}` ? 'Setting…' : 'Make primary'}
                  </Button>
                )}
                {blocked ? (
                  <Button kind="danger" disabled>
                    Remove
                  </Button>
                ) : (
                  <Confirm
                    label="Remove"
                    question={`Remove ${e.emailAddress}?`}
                    confirm="Remove it"
                    disabled={!!busy}
                    onConfirm={() =>
                      run(`rm-${e.id}`, async () => void (await e.destroy()), {
                        fallback: 'Could not remove that address.',
                        done: 'Address removed.',
                      })
                    }
                  />
                )}
              </>
            }
          />
        );
      })}

      {!adding ? (
        <div className="acct-form-actions" style={{ marginTop: 14 }}>
          <Button
            onClick={() => {
              clear();
              setAdding(true);
            }}
            disabled={!!busy}
          >
            + Add an address
          </Button>
        </div>
      ) : (
        <div className="acct-form">
          {pending ? (
            <>
              <Field
                label="The code sent to that address"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirm();
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                disabled={busy === 'verify'}
              />
              <div className="acct-form-actions">
                <Button kind="go" onClick={confirm} disabled={!!busy || !code.trim()}>
                  {busy === 'verify' ? 'Checking…' : 'Verify'}
                </Button>
                <Button
                  onClick={() => {
                    setPending(null);
                    setCode('');
                    clear();
                  }}
                  disabled={!!busy}
                >
                  Start over
                </Button>
              </div>
            </>
          ) : (
            <>
              <Field
                label="New email address"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') send();
                }}
                type="email"
                autoComplete="email"
                spellCheck={false}
                placeholder="you@example.com"
                hint="We send a six-digit code to confirm it is yours."
                disabled={busy === 'add'}
              />
              <div className="acct-form-actions">
                <Button kind="go" onClick={send} disabled={!!busy || !draft.trim()}>
                  {busy === 'add' ? 'Sending…' : 'Send me a code'}
                </Button>
                <Button
                  onClick={() => {
                    setAdding(false);
                    setDraft('');
                    clear();
                  }}
                  disabled={!!busy}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}
