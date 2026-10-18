// app/events/check/page.tsx — where an attendee's QR code opens. See
// components/events/CheckScan.tsx: scanning identifies; staff confirm.

import type { Metadata } from 'next';
import { NOINDEX } from '@/lib/seo';
import { CheckScan } from '@/components/events/CheckScan';
import '../../app-shell.css';
import '../events.css';

export const metadata: Metadata = { ...NOINDEX, title: 'Event check-in', referrer: 'no-referrer' };

export default function Page() {
  return (
    <div className="app-root">
      <main className="ev-page">
        <div className="ev-wrap" style={{ width: 'min(480px,100%)' }}>
          <CheckScan />
        </div>
      </main>
    </div>
  );
}
