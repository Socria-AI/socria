'use client';

// components/account/kit.tsx
//
// The pieces every account panel is built from.
//
// Socria manages the account itself rather than embedding Clerk's card, so
// there are seven panels where there was one component, and they all need the
// same three things: a way through Clerk's reverification wall, a way to say
// what went wrong, and a shape to sit in. Written once here so the panels
// contain their own subject and nothing else.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useClerk, useUser } from '@clerk/nextjs';
import { clerkMessage, needsReverification } from '@/lib/clerk-errors';

/** The person closed the reverification modal rather than completing it. */
export class ReverifyCancelled extends Error {}

/**
 * Run an operation, and if Clerk asks the person to prove themselves first,
 * let them, then run it again.
 *
 * Sensitive operations — adding an email, changing a password, turning off
 * two-factor — are refused on a session that has not proved itself recently.
 * This mirrors what clerk-js does inside its own components: match the error,
 * open the verification modal with no level so Clerk decides what the account
 * needs, wait, retry once. Once, not in a loop: a freshly verified session
 * that is still refused is a real refusal, and the person should read it
 * rather than watch a modal reopen for ever.
 */
export function useReverification() {
  const clerk = useClerk();

  return useCallback(
    async <T,>(op: () => Promise<T>): Promise<T> => {
      try {
        return await op();
      } catch (e) {
        if (!needsReverification(e)) throw e;
        const open = (
          clerk as unknown as {
            __experimental_openUserVerification?: (p: {
              afterVerification?: () => void;
              afterVerificationCancelled?: () => void;
            }) => void;
          }
        ).__experimental_openUserVerification;
        // Still flagged experimental in the SDK, and absent from older
        // clerk-js builds. Where it is missing the original refusal is the
        // honest thing to show — with the way out named, in describeFailure.
        if (typeof open !== 'function') throw e;
        await new Promise<void>((resolve, reject) => {
          open({
            afterVerification: () => resolve(),
            afterVerificationCancelled: () =>
              reject(new ReverifyCancelled('verification cancelled')),
          });
        });
        return await op();
      }
    },
    [clerk],
  );
}

/**
 * What to say when something failed.
 *
 * Clerk's own words for anything it refused — those are mostly configuration
 * or plain fact, and somebody who is stuck needs the real reason more than a
 * soft one — plus the two cases this code creates itself.
 */
export function describeFailure(e: unknown, fallback: string): string {
  if (e instanceof ReverifyCancelled) {
    return 'Confirming it was you was cancelled, so nothing changed. Try again when you are ready.';
  }
  if (needsReverification(e)) {
    // The modal was unavailable. A fresh sign-in satisfies the same
    // requirement, so say that rather than leaving them at a dead end.
    return `${clerkMessage(e, fallback)} Signing out and back in, then trying again, will also clear this.`;
  }
  return clerkMessage(e, fallback);
}

/**
 * The per-panel plumbing: what is in flight, what failed, what just worked.
 *
 * `run` is the shape every action in every panel has — mark busy, clear the
 * last message, do the thing through reverification, say how it went, and
 * always stop being busy however it ends. Writing that seven times was how
 * one of them was going to end up stuck on "Saving…" for ever.
 */
