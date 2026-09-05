'use client';

// components/account/TwoFactorPanel.tsx — authenticator app, backup codes,
// passkeys.
//
// This is the panel where a mistake locks somebody out of their own account,
// so three rules run through it and none of them are negotiable:
//
//   THE CODES ARE SHOWN ONCE. Clerk hands back backup codes exactly once and
//   cannot show them again. So they are not rendered beside a "Done" button
//   somebody will click past — the acknowledgement is explicit, it says what
//   is being acknowledged, and copy and download are both offered because a
//   person who has neither written them down nor saved them is one lost
//   phone away from losing the account.
//
//   TURNING IT OFF SAYS WHAT IT COSTS. Disabling two-factor also destroys
//   the backup codes. Somebody doing that on purpose loses nothing they
//   wanted; somebody doing it by accident loses their way back in.
//
//   NOTHING HERE IS THE LAST WAY IN. Two-factor is a SECOND step, never a
//   first, so it can never substitute for a password or a passkey — and the
//   passkey rows enforce the reverse: the last one is not removable when it
//   is the only first factor on the account.

import { useMemo, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import type { TOTPResource } from '@clerk/types';
import { qrGrid } from '@/lib/qr';
import { canRemovePasskey } from '@/lib/account-guards';
import { Button, Confirm, Field, Note, Panel, Row, Tag, usePanel, useCapabilities } from './kit';

function Qr({ uri }: { uri: string }) {
  const grid = useMemo(() => qrGrid(uri), [uri]);
  if (!grid) {
    // Deliberately not an error. Every authenticator app takes the secret
    // typed in, so the setup below still works without this.
    return null;
  }
  return (
    <svg
      className="acct-qr"
      viewBox={`0 0 ${grid.count} ${grid.count}`}
      role="img"
      aria-label="QR code for your authenticator app"
      shapeRendering="crispEdges"
    >
      <rect width={grid.count} height={grid.count} fill="#fff" />
      <path d={grid.path} fill="#1F1F1F" />
    </svg>
  );
}

/** The one-time reveal. Nothing leaves this state without acknowledgement. */
function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  const text = codes.join('\n');

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'socria-backup-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
    setSaved(true);
  };

  return (
    <div className="acct-form">
      <p className="acct-row-label" style={{ marginBottom: 6 }}>
        <strong>Your backup codes</strong>
      </p>
      <p className="acct-row-meta">
        Each one signs you in once, if you ever lose your authenticator. This is
        the only time they can be shown — Socria cannot show them again, and
        neither can Clerk.
      </p>

      <div className="acct-codes">
        {codes.map((c) => (
          <span key={c}>{c}</span>
        ))}
      </div>

      <div className="acct-form-actions">
        <Button
          onClick={() => {
            navigator.clipboard?.writeText(text).then(
              () => {
                setCopied(true);
                setSaved(true);
              },
              () => setCopied(false),
            );
          }}
        >
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button onClick={download}>Download</Button>
      </div>

      <label
        className="acct-row-meta"
        style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginTop: 14 }}
      >
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        I have saved these somewhere I can get to without my phone.
      </label>

      <div className="acct-form-actions" style={{ marginTop: 12 }}>
        <Button kind="go" onClick={onDone} disabled={!saved}>
          Done
        </Button>
      </div>
    </div>
  );
}

