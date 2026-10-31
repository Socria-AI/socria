'use client';

// components/account/ProfilePanel.tsx — who you are: name and picture.

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useUser } from '@clerk/nextjs';
import { IMAGE_ACCEPT, isImageFile, photoAsJpeg } from '@/lib/logos-upload';
import { Button, Field, Note, Panel, usePanel } from './kit';

/** Pictures Clerk accepts, and a ceiling it will reject above anyway. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
const MAX_BYTES = 10 * 1024 * 1024;
/** A converted picture: plenty for a face shown at most a few hundred pixels across. */
const AVATAR_EDGE = 1024;

export function ProfilePanel() {
  const { user } = useUser();
  const { busy, err, note, run, setErr } = usePanel();
  const file = useRef<HTMLInputElement>(null);

  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  // Seeded from the user, and re-seeded whenever Clerk's copy changes —
  // otherwise a reload after saving would leave the fields showing whatever
  // was typed rather than what was stored.
  useEffect(() => {
    setFirst(user?.firstName ?? '');
    setLast(user?.lastName ?? '');
  }, [user?.firstName, user?.lastName]);

  if (!user) return null;

  const dirty = first !== (user.firstName ?? '') || last !== (user.lastName ?? '');

  const save = () =>
    run(
      'name',
      async () => {
        await user.update({ firstName: first.trim(), lastName: last.trim() });
      },
      { fallback: 'Could not save your name.', done: 'Saved.' },
    );

  const pick = (f: File | undefined) => {
    if (!f) return;
    // Checked here so an obviously wrong file is refused instantly, rather
    // than after an upload that was always going to be rejected.
    if (!isImageFile(f)) {
      setErr('That needs to be a photo — a JPEG, PNG, HEIC, GIF or WebP.');
      return;
    }
    // what Clerk takes goes as it is; a phone's HEIC, a file that does not say what it is, or a
    // photo too large for it is made a JPEG here first (lib/logos-upload.ts)
    const asIs = IMAGE_TYPES.includes(f.type) && f.size <= MAX_BYTES;
    run('avatar', async () => void (await user.setProfileImage({ file: asIs ? f : await photoAsJpeg(f, AVATAR_EDGE) })), {
      fallback: 'Could not upload that picture.',
      done: 'Picture updated.',
    });
  };

  return (
    <Panel
      id="profile"
      title="Profile"
      lede="Your name is what Socria calls you. Nobody else sees it — there is nothing shared in Socria."
    >
      <Note err={err} note={note} />

      <div className="acct-row">
        <div className="acct-avatar-row">
          <Image
            className="acct-avatar"
            src={user.imageUrl}
            alt=""
            width={56}
            height={56}
            unoptimized
          />
          <div>
            <div className="acct-row-label">Picture</div>
            <div className="acct-row-meta">A JPEG, PNG, HEIC, GIF or WebP photo.</div>
          </div>
        </div>
        <div className="acct-row-actions">
          <input
            ref={file}
            type="file"
            accept={IMAGE_ACCEPT}
            hidden
            onChange={(e) => {
              pick(e.target.files?.[0]);
              // Cleared so choosing the same file twice fires again.
              e.target.value = '';
            }}
          />
          <Button onClick={() => file.current?.click()} disabled={!!busy}>
            {busy === 'avatar' ? 'Uploading…' : 'Change'}
          </Button>
          {user.hasImage && (
            <Button
              onClick={() =>
                run('avatar', async () => void (await user.setProfileImage({ file: null })), {
                  fallback: 'Could not remove that picture.',
                  done: 'Picture removed.',
                })
              }
              disabled={!!busy}
            >
              Remove
            </Button>
          )}
        </div>
      </div>

      <div className="acct-form">
        <Field
          label="First name"
          value={first}
          onChange={(e) => setFirst(e.target.value)}
          disabled={busy === 'name'}
          autoComplete="given-name"
        />
        <Field
          label="Last name"
          value={last}
          onChange={(e) => setLast(e.target.value)}
          disabled={busy === 'name'}
          autoComplete="family-name"
        />
        <div className="acct-form-actions">
          <Button kind="go" onClick={save} disabled={!!busy || !dirty}>
            {busy === 'name' ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </Panel>
  );
}