export function usePanel() {
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const reverify = useReverification();
  const { user } = useUser();

  const run = useCallback(
    async (
      key: string,
      op: () => Promise<void>,
      opts: { fallback: string; done?: string; reload?: boolean } = { fallback: 'That did not work.' },
    ): Promise<boolean> => {
      setBusy(key);
      setErr(null);
      setNote(null);
      try {
        await reverify(op);
        // Clerk's local copy of the user is stale until it is reloaded, and
        // every panel renders from it. Default on, because forgetting it
        // shows the person the state they just changed away from.
        if (opts.reload !== false) await user?.reload();
        if (opts.done) setNote(opts.done);
        return true;
      } catch (e) {
        setErr(describeFailure(e, opts.fallback));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [reverify, user],
  );

  const clear = useCallback(() => {
    setErr(null);
    setNote(null);
  }, []);

  return { busy, err, note, run, clear, setErr, setNote };
}

/* ─────────────────────────── the shape they sit in ──────────────────────── */

export function Panel({
  title,
  lede,
  children,
  id,
}: {
  title: string;
  lede?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section className="acct-panel" id={id} aria-labelledby={id ? `${id}-t` : undefined}>
      <div className="acct-panel-head">
        <h2 className="acct-panel-title" id={id ? `${id}-t` : undefined}>
          {title}
        </h2>
        {lede && <p className="acct-panel-lede">{lede}</p>}
      </div>
      {children}
    </section>
  );
}

/** One thing in a list of things: an address, a device, a connected account. */
export function Row({
  label,
  meta,
  tags,
  actions,
}: {
  label: ReactNode;
  meta?: ReactNode;
  tags?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="acct-row">
      <div className="acct-row-main">
        <div className="acct-row-label">
          {label}
          {tags}
        </div>
        {meta && <div className="acct-row-meta">{meta}</div>}
      </div>
      {actions && <div className="acct-row-actions">{actions}</div>}
    </div>
  );
}

export function Tag({ kind, children }: { kind?: 'good' | 'warn' | 'flat'; children: ReactNode }) {
  return <span className={`acct-tag is-${kind || 'flat'}`}>{children}</span>;
}

export function Note({ err, note }: { err?: string | null; note?: string | null }) {
  if (err) {
    return (
      <p className="acct-err" role="alert">
        {err}
      </p>
    );
  }
  if (note) {
    return (
      <p className="acct-note" role="status">
        {note}
      </p>
    );
  }
  return null;
}

export function Field({
  label,
  hint,
  ...input
}: {
  label: string;
  hint?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = useMemo(() => input.id || `f-${Math.random().toString(36).slice(2, 9)}`, [input.id]);
  return (
    <div className="acct-field">
      <label className="acct-label" htmlFor={id}>
        {label}
      </label>
      <input {...input} id={id} className="acct-input" />
      {hint && <p className="acct-hint">{hint}</p>}
    </div>
  );
}

export function Button({
  kind = 'quiet',
  children,
  ...rest
}: { kind?: 'go' | 'quiet' | 'danger' } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className={`acct-btn is-${kind}`}>
      {children}
    </button>
  );
}

/**
 * A destructive action that asks first, inline.
 *
 * Removing an address, revoking a device, turning off two-factor: none of
 * these can be undone by pressing the button again, and a modal for each was
 * more furniture than the page can carry. So the button becomes the question.
 */
export function Confirm({
  label,
  question,
  confirm,
  onConfirm,
  disabled,
}: {
  label: string;
  question: string;
  confirm: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <Button kind="danger" onClick={() => setAsking(true)} disabled={disabled}>
        {label}
      </Button>
    );
  }
  return (
    <span className="acct-confirm">
      <span className="acct-confirm-q">{question}</span>
      <Button
        kind="danger"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        disabled={disabled}
      >
        {confirm}
      </Button>
      <Button kind="quiet" onClick={() => setAsking(false)} disabled={disabled}>
        Keep it
      </Button>
    </span>
  );
}

/**
 * Whether the instance allows a thing at all.
 *
 * Clerk's environment says which sign-in methods, social providers and
 * attributes are switched on. Panels for things this instance does not do
 * should not be on the page — an empty "Phone numbers" heading is worse than
 * no heading. It is `__unstable__`, so everything here is optional and the
 * fallbacks are the conservative answer.
 */
export interface InstanceCapabilities {
  password: boolean;
  passkeys: boolean;
  totp: boolean;
  backupCodes: boolean;
  phone: boolean;
  socialStrategies: string[];
}

const CapContext = createContext<InstanceCapabilities | null>(null);

export function useCapabilities(): InstanceCapabilities {
  return (
    useContext(CapContext) ?? {
      password: true,
      passkeys: false,
      totp: false,
      backupCodes: false,
      phone: false,
      socialStrategies: [],
    }
  );
}

export function CapabilitiesProvider({ children }: { children: ReactNode }) {
  const clerk = useClerk();
  const caps = useMemo<InstanceCapabilities>(() => {
    const env = (
      clerk as unknown as {
        __unstable__environment?: {
          userSettings?: {
            attributes?: Record<string, { enabled?: boolean; used_for_second_factor?: boolean }>;
            socialProviderStrategies?: string[];
          };
        };
      }
    ).__unstable__environment;
    const attrs = env?.userSettings?.attributes ?? {};
    const on = (k: string) => !!attrs[k]?.enabled;
    return {
      // Password defaults on when the environment cannot be read: the panel
      // failing to appear is worse than one that appears and is refused.
      password: env ? on('password') : true,
      passkeys: on('passkey'),
      totp: on('authenticator_app'),
      backupCodes: on('backup_code'),
      phone: on('phone_number'),
      socialStrategies: env?.userSettings?.socialProviderStrategies ?? [],
    };
  }, [clerk]);

  return <CapContext.Provider value={caps}>{children}</CapContext.Provider>;
}