export function TwoFactorPanel() {
  const { user } = useUser();
  const caps = useCapabilities();
  const { busy, err, note, run, clear } = usePanel();

  // The enrolment in progress: created, not yet verified.
  const [totp, setTotp] = useState<TOTPResource | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  const passkeys = useMemo(() => user?.passkeys ?? [], [user]);

  if (!user) return null;
  if (!caps.totp && !caps.passkeys) return null;

  // A passkey signs somebody in by itself, so the last one is only removable
  // when something else can.
  const passkeyRemovable = canRemovePasskey({
    passwordEnabled: user.passwordEnabled,
    passkeyCount: passkeys.length,
    verifiedExternalAccounts: user.verifiedExternalAccounts.length,
    verifiedEmails: user.emailAddresses.filter((e) => e.verification?.status === 'verified').length,
  });

  const begin = async () => {
    clear();
    let made: TOTPResource | null = null;
    const ok = await run(
      'begin',
      async () => {
        made = await user.createTOTP();
      },
      { fallback: 'Could not start setting up an authenticator.', reload: false },
    );
    if (ok && made) setTotp(made);
  };

  const confirm = async () => {
    if (!totp || !code.trim()) return;
    let result: TOTPResource | null = null;
    const ok = await run(
      'confirm',
      async () => {
        result = await user.verifyTOTP({ code: code.trim() });
      },
      { fallback: 'That code was not accepted. Authenticator codes expire fast — try the current one.' },
    );
    if (!ok) return;
    setTotp(null);
    setCode('');
    // Clerk may return the backup codes with the verification. When it does
    // not, ask for them — an account with two-factor and no way back in is
    // the thing this panel exists to prevent.
    const given = (result as TOTPResource | null)?.backupCodes;
    if (given?.length) {
      setCodes(given);
      return;
    }
    await run(
      'codes',
      async () => {
        const made = await user.createBackupCode();
        setCodes(made.codes);
      },
      { fallback: 'Two-factor is on, but backup codes could not be made. Make some below.' },
    );
  };

  const regenerate = () =>
    run(
      'codes',
      async () => {
        const made = await user.createBackupCode();
        setCodes(made.codes);
      },
      { fallback: 'Could not make new backup codes.' },
    );

  const addPasskey = () =>
    run('passkey', async () => void (await user.createPasskey()), {
      fallback:
        'Could not add a passkey. Your browser or device may not support them, or the prompt was dismissed.',
      done: 'Passkey added.',
    });

  return (
    <Panel
      id="twofactor"
      title="Two-factor and passkeys"
      lede="A second step after your password, and a way to sign in without one at all."
    >
      <Note err={err} note={note} />

      {codes && (
        <BackupCodes
          codes={codes}
          onDone={() => {
            setCodes(null);
            clear();
          }}
        />
      )}

      {caps.totp && (
        <Row
          label="Authenticator app"
          tags={user.totpEnabled ? <Tag kind="good">On</Tag> : <Tag kind="flat">Off</Tag>}
          meta={
            user.totpEnabled
              ? 'A six-digit code from your app, after your password.'
              : 'Codes from an app like 1Password, Authy or Google Authenticator.'
          }
          actions={
            user.totpEnabled ? (
              <Confirm
                label="Turn off"
                question="Turn two-factor off? This also destroys your backup codes."
                confirm="Turn it off"
                disabled={!!busy}
                onConfirm={() =>
                  run('off', async () => void (await user.disableTOTP()), {
                    fallback: 'Could not turn two-factor off.',
                    done: 'Two-factor is off, and the backup codes with it.',
                  })
                }
              />
            ) : totp ? (
              <Button
                onClick={() => {
                  setTotp(null);
                  setCode('');
                  clear();
                }}
                disabled={!!busy}
              >
                Cancel
              </Button>
            ) : (
              <Button onClick={begin} disabled={!!busy}>
                {busy === 'begin' ? 'Starting…' : 'Set up'}
              </Button>
            )
          }
        />
      )}

      {totp && (
        <div className="acct-form">
          <div className="acct-2fa-steps">
            <div>
              <p className="acct-row-label" style={{ marginBottom: 8 }}>
                <strong>1. Scan this</strong>
              </p>
              {totp.uri ? <Qr uri={totp.uri} /> : null}
              {totp.secret && (
                <>
                  <p className="acct-row-meta" style={{ marginTop: 10 }}>
                    Or type this into your app:
                  </p>
                  <code className="acct-secret">{totp.secret}</code>
                </>
              )}
            </div>
            <div>
              <p className="acct-row-label" style={{ marginBottom: 8 }}>
                <strong>2. Type the code it shows</strong>
              </p>
              <Field
                label="Six-digit code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') confirm();
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                disabled={busy === 'confirm'}
              />
              <div className="acct-form-actions">
                <Button kind="go" onClick={confirm} disabled={!!busy || !code.trim()}>
                  {busy === 'confirm' ? 'Checking…' : 'Turn on two-factor'}
                </Button>
              </div>
              <p className="acct-hint" style={{ marginTop: 10 }}>
                Nothing changes until this code is accepted. Backup codes come next.
              </p>
            </div>
          </div>
        </div>
      )}

      {caps.backupCodes && user.totpEnabled && (
        <Row
          label="Backup codes"
          tags={
            user.backupCodeEnabled ? <Tag kind="good">Made</Tag> : <Tag kind="warn">None</Tag>
          }
          meta={
            user.backupCodeEnabled
              ? 'Making new ones cancels the old ones.'
              : 'Without these, losing your authenticator means losing the account.'
          }
          actions={
            <Button onClick={regenerate} disabled={!!busy}>
              {busy === 'codes' ? 'Making…' : user.backupCodeEnabled ? 'Make new ones' : 'Make some'}
            </Button>
          }
        />
      )}

      {caps.passkeys && (
        <>
          {passkeys.map((k) => (
            <Row
              key={k.id}
              label={k.name || 'Passkey'}
              meta={
                k.lastUsedAt
                  ? `Last used ${k.lastUsedAt.toLocaleDateString()}`
                  : `Added ${k.createdAt.toLocaleDateString()}`
              }
              actions={
                !passkeyRemovable ? (
                  <Button kind="danger" disabled>
                    Remove
                  </Button>
                ) : (
                  <Confirm
                    label="Remove"
                    question={`Remove ${k.name || 'this passkey'}?`}
                    confirm="Remove it"
                    disabled={!!busy}
                    onConfirm={() =>
                      run(`pk-${k.id}`, async () => void (await k.delete()), {
                        fallback: 'Could not remove that passkey.',
                        done: 'Passkey removed.',
                      })
                    }
                  />
                )
              }
            />
          ))}
          <Row
            label="Passkey"
            tags={passkeys.length ? null : <Tag kind="flat">None</Tag>}
            meta="Your face, fingerprint or device PIN, instead of a password."
            actions={
              <Button onClick={addPasskey} disabled={!!busy}>
                {busy === 'passkey' ? 'Waiting…' : '+ Add a passkey'}
              </Button>
            }
          />
        </>
      )}
    </Panel>
  );
}
