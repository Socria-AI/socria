// app/api/first-touch/route.ts — may this browser keep its first-touch note?
//
// GET → { remember: boolean }. Asked once per page load, and only until the
// note exists (components/FirstTouch.tsx); the answer is the visitor's
// country against the opt-in list (lib/newsletter-consent.ts). Nothing is
// received and nothing is stored here — the question is all there is.

import type { NextRequest } from 'next/server';
import { attributionAllowed } from '@/lib/newsletter-consent';

export const runtime = 'edge';

export function GET(req: NextRequest) {
  const remember = attributionAllowed(req.headers.get('x-vercel-ip-country'));
  return Response.json(
    { remember },
    // The browser may keep the answer for a day, so a visitor who never gets
    // a note (one in the EU, say) is not asked again on every page.
    { headers: { 'Cache-Control': 'private, max-age=86400' } }
  );
}
