'use client';
// components/account/MRSettings.tsx
//
// Manage Account → Personalization → How Socria adjusts to you.
//
// Metacognitive Regulation (lib/mr) changes how Socria helps when something
// is not working — and a person should be able to see that it did, why, and
// stop it. This is where: two switches, the latest adjustments in plain words
// (lib/mr/words.ts), and a reset.
//
// NOTHING RENDERS unless the account answered and MR runs on this
// deployment. MR is off by default (LOGOS_MR), and a switch for a mechanism
// that is not running would be a placebo: it would let somebody believe they
// had turned something off, or on, when nothing was there. Signed out there
// is no account to keep the choice, so nothing renders either. An answer that
// did not arrive is treated as no — the server fails closed the same way (a
// settings read that fails runs the turn as baseline).
//
// The list says what changed and why in terms of the conversation ("because
// the questions weren't helping"), never what the person felt, and it holds
// no words of anybody's: the API sends codes and the words come from a fixed
// table. It claims no more than is so: "still on" only while their switch is
// on (their "off" ends every adjustment — lib/mr/experiment.ts), how far one
// reaches only from its scope, "in every conversation" only while they let
// it carry, and an empty list says "nothing adjusted" only when the account
// could read the whole list and nothing in force is missing from it (what is,
// is counted: `unlisted`).
//
// RESET SAYS WHAT IT DOES, which is not "everything ends". What Socria
// adjusted on its own ends in every conversation it kept a record of (from
// the next message there: lib/mr/state.ts folds the reset in); what they
// asked for in their own words keeps holding in the conversation they said
// it in, because their words are still there; nothing from before is carried
// into another conversation; and a conversation nothing was recorded for
// (incognito, off the record) has nothing to reset. A reset that removed the
// records but could not save itself says exactly that.
//
// MRSettingsView is the markup alone, so a test can render each state
// without a browser or an account.

import { useEffect, useRef, useState } from 'react';
import { adjustmentReachWords, adjustmentWords } from '@/lib/mr/words';
import { whenSaid } from '@/lib/share/comments';
import { useMRSettings, type AdjustmentSummary, type MRSettingsHook } from '@/components/useMRSettings';

/** the list is the latest few, not a history */
const SHOWN = 5;

type Said = 'saved' | 'not-saved' | 'reset' | 'reset-partial' | 'not-reset';
const SAID: Record<Said, string> = {
  saved: 'Saved. It applies from your next message.',
  'not-saved': 'That did not save, so nothing changed. Try again in a moment.',
  reset: 'Reset. What Socria adjusted on its own ends from your next message, in every conversation it kept a record of; what you asked for still holds where you asked for it.',
  'reset-partial': 'What Socria recorded was removed, but the reset itself didn’t save. Reset again to finish it.',
  'not-reset': 'That did not reset, so nothing was cleared. Try again in a moment.',
};
const BAD: ReadonlySet<Said> = new Set(['not-saved', 'reset-partial', 'not-reset']);

/**
 * Adjustments in force that the list has no entry for, said as a count —
 * with the usual reason when they have reset: what they asked for before it
 * still holds in the conversation they asked in.
 */
function unlistedWords(n: number, more: boolean, sinceReset: boolean): string {
  const what = n === 1 ? `${more ? '1 more adjustment' : '1 adjustment'} is still on but isn’t listed here` : `${n} ${more ? 'more adjustments' : 'adjustments'} are still on but aren’t listed here`;
  return sinceReset ? `${what}: what you asked for before your last reset still holds in the conversation you asked in.` : `${what}.`;
}

export function MRSettings({ signedIn = true }: { signedIn?: boolean }) {
  const mr = useMRSettings(signedIn);
  return <MRSettingsView {...mr} />;
}

