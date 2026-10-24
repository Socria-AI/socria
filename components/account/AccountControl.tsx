'use client';
// components/account/AccountControl.tsx
//
// Socria's own account control — what stands where Clerk's <UserButton> used
// to, in the rail foot and the Logos header.
//
// WHY REPLACE IT AT ALL. Clerk's button is a good button; it is just not this
// product's button. It arrives with its own popover, its own type, its own
// idea of what an account menu contains, and it renders an <img> of whatever
// Clerk holds — which is not the picture somebody composed in this product's
// own composer. Two account menus, one of them unstyleable past a token list,
// is the seam a person notices without being able to name.
//
// WHAT IT DOES INSTEAD. The design's `.who-btn`: their first name and their
// own avatar, opening this product's account sheet, which already carries
// everything Clerk's popover did — the profile, sign-out, devices, export and
// delete — and several things it did not.
//
// The picture is read from localStorage on mount and re-read whenever the
// composer says it changed, so setting one updates the chip without a reload.
// It is deliberately NOT read during render: the server has no localStorage,
// and a component that reads it there hydrates into a mismatch.

import { useEffect, useId, useRef, useState } from 'react';
import Link from 'next/link';
import { useUser } from '@clerk/nextjs';
import { Avatar } from './Avatar';
import { PFP_KEY, sanitizePfp, type PfpConfig } from '@/lib/pfp';
import './account-control.css';

/** Broadcast by the composer when a picture is saved. */
export const PFP_CHANGED = 'socria:pfp';

export function AccountControl({
  onOpen,
  href,
  isOne = false,
  items,
}: {
  /** open the account sheet — what /chat and /logos want, over the app */
  onOpen?: () => void;
  /**
   * Navigate instead, for the pages that have no sheet to open over.
   * The journal and the blog are reading surfaces; putting a modal over an
   * article to change a password would be the wrong shape of thing entirely,
   * so there they link to /account.
   */
  href?: string;
  /** One opens marks the free tier does not carry; sanitize needs to know. */
  isOne?: boolean;
  /**
   * The profile's own menu, when the chip opens one rather than the sheet —
   * Logos 5 keeps Memory here (Alex Tran: the mind graph lives in the
   * profile). Escape and a press elsewhere close it.
   */
  items?: { label: string; hint?: string; onSelect: () => void }[];
}) {
  const { user } = useUser();
  const [pfp, setPfp] = useState<PfpConfig | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const wrap = useRef<HTMLSpanElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!menuOpen) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        wrap.current?.querySelector<HTMLButtonElement>('.who-btn')?.focus();
      }
    };
    window.addEventListener('pointerdown', away);
    window.addEventListener('keydown', key);
    requestAnimationFrame(() => wrap.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus());
    return () => {
      window.removeEventListener('pointerdown', away);
      window.removeEventListener('keydown', key);
    };
  }, [menuOpen]);

  useEffect(() => {
    const read = () => {
      try {
        const raw = localStorage.getItem(PFP_KEY);
        setPfp(raw ? sanitizePfp(JSON.parse(raw), { isOne }) : null);
      } catch {
        setPfp(null);
      }
    };
    read();
    window.addEventListener(PFP_CHANGED, read);
    // Another tab composing a picture is the same event as this one doing it.
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(PFP_CHANGED, read);
      window.removeEventListener('storage', read);
    };
  }, [isOne]);

  // firstName can be empty on an account that signed up with an email and
  // nothing else, which is most of them. The local part of the address is a
  // better guess than "You" and a much better one than blank.
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const first =
    user?.firstName ||
    user?.username ||
    (email ? email.split('@')[0] : '') ||
    'You';
  const initial = first.charAt(0).toUpperCase();

  const inside = (
    <>
      <span className="who-nm">{first}</span>
      {pfp ? (
        <Avatar cfg={pfp} size={26} className="av-sm" />
      ) : (
        <span className="avatar" aria-hidden="true">
          {initial}
        </span>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className="who-btn" title="Your account">
        {inside}
      </Link>
    );
  }

  if (items?.length) {
    return (
      <span className="who-wrap" ref={wrap}>
        <button
          type="button"
          className="who-btn"
          onClick={() => setMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuOpen ? menuId : undefined}
          title="Your account"
        >
          {inside}
        </button>
        {menuOpen && (
          <span className="who-menu" role="menu" id={menuId} aria-label="Your account">
            {items.map((it) => (
              <button
                key={it.label}
                type="button"
                role="menuitem"
                onClick={() => {
                  setMenuOpen(false);
                  it.onSelect();
                }}
              >
                <span>{it.label}</span>
                {it.hint && <small>{it.hint}</small>}
              </button>
            ))}
          </span>
        )}
      </span>
    );
  }

  return (
    <button
      type="button"
      className="who-btn"
      onClick={onOpen}
      aria-haspopup="dialog"
      title="Your account"
    >
      {inside}
    </button>
  );
}
