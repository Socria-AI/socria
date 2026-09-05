'use client';

// components/account/PasswordPanel.tsx — set, change or remove the password.
//
// The one rule that matters: never let somebody remove their last way in.
// Clerk enforces some of this server-side, but a settings page that offers a
// button which will lock you out and only says so afterwards has already
// failed. So the offer itself is withheld, with the reason attached.

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { canRemovePassword } from '@/lib/account-guards';
import { Button, Confirm, Field, Note, Panel, Row, Tag, usePanel, useCapabilities } from './kit';

export function PasswordPanel() {
  const { user } = useUser();
  const caps = useCapabilities();
  const { busy, err, note, run, clear, setErr } = usePanel();

  // 'change' opens the full form; 'remove' opens it asking only for the
  // current password, because Clerk wants that before it will drop it.
  const [open, setOpen] = useState<null | 'change' | 'remove'>(null);
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [signOutOthers, setSignOutOthers] = useState(true);

  if (!user || !caps.password) return null;

  const has = user.passwordEnabled;

  // Is there another way in, if the password went away? See
  // lib/account-guards for what counts as one and why two-factor does not.
  const otherFactors = canRemovePassword({
    passwordEnabled: user.passwordEnabled,
    passkeyCount: user.passkeys.length,
    verifiedExternalAccounts: user.verifiedExternalAccounts.length,
    verifiedEmails: user.emailAddresses.filter((e) => e.verification?.status === 'verified').length,
  });

  const reset = () => {
    setCurrent('');
    setNext('');
    setAgain('');
    setOpen(null);
    clear();
  };

  const save = async () => {
    if (next !== again) {
      setErr('Those two passwords are not the same.');
      return;
    }
    if (next.length < 8) {
      setErr('That password is shorter than eight characters.');
      return;
    }
    const ok = await run(
      'save',
      async () => {
        await user.updatePassword({
          newPassword: next,
          // Clerk wants the old one only when there is an old one.
          ...(has ? { currentPassword: current } : {}),
          signOutOfOtherSessions: signOutOthers,
        });
      },
      {
        fallback: has ? 'Could not change your password.' : 'Could not set a password.',
        done: has ? 'Password changed.' : 'Password set.',
      },
    );
    if (ok) reset();
  };

  return (
    <Panel
      id="password"
      title="Password"
      lede={
        has
          ? 'Changing it can sign you out everywhere else, which is what you want if you are changing it because somebody else may know it.'
          : 'You sign in without one at the moment. A password is a way back in if you lose access to the others.'
      }
    >
      <Note err={err} note={note} />

      <Row
        label="Password"
        tags={has ? <Tag kind="good">Set</Tag> : <Tag kind="flat">Not set</Tag>}
        meta={
          has && !otherFactors
            ? 'This is the only way into your account, so it cannot be removed. Add a passkey or verify an email address first.'
            : undefined
        }
        actions={
          <>
            <Button
              onClick={() => {
                clear();
                setOpen((v) => (v === 'change' ? null : 'change'));
              }}
              disabled={!!busy}
            >
              {open === 'change' ? 'Cancel' : has ? 'Change' : 'Set a password'}
            </Button>
            {has &&
              (otherFactors ? (
                <Button
                  kind="danger"
                  onClick={() => {
                    clear();
                    setOpen((v) => (v === 'remove' ? null : 'remove'));
                  }}
                  disabled={!!busy}
                >
                  {open === 'remove' ? 'Cancel' : 'Remove'}
                </Button>
              ) : (
                <Button kind="danger" disabled>
                  Remove
                </Button>
              ))}
          </>
        }
      />

      {open === 'remove' && (
        <div className="acct-form">
          <Field
            label="Current password"
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            autoComplete="current-password"
            hint="Clerk asks for this before it will drop the password."
            disabled={!!busy}
          />
          <div className="acct-form-actions">
            <Confirm
              label="Remove my password"
              question="Remove your password?"
              confirm="Remove it"
              disabled={!!busy || !current}
              onConfirm={async () => {
                const ok = await run(
                  'remove',
                  async () => void (await user.removePassword({ currentPassword: current })),
                  { fallback: 'Could not remove your password.', done: 'Password removed.' },
                );
                if (ok) reset();
              }}
            />
            <Button onClick={reset} disabled={!!busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {open === 'change' && (
        <div className="acct-form">
          {has && (
            <Field
              label="Current password"
              type="password"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              autoComplete="current-password"
              disabled={!!busy}
            />
          )}
          <Field
            label={has ? 'New password' : 'Password'}
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            autoComplete="new-password"
            hint="At least eight characters."
            disabled={!!busy}
          />
          <Field
            label="Type it again"
            type="password"
            value={again}
            onChange={(e) => setAgain(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') save();
            }}
            autoComplete="new-password"
            disabled={!!busy}
          />
          <label className="acct-row-meta" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              type="checkbox"
              checked={signOutOthers}
              onChange={(e) => setSignOutOthers(e.target.checked)}
              disabled={!!busy}
            />
            Sign out of every other device
          </label>
          <div className="acct-form-actions" style={{ marginTop: 14 }}>
            <Button kind="go" onClick={save} disabled={!!busy || !next || !again}>
              {busy === 'save' ? 'Saving…' : has ? 'Change password' : 'Set password'}
            </Button>
            <Button onClick={reset} disabled={!!busy}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}
