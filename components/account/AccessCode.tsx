'use client';
// components/account/AccessCode.tsx
//
// An access code, under Manage Account. The code is checked on the server
// (app/api/access/gate/route.ts); what it opens is remembered in this browser
// and on the account, so it follows the person to another device.

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { accountGates, GATE_CHANGED, GATE_LABEL, openGates, rememberGate, type GateId } from '@/lib/feature-gates';

const OPENS: Record<GateId, { href: string; says: string }> = {
  logos3: { href: '/chat?model=logos-3', says: 'Open Logos 3 →' },
};

export function AccessCode({ onOpened }: { onOpened?: () => void }) {
  const { user } = useUser();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<GateId[]>([]);

  useEffect(() => {
    const read = () => setOpen([...new Set([...openGates(), ...accountGates(user?.unsafeMetadata)])]);
    read();
    window.addEventListener(GATE_CHANGED, read);
    return () => window.removeEventListener(GATE_CHANGED, read);
  }, [user]);

  async function apply(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/access/gate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.gate) throw new Error(json?.error || 'That code didn’t work. Check it and try again.');
      const gate = json.gate as GateId;
      rememberGate(gate);
      // On the account too, so another device knows. A failure here keeps
      // the unlock in this browser, which is the part that matters now.
      if (user) {
        const had = accountGates(user.unsafeMetadata);
        if (!had.includes(gate)) await user.update({ unsafeMetadata: { ...user.unsafeMetadata, access: [...had, gate] } }).catch(() => {});
      }
      setCode('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That code didn’t work.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="access">
      {open.map((g) => (
        <p key={g} className="access-open">
          <span>
            <b>{GATE_LABEL[g]}</b> is open on this account.
          </span>
          <Link className="link-act" href={OPENS[g].href} onClick={onOpened}>
            {OPENS[g].says}
          </Link>
        </p>
      ))}
      <form className="access-form" onSubmit={apply}>
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Access code"
          aria-label="Access code"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
        />
        <button type="submit" disabled={!code.trim() || busy}>
          {busy ? 'Checking…' : 'Apply'}
        </button>
      </form>
      {error && (
        <p className="access-err" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

/** An unlock made on another device reaches this one through the account. */
export function useGateSync() {
  const { user } = useUser();
  useEffect(() => {
    const here = openGates();
    for (const g of accountGates(user?.unsafeMetadata)) if (!here.includes(g)) rememberGate(g);
  }, [user]);
}
