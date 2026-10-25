'use client';
// app/logos-5-internal/InternalCodeForm.tsx — the code that opens the page.
//
// Holds nothing: the code is sent once to /api/logos-5-internal, which answers
// with a signed httpOnly cookie, and the page is asked again (router.refresh)
// to decide what to show. lib/internal-pass.ts has the rules.

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export function InternalCodeForm() {
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
      const r = await fetch('/api/logos-5-internal', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
      });
      setCode('');
      if (r.ok) {
        router.refresh();
        return;
      }
      setMsg(r.status === 429 ? 'Too many tries. Wait a minute, then try again.' : 'That was not right.');
    } catch {
      setMsg('Could not reach the server. Try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="l5i l5i-gate">
      <form onSubmit={submit} className="l5i-gate-card">
        <p className="l5i-eb">Socria · internal</p>
        <h1 className="l5i-gate-h">Access code</h1>
        <p className="l5i-gate-d">This page is for the people building the new Socria. Type the access code you were given.</p>
        <label htmlFor="l5i-code" className="l5i-gate-label">
          Access code
        </label>
        <input
          id="l5i-code"
          type="password"
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className="l5i-gate-input"
        />
        <button type="submit" className="l5i-gate-button" disabled={busy || !code.trim()}>
          {busy ? 'Checking…' : 'Continue'}
        </button>
        <p className="l5i-gate-msg" role="status" aria-live="polite">
          {msg ?? ''}
        </p>
      </form>
    </div>
  );
}
