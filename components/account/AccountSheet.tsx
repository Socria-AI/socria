'use client';
// components/account/AccountSheet.tsx
//
// The account, over the app — never a page of its own.
//
// Ported from the design package. Two deliberate differences from the
// mockup, both because this product already has the real thing:
//
//   EXPORT AND DELETE ARE LINKS, NOT BUTTONS. /account/data already does
//   both, properly, with the confirmations that belong to an irreversible
//   action. Re-implementing "Delete everything" as a button inside a sheet
//   would be a second path to the most destructive thing in the product,
//   and the two would drift.
//
//   MEMBERSHIP AND SIGN-OUT DEFER TO CLERK. The plan comes from the real
//   entitlement, not a prop.
//
// Depth is deliberately absent: it belongs beside the conversation, and the
// product already keeps it there.

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useClerk, useUser } from '@clerk/nextjs';
import { Avatar } from './Avatar';
import { PFP_KEY, sanitizePfp, type PfpConfig } from '@/lib/pfp';
import { TOUR_KEY } from '@/lib/tour';
import { resetSeen } from '@/lib/hints';
import { HINTS_CHANGED } from '@/components/Hint';
import { StudentAccess } from '@/components/StudentAccess';
import type { PlanState } from '@/components/usePlan';
import { clearSocriaLocalData } from '@/lib/local-data';

export function AccountSheet({
  open,
  onClose,
  isOne = false,
  plan,
  onRetakeTour,
}: {
  open: boolean;
  onClose: () => void;
  isOne?: boolean;
  /**
   * The whole plan answer, when the caller has it.
   *
   * Needed for the university section: whether the deployment runs the
   * programme at all is a server fact (SOCRIA_EDU_DOMAINS), and it arrives
   * on this object as `student`. Optional so a caller that only knows the
   * tier can still open the sheet — the section simply does not render.
   */
  plan?: PlanState;
  onRetakeTour?: () => void;
}) {
  const { user } = useUser();
  const { signOut } = useClerk();
  const ref = useRef<HTMLDivElement>(null);
  const [pfp, setPfp] = useState<PfpConfig | null>(null);

  useEffect(() => {
    if (!open) return;
    try {
      const raw = localStorage.getItem(PFP_KEY);
      setPfp(raw ? sanitizePfp(JSON.parse(raw), { isOne }) : null);
    } catch {
      setPfp(null);
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    ref.current?.querySelector('button')?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, isOne]);

  const retake = useCallback(() => {
    try {
      localStorage.removeItem(TOUR_KEY);
    } catch {}
    onClose();
    onRetakeTour?.();
  }, [onClose, onRetakeTour]);

  if (!open) return null;

  const name = user?.fullName || user?.username || 'You';
  const email = user?.primaryEmailAddress?.emailAddress ?? '';
  const since = user?.createdAt ? new Date(user.createdAt).getFullYear() : null;

  return (
    <div className="acct-sheet">
      <div
        className="scrim"
        onPointerDown={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Your account" ref={ref}>
          <div className="head">
            <div>
              <p className="lbl">Your account</p>
              <h2>Everything here is yours.</h2>
            </div>
            <button type="button" className="x" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>

          <div className="scroll">
            <div className="sec">
              <span className="lbl">Signed in as</span>
              <div className="person">
                {pfp ? (
                  <Avatar cfg={pfp} size={52} className="av-sm" />
                ) : (
                  <span className="avatar lg" aria-hidden="true">
                    {name.charAt(0)}
                  </span>
                )}
                <div>
                  <div className="nm">{name}</div>
                  <div className="em2">{email}</div>
                  {since && <div className="since">thinking here since {since}</div>}
                  <Link className="pfp-link" href="/account/picture" onClick={onClose}>
                    Change your picture →
                  </Link>
                </div>
              </div>
            </div>

            <div className="sec">
              <span className="lbl">Membership</span>
              <div className="plan">
                <div>
                  <div className="tier">
                    <span className="t">
                      {isOne ? (
                        <>
                          Socria <span className="em">One</span>
                        </>
                      ) : (
                        'Logos, free'
                      )}
                    </span>
                  </div>
                  <p className="note">
                    {isOne
                      ? 'Unbounded maps, Research across the whole map, every depth, Draft Space in full.'
                      : 'Real maps, every lens and every move.'}
                  </p>
                </div>
                <Link className="link-act" href="/one" onClick={onClose}>
                  {isOne ? 'Manage membership' : 'Continue with One →'}
                </Link>
              </div>
            </div>

            {/* The university programme.
              *
              * It lived only on /account, the full page — and the account is
              * this sheet now, so for anyone who never types that URL the
              * feature had effectively disappeared. StudentAccess renders
              * nothing at all where the deployment does not run the
              * programme (SOCRIA_EDU_DOMAINS unset, see lib/socria-edu.ts),
              * so this section is gated on the same fact rather than showing
              * an empty heading.
              *
              * The panel carries its own .edu-* styles, which are global and
              * name nothing else, so it needs no wrapper to survive here. */}
            {plan?.student && (
              <div className="sec">
                <span className="lbl">University</span>
                <StudentAccess state={plan} />
              </div>
            )}

            <div className="sec">
              <span className="lbl">Your thinking</span>
              <div className="acts">
                {/* One path to an irreversible action, and it is the one
                    that already has the confirmations. */}
                <Link className="act" href="/projects" onClick={onClose}>
                  Projects
                </Link>
                <Link className="act" href="/memory" onClick={onClose}>
                  Memory
                </Link>
                <Link className="act" href="/account/data" onClick={onClose}>
                  <span className="t">Export or delete everything</span>
                  <span className="d">Verbatim, nothing summarised — and it does not come back</span>
                </Link>
              </div>
            </div>

            <div className="sec">
              <span className="lbl">This device</span>
              <div className="acts">
                <button type="button" className="act" onClick={retake}>
                  <span className="t">Take the tour again</span>
                  <span className="d">Four notes on the four controls</span>
                </button>
                {/* The thing that makes showing hints at all defensible: a
                    person who dismissed one before reading it can get it
                    back. Without this, the product teaches you once and
                    punishes you for blinking. */}
                <button
                  type="button"
                  className="act"
                  onClick={() => {
                    resetSeen(window.localStorage);
                    window.dispatchEvent(new Event(HINTS_CHANGED));
                    onClose();
                  }}
                >
                  <span className="t">Show hints again</span>
                  <span className="d">The one-line notes beside new things</span>
                </button>
                <button type="button" className="act" onClick={() => {
                    // A shared device must not hand the next person this
                    // one's conversations, sessions or derived memory.
                    clearSocriaLocalData();
                    void signOut();
                  }}>
                  <span className="t">Sign out</span>
                  <span className="d">Your maps wait on the others</span>
                </button>
              </div>
            </div>
          </div>

          <div className="footbar">
            <p className="vow">
              Export it, or delete it. What you have made is yours — leaving takes it with you.
            </p>
            <button type="button" className="link-act" onClick={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
