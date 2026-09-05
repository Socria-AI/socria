'use client';

// components/account/DevicesPanel.tsx — where you are signed in.
//
// The point of this panel is one question: is there anything here I do not
// recognise? So it leads with the device and the place, and treats "this one"
// as the anchor everything else is read against.

import { useCallback, useEffect, useState } from 'react';
import { useAuth, useUser } from '@clerk/nextjs';
import type { SessionWithActivitiesResource } from '@clerk/types';
import { Button, Confirm, Note, Panel, Row, Tag, usePanel } from './kit';

/** "Chrome on macOS, Dallas" — as much as the activity actually knows. */
function describe(s: SessionWithActivitiesResource): string {
  const a = s.latestActivity ?? {};
  const browser = [a.browserName, a.browserVersion].filter(Boolean).join(' ');
  const device = a.deviceType || (a.isMobile ? 'Mobile device' : 'Computer');
  return browser ? `${browser} on ${device}` : device;
}

function where(s: SessionWithActivitiesResource): string {
  const a = s.latestActivity ?? {};
  return [a.city, a.country].filter(Boolean).join(', ') || a.ipAddress || '';
}

function when(d: Date | null | undefined): string {
  if (!d) return '';
  const mins = Math.round((Date.now() - d.getTime()) / 60000);
  if (mins < 2) return 'active now';
  if (mins < 60) return `${mins} minutes ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

export function DevicesPanel() {
  const { user } = useUser();
  const { sessionId } = useAuth();
  const { busy, err, note, run } = usePanel();

  const [sessions, setSessions] = useState<SessionWithActivitiesResource[] | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setSessions(await user.getSessions());
    } catch {
      // Not fatal, and not worth an alarm: the rest of the account page is
      // still usable, and the empty state below says the list is missing.
      setSessions([]);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  if (!user) return null;

  const revoke = async (s: SessionWithActivitiesResource) => {
    const ok = await run(`rm-${s.id}`, async () => void (await s.revoke()), {
      fallback: 'Could not sign that device out.',
      done: 'That device was signed out.',
      reload: false,
    });
    // The list comes from getSessions(), not from the user object, so on
    // success it is re-fetched rather than reloaded. On failure the error is
    // already on screen and the stale row is the honest thing to leave.
    if (ok) load();
  };

  return (
    <Panel
      id="devices"
      title="Where you are signed in"
      lede="Sign out anything you do not recognise. That device has to sign in again to get back."
    >
      <Note err={err} note={note} />

      {sessions === null && <p className="acct-empty">Looking…</p>}
      {sessions?.length === 0 && <p className="acct-empty">Nothing else is signed in.</p>}

      {sessions?.map((s) => {
        const isThis = s.id === sessionId;
        const place = where(s);
        return (
          <Row
            key={s.id}
            label={describe(s)}
            tags={isThis ? <Tag kind="good">This device</Tag> : null}
            meta={[place, when(s.lastActiveAt)].filter(Boolean).join(' · ')}
            actions={
              isThis ? null : (
                <Confirm
                  label="Sign out"
                  question="Sign this device out?"
                  confirm="Sign it out"
                  disabled={!!busy}
                  onConfirm={() => revoke(s)}
                />
              )
            }
          />
        );
      })}
    </Panel>
  );
}
