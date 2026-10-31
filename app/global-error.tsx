'use client';
// app/global-error.tsx — the last net, for an exception in the root layout
// itself, where app/error.tsx cannot reach: it replaces the whole document,
// so it brings its own <html> and <body> and nothing it can fail to load.
// The brand book's paper, ink and moss, inline; the same honest words as
// app/error.tsx; and one way back that cannot depend on the app working.
import { useEffect } from 'react';

const paper = '#F5F3EB';
const ink = '#23241F';
const moss = '#354620';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[socria] the app stopped:', error);
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, background: paper, color: ink, fontFamily: 'Georgia, "Times New Roman", serif' }}>
        <main role="alert" style={{ minHeight: '100svh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
          <div style={{ width: 'min(560px, 100%)', display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ margin: 0, fontFamily: 'system-ui, sans-serif', fontSize: 12, letterSpacing: '.12em', textTransform: 'uppercase', color: 'rgba(35,36,31,.7)' }}>
              Something broke
            </p>
            <h1 style={{ margin: 0, fontWeight: 400, fontSize: 'clamp(1.9rem, 4.4vw, 2.9rem)', lineHeight: 1.06, letterSpacing: '-.02em' }}>
              Socria stopped working. <em style={{ color: moss }}>What was saved is still there.</em>
            </h1>
            <p style={{ margin: 0, fontStyle: 'italic', fontSize: '1.2rem', lineHeight: 1.4 }}>
              A conversation is saved as each reply arrives. Anything you were still typing, or a reply still on its way, may need saying again.
            </p>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => reset()}
                style={{ font: 'inherit', fontSize: '1.05rem', padding: '10px 20px', borderRadius: 999, border: `1px solid ${moss}`, background: moss, color: paper, cursor: 'pointer' }}
              >
                Try again
              </button>
              <a href="/" style={{ fontSize: '1.05rem', padding: '10px 20px', borderRadius: 999, border: `1px solid rgba(35,36,31,.2)`, color: ink, textDecoration: 'none' }}>
                Back to the start
              </a>
            </div>
            {error.digest ? (
              <p style={{ margin: 0, fontFamily: 'system-ui, sans-serif', fontSize: 13, color: 'rgba(35,36,31,.7)' }}>
                If it keeps happening, email hellosocria@gmail.com with this reference: <code>{error.digest}</code>
              </p>
            ) : null}
          </div>
        </main>
      </body>
    </html>
  );
}
