'use client';

// The interface that confirms access. Each provider says exactly what Socria
// will be able to read — and that it is read-only — before you connect. One
// click sends you to Google/Notion's own consent screen; you come back
// connected, and can disconnect any time.

import { useCallback, useEffect, useState } from 'react';

interface ProviderState {
  provider: 'google' | 'notion';
  label: string;
  configured: boolean;
  connected: boolean;
  account?: string;
  grants: string[];
}

interface ConnData {
  canConnect: boolean;
  signedIn: boolean;
  providers: ProviderState[];
}

const ICON: Record<string, JSX.Element> = {
  google: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="#4285F4" d="M22.5 12.2c0-.7-.1-1.4-.2-2H12v3.9h5.9a5 5 0 0 1-2.2 3.3v2.7h3.5c2-1.9 3.3-4.7 3.3-7.9Z" />
      <path fill="#34A853" d="M12 23c3 0 5.5-1 7.3-2.7l-3.5-2.7c-1 .7-2.3 1.1-3.8 1.1-2.9 0-5.3-2-6.2-4.6H2.2v2.8A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.8 14.1a6.6 6.6 0 0 1 0-4.2V7.1H2.2a11 11 0 0 0 0 9.8l3.6-2.8Z" />
      <path fill="#EA4335" d="M12 5.4c1.6 0 3 .6 4.2 1.6l3.1-3.1A11 11 0 0 0 2.2 7.1l3.6 2.8C6.7 7.3 9.1 5.4 12 5.4Z" />
    </svg>
  ),
  notion: (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path fill="currentColor" d="M4.5 3.9 15 3c1.3-.1 1.6 0 2.4.6l2.4 1.7c.5.4.7.5.7 1v13c0 .9-.3 1.4-1.4 1.5l-11.6.7c-.8 0-1.2-.1-1.6-.6l-2-2.6c-.4-.6-.6-1-.6-1.6V5.3c0-.7.3-1.3 1.2-1.4Z" />
      <path fill="var(--lg-paper)" d="M15 3 4.5 3.9c-.9.1-1.2.7-1.2 1.4v11.4c0 .6.2 1 .6 1.6l2 2.6c.4.5.8.6 1.6.6l11.6-.7c1.1-.1 1.4-.6 1.4-1.5v-13c0-.5-.2-.6-.7-1L17.4 3.6C16.6 3 16.3 2.9 15 3Zm-7.7 3c-.5 0-.6.3-.4.5l.9.7c.2.1.4.2.7.2l9.2-.6c.2 0 .4-.2.2-.4l-1-.8c-.2-.1-.4-.2-.8-.2L7.3 6Zm-.5 2.3v9.6c0 .5.3.7.8.6l9.6-.5c.5 0 .6-.3.6-.7V6.9c0-.4-.1-.6-.5-.6l-9.7.6c-.5 0-.8.2-.8.7Zm9.2.6c.1.2 0 .5-.2.5l-.5.1v6.8c-.4.2-.8.3-1.1.3-.5 0-.6-.2-1-.6l-2.9-4.6v4.4l1 .2s0 .5-.7.5l-1.9.1c-.1-.2 0-.5.2-.5l.5-.1V9.3l-.7-.1c-.1-.3.1-.6.5-.6l2-.1 3 4.6V9.2l-.8-.1c-.1-.3.1-.5.5-.6l1.9-.1Z" />
    </svg>
  ),
};

export function ConnectionsModal({
  open,
  authHeaders,
  onClose,
  onChanged,
}: {
  open: boolean;
  authHeaders: () => Record<string, string>;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<ConnData | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/logos/connections', { headers: authHeaders(), cache: 'no-store' });
      if (res.ok) setData(await res.json());
      else setData(null);
    } catch {
      setData(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (open) load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function disconnect(provider: string) {
    setBusy(provider);
    try {
      await fetch(`/api/logos/connections?provider=${provider}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      await load();
      onChanged?.();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="lgc-veil" role="dialog" aria-modal="true" aria-label="Connections">
      <div className="lgc">
        <header className="lgc-head">
          <span className="lgc-title">Connections</span>
          <button type="button" className="lg-x-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </header>

        <p className="lgc-lead">
          Connect a source once, and you can ground any node in your real
          material. Socria only ever <strong>reads</strong> — it can’t change
          or send anything.
        </p>

        {!data && <p className="lgc-note">Loading…</p>}

        {data && !data.signedIn && (
          <p className="lgc-note">
            Sign in to connect your own accounts. Until then, Web, Paste and
            Upload work without any setup.
          </p>
        )}

        {data?.providers.map((p) => (
          <div key={p.provider} className="lgc-prov">
            <span className="lgc-icon">{ICON[p.provider]}</span>
            <div className="lgc-body">
              <div className="lgc-row">
                <span className="lgc-name">{p.label}</span>
                {p.connected ? (
                  <span className="lgc-badge is-on">Connected</span>
                ) : (
                  <span className="lgc-badge">Not connected</span>
                )}
              </div>
              {p.connected && p.account && <span className="lgc-account">{p.account}</span>}
              <ul className="lgc-grants">
                {p.grants.map((g) => (
                  <li key={g}>
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M13 4.5 6.5 11 3 7.5" />
                    </svg>
                    {g}
                  </li>
                ))}
                <li className="lgc-ro">
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                    <rect x="3.5" y="7" width="9" height="6" rx="1.2" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" />
                  </svg>
                  Read-only — never write, send, or delete
                </li>
              </ul>

              {!p.configured ? (
                <p className="lgc-hint">
                  {p.label} sign-in isn’t set up on this deployment yet.
                </p>
              ) : p.connected ? (
                <button
                  type="button"
                  className="lgc-btn is-off"
                  disabled={busy === p.provider}
                  onClick={() => disconnect(p.provider)}
                >
                  {busy === p.provider ? 'Disconnecting…' : 'Disconnect'}
                </button>
              ) : data.canConnect ? (
                <a className="lgc-btn" href={`/api/logos/connect/${p.provider}`}>
                  Connect {p.label}
                </a>
              ) : (
                <button type="button" className="lgc-btn is-off" disabled>
                  Sign in to connect
                </button>
              )}
            </div>
          </div>
        ))}

        <p className="lgc-fine">
          You can disconnect at any time. Disconnecting removes Socria’s stored
          access; revoke it fully from your Google or Notion account settings.
        </p>
      </div>
    </div>
  );
}
