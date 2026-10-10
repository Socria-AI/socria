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
import { usePlan, type PlanState } from '@/components/usePlan';
import { RewardsPanel } from '@/components/rewards/RewardsPanel';
import { clearSocriaLocalData } from '@/lib/local-data';
import { FEEDBACK_URL } from '@/lib/feedback';
import { ThemePicker } from './ThemePicker';
import { AccessCode } from './AccessCode';
import { anyModelGated } from '@/lib/socria-model-store';
import { PLANS } from '@/lib/entitlements';
import { TestingTools } from './TestingTools';
import { NameField, RolePicker } from './RolePicker';
import { ConversationStylePicker } from './ConversationStylePicker';
import { LogosInstructions } from './LogosInstructions';

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
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, isOne]);

  // Focus goes into the sheet when it OPENS, and only then. It sat in the
  // effect above, which re-runs whenever the page behind hands down a new
  // onClose — so any re-render of that page (a style chosen in this very
  // sheet is one) pulled focus back to the close button mid-keystroke.
  useEffect(() => {
    if (open) ref.current?.querySelector('button')?.focus();
  }, [open]);

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

            {plan ? (
              <Membership isOne={isOne} plan={plan} onClose={onClose} />
            ) : (
              <MembershipAsked isOne={isOne} onClose={onClose} />
            )}

            {/* Socria Rewards: the 5-Node Challenge, Give 7 / Get 7, and what each reward did. */}
            <RewardsPanel enabled={!!user} />

            {/* Only while a model waits behind a code: with none gated, a
                code has nothing to open (lib/feature-gates.ts). */}
            {anyModelGated() && (
              <div className="sec">
                <span className="lbl">Access code</span>
                <AccessCode onOpened={onClose} />
              </div>
            )}

            <div className="sec">
              <span className="lbl">Theme</span>
              <ThemePicker isOne={isOne} onUpgrade={onClose} />
            </div>

            {/* Personalization: how Socria talks with you and what it knows
                to call you by. The style is the account's and follows you to
                every device; your own words, the name and the role are kept
                in this browser, as they always were. */}
            <div className="sec">
              <span className="lbl">Personalization</span>
              <div className="sub">
                <h3 className="sub-h">Conversation style</h3>
                <p className="sub-d">Socria&rsquo;s personality: how it talks with you, the same in Core 4 and in Logos. Kept with your account, on every device.</p>
                <ConversationStylePicker signedIn={!!user} />
              </div>
              {/* The words Logos keeps behind its own sheet, from here too.
                  No dials: the Conversation Style above is the personality. */}
              <div className="sub">
                <h3 className="sub-h">Your own words, in Logos</h3>
                <p className="sub-d">Standing instructions, layered over your Conversation Style.</p>
                <LogosInstructions />
              </div>
              <div className="sub">
                <h3 className="sub-h">What Socria calls you</h3>
                <NameField />
              </div>
              <div className="sub">
                <h3 className="sub-h">What you mostly think about</h3>
                <RolePicker />
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
                <Link className="act" href="/memory" onClick={onClose}>
                  Memory
                </Link>
                <Link className="act" href="/account/data" onClick={onClose}>
                  <span className="t">Export or delete everything</span>
                  <span className="d">Verbatim, nothing summarised — and it does not come back</span>
                </Link>
              </div>
            </div>

            {/* Feedback lives here now; the sidebar's foot keeps to import
                and memory. Signed out, /support has the address. */}
            <div className="sec">
              <span className="lbl">Feedback</span>
              <div className="acts">
                <a className="act" href={FEEDBACK_URL} target="_blank" rel="noopener noreferrer" onClick={onClose}>
                  <span className="t">
                    Send feedback <span aria-hidden="true">↗</span>
                  </span>
                  <span className="d">A short form: what is wrong, or what is missing</span>
                </a>
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
              </div>
            </div>

            {/* Testing: never on production (the component checks). */}
            <TestingTools onClose={onClose} />
          </div>

          <div className="footbar">
            <p className="vow">
              Export it, or delete it. What you have made is yours — leaving takes it with you.
            </p>
            <div className="foot-acts">
              {/* SIGN OUT WHERE IT IS ALWAYS IN VIEW. It sat at the end of the
                  last section, under the tour and the hints, and somebody
                  looking for it did not find it. The footbar does not scroll.
                  This browser's Socria data goes first: a shared device must
                  not hand the next person this one's conversations, sessions
                  or derived memory. */}
              {user && (
                <button
                  type="button"
                  className="link-act out"
                  onClick={() => {
                    clearSocriaLocalData();
                    void signOut({ redirectUrl: '/' });
                  }}
                >
                  Sign out
                </button>
              )}
              <button type="button" className="link-act" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/** The free plan's day and month, read from the one table (lib/entitlements.ts) rather than typed twice. */
function freeTerms(): string {
  const c = PLANS.free.counters;
  return `Every model, lens and move. Each day: ${c['core-chats']} new chats and ${c['core-messages']} messages in Core, ${c.messages} messages in Logos — and ${c.chats} Logos lines of thinking a month.`;
}

/**
 * The membership line. Socria One from a REWARD alone is said as such — with
 * how long is left and the way to keep it — rather than as a membership with
 * something to manage, because there is no billing behind it.
 */
function Membership({ isOne, plan, onClose }: { isOne: boolean; plan: PlanState | null; onClose: () => void }) {
  const promo = plan?.promo;
  const fromReward = isOne && !!promo?.only;
  return (
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
                'Socria, free'
              )}
            </span>
          </div>
          <p className="note">
            {fromReward
              ? `From Socria Rewards — ${promo!.daysLeft} ${promo!.daysLeft === 1 ? 'day' : 'days'} left. A membership keeps it, and saves the days still to come.`
              : isOne
                ? 'No daily count, every chat shared if you like, and how you reason carried between conversations.'
                : freeTerms()}
          </p>
        </div>
        <Link className="link-act" href="/one" onClick={onClose}>
          {fromReward ? 'Keep Socria One →' : isOne ? 'Manage membership' : 'Continue with One →'}
        </Link>
      </div>
    </div>
  );
}

/** The same line, for a caller that did not pass the plan: asked only while the sheet is open. */
function MembershipAsked({ isOne, onClose }: { isOne: boolean; onClose: () => void }) {
  const plan = usePlan();
  return <Membership isOne={isOne} plan={plan.known ? plan : null} onClose={onClose} />;
}