export function MRSettingsView({
  state,
  active,
  settings,
  adjustments,
  adjustmentsIncomplete,
  unlisted,
  settingsUnsupported,
  resetting,
  setEnabled,
  setCarryAcross,
  reset,
  now,
}: MRSettingsHook & { now?: number }) {
  const [said, setSaid] = useState<Said | null>(null);
  const [confirming, setConfirming] = useState(false);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const resetBtn = useRef<HTMLButtonElement>(null);
  const keepBtn = useRef<HTMLButtonElement>(null);
  const wasConfirming = useRef(false);

  useEffect(() => () => {
    if (settle.current) clearTimeout(settle.current);
  }, []);

  // Focus follows the confirm step: into it on the way in (onto "Keep them",
  // the safe answer), back to the button it came from on the way out.
  useEffect(() => {
    if (confirming) keepBtn.current?.focus();
    else if (wasConfirming.current) resetBtn.current?.focus();
    wasConfirming.current = confirming;
  }, [confirming]);

  if (state !== 'ready' || active !== true) return null;

  const tell = (s: Said) => {
    setSaid(s);
    if (settle.current) clearTimeout(settle.current);
    // the plain confirmations fade; a failure stays until the next try
    if (s === 'saved' || s === 'reset') settle.current = setTimeout(() => setSaid(null), 4000);
  };
  const toggle = async (save: (on: boolean) => Promise<boolean>, on: boolean) => tell((await save(on)) ? 'saved' : 'not-saved');
  const doReset = async () => {
    setConfirming(false);
    const done = await reset();
    tell(done === 'partial' ? 'reset-partial' : done ? 'reset' : 'not-reset');
  };

  const at = now ?? Date.now();
  const latest = adjustments.slice(0, SHOWN);
  // nothing is "still on" while their switch is off
  const hidden = settings.enabled === true && typeof unlisted === 'number' && unlisted > 0 ? unlisted : 0;
  const sinceReset = typeof settings.resetAt === 'number';

  return (
    <div className="sub mr">
      <h3 className="sub-h">How Socria adjusts to you</h3>
      <p className="sub-d">
        When something isn&rsquo;t working &mdash; questions that aren&rsquo;t helping, an explanation that didn&rsquo;t
        land &mdash; Socria can change how it helps for a while. It never overrides what you asked for, and you can turn
        it off.
      </p>

      <div className="mr-switches">
        <MRSwitch
          id="mr-enabled"
          label="Let Socria adjust how it helps"
          note="Off, Socria helps the way it does by default."
          on={settings.enabled}
          locked={settingsUnsupported}
          onToggle={(on) => void toggle(setEnabled, on)}
        />
        <MRSwitch
          id="mr-carry"
          label="Remember what you told it across conversations"
          note={'Only things you said for the future — “from now on”, “always” — are carried; what you limited to one chat stays in that chat. Off unless you turn it on.'}
          on={settings.carryAcross}
          locked={settingsUnsupported}
          onToggle={(on) => void toggle(setCarryAcross, on)}
        />
      </div>
      {settingsUnsupported && (
        <p className="mr-note mr-locked" id="mr-locked">
          This account can&rsquo;t keep a change here yet, so these stay as they are.
        </p>
      )}

      <p className="mr-list-h" id="mr-list-h">
        Latest adjustments
      </p>
      {latest.length ? (
        <ul className="mr-list" aria-labelledby="mr-list-h">
          {latest.map((a, i) => {
            // Their "off" ends every adjustment, whatever the record says.
            const inForce = a.status === 'active' && settings.enabled === true;
            const reach = inForce ? reachOf(a, settings.carryAcross === true) : '';
            return (
              <li key={`${a.at}:${a.turn}:${a.action}:${i}`} className={`mr-item${inForce ? ' is-on' : ''}`}>
                <span className="mr-what">{adjustmentWords(a.action, a.trigger)}</span>
                <span className="mr-when">
                  {whenSaid(a.at, at)}
                  {inForce && <span className="mr-still"> · still on</span>}
                  {reach && ` · ${reach}`}
                </span>
              </li>
            );
          })}
        </ul>
      ) : adjustmentsIncomplete ? (
        <p className="mr-empty">The latest adjustments couldn&rsquo;t be loaded just now.</p>
      ) : hidden ? (
        <p className="mr-empty mr-unlisted">{unlistedWords(hidden, false, sinceReset)}</p>
      ) : (
        <p className="mr-empty">Nothing adjusted yet. When Socria changes how it helps, it shows here.</p>
      )}
      {latest.length > 0 && adjustmentsIncomplete && <p className="mr-note">Some adjustments couldn&rsquo;t be loaded just now.</p>}
      {latest.length > 0 && hidden > 0 && <p className="mr-note mr-unlisted">{unlistedWords(hidden, true, sinceReset)}</p>}

      <div className="mr-reset-row">
        {confirming ? (
          <div className="mr-confirm" role="group" aria-labelledby="mr-confirm-q" aria-describedby="mr-confirm-d">
            <span className="mr-confirm-q" id="mr-confirm-q">
              Reset what Socria adjusted?
            </span>
            <span className="mr-confirm-d" id="mr-confirm-d">
              What it adjusted on its own ends in every conversation it kept a record of, from your next message there,
              and nothing from before is carried into another conversation. What you asked for in your own words still
              holds in the conversation you said it in. A conversation nothing was recorded for (incognito, off the
              record) has nothing to reset.
            </span>
            <button type="button" className="mr-reset-yes" onClick={() => void doReset()}>
              Reset
            </button>
            <button type="button" className="mr-reset-no" ref={keepBtn} onClick={() => setConfirming(false)}>
              Keep them
            </button>
          </div>
        ) : (
          // aria-disabled, not disabled, while a reset is out: focus comes back here from the confirm step
          <button
            type="button"
            className="mr-reset"
            ref={resetBtn}
            aria-disabled={resetting || undefined}
            onClick={() => {
              if (!resetting) setConfirming(true);
            }}
          >
            {resetting ? 'Resetting…' : 'Reset adjustments'}
          </button>
        )}
      </div>

      <p className={`mr-status${said && BAD.has(said) ? ' is-bad' : ''}`} role="status" aria-live="polite">
        {said ? SAID[said] : ''}
      </p>
    </div>
  );
}

