'use client';
// components/dashboard/DashboardCodeGate.tsx — the two-step code form.
//
// Holds nothing: each code is sent once to /api/dev/dashboard-code, which
// answers with a signed httpOnly cookie, and the page is asked again
// (router.refresh) to decide what to show. lib/dashboard/codes.ts has the rules.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function DashboardCodeGate({ step }: { step: 1 | 2 }) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!code.trim() || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch('/api/dev/dashboard-code', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ step, code }),
      });
      setCode('');
      if (r.ok) {
        router.refresh();
        return;
      }
      if (r.status === 429) setMsg('Too many tries. Wait a minute, then try again.');
      else if (step === 2) {
        setMsg('That was not right. Start again from the first code.');
        router.refresh();
      } else setMsg('That was not right.');
    } catch {
      setMsg('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="dash dash-gate">
      <form onSubmit={submit} className="dash-gate-card">
        <p className="dash-kicker">Developer dashboard · step {step} of 2</p>
        <label htmlFor="dash-code" className="dash-gate-label">
          {step === 1 ? 'First code' : 'Second code'}
        </label>
        <input
          id="dash-code"
          type="password"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="dash-gate-input"
        />
        <button type="submit" className="dash-gate-button" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <p className="dash-gate-msg" role="status" aria-live="polite">
          {msg ?? ''}
        </p>
      </form>
    </main>
  );
}
