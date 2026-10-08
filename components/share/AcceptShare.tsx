'use client';
// components/share/AcceptShare.tsx
//
// Opening a share link, or an emailed invitation: join, then land where it
// leads. Signed out, it goes to sign in and comes straight back here — the
// link is the whole instruction, and nothing should be lost on the way.

import { useEffect, useState } from 'react';

export function AcceptShare({ token, kind }: { token: string; kind: 'link' | 'invite' }) {
  const [msg, setMsg] = useState('Opening…');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const res = await fetch('/api/share/accept', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(kind === 'link' ? { token } : { invite: token }),
        });
        const j = await res.json().catch(() => null);
        if (!live) return;
        if (res.status === 401) {
          const back = window.location.pathname;
          window.location.replace(`/sign-in?redirect_url=${encodeURIComponent(back)}`);
          return;
        }
        if (!res.ok) throw new Error(j?.error || 'That could not be opened.');
        window.location.replace(j.open);
      } catch (e) {
        if (!live) return;
        setFailed(true);
        setMsg(e instanceof Error ? e.message : 'That could not be opened.');
      }
    })();
    return () => {
      live = false;
    };
  }, [token, kind]);
  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', background: 'var(--paper)', color: 'var(--ink)', padding: 24 }}>
      <div style={{ maxWidth: 420, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 600, letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--moss-700)' }}>
          Socria
        </p>
        <h1 style={{ fontFamily: 'var(--serif)', fontWeight: 400, fontSize: '1.7rem', margin: '10px 0 0' }} role={failed ? 'alert' : 'status'}>
          {msg}
        </h1>
        {failed && (
          <p style={{ marginTop: 14 }}>
            <a href="/chat" style={{ color: 'var(--moss-700)' }}>Go to Socria</a>
          </p>
        )}
      </div>
    </main>
  );
}