/**
 * How far an adjustment in force reaches, from its scope — never from
 * `conversation`, which only says it was recorded with a conversation id. A
 * standing one reaches other conversations only while they let it carry;
 * otherwise it holds where it was said. No scope in the answer, no claim.
 */
function reachOf(a: AdjustmentSummary, carryAcross: boolean): string {
  const standing = a.scope === 'standing' || (a.scope === null && a.standing);
  if (standing) return adjustmentReachWords(carryAcross ? { standing: true } : { conversation: true });
  return adjustmentReachWords({ conversation: a.scope === 'conversation' });
}

/**
 * An on/off switch: a button that says it is one, named by its label,
 * described by its note. Space and Enter flip it. Locked (the account cannot
 * keep the change) it says so and sends nothing.
 */
function MRSwitch({
  id,
  label,
  note,
  on,
  locked,
  onToggle,
}: {
  id: string;
  label: string;
  note: string;
  on: boolean;
  locked: boolean;
  onToggle: (on: boolean) => void;
}) {
  return (
    <div className="mr-row">
      <div className="mr-txt">
        <label className="mr-label" htmlFor={id}>
          {label}
        </label>
        <span className="mr-note" id={`${id}-d`}>
          {note}
        </span>
      </div>
      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={on}
        aria-describedby={locked ? `${id}-d mr-locked` : `${id}-d`}
        aria-disabled={locked || undefined}
        className={`mr-switch${on ? ' on' : ''}`}
        onClick={() => {
          if (!locked) onToggle(!on);
        }}
      >
        <span className="mr-knob" aria-hidden="true" />
      </button>
    </div>
  );
}
